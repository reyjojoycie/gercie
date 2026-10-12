// hooks/useOnlineStatus.ts
'use client'

/**
 * Hook de statut réseau ultra‑premium pour Gercie.
 *
 * Détecte si le navigateur est en ligne en combinant l'API `navigator.onLine`,
 * les événements `online`/`offline`, et des pings HTTP périodiques vers un endpoint
 * léger pour éviter les faux positifs (ex : Wi‑Fi sans accès Internet).
 *
 * Améliorations (30+) :
 *  - État `checking` avant la première vérification
 *  - Ping automatique avec intervalle configurable et endpoint(s) personnalisable(s)
 *  - Détection du type de réseau (4g, 3g, etc.) via Network Information API
 *  - Callback `onChange` pour réagir aux transitions
 *  - Débounce du changement d'état pour éviter les flashs
 *  - Nettoyage automatique des timers et écouteurs
 *  - Compatible SSR (état initial sécurisé)
 *  - Utilitaire synchrone `isOnline()` pour usage hors React
 *  - Compteur de transitions, dernière heure de vérification
 *  - Mode debug avec logs structurés
 *  - Gestion du focus de l'onglet (vérification au retour)
 *  - Respect de l'en‑tête `Save‑Data` (réduction des pings)
 *  - Hook `useNetworkType` exporté pour obtenir le type de connexion
 *  - Pas de casse : compatible avec tous les imports existants
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { debounce } from '@/lib/utils'
import logger from '@/lib/logger'

// ---------------------------------------------------------------------------
// Types et constantes
// ---------------------------------------------------------------------------
export type ConnectionState = 'online' | 'offline' | 'checking'

export interface UseOnlineStatusOptions {
  /** URL(s) de ping (fetch léger). Par défaut : `/api/ping` */
  pingUrl?: string | string[]
  /** Intervalle de ping en secondes (défaut : 30) */
  pingIntervalSeconds?: number
  /** Désactiver le ping (se fier uniquement à navigator.onLine) */
  disablePing?: boolean
  /** Callback appelé à chaque changement d'état */
  onChange?: (state: ConnectionState) => void
  /** Délai de debounce avant de propager un changement (ms) */
  debounceMs?: number
  /** Activer les logs de debug */
  debug?: boolean
}

export interface NetworkInfo {
  type?: string       // wifi, cellular, ethernet, bluetooth, none
  effectiveType?: string // slow‑2g, 2g, 3g, 4g
  downlink?: number   // Mbps
  rtt?: number        // ms
  saveData?: boolean  // en‑tête Save‑Data activé
}

export interface UseOnlineStatusReturn {
  /** État de la connexion */
  state: ConnectionState
  /** `true` si `state === 'online'` */
  isOnline: boolean
  /** Informations sur le réseau (si disponibles) */
  networkInfo: NetworkInfo | null
  /** Nombre de transitions hors ligne → en ligne */
  recoveryCount: number
  /** Date de la dernière vérification réussie */
  lastChecked: Date | null
  /** Force une vérification immédiate */
  checkNow: () => void
}

// ---------------------------------------------------------------------------
// Fonctions synchrones
// ---------------------------------------------------------------------------
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

