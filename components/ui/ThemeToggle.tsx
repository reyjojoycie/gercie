// components/ui/ThemeToggle.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { cn } from '@/lib/utils'
import { useTheme } from '@/contexts/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'

import {
  Sun,
  Moon,
  Monitor,
  ChevronDown,
} from 'lucide-react'

import { Tooltip } from './Tooltip'
import {
  Dropdown,
  DropdownRadioItem,
  DropdownSeparator,
} from './Dropdown'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type ThemeChoice = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

type ThemeToggleVariant =
  | 'icon'
  | 'switch'
  | 'dropdown'
  | 'button'
  | 'minimal'
  | 'segment'
  | 'cycle'

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
  onChange?: (theme: ThemeChoice) => void
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SIZE MAPS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const sizeMap: Record<ThemeToggleSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const iconSizeMap: Record<ThemeToggleSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

const buttonPaddingMap: Record<ThemeToggleSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

const segmentItemSizeMap: Record<ThemeToggleSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
}

const switchDimensions: Record<
  ThemeToggleSize,
  {
    track: string
    thumb: string
    travel: number
    icon: string
  }
> = {
  sm: {
    track: 'h-5 w-10',
    thumb: 'h-4 w-4',
    travel: 20,
    icon: 'h-2.5 w-2.5',
  },
  md: {
    track: 'h-6 w-12',
    thumb: 'h-5 w-5',
    travel: 24,
    icon: 'h-3 w-3',
  },
  lg: {
    track: 'h-7 w-14',
    thumb: 'h-6 w-6',
    travel: 28,
    icon: 'h-3.5 w-3.5',
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BASE STYLES                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const controlBase =
  'relative inline-flex items-center justify-center border border-line bg-surface text-fg shadow-card transition-all duration-200 ease-out hover:bg-raised hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60'

const minimalBase =
  'relative inline-flex items-center justify-center rounded-full text-fg transition-colors duration-200 ease-out hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60'

/* ═══════════════════════════════════════════════════════════════ */
/*  ANIMATED ICON                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface AnimatedIconProps {
  mode: ThemeChoice
  className?: string
}

const AnimatedIcon = ({ mode, className }: AnimatedIconProps) => {
  const visualMode = mode === 'system' ? 'auto' : mode

  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        className
      )}
    >
      <AnimatePresence mode="wait">
        {visualMode === 'auto' ? (
          <motion.div
            key="auto"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="h-full w-full"
          >
            <Monitor className="h-full w-full text-fg-muted" />
          </motion.div>
        ) : visualMode === 'light' ? (
          <motion.div
            key="light"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="h-full w-full"
          >
            <Sun className="h-full w-full text-accent" />
          </motion.div>
        ) : (
          <motion.div
            key="dark"
            initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="h-full w-full"
          >
            <Moon className="h-full w-full text-accent" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ICON TOGGLE                                                    */
/* ═══════════════════════════════════════════════════════════════ */

interface IconToggleProps {
  mode: ThemeChoice
  size: ThemeToggleSize
  className?: string
  onClick: () => void
  disabled?: boolean
}

const IconToggle = ({
  mode,
  size,
  className,
  onClick,
  disabled,
}: IconToggleProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        controlBase,
        'rounded-control',
        sizeMap[size],
        className
      )}
    >
      <AnimatedIcon
        mode={mode}
        className={iconSizeMap[size]}
      />
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MINIMAL TOGGLE                                                 */
/* ═══════════════════════════════════════════════════════════════ */

interface MinimalToggleProps {
  mode: ThemeChoice
  size: ThemeToggleSize
  className?: string
  onClick: () => void
  disabled?: boolean
}

const MinimalToggle = ({
  mode,
  size,
  className,
  onClick,
  disabled,
}: MinimalToggleProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        minimalBase,
        sizeMap[size],
        className
      )}
    >
      <AnimatedIcon
        mode={mode}
        className={iconSizeMap[size]}
      />
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SWITCH TOGGLE                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface SwitchToggleProps {
  resolvedTheme: ResolvedTheme
  themeChoice: ThemeChoice
  size: ThemeToggleSize
  showLabel: boolean
  lightLabel: string
  darkLabel: string
  className?: string
  onClick: () => void
  disabled?: boolean
}

