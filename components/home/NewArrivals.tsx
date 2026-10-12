// components/home/NewArrivals.tsx
'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'
import {
  Sparkles, Star, ShoppingCart, Eye, ChevronRight,
  Package, RefreshCw, AlertTriangle, Clock,
  Heart, Share2, Maximize2, Minimize2, Zap,
  ArrowRight, WifiOff, TrendingUp
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface Product {
  id: string
  nom: string
  prix: number
  prix_promo?: number | null
  images: string[]
  categorie?: string
  total_ventes?: number
  note_moyenne?: number
  stock?: number
  created_at?: string
  remise_percent?: number
  est_actif?: boolean
  slug?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const CACHE_KEY = 'gercie-new-arrivals-cache'
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes
const REQUEST_TIMEOUT = 10000 // 10 secondes
const MAX_RETRIES = 2
const RETRY_DELAY = 1000 // 1 seconde
const PRELOAD_NEXT_PAGE = true
const NEW_PRODUCT_DAYS = 7 // jours pour considérer comme "nouveau"
const SWIPE_THRESHOLD = 50 // pixels

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE HELPERS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface CacheEntry {
  data: Record<number, Product[]> // page -> products
  timestamp: number
}

function getCache(): CacheEntry | null {
  if (typeof window === 'undefined') return null
  
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    
    const entry = JSON.parse(raw) as CacheEntry
    
    if (!entry.data || !entry.timestamp) {
      return null
    }
    
    return entry
  } catch (err) {
    console.warn('Erreur lecture cache nouveautés:', err)
    return null
  }
}

function setCache(page: number, products: Product[]): void {
  if (typeof window === 'undefined') return
  
  try {
    const existing = getCache() || { data: {}, timestamp: Date.now() }
    existing.data[page] = products
    existing.timestamp = Date.now()
    localStorage.setItem(CACHE_KEY, JSON.stringify(existing))
  } catch (err) {
    console.warn('Erreur écriture cache nouveautés:', err)
  }
}

function getCachedPage(page: number): Product[] | null {
  const cache = getCache()
  if (!cache) return null
  
  if (Date.now() - cache.timestamp > CACHE_TTL) {
    return null
  }
  
  return cache.data[page] || null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION HELPERS                                             */
/* ═══════════════════════════════════════════════════════════════ */

function isValidProduct(prod: any): prod is Product {
  return (
    prod &&
    typeof prod.id === 'string' &&
    typeof prod.nom === 'string' &&
    typeof prod.prix === 'number' &&
    prod.prix > 0 &&
    Array.isArray(prod.images)
  )
}

function validateProducts(data: any[]): Product[] {
  if (!Array.isArray(data)) {
    console.warn('Données produits invalides: pas un tableau')
    return []
  }

  return data.filter(isValidProduct)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function NewArrivals() {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const isOnline = useOnlineStatus()
  
  // États
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid')
  const [page, setPage] = useState(1)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [isInView, setIsInView] = useState(true)
  
  // Refs
  const { addItem } = useCart()
  const { addToast } = useToast()
  const sectionRef = useRef<HTMLElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  
  const itemsPerPage = viewMode === 'grid' ? 6 : 8

  // Détection mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Intersection Observer pour lazy loading
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

  // Récupération des nouveautés avec cache et retry
  const {
    data: products = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Product[]>({
    queryKey: ['new-arrivals-home', page, itemsPerPage],
    queryFn: async () => {
      // Vérifier le cache d'abord
      const cached = getCachedPage(page)
      if (cached) {
        if (process.env.NODE_ENV === 'development') {
          console.log('✨ New arrivals from cache:', cached.length)
        }
        return cached
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

      let lastError: Error | null = null

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(
            `/api/produits?recent=14&limit=${itemsPerPage}&page=${page}&est_actif=true&sort_by=created_at&sort_order=desc`,
            { signal: controller.signal }
          )
          
          clearTimeout(timeoutId)

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }

          const json = await res.json()
          
          if (!json.data || !Array.isArray(json.data)) {
            console.warn('Données invalides reçues')
            return []
          }

          const validated = validateProducts(json.data)
          
          // Mettre en cache
          setCache(page, validated)
          
          if (process.env.NODE_ENV === 'development') {
            console.log('✨ New arrivals loaded:', {
              count: validated.length,
              page,
              fromCache: false,
              attempt: attempt + 1,
            })
          }
          
          return validated
        } catch (err: any) {
          clearTimeout(timeoutId)
          lastError = err
          
          if (err.name === 'AbortError') {
            console.warn('⏱️ Timeout fetch new arrivals')
            break
          }

          if (attempt < MAX_RETRIES) {
            console.warn(`⚠️ Tentative ${attempt + 1}/${MAX_RETRIES + 1} échouée:`, err.message)
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt)))
          }
        }
      }

      // Essayer d'utiliser le cache même expiré
      const expiredCache = getCachedPage(page)
      if (expiredCache) {
        console.warn('🔄 Utilisation du cache expiré pour new arrivals')
        return expiredCache
      }

      throw lastError || new Error('Erreur chargement des nouveautés')
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    enabled: isInView && (isOnline || !getCachedPage(page)),
  })

  // Préchargement de la page suivante
  useEffect(() => {
    if (!PRELOAD_NEXT_PAGE || !isInView || products.length === 0) return

    const preloadNextPage = async () => {
      const nextPage = page + 1
      const cached = getCachedPage(nextPage)
      if (cached) return

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

        const res = await fetch(
          `/api/produits?recent=14&limit=${itemsPerPage}&page=${nextPage}&est_actif=true&sort_by=created_at&sort_order=desc`,
          { signal: controller.signal }
        )

        clearTimeout(timeoutId)

        if (res.ok) {
          const json = await res.json()
          if (json.data && Array.isArray(json.data)) {
            const validated = validateProducts(json.data)
            setCache(nextPage, validated)
          }
        }
      } catch (err) {
        console.warn('Erreur préchargement page suivante:', err)
      }
    }

    const timer = setTimeout(preloadNextPage, 2000)
    return () => clearTimeout(timer)
  }, [page, products.length, itemsPerPage, isInView])

  // Ajout rapide au panier
  const handleQuickAdd = useCallback(
    (prod: Product, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      addItem({
        id: prod.id,
        nom: prod.nom,
        prix: prod.prix_promo ?? prod.prix,
        quantite: 1,
        image: prod.images?.[0] || '/placeholder.jpg',
      })
      
      addToast({ 
        type: 'success', 
        message: `${prod.nom} ajouté au panier` 
      })
    },
    [addItem, addToast]
  )

  // Partage
  const handleShare = useCallback(async (prod: Product, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const url = `${window.location.origin}/produits/${prod.slug || prod.id}`
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: prod.nom,
          text: `Nouveauté sur Gercie : ${prod.nom}`,
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

  // Calcul du pourcentage de remise
  const getDiscount = useCallback((prod: Product) => {
    if (prod.remise_percent && prod.remise_percent > 0) {
      return prod.remise_percent
    }
    if (prod.prix_promo && prod.prix > 0) {
      return Math.round(((prod.prix - prod.prix_promo) / prod.prix) * 100)
    }
    return 0
  }, [])

  // Détection de véritable nouveauté (moins de 7 jours)
  const isRecent = useCallback((prod: Product) => {
    if (!prod.created_at) return false
    const diff = Date.now() - new Date(prod.created_at).getTime()
    return diff < NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000
  }, [])

  // Formater la date
  const formatDate = useCallback((dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', { 
        month: 'short', 
        day: 'numeric' 
      })
    } catch {
      return ''
    }
  }, [])

  // Gestion erreurs images
  const handleImageError = useCallback((productId: string) => {
    setImageErrors(prev => new Set(prev).add(productId))
  }, [])

  // Touch gestures pour carousel
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (viewMode !== 'carousel') return
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }
  }, [viewMode])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (viewMode !== 'carousel' || !touchStartRef.current || !carouselRef.current) return

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      }

      const deltaX = touchEnd.x - touchStartRef.current.x

      if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
        const scrollAmount = deltaX > 0 ? -200 : 200
        carouselRef.current.scrollBy({
          left: scrollAmount,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        })
      }

      touchStartRef.current = null
    },
    [viewMode, prefersReducedMotion]
  )

  // Toggle view mode
  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === 'grid' ? 'carousel' : 'grid')
  }, [])

  // Load more
  const handleLoadMore = useCallback(() => {
    setPage(p => p + 1)
  }, [])

  // Memoization des produits avec calculs
  const productsWithMeta = useMemo(() => {
    return products.map((prod) => ({
      ...prod,
      discount: getDiscount(prod),
      recent: isRecent(prod),
      hasImageError: imageErrors.has(prod.id),
      formattedDate: prod.created_at ? formatDate(prod.created_at) : '',
    }))
  }, [products, getDiscount, isRecent, imageErrors, formatDate])

  // États de chargement
  if (isLoading && !isFetching) {
    return (
      <section 
        className="py-8 sm:py-12 md:py-16 bg-gradient-to-r from-blue-500/5 to-purple-500/5"
        aria-busy="true"
        aria-label="Chargement des nouveautés"
      >
        <Container>
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <Skeleton variant="text" className="w-40 sm:w-48 h-7 sm:h-8" />
            <Skeleton variant="text" className="w-20 sm:w-24 h-5" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl p-2 sm:p-3 space-y-2">
                <Skeleton variant="rectangular" className="aspect-square rounded-xl" />
                <Skeleton variant="text" className="w-3/4 h-4" />
                <Skeleton variant="text" className="w-1/2 h-4" />
              </div>
            ))}
          </div>
          <span className="sr-only">Chargement...</span>
        </Container>
      </section>
    )
  }

  if (isError) {
    return (
      <section className="py-8 sm:py-12 md:py-16 bg-gradient-to-r from-blue-500/5 to-purple-500/5" role="alert">
        <Container>
          <div className="text-center py-8 sm:py-12 bg-card rounded-2xl border border-red-200/30">
            <AlertTriangle 
              size={40} 
              className="mx-auto text-red-500 mb-3 sm:mb-4" 
              aria-hidden="true"
            />
            <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 px-4">
              {(error as Error)?.message || 'Impossible de charger les nouveautés.'}
            </p>
            <Button variant="outline-gold" onClick={() => refetch()} size="sm">
              <RefreshCw size={14} className="mr-1" aria-hidden="true" /> 
              Réessayer
            </Button>
          </div>
        </Container>
      </section>
    )
  }

  if (!products || products.length === 0) return null

  return (
    <section 
      ref={sectionRef}
      className="py-8 sm:py-12 md:py-16 bg-gradient-to-r from-blue-500/5 to-purple-500/5 relative overflow-hidden"
      aria-labelledby="new-arrivals-heading"
    >
      {/* Décoration */}
      <div 
        className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400/30 via-purple-400/30 to-pink-400/30" 
        aria-hidden="true"
      />

      <Container>
        {/* En-tête enrichi */}
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          whileInView={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between mb-4 sm:mb-6 gap-2"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Sparkles size={20} className="text-blue-500" aria-hidden="true" />
              </div>
              <h2 
                id="new-arrivals-heading"
                className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground font-serif"
              >
                Nouveautés
              </h2>
              <Badge 
                variant="accent" 
                size="sm" 
                className={cn(!prefersReducedMotion && "animate-pulse")}
              >
                <Zap size={12} className="mr-1" aria-hidden="true" /> 
                <span className="hidden sm:inline">Fraîchement ajouté</span>
                <span className="sm:hidden">Nouveau</span>
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 hidden sm:block">
              Découvrez les derniers produits ajoutés sur Gercie
            </p>
            {!isOnline && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                <WifiOff size={12} aria-hidden="true" />
                Mode hors ligne - données en cache
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleViewMode}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-gold-500 hover:border-gold-400/50 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label={viewMode === 'grid' ? 'Passer en vue carrousel' : 'Passer en vue grille'}
              title={viewMode === 'grid' ? 'Vue carrousel' : 'Vue grille'}
            >
              {viewMode === 'grid' ? (
                <Minimize2 size={16} aria-hidden="true" />
              ) : (
                <Maximize2 size={16} aria-hidden="true" />
              )}
            </button>
            <Link
              href="/produits?sort=recent"
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-gold-600 hover:text-gold-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 rounded px-2 py-1"
              aria-label="Voir toutes les nouveautés"
            >
              <span className="hidden sm:inline">Voir tout</span>
              <span className="sm:hidden">Tout</span>
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </motion.div>

        {/* Grille de produits */}
        {viewMode === 'grid' ? (
          <div 
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4"
            role="list"
            aria-label="Liste des nouveautés"
          >
            {productsWithMeta.map((prod, idx) => (
              <motion.div
                key={prod.id}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                whileInView={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ 
                  duration: prefersReducedMotion ? 0 : 0.5, 
                  delay: prefersReducedMotion ? 0 : idx * 0.05 
                }}
                whileHover={prefersReducedMotion ? {} : { y: -4 }}
                className="group relative"
                role="listitem"
              >
                <Link
                  href={`/produits/${prod.slug || prod.id}`}
                  className="bg-card rounded-xl overflow-hidden hover:shadow-lg transition-shadow border border-border hover:border-gold-400/30 flex flex-col h-full focus:outline-none focus:ring-2 focus:ring-gold-500"
                  aria-label={`${prod.nom} - ${(prod.prix_promo ?? prod.prix).toLocaleString()} FC${prod.recent ? ' - Nouveau' : ''}`}
                >
                  {/* Image */}
                  <div className="aspect-square relative bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    {prod.images?.[0] && !prod.hasImageError ? (
                      <Image
                        src={prod.images[0]}
                        alt={prod.nom}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
                        priority={idx < 3}
                        quality={isMobile ? 75 : 85}
                        onError={() => handleImageError(prod.id)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Package size={40} aria-hidden="true" />
                      </div>
                    )}

                    {/* Badges sur l'image */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {prod.recent && (
                        <Badge 
                          variant="accent" 
                          size="sm" 
                          className={cn("text-[10px] sm:text-xs", !prefersReducedMotion && "animate-pulse")}
                          aria-label="Nouveau produit"
                        >
                          <Sparkles size={10} className="mr-0.5" aria-hidden="true" /> 
                          <span>Nouveau</span>
                        </Badge>
                      )}
                      {prod.discount > 0 && (
                        <Badge 
                          variant="danger" 
                          size="sm" 
                          className="font-bold text-[10px] sm:text-xs"
                          aria-label={`Réduction de ${prod.discount} pourcent`}
                        >
                          -{prod.discount}%
                        </Badge>
                      )}
                    </div>

                    {/* Boutons d'action au survol */}
                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Tooltip content="Ajouter au panier">
                        <button
                          onClick={(e) => handleQuickAdd(prod, e)}
                          className="p-1.5 bg-white/90 dark:bg-neutral-800/90 rounded-full shadow-lg hover:bg-gold-500 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500"
                          aria-label={`Ajouter ${prod.nom} au panier`}
                        >
                          <ShoppingCart size={14} aria-hidden="true" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Partager">
                        <button
                          onClick={(e) => handleShare(prod, e)}
                          className="p-1.5 bg-white/90 dark:bg-neutral-800/90 rounded-full shadow-lg hover:bg-gold-500 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500"
                          aria-label={`Partager ${prod.nom}`}
                        >
                          <Share2 size={14} aria-hidden="true" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Voir les détails">
                        <span 
                          className="p-1.5 bg-white/90 dark:bg-neutral-800/90 rounded-full shadow-lg hover:bg-gold-500 hover:text-white transition-colors cursor-pointer"
                          aria-hidden="true"
                        >
                          <Eye size={14} />
                        </span>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Infos produit */}
                  <div className="p-2 sm:p-3 flex flex-col justify-between flex-1">
                    <div>
                      <h3 className="text-xs sm:text-sm font-medium line-clamp-2 group-hover:text-gold-600 transition-colors">
                        {prod.nom}
                      </h3>
                      {prod.categorie && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {prod.categorie}
                        </p>
                      )}
                    </div>

                    <div className="mt-2 space-y-1">
                      <div className="flex items-baseline gap-1 sm:gap-1.5 flex-wrap">
                        <span className="text-sm sm:text-base font-bold text-gold-600">
                          {(prod.prix_promo ?? prod.prix).toLocaleString()} FC
                        </span>
                        {prod.prix_promo && (
                          <span className="text-xs text-muted-foreground line-through">
                            {prod.prix.toLocaleString()} FC
                          </span>
                        )}
                      </div>

                      {/* Note & date */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-0.5">
                          {prod.note_moyenne != null && prod.note_moyenne > 0 ? (
                            <>
                              <Star size={12} className="text-amber-500 fill-amber-500" aria-hidden="true" />
                              <span className="font-medium">{prod.note_moyenne.toFixed(1)}</span>
                            </>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </div>
                        {prod.formattedDate && (
                          <span className="flex items-center gap-0.5">
                            <Clock size={12} aria-hidden="true" />
                            <span>{prod.formattedDate}</span>
                          </span>
                        )}
                      </div>

                      {/* Nombre de ventes (si présent) */}
                      {prod.total_ventes != null && prod.total_ventes > 0 && (
                        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                          <TrendingUp size={10} aria-hidden="true" />
                          <span>{prod.total_ventes} vendus</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          /* Vue carrousel horizontal */
          <div 
            ref={carouselRef}
            className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory -mx-4 px-4"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            role="list"
            aria-label="Carrousel des nouveautés"
          >
            {productsWithMeta.map((prod, idx) => (
              <motion.div
                key={prod.id}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                whileInView={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ 
                  duration: prefersReducedMotion ? 0 : 0.5, 
                  delay: prefersReducedMotion ? 0 : idx * 0.05 
                }}
                className="min-w-[180px] sm:min-w-[200px] w-[180px] sm:w-[200px] flex-shrink-0 snap-start"
                role="listitem"
              >
                <Link
                  href={`/produits/${prod.slug || prod.id}`}
                  className="bg-card rounded-xl overflow-hidden hover:shadow-lg transition-shadow border border-border hover:border-gold-400/30 flex flex-col h-full group focus:outline-none focus:ring-2 focus:ring-gold-500"
                  aria-label={`${prod.nom} - ${(prod.prix_promo ?? prod.prix).toLocaleString()} FC`}
                >
                  <div className="aspect-square relative bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    {prod.images?.[0] && !prod.hasImageError ? (
                      <Image
                        src={prod.images[0]}
                        alt={prod.nom}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="200px"
                        quality={isMobile ? 75 : 85}
                        onError={() => handleImageError(prod.id)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Package size={36} aria-hidden="true" />
                      </div>
                    )}
                    {prod.recent && (
                      <Badge 
                        variant="accent" 
                        size="sm" 
                        className="absolute top-2 left-2 text-[10px]"
                        aria-label="Nouveau produit"
                      >
                        <Sparkles size={10} className="mr-0.5" aria-hidden="true" /> 
                        <span>Nouveau</span>
                      </Badge>
                    )}
                    {prod.discount > 0 && (
                      <Badge 
                        variant="danger" 
                        size="sm" 
                        className="absolute top-2 right-2 font-bold text-[10px]"
                        aria-label={`Réduction de ${prod.discount} pourcent`}
                      >
                        -{prod.discount}%
                      </Badge>
                    )}
                  </div>
                  <div className="p-2 sm:p-3">
                    <h3 className="text-xs sm:text-sm font-medium truncate">{prod.nom}</h3>
                    <span className="text-sm sm:text-base text-gold-600 font-bold">
                      {(prod.prix_promo ?? prod.prix).toLocaleString()} FC
                    </span>
                    {prod.formattedDate && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock size={10} aria-hidden="true" />
                        <span>{prod.formattedDate}</span>
                      </p>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Bouton "Voir plus" */}
        <div className="text-center mt-4 sm:mt-6">
          <Button
            variant="outline-gold"
            onClick={handleLoadMore}
            className="text-xs sm:text-sm"
            disabled={isFetching}
            aria-label="Charger plus de nouveautés"
          >
            {isFetching ? (
              <>
                <RefreshCw size={14} className="mr-1 animate-spin" aria-hidden="true" />
                Chargement...
              </>
            ) : (
              <>
                Découvrir plus de nouveautés 
                <ArrowRight size={14} className="ml-1" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </Container>
    </section>
  )
}