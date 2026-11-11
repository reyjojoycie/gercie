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
  type ReactNode,
} from 'react'

import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

import type {
  DeliveryModeId,
  ProductDeliveryConfig,
  ShippingCartItem,
  ShippingQuote,
} from '@/lib/shipping-utils'

import {
  calculateShippingQuote,
  DELIVERY_MODE_IDS,
  normalizeProductDeliveryConfig,
} from '@/lib/shipping-utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface VariantePanier {
  id?: string
  attributes: Record<string, string>
  prix?: number
  prix_specifique?: number
  prix_specifique_usd?: number | null
  prix_specifique_cdf?: number | null
  image?: string | null
  images?: string[]
  stock?: number
  poids_kg?: number | null
}

export interface CartItem {
  id: string
  product_id?: string
  nom: string
  prix: number
  prix_usd?: number | null
  quantite: number
  image?: string
  specifications?: string
  variante?: VariantePanier | null
  prix_initial?: number
  prix_initial_usd?: number | null
  remise?: number
  stock_disponible?: number
  stock?: number
  addedAt?: number

  delivery_config?: ProductDeliveryConfig | null
  poids_kg?: number | null
  logistics_group?: string | null
  non_consolidable?: boolean
  unit_price_usd?: number | null

  [key: string]: any
}

export type AddCartItemInput = Omit<CartItem, 'quantite'> & {
  quantite?: number
}

export interface PromoCode {
  code: string
  type: 'percent' | 'fixed'
  value: number

  minTotalUsd?: number
  maxDiscountUsd?: number

  // Alias pour compatibilité ancien code
  minTotal?: number
  maxDiscount?: number

  expiresAt?: string
  description?: string

  valid?: boolean
  remainingToMinUsd?: number
  message?: string

  maxUtilisations?: number
  utilisationsActuelles?: number

  reductionUsd?: number
}

export interface PromoApplyResult {
  success: boolean
  error?: string
  promo?: PromoCode | null
}

export interface CartSummary {
  sousTotal: number
  sousTotalUSD: number
  remiseTotal: number
  remiseTotalUSD: number
  fraisLivraison: number
  total: number
  totalUSD: number | null
  nombreArticles: number
  totalItems: number
  poidsEstime?: number
  economie: number

  shippingEstimateUsd?: number
  shippingEstimateCdf?: number
  shippingQuote?: ShippingQuote | null
  hasNonConsolidableItems?: boolean
  deliveryWarnings?: string[]

  promoValid?: boolean
  promoMinTotalUsd?: number
  promoMaxDiscountUsd?: number
  promoRemainingUsd?: number
  promoRequirementMessage?: string | null
  promoReductionUsd?: number
}

export interface CartContextType {
  items: CartItem[]
  total: number
  itemCount: number
  loading: boolean
  isSyncing: boolean
  error: string | null

  addItem: (item: AddCartItemInput, quantite?: number) => Promise<void>
  addToCart: (item: AddCartItemInput, quantite?: number) => Promise<void>
  removeItem: (id: string, variantKey?: string) => Promise<void>
  updateQuantity: (id: string, quantite: number, variantKey?: string) => Promise<void>
  clearCart: () => Promise<void>

  applyPromoCode: (code: string) => Promise<PromoApplyResult>
  removePromoCode: () => Promise<void>

  saveForLater: (id: string, variantKey?: string) => Promise<void>
  moveToCart: (id: string, variantKey?: string) => Promise<void>
  removeSavedItem: (id: string, variantKey?: string) => void
  clearSavedItems: () => void

  undoRemove: () => Promise<void>

  activePromo: PromoCode | null
  promoError: string | null
  savedItems: CartItem[]
  summary: CartSummary
  totalItems: number

  refetchCart: () => Promise<void>
  mergeLocalCart: () => Promise<void>

  isOffline: boolean
  pendingSyncCount: number
  lastUpdated: number | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const CART_CACHE_TTL = 5 * 60 * 1000
const PRODUCTS_CACHE_TTL = 10 * 60 * 1000
const UNDO_TIMEOUT = 15000
const DEBOUNCE_DELAY = 500
const MAX_LOCAL_ITEMS = 100
const LOCAL_CART_KEY = 'gercie-cart-local'
const LOCAL_PROMO_KEY = 'gercie-promo-active'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toPositiveNumber(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function firstPositive(...values: unknown[]): number {
  for (const value of values) {
    const n = toPositiveNumber(value)
    if (n > 0) return n
  }
  return 0
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  return Math.round(value + Number.EPSILON)
}

function formatUsdSimple(value: number): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '$0.00'
  return `$${n.toFixed(2)}`
}

function safeJsonParse(value: any): Record<string, string> | undefined {
  if (!value) return undefined

  if (typeof value === 'object') {
    return value as Record<string, string>
  }

  try {
    const parsed = JSON.parse(String(value))
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, string>
    }
  } catch {
    // ignore
  }

  return undefined
}

function normalizeVariantKeyRaw(value: any): string {
  if (!value) return ''

  const str = String(value).trim()
  if (!str || str === '{}') return ''

  return str
}

function getVariantKeyFromItem(item: {
  variante?: VariantePanier | null
}): string {
  if (!item?.variante?.attributes) return ''

  const attrs = item.variante.attributes

  if (!attrs || typeof attrs !== 'object') return ''

  const entries = Object.entries(attrs).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false
    return String(value).trim() !== ''
  })

  if (entries.length === 0) return ''

  // Canonical order to avoid duplicate variant keys.
  entries.sort(([a], [b]) => a.localeCompare(b))

  try {
    return JSON.stringify(Object.fromEntries(entries))
  } catch {
    return ''
  }
}

function normalizeVariantKeyCanonical(value: any): string {
  const raw = normalizeVariantKeyRaw(value)
  if (!raw) return ''

  const attrs = safeJsonParse(raw)
  if (!attrs || Object.keys(attrs).length === 0) return ''

  return getVariantKeyFromItem({ variante: { attributes: attrs } })
}

function makeCartItemKey(produitId: string, variantKey: any): string {
  return `${produitId}|${normalizeVariantKeyCanonical(variantKey)}`
}

function isExpiredDate(value?: string | null): boolean {
  if (!value) return false

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  return date < new Date()
}

function isSchemaLikeError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()
  const code = String(error?.code || '')

  return (
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('is not a column') ||
    message.includes('validate_promo_code') ||
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST202' ||
    code === 'PGRST204'
  )
}

function resolveRate(exchange: any): number | null {
  const candidates = [
    exchange?.rate,
    exchange?.usdRate,
    exchange?.data?.rate,
    exchange?.data?.current?.rate,
    exchange,
  ]

  for (const candidate of candidates) {
    const n = Number(candidate)
    if (Number.isFinite(n) && n > 0) return n
  }

  return null
}

function resolveOnlineStatus(status: unknown): boolean {
  if (typeof status === 'boolean') return status

  if (status && typeof status === 'object') {
    const record = status as Record<string, unknown>

    if (typeof record.isOnline === 'boolean') return record.isOnline
    if (typeof record.online === 'boolean') return record.online
  }

  return true
}

