// lib/auth/adminGuard.ts
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import { MESSAGES } from '@/lib/constants'
import { errorResponse } from '@/lib/api-response'
import type { User } from '@supabase/supabase-js'

/**
 * Vérifie si un objet User Supabase possède des droits admin dans ses métadonnées.
 */
function checkUserMetadata(user: User): boolean {
  return (
    user.app_metadata?.is_admin === true ||
    user.user_metadata?.is_admin === true ||
    user.app_metadata?.role === 'admin' ||
    user.user_metadata?.role === 'admin'
  )
}

/**
 * Vérifie si un utilisateur (fourni par son ID ou son objet User) est administrateur.
 * Interroge les métadonnées puis la table public.profiles.
 */
export async function isAdmin(userOrUserId: User | string): Promise<boolean> {
  if (!userOrUserId) return false

  let userId: string
  if (typeof userOrUserId === 'object') {
    if (checkUserMetadata(userOrUserId)) {
      return true
    }
    userId = userOrUserId.id
  } else {
    userId = userOrUserId
  }

  try {
    const supabase = createServiceClient()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_admin, role')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      return false
    }

    return profile.is_admin === true || profile.role === 'admin'
  } catch (error) {
    console.error('Erreur lors de la vérification des droits admin:', error)
    return false
  }
}

/**
 * Vérifie si l'utilisateur connecté est un administrateur.
 * Lance une erreur si l'utilisateur n'est pas authentifié ou n'est pas admin.
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error(MESSAGES.NON_AUTHENTIFIE)
  }

  const isAdminUser = await isAdmin(user)

  if (!isAdminUser) {
    throw new Error(MESSAGES.ACCES_NON_AUTORISE)
  }

  return user
}

/**
 * Helper centralisé pour sécuriser les routes d'API Next.js.
 * Retourne soit un objet avec l'utilisateur, soit une NextResponse 401/403 standardisée.
 */
export async function requireAdminApi(): Promise<
  { user: User; error: null } | { user: null; error: ReturnType<typeof errorResponse> }
> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        user: null,
        error: errorResponse(MESSAGES.NON_AUTHENTIFIE, 401),
      }
    }

    const adminAuthorized = await isAdmin(user)
    if (!adminAuthorized) {
      return {
        user: null,
        error: errorResponse(MESSAGES.ACCES_NON_AUTORISE, 403),
      }
    }

    return { user, error: null }
  } catch (err: any) {
    return {
      user: null,
      error: errorResponse(err.message || 'Erreur d’authentification', 500),
    }
  }
}
