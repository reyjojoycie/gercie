// components/ui/Card.tsx
'use client'

import React, { useContext, useMemo } from 'react'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type NormalizedCardVariant =
  | 'default'
  | 'subtle'
  | 'outline'
  | 'raised'
  | 'overlay'
  | 'glass'

type NormalizedCardAccent =
  | 'none'
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'

export type CardVariant =
  | NormalizedCardVariant
  | 'elevated'
  | 'outlined'
  | 'filled'
  | 'premium'

export type CardAccent =
  | NormalizedCardAccent
  | 'brand'
  | 'accent'
  | 'warm'
  | 'luxury'
  | 'gold'
  | 'burgundy'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

interface CardContextValue {
  accent: NormalizedCardAccent
  padding: CardPadding
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTEXT                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const CardContext = React.createContext<CardContextValue>({
  accent: 'neutral',
  padding: 'md',
})

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const variantMap: Record<CardVariant, NormalizedCardVariant> = {
  default: 'default',
  elevated: 'default',
  subtle: 'subtle',
  filled: 'subtle',
  outline: 'outline',
  outlined: 'outline',
  raised: 'raised',
  premium: 'raised',
  overlay: 'overlay',
  glass: 'glass',
}

const accentMap: Record<CardAccent, NormalizedCardAccent> = {
  none: 'none',
  neutral: 'neutral',
  primary: 'primary',
  brand: 'primary',
  accent: 'primary',
  gold: 'primary',
  luxury: 'primary',
  success: 'success',
  warning: 'warning',
  warm: 'warning',
  danger: 'danger',
  burgundy: 'danger',
}

function normalizeVariant(variant: CardVariant = 'default'): NormalizedCardVariant {
  return variantMap[variant] ?? 'default'
}

function normalizeAccent(accent: CardAccent = 'neutral'): NormalizedCardAccent {
  return accentMap[accent] ?? 'neutral'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLES                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const variantStyles: Record<NormalizedCardVariant, string> = {
  default:
    'bg-surface border border-line shadow-card',

  subtle:
    'bg-muted border border-transparent',

  outline:
    'bg-transparent border border-line-strong',

  raised:
    'bg-raised border border-line shadow-raised',

  overlay:
    'bg-raised border border-line-strong shadow-overlay',

  glass:
    'glass-card',
}

function getHoverClasses(variant: NormalizedCardVariant): string {
  return cn(
    'hover:-translate-y-0.5 hover:shadow-card-hover',
    'focus-within:-translate-y-0.5 focus-within:shadow-card-hover',

    variant === 'default' &&
      'hover:border-line-strong focus-within:border-line-strong',

    variant === 'raised' &&
      'hover:border-line-strong focus-within:border-line-strong',

    variant === 'outline' &&
      'hover:bg-muted hover:border-line-strong focus-within:bg-muted focus-within:border-line-strong',

    variant === 'subtle' &&
      'hover:bg-raised focus-within:bg-raised',

    variant === 'glass' &&
      'hover:shadow-raised focus-within:shadow-raised',

    variant === 'overlay' &&
      'hover:shadow-overlay focus-within:shadow-overlay'
  )
}

const accentBorderClasses: Record<NormalizedCardAccent, string> = {
  none: '',
  neutral: 'border-t-line-strong',
  primary: 'border-t-accent',
  success: 'border-t-success',
  warning: 'border-t-warning',
  danger: 'border-t-danger',
}

const accentHeaderClasses: Record<NormalizedCardAccent, string> = {
  none: '',
  neutral: '',
  primary: 'bg-accent-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
}

const accentTitleClasses: Record<NormalizedCardAccent, string> = {
  none: '',
  neutral: '',
  primary: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

const contentPaddingClasses: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
}

const titleSizeByTag: Record<string, string> = {
  h1: 'text-2xl leading-tight sm:text-3xl',
  h2: 'text-xl leading-tight sm:text-2xl',
  h3: 'text-lg leading-tight sm:text-xl',
  h4: 'text-base leading-tight sm:text-lg',
  h5: 'text-sm leading-tight sm:text-base',
  h6: 'text-xs leading-tight sm:text-sm',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LOADING SKELETON                                               */
/* ═══════════════════════════════════════════════════════════════ */

function CardLoadingSkeleton({ padding }: { padding: CardPadding }) {
  return (
    <div className={cn('space-y-4', contentPaddingClasses[padding])}>
      <div
        className="skeleton aspect-square w-full rounded-control"
        aria-hidden="true"
      />

      <div className="space-y-2.5">
        <div
          className="skeleton h-4 w-3/4 rounded-full"
          aria-hidden="true"
        />
        <div
          className="skeleton h-3 w-1/2 rounded-full"
          aria-hidden="true"
        />
        <div
          className="skeleton h-3 w-2/5 rounded-full"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CARD ROOT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'article' | 'aside'
  variant?: CardVariant
  accent?: CardAccent
  hover?: boolean
  accentBorder?: boolean
  padding?: CardPadding
  /** Active un état de chargement : les enfants sont remplacés par des squelettes */
  loading?: boolean
  /** Motif de fond optionnel : ex. "pattern-dots", "pattern-lines" */
  pattern?: string
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      as,
      variant = 'default',
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
    const normalizedVariant = normalizeVariant(variant)
    const normalizedAccent = normalizeAccent(accent)

    const contextValue = useMemo(
      () => ({
        accent: normalizedAccent,
        padding,
      }),
      [normalizedAccent, padding]
    )

    const Component = (as ?? 'div') as React.ElementType

    return (
      <CardContext.Provider value={contextValue}>
        <Component
          ref={ref as any}
          className={cn(
            'relative overflow-hidden rounded-card transition-all duration-200 ease-out',
            variantStyles[normalizedVariant],
            accentBorder && normalizedAccent !== 'none' && 'border-t-2',
            accentBorder && accentBorderClasses[normalizedAccent],
            hover && getHoverClasses(normalizedVariant),
            pattern,
            className
          )}
          {...props}
        >
          {loading ? <CardLoadingSkeleton padding={padding} /> : children}
        </Component>
      </CardContext.Provider>
    )
  }
)

Card.displayName = 'Card'

/* ═══════════════════════════════════════════════════════════════ */
/*  CARD HEADER                                                    */
/* ═══════════════════════════════════════════════════════════════ */

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: CardAccent
  badge?: React.ReactNode
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, accent, badge, children, ...props }, ref) => {
    const { accent: contextAccent } = useContext(CardContext)
    const resolvedAccent = accent ? normalizeAccent(accent) : contextAccent

    return (
      <div
        ref={ref}
        className={cn(
          'relative border-b border-line px-5 py-4 sm:px-6 sm:py-5',
          accentHeaderClasses[resolvedAccent],
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">{children}</div>

          {badge && <div className="shrink-0">{badge}</div>}
        </div>
      </div>
    )
  }
)

CardHeader.displayName = 'CardHeader'

/* ═══════════════════════════════════════════════════════════════ */
/*  CARD CONTENT                                                   */
/* ═══════════════════════════════════════════════════════════════ */

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding
  /** @deprecated Préfère `padding="none"` */
  noPadding?: boolean
}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, padding, noPadding = false, ...props }, ref) => {
    const { padding: contextPadding } = useContext(CardContext)

    const resolvedPadding: CardPadding = noPadding
      ? 'none'
      : padding ?? contextPadding

    return (
      <div
        ref={ref}
        className={cn(contentPaddingClasses[resolvedPadding], className)}
        {...props}
      />
    )
  }
)

