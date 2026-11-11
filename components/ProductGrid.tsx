// components/ProductGrid.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useReducedMotion } from 'framer-motion'

import {
  AlertTriangle,
  ChevronDown,
  Download,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

import ProductCard, {
  normalizeProduct,
  type NormalizedProduct,
} from '@/components/ProductCard'

import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ViewMode = 'grid' | 'list'

export type SortBy =
  | 'relevant'
  | 'newest'
  | 'price-asc'
  | 'price-desc'
  | 'rating'
  | 'discount'
  | 'sales'
  | 'popular'

export type QuickFilter =
  | 'all'
  | 'new'
  | 'promo'
  | 'top'
  | 'low'
  | 'in'
  | 'out'

export interface ProductCategoryOption {
  id: string
  nom?: string
  name?: string
  slug?: string
}

export interface ProductGridEmptyState {
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
}

export interface ProductGridProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  products: any[]

  loading?: boolean
  error?: any
  onRetry?: () => void

  emptyState?: ProductGridEmptyState

  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void

  sortBy?: SortBy
  onSortChange?: (sort: SortBy) => void

  columns?: 2 | 3 | 4 | 5 | 6
  compact?: boolean
  onCompactChange?: (compact: boolean) => void

  animated?: boolean
  showQuickSort?: boolean
  showQuickFilters?: boolean
  showToolbar?: boolean
  showSearch?: boolean
  showPriceFilter?: boolean
  showViewToggle?: boolean
  showCompactToggle?: boolean

  onQuickView?: (productId: string) => void

  adminMode?: boolean
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  selectedCount?: number

  onExportCSV?: (ids?: string[]) => void
  onBulkActivate?: (ids: string[]) => void
  onBulkDeactivate?: (ids: string[]) => void

  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string

  categories?: ProductCategoryOption[]
  selectedCategory?: string
  onCategoryChange?: (value: string) => void

  minRating?: number
  onMinRatingChange?: (value: number) => void

  inStockOnly?: boolean
  onInStockChange?: (value: boolean) => void

  freeShippingOnly?: boolean
  onFreeShippingChange?: (value: boolean) => void

  expressOnly?: boolean
  onExpressChange?: (value: boolean) => void

  totalResults?: number
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  pageSize?: number

  persistKey?: string
  applyLocalFilters?: boolean

  showVendor?: boolean
  showCategory?: boolean
  showRatings?: boolean
  showStockInfo?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const sortOptions: Array<{ value: SortBy; label: string }> = [
  { value: 'relevant', label: 'Pertinence' },
  { value: 'newest', label: 'Nouveautés' },
  { value: 'price-asc', label: 'Prix croissant' },
  { value: 'price-desc', label: 'Prix décroissant' },
  { value: 'rating', label: 'Mieux notés' },
  { value: 'discount', label: 'Meilleures remises' },
  { value: 'sales', label: 'Meilleures ventes' },
  { value: 'popular', label: 'Populaires' },
]

const quickFilters: Array<{ value: QuickFilter; label: string }> = [
  { value: 'all', label: 'Tout' },
  { value: 'new', label: 'Nouveautés' },
  { value: 'promo', label: 'Promos' },
  { value: 'top', label: 'Top ventes' },
  { value: 'low', label: 'Stock faible' },
  { value: 'in', label: 'En stock' },
  { value: 'out', label: 'Rupture' },
]

const ratingOptions = [
  { value: 0, label: 'Toutes notes' },
  { value: 3, label: '3★ et +' },
  { value: 4, label: '4★ et +' },
  { value: 5, label: '5★' },
]

const columnsMap: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase()
}

