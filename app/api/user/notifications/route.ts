// app/api/user/notifications/route.ts
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

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  filter: z.enum(['all', 'unread', 'read']).optional().default('all'),
  type: z.enum(ALLOWED_TYPES).optional(),
})

const createSchema = z.object({
  title: z.string().min(1, 'Titre requis').max(200),
  message: z.string().min(1, 'Message requis').max(2000),
  type: z.enum(ALLOWED_TYPES).optional().default('info'),
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
/* GET                                                                 */
/* ------------------------------------------------------------------ */

/**
 * GET /api/user/notifications
 * - Liste les notifications de l'utilisateur connecté
 * - Filtres : all / unread / read
 * - Type : info / order / promo / security / system
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-notifications-get:${ip}`,
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

    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse({
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
      filter: searchParams.get('filter') || undefined,
      type: searchParams.get('type') || undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Paramètres invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { limit, offset, filter, type } = parsed.data

    const supabase = await createClient(true)

    let query = supabase
      .from('user_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)

    if (filter === 'unread') {
      query = query.eq('read', false)
    } else if (filter === 'read') {
      query = query.eq('read', true)
    }

    if (type) {
      query = query.eq('type', type)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      // Table pas encore créée : on renvoie un tableau vide
      if (error.code === '42P01') {
        return NextResponse.json({
          data: [],
          pagination: { total: 0, limit, offset, hasMore: false },
        })
      }

      logger.error('Erreur GET /api/user/notifications', {
        userId: user.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de récupérer les notifications' },
        { status: 500 }
      )
    }

    const total = count ?? 0
    const hasMore = offset + limit < total

    return NextResponse.json({
      data: data || [],
      pagination: {
        total,
        limit,
        offset,
        hasMore,
      },
    })
  } catch (error: any) {
    logger.error('Crash GET /api/user/notifications', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* POST (création d'une notification pour soi-même)                    */
/* ------------------------------------------------------------------ */

/**
 * POST /api/user/notifications
 * Permet de créer une notification pour l'utilisateur connecté.
 * Utilisé pour :
 *  - tests internes
 *  - notifications déclenchées côté client (ex : confirmation locale)
 *  - systèmes internes qui poussent une notif
 *
 * Rate limit strict pour éviter le spam.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-notifications-create:${ip}`,
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

    let body: any

    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    const parsed = createSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { title, message, type, metadata } = parsed.data

    const supabase = await createClient(true)

    const { data, error } = await supabase
      .from('user_notifications')
      .insert({
        user_id: user.id,
        title,
        message,
        type,
        read: false,
        metadata: metadata || {},
      })
      .select()
      .single()

    if (error) {
      logger.error('Erreur POST /api/user/notifications', {
        userId: user.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de créer la notification' },
        { status: 500 }
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'notification_created',
      description: `Notification créée : ${title}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { notification_id: data?.id, type },
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (error: any) {
    logger.error('Crash POST /api/user/notifications', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}