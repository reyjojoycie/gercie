// app/commande/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'

import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

import LocationSelector from '@/components/LocationSelector'
import DeliveryBreakdown from '@/components/DeliveryBreakdown'

import type {
  DeliveryModeId,
  ShippingCartItem,
  ShippingQuote,
} from '@/lib/shipping-utils'

import {
  calculateShippingQuote,
  DELIVERY_MODE_IDS,
  getAvailableDeliveryModes,
  getDeliveryModeLabel,
} from '@/lib/shipping-utils'

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Gift,
  Info,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Package,
  Phone,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Tag,
  Truck,
  X,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

type ShippingMethod = 'domicile' | 'point_retrait' | 'express'

interface PricePair {
  usd: number
  cdf: number
}

interface RawCartItem {
  id?: string
  product_id?: string
  nom?: string
  name?: string

  prix?: number | null
  price?: number | null
  prix_cdf?: number | null
  price_cdf?: number | null

  prix_usd?: number | null
  price_usd?: number | null
  unit_price_usd?: number | null

  quantite?: number | null
  quantity?: number | null

  image?: string | null
  images?: string[] | null

  variante?: any

  stock?: number | null
  stock_disponible?: number | null

  slug?: string
  delivery_config?: any
  poids_kg?: number | null
  logistics_group?: string | null
  non_consolidable?: boolean

  [key: string]: any
}

interface NormalizedCartItem {
  key: string
  originalId: string
  variantKey: string
  variantAttributes: Record<string, string> | null
  variantLabel: string | null

  nom: string
  image: string

  quantity: number

  priceUsd: number
  priceCdf: number

  lineUsd: number
  lineCdf: number

  stock: number | null
  isOutOfStock: boolean

  nonConsolidable: boolean

  delivery_config?: any
  poids_kg?: number | null
}

interface SavedAddress {
  id: string
  nom?: string
  destinataire?: string
  telephone?: string
  type?: string
  province_id?: number | string | null
  ville_id?: number | string | null
  commune_id?: number | string | null
  quartier?: string
  avenue?: string
  numero?: string
  reference?: string
  is_default?: boolean
  [key: string]: any
}

interface PickupPoint {
  id: number | string
  nom: string
  adresse: string
  telephone?: string | null
  email?: string | null
  whatsapp?: string | null
  commune_id?: number | string | null
  province_nom?: string | null
  ville_nom?: string | null
  quartier?: string | null
  horaires?: string | null
  contact_nom?: string | null
  type_etablissement?: string | null
  photo_url?: string | null
  points_de_repere?: string | null
  instructions_retrait?: string | null
  est_partenaire_verifie?: boolean
  note_moyenne?: number | null
  capacite?: number | null
  delai_moyen_heures?: number | null
  latitude?: number | null
  longitude?: number | null
  distance?: number
}

interface CartTotals {
  subtotalUsd: number
  subtotalCdf: number

  discountUsd: number
  discountCdf: number

  shippingUsd: number
  shippingCdf: number

  totalUsd: number
  totalCdf: number

  primarySubtotal: number
  secondarySubtotal: number

  primaryDiscount: number
  secondaryDiscount: number

  primaryShipping: number
  secondaryShipping: number

  primaryTotal: number
  secondaryTotal: number

  primaryCurrency: Currency
  secondaryCurrency: Currency

  shippingQuote: ShippingQuote | null

  hasNonConsolidable: boolean
  deliveryWarnings: string[]
}

interface DeliveryAvailability {
  domicile: { available: boolean; reason: string | null }
  point_retrait: { available: boolean; reason: string | null }
  express: { available: boolean; reason: string | null }
}

interface PromoCodeLike {
  code: string
  type?: 'percent' | 'fixed'
  value?: number | null
  valid?: boolean
  remainingToMinUsd?: number | null
  message?: string | null
  description?: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const PLACEHOLDER = '/placeholder.jpg'

const STEPS = [
  {
    id: 'cart',
    label: 'Panier',
    icon: <ShoppingBag size={16} />,
    href: '/panier',
  },
  {
    id: 'checkout',
    label: 'Commande',
    icon: <MapPin size={16} />,
    href: '/commande',
  },
  {
    id: 'payment',
    label: 'Paiement',
    icon: <CreditCard size={16} />,
    href: '#',
  },
  {
    id: 'confirmation',
    label: 'Confirmation',
    icon: <CheckCircle2 size={16} />,
    href: '#',
  },
]

const SHIPPING_OPTIONS: {
  id: ShippingMethod
  label: string
  description: string
  icon: ReactNode
  delay: string
}[] = [
  {
    id: 'domicile',
    label: 'Livraison à domicile',
    description: 'Livraison standard suivie',
    icon: <Truck size={16} />,
    delay: '24h - 72h',
  },
  {
    id: 'point_retrait',
    label: 'Point de retrait',
    description: 'Retrait en agence partenaire',
    icon: <MapPin size={16} />,
    delay: '24h - 48h',
  },
  {
    id: 'express',
    label: 'Express',
    description: 'Livraison prioritaire si disponible',
    icon: <Zap size={16} />,
    delay: "Aujourd'hui / demain",
  },
]

const inputClass =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const VARIANT_META_KEYS = new Set([
  'id',
  'attributes',
  'attrs',
  'prix',
  'price',
  'prix_specifique',
  'prix_specifique_usd',
  'prix_specifique_cdf',
  'image',
  'images',
  'stock',
  'poids_kg',
  'nom',
  'name',
  'description',
])

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function toPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

  if (!Number.isFinite(n) || n <= 0) return null

  return n
}

function firstPositive(...values: unknown[]): number {
  for (const value of values) {
    const n = toPositiveNumber(value)

    if (n != null) return n
  }

  return 0
}

function safeQuantity(value: unknown): number {
  return Math.max(1, Math.floor(Number(value ?? 1) || 1))
}

function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value + Number.EPSILON)
}

function toUsd(cdf: number, rate: number): number {
  if (!Number.isFinite(cdf) || cdf <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return roundUsd(cdf / rate)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return roundCdf(usd * rate)
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `$${value.toFixed(2)}`
}

function formatCdf(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `${Math.round(value).toLocaleString('fr-FR')} FC`
}

function formatMoney(value: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

function formatDistance(km?: number | null): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

function resolveRate(exchange: any): number | null {
  const candidates = [
    exchange?.rate,
    exchange?.usdRate,
    exchange?.data?.rate,
    exchange?.data?.current?.rate,
    exchange,
  ]

  for (const candidate of candidates) {
    const n = Number(candidate)

    if (Number.isFinite(n) && n > 0) return n
  }

  return null
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  RÉSOLUTION PRIX — RÈGLE ABSOLUE
 *
 *  - Si USD existe → USD = vérité, CDF = USD × taux.
 *    Le CDF stocké est ignoré car potentiellement obsolète.
 *  - Si seulement CDF existe → CDF = source temporaire, USD = CDF / taux.
 *  - Aucun taux codé en dur.
 * ═══════════════════════════════════════════════════════════════
 */
function resolvePricePair(
  usdSource: number,
  cdfSource: number,
  rate: number | null
): PricePair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let usd = usdSource > 0 ? roundUsd(usdSource) : 0
  let cdf = cdfSource > 0 ? roundCdf(cdfSource) : 0

  if (usd > 0) {
    cdf = rateOk ? roundCdf(toCdf(usd, rateNum)) : 0
  } else if (cdf > 0 && rateOk) {
    usd = roundUsd(toUsd(cdf, rateNum))
  }

  return {
    usd: roundUsd(usd),
    cdf: roundCdf(cdf),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT HELPERS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function cleanVariantAttributes(
  input: unknown
): Record<string, string> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const clean: Record<string, string> = {}

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const cleanKey = String(key || '').trim()

    if (!cleanKey) continue
    if (value === null || value === undefined) continue

    const cleanValue = String(value).trim()
    if (!cleanValue) continue

    clean[cleanKey] = cleanValue
  }

  return Object.keys(clean).length > 0 ? clean : null
}

function extractVariantAttributesFromObject(
  input: unknown
): Record<string, string> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const record = input as Record<string, unknown>

  const direct =
    record.attributes ??
    record.attrs

  const directClean = cleanVariantAttributes(direct)

  if (directClean) return directClean

  const candidate: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    if (VARIANT_META_KEYS.has(key)) continue
    candidate[key] = value
  }

  return cleanVariantAttributes(candidate)
}

function parseVariantAttributes(variante: any): Record<string, string> | null {
  if (!variante) return null

  if (typeof variante === 'string') {
    const trimmed = variante.trim()
    if (!trimmed) return null

    try {
      const parsed = JSON.parse(trimmed)
      return extractVariantAttributesFromObject(parsed)
    } catch {
      return null
    }
  }

  return extractVariantAttributesFromObject(variante)
}

/**
 * Clé de variante canonique.
 *
 * IMPORTANT :
 * - trie les clés ;
 * - ignore les valeurs vides ;
 * - évite les doublons dus à l’ordre des attributs ;
 * - cohérent avec CartContext et l’API commandes.
 */
function stableVariantKeyFromAttributes(
  attributes: Record<string, string> | null
): string {
  if (!attributes) return ''

  const entries = Object.entries(attributes).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false
    return String(value).trim() !== ''
  })

  if (entries.length === 0) return ''

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  try {
    return JSON.stringify(Object.fromEntries(entries))
  } catch {
    return ''
  }
}

function getVariantLabelFromAttributes(
  attributes: Record<string, string> | null
): string | null {
  if (!attributes) return null

  const entries = Object.entries(attributes).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false
    return String(value).trim() !== ''
  })

  if (entries.length === 0) return null

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  return entries.map(([, value]) => String(value)).join(' • ')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CART ITEM HELPERS                                              */
/* ═══════════════════════════════════════════════════════════════ */

function getItemImage(item: RawCartItem): string {
  if (typeof item.image === 'string' && item.image.trim()) return item.image

  if (Array.isArray(item.images) && item.images.length > 0) {
    const first = item.images[0]

    if (typeof first === 'string' && first.trim()) return first
  }

  if (
    typeof item.variante?.image === 'string' &&
    item.variante.image.trim()
  ) {
    return item.variante.image
  }

  if (
    Array.isArray(item.variante?.images) &&
    item.variante.images.length > 0
  ) {
    const first = item.variante.images[0]

    if (typeof first === 'string' && first.trim()) return first
  }

  return PLACEHOLDER
}

