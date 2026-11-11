// components/ui/Badge.tsx
'use client'

import React, { type ReactNode } from 'react'

import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type BadgeVariant =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  // ─────────────────────────────────────────────────────────────
  // Variantes legacy conservées pour compatibilité.
  // Elles sont automatiquement mappées vers les tokens sémantiques.
  // ─────────────────────────────────────────────────────────────
  | 'brand'
  | 'warm'
  | 'luxury'
  | 'gold'
  | 'secondary'
  | 'custom'

export type BadgeAppearance =
  | 'soft'
  | 'solid'
  | 'outline'
  | 'gradient'
  | 'luxe-gradient'

export interface BadgeCustomColors {
  bg: string
  text: string
  border?: string
  bgDark?: string
  textDark?: string
  borderDark?: string
}

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  /** Variante sémantique ou legacy. */
  variant?: BadgeVariant
  /** Taille du badge. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /**
   * @deprecated Utiliser `appearance` à la place pour éviter
   * le conflit avec le `style` HTML natif.
   */
  style?: BadgeAppearance
  /** Apparence visuelle (recommandé). */
  appearance?: BadgeAppearance
  /** Icône à gauche du contenu. */
  leftIcon?: ReactNode
  /** Icône à droite du contenu. */
  rightIcon?: ReactNode
  /** Affiche un point coloré en haut à droite. */
  dot?: boolean
  /** Couleur du point (classe Tailwind, ex: `bg-success`). */
  dotColor?: string
  /** Affiche un bouton de fermeture. */
  onClose?: () => void
  /** État désactivé. */
  disabled?: boolean
  /** Couleurs personnalisées (uniquement si `variant="custom"`). */
  customColors?: BadgeCustomColors
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT MAPPING (legacy → sémantique)                          */
/* ═══════════════════════════════════════════════════════════════ */

type ResolvedVariant =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

function resolveVariant(variant: BadgeVariant): ResolvedVariant | 'custom' {
  switch (variant) {
    case 'accent':
    case 'brand':
    case 'luxury':
      return 'accent'
    case 'success':
      return 'success'
    case 'warning':
    case 'warm':
    case 'gold':
      return 'warning'
    case 'danger':
      return 'danger'
    case 'info':
      return 'info'
    case 'neutral':
    case 'secondary':
      return 'neutral'
    case 'custom':
      return 'custom'
    default:
      return 'neutral'
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLE MAPS                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const baseClasses =
  'inline-flex items-center gap-1 rounded-full font-semibold leading-none transition-colors duration-200 motion-reduce:transition-none'

const sizeClasses: Record<string, string> = {
  xs: 'px-1.5 py-0.5 text-[9px]',
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
}

const softStyles: Record<ResolvedVariant, string> = {
  accent: 'border border-accent/20 bg-accent-soft text-accent',
  success: 'border border-success/20 bg-success-soft text-success',
  warning: 'border border-warning/20 bg-warning-soft text-warning',
  danger: 'border border-danger/20 bg-danger-soft text-danger',
  info: 'border border-info/20 bg-info-soft text-info',
  neutral: 'border border-line bg-muted text-fg-muted',
}

const solidStyles: Record<ResolvedVariant, string> = {
  accent: 'bg-accent text-accent-contrast shadow-sm',
  success: 'bg-success text-success-contrast shadow-sm',
  warning: 'bg-warning text-warning-contrast shadow-sm',
  danger: 'bg-danger text-danger-contrast shadow-sm',
  info: 'bg-info text-info-contrast shadow-sm',
  neutral: 'bg-fg-subtle text-fg shadow-sm',
}

const outlineStyles: Record<ResolvedVariant, string> = {
  accent: 'border border-accent/40 text-accent',
  success: 'border border-success/40 text-success',
  warning: 'border border-warning/40 text-warning',
  danger: 'border border-danger/40 text-danger',
  info: 'border border-info/40 text-info',
  neutral: 'border border-line text-fg-muted',
}

const gradientStyles: Record<ResolvedVariant, string> = {
  accent:
    'bg-gradient-to-r from-accent to-accent/80 text-accent-contrast shadow-sm',
  success:
    'bg-gradient-to-r from-success to-success/80 text-success-contrast shadow-sm',
  warning:
    'bg-gradient-to-r from-warning to-warning/80 text-warning-contrast shadow-sm',
  danger:
    'bg-gradient-to-r from-danger to-danger/80 text-danger-contrast shadow-sm',
  info:
    'bg-gradient-to-r from-info to-info/80 text-info-contrast shadow-sm',
  neutral:
    'bg-gradient-to-r from-fg-subtle to-fg-muted text-fg shadow-sm',
}

const styleMaps: Record<BadgeAppearance, Record<ResolvedVariant, string>> = {
  soft: softStyles,
  solid: solidStyles,
  outline: outlineStyles,
  gradient: gradientStyles,
  'luxe-gradient': gradientStyles,
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant = 'neutral',
      size = 'sm',
      style,
      appearance,
      leftIcon,
      rightIcon,
      dot = false,
      dotColor = 'bg-current',
      onClose,
      disabled = false,
      customColors,
      children,
      ...rest
    },
    ref
  ) => {
    // `appearance` prime sur `style` (legacy)
    const resolvedAppearance: BadgeAppearance = appearance ?? style ?? 'soft'

    // Résolution de la variante
    const resolved = resolveVariant(variant)

    // Construction des classes
    let variantClasses: string

    if (resolved === 'custom' && customColors) {
      variantClasses = cn(
        customColors.bg,
        customColors.text,
        customColors.border ?? 'border border-line',
        customColors.bgDark,
        customColors.textDark,
        customColors.borderDark
      )
    } else if (resolved !== 'custom') {
      variantClasses =
        styleMaps[resolvedAppearance]?.[resolved] ??
        softStyles.neutral
    } else {
      variantClasses = softStyles.neutral
    }

    // Point coloré
    const dotClasses = dot
      ? cn(
          'relative',
          'before:absolute before:-right-0.5 before:-top-0.5',
          'before:h-1.5 before:w-1.5 before:rounded-full',
          'before:ring-2 before:ring-surface',
          dotColor
        )
      : ''

    const isCloseable = typeof onClose === 'function'

    return (
      <span
        ref={ref}
        className={cn(
          baseClasses,
          sizeClasses[size] ?? sizeClasses.sm,
          variantClasses,
          dot && 'pr-2',
          dotClasses,
          disabled && 'pointer-events-none opacity-50',
          isCloseable && 'pr-1',
          className
        )}
        aria-disabled={disabled || undefined}
        {...rest}
      >
        {leftIcon ? (
          <span
            className="inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        ) : null}

        {children ? (
          <span className="truncate whitespace-nowrap">{children}</span>
        ) : null}

        {rightIcon ? (
          <span
            className="inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        ) : null}

        {isCloseable ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              if (!disabled) onClose()
            }}
            disabled={disabled}
            aria-label="Retirer"
            className={cn(
              '-mr-0.5 ml-0.5 inline-flex shrink-0 items-center justify-center',
              'rounded-full p-0.5',
              'transition-colors duration-200 motion-reduce:transition-none',
              'hover:bg-black/10 dark:hover:bg-white/15',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              disabled && 'pointer-events-none'
            )}
          >
            <X
              size={size === 'xs' || size === 'sm' ? 10 : 12}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </span>
    )
  }
)

Badge.displayName = 'Badge'

export default Badge