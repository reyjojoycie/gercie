// app/profile/security/sessions/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Monitor,
  Smartphone,
  Tablet,
  Bot,
  HelpCircle,
  MapPin,
  Calendar,
  X,
  RefreshCw,
  AlertCircle,
  WifiOff,
  Loader2,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { formatRelativeTime, formatAbsoluteDate } from '@/lib/utils/relativeTime'
import { parseUserAgent, getDeviceLabel, type ParsedUA } from '@/lib/utils/parseUserAgent'

/* ------------------------------------------------------------------ */
/*  Constantes de résilience                                           */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2

/* ------------------------------------------------------------------ */
/*  Messages localisés                                                 */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Réessayez dans quelques instants.',
  timeout: 'La requête prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  revoke_failed: 'Impossible de révoquer cette session. Réessayez.',
  load_failed: 'Impossible de charger les sessions.',
  unknown: 'Une erreur est survenue.',
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Session {
  id: string
  ip: string
  user_agent: string
  created_at: string
  last_active: string
  is_current: boolean
  country?: string | null
  city?: string | null
}

/* ------------------------------------------------------------------ */
/*  Composant carte session                                            */
/* ------------------------------------------------------------------ */
function SessionCard({
  session,
  onRevoke,
  isRevoking,
}: {
  session: Session
  onRevoke: (id: string) => void
  isRevoking: boolean
}) {
  const ua: ParsedUA = parseUserAgent(session.user_agent)
  const Icon = {
    mobile: Smartphone,
    tablet: Tablet,
    desktop: Monitor,
    bot: Bot,
    unknown: HelpCircle,
  }[ua.deviceType]

  const location = session.city && session.country
    ? `${session.city}, ${session.country}`
    : session.country || 'Localisation inconnue'

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-3',
        'bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4',
        'border border-neutral-200 dark:border-neutral-700',
        'animate-slide-in'
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
            session.is_current
              ? 'bg-gold-100 dark:bg-gold-900/30'
              : 'bg-neutral-100 dark:bg-neutral-700'
          )}
        >
          <Icon
            size={20}
            className={
              session.is_current
                ? 'text-gold-600 dark:text-gold-400'
                : 'text-neutral-500 dark:text-neutral-400'
            }
            aria-hidden="true"
          />
        </div>
        <div className="space-y-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200 truncate">
              {getDeviceLabel(ua)}
            </span>
            {session.is_current ? (
              <Badge variant="gold" size="sm">
                Session actuelle
              </Badge>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
                {ua.os}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span
              className="flex items-center gap-1"
              title={`IP : ${session.ip}`}
            >
              <MapPin size={12} aria-hidden="true" />
              <span className="truncate">{location}</span>
            </span>
            <span
              className="flex items-center gap-1"
              title={formatAbsoluteDate(session.last_active)}
            >
              <Calendar size={12} aria-hidden="true" />
              <span>{formatRelativeTime(session.last_active)}</span>
            </span>
          </div>
        </div>
      </div>

      {!session.is_current && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(session.id)}
          loading={isRevoking}
          disabled={isRevoking}
          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 self-start sm:self-auto flex-shrink-0"
          aria-label={`Révoquer la session ${ua.browser} sur ${ua.os}`}
        >
          <X size={14} className="mr-1" aria-hidden="true" /> Révoquer
        </Button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page principale                                                    */
/* ------------------------------------------------------------------ */
export default function SessionsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(true)

  const abortControllerRef = useRef<AbortController | null>(null)
  const retryCountRef = useRef(0)

  // Rediriger si non connecté
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/profile/security/sessions')
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

  // Cleanup requêtes
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  // Fetch avec retry + timeout
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

  // Chargement des sessions
  const fetchSessions = useCallback(
    async (isRefresh = false) => {
      if (!user) return
      if (!isOnline) {
        setError(ERROR_MESSAGES.offline)
        return
      }

      if (isRefresh) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }
      setError('')
      retryCountRef.current = 0

      try {
        const res = await fetchWithRetry('/api/user/sessions')
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (res.status >= 500) throw new Error(ERROR_MESSAGES.server)
          throw new Error(data.error || ERROR_MESSAGES.load_failed)
        }

        setSessions(data.sessions || [])
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setError(ERROR_MESSAGES.timeout)
        } else if (err.name === 'TypeError' || !navigator.onLine) {
          setError(ERROR_MESSAGES.network)
        } else {
          setError(err.message || ERROR_MESSAGES.unknown)
        }
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [user, isOnline, fetchWithRetry]
  )

  useEffect(() => {
    fetchSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Révocation d'une session
  const handleRevoke = useCallback(
    async (id: string) => {
      if (!isOnline) {
        setError(ERROR_MESSAGES.offline)
        return
      }

      setRevokingId(id)
      setError('')
      setSuccess('')
      retryCountRef.current = 0

      try {
        const res = await fetchWithRetry(`/api/user/sessions/${id}`, { method: 'DELETE' })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (res.status === 404) {
            // Déjà révoquée, nettoyer localement
            setSessions((prev) => prev.filter((s) => s.id !== id))
            setSuccess('Session déjà révoquée.')
            return
          }
          if (res.status >= 500) throw new Error(ERROR_MESSAGES.server)
          throw new Error(data.error || ERROR_MESSAGES.revoke_failed)
        }

        setSessions((prev) => prev.filter((s) => s.id !== id))
        setSuccess('Session révoquée avec succès.')
        setTimeout(() => setSuccess(''), 3000)
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setError(ERROR_MESSAGES.timeout)
        } else if (err.name === 'TypeError' || !navigator.onLine) {
          setError(ERROR_MESSAGES.network)
        } else {
          setError(err.message || ERROR_MESSAGES.revoke_failed)
        }
      } finally {
        setRevokingId(null)
      }
    },
    [isOnline, fetchWithRetry]
  )

  const confirmRevoke = useCallback(() => {
    if (confirmRevokeId) {
      handleRevoke(confirmRevokeId)
      setConfirmRevokeId(null)
    }
  }, [confirmRevokeId, handleRevoke])

  const sessionToRevoke = sessions.find((s) => s.id === confirmRevokeId)
  const sessionUA = sessionToRevoke ? parseUserAgent(sessionToRevoke.user_agent) : null

  if (authLoading || !user) return null

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 py-8 px-4">
      <Container size="small" className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/profile/security"
            className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
            aria-label="Retour à la sécurité"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Retour à la sécurité
          </Link>

          <button
            onClick={() => fetchSessions(true)}
            disabled={isLoading || isRefreshing || !isOnline}
            className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-gold-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gold-500 rounded px-2 py-1"
            aria-label="Actualiser les sessions"
          >
            <RefreshCw
              size={14}
              className={isRefreshing ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>

        <div className="animate-fade-in">
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardHeader>
              <CardTitle className="text-2xl font-serif text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <ShieldAlert size={24} className="text-gold-500" aria-hidden="true" />
                Sessions actives
              </CardTitle>
              <CardDescription className="text-neutral-500 dark:text-neutral-400">
                Gérez vos connexions et déconnectez-vous à distance des appareils non reconnus.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Hors ligne */}
              {!isOnline && (
                <div
                  role="alert"
                  className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-3 rounded-xl text-sm flex items-center gap-2"
                >
                  <WifiOff size={16} className="flex-shrink-0" aria-hidden="true" />
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
                  <span className="flex-1">{error}</span>
                </div>
              )}

              {/* Succès */}
              {success && (
                <div
                  role="status"
                  aria-live="polite"
                  className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 p-4 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
                >
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" aria-hidden="true" />
                  <span>{success}</span>
                </div>
              )}

              {/* Indicateur refresh arrière-plan */}
              {isRefreshing && sessions.length > 0 && (
                <div
                  role="status"
                  className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 p-3 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
                >
                  <Loader2 size={16} className="animate-spin flex-shrink-0" aria-hidden="true" />
                  Actualisation en cours...
                </div>
              )}

              {/* Chargement initial */}
              {isLoading ? (
                <div className="space-y-3" role="status" aria-live="polite">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 flex items-center gap-3 border border-neutral-200 dark:border-neutral-700"
                    >
                      <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2 animate-pulse" />
                        <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-3/4 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                <div
                  className="text-center py-12 text-neutral-500 dark:text-neutral-400"
                  role="status"
                >
                  <Monitor size={40} className="mx-auto mb-3 opacity-40" aria-hidden="true" />
                  <p className="text-sm">Aucune session active trouvée.</p>
                </div>
              ) : (
                <div className="space-y-3" aria-live="polite" aria-atomic="false">
                  {sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onRevoke={(id) => setConfirmRevokeId(id)}
                      isRevoking={revokingId === session.id}
                    />
                  ))}
                </div>
              )}

              {/* Info sécurité */}
              {!isLoading && sessions.length > 0 && (
                <div
                  role="note"
                  className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 text-xs text-neutral-600 dark:text-neutral-400"
                >
                  <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                    🔒 Conseil de sécurité
                  </p>
                  <p>
                    Si vous ne reconnaissez pas une session, révoquez-la immédiatement et changez
                    votre mot de passe depuis la page Sécurité.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Container>

      {/* Modal de confirmation de révocation */}
      <Modal
        isOpen={!!confirmRevokeId}
        onClose={() => setConfirmRevokeId(null)}
        title="Révoquer cette session ?"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            L&apos;utilisateur sera déconnecté immédiatement sur cet appareil :
          </p>
          {sessionToRevoke && sessionUA && (
            <div className="bg-neutral-50 dark:bg-neutral-900 rounded-xl p-3 border border-neutral-200 dark:border-neutral-700 space-y-1 text-sm">
              <p className="font-medium">{getDeviceLabel(sessionUA)}</p>
              <p className="text-xs text-neutral-500">{sessionUA.os}</p>
              <p className="text-xs text-neutral-500">
                IP : {sessionToRevoke.ip}
              </p>
              <p className="text-xs text-neutral-500">
                Dernière activité : {formatRelativeTime(sessionToRevoke.last_active)}
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setConfirmRevokeId(null)}
              disabled={revokingId !== null}
            >
              Annuler
            </Button>
            <Button
              variant="luxe"
              fullWidth
              onClick={confirmRevoke}
              loading={revokingId !== null}
              disabled={revokingId !== null}
              className="bg-red-500 hover:bg-red-600 border-red-500"
            >
              <X size={16} className="mr-1" aria-hidden="true" />
              Révoquer
            </Button>
          </div>
        </div>
      </Modal>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        .animate-slide-down {
          animation: slideDown 0.3s ease-out;
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in,
          .animate-slide-down,
          .animate-slide-in {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}