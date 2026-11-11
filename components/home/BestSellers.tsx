// components/home/BestSellers.tsx
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

import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'

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

import {
  AlertTriangle,
  ChevronRight,
  Flame,
  Gauge,
  Grid3X3,
  List,
  Medal,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Star,
  TrendingUp,
  WifiOff,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

interface BestSellerProduct {
  id: string
  nom: string
  slug?: string | null
  href: string

  images: string[]
  image_url?: string | null

  /**
   * Legacy : prix CDF courant.
   * USD reste la source principale via priceUsd.
   */
  prix: number
  effective_price: number

  /**
   * USD = source principale.
   */
  priceUsd: number
  priceCdf: number

  originalPriceUsd: number
  originalPriceCdf: number

  prix_promo?: number | null
  prix_promo_usd?: number | null

  discount: number

  categorie?: string | null
  total_ventes: number
  note_moyenne?: number | null
  stock?: number | null
  created_at?: string | null

  score: number
  rank: number
  reasons: string[]
  recent_ventes_7j: number
  recent_ventes_periode: number
  tendance: number

  is_top: boolean
  is_trending: boolean
  is_nouveau: boolean
  stock_faible: boolean
  rupture: boolean

  delivery_config?: any
  poids_kg?: number | null

  [key: string]: any
}

interface BestSellersMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
  categories: string[]
  generated_at: string
}

interface BestSellersQueryResult {
  products: BestSellerProduct[]
  meta: BestSellersMeta
}

