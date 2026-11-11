// app/panier/page.tsx
'use client'

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { Recommendations } from '@/components/Recommendations'
import DeliveryBreakdown from '@/components/DeliveryBreakdown'

import type { ShippingQuote } from '@/lib/shipping-utils'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Filter,
  Heart,
  Info,
  LayoutGrid,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Rows3,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  Undo2,
  X,
  Truck,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'
type Density = 'comfortable' | 'compact'
type SortMode = 'default' | 'price_asc' | 'price_desc' | 'name_asc'

interface RawCartItem {
  id?: string
  product_id?: string
  nom?: string
  name?: string
  prix?: number | null
  price?: number | null
  prix_usd?: number | null
  price_usd?: number | null
  prix_cdf?: number | null
  price_cdf?: number | null
  quantite?: number | null
  quantity?: number | null
  image?: string | null
  images?: string[] | null
  variante?: any
  stock?: number | null
  slug?: string
  delivery_config?: any
  poids_kg?: number | null
  logistics_group?: string | null
  non_consolidable?: boolean
  unit_price_usd?: number | null
  [key: string]: any
}

interface NormalizedCartItem extends RawCartItem {
  key: string
  originalId: string
  variantKey: string
  nom: string
  image: string
  quantity: number
  priceUsd: number
  priceCdf: number
  lineUsd: number
  lineCdf: number
  primaryAmount: number
  secondaryAmount: number
  primaryCurrency: Currency
  secondaryCurrency: Currency
  displayPrimary: string
  displaySecondary: string | null
  displayLinePrimary: string
  displayLineSecondary: string | null
  hasLowStock: boolean
  isOutOfStock: boolean
  nonConsolidable: boolean
}

interface SavedCartItem {
  id: string
  variantKey?: string
  addedAt: number
  item: RawCartItem
}

interface RecentProduct {
  id: string
  nom: string
  image?: string
  prix?: number
  prix_usd?: number
  timestamp: number
}

interface CartTotals {
  subtotalUsd: number
  subtotalCdf: number
  discountUsd: number
  discountCdf: number
  taxUsd: number
  taxCdf: number
  totalUsd: number
  totalCdf: number
  primaryTotal: number
  secondaryTotal: number
  primarySubtotal: number
  secondarySubtotal: number
  primaryDiscount: number
  secondaryDiscount: number
  primaryTax: number
  secondaryTax: number
  primaryCurrency: Currency
  secondaryCurrency: Currency
  savingsPrimary: number
  savingsSecondary: number
  shippingEstimateUsd: number
  shippingEstimateCdf: number
  shippingQuote: ShippingQuote | null
  hasNonConsolidable: boolean
  deliveryWarnings: string[]
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const STORAGE_KEYS = {
  prefs: 'gercie_cart_prefs_v5',
  saved: 'gercie_cart_saved_v5',
  recent: 'gercie_recent_products_v5',
}

const PLACEHOLDER = '/placeholder.jpg'
const LOW_STOCK_THRESHOLD = 5
const LOGIN_REDIRECT = `/login?redirect=${encodeURIComponent('/panier')}`

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toPositiveNumber(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function formatMoney(value: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

function safeLocalStorageGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeLocalStorageSet(key: string, value: any): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // silencieux
  }
}

function getItemImage(item: RawCartItem): string {
  if (typeof item.image === 'string' && item.image.trim()) return item.image
  if (Array.isArray(item.images) && item.images.length > 0) return item.images[0]
  return PLACEHOLDER
}

function getItemName(item: RawCartItem): string {
  return String(item.nom || item.name || 'Produit')
}

/**
 * Clé de variante stable (clés triées, valeurs vides ignorées).
 */
function stableVariantKey(variante: any): string {
  if (!variante) return ''

  if (typeof variante === 'string') {
    const trimmed = variante.trim()
    if (!trimmed) return ''

    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') {
        return stableVariantKey({ attributes: parsed })
      }
    } catch {
      return trimmed
    }

    return trimmed
  }

  const attrs = variante?.attributes

  if (!attrs || typeof attrs !== 'object') return ''

  const entries = Object.entries(attrs).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false
    return String(value).trim() !== ''
  })

  if (entries.length === 0) return ''

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  try {
    return JSON.stringify(Object.fromEntries(entries))
  } catch {
    return ''
  }
}

function getVariantLabel(item: RawCartItem): string | null {
  if (!item.variante) return null

  if (typeof item.variante === 'string') {
    const label = item.variante.trim()
    return label || null
  }

  const attrs = item.variante?.attributes

  if (attrs && typeof attrs === 'object') {
    const values = Object.entries(attrs)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .map(([, value]) => String(value))

    if (values.length > 0) return values.join(' • ')
  }

  const nom = item.variante?.nom || item.variante?.name

  if (nom) return String(nom)

  return null
}

