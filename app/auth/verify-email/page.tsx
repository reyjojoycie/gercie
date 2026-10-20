// app/auth/verify-email/page.tsx
'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Mail,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Send,
  Clock,
  HelpCircle,
  Eye,
  Phone,
  WifiOff,
  Loader2,
  LinkIcon,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { VerificationCodeInput } from '@/components/auth/VerificationCodeInput'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Constantes de résilience                                           */
/* ------------------------------------------------------------------ */
const CODE_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes
const FETCH_TIMEOUT = 20000 // 20s pour réseaux lents
const MAX_RETRIES = 2
const RESEND_COOLDOWN_SECONDS = 60
const MAGIC_LINK_COOLDOWN_SECONDS = 60
const REDIRECT_DELAY = 1500

/* ------------------------------------------------------------------ */
/*  Messages localisés                                                 */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Vérifiez votre réseau et réessayez.',
  timeout: 'La requête prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible. Réessayez dans quelques instants.',
  expired: 'Le code a expiré. Demandez-en un nouveau.',
  invalid: 'Code incorrect. Vérifiez votre email et réessayez.',
  rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  no_email: 'Aucune adresse email associée à ce compte.',
  unknown: 'Une erreur est survenue. Veuillez réessayer.',
  magic_link_failed: "L'envoi du lien magique a échoué. Réessayez.",
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function maskEmail(email: string): string {
  if (!email) return ''
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  if (local.length <= 2) return local[0] + '***@' + domain
  return local[0] + '***' + local.slice(-1) + '@' + domain
}

