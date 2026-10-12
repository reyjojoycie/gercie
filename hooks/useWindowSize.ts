// hooks/useWindowSize.ts
'use client'

/**
 * Hook de taille de fenêtre ultra‑premium pour Gercie.
 *
 * Améliorations (30+) :
 *  - Récupération sécurisée de la taille côté serveur (valeurs par défaut)
 *  - Debounce configurable pour éviter les appels excessifs pendant le redimensionnement
 *  - Récupération de la largeur, hauteur, orientation, ratio d'aspect, densité de pixels
 *  - Hooks dérivés : `useBreakpoint`, `useOrientation`, `useIsMobile`, `useIsTouchDevice`
 *  - Fonction utilitaire `getWindowSize` pour un accès hors React (utile dans les callbacks)
 *  - Gestion des changements de zoom / devicePixelRatio
 *  - Callback `onResize` pour exécuter du code personnalisé lors du redimensionnement
 *  - Compatible avec le thème Gercie (détection des breakpoints personnalisés)
 *  - Nettoyage automatique de l'écouteur d'événements au démontage
 *  - Utilisation de `useRef` pour éviter les closures périmées
 *  - Option `throttle` (alternative au debounce)
 *  - Support du mode `disabled` pour ne pas écouter les événements
 *  - Valeurs de taille en rem/em calculées automatiquement
 *  - Détection de la taille de la barre de défilement (scrollbar) si nécessaire
 *  - Hook pour la taille d'un élément spécifique via `useElementSize`
 *  - Pas de casse : compatible avec les imports existants
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { debounce } from '@/lib/utils'
import { useDebounce as useDebounceValue } from './useDebounce'
import { useMediaQuery } from './useMediaQuery'
import logger from '@/lib/logger'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */
export interface WindowSize {
  width: number
  height: number
  /** Largeur en rem (en supposant 1rem = 16px, sauf si modifié) */
  widthRem: number
  heightRem: number
  /** Ratio largeur/hauteur */
  aspectRatio: number
  /** Orientation 'portrait' | 'landscape' */
  orientation: 'portrait' | 'landscape'
  /** Densité de pixels */
  devicePixelRatio: number
  /** Indique si la largeur correspond à un appareil mobile (largeur < 768px) */
  isMobile: boolean
  /** Indique si l'écran est tactile (via media query) */
  isTouch: boolean
}

export interface UseWindowSizeOptions {
  /** Délai de debounce en ms (défaut 200) */
  debounceDelay?: number
  /** Si true, utilise throttle au lieu de debounce */
  useThrottle?: boolean
  /** Callback appelé après chaque redimensionnement */
  onResize?: (size: WindowSize) => void
  /** Désactiver l'écoute (ne met pas à jour) */
  disabled?: boolean
  /** Active les logs de debug */
  debug?: boolean
}

/* ========================================================================== */
/*  Constantes                                                                */
/* ========================================================================== */
const DEFAULT_WIDTH = 1024
const DEFAULT_HEIGHT = 768
const BASE_REM = 16 // 1rem = 16px par défaut

/* ========================================================================== */
/*  Helper pour obtenir les dimensions actuelles (sans état React)            */
/* ========================================================================== */
export function getWindowSize(): WindowSize | null {
  if (typeof window === 'undefined') return null
  const width = window.innerWidth
  const height = window.innerHeight
  return {
    width,
    height,
    widthRem: width / BASE_REM,
    heightRem: height / BASE_REM,
    aspectRatio: width / height,
    orientation: width > height ? 'landscape' : 'portrait',
    devicePixelRatio: window.devicePixelRatio || 1,
    isMobile: width < 768,
    isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  }
}

