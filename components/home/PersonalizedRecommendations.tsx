// components/home/PersonalizedRecommendations.tsx
'use client'

import {
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'

import { Container } from '@/components/layout/Container'
import InfiniteCarouselRow from '@/components/product/InfiniteCarouselRow'
import { Skeleton } from '@/components/ui/Skeleton'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

import { cn } from '@/lib/utils'

import {
  AlertTriangle,
  Compass,
  Gauge,
  LogIn,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface RecommendedProduct {
  id: string
  nom: string
  slug?: string | null
  prix: number
  prix_promo?: number | null
  effective_price: number
  images: string[]
  categorie?: string | null
  total_ventes: number
  note_moyenne?: number | null
  stock?: number | null
  score: number
  rank: number
  reasons: string[]
  discount: number
  is_trending?: boolean
  stock_faible?: boolean
  rupture?: boolean
}

interface PersonalizationMeta {
  has_history: boolean
  cold_start: boolean
  purchase_count: number
  favorite_count: number
  view_count: number
  include_purchased: boolean
  freshness_days: number
  average_price?: number | null
  top_categories?: string[]
  top_vendors?: string[]
}

interface RecommendationsMeta {
  limit: number
  total: number
  generated_at: string
  algorithm: string
  personalization: PersonalizationMeta
  warning?: string
}

interface RecommendationsResult {
  products: RecommendedProduct[]
  meta: RecommendationsMeta | null
  source: 'personalized' | 'trending-fallback' | 'empty'
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

function notify(
  toast: any,
  type: 'success' | 'error' | 'info' | 'warning',
  message: string
): void {
  if (typeof toast?.addToast === 'function') {
    toast.addToast({ type, message })
    return
  }

  if (typeof toast?.show === 'function') {
    toast.show({ type, message })
  }
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatPrice(value: number | null | undefined): string {
  const n = Number(value || 0)

  if (!Number.isFinite(n)) return '0 FC'

  return `${new Intl.NumberFormat('fr-FR').format(Math.round(n))} FC`
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

function normalizeProduct(
  raw: unknown,
  fallbackRank: number
): RecommendedProduct | null {
  const data =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {}

  const id = textOrNull(data.id ?? data._id)
  const nom = textOrNull(data.nom ?? data.name)

  if (!id || !nom) return null

  const prix = toNum(data.prix ?? data.price, 0)
  const prixPromo = toNullableNumber(data.prix_promo ?? data.promo_price)

  const effectivePrice =
    data.effective_price !== undefined && data.effective_price !== null
      ? toNum(data.effective_price, prix)
      : prixPromo !== null && prixPromo > 0 && prixPromo < prix
        ? prixPromo
        : prix

  const computedDiscount =
    prix > 0 && effectivePrice < prix
      ? Math.round(((prix - effectivePrice) / prix) * 100)
      : 0

  const rawDiscount = toNum(data.discount ?? data.remise_percent, 0)

  const discount = clamp(
    Math.round(computedDiscount || rawDiscount),
    0,
    100
  )

  const stock = toNullableNumber(data.stock)
  const rupture = Boolean(data.rupture) || (stock !== null && stock <= 0)
  const stockFaible =
    Boolean(data.stock_faible) ||
    (stock !== null && stock > 0 && stock <= 5)

  const reasons = Array.isArray(data.reasons)
    ? data.reasons.map((reason) => String(reason)).filter(Boolean)
    : []

  const rawScore = toNum(data.score, 0)
  const score =
    rawScore > 0 && rawScore <= 1
      ? Math.round(rawScore * 100)
      : Math.round(rawScore)

  return {
    id,
    nom,
    slug: textOrNull(data.slug),
    prix,
    prix_promo: prixPromo,
    effective_price: effectivePrice,
    images: normalizeImages(data.images ?? data.image ?? data.thumbnail),
    categorie: textOrNull(data.categorie ?? data.category),
    total_ventes: toNum(data.total_ventes ?? data.ventes, 0),
    note_moyenne: toNullableNumber(
      data.note_moyenne ?? data.rating ?? data.average_rating
    ),
    stock,
    score,
    rank: toNum(data.rank, fallbackRank),
    reasons,
    discount,
    is_trending: Boolean(data.is_trending),
    stock_faible: stockFaible,
    rupture,
  }
}

function normalizeMeta(raw: unknown): RecommendationsMeta | null {
  if (!raw || typeof raw !== 'object') return null

  const data = raw as Record<string, unknown>
  const personalization =
    data.personalization && typeof data.personalization === 'object'
      ? (data.personalization as Record<string, unknown>)
      : {}

  return {
    limit: toNum(data.limit, 20),
    total: toNum(data.total, 0),
    generated_at:
      textOrNull(data.generated_at) || new Date().toISOString(),
    algorithm: textOrNull(data.algorithm) || 'unknown',
    warning: textOrNull(data.warning) || undefined,
    personalization: {
      has_history: Boolean(personalization.has_history),
      cold_start:
        personalization.cold_start !== undefined
          ? Boolean(personalization.cold_start)
          : !Boolean(personalization.has_history),
      purchase_count: toNum(personalization.purchase_count, 0),
      favorite_count: toNum(personalization.favorite_count, 0),
      view_count: toNum(personalization.view_count, 0),
      include_purchased: Boolean(personalization.include_purchased),
      freshness_days: toNum(personalization.freshness_days, 30),
      average_price: toNullableNumber(personalization.average_price),
      top_categories: Array.isArray(personalization.top_categories)
        ? personalization.top_categories
            .map((item) => String(item).trim())
            .filter(Boolean)
        : [],
      top_vendors: Array.isArray(personalization.top_vendors)
        ? personalization.top_vendors
            .map((item) => String(item).trim())
            .filter(Boolean)
        : [],
    },
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

async function fetchPersonalizedRecommendations(
  signal?: AbortSignal
): Promise<RecommendationsResult> {
  /* ───────────────────────────────────────────────────────────── */
  /*  1. API personnalisée                                          */
  /* ───────────────────────────────────────────────────────────── */

  try {
    const params = new URLSearchParams()

    params.set('limit', '20')
    params.set('candidate_limit', '300')
    params.set('include_purchased', 'false')
    params.set('freshness_days', '30')

    const response = await fetch(
      `/api/produits/recommandations?${params.toString()}`,
      {
        signal,
        cache: 'no-store',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      }
    )

    if (response.ok) {
      const parsed = await response.json().catch(() => null)
      const rawProducts = extractProductsArray(parsed)

      const products = rawProducts
        .map((product, index) => normalizeProduct(product, index + 1))
        .filter((product): product is RecommendedProduct => Boolean(product))

      if (products.length > 0) {
        const payload =
          parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : {}

        return {
          products,
          meta: normalizeMeta(payload.meta),
          source: 'personalized',
        }
      }
    }
  } catch {
    /* fallback silencieux */
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  2. Fallback tendances                                         */
  /* ───────────────────────────────────────────────────────────── */

  try {
    const params = new URLSearchParams()

    params.set('limit', '20')
    params.set('window_days', '14')
    params.set('include_out_of_stock', 'false')
    params.set('candidate_limit', '300')

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
        .map((product, index) => normalizeProduct(product, index + 1))
        .filter((product): product is RecommendedProduct => Boolean(product))

      if (products.length > 0) {
        const payload =
          parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : {}

        const meta = normalizeMeta(payload.meta)

        return {
          products,
          meta: meta
            ? {
                ...meta,
                personalization: {
                  ...meta.personalization,
                  has_history: false,
                  cold_start: true,
                  purchase_count: 0,
                  favorite_count: 0,
                  view_count: 0,
                  include_purchased: false,
                  freshness_days: 30,
                },
                warning:
                  meta.warning ||
                  'Recommandations personnalisées indisponibles — affichage des tendances.',
              }
            : {
                limit: 20,
                total: products.length,
                generated_at: new Date().toISOString(),
                algorithm: 'trending-fallback',
                warning:
                  'Recommandations personnalisées indisponibles — affichage des tendances.',
                personalization: {
                  has_history: false,
                  cold_start: true,
                  purchase_count: 0,
                  favorite_count: 0,
                  view_count: 0,
                  include_purchased: false,
                  freshness_days: 30,
                },
              },
          source: 'trending-fallback',
        }
      }
    }
  } catch {
    /* fallback supplémentaire */
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  3. Dernier fallback meilleures ventes                        */
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
    throw new Error('Impossible de charger les recommandations.')
  }

  const legacyParsed = await legacyResponse.json().catch(() => null)
  const legacyRaw = extractProductsArray(legacyParsed)

  const products = legacyRaw
    .map((product, index) => normalizeProduct(product, index + 1))
    .filter((product): product is RecommendedProduct => Boolean(product))

  if (products.length === 0) {
    return {
      products: [],
      meta: null,
      source: 'empty',
    }
  }

  return {
    products,
    meta: {
      limit: 20,
      total: products.length,
      generated_at: new Date().toISOString(),
      algorithm: 'popular-fallback',
      warning:
        'Recommandations personnalisées indisponibles — affichage des produits les plus vendus.',
      personalization: {
        has_history: false,
        cold_start: true,
        purchase_count: 0,
        favorite_count: 0,
        view_count: 0,
        include_purchased: false,
        freshness_days: 30,
      },
    },
    source: 'trending-fallback',
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

function RecommendationStatusPill({
  source,
  meta,
}: {
  source: RecommendationsResult['source']
  meta: RecommendationsMeta | null
}) {
  if (source === 'personalized' && meta?.personalization.has_history) {
    return (
      <Pill tone="accent" icon={<Target size={12} aria-hidden="true" />}>
        Personnalisé
      </Pill>
    )
  }

  if (source === 'personalized') {
    return (
      <Pill tone="info" icon={<Compass size={12} aria-hidden="true" />}>
        Découverte
      </Pill>
    )
  }

  return (
    <Pill tone="warning" icon={<TrendingUp size={12} aria-hidden="true" />}>
      Tendances
    </Pill>
  )
}

function AveragePricePill({
  averagePrice,
}: {
  averagePrice: number | null | undefined
}) {
  if (!averagePrice || averagePrice <= 0) return null

  return (
    <Pill tone="neutral" icon={<Gauge size={12} aria-hidden="true" />}>
      Budget ~ {formatPrice(averagePrice)}
    </Pill>
  )
}

function ActionButton({
  onClick,
  loading = false,
  label,
  icon,
  variant = 'secondary',
  className,
}: {
  onClick: () => void
  loading?: boolean
  label: string
  icon?: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  className?: string
}) {
  const baseClasses =
    'inline-flex h-9 items-center justify-center gap-2 rounded-pill px-3.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-60'

  const variantClasses =
    variant === 'primary'
      ? 'bg-accent text-accent-contrast shadow-card hover:bg-accent-hover'
      : variant === 'ghost'
        ? 'text-fg-muted hover:bg-muted hover:text-fg'
        : 'border border-line bg-surface text-fg shadow-card hover:border-accent/30 hover:bg-accent-soft hover:text-accent'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(baseClasses, variantClasses, className)}
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

export default function PersonalizedRecommendations() {
  const pathname = usePathname() ?? '/'
  const { prefersReducedMotion } = useAccessibilityPreferences()

  const auth = useAuth() as any
  const user = auth?.user ?? null
  const authLoading = Boolean(auth?.loading)

  const cart = useCart() as any
  const toast = useToast() as any

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<RecommendationsResult, Error>({
    queryKey: ['personalized-recommendations-home', user?.id ?? 'guest'],
    queryFn: ({ signal }) => fetchPersonalizedRecommendations(signal),
    enabled: Boolean(user && !authLoading),
    staleTime: 120_000,
    retry: 1,
  })

  const products = useMemo(() => data?.products ?? [], [data?.products])
  const meta = data?.meta ?? null
  const source = data?.source ?? 'empty'

  const handleAddToCartById = useCallback(
    (productId: string) => {
      const product = products.find((item) => item.id === productId)

      if (!product) return

      if (product.rupture) {
        notify(toast, 'warning', `${product.nom} est en rupture de stock.`)
        return
      }

      try {
        if (typeof cart?.addToCart === 'function') {
          cart.addToCart(product.id, 1)
        } else if (typeof cart?.addItem === 'function') {
          cart.addItem(
            {
              id: product.id,
              nom: product.nom,
              prix: product.effective_price,
              quantite: 1,
              image: product.images[0] ?? undefined,
            },
            1
          )
        } else {
          notify(toast, 'error', 'Panier indisponible.')
          return
        }

        notify(toast, 'success', `${product.nom} ajouté au panier.`)
      } catch (err: any) {
        notify(
          toast,
          'error',
          err?.message || 'Impossible d’ajouter ce produit au panier.'
        )
      }
    },
    [cart, products, toast]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTH LOADING                                                 */
  /* ───────────────────────────────────────────────────────────── */

  if (authLoading) {
    return (
      <section
        className="relative isolate overflow-hidden bg-canvas py-14 sm:py-16 md:py-20"
        aria-busy="true"
        aria-label="Chargement des recommandations personnalisées"
      >
        <Container>
          <div className="mb-8 flex items-center gap-3">
            <Skeleton
              variant="rectangular"
              className="h-10 w-10 rounded-xl"
            />

            <div className="space-y-2">
              <Skeleton variant="text" className="h-6 w-56 rounded-full" />
              <Skeleton variant="text" className="h-4 w-72 rounded-full" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`personalized-auth-skeleton-${index}`}
                className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card"
              >
                <Skeleton
                  variant="rectangular"
                  className="aspect-square w-full rounded-control"
                />
                <Skeleton variant="text" className="h-4 w-3/4 rounded-full" />
                <Skeleton variant="text" className="h-3 w-1/2 rounded-full" />
              </div>
            ))}
          </div>

          <span className="sr-only">Chargement…</span>
        </Container>
      </section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  NON CONNECTÉ                                                 */
  /* ───────────────────────────────────────────────────────────── */

  if (!user) {
    return (
      <section
        className="relative isolate overflow-hidden bg-canvas py-14 sm:py-16 md:py-20"
        aria-labelledby="personalized-recommendations-auth-heading"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-accent/[0.05] via-transparent to-transparent"
          aria-hidden="true"
        />

        <Container>
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
            className="relative mx-auto flex max-w-xl flex-col items-center text-center"
          >
            <span
              className={cn(
                'mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl',
                'border border-accent/20 bg-accent-soft text-accent shadow-card'
              )}
              aria-hidden="true"
            >
              <Sparkles size={30} strokeWidth={1.8} />
            </span>

            <h2
              id="personalized-recommendations-auth-heading"
              className="text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl"
            >
              Des recommandations rien que pour vous
            </h2>

            <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-muted sm:text-base">
              Connectez-vous ou créez un compte pour recevoir des suggestions
              personnalisées basées sur vos goûts, vos favoris et votre
              historique.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={`/login?redirect=${encodeURIComponent(pathname)}`}
                className={cn(
                  'inline-flex h-11 items-center justify-center gap-2 rounded-pill',
                  'bg-accent px-5 text-sm font-semibold text-accent-contrast shadow-card',
                  'transition-colors duration-200 hover:bg-accent-hover',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
                )}
              >
                <LogIn size={17} aria-hidden="true" />
                Se connecter
              </Link>

              <Link
                href="/register"
                className={cn(
                  'inline-flex h-11 items-center justify-center gap-2 rounded-pill',
                  'border border-line bg-surface px-5 text-sm font-semibold text-fg shadow-card',
                  'transition-colors duration-200',
                  'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
                )}
              >
                <UserPlus size={17} aria-hidden="true" />
                Créer un compte
              </Link>
            </div>
          </motion.div>
        </Container>
      </section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  CONNECTÉ                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const shouldShowLoading = isLoading && products.length === 0
  const shouldShowError = isError && products.length === 0
  const shouldShowEmpty =
    !isLoading && !isError && products.length === 0

  return (
    <section
      className="relative isolate overflow-hidden bg-canvas py-14 sm:py-16 md:py-20"
      aria-labelledby="personalized-recommendations-heading"
    >
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
                  <Target size={20} strokeWidth={2} />
                </span>

                <h2
                  id="personalized-recommendations-heading"
                  className="text-balance text-xl font-bold tracking-tight text-fg sm:text-2xl md:text-3xl"
                >
                  Recommandé pour vous
                </h2>

                <Pill tone="accent" icon={<Sparkles size={10} aria-hidden="true" />}>
                  IA
                </Pill>

                {data ? (
                  <RecommendationStatusPill
                    source={source}
                    meta={meta}
                  />
                ) : null}

                {meta?.personalization.average_price ? (
                  <AveragePricePill
                    averagePrice={meta.personalization.average_price}
                  />
                ) : null}
              </div>

              <p className="max-w-2xl text-sm leading-relaxed text-fg-muted sm:text-base">
                {meta?.personalization.has_history
                  ? 'Basé sur vos achats, favoris et consultations récentes.'
                  : 'Sélection découverte basée sur la popularité, les notes et les tendances.'}
              </p>

              {meta?.warning ? (
                <p className="mt-2 text-xs font-medium text-warning">
                  {meta.warning}
                </p>
              ) : null}
            </div>

            <ActionButton
              onClick={() => void refetch()}
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
            aria-label="Chargement des recommandations"
          >
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`personalized-skeleton-${index}`}
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

            <span className="sr-only">Chargement des recommandations…</span>
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
                : 'Impossible de charger vos recommandations.'}
            </p>

            <p className="max-w-sm text-xs text-fg-muted">
              Une erreur est survenue lors de la récupération des suggestions
              personnalisées.
            </p>

            <ActionButton
              onClick={() => void refetch()}
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
            <Sparkles
              size={32}
              className="text-fg-subtle"
              aria-hidden="true"
            />

            <p className="text-sm font-medium text-fg-muted">
              Aucune recommandation disponible pour le moment.
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
            onAddToCart={handleAddToCartById}
          />
        ) : null}
      </Container>
    </section>
  )
}