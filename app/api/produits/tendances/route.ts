// app/api/produits/tendances/route.ts
// ============================================================================
// API Tendances intelligentes
// Version complète, tolérante, sans wallet / portefeuille / solde / retrait.
//
// Endpoint :
// - GET /api/produits/tendances
//
// Paramètres query :
// - limit=number                    défaut : 20, max : 50
// - page=number                     défaut : 1, max : 100
// - categorie=string                défaut : vide
// - window_days=number              défaut : 14, min : 7, max : 30
// - include_out_of_stock=true|false défaut : false
// - candidate_limit=number          défaut : 300, min : 50, max : 1000
//
// Logique :
// - charge les produits actifs
// - calcule les ventes récentes sur 7 jours / 14 jours
// - mesure la dynamique de hausse (momentum)
// - combine : ventes récentes, tendance, total ventes, note, promo, stock
// - renvoie les produits classés par score de tendance
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

const ALGORITHM_VERSION = 'trending-intelligent-v1'

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
  velocity7: 0.4,
  momentum: 0.25,
  total: 0.1,
  rating: 0.12,
  promo: 0.08,
  stock: 0.05,
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
  updated_at: string | null
  est_actif: boolean
  discount: number
}

interface SalesMetrics {
  sales7: number
  sales14: number
  previous7: number
  period: number
  total: number
}

interface ScoredProduct extends ProductCandidate {
  score: number
  rank: number
  reasons: string[]
  recent_ventes_7j: number
  recent_ventes_14j: number
  recent_ventes_periode: number
  tendance: number
  is_trending: boolean
  stock_faible: boolean
  rupture: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMA QUERY                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),

  page: z.coerce.number().int().min(1).max(100).optional().default(1),

  categorie: z
    .string()
    .max(160)
    .optional()
    .default(''),

  window_days: z.coerce
    .number()
    .int()
    .min(7)
    .max(30)
    .optional()
    .default(14),

  include_out_of_stock: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),

  candidate_limit: z.coerce
    .number()
    .int()
    .min(50)
    .max(1000)
    .optional()
    .default(300),
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
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '42P01' ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('n’existe pas') ||
    message.includes("n'existe pas")
  )
}

