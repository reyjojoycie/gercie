// components/Recommendations.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { motion } from 'framer-motion'

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Clock,
  Compass,
  Eye,
  Flame,
  History,
  Layers,
  Loader2,
  LogIn,
  RefreshCw,
  Sparkles,
  Star,
  Target,
  UserPlus,
  Zap,
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import ProductCard from '@/components/ProductCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'

import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type RecommendationType =
  | 'ai-personalized'
  | 'trending'
  | 'history'
  | 'similar-to-cart'
  | 'cart-complementary'
  | 'best-sellers'
  | 'new-arrivals'
  | 'for-you'
  | 'hybrid'
  | 'category-based'
  | 'popular'

export interface RecommendedProduct {
  id: string
  nom: string
  slug?: string
  href?: string

  /**
   * Legacy : prix CDF.
   * USD reste la source principale via prix_usd.
   */
  prix: number

  /**
   * USD = source principale.
   */
  prix_usd?: number | null
  prix_cdf?: number | null

  price?: number | null
  price_usd?: number | null
  price_cdf?: number | null
  unit_price_usd?: number | null

  images: string[]
  image_url?: string | null

  vendeur?: {
    boutique_nom?: string
    prenom?: string
    nom?: string
  } | null

  categorie?: string | null
  category?: string | null

  created_at?: string | null
  total_ventes?: number | null

  rating?: number | null
  note_moyenne?: number | null

  reviews_count?: number | null
  avis_count?: number | null

  stock?: number | null
  rupture?: boolean | null
  est_actif?: boolean | null

  discount?: number | null
  remise_percent?: number | null
  discount_percent?: number | null

  tags?: unknown
  badges?: string[]

  delivery_config?: any
  poids_kg?: number | null
  logistics_group?: string | null
  non_consolidable?: boolean

  [key: string]: any
}

export interface RecommendationsProps {
  type?: RecommendationType
  title?: string
  description?: string
  products?: RecommendedProduct[] | any[]
  maxItems?: number
  seeMoreUrl?: string
  className?: string
  onRefresh?: () => void
  cardVariant?: 'compact' | 'standard'
  carousel?: boolean

  /** Catégorie pour filtrer si type === 'category-based' */
  category?: string

  /** ID produit pour les similaires */
  similarToProductId?: string

  /** Cache l’en-tête : titre, description, actions */
  hideHeader?: boolean

  /** Ajoute un filtre rapide par catégorie */
  showCategoryFilter?: boolean

  /** Message personnalisé pour "Recommandé pour vous" */
  reason?: string

