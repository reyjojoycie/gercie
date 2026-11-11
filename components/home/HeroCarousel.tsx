// components/home/hero-carousel.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import Image from 'next/image'
import Link from 'next/link'

import {
  motion,
  AnimatePresence,
  type Variants,
} from 'framer-motion'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

import { useAuth } from '@/contexts/AuthContext'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type HeroAnimationVariant = 'slide' | 'fade' | 'zoom'
export type HeroTextPosition = 'left' | 'center' | 'right'
export type HeroButtonVariant = 'gold' | 'luxe' | 'outline' | 'ghost'
export type HeroButtonSize = 'sm' | 'md' | 'lg'
export type HeroDeviceVisibility = 'all' | 'desktop' | 'mobile'
export type HeroAudience = 'all' | 'logged_in' | 'logged_out'

export interface HeroSlideConfig {
  image_alt?: string
  overlay_opacity?: number
  text_position?: HeroTextPosition
  button_variant?: HeroButtonVariant
  button_size?: HeroButtonSize
  link_target?: '_self' | '_blank'
  device_visibility?: HeroDeviceVisibility
  audience?: HeroAudience
  priority_score?: number
  analytics_id?: string
  css_class?: string
  animation_delay?: number
  mobile_image_url?: string
  desktop_image_url?: string
  video_url?: string
  background_color?: string
  gradient_from?: string
  gradient_to?: string
  custom_style?: string
  notes?: string
  approval_status?: string
  tags?: string[]
  [key: string]: unknown
}

export interface HeroSlide {
  id: string
  title: string
  highlight: string
  description: string
  image_url: string
  cta_label: string
  cta_href: string
  image_alt?: string
  is_active?: boolean
  sort_order?: number
  start_date?: string | null
  end_date?: string | null
  priority?: boolean
  config?: HeroSlideConfig
  [key: string]: unknown
}

export interface HeroCarouselProps {
  slides: HeroSlide[]
  direction: 'horizontal' | 'vertical'
  intervalMs: number
  autoplayEnabled?: boolean
  className?: string

  /** Active la slide personnalisée IA pour utilisateur connecté */
  personalized?: boolean

  /** Affiche la barre de progression */
  showProgress?: boolean

  /** Affiche le compteur 1 / n */
  showCounter?: boolean

  /** Active le bouton plein écran */
  enableFullscreen?: boolean

  /** Désactive l’autoplay sur mobile */
  disableAutoplayOnMobile?: boolean

  /** Boucle infinie */
  loop?: boolean

  /** Swipe tactile activé */
  swipeEnabled?: boolean

  /** Navigation clavier activée */
  keyboardEnabled?: boolean

  /** Pause au survol souris */
  pauseOnHover?: boolean

  /** Durée de transition en secondes */
  transitionDuration?: number

  /** Variante d’animation */
  animationVariant?: HeroAnimationVariant

  /** Opacité globale de l’overlay, 0 à 100 */
  overlayOpacity?: number

  /** Position globale du texte */
  textPosition?: HeroTextPosition

  /** Nombre de slides à précharger */
  preloadSlides?: number

  /** Met les slides avec priority_score élevé en premier */
  highPriorityFirst?: boolean

  /** Annonce live pour lecteurs d’écran */
  accessibilityLive?: boolean

  /** Respecte prefers-reduced-motion */
  reduceMotionFallback?: boolean

  /** Affiche les contrôles sur mobile */
  showMobileControls?: boolean

  /** Affiche les flèches */
  showArrows?: boolean

  /** Affiche les dots */
  showDots?: boolean

  /** Affiche les miniatures */
  showThumbnails?: boolean

  /** Met en pause temporairement après interaction manuelle */
  autoplayPauseOnInteraction?: boolean

  /** Délai de reprise après interaction manuelle */
  resumeDelayMs?: number

  /** Nombre de lignes pour la description */
  descriptionLines?: number

  /** Qualité image mobile */
  imageQualityMobile?: number

  /** Qualité image desktop */
  imageQualityDesktop?: number

  /** Sizes pour next/image */
  imageSizes?: string

  /** Classe aspect ratio */
  aspectClassName?: string

  /** Seuil IntersectionObserver */
  visibilityThreshold?: number

  /** Aria label global */
  ariaLabel?: string

  /** Callback changement de slide */
  onSlideChange?: (slide: HeroSlide, index: number) => void

  /** Callback clic CTA */
  onCtaClick?: (slide: HeroSlide, href: string) => void

  /** Callback pause/play */
  onAutoplayToggle?: (paused: boolean) => void

  /** Callback plein écran */
  onFullscreenChange?: (fullscreen: boolean) => void
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const SWIPE_THRESHOLD = 50

const DEFAULT_ASPECT_CLASS =
  'aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/9]'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('//')
}

