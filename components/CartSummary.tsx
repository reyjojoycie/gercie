// components/CartSummary.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'

import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Info,
  Loader2,
  Lock,
  Percent,
  RefreshCw,
  ShieldCheck,
  Tag,
  TrendingDown,
  Truck,
  Wallet,
  X,
} from 'lucide-react'

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

interface PromoCode {
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
  /** Variante d’affichage : sticky sidebar, inline, compact */
  variant?: 'sidebar' | 'inline' | 'compact'

  /** Devise principale d’affichage. USD reste la source de vérité. */
  displayCurrency?: Currency

  /** Afficher le prix secondaire calculé */
  showSecondaryPrice?: boolean

  /** Afficher le champ de code promo */
  showPromoCode?: boolean

  /** Afficher les garanties */
  showTrustBadges?: boolean

  /** Afficher la barre de progression livraison gratuite */
  showFreeShippingProgress?: boolean

  /**
   * Seuil de livraison gratuite.
   * Par défaut compatibilité legacy : valeur en CDF.
   * Utiliser thresholdCurrency="USD" si la valeur est déjà en USD.
   */
  freeShippingThreshold?: number

  /** Devise du seuil de livraison gratuite */
  thresholdCurrency?: Currency

  /** Afficher les frais de livraison estimés */
  showShippingEstimate?: boolean

  /** Callback personnalisé avant de passer commande */
  onCheckout?: () => void

  /** Classe additionnelle */
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_FREE_SHIPPING_THRESHOLD_CDF = 50000
const DEFAULT_ESTIMATED_DELAY = '2-4 jours'

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
  const n = Number.isFinite(value) ? Math.max(0, value) : 0
  return `$${n.toFixed(2)}`
}

function formatCdf(value: number): string {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0
  return `${Math.round(n).toLocaleString('fr-FR')} FC`
}

function formatCurrency(value: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

/**
 * Résout un couple USD/CDF.
 *
 * Règle absolue :
 * - Si USD existe → USD = vérité, CDF = USD × taux.
 * - Si seulement CDF existe → CDF = source temporaire, USD = CDF / taux.
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number,
  cdfSource: number,
  rate: number | null
): PricePair {
  const rateOk = Number.isFinite(Number(rate)) && Number(rate) > 0

  let usd = usdSource > 0 ? roundUsd(usdSource) : 0
  let cdf = cdfSource > 0 ? roundCdf(cdfSource) : 0

  if (usd > 0) {
    /**
     * USD = source principale.
     * Le CDF stocké est ignoré s’il existe, car potentiellement obsolète.
     */
    cdf = rateOk ? toCdf(usd, Number(rate)) : 0
  } else if (cdf > 0 && rateOk) {
    /**
     * Legacy : seulement un CDF existe.
     * On dérive un USD temporaire.
     */
    usd = toUsd(cdf, Number(rate))
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
    primaryAmount: roundUsdOrCdf(primaryAmount, primaryCurrency),
    secondaryCurrency,
    secondaryAmount: roundUsdOrCdf(secondaryAmount, secondaryCurrency),
  }
}

function roundUsdOrCdf(value: number, currency: Currency): number {
  return currency === 'USD' ? roundUsd(value) : roundCdf(value)
}

