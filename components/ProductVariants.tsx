// components/ProductVariants.tsx
'use client'

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { motion, AnimatePresence } from 'framer-motion'

import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { Badge } from '@/components/ui/Badge'

import { useExchangeRate } from '@/hooks/useExchangeRate'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
} from '@/lib/currency'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type Currency = 'USD' | 'CDF'

export interface Variant {
  id?: string

  attributes: Record<string, string>

  stock: number

  /**
   * USD = source principale.
   */
  prix_specifique_usd?: number | null
  price_specifique_usd?: number | null

  /**
   * CDF = conversion ou valeur legacy.
   * Si un prix USD existe, le CDF doit être recalculé depuis USD.
   */
  prix_specifique_cdf?: number | null
  price_specifique_cdf?: number | null

  /**
   * Legacy : ancien prix CDF.
   * Conservé pour compatibilité.
   */
  prix_specifique?: number | null
  price_specifique?: number | null

  /**
   * Autres champs éventuels venant de Supabase.
   */
  prix?: number | null
  price?: number | null

  image?: string | null
  images?: string[] | null

  poids_kg?: number | null

  [key: string]: any
}

export interface ProductVariantsProps {
  /** Liste de toutes les variantes */
  variants: Variant[]

  /** Attributs sélectionnés (ex: { Couleur: 'Noir', Taille: 'M' }) */
  selectedAttributes: Record<string, string>

  /** Callback lorsqu'un attribut change */
  onAttributeChange: (attributeName: string, value: string) => void

  /**
   * Prix de base du produit.
   *
   * Compatibilité legacy :
   * si `basePriceUsd` n'est pas fourni, `basePrice` est interprété comme CDF.
   */
  basePrice?: number | null

  /** Prix de base USD principal */
  basePriceUsd?: number | null

  /** Prix de base CDF */
  basePriceCdf?: number | null

  /** Afficher le prix spécifique de la variante sélectionnée */
  showPrice?: boolean

  /** Afficher le stock restant */
  showStock?: boolean

  /** Taille des boutons */
  size?: 'sm' | 'md' | 'lg'

  /** Classe additionnelle */
  className?: string

  /** Fonction pour obtenir les options disponibles pour un attribut */
  getAvailableOptions?: (
    attributeName: string,
    currentSelections: Record<string, string>
  ) => string[]

  /** Afficher uniquement les attributs sélectionnés (mode compact) */
  compact?: boolean

  /** Nombre maximum d'options avant de basculer en select natif */
  maxOptionsBeforeSelect?: number

  /** Devise principale souhaitée. Par défaut USD. */
  preferredCurrency?: Currency

  /** Callback quand la variante complète sélectionnée change */
  onVariantChange?: (variant: Variant | null) => void
}

interface PricePair {
  usd: number | null
  cdf: number | null
  primaryCurrency: Currency | null
  primaryAmount: number
  secondaryCurrency: Currency | null
  secondaryAmount: number | null
  displayPrimary: string
  displaySecondary: string | null
  hasPrice: boolean
}

