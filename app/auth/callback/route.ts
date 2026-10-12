// app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Logger                                                             */
/* ------------------------------------------------------------------ */
function logCallback(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[AUTH_CALLBACK]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('success')
  ) {
    console.log('[AUTH_CALLBACK]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  GET : Callback après lien magique ou OAuth                         */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  /* ---------------------------------------------------------------- */
  /*  1. Gestion des erreurs Supabase                                  */
  /* ---------------------------------------------------------------- */
  if (errorParam) {
    logCallback('OAuth/Magic link error', {
      error: errorParam,
      description: errorDescription,
    })

    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        errorDescription || 'Erreur de connexion.'
      )}`
    )
  }

  /* ---------------------------------------------------------------- */
  /*  2. Échange du code PKCE contre une session                       */
  /* ---------------------------------------------------------------- */
  if (code) {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      logCallback('Code exchange failed', { error: error.message })

      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          'Lien expiré ou invalide. Réessayez.'
        )}`
      )
    }

    const user = data?.user

    if (!user) {
      logCallback('No user after code exchange')
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent('Erreur de connexion.')}`
      )
    }

    /* -------------------------------------------------------------- */
    /*  3. ✅ Mise à jour Auth + profiles (service client, sans RLS)  */
    /* -------------------------------------------------------------- */
    try {
      const supabaseAdmin = createServiceClient()

      // Force la confirmation côté Supabase Auth
      if (user.email) {
        const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
          user.id,
          { email_confirm: true }
        )

        if (confirmError) {
          logCallback('Auth confirm update failed (non-blocking)', {
            userId: user.id,
            error: confirmError.message,
          })
        }
      }

      // Met à jour le profil (passe outre les politiques RLS)
      const { data: updatedProfiles, error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          email_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('id')

      if (profileError) {
        logCallback('Profile update failed', {
          userId: user.id,
          error: profileError.message,
        })
      } else if (!updatedProfiles || updatedProfiles.length === 0) {
        logCallback('Profile update matched no row', { userId: user.id })
      } else {
        logCallback('Email verified via magic link', { userId: user.id })
      }
    } catch (err: any) {
      logCallback('Profile update exception', {
        userId: user.id,
        error: err?.message,
      })
    }

    /* -------------------------------------------------------------- */
    /*  4. Redirection vers l'onboarding                               */
    /* -------------------------------------------------------------- */
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  /* ---------------------------------------------------------------- */
  /*  5. Pas de code → redirection vers login                          */
  /* ---------------------------------------------------------------- */
  logCallback('No code in callback URL')
  return NextResponse.redirect(`${origin}/login`)
}