// components/ui/Button.tsx
'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Tooltip } from '@/components/ui/Tooltip'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium',
    'transition-[color,box-shadow,transform,background-color] duration-200 ease-out',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-midnight-950',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none',
    'active:scale-[0.98] active:transition-transform active:duration-75',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-brand text-white shadow-soft hover:shadow-medium focus:ring-brand-500/50',
        // Alias de compatibilité : même rendu que primary
        brand:
          'bg-gradient-brand text-white shadow-soft hover:shadow-medium focus:ring-brand-500/50',
        secondary:
          'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 focus:ring-neutral-400 ' +
          'dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:ring-neutral-500',
        outline:
          'border-2 border-neutral-300 text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400 focus:ring-brand-500/50 ' +
          'dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:border-neutral-600',
        ghost:
          'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus:ring-neutral-400 ' +
          'dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
        danger:
          'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/50 shadow-soft',
        accent:
          'bg-accent-600 text-white hover:bg-accent-700 focus:ring-accent-500/50 shadow-soft',
        warm:
          'bg-warm-500 text-white dark:text-white hover:bg-warm-600 dark:hover:bg-warm-700 focus:ring-warm-500/50 shadow-soft',
        luxury:
          'bg-luxury-600 text-white hover:bg-luxury-700 focus:ring-luxury-500/50 shadow-soft',

        // Variante premium sans hover:scale pour éviter la double animation.
        luxe:
          'bg-gradient-gold text-white shadow-gold hover:shadow-glow-gold focus:ring-gold-500/50 dark:text-gold-100 dark:hover:shadow-glow-gold/50',

        // Alias de compatibilité : même rendu que luxe
        gold:
          'bg-gradient-gold text-white shadow-gold hover:shadow-glow-gold focus:ring-gold-500/50 dark:text-gold-100 dark:hover:shadow-glow-gold/50',

        glass:
          'bg-white/10 dark:bg-midnight-800/30 backdrop-blur-xl border border-white/20 dark:border-midnight-500/30 text-white dark:text-neutral-100 hover:bg-white/20 dark:hover:bg-midnight-700/50 shadow-soft',
        'outline-gold':
          'border-2 border-gold-400 text-gold-400 bg-transparent hover:bg-gold-400/10 hover:border-gold-300 focus:ring-gold-500/50 shadow-sm hover:shadow-gold',
        'gradient-premium':
          'bg-gradient-premium text-white shadow-soft hover:shadow-medium focus:ring-brand-500/50',
        'gradient-accent':
          'bg-gradient-accent text-white shadow-soft hover:shadow-medium focus:ring-accent-500/50',
        minimal:
          'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 underline-offset-2 hover:underline',
      },
      size: {
        xs: 'px-2.5 py-1.5 text-xs',
        sm: 'px-3 py-2 text-sm',
        md: 'px-4 py-2.5 text-sm',
        // Alias de compatibilité : même taille que md
        default: 'px-4 py-2.5 text-sm',
        lg: 'px-5 py-3 text-base',
        xl: 'px-6 py-3.5 text-base',
        'icon-sm': 'p-1.5',
        icon: 'p-2',
        'icon-lg': 'p-2.5',
      },
      fullWidth: {
        true: 'w-full',
      },
      rounded: {
        true: 'rounded-full',
      },
      glowing: {
        true: 'focus:ring-4',
      },
      hoverScale: {
        true: 'hover:scale-[1.03]',
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

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  loadingText?: string
  tooltip?: string
}

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
    const loaderSize = size?.startsWith('icon') ? 'h-4 w-4' : 'h-4 w-4'
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
            className,
          }),
          // Évite la double animation : si hoverScale est actif,
          // on neutralise le active:scale de base.
          hoverScale ? 'active:scale-100' : ''
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2
              className={cn('animate-spin', loaderSize)}
              aria-hidden="true"
            />

            {loadingText ? <span>{loadingText}</span> : children}
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
