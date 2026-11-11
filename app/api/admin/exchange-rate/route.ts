// app/api/admin/exchange-rate/route.ts
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

const REASON_THRESHOLD_PERCENT = 5
const DEFAULT_PERIOD_DAYS = 30
const MAX_PERIOD_DAYS = 365
const MAX_HISTORY_LIMIT = 500
const MAX_AUDIT_LIMIT = 200

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRAUX                                               */
/* ═══════════════════════════════════════════════════════════════ */

function isThenable(value: any): value is Promise<any> {
  return value != null && typeof value.then === 'function'
}

async function getSupabase(): Promise<any | null> {
  try {
    const raw = createClient(true)
    return isThenable(raw) ? await raw : raw
  } catch (err: any) {
    log.error?.('admin exchange-rate: impossible de créer le client Supabase', err)
    return null
  }
}

function normalizeCurrency(value: unknown): Currency {
  const upper = String(value || 'USD').toUpperCase().trim()

  if ((ALLOWED_CURRENCIES as readonly string[]).includes(upper)) {
    return upper as Currency
  }

  // Si on demande CDF, on revient à la référence USD -> CDF
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

function parseLimit(value: unknown, fallback = 50, max = MAX_HISTORY_LIMIT): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(1, Math.floor(n)))
}

function nowIso(): string {
  return new Date().toISOString()
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function computeChangePercent(oldRate: number | null, newRate: number): number {
  if (!oldRate || oldRate <= 0) return 0
  return ((newRate - oldRate) / oldRate) * 100
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

function isDuplicateError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()

  return (
    code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('unique constraint') ||
    message.includes('conflict')
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

function bestDate(row: any): string | null {
  return (
    row?.effective_at ||
    row?.effective_from ||
    row?.updated_at ||
    row?.created_at ||
    row?.date ||
    null
  )
}

function bestEffectiveDate(row: any): string | null {
  return row?.effective_at || row?.effective_from || null
}

function toCurrentPoint(row: any, currency: Currency) {
  const rate = extractRateValue(row?.rate ?? row?.value ?? row)
  if (!rate) return null

  const date = bestDate(row) || nowIso()

  return {
    currency,
    rate,
    updated_at: row?.updated_at || date,
    effective_at: row?.effective_at || row?.effective_from || date,
    source: row?.source || null,
    note: row?.note || row?.reason || row?.commentaire || null,
    updated_by: row?.updated_by || row?.user_email || null,
  }
}

function toHistoryPoint(row: any, currency: Currency) {
  const rate = extractRateValue(row?.rate ?? row?.value ?? row)
  if (!rate) return null

  const date = bestDate(row) || nowIso()

  return {
    id: row?.id ? String(row.id) : undefined,
    currency: row?.currency || currency,
    rate,
    date,
    updated_at: row?.updated_at || date,
    effective_at: row?.effective_at || row?.effective_from || date,
    source: row?.source || null,
    note: row?.note || row?.reason || row?.commentaire || null,
    updated_by: row?.updated_by || row?.user_email || null,
  }
}

function toAuditEntry(row: any) {
  const newRate = extractRateValue(row?.new_rate ?? row?.rate ?? row?.value)
  if (!newRate) return null

  const oldRate =
    row?.old_rate != null
      ? extractRateValue(row.old_rate)
      : row?.previous_rate != null
        ? extractRateValue(row.previous_rate)
        : row?.ancien_taux != null
          ? extractRateValue(row.ancien_taux)
          : null

  return {
    id: String(row?.id || `${Date.now()}-${Math.random()}`),
    created_at: row?.created_at || row?.date || nowIso(),
    currency: row?.currency || 'USD',
    user_email:
      row?.user_email ||
      row?.admin?.email ||
      row?.user?.email ||
      row?.modifie_par ||
      'Système',
    old_rate: oldRate,
    new_rate: newRate,
    reason: row?.reason || row?.note || row?.commentaire || row?.raison || '',
    source: row?.source || null,
    action: row?.action || 'updated',
    metadata: row?.metadata || null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LECTURE TOLÉRANTE                                              */
/* ═══════════════════════════════════════════════════════════════ */

const RATE_SELECT_CANDIDATES = [
  'id, currency, rate, source, note, updated_by, updated_at, effective_at, effective_from, created_at',
  'id, currency, rate, source, note, updated_at, effective_at, effective_from, created_at',
  'id, currency, rate, source, note, updated_at, effective_at, created_at',
  'id, currency, rate, source, note, updated_at, effective_from, created_at',
  'id, currency, rate, source, note, updated_at, created_at',
  'id, currency, rate, created_at',
  '*',
]

const RATE_ORDER_CANDIDATES = [
  'effective_at',
  'effective_from',
  'updated_at',
  'created_at',
]

const AUDIT_SELECT_CANDIDATES = [
  'id, currency, old_rate, new_rate, reason, source, user_email, metadata, action, created_at',
  'id, currency, old_rate, new_rate, reason, source, created_at',
  'id, currency, new_rate, created_at',
  '*',
]

const AUDIT_ORDER_CANDIDATES = ['created_at', 'updated_at']

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
          // Erreur non liée au schéma : on arrête pour cette table.
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

  log.warn?.('queryRateRows: échec toléré', {
    table,
    currency,
    message: lastError?.message,
  })

  return []
}

async function queryAuditRows(
  supabase: any,
  currency: Currency,
  limit: number
): Promise<any[]> {
  if (!supabase) return []

  let lastError: any = null

  for (const select of AUDIT_SELECT_CANDIDATES) {
    for (const order of AUDIT_ORDER_CANDIDATES) {
      try {
        const { data, error } = await supabase
          .from('exchange_rate_audit')
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

  log.warn?.('queryAuditRows: échec toléré', {
    currency,
    message: lastError?.message,
  })

  return []
}

async function getCurrentRateRow(
  supabase: any,
  currency: Currency
): Promise<any | null> {
  const rows = await queryRateRows(supabase, 'exchange_rates', currency, 30)
  if (rows.length === 0) return null

  const now = Date.now()

  for (const row of rows) {
    const eff = bestEffectiveDate(row)

    if (!eff) {
      return row
    }

    const time = new Date(eff).getTime()

    if (!Number.isFinite(time) || time <= now + 60_000) {
      return row
    }
  }

  return null
}

async function getHistoryRateRows(
  supabase: any,
  currency: Currency,
  periodDays: number
): Promise<any[]> {
  const since = Date.now() - periodDays * 24 * 60 * 60 * 1000

  // 1. Table dédiée historique si présente
  const historyRaw = await queryRateRows(
    supabase,
    'exchange_rate_history',
    currency,
    MAX_HISTORY_LIMIT
  )

  let points = historyRaw
    .map((row) => toHistoryPoint(row, currency))
    .filter(Boolean) as any[]

  // 2. Sinon, historique depuis exchange_rates (append-only)
  if (points.length === 0) {
    const ratesRaw = await queryRateRows(
      supabase,
      'exchange_rates',
      currency,
      MAX_HISTORY_LIMIT
    )

    points = ratesRaw
      .map((row) => toHistoryPoint(row, currency))
      .filter(Boolean) as any[]
  }

  // 3. Compléter avec audit si peu de points
  if (points.length < 2) {
    const auditRaw = await queryAuditRows(supabase, currency, MAX_AUDIT_LIMIT)

    const auditPoints = auditRaw
      .map((row) => toAuditEntry(row))
      .filter(Boolean)
      .map((entry: any) => ({
        id: entry.id,
        currency: entry.currency || currency,
        rate: entry.new_rate,
        date: entry.created_at,
        updated_at: entry.created_at,
        effective_at: entry.created_at,
        source: entry.source || 'audit',
        note: entry.reason || null,
        updated_by: entry.user_email || null,
      }))
      .filter((p: any) => Number.isFinite(p.rate) && p.rate > 0)

    const map = new Map<string, any>()

    for (const point of points) {
      const key = `${point.date}|${point.rate}`
      map.set(key, point)
    }

    for (const point of auditPoints) {
      const key = `${point.date}|${point.rate}`
      if (!map.has(key)) {
        map.set(key, point)
      }
    }

    points = Array.from(map.values())
  }

  points.sort((a: any, b: any) => {
    const ta = new Date(a.date).getTime()
    const tb = new Date(b.date).getTime()
    return tb - ta
  })

  return points.filter((point: any) => {
    const time = new Date(point.date).getTime()
    return !Number.isFinite(time) || time >= since
  })
}

async function getAuditEntries(
  supabase: any,
  currency: Currency,
  limit = 50
): Promise<any[]> {
  const rows = await queryAuditRows(supabase, currency, limit)
  return rows.map((row) => toAuditEntry(row)).filter(Boolean)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SETTINGS FALLBACK                                              */
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
  updated_at?: string | null
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
        if (isMissingTableError(error)) {
          return null
        }
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
      if (isMissingTableError(err)) {
        return null
      }
    }
  }

  return null
}

async function upsertSettingsRate(
  supabase: any,
  currency: Currency,
  rate: number,
  meta: {
    source?: string | null
    reason?: string | null
  }
): Promise<boolean> {
  if (!supabase) return false

  const keys = settingsKeys(currency)

  for (const key of keys) {
    const payloads = [
      {
        key,
        value: rate,
        updated_at: nowIso(),
        source: meta.source || 'manuel',
        note: meta.reason || null,
      },
      {
        key,
        value: rate,
        updated_at: nowIso(),
      },
      {
        key,
        value: String(rate),
        updated_at: nowIso(),
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

        if (!error) {
          return true
        }

        if (isMissingTableError(error)) {
          break
        }

        if (!isMissingColumnError(error)) {
          continue
        }
      } catch (err: any) {
        if (isMissingTableError(err)) {
          break
        }
      }
    }
  }

  return false
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ÉCRITURE TOLÉRANTE                                             */
/* ═══════════════════════════════════════════════════════════════ */

async function updateRateRowByCurrency(
  supabase: any,
  payload: {
    currency: Currency
    rate: number
    source?: string | null
    note?: string | null
    updated_by?: string | null
    effective_at?: string
  }
): Promise<boolean> {
  if (!supabase) return false

  const effective = payload.effective_at || nowIso()

  let patch: Record<string, any> = {
    rate: payload.rate,
    source: payload.source ?? 'manuel',
    note: payload.note ?? null,
    updated_by: payload.updated_by ?? null,
    updated_at: effective,
    effective_at: effective,
    effective_from: effective,
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .update(patch)
        .eq('currency', payload.currency)
        .select('id')
        .maybeSingle()

      if (!error) {
        return Boolean(data)
      }

      if (isMissingTableError(error)) {
        return false
      }

      if (isMissingColumnError(error)) {
        const col = extractMissingColumnName(String(error.message || ''))

        if (col && col in patch && col !== 'rate' && col !== 'currency') {
          delete patch[col]
          continue
        }
      }

      break
    } catch (err: any) {
      if (isMissingTableError(err)) {
        return false
      }
      break
    }
  }

  return false
}

async function insertRateRow(
  supabase: any,
  table: string,
  payload: {
    currency: Currency
    rate: number
    source?: string | null
    note?: string | null
    updated_by?: string | null
    effective_at?: string
  },
  options: {
    onConflict?: string
    allowUpdateOnDuplicate?: boolean
  } = {}
): Promise<boolean> {
  if (!supabase) return false

  const effective = payload.effective_at || nowIso()

  const baseRow: Record<string, any> = {
    currency: payload.currency,
    rate: payload.rate,
    source: payload.source ?? 'manuel',
    note: payload.note ?? null,
    updated_by: payload.updated_by ?? null,
    updated_at: effective,
    effective_at: effective,
    effective_from: effective,
    created_at: effective,
  }

  // 1. Upsert si conflit fourni
  if (options.onConflict) {
    let row = { ...baseRow }

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const { error } = await supabase
          .from(table)
          .upsert(row, { onConflict: options.onConflict })

        if (!error) {
          return true
        }

        if (isMissingTableError(error)) {
          return false
        }

        if (isMissingColumnError(error)) {
          const col = extractMissingColumnName(String(error.message || ''))

          if (
            col &&
            col in row &&
            col !== 'currency' &&
            col !== 'rate'
          ) {
            delete row[col]
            continue
          }
        }

        break
      } catch (err: any) {
        if (isMissingTableError(err)) {
          return false
        }
        break
      }
    }
  }

  // 2. Insert simple
  let row = { ...baseRow }

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const { error } = await supabase.from(table).insert(row)

      if (!error) {
        return true
      }

      if (isMissingTableError(error)) {
        return false
      }

      if (isMissingColumnError(error)) {
        const col = extractMissingColumnName(String(error.message || ''))

        if (
          col &&
          col in row &&
          col !== 'currency' &&
          col !== 'rate'
        ) {
          delete row[col]
          continue
        }
      }

      if (isDuplicateError(error) && options.allowUpdateOnDuplicate) {
        return await updateRateRowByCurrency(supabase, payload)
      }

      break
    } catch (err: any) {
      if (isMissingTableError(err)) {
        return false
      }
      break
    }
  }

  return false
}

async function saveCurrentRate(
  supabase: any,
  payload: {
    currency: Currency
    rate: number
    source?: string | null
    note?: string | null
    updated_by?: string | null
    effective_at?: string
  }
): Promise<boolean> {
  // Priorité : upsert propre si contrainte unique currency
  const okUpsert = await insertRateRow(supabase, 'exchange_rates', payload, {
    onConflict: 'currency',
    allowUpdateOnDuplicate: true,
  })

  if (okUpsert) return true

  // Fallback : insert append-only si pas de contrainte unique
  const okInsert = await insertRateRow(supabase, 'exchange_rates', payload, {
    allowUpdateOnDuplicate: false,
  })

  if (okInsert) return true

  // Dernier recours : update par currency
  return await updateRateRowByCurrency(supabase, payload)
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
  }
): Promise<boolean> {
  if (!supabase) return false

  const baseRow: Record<string, any> = {
    currency: payload.currency,
    old_rate: payload.old_rate,
    new_rate: payload.new_rate,
    reason: payload.reason || null,
    source: payload.source || null,
    action: payload.action || 'updated',
    user_email: payload.user_email || null,
    metadata: payload.metadata || null,
    created_at: nowIso(),
  }

  let row = { ...baseRow }

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const { error } = await supabase
        .from('exchange_rate_audit')
        .insert(row)

      if (!error) {
        return true
      }

      if (isMissingTableError(error)) {
        return false
      }

      if (isMissingColumnError(error)) {
        const col = extractMissingColumnName(String(error.message || ''))

        if (
          col &&
          col in row &&
          col !== 'currency' &&
          col !== 'new_rate'
        ) {
          delete row[col]
          continue
        }
      }

      break
    } catch (err: any) {
      if (isMissingTableError(err)) {
        return false
      }
      break
    }
  }

  return false
}

