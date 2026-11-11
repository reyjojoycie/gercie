// components/ui/EmptyState.tsx
'use client'

import React, { type ReactNode } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

import { Button } from './Button'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface EmptyStateProps {
  /** Titre principal */
  title?: string
  /** Description secondaire */
  description?: string
  /** Icône ReactNode personnalisée */
  icon?: ReactNode
  /** Label de l’action principale */
  actionLabel?: string
  /** Callback au clic sur l’action principale */
  onAction?: () => void
  /** Lien de l’action principale (prioritaire sur onAction) */
  actionHref?: string
  /** Label de l’action secondaire */
  secondaryActionLabel?: string
  /** Callback au clic sur l’action secondaire */
  onSecondaryAction?: () => void
  /** Lien de l’action secondaire */
  secondaryActionHref?: string
  /** Contenu additionnel affiché sous les actions */
  footer?: ReactNode
  /** Classe additionnelle sur le conteneur */
  className?: string
  /** Mode compact (pour petits espaces) */
  compact?: boolean
  /** Classe additionnelle sur l’icône */
  iconBgClass?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DEFAULT ICON                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function DefaultEmptyIcon({ compact }: { compact: boolean }) {
  return (
    <svg
      className={cn(
        compact ? 'h-7 w-7' : 'h-10 w-10',
        'text-fg-subtle'
      )}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function EmptyState({
  title = 'Aucun résultat',
  description = 'Aucune donnée à afficher pour le moment.',
  icon,
  actionLabel,
  onAction,
  actionHref,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionHref,
  footer,
  className,
  compact = false,
  iconBgClass,
}: EmptyStateProps) {
  const paddingY = compact ? 'py-10' : 'py-16 sm:py-20'
  const iconBoxSize = compact ? 'h-12 w-12' : 'h-16 w-16 sm:h-20 sm:w-20'
  const titleSize = compact ? 'text-base' : 'text-lg sm:text-xl'

  /* ───────────────────────────────────────────────────────────── */
  /*  PRIMARY ACTION                                               */
  /* ───────────────────────────────────────────────────────────── */

  const primaryAction = (() => {
    if (!actionLabel) return null

    if (actionHref) {
      return (
        <Link
          href={actionHref}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-pill',
            'bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast shadow-card',
            'transition-colors duration-200',
            'hover:bg-accent-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
            compact ? 'text-xs' : 'sm:px-5 sm:py-2.5 sm:text-sm'
          )}
        >
          {actionLabel}
        </Link>
      )
    }

    if (typeof onAction === 'function') {
      return (
        <Button
          variant="primary"
          size={compact ? 'sm' : 'md'}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )
    }

    return null
  })()

  /* ───────────────────────────────────────────────────────────── */
  /*  SECONDARY ACTION                                             */
  /* ───────────────────────────────────────────────────────────── */

  const secondaryAction = (() => {
    if (!secondaryActionLabel) return null

    if (secondaryActionHref) {
      return (
        <Link
          href={secondaryActionHref}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-pill',
            'border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-card',
            'transition-colors duration-200',
            'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
            compact ? 'text-xs' : 'sm:px-5 sm:py-2.5 sm:text-sm'
          )}
        >
          {secondaryActionLabel}
        </Link>
      )
    }

    if (typeof onSecondaryAction === 'function') {
      return (
        <Button
          variant="outline"
          size={compact ? 'sm' : 'md'}
          onClick={onSecondaryAction}
        >
          {secondaryActionLabel}
        </Button>
      )
    }

    return null
  })()

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        paddingY,
        className
      )}
    >
      {/* ──────────────────────────────────────────────────────── */}
      {/*  ICÔNE                                                  */}
      {/* ──────────────────────────────────────────────────────── */}
      {icon ? (
        <div
          className={cn(
            'mb-5 flex items-center justify-center text-fg-subtle',
            compact ? 'h-12 w-12' : 'h-16 w-16 sm:h-20 sm:w-20',
            iconBgClass
          )}
        >
          {icon}
        </div>
      ) : (
        <div
          className={cn(
            'mb-5 flex items-center justify-center rounded-full',
            'border border-line bg-muted',
            iconBoxSize,
            iconBgClass
          )}
        >
          <DefaultEmptyIcon compact={compact} />
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/*  TITRE                                                  */}
      {/* ──────────────────────────────────────────────────────── */}
      <h3
        className={cn(
          'mb-2 font-semibold tracking-tight text-fg',
          titleSize
        )}
      >
        {title}
      </h3>

      {/* ──────────────────────────────────────────────────────── */}
      {/*  DESCRIPTION                                            */}
      {/* ──────────────────────────────────────────────────────── */}
      <p
        className={cn(
          'mb-8 max-w-md text-sm leading-relaxed text-fg-muted',
          !compact && 'sm:text-base'
        )}
      >
        {description}
      </p>

      {/* ──────────────────────────────────────────────────────── */}
      {/*  ACTIONS                                                */}
      {/* ──────────────────────────────────────────────────────── */}
      {(primaryAction || secondaryAction) ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {primaryAction}
          {secondaryAction}
        </div>
      ) : null}

      {/* ──────────────────────────────────────────────────────── */}
      {/*  FOOTER                                                 */}
      {/* ──────────────────────────────────────────────────────── */}
      {footer ? (
        <div className="mt-8 w-full max-w-sm">{footer}</div>
      ) : null}
    </div>
  )
}

export default EmptyState