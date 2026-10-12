// lib/auth/oauth.ts
import { supabaseBrowser } from '@/lib/supabaseBrowser'

/**
 * Initie une connexion OAuth avec le provider spécifié.
 * Redirige automatiquement l'utilisateur vers la page d'autorisation du provider.
 *
 * @param provider - Le provider OAuth (actuellement 'google', 'facebook', 'apple', etc.)
 * @param redirectTo - L'URL de redirection après l'authentification (défaut: '/auth/oauth')
 */
export async function signInWithProvider(
  provider: 'google' | 'facebook' | 'apple' | string,
  redirectTo?: string
): Promise<void> {
  const { error } = await supabaseBrowser.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo
        ? `${window.location.origin}${redirectTo}`
        : `${window.location.origin}/auth/oauth`,
      // Pour Google, on peut demander des scopes supplémentaires
      // queryParams: { ... }
    },
  })

  if (error) {
    console.error(`Erreur OAuth ${provider}:`, error.message)
    throw new Error(error.message)
  }
}