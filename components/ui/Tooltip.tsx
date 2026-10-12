// components/ui/Tooltip.tsx
'use client'

import React, {
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect,
  ReactNode,
  createContext,
  useContext,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ========================================================================
   Contexte global des tooltips (empilement, délai, désactivation)
   ======================================================================== */
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

export const TooltipGroupProvider = ({
  children,
  openDelay = 0,
  closeDelay = 0,
  disabled = false,
}: {
  children: ReactNode
  openDelay?: number
  closeDelay?: number
  disabled?: boolean
}) => (
  <TooltipGroupContext.Provider value={{ openDelay, closeDelay, disabled }}>
    {children}
  </TooltipGroupContext.Provider>
)

/* ========================================================================
   Types
   ======================================================================== */
type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'
type TooltipVariant =
  | 'dark'
  | 'light'
  | 'brand'
  | 'accent'
  | 'warm'
  | 'luxury'
  | 'gold'
  | 'burgundy'
  | 'champagne'
  | 'rosegold'
  | 'teal'
  | 'copper'
  | 'plum'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
type TriggerMode = 'hover' | 'click' | 'focus' | 'manual'

export interface TooltipProps {
  /** Contenu principal du tooltip (texte, ReactNode riche) */
  content: ReactNode
  /** Titre optionnel (en-tête du tooltip) */
  title?: string
  /** Position préférée */
  position?: TooltipPosition
  /** Variante de couleur / style */
  variant?: TooltipVariant
  /** Élément déclencheur */
  children: ReactNode
  /** Délai avant apparition (ms) – surchargé par le groupe si fourni */
  delay?: number
  /** Délai avant disparition (ms) – surchargé par le groupe si fourni */
  hideDelay?: number
  /** Mode de déclenchement */
  trigger?: TriggerMode
  /** Désactive le tooltip */
  disabled?: boolean
  /** Désactive sur mobile (<768px) */
  disableOnMobile?: boolean
  /** Largeur maximale du contenu (px) */
  maxWidth?: number
  /** Hauteur maximale du contenu (px) */
  maxHeight?: number
  /** Afficher la flèche */
  showArrow?: boolean
  /** Couleur personnalisée de la flèche (classe Tailwind) */
  arrowClassName?: string
  /** Décalage supplémentaire (px) */
  offset?: number
  /** Ferme automatiquement après un délai (ms) une fois ouvert */
  autoClose?: number
  /** Permet de garder le tooltip ouvert quand la souris passe dessus (mode hover) */
  interactive?: boolean
  /** Rendu en portail dans document.body (pour éviter les problèmes de z-index) */
  portal?: boolean
  /** Classe additionnelle */
  className?: string
  /** Classe pour l'enveloppe intérieure */
  contentClassName?: string
  /** Identifiant pour aria-describedby */
  id?: string
  /** Callback à l'ouverture */
  onOpen?: () => void
  /** Callback à la fermeture */
  onClose?: () => void
  /** Passe le composant déclencheur en tant que children (pattern asChild) – non implémenté complètement ici mais props pour forward */
  // (le reste est géré par l'enveloppe)
}

/* ------------------------------------------------------------------ */
/*  Dictionnaires                                                      */
/* ------------------------------------------------------------------ */

const positionMap: Record<TooltipPosition, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

const arrowBorderColorMap: Record<TooltipVariant, string> = {
  dark: 'border-t-neutral-900 dark:border-t-neutral-100',
  light: 'border-t-white dark:border-t-neutral-700',
  brand: 'border-t-brand-500',
  accent: 'border-t-accent-500',
  warm: 'border-t-warm-500',
  luxury: 'border-t-luxury-500',
  gold: 'border-t-gold-500',
  burgundy: 'border-t-burgundy-500',
  champagne: 'border-t-champagne-500',
  rosegold: 'border-t-rosegold-500',
  teal: 'border-t-teal-500',
  copper: 'border-t-copper-500',
  plum: 'border-t-plum-500',
  info: 'border-t-info-500',
  success: 'border-t-success-500',
  warning: 'border-t-warning-500',
  danger: 'border-t-danger-500',
}

const variantStyleMap: Record<TooltipVariant, string> = {
  dark: 'bg-neutral-900 text-white dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700',
  light:
    'bg-white text-neutral-800 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700',
  brand: 'bg-brand-500 text-white',
  accent: 'bg-accent-500 text-white',
  warm: 'bg-warm-500 text-white',
  luxury: 'bg-luxury-500 text-white',
  gold: 'bg-gold-500 text-white',
  burgundy: 'bg-burgundy-500 text-white',
  champagne: 'bg-champagne-500 text-white',
  rosegold: 'bg-rosegold-500 text-white',
  teal: 'bg-teal-500 text-white',
  copper: 'bg-copper-500 text-white',
  plum: 'bg-plum-500 text-white',
  info: 'bg-info-500 text-white',
  success: 'bg-success-500 text-white',
  warning: 'bg-warning-500 text-white',
  danger: 'bg-danger-500 text-white',
}

/* ------------------------------------------------------------------ */
/*  Hook media query                                                   */
/* ------------------------------------------------------------------ */
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

/* ================================================================== */
/*  Composant Tooltip                                                  */
/* ================================================================== */
const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
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
      maxWidth = 320,
      maxHeight,
      showArrow = true,
      arrowClassName,
      offset = 8,
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
    const effectiveOpenDelay = delayProp ?? group.openDelay
    const effectiveCloseDelay = hideDelayProp ?? group.closeDelay
    const effectiveDisabled = disabledProp || group.disabled || (!content && !title)

    const isMobile = useMediaQuery('(max-width: 767px)')
    const disabled = effectiveDisabled || (disableOnMobile && isMobile)

    const [isVisible, setIsVisible] = useState(false)
    const [adjustedPosition, setAdjustedPosition] = useState(position)
    const containerRef = useRef<HTMLDivElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)
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

    const openTooltip = useCallback(() => {
      if (disabled) return
      clearTimeouts()
      openTimeoutRef.current = setTimeout(() => {
        setIsVisible(true)
        onOpen?.()
        if (autoClose) {
          autoCloseRef.current = setTimeout(() => {
            setIsVisible(false)
            onClose?.()
          }, autoClose)
        }
      }, effectiveOpenDelay)
    }, [disabled, effectiveOpenDelay, autoClose, onOpen, onClose, clearTimeouts])

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

    // Nettoyage
    useEffect(() => {
      return () => clearTimeouts()
    }, [clearTimeouts])

    // Ajustement de position en fonction de l'espace disponible
    useLayoutEffect(() => {
      if (!isVisible || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const preferred = position
      let next = preferred

      // Vérification sommaire du dépassement
      if (preferred === 'top' && rect.top < 80) next = 'bottom'
      else if (preferred === 'bottom' && rect.bottom > window.innerHeight - 80) next = 'top'
      else if (preferred === 'left' && rect.left < 120) next = 'right'
      else if (preferred === 'right' && rect.right > window.innerWidth - 120) next = 'left'

      setAdjustedPosition(next)
    }, [isVisible, position])

    // Gestion du clic extérieur pour fermer (mode click)
    useEffect(() => {
      if (!isVisible || trigger !== 'click') return
      const handler = (e: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node) &&
          tooltipRef.current &&
          !tooltipRef.current.contains(e.target as Node)
        ) {
          closeTooltip(true)
        }
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [isVisible, trigger, closeTooltip])

    // Gestion des événements selon le trigger
    const eventHandlers =
      trigger === 'hover'
        ? {
            onMouseEnter: openTooltip,
            onMouseLeave: () => closeTooltip(),
            onFocus: openTooltip,
            onBlur: () => closeTooltip(),
          }
        : trigger === 'focus'
          ? {
              onFocus: openTooltip,
              onBlur: () => closeTooltip(),
            }
          : trigger === 'click'
            ? {
                onClick: () => (isVisible ? closeTooltip(true) : openTooltip()),
              }
            : {} // manual – géré par l'utilisateur via ref ou état

    // Pour le mode manuel, on expose les méthodes via ref
    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, [])
    // Note : on pourrait exposer open/close via un autre mécanisme

    // Rendu du contenu du tooltip
    const tooltipContent = (
      <motion.div
        ref={tooltipRef}
        id={id}
        role="tooltip"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'absolute z-50 rounded-xl shadow-strong pointer-events-none',
          positionMap[adjustedPosition],
          variantStyleMap[variant],
          className
        )}
        style={{ maxWidth, maxHeight, margin: offset }}
        onMouseEnter={
          interactive && trigger === 'hover' ? () => clearTimeouts() : undefined
        }
        onMouseLeave={
          interactive && trigger === 'hover' ? () => closeTooltip() : undefined
        }
      >
        {/* Conteneur interne avec padding */}
        <div className={cn('px-3 py-2 text-sm', contentClassName)}>
          {title && <p className="font-semibold text-xs opacity-90 mb-0.5">{title}</p>}
          {content}
        </div>
        {/* Flèche */}
        {showArrow && (
          <span
            className={cn(
              'absolute w-0 h-0 border-4 border-transparent',
              adjustedPosition === 'top' &&
                'bottom-[-8px] left-1/2 -translate-x-1/2 border-t-4',
              adjustedPosition === 'bottom' &&
                'top-[-8px] left-1/2 -translate-x-1/2 border-b-4',
              adjustedPosition === 'left' &&
                'right-[-8px] top-1/2 -translate-y-1/2 border-l-4',
              adjustedPosition === 'right' &&
                'left-[-8px] top-1/2 -translate-y-1/2 border-r-4',
              arrowBorderColorMap[variant],
              arrowClassName
            )}
          />
        )}
      </motion.div>
    )

    return (
      <div
        ref={containerRef}
        className="relative inline-flex"
        {...eventHandlers}
      >
        {children}
        {isVisible &&
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
export { Tooltip }