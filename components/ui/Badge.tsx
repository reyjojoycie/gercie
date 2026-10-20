// components/ui/Badge.tsx
import React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types & Variantes premium                                          */
/* ------------------------------------------------------------------ */

type BadgeVariant =
  | 'brand'
  | 'accent'
  | 'warm'
  | 'luxury'
  | 'gold'
  | 'neutral'
  | 'secondary'       // ← ajouté (utilisé par SortableSlideItem, SortableStatItem...)
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'custom'          // ← variante pour les badges dynamiques (marché)

type BadgeStyle = 'soft' | 'solid' | 'outline' | 'gradient' | 'luxe-gradient'

interface BadgeCustomColors {
  bg: string
  text: string
  border: string
  bgDark: string
  textDark: string
  borderDark: string
}

// `style` est omis de HTMLAttributes : sinon il entre en conflit avec notre
// prop `style` ('soft' | 'solid'...) → erreur TS2430 (string vs CSSProperties).
interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  variant?: BadgeVariant
  size?: 'sm' | 'md' | 'lg'
  /** Apparence du badge (soft, solid, outline...). */
  style?: BadgeStyle
  /** Alias recommandé de `style` (nom non ambigu avec le style inline HTML). */
  appearance?: BadgeStyle
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  dot?: boolean
  dotColor?: string
  onClose?: () => void
  disabled?: boolean
  /** Couleurs personnalisées (ignorées sauf si variant='custom') */
  customColors?: BadgeCustomColors
}

/* ------------------------------------------------------------------ */
/*  Dictionnaires de styles                                            */
/* ------------------------------------------------------------------ */

const baseClasses =
  'inline-flex items-center gap-1.5 rounded-full font-medium transition-all duration-200'

const sizeStyles: Record<string, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-sm',
  lg: 'px-3 py-1 text-base',
}

const softStyles: Record<BadgeVariant, string> = {
  brand:     'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  accent:    'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300',
  warm:      'bg-warm-100 text-warm-700 dark:bg-warm-900/30 dark:text-warm-300',
  luxury:    'bg-luxury-100 text-luxury-700 dark:bg-luxury-900/30 dark:text-luxury-300',
  gold:      'bg-gold-100 text-gold-800 dark:bg-gold-900/30 dark:text-gold-300',
  neutral:   'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  secondary: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200',
  success:   'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300',
  danger:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  warning:   'bg-warm-100 text-warm-700 dark:bg-warm-900/30 dark:text-warm-300',
  info:      'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  custom:    '', // laissé vide, sera remplacé par customColors
}

const solidStyles: Record<BadgeVariant, string> = {
  brand:     'bg-brand-600 text-white shadow-sm hover:shadow-md',
  accent:    'bg-accent-600 text-white shadow-sm hover:shadow-md',
  warm:      'bg-warm-500 text-white dark:text-white dark:shadow-lg dark:hover:shadow-xl shadow-sm hover:shadow-md',
  luxury:    'bg-luxury-600 text-white shadow-sm hover:shadow-md',
  gold:      'bg-gold-500 text-white dark:text-white dark:shadow-lg dark:hover:shadow-xl shadow-sm hover:shadow-md',
  neutral:   'bg-neutral-600 text-white dark:bg-neutral-700 dark:text-neutral-100 dark:shadow-sm',
  secondary: 'bg-neutral-500 text-white dark:bg-neutral-600 dark:text-neutral-100 dark:shadow-sm',
  success:   'bg-accent-600 text-white shadow-sm hover:shadow-md',
  danger:    'bg-red-600 text-white shadow-sm hover:shadow-md',
  warning:   'bg-warm-500 text-white dark:text-white dark:shadow-lg dark:hover:shadow-xl shadow-sm hover:shadow-md',
  info:      'bg-brand-600 text-white shadow-sm hover:shadow-md',
  custom:    '',
}

