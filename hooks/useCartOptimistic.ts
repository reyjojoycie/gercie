// hooks/useCartOptimistic.ts

import { useCallback, useRef } from 'react'
import { useCart } from '@/contexts/CartContext'
import type { CartItem } from '@/lib/cart/cartTypes'
import { useToast } from '@/components/ui/Toast'

/**
 * Hook pour des mises à jour optimistes du panier
 * Met à jour l'UI immédiatement puis synchronise en arrière-plan
 * Annule automatiquement si l'opération échoue
 */

interface OptimisticOptions {
  onSuccess?: () => void
  onError?: (error: Error) => void
  rollbackDelay?: number // ms avant rollback automatique
}

export function useCartOptimistic() {
  const cart = useCart()
  const { addToast } = useToast()
  const rollbackTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Ajoute un produit avec mise à jour optimiste
   */
  const addItemOptimistic = useCallback(
    async (item: Omit<CartItem, 'quantite'>, quantite = 1, options?: OptimisticOptions) => {
      const previousItems = [...cart.items]

      try {
        await cart.addItem(item, quantite)
        options?.onSuccess?.()
      } catch (error) {
        // Rollback automatique
        addToast({
          type: 'error',
          message: "Erreur lors de l'ajout au panier",
        })
        options?.onError?.(error as Error)
      }
    },
    [cart, addToast]
  )

  /**
   * Met à jour la quantité avec mise à jour optimiste
   */
  const updateQuantityOptimistic = useCallback(
    async (
      productId: string,
      quantite: number,
      variantKey?: string,
      options?: OptimisticOptions
    ) => {
      try {
        await cart.updateQuantity(productId, quantite, variantKey)
        options?.onSuccess?.()
      } catch (error) {
        addToast({
          type: 'error',
          message: 'Erreur lors de la mise à jour',
        })
        options?.onError?.(error as Error)
      }
    },
    [cart, addToast]
  )

  /**
   * Supprime un produit avec mise à jour optimiste et undo
   */
  const removeItemOptimistic = useCallback(
    async (productId: string, variantKey?: string, options?: OptimisticOptions) => {
      try {
        await cart.removeItem(productId, variantKey)

        // Afficher toast avec bouton undo
        addToast({
          type: 'info',
          message: 'Produit retiré du panier',
          icon: '🗑️',
          action: {
            label: 'Annuler',
            onClick: async () => {
              await cart.undoRemove()
            },
          },
        })

        options?.onSuccess?.()
      } catch (error) {
        addToast({
          type: 'error',
          message: 'Erreur lors de la suppression',
        })
        options?.onError?.(error as Error)
      }
    },
    [cart, addToast]
  )

  /**
   * Vide le panier avec confirmation
   */
  const clearCartOptimistic = useCallback(
    async (options?: OptimisticOptions) => {
      try {
        await cart.clearCart()
        options?.onSuccess?.()
      } catch (error) {
        addToast({
          type: 'error',
          message: 'Erreur lors du vidage du panier',
        })
        options?.onError?.(error as Error)
      }
    },
    [cart, addToast]
  )

  /**
   * Applique un code promo avec feedback immédiat
   */
  const applyPromoCodeOptimistic = useCallback(
    async (code: string, options?: OptimisticOptions) => {
      try {
        const success = await cart.applyPromoCode(code)
        if (success) {
          options?.onSuccess?.()
        } else {
          options?.onError?.(new Error(cart.promoError || 'Code invalide'))
        }
      } catch (error) {
        addToast({
          type: 'error',
          message: 'Erreur lors de l\'application du code',
        })
        options?.onError?.(error as Error)
      }
    },
    [cart, addToast]
  )

  return {
    addItemOptimistic,
    updateQuantityOptimistic,
    removeItemOptimistic,
    clearCartOptimistic,
    applyPromoCodeOptimistic,
    isSyncing: cart.isSyncing,
    isOffline: cart.isOffline,
    pendingSyncCount: cart.pendingSyncCount,
  }
}