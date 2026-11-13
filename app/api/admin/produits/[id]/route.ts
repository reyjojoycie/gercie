// app/api/admin/produits/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import logger from '@/lib/logger'
import {
  checkRateLimit,
  applyRateLimitHeaders,
} from '@/lib/rateLimit'

import { updateProductSchema } from '@/lib/validations/product'
import { normalizeProductDeliveryConfig } from '@/lib/shipping-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

interface ProductColumnSupport {
  prix_usd: boolean
  price_usd: boolean
  unit_price_usd: boolean
  prix_cdf: boolean
  price_cdf: boolean
  prix: boolean
  price: boolean
  exchange_rate: boolean
  delivery_config: boolean
  variants: boolean
  variantes: boolean
  est_actif: boolean
  active: boolean
  deleted_at: boolean
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
 * Autorise 0.
 * Important : 0 USD explicite doit être respecté.
 */
function explicitNonNegative(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return round2(n)
    }
  }

  return null
}

function getUsdSignal(payload: any): number | null {
  return explicitNonNegative(
    payload?.prix_usd,
    payload?.price_usd,
    payload?.unit_price_usd,
    payload?.prixUSD,
    payload?.priceUSD
  )
}

function getCdfSignal(payload: any): number | null {
  return explicitNonNegative(
    payload?.prix,
    payload?.price,
    payload?.prix_cdf,
    payload?.price_cdf,
    payload?.prixCDF,
    payload?.priceCDF
  )
}

/**
 * Règle absolue :
 * - Si USD existe (y compris 0) → USD = vérité.
 *   CDF = USD × taux serveur.
 *   Si taux indisponible, on conserve un CDF legacy seulement s’il était explicitement présent.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux serveur.
 *
 * - Si CDF seul et taux indisponible → lecture tolérée, écriture refusée.
 *
 * - Aucun taux codé en dur.
 */
