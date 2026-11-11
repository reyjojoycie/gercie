// features/admin/produits/components/StepRenderer.tsx
'use client'

import { AnimatePresence } from 'framer-motion'
import { PRODUCT_STEPS } from '../constants/steps'
import { STEP_COMPONENTS } from '../steps'
import { useProductFormContext } from '../context/ProductFormContext'

export default function StepRenderer({
  activeStep,
}: {
  activeStep: number
}) {
  const step = PRODUCT_STEPS[activeStep]
  const Component = STEP_COMPONENTS[step.id]

  if (!Component) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Étape « {step.id} » introuvable. Vérifie le registre dans steps/index.ts.
      </div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <Component key={step.id} />
    </AnimatePresence>
  )
}