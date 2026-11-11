// app/api/admin/exchange-rate/history/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const ALLOWED_CURRENCIES = ['USD', 'EUR', 'GBP'] as const
type Currency = (typeof ALLOWED_CURRENCIES)[number]

const MIN_RATE = 1
const MAX_RATE = 100_000

const DEFAULT_PERIOD_DAYS = 30
const MAX_PERIOD_DAYS = 365

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

const SCAN_LIMIT = 500

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface HistoryPoint {
  id?: string
  currency: string
  rate: number
  date: string
  updated_at: string
  effective_at: string
  source: string | null
  note: string | null
  updated_by: string | null
  scheduled: boolean
}

interface CurrentPoint {
  currency: string
  rate: number
  updated_at: string
  effective_at: string
  source: string | null
  note: string | null
  updated_by: string | null
}

interface HistoryFilters {
  currency: Currency
  period: number
  limit: number
  since: string | null
  until: string | null
  includeScheduled: boolean
  order: 'asc' | 'desc'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRAUX                                               */
/* ═══════════════════════════════════════════════════════════════ */

function isThenable(value: any): value is Promise<any> {
  return value != null && typeof value.then === 'function'
}

async function getSupabase(): Promise<any | null> {
  try {
    const raw = (createClient as any)(true)
    return isThenable(raw) ? await raw : raw
  } catch (err: any) {
    log.error?.('admin exchange-rate history: client Supabase indisponible', err)
    return null
  }
}

function normalizeCurrency(value: unknown): Currency {
  const upper = String(value || 'USD').toUpperCase().trim()

  if ((ALLOWED_CURRENCIES as readonly string[]).includes(upper)) {
    return upper as Currency
  }

  if (upper === 'CDF') return 'USD'

  return 'USD'
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

function parsePeriod(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_PERIOD_DAYS
  return Math.min(MAX_PERIOD_DAYS, Math.max(1, Math.floor(n)))
}

function parseLimit(value: unknown, fallback = DEFAULT_LIMIT): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)))
}

function parseIsoDate(value: unknown): string | null {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

function parseBool(value: unknown, fallback = true): boolean {
  if (value == null) return fallback

  const raw = String(value).toLowerCase().trim()
  if (raw === 'false' || raw === '0' || raw === 'no') return false
  if (raw === 'true' || raw === '1' || raw === 'yes') return true

  return fallback
}

function nowIso(): string {
  return new Date().toISOString()
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
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

function extractMissingColumnName(message: string): string | null {
  const patterns = [
    /column\s+"?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)"?\s+does not exist/i,
    /Could not find the\s+'([a-zA-Z_][a-zA-Z0-9_]*)'\s+column/i,
    /"([a-zA-Z_][a-zA-Z0-9_]*)"\s+is not a column/i,
    /schema cache: could not find column\s+'([a-zA-Z_][a-zA-Z0-9_]*)'/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) {
      const raw = match[1]
      const parts = raw.split('.')
      return parts[parts.length - 1] || null
    }
  }

  return null
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

function isScheduledFuture(row: any): boolean {
  const eff = bestEffectiveDate(row)
  if (!eff) return false

  const time = new Date(eff).getTime()
  if (!Number.isFinite(time)) return false

  return time > Date.now() + 60_000
}

function toHistoryPoint(row: any, currency: Currency): HistoryPoint | null {
  const rate = extractRateValue(row?.rate ?? row?.value ?? row)
  if (!rate) return null

  const effectiveAt = bestEffectiveDate(row) || nowIso()
  const updatedAt = bestUpdatedAt(row) || effectiveAt

  return {
    id: row?.id ? String(row.id) : undefined,
    currency: String(row?.currency || currency).toUpperCase(),
    rate,
    date: effectiveAt,
    updated_at: updatedAt,
    effective_at: effectiveAt,
    source: row?.source || null,
    note: row?.note || row?.reason || row?.commentaire || null,
    updated_by: row?.updated_by || row?.user_email || null,
    scheduled: isScheduledFuture(row),
  }
}

function toCurrentPoint(row: any, currency: Currency): CurrentPoint | null {
  const rate = extractRateValue(row?.rate ?? row?.value ?? row)
  if (!rate) return null

  const effectiveAt = bestEffectiveDate(row) || nowIso()
  const updatedAt = bestUpdatedAt(row) || effectiveAt

  return {
    currency: String(row?.currency || currency).toUpperCase(),
    rate,
    updated_at: updatedAt,
    effective_at: effectiveAt,
    source: row?.source || null,
    note: row?.note || row?.reason || row?.commentaire || null,
    updated_by: row?.updated_by || row?.user_email || null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  REQUÊTES TOLÉRANTES                                            */
/* ═══════════════════════════════════════════════════════════════ */

const RATE_SELECT_CANDIDATES = [
  'id, currency, rate, source, note, updated_by, updated_at, effective_at, effective_from, created_at',
  'id, currency, rate, source, note, updated_at, effective_at, effective_from, created_at',
  'id, currency, rate, source, note, updated_at, effective_at, created_at',
  'id, currency, rate, source, note, updated_at, effective_from, created_at',
  'id, currency, rate, source, note, updated_at, created_at',
  'id, currency, rate, source, updated_at, created_at',
  'id, currency, rate, created_at',
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
): Promise<{ rows: any[]; tableMissing: boolean; lastError: any }> {
  if (!supabase) return { rows: [], tableMissing: false, lastError: null }

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
          return {
            rows: Array.isArray(data) ? data : [],
            tableMissing: false,
            lastError: null,
          }
        }

        lastError = error

        if (isMissingTableError(error)) {
          return { rows: [], tableMissing: true, lastError: error }
        }

        if (!isMissingColumnError(error)) {
          return { rows: [], tableMissing: false, lastError: error }
        }
      } catch (err: any) {
        lastError = err

        if (isMissingTableError(err)) {
          return { rows: [], tableMissing: true, lastError: err }
        }
      }
    }
  }

  log.warn?.('history: lecture tolérée échouée', {
    table,
    currency,
    message: lastError?.message,
  })

  return { rows: [], tableMissing: false, lastError }
}

