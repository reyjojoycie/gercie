// components/PhotoUpload.tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import { Camera, X, Loader2, Upload, AlertTriangle } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface PhotoUploadProps {
  onUpload: (url: string) => void
  onRemove?: () => void
  initialPhoto?: string | null
  bucket?: string
  folder?: string
  label?: string
  maxSizeMB?: number
  accept?: string
  className?: string
  disabled?: boolean
  aspectRatio?: 'square' | 'video' | 'auto'
  size?: 'sm' | 'md' | 'lg'
  onError?: (error: Error) => void
}

const sizeClasses = {
  sm: 'w-24 h-24',
  md: 'w-32 h-32',
  lg: 'w-40 h-40',
}

export default function PhotoUpload({
  onUpload,
  onRemove,
  initialPhoto = null,
  bucket = 'photos-produits',
  folder = 'uploads',
  label = 'Ajouter une photo',
  maxSizeMB = 2,
  accept = 'image/*',
  className = '',
  disabled = false,
  aspectRatio = 'square',
  size = 'md',
  onError,
}: PhotoUploadProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhoto)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(initialPhoto)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)          // Pourcentage
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Validation du fichier
  const validateFile = useCallback((file: File): boolean => {
    setError(null)
    if (!file.type.startsWith('image/')) {
      const msg = 'Veuillez sélectionner une image'
      setError(msg)
      toast.error(msg)
      return false
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      const msg = `L'image ne doit pas dépasser ${maxSizeMB} Mo`
      setError(msg)
      toast.error(msg)
      return false
    }
    return true
  }, [maxSizeMB])

  // Upload via XMLHttpRequest avec progression
  const uploadFile = useCallback(async (file: File) => {
    if (!validateFile(file)) return

    const localPreview = URL.createObjectURL(file)
    setPreview(localPreview)
    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      // Récupérer le token de session
      const { data: { session } } = await supabaseBrowser.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Non authentifié – veuillez vous connecter.')

      const fileExt = file.name.split('.').pop()
      const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`
      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${fileName}`

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', endpoint, true)
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
        xhr.setRequestHeader('Cache-Control', 'max-age=3600')
        xhr.setRequestHeader('x-upsert', 'false')

        // Progression
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100)
            setProgress(percent)
          }
        })

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        }

        xhr.onerror = () => reject(new Error("Erreur réseau lors de l'upload."))
        xhr.send(file)
      })

      // Récupérer l'URL publique
      const { data: { publicUrl } } = supabaseBrowser.storage
        .from(bucket)
        .getPublicUrl(fileName)

      setPhotoUrl(publicUrl)
      onUpload(publicUrl)
      toast.success('Photo uploadée avec succès')
    } catch (err: any) {
      console.error('Erreur upload:', err)
      setError(err.message || 'Erreur lors de l’upload')
      toast.error(err.message || 'Erreur lors de l’upload')
      setPreview(initialPhoto) // Revenir à l'ancienne preview
      onError?.(err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [bucket, folder, initialPhoto, onUpload, onError, validateFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setPhotoUrl(null)
    setPreview(null)
    setError(null)
    setProgress(0)
    onRemove?.()
    toast.success('Photo supprimée')
  }, [onRemove])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !uploading) setDragOver(true)
  }, [disabled, uploading])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (disabled || uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }, [disabled, uploading, uploadFile])

  const triggerFileInput = () => {
    if (!disabled && !uploading) fileInputRef.current?.click()
  }

  const aspectRatioClass = {
    square: 'aspect-square',
    video: 'aspect-video',
    auto: '',
  }

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {/* Zone d'aperçu / upload */}
      <div
        onClick={triggerFileInput}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative rounded-xl border-2 border-dashed transition-all',
          'flex items-center justify-center',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          preview
            ? 'border-brand-600 dark:border-brand-400 border-solid'
            : dragOver
            ? 'border-gold-500 bg-gold-50 dark:bg-gold-900/20'
            : 'border-neutral-300 dark:border-midnight-500 bg-neutral-50 dark:bg-midnight-800/40 hover:border-gold-400 dark:hover:border-gold-500 hover:bg-neutral-100 dark:hover:bg-midnight-700/40',
          aspectRatioClass[aspectRatio],
          sizeClasses[size],
          'overflow-hidden'
        )}
      >
        {uploading ? (
          // Zone de progression
          <div className="flex flex-col items-center justify-center w-full h-full p-3 text-center">
            <Loader2 size={24} className="animate-spin text-gold-500 mb-2" />
            <div className="w-full max-w-[80%] bg-neutral-200 dark:bg-midnight-700 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gold-400 to-gold-600 transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{progress}%</span>
          </div>
        ) : preview ? (
          <>
            <img
              src={preview}
              alt="Aperçu"
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.src = '/placeholder.jpg' }}
            />
            {!disabled && (
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  onClick={handleRemove}
                  className="bg-burgundy-600 text-white rounded-full p-1.5 shadow-md hover:bg-burgundy-700 transition-all hover:scale-110"
                  type="button"
                  title="Supprimer la photo"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="absolute top-2 left-2">
              <Badge variant="gold" size="sm" className="shadow-soft">Photo</Badge>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-2 text-center">
            {dragOver ? (
              <Upload size={24} className="text-gold-500 mb-1" />
            ) : (
              <Camera size={24} className="text-neutral-400 mb-1" />
            )}
            <p className="text-xs text-neutral-500 dark:text-neutral-400 px-2">
              {dragOver ? 'Déposez ici' : label}
            </p>
            <p className="text-[10px] text-neutral-400 mt-1">
              {accept === 'image/*' ? 'JPG, PNG, WebP' : accept} - Max {maxSizeMB} Mo
            </p>
          </div>
        )}
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="flex items-center gap-1.5 text-burgundy-600 dark:text-burgundy-400 text-xs bg-burgundy-50 dark:bg-burgundy-900/20 px-3 py-1.5 rounded-full">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* Bouton d'upload alternatif */}
      {!preview && !uploading && (
        <Button
          type="button"
          variant="outline-gold"
          size="sm"
          onClick={triggerFileInput}
          disabled={disabled}
          leftIcon={<Upload size={14} />}
        >
          Choisir un fichier
        </Button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        disabled={disabled || uploading}
        className="hidden"
      />
    </div>
  )
}
