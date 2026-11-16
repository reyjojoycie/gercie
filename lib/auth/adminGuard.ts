// lib/auth/adminGuard.ts
import { createClient } from '@/lib/supabaseServer'
import { MESSAGES } from '@/lib/constants'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Fonction interne pour vérifier si un utilisateur est administrateur.
 * Vérifie les métadonnées de l'utilisateur et la table 'profiles'.
 * @param user L'objet utilisateur Supabase.
 * @param supabase Le client Supabase (doit respecter les RLS).
 * @returns true si l'utilisateur est admin, false sinon.
 */
async function _isUserAdmin(user: User, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  // Vérifier d'abord les métadonnées de l'utilisateur
  if (
    user.app_metadata?.is_admin === true ||
    user.user_metadata?.is_admin === true ||
    user.app_metadata?.role === 'admin' || // Pour compatibilité
    user.user_metadata?.role === 'admin'   // Pour compatibilité
  ) {
    return true
  }

  // Ensuite, vérifier la colonne is_admin dans la table public.profiles
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_admin, role') // Sélectionne également 'role' pour compatibilité
    .eq('id', user.id)
    .single()

  if (error) {
    // Log l'erreur pour débogage, mais ne pas la divulguer à l'utilisateur.
    // Par sécurité, si la requête échoue, on considère l'utilisateur comme non-admin.
    console.error('Erreur lors de la récupération du profil pour vérification admin:', error.message)
    return false
  }

  // Si le profil existe et 'is_admin' est vrai, ou 'role' est 'admin'
  if (profile?.is_admin === true || profile?.role === 'admin') {
    return true
  }

  return false
}

/**
 * Vérifie si l'utilisateur connecté est un administrateur.
 * Lance une erreur si l'utilisateur n'est pas authentifié ou n'est pas admin.
 * @returns L'objet utilisateur si l'authentification et les droits sont valides.
 * @throws {Error} Si l'utilisateur n'est pas authentifié ou n'a pas les droits d'admin.
 */
export async function requireAdmin(): Promise<User> {
  // createClient() par défaut n'utilise PAS le rôle de service, donc respecte les RLS.
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error(MESSAGES.NON_AUTHENTIFIE)
  }

  const isAdminUser = await _isUserAdmin(user, supabase)

  if (!isAdminUser) {
    throw new Error(MESSAGES.ACCES_NON_AUTORISE)
  }

  return user
}