const outlineStyles: Record<BadgeVariant, string> = {
  brand:     'border border-brand-300 text-brand-700 dark:border-brand-600 dark:text-brand-300',
  accent:    'border border-accent-300 text-accent-700 dark:border-accent-600 dark:text-accent-300',
  warm:      'border border-warm-300 text-warm-700 dark:border-warm-600 dark:text-warm-300',
  luxury:    'border border-luxury-300 text-luxury-700 dark:border-luxury-600 dark:text-luxury-300',
  gold:      'border border-gold-400 text-gold-700 dark:border-gold-600 dark:text-gold-300',
  neutral:   'border border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300',
  secondary: 'border border-neutral-400 text-neutral-800 dark:border-neutral-500 dark:text-neutral-200',
  success:   'border border-accent-300 text-accent-700 dark:border-accent-600 dark:text-accent-300',
  danger:    'border border-red-300 text-red-700 dark:border-red-600 dark:text-red-300',
  warning:   'border border-warm-300 text-warm-700 dark:border-warm-600 dark:text-warm-300',
  info:      'border border-brand-300 text-brand-700 dark:border-brand-600 dark:text-brand-300',
  custom:    '',
}

const gradientStyles: Record<BadgeVariant, string> = {
  brand:     'bg-gradient-brand text-white shadow-sm',
  accent:    'bg-gradient-accent text-white shadow-sm',
  warm:      'bg-gradient-warm text-neutral-900 shadow-sm',
  luxury:    'bg-gradient-luxury text-white shadow-sm',
  gold:      'bg-gradient-to-r from-gold-400 to-burgundy-700 text-white shadow-sm',
  neutral:   'bg-gradient-to-r from-neutral-400 to-neutral-600 text-white shadow-sm',
  secondary: 'bg-gradient-to-r from-neutral-300 to-neutral-500 text-white shadow-sm',
  success:   'bg-gradient-accent text-white shadow-sm',
  danger:    'bg-gradient-to-r from-red-500 to-red-700 text-white shadow-sm',
  warning:   'bg-gradient-warm text-neutral-900 shadow-sm',
  info:      'bg-gradient-brand text-white shadow-sm',
  custom:    '',
}

/* ------------------------------------------------------------------ */
/*  Composant Badge                                                     */
/* ------------------------------------------------------------------ */

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant = 'neutral',
      size = 'sm',
      style = 'soft',
      appearance,
      leftIcon,
      rightIcon,
      dot = false,
      dotColor,
      onClose,
      disabled = false,
      customColors,
      children,
      ...props
    },
    ref
  ) => {
    const styleMap: Record<string, Record<BadgeVariant, string>> = {
      soft: softStyles,
      solid: solidStyles,
      outline: outlineStyles,
      gradient: gradientStyles,
      'luxe-gradient': gradientStyles,
    }

    // `appearance` (nom non ambigu) prime sur `style` s'il est fourni
    const visualStyle: BadgeStyle = appearance ?? style

    let currentVariantStyle: string

    // Si variant === 'custom' et customColors fourni, on construit les classes
    if (variant === 'custom' && customColors) {
      currentVariantStyle = cn(
        customColors.bg,
        customColors.text,
        customColors.border,
        customColors.bgDark,
        customColors.textDark,
        customColors.borderDark,
        'border' // ajoute une bordure par défaut pour les badges custom
      )
    } else {
      currentVariantStyle = styleMap[visualStyle]?.[variant] ?? gradientStyles.gold
    }

    const dotStyle = dot
      ? `relative before:absolute before:top-0 before:right-0 before:block before:w-1.5 before:h-1.5 before:rounded-full before:bg-${dotColor ?? 'current'} before:translate-x-1/2 before:-translate-y-1/2`
      : ''

    return (
      <span
        ref={ref}
        className={cn(
          baseClasses,
          sizeStyles[size],
          currentVariantStyle,
          dot && 'pl-3',
          dotStyle,
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {leftIcon}
        {children}
        {rightIcon}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="ml-1 -mr-1 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition"
          >
            <X size={size === 'sm' ? 12 : 14} />
          </button>
        )}
      </span>
    )
  }
)

Badge.displayName = 'Badge'

export { Badge }
export type { BadgeProps, BadgeVariant, BadgeStyle, BadgeCustomColors }
