// components/ui/Tooltip.tsx
'use client'

import React, {
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  forwardRef,
  useImperativeHandle,
} from 'react'

import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

import { cn } from '@/lib/utils'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTEXT : TOOLTIP GROUP                                        */
/* ═══════════════════════════════════════════════════════════════ */

interface TooltipGroupContextValue {
  openDelay: number
  closeDelay: number
  disabled: boolean
}

const TooltipGroupContext = createContext<TooltipGroupContextValue>({
  openDelay: 0,
  closeDelay: 0,
  disabled: false,
})

export function TooltipGroupProvider({
  children,
  openDelay = 0,
  closeDelay = 0,
  disabled = false,
}: {
  children: ReactNode
  openDelay?: number
  closeDelay?: number
  disabled?: boolean
}) {
  return (
    <TooltipGroupContext.Provider
      value={{ openDelay, closeDelay, disabled }}
    >
      {children}
    </TooltipGroupContext.Provider>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

export type TooltipVariant =
  | 'dark'
  | 'light'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'

export type TriggerMode = 'hover' | 'click' | 'focus' | 'manual'

export interface TooltipProps {
  /** Contenu principal du tooltip */
  content: ReactNode
  /** Titre optionnel */
  title?: string
  /** Position préférée (peut être ajustée automatiquement) */
  position?: TooltipPosition
  /** Variante visuelle sémantique */
  variant?: TooltipVariant
  /** Élément déclencheur */
  children: ReactNode
  /** Délai avant apparition (ms) */
  delay?: number
  /** Délai avant disparition (ms) */
  hideDelay?: number
  /** Mode de déclenchement */
  trigger?: TriggerMode
  /** Désactive le tooltip */
  disabled?: boolean
  /** Désactive sur mobile (< 768px) */
  disableOnMobile?: boolean
  /** Largeur maximale (px) */
  maxWidth?: number
  /** Hauteur maximale (px) */
  maxHeight?: number
  /** Afficher la flèche */
  showArrow?: boolean
  /** Décalage supplémentaire (px) */
  offset?: number
  /** Ferme automatiquement après un délai (ms) une fois ouvert */
  autoClose?: number
  /** Garde le tooltip ouvert quand la souris passe dessus (mode hover) */
  interactive?: boolean
  /** Rendu en portail dans document.body (recommandé) */
  portal?: boolean
  /** Classe additionnelle sur le wrapper du tooltip */
  className?: string
  /** Classe sur le contenu interne */
  contentClassName?: string
  /** Identifiant ARIA */
  id?: string
  /** Callback à l'ouverture */
  onOpen?: () => void
  /** Callback à la fermeture */
  onClose?: () => void
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT STYLES                                                 */
/* ═══════════════════════════════════════════════════════════════ */

const variantStyles: Record<TooltipVariant, string> = {
  dark:
    'bg-raised text-fg border border-line shadow-card dark:bg-surface',
  light:
    'bg-surface text-fg border border-line shadow-card',
  accent:
    'bg-accent text-accent-contrast border border-accent shadow-card',
  info:
    'bg-info text-info-contrast border border-info shadow-card',
  success:
    'bg-success text-success-contrast border border-success shadow-card',
  warning:
    'bg-warning text-warning-contrast border border-warning shadow-card',
  danger:
    'bg-danger text-danger-contrast border border-danger shadow-card',
}

const arrowStyles: Record<TooltipVariant, string> = {
  dark: 'bg-raised border-line dark:bg-surface',
  light: 'bg-surface border-line',
  accent: 'bg-accent border-accent',
  info: 'bg-info border-info',
  success: 'bg-success border-success',
  warning: 'bg-warning border-warning',
  danger: 'bg-danger border-danger',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS                                                          */
/* ═══════════════════════════════════════════════════════════════ */

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mql = window.matchMedia(query)
    setMatches(mql.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mql.addEventListener('change', handler)

    return () => {
      mql.removeEventListener('change', handler)
    }
  }, [query])

  return matches
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POSITION CALCULATOR                                            */
/* ═══════════════════════════════════════════════════════════════ */

interface Coords {
  top: number
  left: number
}

function computePosition(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  preferred: TooltipPosition,
  offset: number
): { position: TooltipPosition; coords: Coords } {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = 8

  const fitsTop = triggerRect.top - tooltipRect.height - offset >= margin
  const fitsBottom =
    triggerRect.bottom + tooltipRect.height + offset <=
    viewportHeight - margin
  const fitsLeft = triggerRect.left - tooltipRect.width - offset >= margin
  const fitsRight =
    triggerRect.right + tooltipRect.width + offset <=
    viewportWidth - margin

  let position = preferred

  if (preferred === 'top' && !fitsTop && fitsBottom) position = 'bottom'
  else if (preferred === 'bottom' && !fitsBottom && fitsTop)
    position = 'top'
  else if (preferred === 'left' && !fitsLeft && fitsRight)
    position = 'right'
  else if (preferred === 'right' && !fitsRight && fitsLeft)
    position = 'left'

  let top = 0
  let left = 0

  switch (position) {
    case 'top':
      top = triggerRect.top - tooltipRect.height - offset
      left =
        triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      break
    case 'bottom':
      top = triggerRect.bottom + offset
      left =
        triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      break
    case 'left':
      top =
        triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
      left = triggerRect.left - tooltipRect.width - offset
      break
    case 'right':
      top =
        triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
      left = triggerRect.right + offset
      break
  }

  // Clamp horizontal
  left = Math.max(
    margin,
    Math.min(left, viewportWidth - tooltipRect.width - margin)
  )

  // Clamp vertical
  top = Math.max(
    margin,
    Math.min(top, viewportHeight - tooltipRect.height - margin)
  )

  return { position, coords: { top, left } }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ARROW                                                          */
/* ═══════════════════════════════════════════════════════════════ */

function TooltipArrow({
  position,
  variant,
  coords,
  triggerRect,
}: {
  position: TooltipPosition
  variant: TooltipVariant
  coords: Coords
  triggerRect: DOMRect | null
}) {
  if (!triggerRect) return null

  const size = 8

  const baseClasses = cn(
    'pointer-events-none absolute border',
    arrowStyles[variant]
  )

  const style: CSSProperties = {
    width: size,
    height: size,
    transform: 'rotate(45deg)',
  }

  if (position === 'top') {
    style.bottom = -(size / 2)
    style.left =
      triggerRect.left + triggerRect.width / 2 - coords.left - size / 2
    style.borderTop = 'none'
    style.borderLeft = 'none'
  } else if (position === 'bottom') {
    style.top = -(size / 2)
    style.left =
      triggerRect.left + triggerRect.width / 2 - coords.left - size / 2
    style.borderBottom = 'none'
    style.borderRight = 'none'
  } else if (position === 'left') {
    style.right = -(size / 2)
    style.top =
      triggerRect.top + triggerRect.height / 2 - coords.top - size / 2
    style.borderLeft = 'none'
    style.borderBottom = 'none'
  } else {
    style.left = -(size / 2)
    style.top =
      triggerRect.top + triggerRect.height / 2 - coords.top - size / 2
    style.borderRight = 'none'
    style.borderTop = 'none'
  }

  return <span className={baseClasses} style={style} aria-hidden="true" />
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TOOLTIP                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  (
    {
      content,
      title,
      position = 'top',
      variant = 'dark',
      children,
      delay: delayProp,
      hideDelay: hideDelayProp,
      trigger = 'hover',
      disabled: disabledProp,
      disableOnMobile = false,
      maxWidth = 280,
      maxHeight,
      showArrow = true,
      offset = 10,
      autoClose,
      interactive = false,
      portal = true,
      className,
      contentClassName,
      id,
      onOpen,
      onClose,
    },
    ref
  ) => {
    const group = useContext(TooltipGroupContext)
    const { prefersReducedMotion } = useAccessibilityPreferences()

    const effectiveOpenDelay = delayProp ?? group.openDelay
    const effectiveCloseDelay = hideDelayProp ?? group.closeDelay

    const isEmpty = content === undefined && content === null && !title
    const effectiveDisabled =
      disabledProp || group.disabled || isEmpty

    const isMobile = useMediaQuery('(max-width: 767px)')
    const disabled =
      effectiveDisabled || (disableOnMobile && isMobile)

    const [isVisible, setIsVisible] = useState(false)
    const [coords, setCoords] = useState<Coords>({ top: 0, left: 0 })
    const [resolvedPosition, setResolvedPosition] =
      useState<TooltipPosition>(position)

    const containerRef = useRef<HTMLDivElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)
    const triggerRectRef = useRef<DOMRect | null>(null)

    const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clearTimeouts = useCallback(() => {
      if (openTimeoutRef.current) {
        clearTimeout(openTimeoutRef.current)
        openTimeoutRef.current = null
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current)
        autoCloseRef.current = null
      }
    }, [])

    const closeTooltip = useCallback(
      (immediate = false) => {
        clearTimeouts()

        if (immediate) {
          setIsVisible(false)
          onClose?.()
          return
        }

        closeTimeoutRef.current = setTimeout(() => {
          setIsVisible(false)
          onClose?.()
        }, effectiveCloseDelay)
      },
      [effectiveCloseDelay, onClose, clearTimeouts]
    )

    const openTooltip = useCallback(() => {
      if (disabled) return

      clearTimeouts()

      openTimeoutRef.current = setTimeout(() => {
        if (containerRef.current) {
          triggerRectRef.current =
            containerRef.current.getBoundingClientRect()
        }

        setIsVisible(true)
        onOpen?.()

        if (autoClose && autoClose > 0) {
          autoCloseRef.current = setTimeout(() => {
            setIsVisible(false)
            onClose?.()
          }, autoClose)
        }
      }, effectiveOpenDelay)
    }, [
      disabled,
      effectiveOpenDelay,
      autoClose,
      onOpen,
      onClose,
      clearTimeouts,
    ])

    /* ───────────────────────────────────────────────────────────── */
    /*  Cleanup                                                      */
    /* ───────────────────────────────────────────────────────────── */

    useEffect(() => {
      return () => clearTimeouts()
    }, [clearTimeouts])

    /* ───────────────────────────────────────────────────────────── */
    /*  Position update                                              */
    /* ───────────────────────────────────────────────────────────── */

    useLayoutEffect(() => {
      if (!isVisible) return
      if (!triggerRectRef.current) return
      if (!tooltipRef.current) return

      const tooltipRect = tooltipRef.current.getBoundingClientRect()
      const { position: nextPosition, coords: nextCoords } =
        computePosition(
          triggerRectRef.current,
          tooltipRect,
          position,
          offset
        )

      setResolvedPosition(nextPosition)
      setCoords(nextCoords)
    }, [isVisible, position, offset, content])

    /* ───────────────────────────────────────────────────────────── */
    /*  Close on outside click (click trigger)                       */
    /* ───────────────────────────────────────────────────────────── */

    useEffect(() => {
      if (!isVisible || trigger !== 'click') return

      const handler = (event: MouseEvent) => {
        const target = event.target as Node

        if (
          containerRef.current &&
          !containerRef.current.contains(target) &&
          tooltipRef.current &&
          !tooltipRef.current.contains(target)
        ) {
          closeTooltip(true)
        }
      }

      document.addEventListener('mousedown', handler)

      return () => {
        document.removeEventListener('mousedown', handler)
      }
    }, [isVisible, trigger, closeTooltip])

    /* ───────────────────────────────────────────────────────────── */
    /*  Close on Escape                                              */
    /* ───────────────────────────────────────────────────────────── */

    useEffect(() => {
      if (!isVisible) return

      const handler = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          closeTooltip(true)
        }
      }

      document.addEventListener('keydown', handler)

      return () => {
        document.removeEventListener('keydown', handler)
      }
    }, [isVisible, closeTooltip])

    /* ───────────────────────────────────────────────────────────── */
    /*  Close on scroll / resize (to avoid stale position)           */
    /* ───────────────────────────────────────────────────────────── */

    useEffect(() => {
      if (!isVisible) return

      const handler = () => {
        closeTooltip(true)
      }

      window.addEventListener('scroll', handler, true)
      window.addEventListener('resize', handler)

      return () => {
        window.removeEventListener('scroll', handler, true)
        window.removeEventListener('resize', handler)
      }
    }, [isVisible, closeTooltip])

    /* ───────────────────────────────────────────────────────────── */
    /*  Imperative handle for manual trigger                         */
    /* ───────────────────────────────────────────────────────────── */

    useImperativeHandle(ref, () => containerRef.current!, [])

    /* ───────────────────────────────────────────────────────────── */
    /*  Event handlers based on trigger                              */
    /* ───────────────────────────────────────────────────────────── */

    const eventHandlers: React.HTMLAttributes<HTMLDivElement> = {}

    if (trigger === 'hover') {
      eventHandlers.onMouseEnter = openTooltip
      eventHandlers.onMouseLeave = () => closeTooltip()
      eventHandlers.onFocus = openTooltip
      eventHandlers.onBlur = () => closeTooltip()
    } else if (trigger === 'focus') {
      eventHandlers.onFocus = openTooltip
      eventHandlers.onBlur = () => closeTooltip()
    } else if (trigger === 'click') {
      eventHandlers.onClick = () => {
        if (isVisible) {
          closeTooltip(true)
        } else {
          openTooltip()
        }
      }
    }

    /* ───────────────────────────────────────────────────────────── */
    /*  Animation config                                             */
    /* ───────────────────────────────────────────────────────────── */

    const motionProps = prefersReducedMotion
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0 },
        }
      : {
          initial: { opacity: 0, scale: 0.96, y: 4 },
          animate: { opacity: 1, scale: 1, y: 0 },
          exit: { opacity: 0, scale: 0.96, y: 4 },
          transition: { duration: 0.15, ease: 'easeOut' as const },
        }

    /* ───────────────────────────────────────────────────────────── */
    /*  Children handling                                            */
    /* ───────────────────────────────────────────────────────────── */

    const triggerId = id ? `${id}-trigger` : undefined
    const tooltipId = id ?? undefined

    const triggerElement = (() => {
      if (
        isValidElement(children) &&
        typeof children !== 'string' &&
        typeof children !== 'number'
      ) {
        return cloneElement(children as ReactElement<any>, {
          'aria-describedby': isVisible ? tooltipId : undefined,
          id: triggerId,
        })
      }

      return children
    })()

    /* ───────────────────────────────────────────────────────────── */
    /*  Tooltip content                                              */
    /* ───────────────────────────────────────────────────────────── */

    const tooltipContent = isVisible ? (
      <motion.div
        ref={tooltipRef}
        id={tooltipId}
        role="tooltip"
        {...motionProps}
        className={cn(
          'pointer-events-none fixed z-[9999] max-w-full rounded-lg px-3 py-2 text-xs font-medium',
          variantStyles[variant],
          className
        )}
        style={{
          top: coords.top,
          left: coords.left,
          maxWidth,
          maxHeight,
          pointerEvents: interactive && trigger === 'hover' ? 'auto' : 'none',
        }}
        onMouseEnter={
          interactive && trigger === 'hover'
            ? () => clearTimeouts()
            : undefined
        }
        onMouseLeave={
          interactive && trigger === 'hover'
            ? () => closeTooltip()
            : undefined
        }
      >
        {title ? (
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
            {title}
          </p>
        ) : null}

        <div className={cn('leading-snug', contentClassName)}>
          {content}
        </div>

        {showArrow ? (
          <TooltipArrow
            position={resolvedPosition}
            variant={variant}
            coords={coords}
            triggerRect={triggerRectRef.current}
          />
        ) : null}
      </motion.div>
    ) : null

    /* ───────────────────────────────────────────────────────────── */
    /*  Render                                                       */
    /* ───────────────────────────────────────────────────────────── */

    return (
      <div
        ref={containerRef}
        className="relative inline-flex"
        {...eventHandlers}
      >
        {triggerElement}

        {tooltipContent &&
          (portal
            ? createPortal(
                <AnimatePresence>{tooltipContent}</AnimatePresence>,
                document.body
              )
            : tooltipContent)}
      </div>
    )
  }
)

Tooltip.displayName = 'Tooltip'

export default Tooltip