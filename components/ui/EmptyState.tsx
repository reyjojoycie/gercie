// components/ui/EmptyState.tsx
import React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import Link from 'next/link'

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  actionHref?: string
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  secondaryActionHref?: string
  /** Contenu additionnel affiché en bas (footer) */
  footer?: React.ReactNode
  className?: string
  compact?: boolean
  iconBgClass?: string
}

const EmptyState: React.FC<EmptyStateProps> = ({
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
}) => {
  const ActionButton = actionHref ? (
    <Link href={actionHref}>
      <Button variant="primary" size={compact ? 'sm' : 'md'}>
        {actionLabel}
      </Button>
    </Link>
  ) : actionLabel && onAction ? (
    <Button variant="primary" size={compact ? 'sm' : 'md'} onClick={onAction}>
      {actionLabel}
    </Button>
  ) : null

  const SecondaryButton = secondaryActionHref ? (
    <Link href={secondaryActionHref} className="mt-2 sm:mt-0 sm:ml-3">
      <Button variant="outline" size={compact ? 'sm' : 'md'}>
        {secondaryActionLabel}
      </Button>
    </Link>
  ) : secondaryActionLabel && onSecondaryAction ? (
    <Button variant="outline" size={compact ? 'sm' : 'md'} onClick={onSecondaryAction} className="mt-2 sm:mt-0 sm:ml-3">
      {secondaryActionLabel}
    </Button>
  ) : null

  const paddingY = compact ? 'py-10' : 'py-20'
  const iconSize = compact ? 'h-14 w-14' : 'h-20 w-20'
  const titleSize = compact ? 'text-base' : 'text-xl'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        paddingY,
        className
      )}
    >
      {/* Icône personnalisée ou icône par défaut améliorée */}
      {icon ? (
        <div className={cn('mb-6 text-neutral-400 dark:text-neutral-500', iconBgClass)}>
          {icon}
        </div>
      ) : (
        <div
          className={cn(
            'mb-6 rounded-full flex items-center justify-center',
            'bg-neutral-100 dark:bg-midnight-800/40 border border-neutral-200 dark:border-midnight-600/30',
            iconSize,
            iconBgClass
          )}
        >
          <svg
            className={cn(compact ? 'w-8 h-8' : 'w-12 h-12', 'text-neutral-300 dark:text-neutral-500')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            />
          </svg>
        </div>
      )}
      <h3
        className={cn(
          'font-semibold text-neutral-900 dark:text-neutral-100 mb-2',
          titleSize
        )}
      >
        {title}
      </h3>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md mb-8 leading-relaxed">
        {description}
      </p>
      <div className="flex flex-wrap justify-center items-center gap-3">
        {ActionButton}
        {SecondaryButton}
      </div>
      {footer && (
        <div className="mt-8 w-full max-w-sm">{footer}</div>
      )}
    </div>
  )
}

export { EmptyState }
