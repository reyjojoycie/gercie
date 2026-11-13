// app/api/admin/produits/bulk-price/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import logger from '@/lib/logger'
import {
  checkRateLimit,
  applyRateLimitHeaders,
} from '@/lib/rateLimit'

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
}

interface HistoryColumnSupport {
  produit_id: boolean
  ajustement_id: boolean

  ancien_prix: boolean
  nouveau_prix: boolean

  ancien_prix_usd: boolean
  nouveau_prix_usd: boolean

  ancien_prix_cdf: boolean
  nouveau_prix_cdf: boolean

  exchange_rate: boolean
  currency: boolean
  created_at: boolean
}

interface BulkPlan {
  id: string
  oldUsd: number
  oldCdf: number | null
  newUsd: number
  newCdf: number | null
  rate: number | null
  update: Record<string, any>
  rollback: Record<string, any>
}

interface HistoryRowOptions {
  usd: boolean
  cdfExtras: boolean
  legacy: boolean
  meta: boolean
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

function getUsdSignal(payload: any): number | null {
  return explicitUsd(
    payload?.prix_usd,
    payload?.price_usd,
    payload?.unit_price_usd,
    payload?.prixUSD,
    payload?.priceUSD
  )
}

function getCdfSignal(payload: any): number | null {
  return explicitCdf(
    payload?.prix,
    payload?.price,
    payload?.prix_cdf,
    payload?.price_cdf,
    payload?.prixCDF,
    payload?.priceCDF
  )
}

function generateAjustementId(): string {
  try {
    return globalThis.crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  USD / CDF RESOLUTION                                           */
/* ═══════════════════════════════════════════════════════════════ */

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
function resolveBulkPricePair(
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
/*  SUPABASE CLIENT                                                */
/* ═══════════════════════════════════════════════════════════════ */

async function getSupabase(): Promise<any> {
  const rawClient = await createClient(true)
  return (rawClient as any)?.supabase || rawClient
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TAUX SERVEUR                                                   */
/* ═══════════════════════════════════════════════════════════════ */

let cachedServerRate: {
  value: number | null
  expiresAt: number
} | null = null

function resolveRateFromRow(row: any): number | null {
  return explicitUsd(
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
        'Exception lecture exchange_rates bulk price',
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

let productColumnsCache: ProductColumnSupport | null = null

async function getProductColumns(
  supabase: any
): Promise<ProductColumnSupport> {
  if (productColumnsCache) return productColumnsCache

  const [
    prix_usd,
    price_usd,
    unit_price_usd,
    prix_cdf,
    price_cdf,
    prix,
    price,
    exchange_rate,
  ] = await Promise.all([
    hasColumn(supabase, 'produits', 'prix_usd'),
    hasColumn(supabase, 'produits', 'price_usd'),
    hasColumn(supabase, 'produits', 'unit_price_usd'),
    hasColumn(supabase, 'produits', 'prix_cdf'),
    hasColumn(supabase, 'produits', 'price_cdf'),
    hasColumn(supabase, 'produits', 'prix'),
    hasColumn(supabase, 'produits', 'price'),
    hasColumn(supabase, 'produits', 'exchange_rate'),
  ])

  productColumnsCache = {
    prix_usd,
    price_usd,
    unit_price_usd,
    prix_cdf,
    price_cdf,
    prix,
    price,
    exchange_rate,
  }

  return productColumnsCache
}

let historyColumnsCache: HistoryColumnSupport | null = null

async function getHistoryColumns(
  supabase: any
): Promise<HistoryColumnSupport> {
  if (historyColumnsCache) return historyColumnsCache

  const [
    produit_id,
    ajustement_id,
    ancien_prix,
    nouveau_prix,
    ancien_prix_usd,
    nouveau_prix_usd,
    ancien_prix_cdf,
    nouveau_prix_cdf,
    exchange_rate,
    currency,
    created_at,
  ] = await Promise.all([
    hasColumn(supabase, 'historique_prix', 'produit_id'),
    hasColumn(supabase, 'historique_prix', 'ajustement_id'),
    hasColumn(supabase, 'historique_prix', 'ancien_prix'),
    hasColumn(supabase, 'historique_prix', 'nouveau_prix'),
    hasColumn(supabase, 'historique_prix', 'ancien_prix_usd'),
    hasColumn(supabase, 'historique_prix', 'nouveau_prix_usd'),
    hasColumn(supabase, 'historique_prix', 'ancien_prix_cdf'),
    hasColumn(supabase, 'historique_prix', 'nouveau_prix_cdf'),
    hasColumn(supabase, 'historique_prix', 'exchange_rate'),
    hasColumn(supabase, 'historique_prix', 'currency'),
    hasColumn(supabase, 'historique_prix', 'created_at'),
  ])

  historyColumnsCache = {
    produit_id,
    ajustement_id,
    ancien_prix,
    nouveau_prix,
    ancien_prix_usd,
    nouveau_prix_usd,
    ancien_prix_cdf,
    nouveau_prix_cdf,
    exchange_rate,
    currency,
    created_at,
  }

  return historyColumnsCache
}

function hasAnyUsdColumn(cols: ProductColumnSupport): boolean {
  return cols.prix_usd || cols.price_usd || cols.unit_price_usd
}

function hasAnyCdfColumn(cols: ProductColumnSupport): boolean {
  return cols.prix_cdf || cols.price_cdf || cols.prix || cols.price
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const bulkPriceSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, 'Au moins un produit requis')
    .max(200, 'Maximum 200 produits par ajustement'),

  pourcentage: z
    .number()
    .min(-90, 'Le pourcentage minimum est -90%')
    .max(900, 'Le pourcentage maximum est +900%'),

  currency: z.enum(['USD', 'CDF']).optional(),
  usd_source: z.boolean().optional(),
  dry_run: z.boolean().optional(),
})

const ajustementIdSchema = z.string().uuid('ajustementId invalide')

/* ═══════════════════════════════════════════════════════════════ */
/*  HISTORY HELPERS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function makeHistoryRow(
  plan: BulkPlan,
  cols: HistoryColumnSupport,
  opts: HistoryRowOptions,
  ajustementId: string
): Record<string, any> {
  const row: Record<string, any> = {}

  if (cols.produit_id) row.produit_id = plan.id
  if (cols.ajustement_id) row.ajustement_id = ajustementId

  if (opts.meta && cols.created_at) {
    row.created_at = new Date().toISOString()
  }

  if (opts.usd) {
    if (cols.ancien_prix_usd) row.ancien_prix_usd = plan.oldUsd
    if (cols.nouveau_prix_usd) row.nouveau_prix_usd = plan.newUsd
  }

  if (opts.cdfExtras) {
    if (cols.ancien_prix_cdf && plan.oldCdf != null) {
      row.ancien_prix_cdf = plan.oldCdf
    }

    if (cols.nouveau_prix_cdf && plan.newCdf != null) {
      row.nouveau_prix_cdf = plan.newCdf
    }
  }

  if (opts.meta) {
    if (cols.exchange_rate && plan.rate != null) {
      row.exchange_rate = round2(plan.rate)
    }

    if (cols.currency) {
      row.currency = 'USD'
    }
  }

  if (opts.legacy) {
    if (cols.ancien_prix) {
      row.ancien_prix = plan.oldCdf ?? 0
    }

    if (cols.nouveau_prix) {
      row.nouveau_prix = plan.newCdf ?? 0
    }
  }

  return row
}

function historyRowHasPrice(row: Record<string, any>): boolean {
  return Object.keys(row).some(
    (key) =>
      key.includes('prix') ||
      key.includes('price') ||
      key.includes('usd') ||
      key.includes('cdf')
  )
}

const historyAttemptOptions: HistoryRowOptions[] = [
  {
    usd: true,
    cdfExtras: true,
    legacy: true,
    meta: true,
  },
  {
    usd: true,
    cdfExtras: true,
    legacy: true,
    meta: false,
  },
  {
    usd: true,
    cdfExtras: false,
    legacy: true,
    meta: false,
  },
  {
    usd: true,
    cdfExtras: false,
    legacy: false,
    meta: false,
  },
  {
    usd: false,
    cdfExtras: false,
    legacy: true,
    meta: false,
  },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  ROLLBACK                                                       */
/* ═══════════════════════════════════════════════════════════════ */

async function rollbackSupabaseUpdates(
  supabase: any,
  plans: BulkPlan[]
): Promise<void> {
  for (const plan of [...plans].reverse()) {
    if (Object.keys(plan.rollback).length === 0) continue

    try {
      const { error } = await supabase
        .from('produits')
        .update(plan.rollback)
        .eq('id', plan.id)

      if (error) {
        logger.error?.(
          {
            error,
            produitId: plan.id,
          },
          'Échec rollback bulk price'
        )
      }
    } catch (err) {
      logger.error?.(
        {
          err,
          produitId: plan.id,
        },
        'Exception rollback bulk price'
      )
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST – Ajustement de prix en masse                             */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-bulk-price:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin bulk price.' },
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

  const parsed = bulkPriceSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Données invalides',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const { ids, pourcentage, dry_run } = parsed.data
  const coefficient = 1 + pourcentage / 100

  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))]

  if (uniqueIds.length === 0) {
    return NextResponse.json(
      { error: 'Aucun ID produit valide fourni.' },
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
    const productColumns = await getProductColumns(supabase)
    const historyColumns = await getHistoryColumns(supabase)

    const { data: produits, error: fetchErr } = await supabase
      .from('produits')
      .select('*')
      .in('id', uniqueIds)

    if (fetchErr) {
      if (isMissingTableError(fetchErr)) {
        return NextResponse.json(
          { error: 'Table produits indisponible' },
          { status: 500 }
        )
      }

      logger.error?.('Erreur fetch produits bulk price', fetchErr)

      return NextResponse.json(
        {
          error: 'Erreur lors de la récupération des produits',
          details: fetchErr?.message,
        },
        { status: 500 }
      )
    }

    const productMap = new Map<string, any>(
      (produits || []).map((p: any) => [String(p.id), p])
    )

    const missingIds = uniqueIds.filter((id) => !productMap.has(id))

    if (missingIds.length > 0) {
      return NextResponse.json(
        {
          error: 'Certains produits sont introuvables',
          missing_ids: missingIds,
        },
        { status: 404 }
      )
    }

    const plans: BulkPlan[] = []
    const invalid: Array<{ id: string; reason: string }> = []

    for (const id of uniqueIds) {
      const row = productMap.get(id)

      if (!row) {
        invalid.push({ id, reason: 'Produit introuvable' })
        continue
      }

      const storedRate =
        parseFiniteNumber(
          row.exchange_rate ??
            row.shipping_rate_used ??
            row.rate
        ) ?? null

      const effectiveRate = serverRate ?? storedRate ?? null

      const pair = resolveBulkPricePair(row, effectiveRate)

      if (pair.source === 'NONE') {
        invalid.push({
          id,
          reason:
            'Aucun prix USD ou CDF exploitable détecté sur ce produit.',
        })
        continue
      }

      if (pair.source === 'CDF_LEGACY') {
        invalid.push({
          id,
          reason:
            'Prix CDF legacy détecté sans prix USD explicite ni taux USD/CDF disponible. Ajustement refusé pour ne pas figer un CDF comme vérité.',
        })
        continue
      }

      const oldUsd = round2(pair.usd)
      const oldCdf = pair.cdf != null ? roundCdf(pair.cdf) : null

      const newUsd = round2(Math.max(0, oldUsd * coefficient))

      const newCdf =
        newUsd === 0
          ? 0
          : effectiveRate && effectiveRate > 0
            ? roundCdf(toCdf(newUsd, effectiveRate))
            : null

      const update: Record<string, any> = {}
      const rollback: Record<string, any> = {}

      if (productColumns.prix_usd) {
        update.prix_usd = newUsd
        rollback.prix_usd = oldUsd
      }

      if (productColumns.price_usd) {
        update.price_usd = newUsd
        rollback.price_usd = oldUsd
      }

      if (productColumns.unit_price_usd) {
        update.unit_price_usd = newUsd
        rollback.unit_price_usd = oldUsd
      }

      if (newCdf != null) {
        if (productColumns.prix_cdf) {
          update.prix_cdf = newCdf
          rollback.prix_cdf = oldCdf
        }

        if (productColumns.price_cdf) {
          update.price_cdf = newCdf
          rollback.price_cdf = oldCdf
        }

        if (productColumns.prix) {
          update.prix = newCdf
          rollback.prix = oldCdf ?? getCdfSignal(row)
        }

        if (productColumns.price) {
          update.price = newCdf
          rollback.price = oldCdf ?? getCdfSignal(row)
        }
      }

      if (productColumns.exchange_rate && effectiveRate != null) {
        update.exchange_rate = round2(effectiveRate)
        rollback.exchange_rate =
          parseFiniteNumber(row.exchange_rate) ?? null
      }

      if (Object.keys(update).length === 0) {
        invalid.push({
          id,
          reason:
            'Aucune colonne prix exploitable dans la base pour appliquer cet ajustement.',
        })
        continue
      }

      plans.push({
        id,
        oldUsd,
        oldCdf,
        newUsd,
        newCdf,
        rate: effectiveRate,
        update,
        rollback,
      })
    }

    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error:
            'Certains produits ne peuvent pas être ajustés en toute sécurité.',
          invalid,
        },
        { status: 400 }
      )
    }

    if (dry_run) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        ajustementId: null,
        pourcentage,
        coefficient,
        produits: plans.map((p) => ({
          id: p.id,
          ancienPrix: p.oldCdf ?? 0,
          nouveauPrix: p.newCdf ?? 0,
          ancienPrixUsd: p.oldUsd,
          nouveauPrixUsd: p.newUsd,
          ancienPrixCdf: p.oldCdf,
          nouveauPrixCdf: p.newCdf,
        })),
      })
    }

