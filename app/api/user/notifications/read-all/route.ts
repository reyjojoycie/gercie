// app/api/user/notifications/read-all/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { logActivity, getRequestMeta } from '@/lib/activity'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/* Schémas                                                             */
/* ------------------------------------------------------------------ */

const ALLOWED_TYPES = ['info', 'order', 'promo', 'security', 'system'] as const

const bodySchema = z.object({
  type: z.enum(ALLOWED_TYPES).optional(),
  before: z.string().datetime().optional(),
  after: z.string().datetime().optional(),
})

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

/* ------------------------------------------------------------------ */
/* POST                                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/user/notifications/read-all
 * Marque toutes les notifications non lues de l'utilisateur comme lues.
 * Options :
 *  - type : filtrer par type (info / order / promo / security / system)
 *  - before / after : plage de dates
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-notifications-read-all:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    let body: any = {}

    try {
      const text = await request.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      // body optionnel, on continue avec {}
    }

    const parsed = bodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { type, before, after } = parsed.data

    const supabase = await createClient(true)

    let query = supabase
      .from('user_notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)

    if (type) {
      query = query.eq('type', type)
    }

    if (before) {
      query = query.lt('created_at', before)
    }

    if (after) {
      query = query.gt('created_at', after)
    }

    const { data, error } = await query.select('id')

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          success: true,
          updated: 0,
          message: 'Aucune notification à marquer comme lue',
        })
      }

      logger.error('Erreur POST /api/user/notifications/read-all', {
        userId: user.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de marquer les notifications comme lues' },
        { status: 500 }
      )
    }

    const updatedCount = data?.length || 0

    const meta = getRequestMeta(request)

    if (updatedCount > 0) {
      await logActivity({
        userId: user.id,
        action: 'notifications_marked_all_read',
        description: `${updatedCount} notification(s) marquée(s) comme lues`,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: {
          count: updatedCount,
          type: type || 'all',
        },
      })
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      message:
        updatedCount > 0
          ? `${updatedCount} notification(s) marquée(s) comme lues`
          : 'Aucune notification non lue',
    })
  } catch (error: any) {
    logger.error('Crash POST /api/user/notifications/read-all', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* DELETE (supprimer toutes les notifications lues)                    */
/* ------------------------------------------------------------------ */

/**
 * DELETE /api/user/notifications/read-all
 * Supprime toutes les notifications déjà lues de l'utilisateur.
 * Utile pour nettoyer le centre de notifications.
 */
export async function DELETE(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-notifications-clear-read:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const supabase = await createClient(true)

    const { data, error } = await supabase
      .from('user_notifications')
      .delete()
      .eq('user_id', user.id)
      .eq('read', true)
      .select('id')

    if (error) {
      logger.error('Erreur DELETE /api/user/notifications/read-all', {
        userId: user.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de nettoyer les notifications' },
        { status: 500 }
      )
    }

    const deletedCount = data?.length || 0

    const meta = getRequestMeta(request)

    if (deletedCount > 0) {
      await logActivity({
        userId: user.id,
        action: 'notifications_cleared_read',
        description: `${deletedCount} notification(s) lue(s) supprimée(s)`,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { count: deletedCount },
      })
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      message:
        deletedCount > 0
          ? `${deletedCount} notification(s) supprimée(s)`
          : 'Aucune notification lue à supprimer',
    })
  } catch (error: any) {
    logger.error('Crash DELETE /api/user/notifications/read-all', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}