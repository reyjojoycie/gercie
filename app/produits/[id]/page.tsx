// app/produits/[id]/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import ProductReviewSummary from '@/components/ProductReviewSummary'
import { Recommendations } from '@/components/Recommendations'
import ShareModal from '@/components/ShareModal'
import { ScrollToTop } from '@/components/ui/ScrollToTop'

import type {
  RichContent,
  RichSection,
  VariantAttributeConfig,
  VariantConfig,
  VariantOption,
  VarianteAdvanced,
} from '@/features/admin/produits/types'

import {
  createDefaultVariantConfig,
  getAvailableOptionResults,
  getEffectivePricing,
  getEffectiveStock,
  getMatchingVariant,
  getRecommendedSelectedAttributes,
  getVariantAttributeKeys,
  getVariantGallery,
  hasCompleteSelection,
  isLowStock,
  isOutOfStock,
  isVariantPurchasable,
  normalizeVariantAttributes,
  normalizeVariantConfig,
  normalizeVariantes,
} from '@/features/admin/produits/lib/variant-utils'

import type {
  DeliveryModeId,
  ProductDeliveryConfig,
  ShippingQuote,
} from '@/lib/shipping-utils'

import {
  DELIVERY_MODE_IDS,
  estimateProductDeliveryFee,
  getDeliveryModeLabel,
  normalizeProductDeliveryConfig,
} from '@/lib/shipping-utils'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  DollarSign,
  Flame,
  Heart,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  Lock,
  MapPin,
  Minus,
  Package,
  Palette,
  Play,
  Plus,
  Quote,
  RotateCcw,
  Ruler,
  Share2,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
  Video,
  Weight,
  X,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

interface Vendeur {
  id?: string
  boutique_nom?: string
  note?: number
  ville?: string
}

interface ProductDetail {
  id: string
  nom: string
  slug?: string
  description?: string
  prix?: number | null
  prix_usd?: number | null
  prix_original?: number | null
  prix_usd_original?: number | null
  prix_comparatif?: number | null
  prix_initial?: number | null
  images?: string[] | string | null
  video_url?: string | null
  stock?: number | null
  est_actif?: boolean
  categorie?: string | null
  variantes?: any[] | null
  variant_attributes?: any[] | null
  variant_config?: any | null
  rich_content?: RichContent | null
  delivery_config?: any | null
  specifications?: any[] | null
  vendeur?: Vendeur | null
  note_moyenne?: number | null
  nb_avis?: number | null
  remise_percent?: number | null
  discount?: number | null
  discount_percent?: number | null
  tags?: unknown
  marque?: string | null
  sku?: string | null
  barcode?: string | null
  poids_kg?: number | null
  longueur_cm?: number | null
  largeur_cm?: number | null
  hauteur_cm?: number | null
  delay_livraison?: string | null
  livraison_domicile?: number | null
  livraison_point_retrait?: number | null
  livraison_express?: number | null
  express_gratuit?: boolean | null
  featured?: boolean | null
  ribbon?: string | null
  garantie?: string | null
  retour_jours?: number | null
  created_at?: string
  updated_at?: string
  total_ventes?: number | null
  [key: string]: any
}

interface MediaItem {
  type: 'image' | 'video'
  url: string
}

interface RecentItem {
  id: string
  nom: string
  image?: string
  prix?: number
  prix_usd?: number
  timestamp: number
}

interface DeliveryQuoteDisplay {
  modeId: DeliveryModeId
  available: boolean
  amount_usd: number
  amount_cdf: number
  delay_label: string
  warnings: string[]
  quote: ShippingQuote
}

interface AlignedPricing {
  prixUsd: number
  prixCdf: number
  prixOriginalUsd: number
  prixOriginalCdf: number
  discountPercent: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const RECENT_KEY = 'gercie_recent_products_v3'
const PLACEHOLDER = '/placeholder.jpg'

const ReviewSummary = ProductReviewSummary as any
const SmartRecommendations = Recommendations as any

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toPositiveNumber(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function toNullablePositive(value: any): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

  if (!Number.isFinite(n) || n <= 0) return null

  return n
}

function formatMoney(value: number | null | undefined, currency: Currency): string {
  const n = Number(value || 0)

  if (!Number.isFinite(n) || n <= 0) return '—'

  return currency === 'USD' ? formatUsd(n) : formatCdf(n)
}

function getImagesArray(images: unknown): string[] {
  if (Array.isArray(images)) {
    return images
      .map((image) => (typeof image === 'string' ? image.trim() : ''))
      .filter(Boolean)
  }

  if (typeof images === 'string') {
    const value = images.trim()
    return value ? [value] : []
  }

  return []
}

function getFirstImage(images: unknown): string | undefined {
  return getImagesArray(images)[0]
}

function parseTags(tags: unknown, depth = 0): string[] {
  if (tags == null || depth > 5) return []

  if (typeof tags === 'string') {
    const value = tags.trim()
    if (!value) return []

    if (value.startsWith('[') || value.startsWith('{')) {
      try {
        return parseTags(JSON.parse(value), depth + 1)
      } catch {
        // fallback CSV
      }
    }

    return value
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
  }

  if (Array.isArray(tags)) {
    const result: string[] = []
    for (const tag of tags) {
      result.push(...parseTags(tag, depth + 1))
    }
    return result.filter(
      (tag, index, arr) => tag.length > 0 && arr.indexOf(tag) === index
    )
  }

  if (typeof tags === 'object') {
    const record = tags as Record<string, unknown>
    const candidate =
      record.tags ??
      record.name ??
      record.label ??
      record.title ??
      record.slug ??
      record.value

    if (candidate != null) {
      return parseTags(candidate, depth + 1)
    }

    return Object.values(record)
      .filter(
        (item): item is string | number =>
          typeof item === 'string' || typeof item === 'number'
      )
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean)
  }

  const primitive = String(tags).trim().toLowerCase()
  return primitive ? [primitive] : []
}

function getCurrentPath(fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const path = `${window.location.pathname}${window.location.search}`
  if (path.startsWith('/login')) return '/'
  return path
}

function guessColorHex(value: string): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const map: Record<string, string> = {
    'noir': '#111111',
    'black': '#111111',

    'blanc': '#FFFFFF',
    'white': '#FFFFFF',

    'rouge': '#D71920',
    'red': '#D71920',

    'bleu': '#1E40AF',
    'blue': '#1E40AF',

    'vert': '#15803D',
    'green': '#15803D',

    'jaune': '#FACC15',
    'yellow': '#FACC15',

    'gris': '#6B7280',
    'gray': '#6B7280',
    'grey': '#6B7280',

    'beige': '#D6C7A1',

    'marron': '#7C4A2D',
    'brown': '#7C4A2D',

    'or': '#D4AF37',
    'gold': '#D4AF37',

    'argent': '#C0C0C0',
    'silver': '#C0C0C0',

    'rose': '#F472B6',
    'pink': '#F472B6',

    'violet': '#7C3AED',
    'purple': '#7C3AED',

    'orange': '#F97316',

    'bordeaux': '#7F1D1D',
    'burgundy': '#7F1D1D',

    'marine': '#1E3A8A',
    'navy': '#1E3A8A',

    'kaki': '#4D7C0F',
    'olive': '#4D7C0F',

    'corail': '#FF7F50',

    'turquoise': '#14B8A6',

    'cyan': '#06B6D4',

    'magenta': '#C026D3',

    'indigo': '#4F46E5',

    'lavande': '#A78BFA',
    'lilas': '#A78BFA',

    'creme': '#FFFDD0',
    'cream': '#FFFDD0',

    'ivoire': '#FFFFF0',
    'ivory': '#FFFFF0',

    'anthracite': '#2B2B2B',

    'charbon': '#36454F',

    'slate': '#475569',

    'taupe': '#8B8589',

    'sable': '#C2B280',

    'terracotta': '#E2725B',

    'safran': '#F4C430',

    'moutarde': '#E1AD01',

    'emeraude': '#059669',
    'emerald': '#059669',

    'rubis': '#9B111E',

    'saphir': '#0F52BA',

    'amethyste': '#9966CC',

    'aqua': '#00FFFF',

    'mint': '#98FB98',
    'menthe': '#98FB98',

    'prune': '#5E239D',

    'wine': '#722F37',
    'vin': '#722F37',

    'chocolat': '#5C4033',
    'chocolate': '#5C4033',

    'cafe': '#6F4E37',
    'coffee': '#6F4E37',

    'caramel': '#AF6E4D',

    'noisette': '#B87333',
    'hazelnut': '#B87333',

    'peche': '#FFE5B4',
    'peach': '#FFE5B4',

    'abricot': '#FBCEB1',
    'apricot': '#FBCEB1',

    'limon': '#FFF700',
    'lemon': '#FFF700',

    'lime': '#BFFF00',

    'citron': '#FFF700',

    'fuchsia': '#FF00FF',

    'parme': '#915F6D',

    'mauve': '#E0B0FF',

    'periwinkle': '#CCCCFF',
    'pervenche': '#CCCCFF',

    'celeste': '#87CEEB',
    'sky': '#87CEEB',

    'azure': '#007FFF',

    'cobalt': '#0047AB',

    'roi': '#002366',
    'royal': '#002366',

    'nuit': '#0B1026',
    'night': '#0B1026',

    'minuit': '#0B1026',
    'midnight': '#0B1026',

    'acier': '#71797E',
    'steel': '#71797E',

    'fer': '#434B4D',
    'iron': '#434B4D',

    'bronze': '#CD7F32',

    'cuivre': '#B87333',
    'copper': '#B87333',

    'laiton': '#D4AF37',
    'brass': '#D4AF37',

    'etain': '#9EA7AD',
    'tin': '#9EA7AD',

    'platine': '#E5E4E2',
    'platinum': '#E5E4E2',

    'nacre': '#FDEEF4',
    'pearl': '#FDEEF4',

    'opale': '#A8C3BC',
    'opal': '#A8C3BC',

    'jade': '#00A86B',

    'topaze': '#FFC87C',

    'amber': '#FFBF00',
    'ambre': '#FFBF00',

    'miel': '#EB9605',
    'honey': '#EB9605',

    'dore': '#FFD700',
    'golden': '#FFD700',

    'argente': '#C0C0C0',

    'gris clair': '#D3D3D3',
    'lightgray': '#D3D3D3',

    'gris fonce': '#696969',
    'darkgray': '#696969',

    'bleu clair': '#ADD8E6',
    'lightblue': '#ADD8E6',

    'bleu fonce': '#00008B',
    'darkblue': '#00008B',

    'rouge clair': '#FF7F7F',
    'lightred': '#FF7F7F',

    'rouge fonce': '#8B0000',
    'darkred': '#8B0000',

    'vert clair': '#90EE90',
    'lightgreen': '#90EE90',

    'vert fonce': '#006400',
    'darkgreen': '#006400',

    'jaune clair': '#FFFFE0',
    'lightyellow': '#FFFFE0',

    'jaune fonce': '#B8860B',
    'darkyellow': '#B8860B',

    'bleu marine': '#1E3A8A',
    'bleu nuit': '#0B1026',
    'vert kaki': '#4D7C0F',
    'rouge bordeaux': '#7F1D1D',
    'noir mat': '#111111',
    'blanc casse': '#FFFFF0',
  }

  return map[normalized] || null
}

