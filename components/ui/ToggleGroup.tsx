// components/ui/ToggleGroup.tsx
'use client'

import React, { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface ToggleOption {
  value: string | number
  label: string
  icon?: React.ReactNode
  description?: string
  disabled?: boolean
}

interface ToggleGroupProps {
  options: ToggleOption[]
  value?: string | number | (string | number)[]
  onChange?: (value: string | number | (string | number)[]) => void
  multiple?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'pill' | 'box' | 'underline'
  fullWidth?: boolean
  className?: string
}

export const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  (
    {
      options,
      value,
      onChange,
      multiple = false,
      size = 'md',
      variant = 'pill',
      fullWidth = false,
      className,
    },
    ref
  ) => {
    const normalizedValue = Array.isArray(value)
      ? value
      : value !== undefined && value !== null
        ? [value]
        : []

    const handleToggle = useCallback(
      (optionValue: string | number) => {
        if (multiple) {
          const newValue = normalizedValue.includes(optionValue)
            ? normalizedValue.filter((v) => v !== optionValue)
            : [...normalizedValue, optionValue]
          onChange?.(newValue)
        } else {
          onChange?.(normalizedValue.includes(optionValue) ? '' : optionValue)
        }
      },
      [multiple, normalizedValue, onChange]
    )

    const sizeClasses = {
      sm: 'px-2.5 py-1.5 text-xs',
      md: 'px-3 py-2 text-sm',
      lg: 'px-4 py-2.5 text-base',
    }

    const variantClasses = {
      pill: 'rounded-full',
      box: 'rounded-lg',
      underline: 'rounded-none border-b-2',
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-2 flex-wrap',
          fullWidth && 'w-full',
          className
        )}
      >
        {options.map((option) => {
          const isSelected = normalizedValue.includes(option.value)

          return (
            <button
              key={option.value}
              onClick={() => !option.disabled && handleToggle(option.value)}
              disabled={option.disabled}
              title={option.description || option.label}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 font-medium',
                'transition-all duration-200 ease-out',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-midnight-950',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                sizeClasses[size],
                variantClasses[variant],
                {
                  // Pill variant
                  'pill': [
                    isSelected
                      ? 'bg-gradient-brand text-white shadow-sm'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700',
                  ],
                  // Box variant
                  'box': [
                    isSelected
                      ? 'bg-brand-600 text-white shadow-md'
                      : 'bg-white dark:bg-midnight-800 border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:border-brand-400 dark:hover:border-brand-500',
                  ],
                  // Underline variant
                  'underline': [
                    isSelected
                      ? 'border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600',
                  ],
                }[variant] || ''
              )}
            >
              <motion.div
                className="flex items-center gap-1.5"
                layout
                transition={{ duration: 0.2 }}
              >
                {option.icon && (
                  <span className="inline-flex items-center justify-center">{option.icon}</span>
                )}
                <span>{option.label}</span>

                {/* Checkbox pour le multi-select */}
                {multiple && (
                  <motion.div
                    className={cn(
                      'w-4 h-4 rounded border-2 flex items-center justify-center',
                      isSelected
                        ? 'bg-white/20 border-white/50'
                        : 'border-currentColor/30'
                    )}
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.15 }}
                  >
                    {isSelected && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </motion.div>
                )}
              </motion.div>
            </button>
          )
        })}
      </div>
    )
  }
)

ToggleGroup.displayName = 'ToggleGroup'
