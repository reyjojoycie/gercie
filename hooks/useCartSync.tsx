// hooks/useCartSync.ts
'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'

/* ========================================================================== */
/*  Types enrichis                                                             */
/* ========================================================================== */

export interface VariantePanier {
  attributes: Record<string, string>
  prix?: number // surcoût ou prix spécifique
}

export interface CartItem {
  id: string            // produit_id
  nom: string
  prix: number
  quantite: number
  image?: string
  specifications?: string
  variante?: VariantePanier
  prix_initial?: number   // prix avant réduction
  remise?: number         // pourcentage de remise
  stock?: number          // stock disponible
}

interface PanierRow {
  id?: number
  user_id: string
  produit_id: string
  quantite: number
  variant_key?: string | null
}

interface ProduitCache {
  [id: string]: {
    nom: string
    prix: number
    images: string[]
    stock: number | null
    prix_initial?: number
    remise?: number
  }
}

export interface PromoCode {
  code: string
  type: 'percent' | 'fixed'
  value: number
  minTotal?: number
  maxDiscount?: number
}

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

function rowToCartItem(row: PanierRow, produit?: ProduitCache[string]): CartItem {
  return {
    id: row.produit_id,
    nom: produit?.nom ?? 'Produit inconnu',
    prix: produit?.prix ?? 0,
    quantite: row.quantite,
    image: produit?.images?.[0],
    specifications: undefined,
    variante: row.variant_key ? { attributes: JSON.parse(row.variant_key) } : undefined,
    prix_initial: produit?.prix_initial,
    remise: produit?.remise,
    stock: produit?.stock ?? undefined,
  }
}

function getItemKey(item: { id: string; variant_key?: string | null }): string {
  return `${item.id}|${item.variant_key ?? ''}`
}

/* ========================================================================== */
/*  Hook useCartSync (ultra‑premium)                                           */
/* ========================================================================== */

