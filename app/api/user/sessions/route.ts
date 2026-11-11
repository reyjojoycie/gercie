// app/api/user/sessions/route.ts
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

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  id: z.string().uuid('ID de session invalide').optional(),
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

interface ParsedDevice {
  device: 'Mobile' | 'Ordinateur' | 'Tablette'
  browser: string
  os: string
}

function parseUserAgent(userAgent: string | null): ParsedDevice {
  const ua = userAgent || ''

  let device: ParsedDevice['device'] = 'Ordinateur'
  if (/ipad|tablet/i.test(ua)) device = 'Tablette'
  else if (/mobile|android|iphone|ipod/i.test(ua)) device = 'Mobile'

  let browser = 'Navigateur inconnu'
  if (/edg\//i.test(ua)) browser = 'Edge'
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera'
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome'
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox'
  else if (/safari/i.test(ua)) browser = 'Safari'

  let os = 'Système inconnu'
  if (/windows nt/i.test(ua)) os = 'Windows'
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS'
  else if (/linux/i.test(ua)) os = 'Linux'

  return { device, browser, os }
}

/* ------------------------------------------------------------------ */
/* GET                                                                 */
/* ------------------------------------------------------------------ */

/**
 * GET /api/user/sessions
 * - Récupère la liste des sessions de l'utilisateur
 * - Détecte / crée / met à jour la session courante
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-sessions-get:${ip}`,
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

    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse({
      limit: searchParams.get('limit') || undefined,
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

    const { limit } = parsed.data

    const meta = getRequestMeta(request)
    const parsedDevice = parseUserAgent(meta.userAgent)

    const supabase = await createClient(true)

    /* ------------------------------------------------------------ */
    /* 1. Détecter / upsert la session courante                      */
    /* ------------------------------------------------------------ */

    let currentSessionId: string | null = null

    if (meta.userAgent) {
      const { data: existing } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('user_agent', meta.userAgent)
        .maybeSingle()

      if (existing?.id) {
        currentSessionId = existing.id

        await supabase
          .from('user_sessions')
          .update({
            last_seen: new Date().toISOString(),
            ip: meta.ip,
            device: parsedDevice.device,
            browser: parsedDevice.browser,
            os: parsedDevice.os,
          })
          .eq('id', currentSessionId)
      } else {
        const { data: created, error: createError } = await supabase
          .from('user_sessions')
          .insert({
            user_id: user.id,
            device: parsedDevice.device,
            browser: parsedDevice.browser,
            os: parsedDevice.os,
            ip: meta.ip,
            user_agent: meta.userAgent,
            last_seen: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (createError) {
          logger.error('Erreur création session', {
            userId: user.id,
            error: createError,
          })
        } else {
          currentSessionId = created?.id || null
        }
      }
    }

    /* ------------------------------------------------------------ */
    /* 2. Récupérer toutes les sessions                              */
    /* ------------------------------------------------------------ */

    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_seen', { ascending: false })
      .limit(limit)

    if (error) {
      // Table pas encore créée : on renvoie un tableau vide
      if (error.code === '42P01') {
        return NextResponse.json({ data: [] })
      }

      logger.error('Erreur GET /api/user/sessions', {
        userId: user.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de récupérer les sessions' },
        { status: 500 }
      )
    }

    const sessions = (data || []).map((s: any) => ({
      ...s,
      current: s.id === currentSessionId,
    }))

    return NextResponse.json({ data: sessions })
  } catch (error: any) {
    logger.error('Crash GET /api/user/sessions', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* DELETE (fallback par query param ?id=...)                           */
/* ------------------------------------------------------------------ */

/**
 * DELETE /api/user/sessions?id=xxx
 * Révoque une session spécifique.
 * (La route principale est /api/user/sessions/[id], celle-ci est un fallback.)
 */
export async function DELETE(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-sessions-delete:${ip}`,
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

    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse({
      id: searchParams.get('id') || undefined,
    })

    if (!parsed.success || !parsed.data.id) {
      return NextResponse.json(
        { error: 'ID de session requis et valide' },
        { status: 400 }
      )
    }

    const sessionId = parsed.data.id

    const supabase = await createClient(true)

    // Empêcher de supprimer sa propre session courante
    const meta = getRequestMeta(request)

    const { data: current } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('user_agent', meta.userAgent || '')
      .maybeSingle()

    if (current?.id === sessionId) {
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
      logger.error('Erreur DELETE /api/user/sessions', {
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
    logger.error('Crash DELETE /api/user/sessions', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}