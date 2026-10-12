// components/OrderSuccessAnimation.tsx
'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  CheckCircle2,
  Gift,
  Truck,
  PartyPopper,
  Sparkles,
  Star,
  ArrowRight,
  ShoppingBag,
  Home,
  Share2,
  Download,
} from 'lucide-react'

/* ========================================================================== */
/*  Types & Interfaces                                                         */
/* ========================================================================== */

type AnimationStyle = 'confetti' | 'stars' | 'fireworks' | 'minimal' | 'badge'

interface OrderSuccessAnimationProps {
  /** Numéro de commande (affiché dans le message) */
  orderNumber?: string
  /** Statut de la commande (payée, livrée, etc.) */
  status?: 'payee' | 'livree' | 'confirmee'
  /** Style d'animation */
  style?: AnimationStyle
  /** Durée totale de l'animation (ms) */
  duration?: number
  /** Afficher les boutons d'action */
  showActions?: boolean
  /** Callback pour suivre la commande */
  onTrackOrder?: () => void
  /** Callback pour continuer les achats */
  onContinueShopping?: () => void
  /** Callback pour partager */
  onShare?: () => void
  /** Callback après la fin de l'animation */
  onComplete?: () => void
  /** Message personnalisé */
  message?: string
  /** Nombre de confettis (si applicable) */
  particleCount?: number
  /** Taille du composant (pleine page / encart) */
  variant?: 'full' | 'card' | 'inline'
  /** Classe additionnelle */
  className?: string
}

/* ========================================================================== */
/*  Particules de confettis (canvas)                                           */
/* ========================================================================== */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
  opacity: number
  shape: 'rect' | 'circle'
}

const COLORS = [
  '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#85C1E9', '#F8C471', '#82E0AA', '#F1948A', '#AED6F1'
]

const ConfettiCanvas = ({
  active,
  duration = 4000,
  count = 80,
  onComplete,
}: {
  active: boolean
  duration?: number
  count?: number
  onComplete?: () => void
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)

  const initParticles = useCallback(() => {
    if (!canvasRef.current) return
    const { width, height } = canvasRef.current
    const particles: Particle[] = []

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * -height * 0.5, // démarrent au-dessus du canvas
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 4 + 2,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      })
    }
    particlesRef.current = particles
    startTimeRef.current = performance.now()
  }, [count])

  const animate = useCallback(
    (timestamp: number) => {
      if (!canvasRef.current) return
      const ctx = canvasRef.current.getContext('2d')
      if (!ctx) return

      const elapsed = timestamp - startTimeRef.current
      if (elapsed >= duration) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        onComplete?.()
        return
      }

      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

      const progress = elapsed / duration // 0 -> 1
      const fadeOutStart = 0.7 // début du fondu à 70% du temps

      particlesRef.current.forEach(p => {
        p.x += p.vx
        p.vy += 0.15 // gravité
        p.y += p.vy
        p.rotation += p.rotationSpeed

        if (progress > fadeOutStart) {
          p.opacity = 1 - (progress - fadeOutStart) / (1 - fadeOutStart)
        }

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      })

      animationRef.current = requestAnimationFrame(animate)
    },
    [duration, onComplete]
  )

  useEffect(() => {
    if (!active) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      return
    }
    initParticles()
    animationRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [active, animate, initParticles])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-20"
      width={typeof window !== 'undefined' ? window.innerWidth : 800}
      height={typeof window !== 'undefined' ? window.innerHeight : 600}
    />
  )
}

/* ========================================================================== */
/*  Sous‑composants d'étoiles animées                                          */
/* ========================================================================== */

