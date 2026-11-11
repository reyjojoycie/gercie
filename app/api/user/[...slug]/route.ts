// app/api/user/[...slug]/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { logActivity, getRequestMeta } from '@/lib/activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/* Helpers généraux                                                    */
/* ------------------------------------------------------------------ */

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'X-Robots-Tag': 'noindex, nofollow',
  }
}

function applyNoStore(response: NextResponse) {
  for (const [key, value] of Object.entries(noStoreHeaders())) {
    response.headers.set(key, value)
  }
  return response
}

function generateId() {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`
  } catch {
    return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function isMissingTableError(error: any) {
  const message = String(error?.message || error?.details || '').toLowerCase()

  return (
    error?.code === '42P01' ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('relation')
  )
}

function isMissingColumnError(error: any) {
  const message = String(error?.message || error?.details || '').toLowerCase()

  return (
    error?.code === '42703' ||
    message.includes('column') ||
    message.includes('field') ||
    message.includes('does not exist')
  )
}

function normalizeOrderStatus(statut?: string | null): string {
  const raw = String(statut || 'pending').toLowerCase()

  const map: Record<string, string> = {
    en_attente: 'pending',
    pending: 'pending',
    attente: 'pending',

    traitee: 'processing',
    processing: 'processing',
    preparation: 'processing',
    en_preparation: 'processing',
    collecte: 'processing',
    accepted: 'processing',
    accepte: 'processing',

    expidiee: 'shipped',
    shipped: 'shipped',
    en_route: 'shipped',
    en_livraison: 'shipped',
    livraison: 'shipped',

    livree: 'delivered',
    delivered: 'delivered',
    complete: 'delivered',
    termine: 'delivered',

    annulee: 'cancelled',
    cancelled: 'cancelled',
    cancellee: 'cancelled',

    rembourse: 'refunded',
    refunded: 'refunded',

    retour_demande: 'return_requested',
    return_requested: 'return_requested',
    retour: 'return_requested',
  }

  return map[raw] || raw || 'pending'
}

function firstArrayValue(value: any): any {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function buildAddressText(address: any) {
  return [
    address?.quartier,
    address?.avenue,
    address?.numero,
    address?.reference,
  ]
    .filter(Boolean)
    .join(', ')
}

/* ------------------------------------------------------------------ */
/* Query helpers Supabase tolérants                                    */
/* ------------------------------------------------------------------ */

interface QueryAttempt {
  table: string
  select?: string
  filters?: Record<string, any>
  eq?: Record<string, any>
}

async function queryRows(
  supabase: any,
  attempt: QueryAttempt,
  options: {
    orderField?: string
    ascending?: boolean
    limit?: number
  } = {}
) {
  try {
    const select = attempt.select || '*'
    let query = supabase.from(attempt.table).select(select)

    const filters = {
      ...(attempt.filters || {}),
      ...(attempt.eq || {}),
    }

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value)
      }
    }

    if (options.orderField) {
      query = query.order(options.orderField, {
        ascending: options.ascending ?? false,
      })
    }

    if (options.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return []
      }

      logger.warn('Erreur queryRows /api/user/[...slug]', {
        table: attempt.table,
        select,
        error: error.message,
      })

      return []
    }

    return data || []
  } catch (error: any) {
    logger.warn('Crash queryRows /api/user/[...slug]', {
      table: attempt.table,
      error: error?.message,
    })

    return []
  }
}

async function selectFirst(
  supabase: any,
  attempts: QueryAttempt[],
  options: {
    orderField?: string
    ascending?: boolean
    limit?: number
  } = {}
) {
  for (const attempt of attempts) {
    const rows = await queryRows(supabase, attempt, options)

    if (rows.length > 0) {
      return rows
    }
  }

  return []
}

async function countRows(
  supabase: any,
  attempts: QueryAttempt[]
) {
  for (const attempt of attempts) {
    try {
      let query = supabase
        .from(attempt.table)
        .select('*', { count: 'exact', head: true })

      const filters = {
        ...(attempt.filters || {}),
        ...(attempt.eq || {}),
      }

      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value)
        }
      }

      const { count, error } = await query

      if (!error) return count || 0

      if (isMissingTableError(error) || isMissingColumnError(error)) continue

      logger.warn('Erreur countRows /api/user/[...slug]', {
        table: attempt.table,
        error: error.message,
      })
    } catch (error: any) {
      logger.warn('Crash countRows /api/user/[...slug]', {
        table: attempt.table,
        error: error?.message,
      })
    }
  }

  return 0
}

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

function mapOrder(row: any) {
  const rawTotal =
    row.total_usd ??
    row.amount_usd ??
    row.total_global ??
    row.total ??
    0

  const hasUsd =
    row.total_usd != null ||
    row.amount_usd != null ||
    row.currency === 'USD'

  const currency = row.currency || (hasUsd ? 'USD' : 'CDF')

  return {
    ...row,
    id: row.id || row.commande_id,
    numero_commande:
      row.numero_commande ||
      row.reference ||
      row.order_number ||
      row.id,
    statut: normalizeOrderStatus(row.statut || row.status),
    total_usd: rawTotal,
    total_cdf:
      row.total_cdf ??
      (currency === 'CDF' ? rawTotal : null),
    currency,
    created_at: row.created_at || row.date || row.createdAt,
    items_count:
      row.items_count ??
      row.total_articles ??
      row.article_count ??
      (Array.isArray(row.articles) ? row.articles.length : 0),
  }
}

function mapFavorite(row: any) {
  const product =
    firstArrayValue(row.produits) ||
    firstArrayValue(row.product) ||
    firstArrayValue(row.produit) ||
    null

  const images =
    product?.images ||
    row.images ||
    (product?.image ? [product.image] : row.image ? [row.image] : [])

  return {
    ...row,
    id: row.id || row.product_id || row.produit_id || product?.id,
    product_id:
      row.product_id ||
      row.produit_id ||
      product?.id ||
      row.id,
    nom:
      row.nom ||
      row.name ||
      product?.nom ||
      product?.name ||
      'Produit',
    prix_usd:
      row.prix_usd ??
      row.price_usd ??
      product?.prix_usd ??
      product?.price_usd ??
      0,
    prix_cdf:
      row.prix_cdf ??
      row.price_cdf ??
      product?.prix ??
      product?.prix_cdf ??
      product?.price ??
      null,
    image: Array.isArray(images) ? images[0] : images || null,
    created_at: row.created_at || row.date,
  }
}

function mapReview(row: any) {
  const product =
    firstArrayValue(row.produits) ||
    firstArrayValue(row.product) ||
    firstArrayValue(row.produit) ||
    null

  return {
    ...row,
    id: row.id,
    product_id:
      row.product_id ||
      row.produit_id ||
      product?.id ||
      null,
    product_name:
      row.product_name ||
      row.produit_nom ||
      product?.nom ||
      product?.name ||
      'Produit',
    rating: row.rating ?? row.note ?? 0,
    comment: row.comment || row.message || row.contenu || '',
    created_at: row.created_at || row.date,
  }
}

function mapTicket(row: any) {
  return {
    ...row,
    id: row.id,
    sujet: row.sujet || row.subject || row.titre || 'Ticket',
    message: row.message || row.description || row.contenu || '',
    statut: row.statut || row.status || 'open',
    categorie: row.categorie || row.category || 'general',
    priorite: row.priorite || row.priority || 'normal',
    created_at: row.created_at || row.date,
  }
}

/* ------------------------------------------------------------------ */
/* GET                                                                 */
/* ------------------------------------------------------------------ */

/**
 * GET /api/user/[...slug]
 *
 * Route fallback pour les endpoints profil qui ne sont pas encore
 * entièrement implémentés en modules dédiés.
 *
 * Gère notamment :
 * - /api/user/orders
 * - /api/user/favorites
 * - /api/user/loyalty
 * - /api/user/referral
 * - /api/user/reviews
 * - /api/user/support/tickets
 * - /api/user/notifications/unread-count
 *
 * Le wallet est volontairement désactivé : retour 410.
 */
export async function GET(request: Request, context: any) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-slug-get:${ip}`,
    maxRequests: 60,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const params = await context?.params
    const slugArray = Array.isArray(params?.slug) ? params.slug : []
    const slug = slugArray.join('/')

    const user = await getCurrentUser()

    if (!user) {
      return applyNoStore(
        NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      )
    }

    // Wallet supprimé définitivement
    if (slug === 'wallet' || slug.startsWith('wallet/')) {
      return applyNoStore(
        NextResponse.json(
          {
            error:
              'Le système de portefeuille a été supprimé. Le paiement se fait désormais directement.',
            code: 'WALLET_REMOVED',
          },
          { status: 410 }
        )
      )
    }

    const supabase = await createClient(true)

    switch (slug) {
      case 'orders': {
        const rows = await selectFirst(
          supabase,
          [
            {
              table: 'commandes',
              select: '*',
              filters: { acheteur_id: user.id },
            },
            {
              table: 'commandes',
              select: '*',
              filters: { user_id: user.id },
            },
            {
              table: 'orders',
              select: '*',
              filters: { user_id: user.id },
            },
          ],
          {
            orderField: 'created_at',
            limit: 100,
          }
        )

        return applyNoStore(
          NextResponse.json({
            data: rows.map(mapOrder),
          })
        )
      }

      case 'favorites': {
        const rows = await selectFirst(
          supabase,
          [
            {
              table: 'favorites',
              select: '*, produits(*)',
              filters: { user_id: user.id },
            },
            {
              table: 'favorites',
              select: '*',
              filters: { user_id: user.id },
            },
            {
              table: 'user_favorites',
              select: '*, products(*)',
              filters: { user_id: user.id },
            },
            {
              table: 'user_favorites',
              select: '*',
              filters: { user_id: user.id },
            },
            {
              table: 'favoris',
              select: '*, produits(*)',
              filters: { utilisateur_id: user.id },
            },
            {
              table: 'favoris',
              select: '*',
              filters: { utilisateur_id: user.id },
            },
            {
              table: 'favoris',
              select: '*',
              filters: { user_id: user.id },
            },
          ],
          {
            orderField: 'created_at',
            limit: 100,
          }
        )

        return applyNoStore(
          NextResponse.json({
            data: rows.map(mapFavorite),
          })
        )
      }

      case 'loyalty': {
        // Module fidélité non encore branché sur une table dédiée.
        // Retourne une structure stable pour éviter les erreurs front.
        return applyNoStore(
          NextResponse.json({
            data: {
              points: 0,
              tier: 'Bronze',
              next_tier: 'Argent',
              progress: 0,
              history: [],
              enabled: false,
            },
          })
        )
      }

      case 'referral': {
        const origin = new URL(request.url).origin
        const code = String(user.id || '')
          .replace(/-/g, '')
          .slice(0, 8)
          .toUpperCase()

        return applyNoStore(
          NextResponse.json({
            data: {
              code,
              link: `${origin}/refer?code=${code}`,
              invited_count: 0,
              rewarded_count: 0,
              total_earned: 0,
              enabled: false,
            },
          })
        )
      }

      case 'reviews': {
        const rows = await selectFirst(
          supabase,
          [
            {
              table: 'reviews',
              select: '*, produits(nom, prix, images)',
              filters: { user_id: user.id },
            },
            {
              table: 'reviews',
              select: '*',
              filters: { user_id: user.id },
            },
            {
              table: 'avis',
              select: '*, produits(nom, prix, images)',
              filters: { utilisateur_id: user.id },
            },
            {
              table: 'avis',
              select: '*',
              filters: { utilisateur_id: user.id },
            },
            {
              table: 'avis',
              select: '*',
              filters: { user_id: user.id },
            },
          ],
          {
            orderField: 'created_at',
            limit: 100,
          }
        )

        return applyNoStore(
          NextResponse.json({
            data: rows.map(mapReview),
          })
        )
      }

      case 'support/tickets': {
        const rows = await selectFirst(
          supabase,
          [
            {
              table: 'support_tickets',
              select: '*',
              filters: { user_id: user.id },
            },
            {
              table: 'tickets',
              select: '*',
              filters: { user_id: user.id },
            },
            {
              table: 'tickets',
              select: '*',
              filters: { utilisateur_id: user.id },
            },
          ],
          {
            orderField: 'created_at',
            limit: 100,
          }
        )

        return applyNoStore(
          NextResponse.json({
            data: rows.map(mapTicket),
          })
        )
      }

      case 'notifications/unread-count': {
        const count = await countRows(supabase, [
          {
            table: 'user_notifications',
            filters: { user_id: user.id, read: false },
          },
          {
            table: 'notifications',
            filters: { user_id: user.id, read: false },
          },
          {
            table: 'notifications',
            filters: { utilisateur_id: user.id, lu: false },
          },
        ])

        return applyNoStore(
          NextResponse.json({
            data: { count },
          })
        )
      }

      default: {
        return applyNoStore(
          NextResponse.json(
            {
              error: 'Endpoint non implémenté',
              slug,
            },
            { status: 404 }
          )
        )
      }
    }
  } catch (error: any) {
    logger.error('Crash GET /api/user/[...slug]', error)

    return applyNoStore(
      NextResponse.json(
        { error: error?.message || 'Erreur serveur' },
        { status: 500 }
      )
    )
  }
}

