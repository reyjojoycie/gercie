// components/ui/Input.tsx
'use client'

import React, {
  forwardRef,
  useState,
  useCallback,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'

import {
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Label affiché au-dessus ou en floating */
  label?: string
  /** Active le mode floating label (Material-style) */
  floatingLabel?: boolean
  /** Message d'erreur */
  error?: string
  /** Message de succès */
  success?: string
  /** Texte d'aide contextuel */
  helperText?: string
  /** Affiche le compteur de caractères */
  showCharCount?: boolean
  /** Icône à gauche */
  leftIcon?: ReactNode
  /** Icône à droite */
  rightIcon?: ReactNode
  /** Label accessible pour l'icône droite */
  rightIconLabel?: string
  /** Callback au clic sur l'icône droite */
  onRightIconClick?: () => void
  /** Classe sur le wrapper externe */
  wrapperClassName?: string
  /** Variante visuelle */
  variant?: 'outline' | 'filled' | 'glass' | 'premium'
  /** Taille du champ */
  inputSize?: 'sm' | 'md' | 'lg'
  /** Texte préfixe (ex: "$", "€", "https://") */
  prefix?: string
  /** Texte suffixe (ex: "kg", "FC", "@gmail.com") */
  suffix?: string
  /** Masque les flèches des inputs number */
  hideNumberArrows?: boolean
  /** Affiche un bouton pour effacer le contenu */
  allowClear?: boolean
  /** Callback quand le champ est effacé */
  onClear?: () => void
  /** État de chargement */
  loading?: boolean
  /** Texte affiché pendant le chargement */
  loadingText?: string
  /** Active l'animation shake en cas d'erreur */
  shakeOnError?: boolean
  /** Durée de l'animation shake (ms) */
  shakeDuration?: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLE MAPS                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const baseInputStyles = cn(
  'block w-full rounded-xl border',
  'bg-canvas text-fg',
  'placeholder:text-fg-subtle',
  'transition-all duration-200 ease-out',
  'focus:outline-none focus:ring-2 focus:ring-offset-0',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'motion-reduce:transition-none'
)

const variantStyles: Record<string, string> = {
  outline: cn(
    'border-line',
    'hover:border-line-strong',
    'focus:border-accent focus:ring-accent/20'
  ),
  filled: cn(
    'border-transparent bg-muted',
    'hover:bg-muted/80',
    'focus:bg-canvas focus:border-accent focus:ring-accent/20'
  ),
  glass: cn(
    'border-line/50 bg-surface/50 backdrop-blur-md',
    'text-fg placeholder:text-fg-subtle',
    'focus:border-accent/60 focus:bg-surface/70 focus:ring-accent/20'
  ),
  premium: cn(
    'border-2 border-line bg-canvas shadow-card',
    'hover:shadow-card-hover',
    'focus:border-transparent focus:ring-2 focus:ring-accent/30'
  ),
}

const sizeStyles: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

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

  /* ───────────────────────────────────────────────────────────── */
  /*  IDs & ARIA                                                   */
  /* ───────────────────────────────────────────────────────────── */

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

  /* ───────────────────────────────────────────────────────────── */
  /*  STATE                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const [focused, setFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [internalValue, setInternalValue] = useState<string>(() => {
    if (typeof rest.value === 'string') return rest.value
    if (typeof rest.defaultValue === 'string') return rest.defaultValue
    return ''
  })

  /* ───────────────────────────────────────────────────────────── */
  /*  REFS                                                         */
  /* ───────────────────────────────────────────────────────────── */

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

  /* ───────────────────────────────────────────────────────────── */
  /*  DERIVED                                                      */
  /* ───────────────────────────────────────────────────────────── */

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

  /* ───────────────────────────────────────────────────────────── */
  /*  HANDLERS                                                     */
  /* ───────────────────────────────────────────────────────────── */

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

  /* ───────────────────────────────────────────────────────────── */
  /*  RIGHT ICON RENDERER                                          */
  /* ───────────────────────────────────────────────────────────── */

  const renderRightIcon = (): ReactNode => {
    if (loading) {
      return (
        <Loader2
          size={16}
          className="animate-spin text-accent"
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
          className={cn(
            'rounded p-1 text-fg-subtle',
            'transition-colors duration-200',
            'hover:text-fg',
            'focus:outline-none focus:ring-2 focus:ring-accent',
            'motion-reduce:transition-none'
          )}
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
          className="text-danger"
          aria-hidden="true"
        />
      )
    }

    if (success && !error) {
      return (
        <CheckCircle
          size={16}
          className="text-success"
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
          className={cn(
            'rounded p-1 text-fg-subtle',
            'transition-colors duration-200',
            'hover:text-fg',
            'focus:outline-none focus:ring-2 focus:ring-accent',
            'motion-reduce:transition-none'
          )}
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
            className={cn(
              'rounded p-1 text-fg-subtle',
              'transition-colors duration-200',
              'hover:text-fg',
              'focus:outline-none focus:ring-2 focus:ring-accent',
              'motion-reduce:transition-none'
            )}
          >
            {rightIcon}
          </button>
        )
      }

      return (
        <span className="text-fg-subtle" aria-hidden="true">
          {rightIcon}
        </span>
      )
    }

    return null
  }

  const rightIconContent = renderRightIcon()

  /* ───────────────────────────────────────────────────────────── */
  /*  CONDITIONAL STYLES                                           */
  /* ───────────────────────────────────────────────────────────── */

  const errorStyles = error
    ? '!border-danger focus:!ring-danger/20'
    : ''

  const successStyles = success
    ? '!border-success focus:!ring-success/20'
    : ''

  const iconPaddingLeft = leftIcon || prefix ? 'pl-10' : ''
  const iconPaddingRight = rightIconContent || suffix ? 'pr-10' : ''

  const hasFooter = Boolean(
    error ||
      success ||
      (loading && loadingText) ||
      (helperText && !error && !success && !loading) ||
      (showCharCount && maxLength)
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

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
              baseInputStyles,
              variantStyles[variant],
              sizeStyles[inputSize],
              iconPaddingLeft,
              iconPaddingRight,
              errorStyles,
              successStyles,
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
              'motion-reduce:transition-none',
              isLabelFloating
                ? '-top-0.5 rounded bg-canvas px-1 text-xs text-accent'
                : 'top-1/2 -translate-y-1/2 text-sm text-fg-muted',
              leftIcon || prefix ? 'left-10' : 'left-3'
            )}
          >
            {label}
          </label>

          {leftIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-fg-subtle">
              {leftIcon}
            </div>
          )}

          {prefix && (
            <div className="absolute inset-y-0 left-3.5 flex items-center text-sm text-fg-muted">
              <span>{prefix}</span>
            </div>
          )}

          {suffix && (
            <div className="absolute inset-y-0 right-12 flex items-center text-sm text-fg-muted">
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
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              {label}
            </label>
          )}

          <div className="relative">
            {leftIcon && (
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-fg-subtle">
                {leftIcon}
              </div>
            )}

            {prefix && (
              <div className="absolute inset-y-0 left-3.5 flex items-center text-sm text-fg-muted">
                <span>{prefix}</span>
              </div>
            )}

            <input
              ref={setRefs}
              id={inputId}
              disabled={disabled}
              maxLength={maxLength}
              className={cn(
                baseInputStyles,
                variantStyles[variant],
                sizeStyles[inputSize],
                iconPaddingLeft,
                iconPaddingRight,
                errorStyles,
                successStyles,
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
              <div className="absolute inset-y-0 right-3.5 flex items-center text-sm text-fg-muted">
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
                className="flex items-center gap-1 text-sm text-danger"
              >
                <AlertCircle size={14} aria-hidden="true" />
                {error}
              </p>
            )}

            {success && (
              <p
                id={successId}
                className="flex items-center gap-1 text-sm text-success"
              >
                <CheckCircle size={14} aria-hidden="true" />
                {success}
              </p>
            )}

            {loading && loadingText && (
              <p className="flex items-center gap-1 text-sm text-fg-muted">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {loadingText}
              </p>
            )}

            {helperText && !error && !success && !loading && (
              <p
                id={helperId}
                className="text-sm text-fg-muted"
              >
                {helperText}
              </p>
            )}
          </div>

          {showCharCount && maxLength && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300 motion-reduce:transition-none"
                  style={{ width: `${(charCount / maxLength) * 100}%` }}
                />
              </div>

              <p className="text-xs tabular-nums text-fg-muted">
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
export default Input