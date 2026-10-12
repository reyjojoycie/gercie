// components/GlowEffect.tsx
'use client'

import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

type GlowColor = 'brand' | 'accent' | 'warm' | 'luxury' | 'gold' | 'burgundy'

interface GlowEffectProps {
  children: React.ReactNode
  /** Couleur de la lueur (utilise les couleurs du thème) */
  color?: GlowColor
  /** Intensité de l'ombre (taille en px, défaut 20) */
  intensity?: number
  /** Active l'animation de pulsation */
  pulse?: boolean
  /** Classe additionnelle pour le conteneur */
  className?: string
  /** Style de l'ombre : "soft" (par défaut) ou "sharp" */
  variant?: 'soft' | 'sharp'
}

const colorMap: Record<GlowColor, string> = {
  brand: 'rgba(71, 102, 247, 0.35)',
  accent: 'rgba(24, 199, 138, 0.35)',
  warm: 'rgba(246, 207, 42, 0.35)',
  luxury: 'rgba(139, 92, 246, 0.35)',
  gold: 'rgba(201, 169, 98, 0.35)',
  burgundy: 'rgba(128, 0, 32, 0.35)',
}

export function GlowEffect({
  children,
  color = 'brand',
  intensity = 20,
  pulse = false,
  className,
  variant = 'soft',
}: GlowEffectProps) {
  const shadowColor = colorMap[color]
  const blur = variant === 'sharp' ? intensity * 0.5 : intensity
  const spread = variant === 'sharp' ? 2 : 0

  const shadowStyle = {
    boxShadow: `0 0 ${blur}px ${spread}px ${shadowColor}`,
  }

  const pulseAnimation = pulse
    ? {
        boxShadow: [
          `0 0 ${blur}px ${spread}px ${shadowColor}`,
          `0 0 ${blur * 1.5}px ${spread + 5}px ${shadowColor}`,
          `0 0 ${blur}px ${spread}px ${shadowColor}`,
        ],
      }
    : {}

  return (
    <motion.div
      className={cn('relative rounded-2xl', className)}
      style={shadowStyle}
      animate={pulseAnimation}
      transition={
        pulse
          ? {
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  )
}
