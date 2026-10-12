// components/ui/Spinner.tsx
'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types & Variantes premium                                          */
/* ------------------------------------------------------------------ */

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl'
type SpinnerVariant =
  | 'brand'
  | 'accent'
  | 'warm'
  | 'luxury'
  | 'neutral'
  | 'white'
  | 'danger'
  | 'premium'   // ← nouvelle variante ultra‑luxueuse

interface SpinnerProps {
  size?: SpinnerSize
  variant?: SpinnerVariant
  className?: string
  label?: string
  /** Masque le texte du label (gardé pour les lecteurs d'écran) */
  hideLabel?: boolean
  /** Affiche un fond d'overlay autour du spinner (utile pour bloquer une zone) */
  overlay?: boolean
  /** Position du label par rapport au spinner */
  labelPosition?: 'bottom' | 'right'
}

/* ------------------------------------------------------------------ */
/*  Dictionnaires de styles                                            */
/* ------------------------------------------------------------------ */

const sizeMap: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
}

// Pour le spinner premium, on utilise un cercle avec bordure + dégradé conic
// Les tailles correspondent à celles de Loader2 pour que les remplacements soient cohérents
const premiumSizeMap: Record<SpinnerSize, { container: string; ring: string }> = {
  sm: { container: 'h-4 w-4', ring: 'border-2' },
  md: { container: 'h-6 w-6', ring: 'border-2' },
  lg: { container: 'h-8 w-8', ring: 'border-3' },
  xl: { container: 'h-12 w-12', ring: 'border-4' },
}

const variantMap: Record<Exclude<SpinnerVariant, 'premium'>, string> = {
  brand: 'text-brand-600 dark:text-brand-400',
  accent: 'text-accent-600 dark:text-accent-400',
  warm: 'text-warm-600 dark:text-warm-400',
  luxury: 'text-luxury-600 dark:text-luxury-400',
  neutral: 'text-neutral-600 dark:text-neutral-400',
  white: 'text-white',
  danger: 'text-red-600 dark:text-red-400',
}

/* ------------------------------------------------------------------ */
/*  Composant Spinner                                                    */
/* ------------------------------------------------------------------ */

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  (
    {
      size = 'md',
      variant = 'brand',
      className,
      label,
      hideLabel = false,
      overlay = false,
      labelPosition = 'bottom',
    },
    ref
  ) => {
    const spinnerElement = (
      <div
        ref={ref}
        role="status"
        aria-label={label || 'Chargement'}
        className={cn(
          'inline-flex items-center gap-2',
          labelPosition === 'right' ? 'flex-row' : 'flex-col justify-center',
          overlay &&
            'absolute inset-0 bg-white/60 dark:bg-neutral-950/60 backdrop-blur-sm z-50 flex items-center justify-center',
          !overlay && className
        )}
      >
        {variant === 'premium' ? (
          /* Cercle animé avec dégradé conique ultra‑premium */
          <div
            className={cn(
              'animate-spin rounded-full',
              premiumSizeMap[size].container,
              premiumSizeMap[size].ring,
              'border-transparent',
              'bg-gradient-conic from-gold-400 via-brand-500 to-luxury-500',
              // On améliore le rendu avec une ombre douce
              'shadow-[0_0_12px_rgba(223,173,31,0.4)]',
            )}
          />
        ) : (
          <Loader2
            className={cn('animate-spin', sizeMap[size], variantMap[variant])}
          />
        )}
        {label && !hideLabel && (
          <span
            className={cn(
              'text-sm font-medium',
              labelPosition === 'bottom' && 'mt-2',
              variant === 'premium'
                ? 'text-gold-400'
                : variantMap[variant]
            )}
          >
            {label}
          </span>
        )}
        <span className="sr-only">{label || 'Chargement...'}</span>
      </div>
    )

    // Si overlay, on enveloppe dans un conteneur relatif
    if (overlay) {
      return (
        <div className={cn('relative', className)}>
          {spinnerElement}
        </div>
      )
    }

    return spinnerElement
  }
)

Spinner.displayName = 'Spinner'

export { Spinner }