function getItemName(item: RawCartItem): string {
  return String(item.nom || item.name || item.variante?.nom || 'Produit')
}

function isItemNonConsolidable(item: RawCartItem): boolean {
  if (Boolean(item.non_consolidable)) return true

  const config = item.delivery_config

  if (!config?.modes) return false

  return Object.values(config.modes).some((mode: any) =>
    Boolean(
      mode?.mandatory_per_unit ||
        mode?.non_consolidable ||
        mode?.protect_margin ||
        mode?.calculation_mode === 'mandatory_per_unit'
    )
  )
}

function normalizeCartItem(
  item: RawCartItem,
  index: number,
  rate: number | null
): NormalizedCartItem {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  const variantAttributes = parseVariantAttributes(item.variante)
  const variantKey = stableVariantKeyFromAttributes(variantAttributes)
  const variantLabel = getVariantLabelFromAttributes(variantAttributes)

  const usdSource = firstPositive(
    item.prix_usd,
    item.price_usd,
    item.unit_price_usd,
    item.variante?.prix_specifique_usd
  )

  const cdfSource = firstPositive(
    item.prix,
    item.price,
    item.prix_cdf,
    item.price_cdf,
    item.variante?.prix_specifique_cdf,
    item.variante?.prix_specifique,
    item.variante?.prix
  )

  let priceUsd = 0
  let priceCdf = 0

  if (usdSource > 0) {
    /**
     * USD = source principale.
     * CDF est TOUJOURS recalculé depuis USD.
     */
    priceUsd = roundUsd(usdSource)
    priceCdf = rateOk ? roundCdf(toCdf(priceUsd, rateNum)) : 0
  } else if (cdfSource > 0) {
    /**
     * Legacy : seulement un CDF existe.
     * On dérive un USD temporaire si le taux est disponible.
     */
    priceCdf = roundCdf(cdfSource)
    priceUsd = rateOk ? roundUsd(toUsd(priceCdf, rateNum)) : 0
  }

  const quantity = safeQuantity(item.quantite ?? item.quantity)

  const originalId = String(
    item.product_id || item.id || `${getItemName(item)}-${index}`
  )

  const stock =
    typeof item.stock === 'number' && Number.isFinite(item.stock)
      ? item.stock
      : typeof item.stock_disponible === 'number' &&
          Number.isFinite(item.stock_disponible)
        ? item.stock_disponible
        : null

  return {
    key: `${originalId}::${variantKey}`,
    originalId,
    variantKey,
    variantAttributes,
    variantLabel,
    nom: getItemName(item),
    image: getItemImage(item),
    quantity,
    priceUsd,
    priceCdf,
    lineUsd: roundUsd(priceUsd * quantity),
    lineCdf: roundCdf(priceCdf * quantity),
    stock,
    isOutOfStock: stock === 0,
    nonConsolidable: isItemNonConsolidable(item),
    delivery_config: item.delivery_config ?? null,
    poids_kg: item.poids_kg ?? null,
  }
}

function buildShippingCartItems(
  items: NormalizedCartItem[]
): ShippingCartItem[] {
  return items.map((item) => ({
    id: item.originalId,
    product_id: item.originalId,
    nom: item.nom,
    quantity: item.quantity,
    unit_price_usd: item.priceUsd,
    prix_usd: item.priceUsd,
    prix: item.priceCdf,
    delivery_config: item.delivery_config ?? null,
    poids_kg: item.poids_kg ?? null,
    product: {
      id: item.originalId,
      nom: item.nom,
      prix_usd: item.priceUsd,
      prix: item.priceCdf,
      poids_kg: item.poids_kg ?? null,
      delivery_config: item.delivery_config ?? null,
    },
    variante: item.variantAttributes
      ? {
          attributes: item.variantAttributes,
          poids_kg: item.poids_kg ?? null,
        }
      : null,
  }))
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TOTALS                                                         */
/* ═══════════════════════════════════════════════════════════════ */

function computeTotals(
  items: NormalizedCartItem[],
  summary: any,
  rate: number | null,
  currency: Currency,
  shippingQuote: ShippingQuote | null
): CartTotals {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  const computedSubtotalUsd = roundUsd(
    items.reduce((acc, item) => acc + item.lineUsd, 0)
  )

  const computedSubtotalCdf = roundCdf(
    items.reduce((acc, item) => acc + item.lineCdf, 0)
  )

  const subtotalPair = resolvePricePair(
    computedSubtotalUsd > 0
      ? computedSubtotalUsd
      : firstPositive(
          summary?.sousTotalUSD,
          summary?.subtotalUSD,
          summary?.sous_total_usd
        ),
    computedSubtotalCdf > 0
      ? computedSubtotalCdf
      : firstPositive(
          summary?.sousTotal,
          summary?.subtotal,
          summary?.sous_total
        ),
    rate
  )

  const rawDiscountPair = resolvePricePair(
    firstPositive(
      summary?.remiseTotalUSD,
      summary?.discountUSD,
      summary?.remise_total_usd,
      summary?.promoReductionUsd
    ),
    firstPositive(
      summary?.remiseTotal,
      summary?.discount,
      summary?.remise_total
    ),
    rate
  )

  let discountUsd = Math.min(rawDiscountPair.usd, subtotalPair.usd)
  let discountCdf =
    rateOk && discountUsd > 0
      ? roundCdf(toCdf(discountUsd, rateNum))
      : Math.min(rawDiscountPair.cdf, subtotalPair.cdf)

  if (discountUsd <= 0 && discountCdf > 0 && rateOk) {
    discountUsd = roundUsd(toUsd(discountCdf, rateNum))
  }

  if (discountCdf <= 0 && discountUsd > 0 && rateOk) {
    discountCdf = roundCdf(toCdf(discountUsd, rateNum))
  }

  discountUsd = Math.max(0, roundUsd(discountUsd))
  discountCdf = Math.max(0, roundCdf(discountCdf))

  const shippingAvailable = Boolean(
    shippingQuote && shippingQuote.available !== false
  )

  const shippingPair = shippingAvailable
    ? resolvePricePair(
        firstPositive(shippingQuote?.total_usd),
        firstPositive(shippingQuote?.total_cdf),
        rate
      )
    : { usd: 0, cdf: 0 }

  let shippingUsd = shippingPair.usd
  let shippingCdf =
    rateOk && shippingUsd > 0
      ? roundCdf(toCdf(shippingUsd, rateNum))
      : shippingPair.cdf

  if (shippingUsd <= 0 && shippingCdf > 0 && rateOk) {
    shippingUsd = roundUsd(toUsd(shippingCdf, rateNum))
  }

  if (shippingCdf <= 0 && shippingUsd > 0 && rateOk) {
    shippingCdf = roundCdf(toCdf(shippingUsd, rateNum))
  }

  shippingUsd = Math.max(0, roundUsd(shippingUsd))
  shippingCdf = Math.max(0, roundCdf(shippingCdf))

  let totalUsd = 0
  let totalCdf = 0

  if (shippingAvailable) {
    totalUsd = roundUsd(
      Math.max(0, subtotalPair.usd - discountUsd + shippingUsd)
    )

    totalCdf =
      rateOk && totalUsd > 0
        ? roundCdf(toCdf(totalUsd, rateNum))
        : roundCdf(
            Math.max(0, subtotalPair.cdf - discountCdf + shippingCdf)
          )
  } else {
    const contextTotalPair = resolvePricePair(
      firstPositive(summary?.totalUSD, summary?.total_usd),
      firstPositive(summary?.total),
      rate
    )

    if (contextTotalPair.usd > 0 || contextTotalPair.cdf > 0) {
      totalUsd = contextTotalPair.usd
      totalCdf =
        rateOk && totalUsd > 0
          ? roundCdf(toCdf(totalUsd, rateNum))
          : contextTotalPair.cdf
    } else {
      totalUsd = roundUsd(Math.max(0, subtotalPair.usd - discountUsd))

      totalCdf =
        rateOk && totalUsd > 0
          ? roundCdf(toCdf(totalUsd, rateNum))
          : roundCdf(Math.max(0, subtotalPair.cdf - discountCdf))
    }
  }

  if (totalUsd > 0 && totalCdf <= 0 && rateOk) {
    totalCdf = roundCdf(toCdf(totalUsd, rateNum))
  }

  if (totalCdf > 0 && totalUsd <= 0 && rateOk) {
    totalUsd = roundUsd(toUsd(totalCdf, rateNum))
  }

  totalUsd = Math.max(0, roundUsd(totalUsd))
  totalCdf = Math.max(0, roundCdf(totalCdf))

  const hasNonConsolidable =
    (shippingAvailable &&
      shippingQuote?.breakdown?.some(
        (line: any) => line?.type === 'mandatory'
      )) ||
    items.some((item) => item.nonConsolidable)

  const deliveryWarnings = shippingAvailable
    ? shippingQuote?.warnings ?? []
    : []

  const primaryCurrency: Currency = currency === 'CDF' ? 'CDF' : 'USD'
  const secondaryCurrency: Currency =
    primaryCurrency === 'USD' ? 'CDF' : 'USD'

  const getPair = (usd: number, cdf: number) => ({
    primary: primaryCurrency === 'USD' ? usd : cdf,
    secondary: secondaryCurrency === 'USD' ? usd : cdf,
  })

  const subtotalPairDisplay = getPair(
    subtotalPair.usd,
    subtotalPair.cdf
  )

  const discountPairDisplay = getPair(discountUsd, discountCdf)
  const shippingPairDisplay = getPair(shippingUsd, shippingCdf)
  const totalPairDisplay = getPair(totalUsd, totalCdf)

  return {
    subtotalUsd: subtotalPair.usd,
    subtotalCdf: subtotalPair.cdf,

    discountUsd,
    discountCdf,

    shippingUsd,
    shippingCdf,

    totalUsd,
    totalCdf,

    primarySubtotal: subtotalPairDisplay.primary,
    secondarySubtotal: subtotalPairDisplay.secondary,

    primaryDiscount: discountPairDisplay.primary,
    secondaryDiscount: discountPairDisplay.secondary,

    primaryShipping: shippingPairDisplay.primary,
    secondaryShipping: shippingPairDisplay.secondary,

    primaryTotal: totalPairDisplay.primary,
    secondaryTotal: totalPairDisplay.secondary,

    primaryCurrency,
    secondaryCurrency,

    shippingQuote: shippingAvailable ? shippingQuote : null,

    hasNonConsolidable: Boolean(hasNonConsolidable),
    deliveryWarnings,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ADDRESS / PICKUP HELPERS                                       */
/* ═══════════════════════════════════════════════════════════════ */

function toNumberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(String(value).replace(',', '.'))

  return Number.isFinite(n) ? n : null
}

function buildAddressText(source: {
  quartier?: string | null
  avenue?: string | null
  numero?: string | null
  reference?: string | null
}): string {
  return [
    source.quartier,
    source.avenue,
    source.numero,
    source.reference,
  ]
    .filter(Boolean)
    .join(', ')
}

function normalizePickupPoint(raw: any): PickupPoint | null {
  const id = raw?.id ?? raw?.point_id ?? raw?.point_retrait_id

  if (id === null || id === undefined || id === '') return null

  const nom = String(raw?.nom ?? raw?.name ?? '').trim()
  const adresse = String(raw?.adresse ?? raw?.address ?? '').trim()

  if (!nom || !adresse) return null

  const latitude = toNumberOrNull(raw?.latitude ?? raw?.lat)
  const longitude = toNumberOrNull(raw?.longitude ?? raw?.lng ?? raw?.lon)

  return {
    id: typeof id === 'number' ? id : String(id),
    nom,
    adresse,
    telephone: raw?.telephone ?? raw?.phone ?? null,
    email: raw?.email ?? null,
    whatsapp: raw?.whatsapp ?? null,
    commune_id: raw?.commune_id ?? null,
    province_nom: raw?.province_nom ?? raw?.province ?? null,
    ville_nom: raw?.ville_nom ?? raw?.ville ?? raw?.city ?? null,
    quartier: raw?.quartier ?? null,
    horaires: raw?.horaires ?? raw?.hours ?? null,
    contact_nom: raw?.contact_nom ?? raw?.contact ?? null,
    type_etablissement:
      raw?.type_etablissement ??
      raw?.type ??
      raw?.establishment_type ??
      null,
    photo_url: raw?.photo_url ?? raw?.photo ?? raw?.image_url ?? null,
    points_de_repere: raw?.points_de_repere ?? raw?.landmarks ?? null,
    instructions_retrait:
      raw?.instructions_retrait ?? raw?.pickup_instructions ?? null,
    est_partenaire_verifie: Boolean(
      raw?.est_partenaire_verifie ?? raw?.verified
    ),
    note_moyenne: toNumberOrNull(raw?.note_moyenne ?? raw?.rating),
    capacite: toNumberOrNull(raw?.capacite ?? raw?.capacity),
    delai_moyen_heures: toNumberOrNull(
      raw?.delai_moyen_heures ?? raw?.delay_hours ?? raw?.delai
    ),
    latitude:
      latitude !== null && latitude >= -90 && latitude <= 90
        ? latitude
        : null,
    longitude:
      longitude !== null && longitude >= -180 && longitude <= 180
        ? longitude
        : null,
    distance: toNumberOrNull(raw?.distance) ?? undefined,
  }
}

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371

  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

function buildMapsUrl(point: PickupPoint): string {
  if (point.latitude !== null && point.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`
  }

  const query = encodeURIComponent(
    `${point.nom}, ${point.adresse}, ${point.ville_nom || ''}`
  )

  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

function buildDirectionsUrl(point: PickupPoint): string {
  if (point.latitude !== null && point.longitude !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`
  }

  const query = encodeURIComponent(
    `${point.nom}, ${point.adresse}, ${point.ville_nom || ''}`
  )

  return `https://www.google.com/maps/dir/?api=1&destination=${query}`
}

function buildOsmEmbedUrl(point: PickupPoint): string | null {
  if (point.latitude === null || point.longitude === null) return null

  const delta = 0.01

  const bbox = `${point.longitude - delta},${point.latitude - delta},${point.longitude + delta},${point.latitude + delta}`

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${point.latitude},${point.longitude}`
}

function buildQrUrl(point: PickupPoint): string {
  const data = buildMapsUrl(point)

  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}`
}

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [delay, value])

  return debounced
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FORM SCHEMA                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const commandeSchema = z
  .object({
    currency: z.enum(['USD', 'CDF']).default('USD'),

    type_livraison: z
      .enum(['domicile', 'point_retrait', 'express'])
      .default('domicile'),

    point_retrait_id: z
      .union([z.number(), z.string()])
      .nullable()
      .optional(),

    adresse_id: z.string().nullable().optional(),
    use_new_address: z.boolean().default(false),

    destination_nom: z
      .string()
      .min(2, 'Le nom du destinataire est requis')
      .max(120, 'Nom trop long'),

    destination_telephone: z
      .string()
      .regex(/^0[0-9]{9}$/, 'Numéro invalide (format : 08xxxxxxxx)'),

    province_id: z.any().nullable().optional(),
    ville_id: z.any().nullable().optional(),
    commune_id: z.any().nullable().optional(),

    quartier: z.string().max(160).optional().nullable(),
    avenue: z.string().max(160).optional().nullable(),
    numero: z.string().max(50).optional().nullable(),
    reference: z.string().max(255).optional().nullable(),

    express: z.boolean().default(false),

    messageCadeau: z.string().max(200).optional().nullable(),
    deliveryNote: z.string().max(250).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type_livraison === 'point_retrait') {
      if (!data.point_retrait_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['point_retrait_id'],
          message: 'Choisissez un point de retrait',
        })
      }

      return
    }

    const manualAddress = data.use_new_address || !data.adresse_id

    if (manualAddress) {
      if (!data.commune_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['commune_id'],
          message: 'Sélectionnez une commune de livraison',
        })
      }

      if (!data.quartier?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quartier'],
          message: 'Le quartier est requis',
        })
      }

      if (!data.avenue?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['avenue'],
          message: "L'avenue est requise",
        })
      }

      if (!data.numero?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['numero'],
          message: 'Le numéro est requis',
        })
      }
    }
  })

