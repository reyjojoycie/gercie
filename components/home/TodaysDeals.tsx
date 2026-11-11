// components/home/TodaysDeals.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import {
  motion,
  AnimatePresence,
} from 'framer-motion'

import { useQuery } from '@tanstack/react-query'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

import { useExchangeRate } from '@/hooks/useExchangeRate'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

import CountdownTimer from './CountdownTimer'

import { cn } from '@/lib/utils'

import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flame,
  Gift,
  Layers,
  Loader2,
  Package,
  Percent,
  RefreshCw,
  Share2,
  ShoppingCart,
  Sparkles,
  Tag,
  TrendingUp,
  WifiOff,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

type PromoType =
  | 'prix_fixe'
  | 'pourcentage'
  | 'flash'
  | 'lot_degressif'
  | 'cadeau'

/**
 * Données de base mises en cache.
 *
 * IMPORTANT :
 * - On ne cache PAS un CDF converti avec un taux donné.
 * - On cache les sources de prix.
 * - Le CDF affiché est recalculé à chaque rendu avec useExchangeRate().
 */
interface BaseDealProduct {
  id: string
  productName: string
  productImage?: string | null
  productCategory?: string
  endTime: string
  type_promo: PromoType
  stock_restant?: number
  ventes?: number
  description?: string
  nouveau?: boolean
  slug?: string

  /**
   * USD = source principale quand disponible.
   */
  dealUsdSource: number | null
  dealCdfSource: number | null

  originalUsdSource: number | null
  originalCdfSource: number | null

  /**
   * Remise brute fournie par l’API, si présente.
   * Elle peut servir à dériver un prix original.
   */
  rawDiscount: number

  delivery_config?: any
  poids_kg?: number | null

  [key: string]: any
}

/**
 * Données affichées, après application du taux courant.
 */
interface DisplayDealProduct extends BaseDealProduct {
  dealPriceUsd: number
  dealPriceCdf: number

  originalPriceUsd: number
  originalPriceCdf: number

  discount: number

  savingsUsd: number
  savingsCdf: number

  primaryCurrency: Currency | null
  secondaryCurrency: Currency | null

  primaryAmount: number
  secondaryAmount: number

  originalPrimaryAmount: number
  savingsPrimary: number

  hasPrice: boolean
  canAddToCart: boolean
}

type PillTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Cache v3 :
 * ancienne version stockait des prix CDF figés.
 * Nouvelle version stocke les sources de prix.
 */
const CACHE_KEY = 'gercie-todays-deals-cache-v3'
const CACHE_TTL = 5 * 60 * 1000
const CAROUSEL_INTERVAL = 8000
const REQUEST_TIMEOUT = 10000
const MAX_RETRIES = 2
const SWIPE_THRESHOLD = 50
const PRELOAD_NEXT = 2

const ALLOWED_PROMO_TYPES = new Set<PromoType>([
  'prix_fixe',
  'pourcentage',
  'flash',
  'lot_degressif',
  'cadeau',
])

/* ═══════════════════════════════════════════════════════════════ */
/*  DESIGN TOKENS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const pillTones: Record<PillTone, string> = {
  accent: 'border-accent/20 bg-accent-soft text-accent',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  danger: 'border-danger/20 bg-danger-soft text-danger',
  info: 'border-info/20 bg-info-soft text-info',
  neutral: 'border-line bg-muted text-fg-muted',
}

const promoConfig: Record<
  PromoType,
  {
    icon: React.ReactNode
    gradient: string
    tone: PillTone
    label: string
  }
> = {
  prix_fixe: {
    icon: <Tag size={14} aria-hidden="true" />,
    gradient: 'from-accent to-accent-hover',
    tone: 'accent',
    label: 'Prix choc',
  },
  pourcentage: {
    icon: <Percent size={14} aria-hidden="true" />,
    gradient: 'from-danger via-danger/85 to-danger/70',
    tone: 'danger',
    label: 'Réduction',
  },
  flash: {
    icon: <Zap size={14} aria-hidden="true" />,
    gradient: 'from-warning via-warning/85 to-warning/70',
    tone: 'warning',
    label: 'Flash',
  },
  lot_degressif: {
    icon: <Layers size={14} aria-hidden="true" />,
    gradient: 'from-info via-info/85 to-info/70',
    tone: 'info',
    label: 'Lot',
  },
  cadeau: {
    icon: <Gift size={14} aria-hidden="true" />,
    gradient: 'from-success via-success/85 to-success/70',
    tone: 'success',
    label: 'Cadeau',
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

  if (!Number.isFinite(n) || n <= 0) return null

  return n
}

function nonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

  if (!Number.isFinite(n) || n < 0) return null

  return n
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()

  return trimmed ? trimmed : null
}

function categoryLabel(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return (
      textOrNull(record.nom) ??
      textOrNull(record.name) ??
      textOrNull(record.label) ??
      undefined
    )
  }

  return undefined
}

function clampPercent(value: unknown): number {
  const n = Number(value)

  if (!Number.isFinite(n)) return 0

  return Math.max(0, Math.min(100, Math.round(n)))
}

function candidateNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = positiveNumber(value)

    if (n != null) return n
  }

  return null
}

function formatDealAmount(
  value: number | null | undefined,
  currency: Currency | null
): string {
  const n = Number(value || 0)

  if (!currency || !Number.isFinite(n) || n <= 0) return '—'

  return currency === 'USD' ? formatUsd(n) : formatCdf(n)
}

function getProductHref(deal: { id: string; slug?: string }): string {
  return `/produits/${deal.slug || deal.id}`
}

function normalizePromoType(value: unknown): PromoType {
  const raw = String(value ?? 'prix_fixe') as PromoType

  return ALLOWED_PROMO_TYPES.has(raw) ? raw : 'prix_fixe'
}

function normalizeEndTime(value: unknown): string {
  const raw = textOrNull(value)

  if (raw && !Number.isNaN(Date.parse(raw))) {
    return raw
  }

  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}

function firstImage(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }

    if (Array.isArray(value)) {
      const nested = firstImage(...value)

      if (nested) return nested
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>

      const nested = firstImage(
        record.url,
        record.src,
        record.path,
        record.secure_url,
        record.image_url
      )

      if (nested) return nested
    }
  }

  return null
}

function getCurrentPath(fallback = '/'): string {
  if (typeof window === 'undefined') return fallback

  const path = `${window.location.pathname}${window.location.search}`

  if (path.startsWith('/login')) return '/'

  return path
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION BASE                                             */
/*  Ne dépend pas du taux : le CDF est recalculé à l’affichage.    */
/* ═══════════════════════════════════════════════════════════════ */

