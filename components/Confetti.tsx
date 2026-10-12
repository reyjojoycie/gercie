// components/Confetti.tsx
'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

// Palette inspirée de la charte Gercie
const COLORS = [
  '#4766f7', // brand-500
  '#18c78a', // accent-500
  '#f6cf2a', // warm-500
  '#8b5cf6', // luxury-500
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
]

interface Particle {
  id: number
  x: number
  y: number
  color: string
  size: number
  rotation: number
  delay: number
  duration: number
}

interface ConfettiProps {
  /** Déclenche l'animation quand actif */
  active?: boolean
  /** Nombre de particules */
  count?: number
  /** Zone de dispersion (en pourcentage de la largeur hauteur) */
  spread?: { width?: number; height?: number }
  /** Durée de l'animation (s) */
  duration?: number
  /** Callback appelé à la fin de l'animation */
  onComplete?: () => void
  className?: string
}

export function Confetti({
  active = true,
  count = 80,
  spread = { width: 100, height: 100 },
  duration = 3,
  onComplete,
  className,
}: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([])
  const [show, setShow] = useState(active)

  useEffect(() => {
    if (!active) {
      setShow(false)
      setParticles([])
      return
    }

    setShow(true)
    const newParticles: Particle[] = Array.from({ length: count }).map((_, i) => ({
      id: i,
      x: Math.random() * (spread.width || 100),
      y: -(Math.random() * (spread.height || 200) + 50), // démarre hors écran (haut)
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: Math.random() * 8 + 6,
      rotation: Math.random() * 360,
      delay: Math.random() * 0.5,
      duration: duration - 0.5 + Math.random() * 1,
    }))

    setParticles(newParticles)

    const timer = setTimeout(() => {
      setShow(false)
      onComplete?.()
    }, duration * 1000)

    return () => clearTimeout(timer)
  }, [active, count, spread.width, spread.height, duration, onComplete])

  return (
    <AnimatePresence>
      {show && (
        <div
          className={cn(
            'fixed inset-0 pointer-events-none z-[9999] overflow-hidden',
            className
          )}
          aria-hidden="true"
        >
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                x: `${p.x}vw`,
                y: p.y,
                rotate: p.rotation,
                opacity: 1,
                scale: 1,
              }}
              animate={{
                y: `${80 + Math.random() * 20}vh`, // tombe jusqu'en bas
                opacity: 0,
                scale: 0.2,
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: [0.2, 0, 0.8, 1],
              }}
              style={{
                position: 'absolute',
                left: `${p.x}vw`,
                width: p.size,
                height: p.size * 1.4,
                backgroundColor: p.color,
                borderRadius: '2px',
                boxShadow: `0 2px 6px rgba(0,0,0,0.15)`,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}

// Hook utilitaire pour déclencher des confettis facilement
export function useConfetti() {
  const [showConfetti, setShowConfetti] = useState(false)

  const trigger = () => {
    setShowConfetti(true)
    setTimeout(() => setShowConfetti(false), 100) // reset pour réactiver si besoin
  }

  const ConfettiComponent = (
    <Confetti active={showConfetti} onComplete={() => setShowConfetti(false)} />
  )

  return { trigger, ConfettiComponent }
}
