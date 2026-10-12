// lib/session.ts
import { cookies } from 'next/headers'
import { createClient } from './supabaseServer'
import type { User, Session } from '@supabase/supabase-js'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface SessionInfo {
  user: User
  session: Session
  isValid: boolean
  expiresAt: Date
  expiresIn: number // en secondes
  isExpiringSoon: boolean // expire dans moins de 5 minutes
}

export interface SessionValidationResult {
  valid: boolean
  user: User | null
  session: Session | null
  error?: string
}

export interface RefreshResult {
  success: boolean
  session: Session | null
  error?: string
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
/** Temps restant avant expiration pour considérer une session comme "expirant bientôt" */
const EXPIRING_SOON_THRESHOLD_SECONDS = 5 * 60 // 5 minutes

/** Durée de vie standard d'une session Supabase (1 heure par défaut) */
const DEFAULT_SESSION_LIFETIME_SECONDS = 60 * 60

/* ------------------------------------------------------------------ */
/*  Helpers internes                                                   */
/* ------------------------------------------------------------------ */

/**
 * Parse le JWT pour extraire la date d'expiration.
 * Supabase utilise un JWT standard avec le champ `exp`.
 */
function getTokenExpiration(token: string): Date | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1]
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8')
    const parsed = JSON.parse(decoded)

    if (!parsed.exp) return null

    return new Date(parsed.exp * 1000)
  } catch {
    return null
  }
}

/**
 * Calcule le nombre de secondes restantes avant expiration.
 */
function getSecondsUntilExpiration(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
}

/* ------------------------------------------------------------------ */
/*  Fonctions principales                                              */
/* ------------------------------------------------------------------ */

/**
 * Récupère la session courante depuis les cookies.
 * Tente un refresh automatique si la session est expirée mais le refresh token est valide.
 * 
 * @example
 * const session = await getSession()
 * if (!session) {
 *   // Non connecté
 * }
 */
export async function getSession(): Promise<Session | null> {
  try {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session) {
      return null
    }

    return session
  } catch (err) {
    console.error('[session] Erreur getSession:', err)
    return null
  }
}

/**
 * Récupère l'utilisateur courant depuis la session.
 * Utilise `getUser()` qui vérifie le token avec le serveur Supabase (plus sûr que getSession).
 * 
 * @example
 * const user = await getCurrentUser()
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    return user
  } catch (err) {
    console.error('[session] Erreur getCurrentUser:', err)
    return null
  }
}

/**
 * Retourne des informations détaillées sur la session courante.
 * Utile pour afficher "Session expire dans X minutes" ou déclencher un refresh.
 * 
 * @example
 * const info = await getSessionInfo()
 * if (info?.isExpiringSoon) {
 *   await refreshSession()
 * }
 */
export async function getSessionInfo(): Promise<SessionInfo | null> {
  const session = await getSession()
  if (!session || !session.access_token) return null

  const expiresAt = getTokenExpiration(session.access_token)
  if (!expiresAt) return null

  const expiresIn = getSecondsUntilExpiration(expiresAt)

  return {
    user: session.user,
    session,
    isValid: expiresIn > 0,
    expiresAt,
    expiresIn,
    isExpiringSoon: expiresIn > 0 && expiresIn < EXPIRING_SOON_THRESHOLD_SECONDS,
  }
}

/**
 * Valide la session courante.
 * Vérifie que :
 * 1. La session existe
 * 2. Le token n'est pas expiré
 * 3. L'utilisateur n'est pas banni
 * 4. L'utilisateur n'est pas supprimé
 * 
 * @example
 * const { valid, user } = await validateSession()
 * if (!valid) {
 *   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 * }
 */
export async function validateSession(): Promise<SessionValidationResult> {
  try {
    const supabase = await createClient()
    
    // getUser() vérifie le token avec le serveur (plus sûr)
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return {
        valid: false,
        user: null,
        session: null,
        error: userError?.message || 'No active session',
      }
    }

    // Vérifier si banni
    if (user.banned_until) {
      const bannedUntil = new Date(user.banned_until)
      if (bannedUntil > new Date()) {
        return {
          valid: false,
          user,
          session: null,
          error: 'Account banned',
        }
      }
    }

    // Vérifier si supprimé
    if (user.deleted_at) {
      return {
        valid: false,
        user,
        session: null,
        error: 'Account deleted',
      }
    }

    const { data: { session } } = await supabase.auth.getSession()

    return {
      valid: true,
      user,
      session,
    }
  } catch (err: any) {
    console.error('[session] Erreur validateSession:', err)
    return {
      valid: false,
      user: null,
      session: null,
      error: err.message || 'Session validation failed',
    }
  }
}

/**
 * Rafraîchit manuellement la session.
 * Utile avant une opération longue pour éviter l'expiration pendant le traitement.
 * 
 * @example
 * // Avant une opération qui prend du temps
 * await refreshSession()
 * // ... opération longue ...
 * 
 * @example
 * // Refresh conditionnel
 * const info = await getSessionInfo()
 * if (info?.isExpiringSoon) {
 *   await refreshSession()
 * }
 */
