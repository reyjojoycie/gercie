// components/BadgeFidelite.tsx
'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Medal, Star, Award, Crown, Gem, Sparkles } from 'lucide-react'

type FideliteLevel = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

interface BadgeFideliteProps {
  level: FideliteLevel
  points?: number
  /** Affiche les points à côté du badge */
  showPoints?: boolean
  /** Variante d'affichage : badge compact ou carte détaillée */
  variant?: 'badge' | 'card'
  /** Affiche un tooltip avec les avantages */
  withTooltip?: boolean
  className?: string
}

const levelConfig: Record<
  FideliteLevel,
  {
    label: string
    icon: React.ComponentType<{ size?: number; className?: string }>
    variant: 'neutral' | 'warm' | 'brand' | 'accent' | 'luxury'
    color: string
    benefits: string[]
  }
> = {
  none: {
    label: 'Nouveau',
    icon: Sparkles,
    variant: 'neutral',
    color: 'text-neutral-500',
    benefits: ['Accès à la plateforme'],
  },
  bronze: {
    label: 'Bronze',
    icon: Medal,
    variant: 'warm',
    color: 'text-warm-600',
    benefits: ['Retours gratuits sous 14 jours', 'Support prioritaire'],
  },
  silver: {
    label: 'Silver',
    icon: Star,
    variant: 'brand',
    color: 'text-brand-600',
    benefits: ['Livraison offerte dès 30$', 'Retours gratuits sous 30 jours'],
  },
  gold: {
    label: 'Gold',
    icon: Award,
    variant: 'accent',
    color: 'text-accent-600',
    benefits: ['Livraison express gratuite', 'Offres exclusives', 'Service client dédié'],
  },
  platinum: {
    label: 'Platinum',
    icon: Crown,
    variant: 'luxury',
    color: 'text-luxury-600',
    benefits: ['Tout Gold +', 'Accès avant-première', 'Cadeau d’anniversaire'],
  },
  diamond: {
    label: 'Diamond',
    icon: Gem,
    variant: 'luxury',
    color: 'text-luxury-600',
    benefits: ['Tout Platinum +', 'Conciergerie personnelle', 'Événements VIP'],
  },
}

export const BadgeFidelite: React.FC<BadgeFideliteProps> = ({
  level = 'none',
  points = 0,
  showPoints = false,
  variant = 'badge',
  withTooltip = false,
  className,
}) => {
  const config = levelConfig[level]
  const Icon = config.icon

  const badgeContent = (
    <motion.div
      whileHover={variant === 'badge' ? { scale: 1.05 } : undefined}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      <Badge
        variant={config.variant}
        size="sm"
        style={level === 'diamond' || level === 'platinum' ? 'gradient' : 'soft'}
        leftIcon={<Icon size={14} className={config.color} />}
      >
        {config.label}
      </Badge>
      {showPoints && points > 0 && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
          {points.toLocaleString()} pts
        </span>
      )}
    </motion.div>
  )

  if (variant === 'card') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 p-4 shadow-card',
          className
        )}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className={cn('p-2 rounded-xl bg-neutral-100 dark:bg-neutral-700', config.color)}>
            <Icon size={24} />
          </div>
          <div>
            <p className="font-bold text-neutral-900 dark:text-neutral-100">
              Niveau {config.label}
            </p>
            {points > 0 && (
              <p className="text-sm text-neutral-500">{points.toLocaleString()} points</p>
            )}
          </div>
        </div>
        <ul className="space-y-1 mt-3">
          {config.benefits.map((benefit, idx) => (
            <li
              key={idx}
              className="text-xs text-neutral-600 dark:text-neutral-400 flex items-start gap-1.5"
            >
              <Sparkles size={12} className="mt-0.5 text-brand-500" />
              {benefit}
            </li>
          ))}
        </ul>
      </motion.div>
    )
  }

  // Badge simple avec tooltip optionnel
  if (withTooltip) {
    return (
      <Tooltip
        content={
          <div className="text-xs">
            <p className="font-semibold mb-1">Niveau {config.label}</p>
            <ul className="space-y-0.5">
              {config.benefits.map((b, i) => (
                <li key={i} className="flex items-center gap-1">
                  <Sparkles size={10} /> {b}
                </li>
              ))}
            </ul>
          </div>
        }
        position="bottom"
        variant="luxury"
      >
        {badgeContent}
      </Tooltip>
    )
  }

  return badgeContent
}
