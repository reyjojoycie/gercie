// components/ui/SettingsPanel.tsx
'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ChevronDown, Settings } from 'lucide-react'

export interface SettingItem {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  type: 'toggle' | 'slider' | 'select' | 'color' | 'custom'
  value?: any
  onChange?: (value: any) => void
  options?: Array<{ label: string; value: any }>
  min?: number
  max?: number
  step?: number
  children?: React.ReactNode
  disabled?: boolean
}

interface SettingsSectionProps {
  title: string
  icon?: React.ReactNode
  settings: SettingItem[]
  collapsible?: boolean
  defaultOpen?: boolean
}

interface SettingsPanelProps {
  sections: SettingsSectionProps[]
  className?: string
}

const SettingRow: React.FC<{ setting: SettingItem; variant?: 'compact' | 'spacious' }> = ({
  setting,
  variant = 'spacious',
}) => {
  const renderControl = () => {
    switch (setting.type) {
      case 'toggle':
        return (
          <button
            onClick={() => setting.onChange?.(!setting.value)}
            disabled={setting.disabled}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              setting.value
                ? 'bg-gradient-brand'
                : 'bg-neutral-300 dark:bg-neutral-600',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                setting.value ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        )

      case 'slider':
        return (
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="range"
              min={setting.min}
              max={setting.max}
              step={setting.step || 1}
              value={setting.value || 0}
              onChange={(e) => setting.onChange?.(parseFloat(e.target.value))}
              disabled={setting.disabled}
              className={cn(
                'flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 w-8 text-right">
              {Math.round((setting.value || 0) * 10) / 10}
            </span>
          </div>
        )

      case 'select':
        return (
          <select
            value={setting.value || ''}
            onChange={(e) => setting.onChange?.(e.target.value)}
            disabled={setting.disabled}
            className={cn(
              'px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600',
              'bg-white dark:bg-midnight-800 text-neutral-900 dark:text-neutral-100',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/50'
            )}
          >
            {setting.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )

      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={setting.value || '#000000'}
              onChange={(e) => setting.onChange?.(e.target.value)}
              disabled={setting.disabled}
              className="w-10 h-10 rounded-lg cursor-pointer border border-neutral-300 dark:border-neutral-600"
            />
            <span className="text-sm font-mono text-neutral-600 dark:text-neutral-400">
              {setting.value || '#000000'}
            </span>
          </div>
        )

      case 'custom':
        return setting.children

      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between',
        variant === 'spacious' ? 'py-4' : 'py-2',
        'border-b border-neutral-200 dark:border-neutral-700 last:border-b-0'
      )}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {setting.icon && (
          <div className="mt-1 text-neutral-600 dark:text-neutral-400 flex-shrink-0">
            {setting.icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {setting.label}
          </label>
          {setting.description && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {setting.description}
            </p>
          )}
        </div>
      </div>

      <div className="ml-4 flex-shrink-0">{renderControl()}</div>
    </div>
  )
}

const SettingsSection: React.FC<
  SettingsSectionProps & { variant?: 'compact' | 'spacious' }
> = ({ title, icon, settings, collapsible = true, defaultOpen = true, variant = 'spacious' }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
      <button
        onClick={() => collapsible && setIsOpen(!isOpen)}
        disabled={!collapsible}
        className={cn(
          'w-full px-4 py-3 flex items-center justify-between',
          'bg-neutral-50 dark:bg-midnight-800 hover:bg-neutral-100 dark:hover:bg-midnight-700',
          'disabled:cursor-default transition-colors',
          'border-b border-neutral-200 dark:border-neutral-700 last:border-b-0'
        )}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-neutral-600 dark:text-neutral-400">{icon}</span>}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">{title}</span>
        </div>
        {collapsible && (
          <ChevronDown
            size={18}
            className={cn('transition-transform duration-300', isOpen && 'rotate-180')}
          />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="divide-y divide-neutral-200 dark:divide-neutral-700"
          >
            {settings.map((setting) => (
              <SettingRow key={setting.id} setting={setting} variant={variant} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  sections,
  className,
}) => {
  return (
    <div className={cn('space-y-4 p-4', className)}>
      {sections.map((section) => (
        <SettingsSection key={section.title} {...section} />
      ))}
    </div>
  )
}

// Export pour utilisation directe
export { SettingRow, SettingsSection }
