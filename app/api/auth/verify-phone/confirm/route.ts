// app/api/auth/verify-phone/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import { invalidateProfileCache } from '@/lib/auth'
import {
  verifyVerificationCode,
  checkRateLimit,
  getUserRateLimitKey,
} from '@/lib/security'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const VERIFY_CODE_RATE_LIMIT_MAX = 5
const VERIFY_CODE_RATE_LIMIT_WINDOW = 15 * 60 * 1000

/* ------------------------------------------------------------------ */
/*  Logger structuré                                                   */
/* ------------------------------------------------------------------ */
function logVerifyPhoneConfirm(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[VERIFY_PHONE_CONFIRM]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('échec') ||
    event.toLowerCase().includes('success')
  ) {
    console.log('[VERIFY_PHONE_CONFIRM]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  POST : Vérifier le code soumis et valider le téléphone             */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Authentification                                             */
    /* ---------------------------------------------------------------- */
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  2. Rate limiting par utilisateur                                */
    /* ---------------------------------------------------------------- */
    const rateLimitKey = getUserRateLimitKey(user.id, 'verify-phone-confirm')
    const rateLimitResult = checkRateLimit(
      rateLimitKey,
      VERIFY_CODE_RATE_LIMIT_MAX,
      VERIFY_CODE_RATE_LIMIT_WINDOW
    )

    if (!rateLimitResult.allowed) {
      logVerifyPhoneConfirm('Rate limited', {
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

    /* ---------------------------------------------------------------- */
    /*  3. Parser le body                                               */
    /* ---------------------------------------------------------------- */
    let body: { code?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête JSON invalide.' },
        { status: 400 }
      )
    }

    const code = body?.code?.trim()

    if (!code || code.length !== 6) {
      return NextResponse.json(
        { error: 'Le code de vérification doit contenir 6 chiffres.' },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Vérifier le code avec lib/security.ts                        */
    /* ---------------------------------------------------------------- */
    const verifyResult = await verifyVerificationCode(
      user.id,
      'phone_verify', // Type cohérent avec l'enum
      code,
      { invalidateOnSuccess: true }
    )

    if (!verifyResult.success) {
      logVerifyPhoneConfirm('Code verification failed', {
        userId: user.id,
        error: verifyResult.error,
      })
      return NextResponse.json(
        { error: verifyResult.error || AUTH_ERROR_MESSAGES.code_invalid },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  5. Mettre à jour Supabase Auth (phone_confirmed_at)             */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()

    try {
      await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { phone_confirm: true }
      )
    } catch (err) {
      logVerifyPhoneConfirm('Auth update failed (non-critical)', {
        userId: user.id,
        error: (err as Error).message,
      })
      // Non bloquant, on continue
    }

    /* ---------------------------------------------------------------- */
    /*  6. Mettre à jour le profil applicatif                           */
    /* ---------------------------------------------------------------- */
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        phone_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (profileError) {
      logVerifyPhoneConfirm('Profile update failed', {
        userId: user.id,
        error: profileError.message,
      })
      return NextResponse.json(
        { error: 'Erreur lors de la confirmation de votre téléphone.' },
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
    logVerifyPhoneConfirm('Phone verified', {
      userId: user.id,
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Votre numéro de téléphone a été vérifié avec succès !',
    })

    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    logVerifyPhoneConfirm('Unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}