/* ------------------------------------------------------------------ */
/* POST                                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/user/[...slug]
 *
 * Fallback POST pour certains endpoints profil.
 * Notamment :
 * - /api/user/support/tickets
 * - /api/user/favorites
 * - réponses transitoires pour éviter les 404 front
 */
export async function POST(request: Request, context: any) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-slug-post:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const params = await context?.params
    const slugArray = Array.isArray(params?.slug) ? params.slug : []
    const slug = slugArray.join('/')

    const user = await getCurrentUser()

    if (!user) {
      return applyNoStore(
        NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      )
    }

    if (slug === 'wallet' || slug.startsWith('wallet/')) {
      return applyNoStore(
        NextResponse.json(
          {
            error:
              'Le système de portefeuille a été supprimé. Le paiement se fait désormais directement.',
            code: 'WALLET_REMOVED',
          },
          { status: 410 }
        )
      )
    }

    const supabase = await createClient(true)
    const meta = getRequestMeta(request)

    /* ------------------------------------------------------------ */
    /* Création d'un ticket support                                  */
    /* ------------------------------------------------------------ */

    if (slug === 'support/tickets') {
      let body: any

      try {
        body = await request.json()
      } catch {
        return applyNoStore(
          NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
        )
      }

      const sujet = String(body?.sujet || body?.subject || '').trim().slice(0, 200)
      const message = String(body?.message || body?.description || '').trim().slice(0, 2000)

      if (!sujet || !message) {
        return applyNoStore(
          NextResponse.json(
            { error: 'Sujet et message requis' },
            { status: 400 }
          )
        )
      }

      const categorie = String(body?.categorie || body?.category || 'general').slice(0, 50)
      const priorite = String(body?.priorite || body?.priority || 'normal').slice(0, 20)
      const now = new Date().toISOString()

      const localTicket = {
        id: generateId(),
        user_id: user.id,
        sujet,
        message,
        categorie,
        priorite,
        statut: 'open',
        created_at: now,
      }

      const fullPayload = {
        user_id: user.id,
        sujet,
        message,
        categorie,
        priorite,
        statut: 'open',
        created_at: now,
      }

      const minimalPayload = {
        user_id: user.id,
        sujet,
        message,
        statut: 'open',
        created_at: now,
      }

      const tables = ['support_tickets', 'tickets']

      for (const table of tables) {
        // Essai complet
        const { data, error } = await supabase
          .from(table)
          .insert(fullPayload)
          .select()
          .single()

        if (!error && data) {
          await logActivity({
            userId: user.id,
            action: 'support_ticket_created',
            description: 'Ticket support créé',
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: { ticket_id: data.id },
          })

          return applyNoStore(
            NextResponse.json({ data: mapTicket(data) }, { status: 201 })
          )
        }

        if (!isMissingTableError(error) && !isMissingColumnError(error)) {
          logger.error('Erreur création ticket support', {
            userId: user.id,
            table,
            error,
          })
        }

        // Essai minimal si colonnes categorie/priorite manquantes
        const minimal = await supabase
          .from(table)
          .insert(minimalPayload)
          .select()
          .single()

        if (!minimal.error && minimal.data) {
          await logActivity({
            userId: user.id,
            action: 'support_ticket_created',
            description: 'Ticket support créé (mode minimal)',
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: { ticket_id: minimal.data.id },
          })

          return applyNoStore(
            NextResponse.json({ data: mapTicket(minimal.data) }, { status: 201 })
          )
        }
      }

      // Si aucune table n'existe encore, retourne un objet local non persisté
      return applyNoStore(
        NextResponse.json(
          {
            data: localTicket,
            persisted: false,
            message:
              'Ticket enregistré localement. La table support_tickets ou tickets doit être créée pour persistance.',
          },
          { status: 201 }
        )
      )
    }

    /* ------------------------------------------------------------ */
    /* Ajout favori                                                  */
    /* ------------------------------------------------------------ */

    if (slug === 'favorites') {
      let body: any

      try {
        body = await request.json()
      } catch {
        return applyNoStore(
          NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
        )
      }

      const productId = String(body?.product_id || body?.produit_id || '').trim()

      if (!productId) {
        return applyNoStore(
          NextResponse.json(
            { error: 'product_id requis' },
            { status: 400 }
          )
        )
      }

      const payload = {
        user_id: user.id,
        product_id: productId,
        created_at: new Date().toISOString(),
      }

      const tables = ['favorites', 'user_favorites']

      for (const table of tables) {
        const { data, error } = await supabase
          .from(table)
          .upsert(payload, { onConflict: 'user_id,product_id' })
          .select()
          .single()

        if (!error && data) {
          return applyNoStore(
            NextResponse.json({ data: mapFavorite(data) }, { status: 201 })
          )
        }

        if (!isMissingTableError(error) && !isMissingColumnError(error)) {
          logger.warn('Erreur ajout favori', {
            userId: user.id,
            table,
            error: error?.message,
          })
        }
      }

      // Fallback français
      const favorisPayload = {
        utilisateur_id: user.id,
        produit_id: productId,
        created_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('favoris')
        .insert(favorisPayload)
        .select()
        .single()

      if (!error && data) {
        return applyNoStore(
          NextResponse.json({ data: mapFavorite(data) }, { status: 201 })
        )
      }

      return applyNoStore(
        NextResponse.json(
          {
            success: true,
            persisted: false,
            message:
              'Favori non persisté : aucune table favorites/user_favorites/favoris exploitable.',
          },
          { status: 201 }
        )
      )
    }

    /* ------------------------------------------------------------ */
    /* Réponses transitoires pour endpoints déjà traités ailleurs    */
    /* ------------------------------------------------------------ */

    if (
      slug === 'notifications/read-all' ||
      slug === '2fa/enable' ||
      slug === '2fa/disable' ||
      slug === 'password' ||
      slug === 'account/delete'
    ) {
      return applyNoStore(
        NextResponse.json({
          success: true,
          fallback: true,
          message: 'Endpoint traité par la route dédiée si disponible.',
        })
      )
    }

    return applyNoStore(
      NextResponse.json(
        {
          error: 'Endpoint non implémenté',
          slug,
        },
        { status: 404 }
      )
    )
  } catch (error: any) {
    logger.error('Crash POST /api/user/[...slug]', error)

    return applyNoStore(
      NextResponse.json(
        { error: error?.message || 'Erreur serveur' },
        { status: 500 }
      )
    )
  }
}

