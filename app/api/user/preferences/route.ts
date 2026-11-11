// app/api/user/preferences/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { logActivity, getRequestMeta } from '@/lib/activity'

export const runtime = 'nodejs'

const DEFAULT_PREFERENCES = {
  language: 'fr',
  currency_display: 'USD',
  secondary_currency: 'CDF',
  theme: 'system',
  timezone: 'Africa/Kinshasa',
  date_format: 'DD/MM/YYYY',
  notif_email: true,
  notif_sms: false,
  notif_push: true,
  notif_whatsapp: false,
  notif_orders: true,
  notif_promos: false,
  notif_security: true,
  sound: true,
  reduced_motion: false,
  auto_refresh: true,
  marketing_consent: false,
  profile_visibility: 'private',
}

const preferencesSchema = z
  .object({
    language: z.string().min(2).max(10).optional(),
    currency_display: z.enum(['USD', 'CDF']).optional(),
    secondary_currency: z.enum(['USD', 'CDF']).optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
    timezone: z.string().min(2).max(100).optional(),
    date_format: z.string().min(4).max(20).optional(),

    notif_email: z.boolean().optional(),
    notif_sms: z.boolean().optional(),
    notif_push: z.boolean().optional(),
    notif_whatsapp: z.boolean().optional(),
    notif_orders: z.boolean().optional(),
    notif_promos: z.boolean().optional(),
    notif_security: z.boolean().optional(),

    sound: z.boolean().optional(),
    reduced_motion: z.boolean().optional(),
    auto_refresh: z.boolean().optional(),
    marketing_consent: z.boolean().optional(),
    profile_visibility: z.enum(['public', 'private', 'friends']).optional(),
  })
  .partial()

function sanitizePreferences(payload: Record<string, any>) {
  const clean: Record<string, any> = {}

  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      clean[key] = payload[key]
    }
  }

  return clean
}

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

/**
 * GET /api/user/preferences
 * Récupère les préférences de l'utilisateur connecté.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-preferences-get:${ip}`,
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

    const supabase = await createClient(false)

    const { data, error } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      // Si la table n'existe pas encore, on renvoie les valeurs par défaut
      if (error.code === '42P01') {
        return NextResponse.json({ data: DEFAULT_PREFERENCES })
      }

      logger.error('Erreur GET /api/user/preferences', {
        userId: user.id,
        error,
      })

      return NextResponse.json(
        { error: 'Impossible de récupérer les préférences' },
        { status: 500 }
      )
    }

    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...(data?.preferences || {}),
    }

    return NextResponse.json({ data: preferences })
  } catch (error: any) {
    logger.error('Crash GET /api/user/preferences', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/user/preferences
 * Met à jour les préférences de l'utilisateur connecté.
 */
export async function PATCH(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-preferences-patch:${ip}`,
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

    const parsed = preferencesSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const cleanPayload = sanitizePreferences(parsed.data)

    if (Object.keys(cleanPayload).length === 0) {
      return NextResponse.json(
        { error: 'Aucune préférence valide à enregistrer' },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const { data: existing, error: existingError } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingError && existingError.code !== '42P01') {
      logger.error('Erreur lecture user_preferences', {
        userId: user.id,
        error: existingError,
      })
    }

    const merged = {
      ...DEFAULT_PREFERENCES,
      ...(existing?.preferences || {}),
      ...cleanPayload,
    }

    const { error: upsertError } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: user.id,
          preferences: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) {
      logger.error('Erreur upsert user_preferences', {
        userId: user.id,
        error: upsertError,
      })

      return NextResponse.json(
        { error: "Impossible d'enregistrer les préférences" },
        { status: 500 }
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'preferences_updated',
      description: 'Préférences utilisateur mises à jour',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: cleanPayload,
    })

    return NextResponse.json({ data: merged })
  } catch (error: any) {
    logger.error('Crash PATCH /api/user/preferences', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}