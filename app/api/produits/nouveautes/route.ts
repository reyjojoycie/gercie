// app/api/produits/nouveautes/route.ts
// ============================================================================
// API Nouveautés intelligentes
// Version complète, tolérante, sans wallet / portefeuille / solde / retrait.
//
// Endpoint :
// - GET /api/produits/nouveautes
//
// Paramètres query :
// - limit=number                    défaut : 8, max : 50
// - page=number                     défaut : 1, max : 100
// - categorie=string                défaut : vide
// - freshness_days=number           défaut : 14, min : 1, max : 60
// - include_out_of_stock=true|false défaut : false
// - candidate_limit=number          défaut : 200, min : 50, max : 500
// - sort=score|freshness            défaut : score
//
// Logique :
// - charge les produits actifs
// - garde seulement les produits récemment créés / mis en ligne
// - calcule un score intelligent :
//   fraîcheur, bon démarrage, note, promo, stock, complétude de fiche
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

const ALGORITHM_VERSION = 'new-arrivals-intelligent-v1'

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
  freshness: 0.38,
  traction: 0.22,
  rating: 0.15,
  promo: 0.12,
  stock: 0.08,
  completeness: 0.05,
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

interface PreparedProduct {
  product: ProductCandidate
  days: number
}

interface SalesMetrics {
  last7: number
  period: number
}

interface ScoredProduct extends ProductCandidate {
  score: number
  rank: number
  reasons: string[]
  days_since_created: number
  recent_ventes_7j: number
  recent_ventes_periode: number
  is_recent: boolean
  is_hot_start: boolean
  is_promo: boolean
  stock_faible: boolean
  rupture: boolean
  freshness_label: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMA QUERY                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(8),

  page: z.coerce.number().int().min(1).max(100).optional().default(1),

  categorie: z
    .string()
    .max(160)
    .optional()
    .default(''),

  freshness_days: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
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
    .max(500)
    .optional()
    .default(200),

  sort: z
    .enum(['score', 'freshness'])
    .optional()
    .default('score'),
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

