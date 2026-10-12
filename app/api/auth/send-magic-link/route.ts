// app/api/auth/send-magic-link/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer' // Ajout de createServiceClient
import { z } from 'zod'
import { checkRateLimit, getIpRateLimitKey } from '@/lib/security'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Schéma de validation                                               */
/* ------------------------------------------------------------------ */
const schema = z.object({
  email: z.string().email('Email invalide'),
  type: z.enum(['recovery', 'login', 'verify']).default('verify'),
})

/* ------------------------------------------------------------------ */
/*  Constantes (Règle : 3 tentatives max, puis blocage 1 heure)        */
/* ------------------------------------------------------------------ */
const MAGIC_LINK_RATE_LIMIT_MAX = 3
const MAGIC_LINK_RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 heure en millisecondes

/* ------------------------------------------------------------------ */
/*  Logger                                                             */
/* ------------------------------------------------------------------ */
function logMagicLink(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[MAGIC_LINK]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('success') ||
    event.toLowerCase().includes('limited')
  ) {
    console.log('[MAGIC_LINK]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  POST : Envoyer un lien magique                                     */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = randomUUID() // NOUVEAU : Traçabilité unique de chaque requête

  try {
    /* ------------------------------------------------------------ */
    /* 1. Rate limiting par IP                                       */
    /* ------------------------------------------------------------ */
    const ipKey = getIpRateLimitKey(request, 'magic-link')
    const rateLimitResult = checkRateLimit(
      ipKey,
      MAGIC_LINK_RATE_LIMIT_MAX,
      MAGIC_LINK_RATE_LIMIT_WINDOW
    )

    if (!rateLimitResult.allowed) {
      logMagicLink('Rate limited', {
        requestId,
        retryAfter: rateLimitResult.retryAfterSeconds,
      })

      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.rate_limited },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfterSeconds!.toString(),
            'X-RateLimit-Remaining': '0',
            'X-Request-Id': requestId,
          },
        }
      )
    }

    /* ------------------------------------------------------------ */
    /* 2. Parser et valider le body                                  */
    /* ------------------------------------------------------------ */
    let body: unknown

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête JSON invalide.' },
        { status: 400, headers: { 'X-Request-Id': requestId } }
      )
    }

    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides.', errors: parsed.error.flatten() },
        { status: 400, headers: { 'X-Request-Id': requestId } }
      )
    }

    const { email, type } = parsed.data

    /* ------------------------------------------------------------ */
    /* 3. Déterminer l'URL de redirection                            */
    /* ------------------------------------------------------------ */
    const origin = new URL(request.url).origin
    let redirectTo: string

    if (type === 'recovery') {
      // CORRECTION CRITIQUE : L'URL doit correspondre exactement à la route du frontend
      redirectTo = `${origin}/reset-password`
    } else if (type === 'login') {
      // Connexion par lien magique
      redirectTo = `${origin}/auth/callback?next=/`
    } else {
      // Vérification d'email (onboarding)
      redirectTo = `${origin}/auth/callback?next=/onboarding`
    }

    /* ------------------------------------------------------------ */
    /* 4. Envoyer le lien magique via Supabase Auth                  */
    /* ------------------------------------------------------------ */
    
    // 🚀 BYPASS DEV MODE : On génère le lien sans envoyer d'email pour éviter le rate limit Supabase
    if (process.env.NODE_ENV === 'development') {
      const supabaseAdmin = await createServiceClient()
      
      // Supabase Admin API attend 'recovery' pour reset password et 'magiclink' pour login/verify
      const generateType = type === 'recovery' ? 'recovery' : 'magiclink'

      const { data, error: genError } = await supabaseAdmin.auth.admin.generateLink({
        type: generateType,
        email: email,
        options: { redirectTo }
      })
      
      if (genError) {
         logMagicLink('Dev generateLink failed', { requestId, error: genError.message })
         return NextResponse.json({ error: 'Erreur de génération du lien dev.' }, { status: 500, headers: { 'X-Request-Id': requestId } })
      }

      // Supabase renvoie le lien complet dans properties.action_link
      const devMagicLink = data.properties?.action_link || ''
      console.log('%c[DEV MODE] 🔗 Lien Magique:', 'color: cyan; font-size: 14px; font-weight: bold;', devMagicLink)
      
      const devResponse = NextResponse.json({
        success: true,
        message: '[DEV] Lien généré (email non envoyé pour éviter le rate limit).',
        devMagicLink,
        type,
      })
      
      devResponse.headers.set('Cache-Control', 'no-store')
      devResponse.headers.set('X-Request-Id', requestId)
      
      return devResponse
    }

    // En production, on utilise le client classique qui envoie l'email via le SMTP configuré
    const supabase = await createClient()
    let authError: any = null

    if (type === 'recovery') {
      // Réinitialisation de mot de passe
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      authError = error
    } else {
      // Lien magique (login ou verify)
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false, // Ne pas créer de compte si inexistant
        },
      })
      authError = error
    }

    if (authError) {
      logMagicLink('Send failed', {
        requestId,
        email: email.slice(0, 3) + '***',
        type,
        error: authError.message,
      })

      // NOUVEAU : Détecter spécifiquement le rate limit de Supabase pour un message clair au client
      if (authError.message.includes('rate limit exceeded')) {
        return NextResponse.json({ 
          error: "Trop de tentatives pour cet email. Pour votre sécurité, veuillez attendre 1 heure avant de réessayer." 
        }, { status: 429, headers: { 'X-Request-Id': requestId } })
      }

      // NOUVEAU : En cas d'autre erreur technique, on informe le client (pas de faux succès)
      return NextResponse.json({ 
        error: "Impossible d'envoyer le lien pour le moment. Veuillez réessayer dans quelques instants." 
      }, { status: 500, headers: { 'X-Request-Id': requestId } })
    }

    /* ------------------------------------------------------------ */
    /* 5. Réponse                                                    */
    /* ------------------------------------------------------------ */
    const duration = Date.now() - startTime

    logMagicLink('Sent', {
      requestId,
      email: email.slice(0, 3) + '***',
      type,
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Un lien magique a été envoyé à votre adresse email.',
      type,
    })

    // NOUVEAU : En-têtes de sécurité et de traçabilité renforcés
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())
    response.headers.set('X-Request-Id', requestId)

    return response
  } catch (error: any) {
    logMagicLink('Unhandled error', {
      requestId,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500, headers: { 'X-Request-Id': requestId } }
    )
  }
}