const StarsAnimation = ({
  active,
  duration = 4000,
}: {
  active: boolean
  duration?: number
}) => {
  const stars = Array.from({ length: 20 }, (_, i) => i)

  return (
    <AnimatePresence>
      {active && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
          {stars.map((_, i) => (
            <motion.div
              key={i}
              initial={{
                opacity: 0,
                scale: 0,
                x: `${Math.random() * 100}%`,
                y: `${Math.random() * 100}%`,
              }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
                x: `${Math.random() * 100}%`,
                y: `${Math.random() * 100}%`,
              }}
              transition={{
                duration: duration / 1000,
                delay: Math.random() * 0.5,
                repeat: 0,
              }}
              className="absolute text-gold-400"
            >
              <Star size={Math.random() * 20 + 10} fill="currentColor" />
            </motion.div>
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}

/* ========================================================================== */
/*  Son de succès (optionnel, respecte les préférences)                        */
/* ========================================================================== */

const useSuccessSound = (active: boolean) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!active) return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    try {
      // Petit son de succès synthétisé
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(523.25, ctx.currentTime) // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1) // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2) // G5
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch {}
  }, [active])
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */

export function OrderSuccessAnimation({
  orderNumber,
  status = 'payee',
  style = 'confetti',
  duration = 4000,
  showActions = true,
  onTrackOrder,
  onContinueShopping,
  onShare,
  onComplete,
  message,
  particleCount = 80,
  variant = 'card',
  className,
}: OrderSuccessAnimationProps) {
  const [visible, setVisible] = useState(true)
  const [animationDone, setAnimationDone] = useState(false)

  useSuccessSound(visible)

  const handleComplete = useCallback(() => {
    setAnimationDone(true)
    onComplete?.()
  }, [onComplete])

  const statusMessages: Record<string, { title: string; icon: React.ReactNode; subtitle: string }> = {
    payee: {
      title: 'Paiement réussi !',
      icon: <CheckCircle2 size={48} className="text-green-500" />,
      subtitle: 'Votre commande a bien été enregistrée.',
    },
    livree: {
      title: 'Commande livrée !',
      icon: <Truck size={48} className="text-gold-500" />,
      subtitle: 'Profitez de votre achat 🎉',
    },
    confirmee: {
      title: 'Commande confirmée !',
      icon: <PartyPopper size={48} className="text-gold-500" />,
      subtitle: 'Vous recevrez bientôt une confirmation.',
    },
  }

  const currentMessage = message || statusMessages[status]?.subtitle || 'Merci de votre confiance.'
  const title = statusMessages[status]?.title || 'Succès !'

  const renderContent = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.4, type: 'spring', stiffness: 120 }}
      className="relative flex flex-col items-center text-center gap-4"
    >
      {/* Icône animée */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
      >
        {statusMessages[status]?.icon || (
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 size={48} className="text-green-500" />
          </div>
        )}
      </motion.div>

      {/* Titre */}
      <h2 className="text-2xl md:text-3xl font-bold text-foreground font-serif">
        {title}
      </h2>

      {/* Message */}
      <p className="text-muted-foreground text-sm md:text-base max-w-md">
        {currentMessage}
      </p>

      {/* Numéro de commande */}
      {orderNumber && (
        <Badge variant="gold" size="lg" className="px-4 py-2 text-base">
          Commande #{orderNumber}
        </Badge>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex flex-wrap gap-3 mt-4 justify-center">
          {onTrackOrder && (
            <Button variant="luxe" onClick={onTrackOrder} rightIcon={<ArrowRight size={16} />}>
              Suivre ma commande
            </Button>
          )}
          {onContinueShopping && (
            <Button variant="outline-gold" onClick={onContinueShopping} leftIcon={<ShoppingBag size={16} />}>
              Continuer mes achats
            </Button>
          )}
          {onShare && (
            <Button variant="ghost" onClick={onShare} leftIcon={<Share2 size={16} />}>
              Partager
            </Button>
          )}
          {!onTrackOrder && !onContinueShopping && (
            <Button variant="outline-gold" onClick={() => window.location.href = '/'} leftIcon={<Home size={16} />}>
              Retour à l'accueil
            </Button>
          )}
        </div>
      )}
    </motion.div>
  )

  const background = variant === 'full' ? (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm',
        className,
      )}
    >
      {style === 'confetti' && <ConfettiCanvas active={visible} duration={duration} count={particleCount} onComplete={handleComplete} />}
      {style === 'stars' && <StarsAnimation active={visible} duration={duration} />}
      {renderContent()}
    </div>
  ) : variant === 'card' ? (
    <div className={cn('relative bg-card rounded-2xl shadow-strong p-6 md:p-8', className)}>
      {style === 'confetti' && <ConfettiCanvas active={visible} duration={duration} count={particleCount / 2} onComplete={handleComplete} />}
      {style === 'stars' && <StarsAnimation active={visible} duration={duration} />}
      {renderContent()}
    </div>
  ) : (
    <div className={cn('relative', className)}>
      {renderContent()}
    </div>
  )

  return (
    <AnimatePresence>
      {visible && (
        <>
          {background}
        </>
      )}
    </AnimatePresence>
  )
}