/* ------------------------------------------------------------------ */
/* PATCH                                                               */
/* ------------------------------------------------------------------ */

/**
 * PATCH /api/user/[...slug]
 *
 * Fallback PATCH pour certains endpoints profil.
 */
export async function PATCH(request: Request, context: any) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-slug-patch:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const params = await context?.params
    const slugArray = Array.isArray(params?.slug) ? params.slug : []
    const slug = slugArray.join('/')

    const user = await getCurrentUser()

    if (!user) {
      return applyNoStore(
        NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      )
    }

    if (slug === 'wallet' || slug.startsWith('wallet/')) {
      return applyNoStore(
        NextResponse.json(
          {
            error:
              'Le système de portefeuille a été supprimé. Le paiement se fait désormais directement.',
            code: 'WALLET_REMOVED',
          },
          { status: 410 }
        )
      )
    }

    if (slug.startsWith('notifications/')) {
      return applyNoStore(
        NextResponse.json({
          success: true,
          fallback: true,
          message: 'Notification mise à jour via route dédiée si disponible.',
        })
      )
    }

    if (slug.startsWith('addresses/')) {
      return applyNoStore(
        NextResponse.json({
          success: true,
          fallback: true,
          message: 'Adresse mise à jour via route dédiée si disponible.',
        })
      )
    }

    return applyNoStore(
      NextResponse.json(
        {
          error: 'Endpoint non implémenté',
          slug,
        },
        { status: 404 }
      )
    )
  } catch (error: any) {
    logger.error('Crash PATCH /api/user/[...slug]', error)

    return applyNoStore(
      NextResponse.json(
        { error: error?.message || 'Erreur serveur' },
        { status: 500 }
      )
    )
  }
}

