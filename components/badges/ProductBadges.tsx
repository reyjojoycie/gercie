// components/badges/ProductBadges.tsx
import React, { useMemo } from 'react'
import { BADGE_DEFINITIONS, BadgeDefinition } from './badgeConfig'
import { BadgeContainer } from './BadgeContainer'

interface ProductBadgesProps {
  badgeIds: string[]
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ProductBadges({ badgeIds, size = 'sm', className }: ProductBadgesProps) {
  const definitions = useMemo(() => {
    return badgeIds
      .map(id => BADGE_DEFINITIONS.find(d => d.id === id))
      .filter((d): d is BadgeDefinition => !!d)
  }, [badgeIds])

  return <BadgeContainer badges={definitions} size={size} className={className} />
}