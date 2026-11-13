// app/api/admin/codes/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createServiceClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import logger from '@/lib/logger'
import {
  checkRateLimit,
  applyRateLimitHeaders,
} from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PROMO_TABLE_CANDIDATES = ['promo_codes', 'codes_promo'] as const

const PROMO_COLUMN_CANDIDATES = [
  'id',
  'code',

  'type',
  'kind',
  'discount_type',

  'value',
  'value_usd',
  'value_cdf',
  'reduction_percent',
  'valeur',
  'discount',

  'min_total_usd',
  'minTotalUsd',
  'min_total_cdf',
  'min_total',

  'max_discount_usd',
  'maxDiscountUsd',
  'max_discount_cdf',
  'max_discount',

  'max_utilisations',
  'max_utilisation',
  'utilisations_actuelles',
  'utilisation_actuelle',

  'actif',
  'active',

  'expires_at',
  'expiresAt',
  'expiration_date',

  'description',

  'created_at',
  'updated_at',

  'exchange_rate',
  'currency',
  'usd_source',
] as const

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 100

const STATUS_POOL_LIMIT = 2000
const STATS_POOL_LIMIT = 2000

const CACHE_TTL_MS = 15_000
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000
const RATE_CACHE_TTL_MS = 30_000

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

const responseCache = new Map<string, { data: any; timestamp: number }>()

const schemaCache: {
  tableName: string | null
  resolvedAt: number
  availableColumns: Set<string> | null
  resolvedColumnsAt: number
} = {
  tableName: null,
  resolvedAt: 0,
  availableColumns: null,
  resolvedColumnsAt: 0,
}

let cachedServerRate: {
  value: number | null
  expiresAt: number
} | null = null

function getCached(key: string): any | null {
  const entry = responseCache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key)
    return null
  }

  return entry.data
}

function setCached(key: string, data: any): void {
  responseCache.set(key, { data, timestamp: Date.now() })
}

function invalidateCache(): void {
  responseCache.clear()
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function parseFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return null

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) ? n : null
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value + Number.EPSILON)
}

function toUsd(cdf: number, rate: number): number {
  if (!Number.isFinite(cdf) || cdf < 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return round2(cdf / rate)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return roundCdf(usd * rate)
}

/**
 * USD : autorise 0.
 */
function explicitUsd(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return round2(n)
    }
  }

  return null
}

/**
 * CDF : autorise 0.
 */
function explicitCdf(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return roundCdf(n)
    }
  }

  return null
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)
    if (n != null) return n
  }

  return null
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined) return value
  }

  return undefined
}

