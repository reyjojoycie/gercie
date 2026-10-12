// components/DeliveryProofUpload.tsx
'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useTheme } from '@/contexts/ThemeContext'
import { useGeolocation } from '@/hooks/useGeolocation'
import { reverseGeocode } from '@/lib/geocoding'
import { z } from 'zod'
import {
  Upload, Camera, Image as ImageIcon, FileImage, X, CheckCircle2,
  AlertTriangle, Maximize2, RotateCw, MapPin, RefreshCw, Signature,
  PenTool, Trash2, Eye, EyeOff, Download, ClipboardCheck, ShieldCheck
} from 'lucide-react'

/* ========================================================================== */
/*  Types et validation                                                       */
/* ========================================================================== */
export type ProofType = 'photo' | 'signature'

export interface UploadedProof {
  id: string
  type: ProofType
  url: string           // URL temporaire (blob) ou finale
  file?: File           // fichier brut si photo
  timestamp: string
  location?: { lat: number; lng: number; address?: string } | null
}

interface DeliveryProofUploadProps {
  /** Types de preuves autorisés (par défaut les deux) */
  allowedTypes?: ProofType[]
  /** Callback quand les preuves changent (pour les envoyer au parent) */
  onProofsChange?: (proofs: UploadedProof[]) => void
  /** Callback quand l'upload est terminé (prêt à être envoyé) */
  onComplete?: (proofs: UploadedProof[]) => void
  /** Activer la géolocalisation automatique lors de l'upload */
  withGeolocation?: boolean
  /** Nombre maximum de fichiers photo */
  maxPhotos?: number
  /** Classes additionnelles */
  className?: string
  /** État de chargement initial (désactive l'interaction) */
  loading?: boolean
}

const MAX_FILE_SIZE_MB = 10
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

const fileSchema = z.object({
  type: z.enum(ACCEPTED_IMAGE_TYPES as [string, ...string[]]),
  size: z.number().max(MAX_FILE_SIZE_MB * 1024 * 1024, `Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)`),
})

/* ========================================================================== */
/*  Helpers : compression d'image avant upload                                 */
/* ========================================================================== */
async function compressImage(file: File, maxWidth = 1200, quality = 0.7): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((maxWidth / width) * height)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Impossible de créer le contexte canvas'))
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Compression échouée'))
          const compressed = new File([blob], file.name, { type: file.type })
          resolve(compressed)
        },
        file.type,
        quality
      )
    }
    img.onerror = () => reject(new Error('Erreur de chargement de l\'image'))
    img.src = url
  })
}

