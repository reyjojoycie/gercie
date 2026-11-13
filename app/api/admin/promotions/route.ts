// app/api/admin/promotions/route.ts
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

const PROMO_TABLE = 'promotions'
const PRODUCT_TABLE = 'produits'

const PROMO_COLUMN_CANDIDATES = [
  'id',

  'produit_id',
  'categorie_id',
  'produit_cadeau_id',

  'type_promo',

  'prix_promo',
  'prix_promo_usd',
  'prix_promo_cdf',

  'valeur_pourcentage',

  'description',

  'date_debut',
  'date_fin',

  'actif',
  'active',

  'quantite_min',
  'cumulable',

  'banniere_url',

  'created_at',
  'updated_at',

  'exchange_rate',
  'currency',
  'usd_source',
] as const

const CACHE_TTL_MS = 15_000
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000
const RATE_CACHE_TTL_MS = 30_000

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
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

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

const responseCache = new Map<string, { data: any; timestamp: number }>()

const promoColumnsCache: {
  columns: Set<string> | null
  resolvedAt: number
} = {
  columns: null,
  resolvedAt: 0,
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
 * Important : 0 USD explicite doit être respecté.
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

function extractNotNullColumnName(message: string): string | null {
  const patterns = [
    /null value in column "([^"]+)"/i,
    /violates not-null constraint.*column "([^"]+)"/i,
    /column "([^"]+)" contains null value/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE CLIENT                                                */
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
      logger.error?.(
        'Exception lecture exchange_rates admin promotions',
        err
      )
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

