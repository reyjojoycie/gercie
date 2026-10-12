// components/ui/ScrollToTop.tsx
'use client'

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
  createContext,
  useContext,
  ReactNode,
  useMemo,
} from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence, useScroll, useSpring, useMotionValueEvent } from 'framer-motion'
import { ArrowUp, ArrowDown, ChevronUp, ChevronDown } from 'lucide-react'
import { Tooltip } from './Tooltip'

/* ========================================================================
   Contexte global du ScrollSpy (partage l'état du scroll)
   ======================================================================== */
interface ScrollContextValue {
  scrollY: number
  scrollHeight: number
  clientHeight: number
  progress: number
  isScrolled: boolean
  isAtBottom: boolean
  scrollToTop: (behavior?: ScrollBehavior) => void
  scrollToBottom: (behavior?: ScrollBehavior) => void
  scrollTo: (options: { top?: number; left?: number; behavior?: ScrollBehavior }) => void
  scrollX: number
  scrollWidth: number
  clientWidth: number
}

const ScrollContext = createContext<ScrollContextValue | null>(null)

export const useScrollSpy = () => {
  const ctx = useContext(ScrollContext)
  if (!ctx) throw new Error('useScrollSpy must be used within a ScrollProvider')
  return ctx
}

export const ScrollProvider = ({ children }: { children: ReactNode }) => {
  const [scrollY, setScrollY] = useState(0)
  const [scrollX, setScrollX] = useState(0)
  const [scrollHeight, setScrollHeight] = useState(0)
  const [scrollWidth, setScrollWidth] = useState(0)
  const [clientHeight, setClientHeight] = useState(0)
  const [clientWidth, setClientWidth] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY)
      setScrollX(window.scrollX)
      setScrollHeight(document.documentElement.scrollHeight)
      setScrollWidth(document.documentElement.scrollWidth)
      setClientHeight(window.innerHeight)
      setClientWidth(window.innerWidth)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [])

  const progress = scrollHeight > clientHeight ? scrollY / (scrollHeight - clientHeight) : 0
  const isScrolled = scrollY > 300
  const isAtBottom = Math.ceil(scrollY + clientHeight) >= scrollHeight - 10

  const scrollToTop = useCallback((behavior: ScrollBehavior = 'smooth') => {
    window.scrollTo({ top: 0, behavior })
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior })
  }, [])

  const scrollTo = useCallback((options: { top?: number; left?: number; behavior?: ScrollBehavior }) => {
    window.scrollTo({ top: options.top, left: options.left, behavior: options.behavior ?? 'smooth' })
  }, [])

  return (
    <ScrollContext.Provider
      value={{
        scrollY,
        scrollHeight,
        clientHeight,
        progress,
        isScrolled,
        isAtBottom,
        scrollToTop,
        scrollToBottom,
        scrollTo,
        scrollX,
        scrollWidth,
        clientWidth,
      }}
    >
      {children}
    </ScrollContext.Provider>
  )
}

/* ========================================================================
   Types du composant ScrollToTop
   ======================================================================== */
type ScrollToTopVariant = 'circle' | 'rounded' | 'pill' | 'icon' | 'minimal' | 'discreet'
type ScrollToTopPosition = 'bottom-right' | 'bottom-left' | 'bottom-center' | 'custom'
type ScrollToTopSize = 'sm' | 'md' | 'lg'

interface ScrollToTopProps {
  /** Variante de forme */
  variant?: ScrollToTopVariant
  /** Position à l'écran */
  position?: ScrollToTopPosition
  /** Position custom (object style) quand position === 'custom' */
  customPosition?: React.CSSProperties
  /** Taille */
  size?: ScrollToTopSize
  /** Seuil de défilement (px) avant apparition */
  threshold?: number
  /** Affiche la progression circulaire (uniquement pour variant circle) */
  showProgress?: boolean
  /** Couleur de la progression */
  progressColor?: string
  /** Épaisseur du cercle de progression */
  progressThickness?: number
  /** Tooltip au survol */
  tooltip?: string
  /** Désactive le tooltip */
  disableTooltip?: boolean
  /** Masquer le bouton retour en haut */
  hide?: boolean
  /** Animation d'entrée */
  animate?: boolean
  /** Fonction de callback avant de défiler */
  onBeforeScroll?: () => void
  /** Affiche aussi un bouton "aller en bas" */
  showScrollToBottom?: boolean
  /** Icône personnalisée */
  icon?: ReactNode
  /** Icône pour aller en bas */
  bottomIcon?: ReactNode
  /** Classe additionnelle */
  className?: string
  /** Offset depuis le bord (px) */
  offset?: number
  /** Z-index */
  zIndex?: number
  /** Désactiver le lissage (scroll instantané) */
  smooth?: boolean
  /** Masquer sur mobile (écran < 768px) */
  hideOnMobile?: boolean
  /** Masquer sur desktop */
  hideOnDesktop?: boolean
  /** Afficher un indicateur de pourcentage dans le bouton (variant circle) */
  showPercentage?: boolean
  /** Couleur de fond personnalisée */
  bgColor?: string
  /** Couleur du texte personnalisée */
  textColor?: string
  /** Style de bordure personnalisé */
  borderColor?: string
  /** Ombre portée personnalisée */
  shadow?: string
  /** Durée de l'animation d'entrée/sortie (secondes) */
  animationDuration?: number
  /** Raccourci clavier pour remonter (ex: 'c' pour Ctrl+C, non implémenté ici) */
  keyboardShortcut?: string
  /** Désactiver le bouton pendant le défilement */
  disableDuringScroll?: boolean
  /** Conteneur scrollable (pour les conteneurs overflow) – si fourni, utilise le scroll de ce conteneur */
  scrollContainerRef?: React.RefObject<HTMLElement>
}

