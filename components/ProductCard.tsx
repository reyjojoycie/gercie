// components/ProductCard.tsx
'use client'

import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useFavorites } from '@/hooks/useFavorites'
import { useTrackInteraction } from '@/hooks/useTrackInteraction'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  Heart,
  ShoppingBag,
  Eye,
  Star,
  Truck,
  Sparkles,
  Zap,
  Loader2,
  Check,
  Share2,
  TrendingUp,
  AlertTriangle,
  WifiOff,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface Product {
  id: string
  nom: string
  prix: number
  prix_usd?: number | null
  images: string[]
  vendeur?: { boutique_nom: string }
  negotiable?: boolean
  stock?: number
  note?: number
  avis_count?: number
  isNew?: boolean
  discount?: number
  livraison_gratuite?: boolean
  prix_dynamique?: boolean
  slug?: string
  total_ventes?: number
}

interface ProductCardProps {
  product: Product
  showFavoriteButton?: boolean
  variant?: 'grid' | 'list'
  disableBlurUp?: boolean
  /** Score de pertinence IA (0-1) – affiche un badge "Pour vous" si présent */
  aiScore?: number
  /** Afficher le bouton de partage */
  showShareButton?: boolean
  /** Désactiver les animations */
  disableAnimations?: boolean
  /** Classe CSS personnalisée */
  className?: string
  /** Callback quand le produit est ajouté au panier */
  onAddToCart?: (product: Product) => void
  /** Callback quand le produit est ajouté aux favoris */
  onToggleFavorite?: (product: Product, isFavorite: boolean) => void
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const PLACEHOLDER_IMAGE = '/placeholder.jpg'
const LOW_STOCK_THRESHOLD = 5
const CART_ADDED_DURATION = 1500 // ms
const TRACK_VIEW_DELAY = 1000 // ms délai avant tracking

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS PERSONNALISÉS                                            */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Hook pour détecter si un élément est visible dans le viewport
 */
function useInView(options?: IntersectionObserverInit) {
  const [isInView, setIsInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting)
    }, {
      threshold: 0.1,
      rootMargin: '50px',
      ...options,
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [options])

  return { ref, isInView }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION HELPERS                                             */
/* ═══════════════════════════════════════════════════════════════ */

function isValidProduct(product: any): product is Product {
  return (
    product &&
    typeof product.id === 'string' &&
    typeof product.nom === 'string' &&
    typeof product.prix === 'number' &&
    product.prix > 0
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

const ProductCardContent = memo<ProductCardProps>(({
  product,
  showFavoriteButton = true,
  variant = 'grid',
  disableBlurUp = true,
  aiScore,
  showShareButton = false,
  disableAnimations = false,
  className,
  onAddToCart,
  onToggleFavorite,
}) => {
  const { addItem } = useCart()
  const { user } = useAuth()
  const { rate } = useExchangeRate()
  const { isFavorite: checkFavorite, toggleFavorite } = useFavorites()
  const { trackView } = useTrackInteraction()
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const isOnline = useOnlineStatus()

  // IntersectionObserver pour tracking
  const { ref: inViewRef, isInView } = useInView()

  // États locaux
  const [cartAdded, setCartAdded] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Validation du produit
  const isValid = useMemo(() => isValidProduct(product), [product])

  // Tracking de vue au montage (seulement si visible)
  useEffect(() => {
    if (!user || !isInView || !isValid) return

    const timer = setTimeout(() => {
      trackView(product.id)
    }, TRACK_VIEW_DELAY)

    return () => clearTimeout(timer)
  }, [user, isInView, isValid, product.id, trackView])

  // Calculs memoizés
  const isFav = useMemo(() => checkFavorite(product.id), [checkFavorite, product.id])
  
  const prixUSD = useMemo(() => {
    if (product.prix_usd) return product.prix_usd
    if (rate) return product.prix / rate
    return null
  }, [product.prix_usd, product.prix, rate])

  const imageUrl = useMemo(() => {
    if (imageError) return PLACEHOLDER_IMAGE
    return product.images?.[0] || PLACEHOLDER_IMAGE
  }, [imageError, product.images])

  const hasDiscount = useMemo(() => {
    return product.discount && product.discount > 0
  }, [product.discount])

  const originalPrice = useMemo(() => {
    if (!hasDiscount) return null
    return Math.round(product.prix / (1 - (product.discount || 0) / 100))
  }, [hasDiscount, product.prix, product.discount])

  const lowStock = useMemo(() => {
    return product.stock !== undefined && product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD
  }, [product.stock])

  const hasDynamicPrice = product.prix_dynamique === true
  const hasAIScore = aiScore !== undefined && aiScore >= 0 && aiScore <= 1
  const shouldAnimate = !disableAnimations && !prefersReducedMotion

  // Handlers
  const handleToggleFavorite = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!isValid) return
    
    await toggleFavorite(product.id)
    onToggleFavorite?.(product, !isFav)
  }, [toggleFavorite, product, isValid, isFav, onToggleFavorite])

  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!isValid) return
    