function resolvePricePair(
  usdSource: number,
  cdfSource: number,
  rate: number | null
): { usd: number; cdf: number } {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let usd = usdSource > 0 ? usdSource : 0
  let cdf = cdfSource > 0 ? cdfSource : 0

  /**
   * USD = source principale.
   * Si USD existe, le CDF est toujours recalculé depuis USD.
   */
  if (usd > 0) {
    cdf = rateOk ? roundCdf(usd * rateNum) : 0
  } else if (cdf > 0 && rateOk) {
    /**
     * Legacy : seulement un CDF existe.
     * On dérive un USD temporaire pour rester cohérent.
     */
    usd = roundUsd(cdf / rateNum)
  }

  return {
    usd: roundUsd(usd),
    cdf: roundCdf(cdf),
  }
}

function resolveUnitPrices(
  item: CartItem | AddCartItemInput,
  rate: number | null
): { usd: number; cdf: number } {
  const anyItem = item as any

  const usdSource = firstPositive(
    anyItem.prix_usd,
    anyItem.unit_price_usd,
    anyItem.variante?.prix_specifique_usd
  )

  const cdfSource = firstPositive(
    anyItem.prix,
    anyItem.prix_cdf,
    anyItem.variante?.prix_specifique_cdf,
    anyItem.variante?.prix_specifique,
    anyItem.variante?.prix
  )

  return resolvePricePair(usdSource, cdfSource, rate)
}

function normalizeCartItemForDisplay(
  item: CartItem,
  rate: number | null
): CartItem {
  const { usd, cdf } = resolveUnitPrices(item, rate)

  return {
    ...item,
    prix: cdf,
    prix_usd: usd > 0 ? usd : null,
    unit_price_usd: usd > 0 ? usd : null,
  }
}

function prepareCartItemInput(
  item: AddCartItemInput,
  rate: number | null
): AddCartItemInput {
  const { usd, cdf } = resolveUnitPrices(item, rate)

  return {
    ...item,
    prix: cdf,
    prix_usd: usd > 0 ? usd : null,
    unit_price_usd: usd > 0 ? usd : null,
  }
}

function safeQuantity(value: any): number {
  return Math.max(1, Math.floor(Number(value ?? 1) || 1))
}

function normalizePromoRow(row: any): PromoCode | null {
  if (!row) return null

  const code = String(row.code || '').trim().toUpperCase()
  if (!code) return null

  const rawType = String(
    row.type || row.kind || row.discount_type || ''
  ).toLowerCase()

  let type: 'percent' | 'fixed' = 'percent'

  if (rawType === 'fixed') {
    type = 'fixed'
  } else if (rawType === 'percent') {
    type = 'percent'
  } else if (row.reduction_percent != null) {
    type = 'percent'
  } else if (toPositiveNumber(row.value) > 99) {
    type = 'fixed'
  }

  const value = toPositiveNumber(
    row.value ??
      row.reduction_percent ??
      row.valeur ??
      row.discount ??
      row.remise ??
      0
  )

  const minTotalUsd = toPositiveNumber(
    row.min_total_usd ?? row.min_total ?? row.minTotal ?? 0
  )

  const maxDiscountUsd = toPositiveNumber(
    row.max_discount_usd ?? row.max_discount ?? row.maxDiscount ?? 0
  )

  const expiresAt =
    row.expires_at ??
    row.expiresAt ??
    row.expiration_date ??
    undefined

  const maxUtilisations =
    row.max_utilisations ??
    row.max_utilisation ??
    1

  const utilisationsActuelles =
    row.utilisations_actuelles ??
    row.utilisation_actuelle ??
    0

  const actif = row.actif !== false
  const expired = isExpiredDate(expiresAt)
  const exhausted =
    toPositiveNumber(maxUtilisations) > 0 &&
    toPositiveNumber(utilisationsActuelles) >=
      toPositiveNumber(maxUtilisations)

  return {
    code,
    type,
    value,
    minTotalUsd,
    maxDiscountUsd,
    minTotal: minTotalUsd,
    maxDiscount: maxDiscountUsd,
    expiresAt: expiresAt || undefined,
    description: row.description || undefined,
    valid: actif && !expired && !exhausted,
    maxUtilisations: toPositiveNumber(maxUtilisations) || undefined,
    utilisationsActuelles: toPositiveNumber(utilisationsActuelles),
    message: !actif
      ? 'Ce code promo est désactivé.'
      : expired
        ? 'Ce code promo a expiré.'
        : exhausted
          ? 'Ce code promo a atteint sa limite d’utilisation.'
          : undefined,
  }
}

function normalizeRpcPromoResult(data: any): PromoCode | null {
  if (!data) return null

  let parsed = data

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object') return null

  const code = String(parsed.code || '').trim().toUpperCase()
  if (!code) return null

  const type: 'percent' | 'fixed' =
    parsed.type === 'fixed' ? 'fixed' : 'percent'

  const value = toPositiveNumber(
    parsed.value ??
      parsed.value_usd ??
      parsed.reduction_percent ??
      0
  )

  const minTotalUsd = toPositiveNumber(
    parsed.min_total_usd ??
      parsed.minTotal ??
      0
  )

  const maxDiscountUsd = toPositiveNumber(
    parsed.max_discount_usd ??
      parsed.maxDiscount ??
      0
  )

  const expiresAt =
    parsed.expires_at ??
    parsed.expiresAt ??
    undefined

  const remainingToMinUsd = toPositiveNumber(
    parsed.remaining_to_min_usd ?? 0
  )

  const valid = Boolean(parsed.valid)

  return {
    code,
    type,
    value,
    minTotalUsd,
    maxDiscountUsd,
    minTotal: minTotalUsd,
    maxDiscount: maxDiscountUsd,
    expiresAt: expiresAt || undefined,
    description: parsed.description || undefined,
    valid,
    remainingToMinUsd,
    message: parsed.message || undefined,
    maxUtilisations: toPositiveNumber(parsed.max_utilisations) || undefined,
    utilisationsActuelles: toPositiveNumber(parsed.utilisations_actuelles),
    reductionUsd: valid ? toPositiveNumber(parsed.reduction_usd) : undefined,
  }
}

function calculateSubtotalUsd(
  items: CartItem[],
  rate: number | null
): number {
  const total = items.reduce((acc, item) => {
    const quantity = safeQuantity(item.quantite)
    const { usd } = resolveUnitPrices(item, rate)
    return acc + usd * quantity
  }, 0)

  return roundUsd(total)
}

function calculateSubtotalCdf(
  items: CartItem[],
  rate: number | null
): number {
  const total = items.reduce((acc, item) => {
    const quantity = safeQuantity(item.quantite)
    const { cdf } = resolveUnitPrices(item, rate)
    return acc + cdf * quantity
  }, 0)

  return roundCdf(total)
}

