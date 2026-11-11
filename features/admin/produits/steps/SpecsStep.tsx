// features/admin/produits/steps/SpecsStep.tsx
'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react'
import { useStepContext } from '../context/ProductFormContext'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

export default function SpecsStep() {
  const { form } = useStepContext()
  const { specs, addSpec, updateSpec, removeSpec, moveSpec } = form

  return (
    <motion.div
      key="specs"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">
          Spécifications techniques
        </h3>
        <Button
          type="button"
          variant="outline-gold"
          size="sm"
          onClick={addSpec}
          leftIcon={<Plus size={14} />}
        >
          Ajouter une ligne
        </Button>
      </div>

      <AnimatePresence>
        {specs.map((spec, idx) => (
          <motion.div
            key={spec.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => moveSpec(idx, -1)}
                disabled={idx === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => moveSpec(idx, 1)}
                disabled={idx === specs.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={spec.key}
                onChange={(e) => updateSpec(spec.id, 'key', e.target.value)}
                placeholder="Clé (ex : Taille)"
                className={cn(inputBase, 'py-1.5 text-sm')}
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={spec.value}
                onChange={(e) => updateSpec(spec.id, 'value', e.target.value)}
                placeholder="Valeur (ex : 45 cm)"
                className={cn(inputBase, 'py-1.5 text-sm')}
              />
            </div>
            <button
              type="button"
              onClick={() => removeSpec(spec.id)}
              className="p-1 text-red-500 hover:text-red-600"
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {specs.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucune spécification. Clique sur "Ajouter une ligne".
        </p>
      )}
    </motion.div>
  )
}