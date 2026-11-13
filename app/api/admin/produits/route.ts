// app/api/admin/produits/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { createProductSchema } from '@/lib/validations/product'
import { normalizeProductDeliveryConfig } from '@/lib/shipping-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PRODUCT_TABLE = 'produits'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const POOL_LIMIT = 2000

const CACHE_TTL_MS = 30_000
const RATE_CACHE_TTL_MS = 30_000

const PRICE_USD_KEYS = [
  'prix_usd',
  'price_usd',
  'unit_price_usd',
] as const

const PRICE_CDF_KEYS = [
  'prix_cdf',
  'prix',
  'price',
  'price_cdf',
] as const

const ORIGINAL_PRICE_USD_KEYS = ['prix_original_usd'] as const

const ORIGINAL_PRICE_CDF_KEYS = [
  'prix_original',
  'prix_cdf_original',
] as const

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type PriceSource =
  | 'USD'
  | 'CDF_CONVERTED'
  | 'CDF_LEGACY'
  | 'NONE'

interface MoneyPair {
  usd: number
  cdf: number | null
  cdfKnown: boolean
  source: PriceSource
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

const cache = new Map<string, { data: any; timestamp: number }>()

let cachedServerRate: {
  value: number | null
  expiresAt: number
} | null = null

function getCache(key: string): any | null {
  const entry = cache.get(key)

  if (!entry) return null

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }

  return entry.data
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() })
}

function clearCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  RATE LIMIT TOLÉRANT SYNC / ASYNC                               */
/* ═══════════════════════════════════════════════════════════════ */

