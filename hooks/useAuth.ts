// hooks/useAuth.ts
/**
 * Hook d'authentification principal.
 *
 * Ce fichier re-exporte le hook depuis AuthContext pour la compatibilité.
 *
 * Les deux imports fonctionnent :
 *
 *   import { useAuth } from '@/hooks/useAuth'
 *   import { useAuth } from '@/contexts/AuthContext'
 */

export { useAuth, AuthProvider } from '@/contexts/AuthContext'

export type {
  UserProfile,
  ProfileData,
  AuthContextValue,
} from '@/contexts/AuthContext'

// Export par défaut pour compatibilité
export { useAuth as default } from '@/contexts/AuthContext'