function inferAttributeType(key: string): VariantAttributeConfig['type'] {
  const lower = String(key || '').toLowerCase()

  if (
    lower.includes('taille') ||
    lower.includes('size') ||
    lower.includes('dimension')
  ) {
    return 'size'
  }

  if (
    lower.includes('couleur') ||
    lower.includes('color') ||
    lower.includes('colour')
  ) {
    return 'color'
  }

  if (
    lower.includes('modèle') ||
    lower.includes('modele') ||
    lower.includes('model') ||
    lower.includes('version')
  ) {
    return 'model'
  }

  if (
    lower.includes('finition') ||
    lower.includes('matière') ||
    lower.includes('matiere') ||
    lower.includes('material') ||
    lower.includes('texture')
  ) {
    return 'swatch'
  }

  return 'text'
}

function deriveVariantAttributes(
  variantes: VarianteAdvanced[]
): VariantAttributeConfig[] {
  const map = new Map<
    string,
    Map<string, { image?: string | null; colorHex?: string | null }>
  >()

  for (const variante of variantes || []) {
    const attributes = variante.attributes || {}

    for (const [key, rawValue] of Object.entries(attributes)) {
      const cleanKey = String(key || '').trim()
      const cleanValue = String(rawValue || '').trim()

      if (!cleanKey || !cleanValue) continue

      if (!map.has(cleanKey)) {
        map.set(cleanKey, new Map())
      }

      const optionsMap = map.get(cleanKey)!

      if (!optionsMap.has(cleanValue)) {
        optionsMap.set(cleanValue, {
          image: variante.image || variante.images?.[0] || null,
          colorHex: variante.colorHex || guessColorHex(cleanValue),
        })
      }
    }
  }

  return Array.from(map.entries()).map(([key, optionsMap], index) => {
    const type = inferAttributeType(key)

    const options: VariantOption[] = Array.from(optionsMap.entries()).map(
      ([value, meta], optionIndex) => ({
        value,
        label: value,
        image: meta.image || null,
        colorHex:
          type === 'color' || type === 'swatch'
            ? meta.colorHex || guessColorHex(value)
            : null,
        sort: optionIndex,
        active: true,
      })
    )

    return {
      key,
      label: key,
      type,
      required: true,
      options,
      sortOrder: index,
    }
  })
}

function sanitizeRichHtml(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
}

function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(String(url || ''))
}

function getYouTubeEmbedUrl(url: string): string | null {
  const value = String(url || '')
  const match = value.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  )
  return match ? `https://www.youtube.com/embed/${match[1]}` : null
}

function scoreSimilar(
  candidate: ProductDetail,
  tags: string[],
  basePriceCdf: number
): number {
  let score = 0

  const candidateTags = parseTags(candidate.tags)
  const overlap = candidateTags.filter((t) => tags.includes(t)).length
  score += overlap * 20

  const price = toPositiveNumber(candidate.prix) || 0
  if (basePriceCdf > 0 && price > 0) {
    const ratio = Math.abs(price - basePriceCdf) / basePriceCdf
    if (ratio < 0.2) score += 25
    else if (ratio < 0.5) score += 12
  }

  if ((candidate.note_moyenne || 0) >= 4) score += 10
  if ((candidate.total_ventes || 0) > 50) score += 10
  if (candidate.featured) score += 5

  return score
}

async function fetchSimilarProducts(product: ProductDetail): Promise<ProductDetail[]> {
  try {
    const mainCategory =
      typeof product.categorie === 'string'
        ? product.categorie.split(' > ')[0]
        : undefined

    const tags = parseTags(product.tags)
    const basePriceCdf = toPositiveNumber(product.prix) || 0

    let query = supabaseBrowser
      .from('produits')
      .select('*')
      .neq('id', product.id)
      .limit(16)

    if (mainCategory) {
      query = query.ilike('categorie', `%${mainCategory}%`)
    }

    let { data, error } = await query

    if (error || !data || data.length === 0) {
      const fallback = await supabaseBrowser
        .from('produits')
        .select('*')
        .neq('id', product.id)
        .limit(10)

      data = fallback.data || []
    }

    return (data || [])
      .map((p: any) => ({
        ...p,
        _score: scoreSimilar(p as ProductDetail, tags, basePriceCdf),
      }))
      .sort((a: any, b: any) => (b._score || 0) - (a._score || 0))
      .slice(0, 4)
  } catch {
    return []
  }
}

function readRecentProducts(): RecentItem[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecentProduct(item: RecentItem): RecentItem[] {
  if (typeof window === 'undefined') return []

  try {
    const list = readRecentProducts().filter((i) => i.id !== item.id)
    const next = [item, ...list].slice(0, 12)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    return next
  } catch {
    return []
  }
}

function modeExtraFees(mode: any): number {
  return (
    toPositiveNumber(mode?.handling_fee_usd) +
    toPositiveNumber(mode?.installation_fee_usd) +
    toPositiveNumber(mode?.labor_fee_usd)
  )
}

function isModeNonConsolidable(mode: any): boolean {
  return Boolean(
    mode?.mandatory_per_unit ||
      mode?.non_consolidable ||
      mode?.protect_margin ||
      mode?.calculation_mode === 'mandatory_per_unit' ||
      modeExtraFees(mode) > 0
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRIX ALIGNÉS USD PRINCIPAL / CDF CALCULÉ                       */
/* ═══════════════════════════════════════════════════════════════ */

function computePricingFromSources(
  product: ProductDetail | null,
  variante: any | null,
  rate: number
): AlignedPricing {
  const baseUsd = toNullablePositive(
    product?.prix_usd ?? product?.price_usd ?? null
  )

  const baseCdf = toNullablePositive(
    product?.prix ??
      product?.price ??
      product?.prix_cdf ??
      product?.price_cdf ??
      null
  )

  const variantUsd = toNullablePositive(
    variante?.prix_specifique_usd ??
      variante?.price_specifique_usd ??
      null
  )

  const variantCdf = toNullablePositive(
    variante?.prix_specifique_cdf ??
      variante?.price_specifique_cdf ??
      variante?.prix_specifique ??
      variante?.price_specifique ??
      variante?.prix ??
      variante?.price ??
      null
  )

  let prixUsd = 0
  let prixCdf = 0

  if (variantUsd != null) {
    prixUsd = variantUsd
    prixCdf = rate > 0 ? toCdf(prixUsd, rate) : variantCdf ?? 0
  } else if (variantCdf != null && rate > 0) {
    prixUsd = toUsd(variantCdf, rate)
    prixCdf = variantCdf
  } else if (variantCdf != null) {
    prixCdf = variantCdf
    prixUsd = 0
  } else if (baseUsd != null) {
    prixUsd = baseUsd
    prixCdf = rate > 0 ? toCdf(prixUsd, rate) : baseCdf ?? 0
  } else if (baseCdf != null && rate > 0) {
    prixUsd = toUsd(baseCdf, rate)
    prixCdf = baseCdf
  } else if (baseCdf != null) {
    prixCdf = baseCdf
    prixUsd = 0
  }

  const rawOriginalUsd = toNullablePositive(
    product?.prix_usd_original ??
      product?.original_price_usd ??
      product?.prix_initial_usd ??
      null
  )

  const rawOriginalCdf = toNullablePositive(
    product?.prix_original ??
      product?.original_price ??
      product?.prix_comparatif ??
      product?.prix_initial ??
      product?.original_price_cdf ??
      null
  )

  let originalUsd = 0
  let originalCdf = 0

  if (rawOriginalUsd != null) {
    originalUsd = rawOriginalUsd
    originalCdf = rate > 0 ? toCdf(originalUsd, rate) : rawOriginalCdf ?? 0
  } else if (rawOriginalCdf != null && rate > 0) {
    originalUsd = toUsd(rawOriginalCdf, rate)
    originalCdf = rawOriginalCdf
  } else if (rawOriginalCdf != null) {
    originalCdf = rawOriginalCdf
    originalUsd = 0
  }

  let discountPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Number(
          product?.remise_percent ??
            product?.discount ??
            product?.discount_percent ??
            0
        ) || 0
      )
    )
  )

  if (
    discountPercent === 0 &&
    originalUsd > 0 &&
    prixUsd > 0 &&
    originalUsd > prixUsd
  ) {
    discountPercent = Math.round((1 - prixUsd / originalUsd) * 100)
  }

  if (discountPercent > 0) {
    const divisor = 1 - discountPercent / 100

    if (divisor > 0) {
      if (originalUsd <= 0 && prixUsd > 0) {
        originalUsd = roundUsd(prixUsd / divisor)
      }

      if (originalCdf <= 0 && prixCdf > 0) {
        originalCdf =
          rate > 0 && originalUsd > 0
            ? toCdf(originalUsd, rate)
            : roundCdf(prixCdf / divisor)
      }
    }
  }

  if (originalUsd > 0 && originalUsd < prixUsd) {
    originalUsd = prixUsd
  }

  if (originalCdf > 0 && originalCdf < prixCdf) {
    originalCdf = prixCdf
  }

  return {
    prixUsd: roundUsd(prixUsd),
    prixCdf: roundCdf(prixCdf),
    prixOriginalUsd: roundUsd(originalUsd),
    prixOriginalCdf: roundCdf(originalCdf),
    discountPercent,
  }
}

