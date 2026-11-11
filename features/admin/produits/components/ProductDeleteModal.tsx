// features/admin/produits/components/ProductDeleteModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export default function ProductDeleteModal({
  open,
  onClose,
  productName,
  deleting,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  productName: string
  deleting: boolean
  onConfirm: () => void
}) {
  const [confirmation, setConfirmation] = useState('')

  useEffect(() => {
    if (open) setConfirmation('')
  }, [open])

  const isValid = confirmation.trim() === productName.trim()

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Supprimer ce produit ?"
      description="Cette action est irréversible."
      size="sm"
      accent="red"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Annuler
          </Button>
          <Button
            variant="outline"
            className="border-red-500/40 text-red-500 hover:bg-red-500/10"
            onClick={onConfirm}
            disabled={!isValid || deleting}
            leftIcon={
              deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )
            }
          >
            Supprimer définitivement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} />
            Attention
          </p>
          <p className="mt-2">
            Le produit{' '}
            <span className="font-semibold">{productName}</span> sera supprimé
            du catalogue. Les commandes déjà passées ne sont pas supprimées.
          </p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">
            Tape exactement le nom du produit pour confirmer
          </span>
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={productName}
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {!isValid && confirmation.trim().length > 0 && (
            <span className="block text-xs text-red-500">
              Le nom ne correspond pas exactement.
            </span>
          )}
        </label>
      </div>
    </Modal>
  )
}