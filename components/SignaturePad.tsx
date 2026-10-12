// components/SignaturePad.tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { Eraser, Check, X, PenTool } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

interface SignaturePadProps {
  onSave: (signatureDataUrl: string) => void
  onCancel?: () => void
  width?: number
  height?: number
  className?: string
  penColor?: string
  penSize?: number
}

export default function SignaturePad({
  onSave,
  onCancel,
  width = 500,
  height = 200,
  className = '',
  penColor,
  penSize = 2,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null)

  // Couleur par défaut basée sur le thème (si non fournie)
  const defaultPenColor = penColor ?? '#1e293b' // slate-800

  // Initialisation du canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.strokeStyle = defaultPenColor
    ctx.lineWidth = penSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    setContext(ctx)
    setHasSignature(false)

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const scale = window.devicePixelRatio || 1
      canvas.width = rect.width * scale
      canvas.height = rect.height * scale
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.scale(scale, scale)
      ctx.strokeStyle = defaultPenColor
      ctx.lineWidth = penSize
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [defaultPenColor, penSize])

  // Coordonnées relatives au canvas
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    let clientX: number, clientY: number
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }
    const x = (clientX - rect.left) * scaleX
    const y = (clientY - rect.top) * scaleY
    return { x, y }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const coords = getCanvasCoordinates(e)
    if (!coords || !context) return
    context.beginPath()
    context.moveTo(coords.x, coords.y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!isDrawing || !context) return
    const coords = getCanvasCoordinates(e)
    if (!coords) return
    context.lineTo(coords.x, coords.y)
    context.stroke()
    context.beginPath()
    context.moveTo(coords.x, coords.y)
    setHasSignature(true)
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    if (context) context.beginPath()
  }

  const clearSignature = () => {
    if (!context || !canvasRef.current) return
    context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setHasSignature(false)
  }

  const saveSignature = () => {
    if (!canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onSave(dataUrl)
  }

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden bg-white dark:bg-neutral-900 shadow-soft">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ width: '100%', height: 'auto', touchAction: 'none', cursor: 'crosshair' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full block"
        />
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearSignature}
          leftIcon={<Eraser size={16} />}
        >
          Effacer
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={saveSignature}
          disabled={!hasSignature}
          leftIcon={<Check size={16} />}
        >
          Enregistrer
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            leftIcon={<X size={16} />}
          >
            Annuler
          </Button>
        )}
      </div>
      <p className="text-xs text-neutral-400 dark:text-neutral-500 text-center">
        Signez dans le cadre ci-dessus (avec la souris ou le doigt)
      </p>
    </div>
  )
}
