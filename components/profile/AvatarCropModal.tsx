// components/profile/AvatarCropModal.tsx
'use client'

import { useState, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider' // composant à créer ou remplacer par input range
import Cropper, { Area } from 'react-easy-crop'
import getCroppedImg from './cropImage' // fonction utilitaire de canvas

interface AvatarCropModalProps {
  isOpen: boolean
  imageSrc: string
  onCropComplete: (croppedFile: File) => void
  onClose: () => void
}

export function AvatarCropModal({ isOpen, imageSrc, onCropComplete, onClose }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const onCropChange = (location: { x: number; y: number }) => setCrop(location)
  const onZoomChange = (zoom: number) => setZoom(zoom)
  const onCropCompleteHandler = (_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return
    const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels)
    onCropComplete(croppedFile)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recadrer la photo" size="md" accent="gold">
      <div className="space-y-4">
        <div className="relative w-full h-64 bg-black rounded-xl overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropCompleteHandler}
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline-gold" onClick={onClose}>Annuler</Button>
          <Button variant="luxe" onClick={handleConfirm}>Appliquer</Button>
        </div>
      </div>
    </Modal>
  )
}