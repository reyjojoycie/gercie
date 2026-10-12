// components/ui/Input.tsx
'use client'

import React, { forwardRef, useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  floatingLabel?: boolean
  error?: string
  success?: string
  helperText?: string
  showCharCount?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  rightIconLabel?: string
  onRightIconClick?: () => void
  wrapperClassName?: string
  variant?: 'outline' | 'filled' | 'glass' | 'premium'
  inputSize?: 'sm' | 'md' | 'lg'
  prefix?: string
  suffix?: string
  hideNumberArrows?: boolean
  allowClear?: boolean
  onClear?: () => void
  loading?: boolean
  loadingText?: string
  shakeOnError?: boolean
  shakeDuration?: number
}

const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const {
    label,
    floatingLabel = false,
    error,
    success,
    helperText,
    showCharCount = false,
    leftIcon,
    rightIcon,
    rightIconLabel,
    onRightIconClick,
    className,
    wrapperClassName,
    id,
    variant = 'outline',
    inputSize = 'md',
    disabled,
    prefix,
    suffix,
    hideNumberArrows = false,
    maxLength,
    allowClear = false,
    onClear,
    loading = false,
    loadingText,
    shakeOnError = false,
    shakeDuration = 500,
    type: initialType = 'text',
    onFocus,
    onBlur,
    onChange,
    'aria-describedby': ariaDescribedByProp,
    'aria-invalid': ariaInvalidProp,
    ...rest
  } = props

  const inputId =
    id || label?.toLowerCase().replace(/\s+/g, '-') || undefined

  const errorId = error && inputId ? `${inputId}-error` : undefined
  const successId = success && inputId ? `${inputId}-success` : undefined
  const helperId =
    helperText && !error && !success && inputId
      ? `${inputId}-helper`
      : undefined

  const ariaDescribedBy =
    ariaDescribedByProp ||
    [errorId, successId, helperId].filter(Boolean).join(' ') ||
    undefined

  const ariaInvalid = error ? true : ariaInvalidProp

  const [focused, setFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [internalValue, setInternalValue] = useState<string>(() => {
    if (typeof rest.value === 'string') return rest.value
    if (typeof rest.defaultValue === 'string') return rest.defaultValue
    return ''
  })

  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node

      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref]
  )

  const isPassword = initialType === 'password'
  const currentType = isPassword && showPassword ? 'text' : initialType

  const currentValue =
    typeof rest.value === 'string'
      ? rest.value
      : typeof rest.value === 'number'
        ? String(rest.value)
        : internalValue

  const charCount = currentValue.length
  const hasValue = currentValue.length > 0
  const isLabelFloating = floatingLabel && label && (focused || hasValue)

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInternalValue(event.target.value)
      onChange?.(event)
    },
    [onChange]
  )

  const handleClear = useCallback(() => {
    if (disabled || loading) return

    if (onClear) {
      onClear()
    } else if (inputRef.current) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set

      nativeInputValueSetter?.call(inputRef.current, '')

      const event = new Event('input', { bubbles: true })
      inputRef.current.dispatchEvent(event)
      inputRef.current.focus()
    }

    setInternalValue('')
  }, [onClear, disabled, loading])

  const handleTogglePassword = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      setShowPassword((prev) => !prev)

      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
    },
    []
  )

  const renderRightIcon = () => {
    if (loading) {
      return (
        <Loader2
          size={16}
          className="animate-spin text-brand-500"
          aria-hidden="true"
        />
      )
    }

    if (isPassword) {
      return (
        <button
          type="button"
          onClick={handleTogglePassword}
          onMouseDown={(event) => event.preventDefault()}
          disabled={disabled}
          aria-label={
            showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
          }
          aria-pressed={showPassword}
          className="rounded p-1 text-neutral-400 transition-colors hover:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {showPassword ? (
            <EyeOff size={16} aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
        </button>
      )
    }

    if (error && !success) {
      return (
        <AlertCircle
          size={16}
          className="text-red-500"
          aria-hidden="true"
        />
      )
    }

    if (success && !error) {
      return (
        <CheckCircle
          size={16}
          className="text-accent-500"
          aria-hidden="true"
        />
      )
    }

    if (allowClear && hasValue && !disabled) {
      return (
        <button
          type="button"
          onClick={handleClear}
          onMouseDown={(event) => event.preventDefault()}
          disabled={disabled}
          aria-label="Effacer le champ"
          className="rounded p-1 text-neutral-400 transition-colors hover:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )
    }

    if (rightIcon) {
      if (onRightIconClick) {
        return (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onRightIconClick()
            }}
            onMouseDown={(event) => event.preventDefault()}
            disabled={disabled}
            aria-label={rightIconLabel || 'Action du champ'}
            className="rounded p-1 text-neutral-400 transition-colors hover:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            {rightIcon}
          </button>
        )
      }

      return (
        <span
          className="text-neutral-400 dark:text-neutral-500"
          aria-hidden="true"
        >
          {rightIcon}
        </span>
      )
    }

    return null
  }

  const rightIconContent = renderRightIcon()

  const baseStyles =
    'block w-full rounded-xl border bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-300 ease-out dark:bg-midnight-800 dark:text-neutral-100 dark:placeholder:text-neutral-500'

  const variantStyles: Record<string, string> = {
    outline:
      'border-neutral-300 focus:border-brand-500 focus:ring-brand-500/30 hover:border-neutral-400 dark:border-neutral-600 dark:hover:border-neutral-500',
    filled:
      'border-transparent bg-neutral-100 focus:bg-white focus:border-brand-500 focus:ring-brand-500/30 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:focus:bg-midnight-900',
    glass:
      'border-white/20 bg-white/5 text-white placeholder:text-white/50 shadow-soft backdrop-blur-md focus:border-white/40 focus:bg-white/10 focus:ring-brand-500/30 dark:border-midnight-500/30 dark:text-neutral-100',
    premium:
      'border-2 border-neutral-200 bg-white shadow-soft hover:shadow-medium focus:border-transparent focus:ring-2 focus:ring-brand-500/50 dark:border-neutral-700 dark:bg-midnight-800',
  }

  const errorStyles = error
    ? '!border-red-500 focus:!ring-red-500/30 dark:!border-red-400'
    : ''

  const successStyles = success
    ? '!border-accent-500 focus:!ring-accent-500/30 dark:!border-accent-400'
    : ''

  const sizeStyles: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
  }

  const iconPaddingLeft = leftIcon ? 'pl-10' : ''
  const iconPaddingRight = rightIconContent ? 'pr-10' : ''

  const hasFooter = Boolean(
    error ||
      success ||
      (loading && loadingText) ||
      (helperText && !error && !success && !loading) ||
      (showCharCount && maxLength)
  )

  return (
    <div
      className={cn(
        'w-full',
        shakeOnError && error ? 'animate-input-shake' : '',
        wrapperClassName
      )}
    >
      {floatingLabel && label ? (
        <div className="relative">
          <input
            ref={setRefs}
            id={inputId}
            disabled={disabled}
            maxLength={maxLength}
            placeholder=" "
            className={cn(
              baseStyles,
              variantStyles[variant],
              sizeStyles[inputSize],
              iconPaddingLeft,
              iconPaddingRight,
              errorStyles,
              successStyles,
              prefix && 'pl-10',
              suffix && 'pr-10',
              hideNumberArrows &&
                '[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
              'pb-1 pt-5',
              className
            )}
            onFocus={(event) => {
              setFocused(true)
              onFocus?.(event)
            }}
            onBlur={(event) => {
              setFocused(false)
              onBlur?.(event)
            }}
            {...rest}
            onChange={handleChange}
            type={currentType}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
          />

          <label
            htmlFor={inputId}
            className={cn(
              'pointer-events-none absolute left-3 transition-all duration-200',
              isLabelFloating
                ? '-top-0.5 rounded bg-white px-1 text-xs text-brand-600 dark:bg-midnight-800 dark:text-brand-400'
                : 'top-1/2 -translate-y-1/2 text-sm text-neutral-400 dark:text-neutral-500',
              leftIcon ? 'left-10' : 'left-3'
            )}
          >
            {label}
          </label>

          {leftIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400 dark:text-neutral-500">
              {leftIcon}
            </div>
          )}

          {prefix && (
            <div className="absolute inset-y-0 left-3.5 flex items-center text-sm text-neutral-400 dark:text-neutral-500">
              <span>{prefix}</span>
            </div>
          )}

          {suffix && (
            <div className="absolute inset-y-0 right-12 flex items-center text-sm text-neutral-400 dark:text-neutral-500">
              <span>{suffix}</span>
            </div>
          )}

          {rightIconContent && (
            <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3.5">
              {rightIconContent}
            </div>
          )}
        </div>
      ) : (
        <>
          {label && (
            <label
              htmlFor={inputId}
              className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              {label}
            </label>
          )}

          <div className="relative">
            {leftIcon && (
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400 dark:text-neutral-500">
                {leftIcon}
              </div>
            )}

            {prefix && (
              <div className="absolute inset-y-0 left-3.5 flex items-center text-sm text-neutral-400 dark:text-neutral-500">
                <span>{prefix}</span>
              </div>
            )}

            <input
              ref={setRefs}
              id={inputId}
              disabled={disabled}
              maxLength={maxLength}
              className={cn(
                baseStyles,
                variantStyles[variant],
                sizeStyles[inputSize],
                iconPaddingLeft,
                iconPaddingRight,
                errorStyles,
                successStyles,
                prefix && 'pl-10',
                suffix && 'pr-10',
                hideNumberArrows &&
                  '[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                className
              )}
              onFocus={(event) => {
                setFocused(true)
                onFocus?.(event)
              }}
              onBlur={(event) => {
                setFocused(false)
                onBlur?.(event)
              }}
              {...rest}
              onChange={handleChange}
              type={currentType}
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid}
            />

            {suffix && (
              <div className="absolute inset-y-0 right-3.5 flex items-center text-sm text-neutral-400 dark:text-neutral-500">
                <span>{suffix}</span>
              </div>
            )}

            {rightIconContent && (
              <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-3.5">
                {rightIconContent}
              </div>
            )}
          </div>
        </>
      )}

      {hasFooter && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex-1 space-y-1">
            {error && (
              <p
                id={errorId}
                role="alert"
                className="flex items-center gap-1 text-sm text-red-500 dark:text-red-400"
              >
                <AlertCircle size={14} aria-hidden="true" />
                {error}
              </p>
            )}

            {success && (
              <p
                id={successId}
                className="flex items-center gap-1 text-sm text-accent-600 dark:text-accent-400"
              >
                <CheckCircle size={14} aria-hidden="true" />
                {success}
              </p>
            )}

            {loading && loadingText && (
              <p className="flex items-center gap-1 text-sm text-neutral-400 dark:text-neutral-500">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {loadingText}
              </p>
            )}

            {helperText && !error && !success && !loading && (
              <p
                id={helperId}
                className="text-sm text-neutral-400 dark:text-neutral-500"
              >
                {helperText}
              </p>
            )}
          </div>

          {showCharCount && maxLength && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-300"
                  style={{ width: `${(charCount / maxLength) * 100}%` }}
                />
              </div>

              <p className="text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
                {charCount}/{maxLength}
              </p>
            </div>
          )}
        </div>
      )}

      {shakeOnError && error && (
        <style jsx>{`
          @keyframes input-shake {
            0%,
            100% {
              transform: translateX(0);
            }
            10%,
            30%,
            50%,
            70%,
            90% {
              transform: translateX(-4px);
            }
            20%,
            40%,
            60%,
            80% {
              transform: translateX(4px);
            }
          }

          .animate-input-shake {
            animation: input-shake ${shakeDuration}ms ease-in-out;
          }

          @media (prefers-reduced-motion: reduce) {
            .animate-input-shake {
              animation: none;
            }
          }
        `}</style>
      )}
    </div>
  )
})

Input.displayName = 'Input'

export { Input }