// features/admin/produits/components/StepIndicator.tsx
'use client'

import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { PRODUCT_STEPS } from '../constants/steps'
import { cn } from '@/lib/utils'

export default function StepIndicator({
  activeStep,
  onStepChange,
}: {
  activeStep: number
  onStepChange: (step: number) => void
}) {
  return (
    <div className="mb-6">
      {/* Barre de progression */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-gold-500 to-burgundy-500"
          initial={false}
          animate={{
            width: `${((activeStep + 1) / PRODUCT_STEPS.length) * 100}%`,
          }}
          transition={{ duration: 0.25 }}
        />
      </div>

      {/* Boutons d'étapes */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {PRODUCT_STEPS.map((step, idx) => {
          const isActive = idx === activeStep
          const isCompleted = idx < activeStep
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepChange(idx)}
              className={cn(
                'flex min-w-[150px] flex-1 flex-col gap-1 rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                isActive
                  ? 'border-gold-400 bg-gold-500/10 text-gold-700 dark:text-gold-300'
                  : isCompleted
                  ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                  : 'border-border bg-card text-muted-foreground hover:border-gold-400/40'
              )}
              aria-current={isActive ? 'step' : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold">
                  {isCompleted ? <CheckCircle2 size={14} /> : step.icon}
                  {step.label}
                </span>
                <span className="text-[10px] opacity-70">
                  {idx + 1}/{PRODUCT_STEPS.length}
                </span>
              </div>
              <span className="text-[11px] opacity-80">
                {step.description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}