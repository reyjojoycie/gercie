// app/api/auth/me/route.ts
import { NextResponse } from 'next/server'
import {
  getCurrentUser,
  getUserProfile,
  isUserBanned,
  isUserDeleted,
  isProfileActive,
  isAdmin,
  isEmailVerified,
  isPhoneVerified,
  isOnboarded,
} from '@/lib/auth'
import { refreshSessionIfNeeded, getSessionInfo } from '@/lib/session'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Logger structuré (pas de dépendance externe)                       */
/* ------------------------------------------------------------------ */
function logMe(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[ME]', payload)
  } else if (event.toLowerCase().includes('error')) {
    console.error('[ME]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  Handler principal                                                  */
/* ------------------------------------------------------------------ */
export async function GET(request: Request) {
  const startTime = Date.now()

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Refresh automatique de la session si elle expire bientôt     */
    /* ---------------------------------------------------------------- */
    try {
      await refreshSessionIfNeeded()
    } catch (err) {
      logMe('Session refresh failed (non-critical)', {
        error: (err as Error).message,
      })
      // Non bloquant, on continue
    }

    /* ---------------------------------------------------------------- */
    /*  2. Récupérer l'utilisateur Supabase Auth                        */
    /* ---------------------------------------------------------------- */
    const user = await getCurrentUser()

    if (!user) {
      logMe('Unauthenticated access attempt')
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  3. Vérifier les flags de sécurité (banni, supprimé)             */
    /* ---------------------------------------------------------------- */
    if (isUserBanned(user)) {
      logMe('Access blocked (banned)', { userId: user.id })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_banned },
        { status: 403 }
      )
    }

    if (isUserDeleted(user)) {
      logMe('Access blocked (deleted)', { userId: user.id })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_deleted },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Récupérer le profil applicatif (avec cache mémoire)          */
    /* ---------------------------------------------------------------- */
    const profile = await getUserProfile(user.id)

    if (profile && !isProfileActive(profile)) {
      logMe('Access blocked (inactive profile)', { userId: user.id })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_inactive },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  5. Récupérer les informations de session                        */
    /* ---------------------------------------------------------------- */
    let sessionInfo = null
    try {
      sessionInfo = await getSessionInfo()
    } catch {
      // Non critique
    }

    /* ---------------------------------------------------------------- */
    /*  6. Construire la réponse complète                               */
    /* ---------------------------------------------------------------- */
    const emailVerified = profile
      ? isEmailVerified(user, profile)
      : user.email_confirmed_at != null

    const phoneVerified = profile
      ? isPhoneVerified(user, profile)
      : user.phone_confirmed_at != null || !user.phone

    const responsePayload = {
      // Données Supabase Auth (basiques)
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone || null,
        email_confirmed_at: user.email_confirmed_at,
        phone_confirmed_at: user.phone_confirmed_at,
        last_sign_in_at: user.last_sign_in_at,
        created_at: user.created_at,
        updated_at: user.updated_at,
        app_metadata: user.app_metadata || {},
        user_metadata: user.user_metadata || {},
      },

      // Profil applicatif complet (depuis public.profiles)
      profile: profile
        ? {
            nom: profile.nom,
            prenom: profile.prenom,
            telephone: profile.telephone,
            avatar_url: profile.avatar_url,
            adresse: profile.adresse,
            adresse_boutique: profile.adresse_boutique,
            commune_id: profile.commune_id,
            type_user: profile.type_user,
            role: profile.role,
            est_actif: profile.est_actif,
            preferences: profile.preferences || {},
            onboarding_completed: profile.onboarding_completed,
            terms_accepted_at: profile.terms_accepted_at,
            created_at: profile.created_at,
            updated_at: profile.updated_at,
          }
        : null,

      // Flags calculés (utiles pour UI)
      flags: {
        is_admin: profile ? isAdmin(profile) : false,
        is_verified: emailVerified && phoneVerified,
        is_email_verified: emailVerified,
        is_phone_verified: phoneVerified,
        is_onboarded: profile ? isOnboarded(profile) : false,
        has_security_question: Boolean(
          profile?.question_secrete && profile?.reponse_secrete
        ),
      },

      // Informations de session (optionnel, utile pour UI)
      session: sessionInfo
        ? {
            expires_at: sessionInfo.expiresAt.toISOString(),
            expires_in: sessionInfo.expiresIn,
            is_expiring_soon: sessionInfo.isExpiringSoon,
          }
        : null,
    }

    /* ---------------------------------------------------------------- */
    /*  7. Log de succès                                                */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logMe('Success', {
      userId: user.id,
      hasProfile: !!profile,
      durationMs: duration,
    })

    /* ---------------------------------------------------------------- */
    /*  8. Réponse avec headers de sécurité                             */
    /* ---------------------------------------------------------------- */
    const response = NextResponse.json(responsePayload)

    // Headers de sécurité
    response.headers.set('Cache-Control', 'private, no-cache, no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Vary', 'Cookie, Authorization')

    return response
  } catch (error: any) {
    logMe('Unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}