const positionClasses: Record<ScrollToTopPosition, string> = {
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  custom: '',
}

const sizeMap: Record<ScrollToTopSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const iconSizeMap: Record<ScrollToTopSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
}

/* ========================================================================
   Composant ScrollToTop
   ======================================================================== */
const ScrollToTop = forwardRef<HTMLButtonElement, ScrollToTopProps>(
  (
    {
      variant = 'circle',
      position = 'bottom-right',
      customPosition,
      size = 'md',
      threshold = 300,
      showProgress = false,
      progressColor = 'var(--color-brand-500)',
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
    const [isVisible, setIsVisible] = useState(false)
    const [progress, setProgress] = useState(0)
    const [isMobile, setIsMobile] = useState(false)
    const [scrolling, setScrolling] = useState(false)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const bottomButtonRef = useRef<HTMLButtonElement>(null)
    const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

    useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement)

    // Détection du support mobile
    useEffect(() => {
      const mq = window.matchMedia('(max-width: 767px)')
      setIsMobile(mq.matches)
      const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }, [])

    // Gestion du défilement
    useEffect(() => {
      const container = scrollContainerRef?.current ?? window

      const handleScroll = () => {
        const scrollY = container instanceof Window ? window.scrollY : container.scrollTop
        const docHeight =
          container instanceof Window
            ? document.documentElement.scrollHeight - window.innerHeight
            : container.scrollHeight - container.clientHeight

        const currentProgress = docHeight > 0 ? Math.min(scrollY / docHeight, 1) : 0
        setProgress(currentProgress)
        setIsVisible(scrollY > threshold && !hide)

        if (disableDuringScroll) {
          setScrolling(true)
          if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
          scrollTimeout.current = setTimeout(() => setScrolling(false), 150)
        }
      }

      handleScroll()
      container.addEventListener('scroll', handleScroll, { passive: true })
      window.addEventListener('resize', handleScroll, { passive: true })
      return () => {
        container.removeEventListener('scroll', handleScroll)
        window.removeEventListener('resize', handleScroll)
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
      }
    }, [threshold, hide, disableDuringScroll, scrollContainerRef])

    // Raccourci clavier (si fourni)
    useEffect(() => {
      if (!keyboardShortcut) return
      const handler = (e: KeyboardEvent) => {
        if (e.key === keyboardShortcut && !e.ctrlKey && !e.metaKey && !e.altKey) {
          scrollToTop()
        }
      }
      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }, [keyboardShortcut])

    const scrollToTop = useCallback(() => {
      onBeforeScroll?.()
      const container = scrollContainerRef?.current
      if (container) {
        container.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
      } else {
        window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
      }
    }, [onBeforeScroll, smooth, scrollContainerRef])

    const scrollToBottom = useCallback(() => {
      const container = scrollContainerRef?.current
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
      }
    }, [smooth, scrollContainerRef])

    // Calcul du cercle SVG pour la progression
    const radius = size === 'sm' ? 12 : size === 'lg' ? 16 : 14
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - progress * circumference

    const progressCircle = showProgress && variant === 'circle' && (
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={progressThickness}
          className="text-neutral-200 dark:text-neutral-700"
        />
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={progressThickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-75"
        />
      </svg>
    )

    const percentageDisplay = showPercentage && variant === 'circle' && (
      <span className="absolute text-[10px] font-bold text-neutral-600 dark:text-neutral-300">
        {Math.round(progress * 100)}
      </span>
    )

    const buttonContent = (
      <button
        ref={buttonRef}
        onClick={scrollToTop}
        disabled={disableDuringScroll && scrolling}
        className={cn(
          'relative flex items-center justify-center transition-all duration-300',
          'bg-white dark:bg-neutral-800 shadow-lg hover:shadow-xl',
          'border border-neutral-200 dark:border-neutral-700',
          'text-neutral-700 dark:text-neutral-300 hover:text-brand-600 dark:hover:text-brand-400',
          'focus-visible:outline-2 focus-visible:outline-brand-500',
          variant === 'circle' || variant === 'minimal' || variant === 'discreet'
            ? 'rounded-full'
            : variant === 'pill'
              ? 'rounded-full px-4 py-2'
              : 'rounded-xl',
          variant === 'discreet' && 'opacity-60 hover:opacity-100',
          sizeMap[size],
          className
        )}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          borderColor: borderColor,
          boxShadow: shadow,
        }}
        aria-label="Retour en haut de la page"
      >
        {icon || <ChevronUp size={iconSizeMap[size]} />}
        {variant === 'pill' && <span className="ml-2 text-sm font-medium">Haut</span>}
        {progressCircle}
        {percentageDisplay}
      </button>
    )

    const bottomButton = showScrollToBottom && (
      <button
        ref={bottomButtonRef}
        onClick={scrollToBottom}
        className={cn(
          'relative flex items-center justify-center mt-3 transition-all duration-300',
          'bg-white dark:bg-neutral-800 shadow-lg hover:shadow-xl',
          'border border-neutral-200 dark:border-neutral-700',
          'text-neutral-700 dark:text-neutral-300 hover:text-brand-600 dark:hover:text-brand-400',
          'focus-visible:outline-2 focus-visible:outline-brand-500',
          'rounded-full',
          sizeMap[size],
          variant === 'discreet' && 'opacity-60 hover:opacity-100',
        )}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          borderColor: borderColor,
          boxShadow: shadow,
        }}
        aria-label="Aller en bas de la page"
      >
        {bottomIcon || <ArrowDown size={iconSizeMap[size]} />}
      </button>
    )

    const wrapper = (content: ReactNode) =>
      disableTooltip ? (
        content
      ) : (
        <Tooltip content={tooltip} position="left" delay={300}>
          {content}
        </Tooltip>
      )

    // Visibilité conditionnelle
    const shouldHide =
      hide ||
      (hideOnMobile && isMobile) ||
      (hideOnDesktop && !isMobile)

    return (
      <AnimatePresence>
        {isVisible && !shouldHide && (
          <motion.div
            initial={animate ? { opacity: 0, scale: 0.8, y: 10 } : false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={animate ? { opacity: 0, scale: 0.8, y: 10 } : false}
            transition={{ duration: animationDuration }}
            className={cn(
              'fixed flex flex-col items-center',
              position === 'custom' ? '' : positionClasses[position]
            )}
            style={
              position === 'custom'
                ? { ...customPosition, zIndex }
                : { zIndex, bottom: offset }
            }
          >
            <div className="flex flex-col items-center gap-2">
              {wrapper(buttonContent)}
              {bottomButton}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }
)
ScrollToTop.displayName = 'ScrollToTop'

/* ========================================================================
   Composant ScrollProgressBar (barre horizontale en haut de page)
   ======================================================================== */
interface ScrollProgressBarProps {
  /** Hauteur de la barre */
  height?: number
  /** Couleur de la barre (classe Tailwind ou CSS) */
  color?: string
  /** Dégradé (ex: 'from-brand-500 to-accent-500') */
  gradient?: string
  /** Position (top, bottom) */
  position?: 'top' | 'bottom'
  /** Arrondi */
  rounded?: boolean
  /** Masquer par défaut */
  hidden?: boolean
  /** Z-index */
  zIndex?: number
  /** Afficher un indicateur de pourcentage */
  showPercentage?: boolean
  /** Ombre portée */
  shadow?: boolean
  /** Animation de pulsation */
  pulse?: boolean
  /** Style de transition */
  transitionDuration?: number
  /** Toujours visible (même sans scroll) */
  alwaysVisible?: boolean
  /** Conteneur scrollable */
  scrollContainerRef?: React.RefObject<HTMLElement>
}

const ScrollProgressBar = ({
  height = 4,
  color = 'var(--color-brand-500)',
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
}: ScrollProgressBarProps) => {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const container = scrollContainerRef?.current ?? window
    const handleScroll = () => {
      const scrollY = container instanceof Window ? window.scrollY : container.scrollTop
      const docHeight =
        container instanceof Window
          ? document.documentElement.scrollHeight - window.innerHeight
          : container.scrollHeight - container.clientHeight
      setProgress(docHeight > 0 ? Math.min(scrollY / docHeight, 1) : 0)
    }
    handleScroll()
    container.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [scrollContainerRef])

  if (hidden) return null

  return (
    <div
      className={cn(
        'fixed left-0 right-0',
        position === 'top' ? 'top-0' : 'bottom-0',
        rounded && 'rounded-full',
        shadow && 'shadow-lg'
      )}
      style={{ height, zIndex }}
    >
      <motion.div
        className={cn(
          'h-full',
          gradient ? `bg-gradient-to-r ${gradient}` : '',
          pulse && 'animate-pulse'
        )}
        style={{
          width: `${alwaysVisible ? 100 : progress * 100}%`,
          backgroundColor: gradient ? undefined : color,
        }}
        initial={{ width: 0 }}
        animate={{ width: `${alwaysVisible ? 100 : progress * 100}%` }}
        transition={{ duration: transitionDuration }}
      />
      {showPercentage && (
        <div
          className="absolute top-1/2 -translate-y-1/2 right-2 text-[10px] font-bold text-white drop-shadow"
          style={{ textShadow: '0 0 4px rgba(0,0,0,0.5)' }}
        >
          {Math.round(progress * 100)}%
        </div>
      )}
    </div>
  )
}

export { ScrollToTop, ScrollProgressBar }