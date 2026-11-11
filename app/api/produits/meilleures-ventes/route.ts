// app/api/produits/meilleures-ventes/route.ts
// ============================================================================
// API Meilleures ventes intelligentes
// Version complète, tolérante, sans wallet / portefeuille / solde / retrait.
//
// Endpoint :
// - GET /api/produits/meilleures-ventes
//
// Paramètres query :
// - limit=number                 défaut : 12, max : 50
// - page=number                  défaut : 1, max : 100
// - categorie=string             défaut : vide
// - freshness_days=number        défaut : 30, min : 7, max : 90
// - include_out_of_stock=true|false défaut : false
// - candidate_limit=number       défaut : 200, min : 50, max : 500
//
// Logique :
// - charge les produits actifs
// - calcule les ventes récentes depuis commande_articles
// - calcule un score intelligent :
//   ventes récentes, tendance, total ventes, note, promo, nouveauté, stock
// - renvoie les produits classés par score
// ============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PRODUCT_TABLE = 'produits'
const ARTICLE_TABLE = 'commande_articles'
const ORDER_TABLE = 'commandes'

const ALGORITHM_VERSION = 'best-sellers-intelligent-v1'

const EXCLUDED_ORDER_STATUSES = new Set([
  'annulee',
  'annule',
  'cancelled',
  'canceled',
  'refusee',
  'refuse',
  'echouee',
  'echoue',
  'failed',
])

const WEIGHTS = {
  recent: 0.35,
  momentum: 0.2,
  total: 0.2,
  rating: 0.12,
  promo: 0.08,
  novelty: 0.03,
  stock: 0.02,
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface ProductCandidate {
  id: string
  nom: string
  slug: string | null
  prix: number
  prix_promo: number | null
  effective_price: number
  images: string[]
  categorie: string | null
  total_ventes: number
  note_moyenne: number | null
  stock: number | null
  created_at: string | null
  discount: number
}

interface SalesMetrics {
  id: string
  period: number
  last7: number
  previous7: number
  total: number
  velocity: number
  momentum: number
}

interface ScoredProduct extends ProductCandidate {
  score: number
  rank: number
  reasons: string[]
  recent_ventes_7j: number
  recent_ventes_periode: number
  tendance: number
  is_nouveau: boolean
  stock_faible: boolean
  rupture: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMA QUERY                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),

  page: z.coerce.number().int().min(1).max(100).optional().default(1),

  categorie: z
    .string()
    .max(160)
    .optional()
    .default(''),

  freshness_days: z.coerce
    .number()
    .int()
    .min(7)
    .max(90)
    .optional()
    .default(30),

  include_out_of_stock: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),

  candidate_limit: z.coerce
    .number()
    .int()
    .min(50)
    .max(500)
    .optional()
    .default(200),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function nowIso(): string {
  return new Date().toISOString()
}

function errorMessage(error: any, fallback: string): string {
  return String(error?.message || error?.details || error?.hint || fallback)
}

function isTableMissingError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()

  // Codes PostgreSQL / PostgREST précis de table ou relation manquante
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') {
    return true
  }

  // Message explicite “does not exist” couplé à un mot de contexte table
  const hasNotExist =
    message.includes('does not exist') ||
    message.includes("n'existe pas") ||
    message.includes('n’existe pas')

  const hasTableContext =
    message.includes('relation') ||
    message.includes('table') ||
    message.includes('schema')

  return hasNotExist && hasTableContext
}

