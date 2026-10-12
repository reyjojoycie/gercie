// components/admin/StatsCard.tsx
'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

type StatsCardVariant = 'default' | 'gradient' | 'glass' | 'minimal'
type StatsCardSize = 'sm' | 'md' | 'lg'

interface StatsCardProps {
  /** Titre de la carte (ex: "Ventes du jour") */
  title: string
  /** Valeur principale (texte ou nombre formaté) */
  value: string | number
  /** Icône Lucide (ou composant React) */
  icon?: LucideIcon | React.ReactNode
  /** Sous‑titre descriptif optionnel */
  subtitle?: string
  /** Variation en pourcentage (positif = hausse, négatif = baisse) */
  variation?: number
  /** Libellé de la variation (ex: "vs mois dernier") */
  variationLabel?: string
  /** Couleur de fond personnalisée (classe Tailwind) */
  bgClass?: string
  /** Couleur du texte */
  textClass?: string
  /** Lien vers une page détaillée */
  href?: string
  /** Variante de style */
  variant?: StatsCardVariant
  /** Taille */
  size?: StatsCardSize
  /** État de chargement */
  loading?: boolean
  /** Erreur éventuelle */
  error?: string
  /** Callback au clic (si pas de href) */
  onClick?: () => void
  /** Tooltip au survol */
  tooltip?: string
  /** Enfants personnalisés (remplace value + subtitle) */
  children?: React.ReactNode
  /** Graphique sparkline intégré (composant React) */
  sparkline?: React.ReactNode
  /** Classes additionnelles */
  className?: string
}

/* ========================================================================== */
/*  Mappings                                                                   */
/* ========================================================================== */

const variantClasses: Record<StatsCardVariant, string> = {
  default:
    'bg-card border border-border shadow-card hover:shadow-card-hover',
  gradient:
    'bg-gradient-to-br from-gold-500 to-gold-700 text-white border-0 shadow-gold',
  glass:
    'bg-white/70 dark:bg-midnight-800/60 backdrop-blur-xl border border-gold-400/20 shadow-card',
  minimal:
    'bg-transparent border-0 shadow-none',
}

const sizeClasses: Record<StatsCardSize, string> = {
  sm: 'p-3 gap-2',
  md: 'p-5 gap-4',
  lg: 'p-6 gap-5',
}

/* ========================================================================== */
/*  Composant StatsCard                                                        */
/* ========================================================================== */

export function StatsCard({
  title,
  value,
  icon: Icon,
  subtitle,
  variation,
  variationLabel,
  bgClass,
  textClass,
  href,
  variant = 'default',
  size = 'md',
  loading = false,
  error,
  onClick,
  tooltip,
  children,
  sparkline,
  className,
}: StatsCardProps) {
  const isGradient = variant === 'gradient'

  // Déterminer la direction de la variation
  const variationDirection =
    variation !== undefined ? (variation >= 0 ? 'up' : 'down') : null

  const VariationIcon = variationDirection === 'up' ? TrendingUp : TrendingDown

  // Contenu de la carte (hors loading / error)
  const content = (
    <div
      className={cn(
        'rounded-2xl overflow-hidden transition-all',
        variantClasses[variant],
        isGradient && bgClass,
        !isGradient && textClass,
        sizeClasses[size],
        'flex items-center justify-between',
        className,
      )}
    >
      {/* Partie gauche */}
      <div className="flex flex-col min-w-0">
        <p
          className={cn(
            'text-xs font-medium uppercase tracking-wider',
            isGradient ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          {title}
        </p>

        {/* Valeur ou enfants */}
        {children ? (
          children
        ) : (
          <>
            <p
              className={cn(
                'font-bold mt-1',
                size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-2xl',
                isGradient ? 'text-white' : 'text-foreground',
              )}
            >
              {value}
            </p>
            {subtitle && (
              <p className={cn('text-xs mt-1', isGradient ? 'text-white/60' : 'text-muted-foreground')}>
                {subtitle}
              </p>
            )}
          </>
        )}

        {/* Variation */}
        {variation !== undefined && variationDirection && (
          <div className="flex items-center gap-1 mt-2">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold',
                variation >= 0
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              )}
            >
              <VariationIcon size={12} />
              {Math.abs(variation).toFixed(1)}%
            </span>
            {variationLabel && (
              <span className={cn('text-xs', isGradient ? 'text-white/50' : 'text-muted-foreground')}>
                {variationLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Partie droite : icône + sparkline */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {Icon && (
          <div
            className={cn(
              'p-3 rounded-full',
              isGradient
                ? 'bg-white/20'
                : 'bg-gold-100 dark:bg-gold-900/30',
            )}
          >
            {typeof Icon === 'function' ? (
              <Icon
                size={size === 'sm' ? 18 : size === 'lg' ? 28 : 22}
                className={isGradient ? 'text-white' : 'text-gold-500'}
              />
            ) : (
              Icon
            )}
          </div>
        )}
        {sparkline && <div>{sparkline}</div>}
      </div>
    </div>
  )

  // Gestion du clic et du lien
  const clickableProps = href ? { href } : onClick ? { onClick } : {}
  const Wrapper = href ? 'a' : 'button'

  const finalContent = (
    <Wrapper
      {...(clickableProps as any)}
      className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 rounded-2xl"
    >
      {content}
    </Wrapper>
  )

  // États de chargement et d'erreur
  if (loading) {
    return (
      <div className={cn('rounded-2xl overflow-hidden', sizeClasses[size], className)}>
        <div className="flex items-center justify-between">
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" className="w-24 h-4" shimmer shimmerVariant="gold" />
            <Skeleton variant="text" className="w-32 h-6" shimmer shimmerVariant="gold" />
            {variation !== undefined && (
              <Skeleton variant="text" className="w-16 h-4" shimmer shimmerVariant="gold" />
            )}
          </div>
          <Skeleton variant="circular" className="w-10 h-10" shimmer shimmerVariant="gold" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-2xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600', className)}>
        <p>{error}</p>
      </div>
    )
  }

  // Tooltip wrapper
  if (tooltip) {
    return <Tooltip content={tooltip}>{finalContent}</Tooltip>
  }

  return finalContent
}

/* ========================================================================== */
/*  StatsCardGroup – conteneur pour aligner plusieurs StatsCard               */
/* ========================================================================== */

interface StatsCardGroupProps {
  children: React.ReactNode
  columns?: 2 | 3 | 4 | 5 | 6
  className?: string
}

export function StatsCardGroup({
  children,
  columns = 4,
  className,
}: StatsCardGroupProps) {
  const colsClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
    6: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  }[columns]

  return (
    <div className={cn('grid gap-4 md:gap-6', colsClass, className)}>
      {children}
    </div>
  )
}