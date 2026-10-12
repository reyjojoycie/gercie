// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'
import {
  checkRateLimit,
  resetRateLimit,
  getIpRateLimitKey,
} from '@/lib/security'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const IP_RATE_LIMIT_MAX = 10
const IP_RATE_LIMIT_WINDOW = 15 * 60 * 1000

const EMAIL_RATE_LIMIT_MAX = 5
const EMAIL_RATE_LIMIT_WINDOW = 15 * 60 * 1000

/* ------------------------------------------------------------------ */
/*  Logger                                                             */
/* ------------------------------------------------------------------ */
function logLogin(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[LOGIN]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('success') ||
    event.toLowerCase().includes('blocked')
  ) {
    console.log('[LOGIN]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */
export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    /* ------------------------------------------------------------ */
    /* 1. Rate limiting par IP                                       */
    /* ------------------------------------------------------------ */
    const ipKey = getIpRateLimitKey(request, 'login')
    const ipLimit = checkRateLimit(ipKey, IP_RATE_LIMIT_MAX, IP_RATE_LIMIT_WINDOW)

    if (!ipLimit.allowed) {
      logLogin('Rate limited (IP)', { retryAfter: ipLimit.retryAfterSeconds })
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

    /* ------------------------------------------------------------ */
    /* 2. Extraire le token d'accès du header Authorization          */
    /* ------------------------------------------------------------ */
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logLogin('Missing or invalid Authorization header')
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    const accessToken = authHeader.replace('Bearer ', '')

    /* ------------------------------------------------------------ */
    /* 3. Valider le token via le service client                     */
    /* ------------------------------------------------------------ */
    const supabaseAdmin = createServiceClient()

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken)

    if (userError || !userData?.user) {
      logLogin('Invalid session token', { error: userError?.message })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    const user = userData.user

    /* ------------------------------------------------------------ */
    /* 4. Rate limiting par email (anti credential stuffing)         */
    /* ------------------------------------------------------------ */
    const normalizedEmail = (user.email || '').toLowerCase().trim()
    const emailKey = `login:email:${normalizedEmail}`
    const emailLimit = checkRateLimit(emailKey, EMAIL_RATE_LIMIT_MAX, EMAIL_RATE_LIMIT_WINDOW)

    if (!emailLimit.allowed) {
      logLogin('Rate limited (email)', { email: normalizedEmail })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.rate_limited },
        {
          status: 429,
          headers: {
            'Retry-After': emailLimit.retryAfterSeconds!.toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    /* ------------------------------------------------------------ */
    /* 5. Vérifier les flags utilisateur (banni, supprimé)           */
    /* ------------------------------------------------------------ */
    if (user.banned_until) {
      const bannedUntil = new Date(user.banned_until)
      if (bannedUntil > new Date()) {
        logLogin('Login blocked (banned)', { userId: user.id })
        return NextResponse.json(
          { error: AUTH_ERROR_MESSAGES.account_banned },
          { status: 403 }
        )
      }
    }

    if (user.deleted_at) {
      logLogin('Login blocked (deleted)', { userId: user.id })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_deleted },
        { status: 403 }
      )
    }

    /* ------------------------------------------------------------ */
    /* 6. Récupérer le profil applicatif                             */
    /* ------------------------------------------------------------ */
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      logLogin('Profile fetch failed', { userId: user.id, error: profileError.message })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.server },
        { status: 500 }
      )
    }

    if (!profile) {
      logLogin('Profile not found', { userId: user.id })
      // Profil manquant → onboarding obligatoire
      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          nom: null,
          prenom: null,
          avatar_url: null,
          type_user: 'acheteur',
          is_admin: false,
          is_verified: false,
          is_onboarded: false,
          preferences: {},
        },
        redirect: '/onboarding',
        has_verified_channel: false,
        is_onboarded: false,
        message: AUTH_ERROR_MESSAGES.onboarding_required,
      })
    }

    /* ------------------------------------------------------------ */
    /* 7. Vérifier si le profil est actif                            */
    /* ------------------------------------------------------------ */
    if (profile.est_actif === false) {
      logLogin('Login blocked (inactive profile)', { userId: user.id })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_inactive },
        { status: 403 }
      )
    }

    /* ------------------------------------------------------------ */
    /* 8. Appliquer la NOUVELLE RÈGLE MÉTIER                         */
    /*    Un canal vérifié (email OU téléphone) = compte fonctionnel  */
    /* ------------------------------------------------------------ */
    const emailVerified = profile.email_verified === true
    const phoneVerified = profile.phone_verified === true
    const hasVerifiedChannel = emailVerified || phoneVerified
    const isOnboarded = profile.onboarding_completed === true

    // Déterminer la redirection
    let redirect = '/onboarding'

    if (hasVerifiedChannel && isOnboarded) {
      // Compte vérifié + onboarding terminé → accueil
      redirect = '/'
    } else if (hasVerifiedChannel && !isOnboarded) {
      // Compte vérifié mais onboarding non terminé → onboarding
      redirect = '/onboarding'
    } else {
      // Aucun canal vérifié → onboarding (étape 1 : vérification)
      redirect = '/onboarding'
    }

    /* ------------------------------------------------------------ */
    /* 9. Réinitialiser le rate limiting après succès                */
    /* ------------------------------------------------------------ */
    resetRateLimit(ipKey)
    resetRateLimit(emailKey)

    /* ------------------------------------------------------------ */
    /* 10. Mettre à jour last_sign_in_at sur le profil               */
    /* ------------------------------------------------------------ */
    try {
      await supabaseAdmin
        .from('profiles')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', user.id)
    } catch {
      // Non critique
    }

    /* ------------------------------------------------------------ */
    /* 11. Réponse finale                                            */
    /* ------------------------------------------------------------ */
    const duration = Date.now() - startTime

    logLogin('Login success', {
      userId: user.id,
      email: normalizedEmail,
      hasVerifiedChannel,
      isOnboarded,
      redirect,
      durationMs: duration,
    })

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        nom: profile.nom || null,
        prenom: profile.prenom || null,
        avatar_url: profile.avatar_url || null,
        type_user: profile.type_user || 'acheteur',
        is_admin: profile.is_admin === true || profile.role === 'admin',
        is_verified: hasVerifiedChannel,
        is_onboarded: isOnboarded,
        preferences: profile.preferences || {},
      },
      redirect,
      has_verified_channel: hasVerifiedChannel,
      is_onboarded: isOnboarded,
      message: 'Connexion réussie',
    })

    // Headers de sécurité
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-RateLimit-Remaining', ipLimit.remaining.toString())

    return response
  } catch (error: any) {
    logLogin('Unhandled error', {
      error: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}