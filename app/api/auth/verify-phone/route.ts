// app/api/auth/verify-phone/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import { invalidateProfileCache } from '@/lib/auth'
import {
  normalizePhone,
  AUTH_ERROR_MESSAGES,
} from '@/lib/validators/auth'
import {
  createVerificationCode,
  verifyVerificationCode,
  checkRateLimit,
  getUserRateLimitKey,
} from '@/lib/security'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const SEND_CODE_RATE_LIMIT_MAX = 3
const SEND_CODE_RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 3 envois / heure (SMS coûteux)

const VERIFY_CODE_RATE_LIMIT_MAX = 5
const VERIFY_CODE_RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 5 tentatives / 15 min

const CODE_EXPIRY_MINUTES = 10

/* ------------------------------------------------------------------ */
/*  Logger structuré                                                   */
/* ------------------------------------------------------------------ */
function logVerifyPhone(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[VERIFY_PHONE]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('échec') ||
    event.toLowerCase().includes('success')
  ) {
    console.log('[VERIFY_PHONE]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  Helper : envoyer le SMS de vérification                            */
/* ------------------------------------------------------------------ */
async function sendVerificationSMS(
  phone: string,
  code: string
): Promise<boolean> {
  try {
    // Option 1 : Twilio
    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    ) {
      const twilio = await import('twilio')
      const client = twilio.default(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      )

      await client.messages.create({
        body: `Gercie: Votre code de vérification est ${code}. Valide ${CODE_EXPIRY_MINUTES} min.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      })

      logVerifyPhone('SMS sent (Twilio)', {
        phone: phone.slice(0, 6) + '***',
      })

      return true
    }

    // Option 2 : Africa's Talking (recommandé pour RDC)
    if (
      process.env.AT_API_KEY &&
      process.env.AT_USERNAME
    ) {
      const AfricasTalking = require('africastalking')
      const at = AfricasTalking({
        apiKey: process.env.AT_API_KEY,
        username: process.env.AT_USERNAME,
      })

      const sms = at.SMS
      await sms.send({
        to: [phone],
        message: `Gercie: Votre code de vérification est ${code}. Valide ${CODE_EXPIRY_MINUTES} min.`,
        from: process.env.AT_PHONE_NUMBER || undefined,
      })

      logVerifyPhone('SMS sent (Africa\'s Talking)', {
        phone: phone.slice(0, 6) + '***',
      })

      return true
    }

    // Mode développement : log dans la console
    logVerifyPhone('SMS sent (dev mode)', {
      phone: phone.slice(0, 6) + '***',
      code,
    })

    return true
  } catch (err) {
    logVerifyPhone('SMS send failed', {
      phone: phone.slice(0, 6) + '***',
      error: (err as Error).message,
    })
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  POST : Générer et envoyer un code de vérification                  */
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
    const rateLimitKey = getUserRateLimitKey(user.id, 'verify-phone-send')
    const rateLimitResult = checkRateLimit(
      rateLimitKey,
      SEND_CODE_RATE_LIMIT_MAX,
      SEND_CODE_RATE_LIMIT_WINDOW
    )

    if (!rateLimitResult.allowed) {
      logVerifyPhone('Rate limited', {
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
    /*  3. Récupérer le téléphone depuis le profil                      */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('telephone, phone_verified')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile?.telephone) {
      logVerifyPhone('No phone in profile', { userId: user.id })
      return NextResponse.json(
        { error: 'Aucun numéro de téléphone associé à ce compte. Veuillez compléter votre profil.' },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Vérifier si le téléphone est déjà vérifié                    */
    /* ---------------------------------------------------------------- */
    if (profile.phone_verified || user.phone_confirmed_at) {
      logVerifyPhone('Phone already verified', { userId: user.id })
      return NextResponse.json({
        success: true,
        message: 'Votre téléphone est déjà vérifié.',
        already_verified: true,
      })
    }

    /* ---------------------------------------------------------------- */
    /*  5. Normaliser le téléphone (format international +243...)       */
    /* ---------------------------------------------------------------- */
    const normalizedPhone = normalizePhone(profile.telephone)

    if (!normalizedPhone) {
      logVerifyPhone('Invalid phone format', { userId: user.id })
      return NextResponse.json(
        { error: 'Format de numéro invalide.' },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  6. Générer le code de vérification                              */
    /* ---------------------------------------------------------------- */
    let code: string
    try {
      const result = await createVerificationCode(user.id, 'phone_verify', {
        codeLength: 6,
        expiryMinutes: CODE_EXPIRY_MINUTES,
      })
      code = result.code
    } catch (err) {
      logVerifyPhone('Code creation failed', {
        userId: user.id,
        error: (err as Error).message,
      })
      return NextResponse.json(
        { error: 'Impossible de générer le code de vérification.' },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  7. Envoyer le SMS                                               */
    /* ---------------------------------------------------------------- */
    const sendSuccess = await sendVerificationSMS(normalizedPhone, code)

    if (!sendSuccess && process.env.NODE_ENV === 'production') {
      // En production, si l'envoi échoue, on log mais on retourne quand même succès
      // pour ne pas révéler que le SMS n'a pas été envoyé (sécurité)
      logVerifyPhone('SMS send failed (silent success)', { userId: user.id })
    }

    /* ---------------------------------------------------------------- */
    /*  8. Réponse                                                      */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logVerifyPhone('Code sent', {
      userId: user.id,
      phone: normalizedPhone.slice(0, 6) + '***',
      sendSuccess,
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Code de vérification envoyé par SMS.',
      expires_in: CODE_EXPIRY_MINUTES * 60,
      // En dev seulement : retourner le code pour les tests
      ...(process.env.NODE_ENV === 'development' ? { devCode: code } : {}),
    })

    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set(
      'X-RateLimit-Remaining',
      rateLimitResult.remaining.toString()
    )

    return response
  } catch (error: any) {
    logVerifyPhone('POST unhandled error', {
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
/*  PUT : Vérifier le code soumis et valider le téléphone              */
/* ------------------------------------------------------------------ */
export async function PUT(request: NextRequest) {
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
    const rateLimitKey = getUserRateLimitKey(user.id, 'verify-phone-verify')
    const rateLimitResult = checkRateLimit(
      rateLimitKey,
      VERIFY_CODE_RATE_LIMIT_MAX,
      VERIFY_CODE_RATE_LIMIT_WINDOW
    )

    if (!rateLimitResult.allowed) {
      logVerifyPhone('Verify rate limited', {
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
      'phone_verify',
      code,
      { invalidateOnSuccess: true }
    )

    if (!verifyResult.success) {
      logVerifyPhone('Code verification failed', {
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

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { phone_confirm: true }
    )

    if (authUpdateError) {
      logVerifyPhone('Auth update failed', {
        userId: user.id,
        error: authUpdateError.message,
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
      logVerifyPhone('Profile update failed', {
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
    logVerifyPhone('Phone verified', {
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
    logVerifyPhone('PUT unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}