async function getCurrentFromTable(
  supabase: any,
  currency: Currency
): Promise<CurrentPoint | null> {
  const { rows } = await queryRateRows(supabase, 'exchange_rates', currency, SCAN_LIMIT)

  if (rows.length === 0) return null

  // Priorité : ligne la plus récente déjà effective.
  const effective = rows.filter((row) => !isScheduledFuture(row))
  const chosen = effective[0] || null

  if (!chosen) return null

  return toCurrentPoint(chosen, currency)
}

async function getHistoryFromTable(
  supabase: any,
  currency: Currency,
  filters: HistoryFilters
): Promise<{ points: HistoryPoint[]; tableMissing: boolean }> {
  const { rows, tableMissing } = await queryRateRows(
    supabase,
    'exchange_rate_history',
    currency,
    SCAN_LIMIT
  )

  if (tableMissing) {
    return { points: [], tableMissing: true }
  }

  let points = rows
    .map((row) => toHistoryPoint(row, currency))
    .filter(Boolean) as HistoryPoint[]

  // Filtre période / since / until
  const sinceMs = filters.since
    ? new Date(filters.since).getTime()
    : Date.now() - filters.period * 24 * 60 * 60 * 1000

  const untilMs = filters.until ? new Date(filters.until).getTime() : null

  points = points.filter((point) => {
    const time = new Date(point.effective_at).getTime()
    if (!Number.isFinite(time)) return true

    if (time < sinceMs) return false
    if (untilMs != null && time > untilMs) return false

    return true
  })

  // Taux programmés
  if (!filters.includeScheduled) {
    points = points.filter((point) => !point.scheduled)
  }

  points.sort((a, b) => {
    const ta = new Date(a.effective_at).getTime()
    const tb = new Date(b.effective_at).getTime()

    return filters.order === 'asc' ? ta - tb : tb - ta
  })

  return { points, tableMissing: false }
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
): Promise<{
  rate: number
  source: string
  key: string
  updated_at: string | null
} | null> {
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
        if (isMissingTableError(error)) return null
        continue
      }

      if (!data) continue

      const rate = extractRateValue(data.value)
      if (!rate) continue

      return {
        rate,
        source: 'settings',
        key,
        updated_at: data.updated_at || null,
      }
    } catch (err: any) {
      if (isMissingTableError(err)) return null
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  APPLICATION DES TAUX PROGRAMMÉS                                */
/* ═══════════════════════════════════════════════════════════════ */

async function upsertCurrentRate(
  supabase: any,
  payload: {
    currency: Currency
    rate: number
    source?: string | null
    note?: string | null
    updated_by?: string | null
    effective_at: string
  }
): Promise<boolean> {
  if (!supabase) return false

  const baseRow: Record<string, any> = {
    currency: payload.currency,
    rate: payload.rate,
    source: payload.source ?? 'schedule',
    note: payload.note ?? null,
    updated_by: payload.updated_by ?? 'system',
    updated_at: payload.effective_at,
    effective_at: payload.effective_at,
    effective_from: payload.effective_at,
  }

  // 1. Upsert propre si contrainte unique currency
  let row = { ...baseRow }

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .upsert(row, { onConflict: 'currency' })

      if (!error) return true

      if (isMissingTableError(error)) return false

      if (isMissingColumnError(error)) {
        const col = extractMissingColumnName(String(error.message || ''))
        if (col && col in row && col !== 'currency' && col !== 'rate') {
          delete row[col]
          continue
        }
      }

      break
    } catch (err: any) {
      if (isMissingTableError(err)) return false
      break
    }
  }

  // 2. Fallback insert append-only
  row = { ...baseRow, created_at: payload.effective_at }

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const { error } = await supabase.from('exchange_rates').insert(row)

      if (!error) return true

      if (isMissingTableError(error)) return false

      if (isMissingColumnError(error)) {
        const col = extractMissingColumnName(String(error.message || ''))
        if (col && col in row && col !== 'currency' && col !== 'rate') {
          delete row[col]
          continue
        }
      }

      break
    } catch (err: any) {
      if (isMissingTableError(err)) return false
      break
    }
  }

  // 3. Dernier recours : update par currency
  row = { ...baseRow }

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .update(row)
        .eq('currency', payload.currency)
        .select('id')
        .maybeSingle()

      if (!error) return Boolean(data)

      if (isMissingTableError(error)) return false

      if (isMissingColumnError(error)) {
        const col = extractMissingColumnName(String(error.message || ''))
        if (col && col in row && col !== 'currency' && col !== 'rate') {
          delete row[col]
          continue
        }
      }

      break
    } catch (err: any) {
      if (isMissingTableError(err)) return false
      break
    }
  }

  return false
}

