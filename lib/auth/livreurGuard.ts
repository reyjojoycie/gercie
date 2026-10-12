// lib/auth/livreurGuard.ts
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'

/**
 * Vérifie que l'utilisateur connecté a bien le rôle "livreur" et est actif.
 * Renvoie l'objet utilisateur si c'est le cas.
 * Lance une erreur si l'utilisateur n'est pas authentifié ou n'a pas le rôle requis.
 */
export async function requireLivreur() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Non authentifié')
  }

  const supabase = await createClient()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    throw new Error('Profil introuvable')
  }

  if (profile.role !== 'livreur') {
    throw new Error('Accès réservé aux livreurs')
  }

  return user
}