function getEffectiveImage(slide: HeroSlide, isMobile: boolean): string {
  const config = slide.config || {}

  if (isMobile && config.mobile_image_url) {
    return String(config.mobile_image_url)
  }

  if (!isMobile && config.desktop_image_url) {
    return String(config.desktop_image_url)
  }

  return slide.image_url
}

function getSlidePriority(slide: HeroSlide): number {
  const config = slide.config || {}
  const configPriority = Number(config.priority_score)

  if (Number.isFinite(configPriority)) return configPriority
  if (slide.priority) return 100

  return 0
}

function getSlideVariants(
  variant: HeroAnimationVariant,
  direction: 'horizontal' | 'vertical'
): Variants {
  const distance = 64

  if (variant === 'fade') {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1 },
      exit: { opacity: 0 },
    }
  }

  if (variant === 'zoom') {
    return {
      enter: { opacity: 0, scale: 1.08 },
      center: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.94 },
    }
  }

  return {
    enter: {
      opacity: 0,
      x: direction === 'horizontal' ? distance : 0,
      y: direction === 'vertical' ? distance : 0,
    },
    center: {
      opacity: 1,
      x: 0,
      y: 0,
    },
    exit: {
      opacity: 0,
      x: direction === 'horizontal' ? -distance : 0,
      y: direction === 'vertical' ? -distance : 0,
    },
  }
}

function mapButtonVariant(
  variant?: HeroButtonVariant
): 'primary' | 'outline' | 'ghost' | 'secondary' {
  switch (variant) {
    case 'outline':
      return 'outline'

    case 'ghost':
      return 'ghost'

    case 'gold':
    case 'luxe':
    default:
      return 'primary'
  }
}

