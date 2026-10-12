// app/api/user/profile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import {
  updateProfileSchema,
  validateSchema,
  normalizePhone,
  AUTH_ERROR_MESSAGES,
} from '@/lib/validators/auth'
import {
  getCurrentUser,
  getUserProfile,
  invalidateProfileCache,
  isUserBanned,
  isUserDeleted,
  isProfileActive,
} from '@/lib/auth'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Logger structuré                                                   */
/* ------------------------------------------------------------------ */
function logProfile(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[PROFILE]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('échec')
  ) {
    console.error('[PROFILE]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  Helper : construire la réponse profil enrichie                     */
/* ------------------------------------------------------------------ */
function buildProfileResponse(profile: any, user: any) {
  const emailVerified =
    profile?.email_verified === true || user?.email_confirmed_at != null
  const phoneVerified =
    profile?.phone_verified === true ||
    user?.phone_confirmed_at != null ||
    !user?.phone

  return {
    ...profile,
    // Flags calculés pour le client
    flags: {
      is_admin: profile?.is_admin === true || profile?.role === 'admin',
      is_verified: emailVerified && phoneVerified,
      is_email_verified: emailVerified,
      is_phone_verified: phoneVerified,
      is_onboarded: profile?.onboarding_completed === true,
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Handler GET : récupérer le profil complet                          */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Authentification                                             */
    /* ---------------------------------------------------------------- */
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  2. Vérification des flags de sécurité                           */
    /* ---------------------------------------------------------------- */
    if (isUserBanned(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_banned },
        { status: 403 }
      )
    }

    if (isUserDeleted(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_deleted },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  3. Récupérer le profil (avec cache mémoire)                     */
    /* ---------------------------------------------------------------- */
    const profile = await getUserProfile(user.id)

    if (!profile) {
      logProfile('Profile not found', { userId: user.id })
      return NextResponse.json(
        { error: 'Profil introuvable' },
        { status: 404 }
      )
    }

    if (!isProfileActive(profile)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_inactive },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Construire la réponse enrichie                               */
    /* ---------------------------------------------------------------- */
    const responseData = buildProfileResponse(profile, user)

    const duration = Date.now() - startTime
    logProfile('GET success', { userId: user.id, durationMs: duration })

    const response = NextResponse.json({ data: responseData })

    // Headers de sécurité
    response.headers.set('Cache-Control', 'private, no-cache')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    logProfile('GET error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/*  Handler PATCH : mise à jour partielle du profil                    */
/* ------------------------------------------------------------------ */
export async function PATCH(request: NextRequest) {
  return handleUpdate(request, false)
}

/* ------------------------------------------------------------------ */
/*  Handler PUT : mise à jour complète du profil                       */
/* ------------------------------------------------------------------ */
export async function PUT(request: NextRequest) {
  return handleUpdate(request, true)
}

/* ------------------------------------------------------------------ */
/*  Helper : logique commune PATCH/PUT                                 */
/* ------------------------------------------------------------------ */
async function handleUpdate(request: NextRequest, isFullUpdate: boolean) {
  const startTime = Date.now()
  const method = isFullUpdate ? 'PUT' : 'PATCH'

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Authentification                                             */
    /* ---------------------------------------------------------------- */
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  2. Vérification des flags de sécurité                           */
    /* ---------------------------------------------------------------- */
    if (isUserBanned(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_banned },
        { status: 403 }
      )
    }

    if (isUserDeleted(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_deleted },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  3. Parser le body                                               */
    /* ---------------------------------------------------------------- */
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête JSON invalide.' },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Validation avec schéma partagé                               */
    /* ---------------------------------------------------------------- */
    const validation = validateSchema(updateProfileSchema, body)
    if (!validation.success) {
      logProfile(`${method} validation failed`, {
        userId: user.id,
        errors: validation.errors,
      })
      return NextResponse.json(
        {
          error: 'Données invalides.',
          errors: validation.errors,
        },
        { status: 400 }
      )
    }

    const validatedData = validation.data

    /* ---------------------------------------------------------------- */
    /*  5. Protection : empêcher la modification de champs sensibles    */
    /* ---------------------------------------------------------------- */
    // Ces champs ne peuvent JAMAIS être modifiés par l'utilisateur
    const forbiddenFields = [
      'id',
      'email',
      'role',
      'is_admin',
      'email_verified',
      'phone_verified',
      'type_user',
      'created_at',
      'reponse_secrete',
    ] as const

    for (const field of forbiddenFields) {
      if (field in validatedData) {
        logProfile(`${method} forbidden field attempt`, {
          userId: user.id,
          field,
        })
        return NextResponse.json(
          { error: `Modification du champ '${field}' non autorisée.` },
          { status: 403 }
        )
      }
    }

    /* ---------------------------------------------------------------- */
    /*  6. Normalisation des données avant stockage                     */
    /* ---------------------------------------------------------------- */
    const updatePayload: Record<string, unknown> = { ...validatedData }

    // Normaliser le téléphone au format international
    if (validatedData.telephone) {
      updatePayload.telephone = normalizePhone(validatedData.telephone)
    }

    // Nettoyer les chaînes vides (transformer en null pour les champs optionnels)
    if ('adresse' in validatedData && validatedData.adresse === '') {
      updatePayload.adresse = null
    }

    // Timestamp automatique
    updatePayload.updated_at = new Date().toISOString()

    /* ---------------------------------------------------------------- */
    /*  7. Mise à jour en base                                          */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id)

    if (updateError) {
      logProfile(`${method} DB error`, {
        userId: user.id,
        error: updateError.message,
        code: updateError.code,
      })

      // Gestion des erreurs spécifiques PostgreSQL
      if (updateError.code === '23505') {
        // Violation de contrainte unique (ex: téléphone déjà utilisé)
        return NextResponse.json(
          { error: 'Cette valeur est déjà utilisée par un autre compte.' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        {
          error: 'Erreur lors de la mise à jour du profil.',
          details:
            process.env.NODE_ENV === 'development'
              ? updateError.message
              : undefined,
        },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  8. Invalidation du cache mémoire                                */
    /* ---------------------------------------------------------------- */
    invalidateProfileCache(user.id)

    /* ---------------------------------------------------------------- */
    /*  9. Récupérer le profil mis à jour                               */
    /* ---------------------------------------------------------------- */
    const { data: updatedProfile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (fetchError || !updatedProfile) {
      logProfile(`${method} fetch updated profile failed`, {
        userId: user.id,
        error: fetchError?.message,
      })
      // L'update a réussi, on retourne success même si le fetch a échoué
      return NextResponse.json({
        success: true,
        message: 'Profil mis à jour avec succès.',
      })
    }

    /* ---------------------------------------------------------------- */
    /*  10. Réponse avec le profil enrichi                              */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logProfile(`${method} success`, {
      userId: user.id,
      updatedFields: Object.keys(updatePayload).filter((k) => k !== 'updated_at'),
      durationMs: duration,
    })

    const responseData = buildProfileResponse(updatedProfile, user)

    const response = NextResponse.json({
      success: true,
      data: responseData,
    })

    // Headers de sécurité
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    logProfile(`${isFullUpdate ? 'PUT' : 'PATCH'} error`, {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}