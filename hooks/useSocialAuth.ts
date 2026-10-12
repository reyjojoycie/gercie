// hooks/useSocialAuth.ts
'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import type { Provider } from '@supabase/supabase-js'

type OAuthProvider = Provider

interface SocialAuthState {
  loading: boolean
  error: string | null
  provider: OAuthProvider | null
  attempts: number
}

interface SocialAuthOptions {
  redirectTo?: string
  scopes?: string
  queryParams?: Record<string, string>
  silent?: boolean // Mode silencieux pour réseaux très lents
}

const OAUTH_TIMEOUT = 30000 // 30 secondes pour les réseaux lents
const MAX_RETRIES = 2
const STORAGE_KEY = 'oauth_pending_provider'

// Messages d'erreur localisés en français
const ERROR_MESSAGES = {
  network: 'Connexion instable. Vérifiez votre réseau et réessayez.',
  timeout: 'La connexion prend trop de temps. Réessayez.',
  popup_blocked: 'Fenêtre popup bloquée. Autorisez les popups pour ce site.',
  cancelled: 'Connexion annulée.',
  unknown: 'Une erreur est survenue. Réessayez plus tard.',
  already_signed_in: 'Vous êtes déjà connecté.',
  invalid_provider: 'Fournisseur de connexion non valide.',
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  provider_unavailable: 'Ce fournisseur de connexion est temporairement indisponible.',
}

export function useSocialAuth() {
  const [state, setState] = useState<SocialAuthState>({
    loading: false,
    error: null,
    provider: null,
    attempts: 0,
  })

  const [isOnline, setIsOnline] = useState(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Détection hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setState(prev => ({ ...prev, error: ERROR_MESSAGES.offline }))
    }

    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Vérifier si une session existe déjà et nettoyer l'état pending
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession()
      if (session) {
        setState(prev => ({ ...prev, error: null, loading: false }))
        // Nettoyer le provider pending si connexion réussie
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY)
        }
      }
    }
    checkSession()
  }, [])

  // Cleanup des requêtes au démontage
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const signInWithOAuth = useCallback(async (
    provider: OAuthProvider,
    options: SocialAuthOptions = {}
  ) => {
    // Validation du provider
    const validProviders: OAuthProvider[] = ['google', 'facebook', 'apple', 'github', 'twitter']
    if (!validProviders.includes(provider)) {
      setState(prev => ({ ...prev, error: ERROR_MESSAGES.invalid_provider }))
      return { success: false, error: ERROR_MESSAGES.invalid_provider }
    }

    // Vérifier si hors ligne
    if (!isOnline) {
      setState(prev => ({ ...prev, error: ERROR_MESSAGES.offline }))
      return { success: false, error: ERROR_MESSAGES.offline }
    }

    // Vérifier si déjà connecté
    const { data: { session } } = await supabaseBrowser.auth.getSession()
    if (session) {
      setState(prev => ({ ...prev, error: ERROR_MESSAGES.already_signed_in }))
      return { success: false, error: ERROR_MESSAGES.already_signed_in }
    }

    setState({ loading: true, error: null, provider, attempts: 0 })

    // Sauvegarder le provider pending (utile si refresh pendant OAuth)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, provider)
    }

    const { redirectTo, scopes, queryParams, silent = false } = options
    const callbackUrl = redirectTo || `${window.location.origin}/auth/callback`

    // Retry logic pour les réseaux instables
    let attempts = 0
    while (attempts <= MAX_RETRIES) {
      setState(prev => ({ ...prev, attempts }))

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), OAUTH_TIMEOUT)
        )

        const signInPromise = supabaseBrowser.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: callbackUrl,
            scopes,
            queryParams,
            skipBrowserRedirect: silent, // Ne pas rediriger automatiquement en mode silencieux
          },
        })

        const { data, error } = await Promise.race([signInPromise, timeoutPromise])

        if (error) {
          // Erreurs spécifiques à gérer
          if (error.message.includes('popup')) {
            setState({ loading: false, error: ERROR_MESSAGES.popup_blocked, provider, attempts })
            return { success: false, error: ERROR_MESSAGES.popup_blocked }
          }
          
          // Erreur de provider indisponible
          if (error.message.includes('provider') || error.message.includes('disabled')) {
            setState({ loading: false, error: ERROR_MESSAGES.provider_unavailable, provider, attempts })
            return { success: false, error: ERROR_MESSAGES.provider_unavailable }
          }

          throw error
        }

        // Succès - le navigateur va rediriger (sauf en mode silencieux)
        if (!silent && data?.url) {
          window.location.href = data.url
        }

        return { success: true, url: data?.url }
      } catch (err: any) {
        attempts++

        // Détecter les erreurs réseau
        const isNetworkError = 
          !navigator.onLine ||
          err.message?.includes('Failed to fetch') ||
          err.message?.includes('NetworkError') ||
          err.message?.includes('timeout') ||
          err.name === 'AbortError'

        if (isNetworkError && attempts <= MAX_RETRIES) {
          // Backoff exponentiel : 1s, 2s, 4s
          const backoffDelay = Math.min(1000 * Math.pow(2, attempts - 1), 5000)
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
          continue
        }

        // Erreur finale
        const errorMessage = err.message === 'timeout'
          ? ERROR_MESSAGES.timeout
          : !navigator.onLine
          ? ERROR_MESSAGES.offline
          : isNetworkError
          ? ERROR_MESSAGES.network
          : err.message?.includes('cancelled')
          ? ERROR_MESSAGES.cancelled
          : ERROR_MESSAGES.unknown

        setState({ loading: false, error: errorMessage, provider, attempts })
        
        // Nettoyer le provider pending en cas d'erreur
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY)
        }

        return { success: false, error: errorMessage }
      }
    }

    return { success: false, error: ERROR_MESSAGES.network }
  }, [isOnline])

  // Méthodes spécifiques pour chaque provider (API compatible)
  const signInWithGoogle = useCallback((options?: SocialAuthOptions) => {
    return signInWithOAuth('google', options)
  }, [signInWithOAuth])

  const signInWithFacebook = useCallback((options?: SocialAuthOptions) => {
    return signInWithOAuth('facebook', options)
  }, [signInWithOAuth])

  const signInWithApple = useCallback((options?: SocialAuthOptions) => {
    return signInWithOAuth('apple', options)
  }, [signInWithOAuth])

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  // Récupérer le provider pending (utile après refresh)
  const getPendingProvider = useCallback((): OAuthProvider | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(STORAGE_KEY) as OAuthProvider | null
  }, [])

  // Nettoyer l'état pending
  const clearPendingProvider = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  return {
    signInWithOAuth,
    signInWithGoogle,
    signInWithFacebook,
    signInWithApple,
    loading: state.loading,
    error: state.error,
    provider: state.provider,
    attempts: state.attempts,
    isOnline,
    clearError,
    getPendingProvider,
    clearPendingProvider,
  }
}

export default useSocialAuth