export function useCartSync() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id
  const toast = useToast()
  const { rate } = useExchangeRate()

  // 1. Lecture du panier depuis Supabase
  const {
    data: panierRows = [],
    isLoading: loadingRemote,
    error: remoteError,
    refetch: refetchCart,
  } = useQuery<PanierRow[]>({
    queryKey: ['cart-raw', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabaseBrowser
        .from('pannier')
        .select('id, produit_id, quantite, variant_key')
        .eq('user_id', userId)

      if (error) throw new Error(error.message)
      return (data as PanierRow[]) ?? []
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  // 2. Détails des produits (batch, enrichi avec stock et remises)
  const produitIds = useMemo(
    () => [...new Set(panierRows.map(r => r.produit_id))],
    [panierRows]
  )

  const { data: produitsCache = {} } = useQuery<ProduitCache>({
    queryKey: ['produits-batch', produitIds],
    queryFn: async () => {
      if (produitIds.length === 0) return {}
      const { data, error } = await supabaseBrowser
        .from('produits')
        .select('id, nom, prix, images, stock, prix_comparatif, remise')
        .in('id', produitIds)

      if (error) throw new Error(error.message)

      const map: ProduitCache = {}
      ;(data || []).forEach((p: any) => {
        map[p.id] = {
          nom: p.nom,
          prix: p.prix,
          images: p.images || [],
          stock: p.stock ?? null,
          prix_initial: p.prix_initial,
          remise: p.remise,
        }
      })
      return map
    },
    enabled: produitIds.length > 0,
    staleTime: 1000 * 60 * 5,
  })

  // 3. Fusion
  const remoteItems: CartItem[] = useMemo(
    () => panierRows.map(row => rowToCartItem(row, produitsCache[row.produit_id])),
    [panierRows, produitsCache]
  )

  // 4. Panier local (invité) – enrichi avec migration automatique au login
  const [localItems, setLocalItems] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('gercie-cart-local')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (!userId) {
      localStorage.setItem('gercie-cart-local', JSON.stringify(localItems))
    }
  }, [localItems, userId])

  // Fusion automatique du panier local quand l'utilisateur se connecte
  const hasMerged = useRef(false)
  useEffect(() => {
    if (userId && !hasMerged.current && localItems.length > 0) {
      // Fusionner le panier local vers le distant
      hasMerged.current = true
      mergeLocalToRemote(localItems)
    }
  }, [userId]) // eslint-disable-line

  const mergeLocalToRemote = async (local: CartItem[]) => {
    // On va ajouter chaque article local au panier distant via addItem (qui gère la fusion)
    for (const item of local) {
      await addItem(item)
    }
    setLocalItems([])
    localStorage.removeItem('gercie-cart-local')
    toast.addToast({ type: 'success', message: 'Votre panier local a été fusionné avec votre compte.' })
  }

  const items: CartItem[] = userId ? remoteItems : localItems

  // 5. Synchronisation
  const syncMutation = useMutation({
    mutationFn: async (newItems: { produit_id: string; quantite: number; variant_key?: string }[]) => {
      if (!userId) return

      const { error: deleteError } = await supabaseBrowser
        .from('pannier')
        .delete()
        .eq('user_id', userId)
      if (deleteError) throw new Error(deleteError.message)

      if (newItems.length > 0) {
        const rows = newItems.map(item => ({
          user_id: userId,
          produit_id: item.produit_id,
          quantite: item.quantite,
          variant_key: item.variant_key ?? null,
        }))
        const { error: insertError } = await supabaseBrowser
          .from('pannier')
          .insert(rows)
        if (insertError) throw new Error(insertError.message)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart-raw', userId] })
    },
    onError: (err: Error) => {
      toast.addToast({ type: 'error', message: `Erreur de synchronisation du panier: ${err.message}` })
    },
  })

  // 6. Actions avec gestion de stock, notifications, undo…
  const [lastRemovedItem, setLastRemovedItem] = useState<CartItem | null>(null)
  const [lastRemovedVariantKey, setLastRemovedVariantKey] = useState<string | undefined>(undefined)
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const addItem = useCallback(
    async (newItem: CartItem) => {
      const current = userId ? remoteItems : localItems
      const key = getItemKey({
        id: newItem.id,
        variant_key: newItem.variante ? JSON.stringify(newItem.variante.attributes) : '',
      })
      const existingIdx = current.findIndex(
        i =>
          getItemKey({ id: i.id, variant_key: i.variante ? JSON.stringify(i.variante.attributes) : '' }) === key
      )

      let updated: CartItem[]
      if (existingIdx !== -1) {
        updated = [...current]
        const existing = updated[existingIdx]
        const newQty = existing.quantite + newItem.quantite
        // Vérification du stock
        const stockLimit = produitsCache[newItem.id]?.stock
        const finalQty = stockLimit != null ? Math.min(newQty, stockLimit) : newQty
        if (stockLimit != null && finalQty < newQty) {
          toast.addToast({ type: 'warning', message: `Stock limité à ${stockLimit}.` })
        }
        updated[existingIdx] = { ...existing, quantite: finalQty }
      } else {
        const stockLimit = produitsCache[newItem.id]?.stock
        const initQty = Math.min(newItem.quantite, stockLimit ?? Infinity)
        if (stockLimit != null && initQty < newItem.quantite) {
          toast.addToast({ type: 'warning', message: `Quantité ajustée au stock (${stockLimit}).` })
        }
        updated = [...current, { ...newItem, quantite: initQty }]
      }

      if (userId) {
        const payload = updated.map(i => ({
          produit_id: i.id,
          quantite: i.quantite,
          variant_key: i.variante ? JSON.stringify(i.variante.attributes) : undefined,
        }))
        await syncMutation.mutateAsync(payload)
        toast.addToast({ type: 'success', message: `${newItem.nom} ajouté au panier` })
      } else {
        setLocalItems(updated)
        toast.addToast({ type: 'success', message: `${newItem.nom} ajouté au panier local` })
      }
    },
    [userId, remoteItems, localItems, syncMutation, toast, produitsCache]
  )

  const removeItem = useCallback(
    async (productId: string, variantKey?: string) => {
      const current = userId ? remoteItems : localItems
      const itemToRemove = current.find(i => {
        const currentKey = i.variante ? JSON.stringify(i.variante.attributes) : ''
        return i.id === productId && currentKey === (variantKey ?? '')
      })
      if (!itemToRemove) return

      // Sauvegarde pour undo
      setLastRemovedItem(itemToRemove)
      setLastRemovedVariantKey(variantKey)
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
      undoTimeoutRef.current = setTimeout(() => {
        setLastRemovedItem(null)
        setLastRemovedVariantKey(undefined)
      }, 15000) // 15 secondes

      const updated = current.filter(i => {
        const currentKey = i.variante ? JSON.stringify(i.variante.attributes) : ''
        return !(i.id === productId && currentKey === (variantKey ?? ''))
      })

      if (userId) {
        const payload = updated.map(i => ({
          produit_id: i.id,
          quantite: i.quantite,
          variant_key: i.variante ? JSON.stringify(i.variante.attributes) : undefined,
        }))
        await syncMutation.mutateAsync(payload)
        toast.addToast({
          type: 'info',
          message: `${itemToRemove.nom} retiré`,
          actions: (
            <button
              onClick={undoRemove}
              className="text-gold-400 font-medium hover:underline text-sm"
            >
              Annuler
            </button>
          ),
        })
      } else {
        setLocalItems(updated)
      }
    },
    [userId, remoteItems, localItems, syncMutation, toast]
  )

  const updateQuantity = useCallback(
    async (productId: string, quantite: number, variantKey?: string) => {
      if (quantite <= 0) {
        await removeItem(productId, variantKey)
        return
      }
      const current = userId ? remoteItems : localItems
      const idx = current.findIndex(i => {
        const currentKey = i.variante ? JSON.stringify(i.variante.attributes) : ''
        return i.id === productId && currentKey === (variantKey ?? '')
      })
      if (idx === -1) return

      const stockLimit = produitsCache[productId]?.stock
      const finalQty = stockLimit != null ? Math.min(quantite, stockLimit) : quantite
      if (stockLimit != null && finalQty < quantite) {
        toast.addToast({ type: 'warning', message: `Stock limité à ${stockLimit}.` })
      }

      const updated = [...current]
      updated[idx] = { ...updated[idx], quantite: finalQty }

      if (userId) {
        const payload = updated.map(i => ({
          produit_id: i.id,
          quantite: i.quantite,
          variant_key: i.variante ? JSON.stringify(i.variante.attributes) : undefined,
        }))
        await syncMutation.mutateAsync(payload)
      } else {
        setLocalItems(updated)
      }
    },
    [userId, remoteItems, localItems, removeItem, syncMutation, toast, produitsCache]
  )

  const clearCart = useCallback(async () => {
    if (userId) {
      await syncMutation.mutateAsync([])
    } else {
      setLocalItems([])
      localStorage.removeItem('gercie-cart-local')
    }
    toast.addToast({ type: 'info', message: 'Panier vidé' })
  }, [userId, syncMutation, toast])

  // Undo
  const undoRemove = useCallback(async () => {
    if (lastRemovedItem) {
      await addItem(lastRemovedItem)
      setLastRemovedItem(null)
      setLastRemovedVariantKey(undefined)
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current)
      }
      toast.addToast({ type: 'success', message: `${lastRemovedItem.nom} restauré` })
    }
  }, [lastRemovedItem, addItem, toast])

  // Sauvegarder pour plus tard (wishlist locale)
  const [savedForLater, setSavedForLater] = useState<CartItem[]>([])

  const saveForLater = useCallback(
    async (productId: string, variantKey?: string) => {
      const current = userId ? remoteItems : localItems
      const item = current.find(i => {
        const currentKey = i.variante ? JSON.stringify(i.variante.attributes) : ''
        return i.id === productId && currentKey === (variantKey ?? '')
      })
      if (!item) return
      setSavedForLater(prev => [...prev, item])
      await removeItem(productId, variantKey)
      toast.addToast({ type: 'info', message: 'Article sauvegardé pour plus tard' })
    },
    [userId, remoteItems, localItems, removeItem, toast]
  )

  const moveToCart = useCallback(
    async (productId: string, variantKey?: string) => {
      const idx = savedForLater.findIndex(i => {
        const currentKey = i.variante ? JSON.stringify(i.variante.attributes) : ''
        return i.id === productId && currentKey === (variantKey ?? '')
      })
      if (idx === -1) return
      const item = savedForLater[idx]
      setSavedForLater(prev => prev.filter((_, i) => i !== idx))
      await addItem(item)
    },
    [savedForLater, addItem]
  )

  // 7. Totaux & résumé (avec code promo)
  const [promo, setPromo] = useState<PromoCode | null>(null)

  const applyPromo = useCallback(
    (code: string) => {
      // Simulation : en production, appel API
      const codes: Record<string, PromoCode> = {
        BIENVENUE10: { code: 'BIENVENUE10', type: 'percent', value: 10, maxDiscount: 5000 },
        LIVRAISON0: { code: 'LIVRAISON0', type: 'fixed', value: 5000, minTotal: 10000 },
      }
      const match = codes[code.toUpperCase()]
      if (match) {
        setPromo(match)
        toast.addToast({ type: 'success', message: `Code ${match.code} appliqué !` })
        return true
      } else {
        toast.addToast({ type: 'error', message: 'Code promo invalide' })
        return false
      }
    },
    [toast]
  )

  const removePromo = useCallback(() => {
    setPromo(null)
    toast.addToast({ type: 'info', message: 'Code promo retiré' })
  }, [toast])

  const sousTotal = useMemo(() => items.reduce((acc, i) => acc + i.prix * i.quantite, 0), [items])
  const reduction = useMemo(() => {
    if (!promo) return 0
    if (promo.type === 'percent') {
      return Math.min((sousTotal * promo.value) / 100, promo.maxDiscount ?? Infinity)
    }
    return Math.min(sousTotal, promo.value)
  }, [sousTotal, promo])

  const total = sousTotal - reduction
  const totalUSD = rate ? total / rate : null
  const itemCount = useMemo(() => items.reduce((acc, i) => acc + i.quantite, 0), [items])

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    total,
    itemCount,
    loading: loadingRemote,
    isSyncing: syncMutation.isPending,
    error: remoteError ? (remoteError instanceof Error ? remoteError.message : 'Erreur panier') : null,
    refetchCart,
    // Nouveaux exports
    applyPromo,
    removePromo,
    promo,
    reduction,
    sousTotal,
    totalUSD,
    rate,
    undoRemove,
    lastRemovedItem,
    saveForLater,
    savedForLater,
    moveToCart,
  }
}