function isItemNonConsolidable(item: RawCartItem): boolean {
  if (Boolean(item.non_consolidable)) return true

  const config = item.delivery_config

  if (!config?.modes) return false

  return Object.values(config.modes).some((mode: any) =>
    Boolean(
      mode?.mandatory_per_unit ||
        mode?.non_consolidable ||
        mode?.protect_margin ||
        mode?.calculation_mode === 'mandatory_per_unit'
    )
  )
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  NORMALISATION PRIX — CORRIGÉE
 *
 *  Règle absolue :
 *  - Si USD existe → USD = vérité, CDF = toCdf(USD, taux).
 *    Le CDF stocké est IGNORED (potentiellement obsolète).
 *  - Si seulement CDF existe → CDF = vérité, USD = toUsd(CDF, taux).
 *  - Aucun taux codé en dur.
 * ═══════════════════════════════════════════════════════════════
 */
function normalizeCartItem(
  item: RawCartItem,
  index: number,
  rate: number | null | undefined,
  currency: Currency
): NormalizedCartItem {
  const rawUsd = toPositiveNumber(
    item.prix_usd ?? item.price_usd ?? item.unit_price_usd
  )

  const rawCdf = toPositiveNumber(
    item.prix ?? item.price ?? item.prix_cdf ?? item.price_cdf
  )

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let priceUsd = 0
  let priceCdf = 0

  if (rawUsd != null) {
    /**
     * USD = source principale.
     * CDF est TOUJOURS recalculé depuis USD.
     * On ne fait jamais confiance au CDF stocké.
     */
    priceUsd = rawUsd
    priceCdf = rateOk ? roundCdf(toCdf(rawUsd, rateNum)) : 0
  } else if (rawCdf != null) {
    /**
     * Legacy : seulement un CDF existe.
     * On dérive un USD temporaire si le taux est disponible.
     */
    priceCdf = rawCdf
    priceUsd = rateOk ? roundUsd(toUsd(rawCdf, rateNum)) : 0
  }

  const quantity = Math.max(
    1,
    Math.floor(Number(item.quantite ?? item.quantity ?? 1) || 1)
  )

  const lineUsd = roundUsd(priceUsd * quantity)
  const lineCdf = roundCdf(priceCdf * quantity)

  const canUsd = priceUsd > 0
  const canCdf = priceCdf > 0

  let primaryCurrency: Currency = 'USD'

  if (currency === 'CDF' && canCdf) {
    primaryCurrency = 'CDF'
  } else if (!canUsd && canCdf) {
    primaryCurrency = 'CDF'
  }

  const secondaryCurrency: Currency =
    primaryCurrency === 'USD' ? 'CDF' : 'USD'

  const primaryAmount =
    primaryCurrency === 'USD' ? priceUsd : priceCdf
  const secondaryAmount =
    secondaryCurrency === 'USD' ? priceUsd : priceCdf

  const linePrimary =
    primaryCurrency === 'USD' ? lineUsd : lineCdf
  const lineSecondary =
    secondaryCurrency === 'USD' ? lineUsd : lineCdf

  const stock =
    typeof item.stock === 'number' && Number.isFinite(item.stock)
      ? item.stock
      : null

  const originalId = String(
    item.product_id || item.id || `${getItemName(item)}-${index}`
  )

  const variantKey = stableVariantKey(item.variante)

  return {
    ...item,
    key: `${originalId}::${variantKey}`,
    originalId,
    variantKey,
    nom: getItemName(item),
    image: getItemImage(item),
    quantity,
    priceUsd,
    priceCdf,
    lineUsd,
    lineCdf,
    primaryAmount,
    secondaryAmount,
    primaryCurrency,
    secondaryCurrency,
    displayPrimary: formatMoney(primaryAmount, primaryCurrency),
    displaySecondary:
      secondaryAmount > 0 && secondaryAmount !== primaryAmount
        ? formatMoney(secondaryAmount, secondaryCurrency)
        : null,
    displayLinePrimary: formatMoney(linePrimary, primaryCurrency),
    displayLineSecondary:
      lineSecondary > 0 && lineSecondary !== linePrimary
        ? formatMoney(lineSecondary, secondaryCurrency)
        : null,
    hasLowStock:
      stock !== null && stock > 0 && stock <= LOW_STOCK_THRESHOLD,
    isOutOfStock: stock === 0,
    nonConsolidable: isItemNonConsolidable(item),
  }
}

function computeCartTotals(
  items: NormalizedCartItem[],
  summary: any,
  rate: number | null | undefined,
  currency: Currency
): CartTotals {
  const computedSubtotalUsd = roundUsd(
    items.reduce((acc, i) => acc + i.lineUsd, 0)
  )
  const computedSubtotalCdf = roundCdf(
    items.reduce((acc, i) => acc + i.lineCdf, 0)
  )

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  const ctxSubtotalCdf = toPositiveNumber(
    summary?.sousTotal ?? summary?.subtotal ?? summary?.sous_total
  )

  const ctxSubtotalUsd = toPositiveNumber(
    summary?.sousTotalUSD ??
      summary?.subtotalUSD ??
      summary?.sous_total_usd
  )

  let subtotalUsd =
    computedSubtotalUsd > 0
      ? computedSubtotalUsd
      : ctxSubtotalUsd ??
        (ctxSubtotalCdf && rateOk
          ? roundUsd(toUsd(ctxSubtotalCdf, rateNum))
          : 0)

  let subtotalCdf =
    computedSubtotalCdf > 0
      ? computedSubtotalCdf
      : ctxSubtotalCdf ??
        (ctxSubtotalUsd && rateOk
          ? roundCdf(toCdf(ctxSubtotalUsd, rateNum))
          : 0)

  if (subtotalUsd <= 0 && subtotalCdf > 0 && rateOk) {
    subtotalUsd = roundUsd(toUsd(subtotalCdf, rateNum))
  }

  if (subtotalCdf <= 0 && subtotalUsd > 0 && rateOk) {
    subtotalCdf = roundCdf(toCdf(subtotalUsd, rateNum))
  }

  subtotalUsd = Number.isFinite(subtotalUsd) ? Math.max(0, subtotalUsd) : 0
  subtotalCdf = Number.isFinite(subtotalCdf) ? Math.max(0, subtotalCdf) : 0

  const ctxDiscountCdf = toPositiveNumber(
    summary?.remiseTotal ?? summary?.discount ?? summary?.remise_total
  )

  const ctxDiscountUsd = toPositiveNumber(
    summary?.remiseTotalUSD ??
      summary?.discountUSD ??
      summary?.remise_total_usd
  )

  let discountUsd =
    ctxDiscountUsd ??
    (ctxDiscountCdf && rateOk
      ? roundUsd(toUsd(ctxDiscountCdf, rateNum))
      : 0) ??
    0

  let discountCdf =
    ctxDiscountCdf ??
    (ctxDiscountUsd && rateOk
      ? roundCdf(toCdf(ctxDiscountUsd, rateNum))
      : 0) ??
    0

  if (discountUsd <= 0 && discountCdf > 0 && rateOk) {
    discountUsd = roundUsd(toUsd(discountCdf, rateNum))
  }

  if (discountCdf <= 0 && discountUsd > 0 && rateOk) {
    discountCdf = roundCdf(toCdf(discountUsd, rateNum))
  }

  discountUsd = Number.isFinite(discountUsd) ? Math.max(0, discountUsd) : 0
  discountCdf = Number.isFinite(discountCdf) ? Math.max(0, discountCdf) : 0

  if (discountUsd > subtotalUsd) discountUsd = subtotalUsd
  if (discountCdf > subtotalCdf) discountCdf = subtotalCdf

  const ctxTaxCdf = toPositiveNumber(summary?.taxe ?? summary?.tax)
  const ctxTaxUsd = toPositiveNumber(summary?.taxeUSD ?? summary?.taxUSD)

  let taxUsd =
    ctxTaxUsd ??
    (ctxTaxCdf && rateOk ? roundUsd(toUsd(ctxTaxCdf, rateNum)) : 0) ??
    0

  let taxCdf =
    ctxTaxCdf ??
    (ctxTaxUsd && rateOk ? roundCdf(toCdf(ctxTaxUsd, rateNum)) : 0) ??
    0

  taxUsd = Number.isFinite(taxUsd) ? Math.max(0, taxUsd) : 0
  taxCdf = Number.isFinite(taxCdf) ? Math.max(0, taxCdf) : 0

  const shippingQuote =
    (summary?.shippingQuote as ShippingQuote | null) ?? null

  const shippingEstimateUsd =
    toPositiveNumber(
      summary?.shippingEstimateUsd ?? shippingQuote?.total_usd
    ) ?? 0

  const shippingEstimateCdf =
    toPositiveNumber(
      summary?.shippingEstimateCdf ?? shippingQuote?.total_cdf
    ) ?? 0

  const hasNonConsolidable =
    Boolean(summary?.hasNonConsolidableItems) ||
    items.some((item) => item.nonConsolidable)

  const deliveryWarnings = Array.isArray(summary?.deliveryWarnings)
    ? summary.deliveryWarnings
    : []

  let totalUsd = roundUsd(Math.max(0, subtotalUsd - discountUsd + taxUsd))
  let totalCdf = roundCdf(Math.max(0, subtotalCdf - discountCdf + taxCdf))

  totalUsd = Number.isFinite(totalUsd) ? totalUsd : 0
  totalCdf = Number.isFinite(totalCdf) ? totalCdf : 0

  const primaryCurrency: Currency = currency === 'CDF' ? 'CDF' : 'USD'
  const secondaryCurrency: Currency =
    primaryCurrency === 'USD' ? 'CDF' : 'USD'

  const getPair = (usd: number, cdf: number) => ({
    primary: primaryCurrency === 'USD' ? usd : cdf,
    secondary: secondaryCurrency === 'USD' ? usd : cdf,
  })

  const subtotalPair = getPair(subtotalUsd, subtotalCdf)
  const discountPair = getPair(discountUsd, discountCdf)
  const taxPair = getPair(taxUsd, taxCdf)
  const totalPair = getPair(totalUsd, totalCdf)
  const shippingPair = getPair(shippingEstimateUsd, shippingEstimateCdf)

  return {
    subtotalUsd,
    subtotalCdf,
    discountUsd,
    discountCdf,
    taxUsd,
    taxCdf,
    totalUsd,
    totalCdf,
    primaryTotal: totalPair.primary,
    secondaryTotal: totalPair.secondary,
    primarySubtotal: subtotalPair.primary,
    secondarySubtotal: subtotalPair.secondary,
    primaryDiscount: discountPair.primary,
    secondaryDiscount: discountPair.secondary,
    primaryTax: taxPair.primary,
    secondaryTax: taxPair.secondary,
    primaryCurrency,
    secondaryCurrency,
    savingsPrimary: discountPair.primary,
    savingsSecondary: discountPair.secondary,
    shippingEstimateUsd: shippingPair.primary,
    shippingEstimateCdf: shippingPair.secondary,
    shippingQuote,
    hasNonConsolidable,
    deliveryWarnings,
  }
}

function buildRawSnapshot(item: NormalizedCartItem): RawCartItem {
  return {
    id: item.originalId,
    product_id: item.product_id ?? item.originalId,
    nom: item.nom,
    name: item.nom,
    prix: item.priceCdf || item.prix,
    price: item.priceCdf || item.price,
    prix_usd: item.priceUsd || item.prix_usd,
    price_usd: item.priceUsd || item.price_usd,
    quantite: item.quantity,
    quantity: item.quantity,
    image: item.image,
    images: item.images,
    variante: item.variante,
    stock: item.stock,
    slug: item.slug,
    delivery_config: item.delivery_config,
    poids_kg: item.poids_kg,
    logistics_group: item.logistics_group,
    non_consolidable: item.nonConsolidable,
  }
}

function makeSavedId(originalId: string, variantKey: string): string {
  return `${originalId}::${variantKey}`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MINI COMPOSANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function SummaryRow({
  label,
  value,
  secondary,
  tone = 'default',
  icon,
}: {
  label: string
  value: string
  secondary?: string | null
  tone?: 'default' | 'discount' | 'muted' | 'total'
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="text-gold-500">{icon}</span>}
        <span
          className={cn(
            'truncate',
            tone === 'total'
              ? 'font-semibold text-foreground'
              : tone === 'discount'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'font-medium',
            tone === 'total'
              ? 'text-lg font-bold text-gold-600'
              : tone === 'discount'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-foreground'
          )}
        >
          {value}
        </p>
        {secondary && (
          <p className="text-[11px] text-muted-foreground">{secondary}</p>
        )}
      </div>
    </div>
  )
}

function CartItemSkeleton({ compact }: { compact?: boolean }) {
  return (
    <Card className="border-gold-400/20">
      <CardContent className={cn('p-4', compact && 'sm:p-3')}>
        <div className="flex gap-4">
          <Skeleton className="h-24 w-24 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                */
/* ═══════════════════════════════════════════════════════════════ */

export default function PanierPage() {
  const router = useRouter()
  const cart = useCart() as any
  const { rate, loading: rateLoading } = useExchangeRate()
  const toast = useToast() as any
  const { user, loading: authLoading } = useAuth()

  const [mounted, setMounted] = useState(false)

  const [currency, setCurrency] = useState<Currency>('USD')
  const [showSecondary, setShowSecondary] = useState(true)
  const [density, setDensity] = useState<Density>('comfortable')
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [hideOutOfStock, setHideOutOfStock] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmClearSaved, setConfirmClearSaved] = useState(false)

  const [promoInput, setPromoInput] = useState('')
  const [applyingPromo, setApplyingPromo] = useState(false)

  const [savedForLater, setSavedForLater] = useState<SavedCartItem[]>([])
  const [recentlyViewed, setRecentlyViewed] = useState<RecentProduct[]>([])
  const [lastRemoved, setLastRemoved] = useState<{
    raw: RawCartItem
    label: string
  } | null>(null)

  const didInit = useRef(false)

  const removingKeysRef = useRef<Set<string>>(new Set())

  /* ---------------------------------------------------------- */
  /* Initialisation / persistance locale                         */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || didInit.current) return
    didInit.current = true

    const prefs = safeLocalStorageGet<{
      currency?: Currency
      showSecondary?: boolean
      density?: Density
      sortMode?: SortMode
      hideOutOfStock?: boolean
    }>(STORAGE_KEYS.prefs, {})

    if (prefs.currency === 'USD' || prefs.currency === 'CDF') {
      setCurrency(prefs.currency)
    }

    if (typeof prefs.showSecondary === 'boolean') {
      setShowSecondary(prefs.showSecondary)
    }

    if (prefs.density === 'comfortable' || prefs.density === 'compact') {
      setDensity(prefs.density)
    }

    if (
      prefs.sortMode === 'default' ||
      prefs.sortMode === 'price_asc' ||
      prefs.sortMode === 'price_desc' ||
      prefs.sortMode === 'name_asc'
    ) {
      setSortMode(prefs.sortMode)
    }

    if (typeof prefs.hideOutOfStock === 'boolean') {
      setHideOutOfStock(prefs.hideOutOfStock)
    }

    const savedRaw = safeLocalStorageGet<SavedCartItem[]>(STORAGE_KEYS.saved, [])

    const savedNormalized = Array.isArray(savedRaw)
      ? savedRaw
          .filter((s) => s && s.item)
          .map((s) => {
            const variantKey =
              s.variantKey ??
              stableVariantKey((s.item as any)?.variante)

            const id =
              s.id && s.id.includes('::')
                ? s.id
                : makeSavedId(
                    String(s.id || s.item?.id || s.item?.product_id || ''),
                    variantKey
                  )

            return {
              ...s,
              id,
              variantKey,
            }
          })
          .slice(0, 30)
      : []

    setSavedForLater(savedNormalized)

    const recent = safeLocalStorageGet<RecentProduct[]>(STORAGE_KEYS.recent, [])
    setRecentlyViewed(Array.isArray(recent) ? recent.slice(0, 8) : [])
  }, [mounted])

  useEffect(() => {
    if (!mounted) return

    safeLocalStorageSet(STORAGE_KEYS.prefs, {
      currency,
      showSecondary,
      density,
      sortMode,
      hideOutOfStock,
    })
  }, [currency, density, hideOutOfStock, mounted, showSecondary, sortMode])

  useEffect(() => {
    if (!mounted) return
    safeLocalStorageSet(STORAGE_KEYS.saved, savedForLater)
  }, [mounted, savedForLater])

  /* ---------------------------------------------------------- */
  /* Données panier                                              */
  /* ---------------------------------------------------------- */

  const rawItems: RawCartItem[] = useMemo(
    () => (Array.isArray(cart?.items) ? cart.items : []),
    [cart?.items]
  )

  const summary = cart?.summary || {}
  const activePromo = cart?.activePromo || null
  const promoError = cart?.promoError || null

  const cartLoading = Boolean(cart?.loading)
  const isSyncing = Boolean(cart?.isSyncing)
  const isOffline = Boolean(cart?.isOffline)
  const cartError = cart?.error || null

  const items = useMemo(() => {
    const seen = new Map<string, number>()

    return rawItems.map((raw, index) => {
      const normalized = normalizeCartItem(raw, index, rate, currency)

      const baseKey = `${normalized.originalId}::${normalized.variantKey}`
      const occurrence = seen.get(baseKey) ?? 0
      seen.set(baseKey, occurrence + 1)

      const key =
        occurrence === 0
          ? baseKey
          : `${baseKey}#${occurrence}`

      return {
        ...normalized,
        key,
      }
    })
  }, [currency, rawItems, rate])

  const totals = useMemo(
    () => computeCartTotals(items, summary, rate, currency),
    [currency, items, rate, summary]
  )

  const itemCount = useMemo(
    () => items.reduce((acc, i) => acc + i.quantity, 0),
    [items]
  )

  const outOfStockCount = useMemo(
    () => items.filter((i) => i.isOutOfStock).length,
    [items]
  )

  const nonConsolidableCount = useMemo(
    () => items.filter((i) => i.nonConsolidable).length,
    [items]
  )

  const visibleItems = useMemo(() => {
    let list = [...items]

    if (hideOutOfStock) {
      list = list.filter((item) => !item.isOutOfStock)
    }

    if (sortMode === 'price_asc') {
      list.sort((a, b) => a.lineUsd - b.lineUsd)
    } else if (sortMode === 'price_desc') {
      list.sort((a, b) => b.lineUsd - a.lineUsd)
    } else if (sortMode === 'name_asc') {
      list.sort((a, b) => a.nom.localeCompare(b.nom))
    }

    return list
  }, [hideOutOfStock, items, sortMode])

  const allSelected =
    visibleItems.length > 0 &&
    visibleItems.every((item) => selectedIds.has(item.key))

  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selectedIds.has(item.key)),
    [selectedIds, visibleItems]
  )

  const selectedCount = selectedItems.length

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev

      const validKeys = new Set(items.map((item) => item.key))
      const next = new Set<string>()

      prev.forEach((key) => {
        if (validKeys.has(key)) next.add(key)
      })

      if (next.size === prev.size) return prev
      return next
    })
  }, [items])

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const toggleSelect = useCallback((key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleItems.forEach((item) => next.delete(item.key))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleItems.forEach((item) => next.add(item.key))
        return next
      })
    }
  }, [allSelected, visibleItems])

  const updateQuantity = useCallback(
    async (item: NormalizedCartItem, nextQuantity: number) => {
      const qty = Math.max(1, Math.floor(nextQuantity))

      const fn =
        cart?.updateQuantity ||
        cart?.updateItemQuantity ||
        cart?.setItemQuantity

      if (typeof fn !== 'function') {
        toast?.addToast?.({
          type: 'error',
          message: "La mise à jour de quantité n'est pas disponible.",
        })
        return
      }

      try {
        await fn(item.originalId, qty, item.variantKey)
      } catch (err: any) {
        toast?.addToast?.({
          type: 'error',
          message: err?.message || 'Impossible de mettre à jour la quantité.',
        })
      }
    },
    [cart, toast]
  )

  const increment = useCallback(
    (item: NormalizedCartItem) => {
      void updateQuantity(item, item.quantity + 1)
    },
    [updateQuantity]
  )

  const decrement = useCallback(
    (item: NormalizedCartItem) => {
      if (item.quantity <= 1) return
      void updateQuantity(item, item.quantity - 1)
    },
    [updateQuantity]
  )

  const removeItem = useCallback(
    async (item: NormalizedCartItem) => {
      if (removingKeysRef.current.has(item.key)) return

      const fn = cart?.removeItem || cart?.deleteItem

      if (typeof fn !== 'function') {
        toast?.addToast?.({
          type: 'error',
          message: "La suppression n'est pas disponible.",
        })
        return
      }

      removingKeysRef.current.add(item.key)

      const snapshot = buildRawSnapshot(item)

      try {
        await fn(item.originalId, item.variantKey)

        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(item.key)
          return next
        })

        setLastRemoved({ raw: snapshot, label: item.nom })

        toast?.addToast?.({
          type: 'success',
          message: `${item.nom} retiré du panier.`,
        })
      } catch (err: any) {
        toast?.addToast?.({
          type: 'error',
          message: err?.message || 'Impossible de retirer ce produit.',
        })
      } finally {
        removingKeysRef.current.delete(item.key)
      }
    },
    [cart, toast]
  )

  const undoRemove = useCallback(async () => {
    if (!lastRemoved) return

    const addFn = cart?.addItem || cart?.add

    if (typeof addFn !== 'function') {
      toast?.addToast?.({
        type: 'error',
        message: "Impossible d'annuler la suppression.",
      })
      return
    }

    try {
      await addFn(lastRemoved.raw)
      toast?.addToast?.({
        type: 'success',
        message: 'Produit remis dans le panier.',
      })
      setLastRemoved(null)
    } catch (err: any) {
      toast?.addToast?.({
        type: 'error',
        message: err?.message || 'Impossible de restaurer le produit.',
      })
    }
  }, [cart, lastRemoved, toast])

  const bulkRemove = useCallback(async () => {
    if (selectedItems.length === 0) return

    const fn = cart?.removeItem || cart?.deleteItem

    if (typeof fn !== 'function') {
      toast?.addToast?.({
        type: 'error',
        message: "La suppression multiple n'est pas disponible.",
      })
      return
    }

    let removedCount = 0

    for (const item of selectedItems) {
      if (removingKeysRef.current.has(item.key)) continue

      removingKeysRef.current.add(item.key)

      try {
        await fn(item.originalId, item.variantKey)

        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(item.key)
          return next
        })

        removedCount++
      } catch (err: any) {
        toast?.addToast?.({
          type: 'error',
          message:
            err?.message ||
            `Erreur lors de la suppression de ${item.nom}.`,
        })
        break
      } finally {
        removingKeysRef.current.delete(item.key)
      }
    }

    if (removedCount > 0) {
      toast?.addToast?.({
        type: 'success',
        message: `${removedCount} produit(s) retiré(s).`,
      })
    }
  }, [cart, selectedItems, toast])

  const bulkSave = useCallback(async () => {
    if (selectedItems.length === 0) return

    const removeFn = cart?.removeItem || cart?.deleteItem

    if (typeof removeFn !== 'function') {
      toast?.addToast?.({
        type: 'error',
        message: 'Impossible de sauvegarder la sélection.',
      })
      return
    }

    let savedCount = 0

    for (const item of selectedItems) {
      if (removingKeysRef.current.has(item.key)) continue

      removingKeysRef.current.add(item.key)

      try {
        await removeFn(item.originalId, item.variantKey)

        const savedId = makeSavedId(item.originalId, item.variantKey)

        setSavedForLater((prev) => {
          const exists = prev.some((s) => s.id === savedId)
          if (exists) return prev

          return [
            {
              id: savedId,
              variantKey: item.variantKey,
              addedAt: Date.now(),
              item: buildRawSnapshot(item),
            },
            ...prev,
          ].slice(0, 30)
        })

        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(item.key)
          return next
        })

        savedCount++
      } catch (err: any) {
        toast?.addToast?.({
          type: 'error',
          message:
            err?.message ||
            `Erreur lors de la sauvegarde de ${item.nom}.`,
        })
        break
      } finally {
        removingKeysRef.current.delete(item.key)
      }
    }

    if (savedCount > 0) {
      toast?.addToast?.({
        type: 'success',
        message: `${savedCount} produit(s) sauvegardé(s).`,
      })
    }
  }, [cart, selectedItems, toast])

  const clearCart = useCallback(async () => {
    const fn = cart?.clearCart || cart?.emptyCart

    if (typeof fn !== 'function') {
      toast?.addToast?.({
        type: 'error',
        message: "La purge du panier n'est pas disponible.",
      })
      setConfirmClear(false)
      return
    }

    try {
      await fn()
      setSelectedIds(new Set())
      setConfirmClear(false)
      setLastRemoved(null)
      toast?.addToast?.({
        type: 'success',
        message: 'Panier vidé.',
      })
    } catch (err: any) {
      toast?.addToast?.({
        type: 'error',
        message: err?.message || 'Impossible de vider le panier.',
      })
    }
  }, [cart, toast])

  const moveToSaved = useCallback(
    async (item: NormalizedCartItem) => {
      if (removingKeysRef.current.has(item.key)) return

      const removeFn = cart?.removeItem || cart?.deleteItem

      if (typeof removeFn !== 'function') {
        toast?.addToast?.({
          type: 'error',
          message:
            'Impossible de sauvegarder ce produit pour plus tard.',
        })
        return
      }

      removingKeysRef.current.add(item.key)

      try {
        await removeFn(item.originalId, item.variantKey)

        const savedId = makeSavedId(item.originalId, item.variantKey)

        setSavedForLater((prev) => {
          const exists = prev.some((s) => s.id === savedId)
          if (exists) return prev

          return [
            {
              id: savedId,
              variantKey: item.variantKey,
              addedAt: Date.now(),
              item: buildRawSnapshot(item),
            },
            ...prev,
          ].slice(0, 30)
        })

        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(item.key)
          return next
        })

        toast?.addToast?.({
          type: 'success',
          message: 'Produit sauvegardé pour plus tard.',
        })
      } catch (err: any) {
        toast?.addToast?.({
          type: 'error',
          message: err?.message || 'Erreur lors de la sauvegarde.',
        })
      } finally {
        removingKeysRef.current.delete(item.key)
      }
    },
    [cart, toast]
  )

  const restoreSaved = useCallback(
    async (saved: SavedCartItem) => {
      const addFn = cart?.addItem || cart?.add

      if (typeof addFn !== 'function') {
        toast?.addToast?.({
          type: 'error',
          message:
            'Impossible de restaurer ce produit dans le panier.',
        })
        return
      }

      try {
        await addFn(saved.item)

        setSavedForLater((prev) => prev.filter((s) => s.id !== saved.id))

        toast?.addToast?.({
          type: 'success',
          message: 'Produit remis dans le panier.',
        })
      } catch (err: any) {
        toast?.addToast?.({
          type: 'error',
          message: err?.message || 'Erreur lors de la restauration.',
        })
      }
    },
    [cart, toast]
  )

  const restoreAllSaved = useCallback(async () => {
    if (savedForLater.length === 0) return

    const addFn = cart?.addItem || cart?.add

    if (typeof addFn !== 'function') {
      toast?.addToast?.({
        type: 'error',
        message:
          'Impossible de restaurer les produits sauvegardés.',
      })
      return
    }

    let restoredCount = 0

    for (const saved of savedForLater) {
      try {
        await addFn(saved.item)

        setSavedForLater((prev) => prev.filter((s) => s.id !== saved.id))

        restoredCount++
      } catch (err: any) {
        toast?.addToast?.({
          type: 'error',
          message:
            err?.message ||
            "Erreur lors de la restauration d'un produit sauvegardé.",
        })
        break
      }
    }

    if (restoredCount > 0) {
      toast?.addToast?.({
        type: 'success',
        message: `${restoredCount} produit(s) restauré(s).`,
      })
    }
  }, [cart, savedForLater, toast])

  const removeSaved = useCallback((id: string) => {
    setSavedForLater((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const clearSaved = useCallback(() => {
    setSavedForLater([])
    setConfirmClearSaved(false)
    toast?.addToast?.({
      type: 'success',
      message: 'Liste "plus tard" vidée.',
    })
  }, [toast])

  /* ---------------------------------------------------------- */
  /* Promo                                                       */
  /* ---------------------------------------------------------- */

  const applyPromo = useCallback(async () => {
    const code = promoInput.trim()

    if (!code) {
      toast?.addToast?.({
        type: 'error',
        message: 'Saisissez un code promo.',
      })
      return
    }

    const fn = cart?.applyPromoCode

    if (typeof fn !== 'function') {
      toast?.addToast?.({
        type: 'error',
        message: "Le code promo n'est pas disponible actuellement.",
      })
      return
    }

    setApplyingPromo(true)

    try {
      const result = await fn(code)

      const success =
        result === true ||
        (result && typeof result === 'object' && result.success !== false)

      if (!success) {
        const message =
          result?.error ||
          result?.promo?.message ||
          summary?.promoRequirementMessage ||
          'Code promo invalide.'

        const remaining = Number(
          result?.promo?.remainingToMinUsd ??
            summary?.promoRemainingUsd ??
            0
        )

        if (remaining > 0) {
          toast?.addToast?.({
            type: 'warning',
            message,
          })
          setPromoInput('')
          return
        }

        throw new Error(message)
      }

      toast?.addToast?.({
        type: 'success',
        message: 'Code promo appliqué.',
      })

      setPromoInput('')
    } catch (err: any) {
      toast?.addToast?.({
        type: 'error',
        message: err?.message || "Impossible d'appliquer ce code promo.",
      })
    } finally {
      setApplyingPromo(false)
    }
  }, [cart, promoInput, summary?.promoRemainingUsd, summary?.promoRequirementMessage, toast])

  const removePromo = useCallback(async () => {
    const fn = cart?.removePromoCode

    if (typeof fn !== 'function') {
      toast?.addToast?.({
        type: 'error',
        message: 'Impossible de retirer le code promo.',
      })
      return
    }

    try {
      await fn()
      toast?.addToast?.({
        type: 'info',
        message: 'Code promo retiré.',
      })
    } catch (err: any) {
      toast?.addToast?.({
        type: 'error',
        message:
          err?.message || 'Erreur lors du retrait du code promo.',
      })
    }
  }, [cart, toast])

  const goToCheckout = useCallback(() => {
    if (!user) {
      toast?.addToast?.({
        type: 'warning',
        message: 'Veuillez vous connecter pour passer commande.',
      })
      router.push(LOGIN_REDIRECT)
      return
    }

    if (items.length === 0) {
      toast?.addToast?.({
        type: 'error',
        message: 'Votre panier est vide.',
      })
      return
    }

    router.push('/commande')
  }, [items.length, router, toast, user])

  const buildCartSummaryText = useCallback(() => {
    const lines: string[] = []

    lines.push('Panier Gercie')
    lines.push(new Date().toLocaleString('fr-FR'))
    lines.push('')

    items.forEach((item) => {
      lines.push(
        `${item.nom} x${item.quantity} — ${item.displayLinePrimary}`
      )
    })

    lines.push('')
    lines.push(
      `Sous-total : ${formatMoney(totals.primarySubtotal, totals.primaryCurrency)}`
    )

    if (totals.primaryDiscount > 0) {
      lines.push(
        `Remise : -${formatMoney(totals.primaryDiscount, totals.primaryCurrency)}`
      )
    }

    if (totals.primaryTax > 0) {
      lines.push(
        `Taxes / frais : ${formatMoney(totals.primaryTax, totals.primaryCurrency)}`
      )
    }

    if (totals.shippingEstimateUsd > 0) {
      lines.push(
        `Livraison estimée : ${formatMoney(totals.shippingEstimateUsd, totals.primaryCurrency)}`
      )
    }

    lines.push(
      `Total hors livraison : ${formatMoney(totals.primaryTotal, totals.primaryCurrency)}`
    )

    return lines.join('\n')
  }, [items, totals])

  const copySummary = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildCartSummaryText())
      toast?.addToast?.({
        type: 'success',
        message: 'Récapitulatif du panier copié.',
      })
    } catch {
      toast?.addToast?.({
        type: 'error',
        message: 'Impossible de copier le récapitulatif.',
      })
    }
  }, [buildCartSummaryText, toast])

  const shareCart = useCallback(async () => {
    const text = buildCartSummaryText()

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Mon panier Gercie',
          text,
        })
      } else {
        await navigator.clipboard.writeText(text)
        toast?.addToast?.({
          type: 'success',
          message: 'Panier copié pour partage.',
        })
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast?.addToast?.({
          type: 'error',
          message: 'Impossible de partager le panier.',
        })
      }
    }
  }, [buildCartSummaryText, toast])

  const printCart = useCallback(() => {
    window.print()
  }, [])

  /* ---------------------------------------------------------- */
  /* Rendu chargement auth                                       */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 size={36} className="animate-spin text-gold-500" />
          <p className="text-sm text-muted-foreground">
            Vérification de votre session…
          </p>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu loading initial                                       */
  /* ---------------------------------------------------------- */

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-gold-500" size={32} />
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Connexion requise                                           */
  /* ---------------------------------------------------------- */

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
            <ShoppingCart size={30} className="text-gold-600 dark:text-gold-400" />
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            Connexion requise
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Veuillez vous connecter pour accéder à votre panier.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              variant="luxe"
              onClick={() => router.push(LOGIN_REDIRECT)}
              leftIcon={<ShoppingBag size={16} />}
            >
              Se connecter
            </Button>

            <Button
              variant="outline-gold"
              onClick={() => router.push('/')}
              leftIcon={<ArrowLeft size={16} />}
            >
              Retour à la boutique
            </Button>
          </div>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Panier vide                                                 */
  /* ---------------------------------------------------------- */

  if (!cartLoading && items.length === 0 && savedForLater.length === 0) {
    return (
      <div className="min-h-screen bg-background pb-16">
        <Container className="py-10 md:py-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-lg text-center"
          >
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-gold-400/30 bg-gold-400/10">
              <ShoppingCart size={40} className="text-gold-500" />
            </div>

            <h1 className="font-serif text-3xl font-extrabold text-foreground">
              Votre panier est vide
            </h1>

            <p className="mt-3 text-muted-foreground">
              Découvrez nos produits et ajoutez vos coups de cœur ici.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                variant="luxe"
                size="lg"
                onClick={() => router.push('/')}
                leftIcon={<ShoppingBag size={18} />}
              >
                Continuer mes achats
              </Button>

              <Button
                variant="outline-gold"
                size="lg"
                onClick={() => router.push('/profile?tab=favorites')}
                leftIcon={<Heart size={18} />}
              >
                Voir mes favoris
              </Button>
            </div>
          </motion.div>

          <section className="mt-14">
            <Recommendations
              type="trending"
              title="Populaire en ce moment"
              maxItems={4}
              cardVariant="compact"
            />
          </section>

          {recentlyViewed.length > 0 && (
            <section className="mt-12">
              <h2 className="mb-4 text-xl font-bold text-foreground">
                Vu récemment
              </h2>

              <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
                {recentlyViewed.map((item) => (
                  <Link
                    key={item.id}
                    href={`/produits/${item.id}`}
                    className="group min-w-[170px] max-w-[170px] rounded-2xl border border-border bg-card p-3 transition hover:border-gold-400/40 hover:shadow-card"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                      <Image
                        src={item.image || PLACEHOLDER}
                        alt={item.nom}
                        fill
                        sizes="170px"
                        className="object-cover transition group-hover:scale-105"
                      />
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                      {item.nom}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.prix_usd
                        ? formatUsd(Number(item.prix_usd))
                        : item.prix
                          ? formatCdf(Number(item.prix))
                          : '—'}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </Container>

        <ScrollToTop variant="circle" showProgress />
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  const promoIsMissingMinimum = Boolean(
    activePromo &&
      activePromo.valid === false &&
      (
        Number(activePromo.remainingToMinUsd ?? 0) > 0 ||
        Number(summary?.promoRemainingUsd ?? 0) > 0
      )
  )

  const promoMessage =
    summary?.promoRequirementMessage ||
    activePromo?.message ||
    promoError ||
    null

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-16">
      <Container className="py-8 md:py-12">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <nav
              aria-label="Fil d'Ariane"
              className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 transition hover:text-gold-500"
              >
                <ArrowLeft size={16} />
                Accueil
              </Link>

              <span>/</span>
              <span className="font-medium text-foreground">Panier</span>
            </nav>

            <h1 className="font-serif text-3xl font-extrabold text-foreground md:text-4xl">
              Mon panier
            </h1>

            <p className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>
                {itemCount} article{itemCount > 1 ? 's' : ''}
              </span>

              {isSyncing && (
                <span className="inline-flex items-center gap-1 text-xs text-gold-600">
                  <Loader2 size={12} className="animate-spin" />
                  Synchronisation...
                </span>
              )}

              {!isSyncing && !isOffline && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 size={12} />
                  À jour
                </span>
              )}

              {isOffline && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle size={12} />
                  Hors ligne
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Devise */}
            <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs">
              {(['USD', 'CDF'] as Currency[]).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setCurrency(curr)}
                  className={cn(
                    'rounded-full px-3 py-1.5 font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                    currency === curr
                      ? 'bg-gold-500 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-pressed={currency === curr}
                >
                  {curr}
                </button>
              ))}
            </div>

            {/* Prix secondaire */}
            <Tooltip
              content={
                showSecondary
                  ? 'Masquer le prix secondaire'
                  : 'Afficher le prix secondaire'
              }
            >
              <button
                type="button"
                onClick={() => setShowSecondary((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label={
                  showSecondary
                    ? 'Masquer le prix secondaire'
                    : 'Afficher le prix secondaire'
                }
              >
                {showSecondary ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </Tooltip>

            {/* Densité */}
            <Tooltip
              content={
                density === 'comfortable'
                  ? 'Mode compact'
                  : 'Mode confortable'
              }
            >
              <button
                type="button"
                onClick={() =>
                  setDensity((d) =>
                    d === 'comfortable' ? 'compact' : 'comfortable'
                  )
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label="Changer la densité d'affichage"
              >
                {density === 'comfortable' ? (
                  <Rows3 size={16} />
                ) : (
                  <LayoutGrid size={16} />
                )}
              </button>
            </Tooltip>

            {/* Masquer rupture */}
            <Tooltip
              content={
                hideOutOfStock
                  ? 'Afficher les articles en rupture'
                  : 'Masquer les articles en rupture'
              }
            >
              <button
                type="button"
                onClick={() => setHideOutOfStock((v) => !v)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                  hideOutOfStock
                    ? 'border-gold-400/50 bg-gold-500/10 text-gold-700 dark:text-gold-300'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={hideOutOfStock}
              >
                <Filter size={14} />
                Rupture
              </button>
            </Tooltip>

            {/* Tri */}
            <div className="relative">
              <ArrowUpDown
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="h-9 appearance-none rounded-full border border-border bg-card pl-8 pr-8 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label="Trier le panier"
              >
                <option value="default">Ordre actuel</option>
                <option value="price_asc">Prix croissant</option>
                <option value="price_desc">Prix décroissant</option>
                <option value="name_asc">Nom A-Z</option>
              </select>
            </div>

            {/* Copier */}
            <Tooltip content="Copier le récapitulatif">
              <button
                type="button"
                onClick={copySummary}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label="Copier le récapitulatif"
              >
                <Copy size={16} />
              </button>
            </Tooltip>

            {/* Partager */}
            <Tooltip content="Partager le panier">
              <button
                type="button"
                onClick={shareCart}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label="Partager le panier"
              >
                <Share2 size={16} />
              </button>
            </Tooltip>

            {/* Imprimer */}
            <Tooltip content="Imprimer le panier">
              <button
                type="button"
                onClick={printCart}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label="Imprimer le panier"
              >
                <Printer size={16} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Alertes */}
        {cartError && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Erreur panier</p>
              <p className="mt-1">{cartError}</p>
            </div>
          </div>
        )}

        {isOffline && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <RefreshCw size={18} className="mt-0.5 shrink-0" />
            <p>
              Vous êtes hors ligne. Vos modifications seront synchronisées
              automatiquement au retour de la connexion.
            </p>
          </div>
        )}

        {rateLoading && currency === 'USD' && totals.totalCdf > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <RefreshCw size={18} className="mt-0.5 shrink-0 animate-spin" />
            <p>
              Chargement du taux USD/CDF... Certains prix secondaires peuvent
              être temporairement indisponibles.
            </p>
          </div>
        )}

        {outOfStockCount > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">
                {outOfStockCount} article(s) en rupture
              </p>
              <p className="mt-1 text-xs opacity-90">
                Retirez-les ou sauvegardez-les pour plus tard avant de commander.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setHideOutOfStock(true)}
            >
              Masquer
            </Button>
          </div>
        )}

        {totals.hasNonConsolidable && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <Info size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">
                {nonConsolidableCount} article(s) avec frais de livraison spécifiques
              </p>
              <p className="mt-1 text-xs opacity-90">
                Ces articles gardent leurs frais de livraison obligatoires même
                si d'autres articles peuvent être regroupés. Le calcul final sera
                confirmé à l'étape commande.
              </p>
            </div>
          </div>
        )}

        {lastRemoved && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
          >
            <div className="flex items-center gap-2">
              <Undo2 size={18} />
              <span>
                <strong>{lastRemoved.label}</strong> a été retiré.
              </span>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setLastRemoved(null)}>
                Ignorer
              </Button>

              <Button variant="outline-gold" size="sm" onClick={undoRemove}>
                Annuler
              </Button>
            </div>
          </motion.div>
        )}

        {/* Toolbar sélection / actions groupées */}
        {items.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-sm">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border transition',
                  allSelected
                    ? 'border-gold-500 bg-gold-500 text-white'
                    : 'border-border bg-background'
                )}
              >
                {allSelected && <CheckCircle2 size={12} />}
              </span>
              Tout sélectionner
            </button>

            {selectedCount > 0 && (
              <>
                <span className="text-sm font-medium text-foreground">
                  {selectedCount} sélectionné(s)
                </span>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  leftIcon={<X size={14} />}
                >
                  Effacer
                </Button>

                <Button
                  variant="outline-gold"
                  size="sm"
                  onClick={bulkSave}
                  disabled={isSyncing}
                  leftIcon={<Bookmark size={14} />}
                >
                  Plus tard
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                  onClick={bulkRemove}
                  disabled={isSyncing}
                  leftIcon={<Trash2 size={14} />}
                >
                  Retirer
                </Button>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClear(true)}
                className="text-red-500 hover:bg-red-500/10"
                leftIcon={<Trash2 size={14} />}
              >
                Vider le panier
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation vidage panier */}
        <AnimatePresence>
          {confirmClear && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} />
                <span>Confirmer la suppression de tous les articles ?</span>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmClear(false)}
                >
                  Annuler
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                  onClick={clearCart}
                  leftIcon={<Trash2 size={14} />}
                >
                  Confirmer
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Liste articles */}
          <div className="space-y-4 lg:col-span-2">
            {cartLoading && items.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <CartItemSkeleton key={i} compact={density === 'compact'} />
                ))
              : visibleItems.length === 0 && items.length > 0
                ? (
                  <Card className="border-border bg-card/70">
                    <CardContent className="p-8 text-center">
                      <Filter size={32} className="mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">
                        Tous les articles visibles sont en rupture.
                      </p>
                      <Button
                        variant="outline-gold"
                        size="sm"
                        className="mt-4"
                        onClick={() => setHideOutOfStock(false)}
                      >
                        Afficher les ruptures
                      </Button>
                    </CardContent>
                  </Card>
                )
              : visibleItems.map((item) => {
                  const variantLabel = getVariantLabel(item)
                  const isSelected = selectedIds.has(item.key)
                  const isRemoving = removingKeysRef.current.has(item.key)

                  return (
                    <motion.div
                      key={item.key}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card
                        className={cn(
                          'overflow-hidden border transition',
                          isSelected
                            ? 'border-gold-400/50 bg-gold-500/5'
                            : 'border-border bg-card hover:border-gold-400/30'
                        )}
                      >
                        <CardContent
                          className={cn(
                            'p-4',
                            density === 'compact' ? 'sm:p-3' : 'sm:p-4'
                          )}
                        >
                          <div className="flex flex-col gap-4 sm:flex-row">
                            {/* Checkbox */}
                            <div className="flex items-start pt-1">
                              <button
                                type="button"
                                onClick={() => toggleSelect(item.key)}
                                className={cn(
                                  'flex h-5 w-5 items-center justify-center rounded border transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                                  isSelected
                                    ? 'border-gold-500 bg-gold-500 text-white'
                                    : 'border-border bg-background'
                                )}
                                aria-label={`Sélectionner ${item.nom}`}
                                aria-pressed={isSelected}
                              >
                                {isSelected && <CheckCircle2 size={14} />}
                              </button>
                            </div>

                            {/* Image */}
                            <Link
                              href={`/produits/${item.originalId}`}
                              className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted sm:h-28 sm:w-28"
                            >
                              <Image
                                src={item.image || PLACEHOLDER}
                                alt={item.nom}
                                fill
                                sizes="112px"
                                className="object-cover transition group-hover:scale-105"
                              />

                              {item.isOutOfStock && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white">
                                  Rupture
                                </div>
                              )}
                            </Link>

                            {/* Contenu */}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <Link
                                    href={`/produits/${item.originalId}`}
                                    className="line-clamp-2 font-semibold text-foreground transition hover:text-gold-600"
                                  >
                                    {item.nom}
                                  </Link>

                                  {variantLabel && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {variantLabel}
                                    </p>
                                  )}

                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {item.hasLowStock && (
                                      <Badge variant="warm" size="sm">
                                        <Clock size={10} className="mr-1" />
                                        Stock faible
                                      </Badge>
                                    )}

                                    {item.isOutOfStock && (
                                      <Badge variant="danger" size="sm">
                                        <AlertTriangle size={10} className="mr-1" />
                                        Rupture
                                      </Badge>
                                    )}

                                    {item.nonConsolidable && (
                                      <Badge variant="neutral" size="sm">
                                        <Truck size={10} className="mr-1" />
                                        Frais spécifiques
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                <div className="shrink-0 text-right">
                                  <p className="text-lg font-bold text-gold-600">
                                    {item.displayLinePrimary}
                                  </p>

                                  {showSecondary && item.displayLineSecondary && (
                                    <p className="text-xs text-muted-foreground">
                                      ≈ {item.displayLineSecondary}
                                    </p>
                                  )}

                                  {item.quantity > 1 && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {item.displayPrimary} / unité
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap items-center gap-3">
                                {/* Quantité */}
                                <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-background p-1">
                                  <button
                                    type="button"
                                    onClick={() => decrement(item)}
                                    disabled={
                                      item.quantity <= 1 ||
                                      item.isOutOfStock ||
                                      isSyncing ||
                                      isRemoving
                                    }
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold-500"
                                    aria-label="Diminuer la quantité"
                                  >
                                    <Minus size={14} />
                                  </button>

                                  <input
                                    type="number"
                                    min={1}
                                    max={item.stock ?? 99}
                                    value={item.quantity}
                                    disabled={item.isOutOfStock || isSyncing || isRemoving}
                                    onChange={(event) => {
                                      const value = Number(event.target.value)
                                      if (Number.isFinite(value)) {
                                        void updateQuantity(item, value)
                                      }
                                    }}
                                    className="w-12 bg-transparent text-center text-sm font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    aria-label={`Quantité pour ${item.nom}`}
                                  />

                                  <button
                                    type="button"
                                    onClick={() => increment(item)}
                                    disabled={
                                      item.isOutOfStock ||
                                      isSyncing ||
                                      isRemoving ||
                                      (item.stock != null &&
                                        item.quantity >= item.stock)
                                    }
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold-500"
                                    aria-label="Augmenter la quantité"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => moveToSaved(item)}
                                    disabled={isSyncing || isRemoving}
                                    leftIcon={<Bookmark size={14} />}
                                  >
                                    Plus tard
                                  </Button>

                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:bg-red-500/10"
                                    onClick={() => removeItem(item)}
                                    disabled={isSyncing || isRemoving}
                                    leftIcon={
                                      isRemoving ? (
                                        <Loader2 size={14} className="animate-spin" />
                                      ) : (
                                        <Trash2 size={14} />
                                      )
                                    }
                                  >
                                    {isRemoving ? 'Retrait...' : 'Retirer'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}

            {/* Sauvegardés pour plus tard */}
            {savedForLater.length > 0 && (
              <section className="mt-8">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                    <Bookmark size={20} className="text-gold-500" />
                    Sauvegardés pour plus tard
                    <Badge variant="neutral" size="sm">
                      {savedForLater.length}
                    </Badge>
                  </h2>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline-gold"
                      size="sm"
                      onClick={restoreAllSaved}
                      disabled={isSyncing}
                      leftIcon={<Undo2 size={14} />}
                    >
                      Tout remettre
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:bg-red-500/10"
                      onClick={() => setConfirmClearSaved(true)}
                      leftIcon={<Trash2 size={14} />}
                    >
                      Vider
                    </Button>
                  </div>
                </div>

                <AnimatePresence>
                  {confirmClearSaved && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={18} />
                        <span>Supprimer tous les produits sauvegardés ?</span>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmClearSaved(false)}
                        >
                          Annuler
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                          onClick={clearSaved}
                        >
                          Confirmer
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-3">
                  <AnimatePresence>
                    {savedForLater.map((saved) => {
                      const item = normalizeCartItem(
                        saved.item,
                        0,
                        rate,
                        currency
                      )

                      return (
                        <motion.div
                          key={saved.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                        >
                          <Card className="border-border bg-card/70">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                                  <Image
                                    src={item.image || PLACEHOLDER}
                                    alt={item.nom}
                                    fill
                                    sizes="64px"
                                    className="object-cover"
                                  />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {item.nom}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.displayPrimary}
                                  </p>
                                </div>

                                <div className="flex shrink-0 gap-2">
                                  <Button
                                    variant="outline-gold"
                                    size="sm"
                                    onClick={() => restoreSaved(saved)}
                                    disabled={isSyncing}
                                    leftIcon={<Undo2 size={14} />}
                                  >
                                    Remettre
                                  </Button>

                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:bg-red-500/10"
                                    onClick={() => removeSaved(saved.id)}
                                    leftIcon={<Trash2 size={14} />}
                                  >
                                    <span className="sr-only">Supprimer</span>
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              </section>
            )}
          </div>

          {/* Résumé */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold backdrop-blur-xl">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                      <ShoppingBag size={18} className="text-gold-500" />
                      Résumé du panier
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Prix affichés en {totals.primaryCurrency}
                      {totals.secondaryCurrency !== totals.primaryCurrency &&
                        ` • conversion ${totals.secondaryCurrency}`}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <SummaryRow
                      label="Sous-total"
                      value={formatMoney(
                        totals.primarySubtotal,
                        totals.primaryCurrency
                      )}
                      secondary={
                        showSecondary
                          ? `≈ ${formatMoney(
                              totals.secondarySubtotal,
                              totals.secondaryCurrency
                            )}`
                          : null
                      }
                      icon={<Package size={14} />}
                    />

                    {totals.primaryDiscount > 0 && (
                      <SummaryRow
                        label={
                          activePromo?.code
                            ? `Remise (${activePromo.code})`
                            : 'Remise'
                        }
                        value={`- ${formatMoney(
                          totals.primaryDiscount,
                          totals.primaryCurrency
                        )}`}
                        secondary={
                          showSecondary
                            ? `- ${formatMoney(
                                totals.secondaryDiscount,
                                totals.secondaryCurrency
                              )}`
                            : null
                        }
                        tone="discount"
                        icon={<Tag size={14} />}
                      />
                    )}

                    {totals.primaryTax > 0 && (
                      <SummaryRow
                        label="Taxes / frais"
                        value={formatMoney(
                          totals.primaryTax,
                          totals.primaryCurrency
                        )}
                        secondary={
                          showSecondary
                            ? `≈ ${formatMoney(
                                totals.secondaryTax,
                                totals.secondaryCurrency
                              )}`
                            : null
                        }
                        icon={<Info size={14} />}
                      />
                    )}

                    {/* Livraison estimée */}
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Truck size={14} className="text-gold-500" />
                          Livraison estimée
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Domicile · estimation consolidée
                        </p>

                        {totals.shippingQuote?.delay_label && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock size={10} />
                            {totals.shippingQuote.delay_label}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-semibold text-gold-600">
                          {totals.shippingEstimateUsd > 0
                            ? formatMoney(
                                totals.shippingEstimateUsd,
                                totals.primaryCurrency
                              )
                            : 'À confirmer'}
                        </p>

                        {showSecondary && totals.shippingEstimateCdf > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            ≈ {formatMoney(
                              totals.shippingEstimateCdf,
                              totals.secondaryCurrency
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Breakdown livraison */}
                    {totals.shippingQuote && (
                      <DeliveryBreakdown
                        quote={totals.shippingQuote}
                        primaryCurrency={totals.primaryCurrency}
                        defaultOpen={false}
                        compact
                      />
                    )}

                    {/* Warnings livraison */}
                    {totals.deliveryWarnings.length > 0 && (
                      <div className="space-y-2">
                        {totals.deliveryWarnings.map((warning, index) => (
                          <p
                            key={`${warning}-${index}`}
                            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                          >
                            {warning}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gold-400/20 pt-4">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Total hors livraison
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Le calcul final de livraison est confirmé à l'étape commande
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-2xl font-extrabold text-gold-600">
                          {formatMoney(
                            totals.primaryTotal,
                            totals.primaryCurrency
                          )}
                        </p>

                        {showSecondary && totals.secondaryTotal > 0 && (
                          <p className="text-xs text-muted-foreground">
                            ≈{' '}
                            {formatMoney(
                              totals.secondaryTotal,
                              totals.secondaryCurrency
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    {totals.savingsPrimary > 0 && (
                      <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        Vous économisez{' '}
                        {formatMoney(
                          totals.savingsPrimary,
                          totals.primaryCurrency
                        )}
                      </p>
                    )}
                  </div>

                  {/* Code promo */}
                  <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Tag size={14} className="text-gold-500" />
                      Code promo
                    </p>

                    {activePromo ? (
                      promoIsMissingMinimum ? (
                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                          <p className="font-semibold">
                            {activePromo.code}
                          </p>
                          <p className="text-xs">
                            {promoMessage ||
                              'Ce code promo nécessite un montant minimum dans le panier.'}
                          </p>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={removePromo}
                            leftIcon={<X size={14} />}
                          >
                            Retirer
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                              {activePromo.code}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Remise appliquée
                            </p>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={removePromo}
                            leftIcon={<X size={14} />}
                          >
                            Retirer
                          </Button>
                        </div>
                      )
                    ) : (
                      <div className="flex gap-2">
                        <input
                          value={promoInput}
                          onChange={(event) =>
                            setPromoInput(event.target.value.toUpperCase())
                          }
                          placeholder="Entrez votre code"
                          className="h-10 flex-1 rounded-xl border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                        />

                        <Button
                          variant="outline-gold"
                          size="sm"
                          onClick={applyPromo}
                          disabled={applyingPromo || !promoInput.trim()}
                          leftIcon={
                            applyingPromo ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Sparkles size={14} />
                            )
                          }
                        >
                          Appliquer
                        </Button>
                      </div>
                    )}

                    {promoError && !promoIsMissingMinimum && (
                      <p className="text-xs text-red-500">{promoError}</p>
                    )}
                  </div>

                  {/* CTA */}
                  <Button
                    variant="luxe"
                    fullWidth
                    size="lg"
                    className="shadow-gold hover:shadow-glow-gold"
                    disabled={items.length === 0 || isSyncing}
                    onClick={goToCheckout}
                    leftIcon={
                      isSyncing ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <CreditCard size={18} />
                      )
                    }
                  >
                    Passer à la commande
                  </Button>

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck size={14} className="text-gold-500" />
                      Paiement sécurisé Mobile Money / carte
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Info size={14} className="text-gold-500" />
                      Livraison et point de retrait choisis à l'étape suivante
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RefreshCw size={14} className="text-gold-500" />
                      Retour possible selon conditions produit
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recommandations */}
              <Recommendations
                type="cart-complementary"
                title="Complétez votre commande"
                maxItems={3}
                cardVariant="compact"
              />
            </div>
          </div>
        </div>

        {/* Récemment vus */}
        {recentlyViewed.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-4 text-xl font-bold text-foreground">
              Vu récemment
            </h2>

            <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
              {recentlyViewed.map((item) => (
                <Link
                  key={item.id}
                  href={`/produits/${item.id}`}
                  className="group min-w-[170px] max-w-[170px] rounded-2xl border border-border bg-card p-3 transition hover:border-gold-400/40 hover:shadow-card"
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                    <Image
                      src={item.image || PLACEHOLDER}
                      alt={item.nom}
                      fill
                      sizes="170px"
                      className="object-cover transition group-hover:scale-105"
                    />
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                    {item.nom}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.prix_usd
                      ? formatUsd(Number(item.prix_usd))
                      : item.prix
                        ? formatCdf(Number(item.prix))
                        : '—'}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </Container>

      {/* Barre mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="truncate text-lg font-bold text-gold-600">
              {formatMoney(totals.primaryTotal, totals.primaryCurrency)}
            </p>

            {showSecondary && totals.secondaryTotal > 0 && (
              <p className="truncate text-[11px] text-muted-foreground">
                ≈ {formatMoney(totals.secondaryTotal, totals.secondaryCurrency)}
              </p>
            )}
          </div>

          <Button
            variant="luxe"
            className="shrink-0"
            disabled={items.length === 0 || isSyncing}
            onClick={goToCheckout}
            leftIcon={
              isSyncing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ChevronRight size={16} />
              )
            }
          >
            Commander
          </Button>
        </div>
      </div>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}