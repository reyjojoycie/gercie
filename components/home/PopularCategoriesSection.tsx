// components/home/PopularCategoriesSection.tsx
'use client'

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { ChevronLeft, ChevronRight, AlertTriangle, Grid3x3, Package } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { categoryTree } from '@/lib/categories'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface HomeCategory {
  category_id: string
  display_name: string | null
  image_url: string | null
  description?: string | null
  product_count?: number
}

interface DisplayCategory {
  id: string
  name: string
  image: string | null
  slug: string
  description?: string
  productCount?: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const CACHE_KEY = 'gercie-home-categories-cache'
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes
const SCROLL_AMOUNT = 300
const SCROLL_DEBOUNCE = 100 // ms
const SWIPE_THRESHOLD = 50 // pixels
const MAX_CATEGORIES = 20 // Limite pour éviter surcharge
const SKELETON_COUNT = 8

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE HELPERS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface CacheEntry {
  categories: HomeCategory[]
  timestamp: number
}

function getCache(): CacheEntry | null {
  if (typeof window === 'undefined') return null
  
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    
    const entry = JSON.parse(raw) as CacheEntry
    
    if (!entry.categories || !entry.timestamp) {
      return null
    }
    
    return entry
  } catch (err) {
    console.warn('Erreur lecture cache catégories:', err)
    return null
  }
}

