// components/home/HeroCarousel.tsx
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { Sparkles, ChevronLeft, ChevronRight, Maximize2, Pause, Play } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface Slide {
  id: string
  title: string
  highlight: string
  description: string
  image_url: string
  cta_label: string
  cta_href: string
  image_alt?: string
}

interface HeroCarouselProps {
  slides: Slide[]
  direction: 'horizontal' | 'vertical'
  intervalMs: number
  autoplayEnabled?: boolean
  className?: string
  /** Active la personnalisation IA (slide "Pour vous" issue des recommandations) */
  personalized?: boolean
  /** Affiche la barre de progression */
  showProgress?: boolean
  /** Affiche le compteur de slides */
  showCounter?: boolean
  /** Active le mode plein écran */
  enableFullscreen?: boolean
  /** Désactive l'autoplay sur mobile */
  disableAutoplayOnMobile?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const SLIDE_TRANSITION_DURATION = 0.5
const PROGRESS_UPDATE_INTERVAL = 50 // ms
const SWIPE_THRESHOLD = 50 // pixels
const PRELOAD_NEXT_SLIDES = 2 // nombre de slides à précharger

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
}: HeroCarouselProps) {
  const { user } = useAuth()
  const { prefersReducedMotion } = useAccessibilityPreferences()
  
  // États
  const [personalizedSlide, setPersonalizedSlide] = useState<Slide | null>(null)
  const [loadingPersonalized, setLoadingPersonalized] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [isInView, setIsInView] = useState(true)
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const autoplayTimerRef = useRef<NodeJS.Timeout | null>(null)
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Toutes les slides : la slide personnalisée en premier si elle existe
  const displaySlides = useMemo(() => {
    if (personalized && personalizedSlide) {
      return [personalizedSlide, ...slides]
    }
    return slides
  }, [personalized, personalizedSlide, slides])

  // Détection mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Intersection Observer pour pause automatique quand hors viewport
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInView(entry.isIntersecting)
        })
      },
      { threshold: 0.5 }
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  NAVIGATION                                                   */
  /* ───────────────────────────────────────────────────────────── */

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % displaySlides.length)
    setProgress(0)
  }, [displaySlides.length])

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + displaySlides.length) % displaySlides.length)
    setProgress(0)
  }, [displaySlides.length])

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index)
    setProgress(0)
  }, [])

  // Préchargement des slides suivantes
  useEffect(() => {
    const preloadSlides = () => {
      for (let i = 1; i <= PRELOAD_NEXT_SLIDES; i++) {
        const nextIndex = (currentIndex + i) % displaySlides.length
        const nextSlide = displaySlides[nextIndex]
        if (nextSlide?.image_url) {
          const img = new window.Image()
          img.src = nextSlide.image_url
        }
      }
    }
    preloadSlides()
  }, [currentIndex, displaySlides])

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTOPLAY                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const shouldAutoplay = useMemo(() => {
    if (!autoplayEnabled) return false
    if (isPaused) return false
    if (displaySlides.length <= 1) return false
    if (prefersReducedMotion) return false
    if (!isInView) return false
    if (disableAutoplayOnMobile && isMobile) return false
    return true
  }, [autoplayEnabled, isPaused, displaySlides.length, prefersReducedMotion, isInView, disableAutoplayOnMobile, isMobile])

  useEffect(() => {
    if (shouldAutoplay) {
      autoplayTimerRef.current = setInterval(nextSlide, intervalMs)
      
      // Progress bar
      if (showProgress) {
        const startTime = Date.now()
        progressTimerRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime
          const progressPercent = Math.min((elapsed / intervalMs) * 100, 100)
          setProgress(progressPercent)
        }, PROGRESS_UPDATE_INTERVAL)
      }
    }

    return () => {
      if (autoplayTimerRef.current) {
        clearInterval(autoplayTimerRef.current)
        autoplayTimerRef.current = null
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [shouldAutoplay, intervalMs, nextSlide, showProgress])

  /* ───────────────────────────────────────────────────────────── */
  /*  KEYBOARD NAVIGATION                                          */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isInView) return
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          prevSlide()
          break
        case 'ArrowRight':
          e.preventDefault()
          nextSlide()
          break
        case ' ':
          e.preventDefault()
          setIsPaused((p) => !p)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isInView, prevSlide, nextSlide])

  /* ───────────────────────────────────────────────────────────── */
  /*  TOUCH GESTURES (SWIPE)                                       */
  /* ───────────────────────────────────────────────────────────── */

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      }

      const deltaX = touchEnd.x - touchStartRef.current.x
      const deltaY = touchEnd.y - touchStartRef.current.y

      if (direction === 'horizontal') {
        if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
          if (deltaX > 0) {
            prevSlide()
          } else {
            nextSlide()
          }
        }
      } else {
        if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
          if (deltaY > 0) {
            prevSlide()
          } else {
            nextSlide()
          }
        }
      }

      touchStartRef.current = null
    },
    [direction, prevSlide, nextSlide]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  RÉINITIALISATION                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setCurrentIndex(0)
    setProgress(0)
  }, [displaySlides])

  /* ───────────────────────────────────────────────────────────── */
  /*  CHARGEMENT SLIDE PERSONNALISÉE                               */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!personalized || !user) {
      setPersonalizedSlide(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const fetchPersonalized = async () => {
      setLoadingPersonalized(true)
      try {
        const res = await fetch('/api/ai/recommendations?limit=1', {
          credentials: 'include',
          signal: controller.signal,
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data = await res.json()
        if (!cancelled) {
          const recs = Array.isArray(data) ? data : data.recommendations
          if (recs && recs.length > 0) {
            const top = recs[0]
            setPersonalizedSlide({
              id: `personalized-${top.id}`,
              title: top.nom || 'Découvrez ce produit',
              highlight: '✨ Recommandé pour vous',
              description: `Basé sur vos goûts : ${top.nom} – ${top.prix?.toLocaleString() || ''} FC`,
              image_url: top.images?.[0] || '/placeholder.jpg',
              cta_label: 'Voir le produit',
              cta_href: `/produits/${top.id}`,
              image_alt: `Produit recommandé : ${top.nom}`,
            })
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Erreur chargement recommandations:', err)
        }
      } finally {
        if (!cancelled) setLoadingPersonalized(false)
      }
    }

    fetchPersonalized()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [personalized, user])

  /* ───────────────────────────────────────────────────────────── */
  /*  CLEANUP AU DÉMONTAGE                                         */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  GESTION ERREURS IMAGES                                       */
  /* ───────────────────────────────────────────────────────────── */

  const handleImageError = useCallback((slideId: string) => {
    setImageErrors((prev) => new Set(prev).add(slideId))
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDU                                                        */
  /* ───────────────────────────────────────────────────────────── */

  if (displaySlides.length === 0) return null

  const isVertical = direction === 'vertical'
  const currentSlide = displaySlides[currentIndex]
  const hasImageError = imageErrors.has(currentSlide.id)

  const slideVariants = {
    enter: (customDirection: string) => ({
      opacity: 0,
      y: customDirection === 'vertical' ? 50 : 0,
      x: customDirection === 'horizontal' ? 50 : 0,
    }),
    center: {
      opacity: 1,
      y: 0,
      x: 0,
    },
    exit: (customDirection: string) => ({
      opacity: 0,
      y: customDirection === 'vertical' ? -50 : 0,
      x: customDirection === 'horizontal' ? -50 : 0,
    }),
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden bg-neutral-900',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-roledescription="carousel"
      aria-label="Carrousel de bannières promotionnelles"
      tabIndex={0}
    >
      <div className="relative w-full aspect-[2/1] md:aspect-[3/1]">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentSlide.id}
            custom={direction}
            variants={prefersReducedMotion ? { enter: {}, center: {}, exit: {} } : slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: prefersReducedMotion ? 0 : SLIDE_TRANSITION_DURATION,
              ease: 'easeInOut',
            }}
            className="absolute inset-0"
          >
            {/* Image avec fallback */}
            {!hasImageError ? (
              <Image
                src={currentSlide.image_url}
                alt={currentSlide.image_alt || currentSlide.title}
                fill
                className="object-cover"
                priority={currentIndex === 0}
                sizes="(max-width: 768px) 100vw, 100vw"
                onError={() => handleImageError(currentSlide.id)}
                quality={isMobile ? 75 : 85}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
            )}
            
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />
          </motion.div>
        </AnimatePresence>

        {/* Contenu texte */}
        <Container className="relative h-full flex flex-col justify-center items-start text-white z-10">
          <div className="max-w-2xl space-y-3 sm:space-y-4 md:space-y-6 px-4 md:px-0">
            {currentSlide.highlight && (
              <motion.span
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: prefersReducedMotion ? 0 : 0.2,
                  duration: prefersReducedMotion ? 0 : 0.5,
                }}
                className="inline-flex items-center gap-2 px-3 py-1 bg-gold-500/90 text-black text-xs sm:text-sm font-semibold rounded-full"
              >
                {currentSlide.id.startsWith('personalized') && (
                  <Sparkles size={14} className="sm:w-4 sm:h-4" aria-hidden="true" />
                )}
                <span className="text-xs sm:text-sm">{currentSlide.highlight}</span>
              </motion.span>
            )}
            
            <motion.h1
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: prefersReducedMotion ? 0 : 0.3,
                duration: prefersReducedMotion ? 0 : 0.5,
              }}
              className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold font-serif leading-tight"
            >
              {currentSlide.title}
            </motion.h1>
            
            <motion.p
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: prefersReducedMotion ? 0 : 0.4,
                duration: prefersReducedMotion ? 0 : 0.5,
              }}
              className="text-xs sm:text-sm md:text-base lg:text-lg text-neutral-200 max-w-xl line-clamp-3"
            >
              {currentSlide.description}
            </motion.p>
            
            {currentSlide.cta_label && currentSlide.cta_href && (
              <motion.div
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: prefersReducedMotion ? 0 : 0.5,
                  duration: prefersReducedMotion ? 0 : 0.5,
                }}
              >
                <Link
                  href={currentSlide.cta_href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button
                    variant="gold"
                    size="lg"
                    className="mt-2 text-sm sm:text-base"
                    aria-label={`${currentSlide.cta_label} - ${currentSlide.title}`}
                  >
                    {currentSlide.cta_label}
                  </Button>
                </Link>
              </motion.div>
            )}
          </div>
        </Container>
      </div>

      {/* Barre de progression */}
      {showProgress && shouldAutoplay && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1 bg-black/20 z-20"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression du carrousel"
        >
          <div
            className="h-full bg-gold-500 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Navigation (flèches) */}
      {displaySlides.length > 1 && (
        <>
          <button
            onClick={prevSlide}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label="Slide précédente"
          >
            <ChevronLeft size={20} className="sm:w-6 sm:h-6" aria-hidden="true" />
          </button>
          
          <button
            onClick={nextSlide}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label="Slide suivante"
          >
            <ChevronRight size={20} className="sm:w-6 sm:h-6" aria-hidden="true" />
          </button>
        </>
      )}

      {/* Contrôles supplémentaires */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {/* Bouton pause/play */}
        {autoplayEnabled && (
          <button
            onClick={() => setIsPaused((p) => !p)}
            className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label={isPaused ? 'Reprendre la lecture automatique' : 'Mettre en pause'}
            aria-pressed={isPaused}
          >
            {isPaused ? (
              <Play size={16} aria-hidden="true" />
            ) : (
              <Pause size={16} aria-hidden="true" />
            )}
          </button>
        )}

        {/* Bouton plein écran */}
        {enableFullscreen && (
          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label={isFullscreen ? 'Quitter le plein écran' : 'Afficher en plein écran'}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Compteur de slides */}
      {showCounter && displaySlides.length > 1 && (
        <div
          className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white text-sm font-medium z-20"
          aria-live="polite"
          aria-atomic="true"
        >
          {currentIndex + 1} / {displaySlides.length}
        </div>
      )}

      {/* Pagination (dots) */}
      {displaySlides.length > 1 && (
        <div
          className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 sm:gap-2 z-20"
          role="tablist"
          aria-label="Navigation par slide"
        >
          {displaySlides.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => goToSlide(idx)}
              className={cn(
                'h-2 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gold-500',
                idx === currentIndex
                  ? 'bg-gold-500 w-6 sm:w-8'
                  : 'bg-white/50 hover:bg-white/80 w-2'
              )}
              role="tab"
              aria-selected={idx === currentIndex}
              aria-label={`Aller à la slide ${idx + 1}: ${slide.title}`}
              tabIndex={idx === currentIndex ? 0 : -1}
            />
          ))}
        </div>
      )}

      {/* Annonce pour lecteurs d'écran */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Slide {currentIndex + 1} sur {displaySlides.length}: {currentSlide.title}
      </div>
    </div>
  )
}