interface CacheEntry {
  products: BestSellerProduct[]
  meta: BestSellersMeta
  timestamp: number
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

const CACHE_PREFIX = 'gercie-best-sellers-intelligent:v3:'
const CACHE_TTL = 10 * 60 * 1000
const REQUEST_TIMEOUT = 10_000
const PRELOAD_DELAY = 2500
const SWIPE_THRESHOLD = 50
const LOW_STOCK_THRESHOLD = 5
const NEW_PRODUCT_DAYS = 14

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

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
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
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function clampPercent(value: unknown): number {
  const n = Number(value)

  if (!Number.isFinite(n)) return 0

  return Math.max(0, Math.min(100, Math.round(n)))
}

function formatNumber(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'

  return n.toLocaleString('fr-FR')
}

function formatDecimal(
  value: number | null | undefined,
  digits = 1
): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'

  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatVentes(ventes: number | null | undefined): string {
  const n = Number(ventes || 0)

  if (!Number.isFinite(n)) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`

  return String(n)
}

function formatProductAmount(
  value: number | null | undefined,
  currency: Currency
): string {
  const n = Number(value || 0)

  if (!Number.isFinite(n) || n <= 0) return '—'

  return currency === 'USD' ? formatUsd(n) : formatCdf(n)
}

function stringifyImage(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = stringifyImage(item)
      if (url) return url
    }

    return null
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return (
      stringifyImage(record.url) ??
      stringifyImage(record.src) ??
      stringifyImage(record.path) ??
      stringifyImage(record.secure_url) ??
      stringifyImage(record.image_url) ??
      null
    )
  }

  return null
}

function normalizeImages(value: unknown): string[] {
  const output: string[] = []
  const seen = new Set<string>()

  const push = (candidate: unknown) => {
    const url = stringifyImage(candidate)

    if (!url || seen.has(url)) return

    seen.add(url)
    output.push(url)
  }

  if (Array.isArray(value)) {
    value.forEach(push)
  } else {
    push(value)
  }

  return output
}

function getCurrentPath(fallback = '/'): string {
  if (typeof window === 'undefined') return fallback

  const path = `${window.location.pathname}${window.location.search}`

  if (path.startsWith('/login')) return '/'

  return path
}

function daysSince(dateString?: string | null): number | null {
  if (!dateString) return null

  const date = new Date(dateString)

  if (Number.isNaN(date.getTime())) return null

  return (Date.now() - date.getTime()) / 86_400_000
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

function makeCacheKey(category: string, page: number, limit: number): string {
  return `${CACHE_PREFIX}${category || 'all'}:${page}:${limit}`
}

function readCache(
  key: string,
  allowExpired = false
): CacheEntry | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const entry = JSON.parse(raw) as CacheEntry

    if (!entry || !Array.isArray(entry.products) || !entry.meta) {
      return null
    }

    if (!allowExpired && Date.now() - entry.timestamp > CACHE_TTL) {
      return null
    }

    return entry
  } catch {
    return null
  }
}

function writeCache(
  key: string,
  products: BestSellerProduct[],
  meta: BestSellersMeta
): void {
  if (typeof window === 'undefined') return

  try {
    const entry: CacheEntry = {
      products,
      meta,
      timestamp: Date.now(),
    }

    window.localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // stockage plein ou indisponible : silencieux
  }
}

function clearCategoryCache(category: string): void {
  if (typeof window === 'undefined') return

  try {
    const prefix = `${CACHE_PREFIX}${category || 'all'}:`
    const keysToRemove: string[] = []

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)

      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key)
    })
  } catch {
    // silencieux
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION BASE                                             */
/*  Ne dépend pas du taux : le CDF est recalculé à l’affichage.    */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeProduct(
  raw: unknown,
  fallbackRank: number
): BestSellerProduct {
  const data = (raw || {}) as Record<string, unknown>

  const id = String(data.id ?? data._id ?? '').trim()
  const nom = String(data.nom ?? data.name ?? '').trim()

  const slug = textOrNull(data.slug)
  const href = textOrNull(data.href) ?? `/produits/${slug || id}`

  const images = normalizeImages(
    data.images ?? data.image ?? data.thumbnail ?? data.image_url
  )

  const image_url =
    images[0] ??
    textOrNull(data.image_url ?? data.thumbnail ?? data.photo) ??
    null

  /* ---------------------------------------------------------- */
  /* Prix courant                                                */
  /* ---------------------------------------------------------- */

  const rawUsd = positiveNumber(
    data.prix_usd ??
      data.price_usd ??
      data.unit_price_usd ??
      data.priceUsd
  )

  const rawCdf = positiveNumber(
    data.prix ??
      data.price ??
      data.prix_cdf ??
      data.price_cdf ??
      data.priceCdf ??
      data.effective_price
  )

  const promoUsd = positiveNumber(
    data.prix_promo_usd ??
      data.promo_price_usd
  )

  const promoCdf = positiveNumber(
    data.prix_promo ??
      data.promo_price
  )

  let priceUsd = 0
  let priceCdf = 0

  if (promoUsd != null) {
    priceUsd = promoUsd
    priceCdf = promoCdf ?? 0
  } else if (promoCdf != null) {
    priceUsd = 0
    priceCdf = promoCdf
  } else if (rawUsd != null) {
    priceUsd = rawUsd
    priceCdf = rawCdf ?? 0
  } else {
    priceUsd = 0
    priceCdf = rawCdf ?? 0
  }

  /* ---------------------------------------------------------- */
  /* Prix original / barré                                        */
  /* ---------------------------------------------------------- */

  const originalUsdRaw = positiveNumber(
    data.prix_usd_original ??
      data.original_price_usd ??
      data.prix_initial_usd ??
      data.originalPriceUsd
  )

  const originalCdfRaw = positiveNumber(
    data.prix_original ??
      data.original_price ??
      data.prix_comparatif ??
      data.prix_initial ??
      data.originalPriceCdf
  )

  let originalPriceUsd = originalUsdRaw ?? 0
  let originalPriceCdf = originalCdfRaw ?? 0

  /* ---------------------------------------------------------- */
  /* Remise                                                     */
  /* ---------------------------------------------------------- */

  let discount = clampPercent(
    data.discount ??
      data.remise_percent ??
      data.discount_percent
  )

  if (
    discount === 0 &&
    originalPriceUsd > 0 &&
    priceUsd > 0 &&
    originalPriceUsd > priceUsd
  ) {
    discount = Math.round((1 - priceUsd / originalPriceUsd) * 100)
  }

  if (
    discount === 0 &&
    originalPriceCdf > 0 &&
    priceCdf > 0 &&
    originalPriceCdf > priceCdf
  ) {
    discount = Math.round((1 - priceCdf / originalPriceCdf) * 100)
  }

  if (discount > 0) {
    const divisor = 1 - discount / 100

    if (divisor > 0) {
      if (originalPriceUsd <= 0 && priceUsd > 0) {
        originalPriceUsd = roundUsd(priceUsd / divisor)
      }

      if (originalPriceCdf <= 0 && priceCdf > 0) {
        originalPriceCdf = roundCdf(priceCdf / divisor)
      }
    }
  }

  if (originalPriceUsd > 0 && originalPriceUsd < priceUsd) {
    originalPriceUsd = priceUsd
  }

  if (originalPriceCdf > 0 && originalPriceCdf < priceCdf) {
    originalPriceCdf = priceCdf
  }

  /* ---------------------------------------------------------- */
  /* Stock / dates                                              */
  /* ---------------------------------------------------------- */

  const stock = nonNegativeNumber(data.stock)

  const created_at = textOrNull(data.created_at ?? data.createdAt)
  const createdDays = daysSince(created_at)

  const isRecentlyCreated =
    createdDays !== null && createdDays <= NEW_PRODUCT_DAYS

  const tendance = toNum(data.tendance, 0)
  const recent7 = toNum(data.recent_ventes_7j, 0)

  const reasons = Array.isArray(data.reasons)
    ? data.reasons.map((reason) => String(reason)).filter(Boolean)
    : []

  const isTrending =
    Boolean(data.is_trending) ||
    (tendance >= 1.25 && recent7 > 0) ||
    reasons.some((reason) => reason.toLowerCase().includes('hausse'))

  const isNouveau = Boolean(data.is_nouveau) || isRecentlyCreated

  const stockFaible =
    Boolean(data.stock_faible) ||
    (stock !== null && stock > 0 && stock <= LOW_STOCK_THRESHOLD)

  const rupture =
    Boolean(data.rupture) ||
    (stock !== null && stock <= 0) ||
    data.est_actif === false

  const rawScore = toNum(data.score, 0)
  const score =
    rawScore > 0 && rawScore <= 1
      ? Math.round(rawScore * 100)
      : Math.round(rawScore)

  const rank = toNum(data.rank, fallbackRank)

  return {
    ...data,

    id,
    nom,
    slug,
    href,

    images,
    image_url,

    prix: roundCdf(priceCdf),
    effective_price: roundCdf(priceCdf),

    priceUsd: roundUsd(priceUsd),
    priceCdf: roundCdf(priceCdf),

    originalPriceUsd: roundUsd(originalPriceUsd),
    originalPriceCdf: roundCdf(originalPriceCdf),

    prix_promo: promoCdf ?? null,
    prix_promo_usd: promoUsd ?? null,

    discount,

    categorie: textOrNull(data.categorie ?? data.category),
    total_ventes: toNum(data.total_ventes ?? data.ventes, 0),
    note_moyenne: nonNegativeNumber(
      data.note_moyenne ?? data.rating ?? data.average_rating
    ),
    stock,
    created_at,

    score,
    rank,
    reasons,
    recent_ventes_7j: recent7,
    recent_ventes_periode: toNum(data.recent_ventes_periode, 0),
    tendance,

    is_top: rank <= 3,
    is_trending: isTrending,
    is_nouveau: isNouveau,
    stock_faible: stockFaible,
    rupture,

    delivery_config: data.delivery_config ?? null,
    poids_kg: nonNegativeNumber(data.poids_kg ?? data.weight_kg),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  APPLICATION DU TAUX USD → CDF À L’AFFICHAGE                    */
/* ═══════════════════════════════════════════════════════════════ */

function applyExchangeRateToProduct(
  product: BestSellerProduct,
  rate: number | null
): BestSellerProduct {
  const r = positiveNumber(rate)

  let priceUsd = positiveNumber(product.priceUsd) ?? 0
  let priceCdf = positiveNumber(product.priceCdf) ?? 0

  if (priceUsd <= 0 && priceCdf > 0 && r != null) {
    priceUsd = toUsd(priceCdf, r)
  }

  if (priceUsd > 0 && r != null) {
    priceCdf = toCdf(priceUsd, r)
  }

  let originalPriceUsd = positiveNumber(product.originalPriceUsd) ?? 0
  let originalPriceCdf = positiveNumber(product.originalPriceCdf) ?? 0

  if (originalPriceUsd <= 0 && originalPriceCdf > 0 && r != null) {
    originalPriceUsd = toUsd(originalPriceCdf, r)
  }

  if (originalPriceUsd > 0 && r != null) {
    originalPriceCdf = toCdf(originalPriceUsd, r)
  }

  let discount = clampPercent(product.discount)

  if (
    discount === 0 &&
    originalPriceUsd > 0 &&
    priceUsd > 0 &&
    originalPriceUsd > priceUsd
  ) {
    discount = Math.round((1 - priceUsd / originalPriceUsd) * 100)
  }

  if (
    discount === 0 &&
    originalPriceCdf > 0 &&
    priceCdf > 0 &&
    originalPriceCdf > priceCdf
  ) {
    discount = Math.round((1 - priceCdf / originalPriceCdf) * 100)
  }

  if (discount > 0) {
    const divisor = 1 - discount / 100

    if (divisor > 0) {
      if (originalPriceUsd <= 0 && priceUsd > 0) {
        originalPriceUsd = roundUsd(priceUsd / divisor)
      }

      if (originalPriceCdf <= 0 && priceCdf > 0) {
        originalPriceCdf =
          r != null && originalPriceUsd > 0
            ? toCdf(originalPriceUsd, r)
            : roundCdf(priceCdf / divisor)
      }
    }
  }

  if (originalPriceUsd > 0 && originalPriceUsd < priceUsd) {
    originalPriceUsd = priceUsd
  }

  if (originalPriceCdf > 0 && originalPriceCdf < priceCdf) {
    originalPriceCdf = priceCdf
  }

  return {
    ...product,

    prix: roundCdf(priceCdf),
    effective_price: roundCdf(priceCdf),

    priceUsd: roundUsd(priceUsd),
    priceCdf: roundCdf(priceCdf),

    originalPriceUsd: roundUsd(originalPriceUsd),
    originalPriceCdf: roundCdf(originalPriceCdf),

    discount,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  META                                                           */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeMeta(
  raw: unknown,
  page: number,
  limit: number,
  productsLength: number
): BestSellersMeta {
  const data = (raw || {}) as Record<string, unknown>

  const total = toNum(data.total, productsLength)
  const totalPages = Math.max(
    1,
    toNum(
      data.totalPages ?? data.total_pages,
      Math.ceil(total / Math.max(1, limit))
    )
  )

  return {
    page: toNum(data.page, page),
    limit: toNum(data.limit, limit),
    total,
    totalPages,
    hasMore:
      data.hasMore !== undefined
        ? Boolean(data.hasMore)
        : data.has_more !== undefined
          ? Boolean(data.has_more)
          : page < totalPages,
    categories: Array.isArray(data.categories)
      ? data.categories
          .map((category) => String(category).trim())
          .filter(Boolean)
      : [],
    generated_at:
      textOrNull(data.generated_at) || new Date().toISOString(),
  }
}

async function fetchBestSellersPage(
  category: string,
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<BestSellersQueryResult> {
  const params = new URLSearchParams()

  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set('freshness_days', '30')
  params.set('include_out_of_stock', 'false')
  params.set('candidate_limit', '200')

  if (category) {
    params.set('categorie', category)
  }

  const response = await fetch(
    `/api/produits/meilleures-ventes?${params.toString()}`,
    {
      signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    }
  )

  const json = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      json?.error || 'Impossible de charger les meilleures ventes.'
    )
  }

  const rawProducts = Array.isArray(json?.data) ? json.data : []

  const products = rawProducts.map((product, index) =>
    normalizeProduct(product, (page - 1) * limit + index + 1)
  )

  const meta = normalizeMeta(json?.meta, page, limit, products.length)

  return {
    products,
    meta,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI                                                       */
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
  if (children === null || children === undefined || children === '') {
    return null
  }

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

function RankBadge({ rank }: { rank: number }) {
  if (rank > 3) return null

  const classes =
    rank === 1
      ? 'border-accent/30 bg-accent text-accent-contrast'
      : rank === 2
        ? 'border-line bg-muted text-fg'
        : 'border-warning/20 bg-warning-soft text-warning'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-[10px] font-bold leading-none shadow-card',
        classes
      )}
      aria-label={`Top ${rank} des meilleures ventes`}
    >
      <Medal size={12} aria-hidden="true" />
      Top {rank}
    </span>
  )
}

function ScorePill({
  score,
  reasons,
}: {
  score: number
  reasons: string[]
}) {
  if (!score || score <= 0) return null

  const tooltip =
    reasons.length > 0
      ? `Score intelligent ${score}/100 • ${reasons.join(' • ')}`
      : `Score intelligent ${score}/100`

  return (
    <Tooltip content={tooltip}>
      <Pill tone="info" icon={<Gauge size={11} aria-hidden="true" />}>
        {score}
      </Pill>
    </Tooltip>
  )
}

function TrendPill({ tendance }: { tendance: number }) {
  if (tendance < 1.25) return null

  return (
    <Pill tone="success" icon={<TrendingUp size={11} aria-hidden="true" />}>
      En hausse
    </Pill>
  )
}

function StockPill({
  stock,
  rupture,
}: {
  stock: number | null
  rupture: boolean
}) {
  if (rupture) {
    return <Pill tone="danger">Rupture</Pill>
  }

  if (stock !== null && stock > 0 && stock <= LOW_STOCK_THRESHOLD) {
    return <Pill tone="warning">Stock limité</Pill>
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT TILE                                                   */
/* ═══════════════════════════════════════════════════════════════ */

interface ProductTileProps {
  product: BestSellerProduct
  index: number
  isMobile: boolean
  hasImageError: boolean
  onImageError: (productId: string) => void
  onQuickAdd: (
    product: BestSellerProduct,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void
}

function ProductTile({
  product,
  index,
  isMobile,
  hasImageError,
  onImageError,
  onQuickAdd,
}: ProductTileProps) {
  const image = product.images[0] || product.image_url
  const href = product.href || `/produits/${product.slug || product.id}`

  const hasUsd = product.priceUsd > 0
  const hasCdf = product.priceCdf > 0
  const hasPrice = hasUsd || hasCdf

  const primaryCurrency: Currency = hasUsd ? 'USD' : 'CDF'
  const secondaryCurrency: Currency = hasUsd ? 'CDF' : 'USD'

  const primaryAmount = hasUsd ? product.priceUsd : product.priceCdf
  const secondaryAmount = hasUsd ? product.priceCdf : product.priceUsd

  const originalPrimaryAmount =
    primaryCurrency === 'USD'
      ? product.originalPriceUsd
      : product.originalPriceCdf

  const showOriginal =
    originalPrimaryAmount > primaryAmount && originalPrimaryAmount > 0

  const primaryText = hasPrice
    ? formatProductAmount(primaryAmount, primaryCurrency)
    : 'Prix sur demande'

  const secondaryText =
    hasPrice && secondaryAmount > 0 && secondaryAmount !== primaryAmount
      ? `≈ ${formatProductAmount(secondaryAmount, secondaryCurrency)}`
      : null

  const originalText = showOriginal
    ? formatProductAmount(originalPrimaryAmount, primaryCurrency)
    : null

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover',
        'focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-surface'
      )}
    >
      <Link
        href={href}
        className="flex flex-1 flex-col outline-none"
        aria-label={`${product.nom} — ${primaryText}`}
      >
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          {image && !hasImageError ? (
            <Image
              src={image}
              alt={product.nom}
              fill
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              sizes={
                isMobile
                  ? '(max-width: 640px) 50vw'
                  : '(max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw'
              }
              priority={index < 4}
              quality={isMobile ? 75 : 85}
              onError={() => onImageError(product.id)}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-fg-subtle"
              aria-hidden="true"
            >
              <Package size={36} strokeWidth={1.5} />
            </div>
          )}

          {product.rupture && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
              aria-hidden="true"
            >
              <Pill tone="danger">Indisponible</Pill>
            </div>
          )}

          <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1">
            <RankBadge rank={product.rank} />

            {product.discount > 0 && (
              <Pill tone="danger">-{product.discount}%</Pill>
            )}

            {product.is_nouveau && (
              <Pill
                tone="accent"
                icon={<Sparkles size={10} aria-hidden="true" />}
              >
                Nouveau
              </Pill>
            )}
          </div>

          <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
            <ScorePill score={product.score} reasons={product.reasons} />
            <TrendPill tendance={product.tendance} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <h3 className="line-clamp-2 min-h-[2.25rem] text-sm font-semibold leading-snug text-fg transition-colors duration-200 group-hover:text-accent">
            {product.nom}
          </h3>

          {product.categorie && (
            <p className="line-clamp-1 text-[11px] font-medium text-fg-subtle">
              {product.categorie}
            </p>
          )}

          <div className="mt-auto space-y-1.5 pt-1">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-base font-bold tracking-tight text-fg">
                {primaryText}
              </span>

              {secondaryText && (
                <span className="text-[11px] font-medium text-fg-muted">
                  {secondaryText}
                </span>
              )}

              {originalText && (
                <span className="text-[11px] text-fg-subtle line-through">
                  {originalText}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] text-fg-muted">
              <div className="flex items-center gap-1">
                {product.note_moyenne != null && product.note_moyenne > 0 ? (
                  <>
                    <Star
                      size={12}
                      className="fill-accent text-accent"
                      aria-hidden="true"
                    />
                    <span className="font-semibold text-fg">
                      {formatDecimal(product.note_moyenne, 1)}
                    </span>
                  </>
                ) : (
                  <span className="text-fg-subtle">Nouveau</span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <TrendingUp size={12} aria-hidden="true" />
                <span>{formatVentes(product.total_ventes)} vendus</span>
              </div>
            </div>

            <StockPill stock={product.stock ?? null} rupture={product.rupture} />
          </div>
        </div>
      </Link>

      <div className="border-t border-line p-2">
        <Button
          type="button"
          variant={product.rupture || !hasPrice ? 'secondary' : 'primary'}
          size="sm"
          className="w-full"
          disabled={product.rupture || !hasPrice}
          onClick={(event) => onQuickAdd(product, event)}
          leftIcon={
            product.rupture ? (
              <AlertTriangle size={15} aria-hidden="true" />
            ) : (
              <ShoppingCart size={15} aria-hidden="true" />
            )
          }
        >
          {product.rupture
            ? 'Indisponible'
            : !hasPrice
              ? 'Sur demande'
              : 'Ajouter'}
        </Button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export default function BestSellers() {
  const router = useRouter()

  const { prefersReducedMotion } = useAccessibilityPreferences()
  const { user, loading: authLoading } = useAuth()

  const onlineStatus = useOnlineStatus() as unknown
  const isOnline =
    typeof onlineStatus === 'boolean'
      ? onlineStatus
      : Boolean((onlineStatus as { isOnline?: boolean })?.isOnline ?? true)

  const cart = useCart() as any
  const addItem = cart?.addItem

  const toast = useToast() as any
  const addToast = toast?.addToast

  const exchange = useExchangeRate() as any

  const rawRate = positiveNumber(
    exchange?.rate ??
      exchange?.usdRate ??
      exchange?.data?.rate ??
      exchange?.data?.current?.rate
  )

  const sectionRef = useRef<HTMLElement | null>(null)
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const [mounted, setMounted] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [isInView, setIsInView] = useState(true)
  const [accumulatedBase, setAccumulatedBase] = useState<BestSellerProduct[]>([])

  const itemsPerPage = viewMode === 'grid' ? 8 : 10

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
      { threshold: 0.1 }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  QUERY                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const cacheKey = useMemo(
    () => makeCacheKey(category, page, itemsPerPage),
    [category, itemsPerPage, page]
  )

  const bestSellersQuery = useQuery<BestSellersQueryResult, Error>({
    queryKey: [
      'best-sellers-intelligent',
      category,
      page,
      itemsPerPage,
      isOnline,
    ],
    queryFn: async () => {
      const cached = readCache(cacheKey)

      if (cached) {
        return {
          products: cached.products.map((product, index) =>
            normalizeProduct(product, index + 1)
          ),
          meta: cached.meta,
        }
      }

      if (!isOnline) {
        const expired = readCache(cacheKey, true)

        if (expired) {
          return {
            products: expired.products.map((product, index) =>
              normalizeProduct(product, index + 1)
            ),
            meta: expired.meta,
          }
        }

        throw new Error(
          'Hors ligne : aucune donnée en cache pour les meilleures ventes.'
        )
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
      }, REQUEST_TIMEOUT)

      try {
        const result = await fetchBestSellersPage(
          category,
          page,
          itemsPerPage,
          controller.signal
        )

        writeCache(cacheKey, result.products, result.meta)

        return result
      } finally {
        clearTimeout(timeoutId)
      }
    },
    enabled: isInView,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    placeholderData: (previous) => previous,
  })

  const baseCurrentProducts = useMemo(
    () => bestSellersQuery.data?.products ?? [],
    [bestSellersQuery.data?.products]
  )

  const meta = bestSellersQuery.data?.meta

  /* ───────────────────────────────────────────────────────────── */
  /*  ACCUMULATE PAGES (BASE, SANS CDF FIGÉ)                       */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (page === 1) {
      setAccumulatedBase(baseCurrentProducts)
      return
    }

    setAccumulatedBase((previous) => {
      const map = new Map(previous.map((product) => [product.id, product]))

      baseCurrentProducts.forEach((product) => {
        map.set(product.id, product)
      })

      return Array.from(map.values())
    })
  }, [baseCurrentProducts, page])

  /* ───────────────────────────────────────────────────────────── */
  /*  PRODUITS AFFICHÉS AVEC TAUX COURANT                          */
  /* ───────────────────────────────────────────────────────────── */

  const displayedProducts = useMemo(
    () =>
      accumulatedBase.map((product) =>
        applyExchangeRateToProduct(product, safeRate)
      ),
    [accumulatedBase, safeRate]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  PRELOAD NEXT PAGE                                            */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isOnline) return
    if (!meta?.hasMore) return
    if (baseCurrentProducts.length === 0) return

    const nextPage = page + 1
    const nextKey = makeCacheKey(category, nextPage, itemsPerPage)

    if (readCache(nextKey)) return

    const timer = setTimeout(async () => {
      try {
        const result = await fetchBestSellersPage(
          category,
          nextPage,
          itemsPerPage
        )

        writeCache(nextKey, result.products, result.meta)
      } catch {
        // préchargement non critique
      }
    }, PRELOAD_DELAY)

    return () => {
      clearTimeout(timer)
    }
  }, [
    baseCurrentProducts.length,
    category,
    isOnline,
    itemsPerPage,
    meta?.hasMore,
    page,
  ])

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
  /*  HANDLERS                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const handleQuickAdd = useCallback(
    (
      product: BestSellerProduct,
      event: React.MouseEvent<HTMLButtonElement>
    ) => {
      event.preventDefault()
      event.stopPropagation()

      const hasPrice = product.priceUsd > 0 || product.priceCdf > 0

      if (product.rupture) {
        addToast?.({
          type: 'warning',
          message: `${product.nom} est en rupture de stock.`,
        })
        return
      }

      if (!hasPrice) {
        addToast?.({
          type: 'warning',
          message: `${product.nom} est sur demande.`,
        })
        return
      }

      if (!requireAuth('Veuillez vous connecter pour ajouter au panier.')) {
        return
      }

      try {
        addItem?.(
          {
            id: product.id,
            product_id: product.id,
            nom: product.nom,

            prix: product.priceCdf,
            prix_usd: product.priceUsd > 0 ? product.priceUsd : undefined,
            unit_price_usd:
              product.priceUsd > 0 ? product.priceUsd : undefined,

            quantite: 1,

            image: product.images[0] ?? product.image_url ?? undefined,

            delivery_config: product.delivery_config ?? null,
            poids_kg: product.poids_kg ?? null,

            variante: undefined,
          },
          1
        )

        addToast?.({
          type: 'success',
          message: `${product.nom} ajouté au panier.`,
        })
      } catch {
        addToast?.({
          type: 'error',
          message: 'Impossible d’ajouter ce produit au panier.',
        })
      }
    },
    [addItem, addToast, requireAuth]
  )

  const handleImageError = useCallback((productId: string) => {
    setImageErrors((previous) => {
      const next = new Set(previous)
      next.add(productId)
      return next
    })
  }, [])

  const handleCategoryChange = useCallback((nextCategory: string) => {
    setCategory(nextCategory)
    setPage(1)
    setAccumulatedBase([])
  }, [])

  const handleLoadMore = useCallback(() => {
    setPage((previous) => previous + 1)
  }, [])

  const handleToggleView = useCallback(() => {
    setViewMode((previous) => (previous === 'grid' ? 'carousel' : 'grid'))
    setPage(1)
    setAccumulatedBase([])
  }, [])

  const handleRefresh = useCallback(async () => {
    clearCategoryCache(category)

    await bestSellersQuery.refetch()

    addToast?.({
      type: 'info',
      message: 'Meilleures ventes actualisées.',
    })
  }, [addToast, bestSellersQuery, category])

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (viewMode !== 'carousel') return

      touchStartRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      }
    },
    [viewMode]
  )

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (
        viewMode !== 'carousel' ||
        !touchStartRef.current ||
        !carouselRef.current
      ) {
        return
      }

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
        const scrollAmount = deltaX > 0 ? -220 : 220

        carouselRef.current.scrollBy({
          left: scrollAmount,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        })
      }

      touchStartRef.current = null
    },
    [prefersReducedMotion, viewMode]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  DERIVED                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const categories = meta?.categories ?? []

  const isLoadingFirstPage =
    bestSellersQuery.isLoading && page === 1 && accumulatedBase.length === 0

  const isErrorFirstPage =
    bestSellersQuery.isError && accumulatedBase.length === 0

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: LOADING                                              */
  /* ───────────────────────────────────────────────────────────── */

  if (isLoadingFirstPage) {
    return (
      <section
        className="relative overflow-hidden bg-canvas py-8 sm:py-12 md:py-16"
        aria-busy="true"
        aria-label="Chargement des meilleures ventes"
      >
        <Container>
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton variant="text" className="h-7 w-48 rounded-full" />
              <Skeleton variant="text" className="h-4 w-64 rounded-full" />
            </div>

            <Skeleton variant="text" className="h-8 w-24 rounded-pill" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`best-seller-skeleton-${index}`}
                className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card"
              >
                <Skeleton
                  variant="rectangular"
                  className="aspect-square w-full rounded-control"
                />
                <Skeleton variant="text" className="h-4 w-3/4 rounded-full" />
                <Skeleton variant="text" className="h-3 w-1/2 rounded-full" />
                <Skeleton
                  variant="rectangular"
                  className="h-9 w-full rounded-control"
                />
              </div>
            ))}
          </div>

          <span className="sr-only">Chargement des meilleures ventes…</span>
        </Container>
      </section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: ERROR                                                */
  /* ───────────────────────────────────────────────────────────── */

  if (isErrorFirstPage) {
    return (
      <section className="relative overflow-hidden bg-canvas py-8 sm:py-12 md:py-16">
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
              {bestSellersQuery.error?.message ??
                'Impossible de charger les meilleures ventes.'}
            </p>

            <p className="max-w-sm text-xs text-fg-muted">
              Une erreur est survenue lors de la récupération du classement.
            </p>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => bestSellersQuery.refetch()}
              leftIcon={<RefreshCw size={14} aria-hidden="true" />}
            >
              Réessayer
            </Button>
          </div>
        </Container>
      </section>
    )
  }

  if (displayedProducts.length === 0) {
    return null
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: MAIN                                                 */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-canvas py-8 sm:py-12 md:py-16"
      aria-labelledby="best-sellers-heading"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent/25 to-transparent"
        aria-hidden="true"
      />

      <Container>
        {/* ====================================================
            HEADER
           ==================================================== */}
        <motion.div
          initial={
            prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }
          }
          whileInView={
            prefersReducedMotion ? {} : { opacity: 1, y: 0 }
          }
          viewport={{ once: true }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.45,
            ease: 'easeOut',
          }}
          className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  'border border-accent/20 bg-accent-soft text-accent shadow-card'
                )}
                aria-hidden="true"
              >
                <Flame size={20} strokeWidth={2} />
              </span>

              <div className="min-w-0">
                <h2
                  id="best-sellers-heading"
                  className="text-balance text-xl font-bold tracking-tight text-fg sm:text-2xl md:text-3xl"
                >
                  Meilleures ventes
                </h2>

                <p className="mt-1 hidden text-xs text-fg-muted sm:block sm:text-sm">
                  Classées selon les ventes récentes, la tendance, les notes,
                  les promos et le stock.
                </p>
              </div>

              <Pill
                tone="accent"
                icon={<Sparkles size={10} aria-hidden="true" />}
              >
                Intelligent
              </Pill>
            </div>

            {!isOnline && (
              <div className="mt-3">
                <Pill
                  tone="info"
                  icon={<WifiOff size={11} aria-hidden="true" />}
                >
                  Mode hors ligne — données en cache
                </Pill>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Tooltip content="Actualiser le classement">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-full',
                  'border border-line bg-surface text-fg-muted shadow-card',
                  'transition-colors duration-200',
                  'hover:border-line-strong hover:bg-muted hover:text-fg',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
                )}
                aria-label="Actualiser les meilleures ventes"
              >
                <RefreshCw
                  size={16}
                  className={cn(
                    bestSellersQuery.isFetching &&
                      'animate-spin text-accent'
                  )}
                  aria-hidden="true"
                />
              </button>
            </Tooltip>

            <Tooltip
              content={
                viewMode === 'grid'
                  ? 'Passer en vue carrousel'
                  : 'Passer en vue grille'
              }
            >
              <button
                type="button"
                onClick={handleToggleView}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-full',
                  'border border-line bg-surface text-fg-muted shadow-card',
                  'transition-colors duration-200',
                  'hover:border-line-strong hover:bg-muted hover:text-fg',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
                )}
                aria-label="Changer la vue des meilleures ventes"
              >
                {viewMode === 'grid' ? (
                  <List size={16} aria-hidden="true" />
                ) : (
                  <Grid3X3 size={16} aria-hidden="true" />
                )}
              </button>
            </Tooltip>

            <Link
              href="/produits?sort=ventes"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5',
                'text-xs font-semibold text-fg shadow-card',
                'transition-colors duration-200',
                'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
              )}
              aria-label="Voir toutes les meilleures ventes"
            >
              <span className="hidden sm:inline">Voir tout</span>
              <span className="sm:hidden">Tout</span>
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </motion.div>

        {/* ====================================================
            CATEGORIES
           ==================================================== */}
        {categories.length > 1 && (
          <div
            className="mb-5 flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrer les meilleures ventes par catégorie"
          >
            <button
              type="button"
              onClick={() => handleCategoryChange('')}
              className={cn(
                'inline-flex h-8 items-center rounded-pill border px-3 text-xs font-semibold',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                category === ''
                  ? 'border-accent/30 bg-accent-soft text-accent'
                  : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:bg-muted hover:text-fg'
              )}
              aria-pressed={category === ''}
            >
              Tous
            </button>

            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleCategoryChange(item)}
                className={cn(
                  'inline-flex h-8 items-center rounded-pill border px-3 text-xs font-semibold',
                  'transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  category === item
                    ? 'border-accent/30 bg-accent-soft text-accent'
                    : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:bg-muted hover:text-fg'
                )}
                aria-pressed={category === item}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {/* ====================================================
            GRID VIEW
           ==================================================== */}
        {viewMode === 'grid' ? (
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
            role="list"
            aria-label="Liste des meilleures ventes"
          >
            {displayedProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={
                  prefersReducedMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 18 }
                }
                whileInView={
                  prefersReducedMotion ? {} : { opacity: 1, y: 0 }
                }
                viewport={{ once: true, margin: '-50px' }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.35,
                  delay: prefersReducedMotion
                    ? 0
                    : Math.min(index * 0.035, 0.25),
                  ease: 'easeOut',
                }}
                className="h-full"
                role="listitem"
              >
                <ProductTile
                  product={product}
                  index={index}
                  isMobile={isMobile}
                  hasImageError={imageErrors.has(product.id)}
                  onImageError={handleImageError}
                  onQuickAdd={handleQuickAdd}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          /* ==================================================
              CAROUSEL VIEW
             ================================================== */
          <div
            ref={carouselRef}
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 scrollbar-hide [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'pan-x' }}
            role="list"
            aria-label="Carrousel des meilleures ventes"
          >
            {displayedProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={
                  prefersReducedMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 18 }
                }
                whileInView={
                  prefersReducedMotion ? {} : { opacity: 1, y: 0 }
                }
                viewport={{ once: true }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.35,
                  delay: prefersReducedMotion
                    ? 0
                    : Math.min(index * 0.035, 0.25),
                  ease: 'easeOut',
                }}
                className="w-[180px] min-w-[180px] flex-shrink-0 snap-start sm:w-[210px] sm:min-w-[210px]"
                role="listitem"
              >
                <ProductTile
                  product={product}
                  index={index}
                  isMobile={isMobile}
                  hasImageError={imageErrors.has(product.id)}
                  onImageError={handleImageError}
                  onQuickAdd={handleQuickAdd}
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* ====================================================
            LOAD MORE
           ==================================================== */}
        {meta?.hasMore && (
          <div className="mt-6 flex items-center justify-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleLoadMore}
              disabled={bestSellersQuery.isFetching}
              leftIcon={
                bestSellersQuery.isFetching ? (
                  <RefreshCw
                    size={14}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : undefined
              }
              rightIcon={
                bestSellersQuery.isFetching ? undefined : (
                  <ChevronRight size={14} aria-hidden="true" />
                )
              }
            >
              {bestSellersQuery.isFetching
                ? 'Chargement…'
                : 'Voir plus de meilleures ventes'}
            </Button>
          </div>
        )}
      </Container>
    </section>
  )
}