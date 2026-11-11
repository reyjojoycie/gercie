// app/deals/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'

import { Section } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useToast } from '@/components/ui/Toast'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useFavorites } from '@/hooks/useFavorites'
import { useExchangeRate } from '@/hooks/useExchangeRate'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

import { cn } from '@/lib/utils'

import {
  AlertCircle,
  Check,
  Clock,
  ExternalLink,
  Grid,
  Heart,
  List,
  Loader2,
  Package,
  Percent,
  RotateCcw,
  Search,
  Share2,
  ShoppingBag,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

/**
 * Données de base normalisées depuis l’API.
 *
 * IMPORTANT :
 * - On ne fige pas le CDF dans le cache.
 * - On conserve les sources de prix.
 * - Le CDF final est recalculé à l’affichage avec useExchangeRate().
 */
interface BaseDeal {
  id: string
  title: string
  slug?: string | null
  image: string | null
  categorie?: string | null
  description?: string | null
  date_fin: string
  date_debut?: string | null
  stock: number | null
  vendu: number
  rawDiscount: number

  /**
   * USD = source principale quand disponible.
   */
  dealUsdSource: number | null
  dealCdfSource: number | null

  originalUsdSource: number | null
  originalCdfSource: number | null

  delivery_config?: any
  poids_kg?: number | null

  [key: string]: any
}

/**
 * Deal après application du taux courant.
 */
interface DisplayDeal extends BaseDeal {
  priceUsd: number
  priceCdf: number

  originalPriceUsd: number
  originalPriceCdf: number

  discount: number
}

/**
 * Deal enrichi pour affichage / tri / filtration / ajout panier.
 */
interface ProcessedDeal extends DisplayDeal {
  timeLeft: number
  isExpired: boolean

  hasPrice: boolean
  canAddToCart: boolean

  primaryCurrency: Currency | null
  secondaryCurrency: Currency | null

  primaryAmount: number
  secondaryAmount: number

  originalPrimaryAmount: number
  savingsPrimary: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const PLACEHOLDER = '/placeholder.jpg'

const SORT_OPTIONS = [
  { value: 'remise', label: 'Meilleure réduction' },
  { value: 'prix_asc', label: 'Prix croissant' },
  { value: 'prix_desc', label: 'Prix décroissant' },
  { value: 'temps', label: 'Temps restant' },
  { value: 'recent', label: 'Plus récent' },
]

const FILTER_REMISE_MIN = [
  { value: 0, label: 'Toutes' },
  { value: 10, label: '≥ 10%' },
  { value: 25, label: '≥ 25%' },
  { value: 50, label: '≥ 50%' },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

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

function normalizeEndTime(value: unknown): string {
  const raw = textOrNull(value)

  if (raw && !Number.isNaN(Date.parse(raw))) {
    return raw
  }

  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}

function formatDealAmount(
  value: number | null | undefined,
  currency: Currency | null
): string {
  const n = Number(value || 0)

  if (!currency || !Number.isFinite(n) || n <= 0) return '—'

  return currency === 'USD' ? formatUsd(n) : formatCdf(n)
}

function formatTimeLeft(diff: number): string {
  if (diff <= 0) return 'Expiré'

  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)

  if (days > 0) return `${days}j ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function getCurrentPath(fallback = '/deals'): string {
  if (typeof window === 'undefined') return fallback

  const path = `${window.location.pathname}${window.location.search}`

  if (path.startsWith('/login')) return '/'

  return path
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION API                                              */
/* ═══════════════════════════════════════════════════════════════ */

function mapDeal(raw: unknown, index: number): BaseDeal | null {
  if (!raw || typeof raw !== 'object') return null

  const data = raw as Record<string, unknown>

  const product =
    (data.product as Record<string, unknown> | undefined) ??
    (data.produit as Record<string, unknown> | undefined) ??
    null

  const id =
    textOrNull(data.id ?? data._id ?? product?.id) ??
    `deal-${index}`

  const title =
    textOrNull(
      data.title ??
        data.nom ??
        data.name ??
        data.productName ??
        data.product_name ??
        product?.nom ??
        product?.name
    ) ?? ''

  if (!title) return null

  const image = firstImage(
    data.image,
    data.images,
    data.thumbnail,
    data.photo,
    data.image_url,
    product?.image,
    product?.images,
    product?.thumbnail
  )

  const categorie =
    textOrNull(
      data.categorie ??
        data.category ??
        data.productCategory ??
        product?.categorie ??
        product?.category
    ) ?? undefined

  const description =
    textOrNull(
      data.description ??
        data.desc ??
        data.excerpt ??
        product?.description
    ) ?? undefined

  const date_fin = normalizeEndTime(
    data.date_fin ??
      data.endTime ??
      data.end_date ??
      data.ends_at ??
      product?.date_fin ??
      product?.ends_at
  )

  const date_debut =
    textOrNull(
      data.date_debut ??
        data.startDate ??
        data.start_date ??
        data.created_at ??
        product?.date_debut
    ) ?? undefined

  const stock = nonNegativeNumber(
    data.stock ??
      data.stock_restant ??
      product?.stock ??
      product?.stock_restant
  )

  const vendu = Math.max(
    0,
    Math.round(
      Number(
        data.vendu ??
          data.total_ventes ??
          data.sales ??
          product?.total_ventes ??
          product?.vendu ??
          0
      ) || 0
    )
  )

  const slug =
    textOrNull(data.slug ?? product?.slug) ?? undefined

  const delivery_config =
    data.delivery_config ??
    product?.delivery_config ??
    null

  const poids_kg = nonNegativeNumber(
    data.poids_kg ??
      data.weight_kg ??
      product?.poids_kg ??
      product?.weight_kg
  )

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
    data.discounted_price,
    data.current_price,
    data.price_promo,
    product?.prix_promo,
    product?.promo_price,
    product?.effective_price,
    product?.current_price
  )

  const baseUsd = candidateNumber(
    data.prix_usd,
    data.price_usd,
    data.unit_price_usd,
    data.prix_normal_usd,
    data.normal_price_usd,
    product?.prix_usd,
    product?.price_usd,
    product?.unit_price_usd
  )

  const baseCdf = candidateNumber(
    data.prix_normal,
    data.prix,
    data.price,
    data.normal_price,
    data.base_price,
    data.originalPrice,
    product?.prix_normal,
    product?.prix,
    product?.price
  )

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
    data.originalPriceCdf,
    product?.prix_original,
    product?.original_price,
    product?.prix_comparatif
  )

  const hasPromo = promoUsd != null || promoCdf != null

  let dealUsdSource: number | null = null
  let dealCdfSource: number | null = null

  let originalUsdSource: number | null = null
  let originalCdfSource: number | null = null

  if (hasPromo) {
    dealUsdSource = promoUsd
    dealCdfSource = promoCdf

    originalUsdSource = explicitOriginalUsd ?? baseUsd
    originalCdfSource = explicitOriginalCdf ?? baseCdf
  } else {
    dealUsdSource = baseUsd
    dealCdfSource = baseCdf

    originalUsdSource = explicitOriginalUsd
    originalCdfSource = explicitOriginalCdf
  }

  if (dealUsdSource == null && dealCdfSource == null) return null

  const rawDiscount = clampPercent(
    data.discount ??
      data.remise_percent ??
      data.discount_percent ??
      product?.discount ??
      product?.remise_percent
  )

  return {
    id,
    title,
    slug,
    image,
    categorie,
    description,
    date_fin,
    date_debut,
    stock,
    vendu,
    rawDiscount,

    dealUsdSource,
    dealCdfSource,

    originalUsdSource,
    originalCdfSource,

    delivery_config,
    poids_kg,
  }
}

function normalizeResponse(payload: unknown): BaseDeal[] {
  const array = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] })?.data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { promotions?: unknown[] })?.promotions)
        ? (payload as { promotions: unknown[] }).promotions
        : Array.isArray((payload as { deals?: unknown[] })?.deals)
          ? (payload as { deals: unknown[] }).deals
          : Array.isArray((payload as { items?: unknown[] })?.items)
            ? (payload as { items: unknown[] }).items
            : Array.isArray((payload as { results?: unknown[] })?.results)
              ? (payload as { results: unknown[] }).results
              : []

  return array
    .map((item, index) => mapDeal(item, index))
    .filter((item): item is BaseDeal => item !== null)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  APPLICATION DU TAUX USD → CDF À L’AFFICHAGE                    */
/* ═══════════════════════════════════════════════════════════════ */

function applyExchangeRateToDeal(
  base: BaseDeal,
  rate: number | null
): DisplayDeal {
  const r = positiveNumber(rate)

  let priceUsd = positiveNumber(base.dealUsdSource) ?? 0
  let priceCdf = positiveNumber(base.dealCdfSource) ?? 0

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

  return {
    ...base,

    priceUsd: roundUsd(priceUsd),
    priceCdf: roundCdf(priceCdf),

    originalPriceUsd: roundUsd(originalUsd),
    originalPriceCdf: roundCdf(originalCdf),

    discount,
  }
}

function decorateDeal(deal: DisplayDeal, now: number): ProcessedDeal {
  const timeLeft = new Date(deal.date_fin).getTime() - now
  const isExpired = timeLeft <= 0

  const hasUsd = deal.priceUsd > 0
  const hasCdf = deal.priceCdf > 0
  const hasPrice = hasUsd || hasCdf

  const primaryCurrency: Currency | null = hasUsd
    ? 'USD'
    : hasCdf
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
      ? deal.priceUsd
      : primaryCurrency === 'CDF'
        ? deal.priceCdf
        : 0

  const secondaryAmount =
    secondaryCurrency === 'USD'
      ? deal.priceUsd
      : secondaryCurrency === 'CDF'
        ? deal.priceCdf
        : 0

  const originalPrimaryAmount =
    primaryCurrency === 'USD'
      ? deal.originalPriceUsd
      : primaryCurrency === 'CDF'
        ? deal.originalPriceCdf
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
    deal.priceCdf > 0 &&
    !isExpired &&
    deal.stock !== 0

  return {
    ...deal,
    timeLeft,
    isExpired,
    hasPrice,
    canAddToCart,
    primaryCurrency,
    secondaryCurrency,
    primaryAmount,
    secondaryAmount,
    originalPrimaryAmount,
    savingsPrimary,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DEAL CARD                                                      */
/* ═══════════════════════════════════════════════════════════════ */

function DealCard({
  deal,
  onAddToCart,
}: {
  deal: ProcessedDeal
  onAddToCart: (deal: ProcessedDeal) => Promise<void> | void
}) {
  const { isFavorite, toggleFavorite } = useFavorites(deal.id)
  const toast = useToast() as any
  const addToast = toast?.addToast

  const [copied, setCopied] = useState(false)
  const [adding, setAdding] = useState(false)

  const copyLink = useCallback(async () => {
    if (typeof window === 'undefined') return

    const url = `${window.location.origin}/produits/${deal.slug || deal.id}`

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      addToast?.({ type: 'success', message: 'Lien copié !' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      addToast?.({ type: 'error', message: 'Impossible de copier le lien.' })
    }
  }, [addToast, deal.id, deal.slug])

  const shareDeal = useCallback(async () => {
    const url = `${window.location.origin}/produits/${deal.slug || deal.id}`

    const priceText = deal.hasPrice
      ? formatDealAmount(deal.primaryAmount, deal.primaryCurrency)
      : 'sur demande'

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: deal.title,
          text: `${deal.title} à ${priceText}`,
          url,
        })
      } else {
        await copyLink()
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Erreur partage offre:', err)
      }
    }
  }, [
    copyLink,
    deal.hasPrice,
    deal.id,
    deal.primaryAmount,
    deal.primaryCurrency,
    deal.slug,
    deal.title,
  ])

  const handleAdd = useCallback(async () => {
    setAdding(true)

    try {
      await onAddToCart(deal)
    } finally {
      setAdding(false)
    }
  }, [deal, onAddToCart])

  const isOutOfStock = deal.stock === 0
  const isLowStock =
    deal.stock !== null && deal.stock > 0 && deal.stock <= 5

  const primaryText = deal.hasPrice
    ? formatDealAmount(deal.primaryAmount, deal.primaryCurrency)
    : 'Prix sur demande'

  const secondaryText =
    deal.hasPrice &&
    deal.secondaryAmount > 0 &&
    deal.secondaryAmount !== deal.primaryAmount
      ? `≈ ${formatDealAmount(deal.secondaryAmount, deal.secondaryCurrency)}`
      : null

  const originalText =
    deal.originalPrimaryAmount > deal.primaryAmount &&
    deal.originalPrimaryAmount > 0
      ? formatDealAmount(deal.originalPrimaryAmount, deal.primaryCurrency)
      : null

  const addLabel = deal.isExpired
    ? 'Expiré'
    : isOutOfStock
      ? 'Rupture'
      : !deal.hasPrice
        ? 'Sur demande'
        : !deal.canAddToCart
          ? 'Patientez…'
          : 'Ajouter'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300',
        'hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-400/5',
        deal.isExpired && 'opacity-60'
      )}
    >
      {/* Badge remise */}
      <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-400">
        <Zap size={14} aria-hidden="true" />
        {deal.discount > 0 ? `-${deal.discount}%` : 'Promo'}
      </span>

      {/* Compte à rebours */}
      <span
        className={cn(
          'absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm',
          deal.timeLeft <= 3_600_000
            ? 'border-red-500/30 bg-red-500/20 text-red-400'
            : 'border-white/20 bg-black/40 text-white'
        )}
      >
        <Clock size={12} aria-hidden="true" />
        {deal.isExpired ? 'Expiré' : formatTimeLeft(deal.timeLeft)}
      </span>

      {/* Image */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <Image
          src={deal.image || PLACEHOLDER}
          alt={deal.title}
          width={640}
          height={360}
          className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />

        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
            <Badge variant="danger" size="sm">
              Rupture
            </Badge>
          </div>
        )}
      </div>

      {/* Contenu */}
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex items-center gap-2">
          {deal.categorie && (
            <Badge variant="neutral" size="sm" className="text-xs">
              {deal.categorie}
            </Badge>
          )}

          {deal.vendu > 10 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp size={12} aria-hidden="true" />
              {deal.vendu} vendus
            </span>
          )}
        </div>

        <h3 className="line-clamp-2 text-xl font-bold text-foreground transition-colors group-hover:text-amber-400">
          {deal.title}
        </h3>

        {deal.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {deal.description}
          </p>
        )}

        {/* Prix */}
        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-extrabold text-amber-400">
                {primaryText}
              </span>

              {secondaryText && (
                <span className="text-sm text-muted-foreground">
                  {secondaryText}
                </span>
              )}

              {originalText && (
                <span className="text-sm text-muted-foreground line-through">
                  {originalText}
                </span>
              )}
            </div>

            {deal.savingsPrimary > 0 && (
              <p className="mt-1 text-xs font-semibold text-emerald-500">
                Économisez{' '}
                {formatDealAmount(deal.savingsPrimary, deal.primaryCurrency)}
              </p>
            )}
          </div>

          <div className="flex shrink-0 gap-1">
            <Tooltip content="Ajouter au panier">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  void handleAdd()
                }}
                disabled={!deal.canAddToCart || adding}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400 transition hover:bg-amber-400/20 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Ajouter ${deal.title} au panier`}
              >
                {adding ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ShoppingBag size={18} aria-hidden="true" />
                )}
              </button>
            </Tooltip>

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
                  isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'
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

            <Tooltip content="Partager">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  void shareDeal()
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg transition hover:bg-blue-400/10 focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label={`Partager ${deal.title}`}
              >
                <Share2 size={18} className="text-muted-foreground" aria-hidden="true" />
              </button>
            </Tooltip>

            <Tooltip content="Copier le lien">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  void copyLink()
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-amber-400"
                aria-label={`Copier le lien de ${deal.title}`}
              >
                {copied ? (
                  <Check size={18} className="text-emerald-500" aria-hidden="true" />
                ) : (
                  <Share2 size={18} className="text-muted-foreground" aria-hidden="true" />
                )}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Stock restant */}
        {isLowStock && (
          <div className="mt-2 flex items-center gap-1 text-xs text-amber-400">
            <AlertCircle size={12} aria-hidden="true" />
            Plus que {deal.stock} en stock
          </div>
        )}

        {/* Bouton voir détail */}
        <Link
          href={`/produits/${deal.slug || deal.id}`}
          className="mt-2 block w-full rounded-lg bg-muted py-2 text-center text-sm text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
        >
          Voir les détails
          <ExternalLink size={12} className="ml-1 inline" aria-hidden="true" />
        </Link>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                */