function setCache(categories: HomeCategory[]): void {
  if (typeof window === 'undefined') return
  
  try {
    const entry: CacheEntry = {
      categories,
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch (err) {
    console.warn('Erreur écriture cache catégories:', err)
  }
}

function isCacheValid(entry: CacheEntry | null): boolean {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION HELPERS                                             */
/* ═══════════════════════════════════════════════════════════════ */

function validateCategory(cat: any): cat is HomeCategory {
  return (
    cat &&
    typeof cat.category_id === 'string' &&
    cat.category_id.trim().length > 0
  )
}

function validateCategories(data: any[]): HomeCategory[] {
  return data
    .filter(validateCategory)
    .slice(0, MAX_CATEGORIES)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function PopularCategoriesSection() {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const isOnline = useOnlineStatus()
  
  // Refs
  const scrollRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  
  // États
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [isInView, setIsInView] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  /* ───────────────────────────────────────────────────────────── */
  /*  FETCH DES CATÉGORIES                                         */
  /* ───────────────────────────────────────────────────────────── */

  const {
    data: dynamicCategories,
    isLoading,
    isError,
    refetch,
  } = useQuery<HomeCategory[]>({
    queryKey: ['home-categories'],
    queryFn: async () => {
      // Vérifier le cache d'abord
      const cached = getCache()
      if (cached && isCacheValid(cached)) {
        return cached.categories
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

      try {
        const res = await fetch('/api/home-categories', {
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        const data = await res.json()
        
        if (!Array.isArray(data)) {
          console.warn('Données invalides reçues, utilisation du fallback')
          return []
        }

        const validated = validateCategories(data)
        
        // Mettre en cache
        setCache(validated)
        
        return validated
      } catch (err: any) {
        clearTimeout(timeoutId)
        
        if (err.name === 'AbortError') {
          console.warn('Timeout fetch catégories')
        } else {
          console.error('Erreur fetch catégories:', err)
        }
        
        // Essayer d'utiliser le cache même expiré
        const cached = getCache()
        if (cached) {
          console.warn('Utilisation du cache expiré pour catégories')
          return cached.categories
        }
        
        throw err
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    enabled: isOnline || !getCache(), // Charger si en ligne ou pas de cache
  })

  /* ───────────────────────────────────────────────────────────── */
  /*  DÉTECTION MOBILE                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  INTERSECTION OBSERVER                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!sectionRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInView(entry.isIntersecting)
        })
      },
      { threshold: 0.1 }
    )

    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  GESTION DU SCROLL                                            */
  /* ───────────────────────────────────────────────────────────── */

  const scroll = useCallback((dir: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = isMobile ? SCROLL_AMOUNT * 0.8 : SCROLL_AMOUNT
      scrollRef.current.scrollBy({
        left: dir === 'left' ? -amount : amount,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
    }
  }, [isMobile, prefersReducedMotion])

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    
    // Debounce pour éviter trop de re-renders
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      setCanScrollLeft(el.scrollLeft > 10)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10)
    }, SCROLL_DEBOUNCE)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    
    updateScrollButtons()
    el.addEventListener('scroll', updateScrollButtons, { passive: true })
    window.addEventListener('resize', updateScrollButtons)
    
    return () => {
      el.removeEventListener('scroll', updateScrollButtons)
      window.removeEventListener('resize', updateScrollButtons)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [updateScrollButtons])

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

      if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
        if (deltaX > 0) {
          scroll('left')
        } else {
          scroll('right')
        }
      }

      touchStartRef.current = null
    },
    [scroll]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  GESTION ERREURS IMAGES                                       */
  /* ───────────────────────────────────────────────────────────── */

  const handleImageError = useCallback((categoryId: string) => {
    setImageErrors((prev) => new Set(prev).add(categoryId))
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  LISTE DES CATÉGORIES À AFFICHER                              */
  /* ───────────────────────────────────────────────────────────── */

  const categoriesToDisplay = useMemo<DisplayCategory[]>(() => {
    if (dynamicCategories && dynamicCategories.length > 0) {
      return dynamicCategories.map((dc) => {
        const mainCat = categoryTree.find((c) => c.id === dc.category_id)
        return {
          id: dc.category_id,
          name: dc.display_name || mainCat?.name || dc.category_id,
          image: dc.image_url || null,
          slug: dc.category_id,
          description: dc.description || undefined,
          productCount: dc.product_count,
        }
      })
    }
    
    // Fallback sur les 14 premières catégories de l'arbre
    return categoryTree.slice(0, 14).map((cat) => ({
      id: cat.id,
      name: cat.name,
      image: null,
      slug: cat.id,
    }))
  }, [dynamicCategories])

  /* ───────────────────────────────────────────────────────────── */
  /*  PRÉCHARGEMENT DES IMAGES                                     */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isInView || categoriesToDisplay.length === 0) return

    // Précharger les 6 premières images
    categoriesToDisplay.slice(0, 6).forEach((cat) => {
      if (cat.image) {
        const img = new window.Image()
        img.src = cat.image
      }
    })
  }, [isInView, categoriesToDisplay])

  /* ───────────────────────────────────────────────────────────── */
  /*  CLEANUP AU DÉMONTAGE                                         */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDU                                                        */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <section
      ref={sectionRef}
      className="py-8 sm:py-10 md:py-16 bg-secondary/30"
      aria-labelledby="categories-heading"
    >
      <Container>
        {/* En-tête */}
        <div className="flex items-end justify-between mb-4 sm:mb-6">
          <div className="flex-1">
            <h2
              id="categories-heading"
              className="text-2xl sm:text-3xl font-bold text-foreground font-serif"
            >
              Explorez les catégories
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Trouvez exactement ce qu&apos;il vous faut
            </p>
            {!isLoading && categoriesToDisplay.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {categoriesToDisplay.length} catégorie{categoriesToDisplay.length > 1 ? 's' : ''} disponible{categoriesToDisplay.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
          
          {/* Boutons de navigation (desktop seulement) */}
          <div className="hidden md:flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              aria-label="Catégories précédentes"
              className="transition-all"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              aria-label="Catégories suivantes"
              className="transition-all"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Indicateur offline */}
        {!isOnline && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Mode hors ligne - affichage des catégories en cache
            </p>
          </div>
        )}

        {/* État de chargement */}
        {isLoading && (
          <div
            className="flex gap-3 sm:gap-4 overflow-hidden pb-4"
            role="status"
            aria-label="Chargement des catégories"
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-32 sm:w-36 md:w-44 h-36 sm:h-40 rounded-2xl bg-card border border-border animate-pulse flex flex-col items-center justify-center gap-3"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-neutral-200 dark:bg-neutral-700 rounded-full" />
                <div className="w-3/4 h-3 sm:h-4 bg-neutral-200 dark:bg-neutral-700 rounded" />
              </div>
            ))}
            <span className="sr-only">Chargement...</span>
          </div>
        )}

        {/* État d'erreur */}
        {isError && !dynamicCategories && (
          <div className="flex flex-col items-center py-8 text-center" role="alert">
            <AlertTriangle size={40} className="text-amber-500 mb-3" aria-hidden="true" />
            <p className="text-muted-foreground mb-4">
              Impossible de charger les catégories.
            </p>
            <Button variant="outline-gold" size="sm" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        {/* Liste des catégories */}
        {(!isLoading || dynamicCategories) && categoriesToDisplay.length > 0 && (
          <div
            ref={scrollRef}
            className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide pb-4 scroll-smooth -mx-4 px-4 md:mx-0 md:px-0"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            role="list"
            aria-label="Liste des catégories populaires"
          >
            {categoriesToDisplay.map((cat, idx) => {
              const hasImageError = imageErrors.has(cat.id)
              const shouldShowImage = cat.image && !hasImageError
              
              return (
                <motion.div
                  key={cat.id}
                  initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                  whileInView={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.3,
                    delay: prefersReducedMotion ? 0 : idx * 0.04,
                  }}
                  role="listitem"
                >
                  <Link
                    href={`/categories/${cat.slug}`}
                    className={cn(
                      "flex-shrink-0 w-32 sm:w-36 md:w-44 p-3 sm:p-4 rounded-2xl bg-card border border-border",
                      "hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300",
                      "flex flex-col items-center gap-2 sm:gap-3 group",
                      "focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2"
                    )}
                    aria-label={`Catégorie ${cat.name}${cat.productCount ? ` - ${cat.productCount} produits` : ''}`}
                  >
                    {/* Image ou icône */}
                    {shouldShowImage ? (
                      <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 relative">
                        <Image
                          src={cat.image!}
                          alt={cat.name}
                          width={80}
                          height={80}
                          className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                          priority={idx < 3}
                          quality={isMobile ? 75 : 85}
                          sizes="(max-width: 640px) 56px, (max-width: 768px) 64px, 80px"
                          onError={() => handleImageError(cat.id)}
                        />
                      </div>
                    ) : (
                      <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                        <Package
                          size={28}
                          className="sm:w-8 sm:h-8 md:w-10 md:h-10 text-neutral-400"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                    
                    {/* Nom de la catégorie */}
                    <span className="font-medium text-xs sm:text-sm text-foreground text-center line-clamp-2 leading-tight">
                      {cat.name}
                    </span>
                    
                    {/* Nombre de produits (optionnel) */}
                    {cat.productCount !== undefined && cat.productCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {cat.productCount} produit{cat.productCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </Link>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Message si aucune catégorie */}
        {!isLoading && !isError && categoriesToDisplay.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center" role="status">
            <Grid3x3 size={40} className="text-muted-foreground mb-3" aria-hidden="true" />
            <p className="text-muted-foreground">
              Aucune catégorie disponible pour le moment.
            </p>
          </div>
        )}

        {/* Bouton "Voir toutes" */}
        {!isLoading && categoriesToDisplay.length > 0 && (
          <div className="text-center mt-6 sm:mt-8">
            <Link href="/categories">
              <Button
                variant="outline-gold"
                size={isMobile ? 'default' : 'lg'}
                aria-label="Voir toutes les catégories"
              >
                Voir toutes les catégories
              </Button>
            </Link>
          </div>
        )}
      </Container>
    </section>
  )
}