// components/admin/OrderTimeline.tsx
'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Truck,
  Package,
  CreditCard,
  ShoppingCart,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Eye,
  ExternalLink,
  Info,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface TimelineStep {
  /** Identifiant unique de l'étape (ex: 'en_attente', 'payee', …) */
  id: string
  /** Libellé affiché */
  label: string
  /** Date de l'événement (ISO string) */
  date: string
  /** L'étape est‑elle complétée ? */
  completed: boolean
  /** Étape active (actuellement en cours) */
  active?: boolean
  /** Étape annulée / en erreur */
  error?: boolean
  /** Description optionnelle */
  description?: string
  /** Commentaire additionnel (ex: commentaire de l'admin) */
  comment?: string
  /** Actions associées à cette étape (ex: "Voir détails", "Annuler") */
  actions?: React.ReactNode
  /** Icône personnalisée (sinon, déduite de l'état) */
  icon?: React.ReactNode
}

export interface OrderTimelineProps {
  /** Étapes de la timeline */
  steps: TimelineStep[]
  /** Orientation */
  orientation?: 'horizontal' | 'vertical'
  /** Variante de style */
  variant?: 'default' | 'minimal' | 'card'
  /** Afficher les connecteurs entre les étapes */
  showConnectors?: boolean
  /** Afficher les dates */
  showDates?: boolean
  /** Afficher les commentaires */
  showComments?: boolean
  /** Taille */
  size?: 'sm' | 'md'
  /** Animation fluide */
  animated?: boolean
  /** Étapes cliquables (ouvre une modale avec les détails) */
  interactive?: boolean
  /** Classes additionnelles */
  className?: string
}

/* ========================================================================== */
/*  Configuration des icônes par défaut (selon l'état)                         */
/* ========================================================================== */

const defaultIcons = {
  completed: <CheckCircle2 size={20} className="text-green-500" />,
  active: <Clock size={20} className="text-amber-500" />,
  error: <XCircle size={20} className="text-red-500" />,
  upcoming: <Clock size={20} className="text-neutral-300 dark:text-neutral-600" />,
}

/* ========================================================================== */
/*  Composant OrderTimeline                                                    */
/* ========================================================================== */

