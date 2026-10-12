// components/home/CountdownTimer.tsx
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Clock } from 'lucide-react'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

interface CountdownTimerProps {
  endTime: string
  label?: string
  showDays?: boolean
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const UPDATE_INTERVAL = 1000 // 1 seconde
const UPDATE_INTERVAL_REDUCED = 60000 // 1 minute si reduced motion

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function calculateTimeLeft(endTime: string): TimeLeft {
  const now = Date.now()
  const target = new Date(endTime).getTime()
  
  // Validation de la date
  if (isNaN(target)) {
    console.warn('Date de fin invalide:', endTime)
    return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  }
  
  const distance = target - now
  
  if (distance <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  }
  
  return {
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((distance / (1000 * 60)) % 60),
    seconds: Math.floor((distance / 1000) % 60),
  }
}

function formatNumber(num: number): string {
  return String(num).padStart(2, '0')
}

function formatTimeText(time: TimeLeft, showDays: boolean): string {
  const parts: string[] = []
  
  if (showDays && time.days > 0) {
    parts.push(`${time.days} jour${time.days > 1 ? 's' : ''}`)
  }
  
  parts.push(`${time.hours} heure${time.hours > 1 ? 's' : ''}`)
  parts.push(`${time.minutes} minute${time.minutes > 1 ? 's' : ''}`)
  parts.push(`${time.seconds} seconde${time.seconds > 1 ? 's' : ''}`)
  
  return parts.join(', ')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function CountdownTimer({
  endTime,
  label = 'Offre se termine dans',
  showDays = true,
  className = '',
}: CountdownTimerProps) {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(endTime))
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Déterminer si le countdown est terminé
  const isExpired = useMemo(() => {
    return timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0
  }, [timeLeft])
  
  // Format texte pour accessibilité
  const timeText = useMemo(() => formatTimeText(timeLeft, showDays), [timeLeft, showDays])
  
  // Format compact pour l'affichage
  const displayTime = useMemo(() => {
    if (isExpired) return '00:00:00'
    
    if (showDays && timeLeft.days > 0) {
      return `${timeLeft.days}j ${formatNumber(timeLeft.hours)}:${formatNumber(timeLeft.minutes)}:${formatNumber(timeLeft.seconds)}`
    }
    
    return `${formatNumber(timeLeft.hours)}:${formatNumber(timeLeft.minutes)}:${formatNumber(timeLeft.seconds)}`
  }, [timeLeft, showDays, isExpired])

  /* ───────────────────────────────────────────────────────────── */
  /*  MISE À JOUR DU COUNTDOWN                                     */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    // Mettre à jour immédiatement
    setTimeLeft(calculateTimeLeft(endTime))
    
    // Déterminer l'intervalle selon les préférences
    const interval = prefersReducedMotion ? UPDATE_INTERVAL_REDUCED : UPDATE_INTERVAL
    
    // Configurer l'intervalle
    intervalRef.current = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(endTime)
      setTimeLeft(newTimeLeft)
      
      // Arrêter si terminé
      if (newTimeLeft.days === 0 && newTimeLeft.hours === 0 && newTimeLeft.minutes === 0 && newTimeLeft.seconds === 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }, interval)
    
    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [endTime, prefersReducedMotion])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDU                                                        */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 sm:gap-2 
        text-xs sm:text-sm md:text-base
        font-mono font-semibold
        text-white 
        bg-gold-500/90 
        px-2.5 sm:px-3 md:px-4 
        py-1 sm:py-1.5 
        rounded-full
        shadow-sm
        ${isExpired ? 'opacity-60' : ''}
        ${className}
      `}
      role="timer"
      aria-live={prefersReducedMotion ? 'off' : 'polite'}
      aria-atomic="true"
      aria-label={`${label} : ${timeText}`}
    >
      <Clock 
        size={14} 
        className="sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" 
        aria-hidden="true"
      />
      
      <span 
        className="tabular-nums tracking-tight"
        aria-hidden="true"
      >
        {isExpired ? 'Terminé' : displayTime}
      </span>
      
      {/* Texte accessible pour lecteurs d'écran */}
      <span className="sr-only">
        {isExpired ? 'Offre terminée' : `${label} : ${timeText}`}
      </span>
    </div>
  )
}