function normalizeTypeInput(value: unknown): 'percent' | 'fixed' {
  const raw = String(value ?? 'percent').trim().toLowerCase()

  if (raw === 'fixed' || raw === 'fixe' || raw === 'montant_fixe') {
    return 'fixed'
  }

  return 'percent'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TAUX SERVEUR                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function resolveRateFromRow(row: any): number | null {
  const candidates = [
    row?.rate,
    row?.usd_rate,
    row?.taux,
    row?.value,
    row?.data?.rate,
    row?.current?.rate,
  ]

  for (const candidate of candidates) {
    const n = parseFiniteNumber(candidate)

    if (n != null && n > 0) {
      return round2(n)
    }
  }

  return null
}

async function getServerUsdRate(supabase: any): Promise<number | null> {
  if (!supabase) return null

  const now = Date.now()

  if (cachedServerRate && cachedServerRate.expiresAt > now) {
    return cachedServerRate.value
  }

  const attempts = [
    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .eq('currency', 'USD')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .eq('devise', 'USD')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .limit(1)
        .maybeSingle(),
  ]

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt()

      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data
        const rate = resolveRateFromRow(row)

        cachedServerRate = {
          value: rate,
          expiresAt: now + RATE_CACHE_TTL_MS,
        }

        return rate
      }

      if (isMissingTableError(error)) {
        cachedServerRate = {
          value: null,
          expiresAt: now + RATE_CACHE_TTL_MS,
        }

        return null
      }

      if (isMissingColumnError(error)) {
        continue
      }
    } catch (err) {
      logger.error?.('Exception lecture exchange_rates admin codes', err)
    }
  }

  cachedServerRate = {
    value: null,
    expiresAt: now + RATE_CACHE_TTL_MS,
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  USD / CDF RESOLUTION                                           */
/* ═══════════════════════════════════════════════════════════════ */

interface MoneyPair {
  usd: number
  cdf: number | null
  cdfKnown: boolean
  source:
    | 'USD'
    | 'CDF_CONVERTED'
    | 'CDF_LEGACY'
    | 'NONE'
}

/**
 * Règle absolue :
 * - Si USD existe (y compris 0) → USD = vérité.
 *   CDF = USD × taux serveur.
 *   Si USD = 0, CDF = 0 même sans taux.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux serveur.
 *
 * - Si CDF seul et taux indisponible → lecture tolérée en fallback.
 *
 * - 0 CDF = 0 USD, quelle que soit la devise.
 *
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number | null,
  cdfSource: number | null,
  rate: number | null
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (usdSource != null) {
    const usd = round2(usdSource)

    if (usd === 0) {
      return {
        usd: 0,
        cdf: 0,
        cdfKnown: true,
        source: 'USD',
      }
    }

    if (rateOk) {
      return {
        usd,
        cdf: roundCdf(toCdf(usd, rateNum)),
        cdfKnown: true,
        source: 'USD',
      }
    }

    return {
      usd,
      cdf: cdfSource != null ? roundCdf(cdfSource) : null,
      cdfKnown: cdfSource != null,
      source: 'USD',
    }
  }

  if (cdfSource != null) {
    const cdf = roundCdf(cdfSource)

    if (cdf === 0) {
      return {
        usd: 0,
        cdf: 0,
        cdfKnown: true,
        source: 'USD',
      }
    }

    if (rateOk) {
      const usd = round2(toUsd(cdf, rateNum))

      return {
        usd,
        cdf,
        cdfKnown: true,
        source: 'CDF_CONVERTED',
      }
    }

    return {
      usd: 0,
      cdf,
      cdfKnown: true,
      source: 'CDF_LEGACY',
    }
  }

  return {
    usd: 0,
    cdf: null,
    cdfKnown: false,
    source: 'NONE',
  }
}

function getValueMoneySources(row: any): {
  usd: number | null
  cdf: number | null
} {
  const explicitValueUsd = explicitUsd(row?.value_usd)
  const explicitValueCdf = explicitCdf(row?.value_cdf)
  const legacyValue = firstFinite(
    row?.value,
    row?.valeur,
    row?.discount
  )

  let usd = explicitValueUsd
  let cdf = explicitValueCdf

  if (usd == null) {
    const currency = String(row?.currency || '').toUpperCase()
    const usdSourceFlag = row?.usd_source

    if (currency === 'CDF' || usdSourceFlag === false) {
      cdf = cdf ?? legacyValue
    } else {
      usd = legacyValue
    }
  }

  return { usd, cdf }
}

function getMinTotalSources(row: any): {
  usd: number | null
  cdf: number | null
} {
  return {
    usd: explicitUsd(row?.min_total_usd, row?.minTotalUsd),
    cdf: explicitCdf(row?.min_total_cdf, row?.min_total),
  }
}

function getMaxDiscountSources(row: any): {
  usd: number | null
  cdf: number | null
} {
  return {
    usd: explicitUsd(row?.max_discount_usd, row?.maxDiscountUsd),
    cdf: explicitCdf(row?.max_discount_cdf, row?.max_discount),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE ERROR HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('relation') ||
    String(error?.code || '') === '42P01'
  )
}

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || '')

  return (
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message) ||
    /is not a column/i.test(message) ||
    String(error?.code || '') === '42703'
  )
}

function extractMissingColumnName(message: string): string | null {
  const patterns = [
    /column\s+"?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)"?\s+does not exist/i,
    /Could not find the\s+'([a-zA-Z_][a-zA-Z0-9_]*)'\s+column/i,
    /"([a-zA-Z_][a-zA-Z0-9_]*)"\s+is not a column/i,
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

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE CLIENT / SCHEMA                                       */
/* ═══════════════════════════════════════════════════════════════ */

async function getSupabase(): Promise<any | null> {
  try {
    const raw = createServiceClient()
    return raw instanceof Promise ? await raw : raw
  } catch (err: any) {
    logger.error?.('Impossible de créer le client Supabase service', err)
    return null
  }
}

async function resolvePromoTable(supabase: any): Promise<string | null> {
  if (!supabase) return null

  if (
    schemaCache.tableName &&
    Date.now() - schemaCache.resolvedAt < SCHEMA_CACHE_TTL_MS
  ) {
    return schemaCache.tableName
  }

  for (const candidate of PROMO_TABLE_CANDIDATES) {
    try {
      const { error } = await supabase
        .from(candidate)
        .select('code')
        .limit(1)

      if (!error) {
        schemaCache.tableName = candidate
        schemaCache.resolvedAt = Date.now()
        schemaCache.availableColumns = null
        schemaCache.resolvedColumnsAt = 0
        return candidate
      }

      if (!isMissingTableError(error)) {
        logger.warn?.(
          `Table promo candidate "${candidate}" erreur inattendue`,
          error
        )
      }
    } catch (err: any) {
      logger.warn?.(
        `Exception résolution table promo "${candidate}"`,
        err
      )
    }
  }

  return null
}

async function detectAvailableColumns(
  supabase: any,
  tableName: string
): Promise<Set<string>> {
  if (
    schemaCache.availableColumns &&
    schemaCache.tableName === tableName &&
    Date.now() - schemaCache.resolvedColumnsAt < SCHEMA_CACHE_TTL_MS
  ) {
    return schemaCache.availableColumns
  }

  let remaining: string[] = [...PROMO_COLUMN_CANDIDATES]

  for (let attempt = 0; attempt < PROMO_COLUMN_CANDIDATES.length + 8; attempt++) {
    if (remaining.length === 0) break

    const selectStr = remaining.join(',')

    try {
      const { error } = await supabase
        .from(tableName)
        .select(selectStr)
        .eq('code', '__schema_probe__')
        .limit(1)

      if (!error) {
        const set = new Set(remaining)
        schemaCache.availableColumns = set
        schemaCache.resolvedColumnsAt = Date.now()
        schemaCache.tableName = tableName
        return set
      }

      if (isMissingColumnError(error)) {
        const missing = extractMissingColumnName(String(error.message || ''))

        if (missing && remaining.includes(missing)) {
          remaining = remaining.filter((col) => col !== missing)
          continue
        }
      }

      break
    } catch (err: any) {
      logger.warn?.('Exception détection colonnes promo', err)
      break
    }
  }

  const fallbackSet = new Set(remaining)

  schemaCache.availableColumns = fallbackSet
  schemaCache.resolvedColumnsAt = Date.now()
  schemaCache.tableName = tableName

  return fallbackSet
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION PROMOS                                           */
/* ═══════════════════════════════════════════════════════════════ */

function normalizePromoRow(row: any, rate: number | null): any {
  if (!row) return null

  const type = normalizeTypeInput(
    row.type ?? row.kind ?? row.discount_type
  )

  let value: number | null = null
  let value_usd: number | null = null
  let value_cdf: number | null = null
  let reduction_percent: number | null = null
  let valueSource: MoneyPair['source'] = 'NONE'

  if (type === 'percent') {
    const pct = firstFinite(
      row.reduction_percent,
      row.value,
      row.valeur,
      row.discount
    )

    value = pct != null ? round2(Math.max(0, pct)) : 0
    reduction_percent = value
    valueSource = 'USD'
  } else {
    const sources = getValueMoneySources(row)
    const pair = resolvePricePair(sources.usd, sources.cdf, rate)

    valueSource = pair.source

    if (pair.source === 'CDF_LEGACY' && pair.usd === 0 && pair.cdf === 0) {
      value = 0
      value_usd = 0
      value_cdf = 0
    } else if (pair.source === 'CDF_LEGACY') {
      value = null
      value_usd = null
      value_cdf = pair.cdf
    } else {
      value = pair.usd
      value_usd = pair.usd
      value_cdf = pair.cdf
    }
  }

  const minSources = getMinTotalSources(row)
  const minPair = resolvePricePair(minSources.usd, minSources.cdf, rate)

  const minTotalUsd =
    minPair.source === 'CDF_LEGACY' && minPair.usd === 0 && minPair.cdf === 0
      ? 0
      : minPair.source === 'CDF_LEGACY'
        ? null
        : minPair.usd

  const minTotalCdf = minPair.cdfKnown ? minPair.cdf : null
  const minTotalLegacy = minPair.cdfKnown ? minPair.cdf : null

  const maxSources = getMaxDiscountSources(row)
  const maxPair = resolvePricePair(maxSources.usd, maxSources.cdf, rate)

  const maxDiscountUsd =
    maxPair.source === 'CDF_LEGACY' && maxPair.usd === 0 && maxPair.cdf === 0
      ? 0
      : maxPair.source === 'CDF_LEGACY'
        ? null
        : maxPair.usd

  const maxDiscountCdf = maxPair.cdfKnown ? maxPair.cdf : null
  const maxDiscountLegacy = maxPair.cdfKnown ? maxPair.cdf : null

  const maxU = parseFiniteNumber(
    row.max_utilisations ?? row.max_utilisation
  )

  const max_utilisations =
    maxU != null && maxU >= 0 ? Math.floor(maxU) : 1

  const usedU = parseFiniteNumber(
    row.utilisations_actuelles ?? row.utilisation_actuelle
  )

  const utilisations_actuelles =
    usedU != null && usedU >= 0 ? Math.floor(usedU) : 0

  const actif =
    typeof row.actif === 'boolean'
      ? row.actif
      : typeof row.active === 'boolean'
        ? row.active
        : true

  const expires_at =
    row.expires_at ??
    row.expiresAt ??
    row.expiration_date ??
    null

  return {
    id: row.id,
    code: String(row.code ?? '').toUpperCase(),

    type,
    value,
    value_usd,
    value_cdf,
    reduction_percent,

    min_total_usd: minTotalUsd,
    min_total_cdf: minTotalCdf,
    min_total: minTotalLegacy,

    max_discount_usd: maxDiscountUsd,
    max_discount_cdf: maxDiscountCdf,
    max_discount: maxDiscountLegacy,

    max_utilisations,
    utilisations_actuelles,

    actif,
    expires_at,

    description: row.description ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,

    exchange_rate: rate,
    currency: 'USD',
    usd_source: true,

    money_sources: {
      value: valueSource,
      min_total: minPair.source,
      max_discount: maxPair.source,
    },
  }
}

function isExpiredPromo(promo: any): boolean {
  if (!promo?.expires_at) return false
  return new Date(promo.expires_at) < new Date()
}

function isExhaustedPromo(promo: any): boolean {
  const max = Number(promo?.max_utilisations ?? 0)
  const used = Number(promo?.utilisations_actuelles ?? 0)

  if (max <= 0) return false

  return used >= max
}

function getPromoStatus(promo: any): 'actif' | 'inactif' | 'epuise' | 'expire' {
  if (!promo?.actif) return 'inactif'
  if (isExpiredPromo(promo)) return 'expire'
  if (isExhaustedPromo(promo)) return 'epuise'
  return 'actif'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ÉCRITURE : RÉSOLUTION MONEY SÉCURISÉE                          */
/* ═══════════════════════════════════════════════════════════════ */

interface WriteMoneyResult {
  usd: number | null
  cdf: number | null
  source: MoneyPair['source']
}

function resolveWriteMoney(
  label: string,
  usdInput: unknown,
  cdfInput: unknown,
  rate: number | null,
  required: boolean
): { money: WriteMoneyResult | null; errors: string[] } {
  const errors: string[] = []

  const hasUsd = usdInput !== undefined
  const hasCdf = cdfInput !== undefined

  if (!hasUsd && !hasCdf) {
    if (required) {
      errors.push(`${label} requis.`)
    }

    return { money: null, errors }
  }

  const usdRaw = usdInput === null ? 0 : usdInput
  const cdfRaw = cdfInput === null ? 0 : cdfInput

  const usdNum = hasUsd ? parseFiniteNumber(usdRaw) : null
  const cdfNum = hasCdf ? parseFiniteNumber(cdfRaw) : null

  if (hasUsd && (usdNum == null || usdNum < 0)) {
    errors.push(`${label} USD invalide.`)
  }

  if (hasCdf && (cdfNum == null || cdfNum < 0)) {
    errors.push(`${label} CDF invalide.`)
  }

  if (errors.length > 0) {
    return { money: null, errors }
  }

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (usdNum != null) {
    const usd = round2(usdNum)

    const cdf =
      usd === 0
        ? 0
        : rateOk
          ? roundCdf(toCdf(usd, rateNum))
          : null

    return {
      money: {
        usd,
        cdf,
        source: 'USD',
      },
      errors,
    }
  }

  if (cdfNum != null) {
    const cdf = roundCdf(cdfNum)

    if (cdf === 0) {
      return {
        money: {
          usd: 0,
          cdf: 0,
          source: 'USD',
        },
        errors,
      }
    }

    if (rateOk) {
      return {
        money: {
          usd: round2(toUsd(cdf, rateNum)),
          cdf,
          source: 'CDF_CONVERTED',
        },
        errors,
      }
    }

    errors.push(
      `${label} fourni uniquement en CDF legacy, mais le taux USD/CDF est indisponible. Écriture refusée pour ne pas figer un CDF comme vérité.`
    )

    return { money: null, errors }
  }

  return { money: null, errors }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DATE EXPIRATION                                                */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeExpiresAt(
  value: unknown,
  errors: string[]
): string | null | undefined {
  if (value === undefined) return undefined

  if (value === null || value === '') return null

  const str = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const date = new Date(`${str}T23:59:59.999Z`)

    if (Number.isNaN(date.getTime())) {
      errors.push('Date d’expiration invalide.')
      return undefined
    }

    return date.toISOString()
  }

  const date = new Date(str)

  if (Number.isNaN(date.getTime())) {
    errors.push('Date d’expiration invalide.')
    return undefined
  }

  return date.toISOString()
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BUILD PAYLOAD ÉCRITURE TOLÉRANT                                */
/* ═══════════════════════════════════════════════════════════════ */

function buildPromoWritePayload(
  parsed: any,
  availableColumns: Set<string>,
  rate: number | null,
  mode: 'create' | 'update',
  effectiveType: 'percent' | 'fixed'
): { payload: Record<string, any>; errors: string[] } {
  const errors: string[] = []
  const payload: Record<string, any> = {}

  const shouldWriteType = mode === 'create' || parsed.type !== undefined

  if (shouldWriteType) {
    if (availableColumns.has('type')) {
      payload.type = effectiveType
    }

    if (availableColumns.has('kind')) {
      payload.kind = effectiveType
    }

    if (availableColumns.has('discount_type')) {
      payload.discount_type = effectiveType
    }
  }

  if (parsed.code !== undefined && availableColumns.has('code')) {
    payload.code = String(parsed.code).trim().toUpperCase()
  }

  /* ------------------------------------------------------------ */
  /* Valeur : percent ou fixed                                      */
  /* ------------------------------------------------------------ */

  if (effectiveType === 'percent') {
    const percentRaw = firstDefined(parsed.value, parsed.reduction_percent)
    const percentProvided = percentRaw !== undefined

    if (mode === 'create' || (shouldWriteType && !percentProvided)) {
      errors.push('La réduction en pourcentage est requise.')
    }

    if (percentProvided) {
      const pct = parseFiniteNumber(percentRaw)

      if (pct == null || pct < 1 || pct > 99) {
        errors.push('La réduction en pourcentage doit être entre 1 et 99.')
      } else {
        if (availableColumns.has('value')) {
          payload.value = round2(pct)
        }

        if (availableColumns.has('reduction_percent')) {
          payload.reduction_percent = round2(pct)
        }

        if (availableColumns.has('value_usd')) {
          payload.value_usd = null
        }

        if (availableColumns.has('value_cdf')) {
          payload.value_cdf = null
        }
      }
    }
  } else {
    const fixedUsd =
      parsed.value_usd !== undefined ? parsed.value_usd : parsed.value

    const fixedCdf = parsed.value_cdf

    const fixedProvided =
      parsed.value_usd !== undefined ||
      parsed.value !== undefined ||
      parsed.value_cdf !== undefined

    if (mode === 'create' || (shouldWriteType && !fixedProvided)) {
      errors.push('Le montant fixe USD est requis.')
    }

    if (fixedProvided) {
      const { money, errors: moneyErrors } = resolveWriteMoney(
        'Montant fixe USD',
        fixedUsd,
        fixedCdf,
        rate,
        mode === 'create'
      )

      errors.push(...moneyErrors)

      if (money) {
        if (money.usd != null) {
          if (mode === 'create' && money.usd <= 0) {
            errors.push('Le montant fixe USD doit être supérieur à 0.')
          }

          if (availableColumns.has('value')) {
            payload.value = money.usd
          }

          if (availableColumns.has('value_usd')) {
            payload.value_usd = money.usd
          }
        }

        if (money.cdf != null) {
          if (availableColumns.has('value_cdf')) {
            payload.value_cdf = money.cdf
          }
        }

        if (availableColumns.has('reduction_percent')) {
          payload.reduction_percent = 0
        }
      }
    }

    if (
      mode === 'create' &&
      !availableColumns.has('value') &&
      !availableColumns.has('value_usd')
    ) {
      errors.push(
        'La table promo ne possède pas de colonne exploitable pour un montant fixe (value ou value_usd).'
      )
    }
  }

  /* ------------------------------------------------------------ */
  /* Minimum panier                                                 */
  /* ------------------------------------------------------------ */

  const minUsd =
    parsed.min_total_usd !== undefined
      ? parsed.min_total_usd
      : parsed.minTotalUsd

  const minCdf = firstDefined(parsed.min_total_cdf, parsed.min_total)

  const minProvided =
    parsed.min_total_usd !== undefined ||
    parsed.minTotalUsd !== undefined ||
    parsed.min_total_cdf !== undefined ||
    parsed.min_total !== undefined

  if (mode === 'create' || minProvided) {
    const { money, errors: moneyErrors } = resolveWriteMoney(
      'Montant minimum',
      minUsd,
      minCdf,
      rate,
      false
    )

    errors.push(...moneyErrors)

    if (money) {
      if (money.usd != null) {
        if (availableColumns.has('min_total_usd')) {
          payload.min_total_usd = money.usd
        }

        if (availableColumns.has('minTotalUsd')) {
          payload.minTotalUsd = money.usd
        }
      }

      if (money.cdf != null) {
        if (availableColumns.has('min_total_cdf')) {
          payload.min_total_cdf = money.cdf
        }

        if (availableColumns.has('min_total')) {
          payload.min_total = money.cdf
        }
      }
    } else if (mode === 'create') {
      if (availableColumns.has('min_total_usd')) {
        payload.min_total_usd = 0
      }

      if (availableColumns.has('min_total')) {
        payload.min_total = 0
      }
    }
  } else if (mode === 'create') {
    if (availableColumns.has('min_total_usd')) {
      payload.min_total_usd = 0
    }

    if (availableColumns.has('min_total')) {
      payload.min_total = 0
    }
  }

  /* ------------------------------------------------------------ */
  /* Plafond réduction                                              */
  /* ------------------------------------------------------------ */

  const maxUsd =
    parsed.max_discount_usd !== undefined
      ? parsed.max_discount_usd
      : parsed.maxDiscountUsd

  const maxCdf = firstDefined(parsed.max_discount_cdf, parsed.max_discount)

  const maxProvided =
    parsed.max_discount_usd !== undefined ||
    parsed.maxDiscountUsd !== undefined ||
    parsed.max_discount_cdf !== undefined ||
    parsed.max_discount !== undefined

  if (mode === 'create' || maxProvided) {
    const { money, errors: moneyErrors } = resolveWriteMoney(
      'Plafond de réduction',
      maxUsd,
      maxCdf,
      rate,
      false
    )

    errors.push(...moneyErrors)

    if (money) {
      if (money.usd != null) {
        if (availableColumns.has('max_discount_usd')) {
          payload.max_discount_usd = money.usd
        }

        if (availableColumns.has('maxDiscountUsd')) {
          payload.maxDiscountUsd = money.usd
        }
      }

      if (money.cdf != null) {
        if (availableColumns.has('max_discount_cdf')) {
          payload.max_discount_cdf = money.cdf
        }

        if (availableColumns.has('max_discount')) {
          payload.max_discount = money.cdf
        }
      }
    } else if (mode === 'create') {
      if (availableColumns.has('max_discount_usd')) {
        payload.max_discount_usd = 0
      }

      if (availableColumns.has('max_discount')) {
        payload.max_discount = 0
      }
    }
  } else if (mode === 'create') {
    if (availableColumns.has('max_discount_usd')) {
      payload.max_discount_usd = 0
    }

    if (availableColumns.has('max_discount')) {
      payload.max_discount = 0
    }
  }

  /* ------------------------------------------------------------ */
  /* Utilisations max                                               */
  /* ------------------------------------------------------------ */

  if (parsed.max_utilisations !== undefined) {
    const n = parseFiniteNumber(parsed.max_utilisations)

    if (n == null || n < 0) {
      errors.push('max_utilisations invalide. 0 signifie illimité.')
    } else {
      const value = Math.floor(n)

      if (availableColumns.has('max_utilisations')) {
        payload.max_utilisations = value
      }

      if (availableColumns.has('max_utilisation')) {
        payload.max_utilisation = value
      }
    }
  } else if (mode === 'create') {
    if (availableColumns.has('max_utilisations')) {
      payload.max_utilisations = 1
    }

    if (availableColumns.has('max_utilisation')) {
      payload.max_utilisation = 1
    }
  }

  /* ------------------------------------------------------------ */
  /* Expiration                                                     */
  /* ------------------------------------------------------------ */

  const expiresRaw = firstDefined(
    parsed.expires_at,
    parsed.expiresAt,
    parsed.expiration_date
  )

  if (expiresRaw !== undefined) {
    const iso = normalizeExpiresAt(expiresRaw, errors)

    if (iso !== undefined) {
      if (availableColumns.has('expires_at')) {
        payload.expires_at = iso
      }

      if (availableColumns.has('expiresAt')) {
        payload.expiresAt = iso
      }

      if (availableColumns.has('expiration_date')) {
        payload.expiration_date = iso
      }
    }
  } else if (mode === 'create') {
    if (availableColumns.has('expires_at')) {
      payload.expires_at = null
    }

    if (availableColumns.has('expiresAt')) {
      payload.expiresAt = null
    }

    if (availableColumns.has('expiration_date')) {
      payload.expiration_date = null
    }
  }

  /* ------------------------------------------------------------ */
  /* Description                                                    */
  /* ------------------------------------------------------------ */

  if (parsed.description !== undefined) {
    if (availableColumns.has('description')) {
      payload.description =
        typeof parsed.description === 'string'
          ? parsed.description.trim() || null
          : null
    }
  } else if (mode === 'create') {
    if (availableColumns.has('description')) {
      payload.description = null
    }
  }

  /* ------------------------------------------------------------ */
  /* Actif                                                          */
  /* ------------------------------------------------------------ */

  const actifValue =
    parsed.actif !== undefined ? parsed.actif : parsed.active

  if (actifValue !== undefined) {
    const bool = Boolean(actifValue)

    if (availableColumns.has('actif')) {
      payload.actif = bool
    }

    if (availableColumns.has('active')) {
      payload.active = bool
    }
  } else if (mode === 'create') {
    if (availableColumns.has('actif')) {
      payload.actif = true
    }

    if (availableColumns.has('active')) {
      payload.active = true
    }
  }

  /* ------------------------------------------------------------ */
  /* Utilisations actuelles                                         */
  /* ------------------------------------------------------------ */

  if (mode === 'create') {
    if (availableColumns.has('utilisations_actuelles')) {
      payload.utilisations_actuelles = 0
    }

    if (availableColumns.has('utilisation_actuelle')) {
      payload.utilisation_actuelle = 0
    }
  }

  /* ------------------------------------------------------------ */
  /* Audit USD                                                      */
  /* ------------------------------------------------------------ */

  if (availableColumns.has('currency')) {
    payload.currency = 'USD'
  }

  if (availableColumns.has('usd_source')) {
    payload.usd_source = true
  }

  if (availableColumns.has('exchange_rate') && rate != null) {
    payload.exchange_rate = round2(rate)
  }

  return { payload, errors }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GÉNÉRATION DE CODES UNIQUES                                    */
/* ═══════════════════════════════════════════════════════════════ */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomSuffix(length: number): string {
  let out = ''

  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }

  return out
}

function generateRandomCode(prefix: string, totalLength = 10): string {
  const cleanPrefix = String(prefix || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)

  const suffixLength = Math.max(4, totalLength - cleanPrefix.length)

  return `${cleanPrefix}${randomSuffix(suffixLength)}`
}

async function ensureUniqueCodes(
  supabase: any,
  tableName: string,
  desiredCount: number,
  prefix: string
): Promise<string[]> {
  const unique = new Set<string>()
  let attempts = 0
  const maxAttempts = desiredCount * 8

  while (unique.size < desiredCount && attempts < maxAttempts) {
    attempts++

    const needed = desiredCount - unique.size
    const batch: string[] = []

    for (let i = 0; i < needed; i++) {
      batch.push(generateRandomCode(prefix, 10))
    }

    try {
      const { data: existing, error } = await supabase
        .from(tableName)
        .select('code')
        .in('code', batch)

      if (error) {
        logger.warn?.('Vérification unicité codes promo impossible', error)

        batch.forEach((code) => unique.add(code))
        break
      }

      const existingSet = new Set(
        (existing || []).map((row: any) => String(row.code).toUpperCase())
      )

      batch.forEach((code) => {
        if (!existingSet.has(code)) {
          unique.add(code)
        }
      })
    } catch (err: any) {
      logger.warn?.('Exception unicité codes promo', err)

      batch.forEach((code) => unique.add(code))
      break
    }
  }

  return Array.from(unique).slice(0, desiredCount)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  INSERT / UPDATE FALLBACK COLONNES MANQUANTES                   */
/* ═══════════════════════════════════════════════════════════════ */

async function insertWithColumnFallback(
  supabase: any,
  tableName: string,
  rows: Record<string, any>[]
): Promise<any[]> {
  let currentRows = rows.map((row) => ({ ...row }))

  for (let attempt = 0; attempt < 15; attempt++) {
    if (currentRows.length === 0) {
      throw new Error('Aucune donnée valide à insérer.')
    }

    const { data, error } = await supabase
      .from(tableName)
      .insert(currentRows)
      .select('*')

    if (!error) {
      return data || []
    }

    if (isMissingColumnError(error)) {
      const missing = extractMissingColumnName(String(error.message || ''))

      if (missing) {
        const before = currentRows

        currentRows = currentRows
          .map((row) => {
            const copy = { ...row }
            delete copy[missing]
            return copy
          })
          .filter((row) => Object.keys(row).length > 0)

        const changed =
          currentRows.length !== before.length ||
          currentRows.some(
            (row, index) =>
              Object.keys(row).length !== Object.keys(before[index] || {}).length
          )

        if (changed) {
          continue
        }
      }
    }

    throw error
  }

  throw new Error('Colonnes manquantes trop nombreuses pour l’insertion.')
}

async function updateWithColumnFallback(
  supabase: any,
  tableName: string,
  id: string,
  payload: Record<string, any>
): Promise<any> {
  let currentPayload = { ...payload }

  for (let attempt = 0; attempt < 15; attempt++) {
    if (Object.keys(currentPayload).length === 0) {
      throw new Error('Aucune donnée valide à mettre à jour.')
    }

    const { data, error } = await supabase
      .from(tableName)
      .update(currentPayload)
      .eq('id', id)
      .select('*')
      .single()

    if (!error) {
      return data
    }

    if (isMissingColumnError(error)) {
      const missing = extractMissingColumnName(String(error.message || ''))

      if (missing && missing in currentPayload) {
        delete currentPayload[missing]
        continue
      }
    }

    throw error
  }

  throw new Error('Colonnes manquantes trop nombreuses pour la mise à jour.')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS ZOD                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const moneyInput = z.coerce.number().min(0).nullable().optional()

const corePromoFields = {
  value: z.coerce.number().min(0).optional(),
  value_usd: moneyInput,
  value_cdf: moneyInput,
  reduction_percent: z.coerce.number().min(0).max(99).optional(),

  expires_at: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  expiration_date: z.string().nullable().optional(),

  min_total_usd: moneyInput,
  minTotalUsd: moneyInput,
  min_total_cdf: moneyInput,
  min_total: moneyInput,

  max_discount_usd: moneyInput,
  maxDiscountUsd: moneyInput,
  max_discount_cdf: moneyInput,
  max_discount: moneyInput,

  description: z.string().max(255).nullable().optional(),

  currency: z.string().optional(),
  usd_source: z.boolean().optional(),
}

const typeField = z.string().optional()
const maxUtilField = z.coerce.number().int().min(0).max(10000).optional()
const actifField = z.boolean().optional()
const activeField = z.boolean().optional()

const getQuerySchema = z.object({
  search: z.string().optional().default(''),
  statut: z
    .enum(['all', 'actif', 'inactif', 'epuise', 'expire'])
    .optional()
    .default('all'),
  sort_by: z
    .enum([
      'created_at',
      'code',
      'value',
      'reduction_percent',
      'utilisations_actuelles',
      'expires_at',
    ])
    .optional()
    .default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .optional()
    .default(DEFAULT_PAGE_SIZE),
})

const generateSchema = z.object({
  ...corePromoFields,

  mode: z.literal('generate').optional().default('generate'),
  count: z.coerce.number().int().min(1).max(100),
  prefix: z
    .string()
    .max(12)
    .regex(/^[A-Z0-9]*$/i, 'Préfixe : lettres et chiffres uniquement.')
    .optional()
    .default(''),

  type: typeField.default('percent'),
  max_utilisations: maxUtilField.default(1),
  actif: actifField.default(true),
  active: activeField.optional(),
})

const createSchema = z.object({
  ...corePromoFields,

  mode: z.literal('create').optional(),
  code: z
    .string()
    .min(3, 'Minimum 3 caractères')
    .max(30, 'Maximum 30 caractères')
    .regex(
      /^[A-Z0-9_-]+$/i,
      'Lettres, chiffres, tirets et underscores uniquement.'
    )
    .transform((value) => value.toUpperCase()),

  type: typeField.default('percent'),
  max_utilisations: maxUtilField.default(1),
  actif: actifField.default(true),
  active: activeField.optional(),
})

const updateSchema = z.object({
  id: z.string().uuid('ID invalide'),

  ...corePromoFields,

  code: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[A-Z0-9_-]+$/i)
    .transform((value) => value.toUpperCase())
    .optional(),

  type: typeField.optional(),
  max_utilisations: maxUtilField.optional(),
  actif: actifField.optional(),
  active: activeField.optional(),

  mode: z.string().optional(),
})

const deleteSchema = z.object({
  id: z.string().uuid('ID invalide'),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS REQUÊTE LECTURE                                        */
/* ═══════════════════════════════════════════════════════════════ */

function sanitizeSearchValue(value: string): string {
  return String(value || '')
    .replace(/[%_,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function applySearch(
  query: any,
  search: string,
  availableColumns: Set<string>
) {
  const safe = sanitizeSearchValue(search)

  if (!safe) return query

  const parts: string[] = []

  if (availableColumns.has('code')) {
    parts.push(`code.ilike.%${safe}%`)
  }

  if (availableColumns.has('description')) {
    parts.push(`description.ilike.%${safe}%`)
  }

  if (parts.length === 0) return query

  return query.or(parts.join(','))
}

function applySort(
  query: any,
  sortBy: string,
  sortOrder: string,
  availableColumns: Set<string>
) {
  const ascending = sortOrder === 'asc'

  let column = sortBy

  if (
    column === 'value' &&
    !availableColumns.has('value') &&
    availableColumns.has('reduction_percent')
  ) {
    column = 'reduction_percent'
  }

  if (!availableColumns.has(column)) {
    if (availableColumns.has('created_at')) {
      column = 'created_at'
    } else if (availableColumns.has('code')) {
      column = 'code'
    } else {
      return query
    }
  }

  return query.order(column, { ascending })
}

async function fetchPromoPool(
  supabase: any,
  tableName: string,
  search: string,
  availableColumns: Set<string>,
  limit: number
): Promise<any[]> {
  let query = supabase.from(tableName).select('*')

  query = applySearch(query, search, availableColumns)

  if (availableColumns.has('created_at')) {
    query = query.order('created_at', { ascending: false })
  } else if (availableColumns.has('code')) {
    query = query.order('code', { ascending: true })
  }

  query = query.limit(limit)

  const { data, error } = await query

  if (error) {
    logger.warn?.('Erreur pool promos', error)
    return []
  }

  return data || []
}

function sortNormalizedPromos(
  list: any[],
  sortBy: string,
  sortOrder: string
): any[] {
  const dir = sortOrder === 'asc' ? 1 : -1

  return [...list].sort((a, b) => {
    let cmp = 0

    switch (sortBy) {
      case 'code':
        cmp = String(a.code || '').localeCompare(String(b.code || ''))
        break

      case 'value':
      case 'reduction_percent':
        cmp =
          Number(a.value_usd ?? a.value ?? a.value_cdf ?? 0) -
          Number(b.value_usd ?? b.value ?? b.value_cdf ?? 0)
        break

      case 'utilisations_actuelles':
        cmp =
          Number(a.utilisations_actuelles ?? 0) -
          Number(b.utilisations_actuelles ?? 0)
        break

      case 'expires_at': {
        const aTime = a.expires_at
          ? new Date(a.expires_at).getTime()
          : Number.POSITIVE_INFINITY

        const bTime = b.expires_at
          ? new Date(b.expires_at).getTime()
          : Number.POSITIVE_INFINITY

        cmp = aTime - bTime
        break
      }

      case 'created_at':
      default: {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0

        cmp = aTime - bTime
        break
      }
    }

    return cmp * dir
  })
}

function paginateNormalizedPromos(
  list: any[],
  page: number,
  limit: number
): {
  data: any[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
} {
  const total = list.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const offset = (page - 1) * limit
  const safeOffset = Math.min(offset, Math.max(0, total - 1))

  return {
    data: list.slice(safeOffset, safeOffset + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  }
}

function computeStats(poolRaw: any[], rate: number | null): {
  total: number
  active: number
  used: number
  expiring_soon: number
} {
  const pool = poolRaw
    .map((row) => normalizePromoRow(row, rate))
    .filter(Boolean)

  const now = new Date()
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  let active = 0
  let used = 0
  let expiringSoon = 0

  for (const promo of pool) {
    used += Number(promo.utilisations_actuelles ?? 0)

    const status = getPromoStatus(promo)

    if (status === 'actif') {
      active++
    }

    if (promo.expires_at) {
      const expiry = new Date(promo.expires_at)

      if (expiry >= now && expiry <= inSevenDays) {
        expiringSoon++
      }
    }
  }

  return {
    total: pool.length,
    active,
    used,
    expiring_soon: expiringSoon,
  }
}

function filterByStatus(pool: any[], statut: string): any[] {
  if (statut === 'all') return pool

  return pool.filter((promo) => {
    const status = getPromoStatus(promo)

    if (statut === 'actif') return status === 'actif'
    if (statut === 'inactif') return status === 'inactif'
    if (statut === 'epuise') return status === 'epuise'
    if (statut === 'expire') return status === 'expire'

    return true
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Liste des codes promo                                    */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-codes-get:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin codes promo.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  const { searchParams } = new URL(request.url)

  const parsed = getQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  )

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Paramètres invalides',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const { search, statut, sort_by, sort_order, page, limit } = parsed.data

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json(
      {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        stats: { total: 0, active: 0, used: 0, expiring_soon: 0 },
      },
      { status: 200 }
    )
  }

  const tableName = await resolvePromoTable(supabase)

  if (!tableName) {
    logger.warn?.('Aucune table promo trouvée (promo_codes / codes_promo)')

    return NextResponse.json(
      {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        stats: { total: 0, active: 0, used: 0, expiring_soon: 0 },
      },
      { status: 200 }
    )
  }

  try {
    const rate = await getServerUsdRate(supabase)
    const availableColumns = await detectAvailableColumns(supabase, tableName)

    const cacheKey = `admin-codes-promo:${tableName}:${JSON.stringify(
      parsed.data
    )}:${rate ?? 'none'}`

    const cached = getCached(cacheKey)

    if (cached) {
      return NextResponse.json(cached)
    }

    const statsPoolRaw = await fetchPromoPool(
      supabase,
      tableName,
      '',
      availableColumns,
      STATS_POOL_LIMIT
    )

    const stats = computeStats(statsPoolRaw, rate)

    const needsServerPool =
      statut === 'actif' ||
      statut === 'epuise' ||
      statut === 'expire' ||
      statut === 'inactif'

    if (needsServerPool) {
      const poolRaw = await fetchPromoPool(
        supabase,
        tableName,
        search,
        availableColumns,
        STATUS_POOL_LIMIT
      )

      const pool = poolRaw
        .map((row) => normalizePromoRow(row, rate))
        .filter(Boolean)

      const filtered = filterByStatus(pool, statut)
      const sorted = sortNormalizedPromos(filtered, sort_by, sort_order)
      const paginated = paginateNormalizedPromos(sorted, page, limit)

      const response = {
        data: paginated.data,
        pagination: paginated.pagination,
        stats,
      }

      setCached(cacheKey, response)

      return NextResponse.json(response)
    }

    let query = supabase
      .from(tableName)
      .select('*', { count: 'exact' })

    query = applySearch(query, search, availableColumns)

    if (statut === 'inactif') {
      if (availableColumns.has('actif')) {
        query = query.eq('actif', false)
      } else if (availableColumns.has('active')) {
        query = query.eq('active', false)
      }
    }

    query = applySort(query, sort_by, sort_order, availableColumns)

    const offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    const { data: rows, error, count } = await query

    if (error) {
      logger.warn?.('Erreur GET direct codes promo, fallback pool', error)

      const poolRaw = await fetchPromoPool(
        supabase,
        tableName,
        search,
        availableColumns,
        STATUS_POOL_LIMIT
      )

      const pool = poolRaw
        .map((row) => normalizePromoRow(row, rate))
        .filter(Boolean)

      const filtered = filterByStatus(pool, statut)
      const sorted = sortNormalizedPromos(filtered, sort_by, sort_order)
      const paginated = paginateNormalizedPromos(sorted, page, limit)

      const response = {
        data: paginated.data,
        pagination: paginated.pagination,
        stats,
      }

      setCached(cacheKey, response)

      return NextResponse.json(response)
    }

    const normalized = (rows || [])
      .map((row: any) => normalizePromoRow(row, rate))
      .filter(Boolean)

    const total = Number(count ?? normalized.length ?? 0)

    const response = {
      data: normalized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      stats,
    }

    setCached(cacheKey, response)

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error?.('Crash GET admin/codes', error)

    return NextResponse.json(
      {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        stats: { total: 0, active: 0, used: 0, expiring_soon: 0 },
      },
      { status: 200 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST – Génération en masse OU création manuelle                */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-codes-post:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin création codes promo.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Corps JSON invalide' },
      { status: 400 }
    )
  }

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json(
      { error: 'Service Supabase indisponible.' },
      { status: 503 }
    )
  }

  const tableName = await resolvePromoTable(supabase)

  if (!tableName) {
    return NextResponse.json(
      { error: 'Aucune table promo disponible (promo_codes / codes_promo).' },
      { status: 500 }
    )
  }

  const rate = await getServerUsdRate(supabase)
  const availableColumns = await detectAvailableColumns(supabase, tableName)

  if (!availableColumns.has('code')) {
    return NextResponse.json(
      { error: 'La table promo ne possède pas de colonne code exploitable.' },
      { status: 500 }
    )
  }

  const isGenerate =
    body?.mode === 'generate' ||
    (body?.count != null && body?.code == null)

  const isCreate =
    body?.mode === 'create' ||
    (body?.code != null && body?.count == null)

  /* ------------------------------------------------------------ */
  /* Génération en masse                                            */
  /* ------------------------------------------------------------ */

  if (isGenerate) {
    const parsed = generateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const effectiveType = normalizeTypeInput(parsed.data.type)

    const codes = await ensureUniqueCodes(
      supabase,
      tableName,
      Number(parsed.data.count),
      String(parsed.data.prefix || '')
    )

    if (codes.length === 0) {
      return NextResponse.json(
        { error: 'Impossible de générer des codes uniques.' },
        { status: 500 }
      )
    }

    const built = buildPromoWritePayload(
      { ...parsed.data, code: 'TEMP_CODE_FOR_VALIDATION' },
      availableColumns,
      rate,
      'create',
      effectiveType
    )

    if (built.errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: built.errors,
        },
        { status: 400 }
      )
    }

    const rows = codes.map((code) => ({
      ...built.payload,
      code: String(code).toUpperCase(),
    }))

    try {
      const inserted = await insertWithColumnFallback(
        supabase,
        tableName,
        rows
      )

      invalidateCache()

      return NextResponse.json(
        {
          codes: inserted
            .map((row: any) => normalizePromoRow(row, rate))
            .filter(Boolean),
          count: inserted.length,
        },
        { status: 201 }
      )
    } catch (error: any) {
      logger.error?.('Crash POST generate admin/codes', error)

      return NextResponse.json(
        {
          error:
            error?.message || 'Erreur lors de la génération des codes.',
        },
        { status: 500 }
      )
    }
  }

  /* ------------------------------------------------------------ */
  /* Création manuelle                                              */
  /* ------------------------------------------------------------ */

  if (isCreate) {
    const parsed = createSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const effectiveType = normalizeTypeInput(parsed.data.type)

    try {
      const { data: existing } = await supabase
        .from(tableName)
        .select('id')
        .eq('code', parsed.data.code)
        .maybeSingle()

      if (existing) {
        return NextResponse.json(
          { error: `Le code "${parsed.data.code}" existe déjà.` },
          { status: 409 }
        )
      }
    } catch (err: any) {
      logger.warn?.('Vérification doublon code promo impossible', err)
    }

    const built = buildPromoWritePayload(
      parsed.data,
      availableColumns,
      rate,
      'create',
      effectiveType
    )

    if (built.errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: built.errors,
        },
        { status: 400 }
      )
    }

    try {
      const inserted = await insertWithColumnFallback(
        supabase,
        tableName,
        [built.payload]
      )

      invalidateCache()

      return NextResponse.json(
        {
          code: normalizePromoRow(inserted[0], rate),
        },
        { status: 201 }
      )
    } catch (error: any) {
      logger.error?.('Crash POST create admin/codes', error)

      return NextResponse.json(
        {
          error:
            error?.message || 'Erreur lors de la création du code.',
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json(
    { error: 'Mode invalide. Utilisez mode=generate ou mode=create.' },
    { status: 400 }
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUT – Toggle actif OU édition complète                         */
/* ═══════════════════════════════════════════════════════════════ */

export async function PUT(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-codes-put:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin mise à jour codes promo.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Corps JSON invalide' },
      { status: 400 }
    )
  }

  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Données invalides',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json(
      { error: 'Service Supabase indisponible.' },
      { status: 503 }
    )
  }

  const tableName = await resolvePromoTable(supabase)

  if (!tableName) {
    return NextResponse.json(
      { error: 'Aucune table promo disponible.' },
      { status: 500 }
    )
  }

  const rate = await getServerUsdRate(supabase)
  const availableColumns = await detectAvailableColumns(supabase, tableName)

  try {
    const { data: current, error: currentError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (currentError) throw currentError

    if (!current) {
      return NextResponse.json(
        { error: 'Code promo introuvable.' },
        { status: 404 }
      )
    }

    const currentNormalized = normalizePromoRow(current, rate)
    const alreadyUsed =
      Number(currentNormalized.utilisations_actuelles ?? 0) > 0

    const allowedToggleKeys = new Set([
      'id',
      'actif',
      'active',
      'mode',
    ])

    const isToggleOnly =
      (parsed.data.actif !== undefined ||
        parsed.data.active !== undefined) &&
      Object.entries(parsed.data).every(
        ([key, value]) =>
          value === undefined || allowedToggleKeys.has(key)
      )

    if (isToggleOnly) {
      if (
        !availableColumns.has('actif') &&
        !availableColumns.has('active')
      ) {
        return NextResponse.json(
          {
            error:
              'Aucune colonne actif/active disponible pour mettre à jour le statut.',
          },
          { status: 500 }
        )
      }

      const actifValue =
        parsed.data.actif !== undefined
          ? parsed.data.actif
          : parsed.data.active

      const payload: Record<string, any> = {}

      if (availableColumns.has('actif')) {
        payload.actif = Boolean(actifValue)
      }

      if (availableColumns.has('active')) {
        payload.active = Boolean(actifValue)
      }

      const updated = await updateWithColumnFallback(
        supabase,
        tableName,
        parsed.data.id,
        payload
      )

      invalidateCache()

      return NextResponse.json({
        success: true,
        actif: Boolean(actifValue),
        code: normalizePromoRow(updated, rate),
      })
    }

    if (parsed.data.code !== undefined && alreadyUsed) {
      return NextResponse.json(
        {
          error:
            'Impossible de modifier le code d’une promotion déjà utilisée. Modifiez plutôt ses paramètres ou désactivez-la.',
        },
        { status: 400 }
      )
    }

    if (parsed.data.code !== undefined) {
      const { data: duplicate } = await supabase
        .from(tableName)
        .select('id')
        .eq('code', parsed.data.code)
        .neq('id', parsed.data.id)
        .maybeSingle()

      if (duplicate) {
        return NextResponse.json(
          { error: `Le code "${parsed.data.code}" existe déjà.` },
          { status: 409 }
        )
      }
    }

    const effectiveType =
      parsed.data.type !== undefined
        ? normalizeTypeInput(parsed.data.type)
        : normalizeTypeInput(currentNormalized.type)

    const built = buildPromoWritePayload(
      parsed.data,
      availableColumns,
      rate,
      'update',
      effectiveType
    )

    if (built.errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: built.errors,
        },
        { status: 400 }
      )
    }

    if (Object.keys(built.payload).length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucune modification.',
        code: currentNormalized,
      })
    }

    const updated = await updateWithColumnFallback(
      supabase,
      tableName,
      parsed.data.id,
      built.payload
    )

    invalidateCache()

    return NextResponse.json({
      success: true,
      code: normalizePromoRow(updated, rate),
    })
  } catch (error: any) {
    logger.error?.('Crash PUT admin/codes', error)

    return NextResponse.json(
      {
        error:
          error?.message || 'Erreur lors de la mise à jour.',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE – Suppression protégée                                  */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-codes-delete:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin suppression codes promo.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const parsed = deleteSchema.safeParse({ id })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ID du code requis (UUID valide).' },
      { status: 400 }
    )
  }

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json(
      { error: 'Service Supabase indisponible.' },
      { status: 503 }
    )
  }

  const tableName = await resolvePromoTable(supabase)

  if (!tableName) {
    return NextResponse.json(
      { error: 'Aucune table promo disponible.' },
      { status: 500 }
    )
  }

  try {
    const rate = await getServerUsdRate(supabase)

    const { data: current, error: currentError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (currentError) throw currentError

    if (!current) {
      return NextResponse.json(
        { error: 'Code promo introuvable.' },
        { status: 404 }
      )
    }

    const normalized = normalizePromoRow(current, rate)
    const used = Number(normalized.utilisations_actuelles ?? 0)

    if (used > 0) {
      return NextResponse.json(
        {
          error:
            'Impossible de supprimer un code déjà utilisé. Désactivez-le plutôt pour préserver l’historique.',
        },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', parsed.data.id)

    if (error) throw error

    invalidateCache()

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error?.('Crash DELETE admin/codes', error)

    return NextResponse.json(
      {
        error:
          error?.message || 'Erreur lors de la suppression.',
      },
      { status: 500 }
    )
  }
}