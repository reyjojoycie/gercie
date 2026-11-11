// components/ui/Skeleton.tsx
'use client'

import React, { type CSSProperties, type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type SkeletonVariant =
  | 'text'
  | 'circular'
  | 'rectangular'
  | 'rounded'

export type SkeletonSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Forme du squelette.
   *
   * - `text` : ligne de texte
   * - `circular` : avatar / pastille
   * - `rectangular` : image / carte / bloc
   * - `rounded` : conteneur arrondi premium
   */
  variant?: SkeletonVariant

  /**
   * Taille sémantique.
   *
   * Pour `text`, contrôle la hauteur.
   * Pour `circular`, contrôle largeur + hauteur si aucune dimension explicite.
   * Pour `rectangular` / `rounded`, sert surtout de fallback si aucune taille n’est fournie.
   */
  size?: SkeletonSize

  /**
   * Largeur explicite.
   * Nombre = pixels, string = valeur CSS.
   */
  width?: string | number

  /**
   * Hauteur explicite.
   * Nombre = pixels, string = valeur CSS.
   */
  height?: string | number

  /**
   * Active l’effet shimmer.
   */
  shimmer?: boolean

  /**
   * Conservé pour compatibilité avec l’ancien code.
   *
   * `gold` est ignoré et remplacé par le shimmer neutre premium.
   */
  shimmerVariant?: 'default' | 'gold'

  /**
   * Nombre de lignes, uniquement pertinent pour `variant="text"`.
   */
  lines?: number

  /**
   * Espacement entre les lignes, en unités Tailwind approximatives.
   * `gap={2}` ≈ `0.5rem`.
   */
  gap?: number

  /**
   * Alignement du squelette.
   */
  align?: 'left' | 'center' | 'right'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLE MAPS                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const textHeightMap: Record<SkeletonSize, string> = {
  xs: 'h-2.5',
  sm: 'h-3',
  md: 'h-4',
  lg: 'h-5',
  xl: 'h-6',
  '2xl': 'h-8',
}

const circularSizeMap: Record<SkeletonSize, string> = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-14 w-14',
  '2xl': 'h-16 w-16',
}

const shapeClasses: Record<SkeletonVariant, string> = {
  text: 'rounded-md',
  circular: 'rounded-full',
  rectangular: 'rounded-xl',
  rounded: 'rounded-2xl',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toCssSize(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return `${value}px`

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function getLineWidth(
  index: number,
  total: number,
  explicitWidth?: string | number
): string | undefined {
  if (explicitWidth !== undefined) {
    return toCssSize(explicitWidth)
  }

  if (total <= 1) return '100%'

  // Dernière ligne plus courte, avant-dernière légèrement réduite.
  // Déterministe pour éviter les mismatches d’hydratation.
  if (index === total - 1) return '72%'
  if (index === total - 2 && total > 3) return '88%'

  return '100%'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SHIMMER                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function SkeletonShimmer() {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 -translate-x-full',
        'bg-gradient-to-r from-transparent via-surface/70 to-transparent',
        'dark:via-surface/35',
        'motion-safe:animate-[shimmer_2.2s_ease-in-out_infinite]',
        'motion-reduce:hidden'
      )}
      aria-hidden="true"
    />
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SINGLE SKELETON LINE                                           */
/* ═══════════════════════════════════════════════════════════════ */

interface SkeletonLineProps {
  variant: SkeletonVariant
  size: SkeletonSize
  width?: string | number
  height?: string | number
  shimmer: boolean
  align: 'left' | 'center' | 'right'
  className?: string
  style?: CSSProperties
}

function SkeletonLine({
  variant,
  size,
  width,
  height,
  shimmer,
  align,
  className,
  style,
}: SkeletonLineProps) {
  const computedWidth = toCssSize(width)
  const computedHeight = toCssSize(height)

  const isCircular = variant === 'circular'
  const isText = variant === 'text'

  const hasExplicitDimensions =
    computedWidth !== undefined || computedHeight !== undefined

  const classes = cn(
    'relative overflow-hidden',
    'border border-line/60',
    'bg-muted',
    shapeClasses[variant],

    // Hauteur par défaut pour le texte.
    isText && !computedHeight && textHeightMap[size],

    // Dimensions par défaut pour les avatars / pastilles.
    isCircular && !hasExplicitDimensions && circularSizeMap[size],

    // Le texte prend toute la largeur si aucune largeur explicite.
    isText && !computedWidth && 'w-full',

    // Alignement.
    align === 'center' && 'mx-auto',
    align === 'right' && 'ml-auto',

    className
  )

  const inlineStyle: CSSProperties = {
    ...(computedWidth ? { width: computedWidth } : {}),
    ...(computedHeight ? { height: computedHeight } : {}),

    // Pour un cercle, si only width est fourni, on force la même hauteur.
    ...(isCircular && computedWidth && !computedHeight
      ? { height: computedWidth }
      : {}),

    ...style,
  }

  return (
    <div className={classes} style={inlineStyle}>
      {shimmer ? <SkeletonShimmer /> : null}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SKELETON                                                       */
/* ═══════════════════════════════════════════════════════════════ */

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      className,
      variant = 'rectangular',
      size = 'md',
      width,
      height,
      shimmer = true,
      shimmerVariant: _shimmerVariant,
      lines = 1,
      gap = 2,
      align = 'left',
      'aria-hidden': ariaHiddenProp,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      role,
      style,
      ...rest
    },
    ref
  ) => {
    /*
     * Par défaut, un skeleton est décoratif.
     *
     * Il redevient accessible si le consommateur fournit :
     * - un aria-label
     * - un aria-labelledby
     * - un role
     * - ou aria-hidden={false}
     */
    const hasAccessibleName = Boolean(ariaLabel || ariaLabelledby || role)
    const ariaHidden = ariaHiddenProp ?? !hasAccessibleName

    /* ─────────────────────────────────────────────────────────── */
    /*  MULTI-LINES : uniquement pour variant="text"               */
    /* ─────────────────────────────────────────────────────────── */

    if (variant === 'text' && lines > 1) {
      const containerClasses = cn(
        'flex flex-col',
        align === 'center' && 'items-center',
        align === 'right' && 'items-end',
        className
      )

      const containerStyle: CSSProperties = {
        gap: `${Math.max(0, gap) * 0.25}rem`,
        ...style,
      }

      return (
        <div
          ref={ref}
          className={containerClasses}
          style={containerStyle}
          aria-hidden={ariaHidden}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          role={role}
          data-slot="skeleton"
          data-skeleton-variant={variant}
          data-skeleton-lines={lines}
          {...rest}
        >
          {Array.from({ length: lines }).map((_, index) => (
            <SkeletonLine
              key={`skeleton-line-${index}`}
              variant="text"
              size={size}
              width={getLineWidth(index, lines, width)}
              height={height}
              shimmer={shimmer}
              align={align}
            />
          ))}
        </div>
      )
    }

    /* ─────────────────────────────────────────────────────────── */
    /*  SINGLE SKELETON                                            */
    /* ─────────────────────────────────────────────────────────── */

    return (
      <SkeletonLine
        ref={ref as React.Ref<HTMLDivElement>}
        variant={variant}
        size={size}
        width={width}
        height={height}
        shimmer={shimmer}
        align={align}
        className={className}
        style={style}
        aria-hidden={ariaHidden}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        role={role}
        data-slot="skeleton"
        data-skeleton-variant={variant}
        {...rest}
      />
    )
  }
)

Skeleton.displayName = 'Skeleton'

/* ═══════════════════════════════════════════════════════════════ */
/*  EXPORTS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export { Skeleton }
export default Skeleton