// ---------------------------------------------------------------------------
// API Onboarding Complete – Finaliser l'onboarding
// Vérifie tous les prérequis avant de marquer l'onboarding comme terminé
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import {
  checkRateLimit,
  getUserRateLimitKey,
} from '@/lib/security'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'
import { z } from 'zod'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const COMPLETE_RATE_LIMIT_MAX = 5
const COMPLETE_RATE_LIMIT_WINDOW = 60 * 1000 // 5 req / minute

/* ------------------------------------------------------------------ */
/*  Schéma de validation (permissif car le body peut être vide)        */
/* ------------------------------------------------------------------ */
const bodySchema = z.object({
  preferences: z
    .object({
      categories: z.array(z.string()).optional(),
      language: z.string().optional(),
      langue: z.string().optional(),
      devise: z.string().optional(),
      notifications_email: z.boolean().optional(),
      notifications_sms: z.boolean().optional(),
    })
    .optional()
    .default({}),
})

/* ------------------------------------------------------------------ */
/*  Logger structuré                                                   */
/* ------------------------------------------------------------------ */
function logComplete(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[ONBOARDING_COMPLETE]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('success') ||
    event.toLowerCase().includes('blocked')
  ) {
    console.log('[ONBOARDING_COMPLETE]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  POST : Finaliser l'onboarding                                      */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    /* ------------------------------------------------------------ */
    /* 1. Authentification                                           */
    /* ------------------------------------------------------------ */
    const user = await getCurrentUser()

    if (!user) {
      logComplete('Unauthorized: no user', {})
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    logComplete('Request received', { userId: user.id })

    /* ------------------------------------------------------------ */
    /* 2. Rate limiting par utilisateur                              */
    /* ------------------------------------------------------------ */
    const rateLimitKey = getUserRateLimitKey(user.id, 'onboarding-complete')
    const rateLimitResult = checkRateLimit(
      rateLimitKey,
      COMPLETE_RATE_LIMIT_MAX,
      COMPLETE_RATE_LIMIT_WINDOW
    )

    if (!rateLimitResult.allowed) {
      logComplete('Rate limited', {
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
    /* 3. Parser le body (optionnel)                                 */
    /* ------------------------------------------------------------ */
    let body: unknown = {}

    try {
      body = await request.json()
    } catch {
      // Body vide ou invalide → utiliser les valeurs par défaut
      logComplete('Empty body, using defaults', { userId: user.id })
      body = {}
    }

    const parsed = bodySchema.safeParse(body)

    if (!parsed.success) {
      logComplete('Validation failed', {
        userId: user.id,
        errors: parsed.error.flatten(),
      })
      return NextResponse.json(
        { error: 'Données invalides.', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { preferences } = parsed.data

    /* ------------------------------------------------------------ */
    /* 4. Récupérer le profil pour vérifier les prérequis            */
    /* ------------------------------------------------------------ */
    const supabaseAdmin = createServiceClient()

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select(
        'email_verified, phone_verified, onboarding_completed, terms_accepted_at, preferences, nom, prenom'
      )
      .eq('id', user.id)
      .single()

    if (fetchError || !profile) {
      logComplete('Profile fetch failed', {
        userId: user.id,
        error: fetchError?.message || 'Profile not found',
      })

      return NextResponse.json(
        { error: 'Impossible de vérifier votre profil.' },
        { status: 500 }
      )
    }

    logComplete('Profile loaded', {
      userId: user.id,
      emailVerified: profile.email_verified,
      phoneVerified: profile.phone_verified,
      termsAccepted: !!profile.terms_accepted_at,
      alreadyCompleted: profile.onboarding_completed,
    })

    /* ------------------------------------------------------------ */
    /* 5. Vérifier les prérequis                                     */
    /* ------------------------------------------------------------ */

    // 5a. ✅ Au moins un canal vérifié (email OU téléphone)
    const hasVerifiedChannel =
      profile.email_verified === true || profile.phone_verified === true

    if (!hasVerifiedChannel) {
      logComplete('Blocked: no verified channel', {
        userId: user.id,
        emailVerified: profile.email_verified,
        phoneVerified: profile.phone_verified,
      })

      return NextResponse.json(
        {
          error:
            'Veuillez vérifier au moins un canal (email ou téléphone) avant de continuer.',
          code: 'NO_VERIFIED_CHANNEL',
        },
        { status: 403 }
      )
    }

    // 5b. ✅ Profil complété (nom + prenom)
    if (!profile.nom || !profile.prenom) {
      logComplete('Blocked: incomplete profile', {
        userId: user.id,
        hasNom: !!profile.nom,
        hasPrenom: !!profile.prenom,
      })

      return NextResponse.json(
        {
          error: 'Veuillez compléter votre profil (nom et prénom) avant de continuer.',
          code: 'INCOMPLETE_PROFILE',
        },
        { status: 403 }
      )
    }

    // 5c. ✅ Conditions acceptées
    if (!profile.terms_accepted_at) {
      logComplete('Blocked: terms not accepted', { userId: user.id })

      return NextResponse.json(
        {
          error:
            'Veuillez accepter les conditions générales avant de continuer.',
          code: 'TERMS_NOT_ACCEPTED',
        },
        { status: 403 }
      )
    }

    // 5d. Déjà onboardé ?
    if (profile.onboarding_completed === true) {
      logComplete('Already onboarded', { userId: user.id })

      return NextResponse.json({
        success: true,
        message: 'Onboarding déjà complété.',
        already_completed: true,
        onboarding_completed: true,
      })
    }

    /* ------------------------------------------------------------ */
    /* 6. Fusionner les préférences                                  */
    /* ------------------------------------------------------------ */
    const mergedPreferences = {
      ...(profile.preferences || {}),
      ...preferences,
    }

    logComplete('Merging preferences', {
      userId: user.id,
      existingPrefs: profile.preferences,
      newPrefs: preferences,
      merged: mergedPreferences,
    })

    /* ------------------------------------------------------------ */
    /* 7. Finaliser l'onboarding                                     */
    /* ------------------------------------------------------------ */
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        onboarding_completed: true,
        preferences: mergedPreferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      logComplete('Update failed', {
        userId: user.id,
        error: updateError.message,
        code: updateError.code,
      })

      return NextResponse.json(
        { error: 'Erreur lors de la finalisation de l\'onboarding.' },
        { status: 500 }
      )
    }

    /* ------------------------------------------------------------ */
    /* 8. Réponse                                                    */
    /* ------------------------------------------------------------ */
    const duration = Date.now() - startTime

    logComplete('Success', {
      userId: user.id,
      emailVerified: profile.email_verified === true,
      phoneVerified: profile.phone_verified === true,
      termsAccepted: !!profile.terms_accepted_at,
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Onboarding complété avec succès ! Bienvenue sur Gercie.',
      onboarding_completed: true,
    })

    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    logComplete('Unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}