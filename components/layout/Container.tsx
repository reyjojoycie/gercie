// components/layout/Container.tsx
import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ContainerElement =
  | 'div'
  | 'section'
  | 'main'
  | 'header'
  | 'footer'
  | 'aside'
  | 'article'
  | 'nav'

export type ContainerSize =
  | 'default'
  | 'small'
  | 'medium'
  | 'large'
  | 'wide'
  | 'full'
  | 'fluid'
  | 'prose'
  | 'dashboard'
  | 'narrow'

export type ContainerBackground =
  | 'none'
  | 'primary'
  | 'secondary'
  | 'card'
  | 'elevated'
  | 'glass'
  | 'inverse'
  | 'canvas'
  | 'surface'
  | 'raised'
  | 'muted'

export type ContainerPadding =
  | 'none'
  | 'default'
  | 'compact'
  | 'loose'
  | 'section'
  | 'page'
  | 'hero'

export type ContainerAnimate =
  | 'none'
  | 'fade-in'
  | 'fade-in-up'
  | 'fade-in-down'
  | 'fade-in-left'
  | 'fade-in-right'
  | 'scale-in'

export type ContainerDivider = 'top' | 'bottom' | 'both'

export type ContainerPattern =
  | 'none'
  | 'dots'
  | 'lines'
  | 'waves'
  | 'zigzag'

export interface ContainerProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode
  className?: string

  /** Balise sémantique rendue */
  as?: ContainerElement

  /** Largeur maximale du conteneur */
  size?: ContainerSize

  /** Arrière-plan adaptatif clair / sombre */
  background?: ContainerBackground

  /** Padding horizontal + vertical */
  padding?: ContainerPadding

  /** Animation d’entrée */
  animate?: ContainerAnimate

  /** Bordure arrondie premium */
  bordered?: boolean

  /** Séparateur haut / bas / both */
  divider?: ContainerDivider

  /** Motif de fond discret */
  pattern?: ContainerPattern

  /** Accessibilité */
  ariaLabel?: string
  ariaLabelledby?: string

  /** Tests / analytics */
  dataTestId?: string
  dataTrack?: string
}

export interface SectionProps extends ContainerProps {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  titleClassName?: string
  subtitleClassName?: string
  actions?: React.ReactNode
}

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'col' | 'row'
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  wrap?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CLASS MAPS                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const sizeClasses: Record<ContainerSize, string> = {
  narrow: 'max-w-2xl',
  small: 'max-w-4xl',
  medium: 'max-w-5xl',
  default: 'max-w-7xl',
  large: 'max-w-[90rem]',
  wide: 'max-w-[96rem]',
  full: 'max-w-full',
  fluid: 'max-w-full',
  prose: 'max-w-3xl',
  dashboard: 'max-w-[100rem]',
}

const backgroundClasses: Record<ContainerBackground, string> = {
  none: '',

  // Compatibilité legacy
  primary: 'bg-canvas',
  secondary: 'bg-muted',
  card: 'bg-surface',
  elevated: 'bg-raised',
  glass: 'glass-card',
  inverse: 'bg-fg text-canvas',

  // Nouveaux tokens sémantiques
  canvas: 'bg-canvas',
  surface: 'bg-surface',
  raised: 'bg-raised',
  muted: 'bg-muted',
}

const paddingClasses: Record<ContainerPadding, string> = {
  none: 'p-0',

  default: 'px-4 py-8 sm:px-6 md:py-10 lg:px-8',

  compact: 'px-4 py-4 sm:px-5',

  loose: 'px-4 py-12 sm:px-6 md:py-16 lg:px-10',

  section: 'px-4 py-16 sm:px-6 md:py-20 lg:px-8 lg:py-24',

  page: 'px-4 pt-6 pb-16 sm:px-6 md:pt-8 md:pb-24 lg:px-8',

  hero: 'px-4 pt-8 pb-12 sm:px-6 md:pt-12 md:pb-16 lg:px-8',
}

const animateClasses: Record<ContainerAnimate, string> = {
  none: '',
  'fade-in': 'animate-fade-in',
  'fade-in-up': 'animate-fade-in-up',
  'fade-in-down': 'animate-fade-in-down',
  'fade-in-left': 'animate-fade-in-left',
  'fade-in-right': 'animate-fade-in-right',
  'scale-in': 'animate-scale-in',
}

const patternClasses: Record<ContainerPattern, string> = {
  none: '',
  dots: 'pattern-dots',
  lines: 'pattern-lines',
  waves: 'pattern-waves',
  zigzag: 'pattern-zigzag',
}

const gapClasses: Record<NonNullable<StackProps['gap']>, string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-10',
  '2xl': 'gap-16',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTAINER                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const Container = forwardRef<HTMLElement, ContainerProps>(
  (
    {
      children,
      className,
      as = 'div',
      size = 'default',
      background = 'none',
      padding = 'default',
      animate = 'none',
      bordered = false,
      divider,
      pattern = 'none',
      ariaLabel,
      ariaLabelledby,
      dataTestId,
      dataTrack,
      ...rest
    },
    ref
  ) => {
    const Component = as as React.ElementType

    const layoutClasses = cn(
      'relative mx-auto w-full',
      sizeClasses[size],
      backgroundClasses[background],
      paddingClasses[padding],
      animateClasses[animate],
      patternClasses[pattern],

      bordered && 'rounded-card border border-line',
      bordered && background === 'none' && 'bg-surface',

      divider === 'top' && 'border-t border-line',
      divider === 'bottom' && 'border-b border-line',
      divider === 'both' && 'border-y border-line',

      className
    )

    return (
      <Component
        ref={ref as any}
        className={layoutClasses}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        data-testid={dataTestId}
        data-track={dataTrack}
        {...rest}
      >
        {children}
      </Component>
    )
  }
)

Container.displayName = 'Container'

/* ═══════════════════════════════════════════════════════════════ */
/*  SECTION                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const Section = forwardRef<HTMLElement, SectionProps>(
  (
    {
      title,
      subtitle,
      headingLevel: Heading = 'h2',
      titleClassName,
      subtitleClassName,
      actions,
      children,
      className,
      padding = 'section',
      size = 'default',
      background = 'none',
      ...containerProps
    },
    ref
  ) => {
    const hasHeader = Boolean(title || subtitle || actions)

    return (
      <Container
        ref={ref}
        as="section"
        size={size}
        background={background}
        padding={padding}
        className={className}
        {...containerProps}
      >
        {hasHeader && (
          <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between md:mb-12">
            <div className="min-w-0 flex-1">
              {title && (
                <Heading
                  className={cn(
                    'text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl md:text-4xl',
                    titleClassName
                  )}
                >
                  {title}
                </Heading>
              )}

              {subtitle && (
                <p
                  className={cn(
                    'mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-fg-muted sm:text-base md:text-lg',
                    subtitleClassName
                  )}
                >
                  {subtitle}
                </p>
              )}
            </div>

            {actions && (
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                {actions}
              </div>
            )}
          </div>
        )}

        {children}
      </Container>
    )
  }
)

Section.displayName = 'Section'

/* ═══════════════════════════════════════════════════════════════ */
/*  STACK                                                          */
/* ═══════════════════════════════════════════════════════════════ */

const Stack = forwardRef<HTMLDivElement, StackProps>(
  (
    {
      direction = 'col',
      gap = 'md',
      wrap = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          direction === 'col' ? 'flex-col' : 'flex-row',
          gapClasses[gap],
          wrap && 'flex-wrap',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Stack.displayName = 'Stack'

/* ═══════════════════════════════════════════════════════════════ */
/*  EXPORTS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export { Container, Section, Stack }
export default Container