// components/RefuseModal.tsx
'use client'

import { useState, useRef } from 'react'
import { X, Loader2, Trash2, ImagePlus, AlertTriangle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface RefuseModalProps {
  isOpen: boolean
  articleName: string
  onConfirm: (motif: string, photo?: File) => Promise<void>
  onClose: () => void
  isLoading?: boolean
}

export default function RefuseModal({
  isOpen,
  articleName,
  onConfirm,
  onClose,
  isLoading = false,
}: RefuseModalProps) {
  const [motif, setMotif] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('L’image ne doit pas dépasser 2 Mo')
      return
    }
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const removePhoto = () => {
    setPhoto(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (!motif.trim()) {
      toast.error('Veuillez indiquer un motif de refus')
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(motif, photo || undefined)
      // Réinitialisation après succès
      setMotif('')
      removePhoto()
      onClose()
    } catch {
      // l'erreur est déjà gérée par le parent
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Refus de l'article"
      description={`Produit : ${articleName}`}
      size="md"
      showCloseButton
      closeOnOverlayClick={!submitting && !isLoading}
    >
      <div className="space-y-5">
        {/* Motif */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Motif du refus <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex: produit endommagé, ne correspond pas à la description, emballage ouvert…"
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50 resize-none transition-colors"
            disabled={submitting || isLoading}
          />
        </div>

        {/* Photo facultative */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Photo (optionnelle)
          </label>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<ImagePlus size={16} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || isLoading}
            >
              Ajouter une photo
            </Button>
            {photoPreview && (
              <button
                type="button"
                onClick={removePhoto}
                disabled={submitting || isLoading}
                className="text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                Supprimer
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
            disabled={submitting || isLoading}
          />
          {photoPreview && (
            <div className="mt-3 relative inline-block">
              <img
                src={photoPreview}
                alt="Aperçu"
                className="h-20 w-20 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shadow-sm"
              />
              <button
                onClick={removePhoto}
                disabled={submitting || isLoading}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="danger"
            fullWidth
            size="md"
            loading={submitting || isLoading}
            disabled={!motif.trim()}
            onClick={handleSubmit}
            leftIcon={!submitting && !isLoading ? <AlertTriangle size={16} /> : undefined}
          >
            Confirmer le refus
          </Button>
          <Button
            variant="outline"
            fullWidth
            size="md"
            onClick={onClose}
            disabled={submitting || isLoading}
          >
            Annuler
          </Button>
        </div>
      </div>
    </Modal>
  )
}