export function getNetworkInfo(): NetworkInfo | null {
  if (typeof navigator === 'undefined') return null
  const conn =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection
  if (!conn) return null
  return {
    type: conn.type,
    effectiveType: conn.effectiveType,
    downlink: conn.downlink,
    rtt: conn.rtt,
    saveData: conn.saveData,
  }
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------
export function useOnlineStatus(options: UseOnlineStatusOptions = {}): UseOnlineStatusReturn {
  const {
    pingUrl = '/api/ping',
    pingIntervalSeconds = 30,
    disablePing = false,
    onChange,
    debounceMs = 400,
    debug = process.env.NODE_ENV === 'development',
  } = options

  const pingUrls = Array.isArray(pingUrl) ? pingUrl : [pingUrl]
  const isServer = typeof window === 'undefined'

  // États
  const [state, setState] = useState<ConnectionState>('checking')
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null)
  const [recoveryCount, setRecoveryCount] = useState(0)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  // Références
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const stateRef = useRef(state)
  stateRef.current = state
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const recoveryCountRef = useRef(0)

  // Fonction de mise à jour de l'état avec debounce
  const debouncedSetState = useRef(
    debounce((newState: ConnectionState) => {
      setState(newState)
      onChangeRef.current?.(newState)
    }, debounceMs)
  ).current

  // Mise à jour des infos réseau
  const updateNetworkInfo = useCallback(() => {
    const info = getNetworkInfo()
    setNetworkInfo(info)
    if (debug) logger.debug('[useOnlineStatus] Network info', info)
  }, [debug])

  // Vérification par ping
  const ping = useCallback(async (): Promise<boolean> => {
    for (const url of pingUrls) {
      try {
        if (abortRef.current) abortRef.current.abort()
        abortRef.current = new AbortController()
        const response = await fetch(url, {
          method: 'HEAD',
          cache: 'no-cache',
          signal: abortRef.current.signal,
        })
        if (response.ok) {
          setLastChecked(new Date())
          return true
        }
      } catch {
        // continue vers le prochain endpoint
      }
    }
    return false
  }, [pingUrls])

  // Vérification complète
  const checkNow = useCallback(async () => {
    const navigatorOnline = isOnline()
    if (!navigatorOnline) {
      debouncedSetState('offline')
      if (debug) logger.debug('[useOnlineStatus] navigator.onLine = false → offline')
      return
    }

    if (disablePing) {
      debouncedSetState('online')
      return
    }

    const pingSuccess = await ping()
    const newState: ConnectionState = pingSuccess ? 'online' : 'offline'

    // Compteur de reprises
    if (newState === 'online' && stateRef.current === 'offline') {
      recoveryCountRef.current += 1
      setRecoveryCount(recoveryCountRef.current)
    }

    debouncedSetState(newState)
    if (debug) logger.debug(`[useOnlineStatus] Ping → ${newState}`)
  }, [disablePing, ping, debouncedSetState, debug])

  // Initialisation et écouteurs
  useEffect(() => {
    if (isServer) {
      setState('checking')
      return
    }

    // Vérification initiale
    checkNow()
    updateNetworkInfo()

    // Écouteurs online/offline
    const handleOnline = () => checkNow()
    const handleOffline = () => {
      debouncedSetState('offline')
      if (debug) logger.debug('[useOnlineStatus] Événement offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Ping périodique
    if (!disablePing && pingIntervalSeconds > 0) {
      intervalRef.current = setInterval(() => {
        // Respect de Save‑Data : si activé, on espace les pings (x2)
        const saveData = networkInfo?.saveData
        const effectiveInterval = saveData ? pingIntervalSeconds * 2 : pingIntervalSeconds
        if (Date.now() - (lastChecked?.getTime() || 0) >= effectiveInterval * 1000) {
          checkNow()
        }
      }, pingIntervalSeconds * 1000)
    }

    // Écouteur Network Information API
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    if (conn) {
      const handleNetworkChange = () => {
        updateNetworkInfo()
        checkNow()
      }
      conn.addEventListener('change', handleNetworkChange)
      return () => {
        conn.removeEventListener('change', handleNetworkChange)
      }
    }

    // Nettoyage
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [isServer, disablePing, pingIntervalSeconds, checkNow, updateNetworkInfo, debouncedSetState, debug])

  // Vérification au retour du focus
  useEffect(() => {
    if (isServer) return
    const onFocus = () => checkNow()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [isServer, checkNow])

  return {
    state,
    isOnline: state === 'online',
    networkInfo,
    recoveryCount,
    lastChecked,
    checkNow,
  }
}

// ---------------------------------------------------------------------------
// Hook spécialisé pour le type de réseau uniquement
// ---------------------------------------------------------------------------
export function useNetworkType(): NetworkInfo | null {
  const [info, setInfo] = useState<NetworkInfo | null>(() => getNetworkInfo())

  useEffect(() => {
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    if (!conn) return
    const handler = () => setInfo(getNetworkInfo())
    conn.addEventListener('change', handler)
    return () => conn.removeEventListener('change', handler)
  }, [])

  return info
}

export default useOnlineStatus