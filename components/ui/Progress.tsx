// components/ui/Progress.tsx
'use client'

import React, { useMemo, forwardRef, useEffect, useState, useCallback, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { motion, useAnimation, type Variants } from 'framer-motion'
import { Tooltip } from './Tooltip' // composant existant amélioré

/* ========================================================================
   Types
   ======================================================================== */

type ProgressType = 'line' | 'circle' | 'semicircle' | 'steps' | 'bar' | 'dash'
type ProgressColor = 'brand' | 'accent' | 'warm' | 'luxury' | 'gold' | 'success' | 'danger' | 'info' | 'neutral'
type ProgressSize = 'sm' | 'md' | 'lg' | 'xl' | number

interface ProgressProps {
  /** Type de barre de progression */
  type?: ProgressType
  /** Valeur actuelle (entre min et max, ou indéterminée si absente) */
  value?: number
  /** Valeur minimale (défaut 0) */
  min?: number
  /** Valeur maximale (défaut 100) */
  max?: number
  /** Pour type "circle" / "semicircle", épaisseur du trait (px) */
  thickness?: number
  /** Taille (hauteur pour line, diamètre pour circle) */
  size?: ProgressSize
  /** Palette de couleur */
  color?: ProgressColor
  /** Affiche le pourcentage textuellement */
  showPercentage?: boolean
  /** Label (accessible) */
  label?: string
  /** Mode indéterminé (animation infinie) */
  indeterminate?: boolean
  /** Animation de la progression */
  animate?: boolean
  /** Pour type "steps", nombre total d'étapes */
  steps?: number
  /** Pour type "steps", étape courante (index base 0) */
  currentStep?: number
  /** Pour type "dash", épaisseur du trait */
  dashThickness?: number
  /** Classe additionnelle */
  className?: string
  /** Variante de couleur (utilisée pour la barre remplie) */
  variant?: 'solid' | 'gradient' | 'glossy'
  /** Icône en fin de progression (si value >= max) */
  completedIcon?: ReactNode
  /** Icône d'erreur */
  errorIcon?: ReactNode
  /** État d'erreur (change la couleur en danger) */
  isError?: boolean
  /** Tooltip au survol */
  tooltip?: string
  /** Texte du pourcentage personnalisé */
  formatPercentage?: (percent: number) => string
  /** Accessibilité : aria-label */
  ariaLabel?: string
  /** Accessibilité : identifiant */
  id?: string
}

/* ========================================================================
   Mappings
   ======================================================================== */

const colorMap: Record<ProgressColor, string> = {
  brand: 'from-brand-400 to-brand-600',
  accent: 'from-accent-400 to-accent-600',
  warm: 'from-warm-400 to-warm-600',
  luxury: 'from-luxury-400 to-luxury-600',
  gold: 'from-gold-400 to-gold-600',
  success: 'from-success-400 to-success-600',
  danger: 'from-danger-400 to-danger-600',
  info: 'from-info-400 to-info-600',
  neutral: 'from-neutral-400 to-neutral-600',
}

const solidColorMap: Record<ProgressColor, string> = {
  brand: 'bg-brand-500',
  accent: 'bg-accent-500',
  warm: 'bg-warm-500',
  luxury: 'bg-luxury-500',
  gold: 'bg-gold-500',
  success: 'bg-success-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  neutral: 'bg-neutral-500',
}

const sizeMap: Record<string, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
  xl: 'h-6',
}

const dashSizeMap: Record<string, number> = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
}

/* ========================================================================
   Composants internes
   ======================================================================== */

