// components/ui/ScrollToTop.tsx
'use client'

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ChevronUp } from 'lucide-react'
import { Tooltip } from './Tooltip'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTEXTE GLOBAL DU SCROLL                                      */
/* ═══════════════════════════════════════════════════════════════ */

interface ScrollContextValue {
  scrollY: number
  scrollX: number
  scrollHeight: number
  scrollWidth: number
  clientHeight: number
  clientWidth: number
  progress: number
  isScrolled: boolean
  isAtBottom: boolean
  scrollToTop: (behavior?: ScrollBehavior) => void
  scrollToBottom: (behavior?: ScrollBehavior) => void
  scrollTo: (options: {
    top?: number
    left?: number
    behavior?: ScrollBehavior
  }) => void
}

const ScrollContext = createContext<ScrollContextValue | null>(null)

export function useScrollSpy(): ScrollContextValue {
  const context = useContext(ScrollContext)

  if (!context) {
    throw new Error('useScrollSpy must be used within a ScrollProvider')
  }

  return context
}

interface ScrollProviderProps {
  children: ReactNode
}

export function ScrollProvider({ children }: ScrollProviderProps) {
  const [state, setState] = useState({
    scrollY: 0,
    scrollX: 0,
    scrollHeight: 0,
    scrollWidth: 0,
    clientHeight: 0,
    clientWidth: 0,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    let frame = 0

    const update = () => {
      const nextState = {
        scrollY: window.scrollY,
        scrollX: window.scrollX,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientHeight: window.innerHeight,
        clientWidth: window.innerWidth,
      }

      setState((previous) => {
        const isSame =
          Math.abs(previous.scrollY - nextState.scrollY) < 1 &&
          Math.abs(previous.scrollX - nextState.scrollX) < 1 &&
          previous.scrollHeight === nextState.scrollHeight &&
          previous.scrollWidth === nextState.scrollWidth &&
          previous.clientHeight === nextState.clientHeight &&
          previous.clientWidth === nextState.clientWidth

        return isSame ? previous : nextState
      })

      frame = 0
    }

    const handleScrollOrResize = () => {
      if (!frame) {
        frame = requestAnimationFrame(update)
      }
    }

    update()

    window.addEventListener('scroll', handleScrollOrResize, { passive: true })
    window.addEventListener('resize', handleScrollOrResize, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize)
      window.removeEventListener('resize', handleScrollOrResize)

      if (frame) {
        cancelAnimationFrame(frame)
      }
    }
  }, [])

  const maxScrollY = Math.max(0, state.scrollHeight - state.clientHeight)

  const progress = useMemo(() => {
    if (maxScrollY <= 0) return 0
    return Math.min(Math.max(state.scrollY / maxScrollY, 0), 1)
  }, [maxScrollY, state.scrollY])

  const isScrolled = state.scrollY > 300

  const isAtBottom = useMemo(() => {
    if (maxScrollY <= 0) return true
    return state.scrollY >= maxScrollY - 10
  }, [maxScrollY, state.scrollY])

  const scrollToTop = useCallback((behavior: ScrollBehavior = 'smooth') => {
    window.scrollTo({ top: 0, behavior })
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior,
    })
  }, [])

  const scrollTo = useCallback(
    (options: { top?: number; left?: number; behavior?: ScrollBehavior }) => {
      window.scrollTo({
        top: options.top,
        left: options.left,
        behavior: options.behavior ?? 'smooth',
      })
    },
    []
  )

  const value = useMemo<ScrollContextValue>(
    () => ({
      scrollY: state.scrollY,
      scrollX: state.scrollX,
      scrollHeight: state.scrollHeight,
      scrollWidth: state.scrollWidth,
      clientHeight: state.clientHeight,
      clientWidth: state.clientWidth,
      progress,
      isScrolled,
      isAtBottom,
      scrollToTop,
      scrollToBottom,
      scrollTo,
    }),
    [
      isAtBottom,
      isScrolled,
      progress,
      scrollTo,
      scrollToBottom,
      scrollToTop,
      state.clientHeight,
      state.clientWidth,
      state.scrollHeight,
      state.scrollWidth,
      state.scrollX,
      state.scrollY,
    ]
  )

  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES SCROLL TO TOP                                            */
