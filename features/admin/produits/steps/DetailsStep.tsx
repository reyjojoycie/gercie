// features/admin/produits/steps/DetailsStep.tsx
'use client'

import { motion } from 'framer-motion'
import { Weight, Ruler } from 'lucide-react'
import { useStepContext } from '../context/ProductFormContext'
import { Input } from '@/components/ui/Input'

const textareaBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 resize-none disabled:opacity-60'

export default function DetailsStep() {
  const { form } = useStepContext()
  const { register, notesWatch } = form

  return (
    <motion.div
      key="details"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-5"
    >
      {/* Dimensions */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Input
          variant="glass"
          label="Poids (kg)"
          type="number"
          step="0.01"
          {...register('poids_kg', { valueAsNumber: true })}
          leftIcon={<Weight size={14} />}
        />
        <Input
          variant="glass"
          label="Longueur (cm)"
          type="number"
          step="0.1"
          {...register('longueur_cm', { valueAsNumber: true })}
          leftIcon={<Ruler size={14} />}
        />
        <Input
          variant="glass"
          label="Largeur (cm)"
          type="number"
          step="0.1"
          {...register('largeur_cm', { valueAsNumber: true })}
        />
        <Input
          variant="glass"
          label="Hauteur (cm)"
          type="number"
          step="0.1"
          {...register('hauteur_cm', { valueAsNumber: true })}
        />
      </div>

      {/* Notes internes */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Notes internes (non visibles par les clients)
        </label>
        <textarea
          {...register('notes_internes')}
          rows={3}
          maxLength={1000}
          className={textareaBase}
          placeholder="Notes réservées à l'équipe…"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {notesWatch?.length || 0}/1000
        </p>
      </div>

      {/* Actif */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          {...register('est_actif')}
          className="rounded text-gold-500 focus:ring-gold-500"
        />
        <span>Produit actif (visible dans le catalogue)</span>
      </label>
    </motion.div>
  )
}