// components/admin/testimonials/StatsCards.tsx
'use client'

import {
  CheckCircle2,
  Clock,
  MessageSquare,
  Pin,
  ShieldCheck,
  Star,
  ThumbsUp,
  XCircle,
} from 'lucide-react'

import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

import type { TestimonialStats } from '@/lib/testimonials'

interface StatsCardsProps {
  stats: TestimonialStats
  isLoading?: boolean
  onFilterClick?: (filter: { status?: string; featured?: string; verified?: string }) => void
}

function StatCard({
  title,
  value,
  icon,
  color,
  onClick,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-border bg-card p-4 text-left transition hover:border-gold-400/40 hover:shadow-gold focus:outline-none focus:ring-2 focus:ring-gold-500',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        </div>

        <div className={cn('rounded-xl p-2', color)}>{icon}</div>
      </div>
    </button>
  )
}

export function StatsCards({ stats, isLoading, onFilterClick }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <Skeleton variant="text" className="mb-2 h-4 w-20" />
            <Skeleton variant="text" className="h-8 w-16" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <StatCard
        title="Total"
        value={stats.total}
        icon={<MessageSquare size={18} className="text-foreground" />}
        color="bg-neutral-100 dark:bg-neutral-800"
        onClick={() => onFilterClick?.({ status: 'all' })}
      />

      <StatCard
        title="Publiés"
        value={stats.published}
        icon={<CheckCircle2 size={18} className="text-emerald-500" />}
        color="bg-emerald-500/10"
        onClick={() => onFilterClick?.({ status: 'published' })}
      />

      <StatCard
        title="En attente"
        value={stats.pending}
        icon={<Clock size={18} className="text-amber-500" />}
        color="bg-amber-500/10"
        onClick={() => onFilterClick?.({ status: 'pending' })}
      />

      <StatCard
        title="Rejetés"
        value={stats.rejected}
        icon={<XCircle size={18} className="text-red-500" />}
        color="bg-red-500/10"
        onClick={() => onFilterClick?.({ status: 'rejected' })}
      />

      <StatCard
        title="Archivés"
        value={stats.archived}
        icon={<Clock size={18} className="text-muted-foreground" />}
        color="bg-neutral-500/10"
        onClick={() => onFilterClick?.({ status: 'archived' })}
      />

      <StatCard
        title="Mis en avant"
        value={stats.featured}
        icon={<Pin size={18} className="text-gold-500" />}
        color="bg-gold-500/10"
        onClick={() => onFilterClick?.({ featured: 'true' })}
      />

      <StatCard
        title="Vérifiés"
        value={stats.verified}
        icon={<ShieldCheck size={18} className="text-blue-500" />}
        color="bg-blue-500/10"
        onClick={() => onFilterClick?.({ verified: 'true' })}
      />

      <StatCard
        title="Note moyenne"
        value={`${stats.avgRating}/5`}
        icon={<Star size={18} className="text-amber-500" />}
        color="bg-amber-500/10"
      />
    </div>
  )
}