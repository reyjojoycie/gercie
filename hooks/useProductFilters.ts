// hooks/useProductFilters.ts
'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface ProductFilters {
  searchQuery: string
  debouncedSearch: string
  selectedMainCategory: string
  selectedSubCategory: string
  selectedType: string
  selectedDetail: string
  minPrice: string
  maxPrice: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  // Filtres avancés
  inStockOnly?: boolean
  minRating?: number
  selectedTags?: string[]
  vendorFilter?: string
  dateFrom?: string
  dateTo?: string
  freeShippingOnly?: boolean
  expressOnly?: boolean
  minDiscount?: string
  maxDiscount?: string
}

export interface UseProductFiltersOptions {
  /** Clé pour persistance localStorage */
  persistKey?: string
  /** Durée du cache en ms (défaut: 24h) */
  cacheTTL?: number
  /** Activer la sync avec l'URL */
  syncWithUrl?: boolean
  /** Délai de debounce pour la recherche (ms) */
  searchDebounce?: number
  /** Délai de debounce pour les prix (ms) */
  priceDebounce?: number
  /** Taille max de l'historique */
  maxHistorySize?: number
  /** Callback quand les filtres changent */
  onChange?: (filters: ProductFilters) => void
  /** Activer la sauvegarde automatique */
  autoSave?: boolean
  /** Délai avant sauvegarde automatique (ms) */
  autoSaveDelay?: number
}

export interface UseProductFiltersReturn extends ProductFilters {
  // Setters de base
  setSearchQuery: (value: string) => void
  setSelectedMainCategory: (value: string) => void
  setSelectedSubCategory: (value: string) => void
  setSelectedType: (value: string) => void
  setSelectedDetail: (value: string) => void
  setMinPrice: (value: string) => void
  setMaxPrice: (value: string) => void
  setSortBy: (value: string) => void
  setSortOrder: (value: 'asc' | 'desc') => void
  
  // Setters avancés
  setInStockOnly: (value: boolean) => void
  setMinRating: (value: number) => void
  setSelectedTags: (tags: string[]) => void
  setVendorFilter: (value: string) => void
  setDateFrom: (value: string) => void
  setDateTo: (value: string) => void
  setFreeShippingOnly: (value: boolean) => void
  setExpressOnly: (value: boolean) => void
  setMinDiscount: (value: string) => void
  setMaxDiscount: (value: string) => void

  // Actions
  resetFilters: () => void
  hasActiveFilters: boolean
  activeFilterCount: number
  
  // Historique
  pushHistory: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  historySize: number
  
  // Presets
  applyPreset: (preset: PresetFilters) => void
  saveAsPreset: (name: string) => void
  removePreset: (name: string) => void
  presets: PresetFilters[]
  
  // Persistance
  saveCurrentFilters: () => void
  loadSavedFilters: () => void
  clearSavedFilters: () => void
  hasSavedFilters: boolean
  
  // URL sync
  syncToUrl: () => void
  loadFromUrl: () => void
  
  // Batch updates
  applyFilters: (filters: Partial<ProductFilters>) => void
  
  // Comparaison
  hasChangedFromSaved: boolean
  diffWithSaved: Partial<ProductFilters>
  
  // Stats
  filterUsageStats: FilterUsageStats
  
  // État
  isOffline: boolean
  isLoading: boolean
}

export interface PresetFilters {
  name: string
  filters: Partial<ProductFilters>
  isDefault?: boolean
  createdAt?: number
}

