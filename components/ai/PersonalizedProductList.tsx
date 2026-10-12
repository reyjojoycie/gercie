// components/ai/PersonalizedProductList.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import ProductCard from '@/components/ProductCard'
import { Skeleton } from '@/components/ui/Skeleton'

interface PersonalizedProduct {
  id: string
  nom: string
  prix: number
  images: string[]
  categorie?: string
  score: number
}

interface PersonalizedProductListProps {
  limit?: number
  showScores?: boolean
  className?: string
}

export default function PersonalizedProductList({
  limit = 10,
  showScores = false,
  className = '',
}: PersonalizedProductListProps) {
  const { user } = useAuth()
  const [products, setProducts] = useState<PersonalizedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      setProducts([])
      return
    }

    let cancelled = false
    const fetchRecommendations = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/ai/recommendations?limit=${limit}`, {
          credentials: 'include',
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Erreur de chargement')
        }
        // L'API renvoie { source, recommendations } ou directement un tableau ?
        // Selon notre implémentation précédente, elle renvoie { source, recommendations }.
        const recs = Array.isArray(data) ? data : data.recommendations || []
        if (!cancelled) {
          setProducts(recs)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Impossible de charger les recommandations.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRecommendations()
    return () => { cancelled = true }
  }, [user, limit])

  // Si l'utilisateur n'est pas connecté
  if (!user) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Connectez-vous pour recevoir des recommandations personnalisées.
        </p>
      </div>
    )
  }

  // État de chargement
  if (loading) {
    return (
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 ${className}`}>
        {Array.from({ length: limit }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-gray-100 dark:bg-gray-800 p-4 animate-pulse">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4 mt-3" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </div>
        ))}
      </div>
    )
  }

  // Erreur
  if (error) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  // Aucune recommandation (peut arriver si l'utilisateur n'a pas d'historique et le fallback est désactivé)
  if (products.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Aucune recommandation pour l’instant. Continuez à explorer le catalogue !
        </p>
      </div>
    )
  }

  // Liste de produits
  return (
    <div className={className}>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
        Recommandés pour vous
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <div key={product.id} className="relative">
            <ProductCard
              id={product.id}
              nom={product.nom}
              prix={product.prix}
              images={product.images}
              categorie={product.categorie}
            />
            {showScores && (
              <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded-full shadow">
                {Math.round(product.score * 100)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}