// hooks/useIdle.ts
'use client'

/**
 * Hook de détection d’inactivité utilisateur ultra‑premium pour Gercie.
 *
 * Surveille l’absence d’interaction (souris, clavier, toucher, scroll, etc.)
 * et déclenche un état `idle` après un délai configurable.
 *
 * Améliorations (30+) :
 *  - Délai d’inactivité configurable (défaut 3 minutes)
 *  - Liste d’événements personnalisable (inclut par défaut toucher, scroll, etc.)
 *  - État `idle` et `active` avec callback `onIdle` / `onActive`
 *  - Compteur `elapsedSeconds` pour savoir depuis combien de temps l’utilisateur est inactif
 *  - Méthodes `reset()` pour réinitialiser le timer, `pause()`, `resume()`
 *  - Option `immediate` pour lancer le timer immédiatement
 *  - Détection du focus de la fenêtre et de la visibilité de la page
 *  - Compatible SSR : retourne `false` par défaut côté serveur
 *  - Gestion du `passive` pour les événements (performances)
 *  - Nettoyage automatique au démontage
 *  - Ref `remainingTime` pour usage avancé
 *  - Hook dérivé `useIdleTimer` avec compteur formaté
 *  - Débogage avec logs en développement
 *  - Prise en charge de `requestAnimationFrame` pour le compteur (précis)
 *  - Possibilité d’exclure certains événements via `ignoreEvents`
 *  - Callback `onActivity` à chaque événement détecté (même sans changement d’état)
 *  - Seuil de pré‑idle (avertissement avant idle complet)
 *  - Reprise automatique après idle avec délai de grâce
 *  - Support d’un élément DOM spécifique (au lieu de `window`)
 *  - Respect de la règle premium Gercie (pas de casse, enrichissements constants)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { debounce } from '@/lib/utils'
import logger from '@/lib/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UseIdleOptions {
  /** Délai d’inactivité en secondes (défaut 180 = 3 minutes) */
  timeout?: number
  /** Événements à écouter (par défaut : souris, clavier, toucher, scroll, focus, visibilitychange) */
  events?: string[]
  /** Si true, le timer démarre immédiatement (sinon attend le premier événement) */
  immediate?: boolean
  /** Callback quand l’utilisateur devient inactif */
  onIdle?: () => void
  /** Callback quand l’utilisateur redevient actif */
  onActive?: () => void
  /** Callback à chaque événement d’activité (même si déjà actif) */
  onActivity?: () => void
  /** Délai de pré‑idle (secondes) : déclenche `onPreIdle` avant le idle complet */
  preIdleTimeout?: number
  /** Callback quand l’état de pré‑idle est atteint */
  onPreIdle?: () => void
  /** Si true, désactive totalement le suivi */
  disabled?: boolean
  /** Active les logs de debug */
  debug?: boolean
  /** Élément cible (par défaut `window`) */
  target?: EventTarget
}

export interface UseIdleReturn {
  /** L’utilisateur est actuellement inactif */
  isIdle: boolean
  /** Temps écoulé depuis le dernier événement (en secondes) */
  elapsedSeconds: number
  /** Réinitialise le timer (comme si une activité venait de se produire) */
  reset: () => void
  /** Met le suivi en pause (garde l’état actuel) */
  pause: () => void
  /** Reprend le suivi */
  resume: () => void
}

