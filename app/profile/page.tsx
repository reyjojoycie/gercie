// app/profile/page.tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { 
  ArrowLeft, 
  AlertCircle, 
  RefreshCw, 
  WifiOff, 
  Loader2,
  UserCircle,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { ProfileSidebar } from '@/components/profile/ProfileSidebar'
import { ProfileContent } from '@/components/profile/ProfileContent'
import type { 
  UserProfile, 
  UserWallet, 
  UserAddress, 
  ProfileLoadState 
} from '@/lib/types/profile'

/* ------------------------------------------------------------------ */
/*  Constantes de résilience                                           */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000 // 15s pour réseaux lents
const MAX_RETRIES = 2
const CACHE_KEY = 'profile_page_data'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes de cache

/* ------------------------------------------------------------------ */
/*  Messages localisés                                                 */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Certaines données n\'ont pas pu être chargées.',
  timeout: 'Le chargement prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne. Affichage des données en cache.',
  unknown: 'Une erreur est survenue lors du chargement.',
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
interface CachedData {
  data: {
    profile: UserProfile | null
    wallet: UserWallet
    addresses: UserAddress[]
  }
  timestamp: number
}

function getCachedData(): CachedData | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    
    const parsed: CachedData = JSON.parse(cached)
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS
    
    return isExpired ? null : parsed
  } catch {
    return null
  }
}

