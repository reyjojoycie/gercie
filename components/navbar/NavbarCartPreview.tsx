// components/navbar/NavbarCartPreview.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'
import Image from 'next/image'

import { cn } from '@/lib/utils'
import { useExchangeRate } from '@/hooks/useExchangeRate'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
  toCdf,
  toUsd,
} from '@/lib/currency'

import {
  ArrowRight,
  Percent,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'

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

export interface CartPreviewItem {
  id: string
  product_id?: string
  nom: string
  name?: string

  /**
   * Legacy CDF.
   * Ne doit plus être considéré comme source principale si USD existe.
   */
  prix?: number | null
  price?: number | null
  prix_cdf?: number | null
  price_cdf?: number | null

  /**
   * USD = source principale quand disponible.
   */
  prix_usd?: number | null
  price_usd?: number | null
  unit_price_usd?: number | null

  /**
   * Prix original / barré.
   */
  prix_initial?: number | null
  prix_initial_usd?: number | null
  original_price_usd?: number | null
  prix_original?: number | null
  original_price?: number | null

  remise?: number | null
  discount?: number | null

  quantite?: number | null
  quantity?: number | null

  image?: string | null
  images?: string[] | null

  variante?: {
    attributes?: Record<string, string>
    prix?: number | null
    prix_specifique?: number | null
    prix_specifique_usd?: number | null
    prix_specifique_cdf?: number | null
    image?: string | null
    images?: string[] | null
  } | null

  variantKey?: string | null

  [key: string]: any
}

export interface NavbarCartPreviewProps {
  items: CartPreviewItem[]

  /**
   * Nombre total d’unités.
   * Si absent, calculé depuis items.quantite.
   */
  totalItems?: number

  /**
   * Legacy : sous-total CDF.
   * Utilisé seulement comme fallback si aucun USD n’est disponible.
   */
  subTotal?: number | null

  /**
   * Sous-total USD principal, si le parent le fournit déjà.
   */
  subtotalUsd?: number | null

  /**
   * Sous-total CDF calculé, si le parent le fournit déjà.
   */
  subtotalCdf?: number | null

  /**
   * Suppression.
   * Compatible ancien appel (id) et nouvel appel (id, variantKey).
   */
  onRemove?: (id: string, variantKey?: string) => void

  onClose?: () => void

  maxVisible?: number

  loading?: boolean

  className?: string

  /**
   * Afficher le prix secondaire calculé.
   */
  showSecondaryPrice?: boolean
}

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

function clampPercent(value: unknown): number {
  const n = Number(value)

  if (!Number.isFinite(n)) return 0

  return Math.max(0, Math.min(100, Math.round(n)))
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
  preferredCurrency?: Currency
): DisplayPrice {
  let primaryCurrency: Currency

  if (preferredCurrency === 'CDF') {
    primaryCurrency = pair.cdf > 0 ? 'CDF' : pair.usd > 0 ? 'USD' : 'USD'
  } else if (preferredCurrency === 'USD') {
    primaryCurrency = pair.usd > 0 ? 'USD' : pair.cdf > 0 ? 'CDF' : 'USD'
  } else {
    primaryCurrency = pair.usd > 0 ? 'USD' : pair.cdf > 0 ? 'CDF' : 'USD'
  }

  const secondaryCurrency: Currency =
    primaryCurrency === 'USD' ? 'CDF' : 'USD'

  const primaryAmount =
    primaryCurrency === 'USD' ? pair.usd : pair.cdf

  const secondaryAmount =
    secondaryCurrency === 'USD' ? pair.usd : pair.cdf

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

/**
 * Clé de variante canonique.
 *
 * IMPORTANT :
 * - trie les clés ;
 * - ignore les valeurs vides ;
 * - évite les doublons dus à l’ordre des attributs ;
 * - cohérent avec CartContext.
 */
function normalizeVariantAttributeValue(value: any): string {
  if (!value) return ''

  const str = String(value).trim()

  if (!str || str === '{}') return ''

  return str
}

function stableVariantKeyFromAttributes(
  attributes?: Record<string, string> | null
): string {
  if (!attributes || typeof attributes !== 'object') return ''

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

function normalizeVariantKey(value: any): string {
  const raw = normalizeVariantAttributeValue(value)

  if (!raw) return ''

  try {
    const parsed = JSON.parse(raw)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const attributes =
        (parsed as any).attributes ??
        (parsed as any).attrs ??
        parsed

      if (attributes && typeof attributes === 'object') {
        return stableVariantKeyFromAttributes(attributes as any)
      }
    }
  } catch {
    // Si ce n’est pas du JSON, on renvoie une chaîne normalisée.
  }

  return raw
}

function getItemVariantKey(item: CartPreviewItem): string {
  if (item.variantKey) {
    return normalizeVariantKey(item.variantKey)
  }

  return stableVariantKeyFromAttributes(item.variante?.attributes)
}

function getItemKey(item: CartPreviewItem, index: number): string {
  const id = String(item.product_id || item.id || `item-${index}`)
  const variantKey = getItemVariantKey(item)

  return `${id}::${variantKey}`
}

function getItemName(item: CartPreviewItem): string {
  return String(item.nom || item.name || 'Produit')
}

function getItemImage(item: CartPreviewItem): string | null {
  if (typeof item.image === 'string' && item.image.trim()) {
    return item.image
  }

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

  return null
}

function getVariantLabel(item: CartPreviewItem): string | null {
  const attributes = item.variante?.attributes

  if (!attributes || typeof attributes !== 'object') return null

  const entries = Object.entries(attributes).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false
    return String(value).trim() !== ''
  })

  if (entries.length === 0) return null

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  return entries.map(([, value]) => String(value)).join(' • ')
}

