// app/meilleures-ventes/page.tsx
'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useFavorites } from '@/hooks/useFavorites'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'

import { cn } from '@/lib/utils'

import {
  ArrowLeft,
  Award,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flame,
  Grid,
  Heart,
  List,
  Loader2,
  Package,
  RotateCcw,
  Search,
  ShoppingBag,
  Star,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'
type ViewMode = 'list' | 'grid'

interface BaseProduct {
  id: string
  nom: string
  slug?: string | null
  href: string
  description?: string | null
  images: string[]
  categorie?: string | null
  stock: number | null
  rating: number | null
  reviews_count: number | null
  badges: string[]
  total_ventes: number

  /**
   * USD = source principale quand disponible.
   */
  priceUsdSource: number | null
  priceCdfSource: number | null

  originalUsdSource: number | null
  originalCdfSource: number | null

  rawDiscount: number

  delivery_config?: any
  poids_kg?: number | null

  [key: string]: any
}

interface NormalizedProduct extends BaseProduct {
  priceUsd: number
  priceCdf: number

  originalPriceUsd: number
  originalPriceCdf: number

  discount: number

  primaryCurrency: Currency | null
  secondaryCurrency: Currency | null

  primaryAmount: number
  secondaryAmount: number

  originalPrimaryAmount: number
  savingsPrimary: number

  hasPrice: boolean
  canAddToCart: boolean
}

interface FetchResult {
  products: BaseProduct[]
  total: number
  totalPages: number
}

interface RankBadgeInfo {
  icon: ReactNode | null
  bg: string
  label: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const PER_PAGE = 10
const PLACEHOLDER = '/placeholder.jpg'

const CATEGORIES = [
  'all',
  'Électronique',
  'Audio',
  'Logiciel',
  'Mode',
  'Maison',
  'Sport',
]

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

function candidateNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = positiveNumber(value)

    if (n != null) return n
  }

  return null
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

function formatProductAmount(
  value: number | null | undefined,
  currency: Currency | null
): string {
  const n = Number(value || 0)

  if (!currency || !Number.isFinite(n) || n <= 0) return '—'

  return currency === 'USD' ? formatUsd(n) : formatCdf(n)
}

function formatVentes(value: number | null | undefined): string {
  const n = Number(value || 0)

  if (!Number.isFinite(n)) return '0'

  return n.toLocaleString('fr-FR')
}

function getCurrentPath(fallback = '/meilleures-ventes'): string {
  if (typeof window === 'undefined') return fallback

  const path = `${window.location.pathname}${window.location.search}`

  if (path.startsWith('/login')) return '/'

  return path
}

function getRankBadge(position: number): RankBadgeInfo {
  if (position === 1) {
    return {
      icon: <Trophy size={20} className="text-amber-400" aria-hidden="true" />,
      bg: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
      label: '#1',
    }
  }

  if (position === 2) {
    return {
      icon: <Award size={20} className="text-slate-300" aria-hidden="true" />,
      bg: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
      label: '#2',
    }
  }

  if (position === 3) {
    return {
      icon: <Flame size={20} className="text-orange-400" aria-hidden="true" />,
      bg: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
      label: '#3',
    }
  }

  return {
    icon: null,
    bg: 'border-border bg-muted text-muted-foreground',
    label: `#${position}`,
  }
}

function getPageNumbers(
  current: number,
  total: number
): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, total, current])

  if (current > 1) pages.add(current - 1)
  if (current < total) pages.add(current + 1)

  if (current <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }

  if (current >= total - 2) {
    pages.add(total - 1)
    pages.add(total - 2)
    pages.add(total - 3)
  }

  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b)

  const result: Array<number | 'ellipsis'> = []

  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index]

    if (index > 0 && page - sorted[index - 1] > 1) {
      result.push('ellipsis')
    }

    result.push(page)
  }

  return result
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION BASE                                             */
/*  Ne dépend pas du taux : le CDF est recalculé à l’affichage.    */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeBaseProduct(raw: unknown): BaseProduct | null {
  if (!raw || typeof raw !== 'object') return null

  const data = raw as Record<string, unknown>

  const id = textOrNull(data.id ?? data._id)
  const nom = textOrNull(data.nom ?? data.name)

  if (!id || !nom) return null

  const slug = textOrNull(data.slug)
  const href = textOrNull(data.href) ?? `/produits/${slug || id}`

  const images = normalizeImages(
    data.images ?? data.image ?? data.thumbnail ?? data.image_url
  )

  /* ---------------------------------------------------------- */
  /* Prix courant / promo                                         */
  /* ---------------------------------------------------------- */

  const currentUsd = candidateNumber(
    data.prix_usd ??
      data.price_usd ??
      data.unit_price_usd ??
      data.priceUsd
  )

  const currentCdf = candidateNumber(
    data.prix ??
      data.price ??
      data.prix_cdf ??
      data.price_cdf ??
      data.priceCdf
  )

  const promoUsd = candidateNumber(
    data.prix_promo_usd ??
      data.promo_price_usd ??
      data.discounted_price_usd
  )

  const promoCdf = candidateNumber(
    data.prix_promo ??
      data.promo_price ??
      data.effective_price ??
      data.discounted_price ??
      data.current_price
  )

  const priceUsdSource = promoUsd ?? currentUsd
  const priceCdfSource = promoCdf ?? currentCdf

  /* ---------------------------------------------------------- */
  /* Prix original / barré                                        */
  /* ---------------------------------------------------------- */

  const explicitOriginalUsd = candidateNumber(
    data.prix_usd_original ??
      data.original_price_usd ??
      data.prix_initial_usd ??
      data.originalPriceUsd
  )

  const explicitOriginalCdf = candidateNumber(
    data.prix_original ??
      data.original_price ??
      data.prix_comparatif ??
      data.prix_initial ??
      data.originalPriceCdf
  )

  const hasPromo = promoUsd != null || promoCdf != null

  const originalUsdSource =
    explicitOriginalUsd ?? (hasPromo ? currentUsd : null)

  const originalCdfSource =
    explicitOriginalCdf ?? (hasPromo ? currentCdf : null)

  /* ---------------------------------------------------------- */
  /* Remise brute                                                 */
  /* ---------------------------------------------------------- */

  const rawDiscount = clampPercent(
    data.discount ??
      data.remise_percent ??
      data.discount_percent
  )

  /* ---------------------------------------------------------- */
  /* Autres champs                                                */
  /* ---------------------------------------------------------- */

  const stock = nonNegativeNumber(data.stock)

  const rating = nonNegativeNumber(
    data.rating ?? data.note_moyenne ?? data.average_rating
  )

  const reviews_count = nonNegativeNumber(
    data.reviews_count ?? data.nb_avis ?? data.review_count
  )

  const badges = Array.isArray(data.badges)
    ? data.badges.map((badge) => String(badge)).filter(Boolean)
    : []

  return {
    ...data,

    id,
    nom,
    slug,
    href,

    description:
      textOrNull(data.description ?? data.desc ?? data.excerpt) ?? undefined,

    images,

    categorie:
      textOrNull(data.categorie ?? data.category) ?? undefined,

    stock,

    rating,
    reviews_count,

    badges,

    total_ventes: toNum(data.total_ventes ?? data.ventes ?? data.sales, 0),

    priceUsdSource,
    priceCdfSource,

    originalUsdSource,
    originalCdfSource,

    rawDiscount,

    delivery_config: data.delivery_config ?? null,

    poids_kg: nonNegativeNumber(data.poids_kg ?? data.weight_kg) ?? null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  APPLICATION DU TAUX USD → CDF À L’AFFICHAGE                    */
/* ═══════════════════════════════════════════════════════════════ */

function applyExchangeRateToProduct(
  base: BaseProduct,
  rate: number | null
): NormalizedProduct {
  const r = positiveNumber(rate)

  let priceUsd = positiveNumber(base.priceUsdSource) ?? 0
  let priceCdf = positiveNumber(base.priceCdfSource) ?? 0

  /**
   * Si seulement un CDF legacy existe, on dérive un USD temporaire.
   */
  if (priceUsd <= 0 && priceCdf > 0 && r != null) {
    priceUsd = toUsd(priceCdf, r)
  }

  /**
   * USD = source principale.
   * Si USD existe et que le taux est disponible, le CDF est recalculé.
   */
  if (priceUsd > 0 && r != null) {
    priceCdf = toCdf(priceUsd, r)
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

  if (originalUsd > 0 && priceUsd > 0 && originalUsd > priceUsd) {
    discount = Math.round((1 - priceUsd / originalUsd) * 100)
  } else if (
    originalCdf > 0 &&
    priceCdf > 0 &&
    originalCdf > priceCdf
  ) {
    discount = Math.round((1 - priceCdf / originalCdf) * 100)
  }

  if (discount <= 0) {
    discount = base.rawDiscount
  }

  discount = clampPercent(discount)

  /* ---------------------------------------------------------- */
  /* Si remise connue mais prix original absent, on le dérive.   */
  /* ---------------------------------------------------------- */

  if (discount > 0) {
    const divisor = 1 - discount / 100

    if (divisor > 0) {
      if (originalUsd <= 0 && priceUsd > 0) {
        originalUsd = roundUsd(priceUsd / divisor)
      }

      if (originalCdf <= 0 && priceCdf > 0) {
        originalCdf =
          r != null && originalUsd > 0
            ? toCdf(originalUsd, r)
            : roundCdf(priceCdf / divisor)
      }
    }
  }

  /* ---------------------------------------------------------- */
  /* Cohérence finale                                             */
  /* ---------------------------------------------------------- */

  if (priceUsd > 0 && r != null) {
    priceCdf = toCdf(priceUsd, r)
  }

  if (originalUsd > 0 && r != null) {
    originalCdf = toCdf(originalUsd, r)
  }

  if (originalUsd > 0 && originalUsd < priceUsd) {
    originalUsd = priceUsd
  }

  if (originalCdf > 0 && originalCdf < priceCdf) {
    originalCdf = priceCdf
  }

  /* ---------------------------------------------------------- */
  /* Devise principale / secondaire                              */
  /* ---------------------------------------------------------- */

  const hasUsd = priceUsd > 0
  const hasCdf = priceCdf > 0
  const hasPrice = hasUsd || hasCdf

  const primaryCurrency: Currency | null = hasUsd
    ? 'USD'
    : hasCdf
      ? 'CDF'
      : null

  const secondaryCurrency: Currency | null =
    primaryCurrency === 'USD'
      ? hasCdf
        ? 'CDF'
        : null
      : primaryCurrency === 'CDF'
        ? hasUsd
          ? 'USD'
          : null
        : null

  const primaryAmount =
    primaryCurrency === 'USD'
      ? priceUsd
      : primaryCurrency === 'CDF'
        ? priceCdf
        : 0

  const secondaryAmount =
    secondaryCurrency === 'USD'
      ? priceUsd
      : secondaryCurrency === 'CDF'
        ? priceCdf
        : 0

  const originalPrimaryAmount =
    primaryCurrency === 'USD'
      ? originalUsd
      : primaryCurrency === 'CDF'
        ? originalCdf
        : 0

  const savingsPrimary =
    originalPrimaryAmount > primaryAmount && originalPrimaryAmount > 0
      ? originalPrimaryAmount - primaryAmount
      : 0

  /**
   * Le panier legacy attend encore un prix CDF exploitable.
   * On désactive l’ajout tant que le CDF n’est pas prêt.
   */
  const canAddToCart =
    hasPrice &&
    priceCdf > 0 &&
    base.stock !== 0

  return {
    ...base,

    priceUsd: roundUsd(priceUsd),
    priceCdf: roundCdf(priceCdf),

    originalPriceUsd: roundUsd(originalUsd),
    originalPriceCdf: roundCdf(originalCdf),

    discount,

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
/*  FETCH                                                          */
/* ═══════════════════════════════════════════════════════════════ */

function extractProductsArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>

    if (Array.isArray(data.data)) return data.data
    if (Array.isArray(data.products)) return data.products
    if (Array.isArray(data.items)) return data.items
    if (Array.isArray(data.results)) return data.results
  }

  return []
}

async function fetchBestSellersPage(
  queryString: string,
  signal?: AbortSignal
): Promise<FetchResult> {
  const response = await fetch(`/api/produits?${queryString}`, {
    signal,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Impossible de charger les meilleures ventes.'
    )
  }

  const rawProducts = extractProductsArray(payload)

  const products = rawProducts
    .map((product) => normalizeBaseProduct(product))
    .filter((product): product is BaseProduct => Boolean(product))

  const meta =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).meta
      : undefined

  const metaRecord =
    meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>)
      : {}

  const total = toNum(
    payload?.total ?? metaRecord.total,
    products.length
  )

  const totalPages = Math.max(
    1,
    toNum(
      payload?.totalPages ??
        payload?.total_pages ??
        metaRecord.totalPages ??
        metaRecord.total_pages,
      Math.ceil(total / Math.max(1, PER_PAGE))
    )
  )

  return {
    products,
    total,
    totalPages,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ROW COMPONENT                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface BestSellerRowProps {
  product: NormalizedProduct
  rank: number
  isAdding: boolean
  hasImageError: boolean
  onImageError: (productId: string) => void
  onAddToCart: (product: NormalizedProduct) => Promise<void> | void
}

function BestSellerRow({
  product,
  rank,
  isAdding,
  hasImageError,
  onImageError,
  onAddToCart,
}: BestSellerRowProps) {
  const { isFavorite, toggleFavorite } = useFavorites(product.id)

  const rankInfo = getRankBadge(rank)
  const image = product.images[0]

  const isOutOfStock = product.stock === 0
  const isLowStock =
    product.stock !== null && product.stock > 0 && product.stock <= 5

  const primaryText = formatProductAmount(
    product.primaryAmount,
    product.primaryCurrency
  )

  const secondaryText =
    product.secondaryAmount > 0 &&
    product.secondaryAmount !== product.primaryAmount
      ? `≈ ${formatProductAmount(
          product.secondaryAmount,
          product.secondaryCurrency
        )}`
      : null

  const originalText =
    product.originalPrimaryAmount > product.primaryAmount &&
    product.originalPrimaryAmount > 0
      ? formatProductAmount(
          product.originalPrimaryAmount,
          product.primaryCurrency
        )
      : null

  const savingsText =
    product.savingsPrimary > 0
      ? `Économisez ${formatProductAmount(
          product.savingsPrimary,
          product.primaryCurrency
        )}`
      : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'group flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300',
        'hover:border-gold-400/30 hover:bg-muted/50',
        'md:flex-row md:items-center md:justify-between'
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        {/* Rang */}
        <div
          className={cn(
            'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border font-black',
            rankInfo.bg
          )}
          aria-label={`Rang ${rank}`}
        >
          {rankInfo.icon ? rankInfo.icon : <span className="text-lg">{rankInfo.label}</span>}
        </div>

        {/* Image */}
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          {image && !hasImageError ? (
            <Image
              src={image}
              alt={product.nom}
              width={64}
              height={64}
              className="h-full w-full object-cover"
              onError={() => onImageError(product.id)}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-muted-foreground"
              aria-hidden="true"
            >
              <Package size={24} />
            </div>
          )}
        </div>

        {/* Infos */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Link
              href={product.href}
              className="line-clamp-1 font-bold text-foreground transition-colors hover:text-gold-500"
            >
              {product.nom}
            </Link>

            {product.badges.slice(0, 2).map((badge) => (
              <Badge key={badge} variant="gold" size="sm">
                {badge}
              </Badge>
            ))}

            {isOutOfStock && (
              <Badge variant="danger" size="sm">
                Rupture
              </Badge>
            )}

            {isLowStock && !isOutOfStock && (
              <Badge variant="danger" size="sm" className="animate-pulse">
                Stock critique
              </Badge>
            )}
          </div>

          {product.description && (
            <p className="line-clamp-1 text-sm text-muted-foreground">
              {product.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {product.categorie && (
              <Badge variant="neutral" size="sm">
                {product.categorie}
              </Badge>
            )}

            {product.rating != null && product.rating > 0 && (
              <span className="flex items-center gap-1 font-bold text-amber-400">
                <Star size={14} className="fill-amber-400" aria-hidden="true" />
                {product.rating.toFixed(1)}
                {product.reviews_count != null && product.reviews_count > 0 && (
                  <span className="font-normal text-muted-foreground">
                    ({product.reviews_count})
                  </span>
                )}
              </span>
            )}

            <span className="flex items-center gap-1 font-semibold text-emerald-400">
              <TrendingUp size={14} aria-hidden="true" />
              {formatVentes(product.total_ventes)} ventes
            </span>
          </div>
        </div>
      </div>

      {/* Actions / prix */}
      <div className="flex w-full shrink-0 flex-col gap-3 border-t border-border/50 pt-3 md:w-auto md:flex-row md:items-center md:justify-end md:border-t-0 md:pt-0">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Prix</p>

          <p className="text-xl font-bold text-gold-600">{primaryText}</p>

          {secondaryText && (
            <p className="text-xs text-muted-foreground">{secondaryText}</p>
          )}

          {originalText && (
            <p className="text-xs text-muted-foreground line-through">
              {originalText}
            </p>
          )}

          {product.discount > 0 && (
            <Badge variant="danger" size="sm" className="mt-1">
              -{product.discount}%
            </Badge>
          )}

          {savingsText && (
            <p className="mt-1 text-xs font-semibold text-emerald-500">
              {savingsText}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Tooltip
            content={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                void toggleFavorite?.()
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg transition hover:bg-red-400/10 focus:outline-none focus:ring-2 focus:ring-red-400"
              aria-label={
                isFavorite
                  ? `Retirer ${product.nom} des favoris`
                  : `Ajouter ${product.nom} aux favoris`
              }
            >
              <Heart
                size={18}
                className={
                  isFavorite
                    ? 'fill-red-500 text-red-500'
                    : 'text-muted-foreground'
                }
                aria-hidden="true"
              />
            </button>
          </Tooltip>

          <Tooltip content="Ajouter au panier">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                void onAddToCart(product)
              }}
              disabled={!product.canAddToCart || isAdding}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gold-400/10 text-gold-400 transition hover:bg-gold-400/20 focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Ajouter ${product.nom} au panier`}
            >
              {isAdding ? (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              ) : (
                <ShoppingBag size={18} aria-hidden="true" />
              )}
            </button>
          </Tooltip>

          <Tooltip content="Voir détails">
            <Link
              href={product.href}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg transition hover:bg-gold-400/10 focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label={`Voir détails de ${product.nom}`}
            >
              <ExternalLink size={18} className="text-muted-foreground" aria-hidden="true" />
            </Link>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CARD COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

interface BestSellerCardProps {
  product: NormalizedProduct
  rank: number
  isAdding: boolean
  hasImageError: boolean
  onImageError: (productId: string) => void
  onAddToCart: (product: NormalizedProduct) => Promise<void> | void
}

function BestSellerCard({
  product,
  rank,
  isAdding,
  hasImageError,
  onImageError,
  onAddToCart,
}: BestSellerCardProps) {
  const { isFavorite, toggleFavorite } = useFavorites(product.id)

  const rankInfo = getRankBadge(rank)
  const image = product.images[0]

  const isOutOfStock = product.stock === 0
  const isLowStock =
    product.stock !== null && product.stock > 0 && product.stock <= 5

  const primaryText = formatProductAmount(
    product.primaryAmount,
    product.primaryCurrency
  )

  const secondaryText =
    product.secondaryAmount > 0 &&
    product.secondaryAmount !== product.primaryAmount
      ? `≈ ${formatProductAmount(
          product.secondaryAmount,
          product.secondaryCurrency
        )}`
      : null

  const originalText =
    product.originalPrimaryAmount > product.primaryAmount &&
    product.originalPrimaryAmount > 0
      ? formatProductAmount(
          product.originalPrimaryAmount,
          product.primaryCurrency
        )
      : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300',
        'hover:border-gold-400/50 hover:shadow-lg hover:shadow-gold-500/5',
        isOutOfStock && 'opacity-70'
      )}
    >
      <div className="relative aspect-square bg-muted">
        {image && !hasImageError ? (
          <Image
            src={image}
            alt={product.nom}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => onImageError(product.id)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-muted-foreground"
            aria-hidden="true"
          >
            <Package size={36} strokeWidth={1.5} />
          </div>
        )}

        <div
          className={cn(
            'absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold',
            rankInfo.bg
          )}
          aria-label={`Rang ${rank}`}
        >
          {rankInfo.icon ? rankInfo.icon : <span>{rankInfo.label}</span>}
        </div>

        {product.discount > 0 && (
          <Badge
            variant="danger"
            size="sm"
            className="absolute right-2 top-2"
          >
            -{product.discount}%
          </Badge>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
            <Badge variant="danger" size="sm">
              Rupture
            </Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link
          href={product.href}
          className="line-clamp-2 font-semibold text-foreground transition-colors hover:text-gold-500"
        >
          {product.nom}
        </Link>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {product.categorie && (
            <Badge variant="neutral" size="sm">
              {product.categorie}
            </Badge>
          )}

          <span className="flex items-center gap-1 text-emerald-400">
            <TrendingUp size={12} aria-hidden="true" />
            {formatVentes(product.total_ventes)} ventes
          </span>

          {product.rating != null && product.rating > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <Star size={12} className="fill-amber-400" aria-hidden="true" />
              {product.rating.toFixed(1)}
            </span>
          )}
        </div>

        {isLowStock && !isOutOfStock && (
          <p className="text-xs font-medium text-amber-500">
            Plus que {product.stock} en stock
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-gold-600">
              {primaryText}
            </p>

            {secondaryText && (
              <p className="truncate text-[11px] text-muted-foreground">
                {secondaryText}
              </p>
            )}

            {originalText && (
              <p className="truncate text-[11px] text-muted-foreground line-through">
                {originalText}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                void toggleFavorite?.()
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-red-400/10 focus:outline-none focus:ring-2 focus:ring-red-400"
              aria-label={
                isFavorite
                  ? `Retirer ${product.nom} des favoris`
                  : `Ajouter ${product.nom} aux favoris`
              }
            >
              <Heart
                size={16}
                className={
                  isFavorite
                    ? 'fill-red-500 text-red-500'
                    : 'text-muted-foreground'
                }
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                void onAddToCart(product)
              }}
              disabled={!product.canAddToCart || isAdding}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gold-400/10 text-gold-400 transition hover:bg-gold-400/20 focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Ajouter ${product.nom} au panier`}
            >
              {isAdding ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <ShoppingBag size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SKELETON                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function MeilleuresVentesFallback() {
  return (
    <div className="min-h-screen bg-background">
      <Container className="py-8">
        <div className="mb-8 space-y-3">
          <Skeleton variant="text" className="h-8 w-64 rounded-full" />
          <Skeleton variant="text" className="h-4 w-96 rounded-full" />
        </div>

        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`best-sellers-fallback-${index}`}
              className="flex items-center gap-6 rounded-2xl border border-border p-6"
            >
              <Skeleton variant="rectangular" className="h-14 w-14 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="h-5 w-1/2 rounded-full" />
                <Skeleton variant="text" className="h-4 w-3/4 rounded-full" />
              </div>
              <Skeleton variant="text" className="h-7 w-24 rounded-full" />
              <Skeleton variant="rectangular" className="h-10 w-10 rounded-lg" />
            </div>
          ))}
        </div>

        <span className="sr-only">Chargement des meilleures ventes…</span>
      </Container>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN CONTENT                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function MeilleuresVentesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { user, loading: authLoading } = useAuth()
  const cart = useCart() as any
  const addItem = cart?.addItem

  const toast = useToast() as any
  const addToast = toast?.addToast

  const { rate } = useExchangeRate()

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   * On évite donc d’utiliser le taux avant hydratation.
   */
  const safeRate = mounted ? positiveNumber(rate) : null

  const initialSearch = searchParams.get('search') || ''
  const initialCategorieParam = searchParams.get('categorie') || 'all'
  const initialPageParam = Number(searchParams.get('page') || '1')

  const [search, setSearch] = useState(initialSearch)
  const [categorie, setCategorie] = useState(
    CATEGORIES.includes(initialCategorieParam)
      ? initialCategorieParam
      : 'all'
  )
  const [page, setPage] = useState(
    Number.isFinite(initialPageParam) && initialPageParam > 0
      ? Math.floor(initialPageParam)
      : 1
  )
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [addingId, setAddingId] = useState<string | null>(null)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())

  const trimmedSearch = search.trim()

  /* ───────────────────────────────────────────────────────────── */
  /*  Synchronisation URL                                          */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const params = new URLSearchParams()

    if (trimmedSearch) params.set('search', trimmedSearch)
    if (categorie !== 'all') params.set('categorie', categorie)
    if (page > 1) params.set('page', String(page))

    const queryString = params.toString()

    router.replace(
      queryString ? `/meilleures-ventes?${queryString}` : '/meilleures-ventes',
      { scroll: false }
    )
  }, [categorie, page, router, trimmedSearch])

  /* ───────────────────────────────────────────────────────────── */
  /*  Requête API                                                  */
  /* ───────────────────────────────────────────────────────────── */

  const queryString = useMemo(() => {
    const params = new URLSearchParams()

    params.set('limit', String(PER_PAGE))
    params.set('page', String(page))
    params.set('sort_by', 'total_ventes')
    params.set('sort_order', 'desc')
    params.set('est_actif', 'true')

    if (trimmedSearch) params.set('search', trimmedSearch)
    if (categorie !== 'all') params.set('categorie', categorie)

    return params.toString()
  }, [categorie, page, trimmedSearch])

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<FetchResult>({
    queryKey: ['meilleures-ventes-page-aligned', queryString],
    queryFn: ({ signal }) => fetchBestSellersPage(queryString, signal),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  })

  const baseProducts = useMemo(
    () => data?.products ?? [],
    [data?.products]
  )

  const products = useMemo<NormalizedProduct[]>(
    () =>
      baseProducts.map((product) =>
        applyExchangeRateToProduct(product, safeRate)
      ),
    [baseProducts, safeRate]
  )

  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  /* ───────────────────────────────────────────────────────────── */
  /*  Sécurité pagination                                          */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  /* ───────────────────────────────────────────────────────────── */
  /*  Auth guard                                                   */
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
        `/login?redirect=${encodeURIComponent(getCurrentPath('/meilleures-ventes'))}`
      )

      return false
    },
    [addToast, authLoading, router, user]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  Handlers                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const handleAddToCart = useCallback(
    async (product: NormalizedProduct) => {
      if (product.stock === 0) {
        addToast?.({
          type: 'warning',
          message: `${product.nom} est en rupture de stock.`,
        })
        return
      }

      if (!product.hasPrice) {
        addToast?.({
          type: 'warning',
          message: `${product.nom} est sur demande.`,
        })
        return
      }

      if (!product.canAddToCart) {
        addToast?.({
          type: 'info',
          message: 'Conversion CDF en cours, réessayez dans quelques secondes.',
        })
        return
      }

      if (!requireAuth('Veuillez vous connecter pour ajouter au panier.')) {
        return
      }

      if (typeof addItem !== 'function') {
        addToast?.({
          type: 'error',
          message: 'Le panier est momentanément indisponible.',
        })
        return
      }

      setAddingId(product.id)

      try {
        const payload = {
          id: product.id,
          product_id: product.id,
          nom: product.nom,

          /**
           * Legacy panier : CDF.
           */
          prix: product.priceCdf,

          /**
           * USD = source principale.
           */
          prix_usd: product.priceUsd > 0 ? product.priceUsd : undefined,
          unit_price_usd:
            product.priceUsd > 0 ? product.priceUsd : undefined,

          quantite: 1,

          image: product.images[0] ?? undefined,

          prix_initial:
            product.originalPriceCdf > product.priceCdf
              ? product.originalPriceCdf
              : undefined,

          remise: product.discount > 0 ? product.discount : undefined,

          stock: product.stock ?? undefined,
          stock_disponible: product.stock ?? undefined,

          delivery_config: product.delivery_config ?? null,
          poids_kg: product.poids_kg ?? null,

          logistics_group:
            product.delivery_config?.logistics?.group ?? null,

          non_consolidable:
            product.delivery_config?.non_consolidable ??
            product.delivery_config?.modes?.domicile?.non_consolidable ??
            false,

          variante: null,
        } as any

        await addItem(payload, 1)

        addToast?.({
          type: 'success',
          message: `${product.nom} ajouté au panier.`,
        })
      } catch (err: any) {
        if (err?.code === 'AUTH_REQUIRED') {
          router.push(
            `/login?redirect=${encodeURIComponent(
              getCurrentPath('/meilleures-ventes')
            )}`
          )
          return
        }

        addToast?.({
          type: 'error',
          message:
            err?.message || 'Impossible d’ajouter ce produit au panier.',
        })
      } finally {
        setAddingId(null)
      }
    },
    [addItem, addToast, requireAuth, router]
  )

  const handleImageError = useCallback((productId: string) => {
    setImageErrors((previous) => {
      const next = new Set(previous)
      next.add(productId)
      return next
    })
  }, [])

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value)
      setPage(1)
    },
    []
  )

  const handleClearSearch = useCallback(() => {
    setSearch('')
    setPage(1)
  }, [])

  const handleCategoryChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setCategorie(event.target.value)
      setPage(1)
    },
    []
  )

  const handleToggleView = useCallback(() => {
    setViewMode((previous) => (previous === 'list' ? 'grid' : 'list'))
  }, [])

  const resetFilters = useCallback(() => {
    setSearch('')
    setCategorie('all')
    setPage(1)
  }, [])

  const hasActiveFilters = trimmedSearch !== '' || categorie !== 'all'

  const paginationPages = useMemo(
    () => getPageNumbers(page, totalPages),
    [page, totalPages]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  Rendu                                                        */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-background">
      <ScrollToTop variant="circle" showProgress />

      {/* En-tête */}
      <section className="sticky top-0 z-30 border-b border-border bg-background/80 shadow-sm backdrop-blur-xl">
        <Container className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl p-2 transition-colors hover:bg-gold-400/10"
              aria-label="Retour à l’accueil"
            >
              <ArrowLeft
                size={20}
                className="text-muted-foreground transition-colors hover:text-gold-500"
                aria-hidden="true"
              />
            </Link>

            <div>
              <h1 className="flex items-center gap-2 font-serif text-2xl font-bold text-foreground">
                <Trophy size={24} className="text-amber-400" aria-hidden="true" />
                Meilleures Ventes
              </h1>

              <p className="text-xs text-muted-foreground">
                {total} produit{total > 1 ? 's' : ''} classé
                {total > 1 ? 's' : ''} par popularité
              </p>
            </div>
          </div>

          <Button
            variant="outline-gold"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            leftIcon={
              <RotateCcw
                size={14}
                className={cn(isFetching && 'animate-spin')}
                aria-hidden="true"
              />
            }
          >
            Actualiser
          </Button>
        </Container>
      </section>

      <Container className="py-8">
        {/* Barre d’outils */}
        <div className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-sm flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />

            <Input
              placeholder="Rechercher un produit..."
              value={search}
              onChange={handleSearchChange}
              className="pl-10"
              allowClear
              onClear={handleClearSearch}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={categorie}
              onChange={handleCategoryChange}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label="Filtrer par catégorie"
            >
              <option value="all">Toutes catégories</option>

              {CATEGORIES.filter((cat) => cat !== 'all').map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleToggleView}
              className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label={
                viewMode === 'list'
                  ? 'Passer en vue grille'
                  : 'Passer en vue liste'
              }
            >
              {viewMode === 'list' ? (
                <Grid size={16} aria-hidden="true" />
              ) : (
                <List size={16} aria-hidden="true" />
              )}
            </button>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-red-500"
              leftIcon={<X size={14} aria-hidden="true" />}
            >
              Effacer filtres
            </Button>
          )}
        </div>

        {/* Contenu */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`best-sellers-loading-${index}`}
                className="flex items-center gap-6 rounded-2xl border border-border p-6"
              >
                <Skeleton
                  variant="rectangular"
                  className="h-14 w-14 rounded-xl"
                />

                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" className="h-5 w-1/2 rounded-full" />
                  <Skeleton variant="text" className="h-4 w-3/4 rounded-full" />

                  <div className="flex gap-3">
                    <Skeleton variant="text" className="h-4 w-16 rounded-full" />
                    <Skeleton variant="text" className="h-4 w-20 rounded-full" />
                  </div>
                </div>

                <Skeleton variant="text" className="h-7 w-24 rounded-full" />
                <Skeleton
                  variant="rectangular"
                  className="h-10 w-10 rounded-lg"
                />
              </div>
            ))}

            <span className="sr-only">Chargement des meilleures ventes…</span>
          </div>
        ) : isError ? (
          <div className="py-20 text-center">
            <Package
              size={48}
              className="mx-auto mb-4 text-muted-foreground"
              aria-hidden="true"
            />

            <p className="mb-4 text-red-500">
              {error instanceof Error
                ? error.message
                : 'Impossible de charger les meilleures ventes.'}
            </p>

            <Button
              variant="outline-gold"
              onClick={() => void refetch()}
              leftIcon={<RotateCcw size={14} aria-hidden="true" />}
            >
              Réessayer
            </Button>
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center">
            <Trophy
              size={48}
              className="mx-auto mb-4 text-muted-foreground"
              aria-hidden="true"
            />

            <p className="text-muted-foreground">
              Aucune vente trouvée pour ces critères.
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {products.map((product, index) => {
                const globalRank = (page - 1) * PER_PAGE + index + 1

                return (
                  <BestSellerRow
                    key={product.id}
                    product={product}
                    rank={globalRank}
                    isAdding={addingId === product.id}
                    hasImageError={imageErrors.has(product.id)}
                    onImageError={handleImageError}
                    onAddToCart={handleAddToCart}
                  />
                )
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence initial={false}>
              {products.map((product, index) => {
                const globalRank = (page - 1) * PER_PAGE + index + 1

                return (
                  <BestSellerCard
                    key={product.id}
                    product={product}
                    rank={globalRank}
                    isAdding={addingId === product.id}
                    hasImageError={imageErrors.has(product.id)}
                    onImageError={handleImageError}
                    onAddToCart={handleAddToCart}
                  />
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && !isLoading && !isError && products.length > 0 && (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              disabled={page === 1}
              leftIcon={<ChevronLeft size={16} aria-hidden="true" />}
            >
              Précédent
            </Button>

            {paginationPages.map((pageItem, index) => {
              if (pageItem === 'ellipsis') {
                return (
                  <span
                    key={`pagination-ellipsis-${index}`}
                    className="px-2 text-muted-foreground"
                    aria-hidden="true"
                  >
                    …
                  </span>
                )
              }

              return (
                <Button
                  key={pageItem}
                  variant={pageItem === page ? 'gold' : 'outline-gold'}
                  size="sm"
                  onClick={() => setPage(pageItem)}
                  aria-current={pageItem === page ? 'page' : undefined}
                >
                  {pageItem}
                </Button>
              )
            })}

            <Button
              variant="outline-gold"
              size="sm"
              onClick={() =>
                setPage((previous) => Math.min(totalPages, previous + 1))
              }
              disabled={page === totalPages}
              rightIcon={<ChevronRight size={16} aria-hidden="true" />}
            >
              Suivant
            </Button>
          </div>
        )}
      </Container>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE EXPORT                                                    */
/* ═══════════════════════════════════════════════════════════════ */

export default function MeilleuresVentesPage() {
  return (
    <Suspense fallback={<MeilleuresVentesFallback />}>
      <MeilleuresVentesContent />
    </Suspense>
  )
}