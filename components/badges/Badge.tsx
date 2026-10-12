// components/badges/Badge.tsx
import React from 'react'
import { cn } from '@/lib/utils'
import { BadgeDefinition } from './badgeConfig'

interface BadgeProps {
  definition: BadgeDefinition
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Badge({ definition, size = 'sm', className }: BadgeProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-0.5 text-sm gap-1.5',
    lg: 'px-3 py-1 text-base gap-2',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium border backdrop-blur-sm',
        definition.color.bg,
        definition.color.text,
        definition.color.border,
        definition.color.bgDark,
        definition.color.textDark,
        definition.color.borderDark,
        sizeClasses[size],
        className
      )}
    >
      {definition.icon}
      {definition.label}
    </span>
  )
}