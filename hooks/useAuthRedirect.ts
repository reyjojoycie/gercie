// hooks/useAuthRedirect.ts
'use client'

import { useEffect, useMemo, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseAuthRedirectOptions {
  /**
   * Mode de redirection :
   * - 'require-auth' : protège une route privée
   * - 'redirect-if-authenticated' : redirige si déjà connecté (login/register)
   * - 'none' : aucune redirection automatique
   */
  mode: 'require-auth' | 'redirect-if-authenticated' | 'none'

  /**
   * Conservé pour compatibilité ascendante.
   * La règle métier impose toujours l'onboarding.
   */
  requireOnboarding?: boolean

  /**
   * Conservé pour compatibilité ascendante.
   * La règle métier impose toujours la vérification d'au moins un canal.
   */
  requireVerification?: boolean

  /**
   * URL de redirection pour les utilisateurs non connectés.
   * @default '/login'
   */
  loginPath?: string

  /**
   * URL de redirection pour les utilisateurs connectés et valides.
   * @default '/'
   */
  authenticatedPath?: string

  /**
   * Préserver l'URL d'origine dans le paramètre `redirect`.
   * @default true
   */
  preserveRedirect?: boolean
}

interface UseAuthRedirectReturn {
  isAuthenticated: boolean
  isLoading: boolean
  isOnboarded: boolean
  isVerified: boolean
  isRedirecting: boolean
  buildLoginUrl: (path?: string) => string
  getRedirectPath: () => string
  redirectAfterLogin: () => void
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_LOGIN_PATH = '/login'
const DEFAULT_AUTHENTICATED_PATH = '/'
const ONBOARDING_PATH = '/onboarding'
const REDIRECT_PARAM = 'redirect'

/**
 * Chemins autorisés même si l'utilisateur n'a pas encore
 * vérifié au moins un canal.
 *
 * Règle métier :
 * - non vérifié → jamais accueil
 * - non vérifié → onboarding ou pages de vérification/reset
 */
const ALLOWED_UNVERIFIED_PATHS = [
  '/onboarding',
  '/auth/verify-email',
  '/auth/verify-phone',
  '/auth/callback',
  '/auth/reset-password',
  '/login',
  '/register',
]

function isAllowedUnverifiedPath(pathname: string): boolean {
  return ALLOWED_UNVERIFIED_PATHS.some((allowedPath) =>
    pathname.startsWith(allowedPath)
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function buildLoginUrl(
  loginPath: string = DEFAULT_LOGIN_PATH,
  redirectPath?: string
): string {
  if (!redirectPath || redirectPath === '/') {
    return loginPath
  }

  try {
    const encoded = encodeURIComponent(redirectPath)
    return `${loginPath}?${REDIRECT_PARAM}=${encoded}`
  } catch {
    return loginPath
  }
}

/**
 * Nettoie un chemin de redirection pour éviter les Open Redirect.
 */
export function sanitizeRedirectPath(path: string | null): string {
  if (!path) return DEFAULT_AUTHENTICATED_PATH

  let decoded: string

  try {
    decoded = decodeURIComponent(path)
  } catch {
    return DEFAULT_AUTHENTICATED_PATH
  }

  // Rejeter les URLs avec protocole
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) {
    return DEFAULT_AUTHENTICATED_PATH
  }

  // Rejeter les URLs commençant par // ou /\
  if (decoded.startsWith('//') || decoded.startsWith('/\\')) {
    return DEFAULT_AUTHENTICATED_PATH
  }

  // Rejeter les URLs contenant @
  if (decoded.includes('@')) {
    return DEFAULT_AUTHENTICATED_PATH
  }

  // Doit commencer par /
  if (!decoded.startsWith('/')) {
    return DEFAULT_AUTHENTICATED_PATH
  }

  // Normaliser les slashes multiples
  return decoded.replace(/\/+/g, '/')
}

export function getRedirectFromParams(searchParams: URLSearchParams): string {
  const raw = searchParams.get(REDIRECT_PARAM)
  return sanitizeRedirectPath(raw)
}

/* ------------------------------------------------------------------ */
/*  Hook principal                                                     */
/* ------------------------------------------------------------------ */

export function useAuthRedirect(
  options: UseAuthRedirectOptions
): UseAuthRedirectReturn {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { user, loading, isOnboarded, isVerified } = useAuth()

  const isAuthenticated = Boolean(user)

  const {
    mode,
    loginPath = DEFAULT_LOGIN_PATH,
    authenticatedPath = DEFAULT_AUTHENTICATED_PATH,
    preserveRedirect = true,
  } = options

  /* ---------------------------------------------------------------- */
  /*  Chemin de redirection demandé dans l'URL                         */
  /* ---------------------------------------------------------------- */

  const redirectPath = useMemo(() => {
    return getRedirectFromParams(searchParams)
  }, [searchParams])

  /* ---------------------------------------------------------------- */
  /*  URL de login avec redirect                                       */
  /* ---------------------------------------------------------------- */

  const currentLoginUrl = useMemo(() => {
    if (!preserveRedirect) return loginPath

    const isAuthPage =
      pathname.startsWith(loginPath) || pathname.startsWith('/register')

    const targetPath = isAuthPage ? undefined : pathname

    return buildLoginUrl(loginPath, targetPath)
  }, [preserveRedirect, loginPath, pathname])

  /* ---------------------------------------------------------------- */
  /*  URL de destination après connexion                               */
  /* ------------------------------------------------------------------ */

  const destinationUrl = useMemo(() => {
    if (!isAuthenticated) {
      return loginPath
    }

    // Règle métier :
    // Pour accéder à l'accueil, il faut :
    // 1. au moins un canal vérifié
    // 2. onboarding terminé
    if (!isVerified || !isOnboarded) {
      return ONBOARDING_PATH
    }

    if (preserveRedirect && redirectPath !== DEFAULT_AUTHENTICATED_PATH) {
      return redirectPath
    }

    return authenticatedPath
  }, [
    isAuthenticated,
    isVerified,
    isOnboarded,
    preserveRedirect,
    redirectPath,
    loginPath,
    authenticatedPath,
  ])

  /* ---------------------------------------------------------------- */
  /*  Redirection automatique                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (loading) return
    if (mode === 'none') return

    // Route protégée, utilisateur non connecté
    if (mode === 'require-auth' && !isAuthenticated) {
      router.replace(currentLoginUrl)
      return
    }

    // Page login/register, utilisateur déjà connecté
    if (mode === 'redirect-if-authenticated' && isAuthenticated) {
      router.replace(destinationUrl)
      return
    }

    // Route protégée, utilisateur connecté
    if (mode === 'require-auth' && isAuthenticated) {
      // Non vérifié ou onboarding incomplet → /onboarding
      if (!isVerified || !isOnboarded) {
        if (!isAllowedUnverifiedPath(pathname)) {
          router.replace(ONBOARDING_PATH)
          return
        }
      }

      // Vérifié + onboarding terminé, mais encore sur onboarding → destination
      if (isVerified && isOnboarded && pathname.startsWith(ONBOARDING_PATH)) {
        router.replace(destinationUrl)
        return
      }
    }
  }, [
    loading,
    mode,
    isAuthenticated,
    isVerified,
    isOnboarded,
    pathname,
    currentLoginUrl,
    destinationUrl,
    router,
  ])

  /* ---------------------------------------------------------------- */
  /*  Helpers exposés                                                  */
  /* ---------------------------------------------------------------- */

  const buildLoginUrlWithRedirect = useCallback(
    (path?: string): string => {
      return buildLoginUrl(loginPath, path || pathname)
    },
    [loginPath, pathname]
  )

  const getRedirectPath = useCallback((): string => {
    return destinationUrl
  }, [destinationUrl])

  const redirectAfterLogin = useCallback(() => {
    router.push(destinationUrl)
  }, [router, destinationUrl])

  const isRedirecting = useMemo(() => {
    if (loading) return false

    if (mode === 'require-auth' && !isAuthenticated) {
      return true
    }

    if (mode === 'redirect-if-authenticated' && isAuthenticated) {
      return true
    }

    if (mode === 'require-auth' && isAuthenticated) {
      if (!isVerified || !isOnboarded) {
        if (!isAllowedUnverifiedPath(pathname)) {
          return true
        }
      }

      if (isVerified && isOnboarded && pathname.startsWith(ONBOARDING_PATH)) {
        return true
      }
    }

    return false
  }, [
    loading,
    mode,
    isAuthenticated,
    isVerified,
    isOnboarded,
    pathname,
  ])

  return {
    isAuthenticated,
    isLoading: loading,
    isOnboarded,
    isVerified,
    isRedirecting,
    buildLoginUrl: buildLoginUrlWithRedirect,
    getRedirectPath,
    redirectAfterLogin,
  }
}

/* ------------------------------------------------------------------ */
/*  Hooks utilitaires                                                  */
/* ------------------------------------------------------------------ */

export function useRequireAuth(options?: Partial<UseAuthRedirectOptions>) {
  return useAuthRedirect({
    mode: 'require-auth',
    ...options,
  })
}

export function useRedirectIfAuthenticated(
  options?: Partial<UseAuthRedirectOptions>
) {
  return useAuthRedirect({
    mode: 'redirect-if-authenticated',
    ...options,
  })
}

export function useAuthState() {
  return useAuthRedirect({ mode: 'none' })
}

export default useAuthRedirect