type CommandeForm = z.infer<typeof commandeSchema>

/* ═══════════════════════════════════════════════════════════════ */
/*  UI PRIMITIVES                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function SimpleModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [onClose, open])

  if (!open) return null

  const sizeClass =
    size === 'sm'
      ? 'max-w-md'
      : size === 'lg'
        ? 'max-w-3xl'
        : size === 'xl'
          ? 'max-w-5xl'
          : 'max-w-2xl'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full rounded-2xl border border-border bg-card shadow-2xl',
          sizeClass
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h3 className="text-lg font-bold text-foreground">{title}</h3>

            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-3 border-t border-border p-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  error,
  hint,
  required,
}: {
  label: string
  children: ReactNode
  error?: string
  hint?: string
  required?: boolean
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      {children}

      {hint && !error && (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      )}

      {error && <span className="block text-xs text-red-500">{error}</span>}
    </label>
  )
}

function SummaryRow({
  label,
  value,
  secondary,
  tone = 'default',
  icon,
}: {
  label: string
  value: string
  secondary?: string | null
  tone?: 'default' | 'discount' | 'muted' | 'total'
  icon?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="text-gold-500">{icon}</span>}

        <span
          className={cn(
            'truncate',
            tone === 'total'
              ? 'font-semibold text-foreground'
              : tone === 'discount'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'font-medium',
            tone === 'total'
              ? 'text-lg font-bold text-gold-600'
              : tone === 'discount'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-foreground'
          )}
        >
          {value}
        </p>

        {secondary && (
          <p className="text-[11px] text-muted-foreground">{secondary}</p>
        )}
      </div>
    </div>
  )
}

function Stepper() {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {STEPS.map((step) => {
          const isActive = step.id === 'checkout'
          const isCompleted = step.id === 'cart'

          return (
            <Link
              key={step.id}
              href={isCompleted ? step.href : '#'}
              className={cn(
                'flex min-w-[120px] flex-1 flex-col items-center gap-2 rounded-2xl border px-3 py-3 text-center transition',
                isActive
                  ? 'border-gold-400/40 bg-gold-500/10 text-gold-700 dark:text-gold-300'
                  : isCompleted
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                    : 'border-border bg-card text-muted-foreground'
              )}
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full',
                  isActive
                    ? 'bg-gold-500 text-white'
                    : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <CheckCircle2 size={16} /> : step.icon}
              </span>

              <span className="text-xs font-medium sm:text-sm">
                {step.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function PickupPointSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <div className="h-16 w-16 animate-pulse rounded-xl bg-muted" />

        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function CommandePage() {
  const router = useRouter()

  const toast = useToast() as any

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const { user, loading: authLoading } = useAuth()

  const exchange = useExchangeRate() as any

  const rawRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  const rateLoading = Boolean(exchange?.loading)

  const prefersReducedMotion = useReducedMotion()
  const shouldAnimate = !prefersReducedMotion

  const cart = useCart() as any

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   * On évite donc d’utiliser le taux avant hydratation.
   */
  const rate = mounted ? rawRate : null

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  const items: RawCartItem[] = useMemo(
    () => (Array.isArray(cart?.items) ? cart.items : []),
    [cart?.items]
  )

  const summary = useMemo<any>(() => cart?.summary ?? {}, [cart?.summary])

  const activePromo = useMemo<PromoCodeLike | null>(
    () => (cart?.activePromo as PromoCodeLike | null) ?? null,
    [cart?.activePromo]
  )

  const promoError = cart?.promoError || null

  const promoValid = Boolean(
    summary?.promoValid ?? activePromo?.valid ?? false
  )

  const promoRemainingUsd = firstPositive(
    summary?.promoRemainingUsd,
    activePromo?.remainingToMinUsd
  )

  const promoRequirementMessage =
    summary?.promoRequirementMessage ||
    activePromo?.message ||
    promoError ||
    null

  const effectivePromoCode = promoValid
    ? String(activePromo?.code || '').trim().toUpperCase() || null
    : null

  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [loadingAddresses, setLoadingAddresses] = useState(false)

  const [points, setPoints] = useState<PickupPoint[]>([])
  const [pointsLoading, setPointsLoading] = useState(false)
  const [pointsError, setPointsError] = useState<string | null>(null)

  const [pointSearch, setPointSearch] = useState('')
  const [pointCity, setPointCity] = useState('')
  const [onlyVerified, setOnlyVerified] = useState(false)

  const [pointSort, setPointSort] = useState<'distance' | 'note' | 'name'>(
    'distance'
  )

  const [userLocation, setUserLocation] = useState<{
    lat: number
    lng: number
  } | null>(null)

  const [locating, setLocating] = useState(false)

  const [selectorOpen, setSelectorOpen] = useState(false)
  const [mapPoint, setMapPoint] = useState<PickupPoint | null>(null)
  const [qrPoint, setQrPoint] = useState<PickupPoint | null>(null)

  const [selectedPointDetails, setSelectedPointDetails] =
    useState<PickupPoint | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState('')

  const LocationSelectorAny = LocationSelector as any

  const debouncedPointSearch = useDebouncedValue(pointSearch, 350)
  const debouncedPointCity = useDebouncedValue(pointCity, 350)

  const {
    control,
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CommandeForm>({
    resolver: zodResolver(commandeSchema),
    defaultValues: {
      currency: 'USD',
      type_livraison: 'domicile',
      point_retrait_id: null,
      adresse_id: null,
      use_new_address: false,
      destination_nom: '',
      destination_telephone: '',
      province_id: null,
      ville_id: null,
      commune_id: null,
      quartier: '',
      avenue: '',
      numero: '',
      reference: '',
      express: false,
      messageCadeau: '',
      deliveryNote: '',
    },
  })

  const currency = watch('currency')
  const typeLivraison = watch('type_livraison')
  const adresseId = watch('adresse_id')
  const useNewAddress = watch('use_new_address')
  const pointRetraitId = watch('point_retrait_id')

  const isPickup = typeLivraison === 'point_retrait'

  const cartItems = useMemo<NormalizedCartItem[]>(() => {
    const seen = new Map<string, number>()

    return items.map((raw, index) => {
      const normalized = normalizeCartItem(raw, index, rate)

      const baseKey = `${normalized.originalId}::${normalized.variantKey}`
      const occurrence = seen.get(baseKey) ?? 0

      seen.set(baseKey, occurrence + 1)

      const key =
        occurrence === 0 ? baseKey : `${baseKey}#${occurrence}`

      return {
        ...normalized,
        key,
      }
    })
  }, [items, rate])

  const shippingCartItems = useMemo(
    () => buildShippingCartItems(cartItems),
    [cartItems]
  )

  const deliveryAvailability = useMemo<DeliveryAvailability>(() => {
    if (shippingCartItems.length === 0) {
      return {
        domicile: { available: true, reason: null },
        point_retrait: { available: true, reason: null },
        express: { available: true, reason: null },
      }
    }

    try {
      return getAvailableDeliveryModes(shippingCartItems, rate)
    } catch {
      return {
        domicile: { available: true, reason: null },
        point_retrait: { available: true, reason: null },
        express: { available: true, reason: null },
      }
    }
  }, [rate, shippingCartItems])

  const currentShippingQuote = useMemo<ShippingQuote | null>(() => {
    if (shippingCartItems.length === 0) return null

    const modeId = typeLivraison as DeliveryModeId

    if (!deliveryAvailability[modeId]?.available) return null

    try {
      const subtotalUsd = roundUsd(
        cartItems.reduce(
          (sum, item) => sum + item.priceUsd * item.quantity,
          0
        )
      )

      return calculateShippingQuote({
        items: shippingCartItems,
        modeId,
        rate,
        subtotalUsd,
      })
    } catch {
      return null
    }
  }, [
    cartItems,
    deliveryAvailability,
    rate,
    shippingCartItems,
    typeLivraison,
  ])

  const hasCurrentShippingQuote = Boolean(
    currentShippingQuote && currentShippingQuote.available !== false
  )

  const totals = useMemo(
    () =>
      computeTotals(
        cartItems,
        summary,
        rate,
        currency,
        currentShippingQuote
      ),
    [cartItems, currency, currentShippingQuote, rate, summary]
  )

  const itemCount = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.quantity, 0),
    [cartItems]
  )

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === adresseId) || null,
    [adresseId, addresses]
  )

  const manualAddress = useNewAddress || !selectedAddress

  const selectedPoint = useMemo(() => {
    const found = points.find(
      (point) => String(point.id) === String(pointRetraitId)
    )

    return found || selectedPointDetails || null
  }, [pointRetraitId, points, selectedPointDetails])

  useEffect(() => {
    const currentMode = typeLivraison as DeliveryModeId
    const availability = deliveryAvailability[currentMode]

    if (availability && !availability.available) {
      const firstAvailable = DELIVERY_MODE_IDS.find(
        (modeId) => deliveryAvailability[modeId]?.available
      )

      if (firstAvailable && firstAvailable !== currentMode) {
        setValue('type_livraison', firstAvailable)

        addToast({
          type: 'warning',
          message: `Le mode « ${getDeliveryModeLabel(
            currentMode
          )} » n'est pas compatible avec certains articles. Mode ajusté : « ${getDeliveryModeLabel(
            firstAvailable
          )} ».`,
        })
      }
    }
  }, [addToast, deliveryAvailability, setValue, typeLivraison])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(
        `/login?redirect=${encodeURIComponent('/commande')}`
      )
    }
  }, [authLoading, router, user])

  useEffect(() => {
    if (!authLoading && user && items.length === 0 && !submitting) {
      router.push('/panier')
    }
  }, [authLoading, items.length, router, submitting, user])

  useEffect(() => {
    if (!user) return

    let cancelled = false

    const loadAddresses = async () => {
      setLoadingAddresses(true)

      try {
        const res = await fetch('/api/user/addresses', {
          credentials: 'include',
        })

        if (!res.ok) return

        const payload = await res.json()

        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : []

        if (!cancelled) setAddresses(list)
      } catch {
        if (!cancelled) setAddresses([])
      } finally {
        if (!cancelled) setLoadingAddresses(false)
      }
    }

    loadAddresses()

    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!addresses.length) {
      setValue('use_new_address', true)
      setValue('adresse_id', null)
      return
    }

    if (adresseId || useNewAddress) return

    const defaultAddress =
      addresses.find((a) => a.is_default) || addresses[0]

    setValue('adresse_id', defaultAddress.id)
    setValue('use_new_address', false)
    setValue('destination_nom', defaultAddress.destinataire || '')
    setValue('destination_telephone', defaultAddress.telephone || '')
  }, [adresseId, addresses, setValue, useNewAddress])

  useEffect(() => {
    if (!isPickup) {
      setValue('point_retrait_id', null)
      setSelectedPointDetails(null)
    }
  }, [isPickup, setValue])

  useEffect(() => {
    setValue('express', typeLivraison === 'express')
  }, [setValue, typeLivraison])

  useEffect(() => {
    if (!isPickup) return

    let cancelled = false

    const loadPoints = async () => {
      setPointsLoading(true)
      setPointsError(null)

      try {
        const params = new URLSearchParams()

        params.set('limit', '100')

        if (debouncedPointSearch.trim()) {
          params.set('search', debouncedPointSearch.trim())
        }

        if (debouncedPointCity.trim()) {
          params.set('ville', debouncedPointCity.trim())
        }

        if (userLocation) {
          params.set('lat', String(userLocation.lat))
          params.set('lng', String(userLocation.lng))
        }

        const res = await fetch(
          `/api/points-retrait?${params.toString()}`,
          {
            credentials: 'include',
            cache: 'no-store',
          }
        )

        if (!res.ok) {
          throw new Error(
            'Impossible de charger les points de retrait.'
          )
        }

        const payload = await res.json()

        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : []

        const normalized = list
          .map(normalizePickupPoint)
          .filter((point): point is PickupPoint => Boolean(point))

        const withDistance = normalized.map((point) => {
          if (point.distance !== undefined) {
            return point
          }

          if (
            userLocation &&
            point.latitude !== null &&
            point.longitude !== null
          ) {
            const distance = haversineDistanceKm(
              userLocation.lat,
              userLocation.lng,
              point.latitude,
              point.longitude
            )

            return {
              ...point,
              distance: Number(distance.toFixed(2)),
            }
          }

          return point
        })

        if (!cancelled) {
          setPoints(withDistance)
        }
      } catch (err: any) {
        if (!cancelled) {
          setPoints([])
          setPointsError(
            err?.message ||
              'Erreur lors du chargement des points.'
          )
        }
      } finally {
        if (!cancelled) {
          setPointsLoading(false)
        }
      }
    }

    loadPoints()

    return () => {
      cancelled = true
    }
  }, [
    debouncedPointCity,
    debouncedPointSearch,
    isPickup,
    userLocation,
  ])

  const requestLocation = useCallback(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      addToast({
        type: 'warning',
        message:
          'Géolocalisation non disponible sur cet appareil.',
      })
      return
    }

    setLocating(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })

        setLocating(false)

        addToast({
          type: 'success',
          message: 'Position mise à jour.',
        })
      },
      () => {
        setLocating(false)

        addToast({
          type: 'error',
          message:
            "Impossible d'obtenir ta position.",
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }, [addToast])

  const handleSelectPoint = useCallback(
    (point: PickupPoint) => {
      setValue('point_retrait_id', point.id, {
        shouldValidate: true,
      })

      setSelectedPointDetails(point)
      setSelectorOpen(false)

      addToast({
        type: 'success',
        message: `Point sélectionné : ${point.nom}`,
      })
    },
    [addToast, setValue]
  )

  const handleClearPoint = useCallback(() => {
    setValue('point_retrait_id', null, {
      shouldValidate: true,
    })

    setSelectedPointDetails(null)

    addToast({
      type: 'info',
      message: 'Point de retrait retiré.',
    })
  }, [addToast, setValue])

  const copyPointAddress = useCallback(
    async (point: PickupPoint) => {
      const text =
        `${point.nom}\n${point.adresse}\n${point.ville_nom || ''}`.trim()

      try {
        await navigator.clipboard.writeText(text)

        addToast({
          type: 'success',
          message: 'Adresse copiée.',
        })
      } catch {
        addToast({
          type: 'error',
          message:
            "Impossible de copier l'adresse.",
        })
      }
    },
    [addToast]
  )

  const sharePoint = useCallback(
    async (point: PickupPoint) => {
      const url = buildMapsUrl(point)

      try {
        if (navigator.share) {
          await navigator.share({
            title: point.nom,
            text: `${point.nom} - ${point.adresse}`,
            url,
          })
        } else {
          await navigator.clipboard.writeText(url)

          addToast({
            type: 'success',
            message: 'Lien copié.',
          })
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          addToast({
            type: 'error',
            message: 'Impossible de partager.',
          })
        }
      }
    },
    [addToast]
  )

  const sortedPoints = useMemo(() => {
    let list = [...points]

    if (onlyVerified) {
      list = list.filter(
        (point) => point.est_partenaire_verifie
      )
    }

    if (pointSort === 'distance') {
      list.sort((a, b) => {
        const aDist =
          a.distance ?? Number.POSITIVE_INFINITY
        const bDist =
          b.distance ?? Number.POSITIVE_INFINITY

        return aDist - bDist
      })
    } else if (pointSort === 'note') {
      list.sort((a, b) => {
        const aNote = a.note_moyenne ?? 0
        const bNote = b.note_moyenne ?? 0

        return bNote - aNote
      })
    } else {
      list.sort((a, b) => a.nom.localeCompare(b.nom))
    }

    return list
  }, [onlyVerified, pointSort, points])

  const cityOptions = useMemo(() => {
    const set = new Set(
      points
        .map((point) => point.ville_nom)
        .filter(Boolean)
        .map((value) => String(value))
    )

    return Array.from(set).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [points])

  const handleRemovePromo = useCallback(async () => {
    if (
      typeof cart?.removePromoCode !== 'function'
    ) {
      addToast({
        type: 'error',
        message:
          'Impossible de retirer le code promo.',
      })
      return
    }

    try {
      await cart.removePromoCode()

      addToast({
        type: 'info',
        message: 'Code promo retiré.',
      })
    } catch (err: any) {
      addToast({
        type: 'error',
        message:
          err?.message ||
          'Erreur lors du retrait du code promo.',
      })
    }
  }, [addToast, cart?.removePromoCode])

  const handleSelectSavedAddress = useCallback(
    (address: SavedAddress) => {
      setValue('adresse_id', address.id)
      setValue('use_new_address', false)

      setValue(
        'destination_nom',
        address.destinataire || ''
      )

      setValue(
        'destination_telephone',
        address.telephone || ''
      )

      setValue(
        'province_id',
        address.province_id ?? null
      )

      setValue(
        'ville_id',
        address.ville_id ?? null
      )

      setValue(
        'commune_id',
        address.commune_id ?? null
      )

      setValue('quartier', address.quartier || '')
      setValue('avenue', address.avenue || '')
      setValue('numero', address.numero || '')
      setValue(
        'reference',
        address.reference || ''
      )
    },
    [setValue]
  )

  const handleUseNewAddress = useCallback(() => {
    setValue('adresse_id', null)
    setValue('use_new_address', true)
  }, [setValue])

  const onSubmit = useCallback(
    async (values: CommandeForm) => {
      if (!user) {
        router.push(
          `/login?redirect=${encodeURIComponent('/commande')}`
        )
        return
      }

      if (cartItems.length === 0) {
        addToast({
          type: 'error',
          message: 'Votre panier est vide.',
        })

        router.push('/panier')
        return
      }

      if (!hasCurrentShippingQuote || !currentShippingQuote) {
        const modeId = values.type_livraison as DeliveryModeId
        const availability =
          deliveryAvailability[modeId]

        addToast({
          type: 'error',
          message:
            availability?.reason ||
            "Le mode de livraison sélectionné n'est pas disponible pour les articles de votre panier.",
        })

        return
      }

      const missingUsdItem = cartItems.some(
        (item) => item.priceUsd <= 0
      )

      if (missingUsdItem && !rateOk) {
        addToast({
          type: 'error',
          message:
            'Le taux USD/CDF est requis pour finaliser la commande. Patientez quelques secondes ou rechargez la page.',
        })

        return
      }

      setSubmitting(true)
      setGlobalError('')

      try {
        const pickupMode =
          values.type_livraison === 'point_retrait'

        let addressText = ''
        let communeId: number | string | null = null

        let pointPayload: {
          id: number | string
          nom: string
          adresse: string
          telephone?: string | null
        } | null = null

        if (pickupMode) {
          if (!selectedPoint) {
            throw new Error(
              'Choisissez un point de retrait.'
            )
          }

          addressText = selectedPoint.adresse
          communeId =
            selectedPoint.commune_id ?? null

          pointPayload = {
            id: selectedPoint.id,
            nom: selectedPoint.nom,
            adresse: selectedPoint.adresse,
            telephone:
              selectedPoint.telephone ?? null,
          }
        } else {
          const selected = addresses.find(
            (a) => a.id === values.adresse_id
          )

          const useManual =
            values.use_new_address || !selected

          const addressSource = useManual
            ? values
            : selected

          addressText = buildAddressText({
            quartier: addressSource?.quartier,
            avenue: addressSource?.avenue,
            numero: addressSource?.numero,
            reference: addressSource?.reference,
          })

          if (!addressText.trim()) {
            throw new Error(
              "Complétez l'adresse de livraison."
            )
          }

          communeId = useManual
            ? values.commune_id ?? null
            : selected?.commune_id ?? null
        }

        const apiItems = cartItems.map((item) => {
          let unitUsd =
            item.priceUsd > 0
              ? roundUsd(item.priceUsd)
              : 0

          let unitCdf =
            item.priceCdf > 0
              ? roundCdf(item.priceCdf)
              : 0

          if (unitUsd <= 0 && unitCdf > 0 && rateOk) {
            unitUsd = roundUsd(toUsd(unitCdf, rateNum))
          }

          if (unitCdf <= 0 && unitUsd > 0 && rateOk) {
            unitCdf = roundCdf(toCdf(unitUsd, rateNum))
          }

          if (unitUsd <= 0) {
            throw new Error(
              `Prix USD indisponible pour « ${item.nom} ».`
            )
          }

          if (unitCdf <= 0) {
            throw new Error(
              `Prix CDF indisponible pour « ${item.nom} ».`
            )
          }

          return {
            produit_id: item.originalId,
            quantite: item.quantity,

            prix_unitaire: unitCdf,
            prix_unitaire_usd: unitUsd,

            specifications: item.variantLabel || null,
            variante: item.variantLabel || null,

            variant_key: item.variantKey || null,
            variant_attributes:
              item.variantAttributes || null,
          }
        })

        const subtotalUsd = roundUsd(totals.subtotalUsd)
        const subtotalCdf = roundCdf(totals.subtotalCdf)

        const discountUsd = promoValid
          ? roundUsd(totals.discountUsd)
          : 0

        const discountCdf = promoValid
          ? rateOk && discountUsd > 0
            ? roundCdf(toCdf(discountUsd, rateNum))
            : roundCdf(totals.discountCdf)
          : 0

        const shippingUsd = roundUsd(totals.shippingUsd)

        const shippingCdf =
          rateOk && shippingUsd > 0
            ? roundCdf(toCdf(shippingUsd, rateNum))
            : roundCdf(totals.shippingCdf)

        let totalUsd = roundUsd(
          Math.max(
            0,
            subtotalUsd - discountUsd + shippingUsd
          )
        )

        let totalCdf =
          rateOk && totalUsd > 0
            ? roundCdf(toCdf(totalUsd, rateNum))
            : roundCdf(
                Math.max(
                  0,
                  subtotalCdf - discountCdf + shippingCdf
                )
              )

        if (totalUsd <= 0 && totalCdf > 0 && rateOk) {
          totalUsd = roundUsd(toUsd(totalCdf, rateNum))
        }

        if (totalCdf <= 0 && totalUsd > 0 && rateOk) {
          totalCdf = roundCdf(toCdf(totalUsd, rateNum))
        }

        if (totalCdf <= 0) {
          throw new Error(
            'Le total de la commande est invalide.'
          )
        }

        const body: Record<string, any> = {
          items: apiItems,

          adresse_livraison: addressText,
          commune_livraison_id: communeId ?? null,

          type_livraison: values.type_livraison,
          shipping_method: values.type_livraison,

          point_retrait_id:
            pointPayload?.id ?? null,
          point_retrait_nom:
            pointPayload?.nom ?? null,
          point_retrait_adresse:
            pointPayload?.adresse ?? null,
          point_retrait_telephone:
            pointPayload?.telephone ?? null,

          express:
            values.type_livraison === 'express' ||
            values.express,

          message_cadeau:
            values.messageCadeau?.trim() || null,
          delivery_note:
            values.deliveryNote?.trim() || null,

          reduction: discountCdf,
          code_promo: effectivePromoCode,

          remise_percent:
            promoValid && activePromo?.type === 'percent'
              ? Number(activePromo.value) || 0
              : 0,

          remise_montant: discountCdf,

          currency: values.currency,

          total_usd: totalUsd,
          total_cdf: totalCdf,

          shipping_usd: shippingUsd,
          shipping_cdf: shippingCdf,

          shipping_rate_used: rate || null,
          exchange_rate: rate || null,

          shipping_breakdown:
            currentShippingQuote?.breakdown ?? null,
          shipping_delay_label:
            currentShippingQuote?.delay_label ?? null,
        }

        const res = await fetch('/api/commandes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(body),
        })

        const result = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(
            result?.error ||
              'Erreur lors de la création de la commande.'
          )
        }

        const orderId =
          result?.id ||
          result?.data?.id ||
          result?.commande?.id ||
          result?.commande_id

        if (!orderId) {
          throw new Error(
            'Commande créée mais identifiant introuvable.'
          )
        }

        addToast({
          type: 'success',
          message:
            'Commande créée avec succès. Redirection vers le paiement...',
        })

        router.push(
          `/commande/paiement?id=${encodeURIComponent(
            String(orderId)
          )}&currency=${encodeURIComponent(values.currency)}`
        )
      } catch (err: any) {
        const message =
          err?.message ||
          'Impossible de finaliser la commande.'

        setGlobalError(message)

        addToast({
          type: 'error',
          message,
        })
      } finally {
        setSubmitting(false)
      }
    },
    [
      activePromo?.type,
      activePromo?.value,
      addToast,
      addresses,
      cartItems,
      currentShippingQuote,
      deliveryAvailability,
      effectivePromoCode,
      hasCurrentShippingQuote,
      promoValid,
      rate,
      rateNum,
      rateOk,
      router,
      selectedPoint,
      totals,
      user,
    ]
  )

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="space-y-4 text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2
            size={36}
            className="mx-auto animate-spin text-gold-500"
          />

          <p className="text-sm text-muted-foreground">
            Chargement de votre session...
          </p>
        </div>
      </div>
    )
  }

  if (!user) return null

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background pb-16">
        <Container className="py-16">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-gold-400/30 bg-gold-400/10">
              <ShoppingBag
                size={40}
                className="text-gold-500"
              />
            </div>

            <h1 className="font-serif text-3xl font-extrabold text-foreground">
              Votre panier est vide
            </h1>

            <p className="mt-3 text-muted-foreground">
              Ajoutez des produits avant de finaliser
              votre commande.
            </p>

            <div className="mt-8 flex justify-center">
              <Button
                type="button"
                variant="luxe"
                size="lg"
                onClick={() => router.push('/')}
                leftIcon={<ShoppingBag size={18} />}
              >
                Retour à la boutique
              </Button>
            </div>
          </div>
        </Container>
      </div>
    )
  }

  const shippingValueDisplay = hasCurrentShippingQuote
    ? totals.primaryShipping > 0
      ? formatMoney(
          totals.primaryShipping,
          totals.primaryCurrency
        )
      : 'Gratuite'
    : 'À confirmer'

  const shippingSecondaryDisplay =
    hasCurrentShippingQuote &&
    totals.secondaryShipping > 0 &&
    totals.secondaryShipping !== totals.primaryShipping
      ? `≈ ${formatMoney(
          totals.secondaryShipping,
          totals.secondaryCurrency
        )}`
      : null

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-16">
      <Container className="py-8 md:py-12">
        <Stepper />

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/panier"
              className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-gold-500"
            >
              <ArrowLeft size={16} />
              Retour au panier
            </Link>

            <h1 className="font-serif text-3xl font-extrabold text-foreground md:text-4xl">
              Finaliser la commande
            </h1>

            <p className="mt-2 text-muted-foreground">
              {itemCount} article{itemCount > 1 ? 's' : ''} • livraison en RDC
            </p>
          </div>

          <Badge variant="gold" size="sm" className="w-fit">
            <ShieldCheck size={12} className="mr-1" />
            Paiement sécurisé
          </Badge>
        </div>

        {globalError && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />

            <div>
              <p className="font-medium">Erreur</p>
              <p className="mt-1">{globalError}</p>
            </div>
          </div>
        )}

        {rateLoading && !rateOk && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <RefreshCw
              size={18}
              className="mt-0.5 shrink-0 animate-spin"
            />

            <p>
              Le taux USD/CDF est en cours de chargement. Vous pouvez
              continuer, mais la validation finale nécessitera le taux
              officiel.
            </p>
          </div>
        )}

        {totals.hasNonConsolidable && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <Info size={18} className="mt-0.5 shrink-0" />

            <div className="flex-1">
              <p className="font-medium">
                Certains articles ont des frais de livraison obligatoires
              </p>

              <p className="mt-1 text-xs opacity-90">
                Ces articles gardent leurs frais spécifiques même si
                d&apos;autres articles peuvent être regroupés. Le breakdown
                détaillé est affiché sous le mode de livraison choisi.
              </p>
            </div>
          </div>
        )}

        <form
          id="checkout-form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="grid gap-8 lg:grid-cols-3"
        >
          <div className="space-y-6 lg:col-span-2">
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard size={18} className="text-gold-500" />
                  Devise
                </CardTitle>

                <CardDescription>
                  Choisissez la devise principale d&apos;affichage et
                  d&apos;intention de paiement.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <Controller
                  name="currency"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-3">
                      {(['USD', 'CDF'] as Currency[]).map((curr) => (
                        <button
                          key={curr}
                          type="button"
                          onClick={() => field.onChange(curr)}
                          className={cn(
                            'flex min-w-[140px] flex-1 items-center justify-between rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                            field.value === curr
                              ? 'border-gold-400 bg-gold-500/10'
                              : 'border-border bg-card hover:border-gold-400/40'
                          )}
                          aria-pressed={field.value === curr}
                        >
                          <div>
                            <p className="text-sm font-bold text-foreground">
                              {curr === 'USD'
                                ? 'Dollar'
                                : 'Franc congolais'}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {curr === 'USD'
                                ? 'USD principal'
                                : 'CDF principal'}
                            </p>
                          </div>

                          <span className="text-lg font-extrabold text-gold-600">
                            {curr}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                />

                <p className="mt-3 text-xs text-muted-foreground">
                  USD reste la source de vérité. Le CDF est converti
                  automatiquement selon le taux officiel affiché.
                </p>
              </CardContent>
            </Card>

            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Phone size={18} className="text-gold-500" />
                  Coordonnées du destinataire
                </CardTitle>

                <CardDescription>
                  Ces informations sont utilisées pour le contact de livraison
                  ou de retrait.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Nom du destinataire"
                    required
                    error={errors.destination_nom?.message}
                  >
                    <input
                      {...register('destination_nom')}
                      className={inputClass}
                      placeholder="Ex : Jean Mukendi"
                    />
                  </Field>

                  <Field
                    label="Téléphone"
                    required
                    error={errors.destination_telephone?.message}
                  >
                    <input
                      {...register('destination_telephone')}
                      className={inputClass}
                      placeholder="08xxxxxxxx"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Truck size={18} className="text-gold-500" />
                  Mode de livraison
                </CardTitle>

                <CardDescription>
                  Sélectionnez le mode de livraison souhaité. Les modes
                  indisponibles sont grisés selon les articles du panier.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <Controller
                  name="type_livraison"
                  control={control}
                  render={({ field }) => (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {SHIPPING_OPTIONS.map((option) => {
                        const availability =
                          deliveryAvailability[option.id]

                        const isDisabled = !availability?.available
                        const isSelected = field.value === option.id

                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => field.onChange(option.id)}
                            className={cn(
                              'flex flex-col gap-2 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                              isSelected
                                ? 'border-gold-400 bg-gold-500/10'
                                : isDisabled
                                  ? 'cursor-not-allowed border-border bg-muted/40 opacity-60'
                                  : 'border-border bg-card hover:border-gold-400/40'
                            )}
                            aria-pressed={isSelected}
                            aria-disabled={isDisabled}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gold-500">
                                {option.icon}
                              </span>

                              <Badge variant="neutral" size="sm">
                                {option.delay}
                              </Badge>
                            </div>

                            <p className="text-sm font-semibold text-foreground">
                              {option.label}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {option.description}
                            </p>

                            {isDisabled && availability?.reason && (
                              <p className="mt-1 text-[11px] text-red-500">
                                {availability.reason}
                              </p>
                            )}

                            {!isDisabled &&
                              isSelected &&
                              hasCurrentShippingQuote && (
                                <p className="mt-1 text-xs font-medium text-gold-600">
                                  {totals.primaryShipping > 0
                                    ? formatMoney(
                                        totals.primaryShipping,
                                        totals.primaryCurrency
                                      )
                                    : 'Gratuite'}

                                  {' · '}

                                  {currentShippingQuote?.delay_label}
                                </p>
                              )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                />

                {currentShippingQuote && (
                  <DeliveryBreakdown
                    quote={currentShippingQuote}
                    primaryCurrency={totals.primaryCurrency}
                    defaultOpen={false}
                    compact
                  />
                )}

                {totals.deliveryWarnings.length > 0 && (
                  <div className="space-y-2">
                    {totals.deliveryWarnings.map((warning, index) => (
                      <p
                        key={`${warning}-${index}`}
                        className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                      >
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <AnimatePresence>
              {isPickup && (
                <motion.div
                  initial={
                    shouldAnimate ? { opacity: 0, y: 12 } : { opacity: 1 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    shouldAnimate ? { opacity: 0, y: -12 } : { opacity: 1 }
                  }
                  transition={{ duration: shouldAnimate ? 0.25 : 0 }}
                >
                  <Card variant="glass" className="border-gold-400/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MapPin size={18} className="text-gold-500" />
                        Point de retrait
                      </CardTitle>

                      <CardDescription>
                        Choisis un relais colis partenaire proche de toi.
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {selectedPoint ? (
                        <div className="rounded-2xl border border-gold-400/20 bg-background/60 p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 gap-3">
                              {selectedPoint.photo_url ? (
                                <img
                                  src={selectedPoint.photo_url}
                                  alt={selectedPoint.nom}
                                  className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-gold-600 dark:bg-gold-900/30 dark:text-gold-400">
                                  <Store size={22} />
                                </div>
                              )}

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-bold text-foreground">
                                    {selectedPoint.nom}
                                  </p>

                                  {selectedPoint.est_partenaire_verifie && (
                                    <Badge variant="gold" size="sm">
                                      <ShieldCheck
                                        size={12}
                                        className="mr-1"
                                      />
                                      Vérifié
                                    </Badge>
                                  )}

                                  {selectedPoint.distance !== undefined && (
                                    <Badge variant="neutral" size="sm">
                                      {formatDistance(
                                        selectedPoint.distance
                                      )}
                                    </Badge>
                                  )}
                                </div>

                                <p className="mt-1 text-sm text-muted-foreground">
                                  {selectedPoint.adresse}
                                </p>

                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                  {selectedPoint.ville_nom && (
                                    <span className="flex items-center gap-1">
                                      <MapPin size={12} />
                                      {selectedPoint.ville_nom}
                                    </span>
                                  )}

                                  {selectedPoint.telephone && (
                                    <span className="flex items-center gap-1">
                                      <Phone size={12} />
                                      {selectedPoint.telephone}
                                    </span>
                                  )}

                                  {selectedPoint.horaires && (
                                    <span className="flex items-center gap-1">
                                      <Clock size={12} />
                                      {selectedPoint.horaires}
                                    </span>
                                  )}

                                  {typeof selectedPoint.note_moyenne ===
                                    'number' && (
                                    <span className="flex items-center gap-1 text-amber-500">
                                      <Star
                                        size={12}
                                        fill="currentColor"
                                      />
                                      {selectedPoint.note_moyenne.toFixed(1)}
                                    </span>
                                  )}
                                </div>

                                {selectedPoint.instructions_retrait && (
                                  <p className="mt-3 rounded-xl border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">
                                      Instructions :
                                    </span>{' '}
                                    {selectedPoint.instructions_retrait}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline-gold"
                                size="sm"
                                onClick={() => setSelectorOpen(true)}
                                leftIcon={<Search size={14} />}
                              >
                                Changer
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                leftIcon={<Navigation size={14} />}
                                onClick={() =>
                                  window.open(
                                    buildDirectionsUrl(selectedPoint),
                                    '_blank',
                                    'noopener,noreferrer'
                                  )
                                }
                              >
                                Itinéraire
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setMapPoint(selectedPoint)
                                }
                                leftIcon={<MapIcon size={14} />}
                              >
                                Carte
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setQrPoint(selectedPoint)
                                }
                                leftIcon={<QrCode size={14} />}
                              >
                                QR
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyPointAddress(selectedPoint)
                                }
                                leftIcon={<Copy size={14} />}
                              >
                                Copier
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleClearPoint}
                                leftIcon={<X size={14} />}
                                className="text-red-500"
                              >
                                Retirer
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border bg-background/40 p-6 text-center">
                          <MapPin
                            size={32}
                            className="mx-auto mb-3 text-muted-foreground"
                          />

                          <p className="text-sm font-medium text-foreground">
                            Aucun point de retrait sélectionné
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            Choisis un relais colis partenaire pour retirer ta
                            commande.
                          </p>

                          <Button
                            type="button"
                            variant="luxe"
                            size="sm"
                            className="mt-4"
                            onClick={() => setSelectorOpen(true)}
                            leftIcon={<Search size={14} />}
                          >
                            Choisir un point
                          </Button>
                        </div>
                      )}

                      {errors.point_retrait_id && (
                        <p className="text-xs text-red-500">
                          {errors.point_retrait_id.message}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {!isPickup && (
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin size={18} className="text-gold-500" />
                    Adresse de livraison
                  </CardTitle>

                  <CardDescription>
                    Choisissez une adresse enregistrée ou saisissez-en une
                    nouvelle.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5">
                  {loadingAddresses ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      Chargement de vos adresses...
                    </div>
                  ) : addresses.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        Adresses enregistrées
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {addresses.map((address) => {
                          const isActive =
                            adresseId === address.id && !useNewAddress

                          return (
                            <button
                              key={address.id}
                              type="button"
                              onClick={() =>
                                handleSelectSavedAddress(address)
                              }
                              className={cn(
                                'rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                                isActive
                                  ? 'border-gold-400 bg-gold-500/10'
                                  : 'border-border bg-card hover:border-gold-400/40'
                              )}
                              aria-pressed={isActive}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                  {address.nom || 'Adresse'}
                                </p>

                                {address.is_default && (
                                  <Badge variant="gold" size="sm">
                                    Défaut
                                  </Badge>
                                )}
                              </div>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {address.destinataire || '—'} •{' '}
                                {address.telephone || '—'}
                              </p>

                              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                {buildAddressText(address) ||
                                  'Adresse incomplète'}
                              </p>
                            </button>
                          )
                        })}

                        <button
                          type="button"
                          onClick={handleUseNewAddress}
                          className={cn(
                            'flex min-h-[112px] items-center justify-center rounded-2xl border border-dashed p-4 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                            useNewAddress
                              ? 'border-gold-400 bg-gold-500/10 text-gold-700 dark:text-gold-300'
                              : 'border-border bg-card text-muted-foreground hover:border-gold-400/40 hover:text-foreground'
                          )}
                        >
                          + Nouvelle adresse
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                      Aucune adresse enregistrée. Saisissez une adresse de
                      livraison ci-dessous.
                    </div>
                  )}

                  <AnimatePresence>
                    {manualAddress && (
                      <motion.div
                        initial={
                          shouldAnimate
                            ? { opacity: 0, height: 0 }
                            : { opacity: 1 }
                        }
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={
                          shouldAnimate
                            ? { opacity: 0, height: 0 }
                            : { opacity: 1 }
                        }
                        className="overflow-hidden"
                      >
                        <div className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
                          <p className="text-sm font-medium text-foreground">
                            Nouvelle adresse
                          </p>

                          <Field
                            label="Localisation"
                            required
                            error={errors.commune_id?.message}
                            hint="Province, ville et commune."
                          >
                            <Controller
                              name="commune_id"
                              control={control}
                              render={({ field }) => (
                                <LocationSelectorAny
                                  value={{
                                    province_id: watch('province_id'),
                                    ville_id: watch('ville_id'),
                                    commune_id: field.value,
                                  }}
                                  onChange={(data: any) => {
                                    setValue(
                                      'province_id',
                                      data?.province_id ?? null
                                    )

                                    setValue(
                                      'ville_id',
                                      data?.ville_id ?? null
                                    )

                                    field.onChange(
                                      data?.commune_id ?? null
                                    )
                                  }}
                                />
                              )}
                            />
                          </Field>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                              label="Quartier"
                              required
                              error={errors.quartier?.message}
                            >
                              <input
                                {...register('quartier')}
                                className={inputClass}
                                placeholder="Ex : Limete"
                              />
                            </Field>

                            <Field
                              label="Avenue"
                              required
                              error={errors.avenue?.message}
                            >
                              <input
                                {...register('avenue')}
                                className={inputClass}
                                placeholder="Ex : Avenue Kasa-Vubu"
                              />
                            </Field>

                            <Field
                              label="Numéro"
                              required
                              error={errors.numero?.message}
                            >
                              <input
                                {...register('numero')}
                                className={inputClass}
                                placeholder="Ex : 123"
                              />
                            </Field>

                            <Field
                              label="Point de repère"
                              error={errors.reference?.message}
                            >
                              <input
                                {...register('reference')}
                                className={inputClass}
                                placeholder="Ex : à côté de l'école"
                              />
                            </Field>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            )}

            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Gift size={18} className="text-gold-500" />
                  Options complémentaires
                </CardTitle>

                <CardDescription>
                  Message cadeau et instructions de livraison.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <Field
                  label="Message cadeau"
                  hint="Optionnel — max 200 caractères"
                >
                  <textarea
                    {...register('messageCadeau')}
                    rows={3}
                    maxLength={200}
                    className={cn(inputClass, 'resize-none')}
                    placeholder="Ex : Joyeux anniversaire, profite bien !"
                  />
                </Field>

                <Field
                  label="Instructions de livraison"
                  hint="Optionnel — max 250 caractères"
                >
                  <textarea
                    {...register('deliveryNote')}
                    rows={3}
                    maxLength={250}
                    className={cn(inputClass, 'resize-none')}
                    placeholder="Ex : Sonner à l'étage 2, laisser au gardien..."
                  />
                </Field>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold backdrop-blur-xl">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                      <Package size={18} className="text-gold-500" />
                      Récapitulatif
                    </h2>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Prix principaux en {totals.primaryCurrency}
                      {totals.secondaryCurrency !==
                        totals.primaryCurrency &&
                        ` • conversion ${totals.secondaryCurrency}`}
                    </p>
                  </div>

                  <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                    {cartItems.map((item) => {
                      const linePrimary =
                        totals.primaryCurrency === 'USD'
                          ? item.lineUsd
                          : item.lineCdf

                      const lineSecondary =
                        totals.secondaryCurrency === 'USD'
                          ? item.lineUsd
                          : item.lineCdf

                      return (
                        <div
                          key={item.key}
                          className="flex items-start gap-3 rounded-xl border border-border bg-background/50 p-2"
                        >
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                            <img
                              src={item.image || PLACEHOLDER}
                              alt={item.nom}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-medium text-foreground">
                              {item.nom}
                            </p>

                            {item.variantLabel && (
                              <p className="text-xs text-muted-foreground">
                                {item.variantLabel}
                              </p>
                            )}

                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                Qté : {item.quantity}
                              </p>

                              {item.nonConsolidable && (
                                <Badge variant="neutral" size="sm">
                                  <Truck size={10} className="mr-1" />
                                  Frais spécifiques
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-gold-600">
                              {formatMoney(
                                linePrimary,
                                totals.primaryCurrency
                              )}
                            </p>

                            {lineSecondary > 0 &&
                              lineSecondary !== linePrimary && (
                                <p className="text-[10px] text-muted-foreground">
                                  ≈{' '}
                                  {formatMoney(
                                    lineSecondary,
                                    totals.secondaryCurrency
                                  )}
                                </p>
                              )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {isPickup && selectedPoint && (
                    <div className="rounded-xl border border-gold-400/20 bg-gold-500/5 p-3">
                      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-gold-700 dark:text-gold-300">
                        <MapPin size={12} />
                        Point de retrait
                      </p>

                      <p className="text-sm font-semibold text-foreground">
                        {selectedPoint.nom}
                      </p>

                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {selectedPoint.adresse}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3 border-t border-border pt-4">
                    <SummaryRow
                      label="Sous-total"
                      value={formatMoney(
                        totals.primarySubtotal,
                        totals.primaryCurrency
                      )}
                      secondary={
                        totals.secondarySubtotal > 0 &&
                        totals.secondarySubtotal !==
                          totals.primarySubtotal
                          ? `≈ ${formatMoney(
                              totals.secondarySubtotal,
                              totals.secondaryCurrency
                            )}`
                          : null
                      }
                      icon={<Package size={14} />}
                    />

                    {promoValid && totals.primaryDiscount > 0 && (
                      <SummaryRow
                        label={
                          activePromo?.code
                            ? `Remise (${activePromo.code})`
                            : 'Remise'
                        }
                        value={`- ${formatMoney(
                          totals.primaryDiscount,
                          totals.primaryCurrency
                        )}`}
                        secondary={
                          totals.secondaryDiscount > 0 &&
                          totals.secondaryDiscount !==
                            totals.primaryDiscount
                            ? `- ${formatMoney(
                                totals.secondaryDiscount,
                                totals.secondaryCurrency
                              )}`
                            : null
                        }
                        tone="discount"
                        icon={<Tag size={14} />}
                      />
                    )}

                    <SummaryRow
                      label={`Livraison (${getDeliveryModeLabel(
                        typeLivraison as DeliveryModeId
                      )})`}
                      value={shippingValueDisplay}
                      secondary={shippingSecondaryDisplay}
                      icon={<Truck size={14} />}
                    />

                    {hasCurrentShippingQuote &&
                      currentShippingQuote?.delay_label && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock size={12} className="text-gold-500" />
                          Délai estimé :{' '}
                          {currentShippingQuote.delay_label}
                        </div>
                      )}
                  </div>

                  <div className="border-t border-gold-400/20 pt-4">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Total commande
                        </p>

                        <p className="text-xs text-muted-foreground">
                          Livraison estimée incluse. Le montant final peut être
                          validé au paiement.
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-2xl font-extrabold text-gold-600">
                          {formatMoney(
                            totals.primaryTotal,
                            totals.primaryCurrency
                          )}
                        </p>

                        {totals.secondaryTotal > 0 &&
                          totals.secondaryTotal !==
                            totals.primaryTotal && (
                            <p className="text-xs text-muted-foreground">
                              ≈{' '}
                              {formatMoney(
                                totals.secondaryTotal,
                                totals.secondaryCurrency
                              )}
                            </p>
                          )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Tag size={14} className="text-gold-500" />
                      Code promo
                    </p>

                    {activePromo ? (
                      promoValid ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                {activePromo.code}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                Remise :{' '}
                                {formatMoney(
                                  totals.primaryDiscount,
                                  totals.primaryCurrency
                                )}
                              </p>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void handleRemovePromo()
                              }
                              leftIcon={<X size={14} />}
                            >
                              Retirer
                            </Button>
                          </div>

                          <Link
                            href="/panier"
                            className="inline-flex items-center gap-1 text-xs text-gold-600 transition hover:text-gold-700 hover:underline"
                          >
                            <ExternalLink size={12} />
                            Modifier dans le panier
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                          <div className="flex items-start gap-2">
                            <AlertCircle
                              size={16}
                              className="mt-0.5 shrink-0"
                            />

                            <div className="min-w-0">
                              <p className="font-semibold">
                                {activePromo.code}
                              </p>

                              <p className="mt-1 text-xs">
                                {promoRequirementMessage ||
                                  'Ce code promo n’est pas applicable pour le moment.'}
                              </p>

                              {promoRemainingUsd > 0 && (
                                <p className="mt-1 text-[11px] opacity-90">
                                  Ajoutez encore{' '}
                                  {formatUsd(promoRemainingUsd)}
                                  {rateOk
                                    ? ` ≈ ${formatCdf(
                                        promoRemainingUsd * rateNum
                                      )}`
                                    : ''}{' '}
                                  pour utiliser ce code promo.
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void handleRemovePromo()
                              }
                              leftIcon={<X size={14} />}
                            >
                              Retirer
                            </Button>

                            <Link
                              href="/panier"
                              className="inline-flex items-center gap-1 text-xs text-gold-600 transition hover:text-gold-700 hover:underline"
                            >
                              <ExternalLink size={12} />
                              Modifier dans le panier
                            </Link>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Aucun code promo appliqué.
                        </p>

                        <Link
                          href="/panier"
                          className="inline-flex items-center gap-1 text-xs text-gold-600 transition hover:text-gold-700 hover:underline"
                        >
                          <ExternalLink size={12} />
                          Ajouter un code promo dans le panier
                        </Link>
                      </div>
                    )}

                    {promoError && !activePromo && (
                      <p className="text-xs text-red-500">{promoError}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="luxe"
                    fullWidth
                    size="lg"
                    disabled={
                      submitting || !hasCurrentShippingQuote
                    }
                    className="shadow-gold hover:shadow-glow-gold"
                    leftIcon={
                      submitting ? (
                        <Loader2
                          size={18}
                          className="animate-spin"
                        />
                      ) : (
                        <CreditCard size={18} />
                      )
                    }
                  >
                    {submitting
                      ? 'Traitement...'
                      : !hasCurrentShippingQuote
                        ? 'Mode de livraison indisponible'
                        : 'Continuer vers le paiement'}
                  </Button>

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck
                        size={14}
                        className="text-gold-500"
                      />
                      Paiement sécurisé Mobile Money / carte
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Truck size={14} className="text-gold-500" />
                      Livraison suivie à Kinshasa et provinces
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Info size={14} className="text-gold-500" />
                      Aucune donnée de portefeuille n&apos;est utilisée
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Container>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Total</p>

            <p className="truncate text-lg font-bold text-gold-600">
              {formatMoney(
                totals.primaryTotal,
                totals.primaryCurrency
              )}
            </p>

            {totals.secondaryTotal > 0 &&
              totals.secondaryTotal !== totals.primaryTotal && (
                <p className="truncate text-[11px] text-muted-foreground">
                  ≈{' '}
                  {formatMoney(
                    totals.secondaryTotal,
                    totals.secondaryCurrency
                  )}
                </p>
              )}
          </div>

          <Button
            type="submit"
            form="checkout-form"
            variant="luxe"
            className="shrink-0"
            disabled={submitting || !hasCurrentShippingQuote}
            leftIcon={
              submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ChevronRight size={16} />
              )
            }
          >
            Payer
          </Button>
        </div>
      </div>

      <SimpleModal
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        title="Choisir un point de retrait"
        description="Recherche, filtre et sélectionne le relais colis le plus pratique."
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />

              <input
                value={pointSearch}
                onChange={(event) =>
                  setPointSearch(event.target.value)
                }
                placeholder="Rechercher un point, une adresse..."
                className={cn(inputClass, 'pl-9')}
              />
            </div>

            <div className="relative min-w-[160px]">
              <input
                value={pointCity}
                onChange={(event) =>
                  setPointCity(event.target.value)
                }
                list="checkout-pickup-city-options"
                placeholder="Ville..."
                className={inputClass}
              />

              <datalist id="checkout-pickup-city-options">
                {cityOptions.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </div>

            <select
              value={pointSort}
              onChange={(event) =>
                setPointSort(event.target.value as any)
              }
              className={cn(inputClass, 'min-w-[150px]')}
            >
              <option value="distance">
                Trier par distance
              </option>
              <option value="note">Trier par note</option>
              <option value="name">Trier par nom</option>
            </select>

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={onlyVerified}
                onChange={(event) =>
                  setOnlyVerified(event.target.checked)
                }
                className="h-4 w-4 rounded border-border text-gold-500 focus:ring-gold-500"
              />
              Vérifiés seulement
            </label>

            <Button
              type="button"
              variant="outline-gold"
              size="sm"
              onClick={requestLocation}
              loading={locating}
              leftIcon={<Navigation size={14} />}
            >
              Ma position
            </Button>
          </div>

          {pointsLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <PickupPointSkeleton key={index} />
              ))}
            </div>
          ) : pointsError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              <p className="mb-2 flex items-center gap-2 font-medium">
                <AlertTriangle size={16} />
                Erreur de chargement
              </p>

              <p>{pointsError}</p>
            </div>
          ) : sortedPoints.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Aucun point de retrait trouvé.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sortedPoints.map((point) => {
                const isSelected =
                  String(point.id) === String(pointRetraitId)

                return (
                  <div
                    key={String(point.id)}
                    className={cn(
                      'rounded-2xl border p-4 transition',
                      isSelected
                        ? 'border-gold-400 bg-gold-500/10'
                        : 'border-border bg-card hover:border-gold-400/40'
                    )}
                  >
                    <div className="flex gap-3">
                      {point.photo_url ? (
                        <img
                          src={point.photo_url}
                          alt={point.nom}
                          className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-gold-600 dark:bg-gold-900/30 dark:text-gold-400">
                          <Store size={22} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-bold text-foreground">
                            {point.nom}
                          </p>

                          {point.est_partenaire_verifie && (
                            <Badge variant="gold" size="sm">
                              <ShieldCheck
                                size={12}
                                className="mr-1"
                              />
                              Vérifié
                            </Badge>
                          )}

                          {point.distance !== undefined && (
                            <Badge variant="neutral" size="sm">
                              {formatDistance(point.distance)}
                            </Badge>
                          )}
                        </div>

                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {point.adresse}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                          {point.ville_nom && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} />
                              {point.ville_nom}
                            </span>
                          )}

                          {point.horaires && (
                            <span className="flex items-center gap-1">
                              <Clock size={11} />
                              {point.horaires}
                            </span>
                          )}

                          {typeof point.note_moyenne === 'number' && (
                            <span className="flex items-center gap-1 text-amber-500">
                              <Star
                                size={11}
                                fill="currentColor"
                              />
                              {point.note_moyenne.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={
                          isSelected ? 'accent' : 'luxe'
                        }
                        size="sm"
                        onClick={() =>
                          handleSelectPoint(point)
                        }
                        leftIcon={
                          isSelected ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <MapPin size={14} />
                          )
                        }
                      >
                        {isSelected
                          ? 'Sélectionné'
                          : 'Choisir'}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leftIcon={<Navigation size={14} />}
                        onClick={() =>
                          window.open(
                            buildDirectionsUrl(point),
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                      >
                        Itinéraire
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMapPoint(point)}
                        leftIcon={<MapIcon size={14} />}
                      >
                        Carte
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setQrPoint(point)}
                        leftIcon={<QrCode size={14} />}
                      >
                        QR
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SimpleModal>

      <SimpleModal
        open={Boolean(mapPoint)}
        onClose={() => setMapPoint(null)}
        title={mapPoint?.nom || 'Carte'}
        description={mapPoint?.adresse}
        size="lg"
        footer={
          mapPoint ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMapPoint(null)}
              >
                Fermer
              </Button>

              <Button
                type="button"
                variant="luxe"
                leftIcon={<Navigation size={14} />}
                onClick={() =>
                  window.open(
                    buildDirectionsUrl(mapPoint),
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                Itinéraire
              </Button>
            </>
          ) : null
        }
      >
        {mapPoint ? (
          mapPoint.latitude !== null &&
          mapPoint.longitude !== null ? (
            <iframe
              title={`Carte ${mapPoint.nom}`}
              src={buildOsmEmbedUrl(mapPoint) || ''}
              className="h-[420px] w-full rounded-xl border border-border"
              loading="lazy"
            />
          ) : (
            <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-center text-sm text-muted-foreground">
              Ce point n&apos;a pas encore de coordonnées GPS.
            </div>
          )
        ) : null}
      </SimpleModal>

      <SimpleModal
        open={Boolean(qrPoint)}
        onClose={() => setQrPoint(null)}
        title={qrPoint?.nom || 'QR code'}
        description="Scanne ce QR code pour ouvrir l'itinéraire."
        size="sm"
        footer={
          qrPoint ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setQrPoint(null)}
              >
                Fermer
              </Button>

              <Button
                type="button"
                variant="luxe"
                onClick={() =>
                  copyPointAddress(qrPoint)
                }
                leftIcon={<Copy size={14} />}
              >
                Copier adresse
              </Button>
            </>
          ) : null
        }
      >
        {qrPoint ? (
          <div className="text-center">
            <img
              src={buildQrUrl(qrPoint)}
              alt={`QR code ${qrPoint.nom}`}
              className="mx-auto h-52 w-52 rounded-xl border border-border bg-white p-3"
            />

            <p className="mt-3 text-sm font-semibold text-foreground">
              {qrPoint.nom}
            </p>

            <p className="text-xs text-muted-foreground">
              {qrPoint.adresse}
            </p>
          </div>
        ) : null}
      </SimpleModal>
    </div>
  )
}