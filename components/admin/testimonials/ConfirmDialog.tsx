// components/admin/testimonials/ConfirmDialog.tsx
'use client'

import { useEffect, useRef, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Trash2,
  HelpCircle,
  X,
  Loader2
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
export type ConfirmVariant = 'danger' | 'warning' | 'info'

interface ConfirmDialogProps {
  /** Contrôle l'ouverture du dialogue */
  open: boolean
  /** Message principal (peut être complété par `description`) */
  message: string
  /** Titre optionnel (apparaît en haut) */
  title?: string
  /** Description secondaire (affichée sous le message) */
  description?: string
  /** Variante visuelle */
  variant?: ConfirmVariant
  /** Texte du bouton de confirmation */
  confirmLabel?: string
  /** Texte du bouton d'annulation */
  cancelLabel?: string
  /** Action à exécuter lors de la confirmation */
  onConfirm: () => void | Promise<void>
  /** Action lors de l'annulation */
  onCancel: () => void
  /** Indique si la confirmation est en cours (désactive le bouton) */
  isLoading?: boolean
  /** Taille du dialogue */
  size?: 'sm' | 'md' | 'lg'
  /** Alignement du texte */
  align?: 'left' | 'center'
  /** Fermer le dialogue en cliquant à l'extérieur */
  closeOnOutsideClick?: boolean
  /** Icône personnalisée (remplace l'icône par défaut de la variante) */
  icon?: ReactNode
  /** Contenu additionnel (par ex. formulaire) */
  children?: ReactNode
  /** Action secondaire optionnelle (ex: "Archiver") */
  secondaryAction?: {
    label: string
    onClick: () => void
  }
}

/* ========================================================================== */
/*  Configuration par variante                                                 */
/* ========================================================================== */
const variantConfig: Record<
  ConfirmVariant,
  {
    icon: React.ElementType
    iconColor: string
    bgIcon: string
    buttonClass: string
    ringColor: string
  }
> = {
  danger: {
    icon: Trash2,
    iconColor: 'text-red-500',
    bgIcon: 'bg-red-100 dark:bg-red-900/30',
    buttonClass: 'bg-red-500 hover:bg-red-600 text-white',
    ringColor: 'focus:ring-red-400/50'
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    bgIcon: 'bg-amber-100 dark:bg-amber-900/30',
    buttonClass: 'bg-amber-500 hover:bg-amber-600 text-white',
    ringColor: 'focus:ring-amber-400/50'
  },
  info: {
    icon: HelpCircle,
    iconColor: 'text-blue-500',
    bgIcon: 'bg-blue-100 dark:bg-blue-900/30',
    buttonClass: 'bg-blue-500 hover:bg-blue-600 text-white',
    ringColor: 'focus:ring-blue-400/50'
  }
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */
export function ConfirmDialog({
  open,
  message,
  title,
  description,
  variant = 'danger',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  isLoading = false,
  size = 'sm',
  align = 'center',
  closeOnOutsideClick = true,
  icon,
  children,
  secondaryAction
}: ConfirmDialogProps) {
  const config = variantConfig[variant]
  const IconComponent = icon ?? (config.icon as React.ElementType)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  // Piège de focus et touche Échap
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
      // Optionnel : piège de focus basique
      if (e.key === 'Tab') {
        // on peut améliorer avec un vrai focus trap, ici on laisse le comportement natif
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Empêcher le scroll du body
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onCancel])

  // Focus sur le bouton Annuler à l'ouverture (meilleure pratique)
  useEffect(() => {
    if (open) {
      // petit délai pour que l'animation soit prête
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Gestionnaire de confirmation asynchrone
  const handleConfirm = useCallback(async () => {
    // Si isLoading, ne rien faire
    if (isLoading) return
    // On peut supporter les fonctions asynchrones
    await onConfirm()
  }, [onConfirm, isLoading])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeOnOutsideClick ? onCancel : undefined}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={title ? 'confirm-dialog-title' : undefined}
          aria-describedby="confirm-dialog-message"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'bg-card rounded-2xl border border-border shadow-strong w-full',
              size === 'sm' ? 'max-w-sm' : size === 'md' ? 'max-w-md' : 'max-w-lg',
              'p-6'
            )}
          >
            {/* Icône (si pas de children personnalisé qui remplace tout) */}
            {!children && (
              <div className="flex justify-center mb-4">
                <div
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    config.bgIcon
                  )}
                >
                  <IconComponent size={24} className={config.iconColor} />
                </div>
              </div>
            )}

            {/* Titre (optionnel) */}
            {title && (
              <h2
                id="confirm-dialog-title"
                className={cn(
                  'text-lg font-semibold text-foreground mb-2',
                  align === 'center' && 'text-center'
                )}
              >
                {title}
              </h2>
            )}

            {/* Message principal */}
            <p
              id="confirm-dialog-message"
              className={cn(
                'text-sm text-foreground mb-1',
                align === 'center' && 'text-center'
              )}
            >
              {message}
            </p>

            {/* Description secondaire */}
            {description && (
              <p
                className={cn(
                  'text-xs text-muted-foreground mb-4',
                  align === 'center' && 'text-center'
                )}
              >
                {description}
              </p>
            )}

            {/* Contenu additionnel (formulaire, etc.) */}
            {children}

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              {/* Action secondaire (optionnelle) */}
              {secondaryAction && (
                <Button
                  variant="outline"
                  onClick={secondaryAction.onClick}
                  disabled={isLoading}
                >
                  {secondaryAction.label}
                </Button>
              )}

              <Button
                ref={cancelButtonRef}
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                {cancelLabel}
              </Button>

              <Button
                onClick={handleConfirm}
                disabled={isLoading}
                className={cn(config.buttonClass, 'min-w-[100px] justify-center')}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-1" />
                    {confirmLabel.replace(/^(\w+)/, '$1...')}
                  </>
                ) : (
                  confirmLabel
                )}
              </Button>
            </div>

            {/* Bouton de fermeture croix (optionnel, en haut à droite) */}
            <button
              onClick={onCancel}
              className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default ConfirmDialog