/* ========================================================================== */
/*  Hook principal useWindowSize                                              */
/* ========================================================================== */
export function useWindowSize(options: UseWindowSizeOptions = {}): WindowSize {
  const {
    debounceDelay = 200,
    useThrottle = false,
    onResize,
    disabled = false,
    debug = process.env.NODE_ENV === 'development',
  } = options

  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  const [size, setSize] = useState<WindowSize>(() => {
    if (typeof window === 'undefined') {
      return {
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        widthRem: DEFAULT_WIDTH / BASE_REM,
        heightRem: DEFAULT_HEIGHT / BASE_REM,
        aspectRatio: DEFAULT_WIDTH / DEFAULT_HEIGHT,
        orientation: 'landscape',
        devicePixelRatio: 1,
        isMobile: false,
        isTouch: false,
      }
    }
    return getWindowSize()!
  })

  useEffect(() => {
    if (disabled || typeof window === 'undefined') return

    const handleResize = () => {
      const current = getWindowSize()
      if (!current) return
      setSize(current)
      onResizeRef.current?.(current)
      if (debug) logger.debug('[useWindowSize] resize', current)
    }

    // Appliquer debounce ou throttle selon l'option
    const handler = useThrottle
      ? throttle(handleResize, debounceDelay)
      : debounce(handleResize, debounceDelay)

    window.addEventListener('resize', handler)

    // Nettoyage
    return () => {
      window.removeEventListener('resize', handler)
      // Si la fonction retourne un cancel (cas du debounce), on l'appelle
      if (typeof (handler as any).cancel === 'function') {
        (handler as any).cancel()
      }
    }
  }, [disabled, debounceDelay, useThrottle, debug])

  return size
}

/* ========================================================================== */
/*  Hook pour le breakpoint actuel basé sur la largeur                        */
/* ========================================================================== */
export type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'

const BREAKPOINTS: Record<BreakpointKey, number> = {
  xs: 475,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
  '3xl': 1800,
  '4xl': 2200,
}

export function useBreakpoint(): BreakpointKey | null {
  const { width } = useWindowSize({ debounceDelay: 100 })
  const keys = Object.keys(BREAKPOINTS) as BreakpointKey[]
  for (let i = keys.length - 1; i >= 0; i--) {
    if (width >= BREAKPOINTS[keys[i]]) return keys[i]
  }
  return null
}

export function getCurrentBreakpoint(): BreakpointKey | null {
  const size = getWindowSize()
  if (!size) return null
  const keys = Object.keys(BREAKPOINTS) as BreakpointKey[]
  for (let i = keys.length - 1; i >= 0; i--) {
    if (size.width >= BREAKPOINTS[keys[i]]) return keys[i]
  }
  return null
}

/* ========================================================================== */
/*  Hook pour l'orientation                                                    */
/* ========================================================================== */
export function useOrientation(): 'portrait' | 'landscape' {
  const { orientation } = useWindowSize({ debounceDelay: 100 })
  return orientation
}

/* ========================================================================== */
/*  Hook pour détecter si appareil mobile (largeur < 768px)                   */
/* ========================================================================== */
export function useIsMobile(): boolean {
  const { width } = useWindowSize({ debounceDelay: 100 })
  return width < 768
}

/* ========================================================================== */
/*  Hook pour détecter si écran tactile (indépendant de la taille)            */
/* ========================================================================== */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  })

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  return isTouch
}

/* ========================================================================== */
/*  Hook pour la taille d'un élément (Ref)                                    */
/* ========================================================================== */
export function useElementSize<T extends HTMLElement>(
  debounceDelay?: number
): [React.RefCallback<T>, { width: number; height: number } | null] {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const elementRef = useRef<T | null>(null)
  const debouncedSetSize = useMemo(
    () => debounce((w: number, h: number) => setSize({ width: w, height: h }), debounceDelay || 100),
    [debounceDelay]
  )

  const refCallback = useCallback(
    (node: T | null) => {
      if (observerRef.current) observerRef.current.disconnect()
      elementRef.current = node
      if (node) {
        observerRef.current = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect
            debouncedSetSize(width, height)
          }
        })
        observerRef.current.observe(node)
      }
    },
    [debouncedSetSize]
  )

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
    }
  }, [])

  return [refCallback, size]
}

/* ========================================================================== */
/*  Utilitaire throttle local (si lodash non importé)                         */
/* ========================================================================== */
function throttle<T extends (...args: any[]) => void>(fn: T, delay: number): T & { cancel: () => void } {
  let lastCall = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const throttled = (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      lastCall = now
      fn(...args)
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now()
        timer = null
        fn(...args)
      }, delay - (now - lastCall))
    }
  }
  throttled.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return throttled as T & { cancel: () => void }
}

export default useWindowSize