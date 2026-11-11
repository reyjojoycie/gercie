// components/profile/AvatarCropModal.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  AlertCircle,
  Loader2,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const OUTPUT_SIZE = 512
const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface AvatarCropModalProps {
  isOpen: boolean
  imageSrc: string
  onCropComplete: (croppedFile: File) => void
  onClose: () => void
}

/* ------------------------------------------------------------------ */
/* Helpers canvas                                                      */
/* ------------------------------------------------------------------ */

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.crossOrigin = 'anonymous'

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Impossible de charger l’image.'))

    image.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png'
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Impossible de générer le fichier image.'))
        }
      },
      type
    )
  })
}

async function generateCroppedFile(
  imageSrc: string,
  cropArea: Area,
  _rotation = 0
): Promise<File> {
  const image = await createImage(imageSrc)

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Le canvas n’est pas supporté par ce navigateur.')
  }

  ctx.save()

  // Masque circulaire pour un avatar rond propre
  ctx.beginPath()
  ctx.arc(
    OUTPUT_SIZE / 2,
    OUTPUT_SIZE / 2,
    OUTPUT_SIZE / 2,
    0,
    Math.PI * 2
  )
  ctx.clip()

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  )

  ctx.restore()

  const blob = await canvasToBlob(canvas, 'image/png')

  return new File([blob], `avatar-${Date.now()}.png`, {
    type: 'image/png',
  })
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                 */
/* ------------------------------------------------------------------ */

export function AvatarCropModal({
  isOpen,
  imageSrc,
  onCropComplete,
  onClose,
}: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setCroppedAreaPixels(null)
    setError(null)
  }, [])

  useEffect(() => {
    if (isOpen) {
      reset()
    }
  }, [isOpen, imageSrc, reset])

  const handleCropChange = useCallback(
    (location: { x: number; y: number }) => {
      setCrop(location)
    },
    []
  )

  const handleZoomChange = useCallback((value: number) => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)))
  }, [])

  const handleRotationChange = useCallback((value: number) => {
    setRotation(value)
  }, [])

  const handleCropComplete = useCallback(
    (_croppedArea: Area, pixels: Area) => {
      setCroppedAreaPixels(pixels)
    },
    []
  )

  const increaseZoom = () => {
    handleZoomChange(zoom + ZOOM_STEP)
  }

  const decreaseZoom = () => {
    handleZoomChange(zoom - ZOOM_STEP)
  }

  const rotateLeft = () => {
    handleRotationChange(rotation - 15)
  }

  const rotateRight = () => {
    handleRotationChange(rotation + 15)
  }

  const handleConfirm = async () => {
    if (!croppedAreaPixels) {
      setError('La zone de recadrage n’est pas encore prête.')
      return
    }

    try {
      setProcessing(true)
      setError(null)

      const file = await generateCroppedFile(
        imageSrc,
        croppedAreaPixels,
        rotation
      )

      setProcessing(false)
      onCropComplete(file)
      onClose()
    } catch (err: any) {
      setProcessing(false)
      setError(err?.message || 'Impossible de recadrer l’image.')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Recadrer la photo"
      size="md"
      accent="gold"
    >
      <div className="space-y-5">
        {/* Erreur */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Zone de crop */}
        <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-border bg-black sm:h-96">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              restrictPosition
              onCropChange={handleCropChange}
              onZoomChange={handleZoomChange}
              onRotationChange={handleRotationChange}
              onCropComplete={handleCropComplete}
            />
          )}

          {processing && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
              <Loader2 size={32} className="animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Contrôles */}
        <div className="space-y-4">
          {/* Zoom */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={decreaseZoom}
              disabled={processing || zoom <= MIN_ZOOM}
              aria-label="Dézoomer"
            >
              <ZoomOut size={16} />
            </Button>

            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={zoom}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              disabled={processing}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-gold-500 disabled:opacity-50"
              aria-label="Zoom de l’image"
            />

            <Button
              variant="ghost"
              size="sm"
              onClick={increaseZoom}
              disabled={processing || zoom >= MAX_ZOOM}
              aria-label="Zoomer"
            >
              <ZoomIn size={16} />
            </Button>

            <span className="w-14 shrink-0 text-right text-xs font-medium text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Rotation + reset */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={rotateLeft}
                disabled={processing}
                leftIcon={<RotateCcw size={14} />}
              >
                Rotation gauche
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={rotateRight}
                disabled={processing}
                leftIcon={<RotateCw size={14} />}
              >
                Rotation droite
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={processing}
              leftIcon={<X size={14} />}
            >
              Réinitialiser
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline-gold"
            onClick={onClose}
            disabled={processing}
          >
            Annuler
          </Button>

          <Button
            variant="luxe"
            onClick={handleConfirm}
            disabled={processing || !croppedAreaPixels}
          >
            {processing ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                Traitement...
              </>
            ) : (
              'Appliquer'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default AvatarCropModal