    addItem({
      id: product.id,
      nom: product.nom,
      prix: product.prix,
      quantite: 1,
      image: imageUrl,
    })
    
    setCartAdded(true)
    setTimeout(() => setCartAdded(false), CART_ADDED_DURATION)
    onAddToCart?.(product)
  }, [addItem, product, imageUrl, isValid, onAddToCart])

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const url = `${window.location.origin}/produits/${product.slug || product.id}`
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: product.nom,
          text: `Découvrez ${product.nom} à ${product.prix.toLocaleString()} FC`,
          url,
        })
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch (err) {
      console.warn('Erreur partage:', err)
    }
  }, [product])

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true)
  }, [])

  const handleImageError = useCallback(() => {
    setImageError(true)
    setImageLoaded(true)
  }, [])

  // Si le produit n'est pas valide, afficher un état d'erreur
  if (!isValid) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <div className="aspect-square bg-neutral-100 dark:bg-midnight-700/40 flex items-center justify-center">
          <AlertTriangle size={32} className="text-neutral-400" />
        </div>
        <CardContent className="pt-4 pb-5 px-4">
          <p className="text-sm text-muted-foreground">Produit indisponible</p>
        </CardContent>
      </Card>
    )
  }

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDER HELPERS                                                */
  /* ═══════════════════════════════════════════════════════════════ */

  const renderFloatingBadges = () => (
    <div className="absolute top-2 sm:top-3 left-2 sm:left-3 flex flex-col gap-1 sm:gap-1.5 z-10">
      {/* Badge IA – prioritaire */}
      {hasAIScore && (
        <motion.div 
          initial={shouldAnimate ? { opacity: 0, x: -10 } : { opacity: 1 }}
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.1 }}
        >
          <Badge 
            variant="accent" 
            size="sm" 
            className="shadow-soft bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-[10px] sm:text-xs"
            aria-label={`Score de pertinence: ${Math.round(aiScore! * 100)} pourcent`}
          >
            <Sparkles size={10} className="mr-0.5 sm:mr-1" aria-hidden="true" /> 
            <span>{Math.round(aiScore! * 100)}% pour vous</span>
          </Badge>
        </motion.div>
      )}
      
      {product.isNew && (
        <motion.div 
          initial={shouldAnimate ? { opacity: 0, x: -10 } : { opacity: 1 }}
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.2 }}
        >
          <Badge variant="brand" size="sm" className="shadow-soft text-[10px] sm:text-xs">
            <Sparkles size={10} className="mr-0.5 sm:mr-1" aria-hidden="true" /> 
            <span>Nouveauté</span>
          </Badge>
        </motion.div>
      )}
      
      {hasDiscount && (
        <motion.div 
          initial={shouldAnimate ? { opacity: 0, x: -10 } : { opacity: 1 }}
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.3 }}
        >
          <Badge variant="danger" size="sm" className="shadow-soft text-[10px] sm:text-xs font-bold">
            -{product.discount}%
          </Badge>
        </motion.div>
      )}
      
      {hasDynamicPrice && (
        <motion.div 
          initial={shouldAnimate ? { opacity: 0, x: -10 } : { opacity: 1 }}
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.35 }}
        >
          <Badge variant="gold" size="sm" style="luxe-gradient" className="shadow-gold text-[10px] sm:text-xs">
            <Zap size={10} className="mr-0.5 sm:mr-1" aria-hidden="true" /> 
            <span>Prix dynamique</span>
          </Badge>
        </motion.div>
      )}
      
      {product.livraison_gratuite && (
        <motion.div 
          initial={shouldAnimate ? { opacity: 0, x: -10 } : { opacity: 1 }}
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.4 }}
        >
          <Badge variant="accent" size="sm" className="shadow-soft text-[10px] sm:text-xs">
            <Truck size={10} className="mr-0.5 sm:mr-1" aria-hidden="true" /> 
            <span>Livraison gratuite</span>
          </Badge>
        </motion.div>
      )}
    </div>
  )

  const renderImage = (className: string, sizes: string) => (
    <div className="relative w-full h-full">
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 bg-neutral-100 dark:bg-midnight-700/40 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-neutral-300" aria-hidden="true" />
          <span className="sr-only">Chargement de l'image...</span>
        </div>
      )}
      <Image
        src={imageUrl}
        alt={product.nom}
        fill
        sizes={sizes}
        className={cn(
          'object-contain p-2 sm:p-4',
          disableBlurUp ? 'transition-opacity duration-500' : 'transition-transform duration-700',
          imageLoaded ? 'opacity-100' : 'opacity-0',
          !disableBlurUp && shouldAnimate && 'group-hover:scale-110',
          className
        )}
        loading="lazy"
        quality={75}
        onLoad={handleImageLoad}
        onError={handleImageError}
        priority={false}
      />
    </div>
  )

  const renderStars = () => {
    if (!product.note) return null
    
    return (
      <div className="flex items-center gap-0.5 mb-2" aria-label={`Note: ${product.note} sur 5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={12}
            className={cn(
              i < Math.round(product.note!) 
                ? 'text-gold-500 fill-gold-500' 
                : 'text-neutral-300 dark:text-neutral-600'
            )}
            aria-hidden="true"
          />
        ))}
        <span className="text-xs text-neutral-400 ml-1">
          ({product.avis_count || 0})
        </span>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════ */
  /*  VERSION LISTE                                                 */
  /* ═══════════════════════════════════════════════════════════════ */

  if (variant === 'list') {
    return (
      <div ref={inViewRef}>
        <Card 
          hover 
          className={cn(
            "overflow-hidden group relative border-gold-400/10 hover:border-gold-400/30",
            className
          )}
        >
          <Link 
            href={`/produits/${product.slug || product.id}`} 
            className="flex gap-3 sm:gap-4 p-3 sm:p-4 w-full"
            aria-label={`${product.nom} - ${product.prix.toLocaleString()} FC`}
          >
            <div className="relative w-32 sm:w-40 h-32 sm:h-40 rounded-xl overflow-hidden bg-neutral-100 dark:bg-midnight-700/40 flex-shrink-0">
              {renderImage('object-contain p-2 group-hover:scale-110 transition-transform duration-700', '160px')}
              <div className="absolute inset-0 bg-gradient-to-tr from-gold-400/0 via-transparent to-gold-400/0 group-hover:from-gold-400/10 group-hover:to-gold-400/10 transition-all duration-500 pointer-events-none" />
            </div>
            
            <div className="flex-1 flex flex-col min-w-0">
              <p className="text-xs font-medium text-gold-600 dark:text-gold-400 mb-1">
                {product.vendeur?.boutique_nom || 'Vendu par Gercie'}
              </p>
              
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-base sm:text-lg group-hover:text-gold-600 dark:group-hover:text-gold-400 transition-colors line-clamp-2">
                {product.nom}
              </h3>
              
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {product.note && (
                  <div className="flex items-center gap-0.5 text-gold-500">
                    <Star size={14} fill="currentColor" aria-hidden="true" />
                    <span className="text-sm font-medium">{product.note}</span>
                    <span className="text-xs text-neutral-400">({product.avis_count || 0})</span>
                  </div>
                )}
                
                {product.negotiable && (
                  <Badge variant="info" size="sm" className="text-[10px] sm:text-xs">
                    Négociable
                  </Badge>
                )}
                
                {hasAIScore && (
                  <Badge 
                    variant="accent" 
                    size="sm" 
                    className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-[10px] sm:text-xs"
                  >
                    <Sparkles size={10} className="mr-0.5 sm:mr-1" aria-hidden="true" /> 
                    <span>{Math.round(aiScore! * 100)}% pour vous</span>
                  </Badge>
                )}
                
                {!isOnline && (
                  <Tooltip content="Mode hors ligne">
                    <WifiOff size={14} className="text-muted-foreground" aria-hidden="true" />
                  </Tooltip>
                )}
              </div>
              
              <div className="mt-auto flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white">
                      {product.prix.toLocaleString()} FC
                    </span>
                    {originalPrice && (
                      <span className="text-xs sm:text-sm text-neutral-400 line-through">
                        {originalPrice.toLocaleString()} FC
                      </span>
                    )}
                  </div>
                  {prixUSD && (
                    <p className="text-xs sm:text-sm text-accent-600 dark:text-accent-400">
                      ≈ {prixUSD.toFixed(2)} USD
                    </p>
                  )}
                </div>
                
                <Button 
                  variant="luxe" 
                  size="sm" 
                  leftIcon={<ShoppingBag size={16} aria-hidden="true" />} 
                  onClick={handleAddToCart}
                  className="flex-shrink-0"
                  aria-label={`Ajouter ${product.nom} au panier`}
                >
                  <span className="hidden sm:inline">Ajouter</span>
                  <span className="sm:hidden">+</span>
                </Button>
              </div>
            </div>
          </Link>
          
          {showFavoriteButton && (
            <motion.button
              whileHover={shouldAnimate ? { scale: 1.15 } : {}}
              whileTap={shouldAnimate ? { scale: 0.9 } : {}}
              onClick={handleToggleFavorite}
              className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10 p-2 rounded-full bg-white/80 dark:bg-midnight-800/80 backdrop-blur-xl shadow-soft hover:shadow-gold border border-neutral-200/50 dark:border-midnight-500/30 transition-all focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              aria-pressed={isFav}
            >
              <Heart
                size={16}
                className={cn(
                  'transition-colors',
                  isFav ? 'fill-red-500 text-red-500' : 'text-neutral-400 dark:text-neutral-500'
                )}
                aria-hidden="true"
              />
            </motion.button>
          )}
        </Card>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════ */
  /*  VERSION GRILLE (DÉFAUT)                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  return (
    <div ref={inViewRef}>
      <Card 
        hover 
        className={cn(
          "overflow-hidden group relative border-neutral-200 dark:border-midnight-500/30 hover:border-gold-400/30 dark:hover:border-gold-400/20 hover:shadow-glow-gold transition-all duration-500",
          className
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Link 
          href={`/produits/${product.slug || product.id}`} 
          className="block"
          aria-label={`${product.nom} - ${product.prix.toLocaleString()} FC`}
        >
          <div className="relative aspect-square bg-neutral-100 dark:bg-midnight-700/40 overflow-hidden">
            {renderImage(
              'object-contain p-2 sm:p-4 group-hover:scale-110 transition-transform duration-700 ease-out', 
              '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'
            )}

            <div className="absolute inset-0 bg-gradient-to-tr from-gold-400/0 via-transparent to-gold-400/0 group-hover:from-gold-400/10 group-hover:via-gold-400/5 group-hover:to-gold-400/10 transition-all duration-500 pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/5 to-transparent dark:from-black/20 pointer-events-none" />

            {renderFloatingBadges()}

            {/* Overlay desktop */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={shouldAnimate ? { opacity: 0 } : { opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={shouldAnimate ? { opacity: 0 } : { opacity: 1 }}
                  className="absolute inset-0 bg-black/50 hidden md:flex items-center justify-center gap-2 backdrop-blur-sm"
                >
                  <Button
                    variant="glass"
                    size="sm"
                    leftIcon={<Eye size={16} aria-hidden="true" />}
                    onClick={(e) => { 
                      e.preventDefault()
                      window.location.href = `/produits/${product.slug || product.id}` 
                    }}
                    className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                    aria-label="Voir les détails"
                  >
                    Détails
                  </Button>
                  <Button
                    variant={cartAdded ? 'accent' : 'luxe'}
                    size="sm"
                    leftIcon={cartAdded ? <Check size={16} aria-hidden="true" /> : <ShoppingBag size={16} aria-hidden="true" />}
                    onClick={handleAddToCart}
                    aria-label={cartAdded ? 'Ajouté au panier' : 'Ajouter au panier'}
                  >
                    {cartAdded ? 'Ajouté ✓' : 'Panier'}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {lowStock && (
              <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10">
                <Badge variant="warning" size="sm" className="shadow-soft text-[10px] sm:text-xs">
                  ⚡ Plus que {product.stock}
                </Badge>
              </div>
            )}
          </div>

          <CardContent className="pt-3 sm:pt-4 pb-4 sm:pb-5 px-3 sm:px-4">
            <p className="text-[10px] sm:text-xs font-medium text-gold-600 dark:text-gold-400 mb-1 tracking-wide uppercase">
              {product.vendeur?.boutique_nom || 'Vendu par Gercie'}
            </p>
            
            <h3 className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 mb-1 sm:mb-1.5 min-h-[2rem] sm:min-h-[2.5rem] group-hover:text-gold-600 dark:group-hover:text-gold-400 transition-colors">
              {product.nom}
            </h3>

            {renderStars()}

            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1 sm:gap-1.5 flex-wrap">
                  <span className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                    {product.prix.toLocaleString()}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                    FC
                  </span>
                </div>
                
                {originalPrice && (
                  <p className="text-[10px] sm:text-xs text-neutral-400 line-through">
                    {originalPrice.toLocaleString()} FC
                  </p>
                )}
                
                {prixUSD && (
                  <p className="text-[10px] sm:text-xs font-medium text-gold-600 dark:text-gold-400 mt-0.5">
                    ≈ {prixUSD.toFixed(2)} USD
                  </p>
                )}
                
                {product.total_ventes && product.total_ventes > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-[10px] sm:text-xs text-muted-foreground">
                    <TrendingUp size={10} aria-hidden="true" />
                    <span>{product.total_ventes} vendus</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-1 sm:gap-2">
                {showShareButton && (
                  <Tooltip content="Partager">
                    <button
                      onClick={handleShare}
                      className="p-1.5 sm:p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-midnight-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500"
                      aria-label="Partager ce produit"
                    >
                      <Share2 size={14} className="text-muted-foreground" aria-hidden="true" />
                    </button>
                  </Tooltip>
                )}
                
                <Button
                  variant="luxe"
                  size="sm"
                  onClick={handleAddToCart}
                  aria-label={`Ajouter ${product.nom} au panier`}
                >
                  <ShoppingBag size={16} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Link>

        {showFavoriteButton && (
          <motion.button
            whileHover={shouldAnimate ? { scale: 1.15 } : {}}
            whileTap={shouldAnimate ? { scale: 0.9 } : {}}
            onClick={handleToggleFavorite}
            className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10 p-2 rounded-full bg-white/80 dark:bg-midnight-800/80 backdrop-blur-xl shadow-soft hover:shadow-gold border border-neutral-200/50 dark:border-midnight-500/30 transition-all focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={isFav}
          >
            <Heart
              size={16}
              className={cn(
                'transition-colors',
                isFav ? 'fill-red-500 text-red-500' : 'text-neutral-400 dark:text-neutral-500'
              )}
              aria-hidden="true"
            />
          </motion.button>
        )}
      </Card>
    </div>
  )
})

ProductCardContent.displayName = 'ProductCardContent'

// Export avec lazy loading
const ProductCard = dynamic(() => Promise.resolve(ProductCardContent), {
  ssr: true,
  loading: () => (
    <div className="aspect-square rounded-xl bg-neutral-100 dark:bg-midnight-800/40 animate-pulse" />
  ),
})

export default ProductCard