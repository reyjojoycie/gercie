// app/nouveautes/page.tsx
'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
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
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { ProductBadges } from '@/components/badges/ProductBadges'

import { cn } from '@/lib/utils'

import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  Grid,
  Heart,
  List,
  Loader2,
  Package,
  RefreshCcw,
  RotateCcw,
  Search,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'
type ViewMode = 'grid' | 'list'
type SortValue = 'created_at' | 'prix_asc' | 'prix_desc' | 'popularite'

/**
 * Données de base normalisées depuis l’API.
 *
 * IMPORTANT :
 * - On ne fige pas le CDF.
 * - On conserve les sources de prix.
 * - Le CDF final est recalculé à l’affichage avec useExchangeRate().
 */
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
  created_at?: string | null
  est_actif: boolean
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
  logistics_group?: string | null
  non_consolidable?: boolean

  [key: string]: any
}

/**
 * Produit affiché, après application du taux courant.
 */
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

  isNew: boolean
  ageDays: number | null
  freshnessLabel: string
}

interface FetchResult {
  products: BaseProduct[]
  total: number
  totalPages: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const SEUIL_NOUVEAUTE_JOURS = 14
const PAGE_SIZE = 12
const PLACEHOLDER = '/placeholder.jpg'

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'created_at', label: 'Plus récent' },
  { value: 'prix_asc', label: 'Prix croissant' },
  { value: 'prix_desc', label: 'Prix décroissant' },
  { value: 'popularite', label: 'Popularité' },
]