  /** Affiche un badge "offre limitée" si pertinent */
  showTimer?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES / STYLES                                            */
/* ═══════════════════════════════════════════════════════════════ */

const FETCH_TIMEOUT_MS = 12_000
const VISITED_CATEGORIES_KEY = 'gercie_visited_categories'

const typeStyles: Record<string, {
  icon: React.ReactNode
  bg: string
  border: string
  text: string
}> = {
  'ai-personalized': {
    icon: <Sparkles size={20} className="text-purple-400" />,
    bg: 'from-purple-900/20 to-purple-600/10',
    border: 'border-purple-400/30',
    text: 'text-purple-300',
  },
  trending: {
    icon: <Flame size={20} className="text-amber-400" />,
    bg: 'from-amber-900/20 to-amber-600/10',
    border: 'border-amber-400/30',
    text: 'text-amber-300',
  },
  history: {
    icon: <History size={20} className="text-teal-400" />,
    bg: 'from-teal-900/20 to-teal-600/10',
    border: 'border-teal-400/30',
    text: 'text-teal-300',
  },
  'similar-to-cart': {
    icon: <Eye size={20} className="text-rose-400" />,
    bg: 'from-rose-900/20 to-rose-600/10',
    border: 'border-rose-400/30',
    text: 'text-rose-300',
  },
  'cart-complementary': {
    icon: <PackageLikeIcon />,
    bg: 'from-emerald-900/20 to-teal-600/10',
    border: 'border-emerald-400/30',
    text: 'text-emerald-300',
  },
  'best-sellers': {
    icon: <Star size={20} className="text-gold-400" />,
    bg: 'from-gold-900/20 to-gold-600/10',
    border: 'border-gold-400/30',
    text: 'text-gold-300',
  },
  'new-arrivals': {
    icon: <Zap size={20} className="text-blue-400" />,
    bg: 'from-blue-900/20 to-blue-600/10',
    border: 'border-blue-400/30',
    text: 'text-blue-300',
  },
  'for-you': {
    icon: <Target size={20} className="text-pink-400" />,
    bg: 'from-pink-900/20 to-pink-600/10',
    border: 'border-pink-400/30',
    text: 'text-pink-300',
  },
  hybrid: {
    icon: <Layers size={20} className="text-indigo-400" />,
    bg: 'from-indigo-900/20 to-purple-600/10',
    border: 'border-indigo-400/30',
    text: 'text-indigo-300',
  },
  'category-based': {
    icon: <Compass size={20} className="text-emerald-400" />,
    bg: 'from-emerald-900/20 to-green-600/10',
    border: 'border-emerald-400/30',
    text: 'text-emerald-300',
  },
  popular: {
    icon: <BarChart3 size={20} className="text-red-400" />,
    bg: 'from-red-900/20 to-orange-600/10',
    border: 'border-red-400/30',
    text: 'text-red-300',
  },
}

const defaultStyle = {
  icon: <Sparkles size={20} className="text-gold-400" />,
  bg: 'from-gold-900/20 to-gold-600/10',
  border: 'border-gold-400/30',
  text: 'text-gold-300',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

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

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()

  return trimmed ? trimmed : null
}

function toStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return []