    const ajustementId = generateAjustementId()
    const successes: BulkPlan[] = []

    for (const plan of plans) {
      try {
        const { data, error } = await supabase
          .from('produits')
          .update(plan.update)
          .eq('id', plan.id)
          .select('id')
          .maybeSingle()

        if (error) throw error

        if (!data) {
          throw new Error('Produit non trouvé ou non mis à jour')
        }

        successes.push(plan)
      } catch (err: any) {
        await rollbackSupabaseUpdates(supabase, successes)

        logger.error?.(
          {
            err,
            produitId: plan.id,
            ajustementId,
          },
          'Échec mise à jour bulk price'
        )

        return NextResponse.json(
          {
            error:
              'Échec mise à jour d’au moins un prix. Les modifications réussies ont été annulées.',
            details: err?.message,
            failed_id: plan.id,
          },
          { status: 500 }
        )
      }
    }

    if (!historyColumns.produit_id || !historyColumns.ajustement_id) {
      await rollbackSupabaseUpdates(supabase, successes)

      return NextResponse.json(
        {
          error:
            'La table historique_prix est indispensable pour permettre l’annulation sécurisée de l’ajustement.',
        },
        { status: 500 }
      )
    }

    let historyInserted = false
    let lastHistoryError: any = null

    for (const opts of historyAttemptOptions) {
      const rows = successes
        .map((plan) =>
          makeHistoryRow(plan, historyColumns, opts, ajustementId)
        )
        .filter((row) => {
          return (
            row.produit_id &&
            row.ajustement_id &&
            historyRowHasPrice(row)
          )
        })

      if (rows.length !== successes.length) continue

      try {
        const { error } = await supabase
          .from('historique_prix')
          .insert(rows)

        if (!error) {
          historyInserted = true
          break
        }

        lastHistoryError = error

        if (isMissingColumnError(error)) {
          continue
        }

        if (isMissingTableError(error)) {
          break
        }

        await rollbackSupabaseUpdates(supabase, successes)

        logger.error?.(
          {
            error,
            ajustementId,
          },
          'Échec insertion historique bulk price'
        )

        return NextResponse.json(
          {
            error:
              'Échec enregistrement de l’historique de prix. Les modifications ont été annulées.',
            details: error?.message,
          },
          { status: 500 }
        )
      } catch (err: any) {
        lastHistoryError = err

        if (isMissingColumnError(err)) {
          continue
        }

        await rollbackSupabaseUpdates(supabase, successes)

        logger.error?.(
          {
            err,
            ajustementId,
          },
          'Exception insertion historique bulk price'
        )

        return NextResponse.json(
          {
            error:
              'Échec enregistrement de l’historique de prix. Les modifications ont été annulées.',
            details: err?.message,
          },
          { status: 500 }
        )
      }
    }