/* ═══════════════════════════════════════════════════════════════ */
/*  APPLICATION DES TAUX PROGRAMMÉS                                */
/* ═══════════════════════════════════════════════════════════════ */

async function applyDueScheduledRates(
  supabase: any,
  currency: Currency
): Promise<void> {
  if (!supabase) return

  try {
    const points = await getHistoryRateRows(supabase, currency, 365)
    if (points.length === 0) return

    const now = Date.now()

    const due = points.find((point: any) => {
      const time = new Date(point.date).getTime()
      return Number.isFinite(time) && time <= now + 60_000
    })

    if (!due) return

    const dueRate = extractRateValue(due.rate)
    if (!dueRate) return

    const currentRaw = await getCurrentRateRow(supabase, currency)
    const currentPoint = currentRaw ? toCurrentPoint(currentRaw, currency) : null
    const currentRate = currentPoint?.rate ?? null

    if (currentRate != null && Math.abs(currentRate - dueRate) < 0.01) {
      return
    }

    const effectiveAt = due.effective_at || due.date || nowIso()

    await saveCurrentRate(supabase, {
      currency,
      rate: dueRate,
      source: due.source || 'schedule',
      note: due.note || 'Taux programmé appliqué automatiquement',
      updated_by: due.updated_by || 'system',
      effective_at: effectiveAt,
    })

    await upsertSettingsRate(supabase, currency, dueRate, {
      source: due.source || 'schedule',
      reason: due.note || 'Taux programmé appliqué automatiquement',
    })

    await insertAuditRow(supabase, {
      currency,
      old_rate: currentRate,
      new_rate: dueRate,
      reason: due.note || 'Taux programmé appliqué automatiquement',
      source: due.source || 'schedule',
      action: 'scheduled_applied',
      user_email: due.updated_by || 'system',
      metadata: {
        effective_at: effectiveAt,
        applied_at: nowIso(),
      },
    })
  } catch (err: any) {
    if (!isMissingTableError(err)) {
      log.warn?.('applyDueScheduledRates error', err)
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const saveSchema = z.object({
  currency: z.string().optional(),
  rate: z.union([z.number(), z.string()]),
  previous_rate: z.union([z.number(), z.string()]).nullable().optional(),
  change_percent: z.number().nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  source: z.string().max(100).nullable().optional(),
  applies_at: z.string().nullable().optional(),
  updated_by: z.string().nullable().optional(),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-exchange-rate-get:${ip}`,
    maxRequests: 60,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: Number(err?.status) || 403 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)

    const currency = normalizeCurrency(searchParams.get('currency'))
    const period = parsePeriod(searchParams.get('period'))
    const includeAudit = searchParams.get('audit') !== 'false'

    const supabase = await getSupabase()

    if (!supabase) {
      return NextResponse.json(
        { error: 'Service Supabase indisponible.' },
        { status: 503 }
      )
    }

    await applyDueScheduledRates(supabase, currency)

    let currentRaw = await getCurrentRateRow(supabase, currency)
    let current = currentRaw ? toCurrentPoint(currentRaw, currency) : null

    let history = await getHistoryRateRows(supabase, currency, period)

    if (!current && history.length > 0) {
      const firstPast = history.find((point: any) => {
        const time = new Date(point.date).getTime()
        return !Number.isFinite(time) || time <= Date.now() + 60_000
      })

      if (firstPast) {
        current = {
          currency,
          rate: firstPast.rate,
          updated_at: firstPast.updated_at || firstPast.date,
          effective_at: firstPast.effective_at || firstPast.date,
          source: firstPast.source || null,
          note: firstPast.note || null,
          updated_by: firstPast.updated_by || null,
        }
      }
    }

    let source = current?.source || null

    if (!current) {
      const settingsRate = await getSettingsRate(supabase, currency)

      if (settingsRate) {
        current = {
          currency,
          rate: settingsRate.rate,
          updated_at: settingsRate.updated_at || nowIso(),
          effective_at: settingsRate.updated_at || nowIso(),
          source: settingsRate.source,
          note: null,
          updated_by: null,
        }

        if (history.length === 0) {
          history = [
            {
              id: undefined,
              currency,
              rate: settingsRate.rate,
              date: settingsRate.updated_at || nowIso(),
              updated_at: settingsRate.updated_at || nowIso(),
              effective_at: settingsRate.updated_at || nowIso(),
              source: settingsRate.source,
              note: null,
              updated_by: null,
            },
          ]
        }

        source = settingsRate.source
      }
    }

    const audit = includeAudit
      ? await getAuditEntries(supabase, currency, 50)
      : []

    return NextResponse.json(
      {
        current,
        history,
        data: history,
        audit,
        source: source || 'exchange_rates',
        currency,
        period,
        generated_at: nowIso(),
      },
      { status: 200 }
    )
  } catch (err: any) {
    log.error?.('GET /api/admin/exchange-rate error', err)

    return NextResponse.json(
      {
        error:
          err?.message || 'Erreur lors du chargement du taux de change.',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUT / POST                                                     */
/* ═══════════════════════════════════════════════════════════════ */

async function handleSave(request: Request, method: 'PUT' | 'POST') {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-exchange-rate-${method.toLowerCase()}:${ip}`,
    maxRequests: 20,
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
    const body = await request.json().catch(() => ({}))
    const parsed = saveSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            'Payload de sauvegarde invalide.',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const input = parsed.data
    const currency = normalizeCurrency(input.currency)
    const newRate = extractRateValue(input.rate)

    if (!newRate) {
      return NextResponse.json(
        {
          error: `Taux invalide. La valeur doit être comprise entre ${MIN_RATE} et ${MAX_RATE}.`,
        },
        { status: 400 }
      )
    }

    const reason = String(input.reason || '').trim()
    const source = String(input.source || 'manuel').trim() || 'manuel'
    const updatedBy =
      adminUser?.email ||
      adminUser?.user?.email ||
      input.updated_by ||
      'admin'

    const supabase = await getSupabase()

    if (!supabase) {
      return NextResponse.json(
        { error: 'Service Supabase indisponible.' },
        { status: 503 }
      )
    }

    await applyDueScheduledRates(supabase, currency)

    const currentRaw = await getCurrentRateRow(supabase, currency)
    const currentPoint = currentRaw
      ? toCurrentPoint(currentRaw, currency)
      : null

    let oldRate =
      currentPoint?.rate ??
      extractRateValue(input.previous_rate) ??
      null

    if (oldRate == null) {
      const settingsRate = await getSettingsRate(supabase, currency)
      oldRate = settingsRate?.rate ?? null
    }

    const changePercent = computeChangePercent(oldRate, newRate)

    if (
      Math.abs(changePercent) >= REASON_THRESHOLD_PERCENT &&
      reason.length === 0
    ) {
      return NextResponse.json(
        {
          error: `Une raison est obligatoire pour une variation supérieure ou égale à ${REASON_THRESHOLD_PERCENT}%.`,
          change_percent: Number(changePercent.toFixed(2)),
        },
        { status: 400 }
      )
    }

    let appliesAtDate: Date | null = null

    if (input.applies_at) {
      appliesAtDate = new Date(input.applies_at)

      if (Number.isNaN(appliesAtDate.getTime())) {
        return NextResponse.json(
          { error: 'Date d’application invalide.' },
          { status: 400 }
        )
      }
    }

    const isFuture =
      appliesAtDate != null &&
      appliesAtDate.getTime() > Date.now() + 60_000

    /* ------------------------------------------------------------ */
    /* Cas programmé                                                 */
    /* ------------------------------------------------------------ */

    if (isFuture && appliesAtDate) {
      const effectiveAt = appliesAtDate.toISOString()

      const payload = {
        currency,
        rate: newRate,
        source,
        note: reason || 'Taux programmé',
        updated_by: updatedBy,
        effective_at: effectiveAt,
      }

      // Priorité : table historique dédiée
      let scheduledOk = await insertRateRow(
        supabase,
        'exchange_rate_history',
        payload,
        { allowUpdateOnDuplicate: false }
      )

      // Fallback : exchange_rates append-only
      if (!scheduledOk) {
        scheduledOk = await insertRateRow(
          supabase,
          'exchange_rates',
          payload,
          { allowUpdateOnDuplicate: false }
        )
      }

      if (!scheduledOk) {
        return NextResponse.json(
          {
            error:
              'Impossible de programmer un taux futur. Crée la table exchange_rate_history ou utilise exchange_rates en mode historique (plusieurs lignes par currency).',
          },
          { status: 500 }
        )
      }

      await insertAuditRow(supabase, {
        currency,
        old_rate: oldRate,
        new_rate: newRate,
        reason: reason || 'Taux programmé',
        source,
        action: 'scheduled',
        user_email: updatedBy,
        metadata: {
          applies_at: effectiveAt,
          change_percent: Number(changePercent.toFixed(2)),
        },
      })

      return NextResponse.json(
        {
          success: true,
          scheduled: true,
          currency,
          previous_rate: oldRate,
          new_rate: newRate,
          change_percent: Number(changePercent.toFixed(2)),
          applies_at: effectiveAt,
          current: currentPoint,
        },
        { status: 200 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Cas immédiat                                                  */
    /* ------------------------------------------------------------ */

    const effectiveAt =
      appliesAtDate && appliesAtDate.getTime() <= Date.now() + 60_000
        ? appliesAtDate.toISOString()
        : nowIso()

    const payload = {
      currency,
      rate: newRate,
      source,
      note: reason || null,
      updated_by: updatedBy,
      effective_at: effectiveAt,
    }

    const currentOk = await saveCurrentRate(supabase, payload)

    // Historique optionnel
    const historyOk = await insertRateRow(
      supabase,
      'exchange_rate_history',
      payload,
      { allowUpdateOnDuplicate: false }
    )

    // Compatibilité settings
    const settingsOk = await upsertSettingsRate(supabase, currency, newRate, {
      source,
      reason: reason || null,
    })

    if (!currentOk && !settingsOk) {
      return NextResponse.json(
        {
          error:
            'Impossible d’enregistrer le taux. Vérifie les tables exchange_rates / settings.',
        },
        { status: 500 }
      )
    }

    await insertAuditRow(supabase, {
      currency,
      old_rate: oldRate,
      new_rate: newRate,
      reason: reason || null,
      source,
      action: oldRate ? 'updated' : 'created',
      user_email: updatedBy,
      metadata: {
        change_percent: Number(changePercent.toFixed(2)),
        updated_current_table: currentOk,
        inserted_history: historyOk,
        updated_settings: settingsOk,
      },
    })

    return NextResponse.json(
      {
        success: true,
        scheduled: false,
        currency,
        previous_rate: oldRate,
        new_rate: newRate,
        change_percent: Number(changePercent.toFixed(2)),
        current: {
          currency,
          rate: newRate,
          updated_at: effectiveAt,
          effective_at: effectiveAt,
          source,
          note: reason || null,
          updated_by: updatedBy,
        },
      },
      { status: 200 }
    )
  } catch (err: any) {
    log.error?.(`${method} /api/admin/exchange-rate error`, err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Erreur lors de la sauvegarde du taux de change.',
      },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  return handleSave(request, 'PUT')
}

export async function POST(request: Request) {
  return handleSave(request, 'POST')
}