function alignPricing(
  raw: any,
  product: ProductDetail | null,
  variante: any | null,
  rate: number
): AlignedPricing {
  const local = computePricingFromSources(product, variante, rate)

  const rawUsd = toNullablePositive(
    raw?.prixUsd ?? raw?.priceUsd ?? raw?.unit_price_usd ?? null
  )

  const rawCdf = toNullablePositive(
    raw?.prixCdf ??
      raw?.priceCdf ??
      raw?.prix ??
      raw?.price ??
      null
  )

  const rawOriginalUsd = toNullablePositive(
    raw?.prixOriginalUsd ?? raw?.originalPriceUsd ?? null
  )

  const rawOriginalCdf = toNullablePositive(
    raw?.prixOriginalCdf ?? raw?.originalPriceCdf ?? null
  )

  let prixUsd = local.prixUsd > 0 ? local.prixUsd : rawUsd ?? 0
  let prixCdf = local.prixCdf > 0 ? local.prixCdf : rawCdf ?? 0

  if (prixUsd > 0 && rate > 0) {
    prixCdf = toCdf(prixUsd, rate)
  } else if (prixCdf > 0 && rate > 0 && prixUsd <= 0) {
    prixUsd = toUsd(prixCdf, rate)
  }

  let originalUsd =
    local.prixOriginalUsd > 0 ? local.prixOriginalUsd : rawOriginalUsd ?? 0

  let originalCdf =
    local.prixOriginalCdf > 0 ? local.prixOriginalCdf : rawOriginalCdf ?? 0

  if (originalUsd > 0 && rate > 0) {
    originalCdf = toCdf(originalUsd, rate)
  } else if (originalCdf > 0 && rate > 0 && originalUsd <= 0) {
    originalUsd = toUsd(originalCdf, rate)
  }

  let discountPercent =
    local.discountPercent > 0
      ? local.discountPercent
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(
              Number(
                raw?.discountPercent ??
                  raw?.discount ??
                  product?.remise_percent ??
                  product?.discount ??
                  product?.discount_percent ??
                  0
              ) || 0
            )
          )
        )

  if (
    discountPercent === 0 &&
    originalUsd > 0 &&
    prixUsd > 0 &&
    originalUsd > prixUsd
  ) {
    discountPercent = Math.round((1 - prixUsd / originalUsd) * 100)
  }

  if (discountPercent > 0) {
    const divisor = 1 - discountPercent / 100

    if (divisor > 0) {
      if (originalUsd <= 0 && prixUsd > 0) {
        originalUsd = roundUsd(prixUsd / divisor)
      }

      if (originalCdf <= 0 && prixCdf > 0) {
        originalCdf =
          rate > 0 && originalUsd > 0
            ? toCdf(originalUsd, rate)
            : roundCdf(prixCdf / divisor)
      }
    }
  }

  if (originalUsd > 0 && originalUsd < prixUsd) {
    originalUsd = prixUsd
  }

  if (originalCdf > 0 && originalCdf < prixCdf) {
    originalCdf = prixCdf
  }

  return {
    prixUsd: roundUsd(prixUsd),
    prixCdf: roundCdf(prixCdf),
    prixOriginalUsd: roundUsd(originalUsd),
    prixOriginalCdf: roundCdf(originalCdf),
    discountPercent,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOK FAVORI                                                    */
/* ═══════════════════════════════════════════════════════════════ */

function useProductFavorite(productId?: string, userId?: string, authLoading = false) {
  const router = useRouter()
  const toast = useToast()

  const [isFavorite, setIsFavorite] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!productId || !userId || authLoading) {
      setIsFavorite(false)
      return
    }

    let cancelled = false

    const checkFavorite = async () => {
      try {
        const res = await fetch(
          `/api/favoris?produit_id=${encodeURIComponent(productId)}`,
          {
            credentials: 'include',
            cache: 'no-store',
          }
        )

        if (!res.ok) {
          if (!cancelled) setIsFavorite(false)
          return
        }

        const data = await res.json()

        if (!cancelled) {
          setIsFavorite(Boolean(data?.isFavorite))
        }
      } catch {
        if (!cancelled) {
          setIsFavorite(false)
        }
      }
    }

    void checkFavorite()

    return () => {
      cancelled = true
    }
  }, [authLoading, productId, userId])

  const toggle = useCallback(async () => {
    if (!productId) return

    if (authLoading) {
      toast.addToast({
        type: 'info',
        message: 'Connexion en cours, veuillez patienter…',
      })
      return
    }

    if (!userId) {
      toast.addToast({
        type: 'warning',
        message: 'Veuillez vous connecter pour ajouter aux favoris.',
      })

      router.push(
        `/login?redirect=${encodeURIComponent(
          getCurrentPath(`/produits/${productId}`)
        )}`
      )

      return
    }

    const next = !isFavorite
    setPending(true)
    setIsFavorite(next)

    try {
      const res = next
        ? await fetch('/api/favoris', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ produit_id: productId }),
          })
        : await fetch(
            `/api/favoris?produit_id=${encodeURIComponent(productId)}`,
            {
              method: 'DELETE',
              credentials: 'include',
            }
          )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))

        if (res.status === 409) {
          setIsFavorite(true)
          toast.addToast({
            type: 'info',
            message: 'Ce produit est déjà dans vos favoris.',
          })
          return
        }

        if (res.status === 401) {
          setIsFavorite(!next)
          toast.addToast({
            type: 'warning',
            message: 'Veuillez vous connecter pour gérer vos favoris.',
          })

          router.push(
            `/login?redirect=${encodeURIComponent(
              getCurrentPath(`/produits/${productId}`)
            )}`
          )

          return
        }

        throw new Error(data?.error || 'Impossible de mettre à jour les favoris.')
      }

      toast.addToast({
        type: next ? 'success' : 'info',
        message: next ? 'Ajouté aux favoris.' : 'Retiré des favoris.',
      })
    } catch (err: any) {
      setIsFavorite(!next)
      toast.addToast({
        type: 'error',
        message: err?.message || 'Impossible de mettre à jour les favoris.',
      })
    } finally {
      setPending(false)
    }
  }, [authLoading, isFavorite, productId, router, toast, userId])

  return { isFavorite, toggle, pending }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                */
/* ═══════════════════════════════════════════════════════════════ */

