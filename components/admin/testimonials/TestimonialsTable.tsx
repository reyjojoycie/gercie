// components/admin/testimonials/TestimonialsTable.tsx
'use client'

import { useState, useCallback, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Star,
  MessageCircle,
  Edit,
  Trash2,
  Pin,
  PinOff,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export interface TestimonialAdmin {
  id: string
  name: string
  role?: string
  avatar?: string
  text: string
  rating: number
  date: string
  produit?: string
  verified: boolean
  likes: number
  status: 'pending' | 'published' | 'rejected'
  admin_response?: string
  is_featured: boolean
  user_id?: string
  created_at: string
  updated_at: string
}

export type SortField = 'name' | 'rating' | 'date' | 'status' | 'likes'
export type SortOrder = 'asc' | 'desc'

export interface ColumnVisibility {
  name: boolean
  text: boolean
  rating: boolean
  produit: boolean
  status: boolean
  featured: boolean
  actions: boolean
}

interface TestimonialsTableProps {
  testimonials: TestimonialAdmin[]
  isLoading: boolean
  sortField: SortField
  sortOrder: SortOrder
  onSort: (field: SortField) => void
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onEdit: (testimonial: TestimonialAdmin) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: 'published' | 'rejected' | 'pending') => void
  onToggleFeatured: (id: string, current: boolean) => void
  onReply: (testimonial: TestimonialAdmin) => void
  // Proactive additions
  disabledActions?: Set<string> // ids for which actions should be disabled
  compact?: boolean
  emptyMessage?: string
}

// -----------------------------------------------------------------------------
// Internal components
// -----------------------------------------------------------------------------

const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    published: { label: 'Publié', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    pending: { label: 'En attente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    rejected: { label: 'Rejeté', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  }
  const { label, color } = statusConfig[status] || { label: status, color: '' }
  return <Badge className={cn('text-xs whitespace-nowrap', color)}>{label}</Badge>
})

const SortIcon = memo(function SortIcon({ field, currentField, order }: { field: SortField; currentField: SortField; order: SortOrder }) {
  if (field !== currentField) return <ArrowUpDown size={12} className="inline ml-1 opacity-40" />
  return order === 'asc' ? <ArrowUp size={12} className="inline ml-1 text-gold-500" /> : <ArrowDown size={12} className="inline ml-1 text-gold-500" />
})

function TableRow({
  testimonial,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onStatusChange,
  onToggleFeatured,
  onReply,
  disabledActions,
  compact
}: {
  testimonial: TestimonialAdmin
  selected: boolean
  onToggleSelect: (id: string) => void
  onEdit: (t: TestimonialAdmin) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: 'published' | 'rejected' | 'pending') => void
  onToggleFeatured: (id: string, current: boolean) => void
  onReply: (t: TestimonialAdmin) => void
  disabledActions?: Set<string>
  compact?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isDisabled = disabledActions?.has(testimonial.id) ?? false

  const handleAction = (callback: () => void) => {
    if (!isDisabled) callback()
    setMenuOpen(false)
  }

  const actions = (
    <div className="flex items-center gap-1">
      <Tooltip content="Modifier">
        <button
          onClick={() => handleAction(() => onEdit(testimonial))}
          disabled={isDisabled}
          className="p-1.5 rounded-lg hover:bg-gold-400/10 text-muted-foreground hover:text-gold-500 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Edit size={15} />
        </button>
      </Tooltip>
      <Tooltip content="Répondre">
        <button
          onClick={() => handleAction(() => onReply(testimonial))}
          disabled={isDisabled}
          className="p-1.5 rounded-lg hover:bg-gold-400/10 text-muted-foreground hover:text-gold-500 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <MessageCircle size={15} />
        </button>
      </Tooltip>
      <Tooltip content={testimonial.is_featured ? 'Ne plus mettre en avant' : 'Mettre en avant'}>
        <button
          onClick={() => handleAction(() => onToggleFeatured(testimonial.id, testimonial.is_featured))}
          disabled={isDisabled}
          className="p-1.5 rounded-lg hover:bg-gold-400/10 text-muted-foreground hover:text-gold-500 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {testimonial.is_featured ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
      </Tooltip>
      <select
        value={testimonial.status}
        onChange={e => onStatusChange(testimonial.id, e.target.value as any)}
        disabled={isDisabled}
        className="bg-card border border-border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold-400 disabled:opacity-30"
      >
        <option value="published">Publié</option>
        <option value="pending">En attente</option>
        <option value="rejected">Rejeté</option>
      </select>
      <Tooltip content="Supprimer">
        <button
          onClick={() => handleAction(() => onDelete(testimonial.id))}
          disabled={isDisabled}
          className="p-1.5 rounded-lg hover:bg-red-400/10 text-muted-foreground hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 size={15} />
        </button>
      </Tooltip>
    </div>
  )

  const compactActions = (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="p-1.5 rounded-lg hover:bg-gold-400/10 text-muted-foreground"
      >
        <MoreHorizontal size={16} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 bg-card rounded-xl shadow-strong border border-border z-10 py-1 w-44">
          <button onClick={() => handleAction(() => onEdit(testimonial))} className="w-full text-left px-3 py-2 text-sm hover:bg-gold-400/5 flex items-center gap-2">
            <Edit size={14} /> Modifier
          </button>
          <button onClick={() => handleAction(() => onReply(testimonial))} className="w-full text-left px-3 py-2 text-sm hover:bg-gold-400/5 flex items-center gap-2">
            <MessageCircle size={14} /> Répondre
          </button>
          <button onClick={() => handleAction(() => onToggleFeatured(testimonial.id, testimonial.is_featured))} className="w-full text-left px-3 py-2 text-sm hover:bg-gold-400/5 flex items-center gap-2">
            {testimonial.is_featured ? <PinOff size={14} /> : <Pin size={14} />} {testimonial.is_featured ? 'Retirer' : 'Mettre en avant'}
          </button>
          <hr className="my-1 border-border" />
          <button onClick={() => onStatusChange(testimonial.id, 'published')} className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-500" /> Publier
          </button>
          <button onClick={() => onStatusChange(testimonial.id, 'pending')} className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500" /> En attente
          </button>
          <button onClick={() => onStatusChange(testimonial.id, 'rejected')} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
            <X size={14} className="text-red-500" /> Rejeter
          </button>
          <hr className="my-1 border-border" />
          <button onClick={() => handleAction(() => onDelete(testimonial.id))} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2">
            <Trash2 size={14} /> Supprimer
          </button>
        </div>
      )}
    </div>
  )

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="border-b border-border hover:bg-gold-400/5 transition-colors"
    >
      <td className="px-4 py-3 w-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(testimonial.id)}
          className="rounded border-gray-300 text-gold-500 focus:ring-gold-400"
          aria-label={`Sélectionner ${testimonial.name}`}
        />
      </td>
      <td className="px-4 py-3 font-medium text-sm whitespace-nowrap">
        {testimonial.name}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[240px] truncate" title={testimonial.text}>
        « {testimonial.text} »
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <Star size={14} className="text-amber-500 fill-amber-500" />
          <span className="text-sm font-medium">{testimonial.rating}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground text-center whitespace-nowrap">
        {testimonial.produit || '—'}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={testimonial.status} />
      </td>
      <td className="px-4 py-3 text-center">
        {testimonial.is_featured ? <Pin size={14} className="text-gold-500 inline" /> : null}
      </td>
      <td className="px-4 py-3">
        {compact ? compactActions : actions}
      </td>
    </motion.tr>
  )
}

