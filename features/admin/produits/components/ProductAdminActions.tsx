// features/admin/produits/components/ProductAdminActions.tsx
'use client'

import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PRODUCT_STEPS } from '../constants/steps'
import type { ProductAdminMode } from '../types'

export default function ProductAdminActions({
  mode,
  activeStep,
  submitting,
  canSave,
  dirty,
  draftRestored,
  draftExists,
  onPrev,
  onNext,
  onSave,
  onSaveDraft,
  onReloadServer,
  onDiscardDraft,
}: {
  mode: ProductAdminMode
  activeStep: number
  submitting: boolean
  canSave: boolean
  dirty: boolean
  draftRestored: boolean
  draftExists: boolean
  onPrev: () => void
  onNext: () => void
  onSave: () => void
  onSaveDraft: () => void
  onReloadServer: () => void
  onDiscardDraft: () => void
}) {
  const isLastStep = activeStep === PRODUCT_STEPS.length - 1
  const isCreate = mode === 'create'

  return (
    <div className="sticky bottom-0 z-30 mt-8 rounded-2xl border border-border bg-background/95 p-3 shadow-strong backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Gauche */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrev}
            disabled={activeStep === 0 || submitting}
            leftIcon={<ChevronLeft size={16} />}
          >
            Précédent
          </Button>

          {!isCreate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReloadServer}
              disabled={submitting || (!dirty && !draftRestored)}
              leftIcon={<RefreshCw size={14} />}
            >
              Recharger serveur
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onSaveDraft}
            disabled={submitting}
            leftIcon={<Save size={14} />}
          >
            Brouillon
          </Button>

          {draftExists && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:bg-red-500/10"
              onClick={onDiscardDraft}
              disabled={submitting}
              leftIcon={<Trash2 size={14} />}
            >
              Effacer brouillon
            </Button>
          )}
        </div>

        {/* Centre : info étape */}
        <div className="text-center text-xs text-muted-foreground">
          Étape {activeStep + 1} sur {PRODUCT_STEPS.length}
          <span className="mx-2">•</span>
          {PRODUCT_STEPS[activeStep].label}
        </div>

        {/* Droite */}
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {dirty
              ? 'Modifications non enregistrées'
              : draftRestored
              ? 'Brouillon chargé'
              : 'À jour'}
          </span>

          {isLastStep ? (
            <Button
              variant="luxe"
              size="sm"
              onClick={onSave}
              disabled={submitting || (mode === 'edit' && !canSave)}
              loading={submitting}
              leftIcon={<Save size={16} />}
            >
              {isCreate ? 'Publier le produit' : 'Enregistrer'}
            </Button>
          ) : (
            <Button
              variant="luxe"
              size="sm"
              onClick={onNext}
              disabled={submitting}
              rightIcon={<ChevronRight size={16} />}
            >
              Suivant
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}