  const clean = (item: unknown): string => {
    if (typeof item === 'string') return item.trim()

    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>

      return String(
        obj.url ??
          obj.publicUrl ??
          obj.path ??
          obj.src ??
          ''
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
        // pas du JSON → fallback CSV
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

function getCategorieLabel(raw: any): string | null {
  if (typeof raw?.categorie === 'string') return raw.categorie

  return textOrNull(
    raw?.categorie?.nom ??
      raw?.categorie?.name ??
      raw?.category?.nom ??
      raw?.category?.name ??
      raw?.category
  )
}

function normalizeRecommendedProduct(raw: any): RecommendedProduct | null {
  if (!raw || typeof raw !== 'object') return null

  const id = String(raw.id ?? raw._id ?? '').trim()

  if (!id) return null

  const nom = String(raw.nom ?? raw.name ?? '').trim()

  if (!nom) return null

  const images = toStringArray(
    raw.images ??
      raw.image_url ??
      raw.thumbnail ??
      raw.photo
  )

  const prixUsd = positiveNumber(
    raw.prix_usd ??
      raw.price_usd ??
      raw.unit_price_usd
  )

  const prixCdf = positiveNumber(
    raw.prix ??
      raw.price ??
      raw.prix_cdf ??
      raw.price_cdf
  )

  const slug = textOrNull(raw.slug) ?? id

  const href =
    textOrNull(raw.href) ??
    `/produits/${encodeURIComponent(slug)}`

  return {
    ...raw,

    id,
    nom,
    slug,
    href,

    images,
    image_url:
      images[0] ??
      textOrNull(raw.image_url ?? raw.thumbnail ?? raw.photo) ??
      null,

    /*
     * IMPORTANT :
     * On ne convertit pas ici.
     * ProductCard + useExchangeRate() s’en chargent.
     */
    prix: prixCdf ?? 0,
    prix_usd: prixUsd ?? undefined,
    prix_cdf: prixCdf ?? undefined,

    categorie: getCategorieLabel(raw),
    category: getCategorieLabel(raw),

    note_moyenne:
      nullableNumber(raw.note_moyenne ?? raw.rating ?? raw.note) ?? undefined,
    rating:
      nullableNumber(raw.note_moyenne ?? raw.rating ?? raw.note) ?? undefined,

    avis_count:
      nullableNumber(
        raw.avis_count ??
          raw.reviews_count ??
          raw.total_evaluations ??
          raw.review_count
      ) ?? undefined,
    reviews_count:
      nullableNumber(
        raw.avis_count ??
          raw.reviews_count ??
          raw.total_evaluations ??
          raw.review_count
      ) ?? undefined,

    stock: nullableNumber(raw.stock) ?? undefined,
    rupture: Boolean(raw.rupture),
    est_actif: raw.est_actif !== false,

    total_ventes:
      nullableNumber(raw.total_ventes ?? raw.ventes ?? raw.sales) ?? undefined,

    discount:
      nullableNumber(
        raw.discount ??
          raw.remise_percent ??
          raw.discount_percent
      ) ?? undefined,

    badges: toStringArray(raw.badges),
    tags: raw.tags ?? undefined,

    delivery_config: raw.delivery_config ?? null,
    poids_kg: nullableNumber(raw.poids_kg ?? raw.weight_kg) ?? undefined,
    logistics_group:
      textOrNull(raw.logistics_group ?? raw.delivery_config?.logistics?.group) ??
      undefined,
    non_consolidable: Boolean(raw.non_consolidable),
  }
}

function normalizeRecommendedProducts(list: any): RecommendedProduct[] {
  if (!Array.isArray(list)) return []

  const seen = new Set<string>()
  const result: RecommendedProduct[] = []

  for (const raw of list) {
    const product = normalizeRecommendedProduct(raw)

    if (!product) continue
    if (seen.has(product.id)) continue

    seen.add(product.id)
    result.push(product)
  }

  return result
}

function extractProductList(payload: any): any[] {
  if (Array.isArray(payload)) return payload

  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.products)) return payload.products
  if (Array.isArray(payload?.recommendations)) return payload.recommendations

  if (Array.isArray(payload?.data?.products)) return payload.data.products
  if (Array.isArray(payload?.data?.recommendations)) return payload.data.recommendations
  if (Array.isArray(payload?.data?.data)) return payload.data.data

  if (Array.isArray(payload?.result)) return payload.result
  if (Array.isArray(payload?.results)) return payload.results

  return []
}

function getVisitedCategories(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(VISITED_CATEGORIES_KEY)

    if (!raw) return []

    const parsed = JSON.parse(raw)

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function recordVisitedCategory(category: string): void {
  if (typeof window === 'undefined') return

  const clean = String(category || '').trim()

  if (!clean) return

  try {
    const current = getVisitedCategories()
    const updated = [clean, ...current.filter((item) => item !== clean)].slice(0, 10)

    window.localStorage.setItem(
      VISITED_CATEGORIES_KEY,
      JSON.stringify(updated)
    )
  } catch {
    // stockage indisponible
  }
}

function PackageLikeIcon() {
  return (
    <span className="inline-flex items-center justify-center">
      <Layers size={20} className="text-emerald-400" />
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function Recommendations({
  type = 'trending',
  title,
  description,
  products: propProducts,
  maxItems = 5,
  seeMoreUrl,
  className,
  onRefresh,
  cardVariant = 'standard',
  carousel = true,
  category,
  similarToProductId,
  hideHeader = false,
  showCategoryFilter = false,
  reason,
  showTimer = false,
}: RecommendationsProps) {
  const { user } = useAuth()
  const pathname = usePathname()

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const style = typeStyles[type] || defaultStyle

  const hasPropProducts = propProducts !== undefined

  const normalizedPropProducts = useMemo(
    () => normalizeRecommendedProducts(propProducts),
    [propProducts]
  )

  const [fetchedProducts, setFetchedProducts] = useState<RecommendedProduct[]>([])
  const [loading, setLoading] = useState(!hasPropProducts)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [categories, setCategories] = useState<string[]>([])

  const showNotConnected =
    type === 'ai-personalized' &&
    !user &&
    !hasPropProducts

  const products = useMemo(
    () => (hasPropProducts ? normalizedPropProducts : fetchedProducts),
    [fetchedProducts, hasPropProducts, normalizedPropProducts]
  )

  /* ---------------------------------------------------------- */
  /* Chargement API                                              */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (hasPropProducts) {
      setLoading(false)
      setError(null)
      return
    }

    if (showNotConnected) {
      setFetchedProducts([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    const controller = new AbortController()

    const timeoutId = setTimeout(() => {
      controller.abort()
    }, FETCH_TIMEOUT_MS)

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()

        params.set('type', type)
        params.set('limit', String(maxItems))

        if (category) params.set('category', category)
        if (similarToProductId) params.set('product_id', similarToProductId)

        const url = `/api/recommendations?${params.toString()}`

        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        })

        if (!res.ok) {
          throw new Error(
            `Impossible de charger les recommandations (${res.status}).`
          )
        }

        const payload = await res.json()

        let list = extractProductList(payload)

        /*
         * Fallback :
         * si l’API recommandations ne renvoie rien,
         * on tente les meilleures ventes.
         */
        if (list.length === 0) {
          const fallbackParams = new URLSearchParams()

          fallbackParams.set('sort_by', 'total_ventes')
          fallbackParams.set('limit', String(maxItems))
          fallbackParams.set('est_actif', 'true')

          if (category) fallbackParams.set('categorie', category)

          const fallbackRes = await fetch(
            `/api/produits?${fallbackParams.toString()}`,
            {
              method: 'GET',
              credentials: 'include',
              cache: 'no-store',
              signal: controller.signal,
              headers: {
                Accept: 'application/json',
              },
            }
          )

          if (fallbackRes.ok) {
            const fallbackPayload = await fallbackRes.json()

            list = extractProductList(fallbackPayload)
          }
        }

        if (cancelled) return

        const normalized = normalizeRecommendedProducts(list).slice(0, maxItems)

        setFetchedProducts(normalized)
      } catch (err: any) {
        if (cancelled) return

        if (err?.name === 'AbortError') {
          setError('Requête expirée. Veuillez réessayer.')
        } else {
          setError(
            err?.message ||
              'Erreur lors du chargement des recommandations.'
          )
        }

        setFetchedProducts([])
      } finally {
        if (!cancelled) {
          setLoading(false)
        }

        clearTimeout(timeoutId)
      }
    }

    void run()

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [
    category,
    hasPropProducts,
    maxItems,
    retryCount,
    showNotConnected,
    similarToProductId,
    type,
  ])

  /* ---------------------------------------------------------- */
  /* Catégories pour filtre local                                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!showCategoryFilter) {
      setCategories([])
      return
    }

    const cats = Array.from(
      new Set(
        products
          .map((product) => product.categorie)
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b))

    setCategories(cats)

    if (
      selectedCategory !== 'all' &&
      cats.length > 0 &&
      !cats.includes(selectedCategory)
    ) {
      setSelectedCategory('all')
    }
  }, [products, selectedCategory, showCategoryFilter])

  useEffect(() => {
    if (!showCategoryFilter) return

    if (selectedCategory !== 'all') {
      recordVisitedCategory(selectedCategory)
    }
  }, [selectedCategory, showCategoryFilter])

  /* ---------------------------------------------------------- */
  /* Filtrage                                                    */
  /* ---------------------------------------------------------- */

  const filteredProducts = useMemo(() => {
    if (!showCategoryFilter || selectedCategory === 'all') {
      return products
    }

    return products.filter((product) => product.categorie === selectedCategory)
  }, [products, selectedCategory, showCategoryFilter])

  /* ---------------------------------------------------------- */
  /* Titres dynamiques                                           */
  /* ---------------------------------------------------------- */

  const dynamicTitle = useMemo(() => {
    if (title) return title

    switch (type) {
      case 'for-you':
        if (reason) return reason

        if (getVisitedCategories().length > 0) {
          return 'Inspiré par vos goûts'
        }

        return 'Recommandé pour vous'

      case 'ai-personalized':
        return 'Recommandations IA'

      case 'trending':
        return 'Tendances du moment'

      case 'best-sellers':
        return 'Meilleures ventes'

      case 'new-arrivals':
        return 'Nouveautés'

      case 'history':
        return 'Vu récemment'

      case 'similar-to-cart':
        return 'Similaire à votre panier'

      case 'cart-complementary':
        return 'Complétez votre commande'

      case 'hybrid':
        return 'Sélection personnalisée'

      case 'category-based':
        return category
          ? `Recommandé dans ${category}`
          : 'Recommandations par catégorie'

      case 'popular':
        return 'Populaire en ce moment'

      default:
        return 'Recommandations'
    }
  }, [category, reason, title, type])

  const dynamicDescription = useMemo(() => {
    if (description) return description

    switch (type) {
      case 'for-you':
      case 'ai-personalized': {
        const visited = getVisitedCategories()

        if (visited.length > 0) {
          return `Basé sur vos visites récentes : ${visited.slice(0, 2).join(', ')}`
        }

        return 'Des produits sélectionnés pour vous'
      }

      case 'trending':
        return 'Les produits les plus populaires en ce moment'

      case 'best-sellers':
        return 'Nos produits les plus vendus'

      case 'new-arrivals':
        return 'Les dernières nouveautés arrivées sur Gercie'

      case 'history':
        return 'Reprenez là où vous vous étiez arrêté'

      case 'similar-to-cart':
        return 'D’autres articles qui pourraient compléter votre panier'

      case 'cart-complementary':
        return 'Ajoutez ces articles pour optimiser votre livraison'

      case 'hybrid':
        return 'Un mélange de tendances et de recommandations personnelles'

      case 'category-based':
        return category
          ? `Une sélection dans la catégorie ${category}`
          : 'Une sélection adaptée à votre navigation'

      case 'popular':
        return 'Les articles plébiscités par la communauté'

      default:
        return ''
    }
  }, [category, description, type])

  /* ---------------------------------------------------------- */
  /* Carousel                                                    */
  /* ---------------------------------------------------------- */

  const scroll = useCallback((direction: 'left' | 'right') => {
    const container = scrollContainerRef.current

    if (!container) return

    const scrollAmount = 320

    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }, [])

  const canRefresh = Boolean(onRefresh) || !hasPropProducts

  const handleRefresh = useCallback(() => {
    onRefresh?.()
    setRetryCount((count) => count + 1)
  }, [onRefresh])

  /* ---------------------------------------------------------- */
  /* État non connecté                                           */
  /* ---------------------------------------------------------- */

  if (showNotConnected) {
    return (
      <section
        className={cn(
          'py-16 md:py-20 bg-neutral-50/50 dark:bg-midnight-900/30',
          className
        )}
      >
        <Container>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto flex max-w-md flex-col items-center text-center"
          >
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-purple-400/30 bg-gradient-to-br from-purple-400/20 to-pink-400/10">
              <Sparkles size={32} className="text-purple-400" />
            </div>

            <h2 className="mb-2 font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Des recommandations rien que pour vous
            </h2>

            <p className="mb-8 text-neutral-500 dark:text-neutral-400">
              Connectez-vous ou créez un compte pour recevoir des suggestions
              personnalisées basées sur vos goûts et votre historique.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Link href={`/login?redirect=${encodeURIComponent(pathname)}`}>
                <Button variant="luxe" size="lg" leftIcon={<LogIn size={18} />}>
                  Se connecter
                </Button>
              </Link>

              <Link href="/register">
                <Button
                  variant="outline-gold"
                  size="lg"
                  leftIcon={<UserPlus size={18} />}
                >
                  Créer un compte
                </Button>
              </Link>
            </div>
          </motion.div>
        </Container>
      </section>
    )
  }

  if (!loading && !error && filteredProducts.length === 0) {
    return null
  }

  const productCardVariant =
    cardVariant === 'compact' ? 'compact' : 'default'

  return (
    <section
      className={cn(
        'relative overflow-hidden py-16 md:py-20',
        'bg-gradient-to-br',
        style.bg,
        className
      )}
    >
      {/* Décoration légère */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      <Container>
        {/* En-tête */}
        {!hideHeader && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
          >
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div
                  className={cn(
                    'rounded-lg border bg-neutral-100 p-2 dark:bg-neutral-800',
                    style.border
                  )}
                >
                  {style.icon}
                </div>

                <h2 className="font-serif text-2xl font-bold text-neutral-900 md:text-3xl dark:text-neutral-100">
                  {dynamicTitle}
                </h2>

                {type === 'trending' && (
                  <Badge variant="danger" size="sm" className="animate-pulse">
                    <Flame size={12} className="mr-1" />
                    Chaud
                  </Badge>
                )}

                {(type === 'for-you' || type === 'ai-personalized') && (
                  <Badge variant="accent" size="sm">
                    <Sparkles size={12} className="mr-1" />
                    Pour vous
                  </Badge>
                )}

                {showTimer &&
                  (type === 'trending' ||
                    type === 'hybrid' ||
                    type === 'cart-complementary') && (
                    <Badge variant="warning" size="sm">
                      <Clock size={12} className="mr-1" />
                      Offre limitée
                    </Badge>
                  )}
              </div>

              {dynamicDescription && (
                <p className="mt-1 text-sm text-neutral-500 md:text-base dark:text-neutral-400">
                  {dynamicDescription}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {canRefresh && (
                <Tooltip content="Actualiser les recommandations">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    leftIcon={<RefreshCw size={14} />}
                  >
                    Actualiser
                  </Button>
                </Tooltip>
              )}

              {showCategoryFilter && categories.length > 1 && (
                <select
                  value={selectedCategory}
                  onChange={(event) =>
                    setSelectedCategory(event.target.value)
                  }
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
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

              {seeMoreUrl && products.length > 0 && (
                <Link
                  href={seeMoreUrl}
                  className="group inline-flex items-center text-sm font-medium text-gold-600 hover:underline dark:text-gold-400"
                >
                  Voir tout
                  <ChevronRight
                    size={16}
                    className="ml-1 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              )}
            </div>
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide md:grid md:grid-cols-3 md:overflow-visible lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: Math.max(1, maxItems) }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="min-w-[220px] flex-shrink-0 md:min-w-0"
              >
                <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <Skeleton className="mb-3 aspect-square w-full rounded-xl" />
                  <Skeleton className="mb-2 h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="max-w-md rounded-2xl border border-burgundy-200 bg-burgundy-50 p-8 dark:border-burgundy-800 dark:bg-burgundy-900/20">
              <AlertTriangle
                size={32}
                className="mx-auto mb-4 text-burgundy-500"
              />

              <p className="mb-4 text-sm text-burgundy-700 dark:text-burgundy-300">
                {error}
              </p>

              <Button
                variant="danger"
                size="sm"
                onClick={() => setRetryCount((count) => count + 1)}
                leftIcon={<RefreshCw size={16} />}
              >
                Réessayer
              </Button>
            </div>
          </div>
        )}

        {/* Produits */}
        {!loading && !error && filteredProducts.length > 0 && (
          <div className="group relative">
            {carousel && filteredProducts.length > 2 && (
              <>
                <button
                  type="button"
                  onClick={() => scroll('left')}
                  className="absolute -left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-neutral-600 opacity-0 shadow-xl transition hover:bg-gold-100 focus:outline-none focus:ring-2 focus:ring-gold-500 group-hover:opacity-100 md:hidden dark:bg-neutral-800/90 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  aria-label="Défiler à gauche"
                >
                  <ArrowLeft size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => scroll('right')}
                  className="absolute -right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-neutral-600 opacity-0 shadow-xl transition hover:bg-gold-100 focus:outline-none focus:ring-2 focus:ring-gold-500 group-hover:opacity-100 md:hidden dark:bg-neutral-800/90 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  aria-label="Défiler à droite"
                >
                  <ArrowRight size={18} />
                </button>
              </>
            )}

            <div
              ref={scrollContainerRef}
              className={cn(
                'flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 scrollbar-hide',
                'md:grid md:snap-none md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0',
                'lg:grid-cols-4 xl:grid-cols-5'
              )}
            >
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id || `recommendation-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="w-[220px] min-w-[220px] flex-shrink-0 snap-start md:w-auto md:min-w-0"
                >
                  <ProductCard
                    product={product}
                    variant={productCardVariant}
                    showVendor
                    showCategory
                    showRatings
                    showStockInfo
                    showActions
                    showQuickView={false}
                    showShareButton
                  />
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </Container>
    </section>
  )
}

export default Recommendations