// -----------------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------------
export const TestimonialsTable = memo(function TestimonialsTable({
  testimonials,
  isLoading,
  sortField,
  sortOrder,
  onSort,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
  onStatusChange,
  onToggleFeatured,
  onReply,
  disabledActions,
  compact = false,
  emptyMessage = 'Aucun témoignage trouvé'
}: TestimonialsTableProps) {
  const headers: { field: SortField; label: string; className?: string }[] = useMemo(
    () => [
      { field: 'name', label: 'Nom' },
      { field: 'name', label: 'Texte' }, // not sortable by text, using placeholder
      { field: 'rating', label: 'Note', className: 'text-center' },
      { field: 'name', label: 'Produit', className: 'text-center' },
      { field: 'status', label: 'Statut', className: 'text-center' },
      { field: 'name', label: 'En avant', className: 'text-center' },
      { field: 'name', label: 'Actions' }
    ],
    []
  )

  const allSelected = testimonials.length > 0 && selected.size === testimonials.length

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left" role="table">
          <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="rounded border-gray-300"
                  aria-label="Tout sélectionner"
                />
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gold-500 select-none"
                onClick={() => onSort('name')}
                role="columnheader"
                aria-sort={sortField === 'name' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Nom <SortIcon field="name" currentField={sortField} order={sortOrder} />
              </th>
              <th className="px-4 py-3">Texte</th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gold-500 text-center select-none"
                onClick={() => onSort('rating')}
                role="columnheader"
                aria-sort={sortField === 'rating' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Note <SortIcon field="rating" currentField={sortField} order={sortOrder} />
              </th>
              <th className="px-4 py-3 text-center">Produit</th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gold-500 text-center select-none"
                onClick={() => onSort('status')}
                role="columnheader"
                aria-sort={sortField === 'status' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Statut <SortIcon field="status" currentField={sortField} order={sortOrder} />
              </th>
              <th className="px-4 py-3 text-center">En avant</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton variant="text" className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : testimonials.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <MessageCircle size={40} className="mx-auto mb-3 text-neutral-300 dark:text-neutral-600" />
                  <p className="text-muted-foreground text-sm">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              <AnimatePresence>
                {testimonials.map((t) => (
                  <TableRow
                    key={t.id}
                    testimonial={t}
                    selected={selected.has(t.id)}
                    onToggleSelect={onToggleSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                    onToggleFeatured={onToggleFeatured}
                    onReply={onReply}
                    disabledActions={disabledActions}
                    compact={compact}
                  />
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
})

export default TestimonialsTable