function isBaseDealLike(data: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(data, 'dealUsdSource') ||
    Object.prototype.hasOwnProperty.call(data, 'dealCdfSource') ||
    Object.prototype.hasOwnProperty.call(data, 'originalUsdSource') ||
    Object.prototype.hasOwnProperty.call(data, 'originalCdfSource')
  )
}

function mapCachedBaseDeal(
  raw: Record<string, unknown>,
  index: number
): BaseDealProduct | null {
  const data = raw as Partial<BaseDealProduct> & Record<string, unknown>

  const id = textOrNull(data.id) ?? `deal-${index}`

  const productName =
    textOrNull(
      data.productName ??
        data.nom ??
        data.name ??
        data.title
    ) ?? ''

  if (!productName) return null

  const dealUsdSource = positiveNumber(data.dealUsdSource)
  const dealCdfSource = positiveNumber(data.dealCdfSource)

  if (dealUsdSource == null && dealCdfSource == null) return null

  return {
    ...data,

    id,
    productName,

    productImage:
      textOrNull(data.productImage) ??
      firstImage(data.images, data.image, data.image_url) ??
      null,

    productCategory:
      categoryLabel(data.productCategory) ??
      categoryLabel(data.categorie) ??
      categoryLabel(data.category) ??
      undefined,

    endTime: normalizeEndTime(data.endTime),

    type_promo: normalizePromoType(data.type_promo),

    stock_restant:
      nonNegativeNumber(data.stock_restant ?? data.stock) ?? undefined,

    ventes:
      nonNegativeNumber(data.ventes ?? data.total_ventes ?? data.sales) ?? 0,

    description: textOrNull(data.description ?? data.desc ?? data.excerpt) ?? undefined,

    nouveau: Boolean(data.nouveau ?? data.is_new),

    slug: textOrNull(data.slug) ?? undefined,

    dealUsdSource,
    dealCdfSource,

    originalUsdSource: positiveNumber(data.originalUsdSource),
    originalCdfSource: positiveNumber(data.originalCdfSource),

    rawDiscount: clampPercent(data.rawDiscount ?? data.discount),

    delivery_config: data.delivery_config ?? null,

    poids_kg: nonNegativeNumber(data.poids_kg ?? data.weight_kg) ?? null,
  }
}

function mapDeal(raw: unknown, index: number): BaseDealProduct | null {
  if (!raw || typeof raw !== 'object') return null

  const data = raw as Record<string, unknown>

  /*
   * Compatibilité cache v3 :
   * si l’objet ressemble déjà à une BaseDealProduct, on le réhydrate proprement.
   */
  if (isBaseDealLike(data)) {
    return mapCachedBaseDeal(data, index)
  }

  const product =
    (data.product as Record<string, unknown> | undefined) ??
    (data.produit as Record<string, unknown> | undefined) ??
    null

  const id =
    textOrNull(data.id ?? data._id ?? product?.id) ??
    `deal-${index}`

  const productName =
    textOrNull(
      data.productName ??
        data.title ??
        data.nom ??
        data.name ??
        data.product_name ??
        product?.nom ??
        product?.name
    ) ?? ''

  if (!productName) return null

  /* ---------------------------------------------------------- */
  /* Prix promo / deal                                           */
  /* ---------------------------------------------------------- */

  const promoUsd = candidateNumber(
    data.prix_promo_usd,
    data.promo_price_usd,
    data.deal_price_usd,
    data.discounted_price_usd,
    data.price_promo_usd,
    product?.prix_promo_usd,
    product?.promo_price_usd,
    product?.deal_price_usd
  )

  const promoCdf = candidateNumber(
    data.prix_promo,
    data.promo_price,
    data.dealPrice,
    data.deal_price,
    data.effective_price,
    data.current_price,
    data.price_promo,
    data.discounted_price,
    product?.prix_promo,
    product?.promo_price,
    product?.effective_price,
    product?.current_price
  )

  const baseUsd = candidateNumber(
    data.prix_usd,
    data.price_usd,
    data.unit_price_usd,
    product?.prix_usd,
    product?.price_usd,
    product?.unit_price_usd
  )

  const baseCdf = candidateNumber(
    data.prix,
    data.price,
    data.prix_cdf,
    data.price_cdf,
    product?.prix,
    product?.price,
    product?.prix_cdf,
    product?.price_cdf
  )

  let dealUsdSource: number | null = null
  let dealCdfSource: number | null = null

  if (promoUsd != null) {
    dealUsdSource = promoUsd
    dealCdfSource = promoCdf
  } else if (promoCdf != null) {
    dealUsdSource = null
    dealCdfSource = promoCdf
  } else {
    dealUsdSource = baseUsd
    dealCdfSource = baseCdf
  }

  if (dealUsdSource == null && dealCdfSource == null) return null

  /* ---------------------------------------------------------- */
  /* Prix original / barré                                       */
  /* ---------------------------------------------------------- */

  const explicitOriginalUsd = candidateNumber(
    data.prix_usd_original,
    data.original_price_usd,
    data.prix_initial_usd,
    data.originalPriceUsd,
    data.base_price_usd,
    product?.prix_usd_original,
    product?.original_price_usd
  )

  const explicitOriginalCdf = candidateNumber(
    data.prix_original,
    data.original_price,
    data.prix_comparatif,
    data.prix_initial,
    data.originalPrice,
    data.prix_normal,
    data.base_price,
    product?.prix_original,
    product?.original_price,
    product?.prix_comparatif
  )

  let originalUsdSource: number | null = null
  let originalCdfSource: number | null = null

  if (explicitOriginalUsd != null) {
    originalUsdSource = explicitOriginalUsd
    originalCdfSource = explicitOriginalCdf
  } else if (explicitOriginalCdf != null) {
    originalUsdSource = null
    originalCdfSource = explicitOriginalCdf
  } else if (promoUsd != null || promoCdf != null) {
    /**
     * Si l’API donne un prix promo mais pas de prix original explicite,
     * le prix de base devient le prix original.
     */
    originalUsdSource = baseUsd
    originalCdfSource = baseCdf
  }

  /* ---------------------------------------------------------- */
  /* Remise brute                                                */
  /* ---------------------------------------------------------- */

  const rawDiscount = clampPercent(
    data.discount ??
      data.remise_percent ??
      data.discount_percent ??
      product?.discount ??
      product?.remise_percent
  )

  /* ---------------------------------------------------------- */
  /* Autres champs                                               */
  /* ---------------------------------------------------------- */

  const productImage = firstImage(
    data.productImage,
    data.images,
    data.image,
    data.thumbnail,
    data.photo,
    data.image_url,
    product?.images,
    product?.image,
    product?.image_url
  )

  const productCategory =
    categoryLabel(data.productCategory) ??
    categoryLabel(data.categorie) ??
    categoryLabel(data.category) ??
    categoryLabel(product?.categorie) ??
    categoryLabel(product?.category) ??
    undefined

  const endTime = normalizeEndTime(
    data.endTime ??
      data.date_fin ??
      data.end_date ??
      data.ends_at ??
      product?.date_fin ??
      product?.ends_at
  )

  const type_promo = normalizePromoType(
    data.type_promo ??
      data.type ??
      data.promo_type ??
      product?.type_promo
  )

  const stock_restant =
    nonNegativeNumber(
      data.stock_restant ??
        data.stock ??
        product?.stock_restant ??
        product?.stock
    ) ?? undefined

  const ventes =
    nonNegativeNumber(
      data.ventes ??
        data.total_ventes ??
        data.sales ??
        product?.total_ventes ??
        product?.ventes
    ) ?? 0

  const description =
    textOrNull(
      data.description ??
        data.desc ??
        data.excerpt ??
        product?.description
    ) ?? undefined

  const createdAt =
    textOrNull(
      data.created_at ??
        data.createdAt ??
        product?.created_at
    )

  const isNewByDate =
    createdAt !== null &&
    Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000

  const nouveau =
    Boolean(
      data.nouveau ??
        data.is_new ??
        product?.nouveau ??
        product?.is_new
    ) || isNewByDate

  const slug =
    textOrNull(data.slug ?? product?.slug) ?? undefined

  const delivery_config =
    data.delivery_config ??
    product?.delivery_config ??
    null

  const poids_kg =
    nonNegativeNumber(
      data.poids_kg ??
        data.weight_kg ??
        product?.poids_kg ??
        product?.weight_kg
    ) ?? null

  return {
    id,
    productName,
    productImage,
    productCategory,
    endTime,
    type_promo,
    stock_restant,
    ventes,
    description,
    nouveau,
    slug,

    dealUsdSource,
    dealCdfSource,

    originalUsdSource,
    originalCdfSource,

    rawDiscount,

    delivery_config,
    poids_kg,
  }
}

