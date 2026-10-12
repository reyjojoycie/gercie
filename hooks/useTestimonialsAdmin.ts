// hooks/useTestimonialsAdmin.ts
'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData
} from '@tanstack/react-query'
import {
  testimonialService,
  type TestimonialAdmin,
  type TestimonialFilters,
  type TestimonialSort,
  type CreateTestimonialPayload,
  type UpdateTestimonialPayload
} from '@/lib/services/testimonialService'

/* ========================================================================== */
/* Types réutilisables                                                       */
/* ========================================================================== */

export type { TestimonialAdmin, TestimonialFilters, TestimonialSort }

export interface UseTestimonialsAdminOptions {
  /** Filtres initiaux */
  initialFilters?: TestimonialFilters
  /** Tri initial */
  initialSort?: TestimonialSort
  /** Page initiale */
  initialPage?: number
  /** Nombre d'éléments par page */
  limit?: number
  /** Activer la synchronisation avec l'URL (non implémentée ici, placeholder) */
  syncWithUrl?: boolean
}

export interface UseTestimonialsAdminReturn {
  // Données
  testimonials: TestimonialAdmin[]
  totalItems: number
  totalPages: number
  stats: {
    total: number
    published: number
    pending: number
    rejected: number
    avgRating: string
    fiveStars: number
  }

  // État de la requête
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refetch: () => void

  // Filtres, tri, pagination
  filters: TestimonialFilters
  setFilters: (filters: TestimonialFilters) => void
  sort: TestimonialSort
  setSort: (sort: TestimonialSort) => void
  page: number
  setPage: (page: number) => void
  limit: number

  // Sélection multiple
  selected: Set<string>
  toggleSelect: (id: string) => void
  toggleSelectAll: () => void
  clearSelection: () => void

  // Mutations
  createTestimonial: (data: CreateTestimonialPayload) => Promise<any>
  updateTestimonial: (id: string, data: UpdateTestimonialPayload) => Promise<any>
  deleteTestimonial: (id: string) => Promise<any>
  changeStatus: (id: string, status: 'published' | 'pending' | 'rejected') => Promise<any>
  toggleFeatured: (id: string, isFeatured: boolean) => Promise<any>
  reply: (id: string, response: string) => Promise<any>
  removeReply: (id: string) => Promise<any>

  // Actions groupées
  bulkUpdateStatus: (ids: string[], status: 'published' | 'pending' | 'rejected') => Promise<void>
  bulkDelete: (ids: string[]) => Promise<void>

  // Export
  exportCSV: () => void

  // État des mutations (pratique pour les loaders)
  isMutating: boolean
}

/* ========================================================================== */
/* Hook principal                                                            */
/* ========================================================================== */

