// app/api/user/export-data/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { logActivity, getRequestMeta } from '@/lib/activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'password_confirmation',
  'current_password',
  'currentPassword',
  'new_password',
  'newPassword',
  'confirm_password',
  'confirmPassword',
  'token',
  'access_token',
  'refresh_token',
  'session_token',
  'secret',
  'totp_secret',
  'two_factor_secret',
  'recovery_codes',
  'recovery_code_hashes',
  'question_secrete',
  'reponse_secrete',
  'secret_question',
  'secret_answer',
])

function sanitizeValue(value: any): any {
  if (value === null || value === undefined) return value

  if (Array.isArray(value)) {
    return value.map(sanitizeValue)
  }

  if (typeof value === 'object') {
    const output: Record<string, any> = {}

    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) continue

      output[key] = sanitizeValue(val)
    }

    return output
  }

  return value
}

/**
 * Sélectionne depuis une table si elle existe.
 * Retourne un tableau vide si la table n'existe pas ou en cas d'erreur.
 */
async function safeSelect(
  supabase: any,
  table: string,
  filters: Record<string, any> = {},
  options: {
    orderField?: string
    ascending?: boolean
    limit?: number
  } = {}
) {
  try {
    let query = supabase.from(table).select('*')

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
      // Table absente : silencieux
      if (error.code === '42P01') return []

      logger.warn('Erreur safeSelect export-data', {
        table,
        error: error.message,
      })

      return []
    }

    return data || []
  } catch (error: any) {
    logger.warn('Crash safeSelect export-data', {
      table,
      error: error?.message,
    })

    return []
  }
}

/**
 * Essaie plusieurs noms de tables et retourne le premier résultat non vide.
 */
async function safeSelectFirst(
  supabase: any,
  tables: string[],
  filters: Record<string, any> = {},
  options: {
    orderField?: string
    ascending?: boolean
    limit?: number
  } = {}
) {
  for (const table of tables) {
    const rows = await safeSelect(supabase, table, filters, options)

    if (rows.length > 0) {
      return { table, rows }
    }
  }

  return { table: null, rows: [] }
}

/* ------------------------------------------------------------------ */
/* GET                                                                 */
/* ------------------------------------------------------------------ */

