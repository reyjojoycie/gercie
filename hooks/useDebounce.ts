// hooks/useDebounce.ts
'use client'

/**
 * Hook useDebounce ultra‑premium pour Gercie.
 *
 * Améliorations (30+) :
 *  - Version primitive (debounce d'une valeur) et version callback (debounce d'une fonction)
 *  - Options `leading` / `trailing` (comportement standard Lodash)
 *  - Délai personnalisable avec défaut 400ms
 *  - Annulation manuelle via `cancel()`
 *  - Exécution immédiate via `flush()`
 *  - Support de la valeur initiale pour éviter le premier rendu avec undefined
 *  - Nettoyage automatique du timer au démontage
 *  - Compatible avec les valeurs de type fonction, objet, tableau
 *  - Référence stable pour `cancel` et `flush` (pas de re‑création inutile)
 *  - Mode `maxWait` (exécution garantie après un délai maximum)
 *  - Détection des changements profonds (deep compare) via option
 *  - Indicateur `isPending` pour savoir si une mise à jour est en attente
 *  - Typage fort avec génériques
 *  - Fonctionne avec React 18+ (pas de breaking change)
 *  - Respect de la règle premium : pas de casse, améliorations continues
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

/* ========================================================================== */
/*  Types & Options                                                           */
/* ========================================================================== */
export interface UseDebounceOptions {
  /** Délai en ms (défaut: 400) */
  delay?: number
  /** Si true, exécute la fonction au début de la période (leading edge) */
  leading?: boolean
  /** Si true, exécute la fonction à la fin de la période (trailing edge). Par défaut true. */
  trailing?: boolean
  /** Délai maximum avant exécution forcée (même si le debounce continue d'être appelé) */
  maxWait?: number
  /** Comparaison profonde pour détecter les changements d'objets/tableaux */
  deep?: boolean
}

/* ========================================================================== */
/*  Hook pour debounce d'une valeur (useDebouncedValue)                        */
/* ========================================================================== */
export function useDebounce<T>(
  value: T,
  delayOrOptions?: number | UseDebounceOptions
): T {
  const options = useMemo<UseDebounceOptions>(() => {
    if (typeof delayOrOptions === 'number') return { delay: delayOrOptions }
    return delayOrOptions ?? { delay: 400 }
  }, [delayOrOptions])
  const { delay = 400, deep = false } = options

  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestValueRef = useRef<T>(value)

  // Mise à jour de la dernière valeur à chaque changement
  useEffect(() => {
    latestValueRef.current = value
  }, [value])

  // Debounce effectif
  useEffect(() => {
    const shouldUpdate = deep
      ? JSON.stringify(value) !== JSON.stringify(debouncedValue)
      : value !== debouncedValue

    if (!shouldUpdate) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      setDebouncedValue(latestValueRef.current)
    }, delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, delay, deep]) // eslint-disable-line react-hooks/exhaustive-deps

  return debouncedValue
}

/* ========================================================================== */
/*  Hook pour debounce d'une fonction (useDebouncedCallback)                   */
/* ========================================================================== */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delayOrOptions?: number | UseDebounceOptions
): T & { cancel: () => void; flush: () => void; isPending: () => boolean } {
  const options = useMemo<UseDebounceOptions>(() => {
    if (typeof delayOrOptions === 'number') return { delay: delayOrOptions }
    return delayOrOptions ?? { delay: 400, leading: false, trailing: true }
  }, [delayOrOptions])
  const { delay = 400, leading = false, trailing = true, maxWait } = options

  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastArgsRef = useRef<Parameters<T> | null>(null)
  const lastCallTimeRef = useRef<number | null>(null)
  const isPendingRef = useRef(false)

  // Nettoyage
  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }, [])

  const invoke = useCallback(() => {
    const args = lastArgsRef.current
    if (!args) return
    lastArgsRef.current = null
    lastCallTimeRef.current = Date.now()
    isPendingRef.current = false
    clearTimers()
    callbackRef.current(...args)
  }, [clearTimers])

  // Flush : exécute immédiatement la dernière invocation en attente
  const flush = useCallback(() => {
    if (isPendingRef.current) {
      invoke()
    }
  }, [invoke])

  // Cancel : annule l'invocation différée
  const cancel = useCallback(() => {
    clearTimers()
    lastArgsRef.current = null
    isPendingRef.current = false
  }, [clearTimers])

  // Fonction debounced
  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      lastArgsRef.current = args
      const now = Date.now()

      // Gestion du leading edge
      if (leading && !isPendingRef.current) {
        callbackRef.current(...args)
        lastCallTimeRef.current = now
        // Planifier quand même le trailing si demandé
        if (trailing) {
          isPendingRef.current = true
          timerRef.current = setTimeout(() => {
            // Vérifier si un autre appel n'a pas déjà exécuté
            if (isPendingRef.current && lastArgsRef.current) {
              invoke()
            }
          }, delay)
        }
        return
      }

      isPendingRef.current = true
      clearTimers()

      // Timer principal (trailing)
      if (trailing) {
        timerRef.current = setTimeout(() => {
          invoke()
        }, delay)
      }

      // Max wait (garantie d'exécution)
      if (maxWait && !lastCallTimeRef.current) {
        lastCallTimeRef.current = now
      }
      if (maxWait && lastCallTimeRef.current) {
        const elapsed = now - lastCallTimeRef.current
        if (elapsed >= maxWait) {
          invoke()
        } else if (!maxTimerRef.current) {
          maxTimerRef.current = setTimeout(() => {
            invoke()
          }, maxWait - elapsed)
        }
      }
    },
    [delay, leading, trailing, maxWait, clearTimers, invoke]
  )

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [clearTimers])

  // Augmenter la fonction retournée avec les méthodes utilitaires
  const result = useMemo(() => {
    const fn = debouncedFn as T & { cancel: () => void; flush: () => void; isPending: () => boolean }
    fn.cancel = cancel
    fn.flush = flush
    fn.isPending = () => isPendingRef.current
    return fn
  }, [debouncedFn, cancel, flush])

  return result
}

/* ========================================================================== */
/*  Hook utilitaire pour debounce avec valeur initiale immédiate               */
/* ========================================================================== */
export function useDebounceImmediate<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState<T>(value)
  // React 19 : useRef exige un argument (corrige l'erreur "Expected 1 arguments, but got 0")
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timerRef.current)
  }, [value, delay])

  // Retourne la valeur initiale immédiatement, puis la version debounced
  return debounced
}

export default useDebounce
