// components/ui/Button.tsx
'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Tooltip } from '@/components/ui/Tooltip'

/* ═══════════════════════════════════════════════════════════════ */
/*  BUTTON VARIANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

const buttonVariants = cva(
  [
    'group/button relative inline-flex items-center justify-center gap-2',
    'whitespace-nowrap rounded-control font-medium leading-none select-none',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.98]',
    '[&>svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        /**
         * Bouton principal du design system.
         * - Mode clair : bleu saphir
         * - Mode sombre : or champagne sobre
         */
        primary:
          'bg-accent text-accent-contrast shadow-card hover:bg-accent-hover hover:shadow-card-hover',

        /**
         * Compatibilité ancienne.
         * Maintenant aligné sur le bouton principal.
         */
        brand:
          'bg-accent text-accent-contrast shadow-card hover:bg-accent-hover hover:shadow-card-hover',

        /**
         * Bouton secondaire premium.
         * Surface propre, bordure fine, hover discret.
         */
        secondary:
          'border border-line bg-surface text-fg shadow-card hover:border-line-strong hover:bg-raised',

        /**
         * Bouton outline sobre.
         * Utile pour actions secondaires visibles.
         */
        outline:
          'border border-line-strong bg-transparent text-fg hover:bg-muted hover:text-accent',

        /**
         * Bouton fantôme.
         * Très utile dans toolbars, cards, sections compactes.
         */
        ghost:
          'bg-transparent text-fg-muted hover:bg-muted hover:text-fg',

        /**
         * Action destructive.
         */
        danger:
          'bg-danger text-white shadow-card hover:bg-danger-600 focus-visible:ring-danger',

        /**
         * Ancien variant "accent" vert jade.
         * Reconverti en succès / confirmation.
         */
        accent:
          'bg-success text-white shadow-card hover:bg-success-600 focus-visible:ring-success',

        /**
         * Ancien variant warm.
         * Reconverti en avertissement contrôlé.
         */
        warm:
          'bg-warning text-white shadow-card hover:bg-warning-600 focus-visible:ring-warning',

        /**
         * Ancien variant luxury.
         * Devient un bouton d’accentuation soft, premium mais discret.
         */
        luxury:
          'border border-accent/30 bg-accent-soft text-accent hover:border-accent/50 hover:bg-accent-soft',

        /**
         * Compatibilité ancienne.
         * Anciennement bouton gold / luxe.
         * Maintenant aligné sur l’accent principal du thème.
         */
        luxe:
          'bg-accent text-accent-contrast shadow-card hover:bg-accent-hover hover:shadow-card-hover',

        /**
         * Compatibilité ancienne.
         * Anciennement bouton gold.
         * Maintenant aligné sur l’accent principal du thème.
         */
        gold:
          'bg-accent text-accent-contrast shadow-card hover:bg-accent-hover hover:shadow-card-hover',

        /**
         * Bouton glassmorphism maîtrisé.
         * À utiliser uniquement sur overlays, hero, modales, panneaux flottants.
         */
        glass:
          'border border-line/60 bg-surface/75 text-fg backdrop-blur-md shadow-soft hover:bg-surface/90',

        /**
         * Compatibilité ancienne.
         * Anciennement outline gold.
         * Maintenant outline accent.
         */
        'outline-gold':
          'border border-accent/40 bg-transparent text-accent hover:border-accent/60 hover:bg-accent-soft',

        /**
         * Compatibilité ancienne.
         * Anciennement gradient premium.
         * Maintenant bouton principal solide, plus professionnel.
         */
        'gradient-premium':
          'bg-accent text-accent-contrast shadow-card hover:bg-accent-hover hover:shadow-card-hover',

        /**
         * Compatibilité ancienne.
         * Anciennement gradient accent vert.
         * Maintenant succès / confirmation.
         */
        'gradient-accent':
          'bg-success text-white shadow-card hover:bg-success-600 focus-visible:ring-success',

        /**
         * Lien-bouton minimal.
         * Utile pour "Voir tout", "En savoir plus", actions discrètes.
         */
        minimal:
          'bg-transparent text-fg-muted underline-offset-4 hover:text-accent hover:underline',
      },

      size: {
        xs: 'h-8 min-h-8 px-3 text-xs',
        sm: 'h-9 min-h-9 px-3.5 text-sm',
        md: 'h-10 min-h-10 px-4 text-sm',
        default: 'h-10 min-h-10 px-4 text-sm',
        lg: 'h-11 min-h-11 px-5 text-base',
        xl: 'h-12 min-h-12 px-6 text-base',
        'icon-sm': 'h-8 w-8 p-0',
        icon: 'h-10 w-10 p-0',
        'icon-lg': 'h-11 w-11 p-0',
      },

      fullWidth: {
        true: 'w-full',
      },

      rounded: {
        true: 'rounded-pill',
      },

      glowing: {
        true: 'shadow-medium',
      },

      hoverScale: {
        true: 'hover:scale-[1.02]',
      },

      pulse: {
        true: 'animate-pulse-soft',
      },
    },

    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
      rounded: false,
      glowing: false,
      hoverScale: false,
      pulse: false,
    },
  }
)

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  loadingText?: React.ReactNode
  tooltip?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BUTTON                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      rounded,
      glowing,
      hoverScale,
      pulse,
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      loadingText,
      tooltip,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    const buttonElement = (
      <button
        ref={ref}
        className={cn(
          buttonVariants({
            variant,
            size,
            fullWidth,
            rounded,
            glowing,
            hoverScale,
            pulse,
          }),
          // Évite la double animation :
          // si hoverScale est actif, on neutralise le active:scale de base.
          hoverScale ? 'active:scale-100' : '',
          className
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        data-loading={loading ? 'true' : undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2
              className="h-4 w-4 animate-spin"
              aria-hidden="true"
            />
            {loadingText ?? children}
          </>
        ) : (
          <>
            {leftIcon}
            {children}
            {rightIcon}
          </>
        )}
      </button>
    )

    if (tooltip) {
      return (
        <Tooltip content={tooltip} position="top">
          {buttonElement}
        </Tooltip>
      )
    }

    return buttonElement
  }
)

Button.displayName = 'Button'

export { Button, buttonVariants }