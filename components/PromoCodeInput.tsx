// components/PromoCodeInput.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { motion, AnimatePresence } from 'framer-motion'

import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'

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
  CheckCircle2,
  Clock,
  Gift,
  Info,
  Percent,
  RefreshCw,
  Sparkles,
  Tag,
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

interface PromoCodeLike {
  code: string
  type?: 'percent' | 'fixed'
  value?: number | null

  // Champs alignés USD
  value_usd?: number | null
  value_cdf?: number | null

  minTotal?: number | null
  minTotalUsd?: number | null
  minTotalCdf?: number | null

  maxDiscount?: number | null
  maxDiscountUsd?: number | null
  maxDiscountCdf?: number | null

  valid?: boolean
  remainingToMinUsd?: number | null
  message?: string | null
  description?: string | null
  reductionUsd?: number | null
}

interface AvailablePromoCode {
  code: string
  description?: string
}

interface PromoCodeInputProps {
  /** Taille de l’input et du bouton */
  size?: 'sm' | 'md' | 'lg'

  /** Placeholder personnalisé */
  placeholder?: string

  /** Classe additionnelle */
  className?: string

  /** Désactiver l’input */
  disabled?: boolean

  /** Afficher une liste de codes promo disponibles (suggestions) */
  availableCodes?: AvailablePromoCode[]

  /** Callback après application réussie */
  onApplied?: (code: string) => void

  /** Callback après retrait */
  onRemoved?: () => void

