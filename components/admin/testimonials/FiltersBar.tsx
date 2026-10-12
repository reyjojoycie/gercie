// components/admin/testimonials/FiltersBar.tsx
'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ChangeEvent
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  X,
  Filter,
  ArrowUpDown,
  Download,
  RotateCcw,
  ChevronDown,
  Calendar,
  Star,
  Pin,
  LayoutGrid,
  Car
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
export type SortField = 'name' | 'rating' | 'date' | 'status' | 'likes'
export type SortOrder = 'asc' | 'desc'

export interface TestimonialFilters {
  status: string        // '' = all
  ratingMin: number     // 0 = all
  search: string
  dateFrom: string      // YYYY-MM-DD
  dateTo: string        // YYYY-MM-DD
  produit: string
  isFeatured: boolean | null  // null = all
}

interface FiltersBarProps {
  filters: TestimonialFilters
  onFiltersChange: (filters: TestimonialFilters) => void
  sortField: SortField
  sortOrder: SortOrder
  onSortChange: (field: SortField, order: SortOrder) => void
  totalResults: number
  onAdd: () => void
  /** Suggestions pour l'autocomplétion produit */
  productSuggestions?: string[]
  /** Afficher un bouton d'export */
  onExport?: () => void
  /** Afficher un sélecteur de vue (grille/carrousel) */
  viewMode?: 'grid' | 'carousel'
  onViewModeChange?: (mode: 'grid' | 'carousel') => void
  /** Mode compact */
  compact?: boolean
  /** Synchroniser les filtres avec l'URL */
  syncWithUrl?: boolean
  /** Filtres additionnels personnalisés (ex: "Vérifié") */
  extraFilters?: React.ReactNode
  /** Debounce pour la recherche (ms) */
  searchDebounce?: number
}

/* ========================================================================== */
/*  Sous‑composants internes                                                   */
/* ========================================================================== */