interface PriceDifference {
  primaryCurrency: Currency
  primaryAmount: number
  display: string
  tone: 'success' | 'danger'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UTILITAIRES PRIX                                               */
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

function getVariantDirectUsd(variant?: Variant | null): number | null {
  if (!variant) return null

  return positiveNumber(
    variant.prix_specifique_usd ??
      variant.price_specifique_usd ??
      null
  )
}

function getVariantDirectCdf(variant?: Variant | null): number | null {
  if (!variant) return null

  return positiveNumber(
    variant.prix_specifique_cdf ??
      variant.price_specifique_cdf ??
      variant.prix_specifique ??
      variant.price_specifique ??
      variant.prix ??
      variant.price ??
      null
  )
}

function resolveBasePrices(
  props: Pick<
    ProductVariantsProps,
    'basePrice' | 'basePriceUsd' | 'basePriceCdf'
  >,
  rate: number | null
): { usd: number | null; cdf: number | null } {
  const directUsd = positiveNumber(props.basePriceUsd)

  /*
   * Compatibilité legacy :
   * si only `basePrice` est fourni, on le traite comme CDF.
   */
  const directCdf =
    positiveNumber(props.basePriceCdf) ??
    positiveNumber(props.basePrice)

  let usd = directUsd
  let cdf = directCdf

  if (usd == null && cdf != null && rate != null && rate > 0) {
    usd = roundUsd(cdf / rate)
  }

  if (usd != null && rate != null && rate > 0) {
    cdf = roundCdf(usd * rate)
  }

  return { usd, cdf }
}

function resolveVariantPrices(
  variant: Variant | null,
  baseUsd: number | null,
  baseCdf: number | null,
  rate: number | null
): { usd: number | null; cdf: number | null } {
  const directUsd = getVariantDirectUsd(variant)
  const directCdf = getVariantDirectCdf(variant)

  let usd = directUsd
  let cdf = directCdf

  /*
   * Si la variante n'a aucun prix spécifique,
   * on retombe sur le prix de base du produit.
   */
  if (usd == null && cdf == null) {
    usd = baseUsd
    cdf = baseCdf
  }

  /*
   * USD = source principale.
   * Si un prix USD existe et que le taux est disponible,
   * le CDF est toujours recalculé depuis USD.
   */
  if (usd != null && rate != null && rate > 0) {
    cdf = roundCdf(usd * rate)
  } else if (cdf != null && rate != null && rate > 0) {
    usd = roundUsd(cdf / rate)
  }

  return { usd, cdf }
}

function makePricePair(
  usd: number | null,
  cdf: number | null,
  preferred: Currency = 'USD'
): PricePair {
  const safeUsd = positiveNumber(usd)
  const safeCdf = positiveNumber(cdf)

  let primaryCurrency: Currency | null = null

  if (preferred === 'CDF' && safeCdf != null) {
    primaryCurrency = 'CDF'
  } else if (safeUsd != null) {
    primaryCurrency = 'USD'
  } else if (safeCdf != null) {
    primaryCurrency = 'CDF'
  }

  const primaryAmount =
    primaryCurrency === 'USD'
      ? safeUsd ?? 0
      : primaryCurrency === 'CDF'
        ? safeCdf ?? 0
        : 0

  const secondaryCurrency: Currency | null =
    primaryCurrency === 'USD'
      ? 'CDF'
      : primaryCurrency === 'CDF'
        ? 'USD'
        : null

  const secondaryAmount =
    secondaryCurrency === 'USD'
      ? safeUsd
      : secondaryCurrency === 'CDF'
        ? safeCdf
        : null

  const displayPrimary =
    primaryCurrency === 'USD'
      ? formatUsd(primaryAmount)
      : primaryCurrency === 'CDF'
        ? formatCdf(primaryAmount)
        : '—'

  const displaySecondary =
    secondaryAmount != null &&
    secondaryAmount > 0 &&
    secondaryAmount !== primaryAmount
      ? `≈ ${
          secondaryCurrency === 'USD'
            ? formatUsd(secondaryAmount)
            : formatCdf(secondaryAmount)
        }`
      : null

  return {
    usd: safeUsd,
    cdf: safeCdf,
    primaryCurrency,
    primaryAmount,
    secondaryCurrency,
    secondaryAmount,
    displayPrimary,
    displaySecondary,
    hasPrice: primaryAmount > 0,
  }
}

function computePriceDifference(
  finalPair: PricePair,
  basePair: PricePair,
  rate: number | null
): PriceDifference | null {
  if (!finalPair.hasPrice || !basePair.hasPrice) return null

  let diffUsd: number | null = null
  let diffCdf: number | null = null

  if (finalPair.usd != null && basePair.usd != null) {
    diffUsd = roundUsd(finalPair.usd - basePair.usd)
  }

  if (diffUsd != null && rate != null && rate > 0) {
    diffCdf = roundCdf(diffUsd * rate)
  } else if (finalPair.cdf != null && basePair.cdf != null) {
    diffCdf = roundCdf(finalPair.cdf - basePair.cdf)
  }

  if (diffUsd == null && diffCdf == null) return null

  const primaryCurrency: Currency =
    finalPair.primaryCurrency === 'CDF' ? 'CDF' : 'USD'

  let primaryAmount: number | null = null

  if (primaryCurrency === 'USD') {
    if (diffUsd != null) {
      primaryAmount = diffUsd
    } else if (diffCdf != null && rate != null && rate > 0) {
      primaryAmount = roundUsd(diffCdf / rate)
    }
  } else {
    if (diffCdf != null) {
      primaryAmount = diffCdf
    } else if (diffUsd != null && rate != null && rate > 0) {
      primaryAmount = roundCdf(diffUsd * rate)
    }
  }

  if (primaryAmount == null || primaryAmount === 0) return null

  const absolute = Math.abs(primaryAmount)

  const display = `${primaryAmount < 0 ? '-' : '+'}${
    primaryCurrency === 'USD'
      ? formatUsd(absolute)
      : formatCdf(absolute)
  }`

  return {
    primaryCurrency,
    primaryAmount,
    display,
    tone: primaryAmount < 0 ? 'success' : 'danger',
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UTILITAIRES VISUELLES                                          */
/* ═══════════════════════════════════════════════════════════════ */

const isColorAttribute = (name: string): boolean => {
  const lower = name.toLowerCase()
  return (
    lower.includes('couleur') ||
    lower.includes('color') ||
    lower.includes('teinte')
  )
}

const colorNameToHex: Record<string, string> = {
  noir: '#000000',
  black: '#000000',
  blanc: '#ffffff',
  white: '#ffffff',
  rouge: '#dc2626',
  red: '#dc2626',
  bleu: '#2563eb',
  blue: '#2563eb',
  vert: '#16a34a',
  green: '#16a34a',
  jaune: '#facc15',
  yellow: '#facc15',
  orange: '#f97316',
  violet: '#8b5cf6',
  purple: '#8b5cf6',
  rose: '#f472b6',
  pink: '#f472b6',
  gris: '#6b7280',
  gray: '#6b7280',
  grey: '#6b7280',
  marron: '#78350f',
  brown: '#78350f',
  or: '#f59e0b',
  gold: '#f59e0b',
  argent: '#cbd5e1',
  silver: '#cbd5e1',
}

function getColorPreview(option: string): string | null {
  const lower = option.toLowerCase().trim()
  return colorNameToHex[lower] || null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export const ProductVariants = forwardRef<
  HTMLDivElement,
  ProductVariantsProps
>(
  (
    {
      variants,
      selectedAttributes,
      onAttributeChange,
      basePrice,
      basePriceUsd,
      basePriceCdf,
      showPrice = true,
      showStock = true,
      size = 'md',
      className,
      getAvailableOptions,
      compact = false,
      maxOptionsBeforeSelect = 6,
      preferredCurrency = 'USD',
      onVariantChange,
    },
    ref
  ) => {
    const { rate } = useExchangeRate()

    const [mounted, setMounted] = useState(false)

    useEffect(() => {
      setMounted(true)
    }, [])

    /*
     * FIX HYDRATION :
     * Le taux peut être chargé côté client seulement.
     * On évite donc de calculer une conversion avant hydratation.
     */
    const safeRate = mounted ? positiveNumber(rate) : null

    const basePrices = useMemo(
      () =>
        resolveBasePrices(
          {
            basePrice,
            basePriceUsd,
            basePriceCdf,
          },
          safeRate
        ),
      [basePrice, basePriceCdf, basePriceUsd, safeRate]
    )

    const attributeNames = useMemo(() => {
      const names = new Set<string>()

      variants.forEach((variant) => {
        Object.keys(variant.attributes || {}).forEach((key) => {
          if (key) names.add(key)
        })
      })

      return Array.from(names)
    }, [variants])

    const currentVariant = useMemo(() => {
      if (!variants.length) return null

      const entries = Object.entries(selectedAttributes || {}).filter(
        ([key, value]) => Boolean(key) && Boolean(value)
      )

      if (entries.length === 0) return null

      return (
        variants.find((variant) =>
          entries.every(([key, value]) => {
            return variant.attributes?.[key] === value
          })
        ) || null
      )
    }, [selectedAttributes, variants])

    const finalPrices = useMemo(
      () =>
        resolveVariantPrices(
          currentVariant,
          basePrices.usd,
          basePrices.cdf,
          safeRate
        ),
      [basePrices.cdf, basePrices.usd, currentVariant, safeRate]
    )

    const finalPair = useMemo(
      () => makePricePair(finalPrices.usd, finalPrices.cdf, preferredCurrency),
      [finalPrices.cdf, finalPrices.usd, preferredCurrency]
    )

    const basePair = useMemo(
      () => makePricePair(basePrices.usd, basePrices.cdf, preferredCurrency),
      [basePrices.cdf, basePrices.usd, preferredCurrency]
    )

    const priceDifference = useMemo(
      () => computePriceDifference(finalPair, basePair, safeRate),
      [basePair, finalPair, safeRate]
    )

    useEffect(() => {
      if (!onVariantChange) return

      onVariantChange(currentVariant)
    }, [currentVariant, onVariantChange])

    const findVariantForOption = useCallback(
      (attributeName: string, value: string): Variant | null => {
        if (!attributeName || !value) return null

        return (
          variants.find((variant) => {
            if (variant.attributes?.[attributeName] !== value) return false

            return Object.entries(selectedAttributes || {}).every(
              ([key, selectedValue]) => {
                if (key === attributeName) return true
                if (!key || !selectedValue) return true

                return variant.attributes?.[key] === selectedValue
              }
            )
          }) || null
        )
      },
      [selectedAttributes, variants]
    )

    const getOptionTooltip = useCallback(
      (attributeName: string, value: string, available: boolean): string => {
        if (!available) return 'Indisponible'

        const variant = findVariantForOption(attributeName, value)

        if (!variant) return ''

        const prices = resolveVariantPrices(
          variant,
          basePrices.usd,
          basePrices.cdf,
          safeRate
        )

        const pair = makePricePair(
          prices.usd,
          prices.cdf,
          preferredCurrency
        )

        if (!pair.hasPrice) return ''

        return pair.displaySecondary
          ? `${pair.displayPrimary} ${pair.displaySecondary}`
          : pair.displayPrimary
      },
      [
        basePrices.cdf,
        basePrices.usd,
        findVariantForOption,
        preferredCurrency,
        safeRate,
      ]
    )

    const handleOptionClick = useCallback(
      (attributeName: string, value: string) => {
        onAttributeChange(attributeName, value)
      },
      [onAttributeChange]
    )

    const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
      sm: 'px-2 py-1 text-xs',
      md: 'px-3 py-1.5 text-sm',
      lg: 'px-4 py-2 text-base',
    }

    /*
     * FIX IMPORTANT :
     * Tous les calculs par attribut sont faits dans un seul useMemo.
     * Avant, des useMemo étaient appelés dans un .map(), ce qui cassait les règles React.
     */
    const attributeData = useMemo(() => {
      return attributeNames.map((attributeName) => {
        const allValues = Array.from(
          new Set(
            variants
              .map((variant) => variant.attributes?.[attributeName])
              .filter((value): value is string => Boolean(value))
          )
        )

        const availableValues = getAvailableOptions
          ? getAvailableOptions(attributeName, selectedAttributes)
          : allValues.filter((value) => {
              return variants.some((variant) => {
                if (variant.attributes?.[attributeName] !== value) {
                  return false
                }

                return Object.entries(selectedAttributes || {}).every(
                  ([key, selectedValue]) => {
                    if (key === attributeName) return true
                    if (!key || !selectedValue) return true

                    return variant.attributes?.[key] === selectedValue
                  }
                )
              })
            })

        const isColor = isColorAttribute(attributeName)
        const useNativeSelect = allValues.length > maxOptionsBeforeSelect

        return {
          attributeName,
          allValues,
          availableValues,
          isColor,
          useNativeSelect,
        }
      })
    }, [
      attributeNames,
      getAvailableOptions,
      maxOptionsBeforeSelect,
      selectedAttributes,
      variants,
    ])

    if (!variants.length) return null

    const displayPair = currentVariant ? finalPair : basePair

    const displayLabel = currentVariant
      ? 'Variante sélectionnée'
      : variants.length > 0
        ? 'À partir de'
        : 'Prix'

    const showPriceBlock =
      showPrice && displayPair.hasPrice

    const showDifferenceBadge =
      Boolean(currentVariant) && Boolean(priceDifference)

    return (
      <div ref={ref} className={cn('space-y-4', className)}>
        {attributeData.map(({
          attributeName,
          allValues,
          availableValues,
          isColor,
          useNativeSelect,
        }) => {
          if (compact && allValues.length <= 1) return null

          return (
            <div key={attributeName}>
              <p className="mb-2 text-sm font-medium capitalize text-foreground">
                {attributeName}

                {selectedAttributes[attributeName] && (
                  <span className="ml-1 text-gold-600">
                    : {selectedAttributes[attributeName]}
                  </span>
                )}
              </p>

              {useNativeSelect ? (
                <select
                  value={selectedAttributes[attributeName] || ''}
                  onChange={(event) =>
                    handleOptionClick(attributeName, event.target.value)
                  }
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground sm:w-auto"
                >
                  <option value="">Choisir {attributeName}</option>

                  {allValues.map((value) => {
                    const available = availableValues.includes(value)

                    return (
                      <option
                        key={value}
                        value={value}
                        disabled={!available}
                      >
                        {value}
                      </option>
                    )
                  })}
                </select>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allValues.map((value) => {
                    const available = availableValues.includes(value)
                    const selected =
                      selectedAttributes[attributeName] === value

                    const colorHex = isColor
                      ? getColorPreview(value)
                      : null

                    const tooltipContent = getOptionTooltip(
                      attributeName,
                      value,
                      available
                    )

                    const button = (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        whileHover={{ scale: available ? 1.05 : 1 }}
                        disabled={!available}
                        onClick={() =>
                          handleOptionClick(attributeName, value)
                        }
                        className={cn(
                          'relative inline-flex items-center gap-2 rounded-full border-2 font-medium transition-all duration-200',
                          sizeClasses[size],
                          selected
                            ? 'border-gold-400 bg-gold-400/10 text-gold-700 shadow-gold dark:text-gold-300'
                            : available
                              ? 'border-border text-foreground hover:border-gold-400 hover:bg-gold-400/5'
                              : 'cursor-not-allowed border-transparent bg-neutral-100 text-muted-foreground opacity-50 dark:bg-midnight-700'
                        )}
                        aria-pressed={selected}
                        aria-label={`${attributeName}: ${value}${
                          !available ? ' (indisponible)' : ''
                        }`}
                      >
                        {isColor && colorHex && (
                          <span
                            className="h-4 w-4 rounded-full border border-white/20 shadow-sm"
                            style={{ backgroundColor: colorHex }}
                          />
                        )}

                        <span>{value}</span>

                        {selected && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold-500"
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                              aria-hidden="true"
                            >
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          </motion.span>
                        )}
                      </motion.button>
                    )

                    if (tooltipContent) {
                      return (
                        <Tooltip
                          key={value}
                          content={tooltipContent}
                          position="top"
                          delay={300}
                        >
                          {button}
                        </Tooltip>
                      )
                    }

                    return <React.Fragment key={value}>{button}</React.Fragment>
                  })}
                </div>
              )}
            </div>
          )
        })}

        <AnimatePresence>
          {showPriceBlock && (
            <motion.div
              key={`${displayPair.primaryCurrency}-${displayPair.primaryAmount}`}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {displayLabel}
                </p>

                <p className="text-2xl font-bold text-foreground">
                  {displayPair.displayPrimary}
                </p>

                {displayPair.displaySecondary && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {displayPair.displaySecondary}
                  </p>
                )}
              </div>

              {showDifferenceBadge && priceDifference && (
                <Badge
                  variant={priceDifference.tone}
                  size="sm"
                  className="shrink-0"
                >
                  {priceDifference.display}
                </Badge>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {showStock && (
          <div className="text-sm">
            {currentVariant ? (
              currentVariant.stock > 0 ? (
                currentVariant.stock <= 5 ? (
                  <span className="text-amber-500">
                    Plus que {currentVariant.stock} en stock
                  </span>
                ) : (
                  <span className="text-green-500">En stock</span>
                )
              ) : (
                <span className="text-red-500">Rupture de stock</span>
              )
            ) : (
              <span className="text-muted-foreground">
                Sélectionnez une variante pour voir la disponibilité.
              </span>
            )}
          </div>
        )}
      </div>
    )
  }
)

ProductVariants.displayName = 'ProductVariants'

export default ProductVariants