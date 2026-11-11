// app/api/user/2fa/disable/route.ts
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
 * Désactive le statut 2FA dans profiles.two_factor_enabled.
 * Si la colonne n'existe pas encore, fallback vers user_preferences.
 */
async function disableTwoFactorFlag(
  supabase: any,
  userId: string
): Promise<{ ok: boolean; storage: 'profiles' | 'user_preferences'; error?: any }> {
  // 1. Essayer profiles.two_factor_enabled
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ two_factor_enabled: false })
    .eq('id', userId)

  if (!profileError) {
    return { ok: true, storage: 'profiles' }
  }

  if (!isMissingColumnError(profileError) && !isMissingTableError(profileError)) {
    logger.error('Erreur désactivation 2FA dans profiles', {
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
      logger.error('Erreur lecture user_preferences pour désactivation 2FA', {
        userId,
        error: prefReadError,
      })

      return { ok: false, storage: 'user_preferences', error: prefReadError }
    }

    const currentPreferences = prefRow?.preferences || {}

    const nextPreferences = {
      ...currentPreferences,
      two_factor_enabled: false,
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
      logger.error('Erreur upsert user_preferences pour désactivation 2FA', {
        userId,
        error: prefUpsertError,
      })

      return { ok: false, storage: 'user_preferences', error: prefUpsertError }
    }

    return { ok: true, storage: 'user_preferences' }
  } catch (error: any) {
    logger.error('Crash fallback désactivation 2FA user_preferences', {
      userId,
      error,
    })

    return { ok: false, storage: 'user_preferences', error }
  }
}

/**
 * Si une table user_2fa existe, on nettoie aussi les secrets TOTP.
 * Cela évite de laisser un secret actif après désactivation.
 */
async function cleanupTotpTableIfExists(supabase: any, userId: string) {
  try {
    const { error } = await supabase
      .from('user_2fa')
      .delete()
      .eq('user_id', userId)

    if (error && !isMissingTableError(error)) {
      logger.warn('Nettoyage user_2fa échoué', {
        userId,
        error,
      })
    }
  } catch (error) {
    logger.warn('Crash nettoyage user_2fa', {
      userId,
      error,
    })
  }
}

/* ------------------------------------------------------------------ */
/* POST                                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/user/2fa/disable
 *
 * Désactive le statut 2FA pour l'utilisateur connecté.
 * Nettoie aussi la table user_2fa si elle existe.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-2fa-disable:${ip}`,
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

    const supabase = await createClient(true)

    const result = await disableTwoFactorFlag(supabase, user.id)

    if (!result.ok) {
      return NextResponse.json(
        {
          error: 'Impossible de désactiver la 2FA.',
          code: '2FA_DISABLE_ERROR',
          details: result.error?.message,
        },
        { status: 500 }
      )
    }

    // Nettoyage optionnel si table TOTP présente
    await cleanupTotpTableIfExists(supabase, user.id)

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: '2fa_disabled',
      description: 'Authentification à deux facteurs désactivée',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        mode,
        storage: result.storage,
      },
    })

    return NextResponse.json({
      success: true,
      message: '2FA désactivée avec succès.',
      data: {
        two_factor_enabled: false,
        mode,
        storage: result.storage,
      },
    })
  } catch (error: any) {
    logger.error('Crash POST /api/user/2fa/disable', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}