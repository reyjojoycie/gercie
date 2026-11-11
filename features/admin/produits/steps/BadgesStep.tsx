// features/admin/produits/steps/BadgesStep.tsx
'use client'

import { motion } from 'framer-motion'
import { useStepContext } from '../context/ProductFormContext'
import AdminBadgeSelector from '@/features/admin/components/AdminBadgeSelector'

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const RIBBONS = [
  { value: 'none', label: 'Aucun' },
  { value: 'new', label: 'Nouveauté' },
  { value: 'sale', label: 'Soldes' },
  { value: 'popular', label: 'Populaire' },
  { value: 'exclusive', label: 'Exclusivité' },
  { value: 'limited', label: 'Édition limitée' },
]

export default function BadgesStep() {
  const { form } = useStepContext()
  const { register, watch, setValue } = form

  return (
    <motion.div
      key="badges"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      <AdminBadgeSelector
        selected={watch('badges') || []}
        onChange={(badges) => setValue('badges', badges)}
        max={3}
      />

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Ruban / Étiquette
        </label>
        <select
          {...register('ribbon')}
          className={inputBase}
        >
          {RIBBONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </motion.div>
  )
}