/* ========================================================================== */
/*  Sous-composant : Signature Pad (canvas)                                    */
/* ========================================================================== */
function SignaturePad({
  onSave,
  onCancel,
}: {
  onSave: (dataUrl: string) => void
  onCancel: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsDrawing(true)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    setHasDrawn(true)
  }, [isDrawing])

  const stopDrawing = useCallback(() => {
    setIsDrawing(false)
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }, [])

  const saveSignature = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn) return
    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
  }, [hasDrawn, onSave])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = canvas.offsetWidth
    canvas.height = 200
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-xl overflow-hidden bg-white dark:bg-midnight-800">
        <canvas
          ref={canvasRef}
          className="w-full h-[200px] touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline-gold" size="sm" onClick={clearCanvas} leftIcon={<RotateCw size={14} />}>Effacer</Button>
        <Button variant="gold" size="sm" onClick={saveSignature} disabled={!hasDrawn} leftIcon={<CheckCircle2 size={14} />}>Sauvegarder</Button>
        <Button variant="ghost" size="sm" onClick={onCancel} leftIcon={<X size={14} />}>Annuler</Button>
      </div>
    </div>
  )
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */
export default function DeliveryProofUpload({
  allowedTypes = ['photo', 'signature'],
  onProofsChange,
  onComplete,
  withGeolocation = true,
  maxPhotos = 3,
  className,
  loading: externalLoading = false,
}: DeliveryProofUploadProps) {
  const { theme } = useTheme()
  const [proofs, setProofs] = useState<UploadedProof[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Géolocalisation (optionnelle)
  const { position: geoPosition, requestPosition, loading: geoLoading } = useGeolocation({ enabled: false })

  // Récupérer l'adresse si géolocalisation activée
  const [currentAddress, setCurrentAddress] = useState<string | null>(null)
  useEffect(() => {
    if (geoPosition && withGeolocation) {
      reverseGeocode(geoPosition.latitude, geoPosition.longitude)
        .then(addr => setCurrentAddress(addr?.display_name || null))
        .catch(() => setCurrentAddress(null))
    }
  }, [geoPosition, withGeolocation])

  // Ajouter une preuve photo
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)

    const remaining = maxPhotos - proofs.filter(p => p.type === 'photo').length
    if (remaining <= 0) {
      setError(`Vous avez déjà ajouté le maximum de ${maxPhotos} photo(s).`)
      return
    }

    const selectedFiles = Array.from(files).slice(0, remaining)
    const validFiles: File[] = []
    for (const file of selectedFiles) {
      const validation = fileSchema.safeParse({ type: file.type, size: file.size })
      if (!validation.success) {
        setError(validation.error.errors[0].message)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    setUploading(true)
    try {
      const newProofs: UploadedProof[] = []
      for (const file of validFiles) {
        // Compresser l'image
        const compressed = await compressImage(file, 1200, 0.7)
        const blobUrl = URL.createObjectURL(compressed)
        const location = geoPosition ? { lat: geoPosition.latitude, lng: geoPosition.longitude, address: currentAddress ?? undefined } : null
        newProofs.push({
          id: crypto.randomUUID(),
          type: 'photo',
          url: blobUrl,
          file: compressed,
          timestamp: new Date().toISOString(),
          location,
        })
      }
      const updatedProofs = [...proofs, ...newProofs]
      setProofs(updatedProofs)
      onProofsChange?.(updatedProofs)
    } catch (err) {
      setError('Erreur lors du traitement des images.')
    } finally {
      setUploading(false)
      // Réinitialiser l'input file pour permettre de sélectionner à nouveau les mêmes fichiers
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [proofs, maxPhotos, geoPosition, currentAddress, onProofsChange])

  // Ajouter une signature
  const handleSignatureSave = useCallback((dataUrl: string) => {
    setShowSignaturePad(false)
    const location = geoPosition ? { lat: geoPosition.latitude, lng: geoPosition.longitude, address: currentAddress ?? undefined } : null
    const newProof: UploadedProof = {
      id: crypto.randomUUID(),
      type: 'signature',
      url: dataUrl,
      timestamp: new Date().toISOString(),
      location,
    }
    // Remplacer la signature précédente (une seule signature autorisée)
    const filtered = proofs.filter(p => p.type !== 'signature')
    const updated = [...filtered, newProof]
    setProofs(updated)
    onProofsChange?.(updated)
  }, [proofs, geoPosition, currentAddress, onProofsChange])

  // Supprimer une preuve
  const removeProof = useCallback((id: string) => {
    const proof = proofs.find(p => p.id === id)
    if (proof?.url && proof.url.startsWith('blob')) {
      URL.revokeObjectURL(proof.url)
    }
    const updated = proofs.filter(p => p.id !== id)
    setProofs(updated)
    onProofsChange?.(updated)
    setError(null)
  }, [proofs, onProofsChange])

  // Déclencher la géolocalisation manuellement
  const handleGeolocate = useCallback(() => {
    requestPosition()
  }, [requestPosition])

  // Marquer comme terminé (validation)
  const handleComplete = useCallback(() => {
    if (proofs.length === 0) {
      setError('Veuillez ajouter au moins une preuve.')
      return
    }
    setSuccess(true)
    onComplete?.(proofs)
  }, [proofs, onComplete])

  // Prévisualisation agrandie
  const togglePreview = (index: number) => {
    setPreviewIndex(previewIndex === index ? null : index)
  }

  return (
    <div className={cn('bg-white dark:bg-midnight-900 rounded-3xl p-5 md:p-6 border border-neutral-200 dark:border-midnight-500/30 shadow-card space-y-5', className)}>
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Preuves de livraison</h3>
        <Badge variant={success ? 'success' : proofs.length > 0 ? 'gold' : 'neutral'}>
          {success ? 'Complété' : proofs.length > 0 ? `${proofs.length} preuve(s)` : 'Aucune preuve'}
        </Badge>
      </div>

      {/* Message d'erreur */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Géolocalisation */}
      {withGeolocation && (
        <div className="flex items-center gap-3 text-sm">
          <Button
            variant="outline-gold"
            size="sm"
            onClick={handleGeolocate}
            loading={geoLoading}
            leftIcon={<MapPin size={14} />}
          >
            {geoPosition ? 'Position enregistrée' : 'Ajouter ma position'}
          </Button>
          {geoPosition && (
            <span className="text-neutral-500 dark:text-neutral-400 text-xs">
              Lat: {geoPosition.latitude.toFixed(4)}, Lng: {geoPosition.longitude.toFixed(4)}
              {currentAddress && <span className="block text-[10px]">{currentAddress}</span>}
            </span>
          )}
        </div>
      )}

      {/* Zone de dépôt des photos */}
      {allowedTypes.includes('photo') && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Photos</h4>
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
              'border-neutral-300 dark:border-neutral-600 hover:border-gold-400 dark:hover:border-gold-400',
              'bg-neutral-50 dark:bg-midnight-800'
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFileSelect(e.dataTransfer.files)
            }}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner size="md" variant="gold" />
                <p className="text-sm text-neutral-500">Compression en cours…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-gold-100 dark:bg-gold-900/20 flex items-center justify-center">
                  <Camera size={24} className="text-gold-500" />
                </div>
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Déposez vos photos ici
                </p>
                <p className="text-xs text-neutral-400">
                  Jusqu'à {maxPhotos} photo(s) – JPG, PNG, WEBP (max {MAX_FILE_SIZE_MB} Mo)
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
              disabled={uploading || externalLoading}
            />
          </div>

          {/* Prévisualisation des photos */}
          {proofs.filter(p => p.type === 'photo').length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {proofs.filter(p => p.type === 'photo').map((proof, idx) => (
                <div key={proof.id} className="relative group">
                  <img
                    src={proof.url}
                    alt="Preuve photo"
                    className="w-full h-32 object-cover rounded-xl border border-neutral-200 dark:border-neutral-700 cursor-pointer"
                    onClick={() => togglePreview(idx)}
                  />
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip content="Supprimer">
                      <button onClick={() => removeProof(proof.id)} className="p-1.5 bg-white dark:bg-midnight-800 rounded-full shadow-md text-red-500 hover:text-red-600">
                        <X size={14} />
                      </button>
                    </Tooltip>
                    <Tooltip content="Agrandir">
                      <button onClick={() => togglePreview(idx)} className="p-1.5 bg-white dark:bg-midnight-800 rounded-full shadow-md text-neutral-500 hover:text-neutral-700">
                        <Maximize2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                  {/* Modal de prévisualisation agrandie */}
                  <AnimatePresence>
                    {previewIndex === idx && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                        onClick={() => setPreviewIndex(null)}
                      >
                        <img src={proof.url} alt="Aperçu" className="max-w-full max-h-full rounded-2xl shadow-2xl" />
                        <button className="absolute top-4 right-4 p-2 bg-white dark:bg-midnight-800 rounded-full shadow-lg" onClick={() => setPreviewIndex(null)}>
                          <X size={20} />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Zone signature */}
      {allowedTypes.includes('signature') && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Signature client</h4>
          {!showSignaturePad ? (
            <div className="flex items-center gap-3">
              {proofs.find(p => p.type === 'signature') ? (
                <div className="flex items-center gap-3 flex-1">
                  <img
                    src={proofs.find(p => p.type === 'signature')!.url}
                    alt="Signature"
                    className="h-16 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={14} /> Signature enregistrée
                    </p>
                    <button
                      onClick={() => removeProof(proofs.find(p => p.type === 'signature')!.id)}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <Button variant="outline-gold" onClick={() => setShowSignaturePad(true)} leftIcon={<PenTool size={16} />}>
                  Ajouter une signature
                </Button>
              )}
            </div>
          ) : (
            <SignaturePad
              onSave={handleSignatureSave}
              onCancel={() => setShowSignaturePad(false)}
            />
          )}
        </div>
      )}

      {/* Bouton de validation finale */}
      <div className="pt-2 border-t border-neutral-100 dark:border-midnight-800">
        <Button
          variant="gold"
          size="lg"
          className="w-full"
          onClick={handleComplete}
          disabled={proofs.length === 0 || success || externalLoading}
          loading={uploading}
          leftIcon={success ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
        >
          {success ? 'Preuves enregistrées' : 'Valider les preuves'}
        </Button>
        {success && (
          <p className="text-xs text-center mt-2 text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
            <CheckCircle2 size={12} /> Les preuves seront envoyées avec la confirmation de livraison.
          </p>
        )}
      </div>
    </div>
  )
}