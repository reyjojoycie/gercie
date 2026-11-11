'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, X, Loader2, Upload, AlertTriangle } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface PhotoUploadProps {
  onUpload: (url: string | null) => void
  onRemove?: () => void
  initialPhoto?: string | null
  defaultImage?: string | null
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

const ALLOWED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'bmp',
  'heic',
  'heif',
])

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
}

function normalizeFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, '')
}

function getExtension(file: File): string {
  const fromName = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase()
    : undefined

  if (fromName && ALLOWED_EXTENSIONS.has(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }

  const fromMime = EXTENSION_BY_MIME[file.type]
  if (fromMime) {
    return fromMime === 'jpeg' ? 'jpg' : fromMime
  }

  return ''
}

function getContentType(file: File, extension: string): string {
  if (file.type && file.type.startsWith('image/')) {
    return file.type
  }

  return MIME_BY_EXTENSION[extension] || 'application/octet-stream'
}

function getErrorMessage(
  status: number,
  statusText: string,
  responseText: string
): string {
  const fallback = `Upload failed with status ${status}${
    statusText ? ` (${statusText})` : ''
  }`

  if (!responseText) {
    return fallback
  }

  try {
    const parsed = JSON.parse(responseText)

    const message =
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.error ||
      parsed?.msg ||
      parsed?.statusCode

    if (typeof message === 'string' && message.trim()) {
      return `${fallback}: ${message}`
    }

    if (message) {
      return `${fallback}: ${JSON.stringify(message)}`
    }
  } catch {
    const text = responseText.slice(0, 300).trim()
    if (text) {
      return `${fallback}: ${text}`
    }
  }

  return fallback
}

export default function PhotoUpload({
  onUpload,
  onRemove,
  initialPhoto = null,
  defaultImage = null,
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
  const sourceImage = (initialPhoto ?? defaultImage ?? null) || null

  const [photoUrl, setPhotoUrl] = useState<string | null>(sourceImage)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(sourceImage)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)

  const clearObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  // Nettoyage quand le composant est démonté
  useEffect(() => {
    return () => {
      clearObjectUrl()
    }
  }, [clearObjectUrl])

  // Synchronise l'aperçu quand la valeur externe change
  useEffect(() => {
    clearObjectUrl()
    setPhotoUrl(sourceImage)
    setPreview(sourceImage)
    setError(null)
    setProgress(0)
  }, [sourceImage, clearObjectUrl])

  // Validation du fichier
  const validateFile = useCallback(
    (file: File): boolean => {
      setError(null)

      const extension = getExtension(file)
      const isImageByType = file.type.startsWith('image/')
      const isAllowedExtension = extension !== '' && ALLOWED_EXTENSIONS.has(extension)

      if (!isImageByType && !isAllowedExtension) {
        const msg = 'Veuillez sélectionner une image valide'
        setError(msg)
        toast.error(msg)
        return false
      }

      if (!isAllowedExtension) {
        const msg = 'Format non supporté. Utilise JPG, PNG, WebP, GIF, AVIF, BMP, HEIC ou HEIF.'
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
    },
    [maxSizeMB]
  )

  // Upload via XMLHttpRequest avec progression
  const uploadFile = useCallback(
    async (file: File) => {
      if (!validateFile(file)) return

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl) {
        const msg = 'NEXT_PUBLIC_SUPABASE_URL est manquante'
        setError(msg)
        toast.error(msg)
        onError?.(new Error(msg))
        return
      }

      if (!supabaseAnonKey) {
        const msg = 'NEXT_PUBLIC_SUPABASE_ANON_KEY est manquante'
        setError(msg)
        toast.error(msg)
        onError?.(new Error(msg))
        return
      }

      const baseUrl = supabaseUrl.replace(/\/+$/, '')
      const cleanBucket = bucket.trim()
      const cleanFolder = normalizeFolder(folder)
      const extension = getExtension(file)
      const contentType = getContentType(file, extension)

      const uniqueId = `${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 10)}`

      const fileName = `${uniqueId}.${extension}`
      const objectPath = cleanFolder ? `${cleanFolder}/${fileName}` : fileName

      const encodedBucket = encodeURIComponent(cleanBucket)
      const encodedPath = objectPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')

      const endpoint = `${baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`

      clearObjectUrl()

      const localPreview = URL.createObjectURL(file)
      objectUrlRef.current = localPreview

      setPreview(localPreview)
      setUploading(true)
      setProgress(0)
      setError(null)

      try {
        // Récupérer le token de session
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession()

        const accessToken = session?.access_token

        if (!accessToken) {
          throw new Error('Non authentifié – veuillez vous connecter.')
        }

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()

          xhr.open('POST', endpoint, true)

          // Headers importants pour Supabase Storage
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
          xhr.setRequestHeader('apikey', supabaseAnonKey)
          xhr.setRequestHeader('Content-Type', contentType)
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
              reject(
                new Error(
                  getErrorMessage(xhr.status, xhr.statusText, xhr.responseText)
                )
              )
            }
          }

          xhr.onerror = () => {
            reject(new Error("Erreur réseau lors de l'upload."))
          }

          xhr.ontimeout = () => {
            reject(new Error("Délai dépassé lors de l'upload."))
          }

          xhr.onabort = () => {
            reject(new Error("Upload annulé."))
          }

          xhr.timeout = 120000

          xhr.send(file)
        })

        // Récupérer l'URL publique
        const { data } = supabaseBrowser.storage
          .from(cleanBucket)
          .getPublicUrl(objectPath)

        const publicUrl = data?.publicUrl

        if (!publicUrl) {
          throw new Error('URL publique introuvable après upload.')
        }

        clearObjectUrl()

        setPhotoUrl(publicUrl)
        setPreview(publicUrl)
        onUpload(publicUrl)

        toast.success('Photo uploadée avec succès')
      } catch (err: unknown) {
        const errorInstance =
          err instanceof Error ? err : new Error(String(err))

        console.error('Erreur upload:', errorInstance)

        setError(errorInstance.message || 'Erreur lors de l’upload')
        toast.error(errorInstance.message || 'Erreur lors de l’upload')

        clearObjectUrl()
        setPreview(sourceImage)

        onError?.(errorInstance)
      } finally {
        setUploading(false)
        setProgress(0)

        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [
      bucket,
      folder,
      onUpload,
      onError,
      sourceImage,
      validateFile,
      clearObjectUrl,
    ]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        void uploadFile(file)
      }
    },
    [uploadFile]
  )

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()

      clearObjectUrl()

      setPhotoUrl(null)
      setPreview(null)
      setError(null)
      setProgress(0)

      onUpload(null)
      onRemove?.()

      toast.success('Photo supprimée')
    },
    [clearObjectUrl, onRemove, onUpload]
  )

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled && !uploading) setDragOver(true)
    },
    [disabled, uploading]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)

      if (disabled || uploading) return

      const file = e.dataTransfer.files?.[0]
      if (file) {
        void uploadFile(file)
      }
    },
    [disabled, uploading, uploadFile]
  )

  const triggerFileInput = () => {
    if (!disabled && !uploading) {
      fileInputRef.current?.click()
    }
  }

  const aspectRatioClass = {
    square: 'aspect-square',
    video: 'aspect-video',
    auto: '',
  } as const

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

            <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {progress}%
            </span>
          </div>
        ) : preview ? (
          <>
            <img
              src={preview}
              alt="Aperçu"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = '/placeholder.jpg'
              }}
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
              <Badge variant="gold" size="sm" className="shadow-soft">
                Photo
              </Badge>
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
              {accept === 'image/*' ? 'JPG, PNG, WebP' : accept} - Max{' '}
              {maxSizeMB} Mo
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