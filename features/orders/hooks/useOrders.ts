// features/orders/hooks/useOrders.ts
'use client'

import { useQuery } from '@tanstack/react-query'

export interface Order {
  id: string
  numero: string
  total: number
  statut: string
  date: string
  type_livraison: string
  adresse_livraison?: string
  articles: Array<{
    nom: string
    quantite: number
    prix_unitaire: number
    specifications?: string | null
    variante?: any
  }>
}

interface UseOrdersParams {
  statut?: string
  limit?: number
  offset?: number
}

export function useOrders(params: UseOrdersParams = {}) {
  const { statut, limit, offset } = params

  return useQuery<Order[]>({
    queryKey: ['orders', statut, limit, offset],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (statut) searchParams.append('statut', statut)
      if (limit) searchParams.append('limit', limit.toString())
      if (offset) searchParams.append('offset', offset.toString())

      const res = await fetch(`/api/commandes?${searchParams.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Erreur lors du chargement des commandes')
      }
      return res.json()
    },
    staleTime: 30_000,
    retry: 2,
    refetchOnWindowFocus: false,
  })
}