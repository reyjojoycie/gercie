// hooks/useTestimonialsAdmin.ts
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  DEFAULT_TESTIMONIAL_SETTINGS,
  DEFAULT_TESTIMONIAL_STATS,
  testimonialsToCsv,
  type Testimonial,
  type TestimonialFilters,
  type TestimonialSettings,
  type TestimonialSort,
  type TestimonialStats,
  type TestimonialAuditLog,
} from '@/lib/testimonials'

interface UseTestimonialsAdminOptions {
  limit?: number
}

interface AdminResponse {
  success: boolean
  data: Testimonial[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    stats: TestimonialStats
    products: string[]
  }
  logs?: TestimonialAuditLog[]
  settings?: TestimonialSettings
}

export function useTestimonialsAdmin({ limit = 10 }: UseTestimonialsAdminOptions = {}) {
  const [filters, setFilters] = useState<TestimonialFilters>({
    search: '',
    status: 'all',
    rating: 'all',
    verified: 'all',
    featured: 'all',
    product: '',
  })

  const [sort, setSort] = useState<TestimonialSort>({
    field: 'created_at',
    order: 'desc',
  })

  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isMutating, setIsMutating] = useState(false)

  const query = useQuery<AdminResponse>({
    queryKey: ['admin-testimonials', filters, sort, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      params.set('status', filters.status)
      params.set('rating', filters.rating)
      params.set('verified', filters.verified)
      params.set('featured', filters.featured)
      params.set('sort', sort.field)
      params.set('order', sort.order)

      if (filters.search) params.set('search', filters.search)
      if (filters.product) params.set('product', filters.product)

      const res = await fetch(`/api/admin/testimonials?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Erreur lors du chargement des témoignages.')
      }

      return json as AdminResponse
    },
    staleTime: 30_000,
    retry: 1,
    placeholderData: (previous) => previous,
  })

  const testimonials = useMemo(
    () => query.data?.data ?? [],
    [query.data?.data]
  )

  const meta = query.data?.meta

  const stats = useMemo(
    () => meta?.stats ?? DEFAULT_TESTIMONIAL_STATS,
    [meta?.stats]
  )

  const settings = useMemo(
    () => query.data?.settings ?? DEFAULT_TESTIMONIAL_SETTINGS,
    [query.data?.settings]
  )

  const logs = useMemo(
    () => query.data?.logs ?? [],
    [query.data?.logs]
  )

  const productOptions = useMemo(
    () => meta?.products ?? stats.products ?? [],
    [meta?.products, stats.products]
  )

  const totalItems = meta?.total ?? 0
  const totalPages = meta?.totalPages ?? 1

  useEffect(() => {
    setSelected(new Set())
  }, [page, filters, sort])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === testimonials.length) return new Set()
      return new Set(testimonials.map((item) => item.id))
    })
  }, [testimonials])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
  }, [])

  const apiPost = useCallback(async (action: string, payload?: any) => {
    setIsMutating(true)

    try {
      const res = await fetch('/api/admin/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, payload }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Erreur serveur.')
      }

      return json
    } finally {
      setIsMutating(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    await query.refetch()
  }, [query])

  const createTestimonial = useCallback(
    async (data: Partial<Testimonial>) => {
      await apiPost('save', data)
      await refresh()
    },
    [apiPost, refresh]
  )

  const updateTestimonial = useCallback(
    async (id: string, data: Partial<Testimonial>) => {
      await apiPost('save', { ...data, id })
      await refresh()
    },
    [apiPost, refresh]
  )

  const deleteTestimonial = useCallback(
    async (id: string) => {
      await apiPost('delete', { id })
      await refresh()
    },
    [apiPost, refresh]
  )

  const changeStatus = useCallback(
    async (id: string, status: Testimonial['status']) => {
      await apiPost('status', { id, status })
      await refresh()
    },
    [apiPost, refresh]
  )

  const toggleFeatured = useCallback(
    async (id: string, isFeatured: boolean) => {
      await apiPost('toggle-featured', { id, is_featured: isFeatured })
      await refresh()
    },
    [apiPost, refresh]
  )

  const reply = useCallback(
    async (id: string, responseText: string) => {
      await apiPost('reply', { id, response: responseText })
      await refresh()
    },
    [apiPost, refresh]
  )

  const bulkUpdateStatus = useCallback(
    async (ids: string[], status: Testimonial['status']) => {
      await apiPost('bulk-status', { ids, status })
      await refresh()
    },
    [apiPost, refresh]
  )

  const bulkDelete = useCallback(
    async (ids: string[]) => {
      await apiPost('bulk-delete', { ids })
      await refresh()
    },
    [apiPost, refresh]
  )

  const saveSettings = useCallback(
    async (nextSettings: Partial<TestimonialSettings>) => {
      await apiPost('save-settings', nextSettings)
      await refresh()
    },
    [apiPost, refresh]
  )

  const clearLogs = useCallback(async () => {
    await apiPost('clear-logs', {})
    await refresh()
  }, [apiPost, refresh])

  const exportCSV = useCallback(async () => {
    const params = new URLSearchParams()
    params.set('page', '1')
    params.set('limit', '1000')
    params.set('status', filters.status)
    params.set('rating', filters.rating)
    params.set('verified', filters.verified)
    params.set('featured', filters.featured)
    params.set('sort', sort.field)
    params.set('order', sort.order)

    if (filters.search) params.set('search', filters.search)
    if (filters.product) params.set('product', filters.product)

    const res = await fetch(`/api/admin/testimonials?${params.toString()}`, {
      credentials: 'include',
      cache: 'no-store',
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(json?.error || 'Erreur lors de l’export.')
    }

    const items: Testimonial[] = Array.isArray(json?.data) ? json.data : []
    const csv = testimonialsToCsv(items)

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `temoignages-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [filters, sort])

  return {
    testimonials,
    totalItems,
    totalPages,
    stats,
    settings,
    logs,
    productOptions,

    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    filters,
    setFilters,
    sort,
    setSort,
    page,
    setPage,

    selected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,

    createTestimonial,
    updateTestimonial,
    deleteTestimonial,
    changeStatus,
    toggleFeatured,
    reply,
    bulkUpdateStatus,
    bulkDelete,
    saveSettings,
    clearLogs,
    exportCSV,

    isMutating,
  }
}