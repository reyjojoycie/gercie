// app/register/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  UserPlus,
  Phone,
  AlertCircle,
  CheckCircle2,
  WifiOff,
  Loader2,
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { OAuthButtons } from '@/components/auth/OAuthButtons'

import {
  nameSchema,
  emailSchema,
  registerPasswordSchema,
  PHONE_REGEX,
} from '@/lib/validators/auth'

/* ------------------------------------------------------------------ */
/*  Helpers téléphone locaux (robustes)                                */
/* ------------------------------------------------------------------ */

function normalizePhoneLocal(phone: string): string {
  if (!phone) return ''

  let cleaned = phone.replace(/[^\d+]/g, '')

  if (!cleaned) return ''

  if (cleaned.startsWith('00243')) {
    cleaned = '+243' + cleaned.slice(5)
  } else if (cleaned.startsWith('243') && !cleaned.startsWith('+243')) {
    cleaned = '+243' + cleaned.slice(3)
  } else if (cleaned.startsWith('0') && !cleaned.startsWith('00')) {
    cleaned = '+243' + cleaned.slice(1)
  }

  if (cleaned.startsWith('+2430')) {
    cleaned = '+243' + cleaned.slice(5)
  }

  return cleaned
}

function isValidPhoneLocal(phone: string): boolean {
  if (!phone) return false
  return PHONE_REGEX.test(normalizePhoneLocal(phone))
}

/* ------------------------------------------------------------------ */
/*  Schéma de validation                                               */
/* ------------------------------------------------------------------ */

const phoneFieldSchema = z
  .string({ required_error: 'Téléphone requis' })
  .min(1, 'Téléphone requis')
  .refine(
    (val) => isValidPhoneLocal(val),
    'Numéro invalide (ex: 0812345678 ou +243812345678)'
  )
  .transform((val) => normalizePhoneLocal(val))

