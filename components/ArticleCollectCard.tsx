// components/ArticleCollectCard.tsx
'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Loader2, Copy, Check, Trash2, ImagePlus, AlertTriangle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export interface ArticleCollectProps {
  id: string
  nom: string
  quantite: number
  prix_unitaire: number
  imageUrl?: string
  variante?: { attributes: Record<string, string> }
  specifications?: string
  codeVendeur?: string
  statutCollecte?: 'en_attente' | 'accepte' | 'refuse'
  motifRefus?: string
  photoPreuve?: string
  onValidate: (articleId: string, code: string) => Promise<void>
  onRefuse: (articleId: string, motif: string, photo?: File) => Promise<void>
  isDisabled?: boolean
  className?: string
}

export default function ArticleCollectCard({
  id,
  nom,
  quantite,
  prix_unitaire,
  imageUrl = '/placeholder.jpg',
  variante,
  specifications,
  codeVendeur,
  statutCollecte = 'en_attente',
  motifRefus,
  photoPreuve,
  onValidate,
  onRefuse,
  isDisabled = false,
  className,
}: ArticleCollectProps) {
  const [code, setCode] = useState('')
  const [validating, setValidating] = useState(false)
  const [showRefuseModal, setShowRefuseModal] = useState(false)
  const [refuseMotif, setRefuseMotif] = useState('')
  const [refusePhoto, setRefusePhoto] = useState<File | null>(null)
  const [refusePhotoPreview, setRefusePhotoPreview] = useState<string | null>(null)
  const [refusing, setRefusing] = useState(false)
  const [copied, setCopied] = useState(false)

  const variantDisplay = variante?.attributes
    ? Object.entries(variante.attributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ')
    : null

  const totalPrice = prix_unitaire * quantite

  // Validation du code vendeur
  const handleValidate = async () => {
    if (!codeVendeur) {
      toast.error('Code vendeur non disponible pour cet article')
      return
    }
    if (!code || code.length !== 6) {
      toast.error('Veuillez saisir un code à 6 chiffres')
      return
    }
    setValidating(true)
    try {
      await onValidate(id, code)
      setCode('')
    } catch {
      // erreur gérée par le parent
    } finally {
      setValidating(false)
    }
  }

  // Refus de l'article
  const handleRefuse = async () => {
    if (!refuseMotif.trim()) {
      toast.error('Veuillez indiquer un motif de refus')
      return
    }
    setRefusing(true)
    try {
      await onRefuse(id, refuseMotif, refusePhoto || undefined)
      setShowRefuseModal(false)
      setRefuseMotif('')
      setRefusePhoto(null)
      setRefusePhotoPreview(null)
    } catch {
      // erreur gérée par le parent
    } finally {
      setRefusing(false)
    }
  }

  // Copie du code vendeur
  const copyCode = () => {
    if (codeVendeur) {
      navigator.clipboard.writeText(codeVendeur)
      setCopied(true)
      toast.success('Code copié !')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Badge de statut
  const statusConfig = {
    accepte: { variant: 'success' as const, label: 'Validé', icon: <CheckCircle size={14} /> },
    refuse: { variant: 'danger' as const, label: 'Refusé', icon: <XCircle size={14} /> },
    en_attente: { variant: 'neutral' as const, label: 'En attente', icon: undefined },
  }

  const status = statusConfig[statutCollecte]

  return (
    <>
      <Card className={cn('overflow-hidden', className)}>
        <CardContent className="p-4 flex gap-4">
          {/* Image */}
          <div className="w-24 h-24 flex-shrink-0 bg-neutral-100 dark:bg-neutral-800 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700">
            <img
              src={imageUrl}
              alt={nom}
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.src = '/placeholder.jpg' }}
            />
          </div>

          {/* Infos */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div>
                <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">{nom}</h4>
                {variantDisplay && (
                  <p className="text-xs text-brand-600 dark:text-brand-400 mt-0.5">{variantDisplay}</p>
                )}
                <p className="text-sm text-neutral-500 mt-1">Quantité : {quantite}</p>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                  {totalPrice.toLocaleString()} FC
                </p>
                {specifications && (
                  <p className="text-xs text-neutral-400 mt-1">Note : {specifications}</p>
                )}
              </div>
              <Badge variant={status.variant} size="sm">
                {status.icon && <span className="mr-1">{status.icon}</span>}
                {status.label}
              </Badge>
            </div>

            {/* Actions : validation / refus */}
            {statutCollecte === 'en_attente' && codeVendeur && (
              <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700 space-y-3">
                <Input
                  label="Code vendeur (6 chiffres)"
                  placeholder="______"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputSize="sm"
                  className="text-center font-mono text-lg tracking-[0.3em]"
                  disabled={isDisabled || validating}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleValidate}
                    disabled={isDisabled || validating || !code || code.length !== 6}
                    loading={validating}
                    leftIcon={<CheckCircle size={16} />}
                  >
                    Valider
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowRefuseModal(true)}
                    disabled={isDisabled || validating}
                    leftIcon={<XCircle size={16} />}
                  >
                    Refuser
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyCode}
                    leftIcon={copied ? <Check size={16} className="text-accent-600" /> : <Copy size={16} />}
                  >
                    {copied ? 'Copié' : 'Code'}
                  </Button>
                </div>
              </div>
            )}

            {/* Refusé : motif */}
            {statutCollecte === 'refuse' && motifRefus && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded-lg text-xs text-red-700 dark:text-red-300">
                <span className="font-semibold">Motif :</span> {motifRefus}
                {photoPreuve && (
                  <a
                    href={photoPreuve}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 underline hover:no-underline"
                  >
                    Voir la photo
                  </a>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal de refus (utilise notre composant Modal réutilisable) */}
      <Modal
        isOpen={showRefuseModal}
        onClose={() => setShowRefuseModal(false)}
        title="Refus de l'article"
        description={`Produit : ${nom}`}
        size="md"
        closeOnOverlayClick={!refusing}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Motif du refus <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={refuseMotif}
              onChange={(e) => setRefuseMotif(e.target.value)}
              placeholder="Ex: produit endommagé, ne correspond pas à la description..."
              className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 resize-none"
              disabled={refusing}
            />
          </div>

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
                onClick={() => document.getElementById('refuse-photo-input')?.click()}
                disabled={refusing}
              >
                Ajouter une photo
              </Button>
              {refusePhotoPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setRefusePhoto(null)
                    setRefusePhotoPreview(null)
                  }}
                  className="text-sm text-red-600 hover:underline"
                >
                  Supprimer
                </button>
              )}
            </div>
            <input
              id="refuse-photo-input"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  setRefusePhoto(file)
                  setRefusePhotoPreview(URL.createObjectURL(file))
                }
              }}
              className="hidden"
              disabled={refusing}
            />
            {refusePhotoPreview && (
              <div className="mt-3 relative inline-block">
                <img
                  src={refusePhotoPreview}
                  alt="Aperçu"
                  className="h-20 w-20 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700"
                />
                <button
                  onClick={() => {
                    setRefusePhoto(null)
                    setRefusePhotoPreview(null)
                  }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="danger"
              fullWidth
              onClick={handleRefuse}
              loading={refusing}
              disabled={!refuseMotif.trim()}
              leftIcon={!refusing ? <AlertTriangle size={16} /> : undefined}
            >
              Confirmer le refus
            </Button>
            <Button
              variant="outline"
              fullWidth
              onClick={() => setShowRefuseModal(false)}
              disabled={refusing}
            >
              Annuler
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
