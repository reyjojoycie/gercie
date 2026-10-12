// components/OrderHistoryFilters.tsx
'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/Dropdown'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  Search,
  Filter,
  X,
  Calendar,
  ArrowUpDown,
  RefreshCw,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export type OrderStatusFilter =
  | 'all'
  | 'en_attente'
  | 'payee'
  | 'collecte'
  | 'en_livraison'
  | 'livree'
  | 'annulee'

export type SortOption = 'created_at-desc' | 'created_at-asc' | 'total_global-desc' | 'total_global-asc'

export interface OrderHistoryFiltersValue {
  statut: OrderStatusFilter
  search: string
  sortBy: SortOption
  dateFrom: string  // ISO date string or empty
  dateTo: string
  minTotal: string
  maxTotal: string
}

const defaultFilters: OrderHistoryFiltersValue = {
  statut: 'all',
  search: '',
  sortBy: 'created_at-desc',
  dateFrom: '',
  dateTo: '',
  minTotal: '',
  maxTotal: '',
}

export interface OrderHistoryFiltersProps {
  /** Valeur actuelle des filtres (contrôlé) */
  value?: Partial<OrderHistoryFiltersValue>
  /** Callback lorsque les filtres changent */
  onChange: (filters: Partial<OrderHistoryFiltersValue>) => void
  /** Callback pour réinitialiser les filtres */
  onReset?: () => void
  /** Nombre total de commandes (affiché) */
  totalOrders?: number
  /** Indique si les données sont en cours de chargement */
  loading?: boolean
  /** Classes additionnelles */
  className?: string
  /** Mode compact (moins d'espace) */
  compact?: boolean
}

const STATUTS: { value: OrderStatusFilter; label: string; variant: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' }[] = [
  { value: 'all', label: 'Tous les statuts', variant: 'neutral' },
  { value: 'en_attente', label: 'En attente', variant: 'warm' },
  { value: 'payee', label: 'Payée', variant: 'gold' },
  { value: 'collecte', label: 'Collecte', variant: 'neutral' },
  { value: 'en_livraison', label: 'En livraison', variant: 'warm' },
  { value: 'livree', label: 'Livrée', variant: 'accent' },
  { value: 'annulee', label: 'Annulée', variant: 'danger' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'created_at-desc', label: 'Plus récentes' },
  { value: 'created_at-asc', label: 'Plus anciennes' },
  { value: 'total_global-desc', label: 'Montant ↓' },
  { value: 'total_global-asc', label: 'Montant ↑' },
]

const DATE_PRESETS = [
  { label: 'Ce mois', getValue: () => {
    const d = new Date()
    const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10)
    return { dateFrom: from, dateTo: '' }
  }},
  { label: 'Ce trimestre', getValue: () => {
    const d = new Date()
    const m = Math.floor(d.getMonth() / 3) * 3
    const from = new Date(d.getFullYear(), m, 1).toISOString().slice(0,10)
    return { dateFrom: from, dateTo: '' }
  }},
  { label: 'Cette année', getValue: () => {
    const from = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10)
    return { dateFrom: from, dateTo: '' }
  }},
  { label: 'Aujourd’hui', getValue: () => {
    const today = new Date().toISOString().slice(0,10)
    return { dateFrom: today, dateTo: today }
  }},
]

/* ========================================================================== */
/*  Composant                                                                  */
/* ========================================================================== */

