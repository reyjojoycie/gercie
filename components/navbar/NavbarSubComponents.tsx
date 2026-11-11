// components/navbar/NavbarSubComponents.tsx
'use client'

import React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

import {
  ChevronRight,
  ExternalLink,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type NavbarBadgeVariant =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  // Legacy compatibility
  | 'gold'
  | 'warm'
  | 'burgundy'

export interface NavbarMenuItemProps {
  /** Libellé principal */
  label: string

  /** Icône optionnelle */
  icon?: React.ReactNode

  /** URL de destination */
  href?: string

  /** Description secondaire optionnelle */
  description?: string

  /** Badge texte ou nombre */
  badge?: string | number

  /** Variante du badge */
  badgeVariant?: NavbarBadgeVariant

  /** Callback au clic */
  onClick?: () => void

  /** Lien actif */
  active?: boolean

  /** Style danger, par exemple déconnexion */
  danger?: boolean

  /** Lien désactivé */
  disabled?: boolean

  /** Lien externe */
  external?: boolean

  /** Afficher une chevron à droite */
  showChevron?: boolean

  /** Classes additionnelles */
  className?: string
}

export interface NavbarMenuSeparatorProps {
  /** Label optionnel au centre du séparateur */
  label?: string

  /** Espacement vertical */
  spacing?: 'sm' | 'md' | 'lg'

  /** Classes additionnelles */
  className?: string
}

export interface NavbarMenuSectionProps {
  /** Titre de section */
  title?: string

  /** Icône optionnelle du titre */
  icon?: React.ReactNode

  /** Action optionnelle à droite du titre */
  action?: React.ReactNode

  /** Contenu de la section */
  children: React.ReactNode

  /** Classes additionnelles */
  className?: string
}

export interface NavbarUserMenuLink {
  /** Libellé affiché */
  label: string

  /** URL de destination */
  href: string

  /** Icône optionnelle */
  icon?: React.ReactNode

  /** Badge texte ou nombre */
  badge?: string | number

  /** Description secondaire optionnelle */
  description?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BADGE TOKENS                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const badgeStyles: Record<
  Exclude<NavbarBadgeVariant, 'gold' | 'warm' | 'burgundy'>,
  string
> = {
  accent: 'bg-accent-soft text-accent border-accent/20',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
  neutral: 'bg-muted text-fg-muted border-line',
}

function normalizeBadgeVariant(
  variant?: NavbarBadgeVariant
): keyof typeof badgeStyles {
  switch (variant) {
    case 'gold':
    case 'accent':
      return 'accent'

    case 'warm':
    case 'warning':
      return 'warning'

    case 'burgundy':
    case 'danger':
      return 'danger'

    case 'success':
      return 'success'

    case 'neutral':
    default:
      return 'neutral'
  }
}

function MenuBadge({
  children,
  variant = 'neutral',
}: {
  children?: React.ReactNode
  variant?: NavbarBadgeVariant
}) {
  if (children === undefined || children === null || children === '') return null

  const normalized = normalizeBadgeVariant(variant)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border px-1.5 py-0.5',
        'text-[10px] font-bold leading-none',
        badgeStyles[normalized]
      )}
    >
      {children}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MENU ITEM CONTENT                                              */
/* ═══════════════════════════════════════════════════════════════ */

function MenuItemContent({
  icon,
  label,
  description,
  badge,
  badgeVariant,
  active,
  danger,
  showChevron,
  external,
}: Pick<
  NavbarMenuItemProps,
  | 'icon'
  | 'label'
  | 'description'
  | 'badge'
  | 'badgeVariant'
  | 'active'
  | 'danger'
  | 'showChevron'
  | 'external'
>) {
  const hasBadge = badge !== undefined && badge !== null && badge !== ''

  return (
    <>
      {icon && (
        <span
          className={cn(
            'w-5 shrink-0 transition-colors duration-200',
            active
              ? 'text-accent'
              : danger
                ? 'text-danger'
                : 'text-fg-subtle group-hover:text-fg'
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {label}
        </span>

        {description && (
          <span
            className={cn(
              'mt-0.5 block truncate text-xs',
              danger ? 'text-danger/80' : 'text-fg-muted'
            )}
          >
            {description}
          </span>
        )}
      </span>

      {hasBadge && (
        <MenuBadge variant={badgeVariant}>
          {badge}
        </MenuBadge>
      )}

      {external ? (
        <ExternalLink
          size={14}
          className="shrink-0 text-fg-subtle transition-colors duration-200 group-hover:text-accent"
          aria-hidden="true"
        />
      ) : showChevron ? (
        <ChevronRight
          size={16}
          className={cn(
            'shrink-0 transition-colors duration-200',
            active
              ? 'text-accent'
              : danger
                ? 'text-danger'
                : 'text-fg-subtle group-hover:text-fg'
          )}
          aria-hidden="true"
        />
      ) : null}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CLASSES                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function getMenuClasses({
  variant,
  active,
  danger,
  disabled,
  className,
}: {
  variant: 'user' | 'mobile'
  active?: boolean
  danger?: boolean
  disabled?: boolean
  className?: string
}) {
  return cn(
    'group flex items-center gap-3 text-sm transition-colors duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',

    variant === 'user'
      ? 'rounded-control px-3 py-2.5'
      : 'min-h-11 rounded-control px-3 py-2.5',

    !danger && !active && 'text-fg hover:bg-muted',
    active && !danger && 'bg-accent-soft text-accent',
    danger && 'text-danger hover:bg-danger-soft',
    disabled && 'pointer-events-none opacity-50',

    className
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  USER MENU ITEM                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function UserMenuItem({
  href,
  icon,
  label,
  description,
  badge,
  badgeVariant = 'neutral',
  onClick,
  active = false,
  danger = false,
  disabled = false,
  external = false,
  showChevron = false,
  className,
}: NavbarMenuItemProps) {
  const classes = getMenuClasses({
    variant: 'user',
    active,
    danger,
    disabled,
    className,
  })

  const content = (
    <MenuItemContent
      icon={icon}
      label={label}
      description={description}
      badge={badge}
      badgeVariant={badgeVariant}
      active={active}
      danger={danger}
      showChevron={showChevron}
      external={external}
    />
  )

  const sharedProps = {
    className: classes,
    'data-menu-item': true,
    'aria-current': active ? ('page' as const) : undefined,
    'aria-disabled': disabled || undefined,
  }

  if (disabled || !href) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        {...sharedProps}
      >
        {content}
      </button>
    )
  }

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        {...sharedProps}
      >
        {content}
      </a>
    )
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      {...sharedProps}
    >
      {content}
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MOBILE LINK                                                    */
/* ═══════════════════════════════════════════════════════════════ */

export function MobileLink({
  href,
  icon,
  label,
  description,
  badge,
  badgeVariant = 'neutral',
  onClick,
  active = false,
  danger = false,
  disabled = false,
  external = false,
  showChevron = false,
  className,
}: NavbarMenuItemProps) {
  const classes = getMenuClasses({
    variant: 'mobile',
    active,
    danger,
    disabled,
    className,
  })

  const content = (
    <MenuItemContent
      icon={icon}
      label={label}
      description={description}
      badge={badge}
      badgeVariant={badgeVariant}
      active={active}
      danger={danger}
      showChevron={showChevron}
      external={external}
    />
  )

  const sharedProps = {
    className: classes,
    'data-menu-item': true,
    'aria-current': active ? ('page' as const) : undefined,
    'aria-disabled': disabled || undefined,
  }

  if (disabled || !href) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        {...sharedProps}
      >
        {content}
      </button>
    )
  }

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        {...sharedProps}
      >
        {content}
      </a>
    )
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      {...sharedProps}
    >
      {content}
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SEPARATOR                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarMenuSeparator({
  label,
  spacing = 'md',
  className,
}: NavbarMenuSeparatorProps) {
  const spacingClasses = {
    sm: 'my-1',
    md: 'my-2',
    lg: 'my-3',
  }[spacing]

  if (!label) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        className={cn('border-t border-line', spacingClasses, className)}
      />
    )
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn('flex items-center gap-3', spacingClasses, className)}
    >
      <span className="h-px flex-1 bg-line" />

      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        {label}
      </span>

      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SECTION                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarMenuSection({
  title,
  icon,
  action,
  children,
  className,
}: NavbarMenuSectionProps) {
  return (
    <section className={cn('py-1', className)}>
      {(title || action) && (
        <div className="mb-1 flex items-center justify-between px-3 py-1.5">
          {title && (
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              {icon && (
                <span
                  className="text-accent"
                  aria-hidden="true"
                >
                  {icon}
                </span>
              )}

              <span>{title}</span>
            </div>
          )}

          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ALIASES                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export {
  UserMenuItem as NavbarMenuItem,
  MobileLink as NavbarMobileLink,
  NavbarMenuSeparator as NavbarMenuDivider,
}