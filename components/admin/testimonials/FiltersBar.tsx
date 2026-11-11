// components/admin/testimonials/FiltersBar.tsx
'use client'

import { ArrowDown, ArrowUp, Download, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/Button'

import {
  RATING_OPTIONS,
  SORT_FIELD_OPTIONS,
  STATUS_OPTIONS,
  type TestimonialFilters,
} from '@/lib/testimonials'

interface FiltersBarProps {
  filters: TestimonialFilters
  onFiltersChange: (filters: TestimonialFilters) => void
  sortField: string
  sortOrder: 'asc' | 'desc'
  onSortChange: (field: any, order: 'asc' | 'desc') => void
  totalResults: number
  onAdd: () => void
  onExport: () => void
  productSuggestions?: string[]
}

export function FiltersBar({
  filters,
  onFiltersChange,
  sortField,
  sortOrder,
  onSortChange,
  totalResults,
  onAdd,
  onExport,
  productSuggestions = [],
}: FiltersBarProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={filters.search}
              onChange={(event) =>
                onFiltersChange({ ...filters, search: event.target.value })
              }
              placeholder="Rechercher un avis, un client, un produit..."
              className="w-full rounded-xl border border-border bg-background/50 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          <select
            value={filters.status}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                status: event.target.value as any,
              })
            }
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filters.rating}
            onChange={(event) =>
              onFiltersChange({ ...filters, rating: event.target.value })
            }
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            {RATING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filters.verified}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                verified: event.target.value as any,
              })
            }
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="all">Tous vérifiés</option>
            <option value="true">Vérifiés</option>
            <option value="false">Non vérifiés</option>
          </select>

          <select
            value={filters.featured}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                featured: event.target.value as any,
              })
            }
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="all">Tous mis en avant</option>
            <option value="true">Mis en avant</option>
            <option value="false">Non mis en avant</option>
          </select>

          <div className="relative min-w-[180px]">
            <input
              value={filters.product}
              onChange={(event) =>
                onFiltersChange({ ...filters, product: event.target.value })
              }
              list="testimonial-product-suggestions"
              placeholder="Produit..."
              className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <datalist id="testimonial-product-suggestions">
              {productSuggestions.map((product) => (
                <option key={product} value={product} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {totalResults} résultat(s)
          </span>

          <select
            value={sortField}
            onChange={(event) => onSortChange(event.target.value as any, sortOrder)}
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            {SORT_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() =>
              onSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')
            }
            className="rounded-xl border border-border p-2.5 text-muted-foreground transition hover:border-gold-400/50 hover:text-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label="Inverser le tri"
          >
            {sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onExport}
            leftIcon={<Download size={14} />}
          >
            Export
          </Button>

          <Button
            variant="luxe"
            size="sm"
            onClick={onAdd}
            leftIcon={<Plus size={14} />}
          >
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  )
}