export async function refreshSession(): Promise<RefreshResult> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.refreshSession()

    if (error) {
      return {
        success: false,
        session: null,
        error: error.message,
      }
    }

    return {
      success: true,
      session: data.session,
    }
  } catch (err: any) {
    console.error('[session] Erreur refreshSession:', err)
    return {
      success: false,
      session: null,
      error: err.message || 'Session refresh failed',
    }
  }
}

/**
 * Rafraîchit la session seulement si elle expire bientôt.
 * Optimise les appels en évitant les refresh inutiles.
 * 
 * @example
 * // Dans un middleware ou layout
 * await refreshSessionIfNeeded()
 */
export async function refreshSessionIfNeeded(): Promise<RefreshResult> {
  const info = await getSessionInfo()
  
  if (!info) {
    return {
      success: false,
      session: null,
      error: 'No active session',
    }
  }

  if (!info.isExpiringSoon) {
    return {
      success: true,
      session: info.session,
    }
  }

  return refreshSession()
}

/**
 * Détruit la session courante (déconnexion côté serveur).
 * Nettoie les cookies et invalide le refresh token.
 * 
 * @example
 * // Dans un API route logout
 * await destroySession()
 * return NextResponse.redirect(new URL('/login', request.url))
 */
export async function destroySession(): Promise<void> {
  try {
    const supabase = await createClient()
    
    // Sign out : invalide le refresh token côté serveur
    await supabase.auth.signOut({ scope: 'global' })
  } catch (err) {
    console.error('[session] Erreur destroySession:', err)
    
    // Fallback : nettoyer les cookies manuellement
    try {
      const cookieStore = await cookies()
      // Supabase utilise ces noms de cookies par défaut
      const cookieNames = [
        'sb-access-token',
        'sb-refresh-token',
        'sb-auth-token',
        'sb-auth-token-code-verifier',
      ]
      
      // Nettoyer tous les cookies qui commencent par 'sb-'
      cookieStore.getAll().forEach((cookie) => {
        if (cookie.name.startsWith('sb-') || cookieNames.includes(cookie.name)) {
          cookieStore.delete(cookie.name)
        }
      })
    } catch (cookieErr) {
      console.error('[session] Erreur nettoyage cookies:', cookieErr)
    }
  }
}

/**
 * Vérifie si une session existe (sans validation serveur).
 * Plus rapide que validateSession() mais moins sûr.
 * 
 * @example
 * if (await hasSession()) {
 *   // Session présente (mais pas forcément valide)
 * }
 */
export async function hasSession(): Promise<boolean> {
  const session = await getSession()
  return session !== null
}

/**
 * Récupère le refresh token depuis les cookies.
 * Utile pour le debugging ou les logs (ne jamais exposer côté client).
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    
    // Chercher dans différents noms possibles
    const possibleNames = [
      'sb-refresh-token',
      'supabase-auth-token',
    ]

    for (const name of possibleNames) {
      const cookie = cookieStore.get(name)
      if (cookie?.value) {
        // Le cookie peut contenir un JSON avec le refresh token
        try {
          const parsed = JSON.parse(cookie.value)
          if (parsed.refresh_token) return parsed.refresh_token
        } catch {
          // Pas un JSON, c'est peut-être le token directement
          return cookie.value
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Récupère la session avec une option de refresh automatique.
 * Combine getSessionInfo() et refreshSessionIfNeeded() en un seul appel.
 * 
 * @example
 * const { session, refreshed } = await getSessionWithAutoRefresh()
 */
export async function getSessionWithAutoRefresh(): Promise<{
  session: Session | null
  refreshed: boolean
}> {
  const info = await getSessionInfo()
  
  if (!info) {
    return { session: null, refreshed: false }
  }

  if (info.isExpiringSoon) {
    const result = await refreshSession()
    return {
      session: result.session,
      refreshed: result.success,
    }
  }

  return {
    session: info.session,
    refreshed: false,
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers pour cookies                                               */
/* ------------------------------------------------------------------ */

/**
 * Liste tous les cookies de session Supabase présents.
 * Utile pour le debugging.
 */
export async function listSessionCookies(): Promise<string[]> {
  try {
    const cookieStore = await cookies()
    return cookieStore
      .getAll()
      .filter((c) => c.name.startsWith('sb-'))
      .map((c) => c.name)
  } catch {
    return []
  }
}

/**
 * Vérifie si les cookies de session sont présents.
 * Diagnostic rapide pour savoir si l'utilisateur a des cookies Supabase.
 */
export async function hasSessionCookies(): Promise<boolean> {
  const cookiesList = await listSessionCookies()
  return cookiesList.length > 0
}

/* ------------------------------------------------------------------ */
/*  Export par défaut                                                  */
/* ------------------------------------------------------------------ */
export default {
  getSession,
  getCurrentUser,
  getSessionInfo,
  validateSession,
  refreshSession,
  refreshSessionIfNeeded,
  destroySession,
  hasSession,
  getRefreshToken,
  getSessionWithAutoRefresh,
  listSessionCookies,
  hasSessionCookies,
}