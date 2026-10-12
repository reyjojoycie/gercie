// lib/auth/sessionManager.ts
import { createClient } from '@/lib/supabaseServer'

/**
 * Liste toutes les sessions d'un utilisateur (nécessite la service_role key).
 * À utiliser uniquement côté serveur.
 *
 * @param userId - L'UUID de l'utilisateur
 * @returns Tableau de sessions (id, ip, user_agent, etc.)
 */
export async function listUserSessions(userId: string) {
  const supabase = await createClient(true) // admin client
  const { data, error } = await supabase.auth.admin.listUserSessions(userId)
  if (error) {
    console.error('Erreur lors de la récupération des sessions:', error.message)
    throw new Error('Impossible de récupérer les sessions')
  }
  return data.sessions
}

/**
 * Révoque une session spécifique.
 * À utiliser uniquement côté serveur.
 *
 * @param sessionId - L'identifiant de la session à révoquer
 */
export async function revokeSession(sessionId: string): Promise<void> {
  const supabase = await createClient(true)
  const { error } = await supabase.auth.admin.revokeSession(sessionId)
  if (error) {
    console.error('Erreur lors de la révocation de session:', error.message)
    throw new Error('Impossible de révoquer la session')
  }
}