/* ═══════════════════════════════════════════════════════════════ */

export default function DealsPage() {
  const router = useRouter()

  const cart = useCart() as any
  const addItem = cart?.addItem

  const toast = useToast() as any
  const addToast = toast?.addToast

  const { user, loading: authLoading } = useAuth()
  const { rate, loading: rateLoading } = useExchangeRate()

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

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('remise')
  const [filterRemiseMin, setFilterRemiseMin] = useState<number>(0)
  const [filterCategorie, setFilterCategorie] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showExpired, setShowExpired] = useState(false)

  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  Chargement API                                               */
  /* ───────────────────────────────────────────────────────────── */

  const {
    data: baseDeals = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<BaseDeal[]>({
    queryKey: ['active-deals-aligned-v2'],
    queryFn: async () => {
      const response = await fetch('/api/promotions/actives', {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Impossible de charger les offres.')
      }

      const payload = await response.json()

      return normalizeResponse(payload)
    },
    staleTime: 60_000,
  })

  /* ───────────────────────────────────────────────────────────── */
  /*  Application taux + enrichment                                */
  /* ───────────────────────────────────────────────────────────── */

  const displayDeals = useMemo<DisplayDeal[]>(
    () => baseDeals.map((deal) => applyExchangeRateToDeal(deal, safeRate)),
    [baseDeals, safeRate]
  )

  const processedDeals = useMemo<ProcessedDeal[]>(
    () => displayDeals.map((deal) => decorateDeal(deal, now)),
    [displayDeals, now]
  )

  const categories = useMemo(() => {
    const cats = new Set<string>()

    processedDeals.forEach((deal) => {
      if (deal.categorie) cats.add(deal.categorie)
    })

    return Array.from(cats).sort((a, b) => a.localeCompare(b))
  }, [processedDeals])

  /* ───────────────────────────────────────────────────────────── */
  /*  Filtrage / tri                                               */
  /* ───────────────────────────────────────────────────────────── */

  const filteredDeals = useMemo(() => {
    let list = [...processedDeals]

    if (search.trim()) {
      const q = search.toLowerCase().trim()

      list = list.filter((deal) => {
        const title = String(deal.title || '').toLowerCase()
        const description = String(deal.description || '').toLowerCase()
        const categorie = String(deal.categorie || '').toLowerCase()

        return (
          title.includes(q) ||
          description.includes(q) ||
          categorie.includes(q)
        )
      })
    }

    if (filterCategorie !== 'all') {
      list = list.filter((deal) => deal.categorie === filterCategorie)
    }

    if (filterRemiseMin > 0) {
      list = list.filter((deal) => deal.discount >= filterRemiseMin)
    }

    if (!showExpired) {
      list = list.filter((deal) => !deal.isExpired)
    }

    /**
     * Tri prix :
     * - USD principal si disponible ;
     * - sinon CDF converti temporairement en USD si taux disponible ;
     * - sinon CDF brut en fallback.
     */
    const getSortPrice = (deal: ProcessedDeal): number => {
      if (deal.priceUsd > 0) return deal.priceUsd
      if (safeRate && deal.priceCdf > 0) return deal.priceCdf / safeRate
      return deal.priceCdf
    }

    switch (sortBy) {
      case 'remise':
        list.sort((a, b) => b.discount - a.discount)
        break

      case 'prix_asc':
        list.sort((a, b) => getSortPrice(a) - getSortPrice(b))
        break

      case 'prix_desc':
        list.sort((a, b) => getSortPrice(b) - getSortPrice(a))
        break

      case 'temps':
        list.sort((a, b) => a.timeLeft - b.timeLeft)
        break

      case 'recent':
        list.sort((a, b) => {
          const aDate = new Date(a.date_debut || a.date_fin).getTime()
          const bDate = new Date(b.date_debut || b.date_fin).getTime()
          return bDate - aDate
        })
        break

      default:
        break
    }

    return list
  }, [
    filterCategorie,
    filterRemiseMin,
    processedDeals,
    safeRate,
    search,
    showExpired,
    sortBy,
  ])

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
        `/login?redirect=${encodeURIComponent(getCurrentPath('/deals'))}`
      )

      return false
    },
    [addToast, authLoading, router, user]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  Ajout panier                                                 */
  /* ───────────────────────────────────────────────────────────── */

  const handleAddToCart = useCallback(
    async (deal: ProcessedDeal) => {
      if (deal.isExpired) {
        addToast?.({
          type: 'warning',
          message: 'Cette offre est expirée.',
        })
        return
      }

      if (deal.stock === 0) {
        addToast?.({
          type: 'error',
          message: `${deal.title} est en rupture de stock.`,
        })
        return
      }

      if (!deal.hasPrice) {
        addToast?.({
          type: 'warning',
          message: `${deal.title} est sur demande.`,
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

      if (typeof addItem !== 'function') {
        addToast?.({
          type: 'error',
          message: 'Le panier est momentanément indisponible.',
        })
        return
      }

      try {
        /**
         * Payload aligné avec CartContext :
         * - prix = CDF unitaire pour compatibilité legacy ;
         * - prix_usd / unit_price_usd = USD principal ;
         * - prix_initial / remise pour suivi promo ;
         * - delivery_config / poids_kg / logistics_group / non_consolidable
         *   pour estimation livraison intelligente.
         */
        const payload = {
          id: deal.id,
          product_id: deal.id,
          nom: deal.title,

          prix: deal.priceCdf,
          prix_usd: deal.priceUsd > 0 ? deal.priceUsd : undefined,
          unit_price_usd:
            deal.priceUsd > 0 ? deal.priceUsd : undefined,

          quantite: 1,

          image: deal.image ?? undefined,

          prix_initial:
            deal.originalPriceCdf > deal.priceCdf
              ? deal.originalPriceCdf
              : undefined,

          remise: deal.discount > 0 ? deal.discount : undefined,

          stock: deal.stock ?? undefined,
          stock_disponible: deal.stock ?? undefined,

          delivery_config: deal.delivery_config ?? null,
          poids_kg: deal.poids_kg ?? null,

          logistics_group:
            deal.delivery_config?.logistics?.group ?? null,

          non_consolidable:
            deal.delivery_config?.non_consolidable ??
            deal.delivery_config?.modes?.domicile?.non_consolidable ??
            false,

          variante: null,
        } as any

        await addItem(payload, 1)

        addToast?.({
          type: 'success',
          message: `${deal.title} ajouté au panier.`,
        })
      } catch (err: any) {
        if (err?.code === 'AUTH_REQUIRED') {
          router.push(
            `/login?redirect=${encodeURIComponent(getCurrentPath('/deals'))}`
          )
          return
        }

        addToast?.({
          type: 'error',
          message:
            err?.message || 'Impossible d’ajouter ce produit au panier.',
        })
      }
    },
    [addItem, addToast, requireAuth, router]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  Reset filtres                                                */
  /* ───────────────────────────────────────────────────────────── */

  const clearFilters = useCallback(() => {
    setSearch('')
    setFilterCategorie('all')
    setFilterRemiseMin(0)
    setShowExpired(false)
  }, [])

  const hasActiveFilters =
    search.trim() !== '' ||
    filterCategorie !== 'all' ||
    filterRemiseMin > 0 ||
    showExpired

  /* ───────────────────────────────────────────────────────────── */
  /*  Rendu loading                                                */
  /* ───────────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <Section
        title="Offres Éclair Gercie"
        subtitle="Chargement des offres..."
        background="none"
        padding="section"
      >
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`deal-skeleton-${index}`}
              className="overflow-hidden rounded-2xl border border-border"
            >
              <Skeleton
                variant="rectangular"
                className="aspect-video w-full"
              />

              <div className="space-y-3 p-6">
                <Skeleton
                  variant="text"
                  className="h-6 w-3/4"
                />
                <Skeleton
                  variant="text"
                  className="h-4 w-full"
                />
                <Skeleton
                  variant="rectangular"
                  className="h-10 w-32 rounded-lg"
                />
              </div>
            </div>
          ))}
        </div>

        <span className="sr-only">Chargement des offres…</span>
      </Section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  Rendu erreur                                                 */
  /* ───────────────────────────────────────────────────────────── */

  if (isError) {
    return (
      <Section
        title="Offres Éclair Gercie"
        background="none"
        padding="section"
      >
        <div className="py-12 text-center">
          <AlertCircle
            size={48}
            className="mx-auto mb-4 text-red-500"
            aria-hidden="true"
          />

          <p className="text-muted-foreground">
            Impossible de charger les offres pour le moment.
          </p>

          <Button
            variant="outline-gold"
            onClick={() => refetch()}
            className="mt-4"
            leftIcon={<RotateCcw size={14} aria-hidden="true" />}
          >
            Réessayer
          </Button>
        </div>
      </Section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  Rendu principal                                              */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <Section
      title="Offres Éclair Gercie"
      subtitle="Découvrez nos meilleures opportunités sur l’ensemble de nos catalogues. Des prix compétitifs, une expérience premium."
      background="none"
      padding="section"
      size="default"
      animate="fade-in"
      actions={
        <Link
          href="/"
          className="text-sm font-medium text-amber-400 transition-colors hover:text-amber-300"
        >
          ← Retour à l’accueil
        </Link>
      }
    >
      {/* Avis conversion */}
      {rateLoading &&
        !safeRate &&
        processedDeals.some(
          (deal) => deal.priceUsd > 0 && deal.priceCdf <= 0
        ) && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            Conversion CDF en cours de chargement. Certains prix peuvent être
            temporairement indisponibles.
          </div>
        )}

      {/* Barre d’outils */}
      <div className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="relative w-full max-w-sm flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />

          <Input
            placeholder="Rechercher une offre..."
            value={search}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setSearch(event.target.value)
            }
            className="pl-10"
            allowClear
            onClear={() => setSearch('')}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.currentTarget.value)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-label="Trier les offres"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filterRemiseMin}
            onChange={(event) =>
              setFilterRemiseMin(Number(event.currentTarget.value))
            }
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-label="Filtrer par réduction"
          >
            {FILTER_REMISE_MIN.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {categories.length > 0 && (
            <select
              value={filterCategorie}
              onChange={(event) =>
                setFilterCategorie(event.currentTarget.value)
              }
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
              aria-label="Filtrer par catégorie"
            >
              <option value="all">Toutes catégories</option>

              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showExpired}
              onChange={(event) =>
                setShowExpired(Boolean(event.currentTarget.checked))
              }
              className="rounded focus:ring-2 focus:ring-amber-400"
            />
            Voir les offres expirées
          </label>

          <button
            type="button"
            onClick={() =>
              setViewMode((previous) =>
                previous === 'grid' ? 'list' : 'grid'
              )
            }
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-label={
              viewMode === 'grid'
                ? 'Passer en vue liste'
                : 'Passer en vue grille'
            }
          >
            {viewMode === 'grid' ? (
              <List size={16} aria-hidden="true" />
            ) : (
              <Grid size={16} aria-hidden="true" />
            )}
          </button>
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-red-500"
            leftIcon={<X size={14} aria-hidden="true" />}
          >
            Effacer filtres
          </Button>
        )}
      </div>

      {/* Résultats */}
      {filteredDeals.length === 0 ? (
        <div className="py-12 text-center">
          <Package
            size={48}
            className="mx-auto mb-4 text-muted-foreground"
            aria-hidden="true"
          />

          <p className="text-muted-foreground">
            {hasActiveFilters
              ? 'Aucune offre ne correspond à ces critères.'
              : 'Aucune offre éclair pour le moment. Revenez bientôt !'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <motion.div layout className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filteredDeals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                onAddToCart={handleAddToCart}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {filteredDeals.map((deal) => {
            const primaryText = deal.hasPrice
              ? formatDealAmount(deal.primaryAmount, deal.primaryCurrency)
              : 'Prix sur demande'

            const secondaryText =
              deal.hasPrice &&
              deal.secondaryAmount > 0 &&
              deal.secondaryAmount !== deal.primaryAmount
                ? `≈ ${formatDealAmount(
                    deal.secondaryAmount,
                    deal.secondaryCurrency
                  )}`
                : null

            const originalText =
              deal.originalPrimaryAmount > deal.primaryAmount &&
              deal.originalPrimaryAmount > 0
                ? formatDealAmount(
                    deal.originalPrimaryAmount,
                    deal.primaryCurrency
                  )
                : null

            return (
              <Card key={deal.id} variant="glass" className="overflow-hidden">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                    <Image
                      src={deal.image || PLACEHOLDER}
                      alt={deal.title}
                      width={96}
                      height={96}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-foreground">
                      {deal.title}
                    </h3>

                    <div className="mt-1 flex flex-wrap items-baseline gap-2">
                      <span className="text-xl font-bold text-amber-400">
                        {primaryText}
                      </span>

                      {secondaryText && (
                        <span className="text-xs text-muted-foreground">
                          {secondaryText}
                        </span>
                      )}

                      {originalText && (
                        <span className="text-xs text-muted-foreground line-through">
                          {originalText}
                        </span>
                      )}

                      {deal.discount > 0 && (
                        <Badge variant="accent" size="sm">
                          <Percent size={10} className="mr-1" aria-hidden="true" />
                          -{deal.discount}%
                        </Badge>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={12} aria-hidden="true" />
                      {deal.isExpired
                        ? 'Expiré'
                        : formatTimeLeft(deal.timeLeft)}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="luxe"
                      size="sm"
                      onClick={() => void handleAddToCart(deal)}
                      disabled={!deal.canAddToCart}
                      leftIcon={<ShoppingBag size={14} aria-hidden="true" />}
                    >
                      {deal.isExpired
                        ? 'Expiré'
                        : deal.stock === 0
                          ? 'Rupture'
                          : !deal.hasPrice
                            ? 'Sur demande'
                            : !deal.canAddToCart
                              ? 'Patientez…'
                              : 'Ajouter'}
                    </Button>

                    <Link href={`/produits/${deal.slug || deal.id}`}>
                      <Button variant="outline-gold" size="sm">
                        Voir
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </Section>
  )
}