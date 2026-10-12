// app/profile/security/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Phone,
  KeyRound,
  HelpCircle,
  Monitor,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronRight,
  WifiOff,
  Loader2,
  Lock,
  Fingerprint,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Réessayez dans quelques instants.',
  timeout: 'La requête prend trop de temps.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne.',
  unknown: 'Une erreur est survenue.',
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface SecurityStatus {
  email_verified: boolean
  phone_verified: boolean
  has_security_question: boolean
  has_2fa: boolean
  last_password_change: string | null
  sessions_count: number
}

type SecurityLevel = 'excellent' | 'good' | 'fair' | 'poor'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function calculateSecurityLevel(status: SecurityStatus): {
  level: SecurityLevel
  score: number
  label: string
  color: string
  message: string
} {
  let score = 0
  const total = 4

  if (status.email_verified) score++
  if (status.phone_verified) score++
  if (status.has_security_question) score++
  if (status.has_2fa) score++

  const percentage = (score / total) * 100

  if (percentage === 100) {
    return {
      level: 'excellent',
      score: percentage,
      label: 'Excellent',
      color: 'text-green-600 dark:text-green-400',
      message: 'Votre compte est parfaitement sécurisé.',
    }
  }
  if (percentage >= 75) {
    return {
      level: 'good',
      score: percentage,
      label: 'Bon',
      color: 'text-blue-600 dark:text-blue-400',
      message: 'Votre sécurité est bonne, mais peut être améliorée.',
    }
  }
  if (percentage >= 50) {
    return {
      level: 'fair',
      score: percentage,
      label: 'Moyen',
      color: 'text-amber-600 dark:text-amber-400',
      message: 'Renforcez votre sécurité pour protéger votre compte.',
    }
  }
  return {
    level: 'poor',
    score: percentage,
    label: 'Faible',
    color: 'text-red-600 dark:text-red-400',
    message: 'Votre compte est vulnérable. Activez les protections.',
  }
}