function isColumnError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()

  if (code === '42703' || code === 'PGRST204') {
    return true
  }

  return (
    message.includes('column') ||
    message.includes('could not find') ||
    (message.includes('does not exist') && message.includes('column'))
  )
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function toStringArray(value: unknown): string[] {
  if (!value) return []

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        return item?.url || item?.publicUrl || item?.path || ''
      })
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function sanitizeLike(value: unknown): string {
  return String(value || '')
    .replace(/[()%'"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function normalizeStatus(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
}

async function getSupabaseAdmin(): Promise<any> {
  const client: any = await createClient(true)
  return client?.supabase ?? client
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH PRODUCTS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchProducts(
  supabase: any,
  options: {
    candidateLimit: number
    categorie: string
  }
): Promise<any[]> {
  const selects = [
    'id, nom, slug, prix, prix_promo, images, categorie, total_ventes, note_moyenne, stock, est_actif, created_at, updated_at',
    'id, nom, slug, prix, prix_promo, images, categorie, total_ventes, note_moyenne, stock, est_actif, created_at',
    'id, nom, prix, prix_promo, images, categorie, total_ventes, note_moyenne, stock, est_actif',
    'id, nom, prix, images, total_ventes, note_moyenne, stock',
    'id, nom, prix, images',
  ]

  const orders = ['total_ventes', 'updated_at', 'created_at', null]
  const activeAttempts = [true, false]

  let lastError: any = null

  for (const select of selects) {
    for (const order of orders) {
      for (const applyActive of activeAttempts) {
        try {
          let query = supabase
            .from(PRODUCT_TABLE)
            .select(select)
            .limit(options.candidateLimit)

          if (applyActive) {
            query = query.eq('est_actif', true)
          }

          if (options.categorie && select.includes('categorie')) {
            query = query.ilike('categorie', `%${options.categorie}%`)
          }

          if (order) {
            query = query.order(order, { ascending: false })
          }

          const { data, error } = await query

          if (!error) {
            return Array.isArray(data) ? data : []
          }

          lastError = error

          if (isTableMissingError(error)) {
            throw error
          }

          if (isColumnError(error)) {
            continue
          }

          break
        } catch (err: any) {
          lastError = err

          if (isTableMissingError(err)) {
            throw err
          }

          if (isColumnError(err)) {
            continue
          }

          break
        }
      }
    }
  }

  if (lastError) {
    throw lastError
  }

  return []
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH SALES                                                    */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchSales(supabase: any, windowStart: Date): Promise<any[]> {
  const selects = [
    '*',
    'produit_id, quantite, created_at, commande_id',
    'product_id, quantity, created_at, commande_id',
    'produit_id, quantite, updated_at, commande_id',
  ]

  const dateColumns = ['created_at', 'updated_at', null]

  for (const select of selects) {
    for (const dateColumn of dateColumns) {
      try {
        let query = supabase.from(ARTICLE_TABLE).select(select).limit(10000)

        if (dateColumn) {
          query = query.gte(dateColumn, windowStart.toISOString())
        }

        const { data, error } = await query

        if (!error) {
          return Array.isArray(data) ? data : []
        }

        if (isTableMissingError(error)) {
          return []
        }

        if (isColumnError(error)) {
          continue
        }

        break
      } catch (err: any) {
        if (isTableMissingError(err)) {
          return []
        }

        if (isColumnError(err)) {
          continue
        }

        break
      }
    }
  }

  return []
}

async function fetchOrderStatuses(
  supabase: any,
  ids: string[]
): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>()
  const uniqueIds = unique(ids)

  if (uniqueIds.length === 0) {
    return statusMap
  }

  const selects = ['id, statut', 'id, status', '*']

  for (let i = 0; i < uniqueIds.length; i += 500) {
    const chunk = uniqueIds.slice(i, i + 500)

    for (const select of selects) {
      try {
        const { data, error } = await supabase
          .from(ORDER_TABLE)
          .select(select)
          .in('id', chunk)

        if (!error && Array.isArray(data)) {
          for (const row of data) {
            const id = textOrNull(row?.id)
            const statut = normalizeStatus(
              row?.statut ?? row?.status ?? row?.state
            )

            if (id && statut) {
              statusMap.set(id, statut)
            }
          }

          break
        }

        if (isTableMissingError(error)) {
          return statusMap
        }

        if (isColumnError(error)) {
          continue
        }

        break
      } catch (err: any) {
        if (isTableMissingError(err)) {
          return statusMap
        }

        if (isColumnError(err)) {
          continue
        }

        break
      }
    }
  }

  return statusMap
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeProductRow(row: any): ProductCandidate | null {
  const id = String(row?.id || '')
  if (!id) return null

  const nom = String(row?.nom || row?.name || '').trim()
  if (!nom) return null

  const prix = toNum(row?.prix ?? row?.price, 0)
  if (prix <= 0) return null

  const prixPromo = toNullableNumber(row?.prix_promo ?? row?.promo_price)
  const effectivePrice =
    prixPromo !== null && prixPromo > 0 && prixPromo < prix ? prixPromo : prix

  const discount =
    prix > 0 && effectivePrice < prix
      ? Math.round(((prix - effectivePrice) / prix) * 100)
      : 0

  return {
    id,
    nom,
    slug: textOrNull(row?.slug),
    prix,
    prix_promo: prixPromo,
    effective_price: effectivePrice,
    images: toStringArray(row?.images),
    categorie: textOrNull(row?.categorie ?? row?.category),
    total_ventes: toNum(row?.total_ventes ?? row?.ventes ?? row?.sales, 0),
    note_moyenne: toNullableNumber(
      row?.note_moyenne ?? row?.rating ?? row?.average_rating
    ),
    stock: toNullableNumber(row?.stock),
    created_at: textOrNull(row?.created_at ?? row?.createdAt),
    discount,
  }
}

function aggregateSales(
  rows: any[],
  orderStatuses: Map<string, string>,
  freshnessDays: number
): Map<string, SalesMetrics> {
  const now = Date.now()
  const map = new Map<string, SalesMetrics>()

  for (const row of rows) {
    const produitId = textOrNull(
      row?.produit_id ?? row?.product_id ?? row?.produitId
    )

    if (!produitId) continue

    const commandeId = textOrNull(
      row?.commande_id ?? row?.order_id ?? row?.commandeId
    )

    const rawStatut =
      row?.statut ??
      row?.status ??
      row?.commandes?.statut ??
      (commandeId ? orderStatuses.get(commandeId) : null)

    const statut = normalizeStatus(rawStatut)

    if (statut && EXCLUDED_ORDER_STATUSES.has(statut)) {
      continue
    }

    const quantite = Math.max(
      1,
      toNum(row?.quantite ?? row?.quantity ?? row?.qte, 1)
    )

    const dateValue = textOrNull(
      row?.created_at ?? row?.createdAt ?? row?.updated_at ?? row?.updatedAt
    )

    const date = dateValue ? new Date(dateValue) : null
    const time = date && !Number.isNaN(date.getTime()) ? date.getTime() : null
    const ageDays = time !== null ? (now - time) / 86_400_000 : null

    const current =
      map.get(produitId) ||
      {
        id: produitId,
        period: 0,
        last7: 0,
        previous7: 0,
        total: 0,
        velocity: 0,
        momentum: 0,
      }

    current.total += quantite

    if (ageDays !== null) {
      if (ageDays <= freshnessDays) {
        current.period += quantite
      }

      if (ageDays <= 7) {
        current.last7 += quantite
      } else if (ageDays <= 14) {
        current.previous7 += quantite
      }
    }

    map.set(produitId, current)
  }

  for (const metrics of map.values()) {
    metrics.velocity = metrics.period / Math.max(1, freshnessDays)

    metrics.momentum =
      metrics.previous7 > 0
        ? metrics.last7 / metrics.previous7
        : metrics.last7 > 0
          ? 2
          : 0

    metrics.momentum = Math.min(metrics.momentum, 3)
  }

  return map
}

function normalizeMetric(
  entries: Array<{ id: string; value: number }>,
  flatValue = 0
): Map<string, number> {
  const map = new Map<string, number>()

  if (entries.length === 0) {
    return map
  }

  const values = entries.map((entry) => entry.value)
  const min = Math.min(...values)
  const max = Math.max(...values)

  for (const entry of entries) {
    if (max === min) {
      map.set(entry.id, flatValue)
    } else {
      map.set(entry.id, clamp01((entry.value - min) / (max - min)))
    }
  }

  return map
}

function computeBestSellers(
  rawProducts: any[],
  salesRows: any[],
  orderStatuses: Map<string, string>,
  options: {
    freshnessDays: number
    includeOutOfStock: boolean
  }
): ScoredProduct[] {
  const candidates = rawProducts
    .map(normalizeProductRow)
    .filter(Boolean) as ProductCandidate[]

  const filteredCandidates = options.includeOutOfStock
    ? candidates
    : candidates.filter(
        (product) => product.stock === null || product.stock > 0
      )

  if (filteredCandidates.length === 0) {
    return []
  }

  const salesByProduct = aggregateSales(
    salesRows,
    orderStatuses,
    options.freshnessDays
  )

  const metricsList: SalesMetrics[] = filteredCandidates.map((product) => {
    const metrics = salesByProduct.get(product.id)

    return (
      metrics || {
        id: product.id,
        period: 0,
        last7: 0,
        previous7: 0,
        total: 0,
        velocity: 0,
        momentum: 0,
      }
    )
  })

  const recentNorm = normalizeMetric(
    metricsList.map((m) => ({ id: m.id, value: m.velocity })),
    0
  )

  const momentumNorm = normalizeMetric(
    metricsList.map((m) => ({ id: m.id, value: m.momentum })),
    0
  )

  const totalNorm = normalizeMetric(
    filteredCandidates.map((p) => ({
      id: p.id,
      value: p.total_ventes,
    })),
    0
  )

  const now = Date.now()

  const scored: ScoredProduct[] = filteredCandidates.map((product) => {
    const metrics =
      salesByProduct.get(product.id) ||
      ({
        id: product.id,
        period: 0,
        last7: 0,
        previous7: 0,
        total: 0,
        velocity: 0,
        momentum: 0,
      } as SalesMetrics)

    const rating = toNum(product.note_moyenne, 0)
    const ratingNorm = clamp01(rating / 5)

    const promoNorm = clamp01(product.discount / 50)

    const createdDate = product.created_at
      ? new Date(product.created_at)
      : null

    const daysSinceCreated =
      createdDate && !Number.isNaN(createdDate.getTime())
        ? (now - createdDate.getTime()) / 86_400_000
        : 999

    const noveltyNorm =
      daysSinceCreated <= 14 ? clamp01(1 - daysSinceCreated / 14) : 0

    const stock = product.stock
    const rupture = stock !== null && stock <= 0
    const stockFaible = stock !== null && stock > 0 && stock <= 5

    const stockUrgency =
      stock === null
        ? 0.5
        : stock <= 0
          ? 0
          : stock <= 5
            ? 1
            : stock <= 20
              ? 0.55
              : 0.35

    const rNorm = recentNorm.get(product.id) ?? 0
    const mNorm = momentumNorm.get(product.id) ?? 0
    const tNorm = totalNorm.get(product.id) ?? 0

    const rawScore =
      WEIGHTS.recent * rNorm +
      WEIGHTS.momentum * mNorm +
      WEIGHTS.total * tNorm +
      WEIGHTS.rating * ratingNorm +
      WEIGHTS.promo * promoNorm +
      WEIGHTS.novelty * noveltyNorm +
      WEIGHTS.stock * stockUrgency

    const finalScore = rupture ? rawScore * 0.25 : rawScore

    const reasons: string[] = []

    if (rNorm >= 0.75) {
      reasons.push('Fortes ventes récentes')
    }

    if (mNorm >= 0.65 && metrics.last7 > metrics.previous7) {
      reasons.push('Tendance en hausse')
    }

    if (tNorm >= 0.8) {
      reasons.push('Best-seller historique')
    }

    if (rating >= 4.2) {
      reasons.push('Bien noté par les clients')
    }

    if (product.discount >= 10) {
      reasons.push('Promotion active')
    }

    if (noveltyNorm >= 0.75) {
      reasons.push('Nouveau produit')
    }

    if (stockFaible) {
      reasons.push('Stock limité')
    }

    if (reasons.length === 0) {
      reasons.push('Sélection Gercie')
    }

    return {
      ...product,
      score: Math.round(clamp01(finalScore) * 100),
      rank: 0,
      reasons: reasons.slice(0, 3),
      recent_ventes_7j: metrics.last7,
      recent_ventes_periode: metrics.period,
      tendance: Number(metrics.momentum.toFixed(2)),
      is_nouveau: noveltyNorm >= 0.75,
      stock_faible: stockFaible,
      rupture,
    }
  })

  scored.sort((a, b) => {
    return (
      b.score - a.score ||
      b.total_ventes - a.total_ventes ||
      toNum(b.note_moyenne, 0) - toNum(a.note_moyenne, 0) ||
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    )
  })

  return scored.map((product, index) => ({
    ...product,
    rank: index + 1,
  }))
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const parsed = querySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  )

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Paramètres de requête invalides.',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const input = parsed.data

  const limit = input.limit
  const page = input.page
  const categorie = sanitizeLike(input.categorie)
  const freshnessDays = input.freshness_days
  const includeOutOfStock = input.include_out_of_stock === 'true'
  const candidateLimit = input.candidate_limit

  /* ───────────────────────────────────────────────────────────── */
  /*  RÉPONSE DÉGRADÉE (200) — remplace la 503 / 500               */
  /*  pour que BestSellers.tsx ne casse jamais                     */
  /* ───────────────────────────────────────────────────────────── */

  const buildDegradedResponse = (
    errorCode: string,
    details?: string
  ): NextResponse => {
    const response = NextResponse.json({
      success: true,
      data: [],
      meta: {
        page,
        limit,
        total: 0,
        totalPages: 1,
        hasMore: false,
        categories: [],
        generated_at: nowIso(),
        algorithm: ALGORITHM_VERSION,
        freshness_days: freshnessDays,
        include_out_of_stock: includeOutOfStock,
        degraded: true,
        error_code: errorCode,
        error_details:
          process.env.NODE_ENV === 'development' ? details : undefined,
      },
    })

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=10, stale-while-revalidate=60'
    )
    response.headers.set('X-Best-Sellers-Algorithm', ALGORITHM_VERSION)
    response.headers.set('X-Best-Sellers-Degraded', 'true')

    return response
  }

  try {
    const supabase = await getSupabaseAdmin()

    if (!supabase || typeof supabase.from !== 'function') {
      return buildDegradedResponse(
        'SUPABASE_CLIENT_ERROR',
        'Configuration Supabase invalide côté serveur.'
      )
    }

    const rawProducts = await fetchProducts(supabase, {
      candidateLimit,
      categorie,
    })

    const windowDays = Math.max(freshnessDays, 14)
    const windowStart = new Date(Date.now() - windowDays * 86_400_000)

    const salesRows = await fetchSales(supabase, windowStart)

    const commandeIds = unique(
      salesRows.map((row) =>
        textOrNull(row?.commande_id ?? row?.order_id ?? row?.commandeId)
      )
    )

    const orderStatuses = await fetchOrderStatuses(supabase, commandeIds)

    const scored = computeBestSellers(rawProducts, salesRows, orderStatuses, {
      freshnessDays,
      includeOutOfStock,
    })

    const total = scored.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const start = (page - 1) * limit
    const data = scored.slice(start, start + limit)

    const categories = unique(
      scored.map((product) => product.categorie).filter(Boolean)
    )

    const response = NextResponse.json({
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
        categories,
        generated_at: nowIso(),
        algorithm: ALGORITHM_VERSION,
        freshness_days: freshnessDays,
        include_out_of_stock: includeOutOfStock,
        degraded: false,
      },
    })

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300'
    )

    response.headers.set('X-Best-Sellers-Algorithm', ALGORITHM_VERSION)

    return response
  } catch (error: any) {
    const code = isTableMissingError(error) ? 'TABLE_MISSING' : 'INTERNAL_ERROR'
    const details = errorMessage(error, 'Erreur inconnue')

    console.warn(
      'Dégradation GET /api/produits/meilleures-ventes',
      code,
      details
    )

    return buildDegradedResponse(code, details)
  }
}