function resolveItemUnitPricePair(
  item: CartPreviewItem,
  rate: number | null
): PricePair {
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

  return resolvePricePair(usdSource, cdfSource, rate)
}

function resolveItemOriginalPricePair(
  item: CartPreviewItem,
  unitPair: PricePair,
  rate: number | null
): PricePair {
  const usdSource = firstPositive(
    item.prix_initial_usd,
    item.original_price_usd
  )

  const cdfSource = firstPositive(
    item.prix_initial,
    item.prix_original,
    item.original_price
  )

  let pair = resolvePricePair(usdSource, cdfSource, rate)

  /**
   * Si aucun prix original explicite n’existe mais qu’une remise est connue,
   * on peut dériver le prix original depuis le prix courant.
   */
  if (pair.usd <= 0 && pair.cdf <= 0) {
    const discount = clampPercent(item.remise ?? item.discount)

    if (discount > 0 && discount < 100) {
      const divisor = 1 - discount / 100

      if (divisor > 0) {
        if (unitPair.usd > 0) {
          pair = resolvePricePair(
            roundUsd(unitPair.usd / divisor),
            0,
            rate
          )
        } else if (unitPair.cdf > 0) {
          pair = resolvePricePair(
            0,
            roundCdf(unitPair.cdf / divisor),
            rate
          )
        }
      }
    }
  }

  /**
   * Sécurité : le prix original ne peut jamais être inférieur au prix courant.
   */
  if (pair.usd > 0 && pair.usd < unitPair.usd) {
    pair.usd = unitPair.usd
  }

  if (pair.cdf > 0 && pair.cdf < unitPair.cdf) {
    pair.cdf = unitPair.cdf
  }

  return pair
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ROW                                                            */
/* ═══════════════════════════════════════════════════════════════ */

interface CartPreviewRowProps {
  item: CartPreviewItem
  itemKey: string
  rate: number | null
  showSecondaryPrice: boolean
  onRemove?: (id: string, variantKey?: string) => void
}

function CartPreviewRow({
  item,
  itemKey,
  rate,
  showSecondaryPrice,
  onRemove,
}: CartPreviewRowProps) {
  const image = getItemImage(item)
  const name = getItemName(item)
  const variantKey = getItemVariantKey(item)
  const variantLabel = getVariantLabel(item)
  const quantity = safeQuantity(item.quantite ?? item.quantity)

  const unitPair = useMemo(
    () => resolveItemUnitPricePair(item, rate),
    [item, rate]
  )

  const originalPair = useMemo(
    () => resolveItemOriginalPricePair(item, unitPair, rate),
    [item, rate, unitPair]
  )

  const linePair = useMemo<PricePair>(
    () => ({
      usd: roundUsd(unitPair.usd * quantity),
      cdf: roundCdf(unitPair.cdf * quantity),
    }),
    [quantity, unitPair]
  )

  const originalLinePair = useMemo<PricePair>(
    () => ({
      usd: roundUsd(originalPair.usd * quantity),
      cdf: roundCdf(originalPair.cdf * quantity),
    }),
    [originalPair, quantity]
  )

  const lineDisplay = useMemo(
    () => selectDisplayPrice(linePair),
    [linePair]
  )

  const unitDisplay = useMemo(
    () => selectDisplayPrice(unitPair),
    [unitPair]
  )

  const originalLineDisplay = useMemo(
    () => selectDisplayPrice(originalLinePair),
    [originalLinePair]
  )

  const hasDiscount =
    originalLinePair.usd > linePair.usd ||
    originalLinePair.cdf > linePair.cdf

  const hasPrice = linePair.usd > 0 || linePair.cdf > 0

  const handleRemove = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      onRemove?.(item.id, variantKey || undefined)
    },
    [item.id, onRemove, variantKey]
  )

  return (
    <div
      className="flex items-start gap-3 rounded-lg p-2 transition-colors duration-200 hover:bg-muted"
      data-cart-preview-key={itemKey}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-muted">
        {image ? (
          <Image
            src={image}
            alt={name}
            width={48}
            height={48}
            className="h-12 w-12 object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-fg-subtle"
            aria-hidden="true"
          >
            <ShoppingBag size={16} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-semibold text-fg">
          {name}
        </p>

        {variantLabel && (
          <p className="mt-0.5 line-clamp-1 text-[10px] text-fg-muted">
            {variantLabel}
          </p>
        )}

        <p className="mt-1 text-[11px] text-fg-muted">
          Qté : {quantity}
        </p>

        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          <span className="text-xs font-bold text-fg">
            {hasPrice
              ? formatMoney(
                  lineDisplay.primaryAmount,
                  lineDisplay.primaryCurrency
                )
              : '—'}
          </span>

          {showSecondaryPrice &&
            hasPrice &&
            lineDisplay.secondaryAmount > 0 &&
            lineDisplay.secondaryAmount !== lineDisplay.primaryAmount && (
              <span className="text-[10px] text-fg-subtle">
                ≈{' '}
                {formatMoney(
                  lineDisplay.secondaryAmount,
                  lineDisplay.secondaryCurrency
                )}
              </span>
            )}

          {hasDiscount && (
            <span className="text-[10px] text-fg-subtle line-through">
              {formatMoney(
                originalLineDisplay.primaryAmount,
                originalLineDisplay.primaryCurrency
              )}
            </span>
          )}
        </div>

        {quantity > 1 && hasPrice && (
          <p className="mt-0.5 text-[10px] text-fg-subtle">
            {formatMoney(
              unitDisplay.primaryAmount,
              unitDisplay.primaryCurrency
            )}{' '}
            / unité
          </p>
        )}
      </div>

      {onRemove ? (
        <button
          type="button"
          onClick={handleRemove}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors duration-200 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          aria-label={`Retirer ${name} du panier`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarCartPreview({
  items,
  totalItems,
  subTotal,
  subtotalUsd,
  subtotalCdf,
  onRemove,
  onClose,
  maxVisible = 3,
  loading = false,
  className,
  showSecondaryPrice = true,
}: NavbarCartPreviewProps) {
  const exchange = useExchangeRate() as any

  const rawRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

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

  const safeItems = useMemo(() => {
    return Array.isArray(items) ? items : []
  }, [items])

  const normalizedRows = useMemo(() => {
    const seen = new Map<string, number>()

    return safeItems.map((item, index) => {
      const baseKey = getItemKey(item, index)
      const occurrence = seen.get(baseKey) ?? 0
      seen.set(baseKey, occurrence + 1)

      const key =
        occurrence === 0 ? baseKey : `${baseKey}#${occurrence}`

      const quantity = safeQuantity(item.quantite ?? item.quantity)

      const unitPair = resolveItemUnitPricePair(item, rate)
      const originalPair = resolveItemOriginalPricePair(item, unitPair, rate)

      const linePair: PricePair = {
        usd: roundUsd(unitPair.usd * quantity),
        cdf: roundCdf(unitPair.cdf * quantity),
      }

      const originalLinePair: PricePair = {
        usd: roundUsd(originalPair.usd * quantity),
        cdf: roundCdf(originalPair.cdf * quantity),
      }

      const savingsPair: PricePair = {
        usd: Math.max(0, originalLinePair.usd - linePair.usd),
        cdf: Math.max(0, originalLinePair.cdf - linePair.cdf),
      }

      return {
        item,
        key,
        quantity,
        unitPair,
        linePair,
        originalLinePair,
        savingsPair,
      }
    })
  }, [rate, safeItems])

  const visibleRows = normalizedRows.slice(0, maxVisible)
  const hiddenCount = normalizedRows.length - visibleRows.length

  const computedTotalItems = normalizedRows.reduce(
    (sum, row) => sum + row.quantity,
    0
  )

  const displayedTotalItems =
    toPositiveNumber(totalItems) ?? computedTotalItems

  const computedSubtotalUsd = roundUsd(
    normalizedRows.reduce((sum, row) => sum + row.linePair.usd, 0)
  )

  const computedSubtotalCdf = roundCdf(
    normalizedRows.reduce((sum, row) => sum + row.linePair.cdf, 0)
  )

  const computedSavingsUsd = roundUsd(
    normalizedRows.reduce((sum, row) => sum + row.savingsPair.usd, 0)
  )

  const computedSavingsCdf = roundCdf(
    normalizedRows.reduce((sum, row) => sum + row.savingsPair.cdf, 0)
  )

  const propSubtotalUsd = firstPositive(subtotalUsd)
  const propSubtotalCdf = firstPositive(subtotalCdf ?? subTotal)

  /**
   * Sous-total aligné :
   * - priorité USD principal ;
   * - CDF recalculé depuis USD si taux disponible ;
   * - fallback legacy CDF seulement si aucun USD n’est disponible.
   */
  const subtotalPair = useMemo<PricePair>(() => {
    let usd = 0
    let cdf = 0

    if (propSubtotalUsd > 0) {
      usd = propSubtotalUsd
    } else if (computedSubtotalUsd > 0) {
      usd = computedSubtotalUsd
    } else if (propSubtotalCdf > 0) {
      cdf = propSubtotalCdf
    } else if (computedSubtotalCdf > 0) {
      cdf = computedSubtotalCdf
    }

    const resolved = resolvePricePair(usd, cdf, rate)

    /**
     * Sécurité finale :
     * si USD existe et taux disponible, CDF doit venir de USD.
     */
    if (resolved.usd > 0 && rate && Number(rate) > 0) {
      return {
        usd: resolved.usd,
        cdf: roundCdf(toCdf(resolved.usd, Number(rate))),
      }
    }

    return resolved
  }, [
    computedSubtotalCdf,
    computedSubtotalUsd,
    propSubtotalCdf,
    propSubtotalUsd,
    rate,
  ])

  const savingsPair = useMemo<PricePair>(() => {
    const resolved = resolvePricePair(
      computedSavingsUsd,
      computedSavingsCdf,
      rate
    )

    /**
     * La réduction ne peut jamais dépasser le sous-total.
     */
    const cappedUsd = Math.min(resolved.usd, subtotalPair.usd)
    const cappedCdf = Math.min(resolved.cdf, subtotalPair.cdf)

    if (cappedUsd > 0 && rate && Number(rate) > 0) {
      return {
        usd: roundUsd(cappedUsd),
        cdf: roundCdf(toCdf(cappedUsd, Number(rate))),
      }
    }

    return {
      usd: roundUsd(cappedUsd),
      cdf: roundCdf(cappedCdf),
    }
  }, [computedSavingsCdf, computedSavingsUsd, rate, subtotalPair])

  const subtotalDisplay = useMemo(
    () => selectDisplayPrice(subtotalPair),
    [subtotalPair]
  )

  const savingsDisplay = useMemo(
    () => selectDisplayPrice(savingsPair),
    [savingsPair]
  )

  const hasSubtotal =
    subtotalPair.usd > 0 || subtotalPair.cdf > 0

  const hasSavings =
    savingsPair.usd > 0 || savingsPair.cdf > 0

  return (
    <div
      role="dialog"
      aria-label="Aperçu du panier"
      className={cn(
        'absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-card border border-line bg-surface shadow-card',
        className
      )}
      onMouseLeave={onClose}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-fg">Votre panier</p>

          <p className="text-[11px] text-fg-muted">
            {displayedTotalItems} article{displayedTotalItems > 1 ? 's' : ''}
          </p>
        </div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors duration-200 hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Fermer l’aperçu du panier"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={`cart-preview-skeleton-${index}`}
              className="flex gap-3"
            >
              <div className="skeleton h-12 w-12 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-3/4 rounded-full" />
                <div className="skeleton h-3 w-1/2 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : safeItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <ShoppingBag
            size={28}
            className="text-fg-subtle"
            aria-hidden="true"
          />

          <p className="text-sm font-medium text-fg">
            Votre panier est vide
          </p>

          <Link
            href="/search"
            onClick={onClose}
            className="text-xs font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            Découvrir des produits
          </Link>
        </div>
      ) : (
        <>
          <div className="max-h-64 space-y-1 overflow-y-auto p-2">
            {visibleRows.map((row) => (
              <CartPreviewRow
                key={row.key}
                item={row.item}
                itemKey={row.key}
                rate={rate}
                showSecondaryPrice={showSecondaryPrice}
                onRemove={onRemove}
              />
            ))}

            {hiddenCount > 0 ? (
              <p className="py-1 text-center text-[11px] text-fg-subtle">
                + {hiddenCount} autre{hiddenCount > 1 ? 's' : ''} article
                {hiddenCount > 1 ? 's' : ''}
              </p>
            ) : null}
          </div>

          <div className="border-t border-line p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Sous-total</span>

              <div className="text-right">
                <span className="font-bold text-fg">
                  {hasSubtotal
                    ? formatMoney(
                        subtotalDisplay.primaryAmount,
                        subtotalDisplay.primaryCurrency
                      )
                    : '—'}
                </span>

                {showSecondaryPrice &&
                  hasSubtotal &&
                  subtotalDisplay.secondaryAmount > 0 &&
                  subtotalDisplay.secondaryAmount !==
                    subtotalDisplay.primaryAmount && (
                    <p className="text-[10px] text-fg-subtle">
                      ≈{' '}
                      {formatMoney(
                        subtotalDisplay.secondaryAmount,
                        subtotalDisplay.secondaryCurrency
                      )}
                    </p>
                  )}
              </div>
            </div>

            {hasSavings ? (
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-fg-muted">
                  <Percent size={12} aria-hidden="true" />
                  Économies
                </span>

                <div className="text-right">
                  <span className="font-semibold text-success">
                    −
                    {formatMoney(
                      savingsDisplay.primaryAmount,
                      savingsDisplay.primaryCurrency
                    )}
                  </span>

                  {showSecondaryPrice &&
                    savingsDisplay.secondaryAmount > 0 &&
                    savingsDisplay.secondaryAmount !==
                      savingsDisplay.primaryAmount && (
                      <p className="text-[10px] text-fg-subtle">
                        ≈{' '}
                        {formatMoney(
                          savingsDisplay.secondaryAmount,
                          savingsDisplay.secondaryCurrency
                        )}
                      </p>
                    )}
                </div>
              </div>
            ) : null}

            <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
              Livraison et taxes calculées à l’étape suivante.
            </p>

            <Link
              href="/panier"
              onClick={onClose}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-card transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Voir le panier
              <ArrowRight size={16} aria-hidden="true" />
            </Link>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full text-center text-xs font-medium text-fg-muted transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Continuer mes achats
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

export default NavbarCartPreview