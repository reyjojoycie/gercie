// app/auth/oauth/page.tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  WifiOff,
  ShieldAlert,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const MAX_POLL_ATTEMPTS = 10 // 10 tentatives × 500ms = 5 secondes max
const POLL_INTERVAL_MS = 500
const REDIRECT_DELAY_MS = 800

/* ------------------------------------------------------------------ */
/*  Messages localisés                                                 */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  access_denied: 'Accès refusé. Vous avez annulé la connexion.',
  invalid_grant: 'Session expirée. Veuillez réessayer.',
  server_error: 'Erreur serveur. Réessayez dans quelques instants.',
  timeout: 'La connexion prend trop de temps. Vérifiez votre réseau.',
  network: 'Connexion instable. Vérifiez votre réseau et réessayez.',
  unknown: 'Impossible de finaliser l\'authentification. Veuillez réessayer.',
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type OAuthState = 'loading' | 'success' | 'error' | 'timeout'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getOAuthErrorFromUrl(searchParams: URLSearchParams): string | null {
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  
  if (!error) return null
  
  // Mapper les codes d'erreur OAuth vers des messages lisibles
  switch (error) {
    case 'access_denied':
      return ERROR_MESSAGES.access_denied
    case 'invalid_grant':
      return ERROR_MESSAGES.invalid_grant
    case 'server_error':
      return ERROR_MESSAGES.server_error
    default:
      return errorDescription || ERROR_MESSAGES.unknown
  }
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */
export default function OAuthPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, isVerified, isOnboarded, refreshRoles } = useAuth()

  const [state, setState] = useState<OAuthState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [pollAttempts, setPollAttempts] = useState(0)

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasRedirectedRef = useRef(false)

  // Détection hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setState('error')
      setErrorMessage(ERROR_MESSAGES.offline)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Vérifier les erreurs OAuth dans l'URL au chargement
  useEffect(() => {
    const urlError = getOAuthErrorFromUrl(searchParams)
    if (urlError) {
      setState('error')
      setErrorMessage(urlError)
      // Nettoyer l'URL pour ne pas laisser les paramètres d'erreur visibles
      window.history.replaceState({}, '', '/auth/oauth')
    }
  }, [searchParams])

  // Polling intelligent pour détecter la session Supabase
  const pollForSession = useCallback(async () => {
    if (hasRedirectedRef.current) return

    try {
      const { data: { session }, error } = await supabaseBrowser.auth.getSession()
      
      if (error) {
        console.error('Erreur getSession:', error)
        return
      }

      if (session?.user) {
        hasRedirectedRef.current = true
        setState('success')
        
        // Rafraîchir les rôles avant redirection
        try {
          await refreshRoles()
        } catch (err) {
          console.error('Erreur refreshRoles:', err)
        }

        // Nettoyer l'URL
        window.history.replaceState({}, '', '/auth/oauth')

        // Redirection après un court délai
        setTimeout(() => {
          const destination = !isVerified || !isOnboarded ? '/onboarding' : '/'
          router.replace(destination)
        }, REDIRECT_DELAY_MS)
        
        return
      }

      // Incrémenter le compteur de tentatives
      setPollAttempts((prev) => {
        const next = prev + 1
        if (next >= MAX_POLL_ATTEMPTS) {
          setState('timeout')
          setErrorMessage(ERROR_MESSAGES.timeout)
        }
        return next
      })
    } catch (err) {
      console.error('Erreur polling:', err)
    }
  }, [isVerified, isOnboarded, refreshRoles, router])

  // Démarrer le polling quand le contexte AuthContext est encore en chargement
  useEffect(() => {
    // Si le contexte a déjà détecté l'utilisateur, on gère directement
    if (!loading && user) {
      hasRedirectedRef.current = true
      setState('success')
      
      window.history.replaceState({}, '', '/auth/oauth')
      
      setTimeout(() => {
        const destination = !isVerified || !isOnboarded ? '/onboarding' : '/'
        router.replace(destination)
      }, REDIRECT_DELAY_MS)
      return
    }

    // Si le contexte a terminé de charger mais pas d'utilisateur, et qu'on a déjà pollé
    if (!loading && !user && pollAttempts >= MAX_POLL_ATTEMPTS) {
      return
    }

    // Si le contexte est encore en chargement, on démarre le polling
    if (loading && state === 'loading') {
      pollIntervalRef.current = setInterval(pollForSession, POLL_INTERVAL_MS)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [loading, user, state, pollAttempts, pollForSession, isVerified, isOnboarded, router])

  // Arrêter le polling quand on a un résultat
  useEffect(() => {
    if (state !== 'loading' && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [state])

  // Retry manuel
  const handleRetry = useCallback(async () => {
    setState('loading')
    setErrorMessage('')
    setPollAttempts(0)
    hasRedirectedRef.current = false
    
    // Relancer le polling
    pollIntervalRef.current = setInterval(pollForSession, POLL_INTERVAL_MS)
  }, [pollForSession])

  // Déterminer l'icône et le message selon l'état
  const getIcon = () => {
    if (state === 'error' || state === 'timeout') {
      return <AlertTriangle size={28} className="text-red-500" aria-hidden="true" />
    }
    if (state === 'success' && user) {
      return (
        <span className="text-xl font-bold text-gold-600 dark:text-gold-400">
          {user.email?.charAt(0).toUpperCase() || '👤'}
        </span>
      )
    }
    return <Loader2 size={28} className="text-gold-600 dark:text-gold-400 animate-spin" aria-hidden="true" />
  }

  const getTitle = () => {
    if (state === 'error' || state === 'timeout') return 'Échec de connexion'
    if (state === 'success' && user) return 'Connexion réussie'
    return 'Connexion en cours'
  }

  const getDescription = () => {
    if (state === 'error' || state === 'timeout') {
      return errorMessage || ERROR_MESSAGES.unknown
    }
    if (state === 'success' && user) {
      return `Bienvenue ${user.user_metadata?.full_name || user.email}`
    }
    return 'Finalisation de votre authentification…'
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12">
      <Container size="small" className="max-w-md w-full text-center">
        <div className="animate-fade-in">
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardHeader>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
                {getIcon()}
              </div>
              <CardTitle className="text-2xl font-serif text-neutral-900 dark:text-neutral-100">
                {getTitle()}
              </CardTitle>
              <CardDescription 
                className="text-neutral-500 dark:text-neutral-400"
                aria-live="polite"
                aria-atomic="true"
              >
                {getDescription()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Alerte hors-ligne */}
              {!isOnline && (
                <div
                  role="alert"
                  className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 p-3 mb-4 rounded-xl text-sm flex items-center gap-2"
                >
                  <WifiOff size={16} className="flex-shrink-0" aria-hidden="true" />
                  Vous êtes hors ligne.
                </div>
              )}

              {/* État erreur ou timeout */}
              {(state === 'error' || state === 'timeout') && (
                <div className="space-y-4 animate-slide-down" role="alert" aria-live="assertive">
                  {errorMessage && (
                    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-xl text-sm flex items-start gap-2">
                      <ShieldAlert size={18} className="text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    La connexion via le réseau social a échoué.
                  </p>

                  {/* Bouton retry */}
                  <Button
                    variant="outline"
                    fullWidth
                    onClick={handleRetry}
                    disabled={!isOnline}
                    className="mb-4 focus:outline-none focus:ring-2 focus:ring-gold-500"
                  >
                    <RefreshCw size={16} className="mr-2" aria-hidden="true" />
                    Réessayer
                  </Button>

                  <div className="border-t border-gold-400/20 pt-4">
                    <p className="text-xs text-neutral-400 mb-3">Ou réessayer avec :</p>
                    <OAuthButtons 
                      providers={['google', 'facebook', 'apple']} 
                      disabled={!isOnline}
                    />
                  </div>
                  
                  <div className="text-xs text-neutral-400 mt-3">
                    Ou revenir à la{' '}
                    <Link 
                      href="/login" 
                      className="text-gold-500 hover:underline focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                    >
                      connexion classique
                    </Link>
                  </div>
                </div>
              )}

              {/* État chargement */}
              {state === 'loading' && !user && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    <span>Veuillez patienter...</span>
                  </div>
                  
                  {/* Indicateur de progression discret */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-neutral-400">
                      <span>Vérification de la session</span>
                      <span>{Math.min(pollAttempts, MAX_POLL_ATTEMPTS)}/{MAX_POLL_ATTEMPTS}</span>
                    </div>
                    <div className="w-full h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold-500 rounded-full transition-all duration-500 ease-linear"
                        style={{ width: `${(pollAttempts / MAX_POLL_ATTEMPTS) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* État succès */}
              {state === 'success' && user && (
                <div 
                  className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400 animate-slide-down"
                  role="status"
                  aria-live="polite"
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>Redirection en cours...</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Container>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
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