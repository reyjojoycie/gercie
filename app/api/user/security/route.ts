// app/api/user/security/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import {
  getCurrentUser,
  getUserProfile,
  invalidateProfileCache,
  isUserBanned,
  isUserDeleted,
  isProfileActive,
} from '@/lib/auth'
import {
  hashSecurityAnswer,
  validatePasswordStrength,
} from '@/lib/security'
import {
  securityQuestionSchema,
  validateSchema,
  AUTH_ERROR_MESSAGES,
} from '@/lib/validators/auth'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Logger structuré                                                   */
/* ------------------------------------------------------------------ */
function logSecurity(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[SECURITY]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('échec')
  ) {
    console.error('[SECURITY]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  GET : Récupérer le statut de sécurité de l'utilisateur             */
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

    const profile = await getUserProfile(user.id)
    if (profile && !isProfileActive(profile)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_inactive },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  3. Compter les sessions actives (nécessite service_role)        */
    /* ---------------------------------------------------------------- */
    let sessions_count = 1
    try {
      const supabaseAdmin = await createServiceClient()
      const { data: sessionsData, error: sessionsError } = await supabaseAdmin.auth.admin.listSessions({
        user_id: user.id,
      })

      if (sessionsError) {
        logSecurity('List sessions error (fallback to 1)', {
          userId: user.id,
          error: sessionsError.message,
        })
      } else {
        sessions_count = sessionsData?.sessions?.length ?? 1
      }
    } catch (err) {
      logSecurity('List sessions exception (fallback to 1)', {
        userId: user.id,
        error: (err as Error).message,
      })
    }

    /* ---------------------------------------------------------------- */
    /*  4. Vérifier si 2FA est activé                                   */
    /* ---------------------------------------------------------------- */
    let has_2fa = false
    try {
      const supabaseAdmin = await createServiceClient()
      const { data: factors, error: factorsError } = await supabaseAdmin.auth.admin.listFactors({
        user_id: user.id,
      })

      if (factorsError) {
        logSecurity('List factors error', {
          userId: user.id,
          error: factorsError.message,
        })
      } else {
        has_2fa = (factors?.totp ?? []).some((f: any) => f.status === 'verified')
      }
    } catch (err) {
      logSecurity('List factors exception', {
        userId: user.id,
        error: (err as Error).message,
      })
    }

    /* ---------------------------------------------------------------- */
    /*  5. Construire la réponse                                        */
    /* ---------------------------------------------------------------- */
    const email_verified = profile?.email_verified ?? user.email_confirmed_at != null
    const phone_verified = profile?.phone_verified ?? user.phone_confirmed_at != null || !user.phone
    const has_security_question = Boolean(profile?.question_secrete && profile?.reponse_secrete)

    const duration = Date.now() - startTime
    logSecurity('GET success', {
      userId: user.id,
      email_verified,
      phone_verified,
      has_security_question,
      has_2fa,
      sessions_count,
      durationMs: duration,
    })

    const response = NextResponse.json({
      email_verified,
      phone_verified,
      has_security_question,
      has_2fa,
      last_password_change: user.updated_at,
      sessions_count,
      last_login_at: user.last_sign_in_at,
      failed_login_attempts: 0, // TODO: Implémenter le comptage des tentatives échouées
      account_locked_until: user.banned_until,
    })

    response.headers.set('Cache-Control', 'private, no-cache')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    logSecurity('GET unhandled error', {
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
/*  PUT : Configurer/modifier la question secrète                      */
/* ------------------------------------------------------------------ */
export async function PUT(request: NextRequest) {
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

    const profile = await getUserProfile(user.id)
    if (profile && !isProfileActive(profile)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_inactive },
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
    const validation = validateSchema(securityQuestionSchema, body)
    if (!validation.success) {
      logSecurity('PUT validation failed', {
        userId: user.id,
        errors: validation.errors,
      })
      return NextResponse.json(
        { error: 'Données invalides.', errors: validation.errors },
        { status: 400 }
      )
    }

    const { question, answer } = validation.data

    /* ---------------------------------------------------------------- */
    /*  5. Hasher la réponse secrète                                    */
    /* ---------------------------------------------------------------- */
    let hashedAnswer: string
    try {
      hashedAnswer = await hashSecurityAnswer(answer)
    } catch (err) {
      logSecurity('Hash answer failed', {
        userId: user.id,
        error: (err as Error).message,
      })
      return NextResponse.json(
        { error: 'Erreur lors du hachage de la réponse secrète.' },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  6. Mettre à jour le profil                                      */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        question_secrete: question,
        reponse_secrete: hashedAnswer,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      logSecurity('PUT update error', {
        userId: user.id,
        error: updateError.message,
      })
      return NextResponse.json(
        { error: 'Erreur lors de la configuration de la question secrète.' },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  7. Invalider le cache du profil                                 */
    /* ---------------------------------------------------------------- */
    invalidateProfileCache(user.id)

    /* ---------------------------------------------------------------- */
    /*  8. Réponse                                                      */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logSecurity('PUT success', {
      userId: user.id,
      question_length: question.length,
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Question secrète configurée avec succès.',
      has_security_question: true,
    })

    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    logSecurity('PUT unhandled error', {
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
/*  POST : Supprimer la question secrète                               */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
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
    /*  3. Supprimer la question secrète                                */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        question_secrete: null,
        reponse_secrete: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      logSecurity('POST delete error', {
        userId: user.id,
        error: updateError.message,
      })
      return NextResponse.json(
        { error: 'Erreur lors de la suppression de la question secrète.' },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Invalider le cache du profil                                 */
    /* ---------------------------------------------------------------- */
    invalidateProfileCache(user.id)

    /* ---------------------------------------------------------------- */
    /*  5. Réponse                                                      */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logSecurity('POST success (deleted)', {
      userId: user.id,
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Question secrète supprimée avec succès.',
      has_security_question: false,
    })

    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    logSecurity('POST unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}