const registerSchema = z
  .object({
    nom: nameSchema,
    prenom: nameSchema,
    email: emailSchema,
    telephone: phoneFieldSchema,
    password: registerPasswordSchema,
    confirmPassword: z.string(),
    type_user: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

type RegisterForm = z.infer<typeof registerSchema>

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const FETCH_TIMEOUT = 25000
const MAX_RETRIES = 2
const REDIRECT_DELAY = 2000
const STORAGE_KEY = 'register_draft'

const ERROR_MESSAGES = {
  network: 'Connexion instable. Vérifiez votre réseau et réessayez.',
  timeout: 'La connexion prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible. Réessayez dans quelques instants.',
  email_exists: 'Un compte existe déjà avec cet email.',
  phone_exists: 'Un compte existe déjà avec ce numéro.',
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  json_parse: 'Erreur de communication avec le serveur. Réessayez.',
  unknown: 'Une erreur est survenue. Veuillez réessayer.',
}

/* ------------------------------------------------------------------ */
/*  Force du mot de passe (visuel simple)                              */
/* ------------------------------------------------------------------ */

function calculatePasswordStrength(password: string): {
  score: number
  label: string
  color: string
} {
  if (!password) return { score: 0, label: '', color: '' }

  const length = password.length

  if (length < 4) return { score: 0, label: '', color: '' }
  if (length < 8) return { score: 1, label: 'Court', color: 'bg-amber-500' }
  if (length < 12) return { score: 2, label: 'Bon', color: 'bg-green-500' }

  return { score: 3, label: 'Excellent', color: 'bg-emerald-500' }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function RegisterPage() {
  const router = useRouter()

  const [globalError, setGlobalError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [networkQuality, setNetworkQuality] = useState<'good' | 'slow' | 'unknown'>('unknown')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const retryCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError: setFormFieldError,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
  })

  const watchedPassword = watch('password')

  const passwordStrength = useMemo(
    () => calculatePasswordStrength(watchedPassword || ''),
    [watchedPassword]
  )

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const connection = (navigator as any).connection

    if (connection) {
      const effectiveType = connection.effectiveType

      if (effectiveType === '2g' || effectiveType === 'slow-2g') {
        setNetworkQuality('slow')
      } else if (effectiveType === '3g' || effectiveType === '4g') {
        setNetworkQuality('good')
      }
    }

    try {
      const draft = localStorage.getItem(STORAGE_KEY)

      if (draft) {
        const parsed = JSON.parse(draft)

        if (parsed.nom) setValue('nom', parsed.nom)
        if (parsed.prenom) setValue('prenom', parsed.prenom)
        if (parsed.email) setValue('email', parsed.email)
        if (parsed.telephone) setValue('telephone', parsed.telephone)
      }
    } catch {
      // Ignorer
    }

    const handleOnline = () => setIsOnline(true)

    const handleOffline = () => {
      setIsOnline(false)
      if (isMountedRef.current) setGlobalError(ERROR_MESSAGES.offline)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setValue])

  useEffect(() => {
    const subscription = watch((value, { name }) => {
      if (name && ['nom', 'prenom', 'email', 'telephone'].includes(name)) {
        try {
          const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
          draft[name] = value[name as keyof RegisterForm]
          localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
        } catch {
          // Ignorer
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [watch])

  const fetchWithRetry = useCallback(
    async (
      url: string,
      options: RequestInit,
      retries = MAX_RETRIES
    ): Promise<Response> => {
      if (abortControllerRef.current) abortControllerRef.current.abort()

      const controller = new AbortController()
      abortControllerRef.current = controller

      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.status >= 500 && retries > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (MAX_RETRIES - retries + 1))
          )

          return fetchWithRetry(url, options, retries - 1)
        }

        return response
      } catch (err: any) {
        clearTimeout(timeoutId)

        if (!isMountedRef.current) {
          throw err
        }

        if (retries > 0 && (err.name === 'AbortError' || err.name === 'TypeError')) {
          retryCountRef.current += 1

          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCountRef.current)
          )

          return fetchWithRetry(url, options, retries - 1)
        }

        throw err
      }
    },
    []
  )

  const onSubmit = async (data: RegisterForm) => {
    if (isSubmitting) return

    if (!isOnline) {
      setGlobalError(ERROR_MESSAGES.offline)
      return
    }

    setGlobalError('')
    setSuccessMessage('')
    setIsSubmitting(true)
    retryCountRef.current = 0

    try {
      const normalizedData = {
        ...data,
        telephone: normalizePhoneLocal(data.telephone || ''),
        type_user: 'acheteur',
      }

      const res = await fetchWithRetry('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedData),
      })

      let result: any

      try {
        result = await res.json()
      } catch {
        if (isMountedRef.current) setGlobalError(ERROR_MESSAGES.json_parse)
        return
      }

      if (!res.ok) {
        if (isMountedRef.current) {
          const serverFields: Array<keyof RegisterForm> = [
            'nom',
            'prenom',
            'email',
            'telephone',
            'password',
            'confirmPassword',
          ]

          if (result.errors && typeof result.errors === 'object') {
            let hasFieldError = false

            for (const [field, message] of Object.entries(result.errors)) {
              if (serverFields.includes(field as keyof RegisterForm)) {
                setFormFieldError(field as keyof RegisterForm, {
                  type: 'server',
                  message: String(message),
                })

                hasFieldError = true
              }
            }

            if (!hasFieldError) {
              setGlobalError(result.error || ERROR_MESSAGES.unknown)
            }
          } else if (result.error) {
            if (
              result.error.includes('email') ||
              result.error.includes('User already registered')
            ) {
              setGlobalError(ERROR_MESSAGES.email_exists)
            } else if (
              result.error.includes('phone') ||
              result.error.includes('téléphone')
            ) {
              setGlobalError(ERROR_MESSAGES.phone_exists)
            } else if (res.status >= 500) {
              setGlobalError(ERROR_MESSAGES.server)
            } else {
              setGlobalError(result.error || ERROR_MESSAGES.unknown)
            }
          } else {
            setGlobalError(ERROR_MESSAGES.unknown)
          }
        }
      } else {
        localStorage.removeItem(STORAGE_KEY)

        if (isMountedRef.current) {
          setSuccessMessage('Compte créé avec succès ! Redirection...')

          setTimeout(() => {
            if (isMountedRef.current) {
              router.push('/login?registered=true')
            }
          }, REDIRECT_DELAY)
        }
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        if (err.name === 'AbortError') {
          setGlobalError(ERROR_MESSAGES.timeout)
        } else if (err.name === 'TypeError' || !navigator.onLine) {
          setGlobalError(ERROR_MESSAGES.network)
        } else {
          setGlobalError(ERROR_MESSAGES.unknown)
        }
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12">
      <Container size="small" className="max-w-md w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 mb-8 text-sm transition-colors"
          aria-label="Retour à l'accueil"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Retour à l&apos;accueil
        </Link>

        <div className="animate-fade-in">
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
                <UserPlus
                  size={28}
                  className="text-gold-600 dark:text-gold-400"
                  aria-hidden="true"
                />
              </div>

              <CardTitle className="text-2xl font-serif text-neutral-900 dark:text-neutral-100">
                Inscription
              </CardTitle>

              <CardDescription className="text-neutral-500 dark:text-neutral-400">
                Créez votre compte Gercie
              </CardDescription>

              {networkQuality === 'slow' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center justify-center gap-1">
                  <WifiOff size={12} aria-hidden="true" />
                  Connexion lente détectée
                </p>
              )}
            </CardHeader>

            <CardContent>
              {globalError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 mb-6 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
                >
                  <AlertCircle
                    size={18}
                    className="text-red-500 flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{globalError}</span>
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  aria-live="polite"
                  className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 p-4 mb-6 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
                >
                  <CheckCircle2
                    size={18}
                    className="text-green-500 flex-shrink-0"
                    aria-hidden="true"
                  />
                  {successMessage}
                </div>
              )}

              {!isOnline && (
                <div
                  role="alert"
                  className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 p-3 mb-6 rounded-xl text-sm flex items-center gap-2"
                >
                  <WifiOff size={16} className="flex-shrink-0" aria-hidden="true" />
                  Vous êtes hors ligne. Les données saisies sont conservées.
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSubmit(onSubmit)(e)
                }}
                className="space-y-5"
                noValidate
                aria-busy={isSubmitting}
              >
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    id="nom"
                    variant="glass"
                    label="Nom"
                    {...register('nom')}
                    error={errors.nom?.message}
                    placeholder="Votre nom"
                    autoComplete="family-name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    aria-invalid={errors.nom ? true : undefined}
                    aria-describedby={errors.nom ? 'nom-error' : undefined}
                  />

                  <Input
                    id="prenom"
                    variant="glass"
                    label="Prénom"
                    {...register('prenom')}
                    error={errors.prenom?.message}
                    placeholder="Votre prénom"
                    autoComplete="given-name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    aria-invalid={errors.prenom ? true : undefined}
                    aria-describedby={errors.prenom ? 'prenom-error' : undefined}
                  />
                </div>

                <Input
                  id="email"
                  variant="glass"
                  label="Email"
                  type="email"
                  {...register('email')}
                  error={errors.email?.message}
                  placeholder="votre@email.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  enterKeyHint="next"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />

                <Input
                  id="telephone"
                  variant="glass"
                  label="Téléphone"
                  type="tel"
                  {...register('telephone')}
                  error={errors.telephone?.message}
                  placeholder="0812345678"
                  autoComplete="tel"
                  enterKeyHint="next"
                  leftIcon={<Phone size={16} className="text-neutral-400" aria-hidden="true" />}
                  aria-invalid={errors.telephone ? true : undefined}
                  aria-describedby={
                    errors.telephone ? 'telephone-error' : 'telephone-hint'
                  }
                />

                {!errors.telephone && (
                  <p
                    id="telephone-hint"
                    className="text-xs text-neutral-500 dark:text-neutral-400 -mt-3"
                  >
                    Formats acceptés : 081..., 097..., +243...
                  </p>
                )}

                <div className="space-y-2">
                  <Input
                    id="password"
                    variant="glass"
                    label="Mot de passe"
                    type="password"
                    {...register('password')}
                    error={errors.password?.message}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    enterKeyHint="next"
                    aria-invalid={errors.password ? true : undefined}
                    aria-describedby={
                      errors.password
                        ? 'password-error'
                        : watchedPassword
                          ? 'password-strength'
                          : undefined
                    }
                  />

                  {watchedPassword && (
                    <div id="password-strength" className="space-y-1" aria-live="polite">
                      <div className="flex gap-1">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i <= passwordStrength.score
                                ? passwordStrength.color
                                : 'bg-neutral-200 dark:bg-neutral-700'
                            }`}
                          />
                        ))}
                      </div>

                      {passwordStrength.label && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Force : {passwordStrength.label}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <Input
                  id="confirmPassword"
                  variant="glass"
                  label="Confirmer le mot de passe"
                  type="password"
                  {...register('confirmPassword')}
                  error={errors.confirmPassword?.message}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  enterKeyHint="go"
                  aria-invalid={errors.confirmPassword ? true : undefined}
                  aria-describedby={
                    errors.confirmPassword ? 'confirmPassword-error' : undefined
                  }
                />

                <Button
                  type="submit"
                  variant="luxe"
                  fullWidth
                  size="lg"
                  loading={isSubmitting}
                  disabled={isSubmitting || !isOnline}
                  className="shadow-gold hover:shadow-glow-gold transition-shadow"
                  aria-busy={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                      Inscription...
                    </span>
                  ) : (
                    'Créer mon compte'
                  )}
                </Button>
              </form>

              <div className="mt-6 space-y-4">
                <div className="relative" role="separator">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
                  </div>

                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-midnight-900 px-2 text-neutral-400 dark:text-neutral-500">
                      Ou continuer avec
                    </span>
                  </div>
                </div>

                <OAuthButtons
                  providers={['google', 'facebook', 'apple']}
                  disabled={isSubmitting || !isOnline}
                />
              </div>

              <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Déjà un compte ?{' '}
                <Link
                  href="/login"
                  className="text-gold-600 dark:text-gold-400 font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 rounded"
                >
                  Se connecter
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </Container>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }

        .animate-slide-down {
          animation: slideDown 0.3s ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in,
          .animate-slide-down {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}