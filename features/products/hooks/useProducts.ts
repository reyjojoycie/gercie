// features/products/hooks/useProducts.ts
'use client'

import { useQuery } from '@tanstack/react-query'

export interface Product {
  id: string
  nom: string
  description: string
  prix: number
  prix_usd?: number | null
  categorie: string
  stock: number
  negociable: boolean
  images: string[]
  video_url?: string | null
  variantes?: any[]
  est_actif: boolean
  created_at: string
  updated_at: string
}

interface UseProductsParams {
  search?: string
  categorie?: string
  categorie_prefix?: string
  min_price?: number
  max_price?: number
  sort_by?: 'prix' | 'created_at'
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export function useProducts(params: UseProductsParams = {}) {
  const queryString = new URLSearchParams()
  if (params.search) queryString.append('search', params.search)
  if (params.categorie) queryString.append('categorie', params.categorie)
  if (params.categorie_prefix) queryString.append('categorie_prefix', params.categorie_prefix)
  if (params.min_price) queryString.append('min_price', params.min_price.toString())
  if (params.max_price) queryString.append('max_price', params.max_price.toString())
  if (params.sort_by) queryString.append('sort_by', params.sort_by)
  if (params.sort_order) queryString.append('sort_order', params.sort_order)
  if (params.limit) queryString.append('limit', params.limit.toString())
  if (params.offset) queryString.append('offset', params.offset.toString())

  return useQuery<Product[]>({
    queryKey: ['products', params],
    queryFn: async () => {
      const res = await fetch(`/api/produits?${queryString.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Erreur de chargement des produits')
      }
      return res.json()
    },
    staleTime: 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
  })
}