function resolveMoneyFromRow(
  row: any,
  usdKeys: string[],
  cdfKeys: string[],
  legacyKeys: string[],
  rate: number | null
): MoneyPair {
  const usd = explicitUsd(...usdKeys.map((key) => row?.[key]))
  const cdf = explicitCdf(...cdfKeys.map((key) => row?.[key]))

  if (usd != null) {
    return resolvePricePair(usd, cdf, rate)
  }

  if (cdf != null) {
    return resolvePricePair(null, cdf, rate)
  }

  const legacy = firstFinite(...legacyKeys.map((key) => row?.[key]))

  if (legacy == null) {
    return {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    }
  }

  const currency = String(row?.currency || '').toUpperCase()
  const usdSourceFlag = row?.usd_source

  if (currency === 'USD' || usdSourceFlag === true) {
    return resolvePricePair(legacy, null, rate)
  }

  if (currency === 'CDF' || usdSourceFlag === false) {
    return resolvePricePair(null, legacy, rate)
  }

  /**
   * Par défaut, les anciens champs `prix` / `prix_promo`
   * sont considérés comme du CDF legacy.
   */
  return resolvePricePair(null, legacy, rate)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  IMAGE HELPER                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function firstImage(images: any): string | null {
  if (!images) return null

  if (typeof images === 'string') {
    const clean = images.trim()
    return clean || null
  }

  if (Array.isArray(images)) {
    for (const image of images) {
      const resolved = firstImage(image)

      if (resolved) return resolved
    }

    return null
  }

  if (typeof images === 'object') {
    const url =
      images.url ||
      images.src ||
      images.path ||
      images.public_url ||
      images.image

    if (typeof url === 'string') {
      const clean = url.trim()
      return clean || null
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION LECTURE                                          */
/* ═══════════════════════════════════════════════════════════════ */

function normalizePromoRow(row: any, rate: number | null): any {
  if (!row) return null

  const type = String(row.type_promo || 'prix_fixe')

  let money = resolveMoneyFromRow(
    row,
    ['prix_promo_usd'],
    ['prix_promo_cdf'],
    ['prix_promo'],
    rate
  )

  if (type === 'cadeau') {
    money = {
      usd: 0,
      cdf: 0,
      cdfKnown: true,
      source: 'USD',
    }
  }

  if (type === 'pourcentage') {
    money = {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    }
  }

  const percent = firstFinite(row.valeur_pourcentage)

  return {
    id: row.id,

    produit_id: row.produit_id ?? null,
    categorie_id: row.categorie_id ?? null,
    produit_cadeau_id: row.produit_cadeau_id ?? null,

    type_promo: type,

    prix_promo_usd: money.source === 'NONE' ? null : money.usd,
    prix_promo_cdf: money.cdfKnown ? money.cdf : null,
    prix_promo: money.cdfKnown ? money.cdf : null,

    valeur_pourcentage: percent != null ? Math.round(percent) : null,

    description: row.description ?? null,

    date_debut: row.date_debut ?? null,
    date_fin: row.date_fin ?? null,

    actif:
      typeof row.actif === 'boolean'
        ? row.actif
        : typeof row.active === 'boolean'
          ? row.active
          : true,

    quantite_min: firstFinite(row.quantite_min) ?? 1,
    cumulable: Boolean(row.cumulable),

    banniere_url: row.banniere_url ?? null,

    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,

    exchange_rate: rate,
    price_source: money.source,
  }
}

function normalizeProductRow(row: any, rate: number | null): any {
  if (!row) return null

  const money = resolveMoneyFromRow(
    row,
    ['prix_usd', 'unit_price_usd', 'price_usd'],
    ['prix_cdf', 'price_cdf'],
    ['prix', 'price'],
    rate
  )

  return {
    ...row,

    prix_usd: money.source === 'NONE' ? null : money.usd,
    prix_cdf: money.cdfKnown ? money.cdf : null,
    prix: money.cdfKnown ? money.cdf : null,

    exchange_rate: rate,
    price_source: money.source,
  }
}

function formatPromoResponse(
  row: any,
  rate: number | null,
  productsMap: Record<string, any>
): any {
  const promo = normalizePromoRow(row, rate)

  if (!promo) return null

  const product = productsMap[promo.produit_id]

  return {
    ...promo,

    produit_nom:
      product?.nom ||
      (promo.produit_id ? 'Produit inconnu' : null),

    produit_prix_usd: product?.prix_usd ?? null,
    produit_prix_cdf: product?.prix_cdf ?? null,
    produit_prix: product?.prix ?? null,

    produit_image: firstImage(product?.images),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DÉTECTION COLONNES                                             */
/* ═══════════════════════════════════════════════════════════════ */

async function detectPromoColumns(supabase: any): Promise<Set<string>> {
  if (
    promoColumnsCache.columns &&
    Date.now() - promoColumnsCache.resolvedAt < SCHEMA_CACHE_TTL_MS
  ) {
    return promoColumnsCache.columns
  }

  let remaining: string[] = [...PROMO_COLUMN_CANDIDATES]

  for (
    let attempt = 0;
    attempt < PROMO_COLUMN_CANDIDATES.length + 8;
    attempt++
  ) {
    if (remaining.length === 0) break

    const selectStr = remaining.join(',')

    try {
      const { error } = await supabase
        .from(PROMO_TABLE)
        .select(selectStr)
        .limit(1)

      if (!error) {
        const set = new Set(remaining)

        promoColumnsCache.columns = set
        promoColumnsCache.resolvedAt = Date.now()

        return set
      }

      if (isMissingColumnError(error)) {
        const missing = extractMissingColumnName(
          String(error.message || '')
        )

        if (missing && remaining.includes(missing)) {
          remaining = remaining.filter((col) => col !== missing)
          continue
        }
      }

      break
    } catch (err: any) {
      logger.warn?.('Exception détection colonnes promotions', err)
      break
    }
  }

  const fallbackSet = new Set(remaining)

  promoColumnsCache.columns = fallbackSet
  promoColumnsCache.resolvedAt = Date.now()

  return fallbackSet
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUITS ASSOCIÉS                                              */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchProductsByIds(
  supabase: any,
  ids: string[],
  rate: number | null
): Promise<Record<string, any>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]

  if (uniqueIds.length === 0) return {}

  try {
    const { data, error } = await supabase
      .from(PRODUCT_TABLE)
      .select('*')
      .in('id', uniqueIds)

    if (error) {
      logger.warn?.('Erreur fetch produits promotions', error)
      return {}
    }

    const map: Record<string, any> = {}

    for (const raw of data || []) {
      const normalized = normalizeProductRow(raw, rate)

      if (normalized?.id) {
        map[String(normalized.id)] = normalized
      }
    }

    return map
  } catch (err: any) {
    logger.warn?.('Exception fetch produits promotions', err)
    return {}
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DATE NORMALIZATION                                             */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeDateInput(
  value: unknown,
  endOfDay: boolean,
  errors: string[]
): string | null {
  if (value === undefined || value === null) {
    errors.push('Date requise.')
    return null
  }

  const str = String(value).trim()

  if (!str) {
    errors.push('Date requise.')
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const iso = endOfDay
      ? `${str}T23:59:59.999Z`
      : `${str}T00:00:00.000Z`

    const date = new Date(iso)

    if (Number.isNaN(date.getTime())) {
      errors.push('Date invalide.')
      return null
    }

    return date.toISOString()
  }

  const date = new Date(str)

  if (Number.isNaN(date.getTime())) {
    errors.push('Date invalide.')
    return null
  }

  return date.toISOString()
}

/* ═══════════════════════════════════════════════════════════════ */
/*  WRITE MONEY RESOLUTION                                         */
/* ═══════════════════════════════════════════════════════════════ */

function resolveInputMoney(params: {
  label: string
  usd?: unknown
  cdf?: unknown
  legacy?: unknown
  currency?: unknown
  usdSource?: unknown
  rate: number | null
  requirePositive: boolean
  allowZero?: boolean
}): { money: MoneyPair; errors: string[] } {
  const errors: string[] = []

  const hasUsd = params.usd !== undefined
  const hasCdf = params.cdf !== undefined
  const hasLegacy = params.legacy !== undefined

  if (!hasUsd && !hasCdf && !hasLegacy) {
    if (params.requirePositive) {
      errors.push(`${params.label} requis.`)
    }

    return {
      money: {
        usd: 0,
        cdf: null,
        cdfKnown: false,
        source: 'NONE',
      },
      errors,
    }
  }

  const usdRaw = hasUsd
    ? params.usd === null
      ? 0
      : params.usd
    : undefined

  const cdfRaw = hasCdf
    ? params.cdf === null
      ? 0
      : params.cdf
    : undefined

  const legacyRaw = hasLegacy
    ? params.legacy === null
      ? 0
      : params.legacy
    : undefined

  const usdNum =
    usdRaw !== undefined ? parseFiniteNumber(usdRaw) : null

  const cdfNum =
    cdfRaw !== undefined ? parseFiniteNumber(cdfRaw) : null

  const legacyNum =
    legacyRaw !== undefined ? parseFiniteNumber(legacyRaw) : null

  if (usdRaw !== undefined && (usdNum == null || usdNum < 0)) {
    errors.push(`${params.label} USD invalide.`)
  }

  if (cdfRaw !== undefined && (cdfNum == null || cdfNum < 0)) {
    errors.push(`${params.label} CDF invalide.`)
  }

  if (legacyRaw !== undefined && (legacyNum == null || legacyNum < 0)) {
    errors.push(`${params.label} legacy invalide.`)
  }

  if (errors.length > 0) {
    return {
      money: {
        usd: 0,
        cdf: null,
        cdfKnown: false,
        source: 'NONE',
      },
      errors,
    }
  }

  const rateNum = Number(params.rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  function finishFromUsd(usdValue: number): MoneyPair {
    const usd = round2(usdValue)

    const cdf =
      usd === 0
        ? 0
        : rateOk
          ? roundCdf(toCdf(usd, rateNum))
          : cdfNum != null
            ? roundCdf(cdfNum)
            : null

    if (params.requirePositive && usd <= 0 && !params.allowZero) {
      errors.push(`${params.label} doit être supérieur à 0.`)
    }

    return {
      usd,
      cdf,
      cdfKnown: cdf != null,
      source: 'USD',
    }
  }

  function finishFromCdf(cdfValue: number): MoneyPair {
    const cdf = roundCdf(cdfValue)

    if (cdf === 0) {
      if (params.requirePositive && !params.allowZero) {
        errors.push(`${params.label} doit être supérieur à 0.`)
      }

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

    errors.push(
      `${params.label} fourni uniquement en CDF legacy, mais le taux USD/CDF est indisponible. Écriture refusée pour ne pas figer un CDF comme vérité.`
    )

    return {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    }
  }

  if (usdNum != null) {
    return {
      money: finishFromUsd(usdNum),
      errors,
    }
  }

  if (cdfNum != null) {
    return {
      money: finishFromCdf(cdfNum),
      errors,
    }
  }

  if (legacyNum != null) {
    const currency = String(params.currency || '').toUpperCase()
    const usdSourceFlag = params.usdSource

    if (currency === 'USD' || usdSourceFlag === true) {
      return {
        money: finishFromUsd(legacyNum),
        errors,
      }
    }

    return {
      money: finishFromCdf(legacyNum),
      errors,
    }
  }

  return {
    money: {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    },
    errors,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BUILD PAYLOAD ÉCRITURE TOLÉRANT                                */
/* ═══════════════════════════════════════════════════════════════ */

function buildPromoWritePayload(
  parsed: any,
  availableColumns: Set<string>,
  rate: number | null
): { payload: Record<string, any>; errors: string[] } {
  const errors: string[] = []
  const payload: Record<string, any> = {}

  const type = String(parsed.type_promo || 'prix_fixe')

  let money: MoneyPair
  let percent: number | null = null

  if (type === 'cadeau') {
    money = {
      usd: 0,
      cdf: 0,
      cdfKnown: true,
      source: 'USD',
    }
  } else if (type === 'pourcentage') {
    money = {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    }

    const pctRaw =
      parsed.valeur_pourcentage === null
        ? 0
        : parsed.valeur_pourcentage

    const pctNum = parseFiniteNumber(pctRaw)

    if (pctNum == null || pctNum < 1 || pctNum > 99) {
      errors.push('Le pourcentage doit être entre 1 et 99.')
    } else {
      percent = Math.round(pctNum)
    }
  } else {
    const resolved = resolveInputMoney({
      label: 'Prix promotionnel USD',
      usd: parsed.prix_promo_usd,
      cdf: parsed.prix_promo_cdf,
      legacy: parsed.prix_promo,
      currency: parsed.currency,
      usdSource: parsed.usd_source,
      rate,
      requirePositive: true,
      allowZero: false,
    })

    errors.push(...resolved.errors)
    money = resolved.money
  }

  const dateDebut = normalizeDateInput(parsed.date_debut, false, errors)
  const dateFin = normalizeDateInput(parsed.date_fin, true, errors)

  if (
    dateDebut &&
    dateFin &&
    new Date(dateFin).getTime() <= new Date(dateDebut).getTime()
  ) {
    errors.push(
      'La date de fin doit être postérieure à la date de début.'
    )
  }

  const banniereRaw =
    typeof parsed.banniere_url === 'string'
      ? parsed.banniere_url.trim()
      : null

  const banniereUrl = banniereRaw || null

  const setIfColumn = (key: string, value: any) => {
    if (availableColumns.has(key)) {
      payload[key] = value
    }
  }

  setIfColumn('produit_id', parsed.produit_id ?? null)
  setIfColumn(
    'categorie_id',
    typeof parsed.categorie_id === 'string'
      ? parsed.categorie_id.trim() || null
      : parsed.categorie_id ?? null
  )
  setIfColumn('type_promo', type)

  const usdToStore = money.source === 'NONE' ? null : money.usd
  const cdfToStore = money.cdfKnown ? money.cdf : null
  const legacyToStore = money.cdfKnown ? money.cdf : null

  setIfColumn('prix_promo_usd', usdToStore)
  setIfColumn('prix_promo_cdf', cdfToStore)
  setIfColumn('prix_promo', legacyToStore)

  setIfColumn('valeur_pourcentage', percent)

  setIfColumn(
    'description',
    typeof parsed.description === 'string'
      ? parsed.description.trim() || null
      : parsed.description ?? null
  )

  setIfColumn('date_debut', dateDebut)
  setIfColumn('date_fin', dateFin)

  const actifValue = parsed.actif !== false

  setIfColumn('actif', actifValue)
  setIfColumn('active', actifValue)

  setIfColumn('quantite_min', parsed.quantite_min ?? 1)
  setIfColumn('cumulable', parsed.cumulable ?? false)

  setIfColumn('banniere_url', banniereUrl)
  setIfColumn('produit_cadeau_id', parsed.produit_cadeau_id ?? null)

  if (rate != null) {
    setIfColumn('exchange_rate', round2(rate))
  }

  setIfColumn('currency', 'USD')
  setIfColumn('usd_source', true)

  if (availableColumns.has('updated_at')) {
    payload.updated_at = new Date().toISOString()
  }

  return { payload, errors }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  INSERT / UPDATE FALLBACK COLONNES MANQUANTES                   */
/* ═══════════════════════════════════════════════════════════════ */

function pruneUndefined(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      out[key] = value
    }
  }

  return out
}

async function insertWithColumnFallback(
  supabase: any,
  tableName: string,
  payload: Record<string, any>
): Promise<any> {
  let current = pruneUndefined(payload)

  for (let attempt = 0; attempt < 20; attempt++) {
    if (Object.keys(current).length === 0) {
      throw new Error('Aucune donnée valide à insérer.')
    }

    const { data, error } = await supabase
      .from(tableName)
      .insert(current)
      .select('*')
      .single()

    if (!error) {
      return data
    }

    if (isMissingColumnError(error)) {
      const missing = extractMissingColumnName(
        String(error.message || '')
      )

      if (missing && missing in current) {
        delete current[missing]
        continue
      }
    }

    const nullCol = extractNotNullColumnName(
      String(error.message || '')
    )

    if (
      nullCol &&
      nullCol in current &&
      current[nullCol] === null
    ) {
      if (
        [
          'prix_promo',
          'prix_promo_usd',
          'prix_promo_cdf',
          'valeur_pourcentage',
          'quantite_min',
          'exchange_rate',
        ].includes(nullCol)
      ) {
        current[nullCol] = 0
        continue
      }

      if (nullCol === 'currency') {
        current[nullCol] = 'USD'
        continue
      }

      if (nullCol === 'usd_source') {
        current[nullCol] = true
        continue
      }

      if (
        [
          'produit_id',
          'categorie_id',
          'produit_cadeau_id',
          'banniere_url',
          'description',
        ].includes(nullCol)
      ) {
        delete current[nullCol]
        continue
      }
    }

    throw error
  }

  throw new Error(
    'Colonnes manquantes ou contraintes trop restrictives pour l’insertion.'
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONFLIT PROMOTION ACTIVE                                       */
/* ═══════════════════════════════════════════════════════════════ */

async function deactivateConflictingPromotions(
  supabase: any,
  availableColumns: Set<string>,
  produitId: string | null
): Promise<void> {
  if (!produitId) return

  const attempts: Array<{
    setColumn: string
    whereColumn: string
  }> = []

  if (availableColumns.has('actif')) {
    attempts.push({
      setColumn: 'actif',
      whereColumn: 'actif',
    })
  }

  if (availableColumns.has('active')) {
    attempts.push({
      setColumn: 'active',
      whereColumn: 'active',
    })
  }

  for (const attempt of attempts) {
    try {
      const { error } = await supabase
        .from(PROMO_TABLE)
        .update({ [attempt.setColumn]: false })
        .eq('produit_id', produitId)
        .eq(attempt.whereColumn, true)

      if (error && !isMissingColumnError(error)) {
        logger.warn?.(
          'Erreur désactivation promotions concurrentes',
          error
        )
      }
    } catch (err: any) {
      logger.warn?.(
        'Exception désactivation promotions concurrentes',
        err
      )
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS ZOD                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const moneyInput = z.coerce.number().min(0).nullable().optional()

const createPromoSchema = z.object({
  produit_id: z
    .string()
    .uuid('ID produit invalide')
    .optional()
    .nullable(),

  categorie_id: z.string().optional().nullable(),

  type_promo: z
    .enum([
      'prix_fixe',
      'pourcentage',
      'flash',
      'lot_degressif',
      'cadeau',
    ])
    .default('prix_fixe'),

  prix_promo_usd: moneyInput,
  prix_promo_cdf: moneyInput,
  prix_promo: moneyInput,

  valeur_pourcentage: z.coerce
    .number()
    .int()
    .min(0)
    .max(99)
    .nullable()
    .optional(),

  description: z.string().max(500).nullable().optional(),

  date_debut: z.string().min(1, 'Date de début requise'),
  date_fin: z.string().min(1, 'Date de fin requise'),

  actif: z.boolean().default(true),

  quantite_min: z.coerce
    .number()
    .int()
    .min(1)
    .default(1)
    .optional(),

  cumulable: z.boolean().default(false).optional(),

  banniere_url: z
    .union([z.string().url(), z.literal('')])
    .nullable()
    .optional(),

  produit_cadeau_id: z
    .string()
    .uuid('ID produit cadeau invalide')
    .optional()
    .nullable(),

  currency: z.string().optional().nullable(),
  usd_source: z.boolean().optional().nullable(),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Liste des promotions                                     */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-promotions-get:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin promotions.' },
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

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json([])
  }

  try {
    const rate = await getServerUsdRate(supabase)

    const cacheKey = `admin-promotions-list:${rate ?? 'none'}`
    const cached = getCached(cacheKey)

    if (cached) {
      return NextResponse.json(cached)
    }

    const { data, error } = await supabase
      .from(PROMO_TABLE)
      .select('*')
      .order('date_debut', { ascending: false })

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json([])
      }

      logger.warn?.('Erreur GET promotions', error)
      return NextResponse.json([])
    }

    const rows = Array.isArray(data) ? data : []

    const produitIds = rows
      .map((row: any) => row.produit_id)
      .filter(Boolean)
      .map(String)

    const productsMap = await fetchProductsByIds(
      supabase,
      produitIds,
      rate
    )

    const formatted = rows
      .map((row: any) =>
        formatPromoResponse(row, rate, productsMap)
      )
      .filter(Boolean)

    setCached(cacheKey, formatted)

    return NextResponse.json(formatted)
  } catch (error: any) {
    logger.error?.('Crash GET admin/promotions', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne promotions',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST – Création d’une promotion                                */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-promotions-post:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin création promotions.' },
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

  const parsed = createPromoSchema.safeParse(body)

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

  try {
    const rate = await getServerUsdRate(supabase)
    const availableColumns = await detectPromoColumns(supabase)

    if (!availableColumns.has('type_promo')) {
      return NextResponse.json(
        {
          error:
            'La table promotions ne possède pas de colonne type_promo exploitable.',
        },
        { status: 500 }
      )
    }

    if (
      !availableColumns.has('prix_promo_usd') &&
      !availableColumns.has('prix_promo_cdf') &&
      !availableColumns.has('prix_promo')
    ) {
      return NextResponse.json(
        {
          error:
            'La table promotions ne possède aucune colonne prix exploitable.',
        },
        { status: 500 }
      )
    }

    const built = buildPromoWritePayload(
      parsed.data,
      availableColumns,
      rate
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

    if (parsed.data.actif && parsed.data.produit_id) {
      await deactivateConflictingPromotions(
        supabase,
        availableColumns,
        parsed.data.produit_id
      )
    }

    const inserted = await insertWithColumnFallback(
      supabase,
      PROMO_TABLE,
      built.payload
    )

    invalidateCache()

    const productsMap = await fetchProductsByIds(
      supabase,
      inserted?.produit_id ? [String(inserted.produit_id)] : [],
      rate
    )

    return NextResponse.json(
      formatPromoResponse(inserted, rate, productsMap),
      { status: 201 }
    )
  } catch (error: any) {
    logger.error?.('Crash POST admin/promotions', error)

    return NextResponse.json(
      {
        error:
          error?.message || 'Erreur lors de la création de la promotion.',
      },
      { status: 500 }
    )
  }
}