async function upsertSettingsRate(
  supabase: any,
  currency: Currency,
  rate: number,
  meta: { source?: string | null; reason?: string | null; effective_at: string }
): Promise<boolean> {
  if (!supabase) return false

  const keys = settingsKeys(currency)

  for (const key of keys) {
    const payloads = [
      {
        key,
        value: rate,
        updated_at: meta.effective_at,
        source: meta.source || 'schedule',
        note: meta.reason || null,
      },
      {
        key,
        value: rate,
        updated_at: meta.effective_at,
      },
      {
        key,
        value: String(rate),
        updated_at: meta.effective_at,
      },
      {
        key,
        value: String(rate),
      },
    ]

    for (const payload of payloads) {
      try {
        const { error } = await supabase
          .from('settings')
          .upsert(payload, { onConflict: 'key' })

        if (!error) return true

        if (isMissingTableError(error)) break

        if (!isMissingColumnError(error)) continue
      } catch (err: any) {
        if (isMissingTableError(err)) break
      }
    }
  }

  return false
}

async function insertAuditRow(
  supabase: any,
  payload: {
    currency: Currency
    old_rate: number | null
    new_rate: number
    reason?: string | null
    source?: string | null
    action?: string
    user_email?: string | null
    metadata?: any
    created_at: string
  }
): Promise<boolean> {
  if (!supabase) return false

  const baseRow: Record<string, any> = {
    currency: payload.currency,
    old_rate: payload.old_rate,
    new_rate: payload.new_rate,
    reason: payload.reason || null,
    source: payload.source || null,
    action: payload.action || 'scheduled_applied',
    user_email: payload.user_email || 'system',
    metadata: payload.metadata || null,
    created_at: payload.created_at,
  }

  let row = { ...baseRow }

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const { error } = await supabase
        .from('exchange_rate_audit')
        .insert(row)

      if (!error) return true

      if (isMissingTableError(error)) return false

      if (isMissingColumnError(error)) {
        const col = extractMissingColumnName(String(error.message || ''))
        if (col && col in row && col !== 'currency' && col !== 'new_rate') {
          delete row[col]
          continue
        }
      }

      break
    } catch (err: any) {
      if (isMissingTableError(err)) return false
      break
    }
  }

  return false
}