function formatTimeLeft(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Normaliser le code saisi : garder uniquement les chiffres
function normalizeCode(code: string): string {
  return code.replace(/\D/g, '').slice(0, 6)
}

/* ------------------------------------------------------------------ */
/*  Fallback de chargement (Suspense)                                  */
/* ------------------------------------------------------------------ */
function VerifyEmailLoading() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4">
      <div className="flex items-center gap-2 text-neutral-400" role="status">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        Chargement...
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Composant principal (contenu)                                      */
/* ------------------------------------------------------------------ */
function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isOnboarded, refreshRoles } = useAuth()

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [verified, setVerified] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [magicLinkCooldown, setMagicLinkCooldown] = useState(0)
  const [showTips, setShowTips] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return sessionStorage.getItem('gercie_dev_code')
    } catch {
      return null
    }
  })
  const [email, setEmail] = useState('')
  const [loadingEmail, setLoadingEmail] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [networkQuality, setNetworkQuality] = useState<'good' | 'slow' | 'unknown'>('unknown')

  // Timer d'expiration
  const [expiresAt, setExpiresAt] = useState(Date.now() + CODE_EXPIRY_MS)
  const [timeLeft, setTimeLeft] = useState(CODE_EXPIRY_MS)

  const [code, setCode] = useState('')

  const retryCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const submitLockRef = useRef(false)

  // Rediriger si non connecté
  useEffect(() => {
    if (!user) {
      router.replace('/login?redirect=/auth/verify-email')
    }
  }, [user, router])

  // Qualité réseau
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

  // Récupération de l'email depuis le profil ou l'URL
  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(emailParam)
      setLoadingEmail(false)
      return
    }

    if (!user?.email) return

    // Essayer d'abord user.email (Supabase Auth)
    if (user.email) {
      setEmail(user.email)
      setLoadingEmail(false)
      return
    }

    // Fallback : API profil
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    const fetchEmail = async () => {
      try {
        const res = await fetch('/api/user/profile', { signal: controller.signal })
        if (cancelled) return

        const data = await res.json()
        const profileEmail = data?.email || data?.data?.email || ''
        setEmail(profileEmail)
      } catch (err: any) {
        if (cancelled) return
        if (err.name === 'AbortError') {
          setError(ERROR_MESSAGES.timeout)
        } else {
          console.error('Erreur chargement email:', err)
        }
      } finally {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setLoadingEmail(false)
        }
      }
    }
    fetchEmail()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [user, searchParams])

  // Cooldown renvoi code
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // Cooldown lien magique
  useEffect(() => {
    if (magicLinkCooldown <= 0) return
    const timer = setInterval(() => {
      setMagicLinkCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [magicLinkCooldown])

  // Timer expiration du code
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      const remaining = Math.max(0, expiresAt - now)
      setTimeLeft(remaining)
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  // Cleanup des requêtes en cours
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Vibration haptique (mobile)
  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern)
      } catch {
        // Ignorer silencieusement
      }
    }
  }, [])

  // Fetch avec retry + timeout
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

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

  const handleSubmit = useCallback(async (data: { code: string }) => {
    // Protection anti-double-submit
    if (submitLockRef.current || isSubmitting || verified) return
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    submitLockRef.current = true
    setError('')
    setSuccess('')
    setIsSubmitting(true)
    retryCountRef.current = 0

    const normalizedCode = normalizeCode(data.code)

    try {
      const res = await fetchWithRetry('/api/auth/verify-email/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalizedCode }),
      })

      const result = await res.json().catch(() => ({}))

      if (!res.ok) {
        vibrate([100, 50, 100]) // Vibration d'erreur

        if (res.status === 401 || result.error?.includes('incorrect')) {
          setError(ERROR_MESSAGES.invalid)
        } else if (res.status === 410 || result.error?.includes('expiré')) {
          setError(ERROR_MESSAGES.expired)
          setTimeLeft(0)
        } else if (res.status === 429) {
          setError(ERROR_MESSAGES.rate_limit)
          setResendCooldown(RESEND_COOLDOWN_SECONDS * 2)
        } else if (res.status >= 500) {
          setError(ERROR_MESSAGES.server)
        } else {
          setError(result.error || ERROR_MESSAGES.unknown)
        }
        return
      }

      // Succès
      vibrate([50, 50, 50, 50, 100]) // Vibration de succès
      setVerified(true)
      setSuccess('Email vérifié avec succès !')
      await refreshRoles()
      setTimeout(() => {
        const destination = isOnboarded ? '/' : '/onboarding'
        router.push(destination)
      }, REDIRECT_DELAY)
    } catch (err: any) {
      vibrate([100, 50, 100])
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.unknown)
      }
    } finally {
      setIsSubmitting(false)
      submitLockRef.current = false
    }
  }, [isSubmitting, verified, isOnline, fetchWithRetry, refreshRoles, isOnboarded, router, vibrate])

  // Soumission automatique quand les 6 chiffres sont saisis
  useEffect(() => {
    const normalized = normalizeCode(code)
    if (normalized.length === 6 && !isSubmitting && !verified && !submitLockRef.current) {
      const timer = setTimeout(() => {
        handleSubmit({ code: normalized })
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [code, isSubmitting, verified, handleSubmit])

  const handleResendCode = useCallback(async () => {
    if (resendCooldown > 0) return
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    setError('')
    setSuccess('')
    setDevCode(null)
    retryCountRef.current = 0

    try {
      const res = await fetchWithRetry('/api/auth/verify-email', { method: 'POST' })
      const result = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 429) {
          setError(ERROR_MESSAGES.rate_limit)
          setResendCooldown(RESEND_COOLDOWN_SECONDS * 2)
        } else if (res.status >= 500) {
          setError(ERROR_MESSAGES.server)
        } else {
          setError(result.error || ERROR_MESSAGES.unknown)
        }
        return
      }

      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setExpiresAt(Date.now() + CODE_EXPIRY_MS)
      setTimeLeft(CODE_EXPIRY_MS)
      setCode('')
      setSuccess('Nouveau code envoyé par email.')

      // DevCode uniquement en développement, vérifié côté serveur ET client
      if (
        process.env.NODE_ENV === 'development' &&
        typeof window !== 'undefined' &&
        window.location.hostname === 'localhost' &&
        result.devCode
      ) {
        setDevCode(result.devCode)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.unknown)
      }
    }
  }, [resendCooldown, isOnline, fetchWithRetry])

  const handleSendMagicLink = useCallback(async () => {
    if (magicLinkCooldown > 0) return
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    setError('')
    setSuccess('')
    retryCountRef.current = 0

    try {
      const res = await fetchWithRetry('/api/auth/verify-email/magic', { method: 'POST' })
      const result = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 429) {
          setError(ERROR_MESSAGES.rate_limit)
          setMagicLinkCooldown(MAGIC_LINK_COOLDOWN_SECONDS * 2)
        } else if (res.status >= 500) {
          setError(ERROR_MESSAGES.server)
        } else {
          setError(result.error || ERROR_MESSAGES.magic_link_failed)
        }
        return
      }

      setMagicLinkCooldown(MAGIC_LINK_COOLDOWN_SECONDS)
      setSuccess('Un lien de vérification a été envoyé. Cliquez dessus dans votre boîte email.')
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(ERROR_MESSAGES.magic_link_failed)
      }
    }
  }, [magicLinkCooldown, isOnline, fetchWithRetry])

  // Gestion du changement de code avec normalisation
  const handleCodeChange = useCallback((newCode: string) => {
    setCode(normalizeCode(newCode))
  }, [])

  const isExpired = timeLeft <= 0
  const maskedEmail = maskEmail(email)
  const progressPercent = Math.max(0, (timeLeft / CODE_EXPIRY_MS) * 100)

  if (!user) return null

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12">
      <Container size="small" className="max-w-md w-full">
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 mb-8 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
          aria-label="Retour à l'onboarding"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Retour à l&apos;onboarding
        </Link>

        <div className="animate-fade-in">
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
                <Mail size={28} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />
              </div>
              <CardTitle className="text-2xl font-serif text-neutral-900 dark:text-neutral-100">
                Vérification de l&apos;email
              </CardTitle>
              <CardDescription className="text-neutral-500 dark:text-neutral-400">
                {loadingEmail ? (
                  'Chargement...'
                ) : email ? (
                  <>
                    Un code à 6 chiffres a été envoyé à{' '}
                    <span className="font-mono font-medium text-neutral-700 dark:text-neutral-200">
                      {maskedEmail}
                    </span>
                    .<br />
                    Saisissez-le ci-dessous pour confirmer votre email.
                  </>
                ) : (
                  'Aucune adresse email associée à ce compte.'
                )}
              </CardDescription>

              {networkQuality === 'slow' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center justify-center gap-1">
                  <WifiOff size={12} aria-hidden="true" />
                  Connexion lente détectée
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {loadingEmail ? (
                <div className="space-y-3" role="status" aria-live="polite">
                  <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Chargement...
                  </div>
                  <div className="flex justify-center gap-2">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="h-12 w-10 rounded-lg bg-neutral-200 dark:bg-neutral-700 animate-pulse"
                      />
                    ))}
                  </div>
                </div>
              ) : !email ? (
                <div className="text-center space-y-3" role="alert">
                  <AlertCircle size={32} className="mx-auto text-amber-500" aria-hidden="true" />
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    Aucune adresse email enregistrée.
                  </p>
                  <Link href="/profile" className="inline-block">
                    <Button variant="outline" size="sm">
                      Ajouter un email
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  {/* Hors ligne */}
                  {!isOnline && (
                    <div
                      role="alert"
                      className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 p-3 rounded-xl text-sm flex items-center gap-2"
                    >
                      <WifiOff size={16} className="flex-shrink-0" aria-hidden="true" />
                      Vous êtes hors ligne.
                    </div>
                  )}

                  {/* Barre de progression de l'expiration */}
                  <div className="space-y-1" aria-live="polite" aria-atomic="true">
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Clock size={12} aria-hidden="true" />
                        {isExpired ? (
                          <span className="text-red-500 font-medium">Code expiré</span>
                        ) : (
                          <>Expire dans {formatTimeLeft(timeLeft)}</>
                        )}
                      </span>
                    </div>
                    <div
                      className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round(progressPercent)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Temps restant avant expiration du code"
                    >
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-1000 ease-linear',
                          isExpired
                            ? 'bg-red-500'
                            : progressPercent < 25
                            ? 'bg-amber-500'
                            : 'bg-gold-500'
                        )}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Messages d'erreur/succès */}
                  {error && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
                    >
                      <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}

                  {success && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 p-4 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
                    >
                      <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" aria-hidden="true" />
                      {success}
                    </div>
                  )}

                  {/* Code de développement (localhost uniquement) */}
                  {devCode && (
                    <div
                      role="note"
                      className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 p-3 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
                    >
                      <Eye size={16} className="flex-shrink-0" aria-hidden="true" />
                      <span>
                        Code de test (dev) : <strong className="font-mono">{devCode}</strong>
                      </span>
                    </div>
                  )}

                  {isExpired ? (
                    <div className="text-center space-y-3">
                      <AlertCircle size={32} className="mx-auto text-amber-500" aria-hidden="true" />
                      <p className="text-sm text-neutral-600 dark:text-neutral-300">Le code a expiré.</p>
                      <Button
                        variant="luxe"
                        fullWidth
                        onClick={handleResendCode}
                        loading={isSubmitting}
                        disabled={resendCooldown > 0 || !isOnline || isSubmitting}
                        aria-busy={isSubmitting}
                      >
                        {resendCooldown > 0 ? (
                          <span className="flex items-center gap-2">
                            <Clock size={18} aria-hidden="true" />
                            Renvoyer dans {resendCooldown}s
                          </span>
                        ) : isSubmitting ? (
                          <span className="flex items-center gap-2">
                            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                            Envoi...
                          </span>
                        ) : (
                          'Renvoyer le code'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <VerificationCodeInput
                        value={code}
                        onChange={handleCodeChange}
                        error={error ? 'Code incorrect' : undefined}
                        disabled={isSubmitting || verified}
                        autoFocus
                      />

                      {/* Option lien magique */}
                      <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-white dark:bg-midnight-950 px-2 text-neutral-400">
                            ou plus simple
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSendMagicLink}
                        disabled={magicLinkCooldown > 0 || !isOnline || isSubmitting}
                        className={cn(
                          'w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl',
                          'border border-neutral-200 dark:border-neutral-700',
                          'text-sm text-neutral-700 dark:text-neutral-300',
                          'hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                          'focus:outline-none focus:ring-2 focus:ring-gold-500'
                        )}
                      >
                        {magicLinkCooldown > 0 ? (
                          <>
                            <Clock size={16} aria-hidden="true" />
                            Lien magique dans {magicLinkCooldown}s
                          </>
                        ) : (
                          <>
                            <LinkIcon size={16} aria-hidden="true" />
                            Recevoir un lien de vérification
                          </>
                        )}
                      </button>

                      <div className="mt-4 text-center space-y-3">
                        <button
                          type="button"
                          onClick={handleResendCode}
                          disabled={resendCooldown > 0 || !isOnline || isSubmitting}
                          className={cn(
                            'text-sm flex items-center gap-1 mx-auto text-gold-600 hover:text-gold-500 transition-colors',
                            'disabled:text-neutral-400 disabled:cursor-not-allowed',
                            'focus:outline-none focus:ring-2 focus:ring-gold-500 rounded px-2 py-1'
                          )}
                        >
                          {resendCooldown > 0 ? (
                            <>
                              <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                              Renvoyer le code dans {resendCooldown}s
                            </>
                          ) : (
                            <>
                              <Send size={14} aria-hidden="true" /> Renvoyer le code
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowTips(!showTips)}
                          aria-expanded={showTips}
                          aria-controls="verify-email-tips"
                          className="text-xs text-neutral-400 hover:text-gold-500 flex items-center gap-1 mx-auto focus:outline-none focus:ring-2 focus:ring-gold-500 rounded px-2 py-1"
                        >
                          <HelpCircle size={12} aria-hidden="true" />
                          Je n&apos;ai pas reçu l&apos;email
                        </button>

                        {showTips && (
                          <div
                            id="verify-email-tips"
                            role="region"
                            aria-label="Conseils pour recevoir l'email"
                            className="overflow-hidden text-xs text-neutral-600 dark:text-neutral-400 text-left bg-neutral-100 dark:bg-neutral-800/50 rounded-xl p-3 animate-slide-down"
                          >
                            <ul className="list-disc pl-4 space-y-1">
                              <li>
                                Vérifiez votre dossier <strong>spam</strong> ou{' '}
                                <strong>courriers indésirables</strong>.
                              </li>
                              <li>
                                Ajoutez <strong>no-reply@gercie.com</strong> à vos contacts.
                              </li>
                              <li>
                                L&apos;email peut prendre jusqu&apos;à 2 minutes selon votre fournisseur.
                              </li>
                              <li>Vérifiez que vous avez saisi la bonne adresse email.</li>
                              <li>Si le problème persiste, essayez le lien magique ci-dessus.</li>
                            </ul>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <p className="mt-4 text-xs text-center text-neutral-400">
                    Vous pouvez également{' '}
                    <Link
                      href="/auth/verify-phone"
                      className="text-gold-500 hover:underline inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                    >
                      <Phone size={12} aria-hidden="true" />
                      vérifier votre numéro de téléphone
                    </Link>{' '}
                    à la place.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
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

/* ------------------------------------------------------------------ */
/*  Export unique : page par défaut avec Suspense                      */
/* ------------------------------------------------------------------ */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailLoading />}>
      <VerifyEmailContent />
    </Suspense>
  )
}