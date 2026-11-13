// lib/promotions.ts
import type { SupabaseClient } from '@supabase/supabase-js'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES MONÉTAIRES                                               */
/* ═══════════════════════════════════════════════════════════════ */

export interface MoneyPair {
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
/*  TYPES PROMOTIONS                                               */
/* ═══════════════════════════════════════════════════════════════ */

export interface PromotionActive {
  id?: string
  produit_id: string
  prix_promo: number
  prix_promo_usd?: number | null
  prix_promo_cdf?: number | null
  date_fin: string
  date_debut?: string | null
  type_promo?: string
  description?: string | null
  valeur_pourcentage?: number | null
  actif?: boolean
  exchange_rate?: number | null
  price_source?: MoneyPair['source']
  warnings?: string[]
}

export interface NormalizedProduct {
  id: string
  nom: string
  prix: number
  prix_usd: number | null
  prix_cdf: number | null
  images: string[]
  slug?: string | null
  stock?: number | null
  price_source: MoneyPair['source']
}

export interface NormalizedPromotion extends PromotionActive {
  final_pair: MoneyPair
  economie_pair?: MoneyPair | null
  product_pair?: MoneyPair | null
  produit?: NormalizedProduct | null
  discount_percent?: number | null
  economie?: number | null
  economie_usd?: number | null
  economie_cdf?: number | null
  prix_final_usd?: number | null
  prix_final_cdf?: number | null
}

export interface PromotionEnrichie extends NormalizedPromotion {}

export interface DesactivationResult {
  success: boolean
  count: number
  errors: string[]
  processedAt: string
}

export interface GetPromotionsOptions {
  /** Limite de résultats (défaut: 100) */
  limit?: number

  /** Inclure les détails des produits */
  includeProducts?: boolean

  /** Filtrer par produit spécifique */
  produitId?: string

  /** Timeout en ms (défaut: 10000) */
  timeout?: number

  /** Utiliser le cache (défaut: true) */
  useCache?: boolean

  /**
   * Si fourni, ne retourner que les promotions expirant
   * dans les N prochaines heures.
   */
  expiringSoonHours?: number
}

export interface DiscountCalculationResult {
  valid: boolean
  error?: string
  warnings: string[]

  discount_percent: number
  economie_usd: number
  economie_cdf: number | null
  economie_pair: MoneyPair

  prix_final_usd: number
  prix_final_cdf: number | null
  prix_final_pair: MoneyPair
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_LIMIT = 100
const DEFAULT_TIMEOUT = 10_000
const CACHE_TTL = 5 * 60 * 1000
const RATE_CACHE_TTL = 30_000
const MAX_RETRIES = 2
const RETRY_DELAY = 1_000
const BATCH_SIZE = 100

const PROMO_STATUS_COLUMNS = ['actif', 'active'] as const

/* ═══════════════════════════════════════════════════════════════ */
/*  LOGGING SIMPLE                                                 */
/* ═══════════════════════════════════════════════════════════════ */

const isDev = process.env.NODE_ENV === 'development'

function logWarn(...args: any[]) {
  if (isDev) console.warn(...args)
}

function logError(...args: any[]) {
  console.error(...args)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface CacheEntry<T> {
  data: T
  timestamp: number
}

class PromotionCache {
  private cache = new Map<string, CacheEntry<any>>()

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Permet le fallback même si le TTL est dépassé.
   */
  getRaw<T>(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    return entry as CacheEntry<T>
  }

  set<T>(key: string, data: T): void {
    if (this.cache.size >= 100) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }
}

const promotionCache = new PromotionCache()

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

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase()

    if (clean === 'true' || clean === 'yes' || clean === 'oui') return true
    if (clean === 'false' || clean === 'no' || clean === 'non') return false
  }

  return fallback
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
/*  TIMEOUT HELPER                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function withTimeout<T>(promise: Promise<T> | any, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('TIMEOUT'))
    }, ms)

    Promise.resolve(promise as Promise<T>).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TAUX SERVEUR USD/CDF                                           */
/* ═══════════════════════════════════════════════════════════════ */

let cachedServerRate: {
  value: number | null
  expiresAt: number
} | null = null

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

async function getServerUsdRate(supabase: SupabaseClient): Promise<number | null> {
  if (!supabase) return null

  const now = Date.now()

  if (cachedServerRate && cachedServerRate.expiresAt > now) {
    return cachedServerRate.value
  }

  const attempts = [
    async () =>
      await withTimeout(
        supabase
          .from('exchange_rates')
          .select('*')
          .eq('currency', 'USD')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        DEFAULT_TIMEOUT
      ),

    async () =>
      await withTimeout(
        supabase
          .from('exchange_rates')
          .select('*')
          .eq('devise', 'USD')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        DEFAULT_TIMEOUT
      ),

    async () =>
      await withTimeout(
        supabase
          .from('exchange_rates')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        DEFAULT_TIMEOUT
      ),

    async () =>
      await withTimeout(
        supabase
          .from('exchange_rates')
          .select('*')
          .limit(1)
          .maybeSingle(),
        DEFAULT_TIMEOUT
      ),
  ]

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt()

      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data
        const rate = resolveRateFromRow(row)

        cachedServerRate = {
          value: rate,
          expiresAt: now + RATE_CACHE_TTL,
        }

        return rate
      }

