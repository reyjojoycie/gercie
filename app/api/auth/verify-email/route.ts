// app/api/auth/verify-email/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import {
  createVerificationCode,
  checkRateLimit,
  getUserRateLimitKey,
} from '@/lib/security'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'

export const runtime = 'nodejs'

const SEND_CODE_RATE_LIMIT_MAX = 3
const SEND_CODE_RATE_LIMIT_WINDOW = 60 * 60 * 1000
const CODE_EXPIRY_MINUTES = 10

function logVerifyEmail(event: string, metadata?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[VERIFY_EMAIL]', { event, ...metadata })
  } else {
    // En production, on log aussi les erreurs critiques
    if (event.toLowerCase().includes('fail') || event.toLowerCase().includes('error') || event.toLowerCase().includes('exception')) {
      console.error('[VERIFY_EMAIL]', { event, ...metadata })
    }
  }
}

/* ------------------------------------------------------------------ */
/*  POST : Générer et envoyer un code de vérification                  */
/*  ⚠️ La vérification du code est dans /confirm/route.ts              */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    /* 1. Authentification */
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

    if (!user.email) {
      return NextResponse.json(
        { error: 'Aucune adresse email associée à ce compte.' },
        { status: 400 }
      )
    }

    /* 2. Rate limiting */
    const rateLimitKey = getUserRateLimitKey(user.id, 'verify-email-send')
    const rateLimitResult = checkRateLimit(
      rateLimitKey,
      SEND_CODE_RATE_LIMIT_MAX,
      SEND_CODE_RATE_LIMIT_WINDOW
    )

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.rate_limited },
        {
          status: 429,
          headers: { 'Retry-After': rateLimitResult.retryAfterSeconds!.toString() },
        }
      )
    }

    /* 3. ✅ Vérifier profiles.email_verified (PAS email_confirmed_at !) */
    const { data: profileData } = await supabase
      .from('profiles')
      .select('email_verified')
      .eq('id', user.id)
      .maybeSingle()

    if (profileData?.email_verified === true) {
      return NextResponse.json({
        success: true,
        message: 'Votre email est déjà vérifié.',
        already_verified: true,
      })
    }

    /* 4. Générer le code */
    let code: string
    try {
      const result = await createVerificationCode(user.id, 'email_verify', {
        codeLength: 6,
        expiryMinutes: CODE_EXPIRY_MINUTES,
      })
      code = result.code
    } catch (err) {
      logVerifyEmail('Code creation failed', { error: (err as Error).message })
      return NextResponse.json(
        { error: 'Impossible de générer le code de vérification.' },
        { status: 500 }
      )
    }

    /* 5. 📧 Envoyer l'email via Resend */
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)

        // ⚠️ Resend renvoie { data, error }
        const { error: resendError } = await resend.emails.send({
          from: process.env.EMAIL_FROM || 'Gercie <onboarding@resend.dev>',
          to: user.email,
          subject: 'Votre code de vérification Gercie',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#1a1a2e;">Vérification de votre email</h2>
              <p>Voici votre code de vérification :</p>
              <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#d4af37;text-align:center;padding:20px;background:#f9f9f9;border-radius:8px;margin:20px 0;">${code}</div>
              <p>Ce code expire dans <strong>${CODE_EXPIRY_MINUTES} minutes</strong>.</p>
            </div>
          `,
        })

        // 🛑 Si Resend renvoie une erreur, on bloque tout et on prévient le front !
        if (resendError) {
          logVerifyEmail('Resend API error', { error: resendError.message, code: resendError.name })
          return NextResponse.json(
            { error: `Erreur d'envoi d'email : ${resendError.message}` },
            { status: 500 }
          )
        }

        logVerifyEmail('Email sent via Resend', { userId: user.id, to: user.email })
      } catch (err) {
        logVerifyEmail('Resend exception', { error: (err as Error).message })
        return NextResponse.json(
          { error: "Impossible d'envoyer l'email (exception serveur)." },
          { status: 500 }
        )
      }
    } else {
      // 🛑 En production, on ne doit PAS continuer sans service d'email
      if (process.env.NODE_ENV === 'production') {
        logVerifyEmail('Missing RESEND_API_KEY in production', { userId: user.id })
        return NextResponse.json(
          { error: "Service d'envoi d'email non configuré sur le serveur." },
          { status: 500 }
        )
      }
      
      logVerifyEmail('No RESEND_API_KEY — devCode mode', { userId: user.id })
    }

    /* 6. Réponse */
    const response = NextResponse.json({
      success: true,
      message: 'Code de vérification généré.',
      expires_in: CODE_EXPIRY_MINUTES * 60,
      // On expose le code uniquement en développement ET sur localhost
      ...(process.env.NODE_ENV === 'development' ? { devCode: code } : {}),
    })

    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error: any) {
    logVerifyEmail('Unhandled error', { error: error.message })
    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}