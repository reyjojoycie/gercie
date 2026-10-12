// hooks/useLoyalty.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export type FideliteLevel = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface LoyaltyData {
  level: FideliteLevel
  points: number
  totalSpent: number
  nextLevel: FideliteLevel | null
  pointsToNextLevel: number | null
  benefits: string[]
  progressPercent: number
}

/* ------------------------------------------------------------------ */
/*  Configuration des niveaux                                          */
/* ------------------------------------------------------------------ */
const LEVELS: Array<{
  key: FideliteLevel
  label: string
  minPoints: number
  benefits: string[]
}> = [
  { key: 'none', label: 'Nouveau', minPoints: 0, benefits: ['Accès à la plateforme'] },
  { key: 'bronze', label: 'Bronze', minPoints: 100, benefits: ['Retours gratuits sous 14 jours', 'Support prioritaire'] },
  { key: 'silver', label: 'Silver', minPoints: 500, benefits: ['Livraison offerte dès 30$', 'Retours gratuits sous 30 jours'] },
  { key: 'gold', label: 'Gold', minPoints: 1500, benefits: ['Livraison express gratuite', 'Offres exclusives', 'Service client dédié'] },
  { key: 'platinum', label: 'Platinum', minPoints: 5000, benefits: ['Tout Gold +', 'Accès avant-première', 'Cadeau d’anniversaire'] },
  { key: 'diamond', label: 'Diamond', minPoints: 15000, benefits: ['Tout Platinum +', 'Conciergerie personnelle', 'Événements VIP'] },
]

/* ------------------------------------------------------------------ */
/*  Hook principal                                                     */
/* ------------------------------------------------------------------ */
export function useLoyalty() {
  const { user } = useAuth()

  const { data, isLoading, error, refetch } = useQuery<LoyaltyData, Error>({
    queryKey: ['loyalty', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/user/loyalty')
      if (!res.ok) throw new Error('Erreur chargement du statut fidélité')
      const json = await res.json()
      return {
        level: json.level ?? 'none',
        points: json.points ?? 0,
        totalSpent: json.totalSpent ?? 0,
        nextLevel: json.nextLevel ?? null,
        pointsToNextLevel: json.pointsToNextLevel ?? null,
        benefits: json.benefits ?? [],
        progressPercent: json.progressPercent ?? 0,
      }
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const loyaltyData = data ?? {
    level: 'none' as FideliteLevel,
    points: 0,
    totalSpent: 0,
    nextLevel: null,
    pointsToNextLevel: null,
    benefits: [],
    progressPercent: 0,
  }

  return {
    ...loyaltyData,
    isLoading,
    error: error?.message ?? null,
    refetch,
  }
}