function safeNormalizeProductDeliveryConfig(
  config: any,
  legacy: any,
  rate: number | null
): ProductDeliveryConfig | null {
  try {
    return normalizeProductDeliveryConfig(config, legacy, rate)
  } catch {
    return null
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTEXT                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const CartContext = createContext<CartContextType | undefined>(undefined)

/* ═══════════════════════════════════════════════════════════════ */
/*  PROVIDER                                                       */
/* ═══════════════════════════════════════════════════════════════ */

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const exchange = useExchangeRate() as any
  const rate = useMemo(() => resolveRate(exchange), [exchange])

  const toast = useToast() as any
  const onlineStatus = useOnlineStatus() as unknown
  const isOnline = useMemo(
    () => resolveOnlineStatus(onlineStatus),
    [onlineStatus]
  )

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const userId = user?.id

  const [lastRemoved, setLastRemoved] = useState<CartItem | null>(null)
  const [lastRemovedVariantKey, setLastRemovedVariantKey] = useState<
    string | undefined
  >(undefined)

  const [promo, setPromo] = useState<PromoCode | null>(() => {
    if (typeof window === 'undefined') return null

    try {
      const raw = window.localStorage.getItem(LOCAL_PROMO_KEY)
      if (!raw) return null

      const parsed = JSON.parse(raw)

      if (!parsed || typeof parsed !== 'object') return null
      if (!parsed.code) return null

      if (isExpiredDate(parsed.expiresAt)) return null

      return {
        ...parsed,
        code: String(parsed.code).toUpperCase(),
        type: parsed.type === 'fixed' ? 'fixed' : 'percent',
        value: toPositiveNumber(parsed.value),
        minTotalUsd: toPositiveNumber(parsed.minTotalUsd ?? parsed.minTotal),
        maxDiscountUsd: toPositiveNumber(
          parsed.maxDiscountUsd ?? parsed.maxDiscount
        ),
        minTotal: toPositiveNumber(parsed.minTotalUsd ?? parsed.minTotal),
        maxDiscount: toPositiveNumber(
          parsed.maxDiscountUsd ?? parsed.maxDiscount
        ),
        valid: parsed.valid !== false,
      } as PromoCode
    } catch {
      return null
    }
  })

  const [promoError, setPromoError] = useState<string | null>(null)

  const [savedItems, setSavedItems] = useState<CartItem[]>([])
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSyncPayloadRef = useRef<SyncItem[] | null>(null)
  const isMergingLocalCartRef = useRef(false)

  /* ---------------------------------------------------------- */
  /* Persist promo localement                                     */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      if (promo) {
        window.localStorage.setItem(LOCAL_PROMO_KEY, JSON.stringify(promo))
      } else {
        window.localStorage.removeItem(LOCAL_PROMO_KEY)
      }
    } catch {
      // ignore
    }
  }, [promo])

  /* ---------------------------------------------------------- */
  /* Expire promo automatiquement                                 */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!promo?.expiresAt) return

    const expiry = new Date(promo.expiresAt).getTime()

    if (Number.isNaN(expiry)) return

    const delay = expiry - Date.now()

    if (delay <= 0) {
      setPromo(null)
      setPromoError('Ce code promo a expiré.')
      return
    }

    const timeout = setTimeout(() => {
      setPromo(null)
      setPromoError('Ce code promo a expiré.')
    }, delay)

    return () => clearTimeout(timeout)
  }, [promo])

  /* ---------------------------------------------------------- */
  /* Reset pending sync quand l'utilisateur change                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    pendingSyncPayloadRef.current = null
    setPendingSyncCount(0)
    setLastRemoved(null)
    setLastRemovedVariantKey(undefined)
  }, [userId])

  /* ---------------------------------------------------------- */
  /* 1. Lecture du panier depuis Supabase                         */
  /*    Table : pannier (deux n)                                  */
  /* ---------------------------------------------------------- */

  const {
    data: panierRows = [],
    isLoading: loadingRemote,
    error: remoteError,
    refetch: refetchRemote,
  } = useQuery<
    {
      id?: number
      produit_id: string
      quantite: number
      variant_key?: string | null
    }[]
  >({
    queryKey: ['cart-raw', userId],
    queryFn: async () => {
      if (!userId) return []

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

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

        if (err?.name === 'AbortError') {
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

  /* ---------------------------------------------------------- */
  /* 2. Détails des produits                                      */
  /* ---------------------------------------------------------- */

  const produitIds = useMemo(
    () => [...new Set(panierRows.map((row) => row.produit_id))],
    [panierRows]
  )

  const { data: produitsCache = {} } = useQuery<Record<string, any>>({
    queryKey: ['produits-batch-cart', produitIds],
    queryFn: async () => {
      if (produitIds.length === 0) return {}

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const extendedColumns =
        'id, nom, prix, prix_usd, prix_cdf, prix_comparatif, images, stock, delivery_config, poids_kg, variantes, variant_attributes, variant_config'

      const basicColumns =
        'id, nom, prix, prix_comparatif, images, stock'

      try {
        let { data, error } = await supabaseBrowser
          .from('produits')
          .select(extendedColumns)
          .in('id', produitIds)
          .abortSignal(controller.signal)

        if (error) {
          const fallback = await supabaseBrowser
            .from('produits')
            .select(basicColumns)
            .in('id', produitIds)
            .abortSignal(controller.signal)

          if (fallback.error) {
            throw fallback.error
          }

          data = fallback.data
        }

        clearTimeout(timeoutId)

        const map: Record<string, any> = {}

        ;(data || []).forEach((p: any) => {
          map[p.id] = {
            nom: p.nom,
            prix: p.prix,
            prix_usd: p.prix_usd ?? null,
            prix_cdf: p.prix_cdf ?? null,
            prix_initial: p.prix_comparatif,
            images: p.images || [],
            stock: p.stock,
            delivery_config: p.delivery_config ?? null,
            poids_kg: p.poids_kg ?? null,
            variantes: Array.isArray(p.variantes) ? p.variantes : [],
            variant_attributes: Array.isArray(p.variant_attributes)
              ? p.variant_attributes
              : [],
            variant_config: p.variant_config ?? null,
          }
        })

        return map
      } catch (err: any) {
        clearTimeout(timeoutId)

        if (err?.name === 'AbortError') {
          throw new Error('Timeout lors du chargement des produits')
        }

        throw err
      }
    },
    enabled: produitIds.length > 0 && isOnline,
    staleTime: PRODUCTS_CACHE_TTL,
    retry: 2,
  })

  /* ---------------------------------------------------------- */
  /* 3. Fusion des données remote                                 */
  /* ---------------------------------------------------------- */

  const remoteItems: CartItem[] = useMemo(() => {
    return panierRows.map((row) => {
      const produit = produitsCache[row.produit_id]

      const variantKey = normalizeVariantKeyCanonical(row.variant_key)
      const attrs = safeJsonParse(variantKey) || {}
      const hasVariant = Boolean(
        variantKey && Object.keys(attrs).length > 0
      )

      const matchedVariant =
        hasVariant && Array.isArray(produit?.variantes)
          ? produit.variantes.find((v: any) => {
              const vKey = getVariantKeyFromItem({
                variante: { attributes: v?.attributes || {} },
              })
              return vKey === variantKey
            })
          : null

      const variantUsdSource = firstPositive(
        matchedVariant?.prix_specifique_usd
      )

      const variantCdfSource = firstPositive(
        matchedVariant?.prix_specifique_cdf,
        matchedVariant?.prix_specifique,
        matchedVariant?.prix
      )

      const productUsdSource = firstPositive(
        produit?.prix_usd
      )

      const productCdfSource = firstPositive(
        produit?.prix,
        produit?.prix_cdf
      )

      const resolvedVariant = resolvePricePair(
        variantUsdSource,
        variantCdfSource,
        rate
      )

      const resolvedProduct = resolvePricePair(
        productUsdSource,
        productCdfSource,
        rate
      )

      const hasVariantPrice =
        variantUsdSource > 0 || variantCdfSource > 0

      const finalPrices = hasVariantPrice ? resolvedVariant : resolvedProduct

      const deliveryConfig = safeNormalizeProductDeliveryConfig(
        produit?.delivery_config,
        produit,
        rate
      )

      const poidsKg =
        matchedVariant?.poids_kg ??
        produit?.poids_kg ??
        deliveryConfig?.logistics?.weight_kg ??
        null

      const nonConsolidable = Object.values(
        deliveryConfig?.modes || {}
      ).some((mode: any) =>
        Boolean(
          mode?.mandatory_per_unit ||
            mode?.non_consolidable ||
            mode?.protect_margin ||
            mode?.calculation_mode === 'mandatory_per_unit'
        )
      )

      return {
        id: row.produit_id,
        product_id: row.produit_id,
        nom: produit?.nom || 'Produit inconnu',
        prix: finalPrices.cdf,
        prix_usd: finalPrices.usd > 0 ? finalPrices.usd : null,
        unit_price_usd: finalPrices.usd > 0 ? finalPrices.usd : null,
        quantite: safeQuantity(row.quantite),
        image: produit?.images?.[0],
        specifications: undefined,
        variante: hasVariant
          ? {
              id: matchedVariant?.id,
              attributes: attrs,
              prix: variantCdfSource || undefined,
              prix_specifique: variantCdfSource || undefined,
              prix_specifique_usd:
                finalPrices.usd > 0 ? finalPrices.usd : null,
              prix_specifique_cdf:
                finalPrices.cdf > 0 ? finalPrices.cdf : null,
              image:
                matchedVariant?.image ||
                matchedVariant?.images?.[0] ||
                null,
              images: matchedVariant?.images || [],
              stock: matchedVariant?.stock,
              poids_kg: matchedVariant?.poids_kg ?? null,
            }
          : undefined,
        stock_disponible: matchedVariant?.stock ?? produit?.stock,
        stock: matchedVariant?.stock ?? produit?.stock,
        addedAt: Date.now(),
        delivery_config: deliveryConfig,
        poids_kg: poidsKg,
        logistics_group: deliveryConfig?.logistics?.group || null,
        non_consolidable: nonConsolidable,
      }
    })
  }, [panierRows, produitsCache, rate])

  /* ---------------------------------------------------------- */
  /* 4. Panier local invité                                       */
  /* ---------------------------------------------------------- */

  const [localItems, setLocalItems] = useState<CartItem[]>([])
  const [localCartHydrated, setLocalCartHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = localStorage.getItem(LOCAL_CART_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      const items = Array.isArray(parsed)
        ? parsed.slice(0, MAX_LOCAL_ITEMS)
        : []
      setLocalItems(items)
    } catch (err) {
      console.error('Erreur lecture panier local:', err)
      setLocalItems([])
    } finally {
      setLocalCartHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (userId || !localCartHydrated) return

    try {
      localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(localItems))
    } catch (err) {
      console.error('Erreur sauvegarde panier local:', err)
      addToast({
        type: 'error',
        message: 'Impossible de sauvegarder le panier localement',
      })
    }
  }, [localCartHydrated, localItems, userId, addToast])

  const baseItems = useMemo<CartItem[]>(() => {
    if (userId) return remoteItems
    return localCartHydrated ? localItems : []
  }, [localCartHydrated, localItems, remoteItems, userId])

  /**
   * Items exposés au contexte.
   *
   * IMPORTANT :
   * - Le CDF est recalculé à chaque changement de taux.
   * - USD reste la source principale.
   */
  const items = useMemo<CartItem[]>(
    () => baseItems.map((item) => normalizeCartItemForDisplay(item, rate)),
    [baseItems, rate]
  )

  const loading = useMemo(() => {
    if (userId) return loadingRemote
    return !localCartHydrated
  }, [loadingRemote, localCartHydrated, userId])

  /* ---------------------------------------------------------- */
  /* Sous-totaux USD / CDF                                        */
  /* ---------------------------------------------------------- */

  const subtotalUsd = useMemo(
    () => calculateSubtotalUsd(items, rate),
    [items, rate]
  )

  const subtotalCdf = useMemo(
    () => calculateSubtotalCdf(items, rate),
    [items, rate]
  )

  /* ---------------------------------------------------------- */
  /* 5. Mutation synchronisation                                  */
  /* ---------------------------------------------------------- */

  type SyncItem = {
    produit_id: string
    quantite: number
    variant_key?: string | null
  }

  const setCartCache = useCallback(
    (payload: SyncItem[]) => {
      if (!userId) return

      queryClient.setQueryData(
        ['cart-raw', userId],
        payload as any
      )
    },
    [queryClient, userId]
  )

  const syncMutation = useMutation<void, Error, SyncItem[]>({
    mutationFn: async (newItems: SyncItem[]) => {
      if (!userId) return

      const rows = newItems.map((item) => ({
        user_id: userId,
        produit_id: item.produit_id,
        quantite: safeQuantity(item.quantite),
        variant_key: normalizeVariantKeyCanonical(item.variant_key) || '',
      }))

      /**
       * 1. Upsert des articles actuellement présents dans le panier.
       */
      if (rows.length > 0) {
        const { error } = await supabaseBrowser
          .from('pannier')
          .upsert(rows, {
            onConflict: 'user_id,produit_id,variant_key',
          })

        if (error) {
          throw new Error(error.message)
        }
      }

      /**
       * 2. Suppression des articles qui ne sont plus dans le payload.
       *
       * Ceci corrige le bug critique où removeItem faisait seulement
       * un upsert du nouveau panier, laissant l’article supprimé
       * en base.
       */
      const { data: existing, error: existingError } = await supabaseBrowser
        .from('pannier')
        .select('id, produit_id, variant_key')
        .eq('user_id', userId)

      if (existingError) {
        throw new Error(existingError.message)
      }

      const payloadKeys = new Set(
        rows.map((row) => makeCartItemKey(row.produit_id, row.variant_key))
      )

      const idsToDelete = (existing || [])
        .filter(
          (row: any) =>
            !payloadKeys.has(
              makeCartItemKey(row.produit_id, row.variant_key)
            )
        )
        .map((row: any) => row.id)
        .filter(Boolean)

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabaseBrowser
          .from('pannier')
          .delete()
          .in('id', idsToDelete)

        if (deleteError) {
          throw new Error(deleteError.message)
        }
      }
    },
    onMutate: async () => {
      setPendingSyncCount((count) => count + 1)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart-raw', userId] })
      setLastUpdated(Date.now())
    },
    onError: (err: any) => {
      console.error('Erreur synchronisation panier:', err)

      addToast({
        type: 'error',
        message: `Erreur de synchronisation : ${err?.message || 'inconnue'}`,
      })

      queryClient.invalidateQueries({ queryKey: ['cart-raw', userId] })
    },
    onSettled: () => {
      setPendingSyncCount((count) => Math.max(0, count - 1))
    },
  })

  /* ---------------------------------------------------------- */
  /* 6. Helpers                                                   */
  /* ---------------------------------------------------------- */

  const getVariantKey = useCallback(
    (item: { variante?: VariantePanier | null }): string => {
      return getVariantKeyFromItem(item)
    },
    []
  )

  const findIndex = useCallback(
    (list: CartItem[], productId: string, variantKey?: string) => {
      const targetKey = normalizeVariantKeyCanonical(variantKey ?? '')

      return list.findIndex(
        (item) =>
          item.id === productId &&
          getVariantKey(item) === targetKey
      )
    },
    [getVariantKey]
  )

  const debouncedSync = useCallback(
    (payload: SyncItem[]) => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }

      syncTimeoutRef.current = setTimeout(() => {
        syncMutation.mutate(payload)
      }, DEBOUNCE_DELAY)
    },
    [syncMutation]
  )

  const buildSyncPayload = useCallback(
    (list: CartItem[]): SyncItem[] => {
      return list.map((item) => ({
        produit_id: item.id,
        quantite: safeQuantity(item.quantite),
        variant_key: getVariantKey(item) || '',
      }))
    },
    [getVariantKey]
  )

  const queueOfflineSync = useCallback(
    (payload: SyncItem[]) => {
      pendingSyncPayloadRef.current = payload
      setPendingSyncCount(1)
    },
    []
  )

  /* ---------------------------------------------------------- */
  /* 7. Actions                                                   */
  /* ---------------------------------------------------------- */

  const addItem = useCallback(
    async (newItem: AddCartItemInput, quantiteArg?: number) => {
      const quantite = safeQuantity(quantiteArg ?? newItem.quantite ?? 1)
      const prepared = prepareCartItemInput(newItem, rate)
      const variantKey = getVariantKey(prepared as CartItem)

      /*
       * Invité : panier local.
       */
      if (!userId) {
        const current = localItems
        const idx = findIndex(current, prepared.id, variantKey)

        let updated: CartItem[]

        if (idx !== -1) {
          updated = [...current]
          updated[idx] = {
            ...updated[idx],
            quantite: updated[idx].quantite + quantite,
          }
        } else {
          updated = [
            ...current,
            {
              ...(prepared as CartItem),
              quantite,
              stock_disponible:
                produitsCache[prepared.id]?.stock ??
                prepared.stock_disponible ??
                prepared.stock,
              stock:
                produitsCache[prepared.id]?.stock ??
                prepared.stock,
              addedAt: Date.now(),
            },
          ]
        }

        const produitStock =
          produitsCache[prepared.id]?.stock ??
          prepared.stock_disponible ??
          prepared.stock

        if (produitStock !== undefined && produitStock !== null) {
          if (produitStock <= 0) {
            addToast({
              type: 'warning',
              message: `${prepared.nom} est en rupture de stock.`,
            })
            return
          }

          const itemInCart = updated.find(
            (item) =>
              item.id === prepared.id &&
              getVariantKey(item) === variantKey
          )

          if (itemInCart && itemInCart.quantite > produitStock) {
            itemInCart.quantite = produitStock

            addToast({
              type: 'warning',
              message: `Stock limité à ${produitStock} unités.`,
            })
          }
        }

        setLocalItems(updated)

        addToast({
          type: 'success',
          message: `${prepared.nom} ajouté au panier`,
        })

        return
      }

      /*
       * Connecté : panier remote.
       */
      const current = remoteItems
      const idx = findIndex(current, prepared.id, variantKey)

      let updated: CartItem[]

      if (idx !== -1) {
        updated = [...current]
        updated[idx] = {
          ...updated[idx],
          quantite: updated[idx].quantite + quantite,
        }
      } else {
        updated = [
          ...current,
          {
            ...(prepared as CartItem),
            quantite,
            stock_disponible:
              produitsCache[prepared.id]?.stock ??
              prepared.stock_disponible ??
              prepared.stock,
            stock:
              produitsCache[prepared.id]?.stock ??
              prepared.stock,
            addedAt: Date.now(),
          },
        ]
      }

      const produitStock =
        produitsCache[prepared.id]?.stock ??
        prepared.stock_disponible ??
        prepared.stock

      if (produitStock !== undefined && produitStock !== null) {
        if (produitStock <= 0) {
          addToast({
            type: 'warning',
            message: `${prepared.nom} est en rupture de stock.`,
          })
          return
        }

        const itemInCart = updated.find(
          (item) =>
            item.id === prepared.id &&
            getVariantKey(item) === variantKey
        )

        if (itemInCart && itemInCart.quantite > produitStock) {
          itemInCart.quantite = produitStock

          addToast({
            type: 'warning',
            message: `Stock limité à ${produitStock} unités.`,
          })
        }
      }

      const payload = buildSyncPayload(updated)

      // Optimistic UI
      setCartCache(payload)

      if (isOnline) {
        try {
          await syncMutation.mutateAsync(payload)

          addToast({
            type: 'success',
            message: `${prepared.nom} ajouté au panier`,
          })
        } catch {
          // onError du mutation gère le toast et l'invalidation.
        }
      } else {
        queueOfflineSync(payload)

        addToast({
          type: 'info',
          message: `${prepared.nom} ajouté (synchronisation en attente)`,
        })
      }
    },
    [
      addToast,
      buildSyncPayload,
      findIndex,
      getVariantKey,
      isOnline,
      localItems,
      produitsCache,
      queueOfflineSync,
      rate,
      remoteItems,
      setCartCache,
      syncMutation,
      userId,
    ]
  )

  const removeItem = useCallback(
    async (id: string, variantKey?: string) => {
      const targetVariantKey = normalizeVariantKeyCanonical(variantKey ?? '')

      if (!userId) {
        const current = localItems
        const idx = findIndex(current, id, targetVariantKey)

        if (idx === -1) return

        const removed = current[idx]
        const updated = current.filter((_, index) => index !== idx)

        setLastRemoved(removed)
        setLastRemovedVariantKey(targetVariantKey)

        if (undoTimeoutRef.current) {
          clearTimeout(undoTimeoutRef.current)
        }

        undoTimeoutRef.current = setTimeout(() => {
          setLastRemoved(null)
          setLastRemovedVariantKey(undefined)
        }, UNDO_TIMEOUT)

        setLocalItems(updated)

        addToast({
          type: 'info',
          message: 'Produit retiré du panier',
          icon: '🗑️',
        })

        return
      }

      const current = remoteItems
      const idx = findIndex(current, id, targetVariantKey)

      if (idx === -1) return

      const removed = current[idx]
      const updated = current.filter((_, index) => index !== idx)

      setLastRemoved(removed)
      setLastRemovedVariantKey(targetVariantKey)

      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current)
      }

      undoTimeoutRef.current = setTimeout(() => {
        setLastRemoved(null)
        setLastRemovedVariantKey(undefined)
      }, UNDO_TIMEOUT)

      const payload = buildSyncPayload(updated)

      setCartCache(payload)

      if (isOnline) {
        try {
          await syncMutation.mutateAsync(payload)

          addToast({
            type: 'info',
            message: 'Produit retiré du panier',
            icon: '🗑️',
          })
        } catch {
          // onError gère.
        }
      } else {
        queueOfflineSync(payload)

        addToast({
          type: 'info',
          message: 'Produit retiré (synchronisation en attente)',
        })
      }
    },
    [
      addToast,
      buildSyncPayload,
      findIndex,
      isOnline,
      localItems,
      queueOfflineSync,
      remoteItems,
      setCartCache,
      syncMutation,
      userId,
    ]
  )

  const updateQuantity = useCallback(
    async (id: string, quantite: number, variantKey?: string) => {
      const safeQty = safeQuantity(quantite)
      const targetVariantKey = normalizeVariantKeyCanonical(variantKey ?? '')

      if (quantite <= 0) {
        await removeItem(id, targetVariantKey)
        return
      }

      if (!userId) {
        const current = localItems
        const idx = findIndex(current, id, targetVariantKey)

        if (idx === -1) return

        const updated = [...current]
        updated[idx] = {
          ...updated[idx],
          quantite: safeQty,
        }

        const stock =
          produitsCache[id]?.stock ??
          updated[idx].stock_disponible ??
          updated[idx].stock

        if (stock !== undefined && stock !== null) {
          if (stock <= 0) {
            await removeItem(id, targetVariantKey)
            return
          }

          if (updated[idx].quantite > stock) {
            updated[idx].quantite = stock

            addToast({
              type: 'warning',
              message: `Stock limité à ${stock} unités.`,
            })
          }
        }

        setLocalItems(updated)
        return
      }

      const current = remoteItems
      const idx = findIndex(current, id, targetVariantKey)

      if (idx === -1) return

      const updated = [...current]
      updated[idx] = {
        ...updated[idx],
        quantite: safeQty,
      }

      const stock =
        produitsCache[id]?.stock ??
        updated[idx].stock_disponible ??
        updated[idx].stock

      if (stock !== undefined && stock !== null) {
        if (stock <= 0) {
          await removeItem(id, targetVariantKey)
          return
        }

        if (updated[idx].quantite > stock) {
          updated[idx].quantite = stock

          addToast({
            type: 'warning',
            message: `Stock limité à ${stock} unités.`,
          })
        }
      }

      const payload = buildSyncPayload(updated)

      setCartCache(payload)

      if (isOnline) {
        debouncedSync(payload)
      } else {
        queueOfflineSync(payload)
      }
    },
    [
      addToast,
      buildSyncPayload,
      debouncedSync,
      findIndex,
      isOnline,
      localItems,
      produitsCache,
      queueOfflineSync,
      remoteItems,
      removeItem,
      setCartCache,
      userId,
    ]
  )

  const clearCart = useCallback(async () => {
    if (!userId) {
      setLocalItems([])

      if (typeof window !== 'undefined') {
        localStorage.removeItem(LOCAL_CART_KEY)
      }

      addToast({
        type: 'success',
        message: 'Panier vidé',
      })

      return
    }

    const payload: SyncItem[] = []

    setCartCache(payload)

    if (isOnline) {
      try {
        await syncMutation.mutateAsync(payload)

        addToast({
          type: 'success',
          message: 'Panier vidé',
        })
      } catch {
        // onError gère.
      }
    } else {
      queueOfflineSync(payload)

      addToast({
        type: 'info',
        message: 'Panier vidé (synchronisation en attente)',
      })
    }
  }, [
    addToast,
    isOnline,
    queueOfflineSync,
    setCartCache,
    syncMutation,
    userId,
  ])

  const undoRemove = useCallback(async () => {
    if (!lastRemoved) return

    await addItem(lastRemoved, lastRemoved.quantite)

    setLastRemoved(null)
    setLastRemovedVariantKey(undefined)

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current)
    }
  }, [addItem, lastRemoved])

  /* ---------------------------------------------------------- */
  /* 8. Promo — propriétaire du panier                            */
  /* ---------------------------------------------------------- */

  const applyPromoCode = useCallback(
    async (code: string): Promise<PromoApplyResult> => {
      const normalized = String(code || '').trim().toUpperCase()

      if (!normalized) {
        const message = 'Saisissez un code promo.'
        setPromo(null)
        setPromoError(message)
        return { success: false, error: message }
      }

      const currentSubtotalUsd = subtotalUsd

      /*
       * 1) Tentative RPC sécurisée : validate_promo_code
       */
      try {
        if (typeof supabaseBrowser?.rpc === 'function') {
          const { data, error } = await supabaseBrowser.rpc(
            'validate_promo_code',
            {
              p_code: normalized,
              p_subtotal_usd: currentSubtotalUsd,
            }
          )

          if (!error && data) {
            const parsed = normalizeRpcPromoResult(data)

            if (!parsed) {
              const message = 'Réponse promo invalide.'
              setPromo(null)
              setPromoError(message)
              return { success: false, error: message }
            }

            if (parsed.valid) {
              setPromo(parsed)
              setPromoError(null)
              return { success: true, promo: parsed }
            }

            const remaining = toPositiveNumber(parsed.remainingToMinUsd)

            if (remaining > 0) {
              const message =
                parsed.message ||
                `Ajoutez encore ${formatUsdSimple(
                  remaining
                )} pour utiliser ce code promo.`

              const parsedWithMessage: PromoCode = {
                ...parsed,
                valid: false,
                remainingToMinUsd: remaining,
                message,
              }

              setPromo(parsedWithMessage)
              setPromoError(message)

              return {
                success: false,
                error: message,
                promo: parsedWithMessage,
              }
            }

            const message =
              parsed.message || 'Code promo invalide.'

            setPromo(null)
            setPromoError(message)

            return { success: false, error: message }
          }

          if (error && !isSchemaLikeError(error)) {
            const message =
              error?.message || 'Impossible de valider le code promo.'
            setPromoError(message)
            return { success: false, error: message }
          }
        }
      } catch (err: any) {
        if (!isSchemaLikeError(err)) {
          const message =
            err?.message || 'Impossible de valider le code promo.'
          setPromoError(message)
          return { success: false, error: message }
        }
      }

      /*
       * 2) Fallback compatible : lecture directe promo_codes.
       */
      try {
        const columnSets = [
          'id, code, type, value, min_total_usd, max_discount_usd, max_utilisations, utilisations_actuelles, actif, expires_at, description, created_at, updated_at',
          'id, code, reduction_percent, max_utilisations, utilisations_actuelles, actif, expires_at, description',
          'id, code, actif, expires_at',
        ]

        let row: any = null
        let lastError: any = null

        for (const columns of columnSets) {
          const { data, error } = await supabaseBrowser
            .from('promo_codes')
            .select(columns)
            .eq('code', normalized)
            .maybeSingle()

          if (!error) {
            row = data
            break
          }

          lastError = error

          if (!isSchemaLikeError(error)) {
            break
          }
        }

        if (!row) {
          const message =
            lastError?.message ||
            'Code promo invalide, expiré ou désactivé.'

          setPromo(null)
          setPromoError(message)

          return { success: false, error: message }
        }

        const parsed = normalizePromoRow(row)

        if (!parsed) {
          const message = 'Code promo invalide.'
          setPromo(null)
          setPromoError(message)
          return { success: false, error: message }
        }

        if (!parsed.valid) {
          const message =
            parsed.message || 'Ce code promo n’est pas utilisable.'

          setPromo(null)
          setPromoError(message)

          return { success: false, error: message }
        }

        const minTotalUsd = toPositiveNumber(
          parsed.minTotalUsd ?? parsed.minTotal
        )

        if (minTotalUsd > 0 && currentSubtotalUsd < minTotalUsd) {
          const remaining = roundUsd(minTotalUsd - currentSubtotalUsd)

          const message = `Ajoutez encore ${formatUsdSimple(
            remaining
          )} pour utiliser ${parsed.code}.`

          const parsedWithMessage: PromoCode = {
            ...parsed,
            valid: false,
            remainingToMinUsd: remaining,
            message,
          }

          setPromo(parsedWithMessage)
          setPromoError(message)

          return {
            success: false,
            error: message,
            promo: parsedWithMessage,
          }
        }

        const finalPromo: PromoCode = {
          ...parsed,
          valid: true,
          remainingToMinUsd: 0,
          message: 'Code promo valide.',
        }

        setPromo(finalPromo)
        setPromoError(null)

        return { success: true, promo: finalPromo }
      } catch (err: any) {
        const message =
          err?.message || 'Impossible de valider ce code promo.'

        setPromoError(message)

        return { success: false, error: message }
      }
    },
    [subtotalUsd]
  )

  const removePromoCode = useCallback(async () => {
    setPromo(null)
    setPromoError(null)

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(LOCAL_PROMO_KEY)
      } catch {
        // ignore
      }
    }

    addToast({
      type: 'info',
      message: 'Code promo retiré',
      icon: 'ℹ️',
    })
  }, [addToast])

  /* ---------------------------------------------------------- */
  /* 9. Sauvegarder pour plus tard                                */
  /* ---------------------------------------------------------- */

  const saveForLater = useCallback(
    async (id: string, variantKey?: string) => {
      const targetVariantKey = normalizeVariantKeyCanonical(variantKey ?? '')
      const current = userId ? remoteItems : localItems
      const idx = findIndex(current, id, targetVariantKey)

      if (idx === -1) return

      const item = current[idx]

      setSavedItems((prev) => {
        const exists = prev.some(
          (saved) =>
            saved.id === item.id &&
            getVariantKey(saved) === getVariantKey(item)
        )

        if (exists) return prev

        return [item, ...prev].slice(0, 30)
      })

      await removeItem(id, targetVariantKey)

      addToast({
        type: 'success',
        message: 'Produit sauvegardé pour plus tard.',
      })
    },
    [
      addToast,
      findIndex,
      getVariantKey,
      localItems,
      removeItem,
      remoteItems,
      userId,
    ]
  )

  const moveToCart = useCallback(
    async (id: string, variantKey?: string) => {
      const targetVariantKey =
        variantKey === undefined
          ? undefined
          : normalizeVariantKeyCanonical(variantKey)

      const saved = savedItems.find(
        (item) =>
          item.id === id &&
          (targetVariantKey === undefined ||
            getVariantKey(item) === targetVariantKey)
      )

      if (!saved) return

      await addItem(saved, saved.quantite)

      setSavedItems((prev) =>
        prev.filter(
          (item) =>
            !(
              item.id === saved.id &&
              getVariantKey(item) === getVariantKey(saved)
            )
        )
      )

      addToast({
        type: 'success',
        message: 'Produit remis dans le panier.',
      })
    },
    [addItem, getVariantKey, savedItems, addToast]
  )

  const removeSavedItem = useCallback(
    (id: string, variantKey?: string) => {
      const targetVariantKey =
        variantKey === undefined
          ? undefined
          : normalizeVariantKeyCanonical(variantKey)

      setSavedItems((prev) =>
        prev.filter(
          (item) =>
            !(
              item.id === id &&
              (targetVariantKey === undefined ||
                getVariantKey(item) === targetVariantKey)
            )
        )
      )
    },
    [getVariantKey]
  )

  const clearSavedItems = useCallback(() => {
    setSavedItems([])
  }, [])

  /* ---------------------------------------------------------- */
  /* 10. Fusion panier local -> connecté                          */
  /* ---------------------------------------------------------- */

  const mergeLocalCart = useCallback(async () => {
    if (!userId || localItems.length === 0) return
    if (isMergingLocalCartRef.current) return

    isMergingLocalCartRef.current = true

    addToast({
      type: 'info',
      message: 'Fusion du panier local en cours...',
    })

    try {
      for (const item of localItems) {
        await addItem(
          {
            id: item.id,
            product_id: item.product_id,
            nom: item.nom,
            prix: item.prix,
            prix_usd: item.prix_usd,
            unit_price_usd: item.unit_price_usd,
            image: item.image,
            specifications: item.specifications,
            variante: item.variante,
            delivery_config: item.delivery_config,
            poids_kg: item.poids_kg,
            logistics_group: item.logistics_group,
            non_consolidable: item.non_consolidable,
            prix_initial: item.prix_initial,
            prix_initial_usd: item.prix_initial_usd,
            remise: item.remise,
            stock: item.stock,
            stock_disponible: item.stock_disponible,
          },
          item.quantite
        )
      }

      setLocalItems([])

      if (typeof window !== 'undefined') {
        localStorage.removeItem(LOCAL_CART_KEY)
      }

      addToast({
        type: 'success',
        message: 'Panier local fusionné avec votre compte',
      })
    } catch (err: any) {
      addToast({
        type: 'error',
        message:
          err?.message ||
          'Impossible de fusionner le panier local.',
      })
    } finally {
      isMergingLocalCartRef.current = false
    }
  }, [addItem, addToast, localItems, userId])

  const refetchCart = useCallback(async () => {
    await refetchRemote()
  }, [refetchRemote])

  /* ---------------------------------------------------------- */
  /* 11. Synchronisation au retour en ligne                       */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!isOnline || !userId) return
    if (pendingSyncPayloadRef.current === null) return

    const payload = pendingSyncPayloadRef.current

    pendingSyncPayloadRef.current = null
    setPendingSyncCount(0)

    addToast({
      type: 'info',
      message: 'Synchronisation du panier en cours...',
    })

    syncMutation.mutate(payload)
  }, [addToast, isOnline, syncMutation, userId])

  /* ---------------------------------------------------------- */
  /* 12. Cleanup                                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* 13. Estimation livraison                                     */
  /* ---------------------------------------------------------- */

  const shippingCartItems = useMemo<ShippingCartItem[]>(() => {
    return items.map((item) => {
      const { usd, cdf } = resolveUnitPrices(item, rate)

      const unitPriceUsd =
        usd > 0
          ? usd
          : firstPositive(item.prix_usd, item.unit_price_usd)

      return {
        id: item.id,
        product_id: item.product_id || item.id,
        nom: item.nom,
        quantity: safeQuantity(item.quantite),
        unit_price_usd: unitPriceUsd,
        prix_usd: unitPriceUsd,
        prix: cdf,
        delivery_config: item.delivery_config ?? null,
        poids_kg: item.poids_kg ?? null,
        product: {
          id: item.product_id || item.id,
          nom: item.nom,
          prix_usd: unitPriceUsd,
          prix: cdf,
          poids_kg: item.poids_kg ?? null,
          delivery_config: item.delivery_config ?? null,
        },
        variante: item.variante
          ? {
              id: item.variante.id,
              attributes: item.variante.attributes,
              poids_kg: item.variante.poids_kg ?? null,
              prix_specifique_usd:
                item.variante.prix_specifique_usd ?? null,
              prix_specifique_cdf:
                item.variante.prix_specifique_cdf ?? null,
            }
          : null,
      }
    })
  }, [items, rate])

  /*
   * Estimation panier :
   * - priorité domicile ;
   * - si indisponible, essaie point_retrait puis express ;
   * - si aucun mode disponible, renvoie le dernier quote indisponible.
   */
  const shippingQuote = useMemo<ShippingQuote | null>(() => {
    if (items.length === 0) return null

    let fallbackQuote: ShippingQuote | null = null

    for (const modeId of DELIVERY_MODE_IDS as DeliveryModeId[]) {
      try {
        const quote = calculateShippingQuote({
          items: shippingCartItems,
          modeId,
          rate,
          subtotalUsd,
        })

        if (quote && quote.available !== false) {
          return quote
        }

        fallbackQuote = quote ?? fallbackQuote
      } catch {
        // ignore ce mode et continue
      }
    }

    return fallbackQuote
  }, [items.length, rate, shippingCartItems, subtotalUsd])

  /* ---------------------------------------------------------- */
  /* 14. Résumé calculé                                           */
  /* ---------------------------------------------------------- */

  const summary = useMemo<CartSummary>(() => {
    const sousTotal = subtotalCdf
    const sousTotalUSD = subtotalUsd

    const prixInitialTotal = items.reduce((acc, item) => {
      const quantity = safeQuantity(item.quantite)

      const originalCdfSource = firstPositive(
        item.prix_initial,
        item.prix
      )

      const originalUsdSource = firstPositive(
        item.prix_initial_usd,
        item.prix_usd,
        item.unit_price_usd
      )

      const resolvedOriginal = resolvePricePair(
        originalUsdSource,
        originalCdfSource,
        rate
      )

      return acc + resolvedOriginal.cdf * quantity
    }, 0)

    const economiePrix = Math.max(0, roundCdf(prixInitialTotal - sousTotal))

    let remiseTotal = 0
    let remiseTotalUSD = 0
    let promoValid = false
    let promoRemainingUsd = 0
    let promoRequirementMessage: string | null = null
    let promoReductionUsd = 0

    const rateNum = Number(rate)
    const rateOk = Number.isFinite(rateNum) && rateNum > 0

    if (promo) {
      const expired = isExpiredDate(promo.expiresAt)

      const minTotalUsd = toPositiveNumber(
        promo.minTotalUsd ?? promo.minTotal
      )

      const maxDiscountUsd = toPositiveNumber(
        promo.maxDiscountUsd ?? promo.maxDiscount
      )

      const value = toPositiveNumber(promo.value)

      const exhausted =
        promo.maxUtilisations != null &&
        promo.utilisationsActuelles != null &&
        toPositiveNumber(promo.utilisationsActuelles) >=
          toPositiveNumber(promo.maxUtilisations)

      if (expired) {
        promoValid = false
        promoRequirementMessage = 'Ce code promo a expiré.'
      } else if (exhausted) {
        promoValid = false
        promoRequirementMessage =
          'Ce code promo a atteint sa limite d’utilisation.'
      } else if (
        minTotalUsd > 0 &&
        sousTotalUSD < minTotalUsd
      ) {
        promoValid = false
        promoRemainingUsd = roundUsd(minTotalUsd - sousTotalUSD)
        promoRequirementMessage = `Ajoutez encore ${formatUsdSimple(
          promoRemainingUsd
        )} pour utiliser ${promo.code}.`
      } else {
        let reductionUsd = 0

        if (promo.type === 'percent') {
          if (sousTotalUSD > 0) {
            reductionUsd = (sousTotalUSD * value) / 100
          } else if (sousTotal > 0 && rateOk) {
            reductionUsd = ((sousTotal / rateNum) * value) / 100
          }
        } else {
          const baseUsd =
            sousTotalUSD > 0
              ? sousTotalUSD
              : rateOk && sousTotal > 0
                ? sousTotal / rateNum
                : 0

          reductionUsd = Math.min(value, baseUsd)
        }

        if (maxDiscountUsd > 0 && reductionUsd > maxDiscountUsd) {
          reductionUsd = maxDiscountUsd
        }

        const baseUsdForCap =
          sousTotalUSD > 0
            ? sousTotalUSD
            : rateOk && sousTotal > 0
              ? sousTotal / rateNum
              : 0

        if (baseUsdForCap > 0 && reductionUsd > baseUsdForCap) {
          reductionUsd = baseUsdForCap
        }

        reductionUsd = Math.max(0, roundUsd(reductionUsd))

        promoValid = true
        promoReductionUsd = reductionUsd
        remiseTotalUSD = reductionUsd

        if (rateOk) {
          remiseTotal = roundCdf(reductionUsd * rateNum)
        } else if (promo.type === 'percent' && sousTotal > 0) {
          remiseTotal = roundCdf((sousTotal * value) / 100)
        } else {
          remiseTotal = 0
        }
      }
    }

    remiseTotal = Math.min(remiseTotal, sousTotal)
    remiseTotalUSD = Math.min(remiseTotalUSD, sousTotalUSD)

    const total = Math.max(0, roundCdf(sousTotal - remiseTotal))

    let totalUSD = roundUsd(Math.max(0, sousTotalUSD - remiseTotalUSD))

    if (totalUSD <= 0 && rateOk && total > 0) {
      totalUSD = roundUsd(total / rateNum)
    }

    const poidsEstime = items.reduce(
      (acc, item) =>
        acc +
        toPositiveNumber(item.poids_kg) * safeQuantity(item.quantite),
      0
    )

    const hasNonConsolidableItems =
      shippingQuote?.breakdown?.some((line) => line.type === 'mandatory') ||
      items.some((item) => Boolean(item.non_consolidable))

    return {
      sousTotal,
      sousTotalUSD,
      remiseTotal,
      remiseTotalUSD,
      fraisLivraison: 0,
      total,
      totalUSD,
      nombreArticles: items.length,
      totalItems: items.reduce(
        (acc, item) => acc + safeQuantity(item.quantite),
        0
      ),
      poidsEstime,
      economie: roundCdf(economiePrix + remiseTotal),

      shippingEstimateUsd: shippingQuote?.total_usd ?? 0,
      shippingEstimateCdf: shippingQuote?.total_cdf ?? 0,
      shippingQuote,
      hasNonConsolidableItems: Boolean(hasNonConsolidableItems),
      deliveryWarnings: shippingQuote?.warnings ?? [],

      promoValid,
      promoMinTotalUsd: toPositiveNumber(
        promo?.minTotalUsd ?? promo?.minTotal
      ),
      promoMaxDiscountUsd: toPositiveNumber(
        promo?.maxDiscountUsd ?? promo?.maxDiscount
      ),
      promoRemainingUsd,
      promoRequirementMessage,
      promoReductionUsd,
    }
  }, [
    items,
    promo,
    rate,
    shippingQuote,
    subtotalCdf,
    subtotalUsd,
  ])

  const totalItems = useMemo(
    () =>
      items.reduce(
        (acc, item) => acc + safeQuantity(item.quantite),
        0
      ),
    [items]
  )

  /* ---------------------------------------------------------- */
  /* 15. Valeur du contexte                                       */
  /* ---------------------------------------------------------- */

  const value = useMemo<CartContextType>(
    () => ({
      items,
      total: summary.total,
      itemCount: totalItems,
      loading,
      isSyncing: syncMutation.isPending || pendingSyncCount > 0,
      error: remoteError
        ? remoteError instanceof Error
          ? remoteError.message
          : 'Erreur panier'
        : null,

      addItem,
      addToCart: addItem,
      removeItem,
      updateQuantity,
      clearCart,

      applyPromoCode,
      removePromoCode,

      saveForLater,
      moveToCart,
      removeSavedItem,
      clearSavedItems,

      undoRemove,

      activePromo: promo,
      promoError,
      savedItems,
      summary,
      totalItems,

      refetchCart,
      mergeLocalCart,

      isOffline: !isOnline,
      pendingSyncCount,
      lastUpdated,
    }),
    [
      addItem,
      applyPromoCode,
      clearCart,
      clearSavedItems,
      isOnline,
      items,
      lastUpdated,
      loading,
      moveToCart,
      pendingSyncCount,
      promo,
      promoError,
      refetchCart,
      removeItem,
      removePromoCode,
      removeSavedItem,
      remoteError,
      saveForLater,
      savedItems,
      summary,
      syncMutation.isPending,
      totalItems,
      undoRemove,
      updateQuantity,
      userId,
    ]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOK                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export function useCart() {
  const context = useContext(CartContext)

  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }

  return context
}

export type { CartItem as CartItemType }