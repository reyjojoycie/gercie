// hooks/useSecurity.ts
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface SecurityStatus {
  email_verified: boolean
  phone_verified: boolean
  has_security_question: boolean
  has_2fa: boolean
  last_password_change: string | null
  sessions_count: number
  last_login_at: string | null
  last_login_ip: string | null
  failed_login_attempts: number
  account_locked_until: string | null
}

export type SecurityLevel = 'excellent' | 'good' | 'fair' | 'poor'

export interface SecurityLevelInfo {
  level: SecurityLevel
  score: number
  label: string
  color: string
  bgColor: string
  message: string
  recommendations: string[]
}

export type SecurityLoadState = 'idle' | 'loading' | 'success' | 'error'

interface UseSecurityReturn {
  // Données
  status: SecurityStatus | null
  level: SecurityLevelInfo

  // États
  loadState: SecurityLoadState
  errorMessage: string
  isOnline: boolean
  isRefreshing: boolean

  // Actions
  refreshStatus: (forceRefresh?: boolean) => Promise<void>
  markEmailVerified: () => void
  markPhoneVerified: () => void
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2
const CACHE_KEY = 'security_status_cache'
const CACHE_TTL_MS = 3 * 60 * 1000 // 3 minutes (plus court que profil car sécurité critique)

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Impossible de charger le statut de sécurité.',
  timeout: 'Le chargement prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne.',
  unauthorized: 'Session expirée. Veuillez vous reconnecter.',
  unknown: 'Une erreur est survenue.',
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
interface CachedStatus {
  data: SecurityStatus
  timestamp: number
}

function getCachedStatus(): SecurityStatus | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const parsed: CachedStatus = JSON.parse(cached)
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS

    return isExpired ? null : parsed.data
  } catch {
    return null
  }
}

function setCachedStatus(data: SecurityStatus): void {
  if (typeof window === 'undefined') return
  try {
    const cached: CachedStatus = {
      data,
      timestamp: Date.now(),
    }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Silencieux : le cache est optionnel
  }
}

function clearCachedStatus(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // Silencieux
  }
}

/**
 * Calcule le niveau de sécurité à partir du statut.
 * 
 * Critères (4 au total) :
 * - Email vérifié
 * - Téléphone vérifié
 * - Question secrète configurée
 * - 2FA activé
 */
export function calculateSecurityLevel(status: SecurityStatus | null): SecurityLevelInfo {
  if (!status) {
    return {
      level: 'poor',
      score: 0,
      label: 'Inconnu',
      color: 'text-neutral-500',
      bgColor: 'bg-neutral-100 dark:bg-neutral-800',
      message: 'Impossible d\'évaluer la sécurité du compte.',
      recommendations: [],
    }
  }

  const checks = [
    { passed: status.email_verified, label: 'Email vérifié' },
    { passed: status.phone_verified, label: 'Téléphone vérifié' },
    { passed: status.has_security_question, label: 'Question secrète' },
    { passed: status.has_2fa, label: '2FA activé' },
  ]

  const passedCount = checks.filter((c) => c.passed).length
  const score = (passedCount / checks.length) * 100

  // Recommandations basées sur ce qui manque
  const recommendations: string[] = []
  if (!status.email_verified) recommendations.push('Vérifiez votre adresse email')
  if (!status.phone_verified) recommendations.push('Ajoutez et vérifiez votre téléphone')
  if (!status.has_security_question) recommendations.push('Configurez une question secrète')
  if (!status.has_2fa) recommendations.push('Activez l\'authentification à deux facteurs')
  if (status.sessions_count > 3) {
    recommendations.push('Vérifiez vos sessions actives')
  }
  if (status.failed_login_attempts > 0) {
    recommendations.push('Changez votre mot de passe (tentatives suspectes détectées)')
  }

  // Détermination du niveau
  if (score === 100) {
    return {
      level: 'excellent',
      score,
      label: 'Excellent',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      message: 'Votre compte est parfaitement sécurisé. Continuez ainsi !',
      recommendations: [],
    }
  }
  if (score >= 75) {
    return {
      level: 'good',
      score,
      label: 'Bon',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      message: 'Votre sécurité est bonne, mais peut encore être renforcée.',
      recommendations,
    }
  }
  if (score >= 50) {
    return {
      level: 'fair',
      score,
      label: 'Moyen',
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      message: 'Renforcez votre sécurité pour protéger votre compte.',
      recommendations,
    }
  }
  return {
    level: 'poor',
    score,
    label: 'Faible',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    message: 'Votre compte est vulnérable. Activez les protections recommandées.',
    recommendations,
  }
}

