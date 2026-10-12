// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabaseServer'
import { invalidateProfileCache } from '@/lib/auth'
import { destroySession } from '@/lib/session'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type LogoutScope = 'local' | 'global'

interface LogoutRequest {
  scope?: LogoutScope
  redirect_to?: string
}

/* ------------------------------------------------------------------ */
/*  Logger structuré (pas de dépendance externe)                       */
/* ------------------------------------------------------------------ */
function logLogout(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[LOGOUT]', payload)
  } else if (event.toLowerCase().includes('error') || event.toLowerCase().includes('échec')) {
    console.error('[LOGOUT]', payload)
  } else {
    // En prod, logger les succès aussi pour audit
    console.log('[LOGOUT]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  Helper : nettoyer les cookies Supabase manuellement                */
/* ------------------------------------------------------------------ */
async function clearSupabaseCookies(): Promise<number> {
  try {
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    let clearedCount = 0

    const supabaseCookiePrefixes = ['sb-', 'supabase-auth-token']

    for (const cookie of allCookies) {
      if (supabaseCookiePrefixes.some((prefix) => cookie.name.startsWith(prefix))) {
        cookieStore.delete(cookie.name)
        clearedCount++
      }
    }

    return clearedCount
  } catch (err) {
    logLogout('Cookie cleanup failed', { error: (err as Error).message })
    return 0
  }
}

/* ------------------------------------------------------------------ */
/*  Handler principal                                                  */
/* ------------------------------------------------------------------ */
export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Parser le body (optionnel)                                   */
    /* ---------------------------------------------------------------- */
    let body: LogoutRequest = {}
    try {
      const contentType = request.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        body = (await request.json().catch(() => ({}))) as LogoutRequest
      }
    } catch {
      // Body invalide, on continue avec les valeurs par défaut
    }

    const scope: LogoutScope = body.scope === 'global' ? 'global' : 'local'

    /* ---------------------------------------------------------------- */
    /*  2. Récupérer l'utilisateur courant (pour audit + cache)         */
    /* ---------------------------------------------------------------- */
    let userId: string | null = null
    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        userId = user.id
      }
    } catch (err) {
      // Non critique, on continue
      logLogout('Get user failed (non-critical)', {
        error: (err as Error).message,
      })
    }

    /* ---------------------------------------------------------------- */
    /*  3. Déconnexion Supabase Auth                                    */
    /* ---------------------------------------------------------------- */
    let signOutError: Error | null = null
    try {
      const supabase = await createClient()

      // scope 'global' : invalide tous les refresh tokens (tous les appareils)
      // scope 'local' : invalide uniquement la session courante
      const { error } = await supabase.auth.signOut({ scope })

      if (error) {
        signOutError = error
      }
    } catch (err) {
      signOutError = err as Error
    }

    /* ---------------------------------------------------------------- */
    /*  4. Nettoyage supplémentaire via destroySession                  */
    /* ---------------------------------------------------------------- */
    try {
      await destroySession()
    } catch (err) {
      logLogout('destroySession failed (non-critical)', {
        error: (err as Error).message,
      })
    }

    /* ---------------------------------------------------------------- */
    /*  5. Fallback : nettoyer les cookies manuellement si signOut a échoué */
    /* ---------------------------------------------------------------- */
    let cookiesCleared = 0
    if (signOutError) {
      cookiesCleared = await clearSupabaseCookies()
      logLogout('Cookie cleanup fallback', {
        cookiesCleared,
        originalError: signOutError.message,
      })
    }

    /* ---------------------------------------------------------------- */
    /*  6. Invalider le cache du profil (si on connaît l'utilisateur)   */
    /* ---------------------------------------------------------------- */
    if (userId) {
      try {
        invalidateProfileCache(userId)
      } catch (err) {
        logLogout('Cache invalidation failed (non-critical)', {
          userId,
          error: (err as Error).message,
        })
      }
    }

    /* ---------------------------------------------------------------- */
    /*  7. Log d'audit                                                  */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logLogout('Success', {
      userId,
      scope,
      cookiesCleared,
      hadSignOutError: !!signOutError,
      durationMs: duration,
    })

    /* ---------------------------------------------------------------- */
    /*  8. Construire la réponse avec headers de sécurité               */
    /* ---------------------------------------------------------------- */
    const response = NextResponse.json({
      success: true,
      message: 'Déconnexion réussie',
      scope,
      ...(body.redirect_to && { redirect_to: body.redirect_to }),
    })

    // Headers de sécurité
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Set-Cookie', buildLogoutCookieHeader())

    return response
  } catch (error: any) {
    logLogout('Unhandled error', {
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
/*  Handler GET : redirection vers login (utile pour logout links)     */
/* ------------------------------------------------------------------ */
export async function GET(request: Request) {
  // Réutiliser la logique POST pour cohérence
  return POST(request)
}

/* ------------------------------------------------------------------ */
/*  Helper : construire le header Set-Cookie de logout                */
/* ------------------------------------------------------------------ */
function buildLogoutCookieHeader(): string {
  // Expire immédiatement les cookies Supabase
  const expires = new Date(0).toUTCString()
  const cookies = [
    `sb-access-token=; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`,
    `sb-refresh-token=; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`,
    `sb-auth-token=; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`,
    `sb-auth-token-code-verifier=; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`,
  ]
  return cookies.join(', ')
}