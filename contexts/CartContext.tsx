// contexts/CartContext.tsx
'use client'

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

/* ========================================================================== */
/*  Types enrichis                                                             */
/* ========================================================================== */

export interface VariantePanier {
  attributes: Record<string, string>
  prix?: number
}

export interface CartItem {
  id: string
  nom: string
  prix: number
  quantite: number
  image?: string
  specifications?: string
  variante?: VariantePanier
  prix_initial?: number
  remise?: number
  stock_disponible?: number
  addedAt?: number // Timestamp d'ajout
}

export interface PromoCode {
  code: string
  type: 'percent' | 'fixed'
  value: number
  minTotal?: number
  maxDiscount?: number
  expiresAt?: string
}

export interface CartSummary {
  sousTotal: number
  remiseTotal: number
  fraisLivraison: number
  total: number
  totalUSD: number | null
  nombreArticles: number
  poidsEstime?: number
  economie: number // Économie totale (remises + prix initial)
}

interface CartContextType {
  items: CartItem[]
  total: number
  itemCount: number
  loading: boolean
  isSyncing: boolean
  error: string | null

  addItem: (item: Omit<CartItem, 'quantite'>, quantite?: number) => Promise<void>
  removeItem: (id: string, variantKey?: string) => Promise<void>
  updateQuantity: (id: string, quantite: number, variantKey?: string) => Promise<void>
  clearCart: () => Promise<void>

  applyPromoCode: (code: string) => Promise<boolean>
  removePromoCode: () => void
  saveForLater: (id: string, variantKey?: string) => Promise<void>
  moveToCart: (id: string, variantKey?: string) => Promise<void>
  undoRemove: () => Promise<void>

  activePromo: PromoCode | null
  promoError: string | null
  savedItems: CartItem[]
  summary: CartSummary
  totalItems: number

  refetchCart: () => Promise<void>
  mergeLocalCart: () => Promise<void>
  
  // Nouveaux états
  isOffline: boolean
  pendingSyncCount: number
  lastUpdated: number | null
}

const CartContext = createContext<CartContextType | undefined>(undefined)

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

const CART_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const PRODUCTS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes
const UNDO_TIMEOUT = 15000 // 15 secondes
const DEBOUNCE_DELAY = 500 // 500ms pour debounce
const MAX_LOCAL_ITEMS = 100 // Limite pour éviter localStorage overflow
const FREE_DELIVERY_THRESHOLD = 50000 // CDF
const DELIVERY_FEE = 5000 // CDF

