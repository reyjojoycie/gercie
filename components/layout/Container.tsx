// components/layout/Container.tsx
import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/* ========================================================================
   Container – Layout premium, anticipatif, ultra‑flexible
   ======================================================================== */

// Types enrichis pour un usage illimité (marketplace, page, sections, dashboard…)
interface ContainerProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode
  className?: string

  /** Balise sémantique rendue */
  as?: 'div' | 'section' | 'main' | 'header' | 'footer' | 'aside' | 'article' | 'nav'

  /** Largeur maximale (conservé + nouvelles) */
  size?: 'default' | 'small' | 'large' | 'full' | 'fluid' | 'prose' | 'dashboard'

  /** Arrière‑plan adaptatif (compatible dark mode) */
  background?: 'none' | 'primary' | 'secondary' | 'card' | 'elevated' | 'glass' | 'inverse'

  /** Padding vertical / horizontal */
  padding?: 'none' | 'default' | 'compact' | 'loose' | 'section'

  /** Animation d’entrée élégante */
  animate?: 'fade-in-up' | 'fade-in' | 'fade-in-left' | 'fade-in-right' | 'scale-in' | 'none'

  /** Bordure arrondie */
  bordered?: boolean

  /** Bordure décorative supérieure / inférieure */
  divider?: 'top' | 'bottom' | 'both'

  /** Motif d’arrière‑plan discret */
  pattern?: 'dots' | 'lines' | 'waves' | 'none'

  /** Accessibilité */
  id?: string
  role?: string
  ariaLabel?: string
  ariaLabelledby?: string

  /** Pour les tests et le suivi analytique */
  dataTestId?: string
  dataTrack?: string
}

// Mapping des tailles de conteneur
const sizeClasses: Record<string, string> = {
  default: 'max-w-7xl',
  small: 'max-w-4xl',
  large: 'max-w-[90rem]',
  full: 'max-w-full',
  fluid: 'max-w-full', // sans contrainte
  prose: 'max-w-3xl', // idéal pour la lecture
  dashboard: 'max-w-[100rem]',
}

// Mapping des fonds (utilise les variables CSS dynamiques du thème midnight premium)
const bgClasses: Record<string, string> = {
  none: '',
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  card: 'bg-card',
  elevated: 'bg-elevated',
  glass: 'glass-card',
  inverse: 'bg-inverse text-inverse',
}

// Mapping des paddings
const paddingClasses: Record<string, string> = {
  none: 'p-0',
  default: 'px-4 sm:px-6 lg:px-8 py-8',
  compact: 'px-4 py-4',
  loose: 'px-4 sm:px-6 lg:px-10 py-12 md:py-16',
  section: 'px-4 sm:px-6 lg:px-8 py-16 md:py-24',
}

// Animations
const animateClasses: Record<string, string> = {
  'fade-in-up': 'animate-fade-in-up',
  'fade-in': 'animate-fade-in',
  'fade-in-left': 'animate-fade-in-left',
  'fade-in-right': 'animate-fade-in-right',
  'scale-in': 'animate-scale-in',
  none: '',
}

// Motifs
const patternClasses: Record<string, string> = {
  dots: 'pattern-dots',
  lines: 'pattern-lines',
  waves: 'pattern-waves',
  none: '',
}

const Container = forwardRef<HTMLElement, ContainerProps>(
  (
    {
      children,
      className,
      as: Component = 'div',
      size = 'default',
      background = 'none',
      padding = 'default',
      animate = 'none',
      bordered = false,
      divider,
      pattern = 'none',
      id,
      role,
      ariaLabel,
      ariaLabelledby,
      dataTestId,
      dataTrack,
      ...rest
    },
    ref
  ) => {
    // Classes composées
    // ✅ Ajout systématique de la classe 'relative' pour sécuriser les calculs d'offsets de scroll (Framer Motion)
    const layoutClasses = cn(
      'mx-auto relative', 
      sizeClasses[size],
      bgClasses[background],
      paddingClasses[padding],
      animateClasses[animate],
      patternClasses[pattern],
      bordered && 'border border-light rounded-2xl',
      divider === 'top' && 'border-t border-light',
      divider === 'bottom' && 'border-b border-light',
      divider === 'both' && 'border-t border-b border-light',
      className
    )

    return (
      <Component
        ref={ref}
        className={layoutClasses}
        id={id}
        role={role}
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

/* ========================================================================
   Section – Bloc de mise en page avec titre et sous‑titre, prêt pour le SEO
   ======================================================================== */
interface SectionProps extends ContainerProps {
  title?: string
  subtitle?: string
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4'
  titleClassName?: string
  subtitleClassName?: string
  actions?: React.ReactNode
}

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
      ...containerProps
    },
    ref
  ) => {
    return (
      <Container as="section" {...containerProps} ref={ref}>
        {(title || subtitle || actions) && (
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-8 md:mb-12 gap-4">
            <div>
              {title && (
                <Heading
                  className={cn(
                    'text-3xl md:text-4xl font-bold text-primary tracking-tight',
                    titleClassName
                  )}
                >
                  {title}
                </Heading>
              )}
              {subtitle && (
                <p
                  className={cn(
                    'mt-2 text-secondary text-base md:text-lg max-w-2xl',
                    subtitleClassName
                  )}
                >
                  {subtitle}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex-shrink-0">{actions}</div>
            )}
          </div>
        )}
        {children}
      </Container>
    )
  }
)
Section.displayName = 'Section'

/* ========================================================================
   Stack – Empilement vertical / horizontal avec espacement régulier
   ======================================================================== */
interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'col' | 'row'
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  wrap?: boolean
}

const Stack = forwardRef<HTMLDivElement, StackProps>(
  ({ direction = 'col', gap = 'md', wrap = false, className, ...props }, ref) => {
    const gapMap: Record<string, string> = {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-10',
    }
    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          direction === 'col' ? 'flex-col' : 'flex-row',
          gapMap[gap],
          wrap && 'flex-wrap',
          className
        )}
        {...props}
      />
    )
  }
)
Stack.displayName = 'Stack'

export { Container, Section, Stack }
export type { ContainerProps, SectionProps, StackProps }