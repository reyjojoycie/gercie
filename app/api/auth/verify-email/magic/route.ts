// app/api/auth/verify-email/magic/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import {
  checkRateLimit,
  getUserRateLimitKey,
} from '@/lib/security'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const MAGIC_LINK_RATE_LIMIT_MAX = 3
const MAGIC_LINK_RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 3 liens magiques / heure

/* ------------------------------------------------------------------ */
/*  Logger                                                             */
/* ------------------------------------------------------------------ */
function logMagic(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[VERIFY_EMAIL_MAGIC]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('success')
  ) {
    console.log('[VERIFY_EMAIL_MAGIC]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  POST : Envoyer un lien magique de vérification                     */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    /* ------------------------------------------------------------ */
    /* 1. Authentification                                           */
    /* ------------------------------------------------------------ */
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

    /* ------------------------------------------------------------ */
    /* 2. Rate limiting                                              */
    /* ------------------------------------------------------------ */
    const rateLimitKey = getUserRateLimitKey(user.id, 'verify-email-magic')
    const rateLimitResult = checkRateLimit(
      rateLimitKey,
      MAGIC_LINK_RATE_LIMIT_MAX,
      MAGIC_LINK_RATE_LIMIT_WINDOW
    )

    if (!rateLimitResult.allowed) {
      logMagic('Rate limited', {
        userId: user.id,
        retryAfter: rateLimitResult.retryAfterSeconds,
      })

      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.rate_limited },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfterSeconds?.toString() || '60',
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    /* ------------------------------------------------------------ */
    /* 3. ✅ Vérifier ET synchroniser profiles.email_verified        */
    /* ------------------------------------------------------------ */
    const supabaseAdmin = createServiceClient()

    const { data: profile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('email_verified')
      .eq('id', user.id)
      .maybeSingle()

    if (profileFetchError) {
      logMagic('Profile fetch failed', {
        userId: user.id,
        error: profileFetchError.message,
      })
    }

    // Cas 1 : le profil est déjà vérifié
    if (profile?.email_verified === true) {
      // On synchronise aussi Supabase Auth si besoin
      if (!user.email_confirmed_at) {
        const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
          user.id,
          { email_confirm: true }
        )

        if (confirmError) {
          logMagic('Auth confirm sync failed', {
            userId: user.id,
            error: confirmError.message,
          })
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Votre email est déjà vérifié.',
        already_verified: true,
      })
    }

    // Cas 2 : Supabase Auth a déjà confirmé l'email,
    // mais profiles.email_verified était encore false → on synchronise
    if (user.email_confirmed_at) {
      const { error: syncError } = await supabaseAdmin
        .from('profiles')
        .update({
          email_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (syncError) {
        logMagic('Profile sync failed', {
          userId: user.id,
          error: syncError.message,
        })

        return NextResponse.json(
          {
            error:
              'Votre email est confirmé, mais la synchronisation du profil a échoué. Réessayez.',
          },
          { status: 500 }
        )
      }

      logMagic('Profile synced (email already confirmed)', { userId: user.id })

      return NextResponse.json({
        success: true,
        message: 'Votre email est déjà vérifié.',
        already_verified: true,
      })
    }

    /* ------------------------------------------------------------ */
    /* 4. Envoyer le lien magique via Supabase Auth                  */
    /*    Le lien redirige vers /auth/callback                       */
    /* ------------------------------------------------------------ */
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    ).replace(/\/$/, '')

    const redirectTo = `${siteUrl}/auth/callback`

    const { error: magicError } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
      options: {
        emailRedirectTo: redirectTo,
      },
    })

    if (magicError) {
      logMagic('Magic link send failed', {
        userId: user.id,
        error: magicError.message,
      })

      return NextResponse.json(
        {
          error:
            "L'envoi du lien magique a échoué. Vérifiez la configuration email Supabase, ou utilisez le code de vérification.",
        },
        { status: 500 }
      )
    }

    /* ------------------------------------------------------------ */
    /* 5. Réponse                                                    */
    /* ------------------------------------------------------------ */
    const duration = Date.now() - startTime

    logMagic('Magic link sent', {
      userId: user.id,
      email: user.email.slice(0, 3) + '***',
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Un lien de vérification a été envoyé à votre adresse email.',
    })

    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    logMagic('Unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}