// components/home/TrendingSection.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'

import { Container } from '@/components/layout/Container'
import InfiniteCarouselRow from '@/components/product/InfiniteCarouselRow'
import { Skeleton } from '@/components/ui/Skeleton'

import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'

import {
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

import { cn } from '@/lib/utils'

import {
  AlertTriangle,
  Flame,
  Gauge,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Données de base normalisées depuis l’API.
 *
 * IMPORTANT :
 * - On ne convertit pas encore le CDF ici.
 * - On conserve les sources de prix.
 * - Le CDF final est recalculé à l’affichage avec useExchangeRate().
 */
interface TrendingBaseProduct {
  id: string
  nom: string
  slug: string | null
  href: string

  images: string[]

  /**
   * USD = source principale quand disponible.
   */
  priceUsdSource: number | null
  priceCdfSource: number | null

  originalPriceUsdSource: number | null
  originalPriceCdfSource: number | null

  /**
   * Remise brute fournie par l’API, si présente.
   */
  rawDiscount: number

  categorie: string | null
  total_ventes: number
  note_moyenne: number | null
  stock: number | null

  score: number
  rank: number
  reasons: string[]
  recent_ventes_7j: number
  recent_ventes_14j: number
  tendance: number

  is_trending: boolean
  stock_faible: boolean
  rupture: boolean

  [key: string]: any
}

/**
 * Produit affiché, après application du taux courant.
 */
interface TrendingProduct extends TrendingBaseProduct {
  /**
   * Legacy / compatibilité Panier + ProductCard.
   */
  prix: number
  effective_price: number
  prix_usd: number
  prix_original?: number

  /**
   * Champs alignés USD principal.
   */
  priceUsd: number
  priceCdf: number

  originalPriceUsd: number
  originalPriceCdf: number

  discount: number
}

interface TrendingMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
  categories: string[]
  generated_at: string
  warning?: string
}

interface TrendingResult {
  products: TrendingBaseProduct[]
  meta: TrendingMeta
  usedFallback: boolean
}

type PillTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

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

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

  return Number.isFinite(n) ? n : null
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

function getCategorieLabel(value: unknown): string | null {
  if (typeof value === 'string') {
    return textOrNull(value)
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return (
      textOrNull(record.nom) ??
      textOrNull(record.name) ??
      textOrNull(record.label) ??
      textOrNull(record.title) ??
      null
    )
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

function makeHref(id: string, slug?: string | null): string {
  return `/produits/${slug || id}`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION BASE                                             */
/*  Ne dépend pas du taux : le CDF est recalculé à l’affichage.    */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeBaseProduct(
  raw: unknown,
  fallbackRank: number,
  isFallback = false
): TrendingBaseProduct | null {
  const data =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {}

  const id = textOrNull(data.id ?? data._id)
  const nom = textOrNull(data.nom ?? data.name)

  if (!id || !nom) return null

  const slug = textOrNull(data.slug)
  const href = textOrNull(data.href) ?? makeHref(id, slug)

  const images = normalizeImages(
    data.images ?? data.image ?? data.thumbnail ?? data.image_url
  )

  /* ---------------------------------------------------------- */
  /* Prix courant / promo                                         */
  /* ---------------------------------------------------------- */

  const currentUsd = positiveNumber(
    data.prix_usd ??
      data.price_usd ??
      data.unit_price_usd ??
      data.priceUsd
  )

  const currentCdf = positiveNumber(
    data.prix ??
      data.price ??
      data.prix_cdf ??
      data.price_cdf ??
      data.priceCdf
  )

  const promoUsd = positiveNumber(
    data.prix_promo_usd ??
      data.promo_price_usd ??
      data.discounted_price_usd
  )

  const promoCdf = positiveNumber(
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

  const explicitOriginalUsd = positiveNumber(
    data.prix_usd_original ??
      data.original_price_usd ??
      data.prix_initial_usd ??
      data.originalPriceUsd
  )

  const explicitOriginalCdf = positiveNumber(
    data.prix_original ??
      data.original_price ??
      data.prix_comparatif ??
      data.prix_initial ??
      data.originalPriceCdf
  )

  /**
   * Si l’API donne une promo mais pas de prix original explicite,
   * le prix de base devient le prix original.
   */
  const hasPromo = promoUsd != null || promoCdf != null

  const originalPriceUsdSource =
    explicitOriginalUsd ??
    (hasPromo ? currentUsd : null)

  const originalPriceCdfSource =
    explicitOriginalCdf ??
    (hasPromo ? currentCdf : null)

  /* ---------------------------------------------------------- */
  /* Remise brute                                                 */
  /* ---------------------------------------------------------- */

  const rawDiscount = clampPercent(
    data.discount ??
      data.remise_percent ??
      data.discount_percent
  )

  /* ---------------------------------------------------------- */
  /* Stock / tendances                                           */
  /* ---------------------------------------------------------- */

  const stock = nonNegativeNumber(data.stock)

  const rupture =
    Boolean(data.rupture) ||
    (stock !== null && stock <= 0) ||
    data.est_actif === false

  const stockFaible =
    Boolean(data.stock_faible) ||
    (stock !== null && stock > 0 && stock <= 5)

  const reasons = Array.isArray(data.reasons)
    ? data.reasons.map((reason) => String(reason)).filter(Boolean)
    : isFallback
      ? ['Populaire historiquement']
      : []

  const recent7 = toNum(data.recent_ventes_7j, 0)
  const recent14 = toNum(data.recent_ventes_14j, 0)

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

    priceUsdSource,
    priceCdfSource,

    originalPriceUsdSource,
    originalPriceCdfSource,

    rawDiscount,

    categorie:
      getCategorieLabel(data.categorie) ??
      getCategorieLabel(data.category),

    total_ventes: toNum(data.total_ventes ?? data.ventes, 0),

    note_moyenne: nullableNumber(
      data.note_moyenne ?? data.rating ?? data.average_rating
    ),

    stock,

    score,
    rank,
    reasons,

    recent_ventes_7j: recent7,
    recent_ventes_14j: recent14,

    tendance: toNum(data.tendance, 0),

    is_trending:
      Boolean(data.is_trending) ||
      (!isFallback && (recent7 > 0 || recent14 > 0)),

    stock_faible: stockFaible,
    rupture,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  APPLICATION DU TAUX USD → CDF À L’AFFICHAGE                    */
/* ═══════════════════════════════════════════════════════════════ */

function applyExchangeRateToTrendingProduct(
  base: TrendingBaseProduct,
  rate: number | null
): TrendingProduct {
  const r = positiveNumber(rate)

  /* ---------------------------------------------------------- */
  /* Prix courant                                                 */
  /* ---------------------------------------------------------- */

  let currentUsd = positiveNumber(base.priceUsdSource) ?? 0
  let currentCdf = positiveNumber(base.priceCdfSource) ?? 0

  /**
   * Si seulement un CDF legacy existe, on dérive un USD temporaire.
   */
  if (currentUsd <= 0 && currentCdf > 0 && r != null) {
    currentUsd = toUsd(currentCdf, r)
  }

  /**
   * USD = source principale.
   * Si USD existe et que le taux est disponible, le CDF est recalculé.
   */
  if (currentUsd > 0 && r != null) {
    currentCdf = toCdf(currentUsd, r)
  }

  /* ---------------------------------------------------------- */
  /* Prix original                                                */
  /* ---------------------------------------------------------- */

  let originalUsd = positiveNumber(base.originalPriceUsdSource) ?? 0
  let originalCdf = positiveNumber(base.originalPriceCdfSource) ?? 0

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

  if (originalUsd > 0 && currentUsd > 0 && originalUsd > currentUsd) {
    discount = Math.round((1 - currentUsd / originalUsd) * 100)
  } else if (
    originalCdf > 0 &&
    currentCdf > 0 &&
    originalCdf > currentCdf
  ) {
    discount = Math.round((1 - currentCdf / originalCdf) * 100)
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
      if (originalUsd <= 0 && currentUsd > 0) {
        originalUsd = roundUsd(currentUsd / divisor)
      }

      if (originalCdf <= 0 && currentCdf > 0) {
        originalCdf =
          r != null && originalUsd > 0
            ? toCdf(originalUsd, r)
            : roundCdf(currentCdf / divisor)
      }
    }
  }

  /* ---------------------------------------------------------- */
  /* Cohérence finale                                             */
  /* ---------------------------------------------------------- */

  if (currentUsd > 0 && r != null) {
    currentCdf = toCdf(currentUsd, r)
  }

  if (originalUsd > 0 && r != null) {
    originalCdf = toCdf(originalUsd, r)
  }

  if (originalUsd > 0 && originalUsd < currentUsd) {
    originalUsd = currentUsd
  }

  if (originalCdf > 0 && originalCdf < currentCdf) {
    originalCdf = currentCdf
  }

  return {
    ...base,

    /**
     * Legacy : prix CDF courant.
     */
    prix: roundCdf(currentCdf),
    effective_price: roundCdf(currentCdf),

    /**
     * USD = source principale.
     */
    prix_usd: roundUsd(currentUsd),

    priceUsd: roundUsd(currentUsd),
    priceCdf: roundCdf(currentCdf),

    originalPriceUsd: roundUsd(originalUsd),
    originalPriceCdf: roundCdf(originalCdf),

    prix_original:
      originalCdf > 0 ? roundCdf(originalCdf) : undefined,

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
): TrendingMeta {
  const data =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {}

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
    warning: textOrNull(data.warning) || undefined,
  }
}

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

async function fetchTrendingProducts(
  signal?: AbortSignal
): Promise<TrendingResult> {
  const params = new URLSearchParams()

  params.set('limit', '20')
  params.set('page', '1')
  params.set('window_days', '14')
  params.set('include_out_of_stock', 'false')
  params.set('candidate_limit', '300')

  /* ───────────────────────────────────────────────────────────── */
  /*  1. API intelligente des tendances                            */
  /* ───────────────────────────────────────────────────────────── */

  try {
    const response = await fetch(
      `/api/produits/tendances?${params.toString()}`,
      {
        signal,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      }
    )

    if (response.ok) {
      const parsed = await response.json().catch(() => null)
      const rawProducts = extractProductsArray(parsed)

      const products = rawProducts
        .map((product, index) =>
          normalizeBaseProduct(product, index + 1, false)
        )
        .filter((product): product is TrendingBaseProduct => Boolean(product))

      if (products.length > 0) {
        const payload =
          parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : {}

        return {
          products,
          meta: normalizeMeta(payload.meta, 1, 20, products.length),
          usedFallback: false,
        }
      }
    }
  } catch {
    /* fallback silencieux vers l’API historique */
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  2. Fallback historique                                       */
  /* ───────────────────────────────────────────────────────────── */

  const legacyResponse = await fetch(
    '/api/produits?sort_by=total_ventes&sort_order=desc&limit=20&est_actif=true',
    {
      signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    }
  )

  if (!legacyResponse.ok) {
    throw new Error('Impossible de charger les tendances.')
  }

  const legacyParsed = await legacyResponse.json().catch(() => null)
  const legacyRaw = extractProductsArray(legacyParsed)

  const products = legacyRaw
    .map((product, index) =>
      normalizeBaseProduct(product, index + 1, true)
    )
    .filter((product): product is TrendingBaseProduct => Boolean(product))

  if (products.length === 0) {
    throw new Error('Aucune tendance disponible.')
  }

  return {
    products,
    meta: {
      page: 1,
      limit: 20,
      total: products.length,
      totalPages: 1,
      hasMore: false,
      categories: [],
      generated_at: new Date().toISOString(),
      warning:
        'Aucune vente récente détectée — affichage des produits les plus vendus.',
    },
    usedFallback: true,
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
}: {
  tone?: PillTone
  icon?: ReactNode
  children?: ReactNode
  className?: string
}) {
  if (children === null || children === undefined || children === '') {
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1',
        'text-[10px] font-bold leading-none shadow-sm',
        pillTones[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}

function TrendingStatusPill({
  usedFallback,
  averageScore,
}: {
  usedFallback: boolean
  averageScore: number | null
}) {
  if (usedFallback) {
    return (
      <Pill tone="warning" icon={<TrendingUp size={12} aria-hidden="true" />}>
        Base historique
      </Pill>
    )
  }

  return (
    <Pill tone="success" icon={<Gauge size={12} aria-hidden="true" />}>
      {`Temps réel${averageScore !== null ? ` • score ${averageScore}` : ''}`}
    </Pill>
  )
}

function SectionActionButton({
  onClick,
  loading,
  label,
  icon,
}: {
  onClick: () => void
  loading?: boolean
  label: string
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 rounded-pill',
        'border border-line bg-surface px-3.5',
        'text-xs font-semibold text-fg shadow-card',
        'transition-colors duration-200',
        'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:pointer-events-none disabled:opacity-60'
      )}
    >
      {loading ? (
        <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}

      <span>{loading ? 'Actualisation…' : label}</span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export default function TrendingSection() {
  const { prefersReducedMotion } = useAccessibilityPreferences()
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

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<TrendingResult>({
    queryKey: ['trending-section-intelligent-v2'],
    queryFn: ({ signal }) => fetchTrendingProducts(signal),
    staleTime: 120_000,
    retry: 1,
  })

  const baseProducts = useMemo(
    () => data?.products ?? [],
    [data?.products]
  )

  /**
   * Produits affichés avec taux courant.
   *
   * IMPORTANT :
   * - USD reste la source principale.
   * - CDF est recalculé à chaque rendu.
   * - InfiniteCarouselRow / ProductCard reçoivent des champs cohérents.
   */
  const products = useMemo<TrendingProduct[]>(
    () =>
      baseProducts.map((product) =>
        applyExchangeRateToTrendingProduct(product, safeRate)
      ),
    [baseProducts, safeRate]
  )

  const averageScore = useMemo(() => {
    if (!data || data.usedFallback) return null

    const scored = baseProducts.filter((product) => product.score > 0)

    if (scored.length === 0) return null

    const sum = scored.reduce((acc, product) => acc + product.score, 0)

    return Math.round(sum / scored.length)
  }, [baseProducts, data])

  const handleRefresh = useCallback(() => {
    void refetch()
  }, [refetch])

  const shouldShowLoading = isLoading && products.length === 0
  const shouldShowError = isError && products.length === 0
  const shouldShowEmpty =
    !isLoading && !isError && products.length === 0

  return (
    <section
      className="relative isolate overflow-hidden bg-canvas py-14 sm:py-16 md:py-20"
      aria-labelledby="trending-section-heading"
    >
      {/* Décor premium discret */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-accent/[0.05] via-transparent to-transparent"
        aria-hidden="true"
      />

      <Container>
        {/* ====================================================
            HEADER
           ==================================================== */}
        <motion.div
          initial={
            prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 18 }
          }
          whileInView={
            prefersReducedMotion ? undefined : { opacity: 1, y: 0 }
          }
          viewport={{ once: true, margin: '-60px' }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.45,
            ease: 'easeOut',
          }}
          className="relative mb-8 sm:mb-10"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    'border border-accent/20 bg-accent-soft text-accent shadow-card'
                  )}
                  aria-hidden="true"
                >
                  <Flame size={20} strokeWidth={2} />
                </span>

                <h2
                  id="trending-section-heading"
                  className="text-balance text-xl font-bold tracking-tight text-fg sm:text-2xl md:text-3xl"
                >
                  Tendances du moment
                </h2>

                {data ? (
                  <TrendingStatusPill
                    usedFallback={data.usedFallback}
                    averageScore={averageScore}
                  />
                ) : null}
              </div>

              <p className="max-w-2xl text-sm leading-relaxed text-fg-muted sm:text-base">
                Produits les plus dynamiques en ce moment, calculés à partir
                des ventes récentes, de la tendance, des notes et des
                promotions.
              </p>

              {data?.meta.warning ? (
                <p className="mt-2 text-xs font-medium text-warning">
                  {data.meta.warning}
                </p>
              ) : null}
            </div>

            <SectionActionButton
              onClick={handleRefresh}
              loading={isFetching}
              label="Actualiser"
              icon={<RefreshCw size={14} aria-hidden="true" />}
            />
          </div>
        </motion.div>

        {/* ====================================================
            LOADING
           ==================================================== */}
        {shouldShowLoading ? (
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
            role="status"
            aria-label="Chargement des tendances"
          >
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`trending-skeleton-${index}`}
                className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card"
              >
                <Skeleton
                  variant="rectangular"
                  className="aspect-square w-full rounded-control"
                />

                <Skeleton
                  variant="text"
                  className="h-4 w-3/4 rounded-full"
                />

                <Skeleton
                  variant="text"
                  className="h-3 w-1/2 rounded-full"
                />
              </div>
            ))}

            <span className="sr-only">Chargement des tendances…</span>
          </div>
        ) : null}

        {/* ====================================================
            ERROR
           ==================================================== */}
        {shouldShowError ? (
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
              {error instanceof Error
                ? error.message
                : 'Impossible de charger les tendances.'}
            </p>

            <p className="max-w-sm text-xs text-fg-muted">
              Une erreur est survenue lors de la récupération des produits
              tendance.
            </p>

            <SectionActionButton
              onClick={handleRefresh}
              loading={isFetching}
              label="Réessayer"
              icon={<RefreshCw size={14} aria-hidden="true" />}
            />
          </div>
        ) : null}

        {/* ====================================================
            EMPTY
           ==================================================== */}
        {shouldShowEmpty ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-muted/40 px-6 py-14 text-center"
            role="status"
          >
            <Flame
              size={32}
              className="text-fg-subtle"
              aria-hidden="true"
            />

            <p className="text-sm font-medium text-fg-muted">
              Aucune tendance pour le moment.
            </p>
          </div>
        ) : null}

        {/* ====================================================
            PRODUCTS CAROUSEL
           ==================================================== */}
        {!shouldShowLoading &&
          !shouldShowError &&
          !shouldShowEmpty &&
          products.length > 0 ? (
          <InfiniteCarouselRow
            products={products as any}
            visibleItems={5}
            autoPlayInterval={false}
            compact={false}
          />
        ) : null}
      </Container>
    </section>
  )
}