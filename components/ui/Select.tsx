// components/ui/Select.tsx
'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ChevronDown, X } from 'lucide-react'

export interface SelectOption {
  value: string | number
  label: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
}

interface SelectProps {
  options: SelectOption[]
  value?: string | number | (string | number)[]
  onChange?: (value: string | number | (string | number)[]) => void
  placeholder?: string
  multiple?: boolean
  searchable?: boolean
  clearable?: boolean
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outlined' | 'filled' | 'glass'
  maxHeight?: number
  className?: string
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      options,
      value,
      onChange,
      placeholder = 'Sélectionner...',
      multiple = false,
      searchable = true,
      clearable = true,
      disabled = false,
      size = 'md',
      variant = 'default',
      maxHeight = 300,
      className,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const containerRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Validation et normalisation de la valeur
    const normalizedValue = Array.isArray(value)
      ? value
      : value !== undefined && value !== null
        ? [value]
        : []

    const selectedOptions = options.filter((opt) => normalizedValue.includes(opt.value))
    const filteredOptions = searchQuery
      ? options.filter(
          (opt) =>
            opt.label.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !opt.disabled
        )
      : options.filter((opt) => !opt.disabled)

    const handleSelect = useCallback(
      (optionValue: string | number) => {
        if (multiple) {
          const newValue = normalizedValue.includes(optionValue)
            ? normalizedValue.filter((v) => v !== optionValue)
            : [...normalizedValue, optionValue]
          onChange?.(newValue)
        } else {
          onChange?.(optionValue)
          setIsOpen(false)
          setSearchQuery('')
        }
      },
      [multiple, normalizedValue, onChange]
    )

    const handleClear = useCallback((e: React.MouseEvent) => {
      e.stopPropagation()
      onChange?.(multiple ? [] : '')
      setSearchQuery('')
    }, [multiple, onChange])

    // Gestion du clic extérieur
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false)
          setSearchQuery('')
        }
      }

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [isOpen])

    // Focus sur l'input search quand le select s'ouvre
    useEffect(() => {
      if (isOpen && searchable && searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }
    }, [isOpen, searchable])

    const sizeClasses = {
      sm: 'px-2.5 py-1.5 text-sm h-9',
      md: 'px-3 py-2 text-sm h-10',
      lg: 'px-4 py-2.5 text-base h-11',
    }

    const variantClasses = {
      default:
        'bg-white dark:bg-midnight-800 border border-neutral-300 dark:border-neutral-600 focus:ring-2 focus:ring-brand-500/50',
      outlined:
        'bg-transparent border-2 border-neutral-300 dark:border-neutral-600 focus:ring-2 focus:ring-brand-500/50',
      filled:
        'bg-neutral-100 dark:bg-midnight-700 border border-transparent focus:border-brand-500 focus:ring-2 focus:ring-brand-500/50',
      glass:
        'bg-white/10 dark:bg-midnight-800/30 backdrop-blur-xl border border-white/20 dark:border-midnight-500/30 focus:ring-2 focus:ring-brand-500/50',
    }

    return (
      <div
        ref={ref}
        className={cn('relative w-full', className)}
      >
        <div
          ref={containerRef}
          className="relative"
        >
          {/* Trigger Button */}
          <button
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className={cn(
              'w-full flex items-center justify-between gap-2 rounded-xl font-medium',
              'transition-all duration-200 ease-out',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              sizeClasses[size],
              variantClasses[variant],
              isOpen && 'ring-2 ring-brand-500/50 dark:ring-brand-400/50',
              disabled && 'cursor-not-allowed'
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {selectedOptions.length === 0 ? (
                <span className="text-neutral-500 dark:text-neutral-400">{placeholder}</span>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedOptions.slice(0, multiple ? undefined : 1).map((opt) => (
                    <div
                      key={opt.value}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full text-xs font-medium"
                    >
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <span className="truncate">{opt.label}</span>
                    </div>
                  ))}
                  {multiple && selectedOptions.length > 1 && (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      +{selectedOptions.length - 1}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {clearable && selectedOptions.length > 0 && (
                <button
                  onClick={handleClear}
                  className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  aria-label="Effacer la sélection"
                >
                  <X size={16} />
                </button>
              )}
              <ChevronDown
                size={18}
                className={cn('transition-transform duration-200', isOpen && 'rotate-180')}
              />
            </div>
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 right-0 z-50 mt-2 bg-white dark:bg-midnight-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg"
              >
                {/* Search Input */}
                {searchable && (
                  <div className="p-2 border-b border-neutral-200 dark:border-neutral-700">
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Rechercher..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-neutral-50 dark:bg-midnight-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    />
                  </div>
                )}

                {/* Options List */}
                <div
                  className="overflow-y-auto"
                  style={{ maxHeight: `${maxHeight}px` }}
                >
                  {filteredOptions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                      Aucune option trouvée
                    </div>
                  ) : (
                    filteredOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleSelect(option.value)}
                        className={cn(
                          'w-full px-3 py-2.5 text-left flex items-start gap-2 transition-colors duration-150',
                          'hover:bg-neutral-100 dark:hover:bg-midnight-700',
                          normalizedValue.includes(option.value) &&
                            'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                        )}
                      >
                        {option.icon && <span className="mt-0.5 shrink-0">{option.icon}</span>}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{option.label}</div>
                          {option.description && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                              {option.description}
                            </div>
                          )}
                        </div>
                        {multiple && (
                          <input
                            type="checkbox"
                            checked={normalizedValue.includes(option.value)}
                            onChange={() => {}}
                            className="mt-0.5"
                          />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    )
  }
)

Select.displayName = 'Select'