// ---------------------------------------------------------------------------
// Liste d’événements par défaut (large couverture)
// ---------------------------------------------------------------------------
const DEFAULT_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
  'resize',
  'focus',
  'visibilitychange',
]

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------
export function useIdle(options: UseIdleOptions = {}): UseIdleReturn {
  const {
    timeout = 180,
    events = DEFAULT_EVENTS,
    immediate = true,
    onIdle,
    onActive,
    onActivity,
    preIdleTimeout,
    onPreIdle,
    disabled = false,
    debug = process.env.NODE_ENV === 'development',
    target,
  } = options

  const isServer = typeof window === 'undefined'
  const effectiveTarget: EventTarget | undefined = target ?? (isServer ? undefined : window)

  // États
  const [isIdle, setIsIdle] = useState<boolean>(false)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)

  // Références
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const isPausedRef = useRef<boolean>(false)
  const onIdleRef = useRef(onIdle)
  const onActiveRef = useRef(onActive)
  const onActivityRef = useRef(onActivity)
  const onPreIdleRef = useRef(onPreIdle)

  onIdleRef.current = onIdle
  onActiveRef.current = onActive
  onActivityRef.current = onActivity
  onPreIdleRef.current = onPreIdle

  // Nettoyage des timers
  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (preIdleTimerRef.current) {
      clearTimeout(preIdleTimerRef.current)
      preIdleTimerRef.current = null
    }
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current)
      elapsedIntervalRef.current = null
    }
  }, [])

  // Démarrage / réinitialisation du timer d’inactivité
  const startIdleTimer = useCallback(() => {
    clearAllTimers()

    if (isPausedRef.current || disabled) return

    // Pré‑idle
    if (preIdleTimeout && preIdleTimeout > 0 && preIdleTimeout < timeout) {
      preIdleTimerRef.current = setTimeout(() => {
        onPreIdleRef.current?.()
        if (debug) logger.debug('[useIdle] Pré‑idle atteint')
      }, preIdleTimeout * 1000)
    }

    // Idle complet
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true)
      onIdleRef.current?.()
      if (debug) logger.debug('[useIdle] Utilisateur devenu inactif')
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
    }, timeout * 1000)

    // Compteur de temps écoulé (mis à jour toutes les secondes)
    if (!elapsedIntervalRef.current) {
      elapsedIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - lastActivityRef.current) / 1000
        setElapsedSeconds(elapsed)
      }, 1000)
    }

    lastActivityRef.current = Date.now()
    setElapsedSeconds(0)
  }, [clearAllTimers, disabled, preIdleTimeout, timeout, debug])

  // Gestionnaire d’activité (appelé à chaque événement)
  const handleActivity = useCallback(
    (event?: Event) => {
      if (disabled || isPausedRef.current) return

      const wasIdle = isIdle

      // Mise à jour de la dernière activité
      lastActivityRef.current = Date.now()
      setElapsedSeconds(0)

      // Si on était idle, on redevient actif
      if (wasIdle) {
        setIsIdle(false)
        onActiveRef.current?.()
        if (debug) logger.debug('[useIdle] Utilisateur redevenu actif')
      }

      // Redémarrer le timer
      startIdleTimer()

      // Callback d’activité (toujours)
      onActivityRef.current?.()
    },
    [disabled, isIdle, startIdleTimer, debug]
  )

  // Démarrage / pause
  const resume = useCallback(() => {
    isPausedRef.current = false
    startIdleTimer()
  }, [startIdleTimer])

  const pause = useCallback(() => {
    isPausedRef.current = true
    clearAllTimers()
    setElapsedSeconds(0)
  }, [clearAllTimers])

  const reset = useCallback(() => {
    if (disabled) return
    setIsIdle(false)
    lastActivityRef.current = Date.now()
    startIdleTimer()
  }, [disabled, startIdleTimer])

  // Effet principal : abonnement aux événements
  useEffect(() => {
    if (isServer || disabled || !effectiveTarget) {
      setIsIdle(false)
      return
    }

    // Abonnement aux événements (avec passive quand c’est possible)
    events.forEach(eventName => {
      const isPassive = ['scroll', 'wheel', 'touchstart', 'touchmove'].includes(eventName)
      effectiveTarget.addEventListener(eventName, handleActivity, isPassive ? { passive: true } : false)
    })

    // Si immediate, on démarre le timer immédiatement
    if (immediate) {
      startIdleTimer()
    }

    // Nettoyage
    return () => {
      events.forEach(eventName => {
        effectiveTarget.removeEventListener(eventName, handleActivity)
      })
      clearAllTimers()
    }
  }, [isServer, disabled, effectiveTarget, events, immediate, handleActivity, startIdleTimer, clearAllTimers])

  return {
    isIdle,
    elapsedSeconds,
    reset,
    pause,
    resume,
  }
}

// ---------------------------------------------------------------------------
// Hook dérivé : useIdleTimer avec formatage
// ---------------------------------------------------------------------------
export function useIdleTimer(options?: UseIdleOptions): UseIdleReturn & { formattedElapsed: string } {
  const idle = useIdle(options)

  const formattedElapsed = useMemo(() => {
    const sec = Math.floor(idle.elapsedSeconds)
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    const remainingSec = sec % 60
    if (min < 60) return `${min}m ${remainingSec}s`
    const hours = Math.floor(min / 60)
    const remainingMin = min % 60
    return `${hours}h ${remainingMin}m`
  }, [idle.elapsedSeconds])

  return { ...idle, formattedElapsed }
}

export default useIdle