function productMatchesSearch(product: NormalizedProduct, term: string): boolean {
  if (!term) return true

  const haystack = [
    product.nom,
    product.categorie,
    product.vendeur_label,
    ...(product.tags ?? []),
    ...(product.badges ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(term)
}

function getProductCategoryTokens(product: NormalizedProduct): string[] {
  return [
    product.categorie,
    product.category,
    product.categorie_id,
    product.category_id,
    product.categorie_slug,
    product.category_slug,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
}

function exportProductsCsv(
  products: NormalizedProduct[],
  filename = 'gercie-produits.csv'
): void {
  if (typeof window === 'undefined') return

  const headers = [
    'ID',
    'Nom',
    'Prix principal',
    'Devise',
    'Prix USD',
    'Prix CDF',
    'Stock',
    'Vendeur',
    'Catégorie',
    'Note',
    'Ventes',
  ]

  const escape = (value: unknown): string => {
    const str = String(value ?? '')
    return `"${str.replace(/"/g, '""')}"`
  }

  const rows = products.map((product) => [
    product.id,
    product.nom,
    product.primaryAmount,
    product.primaryCurrency,
    product.priceUsd,
    product.priceCdf,
    product.stock ?? '',
    product.vendeur_label ?? '',
    product.categorie ?? '',
    product.note_moyenne ?? '',
    product.total_ventes ?? '',
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(','))
    .join('\n')

  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI PARTS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function SelectField({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  options: Array<{ value: string | number; label: string }>
  className?: string
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1 text-xs', className)}>
      <span className="font-medium text-fg-subtle">{label}</span>

      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-9 w-full appearance-none rounded-control border border-line bg-surface px-3 pr-8 text-sm text-fg outline-none',
            'transition-colors duration-200',
            'hover:border-line-strong',
            'focus:border-accent focus:ring-2 focus:ring-accent/15'
          )}
        >
          {options.map((option) => (
            <option key={String(option.value)} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
      </div>
    </label>
  )
}

function TogglePill({
  active,
  onClick,
  children,
  icon,
  className,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:bg-muted hover:text-fg',
        className
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT GRID                                                   */
/* ═══════════════════════════════════════════════════════════════ */

export function ProductGrid({
  products,
  loading = false,
  error,
  onRetry,
  emptyState,
  viewMode: controlledViewMode,
  onViewModeChange,
  sortBy: controlledSortBy,
  onSortChange,
  columns = 4,
  compact: controlledCompact,
  onCompactChange,
  animated = true,
  showQuickSort = true,
  showQuickFilters = true,
  showToolbar = true,
  showSearch = true,
  showPriceFilter = false,
  showViewToggle = true,
  showCompactToggle = false,
  onQuickView,
  adminMode = false,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  selectedCount,
  onExportCSV,
  onBulkActivate,
  onBulkDeactivate,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Rechercher un produit…',
  categories = [],
  selectedCategory,
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
  loadingMore = false,
  hasMore,
  onLoadMore,
  pageSize = 12,
  persistKey,
  applyLocalFilters = true,
  showVendor = true,
  showCategory: showProductCategory = true,
  showRatings = true,
  showStockInfo = true,
  className,
  ...props
}: ProductGridProps) {
  const exchange = useExchangeRate() as any
  const rate = toNullableNumber(
    exchange?.rate ?? exchange?.usdRate ?? exchange?.data?.rate
  )

  const { prefersReducedMotion } = useAccessibilityPreferences()
  const framerReducedMotion = useReducedMotion()

  const prefersReduced =
    Boolean(prefersReducedMotion) || Boolean(framerReducedMotion)

  const shouldAnimate = animated && !prefersReduced

  const [mounted, setMounted] = useState(false)

  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('grid')
  const [internalSortBy, setInternalSortBy] = useState<SortBy>('relevant')
  const [internalCompact, setInternalCompact] = useState(false)

  const [internalSearch, setInternalSearch] = useState('')
  const [internalCategory, setInternalCategory] = useState('')
  const [internalMinRating, setInternalMinRating] = useState(0)
  const [internalInStock, setInternalInStock] = useState(false)
  const [internalFreeShipping, setInternalFreeShipping] = useState(false)
  const [internalExpress, setInternalExpress] = useState(false)

  const [internalQuickFilter, setInternalQuickFilter] =
    useState<QuickFilter>('all')

  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [debouncedMinPrice, setDebouncedMinPrice] = useState<number | null>(null)
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState<number | null>(null)

  const [visibleCount, setVisibleCount] = useState(pageSize)

  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(
    new Set()
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  MOUNT                                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setMounted(true)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  CONTROLLED / UNCONTROLLED VALUES                             */
  /* ───────────────────────────────────────────────────────────── */

  const currentViewMode = controlledViewMode ?? internalViewMode
  const currentSortBy = controlledSortBy ?? internalSortBy
  const currentCompact = controlledCompact ?? internalCompact

  const currentSearch = searchValue ?? internalSearch
  const currentCategory = selectedCategory ?? internalCategory
  const currentMinRating = minRating ?? internalMinRating
  const currentInStock = inStockOnly ?? internalInStock
  const currentFreeShipping = freeShippingOnly ?? internalFreeShipping
  const currentExpress = expressOnly ?? internalExpress
  const currentQuickFilter = internalQuickFilter

  const setSelectedIds = useCallback(
    (nextIds: string[]) => {
      if (typeof onSelectionChange === 'function') {
        onSelectionChange(nextIds)
        return
      }

      setInternalSelectedIds(new Set(nextIds))
    },
    [onSelectionChange]
  )

  const selectedIdsSet = useMemo(() => {
    if (controlledSelectedIds) return new Set(controlledSelectedIds)
    return internalSelectedIds
  }, [controlledSelectedIds, internalSelectedIds])

  const currentSelectedCount =
    selectedCount ?? selectedIdsSet.size

  /* ───────────────────────────────────────────────────────────── */
  /*  PERSISTENCE                                                  */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!mounted || !persistKey || typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(`product-grid:${persistKey}`)
      if (!raw) return

      const parsed = JSON.parse(raw)

      if (!controlledViewMode && parsed?.viewMode) {
        setInternalViewMode(parsed.viewMode)
      }

      if (!controlledSortBy && parsed?.sortBy) {
        setInternalSortBy(parsed.sortBy)
      }

      if (controlledCompact === undefined && typeof parsed?.compact === 'boolean') {
        setInternalCompact(parsed.compact)
      }
    } catch {
      // stockage indisponible
    }
  }, [
    controlledCompact,
    controlledSortBy,
    controlledViewMode,
    mounted,
    persistKey,
  ])

  useEffect(() => {
    if (!mounted || !persistKey || typeof window === 'undefined') return

    try {
      window.localStorage.setItem(
        `product-grid:${persistKey}`,
        JSON.stringify({
          viewMode: currentViewMode,
          sortBy: currentSortBy,
          compact: currentCompact,
        })
      )
    } catch {
      // stockage indisponible
    }
  }, [
    currentCompact,
    currentSortBy,
    currentViewMode,
    mounted,
    persistKey,
  ])

  /* ───────────────────────────────────────────────────────────── */
  /*  PRICE DEBOUNCE                                               */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMinPrice(
        minPrice.trim() ? toNullableNumber(minPrice) : null
      )

      setDebouncedMaxPrice(
        maxPrice.trim() ? toNullableNumber(maxPrice) : null
      )
    }, 250)

    return () => clearTimeout(timer)
  }, [maxPrice, minPrice])

  /* ───────────────────────────────────────────────────────────── */
  /*  NORMALIZATION                                                */
  /* ───────────────────────────────────────────────────────────── */

  const safeProducts = Array.isArray(products) ? products : []

  const normalizedProducts = useMemo(() => {
    return safeProducts
      .map((product) => normalizeProduct(product, rate))
      .filter(Boolean) as NormalizedProduct[]
  }, [rate, safeProducts])

  /* ───────────────────────────────────────────────────────────── */
  /*  FILTERING                                                    */
  /* ───────────────────────────────────────────────────────────── */

  const filteredProducts = useMemo(() => {
    if (!applyLocalFilters) return normalizedProducts

    const term = normalizeSearchValue(currentSearch)

    return normalizedProducts.filter((product) => {
      if (!productMatchesSearch(product, term)) return false

      if (currentCategory) {
        const tokens = getProductCategoryTokens(product)
        const needle = String(currentCategory).toLowerCase()

        if (!tokens.some((token) => token === needle || token.includes(needle))) {
          return false
        }
      }

      if (
        currentMinRating > 0 &&
        (product.note_moyenne ?? 0) < currentMinRating
      ) {
        return false
      }

      if (currentInStock && (product.rupture || product.stock === 0)) {
        return false
      }

      if (currentFreeShipping && !product.livraison_gratuite) {
        return false
      }

      if (currentExpress && !product.livraison_express) {
        return false
      }

      if (
        debouncedMinPrice !== null &&
        product.primaryAmount < debouncedMinPrice
      ) {
        return false
      }

      if (
        debouncedMaxPrice !== null &&
        product.primaryAmount > debouncedMaxPrice
      ) {
        return false
      }

      switch (currentQuickFilter) {
        case 'new':
          return product.is_new
        case 'promo':
          return product.discount > 0
        case 'top':
          return product.is_trending || product.total_ventes > 0
        case 'low':
          return product.stock_faible
        case 'in':
          return !product.rupture && (product.stock === null || product.stock > 0)
        case 'out':
          return product.rupture
        case 'all':
        default:
          return true
      }
    })
  }, [
    applyLocalFilters,
    currentCategory,
    currentExpress,
    currentFreeShipping,
    currentInStock,
    currentMinRating,
    currentQuickFilter,
    currentSearch,
    debouncedMaxPrice,
    debouncedMinPrice,
    normalizedProducts,
  ])

  /* ───────────────────────────────────────────────────────────── */
  /*  SORTING                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const sortedProducts = useMemo(() => {
    const arr = [...filteredProducts]

    switch (currentSortBy) {
      case 'price-asc':
        return arr.sort((a, b) => a.primaryAmount - b.primaryAmount)

      case 'price-desc':
        return arr.sort((a, b) => b.primaryAmount - a.primaryAmount)

      case 'newest':
        return arr.sort((a, b) =>
          String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
        )

      case 'rating':
        return arr.sort((a, b) => (b.note_moyenne ?? 0) - (a.note_moyenne ?? 0))

      case 'discount':
        return arr.sort((a, b) => b.discount - a.discount)

      case 'sales':
        return arr.sort((a, b) => b.total_ventes - a.total_ventes)

      case 'popular':
        return arr.sort((a, b) => {
          const scoreA =
            (a.total_ventes ?? 0) +
            (a.note_moyenne ?? 0) * 10 +
            (a.score ?? 0)

          const scoreB =
            (b.total_ventes ?? 0) +
            (b.note_moyenne ?? 0) * 10 +
            (b.score ?? 0)

          return scoreB - scoreA
        })

      case 'relevant':
      default:
        return arr
    }
  }, [currentSortBy, filteredProducts])

  /* ───────────────────────────────────────────────────────────── */
  /*  PAGINATION                                                   */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [
    currentCategory,
    currentExpress,
    currentFreeShipping,
    currentInStock,
    currentMinRating,
    currentQuickFilter,
    currentSearch,
    currentSortBy,
    debouncedMaxPrice,
    debouncedMinPrice,
    pageSize,
  ])

  const usesParentPagination = typeof onLoadMore === 'function'

  const pageProducts = useMemo(() => {
    if (usesParentPagination) return sortedProducts
    return sortedProducts.slice(0, visibleCount)
  }, [sortedProducts, usesParentPagination, visibleCount])

  const hasMoreInternal = usesParentPagination
    ? Boolean(hasMore)
    : visibleCount < sortedProducts.length

  const handleLoadMore = useCallback(() => {
    if (usesParentPagination) {
      onLoadMore?.()
      return
    }

    setVisibleCount((previous) => previous + pageSize)
  }, [onLoadMore, pageSize, usesParentPagination])

  /* ───────────────────────────────────────────────────────────── */
  /*  SELECTION                                                    */
  /* ───────────────────────────────────────────────────────────── */

  const toggleSelect = useCallback(
    (productId: string, isSelected: boolean) => {
      const next = new Set(selectedIdsSet)

      if (isSelected) {
        next.add(productId)
      } else {
        next.delete(productId)
      }

      setSelectedIds(Array.from(next))
    },
    [selectedIdsSet, setSelectedIds]
  )

  const clearSelection = useCallback(() => {
    setSelectedIds([])
  }, [setSelectedIds])

  const selectedIdsArray = useMemo(
    () => Array.from(selectedIdsSet),
    [selectedIdsSet]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  ACTIONS                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const handleQuickView = useCallback(
    (productId: string) => {
      onQuickView?.(productId)
    },
    [onQuickView]
  )

  const handleExportCSV = useCallback(() => {
    if (typeof onExportCSV === 'function') {
      onExportCSV(selectedIdsArray.length > 0 ? selectedIdsArray : undefined)
      return
    }

    exportProductsCsv(pageProducts)
  }, [onExportCSV, pageProducts, selectedIdsArray])

  const handleBulkActivate = useCallback(() => {
    onBulkActivate?.(selectedIdsArray)
  }, [onBulkActivate, selectedIdsArray])

  const handleBulkDeactivate = useCallback(() => {
    onBulkDeactivate?.(selectedIdsArray)
  }, [onBulkDeactivate, selectedIdsArray])

  const hasActiveFilters =
    Boolean(currentSearch.trim()) ||
    Boolean(currentCategory) ||
    currentMinRating > 0 ||
    currentInStock ||
    currentFreeShipping ||
    currentExpress ||
    currentQuickFilter !== 'all' ||
    debouncedMinPrice !== null ||
    debouncedMaxPrice !== null

  const resetAllFilters = useCallback(() => {
    if (typeof onSearchChange === 'function') onSearchChange('')
    else setInternalSearch('')

    if (typeof onCategoryChange === 'function') onCategoryChange('')
    else setInternalCategory('')

    if (typeof onMinRatingChange === 'function') onMinRatingChange(0)
    else setInternalMinRating(0)

    if (typeof onInStockChange === 'function') onInStockChange(false)
    else setInternalInStock(false)

    if (typeof onFreeShippingChange === 'function') onFreeShippingChange(false)
    else setInternalFreeShipping(false)

    if (typeof onExpressChange === 'function') onExpressChange(false)
    else setInternalExpress(false)

    setInternalQuickFilter('all')
    setMinPrice('')
    setMaxPrice('')
  }, [
    onCategoryChange,
    onExpressChange,
    onFreeShippingChange,
    onInStockChange,
    onMinRatingChange,
    onSearchChange,
  ])

  /* ───────────────────────────────────────────────────────────── */
  /*  GRID CLASSES                                                 */
  /* ───────────────────────────────────────────────────────────── */

  const gridClass =
    currentViewMode === 'list'
      ? 'grid-cols-1'
      : columnsMap[columns]

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER STATES                                                */
  /* ───────────────────────────────────────────────────────────── */

  if (loading && normalizedProducts.length === 0) {
    return (
      <div
        className={cn('space-y-4 sm:space-y-6', className)}
        role="status"
        aria-label="Chargement des produits"
        {...props}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="skeleton h-5 w-32 rounded-full" />
          <div className="skeleton h-8 w-24 rounded-pill" />
        </div>

        <div className={cn('grid gap-3 sm:gap-4 md:gap-6', gridClass)}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`product-skeleton-${index}`}
              className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card"
            >
              <div className="skeleton aspect-square w-full rounded-control" />
              <div className="skeleton h-3.5 w-3/4 rounded-full" />
              <div className="skeleton h-3 w-1/2 rounded-full" />

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="skeleton h-5 w-20 rounded-full" />
                <div className="skeleton h-8 w-20 rounded-control" />
              </div>
            </div>
          ))}
        </div>

        <span className="sr-only">Chargement…</span>
      </div>
    )
  }

  if (error && normalizedProducts.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-panel border border-danger/20 bg-danger-soft px-6 py-12 text-center',
          className
        )}
        role="alert"
        {...props}
      >
        <AlertTriangle
          size={28}
          className="text-danger"
          aria-hidden="true"
        />

        <p className="text-sm font-semibold text-danger">
          Erreur de chargement des produits
        </p>

        <p className="max-w-sm text-xs text-fg-muted">
          Une erreur est survenue lors de la récupération du catalogue.
          Veuillez réessayer.
        </p>

        {onRetry && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRetry}
            leftIcon={<RotateCcw size={14} aria-hidden="true" />}
          >
            Réessayer
          </Button>
        )}
      </div>
    )
  }

  const {
    title = 'Aucun produit trouvé',
    description = 'Essayez de modifier vos filtres ou explorez le catalogue complet.',
    actionLabel,
    onAction,
    secondaryActionLabel,
    onSecondaryAction,
  } = emptyState ?? {}

  return (
    <div className={cn('space-y-4 sm:space-y-6', className)} {...props}>
      {/* ========================================================
          TOOLBAR
         ======================================================== */}
      {showToolbar && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-fg-muted" aria-live="polite">
              {loading || loadingMore ? (
                <span className="inline-flex items-center gap-2">
                  <span className="skeleton h-3.5 w-28 rounded-full" />
                </span>
              ) : (
                <>
                  <span className="font-semibold text-fg">
                    {totalResults ?? sortedProducts.length}
                  </span>{' '}
                  produit{sortedProducts.length > 1 ? 's' : ''}
                  {hasActiveFilters ? ' filtré' : ''}
                  {sortedProducts.length > 1 ? 's' : ''}
                </>
              )}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {showQuickSort && (
                <SelectField
                  label="Trier"
                  value={currentSortBy}
                  onChange={(value) => {
                    const next = value as SortBy

                    if (typeof onSortChange === 'function') {
                      onSortChange(next)
                    } else {
                      setInternalSortBy(next)
                    }
                  }}
                  options={sortOptions}
                  className="w-40"
                />
              )}

              {showViewToggle && (
                <div
                  role="group"
                  aria-label="Mode d’affichage"
                  className="inline-flex items-center gap-0.5 rounded-pill border border-line bg-muted p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof onViewModeChange === 'function') {
                        onViewModeChange('grid')
                      } else {
                        setInternalViewMode('grid')
                      }
                    }}
                    aria-pressed={currentViewMode === 'grid'}
                    aria-label="Vue grille"
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-pill transition-colors duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      currentViewMode === 'grid'
                        ? 'bg-surface text-accent shadow-card'
                        : 'text-fg-subtle hover:text-fg'
                    )}
                  >
                    <LayoutGrid size={15} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (typeof onViewModeChange === 'function') {
                        onViewModeChange('list')
                      } else {
                        setInternalViewMode('list')
                      }
                    }}
                    aria-pressed={currentViewMode === 'list'}
                    aria-label="Vue liste"
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-pill transition-colors duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      currentViewMode === 'list'
                        ? 'bg-surface text-accent shadow-card'
                        : 'text-fg-subtle hover:text-fg'
                    )}
                  >
                    <List size={15} aria-hidden="true" />
                  </button>
                </div>
              )}

              {showCompactToggle && (
                <TogglePill
                  active={currentCompact}
                  onClick={() => {
                    const next = !currentCompact

                    if (typeof onCompactChange === 'function') {
                      onCompactChange(next)
                    } else {
                      setInternalCompact(next)
                    }
                  }}
                  icon={<SlidersHorizontal size={13} aria-hidden="true" />}
                >
                  Compact
                </TogglePill>
              )}

              {adminMode && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleExportCSV}
                  leftIcon={<Download size={14} aria-hidden="true" />}
                >
                  Exporter
                </Button>
              )}
            </div>
          </div>

          {/* Filtres */}
          {(showSearch ||
            categories.length > 0 ||
            showPriceFilter ||
            showQuickFilters) && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {showSearch && (
                <div className="relative min-w-0 sm:col-span-2 lg:col-span-2">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
                    aria-hidden="true"
                  />

                  <input
                    type="search"
                    value={currentSearch}
                    onChange={(event) => {
                      const value = event.target.value

                      if (typeof onSearchChange === 'function') {
                        onSearchChange(value)
                      } else {
                        setInternalSearch(value)
                      }
                    }}
                    placeholder={searchPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                    className={cn(
                      'h-9 w-full rounded-control border border-line bg-surface pl-9 pr-9 text-sm text-fg outline-none',
                      'placeholder:text-fg-subtle',
                      'transition-colors duration-200',
                      'hover:border-line-strong',
                      'focus:border-accent focus:ring-2 focus:ring-accent/15'
                    )}
                    aria-label="Rechercher dans les produits"
                  />

                  {currentSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof onSearchChange === 'function') {
                          onSearchChange('')
                        } else {
                          setInternalSearch('')
                        }
                      }}
                      className={cn(
                        'absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md',
                        'text-fg-subtle transition-colors duration-200',
                        'hover:bg-muted hover:text-fg',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                      )}
                      aria-label="Effacer la recherche"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}

              {categories.length > 0 && (
                <SelectField
                  label="Catégorie"
                  value={currentCategory}
                  onChange={(value) => {
                    if (typeof onCategoryChange === 'function') {
                      onCategoryChange(value)
                    } else {
                      setInternalCategory(value)
                    }
                  }}
                  options={[
                    { value: '', label: 'Toutes les catégories' },
                    ...categories.map((category) => ({
                      value: category.slug ?? category.id,
                      label: category.nom ?? category.name ?? category.id,
                    })),
                  ]}
                />
              )}

              <SelectField
                label="Note minimale"
                value={currentMinRating}
                onChange={(value) => {
                  const next = toNum(value, 0)

                  if (typeof onMinRatingChange === 'function') {
                    onMinRatingChange(next)
                  } else {
                    setInternalMinRating(next)
                  }
                }}
                options={ratingOptions}
              />

              {showPriceFilter && (
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs">
                    <span className="mb-1 block font-medium text-fg-subtle">
                      Prix min
                    </span>

                    <input
                      type="number"
                      min="0"
                      value={minPrice}
                      onChange={(event) => setMinPrice(event.target.value)}
                      placeholder="0"
                      className="h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                    />
                  </label>

                  <label className="min-w-0 flex-1 text-xs">
                    <span className="mb-1 block font-medium text-fg-subtle">
                      Prix max
                    </span>

                    <input
                      type="number"
                      min="0"
                      value={maxPrice}
                      onChange={(event) => setMaxPrice(event.target.value)}
                      placeholder="∞"
                      className="h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Filtres rapides */}
          {showQuickFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {quickFilters.map((filter) => (
                <TogglePill
                  key={filter.value}
                  active={currentQuickFilter === filter.value}
                  onClick={() => setInternalQuickFilter(filter.value)}
                >
                  {filter.label}
                </TogglePill>
              ))}

              <TogglePill
                active={currentInStock}
                onClick={() => {
                  const next = !currentInStock

                  if (typeof onInStockChange === 'function') {
                    onInStockChange(next)
                  } else {
                    setInternalInStock(next)
                  }
                }}
              >
                En stock
              </TogglePill>

              <TogglePill
                active={currentFreeShipping}
                onClick={() => {
                  const next = !currentFreeShipping

                  if (typeof onFreeShippingChange === 'function') {
                    onFreeShippingChange(next)
                  } else {
                    setInternalFreeShipping(next)
                  }
                }}
              >
                Livraison offerte
              </TogglePill>

              <TogglePill
                active={currentExpress}
                onClick={() => {
                  const next = !currentExpress

                  if (typeof onExpressChange === 'function') {
                    onExpressChange(next)
                  } else {
                    setInternalExpress(next)
                  }
                }}
              >
                Express
              </TogglePill>

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={resetAllFilters}
                  leftIcon={<RotateCcw size={12} aria-hidden="true" />}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          )}

          {/* Admin bulk */}
          {adminMode && currentSelectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-accent/20 bg-accent-soft px-3 py-2 text-sm text-accent">
              <span className="font-semibold">
                {currentSelectedCount} sélectionné
                {currentSelectedCount > 1 ? 's' : ''}
              </span>

              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={clearSelection}
              >
                Effacer
              </Button>

              <Button
                type="button"
                variant="primary"
                size="xs"
                onClick={handleBulkActivate}
              >
                Activer
              </Button>

              <Button
                type="button"
                variant="danger"
                size="xs"
                onClick={handleBulkDeactivate}
              >
                Désactiver
              </Button>

              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleExportCSV}
                leftIcon={<Download size={12} aria-hidden="true" />}
              >
                Exporter
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          GRID
         ======================================================== */}
      {sortedProducts.length === 0 ? (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line bg-muted/40 px-6 py-14 text-center',
            className
          )}
        >
          <p className="text-base font-semibold text-fg">{title}</p>
          <p className="max-w-sm text-sm text-fg-muted">{description}</p>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {actionLabel && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={onAction ?? resetAllFilters}
              >
                {actionLabel}
              </Button>
            )}

            {secondaryActionLabel && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onSecondaryAction}
              >
                {secondaryActionLabel}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={cn('grid gap-3 sm:gap-4 md:gap-6', gridClass)}
          role="list"
          aria-busy={loading || loadingMore}
        >
          {pageProducts.map((product) => (
            <ProductCard
              key={product.id}
              role="listitem"
              product={product}
              variant={
                currentViewMode === 'list'
                  ? 'horizontal'
                  : currentCompact
                    ? 'compact'
                    : 'default'
              }
              compact={currentCompact}
              animated={shouldAnimate}
              showVendor={showVendor}
              showCategory={showProductCategory}
              showRatings={showRatings}
              showStockInfo={showStockInfo}
              onQuickView={handleQuickView}
              adminMode={adminMode}
              selectable={adminMode}
              selected={selectedIdsSet.has(product.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* ========================================================
          LOAD MORE
         ======================================================== */}
      {hasMoreInternal && sortedProducts.length > 0 && (
        <div className="flex items-center justify-center pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleLoadMore}
            loading={loadingMore}
            disabled={loadingMore}
          >
            Voir plus de produits
          </Button>
        </div>
      )}
    </div>
  )
}

export default ProductGrid