/* ═══════════════════════════════════════════════════════════════ */

type ScrollToTopVariant =
  | 'circle'
  | 'rounded'
  | 'pill'
  | 'icon'
  | 'minimal'
  | 'discreet'

type ScrollToTopPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'custom'

type ScrollToTopSize = 'sm' | 'md' | 'lg'

interface ScrollToTopProps {
  /** Variante visuelle du bouton */
  variant?: ScrollToTopVariant

  /** Position à l’écran */
  position?: ScrollToTopPosition

  /** Style personnalisé quand position === 'custom' */
  customPosition?: CSSProperties

  /** Taille du bouton */
  size?: ScrollToTopSize

  /** Seuil de scroll avant affichage */
  threshold?: number

  /** Affiche la progression circulaire, uniquement pour variant circle */
  showProgress?: boolean

  /** Couleur de la progression */
  progressColor?: string

  /** Épaisseur du cercle de progression */
  progressThickness?: number

  /** Texte du tooltip */
  tooltip?: string

  /** Désactive le tooltip */
  disableTooltip?: boolean

  /** Force la masquer */
  hide?: boolean

  /** Active ou désactive l’animation d’entrée/sortie */
  animate?: boolean

  /** Callback avant scroll */
  onBeforeScroll?: () => void

  /** Affiche aussi un bouton “aller en bas” */
  showScrollToBottom?: boolean

  /** Icône personnalisée pour remonter */
  icon?: ReactNode

  /** Icône personnalisée pour descendre */
  bottomIcon?: ReactNode

  /** Classes additionnelles */
  className?: string

  /** Offset depuis le bas de l’écran */
  offset?: number

  /** Z-index */
  zIndex?: number

  /** Scroll fluide */
  smooth?: boolean

  /** Masque sur mobile */
  hideOnMobile?: boolean

  /** Masque sur desktop */
  hideOnDesktop?: boolean

  /** Affiche le pourcentage dans le bouton circle */
  showPercentage?: boolean

  /** Couleur de fond personnalisée */
  bgColor?: string

  /** Couleur de texte personnalisée */
  textColor?: string

  /** Bordure personnalisée */
  borderColor?: string

  /** Ombre personnalisée */
  shadow?: string

  /** Durée d’animation */
  animationDuration?: number

  /** Raccourci clavier simple, ex: 't' */
  keyboardShortcut?: string

  /** Désactive le bouton pendant le scroll */
  disableDuringScroll?: boolean

  /** Conteneur scrollable personnalisé */
  scrollContainerRef?: React.RefObject<HTMLElement>
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES PREMIUM                                             */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_PROGRESS_COLOR = 'var(--color-accent)'

const sizeMap: Record<ScrollToTopSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const pillSizeMap: Record<ScrollToTopSize, string> = {
  sm: 'h-8 px-3',
  md: 'h-9 px-3.5',
  lg: 'h-10 px-4',
}

const iconSizeMap: Record<ScrollToTopSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
}

const pxSizeMap: Record<ScrollToTopSize, number> = {
  sm: 32,
  md: 40,
  lg: 48,
}

