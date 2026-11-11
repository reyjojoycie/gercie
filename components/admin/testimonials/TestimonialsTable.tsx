// components/admin/testimonials/TestimonialsTable.tsx
'use client'

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Eye,
  MessageSquareReply,
  Pencil,
  Pin,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

import type { Testimonial, TestimonialStatus } from '@/lib/testimonials'

interface TestimonialsTableProps {
  testimonials: Testimonial[]
  isLoading?: boolean
  sortField: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onEdit: (item: Testimonial) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: TestimonialStatus) => void
  onToggleFeatured: (id: string, isFeatured: boolean) => void
  onReply: (item: Testimonial) => void
  disabledActions?: Set<string>
}

function StatusBadge({ status }: { status: TestimonialStatus }) {
  const config: Record<
    TestimonialStatus,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    published: {
      label: 'Publié',
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      icon: <CheckCircle2 size={12} />,
    },
    pending: {
      label: 'En attente',
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
      icon: <Clock size={12} />,
    },
    rejected: {
      label: 'Rejeté',
      className: 'bg-red-500/10 text-red-700 dark:text-red-300',
      icon: <XCircle size={12} />,
    },
    archived: {
      label: 'Archivé',
      className: 'bg-neutral-500/10 text-neutral-700 dark:text-neutral-300',
      icon: <Eye size={12} />,
    },
  }

  const item = config[status] || config.pending

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
        item.className
      )}
    >
      {item.icon}
      {item.label}
    </span>
  )
}

function SortHeader({
  label,
  field,
  sortField,
  sortOrder,
  onSort,
  className,
}: {
  label: string
  field: string
  sortField: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
  className?: string
}) {
  const isActive = sortField === field

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold uppercase transition hover:text-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500',
        isActive ? 'text-gold-600' : 'text-muted-foreground',
        className
      )}
    >
      {label}
      {isActive &&
        (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  )
}

export function TestimonialsTable({
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
}: TestimonialsTableProps) {
  const allSelected =
    testimonials.length > 0 &&
    testimonials.every((item) => selected.has(item.id))

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <Skeleton variant="text" className="mb-2 h-5 w-1/3" />
            <Skeleton variant="text" className="mb-2 h-4 w-2/3" />
            <Skeleton variant="text" className="h-4 w-1/4" />
          </div>
        ))}
      </div>
    )
  }

  if (testimonials.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background/30 p-10 text-center">
        <MessageSquareReply size={32} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Aucun témoignage trouvé</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Modifie les filtres ou ajoute un nouveau témoignage.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="hidden grid-cols-12 gap-3 border-b border-border bg-muted/30 px-4 py-3 lg:grid">
        <div className="col-span-1 flex items-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleSelectAll}
            className="h-4 w-4 rounded border-border"
          />
        </div>

        <div className="col-span-3">
          <SortHeader
            label="Client"
            field="name"
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={onSort}
          />
        </div>

        <div className="col-span-4">
          <SortHeader
            label="Avis"
            field="content"
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={onSort}
          />
        </div>

        <div className="col-span-1">
          <SortHeader
            label="Note"
            field="rating"
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={onSort}
          />
        </div>

        <div className="col-span-1">
          <SortHeader
            label="Statut"
            field="status"
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={onSort}
          />
        </div>

        <div className="col-span-2 text-right">Actions</div>
      </div>

      <div className="divide-y divide-border">
        {testimonials.map((item) => {
          const isSelected = selected.has(item.id)
          const isDisabled = disabledActions?.has(item.id)

          return (
            <div
              key={item.id}
              className={cn(
                'grid grid-cols-1 gap-3 px-4 py-4 transition lg:grid-cols-12 lg:items-start',
                isSelected && 'bg-gold-500/5'
              )}
            >
              <div className="flex items-start gap-3 lg:col-span-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(item.id)}
                  className="mt-1 h-4 w-4 rounded border-border"
                />
              </div>

              <div className="min-w-0 lg:col-span-3">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.name}
                  </p>

                  {item.verified && (
                    <Tooltip content="Achat vérifié">
                      <ShieldCheck size={14} className="shrink-0 text-blue-500" />
                    </Tooltip>
                  )}

                  {item.is_featured && (
                    <Tooltip content="Mis en avant">
                      <Pin size={14} className="shrink-0 text-gold-500" />
                    </Tooltip>
                  )}
                </div>

                {(item.role || item.produit) && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[item.role, item.produit].filter(Boolean).join(' • ')}
                  </p>
                )}

                <p className="mt-1 text-[10px] text-muted-foreground">
                  {item.date
                    ? new Date(item.date).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </p>
              </div>

              <div className="min-w-0 lg:col-span-4">
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  « {item.text} »
                </p>

                {item.admin_response && (
                  <div className="mt-2 rounded-xl border border-border bg-muted/30 p-2">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Réponse admin
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-foreground">
                      {item.admin_response}
                    </p>
                  </div>
                )}
              </div>

              <div className="text-sm text-muted-foreground lg:col-span-1">
                {item.rating.toFixed(1)}
              </div>

              <div className="lg:col-span-1">
                <StatusBadge status={item.status} />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1 lg:col-span-2">
                <Tooltip content="Modifier">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    disabled={isDisabled}
                    className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-gold-500 disabled:opacity-40"
                    aria-label="Modifier"
                  >
                    <Pencil size={14} />
                  </button>
                </Tooltip>

                <Tooltip content="Répondre">
                  <button
                    type="button"
                    onClick={() => onReply(item)}
                    disabled={isDisabled}
                    className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-blue-500 disabled:opacity-40"
                    aria-label="Répondre"
                  >
                    <MessageSquareReply size={14} />
                  </button>
                </Tooltip>

                <Tooltip content={item.is_featured ? 'Retirer de la mise en avant' : 'Mettre en avant'}>
                  <button
                    type="button"
                    onClick={() => onToggleFeatured(item.id, !item.is_featured)}
                    disabled={isDisabled}
                    className={cn(
                      'rounded-lg p-2 transition disabled:opacity-40',
                      item.is_featured
                        ? 'text-gold-500 hover:bg-gold-500/10'
                        : 'text-muted-foreground hover:bg-muted hover:text-gold-500'
                    )}
                    aria-label="Mis en avant"
                  >
                    <Pin size={14} />
                  </button>
                </Tooltip>

                {item.status !== 'published' && (
                  <Tooltip content="Publier">
                    <button
                      type="button"
                      onClick={() => onStatusChange(item.id, 'published')}
                      disabled={isDisabled}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-emerald-50 hover:text-emerald-500 disabled:opacity-40 dark:hover:bg-emerald-950/20"
                      aria-label="Publier"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  </Tooltip>
                )}

                {item.status !== 'rejected' && (
                  <Tooltip content="Rejeter">
                    <button
                      type="button"
                      onClick={() => onStatusChange(item.id, 'rejected')}
                      disabled={isDisabled}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/20"
                      aria-label="Rejeter"
                    >
                      <XCircle size={14} />
                    </button>
                  </Tooltip>
                )}

                <Tooltip content="Supprimer">
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    disabled={isDisabled}
                    className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/20"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}