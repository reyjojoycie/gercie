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

  /**
   * Couleur du point.
   *
   * Idéalement, fournir une classe Tailwind complète avec le préfixe `before:`,
   * par exemple :
   *
   * ```tsx
   * dotColor="before:bg-success"
   * ```
   *
   * Pour compatibilité, les classes courantes sans préfixe sont aussi acceptées :
   *
   * ```tsx
   * dotColor="bg-success"
   * ```
   */
  dotColor?: string

  /** Label accessible du bouton de fermeture. */
  removeLabel?: string

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
  xs: 'px-1.5 py-0.5 text-[10px]',
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

const luxeGradientStyles: Record<ResolvedVariant, string> = {
  accent:
    'bg-gradient-to-r from-accent via-accent/90 to-accent/70 text-accent-contrast shadow-md ring-1 ring-white/10',
  success:
    'bg-gradient-to-r from-success via-success/90 to-success/70 text-success-contrast shadow-md ring-1 ring-white/10',
  warning:
    'bg-gradient-to-r from-warning via-warning/90 to-warning/70 text-warning-contrast shadow-md ring-1 ring-white/10',
  danger:
    'bg-gradient-to-r from-danger via-danger/90 to-danger/70 text-danger-contrast shadow-md ring-1 ring-white/10',
  info:
    'bg-gradient-to-r from-info via-info/90 to-info/70 text-info-contrast shadow-md ring-1 ring-white/10',
  neutral:
    'bg-gradient-to-r from-fg-subtle via-fg-muted to-fg-muted text-fg shadow-md ring-1 ring-white/10',
}

const styleMaps: Record<BadgeAppearance, Record<ResolvedVariant, string>> = {
  soft: softStyles,
  solid: solidStyles,
  outline: outlineStyles,
  gradient: gradientStyles,
  'luxe-gradient': luxeGradientStyles,
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DOT COLOR HELPERS                                              */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Map de fallback pour garantir que Tailwind génère bien les classes
 * `before:bg-*` les plus utilisées dans le projet.
 *
 * Si une classe inconnue est passée sans préfixe `before:`,
 * on tente quand même de la préfixer, mais elle devra exister
 * quelque part dans le source pour être générée par Tailwind.
 */
const knownDotColorMap: Record<string, string> = {
  'bg-current': 'before:bg-current',

  'bg-accent': 'before:bg-accent',
  'bg-success': 'before:bg-success',
  'bg-warning': 'before:bg-warning',
  'bg-danger': 'before:bg-danger',
  'bg-info': 'before:bg-info',
  'bg-muted': 'before:bg-muted',

  'bg-gold-400': 'before:bg-gold-400',
  'bg-gold-500': 'before:bg-gold-500',
  'bg-gold-600': 'before:bg-gold-600',

  'bg-green-500': 'before:bg-green-500',
  'bg-red-500': 'before:bg-red-500',
  'bg-blue-500': 'before:bg-blue-500',
  'bg-amber-500': 'before:bg-amber-500',
}

function normalizeDotColor(dotColor?: string): string {
  const raw = String(dotColor ?? '').trim()

  if (!raw) {
    return 'before:bg-current'
  }

  if (raw.startsWith('before:')) {
    return raw
  }

  return knownDotColorMap[raw] ?? `before:${raw}`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CHILDREN HELPERS                                               */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Important :
 * - `0` doit être rendu.
 * - `false`, `null`, `undefined`, `''` ne doivent pas créer de span vide inutile.
 */
function hasRenderableChildren(children: ReactNode): boolean {
  if (children == null || children === false || children === '') {
    return false
  }

  if (Array.isArray(children)) {
    return children.some((child) => hasRenderableChildren(child))
  }

  return true
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
      dotColor,
      removeLabel,
      onClose,
      disabled = false,
      customColors,
      children,
      ...rest
    },
    ref
  ) => {
    // `appearance` prime sur `style` (legacy)
    const resolvedAppearance: BadgeAppearance =
      appearance ?? style ?? 'soft'

    // Résolution de la variante
    const resolved = resolveVariant(variant)

    // Construction des classes
    let variantClasses: string

    if (resolved === 'custom') {
      if (customColors) {
        variantClasses = cn(
          customColors.bg,
          customColors.text,
          customColors.border ?? 'border border-line',
          customColors.bgDark,
          customColors.textDark,
          customColors.borderDark
        )
      } else {
        variantClasses = softStyles.neutral
      }
    } else {
      variantClasses =
        styleMaps[resolvedAppearance]?.[resolved] ?? softStyles.neutral
    }

    // Point coloré
    const dotClasses = dot
      ? cn(
          'relative',
          'before:absolute before:-right-0.5 before:-top-0.5',
          'before:h-1.5 before:w-1.5 before:rounded-full',
          'before:ring-2 before:ring-surface',
          normalizeDotColor(dotColor)
        )
      : ''

    const isCloseable = typeof onClose === 'function'
    const hasContent = hasRenderableChildren(children)

    /**
     * Padding sécurisé :
     * - dot seul : pr-2
     * - close seul : pr-1
     * - dot + close : pr-5 pour éviter tout chevauchement
     */
    const spacingClasses = cn(
      dot && isCloseable
        ? 'pr-5'
        : dot
          ? 'pr-2'
          : isCloseable
            ? 'pr-1'
            : ''
    )

    const closeLabel =
      removeLabel ??
      (typeof children === 'string' && children.trim()
        ? `Retirer ${children.trim()}`
        : 'Retirer')

    return (
      <span
        ref={ref}
        className={cn(
          baseClasses,
          sizeClasses[size] ?? sizeClasses.sm,
          variantClasses,
          spacingClasses,
          dotClasses,
          disabled && 'pointer-events-none opacity-50',
          className
        )}
        aria-disabled={disabled || undefined}
        {...rest}
      >
        {leftIcon != null ? (
          <span
            className="inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        ) : null}

        {hasContent ? (
          <span className="truncate whitespace-nowrap">{children}</span>
        ) : null}

        {rightIcon != null ? (
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
              if (!disabled) onClose?.()
            }}
            disabled={disabled}
            aria-label={closeLabel}
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