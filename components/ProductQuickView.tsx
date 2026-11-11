// components/ProductQuickView.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  Info,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Share2,
  Shield,
  ShoppingCart,
  Star,
  Truck,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'

import ProductVariants, {
  type Variant,
} from '@/components/ProductVariants'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'

import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useFavorites } from '@/hooks/useFavorites'

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

type Currency = 'USD' | 'CDF'

interface SimpleVariantOption {
  id: string
  label: string
  options: string[]
}

interface NormalizedQuickProduct {
  id: string
  nom: string
  slug: string
  href: string

  images: string[]
  image_url: string | null

  priceUsd: number
  priceCdf: number

  originalPriceUsd: number
  originalPriceCdf: number

  discount: number

  savingsUsd: number
  savingsCdf: number

  stock: number | null
  available: boolean

  note_moyenne: number | null
  avis_count: number | null

  categorie: string | null
  vendeur_label: string | null
  description: string | null

  variants: Variant[]
  simpleVariants: SimpleVariantOption[]

  delivery_config?: any
  poids_kg?: number | null
  logistics_group?: string | null
  non_consolidable?: boolean

  created_at?: string | null

  [key: string]: any
}

interface ProductQuickViewProps {
  productId: string
  onClose: () => void
  isOpen?: boolean

  /**
   * Optionnel : produit déjà chargé depuis ProductCard / grille.
   * Perite d’éviter un fetch immédiat.
   */
  initialProduct?: any
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PLACEHOLDER = '/placeholder.jpg'
const CART_ADDED_DURATION = 2000
const LOW_STOCK_THRESHOLD = 5

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
  if (typeof value !== 'string') return null

  const trimmed = value.trim()

  return trimmed ? trimmed : null
}

