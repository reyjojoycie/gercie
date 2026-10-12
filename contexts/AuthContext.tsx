// contexts/AuthContext.tsx
'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react'

import { supabaseBrowser } from '@/lib/supabaseBrowser'
import type { User } from '@supabase/supabase-js'

/* ------------------------------------------------------------------ */
/*  Types publics                                                      */
/* ------------------------------------------------------------------ */

export interface UserProfile {
  id: string
  email?: string | null
  nom?: string | null
  prenom?: string | null
  avatar_url?: string | null
  type_user?: string | null
  role?: string | null
  is_admin?: boolean
  is_livreur?: boolean
  email_verified?: boolean
  phone_verified?: boolean
  onboarding_completed?: boolean
  est_actif?: boolean
  preferences?: Record<string, unknown>
}

export interface ProfileData {
  is_admin: boolean
  is_livreur: boolean

  // ✅ Règle métier :
  // isVerified = au moins un canal vérifié (email OU téléphone)
  is_verified: boolean
  has_verified_channel: boolean

  email_verified: boolean
  phone_verified: boolean

  is_onboarded: boolean
  onboarding_completed: boolean

  est_actif: boolean
}

export interface AuthContextValue {
  user: User | null
  loading: boolean
  logout: () => Promise<void>

  isAdmin: boolean
  isLivreur: boolean
  rolesLoading: boolean
  refreshRoles: () => Promise<void>

  // Compatibilité existante
  isVerified: boolean
  isOnboarded: boolean

  // Nouvelles règles métier
  hasVerifiedChannel: boolean
  emailVerified: boolean
  phoneVerified: boolean
  isActive: boolean

  profile: ProfileData | null
  error: string | null
  clearError: () => void
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const PROFILE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const REQUEST_TIMEOUT = 10000 // 10 secondes
const MAX_RETRIES = 2
const RETRY_DELAY = 1000 // 1 seconde

/* ------------------------------------------------------------------ */
/*  Contexte                                                           */
/* ------------------------------------------------------------------ */

const AuthContext = createContext<AuthContextValue | null>(null)

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Erreur inconnue'
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const [isAdmin, setIsAdmin] = useState(false)
  const [isLivreur, setIsLivreur] = useState(false)

  const [emailVerified, setEmailVerified] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [hasVerifiedChannel, setHasVerifiedChannel] = useState(false)

  const [isOnboarded, setIsOnboarded] = useState(false)
  const [isActive, setIsActive] = useState(true)

