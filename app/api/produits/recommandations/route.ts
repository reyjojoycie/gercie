// app/api/produits/recommandations/route.ts
// ============================================================================
// API Recommandations personnalisées intelligentes
// Version complète, tolérante, sans wallet / portefeuille / solde / retrait.
//
// Endpoint :
// - GET /api/produits/recommandations
//
// Paramètres query :
// - limit=number                    défaut : 20, max : 50
// - candidate_limit=number          défaut : 300, min : 50, max : 1000
// - include_purchased=true|false    défaut : false
// - freshness_days=number           défaut : 30, min : 7, max : 120
//
// Logique :
// - identifie l'utilisateur connecté
// - récupère ses achats récents
// - récupère ses favoris si table disponible
// - récupère son historique de navigation si table disponible
// - calcule des affinités :
//   catégorie, vendeur, prix, produits consultés, popularité, note, nouveauté, stock
// - si pas d'historique : fallback découverte / tendances
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
const ORDER_TABLE = 'commandes'
const ARTICLE_TABLE = 'commande_articles'

const FAVORITE_TABLES = [
  'favoris',
  'user_favorites',
  'favorites',
  'produits_favoris',
]

const VIEW_TABLES = [
  'product_views',
  'historique_vues',
  'vues_produits',
  'produits_vus',
]

const ALGORITHM_VERSION = 'personalized-recommendations-v1'

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

const HISTORY_WEIGHTS = {
  purchase: 3,
  favorite: 2,
  view: 1,
}

const WARM_WEIGHTS = {
  category: 0.32,
  vendor: 0.14,
  price: 0.14,
  popularity: 0.14,
  rating: 0.10,
  novelty: 0.06,
  stock: 0.05,
  directInterest: 0.05,
}

const COLD_WEIGHTS = {
  category: 0,
  vendor: 0,
  price: 0,
  popularity: 0.45,
  rating: 0.25,
  novelty: 0.15,
  stock: 0.15,
  directInterest: 0,
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
  vendeur_id: string | null
  total_ventes: number
  note_moyenne: number | null
  stock: number | null
  created_at: string | null
  updated_at: string | null
  est_actif: boolean
  discount: number
}

interface HistorySignals {
  purchasedProductIds: Set<string>
  favoritedProductIds: Set<string>
  viewedProductIds: Set<string>
  categoryScores: Map<string, number>
  vendorScores: Map<string, number>
  prices: number[]
  hasHistory: boolean
  purchaseCount: number
  favoriteCount: number
  viewCount: number
}

interface ScoredProduct extends ProductCandidate {
  score: number
  rank: number
  reasons: string[]
  signals: {
    category_match: boolean
    vendor_match: boolean
    price_match: boolean
    previously_viewed: boolean
    previously_favorited: boolean
    previously_purchased: boolean
    is_popular: boolean
    is_well_rated: boolean
    is_new: boolean
    low_stock: boolean
    out_of_stock: boolean
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMA QUERY                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),

  candidate_limit: z.coerce
    .number()
    .int()
    .min(50)
    .max(1000)
    .optional()
    .default(300),

  include_purchased: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),

  freshness_days: z.coerce
    .number()
    .int()
    .min(7)
    .max(120)
    .optional()
    .default(30),
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

function normalizeStatus(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
}

function addScore(
  map: Map<string, number>,
  key: string | null | undefined,
  value: number
): void {
  if (!key) return

  map.set(key, (map.get(key) || 0) + value)
}

function normalizeMapValues(map: Map<string, number>): Map<string, number> {
  const values = Array.from(map.values())
  if (values.length === 0) return map

  const max = Math.max(...values)
  if (max <= 0) return map

  const normalized = new Map<string, number>()

  for (const [key, value] of map.entries()) {
    normalized.set(key, clamp01(value / max))
  }

  return normalized
}

function priceProximity(price: number, averagePrice: number): number {
  if (price <= 0 || averagePrice <= 0) return 0.5

  const ratio = price / averagePrice
  const logDistance = Math.abs(Math.log(Math.max(0.01, ratio)))

  return clamp01(Math.exp(-logDistance))
}

