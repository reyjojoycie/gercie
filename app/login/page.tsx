// ---------------------------------------------------------------------------
// Page de connexion – Gestion complète avec redirection intelligente
// Règle métier : redirection vers /onboarding si non complété ou non vérifié
// ---------------------------------------------------------------------------
'use client'

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
} from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import {
  ArrowLeft,
  LogIn,
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

import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { loginSchema, AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'

type LoginForm = z.infer<typeof loginSchema>

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const FETCH_TIMEOUT = 20000
const MAX_RETRIES = 2
const REMEMBER_STORAGE_KEY = 'gercie_remember_me'
const LAST_EMAIL_STORAGE_KEY = 'last_login_email'

const ERROR_MESSAGES = {
  credentials: AUTH_ERROR_MESSAGES.invalid_credentials,
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  network: AUTH_ERROR_MESSAGES.network,
  server: AUTH_ERROR_MESSAGES.server,
  unknown: AUTH_ERROR_MESSAGES.server,
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */

function LoginContent() {
  const searchParams = useSearchParams()

  const [globalError, setGlobalError] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [networkQuality, setNetworkQuality] = useState<'good' | 'slow' | 'unknown'>('unknown')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  const retryCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const registered = searchParams.get('registered')

  /* ---------------------------------------------------------------- */
  /*  Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Restaurer les préférences locales
    try {
      const storedRemember = localStorage.getItem(REMEMBER_STORAGE_KEY)
      const shouldRemember = storedRemember !== 'false'

      setRememberMe(shouldRemember)

      if (shouldRemember) {
        const lastEmail = localStorage.getItem(LAST_EMAIL_STORAGE_KEY)
        if (lastEmail) {
          setValue('email', lastEmail)
        }
      }
    } catch {
      // Ignorer
    }

    // Détection qualité réseau
    const connection = (navigator as any).connection

    if (connection) {
      const effectiveType = connection.effectiveType

      if (effectiveType === '2g' || effectiveType === 'slow-2g') {
        setNetworkQuality('slow')
      } else if (effectiveType === '3g' || effectiveType === '4g') {
        setNetworkQuality('good')
      }
    }

    // Gestion online/offline
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

  /* ---------------------------------------------------------------- */
  /*  Fetch avec retry et timeout                                      */
  /* ---------------------------------------------------------------- */

  const fetchWithRetry = useCallback(
    async (
      url: string,
      options: RequestInit,
      retries = MAX_RETRIES
    ): Promise<Response> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        // Retry sur erreur serveur 5xx
        if (response.status >= 500 && retries > 0 && isMountedRef.current) {
          await delay(1000 * (MAX_RETRIES - retries + 1))
          return fetchWithRetry(url, options, retries - 1)
        }

        return response
      } catch (err: any) {
        clearTimeout(timeoutId)

        if (!isMountedRef.current) {
          throw err
        }

        // Retry sur erreur réseau ou timeout
        if (retries > 0 && (err.name === 'AbortError' || err.name === 'TypeError')) {
          retryCountRef.current += 1
          await delay(1000 * retryCountRef.current)
          return fetchWithRetry(url, options, retries - 1)
        }

        throw err
      }
    },
    []
  )

  /* ---------------------------------------------------------------- */
  /*  Mapping des erreurs d'authentification                           */
  /* ---------------------------------------------------------------- */

  const mapAuthError = useCallback((message?: string): string => {
    const msg = message || ''

    if (/invalid login credentials|invalid credentials/i.test(msg)) {
      return ERROR_MESSAGES.credentials
    }

    if (/email not confirmed/i.test(msg)) {
      return AUTH_ERROR_MESSAGES.email_not_verified
    }

    if (/phone not confirmed/i.test(msg)) {
      return AUTH_ERROR_MESSAGES.phone_not_verified
    }

    if (/banned|suspended/i.test(msg)) {
      return AUTH_ERROR_MESSAGES.account_banned
    }

    if (/too many|rate limit/i.test(msg)) {
      return AUTH_ERROR_MESSAGES.rate_limited
    }

    return ERROR_MESSAGES.credentials
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Soumission du formulaire                                         */
  /* ---------------------------------------------------------------- */

  const onSubmit = async (data: LoginForm) => {
    if (isSubmitting) return

    if (!isOnline) {
      setGlobalError(ERROR_MESSAGES.offline)
      return
    }

    setGlobalError('')
    setIsSubmitting(true)
    retryCountRef.current = 0

    try {
      /* ---------------------------------------------------------- */
      /* 1. Authentification côté navigateur                         */
      /*    C'est la source unique de vérité pour la session.        */
      /* ---------------------------------------------------------- */
      const { data: authData, error: authError } =
        await supabaseBrowser.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        })

      if (authError || !authData?.user || !authData?.session) {
        if (isMountedRef.current) {
          setGlobalError(mapAuthError(authError?.message))
        }
        return
      }

      /* ---------------------------------------------------------- */
      /* 2. Préférences locales : remember me + dernier email        */
      /* ---------------------------------------------------------- */
      try {
        localStorage.setItem(REMEMBER_STORAGE_KEY, String(rememberMe))

        if (rememberMe) {
          localStorage.setItem(LAST_EMAIL_STORAGE_KEY, data.email)
        } else {
          localStorage.removeItem(LAST_EMAIL_STORAGE_KEY)
        }
      } catch {
        // Ignorer
      }

      const accessToken = authData.session.access_token

      if (!accessToken) {
        // Pas de token → rediriger vers onboarding par sécurité
        window.location.href = '/onboarding'
        return
      }

      /* ---------------------------------------------------------- */
      /* 3. Appel API pour profil, sécurité et redirection           */
      /*    L'API vérifie :                                          */
      /*    - onboarding_completed = true                            */
      /*    - au moins un canal vérifié (email OU téléphone)         */
      /*    Si les deux sont vrais → redirect: '/'                   */
      /*    Sinon → redirect: '/onboarding'                          */
      /* ---------------------------------------------------------- */
      let redirect = '/onboarding' // Valeur par défaut sécurisée

      try {
        const res = await fetchWithRetry('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            remember_me: rememberMe,
          }),
        })

        let result: any = {}

        try {
          result = await res.json()
        } catch {
          // JSON invalide
        }

        if (!res.ok) {
          // Erreur → déconnecter et afficher message
          await supabaseBrowser.auth.signOut().catch(() => {})

          if (isMountedRef.current) {
            if (res.status === 401) {
              setGlobalError(AUTH_ERROR_MESSAGES.session_expired)
            } else if (res.status === 429) {
              setGlobalError(result.error || AUTH_ERROR_MESSAGES.rate_limited)
            } else if (res.status === 403) {
              setGlobalError(result.error || AUTH_ERROR_MESSAGES.account_banned)
            } else {
              setGlobalError(ERROR_MESSAGES.server)
            }
          }

          return
        }

        // Sécurité : accepter uniquement '/' ou '/onboarding'
        // Si l'API renvoie autre chose, on redirige vers onboarding par sécurité
        if (result.redirect === '/') {
          redirect = '/'
        } else {
          redirect = '/onboarding'
        }
      } catch {
        // Erreur réseau → déconnecter et afficher message
        await supabaseBrowser.auth.signOut().catch(() => {})

        if (isMountedRef.current) {
          if (!navigator.onLine) {
            setGlobalError(ERROR_MESSAGES.offline)
          } else {
            setGlobalError(ERROR_MESSAGES.network)
          }
        }

        return
      }

      /* ---------------------------------------------------------- */
      /* 4. Redirection finale                                       */
      /*    Utiliser window.location.href pour forcer un rechargement*/
      /*    complet et appliquer les guards middleware               */
      /* ---------------------------------------------------------- */
      window.location.href = redirect
    } catch (err: any) {
      if (isMountedRef.current) {
        if (err?.name === 'AbortError') {
          setGlobalError('La connexion prend trop de temps. Réessayez.')
        } else if (err?.name === 'TypeError' || !navigator.onLine) {
          setGlobalError(ERROR_MESSAGES.network)
        } else {
          setGlobalError(ERROR_MESSAGES.unknown)
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false)
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu                                                            */
  /* ---------------------------------------------------------------- */

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
                <LogIn
                  size={28}
                  className="text-gold-600 dark:text-gold-400"
                  aria-hidden="true"
                />
              </div>

              <CardTitle className="text-2xl font-serif text-neutral-900 dark:text-neutral-100">
                Connexion
              </CardTitle>

              <CardDescription className="text-neutral-500 dark:text-neutral-400">
                Connectez-vous à votre compte Gercie
              </CardDescription>

              {networkQuality === 'slow' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center justify-center gap-1">
                  <WifiOff size={12} aria-hidden="true" />
                  Connexion lente détectée
                </p>
              )}
            </CardHeader>

            <CardContent>
              {registered && (
                <div
                  role="status"
                  className="bg-gold-50 dark:bg-gold-900/20 border border-gold-200 dark:border-gold-800 text-gold-700 dark:text-gold-300 p-4 mb-6 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
                >
                  <CheckCircle2
                    size={18}
                    className="text-gold-500 flex-shrink-0"
                    aria-hidden="true"
                  />
                  Inscription réussie ! Connectez-vous.
                </div>
              )}

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
                <Input
                  id="email"
                  variant="glass"
                  label="Email"
                  type="email"
                  {...register('email')}
                  error={errors.email?.message}
                  placeholder="votre@email.com"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  enterKeyHint="next"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />

                <Input
                  id="password"
                  variant="glass"
                  label="Mot de passe"
                  type="password"
                  {...register('password')}
                  error={errors.password?.message}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  enterKeyHint="go"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                />

                <div className="flex items-center justify-between gap-4">
                  <label
                    htmlFor="remember_me"
                    className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 select-none"
                  >
                    <input
                      id="remember_me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300 text-gold-600 focus:ring-gold-500 dark:border-neutral-600 dark:bg-midnight-800"
                    />
                    Se souvenir de moi
                  </label>

                  <Link
                    href="/auth/reset-password"
                    className="text-sm text-gold-600 dark:text-gold-400 hover:underline focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 rounded"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>

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
                      <Loader2
                        size={18}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                      Connexion...
                    </span>
                  ) : (
                    'Se connecter'
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
                Pas encore de compte ?{' '}
                <Link
                  href="/register"
                  className="text-gold-600 dark:text-gold-400 font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 rounded"
                >
                  Créer un compte
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

/* ------------------------------------------------------------------ */
/*  Export avec Suspense                                               */
/* ------------------------------------------------------------------ */

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}