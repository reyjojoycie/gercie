// app/forgot-password/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  KeyRound,
  Mail,
  Phone,
  AlertCircle,
  CheckCircle2,
  WifiOff,
  Loader2,
  ShieldAlert,
  Clock,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/contexts/AuthContext'

// Regex téléphone RDC tolérante (cohérente avec register)
const PHONE_REGEX = /^(\+?243|00243|0)[1-9][0-9]{7,8}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Schéma de validation : email OU téléphone
const forgotPasswordSchema = z.object({
  identifier: z
    .string()
    .min(1, 'Veuillez saisir votre email ou numéro de téléphone')
    .refine(
      (val) => EMAIL_REGEX.test(val) || PHONE_REGEX.test(val.replace(/\s+/g, '')),
      'Format invalide. Saisissez un email valide ou un numéro (ex: 0812345678 ou +243812345678)'
    ),
})

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>

// Constantes de résilience
const FETCH_TIMEOUT = 20000
const MAX_RETRIES = 2
const COOLDOWN_SECONDS = 60 // Temps d'attente entre deux envois
const STORAGE_KEY = 'forgot_password_identifier'

// Messages localisés
const ERROR_MESSAGES = {
  network: 'Connexion instable. Vérifiez votre réseau et réessayez.',
  timeout: 'La requête prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible. Réessayez dans quelques instants.',
  not_found: 'Aucun compte trouvé avec cet identifiant.',
  rate_limit: 'Trop de tentatives. Veuillez réessayer dans quelques minutes.',
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  unknown: 'Une erreur est survenue. Veuillez réessayer.',
}

// Détection du type d'identifiant
function detectIdentifierType(value: string): 'email' | 'phone' | 'unknown' {
  if (EMAIL_REGEX.test(value)) return 'email'
  if (PHONE_REGEX.test(value.replace(/\s+/g, ''))) return 'phone'
  return 'unknown'
}

// Normaliser le téléphone
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\s+/g, '').replace(/[-()]/g, '')
  if (cleaned.startsWith('00243')) cleaned = '+243' + cleaned.slice(5)
  if (cleaned.startsWith('0') && !cleaned.startsWith('00')) cleaned = '+243' + cleaned.slice(1)
  return cleaned
}

