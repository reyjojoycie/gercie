// components/product/InfiniteCarouselRow.tsx
'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Eye, Heart, ShoppingCart, BarChart3, Check, WifiOff } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { Badge } from '@/components/ui/Badge';
import { useAccessibilityPreferences } from '@/contexts/ThemeContext';
import { useOnlineStatus } from '@/contexts/OnlineStatusContext';

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface Product {
  id: string;
  nom: string;
  prix: number;
  images: string[];
  discount?: number;
  rating?: number;
  stock?: number;
  total_ventes?: number;
  created_at?: string;
  vendeur?: { boutique_nom: string };
  categorie?: string;
  description?: string;
  slug?: string;
}

interface InfiniteCarouselRowProps {
  products: Product[];
  autoPlayInterval?: number;
  className?: string;
  compact?: boolean;
  visibleItems?: number;
  maxProductsPerRow?: number;
  onQuickView?: (productId: string) => void;
  onAddToCart?: (productId: string) => void;
  onToggleFavorite?: (productId: string) => void;
  onCompare?: (productId: string) => void;
  compareList?: string[];
  favorites?: Set<string>;
  adminMode?: boolean;
  selectedIds?: Set<string>;
  onSelectProduct?: (id: string) => void;
  columnsPerView?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  disableAnimations?: boolean;
  showNavigationAlways?: boolean;
  disableAutoplayOnMobile?: boolean;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const NEW_PRODUCT_DAYS = 7;
const TOP_SELLER_THRESHOLD = 100;
const LOW_STOCK_THRESHOLD = 5;
const MOBILE_BREAKPOINT = 640;
const TABLET_BREAKPOINT = 1024;

const DEFAULT_COLUMNS = {
  mobile: 2,
  tablet: 3,
  desktop: 5,
};

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS                                                          */
/* ═══════════════════════════════════════════════════════════════ */

function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < MOBILE_BREAKPOINT) setBreakpoint('mobile');
      else if (width < TABLET_BREAKPOINT) setBreakpoint('tablet');
      else setBreakpoint('desktop');
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}

