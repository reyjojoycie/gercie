// components/DeliveryBreakdown.tsx
'use client'

import { useState } from 'react'
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
import type {
  Currency,
  DeliveryModeId,
  ShippingBreakdownItem,
  ShippingQuote,
} from '@/lib/shipping-utils'
import {
  formatShippingMoney,
  getDeliveryModeLabel,
  getShippingPrimaryValue,
  getShippingSecondaryCurrency,
  getShippingSecondaryValue,
} from '@/lib/shipping-utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

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

function getModeIcon(mode: DeliveryModeId) {
  if (mode === 'point_retrait') return <MapPin size={16} />
  if (mode === 'express') return <Zap size={16} />
  return <Truck size={16} />
}

function getItemTone(item: ShippingBreakdownItem): string {
  if (item.type === 'discount' || item.type === 'free_shipping' || item.type === 'cap') {
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

function formatItemAmount(
  item: ShippingBreakdownItem,
  currency: Currency,
  rate: number | null
): string {
  const value =
    currency === 'USD'
      ? item.amount_usd
      : item.amount_cdf ?? (rate ? item.amount_usd * rate : 0)

  const formatted = formatShippingMoney(Math.abs(value), currency)

  if (value < 0) {
    return `- ${formatted}`
  }

  if (value === 0) {
    return formatted
  }

  return formatted
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

  if (!quote) return null

  const secondaryCurrency = getShippingSecondaryCurrency(primaryCurrency)

  const primaryTotal = getShippingPrimaryValue(quote, primaryCurrency)
  const secondaryTotal = getShippingSecondaryValue(quote, primaryCurrency)

  const rate = quote.rate_used

  const mandatoryItems = quote.breakdown.filter(
    (item) => item.type === 'mandatory'
  )

  const adjustmentItems = quote.breakdown.filter(
    (item) =>
      item.type === 'discount' ||
      item.type === 'free_shipping' ||
      item.type === 'cap' ||
      item.type === 'floor'
  )

  const hasDetails =
    mandatoryItems.length > 0 ||
    quote.groups.length > 0 ||
    adjustmentItems.length > 0 ||
    quote.warnings.length > 0

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
              <ShieldCheck size={12} />
              Disponible
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 dark:text-red-400">
              <AlertTriangle size={12} />
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
            {formatShippingMoney(primaryTotal, primaryCurrency)}
          </p>

          {secondaryTotal > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              ≈ {formatShippingMoney(secondaryTotal, secondaryCurrency)}
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <Clock size={12} />
            Délai estimé
          </p>

          <p className="mt-1 text-sm font-medium text-foreground">
            {quote.delay_label}
          </p>
        </div>
      </div>

      {quote.free_shipping_applied && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <ShieldCheck size={14} />
          Livraison gratuite appliquée sur la partie consolidable.
        </p>
      )}

      {quote.warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {quote.warnings.map((warning, index) => (
            <p
              key={`${warning}-${index}`}
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      )}

      {hasDetails && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          aria-expanded={open}
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {open ? 'Masquer le détail' : 'Voir le détail de la livraison'}
        </button>
      )}

      {open && hasDetails && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {mandatoryItems.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                <Package size={14} className="text-gold-500" />
                Frais obligatoires / non consolidables
              </p>

              <div className="space-y-2">
                {mandatoryItems.map((item) => (
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

                    <p className={cn('shrink-0 font-semibold', getItemTone(item))}>
                      {formatItemAmount(item, primaryCurrency, rate)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {quote.groups.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                <Truck size={14} className="text-gold-500" />
                Articles consolidables regroupés
              </p>

              <div className="space-y-3">
                {quote.groups.map((group) => (
                  <div
                    key={group.group}
                    className="rounded-xl border border-border bg-background/50 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-foreground">{group.label}</p>

                      <p className="font-semibold text-foreground">
                        {formatShippingMoney(
                          primaryCurrency === 'USD'
                            ? group.amount_usd
                            : group.amount_cdf ??
                              (rate ? group.amount_usd * rate : 0),
                          primaryCurrency
                        )}
                      </p>
                    </div>

                    {group.items.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {group.items.map((item) => (
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

                            <span className="shrink-0 font-medium text-foreground">
                              {formatItemAmount(item, primaryCurrency, rate)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {adjustmentItems.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                <Info size={14} className="text-gold-500" />
                Ajustements de consolidation
              </p>

              <div className="space-y-2">
                {adjustmentItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"
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

                    <p className={cn('shrink-0 font-semibold', getItemTone(item))}>
                      {formatItemAmount(item, primaryCurrency, rate)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-end justify-between gap-3 border-t border-gold-400/20 pt-3">
            <p className="text-sm font-semibold text-foreground">
              Total livraison
            </p>

            <div className="text-right">
              <p className="text-lg font-extrabold text-gold-600">
                {formatShippingMoney(primaryTotal, primaryCurrency)}
              </p>

              {secondaryTotal > 0 && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatShippingMoney(secondaryTotal, secondaryCurrency)}
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
                  <ShieldCheck size={14} className="text-gold-500" />
                  Signature requise
                </p>
              )}

              {quote.fragile && (
                <p className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500" />
                  Article fragile
                </p>
              )}

              {quote.bulky && (
                <p className="flex items-center gap-2">
                  <Package size={14} className="text-gold-500" />
                  Article volumineux
                </p>
              )}

              {quote.hazardous && (
                <p className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-500" />
                  Article sensible / dangereux
                </p>
              )}

              {quote.installation_required && (
                <p className="flex items-center gap-2">
                  <Truck size={14} className="text-gold-500" />
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