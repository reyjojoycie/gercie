// components/CheckoutStepper.tsx
'use client'

import React, { createContext, useContext, useMemo, forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { Badge } from '@/components/ui/Badge'
import {
  ShoppingBag,
  CreditCard,
  Wallet,
  CheckCircle2,
  Truck,
  Package,
  MapPin,
  Clock,
  Star,
  Sparkles,
  ChevronRight,
  Lock,
  User,
  FileText,
  type LucideIcon,
} from 'lucide-react'

/* ========================================================================== */
/*  Types & Interfaces                                                         */
/* ========================================================================== */

export interface StepConfig {
  /** Identifiant unique de l'étape (ex: 'cart', 'checkout', 'payment', 'confirmation') */
  id: string
  /** Libellé affiché */
  label: string
  /** Description optionnelle (affichée en mode étendu) */
  description?: string
  /** Icône Lucide (ou composant React) */
  icon?: LucideIcon | React.ReactNode
  /** État de l'étape (si non fourni, déduit du step actif) */
  status?: 'completed' | 'active' | 'upcoming' | 'error'
  /** Étape désactivée (non cliquable) */
  disabled?: boolean
  /** Tooltip au survol */
  tooltip?: string
  /** Badge (ex: nombre d'articles) */
  badge?: string | number
}

export interface CheckoutStepperProps {
  /** Liste des étapes */
  steps: StepConfig[]
  /** Index ou identifiant de l'étape active */
  activeStep: number | string
  /** Callback lors du clic sur une étape (si autorisé) */
  onStepClick?: (stepId: string, index: number) => void
  /** Orientation */
  orientation?: 'horizontal' | 'vertical'
  /** Taille */
  size?: 'sm' | 'md' | 'lg'
  /** Variante de style */
  variant?: 'default' | 'pill' | 'minimal' | 'card'
  /** Afficher les connecteurs entre les étapes */
  showConnectors?: boolean
  /** Animation fluide sur le changement d'étape */
  animated?: boolean
  /** Afficher le numéro de l'étape à la place de l'icône */
  showStepNumber?: boolean
  /** Afficher les descriptions */
  showDescriptions?: boolean
  /** Mode compact (une seule ligne sans descriptions) */
  compact?: boolean
  /** Afficher une barre de progression globale */
  showProgressBar?: boolean
  /** Classe additionnelle */
  className?: string
}

/* ========================================================================== */
/*  Contexte interne (pour usage imbriqué futur)                               */
/* ========================================================================== */

interface StepperContextValue {
  activeIndex: number
  totalSteps: number
  orientation: CheckoutStepperProps['orientation']
  size: CheckoutStepperProps['size']
  variant: CheckoutStepperProps['variant']
  showConnectors: boolean
  animated: boolean
  onStepClick?: (stepId: string, index: number) => void
}

const StepperContext = createContext<StepperContextValue | null>(null)

const useStepperContext = () => {
  const ctx = useContext(StepperContext)
  if (!ctx) throw new Error('StepperContext missing')
  return ctx
}

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

const defaultIcons: Record<string, LucideIcon> = {
  cart: ShoppingBag,
  checkout: CreditCard,
  payment: Wallet,
  confirmation: CheckCircle2,
  delivery: Truck,
  pickup: MapPin,
  review: Star,
  account: User,
  summary: FileText,
}

/* ========================================================================== */
/*  Sous‑composants                                                            */
/* ========================================================================== */

interface StepItemProps {
  step: StepConfig
  index: number
  status: 'completed' | 'active' | 'upcoming' | 'error'
  isLast: boolean
}

const StepItem = ({ step, index, status, isLast }: StepItemProps) => {
  const { orientation, size, variant, showConnectors, animated, onStepClick } = useStepperContext()

  const isClickable = !!onStepClick && !step.disabled && status !== 'active'
  const isCompleted = status === 'completed'
  const isActive = status === 'active'
  const isError = status === 'error'
  const isUpcoming = status === 'upcoming'

  // Taille des icônes / nombres
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20
  const circleSize = size === 'sm' ? 32 : size === 'lg' ? 48 : 40
  const fontSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'

  // Classes conditionnelles
  const circleClasses = cn(
    'relative flex items-center justify-center rounded-full border-2 transition-all duration-300',
    isCompleted && 'bg-green-500 border-green-500 text-white',
    isActive && 'bg-gold-500 border-gold-500 text-white shadow-gold',
    isError && 'bg-red-500 border-red-500 text-white',
    isUpcoming && 'bg-transparent border-muted-foreground/30 text-muted-foreground',
    isClickable && !isUpcoming && 'cursor-pointer hover:border-gold-400 hover:shadow-md',
    !isClickable && 'cursor-default',
  )

  const labelClasses = cn(
    'font-medium transition-colors',
    isCompleted && 'text-green-600 dark:text-green-400',
    isActive && 'text-gold-600 dark:text-gold-400',
    isError && 'text-red-600 dark:text-red-400',
    isUpcoming && 'text-muted-foreground',
    fontSize,
  )

  const descriptionClasses = cn(
    'transition-colors',
    isActive ? 'text-gold-500/80' : 'text-muted-foreground',
    'text-xs',
  )

  const renderIcon = () => {
    if (isCompleted) {
      return <CheckCircle2 size={iconSize} />
    }
    if (isError) {
      // Icône d'erreur (on peut remplacer par un X)
      return <span className="text-xl font-bold">!</span>
    }
    // Icône personnalisée ou icône par défaut basée sur l'ID
    const icon = step.icon
    if (typeof icon === 'function') {
      const IconComp = icon as LucideIcon
      return <IconComp size={iconSize} />
    }
    if (React.isValidElement(icon)) {
      return icon
    }
    // Fallback : première lettre du label
    return <span className={cn('font-bold', fontSize)}>{step.label.charAt(0).toUpperCase()}</span>
  }

  const badgeContent = step.badge !== undefined && (
    <Badge
      variant={isActive ? 'gold' : isCompleted ? 'accent' : 'neutral'}
      size="sm"
      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px]"
    >
      {step.badge}
    </Badge>
  )

  const stepContent = (
    <div
      className={cn(
        'flex items-center gap-2 group',
        orientation === 'vertical' ? 'flex-row w-full' : 'flex-col',
        isClickable && 'cursor-pointer',
      )}
      onClick={() => {
        if (isClickable) onStepClick?.(step.id, index)
      }}
      role="button"
      tabIndex={isClickable ? 0 : undefined}
      aria-current={isActive ? 'step' : undefined}
      aria-label={`Étape ${index + 1} : ${step.label}${status === 'completed' ? ' (terminée)' : ''}`}
    >
      {/* Cercle / icône */}
      <div className={circleClasses} style={{ width: circleSize, height: circleSize }}>
        {renderIcon()}
        {badgeContent}
        {/* Animation d'activation */}
        {isActive && animated && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-gold-400"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.3, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        )}
      </div>

      {/* Texte */}
      {orientation === 'vertical' ? (
        <div className="flex flex-col flex-1 min-w-0">
          <span className={labelClasses}>{step.label}</span>
          {step.description && (
            <span className={descriptionClasses}>{step.description}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <span className={labelClasses}>{step.label}</span>
          {step.description && (
            <span className={cn(descriptionClasses, 'hidden sm:block')}>{step.description}</span>
          )}
        </div>
      )}
    </div>
  )

  // Connecteur entre les étapes (barre horizontale ou verticale)
  const connector = showConnectors && !isLast && (
    <div
      className={cn(
        'transition-colors duration-300',
        orientation === 'horizontal'
          ? 'h-0.5 flex-1 mx-2'
          : 'w-0.5 h-6 ml-[calc(var(--circle-size)/2-1px)]', // aligné au centre du cercle
        isCompleted ? 'bg-green-400' : isActive ? 'bg-gold-400/60' : 'bg-muted-foreground/20',
      )}
      style={{ '--circle-size': `${circleSize}px` } as React.CSSProperties}
    />
  )

  return (
    <div className={cn('flex items-center', orientation === 'horizontal' ? 'flex-row' : 'flex-col')}>
      {stepContent}
      {connector}
    </div>
  )
}

/* ========================================================================== */
/*  Composant principal CheckoutStepper                                       */
/* ========================================================================== */

export const CheckoutStepper = forwardRef<HTMLDivElement, CheckoutStepperProps>(
  (
    {
      steps,
      activeStep,
      onStepClick,
      orientation = 'horizontal',
      size = 'md',
      variant = 'default',
      showConnectors = true,
      animated = true,
      showStepNumber = false,
      showDescriptions = false,
      compact = false,
      showProgressBar = false,
      className,
    },
    ref
  ) => {
    // Déterminer l'index actif
    const activeIndex = useMemo(() => {
      if (typeof activeStep === 'number') return activeStep
      const idx = steps.findIndex(s => s.id === activeStep)
      return idx === -1 ? 0 : idx
    }, [activeStep, steps])

    const totalSteps = steps.length
    const progressPercent = ((activeIndex + 1) / totalSteps) * 100

    // Enrichir les étapes avec le statut déduit
    const enrichedSteps = useMemo(() => {
      return steps.map((step, index) => {
        const status =
          step.status ||
          (index < activeIndex ? 'completed' : index === activeIndex ? 'active' : 'upcoming')
        return { ...step, status, originalStep: step }
      })
    }, [steps, activeIndex])

    const contextValue = useMemo<StepperContextValue>(
      () => ({
        activeIndex,
        totalSteps,
        orientation,
        size,
        variant,
        showConnectors,
        animated,
        onStepClick,
      }),
      [activeIndex, totalSteps, orientation, size, variant, showConnectors, animated, onStepClick]
    )

    return (
      <StepperContext.Provider value={contextValue}>
        <div
          ref={ref}
          className={cn(
            'w-full',
            variant === 'card' && 'bg-card rounded-2xl shadow-card p-4 md:p-6',
            className
          )}
        >
          {/* Barre de progression globale */}
          {showProgressBar && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2 text-sm">
                <span className="text-muted-foreground">
                  Étape {activeIndex + 1} sur {totalSteps}
                </span>
                <span className="font-medium text-gold-600">
                  {enrichedSteps[activeIndex]?.label}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-gold-400 to-gold-600 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {/* Étapes */}
          <div
            className={cn(
              'flex',
              orientation === 'horizontal'
                ? 'flex-row items-start justify-between gap-1'
                : 'flex-col items-start gap-2',
              compact && orientation === 'horizontal' && 'gap-0',
            )}
          >
            {enrichedSteps.map((step, index) => {
              const isLast = index === steps.length - 1
              return (
                <StepItem
                  key={step.id}
                  step={step}
                  index={index}
                  status={step.status}
                  isLast={isLast}
                />
              )
            })}
          </div>
        </div>
      </StepperContext.Provider>
    )
  }
)

CheckoutStepper.displayName = 'CheckoutStepper'