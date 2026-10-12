// components/admin/ImageUploader.tsx
'use client'

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { toast } from '@/components/ui/Toast'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import {
  Upload,
  X,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Move,
  Star,
  RotateCw,
  Maximize2,
  Trash2,
  Plus,
  Eye,
  Download,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

interface UploadedImage {
  /** URL publique de l'image */
  url: string
  /** Nom du fichier original */
  name: string
  /** Taille en octets */
  size: number
  /** Type MIME */
  type: string
  /** ID unique temporaire */
  tempId: string
  /** Progression (0-100) ou null si terminé */
  progress?: number | null
  /** Erreur éventuelle */
  error?: string
}

interface ImageUploaderProps {
  /** Images déjà uploadées (URLs) */
  images?: string[]
  /** Callback quand une nouvelle image est ajoutée */
  onUpload?: (url: string) => void
  /** Callback quand une image est supprimée */
  onRemove?: (index: number) => void
  /** Callback quand l'image principale change */
  onSetMain?: (index: number) => void
  /** Nombre maximum d'images */
  max?: number
  /** Taille max par fichier (Mo) */
  maxSizeMB?: number
  /** Types acceptés */
  accept?: string
  /** Bucket Supabase */
  bucket?: string
  /** Dossier dans le bucket */
  folder?: string
  /** Index de l'image principale */
  mainIndex?: number
  /** Désactiver l'upload */
  disabled?: boolean
  /** Afficher en mode compact */
  compact?: boolean
  /** Afficher les contrôles d'édition (rotation, suppression) */
  showControls?: boolean
  /** Afficher le bouton "définir comme principale" */
  allowSetMain?: boolean
  /** Taille de la prévisualisation (px) */
  previewSize?: number
  /** Classes additionnelles */
  className?: string
  /** Label du bouton */
  label?: string
}

/* ========================================================================== */
/*  Composant ImageUploader                                                    */
/* ========================================================================== */

export const ImageUploader = forwardRef<HTMLDivElement, ImageUploaderProps>(
  (
    {
      images = [],
      onUpload,
      onRemove,
      onSetMain,
      max = 10,
      maxSizeMB = 5,
      accept = 'image/jpeg,image/png,image/webp,image/gif',
      bucket = 'photos-produits',
      folder = 'admin/uploads',
      mainIndex = 0,
      disabled = false,
      compact = false,
      showControls = true,
      allowSetMain = true,
      previewSize = compact ? 80 : 120,
      className,
      label = 'Ajouter des images',
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploads, setUploads] = useState<UploadedImage[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const [localMainIndex, setLocalMainIndex] = useState(mainIndex)
    const dragCounter = useRef(0)

    // Sync images externes → affichage local
    useEffect(() => {
      // On ne modifie pas uploads si déjà peuplé, mais on peut initialiser
      if (images.length > 0 && uploads.length === 0) {
        setUploads(
          images.map((url, idx) => ({
            url,
            name: `Image ${idx + 1}`,
            size: 0,
            type: 'image/*',
            tempId: `existing-${idx}`,
            progress: null,
          }))
        )
      }
    }, [images]) // eslint-disable-line

    // Exposer le container
    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement)

    // Gestion du drag & drop
    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current++
      setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current--
      if (dragCounter.current === 0) setIsDragging(false)
    }

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      dragCounter.current = 0
      const files = Array.from(e.dataTransfer.files)
      processFiles(files)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      processFiles(files)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const processFiles = (files: File[]) => {
      const imageFiles = files.filter(f => f.type.startsWith('image/'))
      if (imageFiles.length === 0) {
        toast.addToast({ type: 'warning', message: 'Aucune image détectée' })
        return
      }

      const currentCount = uploads.length + images.length
      const remainingSlots = max - currentCount
      if (remainingSlots <= 0) {
        toast.addToast({ type: 'warning', message: `Maximum ${max} images autorisées` })
        return
      }

      const filesToUpload = imageFiles.slice(0, remainingSlots)

      // Vérifier la taille
      const oversized = filesToUpload.filter(f => f.size > maxSizeMB * 1024 * 1024)
      if (oversized.length > 0) {
        toast.addToast({
          type: 'error',
          message: `${oversized.length} fichier(s) dépassent ${maxSizeMB} Mo`,
        })
        return
      }

      // Ajouter les fichiers avec un statut "pending"
      const newUploads: UploadedImage[] = filesToUpload.map(f => ({
        url: URL.createObjectURL(f), // preview temporaire
        name: f.name,
        size: f.size,
        type: f.type,
        tempId: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        progress: 0,
      }))

      setUploads(prev => [...prev, ...newUploads])

      // Uploader chaque fichier
      newUploads.forEach(upload => {
        uploadFile(upload, filesToUpload.find(f => f.name === upload.name)!)
      })
    }

    const uploadFile = async (uploadItem: UploadedImage, file: File) => {
      try {
        const path = `${folder}/${Date.now()}_${file.name.replace(/\s/g, '_')}`

        const { error } = await supabaseBrowser.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (error) throw error

        const { data: { publicUrl } } = supabaseBrowser.storage
          .from(bucket)
          .getPublicUrl(path)

        // Mettre à jour l'upload avec l'URL publique
        setUploads(prev =>
          prev.map(u =>
            u.tempId === uploadItem.tempId
              ? { ...u, url: publicUrl, progress: 100, error: undefined }
              : u
          )
        )

        // Notifier le parent
        onUpload?.(publicUrl)
        toast.addToast({ type: 'success', message: `${file.name} uploadé` })
      } catch (err: any) {
        setUploads(prev =>
          prev.map(u =>
            u.tempId === uploadItem.tempId
              ? { ...u, progress: null, error: err.message || 'Erreur upload' }
              : u
          )
        )
        toast.addToast({ type: 'error', message: `Échec upload : ${file.name}` })
      }
    }

    const handleRemove = (tempId: string, index: number) => {
      setUploads(prev => prev.filter(u => u.tempId !== tempId))
      if (onRemove) {
        // Trouver l'index réel dans la liste combinée
        const idx = uploads.findIndex(u => u.tempId === tempId)
        onRemove(idx)
      }
    }

    const handleSetMain = (index: number) => {
      setLocalMainIndex(index)
      onSetMain?.(index)
    }

    const handleRetry = (uploadItem: UploadedImage) => {
      // Retenter l'upload
      setUploads(prev =>
        prev.map(u =>
          u.tempId === uploadItem.tempId ? { ...u, progress: 0, error: undefined } : u
        )
      )
      // Relancer l'upload (on aurait besoin de conserver le file, ici on ne peut pas)
      toast.addToast({ type: 'info', message: 'Veuillez réessayer en supprimant puis en ajoutant à nouveau' })
    }

    const totalImages = uploads.length
    const canAddMore = totalImages < max

    return (
      <div ref={containerRef} className={cn('space-y-4', className)}>
        {/* Zone de prévisualisation */}
        <div className="flex flex-wrap gap-3">
          <AnimatePresence>
            {uploads.map((upload, idx) => (
              <motion.div
                key={upload.tempId}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative group"
              >
                <div
                  className={cn(
                    'rounded-xl overflow-hidden border-2',
                    idx === localMainIndex && upload.progress === 100
                      ? 'border-gold-400 ring-2 ring-gold-400/30'
                      : 'border-border'
                  )}
                  style={{ width: previewSize, height: previewSize }}
                >
                  {/* Image preview */}
                  <img
                    src={upload.url}
                    alt={upload.name}
                    className="w-full h-full object-cover"
                    onLoad={() => {
                      // Libérer l'URL blob si c'est une preview locale
                      if (upload.url.startsWith('blob:')) {
                        // On garde la preview jusqu'à l'upload terminé
                      }
                    }}
                  />

                  {/* Overlay progression */}
                  {upload.progress !== null && upload.progress! < 100 && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="animate-spin text-white mx-auto mb-1" size={24} />
                        <span className="text-xs text-white">{upload.progress}%</span>
                      </div>
                    </div>
                  )}

                  {/* Erreur */}
                  {upload.error && (
                    <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                      <div className="text-center">
                        <AlertTriangle size={24} className="text-red-500 mx-auto" />
                        <button
                          onClick={() => handleRetry(upload)}
                          className="text-xs text-red-600 underline mt-1"
                        >
                          Réessayer
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Contrôles (hover) */}
                {showControls && upload.progress === 100 && (
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {allowSetMain && (
                      <Tooltip content="Image principale">
                        <button
                          onClick={() => handleSetMain(idx)}
                          className="p-1 rounded-full bg-white/80 hover:bg-gold-100 transition"
                        >
                          <Star
                            size={14}
                            className={idx === localMainIndex ? 'text-gold-500' : 'text-neutral-500'}
                          />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip content="Supprimer">
                      <button
                        onClick={() => handleRemove(upload.tempId, idx)}
                        className="p-1 rounded-full bg-white/80 hover:bg-red-100 transition"
                      >
                        <Trash2 size={14} className="text-red-500" />
                      </button>
                    </Tooltip>
                  </div>
                )}

                {/* Badge "Principale" */}
                {idx === localMainIndex && allowSetMain && upload.progress === 100 && (
                  <Badge variant="gold" size="sm" className="absolute top-1 left-1">
                    Principale
                  </Badge>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Bouton d'ajout */}
          {canAddMore && !disabled && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                'rounded-xl border-2 border-dashed border-gold-400/30 flex flex-col items-center justify-center cursor-pointer transition-colors hover:border-gold-400 hover:bg-gold-400/5',
                isDragging && 'border-gold-400 bg-gold-400/10'
              )}
              style={{ width: previewSize, height: previewSize }}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <Upload size={24} className="text-gold-500 mb-1" />
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">
                {totalImages}/{max}
              </span>
            </motion.div>
          )}
        </div>

        {/* Informations */}
        <div className="text-xs text-muted-foreground">
          {accept.includes('image/') && 'JPEG, PNG, WebP ou GIF'} · Max {maxSizeMB} Mo par image · {totalImages}/{max} images
        </div>

        {/* Input file caché */}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled}
        />
      </div>
    )
  }
)

ImageUploader.displayName = 'ImageUploader'