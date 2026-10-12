// components/ui/ThemeToggle.tsx
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/contexts/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Sparkles,
  Sunrise,
  Sunset,
} from 'lucide-react'
import { Tooltip } from './Tooltip'
import { Dropdown, DropdownItem, DropdownSeparator, DropdownRadioItem } from './Dropdown'

/* ========================================================================
   Types
   ======================================================================== */
type ThemeToggleVariant = 'icon' | 'switch' | 'dropdown' | 'button' | 'minimal'
type ThemeToggleSize = 'sm' | 'md' | 'lg'

interface ThemeToggleProps {
  variant?: ThemeToggleVariant
  size?: ThemeToggleSize
  showLabel?: boolean
  lightLabel?: string
  darkLabel?: string
  systemLabel?: string
  className?: string
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right'
  disableTooltip?: boolean
  onChange?: (theme: 'light' | 'dark' | 'system') => void
}

/* ========================================================================
   Mappings
   ======================================================================== */
const sizeMap: Record<ThemeToggleSize, string> = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
}

const switchSizeMap: Record<ThemeToggleSize, { track: string; thumb: string }> = {
  sm: { track: 'w-10 h-5', thumb: 'w-4 h-4' },
  md: { track: 'w-12 h-6', thumb: 'w-5 h-5' },
  lg: { track: 'w-14 h-7', thumb: 'w-6 h-6' },
}

/* ========================================================================
   Sous-composants
   ======================================================================== */

// --- Icône animée (soleil/lune) ---
const AnimatedIcon = ({
  resolvedTheme,
  className,
}: {
  resolvedTheme: 'light' | 'dark'
  className?: string
}) => {
  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      <AnimatePresence mode="wait">
        {resolvedTheme === 'light' ? (
          <motion.div
            key="sun"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3 }}
          >
            <Sun className="h-full w-full text-gold-500" />
          </motion.div>
        ) : (
          <motion.div
            key="moon"
            initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3 }}
          >
            <Moon className="h-full w-full text-blue-300" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// --- Bouton icône simple ---
const IconToggle = ({
  resolvedTheme,
  toggleTheme,
  size,
  tooltipContent,
  disableTooltip,
  className,
}: {
  resolvedTheme: 'light' | 'dark'
  toggleTheme: () => void
  size: ThemeToggleSize
  tooltipContent: string
  disableTooltip?: boolean
  className?: string
}) => {
  const button = (
    <button
      onClick={toggleTheme}
      className={cn(
        'relative rounded-xl flex items-center justify-center transition-all duration-300',
        'hover:bg-neutral-100 dark:hover:bg-neutral-800',
        'focus-visible:outline-2 focus-visible:outline-brand-500',
        sizeMap[size],
        className
      )}
      aria-label={tooltipContent}
    >
      <AnimatedIcon resolvedTheme={resolvedTheme} className="w-5 h-5" />
      <span
        className={cn(
          'absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300',
          resolvedTheme === 'dark' ? 'bg-blue-400/10' : 'bg-gold-400/10'
        )}
      />
    </button>
  )

  if (disableTooltip) return button
  return <Tooltip content={tooltipContent}>{button}</Tooltip>
}

// --- Interrupteur (switch) ---
const SwitchToggle = ({
  resolvedTheme,
  toggleTheme,
  size,
  lightLabel,
  darkLabel,
  className,
}: {
  resolvedTheme: 'light' | 'dark'
  toggleTheme: () => void
  size: ThemeToggleSize
  lightLabel?: string
  darkLabel?: string
  className?: string
}) => {
  const { track, thumb } = switchSizeMap[size]
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      className={cn('relative inline-flex items-center gap-2', className)}
      role="switch"
      aria-checked={isDark}
      aria-label="Changer le thème"
    >
      <div
        className={cn(
          'relative rounded-full transition-colors duration-300',
          track,
          isDark
            ? 'bg-blue-600'
            : 'bg-neutral-300 dark:bg-neutral-600'
        )}
      >
        <motion.div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-md flex items-center justify-center',
            thumb
          )}
          initial={false}
          animate={{ left: isDark ? `calc(100% - ${thumb} - 2px)` : '2px' }}
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
        >
          {isDark ? (
            <Moon className="w-3 h-3 text-blue-600" />
          ) : (
            <Sun className="w-3 h-3 text-gold-500" />
          )}
        </motion.div>
      </div>
      {lightLabel !== undefined && darkLabel !== undefined && (
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {isDark ? darkLabel : lightLabel}
        </span>
      )}
    </button>
  )
}

