// lib/auth/adminGuard.ts
import { createClient } from '@/lib/supabaseServer'

export async function requireAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Non authentifié')
  }

  // Vérifier d'abord les métadonnées (si configurées)
  if (
    user.app_metadata?.is_admin === true ||
    user.user_metadata?.is_admin === true ||
    user.app_metadata?.role === 'admin' ||
    user.user_metadata?.role === 'admin'
  ) {
    return user
  }

  // Vérifier la colonne is_admin dans la table profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, role')
    .eq('id', user.id)
    .single()

  // Si la colonne is_admin existe et est true, c'est un admin
  if (profile?.is_admin === true) {
    return user
  }

  // Fallback si l'ancienne colonne role est utilisée pour admin
  if (profile?.role === 'admin') {
    return user
  }

  throw new Error('Accès refusé : administrateur requis')
}