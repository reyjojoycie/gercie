// contexts/LoyaltyProvider.tsx
'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface TierConfig {
  id: LoyaltyTier
  label: string
  minPoints: number
  maxPoints: number
  earnRate: number // Points gagnés par 1000 FC dépensés
  benefits: string[]
  color: string
  bgColor: string
  icon: string // Emoji ou nom d'icône
}

export interface LoyaltyTransaction {
  id: string
  type: 'earn' | 'spend' | 'bonus' | 'expire' | 'refund'
  points: number
  description: string
  reference?: string // order_id, reward_id, etc.
  created_at: string
}

export interface LoyaltyReward {
  id: string
  title: string
  description: string
  points_cost: number
  type: 'discount' | 'free_shipping' | 'product' | 'voucher'
  value: number // Valeur en FC ou pourcentage
  available: boolean
  image_url?: string | null
}

export interface LoyaltyState {
  points: number
  lifetime_points: number
  tier: LoyaltyTier
  next_tier: LoyaltyTier | null
  points_to_next_tier: number
  progress_percent: number
  transactions: LoyaltyTransaction[]
  rewards: LoyaltyReward[]
}

interface LoyaltyContextValue {
  // Données
  state: LoyaltyState | null
  tiers: TierConfig[]

  // États
  loading: boolean
  isOnline: boolean
  error: string | null

  // Actions
  refreshLoyalty: () => Promise<void>
  calculateEarnedPoints: (amountFC: number) => number
  redeemReward: (rewardId: string) => Promise<{ success: boolean; voucherCode?: string }>
  getTierConfig: (tier?: LoyaltyTier) => TierConfig
  getFormattedPoints: (points?: number) => string
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2
const CACHE_KEY = 'gercie_loyalty_cache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Configuration des niveaux (adaptée au marché RDC)
export const LOYALTY_TIERS: TierConfig[] = [
  {
    id: 'bronze',
    label: 'Bronze',
    minPoints: 0,
    maxPoints: 999,
    earnRate: 10, // 10 points par 1000 FC
    benefits: ['Accès au programme', '10 points par 1000 FC dépensés'],
    color: 'text-amber-700 dark:text-amber-500',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    icon: '🥉',
  },
  {
    id: 'silver',
    label: 'Silver',
    minPoints: 1000,
    maxPoints: 4999,
    earnRate: 15, // 15 points par 1000 FC
    benefits: [
      '15 points par 1000 FC dépensés',
      '-5% sur les frais de livraison',
      'Accès aux ventes privées',
    ],
    color: 'text-slate-600 dark:text-slate-300',
    bgColor: 'bg-slate-100 dark:bg-slate-800/50',
    icon: '🥈',
  },
  {
    id: 'gold',
    label: 'Gold',
    minPoints: 5000,
    maxPoints: 14999,
    earnRate: 25, // 25 points par 1000 FC
    benefits: [
      '25 points par 1000 FC dépensés',
      'Livraison gratuite illimitée',
      '-10% sur certains produits',
      'Support prioritaire',
    ],
    color: 'text-gold-600 dark:text-gold-400',
    bgColor: 'bg-gold-100 dark:bg-gold-900/30',
    icon: '🥇',
  },
  {
    id: 'platinum',
    label: 'Platinum',
    minPoints: 15000,
    maxPoints: Infinity,
    earnRate: 40, // 40 points par 1000 FC
    benefits: [
      '40 points par 1000 FC dépensés',
      'Livraison express gratuite',
      '-15% sur tout le catalogue',
      'Cadeaux anniversaire',
      'Accès VIP aux événements',
    ],
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    icon: '💎',
  },
]

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Données en cache affichées.',
  timeout: 'Le chargement prend trop de temps.',
  server: 'Service fidélité temporairement indisponible.',
  offline: 'Vous êtes hors ligne. Données en cache affichées.',
  redeem_failed: 'Échange impossible. Réessayez plus tard.',
  not_enough_points: 'Vous n\'avez pas assez de points pour cet échange.',
  unknown: 'Une erreur est survenue.',
}

/* ------------------------------------------------------------------ */
/*  Cache helpers                                                      */
/* ------------------------------------------------------------------ */
interface CachedLoyalty {
  state: LoyaltyState
  timestamp: number
  userId: string
}

function getCachedLoyalty(userId: string): LoyaltyState | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    const parsed: CachedLoyalty = JSON.parse(cached)
    if (parsed.userId !== userId) return null
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null
    return parsed.state
  } catch {
    return null
  }
}