export function OrderHistoryFilters({
  value,
  onChange,
  onReset,
  totalOrders = 0,
  loading = false,
  className,
  compact = false,
}: OrderHistoryFiltersProps) {
  // Fusion avec les valeurs par défaut
  const filters = useMemo(() => ({ ...defaultFilters, ...value }), [value])

  // État local du panneau "plus de filtres"
  const [showMore, setShowMore] = useState(false)

  // Compteur de filtres actifs (hors valeur par défaut)
  const activeCount = useMemo(() => {
    let count = 0
    if (filters.statut !== 'all') count++
    if (filters.search !== '') count++
    if (filters.dateFrom !== '') count++
    if (filters.dateTo !== '') count++
    if (filters.minTotal !== '') count++
    if (filters.maxTotal !== '') count++
    return count
  }, [filters])

  const setFilter = useCallback(
    (key: keyof OrderHistoryFiltersValue, value: string | OrderStatusFilter | SortOption) => {
      onChange({ [key]: value })
    },
    [onChange]
  )

  const resetAll = () => {
    onChange(defaultFilters)
    onReset?.()
  }

  const currentStatut = STATUTS.find(s => s.value === filters.statut) || STATUTS[0]
  const currentSort = SORT_OPTIONS.find(s => s.value === filters.sortBy) || SORT_OPTIONS[0]

  return (
    <div className={cn('space-y-3', className)}>
      {/* Ligne principale */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Recherche */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Input
            leftIcon={<Search size={16} className="text-muted-foreground" />}
            placeholder="Numéro de commande..."
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            allowClear
            onClear={() => setFilter('search', '')}
            variant="glass"
            size="sm"
            className="h-9"
          />
        </div>

        {/* Statut */}
        <Dropdown
          trigger={
            <Button variant="outline-gold" size="sm" className="justify-between min-w-[120px]">
              <span className="truncate max-w-[90px]">{currentStatut.label}</span>
              <ChevronDown size={14} className="ml-1 opacity-70" />
            </Button>
          }
          align="left"
        >
          {STATUTS.map(s => (
            <DropdownItem key={s.value} onClick={() => setFilter('statut', s.value)}>
              <span className="flex items-center gap-2">
                <span className={cn(
                  'w-2 h-2 rounded-full',
                  s.variant === 'gold' && 'bg-gold-400',
                  s.variant === 'accent' && 'bg-green-400',
                  s.variant === 'warm' && 'bg-amber-400',
                  s.variant === 'danger' && 'bg-red-400',
                  s.variant === 'neutral' && 'bg-neutral-400',
                )} />
                {s.label}
                {filters.statut === s.value && <CheckCircle2 size={14} className="ml-auto text-gold-500" />}
              </span>
            </DropdownItem>
          ))}
        </Dropdown>

        {/* Tri */}
        <Dropdown
          trigger={
            <Button variant="outline-gold" size="sm" className="justify-between min-w-[120px]" leftIcon={<ArrowUpDown size={14} />}>
              <span className="hidden sm:inline truncate max-w-[80px]">{currentSort.label}</span>
              <span className="sm:hidden">Tri</span>
              <ChevronDown size={14} className="ml-1 opacity-70" />
            </Button>
          }
          align="left"
        >
          {SORT_OPTIONS.map(opt => (
            <DropdownItem key={opt.value} onClick={() => setFilter('sortBy', opt.value)}>
              {opt.label}
              {filters.sortBy === opt.value && <CheckCircle2 size={14} className="ml-auto text-gold-500" />}
            </DropdownItem>
          ))}
        </Dropdown>

        {/* Bouton plus de filtres */}
        <Tooltip content="Filtres avancés">
          <Button
            variant={showMore ? 'gold' : 'outline-gold'}
            size="sm"
            onClick={() => setShowMore(!showMore)}
            leftIcon={<Filter size={14} />}
          >
            {activeCount > 0 && <Badge variant="gold" size="sm" className="ml-1 -mr-1 px-1.5">{activeCount}</Badge>}
          </Button>
        </Tooltip>

        {/* Réinitialiser */}
        {activeCount > 0 && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
            >
              <Button variant="ghost" size="sm" onClick={resetAll} leftIcon={<RefreshCw size={14} />} className="text-gold-600 dark:text-gold-400">
                <span className="hidden sm:inline">Réinitialiser</span>
              </Button>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Compteur */}
        {totalOrders >= 0 && (
          <div className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            {loading ? '...' : `${totalOrders} commande${totalOrders > 1 ? 's' : ''}`}
          </div>
        )}
      </div>

      {/* Filtres avancés */}
      <AnimatePresence>
        {showMore && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-4 pb-2 px-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Date début */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Date début</label>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={e => setFilter('dateFrom', e.target.value)}
                    variant="glass"
                    size="sm"
                    rightIcon={<Calendar size={14} className="text-muted-foreground" />}
                  />
                </div>
                {/* Date fin */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Date fin</label>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={e => setFilter('dateTo', e.target.value)}
                    variant="glass"
                    size="sm"
                    rightIcon={<Calendar size={14} className="text-muted-foreground" />}
                  />
                </div>
                {/* Montant min */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Montant min (FC)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={filters.minTotal}
                    onChange={e => setFilter('minTotal', e.target.value)}
                    variant="glass"
                    size="sm"
                    rightIcon={<DollarSign size={14} className="text-muted-foreground" />}
                  />
                </div>
                {/* Montant max */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Montant max (FC)</label>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filters.maxTotal}
                    onChange={e => setFilter('maxTotal', e.target.value)}
                    variant="glass"
                    size="sm"
                    rightIcon={<DollarSign size={14} className="text-muted-foreground" />}
                  />
                </div>
              </div>

              {/* Presets de date */}
              <div className="flex flex-wrap gap-2">
                {DATE_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => onChange(preset.getValue())}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-card border border-border hover:border-gold-400 hover:bg-gold-400/5 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Badges des filtres actifs */}
      <AnimatePresence>
        {activeCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-1.5 pt-2 overflow-hidden"
          >
            {filters.statut !== 'all' && (
              <Badge variant="gold" size="sm" style="soft" className="cursor-pointer" onClick={() => setFilter('statut', 'all')}>
                {currentStatut.label} <X size={12} className="ml-1 inline" />
              </Badge>
            )}
            {filters.dateFrom && (
              <Badge variant="gold" size="sm" style="soft" className="cursor-pointer" onClick={() => setFilter('dateFrom', '')}>
                À partir du {filters.dateFrom} <X size={12} className="ml-1 inline" />
              </Badge>
            )}
            {filters.dateTo && (
              <Badge variant="gold" size="sm" style="soft" className="cursor-pointer" onClick={() => setFilter('dateTo', '')}>
                Jusqu'au {filters.dateTo} <X size={12} className="ml-1 inline" />
              </Badge>
            )}
            {filters.minTotal && (
              <Badge variant="gold" size="sm" style="soft" className="cursor-pointer" onClick={() => setFilter('minTotal', '')}>
                Min {Number(filters.minTotal).toLocaleString()} FC <X size={12} className="ml-1 inline" />
              </Badge>
            )}
            {filters.maxTotal && (
              <Badge variant="gold" size="sm" style="soft" className="cursor-pointer" onClick={() => setFilter('maxTotal', '')}>
                Max {Number(filters.maxTotal).toLocaleString()} FC <X size={12} className="ml-1 inline" />
              </Badge>
            )}
            <button onClick={resetAll} className="text-xs text-gold-600 hover:text-gold-500 underline">
              Tout effacer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}