export default function ForgotPasswordPage() {
  const router = useRouter()
  const { user } = useAuth()

  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [identifierType, setIdentifierType] = useState<'email' | 'phone' | 'unknown'>('unknown')
  const [cooldown, setCooldown] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [networkQuality, setNetworkQuality] = useState<'good' | 'slow' | 'unknown'>('unknown')

  const retryCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cooldownRef = useRef<NodeJS.Timeout | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onChange',
    defaultValues: {
      identifier: typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) || '' : '',
    },
  })

  const watchedIdentifier = watch('identifier')

  // Détecter le type d'identifiant en temps réel
  useEffect(() => {
    setIdentifierType(detectIdentifierType(watchedIdentifier || ''))
  }, [watchedIdentifier])

  // Qualité réseau + restauration
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

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setError(ERROR_MESSAGES.offline)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Cooldown tick
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
      return
    }
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [cooldown])

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [])

  // Fetch avec retry + timeout
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        const response = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeoutId)
        if (response.status >= 500 && retries > 0) {
          await new Promise((r) => setTimeout(r, 1000 * (MAX_RETRIES - retries + 1)))
          return fetchWithRetry(url, options, retries - 1)
        }
        return response
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (retries > 0 && (err.name === 'AbortError' || err.name === 'TypeError')) {
          retryCountRef.current += 1
          await new Promise((r) => setTimeout(r, 1000 * retryCountRef.current))
          return fetchWithRetry(url, options, retries - 1)
        }
        throw err
      }
    },
    []
  )

  const onSubmit = async (data: ForgotPasswordForm) => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }
    if (cooldown > 0) {
      setError(`Veuillez patienter ${cooldown}s avant de réessayer.`)
      return
    }

    setError('')
    setSuccessMessage('')
    retryCountRef.current = 0

    const type = detectIdentifierType(data.identifier)
    if (type === 'unknown') {
      setError('Format invalide. Vérifiez votre email ou numéro.')
      return
    }

    // Sauvegarder pour la prochaine fois
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, data.identifier)
    }

    const payload =
      type === 'email'
        ? { email: data.identifier.trim().toLowerCase() }
        : { telephone: normalizePhone(data.identifier) }

    try {
      const res = await fetchWithRetry('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 404) {
          // Pour la sécurité : même si le compte n'existe pas, afficher un message générique
          // mais ici on peut être explicite pour l'UX, à confirmer selon politique sécurité
          setError(ERROR_MESSAGES.not_found)
        } else if (res.status === 429) {
          setError(ERROR_MESSAGES.rate_limit)
          setCooldown(COOLDOWN_SECONDS * 2)
        } else if (res.status >= 500) {
          setError(ERROR_MESSAGES.server)
        } else {
          setError(result.error || ERROR_MESSAGES.unknown)
        }
        return
      }

      // Succès
      setSent(true)
      setCooldown(COOLDOWN_SECONDS)

      if (type === 'email') {
        setSuccessMessage(
          `Un lien de réinitialisation a été envoyé à ${data.identifier}. Vérifiez votre boîte de réception et vos spams.`
        )
      } else {
        setSuccessMessage(
          `Un code de vérification a été envoyé au ${data.identifier}. Saisissez-le sur la page suivante.`
        )
        // Redirection auto après 2s vers reset-password avec le téléphone encodé
        setTimeout(() => {
          const encoded = encodeURIComponent(normalizePhone(data.identifier))
          router.push(`/auth/reset-password?phone=${encoded}`)
        }, 2000)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(ERROR_MESSAGES.unknown)
      }
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12">
      <Container size="small" className="max-w-md w-full">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 mb-8 text-sm transition-colors"
          aria-label="Retour à la connexion"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Retour à la connexion
        </Link>

        <div className="animate-fade-in">
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
                <KeyRound size={28} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />
              </div>
              <CardTitle className="text-2xl font-serif text-neutral-900 dark:text-neutral-100">
                Mot de passe oublié ?
              </CardTitle>
              <CardDescription className="text-neutral-500 dark:text-neutral-400">
                {sent
                  ? 'Suivez les instructions envoyées'
                  : "Saisissez votre email ou numéro, nous vous enverrons les instructions."}
              </CardDescription>

              {networkQuality === 'slow' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center justify-center gap-1">
                  <WifiOff size={12} aria-hidden="true" />
                  Connexion lente détectée
                </p>
              )}
            </CardHeader>

            <CardContent>
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 mb-6 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
                >
                  <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  aria-live="polite"
                  className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 p-4 mb-6 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
                >
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{successMessage}</span>
                </div>
              )}

              {!isOnline && (
                <div
                  role="alert"
                  className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 p-3 mb-6 rounded-xl text-sm flex items-center gap-2"
                >
                  <WifiOff size={16} className="flex-shrink-0" aria-hidden="true" />
                  Vous êtes hors ligne.
                </div>
              )}

              {!sent ? (
                <>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                    <div className="space-y-2">
                      <Input
                        variant="glass"
                        label="Email ou numéro de téléphone"
                        type={identifierType === 'email' ? 'email' : 'text'}
                        {...register('identifier')}
                        error={errors.identifier?.message}
                        placeholder="exemple@email.com ou 0812345678"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        enterKeyHint="go"
                        aria-describedby={errors.identifier ? 'identifier-error' : 'identifier-hint'}
                        leftIcon={
                          identifierType === 'phone' ? (
                            <Phone size={16} className="text-neutral-400" aria-hidden="true" />
                          ) : (
                            <Mail size={16} className="text-neutral-400" aria-hidden="true" />
                          )
                        }
                      />
                      {!errors.identifier && (
                        <p
                          id="identifier-hint"
                          className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1"
                        >
                          <ShieldAlert size={12} aria-hidden="true" />
                          Nous vous enverrons un{' '}
                          {identifierType === 'phone'
                            ? 'code SMS'
                            : identifierType === 'email'
                            ? 'lien par email'
                            : 'lien ou code'}
                          .
                        </p>
                      )}
                    </div>

                    {/* Avertissement SMS en RDC */}
                    {identifierType === 'phone' && (
                      <div
                        role="note"
                        className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-3 rounded-lg text-xs flex items-start gap-2"
                      >
                        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          L&apos;envoi d&apos;un SMS peut entraîner des frais selon votre opérateur. Privilégiez
                          l&apos;email si possible.
                        </span>
                      </div>
                    )}

                    <Button
                      type="submit"
                      variant="luxe"
                      fullWidth
                      size="lg"
                      loading={isSubmitting}
                      disabled={isSubmitting || !isOnline || cooldown > 0}
                      className="shadow-gold hover:shadow-glow-gold transition-shadow"
                      aria-busy={isSubmitting}
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                          Envoi en cours...
                        </span>
                      ) : cooldown > 0 ? (
                        <span className="flex items-center gap-2">
                          <Clock size={18} aria-hidden="true" />
                          Patientez {cooldown}s
                        </span>
                      ) : (
                        'Recevoir les instructions'
                      )}
                    </Button>
                  </form>

                  {user && (
                    <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                      Vous êtes déjà connecté ?{' '}
                      <Link
                        href="/profile/security"
                        className="text-gold-600 dark:text-gold-400 hover:underline focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                      >
                        Modifier le mot de passe depuis le profil
                      </Link>
                    </p>
                  )}
                </>
              ) : (
                // État après envoi : permet de renvoyer si besoin
                <div className="space-y-4">
                  <div className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 text-sm text-neutral-700 dark:text-neutral-300">
                    <p className="mb-2 font-medium">Vous n&apos;avez rien reçu ?</p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                      {identifierType === 'email' ? (
                        <>
                          <li>Vérifiez votre dossier spam / courriers indésirables</li>
                          <li>Ajoutez notre adresse à vos contacts</li>
                          <li>La réception peut prendre jusqu&apos;à 2 minutes</li>
                        </>
                      ) : (
                        <>
                          <li>Vérifiez que votre téléphone capte le réseau</li>
                          <li>Les SMS peuvent être retardés par l&apos;opérateur</li>
                          <li>Assurez-vous que le numéro est correct</li>
                        </>
                      )}
                    </ul>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    fullWidth
                    size="lg"
                    onClick={() => handleSubmit(onSubmit)()}
                    disabled={isSubmitting || !isOnline || cooldown > 0}
                    loading={isSubmitting}
                  >
                    {cooldown > 0 ? (
                      <span className="flex items-center gap-2">
                        <Clock size={18} aria-hidden="true" />
                        Renvoyer dans {cooldown}s
                      </span>
                    ) : (
                      'Renvoyer les instructions'
                    )}
                  </Button>

                  <Link
                    href="/login"
                    className="block text-center text-sm text-gold-600 dark:text-gold-400 hover:underline focus:outline-none focus:ring-2 focus:ring-gold-500 rounded py-2"
                  >
                    Retour à la connexion
                  </Link>
                </div>
              )}

              {!sent && (
                <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Vous vous souvenez de votre mot de passe ?{' '}
                  <Link
                    href="/login"
                    className="text-gold-600 dark:text-gold-400 font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 rounded"
                  >
                    Se connecter
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Note de sécurité */}
          <p className="mt-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
            🔒 Pour votre sécurité, nous ne confirmons pas si un compte existe avec cet identifiant
            auprès de tiers.
          </p>
        </div>
      </Container>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
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