function normalizeResponse(payload: unknown): BaseDealProduct[] {
  const array = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] })?.data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { promotions?: unknown[] })?.promotions)
        ? (payload as { promotions: unknown[] }).promotions
        : Array.isArray((payload as { deals?: unknown[] })?.deals)
          ? (payload as { deals: unknown[] }).deals
          : []

  return array
    .map((item, index) => mapDeal(item, index))
    .filter((item): item is BaseDealProduct => item !== null)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  APPLICATION DU TAUX USD → CDF À L’AFFICHAGE                    */
/* ═══════════════════════════════════════════════════════════════ */

function applyExchangeRateToDeal(
  base: BaseDealProduct,
  rate: number | null
): DisplayDealProduct {
  const r = positiveNumber(rate)

  let dealUsd = positiveNumber(base.dealUsdSource) ?? 0
  let dealCdf = positiveNumber(base.dealCdfSource) ?? 0

  /**
   * Si seulement un CDF legacy existe, on dérive un USD temporaire.
   */
  if (dealUsd <= 0 && dealCdf > 0 && r != null) {
    dealUsd = toUsd(dealCdf, r)
  }

  /**
   * USD = source principale.
   * Si USD existe et que le taux est disponible, le CDF est recalculé.
   */
  if (dealUsd > 0 && r != null) {
    dealCdf = toCdf(dealUsd, r)
  }

  let originalUsd = positiveNumber(base.originalUsdSource) ?? 0
  let originalCdf = positiveNumber(base.originalCdfSource) ?? 0

  if (originalUsd <= 0 && originalCdf > 0 && r != null) {
    originalUsd = toUsd(originalCdf, r)
  }

  if (originalUsd > 0 && r != null) {
    originalCdf = toCdf(originalUsd, r)
  }

  /* ---------------------------------------------------------- */
  /* Remise                                                     */
  /* ---------------------------------------------------------- */

  let discount = 0

  if (originalUsd > 0 && dealUsd > 0 && originalUsd > dealUsd) {
    discount = Math.round((1 - dealUsd / originalUsd) * 100)
  } else if (originalCdf > 0 && dealCdf > 0 && originalCdf > dealCdf) {
    discount = Math.round((1 - dealCdf / originalCdf) * 100)
  }

  if (discount <= 0 && base.rawDiscount > 0) {
    discount = base.rawDiscount
  }

  discount = clampPercent(discount)

  /* ---------------------------------------------------------- */
  /* Si remise connue mais prix original absent, on le dérive.   */
  /* ---------------------------------------------------------- */

  if (discount > 0) {
    const divisor = 1 - discount / 100

    if (divisor > 0) {
      if (originalUsd <= 0 && dealUsd > 0) {
        originalUsd = roundUsd(dealUsd / divisor)
      }

      if (originalCdf <= 0 && dealCdf > 0) {
        originalCdf =
          r != null && originalUsd > 0
            ? toCdf(originalUsd, r)
            : roundCdf(dealCdf / divisor)
      }
    }
  }

  /**
   * Cohérence finale :
   * si USD principal existe, le CDF original doit rester aligné.
   */
  if (originalUsd > 0 && r != null) {
    originalCdf = toCdf(originalUsd, r)
  }

  if (dealUsd > 0 && r != null) {
    dealCdf = toCdf(dealUsd, r)
  }

  if (originalUsd > 0 && originalUsd < dealUsd) {
    originalUsd = dealUsd
  }

  if (originalCdf > 0 && originalCdf < dealCdf) {
    originalCdf = dealCdf
  }

  /* ---------------------------------------------------------- */
  /* Économies                                                  */
  /* ---------------------------------------------------------- */

  const savingsUsd =
    originalUsd > 0 && dealUsd > 0
      ? Math.max(0, roundUsd(originalUsd - dealUsd))
      : 0

  const savingsCdf =
    savingsUsd > 0 && r != null
      ? toCdf(savingsUsd, r)
      : originalCdf > 0 && dealCdf > 0
        ? Math.max(0, roundCdf(originalCdf - dealCdf))
        : 0

  /* ---------------------------------------------------------- */
  /* Devise principale / secondaire                              */
  /* ---------------------------------------------------------- */

  const primaryCurrency: Currency | null =
    dealUsd > 0
      ? 'USD'
      : dealCdf > 0
        ? 'CDF'
        : null

  const secondaryCurrency: Currency | null =
    primaryCurrency === 'USD'
      ? 'CDF'
      : primaryCurrency === 'CDF'
        ? 'USD'
        : null

  const primaryAmount =
    primaryCurrency === 'USD'
      ? dealUsd
      : primaryCurrency === 'CDF'
        ? dealCdf
        : 0

  const secondaryAmount =
    secondaryCurrency === 'USD'
      ? dealUsd
      : secondaryCurrency === 'CDF'
        ? dealCdf
        : 0

  const originalPrimaryAmount =
    primaryCurrency === 'USD'
      ? originalUsd
      : primaryCurrency === 'CDF'
        ? originalCdf
        : 0

  const savingsPrimary =
    primaryCurrency === 'USD'
      ? savingsUsd
      : primaryCurrency === 'CDF'
        ? savingsCdf
        : 0

  const hasPrice = primaryAmount > 0

  /**
   * Le panier legacy attend encore un prix CDF exploitable.
   * On désactive l’ajout tant que le CDF n’est pas prêt.
   */
  const canAddToCart =
    hasPrice &&
    dealCdf > 0 &&
    base.stock_restant !== 0

  return {
    ...base,

    dealPriceUsd: roundUsd(dealUsd),
    dealPriceCdf: roundCdf(dealCdf),

    originalPriceUsd: roundUsd(originalUsd),
    originalPriceCdf: roundCdf(originalCdf),

    discount,

    savingsUsd,
    savingsCdf,

    primaryCurrency,
    secondaryCurrency,

    primaryAmount,
    secondaryAmount,

    originalPrimaryAmount,
    savingsPrimary,

    hasPrice,
    canAddToCart,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface CacheEntry {
  deals: BaseDealProduct[]
  timestamp: number
}

function readCacheEntry(): CacheEntry | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(CACHE_KEY)

    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      deals?: unknown[]
      timestamp?: number
    }

    if (
      !parsed ||
      !Array.isArray(parsed.deals) ||
      typeof parsed.timestamp !== 'number'
    ) {
      return null
    }

    const deals = parsed.deals
      .map((deal, index) => mapDeal(deal, index))
      .filter((deal): deal is BaseDealProduct => deal !== null)

    if (deals.length === 0) return null

    return {
      deals,
      timestamp: parsed.timestamp,
    }
  } catch (err) {
    console.warn('Erreur lecture cache deals:', err)
    return null
  }
}

