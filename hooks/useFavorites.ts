// hooks/useFavorites.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useCallback } from 'react'

/**
 * Hook pour gérer les favoris de l'utilisateur.
 * - Récupère la liste des IDs favoris (depuis /api/favoris?list=true)
 * - Fournit des fonctions toggle/check optimisées.
 * - Cache de 2 minutes, pas de refetch intempestif.
 */
export function useFavorites() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Récupération des IDs favoris (pas tous les produits complets)
  const {
    data: favoriteIds = [],
    isLoading,
    error,
  } = useQuery<string[]>({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      if (!user) return []
      const res = await fetch('/api/favoris?list=true')
      if (!res.ok) throw new Error('Erreur chargement favoris')
      const data = await res.json()
      return data.favoriteIds ?? []   // suppose que l'API retourne { favoriteIds: string[] }
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,   // 2 minutes
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Vérifier si un produit est favori
  const isFavorite = useCallback(
    (productId: string) => favoriteIds.includes(productId),
    [favoriteIds]
  )

  // Mutation pour ajouter/supprimer un favori
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!user) throw new Error('Non connecté')
      if (favoriteIds.includes(productId)) {
        await fetch(`/api/favoris?produit_id=${productId}`, { method: 'DELETE' })
        return { productId, action: 'remove' as const }
      } else {
        await fetch('/api/favoris', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ produit_id: productId }),
        })
        return { productId, action: 'add' as const }
      }
    },
    onMutate: async (productId) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['favorites', user?.id] })
      const previous = queryClient.getQueryData<string[]>(['favorites', user?.id]) ?? []
      if (previous.includes(productId)) {
        queryClient.setQueryData(['favorites', user?.id], previous.filter(id => id !== productId))
      } else {
        queryClient.setQueryData(['favorites', user?.id], [...previous, productId])
      }
      return { previous }
    },
    onError: (err, productId, context) => {
      queryClient.setQueryData(['favorites', user?.id], context?.previous ?? [])
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] })
    },
  })

  const toggleFavorite = useCallback(
    async (productId: string) => {
      if (!user) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
        return
      }
      await toggleFavoriteMutation.mutateAsync(productId)
    },
    [user, toggleFavoriteMutation]
  )

  return {
    isFavorite,
    toggleFavorite,
    isLoading,
    error,
    favoriteIds,
  }
}