// --- Barre linéaire ---
const LineProgress = ({
  value,
  min,
  max,
  color,
  indeterminate,
  animate,
  size,
  variant,
  className,
  isError,
}: {
  value?: number
  min: number
  max: number
  color: ProgressColor
  indeterminate: boolean
  animate: boolean
  size: ProgressSize
  variant: ProgressProps['variant']
  className?: string
  isError?: boolean
}) => {
  const percent = useMemo(() => {
    if (indeterminate || value === undefined) return 0
    return Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100)
  }, [value, min, max, indeterminate])

  const height = typeof size === 'number' ? `${size}px` : sizeMap[size as string] || 'h-2.5'

  const barColor = isError
    ? 'bg-danger-500'
    : variant === 'gradient'
      ? `bg-gradient-to-r ${colorMap[color]}`
      : solidColorMap[color]

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700',
        height,
        className
      )}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={indeterminate ? 'Chargement...' : `${Math.round(percent)}%`}
    >
      {indeterminate ? (
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-1/3 rounded-full',
            variant === 'gradient' ? `bg-gradient-to-r ${colorMap[color]}` : solidColorMap[color]
          )}
          style={{
            animation: 'indeterminate-progress 1.5s ease-in-out infinite',
          }}
        />
      ) : (
        <motion.div
          className={cn('h-full rounded-full', barColor)}
          initial={{ width: animate ? '0%' : `${percent}%` }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: animate ? 0.6 : 0, ease: 'easeOut' }}
        />
      )}
    </div>
  )
}

// --- Cercle SVG ---
const CircleProgress = ({
  value,
  min,
  max,
  thickness = 6,
  size = 80,
  color,
  indeterminate,
  animate,
  variant,
  isError,
  showPercentage,
  formatPercentage,
}: {
  value?: number
  min: number
  max: number
  thickness?: number
  size: ProgressSize
  color: ProgressColor
  indeterminate: boolean
  animate: boolean
  variant: ProgressProps['variant']
  isError?: boolean
  showPercentage?: boolean
  formatPercentage?: (percent: number) => string
}) => {
  const percent = useMemo(() => {
    if (indeterminate || value === undefined) return 0
    return Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100)
  }, [value, min, max, indeterminate])

  const diameter = typeof size === 'number' ? size : 80
  const radius = (diameter - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percent / 100) * circumference

  const gradientId = useMemo(() => `progress-grad-${Math.random().toString(36).substr(2, 9)}`, [])

  const circleColor = isError ? '#ef4444' : variant === 'gradient' ? `url(#${gradientId})` : undefined
  const solidColor = isError ? '#ef4444' : color === 'brand' ? '#4766f7' : '#10b981' // fallback

  const controls = useAnimation()

  useEffect(() => {
    if (animate) {
      controls.start({ strokeDashoffset })
    } else {
      controls.set({ strokeDashoffset })
    }
  }, [animate, strokeDashoffset, controls])

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: diameter, height: diameter }}
    >
      <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
        {variant === 'gradient' && (
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={isError ? '#f87171' : colorMap[color].split(' ')[0].replace('from-', '#')} />
              <stop offset="100%" stopColor={isError ? '#ef4444' : colorMap[color].split(' ')[2].replace('to-', '#')} />
            </linearGradient>
          </defs>
        )}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-neutral-200 dark:text-neutral-700"
        />
        {indeterminate ? (
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke={solidColor}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
            className="animate-spin-slow origin-center"
            style={{ animationDuration: '2s' }}
          />
        ) : (
          <motion.circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke={circleColor || solidColor}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: animate ? circumference : strokeDashoffset }}
            animate={controls}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
          />
        )}
      </svg>
      {showPercentage && (
        <span className="absolute text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {formatPercentage ? formatPercentage(percent) : `${Math.round(percent)}%`}
        </span>
      )}
    </div>
  )
}