export default function ProductPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id

  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { addItem } = useCart()
  const { rate, loading: rateLoading } = useExchangeRate()
  const toast = useToast()

  const {
    isFavorite,
    toggle: toggleFavorite,
    pending: favoritePending,
  } = useProductFavorite(id, user?.id, authLoading)

  /* ---------------------------------------------------------- */
  /* États                                                       */
  /* ---------------------------------------------------------- */
  const [mounted, setMounted] = useState(false)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [quantity, setQuantity] = useState(1)
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({})
  const [activeMediaIndex, setActiveMediaIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('description')
  const [copied, setCopied] = useState(false)
  const [adding, setAdding] = useState(false)
  const [buying, setBuying] = useState(false)
  const [recentlyViewed, setRecentlyViewed] = useState<RecentItem[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  /* ---------------------------------------------------------- */
  /* Taux sécurisé après hydratation                             */
  /* ---------------------------------------------------------- */
  const safeRate = mounted ? toPositiveNumber(rate) : 0

  /* ---------------------------------------------------------- */
  /* Chargement produit                                          */
  /* ---------------------------------------------------------- */
  const productQuery = useQuery<ProductDetail | null>({
    queryKey: ['product', id],
    queryFn: async () => {
      if (!id) return null

      const { data, error } = await supabaseBrowser
        .from('produits')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        throw new Error(error.message || 'Impossible de charger le produit.')
      }

      return (data as ProductDetail) || null
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  })

  const product = productQuery.data ?? null

  const productTags = useMemo(() => parseTags(product?.tags), [product?.tags])

  const similarQuery = useQuery<ProductDetail[]>({
    queryKey: [
      'similar-products',
      product?.id,
      product?.categorie,
      product?.prix,
      productTags,
    ],
    queryFn: async () => (product ? fetchSimilarProducts(product) : []),
    enabled: !!product,
    staleTime: 5 * 60 * 1000,
  })

  const similarProducts = useMemo(
    () => similarQuery.data ?? [],
    [similarQuery.data]
  )

  /* ---------------------------------------------------------- */
  /* Variantes avancées                                          */
  /* ---------------------------------------------------------- */
  const rawVariantes = useMemo(
    () => normalizeVariantes(product?.variantes, []),
    [product?.variantes]
  )

  const variantAttributes = useMemo(() => {
    const incoming = normalizeVariantAttributes(product?.variant_attributes)

    if (incoming.length > 0) return incoming

    return deriveVariantAttributes(rawVariantes)
  }, [product?.variant_attributes, rawVariantes])

  const attributeKeys = useMemo(
    () => getVariantAttributeKeys(variantAttributes, rawVariantes),
    [rawVariantes, variantAttributes]
  )

  const variantes = useMemo(
    () => normalizeVariantes(product?.variantes, attributeKeys),
    [attributeKeys, product?.variantes]
  )

  const baseVariantConfig = useMemo(
    () =>
      normalizeVariantConfig(
        product?.variant_config || createDefaultVariantConfig()
      ),
    [product?.variant_config]
  )

  const variantConfig = useMemo<VariantConfig>(
    () => ({
      ...baseVariantConfig,
      hideUnavailable:
        baseVariantConfig.hideUnavailable ||
        baseVariantConfig.outOfStockBehavior === 'hide',
      disableUnavailable:
        baseVariantConfig.disableUnavailable ||
        baseVariantConfig.outOfStockBehavior === 'disable',
    }),
    [baseVariantConfig]
  )

  const hasVariants = variantes.length > 0

  const selectionComplete = useMemo(
    () =>
      hasCompleteSelection({
        selectedAttributes,
        attributes: variantAttributes,
      }),
    [selectedAttributes, variantAttributes]
  )

  const matchingVariant = useMemo(
    () =>
      getMatchingVariant({
        variantes,
        selectedAttributes,
        attributeKeys,
      }),
    [attributeKeys, selectedAttributes, variantes]
  )

  const exactVariant = useMemo(() => {
    if (!hasVariants || !selectionComplete) return null

    return (
      variantes.find((variante) =>
        attributeKeys.every(
          (key) => variante.attributes?.[key] === selectedAttributes[key]
        )
      ) || null
    )
  }, [attributeKeys, hasVariants, selectionComplete, selectedAttributes, variantes])

  const variantPurchasable = useMemo(
    () => (exactVariant ? isVariantPurchasable(exactVariant, variantConfig) : false),
    [exactVariant, variantConfig]
  )

  /* ---------------------------------------------------------- */
  /* Prix alignés USD principal                                  */
  /* ---------------------------------------------------------- */
  const pricing = useMemo<AlignedPricing>(() => {
    let raw: any = null

    try {
      raw = getEffectivePricing({
        product,
        variante: exactVariant,
        rate: safeRate,
      })
    } catch {
      raw = null
    }

    return alignPricing(raw, product, exactVariant, safeRate)
  }, [exactVariant, product, safeRate])

  const unitPriceUsd = pricing.prixUsd
  const unitPriceCdf = pricing.prixCdf

  const originalPriceUsd = pricing.prixOriginalUsd
  const originalPriceCdf = pricing.prixOriginalCdf

  const discountPercent = pricing.discountPercent

  const hasUnitPrice = unitPriceUsd > 0 || unitPriceCdf > 0

  const totalUsd = roundUsd(unitPriceUsd * quantity)
  const totalCdf =
    safeRate > 0
      ? toCdf(totalUsd, safeRate)
      : roundCdf(unitPriceCdf * quantity)

  const savingsUsd = Math.max(
    0,
    roundUsd(originalPriceUsd * quantity - totalUsd)
  )

  const savingsCdf =
    safeRate > 0
      ? toCdf(savingsUsd, safeRate)
      : Math.max(
          0,
          roundCdf(originalPriceCdf * quantity - totalCdf)
        )

  const effectiveCurrency: Currency =
    currency === 'USD' && unitPriceUsd <= 0 && unitPriceCdf > 0
      ? 'CDF'
      : currency

  const primaryUnit =
    effectiveCurrency === 'USD' ? unitPriceUsd : unitPriceCdf

  const secondaryUnit =
    effectiveCurrency === 'USD' ? unitPriceCdf : unitPriceUsd

  const primaryTotal =
    effectiveCurrency === 'USD' ? totalUsd : totalCdf

  const secondaryTotal =
    effectiveCurrency === 'USD' ? totalCdf : totalUsd

  const primaryOriginal =
    effectiveCurrency === 'USD' ? originalPriceUsd : originalPriceCdf

  const primarySavings =
    effectiveCurrency === 'USD' ? savingsUsd : savingsCdf

  const secondaryCurrency: Currency =
    effectiveCurrency === 'USD' ? 'CDF' : 'USD'

  /* ---------------------------------------------------------- */
  /* Stock dynamiques                                            */
  /* ---------------------------------------------------------- */
  const stock = useMemo(
    () =>
      getEffectiveStock({
        product,
        variante: exactVariant,
        variantes,
        config: variantConfig,
      }),
    [exactVariant, product, variantConfig, variantes]
  )

  const basePurchasable = useMemo(
    () =>
      product?.est_actif !== false &&
      (variantConfig.allowBackorder || stock > 0),
    [product?.est_actif, stock, variantConfig.allowBackorder]
  )

  const isOutOfStock = useMemo(() => {
    if (!product || product.est_actif === false) return true

    if (hasVariants) {
      return !selectionComplete || !exactVariant || !variantPurchasable
    }

    return !basePurchasable
  }, [
    basePurchasable,
    exactVariant,
    hasVariants,
    product,
    selectionComplete,
    variantPurchasable,
  ])

  const lowStock = useMemo(
    () => !isOutOfStock && isLowStock(stock, variantConfig),
    [isOutOfStock, stock, variantConfig]
  )

  const maxQuantity = useMemo(() => {
    if (variantConfig.allowBackorder && stock <= 0) return 99
    return Math.max(1, stock || 1)
  }, [stock, variantConfig.allowBackorder])

  /* ---------------------------------------------------------- */
  /* Livraison intelligente                                      */
  /* ---------------------------------------------------------- */
  const productDeliveryConfig = useMemo<ProductDeliveryConfig>(
    () =>
      normalizeProductDeliveryConfig(
        product?.delivery_config,
        product,
        safeRate
      ),
    [product, safeRate]
  )

  const deliveryProduct = useMemo(() => {
    if (!product) return null

    return {
      ...product,
      prix_usd: unitPriceUsd || product.prix_usd,
      prix: unitPriceCdf || product.prix,
      delivery_config: productDeliveryConfig,
      poids_kg:
        exactVariant?.poids_kg ??
        productDeliveryConfig.logistics?.weight_kg ??
        product.poids_kg ??
        null,
    }
  }, [
    exactVariant?.poids_kg,
    product,
    productDeliveryConfig,
    unitPriceCdf,
    unitPriceUsd,
  ])

  const deliveryQuotes = useMemo<DeliveryQuoteDisplay[]>(() => {
    if (!deliveryProduct) return []

    return DELIVERY_MODE_IDS.map((modeId) => {
      const estimate = estimateProductDeliveryFee(
        deliveryProduct,
        modeId,
        quantity,
        safeRate
      )

      if (!estimate.available) return null

      return {
        modeId,
        available: estimate.available,
        amount_usd: estimate.amount_usd,
        amount_cdf: estimate.amount_cdf,
        delay_label: estimate.delay_label,
        warnings: estimate.warnings,
        quote: estimate.quote,
      }
    }).filter((item): item is DeliveryQuoteDisplay => Boolean(item))
  }, [deliveryProduct, quantity, safeRate])

  const hasNonConsolidableDelivery = useMemo(() => {
    return DELIVERY_MODE_IDS.some((modeId) => {
      const mode = productDeliveryConfig.modes?.[modeId]
      if (!mode?.enabled) return false
      return isModeNonConsolidable(mode)
    })
  }, [productDeliveryConfig.modes])

  /* ---------------------------------------------------------- */
  /* Galerie dynamique                                           */
  /* ---------------------------------------------------------- */
  const galleryImages = useMemo(
    () =>
      getVariantGallery({
        product,
        selectedVariant: matchingVariant,
        config: variantConfig,
      }),
    [matchingVariant, product, variantConfig]
  )

  const mediaItems = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = []
    const seen = new Set<string>()

    const addImage = (url?: string | null) => {
      const clean = String(url || '').trim()
      if (!clean || seen.has(clean)) return
      seen.add(clean)
      items.push({ type: 'image', url: clean })
    }

    galleryImages.forEach(addImage)

    if (items.length === 0) {
      addImage(PLACEHOLDER)
    }

    if (typeof product?.video_url === 'string' && product.video_url.trim()) {
      items.push({ type: 'video', url: product.video_url })
    }

    return items
  }, [galleryImages, product?.video_url])

  const currentMedia = useMemo(
    () =>
      mediaItems[activeMediaIndex] ||
      mediaItems[0] || { type: 'image' as const, url: PLACEHOLDER },
    [activeMediaIndex, mediaItems]
  )

  /* ---------------------------------------------------------- */
  /* Rich content                                                */
  /* ---------------------------------------------------------- */
  const richContent = useMemo<RichContent | null>(() => {
    const content = product?.rich_content

    if (!content || content.enabled !== true) return null

    return content
  }, [product?.rich_content])

  const tabs = useMemo(() => {
    const base = [
      { id: 'description', label: 'Description', icon: <Info size={14} /> },
      { id: 'specs', label: 'Caractéristiques', icon: <Package size={14} /> },
      { id: 'reviews', label: 'Avis', icon: <Star size={14} /> },
      { id: 'livraison', label: 'Livraison & retours', icon: <Truck size={14} /> },
    ]

    if (richContent) {
      return [
        { id: 'presentation', label: 'Présentation', icon: <Sparkles size={14} /> },
        ...base,
      ]
    }

    return base
  }, [richContent])

  /* ---------------------------------------------------------- */
  /* Effets de base                                              */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (product?.nom && typeof document !== 'undefined') {
      document.title = `${product.nom} | Gercie`
    }
  }, [product?.nom])

  useEffect(() => {
    if (!product) return

    if (variantes.length === 0) {
      setSelectedAttributes({})
      setQuantity(1)
      return
    }

    const recommended = getRecommendedSelectedAttributes({
      variantes,
      attributes: variantAttributes,
      config: variantConfig,
    })

    setSelectedAttributes(recommended)
    setQuantity(1)
  }, [
    product?.id,
    variantAttributes,
    variantes,
    variantConfig,
  ])

  useEffect(() => {
    setActiveMediaIndex(0)
  }, [matchingVariant?.id, product?.id, selectedAttributes])

  useEffect(() => {
    if (!product) return
    setActiveTab(richContent ? 'presentation' : 'description')
  }, [product?.id, richContent])

  useEffect(() => {
    if (!product || typeof window === 'undefined') return

    const next = saveRecentProduct({
      id: product.id,
      nom: product.nom,
      image: getFirstImage(product.images) || PLACEHOLDER,
      prix: product.prix || undefined,
      prix_usd: product.prix_usd || undefined,
      timestamp: Date.now(),
    })

    setRecentlyViewed(next.filter((i) => i.id !== product.id).slice(0, 4))
  }, [product])

  useEffect(() => {
    if (activeMediaIndex >= mediaItems.length) {
      setActiveMediaIndex(0)
    }
  }, [activeMediaIndex, mediaItems.length])

  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), maxQuantity))
  }, [maxQuantity])

  /* ---------------------------------------------------------- */
  /* Auth guard local                                            */
  /* ---------------------------------------------------------- */
  const requireAuth = useCallback(
    (message: string) => {
      if (authLoading) {
        toast.addToast({
          type: 'info',
          message: 'Connexion en cours, veuillez patienter…',
        })
        return false
      }

      if (user) return true

      toast.addToast({
        type: 'warning',
        message,
      })

      router.push(
        `/login?redirect=${encodeURIComponent(
          getCurrentPath(id ? `/produits/${id}` : '/')
        )}`
      )

      return false
    },
    [authLoading, id, router, toast, user]
  )

  /* ---------------------------------------------------------- */
  /* Médias navigation                                           */
  /* ---------------------------------------------------------- */
  const nextMedia = useCallback(() => {
    setActiveMediaIndex((i) =>
      mediaItems.length ? (i + 1) % mediaItems.length : 0
    )
  }, [mediaItems.length])

  const prevMedia = useCallback(() => {
    setActiveMediaIndex((i) =>
      mediaItems.length ? (i - 1 + mediaItems.length) % mediaItems.length : 0
    )
  }, [mediaItems.length])

  useEffect(() => {
    if (!lightboxOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowRight') nextMedia()
      if (e.key === 'ArrowLeft') prevMedia()
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, nextMedia, prevMedia])

  /* ---------------------------------------------------------- */
  /* Variantes interactions                                      */
  /* ---------------------------------------------------------- */
  const getOptionResults = useCallback(
    (attributeKey: string) =>
      getAvailableOptionResults({
        attributeKey,
        selectedAttributes,
        variantes,
        attributes: variantAttributes,
        config: variantConfig,
      }),
    [selectedAttributes, variantAttributes, variantes, variantConfig]
  )

  const handleSelectAttribute = useCallback(
    (groupKey: string, value: string) => {
      setSelectedAttributes((prev) => ({
        ...prev,
        [groupKey]: value,
      }))

      setQuantity(1)
    },
    []
  )

  /* ---------------------------------------------------------- */
  /* Actions panier / achat                                      */
  /* ---------------------------------------------------------- */
  const canonicalUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `/produits/${id}`

  const scrollToSpecs = useCallback(() => {
    if (typeof document === 'undefined') return

    const target =
      document.getElementById('rich-specs') ||
      document.getElementById('product-tabs')

    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleAddToCart = useCallback(
    async (redirect = false) => {
      if (!product) return

      if (!requireAuth('Veuillez vous connecter pour ajouter au panier.')) {
        return
      }

      if (isOutOfStock) {
        toast.addToast({
          type: 'error',
          message: hasVariants && !selectionComplete
            ? 'Veuillez choisir toutes les options du produit.'
            : 'Ce produit est actuellement indisponible.',
        })
        return
      }

      if (!hasUnitPrice) {
        toast.addToast({
          type: 'error',
          message: 'Ce produit n’a pas de prix disponible pour le moment.',
        })
        return
      }

      if (hasVariants && (!selectionComplete || !exactVariant)) {
        toast.addToast({
          type: 'error',
          message: 'Veuillez choisir une variante disponible.',
        })
        return
      }

      const buttonState = redirect ? setBuying : setAdding
      buttonState(true)

      try {
        /**
         * IMPORTANT :
         * Le panier attend des prix UNITAIRES.
         * La quantité est transmise séparément via payload.quantite.
         */
        const payload = {
          id: product.id,
          product_id: product.id,
          originalId: product.id,
          nom: product.nom,

          prix: unitPriceCdf,
          prix_usd: unitPriceUsd,
          unit_price_usd: unitPriceUsd,

          quantite: quantity,

          image:
            currentMedia.type === 'image'
              ? currentMedia.url
              : getFirstImage(product.images) || PLACEHOLDER,

          variante: exactVariant
            ? {
                id: exactVariant.id,
                attributes: exactVariant.attributes,
                stock: exactVariant.stock,
                sku: exactVariant.sku || null,
                barcode: exactVariant.barcode || null,
                image: exactVariant.image || exactVariant.images?.[0] || null,
                images: exactVariant.images || [],
                prix: unitPriceCdf,
                prix_specifique_usd: unitPriceUsd,
                prix_specifique_cdf: unitPriceCdf,
                prix_specifique: unitPriceCdf,
                poids_kg: exactVariant.poids_kg || null,
              }
            : null,

          delivery_config: productDeliveryConfig,
          logistics_group: productDeliveryConfig.logistics?.group || null,
          poids_kg:
            exactVariant?.poids_kg ??
            productDeliveryConfig.logistics?.weight_kg ??
            product.poids_kg ??
            null,
          non_consolidable: hasNonConsolidableDelivery,
        } as any

        await addItem(payload)

        toast.addToast({
          type: 'success',
          message: `${quantity} × ${product.nom} ajouté au panier.`,
        })

        if (redirect) {
          router.push('/commande')
        }
      } catch (err: any) {
        toast.addToast({
          type: 'error',
          message:
            err?.message || 'Impossible d’ajouter ce produit au panier.',
        })
      } finally {
        buttonState(false)
      }
    },
    [
      addItem,
      currentMedia,
      exactVariant,
      hasNonConsolidableDelivery,
      hasUnitPrice,
      hasVariants,
      isOutOfStock,
      product,
      productDeliveryConfig,
      quantity,
      requireAuth,
      router,
      selectionComplete,
      toast,
      unitPriceCdf,
      unitPriceUsd,
    ]
  )

  const handleBuyNow = useCallback(() => {
    handleAddToCart(true)
  }, [handleAddToCart])

  const handleToggleFavorite = useCallback(async () => {
    await toggleFavorite()
  }, [toggleFavorite])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(canonicalUrl)
      setCopied(true)
      toast.addToast({ type: 'success', message: 'Lien copié.' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.addToast({
        type: 'error',
        message: 'Impossible de copier le lien.',
      })
    }
  }, [canonicalUrl, toast])

  const handleShare = useCallback(async () => {
    if (!product) return

    const shareData = {
      title: product.nom,
      text: `Découvre ${product.nom} sur Gercie`,
      url: canonicalUrl,
    }

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData)
        return
      } catch {
        // fallback modal
      }
    }

    setShareOpen(true)
  }, [canonicalUrl, product])

  const incrementQuantity = useCallback(() => {
    setQuantity((q) => Math.min(maxQuantity, q + 1))
  }, [maxQuantity])

  const decrementQuantity = useCallback(() => {
    setQuantity((q) => Math.max(1, q - 1))
  }, [])

  /* ---------------------------------------------------------- */
  /* Données dérivées UI                                         */
  /* ---------------------------------------------------------- */
  const mainCategory =
    typeof product?.categorie === 'string' && product.categorie.trim()
      ? product.categorie.split(' > ')[0]
      : 'Catalogue'

  const rating = product?.note_moyenne || 0
  const reviewsCount = product?.nb_avis || 0

  const isNew =
    product?.created_at &&
    Date.now() - new Date(product.created_at).getTime() < 7 * 24 * 60 * 60 * 1000

  const isTopSeller = (product?.total_ventes || 0) > 100

  const specRows = useMemo(() => {
    if (!product) return []

    const rows = [
      {
        label: 'Marque',
        value: product.marque,
        icon: <BadgeCheck size={14} />,
      },
      {
        label: 'SKU',
        value: product.sku || exactVariant?.sku,
        icon: <Tag size={14} />,
      },
      {
        label: 'Code-barres',
        value: product.barcode || exactVariant?.barcode,
        icon: <Package size={14} />,
      },
      {
        label: 'Poids',
        value:
          exactVariant?.poids_kg ||
          productDeliveryConfig.logistics?.weight_kg ||
          product.poids_kg
            ? `${
                exactVariant?.poids_kg ||
                productDeliveryConfig.logistics?.weight_kg ||
                product.poids_kg
              } kg`
            : null,
        icon: <Weight size={14} />,
      },
      {
        label: 'Dimensions',
        value:
          productDeliveryConfig.logistics?.length_cm ||
          productDeliveryConfig.logistics?.width_cm ||
          productDeliveryConfig.logistics?.height_cm ||
          product.longueur_cm ||
          product.largeur_cm ||
          product.hauteur_cm
            ? `${
                productDeliveryConfig.logistics?.length_cm ||
                product.longueur_cm ||
                '—'
              } × ${
                productDeliveryConfig.logistics?.width_cm ||
                product.largeur_cm ||
                '—'
              } × ${
                productDeliveryConfig.logistics?.height_cm ||
                product.hauteur_cm ||
                '—'
              } cm`
            : null,
        icon: <Ruler size={14} />,
      },
      {
        label: 'Garantie',
        value: product.garantie,
        icon: <Shield size={14} />,
      },
      {
        label: 'Retour',
        value: product.retour_jours ? `${product.retour_jours} jours` : null,
        icon: <RotateCcw size={14} />,
      },
      {
        label: 'Catégorie',
        value:
          typeof product.categorie === 'string' ? product.categorie : null,
        icon: <Layers size={14} />,
      },
      {
        label: 'Tags',
        value: productTags.join(', ') || null,
        icon: <Sparkles size={14} />,
      },
    ].filter((row) => Boolean(row.value))

    const variantSpecRows = Object.entries(exactVariant?.specs || {}).map(
      ([key, value]) => ({
        label: key,
        value: String(value || ''),
        icon: <SettingsIcon size={14} />,
      })
    )

    const productSpecificationRows = Array.isArray(product.specifications)
      ? product.specifications
          .map((spec: any) => ({
            label: String(spec?.key || ''),
            value: String(spec?.value || ''),
            icon: <Info size={14} />,
          }))
          .filter((row) => row.label && row.value)
      : []

    return [...rows, ...productSpecificationRows, ...variantSpecRows]
  }, [exactVariant, product, productDeliveryConfig, productTags])

  /* ---------------------------------------------------------- */
  /* Rendu chargement                                            */
  /* ---------------------------------------------------------- */
  if (productQuery.isLoading) {
    return (
      <Container className="py-8">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="aspect-square w-full animate-pulse rounded-3xl bg-muted" />
            <div className="mt-4 flex gap-3 overflow-x-auto">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 w-20 shrink-0 animate-pulse rounded-2xl bg-muted"
                />
              ))}
            </div>
          </div>

          <div className="space-y-5 lg:col-span-5">
            <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
            <div className="h-10 w-3/4 animate-pulse rounded-xl bg-muted" />
            <div className="h-5 w-1/2 animate-pulse rounded-lg bg-muted" />
            <div className="h-24 w-full animate-pulse rounded-2xl bg-muted" />
            <div className="h-12 w-full animate-pulse rounded-xl bg-muted" />
            <div className="h-12 w-full animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      </Container>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu erreur                                                */
  /* ---------------------------------------------------------- */
  if (productQuery.error || !product) {
    return (
      <Container className="py-16">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <AlertCircle size={56} className="mb-4 text-burgundy-500" />
          <h1 className="text-2xl font-bold text-foreground">
            Produit introuvable
          </h1>
          <p className="mt-2 text-muted-foreground">
            {productQuery.error instanceof Error
              ? productQuery.error.message
              : 'Ce produit n’existe pas ou a été retiré du catalogue.'}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              variant="outline-gold"
              onClick={() => router.back()}
              leftIcon={<ChevronLeft size={16} />}
            >
              Retour
            </Button>

            <Button
              variant="luxe"
              onClick={() => router.push('/')}
              leftIcon={<ShoppingBag size={16} />}
            >
              Voir la boutique
            </Button>
          </div>
        </div>
      </Container>
    )
  }

  /* ---------------------------------------------------------- */
  /* Fonctions de rendu rich content                             */
  /* ---------------------------------------------------------- */
  const renderRichVideo = (url: string, title?: string, poster?: string | null) => {
    const youtubeUrl = getYouTubeEmbedUrl(url)

    if (youtubeUrl) {
      return (
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
          <iframe
            src={youtubeUrl}
            title={title || 'Vidéo produit'}
            className="h-full w-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        </div>
      )
    }

    if (isDirectVideoUrl(url)) {
      return (
        <video
          src={url}
          controls
          playsInline
          poster={poster || undefined}
          className="w-full rounded-2xl border border-border bg-black"
        />
      )
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition hover:border-gold-400/50"
      >
        <Play size={16} className="text-gold-500" />
        Voir la vidéo
      </a>
    )
  }

  const renderRichSection = (section: RichSection, index: number) => {
    const key = section.id || `rich-section-${index}`

    if (section.type === 'text_image') {
      const imageFirst =
        section.layout === 'image_left' || section.layout === 'image_top'

      return (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45 }}
          className={cn(
            'grid gap-6 rounded-3xl border border-border bg-card/50 p-5 md:p-8',
            section.layout === 'image_center' && 'place-items-center text-center',
            imageFirst ? 'md:grid-cols-2' : 'md:grid-cols-2'
          )}
        >
          {section.image && (
            <div
              className={cn(
                'relative overflow-hidden rounded-2xl border border-border bg-muted',
                section.layout === 'image_top' && 'md:col-span-2',
                section.layout === 'image_center' && 'w-full max-w-2xl'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={section.image}
                alt={section.title || 'Section produit'}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <div className={cn(section.layout === 'image_top' && 'md:col-span-2')}>
            <h3 className="text-xl font-bold text-foreground md:text-2xl">
              {section.title}
            </h3>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground md:text-base">
              {section.text}
            </p>
          </div>
        </motion.div>
      )
    }

    if (section.type === 'features_grid') {
      return (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45 }}
          className="rounded-3xl border border-border bg-card/50 p-5 md:p-8"
        >
          {section.title && (
            <h3 className="mb-6 text-center text-xl font-bold text-foreground md:text-2xl">
              {section.title}
            </h3>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {section.items.map((item, itemIndex) => (
              <div
                key={`${item.title}-${itemIndex}`}
                className="rounded-2xl border border-border bg-background/60 p-4 text-center"
              >
                <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gold-500/10 text-gold-600">
                  <Sparkles size={18} />
                </div>
                <p className="font-semibold text-foreground">{item.title}</p>
                {item.description && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )
    }

    if (section.type === 'full_width_image') {
      return (
        <motion.figure
          key={key}
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45 }}
          className="overflow-hidden rounded-3xl border border-border bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={section.image}
            alt={section.caption || 'Image produit'}
            className="max-h-[75vh] w-full object-cover"
          />
          {section.caption && (
            <figcaption className="bg-card/80 px-5 py-3 text-center text-sm text-muted-foreground backdrop-blur">
              {section.caption}
            </figcaption>
          )}
        </motion.figure>
      )
    }

    if (section.type === 'video_block') {
      return (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45 }}
          className="rounded-3xl border border-border bg-card/50 p-5 md:p-8"
        >
          {section.title && (
            <h3 className="mb-4 text-xl font-bold text-foreground md:text-2xl">
              {section.title}
            </h3>
          )}

          {renderRichVideo(section.url, section.title, section.poster)}
        </motion.div>
      )
    }

    if (section.type === 'stats_row') {
      return (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45 }}
          className="grid gap-4 rounded-3xl border border-gold-400/20 bg-gold-500/5 p-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {section.items.map((item, itemIndex) => (
            <div key={`${item.label}-${itemIndex}`} className="text-center">
              <p className="text-2xl font-extrabold text-gold-600 md:text-3xl">
                {item.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </motion.div>
      )
    }

    if (section.type === 'quote') {
      return (
        <motion.blockquote
          key={key}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45 }}
          className="rounded-3xl border border-border bg-card/60 p-8 text-center"
        >
          <Quote size={28} className="mx-auto mb-4 text-gold-500" />
          <p className="text-lg font-medium italic text-foreground md:text-xl">
            {section.text}
          </p>
          {section.author && (
            <footer className="mt-4 text-sm text-muted-foreground">
              — {section.author}
            </footer>
          )}
        </motion.blockquote>
      )
    }

    if (section.type === 'html_safe') {
      return (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45 }}
          className="prose prose-sm max-w-none rounded-3xl border border-border bg-card/50 p-5 dark:prose-invert md:p-8"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(section.html) }}
        />
      )
    }

    return null
  }

  const renderRichContent = () => {
    if (!richContent) return null

    const hero = richContent.hero
    const sections = richContent.sections || []
    const specs = richContent.specs || []
    const galleries = richContent.galleries || []
    const videos = richContent.videos || []
    const comparison = richContent.comparison
    const finalCta = richContent.finalCta

    const comparisonKeys = comparison
      ? Array.from(
          new Set(
            comparison.columns.flatMap((column) =>
              Object.keys(column.attributes || {})
            )
          )
        )
      : []

    return (
      <div className="space-y-8">
        {/* Hero */}
        {hero && (hero.title || hero.subtitle || hero.image || hero.videoUrl) && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-3xl border border-gold-400/20 bg-gradient-to-br from-gold-500/10 via-card to-burgundy-500/5 p-6 md:p-10"
          >
            {hero.image && (
              <div className="absolute inset-0 opacity-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hero.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="relative z-10 mx-auto max-w-3xl text-center">
              {hero.title && (
                <h2 className="font-serif text-3xl font-extrabold text-foreground md:text-5xl">
                  {hero.title}
                </h2>
              )}

              {hero.subtitle && (
                <p className="mt-3 text-lg text-gold-600 md:text-xl">
                  {hero.subtitle}
                </p>
              )}

              {hero.description && (
                <p className="mx-auto mt-5 max-w-2xl whitespace-pre-line text-sm text-muted-foreground md:text-base">
                  {hero.description}
                </p>
              )}

              {hero.ctaLabel && hero.ctaAction !== 'none' && (
                <Button
                  variant="luxe"
                  className="mt-7"
                  onClick={() => {
                    if (hero.ctaAction === 'add_to_cart') {
                      handleAddToCart(false)
                    } else {
                      scrollToSpecs()
                    }
                  }}
                  disabled={isOutOfStock || !hasUnitPrice}
                  leftIcon={<Sparkles size={16} />}
                >
                  {hero.ctaLabel}
                </Button>
              )}
            </div>

            {hero.videoUrl && (
              <div className="relative z-10 mt-8">
                {renderRichVideo(hero.videoUrl, hero.title, hero.image)}
              </div>
            )}
          </motion.section>
        )}

        {/* Highlights */}
        {richContent.highlights && richContent.highlights.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {richContent.highlights.map((highlight, index) => (
              <motion.div
                key={`${highlight.title}-${index}`}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: index * 0.04 }}
                className="rounded-2xl border border-border bg-card/60 p-4"
              >
                <p className="font-semibold text-foreground">{highlight.title}</p>
                {highlight.description && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {highlight.description}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Sections */}
        {sections.map((section, index) => renderRichSection(section, index))}

        {/* Specs riches */}
        {specs.length > 0 && (
          <motion.section
            id="rich-specs"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.45 }}
            className="rounded-3xl border border-border bg-card/50 p-5 md:p-8"
          >
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-foreground md:text-2xl">
              <BarChart3 size={22} className="text-gold-500" />
              Caractéristiques premium
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              {specs.map((spec, index) => (
                <div
                  key={`${spec.label}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-background/50 p-4"
                >
                  <span className="text-sm text-muted-foreground">
                    {spec.label}
                  </span>
                  <span className="max-w-[60%] text-right text-sm font-semibold text-foreground">
                    {spec.value}
                  </span>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Galeries riches */}
        {galleries.map((gallery, galleryIndex) =>
          gallery.images.length > 0 ? (
            <motion.section
              key={`${gallery.title || 'gallery'}-${galleryIndex}`}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.45 }}
              className="rounded-3xl border border-border bg-card/50 p-5 md:p-8"
            >
              {gallery.title && (
                <h3 className="mb-5 flex items-center gap-2 text-xl font-bold text-foreground md:text-2xl">
                  <ImageIcon size={22} className="text-gold-500" />
                  {gallery.title}
                </h3>
              )}

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {gallery.images.map((image, imageIndex) => (
                  <div
                    key={`${image}-${imageIndex}`}
                    className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image}
                      alt={`${gallery.title || 'Galerie'} ${imageIndex + 1}`}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </motion.section>
          ) : null
        )}

        {/* Vidéos riches */}
        {videos.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.45 }}
            className="rounded-3xl border border-border bg-card/50 p-5 md:p-8"
          >
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-foreground md:text-2xl">
              <Video size={22} className="text-gold-500" />
              Vidéos
            </h3>

            <div className="space-y-6">
              {videos.map((video, index) => (
                <div key={`${video.url}-${index}`}>
                  {video.title && (
                    <p className="mb-3 font-semibold text-foreground">
                      {video.title}
                    </p>
                  )}
                  {renderRichVideo(video.url, video.title, video.poster)}
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Comparaison */}
        {comparison && comparison.columns.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.45 }}
            className="overflow-hidden rounded-3xl border border-border bg-card/50"
          >
            {comparison.title && (
              <div className="border-b border-border bg-muted/40 px-5 py-4">
                <h3 className="text-xl font-bold text-foreground md:text-2xl">
                  {comparison.title}
                </h3>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Critère</th>
                    {comparison.columns.map((column) => (
                      <th key={column.name} className="px-4 py-3 text-left">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {comparisonKeys.map((key) => (
                    <tr key={key} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {key}
                      </td>
                      {comparison.columns.map((column) => (
                        <td
                          key={`${column.name}-${key}`}
                          className="px-4 py-3 text-muted-foreground"
                        >
                          {column.attributes?.[key] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>
        )}

        {/* CTA final */}
        {finalCta && (finalCta.title || finalCta.description || finalCta.buttonLabel) && (
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.45 }}
            className="rounded-3xl border border-gold-400/20 bg-gradient-to-r from-gold-500/10 via-card to-burgundy-500/10 p-6 text-center md:p-10"
          >
            {finalCta.title && (
              <h3 className="text-2xl font-bold text-foreground md:text-3xl">
                {finalCta.title}
              </h3>
            )}

            {finalCta.description && (
              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                {finalCta.description}
              </p>
            )}

            {finalCta.buttonLabel && (
              <Button
                variant="luxe"
                size="lg"
                className="mt-6"
                onClick={() => handleAddToCart(false)}
                disabled={isOutOfStock || adding || !hasUnitPrice}
                leftIcon={
                  adding ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ShoppingBag size={16} />
                  )
                }
              >
                {finalCta.buttonLabel}
              </Button>
            )}
          </motion.section>
        )}
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-12">
      <Container className="py-6 sm:py-8">
        {/* Breadcrumb */}
        <nav
          aria-label="Fil d’Ariane"
          className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        >
          <Link href="/" className="transition hover:text-gold-500">
            Accueil
          </Link>

          <ChevronRight size={14} />

          <Link
            href={`/categories/${encodeURIComponent(mainCategory)}`}
            className="transition hover:text-gold-500"
          >
            {mainCategory}
          </Link>

          <ChevronRight size={14} />

          <span className="truncate text-foreground">{product.nom}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Galerie */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="lg:col-span-7"
            aria-label="Galerie du produit"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-border bg-muted">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${currentMedia.type}-${currentMedia.url}`}
                  initial={{ opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0"
                >
                  {currentMedia.type === 'video' ? (
                    <video
                      src={currentMedia.url}
                      controls
                      playsInline
                      poster={getFirstImage(product.images) || PLACEHOLDER}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Image
                      src={currentMedia.url || PLACEHOLDER}
                      alt={product.nom}
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 60vw"
                      className="cursor-zoom-in object-cover"
                      onClick={() => setLightboxOpen(true)}
                    />
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Badges */}
              <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
                {isNew && (
                  <Badge variant="accent" size="sm">
                    <Sparkles size={12} className="mr-1" />
                    Nouveau
                  </Badge>
                )}

                {discountPercent > 0 && (
                  <Badge variant="danger" size="sm" className="font-bold">
                    -{discountPercent}%
                  </Badge>
                )}

                {isTopSeller && (
                  <Badge variant="gold" size="sm">
                    <Flame size={12} className="mr-1" />
                    Top vente
                  </Badge>
                )}

                {product.ribbon && (
                  <Badge variant="neutral" size="sm">
                    {product.ribbon}
                  </Badge>
                )}

                {isOutOfStock && (
                  <Badge variant="neutral" size="sm">
                    <AlertCircle size={12} className="mr-1" />
                    Rupture
                  </Badge>
                )}
              </div>

              {/* Actions galerie */}
              <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  disabled={favoritePending}
                  className={cn(
                    'inline-flex h-10 w-10 items-center justify-center rounded-full shadow-md transition focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60',
                    isFavorite
                      ? 'bg-red-500 text-white'
                      : 'bg-white/95 text-gold-600 hover:bg-red-50 dark:bg-neutral-800/95 dark:hover:bg-red-900/20'
                  )}
                  aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  aria-pressed={isFavorite}
                >
                  {favoritePending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Heart size={18} className={isFavorite ? 'fill-current' : ''} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-gold-600 shadow-md transition hover:bg-gold-50 focus:outline-none focus:ring-2 focus:ring-gold-500 dark:bg-neutral-800/95 dark:hover:bg-gold-900/20"
                  aria-label="Partager ce produit"
                >
                  <Share2 size={18} />
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-gold-600 shadow-md transition hover:bg-gold-50 focus:outline-none focus:ring-2 focus:ring-gold-500 dark:bg-neutral-800/95 dark:hover:bg-gold-900/20"
                  aria-label="Copier le lien"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>

              {/* Navigation média */}
              {mediaItems.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prevMedia}
                    className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-gold-500"
                    aria-label="Média précédent"
                  >
                    <ChevronLeft size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={nextMedia}
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-gold-500"
                    aria-label="Média suivant"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>

            {/* Miniatures */}
            {mediaItems.length > 1 && (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {mediaItems.map((media, index) => (
                  <button
                    key={`${media.url}-${index}`}
                    type="button"
                    onClick={() => setActiveMediaIndex(index)}
                    className={cn(
                      'relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                      activeMediaIndex === index
                        ? 'border-gold-500 ring-1 ring-gold-500'
                        : 'border-border hover:border-gold-400/50'
                    )}
                    aria-label={`Voir média ${index + 1}`}
                    aria-current={activeMediaIndex === index}
                  >
                    {media.type === 'video' ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <Play size={20} className="text-gold-500" />
                      </div>
                    ) : (
                      <Image
                        src={media.url || PLACEHOLDER}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </motion.section>

          {/* Infos produit */}
          <motion.aside
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="space-y-6 lg:col-span-5"
          >
            <div className="lg:sticky lg:top-24 space-y-6">
              {/* Catégorie + note */}
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="gold" size="sm">
                  {mainCategory}
                </Badge>

                {rating > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('reviews')
                      if (typeof document !== 'undefined') {
                        document
                          .getElementById('product-tabs')
                          ?.scrollIntoView({ behavior: 'smooth' })
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                  >
                    <Star size={14} className="fill-current text-amber-500" />
                    <span className="font-medium text-foreground">
                      {rating.toFixed(1)}
                    </span>
                    <span>({reviewsCount} avis)</span>
                  </button>
                )}
              </div>

              {/* Titre */}
              <div>
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                  {product.nom}
                </h1>

                {product.vendeur?.boutique_nom && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Store size={14} className="text-gold-500" />
                    Vendu par{' '}
                    <span className="font-medium text-foreground">
                      {product.vendeur.boutique_nom}
                    </span>
                  </p>
                )}
              </div>

              {/* Prix */}
              <div className="rounded-3xl border border-gold-400/20 bg-card/60 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <DollarSign size={14} className="text-gold-500" />
                    <span>Prix</span>
                  </div>

                  <div className="inline-flex rounded-full border border-border bg-muted p-0.5 text-xs">
                    {(['USD', 'CDF'] as Currency[]).map((curr) => (
                      <button
                        key={curr}
                        type="button"
                        onClick={() => setCurrency(curr)}
                        className={cn(
                          'rounded-full px-3 py-1 font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                          currency === curr
                            ? 'bg-gold-500 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                        aria-pressed={currency === curr}
                      >
                        {curr}
                      </button>
                    ))}
                  </div>
                </div>

                {hasUnitPrice ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-3xl font-bold text-gold-600 sm:text-4xl">
                        {formatMoney(primaryTotal, effectiveCurrency)}
                      </span>

                      {secondaryTotal > 0 && (
                        <span className="text-sm text-muted-foreground">
                          ≈ {formatMoney(secondaryTotal, secondaryCurrency)}
                        </span>
                      )}

                      {primaryOriginal > primaryTotal && (
                        <span className="text-sm text-muted-foreground line-through">
                          {formatMoney(primaryOriginal, effectiveCurrency)}
                        </span>
                      )}
                    </div>

                    {quantity > 1 && primaryUnit > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Soit {formatMoney(primaryUnit, effectiveCurrency)} / unité
                      </p>
                    )}

                    {primarySavings > 0 && (
                      <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        Vous économisez{' '}
                        {formatMoney(primarySavings, effectiveCurrency)}
                      </p>
                    )}

                    {rateLoading &&
                      !safeRate &&
                      unitPriceUsd > 0 &&
                      unitPriceCdf <= 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Conversion CDF en cours de chargement...
                        </p>
                      )}
                  </>
                ) : (
                  <p className="mt-3 text-2xl font-bold text-foreground">
                    Prix sur demande
                  </p>
                )}
              </div>

              {/* Stock */}
              <div className="text-sm">
                {isOutOfStock ? (
                  <p className="flex items-center gap-2 font-medium text-red-500">
                    <AlertCircle size={16} />
                    {hasVariants && !selectionComplete
                      ? 'Veuillez choisir toutes les options'
                      : hasVariants && !exactVariant
                      ? 'Combinaison indisponible'
                      : 'Produit indisponible'}
                  </p>
                ) : lowStock ? (
                  <p className="flex items-center gap-2 font-medium text-amber-600">
                    <Clock size={16} />
                    Plus que {stock} en stock
                  </p>
                ) : (
                  <p className="flex items-center gap-2 font-medium text-emerald-600">
                    <CheckCircle2 size={16} />
                    Disponible
                  </p>
                )}

                {variantConfig.showStockCount && stock > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stock disponible : {stock}
                  </p>
                )}
              </div>

              {/* Variantes */}
              {hasVariants && (
                <div className="space-y-4">
                  {variantAttributes.map((attribute) => {
                    const results = getOptionResults(attribute.key)

                    if (results.length === 0) return null

                    if (variantConfig.displayMode === 'dropdown') {
                      return (
                        <label key={attribute.key} className="block space-y-1.5">
                          <span className="text-sm font-medium capitalize text-foreground">
                            {attribute.label}
                          </span>

                          <select
                            value={selectedAttributes[attribute.key] || ''}
                            onChange={(e) =>
                              handleSelectAttribute(attribute.key, e.target.value)
                            }
                            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                          >
                            <option value="">Choisir…</option>

                            {results.map((result) => (
                              <option
                                key={result.option.value}
                                value={result.option.value}
                                disabled={result.disabled}
                              >
                                {result.option.label || result.option.value}
                                {result.disabled ? ' (indisponible)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      )
                    }

                    return (
                      <div key={attribute.key}>
                        <p className="mb-2 text-sm font-medium capitalize text-foreground">
                          {attribute.label}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {results.map((result) => {
                            const { option, disabled } = result
                            const selected =
                              selectedAttributes[attribute.key] === option.value

                            const showImage =
                              variantConfig.showMiniPhotos &&
                              option.image &&
                              attribute.type !== 'size'

                            const showSwatch =
                              variantConfig.showColorSwatches &&
                              option.colorHex &&
                              (attribute.type === 'color' ||
                                attribute.type === 'swatch')

                            const displayLabel =
                              attribute.type === 'size' &&
                              !variantConfig.showSizeLabels
                                ? option.value.charAt(0).toUpperCase()
                                : option.label || option.value

                            return (
                              <button
                                key={option.value}
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  handleSelectAttribute(attribute.key, option.value)
                                }
                                className={cn(
                                  'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                                  selected
                                    ? 'border-gold-500 bg-gold-500/10 text-gold-700 dark:text-gold-300'
                                    : disabled
                                    ? 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-60 line-through'
                                    : 'border-border bg-card text-foreground hover:border-gold-400/50'
                                )}
                                aria-pressed={selected}
                              >
                                {showSwatch && (
                                  <span
                                    className="h-4 w-4 rounded-full border border-border"
                                    style={{
                                      backgroundColor: option.colorHex || '#ccc',
                                    }}
                                  />
                                )}

                                {showImage && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={option.image || ''}
                                    alt=""
                                    className="h-6 w-6 rounded-lg object-cover"
                                  />
                                )}

                                <span>{displayLabel}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Quantité */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Quantité</p>

                <div className="inline-flex items-center gap-3 rounded-2xl border border-border bg-card p-1.5">
                  <button
                    type="button"
                    onClick={decrementQuantity}
                    disabled={quantity <= 1 || isOutOfStock}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold-500"
                    aria-label="Diminuer la quantité"
                  >
                    <Minus size={16} />
                  </button>

                  <input
                    type="number"
                    min={1}
                    max={maxQuantity}
                    value={quantity}
                    disabled={isOutOfStock}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      if (Number.isFinite(value)) {
                        setQuantity(
                          Math.min(maxQuantity, Math.max(1, Math.floor(value)))
                        )
                      }
                    }}
                    className="w-14 bg-transparent text-center text-sm font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label="Quantité"
                  />

                  <button
                    type="button"
                    onClick={incrementQuantity}
                    disabled={quantity >= maxQuantity || isOutOfStock}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold-500"
                    aria-label="Augmenter la quantité"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* CTA principaux */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  variant="luxe"
                  size="lg"
                  fullWidth
                  disabled={isOutOfStock || adding || !hasUnitPrice}
                  onClick={() => handleAddToCart(false)}
                  leftIcon={
                    adding ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ShoppingBag size={16} />
                    )
                  }
                >
                  Ajouter au panier
                </Button>

                <Button
                  variant="outline-gold"
                  size="lg"
                  fullWidth
                  disabled={isOutOfStock || buying || !hasUnitPrice}
                  onClick={handleBuyNow}
                  leftIcon={
                    buying ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Zap size={16} />
                    )
                  }
                >
                  Acheter maintenant
                </Button>
              </div>

              {/* Actions secondaires */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleFavorite}
                  disabled={favoritePending}
                  leftIcon={
                    favoritePending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Heart
                        size={14}
                        className={isFavorite ? 'fill-current text-red-500' : ''}
                      />
                    )
                  }
                  className={isFavorite ? 'text-red-500' : ''}
                >
                  {isFavorite ? 'Favori' : 'Favoris'}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  leftIcon={<Share2 size={14} />}
                >
                  Partager
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyLink}
                  leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}
                >
                  {copied ? 'Copié' : 'Copier lien'}
                </Button>
              </div>

              {/* Confiance */}
              <div className="grid gap-3 rounded-2xl border border-border bg-card/60 p-4 text-xs text-muted-foreground sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Lock size={14} className="text-gold-500" />
                  <span>Paiement sécurisé</span>
                </div>

                <div className="flex items-center gap-2">
                  <Truck size={14} className="text-gold-500" />
                  <span>Livraison suivie</span>
                </div>

                <div className="flex items-center gap-2">
                  <RotateCcw size={14} className="text-gold-500" />
                  <span>Retour possible</span>
                </div>
              </div>
            </div>
          </motion.aside>
        </div>

        {/* Onglets */}
        <section id="product-tabs" className="mt-12">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                  activeTab === tab.id
                    ? 'border-gold-400/40 bg-gold-500/10 text-gold-700 dark:text-gold-300'
                    : 'border-border bg-card text-muted-foreground hover:border-gold-400/30 hover:text-foreground'
                )}
                aria-current={activeTab === tab.id}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-3xl border border-border bg-card/60 p-5 sm:p-6">
            {activeTab === 'presentation' && richContent && renderRichContent()}

            {activeTab === 'description' && (
              <div className="prose prose-sm max-w-none dark:prose-invert sm:prose-base">
                {product.description ? (
                  <p className="whitespace-pre-line text-muted-foreground">
                    {product.description}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Aucune description disponible pour ce produit.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'specs' && (
              <div className="grid gap-3 sm:grid-cols-2">
                {specRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune caractéristique renseignée.
                  </p>
                ) : (
                  specRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-background/50 p-3"
                    >
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="text-gold-500">{row.icon}</span>
                        {row.label}
                      </div>

                      <p className="max-w-[60%] text-right text-sm font-medium text-foreground">
                        {String(row.value)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="space-y-5">
                <ReviewSummary
                  productId={product.id}
                  rating={rating}
                  reviewsCount={reviewsCount}
                />

                {reviewsCount === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Aucun avis pour le moment. Soyez le premier à partager votre
                    expérience.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'livraison' && (
              <div className="space-y-4">
                {deliveryQuotes.length > 0 ? (
                  <div className="space-y-4">
                    {deliveryQuotes.map((quote) => {
                      const modeConfig =
                        productDeliveryConfig.modes?.[quote.modeId]

                      const nonConsolidable = isModeNonConsolidable(modeConfig)

                      return (
                        <div
                          key={quote.modeId}
                          className="rounded-2xl border border-border bg-background/50 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="flex items-center gap-2 font-semibold text-foreground">
                                {quote.modeId === 'express' ? (
                                  <Zap size={16} className="text-gold-500" />
                                ) : quote.modeId === 'point_retrait' ? (
                                  <MapPin size={16} className="text-gold-500" />
                                ) : (
                                  <Truck size={16} className="text-gold-500" />
                                )}
                                {getDeliveryModeLabel(quote.modeId)}
                              </p>

                              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock size={12} />
                                {quote.delay_label}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-lg font-bold text-gold-600">
                                {quote.amount_usd > 0
                                  ? formatMoney(quote.amount_usd, 'USD')
                                  : 'Gratuite'}
                              </p>

                              {quote.amount_cdf > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  ≈ {formatMoney(quote.amount_cdf, 'CDF')}
                                </p>
                              )}
                            </div>
                          </div>

                          {quote.quote.free_shipping_applied && (
                            <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              <ShieldCheck size={14} />
                              Livraison gratuite appliquée sur la partie consolidable.
                            </p>
                          )}

                          {nonConsolidable && (
                            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                              <AlertCircle size={14} className="mt-0.5 shrink-0" />
                              <span>
                                Ce produit peut générer des frais de livraison
                                obligatoires non consolidables. Même si vous
                                achetez plusieurs articles, ses frais spécifiques
                                restent facturés.
                              </span>
                            </p>
                          )}

                          {!nonConsolidable && (
                            <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                              <Info size={14} className="mt-0.5 shrink-0 text-gold-500" />
                              <span>
                                Si vous achetez plusieurs articles compatibles,
                                les frais de livraison peuvent être optimisés lors
                                de la commande.
                              </span>
                            </p>
                          )}

                          {quote.warnings.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {quote.warnings.map((warning, index) => (
                                <p
                                  key={`${warning}-${index}`}
                                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
                                >
                                  {warning}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Aucun mode de livraison disponible pour ce produit. Contactez
                    le support ou choisissez un autre produit.
                  </p>
                )}

                <div className="rounded-2xl border border-border bg-background/50 p-4 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <Info size={14} className="text-gold-500" />
                    Besoin d’aide ?
                  </p>

                  <p className="mt-1">
                    Contactez le support depuis votre profil pour une question
                    sur la livraison, le retrait ou un retour.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Produits similaires */}
        {(similarProducts.length > 0 || similarQuery.isLoading) && (
          <section className="mt-14">
            <SmartRecommendations
              type="ai-personalized"
              title="Vous aimerez aussi"
              description={`Basé sur « ${mainCategory} » et ce produit`}
              products={similarProducts}
              maxItems={4}
              seeMoreUrl={`/categories/${encodeURIComponent(mainCategory)}`}
              cardVariant="compact"
            />
          </section>
        )}

        {/* Récemment vus */}
        {recentlyViewed.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-xl font-bold text-foreground">
              Vu récemment
            </h2>

            <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
              {recentlyViewed.map((item) => (
                <Link
                  key={item.id}
                  href={`/produits/${item.id}`}
                  className="group min-w-[170px] max-w-[170px] rounded-2xl border border-border bg-card p-3 transition hover:border-gold-400/40 hover:shadow-card"
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                    <Image
                      src={item.image || PLACEHOLDER}
                      alt={item.nom}
                      fill
                      sizes="170px"
                      className="object-cover transition group-hover:scale-105"
                    />
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                    {item.nom}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.prix_usd
                      ? formatUsd(item.prix_usd)
                      : item.prix
                      ? formatCdf(item.prix)
                      : '—'}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </Container>

      {/* Barre mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            {hasUnitPrice ? (
              <>
                <p className="truncate text-sm font-bold text-gold-600">
                  {formatMoney(primaryTotal, effectiveCurrency)}
                </p>

                {secondaryTotal > 0 && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    ≈ {formatMoney(secondaryTotal, secondaryCurrency)}
                  </p>
                )}
              </>
            ) : (
              <p className="truncate text-sm font-bold text-foreground">
                Prix sur demande
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleFavorite}
            disabled={favoritePending}
            className={cn(
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60',
              isFavorite
                ? 'border-red-500/30 bg-red-500/10 text-red-500'
                : 'border-border bg-card text-muted-foreground'
            )}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            {favoritePending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Heart size={18} className={isFavorite ? 'fill-current' : ''} />
            )}
          </button>

          <Button
            variant="luxe"
            className="shrink-0"
            disabled={isOutOfStock || adding || !hasUnitPrice}
            onClick={() => handleAddToCart(false)}
            leftIcon={
              adding ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ShoppingBag size={16} />
              )
            }
          >
            Ajouter
          </Button>
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxOpen && currentMedia.type === 'image' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setLightboxOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Aperçu image"
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label="Fermer"
            >
              <X size={22} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                prevMedia()
              }}
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label="Image précédente"
            >
              <ChevronLeft size={22} />
            </button>

            <div
              className="relative h-[80vh] w-[80vw] max-w-5xl overflow-hidden rounded-3xl bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={currentMedia.url || PLACEHOLDER}
                alt={product.nom}
                fill
                sizes="80vw"
                className="object-contain"
              />
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                nextMedia()
              }}
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label="Image suivante"
            >
              <ChevronRight size={22} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal partage */}
      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        title={product.nom}
        description={
          product.description?.slice(0, 140) ||
          'Découvre ce produit sur Gercie'
        }
        image={
          currentMedia.type === 'image'
            ? currentMedia.url
            : getFirstImage(product.images) || PLACEHOLDER
        }
      />

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PETIT ICON LOCAL POUR SPECS VARIANTE                           */
/* ═══════════════════════════════════════════════════════════════ */

function SettingsIcon({ size = 14 }: { size?: number }) {
  return <Palette size={size} />
}