// components/home/TodaysDeals.tsx
'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'
import {
  Zap, Percent, ChevronLeft, ChevronRight, Gift, Layers, Tag,
  Eye, ShoppingCart, Share2, Flame, ArrowRight, Sparkles,
  TrendingUp, Package, AlertTriangle, RefreshCw, WifiOff
} from 'lucide-react'
import CountdownTimer from './CountdownTimer'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface DealProduct {
  id: string
  productName: string
  productImage?: string
  productCategory?: string
  discount: number
  originalPrice: number
  dealPrice: number
  endTime: string
  type_promo: 'prix_fixe' | 'pourcentage' | 'flash' | 'lot_degressif' | 'cadeau'
  stock_restant?: number
  ventes?: number
  description?: string
  nouveau?: boolean
  slug?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const CACHE_KEY = 'gercie-todays-deals-cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const CAROUSEL_INTERVAL = 8000 // 8 secondes
const REQUEST_TIMEOUT = 10000 // 10 secondes
const MAX_RETRIES = 2
const SWIPE_THRESHOLD = 50 // pixels
const PRELOAD_NEXT = 2 // Précharger les 2 prochaines images

/* ═══════════════════════════════════════════════════════════════ */
/*  PROMO CONFIG                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const promoConfig: Record<string, { 
  icon: React.ReactNode
  gradient: string
  badgeColor: string
  label: string 
}> = {
  prix_fixe: {
    icon: <Tag size={16} aria-hidden="true" />,
    gradient: 'from-gold-400 to-amber-500',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    label: 'Prix choc'
  },
  pourcentage: {
    icon: <Percent size={16} aria-hidden="true" />,
    gradient: 'from-rose-400 to-pink-600',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    label: 'Réduction'
  },
  flash: {
    icon: <Zap size={16} aria-hidden="true" />,
    gradient: 'from-gold-400 to-yellow-500',
    badgeColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    label: 'Flash'
  },
  lot_degressif: {
    icon: <Layers size={16} aria-hidden="true" />,
    gradient: 'from-violet-400 to-purple-600',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    label: 'Lot'
  },
  cadeau: {
    icon: <Gift size={16} aria-hidden="true" />,
    gradient: 'from-emerald-400 to-green-600',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    label: 'Cadeau'
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE HELPERS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface CacheEntry {
  deals: DealProduct[]
  timestamp: number
}

function getCache(): CacheEntry | null {
  if (typeof window === 'undefined') return null
  
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    
    const entry = JSON.parse(raw) as CacheEntry
    
    if (!entry.deals || !entry.timestamp) {
      return null
    }
    
    return entry
  } catch (err) {
    console.warn('Erreur lecture cache deals:', err)
    return null
  }
}

function setCache(deals: DealProduct[]): void {
  if (typeof window === 'undefined') return
  
  try {
    const entry: CacheEntry = {
      deals,
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch (err) {
    console.warn('Erreur écriture cache deals:', err)
  }
}

function isCacheValid(entry: CacheEntry | null): boolean {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION HELPERS                                             */
/* ═══════════════════════════════════════════════════════════════ */

function validateDeal(deal: any): deal is DealProduct {
  return (
    deal &&
    typeof deal.id === 'string' &&
    typeof deal.productName === 'string' &&
    typeof deal.dealPrice === 'number' &&
    typeof deal.originalPrice === 'number' &&
    deal.dealPrice > 0 &&
    deal.originalPrice > 0
  )
}

function validateDeals(data: any[]): DealProduct[] {
  return data.filter(validateDeal)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function TodaysDeals() {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const isOnline = useOnlineStatus()
  
  // États
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isFullWidth, setIsFullWidth] = useState(false)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [isInView, setIsInView] = useState(true)
  
  // Refs
  const { addItem } = useCart()
  const { addToast } = useToast()
  const carouselRef = useRef<NodeJS.Timeout | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // Détection mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Intersection Observer pour pause automatique
  useEffect(() => {
    if (!sectionRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInView(entry.isIntersecting)
        })
      },
      { threshold: 0.3 }
    )

    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  // Récupération des offres actives avec cache et retry
  const { 
    data: promotions = [], 
    isLoading, 
    isError, 
    refetch,
    isFetching,
  } = useQuery<DealProduct[]>({
    queryKey: ['active-deals-home'],
    queryFn: async () => {
      // Vérifier le cache d'abord
      const cachedData = getCache()
      if (cachedData && isCacheValid(cachedData)) {
        return cachedData.deals
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

      let lastError: Error | null = null

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch('/api/promotions/actives', {
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }

          const data = await res.json()
          
          if (!Array.isArray(data)) {
            console.warn('Données invalides reçues')
            return []
          }

          const mapped = data.map((deal: any) => ({
            id: deal.id,
            productName: deal.title || deal.productName || deal.nom,
            productImage: deal.images?.[0] || deal.image || null,
            productCategory: deal.categorie || deal.category || '',
            discount: Math.round(((deal.prix_normal - deal.prix_promo) / deal.prix_normal) * 100),
            originalPrice: deal.prix_normal,
            dealPrice: deal.prix_promo,
            endTime: deal.date_fin,
            type_promo: deal.type_promo || 'prix_fixe',
            stock_restant: deal.stock_restant || deal.stock,
            ventes: deal.total_ventes || deal.ventes || 0,
            description: deal.description || '',
            nouveau: deal.created_at && (Date.now() - new Date(deal.created_at).getTime()) < 24 * 60 * 60 * 1000,
            slug: deal.slug,
          }))

          const validated = validateDeals(mapped)
          
          // Mettre en cache
          setCache(validated)
          
          return validated
        } catch (err: any) {
          clearTimeout(timeoutId)
          lastError = err
          
          if (err.name === 'AbortError') {
            console.warn('Timeout fetch deals')
            break
          }

          if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
          }
        }
      }

      // Essayer d'utiliser le cache même expiré
      const expiredCache = getCache()
      if (expiredCache) {
        console.warn('Utilisation du cache expiré pour deals')
        return expiredCache.deals
      }

      throw lastError || new Error('Erreur chargement des offres')
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: false, // On gère le retry nous-mêmes
    enabled: isOnline || !getCache(),
  })

  // Préchargement des images
  useEffect(() => {
    if (promotions.length === 0) return

    const preloadImages = () => {
      for (let i = 1; i <= PRELOAD_NEXT; i++) {
        const nextIndex = (currentIndex + i) % promotions.length
        const nextDeal = promotions[nextIndex]
        if (nextDeal?.productImage) {
          const img = new window.Image()
          img.src = nextDeal.productImage
        }
      }
    }

    preloadImages()
  }, [currentIndex, promotions])

  // Navigation
  const nextDeal = useCallback(() => {
    if (promotions.length === 0) return
    setCurrentIndex(prev => (prev + 1) % promotions.length)
  }, [promotions.length])

  const prevDeal = useCallback(() => {
    if (promotions.length === 0) return
    setCurrentIndex(prev => (prev - 1 + promotions.length) % promotions.length)
  }, [promotions.length])

  const goToDeal = useCallback((index: number) => {
    setCurrentIndex(index)
  }, [])

  // Carrousel automatique
  const shouldAutoPlay = useMemo(() => {
    return !isPaused && promotions.length > 1 && isInView && !prefersReducedMotion
  }, [isPaused, promotions.length, isInView, prefersReducedMotion])

  useEffect(() => {
    if (!shouldAutoPlay) {
      if (carouselRef.current) {
        clearInterval(carouselRef.current)
        carouselRef.current = null
      }
      return
    }

    carouselRef.current = setInterval(nextDeal, CAROUSEL_INTERVAL)
    
    return () => {
      if (carouselRef.current) {
        clearInterval(carouselRef.current)
      }
    }
  }, [shouldAutoPlay, nextDeal])

  // Touch gestures (swipe)
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
          prevDeal()
        } else {
          nextDeal()
        }
      }

      touchStartRef.current = null
    },
    [prevDeal, nextDeal]
  )

  // Ajout rapide au panier
  const handleQuickAdd = useCallback((deal: DealProduct) => {
    addItem({
      id: deal.id,
      nom: deal.productName,
      prix: deal.dealPrice,
      quantite: 1,
      image: deal.productImage || '/placeholder.jpg',
    })
    addToast({ 
      type: 'success', 
      message: `${deal.productName} ajouté au panier !` 
    })
  }, [addItem, addToast])

  // Partage
  const handleShare = useCallback(async (deal: DealProduct) => {
    const url = `${window.location.origin}/produits/${deal.slug || deal.id}`
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: deal.productName,
          text: `Découvrez cette offre : ${deal.productName} à ${deal.dealPrice} FC`,
          url,
        })
      } else {
        await navigator.clipboard.writeText(url)
        addToast({ type: 'success', message: 'Lien copié !' })
      }
    } catch (err) {
      console.warn('Erreur partage:', err)
    }
  }, [addToast])

  // Gestion erreurs images
  const handleImageError = useCallback((dealId: string) => {
    setImageErrors(prev => new Set(prev).add(dealId))
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (carouselRef.current) {
        clearInterval(carouselRef.current)
      }
    }
  }, [])

  // Masquer la section si aucune offre
  if (promotions.length === 0 && !isLoading && !isFetching) {
    return null
  }

  const currentDeal = promotions[currentIndex]

  return (
    <section
      ref={sectionRef}
      className={cn(
        'py-8 sm:py-10 md:py-16 relative overflow-hidden',
        'bg-gradient-to-b from-background to-muted/30'
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-labelledby="deals-heading"
    >
      {/* Fond décoratif */}
      <div 
        className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" 
        aria-hidden="true"
      />

      <Container className={cn(isFullWidth ? 'max-w-full px-4' : '')}>
        {/* En-tête */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 rounded-xl bg-gold-100 dark:bg-gold-900/30">
              <Zap className="text-gold-500" size={20} aria-hidden="true" />
            </div>
            <div>
              <h2 
                id="deals-heading"
                className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground"
              >
                Offres flash
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                {promotions.length} offre{promotions.length > 1 ? 's' : ''} à saisir maintenant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Indicateur offline */}
            {!isOnline && (
              <Tooltip content="Mode hors ligne - données en cache">
                <WifiOff size={16} className="text-muted-foreground" aria-hidden="true" />
              </Tooltip>
            )}
            
            {/* Pagination (desktop) */}
            {promotions.length > 1 && (
              <div 
                className="hidden md:flex items-center gap-1.5"
                role="tablist"
                aria-label="Navigation des offres"
              >
                {promotions.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goToDeal(idx)}
                    className={cn(
                      'w-2.5 h-2.5 rounded-full transition-all duration-300',
                      idx === currentIndex
                        ? 'bg-gold-500 w-6'
                        : 'bg-neutral-300 dark:bg-neutral-600 hover:bg-gold-400/60'
                    )}
                    role="tab"
                    aria-selected={idx === currentIndex}
                    aria-label={`Aller à l'offre ${idx + 1}`}
                    tabIndex={idx === currentIndex ? 0 : -1}
                  />
                ))}
              </div>
            )}
            
            {/* Bouton largeur */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullWidth(!isFullWidth)}
              className="text-muted-foreground hover:text-gold-500 hidden sm:flex"
              aria-label={isFullWidth ? 'Affichage normal' : 'Affichage large'}
            >
              <Eye size={16} className="mr-1" aria-hidden="true" />
              <span className="text-xs">{isFullWidth ? 'Normal' : 'Large'}</span>
            </Button>
            
            {/* Lien voir toutes */}
            <Link 
              href="/deals" 
              className="text-gold-600 hover:text-gold-500 font-medium text-xs sm:text-sm flex items-center gap-1"
            >
              <span className="hidden sm:inline">Voir toutes les offres</span>
              <span className="sm:hidden">Tout voir</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* États de chargement */}
        {isLoading ? (
          <div 
            className="bg-card rounded-2xl shadow-card p-4 sm:p-6 md:p-8 border border-gold-200/30"
            role="status"
            aria-label="Chargement des offres"
          >
            <div className="flex flex-col md:flex-row items-center gap-4 sm:gap-6">
              <Skeleton variant="circular" className="w-20 h-20 md:w-28 md:h-28" />
              <div className="flex-1 space-y-3 w-full">
                <Skeleton variant="text" className="w-1/3 h-5 sm:h-6" />
                <Skeleton variant="text" className="w-2/3 h-6 sm:h-8" />
                <div className="flex gap-3 sm:gap-4">
                  <Skeleton variant="rectangular" className="w-24 sm:w-28 h-9 sm:h-10 rounded-full" />
                  <Skeleton variant="rectangular" className="w-24 sm:w-28 h-9 sm:h-10 rounded-full" />
                </div>
              </div>
            </div>
            <span className="sr-only">Chargement...</span>
          </div>
        ) : isError ? (
          <div 
            className="bg-card rounded-2xl shadow-card p-4 sm:p-6 md:p-8 border border-red-200/30 text-center"
            role="alert"
          >
            <AlertTriangle size={40} className="mx-auto text-red-500 mb-3 sm:mb-4" aria-hidden="true" />
            <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
              Impossible de charger les offres.
            </p>
            <Button variant="outline-gold" onClick={() => refetch()} size="sm">
              <RefreshCw size={14} className="mr-1" aria-hidden="true" /> 
              Réessayer
            </Button>
          </div>
        ) : promotions.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-card p-4 sm:p-6 md:p-8 border border-gold-200/30 text-center">
            <Package size={40} className="mx-auto text-neutral-400 mb-3 sm:mb-4" aria-hidden="true" />
            <p className="text-sm sm:text-base text-muted-foreground">
              Aucune offre flash pour le moment.
            </p>
            <Link href="/produits">
              <Button variant="outline-gold" className="mt-3 sm:mt-4" size="sm">
                Voir tous les produits
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Bande promotionnelle principale */}
            <AnimatePresence mode="wait">
              {currentDeal && (
                <motion.div
                  key={currentDeal.id}
                  initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -20 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
                  className={cn(
                    'bg-card rounded-2xl shadow-card p-4 sm:p-6 md:p-8 flex flex-col md:flex-row items-center gap-4 sm:gap-6 relative overflow-hidden border border-gold-200/30',
                    isFullWidth && 'md:p-10'
                  )}
                  role="region"
                  aria-label={`Offre: ${currentDeal.productName}`}
                >
                  {/* Ligne colorée en haut */}
                  <div 
                    className={cn(
                      'absolute top-0 left-0 w-full h-1 bg-gradient-to-r', 
                      promoConfig[currentDeal.type_promo]?.gradient || 'from-gold-400 to-amber-500'
                    )}
                    aria-hidden="true"
                  />

                  {/* Image produit */}
                  <div className="flex-shrink-0 relative">
                    <div className={cn(
                      'w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl flex items-center justify-center overflow-hidden',
                      'bg-gradient-to-br from-gold-100 to-amber-50 dark:from-gold-900/30 dark:to-amber-900/20',
                      'border-2 border-gold-400/30 shadow-inner'
                    )}>
                      {currentDeal.productImage && !imageErrors.has(currentDeal.id) ? (
                        <Image
                          src={currentDeal.productImage}
                          alt={currentDeal.productName}
                          width={112}
                          height={112}
                          className="object-cover w-full h-full"
                          priority={currentIndex === 0}
                          quality={isMobile ? 75 : 85}
                          sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                          onError={() => handleImageError(currentDeal.id)}
                        />
                      ) : (
                        <Percent className="text-gold-600 w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16" aria-hidden="true" />
                      )}
                    </div>
                    {/* Badge de type */}
                    <span 
                      className={cn(
                        'absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-bold shadow-md flex items-center gap-1',
                        promoConfig[currentDeal.type_promo]?.badgeColor || 'bg-amber-100 text-amber-800'
                      )}
                      aria-label={promoConfig[currentDeal.type_promo]?.label}
                    >
                      {promoConfig[currentDeal.type_promo]?.icon}
                      <span className="hidden sm:inline">{promoConfig[currentDeal.type_promo]?.label}</span>
                    </span>
                  </div>

                  {/* Informations */}
                  <div className="flex-1 text-center md:text-left w-full">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
                      <CountdownTimer endTime={currentDeal.endTime} />
                      <Badge variant="danger" className={cn("font-bold", !prefersReducedMotion && "animate-pulse")}>
                        -{currentDeal.discount}%
                      </Badge>
                      {currentDeal.nouveau && (
                        <Badge variant="accent" className={cn(!prefersReducedMotion && "animate-bounce")}>
                          <Sparkles size={12} className="mr-1" aria-hidden="true" /> Nouveau
                        </Badge>
                      )}
                      {currentDeal.type_promo === 'flash' && (
                        <Badge variant="gold">
                          <Flame size={12} className="mr-1" aria-hidden="true" /> Flash
                        </Badge>
                      )}
                    </div>

                    <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground line-clamp-2">
                      {currentDeal.productName}
                    </h3>
                    {currentDeal.description && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                        {currentDeal.description}
                      </p>
                    )}

                    <div className="flex items-baseline gap-2 sm:gap-3 justify-center md:justify-start mt-2 sm:mt-3 flex-wrap">
                      <span className="text-2xl sm:text-3xl font-bold text-gold-600">
                        {currentDeal.dealPrice.toLocaleString()} FC
                      </span>
                      <span className="text-sm sm:text-base text-muted-foreground line-through">
                        {currentDeal.originalPrice.toLocaleString()} FC
                      </span>
                      <span className="text-xs sm:text-sm text-green-600 font-medium">
                        Économisez {(currentDeal.originalPrice - currentDeal.dealPrice).toLocaleString()} FC
                      </span>
                    </div>

                    {/* Indicateurs de stock et popularité */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2 sm:mt-3 justify-center md:justify-start text-xs text-muted-foreground">
                      {currentDeal.stock_restant !== undefined && currentDeal.stock_restant <= 10 && (
                        <span className="flex items-center gap-1 text-red-500 font-medium">
                          <AlertTriangle size={12} aria-hidden="true" /> 
                          Plus que {currentDeal.stock_restant} en stock
                        </span>
                      )}
                      {currentDeal.ventes !== undefined && currentDeal.ventes > 0 && (
                        <span className="flex items-center gap-1">
                          <TrendingUp size={12} aria-hidden="true" /> 
                          {currentDeal.ventes} ventes
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 sm:gap-3 mt-4 sm:mt-5 justify-center md:justify-start">
                      <Link href={`/produits/${currentDeal.slug || currentDeal.id}`}>
                        <Button variant="luxe" size={isMobile ? 'sm' : 'md'} className="shadow-gold">
                          <ShoppingCart size={16} className="mr-1 sm:mr-2" aria-hidden="true" /> 
                          <span className="text-xs sm:text-sm">Acheter maintenant</span>
                        </Button>
                      </Link>
                      <Button
                        variant="outline-gold"
                        size={isMobile ? 'sm' : 'md'}
                        onClick={() => handleQuickAdd(currentDeal)}
                      >
                        <ShoppingCart size={16} className="mr-1 sm:mr-2" aria-hidden="true" /> 
                        <span className="text-xs sm:text-sm">Ajout rapide</span>
                      </Button>
                      <Tooltip content="Partager cette offre">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleShare(currentDeal)}
                          aria-label="Partager cette offre"
                        >
                          <Share2 size={16} aria-hidden="true" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Navigation */}
                  {promotions.length > 1 && (
                    <div className="flex gap-2 flex-shrink-0 md:absolute md:top-1/2 md:-right-16 md:-translate-y-1/2">
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={prevDeal} 
                        aria-label="Offre précédente"
                        className="md:rounded-full"
                      >
                        <ChevronLeft size={18} aria-hidden="true" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={nextDeal} 
                        aria-label="Offre suivante"
                        className="md:rounded-full"
                      >
                        <ChevronRight size={18} aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mini-cartes des autres offres */}
            {promotions.length > 1 && (
              <div className="mt-3 sm:mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
                {promotions.map((deal, idx) => (
                  <motion.button
                    key={deal.id}
                    whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
                    whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
                    onClick={() => goToDeal(idx)}
                    className={cn(
                      'p-2 sm:p-3 rounded-xl border text-left transition-all text-xs sm:text-sm',
                      idx === currentIndex
                        ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/20 shadow-md'
                        : 'border-border bg-card hover:border-gold-400/50 hover:bg-gold-50/30'
                    )}
                    aria-label={`Offre ${idx + 1}: ${deal.productName}`}
                    aria-pressed={idx === currentIndex}
                  >
                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className="text-xs font-bold text-gold-600">-{deal.discount}%</span>
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {deal.productName}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 sm:gap-2 flex-wrap">
                      <span className="text-sm font-bold">{deal.dealPrice.toLocaleString()} FC</span>
                      <span className="text-xs text-muted-foreground line-through">
                        {deal.originalPrice.toLocaleString()} FC
                      </span>
                    </div>
                    <div className="mt-1">
                      <CountdownTimer endTime={deal.endTime} showDays={false} />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </>
        )}
      </Container>
    </section>
  )
}