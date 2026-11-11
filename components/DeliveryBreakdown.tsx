// components/DeliveryBreakdown.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  MapPin,
  Package,
  ShieldCheck,
  Truck,
  Zap,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useExchangeRate } from '@/hooks/useExchangeRate'

import {
  formatCdf,
  formatUsd,
  roundCdf,
  roundUsd,
} from '@/lib/currency'

import type {
  Currency,
  DeliveryModeId,
  ShippingBreakdownItem,
  ShippingQuote,
} from '@/lib/shipping-utils'

import { getDeliveryModeLabel } from '@/lib/shipping-utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface PricePair {
  usd: number
  cdf: number
}

interface DeliveryBreakdownProps {
  quote: ShippingQuote | null
  primaryCurrency?: Currency
  showTitle?: boolean
  defaultOpen?: boolean
  compact?: boolean
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
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

function getSecondaryCurrency(currency: Currency): Currency {
  return currency === 'USD' ? 'CDF' : 'USD'
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  RÉSOLUTION SIGNÉE USD / CDF
 *
 *  Règle :
 *  - Si USD existe (y compris négatif) → USD = vérité.
 *    CDF = USD × taux courant.
 *  - Si seulement CDF existe → CDF = source temporaire.
 *    USD = CDF / taux courant.
 *  - Aucun taux codé en dur.
 * ═══════════════════════════════════════════════════════════════
 */
function resolveSignedPair(
  usdSource: unknown,
  cdfSource: unknown,
  rate: number | null
): PricePair {
  const usdRaw = toNumber(usdSource)
  const cdfRaw = toNumber(cdfSource)

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let usd = usdRaw
  let cdf = cdfRaw

  if (usd !== 0) {
    /**
     * USD = source principale.
     * Le CDF stocké est ignoré si un taux courant est disponible.
     */
    cdf = rateOk ? roundCdf(usd * rateNum) : cdf
  } else if (cdf !== 0 && rateOk) {
    /**
     * Legacy : seulement un CDF existe.
     * On dérive un USD temporaire.
     */
    usd = roundUsd(cdf / rateNum)
  }

  return {
    usd: roundUsd(usd),
    cdf: roundCdf(cdf),
  }
}

function formatSignedMoney(value: number, currency: Currency): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '—'

  const abs = Math.abs(value)
  const formatted = currency === 'USD' ? formatUsd(abs) : formatCdf(abs)

  return value < 0 ? `- ${formatted}` : formatted
}

function formatTotalMoney(
  value: number,
  currency: Currency,
  available: boolean
): string {
  if (!available) return '—'
  if (!Number.isFinite(value)) return '—'

  if (value === 0) return 'Gratuite'

  const formatted = currency === 'USD' ? formatUsd(value) : formatCdf(value)

  return value < 0 ? `- ${formatted}` : formatted
}

function formatSecondarySigned(
  value: number,
  currency: Currency
): string | null {
  if (!Number.isFinite(value) || value === 0) return null

  const formatted = formatSignedMoney(Math.abs(value), currency)

  return value < 0 ? `- ≈ ${formatted}` : `≈ ${formatted}`
}

function getModeIcon(mode: DeliveryModeId) {
  if (mode === 'point_retrait') return <MapPin size={16} aria-hidden="true" />
  if (mode === 'express') return <Zap size={16} aria-hidden="true" />
  return <Truck size={16} aria-hidden="true" />
}

function getItemTone(item: ShippingBreakdownItem): string {
  if (
    item.type === 'discount' ||
    item.type === 'free_shipping' ||
    item.type === 'cap'
  ) {
    return 'text-emerald-600 dark:text-emerald-400'
  }

  if (item.type === 'floor') {
    return 'text-amber-600 dark:text-amber-400'
  }

  if (item.type === 'mandatory') {
    return 'text-foreground'
  }

  return 'text-muted-foreground'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export default function DeliveryBreakdown({
  quote,
  primaryCurrency = 'USD',
  showTitle = true,
  defaultOpen = false,
  compact = false,
  className,
}: DeliveryBreakdownProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [mounted, setMounted] = useState(false)

  const exchange = useExchangeRate() as any

  const currentRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   *
   * Stratégie :
   * - priorité au taux courant via useExchangeRate()
   * - fallback temporaire sur quote.rate_used si le taux courant n’est pas encore prêt
   * - aucun taux codé en dur
   */
  const conversionRate = useMemo(() => {
    if (!mounted) return null
    return currentRate ?? quote?.rate_used ?? null
  }, [currentRate, mounted, quote?.rate_used])

  const secondaryCurrency = getSecondaryCurrency(primaryCurrency)

  const quoteTotals = useMemo<PricePair>(() => {
    if (!quote) return { usd: 0, cdf: 0 }

    return resolveSignedPair(
      quote.total_usd,
      quote.total_cdf,
      conversionRate
    )
  }, [conversionRate, quote])

  const primaryTotal =
    primaryCurrency === 'USD' ? quoteTotals.usd : quoteTotals.cdf

  const secondaryTotal =
    secondaryCurrency === 'USD' ? quoteTotals.usd : quoteTotals.cdf

  const mandatoryItems = useMemo(() => {
    if (!quote) return []

    return quote.breakdown.filter((item) => item.type === 'mandatory')
  }, [quote])

  const adjustmentItems = useMemo(() => {
    if (!quote) return []

    return quote.breakdown.filter(
      (item) =>
        item.type === 'discount' ||
        item.type === 'free_shipping' ||
        item.type === 'cap' ||
        item.type === 'floor'
    )
  }, [quote])

  const hasDetails =
    mandatoryItems.length > 0 ||
    (quote?.groups.length ?? 0) > 0 ||
    adjustmentItems.length > 0 ||
    (quote?.warnings.length ?? 0) > 0

  const freeShippingThresholdPair = useMemo<PricePair>(() => {
    if (!quote?.free_shipping_threshold_usd) {
      return { usd: 0, cdf: 0 }
    }

    return resolveSignedPair(
      quote.free_shipping_threshold_usd,
      0,
      conversionRate
    )
  }, [conversionRate, quote?.free_shipping_threshold_usd])

  const freeShippingThresholdPrimary =
    primaryCurrency === 'USD'
      ? freeShippingThresholdPair.usd
      : freeShippingThresholdPair.cdf

  const freeShippingThresholdSecondary =
    secondaryCurrency === 'USD'
      ? freeShippingThresholdPair.usd
      : freeShippingThresholdPair.cdf

  if (!quote) return null

  const renderPair = (pair: PricePair) => {
    const primary =
      primaryCurrency === 'USD' ? pair.usd : pair.cdf

    const secondary =
      secondaryCurrency === 'USD' ? pair.usd : pair.cdf

    return { primary, secondary }
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card/60 p-4',
        compact ? 'text-xs' : 'text-sm',
        className
      )}
    >
      {showTitle && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            {getModeIcon(quote.mode)}
            {getDeliveryModeLabel(quote.mode)}
          </div>

          {quote.available ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={12} aria-hidden="true" />
              Disponible
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 dark:text-red-400">
              <AlertTriangle size={12} aria-hidden="true" />
              Indisponible
            </span>
          )}
        </div>
      )}

      {!quote.available && quote.unavailable_reason && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {quote.unavailable_reason}
        </p>
      )}

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Frais de livraison</p>

          <p className="mt-1 text-xl font-extrabold text-gold-600">
            {formatTotalMoney(primaryTotal, primaryCurrency, quote.available)}
          </p>

          {quote.available &&
            secondaryTotal !== 0 &&
            Math.abs(secondaryTotal) !== Math.abs(primaryTotal) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatSecondarySigned(secondaryTotal, secondaryCurrency)}
              </p>
            )}
        </div>

        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <Clock size={12} aria-hidden="true" />
            Délai estimé
          </p>

          <p className="mt-1 text-sm font-medium text-foreground">
            {quote.delay_label}
          </p>
        </div>
      </div>

      {quote.free_shipping_applied && (
        <div className="mt-3 space-y-1">
          <p className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <ShieldCheck size={14} aria-hidden="true" />
            Livraison gratuite appliquée sur la partie consolidable.
          </p>

          {freeShippingThresholdPrimary !== 0 && (
            <p className="text-[11px] text-muted-foreground">
              Seuil atteint :{' '}
              {formatSignedMoney(
                freeShippingThresholdPrimary,
                primaryCurrency
              )}

              {freeShippingThresholdSecondary !== 0 &&
                Math.abs(freeShippingThresholdSecondary) !==
                  Math.abs(freeShippingThresholdPrimary) && (
                  <span className="ml-1 opacity-80">
                    {formatSecondarySigned(
                      freeShippingThresholdSecondary,
                      secondaryCurrency
                    )}
                  </span>
                )}
            </p>
          )}
        </div>
      )}

      {quote.warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {quote.warnings.map((warning, index) => (
            <p
              key={`${warning}-${index}`}
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
            >
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      )}

      {hasDetails && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          aria-expanded={open}
        >
          {open ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
          {open ? 'Masquer le détail' : 'Voir le détail de la livraison'}
        </button>
      )}

      {open && hasDetails && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {mandatoryItems.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                <Package size={14} className="text-gold-500" aria-hidden="true" />
                Frais obligatoires / non consolidables
              </p>

              <div className="space-y-2">
                {mandatoryItems.map((item) => {
                  const pair = resolveSignedPair(
                    item.amount_usd,
                    item.amount_cdf,
                    conversionRate
                  )

                  const { primary, secondary } = renderPair(pair)

                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {item.label}
                        </p>

                        {item.quantity && item.quantity > 1 && (
                          <p className="text-[11px] text-muted-foreground">
                            Quantité : {item.quantity}
                          </p>
                        )}

                        {item.note && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {item.note}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            'font-semibold',
                            getItemTone(item)
                          )}
                        >
                          {formatSignedMoney(primary, primaryCurrency)}
                        </p>

                        {!compact &&
                          secondary !== 0 &&
                          Math.abs(secondary) !== Math.abs(primary) && (
                            <p className="text-[11px] text-muted-foreground">
                              {formatSecondarySigned(
                                secondary,
                                secondaryCurrency
                              )}
                            </p>
                          )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {quote.groups.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                <Truck size={14} className="text-gold-500" aria-hidden="true" />
                Articles consolidables regroupés
              </p>

              <div className="space-y-3">
                {quote.groups.map((group) => {
                  const groupPair = resolveSignedPair(
                    group.amount_usd,
                    group.amount_cdf,
                    conversionRate
                  )

                  const groupPrimary =
                    primaryCurrency === 'USD'
                      ? groupPair.usd
                      : groupPair.cdf

                  const groupSecondary =
                    secondaryCurrency === 'USD'
                      ? groupPair.usd
                      : groupPair.cdf

                  return (
                    <div
                      key={group.group}
                      className="rounded-xl border border-border bg-background/50 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">
                          {group.label}
                        </p>

                        <div className="text-right">
                          <p className="font-semibold text-foreground">
                            {formatSignedMoney(
                              groupPrimary,
                              primaryCurrency
                            )}
                          </p>

                          {!compact &&
                            groupSecondary !== 0 &&
                            Math.abs(groupSecondary) !==
                              Math.abs(groupPrimary) && (
                              <p className="text-[11px] text-muted-foreground">
                                {formatSecondarySigned(
                                  groupSecondary,
                                  secondaryCurrency
                                )}
                              </p>
                            )}
                        </div>
                      </div>

                      {group.items.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-border pt-2">
                          {group.items.map((item) => {
                            const pair = resolveSignedPair(
                              item.amount_usd,
                              item.amount_cdf,
                              conversionRate
                            )

                            const { primary, secondary } = renderPair(pair)

                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 text-xs"
                              >
                                <span className="min-w-0 truncate text-muted-foreground">
                                  {item.label}
                                  {item.quantity && item.quantity > 1
                                    ? ` ×${item.quantity}`
                                    : ''}
                                </span>

                                <div className="shrink-0 text-right">
                                  <span
                                    className={cn(
                                      'font-medium',
                                      getItemTone(item)
                                    )}
                                  >
                                    {formatSignedMoney(
                                      primary,
                                      primaryCurrency
                                    )}
                                  </span>

                                  {!compact &&
                                    secondary !== 0 &&
                                    Math.abs(secondary) !==
                                      Math.abs(primary) && (
                                      <p className="text-[10px] text-muted-foreground">
                                        {formatSecondarySigned(
                                          secondary,
                                          secondaryCurrency
                                        )}
                                      </p>
                                    )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {adjustmentItems.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                <Info size={14} className="text-gold-500" aria-hidden="true" />
                Ajustements de consolidation
              </p>

              <div className="space-y-2">
                {adjustmentItems.map((item) => {
                  const pair = resolveSignedPair(
                    item.amount_usd,
                    item.amount_cdf,
                    conversionRate
                  )

                  const { primary, secondary } = renderPair(pair)

                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {item.label}
                        </p>

                        {item.note && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {item.note}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            'font-semibold',
                            getItemTone(item)
                          )}
                        >
                          {formatSignedMoney(primary, primaryCurrency)}
                        </p>

                        {!compact &&
                          secondary !== 0 &&
                          Math.abs(secondary) !== Math.abs(primary) && (
                            <p className="text-[11px] text-muted-foreground">
                              {formatSecondarySigned(
                                secondary,
                                secondaryCurrency
                              )}
                            </p>
                          )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex items-end justify-between gap-3 border-t border-gold-400/20 pt-3">
            <p className="text-sm font-semibold text-foreground">
              Total livraison
            </p>

            <div className="text-right">
              <p className="text-lg font-extrabold text-gold-600">
                {formatTotalMoney(
                  primaryTotal,
                  primaryCurrency,
                  quote.available
                )}
              </p>

              {quote.available &&
                secondaryTotal !== 0 &&
                Math.abs(secondaryTotal) !== Math.abs(primaryTotal) && (
                  <p className="text-xs text-muted-foreground">
                    {formatSecondarySigned(
                      secondaryTotal,
                      secondaryCurrency
                    )}
                  </p>
                )}
            </div>
          </div>

          {(quote.requires_signature ||
            quote.fragile ||
            quote.bulky ||
            quote.hazardous ||
            quote.installation_required) && (
            <div className="grid gap-2 rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground sm:grid-cols-2">
              {quote.requires_signature && (
                <p className="flex items-center gap-2">
                  <ShieldCheck
                    size={14}
                    className="text-gold-500"
                    aria-hidden="true"
                  />
                  Signature requise
                </p>
              )}

              {quote.fragile && (
                <p className="flex items-center gap-2">
                  <AlertTriangle
                    size={14}
                    className="text-amber-500"
                    aria-hidden="true"
                  />
                  Article fragile
                </p>
              )}

              {quote.bulky && (
                <p className="flex items-center gap-2">
                  <Package
                    size={14}
                    className="text-gold-500"
                    aria-hidden="true"
                  />
                  Article volumineux
                </p>
              )}

              {quote.hazardous && (
                <p className="flex items-center gap-2">
                  <AlertTriangle
                    size={14}
                    className="text-red-500"
                    aria-hidden="true"
                  />
                  Article sensible / dangereux
                </p>
              )}

              {quote.installation_required && (
                <p className="flex items-center gap-2">
                  <Truck
                    size={14}
                    className="text-gold-500"
                    aria-hidden="true"
                  />
                  Installation requise
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}