function resolveProductPricePair(
  payload: any,
  rate: number | null
): MoneyPair {
  const usdSignal = getUsdSignal(payload)
  const cdfSignal = getCdfSignal(payload)

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (usdSignal != null) {
    const usd = round2(usdSignal)

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
      cdf: cdfSignal != null ? roundCdf(cdfSignal) : null,
      cdfKnown: cdfSignal != null,
      source: 'USD',
    }
  }

  if (cdfSignal != null && rateOk) {
    const usd = round2(toUsd(cdfSignal, rateNum))

    return {
      usd,
      cdf: roundCdf(toCdf(usd, rateNum)),
      cdfKnown: true,
      source: 'CDF_CONVERTED',
    }
  }

  if (cdfSignal != null) {
    return {
      usd: 0,
      cdf: roundCdf(cdfSignal),
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

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE ERROR HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function isMissingTableError(error: any): boolean {
  const code = error?.code
  const message = String(error?.message || '')

  return (
    code === '42P01' ||
    /relation .* does not exist|table .* does not exist|could not find the relationship/i.test(
      message
    )
  )
}

function isMissingColumnError(error: any): boolean {
  const code = error?.code
  const message = String(error?.message || '')

  return (
    code === '42703' ||
    code === '42701' ||
    /column .* does not exist|could not find the .* column|schema cache.*could not find/i.test(
      message
    )
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE CLIENT / PARAMS                                       */
/* ═══════════════════════════════════════════════════════════════ */

async function getSupabase(): Promise<any> {
  const rawClient = await createClient(true)
  return (rawClient as any)?.supabase || rawClient
}

async function resolveRouteParams(context: any): Promise<{ id: string }> {
  const raw = context?.params
  const resolved = raw instanceof Promise ? await raw : raw

  return {
    id: String(resolved?.id || ''),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TAUX SERVEUR                                                   */
/* ═══════════════════════════════════════════════════════════════ */

let cachedServerRate: {
  value: number | null
  expiresAt: number
} | null = null

function resolveRateFromRow(row: any): number | null {
  return explicitNonNegative(
    row?.rate,
    row?.usd_rate,
    row?.taux,
    row?.value,
    row?.data?.rate,
    row?.current?.rate
  )
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
          value: rate != null ? round2(rate) : null,
          expiresAt: now + 30_000,
        }

        return cachedServerRate.value
      }

      if (isMissingTableError(error)) {
        cachedServerRate = {
          value: null,
          expiresAt: now + 30_000,
        }

        return null
      }

      if (isMissingColumnError(error)) {
        continue
      }
    } catch (err) {
      logger.error?.(
        'Exception lecture exchange_rates admin produit',
        err
      )
    }
  }

  cachedServerRate = {
    value: null,
    expiresAt: now + 30_000,
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COLUMN DETECTION                                               */
/* ═══════════════════════════════════════════════════════════════ */

const columnCache = new Map<string, boolean>()

async function hasColumn(
  supabase: any,
  table: string,
  column: string
): Promise<boolean> {
  if (!supabase) return false

  const key = `${table}.${column}`

  if (columnCache.has(key)) {
    return columnCache.get(key) === true
  }

  try {
    const { error } = await supabase
      .from(table)
      .select(column, { head: true, count: 'exact' })
      .limit(1)

    if (!error) {
      columnCache.set(key, true)
      return true
    }

    if (isMissingColumnError(error) || isMissingTableError(error)) {
      columnCache.set(key, false)
      return false
    }

    return false
  } catch {
    return false
  }
}

async function detectProductColumns(
  supabase: any
): Promise<ProductColumnSupport> {
  const [
    prix_usd,
    price_usd,
    unit_price_usd,
    prix_cdf,
    price_cdf,
    prix,
    price,
    exchange_rate,
    delivery_config,
    variants,
    variantes,
    est_actif,
    active,
    deleted_at,
  ] = await Promise.all([
    hasColumn(supabase, 'produits', 'prix_usd'),
    hasColumn(supabase, 'produits', 'price_usd'),
    hasColumn(supabase, 'produits', 'unit_price_usd'),
    hasColumn(supabase, 'produits', 'prix_cdf'),
    hasColumn(supabase, 'produits', 'price_cdf'),
    hasColumn(supabase, 'produits', 'prix'),
    hasColumn(supabase, 'produits', 'price'),
    hasColumn(supabase, 'produits', 'exchange_rate'),
    hasColumn(supabase, 'produits', 'delivery_config'),
    hasColumn(supabase, 'produits', 'variants'),
    hasColumn(supabase, 'produits', 'variantes'),
    hasColumn(supabase, 'produits', 'est_actif'),
    hasColumn(supabase, 'produits', 'active'),
    hasColumn(supabase, 'produits', 'deleted_at'),
  ])

  return {
    prix_usd,
    price_usd,
    unit_price_usd,
    prix_cdf,
    price_cdf,
    prix,
    price,
    exchange_rate,
    delivery_config,
    variants,
    variantes,
    est_actif,
    active,
    deleted_at,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30_000

function getCache(key: string) {
  const entry = cache.get(key)

  if (!entry) return null

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }

  return entry.data
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() })
}

function clearCachePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}

function invalidateProductCaches() {
  clearCachePrefix('admin-produit')
  clearCachePrefix('admin-produits')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const idSchema = z.string().uuid('ID produit invalide')

const lenientProductUpdateSchema = z.object({
  nom: z.string().min(1).optional(),
  slug: z.string().optional(),
  description: z.string().optional(),

  prix_usd: z.any().optional(),
  price_usd: z.any().optional(),
  unit_price_usd: z.any().optional(),

  prix: z.any().optional(),
  price: z.any().optional(),
  prix_cdf: z.any().optional(),
  price_cdf: z.any().optional(),

  stock: z.any().optional(),
  limit_per_client: z.any().optional(),

  est_actif: z.boolean().optional(),
  active: z.boolean().optional(),

  categorie_id: z.string().optional(),
  category_id: z.string().optional(),

  images: z.any().optional(),
  badges: z.any().optional(),

  delivery_config: z.any().optional(),
  variants: z.any().optional(),
  variantes: z.any().optional(),

  poids_kg: z.any().optional(),
  longueur_cm: z.any().optional(),
  largeur_cm: z.any().optional(),
  hauteur_cm: z.any().optional(),

  negociable: z.boolean().optional(),
  featured: z.boolean().optional(),

  total_ventes: z.any().optional(),
  sku: z.string().optional(),
  meta: z.any().optional(),
})

const patchProductSchema = z.object({
  est_actif: z.boolean().optional(),
  active: z.boolean().optional(),
})

function parseProductUpdateBody(body: any): {
  data: any | null
  used: 'strict' | 'lenient' | 'none'
  error?: any
  strictError?: any
} {
  let strictResult: any = null

  try {
    strictResult = (updateProductSchema as any)?.safeParse?.(body)
  } catch {
    strictResult = null
  }

  if (strictResult?.success) {
    return {
      data: strictResult.data,
      used: 'strict',
    }
  }

  const lenientResult = lenientProductUpdateSchema.safeParse(body)

  if (lenientResult.success) {
    return {
      data: lenientResult.data,
      used: 'lenient',
      strictError: strictResult?.error,
    }
  }

  return {
    data: null,
    used: 'none',
    error: lenientResult.error ?? strictResult?.error,
    strictError: strictResult?.error,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeVariantPayload(
  variant: any,
  rate: number | null
): any {
  const money = resolveProductPricePair(variant, rate)
  const out: any = { ...(variant || {}) }

  if (money.source !== 'NONE' && money.source !== 'CDF_LEGACY') {
    out.prix_usd = money.usd
    out.price_usd = money.usd
    out.unit_price_usd = money.usd

    if (money.cdf != null) {
      out.prix_cdf = money.cdf
      out.price_cdf = money.cdf
      out.prix = money.cdf
      out.price = money.cdf
    }
  }

  const rawDelivery =
    variant?.delivery_config ?? variant?.deliveryConfig ?? null

  if (rawDelivery) {
    out.delivery_config = normalizeProductDeliveryConfig(
      rawDelivery,
      variant,
      rate
    )
  }

  return out
}

function hasLegacyDeliveryFields(payload: any): boolean {
  return (
    payload?.livraison_domicile != null ||
    payload?.livraison_point_retrait != null ||
    payload?.livraison_express != null ||
    payload?.express_gratuit != null ||
    payload?.livraison_domicile_active != null ||
    payload?.livraison_point_retrait_active != null ||
    payload?.livraison_express_active != null ||
    payload?.delay_livraison != null
  )
}

function normalizeProductForResponse(
  product: any,
  rate: number | null
): any {
  const money = resolveProductPricePair(product, rate)

  const rawDelivery =
    product?.delivery_config ??
    product?.deliveryConfig ??
    null

  const deliveryConfig = normalizeProductDeliveryConfig(
    rawDelivery,
    product,
    rate
  )

  const variantsSource =
    product?.variants ??
    product?.variantes ??
    null

  const normalizedVariants = Array.isArray(variantsSource)
    ? variantsSource.map((v: any) => normalizeVariantPayload(v, rate))
    : variantsSource

  return {
    ...(product || {}),

    prix_usd: money.usd,
    price_usd: money.usd,
    unit_price_usd: money.usd,

    prix_cdf: money.cdf ?? 0,
    price_cdf: money.cdf ?? 0,

    prix: money.cdf ?? product?.prix ?? 0,
    price: money.cdf ?? product?.price ?? 0,

    exchange_rate: rate,
    price_source: money.source,

    delivery_config: deliveryConfig,
    variants: normalizedVariants,
    variantes: normalizedVariants,
  }
}

function omit(obj: any, keys: string[]): any {
  const out = { ...(obj || {}) }

  for (const key of keys) {
    delete out[key]
  }

  return out
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Détail produit admin                                     */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request, context: any) {
  const { id } = await resolveRouteParams(context)

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-produit-get:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin produit.' },
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

  const parsedId = idSchema.safeParse(id)

  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: 'ID produit invalide',
        details: parsedId.error.flatten(),
      },
      { status: 400 }
    )
  }

  const produitId = parsedId.data

  const supabase = await getSupabase()

  if (!supabase || typeof supabase.from !== 'function') {
    return NextResponse.json(
      { error: 'Configuration Supabase invalide' },
      { status: 500 }
    )
  }

  try {
    const serverRate = await getServerUsdRate(supabase)

    const cacheKey = `admin-produit:${produitId}:${serverRate ?? 'none'}`
    const cached = getCache(cacheKey)

    if (cached) {
      return NextResponse.json(cached)
    }

    const { data: product, error } = await supabase
      .from('produits')
      .select('*')
      .eq('id', produitId)
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: 'Produit introuvable' },
          { status: 404 }
        )
      }

      logger.error?.(
        `Erreur GET admin/produits/${produitId}`,
        error
      )

      return NextResponse.json(
        {
          error: 'Erreur lors du chargement du produit',
          details: error?.message,
        },
        { status: 500 }
      )
    }

    if (!product) {
      return NextResponse.json(
        { error: 'Produit introuvable' },
        { status: 404 }
      )
    }

    const storedRate =
      parseFiniteNumber(
        product.exchange_rate ??
          product.shipping_rate_used ??
          product.rate
      ) ?? null

    const effectiveRate = serverRate ?? storedRate ?? null

    const response = normalizeProductForResponse(
      product,
      effectiveRate
    )

    setCache(cacheKey, response)

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error?.(
      `Crash GET admin/produits/${produitId}`,
      error
    )

    return NextResponse.json(
      {
        error: 'Erreur serveur interne admin produit',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUT – Mise à jour produit                                      */
/* ═══════════════════════════════════════════════════════════════ */

export async function PUT(request: Request, context: any) {
  const { id } = await resolveRouteParams(context)

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-produit-put:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin mise à jour produit.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  let adminUser: any = null

  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  const parsedId = idSchema.safeParse(id)

  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: 'ID produit invalide',
        details: parsedId.error.flatten(),
      },
      { status: 400 }
    )
  }

  const produitId = parsedId.data

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

  if (!supabase || typeof supabase.from !== 'function') {
    return NextResponse.json(
      { error: 'Configuration Supabase invalide' },
      { status: 500 }
    )
  }

  try {
    const serverRate = await getServerUsdRate(supabase)

    const { data: existing, error: existingError } = await supabase
      .from('produits')
      .select(
        'id, prix, prix_usd, prix_cdf, exchange_rate, shipping_rate_used, rate'
      )
      .eq('id', produitId)
      .maybeSingle()

    if (existingError) {
      if (isMissingTableError(existingError)) {
        return NextResponse.json(
          { error: 'Produit introuvable' },
          { status: 404 }
        )
      }

      logger.error?.(
        `Erreur fetch existant PUT admin/produits/${produitId}`,
        existingError
      )

      return NextResponse.json(
        {
          error: 'Erreur lors de la vérification du produit',
          details: existingError?.message,
        },
        { status: 500 }
      )
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Produit introuvable' },
        { status: 404 }
      )
    }

    const storedRate =
      parseFiniteNumber(
        existing.exchange_rate ??
          existing.shipping_rate_used ??
          existing.rate
      ) ?? null

    const effectiveRate = serverRate ?? storedRate ?? null

    const parsedBody = parseProductUpdateBody(body)

    if (!parsedBody.data) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details:
            parsedBody.error?.flatten?.().fieldErrors ??
            parsedBody.error?.message ??
            'Corps invalide',
          strictDetails:
            parsedBody.strictError?.flatten?.().fieldErrors ??
            undefined,
        },
        { status: 400 }
      )
    }

    const hasPriceSignalInBody =
      getUsdSignal(body) != null || getCdfSignal(body) != null

    let money: MoneyPair | null = null

    if (hasPriceSignalInBody) {
      money = resolveProductPricePair(body, effectiveRate)

      if (money.source === 'NONE') {
        return NextResponse.json(
          {
            error:
              'Aucun prix USD ou CDF valide détecté dans la mise à jour.',
          },
          { status: 400 }
        )
      }

      if (money.source === 'CDF_LEGACY') {
        return NextResponse.json(
          {
            error:
              'Impossible d’enregistrer un prix CDF comme vérité sans prix USD explicite ni taux USD/CDF disponible.',
          },
          { status: 400 }
        )
      }
    }

    const supports = await detectProductColumns(supabase)

    const hasUsdColumn =
      supports.prix_usd ||
      supports.price_usd ||
      supports.unit_price_usd

    if (money && !hasUsdColumn && money.cdf == null) {
      return NextResponse.json(
        {
          error:
            'Le produit ne possède pas de colonne prix USD exploitable et aucun CDF ne peut être calculé avec le taux courant.',
        },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    const data: any = {
      ...parsedBody.data,
      updated_at: now,
    }

    const moneyKeys = [
      'prix_usd',
      'price_usd',
      'unit_price_usd',
      'prix_cdf',
      'price_cdf',
      'prix',
      'price',
      'exchange_rate',
    ]

    for (const key of moneyKeys) {
      if (!(supports as any)[key]) {
        delete data[key]
      }
    }

    if (money) {
      if (supports.prix_usd) data.prix_usd = money.usd
      if (supports.price_usd) data.price_usd = money.usd
      if (supports.unit_price_usd) data.unit_price_usd = money.usd

      if (money.cdf != null) {
        if (supports.prix_cdf) data.prix_cdf = money.cdf
        if (supports.price_cdf) data.price_cdf = money.cdf
        if (supports.prix) data.prix = money.cdf
        if (supports.price) data.price = money.cdf
      } else {
        delete data.prix_cdf
        delete data.price_cdf
        delete data.prix
        delete data.price
      }

      if (supports.exchange_rate && effectiveRate != null) {
        data.exchange_rate = round2(effectiveRate)
      }
    } else {
      for (const key of moneyKeys) {
        delete data[key]
      }
    }

    const rawDelivery =
      body.delivery_config ??
      body.deliveryConfig ??
      parsedBody.data.delivery_config ??
      parsedBody.data.deliveryConfig ??
      null

    const shouldNormalizeDelivery =
      rawDelivery != null || hasLegacyDeliveryFields(body)

    if (shouldNormalizeDelivery && supports.delivery_config) {
      data.delivery_config = normalizeProductDeliveryConfig(
        rawDelivery,
        {
          ...parsedBody.data,
          ...body,
        },
        effectiveRate
      )
    } else {
      delete data.delivery_config
    }

    const rawVariants =
      body.variants ??
      body.variantes ??
      parsedBody.data.variants ??
      parsedBody.data.variantes ??
      null

    if (Array.isArray(rawVariants)) {
      const normalizedVariants = rawVariants.map((v: any) =>
        normalizeVariantPayload(v, effectiveRate)
      )

      if (supports.variants) data.variants = normalizedVariants
      if (supports.variantes) data.variantes = normalizedVariants

      if (!supports.variants) delete data.variants
      if (!supports.variantes) delete data.variantes
    } else {
      delete data.variants
      delete data.variantes
    }

    const attempts = [
      {
        name: 'full',
        data,
      },
      {
        name: 'without_delivery',
        data: omit(data, ['delivery_config']),
      },
      {
        name: 'without_variants',
        data: omit(data, ['variants', 'variantes']),
      },
      {
        name: 'without_extra_money_aliases',
        data: omit(data, [
          'price_usd',
          'unit_price_usd',
          'price_cdf',
          'price',
        ]),
      },
      {
        name: 'legacy_prix_only',
        data: {
          ...omit(data, [
            'prix_usd',
            'price_usd',
            'unit_price_usd',
            'prix_cdf',
            'price_cdf',
          ]),
          ...(data.prix != null ? { prix: data.prix } : {}),
        },
      },
    ]

    let updatedProduct: any = null
    let lastError: any = null

    for (const attempt of attempts) {
      try {
        const { data: row, error } = await supabase
          .from('produits')
          .update(attempt.data)
          .eq('id', produitId)
          .select('*')
          .maybeSingle()

        if (!error && row) {
          updatedProduct = row
          break
        }

        lastError = error

        if (isMissingColumnError(error)) {
          continue
        }

        if (isMissingTableError(error)) {
          break
        }

        logger.error?.(
          {
            error,
            attempt: attempt.name,
            produitId,
            adminId: adminUser?.id ?? null,
          },
          'Échec PUT admin produit'
        )

        return NextResponse.json(
          {
            error: 'Échec mise à jour du produit',
            details: error?.message,
          },
          { status: 500 }
        )
      } catch (err: any) {
        lastError = err

        if (isMissingColumnError(err)) {
          continue
        }

        logger.error?.(
          {
            err,
            attempt: attempt.name,
            produitId,
            adminId: adminUser?.id ?? null,
          },
          'Exception PUT admin produit'
        )

        return NextResponse.json(
          {
            error: 'Échec mise à jour du produit',
            details: err?.message,
          },
          { status: 500 }
        )
      }
    }

    if (!updatedProduct) {
      return NextResponse.json(
        {
          error: 'Aucune mise à jour appliquée',
          details: lastError?.message,
        },
        { status: 500 }
      )
    }

    invalidateProductCaches()

    logger.info?.(
      {
        produitId,
        adminId: adminUser?.id ?? null,
        usedParser: parsedBody.used,
      },
      'Produit admin mis à jour'
    )

    return NextResponse.json(
      normalizeProductForResponse(
        updatedProduct,
        effectiveRate
      )
    )
  } catch (error: any) {
    logger.error?.(
      `Crash PUT admin/produits/${produitId}`,
      error
    )

    return NextResponse.json(
      {
        error: 'Erreur serveur interne admin mise à jour produit',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PATCH – Activation / désactivation rapide                      */
/* ═══════════════════════════════════════════════════════════════ */

export async function PATCH(request: Request, context: any) {
  const { id } = await resolveRouteParams(context)

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-produit-patch:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin patch produit.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  let adminUser: any = null

  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  const parsedId = idSchema.safeParse(id)

  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: 'ID produit invalide',
        details: parsedId.error.flatten(),
      },
      { status: 400 }
    )
  }

  const produitId = parsedId.data

  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Corps JSON invalide' },
      { status: 400 }
    )
  }

  const parsed = patchProductSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Données invalides',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const newValue =
    typeof parsed.data.est_actif === 'boolean'
      ? parsed.data.est_actif
      : typeof parsed.data.active === 'boolean'
        ? parsed.data.active
        : null

  if (newValue == null) {
    return NextResponse.json(
      {
        error:
          'Aucun champ est_actif ou active booléen valide fourni.',
      },
      { status: 400 }
    )
  }

  const supabase = await getSupabase()

  if (!supabase || typeof supabase.from !== 'function') {
    return NextResponse.json(
      { error: 'Configuration Supabase invalide' },
      { status: 500 }
    )
  }

  try {
    const supports = await detectProductColumns(supabase)

    if (!supports.est_actif && !supports.active) {
      return NextResponse.json(
        {
          error:
            'Aucune colonne est_actif ou active disponible pour mettre à jour le statut produit.',
        },
        { status: 500 }
      )
    }

    const now = new Date().toISOString()

    const data: any = {
      updated_at: now,
    }

    if (supports.est_actif) data.est_actif = newValue
    if (supports.active) data.active = newValue

    const attempts = [
      {
        name: 'full',
        data,
      },
      {
        name: 'est_actif_only',
        data: supports.est_actif
          ? { est_actif: newValue, updated_at: now }
          : null,
      },
      {
        name: 'active_only',
        data: supports.active
          ? { active: newValue, updated_at: now }
          : null,
      },
    ].filter((a) => a.data != null) as Array<{
      name: string
      data: any
    }>

    let updatedProduct: any = null
    let lastError: any = null

    for (const attempt of attempts) {
      try {
        const { data: row, error } = await supabase
          .from('produits')
          .update(attempt.data)
          .eq('id', produitId)
          .select('*')
          .maybeSingle()

        if (!error && row) {
          updatedProduct = row
          break
        }

        lastError = error

        if (isMissingColumnError(error)) {
          continue
        }

        logger.error?.(
          {
            error,
            attempt: attempt.name,
            produitId,
            adminId: adminUser?.id ?? null,
          },
          'Échec PATCH admin produit'
        )

        return NextResponse.json(
          {
            error: 'Échec mise à jour du statut produit',
            details: error?.message,
          },
          { status: 500 }
        )
      } catch (err: any) {
        lastError = err

        if (isMissingColumnError(err)) {
          continue
        }

        logger.error?.(
          {
            err,
            attempt: attempt.name,
            produitId,
            adminId: adminUser?.id ?? null,
          },
          'Exception PATCH admin produit'
        )

        return NextResponse.json(
          {
            error: 'Échec mise à jour du statut produit',
            details: err?.message,
          },
          { status: 500 }
        )
      }
    }

    if (!updatedProduct) {
      return NextResponse.json(
        {
          error: 'Aucune mise à jour appliquée',
          details: lastError?.message,
        },
        { status: 500 }
      )
    }

    invalidateProductCaches()

    logger.info?.(
      {
        produitId,
        est_actif: newValue,
        adminId: adminUser?.id ?? null,
      },
      'Statut produit admin mis à jour'
    )

    return NextResponse.json({
      success: true,
      product: normalizeProductForResponse(
        updatedProduct,
        await getServerUsdRate(supabase)
      ),
    })
  } catch (error: any) {
    logger.error?.(
      `Crash PATCH admin/produits/${produitId}`,
      error
    )

    return NextResponse.json(
      {
        error: 'Erreur serveur interne admin patch produit',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE – Suppression produit                                   */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(request: Request, context: any) {
  const { id } = await resolveRouteParams(context)

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-produit-delete:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin suppression produit.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  let adminUser: any = null

  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  const parsedId = idSchema.safeParse(id)

  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: 'ID produit invalide',
        details: parsedId.error.flatten(),
      },
      { status: 400 }
    )
  }

  const produitId = parsedId.data

  const supabase = await getSupabase()

  if (!supabase || typeof supabase.from !== 'function') {
    return NextResponse.json(
      { error: 'Configuration Supabase invalide' },
      { status: 500 }
    )
  }

  try {
    const { data: existing, error: existingError } = await supabase
      .from('produits')
      .select('id')
      .eq('id', produitId)
      .maybeSingle()

    if (existingError) {
      if (isMissingTableError(existingError)) {
        return NextResponse.json(
          { error: 'Produit introuvable' },
          { status: 404 }
        )
      }

      logger.error?.(
        `Erreur fetch existant DELETE admin/produits/${produitId}`,
        existingError
      )

      return NextResponse.json(
        {
          error: 'Erreur lors de la vérification du produit',
          details: existingError?.message,
        },
        { status: 500 }
      )
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Produit introuvable' },
        { status: 404 }
      )
    }

    const supports = await detectProductColumns(supabase)
    const now = new Date().toISOString()

    if (supports.deleted_at) {
      const { error: softDeleteError } = await supabase
        .from('produits')
        .update({
          deleted_at: now,
          updated_at: now,
        })
        .eq('id', produitId)

      if (softDeleteError) {
        logger.error?.(
          `Erreur soft delete admin/produits/${produitId}`,
          softDeleteError
        )

        return NextResponse.json(
          {
            error: 'Échec suppression douce du produit',
            details: softDeleteError?.message,
          },
          { status: 500 }
        )
      }

      invalidateProductCaches()

      logger.info?.(
        {
          produitId,
          adminId: adminUser?.id ?? null,
          mode: 'soft_delete',
        },
        'Produit admin supprimé doucement'
      )

      return NextResponse.json({
        success: true,
        mode: 'soft_delete',
      })
    }

    const { error: deleteError } = await supabase
      .from('produits')
      .delete()
      .eq('id', produitId)

    if (deleteError) {
      logger.error?.(
        `Erreur DELETE admin/produits/${produitId}`,
        deleteError
      )

      return NextResponse.json(
        {
          error: 'Échec suppression du produit',
          details: deleteError?.message,
        },
        { status: 500 }
      )
    }

    invalidateProductCaches()

    logger.info?.(
      {
        produitId,
        adminId: adminUser?.id ?? null,
        mode: 'hard_delete',
      },
      'Produit admin supprimé'
    )

    return NextResponse.json({
      success: true,
      mode: 'hard_delete',
    })
  } catch (error: any) {
    logger.error?.(
      `Crash DELETE admin/produits/${produitId}`,
      error
    )

    return NextResponse.json(
      {
        error: 'Erreur serveur interne admin suppression produit',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}