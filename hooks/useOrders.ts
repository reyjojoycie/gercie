// hooks/useOrders.ts
'use client'

import {
  useQuery,
  useInfiniteQuery,
  keepPreviousData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'

/* ========================================================================== */
/*  Types enrichis                                                             */
/* ========================================================================== */

export interface OrderArticle {
  nom: string
  quantite: number
  prix_unitaire: number
  specifications?: string | null
  variante?: Record<string, any> | null
}

export interface Order {
  id: string
  numero: string
  total: number
  statut: string
  date: string
  type_livraison: string
  articles: OrderArticle[]
}

export interface OrdersFilters {
  statut?: string
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  dateFrom?: string
  dateTo?: string
  minTotal?: number
  maxTotal?: number
}

export interface PaginatedOrders {
  data: Order[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/* ========================================================================== */
/*  Fetcher (appel API paginé)                                                */
/* ========================================================================== */

async function fetchOrders(filters: OrdersFilters): Promise<PaginatedOrders> {
  const params = new URLSearchParams()
  if (filters.statut) params.append('statut', filters.statut)
  if (filters.search) params.append('search', filters.search)
  if (filters.sort_by) params.append('sort_by', filters.sort_by)
  if (filters.sort_order) params.append('sort_order', filters.sort_order)
  if (filters.page) params.append('page', String(filters.page))
  if (filters.pageSize) params.append('limit', String(filters.pageSize))
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)
  if (filters.minTotal) params.append('min_total', String(filters.minTotal))
  if (filters.maxTotal) params.append('max_total', String(filters.maxTotal))

  const response = await fetch(`/api/commandes?${params.toString()}`)
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Erreur réseau' }))
    throw new Error(err.error || 'Impossible de charger les commandes.')
  }
  const json = await response.json()
  // Si l'API renvoie directement un tableau, on pagine côté client
  if (Array.isArray(json)) {
    const page = filters.page || 1
    const pageSize = filters.pageSize || 10
    const total = json.length
    const totalPages = Math.ceil(total / pageSize)
    const data = json.slice((page - 1) * pageSize, page * pageSize)
    return { data, total, page, pageSize, totalPages }
  }
  // Sinon, on suppose que l'API renvoie { data, total, page, pageSize, totalPages }
  return json as PaginatedOrders
}

/* ========================================================================== */
/*  Hook principal useOrders (paginé, rétrocompatible)                        */
/* ========================================================================== */

export function useOrders(filters: OrdersFilters = {}) {
  const queryKey = useMemo(() => ['orders', filters], [filters])

  const query = useQuery<PaginatedOrders>({
    queryKey,
    queryFn: () => fetchOrders(filters),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  })

  const orders = query.data?.data ?? []

  return {
    data: orders,               // pour rétrocompatibilité
    orders,
    pagination: query.data
      ? {
          total: query.data.total,
          page: query.data.page,
          pageSize: query.data.pageSize,
          totalPages: query.data.totalPages,
        }
      : null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    isFetching: query.isFetching,
    query,
  }
}

/* ========================================================================== */
/*  Hook pour pagination infinie (scroll infini)                             */
/* ========================================================================== */

export function useInfiniteOrders(filters: OrdersFilters = {}) {
  const queryKey = useMemo(() => ['orders-infinite', filters], [filters])

  const query = useInfiniteQuery<Order[], Error>({
    queryKey,
    queryFn: async ({ pageParam = 1 }) => {
      const res = await fetchOrders({ ...filters, page: pageParam as number, pageSize: filters.pageSize ?? 20 })
      return res.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const pageSize = filters.pageSize ?? 20
      if (lastPage.length < pageSize) return undefined
      return allPages.length + 1
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const allOrders = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

  return {
    data: allOrders,
    orders: allOrders,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isFetching: query.isFetching,
    query,
  }
}

/* ========================================================================== */
/*  Actions (annuler, retourner, facture)                                     */
/* ========================================================================== */

export function useOrderActions() {
  const queryClient = useQueryClient()

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/commandes/${orderId}/cancel`, { method: 'PUT' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur annulation')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const returnMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch('/api/retours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commande_id: orderId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur retour')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const downloadInvoice = useCallback(async (orderId: string) => {
    window.open(`/api/commandes/${orderId}/facture`, '_blank')
  }, [])

  return {
    cancelOrder: cancelMutation.mutate,
    cancelOrderAsync: cancelMutation.mutateAsync,
    returnOrder: returnMutation.mutate,
    returnOrderAsync: returnMutation.mutateAsync,
    downloadInvoice,
    isCancelling: cancelMutation.isPending,
    isReturning: returnMutation.isPending,
    cancelError: cancelMutation.error?.message ?? null,
    returnError: returnMutation.error?.message ?? null,
  }
}