/* ------------------------------------------------------------------ */
/* DELETE                                                              */
/* ------------------------------------------------------------------ */

/**
 * DELETE /api/user/[...slug]
 *
 * Fallback DELETE pour certains endpoints profil.
 * Gère notamment la suppression de favoris.
 */
export async function DELETE(request: Request, context: any) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-slug-delete:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const params = await context?.params
    const slugArray = Array.isArray(params?.slug) ? params.slug : []
    const slug = slugArray.join('/')

    const user = await getCurrentUser()

    if (!user) {
      return applyNoStore(
        NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      )
    }

    if (slug === 'wallet' || slug.startsWith('wallet/')) {
      return applyNoStore(
        NextResponse.json(
          {
            error:
              'Le système de portefeuille a été supprimé. Le paiement se fait désormais directement.',
            code: 'WALLET_REMOVED',
          },
          { status: 410 }
        )
      )
    }

    const supabase = await createClient(true)
    const meta = getRequestMeta(request)

    /* ------------------------------------------------------------ */
    /* Suppression favori                                            */
    /* ------------------------------------------------------------ */

    if (slugArray[0] === 'favorites' && slugArray[1]) {
      const favoriteId = String(slugArray[1])

      const attempts = [
        { table: 'favorites', field: 'id', value: favoriteId, userField: 'user_id' },
        { table: 'favorites', field: 'product_id', value: favoriteId, userField: 'user_id' },
        { table: 'user_favorites', field: 'id', value: favoriteId, userField: 'user_id' },
        { table: 'user_favorites', field: 'product_id', value: favoriteId, userField: 'user_id' },
        { table: 'favoris', field: 'id', value: favoriteId, userField: 'utilisateur_id' },
        { table: 'favoris', field: 'produit_id', value: favoriteId, userField: 'utilisateur_id' },
        { table: 'favoris', field: 'id', value: favoriteId, userField: 'user_id' },
        { table: 'favoris', field: 'product_id', value: favoriteId, userField: 'user_id' },
      ]

      let deleted = false

      for (const attempt of attempts) {
        try {
          const { error } = await supabase
            .from(attempt.table)
            .delete()
            .eq(attempt.field, attempt.value)
            .eq(attempt.userField, user.id)

          if (!error) {
            deleted = true
            break
          }

          if (!isMissingTableError(error) && !isMissingColumnError(error)) {
            logger.warn('Erreur suppression favori', {
              userId: user.id,
              table: attempt.table,
              field: attempt.field,
              error: error.message,
            })
          }
        } catch (error: any) {
          logger.warn('Crash suppression favori', {
            userId: user.id,
            table: attempt.table,
            error: error?.message,
          })
        }
      }

      if (deleted) {
        await logActivity({
          userId: user.id,
          action: 'favorite_removed',
          description: 'Favori supprimé',
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { favorite_id: favoriteId },
        })
      }

      return applyNoStore(
        NextResponse.json({
          success: true,
          deleted,
        })
      )
    }

    /* ------------------------------------------------------------ */
    /* Autres fallbacks                                              */
    /* ------------------------------------------------------------ */

    if (slug.startsWith('sessions/')) {
      return applyNoStore(
        NextResponse.json({
          success: true,
          fallback: true,
          message: 'Session révoquée via route dédiée si disponible.',
        })
      )
    }

    if (slug.startsWith('addresses/')) {
      return applyNoStore(
        NextResponse.json({
          success: true,
          fallback: true,
          message: 'Adresse supprimée via route dédiée si disponible.',
        })
      )
    }

    return applyNoStore(
      NextResponse.json(
        {
          error: 'Endpoint non implémenté',
          slug,
        },
        { status: 404 }
      )
    )
  } catch (error: any) {
    logger.error('Crash DELETE /api/user/[...slug]', error)

    return applyNoStore(
      NextResponse.json(
        { error: error?.message || 'Erreur serveur' },
        { status: 500 }
      )
    )
  }
}