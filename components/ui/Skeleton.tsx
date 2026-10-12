// components/ui/Skeleton.tsx
import React from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types & Variantes premium                                          */
/* ------------------------------------------------------------------ */

type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded'
type SkeletonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant
  size?: SkeletonSize
  width?: string | number
  height?: string | number
  /** Active l'effet shimmer (dégradé animé) */
  shimmer?: boolean
  /** Variante de shimmer : 'default' ou 'gold' (pour les éléments premium) */
  shimmerVariant?: 'default' | 'gold'
  /** Nombre de lignes (pour le variant 'text') */
  lines?: number
  /** Espacement entre les lignes */
  gap?: number
  /** Alignement du contenu (utile pour les squelettes de carte) */
  align?: 'left' | 'center' | 'right'
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const sizeMap: Record<SkeletonSize, string> = {
  xs: 'h-2.5',
  sm: 'h-3',
  md: 'h-4',
  lg: 'h-5',
  xl: 'h-6',
  '2xl': 'h-8',
}

const shapeClasses: Record<SkeletonVariant, string> = {
  text: 'rounded',
  circular: 'rounded-full',
  rectangular: 'rounded-xl',
  rounded: 'rounded-2xl',
}

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      className,
      variant = 'rectangular',
      size = 'md',
      width,
      height,
      shimmer = true,
      shimmerVariant = 'default',
      lines = 1,
      gap = 2,
      align = 'left',
      ...props
    },
    ref
  ) => {
    const containerStyles: React.CSSProperties = {
      width: width ?? (variant === 'text' ? '100%' : undefined),
      height:
        height ??
        (variant === 'text'
          ? undefined
          : variant === 'circular'
            ? width ?? '3rem'
            : 'auto'),
      ...(align === 'center' && { marginLeft: 'auto', marginRight: 'auto' }),
      ...(align === 'right' && { marginLeft: 'auto' }),
    }

    // Déterminer les couleurs du shimmer selon la variante
    const shimmerColors = shimmerVariant === 'gold'
      ? 'from-transparent via-gold-300/20 dark:via-gold-500/15 to-transparent'
      : 'from-transparent via-white/20 dark:via-white/5 to-transparent'

    // Renforcer l'effet shimmer avec une animation plus fluide et élégante
    const shimmerOverlay = (
      <div
        className={cn(
          'absolute inset-0 -translate-x-full',
          'animate-[shimmer_2.5s_ease-in-out_infinite]',
          'bg-gradient-to-r',
          shimmerColors
        )}
        style={{
          backgroundSize: '200% 100%',
        }}
      />
    )

    // Si plusieurs lignes (uniquement pour variant 'text')
    if (variant === 'text' && lines > 1) {
      return (
        <div
          ref={ref}
          className={cn('flex flex-col', className)}
          style={{ gap: `${gap * 0.25}rem` }}
          {...props}
        >
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'relative overflow-hidden',
                'bg-neutral-200 dark:bg-midnight-700/40',
                shapeClasses[variant],
                sizeMap[size],
                shimmer && 'overflow-hidden'
              )}
              style={{
                width:
                  i === lines - 1 && lines > 1
                    ? `${100 - Math.random() * 30}%`
                    : undefined,
              }}
            >
              {shimmer && shimmerOverlay}
              {/* Bordure subtile en mode sombre pour mieux distinguer */}
              <div className="absolute inset-0 border border-neutral-300/10 dark:border-midnight-500/10 rounded-inherit pointer-events-none" />
            </div>
          ))}
        </div>
      )
    }

    // Variante unique
    return (
      <div
        ref={ref}
        className={cn(
          'relative',
          'bg-neutral-200 dark:bg-midnight-700/40',
          shapeClasses[variant],
          sizeMap[size],
          shimmer && 'overflow-hidden',
          className
        )}
        style={containerStyles}
        {...props}
      >
        {shimmer && shimmerOverlay}
        {/* Bordure subtile en mode sombre pour mieux distinguer */}
        <div className="absolute inset-0 border border-neutral-300/10 dark:border-midnight-500/10 rounded-inherit pointer-events-none" />
      </div>
    )
  }
)

Skeleton.displayName = 'Skeleton'

export { Skeleton }
export type { SkeletonProps, SkeletonVariant, SkeletonSize }
