// lib/auth.ts
import { createClient } from './supabaseServer'
import type { User, Session } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface UserProfile {
  id: string
  email: string | null
  nom: string | null
  prenom: string | null
  telephone: string | null
  type_user: 'acheteur' | 'vendeur' | 'livreur' | 'admin'
  adresse: string | null
  commune_id: number | null
  avatar_url: string | null
  adresse_boutique: string | null
  role: string
  preferences: Record<string, unknown>
  est_actif: boolean
  email_verified: boolean
  phone_verified: boolean
  onboarding_completed: boolean
  terms_accepted_at: string | null
  question_secrete: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface AuthResult {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  error?: string
}

export interface AuthorizationResult {
  authorized: boolean
  user?: User
  profile?: UserProfile
  error?: string
  statusCode?: number
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const PROFILE_CACHE_KEY = 'server_profile_cache'
const PROFILE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Cache en mémoire pour les API routes (évite les requêtes répétées)
const profileCache = new Map<string, { data: UserProfile; timestamp: number }>()

/* ------------------------------------------------------------------ */
/*  Helpers de cache                                                   */
/* ------------------------------------------------------------------ */
function getCachedProfile(userId: string): UserProfile | null {
  const cached = profileCache.get(userId)
  if (!cached) return null
  
  const isExpired = Date.now() - cached.timestamp > PROFILE_CACHE_TTL
  if (isExpired) {
    profileCache.delete(userId)
    return null
  }
  
  return cached.data
}

function setCachedProfile(userId: string, profile: UserProfile): void {
  profileCache.set(userId, {
    data: profile,
    timestamp: Date.now(),
  })
}

function clearCachedProfile(userId: string): void {
  profileCache.delete(userId)
}

/**
 * Nettoie tout le cache (utile pour tests ou invalidation globale)
 */
export function clearAllProfileCache(): void {
  profileCache.clear()
}

/* ------------------------------------------------------------------ */
/*  Fonctions principales                                              */
/* ------------------------------------------------------------------ */

/**
 * Récupère l'utilisateur Supabase courant.
 * Retourne null si non connecté ou si erreur.
 * 
 * @example
 * const user = await getCurrentUser()
 * if (!user) {
 *   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 * }
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
    console.error('Erreur getCurrentUser:', err)
    return null
  }
}

/**
 * Récupère la session Supabase courante.
 * 
 * @example
 * const session = await getCurrentSession()
 */
export async function getCurrentSession(): Promise<Session | null> {
  try {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      return null
    }
    
    return session
  } catch (err) {
    console.error('Erreur getCurrentSession:', err)
    return null
  }
}

/**
 * Récupère le profil complet de l'utilisateur depuis la table public.profiles.
 * Utilise un cache en mémoire pour éviter les requêtes répétées.
 * 
 * @example
 * const profile = await getUserProfile(user.id)
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  // Essayer le cache d'abord
  const cached = getCachedProfile(userId)
  if (cached) {
    return cached
  }
  
  try {
    const supabase = await createClient()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    
    if (error || !profile) {
      console.error('Erreur getUserProfile:', error)
      return null
    }
    
    // Mettre en cache
    setCachedProfile(userId, profile as UserProfile)
    
    return profile as UserProfile
  } catch (err) {
    console.error('Erreur getUserProfile:', err)
    return null
  }
}

/**
 * Invalide le cache du profil pour un utilisateur donné.
 * Utile après une mise à jour du profil.
 * 
 * @example
 * await updateUserProfile(userId, { nom: 'Nouveau' })
 * invalidateProfileCache(userId)
 */
export function invalidateProfileCache(userId: string): void {
  clearCachedProfile(userId)
}

/**
 * Récupère l'utilisateur ET son profil en une seule opération.
 * 
 * @example
 * const { user, profile, error } = await getCurrentUserWithProfile()
 */
export async function getCurrentUserWithProfile(): Promise<AuthResult> {
  const user = await getCurrentUser()
  
  if (!user) {
    return { user: null, session: null, profile: null }
  }
  
  const session = await getCurrentSession()
  const profile = await getUserProfile(user.id)
  
  return {
    user,
    session,
    profile,
  }
}

/* ------------------------------------------------------------------ */
/*  Fonctions d'autorisation                                           */
/* ------------------------------------------------------------------ */

/**
 * Vérifie que l'utilisateur est connecté.
 * Retourne une réponse 401 si non connecté.
 * 
 * @example
 * const auth = await requireUser()
 * if (!auth.authorized) {
 *   return NextResponse.json({ error: auth.error }, { status: 401 })
 * }
 * const { user, profile } = auth
 */
export async function requireUser(): Promise<AuthorizationResult> {
  const user = await getCurrentUser()
  
  if (!user) {
    return {
      authorized: false,
      error: 'Unauthorized',
      statusCode: 401,
    }
  }
  
  // Vérifier si banni
  if (user.banned_until) {
    const bannedUntil = new Date(user.banned_until)
    if (bannedUntil > new Date()) {
      return {
        authorized: false,
        user,
        error: 'Account banned',
        statusCode: 403,
      }
    }
  }
  
  // Vérifier si supprimé
  if (user.deleted_at) {
    return {
      authorized: false,
      user,
      error: 'Account deleted',
      statusCode: 403,
    }
  }
  
  const profile = await getUserProfile(user.id)
  
  // Vérifier si le profil est actif
  if (profile && profile.est_actif === false) {
    return {
      authorized: false,
      user,
      profile,
      error: 'Account inactive',
      statusCode: 403,
    }
  }
  
  return {
    authorized: true,
    user,
    profile: profile || undefined,
  }
}

/**
 * Vérifie que l'utilisateur est administrateur.
 * 
 * @example
 * const auth = await requireAdmin()
 * if (!auth.authorized) {
 *   return NextResponse.json({ error: auth.error }, { status: auth.statusCode })
 * }
 */
export async function requireAdmin(): Promise<AuthorizationResult> {
  const userAuth = await requireUser()
  
  if (!userAuth.authorized) {
    return userAuth
  }
  
  const { user, profile } = userAuth
  
  // Vérifier si admin
  if (!profile) {
    return {
      authorized: false,
      user,
      error: 'Profile not found',
      statusCode: 404,
    }
  }
  
  const isAdmin = profile.is_admin === true || profile.role === 'admin'
  
  if (!isAdmin) {
    return {
      authorized: false,
      user,
      profile,
      error: 'Forbidden: Admin access required',
      statusCode: 403,
    }
  }
  
  return {
    authorized: true,
    user,
    profile,
  }
}

/**
 * Vérifie que l'utilisateur a complété l'onboarding.
 * 
 * @example
 * const auth = await requireOnboarded()
 * if (!auth.authorized) {
 *   return NextResponse.json({ error: auth.error }, { status: 403 })
 * }
 */
export async function requireOnboarded(): Promise<AuthorizationResult> {
  const userAuth = await requireUser()
  
  if (!userAuth.authorized) {
    return userAuth
  }
  
  const { user, profile } = userAuth
  
  if (!profile) {
    return {
      authorized: false,
      user,
      error: 'Profile not found',
      statusCode: 404,
    }
  }
  
  if (!profile.onboarding_completed) {
    return {
      authorized: false,
      user,
      profile,
      error: 'Onboarding not completed',
      statusCode: 403,
    }
  }
  
  return {
    authorized: true,
    user,
    profile,
  }
}

/**
 * Vérifie que l'utilisateur a vérifié son email.
 * 
 * @example
 * const auth = await requireVerifiedEmail()
 * if (!auth.authorized) {
 *   return NextResponse.json({ error: auth.error }, { status: 403 })
 * }
 */
export async function requireVerifiedEmail(): Promise<AuthorizationResult> {
  const userAuth = await requireUser()
  
  if (!userAuth.authorized) {
    return userAuth
  }
  
  const { user, profile } = userAuth
  
  if (!profile) {
    return {
      authorized: false,
      user,
      error: 'Profile not found',
      statusCode: 404,
    }
  }
  
  const emailVerified = profile.email_verified === true || user.email_confirmed_at != null
  
  if (!emailVerified) {
    return {
      authorized: false,
      user,
      profile,
      error: 'Email not verified',
      statusCode: 403,
    }
  }
  
  return {
    authorized: true,
    user,
    profile,
  }
}

/**
 * Vérifie que l'utilisateur a vérifié son téléphone (si fourni).
 * 
 * @example
 * const auth = await requireVerifiedPhone()
 * if (!auth.authorized) {
 *   return NextResponse.json({ error: auth.error }, { status: 403 })
 * }
 */
export async function requireVerifiedPhone(): Promise<AuthorizationResult> {
  const userAuth = await requireUser()
  
  if (!userAuth.authorized) {
    return userAuth
  }
  
  const { user, profile } = userAuth
  
  if (!profile) {
    return {
      authorized: false,
      user,
      error: 'Profile not found',
      statusCode: 404,
    }
  }
  
  // Si pas de téléphone, on considère comme vérifié
  if (!user.phone) {
    return {
      authorized: true,
      user,
      profile,
    }
  }
  
  const phoneVerified = profile.phone_verified === true || user.phone_confirmed_at != null
  
  if (!phoneVerified) {
    return {
      authorized: false,
      user,
      profile,
      error: 'Phone not verified',
      statusCode: 403,
    }
  }
  
  return {
    authorized: true,
    user,
    profile,
  }
}

/**
 * Vérifie que l'utilisateur a un rôle spécifique.
 * 
 * @example
 * const auth = await requireRole('vendeur')
 * if (!auth.authorized) {
 *   return NextResponse.json({ error: auth.error }, { status: 403 })
 * }
 */
export async function requireRole(role: string): Promise<AuthorizationResult> {
  const userAuth = await requireUser()
  
  if (!userAuth.authorized) {
    return userAuth
  }
  
  const { user, profile } = userAuth
  
  if (!profile) {
    return {
      authorized: false,
      user,
      error: 'Profile not found',
      statusCode: 404,
    }
  }
  
  if (profile.role !== role && profile.type_user !== role) {
    return {
      authorized: false,
      user,
      profile,
      error: `Forbidden: ${role} role required`,
      statusCode: 403,
    }
  }
  
  return {
    authorized: true,
    user,
    profile,
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers pour réponses HTTP                                        */
/* ------------------------------------------------------------------ */

/**
 * Crée une réponse JSON d'erreur non autorisé (401).
 * 
 * @example
 * return unauthorizedResponse('Invalid token')
 */
export function unauthorizedResponse(message = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 401 }
  )
}

/**
 * Crée une réponse JSON d'erreur interdit (403).
 * 
 * @example
 * return forbiddenResponse('Admin access required')
 */
export function forbiddenResponse(message = 'Forbidden'): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 403 }
  )
}