const SwitchToggle = ({
  resolvedTheme,
  themeChoice,
  size,
  showLabel,
  lightLabel,
  darkLabel,
  className,
  onClick,
  disabled,
}: SwitchToggleProps) => {
  const dims = switchDimensions[size]
  const isDark = resolvedTheme === 'dark'
  const isAuto = themeChoice === 'system'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={isDark}
      className={cn(
        'relative inline-flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
    >
      <span
        className={cn(
          'relative rounded-full border transition-colors duration-300',
          dims.track,
          isDark
            ? 'border-accent bg-accent-soft'
            : 'border-line bg-muted'
        )}
      >
        <motion.span
          className={cn(
            'absolute left-0.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-surface shadow-card',
            dims.thumb
          )}
          initial={false}
          animate={{
            x: isDark ? dims.travel : 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 600,
            damping: 32,
          }}
        >
          {isDark ? (
            <Moon className={cn(dims.icon, 'text-accent')} />
          ) : (
            <Sun className={cn(dims.icon, 'text-accent')} />
          )}
        </motion.span>

        {isAuto && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent"
            aria-hidden="true"
          />
        )}
      </span>

      {showLabel && (
        <span className="text-sm font-medium text-fg-muted">
          {isDark ? darkLabel : lightLabel}
        </span>
      )}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BUTTON TOGGLE                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface ButtonToggleProps {
  mode: ThemeChoice
  label: string
  size: ThemeToggleSize
  className?: string
  onClick: () => void
  disabled?: boolean
}

const ButtonToggle = ({
  mode,
  label,
  size,
  className,
  onClick,
  disabled,
}: ButtonToggleProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        controlBase,
        'rounded-pill gap-2 font-medium',
        buttonPaddingMap[size],
        className
      )}
    >
      <AnimatedIcon
        mode={mode}
        className="h-4 w-4"
      />
      <span>{label}</span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DROPDOWN TOGGLE                                                */
/* ═══════════════════════════════════════════════════════════════ */

interface DropdownToggleProps {
  themeChoice: ThemeChoice
  resolvedTheme: ResolvedTheme
  size: ThemeToggleSize
  lightLabel: string
  darkLabel: string
  systemLabel: string
  className?: string
  onSelect: (choice: ThemeChoice) => void
  disabled?: boolean
}

const DropdownToggle = ({
  themeChoice,
  resolvedTheme,
  size,
  lightLabel,
  darkLabel,
  systemLabel,
  className,
  onSelect,
  disabled,
}: DropdownToggleProps) => {
  const currentIcon =
    themeChoice === 'system' ? (
      <Monitor className="h-4 w-4 text-fg-muted" />
    ) : resolvedTheme === 'dark' ? (
      <Moon className="h-4 w-4 text-accent" />
    ) : (
      <Sun className="h-4 w-4 text-accent" />
    )

  const label =
    themeChoice === 'system'
      ? systemLabel
      : themeChoice === 'dark'
        ? darkLabel
        : lightLabel

  return (
    <Dropdown
      trigger={
        <button
          type="button"
          disabled={disabled}
          className={cn(
            controlBase,
            'rounded-pill gap-2 font-medium',
            buttonPaddingMap[size],
            className
          )}
          aria-label="Choisir le mode d'affichage"
        >
          {currentIcon}
          <span>{label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      }
      align="right"
    >
      <DropdownRadioItem
        value="light"
        checked={themeChoice === 'light'}
        onSelect={() => onSelect('light')}
        icon={<Sun className="h-4 w-4 text-accent" />}
      >
        {lightLabel}
      </DropdownRadioItem>

      <DropdownRadioItem
        value="dark"
        checked={themeChoice === 'dark'}
        onSelect={() => onSelect('dark')}
        icon={<Moon className="h-4 w-4 text-accent" />}
      >
        {darkLabel}
      </DropdownRadioItem>

      <DropdownSeparator />

      <DropdownRadioItem
        value="system"
        checked={themeChoice === 'system'}
        onSelect={() => onSelect('system')}
        icon={<Monitor className="h-4 w-4 text-fg-muted" />}
      >
        {systemLabel}
      </DropdownRadioItem>
    </Dropdown>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SEGMENT TOGGLE                                                 */
/* ═══════════════════════════════════════════════════════════════ */

interface SegmentToggleProps {
  themeChoice: ThemeChoice
  size: ThemeToggleSize
  showLabel: boolean
  lightLabel: string
  darkLabel: string
  systemLabel: string
  className?: string
  onSelect: (choice: ThemeChoice) => void
  disabled?: boolean
}

const SegmentToggle = ({
  themeChoice,
  size,
  showLabel,
  lightLabel,
  darkLabel,
  systemLabel,
  className,
  onSelect,
  disabled,
}: SegmentToggleProps) => {
  const options: Array<{
    value: ThemeChoice
    label: string
    icon: typeof Sun | typeof Moon | typeof Monitor
  }> = [
    {
      value: 'light',
      label: lightLabel,
      icon: Sun,
    },
    {
      value: 'dark',
      label: darkLabel,
      icon: Moon,
    },
    {
      value: 'system',
      label: systemLabel,
      icon: Monitor,
    },
  ]

  return (
    <div
      role="group"
      aria-label="Mode d'affichage"
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border border-line bg-muted p-1 shadow-card',
        className
      )}
    >
      {options.map((option) => {
        const isActive = themeChoice === option.value
        const Icon = option.icon

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-pill font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60',
              segmentItemSizeMap[size],
              isActive
                ? 'bg-surface text-accent shadow-card'
                : 'text-fg-muted hover:bg-raised hover:text-fg'
            )}
          >
            <Icon
              className={cn(
                size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
              )}
            />

            {showLabel ? (
              <span
                className={cn(
                  size === 'sm' && 'hidden sm:inline'
                )}
              >
                {option.label}
              </span>
            ) : (
              <span className="sr-only">
                {option.label}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

const ThemeToggle = ({
  variant = 'icon',
  size = 'md',
  showLabel = false,
  lightLabel = 'Clair',
  darkLabel = 'Sombre',
  systemLabel = 'Auto',
  className,
  tooltipPosition,
  disableTooltip = false,
  onChange,
}: ThemeToggleProps) => {
  // Keep prop for API compatibility.
  void tooltipPosition

  const {
    themeChoice,
    resolvedTheme,
    setThemeChoice,
    toggleTheme,
    cycleTheme,
  } = useTheme()

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      onChange?.(themeChoice)
    }
  }, [mounted, onChange, themeChoice])

  const displayThemeChoice: ThemeChoice = mounted
    ? themeChoice
    : 'light'

  const displayResolvedTheme: ResolvedTheme = mounted
    ? resolvedTheme
    : 'light'

  const currentLabel = useMemo(() => {
    if (!mounted) return lightLabel

    if (themeChoice === 'system') return systemLabel
    if (themeChoice === 'dark') return darkLabel
    return lightLabel
  }, [
    darkLabel,
    lightLabel,
    mounted,
    systemLabel,
    themeChoice,
  ])

  const tooltipContent = useMemo(() => {
    if (!mounted) return 'Chargement du thème'

    if (variant === 'switch') {
      return resolvedTheme === 'dark'
        ? 'Passer en mode clair'
        : 'Passer en mode sombre'
    }

    if (themeChoice === 'system') {
      return `Mode automatique (actuel : ${
        resolvedTheme === 'dark' ? 'sombre' : 'clair'
      }) — cliquer pour forcer le mode clair`
    }

    if (themeChoice === 'light') {
      return 'Mode clair — cliquer pour passer en mode sombre'
    }

    return 'Mode sombre — cliquer pour revenir au mode automatique'
  }, [
    mounted,
    resolvedTheme,
    themeChoice,
    variant,
  ])

  const handleCycle = useCallback(() => {
    if (!mounted) return

    if (typeof cycleTheme === 'function') {
      cycleTheme()
      return
    }

    // Fallback si un ancien contexte ne fournit pas cycleTheme.
    const order: ThemeChoice[] = ['system', 'light', 'dark']
    const currentIndex = order.indexOf(themeChoice)
    const nextIndex = (currentIndex + 1) % order.length
    setThemeChoice(order[nextIndex])
  }, [
    cycleTheme,
    mounted,
    setThemeChoice,
    themeChoice,
  ])

  const handleToggle = useCallback(() => {
    if (!mounted) return
    toggleTheme()
  }, [mounted, toggleTheme])

  const handleSelect = useCallback(
    (choice: ThemeChoice) => {
      if (!mounted) return
      setThemeChoice(choice)
    },
    [mounted, setThemeChoice]
  )

  const renderToggle = () => {
    switch (variant) {
      case 'icon':
      case 'cycle':
        return (
          <IconToggle
            mode={displayThemeChoice}
            size={size}
            className={className}
            onClick={handleCycle}
            disabled={!mounted}
          />
        )

      case 'minimal':
        return (
          <MinimalToggle
            mode={displayThemeChoice}
            size={size}
            className={className}
            onClick={handleCycle}
            disabled={!mounted}
          />
        )

      case 'switch':
        return (
          <SwitchToggle
            resolvedTheme={displayResolvedTheme}
            themeChoice={displayThemeChoice}
            size={size}
            showLabel={showLabel}
            lightLabel={lightLabel}
            darkLabel={darkLabel}
            className={className}
            onClick={handleToggle}
            disabled={!mounted}
          />
        )

      case 'button':
        return (
          <ButtonToggle
            mode={displayThemeChoice}
            label={currentLabel}
            size={size}
            className={className}
            onClick={handleCycle}
            disabled={!mounted}
          />
        )

      case 'dropdown':
        return (
          <DropdownToggle
            themeChoice={displayThemeChoice}
            resolvedTheme={displayResolvedTheme}
            size={size}
            lightLabel={lightLabel}
            darkLabel={darkLabel}
            systemLabel={systemLabel}
            className={className}
            onSelect={handleSelect}
            disabled={!mounted}
          />
        )

      case 'segment':
        return (
          <SegmentToggle
            themeChoice={displayThemeChoice}
            size={size}
            showLabel={showLabel}
            lightLabel={lightLabel}
            darkLabel={darkLabel}
            systemLabel={systemLabel}
            className={className}
            onSelect={handleSelect}
            disabled={!mounted}
          />
        )

      default:
        return null
    }
  }

  const node = renderToggle()

  const shouldWrapWithTooltip =
    variant === 'icon' ||
    variant === 'cycle' ||
    variant === 'switch' ||
    variant === 'button' ||
    variant === 'minimal'

  if (shouldWrapWithTooltip && !disableTooltip) {
    return <Tooltip content={tooltipContent}>{node}</Tooltip>
  }

  return node
}

export { ThemeToggle }
export default ThemeToggle