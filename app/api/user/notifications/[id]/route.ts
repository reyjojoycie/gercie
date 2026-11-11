// app/api/user/notifications/[id]/route.ts
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

const paramsSchema = z.object({
  id: z.string().uuid('ID de notification invalide'),
})

const patchSchema = z.object({
  read: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
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
/* GET (détail d'une notification)                                     */
/* ------------------------------------------------------------------ */

/**
 * GET /api/user/notifications/[id]
 * Récupère une notification spécifique de l'utilisateur connecté.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-notification-detail-get:${ip}`,
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
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const params = await context.params
    const parsed = paramsSchema.safeParse(params)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ID de notification invalide' },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ data: null })
      }

      logger.error('Erreur GET /api/user/notifications/[id]', {
        userId: user.id,
        notificationId: parsed.data.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de récupérer la notification' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Notification introuvable' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    logger.error('Crash GET /api/user/notifications/[id]', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* PATCH (marquer comme lue / non lue / mettre à jour metadata)        */
/* ------------------------------------------------------------------ */

/**
 * PATCH /api/user/notifications/[id]
 * - Marquer comme lue ou non lue
 * - Mettre à jour le metadata si besoin
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-notification-patch:${ip}`,
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
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const params = await context.params
    const parsedParams = paramsSchema.safeParse(params)

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'ID de notification invalide' },
        { status: 400 }
      )
    }

    let body: any

    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    const parsedBody = patchSchema.safeParse(body)

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsedBody.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { read, metadata } = parsedBody.data

    if (read === undefined && metadata === undefined) {
      return NextResponse.json(
        { error: 'Aucune donnée à mettre à jour' },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const updatePayload: Record<string, any> = {}

    if (read !== undefined) {
      updatePayload.read = read
    }

    if (metadata !== undefined) {
      updatePayload.metadata = metadata
    }

    const { data, error } = await supabase
      .from('user_notifications')
      .update(updatePayload)
      .eq('id', parsedParams.data.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      logger.error('Erreur PATCH /api/user/notifications/[id]', {
        userId: user.id,
        notificationId: parsedParams.data.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de mettre à jour la notification' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Notification introuvable' },
        { status: 404 }
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: read ? 'notification_read' : 'notification_unread',
      description: `Notification ${read ? 'marquée comme lue' : 'marquée comme non lue'}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { notification_id: data.id },
    })

    return NextResponse.json({ data })
  } catch (error: any) {
    logger.error('Crash PATCH /api/user/notifications/[id]', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* DELETE (supprimer une notification)                                 */
/* ------------------------------------------------------------------ */

/**
 * DELETE /api/user/notifications/[id]
 * Supprime définitivement une notification de l'utilisateur connecté.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-notification-delete:${ip}`,
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
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const params = await context.params
    const parsed = paramsSchema.safeParse(params)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ID de notification invalide' },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const { data: deleted, error } = await supabase
      .from('user_notifications')
      .delete()
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)
      .select('id')
      .single()

    if (error) {
      logger.error('Erreur DELETE /api/user/notifications/[id]', {
        userId: user.id,
        notificationId: parsed.data.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de supprimer la notification' },
        { status: 500 }
      )
    }

    if (!deleted) {
      return NextResponse.json(
        { error: 'Notification introuvable' },
        { status: 404 }
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'notification_deleted',
      description: 'Notification supprimée',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { notification_id: deleted.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Crash DELETE /api/user/notifications/[id]', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}