/* ------------------------------------------------------------------ */
/*  Hook principal                                                     */
/* ------------------------------------------------------------------ */
export function useSecurity(): UseSecurityReturn {
  const { user } = useAuth()
  const toast = useToast()

  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [loadState, setLoadState] = useState<SecurityLoadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const hasLoadedRef = useRef(false)

  // Détection hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setErrorMessage(ERROR_MESSAGES.offline)
    }

    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Cleanup des requêtes au démontage
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Fetch avec retry + timeout
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        const response = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeoutId)

        if (response.status >= 500 && retries > 0) {
          await new Promise((r) => setTimeout(r, 1000 * (MAX_RETRIES - retries + 1)))
          return fetchWithRetry(url, options, retries - 1)
        }

        return response
      } catch (err: any) {
        clearTimeout(timeoutId)

        if (retries > 0 && (err.name === 'AbortError' || err.name === 'TypeError')) {
          await new Promise((r) => setTimeout(r, 1000))
          return fetchWithRetry(url, options, retries - 1)
        }

        throw err
      }
    },
    []
  )

  // Rafraîchir le statut de sécurité
  const refreshStatus = useCallback(
    async (forceRefresh = false) => {
      if (!user) {
        setStatus(null)
        setLoadState('idle')
        return
      }

      if (!isOnline) {
        setErrorMessage(ERROR_MESSAGES.offline)
        toast.show({
          type: 'warning',
          message: ERROR_MESSAGES.offline,
          duration: 3000,
        })
        return
      }

      // Annuler les requêtes précédentes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()

      // Essayer le cache d'abord (sauf si refresh forcé)
      if (!forceRefresh) {
        const cached = getCachedStatus()
        if (cached) {
          setStatus(cached)
          setLoadState('success')
          setErrorMessage('')
          // Continuer à rafraîchir en arrière-plan
          setIsRefreshing(true)
        } else {
          setLoadState('loading')
        }
      } else {
        setIsRefreshing(true)
      }

      try {
        const res = await fetchWithRetry('/api/user/security', {
          signal: abortControllerRef.current.signal,
        })

        if (res.status === 401) {
          setLoadState('error')
          setErrorMessage(ERROR_MESSAGES.unauthorized)
          return
        }

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (res.status >= 500) {
            throw new Error(ERROR_MESSAGES.server)
          }
          throw new Error(data.error || ERROR_MESSAGES.unknown)
        }

        // Normaliser les données reçues
        const normalizedStatus: SecurityStatus = {
          email_verified:
            data.email_verified ?? user.email_confirmed_at != null ?? false,
          phone_verified:
            data.phone_verified ?? user.phone_confirmed_at != null ?? false,
          has_security_question: Boolean(data.has_security_question),
          has_2fa: Boolean(data.has_2fa),
          last_password_change: data.last_password_change ?? null,
          sessions_count: typeof data.sessions_count === 'number' ? data.sessions_count : 1,
          last_login_at: data.last_login_at ?? user.last_sign_in_at ?? null,
          last_login_ip: data.last_login_ip ?? null,
          failed_login_attempts: typeof data.failed_login_attempts === 'number' ? data.failed_login_attempts : 0,
          account_locked_until: data.account_locked_until ?? user.banned_until ?? null,
        }

        setStatus(normalizedStatus)
        setCachedStatus(normalizedStatus)
        setLoadState('success')
        setErrorMessage('')
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Requête annulée, on ne modifie pas l'état
          return
        }

        setLoadState('error')

        if (err.message?.includes('timeout') || err.name === 'AbortError') {
          setErrorMessage(ERROR_MESSAGES.timeout)
        } else if (!navigator.onLine || err.name === 'TypeError') {
          setErrorMessage(ERROR_MESSAGES.network)
        } else {
          setErrorMessage(err.message || ERROR_MESSAGES.unknown)
        }

        toast.show({
          type: 'error',
          message: errorMessage || ERROR_MESSAGES.unknown,
          duration: 5000,
        })
      } finally {
        setIsRefreshing(false)
      }
    },
    [user, isOnline, fetchWithRetry, toast, errorMessage]
  )

  // Chargement initial
  useEffect(() => {
    if (user && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      refreshStatus()
    }
  }, [user, refreshStatus])

  // Helpers pour mettre à jour localement après actions
  const markEmailVerified = useCallback(() => {
    setStatus((prev) => {
      if (!prev) return prev
      const updated = { ...prev, email_verified: true }
      setCachedStatus(updated)
      return updated
    })
  }, [])

  const markPhoneVerified = useCallback(() => {
    setStatus((prev) => {
      if (!prev) return prev
      const updated = { ...prev, phone_verified: true }
      setCachedStatus(updated)
      return updated
    })
  }, [])

  // Calcul du niveau de sécurité (mémoïsé via useMemo implicite dans le render)
  const level = calculateSecurityLevel(status)

  return {
    status,
    level,
    loadState,
    errorMessage,
    isOnline,
    isRefreshing,
    refreshStatus,
    markEmailVerified,
    markPhoneVerified,
  }
}

export default useSecurity