const variantClasses: Record<ScrollToTopVariant, string> = {
  circle:
    'rounded-full border border-line bg-surface/90 text-fg-muted shadow-card backdrop-blur-md ' +
    'hover:border-accent/30 hover:text-accent hover:shadow-card-hover',

  rounded:
    'rounded-xl border border-line bg-surface/90 text-fg-muted shadow-card backdrop-blur-md ' +
    'hover:border-accent/30 hover:text-accent hover:shadow-card-hover',

  pill:
    'rounded-full border border-line bg-surface/90 text-fg-muted shadow-card backdrop-blur-md ' +
    'hover:border-accent/30 hover:text-accent hover:shadow-card-hover',

  icon:
    'rounded-full bg-transparent text-fg-muted ' +
    'hover:bg-muted hover:text-accent',

  minimal:
    'rounded-full bg-transparent text-fg-subtle ' +
    'hover:text-accent',

  discreet:
    'rounded-full border border-transparent bg-surface/70 text-fg-subtle opacity-80 shadow-none backdrop-blur-sm ' +
    'hover:border-line hover:bg-surface hover:text-accent hover:opacity-100 hover:shadow-card',
}

const baseButtonClasses =
  'relative inline-flex items-center justify-center overflow-hidden transition-all duration-200 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
  'disabled:pointer-events-none disabled:opacity-50'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function getPositionStyle(
  position: ScrollToTopPosition,
  offset: number,
  customPosition: CSSProperties | undefined,
  zIndex: number
): CSSProperties {
  const style: CSSProperties = { zIndex }

  if (position === 'custom') {
    return {
      ...style,
      ...customPosition,
    }
  }

  style.bottom = offset

  if (position === 'bottom-right') {
    style.right = offset
  } else if (position === 'bottom-left') {
    style.left = offset
  } else if (position === 'bottom-center') {
    style.left = 0
    style.right = 0
    style.marginInline = 'auto'
    style.width = 'fit-content'
  }

  return style
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCROLL TO TOP                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const ScrollToTop = forwardRef<HTMLButtonElement, ScrollToTopProps>(
  (
    {
      variant = 'circle',
      position = 'bottom-right',
      customPosition,
      size = 'md',
      threshold = 300,
      showProgress = false,
      progressColor = DEFAULT_PROGRESS_COLOR,
      progressThickness = 3,
      tooltip = 'Retour en haut',
      disableTooltip = false,
      hide = false,
      animate = true,
      onBeforeScroll,
      showScrollToBottom = false,
      icon,
      bottomIcon,
      className,
      offset = 16,
      zIndex = 50,
      smooth = true,
      hideOnMobile = false,
      hideOnDesktop = false,
      showPercentage = false,
      bgColor,
      textColor,
      borderColor,
      shadow,
      animationDuration = 0.2,
      keyboardShortcut,
      disableDuringScroll = false,
      scrollContainerRef,
    },
    ref
  ) => {
    const prefersReducedMotion = useReducedMotion()
    const shouldReduceMotion = Boolean(prefersReducedMotion)

    const scrollContext = useContext(ScrollContext)
    const useGlobalScroll = Boolean(scrollContext) && !scrollContainerRef

    const buttonRef = useRef<HTMLButtonElement>(null)
    const bottomButtonRef = useRef<HTMLButtonElement>(null)
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [localProgress, setLocalProgress] = useState(0)
    const [localVisible, setLocalVisible] = useState(false)
    const [isScrolling, setIsScrolling] = useState(false)

    useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement, [])

    const progress = useGlobalScroll ? scrollContext!.progress : localProgress

    const isVisible = useGlobalScroll
      ? scrollContext!.scrollY > threshold && !hide
      : localVisible

    const behavior: ScrollBehavior =
      smooth && !shouldReduceMotion ? 'smooth' : 'auto'

    const scrollToTop = useCallback(() => {
      onBeforeScroll?.()

      const container = scrollContainerRef?.current

      if (container) {
        container.scrollTo({ top: 0, behavior })
      } else {
        window.scrollTo({ top: 0, behavior })
      }
    }, [behavior, onBeforeScroll, scrollContainerRef])

    const scrollToBottom = useCallback(() => {
      const container = scrollContainerRef?.current

      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        })
      } else {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior,
        })
      }
    }, [behavior, scrollContainerRef])

    /* ─────────────────────────────────────────────────────────── */
    /*  SCROLL LOCAL                                               */
    /*                                                             */
    /*  Désactivé si ScrollProvider est déjà présent et qu’aucun   */
    /*  conteneur personnalisé n’est fourni.                       */
    /* ─────────────────────────────────────────────────────────── */

    useEffect(() => {
      if (useGlobalScroll) return

      const container = scrollContainerRef?.current
      const isWindow = !container

      let frame = 0

      const update = () => {
        const currentScrollY = isWindow
          ? window.scrollY
          : container!.scrollTop

        const maxScroll = isWindow
          ? document.documentElement.scrollHeight - window.innerHeight
          : container!.scrollHeight - container!.clientHeight

        const nextProgress =
          maxScroll > 0
            ? Math.min(Math.max(currentScrollY / maxScroll, 0), 1)
            : 0

        const nextVisible = currentScrollY > threshold && !hide

        setLocalProgress((previous) =>
          Math.abs(previous - nextProgress) < 0.001 ? previous : nextProgress
        )

        setLocalVisible((previous) =>
          previous === nextVisible ? previous : nextVisible
        )

        if (disableDuringScroll) {
          setIsScrolling(true)

          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current)
          }

          scrollTimeoutRef.current = setTimeout(() => {
            setIsScrolling(false)
          }, 150)
        }

        frame = 0
      }

      const handleScroll = () => {
        if (!frame) {
          frame = requestAnimationFrame(update)
        }
      }

      const target = (isWindow ? window : container!) as EventTarget

      update()

      target.addEventListener('scroll', handleScroll, { passive: true })
      window.addEventListener('resize', handleScroll, { passive: true })

      return () => {
        target.removeEventListener('scroll', handleScroll)
        window.removeEventListener('resize', handleScroll)

        if (frame) {
          cancelAnimationFrame(frame)
        }

        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
      }
    }, [
      disableDuringScroll,
      hide,
      scrollContainerRef,
      threshold,
      useGlobalScroll,
    ])

    /* ─────────────────────────────────────────────────────────── */
    /*  RACCOURCI CLAVIER                                          */
    /* ─────────────────────────────────────────────────────────── */

    useEffect(() => {
      if (!keyboardShortcut) return

      const normalizedShortcut = keyboardShortcut.toLowerCase()

      const handleKeyDown = (event: KeyboardEvent) => {
        const targetElement = event.target as HTMLElement | null

        const isEditable =
          targetElement?.tagName === 'INPUT' ||
          targetElement?.tagName === 'TEXTAREA' ||
          targetElement?.isContentEditable

        if (isEditable) return

        if (
          event.key.toLowerCase() === normalizedShortcut &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault()
          scrollToTop()
        }
      }

      window.addEventListener('keydown', handleKeyDown)

      return () => {
        window.removeEventListener('keydown', handleKeyDown)
      }
    }, [keyboardShortcut, scrollToTop])

    /* ─────────────────────────────────────────────────────────── */
    /*  PROGRESSION CIRCULAIRE                                     */
    /* ─────────────────────────────────────────────────────────── */

    const sizePx = pxSizeMap[size]
    const center = sizePx / 2
    const radius = Math.max(
      8,
      (sizePx - progressThickness * 2 - 6) / 2
    )
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference * (1 - progress)

    const shouldShowProgressCircle =
      showProgress && variant === 'circle'

    const shouldShowPercentage =
      showPercentage && variant === 'circle'

    const progressCircle = shouldShowProgressCircle && (
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
        viewBox={`0 0 ${sizePx} ${sizePx}`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={progressThickness}
          className="text-line"
        />

        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={progressThickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: shouldReduceMotion
              ? undefined
              : 'stroke-dashoffset 75ms linear',
          }}
        />
      </svg>
    )

    /* ─────────────────────────────────────────────────────────── */
    /*  BOUTON HAUT                                                */
    /* ─────────────────────────────────────────────────────────── */

    const buttonSizeClass =
      variant === 'pill' ? pillSizeMap[size] : sizeMap[size]

    const topButton = (
      <button
        ref={buttonRef}
        type="button"
        onClick={scrollToTop}
        disabled={disableDuringScroll && isScrolling}
        className={cn(
          baseButtonClasses,
          variantClasses[variant],
          buttonSizeClass,
          className
        )}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          borderColor,
          boxShadow: shadow,
        }}
        aria-label={tooltip || 'Retour en haut de la page'}
      >
        {shouldShowPercentage ? (
          <span className="text-[10px] font-bold tabular-nums">
            {Math.round(progress * 100)}
          </span>
        ) : (
          icon || <ChevronUp size={iconSizeMap[size]} />
        )}

        {variant === 'pill' && (
          <span className="ml-2 hidden text-sm font-medium sm:inline">
            Haut
          </span>
        )}

        {progressCircle}
      </button>
    )

    const wrappedTopButton =
      disableTooltip || !tooltip ? (
        topButton
      ) : (
        <Tooltip content={tooltip}>{topButton}</Tooltip>
      )

    /* ─────────────────────────────────────────────────────────── */
    /*  BOUTON BAS                                                 */
    /* ─────────────────────────────────────────────────────────── */

    const showBottomButton =
      showScrollToBottom && progress < 0.99

    const bottomButton = showBottomButton && (
      <button
        ref={bottomButtonRef}
        type="button"
        onClick={scrollToBottom}
        className={cn(
          baseButtonClasses,
          variantClasses.circle,
          sizeMap[size],
          variant === 'discreet' && 'opacity-80 hover:opacity-100'
        )}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          borderColor,
          boxShadow: shadow,
        }}
        aria-label="Aller en bas de la page"
      >
        {bottomIcon || <ArrowDown size={iconSizeMap[size]} />}
      </button>
    )

    /* ─────────────────────────────────────────────────────────── */
    /*  AFFICHAGE RESPONSIVE                                       */
    /* ─────────────────────────────────────────────────────────── */

    const displayClass = hideOnMobile
      ? 'hidden md:flex'
      : hideOnDesktop
        ? 'flex md:hidden'
        : 'flex'

    const shouldAnimate = animate && !shouldReduceMotion

    const positionStyle = getPositionStyle(
      position,
      offset,
      customPosition,
      zIndex
    )

    return (
      <AnimatePresence>
        {isVisible && !hide && (
          <motion.div
            initial={
              shouldAnimate
                ? { opacity: 0, scale: 0.85, y: 12 }
                : undefined
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              shouldAnimate
                ? { opacity: 0, scale: 0.85, y: 12 }
                : undefined
            }
            transition={{
              duration: shouldAnimate ? animationDuration : 0,
              ease: 'easeOut',
            }}
            className={cn(
              'fixed flex flex-col items-center gap-2',
              displayClass,
              className
            )}
            style={positionStyle}
          >
            {wrappedTopButton}
            {bottomButton}
          </motion.div>
        )}
      </AnimatePresence>
    )
  }
)

