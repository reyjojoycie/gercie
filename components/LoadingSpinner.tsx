// components/ui/Spinner.tsx
'use client'

import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'brand' | 'accent' | 'warm' | 'neutral' | 'white'
  label?: string
  className?: string
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
}

const variantMap = {
  brand: 'text-brand-600 dark:text-brand-400',
  accent: 'text-accent-600 dark:text-accent-400',
  warm: 'text-warm-600 dark:text-warm-400',
  neutral: 'text-neutral-600 dark:text-neutral-400',
  white: 'text-white',
}

export function Spinner({
  size = 'md',
  variant = 'brand',
  label,
  className,
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label || 'Chargement'}
      className={cn('inline-flex flex-col items-center justify-center gap-2', className)}
    >
      <Loader2 className={cn('animate-spin', sizeMap[size], variantMap[variant])} />
      {label && (
        <span className={cn('text-sm', variantMap[variant])}>
          {label}
        </span>
      )}
      <span className="sr-only">Chargement...</span>
    </div>
  )
}
