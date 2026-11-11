// components/ProductCard.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  motion,
  useReducedMotion,
} from 'framer-motion'

import { useInView } from 'react-intersection-observer'

import {
  AlertTriangle,
  Check,
  Clock,
  Eye,
  Flame,
  Heart,
  Share2,
  ShoppingCart,
  Sparkles,
  Star,
  TrendingUp,
  Truck,
  WifiOff,
  Zap,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useFavorites } from '@/hooks/useFavorites'
import { useTrackInteraction } from '@/hooks/useTrackInteraction'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

import { toast } from 'sonner'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type Currency = 'USD' | 'CDF'

export interface NormalizedProduct {
  id: string
  nom: string
  slug?: string
  href: string
  image_url?: string | null
  images: string[]

  /**
   * Legacy : prix CDF.
   * USD reste la source principale via priceUsd / prix_usd.
   */
  prix: number
  prix_usd?: number | null
  prix_cdf?: number | null
  unit_price_usd?: number | null

  effective_price: number
  original_price?: number | null
  discount: number

  priceUsd: number
  priceCdf: number
  originalPriceUsd: number
  originalPriceCdf: number

  primaryCurrency: Currency
  primaryAmount: number
  secondaryCurrency: Currency
  secondaryAmount: number
  originalPrimaryAmount: number

  savingsUsd: number
  savingsCdf: number
  savingsPrimary: number

  stock: number | null
  rupture: boolean
  stock_faible: boolean
  available: boolean

  note_moyenne: number | null
  avis_count: number | null
  total_ventes: number

  is_new: boolean
  is_trending: boolean
  livraison_gratuite: boolean
  livraison_express: boolean
  prix_dynamique: boolean
  negotiable: boolean

  categorie?: string | null
  vendeur_label?: string | null
  badges?: string[]
  tags?: string[]
  created_at?: string | null
  score?: number | null

  delivery_config?: any
  poids_kg?: number | null
  logistics_group?: string | null
  non_consolidable?: boolean

  __normalized?: boolean
  [key: string]: any
}

export interface ProductCardProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange'> {
  product: any
  variant?: 'default' | 'compact' | 'horizontal' | 'list'
  compact?: boolean
  animated?: boolean

  showVendor?: boolean
  showCategory?: boolean
  showRatings?: boolean
  showStockInfo?: boolean
  showActions?: boolean
  showQuickView?: boolean
  showShareButton?: boolean

  onQuickView?: (productId: string) => void
  onSelect?: (productId: string, selected: boolean) => void
  selected?: boolean
  selectable?: boolean
  adminMode?: boolean

  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const LOW_STOCK_THRESHOLD = 5
const NEW_PRODUCT_DAYS = 14
const CART_ADDED_DURATION = 1500
const TRACK_VIEW_DELAY = 1000
const MIN_AI_SCORE_PERCENT = 60
const RECENT_STORAGE_KEY = 'gercie-recent-products'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toNullablePositive(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Gère string[], [{url}], JSON string, CSV, objets isolés.
 * Ne jamais appeler .split() directement sur une valeur Supabase :
 * tags/badges/images peuvent arriver en tableau (text[] / jsonb).
 */
function toStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return []

  const clean = (item: unknown): string => {
    if (typeof item === 'string') return item.trim()
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      return String(
        obj.url ?? obj.publicUrl ?? obj.path ?? obj.src ?? ''
      ).trim()
    }
    return ''
  }

  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map(clean).filter(Boolean)
        }
      } catch {
        // pas du JSON → on tente le CSV
      }
    }

    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }

    return [trimmed]
  }

  const str = String(value).trim()
  return str ? [str] : []
}

function daysSince(dateString?: string | null): number | null {
  if (!dateString) return null

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null

  return (Date.now() - date.getTime()) / 86_400_000
}

function formatNumber(value: number): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'

  return n.toLocaleString('fr-FR')
}

function formatDecimal(value: number, digits = 2): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'

  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatProductAmount(value: number, currency: Currency): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

