// components/LivraisonTimeline.tsx
'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Button } from '@/components/ui/Button'
import {
  CheckCircle,
  Package,
  Truck,
  Check,
  Clock,
  XCircle,
  User,
  Store,
  MapPin,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RotateCcw,
  MessageSquare,
  Eye,
  Calendar,
} from 'lucide-react'

/* ========================================================================== */
/*  Types & configuration                                                     */
/* ========================================================================== */

type StepStatus = 'completed' | 'current' | 'pending' | 'cancelled'

interface TimelineStep {
  id: string
  label: string
  description: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  status: StepStatus
  date?: string | null
  subLabel?: string      // texte additionnel (ex: nom du vendeur)
  detail?: string         // description longue affichée au clic
}

interface LivraisonTimelineProps {
  statut: string           // 'acceptee', 'colis_recupere', 'livree', 'annulee', etc.
  collecteValidee?: boolean
  dateAcceptation?: string | null
  dateRecuperation?: string | null
  dateLivraison?: string | null
  vendeursNoms?: string[]  // noms des vendeurs impliqués (pour info supplémentaire)
  className?: string
  // Nouvelles props (optionnelles, rétrocompatibles)
  showDetails?: boolean
  onStepClick?: (stepId: string) => void
  animated?: boolean
}

/* ========================================================================== */
/*  Helpers                                                                   */
/* ========================================================================== */

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatRelativeTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return null
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `Il y a ${days} j`
}

/* ========================================================================== */
/*  Composant                                                                 */
/* ========================================================================== */