ScrollToTop.displayName = 'ScrollToTop'

/* ═══════════════════════════════════════════════════════════════ */
/*  SCROLL PROGRESS BAR                                            */
/* ═══════════════════════════════════════════════════════════════ */

interface ScrollProgressBarProps {
  /** Hauteur de la barre */
  height?: number

  /** Couleur unie */
  color?: string

  /**
   * Dégradé CSS personnalisé.
   * Exemple : 'linear-gradient(to right, #1d3ab8, #172f91)'
   *
   * Si une ancienne classe Tailwind type 'from-gold-400...' est passée,
   * elle est ignorée au profit du dégradé premium par défaut.
   */
  gradient?: string

  /** Position */
  position?: 'top' | 'bottom'

  /** Bord arrondi */
  rounded?: boolean

  /** Masque complètement la barre */
  hidden?: boolean

  /** Z-index */
  zIndex?: number

  /** Affiche le pourcentage */
  showPercentage?: boolean

  /** Ombre */
  shadow?: boolean

  /** Animation pulse */
  pulse?: boolean

  /** Durée de transition */
  transitionDuration?: number

  /** Toujours visible, même sans scroll */
  alwaysVisible?: boolean

  /** Conteneur scrollable personnalisé */
  scrollContainerRef?: React.RefObject<HTMLElement>
}

