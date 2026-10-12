// lib/auth/callbackUtils.ts
import { NextResponse } from 'next/server'

/**
 * Valide et sanitise une URL de redirection pour éviter les Open Redirect attacks.
 * 
 * Règles :
 * - Doit commencer par /
 * - Ne doit pas contenir // (sauf au début si relatif)
 * - Ne doit pas commencer par /\ ou /\/
 * - Ne doit pas contenir de protocole (http:, https:, javascript:)
 * - Ne doit pas contenir de @ (user@domain)
 */
export function sanitizeRedirectUrl(url: string | null, origin: string): string {
  if (!url) return origin
  
  // Décoder l'URL pour éviter les encodages malveillants
  let decodedUrl: string
  try {
    decodedUrl = decodeURIComponent(url)
  } catch {
    return origin
  }

  // Rejeter les URLs avec protocole
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decodedUrl)) {
    return origin
  }

  // Rejeter les URLs commençant par //, /\, ou contenant @
  if (decodedUrl.startsWith('//') || decodedUrl.startsWith('/\\') || decodedUrl.includes('@')) {
    return origin
  }

  // Rejeter les URLs qui ne commencent pas par /
  if (!decodedUrl.startsWith('/')) {
    return origin
  }

  // Normaliser : supprimer les slashes multiples
  const normalized = decodedUrl.replace(/\/+/g, '/')
  
  // Construire l'URL finale de manière sûre
  try {
    const finalUrl = new URL(normalized, origin)
    // Vérifier que l'origin n'a pas été changé
    if (finalUrl.origin !== origin) {
      return origin
    }
    return finalUrl.toString()
  } catch {
    return origin
  }
}

/**
 * Messages d'erreur localisés pour les callbacks OAuth
 */
export const CALLBACK_ERRORS = {
  missing_code: 'Code d\'authentification manquant.',
  auth_callback_failed: 'La connexion via le réseau social a échoué. Veuillez réessayer.',
  server_error: 'Erreur serveur. Réessayez dans quelques instants.',
  user_banned: 'Votre compte a été suspendu.',
  user_deleted: 'Ce compte n\'existe plus.',
  invalid_state: 'Session expirée. Veuillez réessayer.',
  unknown: 'Une erreur est survenue. Veuillez réessayer.',
} as const

/**
 * Crée une réponse de redirection avec les headers de sécurité appropriés
 */
export function secureRedirect(url: string): NextResponse {
  const response = NextResponse.redirect(url)
  
  // Headers de sécurité
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  
  return response
}

/**
 * Logger sécurisé : ne jamais exposer de données sensibles
 */
export function logAuthEvent(event: string, metadata?: Record<string, unknown>) {
  const safeMetadata = metadata ? {
    // Ne logger que les champs sûrs
    userId: metadata.userId,
    error: metadata.error,
    provider: metadata.provider,
    timestamp: new Date().toISOString(),
  } : {}

  // En production, utiliser un service de logging (Sentry, etc.)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUTH] ${event}`, safeMetadata)
  } else {
    // En production, on pourrait envoyer à Sentry/Logtail/etc.
    // Pour l'instant, on log uniquement les erreurs
    if (event.includes('error') || event.includes('Error')) {
      console.error(`[AUTH] ${event}`, safeMetadata)
    }
  }
}

/**
 * Vérifie si un utilisateur est autorisé à se connecter
 */
export function isUserAllowed(user: {
  banned_until?: string | null
  deleted_at?: string | null
  is_active?: boolean
}): { allowed: boolean; reason?: string } {
  // Vérifier si l'utilisateur est banni
  if (user.banned_until) {
    const bannedUntil = new Date(user.banned_until)
    if (bannedUntil > new Date()) {
      return { allowed: false, reason: 'user_banned' }
    }
  }

  // Vérifier si l'utilisateur est supprimé
  if (user.deleted_at) {
    return { allowed: false, reason: 'user_deleted' }
  }

  // Vérifier si le profil est actif (si fourni)
  if (user.is_active === false) {
    return { allowed: false, reason: 'user_deleted' }
  }

  return { allowed: true }
}