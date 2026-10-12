// hooks/useSearch.ts
'use client'

import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useMemo, useCallback, useRef, useEffect } from 'react'
import { useDebounce } from '@/hooks/useDebounce'

/* ------------------------------------------------------------------ */
/*  Types enrichis                                                     */
/* ------------------------------------------------------------------ */
export interface SearchFilters {
  query?: string
  categoryPrefix?: string
  minPrice?: number
  maxPrice?: number
  sortBy?: 'prix' | 'created_at' | 'pertinence'
  sortOrder?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface SearchResult {
  id: string
  nom: string
  prix: number
  images: string[]
  categorie: string
  description?: string
  vendeur?: { boutique_nom: string }
  rating?: number
  reviews_count?: number
  discount?: number
}

export interface SearchFacetCategory {
  name: string
  count: number
}

export interface SearchResponse {
  data: SearchResult[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  facets?: {
    categories: SearchFacetCategory[]
    priceRange: { min: number; max: number; avg: number }
  }
  // Suggestions de recherche (depuis le backend)
  suggestions?: string[]
}

/* ------------------------------------------------------------------ */
/*  Hook useSearch – recherche avancée avec facettes & suggestions     */
/* ------------------------------------------------------------------ */
export function useSearch(filters: SearchFilters = {}) {
  const debouncedQuery = useDebounce(filters.query ?? '', 400)
  const queryClient = useQueryClient()

  // Construction des paramètres de requête
  const searchParams = useMemo(() => {
    const p = new URLSearchParams()
    const q = debouncedQuery.trim()
    if (q) p.set('query', q)
    if (filters.categoryPrefix) p.set('categoryPrefix', filters.categoryPrefix)
    if (filters.minPrice !== undefined && !isNaN(filters.minPrice))
      p.set('minPrice', String(filters.minPrice))
    if (filters.maxPrice !== undefined && !isNaN(filters.maxPrice))
      p.set('maxPrice', String(filters.maxPrice))
    if (filters.sortBy) p.set('sortBy', filters.sortBy)
    if (filters.sortOrder) p.set('sortOrder', filters.sortOrder)
    if (filters.page && filters.page > 1) p.set('page', String(filters.page))
    if (filters.limit) p.set('limit', String(filters.limit))
    return p.toString()
  }, [debouncedQuery, filters])

  // Activer la requête uniquement si au moins un critère est présent
  const enabled =
    !!debouncedQuery ||
    !!filters.categoryPrefix ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined

  const query = useQuery<SearchResponse>({
    queryKey: ['advanced-search', searchParams],
    queryFn: async () => {
      const res = await fetch(`/api/search/advanced?${searchParams}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur réseau' }))
        throw new Error(err.error || 'Recherche échouée')
      }
      return res.json()
    },
    enabled,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData, // garde les anciens résultats pendant le chargement
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })

  // Suggestions de recherche (depuis la réponse du backend ou locales)
  const suggestions = useMemo(() => {
    return query.data?.suggestions ?? []
  }, [query.data])

  // Prefetch de la page suivante si elle existe
  const prefetchNextPage = useCallback(() => {
    const totalPages = query.data?.pagination?.totalPages || 1
    const currentPage = filters.page || 1
    if (currentPage < totalPages) {
      const nextFilters = { ...filters, page: currentPage + 1 }
      const nextParams = new URLSearchParams()
      if (nextFilters.query) nextParams.set('query', nextFilters.query)
      if (nextFilters.categoryPrefix) nextParams.set('categoryPrefix', nextFilters.categoryPrefix)
      if (nextFilters.minPrice) nextParams.set('minPrice', String(nextFilters.minPrice))
      if (nextFilters.maxPrice) nextParams.set('maxPrice', String(nextFilters.maxPrice))
      if (nextFilters.sortBy) nextParams.set('sortBy', nextFilters.sortBy)
      if (nextFilters.sortOrder) nextParams.set('sortOrder', nextFilters.sortOrder)
      if (nextFilters.page) nextParams.set('page', String(nextFilters.page))
      if (nextFilters.limit) nextParams.set('limit', String(nextFilters.limit))
      queryClient.prefetchQuery({
        queryKey: ['advanced-search', nextParams.toString()],
        queryFn: async () => {
          const res = await fetch(`/api/search/advanced?${nextParams.toString()}`)
          if (!res.ok) throw new Error('Erreur prefetch')
          return res.json()
        },
        staleTime: 2 * 60 * 1000,
      })
    }
  }, [query.data, filters, queryClient])

  // Prefetch automatique quand les résultats arrivent
  useEffect(() => {
    if (query.data && query.data.pagination) {
      prefetchNextPage()
    }
  }, [query.data, prefetchNextPage])

  return {
    results: query.data?.data ?? [],
    totalResults: query.data?.pagination?.total ?? 0,
    pagination: query.data?.pagination,
    facets: query.data?.facets,
    suggestions,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    prefetchNextPage,
  }
}

/* ------------------------------------------------------------------ */
/*  Hook useSearchSuggestions – suggestions en temps réel (léger)      */
/* ------------------------------------------------------------------ */
export function useSearchSuggestions(query: string, limit = 5) {
  const debouncedQuery = useDebounce(query, 300)

  const enabled = debouncedQuery.length >= 2

  const result = useQuery<string[]>({
    queryKey: ['search-suggestions', debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/search/suggestions?q=${encodeURIComponent(debouncedQuery)}&limit=${limit}`
      )
      if (!res.ok) throw new Error('Suggestions indisponibles')
      return res.json()
    },
    enabled,
    staleTime: 30 * 1000, // 30 secondes
    placeholderData: (prev) => prev,
  })

  return {
    suggestions: result.data ?? [],
    isLoading: result.isLoading,
  }
}

/* ------------------------------------------------------------------ */
/*  Hook useSearchHistory – historique de recherche local              */
/* ------------------------------------------------------------------ */
export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('gercie_search_history')
      if (stored) setHistory(JSON.parse(stored))
    } catch {}
  }, [])

  const addToHistory = useCallback((term: string) => {
    setHistory(prev => {
      const updated = [term, ...prev.filter(s => s !== term)].slice(0, 10)
      sessionStorage.setItem('gercie_search_history', JSON.stringify(updated))
      return updated
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    sessionStorage.removeItem('gercie_search_history')
  }, [])

  return { history, addToHistory, clearHistory }
}