const CATEGORIES_FILTER = [
  'all',
  'Électronique',
  'Audio',
  'Logiciel',
  'Mode',
  'Maison',
  'Sport',
  'Jouets',
  'Livres',
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

function formatFreshnessLabel(ageDays: number | null): string {
  if (ageDays === null) return 'récemment ajouté'
  if (ageDays < 1) return "aujourd'hui"
  if (ageDays < 2) return 'hier'
  if (ageDays < 7) return `il y a ${Math.floor(ageDays)} j`
  return `il y a ${Math.floor(ageDays / 7)} sem.`
}

function getCurrentPath(fallback = '/nouveautes'): string {
  if (typeof window === 'undefined') return fallback

  const path = `${window.location.pathname}${window.location.search}`

  if (path.startsWith('/login')) return '/'

  return path
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
  /* Stock / activité / métadonnées                               */
  /* ---------------------------------------------------------- */

  const stock = nonNegativeNumber(data.stock)
  const estActif =
    data.est_actif === undefined
      ? true
      : Boolean(data.est_actif)

  const delivery_config =
    data.delivery_config ??
    data.livraison_config ??
    null

  const poids_kg = nonNegativeNumber(
    data.poids_kg ?? data.weight_kg
  )

  const logistics_group = textOrNull(
    data.logistics_group ??
      delivery_config?.logistics?.group ??
      null
  )

  const non_consolidable = Boolean(
    data.non_consolidable ??
      delivery_config?.non_consolidable ??
      delivery_config?.modes?.domicile?.non_consolidable ??
      false
  )

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

    created_at:
      textOrNull(data.created_at ?? data.createdAt) ?? undefined,

    est_actif: estActif,

    total_ventes: toNum(data.total_ventes ?? data.ventes ?? data.sales, 0),

    priceUsdSource,
    priceCdfSource,

    originalUsdSource,
    originalCdfSource,

    rawDiscount,

    delivery_config,
    poids_kg,
    logistics_group,
    non_consolidable,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  APPLICATION DU TAUX USD → CDF À L’AFFICHAGE                    */
/* ═══════════════════════════════════════════════════════════════ */

function applyExchangeRateToProduct(
  base: BaseProduct,
  rate: number | null,
  now: number | null
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
    base.stock !== 0 &&
    base.est_actif

  /* ---------------------------------------------------------- */
  /* Fraîcheur                                                    */
  /* ---------------------------------------------------------- */

  let ageDays: number | null = null

  if (base.created_at && now) {
    const created = new Date(base.created_at).getTime()

    if (!Number.isNaN(created)) {
      ageDays = (now - created) / 86_400_000
    }
  }

  const isNew = ageDays !== null && ageDays < SEUIL_NOUVEAUTE_JOURS

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

    isNew,
    ageDays,
    freshnessLabel: formatFreshnessLabel(ageDays),
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

async function fetchNouveautesPage(
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
        : 'Impossible de charger les nouveautés.'
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
      Math.ceil(total / Math.max(1, PAGE_SIZE))
    )
  )

  return {
    products,
    total,
    totalPages,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT CARD                                                   */
/* ═══════════════════════════════════════════════════════════════ */

interface NouveauteCardProps {
  product: NormalizedProduct
  index: number
  isAdding: boolean
  hasImageError: boolean
  onImageError: (productId: string) => void
  onAddToCart: (product: NormalizedProduct) => Promise<void> | void
}

function NouveauteCard({
  product,
  index,
  isAdding,
  hasImageError,
  onImageError,
  onAddToCart,
}: NouveauteCardProps) {
  const toast = useToast() as any
  const addToast = toast?.addToast

  const { isFavorite, toggleFavorite } = useFavorites(product.id)

  const [copied, setCopied] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  const image = product.images[0]

  const isOutOfStock = product.stock === 0 || !product.est_actif
  const isLowStock =
    product.stock !== null && product.stock > 0 && product.stock <= 5

  const primaryText = product.hasPrice
    ? formatProductAmount(product.primaryAmount, product.primaryCurrency)
    : 'Prix sur demande'

  const secondaryText =
    product.hasPrice &&
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

  const copyLink = useCallback(async () => {
    if (typeof window === 'undefined') return

    const url = `${window.location.origin}${product.href}`

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      addToast?.({ type: 'success', message: 'Lien copié !' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      addToast?.({ type: 'error', message: 'Impossible de copier le lien.' })
    }
  }, [addToast, product.href])

  const shareProduct = useCallback(async () => {
    const url = `${window.location.origin}${product.href}`

    const priceText = product.hasPrice
      ? formatProductAmount(product.primaryAmount, product.primaryCurrency)
      : 'sur demande'

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: product.nom,
          text: `Nouveauté Gercie : ${product.nom} à ${priceText}`,
          url,
        })
      } else {
        await copyLink()
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Erreur partage nouveauté:', err)
      }
    }
  }, [copyLink, product.hasPrice, product.nom, product.primaryAmount, product.primaryCurrency, product.href])

  const handleAdd = useCallback(async () => {
    await onAddToCart(product)
  }, [onAddToCart, product])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.25) }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300',
        'hover:border-gold-400/50 hover:shadow-lg hover:shadow-gold-400/5',
        isOutOfStock && 'opacity-70'
      )}
    >
      {/* Badges en haut */}
      <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
        {product.isNew && (
          <Badge variant="gold" size="sm" className="flex items-center gap-1">
            <Sparkles size={12} aria-hidden="true" />
            Nouveau
          </Badge>
        )}

        {product.badges.slice(0, 2).map((badge) => (
          <ProductBadges key={badge} badgeIds={[badge]} size="sm" />
        ))}

        {product.discount > 0 && (
          <Badge variant="danger" size="sm">
            -{product.discount}%
          </Badge>
        )}

        {isOutOfStock && (
          <Badge variant="danger" size="sm">
            Rupture
          </Badge>
        )}

        {isLowStock && !isOutOfStock && (
          <Badge variant="neutral" size="sm">
            Stock faible
          </Badge>
        )}
      </div>

      {/* Actions en haut à droite */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Tooltip
          content={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              void toggleFavorite?.()
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 dark:bg-black/50 dark:hover:bg-red-900/30"
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
        </Tooltip>

        <Tooltip content="Partager">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              void shareProduct()
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-black/50 dark:hover:bg-blue-900/30"
            aria-label={`Partager ${product.nom}`}
          >
            {copied ? (
              <Check size={16} className="text-green-500" aria-hidden="true" />
            ) : (
              <Share2 size={16} className="text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </Tooltip>
      </div>

      {/* Image */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {!imageLoaded && image && !hasImageError && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <Spinner size="sm" />
          </div>
        )}

        {image && !hasImageError ? (
          <Image
            src={image}
            alt={product.nom}
            width={400}
            height={400}
            className={cn(
              'h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-110',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setImageLoaded(true)}
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

        <Link
          href={product.href}
          className="absolute inset-0"
          aria-label={product.nom}
        />
      </div>

      {/* Contenu */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <Badge
            variant="neutral"
            size="sm"
            className="max-w-[120px] truncate text-xs"
          >
            {product.categorie || 'Non classé'}
          </Badge>

          {product.rating != null && product.rating > 0 && (
            <div className="ml-auto flex items-center gap-0.5 text-amber-500">
              <Star size={14} className="fill-current" aria-hidden="true" />
              <span className="text-xs font-medium">
                {product.rating.toFixed(1)}
              </span>
              {product.reviews_count != null && product.reviews_count > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({product.reviews_count})
                </span>
              )}
            </div>
          )}
        </div>

        <Link
          href={product.href}
          className="line-clamp-2 text-sm font-semibold leading-tight text-foreground transition-colors group-hover:text-gold-500"
        >
          {product.nom}
        </Link>

        {product.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {product.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-gold-600">
              {primaryText}
            </p>

            {secondaryText && (
              <p className="truncate text-xs text-muted-foreground">
                {secondaryText}
              </p>
            )}

            {originalText && (
              <p className="truncate text-xs text-muted-foreground line-through">
                {originalText}
              </p>
            )}

            {product.savingsPrimary > 0 && (
              <p className="mt-1 text-xs font-semibold text-emerald-500">
                Économisez{' '}
                {formatProductAmount(
                  product.savingsPrimary,
                  product.primaryCurrency
                )}
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
                disabled={!product.canAddToCart || isAdding}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gold-400/10 text-gold-400 transition hover:bg-gold-400/20 focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Ajouter ${product.nom} au panier`}
              >
                {isAdding ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ShoppingBag size={18} aria-hidden="true" />
                )}
              </button>
            </Tooltip>

            <Tooltip content="Voir la fiche produit">
              <Link
                href={product.href}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-gold-400/10 focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label={`Voir ${product.nom}`}
              >
                <Eye size={18} className="text-muted-foreground" aria-hidden="true" />
              </Link>
            </Tooltip>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock size={12} aria-hidden="true" />
          <span>{product.freshnessLabel}</span>

          {product.total_ventes > 0 && (
            <span className="ml-auto flex items-center gap-1 text-emerald-400">
              <TrendingUp size={12} aria-hidden="true" />
              {formatVentes(product.total_ventes)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT ROW                                                    */
/* ═══════════════════════════════════════════════════════════════ */

interface NouveauteRowProps {
  product: NormalizedProduct
  isAdding: boolean
  hasImageError: boolean
  onImageError: (productId: string) => void
  onAddToCart: (product: NormalizedProduct) => Promise<void> | void
}

function NouveauteRow({
  product,
  isAdding,
  hasImageError,
  onImageError,
  onAddToCart,
}: NouveauteRowProps) {
  const { isFavorite, toggleFavorite } = useFavorites(product.id)

  const image = product.images[0]

  const isOutOfStock = product.stock === 0 || !product.est_actif
  const isLowStock =
    product.stock !== null && product.stock > 0 && product.stock <= 5

  const primaryText = product.hasPrice
    ? formatProductAmount(product.primaryAmount, product.primaryCurrency)
    : 'Prix sur demande'

  const secondaryText =
    product.hasPrice &&
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition hover:border-gold-400/50',
        isOutOfStock && 'opacity-70'
      )}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
        {image && !hasImageError ? (
          <Image
            src={image}
            alt={product.nom}
            width={80}
            height={80}
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

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={product.href}
            className="line-clamp-1 font-semibold text-foreground transition hover:text-gold-600"
          >
            {product.nom}
          </Link>

          {product.isNew && (
            <Badge variant="gold" size="sm">
              Nouveau
            </Badge>
          )}

          {product.discount > 0 && (
            <Badge variant="danger" size="sm">
              -{product.discount}%
            </Badge>
          )}

          {isOutOfStock && (
            <Badge variant="danger" size="sm">
              Rupture
            </Badge>
          )}

          {isLowStock && !isOutOfStock && (
            <Badge variant="neutral" size="sm">
              Stock faible
            </Badge>
          )}
        </div>

        {product.description && (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
            {product.description}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {product.categorie && (
            <Badge variant="neutral" size="sm">
              {product.categorie}
            </Badge>
          )}

          <span className="flex items-center gap-1">
            <Clock size={12} aria-hidden="true" />
            {product.freshnessLabel}
          </span>

          {product.total_ventes > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <TrendingUp size={12} aria-hidden="true" />
              {formatVentes(product.total_ventes)} ventes
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-lg font-bold text-gold-600">{primaryText}</p>

        {secondaryText && (
          <p className="text-xs text-muted-foreground">{secondaryText}</p>
        )}

        {originalText && (
          <p className="text-xs text-muted-foreground line-through">
            {originalText}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-1">
        <Tooltip
          content={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
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
        </Tooltip>

        <Tooltip content="Ajouter au panier">
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
        </Tooltip>

        <Tooltip content="Voir détails">
          <Link
            href={product.href}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-gold-400/10 focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label={`Voir détails de ${product.nom}`}
          >
            <ExternalLink size={16} className="text-muted-foreground" aria-hidden="true" />
          </Link>
        </Tooltip>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SKELETON                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function NouveautesFallback() {
  return (
    <div className="min-h-screen bg-background">
      <Container className="py-8">
        <div className="mb-8 space-y-3">
          <Skeleton variant="text" className="h-8 w-64 rounded-full" />
          <Skeleton variant="text" className="h-4 w-96 rounded-full" />
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`nouveautes-fallback-${index}`}
              className="overflow-hidden rounded-2xl border border-border"
            >
              <Skeleton
                variant="rectangular"
                className="aspect-square w-full"
              />

              <div className="space-y-2 p-4">
                <Skeleton variant="text" className="h-5 w-3/4 rounded-full" />
                <Skeleton variant="text" className="h-4 w-full rounded-full" />
                <Skeleton
                  variant="rectangular"
                  className="h-10 w-24 rounded-lg"
                />
              </div>
            </div>
          ))}
        </div>

        <span className="sr-only">Chargement des nouveautés…</span>
      </Container>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN CONTENT                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function NouveautesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { user, loading: authLoading } = useAuth()
  const cart = useCart() as any
  const addItem = cart?.addItem

  const toast = useToast() as any
  const addToast = toast?.addToast

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

  const initialSearch = searchParams.get('search') || ''
  const initialCategorieParam = searchParams.get('categorie') || 'all'
  const initialSortParam = searchParams.get('sort')
  const initialPageParam = Number(searchParams.get('page') || '1')

  const [search, setSearch] = useState(initialSearch)
  const [filterCategorie, setFilterCategorie] = useState(
    CATEGORIES_FILTER.includes(initialCategorieParam)
      ? initialCategorieParam
      : 'all'
  )
  const [sortBy, setSortBy] = useState<SortValue>(
    SORT_OPTIONS.some((option) => option.value === initialSortParam)
      ? (initialSortParam as SortValue)
      : 'created_at'
  )
  const [page, setPage] = useState(
    Number.isFinite(initialPageParam) && initialPageParam > 0
      ? Math.floor(initialPageParam)
      : 1
  )
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [addingId, setAddingId] = useState<string | null>(null)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())

  const [now, setNow] = useState<number | null>(null)

  const trimmedSearch = search.trim()

  /* ───────────────────────────────────────────────────────────── */
  /*  Horloge client pour fraîcheur                                */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setNow(Date.now())

    const interval = setInterval(() => setNow(Date.now()), 60_000)

    return () => clearInterval(interval)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  Synchronisation URL                                          */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!mounted) return

    const params = new URLSearchParams()

    if (trimmedSearch) params.set('search', trimmedSearch)
    if (filterCategorie !== 'all') params.set('categorie', filterCategorie)
    if (sortBy !== 'created_at') params.set('sort', sortBy)
    if (page > 1) params.set('page', String(page))

    const queryString = params.toString()

    router.replace(
      queryString ? `/nouveautes?${queryString}` : '/nouveautes',
      { scroll: false }
    )
  }, [filterCategorie, mounted, page, router, sortBy, trimmedSearch])

  /* ───────────────────────────────────────────────────────────── */
  /*  Requête API                                                  */
  /* ───────────────────────────────────────────────────────────── */

  const queryString = useMemo(() => {
    const params = new URLSearchParams()

    params.set('limit', String(PAGE_SIZE))
    params.set('page', String(page))
    params.set('recent', String(SEUIL_NOUVEAUTE_JOURS))
    params.set('est_actif', 'true')

    const apiSort =
      sortBy === 'popularite'
        ? 'total_ventes'
        : sortBy === 'prix_asc' || sortBy === 'prix_desc'
          ? 'prix'
          : 'created_at'

    const apiOrder = sortBy === 'prix_asc' ? 'asc' : 'desc'

    params.set('sort_by', apiSort)
    params.set('sort_order', apiOrder)

    if (trimmedSearch) params.set('search', trimmedSearch)
    if (filterCategorie !== 'all') params.set('categorie', filterCategorie)

    return params.toString()
  }, [filterCategorie, page, sortBy, trimmedSearch])

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<FetchResult>({
    queryKey: ['nouveautes-page-aligned', queryString],
    queryFn: ({ signal }) => fetchNouveautesPage(queryString, signal),
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
        applyExchangeRateToProduct(product, safeRate, now)
      ),
    [baseProducts, now, safeRate]
  )

  const totalProducts = data?.total ?? 0
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
        `/login?redirect=${encodeURIComponent(getCurrentPath('/nouveautes'))}`
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
      if (!product.est_actif || product.stock === 0) {
        addToast?.({
          type: 'warning',
          message: `${product.nom} est indisponible.`,
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

          logistics_group: product.logistics_group ?? null,
          non_consolidable: product.non_consolidable ?? false,

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
              getCurrentPath('/nouveautes')
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
      setFilterCategorie(event.target.value)
      setPage(1)
    },
    []
  )

  const handleSortChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setSortBy(event.target.value as SortValue)
      setPage(1)
    },
    []
  )

  const handleToggleView = useCallback(() => {
    setViewMode((previous) => (previous === 'grid' ? 'list' : 'grid'))
  }, [])

  const resetFilters = useCallback(() => {
    setSearch('')
    setFilterCategorie('all')
    setSortBy('created_at')
    setPage(1)
  }, [])

  const hasActiveFilters =
    trimmedSearch !== '' ||
    filterCategorie !== 'all' ||
    sortBy !== 'created_at'

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

      {/* En‑tête */}
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
                <Sparkles size={24} className="text-gold-500" aria-hidden="true" />
                Nouveautés
              </h1>

              <p className="text-xs text-muted-foreground">
                {totalProducts} produit{totalProducts > 1 ? 's' : ''} découvert
                {totalProducts > 1 ? 's' : ''} récemment
              </p>
            </div>
          </div>

          <Button
            variant="outline-gold"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            leftIcon={
              <RefreshCcw
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
        {/* Avis conversion */}
        {rateLoading &&
          !safeRate &&
          products.some(
            (product) => product.priceUsd > 0 && product.priceCdf <= 0
          ) && (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Conversion CDF en cours de chargement. Certains prix peuvent être
              temporairement indisponibles.
            </div>
          )}

        {/* Barre d'outils */}
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
              value={filterCategorie}
              onChange={handleCategoryChange}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label="Filtrer par catégorie"
            >
              <option value="all">Toutes catégories</option>

              {CATEGORIES_FILTER.filter((cat) => cat !== 'all').map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={handleSortChange}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label="Trier les nouveautés"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleToggleView}
              className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
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
              onClick={resetFilters}
              className="text-red-500"
              leftIcon={<X size={14} aria-hidden="true" />}
            >
              Effacer filtres
            </Button>
          )}
        </div>

        {/* Résultats */}
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`nouveautes-loading-${index}`}
                className="overflow-hidden rounded-2xl border border-border"
              >
                <Skeleton
                  variant="rectangular"
                  className="aspect-square w-full"
                />

                <div className="space-y-2 p-4">
                  <Skeleton variant="text" className="h-5 w-3/4 rounded-full" />
                  <Skeleton variant="text" className="h-4 w-full rounded-full" />
                  <Skeleton
                    variant="rectangular"
                    className="h-10 w-24 rounded-lg"
                  />
                </div>
              </div>
            ))}

            <span className="sr-only">Chargement des nouveautés…</span>
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
                : 'Impossible de charger les nouveautés.'}
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
            <Sparkles
              size={48}
              className="mx-auto mb-4 text-muted-foreground"
              aria-hidden="true"
            />

            <p className="text-muted-foreground">
              {hasActiveFilters
                ? 'Aucune nouveauté ne correspond à ces critères.'
                : 'Aucune nouveauté pour le moment. Revenez bientôt !'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <motion.div
            layout
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <AnimatePresence initial={false}>
              {products.map((product, index) => (
                <NouveauteCard
                  key={product.id}
                  product={product}
                  index={index}
                  isAdding={addingId === product.id}
                  hasImageError={imageErrors.has(product.id)}
                  onImageError={handleImageError}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {products.map((product) => (
                <NouveauteRow
                  key={product.id}
                  product={product}
                  isAdding={addingId === product.id}
                  hasImageError={imageErrors.has(product.id)}
                  onImageError={handleImageError}
                  onAddToCart={handleAddToCart}
                />
              ))}
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

export default function NouveautesPage() {
  return (
    <Suspense fallback={<NouveautesFallback />}>
      <NouveautesContent />
    </Suspense>
  )
}