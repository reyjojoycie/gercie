// components/admin/testimonials/StatsCards.tsx
'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  Star,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
export interface TestimonialStats {
  total: number
  pending: number
  published: number
  rejected: number
  avgRating: number
  fiveStars?: number // nombre de notes 5 étoiles
  // variations par rapport au mois précédent (optionnelles)
  prevTotal?: number
  prevPending?: number
  prevPublished?: number
  prevRejected?: number
  prevAvgRating?: number
}

interface StatsCardsProps {
  stats: TestimonialStats
  isLoading?: boolean
  /** Callback quand une carte est cliquée (pour filtrer rapidement) */
  onFilterClick?: (filter: { status?: string; minRating?: number }) => void
  /** Liste des cartes à afficher (défaut : toutes) */
  visibleCards?: Array<'total' | 'pending' | 'published' | 'rejected' | 'avgRating'>
  /** Mode compact (moins de padding) */
  compact?: boolean
  /** Animation de comptage (non implémentée ici, placeholder) */
  animateCount?: boolean
}

/* ========================================================================== */
/*  Composant interne pour une carte                                           */
/* ========================================================================== */
interface StatCardData {
  key: string
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  trend?: number // positif = hausse, négatif = baisse
  description?: string // tooltip supplémentaire
}

const TrendIcon = ({ trend }: { trend?: number }) => {
  if (trend === undefined || trend === 0) return <Minus size={12} className="text-neutral-400" />
  if (trend > 0) return <TrendingUp size={12} className="text-green-500" />
  return <TrendingDown size={12} className="text-red-500" />
}

const StatCard = memo(function StatCard({
  card,
  onClick,
  compact
}: {
  card: StatCardData
  onClick?: () => void
  compact?: boolean
}) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2, scale: 1.02 }}
      className={cn(
        'bg-card rounded-xl border border-border shadow-sm transition-all duration-200',
        onClick && 'cursor-pointer hover:border-gold-400/40 hover:shadow-md',
        compact ? 'p-3' : 'p-4'
      )}
      onClick={onClick}
      role={onClick ? 'button' : 'article'}
      aria-label={`${card.label}: ${card.value}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <card.icon size={compact ? 16 : 18} className={cn('flex-shrink-0', card.color)} />
        <span className="text-xs text-muted-foreground truncate">{card.label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('font-bold text-foreground', compact ? 'text-xl' : 'text-2xl')}>
          {card.value}
        </span>
        {card.trend !== undefined && (
          <span className="inline-flex items-center gap-0.5 text-xs">
            <TrendIcon trend={card.trend} />
            {card.trend !== 0 && (
              <span className={card.trend > 0 ? 'text-green-600' : 'text-red-600'}>
                {Math.abs(card.trend)}%
              </span>
            )}
          </span>
        )}
      </div>
    </motion.div>
  )

  if (card.description) {
    return (
      <Tooltip content={card.description}>
        {content}
      </Tooltip>
    )
  }

  return content
})

/* ========================================================================== */
/*  Squelettes de chargement                                                   */
/* ========================================================================== */
const SkeletonCards = ({ count, compact }: { count: number; compact?: boolean }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className={cn(
          'bg-card rounded-xl border border-border shadow-sm',
          compact ? 'p-3' : 'p-4'
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <Skeleton variant="circular" className="w-8 h-8" />
          <Skeleton variant="text" className="w-16 h-4" />
        </div>
        <Skeleton variant="text" className="w-20 h-6" />
      </div>
    ))}
  </>
)

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */
export const StatsCards = memo(function StatsCards({
  stats,
  isLoading = false,
  onFilterClick,
  visibleCards,
  compact = false,
  animateCount: _animateCount = false // réservé pour future implémentation de compteur animé
}: StatsCardsProps) {
  // Fonction utilitaire : calcul du % de variation (si données précédentes)
  const calcTrend = (current: number, previous?: number): number | undefined => {
    if (previous === undefined || previous === 0) return undefined
    return Math.round(((current - previous) / previous) * 100)
  }

  // Construction des cartes avec tooltips détaillés
  const cards: StatCardData[] = [
    {
      key: 'total',
      label: 'Total',
      value: stats.total,
      icon: MessageCircle,
      color: 'text-gold-500',
      trend: calcTrend(stats.total, stats.prevTotal),
      description: `Total des témoignages : ${stats.published} publiés, ${stats.pending} en attente, ${stats.rejected} rejetés`
    },
    {
      key: 'pending',
      label: 'En attente',
      value: stats.pending,
      icon: AlertTriangle,
      color: 'text-amber-500',
      trend: calcTrend(stats.pending, stats.prevPending),
      description: `${stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0}% du total`
    },
    {
      key: 'published',
      label: 'Publiés',
      value: stats.published,
      icon: CheckCircle2,
      color: 'text-green-500',
      trend: calcTrend(stats.published, stats.prevPublished),
      description: `${stats.total > 0 ? Math.round((stats.published / stats.total) * 100) : 0}% du total`
    },
    {
      key: 'rejected',
      label: 'Rejetés',
      value: stats.rejected,
      icon: X,
      color: 'text-red-500',
      trend: calcTrend(stats.rejected, stats.prevRejected),
      description: `${stats.total > 0 ? Math.round((stats.rejected / stats.total) * 100) : 0}% du total`
    },
    {
      key: 'avgRating',
      label: 'Note moyenne',
      value: stats.total > 0 ? stats.avgRating.toFixed(1) : '—',
      icon: Star,
      color: stats.avgRating >= 4 ? 'text-gold-500' : stats.avgRating >= 3 ? 'text-amber-500' : 'text-red-500',
      trend: calcTrend(stats.avgRating, stats.prevAvgRating),
      description: stats.fiveStars !== undefined
        ? `${stats.fiveStars} avis à 5 étoiles (${stats.total > 0 ? Math.round((stats.fiveStars / stats.total) * 100) : 0}%)`
        : undefined
    }
  ]

  // Filtrer selon les cartes visibles
  const displayedCards = visibleCards
    ? cards.filter(c => visibleCards.includes(c.key as any))
    : cards

  if (isLoading) {
    return (
      <div className={cn(
        'grid gap-4',
        compact
          ? 'grid-cols-2 sm:grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
      )}>
        <SkeletonCards count={displayedCards.length} compact={compact} />
      </div>
    )
  }

  return (
    <div className={cn(
      'grid gap-4',
      compact
        ? 'grid-cols-2 sm:grid-cols-3'
        : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
    )}>
      {displayedCards.map(card => (
        <StatCard
          key={card.key}
          card={card}
          compact={compact}
          onClick={
            onFilterClick
              ? () => {
                  if (card.key === 'pending') onFilterClick({ status: 'pending' })
                  else if (card.key === 'published') onFilterClick({ status: 'published' })
                  else if (card.key === 'rejected') onFilterClick({ status: 'rejected' })
                  else if (card.key === 'avgRating') onFilterClick({ minRating: 5 }) // ex: clic sur note → 5 étoiles
                  // pour 'total', on enlève tout filtre (non implémenté ici mais possible)
                  else onFilterClick({})
                }
              : undefined
          }
        />
      ))}
    </div>
  )
})

export default StatsCards