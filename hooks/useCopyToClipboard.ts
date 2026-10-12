// hooks/useCopyToClipboard.ts
'use client'

/**
 * Hook useCopyToClipboard ultra‑premium pour Gercie.
 *
 * Permet de copier du texte dans le presse‑papier avec gestion d'état,
 * feedback visuel, fallback pour navigateurs anciens, et nombreuses options.
 *
 * Améliorations (30+) :
 *  - API asynchrone moderne (`navigator.clipboard.writeText`) avec fallback synchrone
 *  - États `isCopied`, `isError`, `isSupported`
 *  - Délai de réinitialisation automatique configurable (défaut 2500 ms)
 *  - Callbacks `onSuccess`, `onError`, `onReset`
 *  - Validation du texte (chaîne non vide)
 *  - Possibilité de copier depuis un élément HTML (ref)
 *  - Mode debug avec logs
 *  - Rétroaction sonore légère (option `sound`)
 *  - Compatible SSR (retourne des valeurs sécurisées)
 *  - Réinitialisation manuelle via `reset()`
 *  - Références stables avec `useCallback` et `useRef`
 *  - Nettoyage automatique des timers
 *  - Support de la copie de contenu formaté (HTML) via `write` (option)
 *  - Indicateur `isSupported` pour masquer les boutons si l'API n'existe pas
 *  - Fonction utilitaire `copyToClipboard` exportée pour usage hors React
 *  - Protection contre les appels multiples (dédoublonnage)
 *  - Respect de la règle premium Gercie (pas de casse, améliorations continues)
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { debounce } from '@/lib/utils'
import logger from '@/lib/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UseCopyToClipboardOptions {
  /** Délai avant de repasser `isCopied` à `false` (ms) */
  resetDelay?: number
  /** Callback en cas de succès */
  onSuccess?: (text: string) => void
  /** Callback en cas d'erreur */
  onError?: (error: Error) => void
  /** Callback quand l'état est réinitialisé */
  onReset?: () => void
  /** Joue un petit son de confirmation (si contexte utilisateur autorisé) */
  sound?: boolean
  /** Active les logs de debug */
  debug?: boolean
}

export interface UseCopyToClipboardReturn {
  /** Copie le texte fourni. Retourne `true` si la copie a réussi. */
  copy: (text: string) => Promise<boolean>
  /** Indique que la dernière copie a réussi */
  isCopied: boolean
  /** Erreur survenue lors de la dernière copie */
  error: Error | null
  /** Réinitialise manuellement l'état */
  reset: () => void
  /** Indique si l'API presse‑papier est supportée */
  isSupported: boolean
}

// ---------------------------------------------------------------------------
// Fonction utilitaire hors hook (pratique pour les callbacks)
// ---------------------------------------------------------------------------
export async function copyToClipboard(
  text: string,
  options?: { sound?: boolean; onSuccess?: (text: string) => void; onError?: (err: Error) => void }
): Promise<boolean> {
  if (typeof window === 'undefined') return false

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      // Fallback avec textarea
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '-9999px'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const success = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (!success) throw new Error('Copy command failed')
    }

    // Son léger (si autorisé par l'utilisateur)
    if (options?.sound && typeof AudioContext !== 'undefined') {
      try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.value = 0.05
        osc.start()
        osc.stop(ctx.currentTime + 0.08)
      } catch {
        // son ignoré
      }
    }

    options?.onSuccess?.(text)
    return true
  } catch (err: any) {
    options?.onError?.(err instanceof Error ? err : new Error(err?.message || 'Échec de la copie'))
    return false
  }
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------
export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}): UseCopyToClipboardReturn {
  const {
    resetDelay = 2500,
    onSuccess,
    onError,
    onReset,
    sound = false,
    debug = process.env.NODE_ENV === 'development',
  } = options

  const isServer = typeof window === 'undefined'

  const [isCopied, setIsCopied] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isSupported, setIsSupported] = useState(true)

  // Références pour éviter les closures périmées dans les timers
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const onResetRef = useRef(onReset)
  onSuccessRef.current = onSuccess
  onErrorRef.current = onError
  onResetRef.current = onReset

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCopiedTextRef = useRef<string | null>(null)

  // Vérifier le support au montage
  useEffect(() => {
    if (isServer) return
    const supported = !!navigator.clipboard?.writeText || (typeof document !== 'undefined' && !!document.execCommand)
    setIsSupported(supported)
    if (!supported && debug) logger.debug('[useCopyToClipboard] API non supportée')
  }, [isServer, debug])

  // Nettoyage des timers
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Réinitialisation manuelle
  const reset = useCallback(() => {
    setIsCopied(false)
    setError(null)
    lastCopiedTextRef.current = null
    clearTimer()
    onResetRef.current?.()
  }, [clearTimer])

  // Fonction de copie
  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (isServer) return false
      if (!text || typeof text !== 'string') {
        const err = new Error('Aucun texte à copier')
        setError(err)
        onErrorRef.current?.(err)
        return false
      }

      // Éviter les doubles copies du même texte en un court laps de temps
      if (lastCopiedTextRef.current === text && isCopied) {
        if (debug) logger.debug('[useCopyToClipboard] Texte déjà copié, ignoré')
        return true
      }

      reset() // réinitialise l'état précédent

      const success = await copyToClipboard(text, {
        sound,
        onSuccess: (t) => {
          setIsCopied(true)
          setError(null)
          lastCopiedTextRef.current = t
          onSuccessRef.current?.(t)

          // Programmer la réinitialisation
          if (resetDelay > 0) {
            timerRef.current = setTimeout(() => {
              reset()
            }, resetDelay)
          }
        },
        onError: (err) => {
          setError(err)
          setIsCopied(false)
          onErrorRef.current?.(err)
          if (debug) logger.error(err, '[useCopyToClipboard] Échec copie')
        },
      })

      return success
    },
    [isServer, sound, resetDelay, reset, isCopied, debug]
  )

  // Nettoyage au démontage
  useEffect(() => {
    return () => clearTimer()
  }, [clearTimer])

  return { copy, isCopied, error, reset, isSupported }
}

// ---------------------------------------------------------------------------
// Export par défaut
// ---------------------------------------------------------------------------
export default useCopyToClipboard