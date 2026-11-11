// features/admin/produits/components/ProductDraftBanner.tsx
'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Info, Loader2, RefreshCw, Save, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function ProductDraftBanner({
  showDraftBanner,
  draftRestored,
  submitting,
  onRestore,
  onIgnore,
  onDiscard,
  onReloadServer,
  onSave,
}: {
  showDraftBanner: boolean
  draftRestored: boolean
  submitting: boolean
  onRestore: () => void
  onIgnore: () => void
  onDiscard: () => void
  onReloadServer: () => void
  onSave: () => void
}) {
  return (
    <AnimatePresence>
      {showDraftBanner && !draftRestored && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-6 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <Save size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Brouillon local détecté</p>
              <p className="mt-1 text-xs opacity-90">
                Un brouillon non enregistré existe pour ce produit dans ce
                navigateur.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRestore}
              leftIcon={<Undo2 size={14} />}
            >
              Restaurer
            </Button>
            <Button variant="ghost" size="sm" onClick={onIgnore}>
              Ignorer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:bg-red-500/10"
              onClick={onDiscard}
              leftIcon={<Trash2 size={14} />}
            >
              Supprimer
            </Button>
          </div>
        </motion.div>
      )}

      {draftRestored && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-6 flex flex-col gap-3 rounded-2xl border border-gold-400/30 bg-gold-500/10 p-4 text-sm text-gold-800 dark:text-gold-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <Info size={18} className="mt-0.5 shrink-0 text-gold-500" />
            <div>
              <p className="font-medium">Brouillon chargé</p>
              <p className="mt-1 text-xs opacity-90">
                Le formulaire affiche une version locale non enregistrée.
                Enregistre pour appliquer au serveur.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="luxe"
              size="sm"
              onClick={onSave}
              disabled={submitting}
              leftIcon={
                submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )
              }
            >
              Enregistrer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onReloadServer}
              disabled={submitting}
              leftIcon={<RefreshCw size={14} />}
            >
              Version serveur
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}