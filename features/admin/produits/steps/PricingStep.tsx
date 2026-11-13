// features/admin/produits/steps/PricingStep.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

import { motion, useReducedMotion } from 'framer-motion'

import {
  AlertCircle,
  DollarSign,
  Lock,
  Percent,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'

import { useStepContext } from '../context/ProductFormContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'

import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

import {
  formatCdf,
  formatUsd,
  positiveNum,
} from '../lib/product-utils'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLES                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const readOnlyBase =
  'w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground placeholder:text-muted-foreground/70 focus:outline-none cursor-not-allowed'

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round(value + Number.EPSILON)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return roundCdf(usd * rate)
}

function toUsd(cdf: number, rate: number): number {
  if (!Number.isFinite(cdf) || cdf <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return round2(cdf / rate)
}

function parseNumericInput(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) ? n : null
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

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export default function PricingStep() {
  const prefersReducedMotion = useReducedMotion()

  const stepContext = useStepContext() as any
  const form = stepContext?.form ?? {}
  const contextRate = stepContext?.rate

  const exchange = useExchangeRate() as any

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  /* ------------------------------------------------------------ */
  /* Taux : contexte admin prioritaire, fallback hook global        */
  /* ------------------------------------------------------------ */

  const rawRate = useMemo(() => {
    const ctxRate = Number(contextRate)

    if (Number.isFinite(ctxRate) && ctxRate > 0) {
      return ctxRate
    }

    return resolveRate(exchange)
  }, [contextRate, exchange])

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   */
  const effectiveRate = mounted ? rawRate : null

  const rateNum = Number(effectiveRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0
  const rateLoading = !rateOk && Boolean(exchange?.loading)

  /* ------------------------------------------------------------ */
  /* Form state                                                    */
  /* ------------------------------------------------------------ */

  const {
    register,
    errors,
    watch,
    priceUsd,
    priceCdf,
    originalUsd,
    setPriceUsd,
    setPriceCdf,
    setOriginalUsd,
    priceSuggestion,
    priceSuggestionLoading,
    handlePriceSuggestion,
    applyPriceSuggestion,
    setPriceSuggestion,
    productId,
  } = form

  const currentPriceUsd = positiveNum(priceUsd)
  const currentPriceCdf = positiveNum(priceCdf)

  /* ------------------------------------------------------------ */
  /* Remise / prix barré                                           */
  /* ------------------------------------------------------------ */

  const remiseRaw =
    typeof watch === 'function' ? watch('remise_percent') : undefined

  const remisePercent = positiveNum(remiseRaw) ?? 0

  const computedOriginalUsd = useMemo(() => {
    if (!currentPriceUsd) return null
    if (remisePercent <= 0 || remisePercent >= 100) return null

    return round2(currentPriceUsd / (1 - remisePercent / 100))
  }, [currentPriceUsd, remisePercent])

  const displayOriginalUsd =
    positiveNum(originalUsd) ?? computedOriginalUsd

  const displayOriginalCdf =
    displayOriginalUsd && rateOk
      ? roundCdf(toCdf(displayOriginalUsd, rateNum))
      : null

  const savingsUsd =
    displayOriginalUsd && currentPriceUsd
      ? round2(Math.max(0, displayOriginalUsd - currentPriceUsd))
      : 0

  const savingsPercent =
    displayOriginalUsd &&
    currentPriceUsd &&
    displayOriginalUsd > currentPriceUsd
      ? Math.round(
          ((displayOriginalUsd - currentPriceUsd) / displayOriginalUsd) * 100
        )
      : 0

  const originalTooLow = Boolean(
    displayOriginalUsd &&
      currentPriceUsd &&
      displayOriginalUsd < currentPriceUsd
  )

  /* ------------------------------------------------------------ */
  /* Suggestion IA                                                 */
  /* ------------------------------------------------------------ */

  const suggestedUsd = useMemo(() => {
    if (!priceSuggestion) return null

    const directUsd = positiveNum(
      priceSuggestion.suggestedPriceUsd ??
        priceSuggestion.suggested_price_usd ??
        priceSuggestion.price_usd
    )

    if (directUsd) return directUsd

    const directCdf = positiveNum(
      priceSuggestion.suggestedPrice ??
        priceSuggestion.suggestedPriceCdf ??
        priceSuggestion.suggested_price_cdf ??
        priceSuggestion.price_cdf
    )

    if (directCdf && rateOk) {
      return toUsd(directCdf, rateNum)
    }

    return null
  }, [priceSuggestion, rateNum, rateOk])

  const suggestedCdf = useMemo(() => {
    if (suggestedUsd && rateOk) {
      return toCdf(suggestedUsd, rateNum)
    }

    return (
      positiveNum(
        priceSuggestion?.suggestedPrice ??
          priceSuggestion?.suggestedPriceCdf ??
          priceSuggestion?.suggested_price_cdf ??
          priceSuggestion?.price_cdf
      ) ?? null
    )
  }, [priceSuggestion, rateNum, rateOk, suggestedUsd])

  /* ------------------------------------------------------------ */
  /* USD = source principale, CDF = dérivé                          */
  /* ------------------------------------------------------------ */

  /**
   * Règle absolue :
   * - Si USD existe → USD = vérité.
   *   CDF = USD × taux courant.
   *
   * - Si seulement CDF existe (legacy) → CDF = source temporaire.
   *   USD = CDF / taux courant.
   *
   * - Aucun taux codé en dur.
   * - Le CDF n’est plus éditable comme vérité.
   */
  useEffect(() => {
    if (!rateOk) return
    if (typeof setPriceUsd !== 'function') return
    if (typeof setPriceCdf !== 'function') return

    const usd = positiveNum(priceUsd)
    const cdf = positiveNum(priceCdf)

    // Legacy : seulement CDF disponible → dériver USD temporaire
    if (!usd && cdf) {
      setPriceUsd(toUsd(cdf, rateNum).toFixed(2))
      return
    }

    // USD disponible → CDF recalculé
    if (usd) {
      const nextCdf = toCdf(usd, rateNum)

      if (cdf !== nextCdf) {
        setPriceCdf(String(nextCdf))
      }

      return
    }

    // USD vide → CDF vide
    if (cdf) {
      setPriceCdf('')
    }
  }, [
    priceCdf,
    priceUsd,
    rateNum,
    rateOk,
    setPriceCdf,
    setPriceUsd,
  ])

  const handleUsdChange = (value: string) => {
    if (typeof setPriceUsd === 'function') {
      setPriceUsd(value)
    }

    const n = parseNumericInput(value)

    if (rateOk && n != null && n > 0) {
      if (typeof setPriceCdf === 'function') {
        setPriceCdf(String(toCdf(n, rateNum)))
      }

      return
    }

    if (n == null || n <= 0) {
      if (typeof setPriceCdf === 'function') {
        setPriceCdf('')
      }
    }
  }

  const handleApplySuggestion = () => {
    if (suggestedUsd) {
      if (typeof setPriceUsd === 'function') {
        setPriceUsd(suggestedUsd.toFixed(2))
      }

      if (rateOk && typeof setPriceCdf === 'function') {
        setPriceCdf(String(toCdf(suggestedUsd, rateNum)))
      }
    }

    if (typeof applyPriceSuggestion === 'function') {
      applyPriceSuggestion()
    }
  }

  const handleUseComputedOriginal = () => {
    if (!computedOriginalUsd) return

    if (typeof setOriginalUsd === 'function') {
      setOriginalUsd(computedOriginalUsd.toFixed(2))
    }
  }

  const priceUsdError =
    errors?.price_usd?.message ||
    errors?.prix_usd?.message ||
    errors?.priceUsd?.message

  return (
    <motion.div
      key="pricing"
      initial={
        prefersReducedMotion ? false : { opacity: 0, y: 10 }
      }
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.2,
      }}
      className="space-y-5"
    >
      {/* Prix principal USD */}
      <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <DollarSign size={16} className="text-gold-500" />
          Prix principal : USD
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Prix USD *
            </span>

            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={
                priceUsd == null ? '' : String(priceUsd)
              }
              onChange={(e) => handleUsdChange(e.target.value)}
              className={cn(
                inputBase,
                priceUsdError && 'border-red-500/50 focus:ring-red-500'
              )}
              placeholder="Ex : 49.99"
              aria-invalid={Boolean(priceUsdError)}
              aria-describedby={
                priceUsdError ? 'price-usd-error' : undefined
              }
            />

            {priceUsdError ? (
              <p
                id="price-usd-error"
                className="text-xs text-red-500"
              >
                {priceUsdError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Source principale du prix.
              </p>
            )}
          </label>

          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              Prix CDF
              <Lock size={12} className="text-muted-foreground" />
            </span>

            <input
              type="number"
              step="1"
              min="0"
              value={
                priceCdf == null ? '' : String(priceCdf)
              }
              readOnly
              aria-readonly="true"
              className={cn(
                readOnlyBase,
                !rateOk && 'opacity-70'
              )}
              placeholder={
                rateOk
                  ? 'Calculé automatiquement depuis USD'
                  : 'En attente du taux USD/CDF'
              }
            />

            <p className="text-xs text-muted-foreground">
              Valeur calculée, non éditable. USD reste la vérité.
            </p>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {!mounted ? (
            <Badge variant="neutral" size="sm">
              Initialisation du taux…
            </Badge>
          ) : rateOk ? (
            <Badge variant="accent" size="sm">
              1 USD ≈ {formatCdf(rateNum)}
            </Badge>
          ) : rateLoading ? (
            <Badge variant="neutral" size="sm">
              Chargement du taux…
            </Badge>
          ) : (
            <Badge variant="danger" size="sm">
              <AlertCircle size={12} className="mr-1" />
              Taux indisponible
            </Badge>
          )}

          {currentPriceUsd ? (
            <span className="text-muted-foreground">
              {formatUsd(currentPriceUsd)}
              {rateOk && currentPriceCdf
                ? ` ≈ ${formatCdf(currentPriceCdf)}`
                : ''}
            </span>
          ) : null}
        </div>
      </div>

      {/* Prix barré + Remise */}
      <div className="rounded-2xl border border-border bg-card/50 p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">
          Prix barré et remise
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Prix barré USD (optionnel)
            </span>

            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={
                originalUsd == null ? '' : String(originalUsd)
              }
              onChange={(e) => {
                if (typeof setOriginalUsd === 'function') {
                  setOriginalUsd(e.target.value)
                }
              }}
              className={inputBase}
              placeholder="Ex : 59.99"
            />

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {computedOriginalUsd && !positiveNum(originalUsd) ? (
                <>
                  <span className="text-muted-foreground">
                    Suggéré depuis la remise :
                  </span>

                  <span className="font-medium text-foreground">
                    {formatUsd(computedOriginalUsd)}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={handleUseComputedOriginal}
                  >
                    Utiliser
                  </Button>
                </>
              ) : null}

              {displayOriginalUsd && rateOk && displayOriginalCdf ? (
                <span className="text-muted-foreground">
                  ≈ {formatCdf(displayOriginalCdf)}
                </span>
              ) : null}
            </div>

            {originalTooLow ? (
              <p className="text-xs text-red-500">
                Le prix barré est inférieur au prix actuel.
              </p>
            ) : null}
          </label>

          <Input
            variant="glass"
            label="Remise (%)"
            type="number"
            step="0.1"
            min="0"
            max="90"
            {...register?.('remise_percent', {
              valueAsNumber: true,
            })}
            placeholder="Ex : 15"
            leftIcon={<Percent size={14} />}
            error={errors?.remise_percent?.message}
          />
        </div>

        {savingsUsd > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="accent" size="sm">
              Économie : {formatUsd(savingsUsd)}
            </Badge>

            {savingsPercent > 0 ? (
              <Badge variant="gold" size="sm">
                -{savingsPercent}%
              </Badge>
            ) : null}

            {rateOk ? (
              <span className="text-muted-foreground">
                ≈ {formatCdf(toCdf(savingsUsd, rateNum))}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Suggestion IA */}
      {priceSuggestion ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-200">
          <Sparkles
            size={16}
            className="text-purple-500"
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <p className="font-medium">Suggestion IA</p>

            <p className="text-xs opacity-90">
              {priceSuggestion.reasoning || 'Analyse du marché'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="font-semibold">
                {suggestedUsd
                  ? formatUsd(suggestedUsd)
                  : suggestedCdf
                    ? formatCdf(suggestedCdf)
                    : '—'}
              </p>

              {suggestedUsd && suggestedCdf ? (
                <p className="text-[11px] opacity-80">
                  ≈ {formatCdf(suggestedCdf)}
                </p>
              ) : null}

              {!suggestedUsd && suggestedCdf && !rateOk ? (
                <p className="text-[11px] text-red-500">
                  Taux requis pour convertir en USD principal.
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              size="sm"
              variant="accent"
              onClick={handleApplySuggestion}
              disabled={!suggestedUsd}
            >
              Appliquer
            </Button>

            <button
              type="button"
              onClick={() => {
                if (typeof setPriceSuggestion === 'function') {
                  setPriceSuggestion(null)
                }
              }}
              className="text-muted-foreground transition hover:text-foreground"
              aria-label="Fermer la suggestion"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {productId ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handlePriceSuggestion}
          loading={priceSuggestionLoading}
          leftIcon={
            <Zap
              size={14}
              className="text-purple-500"
              aria-hidden="true"
            />
          }
        >
          Obtenir une suggestion de prix IA
        </Button>
      ) : null}

      {/* Stock + Limite */}
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          variant="glass"
          label="Stock *"
          type="number"
          {...register?.('stock', {
            valueAsNumber: true,
          })}
          error={errors?.stock?.message}
        />

        <Input
          variant="glass"
          label="Limite par client"
          type="number"
          {...register?.('limit_per_client', {
            valueAsNumber: true,
          })}
          placeholder="Optionnel"
          error={errors?.limit_per_client?.message}
        />
      </div>

      {/* Négociable / Vedette */}
      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            {...register?.('negociable')}
            className="rounded text-gold-500 focus:ring-gold-500"
          />
          <span>Produit négociable</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            {...register?.('featured')}
            className="rounded text-gold-500 focus:ring-gold-500"
          />
          <span>Produit en vedette</span>
        </label>
      </div>
    </motion.div>
  )
}