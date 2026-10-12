// ---------------------------------------------------------------------------
// Hook useProducts – Gestion complète des produits avec cache et résilience
// Optimisé pour Kinshasa : cache localStorage, timeout long, mode hors ligne
// ---------------------------------------------------------------------------
'use client'

import {
  useQuery,
  useInfiniteQuery,
  keepPreviousData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Product {
  id: string
  nom: string
  prix: number
  prix_usd?: number
  prix_promo?: number | null
  images: string[]
  vendeur?: { boutique_nom: string }
  categorie?: string
  created_at?: string
  description?: string
  stock?: number
  rating?: number
  reviews_count?: number
  discount?: number
  total_ventes?: number
  badges?: string[]
  est_actif?: boolean
  remise_percent?: number
  slug?: string
  featured?: boolean
  express_gratuit?: boolean
}

export interface ProductsFilters {
  search?: string
  categorie?: string
  categorie_prefix?: string
  min_price?: string | number
  max_price?: string | number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  pageSize?: number
  est_promo?: boolean
  featured?: boolean
}

export interface PaginatedResponse {
  data: Product[]
  nextPage: number | null
  total: number
}

/* ------------------------------------------------------------------ */
/*  Constantes optimisées pour Kinshasa                                */
/* ------------------------------------------------------------------ */

const FETCH_TIMEOUT = 15000 // ✅ 15 secondes (au lieu de 10) pour la 2G
const CACHE_KEY_PREFIX = 'gercie_products_cache'
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes de cache local
const MAX_RETRIES = 2
const STALE_TIME = 3 * 60 * 1000 // 3 minutes avant de considérer comme périmé
const GC_TIME = 15 * 60 * 1000 // 15 minutes de conservation en mémoire

/* ------------------------------------------------------------------ */
/*  Helpers : Cache localStorage                                       */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  data: Product[]
  timestamp: number
}

function getCacheKey(filters: ProductsFilters & { page?: number }): string {
  const filterString = JSON.stringify(filters)
  return `${CACHE_KEY_PREFIX}_${btoa(filterString).slice(0, 32)}`
}

function getCachedData(key: string): Product[] | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(key)
    if (!cached) return null

    const entry: CacheEntry = JSON.parse(cached)
    const isExpired = Date.now() - entry.timestamp > CACHE_TTL

    return isExpired ? null : entry.data
  } catch {
    return null
  }
}

function setCachedData(key: string, data: Product[]): void {
  if (typeof window === 'undefined') return

  try {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
    }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // Ignorer si le localStorage est plein
  }
}

/* ------------------------------------------------------------------ */
/*  Validation des produits                                            */
/* ------------------------------------------------------------------ */

function isValidProduct(product: any): product is Product {
  return (
    product &&
    typeof product.id === 'string' &&
    typeof product.nom === 'string' &&
    typeof product.prix === 'number' &&
    product.prix > 0 &&
    Array.isArray(product.images)
  )
}

function validateProducts(products: any[]): Product[] {
  if (!Array.isArray(products)) {
    console.warn('[useProducts] Données invalides : pas un tableau')
    return []
  }
  return products.filter(isValidProduct)
}

/* ------------------------------------------------------------------ */
/*  Fetcher avec timeout et gestion d'erreurs                          */
/* ------------------------------------------------------------------ */

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    })
    clearTimeout(timeoutId)
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchProducts(
  filters: ProductsFilters & { page?: number }
): Promise<Product[]> {
  const cacheKey = getCacheKey(filters)

  // ✅ Vérifier le cache local d'abord (économie de data)
  const cached = getCachedData(cacheKey)
  if (cached) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[useProducts] 📦 Données depuis le cache local:', cached.length)
    }
    return cached
  }

  // Construire les paramètres de requête
  const params = new URLSearchParams()

  if (filters.search) params.append('search', filters.search)
  if (filters.categorie) params.append('categorie', filters.categorie)
  if (filters.categorie_prefix) params.append('categorie_prefix', filters.categorie_prefix)
  if (filters.min_price !== undefined && filters.min_price !== '') {
    params.append('min_price', String(filters.min_price))
  }
  if (filters.max_price !== undefined && filters.max_price !== '') {
    params.append('max_price', String(filters.max_price))
  }
  if (filters.sort_by) params.append('sort_by', filters.sort_by)
  if (filters.sort_order) params.append('sort_order', filters.sort_order)
  if (filters.page) params.append('page', String(filters.page))
  if (filters.pageSize) params.append('limit', String(filters.pageSize))
  if (filters.est_promo !== undefined) params.append('est_promo', String(filters.est_promo))
  if (filters.featured !== undefined) params.append('featured', String(filters.featured))

  const url = `/api/produits?${params.toString()}`

  // ✅ Vérifier si on est hors ligne
  if (typeof window !== 'undefined' && !navigator.onLine) {
    throw new Error('Vous êtes hors ligne. Vérifiez votre connexion.')
  }

  const response = await fetchWithTimeout(url)

  if (!response.ok) {
    throw new Error(`Erreur ${response.status} : Impossible de charger les produits.`)
  }

  const json = await response.json()

  // ✅ Gérer les deux formats de réponse : tableau direct ou { data: [...] }
  const rawProducts = Array.isArray(json) ? json : json.data || []
  const validated = validateProducts(rawProducts)

  // ✅ Mettre en cache pour les prochaines requêtes
  if (validated.length > 0) {
    setCachedData(cacheKey, validated)
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[useProducts] 🌐 Données chargées depuis le réseau:', validated.length)
  }

  return validated
}

/* ------------------------------------------------------------------ */
/*  Hook useProducts – version enrichie                                */
/* ------------------------------------------------------------------ */

