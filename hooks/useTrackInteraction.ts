// hooks/useTrackInteraction.ts
'use client'

import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

type InteractionType = 'view' | 'cart_add' | 'favorite' | 'purchase' | 'search_click'

export function useTrackInteraction() {
  const { user } = useAuth()

  const track = useCallback(
    async (productId: string, type: InteractionType, weight: number = 1) => {
      if (!user?.id || !productId) return

      // Appel non bloquant, on ignore les erreurs pour ne pas gêner l'utilisateur
      try {
        await fetch('/api/ai/track-interaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            interactionType: type,
            weight,
          }),
          // keepalive: true peut être utilisé si on veut que la requête survive à un changement de page,
          // mais il n'est pas supporté partout. On s'en passe ici.
        })
      } catch {
        // silencieux
      }
    },
    [user]
  )

  const trackView = useCallback((productId: string) => track(productId, 'view', 0.5), [track])
  const trackCartAdd = useCallback((productId: string) => track(productId, 'cart_add', 1), [track])
  const trackFavorite = useCallback((productId: string) => track(productId, 'favorite', 1.5), [track])
  const trackPurchase = useCallback((productIds: string[]) => {
    productIds.forEach(id => track(id, 'purchase', 3))
  }, [track])
  const trackSearchClick = useCallback((productId: string) => track(productId, 'search_click', 0.3), [track])

  return {
    trackView,
    trackCartAdd,
    trackFavorite,
    trackPurchase,
    trackSearchClick,
  }
}