// --- Bouton avec texte ---
const ButtonToggle = ({
  resolvedTheme,
  toggleTheme,
  size,
  lightLabel,
  darkLabel,
  className,
}: {
  resolvedTheme: 'light' | 'dark'
  toggleTheme: () => void
  size: ThemeToggleSize
  lightLabel?: string
  darkLabel?: string
  className?: string
}) => {
  const isDark = resolvedTheme === 'dark'
  const padding = size === 'sm' ? 'px-3 py-1.5' : size === 'lg' ? 'px-5 py-3' : 'px-4 py-2'
  const fontSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'flex items-center gap-2 rounded-xl font-medium transition-all duration-300',
        'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700',
        padding,
        fontSize,
        'text-neutral-700 dark:text-neutral-300',
        'focus-visible:outline-2 focus-visible:outline-brand-500',
        className
      )}
      aria-label="Changer le thème"
    >
      <AnimatedIcon resolvedTheme={resolvedTheme} className="w-4 h-4" />
      <span>{isDark ? darkLabel || 'Sombre' : lightLabel || 'Clair'}</span>
    </button>
  )
}

// --- Dropdown avec choix système ---
const DropdownToggle = ({
  themeChoice,
  resolvedTheme,
  setThemeChoice,
  toggleTheme,
  size,
  lightLabel,
  darkLabel,
  systemLabel,
  className,
}: {
  themeChoice: 'light' | 'dark' | 'system'
  resolvedTheme: 'light' | 'dark'
  setThemeChoice: (choice: 'light' | 'dark' | 'system') => void
  toggleTheme: () => void
  size: ThemeToggleSize
  lightLabel?: string
  darkLabel?: string
  systemLabel?: string
  className?: string
}) => {
  const padding = size === 'sm' ? 'px-2 py-1' : size === 'lg' ? 'px-4 py-2' : 'px-3 py-1.5'
  const fontSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'

  const currentIcon =
    themeChoice === 'system' ? (
      <Monitor className="w-4 h-4" />
    ) : resolvedTheme === 'dark' ? (
      <Moon className="w-4 h-4 text-blue-400" />
    ) : (
      <Sun className="w-4 h-4 text-gold-500" />
    )

  const label =
    themeChoice === 'system'
      ? systemLabel || 'Système'
      : themeChoice === 'dark'
        ? darkLabel || 'Sombre'
        : lightLabel || 'Clair'

  return (
    <Dropdown
      trigger={
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl font-medium transition-all duration-300 cursor-pointer',
            'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700',
            padding,
            fontSize,
            'text-neutral-700 dark:text-neutral-300',
            'focus-visible:outline-2 focus-visible:outline-brand-500',
            className
          )}
          aria-label="Choisir le thème"
        >
          {currentIcon}
          <span>{label}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </div>
      }
      align="right"
    >
      <DropdownRadioItem
        value="light"
        checked={themeChoice === 'light'}
        onSelect={() => setThemeChoice('light')}
        icon={<Sun className="w-4 h-4 text-gold-500" />}
      >
        {lightLabel || 'Clair'}
      </DropdownRadioItem>
      <DropdownRadioItem
        value="dark"
        checked={themeChoice === 'dark'}
        onSelect={() => setThemeChoice('dark')}
        icon={<Moon className="w-4 h-4 text-blue-400" />}
      >
        {darkLabel || 'Sombre'}
      </DropdownRadioItem>
      <DropdownSeparator />
      <DropdownRadioItem
        value="system"
        checked={themeChoice === 'system'}
        onSelect={() => setThemeChoice('system')}
        icon={<Monitor className="w-4 h-4 text-neutral-500" />}
      >
        {systemLabel || 'Système'}
      </DropdownRadioItem>
    </Dropdown>
  )
}