function safeAdd(...values: number[]): number {
  return values.reduce((acc, value) => {
    const n = Number(value)
    return Number.isFinite(n) ? acc + n : acc
  }, 0)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  INTERNAL SUMMARY LINE                                          */
/* ═══════════════════════════════════════════════════════════════ */

function SummaryLine({
  label,
  icon,
  display,
  tone = 'default',
  showSecondary = true,
  isNegative = false,
  freeLabel,
}: {
  label: string
  icon?: React.ReactNode
  display: DisplayPrice
  tone?: 'default' | 'discount' | 'total' | 'muted'
  showSecondary?: boolean
  isNegative?: boolean
  freeLabel?: string
}) {
  const hasPrimary = display.primaryAmount > 0
  const hasSecondary =
    showSecondary &&
    display.secondaryAmount > 0 &&
    display.secondaryAmount !== display.primaryAmount

  const primaryText = hasPrimary
    ? `${isNegative ? '- ' : ''}${formatCurrency(
        display.primaryAmount,
        display.primaryCurrency
      )}`
    : freeLabel ?? '—'

  const secondaryText = hasSecondary
    ? `≈ ${isNegative ? '- ' : ''}${formatCurrency(
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

export function CartSummary({
  variant = 'sidebar',
  displayCurrency = 'USD',
  showSecondaryPrice = true,
  showPromoCode = true,
  showTrustBadges = true,
  showFreeShippingProgress = true,
  freeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD_CDF,
  thresholdCurrency = 'CDF',
  showShippingEstimate = true,
  onCheckout,
  className,
}: CartSummaryProps) {
  const router = useRouter()
  const toast = useToast() as any
  const addToast = toast?.addToast

  const cart = useCart() as any

  const items = useMemo(
    () => (Array.isArray(cart?.items) ? cart.items : []),
    [cart?.items]
  )

  const summary = useMemo(
    () => cart?.summary ?? {},
    [cart?.summary]
  )

  const activePromo = useMemo(
    () => (cart?.activePromo as PromoCode | null) ?? null,
    [cart?.activePromo]
  )

  const isSyncing = Boolean(cart?.isSyncing)

  const applyPromoCode = cart?.applyPromoCode
  const removePromoCode = cart?.removePromoCode

  const exchange = useExchangeRate() as any
  const rawRate = useMemo(() => resolveRate(exchange), [exchange])
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
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState('')

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
        ? toCdf(cappedUsd, rate)
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
   * Le résumé panier affiche un total estimé incluant la livraison estimée.
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
        ? toCdf(computedUsd, rate)
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

    /**
     * Si le contexte fournit déjà un totalUSD cohérent, on peut l’utiliser
     * comme fallback secondaire, mais la priorité reste le calcul aligné
     * sous-total - remise + livraison estimée.
     */
    const contextTotalPair = resolvePricePair(
      firstPositive(summary?.totalUSD, summary?.total_usd),
      firstPositive(summary?.total),
      rate
    )

    if (
      contextTotalPair.usd > 0 ||
      contextTotalPair.cdf > 0
    ) {
      /**
       * On garde le total du contexte seulement s’il est cohérent.
       * Sinon on utilise le total estimé calculé.
       */
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
    return rate ? toUsd(threshold, rate) : 0
  }, [freeShippingThreshold, rate, thresholdCurrency])

  const progressPercent = useMemo(() => {
    if (!showFreeShippingProgress) return 100
    if (thresholdUsd <= 0) return 0

    const percent = (subtotalPair.usd / thresholdUsd) * 100

    return Math.max(0, Math.min(100, Math.round(percent)))
  }, [showFreeShippingProgress, subtotalPair.usd, thresholdUsd])

  const missingUsd = useMemo(() => {
    if (thresholdUsd <= 0) return 0
    return roundUsd(Math.max(0, thresholdUsd - subtotalPair.usd))
  }, [subtotalPair.usd, thresholdUsd])

  const missingPair = useMemo(
    () =>
      resolvePricePair(
        missingUsd,
        0,
        rate
      ),
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
      shippingPair.usd === 0 &&
      shippingPair.cdf === 0 &&
      Boolean(shippingQuote) &&
      shippingQuote?.available !== false
    )

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

    setPromoLoading(true)
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
      setPromoLoading(false)
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
  /*  Délai estimé                                               */
  /* ---------------------------------------------------------- */

  const estimatedDelay =
    shippingQuote?.delay_label ||
    summary?.shippingQuote?.delay_label ||
    DEFAULT_ESTIMATED_DELAY

  /* ---------------------------------------------------------- */
  /*  Rendu                                                      */
  /* ---------------------------------------------------------- */

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        variant === 'sidebar' && 'sticky top-24',
        className
      )}
    >
      {/* Carte principale */}
      <div
        className={cn(
          'overflow-hidden rounded-2xl border-2 border-gold-400/20 bg-white/70 shadow-gold backdrop-blur-xl dark:bg-midnight-800/60',
          variant === 'compact' ? 'p-4' : 'p-5 md:p-6'
        )}
      >
        {/* En-tête */}
        <div className="mb-5 flex items-center gap-2">
          <div className="rounded-lg bg-gold-100 p-2 dark:bg-gold-900/30">
            <Tag
              size={variant === 'compact' ? 16 : 20}
              className="text-gold-500"
              aria-hidden="true"
            />
          </div>

          <div>
            <h3
              className={cn(
                'font-serif font-bold text-foreground',
                variant === 'compact' ? 'text-base' : 'text-lg'
              )}
            >
              Récapitulatif
            </h3>

            <p className="text-xs text-muted-foreground">
              {cart?.totalItems ?? items.length} article
              {(cart?.totalItems ?? items.length) > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Lignes de résumé */}
        <div className="space-y-3 text-sm">
          <SummaryLine
            label="Sous-total"
            icon={<Truck size={14} aria-hidden="true" />}
            display={subtotalDisplay}
            showSecondary={showSecondaryPrice}
          />

          <AnimatePresence>
            {discountDisplay.primaryAmount > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <SummaryLine
                  label={
                    activePromo?.code
                      ? `Réduction (${activePromo.code})`
                      : 'Réduction'
                  }
                  icon={<Percent size={14} aria-hidden="true" />}
                  display={discountDisplay}
                  tone="discount"
                  showSecondary={showSecondaryPrice}
                  isNegative
                />
              </motion.div>
            )}
          </AnimatePresence>

          {showShippingEstimate && (
            <SummaryLine
              label="Livraison estimée"
              icon={<Truck size={14} aria-hidden="true" />}
              display={shippingDisplay}
              showSecondary={showSecondaryPrice}
              freeLabel={shippingIsFree ? 'Gratuite' : undefined}
            />
          )}

          {discountDisplay.primaryAmount > 0 && (
            <div className="flex items-center justify-between gap-3 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="flex items-center gap-1">
                <TrendingDown size={12} aria-hidden="true" />
                Vous économisez
              </span>

              <span className="font-medium">
                {formatCurrency(
                  discountDisplay.primaryAmount,
                  discountDisplay.primaryCurrency
                )}

                {showSecondaryPrice &&
                  discountDisplay.secondaryAmount > 0 &&
                  discountDisplay.secondaryAmount !==
                    discountDisplay.primaryAmount && (
                    <span className="ml-1 text-[10px] opacity-80">
                      ≈{' '}
                      {formatCurrency(
                        discountDisplay.secondaryAmount,
                        discountDisplay.secondaryCurrency
                      )}
                    </span>
                  )}
              </span>
            </div>
          )}
        </div>

        {/* Barre de progression livraison gratuite */}
        {showFreeShippingProgress && thresholdUsd > 0 && (
          <>
            {!isFreeShippingReached && (
              <div className="mt-4 rounded-xl border border-amber-200/50 bg-amber-50 p-3 dark:border-amber-800/30 dark:bg-amber-900/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Plus que{' '}
                    {formatCurrency(
                      missingDisplay.primaryAmount,
                      missingDisplay.primaryCurrency
                    )}

                    {showSecondaryPrice &&
                      missingDisplay.secondaryAmount > 0 &&
                      missingDisplay.secondaryAmount !==
                        missingDisplay.primaryAmount && (
                      <span className="ml-1 text-[10px] opacity-80">
                        ≈{' '}
                        {formatCurrency(
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
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-gold-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}

            {isFreeShippingReached && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-green-200/50 bg-green-50 p-3 dark:border-green-800/30 dark:bg-green-900/10">
                <CheckCircle2
                  size={16}
                  className="shrink-0 text-green-500"
                  aria-hidden="true"
                />

                <span className="text-xs font-medium text-green-700 dark:text-green-300">
                  Livraison gratuite débloquée !
                </span>
              </div>
            )}
          </>
        )}

        {/* Total */}
        <div className="mt-4 border-t border-gold-400/20 pt-4">
          <SummaryLine
            label="Total estimé"
            display={totalDisplay}
            tone="total"
            showSecondary={showSecondaryPrice}
          />

          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            Le montant final de livraison est confirmé à l’étape commande.
          </p>
        </div>

        {/* Code promo */}
        {showPromoCode && (
          <div className="mt-4 space-y-2">
            {activePromo && promoValid ? (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-900/20"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <CheckCircle2
                    size={16}
                    className="shrink-0 text-green-500"
                    aria-hidden="true"
                  />

                  <span className="truncate text-sm font-medium text-green-700 dark:text-green-300">
                    {activePromo.code}
                  </span>

                  {activePromo.description && (
                    <Tooltip content={activePromo.description}>
                      <Info
                        size={14}
                        className="shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Tooltip>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleRemovePromo()}
                  className="rounded-md p-1 text-red-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  aria-label="Retirer le code promo"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </motion.div>
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
              <div className="flex gap-2">
                <Input
                  placeholder="Code promo"
                  value={promoInput}
                  onChange={(event: any) => {
                    setPromoInput(String(event?.target?.value ?? '').toUpperCase())
                    setPromoError('')
                  }}
                  size="sm"
                  variant="glass"
                  className="flex-1 uppercase"
                  error={promoError}
                  allowClear
                  onClear={() => {
                    setPromoInput('')
                    setPromoError('')
                  }}
                />

                <Button
                  variant="outline-gold"
                  size="sm"
                  onClick={() => void handleApplyPromo()}
                  loading={promoLoading}
                  disabled={!promoInput.trim() || promoLoading}
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

        {/* Bouton commander */}
        <Button
          variant="luxe"
          fullWidth
          size="lg"
          className="mt-5 transform shadow-gold transition-all hover:scale-[1.02] hover:shadow-glow-gold"
          disabled={items.length === 0 || isSyncing}
          onClick={handleCheckout}
          rightIcon={
            isSyncing ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight size={18} aria-hidden="true" />
            )
          }
        >
          {isSyncing ? 'Synchronisation...' : 'Passer la commande'}
        </Button>

        {/* Badges de confiance */}
        {showTrustBadges && (
          <div className="mt-4 space-y-2 border-t border-gold-400/20 pt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck
                size={14}
                className="shrink-0 text-gold-500"
                aria-hidden="true"
              />
              <span>Paiement 100% sécurisé (SSL)</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock
                size={14}
                className="shrink-0 text-gold-500"
                aria-hidden="true"
              />
              <span>Protection acheteur incluse</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw
                size={14}
                className="shrink-0 text-gold-500"
                aria-hidden="true"
              />
              <span>Retours possibles selon conditions produit</span>
            </div>

            {estimatedDelay && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock
                  size={14}
                  className="shrink-0 text-gold-500"
                  aria-hidden="true"
                />
                <span>Livraison estimée : {estimatedDelay}</span>
              </div>
            )}

            {rateLoading && !rate && hasUsd && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <Loader2
                  size={14}
                  className="shrink-0 animate-spin"
                  aria-hidden="true"
                />
                <span>Conversion CDF en cours de chargement…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Carte secondaire : moyens de paiement */}
      {variant !== 'compact' && (
        <div className="rounded-2xl border border-gold-400/10 bg-white/50 p-4 backdrop-blur-sm dark:bg-midnight-800/40">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Paiements acceptés
          </h4>

          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <Wallet size={12} aria-hidden="true" />
              Gercie Wallet
            </Badge>

            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <CreditCard size={12} aria-hidden="true" />
              Orange Money
            </Badge>

            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <CreditCard size={12} aria-hidden="true" />
              Airtel Money
            </Badge>

            <Badge variant="neutral" size="sm" className="flex items-center gap-1">
              <CreditCard size={12} aria-hidden="true" />
              M-Pesa
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}