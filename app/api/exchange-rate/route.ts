// app/api/exchange-rate/route.ts
import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const ALLOWED_CURRENCIES = ['USD', 'EUR', 'GBP'] as const
type Currency = (typeof ALLOWED_CURRENCIES)[number]

const DEFAULT_CURRENCY: Currency = 'USD'

const MIN_RATE = 1
const MAX_RATE = 100_000

const MAX_ROWS_TO_SCAN = 50

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRAUX                                               */
/* ═══════════════════════════════════════════════════════════════ */

function isThenable(value: any): value is Promise<any> {
  return value != null && typeof value.then === 'function'
}

async function getSupabase(): Promise<any | null> {
  // Priorité : client service si disponible, pour bypass RLS en lecture publique du taux.
  // Fallback : client standard.
  const attempts = [
    () => (createClient as any)(true),
    () => (createClient as any)(),
  ]

  for (const attempt of attempts) {
    try {
      const raw = attempt()
      const client = isThenable(raw) ? await raw : raw

      if (client && typeof client.from === 'function') {
        return client
      }
    } catch (err: any) {
      log.warn?.('exchange-rate: impossible de créer un client Supabase', err?.message || err)
    }
  }

  return null
}

function normalizeCurrency(value: unknown): Currency {
  const upper = String(value || DEFAULT_CURRENCY).toUpperCase().trim()

  if ((ALLOWED_CURRENCIES as readonly string[]).includes(upper)) {
    return upper as Currency
  }

  // Si le frontend demande CDF, on revient à la référence USD -> CDF.
  if (upper === 'CDF') return 'USD'

  return DEFAULT_CURRENCY
}

function extractRateValue(input: any): number | null {
  if (input == null) return null

  if (typeof input === 'number' || typeof input === 'string') {
    const n = Number(String(input).replace(',', '.'))
    if (!Number.isFinite(n)) return null
    if (n < MIN_RATE || n > MAX_RATE) return null
    return n
  }

  if (typeof input === 'object') {
    const candidate =
      input.rate ??
      input.value ??
      input.taux ??
      input.montant ??
      input.amount ??
      input.exchange_rate ??
      input.new_rate

    return extractRateValue(candidate)
  }

  return null
}

function nowIso(): string {
  return new Date().toISOString()
}

function isMissingTableError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(
    error?.message || error?.details || error?.hint || ''
  ).toLowerCase()

  return (
    code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('schema')
  )
}

function isMissingColumnError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || error?.details || error?.hint || '')

  return (
    code === '42703' ||
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message) ||
    /is not a column/i.test(message) ||
    /schema cache/i.test(message)
  )
}

function bestEffectiveDate(row: any): string | null {
  return (
    row?.effective_at ||
    row?.effective_from ||
    row?.updated_at ||
    row?.created_at ||
    row?.date ||
    null
  )
}

function bestUpdatedAt(row: any): string | null {
  return (
    row?.updated_at ||
    row?.effective_at ||
    row?.effective_from ||
    row?.created_at ||
    row?.date ||
    null
  )
}

function isEffectiveNowOrPast(row: any): boolean {
  const eff = bestEffectiveDate(row)

  if (!eff) return true

  const time = new Date(eff).getTime()

  if (!Number.isFinite(time)) return true

  // Petite tolérance de 60 secondes pour les fuseaux / arrondis.
  return time <= Date.now() + 60_000
}

function normalizeRatePoint(row: any, currency: Currency) {
  const rate = extractRateValue(row?.rate ?? row?.value ?? row)
  if (!rate) return null

  const effectiveAt = bestEffectiveDate(row) || nowIso()
  const updatedAt = bestUpdatedAt(row) || effectiveAt

  return {
    currency,
    rate,
    updated_at: updatedAt,
    effective_at: effectiveAt,
    source: row?.source || 'exchange_rates',
    note: row?.note || row?.reason || row?.commentaire || null,
    updated_by: row?.updated_by || row?.user_email || null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LECTURE TOLÉRANTE EXCHANGE_RATES                               */
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

async function queryRateRows(
  supabase: any,
  table: string,
  currency: Currency,
  limit: number
): Promise<any[]> {
  if (!supabase) return []

  let lastError: any = null

  for (const select of RATE_SELECT_CANDIDATES) {
    for (const order of RATE_ORDER_CANDIDATES) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .eq('currency', currency)
          .order(order, { ascending: false })
          .limit(limit)

        if (!error) {
          return Array.isArray(data) ? data : []
        }

        lastError = error

        if (isMissingTableError(error)) {
          return []
        }

        if (!isMissingColumnError(error)) {
          // Erreur autre que schéma : on arrête pour cette table.
          return []
        }
      } catch (err: any) {
        lastError = err

        if (isMissingTableError(err)) {
          return []
        }
      }
    }
  }

  log.warn?.('exchange-rate: lecture tolérée échouée', {
    table,
    currency,
    message: lastError?.message,
  })

  return []
}

async function getCurrentFromExchangeRates(
  supabase: any,
  currency: Currency
) {
  const rows = await queryRateRows(supabase, 'exchange_rates', currency, MAX_ROWS_TO_SCAN)

  if (rows.length === 0) return null

  // Priorité : ligne la plus récente déjà effective.
  const effectiveRows = rows.filter(isEffectiveNowOrPast)

  const chosen = effectiveRows[0] || null

  if (!chosen) return null

  return normalizeRatePoint(chosen, currency)
}

