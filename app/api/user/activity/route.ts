// app/api/user/activity/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  action: z.string().min(1).max(100).optional(),
})

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

/**
 * GET /api/user/activity
 * Récupère le journal d'activité de l'utilisateur connecté.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-activity-get:${ip}`,
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
      action: searchParams.get('action') || undefined,
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

    const { limit, action } = parsed.data

    const supabase = await createClient(false)

    let query = supabase
      .from('user_activity_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (action) {
      query = query.eq('action', action)
    }

    const { data, error } = await query

    if (error) {
      // Table pas encore créée : on renvoie un tableau vide pour ne pas casser le front
      if (error.code === '42P01') {
        return NextResponse.json({ data: [] })
      }

      logger.error('Erreur GET /api/user/activity', {
        userId: user.id,
        error,
      })

      return NextResponse.json(
        { error: "Impossible de récupérer l'activité" },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    logger.error('Crash GET /api/user/activity', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}