// hooks/useExchangeRate.ts
'use client'

import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ExchangeRateCurrency = 'USD' | 'EUR' | 'GBP'

export interface ExchangeRatePoint {
  currency: ExchangeRateCurrency | string
  rate: number
  updated_at: string
  effective_at: string
  source: string
  note?: string | null
  updated_by?: string | null
}

export interface UseExchangeRateOptions {
  currency?: ExchangeRateCurrency | string
}

export interface UseExchangeRateResult {
  /**
   * Taux USD -> CDF.
   * Exemple : 2850 signifie 1 USD = 2850 CDF.
   */
  rate: number | null

  /**
   * Chargement initial.
   */
  loading: boolean

  /**
   * Requête en cours de rafraîchissement, même si une valeur est déjà en cache.
   */
  refreshing: boolean

  /**
   * Message d'erreur lisible, ou null.
   */
  error: string | null

  /**
   * Point complet du taux, si disponible.
   */
  data: ExchangeRatePoint | null

  /**
   * Date de dernière mise à jour du taux.
   */
  updatedAt: string | null

  /**
   * Source du taux : exchange_rates, settings, rpc, admin, etc.
   */
  source: string | null

  /**
   * Force un rechargement manuel.
   */
  refetch: () => void

  /**
   * Conversion compatible avec l'ancien hook.
   *
   * Attention : cette fonction historique part du principe que la valeur
   * d'entrée est en CDF.
   *
   * convert(28500, 'USD') => 10 USD si rate = 2850
   * convert(28500, 'CDF') => 28500 CDF
   */
  convert: (value: number, targetCurrency?: 'CDF' | 'USD') => number

  /**
   * Conversion claire : CDF -> USD.
   */
  toUsd: (cdf: number) => number

  /**
   * Conversion claire : USD -> CDF.
   */
  toCdf: (usd: number) => number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const ALLOWED_CURRENCIES: ExchangeRateCurrency[] = ['USD', 'EUR', 'GBP']

const DEFAULT_CURRENCY: ExchangeRateCurrency = 'USD'

const MIN_RATE = 1
const MAX_RATE = 100_000

const STALE_TIME_MS = 60_000
const GC_TIME_MS = 30 * 60_000

const EXCHANGE_RATE_EVENT = 'gercie:exchange-rate-updated'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS NUMÉRIQUES                                             */
/* ═══════════════════════════════════════════════════════════════ */

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  return Math.round(value + Number.EPSILON)
}

function parseNumber(value: any): number | null {
  if (value == null) return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const cleaned = value
      .replace(/\s/g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '')

    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }

  return null
}

function normalizeCurrency(value: any): ExchangeRateCurrency {
  const upper = String(value || DEFAULT_CURRENCY).toUpperCase().trim()

  if ((ALLOWED_CURRENCIES as readonly string[]).includes(upper)) {
    return upper as ExchangeRateCurrency
  }

  // Si le frontend demande CDF, on revient à la référence USD -> CDF.
  if (upper === 'CDF') return 'USD'

  return DEFAULT_CURRENCY
}

function extractRateValue(input: any): number | null {
  if (input == null) return null

  const direct = parseNumber(input)
  if (direct != null) {
    if (direct < MIN_RATE || direct > MAX_RATE) return null
    return direct
  }

  if (typeof input === 'object') {
    const candidates = [
      input.rate,
      input.value,
      input.taux,
      input.taux_change,
      input.montant,
      input.amount,
      input.exchange_rate,
      input.new_rate,
      input.current?.rate,
      input.current?.value,
      input.data?.rate,
      input.data?.value,
      input.result?.rate,
      input.result?.value,
    ]

    for (const candidate of candidates) {
      const parsed = extractRateValue(candidate)
      if (parsed != null) return parsed
    }
  }

  return null
}

function firstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function normalizeExchangeRatePoint(
  input: any,
  fallbackCurrency: ExchangeRateCurrency = DEFAULT_CURRENCY
): ExchangeRatePoint | null {
  const rate = extractRateValue(input)

  if (rate == null) return null

  const obj =
    input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : {}

  const current =
    obj.current && typeof obj.current === 'object'
      ? obj.current
      : {}

  const data =
    obj.data && typeof obj.data === 'object'
      ? obj.data
      : {}

  const currency = normalizeCurrency(
    obj.currency ??
      obj.devise ??
      current.currency ??
      data.currency ??
      fallbackCurrency
  )

  const updatedAt = firstString(
    obj.updated_at,
    obj.updatedAt,
    current.updated_at,
    current.updatedAt,
    data.updated_at,
    data.updatedAt,
    obj.effective_at,
    obj.effective_from,
    obj.date,
    obj.created_at,
    obj.createdAt
  )

  const effectiveAt = firstString(
    obj.effective_at,
    obj.effective_from,
    current.effective_at,
    current.effective_from,
    data.effective_at,
    data.effective_from,
    updatedAt
  )

  const now = new Date().toISOString()

  return {
    currency,
    rate,
    updated_at: updatedAt || now,
    effective_at: effectiveAt || updatedAt || now,
    source: firstString(
      obj.source,
      obj.origin,
      current.source,
      data.source,
      'exchange-rate'
    )!,
    note: firstString(
      obj.note,
      obj.reason,
      obj.commentaire,
      current.note,
      data.note
    ),
    updated_by: firstString(
      obj.updated_by,
      obj.user_email,
      current.updated_by,
      data.updated_by
    ),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH                                                          */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchPrimaryExchangeRate(
  currency: ExchangeRateCurrency
): Promise<ExchangeRatePoint> {
  const res = await fetch(
    `/api/exchange-rate?currency=${encodeURIComponent(currency)}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    }
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body?.error ||
        `Impossible de charger le taux de change (${res.status}).`
    )
  }

  const json = await res.json().catch(() => null)
  const point = normalizeExchangeRatePoint(json, currency)

  if (!point) {
    throw new Error('Réponse de taux de change invalide.')
  }

  return point
}

function settingsKeys(currency: ExchangeRateCurrency): string[] {
  if (currency === 'USD') {
    return [
      'exchange_rate',
      'exchange_rate_usd',
      'usd_cdf_rate',
      'taux_change',
    ]
  }

  return [
    `exchange_rate_${currency.toLowerCase()}`,
    `${currency.toLowerCase()}_cdf_rate`,
  ]
}

async function fetchSettingsExchangeRate(
  currency: ExchangeRateCurrency
): Promise<ExchangeRatePoint | null> {
  const keys = settingsKeys(currency)

  for (const key of keys) {
    try {
      const res = await fetch(
        `/api/settings?key=${encodeURIComponent(key)}`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        }
      )

      if (!res.ok) continue

      const json = await res.json().catch(() => null)
      const point = normalizeExchangeRatePoint(
        json?.value ?? json,
        currency
      )

      if (!point) continue

      return {
        ...point,
        currency,
        source: 'settings',
      }
    } catch {
      // silencieux : on tente la clé suivante
    }
  }

  return null
}

async function fetchExchangeRatePoint(
  currency: ExchangeRateCurrency
): Promise<ExchangeRatePoint> {
  let primaryError: any = null

  try {
    return await fetchPrimaryExchangeRate(currency)
  } catch (err: any) {
    primaryError = err
  }

  const fallback = await fetchSettingsExchangeRate(currency)

  if (fallback) {
    return fallback
  }

  throw new Error(
    primaryError?.message ||
      'Aucun taux de change disponible.'
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOK                                                           */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Hook global pour obtenir le taux de change USD/CDF.
 *
 * Architecture :
 * - USD = devise principale
 * - CDF = conversion calculée avec ce taux
 *
 * Exemple :
 * rate = 2850
 * 1 USD = 2850 CDF
 *
 * Ce hook :
 * - utilise React Query ;
 * - écoute l'event admin "gercie:exchange-rate-updated" ;
 * - invalide les caches panier/commande si nécessaire ;
 * - tolère les anciens formats de réponse ;
 * - fallback sur /api/settings si /api/exchange-rate échoue.
 */
export function useExchangeRate(
  options: UseExchangeRateOptions | ExchangeRateCurrency = {}
): UseExchangeRateResult {
  const requestedCurrency =
    typeof options === 'string'
      ? options
      : options.currency

  const currency = normalizeCurrency(requestedCurrency)

  const queryClient = useQueryClient()

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<ExchangeRatePoint>({
    queryKey: ['exchange-rate', currency],
    queryFn: () => fetchExchangeRatePoint(currency),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
    retryDelay: (attemptIndex) =>
      Math.min(1000 * 2 ** attemptIndex, 10_000),
  })

  /*
   * Écoute l'événement dispatché par l'admin exchange-rate.
   *
   * Cela permet une propagation quasi immédiate :
   * admin change le taux
   * -> event global
   * -> cache React Query mis à jour
   * -> panier / commande recalculent sans rechargement manuel.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<any>
      const detail = customEvent.detail

      if (!detail) return

      const eventCurrency = normalizeCurrency(
        detail.currency || currency
      )

      if (eventCurrency !== currency) return

      const point = normalizeExchangeRatePoint(
        {
          currency: eventCurrency,
          rate: detail.rate ?? detail.new_rate ?? detail.value,
          updated_at: detail.updated_at,
          effective_at: detail.updated_at,
          source: detail.source || 'admin',
          note: detail.reason || detail.note || null,
          updated_by: detail.updated_by || detail.user_email || null,
        },
        eventCurrency
      )

      if (!point) return

      /*
       * Mise à jour optimiste du cache.
       */
      queryClient.setQueryData(['exchange-rate', eventCurrency], point)

      /*
       * Invalidations de sécurité :
       * - ancienne clé sans currency ;
       * - clés admin ;
       * - caches pouvant contenir des conversions CDF obsolètes.
       */
      queryClient.invalidateQueries({ queryKey: ['exchange-rate'] })
      queryClient.invalidateQueries({ queryKey: ['exchange-rate', eventCurrency] })

      queryClient.invalidateQueries({ queryKey: ['useExchangeRate'] })
      queryClient.invalidateQueries({ queryKey: ['use-exchange-rate'] })
      queryClient.invalidateQueries({ queryKey: ['current-exchange-rate'] })
      queryClient.invalidateQueries({ queryKey: ['global-exchange-rate'] })

      queryClient.invalidateQueries({ queryKey: ['admin-exchange-rate'] })

      queryClient.invalidateQueries({ queryKey: ['cart-raw'] })
      queryClient.invalidateQueries({ queryKey: ['produits-batch-cart'] })
      queryClient.invalidateQueries({ queryKey: ['produits'] })
      queryClient.invalidateQueries({ queryKey: ['product-detail'] })
    }

    window.addEventListener(EXCHANGE_RATE_EVENT, handler)

    return () => {
      window.removeEventListener(EXCHANGE_RATE_EVENT, handler)
    }
  }, [currency, queryClient])

  const rate = data?.rate ?? null

  const convert = useCallback(
    (value: number, targetCurrency: 'CDF' | 'USD' = 'USD'): number => {
      const n = parseNumber(value)

      if (n == null) return 0

      if (!rate || rate <= 0) {
        return targetCurrency === 'USD' ? n : n
      }

      /*
       * Compatibilité historique :
       * l'ancien hook considérait la valeur d'entrée comme étant en CDF.
       */
      if (targetCurrency === 'USD') {
        return roundUsd(n / rate)
      }

      return roundCdf(n)
    },
    [rate]
  )

  const toUsd = useCallback(
    (cdf: number): number => {
      const n = parseNumber(cdf)

      if (n == null) return 0

      if (!rate || rate <= 0) return 0

      return roundUsd(n / rate)
    },
    [rate]
  )

  const toCdf = useCallback(
    (usd: number): number => {
      const n = parseNumber(usd)

      if (n == null) return 0

      if (!rate || rate <= 0) return 0

      return roundCdf(n * rate)
    },
    [rate]
  )

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : null

  return {
    rate,
    loading: isLoading,
    refreshing: isFetching,
    error: errorMessage,
    data: data ?? null,
    updatedAt: data?.updated_at ?? null,
    source: data?.source ?? null,
    refetch,
    convert,
    toUsd,
    toCdf,
  }
}

export default useExchangeRate