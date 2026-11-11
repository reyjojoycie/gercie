// features/admin/produits/steps/GeneralStep.tsx
'use client'

import { motion } from 'framer-motion'
import { BrainCircuit, Barcode } from 'lucide-react'
import { useStepContext } from '../context/ProductFormContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { slugify } from '../lib/product-utils'

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'
const textareaBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 resize-none disabled:opacity-60'

export default function GeneralStep() {
  const { form } = useStepContext()
  const {
    register,
    errors,
    watch,
    nomWatch,
    slugWatch,
    descriptionWatch,
    selectedCategoryId,
    setSelectedCategoryId,
    setSlugTouched,
    flatCategories,
    isLoadingCats,
    buildFullCategory,
    handleGenerateDescription,
    generatingDescription,
  } = form

  return (
    <motion.div
      key="general"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-5"
    >
      {/* Nom */}
      <Input
        variant="glass"
        label="Nom du produit *"
        {...register('nom')}
        error={errors.nom?.message}
        placeholder="Ex : iPhone 15 Pro Max 256 Go"
      />

      {/* Slug */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Slug URL
        </label>
        <input
          {...register('slug')}
          onChange={(e) => {
            setSlugTouched(true)
            const val = slugify(e.target.value)
            e.target.value = val
            // @ts-expect-error native event target value assignment
            register('slug').onChange(e)
          }}
          className={inputBase}
          placeholder="iphone-15-pro-max-256-go"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          /produits/{slugWatch || slugify(nomWatch || '')}
        </p>
      </div>

      {/* Description */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Description *
        </label>
        <textarea
          {...register('description')}
          rows={6}
          className={textareaBase}
          placeholder="Décrivez le produit en détail..."
        />
        {errors.description && (
          <p className="mt-1 text-xs text-red-500">
            {errors.description.message}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {descriptionWatch?.length || 0}/5000
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleGenerateDescription}
            loading={generatingDescription}
            leftIcon={<BrainCircuit size={14} />}
          >
            Générer avec IA
          </Button>
        </div>
      </div>

      {/* Catégorie */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Catégorie *
        </label>
        {isLoadingCats ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
            <Spinner size="sm" className="animate-spin" />
            Chargement des catégories...
          </div>
        ) : (
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className={inputBase}
            required
          >
            <option value="">Sélectionner une catégorie...</option>
            {flatCategories.map((cat: any) => (
              <option key={cat.id} value={cat.id}>
                {cat.depth > 0 ? `${'— '.repeat(cat.depth)} ` : ''}
                {cat.nom}
              </option>
            ))}
          </select>
        )}
        {selectedCategoryId && (
          <p className="mt-1 text-xs text-muted-foreground">
            Chemin : {buildFullCategory()}
          </p>
        )}
      </div>

      {/* SKU / Barcode */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          variant="glass"
          label="SKU (référence interne)"
          {...register('sku')}
          placeholder="SKU-001"
        />
        <Input
          variant="glass"
          label="Code-barres (EAN/UPC)"
          {...register('barcode')}
          placeholder="1234567890123"
          leftIcon={<Barcode size={16} />}
        />
      </div>

      {/* Marque */}
      <Input
        variant="glass"
        label="Marque"
        {...register('marque')}
        placeholder="Apple, Samsung…"
      />
    </motion.div>
  )
}