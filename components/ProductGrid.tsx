// ---------------------------------------------------------------------------
// ProductGrid – Grille de produits intelligente avec mode carrousel infini
// Optimisé pour mobile 2G/3G (Kinshasa) : responsive, cache, accessibilité
// ---------------------------------------------------------------------------
'use client'

import React, { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import ProductCard from './ProductCard'
import InfiniteCarouselRow from '@/components/product/InfiniteCarouselRow'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import FilterToolbar from './product/FilterToolbar'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'
import {
  RefreshCw, Search, Eye, Heart, ShoppingCart, Check,
  AlertTriangle, Star, Loader2, CheckCircle2,
  Package, Sparkles, Flame, Clock, BarChart3, Plus, WifiOff,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface Product {
  id: string
  nom: string
  prix: number
  prix_usd?: number
  images: string[]
  vendeur?: { boutique_nom: string }
  categorie?: string
  created_at?: string
  description?: string
  rating?: number
  reviews_count?: number
  stock?: number
  discount?: number
  total_ventes?: number
  badges?: string[]
  est_actif?: boolean
  remise_percent?: number
  slug?: string
}

interface ProductGridProps {
  products: Product[]
  loading: boolean
  error?: string | null
  onRetry?: () => void
  emptyState?: {
    title?: string
    description?: string
    actionLabel?: string
    onAction?: () => void
    secondaryActionLabel?: string
    onSecondaryAction?: () => void
  }
  columns?: 'auto' | 2 | 3 | 4 | 5 | 6
  cardVariant?: 'grid' | 'list'
  animated?: boolean
  className?: string
  showQuickSort?: boolean
  onQuickView?: (productId: string) => void
  onAddToCart?: (productId: string) => void
  onToggleFavorite?: (productId: string) => void
  onCompare?: (productId: string) => void
  compareList?: string[]
  viewMode?: 'grid' | 'list'
  onViewModeChange?: (mode: 'grid' | 'list') => void
  sortBy?: string
  onSortByChange?: (sortBy: string) => void
  currentPage?: number
  totalPages?: number
  onLoadMore?: () => void
  loadingMore?: boolean
  infiniteScroll?: boolean
  showQuickFilters?: boolean
  showStockInfo?: boolean
  showRatings?: boolean
  showVendor?: boolean
  showCategory?: boolean
  compact?: boolean
  adminMode?: boolean
  onExportCSV?: (columns?: string[]) => void
  onBulkAction?: (action: string, ids: string[]) => void
  selectedIds?: Set<string>
  onSelectProduct?: (id: string) => void
  favorites?: Set<string>
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  categories?: { value: string; label: string }[]
  selectedCategory?: string
  onCategoryChange?: (value: string) => void
  minRating?: number
  onMinRatingChange?: (value: number) => void
  inStockOnly?: boolean
  onInStockChange?: (checked: boolean) => void
  freeShippingOnly?: boolean
  onFreeShippingChange?: (checked: boolean) => void
  expressOnly?: boolean
  onExpressChange?: (checked: boolean) => void
  totalResults?: number
  persistKey?: string
  availableTags?: { value: string; label: string }[]
  selectedTags?: string[]
  onTagsChange?: (tags: string[]) => void
  filterMinDiscount?: string
  onChangeMinDiscount?: (value: string) => void
  filterMaxDiscount?: string
  onChangeMaxDiscount?: (value: string) => void
  filterDateFrom?: string
  onChangeDateFrom?: (value: string) => void
  filterDateTo?: string
  onChangeDateTo?: (value: string) => void
  filterVendor?: string
  onChangeVendor?: (value: string) => void
  secondarySorts?: string[]
  onSecondarySortsChange?: (sorts: string[]) => void
  /** Activer le mode carrousel par lignes */
  carouselRows?: boolean
  /** Nombre de produits par ligne en mode carrousel (max 10) */
  itemsPerRow?: number
  /** Nombre initial de lignes affichées */
  maxRows?: number
  /** Intervalle d'autoplay en ms (0 = désactivé) */
  carouselAutoPlay?: number
  /** Afficher le bouton "Voir plus" pour ajouter des lignes */
  showAddRowButton?: boolean
  /** Désactiver les animations */
  disableAnimations?: boolean
  /** Callback quand un produit est cliqué */
  onProductClick?: (product: Product) => void
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEBOUNCE_DELAY = 300 // ms
const NEW_PRODUCT_DAYS = 7
const TOP_SELLER_THRESHOLD = 100
const LOW_STOCK_THRESHOLD = 5
const INTERSECTION_ROOT_MARGIN = '200px'

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS PERSONNALISÉS                                            */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Hook pour debounce une valeur
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
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
    product.prix > 0 &&
    Array.isArray(product.images)
  )
}

function validateProducts(products: any[]): Product[] {
  if (!Array.isArray(products)) {
    console.warn('Données produits invalides: pas un tableau')
    return []
  }
  return products.filter(isValidProduct)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export const ProductGrid = memo<ProductGridProps>(({
  products,
  loading,
  error = null,
  onRetry,
  emptyState = {},
  columns = 'auto',
  animated = true,
  className,
  showQuickSort = true,
  onQuickView,
  onAddToCart,
  onToggleFavorite,
  onCompare,
  compareList = [],
  viewMode: controlledViewMode,
  onViewModeChange,
  sortBy: controlledSortBy,
  onSortByChange,
  currentPage,
  totalPages,
  onLoadMore,
  loadingMore = false,
  infiniteScroll = false,
  showQuickFilters = true,
  showStockInfo = true,
  showRatings = true,
  showVendor = true,
  showCategory = true,
  compact = false,
  adminMode = false,
  onExportCSV,
  onBulkAction,
  selectedIds = new Set(),
  onSelectProduct,
  favorites = new Set(),
  searchValue: externalSearchValue,
  onSearchChange,
  searchPlaceholder,
  categories,
  selectedCategory: externalSelectedCategory,
  onCategoryChange,
  minRating,
  onMinRatingChange,
  inStockOnly,
  onInStockChange,
  freeShippingOnly,
  onFreeShippingChange,
  expressOnly,
  onExpressChange,
  totalResults,
  persistKey,
  availableTags,
  selectedTags: externalSelectedTags,
  onTagsChange,
  filterMinDiscount: externalFilterMinDiscount,
  onChangeMinDiscount,
  filterMaxDiscount: externalFilterMaxDiscount,
  onChangeMaxDiscount,
  filterDateFrom: externalFilterDateFrom,
  onChangeDateFrom,
  filterDateTo: externalFilterDateTo,
  onChangeDateTo,
  filterVendor: externalFilterVendor,
  onChangeVendor,
  secondarySorts: externalSecondarySorts,
  onSecondarySortsChange,
  carouselRows = false,
  itemsPerRow = 5,
  maxRows = 3,
  carouselAutoPlay = 5000,
  showAddRowButton = true,
  disableAnimations = false,
  onProductClick,
}) => {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const isOnline = useOnlineStatus()

  // États locaux
  const [internalViewMode, setInternalViewMode] = useState<'grid' | 'list'>('grid')
  const [internalSortBy, setInternalSortBy] = useState<string>('default')
  const [filterMinPrice, setFilterMinPrice] = useState('')
  const [filterMaxPrice, setFilterMaxPrice] = useState('')
  const [showCompact, setShowCompact] = useState(compact)
  const [hoveredProductId, setHoveredProductId] = useState<string | null>(null)
  const [visibleRows, setVisibleRows] = useState(maxRows)

  // Debounced filters
  const debouncedMinPrice = useDebounce(filterMinPrice, DEBOUNCE_DELAY)
  const debouncedMaxPrice = useDebounce(filterMaxPrice, DEBOUNCE_DELAY)

  // Refs
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const shouldAnimate = animated && !disableAnimations && !prefersReducedMotion

  // Validation des produits
  const validProducts = useMemo(() => validateProducts(products), [products])

  // Synchroniser visibleRows avec maxRows
  useEffect(() => {
    setVisibleRows(maxRows)
  }, [maxRows])

  // ViewMode et SortBy (controlled ou internal)
  const viewMode = controlledViewMode ?? internalViewMode
  const sortBy = controlledSortBy ?? internalSortBy

  // Classes CSS pour les colonnes
  const gridColsClass = useMemo(() => {
    const base = showCompact
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

    const colsMap = {
      auto: base,
      2: 'grid-cols-2',
      3: 'grid-cols-2 sm:grid-cols-3',
      4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
      5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
      6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
    } as const

    return colsMap[columns]
  }, [columns, showCompact])

  // Empty state avec valeurs par défaut
  const {
    title = 'Aucun produit trouvé',
    description = 'Essayez de modifier vos filtres ou explorez le catalogue complet.',
    actionLabel = 'Voir tout le catalogue',
    onAction,
    secondaryActionLabel,
    onSecondaryAction,
  } = emptyState

  // Filtrage par prix
  const filteredProducts = useMemo(() => {
    let arr = [...validProducts]

    if (debouncedMinPrice) {
      const min = parseFloat(debouncedMinPrice)
      if (!isNaN(min)) {
        arr = arr.filter(p => p.prix >= min)
      }
    }

    if (debouncedMaxPrice) {
      const max = parseFloat(debouncedMaxPrice)
      if (!isNaN(max)) {
        arr = arr.filter(p => p.prix <= max)
      }
    }

    return arr
  }, [validProducts, debouncedMinPrice, debouncedMaxPrice])

  // Tri des produits
  const sortedProducts = useMemo(() => {
    const arr = [...filteredProducts]

    switch (sortBy) {
      case 'price-asc':
        return arr.sort((a, b) => a.prix - b.prix)
      case 'price-desc':
        return arr.sort((a, b) => b.prix - a.prix)
      case 'newest':
        return arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      case 'rating':
        return arr.sort((a, b) => (b.rating || 0) - (a.rating || 0))
      case 'discount':
        return arr.sort((a, b) => (b.discount || 0) - (a.discount || 0))
      case 'sales':
        return arr.sort((a, b) => (b.total_ventes || 0) - (a.total_ventes || 0))
      default:
        return arr
    }
  }, [filteredProducts, sortBy])

  // Statistiques
  const stats = useMemo(() => {
    const total = sortedProducts.length
    const inStock = sortedProducts.filter(p => (p.stock || 0) > 0).length
    const avgPrice = total > 0
      ? sortedProducts.reduce((acc, p) => acc + p.prix, 0) / total
      : 0

    return { total, inStock, avgPrice }
  }, [sortedProducts])

  // Calcul du nombre total de lignes disponibles
  const totalRowsAvailable = useMemo(() => {
    return Math.ceil(sortedProducts.length / itemsPerRow)
  }, [sortedProducts.length, itemsPerRow])

  // Ajouter une ligne
  const addRow = useCallback(() => {
    setVisibleRows(prev => Math.min(prev + 1, totalRowsAvailable))
  }, [totalRowsAvailable])

  // Gestion du tri
  const handleSortChange = useCallback((newSort: string) => {
    if (controlledSortBy === undefined) {
      setInternalSortBy(newSort)
    }
    onSortByChange?.(newSort)
  }, [controlledSortBy, onSortByChange])

  // Réinitialiser les filtres
  const resetFilters = useCallback(() => {
    setFilterMinPrice('')
    setFilterMaxPrice('')
    handleSortChange('default')
  }, [handleSortChange])

  // Vérifier si des filtres sont actifs
  const hasActiveFilters = useMemo(() => {
    return filterMinPrice || filterMaxPrice || sortBy !== 'default'
  }, [filterMinPrice, filterMaxPrice, sortBy])

  // Intersection Observer pour infinite scroll
  useEffect(() => {
    if (!infiniteScroll || !onLoadMore || !loadMoreRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (
          entry.isIntersecting &&
          !loading &&
          !loadingMore &&
          (totalPages === undefined || (currentPage || 1) < (totalPages || 1))
        ) {
          onLoadMore()
        }
      },
      { rootMargin: INTERSECTION_ROOT_MARGIN }
    )

    observer.observe(loadMoreRef.current)

    return () => observer.disconnect()
  }, [infiniteScroll, onLoadMore, loading, loadingMore, currentPage, totalPages])

  // Actions bulk
  const handleBulkActivate = useCallback(() => {
    onBulkAction?.('activate', Array.from(selectedIds))
  }, [onBulkAction, selectedIds])

  const handleBulkDeactivate = useCallback(() => {
    onBulkAction?.('deactivate', Array.from(selectedIds))
  }, [onBulkAction, selectedIds])

  // Handlers memoizés pour les actions sur les produits
  const handleQuickView = useCallback((productId: string) => {
    onQuickView?.(productId)
  }, [onQuickView])

  const handleAddToCart = useCallback((productId: string) => {
    onAddToCart?.(productId)
  }, [onAddToCart])

  const handleToggleFavorite = useCallback((productId: string) => {
    onToggleFavorite?.(productId)
  }, [onToggleFavorite])

  const handleCompare = useCallback((productId: string) => {
    onCompare?.(productId)
  }, [onCompare])

  const handleSelectProduct = useCallback((productId: string) => {
    onSelectProduct?.(productId)
  }, [onSelectProduct])

  // Métadonnées des produits (calculées une seule fois)
  const productsWithMeta = useMemo(() => {
    return sortedProducts.map((product) => {
      const isNew = product.created_at &&
        Date.now() - new Date(product.created_at).getTime() < NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000
      const isTopSeller = (product.total_ventes || 0) > TOP_SELLER_THRESHOLD
      const hasLowStock = (product.stock || 0) > 0 && (product.stock || 0) <= LOW_STOCK_THRESHOLD

      return {
        ...product,
        isNew,
        isTopSeller,
        hasLowStock,
      }
    })
  }, [sortedProducts])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  ÉTATS DE CHARGEMENT ET ERREURS                               */
  /* ═══════════════════════════════════════════════════════════════ */

  if (loading && products.length === 0) {
    return (
      <div className={cn('space-y-4 sm:space-y-6', className)} role="status" aria-label="Chargement des produits">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-32 h-6" />
          <div className="flex gap-2">
            <Skeleton variant="rounded" className="w-10 h-10 rounded-full" />
            <Skeleton variant="rounded" className="w-10 h-10 rounded-full" />
          </div>
        </div>

        <div className={cn('grid gap-3 sm:gap-4 md:gap-6', gridColsClass)}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="p-3 sm:p-4 bg-white dark:bg-midnight-800/40 rounded-2xl shadow-card"
            >
              <Skeleton variant="rectangular" className="w-full aspect-square mb-2 sm:mb-3" />
              <Skeleton variant="text" className="w-3/4 mb-2" />
              <Skeleton variant="text" className="w-1/2" />
              <div className="flex items-center justify-between mt-3 sm:mt-4">
                <Skeleton variant="text" className="w-24 h-5" />
                <Skeleton variant="rounded" className="w-20 h-8 rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        <span className="sr-only">Chargement...</span>
      </div>
    )
  }

  if (error && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 sm:py-20 px-4 text-center" role="alert">
        <div className="bg-burgundy-50 dark:bg-burgundy-900/20 rounded-2xl p-6 sm:p-8 shadow-soft max-w-md border border-burgundy-200 dark:border-burgundy-800">
          <AlertTriangle
            className="mx-auto text-burgundy-500 mb-3 sm:mb-4"
            size={48}
            aria-hidden="true"
          />
          <h3 className="text-lg sm:text-xl font-semibold text-burgundy-800 dark:text-burgundy-300 mb-2">
            Oups, une erreur est survenue
          </h3>
          <p className="text-sm text-burgundy-600 dark:text-burgundy-400 mb-4 sm:mb-6">
            {error}
          </p>
          <div className="flex gap-3 justify-center">
            {onRetry && (
              <Button
                variant="danger"
                size="sm"
                onClick={onRetry}
                leftIcon={<RefreshCw size={16} aria-hidden="true" />}
              >
                Réessayer
              </Button>
            )}
            {onSecondaryAction && (
              <Button
                variant="outline"
                size="sm"
                onClick={onSecondaryAction}
              >
                {secondaryActionLabel || 'Retour'}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!loading && products.length === 0) {
    return (
      <EmptyState
        icon={<Search size={48} className="text-neutral-400" aria-hidden="true" />}
        title={title}
        description={description}
        actionLabel={actionLabel}
        onAction={onAction || (() => {})}
        secondaryActionLabel={secondaryActionLabel}
        onSecondaryAction={onSecondaryAction}
        className="py-16 sm:py-20"
      />
    )
  }

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDU PRINCIPAL                                              */
  /* ═══════════════════════════════════════════════════════════════ */

  return (
    <div className={cn('space-y-3 sm:space-y-4', className)}>
      {/* Indicateur offline */}
      {!isOnline && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center gap-2">
          <WifiOff size={16} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Mode hors ligne - affichage des produits en cache
          </p>
        </div>
      )}

      {/* Toolbar de filtres */}
      <FilterToolbar
        sortBy={sortBy}
        onSortChange={handleSortChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange || setInternalViewMode}
        showCompact={showCompact}
        onToggleCompact={() => setShowCompact(!showCompact)}
        filterMinPrice={filterMinPrice}
        onChangeMinPrice={setFilterMinPrice}
        filterMaxPrice={filterMaxPrice}
        onChangeMaxPrice={setFilterMaxPrice}
        showFilters={false}
        onToggleFilters={() => {}}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        showQuickSort={showQuickSort}
        showQuickFilters={showQuickFilters}
        adminMode={adminMode}
        selectedCount={selectedIds.size}
        onExportCSV={onExportCSV}
        onBulkActivate={handleBulkActivate}
        onBulkDeactivate={handleBulkDeactivate}
        searchValue={externalSearchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        categories={categories}
        selectedCategory={externalSelectedCategory}
        onCategoryChange={onCategoryChange}
        minRating={minRating}
        onMinRatingChange={onMinRatingChange}
        inStockOnly={inStockOnly}
        onInStockChange={onInStockChange}
        totalResults={totalResults}
        loading={loading}
        persistKey={persistKey}
        availableTags={availableTags}
        selectedTags={externalSelectedTags}
        onTagsChange={onTagsChange}
        filterMinDiscount={externalFilterMinDiscount}
        onChangeMinDiscount={onChangeMinDiscount}
        filterMaxDiscount={externalFilterMaxDiscount}
        onChangeMaxDiscount={onChangeMaxDiscount}
        filterDateFrom={externalFilterDateFrom}
        onChangeDateFrom={onChangeDateFrom}
        filterDateTo={externalFilterDateTo}
        onChangeDateTo={onChangeDateTo}
        filterVendor={externalFilterVendor}
        onChangeVendor={onChangeVendor}
        secondarySorts={externalSecondarySorts}
        onSecondarySortsChange={onSecondarySortsChange}
      />

      {/* Statistiques */}
      <div
        className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground px-1"
        aria-live="polite"
      >
        <span>
          {stats.total} produit{stats.total > 1 ? 's' : ''}
          {stats.inStock !== stats.total && (
            <span className="text-amber-600 ml-2">
              ({stats.inStock} en stock)
            </span>
          )}
        </span>
        <span className="hidden sm:inline">
          Prix moyen : ~{Math.round(stats.avgPrice).toLocaleString()} FC
        </span>
      </div>

      {/* Mode Carrousel */}
      {carouselRows ? (
        <>
          <div className="space-y-6 sm:space-y-8" role="list" aria-label="Carrousel des produits">
            {Array.from({ length: Math.min(visibleRows, totalRowsAvailable) }).map((_, rowIndex) => {
              // ✅ Calcul dynamique du nombre de produits par ligne
              const start = rowIndex * itemsPerRow
              const rowProducts = productsWithMeta.slice(start, start + itemsPerRow)

              return (
                <InfiniteCarouselRow
                  key={rowIndex}
                  products={rowProducts}
                  // ✅ NE PAS forcer visibleItems - laisser le responsive décider
                  maxProductsPerRow={itemsPerRow} // ✅ Limite à itemsPerRow produits max
                  autoPlayInterval={carouselAutoPlay}
                  compact={showCompact}
                  onQuickView={handleQuickView}
                  onAddToCart={handleAddToCart}
                  onToggleFavorite={handleToggleFavorite}
                  onCompare={handleCompare}
                  compareList={compareList}
                  favorites={favorites}
                  adminMode={adminMode}
                  selectedIds={selectedIds}
                  onSelectProduct={handleSelectProduct}
                />
              )
            })}
          </div>

          {showAddRowButton && visibleRows < totalRowsAvailable && (
            <div className="flex justify-center pt-4 sm:pt-6">
              <Button
                variant="outline-gold"
                onClick={addRow}
                className="gap-2 px-4 sm:px-6 py-2"
                leftIcon={<Plus size={18} aria-hidden="true" />}
                aria-label="Voir plus de produits"
              >
                Voir plus de produits
              </Button>
            </div>
          )}
        </>
      ) : (
        /* Mode Grille ou Liste */
        <AnimatePresence mode="wait">
          {viewMode === 'grid' ? (
            <motion.div
              key="grid"
              initial={shouldAnimate ? { opacity: 0, y: 10 } : { opacity: 1 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldAnimate ? { opacity: 0, y: -10 } : { opacity: 1 }}
              transition={{ duration: shouldAnimate ? 0.2 : 0 }}
              className={cn('grid gap-3 md:gap-4', gridColsClass)}
              role="list"
              aria-label="Grille des produits"
            >
              {productsWithMeta.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={shouldAnimate ? { opacity: 0, y: 20 } : { opacity: 1 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldAnimate ? { opacity: 0, scale: 0.95 } : { opacity: 1 }}
                  transition={{
                    duration: shouldAnimate ? 0.3 : 0,
                    delay: shouldAnimate ? index * 0.03 : 0
                  }}
                  onMouseEnter={() => setHoveredProductId(product.id)}
                  onMouseLeave={() => setHoveredProductId(null)}
                  className="relative group"
                  role="listitem"
                >
                  {/* Badges */}
                  <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                    {product.isNew && (
                      <Badge variant="accent" size="sm" className="text-[10px] sm:text-xs">
                        <Sparkles size={10} className="mr-0.5" aria-hidden="true" />
                        <span>Nouveau</span>
                      </Badge>
                    )}
                    {product.discount && product.discount > 0 && (
                      <Badge variant="danger" size="sm" className="font-bold text-[10px] sm:text-xs">
                        -{product.discount}%
                      </Badge>
                    )}
                    {product.isTopSeller && (
                      <Badge variant="gold" size="sm" className="text-[10px] sm:text-xs">
                        <Flame size={10} className="mr-0.5" aria-hidden="true" />
                        <span>Top vente</span>
                      </Badge>
                    )}
                    {product.hasLowStock && (
                      <Badge variant="warm" size="sm" className="text-[10px] sm:text-xs">
                        <Clock size={10} className="mr-0.5" aria-hidden="true" />
                        <span>Plus que {product.stock}</span>
                      </Badge>
                    )}
                  </div>

                  {/* Mode Admin - Checkbox */}
                  {adminMode && (
                    <div className="absolute top-2 right-2 z-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => handleSelectProduct(product.id)}
                        className="w-4 h-4 rounded border-neutral-300 text-gold-500 focus:ring-gold-400"
                        aria-label={`Sélectionner ${product.nom}`}
                      />
                    </div>
                  )}

                  {/* Actions rapides (non-admin) */}
                  {!adminMode && (
                    <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                      {onQuickView && (
                        <Tooltip content="Aperçu rapide">
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleQuickView(product.id)
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
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleAddToCart(product.id)
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
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleCompare(product.id)
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
                        <Tooltip content={favorites.has(product.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleToggleFavorite(product.id)
                            }}
                            className={cn(
                              'p-2 rounded-full shadow-md transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                              favorites.has(product.id)
                                ? 'bg-red-500 text-white'
                                : 'bg-white/95 dark:bg-neutral-800/95 hover:bg-red-100'
                            )}
                            aria-label={favorites.has(product.id) ? `Retirer ${product.nom} des favoris` : `Ajouter ${product.nom} aux favoris`}
                            aria-pressed={favorites.has(product.id)}
                          >
                            <Heart
                              size={16}
                              className={favorites.has(product.id) ? 'fill-current' : ''}
                              aria-hidden="true"
                            />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  )}

                  {/* Carte produit */}
                  <ProductCard
                    product={product}
                    variant="grid"
                    compact={showCompact}
                    disableAnimations={!shouldAnimate}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            /* Mode Liste */
            <motion.div
              key="list"
              initial={shouldAnimate ? { opacity: 0, y: 10 } : { opacity: 1 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldAnimate ? { opacity: 0, y: -10 } : { opacity: 1 }}
              transition={{ duration: shouldAnimate ? 0.2 : 0 }}
              className="flex flex-col gap-3 sm:gap-4"
              role="list"
              aria-label="Liste des produits"
            >
              {productsWithMeta.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={shouldAnimate ? { opacity: 0, x: -20 } : { opacity: 1 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldAnimate ? { opacity: 0, scale: 0.95 } : { opacity: 1 }}
                  transition={{
                    duration: shouldAnimate ? 0.3 : 0,
                    delay: shouldAnimate ? index * 0.03 : 0
                  }}
                  className="relative group"
                  role="listitem"
                >
                  {/* Mode Admin - Checkbox */}
                  {adminMode && (
                    <div className="absolute top-3 left-3 z-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => handleSelectProduct(product.id)}
                        className="w-4 h-4 rounded border-neutral-300 text-gold-500 focus:ring-gold-400"
                        aria-label={`Sélectionner ${product.nom}`}
                      />
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row bg-white dark:bg-midnight-800/60 rounded-2xl shadow-card hover:shadow-card-hover transition-all border border-neutral-100 dark:border-midnight-600 overflow-hidden">
                    {/* Image */}
                    <div className="relative w-full sm:w-40 md:w-48 h-48 sm:h-auto flex-shrink-0 bg-neutral-100 dark:bg-midnight-700">
                      <img
                        src={product.images?.[0] || '/placeholder.jpg'}
                        alt={product.nom}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute top-2 left-2 flex flex-col gap-1">
                        {product.isNew && (
                          <Badge variant="accent" size="sm" className="text-[10px]">
                            <Sparkles size={10} className="mr-0.5" aria-hidden="true" />
                            <span>Nouveau</span>
                          </Badge>
                        )}
                        {product.discount && product.discount > 0 && (
                          <Badge variant="danger" size="sm" className="font-bold text-[10px]">
                            -{product.discount}%
                          </Badge>
                        )}
                        {product.isTopSeller && (
                          <Badge variant="gold" size="sm" className="text-[10px]">
                            <Flame size={10} className="mr-0.5" aria-hidden="true" />
                            <span>Top vente</span>
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Contenu */}
                    <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-base sm:text-lg text-foreground hover:text-gold-600 transition-colors line-clamp-2">
                            {product.nom}
                          </h3>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {onQuickView && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  handleQuickView(product.id)
                                }}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-gold-500 hover:bg-gold-400/10 focus:outline-none focus:ring-2 focus:ring-gold-500"
                                aria-label={`Aperçu rapide de ${product.nom}`}
                              >
                                <Eye size={16} aria-hidden="true" />
                              </button>
                            )}
                            {onAddToCart && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  handleAddToCart(product.id)
                                }}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-gold-500 hover:bg-gold-400/10 focus:outline-none focus:ring-2 focus:ring-gold-500"
                                aria-label={`Ajouter ${product.nom} au panier`}
                              >
                                <ShoppingCart size={16} aria-hidden="true" />
                              </button>
                            )}
                            {onCompare && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  handleCompare(product.id)
                                }}
                                className={cn(
                                  'p-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                                  compareList.includes(product.id)
                                    ? 'text-gold-500 bg-gold-400/10'
                                    : 'text-neutral-400 hover:text-gold-500 hover:bg-gold-400/10'
                                )}
                                aria-label={compareList.includes(product.id) ? `Retirer ${product.nom} du comparateur` : `Comparer ${product.nom}`}
                              >
                                <BarChart3 size={16} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </div>

                        {showVendor && product.vendeur?.boutique_nom && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {product.vendeur.boutique_nom}
                          </p>
                        )}

                        {showCategory && product.categorie && (
                          <p className="text-xs text-gold-600 mt-1">
                            {product.categorie}
                          </p>
                        )}

                        {showRatings && product.rating && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex items-center text-amber-500 text-sm" aria-label={`Note: ${product.rating} sur 5`}>
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  size={14}
                                  className={i < Math.floor(product.rating!) ? 'fill-current' : 'text-neutral-300'}
                                  aria-hidden="true"
                                />
                              ))}
                              <span className="ml-1 font-medium">{product.rating}</span>
                              <span className="text-muted-foreground ml-1">
                                ({product.reviews_count || 0})
                              </span>
                            </div>
                          </div>
                        )}

                        {product.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {product.description}
                          </p>
                        )}

                        {showStockInfo && product.hasLowStock && (
                          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                            <AlertTriangle size={12} aria-hidden="true" />
                            Plus que {product.stock} en stock
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 sm:mt-4">
                        <div>
                          {product.discount && product.discount > 0 ? (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-lg sm:text-xl font-bold text-gold-600">
                                {Math.round(product.prix * (1 - product.discount / 100)).toLocaleString()} FC
                              </span>
                              <span className="text-xs sm:text-sm text-muted-foreground line-through">
                                {product.prix.toLocaleString()} FC
                              </span>
                              <Badge variant="danger" size="sm" className="text-[10px]">
                                -{product.discount}%
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-lg sm:text-xl font-bold text-foreground">
                              {product.prix.toLocaleString()} FC
                            </span>
                          )}
                          {product.prix_usd && (
                            <span className="text-xs text-muted-foreground ml-2">
                              ≈ {product.prix_usd.toFixed(2)} USD
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {onAddToCart && (
                            <Button
                              size="sm"
                              variant="gold"
                              onClick={(e) => {
                                e.preventDefault()
                                handleAddToCart(product.id)
                              }}
                              leftIcon={<ShoppingCart size={14} aria-hidden="true" />}
                              aria-label={`Ajouter ${product.nom} au panier`}
                            >
                              <span className="hidden sm:inline">Panier</span>
                              <span className="sm:hidden">+</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Infinite Scroll */}
      {infiniteScroll && onLoadMore && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          {loadingMore ? (
            <Loader2 className="animate-spin text-gold-500" size={32} aria-label="Chargement..." />
          ) : totalPages && currentPage && currentPage >= totalPages ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-500" aria-hidden="true" />
              Tous les produits sont affichés
            </p>
          ) : (
            <Button
              variant="outline-gold"
              onClick={onLoadMore}
              size="lg"
              aria-label="Charger plus de produits"
            >
              <Package size={16} className="mr-2" aria-hidden="true" />
              Charger plus de produits
            </Button>
          )}
        </div>
      )}

      {/* Pagination classique */}
      {!infiniteScroll && totalPages && currentPage && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline-gold"
            size="sm"
            onClick={() => onLoadMore?.()}
            disabled={currentPage >= totalPages || loadingMore}
            loading={loadingMore}
          >
            {currentPage >= totalPages ? 'Fin' : 'Voir plus'}
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} sur {totalPages}
          </span>
        </div>
      )}
    </div>
  )
})

ProductGrid.displayName = 'ProductGrid'

export default ProductGrid