export function useTestimonialsAdmin(
  options: UseTestimonialsAdminOptions = {}
): UseTestimonialsAdminReturn {
  const {
    initialFilters = {},
    initialSort = { field: 'date', order: 'desc' },
    initialPage = 1,
    limit = 20
  } = options

  // États locaux
  const [filters, setFilters] = useState<TestimonialFilters>(initialFilters)
  const [sort, setSort] = useState<TestimonialSort>(initialSort)
  const [page, setPage] = useState(initialPage)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const queryClient = useQueryClient()

  // Récupération des témoignages
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['admin-testimonials', { filters, sort, page, limit }],
    queryFn: ({ signal }) =>
      testimonialService.list(filters, sort, { page, limit }, signal),
    placeholderData: keepPreviousData, // évite les flashs lors du changement de page
    staleTime: 30_000
  })

  const testimonials = data?.data ?? []
  const meta = data?.meta
  const totalItems = meta?.total ?? 0
  const totalPages = meta?.totalPages ?? 1

  // Statistiques dérivées
  const stats = useMemo(() => {
    const published = meta?.stats?.published ?? testimonials.filter(t => t.status === 'published').length
    const pending = meta?.stats?.pending ?? testimonials.filter(t => t.status === 'pending').length
    const rejected = meta?.stats?.rejected ?? testimonials.filter(t => t.status === 'rejected').length
    const avgRating = meta?.stats?.avgRating ?? (totalItems > 0
      ? (testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length).toFixed(1)
      : '0.0')
    const fiveStars = testimonials.filter(t => t.rating >= 5).length

    return {
      total: totalItems,
      published,
      pending,
      rejected,
      avgRating,
      fiveStars
    }
  }, [testimonials, meta, totalItems])

  // Sélection
  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selected.size === testimonials.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(testimonials.map(t => t.id)))
    }
  }, [selected.size, testimonials])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  // 💡 FIX 1 : Remplacement du useMemo par un useEffect propre pour éviter les effets de bord
  useEffect(() => {
    clearSelection()
  }, [page, filters, sort, clearSelection])

  // Mutation : création
  const createMutation = useMutation({
    mutationFn: (payload: CreateTestimonialPayload) =>
      testimonialService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] })
    }
  })

  // Mutation : mise à jour
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTestimonialPayload }) =>
      testimonialService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] })
    }
  })

  // Mutation : suppression
  const deleteMutation = useMutation({
    mutationFn: (id: string) => testimonialService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] })
    }
  })

  // Mutation : changement de statut (optimiste)
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'published' | 'pending' | 'rejected' }) =>
      testimonialService.changeStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-testimonials'] })
      const previousData = queryClient.getQueryData(['admin-testimonials'])
      queryClient.setQueryData(['admin-testimonials'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map((t: TestimonialAdmin) =>
            t.id === id ? { ...t, status } : t
          )
        }
      })
      return { previousData }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['admin-testimonials'], context.previousData)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] })
    }
  })

  // Mutation : toggle featured (optimiste)
  const featuredMutation = useMutation({
    mutationFn: ({ id, is_featured }: { id: string; is_featured: boolean }) =>
      testimonialService.toggleFeatured(id, is_featured),
    onMutate: async ({ id, is_featured }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-testimonials'] })
      const previousData = queryClient.getQueryData(['admin-testimonials'])
      queryClient.setQueryData(['admin-testimonials'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map((t: TestimonialAdmin) =>
            t.id === id ? { ...t, is_featured } : t
          )
        }
      })
      return { previousData }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['admin-testimonials'], context.previousData)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] })
    }
  })

  // Mutation : réponse admin
  const replyMutation = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string | null }) =>
      response === null 
        ? testimonialService.update(id, { admin_response: null }) // Nettoyage de la réponse
        : testimonialService.reply(id, response),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] })
    }
  })

  // Déterminer si une mutation est en cours
  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    statusMutation.isPending ||
    featuredMutation.isPending ||
    replyMutation.isPending

  // Actions groupées
  const bulkUpdateStatus = useCallback(
    async (ids: string[], status: 'published' | 'pending' | 'rejected') => {
      await testimonialService.bulkUpdateStatus(ids, status)
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] })
    },
    [queryClient]
  )

  const bulkDelete = useCallback(
    async (ids: string[]) => {
      await testimonialService.bulkDelete(ids)
      queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] })
    },
    [queryClient]
  )

  // Export CSV
  const exportCSV = useCallback(() => {
    testimonialService.exportCSV(filters)
  }, [filters])

  return {
    testimonials,
    totalItems,
    totalPages,
    stats,

    isLoading,
    isFetching,
    isError,
    error: error as Error | null,
    refetch,

    filters,
    setFilters,
    sort,
    setSort,
    page,
    setPage,
    limit,

    selected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,

    createTestimonial: (data) => createMutation.mutateAsync(data),
    updateTestimonial: (id, data) => updateMutation.mutateAsync({ id, data }),
    deleteTestimonial: (id) => deleteMutation.mutateAsync(id),
    changeStatus: (id, status) => statusMutation.mutateAsync({ id, status }),
    toggleFeatured: (id, isFeatured) => featuredMutation.mutateAsync({ id, is_featured: isFeatured }),
    reply: (id, response) => replyMutation.mutateAsync({ id, response }),
    // 💡 FIX 2 : Utilise maintenant de manière sûre l'infrastructure de traitement unifiée de replyMutation
    removeReply: (id) => replyMutation.mutateAsync({ id, response: null }),

    bulkUpdateStatus,
    bulkDelete,

    exportCSV,

    isMutating
  }
}

export default useTestimonialsAdmin