  const [rolesLoading, setRolesLoading] = useState(false)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const userRef = useRef<User | null>(null)
  const profileCacheRef = useRef<
    Map<string, { data: ProfileData; timestamp: number }>
  >(new Map())
  const fetchInProgressRef = useRef<Map<string, Promise<void>>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)

  /* ---------------------------------------------------------------- */
  /*  Reset                                                            */
  /* ---------------------------------------------------------------- */

  const resetAuthState = useCallback(() => {
    userRef.current = null
    setUser(null)

    setIsAdmin(false)
    setIsLivreur(false)

    setEmailVerified(false)
    setPhoneVerified(false)
    setHasVerifiedChannel(false)

    setIsOnboarded(false)
    setIsActive(true)

    setProfile(null)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Fetch profil + livreur                                           */
  /* ------------------------------------------------------------------ */

  const fetchProfileData = useCallback(
    async (userId: string, force = false) => {
      if (!userId) return

      // Cache
      if (!force) {
        const cached = profileCacheRef.current.get(userId)

        if (cached && Date.now() - cached.timestamp < PROFILE_CACHE_TTL) {
          const data = cached.data

          setIsAdmin(data.is_admin)
          setIsLivreur(data.is_livreur)

          setEmailVerified(data.email_verified)
          setPhoneVerified(data.phone_verified)
          setHasVerifiedChannel(data.has_verified_channel)

          setIsOnboarded(data.is_onboarded)
          setIsActive(data.est_actif)

          setProfile(data)

          return
        }
      }

      // Déduplication
      if (fetchInProgressRef.current.has(userId)) {
        return fetchInProgressRef.current.get(userId)
      }

      const fetchPromise = (async () => {
        setRolesLoading(true)
        setError(null)

        // Annuler la requête précédente
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }

        const controller = new AbortController()
        abortControllerRef.current = controller

        const timeoutId = setTimeout(() => {
          controller.abort()
        }, REQUEST_TIMEOUT)

        let attempts = 0
        let lastError: unknown = null

        while (attempts <= MAX_RETRIES) {
          try {
            const [profileResult, livreurResult] = await Promise.all([
              supabaseBrowser
                .from('profiles')
                .select(
                  'is_admin, email_verified, phone_verified, onboarding_completed, est_actif'
                )
                .eq('id', userId)
                .maybeSingle()
                .abortSignal(controller.signal),

              supabaseBrowser
                .from('livreurs')
                .select('id')
                .eq('id', userId)
                .maybeSingle()
                .abortSignal(controller.signal),
            ])

            const profileError = profileResult.error
            const profileData = profileResult.data

            // Erreur profil : on distingue erreur permanente / erreur réseau
            if (profileError) {
              const message =
                profileError.message?.toLowerCase() || ''

              const isRlsOrPermissionError =
                profileError.code === '42501' ||
                profileError.code === 'PGRST116' ||
                message.includes('permission') ||
                message.includes('rls') ||
                message.includes('row-level security')

              if (!isRlsOrPermissionError) {
                throw profileError
              }

              // Si RLS ou permission, on continue avec valeurs par défaut.
              console.warn(
                '[AUTH] Profile access limited by RLS, using safe defaults.'
              )
            }

            // Erreur livreur : non bloquant
            if (livreurResult.error) {
              console.warn(
                '[AUTH] Livreur lookup failed (non-blocking):',
                livreurResult.error.message
              )
            }

            const email_verified = profileData?.email_verified === true
            const phone_verified = profileData?.phone_verified === true
            const has_verified_channel = email_verified || phone_verified

            const data: ProfileData = {
              is_admin: profileData?.is_admin === true,
              is_livreur: Boolean(livreurResult.data?.id),

              is_verified: has_verified_channel,
              has_verified_channel,

              email_verified,
              phone_verified,

              is_onboarded: profileData?.onboarding_completed === true,
              onboarding_completed: profileData?.onboarding_completed === true,

              est_actif: profileData?.est_actif !== false,
            }

            setIsAdmin(data.is_admin)
            setIsLivreur(data.is_livreur)

            setEmailVerified(data.email_verified)
            setPhoneVerified(data.phone_verified)
            setHasVerifiedChannel(data.has_verified_channel)

            setIsOnboarded(data.is_onboarded)
            setIsActive(data.est_actif)

            setProfile(data)

            profileCacheRef.current.set(userId, {
              data,
              timestamp: Date.now(),
            })

            // Succès
            lastError = null
            break
          } catch (err) {
            lastError = err

            // Si abort, on arrête sans retry
            if (controller.signal.aborted) {
              break
            }

            attempts += 1

            if (attempts <= MAX_RETRIES) {
              await sleep(RETRY_DELAY * Math.pow(2, attempts - 1))
            }
          }
        }

        clearTimeout(timeoutId)

        if (lastError && attempts > MAX_RETRIES) {
          console.error('[AUTH] Profile fetch failed:', lastError)

          // Message propre, pas de [object Object]
          setError('Impossible de charger les informations du profil.')

          // Valeurs sûres par défaut
          setIsAdmin(false)
          setIsLivreur(false)

          setEmailVerified(false)
          setPhoneVerified(false)
          setHasVerifiedChannel(false)

          setIsOnboarded(false)
          setIsActive(true)

          setProfile(null)
        }

        setRolesLoading(false)
        fetchInProgressRef.current.delete(userId)
      })()

      fetchInProgressRef.current.set(userId, fetchPromise)

      return fetchPromise
    },
    []
  )

  /* ---------------------------------------------------------------- */
  /*  Session initiale + écoute Supabase                               */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let mounted = true

    const handleSession = (session: any) => {
      if (!mounted) return

      const currentUser = session?.user ?? null
      const previousUser = userRef.current

      if (previousUser?.id !== currentUser?.id) {
        userRef.current = currentUser
        setUser(currentUser)

        if (currentUser) {
          fetchProfileData(currentUser.id)
        } else {
          resetAuthState()
        }
      }

      setLoading(false)
    }

    // Session initiale
    supabaseBrowser.auth
      .getSession()
      .then(({ data }) => {
        handleSession(data.session)
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })

    // Écoute des changements de session
    const { data: listener } = supabaseBrowser.auth.onAuthStateChange(
      (_event, session) => {
        handleSession(session)
      }
    )

    return () => {
      mounted = false

      listener?.subscription.unsubscribe()

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchProfileData, resetAuthState])

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ------------------------------------------------------------------ */

  const logout = useCallback(async () => {
    try {
      setError(null)

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      profileCacheRef.current.clear()
      fetchInProgressRef.current.clear()

      await supabaseBrowser.auth.signOut()

      resetAuthState()
    } catch (err) {
      console.error('[AUTH] Logout error:', err)

      // Même en cas d'erreur réseau, on nettoie l'état local
      // pour éviter de rester bloqué avec une session fantôme.
      resetAuthState()

      setError('Erreur lors de la déconnexion.')
    }
  }, [resetAuthState])

  const refreshRoles = useCallback(async () => {
    if (user?.id) {
      profileCacheRef.current.delete(user.id)
      await fetchProfileData(user.id, true)
    }
  }, [user, fetchProfileData])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Valeur du contexte                                               */
  /* ------------------------------------------------------------------ */

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      loading,
      logout,

      isAdmin,
      isLivreur,
      rolesLoading,
      refreshRoles,

      // Compatibilité existante
      isVerified: hasVerifiedChannel,
      isOnboarded,

      // Nouvelles règles métier
      hasVerifiedChannel,
      emailVerified,
      phoneVerified,
      isActive,

      profile,
      error,
      clearError,
    }
  }, [
    user,
    loading,
    logout,
    isAdmin,
    isLivreur,
    rolesLoading,
    refreshRoles,
    hasVerifiedChannel,
    isOnboarded,
    emailVerified,
    phoneVerified,
    isActive,
    profile,
    error,
    clearError,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)

  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>')
  }

  return ctx
}