export default function LivraisonTimeline({
  statut,
  collecteValidee = false,
  dateAcceptation,
  dateRecuperation,
  dateLivraison,
  vendeursNoms,
  className,
  showDetails: showDetailsProp = true,
  onStepClick,
  animated = true,
}: LivraisonTimelineProps) {
  // Détermination des statuts de chaque étape
  const isAnnulee = statut === 'annulee'
  const step1Complete = !isAnnulee && statut !== 'en_attente' && statut !== 'payee'
  const step2Complete = !isAnnulee && (collecteValidee || statut === 'colis_recupere' || statut === 'en_livraison' || statut === 'livree')
  const step3Complete = !isAnnulee && statut === 'livree'

  const getStepStatus = (complete: boolean, isLast: boolean): StepStatus => {
    if (isAnnulee) return 'cancelled'
    if (complete) return 'completed'
    if (isLast && step2Complete && !step3Complete) return 'current'  // en livraison
    if (!isLast && step1Complete && !step2Complete) return 'current' // en collecte
    return 'pending'
  }

  // Détails pour les popups
  const stepDetails = useMemo(() => ({
    acceptee: `La livraison a été acceptée par le livreur${vendeursNoms?.length ? ' pour les vendeurs : ' + vendeursNoms.join(', ') : ''}.`,
    collecte: `Le colis a été récupéré${vendeursNoms?.length ? ' chez ' + vendeursNoms.join(', ') : ''}.`,
    livree: 'Le colis a été livré au client.',
    annulee: 'La livraison a été annulée.',
  }), [vendeursNoms])

  const steps: TimelineStep[] = [
    {
      id: 'acceptee',
      label: 'Acceptée',
      description: 'Course acceptée par le livreur',
      icon: CheckCircle,
      status: getStepStatus(step1Complete, false),
      date: dateAcceptation,
      detail: stepDetails.acceptee,
    },
    {
      id: 'collecte',
      label: 'Collectée',
      description: 'Colis récupéré(s)',
      icon: Package,
      status: getStepStatus(step2Complete, true),
      date: step2Complete ? dateRecuperation : null,
      subLabel: vendeursNoms?.length ? `Chez ${vendeursNoms.join(', ')}` : undefined,
      detail: stepDetails.collecte,
    },
    {
      id: 'livree',
      label: 'Livrée',
      description: 'Livraison au client final',
      icon: Truck,
      status: step3Complete ? 'completed' : isAnnulee ? 'cancelled' : 'pending',
      date: step3Complete ? dateLivraison : null,
      detail: isAnnulee ? stepDetails.annulee : stepDetails.livree,
    },
  ]

  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleStepClick = useCallback((stepId: string) => {
    toggleExpand(stepId)
    onStepClick?.(stepId)
  }, [onStepClick, toggleExpand])

  return (
    <div className={cn('w-full', className)}>
      {/* Timeline horizontale */}
      <div className="relative flex items-center justify-between">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1
          const isCompleted = step.status === 'completed'
          const isCurrent = step.status === 'current'
          const isCancelled = step.status === 'cancelled'
          const isExpanded = expandedSteps.has(step.id)

          return (
            <div key={step.id} className="flex-1 relative">
              {/* Ligne de connexion (sauf dernière) */}
              {!isLast && (
                <div className="absolute top-5 left-[60%] w-full h-0.5 -translate-y-1/2">
                  <div
                    className={cn(
                      'h-full transition-all duration-700',
                      isCompleted
                        ? 'bg-brand-600 dark:bg-brand-400'
                        : isCurrent
                        ? 'bg-neutral-200 dark:bg-neutral-700'
                        : isCancelled
                        ? 'bg-red-300 dark:bg-red-800'
                        : 'bg-neutral-200 dark:bg-neutral-700'
                    )}
                  >
                    {/* Remplissage progressif si étape en cours */}
                    {isCurrent && (
                      <motion.div
                        initial={{ width: '0%' }}
                        animate={{ width: '50%' }}
                        transition={{ duration: 1.5, ease: 'easeInOut' }}
                        className="h-full bg-brand-600 dark:bg-brand-400"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Icône + texte */}
              <div className="flex flex-col items-center relative z-10">
                {/* Cercle de l'étape */}
                <motion.div
                  initial={animated && isCurrent ? { scale: 0.8 } : false}
                  animate={{ scale: 1 }}
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer',
                    'border-2 hover:shadow-md',
                    isCompleted && 'bg-brand-600 border-brand-600 text-white shadow-md',
                    isCurrent && 'bg-white dark:bg-neutral-800 border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400 shadow-glow',
                    !isCompleted && !isCurrent && !isCancelled && 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-400',
                    isCancelled && 'bg-red-100 dark:bg-red-900/30 border-red-400 dark:border-red-600 text-red-500'
                  )}
                  onClick={() => handleStepClick(step.id)}
                >
                  {isCompleted ? (
                    <Check size={18} />
                  ) : isCancelled ? (
                    <XCircle size={18} />
                  ) : (
                    <step.icon size={18} />
                  )}
                </motion.div>

                {/* Label */}
                <p
                  className={cn(
                    'text-xs font-semibold mt-2 text-center',
                    (isCompleted || isCurrent) && 'text-neutral-800 dark:text-neutral-200',
                    !isCompleted && !isCurrent && !isCancelled && 'text-neutral-400',
                    isCancelled && 'text-red-500'
                  )}
                >
                  {step.label}
                </p>

                {/* Sublabel (ex: nom vendeur) */}
                {step.subLabel && (
                  <p className="text-[10px] text-neutral-400 mt-0.5 text-center max-w-[100px] truncate leading-tight">
                    {step.subLabel}
                  </p>
                )}

                {/* Date */}
                {step.date && (
                  <Tooltip content={formatDate(step.date)}>
                    <p className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-0.5">
                      <Calendar size={10} />
                      {formatRelativeTime(step.date)}
                    </p>
                  </Tooltip>
                )}

                {/* Description */}
                <p
                  className={cn(
                    'text-[10px] text-center mt-0.5 max-w-[90px] leading-tight',
                    (isCompleted || isCurrent)
                      ? 'text-neutral-600 dark:text-neutral-300'
                      : 'text-neutral-400'
                  )}
                >
                  {step.description}
                </p>

                {/* Bouton pour afficher détail */}
                {showDetailsProp && step.detail && (
                  <div className="mt-1">
                    <Tooltip content={isExpanded ? 'Moins de détails' : 'Plus de détails'}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpand(step.id) }}
                        className="text-xs text-gold-500 hover:text-gold-600 flex items-center gap-0.5"
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        <span className="text-[9px]">{isExpanded ? 'Moins' : 'Détails'}</span>
                      </button>
                    </Tooltip>
                  </div>
                )}

                {/* Badge de statut pour l'étape en cours */}
                {isCurrent && (
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Badge variant="brand" size="sm">
                        En cours
                      </Badge>
                    </motion.div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Détails expansibles */}
      {showDetailsProp && (
        <div className="mt-8 space-y-2">
          {steps.map(step => {
            const isExpanded = expandedSteps.has(step.id)
            return (
              <AnimatePresence key={step.id}>
                {isExpanded && step.detail && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-neutral-50 dark:bg-neutral-800/40 rounded-xl p-3 text-sm text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                      <p>{step.detail}</p>
                      {step.date && <p className="text-xs mt-1 text-neutral-400">{formatDate(step.date)}</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )
          })}
        </div>
      )}

      {/* Indicateurs de progression textuels (optionnels) */}
      <div className="mt-10 pt-2">
        {isAnnulee && (
          <div className="text-center text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 py-2 px-4 rounded-full font-medium">
            <XCircle size={14} className="inline mr-1.5" />
            Livraison annulée
          </div>
        )}
        {!isAnnulee && !step3Complete && step2Complete && (
          <div className="text-center text-sm text-warm-700 dark:text-warm-300 bg-warm-50 dark:bg-warm-900/20 py-2 px-4 rounded-full font-medium">
            <Truck size={14} className="inline mr-1.5" />
            En attente de livraison finale
          </div>
        )}
        {!isAnnulee && !step2Complete && step1Complete && (
          <div className="text-center text-sm text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 py-2 px-4 rounded-full font-medium">
            <Package size={14} className="inline mr-1.5" />
            Collecte en cours...
          </div>
        )}
        {!isAnnulee && !step1Complete && (
          <div className="text-center text-sm text-neutral-500 bg-neutral-100 dark:bg-neutral-800 py-2 px-4 rounded-full">
            <Clock size={14} className="inline mr-1.5" />
            En attente d&apos;un livreur
          </div>
        )}
      </div>
    </div>
  )
}