  /**
   * Devise d’interprétation des champs legacy sans suffixe USD/CDF.
   *
   * - 'USD' : force value/minTotal/maxDiscount legacy en USD
   * - 'CDF' : force value/minTotal/maxDiscount legacy en CDF
   * - 'auto' : heuristique prudente
   *
   * Par défaut : 'auto'
   */
  legacyPromoCurrency?: Currency | 'auto'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const RECENT_PROMOS_KEY = 'gercie-recent-promos'
const MAX_RECENT_CODES = 5

/**
 * Seuil heuristique pour distinguer un montant legacy CDF d’un montant USD.
 *
 * Exemple :
 * - 20  -> probablement USD
 * - 50000 -> probablement CDF
 */
const LEGACY_CDF_THRESHOLD = 5000

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

function formatMoney(value: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  RÉSOLUTION PRIX — RÈGLE ABSOLUE
 *
 *  - Si USD existe → USD = vérité, CDF = USD × taux.
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

/**
 * Résout un montant promo qui peut arriver :
 * - explicitement en USD ;
 * - explicitement en CDF ;
 * - ou via un champ legacy ambigu.
 *
 * Stratégie :
 * 1. USD explicite gagne toujours.
 * 2. CDF explicite est converti en USD si taux disponible.
 * 3. Legacy :
 *    - si >= 5000, probablement CDF ;
 *    - sinon, probablement USD.
 *
 * On peut forcer avec legacyPromoCurrency.
 */
function resolveAmountPair(input: {
  usd?: unknown
  cdf?: unknown
  legacy?: unknown
  rate: number | null
  legacyCurrency?: Currency | 'auto'
}): PricePair {
  const usdExplicit = firstPositive(input.usd)
  const cdfExplicit = firstPositive(input.cdf)
  const legacy = firstPositive(input.legacy)

  if (usdExplicit > 0) {
    return resolvePricePair(usdExplicit, 0, input.rate)
  }

  if (cdfExplicit > 0) {
    return resolvePricePair(0, cdfExplicit, input.rate)
  }

  if (legacy <= 0) {
    return { usd: 0, cdf: 0 }
  }

  if (input.legacyCurrency === 'USD') {
    return resolvePricePair(legacy, 0, input.rate)
  }

  if (input.legacyCurrency === 'CDF') {
    return resolvePricePair(0, legacy, input.rate)
  }

  const rateNum = Number(input.rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (legacy >= LEGACY_CDF_THRESHOLD) {
    return resolvePricePair(0, legacy, input.rate)
  }

  return resolvePricePair(legacy, 0, input.rate)
}

function formatPrimary(pair: PricePair): string {
  if (pair.usd > 0) return formatUsd(pair.usd)
  if (pair.cdf > 0) return formatCdf(pair.cdf)
  return '—'
}

function formatSecondary(pair: PricePair): string | null {
  if (pair.usd > 0 && pair.cdf > 0) {
    return `≈ ${formatCdf(pair.cdf)}`
  }

  if (pair.cdf > 0 && pair.usd > 0) {
    return `≈ ${formatUsd(pair.usd)}`
  }

  return null
}

function formatPairCompact(pair: PricePair): string {
  const primary = formatPrimary(pair)
  const secondary = formatSecondary(pair)

  return secondary ? `${primary} ${secondary}` : primary
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PROMO CODE INPUT                                               */
/* ═══════════════════════════════════════════════════════════════ */

export function PromoCodeInput({
  size = 'md',
  placeholder = 'Entrez votre code promo',
  className,
  disabled = false,
  availableCodes = [],
  onApplied,
  onRemoved,
  legacyPromoCurrency = 'auto',
}: PromoCodeInputProps) {
  const cart = useCart() as any

  const applyPromoCode = cart?.applyPromoCode
  const removePromoCode = cart?.removePromoCode
  const cartLoading = Boolean(cart?.loading)

  const activePromo = useMemo<PromoCodeLike | null>(
    () => (cart?.activePromo as PromoCodeLike | null) ?? null,
    [cart?.activePromo]
  )

  const summary = useMemo<any>(
    () => cart?.summary ?? {},
    [cart?.summary]
  )

  const toast = useToast() as any
  const addToast = toast?.addToast

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

  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [recentCodes, setRecentCodes] = useState<string[]>([])

  const appliedFromUrlRef = useRef(false)

  /* ---------------------------------------------------------- */
  /*  Codes récents                                              */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const stored = window.sessionStorage.getItem(RECENT_PROMOS_KEY)

      if (!stored) return

      const parsed = JSON.parse(stored)

      if (Array.isArray(parsed)) {
        setRecentCodes(
          parsed
            .filter((code) => typeof code === 'string' && code.trim())
            .map((code) => code.trim().toUpperCase())
            .slice(0, MAX_RECENT_CODES)
        )
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.sessionStorage.setItem(
        RECENT_PROMOS_KEY,
        JSON.stringify(recentCodes)
      )
    } catch {
      // ignore
    }
  }, [recentCodes])

  const saveRecentCode = useCallback((code: string) => {
    const normalized = code.trim().toUpperCase()

    if (!normalized) return

    setRecentCodes((previous) => {
      const next = [
        normalized,
        ...previous.filter((item) => item !== normalized),
      ].slice(0, MAX_RECENT_CODES)

      return next
    })
  }, [])

  /* ---------------------------------------------------------- */
  /*  Application promo                                          */
  /* ---------------------------------------------------------- */

  const handleApplyCode = useCallback(
    async (code: string) => {
      const normalized = code.trim().toUpperCase()

      if (!normalized) {
        setError('Saisissez un code promo.')
        return
      }

      if (typeof applyPromoCode !== 'function') {
        setError('Le code promo n’est pas disponible actuellement.')
        return
      }

      setLoading(true)
      setError('')

      try {
        const result = await applyPromoCode(normalized)

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

        if (!success) {
          const message =
            result?.error ||
            result?.promo?.message ||
            summary?.promoRequirementMessage ||
            'Code promo invalide ou expiré.'

          const remaining = firstPositive(
            result?.promo?.remainingToMinUsd,
            summary?.promoRemainingUsd
          )

          if (remaining > 0) {
            setError(
              `Ajoutez encore ${formatUsd(
                remaining
              )} pour utiliser ce code promo.`
            )
          } else {
            setError(message)
          }

          return
        }

        setInputValue('')
        saveRecentCode(normalized)
        onApplied?.(normalized)

        addToast?.({
          type: 'success',
          message: `Code « ${normalized} » appliqué.`,
        })
      } catch (err: any) {
        setError(
          err?.message || 'Erreur lors de la validation du code promo.'
        )
      } finally {
        setLoading(false)
      }
    },
    [
      addToast,
      applyPromoCode,
      onApplied,
      saveRecentCode,
      summary?.promoRemainingUsd,
      summary?.promoRequirementMessage,
    ]
  )

  /* ---------------------------------------------------------- */
  /*  Code promo depuis URL                                      */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (appliedFromUrlRef.current) return
    if (typeof window === 'undefined') return
    if (cartLoading) return

    const params = new URLSearchParams(window.location.search)
    const code = params.get('promo')?.trim().toUpperCase()

    if (!code) return

    appliedFromUrlRef.current = true

    if (activePromo?.code?.toUpperCase() === code) return

    void handleApplyCode(code)
  }, [activePromo?.code, cartLoading, handleApplyCode])

  /* ---------------------------------------------------------- */
  /*  Retrait promo                                              */
  /* ---------------------------------------------------------- */

