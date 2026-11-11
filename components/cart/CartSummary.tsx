// components/cart/CartSummary.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  AlertCircle,
  ChevronRight,
  Info,
  Loader2,
  Percent,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react'

import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

interface PricePair {
  usd: number
  cdf: number
}

interface DisplayPrice {
  primaryCurrency: Currency
  primaryAmount: number
  secondaryCurrency: Currency
  secondaryAmount: number
}

interface NormalizedCartItem {
  key: string
  originalId: string
  variantKey: string
  nom: string
  image: string
  quantity: number
  priceUsd: number
  priceCdf: number
  lineUsd: number
  lineCdf: number
  unitDisplay: DisplayPrice
  lineDisplay: DisplayPrice
  stock: number | null
  isOutOfStock: boolean
  variantLabel: string | null
}

interface PromoCodeLike {
  code: string
  type?: 'percent' | 'fixed'
  value?: number
  minTotal?: number
  minTotalUsd?: number
  maxDiscount?: number
  maxDiscountUsd?: number
  description?: string
  valid?: boolean
  remainingToMinUsd?: number
  message?: string
}

interface CartSummaryProps {
  onCheckout?: () => void
  showCheckoutButton?: boolean
  compact?: boolean
  className?: string

  /** Devise principale d’affichage. USD reste la source de vérité. */
  displayCurrency?: Currency

  /** Afficher le prix secondaire calculé */
  showSecondaryPrice?: boolean

  /** Afficher le champ code promo */
  showPromoCode?: boolean

  /** Afficher l’estimation de livraison */
  showShippingEstimate?: boolean

  /**
   * Seuil de livraison gratuite.
   * Par défaut compatibilité legacy : valeur en CDF.
   * Utiliser thresholdCurrency="USD" si la valeur est déjà en USD.
   */
  freeShippingThreshold?: number