// Debounce hook local
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  disabled
}: {
  value: string
  onChange: (val: string) => void
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!suggestions || !value) return []
    const lower = value.toLowerCase()
    return suggestions.filter(s => s.toLowerCase().includes(lower)).slice(0, 5)
  }, [suggestions, value])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-card border border-border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50"
      />
      {show && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-strong z-20">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); setShow(false) }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gold-400/10"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */
export function FiltersBar({
  filters,
  onFiltersChange,
  sortField,
  sortOrder,
  onSortChange,
  totalResults,
  onAdd,
  productSuggestions,
  onExport,
  viewMode,
  onViewModeChange,
  compact = false,
  syncWithUrl = false,
  extraFilters,
  searchDebounce = 300
}: FiltersBarProps) {
  // Recherche locale avec debounce
  const [localSearch, setLocalSearch] = useState(filters.search)
  const debouncedSearch = useDebounce(localSearch, searchDebounce)

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFiltersChange({ ...filters, search: debouncedSearch })
    }
  }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Synchroniser localSearch si filtre externe change
  useEffect(() => {
    setLocalSearch(filters.search)
  }, [filters.search])

  // Comptage des filtres actifs
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.status) count++
    if (filters.ratingMin > 0) count++
    if (filters.search) count++
    if (filters.dateFrom) count++
    if (filters.dateTo) count++
    if (filters.produit) count++
    if (filters.isFeatured !== null) count++
    return count
  }, [filters])

  // Reset tous les filtres
  const resetFilters = () => {
    onFiltersChange({
      status: '',
      ratingMin: 0,
      search: '',
      dateFrom: '',
      dateTo: '',
      produit: '',
      isFeatured: null
    })
  }

  // Trier par champ
  const handleSort = (field: SortField) => {
    if (field === sortField) {
      onSortChange(field, sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      onSortChange(field, 'asc')
    }
  }

  // Raccourci clavier : Ctrl+K pour focus recherche
  const searchInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col gap-4',
        !compact && 'sm:flex-row sm:items-center sm:flex-wrap'
      )}
    >
      {/* Recherche */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchInputRef}
          type="text"
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          placeholder="Rechercher... (Ctrl+K)"
          className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50"
        />
        {localSearch && (
          <button
            onClick={() => setLocalSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filtres rapides */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Statut */}
        <select
          value={filters.status}
          onChange={e => onFiltersChange({ ...filters, status: e.target.value })}
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50"
        >
          <option value="">Tous les statuts</option>
          <option value="published">Publié</option>
          <option value="pending">En attente</option>
          <option value="rejected">Rejeté</option>
        </select>

        {/* Note minimum */}
        <select
          value={filters.ratingMin}
          onChange={e => onFiltersChange({ ...filters, ratingMin: Number(e.target.value) })}
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50"
        >
          <option value={0}>Toutes les notes</option>
          <option value={5}>5 ★</option>
          <option value={4}>≥ 4 ★</option>
          <option value={3}>≥ 3 ★</option>
        </select>

        {/* Case “Mis en avant” */}
        <Tooltip content="Filtrer les témoignages mis en avant">
          <button
            onClick={() => onFiltersChange({
              ...filters,
              isFeatured: filters.isFeatured === true ? null : true
            })}
            className={cn(
              'p-2 rounded-xl border transition',
              filters.isFeatured === true
                ? 'bg-gold-400/20 border-gold-400/60 text-gold-600'
                : 'bg-card border-border text-muted-foreground hover:border-gold-400'
            )}
          >
            <Pin size={16} />
          </button>
        </Tooltip>

        {/* Plage de dates (option compact non affiché) */}
        {!compact && (
          <>
            <div className="relative">
              <Calendar size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={filters.dateFrom}
                onChange={e => onFiltersChange({ ...filters, dateFrom: e.target.value })}
                className="pl-7 pr-2 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50 w-36"
              />
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="relative">
              <Calendar size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={filters.dateTo}
                onChange={e => onFiltersChange({ ...filters, dateTo: e.target.value })}
                min={filters.dateFrom || undefined}
                className="pl-7 pr-2 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50 w-36"
              />
            </div>
          </>
        )}

        {/* Produit (autocomplétion) */}
        {productSuggestions && productSuggestions.length > 0 && (
          <div className="w-40">
            <AutocompleteInput
              value={filters.produit}
              onChange={val => onFiltersChange({ ...filters, produit: val })}
              suggestions={productSuggestions}
              placeholder="Produit..."
            />
          </div>
        )}

        {/* Filtres additionnels */}
        {extraFilters}
      </div>

      {/* Compteur + réinitialisation */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {totalResults} résultat{totalResults !== 1 ? 's' : ''}
        </span>
        {activeFilterCount > 0 && (
          <Tooltip content={`${activeFilterCount} filtre(s) actif(s) → Réinitialiser`}>
            <button
              onClick={resetFilters}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-gold-500 hover:bg-gold-400/10 transition"
            >
              <RotateCcw size={14} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Tri */}
      <div className="flex items-center gap-2">
        <select
          value={sortField}
          onChange={e => onSortChange(e.target.value as SortField, sortOrder)}
          className="bg-card border border-border rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50"
        >
          <option value="date">Date</option>
          <option value="name">Nom</option>
          <option value="rating">Note</option>
          <option value="status">Statut</option>
          <option value="likes">Likes</option>
        </select>
        <button
          onClick={() => onSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')}
          className="p-2 rounded-xl border border-border text-muted-foreground hover:text-gold-500"
        >
          <ArrowUpDown size={14} />
        </button>
      </div>

      {/* Vue (grille/carrousel) */}
      {viewMode && onViewModeChange && (
        <button
          onClick={() => onViewModeChange(viewMode === 'grid' ? 'carousel' : 'grid')}
          className="p-2 rounded-xl border border-border text-muted-foreground hover:text-gold-500"
          title={viewMode === 'grid' ? 'Vue carrousel' : 'Vue grille'}
        >
          {viewMode === 'grid' ? <Car size={14} /> : <LayoutGrid size={14} />}
        </button>
      )}

      {/* Export */}
      {onExport && (
        <Tooltip content="Exporter CSV">
          <Button variant="outline-gold" size="sm" onClick={onExport}>
            <Download size={14} className="mr-1" /> Exporter
          </Button>
        </Tooltip>
      )}

      {/* Ajouter */}
      <Button onClick={onAdd} className="bg-gold-500 hover:bg-gold-600 text-white">
        + Ajouter
      </Button>
    </motion.div>
  )
}

export default FiltersBar