export function ScrollProgressBar({
  height = 3,
  color,
  gradient,
  position = 'top',
  rounded = false,
  hidden = false,
  zIndex = 100,
  showPercentage = false,
  shadow = false,
  pulse = false,
  transitionDuration = 0.1,
  alwaysVisible = false,
  scrollContainerRef,
}: ScrollProgressBarProps) {
  const prefersReducedMotion = useReducedMotion()
  const shouldReduceMotion = Boolean(prefersReducedMotion)

  const scrollContext = useContext(ScrollContext)
  const useGlobalScroll = Boolean(scrollContext) && !scrollContainerRef

  const [localProgress, setLocalProgress] = useState(0)

  const progress = useGlobalScroll ? scrollContext!.progress : localProgress

  useEffect(() => {
    if (useGlobalScroll) return

    const container = scrollContainerRef?.current
    const isWindow = !container

    let frame = 0

    const update = () => {
      const currentScrollY = isWindow
        ? window.scrollY
        : container!.scrollTop

      const maxScroll = isWindow
        ? document.documentElement.scrollHeight - window.innerHeight
        : container!.scrollHeight - container!.clientHeight

      const nextProgress =
        maxScroll > 0
          ? Math.min(Math.max(currentScrollY / maxScroll, 0), 1)
          : 0

      setLocalProgress((previous) =>
        Math.abs(previous - nextProgress) < 0.001 ? previous : nextProgress
      )

      frame = 0
    }

    const handleScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update)
      }
    }

    const target = (isWindow ? window : container!) as EventTarget

    update()

    target.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      target.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)

      if (frame) {
        cancelAnimationFrame(frame)
      }
    }
  }, [scrollContainerRef, useGlobalScroll])

  const backgroundStyle = useMemo<CSSProperties>(() => {
    if (color) {
      return { backgroundColor: color }
    }

    if (gradient) {
      const trimmed = gradient.trim()

      if (
        trimmed.startsWith('linear-gradient') ||
        trimmed.startsWith('radial-gradient') ||
        trimmed.startsWith('conic-gradient')
      ) {
        return { backgroundImage: trimmed }
      }
    }

    return {
      backgroundImage:
        'linear-gradient(to right, var(--color-accent), var(--color-accent-hover))',
    }
  }, [color, gradient])

  if (hidden) return null

  const percentage = Math.round(progress * 100)

  return (
    <div
      role="progressbar"
      aria-label="Progression de lecture"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      className={cn(
        'fixed left-0 right-0 overflow-hidden',
        position === 'top' ? 'top-0' : 'bottom-0',
        rounded && 'rounded-full',
        shadow && 'shadow-card'
      )}
      style={{ height, zIndex }}
    >
      <motion.div
        className={cn(
          'h-full origin-left',
          pulse && !shouldReduceMotion && 'animate-pulse-soft'
        )}
        style={backgroundStyle}
        initial={false}
        animate={{
          width: alwaysVisible ? '100%' : `${progress * 100}%`,
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : transitionDuration,
          ease: 'easeOut',
        }}
      />

      {showPercentage && progress > 0.02 && (
        <div
          className="absolute inset-y-0 right-2 flex items-center text-[10px] font-bold text-accent-contrast"
          style={{ textShadow: '0 0 4px rgba(0,0,0,0.35)' }}
          aria-hidden="true"
        >
          {percentage}%
        </div>
      )}
    </div>
  )
}

export { ScrollToTop }
export default ScrollToTop