async function applyDueScheduledRates(
  supabase: any,
  currency: Currency
): Promise<{ applied: boolean; appliedRate?: number }> {
  if (!supabase) return { applied: false }

  try {
    const now = Date.now()

    // 1. Chercher le taux programmé le plus récent déjà dû
    const { points } = await getHistoryFromTable(supabase, currency, {
      currency,
      period: MAX_PERIOD_DAYS,
      limit: SCAN_LIMIT,
      since: null,
      until: null,
      includeScheduled: true,
      order: 'desc',
    })

    const due = points.find((point) => {
      if (!point.scheduled) return false
      const time = new Date(point.effective_at).getTime()
      return Number.isFinite(time) && time <= now + 60_000
    })

    if (!due) return { applied: false }

    const dueRate = extractRateValue(due.rate)
    if (!dueRate) return { applied: false }

    // 2. Comparer avec le taux courant
    const current = await getCurrentFromTable(supabase, currency)

    if (current && Math.abs(current.rate - dueRate) < 0.01) {
      return { applied: false }
    }

    const effectiveAt = due.effective_at || nowIso()

    // 3. Appliquer dans exchange_rates
    const currentOk = await upsertCurrentRate(supabase, {
      currency,
      rate: dueRate,
      source: due.source || 'schedule',
      note: due.note || 'Taux programmé appliqué automatiquement',
      updated_by: due.updated_by || 'system',
      effective_at: effectiveAt,
    })

    // 4. Synchroniser settings pour compatibilité
    const settingsOk = await upsertSettingsRate(supabase, currency, dueRate, {
      source: due.source || 'schedule',
      reason: due.note || 'Taux programmé appliqué automatiquement',
      effective_at: effectiveAt,
    })

    // 5. Auditer
    await insertAuditRow(supabase, {
      currency,
      old_rate: current?.rate ?? null,
      new_rate: dueRate,
      reason: due.note || 'Taux programmé appliqué automatiquement',
      source: due.source || 'schedule',
      action: 'scheduled_applied',
      user_email: due.updated_by || 'system',
      metadata: {
        effective_at: effectiveAt,
        applied_at: nowIso(),
        updated_current_table: currentOk,
        updated_settings: settingsOk,
      },
      created_at: nowIso(),
    })

    return { applied: true, appliedRate: dueRate }
  } catch (err: any) {
    if (!isMissingTableError(err)) {
      log.warn?.('history: applyDueScheduledRates error', err?.message || err)
    }
    return { applied: false }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMA QUERY                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const historyQuerySchema = z.object({
  currency: z.string().optional(),
  period: z.union([z.number(), z.string()]).optional(),
  limit: z.union([z.number(), z.string()]).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  include_scheduled: z.union([z.boolean(), z.string()]).optional(),
  order: z.enum(['asc', 'desc']).optional(),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-exchange-rate-history-get:${ip}`,
    maxRequests: 60,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let adminUser: any = null

  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: Number(err?.status) || 403 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)

    const parsed = historyQuerySchema.safeParse({
      currency: searchParams.get('currency') || undefined,
      period: searchParams.get('period') || undefined,
      limit: searchParams.get('limit') || undefined,
      since: searchParams.get('since') || undefined,
      until: searchParams.get('until') || undefined,
      include_scheduled: searchParams.get('include_scheduled') || undefined,
      order: searchParams.get('order') || undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            'Paramètres de filtre invalides.',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const currency = normalizeCurrency(parsed.data.currency)
    const period = parsePeriod(parsed.data.period)
    const limit = parseLimit(parsed.data.limit, DEFAULT_LIMIT)
    const since = parseIsoDate(parsed.data.since)
    const until = parseIsoDate(parsed.data.until)
    const includeScheduled = parseBool(parsed.data.include_scheduled, true)
    const order = parsed.data.order === 'asc' ? 'asc' : 'desc'

    const supabase = await getSupabase()

    if (!supabase) {
      return NextResponse.json(
        {
          error: 'Service Supabase indisponible.',
          current: null,
          history: [],
          data: [],
        },
        { status: 503 }
      )
    }

    const filters: HistoryFilters = {
      currency,
      period,
      limit,
      since,
      until,
      includeScheduled,
      order,
    }

    /*
     * 1. Appliquer les taux programmés devenus dus.
     */
    const scheduleResult = await applyDueScheduledRates(supabase, currency)

    /*
     * 2. Charger le taux courant.
     */
    let current = await getCurrentFromTable(supabase, currency)

    /*
     * 3. Charger l'historique (inclut les taux programmés futurs si demandé).
     */
    const historyResult = await getHistoryFromTable(supabase, currency, filters)

    let history = historyResult.points

    /*
     * 4. Si exchange_rate_history manque ou est vide,
     *    reconstruire l'historique depuis exchange_rates (mode append-only).
     */
    if (history.length === 0) {
      const { rows, tableMissing } = await queryRateRows(
        supabase,
        'exchange_rates',
        currency,
        SCAN_LIMIT
      )

      if (!tableMissing) {
        let rebuilt = rows
          .map((row) => toHistoryPoint(row, currency))
          .filter(Boolean) as HistoryPoint[]

        const sinceMs = since
          ? new Date(since).getTime()
          : Date.now() - period * 24 * 60 * 60 * 1000
        const untilMs = until ? new Date(until).getTime() : null

        rebuilt = rebuilt.filter((point) => {
          const time = new Date(point.effective_at).getTime()
          if (!Number.isFinite(time)) return true
          if (time < sinceMs) return false
          if (untilMs != null && time > untilMs) return false
          return true
        })

        if (!includeScheduled) {
          rebuilt = rebuilt.filter((point) => !point.scheduled)
        }

        rebuilt.sort((a, b) => {
          const ta = new Date(a.effective_at).getTime()
          const tb = new Date(b.effective_at).getTime()
          return order === 'asc' ? ta - tb : tb - ta
        })

        history = rebuilt
      }
    }

    /*
     * 5. Fallback settings si rien n'est trouvé.
     */
    let source = current?.source || null

    if (!current && history.length === 0) {
      const settingsRate = await getSettingsRate(supabase, currency)

      if (settingsRate) {
        const effectiveAt = settingsRate.updated_at || nowIso()

        current = {
          currency,
          rate: settingsRate.rate,
          updated_at: effectiveAt,
          effective_at: effectiveAt,
          source: settingsRate.source,
          note: null,
          updated_by: null,
        }

        history = [
          {
            id: undefined,
            currency,
            rate: settingsRate.rate,
            date: effectiveAt,
            updated_at: effectiveAt,
            effective_at: effectiveAt,
            source: settingsRate.source,
            note: null,
            updated_by: null,
            scheduled: false,
          },
        ]

        source = settingsRate.source
      }
    }

    /*
     * 6. Si current manque mais history existe, prendre la première ligne effective.
     */
    if (!current && history.length > 0) {
      const firstEffective = history.find((point) => !point.scheduled)
      const chosen = firstEffective || history[0]

      if (chosen) {
        current = {
          currency,
          rate: chosen.rate,
          updated_at: chosen.updated_at,
          effective_at: chosen.effective_at,
          source: chosen.source,
          note: chosen.note,
          updated_by: chosen.updated_by,
        }
      }
    }

    /*
     * 7. Tronquer à la limite demandée.
     */
    const historySlice = history.slice(0, limit)

    const scheduledCount = history.filter((point) => point.scheduled).length

    return NextResponse.json(
      {
        current,
        history: historySlice,
        data: historySlice,
        source: source || 'exchange_rate_history',
        currency,
        period,
        pagination: {
          total: history.length,
          returned: historySlice.length,
          limit,
          has_more: historySlice.length < history.length,
          period_days: period,
          scheduled_count: scheduledCount,
        },
        filters: {
          currency,
          period,
          limit,
          since,
          until,
          include_scheduled: includeScheduled,
          order,
        },
        schedule_status: {
          applied_due: scheduleResult.applied,
          applied_rate: scheduleResult.appliedRate ?? null,
        },
        schema_status: {
          history_table_missing: historyResult.tableMissing,
        },
        generated_at: nowIso(),
        admin_email: adminUser?.email || adminUser?.user?.email || null,
      },
      { status: 200 }
    )
  } catch (err: any) {
    log.error?.('GET /api/admin/exchange-rate/history error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Erreur lors du chargement de l’historique du taux de change.',
        current: null,
        history: [],
        data: [],
      },
      { status: 500 }
    )
  }
}