async function enforceRateLimit(config: any): Promise<any> {
  const result: any = await Promise.resolve(rateLimit(config))
  return result
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE CLIENT                                                */
/* ═══════════════════════════════════════════════════════════════ */

async function getSupabase(): Promise<any | null> {
  try {
    return await createClient(true)
  } catch (err: any) {
    logger.error?.('Impossible de créer le client Supabase admin produits', err)
    return null
  }
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

function pickValues(source: any, keys: readonly string[]): unknown[] {
  return keys.map((key) => source?.[key])
}

function hasAnyKey(source: any, keys: readonly string[]): boolean {
  return keys.some((key) => source?.[key] !== undefined)
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
/*  TAUX SERVEUR USD/CDF                                           */
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
      logger.warn?.('Exception lecture exchange_rates admin produits', err)
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
 * - Si CDF seul et taux indisponible → fallback lecture seulement.
 *
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number | null,
  cdfSource: number | null,
  rate: number | null
): MoneyPair {
  const rateNum = parseFiniteNumber(rate)
  const rateOk = rateNum != null && rateNum > 0

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

    if (rateOk && rateNum != null) {
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

    if (rateOk && rateNum != null) {
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

function resolveProductPrice(row: any, rate: number | null): MoneyPair {
  return resolvePricePair(
    explicitUsd(...pickValues(row, PRICE_USD_KEYS)),
    explicitCdf(...pickValues(row, PRICE_CDF_KEYS)),
    rate
  )
}

function resolveOriginalPrice(
  row: any,
  finalPrice: MoneyPair,
  rate: number | null
): MoneyPair {
  const usdSignal = explicitUsd(
    ...pickValues(row, ORIGINAL_PRICE_USD_KEYS)
  )

  const cdfSignal = explicitCdf(
    ...pickValues(row, ORIGINAL_PRICE_CDF_KEYS)
  )

  let resolved = resolvePricePair(usdSignal, cdfSignal, rate)

  const percent = firstFinite(row?.remise_percent) ?? 0

  if (resolved.source === 'NONE' && percent > 0 && percent < 100) {
    const denominator = 1 - percent / 100

    if (denominator > 0) {
      if (
        (finalPrice.source === 'USD' ||
          finalPrice.source === 'CDF_CONVERTED') &&
        finalPrice.usd > 0
      ) {
        const originalUsd = round2(finalPrice.usd / denominator)
        resolved = resolvePricePair(originalUsd, null, rate)
      } else if (finalPrice.cdfKnown && (finalPrice.cdf ?? 0) > 0) {
        const originalCdf = roundCdf((finalPrice.cdf ?? 0) / denominator)
        resolved = resolvePricePair(null, originalCdf, rate)
      }
    }
  }

  return resolved
}

function canWritePriceResolution(pair: MoneyPair): boolean {
  return pair.source === 'USD' || pair.source === 'CDF_CONVERTED'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION HELPERS                                          */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeImages(raw: any): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  const pushImage = (value: any) => {
    if (!value) return

    if (typeof value === 'string') {
      const clean = value.trim()

      if (clean && !seen.has(clean)) {
        seen.add(clean)
        result.push(clean)
      }

      return
    }

    if (Array.isArray(value)) {
      value.forEach(pushImage)
      return
    }

    if (typeof value === 'object') {
      const url =
        value.url ||
        value.src ||
        value.path ||
        value.public_url ||
        value.image

      if (typeof url === 'string') {
        const clean = url.trim()

        if (clean && !seen.has(clean)) {
          seen.add(clean)
          result.push(clean)
        }
      }
    }
  }

  pushImage(raw)

  return result
}

function normalizeBadges(raw: any): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  }

  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeVariantPrices(variantes: any, rate: number | null): any[] {
  if (!Array.isArray(variantes)) return []

  return variantes.map((variant) => {
    if (!variant || typeof variant !== 'object') return variant

    const hasPrice =
      hasAnyKey(variant, PRICE_USD_KEYS) ||
      hasAnyKey(variant, PRICE_CDF_KEYS)

    if (!hasPrice) return variant

    const price = resolveProductPrice(variant, rate)
    const out: any = { ...variant }

    if (price.source !== 'NONE') {
      out.prix_usd = price.usd
    }

    if (price.cdfKnown) {
      out.prix_cdf = price.cdf
      out.prix = price.cdf
    }

    return out
  })
}

function normalizeDeliveryConfig(row: any, rate: number | null): any {
  try {
    return normalizeProductDeliveryConfig(
      row?.delivery_config ?? null,
      row,
      rate
    )
  } catch {
    return null
  }
}

function normalizeProductRow(row: any, rate: number | null): any {
  if (!row) return null

  const price = resolveProductPrice(row, rate)
  const original = resolveOriginalPrice(row, price, rate)

  const variantes = normalizeVariantPrices(row.variantes, rate)
  const deliveryConfig = normalizeDeliveryConfig(row, rate)

  const estActif =
    typeof row.est_actif === 'boolean'
      ? row.est_actif
      : typeof row.active === 'boolean'
        ? row.active
        : true

  return {
    ...row,

    id: row.id,
    nom: row.nom ?? row.name ?? 'Produit',
    name: row.name ?? row.nom ?? 'Produit',

    prix_usd: price.source === 'NONE' ? null : price.usd,
    prix_cdf: price.cdfKnown ? price.cdf : null,
    prix: price.cdfKnown
      ? price.cdf
      : explicitCdf(row.prix, row.price, row.price_cdf),

    prix_original_usd:
      original.source === 'NONE' ? null : original.usd,
    prix_original: original.cdfKnown ? original.cdf : row.prix_original ?? null,

    remise_percent: firstFinite(row.remise_percent) ?? 0,

    stock: firstFinite(row.stock) ?? 0,
    est_actif: estActif,
    active: estActif,

    images: normalizeImages(row.images ?? row.image ?? row.photos),
    categorie: row.categorie ?? row.category ?? null,
    categorie_id: row.categorie_id ?? row.category_id ?? null,

    total_ventes: firstFinite(row.total_ventes ?? row.sales_count) ?? 0,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,

    sku: row.sku ?? null,
    badges: normalizeBadges(row.badges),

    exchange_rate: rate,
    price_source: price.source,

    variantes,
    delivery_config: deliveryConfig,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  QUERY SCHEMA                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const getQuerySchema = z.object({
  search: z.string().optional().default(''),
  categorie: z.string().optional().default(''),
  est_actif: z
    .enum(['all', 'true', 'false'])
    .optional()
    .default('all'),

  badge: z.string().optional().default(''),

  min_usd: z.coerce.number().min(0).optional(),
  max_usd: z.coerce.number().min(0).optional(),

  min_price: z.coerce.number().min(0).optional(),
  max_price: z.coerce.number().min(0).optional(),

  min_stock: z.coerce.number().int().optional(),
  max_stock: z.coerce.number().int().optional(),

  sort_by: z
    .enum([
      'created_at',
      'nom',
      'prix',
      'prix_usd',
      'stock',
      'total_ventes',
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

  format: z.enum(['json', 'csv']).optional().default('json'),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  SEARCH / FILTER HELPERS                                        */
/* ═══════════════════════════════════════════════════════════════ */

function sanitizeSearchValue(value: string): string {
  return String(value || '')
    .replace(/[%_,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function applySimpleFilters(
  query: any,
  params: z.infer<typeof getQuerySchema>,
  includeSearch = true
) {
  if (params.est_actif === 'true') {
    query = query.eq('est_actif', true)
  } else if (params.est_actif === 'false') {
    query = query.eq('est_actif', false)
  }

  if (params.categorie) {
    const term = `%${sanitizeSearchValue(params.categorie)}%`
    query = query.ilike('categorie', term)
  }

  if (includeSearch && params.search) {
    const term = `%${sanitizeSearchValue(params.search)}%`

    query = query.or(
      `nom.ilike.${term},description.ilike.${term},categorie.ilike.${term}`
    )
  }

  if (params.min_stock !== undefined) {
    query = query.gte('stock', params.min_stock)
  }

  if (params.max_stock !== undefined) {
    query = query.lte('stock', params.max_stock)
  }

  return query
}

function filterNormalizedProducts(
  list: any[],
  params: z.infer<typeof getQuerySchema>
): any[] {
  let filtered = list

  if (params.badge) {
    const badge = params.badge.trim().toLowerCase()

    filtered = filtered.filter((product) =>
      Array.isArray(product.badges) &&
      product.badges.some(
        (value: any) => String(value ?? '').trim().toLowerCase() === badge
      )
    )
  }

  if (params.min_usd !== undefined) {
    filtered = filtered.filter(
      (product) =>
        product.prix_usd != null && product.prix_usd >= params.min_usd!
    )
  }

  if (params.max_usd !== undefined) {
    filtered = filtered.filter(
      (product) =>
        product.prix_usd != null && product.prix_usd <= params.max_usd!
    )
  }

  if (params.min_price !== undefined) {
    filtered = filtered.filter((product) => {
      const cdf = product.prix_cdf ?? product.prix
      return cdf != null && Number(cdf) >= params.min_price!
    })
  }

  if (params.max_price !== undefined) {
    filtered = filtered.filter((product) => {
      const cdf = product.prix_cdf ?? product.prix
      return cdf != null && Number(cdf) <= params.max_price!
    })
  }

  return filtered
}

function sortNormalizedProducts(
  list: any[],
  sortBy: string,
  sortOrder: string,
  rate: number | null
): any[] {
  const dir = sortOrder === 'asc' ? 1 : -1
  const rateNum = parseFiniteNumber(rate)
  const rateOk = rateNum != null && rateNum > 0

  function priceSortValue(product: any): number {
    if (product.prix_usd != null) return Number(product.prix_usd)

    if (
      product.prix_cdf != null &&
      rateOk &&
      rateNum != null
    ) {
      return round2(toUsd(Number(product.prix_cdf), rateNum))
    }

    if (product.prix != null && rateOk && rateNum != null) {
      return round2(toUsd(Number(product.prix), rateNum))
    }

    return Number.NEGATIVE_INFINITY
  }

  return [...list].sort((a, b) => {
    let cmp = 0

    switch (sortBy) {
      case 'nom':
        cmp = String(a.nom || '').localeCompare(String(b.nom || ''))
        break

      case 'prix':
      case 'prix_usd':
        cmp = priceSortValue(a) - priceSortValue(b)
        break

      case 'stock':
        cmp = Number(a.stock ?? 0) - Number(b.stock ?? 0)
        break

      case 'total_ventes':
        cmp = Number(a.total_ventes ?? 0) - Number(b.total_ventes ?? 0)
        break

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

/* ═══════════════════════════════════════════════════════════════ */
/*  POOL FETCH                                                     */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchProductPool(
  supabase: any,
  params: z.infer<typeof getQuerySchema>
): Promise<{ rows: any[]; truncated: boolean }> {
  let lastError: any = null

  const attempts = [true, false]

  for (const includeSearch of attempts) {
    try {
      let query = supabase.from(PRODUCT_TABLE).select('*')

      query = applySimpleFilters(query, params, includeSearch)

      query = query
        .order('created_at', { ascending: false })
        .limit(POOL_LIMIT)

      const { data, error } = await query

      if (!error) {
        const rows = Array.isArray(data) ? data : []

        return {
          rows,
          truncated: rows.length >= POOL_LIMIT,
        }
      }

      lastError = error

      if (isMissingTableError(error)) {
        throw error
      }

      if (isMissingColumnError(error)) {
        continue
      }

      continue
    } catch (err: any) {
      lastError = err

      if (isMissingTableError(err)) {
        throw err
      }
    }
  }

  logger.warn?.('Erreur pool produits admin', lastError)

  return { rows: [], truncated: false }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DIRECT FETCH                                                   */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchProductsDirect(
  supabase: any,
  params: z.infer<typeof getQuerySchema>
): Promise<{
  rows: any[]
  count: number
  error: any | null
}> {
  const offset = (params.page - 1) * params.limit

  let query = supabase
    .from(PRODUCT_TABLE)
    .select('*', { count: 'exact' })

  query = applySimpleFilters(query, params, true)

  const ascending = params.sort_order === 'asc'

  switch (params.sort_by) {
    case 'nom':
      query = query.order('nom', { ascending })
      break

    case 'stock':
      query = query.order('stock', { ascending })
      break

    case 'total_ventes':
      query = query.order('total_ventes', {
        ascending,
        nullsFirst: false,
      })
      break

    case 'created_at':
    default:
      query = query.order('created_at', { ascending })
      break
  }

  query = query.range(offset, offset + params.limit - 1)

  const { data, error, count } = await query

  return {
    rows: Array.isArray(data) ? data : [],
    count: Number(count ?? 0),
    error,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATS                                                          */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchProductStats(supabase: any): Promise<{
  total: number
  actifs: number
  rupture: number
}> {
  const results = await Promise.allSettled([
    supabase
      .from(PRODUCT_TABLE)
      .select('*', { count: 'exact', head: true }),

    supabase
      .from(PRODUCT_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('est_actif', true),

    supabase
      .from(PRODUCT_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('est_actif', true)
      .lte('stock', 0),
  ])

  function countOf(result: PromiseSettledResult<any>): number {
    if (result.status !== 'fulfilled') return 0

    const value = result.value
    return Number(value?.count ?? 0)
  }

  return {
    total: countOf(results[0]),
    actifs: countOf(results[1]),
    rupture: countOf(results[2]),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CSV HELPERS                                                    */
/* ═══════════════════════════════════════════════════════════════ */

function escapeCsv(value: any): string {
  const s = value == null ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

function buildProductsCsv(products: any[], rate: number | null): string {
  const headers = [
    'ID',
    'Nom',
    'Prix USD',
    'Prix CDF',
    'Stock',
    'Actif',
    'Catégorie',
    'Ventes',
    'SKU',
    'Badges',
    'Taux utilisé',
    'Source prix',
  ]

  const rows = products.map((p) => [
    p.id,
    p.nom,
    p.prix_usd != null ? round2(Number(p.prix_usd)).toFixed(2) : '',
    p.prix_cdf != null ? Math.round(Number(p.prix_cdf)) : p.prix ?? '',
    p.stock ?? 0,
    p.est_actif ? 'Oui' : 'Non',
    p.categorie ?? '',
    p.total_ventes ?? 0,
    p.sku ?? '',
    Array.isArray(p.badges) ? p.badges.join('|') : '',
    rate != null ? round2(Number(rate)) : '',
    p.price_source ?? '',
  ])

  return [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  WRITE PAYLOAD                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function buildProductWritePayload(
  body: any,
  rate: number | null
): { payload: Record<string, any>; errors: string[] } {
  const errors: string[] = []

  const price = resolveProductPrice(body, rate)
  const original = resolveOriginalPrice(body, price, rate)

  if (price.source === 'NONE') {
    errors.push('Aucun prix USD ou CDF exploitable détecté.')
  } else if (price.source === 'CDF_LEGACY') {
    errors.push(
      'Prix CDF legacy détecté sans taux USD/CDF disponible. Le prix USD doit être renseigné ou le taux doit être disponible.'
    )
  }

  const variantes = normalizeVariantPrices(body.variantes, rate)

  for (const variant of variantes) {
    if (!variant || typeof variant !== 'object') continue

    const hasPrice =
      hasAnyKey(variant, PRICE_USD_KEYS) ||
      hasAnyKey(variant, PRICE_CDF_KEYS)

    if (!hasPrice) continue

    const variantPrice = resolveProductPrice(variant, rate)

    if (variantPrice.source === 'CDF_LEGACY') {
      errors.push(
        'Une variante contient un prix CDF legacy sans taux USD/CDF disponible. Le prix USD doit être renseigné ou le taux doit être disponible.'
      )

      break
    }

    if (variantPrice.source === 'NONE') {
      errors.push(
        'Une variante ne contient aucun prix USD ou CDF exploitable.'
      )

      break
    }
  }

  const deliveryConfig = normalizeDeliveryConfig(body, rate)

  const payload: Record<string, any> = { ...body }

  delete payload._saved_at

  payload.nom = String(body.nom ?? body.name ?? '').trim()
  payload.name = payload.nom

  payload.prix_usd = canWritePriceResolution(price) ? price.usd : null
  payload.prix_cdf = price.cdfKnown ? price.cdf : null
  payload.prix = price.cdfKnown ? price.cdf : null

  payload.prix_original_usd = canWritePriceResolution(original)
    ? original.usd
    : null
  payload.prix_original =
    canWritePriceResolution(original) && original.cdfKnown
      ? original.cdf
      : null

  payload.variantes = variantes.length > 0 ? variantes : null

  payload.delivery_config =
    deliveryConfig?.enabled ? deliveryConfig : null

  payload.exchange_rate = price.rateOk ? parseFiniteNumber(rate) : null
  payload.price_source = price.source

  payload.currency = 'USD'
  payload.usd_source = true

  payload.images = normalizeImages(body.images ?? body.image ?? body.photos)
  payload.badges = normalizeBadges(body.badges)

  payload.est_actif =
    typeof body.est_actif === 'boolean'
      ? body.est_actif
      : typeof body.active === 'boolean'
        ? body.active
        : true

  payload.active = payload.est_actif

  payload.stock = firstFinite(body.stock) ?? 0
  payload.remise_percent = firstFinite(body.remise_percent) ?? 0

  return { payload, errors }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  INSERT / UPDATE FALLBACK                                       */
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
  payload: Record<string, any>
): Promise<any> {
  let current = pruneUndefined(payload)

  for (let attempt = 0; attempt < 20; attempt++) {
    if (Object.keys(current).length === 0) {
      throw new Error('Aucune donnée valide à insérer.')
    }

    const { data, error } = await supabase
      .from(PRODUCT_TABLE)
      .insert(current)
      .select('*')
      .single()

    if (!error) {
      return data
    }

    if (isMissingColumnError(error)) {
      const missing = extractMissingColumnName(String(error.message || ''))

      if (missing && missing in current) {
        delete current[missing]
        continue
      }
    }

    throw error
  }

  throw new Error('Colonnes manquantes trop nombreuses pour l’insertion.')
}

async function updateWithColumnFallback(
  supabase: any,
  id: string,
  payload: Record<string, any>
): Promise<any> {
  let current = pruneUndefined(payload)

  for (let attempt = 0; attempt < 20; attempt++) {
    if (Object.keys(current).length === 0) {
      throw new Error('Aucune donnée valide à mettre à jour.')
    }

    const { data, error } = await supabase
      .from(PRODUCT_TABLE)
      .update(current)
      .eq('id', id)
      .select('*')
      .single()

    if (!error) {
      return data
    }

    if (isMissingColumnError(error)) {
      const missing = extractMissingColumnName(String(error.message || ''))

      if (missing && missing in current) {
        delete current[missing]
        continue
      }
    }

    throw error
  }

  throw new Error('Colonnes manquantes trop nombreuses pour la mise à jour.')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ID EXTRACTION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const uuidSchema = z.string().uuid('ID produit invalide')

function extractProductId(request: Request, body?: any): string | null {
  const url = new URL(request.url)

  const fromQuery = url.searchParams.get('id')

  if (fromQuery) {
    return fromQuery
  }

  const segments = url.pathname.split('/')
  const last = segments[segments.length - 1]

  if (last && last !== 'produits') {
    const parsed = uuidSchema.safeParse(last)

    if (parsed.success) {
      return parsed.data
    }
  }

  if (body?.id) {
    const parsed = uuidSchema.safeParse(String(body.id))

    if (parsed.success) {
      return parsed.data
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Liste des produits                                       */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await enforceRateLimit({
    id: `admin-produits-get:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin produits.' },
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

  const params = parsed.data

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json(
      {
        data: [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
        },
        stats: { total: 0, actifs: 0, rupture: 0 },
        exchange_rate: null,
      },
      { status: 200 }
    )
  }

  try {
    const rate = await getServerUsdRate(supabase)

    const cacheKey = `admin-produits:${JSON.stringify(params)}:${rate ?? 'none'}`

    if (params.format === 'json') {
      const cached = getCache(cacheKey)

      if (cached) {
        return NextResponse.json(cached)
      }
    }

    const stats = await fetchProductStats(supabase)

    const needsPool =
      params.sort_by === 'prix' ||
      params.sort_by === 'prix_usd' ||
      params.min_usd !== undefined ||
      params.max_usd !== undefined ||
      params.min_price !== undefined ||
      params.max_price !== undefined ||
      Boolean(params.badge) ||
      params.format === 'csv'

    if (needsPool) {
      const pool = await fetchProductPool(supabase, params)

      const normalized = pool.rows
        .map((row) => normalizeProductRow(row, rate))
        .filter(Boolean)

      const filtered = filterNormalizedProducts(normalized, params)
      const sorted = sortNormalizedProducts(
        filtered,
        params.sort_by,
        params.sort_order,
        rate
      )

      if (params.format === 'csv') {
        const csv = buildProductsCsv(sorted, rate)

        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename=produits_${new Date()
              .toISOString()
              .slice(0, 10)}.csv`,
          },
        })
      }

      const total = sorted.length
      const totalPages = Math.max(1, Math.ceil(total / params.limit))
      const offset = (params.page - 1) * params.limit
      const data = sorted.slice(offset, offset + params.limit)

      const response = {
        data,
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages,
        },
        stats,
        exchange_rate: rate,
        truncated: pool.truncated,
      }

      setCache(cacheKey, response)

      return NextResponse.json(response)
    }

    const direct = await fetchProductsDirect(supabase, params)

    if (direct.error) {
      logger.warn?.('Erreur GET direct produits, fallback pool', direct.error)

      const pool = await fetchProductPool(supabase, params)

      const normalized = pool.rows
        .map((row) => normalizeProductRow(row, rate))
        .filter(Boolean)

      const filtered = filterNormalizedProducts(normalized, params)
      const sorted = sortNormalizedProducts(
        filtered,
        params.sort_by,
        params.sort_order,
        rate
      )

      const total = sorted.length
      const totalPages = Math.max(1, Math.ceil(total / params.limit))
      const offset = (params.page - 1) * params.limit
      const data = sorted.slice(offset, offset + params.limit)

      const response = {
        data,
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages,
        },
        stats,
        exchange_rate: rate,
        truncated: pool.truncated,
      }

      setCache(cacheKey, response)

      return NextResponse.json(response)
    }

    const normalized = direct.rows
      .map((row) => normalizeProductRow(row, rate))
      .filter(Boolean)

    const response = {
      data: normalized,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: direct.count,
        totalPages: Math.max(1, Math.ceil(direct.count / params.limit)),
      },
      stats,
      exchange_rate: rate,
    }

    setCache(cacheKey, response)

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error?.('Crash GET admin/produits', error)

    return NextResponse.json(
      {
        error:
          error?.message || 'Erreur serveur lors de la récupération des produits.',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST – Création d’un produit                                   */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await enforceRateLimit({
    id: `admin-produits-post:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin création produits.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  let currentUser: { id: string }

  try {
    currentUser = await requireAdmin()
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

  const parsed = createProductSchema.safeParse(body)

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

    const input = {
      ...body,
      ...parsed.data,
    }

    const built = buildProductWritePayload(input, rate)

    if (built.errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: built.errors,
        },
        { status: 400 }
      )
    }

    const payload = {
      ...built.payload,
      vendeur_id: currentUser.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const inserted = await insertWithColumnFallback(supabase, payload)

    clearCachePrefix('admin-produits')

    logger.info?.(`Produit créé : ${inserted?.id} - ${inserted?.nom}`)

    return NextResponse.json(
      normalizeProductRow(inserted, rate),
      { status: 201 }
    )
  } catch (error: any) {
    logger.error?.('Crash POST admin/produits', error)

    return NextResponse.json(
      {
        error:
          error?.message || 'Erreur lors de la création du produit.',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PATCH – Mise à jour partielle                                  */
/* ═══════════════════════════════════════════════════════════════ */

export async function PATCH(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await enforceRateLimit({
    id: `admin-produits-patch:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin mise à jour produits.' },
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
    body = {}
  }

  const productId = extractProductId(request, body)

  if (!productId) {
    return NextResponse.json(
      { error: 'ID produit requis (UUID valide).' },
      { status: 400 }
    )
  }

  const parsedId = uuidSchema.safeParse(productId)

  if (!parsedId.success) {
    return NextResponse.json(
      { error: 'ID produit invalide.' },
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

    const updatePayload: Record<string, any> = {}

    const hasPriceInput =
      hasAnyKey(body, PRICE_USD_KEYS) ||
      hasAnyKey(body, PRICE_CDF_KEYS)

    if (hasPriceInput) {
      const price = resolveProductPrice(body, rate)

      if (price.source === 'NONE') {
        return NextResponse.json(
          { error: 'Aucun prix USD ou CDF exploitable détecté.' },
          { status: 400 }
        )
      }

      if (price.source === 'CDF_LEGACY') {
        return NextResponse.json(
          {
            error:
              'Prix CDF legacy détecté sans taux USD/CDF disponible. Le prix USD doit être renseigné ou le taux doit être disponible.',
          },
          { status: 400 }
        )
      }

      if (canWritePriceResolution(price)) {
        updatePayload.prix_usd = price.usd
      }

      if (price.cdfKnown) {
        updatePayload.prix_cdf = price.cdf
        updatePayload.prix = price.cdf
      }

      updatePayload.exchange_rate = price.rateOk
        ? parseFiniteNumber(rate)
        : null

      updatePayload.price_source = price.source
      updatePayload.currency = 'USD'
      updatePayload.usd_source = true
    }

    if (body.est_actif !== undefined) {
      updatePayload.est_actif = Boolean(body.est_actif)
      updatePayload.active = Boolean(body.est_actif)
    }

    if (body.active !== undefined) {
      updatePayload.active = Boolean(body.active)
      updatePayload.est_actif = Boolean(body.active)
    }

    if (body.stock !== undefined) {
      const stock = firstFinite(body.stock)

      if (stock == null || stock < 0) {
        return NextResponse.json(
          { error: 'Le stock ne peut pas être négatif.' },
          { status: 400 }
        )
      }

      updatePayload.stock = Math.floor(stock)
    }

    if (body.remise_percent !== undefined) {
      const percent = firstFinite(body.remise_percent)

      if (percent == null || percent < 0 || percent > 90) {
        return NextResponse.json(
          { error: 'La remise doit être entre 0 et 90%.' },
          { status: 400 }
        )
      }

      updatePayload.remise_percent = round2(percent)
    }

    if (body.variantes !== undefined) {
      const variantes = normalizeVariantPrices(body.variantes, rate)

      for (const variant of variantes) {
        if (!variant || typeof variant !== 'object') continue

        const hasPrice =
          hasAnyKey(variant, PRICE_USD_KEYS) ||
          hasAnyKey(variant, PRICE_CDF_KEYS)

        if (!hasPrice) continue

        const variantPrice = resolveProductPrice(variant, rate)

        if (variantPrice.source === 'CDF_LEGACY') {
          return NextResponse.json(
            {
              error:
                'Une variante contient un prix CDF legacy sans taux USD/CDF disponible. Le prix USD doit être renseigné ou le taux doit être disponible.',
            },
            { status: 400 }
          )
        }

        if (variantPrice.source === 'NONE') {
          return NextResponse.json(
            {
              error:
                'Une variante ne contient aucun prix USD ou CDF exploitable.',
            },
            { status: 400 }
          )
        }
      }

      updatePayload.variantes = variantes.length > 0 ? variantes : null
    }

    if (body.delivery_config !== undefined) {
      const deliveryConfig = normalizeDeliveryConfig(
        { ...body, delivery_config: body.delivery_config },
        rate
      )

      updatePayload.delivery_config = deliveryConfig?.enabled
        ? deliveryConfig
        : null
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'Aucun champ à modifier.' },
        { status: 400 }
      )
    }

    updatePayload.updated_at = new Date().toISOString()

    const updated = await updateWithColumnFallback(
      supabase,
      parsedId.data,
      updatePayload
    )

    clearCachePrefix('admin-produits')

    return NextResponse.json({
      success: true,
      product: normalizeProductRow(updated, rate),
    })
  } catch (error: any) {
    logger.error?.('Crash PATCH admin/produits', error)

    return NextResponse.json(
      {
        error:
          error?.message || 'Erreur lors de la mise à jour du produit.',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE – Suppression d’un produit                              */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await enforceRateLimit({
    id: `admin-produits-delete:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin suppression produits.' },
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

  let body: any = {}

  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const productId = extractProductId(request, body)

  if (!productId) {
    return NextResponse.json(
      { error: 'ID produit requis (UUID valide).' },
      { status: 400 }
    )
  }

  const parsedId = uuidSchema.safeParse(productId)

  if (!parsedId.success) {
    return NextResponse.json(
      { error: 'ID produit invalide.' },
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
    const { error } = await supabase
      .from(PRODUCT_TABLE)
      .delete()
      .eq('id', parsedId.data)

    if (error) {
      throw error
    }

    clearCachePrefix('admin-produits')

    logger.info?.(`Produit supprimé : ${parsedId.data}`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error?.('Crash DELETE admin/produits', error)

    return NextResponse.json(
      {
        error:
          error?.message || 'Erreur lors de la suppression du produit.',
      },
      { status: 500 }
    )
  }
}