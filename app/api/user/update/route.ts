// app/api/user/update/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import {
  checkRateLimit,
  getUserRateLimitKey,
} from '@/lib/security'
import {
  PHONE_REGEX,
  normalizePhone,
  AUTH_ERROR_MESSAGES,
} from '@/lib/validators/auth'
import { z } from 'zod'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const UPDATE_PROFILE_RATE_LIMIT_MAX = 10
const UPDATE_PROFILE_RATE_LIMIT_WINDOW = 60 * 1000 // 10 req / minute

/* ------------------------------------------------------------------ */
/*  Schéma de validation                                               */
/* ------------------------------------------------------------------ */
const updateProfileSchema = z.object({
  nom: z
    .string()
    .min(1, 'Le nom est requis')
    .max(100, 'Le nom ne doit pas dépasser 100 caractères'),
  prenom: z
    .string()
    .min(1, 'Le prénom est requis')
    .max(100, 'Le prénom ne doit pas dépasser 100 caractères'),
  telephone: z
    .string()
    .regex(PHONE_REGEX, 'Numéro invalide (ex: 0812345678 ou +243812345678)')
    .optional()
    .or(z.literal('')),
  avatar_url: z.string().url().nullable().optional(),
})

/* ------------------------------------------------------------------ */
/*  Logger                                                             */
/* ------------------------------------------------------------------ */
function logUpdate(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[USER_UPDATE]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('success')
  ) {
    console.log('[USER_UPDATE]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  PUT : Met à jour les informations personnelles de l'utilisateur    */
/* ------------------------------------------------------------------ */
export async function PUT(request: NextRequest) {
  const startTime = Date.now()

  try {
    /* ------------------------------------------------------------ */
    /* 1. Authentification                                           */
    /* ------------------------------------------------------------ */
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    /* ------------------------------------------------------------ */
    /* 2. Rate limiting par utilisateur                              */
    /* ------------------------------------------------------------ */
    const rateLimitKey = getUserRateLimitKey(user.id, 'user-update')
    const rateLimitResult = checkRateLimit(
      rateLimitKey,
      UPDATE_PROFILE_RATE_LIMIT_MAX,
      UPDATE_PROFILE_RATE_LIMIT_WINDOW
    )

    if (!rateLimitResult.allowed) {
      logUpdate('Rate limited', {
        userId: user.id,
        retryAfter: rateLimitResult.retryAfterSeconds,
      })

      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.rate_limited },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfterSeconds!.toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    /* ------------------------------------------------------------ */
    /* 3. Parser et valider le body                                  */
    /* ------------------------------------------------------------ */
    let body: unknown

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête JSON invalide.' },
        { status: 400 }
      )
    }

    const parsed = updateProfileSchema.safeParse(body)

    if (!parsed.success) {
      logUpdate('Validation failed', {
        userId: user.id,
        errors: parsed.error.flatten().fieldErrors,
      })

      return NextResponse.json(
        {
          error: 'Données invalides.',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { nom, prenom, telephone, avatar_url } = parsed.data

    /* ------------------------------------------------------------ */
    /* 4. Construction de l'objet de mise à jour                     */
    /* ------------------------------------------------------------ */
    const updates: Record<string, unknown> = {
      nom: nom.trim(),
      prenom: prenom.trim(),
      updated_at: new Date().toISOString(),
    }

    // Normaliser le téléphone si fourni
    if (telephone !== undefined && telephone !== '') {
      updates.telephone = normalizePhone(telephone)
    }

    // Avatar si fourni
    if (avatar_url !== undefined) {
      updates.avatar_url = avatar_url
    }

    /* ------------------------------------------------------------ */
    /* 5. Mise à jour en base via service client                     */
    /* ------------------------------------------------------------ */
    const supabaseAdmin = createServiceClient()

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (updateError) {
      logUpdate('Update failed', {
        userId: user.id,
        error: updateError.message,
      })

      return NextResponse.json(
        { error: 'Impossible de mettre à jour le profil.' },
        { status: 500 }
      )
    }

    /* ------------------------------------------------------------ */
    /* 6. Récupérer le profil mis à jour                             */
    /* ------------------------------------------------------------ */
    const { data: updatedProfile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('nom, prenom, telephone, avatar_url, updated_at')
      .eq('id', user.id)
      .single()

    if (fetchError) {
      logUpdate('Fetch after update failed (non-blocking)', {
        userId: user.id,
        error: fetchError.message,
      })

      // On renvoie quand même les données envoyées comme fallback
      return NextResponse.json({
        success: true,
        message: 'Profil mis à jour avec succès.',
        data: {
          nom: nom.trim(),
          prenom: prenom.trim(),
          telephone: telephone ? normalizePhone(telephone) : '',
          avatar_url: avatar_url || null,
        },
      })
    }

    /* ------------------------------------------------------------ */
    /* 7. Réponse                                                    */
    /* ------------------------------------------------------------ */
    const duration = Date.now() - startTime

    logUpdate('Success', {
      userId: user.id,
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Vos informations ont été mises à jour.',
      data: {
        nom: updatedProfile.nom,
        prenom: updatedProfile.prenom,
        telephone: updatedProfile.telephone || '',
        avatar_url: updatedProfile.avatar_url || null,
        updated_at: updatedProfile.updated_at,
      },
    })

    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    logUpdate('Unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}