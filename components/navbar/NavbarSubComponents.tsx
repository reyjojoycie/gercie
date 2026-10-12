// components/navbar/NavbarSubComponents.tsx
'use client'

import React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

/* ==========================================================================
   UserMenuItem – lien dans un menu utilisateur (desktop / mobile)
   ========================================================================== */
interface UserMenuItemProps {
  href: string
  icon: React.ReactNode
  label: string
  badge?: number | string
  onClick?: () => void
  className?: string
}

export function UserMenuItem({
  href,
  icon,
  label,
  badge,
  onClick,
  className,
}: UserMenuItemProps) {
  const badgeContent =
    badge !== undefined && Number(badge) > 0 ? (
      <Badge variant="gold" size="sm">
        {badge}
      </Badge>
    ) : null

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-gold-400/10 hover:text-gold-600 dark:hover:text-gold-400 transition-colors',
        className
      )}
    >
      <span className="text-neutral-400 dark:text-neutral-500 w-5 flex-shrink-0">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {badgeContent}
    </Link>
  )
}

/* ==========================================================================
   MobileLink – lien dans le panneau mobile
   ========================================================================== */
interface MobileLinkProps {
  href?: string
  icon: React.ReactNode
  label: string
  onClick?: () => void
  className?: string
}

export function MobileLink({
  href,
  icon,
  label,
  onClick,
  className,
}: MobileLinkProps) {
  if (!href) return null
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-neutral-700 dark:text-neutral-300 hover:bg-gold-400/10 hover:text-gold-600 transition-colors',
        className
      )}
    >
      <span className="text-neutral-400 dark:text-neutral-500">{icon}</span>
      {label}
    </Link>
  )
}

/* ==========================================================================
   Composant utilitaire : séparateur dans les menus
   ========================================================================== */
export function NavbarMenuSeparator({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'my-1 border-t border-neutral-200 dark:border-midnight-500/30',
        className
      )}
    />
  )
}