CardContent.displayName = 'CardContent'

/* ═══════════════════════════════════════════════════════════════ */
/*  CARD FOOTER                                                    */
/* ═══════════════════════════════════════════════════════════════ */

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-6',
        className
      )}
      {...props}
    />
  )
)

CardFooter.displayName = 'CardFooter'

/* ═══════════════════════════════════════════════════════════════ */
/*  CARD TITLE                                                     */
/* ═══════════════════════════════════════════════════════════════ */

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  accent?: CardAccent
}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Tag = 'h3', accent, ...props }, ref) => {
    const { accent: contextAccent } = useContext(CardContext)
    const resolvedAccent = accent ? normalizeAccent(accent) : contextAccent

    return (
      <Tag
        ref={ref as any}
        className={cn(
          'font-semibold tracking-tight text-fg',
          titleSizeByTag[Tag] ?? titleSizeByTag.h3,
          accentTitleClasses[resolvedAccent],
          className
        )}
        {...props}
      />
    )
  }
)

CardTitle.displayName = 'CardTitle'

/* ═══════════════════════════════════════════════════════════════ */
/*  CARD DESCRIPTION                                               */
/* ═══════════════════════════════════════════════════════════════ */

export interface CardDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      'mt-1.5 text-sm leading-relaxed text-fg-muted',
      className
    )}
    {...props}
  />
))

CardDescription.displayName = 'CardDescription'

/* ═══════════════════════════════════════════════════════════════ */
/*  EXPORTS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
}