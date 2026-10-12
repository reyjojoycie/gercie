// components/admin/DataTable.tsx
'use client'

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Download,
  X,
  Filter,
  CheckSquare,
  Square,
  AlertCircle,
  RefreshCcw,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface DataTableColumn<T = any> {
  /** En-tête affiché */
  header: string
  /** Fonction ou clé pour extraire la valeur à afficher */
  accessor: ((row: T) => React.ReactNode) | keyof T
  /** Classe additionnelle pour la cellule */
  className?: string
  /** Classe pour l'en-tête */
  headerClassName?: string
  /** La colonne est‑elle triable ? */
  sortable?: boolean
  /** Largeur fixe (ex: '120px') */
  width?: string
  /** Masquer la colonne sur mobile */
  hideOnMobile?: boolean
  /** Alignement horizontal */
  align?: 'left' | 'center' | 'right'
}

export interface DataTableAction<T = any> {
  /** Libellé du bouton (peut être masqué en mode icône seule) */
  label: string
  /** Icône Lucide ou ReactNode */
  icon?: React.ReactNode
  /** Callback exécutée au clic */
  onClick: (row: T, index: number) => void
  /** Variante de couleur */
  variant?: 'luxe' | 'outline-gold' | 'danger' | 'ghost'
  /** Désactiver l'action sur certaines lignes */
  disabled?: (row: T) => boolean
  /** Afficher uniquement l'icône */
  iconOnly?: boolean
}

export interface DataTableBulkAction {
  label: string
  icon?: React.ReactNode
  onClick: (selectedRows: any[]) => void
  variant?: 'accent' | 'danger' | 'luxe' | 'outline'
  disabled?: (selectedRows: any[]) => boolean
}

export interface DataTableFilter {
  key: string
  label: string
  options: { label: string; value: string }[]
}

export interface DataTableProps<T = any> {
  /** Données à afficher */
  data: T[]
  /** Configuration des colonnes */
  columns: DataTableColumn<T>[]
  /** Fonction pour extraire une clé unique pour chaque ligne */
  keyExtractor: (row: T) => string | number
  /** Nombre total d'éléments (si pagination serveur) */
  total?: number
  /** Page actuelle (1‑indexed) */
  currentPage?: number
  /** Nombre de pages */
  totalPages?: number
  /** Nombre d'éléments par page */
  pageSize?: number
  /** Callback pour changer de page */
  onPageChange?: (page: number) => void
  /** Callback pour changer la taille de page */
  onPageSizeChange?: (size: number) => void
  /** Colonne de tri active */
  sortColumn?: string
  /** Direction du tri */
  sortDirection?: 'asc' | 'desc'
  /** Callback lors du tri */
  onSort?: (column: string) => void
  /** IDs sélectionnés */
  selectedIds?: Set<string | number>
  /** Callback lors de la sélection multiple */
  onSelectionChange?: (ids: Set<string | number>) => void
  /** Lignes sur lesquelles le clic déclenche une action */
  onRowClick?: (row: T) => void
  /** Actions sur chaque ligne */
  rowActions?: DataTableAction<T>[]
  /** Actions groupées (visibles quand une sélection est active) */
  bulkActions?: DataTableBulkAction[]
  /** État de chargement */
  loading?: boolean
  /** Message d'erreur */
  error?: string | null
  /** Callback pour réessayer */
  onRetry?: () => void
  /** Message quand la liste est vide */
  emptyMessage?: string
  /** Icône quand la liste est vide */
  emptyIcon?: React.ReactNode
  /** Classes additionnelles */
  className?: string
  /** Masquer la barre de recherche */
  hideSearch?: boolean
  /** Masquer la pagination */
  hidePagination?: boolean
  /** Afficher un bouton d'export CSV (appelle onExport) */
  showExport?: boolean
  /** Callback export CSV */
  onExport?: () => void
  /** Taille des lignes */
  rowSize?: 'sm' | 'md'
  /** Affichage compact (moins de padding) */
  compact?: boolean
  /** Filtres additionnels (affichés dans un panneau) */
  filters?: DataTableFilter[]
  /** Callback lorsqu'un filtre change */
  onFilterChange?: (key: string, value: string) => void
}

/* ========================================================================== */
/*  Composant DataTable                                                        */
/* ========================================================================== */