function setCachedLoyalty(userId: string, state: LoyaltyState): void {
  if (typeof window === 'undefined') return
  try {
    const cached: CachedLoyalty = {
      state,
      timestamp: Date.now(),
      userId,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Silencieux
  }
}

function clearCachedLoyalty(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // Silencieux
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getTierFromPoints(points: number): LoyaltyTier {
  for (let i = LOYALTY_TIERS.length - 1; i >= 0; i--) {
    if (points >= LOYALTY_TIERS[i].minPoints) {
      return LOYALTY_TIERS[i].id
    }
  }
  return 'bronze'
}

function getNextTier(currentTier: LoyaltyTier): LoyaltyTier | null {
  const idx = LOYALTY_TIERS.findIndex((t) => t.id === currentTier)
  if (idx === -1 || idx === LOYALTY_TIERS.length - 1) return null
  return LOYALTY_TIERS[idx + 1].id
}

function calculateProgress(state: {
  points: number
  tier: LoyaltyTier
  next_tier: LoyaltyTier | null
}): { pointsToNext: number; percent: number } {
  if (!state.next_tier) {
    return { pointsToNext: 0, percent: 100 } // Niveau max atteint
  }

  const currentTierConfig = LOYALTY_TIERS.find((t) => t.id === state.tier)!
  const nextTierConfig = LOYALTY_TIERS.find((t) => t.id === state.next_tier)!

  const range = nextTierConfig.minPoints - currentTierConfig.minPoints
  const progress = state.points - currentTierConfig.minPoints
  const percent = Math.min(100, Math.round((progress / range) * 100))
  const pointsToNext = Math.max(0, nextTierConfig.minPoints - state.points)

  return { pointsToNext, percent }
}

function formatPoints(points: number): string {
  return new Intl.NumberFormat('fr-FR').format(points)
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */
const LoyaltyContext = createContext<LoyaltyContextValue | undefined>(undefined)

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */
export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const toast = useToast()

  const [state, setState] = useState<LoyaltyState | null>(null)
  const [loading, setLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const retryCountRef = useRef(0)
  const hasLoadedRef = useRef(false)

  // ------------------------------------------------------------------
  // Détection hors-ligne
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Cleanup au démontage
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // ------------------------------------------------------------------
  // Nettoyage au logout
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) {
      setState(null)
      clearCachedLoyalty()
      hasLoadedRef.current = false
    }
  }, [isAuthenticated])

  // ------------------------------------------------------------------
  // Fetch avec retry + timeout
  // ------------------------------------------------------------------
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> => {
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

  // ------------------------------------------------------------------
  // Chargement des données fidélité
  // ------------------------------------------------------------------
  const refreshLoyalty = useCallback(async () => {
    if (!user) return

    // Annuler les requêtes précédentes
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    // Essayer le cache d'abord
    if (!state) {
      const cached = getCachedLoyalty(user.id)
      if (cached) {
        setState(cached)
      }
    }

    if (!isOnline) {
      const cached = getCachedLoyalty(user.id)
      if (cached) {
        setState(cached)
        setError(ERROR_MESSAGES.offline)
      } else {
        setError(ERROR_MESSAGES.offline)
      }
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    retryCountRef.current = 0

    try {
      const [pointsRes, transactionsRes, rewardsRes] = await Promise.allSettled([
        fetchWithRetry('/api/loyalty/points', {
          signal: abortControllerRef.current.signal,
        }),
        fetchWithRetry('/api/loyalty/transactions', {
          signal: abortControllerRef.current.signal,
        }),
        fetchWithRetry('/api/loyalty/rewards', {
          signal: abortControllerRef.current.signal,
        }),
      ])

      // Traiter les points
      let points = 0
      let lifetimePoints = 0
      if (pointsRes.status === 'fulfilled') {
        const data = await pointsRes.value.json().catch(() => ({}))
        points = data?.points ?? data?.data?.points ?? 0
        lifetimePoints = data?.lifetime_points ?? data?.data?.lifetime_points ?? points
      }

      // Traiter les transactions
      let transactions: LoyaltyTransaction[] = []
      if (transactionsRes.status === 'fulfilled') {
        const data = await transactionsRes.value.json().catch(() => [])
        transactions = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      }

      // Traiter les récompenses
      let rewards: LoyaltyReward[] = []
      if (rewardsRes.status === 'fulfilled') {
        const data = await rewardsRes.value.json().catch(() => [])
        rewards = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      }

      // Calculer le niveau et la progression
      const tier = getTierFromPoints(points)
      const next_tier = getNextTier(tier)
      const { pointsToNext, percent } = calculateProgress({ points, tier, next_tier })

      const newState: LoyaltyState = {
        points,
        lifetime_points: lifetimePoints,
        tier,
        next_tier,
        points_to_next_tier: pointsToNext,
        progress_percent: percent,
        transactions,
        rewards,
      }

      setState(newState)
      setCachedLoyalty(user.id, newState)
    } catch (err: any) {
      if (err.name === 'AbortError') return

      if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        setError(ERROR_MESSAGES.timeout)
      } else if (!navigator.onLine) {
        setError(ERROR_MESSAGES.offline)
      } else if (err.message?.includes('Failed to fetch')) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(ERROR_MESSAGES.unknown)
      }

      // Essayer de garder le cache en cas d'erreur
      const cached = getCachedLoyalty(user.id)
      if (cached && !state) {
        setState(cached)
      }
    } finally {
      setLoading(false)
    }
  }, [user, isOnline, state, fetchWithRetry])

  // ------------------------------------------------------------------
  // Chargement initial
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isAuthenticated && user && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      refreshLoyalty()
    }
  }, [isAuthenticated, user, refreshLoyalty])

  // ------------------------------------------------------------------
  // Échange d'une récompense
  // ------------------------------------------------------------------
  const redeemReward = useCallback(
    async (rewardId: string): Promise<{ success: boolean; voucherCode?: string }> => {
      if (!user || !state) {
        return { success: false }
      }

      const reward = state.rewards.find((r) => r.id === rewardId)
      if (!reward) {
        toast.show({ type: 'error', message: 'Récompense introuvable.', duration: 4000 })
        return { success: false }
      }

      if (state.points < reward.points_cost) {
        toast.show({
          type: 'error',
          message: ERROR_MESSAGES.not_enough_points,
          duration: 4000,
        })
        return { success: false }
      }

      if (!isOnline) {
        toast.show({ type: 'error', message: ERROR_MESSAGES.offline, duration: 4000 })
        return { success: false }
      }

      try {
        const res = await fetchWithRetry('/api/loyalty/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reward_id: rewardId }),
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(data.error || ERROR_MESSAGES.redeem_failed)
        }

        toast.show({
          type: 'success',
          message: `🎉 Récompense échangée avec succès !`,
          duration: 4000,
        })

        // Rafraîchir les données
        await refreshLoyalty()

        return {
          success: true,
          voucherCode: data?.voucher_code || data?.data?.voucher_code,
        }
      } catch (err: any) {
        toast.show({
          type: 'error',
          message: err.message || ERROR_MESSAGES.redeem_failed,
          duration: 4000,
        })
        return { success: false }
      }
    },
    [user, state, isOnline, fetchWithRetry, refreshLoyalty, toast]
  )

  // ------------------------------------------------------------------
  // Calcul des points gagnés pour un montant donné
  // ------------------------------------------------------------------
  const calculateEarnedPoints = useCallback(
    (amountFC: number): number => {
      if (!state || amountFC <= 0) return 0
      const tierConfig = LOYALTY_TIERS.find((t) => t.id === state.tier)
      if (!tierConfig) return 0
      // earnRate = points par 1000 FC
      return Math.floor((amountFC / 1000) * tierConfig.earnRate)
    },
    [state]
  )

  // ------------------------------------------------------------------
  // Récupérer la config d'un niveau
  // ------------------------------------------------------------------
  const getTierConfig = useCallback(
    (tier?: LoyaltyTier): TierConfig => {
      const targetTier = tier ?? state?.tier ?? 'bronze'
      return LOYALTY_TIERS.find((t) => t.id === targetTier) ?? LOYALTY_TIERS[0]
    },
    [state?.tier]
  )

  // ------------------------------------------------------------------
  // Formater les points
  // ------------------------------------------------------------------
  const getFormattedPoints = useCallback((points?: number): string => {
    return formatPoints(points ?? state?.points ?? 0)
  }, [state?.points])

  // ------------------------------------------------------------------
  // Valeur du context (mémoïsée)
  // ------------------------------------------------------------------
  const value: LoyaltyContextValue = useMemo(
    () => ({
      state,
      tiers: LOYALTY_TIERS,
      loading,
      isOnline,
      error,
      refreshLoyalty,
      calculateEarnedPoints,
      redeemReward,
      getTierConfig,
      getFormattedPoints,
    }),
    [
      state,
      loading,
      isOnline,
      error,
      refreshLoyalty,
      calculateEarnedPoints,
      redeemReward,
      getTierConfig,
      getFormattedPoints,
    ]
  )

  return <LoyaltyContext.Provider value={value}>{children}</LoyaltyContext.Provider>
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */
export function useLoyalty(): LoyaltyContextValue {
  const context = useContext(LoyaltyContext)
  if (context === undefined) {
    throw new Error('useLoyalty doit être utilisé dans un <LoyaltyProvider>')
  }
  return context
}

/**
 * Hook simplifié pour récupérer rapidement les infos de fidélité
 */
export function useLoyaltySummary() {
  const { state, getTierConfig, getFormattedPoints } = useLoyalty()

  if (!state) {
    return {
      points: 0,
      formattedPoints: '0',
      tier: null,
      tierConfig: null,
      progress: 0,
    }
  }

  return {
    points: state.points,
    formattedPoints: getFormattedPoints(state.points),
    tier: state.tier,
    tierConfig: getTierConfig(state.tier),
    nextTier: state.next_tier,
    nextTierConfig: state.next_tier ? getTierConfig(state.next_tier) : null,
    progress: state.progress_percent,
    pointsToNext: state.points_to_next_tier,
  }
}

export default LoyaltyProvider