function mapButtonSize(size?: HeroButtonSize): 'sm' | 'md' | 'lg' {
  if (size === 'sm') return 'sm'
  if (size === 'lg') return 'lg'
  return 'md'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export function HeroCarousel({
  slides,
  direction,
  intervalMs,
  autoplayEnabled = true,
  className,
  personalized = false,
  showProgress = true,
  showCounter = true,
  enableFullscreen = false,
  disableAutoplayOnMobile = true,
  loop = true,
  swipeEnabled = true,
  keyboardEnabled = true,
  pauseOnHover = true,
  transitionDuration = 0.5,
  animationVariant = 'slide',
  overlayOpacity = 55,
  textPosition = 'left',
  preloadSlides = 2,
  highPriorityFirst = false,
  accessibilityLive = true,
  reduceMotionFallback = true,
  showMobileControls = true,
  showArrows = true,
  showDots = true,
  showThumbnails = false,
  autoplayPauseOnInteraction = true,
  resumeDelayMs = 4000,
  descriptionLines = 3,
  imageQualityMobile = 75,
  imageQualityDesktop = 85,
  imageSizes = '(max-width: 768px) 100vw, 100vw',
  aspectClassName,
  visibilityThreshold = 0.5,
  ariaLabel = 'Carrousel de bannières promotionnelles',
  onSlideChange,
  onCtaClick,
  onAutoplayToggle,
  onFullscreenChange,
}: HeroCarouselProps) {
  const auth = useAuth() as any
  const user = auth?.user ?? null
  const userId = user?.id

  const { prefersReducedMotion } = useAccessibilityPreferences()

  /* ───────────────────────────────────────────────────────────── */
  /*  ÉTATS                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const [personalizedSlide, setPersonalizedSlide] =
    useState<HeroSlide | null>(null)

  const [loadingPersonalized, setLoadingPersonalized] = useState(false)

  const [currentIndex, setCurrentIndex] = useState(0)

  const [isPaused, setIsPaused] = useState(false)
  const [isHoverPaused, setIsHoverPaused] = useState(false)
  const [isFocusPaused, setIsFocusPaused] = useState(false)
  const [isInteractionPaused, setIsInteractionPaused] = useState(false)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)

  const [isMobile, setIsMobile] = useState(false)
  const [isInView, setIsInView] = useState(true)
  const [isPageHidden, setIsPageHidden] = useState(false)

  /* ───────────────────────────────────────────────────────────── */
  /*  REFS                                                         */
  /* ───────────────────────────────────────────────────────────── */

  const containerRef = useRef<HTMLDivElement>(null)
  const autoplayRafRef = useRef<number | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const preloadedUrlsRef = useRef<Set<string>>(new Set())

  /* ───────────────────────────────────────────────────────────── */
  /*  ASPECT RATIO PREMIUM                                         */
  /* ───────────────────────────────────────────────────────────── */

  const resolvedAspectClassName = aspectClassName ?? DEFAULT_ASPECT_CLASS

  /* ───────────────────────────────────────────────────────────── */
  /*  DÉTECTION MOBILE                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(max-width: 767px)')

    const update = () => setIsMobile(mediaQuery.matches)
    update()

    mediaQuery.addEventListener('change', update)

    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  PAGE CACHÉE / VISIBLE                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibility = () => setIsPageHidden(document.hidden)
    handleVisibility()

    document.addEventListener('visibilitychange', handleVisibility)

    return () =>
      document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  INTERSECTION OBSERVER                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const element = containerRef.current

    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting)
      },
      { threshold: visibilityThreshold }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [visibilityThreshold])

  /* ───────────────────────────────────────────────────────────── */
  /*  FULLSCREEN LISTENER                                          */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === containerRef.current
      setIsFullscreen(active)
      onFullscreenChange?.(active)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () =>
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange
      )
  }, [onFullscreenChange])

  /* ───────────────────────────────────────────────────────────── */
  /*  INTERACTION PAUSE / RESUME                                   */
  /* ───────────────────────────────────────────────────────────── */

  const registerInteraction = useCallback(() => {
    if (!autoplayEnabled || !autoplayPauseOnInteraction) return

    setIsInteractionPaused(true)

    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
    }

    resumeTimerRef.current = setTimeout(() => {
      setIsInteractionPaused(false)
      resumeTimerRef.current = null
    }, resumeDelayMs)
  }, [autoplayEnabled, autoplayPauseOnInteraction, resumeDelayMs])

  /* ───────────────────────────────────────────────────────────── */
  /*  CLEANUP TIMERS / RAF                                         */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current)
      }

      if (autoplayRafRef.current) {
        cancelAnimationFrame(autoplayRafRef.current)
      }
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  SLIDES AFFICHÉES                                             */
  /* ───────────────────────────────────────────────────────────── */

  const displaySlides = useMemo(() => {
    const baseSlides = slides.filter((slide) => {
      if (!slide?.id) return false

      const image = getEffectiveImage(slide, isMobile)
      const video = slide.config?.video_url

      if (!image && !video) return false

      const audience = slide.config?.audience || 'all'
      if (audience === 'logged_in' && !user) return false
      if (audience === 'logged_out' && user) return false

      const device = slide.config?.device_visibility || 'all'
      if (device === 'mobile' && !isMobile) return false
      if (device === 'desktop' && isMobile) return false

      return true
    })

    const withPersonalized =
      personalized && personalizedSlide
        ? [personalizedSlide, ...baseSlides]
        : baseSlides

    if (!highPriorityFirst) {
      return withPersonalized
    }

    return withPersonalized
      .map((slide, index) => ({
        slide,
        index,
        priority: getSlidePriority(slide),
      }))
      .sort((a, b) => b.priority - a.priority || a.index - b.index)
      .map((item) => item.slide)
  }, [
    slides,
    personalizedSlide,
    personalized,
    user,
    isMobile,
    highPriorityFirst,
  ])

  const safeIndex =
    displaySlides.length === 0
      ? 0
      : Math.min(currentIndex, displaySlides.length - 1)

  const currentSlide = displaySlides[safeIndex] ?? null
  const currentSlideId = currentSlide?.id

  /* ───────────────────────────────────────────────────────────── */
  /*  INDEX VALIDITÉ                                               */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (
      displaySlides.length > 0 &&
      currentIndex >= displaySlides.length
    ) {
      setCurrentIndex(0)
    }
  }, [displaySlides.length, currentIndex])

  /* ───────────────────────────────────────────────────────────── */
  /*  NAVIGATION                                                   */
  /* ───────────────────────────────────────────────────────────── */

  const goToIndex = useCallback(
    (index: number, userInteraction = false) => {
      const length = displaySlides.length
      if (length === 0) return

      const nextIndex = loop
        ? ((index % length) + length) % length
        : clamp(index, 0, length - 1)

      setCurrentIndex(nextIndex)
      setProgress(0)

      if (userInteraction) {
        registerInteraction()
      }
    },
    [displaySlides.length, loop, registerInteraction]
  )

  const nextSlide = useCallback(() => {
    const length = displaySlides.length
    if (length === 0) return

    setCurrentIndex((prev) => {
      const next = prev + 1
      return loop ? next % length : Math.min(next, length - 1)
    })

    setProgress(0)
    registerInteraction()
  }, [displaySlides.length, loop, registerInteraction])

  const prevSlide = useCallback(() => {
    const length = displaySlides.length
    if (length === 0) return

    setCurrentIndex((prev) => {
      const next = prev - 1
      return loop ? (next + length) % length : Math.max(next, 0)
    })

    setProgress(0)
    registerInteraction()
  }, [displaySlides.length, loop, registerInteraction])

  /* ───────────────────────────────────────────────────────────── */
  /*  PAUSE MANUELLE                                               */
  /* ───────────────────────────────────────────────────────────── */

  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev
      onAutoplayToggle?.(next)
      return next
    })
  }, [onAutoplayToggle])

  /* ───────────────────────────────────────────────────────────── */
  /*  FULLSCREEN TOGGLE                                            */
  /* ───────────────────────────────────────────────────────────── */

  const toggleFullscreen = useCallback(async () => {
    const element = containerRef.current
    if (!element) return

    try {
      if (!document.fullscreenElement) {
        if (element.requestFullscreen) {
          await element.requestFullscreen()
        } else {
          setIsFullscreen(true)
          onFullscreenChange?.(true)
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else {
          setIsFullscreen(false)
          onFullscreenChange?.(false)
        }
      }
    } catch {
      setIsFullscreen((prev) => {
        const next = !prev
        onFullscreenChange?.(next)
        return next
      })
    }
  }, [onFullscreenChange])

  /* ───────────────────────────────────────────────────────────── */
  /*  KEYBOARD                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!keyboardEnabled) return

      const target = event.target as HTMLElement | null
      const isInteractive = target?.closest(
        'a, button, input, select, textarea, [contenteditable="true"]'
      )

      if (event.key === ' ' && isInteractive) {
        return
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          prevSlide()
          break

        case 'ArrowRight':
          event.preventDefault()
          nextSlide()
          break

        case 'ArrowUp':
          if (direction === 'vertical') {
            event.preventDefault()
            prevSlide()
          }
          break

        case 'ArrowDown':
          if (direction === 'vertical') {
            event.preventDefault()
            nextSlide()
          }
          break

        case 'Home':
          event.preventDefault()
          goToIndex(0, true)
          break

        case 'End':
          event.preventDefault()
          goToIndex(displaySlides.length - 1, true)
          break

        case ' ':
          event.preventDefault()
          togglePause()
          break

        default:
          break
      }
    },
    [
      keyboardEnabled,
      direction,
      displaySlides.length,
      goToIndex,
      nextSlide,
      prevSlide,
      togglePause,
    ]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  SWIPE / POINTER                                              */
  /* ───────────────────────────────────────────────────────────── */

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!swipeEnabled) return
      if (event.pointerType === 'mouse') return

      touchStartRef.current = {
        x: event.clientX,
        y: event.clientY,
      }
    },
    [swipeEnabled]
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!touchStartRef.current) return

      const startX = touchStartRef.current.x
      const startY = touchStartRef.current.y

      const deltaX = event.clientX - startX
      const deltaY = event.clientY - startY

      if (direction === 'horizontal') {
        if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
          if (deltaX > 0) prevSlide()
          else nextSlide()
        }
      } else {
        if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
          if (deltaY > 0) prevSlide()
          else nextSlide()
        }
      }

      touchStartRef.current = null
    },
    [direction, nextSlide, prevSlide]
  )

  const handlePointerCancel = useCallback(() => {
    touchStartRef.current = null
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTOPLAY                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const shouldAutoplay = useMemo(() => {
    if (!autoplayEnabled) return false
    if (isPaused) return false
    if (isHoverPaused) return false
    if (isFocusPaused) return false
    if (isInteractionPaused) return false
    if (displaySlides.length <= 1) return false
    if (prefersReducedMotion && reduceMotionFallback) return false
    if (!isInView) return false
    if (isPageHidden) return false
    if (disableAutoplayOnMobile && isMobile) return false

    return true
  }, [
    autoplayEnabled,
    isPaused,
    isHoverPaused,
    isFocusPaused,
    isInteractionPaused,
    displaySlides.length,
    prefersReducedMotion,
    reduceMotionFallback,
    isInView,
    isPageHidden,
    disableAutoplayOnMobile,
    isMobile,
  ])

  useEffect(() => {
    if (!shouldAutoplay) {
      setProgress(0)
      return
    }

    const startedAt = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startedAt
      const percent = Math.min((elapsed / intervalMs) * 100, 100)

      setProgress(percent)

      if (elapsed >= intervalMs) {
        setCurrentIndex((prev) => {
          const length = displaySlides.length
          if (length === 0) return prev

          return loop
            ? (prev + 1) % length
            : Math.min(prev + 1, length - 1)
        })

        setProgress(0)
      } else {
        autoplayRafRef.current = requestAnimationFrame(tick)
      }
    }

    autoplayRafRef.current = requestAnimationFrame(tick)

    return () => {
      if (autoplayRafRef.current) {
        cancelAnimationFrame(autoplayRafRef.current)
        autoplayRafRef.current = null
      }
    }
  }, [
    shouldAutoplay,
    intervalMs,
    displaySlides.length,
    currentIndex,
    loop,
  ])

  /* ───────────────────────────────────────────────────────────── */
  /*  PRELOAD IMAGES                                               */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (preloadSlides <= 0) return
    if (displaySlides.length === 0) return

    const length = displaySlides.length

    for (let offset = 0; offset <= preloadSlides; offset += 1) {
      const index = (safeIndex + offset) % length
      const slide = displaySlides[index]
      const url = getEffectiveImage(slide, isMobile)

      if (url && !preloadedUrlsRef.current.has(url)) {
        preloadedUrlsRef.current.add(url)

        const img = new window.Image()
        img.src = url
      }
    }
  }, [safeIndex, displaySlides, preloadSlides, isMobile])

  /* ───────────────────────────────────────────────────────────── */
  /*  IMAGE ERROR                                                  */
  /* ───────────────────────────────────────────────────────────── */

  const handleImageError = useCallback((slideId: string) => {
    setImageErrors((prev) => {
      const next = new Set(prev)
      next.add(slideId)
      return next
    })
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  SLIDE PERSONNALISÉE IA                                       */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!personalized || !userId) {
      setPersonalizedSlide(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const fetchPersonalized = async () => {
      setLoadingPersonalized(true)

      try {
        const response = await fetch(
          '/api/ai/recommendations?limit=1',
          {
            credentials: 'include',
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()

        if (cancelled) return

        const recommendations = Array.isArray(data)
          ? data
          : data.recommendations

        if (recommendations && recommendations.length > 0) {
          const top = recommendations[0]

          setPersonalizedSlide({
            id: `personalized-${top.id}`,
            title: top.nom || 'Découvrez ce produit',
            highlight: 'Recommandé pour vous',
            description: `Basé sur vos goûts : ${
              top.nom ?? 'sélection personnalisée'
            }`,
            image_url: top.images?.[0] || '/placeholder.jpg',
            cta_label: 'Voir le produit',
            cta_href: `/produits/${top.id}`,
            image_alt: `Produit recommandé : ${top.nom ?? ''}`,
            config: {
              analytics_id: `hero-personalized-${top.id}`,
              audience: 'logged_in',
              device_visibility: 'all',
              link_target: '_self',
              button_variant: 'gold',
              button_size: 'lg',
            },
          })
        }
      } catch (error: unknown) {
        if ((error as Error)?.name !== 'AbortError') {
          console.warn(
            'Erreur chargement recommandations hero:',
            error
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingPersonalized(false)
        }
      }
    }

    fetchPersonalized()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [personalized, userId])

  /* ───────────────────────────────────────────────────────────── */
  /*  ANALYTICS / CALLBACKS                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!currentSlide) return

    onSlideChange?.(currentSlide, safeIndex)

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hero-carousel:slide-change', {
          detail: {
            slideId: currentSlide.id,
            index: safeIndex,
            analyticsId: currentSlide.config?.analytics_id,
            title: currentSlide.title,
          },
        })
      )
    }
  }, [currentSlideId, safeIndex, currentSlide, onSlideChange])

  const handleCtaClick = useCallback(
    (slide: HeroSlide) => {
      onCtaClick?.(slide, slide.cta_href)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('hero-carousel:cta-click', {
            detail: {
              slideId: slide.id,
              href: slide.cta_href,
              analyticsId: slide.config?.analytics_id,
              label: slide.cta_label,
            },
          })
        )
      }
    },
    [onCtaClick]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDU                                                        */
  /* ───────────────────────────────────────────────────────────── */

  if (!currentSlide) {
    if (loadingPersonalized) {
      return (
        <div
          className={cn(
            'w-full animate-pulse bg-muted',
            resolvedAspectClassName
          )}
          role="status"
          aria-label="Chargement du carrousel personnalisé"
        >
          <span className="sr-only">Chargement…</span>
        </div>
      )
    }

    return null
  }

  const isVertical = direction === 'vertical'

  const imageUrl = getEffectiveImage(currentSlide, isMobile)
  const videoUrl = currentSlide.config?.video_url
  const hasImageError = imageErrors.has(currentSlide.id)

  const showVideo = Boolean(videoUrl) && !prefersReducedMotion

  const slideOverlayOpacity =
    clamp(
      Number(currentSlide.config?.overlay_opacity ?? overlayOpacity),
      0,
      100
    ) / 100

  const slideTextPosition =
    currentSlide.config?.text_position || textPosition

  const alignmentClasses =
    slideTextPosition === 'center'
      ? 'items-center text-center'
      : slideTextPosition === 'right'
        ? 'items-end text-right'
        : 'items-start text-left'

  const buttonVariant = mapButtonVariant(
    currentSlide.config?.button_variant as HeroButtonVariant | undefined
  )

  const buttonSize = mapButtonSize(
    currentSlide.config?.button_size as HeroButtonSize | undefined
  )

  const linkTarget =
    currentSlide.config?.link_target ||
    (isExternalHref(currentSlide.cta_href) ? '_blank' : '_self')

  const rel =
    linkTarget === '_blank' ? 'noopener noreferrer' : undefined

  const animationDuration =
    prefersReducedMotion && reduceMotionFallback
      ? 0
      : transitionDuration

  const variants = getSlideVariants(animationVariant, direction)

  const showControlsOnCurrentDevice = !isMobile || showMobileControls

  const animationDelay = Number(
    currentSlide.config?.animation_delay || 0
  )

  const textScrim =
    slideTextPosition === 'left'
      ? 'linear-gradient(to right, rgba(0,0,0,0.58), rgba(0,0,0,0.18) 45%, transparent 72%)'
      : slideTextPosition === 'right'
        ? 'linear-gradient(to left, rgba(0,0,0,0.58), rgba(0,0,0,0.18) 45%, transparent 72%)'
        : 'radial-gradient(circle at center, rgba(0,0,0,0.28), rgba(0,0,0,0.58))'

  const bottomScrim = `linear-gradient(to top, rgba(0,0,0,${slideOverlayOpacity}), rgba(0,0,0,${
    slideOverlayOpacity * 0.45
  }), rgba(0,0,0,${slideOverlayOpacity * 0.08}))`

  return (
    <div
      ref={containerRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={keyboardEnabled ? 0 : -1}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseEnter={() => {
        if (pauseOnHover) setIsHoverPaused(true)
      }}
      onMouseLeave={() => {
        if (pauseOnHover) setIsHoverPaused(false)
      }}
      onFocus={() => setIsFocusPaused(true)}
      onBlur={() => setIsFocusPaused(false)}
      className={cn(
        'group relative isolate w-full overflow-hidden bg-muted',
        isFullscreen && 'fixed inset-0 z-[999] h-screen w-screen',
        className
      )}
      style={{
        touchAction: isVertical ? 'pan-x' : 'pan-y',
      }}
    >
      <div className={cn('relative w-full', resolvedAspectClassName)}>
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={currentSlide.id}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: animationDuration,
              ease: 'easeOut',
            }}
            className={cn(
              'absolute inset-0',
              currentSlide.config?.css_class as string | undefined
            )}
          >
            {/* ====================================================
                MÉDIA : vidéo, image ou fallback
               ==================================================== */}
            {showVideo ? (
              <video
                src={String(videoUrl)}
                poster={imageUrl || undefined}
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden="true"
              />
            ) : imageUrl && !hasImageError ? (
              <Image
                src={imageUrl}
                alt={
                  currentSlide.config?.image_alt ||
                  currentSlide.image_alt ||
                  currentSlide.title ||
                  'Bannière hero'
                }
                fill
                className="object-cover"
                priority={safeIndex === 0}
                sizes={imageSizes}
                quality={
                  isMobile ? imageQualityMobile : imageQualityDesktop
                }
                onError={() => handleImageError(currentSlide.id)}
              />
            ) : (
              <div
                className="absolute inset-0 bg-muted"
                style={{
                  backgroundColor:
                    (currentSlide.config?.background_color as string) ||
                    undefined,
                  backgroundImage:
                    currentSlide.config?.gradient_from &&
                    currentSlide.config?.gradient_to
                      ? `linear-gradient(135deg, ${currentSlide.config.gradient_from}, ${currentSlide.config.gradient_to})`
                      : undefined,
                }}
                aria-hidden="true"
              />
            )}

            {/* ====================================================
                OVERLAY PREMIUM POUR LISIBILITÉ
               ==================================================== */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `${bottomScrim}, ${textScrim}`,
              }}
              aria-hidden="true"
            />

            {/* ====================================================
                CONTENU TEXTE SUR LA PHOTO
               ==================================================== */}
            <Container
              padding="none"
              className={cn(
                'relative z-10 flex h-full w-full flex-col justify-center px-4 text-white sm:px-6 lg:px-8',
                alignmentClasses
              )}
            >
              <div
                className={cn(
                  'max-w-2xl space-y-3 sm:space-y-4 md:space-y-5',
                  slideTextPosition === 'right' && 'ml-auto',
                  slideTextPosition === 'center' && 'mx-auto'
                )}
              >
                {currentSlide.highlight && (
                  <motion.span
                    initial={
                      prefersReducedMotion && reduceMotionFallback
                        ? { opacity: 1 }
                        : { opacity: 0, y: 16 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay:
                        prefersReducedMotion && reduceMotionFallback
                          ? 0
                          : 0.12 + animationDelay / 1000,
                      duration:
                        prefersReducedMotion && reduceMotionFallback
                          ? 0
                          : 0.45,
                      ease: 'easeOut',
                    }}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border border-white/15',
                      'bg-black/35 px-3 py-1 text-xs font-semibold text-white shadow-card backdrop-blur-md',
                      'sm:text-sm'
                    )}
                  >
                    {currentSlide.id.startsWith('personalized') && (
                      <Sparkles
                        size={14}
                        className="text-accent"
                        aria-hidden="true"
                      />
                    )}

                    <span>{currentSlide.highlight}</span>
                  </motion.span>
                )}

                <motion.h1
                  initial={
                    prefersReducedMotion && reduceMotionFallback
                      ? { opacity: 1 }
                      : { opacity: 0, y: 18 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay:
                      prefersReducedMotion && reduceMotionFallback
                        ? 0
                        : 0.2 + animationDelay / 1000,
                    duration:
                      prefersReducedMotion && reduceMotionFallback
                        ? 0
                        : 0.5,
                    ease: 'easeOut',
                  }}
                  className={cn(
                    'font-semibold tracking-tight text-white drop-shadow-lg',
                    'text-2xl leading-tight sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl'
                  )}
                >
                  {currentSlide.title}
                </motion.h1>

                {currentSlide.description && (
                  <motion.p
                    initial={
                      prefersReducedMotion && reduceMotionFallback
                        ? { opacity: 1 }
                        : { opacity: 0, y: 18 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay:
                        prefersReducedMotion && reduceMotionFallback
                          ? 0
                          : 0.3 + animationDelay / 1000,
                      duration:
                        prefersReducedMotion && reduceMotionFallback
                          ? 0
                          : 0.5,
                      ease: 'easeOut',
                    }}
                    className="max-w-xl text-sm leading-relaxed text-white/80 sm:text-base md:text-lg"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: descriptionLines,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {currentSlide.description}
                  </motion.p>
                )}

                {currentSlide.cta_label && currentSlide.cta_href && (
                  <motion.div
                    initial={
                      prefersReducedMotion && reduceMotionFallback
                        ? { opacity: 1 }
                        : { opacity: 0, y: 18 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay:
                        prefersReducedMotion && reduceMotionFallback
                          ? 0
                          : 0.4 + animationDelay / 1000,
                      duration:
                        prefersReducedMotion && reduceMotionFallback
                          ? 0
                          : 0.5,
                      ease: 'easeOut',
                    }}
                    className="pt-1"
                  >
                    {isExternalHref(currentSlide.cta_href) ? (
                      <a
                        href={currentSlide.cta_href}
                        target={linkTarget}
                        rel={rel}
                        className="inline-block"
                        onClick={() => handleCtaClick(currentSlide)}
                      >
                        <Button
                          variant={buttonVariant}
                          size={buttonSize}
                          className="rounded-pill px-5 py-3 text-sm shadow-card sm:text-base"
                          aria-label={`${currentSlide.cta_label} — ${currentSlide.title}`}
                        >
                          {currentSlide.cta_label}
                        </Button>
                      </a>
                    ) : (
                      <Link
                        href={currentSlide.cta_href}
                        target={linkTarget}
                        rel={rel}
                        className="inline-block"
                        onClick={() => handleCtaClick(currentSlide)}
                      >
                        <Button
                          variant={buttonVariant}
                          size={buttonSize}
                          className="rounded-pill px-5 py-3 text-sm shadow-card sm:text-base"
                          aria-label={`${currentSlide.cta_label} — ${currentSlide.title}`}
                        >
                          {currentSlide.cta_label}
                        </Button>
                      </Link>
                    )}
                  </motion.div>
                )}
              </div>
            </Container>
          </motion.div>
        </AnimatePresence>

        {/* ========================================================
            BARRE DE PROGRESSION
           ======================================================== */}
        {showProgress && (shouldAutoplay || progress > 0) && (
          <div
            className="absolute bottom-0 left-0 right-0 z-20 h-[3px] bg-white/10"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progression du carrousel"
          >
            <div
              className="h-full bg-accent transition-all duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* ========================================================
            FLÈCHES
           ======================================================== */}
        {showArrows &&
          displaySlides.length > 1 &&
          showControlsOnCurrentDevice && (
            <>
              <button
                type="button"
                onClick={prevSlide}
                className={cn(
                  'absolute left-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center',
                  'rounded-full border border-white/15 bg-black/35 text-white shadow-card backdrop-blur-md',
                  'transition-all duration-200 ease-out hover:bg-black/55 hover:text-white',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  'sm:left-5 sm:h-11 sm:w-11'
                )}
                aria-label="Slide précédente"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={nextSlide}
                className={cn(
                  'absolute right-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center',
                  'rounded-full border border-white/15 bg-black/35 text-white shadow-card backdrop-blur-md',
                  'transition-all duration-200 ease-out hover:bg-black/55 hover:text-white',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  'sm:right-5 sm:h-11 sm:w-11'
                )}
                aria-label="Slide suivante"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </>
          )}

        {/* ========================================================
            CONTRÔLES HAUT DROITE
           ======================================================== */}
        <div
          className={cn(
            'absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-5 sm:top-5',
            !showControlsOnCurrentDevice && 'hidden'
          )}
        >
          {autoplayEnabled && (
            <button
              type="button"
              onClick={togglePause}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-full',
                'border border-white/15 bg-black/35 text-white shadow-card backdrop-blur-md',
                'transition-all duration-200 ease-out hover:bg-black/55 hover:text-white',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
              )}
              aria-label={
                isPaused
                  ? 'Reprendre la lecture automatique'
                  : 'Mettre en pause'
              }
              aria-pressed={isPaused}
            >
              {isPaused ? (
                <Play size={16} aria-hidden="true" />
              ) : (
                <Pause size={16} aria-hidden="true" />
              )}
            </button>
          )}

          {enableFullscreen && (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-full',
                'border border-white/15 bg-black/35 text-white shadow-card backdrop-blur-md',
                'transition-all duration-200 ease-out hover:bg-black/55 hover:text-white',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
              )}
              aria-label={
                isFullscreen
                  ? 'Quitter le plein écran'
                  : 'Afficher en plein écran'
              }
            >
              {isFullscreen ? (
                <Minimize2 size={16} aria-hidden="true" />
              ) : (
                <Maximize2 size={16} aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        {/* ========================================================
            COMPTEUR
           ======================================================== */}
        {showCounter && displaySlides.length > 1 && (
          <div
            className={cn(
              'absolute left-3 top-3 z-20 inline-flex items-center rounded-full',
              'border border-white/15 bg-black/35 px-3 py-1.5',
              'text-xs font-semibold text-white shadow-card backdrop-blur-md',
              'sm:left-5 sm:top-5 sm:text-sm'
            )}
            aria-live="polite"
            aria-atomic="true"
          >
            {safeIndex + 1} / {displaySlides.length}
          </div>
        )}

        {/* ========================================================
            MINIATURES
           ======================================================== */}
        {showThumbnails &&
          displaySlides.length > 1 &&
          showControlsOnCurrentDevice && (
            <div
              className="absolute bottom-14 left-0 right-0 z-20 flex justify-center gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:bottom-16"
              role="listbox"
              aria-label="Miniatures des slides"
            >
              {displaySlides.map((slide, index) => {
                const thumbUrl = getEffectiveImage(slide, isMobile)

                return (
                  <button
                    key={`thumb-${slide.id}`}
                    type="button"
                    onClick={() => goToIndex(index, true)}
                    role="option"
                    aria-selected={index === safeIndex}
                    aria-label={`Aller à la miniature ${index + 1} : ${slide.title}`}
                    className={cn(
                      'relative h-10 w-16 shrink-0 overflow-hidden rounded-lg border transition-all duration-200',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                      index === safeIndex
                        ? 'border-accent opacity-100 shadow-card'
                        : 'border-white/20 opacity-60 hover:opacity-100'
                    )}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full bg-muted" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

        {/* ========================================================
            DOTS
           ======================================================== */}
        {showDots &&
          displaySlides.length > 1 &&
          showControlsOnCurrentDevice && (
            <div
              className="absolute bottom-4 left-0 right-0 z-20 flex justify-center gap-1.5 sm:bottom-5 sm:gap-2"
              role="tablist"
              aria-label="Navigation par slide"
            >
              {displaySlides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goToIndex(index, true)}
                  className={cn(
                    'h-2 rounded-full transition-all duration-300',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    index === safeIndex
                      ? 'w-6 bg-accent sm:w-8'
                      : 'w-2 bg-white/45 hover:bg-white/75'
                  )}
                  role="tab"
                  aria-selected={index === safeIndex}
                  aria-label={`Aller à la slide ${index + 1} : ${slide.title}`}
                  tabIndex={index === safeIndex ? 0 : -1}
                />
              ))}
            </div>
          )}

        {/* ========================================================
            ANNONCE LECTEUR D’ÉCRAN
           ======================================================== */}
        {accessibilityLive && (
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            Slide {safeIndex + 1} sur {displaySlides.length} :{' '}
            {currentSlide.title}
          </div>
        )}
      </div>
    </div>
  )
}

export { HeroCarousel }
export default HeroCarousel