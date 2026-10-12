// components/badges/BadgeContainer.tsx
import React from 'react'
import { cn } from '@/lib/utils'
import { BadgeDefinition } from './badgeConfig'
import { Badge } from '@/components/ui/Badge' // notre Badge existant avec custom

interface BadgeContainerProps {
  badges: BadgeDefinition[]
  max?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function BadgeContainer({ badges, max = 3, size = 'sm', className }: BadgeContainerProps) {
  const sorted = [...badges].sort((a, b) => a.priority - b.priority)
  const displayed = sorted.slice(0, max)

  if (displayed.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {displayed.map((def) => (
        <Badge
          key={def.id}
          variant="custom"
          size={size}
          customColors={def.color}
          leftIcon={def.icon}
        >
          {def.label}
        </Badge>
      ))}
      {badges.length > max && (
        <span className="text-xs text-muted-foreground self-center ml-1">
          +{badges.length - max}
        </span>
      )}
    </div>
  )
}