function saveRecentProduct(productId: string): void {
  if (typeof window === 'undefined') return

  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const previous = Array.isArray(parsed) ? parsed : []

    const next = [
      productId,
      ...previous.filter((id) => id !== productId),
    ].slice(0, 12)

    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // stockage indisponible
  }
}

function getCurrentPath(fallback = '/'): string {
  if (typeof window === 'undefined') return fallback

  const path = `${window.location.pathname}${window.location.search}`

  if (path.startsWith('/login')) return '/'

  return path
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Règle prix :
 *
 * - prix_usd = source principale
 * - prix_cdf = conversion calculée
 * - si seulement prix CDF existe, on dérive un prix USD temporaire
 * - si prix_usd et prix_cdf existent mais divergent, prix_usd gagne
 */
export function normalizeProduct(
  raw: any,
  rate?: number | null
): NormalizedProduct | null {
  if (!raw || typeof raw !== 'object') return null
  if (raw.__normalized) return raw as NormalizedProduct

  const id = String(raw.id ?? raw._id ?? '').trim()
  if (!id) return null

  const nom = String(raw.nom ?? raw.name ?? '').trim()
  if (!nom) return null

  const rateNumber = toNullablePositive(rate)
  const rateOk = rateNumber != null && rateNumber > 0

  /* ---------------------------------------------------------- */
  /* Prix courant                                                */
  /* ---------------------------------------------------------- */

  const rawUsd = toNullablePositive(
    raw.prix_usd ?? raw.price_usd ?? raw.unit_price_usd
  )

  const rawCdf = toNullablePositive(
    raw.prix ?? raw.price ?? raw.prix_cdf ?? raw.price_cdf
  )

  let priceUsd =
    rawUsd ??
    (rawCdf != null && rateOk ? toUsd(rawCdf, rateNumber) : 0)

  let priceCdf =
    priceUsd > 0 && rateOk
      ? toCdf(priceUsd, rateNumber)
      : rawCdf ?? 0

  priceUsd = Number.isFinite(priceUsd) ? roundUsd(priceUsd) : 0
  priceCdf = Number.isFinite(priceCdf) ? roundCdf(priceCdf) : 0

  /* ---------------------------------------------------------- */
  /* Prix original / barré                                        */
  /* ---------------------------------------------------------- */

  const rawOriginalUsd = toNullablePositive(
    raw.prix_usd_original ??
      raw.original_price_usd ??
      raw.prix_initial_usd
  )

  const rawOriginalCdf = toNullablePositive(
    raw.prix_original ??
      raw.original_price ??
      raw.original_price_cdf ??
      raw.prix_initial
  )

  let originalUsd =
    rawOriginalUsd ??
    (rawOriginalCdf != null && rateOk
      ? toUsd(rawOriginalCdf, rateNumber)
      : 0)

  let originalCdf =
    originalUsd > 0 && rateOk
      ? toCdf(originalUsd, rateNumber)
      : rawOriginalCdf ?? 0

  originalUsd = Number.isFinite(originalUsd) ? roundUsd(originalUsd) : 0
  originalCdf = Number.isFinite(originalCdf) ? roundCdf(originalCdf) : 0

  /* ---------------------------------------------------------- */
  /* Remise                                                     */
  /* ---------------------------------------------------------- */

  let discount = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        toNum(raw.discount ?? raw.remise_percent ?? raw.discount_percent, 0)
      )
    )
  )

  if (discount === 0 && originalUsd > 0 && priceUsd > 0 && originalUsd > priceUsd) {
    discount = Math.round((1 - priceUsd / originalUsd) * 100)
  }

  if (discount > 0) {
    const divisor = 1 - discount / 100

    if (divisor > 0) {
      if (originalUsd <= 0 && priceUsd > 0) {
        originalUsd = roundUsd(priceUsd / divisor)
      }

      if (originalCdf <= 0 && priceCdf > 0) {
        originalCdf =
          rateOk && originalUsd > 0
            ? toCdf(originalUsd, rateNumber)
            : roundCdf(priceCdf / divisor)
      }
    }
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

  const primaryCurrency: Currency = priceUsd > 0 ? 'USD' : 'CDF'
  const secondaryCurrency: Currency =
    primaryCurrency === 'USD' ? 'CDF' : 'USD'

  const primaryAmount =
    primaryCurrency === 'USD' ? priceUsd : priceCdf

  const secondaryAmount =
    secondaryCurrency === 'USD' ? priceUsd : priceCdf

  const originalPrimaryAmount =
    primaryCurrency === 'USD' ? originalUsd : originalCdf

  /* ---------------------------------------------------------- */
  /* Économies                                                  */
  /* ---------------------------------------------------------- */

  const savingsUsd = Math.max(0, roundUsd(originalUsd - priceUsd))

  const savingsCdf =
    savingsUsd > 0 && rateOk
      ? toCdf(savingsUsd, rateNumber)
      : Math.max(0, roundCdf(originalCdf - priceCdf))

  const savingsPrimary =
    primaryCurrency === 'USD' ? savingsUsd : savingsCdf

  /* ---------------------------------------------------------- */
  /* Badges / tags / images                                     */
  /* ---------------------------------------------------------- */

  const badges = toStringArray(raw.badges)
  const tags = toStringArray(raw.tags)

  const stock = toNullableNumber(raw.stock)

  const rupture =
    Boolean(raw.rupture) ||
    stock === 0 ||
    raw.est_actif === false ||
    badges.includes('rupture')

  const stock_faible =
    !rupture &&
    stock !== null &&
    stock > 0 &&
    stock <= LOW_STOCK_THRESHOLD

  const created_at = textOrNull(raw.created_at ?? raw.createdAt)
  const createdDays = daysSince(created_at)

  const isNewByDate =
    createdDays !== null && createdDays <= NEW_PRODUCT_DAYS

  const is_new =
    badges.includes('nouveau') ||
    badges.includes('new') ||
    Boolean(raw.is_new) ||
    isNewByDate

  const total_ventes = toNum(raw.total_ventes ?? raw.ventes ?? raw.sales, 0)

  const is_trending =
    badges.includes('tendance') ||
    badges.includes('top') ||
    Boolean(raw.is_trending) ||
    total_ventes >= 50

  const available = !rupture && raw.est_actif !== false

  const images = toStringArray(
    raw.images ?? raw.image_url ?? raw.thumbnail ?? raw.photo
  )

  const image_url =
    images[0] ??
    textOrNull(raw.image_url ?? raw.thumbnail ?? raw.photo) ??
    null

  const slug = textOrNull(raw.slug) ?? id
  const href = textOrNull(raw.href) ?? `/produits/${slug}`

  const note_moyenne = toNullableNumber(
    raw.note_moyenne ?? raw.note ?? raw.rating ?? raw.average_rating
  )

  const avis_count = toNullableNumber(
    raw.avis_count ??
      raw.total_evaluations ??
      raw.reviews_count ??
      raw.review_count
  )

  const score = toNullableNumber(raw.ai_score ?? raw.score ?? raw.rank_score)

  const categorie =
    typeof raw.categorie === 'string'
      ? raw.categorie
      : textOrNull(raw.categorie?.nom ?? raw.categorie?.name ?? raw.category)

  const vendeurLabel =
    textOrNull(raw.vendeur?.boutique_nom) ||
    [
      textOrNull(raw.vendeur?.prenom),
      textOrNull(raw.vendeur?.nom),
    ]
      .filter(Boolean)
      .join(' ') ||
    'Vendu par Gercie'

  const deliveryConfig =
    raw.delivery_config ??
    raw.product?.delivery_config ??
    null

  const logisticsGroup =
    raw.logistics_group ??
    deliveryConfig?.logistics?.group ??
    null

  const nonConsolidable =
    Boolean(raw.non_consolidable) ||
    Object.values(deliveryConfig?.modes || {}).some((mode: any) =>
      Boolean(
        mode?.mandatory_per_unit ||
          mode?.non_consolidable ||
          mode?.protect_margin ||
          mode?.calculation_mode === 'mandatory_per_unit'
      )
    )

  return {
    ...raw,

    id,
    nom,
    slug,
    href,
    images,
    image_url,

    /*
     * Legacy panier :
     * prix = CDF
     * prix_usd = USD principal
     */
    prix: priceCdf,
    prix_usd: priceUsd,
    prix_cdf: priceCdf,
    unit_price_usd: priceUsd,

    effective_price: primaryAmount,
    original_price:
      originalPrimaryAmount > primaryAmount ? originalPrimaryAmount : null,
    discount,

    priceUsd,
    priceCdf,
    originalPriceUsd: originalUsd,
    originalPriceCdf: originalCdf,

    primaryCurrency,
    primaryAmount,
    secondaryCurrency,
    secondaryAmount,
    originalPrimaryAmount,

    savingsUsd,
    savingsCdf,
    savingsPrimary,

    stock,
    rupture,
    stock_faible,
    available,

    note_moyenne,
    avis_count,
    total_ventes,

    is_new,
    is_trending,

    livraison_gratuite:
      Boolean(raw.livraison_gratuite) ||
      badges.includes('livraison-gratuite') ||
      badges.includes('free-shipping'),

    livraison_express:
      Boolean(raw.livraison_express) ||
      badges.includes('livraison-express') ||
      badges.includes('express'),

    prix_dynamique:
      Boolean(raw.prix_dynamique) ||
      badges.includes('prix-dynamique') ||
      badges.includes('dynamic-price'),

    negotiable: Boolean(raw.negotiable),

    categorie,
    vendeur_label: vendeurLabel,
    badges,
    tags,
    created_at,
    score,

    delivery_config: deliveryConfig,
    poids_kg: raw.poids_kg ?? raw.weight_kg ?? null,
    logistics_group: logisticsGroup,
    non_consolidable: nonConsolidable,

    __normalized: true,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UI PRIMITIVES                                                  */
/* ═══════════════════════════════════════════════════════════════ */

type PillTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

const pillTones: Record<PillTone, string> = {
  neutral: 'border-line bg-muted text-fg-muted',
  accent: 'border-accent/20 bg-accent-soft text-accent',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  danger: 'border-danger/20 bg-danger-soft text-danger',
  info: 'border-info/20 bg-info-soft text-info',
}

function Pill({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: PillTone
  icon?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  if (!children) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
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

function Stars({
  value,
  count,
}: {
  value: number
  count?: number | null
}) {
  if (!value || value <= 0) return null

  const rounded = Math.round(value)

  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={`Note : ${formatDecimal(value, 1)} sur 5`}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          size={12}
          className={cn(
            index < rounded
              ? 'fill-accent text-accent'
              : 'text-line-strong'
          )}
          aria-hidden="true"
        />
      ))}

      <span className="ml-1 text-[11px] text-fg-subtle">
        ({count ?? 0})
      </span>
    </div>
  )
}

const actionButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface/90 text-fg-muted shadow-card backdrop-blur transition-colors duration-200 hover:border-accent/30 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50'

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT CARD                                                   */
/* ═══════════════════════════════════════════════════════════════ */

export function ProductCard({
  product,
  variant = 'default',
  compact = false,
  animated = true,
  showVendor = true,
  showCategory = true,
  showRatings = true,
  showStockInfo = true,
  showActions = true,
  showQuickView = true,
  showShareButton = true,
  onQuickView,
  onSelect,
  selected = false,
  selectable = false,
  adminMode = false,
  className,
  ...props
}: ProductCardProps) {
  const exchange = useExchangeRate() as any

  const rate = toNullablePositive(
    exchange?.rate ??
      exchange?.usdRate ??
      exchange?.data?.rate ??
      exchange?.data?.current?.rate
  )

  const cart = useCart() as any
  const favorites = useFavorites() as any
  const interaction = useTrackInteraction() as any
  const onlineStatus = useOnlineStatus() as any

  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const { prefersReducedMotion } = useAccessibilityPreferences()
  const framerReducedMotion = useReducedMotion()

  const [mounted, setMounted] = useState(false)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  const { ref: inViewRef, inView } = useInView({
    triggerOnce: true,
    threshold: 0.25,
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   * On évite donc d'utiliser le taux avant hydratation.
   */
  const safeRate = mounted ? rate : null

  const normalized = useMemo(
    () => normalizeProduct(product, safeRate),
    [product, safeRate]
  )

  useEffect(() => {
    if (!normalized?.image_url) {
      setImageLoaded(true)
    }
  }, [normalized?.image_url])

  useEffect(() => {
    if (!mounted || !inView || !normalized?.id) return

    const timer = setTimeout(() => {
      const track =
        interaction?.track ??
        interaction?.trackEvent ??
        interaction?.log

      track?.('product_view', {
        product_id: normalized.id,
        product_name: normalized.nom,
      })
    }, TRACK_VIEW_DELAY)

    return () => clearTimeout(timer)
  }, [inView, interaction, mounted, normalized?.id, normalized?.nom])

  const rawIsOnline =
    typeof onlineStatus === 'boolean'
      ? onlineStatus
      : Boolean(onlineStatus?.isOnline ?? true)

  /**
   * FIX HYDRATION :
   * navigator.onLine / statut réseau peut différer serveur/client.
   */
  const isOnline = mounted ? rawIsOnline : true

  const prefersReduced =
    Boolean(prefersReducedMotion) || Boolean(framerReducedMotion)

  const shouldAnimate = animated && !prefersReduced

  const requireAuth = useCallback(
    (message: string) => {
      if (authLoading) {
        toast?.info?.('Connexion en cours, veuillez patienter…')
        return false
      }

      if (user) return true

      toast?.warning?.(message)

      router.push(
        `/login?redirect=${encodeURIComponent(getCurrentPath('/'))}`
      )

      return false
    },
    [authLoading, router, user]
  )

  const id = normalized?.id ?? ''

  /**
   * RÈGLE MÉTIER :
   * Un visiteur non connecté ne doit jamais voir un produit comme favori.
   */
  const isFav =
    mounted &&
    !authLoading &&
    Boolean(user) &&
    Boolean(favorites?.isFavorite?.(id))

  const aiScorePercent = useMemo(() => {
    const rawScore = normalized?.score

    if (typeof rawScore === 'number') {
      if (rawScore >= 0 && rawScore <= 1) {
        return Math.round(rawScore * 100)
      }

      if (rawScore > 1 && rawScore <= 100) {
        return Math.round(rawScore)
      }
    }

    return null
  }, [normalized?.score])

  const hasAiScore =
    aiScorePercent !== null && aiScorePercent >= MIN_AI_SCORE_PERCENT

  const isHorizontal =
    variant === 'horizontal' || variant === 'list'

  const isCompact = compact || variant === 'compact'

  const hasPrice = Boolean(normalized && normalized.primaryAmount > 0)

  const canAddToCart = Boolean(
    normalized &&
      normalized.available &&
      !normalized.rupture &&
      hasPrice
  )

  const handleAddToCart = useCallback(
    async (event?: React.MouseEvent) => {
      event?.preventDefault()
      event?.stopPropagation()

      if (
        !normalized ||
        normalized.rupture ||
        adding ||
        !hasPrice
      ) {
        return
      }

      /**
       * RÈGLE MÉTIER : connexion obligatoire pour ajouter au panier.
       */
      if (!requireAuth('Veuillez vous connecter pour ajouter au panier.')) {
        return
      }

      setAdding(true)

      try {
        /**
         * Payload panier :
         * - prix = CDF pour compatibilité CartContext legacy
         * - prix_usd / unit_price_usd = USD principal
         * - delivery_config / poids_kg = pour calcul livraison futur
         */
        const payload = {
          id: normalized.id,
          product_id: normalized.id,
          nom: normalized.nom,

          prix: normalized.priceCdf > 0 ? normalized.priceCdf : normalized.prix,
          prix_usd:
            normalized.priceUsd > 0 ? normalized.priceUsd : undefined,
          unit_price_usd:
            normalized.priceUsd > 0 ? normalized.priceUsd : undefined,

          quantite: 1,

          image:
            normalized.image_url ||
            normalized.images?.[0] ||
            null,
          images: normalized.images,

          variante: undefined,

          delivery_config:
            normalized.delivery_config ??
            product?.delivery_config ??
            null,

          poids_kg:
            normalized.poids_kg ??
            product?.poids_kg ??
            product?.weight_kg ??
            null,

          logistics_group:
            normalized.logistics_group ??
            normalized.delivery_config?.logistics?.group ??
            product?.logistics_group ??
            null,

          non_consolidable:
            normalized.non_consolidable ??
            product?.non_consolidable ??
            false,
        } as any

        await cart?.addItem?.(payload, 1)

        setAdded(true)
        toast?.success?.(`${normalized.nom} ajouté au panier`)

        setTimeout(() => {
          setAdded(false)
        }, CART_ADDED_DURATION)
      } catch {
        toast?.error?.('Impossible d’ajouter ce produit au panier.')
      } finally {
        setAdding(false)
      }
    },
    [adding, cart, hasPrice, normalized, product, requireAuth]
  )

  const handleFavorite = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (!normalized) return

      /**
       * RÈGLE MÉTIER : connexion obligatoire pour les favoris.
       */
      if (!requireAuth('Veuillez vous connecter pour ajouter aux favoris.')) {
        return
      }

      const wasFav = isFav

      favorites?.toggleFavorite?.(normalized.id, normalized)

      toast?.[wasFav ? 'info' : 'success']?.(
        wasFav
          ? 'Retiré des favoris'
          : 'Ajouté aux favoris'
      )
    },
    [favorites, isFav, normalized, requireAuth]
  )

  const handleShare = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (!normalized) return

      const url =
        typeof window !== 'undefined'
          ? `${window.location.origin}${normalized.href}`
          : normalized.href

      try {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: normalized.nom,
            text: `Découvrez ${normalized.nom}`,
            url,
          })
        } else if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard
        ) {
          await navigator.clipboard.writeText(url)
          toast?.success?.('Lien copié')
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          toast?.error?.('Partage impossible')
        }
      }
    },
    [normalized]
  )

  const handleQuickView = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (!normalized) return

      saveRecentProduct(normalized.id)
      onQuickView?.(normalized.id)
    },
    [normalized, onQuickView]
  )

  const handleLinkClick = useCallback(() => {
    if (!normalized) return
    saveRecentProduct(normalized.id)
  }, [normalized])

  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (!normalized) return

      onSelect?.(normalized.id, !selected)
    },
    [normalized, onSelect, selected]
  )

  if (!normalized) return null

  const primaryText = hasPrice
    ? formatProductAmount(
        normalized.primaryAmount,
        normalized.primaryCurrency
      )
    : 'Prix sur demande'

  const secondaryText =
    hasPrice && normalized.secondaryAmount > 0
      ? `≈ ${formatProductAmount(
          normalized.secondaryAmount,
          normalized.secondaryCurrency
        )}`
      : null

  const originalText =
    normalized.originalPrimaryAmount > normalized.primaryAmount &&
    normalized.originalPrimaryAmount > 0
      ? formatProductAmount(
          normalized.originalPrimaryAmount,
          normalized.primaryCurrency
        )
      : null

  const savingsText =
    normalized.savingsPrimary > 0
      ? `−${formatProductAmount(
          normalized.savingsPrimary,
          normalized.primaryCurrency
        )}`
      : null

  const badges = (
    <>
      {normalized.is_new && (
        <Pill tone="accent" icon={<Sparkles size={10} aria-hidden="true" />}>
          Nouveau
        </Pill>
      )}

      {normalized.discount > 0 && (
        <Pill tone="danger">-{normalized.discount}%</Pill>
      )}

      {normalized.livraison_gratuite && (
        <Pill tone="success" icon={<Truck size={10} aria-hidden="true" />}>
          Livraison offerte
        </Pill>
      )}

      {normalized.prix_dynamique && (
        <Pill tone="warning" icon={<Zap size={10} aria-hidden="true" />}>
          Prix dynamique
        </Pill>
      )}

      {hasAiScore && (
        <Pill tone="info" icon={<Sparkles size={10} aria-hidden="true" />}>
          IA {aiScorePercent}%
        </Pill>
      )}

      {normalized.is_trending && (
        <Pill tone="warning" icon={<Flame size={10} aria-hidden="true" />}>
          Top vente
        </Pill>
      )}

      {showStockInfo &&
        normalized.stock_faible &&
        normalized.stock !== null && (
          <Pill tone="warning" icon={<Clock size={10} aria-hidden="true" />}>
            Plus que {normalized.stock}
          </Pill>
        )}

      {normalized.rupture && (
        <Pill
          tone="danger"
          icon={<AlertTriangle size={10} aria-hidden="true" />}
        >
          Rupture
        </Pill>
      )}
    </>
  )

  return (
    <motion.article
      ref={inViewRef}
      initial={shouldAnimate ? { opacity: 0, y: 8 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldAnimate ? 0.25 : 0, ease: 'easeOut' }}
      className={cn(
        'group relative flex overflow-hidden rounded-card border border-line bg-surface text-fg shadow-card transition-all duration-200 ease-out hover:border-line-strong hover:shadow-card-hover',
        isHorizontal ? 'flex-row' : 'flex-col',
        className
      )}
      {...props}
    >
      {/* Sélection admin */}
      {(adminMode || selectable) && (
        <button
          type="button"
          onClick={handleSelect}
          aria-pressed={selected}
          aria-label={
            selected
              ? `Désélectionner ${normalized.nom}`
              : `Sélectionner ${normalized.nom}`
          }
          className={cn(
            'absolute left-2 top-2 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            selected
              ? 'border-accent bg-accent text-accent-contrast'
              : 'border-line bg-surface/90 text-fg-muted hover:border-accent/40 hover:text-accent'
          )}
        >
          {selected && <Check size={14} aria-hidden="true" />}
        </button>
      )}

      {/* ========================================================
          IMAGE — le <Link> et les <button> sont frères dans un
          wrapper relative.
          Avant : button imbriqué dans a → HTML invalide.
      ======================================================== */}
      <div
        className={cn(
          'relative shrink-0 overflow-hidden bg-muted',
          isHorizontal
            ? 'h-32 w-28 sm:h-36 sm:w-36'
            : 'aspect-square w-full'
        )}
      >
        <Link
          href={normalized.href}
          onClick={handleLinkClick}
          className="block h-full w-full"
          aria-label={normalized.nom}
        >
          {normalized.image_url && !imageError ? (
            <img
              src={normalized.image_url}
              alt={normalized.nom}
              loading="lazy"
              decoding="async"
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageError(true)
                setImageLoaded(true)
              }}
              className={cn(
                'h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.03]',
                imageLoaded ? 'opacity-100' : 'opacity-0',
                normalized.rupture && 'grayscale'
              )}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-fg-subtle"
              aria-hidden="true"
            >
              <ShoppingCart size={28} strokeWidth={1.5} />
            </div>
          )}
        </Link>

        {!imageLoaded && !imageError && (
          <div className="skeleton absolute inset-0" aria-hidden="true" />
        )}

        {normalized.rupture && (
          <div className="absolute inset-0 flex items-center justify-center bg-overlay/45 backdrop-blur-[1px]">
            <Pill tone="danger">Rupture de stock</Pill>
          </div>
        )}

        <div
          className={cn(
            'absolute top-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap gap-1',
            adminMode || selectable ? 'left-11' : 'left-2'
          )}
        >
          {badges}
        </div>

        {showActions && (
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <Tooltip
              content={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <button
                type="button"
                onClick={handleFavorite}
                className={cn(
                  actionButtonClass,
                  isFav && 'border-accent/30 bg-accent-soft text-accent'
                )}
                aria-label={
                  isFav
                    ? `Retirer ${normalized.nom} des favoris`
                    : `Ajouter ${normalized.nom} aux favoris`
                }
                aria-pressed={isFav}
              >
                <Heart
                  size={15}
                  className={isFav ? 'fill-current' : undefined}
                  aria-hidden="true"
                />
              </button>
            </Tooltip>

            {showQuickView && (
              <Tooltip content="Aperçu rapide">
                <button
                  type="button"
                  onClick={handleQuickView}
                  className={actionButtonClass}
                  aria-label={`Aperçu rapide de ${normalized.nom}`}
                >
                  <Eye size={15} aria-hidden="true" />
                </button>
              </Tooltip>
            )}

            {showShareButton && (
              <Tooltip content="Partager">
                <button
                  type="button"
                  onClick={handleShare}
                  className={actionButtonClass}
                  aria-label={`Partager ${normalized.nom}`}
                >
                  <Share2 size={15} aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Contenu */}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col p-3 sm:p-4',
          isCompact && 'p-2.5 sm:p-3'
        )}
      >
        {(showVendor && normalized.vendeur_label) ||
        (showCategory && normalized.categorie) ? (
          <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            {showVendor && normalized.vendeur_label && (
              <span className="truncate text-fg-subtle">
                {normalized.vendeur_label}
              </span>
            )}

            {showCategory && normalized.categorie && (
              <span className="truncate text-accent">
                {normalized.categorie}
              </span>
            )}
          </div>
        ) : null}

        <Link
          href={normalized.href}
          onClick={handleLinkClick}
          className={cn(
            'line-clamp-2 rounded-md font-semibold text-fg transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            isCompact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
          )}
        >
          {normalized.nom}
        </Link>

        {showRatings && (
          <div className="mt-1.5">
            <Stars
              value={normalized.note_moyenne ?? 0}
              count={normalized.avis_count}
            />
          </div>
        )}

        {!isOnline && (
          <div className="mt-2">
            <Pill
              tone="warning"
              icon={<WifiOff size={10} aria-hidden="true" />}
            >
              Hors ligne
            </Pill>
          </div>
        )}

        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <p
                className={cn(
                  'font-bold tracking-tight text-fg',
                  isCompact ? 'text-sm' : 'text-base sm:text-lg'
                )}
              >
                {primaryText}
              </p>

              {secondaryText && (
                <p className="mt-0.5 text-[11px] font-medium text-fg-muted sm:text-xs">
                  {secondaryText}
                </p>
              )}

              {originalText && (
                <p className="mt-0.5 text-[11px] text-fg-subtle line-through sm:text-xs">
                  {originalText}
                </p>
              )}
            </div>

            {savingsText && <Pill tone="success">{savingsText}</Pill>}
          </div>

          {normalized.total_ventes > 0 && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-fg-subtle">
              <TrendingUp size={11} aria-hidden="true" />
              <span>{formatNumber(normalized.total_ventes)} vendus</span>
            </div>
          )}

          <div className="mt-3">
            <Button
              type="button"
              variant={
                normalized.rupture || !hasPrice ? 'secondary' : 'primary'
              }
              size={isCompact ? 'xs' : 'sm'}
              fullWidth={!isHorizontal}
              disabled={
                normalized.rupture || adding || !canAddToCart
              }
              loading={adding}
              onClick={handleAddToCart}
              leftIcon={
                added ? (
                  <Check size={15} aria-hidden="true" />
                ) : normalized.rupture ? (
                  <AlertTriangle size={15} aria-hidden="true" />
                ) : (
                  <ShoppingCart size={15} aria-hidden="true" />
                )
              }
              className={cn(
                !isHorizontal && 'w-full',
                isHorizontal && 'min-w-[8.5rem]'
              )}
            >
              {added
                ? 'Ajouté'
                : normalized.rupture
                  ? 'Indisponible'
                  : !hasPrice
                    ? 'Sur demande'
                    : 'Ajouter'}
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  )
}

export default ProductCard