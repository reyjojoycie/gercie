// lib/currency.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type Currency = 'USD' | 'CDF' | 'EUR' | 'GBP'

export interface Devise {
  id?: string
  code: string
  symbole: string
  /**
   * Legacy : taux par rapport à la devise de base CDF.
   *
   * Pour USD, cela signifie normalement :
   * 1 USD = X CDF
   *
   * Exemple :
   * taux_conversion USD = 2850
   */
  taux_conversion: number
  actif?: boolean
  [key: string]: any
}

export interface MoneyPair {
  usd: number
  cdf: number
  primaryCurrency: Currency
  secondaryCurrency: Currency
  primaryAmount: number
  secondaryAmount: number
  displayPrimary: string
  displaySecondary: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

export const PRIMARY_CURRENCY: Currency = 'USD'
export const SECONDARY_CURRENCY: Currency = 'CDF'

export const SUPPORTED_CURRENCIES: Currency[] = [
  'USD',
  'CDF',
  'EUR',
  'GBP',
]

export const DEFAULT_LOCALE = 'fr-FR'

const CURRENCY_META: Record<
  Currency,
  {
    symbol: string
    label: string
    decimals: number
    intlCode: string
  }
> = {
  USD: {
    symbol: '$',
    label: 'US Dollar',
    decimals: 2,
    intlCode: 'USD',
  },
  CDF: {
    symbol: 'FC',
    label: 'Franc congolais',
    decimals: 0,
    intlCode: 'CDF',
  },
  EUR: {
    symbol: '€',
    label: 'Euro',
    decimals: 2,
    intlCode: 'EUR',
  },
  GBP: {
    symbol: '£',
    label: 'British Pound',
    decimals: 2,
    intlCode: 'GBP',
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as string[]).includes(value)
}

export function normalizeCurrency(value: unknown): Currency {
  const raw = String(value ?? '')
    .toUpperCase()
    .trim()

  if (isSupportedCurrency(raw)) return raw

  if (raw === 'FC' || raw === 'FRW' || raw === 'CDF') return 'CDF'
  if (raw === '$' || raw === 'US$' || raw === 'USD') return 'USD'
  if (raw === '€' || raw === 'EUR') return 'EUR'
  if (raw === '£' || raw === 'GBP') return 'GBP'

  return PRIMARY_CURRENCY
}

export function getCurrencySymbol(currency: unknown): string {
  const code = normalizeCurrency(currency)
  return CURRENCY_META[code]?.symbol || code
}

export function getCurrencyLabel(currency: unknown): string {
  const code = normalizeCurrency(currency)
  return CURRENCY_META[code]?.label || code
}

export function getCurrencyDecimals(currency: unknown): number {
  const code = normalizeCurrency(currency)
  return CURRENCY_META[code]?.decimals ?? 2
}

export function isPrimaryCurrency(currency: unknown): boolean {
  return normalizeCurrency(currency) === PRIMARY_CURRENCY
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBERS / PARSING                                              */
/* ═══════════════════════════════════════════════════════════════ */

export function parseMoney(value: any): number | null {
  if (value == null) return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') return null

  const raw = value.trim()
  if (!raw) return null

  const cleaned = raw
    .replace(/\s|\u00A0/g, '')
    .replace(/FC|CDF|FRW|Francs?/gi, '')
    .replace(/\$|USD|US\$/gi, '')
    .replace(/€/g, '')
    .replace(/£/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '')

  const n = Number(cleaned)

  return Number.isFinite(n) ? n : null
}

export function toFiniteNumber(value: any, fallback = 0): number {
  const n = parseMoney(value)
  return n != null && Number.isFinite(n) ? n : fallback
}

export function positiveNumber(value: any): number {
  const n = toFiniteNumber(value, 0)
  return n > 0 ? n : 0
}

export function nullablePositiveNumber(value: any): number | null {
  const n = parseMoney(value)
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  return n
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ROUNDING                                                       */
/* ═══════════════════════════════════════════════════════════════ */

export function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function roundCdf(value: number): number {
  return Math.round(value + Number.EPSILON)
}

export function roundMoney(value: number, currency: Currency = PRIMARY_CURRENCY): number {
  const code = normalizeCurrency(currency)

  if (code === 'CDF') return roundCdf(value)

  return roundUsd(value)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FORMATAGE                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function formatUsd(
  value: number | null | undefined,
  locale: string = DEFAULT_LOCALE
): string {
  const n = parseMoney(value)

  if (n == null || !Number.isFinite(n) || n <= 0) return '—'

  return `$${n.toFixed(2)}`
}

export function formatCdf(
  value: number | null | undefined,
  locale: string = DEFAULT_LOCALE
): string {
  const n = parseMoney(value)

  if (n == null || !Number.isFinite(n) || n <= 0) return '—'

  try {
    return `${Math.round(n).toLocaleString(locale)} FC`
  } catch {
    return `${Math.round(n)} FC`
  }
}

function formatWithIntl(
  value: number,
  currency: Currency,
  locale: string = DEFAULT_LOCALE
): string {
  const meta = CURRENCY_META[currency]

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: meta.intlCode,
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    }).format(value)
  } catch {
    return `${value.toFixed(meta.decimals)} ${meta.symbol}`
  }
}

export function formatMoney(
  value: number | null | undefined,
  currency: Currency = PRIMARY_CURRENCY,
  locale: string = DEFAULT_LOCALE
): string {
  const code = normalizeCurrency(currency)
  const n = parseMoney(value)

  if (n == null || !Number.isFinite(n) || n <= 0) return '—'

  if (code === 'USD') return formatUsd(n, locale)
  if (code === 'CDF') return formatCdf(n, locale)

  return formatWithIntl(n, code, locale)
}

export function formatMoneySigned(
  value: number | null | undefined,
  currency: Currency = PRIMARY_CURRENCY,
  locale: string = DEFAULT_LOCALE
): string {
  const n = parseMoney(value)

  if (n == null || !Number.isFinite(n)) return '—'

  if (n === 0) return '—'

  const formatted = formatMoney(Math.abs(n), currency, locale)

  return n < 0 ? `-${formatted}` : formatted
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONVERSION AVEC TAUX USD → CDF                                 */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Taux attendu :
 *
 * rate = nombre de CDF pour 1 USD.
 *
 * Exemple :
 * rate = 2850
 * 1 USD = 2850 CDF
 */
export function toUsd(
  cdf: number | null | undefined,
  rate: number | null | undefined
): number {
  const amount = parseMoney(cdf)
  const r = parseMoney(rate)

  if (amount == null || !Number.isFinite(amount)) return 0
  if (r == null || !Number.isFinite(r) || r <= 0) return 0

  return roundUsd(amount / r)
}

export function toCdf(
  usd: number | null | undefined,
  rate: number | null | undefined
): number {
  const amount = parseMoney(usd)
  const r = parseMoney(rate)

  if (amount == null || !Number.isFinite(amount)) return 0
  if (r == null || !Number.isFinite(r) || r <= 0) return 0

  return roundCdf(amount * r)
}

export function convertWithRate(
  amount: number | null | undefined,
  from: Currency | string,
  to: Currency | string,
  rate: number | null | undefined
): number {
  const n = parseMoney(amount)

  if (n == null || !Number.isFinite(n)) return 0

  const fromCode = normalizeCurrency(from)
  const toCode = normalizeCurrency(to)

  if (fromCode === toCode) return roundMoney(n, fromCode)

  if (fromCode === 'USD' && toCode === 'CDF') return toCdf(n, rate)
  if (fromCode === 'CDF' && toCode === 'USD') return toUsd(n, rate)

  /*
   * Pour EUR / GBP, il faudrait des taux séparés.
   * Ici on ne devine pas : on retourne la valeur brute arrondie.
   */
  return roundMoney(n, toCode)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MONEY PAIR                                                     */
/* ═══════════════════════════════════════════════════════════════ */

export function makeMoneyPair(
  usd: number | null | undefined,
  cdf: number | null | undefined,
  preferred: Currency | string = PRIMARY_CURRENCY,
  rate: number | null | undefined = null
): MoneyPair {
  let usdValue = parseMoney(usd) ?? 0
  let cdfValue = parseMoney(cdf) ?? 0

  const r = parseMoney(rate)

  if (usdValue <= 0 && cdfValue > 0 && r != null && r > 0) {
    usdValue = toUsd(cdfValue, r)
  }

  if (cdfValue <= 0 && usdValue > 0 && r != null && r > 0) {
    cdfValue = toCdf(usdValue, r)
  }

  const preferredCode = normalizeCurrency(preferred)

  let primaryCurrency: Currency = PRIMARY_CURRENCY

  if (preferredCode === 'CDF' && cdfValue > 0) {
    primaryCurrency = 'CDF'
  } else if (usdValue <= 0 && cdfValue > 0) {
    primaryCurrency = 'CDF'
  }

  const secondaryCurrency: Currency =
    primaryCurrency === 'USD' ? 'CDF' : 'USD'

  const primaryAmount =
    primaryCurrency === 'USD' ? usdValue : cdfValue

  const secondaryAmount =
    secondaryCurrency === 'USD' ? usdValue : cdfValue

  const displayPrimary = formatMoney(primaryAmount, primaryCurrency)

  const displaySecondary =
    secondaryAmount > 0 && secondaryAmount !== primaryAmount
      ? formatMoney(secondaryAmount, secondaryCurrency)
      : null

  return {
    usd: usdValue,
    cdf: cdfValue,
    primaryCurrency,
    secondaryCurrency,
    primaryAmount,
    secondaryAmount,
    displayPrimary,
    displaySecondary,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LEGACY : TABLE DEVISES                                         */
/* ═══════════════════════════════════════════════════════════════ */

let cachedDevises: Devise[] | null = null
let cacheExpiry = 0

export function clearCurrencyCache(): void {
  cachedDevises = null
  cacheExpiry = 0
}

/**
 * Récupère les devises depuis la table `devises`.
 *
 * Cette fonction est conservée pour compatibilité.
 * Pour le nouveau système, préfère utiliser :
 * - useExchangeRate() côté client
 * - getUsdCdfRate() côté serveur
 */
export async function getDevises(
  supabase: SupabaseClient | any,
  onlyActive: boolean = true
): Promise<Devise[]> {
  if (!supabase || typeof supabase.from !== 'function') return []

  const now = Date.now()

  if (cachedDevises && now < cacheExpiry) {
    return onlyActive
      ? cachedDevises.filter((d) => d.actif !== false)
      : cachedDevises
  }

  try {
    let query = supabase.from('devises').select('*')

    if (onlyActive) {
      query = query.eq('actif', true)
    }

    const { data, error } = await query.order('code')

    if (error) {
      console.error('Erreur chargement devises:', error.message)
      return []
    }

    const rows = Array.isArray(data) ? (data as Devise[]) : []

    cachedDevises = rows
    cacheExpiry = now + 60_000

    return rows
  } catch (err: any) {
    console.error('Erreur chargement devises:', err?.message || err)
    return []
  }
}

export async function getDeviseByCode(
  supabase: SupabaseClient | any,
  code: string
): Promise<Devise | null> {
  const devises = await getDevises(supabase, false)
  const upper = String(code || '').toUpperCase().trim()

  return devises.find((d) => String(d.code || '').toUpperCase() === upper) || null
}

/**
 * Conversion legacy via la table devises.
 *
 * La devise de base est supposée être CDF.
 *
 * Exemple :
 * convertCurrency(100, 'CDF', 'USD', devises)
 * => 100 / taux_conversion USD
 */
export function convertCurrency(
  amount: number,
  fromCode: string,
  toCode: string,
  devises: Devise[]
): number {
  const fromUpper = String(fromCode || '').toUpperCase().trim()
  const toUpper = String(toCode || '').toUpperCase().trim()

  const from = devises.find(
    (d) => String(d.code || '').toUpperCase() === fromUpper
  )

  const to = devises.find(
    (d) => String(d.code || '').toUpperCase() === toUpper
  )

  if (!from || !to) {
    throw new Error(`Devise inconnue : ${fromCode} ou ${toCode}`)
  }

  const fromRate = positiveNumber(from.taux_conversion)
  const toRate = positiveNumber(to.taux_conversion)

  if (!fromRate || !toRate) {
    throw new Error(`Taux de conversion invalide pour ${fromCode} ou ${toCode}`)
  }

  const amountInBase = amount * fromRate
  return amountInBase / toRate
}

export function formatCurrency(
  amount: number,
  code: string,
  devises: Devise[],
  locale: string = DEFAULT_LOCALE
): string {
  const upper = String(code || '').toUpperCase().trim()
  const devise = devises.find(
    (d) => String(d.code || '').toUpperCase() === upper
  )

  if (!devise) {
    return formatMoney(amount, normalizeCurrency(code), locale)
  }

  const supported = normalizeCurrency(code)

  if (isSupportedCurrency(supported)) {
    return formatMoney(amount, supported, locale)
  }

  const n = parseMoney(amount)

  if (n == null || !Number.isFinite(n) || n <= 0) return '—'

  const symbol = devise.symbole || code
  const decimals = String(code || '').toUpperCase() === 'CDF' ? 0 : 2

  return `${n.toFixed(decimals)} ${symbol}`
}

export function formatCurrencyShort(
  amount: number,
  code: string,
  devises: Devise[]
): string {
  const upper = String(code || '').toUpperCase().trim()
  const devise = devises.find(
    (d) => String(d.code || '').toUpperCase() === upper
  )

  const supported = normalizeCurrency(code)

  if (isSupportedCurrency(supported)) {
    const n = parseMoney(amount)

    if (n == null || !Number.isFinite(n) || n <= 0) return '—'

    if (supported === 'USD') return `$${n.toFixed(2)}`
    if (supported === 'CDF') return `${Math.round(n)} FC`

    return `${n.toFixed(getCurrencyDecimals(supported))} ${getCurrencySymbol(supported)}`
  }

  const n = parseMoney(amount)

  if (n == null || !Number.isFinite(n) || n <= 0) return '—'

  const symbol = devise?.symbole || code
  const decimals = upper === 'CDF' ? 0 : 2

  return `${n.toFixed(decimals)} ${symbol}`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOK CLIENT LEGACY                                             */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Hook legacy pour charger la table devises.
 *
 * Pour le taux USD/CDF principal, préfère :
 * const { rate } = useExchangeRate()
 */
export function useCurrencies(onlyActive: boolean = true) {
  return useQuery<Devise[]>({
    queryKey: ['currencies', onlyActive],
    queryFn: async () => {
      const res = await fetch('/api/devises', {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error('Erreur chargement devises')
      }

      const data = await res.json()

      return Array.isArray(data) ? data : []
    },
    staleTime: 60_000,
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SERVEUR : RECUPERER LE TAUX USD → CDF                           */
/* ═══════════════════════════════════════════════════════════════ */

const RATE_SELECT_CANDIDATES = [
  'currency, rate, source, note, updated_by, updated_at, effective_at, effective_from, created_at',
  'currency, rate, source, note, updated_at, effective_at, effective_from, created_at',
  'currency, rate, source, note, updated_at, effective_at, created_at',
  'currency, rate, source, note, updated_at, effective_from, created_at',
  'currency, rate, source, note, updated_at, created_at',
  'currency, rate, source, updated_at, created_at',
  'currency, rate, created_at',
  '*',
]

const RATE_ORDER_CANDIDATES = [
  'effective_at',
  'effective_from',
  'updated_at',
  'created_at',
]

function settingsKeys(currency: Currency): string[] {
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

/**
 * Récupère le taux USD → CDF côté serveur.
 *
 * Ordre :
 * 1. RPC get_current_exchange_rate si disponible
 * 2. table exchange_rates
 * 3. table settings
 *
 * Retourne :
 * number de CDF pour 1 USD.
 *
 * Exemple :
 * 2850 signifie 1 USD = 2850 CDF.
 *
 * ⚠️ Le client Supabase doit être fourni explicitement.
 * Ce fichier est partagé client/serveur : il ne doit pas
 * importer supabaseServer (qui dépend de next/headers).
 */
export async function getUsdCdfRate(options: {
  supabase?: any
  currency?: Currency | string
} = {}): Promise<number | null> {
  const currency = normalizeCurrency(options.currency ?? 'USD')

  const supabase = options.supabase

  // ⚠️ FIX : ne pas importer dynamiquement supabaseServer ici.
  // Ce fichier est partagé client/serveur. Les appelants côté serveur
  // doivent passer un client supabase explicitement.
  if (!supabase || typeof supabase.from !== 'function') {
    return null
  }

  /*
   * 1. RPC recommandée.
   */
  try {
    if (typeof supabase.rpc === 'function') {
      const { data, error } = await supabase.rpc(
        'get_current_exchange_rate',
        {
          p_currency: currency,
        }
      )

      if (!error && data) {
        const rate = parseMoney(
          data?.rate ??
            data?.value ??
            data?.current?.rate ??
            data?.data?.rate ??
            data
        )

        if (rate != null && rate > 0) {
          return rate
        }
      }
    }
  } catch {
    // silencieux
  }

  const now = Date.now()

  /*
   * 2. Table exchange_rates.
   */
  for (const select of RATE_SELECT_CANDIDATES) {
    for (const order of RATE_ORDER_CANDIDATES) {
      try {
        const { data, error } = await supabase
          .from('exchange_rates')
          .select(select)
          .eq('currency', currency)
          .order(order, { ascending: false })
          .limit(30)

        if (error) continue

        const rows = Array.isArray(data) ? data : []

        for (const row of rows) {
          const effectiveRaw =
            row?.effective_at ||
            row?.effective_from ||
            row?.updated_at ||
            row?.created_at

          const effectiveTime = effectiveRaw
            ? new Date(effectiveRaw).getTime()
            : now

          const isEffective =
            !Number.isFinite(effectiveTime) ||
            effectiveTime <= now + 60_000

          if (!isEffective) continue

          const rate = parseMoney(row?.rate ?? row?.value)

          if (rate != null && rate > 0) {
            return rate
          }
        }
      } catch {
        // silencieux
      }
    }
  }

  /*
   * 3. Fallback settings.
   */
  const keys = settingsKeys(currency)

  for (const key of keys) {
    const selects = ['value, updated_at', 'value']

    for (const select of selects) {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select(select)
          .eq('key', key)
          .maybeSingle()

        if (error) continue

        const rate = parseMoney(data?.value)

        if (rate != null && rate > 0) {
          return rate
        }
      } catch {
        // silencieux
      }
    }
  }

  return null
}