export function useProducts(filters: ProductsFilters = {}) {
  const queryKey = useMemo(() => ['products', filters], [filters])

  const query = useQuery<Product[], Error>({
    queryKey,
    queryFn: () => fetchProducts(filters),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false, // ✅ Économie de data
    refetchOnReconnect: true, // ✅ Retry automatique quand la connexion revient
    retry: MAX_RETRIES,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // Backoff exponentiel
    networkMode: 'offlineFirst', // ✅ Utiliser le cache si hors ligne
  })

  // Filtrer localement pour une recherche instantanée (si le backend ne supporte pas)
  const localSearch = filters.search?.toLowerCase() || ''

  const filteredProducts = useMemo(() => {
    let list = query.data ?? []

    if (localSearch && list.length > 0) {
      list = list.filter(
        (p) =>
          p.nom.toLowerCase().includes(localSearch) ||
          (p.description && p.description.toLowerCase().includes(localSearch))
      )
    }

    return list
  }, [query.data, localSearch])

  return {
    products: filteredProducts,
    rawProducts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    isFetching: query.isFetching,
    isOffline: typeof window !== 'undefined' ? !navigator.onLine : false,
  }
}

/* ------------------------------------------------------------------ */
/*  Hook useInfiniteProducts – pagination infinie optimisée            */
/* ------------------------------------------------------------------ */

export function useInfiniteProducts(filters: ProductsFilters = {}) {
  const queryKey = useMemo(() => ['products-infinite', filters], [filters])

  const query = useInfiniteQuery<Product[], Error>({
    queryKey,
    queryFn: async ({ pageParam = 1 }) => {
      return fetchProducts({
        ...filters,
        page: pageParam as number,
        pageSize: filters.pageSize ?? 20,
      })
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const pageSize = filters.pageSize ?? 20
      if (lastPage.length < pageSize) return undefined
      return allPages.length + 1
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: MAX_RETRIES,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    networkMode: 'offlineFirst',
  })

  const allProducts = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

  return {
    products: allProducts,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isFetching: query.isFetching,
    isOffline: typeof window !== 'undefined' ? !navigator.onLine : false,
  }
}

/* ------------------------------------------------------------------ */
/*  Hook usePrefetchProducts – préchargement au survol                 */
/* ------------------------------------------------------------------ */

export function usePrefetchProducts() {
  const queryClient = useQueryClient()

  const prefetch = useCallback(
    (filters: ProductsFilters) => {
      const queryKey = ['products', filters]

      queryClient.prefetchQuery({
        queryKey,
        queryFn: () => fetchProducts(filters),
        staleTime: 5 * 60 * 1000,
      })
    },
    [queryClient]
  )

  return { prefetch }
}

/* ------------------------------------------------------------------ */
/*  Hook useQuickAddToCart – ajout rapide via mutation                 */
/* ------------------------------------------------------------------ */

export function useQuickAddToCart() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      productId,
      quantity,
    }: {
      productId: string
      quantity: number
    }) => {
      // ✅ Vérifier si on est hors ligne
      if (typeof window !== 'undefined' && !navigator.onLine) {
        throw new Error('Vous êtes hors ligne. Impossible d\'ajouter au panier.')
      }

      const res = await fetch('/api/panier/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
      })

      if (!res.ok) {
        throw new Error('Erreur lors de l\'ajout au panier')
      }

      return res.json()
    },
    onSuccess: () => {
      // Invalider le panier après ajout
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  return mutation
}

/* ------------------------------------------------------------------ */
/*  Hook useProductById – récupération d'un produit unique             */
/* ------------------------------------------------------------------ */

export function useProductById(productId: string) {
  const cacheKey = `${CACHE_KEY_PREFIX}_single_${productId}`

  return useQuery<Product | null, Error>({
    queryKey: ['product', productId],
    queryFn: async () => {
      // ✅ Vérifier le cache local
      const cached = getCachedData(cacheKey)
      if (cached && cached.length > 0) {
        return cached[0]
      }

      if (typeof window !== 'undefined' && !navigator.onLine) {
        throw new Error('Vous êtes hors ligne.')
      }

      const res = await fetchWithTimeout(`/api/produits/${productId}`)

      if (!res.ok) {
        throw new Error('Produit introuvable')
      }

      const product = await res.json()

      // ✅ Mettre en cache
      if (product && isValidProduct(product)) {
        setCachedData(cacheKey, [product])
      }

      return product
    },
    enabled: !!productId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: MAX_RETRIES,
    networkMode: 'offlineFirst',
  })
}

/* ------------------------------------------------------------------ */
/*  Hook useProductsByCategory – alias pratique                        */
/* ------------------------------------------------------------------ */

export function useProductsByCategory(categoryPrefix: string) {
  return useProducts({ categorie_prefix: categoryPrefix })
}

/* ------------------------------------------------------------------ */
/*  Hook useFeaturedProducts – produits en vedette                     */
/* ------------------------------------------------------------------ */

export function useFeaturedProducts(limit: number = 10) {
  return useProducts({
    featured: true,
    pageSize: limit,
    sort_by: 'created_at',
    sort_order: 'desc',
  })
}

/* ------------------------------------------------------------------ */
/*  Hook usePromoProducts – produits en promotion                      */
/* ------------------------------------------------------------------ */

export function usePromoProducts(limit: number = 10) {
  return useProducts({
    est_promo: true,
    pageSize: limit,
    sort_by: 'remise_percent',
    sort_order: 'desc',
  })
}

/* ------------------------------------------------------------------ */
/*  Hook useNewArrivals – nouveaux produits                            */
/* ------------------------------------------------------------------ */

export function useNewArrivals(limit: number = 12) {
  return useProducts({
    pageSize: limit,
    sort_by: 'created_at',
    sort_order: 'desc',
  })
}