function DataTableInner<T>(
  props: DataTableProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const {
    data,
    columns,
    keyExtractor,
    total = data.length,
    currentPage: controlledPage,
    totalPages: controlledTotalPages,
    pageSize: controlledPageSize = 10,
    onPageChange,
    onPageSizeChange,
    sortColumn,
    sortDirection,
    onSort,
    selectedIds,
    onSelectionChange,
    onRowClick,
    rowActions,
    bulkActions,
    loading = false,
    error = null,
    onRetry,
    emptyMessage = 'Aucune donnée',
    emptyIcon,
    className,
    hideSearch = false,
    hidePagination = false,
    showExport = false,
    onExport,
    rowSize = 'md',
    compact = false,
    filters,
    onFilterChange,
  } = props

  // État interne pour la pagination locale (si pas contrôlée)
  const [internalPage, setInternalPage] = useState(1)
  const [internalPageSize, setInternalPageSize] = useState(controlledPageSize)
  const [internalSortColumn, setInternalSortColumn] = useState<string | undefined>(sortColumn)
  const [internalSortDirection, setInternalSortDirection] = useState<'asc' | 'desc'>(
    sortDirection || 'asc'
  )
  const [internalSelected, setInternalSelected] = useState<Set<string | number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  // Pagination locale vs contrôlée
  const page = controlledPage ?? internalPage
  const pageSize = controlledPageSize ?? internalPageSize
  const totalItems = total
  const totalPages = controlledTotalPages ?? Math.ceil(totalItems / pageSize)
  const hasPrev = page > 1
  const hasNext = page < totalPages

  // Tri local vs contrôlé
  const activeSortColumn = sortColumn ?? internalSortColumn
  const activeSortDirection = sortDirection ?? internalSortDirection

  // Sélection locale vs contrôlée
  const selected = selectedIds ?? internalSelected

  // Filtrage local par recherche
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data
    const q = searchQuery.toLowerCase()
    return data.filter(row =>
      columns.some(col => {
        const value =
          typeof col.accessor === 'function'
            ? col.accessor(row)
            : row[col.accessor as keyof T]
        if (value === null || value === undefined) return false
        return String(value).toLowerCase().includes(q)
      })
    )
  }, [data, searchQuery, columns])

  // Tri local (si pas de tri serveur)
  const sortedData = useMemo(() => {
    if (!activeSortColumn) return filteredData
    const col = columns.find(
      c => c.header === activeSortColumn
    )
    if (!col) return filteredData
    const dir = activeSortDirection === 'asc' ? 1 : -1
    return [...filteredData].sort((a, b) => {
      const aVal =
        typeof col.accessor === 'function'
          ? ''
          : String(a[col.accessor as keyof T] ?? '')
      const bVal =
        typeof col.accessor === 'function'
          ? ''
          : String(b[col.accessor as keyof T] ?? '')
      return aVal.localeCompare(bVal) * dir
    })
  }, [filteredData, activeSortColumn, activeSortDirection, columns])

  // Données paginées localement (si pas de pagination serveur)
  const paginatedData = useMemo(() => {
    if (controlledPage !== undefined) return sortedData // pagination serveur
    const start = (page - 1) * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [sortedData, page, pageSize, controlledPage])

  // Gestion du tri
  const handleSort = useCallback(
    (columnHeader: string) => {
      if (onSort) {
        onSort(columnHeader)
        return
      }
      if (internalSortColumn === columnHeader) {
        setInternalSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setInternalSortColumn(columnHeader)
        setInternalSortDirection('asc')
      }
    },
    [onSort, internalSortColumn]
  )

  // Gestion de la sélection
  const toggleSelectAll = useCallback(() => {
    const newSelected =
      selected.size === paginatedData.length
        ? new Set<string | number>()
        : new Set(paginatedData.map(r => keyExtractor(r)))
    if (onSelectionChange) onSelectionChange(newSelected)
    else setInternalSelected(newSelected)
  }, [selected, paginatedData, keyExtractor, onSelectionChange])

  const toggleSelectRow = useCallback(
    (key: string | number) => {
      const newSelected = new Set(selected)
      if (newSelected.has(key)) newSelected.delete(key)
      else newSelected.add(key)
      if (onSelectionChange) onSelectionChange(newSelected)
      else setInternalSelected(newSelected)
    },
    [selected, onSelectionChange]
  )

  const isAllSelected =
    paginatedData.length > 0 &&
    paginatedData.every(r => selected.has(keyExtractor(r)))

  const handlePageChange = (newPage: number) => {
    if (onPageChange) onPageChange(newPage)
    else setInternalPage(newPage)
  }

  const handlePageSizeChange = (size: number) => {
    if (onPageSizeChange) onPageSizeChange(size)
    else setInternalPageSize(size)
    handlePageChange(1)
  }

  // Accesseur pour cellule
  const getCellContent = (col: DataTableColumn<T>, row: T): React.ReactNode => {
    if (typeof col.accessor === 'function') {
      return (col.accessor as (row: T) => React.ReactNode)(row)
    }
    const val = row[col.accessor as keyof T]
    if (val === null || val === undefined) return '—'
    return String(val)
  }

  const rowPadding = compact ? 'px-3 py-2' : rowSize === 'sm' ? 'px-4 py-2' : 'px-4 py-3'

  return (
    <div ref={containerRef} className={cn('space-y-4', className)}>
      {/* Barre d'outils : recherche + export + filtres */}
      {(!hideSearch || showExport || (filters && filters.length > 0)) && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex-1 flex gap-2 max-w-xs w-full">
            {!hideSearch && (
              <Input
                leftIcon={<Search size={16} className="text-muted-foreground" />}
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                allowClear
                onClear={() => setSearchQuery('')}
                variant="glass"
                size="sm"
                className="flex-1"
              />
            )}
            {filters && filters.length > 0 && (
              <Tooltip content="Filtres avancés">
                <Button
                  variant={showFilters ? 'gold' : 'outline-gold'}
                  size="icon"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter size={16} />
                </Button>
              </Tooltip>
            )}
          </div>
          <div className="flex gap-2 items-center">
            {selected.size > 0 && bulkActions && (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-muted-foreground">
                  {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
                </span>
                {bulkActions.map((action, idx) => (
                  <Button
                    key={idx}
                    variant={action.variant || 'outline-gold'}
                    size="sm"
                    onClick={() => action.onClick(paginatedData.filter(r => selected.has(keyExtractor(r))))}
                    leftIcon={action.icon}
                    disabled={action.disabled?.(paginatedData.filter(r => selected.has(keyExtractor(r))))}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
            {showExport && onExport && (
              <Tooltip content="Exporter CSV">
                <Button variant="outline-gold" size="sm" onClick={onExport} leftIcon={<Download size={14} />}>
                  Export
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {/* Filtres avancés */}
      <AnimatePresence>
        {showFilters && filters && filters.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl bg-card border border-border flex flex-wrap gap-4">
              {filters.map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <select
                    value={filterValues[f.key] || ''}
                    onChange={e => {
                      const val = e.target.value
                      setFilterValues(prev => ({ ...prev, [f.key]: val }))
                      onFilterChange?.(f.key, val)
                    }}
                    className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="">Tous</option>
                    {f.options.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterValues({})
                    setShowFilters(false)
                  }}
                >
                  <X size={14} className="mr-1" /> Réinitialiser
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-2xl border border-gold-400/10 bg-card/50 backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold-400/10 text-left bg-muted/50">
              {/* Checkbox colonne */}
              {onSelectionChange !== undefined || bulkActions ? (
                <th className={cn('w-10', rowPadding)}>
                  <button
                    onClick={toggleSelectAll}
                    className="text-muted-foreground hover:text-gold-500 transition-colors"
                    aria-label={isAllSelected ? 'Désélectionner tout' : 'Sélectionner tout'}
                  >
                    {isAllSelected ? (
                      <CheckSquare size={18} className="text-gold-500" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
              ) : null}
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={cn(
                    'font-semibold text-muted-foreground whitespace-nowrap',
                    rowPadding,
                    col.sortable && 'cursor-pointer hover:text-gold-500 select-none',
                    col.headerClassName,
                    col.hideOnMobile && 'hidden md:table-cell',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.header)}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && activeSortColumn === col.header && (
                      <span className="text-gold-500">
                        {activeSortDirection === 'asc' ? ' ↑' : ' ↓'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              {rowActions && rowActions.length > 0 && (
                <th className={cn('text-right', rowPadding)}>Actions</th>
              )}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-gold-400/5">
                  {onSelectionChange !== undefined || bulkActions ? (
                    <td className={rowPadding}><Skeleton variant="text" className="h-4 w-4" shimmer shimmerVariant="gold" /></td>
                  ) : null}
                  {columns.map((_, j) => (
                    <td key={j} className={cn(rowPadding, columns[j].hideOnMobile && 'hidden md:table-cell')}>
                      <Skeleton variant="text" className="h-4 w-full" shimmer shimmerVariant="gold" />
                    </td>
                  ))}
                  {rowActions && <td className={rowPadding}><Skeleton variant="text" className="h-4 w-16 ml-auto" shimmer shimmerVariant="gold" /></td>}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td
                  colSpan={columns.length + (onSelectionChange !== undefined ? 1 : 0) + (rowActions ? 1 : 0)}
                  className="text-center py-12"
                >
                  <div className="flex flex-col items-center gap-3">
                    <AlertCircle size={32} className="text-red-500" />
                    <p className="text-sm text-muted-foreground">{error}</p>
                    {onRetry && (
                      <Button variant="outline-gold" size="sm" onClick={onRetry} leftIcon={<RefreshCcw size={14} />}>
                        Réessayer
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (onSelectionChange !== undefined ? 1 : 0) + (rowActions ? 1 : 0)}
                  className="text-center py-12"
                >
                  {emptyIcon ? (
                    <div className="flex flex-col items-center gap-2">
                      {emptyIcon}
                      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">{emptyMessage}</p>
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIdx) => {
                const key = keyExtractor(row)
                const isSelected = selected.has(key)
                return (
                  <motion.tr
                    key={key}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: rowIdx * 0.02 }}
                    className={cn(
                      'border-b border-gold-400/5 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-gold-400/5',
                      isSelected && 'bg-gold-400/5',
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {onSelectionChange !== undefined || bulkActions ? (
                      <td className={rowPadding}>
                        <button
                          onClick={e => { e.stopPropagation(); toggleSelectRow(key) }}
                          className="text-muted-foreground hover:text-gold-500 transition-colors"
                          aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
                        >
                          {isSelected ? (
                            <CheckSquare size={18} className="text-gold-500" />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </td>
                    ) : null}
                    {columns.map((col, colIdx) => (
                      <td
                        key={colIdx}
                        className={cn(
                          rowPadding,
                          col.className,
                          col.hideOnMobile && 'hidden md:table-cell',
                          col.align === 'center' && 'text-center',
                          col.align === 'right' && 'text-right',
                        )}
                      >
                        {getCellContent(col, row)}
                      </td>
                    ))}
                    {rowActions && rowActions.length > 0 && (
                      <td className={cn(rowPadding, 'text-right')}>
                        <div className="flex items-center justify-end gap-1">
                          {rowActions.map((action, actIdx) => (
                            <Tooltip key={actIdx} content={action.iconOnly ? action.label : undefined}>
                              <Button
                                variant={action.variant || 'ghost'}
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation()
                                  action.onClick(row, rowIdx)
                                }}
                                disabled={action.disabled?.(row)}
                                leftIcon={!action.iconOnly ? action.icon : undefined}
                              >
                                {action.iconOnly && action.icon ? action.icon : action.label}
                              </Button>
                            </Tooltip>
                          ))}
                        </div>
                      </td>
                    )}
                  </motion.tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!hidePagination && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <Button
              variant="outline-gold"
              size="icon"
              onClick={() => handlePageChange(page - 1)}
              disabled={!hasPrev}
            >
              <ChevronLeft size={16} />
            </Button>
            {/* Affichage pagination */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && p - arr[idx - 1] > 1 && (
                    <span className="px-2 text-muted-foreground">…</span>
                  )}
                  <Button
                    variant={p === page ? 'gold' : 'outline-gold'}
                    size="sm"
                    onClick={() => handlePageChange(p)}
                    className={cn(p === page && 'shadow-gold')}
                  >
                    {p}
                  </Button>
                </React.Fragment>
              ))}
            <Button
              variant="outline-gold"
              size="icon"
              onClick={() => handlePageChange(page + 1)}
              disabled={!hasNext}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Afficher</span>
            <select
              value={pageSize}
              onChange={e => handlePageSizeChange(Number(e.target.value))}
              className="bg-card border border-border rounded-lg px-2 py-1 text-xs"
            >
              {[10, 25, 50].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="hidden sm:inline">/ {totalItems} résultats</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Forward ref pour le composant
export const DataTable = forwardRef(DataTableInner) as <T>(
  props: DataTableProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => ReturnType<typeof DataTableInner>