    if (!historyInserted) {
      await rollbackSupabaseUpdates(supabase, successes)

      return NextResponse.json(
        {
          error:
            'Impossible d’enregistrer un historique de prix exploitable. Les modifications ont été annulées.',
          details: lastHistoryError?.message,
        },
        { status: 500 }
      )
    }

    logger.info?.(
      {
        ajustementId,
        updated: successes.length,
        pourcentage,
      },
      'Bulk price admin appliqué'
    )

    return NextResponse.json({
      success: true,
      ajustementId,
      pourcentage,
      coefficient,
      produits: successes.map((p) => ({
        id: p.id,
        ancienPrix: p.oldCdf ?? 0,
        nouveauPrix: p.newCdf ?? 0,
        ancienPrixUsd: p.oldUsd,
        nouveauPrixUsd: p.newUsd,
        ancienPrixCdf: p.oldCdf,
        nouveauPrixCdf: p.newCdf,
      })),
    })
  } catch (error: any) {
    logger.error?.('Crash POST bulk-price', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne bulk price',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE – Annulation d’un ajustement                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `admin-bulk-price-delete:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes admin annulation bulk price.' },
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
  const rawAjustementId = searchParams.get('ajustementId')

  const parsedAjustementId =
    ajustementIdSchema.safeParse(rawAjustementId)

  if (!parsedAjustementId.success) {
    return NextResponse.json(
      {
        error: 'ajustementId requis ou invalide',
        details: parsedAjustementId.error.flatten(),
      },
      { status: 400 }
    )
  }

  const ajustementId = parsedAjustementId.data

  const supabase = await getSupabase()

  if (!supabase || typeof supabase.from !== 'function') {
    return NextResponse.json(
      { error: 'Configuration Supabase invalide' },
      { status: 500 }
    )
  }

  try {
    const serverRate = await getServerUsdRate(supabase)
    const productColumns = await getProductColumns(supabase)

    const { data: historiques, error: histErr } = await supabase
      .from('historique_prix')
      .select('*')
      .eq('ajustement_id', ajustementId)

    if (histErr) {
      if (isMissingTableError(histErr)) {
        return NextResponse.json(
          { error: 'Ajustement introuvable (historique indisponible)' },
          { status: 404 }
        )
      }

      logger.error?.(
        'Erreur fetch historique bulk price undo',
        histErr
      )

      return NextResponse.json(
        {
          error: 'Erreur lors de la récupération de l’historique',
          details: histErr?.message,
        },
        { status: 500 }
      )
    }

    if (!historiques?.length) {
      return NextResponse.json(
        { error: 'Ajustement introuvable' },
        { status: 404 }
      )
    }

    const restoredIds: string[] = []
    const failed: Array<{ id: string; reason: string }> = []

    for (const row of historiques) {
      const productId = String(row.produit_id || '')

      if (!productId) {
        failed.push({
          id: productId || 'inconnu',
          reason: 'Historique sans produit_id valide',
        })
        continue
      }

      let oldUsd = explicitUsd(
        row.ancien_prix_usd,
        row.ancien_price_usd,
        row.ancien_unit_price_usd
      )

      const oldCdf = explicitCdf(
        row.ancien_prix_cdf,
        row.ancien_price_cdf,
        row.ancien_prix,
        row.ancien_price
      )

      const rowRate =
        parseFiniteNumber(row.exchange_rate ?? row.rate) ?? null

      const effectiveRate = rowRate ?? serverRate ?? null

      /**
       * Si l’historique ne contient pas d’USD mais contient un CDF,
       * et que le produit possède une colonne USD, on resynchronise
       * l’USD depuis le CDF restauré avec le taux disponible.
       */
      if (
        oldUsd == null &&
        oldCdf != null &&
        effectiveRate &&
        effectiveRate > 0 &&
        hasAnyUsdColumn(productColumns)
      ) {
        oldUsd = round2(toUsd(oldCdf, effectiveRate))
      }

      if (oldUsd == null && oldCdf == null) {
        failed.push({
          id: productId,
          reason:
            'Historique insuffisant pour restaurer un prix USD ou CDF valide.',
        })
        continue
      }

      const update: Record<string, any> = {}

      if (oldUsd != null) {
        if (productColumns.prix_usd) update.prix_usd = oldUsd
        if (productColumns.price_usd) update.price_usd = oldUsd
        if (productColumns.unit_price_usd) {
          update.unit_price_usd = oldUsd
        }
      }

      if (oldCdf != null) {
        if (productColumns.prix_cdf) update.prix_cdf = oldCdf
        if (productColumns.price_cdf) update.price_cdf = oldCdf
        if (productColumns.prix) update.prix = oldCdf
        if (productColumns.price) update.price = oldCdf
      }

      if (Object.keys(update).length === 0) {
        failed.push({
          id: productId,
          reason:
            'Aucune colonne prix exploitable disponible pour restaurer ce produit.',
        })
        continue
      }

      try {
        const { data, error } = await supabase
          .from('produits')
          .update(update)
          .eq('id', productId)
          .select('id')
          .maybeSingle()

        if (error) throw error

        if (!data) {
          throw new Error('Produit non trouvé ou non restauré')
        }

        restoredIds.push(productId)
      } catch (err: any) {
        failed.push({
          id: productId,
          reason: err?.message || 'Échec restauration',
        })

        logger.error?.(
          {
            err,
            productId,
            ajustementId,
          },
          'Échec restauration bulk price undo'
        )
      }
    }

    if (restoredIds.length > 0) {
      try {
        const { error: deleteError } = await supabase
          .from('historique_prix')
          .delete()
          .eq('ajustement_id', ajustementId)
          .in('produit_id', restoredIds)

        if (deleteError) {
          logger.warn?.(
            {
              error: deleteError,
              ajustementId,
            },
            'Échec suppression partielle historique bulk price undo'
          )
        }
      } catch (err) {
        logger.warn?.(
          {
            err,
            ajustementId,
          },
          'Exception suppression historique bulk price undo'
        )
      }
    }

    if (failed.length > 0) {
      return NextResponse.json(
        {
          success: false,
          restored: restoredIds.length,
          failed,
          message:
            "Certaines restaurations ont échoué. L'historique partiel restant peut être réessayé.",
        },
        { status: 500 }
      )
    }

    logger.info?.(
      {
        ajustementId,
        restored: restoredIds.length,
      },
      'Bulk price undo appliqué'
    )

    return NextResponse.json({
      success: true,
      restored: restoredIds.length,
      message: 'Ajustement annulé',
    })
  } catch (error: any) {
    logger.error?.('Crash DELETE bulk-price', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne annulation bulk price',
        details: error?.message || 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}