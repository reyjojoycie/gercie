// features/admin/hooks/useAdminStats.ts
'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

/* ========================================================================== */
/*  Types enrichis                                                             */
/* ========================================================================== */

export interface AdminStats {
  // existants (conservés pour rétro‑compatibilité)
  totalUsers: number
  totalCommandes: number
  totalVentes: number
  retraitsEnAttente: number
  litigesOuverts: number
  soldeEscrow: number

  // nouveaux champs provenant de l'API enrichie
  utilisateurs: {
    total: number
    nouveauxCeMois: number
    nouveauxAujourdhui: number
  }
  commandes: {
    total: number
    enAttente: number
    payees: number
    livrees: number
    annulees: number
    duJour: number
  }
  ventes: {
    total: number
    ceMois: number
    aujourdhui: number
    panierMoyen: number
  }
  produits: {
    actifs: number
    enRupture: number
    top5: { id: string; nom: string; total_ventes: number }[]
  }
  categories: { name: string; count: number }[]
  finance: {
    soldeEscrow: number
    rechargesMois: number
    retraitsMois: number
    retraitsEnAttente: number
  }
  litiges: {
    ouverts: number
    resolus: number
  }
  livreurs: {
    total: number
    actifs: number
  }
  evolution: {
    commandes: { date: string; count: number }[]
    chiffreAffaires: { date: string; ca: number }[]
  }
  meta: {
    generatedAt: string
    range: number
  }
}

export interface UseAdminStatsOptions {
  /** Période : 7, 30 ou 90 jours (défaut 30) */
  range?: '7d' | '30d' | '90d'
  /** Désactive la requête (ex: si l'utilisateur n'est pas admin) */
  enabled?: boolean
  /** Stale time personnalisé (ms) */
  staleTime?: number
  /** Callback appelé après chaque succès */
  onSuccess?: (data: AdminStats) => void
  /** Callback appelé après une erreur */
  onError?: (error: Error) => void
}

/* ========================================================================== */
/*  Hook useAdminStats                                                         */
/* ========================================================================== */

export function useAdminStats(options: UseAdminStatsOptions = {}) {
  const {
    range = '30d',
    enabled = true,
    staleTime = 2 * 60 * 1000,
    onSuccess,
    onError,
  } = options

  const queryClient = useQueryClient()

  // Construction de la clé
  const queryKey = useMemo(() => ['admin-stats', range], [range])

  // Requête React Query
  const query = useQuery<AdminStats>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/stats?range=${range}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur réseau' }))
        throw new Error(err.error || 'Impossible de charger les statistiques')
      }
      return res.json()
    },
    enabled,
    staleTime,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    refetchOnWindowFocus: false,
    // Optionnel : notifier les callbacks
    // (React Query ne les expose pas directement, on les écoute via useEffect)
  })

  // Écoute des changements d'état pour appeler onSuccess / onError
  const { data, isSuccess, isError, error } = query

  if (isSuccess && data && onSuccess) {
    onSuccess(data)
  }
  if (isError && error && onError) {
    onError(error as Error)
  }

  // Fonction de rafraîchissement forcé
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey })
  }, [queryClient, queryKey])

  // Fonction pour précharger (prefetch) une autre période
  const prefetch = useCallback(
    (targetRange: '7d' | '30d' | '90d') => {
      queryClient.prefetchQuery({
        queryKey: ['admin-stats', targetRange],
        queryFn: async () => {
          const res = await fetch(`/api/admin/stats?range=${targetRange}`)
          if (!res.ok) throw new Error('Erreur prefetch')
          return res.json()
        },
        staleTime,
      })
    },
    [queryClient, staleTime]
  )

  // Pour rétro‑compatibilité, on expose directement les anciens champs au premier niveau
  const flatStats = useMemo(() => {
    if (!data) return undefined
    return {
      totalUsers: data.totalUsers ?? data.utilisateurs?.total ?? 0,
      totalCommandes: data.totalCommandes ?? data.commandes?.total ?? 0,
      totalVentes: data.totalVentes ?? data.ventes?.total ?? 0,
      retraitsEnAttente: data.retraitsEnAttente ?? data.finance?.retraitsEnAttente ?? 0,
      litigesOuverts: data.litigesOuverts ?? data.litiges?.ouverts ?? 0,
      soldeEscrow: data.soldeEscrow ?? data.finance?.soldeEscrow ?? 0,
    }
  }, [data])

  return {
    stats: data,
    flatStats,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    isFetching: query.isFetching,
    invalidate,
    prefetch,
    // Pour usage direct dans les anciens composants
    totalUsers: flatStats?.totalUsers ?? 0,
    totalCommandes: flatStats?.totalCommandes ?? 0,
    totalVentes: flatStats?.totalVentes ?? 0,
    retraitsEnAttente: flatStats?.retraitsEnAttente ?? 0,
    litigesOuverts: flatStats?.litigesOuverts ?? 0,
    soldeEscrow: flatStats?.soldeEscrow ?? 0,
  }
}