// components/home/CountdownTimer.tsx
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { AlertTriangle, Check, Clock, Flame } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
}

export type CountdownTone =
  | 'accent'
  | 'danger'
  | 'warning'
  | 'info'
  | 'neutral'

export type CountdownSize = 'sm' | 'md' | 'lg'

export interface CountdownTimerProps {
  /** Date de fin ISO (ex: "2026-12-31T23:59:59Z") */
  endTime: string
  /** Label accessible affiché aux lecteurs d'écran */
  label?: string
  /** Afficher le nombre de jours */
  showDays?: boolean
  /** Ton sémantique (urgence, promo, info, etc.) */
  tone?: CountdownTone
  /** Taille visuelle */
  size?: CountdownSize
  /** Icône à gauche (par défaut selon le ton) */
  icon?: React.ReactNode
  /** Désactive l'animation pulse en mode urgent */
  disableUrgentPulse?: boolean
  /** Contenu affiché une fois le countdown terminé */
  expiredLabel?: string
  /** Classes additionnelles */
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const UPDATE_INTERVAL = 1000 // 1 seconde
const UPDATE_INTERVAL_REDUCED = 60_000 // 1 minute si reduced motion
const URGENT_THRESHOLD_MS = 60 * 60 * 1000 // 1 heure

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function calculateTimeLeft(endTime: string): TimeLeft {
  const now = Date.now()
  const target = new Date(endTime).getTime()

  if (Number.isNaN(target)) {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[CountdownTimer] date de fin invalide:', endTime)
    }
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 }
  }

  const distance = target - now

  if (distance <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 }
  }

  return {
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((distance / (1000 * 60)) % 60),
    seconds: Math.floor((distance / 1000) % 60),
    totalMs: distance,
  }
}

function padTwo(num: number): string {
  return String(num).padStart(2, '0')
}

function formatTimeText(time: TimeLeft, showDays: boolean): string {
  const parts: string[] = []

  if (showDays && time.days > 0) {
    parts.push(`${time.days} jour${time.days > 1 ? 's' : ''}`)
  }

  if (time.hours > 0 || (showDays && time.days > 0)) {
    parts.push(`${time.hours} heure${time.hours !== 1 ? 's' : ''}`)
  }

  parts.push(`${time.minutes} minute${time.minutes !== 1 ? 's' : ''}`)
  parts.push(`${time.seconds} seconde${time.seconds !== 1 ? 's' : ''}`)

  return parts.join(', ')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DESIGN TOKENS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const toneStyles: Record<CountdownTone, string> = {
  accent:
    'bg-accent text-accent-contrast border-accent/30 shadow-card',
  danger:
    'bg-danger text-danger-contrast border-danger/30 shadow-card',
  warning:
    'bg-warning text-warning-contrast border-warning/30 shadow-card',
  info:
    'bg-info text-info-contrast border-info/30 shadow-card',
  neutral:
    'bg-muted text-fg border-line shadow-card',
}

const expiredStyles =
  'bg-muted text-fg-muted border-line shadow-none'

const sizeStyles: Record<CountdownSize, string> = {
  sm: 'gap-1 px-2 py-0.5 text-[10px] sm:text-xs',
  md: 'gap-1.5 px-2.5 py-1 text-xs sm:text-sm',
  lg: 'gap-2 px-3 sm:px-4 py-1.5 text-sm sm:text-base',
}

const iconSizeMap: Record<CountdownSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
}

const defaultIconForTone: Record<CountdownTone, React.ComponentType<any>> = {
  accent: Flame,
  danger: Flame,
  warning: Clock,
  info: Clock,
  neutral: Clock,
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function CountdownTimer({
  endTime,
  label = 'Offre se termine dans',
  showDays = true,
  tone = 'danger',
  size = 'md',
  icon,
  disableUrgentPulse = false,
  expiredLabel = 'Terminé',
  className,
}: CountdownTimerProps) {
  const accessibility = useAccessibilityPreferences() as {
    prefersReducedMotion?: boolean
  }
  const prefersReducedMotion = Boolean(accessibility?.prefersReducedMotion)

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    calculateTimeLeft(endTime)
  )
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ───────────────────────────────────────────────────────────── */
  /*  DÉRIVÉS                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const isExpired =
    timeLeft.days === 0 &&
    timeLeft.hours === 0 &&
    timeLeft.minutes === 0 &&
    timeLeft.seconds === 0

  const isUrgent =
    !isExpired &&
    !disableUrgentPulse &&
    !prefersReducedMotion &&
    timeLeft.totalMs > 0 &&
    timeLeft.totalMs <= URGENT_THRESHOLD_MS

  const timeText = useMemo(
    () => formatTimeText(timeLeft, showDays),
    [timeLeft, showDays]
  )

  const displayTime = useMemo(() => {
    if (isExpired) return expiredLabel

    if (showDays && timeLeft.days > 0) {
      return `${timeLeft.days}j ${padTwo(timeLeft.hours)}:${padTwo(
        timeLeft.minutes
      )}:${padTwo(timeLeft.seconds)}`
    }

    return `${padTwo(timeLeft.hours)}:${padTwo(timeLeft.minutes)}:${padTwo(
      timeLeft.seconds
    )}`
  }, [timeLeft, showDays, isExpired, expiredLabel])

  /* ───────────────────────────────────────────────────────────── */
  /*  INTERVAL MANAGEMENT                                          */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setTimeLeft(calculateTimeLeft(endTime))

    const interval = prefersReducedMotion
      ? UPDATE_INTERVAL_REDUCED
      : UPDATE_INTERVAL

    intervalRef.current = setInterval(() => {
      const next = calculateTimeLeft(endTime)
      setTimeLeft(next)

      if (
        next.days === 0 &&
        next.hours === 0 &&
        next.minutes === 0 &&
        next.seconds === 0
      ) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }, interval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [endTime, prefersReducedMotion])

  /* ───────────────────────────────────────────────────────────── */
  /*  ICÔNE                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const IconComponent = icon
    ? null
    : isExpired
      ? Check
      : isUrgent
        ? AlertTriangle
        : defaultIconForTone[tone]

  const iconSize = iconSizeMap[size]

  const renderedIcon = icon ? (
    <span className="shrink-0" aria-hidden="true">
      {icon}
    </span>
  ) : IconComponent ? (
    <IconComponent
      size={iconSize}
      className="shrink-0"
      aria-hidden="true"
    />
  ) : null

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDU                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const containerClasses = cn(
    'inline-flex items-center',
    'rounded-pill border',
    'font-mono font-semibold tabular-nums tracking-tight',
    'transition-opacity duration-300 motion-reduce:transition-none',
    isExpired ? expiredStyles : toneStyles[tone],
    isExpired && 'opacity-70',
    isUrgent && 'motion-safe:animate-pulse',
    sizeStyles[size],
    className
  )

  const ariaLabel = isExpired
    ? `${label} : terminée`
    : `${label} : ${timeText}`

  return (
    <div
      className={containerClasses}
      role="timer"
      aria-live={prefersReducedMotion ? 'off' : 'polite'}
      aria-atomic="true"
      aria-label={ariaLabel}
    >
      {renderedIcon}

      <span aria-hidden="true">{displayTime}</span>

      <span className="sr-only">{ariaLabel}</span>
    </div>
  )
}