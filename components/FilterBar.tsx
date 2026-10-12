// components/FilterBar.tsx
'use client'

import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'
import {
  SlidersHorizontal,
  X,
  ArrowUpDown,
  Sparkles,
  Search,
  Filter,
  Grid3X3,
  List,
  RotateCcw,
  ChevronDown,
  DollarSign,
  Tag,
  Star,
  WifiOff,
  TrendingUp,
  Percent,
  Calendar,
  Zap,
} from 'lucide-react'
import { categoryTree, mainCategories, getTypes, getDetails } from '@/lib/categories'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface FilterBarProps {
  // Catégories
  selectedMainCategory: string
  setSelectedMainCategory: (value: string) => void
  selectedSubCategory: string
  setSelectedSubCategory: (value: string) => void
  selectedType: string
  setSelectedType: (value: string) => void
  selectedDetail: string
  setSelectedDetail: (value: string) => void

  // Prix
  minPrice: string
  setMinPrice: (value: string) => void
  maxPrice: string
  setMaxPrice: (value: string) => void

  // Tri
  sortBy: string
  setSortBy: (value: string) => void
  sortOrder: 'asc' | 'desc'
  setSortOrder: (value: 'asc' | 'desc') => void

  totalProducts?: number
  onResetFilters: () => void
  className?: string

  // Nouvelles props
  searchQuery?: string
  onSearchChange?: (value: string) => void
  placeholderSearch?: string
  viewMode?: 'grid' | 'list'
  onViewModeChange?: (mode: 'grid' | 'list') => void
  showViewToggle?: boolean
  isFetching?: boolean
  mobileFilterOpen?: boolean
  onMobileFilterOpenChange?: (open: boolean) => void
  priceRange?: { min: number; max: number }
  
  // Nouvelles fonctionnalités
  /** Afficher les suggestions de recherche */
  showSearchSuggestions?: boolean
  /** Callback pour les suggestions */
  onSearchSuggestion?: (suggestion: string) => void
  /** Afficher le compteur de résultats en temps réel */
  showRealTimeCount?: boolean
  /** Désactiver les animations */
  disableAnimations?: boolean
  /** Afficher les filtres rapides (badges cliquables) */
  showQuickFilters?: boolean
  /** Filtres rapides prédéfinis */
  quickFilters?: Array<{
    label: string
    icon?: React.ReactNode
    onClick: () => void
    active?: boolean
  }>
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEBOUNCE_DELAY = 300 // ms
const PRICE_DEBOUNCE_DELAY = 500 // ms
const SEARCH_SUGGESTIONS_LIMIT = 5
const MOBILE_BREAKPOINT = 768

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

/**
 * Hook pour détecter la taille de l'écran
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    setMatches(media.matches)

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export const FilterBar = memo<FilterBarProps>(({
  // Catégories
  selectedMainCategory,
  setSelectedMainCategory,
  selectedSubCategory,
  setSelectedSubCategory,
  selectedType,
  setSelectedType,
  selectedDetail,
  setSelectedDetail,
  // Prix
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  // Tri
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  // Autres
  totalProducts = 0,
  onResetFilters,
  className,
  // Nouvelles props
  searchQuery = '',
  onSearchChange,
  placeholderSearch = 'Rechercher un produit...',
  viewMode,
  onViewModeChange,
  showViewToggle = false,
  isFetching = false,
  mobileFilterOpen: controlledMobileOpen,
  onMobileFilterOpenChange,
  priceRange,
  showSearchSuggestions = false,
  onSearchSuggestion,
  showRealTimeCount = true,
  disableAnimations = false,
  showQuickFilters = false,
  quickFilters = [],
}) => {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const isOnline = useOnlineStatus()
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`)

  // États locaux
  const [internalMobileOpen, setInternalMobileOpen] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([])
  
  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Contrôled vs uncontrolled mobile open
  const mobileOpen = controlledMobileOpen ?? internalMobileOpen
  const setMobileOpen = onMobileFilterOpenChange ?? setInternalMobileOpen

  // Debounced values
  const debouncedSearch = useDebounce(searchQuery, DEBOUNCE_DELAY)
  const debouncedMinPrice = useDebounce(minPrice, PRICE_DEBOUNCE_DELAY)
  const debouncedMaxPrice = useDebounce(maxPrice, PRICE_DEBOUNCE_DELAY)

  // Should animate
  const shouldAnimate = !disableAnimations && !prefersReducedMotion

  /* ═══════════════════════════════════════════════════════════════ */
  /*  FILTRES ACTIFS                                               */
  /* ═══════════════════════════════════════════════════════════════ */

  const hasActiveFilters = useMemo(() => {
    return !!(
      selectedMainCategory ||
      selectedSubCategory ||
      selectedType ||
      selectedDetail ||
      minPrice ||
      maxPrice ||
      searchQuery
    )
  }, [selectedMainCategory, selectedSubCategory, selectedType, selectedDetail, minPrice, maxPrice, searchQuery])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (selectedMainCategory) count++
    if (selectedSubCategory) count++
    if (selectedType) count++
    if (selectedDetail) count++
    if (minPrice) count++
    if (maxPrice) count++
    if (searchQuery) count++
    return count
  }, [selectedMainCategory, selectedSubCategory, selectedType, selectedDetail, minPrice, maxPrice, searchQuery])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  LABELS ET LISTES DÉRIVÉES                                    */
  /* ═══════════════════════════════════════════════════════════════ */

  const getSortLabel = useCallback(() => {
    if (sortBy === 'prix') return sortOrder === 'asc' ? 'Prix croissant' : 'Prix décroissant'
    if (sortBy === 'random') return 'Aléatoire'
    if (sortBy === 'relevance') return 'Pertinence'
    if (sortBy === 'total_ventes') return 'Populaires'
    return 'Plus récents'
  }, [sortBy, sortOrder])

  const getSortIcon = useCallback(() => {
    if (sortBy === 'prix') return <DollarSign size={14} aria-hidden="true" />
    if (sortBy === 'total_ventes') return <TrendingUp size={14} aria-hidden="true" />
    if (sortBy === 'created_at') return <Calendar size={14} aria-hidden="true" />
    return <ArrowUpDown size={14} aria-hidden="true" />
  }, [sortBy])

  const subCategories = useMemo(() => {
    if (!selectedMainCategory) return []
    return categoryTree.find(c => c.name === selectedMainCategory)?.children?.map(s => s.name) || []
  }, [selectedMainCategory])

  const types = useMemo(() => {
    if (!selectedSubCategory || !selectedMainCategory) return []
    return getTypes(selectedMainCategory, selectedSubCategory)
  }, [selectedMainCategory, selectedSubCategory])

  const details = useMemo(() => {
    if (!selectedType || !selectedMainCategory || !selectedSubCategory) return []
    return getDetails(selectedMainCategory, selectedSubCategory, selectedType)
  }, [selectedMainCategory, selectedSubCategory, selectedType])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  HANDLERS                                                     */
  /* ═══════════════════════════════════════════════════════════════ */

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    onSearchChange?.(value)
    
    // Générer des suggestions basiques
    if (showSearchSuggestions && value.length > 2) {
      const suggestions = [
        `${value}`,
        `${value} pas cher`,
        `${value} promo`,
        `${value} nouveau`,
      ].slice(0, SEARCH_SUGGESTIONS_LIMIT)
      setSearchSuggestions(suggestions)
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
    }
  }, [onSearchChange, showSearchSuggestions])

  const clearSearch = useCallback(() => {
    onSearchChange?.('')
    setShowSuggestions(false)
  }, [onSearchChange])

  const handleSuggestionClick = useCallback((suggestion: string) => {
    onSearchChange?.(suggestion)
    setShowSuggestions(false)
    onSearchSuggestion?.(suggestion)
  }, [onSearchChange, onSearchSuggestion])

  const handleMinPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Validation : seulement nombres positifs
    if (value === '' || /^\d+$/.test(value)) {
      setMinPrice(value)
    }
  }, [setMinPrice])

  const handleMaxPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d+$/.test(value)) {
      setMaxPrice(value)
    }
  }, [setMaxPrice])

  const handleMainCategoryChange = useCallback((value: string) => {
    setSelectedMainCategory(value)
    setSelectedSubCategory('')
    setSelectedType('')
    setSelectedDetail('')
  }, [setSelectedMainCategory, setSelectedSubCategory, setSelectedType, setSelectedDetail])

  const handleSubCategoryChange = useCallback((value: string) => {
    setSelectedSubCategory(value)
    setSelectedType('')
    setSelectedDetail('')
  }, [setSelectedSubCategory, setSelectedType, setSelectedDetail])

  const handleTypeChange = useCallback((value: string) => {
    setSelectedType(value)
    setSelectedDetail('')
  }, [setSelectedType, setSelectedDetail])

  const handleSortChange = useCallback((newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy)
    setSortOrder(newSortOrder)
  }, [setSortBy, setSortOrder])

  // Fermer les suggestions au clic extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fermer le drawer mobile au resize
  useEffect(() => {
    if (!isMobile && mobileOpen) {
      setMobileOpen(false)
    }
  }, [isMobile, mobileOpen, setMobileOpen])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K pour focus recherche
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // Escape pour fermer mobile drawer
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen, setMobileOpen])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDER HELPERS                                               */
  /* ═══════════════════════════════════════════════════════════════ */

  const renderDropdownSelector = useCallback((
    label: string,
    value: string,
    options: string[],
    onChange: (val: string) => void,
    disabled?: boolean
  ) => (
    <Dropdown
      trigger={
        <Button 
          variant="outline-gold" 
          size="sm" 
          className="min-w-[100px] justify-between"
          disabled={disabled}
          aria-label={`${label}: ${value || 'Toutes'}`}
        >
          <span className="truncate max-w-[90px]">{value || label}</span>
          <ChevronDown size={14} className="ml-1 opacity-70" aria-hidden="true" />
        </Button>
      }
      align="left"
      className="min-w-[160px]"
    >
      <DropdownItem onClick={() => onChange('')}>
        Toutes
      </DropdownItem>
      {options.map(opt => (
        <DropdownItem 
          key={opt} 
          onClick={() => onChange(opt)}
          aria-selected={value === opt}
        >
          {opt}
        </DropdownItem>
      ))}
    </Dropdown>
  ), [])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  MOBILE FILTER DRAWER                                         */
  /* ═══════════════════════════════════════════════════════════════ */

  const MobileFilterDrawer = useCallback(() => (
    <AnimatePresence>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Filtres">
          {/* Overlay */}
          <motion.div
            initial={shouldAnimate ? { opacity: 0 } : { opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={shouldAnimate ? { opacity: 0 } : { opacity: 1 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          
          {/* Drawer */}
          <motion.div
            initial={shouldAnimate ? { x: '-100%' } : { x: 0 }}
            animate={{ x: 0 }}
            exit={shouldAnimate ? { x: '-100%' } : { x: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-midnight-900 shadow-2xl p-4 sm:p-6 overflow-y-auto z-10"
            role="document"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg text-foreground">Filtres</h3>
              <button 
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-midnight-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label="Fermer les filtres"
              >
                <X size={20} className="text-muted-foreground" aria-hidden="true" />
              </button>
            </div>

            {/* Indicateur offline */}
            {!isOnline && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
                <WifiOff size={16} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <p className="text-xs text-blue-800 dark:text-blue-200">Mode hors ligne</p>
              </div>
            )}

            <div className="space-y-4">
              {/* Recherche */}
              {onSearchChange && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Rechercher</label>
                  <Input
                    ref={searchInputRef}
                    leftIcon={<Search size={16} className="text-muted-foreground" aria-hidden="true" />}
                    placeholder={placeholderSearch}
                    value={searchQuery}
                    onChange={handleSearchChange}
                    allowClear
                    onClear={clearSearch}
                    variant="glass"
                    aria-label="Rechercher un produit"
                  />
                </div>
              )}

              {/* Catégorie principale */}
              <div>
                <label className="text-sm font-medium mb-2 block">Catégorie</label>
                <Dropdown
                  trigger={
                    <Button variant="outline-gold" size="sm" fullWidth className="justify-between">
                      {selectedMainCategory || 'Toutes'}
                      <ChevronDown size={14} aria-hidden="true" />
                    </Button>
                  }
                  align="left"
                >
                  <DropdownItem onClick={() => handleMainCategoryChange('')}>Toutes</DropdownItem>
                  {mainCategories.map(cat => (
                    <DropdownItem 
                      key={cat} 
                      onClick={() => handleMainCategoryChange(cat)}
                      aria-selected={selectedMainCategory === cat}
                    >
                      {cat}
                    </DropdownItem>
                  ))}
                </Dropdown>
              </div>

              {/* Sous-catégories */}
              {subCategories.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Sous-catégorie</label>
                  {renderDropdownSelector('Sous-cat.', selectedSubCategory, subCategories, handleSubCategoryChange)}
                </div>
              )}

              {/* Types */}
              {types.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Type</label>
                  {renderDropdownSelector('Type', selectedType, types, handleTypeChange)}
                </div>
              )}

              {/* Détails */}
              {details.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Détail</label>
                  {renderDropdownSelector('Détail', selectedDetail, details, setSelectedDetail)}
                </div>
              )}

              {/* Prix */}
              <div>
                <label className="text-sm font-medium mb-2 block">Prix (FC)</label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={minPrice}
                    onChange={handleMinPriceChange}
                    size="sm"
                    className="w-24"
                    min="0"
                    aria-label="Prix minimum"
                  />
                  <span className="text-muted-foreground" aria-hidden="true">–</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={maxPrice}
                    onChange={handleMaxPriceChange}
                    size="sm"
                    className="w-24"
                    min="0"
                    aria-label="Prix maximum"
                  />
                </div>
                {priceRange && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Disponible: {priceRange.min.toLocaleString()} – {priceRange.max.toLocaleString()} FC
                  </p>
                )}
              </div>

              {/* Tri */}
              <div>
                <label className="text-sm font-medium mb-2 block">Trier par</label>
                <Dropdown
                  trigger={
                    <Button variant="outline-gold" size="sm" fullWidth className="justify-between">
                      {getSortLabel()}
                      <ChevronDown size={14} aria-hidden="true" />
                    </Button>
                  }
                  align="left"
                >
                  <DropdownItem onClick={() => handleSortChange('created_at', 'desc')}>
                    <Calendar size={14} className="mr-2" aria-hidden="true" />
                    Plus récents
                  </DropdownItem>
                  <DropdownItem onClick={() => handleSortChange('prix', 'asc')}>
                    <DollarSign size={14} className="mr-2" aria-hidden="true" />
                    Prix croissant
                  </DropdownItem>
                  <DropdownItem onClick={() => handleSortChange('prix', 'desc')}>
                    <DollarSign size={14} className="mr-2" aria-hidden="true" />
                    Prix décroissant
                  </DropdownItem>
                  <DropdownItem onClick={() => handleSortChange('total_ventes', 'desc')}>
                    <TrendingUp size={14} className="mr-2" aria-hidden="true" />
                    Populaires
                  </DropdownItem>
                  <DropdownItem onClick={() => handleSortChange('random', 'asc')}>
                    <Zap size={14} className="mr-2" aria-hidden="true" />
                    Aléatoire
                  </DropdownItem>
                </Dropdown>
              </div>

              {/* Réinitialiser */}
              <Button 
                variant="ghost" 
                size="sm" 
                fullWidth 
                onClick={() => {
                  onResetFilters()
                  setMobileOpen(false)
                }}
                className="mt-4"
              >
                <RotateCcw size={14} className="mr-2" aria-hidden="true" />
                Réinitialiser les filtres
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  ), [
    mobileOpen,
    setMobileOpen,
    shouldAnimate,
    isOnline,
    onSearchChange,
    placeholderSearch,
    searchQuery,
    handleSearchChange,
    clearSearch,
    selectedMainCategory,
    handleMainCategoryChange,
    subCategories,
    selectedSubCategory,
    handleSubCategoryChange,
    types,
    selectedType,
    handleTypeChange,
    details,
    selectedDetail,
    setSelectedDetail,
    minPrice,
    handleMinPriceChange,
    maxPrice,
    handleMaxPriceChange,
    priceRange,
    getSortLabel,
    handleSortChange,
    onResetFilters,
    renderDropdownSelector,
  ])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDU PRINCIPAL                                              */
  /* ═══════════════════════════════════════════════════════════════ */

  return (
    <section
      className={cn(
        'sticky top-16 z-30 backdrop-blur-xl bg-white/70 dark:bg-midnight-900/70 border-b border-gold-400/20 shadow-soft',
        className
      )}
      aria-label="Barre de filtres"
    >
      <Container className="py-3">
        {/* Rangée principale */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {/* Bouton filtre mobile */}
          <div className="md:hidden">
            <Button
              variant="outline-gold"
              size="sm"
              leftIcon={<Filter size={16} aria-hidden="true" />}
              onClick={() => setMobileOpen(true)}
              aria-label={`Ouvrir les filtres${activeFilterCount > 0 ? ` (${activeFilterCount} actifs)` : ''}`}
              aria-expanded={mobileOpen}
            >
              Filtres
              {activeFilterCount > 0 && (
                <Badge variant="gold" size="sm" className="ml-1 -mr-1 px-1.5 py-0">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </div>

          {/* Recherche (desktop) */}
          {onSearchChange && (
            <div className="hidden md:block flex-1 max-w-xs relative">
              <Input
                ref={searchInputRef}
                leftIcon={<Search size={16} className="text-muted-foreground" aria-hidden="true" />}
                placeholder={placeholderSearch}
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => searchSuggestions.length > 0 && setShowSuggestions(true)}
                allowClear
                onClear={clearSearch}
                variant="glass"
                size="sm"
                aria-label="Rechercher un produit"
                aria-autocomplete={showSearchSuggestions ? 'list' : undefined}
                aria-controls={showSuggestions ? 'search-suggestions' : undefined}
              />
              
              {/* Suggestions de recherche */}
              <AnimatePresence>
                {showSuggestions && searchSuggestions.length > 0 && (
                  <motion.div
                    ref={suggestionsRef}
                    id="search-suggestions"
                    initial={shouldAnimate ? { opacity: 0, y: -10 } : { opacity: 1 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldAnimate ? { opacity: 0, y: -10 } : { opacity: 1 }}
                    className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-midnight-800 rounded-lg shadow-lg border border-border z-50 overflow-hidden"
                    role="listbox"
                  >
                    {searchSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-midnight-700 transition-colors focus:outline-none focus:bg-neutral-100 dark:focus:bg-midnight-700"
                        role="option"
                      >
                        <Search size={14} className="inline mr-2 text-muted-foreground" aria-hidden="true" />
                        {suggestion}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Catégories (desktop) */}
          <div className="hidden md:flex items-center gap-2">
            <Dropdown
              trigger={
                <Button 
                  variant="outline-gold" 
                  size="sm" 
                  className="min-w-[100px] justify-between"
                  aria-label={`Catégorie: ${selectedMainCategory || 'Toutes'}`}
                >
                  <span className="truncate max-w-[90px]">{selectedMainCategory || 'Catégories'}</span>
                  <ChevronDown size={14} className="ml-1 opacity-70" aria-hidden="true" />
                </Button>
              }
              align="left"
            >
              <DropdownItem onClick={() => handleMainCategoryChange('')}>Toutes</DropdownItem>
              {mainCategories.map(cat => (
                <DropdownItem 
                  key={cat} 
                  onClick={() => handleMainCategoryChange(cat)}
                  aria-selected={selectedMainCategory === cat}
                >
                  {cat}
                </DropdownItem>
              ))}
            </Dropdown>

            {/* Sous-catégories */}
            {selectedMainCategory && subCategories.length > 0 && (
              <AnimatePresence>
                <motion.div
                  initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : { opacity: 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={shouldAnimate ? { opacity: 0, scale: 0.95 } : { opacity: 1 }}
                >
                  {renderDropdownSelector('Sous-cat.', selectedSubCategory, subCategories, handleSubCategoryChange)}
                </motion.div>
              </AnimatePresence>
            )}

            {/* Types */}
            {selectedSubCategory && types.length > 0 && (
              <AnimatePresence>
                <motion.div
                  initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : { opacity: 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={shouldAnimate ? { opacity: 0, scale: 0.95 } : { opacity: 1 }}
                >
                  {renderDropdownSelector('Type', selectedType, types, handleTypeChange)}
                </motion.div>
              </AnimatePresence>
            )}

            {/* Détails */}
            {selectedType && details.length > 0 && (
              <AnimatePresence>
                <motion.div
                  initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : { opacity: 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={shouldAnimate ? { opacity: 0, scale: 0.95 } : { opacity: 1 }}
                >
                  {renderDropdownSelector('Détail', selectedDetail, details, setSelectedDetail)}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Plage de prix (desktop) */}
          <div className="hidden md:flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs md:text-sm bg-white/60 dark:bg-midnight-800/40 backdrop-blur-sm border border-gold-400/20">
            <Input
              type="number"
              placeholder="Min"
              value={minPrice}
              onChange={handleMinPriceChange}
              size="sm"
              className="w-16 bg-transparent border-0 outline-none shadow-none"
              min="0"
              aria-label="Prix minimum"
            />
            <span className="text-muted-foreground" aria-hidden="true">–</span>
            <Input
              type="number"
              placeholder="Max"
              value={maxPrice}
              onChange={handleMaxPriceChange}
              size="sm"
              className="w-16 bg-transparent border-0 outline-none shadow-none"
              min="0"
              aria-label="Prix maximum"
            />
            {priceRange && (
              <span className="text-xs text-muted-foreground ml-1" aria-label={`Plage disponible: ${priceRange.min} à ${priceRange.max}`}>
                ({priceRange.min.toLocaleString()} – {priceRange.max.toLocaleString()})
              </span>
            )}
          </div>

          {/* Tri (desktop) */}
          <Dropdown
            trigger={
              <Button 
                variant="outline-gold" 
                size="sm" 
                leftIcon={getSortIcon()}
                aria-label={`Trier par: ${getSortLabel()}`}
              >
                <span className="hidden sm:inline">{getSortLabel()}</span>
                <span className="sm:hidden">Tri</span>
              </Button>
            }
            align="left"
          >
            <DropdownItem onClick={() => handleSortChange('created_at', 'desc')}>
              <Calendar size={14} className="mr-2" aria-hidden="true" />
              Plus récents
            </DropdownItem>
            <DropdownItem onClick={() => handleSortChange('prix', 'asc')}>
              <DollarSign size={14} className="mr-2" aria-hidden="true" />
              Prix croissant
            </DropdownItem>
            <DropdownItem onClick={() => handleSortChange('prix', 'desc')}>
              <DollarSign size={14} className="mr-2" aria-hidden="true" />
              Prix décroissant
            </DropdownItem>
            <DropdownItem onClick={() => handleSortChange('total_ventes', 'desc')}>
              <TrendingUp size={14} className="mr-2" aria-hidden="true" />
              Populaires
            </DropdownItem>
            <DropdownItem onClick={() => handleSortChange('random', 'asc')}>
              <Zap size={14} className="mr-2" aria-hidden="true" />
              Aléatoire
            </DropdownItem>
          </Dropdown>

          {/* Toggle vue (optionnel) */}
          {showViewToggle && viewMode && onViewModeChange && (
            <div 
              className="hidden md:flex items-center rounded-full bg-neutral-100 dark:bg-midnight-700/40 p-1 border border-gold-400/20"
              role="radiogroup"
              aria-label="Mode d'affichage"
            >
              <button
                onClick={() => onViewModeChange('grid')}
                className={cn(
                  'p-1.5 rounded-full transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                  viewMode === 'grid' ? 'bg-gold-500 text-white' : 'text-muted-foreground hover:bg-neutral-200 dark:hover:bg-midnight-600'
                )}
                title="Vue grille"
                aria-label="Vue grille"
                aria-checked={viewMode === 'grid'}
                role="radio"
              >
                <Grid3X3 size={16} aria-hidden="true" />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={cn(
                  'p-1.5 rounded-full transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                  viewMode === 'list' ? 'bg-gold-500 text-white' : 'text-muted-foreground hover:bg-neutral-200 dark:hover:bg-midnight-600'
                )}
                title="Vue liste"
                aria-label="Vue liste"
                aria-checked={viewMode === 'list'}
                role="radio"
              >
                <List size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Réinitialiser (desktop) */}
          <AnimatePresence>
            {hasActiveFilters && (
              <motion.div
                initial={shouldAnimate ? { opacity: 0, width: 0 } : { opacity: 1, width: 'auto' }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={shouldAnimate ? { opacity: 0, width: 0 } : { opacity: 1, width: 'auto' }}
              >
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onResetFilters} 
                  leftIcon={<RotateCcw size={14} aria-hidden="true" />} 
                  className="text-gold-600 dark:text-gold-400"
                  aria-label="Réinitialiser tous les filtres"
                >
                  <span className="hidden sm:inline">Réinitialiser</span>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compteur + indicateur de chargement */}
          {showRealTimeCount && (
            <div 
              className="ml-auto flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap"
              aria-live="polite"
              aria-atomic="true"
            >
              {isFetching && (
                <span 
                  className="w-3 h-3 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"
                  aria-label="Chargement en cours"
                />
              )}
              {!isOnline && (
                <WifiOff size={14} className="text-muted-foreground" aria-hidden="true" />
              )}
              <Sparkles size={14} className="text-gold-500" aria-hidden="true" />
              <span>
                {totalProducts} produit{totalProducts > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Filtres rapides (optionnel) */}
        {showQuickFilters && quickFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Filtres rapides">
            {quickFilters.map((filter, idx) => (
              <button
                key={idx}
                onClick={filter.onClick}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-gold-500',
                  filter.active
                    ? 'bg-gold-500 text-white shadow-md'
                    : 'bg-neutral-100 dark:bg-midnight-800 text-foreground hover:bg-gold-100 dark:hover:bg-gold-900/20'
                )}
                aria-pressed={filter.active}
              >
                {filter.icon && <span className="mr-1 inline-block">{filter.icon}</span>}
                {filter.label}
              </button>
            ))}
          </div>
        )}

        {/* Badges de filtres actifs (desktop) */}
        <AnimatePresence>
          {hasActiveFilters && (
            <motion.div
              initial={shouldAnimate ? { opacity: 0, height: 0 } : { opacity: 1, height: 'auto' }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={shouldAnimate ? { opacity: 0, height: 0 } : { opacity: 1, height: 'auto' }}
              className="flex flex-wrap gap-1.5 mt-2 overflow-hidden"
              role="list"
              aria-label="Filtres actifs"
            >
              {selectedMainCategory && (
                <Badge 
                  variant="gold" 
                  size="sm" 
                  style="soft" 
                  className="text-xs backdrop-blur-sm shadow-sm cursor-pointer hover:bg-gold-200 dark:hover:bg-gold-800 transition-colors" 
                  onClick={() => handleMainCategoryChange('')}
                  role="listitem"
                  aria-label={`Retirer filtre: ${selectedMainCategory}`}
                >
                  <Tag size={10} className="mr-1" aria-hidden="true" />
                  {selectedMainCategory}
                  <X size={12} className="ml-1 inline" aria-hidden="true" />
                </Badge>
              )}
              {selectedSubCategory && (
                <Badge 
                  variant="gold" 
                  size="sm" 
                  style="soft" 
                  className="text-xs backdrop-blur-sm shadow-sm cursor-pointer hover:bg-gold-200 dark:hover:bg-gold-800 transition-colors" 
                  onClick={() => handleSubCategoryChange('')}
                  role="listitem"
                  aria-label={`Retirer filtre: ${selectedSubCategory}`}
                >
                  {selectedSubCategory}
                  <X size={12} className="ml-1 inline" aria-hidden="true" />
                </Badge>
              )}
              {selectedType && (
                <Badge 
                  variant="gold" 
                  size="sm" 
                  style="soft" 
                  className="text-xs backdrop-blur-sm shadow-sm cursor-pointer hover:bg-gold-200 dark:hover:bg-gold-800 transition-colors" 
                  onClick={() => handleTypeChange('')}
                  role="listitem"
                  aria-label={`Retirer filtre: ${selectedType}`}
                >
                  {selectedType}
                  <X size={12} className="ml-1 inline" aria-hidden="true" />
                </Badge>
              )}
              {selectedDetail && (
                <Badge 
                  variant="gold" 
                  size="sm" 
                  style="soft" 
                  className="text-xs backdrop-blur-sm shadow-sm cursor-pointer hover:bg-gold-200 dark:hover:bg-gold-800 transition-colors" 
                  onClick={() => setSelectedDetail('')}
                  role="listitem"
                  aria-label={`Retirer filtre: ${selectedDetail}`}
                >
                  {selectedDetail}
                  <X size={12} className="ml-1 inline" aria-hidden="true" />
                </Badge>
              )}
              {minPrice && (
                <Badge 
                  variant="gold" 
                  size="sm" 
                  style="soft" 
                  className="text-xs backdrop-blur-sm shadow-sm cursor-pointer hover:bg-gold-200 dark:hover:bg-gold-800 transition-colors" 
                  onClick={() => setMinPrice('')}
                  role="listitem"
                  aria-label={`Retirer filtre: Prix minimum ${Number(minPrice).toLocaleString()} FC`}
                >
                  <DollarSign size={10} className="mr-1" aria-hidden="true" />
                  Min {Number(minPrice).toLocaleString()} FC
                  <X size={12} className="ml-1 inline" aria-hidden="true" />
                </Badge>
              )}
              {maxPrice && (
                <Badge 
                  variant="gold" 
                  size="sm" 
                  style="soft" 
                  className="text-xs backdrop-blur-sm shadow-sm cursor-pointer hover:bg-gold-200 dark:hover:bg-gold-800 transition-colors" 
                  onClick={() => setMaxPrice('')}
                  role="listitem"
                  aria-label={`Retirer filtre: Prix maximum ${Number(maxPrice).toLocaleString()} FC`}
                >
                  <DollarSign size={10} className="mr-1" aria-hidden="true" />
                  Max {Number(maxPrice).toLocaleString()} FC
                  <X size={12} className="ml-1 inline" aria-hidden="true" />
                </Badge>
              )}
              {searchQuery && (
                <Badge 
                  variant="gold" 
                  size="sm" 
                  style="soft" 
                  className="text-xs backdrop-blur-sm shadow-sm cursor-pointer hover:bg-gold-200 dark:hover:bg-gold-800 transition-colors" 
                  onClick={clearSearch}
                  role="listitem"
                  aria-label={`Retirer filtre: Recherche ${searchQuery}`}
                >
                  <Search size={10} className="mr-1" aria-hidden="true" />
                  Recherche : {searchQuery}
                  <X size={12} className="ml-1 inline" aria-hidden="true" />
                </Badge>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Container>

      {/* Panneau mobile */}
      <MobileFilterDrawer />
    </section>
  )
})

FilterBar.displayName = 'FilterBar'

export default FilterBar