  const handleRemoveCode = useCallback(async () => {
    try {
      if (typeof removePromoCode === 'function') {
        await removePromoCode()
      }

      onRemoved?.()

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
  }, [addToast, onRemoved, removePromoCode])

  /* ---------------------------------------------------------- */
  /*  Soumissions / suggestions                                  */
  /* ---------------------------------------------------------- */

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      void handleApplyCode(inputValue)
    },
    [handleApplyCode, inputValue]
  )

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value.toUpperCase())
      setError('')
    },
    []
  )

  const suggestionCodes = useMemo(() => {
    const map = new Map<string, string>()

    availableCodes.forEach((item) => {
      const code = String(item?.code || '').trim().toUpperCase()

      if (!code) return

      map.set(code, String(item?.description || '').trim())
    })

    recentCodes.forEach((code) => {
      const normalized = String(code || '').trim().toUpperCase()

      if (!normalized) return

      if (!map.has(normalized)) {
        map.set(normalized, 'Récemment utilisé')
      }
    })

    return Array.from(map.entries()).map(([code, description]) => ({
      code,
      description,
    }))
  }, [availableCodes, recentCodes])

  /* ---------------------------------------------------------- */
  /*  Résolution promo / montants                                */
  /* ---------------------------------------------------------- */

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
    null

  const reductionPair = useMemo<PricePair>(() => {
    if (!promoValid) return { usd: 0, cdf: 0 }

    const usdSource = firstPositive(
      summary?.promoReductionUsd,
      summary?.remiseTotalUSD,
      summary?.discountUSD,
      summary?.remise_total_usd,
      activePromo?.reductionUsd
    )

    const cdfSource = firstPositive(
      summary?.remiseTotal,
      summary?.discount,
      summary?.remise_total
    )

    return resolvePricePair(usdSource, cdfSource, rate)
  }, [
    activePromo?.reductionUsd,
    promoValid,
    rate,
    summary?.discount,
    summary?.discountUSD,
    summary?.promoReductionUsd,
    summary?.remiseTotal,
    summary?.remiseTotalUSD,
    summary?.remise_total,
    summary?.remise_total_usd,
  ])

  const missingPair = useMemo<PricePair>(() => {
    if (promoRemainingUsd <= 0) return { usd: 0, cdf: 0 }

    return resolvePricePair(promoRemainingUsd, 0, rate)
  }, [promoRemainingUsd, rate])

  const percentValue = useMemo(() => {
    if (activePromo?.type !== 'percent') return 0

    return firstPositive(activePromo.value)
  }, [activePromo?.type, activePromo?.value])

  const fixedValuePair = useMemo<PricePair>(() => {
    if (activePromo?.type !== 'fixed') return { usd: 0, cdf: 0 }

    return resolveAmountPair({
      usd: activePromo.value_usd,
      cdf: activePromo.value_cdf,
      legacy: activePromo.value,
      rate,
      legacyCurrency: legacyPromoCurrency,
    })
  }, [
    activePromo?.type,
    activePromo?.value,
    activePromo?.value_cdf,
    activePromo?.value_usd,
    legacyPromoCurrency,
    rate,
  ])

  const maxDiscountPair = useMemo<PricePair>(() => {
    return resolveAmountPair({
      usd: activePromo?.maxDiscountUsd,
      cdf: activePromo?.maxDiscountCdf,
      legacy: activePromo?.maxDiscount,
      rate,
      legacyCurrency: legacyPromoCurrency,
    })
  }, [
    activePromo?.maxDiscount,
    activePromo?.maxDiscountCdf,
    activePromo?.maxDiscountUsd,
    legacyPromoCurrency,
    rate,
  ])

  const minTotalPair = useMemo<PricePair>(() => {
    return resolveAmountPair({
      usd: activePromo?.minTotalUsd,
      cdf: activePromo?.minTotalCdf,
      legacy: activePromo?.minTotal,
      rate,
      legacyCurrency: legacyPromoCurrency,
    })
  }, [
    activePromo?.minTotal,
    activePromo?.minTotalCdf,
    activePromo?.minTotalUsd,
    legacyPromoCurrency,
    rate,
  ])

  const hasActivePromo = Boolean(activePromo?.code)

  const isActionDisabled = disabled || loading

  /* ---------------------------------------------------------- */
  /*  Rendu                                                      */
  /* ---------------------------------------------------------- */

  return (
    <div className={cn('space-y-2', className)}>
      {/* Code promo actif valide */}
      <AnimatePresence>
        {hasActivePromo && promoValid && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="rounded-full bg-green-100 p-1.5 dark:bg-green-800/40">
                <CheckCircle2
                  size={16}
                  className="text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-green-700 dark:text-green-300">
                  {activePromo?.code}
                </p>

                <p className="text-xs text-green-600 dark:text-green-400">
                  {activePromo?.type === 'percent'
                    ? `Réduction ${percentValue}%`
                    : `Réduction ${formatPairCompact(fixedValuePair)}`}

                  {(maxDiscountPair.usd > 0 || maxDiscountPair.cdf > 0) && (
                    <>
                      {' '}
                      • plafond{' '}
                      {formatPairCompact(maxDiscountPair)}
                    </>
                  )}

                  {(minTotalPair.usd > 0 || minTotalPair.cdf > 0) && (
                    <>
                      {' '}
                      • minimum{' '}
                      {formatPairCompact(minTotalPair)}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {(reductionPair.usd > 0 || reductionPair.cdf > 0) && (
                <Tooltip
                  content={
                    formatSecondary(reductionPair) ||
                    'Réduction appliquée'
                  }
                >
                  <Badge variant="accent" size="sm">
                    -{formatPrimary(reductionPair)}
                  </Badge>
                </Tooltip>
              )}

              <Tooltip content="Retirer le code promo">
                <button
                  type="button"
                  onClick={() => void handleRemoveCode()}
                  disabled={isActionDisabled}
                  className="rounded-lg p-1 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                  aria-label="Retirer le code promo"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Code promo reconnu mais non applicable / minimum non atteint */}
      <AnimatePresence>
        {hasActivePromo && !promoValid && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
          >
            <div className="flex items-start gap-2">
              <AlertCircle
                size={16}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />

              <div className="min-w-0">
                <p className="font-semibold">{activePromo?.code}</p>

                <p className="mt-1 text-xs">
                  {promoRequirementMessage ||
                    (promoRemainingUsd > 0
                      ? `Ajoutez encore ${formatPairCompact(
                          missingPair
                        )} pour utiliser ce code promo.`
                      : 'Ce code promo n’est pas applicable pour le moment.')}
                </p>

                {(minTotalPair.usd > 0 || minTotalPair.cdf > 0) && (
                  <p className="mt-1 text-[11px] opacity-90">
                    Minimum panier :{' '}
                    {formatPairCompact(minTotalPair)}
                  </p>
                )}

                {(maxDiscountPair.usd > 0 || maxDiscountPair.cdf > 0) && (
                  <p className="mt-1 text-[11px] opacity-90">
                    Réduction maximale :{' '}
                    {formatPairCompact(maxDiscountPair)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleRemoveCode()}
                disabled={isActionDisabled}
                leftIcon={<X size={14} aria-hidden="true" />}
              >
                Retirer
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Formulaire promo */}
      {!hasActivePromo && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={inputValue}
            onChange={handleInputChange}
            placeholder={placeholder}
            size={size}
            variant="glass"
            className="flex-1 font-mono uppercase tracking-wider"
            disabled={isActionDisabled}
            allowClear
            onClear={() => {
              setInputValue('')
              setError('')
            }}
            error={error}
            aria-label="Code promo"
          />

          <Button
            type="submit"
            variant="outline-gold"
            size={size}
            loading={loading}
            disabled={isActionDisabled || !inputValue.trim()}
            leftIcon={<Percent size={16} aria-hidden="true" />}
          >
            Appliquer
          </Button>
        </form>
      )}

      {/* Erreur locale */}
      {error && !hasActivePromo && (
        <p className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle size={12} aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Suggestions */}
      {suggestionCodes.length > 0 && !hasActivePromo && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowSuggestions((previous) => !previous)}
            className="flex items-center gap-1 text-xs text-gold-600 transition hover:text-gold-500"
            aria-expanded={showSuggestions}
          >
            <Sparkles size={12} aria-hidden="true" />
            {showSuggestions
              ? 'Masquer les suggestions'
              : 'Voir les codes disponibles'}
          </button>

          <AnimatePresence>
            {showSuggestions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 space-y-1 overflow-hidden"
              >
                {suggestionCodes.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setInputValue(item.code)
                      void handleApplyCode(item.code)
                    }}
                    disabled={isActionDisabled}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition hover:bg-gold-400/10 disabled:opacity-40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Gift
                        size={14}
                        className="shrink-0 text-gold-500"
                        aria-hidden="true"
                      />

                      <span className="truncate font-mono font-semibold">
                        {item.code}
                      </span>
                    </div>

                    {item.description && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Indicateur taux en chargement */}
      {rateLoading && !rate && hasActivePromo && (
        <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <RefreshCw
            size={12}
            className="animate-spin"
            aria-hidden="true"
          />
          Conversion CDF en cours de chargement…
        </p>
      )}
    </div>
  )
}