async function getSupabaseClients(): Promise<{
  supabase: any
  supabaseAdmin: any
}> {
  const userClient: any = await createClient(false)
  const adminClient: any = await createClient(true)

  return {
    supabase: userClient?.supabase ?? userClient,
    supabaseAdmin: adminClient?.supabase ?? adminClient,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  AUTH                                                           */
/* ═══════════════════════════════════════════════════════════════ */

async function getUserId(): Promise<string | null> {
  try {
    const { supabase } = await getSupabaseClients()

    if (!supabase) return null

    const { data, error } = await supabase.auth.getUser()

    if (error || !data?.user) return null

    return String(data.user.id)
  } catch {
    return null
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH USER ORDERS                                              */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchUserOrderIds(
  supabaseAdmin: any,
  userId: string
): Promise<string[]> {
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString()

  const userColumns = [
    'client_id',
    'acheteur_id',
    'customer_id',
    'user_id',
  ]

  for (const column of userColumns) {
    try {
      const { data, error } = await supabaseAdmin
        .from(ORDER_TABLE)
        .select('id, created_at, statut')
        .eq(column, userId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)

      if (!error && Array.isArray(data)) {
        return data
          .filter((order: any) => {
            const statut = normalizeStatus(order?.statut)
            return !statut || !EXCLUDED_ORDER_STATUSES.has(statut)
          })
          .map((order: any) => String(order.id))
          .filter(Boolean)
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

  return []
}

async function fetchOrderArticleProductIds(
  supabaseAdmin: any,
  orderIds: string[]
): Promise<Map<string, number>> {
  const productQuantities = new Map<string, number>()

  if (orderIds.length === 0) {
    return productQuantities
  }

  const commandColumns = ['commande_id', 'order_id']
  const productColumns = ['produit_id', 'product_id']
  const qtyColumns = ['quantite', 'quantity']

  for (const commandColumn of commandColumns) {
    for (const productColumn of productColumns) {
      for (const qtyColumn of qtyColumns) {
        try {
          const select = `${commandColumn}, ${productColumn}, ${qtyColumn}, created_at`

          const chunks: string[][] = []

          for (let i = 0; i < orderIds.length; i += 500) {
            chunks.push(orderIds.slice(i, i + 500))
          }

          for (const chunk of chunks) {
            const { data, error } = await supabaseAdmin
              .from(ARTICLE_TABLE)
              .select(select)
              .in(commandColumn, chunk)
              .limit(5000)

            if (error) {
              if (isTableMissingError(error)) {
                return productQuantities
              }

              if (isColumnError(error)) {
                break
              }

              continue
            }

            for (const row of data ?? []) {
              const productId = textOrNull(row?.[productColumn])
              const quantity = Math.max(
                1,
                toNum(row?.[qtyColumn], 1)
              )

              if (!productId) continue

              productQuantities.set(
                productId,
                (productQuantities.get(productId) || 0) + quantity
              )
            }
          }

          if (productQuantities.size > 0) {
            return productQuantities
          }
        } catch (err: any) {
          if (isTableMissingError(err)) {
            return productQuantities
          }

          if (isColumnError(err)) {
            continue
          }
        }
      }
    }
  }

  return productQuantities
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH FAVORITES                                                */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchFavoriteProductIds(
  supabaseAdmin: any,
  userId: string
): Promise<Set<string>> {
  const ids = new Set<string>()

  const userColumns = ['user_id', 'utilisateur_id', 'client_id']
  const productColumns = ['produit_id', 'product_id', 'produitId']

  for (const table of FAVORITE_TABLES) {
    for (const userColumn of userColumns) {
      for (const productColumn of productColumns) {
        try {
          const { data, error } = await supabaseAdmin
            .from(table)
            .select(`${userColumn}, ${productColumn}, created_at`)
            .eq(userColumn, userId)
            .order('created_at', { ascending: false })
            .limit(500)

          if (!error && Array.isArray(data)) {
            for (const row of data) {
              const productId = textOrNull(row?.[productColumn])
              if (productId) ids.add(productId)
            }

            if (ids.size > 0) {
              return ids
            }
          }

          if (isTableMissingError(error)) {
            break
          }

          if (isColumnError(error)) {
            continue
          }

          break
        } catch (err: any) {
          if (isTableMissingError(err)) {
            break
          }

          if (isColumnError(err)) {
            continue
          }

          break
        }
      }
    }
  }

  return ids
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH VIEWS                                                    */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchViewedProductIds(
  supabaseAdmin: any,
  userId: string,
  freshnessDays: number
): Promise<Set<string>> {
  const ids = new Set<string>()
  const since = new Date(Date.now() - freshnessDays * 86_400_000).toISOString()

  const userColumns = ['user_id', 'utilisateur_id', 'client_id']
  const productColumns = ['produit_id', 'product_id', 'produitId']

  for (const table of VIEW_TABLES) {
    for (const userColumn of userColumns) {
      for (const productColumn of productColumns) {
        try {
          const { data, error } = await supabaseAdmin
            .from(table)
            .select(`${userColumn}, ${productColumn}, created_at`)
            .eq(userColumn, userId)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(1000)

          if (!error && Array.isArray(data)) {
            for (const row of data) {
              const productId = textOrNull(row?.[productColumn])
              if (productId) ids.add(productId)
            }

            if (ids.size > 0) {
              return ids
            }
          }

          if (isTableMissingError(error)) {
            break
          }

          if (isColumnError(error)) {
            continue
          }

          break
        } catch (err: any) {
          if (isTableMissingError(err)) {
            break
          }

          if (isColumnError(err)) {
            continue
          }

          break
        }
      }
    }
  }

  return ids
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH PRODUCT DETAILS FOR HISTORY                              */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchProductDetailsByIds(
  supabaseAdmin: any,
  productIds: string[]
): Promise<Map<string, any>> {
  const map = new Map<string, any>()
  const ids = unique(productIds)

  if (ids.length === 0) {
    return map
  }

  const selects = [
    'id, nom, categorie, vendeur_id, prix, prix_promo, created_at',
    'id, nom, category, vendor_id, prix, prix_promo, created_at',
    'id, nom, categorie, prix, created_at',
    'id, nom, prix',
  ]

  for (const select of selects) {
    try {
      const chunks: string[][] = []

      for (let i = 0; i < ids.length; i += 500) {
        chunks.push(ids.slice(i, i + 500))
      }

      for (const chunk of chunks) {
        const { data, error } = await supabaseAdmin
          .from(PRODUCT_TABLE)
          .select(select)
          .in('id', chunk)

        if (!error && Array.isArray(data)) {
          for (const row of data) {
            const id = textOrNull(row?.id)
            if (id) map.set(id, row)
          }
        }

        if (isTableMissingError(error)) {
          return map
        }

        if (isColumnError(error)) {
          break
        }
      }

      if (map.size > 0) {
        return map
      }
    } catch (err: any) {
      if (isTableMissingError(err)) {
        return map
      }

      if (isColumnError(err)) {
        continue
      }
    }
  }

  return map
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH CANDIDATE PRODUCTS                                       */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchCandidateProducts(
  supabaseAdmin: any,
  candidateLimit: number
): Promise<any[]> {
  const selects = [
    'id, nom, slug, prix, prix_promo, images, categorie, vendeur_id, total_ventes, note_moyenne, stock, est_actif, created_at, updated_at',
    'id, nom, slug, prix, prix_promo, images, categorie, vendeur_id, total_ventes, note_moyenne, stock, est_actif, created_at',
    'id, nom, prix, prix_promo, images, categorie, vendeur_id, total_ventes, note_moyenne, stock, est_actif',
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
          let query = supabaseAdmin
            .from(PRODUCT_TABLE)
            .select(select)
            .limit(candidateLimit)

          if (applyActive && select.includes('est_actif')) {
            query = query.eq('est_actif', true)
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
    vendeur_id: textOrNull(row?.vendeur_id ?? row?.vendor_id),
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

async function buildHistorySignals(
  supabaseAdmin: any,
  userId: string,
  freshnessDays: number
): Promise<HistorySignals> {
  const orderIds = await fetchUserOrderIds(supabaseAdmin, userId)
  const purchasedQuantities = await fetchOrderArticleProductIds(
    supabaseAdmin,
    orderIds
  )

  const purchasedProductIds = new Set(purchasedQuantities.keys())
  const favoritedProductIds = await fetchFavoriteProductIds(
    supabaseAdmin,
    userId
  )
  const viewedProductIds = await fetchViewedProductIds(
    supabaseAdmin,
    userId,
    freshnessDays
  )

  const allHistoryIds = unique([
    ...Array.from(purchasedProductIds),
    ...Array.from(favoritedProductIds),
    ...Array.from(viewedProductIds),
  ])

  const details = await fetchProductDetailsByIds(
    supabaseAdmin,
    allHistoryIds
  )

  const categoryScores = new Map<string, number>()
  const vendorScores = new Map<string, number>()
  const prices: number[] = []

  for (const productId of purchasedProductIds) {
    const quantity = purchasedQuantities.get(productId) || 1
    const weight = HISTORY_WEIGHTS.purchase * Math.min(quantity, 5)
    const product = details.get(productId)

    addScore(categoryScores, product?.categorie ?? product?.category, weight)
    addScore(vendorScores, product?.vendeur_id ?? product?.vendor_id, weight)

    const price = toNullableNumber(product?.prix ?? product?.price)
    if (price !== null && price > 0) prices.push(price)
  }

  for (const productId of favoritedProductIds) {
    const weight = HISTORY_WEIGHTS.favorite
    const product = details.get(productId)

    addScore(categoryScores, product?.categorie ?? product?.category, weight)
    addScore(vendorScores, product?.vendeur_id ?? product?.vendor_id, weight)

    const price = toNullableNumber(product?.prix ?? product?.price)
    if (price !== null && price > 0) prices.push(price)
  }

  for (const productId of viewedProductIds) {
    const weight = HISTORY_WEIGHTS.view
    const product = details.get(productId)

    addScore(categoryScores, product?.categorie ?? product?.category, weight)
    addScore(vendorScores, product?.vendeur_id ?? product?.vendor_id, weight)

    const price = toNullableNumber(product?.prix ?? product?.price)
    if (price !== null && price > 0) prices.push(price)
  }

  const hasHistory =
    purchasedProductIds.size > 0 ||
    favoritedProductIds.size > 0 ||
    viewedProductIds.size > 0

  return {
    purchasedProductIds,
    favoritedProductIds,
    viewedProductIds,
    categoryScores: normalizeMapValues(categoryScores),
    vendorScores: normalizeMapValues(vendorScores),
    prices,
    hasHistory,
    purchaseCount: purchasedProductIds.size,
    favoriteCount: favoritedProductIds.size,
    viewCount: viewedProductIds.size,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCORING                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function scoreRecommendations(
  candidates: ProductCandidate[],
  signals: HistorySignals,
  options: {
    includePurchased: boolean
    freshnessDays: number
  }
): ScoredProduct[] {
  if (candidates.length === 0) return []

  const averagePrice =
    signals.prices.length > 0
      ? signals.prices.reduce((sum, price) => sum + price, 0) /
        signals.prices.length
      : 0

  const popularityValues = candidates.map((product) => product.total_ventes)
  const maxPopularity = Math.max(...popularityValues, 1)

  const now = Date.now()

  let filtered = candidates

  if (!options.includePurchased && signals.purchasedProductIds.size > 0) {
    const withoutPurchased = candidates.filter(
      (product) => !signals.purchasedProductIds.has(product.id)
    )

    if (withoutPurchased.length > 0) {
      filtered = withoutPurchased
    }
  }

  const scored: ScoredProduct[] = filtered.map((product) => {
    const categoryMatch = product.categorie
      ? signals.categoryScores.get(product.categorie) ?? 0
      : 0

    const vendorMatch = product.vendeur_id
      ? signals.vendorScores.get(product.vendeur_id) ?? 0
      : 0

    const priceMatch =
      averagePrice > 0 ? priceProximity(product.effective_price, averagePrice) : 0.5

    const popularity = clamp01(product.total_ventes / maxPopularity)

    const rating = toNum(product.note_moyenne, 0)
    const ratingNorm = clamp01(rating / 5)

    const createdDate = product.created_at
      ? new Date(product.created_at)
      : null

    const daysSinceCreated =
      createdDate && !Number.isNaN(createdDate.getTime())
        ? (now - createdDate.getTime()) / 86_400_000
        : 999

    const novelty =
      daysSinceCreated <= options.freshnessDays
        ? clamp01(1 - daysSinceCreated / options.freshnessDays)
        : 0

    const stock = product.stock
    const outOfStock = stock !== null && stock <= 0
    const lowStock = stock !== null && stock > 0 && stock <= 5

    const stockScore =
      stock === null
        ? 0.6
        : outOfStock
          ? 0.05
          : lowStock
            ? 1
            : stock <= 20
              ? 0.65
              : 0.4

    const previouslyViewed = signals.viewedProductIds.has(product.id)
    const previouslyFavorited = signals.favoritedProductIds.has(product.id)
    const previouslyPurchased = signals.purchasedProductIds.has(product.id)

    const directInterest =
      (previouslyViewed ? 0.5 : 0) +
      (previouslyFavorited ? 0.7 : 0) +
      (previouslyPurchased && options.includePurchased ? 0.3 : 0)

    const weights = signals.hasHistory ? WARM_WEIGHTS : COLD_WEIGHTS

    const rawScore =
      weights.category * categoryMatch +
      weights.vendor * vendorMatch +
      weights.price * priceMatch +
      weights.popularity * popularity +
      weights.rating * ratingNorm +
      weights.novelty * novelty +
      weights.stock * stockScore +
      weights.directInterest * clamp01(directInterest)

    const finalScore = outOfStock ? rawScore * 0.25 : rawScore

    const reasons: string[] = []

    if (signals.hasHistory) {
      if (categoryMatch >= 0.65) {
        reasons.push('Même catégorie que vos centres d’intérêt')
      }

      if (vendorMatch >= 0.65) {
        reasons.push('Vendeur que vous avez déjà apprécié')
      }

      if (priceMatch >= 0.75 && averagePrice > 0) {
        reasons.push('Proche de votre budget habituel')
      }

      if (previouslyFavorited) {
        reasons.push('Déjà dans vos favoris')
      } else if (previouslyViewed) {
        reasons.push('Déjà consulté récemment')
      }

      if (previouslyPurchased && options.includePurchased) {
        reasons.push('Déjà acheté par le passé')
      }
    }

    if (popularity >= 0.75) {
      reasons.push('Très populaire')
    }

    if (rating >= 4.2) {
      reasons.push('Bien noté par les clients')
    }

    if (novelty >= 0.75) {
      reasons.push('Nouveau produit')
    }

    if (lowStock) {
      reasons.push('Stock limité')
    }

    if (!signals.hasHistory && reasons.length === 0) {
      reasons.push('Sélection découverte Gercie')
    }

    if (reasons.length === 0) {
      reasons.push('Recommandation Gercie')
    }

    return {
      ...product,
      score: Math.round(clamp01(finalScore) * 100),
      rank: 0,
      reasons: Array.from(new Set(reasons)).slice(0, 3),
      signals: {
        category_match: categoryMatch >= 0.5,
        vendor_match: vendorMatch >= 0.5,
        price_match: priceMatch >= 0.7,
        previously_viewed: previouslyViewed,
        previously_favorited: previouslyFavorited,
        previously_purchased: previouslyPurchased,
        is_popular: popularity >= 0.7,
        is_well_rated: rating >= 4.2,
        is_new: novelty >= 0.7,
        low_stock: lowStock,
        out_of_stock: outOfStock,
      },
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
  let limit = 20
  let candidateLimit = 300
  let includePurchased = false
  let freshnessDays = 30

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

    limit = input.limit
    candidateLimit = input.candidate_limit
    includePurchased = input.include_purchased === 'true'
    freshnessDays = input.freshness_days

    const userId = await getUserId()

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentification requise pour les recommandations personnalisées.',
          code: 'UNAUTHORIZED',
          data: [],
        },
        { status: 401 }
      )
    }

    const { supabaseAdmin } = await getSupabaseClients()

    const emptyMeta = {
      limit,
      total: 0,
      generated_at: nowIso(),
      algorithm: ALGORITHM_VERSION,
      personalization: {
        has_history: false,
        cold_start: true,
        purchase_count: 0,
        favorite_count: 0,
        view_count: 0,
        include_purchased: includePurchased,
        freshness_days: freshnessDays,
      },
    }

    if (!supabaseAdmin || typeof supabaseAdmin.from !== 'function') {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            ...emptyMeta,
            warning:
              'Configuration Supabase indisponible : recommandations vides.',
          },
        },
        { status: 200 }
      )
    }

    const signals = await buildHistorySignals(
      supabaseAdmin,
      userId,
      freshnessDays
    )

    const rawCandidates = await fetchCandidateProducts(
      supabaseAdmin,
      candidateLimit
    )

    const candidates = rawCandidates
      .map(normalizeProductRow)
      .filter((product): product is ProductCandidate => Boolean(product))
      .filter((product) => product.est_actif)
      .filter((product) => product.stock === null || product.stock > 0)

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            ...emptyMeta,
            warning:
              'Aucun produit actif disponible pour générer des recommandations.',
          },
        },
        { status: 200 }
      )
    }

    const scored = scoreRecommendations(candidates, signals, {
      includePurchased,
      freshnessDays,
    })

    const data = scored.slice(0, limit)

    const response = NextResponse.json({
      success: true,
      data,
      meta: {
        limit,
        total: scored.length,
        generated_at: nowIso(),
        algorithm: ALGORITHM_VERSION,
        personalization: {
          has_history: signals.hasHistory,
          cold_start: !signals.hasHistory,
          purchase_count: signals.purchaseCount,
          favorite_count: signals.favoriteCount,
          view_count: signals.viewCount,
          include_purchased: includePurchased,
          freshness_days: freshnessDays,
          average_price:
            signals.prices.length > 0
              ? Math.round(
                  signals.prices.reduce((sum, price) => sum + price, 0) /
                    signals.prices.length
                )
              : null,
          top_categories: Array.from(signals.categoryScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([category]) => category),
          top_vendors: Array.from(signals.vendorScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([vendor]) => vendor),
        },
      },
    })

    response.headers.set(
      'Cache-Control',
      'private, s-maxage=30, stale-while-revalidate=120'
    )

    response.headers.set(
      'X-Personalized-Recommendations-Algorithm',
      ALGORITHM_VERSION
    )

    return response
  } catch (error: any) {
    const tableMissing = isTableMissingError(error)

    if (tableMissing) {
      console.warn(
        '[RECOMMENDATIONS] Table manquante, retour de recommandations vides :',
        errorMessage(error, 'Table manquante')
      )

      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            limit,
            total: 0,
            generated_at: nowIso(),
            algorithm: ALGORITHM_VERSION,
            personalization: {
              has_history: false,
              cold_start: true,
              purchase_count: 0,
              favorite_count: 0,
              view_count: 0,
              include_purchased: includePurchased,
              freshness_days: freshnessDays,
            },
            warning:
              'Recommandations indisponibles : une table nécessaire est introuvable.',
          },
        },
        { status: 200 }
      )
    }

    console.error('Crash GET /api/produits/recommandations', error)

    return NextResponse.json(
      {
        success: true,
        data: [],
        meta: {
          limit,
          total: 0,
          generated_at: nowIso(),
          algorithm: ALGORITHM_VERSION,
          personalization: {
            has_history: false,
            cold_start: true,
            purchase_count: 0,
            favorite_count: 0,
            view_count: 0,
            include_purchased: includePurchased,
            freshness_days: freshnessDays,
          },
          warning:
            'Erreur interne lors du calcul des recommandations. Classement vide renvoyé pour ne pas bloquer la homepage.',
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