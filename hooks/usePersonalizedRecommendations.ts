// hooks/usePersonalizedRecommendations.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export interface PersonalizedProduct {
  id: string
  nom: string
  prix: number
  images: string[]
  categorie?: string
  score?: number
  vendeur?: { boutique_nom: string }
}

export function usePersonalizedRecommendations(limit: number = 10) {
  const { user } = useAuth()
  const [products, setProducts] = useState<PersonalizedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRecommendations = useCallback(async () => {
    if (!user) {
      setProducts([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/ai/recommendations?limit=${limit}`, {
        credentials: 'include',
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Erreur de chargement')

      // L'API renvoie { recommendations: [...] } ou directement le tableau selon l'implémentation
      const recs = Array.isArray(data) ? data : data.recommendations || []
      setProducts(recs)
    } catch (err: any) {
      setError(err.message || 'Impossible de charger les recommandations.')
    } finally {
      setLoading(false)
    }
  }, [user, limit])

  useEffect(() => {
    fetchRecommendations()
  }, [fetchRecommendations])

  return {
    products,
    loading,
    error,
    refresh: fetchRecommendations,
  }
}