function useInView(options?: IntersectionObserverInit) {
  const [isInView, setIsInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
    }, {
      threshold: 0.3,
      rootMargin: '100px',
      ...options,
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [options]);

  return { ref, isInView };
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION                                                     */
/* ═══════════════════════════════════════════════════════════════ */

function isValidProduct(product: any): product is Product {
  return (
    product &&
    typeof product.id === 'string' &&
    typeof product.nom === 'string' &&
    typeof product.prix === 'number' &&
    product.prix > 0 &&
    Array.isArray(product.images)
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export const InfiniteCarouselRow = memo<InfiniteCarouselRowProps>(({
  products,
  autoPlayInterval,
  className,
  compact = false,
  visibleItems: controlledVisibleItems,
  maxProductsPerRow = 10,
  onQuickView,
  onAddToCart,
  onToggleFavorite,
  onCompare,
  compareList = [],
  favorites = new Set(),
  adminMode = false,
  selectedIds = new Set(),
  onSelectProduct,
  columnsPerView,
  disableAnimations = false,
  showNavigationAlways = false,
  disableAutoplayOnMobile = true,
}) => {
  const { prefersReducedMotion } = useAccessibilityPreferences();
  const isOnline = useOnlineStatus();
  const breakpoint = useBreakpoint();
  const { ref: inViewRef, isInView } = useInView();
  
  const autoplayTimer = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isHovered, setIsHovered] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // Validation et limitation
  const validProducts = useMemo(() => {
    const filtered = products.filter(isValidProduct);
    return filtered.slice(0, maxProductsPerRow);
  }, [products, maxProductsPerRow]);

  // Calcul responsive
  const columnsPerBreakpoint = useMemo(() => {
    if (controlledVisibleItems) return controlledVisibleItems;
    
    if (columnsPerView) {
      if (breakpoint === 'mobile' && columnsPerView.mobile) return columnsPerView.mobile;
      if (breakpoint === 'tablet' && columnsPerView.tablet) return columnsPerView.tablet;
      if (breakpoint === 'desktop' && columnsPerView.desktop) return columnsPerView.desktop;
    }
    
    return DEFAULT_COLUMNS[breakpoint];
  }, [controlledVisibleItems, columnsPerView, breakpoint]);

  // ✅ Embla Carousel avec loop: true
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: 'start',
    slidesToScroll: columnsPerBreakpoint,
    dragFree: false,
    containScroll: 'trimSnaps',
    skipSnaps: false,
  });

  const shouldAnimate = !disableAnimations && !prefersReducedMotion;

  const shouldAutoPlay = useMemo(() => {
    if (!autoPlayInterval) return false;
    if (!isInView) return false;
    if (isHovered) return false;
    if (prefersReducedMotion) return false;
    if (disableAutoplayOnMobile && breakpoint === 'mobile') return false;
    return true;
  }, [autoPlayInterval, isInView, isHovered, prefersReducedMotion, disableAutoplayOnMobile, breakpoint]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  AUTOPLAY AVEC LOOP FLUIDE                                      */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!shouldAutoPlay || !emblaApi) return;

    const play = () => {
      if (autoplayTimer.current) clearInterval(autoplayTimer.current);
      autoplayTimer.current = setInterval(() => {
        // ✅ Embla gère le loop automatiquement avec loop: true
        emblaApi.scrollNext();
      }, autoPlayInterval);
    };

    const stop = () => {
      if (autoplayTimer.current) {
        clearInterval(autoplayTimer.current);
        autoplayTimer.current = null;
      }
    };

    // Arrêter sur interaction
    emblaApi.on('pointerDown', stop);

    play();

    return () => {
      stop();
      emblaApi.off('pointerDown', stop);
    };
  }, [shouldAutoPlay, autoPlayInterval, emblaApi]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  HANDLERS                                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  const handleScrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const handleScrollNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  const handleImageError = useCallback((productId: string) => {
    setImageErrors(prev => new Set(prev).add(productId));
  }, []);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  METADATA                                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  const productsWithMeta = useMemo(() => {
    return validProducts.map((product) => {
      const isNew = product.created_at && 
        Date.now() - new Date(product.created_at).getTime() < NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
      const isTopSeller = (product.total_ventes || 0) > TOP_SELLER_THRESHOLD;
      const hasLowStock = (product.stock || 0) > 0 && (product.stock || 0) <= LOW_STOCK_THRESHOLD;
      const isFav = favorites.has(product.id);
      const hasImageError = imageErrors.has(product.id);

      return {
        ...product,
        isNew,
        isTopSeller,
        hasLowStock,
        isFav,
        hasImageError,
      };
    });
  }, [validProducts, favorites, imageErrors]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDER                                                         */
  /* ═══════════════════════════════════════════════════════════════ */

  if (validProducts.length === 0) return null;

  return (
    <div 
      ref={inViewRef}
      className={cn('relative group', className)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Carrousel de produits"
    >
      {/* ✅ Boutons de navigation - CORRIGÉ (pas de double disabled) */}
      {validProducts.length > columnsPerBreakpoint && (
        <>
          <button
            type="button"
            onClick={handleScrollPrev}
            className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full",
              "bg-white/90 dark:bg-midnight-800/90 shadow-md",
              "hover:bg-white dark:hover:bg-midnight-700 transition-all",
              "focus:outline-none focus:ring-2 focus:ring-gold-500",
              showNavigationAlways ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
            aria-label="Produits précédents"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleScrollNext}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full",
              "bg-white/90 dark:bg-midnight-800/90 shadow-md",
              "hover:bg-white dark:hover:bg-midnight-700 transition-all",
              "focus:outline-none focus:ring-2 focus:ring-gold-500",
              showNavigationAlways ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
            aria-label="Produits suivants"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </>
      )}

      {/* Indicateur offline */}
      {!isOnline && (
        <div className="absolute top-2 right-2 z-20 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2 py-1 flex items-center gap-1">
          <WifiOff size={12} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <span className="text-xs text-blue-800 dark:text-blue-200">Hors ligne</span>
        </div>
      )}

      {/* Carousel container */}
      <div 
        ref={containerRef}
        className="overflow-hidden" 
        tabIndex={0}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="group"
        aria-label="Liste de produits"
      >
        <div ref={emblaRef} className="overflow-hidden">
          <div className="flex">
            {productsWithMeta.map((product, idx) => (
              <div
                key={`${product.id}-${idx}`}
                className="flex-shrink-0 px-1.5 sm:px-2"
                style={{ width: `${100 / columnsPerBreakpoint}%` }}
                role="group"
                aria-roledescription="slide"
                aria-label={`Slide ${idx + 1} sur ${validProducts.length}: ${product.nom}`}
              >
                <div className="relative group/card">
                  {/* Badges */}
                  <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                    {product.isNew && (
                      <Badge 
                        variant="accent" 
                        size="sm" 
                        className={cn("text-[10px] sm:text-xs", shouldAnimate && "animate-pulse")}
                      >
                        Nouveau
                      </Badge>
                    )}
                    {product.discount && product.discount > 0 && (
                      <Badge variant="danger" size="sm" className="font-bold text-[10px] sm:text-xs">
                        -{product.discount}%
                      </Badge>
                    )}
                    {product.isTopSeller && (
                      <Badge variant="gold" size="sm" className="text-[10px] sm:text-xs">
                        Top vente
                      </Badge>
                    )}
                    {product.hasLowStock && (
                      <Badge variant="warm" size="sm" className="text-[10px] sm:text-xs">
                        Stock limité
                      </Badge>
                    )}
                  </div>

                  {/* Actions overlay */}
                  {!adminMode && (
                    <div className="absolute top-2 right-2 z-10 flex flex-col gap-2 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
                      {onQuickView && (
                        <Tooltip content="Aperçu rapide">
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              onQuickView(product.id); 
                            }}
                            className="p-2 bg-white/95 dark:bg-neutral-800/95 rounded-full shadow-md hover:bg-gold-100 transition focus:outline-none focus:ring-2 focus:ring-gold-500"
                            aria-label={`Aperçu rapide de ${product.nom}`}
                          >
                            <Eye size={16} className="text-gold-600" aria-hidden="true" />
                          </button>
                        </Tooltip>
                      )}
                      {onAddToCart && (
                        <Tooltip content="Ajouter au panier">
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              onAddToCart(product.id); 
                            }}
                            className="p-2 bg-white/95 dark:bg-neutral-800/95 rounded-full shadow-md hover:bg-gold-100 transition focus:outline-none focus:ring-2 focus:ring-gold-500"
                            aria-label={`Ajouter ${product.nom} au panier`}
                          >
                            <ShoppingCart size={16} className="text-gold-600" aria-hidden="true" />
                          </button>
                        </Tooltip>
                      )}
                      {onCompare && (
                        <Tooltip content={compareList.includes(product.id) ? 'Retirer du comparateur' : 'Comparer'}>
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              onCompare(product.id); 
                            }}
                            className={cn(
                              'p-2 rounded-full shadow-md transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                              compareList.includes(product.id) 
                                ? 'bg-gold-500 text-white' 
                                : 'bg-white/95 dark:bg-neutral-800/95 hover:bg-gold-100'
                            )}
                            aria-label={compareList.includes(product.id) ? `Retirer ${product.nom} du comparateur` : `Comparer ${product.nom}`}
                            aria-pressed={compareList.includes(product.id)}
                          >
                            {compareList.includes(product.id) ? (
                              <Check size={16} aria-hidden="true" />
                            ) : (
                              <BarChart3 size={16} className="text-gold-600" aria-hidden="true" />
                            )}
                          </button>
                        </Tooltip>
                      )}
                      {onToggleFavorite && (
                        <Tooltip content={product.isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              onToggleFavorite(product.id); 
                            }}
                            className={cn(
                              'p-2 rounded-full shadow-md transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                              product.isFav 
                                ? 'bg-red-500 text-white' 
                                : 'bg-white/95 dark:bg-neutral-800/95 hover:bg-red-100'
                            )}
                            aria-label={product.isFav ? `Retirer ${product.nom} des favoris` : `Ajouter ${product.nom} aux favoris`}
                            aria-pressed={product.isFav}
                          >
                            <Heart 
                              size={16} 
                              className={product.isFav ? 'fill-current' : ''} 
                              aria-hidden="true"
                            />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  )}

                  {/* Admin mode */}
                  {adminMode && (
                    <div className="absolute top-2 right-2 z-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => onSelectProduct?.(product.id)}
                        className="w-4 h-4 rounded border-neutral-300 text-gold-500 focus:ring-gold-400"
                        aria-label={`Sélectionner ${product.nom}`}
                      />
                    </div>
                  )}

                  {/* Product Card */}
                  <ProductCard 
                    product={product} 
                    variant="grid" 
                    compact={compact}
                    disableAnimations={!shouldAnimate}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Annonce pour lecteurs d'écran */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Carrousel de {validProducts.length} produits. Utilisez les flèches gauche et droite pour naviguer.
      </div>
    </div>
  );
});

InfiniteCarouselRow.displayName = 'InfiniteCarouselRow';

export default InfiniteCarouselRow;