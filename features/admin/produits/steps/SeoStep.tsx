// features/admin/produits/steps/SeoStep.tsx
'use client'

import { motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { useStepContext } from '../context/ProductFormContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'
const textareaBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 resize-none disabled:opacity-60'

export default function SeoStep() {
  const { form } = useStepContext()
  const {
    register,
    metaTitleWatch,
    metaDescriptionWatch,
    tagsList,
    tagInput,
    setTagInput,
    addTag,
    removeTag,
  } = form

  return (
    <motion.div
      key="seo"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-5"
    >
      {/* Méta-titre */}
      <div>
        <Input
          variant="glass"
          label="Méta-titre (SEO)"
          {...register('meta_title')}
          placeholder="Max 70 caractères"
          maxLength={70}
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {metaTitleWatch?.length || 0}/70
        </p>
      </div>

      {/* Méta-description */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Méta-description (SEO)
        </label>
        <textarea
          {...register('meta_description')}
          rows={3}
          maxLength={180}
          className={textareaBase}
          placeholder="Max 180 caractères"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {metaDescriptionWatch?.length || 0}/180
        </p>
      </div>

      {/* Tags */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Mots-clés (tags)
        </label>
        <div className="mb-2 flex gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="Ajouter un tag…"
            className={cn(inputBase, 'flex-1')}
          />
          <Button
            type="button"
            variant="outline-gold"
            size="sm"
            onClick={addTag}
          >
            <Plus size={14} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tagsList.map((tag) => (
            <Badge
              key={tag}
              variant="gold"
              size="sm"
              className="cursor-pointer"
              onClick={() => removeTag(tag)}
            >
              {tag}
              <X size={12} className="ml-1" />
            </Badge>
          ))}
        </div>
      </div>
    </motion.div>
  )
}