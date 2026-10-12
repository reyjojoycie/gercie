// components/PatternBackground.tsx
'use client'

import { cn } from '@/lib/utils'

type PatternType = 'dots' | 'lines' | 'hexagons' | 'crosshatch'

interface PatternBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Type de motif */
  pattern?: PatternType
  /** Couleur du motif (classe Tailwind de couleur de texte) */
  color?: string
  /** Opacité du motif (0-100) */
  opacity?: number
  /** Taille du motif en px (défaut 20) */
  size?: number
  /** Applique un fondu sur les bords (nécessite une classe CSS personnalisée) */
  fadeEdges?: boolean
}

/**
 * Génère le SVG d'un motif.
 */
function getPatternSvg(type: PatternType, size: number): string {
  switch (type) {
    case 'dots':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="none"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 8}" fill="currentColor"/></svg>`
    case 'lines':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="none"><path d="M0 ${size / 2} H${size}" stroke="currentColor" stroke-width="0.5"/><path d="M${size / 2} 0 V${size}" stroke="currentColor" stroke-width="0.5"/></svg>`
    case 'hexagons':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 0.866}" fill="none"><polygon points="${size / 2},0 ${size},${size * 0.433} ${size},${size * 0.433}" fill="none" stroke="currentColor" stroke-width="0.5"/></svg>`
    case 'crosshatch':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="none"><path d="M0 0 L${size} ${size}" stroke="currentColor" stroke-width="0.5"/><path d="M${size} 0 L0 ${size}" stroke="currentColor" stroke-width="0.5"/></svg>`
  }
}

export function PatternBackground({
  pattern = 'dots',
  color = 'text-brand-500',
  opacity = 10,
  size = 20,
  fadeEdges = false,
  className,
  children,
  ...props
}: PatternBackgroundProps) {
  const svg = getPatternSvg(pattern, size)
  const encoded = typeof window !== 'undefined' ? btoa(svg) : ''
  const dataUri = `data:image/svg+xml;base64,${encoded}`
  const opacityValue = opacity / 100

  return (
    <div className={cn('relative', className)} {...props}>
      {/* Calque du motif */}
      <div
        className={cn(
          'absolute inset-0 pointer-events-none',
          color,
          fadeEdges && 'mask-image-fade'
        )}
        style={{
          backgroundImage: `url(${dataUri})`,
          backgroundSize: `${size}px ${size}px`,
          opacity: opacityValue,
        }}
      />
      {/* Contenu */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
