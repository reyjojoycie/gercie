'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'
import {
  ArrowUpDown, Calendar, DollarSign, LayoutGrid, List, Maximize2, Minimize2,
  Package, RotateCcw, SlidersHorizontal, Star, TrendingUp, Zap, Download,
  Search, X, Check, Tag, Truck, ShieldCheck, Sparkles, Filter, MoreHorizontal,
  Clock, Heart, Eye, ThumbsUp, ChevronDown, ChevronUp, History, Bookmark,
  Layers, RefreshCw, AlertTriangle, Info, FileText, Columns, WifiOff,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface FilterToolbarProps {
  sortBy: string
  onSortChange: (sort: string) => void
  viewMode: 'grid' | 'list'
  onViewModeChange: (mode: 'grid' | 'list') => void
  showCompact: boolean
  onToggleCompact: () => void
  filterMinPrice: string
  onChangeMinPrice: (value: string) => void
  filterMaxPrice: string
  onChangeMaxPrice: (value: string) => void
  showFilters: boolean
  onToggleFilters: () => void
  hasActiveFilters: boolean
  onResetFilters: () => void

  // Extensions existantes
  showQuickSort?: boolean
  showQuickFilters?: boolean
  adminMode?: boolean
  selectedCount?: number
  onExportCSV?: (columns?: string[]) => void
  onBulkActivate?: () => void
  onBulkDeactivate?: () => void

  // Recherche
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string

  // Catégories
  categories?: { value: string; label: string }[]
  selectedCategory?: string
  onCategoryChange?: (value: string) => void

  // Note minimale
  minRating?: number
  onMinRatingChange?: (value: number) => void

  // Disponibilité
  inStockOnly?: boolean
  onInStockChange?: (checked: boolean) => void
  freeShippingOnly?: boolean
  onFreeShippingChange?: (checked: boolean) => void
  expressOnly?: boolean
  onExpressChange?: (checked: boolean) => void

  // Total résultats
  totalResults?: number
  loading?: boolean

  // Persistance
  persistKey?: string

  // Nouveautés enrichies
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
  
  // Nouvelles fonctionnalités
  /** Désactiver les animations */
  disableAnimations?: boolean
  /** Afficher les suggestions de recherche */
  showSearchSuggestions?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const SORT_OPTIONS = [
  { label: 'Défaut', value: 'default', icon: ArrowUpDown },
  { label: 'Prix ↑', value: 'price-asc', icon: DollarSign },
  { label: 'Prix ↓', value: 'price-desc', icon: DollarSign },
  { label: 'Nouveautés', value: 'newest', icon: Calendar },
  { label: 'Notes', value: 'rating', icon: Star },
  { label: 'Ventes', value: 'sales', icon: TrendingUp },
  { label: 'Nom A–Z', value: 'name-asc', icon: ArrowUpDown },
  { label: 'Nom Z–A', value: 'name-desc', icon: ArrowUpDown },
  { label: 'Remise', value: 'discount', icon: Zap },
  { label: 'Popularité', value: 'popularity', icon: Heart },
]

const DEBOUNCE_DELAY = 300 // ms
const PRICE_DEBOUNCE_DELAY = 500 // ms
const MAX_SECONDARY_SORTS = 3

const EXPORT_COLUMNS = [
  { key: 'nom', label: 'Nom' },
  { key: 'prix', label: 'Prix' },
  { key: 'stock', label: 'Stock' },
  { key: 'categorie', label: 'Catégorie' },
  { key: 'vendeur', label: 'Vendeur' },
  { key: 'date', label: 'Date' },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS PERSONNALISÉS                                            */
/* ═══════════════════════════════════════════════════════════════ */

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
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export const FilterToolbar = memo<FilterToolbarProps>(({
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  showCompact,
  onToggleCompact,
  filterMinPrice,
  onChangeMinPrice,
  filterMaxPrice,
  onChangeMaxPrice,
  showFilters,
  onToggleFilters,
  hasActiveFilters,
  onResetFilters,
  showQuickSort = true,
  showQuickFilters = true,
  adminMode = false,
  selectedCount = 0,
  onExportCSV,
  onBulkActivate,
  onBulkDeactivate,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Rechercher un produit...',
  categories,
  selectedCategory = '',
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
  loading = false,
  persistKey,
  availableTags,
  selectedTags = [],
  onTagsChange,
  filterMinDiscount,
  onChangeMinDiscount,
  filterMaxDiscount,
  onChangeMaxDiscount,
  filterDateFrom,
  onChangeDateFrom,
  filterDateTo,
  onChangeDateTo,
  filterVendor,
  onChangeVendor,
  secondarySorts = [],
  onSecondarySortsChange,
  disableAnimations = false,
  showSearchSuggestions = false,
}) => {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const isOnline = useOnlineStatus()

  // ✅ CORRECTION HYDRATATION : État pour s'assurer que le composant est monté côté client
  // avant de rendre des éléments dépendants du navigateur (comme l'indicateur hors ligne).
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // États locaux
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    EXPORT_COLUMNS.map(c => c.key)
  )

  // Refs
  const toolbarRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Should animate
  const shouldAnimate = !disableAnimations && !prefersReducedMotion

  // Debounced values pour éviter recalculs excessifs
  const debouncedMinPrice = useDebounce(filterMinPrice, PRICE_DEBOUNCE_DELAY)
  const debouncedMaxPrice = useDebounce(filterMaxPrice, PRICE_DEBOUNCE_DELAY)

  /* ═══════════════════════════════════════════════════════════════ */
  /*  PERSISTANCE                                                    */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!persistKey) return
    
    const saved = localStorage.getItem(persistKey)
    if (saved) {
      try {
        const state = JSON.parse(saved)
        if (state.sort) onSortChange(state.sort)
        if (state.view) onViewModeChange(state.view)
        if (state.compact !== undefined && state.compact !== showCompact) {
          onToggleCompact()
        }
        if (state.minPrice) onChangeMinPrice(state.minPrice)
        if (state.maxPrice) onChangeMaxPrice(state.maxPrice)
        if (state.category) onCategoryChange?.(state.category)
        if (state.tags) onTagsChange?.(state.tags)
        if (state.minDiscount) onChangeMinDiscount?.(state.minDiscount)
        if (state.maxDiscount) onChangeMaxDiscount?.(state.maxDiscount)
        if (state.dateFrom) onChangeDateFrom?.(state.dateFrom)
        if (state.dateTo) onChangeDateTo?.(state.dateTo)
        if (state.vendor) onChangeVendor?.(state.vendor)
        if (state.secondarySorts) onSecondarySortsChange?.(state.secondarySorts)
      } catch (err) {
        console.warn('Erreur lecture persistance filtres:', err)
      }
    }
  }, [persistKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveState = useCallback(() => {
    if (!persistKey) return
    
    const state = {
      sort: sortBy,
      view: viewMode,
      compact: showCompact,
      minPrice: filterMinPrice,
      maxPrice: filterMaxPrice,
      category: selectedCategory,
      tags: selectedTags,
      minDiscount: filterMinDiscount,
      maxDiscount: filterMaxDiscount,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      vendor: filterVendor,
      secondarySorts,
    }
    
    try {
      localStorage.setItem(persistKey, JSON.stringify(state))
    } catch (err) {
      console.warn('Erreur sauvegarde persistance filtres:', err)
    }
  }, [
    persistKey, sortBy, viewMode, showCompact, filterMinPrice, filterMaxPrice,
    selectedCategory, selectedTags, filterMinDiscount, filterMaxDiscount,
    filterDateFrom, filterDateTo, filterVendor, secondarySorts,
  ])

  useEffect(() => {
    saveState()
  }, [saveState])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  COMPTEUR DE FILTRES ACTIFS                                     */
  /* ═══════════════════════════════════════════════════════════════ */

  const activeFilterCount = useMemo(() => {
    let count = 0
    
    if (filterMinPrice) count++
    if (filterMaxPrice) count++
    if (selectedCategory) count++
    if (minRating) count++
    if (inStockOnly) count++
    if (freeShippingOnly) count++
    if (expressOnly) count++
    if (filterMinDiscount) count++
    if (filterMaxDiscount) count++
    if (filterDateFrom) count++
    if (filterDateTo) count++
    if (filterVendor) count++
    
    count += selectedTags.length
    count += secondarySorts.length
    
    return count
  }, [
    filterMinPrice, filterMaxPrice, selectedCategory, minRating,
    inStockOnly, freeShippingOnly, expressOnly, filterMinDiscount,
    filterMaxDiscount, filterDateFrom, filterDateTo, filterVendor,
    selectedTags, secondarySorts,
  ])

  const isFiltering = hasActiveFilters || activeFilterCount > 0

  /* ═══════════════════════════════════════════════════════════════ */
  /*  BADGES DE FILTRES ACTIFS                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  const filterBadges = useMemo(() => {
    const badges: { key: string; label: string; onRemove: () => void }[] = []
    
    if (filterMinPrice) {
      badges.push({
        key: 'minPrice',
        label: `≥ ${Number(filterMinPrice).toLocaleString()} FC`,
        onRemove: () => onChangeMinPrice('')
      })
    }
    
    if (filterMaxPrice) {
      badges.push({
        key: 'maxPrice',
        label: `≤ ${Number(filterMaxPrice).toLocaleString()} FC`,
        onRemove: () => onChangeMaxPrice('')
      })
    }
    
    if (selectedCategory && categories) {
      const cat = categories.find(c => c.value === selectedCategory)
      if (cat) {
        badges.push({
          key: 'cat',
          label: cat.label,
          onRemove: () => onCategoryChange?.('')
        })
      }
    }
    
    if (minRating) {
      badges.push({
        key: 'rating',
        label: `≥ ${minRating} ★`,
        onRemove: () => onMinRatingChange?.(0)
      })
    }
    
    if (inStockOnly) {
      badges.push({
        key: 'stock',
        label: 'En stock',
        onRemove: () => onInStockChange?.(false)
      })
    }
    
    if (freeShippingOnly) {
      badges.push({
        key: 'freeShip',
        label: 'Livraison gratuite',
        onRemove: () => onFreeShippingChange?.(false)
      })
    }
    
    if (expressOnly) {
      badges.push({
        key: 'express',
        label: 'Express',
        onRemove: () => onExpressChange?.(false)
      })
    }
    
    if (filterMinDiscount) {
      badges.push({
        key: 'minDisc',
        label: `Remise ≥ ${filterMinDiscount}%`,
        onRemove: () => onChangeMinDiscount?.('')
      })
    }
    
    if (filterMaxDiscount) {
      badges.push({
        key: 'maxDisc',
        label: `Remise ≤ ${filterMaxDiscount}%`,
        onRemove: () => onChangeMaxDiscount?.('')
      })
    }
    
    if (filterDateFrom) {
      badges.push({
        key: 'dateFrom',
        label: `Depuis ${filterDateFrom}`,
        onRemove: () => onChangeDateFrom?.('')
      })
    }
    
    if (filterDateTo) {
      badges.push({
        key: 'dateTo',
        label: `Jusqu'à ${filterDateTo}`,
        onRemove: () => onChangeDateTo?.('')
      })
    }
    
    if (filterVendor) {
      badges.push({
        key: 'vendor',
        label: `Vendeur: ${filterVendor}`,
        onRemove: () => onChangeVendor?.('')
      })
    }
    
    selectedTags.forEach(tag => {
      const info = availableTags?.find(t => t.value === tag)
      badges.push({
        key: `tag-${tag}`,
        label: info?.label ?? tag,
        onRemove: () => onTagsChange?.(selectedTags.filter(t => t !== tag))
      })
    })
    
    secondarySorts.forEach(s => {
      const info = SORT_OPTIONS.find(o => o.value === s)
      badges.push({
        key: `sort-${s}`,
        label: `Tri: ${info?.label ?? s}`,
        onRemove: () => onSecondarySortsChange?.(secondarySorts.filter(x => x !== s))
      })
    })
    
    return badges
  }, [
    filterMinPrice, filterMaxPrice, selectedCategory, categories, minRating,
    inStockOnly, freeShippingOnly, expressOnly, filterMinDiscount, filterMaxDiscount,
    filterDateFrom, filterDateTo, filterVendor, selectedTags, availableTags,
    secondarySorts, onChangeMinPrice, onChangeMaxPrice, onCategoryChange,
    onMinRatingChange, onInStockChange, onFreeShippingChange, onExpressChange,
    onChangeMinDiscount, onChangeMaxDiscount, onChangeDateFrom, onChangeDateTo,
    onChangeVendor, onTagsChange, onSecondarySortsChange,
  ])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  HANDLERS                                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  const handleExport = useCallback(() => {
    if (onExportCSV) {
      setShowExportModal(true)
    }
  }, [onExportCSV])

  const confirmExport = useCallback(() => {
    onExportCSV?.(selectedColumns)
    setShowExportModal(false)
  }, [onExportCSV, selectedColumns])

  const handleMinPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d+$/.test(value)) {
      onChangeMinPrice(value)
    }
  }, [onChangeMinPrice])

  const handleMaxPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d+$/.test(value)) {
      onChangeMaxPrice(value)
    }
  }, [onChangeMaxPrice])

  const handleMinDiscountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d+$/.test(value)) {
      onChangeMinDiscount?.(value)
    }
  }, [onChangeMinDiscount])

  const handleMaxDiscountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d+$/.test(value)) {
      onChangeMaxDiscount?.(value)
    }
  }, [onChangeMaxDiscount])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K pour focus recherche
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && onSearchChange) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSearchChange])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDU                                                          */
  /* ═══════════════════════════════════════════════════════════════ */

  return (
    <>
      <div
        ref={toolbarRef}
        className={cn(
          'flex flex-col gap-3 p-3 bg-card rounded-2xl border border-border shadow-sm',
          'transition-all duration-200'
        )}
        role="toolbar"
        aria-label="Outils de filtrage et tri"
      >
        {/* ✅ Indicateur offline : rendu uniquement après le montage client pour éviter le mismatch d'hydratation */}
        {isMounted && !isOnline && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 flex items-center gap-2">
            <WifiOff size={14} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <p className="text-xs text-blue-800 dark:text-blue-200">
              Mode hors ligne - certains filtres peuvent ne pas fonctionner
            </p>
          </div>
        )}

        {/* Rangée principale */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Partie gauche */}
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {/* Recherche */}
            {onSearchChange && (
              <div className="relative w-full sm:w-56">
                <Search 
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
                  size={16} 
                  aria-hidden="true"
                />
                <Input
                  ref={searchInputRef}
                  variant="glass"
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-9 pr-8 h-9 text-xs"
                  allowClear
                  onClear={() => onSearchChange('')}
                  aria-label="Rechercher un produit"
                />
                {loading && (
                  <RefreshCw 
                    size={14} 
                    className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gold-500"
                    aria-label="Chargement en cours"
                  />
                )}
              </div>
            )}

            {/* Tri rapide */}
            {showQuickSort && (
              <div 
                className="flex items-center rounded-full bg-neutral-100 dark:bg-midnight-700/40 p-1 border border-gold-400/20 overflow-x-auto"
                role="radiogroup"
                aria-label="Options de tri"
              >
                {SORT_OPTIONS.slice(0, 6).map((opt) => {
                  const IconComponent = opt.icon
                  return (
                    <Tooltip key={opt.value} content={opt.label}>
                      <button
                        onClick={() => onSortChange(opt.value)}
                        className={cn(
                          'px-2.5 py-1.5 text-xs font-medium rounded-full transition-all flex items-center gap-1 whitespace-nowrap',
                          'focus:outline-none focus:ring-2 focus:ring-gold-500',
                          sortBy === opt.value
                            ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                            : 'text-neutral-500 hover:text-gold-500'
                        )}
                        role="radio"
                        aria-checked={sortBy === opt.value}
                        aria-label={`Trier par ${opt.label}`}
                      >
                        <IconComponent size={14} aria-hidden="true" />
                        <span className="hidden sm:inline">{opt.label}</span>
                      </button>
                    </Tooltip>
                  )
                })}
                <Tooltip content="Plus de tris">
                  <button
                    onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
                    className="px-2 py-1.5 text-xs rounded-full text-neutral-500 hover:text-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
                    aria-label="Afficher plus d'options de tri"
                  >
                    <MoreHorizontal size={14} aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
            )}

            {/* Catégories */}
            {categories && onCategoryChange && (
              <select
                value={selectedCategory}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="bg-card border border-border rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label="Filtrer par catégorie"
              >
                <option value="">Toutes catégories</option>
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Partie droite */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Filtres rapides */}
            {showQuickFilters && (
              <div className="flex gap-1">
                {onInStockChange && (
                  <Tooltip content="En stock uniquement">
                    <button
                      onClick={() => onInStockChange(!inStockOnly)}
                      className={cn(
                        'px-2 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 border transition-all',
                        'focus:outline-none focus:ring-2 focus:ring-gold-500',
                        inStockOnly
                          ? 'bg-green-100 border-green-400 text-green-600'
                          : 'bg-neutral-100 dark:bg-midnight-700/40 border-transparent text-neutral-500 hover:border-gold-400'
                      )}
                      aria-pressed={inStockOnly}
                      aria-label="Filtrer les produits en stock"
                    >
                      <Package size={12} aria-hidden="true" />
                      <span className="hidden sm:inline">Stock</span>
                    </button>
                  </Tooltip>
                )}
                
                {onFreeShippingChange && (
                  <Tooltip content="Livraison gratuite">
                    <button
                      onClick={() => onFreeShippingChange(!freeShippingOnly)}
                      className={cn(
                        'px-2 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 border transition-all',
                        'focus:outline-none focus:ring-2 focus:ring-gold-500',
                        freeShippingOnly
                          ? 'bg-blue-100 border-blue-400 text-blue-600'
                          : 'bg-neutral-100 dark:bg-midnight-700/40 border-transparent text-neutral-500 hover:border-gold-400'
                      )}
                      aria-pressed={freeShippingOnly}
                      aria-label="Filtrer avec livraison gratuite"
                    >
                      <Truck size={12} aria-hidden="true" />
                      <span className="hidden sm:inline">Gratuit</span>
                    </button>
                  </Tooltip>
                )}
                
                {onExpressChange && (
                  <Tooltip content="Livraison express">
                    <button
                      onClick={() => onExpressChange(!expressOnly)}
                      className={cn(
                        'px-2 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 border transition-all',
                        'focus:outline-none focus:ring-2 focus:ring-gold-500',
                        expressOnly
                          ? 'bg-amber-100 border-amber-400 text-amber-600'
                          : 'bg-neutral-100 dark:bg-midnight-700/40 border-transparent text-neutral-500 hover:border-gold-400'
                      )}
                      aria-pressed={expressOnly}
                      aria-label="Filtrer avec livraison express"
                    >
                      <Zap size={12} aria-hidden="true" />
                      <span className="hidden sm:inline">Express</span>
                    </button>
                  </Tooltip>
                )}
                
                <Tooltip content="Filtres avancés">
                  <button
                    onClick={onToggleFilters}
                    className={cn(
                      'px-2 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 border transition-all',
                      'focus:outline-none focus:ring-2 focus:ring-gold-500',
                      showFilters
                        ? 'bg-gold-100 border-gold-400 text-gold-600'
                        : 'bg-neutral-100 dark:bg-midnight-700/40 border-transparent text-neutral-500 hover:border-gold-400'
                    )}
                    aria-pressed={showFilters}
                    aria-label="Afficher les filtres avancés"
                    aria-expanded={showFilters}
                  >
                    <SlidersHorizontal size={12} aria-hidden="true" />
                    {activeFilterCount > 0 && (
                      <span 
                        className="ml-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center"
                        aria-label={`${activeFilterCount} filtres actifs`}
                      >
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </Tooltip>
              </div>
            )}

            {/* Mode Admin */}
            {adminMode && (
              <div className="flex items-center gap-2">
                {onExportCSV && (
                  <Tooltip content="Exporter CSV">
                    <button
                      onClick={handleExport}
                      className="p-2 rounded-lg text-neutral-400 hover:text-gold-500 hover:bg-gold-400/10 transition focus:outline-none focus:ring-2 focus:ring-gold-500"
                      aria-label="Exporter les produits en CSV"
                    >
                      <Download size={16} aria-hidden="true" />
                    </button>
                  </Tooltip>
                )}
                
                {selectedCount > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-neutral-500">
                      {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
                    </span>
                    {onBulkActivate && (
                      <Button 
                        size="sm" 
                        variant="accent" 
                        onClick={onBulkActivate}
                        aria-label={`Activer ${selectedCount} produit${selectedCount > 1 ? 's' : ''}`}
                      >
                        Activer
                      </Button>
                    )}
                    {onBulkDeactivate && (
                      <Button 
                        size="sm" 
                        variant="danger" 
                        onClick={onBulkDeactivate}
                        aria-label={`Désactiver ${selectedCount} produit${selectedCount > 1 ? 's' : ''}`}
                      >
                        Désactiver
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Toggle compact */}
            <Tooltip content={showCompact ? 'Vue normale' : 'Vue compacte'}>
              <button
                onClick={onToggleCompact}
                className={cn(
                  'p-2 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                  showCompact
                    ? 'bg-gold-100 border-gold-400 text-gold-600'
                    : 'border-border text-neutral-400 hover:text-gold-500'
                )}
                aria-pressed={showCompact}
                aria-label={showCompact ? 'Passer en vue normale' : 'Passer en vue compacte'}
              >
                {showCompact ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
              </button>
            </Tooltip>

            {/* Toggle vue grille/liste */}
            <div 
              className="flex rounded-full bg-neutral-100 dark:bg-midnight-700/40 p-1 border border-gold-400/20"
              role="radiogroup"
              aria-label="Mode d'affichage"
            >
              <Tooltip content="Vue grille">
                <button
                  onClick={() => onViewModeChange('grid')}
                  className={cn(
                    'p-2 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gold-500',
                    viewMode === 'grid'
                      ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                      : 'text-neutral-400 hover:text-gold-500'
                  )}
                  role="radio"
                  aria-checked={viewMode === 'grid'}
                  aria-label="Afficher en grille"
                >
                  <LayoutGrid size={16} aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip content="Vue liste">
                <button
                  onClick={() => onViewModeChange('list')}
                  className={cn(
                    'p-2 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gold-500',
                    viewMode === 'list'
                      ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                      : 'text-neutral-400 hover:text-gold-500'
                  )}
                  role="radio"
                  aria-checked={viewMode === 'list'}
                  aria-label="Afficher en liste"
                >
                  <List size={16} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Badges de filtres actifs */}
        {filterBadges.length > 0 && (
          <div 
            className="flex flex-wrap gap-1"
            role="list"
            aria-label="Filtres actifs"
          >
            {filterBadges.map(badge => (
              <Badge
                key={badge.key}
                variant="gold"
                size="sm"
                className="cursor-pointer pl-2 pr-1.5 py-0.5 flex items-center gap-1 hover:bg-gold-200 dark:hover:bg-gold-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500"
                onClick={badge.onRemove}
                role="listitem"
                aria-label={`Retirer le filtre: ${badge.label}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    badge.onRemove()
                  }
                }}
              >
                <span>{badge.label}</span>
                <X size={12} aria-hidden="true" />
              </Badge>
            ))}
          </div>
        )}

        {/* Filtres avancés */}
        {showFilters && (
          <div 
            className={cn(
              "flex flex-wrap items-center gap-2 pt-2 border-t border-border/50",
              shouldAnimate && "animate-in slide-in-from-top-2"
            )}
            role="group"
            aria-label="Filtres avancés"
          >
            {/* Prix min/max */}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="Min FC"
                value={filterMinPrice}
                onChange={handleMinPriceChange}
                className="w-20 h-8 text-xs"
                min="0"
                aria-label="Prix minimum"
              />
              <span className="text-neutral-400" aria-hidden="true">–</span>
              <Input
                type="number"
                placeholder="Max FC"
                value={filterMaxPrice}
                onChange={handleMaxPriceChange}
                className="w-20 h-8 text-xs"
                min="0"
                aria-label="Prix maximum"
              />
            </div>

            {/* Remise */}
            {onChangeMinDiscount && (
              <div className="flex items-center gap-1">
                <Zap size={14} className="text-amber-500" aria-hidden="true" />
                <Input
                  type="number"
                  placeholder="Remise min %"
                  value={filterMinDiscount || ''}
                  onChange={handleMinDiscountChange}
                  className="w-20 h-8 text-xs"
                  min="0"
                  max="100"
                  aria-label="Remise minimum en pourcentage"
                />
                <span className="text-neutral-400" aria-hidden="true">–</span>
                <Input
                  type="number"
                  placeholder="Remise max %"
                  value={filterMaxDiscount || ''}
                  onChange={handleMaxDiscountChange}
                  className="w-20 h-8 text-xs"
                  min="0"
                  max="100"
                  aria-label="Remise maximum en pourcentage"
                />
              </div>
            )}

            {/* Date */}
            {(onChangeDateFrom || onChangeDateTo) && (
              <div className="flex items-center gap-1">
                <Calendar size={14} className="text-muted-foreground" aria-hidden="true" />
                <Input
                  type="date"
                  value={filterDateFrom || ''}
                  onChange={(e) => onChangeDateFrom?.(e.target.value)}
                  className="w-28 h-8 text-xs"
                  aria-label="Date de début"
                />
                <span className="text-neutral-400" aria-hidden="true">–</span>
                <Input
                  type="date"
                  value={filterDateTo || ''}
                  onChange={(e) => onChangeDateTo?.(e.target.value)}
                  className="w-28 h-8 text-xs"
                  aria-label="Date de fin"
                />
              </div>
            )}

            {/* Vendeur */}
            {onChangeVendor && (
              <Input
                placeholder="Vendeur"
                value={filterVendor || ''}
                onChange={(e) => onChangeVendor(e.target.value)}
                className="w-28 h-8 text-xs"
                leftIcon={<Tag size={14} className="text-muted-foreground" aria-hidden="true" />}
                allowClear
                onClear={() => onChangeVendor('')}
                aria-label="Filtrer par vendeur"
              />
            )}

            {/* Note minimale */}
            {onMinRatingChange && (
              <div className="flex items-center gap-1">
                <Star size={14} className="text-amber-500" aria-hidden="true" />
                <select
                  value={minRating ?? ''}
                  onChange={(e) => onMinRatingChange(Number(e.target.value) || 0)}
                  className="bg-card border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-gold-500"
                  aria-label="Note minimum"
                >
                  <option value="">Note min.</option>
                  <option value="4">4 ★ et +</option>
                  <option value="3">3 ★ et +</option>
                  <option value="2">2 ★ et +</option>
                </select>
              </div>
            )}

            {/* Tags */}
            {onTagsChange && availableTags && (
              <div className="flex items-center gap-1 flex-wrap">
                <Tag size={14} className="text-muted-foreground" aria-hidden="true" />
                {availableTags.map(tag => {
                  const isSelected = selectedTags.includes(tag.value)
                  return (
                    <button
                      key={tag.value}
                      onClick={() => {
                        const updated = isSelected
                          ? selectedTags.filter(t => t !== tag.value)
                          : [...selectedTags, tag.value]
                        onTagsChange(updated)
                      }}
                      className={cn(
                        'px-2 py-1 rounded-full text-xs border transition-all focus:outline-none focus:ring-2 focus:ring-gold-500',
                        isSelected
                          ? 'bg-gold-400/20 border-gold-400 text-gold-600'
                          : 'bg-neutral-100 dark:bg-midnight-700/40 border-transparent text-neutral-500 hover:border-gold-400'
                      )}
                      aria-pressed={isSelected}
                      aria-label={`${isSelected ? 'Retirer' : 'Ajouter'} le tag ${tag.label}`}
                    >
                      {tag.label}
                      {isSelected && <X size={12} className="ml-1 inline" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Tri secondaire */}
            {onSecondarySortsChange && (
              <div className="flex items-center gap-1">
                <Layers size={14} className="text-muted-foreground" aria-hidden="true" />
                {SORT_OPTIONS.filter(o => o.value !== sortBy && o.value !== 'default').map(opt => {
                  const active = secondarySorts.includes(opt.value)
                  const IconComponent = opt.icon
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        const updated = active
                          ? secondarySorts.filter(s => s !== opt.value)
                          : [...secondarySorts, opt.value].slice(0, MAX_SECONDARY_SORTS)
                        onSecondarySortsChange(updated)
                      }}
                      className={cn(
                        'px-2 py-1 rounded-full text-xs border transition-all flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-gold-500',
                        active
                          ? 'bg-blue-100 border-blue-400 text-blue-600'
                          : 'bg-neutral-100 dark:bg-midnight-700/40 border-transparent text-neutral-500 hover:border-blue-400'
                      )}
                      aria-pressed={active}
                      aria-label={`${active ? 'Retirer' : 'Ajouter'} le tri ${opt.label}`}
                      disabled={!active && secondarySorts.length >= MAX_SECONDARY_SORTS}
                    >
                      <IconComponent size={12} aria-hidden="true" />
                      <span className="hidden sm:inline">{opt.label}</span>
                      {active && <X size={12} aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Réinitialisation */}
            {isFiltering && (
              <button
                onClick={onResetFilters}
                className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium focus:outline-none focus:ring-2 focus:ring-red-500 rounded px-2 py-1"
                aria-label="Réinitialiser tous les filtres"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Tout effacer
              </button>
            )}

            {/* Total résultats */}
            {totalResults !== undefined && (
              <span 
                className="ml-auto text-xs text-muted-foreground"
                aria-live="polite"
                aria-atomic="true"
              >
                {totalResults} résultat{totalResults !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Modal export CSV */}
      <Modal 
        isOpen={showExportModal} 
        onClose={() => setShowExportModal(false)} 
        title="Exporter les produits" 
        size="sm" 
        accent="gold"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choisissez les colonnes à inclure dans le fichier CSV :
          </p>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_COLUMNS.map(col => (
              <label 
                key={col.key} 
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-100 dark:hover:bg-midnight-800 p-2 rounded transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(col.key)}
                  onChange={() => {
                    setSelectedColumns(prev =>
                      prev.includes(col.key)
                        ? prev.filter(c => c !== col.key)
                        : [...prev, col.key]
                    )
                  }}
                  className="rounded border-neutral-300 text-gold-500 focus:ring-gold-400"
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3 justify-end">
            <Button 
              variant="outline-gold" 
              size="sm" 
              onClick={() => setShowExportModal(false)}
            >
              Annuler
            </Button>
            <Button 
              variant="luxe" 
              size="sm" 
              onClick={confirmExport}
              aria-label="Exporter les produits sélectionnés"
            >
              <Download size={14} className="mr-1" aria-hidden="true" /> 
              Exporter
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
})

FilterToolbar.displayName = 'FilterToolbar'

export default FilterToolbar