  /** Devise du seuil de livraison gratuite */
  thresholdCurrency?: Currency
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const PLACEHOLDER = '/placeholder.jpg'
const DEFAULT_FREE_SHIPPING_THRESHOLD_CDF = 50000

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
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

function formatMoney(value: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

/**
 * Clé de variante canonique.
 *
 * IMPORTANT :
 * - trie les clés ;
 * - ignore les valeurs vides ;
 * - évite les doublons dus à l’ordre des attributs.
 */
function stableVariantKey(variante: any): string {
  if (!variante) return ''

  if (typeof variante === 'string') {
    const trimmed = variante.trim()

    if (!trimmed) return ''

    try {
      const parsed = JSON.parse(trimmed)

      if (parsed && typeof parsed === 'object') {
        return stableVariantKey({ attributes: parsed })
      }
    } catch {
      return ''
    }

    return ''
  }

  const attrs = variante?.attributes

  if (!attrs || typeof attrs !== 'object') return ''

  const entries = Object.entries(attrs).filter(([key, value]) => {
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

function getVariantLabel(variante: any): string | null {
  if (!variante) return null

  if (typeof variante === 'string') {
    const label = variante.trim()
    return label || null
  }

  const attrs = variante?.attributes

  if (attrs && typeof attrs === 'object') {
    const values = Object.entries(attrs)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .map(([, value]) => String(value))

    if (values.length > 0) return values.join(' • ')
  }

  const nom = variante?.nom || variante?.name

  if (nom) return String(nom)

  return null
}

function getItemImage(item: any): string {
  if (typeof item?.image === 'string' && item.image.trim()) return item.image

  if (Array.isArray(item?.images) && item.images.length > 0) {
    const first = item.images[0]

    if (typeof first === 'string' && first.trim()) return first
  }

  if (typeof item?.variante?.image === 'string' && item.variante.image.trim()) {
    return item.variante.image
  }

  if (Array.isArray(item?.variante?.images) && item.variante.images.length > 0) {
    const first = item.variante.images[0]

    if (typeof first === 'string' && first.trim()) return first
  }

  return PLACEHOLDER
}

function getItemName(item: any): string {
  return String(item?.nom || item?.name || item?.variante?.nom || 'Produit')
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

function selectDisplayPrice(
  pair: PricePair,
  preferredCurrency: Currency
): DisplayPrice {
  const otherCurrency: Currency =
    preferredCurrency === 'USD' ? 'CDF' : 'USD'

  let primaryCurrency = preferredCurrency
  let primaryAmount =
    preferredCurrency === 'USD' ? pair.usd : pair.cdf

  let secondaryCurrency = otherCurrency
  let secondaryAmount =
    otherCurrency === 'USD' ? pair.usd : pair.cdf

  /**
   * Si la devise préférée n’a pas de valeur exploitable,
   * on bascule sur l’autre devise disponible.
   */
  if (primaryAmount <= 0 && secondaryAmount > 0) {
    primaryCurrency = otherCurrency
    primaryAmount = secondaryAmount

    secondaryCurrency = preferredCurrency
    secondaryAmount =
      preferredCurrency === 'USD' ? pair.usd : pair.cdf
  }

  return {
    primaryCurrency,
    primaryAmount:
      primaryCurrency === 'USD'
        ? roundUsd(primaryAmount)
        : roundCdf(primaryAmount),
    secondaryCurrency,
    secondaryAmount:
      secondaryCurrency === 'USD'
        ? roundUsd(secondaryAmount)
        : roundCdf(secondaryAmount),
  }
}

function safeAdd(...values: number[]): number {
  return values.reduce((acc, value) => {
    const n = Number(value)
    return Number.isFinite(n) ? acc + n : acc
  }, 0)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUMMARY LINE                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function SummaryLine({
  label,
  icon,
  display,
  tone = 'default',
  showSecondary = true,
  isNegative = false,
  freeLabel,
  secondaryPrefix = '≈ ',
}: {
  label: string
  icon?: ReactNode
  display: DisplayPrice
  tone?: 'default' | 'discount' | 'total' | 'muted'
  showSecondary?: boolean
  isNegative?: boolean
  freeLabel?: string
  secondaryPrefix?: string
}) {
  const hasPrimary = display.primaryAmount > 0
  const hasSecondary =
    showSecondary &&
    display.secondaryAmount > 0 &&
    display.secondaryAmount !== display.primaryAmount

  const primaryText = hasPrimary
    ? `${isNegative ? '- ' : ''}${formatMoney(
        display.primaryAmount,
        display.primaryCurrency
      )}`
    : freeLabel ?? '—'

  const secondaryText = hasSecondary
    ? `${secondaryPrefix}${isNegative ? '- ' : ''}${formatMoney(
        display.secondaryAmount,
        display.secondaryCurrency
      )}`
    : null

  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {icon && (
          <span
            className={cn(
              'shrink-0',
              tone === 'discount'
                ? 'text-emerald-500'
                : tone === 'total'
                  ? 'text-gold-500'
                  : 'text-muted-foreground'
            )}
          >
            {icon}
          </span>
        )}

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
          {primaryText}
        </p>

        {secondaryText && (
          <p className="text-[11px] text-muted-foreground">
            {secondaryText}
          </p>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CART SUMMARY                                                   */
/* ═══════════════════════════════════════════════════════════════ */

export default function CartSummary({
  onCheckout,
  showCheckoutButton = true,
  compact = false,
  className,
  displayCurrency = 'USD',
  showSecondaryPrice = true,
  showPromoCode = true,
  showShippingEstimate = true,
  freeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD_CDF,
  thresholdCurrency = 'CDF',
}: CartSummaryProps) {
  const router = useRouter()
  const toast = useToast() as any
  const addToast = toast?.addToast

  const cart = useCart() as any

  const itemsRaw: any[] = useMemo(
    () => (Array.isArray(cart?.items) ? cart.items : []),
    [cart?.items]
  )

  const summary: any = useMemo(
    () => cart?.summary ?? {},
    [cart?.summary]
  )

  const activePromo = useMemo(
    () => (cart?.activePromo as PromoCodeLike | null) ?? null,
    [cart?.activePromo]
  )

  const promoErrorContext = cart?.promoError ?? null

  const isSyncing = Boolean(cart?.isSyncing)
  const loading = Boolean(cart?.loading)
  const cartError = cart?.error ?? null

  const applyPromoCode = cart?.applyPromoCode
  const removePromoCode = cart?.removePromoCode
  const updateQuantity = cart?.updateQuantity
  const removeItem = cart?.removeItem
  const clearCart = cart?.clearCart

  const exchange = useExchangeRate() as any

  const rawRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  const rateLoading = Boolean(exchange?.loading)

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

  const [promoInput, setPromoInput] = useState('')
  const [applyingPromo, setApplyingPromo] = useState(false)
  const [promoError, setPromoError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  /* ---------------------------------------------------------- */
  /*  Normalisation des articles                                 */
  /* ---------------------------------------------------------- */

  const items = useMemo<NormalizedCartItem[]>(() => {
    const seen = new Map<string, number>()

    return itemsRaw.map((raw: any, index: number) => {
      const originalId = String(
        raw?.product_id || raw?.id || `${getItemName(raw)}-${index}`
      )

      const variantKey = stableVariantKey(raw?.variante)

      const baseKey = `${originalId}|${variantKey}`
      const occurrence = seen.get(baseKey) ?? 0
      seen.set(baseKey, occurrence + 1)

      const key =
        occurrence === 0 ? baseKey : `${baseKey}#${occurrence}`

      const quantity = safeQuantity(raw?.quantite ?? raw?.quantity)

      const unitUsdSource = firstPositive(
        raw?.prix_usd,
        raw?.price_usd,
        raw?.unit_price_usd,
        raw?.variante?.prix_specifique_usd
      )

      const unitCdfSource = firstPositive(
        raw?.prix,
        raw?.price,
        raw?.prix_cdf,
        raw?.price_cdf,
        raw?.variante?.prix_specifique_cdf,
        raw?.variante?.prix_specifique,
        raw?.variante?.prix
      )

      const unitPair = resolvePricePair(
        unitUsdSource,
        unitCdfSource,
        rate
      )

      const linePair: PricePair = {
        usd: roundUsd(unitPair.usd * quantity),
        cdf: roundCdf(unitPair.cdf * quantity),
      }

      const stock =
        typeof raw?.stock === 'number' && Number.isFinite(raw.stock)
          ? raw.stock
          : typeof raw?.stock_disponible === 'number' &&
              Number.isFinite(raw.stock_disponible)
            ? raw.stock_disponible
            : null

      return {
        key,
        originalId,
        variantKey,
        nom: getItemName(raw),
        image: getItemImage(raw),
        quantity,
        priceUsd: unitPair.usd,
        priceCdf: unitPair.cdf,
        lineUsd: linePair.usd,
        lineCdf: linePair.cdf,
        unitDisplay: selectDisplayPrice(unitPair, displayCurrency),
        lineDisplay: selectDisplayPrice(linePair, displayCurrency),
        stock,
        isOutOfStock: stock === 0,
        variantLabel: getVariantLabel(raw?.variante),
      }
    })
  }, [displayCurrency, itemsRaw, rate])

  /* ---------------------------------------------------------- */
  /*  Résolution USD principal / CDF calculé                     */
  /* ---------------------------------------------------------- */

  const subtotalPair = useMemo(
    () =>
      resolvePricePair(
        firstPositive(
          summary?.sousTotalUSD,
          summary?.subtotalUSD,
          summary?.sous_total_usd
        ),
        firstPositive(
          summary?.sousTotal,
          summary?.subtotal,
          summary?.sous_total
        ),
        rate
      ),
    [
      rate,
      summary?.sousTotal,
      summary?.sousTotalUSD,
      summary?.sous_total,
      summary?.sous_total_usd,
      summary?.subtotal,
      summary?.subtotalUSD,
    ]
  )

  const rawDiscountPair = useMemo(
    () =>
      resolvePricePair(
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
      ),
    [
      rate,
      summary?.discount,
      summary?.discountUSD,
      summary?.promoReductionUsd,
      summary?.remiseTotal,
      summary?.remiseTotalUSD,
      summary?.remise_total,
      summary?.remise_total_usd,
    ]
  )

  /**
   * Sécurité : la remise ne peut jamais dépasser le sous-total.
   */
  const discountPair = useMemo<PricePair>(() => {
    const cappedUsd = Math.min(rawDiscountPair.usd, subtotalPair.usd)

    const cappedCdf =
      rate && cappedUsd > 0
        ? roundCdf(toCdf(cappedUsd, Number(rate)))
        : Math.min(rawDiscountPair.cdf, subtotalPair.cdf)

    return {
      usd: roundUsd(cappedUsd),
      cdf: roundCdf(cappedCdf),
    }
  }, [rawDiscountPair, rate, subtotalPair])

  const shippingQuote = useMemo(
    () => summary?.shippingQuote ?? null,
    [summary?.shippingQuote]
  )

  const shippingPair = useMemo(
    () =>
      resolvePricePair(
        firstPositive(
          summary?.shippingEstimateUsd,
          shippingQuote?.total_usd
        ),
        firstPositive(
          summary?.shippingEstimateCdf,
          shippingQuote?.total_cdf,
          summary?.fraisLivraison
        ),
        rate
      ),
    [
      rate,
      shippingQuote?.total_cdf,
      shippingQuote?.total_usd,
      summary?.fraisLivraison,
      summary?.shippingEstimateCdf,
      summary?.shippingEstimateUsd,
    ]
  )

  /**
   * Total estimé :
   * sous-total - remise + livraison estimée.
   *
   * Le montant final définitif est confirmé à l’étape commande.
   */
  const totalPair = useMemo<PricePair>(() => {
    const computedUsd = roundUsd(
      Math.max(
        0,
        safeAdd(subtotalPair.usd, -discountPair.usd, shippingPair.usd)
      )
    )

    const computedCdf =
      rate && computedUsd > 0
        ? roundCdf(toCdf(computedUsd, Number(rate)))
        : roundCdf(
            Math.max(
              0,
              safeAdd(
                subtotalPair.cdf,
                -discountPair.cdf,
                shippingPair.cdf
              )
            )
          )

    const contextTotalPair = resolvePricePair(
      firstPositive(summary?.totalUSD, summary?.total_usd),
      firstPositive(summary?.total),
      rate
    )

    /**
     * On utilise le total du contexte seulement s’il est cohérent.
     * Sinon on garde le total estimé calculé.
     */
    if (
      contextTotalPair.usd > 0 ||
      contextTotalPair.cdf > 0
    ) {
      const isContextCoherent =
        Math.abs(contextTotalPair.usd - computedUsd) <= 0.05 ||
        (rate != null &&
          Math.abs(contextTotalPair.cdf - computedCdf) <= 1)

      if (isContextCoherent) {
        return contextTotalPair
      }
    }

    return {
      usd: computedUsd,
      cdf: computedCdf,
    }
  }, [
    discountPair,
    rate,
    shippingPair,
    subtotalPair,
    summary?.total,
    summary?.totalUSD,
    summary?.total_usd,
  ])

  /* ---------------------------------------------------------- */
  /*  Devise principale d’affichage                              */
  /* ---------------------------------------------------------- */

  const hasUsd =
    subtotalPair.usd > 0 ||
    discountPair.usd > 0 ||
    shippingPair.usd > 0 ||
    totalPair.usd > 0

  const hasCdf =
    subtotalPair.cdf > 0 ||
    discountPair.cdf > 0 ||
    shippingPair.cdf > 0 ||
    totalPair.cdf > 0

  const preferredPrimaryCurrency: Currency =
    displayCurrency === 'CDF' && hasCdf
      ? 'CDF'
      : hasUsd
        ? 'USD'
        : hasCdf
          ? 'CDF'
          : 'USD'

  const subtotalDisplay = selectDisplayPrice(
    subtotalPair,
    preferredPrimaryCurrency
  )

  const discountDisplay = selectDisplayPrice(
    discountPair,
    preferredPrimaryCurrency
  )

  const shippingDisplay = selectDisplayPrice(
    shippingPair,
    preferredPrimaryCurrency
  )

  const totalDisplay = selectDisplayPrice(
    totalPair,
    preferredPrimaryCurrency
  )

  /* ---------------------------------------------------------- */
  /*  Livraison gratuite                                         */
  /* ---------------------------------------------------------- */

  const thresholdUsd = useMemo(() => {
    const threshold = toPositiveNumber(freeShippingThreshold)

    if (!threshold) return 0

    if (thresholdCurrency === 'USD') {
      return roundUsd(threshold)
    }

    /**
     * Legacy : seuil exprimé en CDF.
     * On le convertit en USD principal si le taux est disponible.
     */
    return rate ? roundUsd(toUsd(threshold, Number(rate))) : 0
  }, [freeShippingThreshold, rate, thresholdCurrency])

  const progressPercent = useMemo(() => {
    if (thresholdUsd <= 0) return 0

    const percent = (subtotalPair.usd / thresholdUsd) * 100

    return Math.max(0, Math.min(100, Math.round(percent)))
  }, [subtotalPair.usd, thresholdUsd])

  const missingUsd = useMemo(() => {
    if (thresholdUsd <= 0) return 0
    return roundUsd(Math.max(0, thresholdUsd - subtotalPair.usd))
  }, [subtotalPair.usd, thresholdUsd])

  const missingPair = useMemo(
    () => resolvePricePair(missingUsd, 0, rate),
    [missingUsd, rate]
  )

  const missingDisplay = selectDisplayPrice(
    missingPair,
    preferredPrimaryCurrency
  )

  const isFreeShippingReached =
    thresholdUsd > 0 && subtotalPair.usd >= thresholdUsd

  const shippingIsFree =
    isFreeShippingReached ||
    (
      Boolean(shippingQuote) &&
      shippingQuote?.available !== false &&
      shippingPair.usd === 0 &&
      shippingPair.cdf === 0
    )

  const hasShippingInfo =
    Boolean(shippingQuote) ||
    shippingPair.usd > 0 ||
    shippingPair.cdf > 0

  /* ---------------------------------------------------------- */
  /*  Promo                                                      */
  /* ---------------------------------------------------------- */

  const promoValid =
    summary?.promoValid ??
    activePromo?.valid ??
    false

  const promoRemainingUsd = firstPositive(
    summary?.promoRemainingUsd,
    activePromo?.remainingToMinUsd
  )

  const promoRequirementMessage =
    summary?.promoRequirementMessage ||
    activePromo?.message ||
    promoErrorContext ||
    promoError ||
    null

  const promoMinTotalUsd = firstPositive(
    summary?.promoMinTotalUsd,
    activePromo?.minTotalUsd,
    activePromo?.minTotal
  )

  const promoMaxDiscountUsd = firstPositive(
    summary?.promoMaxDiscountUsd,
    activePromo?.maxDiscountUsd,
    activePromo?.maxDiscount
  )

  const handleApplyPromo = useCallback(async () => {
    const code = promoInput.trim().toUpperCase()

    if (!code) {
      setPromoError('Saisissez un code promo.')
      return
    }

    if (typeof applyPromoCode !== 'function') {
      setPromoError('Le code promo n’est pas disponible actuellement.')
      return
    }

    setApplyingPromo(true)
    setPromoError('')

    try {
      const result = await applyPromoCode(code)

      /**
       * Compatibilité :
       * - ancien CartContext : renvoie boolean
       * - nouveau CartContext : renvoie PromoApplyResult
       */
      const success =
        result === true ||
        (result &&
          typeof result === 'object' &&
          result.success !== false)

      if (success) {
        setPromoInput('')
        setPromoError('')
        addToast?.({
          type: 'success',
          message: 'Code promo appliqué.',
        })
        return
      }

      const message =
        result?.error ||
        result?.promo?.message ||
        summary?.promoRequirementMessage ||
        'Code promo invalide.'

      const remaining = firstPositive(
        result?.promo?.remainingToMinUsd,
        summary?.promoRemainingUsd
      )

      if (remaining > 0) {
        setPromoError(
          `Ajoutez encore ${formatUsd(remaining)} pour utiliser ce code promo.`
        )
        return
      }

      setPromoError(message)
    } catch (err: any) {
      setPromoError(
        err?.message || 'Impossible de valider ce code promo.'
      )
    } finally {
      setApplyingPromo(false)
    }
  }, [
    addToast,
    applyPromoCode,
    promoInput,
    summary?.promoRemainingUsd,
    summary?.promoRequirementMessage,
  ])

  const handleRemovePromo = useCallback(async () => {
    try {
      if (typeof removePromoCode === 'function') {
        await removePromoCode()
      }

      setPromoError('')
      addToast?.({
        type: 'info',
        message: 'Code promo retiré.',
      })
    } catch (err: any) {
      addToast?.({
        type: 'error',
        message:
          err?.message || 'Impossible de retirer le code promo.',
      })
    }
  }, [addToast, removePromoCode])

  /* ---------------------------------------------------------- */
  /*  Actions articles                                           */
  /* ---------------------------------------------------------- */

  const handleUpdateQuantity = useCallback(
    async (item: NormalizedCartItem, nextQuantity: number) => {
      const qty = safeQuantity(nextQuantity)

      if (typeof updateQuantity !== 'function') {
        addToast?.({
          type: 'error',
          message: 'La mise à jour de quantité n’est pas disponible.',
        })
        return
      }

      try {
        await updateQuantity(item.originalId, qty, item.variantKey)
      } catch (err: any) {
        addToast?.({
          type: 'error',
          message:
            err?.message || 'Impossible de mettre à jour la quantité.',
        })
      }
    },
    [addToast, updateQuantity]
  )

  const handleRemoveItem = useCallback(
    async (item: NormalizedCartItem) => {
      if (typeof removeItem !== 'function') {
        addToast?.({
          type: 'error',
          message: 'La suppression n’est pas disponible.',
        })
        return
      }

      try {
        await removeItem(item.originalId, item.variantKey)

        addToast?.({
          type: 'success',
          message: `${item.nom} retiré du panier.`,
        })
      } catch (err: any) {
        addToast?.({
          type: 'error',
          message:
            err?.message || 'Impossible de retirer ce produit.',
        })
      }
    },
    [addToast, removeItem]
  )

  const handleClearCart = useCallback(async () => {
    if (typeof clearCart !== 'function') {
      addToast?.({
        type: 'error',
        message: 'La purge du panier n’est pas disponible.',
      })
      setConfirmClear(false)
      return
    }

    try {
      await clearCart()
      setConfirmClear(false)

      addToast?.({
        type: 'success',
        message: 'Panier vidé.',
      })
    } catch (err: any) {
      addToast?.({
        type: 'error',
        message: err?.message || 'Impossible de vider le panier.',
      })
    }
  }, [addToast, clearCart])

  /* ---------------------------------------------------------- */
  /*  Checkout                                                   */
  /* ---------------------------------------------------------- */

  const handleCheckout = useCallback(() => {
    if (items.length === 0) {
      addToast?.({
        type: 'warning',
        message: 'Votre panier est vide.',
      })
      return
    }

    if (onCheckout) {
      onCheckout()
      return
    }

    router.push('/commande')
  }, [addToast, items.length, onCheckout, router])

  /* ---------------------------------------------------------- */
  /*  Rendu vide                                                 */
  /* ---------------------------------------------------------- */

  if (loading && items.length === 0) {
    return (
      <Card
        variant="glass"
        className={cn('border-gold-400/20', className)}
      >
        <CardContent className="p-6 text-center">
          <Loader2
            size={32}
            className="mx-auto mb-4 animate-spin text-gold-500"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            Chargement du panier…
          </p>
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <Card
        variant="glass"
        className={cn('border-gold-400/20', className)}
      >
        <CardContent className="p-6 text-center">
          <ShoppingBag
            size={48}
            className="mx-auto mb-4 text-muted-foreground"
            aria-hidden="true"
          />

          <h3 className="mb-2 text-lg font-semibold text-foreground">
            Votre panier est vide
          </h3>

          <p className="mb-4 text-sm text-muted-foreground">
            Parcourez notre catalogue et ajoutez des articles à votre panier.
          </p>

          <Link href="/produits">
            <Button variant="luxe" size="sm">
              Explorer les produits
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const totalUnits =
    cart?.totalItems ??
    items.reduce((acc, item) => acc + item.quantity, 0)

  return (
    <Card
      variant="glass"
      className={cn(
        'border-gold-400/20 bg-card/70 shadow-soft backdrop-blur-xl',
        className
      )}
    >
      <CardHeader className={cn(compact && 'pb-2')}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShoppingBag
            size={20}
            className="text-gold-500"
            aria-hidden="true"
          />
          Récapitulatif
        </CardTitle>

        <CardDescription>
          {items.length} article{items.length > 1 ? 's' : ''}
          {!compact && ` • ${totalUnits} unité(s)`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {cartError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <AlertCircle
              size={14}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>{cartError}</span>
          </div>
        )}

        {isSyncing && (
          <div className="flex items-center gap-2 text-xs text-gold-600">
            <Loader2
              size={14}
              className="animate-spin"
              aria-hidden="true"
            />
            Synchronisation du panier…
          </div>
        )}

        {/* Liste des articles */}
        {!compact && (
          <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
            {items.map((item) => {
              const canIncrease =
                item.stock === null || item.quantity < item.stock

              return (
                <div
                  key={item.key}
                  className="group flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-gold-400/5"
                >
                  {/* Image produit */}
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={item.image}
                      alt={item.nom}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />

                    {item.isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-semibold text-white">
                        Rupture
                      </div>
                    )}
                  </div>

                  {/* Infos */}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/produits/${item.originalId}`}
                      className="block truncate text-sm font-medium text-foreground transition-colors hover:text-gold-500"
                    >
                      {item.nom}
                    </Link>

                    {item.variantLabel && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.variantLabel}
                      </p>
                    )}

                    <div className="mt-1 flex items-center gap-2">
                      {/* Contrôle quantité */}
                      <div className="inline-flex items-center rounded-lg border border-border">
                        <button
                          type="button"
                          onClick={() =>
                            void handleUpdateQuantity(item, item.quantity - 1)
                          }
                          className="rounded-l-lg px-1.5 py-0.5 text-xs transition-colors hover:bg-gold-400/10 disabled:opacity-40"
                          disabled={
                            item.quantity <= 1 ||
                            item.isOutOfStock ||
                            isSyncing
                          }
                          aria-label={`Diminuer la quantité de ${item.nom}`}
                        >
                          -
                        </button>

                        <span className="px-2 text-xs font-medium">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            void handleUpdateQuantity(item, item.quantity + 1)
                          }
                          className="rounded-r-lg px-1.5 py-0.5 text-xs transition-colors hover:bg-gold-400/10 disabled:opacity-40"
                          disabled={
                            !canIncrease ||
                            item.isOutOfStock ||
                            isSyncing
                          }
                          aria-label={`Augmenter la quantité de ${item.nom}`}
                        >
                          +
                        </button>
                      </div>

                      <span className="truncate text-xs text-muted-foreground">
                        × {formatMoney(
                          item.unitDisplay.primaryAmount,
                          item.unitDisplay.primaryCurrency
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Prix total + suppression */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-gold-600">
                      {formatMoney(
                        item.lineDisplay.primaryAmount,
                        item.lineDisplay.primaryCurrency
                      )}
                    </span>

                    {showSecondaryPrice &&
                      item.lineDisplay.secondaryAmount > 0 &&
                      item.lineDisplay.secondaryAmount !==
                        item.lineDisplay.primaryAmount && (
                        <span className="text-[10px] text-muted-foreground">
                          ≈{' '}
                          {formatMoney(
                            item.lineDisplay.secondaryAmount,
                            item.lineDisplay.secondaryCurrency
                          )}
                        </span>
                      )}

                    <button
                      type="button"
                      onClick={() => void handleRemoveItem(item)}
                      className="rounded-md p-1 text-red-400 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                      disabled={isSyncing}
                      aria-label={`Retirer ${item.nom} du panier`}
                      title="Retirer"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <hr className="border-gold-400/20" />

        {/* Code promo */}
        {showPromoCode && (
          <div className="space-y-2">
            {activePromo && promoValid ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                <div className="flex min-w-0 items-center gap-2">
                  <Percent
                    size={16}
                    className="shrink-0 text-green-600"
                    aria-hidden="true"
                  />

                  <span className="truncate text-sm font-medium text-green-800 dark:text-green-200">
                    {activePromo.code}
                  </span>

                  {activePromo.type === 'percent' &&
                    firstPositive(activePromo.value) > 0 && (
                      <Badge
                        variant="accent"
                        size="sm"
                        className="bg-green-100 text-green-700"
                      >
                        -{firstPositive(activePromo.value)}%
                      </Badge>
                    )}

                  {activePromo.type === 'fixed' &&
                    discountDisplay.primaryAmount > 0 && (
                      <Badge
                        variant="accent"
                        size="sm"
                        className="bg-green-100 text-green-700"
                      >
                        -{formatMoney(
                          discountDisplay.primaryAmount,
                          discountDisplay.primaryCurrency
                        )}
                      </Badge>
                    )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleRemovePromo()}
                  className="rounded-lg p-1 text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600"
                  aria-label="Retirer le code promo"
                  title="Retirer le code"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ) : activePromo && !promoValid ? (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />

                  <div className="min-w-0">
                    <p className="font-semibold">{activePromo.code}</p>

                    <p className="mt-1 text-xs">
                      {promoRequirementMessage ||
                        promoRemainingUsd > 0
                        ? `Ajoutez encore ${formatUsd(promoRemainingUsd)} pour utiliser ce code promo.`
                        : 'Ce code promo n’est pas applicable pour le moment.'}
                    </p>

                    {promoMinTotalUsd > 0 && (
                      <p className="mt-1 text-[11px] opacity-90">
                        Minimum panier : {formatUsd(promoMinTotalUsd)}
                      </p>
                    )}

                    {promoMaxDiscountUsd > 0 && (
                      <p className="mt-1 text-[11px] opacity-90">
                        Réduction maximale : {formatUsd(promoMaxDiscountUsd)}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRemovePromo()}
                  leftIcon={<X size={14} aria-hidden="true" />}
                >
                  Retirer
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Tag
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />

                  <Input
                    variant="glass"
                    size="sm"
                    placeholder="Code promo"
                    value={promoInput}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      setPromoInput(event.target.value.toUpperCase())
                      setPromoError('')
                    }}
                    onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleApplyPromo()
                      }
                    }}
                    className="pl-9 uppercase placeholder:normal-case"
                    aria-label="Code promo"
                  />
                </div>

                <Button
                  variant="outline-gold"
                  size="sm"
                  onClick={() => void handleApplyPromo()}
                  loading={applyingPromo}
                  disabled={!promoInput.trim() || applyingPromo}
                >
                  Appliquer
                </Button>
              </div>
            )}

            {promoError && !activePromo && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <AlertCircle size={12} aria-hidden="true" />
                {promoError}
              </p>
            )}
          </div>
        )}

        {/* Détail des montants */}
        <div className="space-y-2 text-sm">
          <SummaryLine
            label="Sous-total"
            display={subtotalDisplay}
            showSecondary={showSecondaryPrice}
            icon={<ShoppingBag size={14} aria-hidden="true" />}
          />

          {discountDisplay.primaryAmount > 0 && (
            <SummaryLine
              label={
                activePromo?.code
                  ? `Réduction (${activePromo.code})`
                  : 'Réduction'
              }
              display={discountDisplay}
              tone="discount"
              showSecondary={showSecondaryPrice}
              isNegative
              secondaryPrefix="- "
              icon={<Percent size={14} aria-hidden="true" />}
            />
          )}

          {showShippingEstimate && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Truck
                    size={14}
                    className="text-gold-500"
                    aria-hidden="true"
                  />
                  Livraison estimée
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {hasShippingInfo
                    ? shippingQuote?.delay_label ||
                      'Estimation consolidée'
                    : 'Confirmée à l’étape commande'}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {hasShippingInfo ? (
                  <>
                    <p className="text-sm font-semibold text-gold-600">
                      {shippingIsFree
                        ? 'Gratuite'
                        : formatMoney(
                            shippingDisplay.primaryAmount,
                            shippingDisplay.primaryCurrency
                          )}
                    </p>

                    {showSecondaryPrice &&
                      !shippingIsFree &&
                      shippingDisplay.secondaryAmount > 0 &&
                      shippingDisplay.secondaryAmount !==
                        shippingDisplay.primaryAmount && (
                        <p className="text-[11px] text-muted-foreground">
                          ≈{' '}
                          {formatMoney(
                            shippingDisplay.secondaryAmount,
                            shippingDisplay.secondaryCurrency
                          )}
                        </p>
                      )}
                  </>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">
                    À confirmer
                  </p>
                )}
              </div>
            </div>
          )}

          {discountDisplay.primaryAmount > 0 && (
            <div className="flex items-center justify-between gap-3 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="flex items-center gap-1">
                <Info size={12} aria-hidden="true" />
                Vous économisez
              </span>

              <span className="font-medium">
                {formatMoney(
                  discountDisplay.primaryAmount,
                  discountDisplay.primaryCurrency
                )}

                {showSecondaryPrice &&
                  discountDisplay.secondaryAmount > 0 &&
                  discountDisplay.secondaryAmount !==
                    discountDisplay.primaryAmount && (
                    <span className="ml-1 text-[10px] opacity-80">
                      ≈{' '}
                      {formatMoney(
                        discountDisplay.secondaryAmount,
                        discountDisplay.secondaryCurrency
                      )}
                    </span>
                  )}
              </span>
            </div>
          )}
        </div>

        {/* Total */}
        <div className="space-y-1 border-t border-gold-400/20 pt-2">
          <SummaryLine
            label="Total estimé"
            display={totalDisplay}
            tone="total"
            showSecondary={showSecondaryPrice}
          />

          <p className="text-right text-[11px] text-muted-foreground">
            Le montant final de livraison est confirmé à l’étape commande.
          </p>
        </div>

        {/* Livraison gratuite */}
        {thresholdUsd > 0 && !isFreeShippingReached && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Plus que{' '}
                {formatMoney(
                  missingDisplay.primaryAmount,
                  missingDisplay.primaryCurrency
                )}

                {showSecondaryPrice &&
                  missingDisplay.secondaryAmount > 0 &&
                  missingDisplay.secondaryAmount !==
                    missingDisplay.primaryAmount && (
                    <span className="ml-1 text-[10px] opacity-80">
                      ≈{' '}
                      {formatMoney(
                        missingDisplay.secondaryAmount,
                        missingDisplay.secondaryCurrency
                      )}
                    </span>
                  )}{' '}
                pour la livraison gratuite
              </span>

              <Truck
                size={14}
                className="shrink-0 text-amber-500"
                aria-hidden="true"
              />
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-800/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-gold-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {isFreeShippingReached && (
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
            <ShieldCheck
              size={16}
              className="shrink-0 text-green-500"
              aria-hidden="true"
            />

            <span className="text-xs font-medium text-green-700 dark:text-green-300">
              Livraison gratuite débloquée !
            </span>
          </div>
        )}

        {/* Sécurité */}
        <div className="space-y-2 border-t border-gold-400/20 pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck
              size={14}
              className="shrink-0 text-gold-500"
              aria-hidden="true"
            />
            Paiement 100 % sécurisé
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw
              size={14}
              className="shrink-0 text-gold-500"
              aria-hidden="true"
            />
            Retours possibles selon conditions produit
          </div>

          {rateLoading && !rate && hasUsd && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <Loader2
                size={14}
                className="shrink-0 animate-spin"
                aria-hidden="true"
              />
              Conversion CDF en cours de chargement…
            </div>
          )}
        </div>

        {/* Bouton Commander */}
        {showCheckoutButton && (
          <div className="space-y-2 border-t border-gold-400/20 pt-2">
            {confirmClear ? (
              <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                <p className="font-medium">
                  Confirmer la suppression de tous les articles ?
                </p>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmClear(false)}
                  >
                    Annuler
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                    onClick={() => void handleClearCart()}
                    leftIcon={<Trash2 size={14} aria-hidden="true" />}
                  >
                    Confirmer
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  variant="luxe"
                  fullWidth
                  size="lg"
                  onClick={handleCheckout}
                  className="shadow-gold hover:shadow-glow-gold"
                  disabled={isSyncing}
                  leftIcon={
                    isSyncing ? (
                      <Loader2
                        size={18}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight size={18} aria-hidden="true" />
                    )
                  }
                >
                  {isSyncing ? 'Synchronisation...' : 'Commander'}
                </Button>

                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="w-full text-center text-xs text-muted-foreground transition-colors hover:text-red-500"
                >
                  Vider le panier
                </button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}