export function OrderTimeline({
  steps,
  orientation = 'vertical',
  variant = 'default',
  showConnectors = true,
  showDates = true,
  showComments = false,
  size = 'md',
  animated = true,
  interactive = false,
  className,
}: OrderTimelineProps) {
  const [selectedStep, setSelectedStep] = useState<TimelineStep | null>(null)
  const isVertical = orientation === 'vertical'

  // Déterminer l'icône d'une étape
  const getStepIcon = (step: TimelineStep) => {
    if (step.icon) return step.icon
    if (step.error) return defaultIcons.error
    if (step.completed) return defaultIcons.completed
    if (step.active) return defaultIcons.active
    return defaultIcons.upcoming
  }

  // Classes des connecteurs
  const connectorClasses = (step: TimelineStep, index: number) => {
    if (!showConnectors || index === steps.length - 1) return ''
    if (step.completed) {
      return 'bg-green-400'
    }
    if (step.active) {
      return 'bg-gradient-to-b from-amber-400 to-neutral-300'
    }
    return 'bg-neutral-200 dark:bg-neutral-700'
  }

  // Taille des éléments
  const sizeClasses = {
    sm: {
      circle: 'w-8 h-8',
      icon: 16,
      text: 'text-xs',
    },
    md: {
      circle: 'w-10 h-10',
      icon: 20,
      text: 'text-sm',
    },
  }

  const circleSize = sizeClasses[size].circle
  const textSize = sizeClasses[size].text

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'flex',
          isVertical ? 'flex-col gap-0' : 'flex-row items-start gap-0 justify-between'
        )}
      >
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1
          const isActive = step.active ?? false
          const isCompleted = step.completed ?? false
          const isError = step.error ?? false

          return (
            <div
              key={step.id}
              className={cn(
                'flex',
                isVertical ? 'flex-row items-stretch' : 'flex-col items-center flex-1'
              )}
            >
              {/* Cercle + connecteur */}
              <div
                className={cn(
                  'flex flex-col items-center',
                  isVertical ? 'w-10 flex-shrink-0' : 'w-full mb-2'
                )}
              >
                {/* Cercle */}
                <motion.div
                  initial={animated ? { scale: 0 } : undefined}
                  animate={animated ? { scale: 1 } : undefined}
                  transition={{ delay: index * 0.1, type: 'spring', stiffness: 200 }}
                  className={cn(
                    'relative flex items-center justify-center rounded-full border-2 transition-colors duration-300',
                    circleSize,
                    isCompleted
                      ? 'bg-green-500 border-green-500 text-white'
                      : isActive
                        ? 'bg-amber-500 border-amber-500 text-white shadow-gold animate-pulse'
                        : isError
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-transparent border-neutral-300 text-neutral-400'
                  )}
                >
                  {getStepIcon(step)}

                  {/* Effet de pulsation pour l'étape active */}
                  {isActive && animated && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-amber-400"
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 1.3, opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    />
                  )}
                </motion.div>

                {/* Connecteur vertical / horizontal */}
                {showConnectors && !isLast && (
                  <div
                    className={cn(
                      isVertical ? 'w-0.5 flex-1 min-h-[24px] my-1' : 'h-0.5 flex-1 min-w-[24px] mx-1 mt-[19px]',
                      connectorClasses(step, index)
                    )}
                  />
                )}
              </div>

              {/* Contenu textuel */}
              <div
                className={cn(
                  isVertical ? 'flex-1 pb-6 pl-4' : 'text-center',
                  interactive && 'cursor-pointer'
                )}
                onClick={() => interactive && setSelectedStep(step)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      'font-semibold',
                      textSize,
                      isCompleted
                        ? 'text-green-600 dark:text-green-400'
                        : isActive
                          ? 'text-amber-600 dark:text-amber-400'
                          : isError
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                  {step.active && (
                    <Badge variant="warm" size="sm">
                      En cours
                    </Badge>
                  )}
                </div>

                {showDates && step.date && (
                  <p className={cn('text-muted-foreground mt-0.5', size === 'sm' ? 'text-xs' : 'text-sm')}>
                    {new Date(step.date).toLocaleString('fr-FR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                )}

                {step.description && (
                  <p className={cn('text-muted-foreground mt-1', size === 'sm' ? 'text-xs' : 'text-sm')}>
                    {step.description}
                  </p>
                )}

                {showComments && step.comment && (
                  <p className="text-xs text-muted-foreground mt-1 italic bg-muted p-2 rounded-lg">
                    💬 {step.comment}
                  </p>
                )}

                {step.actions && <div className="mt-2 flex gap-1">{step.actions}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modale de détail (si interactive) */}
      <Modal
        isOpen={!!selectedStep}
        onClose={() => setSelectedStep(null)}
        title={`Étape : ${selectedStep?.label}`}
        size="sm"
        accent="gold"
      >
        {selectedStep && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {getStepIcon(selectedStep)}
              <span className="font-semibold">{selectedStep.label}</span>
            </div>
            {selectedStep.date && (
              <p className="text-sm text-muted-foreground">
                📅 {new Date(selectedStep.date).toLocaleString('fr-FR', {
                  dateStyle: 'full',
                  timeStyle: 'medium',
                })}
              </p>
            )}
            {selectedStep.description && (
              <p className="text-sm text-foreground">{selectedStep.description}</p>
            )}
            {selectedStep.comment && (
              <div className="p-3 rounded-lg bg-muted text-sm">
                <p className="font-medium">Commentaire</p>
                <p className="text-muted-foreground mt-1">{selectedStep.comment}</p>
              </div>
            )}
            {selectedStep.actions}
          </div>
        )}
      </Modal>
    </div>
  )
}