function setCache(deals: BaseDealProduct[]): void {
  if (typeof window === 'undefined') return

  try {
    const entry: CacheEntry = {
      deals,
      timestamp: Date.now(),
    }

    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch (err) {
    console.warn('Erreur écriture cache deals:', err)
  }
}

function isCacheValid(entry: CacheEntry | null): boolean {
  if (!entry) return false

  return Date.now() - entry.timestamp < CACHE_TTL
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UI PRIMITIVES                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function Pill({
  tone = 'neutral',
  icon,
  children,
  className,
  pulse = false,
}: {
  tone?: PillTone
  icon?: React.ReactNode
  children?: React.ReactNode
  className?: string
  pulse?: boolean
}) {
  if (!children) return null

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5',
        'text-[10px] font-bold leading-none shadow-sm',
        pillTones[tone],
        pulse && 'animate-pulse',
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export default function TodaysDeals() {
  const router = useRouter()

  const cart = useCart() as any
  const toast = useToast() as any
  const addToast = toast?.addToast

  const { user, loading: authLoading } = useAuth()
  const { prefersReducedMotion } = useAccessibilityPreferences()

  const onlineStatus = useOnlineStatus() as unknown
  const isOnline =
    typeof onlineStatus === 'boolean'
      ? onlineStatus
      : Boolean((onlineStatus as { isOnline?: boolean })?.isOnline ?? true)

  const exchange = useExchangeRate() as any

  const rawRate = positiveNumber(
    exchange?.rate ??
      exchange?.usdRate ??
      exchange?.data?.rate ??
      exchange?.data?.current?.rate
  )

  const sectionRef = useRef<HTMLElement | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const [mounted, setMounted] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isFullWidth, setIsFullWidth] = useState(false)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [isInView, setIsInView] = useState(true)
  const [isPageHidden, setIsPageHidden] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   * On évite donc d’utiliser le taux avant hydratation.
   */
  const safeRate = mounted ? rawRate : null

  /* ───────────────────────────────────────────────────────────── */
  /*  CACHE INITIAL                                                */
  /* ───────────────────────────────────────────────────────────── */

  const cachedEntry = useMemo(() => readCacheEntry(), [])
  const cachedInitial = cachedEntry?.deals ?? []
  const hasInitialCache = cachedInitial.length > 0

  /* ───────────────────────────────────────────────────────────── */
  /*  QUERY                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const {
    data: queryData,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery<BaseDealProduct[]>({
    queryKey: ['active-deals-home-v3'],
    queryFn: async () => {
      const cached = readCacheEntry()

      if (cached && isCacheValid(cached)) {
        return cached.deals
      }

      let lastError: Error | null = null

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          controller.abort()
        }, REQUEST_TIMEOUT)

        try {
          const response = await fetch('/api/promotions/actives', {
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
            },
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const payload = await response.json()
          const deals = normalizeResponse(payload)

          if (deals.length > 0) {
            setCache(deals)
            return deals
          }

          return []
        } catch (err: unknown) {
          clearTimeout(timeoutId)

          const normalizedError =
            err instanceof Error ? err : new Error(String(err))

          lastError = normalizedError

          if (normalizedError.name === 'AbortError') {
            break
          }

          if (attempt < MAX_RETRIES) {
            await sleep(1000 * Math.pow(2, attempt))
          }
        }
      }

      const expiredCache = readCacheEntry()

      if (expiredCache) {
        return expiredCache.deals
      }

      throw lastError ?? new Error('Erreur chargement des offres')
    },
    initialData: hasInitialCache ? cachedInitial : undefined,
    staleTime: 2 * 60 * 1000,
    retry: false,
    enabled: isOnline || !hasInitialCache,
  })

  const basePromotions = useMemo<BaseDealProduct[]>(() => {
    return Array.isArray(queryData) ? queryData : []
  }, [queryData])

  /**
   * Produits affichés avec taux courant.
   * Le cache reste intact, seul l’affichage est recalculé.
   */
  const promotions = useMemo<DisplayDealProduct[]>(
    () =>
      basePromotions.map((deal) =>
        applyExchangeRateToDeal(deal, safeRate)
      ),
    [basePromotions, safeRate]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  SAFE INDEX                                                   */
  /* ───────────────────────────────────────────────────────────── */

  const safeIndex =
    promotions.length === 0
      ? 0
      : Math.min(currentIndex, promotions.length - 1)

  const currentDeal = promotions[safeIndex] ?? null

  useEffect(() => {
    if (promotions.length > 0 && currentIndex >= promotions.length) {
      setCurrentIndex(0)
    }
  }, [currentIndex, promotions.length])

  /* ───────────────────────────────────────────────────────────── */
  /*  MOBILE DETECTION                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(max-width: 767px)')

    const update = () => setIsMobile(mediaQuery.matches)
    update()

    mediaQuery.addEventListener('change', update)

    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  PAGE VISIBILITY                                              */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibility = () => setIsPageHidden(document.hidden)
    handleVisibility()

    document.addEventListener('visibilitychange', handleVisibility)

    return () =>
      document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  INTERSECTION OBSERVER                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const element = sectionRef.current

    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting)
      },
      { threshold: 0.25 }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  PRELOAD IMAGES                                               */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (promotions.length === 0) return

    const length = promotions.length

    for (let offset = 1; offset <= PRELOAD_NEXT; offset += 1) {
      const index = (safeIndex + offset) % length
      const deal = promotions[index]

      if (deal?.productImage) {
        const img = new window.Image()
        img.src = deal.productImage
      }
    }
  }, [promotions, safeIndex])

  /* ───────────────────────────────────────────────────────────── */
  /*  NAVIGATION                                                   */
  /* ───────────────────────────────────────────────────────────── */

  const nextDeal = useCallback(() => {
    if (promotions.length === 0) return

    setCurrentIndex((previous) => (previous + 1) % promotions.length)
  }, [promotions.length])

  const prevDeal = useCallback(() => {
    if (promotions.length === 0) return

    setCurrentIndex(
      (previous) => (previous - 1 + promotions.length) % promotions.length
    )
  }, [promotions.length])

  const goToDeal = useCallback((index: number) => {
    setCurrentIndex(index)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTOPLAY                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const shouldAutoPlay =
    !isPaused &&
    !isPageHidden &&
    isInView &&
    promotions.length > 1 &&
    !prefersReducedMotion

  useEffect(() => {
    if (!shouldAutoPlay) return

    const intervalId = window.setInterval(() => {
      setCurrentIndex((previous) => {
        if (promotions.length === 0) return previous
        return (previous + 1) % promotions.length
      })
    }, CAROUSEL_INTERVAL)

    return () => window.clearInterval(intervalId)
  }, [prefersReducedMotion, promotions.length, safeIndex, shouldAutoPlay])

  /* ───────────────────────────────────────────────────────────── */
  /*  TOUCH SWIPE                                                  */
  /* ───────────────────────────────────────────────────────────── */

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      touchStartRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      }
    },
    []
  )

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      if (!touchStartRef.current) return

      const startX = touchStartRef.current.x
      const startY = touchStartRef.current.y

      const endX = event.changedTouches[0].clientX
      const endY = event.changedTouches[0].clientY

      const deltaX = endX - startX
      const deltaY = endY - startY

      if (
        Math.abs(deltaX) > SWIPE_THRESHOLD &&
        Math.abs(deltaX) > Math.abs(deltaY)
      ) {
        if (deltaX > 0) {
          prevDeal()
        } else {
          nextDeal()
        }
      }

      touchStartRef.current = null
    },
    [nextDeal, prevDeal]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTH GUARD                                                   */
  /* ───────────────────────────────────────────────────────────── */

  const requireAuth = useCallback(
    (message: string) => {
      if (authLoading) {
        addToast?.({
          type: 'info',
          message: 'Connexion en cours, veuillez patienter…',
        })
        return false
      }

      if (user) return true

      addToast?.({
        type: 'warning',
        message,
      })

      router.push(
        `/login?redirect=${encodeURIComponent(getCurrentPath('/'))}`
      )

      return false
    },
    [addToast, authLoading, router, user]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  ACTIONS                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const handleQuickAdd = useCallback(
    async (deal: DisplayDealProduct) => {
      if (deal.stock_restant === 0) {
        addToast?.({
          type: 'error',
          message: 'Ce produit est en rupture de stock.',
        })
        return
      }

      if (!deal.hasPrice) {
        addToast?.({
          type: 'warning',
          message: `${deal.productName} est sur demande.`,
        })
        return
      }

      if (!deal.canAddToCart) {
        addToast?.({
          type: 'info',
          message: 'Conversion CDF en cours, réessayez dans quelques secondes.',
        })
        return
      }

      if (!requireAuth('Veuillez vous connecter pour ajouter au panier.')) {
        return
      }

      const addFn = cart?.addItem

      if (typeof addFn !== 'function') {
        addToast?.({
          type: 'error',
          message: 'Le panier est momentanément indisponible.',
        })
        return
      }

      setAddingId(deal.id)

      try {
        const payload = {
          id: deal.id,
          product_id: deal.id,
          nom: deal.productName,

          /**
           * Legacy panier : CDF.
           */
          prix: deal.dealPriceCdf,

          /**
           * USD = source principale.
           */
          prix_usd: deal.dealPriceUsd > 0 ? deal.dealPriceUsd : undefined,
          unit_price_usd:
            deal.dealPriceUsd > 0 ? deal.dealPriceUsd : undefined,

          quantite: 1,

          image: deal.productImage ?? undefined,

          prix_initial:
            deal.originalPriceCdf > deal.dealPriceCdf
              ? deal.originalPriceCdf
              : undefined,

          remise: deal.discount > 0 ? deal.discount : undefined,

          delivery_config: deal.delivery_config ?? null,
          poids_kg: deal.poids_kg ?? null,

          variante: undefined,
        } as any

        await addFn(payload, 1)

        addToast?.({
          type: 'success',
          message: `${deal.productName} ajouté au panier.`,
        })
      } catch {
        addToast?.({
          type: 'error',
          message: 'Impossible d’ajouter ce produit au panier.',
        })
      } finally {
        setAddingId(null)
      }
    },
    [addToast, cart, requireAuth]
  )

  const handleShare = useCallback(
    async (deal: DisplayDealProduct) => {
      const url = `${window.location.origin}${getProductHref(deal)}`

      const primaryText = formatDealAmount(
        deal.primaryAmount,
        deal.primaryCurrency
      )

      try {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: deal.productName,
            text: `Découvrez cette offre : ${deal.productName} à ${primaryText}`,
            url,
          })
        } else if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard
        ) {
          await navigator.clipboard.writeText(url)
          addToast?.({
            type: 'success',
            message: 'Lien de l’offre copié.',
          })
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('Erreur partage offre:', err)
        }
      }
    },
    [addToast]
  )

  const handleImageError = useCallback((dealId: string) => {
    setImageErrors((previous) => {
      const next = new Set(previous)
      next.add(dealId)
      return next
    })
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER STATES                                                */
  /* ───────────────────────────────────────────────────────────── */

  if (isLoading && promotions.length === 0) {
    return (
      <section
        className="relative overflow-hidden bg-canvas py-8 sm:py-10 md:py-14"
        aria-label="Chargement des offres du jour"
      >
        <Container>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton variant="text" className="h-7 w-44 rounded-full" />
              <Skeleton variant="text" className="h-4 w-64 rounded-full" />
            </div>

            <Skeleton variant="text" className="h-8 w-24 rounded-pill" />
          </div>

          <div className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-6 md:p-8">
            <div className="flex flex-col items-center gap-5 md:flex-row md:items-center">
              <Skeleton
                variant="rectangular"
                className="h-28 w-28 rounded-xl md:h-40 md:w-40"
              />

              <div className="w-full flex-1 space-y-3">
                <Skeleton variant="text" className="h-5 w-1/3 rounded-full" />
                <Skeleton variant="text" className="h-7 w-2/3 rounded-full" />
                <Skeleton variant="text" className="h-4 w-1/2 rounded-full" />

                <div className="flex gap-3 pt-2">
                  <Skeleton
                    variant="rectangular"
                    className="h-10 w-32 rounded-control"
                  />
                  <Skeleton
                    variant="rectangular"
                    className="h-10 w-32 rounded-control"
                  />
                </div>
              </div>
            </div>
          </div>

          <span className="sr-only">Chargement des offres…</span>
        </Container>
      </section>
    )
  }

  if (isError && promotions.length === 0) {
    return (
      <section className="relative overflow-hidden bg-canvas py-8 sm:py-10 md:py-14">
        <Container>
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-card border border-danger/20 bg-danger-soft px-6 py-12 text-center"
            role="alert"
          >
            <AlertTriangle
              size={32}
              className="text-danger"
              aria-hidden="true"
            />

            <p className="text-sm font-semibold text-danger">
              Impossible de charger les offres du jour.
            </p>

            <p className="max-w-sm text-xs text-fg-muted">
              Une erreur est survenue lors de la récupération des promotions
              actives.
            </p>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshCw size={14} aria-hidden="true" />}
            >
              Réessayer
            </Button>
          </div>
        </Container>
      </section>
    )
  }

  if (
    !isLoading &&
    !isFetching &&
    !isError &&
    promotions.length === 0
  ) {
    return null
  }

  if (!currentDeal) {
    return null
  }

  const promo = promoConfig[currentDeal.type_promo] ?? promoConfig.prix_fixe
  const hasImageError = imageErrors.has(currentDeal.id)
  const isOutOfStock = currentDeal.stock_restant === 0

  const primaryText = formatDealAmount(
    currentDeal.primaryAmount,
    currentDeal.primaryCurrency
  )

  const secondaryText =
    currentDeal.secondaryAmount > 0 &&
    currentDeal.secondaryAmount !== currentDeal.primaryAmount
      ? `≈ ${formatDealAmount(
          currentDeal.secondaryAmount,
          currentDeal.secondaryCurrency
        )}`
      : null

  const originalText =
    currentDeal.originalPrimaryAmount > currentDeal.primaryAmount &&
    currentDeal.originalPrimaryAmount > 0
      ? formatDealAmount(
          currentDeal.originalPrimaryAmount,
          currentDeal.primaryCurrency
        )
      : null

  const savingsText =
    currentDeal.savingsPrimary > 0
      ? `Économisez ${formatDealAmount(
          currentDeal.savingsPrimary,
          currentDeal.primaryCurrency
        )}`
      : null

  const isAddingCurrent = addingId === currentDeal.id

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-canvas py-8 sm:py-10 md:py-14"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
      aria-labelledby="todays-deals-heading"
    >
      {/* Fond décoratif sobre */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-muted/40 to-transparent"
        aria-hidden="true"
      />

      <Container className={cn(isFullWidth && 'max-w-none')}>
        {/* ====================================================
            HEADER
           ==================================================== */}
        <div className="relative mb-5 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  'border border-accent/20 bg-accent-soft text-accent shadow-card'
                )}
                aria-hidden="true"
              >
                <Zap size={20} strokeWidth={2} />
              </span>

              <div className="min-w-0">
                <h2
                  id="todays-deals-heading"
                  className="text-balance text-xl font-bold tracking-tight text-fg sm:text-2xl md:text-3xl"
                >
                  Offres flash
                </h2>

                <p className="mt-1 text-xs text-fg-muted sm:text-sm">
                  {promotions.length} offre
                  {promotions.length > 1 ? 's' : ''} à saisir maintenant
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!isOnline && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-pill border border-warning/20',
                  'bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning'
                )}
                title="Mode hors ligne — données en cache"
              >
                <WifiOff size={12} aria-hidden="true" />
                Hors ligne
              </span>
            )}

            {promotions.length > 1 && (
              <div
                className="hidden items-center gap-1 md:flex"
                role="group"
                aria-label="Navigation des offres"
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={prevDeal}
                  className="h-9 w-9 p-0"
                  aria-label="Offre précédente"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={nextDeal}
                  className="h-9 w-9 p-0"
                  aria-label="Offre suivante"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </div>
            )}

            {promotions.length > 1 && (
              <div
                className="hidden items-center gap-1.5 md:flex"
                role="tablist"
                aria-label="Sélection de l’offre"
              >
                {promotions.map((deal, index) => (
                  <button
                    key={deal.id}
                    type="button"
                    onClick={() => goToDeal(index)}
                    role="tab"
                    aria-selected={index === safeIndex}
                    aria-label={`Aller à l’offre ${index + 1} : ${deal.productName}`}
                    className={cn(
                      'h-2 rounded-full transition-all duration-300',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                      index === safeIndex
                        ? 'w-6 bg-accent'
                        : 'w-2 bg-fg-subtle/35 hover:bg-fg-subtle/60'
                    )}
                  />
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsFullWidth((previous) => !previous)}
              className="hidden text-fg-muted hover:text-accent sm:inline-flex"
              leftIcon={<Eye size={15} aria-hidden="true" />}
              aria-label={
                isFullWidth
                  ? 'Repasser en affichage normal'
                  : 'Passer en affichage large'
              }
            >
              {isFullWidth ? 'Normal' : 'Large'}
            </Button>

            <Link
              href="/promotions"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5',
                'text-xs font-semibold text-fg shadow-card',
                'transition-colors duration-200',
                'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
              )}
            >
              <span className="hidden sm:inline">Voir toutes les offres</span>
              <span className="sm:hidden">Tout voir</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* ====================================================
            MAIN DEAL CARD
           ==================================================== */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.article
            key={currentDeal.id}
            initial={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 0, x: 18 }
            }
            animate={{ opacity: 1, x: 0 }}
            exit={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 0, x: -18 }
            }
            transition={{
              duration: prefersReducedMotion ? 0 : 0.32,
              ease: 'easeOut',
            }}
            className={cn(
              'relative overflow-hidden rounded-card border border-line bg-surface shadow-card',
              'transition-shadow duration-300 hover:shadow-card-hover'
            )}
            aria-label={`Offre : ${currentDeal.productName}`}
          >
            {/* Ligne colorée premium */}
            <div
              className={cn(
                'absolute inset-x-0 top-0 h-1 bg-gradient-to-r',
                promo.gradient
              )}
              aria-hidden="true"
            />

            <div className="flex flex-col gap-5 p-4 sm:p-6 md:flex-row md:items-center md:gap-7 md:p-8">
              {/* Image */}
              <div className="relative mx-auto shrink-0 md:mx-0">
                <div
                  className={cn(
                    'relative aspect-square w-28 overflow-hidden rounded-xl border border-line bg-muted sm:w-32 md:w-40',
                    'shadow-card'
                  )}
                >
                  {currentDeal.productImage && !hasImageError ? (
                    <Image
                      src={currentDeal.productImage}
                      alt={currentDeal.productName}
                      width={160}
                      height={160}
                      priority={safeIndex === 0}
                      quality={isMobile ? 75 : 85}
                      sizes="(max-width: 640px) 112px, (max-width: 768px) 128px, 160px"
                      className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
                      onError={() => handleImageError(currentDeal.id)}
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-fg-subtle"
                      aria-hidden="true"
                    >
                      <Percent size={40} strokeWidth={1.5} />
                    </div>
                  )}

                  {isOutOfStock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-overlay/45 backdrop-blur-[1px]">
                      <Pill tone="danger">Rupture</Pill>
                    </div>
                  )}
                </div>

                {/* Badge type promo */}
                <span
                  className={cn(
                    'absolute -right-2 -top-2 inline-flex items-center gap-1 rounded-full border px-2 py-1',
                    'text-[10px] font-bold leading-none shadow-card',
                    pillTones[promo.tone]
                  )}
                  aria-label={promo.label}
                >
                  {promo.icon}
                  <span className="hidden sm:inline">{promo.label}</span>
                </span>
              </div>

              {/* Infos */}
              <div className="min-w-0 flex-1 text-center md:text-left">
                <div className="mb-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                  <CountdownTimer endTime={currentDeal.endTime} />

                  {currentDeal.discount > 0 && (
                    <Pill
                      tone="danger"
                      pulse={!prefersReducedMotion}
                      aria-label={`Réduction de ${currentDeal.discount}%`}
                    >
                      -{currentDeal.discount}%
                    </Pill>
                  )}

                  {currentDeal.nouveau && (
                    <Pill
                      tone="accent"
                      icon={<Sparkles size={10} aria-hidden="true" />}
                    >
                      Nouveau
                    </Pill>
                  )}

                  {currentDeal.type_promo === 'flash' && (
                    <Pill
                      tone="warning"
                      icon={<Flame size={10} aria-hidden="true" />}
                    >
                      Flash
                    </Pill>
                  )}
                </div>

                <h3 className="line-clamp-2 text-lg font-bold tracking-tight text-fg sm:text-xl md:text-2xl">
                  {currentDeal.productName}
                </h3>

                {currentDeal.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-fg-muted sm:text-sm">
                    {currentDeal.description}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-baseline justify-center gap-2 md:justify-start md:gap-3">
                  <span className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                    {primaryText}
                  </span>

                  {secondaryText && (
                    <span className="text-sm text-fg-muted sm:text-base">
                      {secondaryText}
                    </span>
                  )}

                  {originalText && (
                    <span className="text-sm text-fg-subtle line-through sm:text-base">
                      {originalText}
                    </span>
                  )}

                  {savingsText && (
                    <span className="text-xs font-semibold text-success sm:text-sm">
                      {savingsText}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-fg-muted md:justify-start">
                  {currentDeal.stock_restant !== undefined &&
                    currentDeal.stock_restant <= 10 &&
                    currentDeal.stock_restant > 0 && (
                      <span className="inline-flex items-center gap-1 font-semibold text-warning">
                        <AlertTriangle size={12} aria-hidden="true" />
                        Plus que {currentDeal.stock_restant}
                      </span>
                    )}

                  {currentDeal.ventes !== undefined &&
                    currentDeal.ventes > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp size={12} aria-hidden="true" />
                        {currentDeal.ventes} ventes
                      </span>
                    )}

                  {currentDeal.productCategory && (
                    <span className="inline-flex items-center gap-1 text-fg-subtle">
                      <Package size={12} aria-hidden="true" />
                      {currentDeal.productCategory}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 md:justify-start md:gap-3">
                  <Link href={getProductHref(currentDeal)}>
                    <Button
                      type="button"
                      variant="primary"
                      size={isMobile ? 'sm' : 'md'}
                      leftIcon={
                        <ShoppingCart size={16} aria-hidden="true" />
                      }
                      className="shadow-card"
                    >
                      Voir l’offre
                    </Button>
                  </Link>

                  <Button
                    type="button"
                    variant="secondary"
                    size={isMobile ? 'sm' : 'md'}
                    onClick={() => void handleQuickAdd(currentDeal)}
                    disabled={
                      isOutOfStock ||
                      !currentDeal.canAddToCart ||
                      isAddingCurrent
                    }
                    loading={isAddingCurrent}
                    leftIcon={
                      isAddingCurrent ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <ShoppingCart size={16} aria-hidden="true" />
                      )
                    }
                  >
                    {isOutOfStock
                      ? 'Rupture'
                      : !currentDeal.hasPrice
                        ? 'Sur demande'
                        : !currentDeal.canAddToCart
                          ? 'Patientez…'
                          : 'Ajout rapide'}
                  </Button>

                  <Tooltip content="Partager cette offre">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleShare(currentDeal)}
                      className="h-9 w-9 p-0 text-fg-muted hover:text-accent"
                      aria-label={`Partager l’offre ${currentDeal.productName}`}
                    >
                      <Share2 size={16} aria-hidden="true" />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            </div>
          </motion.article>
        </AnimatePresence>

        {/* ====================================================
            MOBILE DOTS
           ==================================================== */}
        {promotions.length > 1 && (
          <div
            className="mt-4 flex items-center justify-center gap-1.5 md:hidden"
            role="tablist"
            aria-label="Sélection de l’offre"
          >
            {promotions.map((deal, index) => (
              <button
                key={deal.id}
                type="button"
                onClick={() => goToDeal(index)}
                role="tab"
                aria-selected={index === safeIndex}
                aria-label={`Aller à l’offre ${index + 1} : ${deal.productName}`}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  index === safeIndex
                    ? 'w-6 bg-accent'
                    : 'w-2 bg-fg-subtle/35 hover:bg-fg-subtle/60'
                )}
              />
            ))}
          </div>
        )}

        {/* ====================================================
            MINI OFFERS
           ==================================================== */}
        {promotions.length > 1 && (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {promotions.map((deal, index) => {
              const isActive = index === safeIndex
              const dealPromo =
                promoConfig[deal.type_promo] ?? promoConfig.prix_fixe
              const dealHasImageError = imageErrors.has(deal.id)

              const dealPrimaryText = formatDealAmount(
                deal.primaryAmount,
                deal.primaryCurrency
              )

              const dealOriginalText =
                deal.originalPrimaryAmount > deal.primaryAmount &&
                deal.originalPrimaryAmount > 0
                  ? formatDealAmount(
                      deal.originalPrimaryAmount,
                      deal.primaryCurrency
                    )
                  : null

              return (
                <motion.button
                  key={deal.id}
                  type="button"
                  whileHover={prefersReducedMotion ? {} : { scale: 1.01 }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.99 }}
                  onClick={() => goToDeal(index)}
                  aria-label={`Afficher l’offre ${index + 1} : ${deal.productName}`}
                  aria-pressed={isActive}
                  className={cn(
                    'group flex w-full items-start gap-3 rounded-card border p-3 text-left',
                    'transition-all duration-200 ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                    isActive
                      ? 'border-accent/30 bg-accent-soft shadow-card'
                      : 'border-line bg-surface hover:border-line-strong hover:bg-muted hover:shadow-card'
                  )}
                >
                  <span
                    className={cn(
                      'relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-muted',
                      isActive ? 'border-accent/25' : 'border-line'
                    )}
                  >
                    {deal.productImage && !dealHasImageError ? (
                      <Image
                        src={deal.productImage}
                        alt=""
                        width={48}
                        height={48}
                        loading="lazy"
                        decoding="async"
                        quality={70}
                        className="h-12 w-12 object-cover"
                        onError={() => handleImageError(deal.id)}
                      />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center text-fg-subtle"
                        aria-hidden="true"
                      >
                        {dealPromo.icon}
                      </span>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wide',
                          isActive ? 'text-accent' : 'text-fg-subtle'
                        )}
                      >
                        {dealPromo.label}
                      </span>

                      {deal.discount > 0 && (
                        <Pill tone="danger" className="text-[9px]">
                          -{deal.discount}%
                        </Pill>
                      )}
                    </span>

                    <span
                      className={cn(
                        'line-clamp-1 block text-xs font-semibold',
                        isActive ? 'text-accent' : 'text-fg'
                      )}
                      title={deal.productName}
                    >
                      {deal.productName}
                    </span>

                    <span className="mt-1 flex items-baseline gap-1.5">
                      <span
                        className={cn(
                          'text-sm font-bold',
                          isActive ? 'text-accent' : 'text-fg'
                        )}
                      >
                        {dealPrimaryText}
                      </span>

                      {dealOriginalText && (
                        <span className="text-[10px] text-fg-subtle line-through">
                          {dealOriginalText}
                        </span>
                      )}
                    </span>

                    <span className="mt-1.5 block">
                      <CountdownTimer
                        endTime={deal.endTime}
                        showDays={false}
                      />
                    </span>
                  </span>
                </motion.button>
              )
            })}
          </div>
        )}
      </Container>
    </section>
  )
}