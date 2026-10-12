// components/ui/Table.tsx
'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown, CheckSquare, Square } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types et interfaces                                                */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  header: string
  accessor: keyof T | ((row: T, context?: any) => React.ReactNode)
  className?: string
  headerClassName?: string
  sortable?: boolean
}

export interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string | number
  loading?: boolean
  loadingRows?: number
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  onRowClick?: (row: T) => void
  defaultSortColumn?: string
  defaultSortDirection?: 'asc' | 'desc'
  onSort?: (column: string, direction: 'asc' | 'desc') => void
  className?: string
  selectable?: boolean
  selectedIds?: Set<string | number>
  onSelectionChange?: (selected: Set<string | number>) => void
  wrapperClassName?: string
  /** Contexte supplémentaire passé en second paramètre à chaque accessor fonction */
  renderContext?: any
}

/* ------------------------------------------------------------------ */
/*  Composant Table                                                    */
/* ------------------------------------------------------------------ */

function Table<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  loadingRows = 5,
  emptyMessage = 'Aucune donnée à afficher.',
  emptyIcon,
  onRowClick,
  defaultSortColumn,
  defaultSortDirection = 'asc',
  onSort,
  className,
  selectable = false,
  selectedIds: externalSelected,
  onSelectionChange,
  wrapperClassName,
  renderContext,
}: TableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | undefined>(defaultSortColumn)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection)
  const [internalSelected, setInternalSelected] = useState<Set<string | number>>(new Set())

  const selected = externalSelected ?? internalSelected

  const handleSort = useCallback((accessor: string) => {
    const newDirection =
      sortColumn === accessor && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortColumn(accessor)
    setSortDirection(newDirection)
    onSort?.(accessor, newDirection)
  }, [sortColumn, sortDirection, onSort])

  const sortedData = useMemo(() => {
    if (!sortColumn) return data
    if (onSort) return data

    const column = columns.find(col =>
      typeof col.accessor === 'string' ? col.accessor === sortColumn : false
    )
    if (!column) return data

    return [...data].sort((a, b) => {
      const aVal = typeof column.accessor === 'function' ? '' : String(a[column.accessor] ?? '')
      const bVal = typeof column.accessor === 'function' ? '' : String(b[column.accessor] ?? '')
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })
  }, [data, sortColumn, sortDirection, columns, onSort])

  const toggleSelectAll = () => {
    if (selected.size === data.length) {
      const newSelected = new Set<string | number>()
      if (onSelectionChange) onSelectionChange(newSelected)
      else setInternalSelected(newSelected)
    } else {
      const newSelected = new Set(data.map(r => keyExtractor(r)))
      if (onSelectionChange) onSelectionChange(newSelected)
      else setInternalSelected(newSelected)
    }
  }

  const toggleRow = (row: T) => {
    const id = keyExtractor(row)
    const newSet = new Set(selected)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    if (onSelectionChange) onSelectionChange(newSet)
    else setInternalSelected(newSet)
  }

  const allSelected = data.length > 0 && selected.size === data.length

  return (
    <div className={cn('bg-white dark:bg-midnight-800/50 backdrop-blur-sm rounded-2xl shadow-card border border-neutral-200 dark:border-midnight-500/30 overflow-hidden', className)}>
      <div className={cn('overflow-x-auto', wrapperClassName)}>
        <table className="w-full text-left">
          <thead className="bg-neutral-50 dark:bg-midnight-700/40 border-b border-neutral-200 dark:border-midnight-500/30">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <button
                    onClick={toggleSelectAll}
                    className="text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 transition-colors"
                    aria-label={allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  >
                    {allSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                </th>
              )}
              {columns.map((col, idx) => {
                const accessorKey = typeof col.accessor === 'string' ? col.accessor : `col-${idx}`
                const isSorted = sortColumn === accessorKey

                return (
                  <th
                    key={accessorKey}
                    className={cn(
                      'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400',
                      col.sortable && 'cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200',
                      col.headerClassName
                    )}
                    onClick={() => col.sortable && handleSort(accessorKey)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.header}
                      {col.sortable && (
                        <span className="inline-flex">
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ChevronUp size={14} className="text-gold-500" />
                            ) : (
                              <ChevronDown size={14} className="text-gold-500" />
                            )
                          ) : (
                            <ChevronsUpDown size={14} className="opacity-40 group-hover:opacity-80 transition-opacity" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-midnight-500/20">
            {loading ? (
              Array.from({ length: loadingRows }).map((_, idx) => (
                <tr key={`skeleton-${idx}`}>
                  {selectable && (
                    <td className="px-4 py-3">
                      <div className="h-4 w-4 bg-neutral-200 dark:bg-midnight-700/60 rounded animate-pulse" />
                    </td>
                  )}
                  {columns.map((_, colIdx) => (
                    <td key={colIdx} className="px-4 py-3">
                      <div className="relative h-4 rounded-full overflow-hidden bg-neutral-100 dark:bg-midnight-700/40">
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-gold-400/20 dark:via-gold-500/15 to-transparent" />
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={selectable ? columns.length + 1 : columns.length} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    {emptyIcon || (
                      <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-midnight-700/40 flex items-center justify-center text-neutral-400">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                      </div>
                    )}
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedData.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'hover:bg-neutral-50 dark:hover:bg-midnight-700/30 transition-colors',
                    onRowClick && 'cursor-pointer'
                  )}
                >
                  {selectable && (
                    <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleRow(row)}
                        className="text-neutral-400 hover:text-gold-500 transition-colors"
                      >
                        {selected.has(keyExtractor(row)) ? <CheckSquare size={18} className="text-gold-500" /> : <Square size={18} />}
                      </button>
                    </td>
                  )}
                  {columns.map((col, idx) => {
                    const value =
                      typeof col.accessor === 'function'
                        ? col.accessor(row, renderContext)   // ← second paramètre = renderContext
                        : String(row[col.accessor] ?? '')

                    return (
                      <td key={idx} className={cn('px-4 py-3 text-sm text-neutral-700 dark:text-neutral-200', col.className)}>
                        {value}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Composant Pagination                                               */
/* ------------------------------------------------------------------ */

function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav className={cn('flex items-center justify-center gap-2 mt-4', className)} aria-label="Pagination">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-lg border border-neutral-200 dark:border-midnight-500/30 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-100 dark:hover:bg-midnight-700/40 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      {generatePageNumbers(currentPage, totalPages).map((page, idx) =>
        page === 'dots' ? (
          <span key={`dots-${idx}`} className="px-2 text-neutral-400">…</span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page as number)}
            className={cn(
              'min-w-[2.5rem] h-10 px-3 rounded-lg text-sm font-medium transition-colors',
              page === currentPage
                ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-midnight-700/40'
            )}
          >
            {page}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-lg border border-neutral-200 dark:border-midnight-500/30 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-100 dark:hover:bg-midnight-700/40 transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}

function generatePageNumbers(current: number, total: number): (number | 'dots')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: (number | 'dots')[] = [1]
  if (current > 3) pages.push('dots')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  if (current < total - 2) pages.push('dots')
  pages.push(total)
  return pages
}

export { Table, Pagination }