      if (isMissingTableError(error)) {
        cachedServerRate = {
          value: null,
          expiresAt: now + RATE_CACHE_TTL,
        }

        return null
      }

      if (isMissingColumnError(error)) {
        continue
      }
    } catch (err: any) {
      if (err?.message === 'TIMEOUT') {
        logWarn('⏱️ Timeout lecture exchange_rates promotions')
        continue
      }

      logWarn('Exception lecture exchange_rates promotions', err)
    }
  }

  cachedServerRate = {
    value: null,
    expiresAt: now + RATE_CACHE_TTL,
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

function resolveInputMoney(
  row: any,
  usdKeys: string[],
  cdfKeys: string[],
  legacyKeys: string[],
  rate: number | null,
  defaultCurrency: 'USD' | 'CDF' = 'CDF'
): MoneyPair {
  const usd = explicitUsd(...usdKeys.map((key) => row?.[key]))
  const cdf = explicitCdf(...cdfKeys.map((key) => row?.[key]))

  if (usd != null || cdf != null) {
    return resolvePricePair(usd, cdf, rate)
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
  const usdSource = row?.usd_source

  if (currency === 'USD' || usdSource === true) {
    return resolvePricePair(legacy, null, rate)
  }

  if (currency === 'CDF' || usdSource === false) {
    return resolvePricePair(null, legacy, rate)
  }

  return defaultCurrency === 'USD'
    ? resolvePricePair(legacy, null, rate)
    : resolvePricePair(null, legacy, rate)
}

function resolveMoneyInput(
  value: MoneyPair | number | null | undefined,
  rate: number | null
): MoneyPair {
  if (value == null) {
    return {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    }
  }

  if (typeof value === 'number') {
    const usd = explicitUsd(value)

    if (usd != null) {
      return resolvePricePair(usd, null, rate)
    }

    return {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    }
  }

  const usd = explicitUsd(value.usd)
  const cdf = explicitCdf(value.cdf)

  if (usd != null || cdf != null) {
    return resolvePricePair(usd, cdf, rate)
  }

  return {
    usd: 0,
    cdf: null,
    cdfKnown: false,
    source: 'NONE',
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  IMAGE NORMALIZATION                                            */
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

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT NORMALIZATION                                          */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeProductRow(
  row: any,
  rate: number | null
): NormalizedProduct | null {
  if (!row) return null

  const pricePair = resolveInputMoney(
    row,
    ['prix_usd', 'price_usd', 'unit_price_usd'],
    ['prix_cdf', 'price_cdf'],
    ['prix', 'price'],
    rate,
    'CDF'
  )

  return {
    id: String(row.id ?? ''),
    nom: String(row.nom ?? row.name ?? 'Produit'),
    prix: pricePair.cdfKnown ? pricePair.cdf ?? 0 : 0,
    prix_usd: pricePair.source === 'NONE' ? null : pricePair.usd,
    prix_cdf: pricePair.cdfKnown ? pricePair.cdf : null,
    images: normalizeImages(row.images ?? row.image ?? row.photos),
    slug: row.slug ?? null,
    stock: firstFinite(row.stock ?? row.quantity) ?? null,
    price_source: pricePair.source,
  }
}

function productToMoneyPair(product: NormalizedProduct | null | undefined): MoneyPair | null {
  if (!product) return null

  return {
    usd: product.prix_usd ?? 0,
    cdf: product.prix_cdf,
    cdfKnown: product.prix_cdf != null,
    source: product.price_source,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PROMOTION NORMALIZATION                                        */
/* ═══════════════════════════════════════════════════════════════ */

function normalizePromotionRow(
  row: any,
  rate: number | null,
  product?: NormalizedProduct | null
): NormalizedPromotion | null {
  if (!row) return null

  const type = String(
    row.type_promo ?? row.type ?? 'prix_fixe'
  ).trim().toLowerCase()

  const percentRaw = firstFinite(
    row.valeur_pourcentage,
    row.discount_percent,
    row.pourcentage,
    row.percent
  )

  let percent: number | null =
    percentRaw != null ? Math.round(percentRaw) : null

  if (percent != null && (percent < 0 || percent > 100)) {
    percent = null
  }

  const productPair = productToMoneyPair(product)

  let finalPair = resolveInputMoney(
    row,
    ['prix_promo_usd'],
    ['prix_promo_cdf'],
    ['prix_promo'],
    rate,
    'CDF'
  )

  if (type === 'cadeau') {
    finalPair = {
      usd: 0,
      cdf: 0,
      cdfKnown: true,
      source: 'USD',
    }
  }

  let economiePair: MoneyPair | null = null

  /**
   * Si c'est une réduction pourcentage et qu'on a le prix produit,
   * on calcule le prix final en USD principal.
   */
  if (
    type === 'pourcentage' &&
    percent != null &&
    percent > 0 &&
    productPair &&
    productPair.usd > 0
  ) {
    const finalUsd = round2(
      Math.max(0, productPair.usd * (1 - percent / 100))
    )

    finalPair = resolvePricePair(finalUsd, null, rate)
  }

  /**
   * Économie :
   * - uniquement si USD principal résoluble.
   * - sinon fallback CDF seulement pour affichage, pas pour calcul sécurisé.
   */
  if (
    productPair &&
    productPair.usd > 0 &&
    finalPair.source !== 'NONE' &&
    (finalPair.source === 'USD' || finalPair.source === 'CDF_CONVERTED')
  ) {
    const economieUsd = round2(
      Math.max(0, productPair.usd - finalPair.usd)
    )

    economiePair = resolvePricePair(economieUsd, null, rate)
  }

  const warnings: string[] = []

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (!rateOk) {
    if (finalPair.source === 'CDF_LEGACY') {
      warnings.push(
        'Prix promo CDF legacy non convertible : taux USD/CDF indisponible.'
      )
    }

    if (productPair?.source === 'CDF_LEGACY') {
      warnings.push(
        'Prix produit CDF legacy non convertible : taux USD/CDF indisponible.'
      )
    }
  }

  if (type === 'pourcentage' && (percent == null || percent < 1 || percent > 99)) {
    warnings.push('Pourcentage de réduction invalide ou manquant.')
  }

  if (
    type !== 'cadeau' &&
    type !== 'pourcentage' &&
    finalPair.source === 'NONE'
  ) {
    warnings.push('Prix promo manquant ou non exploitable.')
  }

  const discountPercent =
    percent != null
      ? percent
      : productPair && economiePair && productPair.usd > 0
        ? Math.round((economiePair.usd / productPair.usd) * 100)
        : null

  return {
    id: row.id != null ? String(row.id) : undefined,
    produit_id: String(row.produit_id ?? row.produitId ?? ''),

    prix_promo: finalPair.cdfKnown ? finalPair.cdf ?? 0 : 0,
    prix_promo_usd: finalPair.source === 'NONE' ? null : finalPair.usd,
    prix_promo_cdf: finalPair.cdfKnown ? finalPair.cdf : null,

    date_fin: String(row.date_fin ?? row.dateFin ?? row.expiration_date ?? ''),
    date_debut:
      row.date_debut ??
      row.dateDebut ??
      row.start_date ??
      null,

    type_promo: type,
    description: row.description ?? null,
    valeur_pourcentage: percent,

    actif: normalizeBoolean(row.actif ?? row.active, true),

    exchange_rate: rate,
    price_source: finalPair.source,
    warnings,

    final_pair: finalPair,
    economie_pair: economiePair,
    product_pair: productPair,
    produit: product ?? undefined,

    discount_percent: discountPercent,

    economie: economiePair?.cdfKnown
      ? economiePair.cdf ?? 0
      : economiePair?.usd ?? 0,

    economie_usd: economiePair?.source === 'NONE'
      ? null
      : economiePair?.usd ?? null,

    economie_cdf: economiePair?.cdfKnown
      ? economiePair.cdf
      : null,

    prix_final_usd: finalPair.source === 'NONE' ? null : finalPair.usd,
    prix_final_cdf: finalPair.cdfKnown ? finalPair.cdf : null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION                                                     */
/* ═══════════════════════════════════════════════════════════════ */

function isValidNormalizedPromotion(
  promo: NormalizedPromotion,
  nowDate = new Date()
): boolean {
  if (!promo) return false

  if (
    typeof promo.produit_id !== 'string' ||
    promo.produit_id.trim().length === 0
  ) {
    return false
  }

  const fin = promo.date_fin ? new Date(promo.date_fin) : null

  if (!fin || Number.isNaN(fin.getTime())) {
    return false
  }

  if (fin < nowDate) {
    return false
  }

  const type = promo.type_promo

  if (type === 'cadeau') {
    return true
  }

  if (type === 'pourcentage') {
    const percent = promo.valeur_pourcentage

    if (percent != null && percent >= 1 && percent <= 99) {
      return true
    }
  }

  const pair = promo.final_pair

  if (
    pair &&
    pair.source !== 'NONE' &&
    (pair.usd > 0 || (pair.cdfKnown && (pair.cdf ?? 0) > 0))
  ) {
    return true
  }

  if (Number(promo.prix_promo_usd ?? 0) > 0) return true
  if (Number(promo.prix_promo_cdf ?? 0) > 0) return true
  if (Number(promo.prix_promo ?? 0) > 0) return true

  return false
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH PRODUITS ASSOCIÉS                                        */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchProductsByIds(
  supabase: SupabaseClient,
  ids: string[],
  rate: number | null
): Promise<{
  map: Record<string, NormalizedProduct>
  error: boolean
}> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]

  if (uniqueIds.length === 0) {
    return { map: {}, error: false }
  }

  try {
    const { data, error } = await withTimeout<{
      data: any[] | null
      error: any
    }>(
      supabase
        .from('produits')
        .select('*')
        .in('id', uniqueIds),
      DEFAULT_TIMEOUT
    )

    if (error) {
      if (isMissingTableError(error)) {
        logWarn('Table produits indisponible pour promotions', error)
        return { map: {}, error: true }
      }

      logWarn('Erreur fetch produits promotions', error)
      return { map: {}, error: true }
    }

    const map: Record<string, NormalizedProduct> = {}

    for (const raw of data || []) {
      const normalized = normalizeProductRow(raw, rate)

      if (normalized?.id) {
        map[String(normalized.id)] = normalized
      }
    }

    return { map, error: false }
  } catch (err: any) {
    logWarn('Exception fetch produits promotions', err)
    return { map: {}, error: true }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH PROMOTIONS TOLÉRANT                                      */
/* ═══════════════════════════════════════════════════════════════ */

interface PromotionQueryParams {
  nowIso: string
  futureIso?: string | null
  limit: number
  produitId?: string
  timeout: number
}

async function tryFetchPromotionRows(
  supabase: SupabaseClient,
  params: PromotionQueryParams
): Promise<any[]> {
  const nowDate = new Date(params.nowIso)
  const futureDate = params.futureIso ? new Date(params.futureIso) : null

  const attempts = [
    { status: 'actif' as const, dates: true },
    { status: 'active' as const, dates: true },
    { status: 'actif' as const, dates: false },
    { status: 'active' as const, dates: false },
    { status: null, dates: true },
    { status: null, dates: false },
  ]

  let lastError: any = null

  for (const attempt of attempts) {
    try {
      let query = supabase.from('promotions').select('*')

      if (attempt.status) {
        query = query.eq(attempt.status, true)
      }

      if (attempt.dates) {
        query = query
          .lte('date_debut', params.nowIso)
          .gte('date_fin', params.nowIso)

        if (params.futureIso) {
          query = query.lte('date_fin', params.futureIso)
        }
      }

      if (params.produitId) {
        query = query.eq('produit_id', params.produitId)
      }

      query = query
        .order('date_fin', { ascending: true })
        .limit(params.limit)

      const { data, error } = await withTimeout<{
        data: any[] | null
        error: any
      }>(query, params.timeout)

      if (error) {
        lastError = error

        if (isMissingTableError(error)) {
          throw error
        }

        if (isMissingColumnError(error)) {
          continue
        }

        continue
      }

      let rows = Array.isArray(data) ? data : []

      /**
       * Filtre client si certaines colonnes n’étaient pas disponibles
       * ou si la requête serveur n’a pas pu les appliquer.
       */
      rows = rows.filter((row) => {
        const actif = normalizeBoolean(row.actif ?? row.active, true)

        if (!actif) return false

        const debutRaw =
          row.date_debut ??
          row.dateDebut ??
          row.start_date ??
          null

        const finRaw =
          row.date_fin ??
          row.dateFin ??
          row.expiration_date ??
          null

        if (!finRaw) return false

        const fin = new Date(finRaw)

        if (Number.isNaN(fin.getTime())) return false
        if (fin < nowDate) return false

        if (futureDate && fin > futureDate) return false

        if (debutRaw) {
          const debut = new Date(debutRaw)

          if (!Number.isNaN(debut.getTime()) && debut > nowDate) {
            return false
          }
        }

        if (params.produitId && String(row.produit_id ?? '') !== params.produitId) {
          return false
        }

        return true
      })

      return rows
    } catch (err: any) {
      lastError = err

      if (isMissingTableError(err)) {
        throw err
      }

      if (err?.message === 'TIMEOUT') {
        logWarn('⏱️ Timeout fetch promotions', err)
        continue
      }

      logWarn('Erreur tentative fetch promotions', err)
    }
  }

  throw lastError || new Error('Impossible de récupérer les promotions.')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FONCTION PRINCIPALE : getActivePromotions                      */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Récupère les promotions actives.
 *
 * Règle monétaire :
 * - USD = source principale.
 * - CDF = recalculé avec taux serveur.
 * - Legacy CDF-only toléré en lecture fallback.
 * - Aucun taux codé en dur.
 */
export async function getActivePromotions(
  supabase: SupabaseClient,
  options: GetPromotionsOptions = {}
): Promise<PromotionActive[]> {
  const {
    limit = DEFAULT_LIMIT,
    includeProducts = false,
    produitId,
    timeout = DEFAULT_TIMEOUT,
    useCache = true,
    expiringSoonHours,
  } = options

  const rate = await getServerUsdRate(supabase)

  const cacheKey = [
    'promotions',
    produitId || 'all',
    includeProducts ? 'with-products' : 'basic',
    limit,
    expiringSoonHours ?? 'no-expiry-filter',
    rate ?? 'none',
  ].join(':')

  if (useCache) {
    const cached = promotionCache.get<NormalizedPromotion[]>(cacheKey)

    if (cached) {
      logWarn('🎁 Promotions from cache:', cached.length)
      return cached
    }
  }

  const now = new Date()
  const nowIso = now.toISOString()

  const futureIso =
    expiringSoonHours != null && expiringSoonHours > 0
      ? new Date(now.getTime() + expiringSoonHours * 60 * 60 * 1000).toISOString()
      : null

  let lastError: any = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const rawRows = await tryFetchPromotionRows(supabase, {
        nowIso,
        futureIso,
        limit,
        produitId,
        timeout,
      })

      const produitIds = rawRows
        .map((row) => String(row.produit_id ?? ''))
        .filter(Boolean)

      let products: {
        map: Record<string, NormalizedProduct>
        error: boolean
      } = { map: {}, error: false }

      if (includeProducts && produitIds.length > 0) {
        products = await fetchProductsByIds(supabase, produitIds, rate)
      }

      const normalized = rawRows
        .map((row) => {
          const product =
            products.map[String(row.produit_id ?? '')] ?? null

          /**
           * Si on demandait les produits et que le fetch a réussi,
           * on exclut les promotions sans produit associé.
           */
          if (includeProducts && !products.error && !product) {
            return null
          }

          return normalizePromotionRow(row, rate, product)
        })
        .filter((promo): promo is NormalizedPromotion => Boolean(promo))

      const validated = normalized.filter((promo) =>
        isValidNormalizedPromotion(promo, now)
      )

      if (useCache) {
        promotionCache.set(cacheKey, validated)
      }

      logWarn('🎁 Promotions loaded:', {
        count: validated.length,
        fromCache: false,
        attempt: attempt + 1,
        rate,
      })

      return validated
    } catch (err: any) {
      lastError = err

      if (isMissingTableError(err)) {
        logWarn('Table promotions indisponible', err)
        return []
      }

      if (err?.message === 'TIMEOUT') {
        logWarn('⏱️ Timeout fetch promotions', err)
        break
      }

      if (attempt < MAX_RETRIES) {
        logWarn(
          `⚠️ Tentative ${attempt + 1}/${MAX_RETRIES + 1} échouée:`,
          err?.message
        )

        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt))
        )
      }
    }
  }

  /**
   * Fallback cache expiré réel.
   */
  const expired = promotionCache.getRaw<NormalizedPromotion[]>(cacheKey)

  if (expired) {
    logWarn('🔄 Utilisation du cache expiré pour promotions')
    return expired.data
  }

  logError('❌ Échec complet fetch promotions:', lastError?.message)
  return []
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FONCTION : getPromotionForProduct                              */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Récupère la promotion active pour un produit spécifique.
 */
export async function getPromotionForProduct(
  supabase: SupabaseClient,
  produitId: string,
  options: Omit<GetPromotionsOptions, 'produitId'> = {}
): Promise<PromotionActive | null> {
  const promotions = await getActivePromotions(supabase, {
    ...options,
    produitId,
    limit: 1,
  })

  return promotions[0] || null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CALCUL DISCOUNT ALIGNÉ USD / CDF                               */
/* ═══════════════════════════════════════════════════════════════ */

export function calculateDiscountPair(
  original: MoneyPair | number | null | undefined,
  promoInput: PromotionActive | NormalizedPromotion | any,
  rate: number | null = null
): DiscountCalculationResult {
  const warnings: string[] = []

  const promo: NormalizedPromotion =
    promoInput?.final_pair
      ? promoInput
      : normalizePromotionRow(promoInput, rate) ?? {
          produit_id: '',
          prix_promo: 0,
          date_fin: '',
          final_pair: {
            usd: 0,
            cdf: null,
            cdfKnown: false,
            source: 'NONE',
          },
        }

  const originalPair = resolveMoneyInput(original, rate)

  const invalidBase: DiscountCalculationResult = {
    valid: false,
    warnings,
    discount_percent: 0,
    economie_usd: 0,
    economie_cdf: null,
    economie_pair: {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    },
    prix_final_usd: 0,
    prix_final_cdf: null,
    prix_final_pair: {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    },
  }

  if (originalPair.source === 'NONE') {
    return {
      ...invalidBase,
      error: 'Montant original indisponible.',
    }
  }

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (originalPair.source === 'CDF_LEGACY' && !rateOk) {
    return {
      ...invalidBase,
      error:
        'Montant original CDF legacy non convertible : taux USD/CDF indisponible.',
    }
  }

  const originalUsd = originalPair.usd

  if (originalUsd == null || originalUsd < 0) {
    return {
      ...invalidBase,
      error: 'Montant original USD invalide.',
    }
  }

  let finalPair = promo.final_pair

  if (promo.type_promo === 'cadeau') {
    finalPair = {
      usd: 0,
      cdf: 0,
      cdfKnown: true,
      source: 'USD',
    }
  } else if (
    promo.type_promo === 'pourcentage' &&
    promo.valeur_pourcentage != null &&
    promo.valeur_pourcentage > 0
  ) {
    const percent = promo.valeur_pourcentage

    if (percent < 1 || percent > 99) {
      return {
        ...invalidBase,
        error: 'Pourcentage de réduction invalide.',
      }
    }

    const finalUsd = round2(
      Math.max(0, originalUsd * (1 - percent / 100))
    )

    finalPair = resolvePricePair(finalUsd, null, rate)
  } else if (!finalPair || finalPair.source === 'NONE') {
    finalPair = resolveInputMoney(
      promo,
      ['prix_promo_usd'],
      ['prix_promo_cdf'],
      ['prix_promo'],
      rate,
      'CDF'
    )
  }

  if (!finalPair || finalPair.source === 'NONE') {
    return {
      ...invalidBase,
      error: 'Prix promo indisponible.',
    }
  }

  if (finalPair.source === 'CDF_LEGACY' && !rateOk) {
    return {
      ...invalidBase,
      error:
        'Prix promo CDF legacy non convertible : taux USD/CDF indisponible.',
    }
  }

  let finalUsd = finalPair.usd

  if (finalUsd == null || finalUsd < 0) {
    return {
      ...invalidBase,
      error: 'Prix promo USD invalide.',
    }
  }

  if (finalUsd > originalUsd + 0.01) {
    warnings.push(
      'Prix promo supérieur au prix original : ramené au prix original.'
    )

    finalUsd = round2(originalUsd)
    finalPair = resolvePricePair(finalUsd, finalPair.cdf, rate)
  }

  const economieUsd = round2(Math.max(0, originalUsd - finalUsd))
  const economiePair = resolvePricePair(economieUsd, null, rate)

  const discountPercent =
    originalUsd > 0
      ? Math.round((economieUsd / originalUsd) * 100)
      : promo.valeur_pourcentage ?? 0

  return {
    valid: true,
    warnings,
    discount_percent: discountPercent,
    economie_usd: economieUsd,
    economie_cdf: economiePair.cdfKnown ? economiePair.cdf : null,
    economie_pair: economiePair,
    prix_final_usd: finalUsd,
    prix_final_cdf: finalPair.cdfKnown ? finalPair.cdf : null,
    prix_final_pair: finalPair,
  }
}

/**
 * Version rétrocompatible.
 *
 * Important :
 * - Les champs `economie` et `prix_final` sont désormais alignés USD principal,
 *   sauf si une valeur CDF connue est disponible pour compatibilité legacy.
 * - Pour un affichage strict USD / CDF, utiliser `calculateDiscountPair`.
 */
export function calculateDiscount(
  prixOriginal: number | MoneyPair | null | undefined,
  promotion: PromotionActive | NormalizedPromotion,
  rate: number | null = null
): {
  discount_percent: number
  economie: number
  prix_final: number
  economie_usd: number
  economie_cdf: number | null
  prix_final_usd: number
  prix_final_cdf: number | null
  prix_final_pair: MoneyPair
  warnings: string[]
  error?: string
} {
  const result = calculateDiscountPair(prixOriginal, promotion, rate)

  if (!result.valid) {
    return {
      discount_percent: 0,
      economie: 0,
      prix_final: 0,
      economie_usd: 0,
      economie_cdf: null,
      prix_final_usd: 0,
      prix_final_cdf: null,
      prix_final_pair: result.prix_final_pair,
      warnings: result.warnings,
      error: result.error,
    }
  }

  return {
    discount_percent: result.discount_percent,
    economie: result.economie_pair.cdfKnown
      ? result.economie_pair.cdf ?? 0
      : result.economie_usd,
    prix_final: result.prix_final_pair.cdfKnown
      ? result.prix_final_pair.cdf ?? 0
      : result.prix_final_usd,
    economie_usd: result.economie_usd,
    economie_cdf: result.economie_cdf,
    prix_final_usd: result.prix_final_usd,
    prix_final_cdf: result.prix_final_cdf,
    prix_final_pair: result.prix_final_pair,
    warnings: result.warnings,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CHECK VALIDITÉ AVANT APPLICATION                               */
/* ═══════════════════════════════════════════════════════════════ */

export async function checkPromotionValidity(
  supabase: SupabaseClient,
  produitId: string,
  prixPromoAttendu: number | MoneyPair,
  options?: {
    useCache?: boolean
  }
): Promise<{
  valid: boolean
  promotion?: PromotionActive
  reason?: string
}> {
  const rate = await getServerUsdRate(supabase)

  const promotion = await getPromotionForProduct(supabase, produitId, {
    useCache: options?.useCache ?? false,
  })

  if (!promotion) {
    return {
      valid: false,
      reason: 'Aucune promotion active pour ce produit',
    }
  }

  const promo = promotion as NormalizedPromotion

  const finalPair =
    promo.final_pair ??
    resolveInputMoney(
      promo,
      ['prix_promo_usd'],
      ['prix_promo_cdf'],
      ['prix_promo'],
      rate,
      'CDF'
    )

  const expectedPair = resolveMoneyInput(prixPromoAttendu, rate)

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (expectedPair.source === 'NONE') {
    return {
      valid: false,
      promotion,
      reason: 'Prix promo attendu indisponible.',
    }
  }

  if (finalPair.source === 'NONE') {
    return {
      valid: false,
      promotion,
      reason: 'Prix promo actuel indisponible.',
    }
  }

  /**
   * Comparaison sécurisée :
   * - priorité USD principal ;
   * - fallback CDF seulement si les deux côtés ont un CDF connu.
   */
  if (
    (expectedPair.source === 'CDF_LEGACY' ||
      finalPair.source === 'CDF_LEGACY') &&
    !rateOk
  ) {
    if (
      expectedPair.cdfKnown &&
      finalPair.cdfKnown &&
      expectedPair.cdf != null &&
      finalPair.cdf != null
    ) {
      if (Math.abs(expectedPair.cdf - finalPair.cdf) > 1) {
        return {
          valid: false,
          promotion,
          reason: `Prix promo modifié (CDF legacy): ${finalPair.cdf} au lieu de ${expectedPair.cdf}`,
        }
      }
    } else {
      return {
        valid: false,
        promotion,
        reason:
          'Prix promo non comparable en toute sécurité : USD/CDF indisponible.',
      }
    }
  } else {
    const expectedUsd = expectedPair.usd
    const finalUsd = finalPair.usd

    if (expectedUsd == null || finalUsd == null) {
      return {
        valid: false,
        promotion,
        reason:
          'Prix promo non comparable en toute sécurité : USD indisponible.',
      }
    }

    if (Math.abs(expectedUsd - finalUsd) > 0.01) {
      return {
        valid: false,
        promotion,
        reason: `Prix promo modifié: ${finalUsd} USD au lieu de ${expectedUsd} USD`,
      }
    }
  }

  if (promo.date_fin && new Date(promo.date_fin) < new Date()) {
    return {
      valid: false,
      promotion,
      reason: 'Promotion expirée',
    }
  }

  return {
    valid: true,
    promotion,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DÉSACTIVATION PROMOTIONS EXPIRÉES                              */
/* ═══════════════════════════════════════════════════════════════ */

async function updateWithColumnFallback(
  supabase: SupabaseClient,
  ids: string[],
  payload: Record<string, any>
): Promise<Error | null> {
  let current = { ...payload }

  for (let attempt = 0; attempt < 20; attempt++) {
    if (ids.length === 0) return null

    if (Object.keys(current).length === 0) {
      return new Error('Aucune colonne valide pour la mise à jour.')
    }

    try {
      const { error } = await withTimeout<{ error: any }>(
        supabase
          .from('promotions')
          .update(current)
          .in('id', ids),
        DEFAULT_TIMEOUT
      )

      if (!error) return null

      if (isMissingColumnError(error)) {
        const missing = extractMissingColumnName(
          String(error.message || '')
        )

        if (missing && missing in current) {
          delete current[missing]
          continue
        }
      }

      return new Error(error?.message || 'Erreur mise à jour promotions.')
    } catch (err: any) {
      if (isMissingColumnError(err)) {
        const missing = extractMissingColumnName(
          String(err.message || '')
        )

        if (missing && missing in current) {
          delete current[missing]
          continue
        }
      }

      return err instanceof Error ? err : new Error(String(err))
    }
  }

  return new Error('Colonnes manquantes trop nombreuses pour la mise à jour.')
}

/**
 * Désactive les promotions expirées.
 *
 * Améliorations :
 * - ne dépend plus d’un offset fragile après update ;
 * - tolère `actif` ou `active` ;
 * - invalide le cache ;
 * - traite les colonnes manquantes sans crash.
 */
export async function desactiverPromotionsExpirees(
  supabase: SupabaseClient
): Promise<DesactivationResult> {
  const now = new Date()
  const nowIso = now.toISOString()

  const errors: string[] = []
  let totalCount = 0

  try {
    for (const statusCol of PROMO_STATUS_COLUMNS) {
      let loop = 0

      while (loop < 1000) {
        let data: any[] | null = null
        let fetchError: any = null

        try {
          const res = await withTimeout<{
            data: any[] | null
            error: any
          }>(
            supabase
              .from('promotions')
              .select('id')
              .eq(statusCol, true)
              .lt('date_fin', nowIso)
              .order('id', { ascending: true })
              .limit(BATCH_SIZE),
            DEFAULT_TIMEOUT
          )

          data = res.data
          fetchError = res.error
        } catch (err: any) {
          if (isMissingColumnError(err)) {
            break
          }

          if (isMissingTableError(err)) {
            errors.push(`Table promotions indisponible: ${err.message}`)
            return {
              success: false,
              count: totalCount,
              errors,
              processedAt: nowIso,
            }
          }

          errors.push(`Erreur fetch ${statusCol}: ${err.message}`)
          break
        }

        if (fetchError) {
          if (isMissingColumnError(fetchError)) {
            break
          }

          if (isMissingTableError(fetchError)) {
            errors.push(
              `Table promotions indisponible: ${fetchError.message}`
            )

            return {
              success: false,
              count: totalCount,
              errors,
              processedAt: nowIso,
            }
          }

          errors.push(
            `Erreur fetch lot ${statusCol}: ${fetchError.message}`
          )

          break
        }

        if (!data || data.length === 0) {
          break
        }

        const ids = data
          .map((row) => String(row.id ?? ''))
          .filter(Boolean)

        if (ids.length === 0) {
          break
        }

        const payload: Record<string, any> = {
          updated_at: nowIso,
        }

        /**
         * On tente de mettre à jour toutes les colonnes de statut connues.
         * Les colonnes manquantes seront retirées par fallback.
         */
        for (const col of PROMO_STATUS_COLUMNS) {
          payload[col] = false
        }

        const updateError = await updateWithColumnFallback(
          supabase,
          ids,
          payload
        )

        if (updateError) {
          errors.push(
            `Erreur update lot ${statusCol}: ${updateError.message}`
          )
        } else {
          totalCount += ids.length
        }

        if (data.length < BATCH_SIZE) {
          break
        }

        loop++
      }
    }

    promotionCache.invalidate('promotions')

    const result: DesactivationResult = {
      success: errors.length === 0,
      count: totalCount,
      errors,
      processedAt: nowIso,
    }

    logWarn('🧹 Désactivation promotions expirées:', result)

    return result
  } catch (err: any) {
    logError('❌ Erreur critique désactivation promotions:', err)

    return {
      success: false,
      count: totalCount,
      errors: [...errors, err?.message || 'Erreur inconnue'],
      processedAt: nowIso,
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UTILITAIRES SUPPLÉMENTAIRES                                    */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Invalide le cache des promotions.
 */
export function invalidatePromotionsCache(pattern?: string): void {
  promotionCache.invalidate(pattern)
  logWarn('🗑️ Cache promotions invalidé', pattern ?? 'global')
}

/**
 * Compte le nombre de promotions actives.
 */
export async function countActivePromotions(
  supabase: SupabaseClient
): Promise<number> {
  const nowIso = new Date().toISOString()

  for (const statusCol of PROMO_STATUS_COLUMNS) {
    try {
      const { count, error } = await withTimeout<{
        count: number | null
        error: any
      }>(
        supabase
          .from('promotions')
          .select('*', { count: 'exact', head: true })
          .eq(statusCol, true)
          .lte('date_debut', nowIso)
          .gte('date_fin', nowIso),
        DEFAULT_TIMEOUT
      )

      if (!error) {
        return count || 0
      }

      if (isMissingColumnError(error)) {
        continue
      }

      if (isMissingTableError(error)) {
        logWarn('Table promotions indisponible pour count', error)
        return 0
      }

      logWarn('Erreur count promotions', error)
    } catch (err: any) {
      if (isMissingColumnError(err)) {
        continue
      }

      logWarn('Exception count promotions', err)
    }
  }

  return 0
}

/**
 * Récupère les promotions expirant bientôt.
 */
export async function getExpiringSoonPromotions(
  supabase: SupabaseClient,
  hoursAhead = 24
): Promise<PromotionActive[]> {
  return getActivePromotions(supabase, {
    limit: DEFAULT_LIMIT,
    includeProducts: false,
    expiringSoonHours: hoursAhead,
    useCache: false,
  })
}