export interface FilterUsageStats {
  mostUsedFilters: Array<{ key: string; count: number }>
  lastResetAt?: number
  totalResets: number
  totalPresetsApplied: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_PERSIST_KEY = 'gercie-product-filters'
const DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 heures
const DEFAULT_SEARCH_DEBOUNCE = 500
const DEFAULT_PRICE_DEBOUNCE = 800
const DEFAULT_MAX_HISTORY = 30
const DEFAULT_AUTO_SAVE_DELAY = 2000
const PRESETS_STORAGE_KEY = 'gercie-filter-presets'
const STATS_STORAGE_KEY = 'gercie-filter-stats'

const DEFAULT_FILTERS: ProductFilters = {
  searchQuery: '',
  debouncedSearch: '',
  selectedMainCategory: '',
  selectedSubCategory: '',
  selectedType: '',
  selectedDetail: '',
  minPrice: '',
  maxPrice: '',
  sortBy: 'created_at',
  sortOrder: 'desc',
  inStockOnly: false,
  minRating: 0,
  selectedTags: [],
  vendorFilter: '',
  dateFrom: '',
  dateTo: '',
  freeShippingOnly: false,
  expressOnly: false,
  minDiscount: '',
  maxDiscount: '',
}

const DEFAULT_PRESETS: PresetFilters[] = [
  { 
    name: '🎉 Moins de 50 FC', 
    filters: { maxPrice: '50' },
    isDefault: true 
  },
  { 
    name: '💎 Premium (50-200 FC)', 
    filters: { minPrice: '50', maxPrice: '200' },
    isDefault: true 
  },
  { 
    name: '🔥 Nouveautés', 
    filters: { sortBy: 'created_at', sortOrder: 'desc' },
    isDefault: true 
  },
  { 
    name: '💰 Prix croissant', 
    filters: { sortBy: 'prix', sortOrder: 'asc' },
    isDefault: true 
  },
  { 
    name: '💸 Prix décroissant', 
    filters: { sortBy: 'prix', sortOrder: 'desc' },
    isDefault: true 
  },
  {
    name: '⭐ Mieux notés',
    filters: { sortBy: 'rating', sortOrder: 'desc', minRating: 4 },
    isDefault: true
  },
  {
    name: '📦 En stock uniquement',
    filters: { inStockOnly: true },
    isDefault: true
  },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS HELPERS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  
  return debouncedValue
}

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>()
  useEffect(() => {
    ref.current = value
  })
  return ref.current
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UTILITIES                                                      */
/* ═══════════════════════════════════════════════════════════════ */

function cleanNumericValue(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

function isValidDate(dateStr: string): boolean {
  if (!dateStr) return true
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

function compressFilters(filters: ProductFilters): string {
  // Compression simple pour économiser localStorage
  return btoa(JSON.stringify(filters))
}

function decompressFilters(compressed: string): ProductFilters | null {
  try {
    return JSON.parse(atob(compressed))
  } catch {
    return null
  }
}

function filtersToUrlParams(filters: ProductFilters): URLSearchParams {
  const params = new URLSearchParams()
  
  if (filters.searchQuery) params.set('q', filters.searchQuery)
  if (filters.selectedMainCategory) params.set('cat', filters.selectedMainCategory)
  if (filters.selectedSubCategory) params.set('subcat', filters.selectedSubCategory)
  if (filters.selectedType) params.set('type', filters.selectedType)
  if (filters.selectedDetail) params.set('detail', filters.selectedDetail)
  if (filters.minPrice) params.set('min', filters.minPrice)
  if (filters.maxPrice) params.set('max', filters.maxPrice)
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) params.set('sort', filters.sortBy)
  if (filters.sortOrder !== DEFAULT_FILTERS.sortOrder) params.set('order', filters.sortOrder)
  if (filters.inStockOnly) params.set('stock', '1')
  if (filters.minRating && filters.minRating > 0) params.set('rating', filters.minRating.toString())
  if (filters.selectedTags && filters.selectedTags.length > 0) {
    params.set('tags', filters.selectedTags.join(','))
  }
  if (filters.vendorFilter) params.set('vendor', filters.vendorFilter)
  if (filters.dateFrom) params.set('from', filters.dateFrom)
  if (filters.dateTo) params.set('to', filters.dateTo)
  if (filters.freeShippingOnly) params.set('free', '1')
  if (filters.expressOnly) params.set('express', '1')
  if (filters.minDiscount) params.set('mindisc', filters.minDiscount)
  if (filters.maxDiscount) params.set('maxdisc', filters.maxDiscount)
  
  return params
}

function urlParamsToFilters(params: URLSearchParams): Partial<ProductFilters> {
  const filters: Partial<ProductFilters> = {}
  
  const q = params.get('q')
  if (q) filters.searchQuery = q
  
  const cat = params.get('cat')
  if (cat) filters.selectedMainCategory = cat
  
  const subcat = params.get('subcat')
  if (subcat) filters.selectedSubCategory = subcat
  
  const type = params.get('type')
  if (type) filters.selectedType = type
  
  const detail = params.get('detail')
  if (detail) filters.selectedDetail = detail
  
  const min = params.get('min')
  if (min) filters.minPrice = min
  
  const max = params.get('max')
  if (max) filters.maxPrice = max
  
  const sort = params.get('sort')
  if (sort) filters.sortBy = sort
  
  const order = params.get('order')
  if (order === 'asc' || order === 'desc') filters.sortOrder = order
  
  const stock = params.get('stock')
  if (stock === '1') filters.inStockOnly = true
  
  const rating = params.get('rating')
  if (rating) filters.minRating = parseInt(rating, 10)
  
  const tags = params.get('tags')
  if (tags) filters.selectedTags = tags.split(',')
  
  const vendor = params.get('vendor')
  if (vendor) filters.vendorFilter = vendor
  
  const from = params.get('from')
  if (from && isValidDate(from)) filters.dateFrom = from
  
  const to = params.get('to')
  if (to && isValidDate(to)) filters.dateTo = to
  
  const free = params.get('free')
  if (free === '1') filters.freeShippingOnly = true
  
  const express = params.get('express')
  if (express === '1') filters.expressOnly = true
  
  const mindisc = params.get('mindisc')
  if (mindisc) filters.minDiscount = mindisc
  
  const maxdisc = params.get('maxdisc')
  if (maxdisc) filters.maxDiscount = maxdisc
  
  return filters
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOK PRINCIPAL                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function useProductFilters(options: UseProductFiltersOptions = {}): UseProductFiltersReturn {
  const {
    persistKey = DEFAULT_PERSIST_KEY,
    cacheTTL = DEFAULT_CACHE_TTL,
    syncWithUrl = false,
    searchDebounce = DEFAULT_SEARCH_DEBOUNCE,
    priceDebounce = DEFAULT_PRICE_DEBOUNCE,
    maxHistorySize = DEFAULT_MAX_HISTORY,
    onChange,
    autoSave = false,
    autoSaveDelay = DEFAULT_AUTO_SAVE_DELAY,
  } = options

  const isOnline = useOnlineStatus()
  
  // États principaux
  const [searchQuery, setSearchQuery] = useState(DEFAULT_FILTERS.searchQuery)
  const [selectedMainCategory, setSelectedMainCategory] = useState(DEFAULT_FILTERS.selectedMainCategory)
  const [selectedSubCategory, setSelectedSubCategory] = useState(DEFAULT_FILTERS.selectedSubCategory)
  const [selectedType, setSelectedType] = useState(DEFAULT_FILTERS.selectedType)
  const [selectedDetail, setSelectedDetail] = useState(DEFAULT_FILTERS.selectedDetail)
  const [minPrice, setMinPriceState] = useState(DEFAULT_FILTERS.minPrice)
  const [maxPrice, setMaxPriceState] = useState(DEFAULT_FILTERS.maxPrice)
  const [sortBy, setSortBy] = useState(DEFAULT_FILTERS.sortBy)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(DEFAULT_FILTERS.sortOrder)
  
  // Filtres avancés
  const [inStockOnly, setInStockOnly] = useState(DEFAULT_FILTERS.inStockOnly || false)
  const [minRating, setMinRating] = useState(DEFAULT_FILTERS.minRating || 0)
  const [selectedTags, setSelectedTags] = useState<string[]>(DEFAULT_FILTERS.selectedTags || [])
  const [vendorFilter, setVendorFilter] = useState(DEFAULT_FILTERS.vendorFilter || '')
  const [dateFrom, setDateFrom] = useState(DEFAULT_FILTERS.dateFrom || '')
  const [dateTo, setDateTo] = useState(DEFAULT_FILTERS.dateTo || '')
  const [freeShippingOnly, setFreeShippingOnly] = useState(DEFAULT_FILTERS.freeShippingOnly || false)
  const [expressOnly, setExpressOnly] = useState(DEFAULT_FILTERS.expressOnly || false)
  const [minDiscount, setMinDiscount] = useState(DEFAULT_FILTERS.minDiscount || '')
  const [maxDiscount, setMaxDiscount] = useState(DEFAULT_FILTERS.maxDiscount || '')
  
  // Historique (undo/redo)
  const [history, setHistory] = useState<string[]>([])
  const [redoStack, setRedoStack] = useState<string[]>([])
  const canUndo = history.length > 0
  const canRedo = redoStack.length > 0
  const historySize = history.length
  
  // Presets
  const [presets, setPresets] = useState<PresetFilters[]>(DEFAULT_PRESETS)
  
  // Stats
  const [filterUsageStats, setFilterUsageStats] = useState<FilterUsageStats>({
    mostUsedFilters: [],
    totalResets: 0,
    totalPresetsApplied: 0,
  })
  
  // Loading state
  const [isLoading, setIsLoading] = useState(true)
  
  // Debounced values
  const debouncedSearch = useDebounce(searchQuery, searchDebounce)
  const debouncedMinPrice = useDebounce(minPrice, priceDebounce)
  const debouncedMaxPrice = useDebounce(maxPrice, priceDebounce)
  
  // Refs
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  /* ═══════════════════════════════════════════════════════════════ */
  /*  INITIALIZATION                                               */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    setIsLoading(true)
    
    // Charger les presets personnalisés
    try {
      const storedPresets = localStorage.getItem(PRESETS_STORAGE_KEY)
      if (storedPresets) {
        const customPresets = JSON.parse(storedPresets)
        setPresets([...DEFAULT_PRESETS, ...customPresets])
      }
    } catch (err) {
      console.warn('Erreur chargement presets:', err)
    }
    
    // Charger les stats
    try {
      const storedStats = localStorage.getItem(STATS_STORAGE_KEY)
      if (storedStats) {
        setFilterUsageStats(JSON.parse(storedStats))
      }
    } catch (err) {
      console.warn('Erreur chargement stats:', err)
    }
    
    // Charger depuis l'URL si activé
    if (syncWithUrl && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.toString()) {
        const urlFilters = urlParamsToFilters(params)
        applyFiltersInternal(urlFilters, false)
        setIsLoading(false)
        return
      }
    }
    
    // Charger depuis localStorage
    try {
      const stored = localStorage.getItem(persistKey)
      if (stored) {
        const { filters, timestamp } = JSON.parse(stored)
        
        // Vérifier expiration
        if (Date.now() - timestamp < cacheTTL) {
          const decompressed = decompressFilters(filters)
          if (decompressed) {
            applyFiltersInternal(decompressed, false)
          }
        }
      }
    } catch (err) {
      console.warn('Erreur chargement filtres sauvegardés:', err)
    }
    
    setIsLoading(false)
  }, [persistKey, cacheTTL, syncWithUrl])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  CURRENT FILTERS OBJECT                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  const currentFilters = useMemo<ProductFilters>(() => ({
    searchQuery,
    debouncedSearch,
    selectedMainCategory,
    selectedSubCategory,
    selectedType,
    selectedDetail,
    minPrice,
    maxPrice,
    sortBy,
    sortOrder,
    inStockOnly,
    minRating,
    selectedTags,
    vendorFilter,
    dateFrom,
    dateTo,
    freeShippingOnly,
    expressOnly,
    minDiscount,
    maxDiscount,
  }), [
    searchQuery, debouncedSearch, selectedMainCategory, selectedSubCategory,
    selectedType, selectedDetail, minPrice, maxPrice, sortBy, sortOrder,
    inStockOnly, minRating, selectedTags, vendorFilter, dateFrom, dateTo,
    freeShippingOnly, expressOnly, minDiscount, maxDiscount,
  ])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  AUTO-SAVE                                                    */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!autoSave || isLoading) return
    
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    
    autoSaveTimerRef.current = setTimeout(() => {
      saveCurrentFiltersInternal()
    }, autoSaveDelay)
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [currentFilters, autoSave, autoSaveDelay, isLoading])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  ON CHANGE CALLBACK                                           */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isLoading && onChangeRef.current) {
      onChangeRef.current(currentFilters)
    }
  }, [currentFilters, isLoading])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  KEYBOARD SHORTCUTS                                           */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Z pour undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      // Ctrl/Cmd + Shift + Z ou Ctrl/Cmd + Y pour redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }
      // Ctrl/Cmd + Shift + R pour reset
      if ((e.ctrlKey || e.metaKey) && e.key === 'R' && e.shiftKey) {
        e.preventDefault()
        resetFilters()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  INTERNAL HELPERS                                             */
  /* ═══════════════════════════════════════════════════════════════ */

  const applyFiltersInternal = useCallback((filters: Partial<ProductFilters>, pushToHistory = true) => {
    if (pushToHistory) {
      pushHistoryInternal()
    }
    
    if (filters.searchQuery !== undefined) setSearchQuery(filters.searchQuery)
    if (filters.selectedMainCategory !== undefined) setSelectedMainCategory(filters.selectedMainCategory)
    if (filters.selectedSubCategory !== undefined) setSelectedSubCategory(filters.selectedSubCategory)
    if (filters.selectedType !== undefined) setSelectedType(filters.selectedType)
    if (filters.selectedDetail !== undefined) setSelectedDetail(filters.selectedDetail)
    if (filters.minPrice !== undefined) setMinPriceState(filters.minPrice)
    if (filters.maxPrice !== undefined) setMaxPriceState(filters.maxPrice)
    if (filters.sortBy !== undefined) setSortBy(filters.sortBy)
    if (filters.sortOrder !== undefined) setSortOrder(filters.sortOrder)
    if (filters.inStockOnly !== undefined) setInStockOnly(filters.inStockOnly)
    if (filters.minRating !== undefined) setMinRating(filters.minRating)
    if (filters.selectedTags !== undefined) setSelectedTags(filters.selectedTags)
    if (filters.vendorFilter !== undefined) setVendorFilter(filters.vendorFilter)
    if (filters.dateFrom !== undefined) setDateFrom(filters.dateFrom)
    if (filters.dateTo !== undefined) setDateTo(filters.dateTo)
    if (filters.freeShippingOnly !== undefined) setFreeShippingOnly(filters.freeShippingOnly)
    if (filters.expressOnly !== undefined) setExpressOnly(filters.expressOnly)
    if (filters.minDiscount !== undefined) setMinDiscount(filters.minDiscount)
    if (filters.maxDiscount !== undefined) setMaxDiscount(filters.maxDiscount)
    
    // Clear redo stack quand on applique de nouveaux filtres
    setRedoStack([])
  }, [])

  const pushHistoryInternal = useCallback(() => {
    const snapshot = compressFilters(currentFilters)
    setHistory(prev => [...prev, snapshot].slice(-maxHistorySize))
    setRedoStack([]) // Clear redo quand on push
  }, [currentFilters, maxHistorySize])

  const saveCurrentFiltersInternal = useCallback(() => {
    try {
      const data = {
        filters: compressFilters(currentFilters),
        timestamp: Date.now(),
      }
      localStorage.setItem(persistKey, JSON.stringify(data))
    } catch (err) {
      console.warn('Erreur sauvegarde filtres:', err)
    }
  }, [currentFilters, persistKey])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  SETTERS AVEC VALIDATION                                      */
  /* ═══════════════════════════════════════════════════════════════ */

  const setMinPrice = useCallback((value: string) => {
    const clean = cleanNumericValue(value)
    if (maxPrice && Number(clean) > Number(maxPrice)) {
      setMinPriceState(maxPrice)
    } else {
      setMinPriceState(clean)
    }
  }, [maxPrice])

  const setMaxPrice = useCallback((value: string) => {
    const clean = cleanNumericValue(value)
    if (minPrice && Number(clean) < Number(minPrice)) {
      setMaxPriceState(minPrice)
    } else {
      setMaxPriceState(clean)
    }
  }, [minPrice])

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
      searchQuery ||
      inStockOnly ||
      (minRating && minRating > 0) ||
      (selectedTags && selectedTags.length > 0) ||
      vendorFilter ||
      dateFrom ||
      dateTo ||
      freeShippingOnly ||
      expressOnly ||
      minDiscount ||
      maxDiscount
    )
  }, [
    selectedMainCategory, selectedSubCategory, selectedType, selectedDetail,
    minPrice, maxPrice, searchQuery, inStockOnly, minRating, selectedTags,
    vendorFilter, dateFrom, dateTo, freeShippingOnly, expressOnly,
    minDiscount, maxDiscount,
  ])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (selectedMainCategory) count++
    if (selectedSubCategory) count++
    if (selectedType) count++
    if (selectedDetail) count++
    if (minPrice) count++
    if (maxPrice) count++
    if (searchQuery) count++
    if (inStockOnly) count++
    if (minRating && minRating > 0) count++
    if (selectedTags && selectedTags.length > 0) count += selectedTags.length
    if (vendorFilter) count++
    if (dateFrom) count++
    if (dateTo) count++
    if (freeShippingOnly) count++
    if (expressOnly) count++
    if (minDiscount) count++
    if (maxDiscount) count++
    return count
  }, [
    selectedMainCategory, selectedSubCategory, selectedType, selectedDetail,
    minPrice, maxPrice, searchQuery, inStockOnly, minRating, selectedTags,
    vendorFilter, dateFrom, dateTo, freeShippingOnly, expressOnly,
    minDiscount, maxDiscount,
  ])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  HISTORIQUE (UNDO/REDO)                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  const pushHistory = useCallback(() => {
    pushHistoryInternal()
  }, [pushHistoryInternal])

  const undo = useCallback(() => {
    if (history.length === 0) return
    
    const last = history[history.length - 1]
    if (!last) return
    
    // Sauvegarder l'état actuel dans redo stack
    const currentSnapshot = compressFilters(currentFilters)
    setRedoStack(prev => [...prev, currentSnapshot])
    
    // Restaurer l'état précédent
    const decompressed = decompressFilters(last)
    if (decompressed) {
      applyFiltersInternal(decompressed, false)
    }
    
    setHistory(prev => prev.slice(0, -1))
  }, [history, currentFilters, applyFiltersInternal])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    
    const last = redoStack[redoStack.length - 1]
    if (!last) return
    
    // Sauvegarder l'état actuel dans history
    pushHistoryInternal()
    
    // Restaurer l'état redo
    const decompressed = decompressFilters(last)
    if (decompressed) {
      applyFiltersInternal(decompressed, false)
    }
    
    setRedoStack(prev => prev.slice(0, -1))
  }, [redoStack, pushHistoryInternal, applyFiltersInternal])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RESET                                                        */
  /* ═══════════════════════════════════════════════════════════════ */

  const resetFilters = useCallback(() => {
    pushHistoryInternal()
    applyFiltersInternal(DEFAULT_FILTERS, false)
    
    // Update stats
    setFilterUsageStats(prev => ({
      ...prev,
      totalResets: prev.totalResets + 1,
      lastResetAt: Date.now(),
    }))
  }, [pushHistoryInternal, applyFiltersInternal])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  PRESETS                                                      */
  /* ═══════════════════════════════════════════════════════════════ */

  const applyPreset = useCallback((preset: PresetFilters) => {
    pushHistoryInternal()
    applyFiltersInternal(preset.filters, false)
    
    // Update stats
    setFilterUsageStats(prev => ({
      ...prev,
      totalPresetsApplied: prev.totalPresetsApplied + 1,
    }))
  }, [pushHistoryInternal, applyFiltersInternal])

  const saveAsPreset = useCallback((name: string) => {
    const newPreset: PresetFilters = {
      name,
      filters: { ...currentFilters },
      isDefault: false,
      createdAt: Date.now(),
    }
    
    const updatedPresets = [...presets, newPreset]
    setPresets(updatedPresets)
    
    // Sauvegarder les presets personnalisés
    try {
      const customPresets = updatedPresets.filter(p => !p.isDefault)
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(customPresets))
    } catch (err) {
      console.warn('Erreur sauvegarde preset:', err)
    }
  }, [currentFilters, presets])

  const removePreset = useCallback((name: string) => {
    const updatedPresets = presets.filter(p => p.name !== name || p.isDefault)
    setPresets(updatedPresets)
    
    // Sauvegarder les presets personnalisés
    try {
      const customPresets = updatedPresets.filter(p => !p.isDefault)
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(customPresets))
    } catch (err) {
      console.warn('Erreur suppression preset:', err)
    }
  }, [presets])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  PERSISTENCE                                                  */
  /* ═══════════════════════════════════════════════════════════════ */

  const saveCurrentFilters = useCallback(() => {
    saveCurrentFiltersInternal()
  }, [saveCurrentFiltersInternal])

  const loadSavedFilters = useCallback(() => {
    try {
      const stored = localStorage.getItem(persistKey)
      if (!stored) return
      
      const { filters, timestamp } = JSON.parse(stored)
      
      // Vérifier expiration
      if (Date.now() - timestamp >= cacheTTL) {
        console.warn('Filtres sauvegardés expirés')
        return
      }
      
      const decompressed = decompressFilters(filters)
      if (decompressed) {
        pushHistoryInternal()
        applyFiltersInternal(decompressed, false)
      }
    } catch (err) {
      console.warn('Erreur chargement filtres:', err)
    }
  }, [persistKey, cacheTTL, pushHistoryInternal, applyFiltersInternal])

  const clearSavedFilters = useCallback(() => {
    try {
      localStorage.removeItem(persistKey)
    } catch (err) {
      console.warn('Erreur suppression filtres:', err)
    }
  }, [persistKey])

  const hasSavedFilters = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      const stored = localStorage.getItem(persistKey)
      if (!stored) return false
      
      const { timestamp } = JSON.parse(stored)
      return Date.now() - timestamp < cacheTTL
    } catch {
      return false
    }
  }, [persistKey, cacheTTL])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  URL SYNC                                                     */
  /* ═══════════════════════════════════════════════════════════════ */

  const syncToUrl = useCallback(() => {
    if (typeof window === 'undefined' || !syncWithUrl) return
    
    const params = filtersToUrlParams(currentFilters)
    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname
    
    window.history.replaceState({}, '', newUrl)
  }, [currentFilters, syncWithUrl])

  const loadFromUrl = useCallback(() => {
    if (typeof window === 'undefined' || !syncWithUrl) return
    
    const params = new URLSearchParams(window.location.search)
    if (!params.toString()) return
    
    const urlFilters = urlParamsToFilters(params)
    pushHistoryInternal()
    applyFiltersInternal(urlFilters, false)
  }, [syncWithUrl, pushHistoryInternal, applyFiltersInternal])

  // Auto-sync URL quand les filtres changent
  useEffect(() => {
    if (syncWithUrl && !isLoading) {
      syncToUrl()
    }
  }, [currentFilters, syncWithUrl, isLoading, syncToUrl])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  BATCH UPDATES                                                */
  /* ═══════════════════════════════════════════════════════════════ */

  const applyFilters = useCallback((filters: Partial<ProductFilters>) => {
    pushHistoryInternal()
    applyFiltersInternal(filters, false)
  }, [pushHistoryInternal, applyFiltersInternal])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  COMPARISON                                                   */
  /* ═══════════════════════════════════════════════════════════════ */

  const diffWithSaved = useMemo(() => {
    if (!hasSavedFilters) return {}
    
    try {
      const stored = localStorage.getItem(persistKey)
      if (!stored) return {}
      
      const { filters: savedCompressed } = JSON.parse(stored)
      const saved = decompressFilters(savedCompressed)
      if (!saved) return {}
      
      const diff: Partial<ProductFilters> = {}
      const keys = Object.keys(currentFilters) as (keyof ProductFilters)[]
      
      keys.forEach(key => {
        if (currentFilters[key] !== saved[key]) {
          (diff as any)[key] = currentFilters[key]
        }
      })
      
      return diff
    } catch {
      return {}
    }
  }, [currentFilters, hasSavedFilters, persistKey])

  const hasChangedFromSaved = useMemo(() => {
    return Object.keys(diffWithSaved).length > 0
  }, [diffWithSaved])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  STATS TRACKING                                               */
  /* ═══════════════════════════════════════════════════════════════ */

  const updateStats = useCallback((filterKey: string) => {
    setFilterUsageStats(prev => {
      const existing = prev.mostUsedFilters.find(f => f.key === filterKey)
      let updated: Array<{ key: string; count: number }>
      
      if (existing) {
        updated = prev.mostUsedFilters.map(f => 
          f.key === filterKey ? { ...f, count: f.count + 1 } : f
        )
      } else {
        updated = [...prev.mostUsedFilters, { key: filterKey, count: 1 }]
      }
      
      // Trier par count décroissant et limiter à 10
      updated.sort((a, b) => b.count - a.count)
      updated = updated.slice(0, 10)
      
      const newStats = { ...prev, mostUsedFilters: updated }
      
      // Sauvegarder dans localStorage
      try {
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats))
      } catch (err) {
        console.warn('Erreur sauvegarde stats:', err)
      }
      
      return newStats
    })
  }, [])

  // Wrapper setters pour tracker l'utilisation
  const setSearchQueryTracked = useCallback((value: string) => {
    setSearchQuery(value)
    if (value) updateStats('searchQuery')
  }, [updateStats])

  const setSelectedMainCategoryTracked = useCallback((value: string) => {
    setSelectedMainCategory(value)
    if (value) updateStats('selectedMainCategory')
  }, [updateStats])

  // ... (autres wrappers similaires)

  /* ═══════════════════════════════════════════════════════════════ */
  /*  CLEANUP                                                      */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [])

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RETURN                                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  return {
    // États
    ...currentFilters,
    
    // Setters de base
    setSearchQuery: setSearchQueryTracked,
    setSelectedMainCategory: setSelectedMainCategoryTracked,
    setSelectedSubCategory,
    setSelectedType,
    setSelectedDetail,
    setMinPrice,
    setMaxPrice,
    setSortBy,
    setSortOrder,
    
    // Setters avancés
    setInStockOnly,
    setMinRating,
    setSelectedTags,
    setVendorFilter,
    setDateFrom,
    setDateTo,
    setFreeShippingOnly,
    setExpressOnly,
    setMinDiscount,
    setMaxDiscount,
    
    // Actions
    resetFilters,
    hasActiveFilters,
    activeFilterCount,
    
    // Historique
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    historySize,
    
    // Presets
    applyPreset,
    saveAsPreset,
    removePreset,
    presets,
    
    // Persistance
    saveCurrentFilters,
    loadSavedFilters,
    clearSavedFilters,
    hasSavedFilters,
    
    // URL sync
    syncToUrl,
    loadFromUrl,
    
    // Batch updates
    applyFilters,
    
    // Comparaison
    hasChangedFromSaved,
    diffWithSaved,
    
    // Stats
    filterUsageStats,
    
    // État
    isOffline: !isOnline,
    isLoading,
  }
}