/* ------------------------------------------------------------------ */
/*  Composant ligne de sécurité                                        */
/* ------------------------------------------------------------------ */
function SecurityItem({
  icon: Icon,
  title,
  description,
  status,
  actionLabel,
  actionHref,
  onClick,
  isDestructive = false,
  disabled = false,
}: {
  icon: any
  title: string
  description: string
  status: 'verified' | 'unverified' | 'configured' | 'not_configured' | 'active' | 'inactive'
  actionLabel: string
  actionHref?: string
  onClick?: () => void
  isDestructive?: boolean
  disabled?: boolean
}) {
  const statusConfig = {
    verified: {
      badge: 'Vérifié',
      badgeVariant: 'success' as const,
      icon: CheckCircle2,
      iconColor: 'text-green-500',
    },
    unverified: {
      badge: 'Non vérifié',
      badgeVariant: 'warning' as const,
      icon: XCircle,
      iconColor: 'text-amber-500',
    },
    configured: {
      badge: 'Configuré',
      badgeVariant: 'success' as const,
      icon: CheckCircle2,
      iconColor: 'text-green-500',
    },
    not_configured: {
      badge: 'Non configuré',
      badgeVariant: 'neutral' as const,
      icon: AlertCircle,
      iconColor: 'text-neutral-400',
    },
    active: {
      badge: 'Actif',
      badgeVariant: 'success' as const,
      icon: CheckCircle2,
      iconColor: 'text-green-500',
    },
    inactive: {
      badge: 'Inactif',
      badgeVariant: 'neutral' as const,
      icon: XCircle,
      iconColor: 'text-neutral-400',
    },
  }

  const config = statusConfig[status]
  const StatusIcon = config.icon

  const content = (
    <div
      className={cn(
        'flex items-center justify-between p-4 rounded-xl border transition-colors',
        'border-neutral-200 dark:border-neutral-700',
        'hover:bg-neutral-50 dark:hover:bg-neutral-900/50',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer'
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-full bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center flex-shrink-0">
          <Icon size={20} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
              {title}
            </span>
            <Badge variant={config.badgeVariant} size="sm">
              <StatusIcon size={12} className="mr-1" aria-hidden="true" />
              {config.badge}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
            {description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span
          className={cn(
            'text-sm font-medium',
            isDestructive
              ? 'text-red-500 hover:text-red-600'
              : 'text-gold-600 dark:text-gold-400'
          )}
        >
          {actionLabel}
        </span>
        <ChevronRight size={16} className="text-neutral-400" aria-hidden="true" />
      </div>
    </div>
  )

  if (disabled) {
    return <div>{content}</div>
  }

  if (actionHref) {
    return (
      <Link href={actionHref} className="block focus:outline-none focus:ring-2 focus:ring-gold-500 rounded-xl">
        {content}
      </Link>
    )
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left focus:outline-none focus:ring-2 focus:ring-gold-500 rounded-xl"
    >
      {content}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Page principale                                                    */
/* ------------------------------------------------------------------ */
export default function SecurityPage() {
  const router = useRouter()
  const { user, loading: authLoading, refreshRoles } = useAuth()

  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const retryCountRef = useRef(0)

  // Redirection si non connecté
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/profile/security')
    }
  }, [user, authLoading, router])

  // Détection hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setError(ERROR_MESSAGES.offline)
    }
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  // Fetch avec retry
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> => {
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

  // Chargement du statut de sécurité
  const loadSecurityStatus = useCallback(
    async (isRefresh = false) => {
      if (!user) return
      if (!isOnline) {
        setError(ERROR_MESSAGES.offline)
        return
      }

      if (isRefresh) {
        setIsRefreshing(true)
      } else {
        setLoading(true)
      }
      setError('')
      retryCountRef.current = 0

      try {
        const res = await fetchWithRetry('/api/user/security')
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (res.status >= 500) throw new Error(ERROR_MESSAGES.server)
          throw new Error(data.error || ERROR_MESSAGES.unknown)
        }

        setSecurityStatus({
          email_verified: data.email_verified ?? user.email_confirmed_at != null,
          phone_verified: data.phone_verified ?? user.phone_confirmed_at != null,
          has_security_question: data.has_security_question ?? false,
          has_2fa: data.has_2fa ?? false,
          last_password_change: data.last_password_change ?? null,
          sessions_count: data.sessions_count ?? 1,
        })
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setError(ERROR_MESSAGES.timeout)
        } else if (err.name === 'TypeError' || !navigator.onLine) {
          setError(ERROR_MESSAGES.network)
        } else {
          setError(err.message || ERROR_MESSAGES.unknown)
        }
      } finally {
        setLoading(false)
        setIsRefreshing(false)
      }
    },
    [user, isOnline, fetchWithRetry]
  )

  useEffect(() => {
    loadSecurityStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (authLoading || loading || !securityStatus) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center">
        <div className="text-center space-y-4" role="status" aria-live="polite">
          <Loader2 size={40} className="animate-spin text-gold-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-neutral-500">Chargement de la sécurité...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  const securityLevel = calculateSecurityLevel(securityStatus)

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 py-8 px-4">
      <Container size="small" className="max-w-3xl">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 mb-6 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
          aria-label="Retour au profil"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Retour au profil
        </Link>

        <div className="space-y-6 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif flex items-center gap-2">
                <Shield size={28} className="text-gold-500" aria-hidden="true" />
                Sécurité
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Gérez la sécurité et la confidentialité de votre compte
              </p>
            </div>
            <button
              onClick={() => loadSecurityStatus(true)}
              disabled={isRefreshing || !isOnline}
              className="p-2 text-neutral-400 hover:text-gold-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gold-500 rounded-lg"
              aria-label="Actualiser"
            >
              <Loader2
                size={20}
                className={isRefreshing ? 'animate-spin' : 'hidden'}
                aria-hidden="true"
              />
              <Shield
                size={20}
                className={isRefreshing ? 'hidden' : ''}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Hors ligne */}
          {!isOnline && (
            <div
              role="alert"
              className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-4 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
            >
              <WifiOff size={18} className="flex-shrink-0" aria-hidden="true" />
              Vous êtes hors ligne.
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
            >
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Score de sécurité */}
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0',
                    securityLevel.level === 'excellent' && 'bg-green-100 dark:bg-green-900/30',
                    securityLevel.level === 'good' && 'bg-blue-100 dark:bg-blue-900/30',
                    securityLevel.level === 'fair' && 'bg-amber-100 dark:bg-amber-900/30',
                    securityLevel.level === 'poor' && 'bg-red-100 dark:bg-red-900/30'
                  )}
                >
                  {securityLevel.level === 'excellent' ? (
                    <ShieldCheck size={32} className="text-green-600 dark:text-green-400" aria-hidden="true" />
                  ) : securityLevel.level === 'poor' ? (
                    <ShieldAlert size={32} className="text-red-600 dark:text-red-400" aria-hidden="true" />
                  ) : (
                    <Shield size={32} className={securityLevel.color} aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      Niveau de sécurité :{' '}
                      <span className={securityLevel.color}>{securityLevel.label}</span>
                    </h2>
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                    {securityLevel.message}
                  </p>
                  {/* Barre de progression */}
                  <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        securityLevel.level === 'excellent' && 'bg-green-500',
                        securityLevel.level === 'good' && 'bg-blue-500',
                        securityLevel.level === 'fair' && 'bg-amber-500',
                        securityLevel.level === 'poor' && 'bg-red-500'
                      )}
                      style={{ width: `${securityLevel.score}%` }}
                      role="progressbar"
                      aria-valuenow={securityLevel.score}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Score de sécurité : ${securityLevel.score}%`}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Options de sécurité */}
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardHeader>
              <CardTitle className="text-xl">Options de sécurité</CardTitle>
              <CardDescription>
                Configurez les protections pour sécuriser votre compte
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Email */}
              <SecurityItem
                icon={Mail}
                title="Adresse email"
                description={
                  securityStatus.email_verified
                    ? 'Votre email est vérifié'
                    : 'Vérifiez votre email pour sécuriser votre compte'
                }
                status={securityStatus.email_verified ? 'verified' : 'unverified'}
                actionLabel={securityStatus.email_verified ? 'Gérer' : 'Vérifier'}
                actionHref="/auth/verify-email"
              />

              {/* Téléphone */}
              <SecurityItem
                icon={Phone}
                title="Numéro de téléphone"
                description={
                  securityStatus.phone_verified
                    ? 'Votre téléphone est vérifié'
                    : 'Ajoutez et vérifiez votre numéro pour la récupération'
                }
                status={securityStatus.phone_verified ? 'verified' : 'unverified'}
                actionLabel={securityStatus.phone_verified ? 'Gérer' : 'Vérifier'}
                actionHref="/auth/verify-phone"
              />

              {/* Mot de passe */}
              <SecurityItem
                icon={KeyRound}
                title="Mot de passe"
                description={
                  securityStatus.last_password_change
                    ? `Modifié le ${new Date(securityStatus.last_password_change).toLocaleDateString('fr-FR')}`
                    : 'Changez régulièrement votre mot de passe'
                }
                status="configured"
                actionLabel="Changer"
                actionHref="/profile/security/password"
              />

              {/* Question de sécurité */}
              <SecurityItem
                icon={HelpCircle}
                title="Question de sécurité"
                description={
                  securityStatus.has_security_question
                    ? 'Configurée pour la récupération de compte'
                    : 'Ajoutez une question pour récupérer votre compte'
                }
                status={securityStatus.has_security_question ? 'configured' : 'not_configured'}
                actionLabel={securityStatus.has_security_question ? 'Modifier' : 'Configurer'}
                actionHref="/profile/security/question"
              />

              {/* Sessions actives */}
              <SecurityItem
                icon={Monitor}
                title="Sessions actives"
                description={`${securityStatus.sessions_count} appareil${securityStatus.sessions_count > 1 ? 's' : ''} connecté${securityStatus.sessions_count > 1 ? 's' : ''}`}
                status="active"
                actionLabel="Gérer"
                actionHref="/profile/security/sessions"
              />

              {/* 2FA (Optionnel - à activer si supporté) */}
              <SecurityItem
                icon={Fingerprint}
                title="Authentification à deux facteurs (2FA)"
                description="Ajoutez une couche de sécurité supplémentaire"
                status={securityStatus.has_2fa ? 'active' : 'inactive'}
                actionLabel={securityStatus.has_2fa ? 'Gérer' : 'Activer'}
                actionHref="/profile/security/2fa"
                disabled={!securityStatus.has_2fa} // Désactivé si non configuré (à implémenter)
              />
            </CardContent>
          </Card>

          {/* Conseils de sécurité */}
          <Card className="border-border bg-gradient-to-br from-gold-50 to-amber-50 dark:from-gold-950/20 dark:to-amber-950/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <Lock size={20} className="text-gold-600 dark:text-gold-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-2">
                  <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                    Conseils de sécurité
                  </h3>
                  <ul className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1 list-disc list-inside">
                    <li>Utilisez un mot de passe unique et complexe (12+ caractères)</li>
                    <li>Ne partagez jamais vos codes de vérification</li>
                    <li>Vérifiez régulièrement vos sessions actives</li>
                    <li>Activez la 2FA pour une protection maximale</li>
                    <li>Méfiez-vous des emails/messages suspects demandant vos infos</li>
                  </ul>
                </div>
              </div>
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