/**
 * GET /api/user/export-data
 *
 * Exporte les données personnelles de l'utilisateur connecté.
 *
 * Inclus :
 * - profil
 * - adresses
 * - préférences
 * - notifications
 * - sessions
 * - activité
 * - commandes
 * - favoris si disponibles
 * - avis si disponibles
 * - tickets support si disponibles
 *
 * Exclut volontairement :
 * - mots de passe
 * - tokens
 * - secrets 2FA
 * - questions/réponses secrètes
 * - anciennes données wallet si encore présentes
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-export-data:${ip}`,
    maxRequests: 3,
    windowSeconds: 10 * 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes d\'export. Réessayez dans quelques minutes.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const supabase = await createClient(true)

    /* ------------------------------------------------------------ */
    /* 1. Profil                                                     */
    /* ------------------------------------------------------------ */

    const profileRows = await safeSelect(supabase, 'profiles', { id: user.id }, { limit: 1 })
    const profile = profileRows[0] || null

    /* ------------------------------------------------------------ */
    /* 2. Adresses                                                   */
    /* ------------------------------------------------------------ */

    const addressesResult = await safeSelectFirst(
      supabase,
      ['addresses', 'user_addresses'],
      { user_id: user.id },
      { orderField: 'created_at', limit: 100 }
    )

    /* ------------------------------------------------------------ */
    /* 3. Préférences                                                */
    /* ------------------------------------------------------------ */

    const preferencesRows = await safeSelect(
      supabase,
      'user_preferences',
      { user_id: user.id },
      { limit: 1 }
    )

    const preferences = preferencesRows[0]?.preferences || {}

    /* ------------------------------------------------------------ */
    /* 4. Notifications                                              */
    /* ------------------------------------------------------------ */

    const notificationsResult = await safeSelectFirst(
      supabase,
      ['user_notifications', 'notifications'],
      { user_id: user.id },
      { orderField: 'created_at', limit: 200 }
    )

    /* ------------------------------------------------------------ */
    /* 5. Sessions                                                   */
    /* ------------------------------------------------------------ */

    const sessionsResult = await safeSelectFirst(
      supabase,
      ['user_sessions'],
      { user_id: user.id },
      { orderField: 'last_seen', limit: 100 }
    )

    /* ------------------------------------------------------------ */
    /* 6. Activité                                                   */
    /* ------------------------------------------------------------ */

    const activityResult = await safeSelectFirst(
      supabase,
      ['user_activity_logs'],
      { user_id: user.id },
      { orderField: 'created_at', limit: 200 }
    )

    /* ------------------------------------------------------------ */
    /* 7. Commandes                                                  */
    /* ------------------------------------------------------------ */

    const ordersResult = await safeSelectFirst(
      supabase,
      ['commandes', 'orders'],
      { acheteur_id: user.id },
      { orderField: 'created_at', limit: 200 }
    )

    // Certaines bases utilisent user_id au lieu de acheteur_id
    let orders = ordersResult.rows

    if (orders.length === 0) {
      const fallback = await safeSelectFirst(
        supabase,
        ['commandes', 'orders'],
        { user_id: user.id },
        { orderField: 'created_at', limit: 200 }
      )

      orders = fallback.rows
    }

    /* ------------------------------------------------------------ */
    /* 8. Favoris                                                    */
    /* ------------------------------------------------------------ */

    const favoritesResult = await safeSelectFirst(
      supabase,
      ['favorites', 'user_favorites', 'favoris'],
      { user_id: user.id },
      { orderField: 'created_at', limit: 200 }
    )

    let favorites = favoritesResult.rows

    if (favorites.length === 0) {
      const fallback = await safeSelectFirst(
        supabase,
        ['favoris'],
        { utilisateur_id: user.id },
        { orderField: 'created_at', limit: 200 }
      )

      favorites = fallback.rows
    }

    /* ------------------------------------------------------------ */
    /* 9. Avis                                                       */
    /* ------------------------------------------------------------ */

    const reviewsResult = await safeSelectFirst(
      supabase,
      ['reviews', 'avis'],
      { user_id: user.id },
      { orderField: 'created_at', limit: 200 }
    )

    let reviews = reviewsResult.rows

    if (reviews.length === 0) {
      const fallback = await safeSelectFirst(
        supabase,
        ['avis'],
        { utilisateur_id: user.id },
        { orderField: 'created_at', limit: 200 }
      )

      reviews = fallback.rows
    }

    /* ------------------------------------------------------------ */
    /* 10. Tickets support                                           */
    /* ------------------------------------------------------------ */

    const ticketsResult = await safeSelectFirst(
      supabase,
      ['support_tickets', 'tickets'],
      { user_id: user.id },
      { orderField: 'created_at', limit: 200 }
    )

    /* ------------------------------------------------------------ */
    /* 11. Payload final                                             */
    /* ------------------------------------------------------------ */

    const payload = sanitizeValue({
      exported_at: new Date().toISOString(),
      format_version: 'profile-export-v1',
      wallet_system_removed: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile,
      addresses: addressesResult.rows,
      preferences,
      notifications: notificationsResult.rows,
      sessions: sessionsResult.rows,
      activity: activityResult.rows,
      orders,
      favorites,
      reviews,
      tickets: ticketsResult.rows,
      metadata: {
        tables_used: {
          addresses: addressesResult.table,
          notifications: notificationsResult.table,
          sessions: sessionsResult.table,
          activity: activityResult.table,
          orders: ordersResult.table,
          favorites: favoritesResult.table,
          reviews: reviewsResult.table,
          tickets: ticketsResult.table,
        },
        notes: [
          'Les données sensibles ont été exclues.',
          'Le système de portefeuille a été supprimé du projet.',
          'Cet export est destiné à l utilisateur connecté uniquement.',
        ],
      },
    })

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'data_exported',
      description: 'Export des données personnelles généré',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        format_version: 'profile-export-v1',
      },
    })

    const response = NextResponse.json(payload)

    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    response.headers.set(
      'Content-Disposition',
      `attachment; filename="mon-compte-${new Date().toISOString().slice(0, 10)}.json"`
    )

    return response
  } catch (error: any) {
    logger.error('Crash GET /api/user/export-data', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}