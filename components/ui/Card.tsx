// components/ui/Card.tsx
import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

/* ------------------------------------------------------------------ */
/*  Types & Variantes                                                  */
/* ------------------------------------------------------------------ */

type CardVariant = 'elevated' | 'outlined' | 'filled' | 'glass' | 'premium'
type CardAccent = 'brand' | 'accent' | 'warm' | 'luxury' | 'neutral' | 'gold' | 'burgundy'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'article'
  variant?: CardVariant
  accent?: CardAccent
  hover?: boolean
  accentBorder?: boolean
  padding?: 'sm' | 'md' | 'lg'
  /** Active un état de chargement : les enfants sont remplacés par des squelettes */
  loading?: boolean
  /** Motif de fond (optionnel) : ex. "pattern-dots", "pattern-lines", ou vos propres classes */
  pattern?: string
}

/* ------------------------------------------------------------------ */
/*  Configuration des styles par variante                               */
/* ------------------------------------------------------------------ */

const variantStyles: Record<CardVariant, string> = {
  elevated:
    'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-card',
  outlined:
    'bg-transparent border-2 border-neutral-200 dark:border-neutral-700 shadow-none',
  filled:
    'bg-neutral-50 dark:bg-neutral-800/50 border border-transparent shadow-none',
  glass:
    'bg-white/70 dark:bg-neutral-900/50 backdrop-blur-xl border border-white/20 dark:border-neutral-700/30 shadow-soft',
  premium:
    'backdrop-blur-xl bg-white/10 dark:bg-midnight-800/50 border border-white/20 dark:border-midnight-500/30 shadow-soft hover:shadow-card-hover',
}

const accentBorderColors: Record<CardAccent, string> = {
  brand: 'border-t-brand-500',
  accent: 'border-t-accent-500',
  warm: 'border-t-warm-500',
  luxury: 'border-t-luxury-500',
  neutral: 'border-t-neutral-300 dark:border-t-neutral-600',
  gold: 'border-t-gold-400',
  burgundy: 'border-t-burgundy-600',
}

const accentGlow: Record<CardAccent, string> = {
  brand: 'hover:shadow-brand-500/10 dark:hover:shadow-brand-400/5',
  accent: 'hover:shadow-accent-500/10 dark:hover:shadow-accent-400/5',
  warm: 'hover:shadow-warm-500/10 dark:hover:shadow-warm-400/5',
  luxury: 'hover:shadow-luxury-500/10 dark:hover:shadow-luxury-400/5',
  neutral: 'hover:shadow-neutral-900/5 dark:hover:shadow-neutral-400/5',
  gold: 'hover:shadow-gold-500/10 dark:hover:shadow-gold-400/5',
  burgundy: 'hover:shadow-burgundy-500/10 dark:hover:shadow-burgundy-400/5',
}

/* ------------------------------------------------------------------ */
/*  Card racine                                                        */
/* ------------------------------------------------------------------ */

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      as: Component = 'div',
      variant = 'elevated',
      accent = 'neutral',
      hover = false,
      accentBorder = false,
      padding = 'md',
      loading = false,
      pattern,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <Component
        ref={ref}
        className={cn(
          'relative rounded-2xl overflow-hidden transition-all duration-300',
          variantStyles[variant],
          accentBorder && 'border-t-4',
          accentBorder && accentBorderColors[accent],
          hover && 'hover:-translate-y-1 hover:shadow-card-hover',
          hover && accentGlow[accent],
          pattern && pattern, // motif de fond personnalisé
          className
        )}
        {...props}
      >
        {loading ? (
          <div className="p-6">
            <Skeleton variant="rectangular" className="w-full aspect-square mb-4" shimmer />
            <Skeleton variant="text" className="w-3/4 mb-2" shimmer />
            <Skeleton variant="text" className="w-1/2" shimmer />
          </div>
        ) : (
          children
        )}
      </Component>
    )
  }
)
Card.displayName = 'Card'

/* ------------------------------------------------------------------ */
/*  Sous-composants                                                    */
/* ------------------------------------------------------------------ */

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: CardAccent
  badge?: React.ReactNode
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, accent, badge, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative px-6 py-5 border-b border-neutral-100 dark:border-neutral-800',
        accent === 'brand' && 'bg-brand-50/50 dark:bg-brand-900/10',
        accent === 'accent' && 'bg-accent-50/50 dark:bg-accent-900/10',
        accent === 'warm' && 'bg-warm-50/50 dark:bg-warm-900/10',
        accent === 'luxury' && 'bg-luxury-50/50 dark:bg-luxury-900/10',
        accent === 'gold' && 'bg-gold-50/50 dark:bg-gold-900/10',
        accent === 'burgundy' && 'bg-burgundy-50/50 dark:bg-burgundy-900/10',
        className
      )}
      {...props}
    >
      {children}
      {badge && (
        <div className="absolute top-3 right-3">{badge}</div>
      )}
    </div>
  )
)
CardHeader.displayName = 'CardHeader'

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean
}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, noPadding = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(!noPadding && 'px-6 py-5', className)}
      {...props}
    />
  )
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'px-6 py-4 border-t border-neutral-100 dark:border-neutral-800',
        className
      )}
      {...props}
    />
  )
)
CardFooter.displayName = 'CardFooter'

/* ------------------------------------------------------------------ */
/*  Éléments de présentation                                           */
/* ------------------------------------------------------------------ */

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  accent?: CardAccent
}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Tag = 'h3', accent, ...props }, ref) => {
    const accentColor = {
      brand: 'text-brand-700 dark:text-brand-300',
      accent: 'text-accent-700 dark:text-accent-300',
      warm: 'text-warm-700 dark:text-warm-300',
      luxury: 'text-luxury-700 dark:text-luxury-300',
      neutral: '',
      gold: 'text-gold-700 dark:text-gold-300',
      burgundy: 'text-burgundy-700 dark:text-burgundy-300',
    }

    return (
      <Tag
        ref={ref}
        className={cn(
          'text-lg font-semibold text-neutral-900 dark:text-neutral-100',
          accent && accentColor[accent],
          className
        )}
        {...props}
      />
    )
  }
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-neutral-500 dark:text-neutral-400', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
}
