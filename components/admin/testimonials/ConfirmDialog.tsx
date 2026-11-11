// components/admin/testimonials/ConfirmDialog.tsx
'use client'

import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  variant?: 'danger' | 'warning' | 'info'
  confirmLabel?: string
  cancelLabel?: string
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title = 'Confirmation',
  message,
  variant = 'danger',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  isLoading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }

    document.addEventListener('keydown', handleKeyDown)

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [onCancel, open])

  if (!open) return null

  const variantClasses =
    variant === 'danger'
      ? 'border-red-200 dark:border-red-900/40'
      : variant === 'warning'
        ? 'border-amber-200 dark:border-amber-900/40'
        : 'border-blue-200 dark:border-blue-900/40'

  const iconClasses =
    variant === 'danger'
      ? 'text-red-500'
      : variant === 'warning'
        ? 'text-amber-500'
        : 'text-blue-500'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl',
          variantClasses
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className={cn('mt-0.5', iconClasses)} />

            <div>
              <h3 className="text-lg font-bold text-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>

          <Button
            variant={variant === 'danger' ? 'danger' : 'luxe'}
            onClick={onConfirm}
            loading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}