function safeJsonParse(value: any): any {
  if (!value) return null

  if (typeof value === 'object') return value

  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
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

function getCurrentPath(fallback = '/'): string {
  if (typeof window === 'undefined') return fallback

  const path = `${window.location.pathname}${window.location.search}`

  if (path.startsWith('/login')) return '/'

  return path
}

function formatRating(value: number | null | undefined): string {
  const n = Number(value ?? 0)

  if (!Number.isFinite(n) || n <= 0) return '—'

  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function buildVariantLabel(attributes: Record<string, string>): string {
  return Object.values(attributes || {})
    .filter(Boolean)
    .map(String)
    .join(' • ')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION PRODUIT                                          */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeVariantAttributes(value: any): Record<string, string> {
  const raw = safeJsonParse(value) ?? value

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }

  const entries = Object.entries(raw)
    .map(([key, val]) => [String(key || '').trim(), String(val ?? '').trim()] as const)
    .filter(([key, val]) => Boolean(key) && Boolean(val))

  return Object.fromEntries(entries)
}

function normalizeVariants(raw: any): Variant[] {
  const parsed = safeJsonParse(raw?.variantes) ?? raw?.variantes

  if (!Array.isArray(parsed)) return []

  return parsed
    .map((item: any) => {
      const attributes = normalizeVariantAttributes(item?.attributes)

      if (Object.keys(attributes).length === 0) return null

      const stock = nonNegativeNumber(item?.stock) ?? 0

      const images = toStringArray(item?.images ?? item?.image)

      return {
        ...item,
        id: item?.id ? String(item.id) : undefined,
        attributes,
        stock,
        image: item?.image ?? images[0] ?? null,
        images,
        poids_kg: nonNegativeNumber(item?.poids_kg ?? item?.weight_kg),
      } as Variant
    })
    .filter(Boolean) as Variant[]
}

function normalizeSimpleVariants(raw: any): SimpleVariantOption[] {
  const parsed = safeJsonParse(raw?.variants) ?? raw?.variants

  if (!Array.isArray(parsed)) return []

  return parsed
    .map((item: any) => {
      const id = textOrNull(item?.id)
      const label = textOrNull(item?.label) ?? id

      const options = Array.isArray(item?.options)
        ? item.options.map((option: any) => String(option ?? '').trim()).filter(Boolean)
        : []

      if (!id || options.length === 0) return null

      return {
        id,
        label: label || id,
        options,
      }
    })
    .filter(Boolean) as SimpleVariantOption[]
}

/**
 * Règle prix :
 *
 * - prix_usd = source principale
 * - prix_cdf = conversion calculée
 * - si seulement prix CDF existe, on dérive un prix USD temporaire
 * - si prix_usd et prix_cdf existent mais divergent, prix_usd gagne
 */
function normalizeQuickProduct(
  raw: any,
  rate?: number | null
): NormalizedQuickProduct | null {
  if (!raw || typeof raw !== 'object') return null

  const id = String(raw.id ?? raw._id ?? '').trim()

  if (!id) return null

  const nom = String(raw.nom ?? raw.name ?? '').trim()

  if (!nom) return null

  const rateNumber = positiveNumber(rate)
  const rateOk = rateNumber != null && rateNumber > 0

  /* ---------------------------------------------------------- */
  /* Prix courant                                                */
  /* ---------------------------------------------------------- */

  const rawUsd = positiveNumber(
    raw.prix_usd ??
      raw.price_usd ??
      raw.unit_price_usd
  )

  const rawCdf = positiveNumber(
    raw.prix ??
      raw.price ??
      raw.prix_cdf ??
      raw.price_cdf
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

  const rawOriginalUsd = positiveNumber(
    raw.prix_usd_original ??
      raw.original_price_usd ??
      raw.prix_initial_usd
  )

  const rawOriginalCdf = positiveNumber(
    raw.prix_original ??
      raw.original_price ??
      raw.original_price_cdf ??
      raw.prix_initial ??
      raw.prix_comparatif
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
        Number(
          raw.discount ??
            raw.remise_percent ??
            raw.discount_percent ??
            0
        ) || 0
      )
    )
  )

  if (
    discount === 0 &&
    originalUsd > 0 &&
    priceUsd > 0 &&
    originalUsd > priceUsd
  ) {
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
  /* Économies                                                  */
  /* ---------------------------------------------------------- */

  const savingsUsd = Math.max(0, roundUsd(originalUsd - priceUsd))

  const savingsCdf =
    savingsUsd > 0 && rateOk
      ? toCdf(savingsUsd, rateNumber)
      : Math.max(0, roundCdf(originalCdf - priceCdf))

  /* ---------------------------------------------------------- */
  /* Stock / disponibilité                                      */
  /* ---------------------------------------------------------- */

  const stock = nonNegativeNumber(raw.stock)

  const rupture =
    Boolean(raw.rupture) ||
    stock === 0 ||
    raw.est_actif === false

  const available = !rupture && raw.est_actif !== false

  /* ---------------------------------------------------------- */
  /* Médias                                                     */
  /* ---------------------------------------------------------- */

  const images = toStringArray(
    raw.images ??
      raw.image_url ??
      raw.thumbnail ??
      raw.photo
  )

  const image_url =
    images[0] ??
    textOrNull(raw.image_url ?? raw.thumbnail ?? raw.photo) ??
    null

  /* ---------------------------------------------------------- */
  /* Métadonnées                                                */
  /* ---------------------------------------------------------- */

  const slug = textOrNull(raw.slug) ?? id
  const href = textOrNull(raw.href) ?? `/produits/${slug}`

  const note_moyenne = nonNegativeNumber(
    raw.note_moyenne ??
      raw.note ??
      raw.rating ??
      raw.average_rating
  )

  const avis_count = nonNegativeNumber(
    raw.avis_count ??
      raw.total_evaluations ??
      raw.reviews_count ??
      raw.review_count
  )

  const categorie =
    typeof raw.categorie === 'string'
      ? raw.categorie
      : textOrNull(
          raw.categorie?.nom ??
            raw.categorie?.name ??
            raw.category
        )

  const vendeur_label =
    textOrNull(raw.vendeur?.boutique_nom) ||
    [
      textOrNull(raw.vendeur?.prenom),
      textOrNull(raw.vendeur?.nom),
    ]
      .filter(Boolean)
      .join(' ') ||
    'Vendu par Gercie'

  const description = textOrNull(raw.description)

  /* ---------------------------------------------------------- */
  /* Livraison                                                  */
  /* ---------------------------------------------------------- */

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

    priceUsd,
    priceCdf,

    originalPriceUsd: originalUsd,
    originalPriceCdf: originalCdf,

    discount,

    savingsUsd,
    savingsCdf,

    stock,
    available,

    note_moyenne,
    avis_count,

    categorie,
    vendeur_label,
    description,

    variants: normalizeVariants(raw),
    simpleVariants: normalizeSimpleVariants(raw),

    delivery_config: deliveryConfig,
    poids_kg: nonNegativeNumber(raw.poids_kg ?? raw.weight_kg),
    logistics_group: logisticsGroup,
    non_consolidable: nonConsolidable,

    created_at: textOrNull(raw.created_at ?? raw.createdAt),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export default function ProductQuickView({
  productId,
  onClose,
  isOpen = true,
  initialProduct,
}: ProductQuickViewProps) {
  const router = useRouter()

  const { user, loading: authLoading } = useAuth()
  const cart = useCart() as any
  const toast = useToast() as any
  const favorites = useFavorites() as any
  const { rate } = useExchangeRate()

  const initialProductRef = useRef(initialProduct)

  const [mounted, setMounted] = useState(false)
  const [rawProduct, setRawProduct] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)

  const [selectedVariantAttributes, setSelectedVariantAttributes] = useState<
    Record<string, string>
  >({})
  const [selectedSimpleAttributes, setSelectedSimpleAttributes] = useState<
    Record<string, string>
  >({})
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)

  const [isAdding, setIsAdding] = useState(false)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    initialProductRef.current = initialProduct
  }, [initialProduct])

  /* ---------------------------------------------------------- */
  /* Reset quand le produit change                              */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    setSelectedImageIndex(0)
    setQuantity(1)
    setSelectedVariantAttributes({})
    setSelectedSimpleAttributes({})
    setSelectedVariant(null)
    setAdded(false)
    setIsAdding(false)
  }, [productId])

  /* ---------------------------------------------------------- */
  /* Chargement produit                                         */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!isOpen || !productId) return

    const preloaded = initialProductRef.current

    if (preloaded && String(preloaded.id ?? '') === String(productId)) {
      setRawProduct(preloaded)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    const controller = new AbortController()

    setLoading(true)
    setError(null)

    fetch(`/api/produits/${encodeURIComponent(productId)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))

          throw new Error(
            body?.error ||
              `Impossible de charger ce produit (${res.status}).`
          )
        }

        return res.json()
      })
      .then((json) => {
        if (cancelled) return

        const data =
          json?.product ??
          json?.data ??
          json?.result ??
          json

        if (!data || typeof data !== 'object' || !data.id) {
          throw new Error('Produit introuvable.')
        }

        setRawProduct(data)
      })
      .catch((err: any) => {
        if (cancelled) return

        if (err?.name === 'AbortError') return

        setError(err?.message || 'Erreur lors du chargement du produit.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isOpen, productId])

  /* ---------------------------------------------------------- */
  /* Taux sécurisé après hydratation                            */
  /* ---------------------------------------------------------- */

  const safeRate = mounted ? positiveNumber(rate) : null

  const normalized = useMemo(
    () => normalizeQuickProduct(rawProduct, safeRate),
    [rawProduct, safeRate]
  )

  /* ---------------------------------------------------------- */
  /* Variantes                                                  */
  /* ---------------------------------------------------------- */

  const variantObjects = useMemo(
    () => normalized?.variants ?? [],
    [normalized?.variants]
  )

  const simpleVariants = useMemo(
    () => normalized?.simpleVariants ?? [],
    [normalized?.simpleVariants]
  )

  const hasRealVariants = variantObjects.length > 0
  const hasSimpleVariants = !hasRealVariants && simpleVariants.length > 0

  const currentVariant = useMemo(() => {
    if (!hasRealVariants) return null

    const entries = Object.entries(selectedVariantAttributes || {}).filter(
      ([key, value]) => Boolean(key) && Boolean(value)
    )

    if (entries.length === 0) return null

    return (
      variantObjects.find((variant) =>
        entries.every(([key, value]) => {
          return variant.attributes?.[key] === value
        })
      ) || null
    )
  }, [hasRealVariants, selectedVariantAttributes, variantObjects])

  const handleVariantAttributeChange = useCallback(
    (attributeName: string, value: string) => {
      setSelectedVariantAttributes((prev) => ({
        ...prev,
        [attributeName]: value,
      }))
    },
    []
  )

  const handleVariantObjectChange = useCallback((variant: Variant | null) => {
    setSelectedVariant(variant)
  }, [])

  const handleSimpleVariantChange = useCallback(
    (variantId: string, option: string) => {
      setSelectedSimpleAttributes((prev) => ({
        ...prev,
        [variantId]: option,
      }))
    },
    []
  )

  /* ---------------------------------------------------------- */
  /* Prix final avec variante                                   */
  /* ---------------------------------------------------------- */

  const baseUsd = normalized?.priceUsd ?? 0
  const baseCdf = normalized?.priceCdf ?? 0

  const variantUsd = positiveNumber(
    currentVariant?.prix_specifique_usd ??
      currentVariant?.price_specifique_usd
  )

  const variantCdf = positiveNumber(
    currentVariant?.prix_specifique_cdf ??
      currentVariant?.price_specifique_cdf ??
      currentVariant?.prix_specifique ??
      currentVariant?.price_specifique ??
      currentVariant?.prix ??
      currentVariant?.price
  )

  const finalPrices = useMemo(() => {
    let usd = variantUsd ?? 0
    let cdf = variantCdf ?? 0

    if (usd <= 0 && cdf <= 0) {
      usd = baseUsd
      cdf = baseCdf
    }

    if (usd > 0 && safeRate != null && safeRate > 0) {
      cdf = toCdf(usd, safeRate)
    } else if (cdf > 0 && safeRate != null && safeRate > 0) {
      usd = toUsd(cdf, safeRate)
    }

    return {
      usd: roundUsd(usd),
      cdf: roundCdf(cdf),
    }
  }, [baseCdf, baseUsd, safeRate, variantCdf, variantUsd])

  const finalUsd = finalPrices.usd
  const finalCdf = finalPrices.cdf

  const originalUsd = normalized?.originalPriceUsd ?? 0
  const originalCdf = normalized?.originalPriceCdf ?? 0

  const primaryCurrency: Currency = finalUsd > 0 ? 'USD' : 'CDF'
  const secondaryCurrency: Currency =
    primaryCurrency === 'USD' ? 'CDF' : 'USD'

  const primaryAmount =
    primaryCurrency === 'USD' ? finalUsd : finalCdf

  const secondaryAmount =
    secondaryCurrency === 'USD' ? finalUsd : finalCdf

  const originalPrimaryAmount =
    primaryCurrency === 'USD' ? originalUsd : originalCdf

  const hasPrice = primaryAmount > 0

  const showOriginal =
    originalPrimaryAmount > primaryAmount &&
    originalPrimaryAmount > 0

  const savingsPrimary = Math.max(
    0,
    roundUsdOrCdf(
      originalPrimaryAmount - primaryAmount,
      primaryCurrency
    )
  )

  const displayPrimary = hasPrice
    ? primaryCurrency === 'USD'
      ? formatUsd(primaryAmount)
      : formatCdf(primaryAmount)
    : 'Prix sur demande'

  const displaySecondary =
    hasPrice && secondaryAmount > 0 && secondaryAmount !== primaryAmount
      ? `≈ ${
          secondaryCurrency === 'USD'
            ? formatUsd(secondaryAmount)
            : formatCdf(secondaryAmount)
        }`
      : null

  const displayOriginal = showOriginal
    ? primaryCurrency === 'USD'
      ? formatUsd(originalPrimaryAmount)
      : formatCdf(originalPrimaryAmount)
    : null

  const displaySavings =
    savingsPrimary > 0
      ? `−${
          primaryCurrency === 'USD'
            ? formatUsd(savingsPrimary)
            : formatCdf(savingsPrimary)
        }`
      : null

  /* ---------------------------------------------------------- */
  /* Stock effectif                                             */
  /* ---------------------------------------------------------- */

  const variantStock =
    hasRealVariants && currentVariant
      ? nonNegativeNumber(currentVariant.stock)
      : null

  const effectiveStock =
    variantStock != null
      ? variantStock
      : normalized?.stock ?? null

  const isOutOfStock = effectiveStock === 0

  const maxQuantity =
    effectiveStock != null && effectiveStock > 0
      ? effectiveStock
      : 99

  const canAddToCart = Boolean(
    normalized &&
      normalized.available &&
      !isOutOfStock &&
      hasPrice &&
      !isAdding
  )

  useEffect(() => {
    if (quantity > maxQuantity) {
      setQuantity(Math.max(1, maxQuantity))
    }
  }, [maxQuantity, quantity])

  /* ---------------------------------------------------------- */
  /* Label variante                                             */
  /* ---------------------------------------------------------- */

  const variantLabel = useMemo(() => {
    if (hasRealVariants) {
      return buildVariantLabel(selectedVariantAttributes)
    }

    if (hasSimpleVariants) {
      return buildVariantLabel(selectedSimpleAttributes)
    }

    return ''
  }, [
    hasRealVariants,
    hasSimpleVariants,
    selectedSimpleAttributes,
    selectedVariantAttributes,
  ])

  /* ---------------------------------------------------------- */
  /* Images                                                     */
  /* ---------------------------------------------------------- */

  const images = useMemo(
    () => normalized?.images ?? [],
    [normalized?.images]
  )

  const currentImage =
    images[selectedImageIndex] ||
    normalized?.image_url ||
    PLACEHOLDER

  const prevImage = useCallback(() => {
    if (images.length <= 1) return

    setSelectedImageIndex((prev) =>
      prev <= 0 ? images.length - 1 : prev - 1
    )
  }, [images.length])

  const nextImage = useCallback(() => {
    if (images.length <= 1) return

    setSelectedImageIndex((prev) =>
      prev >= images.length - 1 ? 0 : prev + 1
    )
  }, [images.length])

  useEffect(() => {
    if (!isOpen || images.length <= 1) return

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        prevImage()
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        nextImage()
      }
    }

    window.addEventListener('keydown', handleKey)

    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, images.length, nextImage, prevImage])

  /* ---------------------------------------------------------- */
  /* Auth                                                       */
  /* ---------------------------------------------------------- */

  const requireAuth = useCallback(
    (message: string) => {
      if (authLoading) {
        toast?.addToast?.({
          type: 'info',
          message: 'Connexion en cours, veuillez patienter…',
        })

        return false
      }

      if (user) return true

      toast?.addToast?.({
        type: 'warning',
        message,
      })

      router.push(
        `/login?redirect=${encodeURIComponent(getCurrentPath('/'))}`
      )

      return false
    },
    [authLoading, router, toast, user]
  )

  /* ---------------------------------------------------------- */
  /* Favoris                                                    */
  /* ---------------------------------------------------------- */

  const isFavorite =
    mounted &&
    Boolean(user) &&
    Boolean(favorites?.isFavorite?.(productId))

  const handleFavorite = useCallback(() => {
    if (!normalized) return

    if (
      !requireAuth(
        'Veuillez vous connecter pour gérer vos favoris.'
      )
    ) {
      return
    }

    const wasFavorite = isFavorite

    favorites?.toggleFavorite?.(productId, normalized)

    toast?.addToast?.({
      type: wasFavorite ? 'info' : 'success',
      message: wasFavorite
        ? 'Retiré des favoris'
        : 'Ajouté aux favoris',
    })
  }, [
    favorites,
    isFavorite,
    normalized,
    productId,
    requireAuth,
    toast,
  ])

  /* ---------------------------------------------------------- */
  /* Partage                                                    */
  /* ---------------------------------------------------------- */

  const handleShare = useCallback(async () => {
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

        return
      }

      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(url)

        toast?.addToast?.({
          type: 'success',
          message: 'Lien copié',
        })
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast?.addToast?.({
          type: 'error',
          message: 'Partage impossible',
        })
      }
    }
  }, [normalized, toast])

  /* ---------------------------------------------------------- */
  /* Ajout au panier                                            */
  /* ---------------------------------------------------------- */

  const handleAddToCart = useCallback(async () => {
    if (!normalized || isAdding) return

    if (!canAddToCart) return

    if (
      !requireAuth(
        'Veuillez vous connecter pour ajouter au panier.'
      )
    ) {
      return
    }

    const qty = Math.max(
      1,
      Math.min(Number(quantity) || 1, maxQuantity)
    )

    const variantePayload = hasRealVariants
      ? currentVariant
        ? {
            id: currentVariant.id,
            attributes: currentVariant.attributes,
            prix: finalCdf,
            prix_specifique: variantCdf ?? undefined,
            prix_specifique_usd: variantUsd ?? undefined,
            prix_specifique_cdf: variantCdf ?? undefined,
            image:
              currentVariant.image ||
              currentVariant.images?.[0] ||
              null,
            images: currentVariant.images ?? [],
            stock: currentVariant.stock,
            poids_kg: currentVariant.poids_kg ?? null,
          }
        : undefined
      : hasSimpleVariants && Object.keys(selectedSimpleAttributes).length > 0
        ? {
            attributes: selectedSimpleAttributes,
          }
        : undefined

    const payload = {
      id: normalized.id,
      product_id: normalized.id,
      nom: normalized.nom,

      prix: finalCdf > 0 ? finalCdf : normalized.priceCdf,
      prix_usd: finalUsd > 0 ? finalUsd : normalized.priceUsd,
      unit_price_usd: finalUsd > 0 ? finalUsd : normalized.priceUsd,

      quantite: qty,

      image: currentImage,
      images: normalized.images,

      specifications: variantLabel || undefined,
      variante: variantePayload,

      delivery_config: normalized.delivery_config ?? null,
      poids_kg:
        currentVariant?.poids_kg ??
        normalized.poids_kg ??
        null,

      logistics_group:
        normalized.logistics_group ??
        normalized.delivery_config?.logistics?.group ??
        null,

      non_consolidable:
        normalized.non_consolidable ?? false,
    } as any

    const addFn = cart?.addItem || cart?.addToCart

    if (typeof addFn !== 'function') {
      toast?.addToast?.({
        type: 'error',
        message: 'Le panier est momentanément indisponible.',
      })

      return
    }

    setIsAdding(true)

    try {
      await addFn(payload, qty)

      setAdded(true)

      toast?.addToast?.({
        type: 'success',
        message: `${normalized.nom} ajouté au panier`,
      })

      setTimeout(() => {
        setAdded(false)
      }, CART_ADDED_DURATION)
    } catch (err: any) {
      toast?.addToast?.({
        type: 'error',
        message:
          err?.message ||
          "Impossible d'ajouter ce produit au panier.",
      })
    } finally {
      setIsAdding(false)
    }
  }, [
    canAddToCart,
    cart,
    currentImage,
    currentVariant,
    finalCdf,
    finalUsd,
    hasRealVariants,
    hasSimpleVariants,
    isAdding,
    maxQuantity,
    normalized,
    quantity,
    requireAuth,
    selectedSimpleAttributes,
    toast,
    variantCdf,
    variantLabel,
    variantUsd,
  ])

  /* ---------------------------------------------------------- */
  /* Rendu                                                      */
  /* ---------------------------------------------------------- */

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="3xl"
      accent="gold"
      showCloseButton={false}
      className="overflow-hidden"
    >
      {loading ? (
        <div className="flex min-h-[420px] items-center justify-center p-8">
          <Loader2
            size={32}
            className="animate-spin text-gold-500"
          />
        </div>
      ) : error ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-red-500">{error}</p>

          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      ) : normalized ? (
        <div className="flex flex-col md:flex-row">
          {/* ================================================= */}
          {/* IMAGES                                              */}
          {/* ================================================= */}

          <div className="relative flex w-full items-center justify-center overflow-hidden bg-neutral-100 md:w-1/2 dark:bg-midnight-800">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedImageIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative aspect-square w-full"
              >
                <Image
                  src={currentImage || PLACEHOLDER}
                  alt={normalized.nom}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority={selectedImageIndex === 0}
                />
              </motion.div>
            </AnimatePresence>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/70 p-2 text-neutral-700 transition hover:bg-white dark:bg-black/40 dark:text-white dark:hover:bg-black/60"
                  aria-label="Image précédente"
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  type="button"
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/70 p-2 text-neutral-700 transition hover:bg-white dark:bg-black/40 dark:text-white dark:hover:bg-black/60"
                  aria-label="Image suivante"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}

            {images.length > 1 && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                {images.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => setSelectedImageIndex(index)}
                    className={cn(
                      'h-2 rounded-full transition-all',
                      index === selectedImageIndex
                        ? 'w-4 bg-gold-500'
                        : 'w-2 bg-white/70'
                    )}
                    aria-label={`Voir image ${index + 1}`}
                  />
                ))}
              </div>
            )}

            {normalized.discount > 0 && (
              <Badge
                variant="danger"
                className="absolute left-3 top-3 animate-pulse"
              >
                -{normalized.discount}%
              </Badge>
            )}

            {isOutOfStock && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-semibold text-white">
                Rupture de stock
              </div>
            )}
          </div>

          {/* ================================================= */}
          {/* DÉTAILS                                           */}
          {/* ================================================= */}

          <div className="flex flex-1 flex-col justify-between p-6 md:p-8">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {normalized.categorie && (
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {normalized.categorie}
                    </p>
                  )}

                  <h2 className="mt-1 text-2xl font-bold text-foreground">
                    {normalized.nom}
                  </h2>

                  {normalized.vendeur_label && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {normalized.vendeur_label}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Rating */}
              {normalized.note_moyenne != null &&
                normalized.note_moyenne > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex items-center text-amber-500">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          size={16}
                          className={
                            index <
                            Math.floor(Number(normalized.note_moyenne))
                              ? 'fill-current'
                              : 'text-neutral-300'
                          }
                        />
                      ))}
                    </div>

                    <span className="text-sm font-medium">
                      {formatRating(normalized.note_moyenne)}
                    </span>

                    {normalized.avis_count != null && (
                      <span className="text-sm text-muted-foreground">
                        ({normalized.avis_count} avis)
                      </span>
                    )}
                  </div>
                )}

              {/* Prix */}
              <div className="mt-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={cn(
                      'text-3xl font-bold',
                      showOriginal
                        ? 'text-gold-600'
                        : 'text-foreground'
                    )}
                  >
                    {displayPrimary}
                  </span>

                  {displayOriginal && (
                    <span className="text-lg text-muted-foreground line-through">
                      {displayOriginal}
                    </span>
                  )}

                  {normalized.discount > 0 && (
                    <Badge variant="danger" size="sm">
                      -{normalized.discount}%
                    </Badge>
                  )}

                  {displaySavings && (
                    <Badge variant="success" size="sm">
                      {displaySavings}
                    </Badge>
                  )}
                </div>

                {displaySecondary && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {displaySecondary}
                  </p>
                )}

                {!hasPrice && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Contactez-nous pour obtenir un prix.
                  </p>
                )}
              </div>

              {/* Variantes réelles Supabase */}
              {hasRealVariants && (
                <div className="mt-5">
                  <ProductVariants
                    variants={variantObjects}
                    selectedAttributes={selectedVariantAttributes}
                    onAttributeChange={handleVariantAttributeChange}
                    onVariantChange={handleVariantObjectChange}
                    basePriceUsd={baseUsd}
                    basePriceCdf={baseCdf}
                    showPrice={false}
                    showStock={false}
                    size="md"
                    preferredCurrency="USD"
                  />
                </div>
              )}

              {/* Ancien format de variantes simplifiées */}
              {hasSimpleVariants && (
                <div className="mt-5 space-y-4">
                  {simpleVariants.map((variant) => (
                    <div key={variant.id}>
                      <p className="mb-2 text-sm font-medium capitalize text-foreground">
                        {variant.label}

                        {selectedSimpleAttributes[variant.id] && (
                          <span className="ml-1 text-gold-600">
                            : {selectedSimpleAttributes[variant.id]}
                          </span>
                        )}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {variant.options.map((option) => {
                          const selected =
                            selectedSimpleAttributes[variant.id] ===
                            option

                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() =>
                                handleSimpleVariantChange(
                                  variant.id,
                                  option
                                )
                              }
                              className={cn(
                                'rounded-full border px-3 py-1.5 text-sm transition-all',
                                selected
                                  ? 'border-gold-500 bg-gold-50 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300'
                                  : 'border-neutral-200 hover:border-gold-400 dark:border-neutral-700'
                              )}
                              aria-pressed={selected}
                            >
                              {option}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quantité + stock */}
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <div className="inline-flex items-center rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((prev) => Math.max(1, prev - 1))
                    }
                    disabled={quantity <= 1 || isOutOfStock}
                    className="p-2 transition hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
                    aria-label="Diminuer la quantité"
                  >
                    <Minus size={16} />
                  </button>

                  <span className="w-12 text-center font-medium">
                    {quantity}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((prev) =>
                        Math.min(maxQuantity, prev + 1)
                      )
                    }
                    disabled={quantity >= maxQuantity || isOutOfStock}
                    className="p-2 transition hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
                    aria-label="Augmenter la quantité"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {isOutOfStock ? (
                  <p className="text-sm text-red-500">
                    Rupture de stock
                  </p>
                ) : effectiveStock != null &&
                  effectiveStock <= LOW_STOCK_THRESHOLD ? (
                  <p className="text-sm text-amber-500">
                    Plus que {effectiveStock} en stock
                  </p>
                ) : (
                  <p className="text-sm text-green-500">
                    En stock
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  variant="luxe"
                  size="lg"
                  className="min-w-[220px] flex-1"
                  onClick={handleAddToCart}
                  loading={isAdding}
                  disabled={!canAddToCart}
                  leftIcon={
                    added ? (
                      <Check size={18} />
                    ) : (
                      <ShoppingCart size={18} />
                    )
                  }
                >
                  {added
                    ? 'Ajouté !'
                    : isOutOfStock
                      ? 'Indisponible'
                      : !hasPrice
                        ? 'Sur demande'
                        : 'Ajouter au panier'}
                </Button>

                <Tooltip
                  content={
                    isFavorite
                      ? 'Retirer des favoris'
                      : 'Ajouter aux favoris'
                  }
                >
                  <Button
                    variant="outline-gold"
                    size="icon"
                    className="h-12 w-12"
                    onClick={handleFavorite}
                    aria-label={
                      isFavorite
                        ? 'Retirer des favoris'
                        : 'Ajouter aux favoris'
                    }
                  >
                    <Heart
                      size={18}
                      className={
                        isFavorite
                          ? 'fill-gold-500 text-gold-500'
                          : undefined
                      }
                    />
                  </Button>
                </Tooltip>

                <Tooltip content="Partager">
                  <Button
                    variant="outline-gold"
                    size="icon"
                    className="h-12 w-12"
                    onClick={handleShare}
                    aria-label="Partager"
                  >
                    <Share2 size={18} />
                  </Button>
                </Tooltip>

                <Tooltip content="Voir la fiche complète">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12"
                    onClick={() => {
                      router.push(normalized.href)
                      onClose()
                    }}
                    aria-label="Voir la fiche complète"
                  >
                    <ExternalLink size={18} />
                  </Button>
                </Tooltip>
              </div>

              {variantLabel && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Variante : {variantLabel}
                </p>
              )}

              {normalized.description && (
                <div className="mt-5 rounded-2xl border border-border bg-background/50 p-4">
                  <p className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground">
                    <Info size={14} className="text-gold-500" />
                    Description
                  </p>

                  <p className="line-clamp-4 text-sm text-muted-foreground">
                    {normalized.description}
                  </p>
                </div>
              )}
            </div>

            {/* Infos livraison & garantie */}
            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-700">
              <div className="flex flex-col items-center gap-1 text-center">
                <Truck size={20} className="text-gold-500" />

                <span className="text-xs text-muted-foreground">
                  Livraison rapide
                </span>
              </div>

              <div className="flex flex-col items-center gap-1 text-center">
                <Shield size={20} className="text-gold-500" />

                <span className="text-xs text-muted-foreground">
                  Garantie
                </span>
              </div>

              <div className="flex flex-col items-center gap-1 text-center">
                <RotateCcw size={20} className="text-gold-500" />

                <span className="text-xs text-muted-foreground">
                  Retours
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PETIT HELPER ARRondi selon devise                              */
/* ═══════════════════════════════════════════════════════════════ */

function roundUsdOrCdf(value: number, currency: Currency): number {
  return currency === 'USD' ? roundUsd(value) : roundCdf(value)
}