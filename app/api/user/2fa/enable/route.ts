// app/api/user/2fa/enable/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { logActivity, getRequestMeta } from '@/lib/activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/* Schémas                                                             */
/* ------------------------------------------------------------------ */

const bodySchema = z
  .object({
    mode: z.enum(['status', 'totp']).optional().default('status'),
    confirm: z.boolean().optional().default(false),
  })
  .optional()

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

function isMissingColumnError(error: any) {
  return error?.code === '42703'
}

function isMissingTableError(error: any) {
  return error?.code === '42P01'
}

/**
 * Active le statut 2FA dans profiles.two_factor_enabled.
 * Si la colonne n'existe pas encore, fallback vers user_preferences.
 */
async function enableTwoFactorFlag(
  supabase: any,
  userId: string
): Promise<{ ok: boolean; storage: 'profiles' | 'user_preferences'; error?: any }> {
  // 1. Essayer profiles.two_factor_enabled
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ two_factor_enabled: true })
    .eq('id', userId)

  if (!profileError) {
    return { ok: true, storage: 'profiles' }
  }

  if (!isMissingColumnError(profileError) && !isMissingTableError(profileError)) {
    logger.error('Erreur activation 2FA dans profiles', {
      userId,
      error: profileError,
    })

    return { ok: false, storage: 'profiles', error: profileError }
  }

  // 2. Fallback user_preferences
  try {
    const { data: prefRow, error: prefReadError } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle()

    if (prefReadError) {
      logger.error('Erreur lecture user_preferences pour 2FA', {
        userId,
        error: prefReadError,
      })

      return { ok: false, storage: 'user_preferences', error: prefReadError }
    }

    const currentPreferences = prefRow?.preferences || {}

    const nextPreferences = {
      ...currentPreferences,
      two_factor_enabled: true,
    }

    const { error: prefUpsertError } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          preferences: nextPreferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (prefUpsertError) {
      logger.error('Erreur upsert user_preferences pour 2FA', {
        userId,
        error: prefUpsertError,
      })

      return { ok: false, storage: 'user_preferences', error: prefUpsertError }
    }

    return { ok: true, storage: 'user_preferences' }
  } catch (error: any) {
    logger.error('Crash fallback 2FA user_preferences', {
      userId,
      error,
    })

    return { ok: false, storage: 'user_preferences', error }
  }
}

/* ------------------------------------------------------------------ */
/* POST                                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/user/2fa/enable
 *
 * Active le statut 2FA pour l'utilisateur connecté.
 *
 * Mode actuel :
 * - "status" : active simplement le flag two_factor_enabled
 * - "totp" : réservé à une future intégration TOTP complète
 *
 * Ce endpoint ne remplace pas encore une vraie vérification TOTP
 * au login, mais il prépare la base pour l'option sécurité.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-2fa-enable:${ip}`,
    maxRequests: 5,
    windowSeconds: 15 * 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
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

    let body: any = {}

    try {
      const text = await request.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
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

    const mode = parsed.data?.mode || 'status'

    if (mode === 'totp') {
      return NextResponse.json(
        {
          error:
            "Le module TOTP complet n'est pas encore installé. Utilisez le mode 'status' ou ajoutez la table user_2fa.",
          code: 'TOTP_MODULE_NOT_INSTALLED',
        },
        { status: 501 }
      )
    }

    const supabase = await createClient(true)

    const result = await enableTwoFactorFlag(supabase, user.id)

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "Impossible d'activer la 2FA.",
          code: '2FA_ENABLE_ERROR',
          details: result.error?.message,
        },
        { status: 500 }
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: '2fa_enabled',
      description: 'Authentification à deux facteurs activée',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        mode,
        storage: result.storage,
      },
    })

    return NextResponse.json({
      success: true,
      message: '2FA activée avec succès.',
      data: {
        two_factor_enabled: true,
        mode,
        storage: result.storage,
      },
    })
  } catch (error: any) {
    logger.error('Crash POST /api/user/2fa/enable', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}