// --- Minimal : juste le soleil/lune avec un petit indicateur système ---
const MinimalToggle = ({
  resolvedTheme,
  toggleTheme,
  size,
  className,
}: {
  resolvedTheme: 'light' | 'dark'
  toggleTheme: () => void
  size: ThemeToggleSize
  className?: string
}) => {
  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'relative rounded-full flex items-center justify-center transition-all duration-300 hover:opacity-80',
        sizeMap[size],
        className
      )}
      aria-label="Changer le thème"
    >
      <AnimatedIcon resolvedTheme={resolvedTheme} className="w-full h-full" />
    </button>
  )
}

/* ========================================================================
   Composant principal ThemeToggle (corrigé pour l'hydratation)
   ======================================================================== */
const ThemeToggle = ({
  variant = 'icon',
  size = 'md',
  showLabel = false,
  lightLabel = 'Clair',
  darkLabel = 'Sombre',
  systemLabel = 'Système',
  className,
  tooltipPosition = 'bottom',
  disableTooltip = false,
  onChange,
}: ThemeToggleProps) => {
  const { themeChoice, resolvedTheme, setThemeChoice, toggleTheme, isTransitioning } = useTheme()

  // ✅ Protection hydratation : le vrai thème n'est appliqué qu'après montage
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Thème d'affichage : avant montage, on force 'light' pour un rendu identique serveur/client
  const displayTheme = mounted ? resolvedTheme : 'light'

  // Callback onChange
  useEffect(() => {
    if (mounted) {
      onChange?.(themeChoice)
    }
  }, [themeChoice, mounted, onChange])

  // Tooltip neutre avant montage
  const tooltipContent = useMemo(() => {
    if (!mounted) return 'Changer le thème'
    if (themeChoice === 'system') {
      return `Thème système (${resolvedTheme === 'dark' ? 'sombre' : 'clair'})`
    }
    return resolvedTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'
  }, [resolvedTheme, themeChoice, mounted])

  // Rendu selon la variante (on passe displayTheme au lieu de resolvedTheme)
  const renderToggle = () => {
    switch (variant) {
      case 'icon':
        return (
          <IconToggle
            resolvedTheme={displayTheme}      // ✅ utilisation du thème d'affichage
            toggleTheme={toggleTheme}
            size={size}
            tooltipContent={tooltipContent}
            disableTooltip={disableTooltip}
            className={className}
          />
        )
      case 'switch':
        return (
          <SwitchToggle
            resolvedTheme={displayTheme}
            toggleTheme={toggleTheme}
            size={size}
            lightLabel={showLabel ? lightLabel : undefined}
            darkLabel={showLabel ? darkLabel : undefined}
            className={className}
          />
        )
      case 'button':
        return (
          <ButtonToggle
            resolvedTheme={displayTheme}
            toggleTheme={toggleTheme}
            size={size}
            lightLabel={lightLabel}
            darkLabel={darkLabel}
            className={className}
          />
        )
      case 'dropdown':
        // Le dropdown utilise themeChoice et resolvedTheme réels, mais seulement après montage ?
        // On peut lui passer le vrai resolvedTheme (car il ne cause pas d'hydratation sur le trigger lui-même)
        // Pour éviter toute divergence, on affiche un placeholder neutre avant montage.
        if (!mounted) {
          return (
            <div className={cn('inline-flex items-center gap-2 rounded-xl font-medium', className)}>
              <Sun className="w-4 h-4 text-gold-500" />
              <span>{lightLabel}</span>
              <ChevronDown className="w-3 h-3 opacity-50" />
            </div>
          )
        }
        return (
          <DropdownToggle
            themeChoice={themeChoice}
            resolvedTheme={resolvedTheme}
            setThemeChoice={setThemeChoice}
            toggleTheme={toggleTheme}
            size={size}
            lightLabel={lightLabel}
            darkLabel={darkLabel}
            systemLabel={systemLabel}
            className={className}
          />
        )
      case 'minimal':
        return (
          <MinimalToggle
            resolvedTheme={displayTheme}
            toggleTheme={toggleTheme}
            size={size}
            className={className}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="inline-flex items-center">
      {renderToggle()}
      {isTransitioning && mounted && (
        <span className="ml-2 inline-block w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
      )}
    </div>
  )
}

export { ThemeToggle }