  const orders = ['created_at', 'updated_at', 'total_ventes', null]
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
/*  FETCH RECENT SALES                                             */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchRecentSales(
  supabase: any,
  productIds: string[],
  windowStart: Date
): Promise<any[]> {
  if (productIds.length === 0) return []

  const idSet = new Set(productIds)

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
        let query = supabase.from(ARTICLE_TABLE).select(select).limit(10000)

        if (dateColumn) {
          query = query.gte(dateColumn, windowStart.toISOString())
        }

        const { data, error } = await query

        if (!error) {
          const rows = Array.isArray(data) ? data : []

          return rows.filter((row: any) => {
            const pid = textOrNull(
              row?.produit_id ?? row?.product_id ?? row?.produitId
            )

            return pid ? idSet.has(pid) : false
          })
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

function aggregateRecentSales(
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

    const current = map.get(produitId) || { last7: 0, period: 0 }

    if (ageDays !== null) {
      if (ageDays <= freshnessDays) {
        current.period += quantite
      }

      if (ageDays <= 7) {
        current.last7 += quantite
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
/*  PREPARATION + SCORING                                          */
/* ═══════════════════════════════════════════════════════════════ */

function prepareCandidates(
  rawProducts: any[],
  options: {
    freshnessDays: number
    includeOutOfStock: boolean
  }
): PreparedProduct[] {
  const now = Date.now()

  const candidates = rawProducts
    .map(normalizeProductRow)
    .filter((product): product is ProductCandidate => Boolean(product))
    .filter((product) => product.est_actif)

  const stockFiltered = options.includeOutOfStock
    ? candidates
    : candidates.filter(
        (product) => product.stock === null || product.stock > 0
      )

  const prepared: PreparedProduct[] = []

  for (const product of stockFiltered) {
    const dateRaw = product.created_at || product.updated_at
    const date = dateRaw ? new Date(dateRaw) : null

    if (!date || Number.isNaN(date.getTime())) continue

    const days = (now - date.getTime()) / 86_400_000

    if (days < 0) continue
    if (days > options.freshnessDays) continue

    prepared.push({ product, days })
  }

  return prepared
}

function scoreCandidates(
  prepared: PreparedProduct[],
  salesRows: any[],
  orderStatuses: Map<string, string>,
  options: {
    freshnessDays: number
    sort: 'score' | 'freshness'
  }
): ScoredProduct[] {
  if (prepared.length === 0) return []

  const salesByProduct = aggregateRecentSales(
    salesRows,
    orderStatuses,
    options.freshnessDays
  )

  const recent7Norm = normalizeMetric(
    prepared.map((item) => ({
      id: item.product.id,
      value: salesByProduct.get(item.product.id)?.last7 ?? 0,
    })),
    0
  )

  const totalNorm = normalizeMetric(
    prepared.map((item) => ({
      id: item.product.id,
      value: item.product.total_ventes,
    })),
    0
  )

  const scored: ScoredProduct[] = prepared.map(({ product, days }) => {
    const sales = salesByProduct.get(product.id) || { last7: 0, period: 0 }

    const recent7 = sales.last7
    const periodSales = sales.period

    const freshnessScore =
      days <= 1 ? 1 : Math.max(0, 1 - days / options.freshnessDays)

    const tractionNorm =
      0.7 * (recent7Norm.get(product.id) ?? 0) +
      0.3 * (totalNorm.get(product.id) ?? 0)

    const rating = toNum(product.note_moyenne, 0)
    const ratingNorm = clamp01(rating / 5)

    const promoNorm = clamp01(product.discount / 40)

    const stock = product.stock
    const rupture = stock !== null && stock <= 0
    const stockFaible = stock !== null && stock > 0 && stock <= 5

    const stockUrgency =
      stock === null
        ? 0.6
        : stock <= 0
          ? 0.1
          : stock <= 5
            ? 1
            : stock <= 20
              ? 0.6
              : 0.35

    const completeness =
      (product.images.length > 0 ? 0.4 : 0) +
      (product.categorie ? 0.2 : 0) +
      (product.slug ? 0.2 : 0) +
      (product.note_moyenne !== null ? 0.2 : 0)

    const rawScore =
      WEIGHTS.freshness * freshnessScore +
      WEIGHTS.traction * tractionNorm +
      WEIGHTS.rating * ratingNorm +
      WEIGHTS.promo * promoNorm +
      WEIGHTS.stock * stockUrgency +
      WEIGHTS.completeness * completeness

    const finalScore = rupture ? rawScore * 0.35 : rawScore

    const reasons: string[] = []

    if (days <= 1) {
      reasons.push("Ajouté aujourd'hui")
    } else if (days <= 3) {
      reasons.push('Nouveauté de la semaine')
    } else if (days <= 7) {
      reasons.push('Nouveau produit')
    } else {
      reasons.push('Récemment mis en ligne')
    }

    if (recent7 >= 3 || tractionNorm >= 0.65) {
      reasons.push('Bon démarrage')
    }

    if (rating >= 4.2) {
      reasons.push('Bien noté')
    }

    if (product.discount >= 10) {
      reasons.push('Promotion de lancement')
    }

    if (stockFaible) {
      reasons.push('Stock limité')
    }

    if (completeness >= 0.8) {
      reasons.push('Fiche complète')
    }

    const isRecent = days <= 7
    const isHotStart = recent7 >= 3 || tractionNorm >= 0.65

    const freshnessLabel =
      days < 1
        ? "aujourd'hui"
        : days < 2
          ? 'hier'
          : `il y a ${Math.floor(days)} j`

    return {
      ...product,
      score: Math.round(clamp01(finalScore) * 100),
      rank: 0,
      reasons: Array.from(new Set(reasons)).slice(0, 3),
      days_since_created: Math.round(days * 10) / 10,
      recent_ventes_7j: recent7,
      recent_ventes_periode: periodSales,
      is_recent: isRecent,
      is_hot_start: isHotStart,
      is_promo: product.discount > 0,
      stock_faible: stockFaible,
      rupture,
      freshness_label: freshnessLabel,
    }
  })

  scored.sort((a, b) => {
    if (options.sort === 'freshness') {
      return (
        a.days_since_created - b.days_since_created ||
        b.score - a.score ||
        b.total_ventes - a.total_ventes
      )
    }

    return (
      b.score - a.score ||
      a.days_since_created - b.days_since_created ||
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
  let limit = 8
  let freshnessDays = 14
  let includeOutOfStock = false
  let sort: 'score' | 'freshness' = 'score'

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
    freshnessDays = input.freshness_days
    includeOutOfStock = input.include_out_of_stock === 'true'
    sort = input.sort

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
      freshness_days: freshnessDays,
      include_out_of_stock: includeOutOfStock,
      sort,
    }

    if (!supabase || typeof supabase.from !== 'function') {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            ...emptyMeta,
            warning:
              'Configuration Supabase indisponible : classement des nouveautés vide.',
          },
        },
        { status: 200 }
      )
    }

    const rawProducts = await fetchProducts(supabase, {
      candidateLimit,
      categorie,
    })

    const prepared = prepareCandidates(rawProducts, {
      freshnessDays,
      includeOutOfStock,
    })

    if (prepared.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            ...emptyMeta,
            warning:
              'Aucun produit récemment ajouté trouvé pour la période demandée.',
          },
        },
        { status: 200 }
      )
    }

    const productIds = prepared.map((item) => item.product.id)

    const windowDays = Math.max(freshnessDays, 14)
    const windowStart = new Date(Date.now() - windowDays * 86_400_000)

    const salesRows = await fetchRecentSales(
      supabase,
      productIds,
      windowStart
    )

    const commandeIds = unique(
      salesRows.map((row: any) =>
        textOrNull(row?.commande_id ?? row?.order_id ?? row?.commandeId)
      )
    )

    const orderStatuses = await fetchOrderStatuses(supabase, commandeIds)

    const scored = scoreCandidates(prepared, salesRows, orderStatuses, {
      freshnessDays,
      sort,
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
        sort,
      },
    })

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300'
    )

    response.headers.set('X-New-Arrivals-Algorithm', ALGORITHM_VERSION)

    return response
  } catch (error: any) {
    const tableMissing = isTableMissingError(error)

    if (tableMissing) {
      console.warn(
        '[NEW-ARRIVALS] Table manquante, retour d’un classement vide :',
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
            freshness_days: freshnessDays,
            include_out_of_stock: includeOutOfStock,
            sort,
            warning:
              'Classement indisponible : la table produits est introuvable ou mal configurée.',
          },
        },
        { status: 200 }
      )
    }

    console.error('Crash GET /api/produits/nouveautes', error)

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
          freshness_days: freshnessDays,
          include_out_of_stock: includeOutOfStock,
          sort,
          warning:
            'Erreur interne lors du calcul des nouveautés. Classement vide renvoyé pour ne pas bloquer la homepage.',
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