/**
 * Crée une réponse JSON d'erreur non trouvé (404).
 * 
 * @example
 * return notFoundResponse('User not found')
 */
export function notFoundResponse(message = 'Not found'): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 404 }
  )
}

/**
 * Crée une réponse JSON d'erreur serveur (500).
 * 
 * @example
 * return serverErrorResponse('Database error')
 */
export function serverErrorResponse(message = 'Internal server error'): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 500 }
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers de validation                                              */
/* ------------------------------------------------------------------ */

/**
 * Vérifie si un utilisateur est banni.
 */
export function isUserBanned(user: User): boolean {
  if (!user.banned_until) return false
  const bannedUntil = new Date(user.banned_until)
  return bannedUntil > new Date()
}

/**
 * Vérifie si un utilisateur est supprimé.
 */
export function isUserDeleted(user: User): boolean {
  return !!user.deleted_at
}

/**
 * Vérifie si un profil est actif.
 */
export function isProfileActive(profile: UserProfile): boolean {
  return profile.est_actif !== false
}

/**
 * Vérifie si un utilisateur est admin.
 */
export function isAdmin(profile: UserProfile): boolean {
  return profile.is_admin === true || profile.role === 'admin'
}

/**
 * Vérifie si l'email est vérifié.
 */
export function isEmailVerified(user: User, profile: UserProfile): boolean {
  return profile.email_verified === true || user.email_confirmed_at != null
}

/**
 * Vérifie si le téléphone est vérifié.
 */
export function isPhoneVerified(user: User, profile: UserProfile): boolean {
  if (!user.phone) return true // Pas de téléphone = considéré vérifié
  return profile.phone_verified === true || user.phone_confirmed_at != null
}

/**
 * Vérifie si l'onboarding est complété.
 */
export function isOnboarded(profile: UserProfile): boolean {
  return profile.onboarding_completed === true
}

/* ------------------------------------------------------------------ */
/*  Export par défaut                                                  */
/* ------------------------------------------------------------------ */
export default {
  getCurrentUser,
  getCurrentSession,
  getUserProfile,
  getCurrentUserWithProfile,
  invalidateProfileCache,
  clearAllProfileCache,
  requireUser,
  requireAdmin,
  requireOnboarded,
  requireVerifiedEmail,
  requireVerifiedPhone,
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
  isUserBanned,
  isUserDeleted,
  isProfileActive,
  isAdmin,
  isEmailVerified,
  isPhoneVerified,
  isOnboarded,
}