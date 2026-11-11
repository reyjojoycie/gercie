// app/api/user/sessions/[id]/route.ts
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
  id: z.string().uuid('ID de session invalide'),
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
/* GET (détail d'une session)                                          */
/* ------------------------------------------------------------------ */

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-session-detail-get:${ip}`,
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
        { error: 'ID de session invalide' },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ data: null })
      }

      logger.error('Erreur GET /api/user/sessions/[id]', {
        userId: user.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de récupérer la session' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Session introuvable' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    logger.error('Crash GET /api/user/sessions/[id]', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* DELETE (révoquer une session)                                       */
/* ------------------------------------------------------------------ */

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-session-revoke:${ip}`,
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

    const params = await context.params
    const parsed = paramsSchema.safeParse(params)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ID de session invalide' },
        { status: 400 }
      )
    }

    const sessionId = parsed.data.id
    const meta = getRequestMeta(request)

    const supabase = await createClient(true)

    // Récupérer la session cible
    const { data: target, error: fetchError } = await supabase
      .from('user_sessions')
      .select('id, user_agent')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (fetchError) {
      logger.error('Erreur lecture session cible', {
        userId: user.id,
        sessionId,
        error: fetchError,
      })

      return NextResponse.json(
        { error: 'Impossible de vérifier la session' },
        { status: 500 }
      )
    }

    if (!target) {
      return NextResponse.json(
        { error: 'Session introuvable' },
        { status: 404 }
      )
    }

    // Empêcher de supprimer sa propre session courante
    if (
      meta.userAgent &&
      target.user_agent &&
      target.user_agent === meta.userAgent
    ) {
      return NextResponse.json(
        { error: 'Impossible de révoquer votre session actuelle' },
        { status: 400 }
      )
    }

    const { error: deleteError } = await supabase
      .from('user_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (deleteError) {
      logger.error('Erreur DELETE /api/user/sessions/[id]', {
        userId: user.id,
        sessionId,
        error: deleteError,
      })

      return NextResponse.json(
        { error: 'Impossible de révoquer la session' },
        { status: 500 }
      )
    }

    await logActivity({
      userId: user.id,
      action: 'session_revoked',
      description: 'Session révoquée',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { session_id: sessionId },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Crash DELETE /api/user/sessions/[id]', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}