function setCachedData(data: CachedData['data']): void {
  if (typeof window === 'undefined') return
  try {
    const cached: CachedData = {
      data,
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Silencieux : le cache est optionnel
  }
}

async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeout = FETCH_TIMEOUT
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */
export default function ProfilePage() {
  const { user, loading: authLoading, logout, isVerified, isOnboarded } = useAuth()
  const router = useRouter()
  const toast = useToast()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [wallet, setWallet] = useState<UserWallet>({ solde_achat: 0 })
  const [addresses, setAddresses] = useState<UserAddress[]>([])
  const [loadState, setLoadState] = useState<ProfileLoadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const hasLoadedRef = useRef(false)

  // Redirection si non connecté
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/profile')
    }
  }, [user, authLoading, router])

  // Détection hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      toast.show({
        type: 'warning',
        message: ERROR_MESSAGES.offline,
        duration: 5000,
      })
    }

    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [toast])

  // Chargement des données avec cache + retry + timeout
  const loadProfileData = useCallback(async (forceRefresh = false) => {
    if (!user) return

    // Annuler les requêtes précédentes
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    // Essayer le cache d'abord (sauf si refresh forcé)
    if (!forceRefresh) {
      const cached = getCachedData()
      if (cached) {
        setProfile(cached.data.profile)
        setWallet(cached.data.wallet)
        setAddresses(cached.data.addresses)
        setLoadState('success')
        // Continuer à rafraîchir en arrière-plan
      }
    }

    if (!forceRefresh && loadState === 'success') {
      // Déjà chargé avec succès, refresh silencieux en arrière-plan
      setIsRefreshing(true)
    } else {
      setLoadState('loading')
    }

    setErrorMessage('')

    const errors: string[] = []

    try {
      // Lancer les 3 requêtes en parallèle avec gestion d'erreur individuelle
      const [profileResult, walletResult, addressesResult] = await Promise.allSettled([
        fetchWithTimeout<{ data?: UserProfile } | UserProfile>(
          '/api/user/profile',
          { signal: abortControllerRef.current.signal }
        ),
        fetchWithTimeout<UserWallet | { balance?: number; solde_achat?: number }>(
          '/api/user/wallet',
          { signal: abortControllerRef.current.signal }
        ).catch(() => ({ solde_achat: 0 })),
        fetchWithTimeout<UserAddress[] | { data?: UserAddress[] }>(
          '/api/user/addresses',
          { signal: abortControllerRef.current.signal }
        ).catch(() => []),
      ])

      // Traiter le profil
      let newProfile: UserProfile | null = null
      if (profileResult.status === 'fulfilled') {
        const res = profileResult.value
        newProfile = (res as any).data || (res as UserProfile)
        setProfile(newProfile)
      } else {
        errors.push('profil')
        console.error('Erreur chargement profil:', profileResult.reason)
      }

      // Traiter le wallet
      let newWallet: UserWallet = { solde_achat: 0 }
      if (walletResult.status === 'fulfilled') {
        const res = walletResult.value as any
        newWallet = {
          solde_achat: res?.solde_achat ?? res?.balance ?? res?.data?.solde_achat ?? 0,
          solde_vente: res?.solde_vente ?? res?.data?.solde_vente,
        }
        setWallet(newWallet)
      } else {
        errors.push('portefeuille')
      }

      // Traiter les adresses
      let newAddresses: UserAddress[] = []
      if (addressesResult.status === 'fulfilled') {
        const res = addressesResult.value as any
        newAddresses = Array.isArray(res) 
          ? res 
          : Array.isArray(res?.data) 
            ? res.data 
            : []
        setAddresses(newAddresses)
      } else {
        errors.push('adresses')
      }

      // Mettre en cache si au moins le profil est chargé
      if (newProfile) {
        setCachedData({
          profile: newProfile,
          wallet: newWallet,
          addresses: newAddresses,
        })
      }

      // Déterminer l'état final
      if (errors.length === 0) {
        setLoadState('success')
      } else if (errors.length < 3) {
        setLoadState('partial')
        setErrorMessage(
          `Certaines données n'ont pas pu être chargées : ${errors.join(', ')}`
        )
      } else {
        setLoadState('error')
        setErrorMessage(ERROR_MESSAGES.network)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Requête annulée, pas d'erreur à afficher
        return
      }

      setLoadState('error')
      
      if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        setErrorMessage(ERROR_MESSAGES.timeout)
      } else if (!navigator.onLine) {
        setErrorMessage(ERROR_MESSAGES.offline)
      } else if (err.message?.includes('Failed to fetch')) {
        setErrorMessage(ERROR_MESSAGES.network)
      } else {
        setErrorMessage(ERROR_MESSAGES.unknown)
      }
    } finally {
      setIsRefreshing(false)
    }
  }, [user, loadState, toast])

  // Chargement initial
  useEffect(() => {
    if (!user || hasLoadedRef.current) return
    hasLoadedRef.current = true
    loadProfileData()
  }, [user, loadProfileData])

  // Cleanup des requêtes au démontage
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Refresh manuel
  const handleRefresh = useCallback(() => {
    if (isRefreshing) return
    loadProfileData(true)
    toast.show({
      type: 'info',
      message: 'Actualisation en cours...',
      duration: 2000,
    })
  }, [loadProfileData, isRefreshing, toast])

  // Callback pour mise à jour avatar
  const handleAvatarUpdated = useCallback((url: string) => {
    setProfile((prev) => prev ? { ...prev, avatar_url: url } : null)
  }, [])

  const handleAvatarRemoved = useCallback(() => {
    setProfile((prev) => prev ? { ...prev, avatar_url: null } : null)
  }, [])

  // État de chargement initial (pas de cache)
  if (authLoading || (loadState === 'loading' && !profile)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4" role="status" aria-live="polite">
          <Loader2 size={40} className="animate-spin text-gold-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Chargement du profil...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-gold-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
            aria-label="Retour à l'accueil"
          >
            <ArrowLeft size={18} aria-hidden="true" /> 
            <span>Retour</span>
          </Link>

          {/* Bouton refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || !isOnline}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gold-500 rounded px-2 py-1"
            aria-label="Actualiser les données"
          >
            <RefreshCw 
              size={16} 
              className={isRefreshing ? 'animate-spin' : ''} 
              aria-hidden="true" 
            />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>

        <div className="space-y-8 max-w-6xl mx-auto animate-fade-in">
          <div className="flex items-center gap-3">
            <UserCircle size={32} className="text-gold-500" aria-hidden="true" />
            <h1 className="text-3xl font-bold text-foreground font-serif">
              Mon Profil
            </h1>
          </div>

          {/* Alerte hors-ligne */}
          {!isOnline && (
            <div
              role="alert"
              className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-4 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
            >
              <WifiOff size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-medium">Mode hors ligne</p>
                <p className="text-xs mt-1 opacity-80">
                  Affichage des données mises en cache. Certaines fonctionnalités peuvent être indisponibles.
                </p>
              </div>
            </div>
          )}

          {/* Alerte erreur partielle */}
          {loadState === 'partial' && errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-4 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
            >
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p>{errorMessage}</p>
                <button
                  onClick={() => loadProfileData(true)}
                  className="mt-2 text-xs font-medium underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
                >
                  Réessayer
                </button>
              </div>
            </div>
          )}

          {/* Alerte erreur complète */}
          {loadState === 'error' && !profile && (
            <div
              role="alert"
              aria-live="assertive"
              className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-6 rounded-xl text-center space-y-4 animate-slide-down"
            >
              <AlertCircle size={40} className="mx-auto text-red-500" aria-hidden="true" />
              <div>
                <p className="font-medium text-lg">Impossible de charger le profil</p>
                <p className="text-sm mt-1 opacity-80">{errorMessage}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => loadProfileData(true)}
                disabled={!isOnline}
                className="mx-auto"
              >
                <RefreshCw size={16} className="mr-2" aria-hidden="true" />
                Réessayer
              </Button>
            </div>
          )}

          {/* Indicateur de refresh en arrière-plan */}
          {isRefreshing && profile && (
            <div
              role="status"
              aria-live="polite"
              className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 p-3 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
            >
              <Loader2 size={16} className="animate-spin flex-shrink-0" aria-hidden="true" />
              <span>Actualisation en cours...</span>
            </div>
          )}

          {/* Contenu principal (affiché même en cas d'erreur partielle si on a le profil) */}
          {profile && (
            <div className="grid lg:grid-cols-[320px_1fr] gap-8">
              <ProfileSidebar
                user={user}
                profile={profile}
                wallet={wallet}
                isVerified={isVerified}
                isOnboarded={isOnboarded}
                onLogout={logout}
                onAvatarUpdated={handleAvatarUpdated}
                onAvatarRemoved={handleAvatarRemoved}
              />

              <ProfileContent
                profile={profile}
                setProfile={setProfile as any}
                user={user}
                isOnboarded={isOnboarded}
                addresses={addresses}
                setAddresses={setAddresses}
              />
            </div>
          )}
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