function isColumnError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '42703' ||
    message.includes('column') ||
    message.includes('does not exist') ||
    message.includes('could not find')
  )
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'oui', 'yes', 'on', 'actif', 'active'].includes(str)) return true
  if (['false', 'non', 'no', 'off', 'inactif', 'inactive'].includes(str)) {
    return false
  }

  return fallback
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

          if (applyActive && select.includes('est_actif')) {
            query = query.eq('est_actif', true)
          }

          if (options.categorie && select.includes('categorie')) {
            query = query.ilike('categorie', `%${options.categorie}%`)
          }

          if (order && select.includes(order)) {
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
/*  FETCH RECENT SALES                                             */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchRecentSales(
  supabase: any,
  windowStart: Date
): Promise<any[]> {
  const selects = [
    'produit_id, quantite, created_at, commande_id',
    'product_id, quantity, created_at, commande_id',
    'produit_id, quantite, updated_at, commande_id',
    '*',
  ]

  const dateColumns = ['created_at', 'updated_at', null]

  for (const select of selects) {
    for (const dateColumn of dateColumns) {
      try {
        if (dateColumn && !select.includes(dateColumn) && select !== '*') {
          continue
        }

        let query = supabase.from(ARTICLE_TABLE).select(select).limit(20000)

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
    updated_at: textOrNull(row?.updated_at ?? row?.updatedAt),
    est_actif:
      row?.est_actif === undefined
        ? true
        : toBool(row?.est_actif ?? row?.active ?? row?.is_active, true),
    discount,
  }
}

function aggregateSales(
  rows: any[],
  orderStatuses: Map<string, string>,
  windowDays: number,
  productIds: Set<string>
): Map<string, SalesMetrics> {
  const now = Date.now()
  const map = new Map<string, SalesMetrics>()

  for (const row of rows) {
    const produitId = textOrNull(
      row?.produit_id ?? row?.product_id ?? row?.produitId
    )

    if (!produitId || !productIds.has(produitId)) continue

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
        sales7: 0,
        sales14: 0,
        previous7: 0,
        period: 0,
        total: 0,
      }

    current.total += quantite

    if (ageDays !== null) {
      if (ageDays <= windowDays) {
        current.period += quantite
      }

      if (ageDays <= 7) {
        current.sales7 += quantite
      }

      if (ageDays <= 14) {
        current.sales14 += quantite
      }

      if (ageDays > 7 && ageDays <= 14) {
        current.previous7 += quantite
      }
    }

    map.set(produitId, current)
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

/* ═══════════════════════════════════════════════════════════════ */
/*  SCORING                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function computeTrending(
  candidates: ProductCandidate[],
  salesRows: any[],
  orderStatuses: Map<string, string>,
  options: {
    windowDays: number
    includeOutOfStock: boolean
  }
): ScoredProduct[] {
  const productIds = new Set(candidates.map((p) => p.id))

  const metricsById = aggregateSales(
    salesRows,
    orderStatuses,
    options.windowDays,
    productIds
  )

  const enriched = candidates.map((product) => {
    const metrics =
      metricsById.get(product.id) ||
      ({
        sales7: 0,
        sales14: 0,
        previous7: 0,
        period: 0,
        total: 0,
      } as SalesMetrics)

    const velocity7 = metrics.sales7 / 7
    const momentum =
      metrics.previous7 > 0
        ? metrics.sales7 / metrics.previous7
        : metrics.sales7 > 0
          ? 2
          : 0

    return {
      product,
      metrics,
      velocity7,
      momentum: Math.min(momentum, 3),
    }
  })

  const active = enriched.filter(
    (item) =>
      item.metrics.sales7 > 0 ||
      item.metrics.sales14 > 0 ||
      item.metrics.period > 0
  )

  if (active.length === 0) {
    return []
  }

  const velocityNorm = normalizeMetric(
    active.map((item) => ({
      id: item.product.id,
      value: item.velocity7,
    })),
    0
  )

  const momentumNorm = normalizeMetric(
    active.map((item) => ({
      id: item.product.id,
      value: item.momentum,
    })),
    0
  )

  const totalNorm = normalizeMetric(
    active.map((item) => ({
      id: item.product.id,
      value: item.product.total_ventes,
    })),
    0
  )

  const scored: ScoredProduct[] = active.map(({ product, metrics, momentum }) => {
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
              ? 0.6
              : 0.35

    const rating = toNum(product.note_moyenne, 0)
    const ratingNorm = clamp01(rating / 5)
    const promoNorm = clamp01(product.discount / 40)

    const velocityN = velocityNorm.get(product.id) ?? 0
    const momentumN = momentumNorm.get(product.id) ?? 0
    const totalN = totalNorm.get(product.id) ?? 0

    const rawScore =
      WEIGHTS.velocity7 * velocityN +
      WEIGHTS.momentum * momentumN +
      WEIGHTS.total * totalN +
      WEIGHTS.rating * ratingNorm +
      WEIGHTS.promo * promoNorm +
      WEIGHTS.stock * stockUrgency

    const finalScore = rupture ? rawScore * 0.25 : rawScore

    const reasons: string[] = []

    if (velocityN >= 0.7) {
      reasons.push('Ventes fortes cette semaine')
    }

    if (momentumN >= 0.6 && metrics.sales7 > metrics.previous7) {
      reasons.push('Tendance en hausse')
    }

    if (totalN >= 0.8) {
      reasons.push('Parmi les plus vendus')
    }

    if (rating >= 4.2) {
      reasons.push('Bien noté par les clients')
    }

    if (product.discount >= 10) {
      reasons.push('Promotion active')
    }

    if (stockFaible) {
      reasons.push('Stock limité')
    }

    if (reasons.length === 0) {
      reasons.push('Tendance Gercie')
    }

    const isTrending =
      velocityN >= 0.45 || momentumN >= 0.45 || metrics.sales7 > 0

    return {
      ...product,
      score: Math.round(clamp01(finalScore) * 100),
      rank: 0,
      reasons: Array.from(new Set(reasons)).slice(0, 3),
      recent_ventes_7j: metrics.sales7,
      recent_ventes_14j: metrics.sales14,
      recent_ventes_periode: metrics.period,
      tendance: Number(momentum.toFixed(2)),
      is_trending: isTrending,
      stock_faible: stockFaible,
      rupture,
    }
  })

  scored.sort((a, b) => {
    return (
      b.score - a.score ||
      b.recent_ventes_7j - a.recent_ventes_7j ||
      b.total_ventes - a.total_ventes ||
      toNum(b.note_moyenne, 0) - toNum(a.note_moyenne, 0)
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
  let page = 1
  let limit = 20
  let windowDays = 14
  let includeOutOfStock = false

  try {
    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse(
      Object.fromEntries(searchParams.entries())
    )

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Paramètres de requête invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
          data: [],
        },
        { status: 400 }
      )
    }

    const input = parsed.data

    page = input.page
    limit = input.limit
    windowDays = input.window_days
    includeOutOfStock = input.include_out_of_stock === 'true'

    const categorie = sanitizeLike(input.categorie)
    const candidateLimit = input.candidate_limit

    const supabase = await getSupabaseAdmin()

    const emptyMeta = {
      page,
      limit,
      total: 0,
      totalPages: 1,
      hasMore: false,
      categories: [] as string[],
      generated_at: nowIso(),
      algorithm: ALGORITHM_VERSION,
      window_days: windowDays,
      include_out_of_stock: includeOutOfStock,
    }

    if (!supabase || typeof supabase.from !== 'function') {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            ...emptyMeta,
            warning:
              'Configuration Supabase indisponible : classement des tendances vide.',
          },
        },
        { status: 200 }
      )
    }

    const rawProducts = await fetchProducts(supabase, {
      candidateLimit,
      categorie,
    })

    const candidates = rawProducts
      .map(normalizeProductRow)
      .filter((product): product is ProductCandidate => Boolean(product))
      .filter((product) => product.est_actif)

    const stockFilteredCandidates = includeOutOfStock
      ? candidates
      : candidates.filter(
          (product) => product.stock === null || product.stock > 0
        )

    if (stockFilteredCandidates.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            ...emptyMeta,
            warning:
              'Aucun produit actif disponible pour le calcul des tendances.',
          },
        },
        { status: 200 }
      )
    }

    const analysisDays = Math.max(windowDays, 14)
    const windowStart = new Date(Date.now() - analysisDays * 86_400_000)

    const salesRows = await fetchRecentSales(supabase, windowStart)

    const productIds = new Set(stockFilteredCandidates.map((p) => p.id))

    const relevantRows = salesRows.filter((row: any) => {
      const pid = textOrNull(
        row?.produit_id ?? row?.product_id ?? row?.produitId
      )

      return pid ? productIds.has(pid) : false
    })

    if (relevantRows.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            ...emptyMeta,
            warning:
              'Aucune vente récente détectée pour calculer les tendances.',
          },
        },
        { status: 200 }
      )
    }

    const commandeIds = unique(
      relevantRows.map((row: any) =>
        textOrNull(row?.commande_id ?? row?.order_id ?? row?.commandeId)
      )
    )

    const orderStatuses = await fetchOrderStatuses(supabase, commandeIds)

    const scored = computeTrending(
      stockFilteredCandidates,
      relevantRows,
      orderStatuses,
      {
        windowDays,
        includeOutOfStock,
      }
    )

    if (scored.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            ...emptyMeta,
            warning:
              'Aucun produit ne présente de tendance suffisante sur la période.',
          },
        },
        { status: 200 }
      )
    }

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
        window_days: windowDays,
        include_out_of_stock: includeOutOfStock,
      },
    })

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300'
    )

    response.headers.set('X-Trending-Algorithm', ALGORITHM_VERSION)

    return response
  } catch (error: any) {
    const tableMissing = isTableMissingError(error)

    if (tableMissing) {
      console.warn(
        '[TRENDING] Table manquante, retour d’un classement vide :',
        errorMessage(error, 'Table manquante')
      )

      return NextResponse.json(
        {
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
            window_days: windowDays,
            include_out_of_stock: includeOutOfStock,
            warning:
              'Classement indisponible : une table nécessaire aux tendances est introuvable.',
          },
        },
        { status: 200 }
      )
    }

    console.error('Crash GET /api/produits/tendances', error)

    return NextResponse.json(
      {
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
          window_days: windowDays,
          include_out_of_stock: includeOutOfStock,
          warning:
            'Erreur interne lors du calcul des tendances. Classement vide renvoyé pour ne pas bloquer la homepage.',
          details:
            process.env.NODE_ENV === 'development'
              ? errorMessage(error, 'Erreur inconnue')
              : undefined,
        },
      },
      { status: 200 }
    )
  }
}