async function getCurrentFromExchangeRateHistory(
  supabase: any,
  currency: Currency
) {
  const rows = await queryRateRows(
    supabase,
    'exchange_rate_history',
    currency,
    MAX_ROWS_TO_SCAN
  )

  if (rows.length === 0) return null

  const effectiveRows = rows.filter(isEffectiveNowOrPast)
  const chosen = effectiveRows[0] || null

  if (!chosen) return null

  const point = normalizeRatePoint(chosen, currency)

  if (point) {
    return {
      ...point,
      source: point.source || 'exchange_rate_history',
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FALLBACK SETTINGS                                              */
/* ═══════════════════════════════════════════════════════════════ */

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

async function getSettingsRate(
  supabase: any,
  currency: Currency
) {
  if (!supabase) return null

  const keys = settingsKeys(currency)

  for (const key of keys) {
    try {
      let { data, error } = await supabase
        .from('settings')
        .select('value, updated_at')
        .eq('key', key)
        .maybeSingle()

      if (error && isMissingColumnError(error)) {
        const retry = await supabase
          .from('settings')
          .select('value')
          .eq('key', key)
          .maybeSingle()

        data = retry.data
        error = retry.error
      }

      if (error) {
        if (isMissingTableError(error)) {
          return null
        }

        continue
      }

      if (!data) continue

      const rate = extractRateValue(data.value)
      if (!rate) continue

      return {
        currency,
        rate,
        updated_at: data.updated_at || nowIso(),
        effective_at: data.updated_at || nowIso(),
        source: 'settings',
        note: null,
        updated_by: null,
        settings_key: key,
      }
    } catch (err: any) {
      if (isMissingTableError(err)) {
        return null
      }
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FALLBACK RPC                                                   */
/* ═══════════════════════════════════════════════════════════════ */

async function getRpcRate(supabase: any, currency: Currency) {
  if (!supabase || typeof supabase.rpc !== 'function') return null

  try {
    const { data, error } = await supabase.rpc('get_current_exchange_rate', {
      p_currency: currency,
    })

    if (error) {
      if (
        isMissingTableError(error) ||
        String(error?.code || '') === 'PGRST202' ||
        String(error?.code || '') === 'PGRST204' ||
        /function .* does not exist/i.test(String(error?.message || ''))
      ) {
        return null
      }

      log.warn?.('exchange-rate RPC error', error?.message || error)
      return null
    }

    if (!data) return null

    const rate = extractRateValue(
      data?.rate ??
        data?.value ??
        data
    )

    if (!rate) return null

    return {
      currency: data?.currency || currency,
      rate,
      updated_at: data?.updated_at || data?.effective_from || nowIso(),
      effective_at: data?.effective_from || data?.updated_at || nowIso(),
      source: data?.source || 'rpc:get_current_exchange_rate',
      note: data?.note || null,
      updated_by: null,
    }
  } catch (err: any) {
    log.warn?.('exchange-rate RPC exception', err?.message || err)
    return null
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET PUBLIC                                                     */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `public-exchange-rate:${ip}`,
    maxRequests: 120,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes sur le taux de change.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    const { searchParams } = new URL(request.url)

    const currency = normalizeCurrency(searchParams.get('currency'))

    const supabase = await getSupabase()

    if (!supabase) {
      return NextResponse.json(
        {
          error: 'Service Supabase indisponible.',
          currency,
        },
        { status: 503 }
      )
    }

    /*
     * Ordre de priorité :
     *
     * 1. exchange_rates
     *    Source officielle actuelle.
     *
     * 2. exchange_rate_history
     *    Si exchange_rates n’est pas encore configuré en mode courant.
     *
     * 3. RPC get_current_exchange_rate
     *    Si tu as créé la fonction SQL recommandée.
     *
     * 4. settings
     *    Compatibilité avec ton ancienne architecture.
     */
    let point = await getCurrentFromExchangeRates(supabase, currency)

    if (!point) {
      point = await getCurrentFromExchangeRateHistory(supabase, currency)
    }

    if (!point) {
      point = await getRpcRate(supabase, currency)
    }

    if (!point) {
      point = await getSettingsRate(supabase, currency)
    }

    if (!point) {
      return NextResponse.json(
        {
          error:
            'Aucun taux de change disponible. Vérifie la table exchange_rates, la fonction get_current_exchange_rate ou la clé settings exchange_rate.',
          currency,
          fetched_at: nowIso(),
        },
        { status: 503 }
      )
    }

    const rate = extractRateValue(point.rate)

    if (!rate) {
      return NextResponse.json(
        {
          error: 'Taux de change invalide.',
          currency,
          fetched_at: nowIso(),
        },
        { status: 500 }
      )
    }

    const payload = {
      currency: point.currency || currency,
      rate,
      updated_at: point.updated_at || nowIso(),
      effective_at: point.effective_at || point.updated_at || nowIso(),
      source: point.source || 'exchange_rates',
      note: point.note || null,
      updated_by: point.updated_by || null,
      is_primary: (point.currency || currency) === 'USD',
      fetched_at: nowIso(),
    }

    /*
     * Cache volontairement court.
     *
     * Le frontend doit pouvoir rafraîchir rapidement après une modification admin.
     * L’admin invalide aussi React Query + dispatch un event global.
     */
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Exchange-Rate-Currency': payload.currency,
        'X-Exchange-Rate-Source': payload.source,
        'X-Exchange-Rate-Updated-At': payload.updated_at,
      },
    })
  } catch (err: any) {
    log.error?.('GET /api/exchange-rate error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Erreur lors du chargement du taux de change.',
      },
      { status: 500 }
    )
  }
}