// --- Demi-cercle ---
const SemicircleProgress = ({
  value,
  min,
  max,
  thickness = 6,
  size = 120,
  color,
  indeterminate,
  animate,
  isError,
  showPercentage,
}: {
  value?: number
  min: number
  max: number
  thickness?: number
  size: ProgressSize
  color: ProgressColor
  indeterminate: boolean
  animate: boolean
  isError?: boolean
  showPercentage?: boolean
}) => {
  const percent = useMemo(() => {
    if (indeterminate || value === undefined) return 0
    return Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100)
  }, [value, min, max, indeterminate])

  const diameter = typeof size === 'number' ? size : 120
  const strokeWidth = thickness
  const radius = (diameter - strokeWidth) / 2
  const circumference = Math.PI * radius
  const dashOffset = circumference - (percent / 100) * circumference

  const solidColor = isError ? '#ef4444' : color === 'brand' ? '#4766f7' : '#10b981'

  return (
    <div className="relative inline-flex flex-col items-center justify-end" style={{ width: diameter, height: diameter / 2 + 10 }}>
      <svg
        width={diameter}
        height={diameter / 2 + strokeWidth}
        viewBox={`0 0 ${diameter} ${diameter / 2 + strokeWidth}`}
      >
        <path
          d={`M ${strokeWidth / 2},${diameter / 2} A ${radius},${radius} 0 0 1 ${diameter - strokeWidth / 2},${diameter / 2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-200 dark:text-neutral-700"
          strokeLinecap="round"
        />
        {!indeterminate && (
          <motion.path
            d={`M ${strokeWidth / 2},${diameter / 2} A ${radius},${radius} 0 0 1 ${diameter - strokeWidth / 2},${diameter / 2}`}
            fill="none"
            stroke={solidColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: animate ? circumference : dashOffset }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )}
        {indeterminate && (
          <path
            d={`M ${strokeWidth / 2},${diameter / 2} A ${radius},${radius} 0 0 1 ${diameter - strokeWidth / 2},${diameter / 2}`}
            fill="none"
            stroke={solidColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.3} ${circumference * 0.7}`}
            className="animate-spin-slow origin-center"
          />
        )}
      </svg>
      {showPercentage && (
        <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 -mt-2">
          {Math.round(percent)}%
        </span>
      )}
    </div>
  )
}

// --- Barre avec segments (dash) ---
const DashProgress = ({
  value,
  min,
  max,
  color,
  indeterminate,
  animate,
  dashThickness = 6,
  size = 'md',
  isError,
}: {
  value?: number
  min: number
  max: number
  color: ProgressColor
  indeterminate: boolean
  animate: boolean
  dashThickness?: number
  size: ProgressSize
  isError?: boolean
}) => {
  const segments = 20
  const percent = useMemo(() => {
    if (indeterminate || value === undefined) return 0
    return Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100)
  }, [value, min, max, indeterminate])

  const filledSegments = Math.round((percent / 100) * segments)

  const gap = typeof size === 'number' ? size / 4 : dashSizeMap[size as string] || 6

  return (
    <div className="flex items-center gap-1" role="progressbar" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}>
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-2 flex-1 rounded-full transition-colors duration-300',
            i < filledSegments
              ? isError
                ? 'bg-danger-500'
                : solidColorMap[color]
              : 'bg-neutral-200 dark:bg-neutral-700'
          )}
          style={{ height: dashThickness }}
        />
      ))}
    </div>
  )
}