/* ========================================================================== */
/*  Provider                                                                   */
/* ========================================================================== */

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { rate } = useExchangeRate()
  const { addToast } = useToast()
  const isOnline = useOnlineStatus()
  const userId = user?.id

  // États locaux
  const [lastRemoved, setLastRemoved] = useState<CartItem | null>(null)
  const [lastRemovedVariantKey, setLastRemovedVariantKey] = useState<string | undefined>(undefined)
  const [promo, setPromo] = useState<PromoCode | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [savedItems, setSavedItems] = useState<CartItem[]>([])
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  // Refs pour debounce et cleanup
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingMutationsRef = useRef<Map<string, any>>(new Map())

  /* ========================================================================== */
  /*  1. Lecture du panier depuis Supabase                                       */
  /* ========================================================================== */

  const {
    data: panierRows = [],
    isLoading: loadingRemote,
    error: remoteError,
    refetch: refetchRemote,
  } = useQuery<
    { id: number; produit_id: string; quantite: number; variant_key?: string | null }[]
  >({
    queryKey: ['cart-raw', userId],
    queryFn: async () => {
      if (!userId) return []

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

      try {
        const { data, error } = await supabaseBrowser
          .from('pannier')
          .select('id, produit_id, quantite, variant_key')
          .eq('user_id', userId)
          .abortSignal(controller.signal)

        clearTimeout(timeoutId)

        if (error) {
          console.error('Erreur fetch panier:', error)
          throw new Error(error.message)
        }

        return data || []
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
          throw new Error('Timeout lors du chargement du panier')
        }
        throw err
      }
    },
    enabled: !!userId && isOnline,
    staleTime: CART_CACHE_TTL,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  })

  /* ========================================================================== */
  /*  2. Détails des produits (batch)                                           */
  /* ========================================================================== */

  const produitIds = useMemo(
    () => [...new Set(panierRows.map((r) => r.produit_id))],
    [panierRows]
  )

  const { data: produitsCache = {} } = useQuery<
    Record<string, { nom: string; prix: number; images: string[]; stock: number; prix_initial?: number }>
  >({
    queryKey: ['produits-batch-cart', produitIds],
    queryFn: async () => {
      if (produitIds.length === 0) return {}

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      try {
        const { data, error } = await supabaseBrowser
          .from('produits')
          .select('id, nom, prix, prix_comparatif, images, stock')
          .in('id', produitIds)
          .abortSignal(controller.signal)

        clearTimeout(timeoutId)

        if (error) {
          console.error('Erreur fetch produits:', error)
          throw new Error(error.message)
        }

        const map: Record<string, any> = {}
        ;(data || []).forEach((p: any) => {
          map[p.id] = {
            nom: p.nom,
            prix: p.prix,
            prix_initial: p.prix_initial,
            images: p.images || [],
            stock: p.stock,
          }
        })
        return map
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
          throw new Error('Timeout lors du chargement des produits')
        }
        throw err
      }
    },
    enabled: produitIds.length > 0 && isOnline,
    staleTime: PRODUCTS_CACHE_TTL,
    retry: 2,
  })

  /* ========================================================================== */
  /*  3. Fusion des données                                                     */
  /* ========================================================================== */

  const remoteItems: CartItem[] = useMemo(
    () =>
      panierRows.map((row) => {
        const produit = produitsCache[row.produit_id]
        return {
          id: row.produit_id,
          nom: produit?.nom || 'Produit inconnu',
          prix: produit?.prix || 0,
          prix_initial: produit?.prix_initial,
          quantite: row.quantite,
          image: produit?.images?.[0],
          specifications: undefined,
          variante: row.variant_key ? { attributes: JSON.parse(row.variant_key) } : undefined,
          stock_disponible: produit?.stock,
          addedAt: Date.now(), // TODO: stocker dans DB si besoin
        }
      }),
    [panierRows, produitsCache]
  )

  /* ========================================================================== */
  /*  4. Panier local (invité)                                                  */
  /* ========================================================================== */

  const [localItems, setLocalItems] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('gercie-cart-local')
      const items = raw ? JSON.parse(raw) : []
      // Validation et nettoyage
      return Array.isArray(items) ? items.slice(0, MAX_LOCAL_ITEMS) : []
    } catch (err) {
      console.error('Erreur lecture panier local:', err)
      return []
    }
  })

  useEffect(() => {
    if (!userId) {
      try {
        localStorage.setItem('gercie-cart-local', JSON.stringify(localItems))
      } catch (err) {
        console.error('Erreur sauvegarde panier local:', err)
        addToast({
          type: 'error',
          message: 'Impossible de sauvegarder le panier localement',
        })
      }
    }
  }, [localItems, userId, addToast])

  const items = userId ? remoteItems : localItems

  /* ========================================================================== */
  /*  5. Synchronisation (mutation optimisée)                                   */
  /* ========================================================================== */

  const syncMutation = useMutation({
    mutationFn: async (
      newItems: { produit_id: string; quantite: number; variant_key?: string }[]
    ) => {
      if (!userId) return

      // Upsert au lieu de delete+insert (beaucoup plus efficace)
      if (newItems.length === 0) {
        const { error } = await supabaseBrowser.from('pannier').delete().eq('user_id', userId)
        if (error) throw new Error(error.message)
        return
      }

      const rows = newItems.map((item) => ({
        user_id: userId,
        produit_id: item.produit_id,
        quantite: item.quantite,
        variant_key: item.variant_key ?? null,
      }))

      // Upsert (INSERT ... ON CONFLICT UPDATE)
      const { error } = await supabaseBrowser.from('pannier').upsert(rows, {
        onConflict: 'user_id,produit_id,variant_key',
      })

      if (error) throw new Error(error.message)
    },
    onMutate: async () => {
      setPendingSyncCount((c) => c + 1)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart-raw', userId] })
      setLastUpdated(Date.now())
    },
    onError: (err) => {
      console.error('Erreur synchronisation panier:', err)
      addToast({
        type: 'error',
        message: `Erreur de synchronisation : ${err.message}`,
      })
    },
    onSettled: () => {
      setPendingSyncCount((c) => Math.max(0, c - 1))
    },
  })

  /* ========================================================================== */
  /*  6. Helpers                                                                */
  /* ========================================================================== */

  const getVariantKey = useCallback((item: { id: string; variante?: VariantePanier }): string => {
    return item.variante ? JSON.stringify(item.variante.attributes) : ''
  }, [])

  const findIndex = useCallback(
    (list: CartItem[], productId: string, variantKey?: string) => {
      return list.findIndex((i) => i.id === productId && getVariantKey(i) === (variantKey ?? ''))
    },
    [getVariantKey]
  )

  // Debounce pour les updates rapides
  const debouncedSync = useCallback(
    (payload: any[]) => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
      syncTimeoutRef.current = setTimeout(() => {
        syncMutation.mutate(payload)
      }, DEBOUNCE_DELAY)
    },
    [syncMutation]
  )

  /* ========================================================================== */
  /*  7. Actions                                                                */
  /* ========================================================================== */

  const addItem = useCallback(
    async (newItem: Omit<CartItem, 'quantite'>, quantite = 1) => {
      const current = userId ? remoteItems : localItems
      const variantKey = getVariantKey(newItem as CartItem)
      const idx = findIndex(current, newItem.id, variantKey)

      let updated: CartItem[]
      if (idx !== -1) {
        updated = [...current]
        updated[idx] = { ...updated[idx], quantite: updated[idx].quantite + quantite }
      } else {
        updated = [
          ...current,
          {
            ...newItem,
            quantite,
            stock_disponible: produitsCache[newItem.id]?.stock,
            addedAt: Date.now(),
          },
        ]
      }

      // Vérification stock
      const produitStock = produitsCache[newItem.id]?.stock
      if (produitStock !== undefined && produitStock !== null) {
        const itemInCart = updated.find((i) => i.id === newItem.id && getVariantKey(i) === variantKey)
        if (itemInCart && itemInCart.quantite > produitStock) {
          itemInCart.quantite = produitStock
          addToast({
            type: 'warning',
            message: `Stock limité à ${produitStock} unités.`,
          })
        }
      }

      if (userId) {
        const payload = updated.map((i) => ({
          produit_id: i.id,
          quantite: i.quantite,
          variant_key: i.variante ? JSON.stringify(i.variante.attributes) : undefined,
        }))

        if (isOnline) {
          await syncMutation.mutateAsync(payload)
          addToast({
            type: 'success',
            message: `${newItem.nom} ajouté au panier`,
          })
        } else {
          // Mode offline : queue la mutation
          pendingMutationsRef.current.set(newItem.id, payload)
          setPendingSyncCount((c) => c + 1)
          addToast({
            type: 'info',
            message: `${newItem.nom} ajouté (synchronisation en attente)`,
          })
        }
      } else {
        // Limite pour éviter localStorage overflow
        if (updated.length > MAX_LOCAL_ITEMS) {
          addToast({
            type: 'warning',
            message: `Panier limité à ${MAX_LOCAL_ITEMS} articles`,
          })
          updated = updated.slice(0, MAX_LOCAL_ITEMS)
        }
        setLocalItems(updated)
        addToast({
          type: 'success',
          message: `${newItem.nom} ajouté au panier`,
        })
      }
    },
    [userId, remoteItems, localItems, getVariantKey, findIndex, produitsCache, syncMutation, isOnline, addToast]
  )

  const removeItem = useCallback(
    async (productId: string, variantKey?: string) => {
      const current = userId ? remoteItems : localItems
      const idx = findIndex(current, productId, variantKey)
      if (idx === -1) return

      // Undo logic
      setLastRemoved(current[idx])
      setLastRemovedVariantKey(variantKey)
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
      undoTimeoutRef.current = setTimeout(() => {
        setLastRemoved(null)
        setLastRemovedVariantKey(undefined)
      }, UNDO_TIMEOUT)

      const updated = current.filter((_, i) => i !== idx)
      
      if (userId) {
        const payload = updated.map((i) => ({
          produit_id: i.id,
          quantite: i.quantite,
          variant_key: i.variante ? JSON.stringify(i.variante.attributes) : undefined,
        }))

        if (isOnline) {
          await syncMutation.mutateAsync(payload)
          addToast({
            type: 'info',
            message: 'Produit retiré du panier',
            icon: '🗑️',
          })
        } else {
          pendingMutationsRef.current.set('remove_' + productId, payload)
          setPendingSyncCount((c) => c + 1)
          addToast({
            type: 'info',
            message: 'Produit retiré (synchronisation en attente)',
          })
        }
      } else {
        setLocalItems(updated)
        addToast({
          type: 'info',
          message: 'Produit retiré du panier',
          icon: '🗑️',
        })
      }
    },
    [userId, remoteItems, localItems, findIndex, syncMutation, isOnline, addToast]
  )

  const updateQuantity = useCallback(
    async (productId: string, quantite: number, variantKey?: string) => {
      if (quantite <= 0) {
        await removeItem(productId, variantKey)
        return
      }

      const current = userId ? remoteItems : localItems
      const idx = findIndex(current, productId, variantKey)
      if (idx === -1) return

      // Vérification stock
      const produitStock = produitsCache[productId]?.stock
      if (produitStock !== undefined && produitStock !== null && quantite > produitStock) {
        quantite = produitStock
        addToast({
          type: 'warning',
          message: `Stock limité à ${produitStock} unités.`,
        })
      }

      const updated = [...current]
      updated[idx] = { ...updated[idx], quantite }

      if (userId) {
        const payload = updated.map((i) => ({
          produit_id: i.id,
          quantite: i.quantite,
          variant_key: i.variante ? JSON.stringify(i.variante.attributes) : undefined,
        }))

        if (isOnline) {
          // Debounce pour éviter trop de requêtes
          debouncedSync(payload)
        } else {
          pendingMutationsRef.current.set('update_' + productId, payload)
          setPendingSyncCount((c) => c + 1)
        }
      } else {
        setLocalItems(updated)
      }
    },
    [userId, remoteItems, localItems, findIndex, produitsCache, removeItem, syncMutation, isOnline, debouncedSync, addToast]
  )

  const clearCart = useCallback(async () => {
    if (userId) {
      if (isOnline) {
        await syncMutation.mutateAsync([])
        addToast({
          type: 'success',
          message: 'Panier vidé',
        })
      } else {
        pendingMutationsRef.current.set('clear', [])
        setPendingSyncCount((c) => c + 1)
        addToast({
          type: 'info',
          message: 'Panier vidé (synchronisation en attente)',
        })
      }
    } else {
      setLocalItems([])
      localStorage.removeItem('gercie-cart-local')
      addToast({
        type: 'success',
        message: 'Panier vidé',
      })
    }
  }, [userId, syncMutation, isOnline, addToast])

  const undoRemove = useCallback(async () => {
    if (!lastRemoved) return
    await addItem(
      {
        id: lastRemoved.id,
        nom: lastRemoved.nom,
        prix: lastRemoved.prix,
        image: lastRemoved.image,
        specifications: lastRemoved.specifications,
        variante: lastRemoved.variante,
      },
      lastRemoved.quantite
    )
    setLastRemoved(null)
    setLastRemovedVariantKey(undefined)
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current)
    }
  }, [lastRemoved, addItem])

  const saveForLater = useCallback(
    async (productId: string, variantKey?: string) => {
      const current = userId ? remoteItems : localItems
      const idx = findIndex(current, productId, variantKey)
      if (idx === -1) return
      const item = current[idx]
      setSavedItems((prev) => [...prev, item])
      await removeItem(productId, variantKey)
      addToast({
        type: 'info',
        message: 'Article sauvegardé pour plus tard',
        icon: '📌',
      })
    },
    [userId, remoteItems, localItems, findIndex, removeItem, addToast]
  )

  const moveToCart = useCallback(
    async (productId: string, variantKey?: string) => {
      const item = savedItems.find(
        (i) => i.id === productId && getVariantKey(i) === (variantKey ?? '')
      )
      if (!item) return
      setSavedItems((prev) => prev.filter((i) => i.id !== productId || getVariantKey(i) !== (variantKey ?? '')))
      await addItem(
        {
          id: item.id,
          nom: item.nom,
          prix: item.prix,
          image: item.image,
          specifications: item.specifications,
          variante: item.variante,
        },
        item.quantite
      )
    },
    [savedItems, addItem, getVariantKey]
  )

  const applyPromoCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!code.trim()) {
        setPromoError('Veuillez entrer un code.')
        return false
      }
      setPromoError(null)

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        const res = await fetch('/api/promo/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            items: items.map((i) => i.id),
            total: items.reduce((acc, i) => acc + i.prix * i.quantite, 0),
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        const data = await res.json()

        if (!res.ok || !data.valid) {
          setPromoError(data.error || 'Code promo invalide')
          addToast({
            type: 'error',
            message: data.error || 'Code promo invalide',
          })
          return false
        }

        const newPromo: PromoCode = {
          code: data.code,
          type: data.type || 'percent',
          value: data.reduction_percent || data.value || 0,
          minTotal: data.minTotal,
          maxDiscount: data.maxDiscount,
          expiresAt: data.expiresAt,
        }

        setPromo(newPromo)
        setPromoError(null)
        addToast({
          type: 'success',
          message: `Code ${data.code} appliqué : -${newPromo.value}${newPromo.type === 'percent' ? '%' : ' CDF'}`,
        })
        return true
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setPromoError('Timeout lors de la validation')
          addToast({
            type: 'error',
            message: 'Timeout lors de la validation du code',
          })
        } else {
          setPromoError('Erreur lors de la validation du code.')
          addToast({
            type: 'error',
            message: 'Erreur réseau.',
          })
        }
        return false
      }
    },
    [items, addToast]
  )

  const removePromoCode = useCallback(() => {
    setPromo(null)
    setPromoError(null)
    addToast({
      type: 'info',
      message: 'Code promo retiré',
      icon: 'ℹ️',
    })
  }, [addToast])

  const mergeLocalCart = useCallback(async () => {
    if (!userId || localItems.length === 0) return

    addToast({
      type: 'info',
      message: 'Fusion du panier local en cours...',
    })

    for (const item of localItems) {
      await addItem(
        {
          id: item.id,
          nom: item.nom,
          prix: item.prix,
          image: item.image,
          specifications: item.specifications,
          variante: item.variante,
        },
        item.quantite
      )
    }

    setLocalItems([])
    localStorage.removeItem('gercie-cart-local')
    addToast({
      type: 'success',
      message: 'Panier local fusionné avec votre compte',
    })
  }, [userId, localItems, addItem, addToast])

  /* ========================================================================== */
  /*  8. Synchronisation au retour en ligne                                     */
  /* ========================================================================== */

  useEffect(() => {
    if (isOnline && userId && pendingMutationsRef.current.size > 0) {
      addToast({
        type: 'info',
        message: 'Synchronisation du panier en cours...',
      })

      // Synchroniser toutes les mutations en attente
      pendingMutationsRef.current.forEach((payload) => {
        syncMutation.mutate(payload)
      })

      pendingMutationsRef.current.clear()
      setPendingSyncCount(0)
    }
  }, [isOnline, userId, syncMutation, addToast])

  /* ========================================================================== */
  /*  9. Cleanup au démontage                                                   */
  /* ========================================================================== */

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [])

  /* ========================================================================== */
  /*  10. Résumé calculé                                                        */
  /* ========================================================================== */

  const summary = useMemo<CartSummary>(() => {
    const sousTotal = items.reduce((acc, i) => acc + i.prix * i.quantite, 0)
    const prixInitialTotal = items.reduce(
      (acc, i) => acc + (i.prix_initial || i.prix) * i.quantite,
      0
    )
    const economiePrix = prixInitialTotal - sousTotal

    let remiseTotal = 0
    if (promo) {
      if (promo.type === 'percent') {
        remiseTotal = Math.min(
          (sousTotal * promo.value) / 100,
          promo.maxDiscount ?? Infinity
        )
      } else if (promo.type === 'fixed') {
        remiseTotal = Math.min(sousTotal, promo.value)
      }
    }

    const fraisLivraison = sousTotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE
    const total = sousTotal - remiseTotal + fraisLivraison

    return {
      sousTotal,
      remiseTotal,
      fraisLivraison,
      total,
      totalUSD: rate ? total / rate : null,
      nombreArticles: items.length,
      poidsEstime: items.reduce((acc, i) => acc + i.quantite * 0.5, 0),
      economie: economiePrix + remiseTotal,
    }
  }, [items, promo, rate])

  const totalItems = useMemo(() => items.reduce((acc, i) => acc + i.quantite, 0), [items])

  /* ========================================================================== */
  /*  11. Valeur du contexte                                                    */
  /* ========================================================================== */

  const value = useMemo<CartContextType>(
    () => ({
      items,
      total: summary.total,
      itemCount: totalItems,
      loading: loadingRemote && !!userId,
      isSyncing: syncMutation.isPending || pendingSyncCount > 0,
      error: remoteError
        ? remoteError instanceof Error
          ? remoteError.message
          : 'Erreur panier'
        : null,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      applyPromoCode,
      removePromoCode,
      saveForLater,
      moveToCart,
      undoRemove,
      activePromo: promo,
      promoError,
      savedItems,
      summary,
      totalItems,
      refetchCart: refetchRemote,
      mergeLocalCart,
      isOffline: !isOnline,
      pendingSyncCount,
      lastUpdated,
    }),
    [
      items,
      summary,
      totalItems,
      loadingRemote,
      userId,
      syncMutation.isPending,
      pendingSyncCount,
      remoteError,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      applyPromoCode,
      removePromoCode,
      saveForLater,
      moveToCart,
      undoRemove,
      promo,
      promoError,
      savedItems,
      refetchRemote,
      mergeLocalCart,
      isOnline,
      lastUpdated,
    ]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

/* ========================================================================== */
/*  Hook                                                                       */
/* ========================================================================== */

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

export type { CartItem as CartItemType, VariantePanier }