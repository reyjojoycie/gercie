// app/api/auth/forgot-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import {
  forgotPasswordSchema,
  validateSchema,
  normalizeEmail,
  normalizePhone,
  detectIdentifierType,
  AUTH_ERROR_MESSAGES,
} from '@/lib/validators/auth'
import {
  createVerificationCode,
  checkRateLimit,
  getIpRateLimitKey,
  SECURITY_ERRORS,
} from '@/lib/security'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
// Rate limiting par IP : 10 tentatives / 15 minutes
const IP_RATE_LIMIT_MAX = 10
const IP_RATE_LIMIT_WINDOW = 15 * 60 * 1000

// Rate limiting par identifiant : 3 tentatives / 15 minutes
const IDENTIFIER_RATE_LIMIT_MAX = 3
const IDENTIFIER_RATE_LIMIT_WINDOW = 15 * 60 * 1000

// Durée de validité du code
const CODE_EXPIRY_MINUTES = 10

/* ------------------------------------------------------------------ */
/*  Logger sécurisé                                                    */
/* ------------------------------------------------------------------ */
function logForgotPassword(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[FORGOT_PASSWORD]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('échec')
  ) {
    console.error('[FORGOT_PASSWORD]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  Helper : envoyer un email (à implémenter avec votre provider)      */
/* ------------------------------------------------------------------ */
async function sendResetEmail(
  email: string,
  code: string,
  userName?: string
): Promise<boolean> {
  try {
    // TODO: Intégrer votre provider d'email (Resend, SendGrid, etc.)
    // Exemple avec Resend :
    //
    // const resend = new Resend(process.env.RESEND_API_KEY)
    // await resend.emails.send({
    //   from: 'Gercie <no-reply@gercie.com>',
    //   to: email,
    //   subject: 'Votre code de réinitialisation Gercie',
    //   html: `
    //     <h2>Réinitialisation de mot de passe</h2>
    //     <p>Bonjour ${userName || ''},</p>
    //     <p>Votre code de vérification est :</p>
    //     <h1 style="font-size: 32px; letter-spacing: 8px; color: #d4af37;">${code}</h1>
    //     <p>Ce code expire dans ${CODE_EXPIRY_MINUTES} minutes.</p>
    //     <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
    //   `,
    // })

    logForgotPassword('Email sent (mock)', { email: email.slice(0, 3) + '***' })
    return true
  } catch (err) {
    logForgotPassword('Email send failed', { error: (err as Error).message })
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Helper : envoyer un SMS (à implémenter avec votre provider)        */
/* ------------------------------------------------------------------ */
async function sendResetSMS(
  phone: string,
  code: string
): Promise<boolean> {
  try {
    // TODO: Intégrer votre provider SMS (Twilio, Africa's Talking, etc.)
    // Exemple avec Twilio :
    //
    // const client = require('twilio')(
    //   process.env.TWILIO_ACCOUNT_SID,
    //   process.env.TWILIO_AUTH_TOKEN
    // )
    // await client.messages.create({
    //   body: `Gercie: Votre code de réinitialisation est ${code}. Valide ${CODE_EXPIRY_MINUTES} min.`,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: phone,
    // })

    logForgotPassword('SMS sent (mock)', { phone: phone.slice(0, 6) + '***' })
    return true
  } catch (err) {
    logForgotPassword('SMS send failed', { error: (err as Error).message })
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Handler principal                                                  */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Rate limiting par IP                                         */
    /* ---------------------------------------------------------------- */
    const ipKey = getIpRateLimitKey(request, 'forgot-password')
    const ipLimit = checkRateLimit(ipKey, IP_RATE_LIMIT_MAX, IP_RATE_LIMIT_WINDOW)

    if (!ipLimit.allowed) {
      logForgotPassword('Rate limited (IP)', { retryAfter: ipLimit.retryAfterSeconds })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.rate_limited },
        {
          status: 429,
          headers: {
            'Retry-After': ipLimit.retryAfterSeconds!.toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  2. Parsing et validation du body                                */
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

    const validation = validateSchema(forgotPasswordSchema, body)
    if (!validation.success) {
      logForgotPassword('Validation failed', { errors: validation.errors })
      return NextResponse.json(
        { error: 'Données invalides.', errors: validation.errors },
        { status: 400 }
      )
    }

    const { identifier } = validation.data

    /* ---------------------------------------------------------------- */
    /*  3. Détection du type d'identifiant                              */
    /* ---------------------------------------------------------------- */
    const identifierType = detectIdentifierType(identifier)

    if (identifierType === 'unknown') {
      return NextResponse.json(
        { error: 'Format invalide. Saisissez un email valide ou un numéro de téléphone.' },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Rate limiting par identifiant (anti spam ciblé)              */
    /* ---------------------------------------------------------------- */
    const normalizedIdentifier =
      identifierType === 'email'
        ? normalizeEmail(identifier)
        : normalizePhone(identifier)

    const identifierKey = `forgot-password:identifier:${normalizedIdentifier}`
    const identifierLimit = checkRateLimit(
      identifierKey,
      IDENTIFIER_RATE_LIMIT_MAX,
      IDENTIFIER_RATE_LIMIT_WINDOW
    )

    if (!identifierLimit.allowed) {
      logForgotPassword('Rate limited (identifier)', {
        type: identifierType,
        retryAfter: identifierLimit.retryAfterSeconds,
      })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.rate_limited },
        {
          status: 429,
          headers: {
            'Retry-After': identifierLimit.retryAfterSeconds!.toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  5. Rechercher l'utilisateur (sans révéler s'il existe)          */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()
    let user = null

    if (identifierType === 'email') {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers()
      user = users?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedIdentifier
      )
    } else {
      // Recherche par téléphone
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, telephone')
        .eq('telephone', normalizedIdentifier)
        .maybeSingle()

      if (profile) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers()
        user = users?.users?.find((u) => u.id === profile.id)
      }
    }

    /* ---------------------------------------------------------------- */
    /*  6. SÉCURITÉ : Toujours retourner succès (même si user n'existe pas) */
    /*  Cela empêche l'énumération des comptes                          */
    /* ---------------------------------------------------------------- */
    if (!user) {
      logForgotPassword('Identifier not found (silent success)', {
        type: identifierType,
      })

      // Retourner succès pour ne pas révéler l'existence du compte
      return NextResponse.json({
        success: true,
        message:
          identifierType === 'email'
            ? 'Si un compte existe avec cet email, un code de réinitialisation a été envoyé.'
            : 'Si un compte existe avec ce numéro, un code de réinitialisation a été envoyé.',
        type: identifierType,
      })
    }

    /* ---------------------------------------------------------------- */
    /*  7. Vérifier que le compte n'est pas banni/supprimé              */
    /* ---------------------------------------------------------------- */
    if (user.banned_until) {
      const bannedUntil = new Date(user.banned_until)
      if (bannedUntil > new Date()) {
        logForgotPassword('Account banned (silent success)', { userId: user.id })
        // Retourner succès pour ne pas révéler le statut
        return NextResponse.json({
          success: true,
          message: 'Si un compte existe, un code a été envoyé.',
          type: identifierType,
        })
      }
    }

    if (user.deleted_at) {
      logForgotPassword('Account deleted (silent success)', { userId: user.id })
      return NextResponse.json({
        success: true,
        message: 'Si un compte existe, un code a été envoyé.',
        type: identifierType,
      })
    }

    /* ---------------------------------------------------------------- */
    /*  8. Générer le code de vérification                              */
    /* ---------------------------------------------------------------- */
    const codeType = identifierType === 'email' ? 'email_reset' : 'phone_reset'

    let code: string
    try {
      const result = await createVerificationCode(user.id, codeType, {
        codeLength: 6,
        expiryMinutes: CODE_EXPIRY_MINUTES,
      })
      code = result.code
    } catch (err) {
      logForgotPassword('Code creation failed', {
        userId: user.id,
        error: (err as Error).message,
      })
      return NextResponse.json(
        { error: SECURITY_ERRORS.hash_failed },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  9. Envoyer le code (email ou SMS)                               */
    /* ---------------------------------------------------------------- */
    let sendSuccess = false

    if (identifierType === 'email') {
      const userName = user.user_metadata?.full_name || user.user_metadata?.prenom
      sendSuccess = await sendResetEmail(user.email!, code, userName)
    } else {
      sendSuccess = await sendResetSMS(normalizedIdentifier, code)
    }

    if (!sendSuccess) {
      logForgotPassword('Send failed', {
        userId: user.id,
        type: identifierType,
      })
      // Même en cas d'échec d'envoi, on retourne succès pour ne pas révéler
      // que le compte existe (l'utilisateur ne recevra simplement pas le code)
    }

    /* ---------------------------------------------------------------- */
    /*  10. Réponse finale                                              */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logForgotPassword('Success', {
      userId: user.id,
      type: identifierType,
      sendSuccess,
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message:
        identifierType === 'email'
          ? 'Si un compte existe avec cet email, un code de réinitialisation a été envoyé.'
          : 'Si un compte existe avec ce numéro, un code de réinitialisation a été envoyé.',
      type: identifierType,
      expires_in: CODE_EXPIRY_MINUTES * 60, // secondes
      // En dev seulement : retourner le code pour les tests
      ...(process.env.NODE_ENV === 'development' ? { devCode: code } : {}),
    })

    // Headers de sécurité
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set(
      'X-RateLimit-Remaining',
      identifierLimit.remaining.toString()
    )

    return response
  } catch (error: any) {
    logForgotPassword('Unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}