// --- Étapes (stepper) ---
const StepsProgress = ({
  steps = 5,
  currentStep = 0,
  color,
  size = 'md',
  isError,
}: {
  steps: number
  currentStep: number
  color: ProgressColor
  size: ProgressSize
  isError?: boolean
}) => {
  const stepSize = typeof size === 'number' ? size : size === 'sm' ? 24 : size === 'lg' ? 36 : 30

  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={currentStep} aria-valuemin={0} aria-valuemax={steps}>
      {Array.from({ length: steps }).map((_, i) => (
        <React.Fragment key={i}>
          <div
            className={cn(
              'rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300',
              i < currentStep
                ? isError
                  ? 'bg-danger-500 text-white'
                  : `${solidColorMap[color]} text-white`
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500'
            )}
            style={{ width: stepSize, height: stepSize }}
          >
            {i < currentStep ? '✓' : i + 1}
          </div>
          {i < steps - 1 && (
            <div
              className={cn(
                'flex-1 h-0.5 rounded-full',
                i < currentStep
                  ? isError
                    ? 'bg-danger-500'
                    : solidColorMap[color]
                  : 'bg-neutral-200 dark:bg-neutral-700'
              )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/* ========================================================================
   Composant Progress principal
   ======================================================================== */
const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      type = 'line',
      value,
      min = 0,
      max = 100,
      thickness = 6,
      size = 'md',
      color = 'brand',
      showPercentage = false,
      label,
      indeterminate = false,
      animate = true,
      steps = 5,
      currentStep = 0,
      dashThickness = 6,
      className,
      variant = 'gradient',
      completedIcon,
      errorIcon,
      isError = false,
      tooltip,
      formatPercentage,
      ariaLabel,
      id,
    },
    ref
  ) => {
    const computedPercent = useMemo(() => {
      if (indeterminate || value === undefined) return 0
      return Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100)
    }, [value, min, max, indeterminate])

    const progressComponent = useMemo(() => {
      switch (type) {
        case 'line':
          return (
            <LineProgress
              value={value}
              min={min}
              max={max}
              color={color}
              indeterminate={indeterminate}
              animate={animate}
              size={size}
              variant={variant}
              className={className}
              isError={isError}
            />
          )
        case 'circle':
          return (
            <CircleProgress
              value={value}
              min={min}
              max={max}
              thickness={thickness}
              size={size}
              color={color}
              indeterminate={indeterminate}
              animate={animate}
              variant={variant}
              isError={isError}
              showPercentage={showPercentage}
              formatPercentage={formatPercentage}
            />
          )
        case 'semicircle':
          return (
            <SemicircleProgress
              value={value}
              min={min}
              max={max}
              thickness={thickness}
              size={size}
              color={color}
              indeterminate={indeterminate}
              animate={animate}
              isError={isError}
              showPercentage={showPercentage}
            />
          )
        case 'dash':
          return (
            <DashProgress
              value={value}
              min={min}
              max={max}
              color={color}
              indeterminate={indeterminate}
              animate={animate}
              dashThickness={dashThickness}
              size={size}
              isError={isError}
            />
          )
        case 'steps':
          return (
            <StepsProgress
              steps={steps}
              currentStep={currentStep}
              color={color}
              size={size}
              isError={isError}
            />
          )
        case 'bar':
          // Type bar : comme line mais avec hauteur plus grande et étiquette
          return (
            <LineProgress
              value={value}
              min={min}
              max={max}
              color={color}
              indeterminate={indeterminate}
              animate={animate}
              size={size}
              variant={variant}
              className={className}
              isError={isError}
            />
          )
        default:
          return null
      }
    }, [type, value, min, max, color, indeterminate, animate, size, variant, className, isError, thickness, showPercentage, formatPercentage, steps, currentStep, dashThickness])

    // Rendu avec label et pourcentage externe si demandé
    const percentText = formatPercentage ? formatPercentage(computedPercent) : `${Math.round(computedPercent)}%`

    const content = (
      <div ref={ref} className={cn('flex flex-col gap-2', className)} id={id}>
        {label && (
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{label}</span>
            {showPercentage && type !== 'circle' && type !== 'semicircle' && type !== 'steps' && (
              <span className="text-sm font-semibold text-neutral-500">{percentText}</span>
            )}
          </div>
        )}
        {progressComponent}
        {completedIcon && value !== undefined && value >= max && (
          <div className="flex justify-end mt-1">{completedIcon}</div>
        )}
        {errorIcon && isError && (
          <div className="flex justify-end mt-1">{errorIcon}</div>
        )}
      </div>
    )

    if (tooltip) {
      return <Tooltip content={tooltip}>{content}</Tooltip>
    }

    return content
  }
)
Progress.displayName = 'Progress'

/* ========================================================================
   Animation globale pour l'indéterminé (insérée dans le <style> du projet)
   ======================================================================== */
const injectGlobalStyles = () => {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes indeterminate-progress {
        0% { left: -40%; }
        100% { left: 100%; }
      }
    `
    if (!document.head.querySelector('[data-progress-keyframes]')) {
      style.setAttribute('data-progress-keyframes', 'true')
      document.head.appendChild(style)
    }
  }
}

// Exécution côté client
if (typeof window !== 'undefined') {
  injectGlobalStyles()
}

export { Progress }