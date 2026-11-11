// components/ui/Toast.tsx
'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  isValidElement,
  type ReactNode,
} from 'react'

import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { cn } from '@/lib/utils'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ToastType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'loading'
  | 'default'

export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export type ToastVariant = 'solid' | 'outlined' | 'glass' | 'minimal'

export interface ToastActionButton {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  type?: ToastType
  message: ReactNode
  title?: string
  description?: string
  duration?: number
  showProgress?: boolean
  actions?: ReactNode
  /**
   * Alias tolérant de `actions`.
   * Peut être un nœud React ou un objet { label, onClick }.
   */
  action?: ReactNode | ToastActionButton
  icon?: ReactNode
  variant?: ToastVariant
  persistent?: boolean
  /**
   * Joue un son de notification.
   * Désactivé par défaut pour éviter les surprises audio.
   */
  sound?: boolean
  onClose?: () => void
  onOpen?: () => void
}

export type ToastInput = Omit<ToastItem, 'id'> & { id?: string }

export type ToastOptions = Partial<Omit<ToastItem, 'type' | 'message'>>

/**
 * Valeur du contexte.
 *
 * Elle est à la fois :
 * - appelable : `toast({ message: '...' })`
 * - un objet : `const { addToast, show } = useToast()`
 * - avec raccourcis : `toast.success('...')`
 */
export interface ToastContextValue {
  (props: ToastInput): string

  toasts: ToastItem[]
  addToast: (toast: ToastInput) => string
  updateToast: (id: string, toast: Partial<ToastItem>) => void
  removeToast: (id: string) => void
  dismiss: (id: string) => void
  clearToasts: () => void

  show: (
    messageOrProps: ReactNode | ToastInput,
    typeOrOptions?: ToastType | (ToastOptions & { type?: ToastType }),
    duration?: number
  ) => string

  success: (message: ReactNode, options?: ToastOptions) => string
  error: (message: ReactNode, options?: ToastOptions) => string
  warning: (message: ReactNode, options?: ToastOptions) => string
  info: (message: ReactNode, options?: ToastOptions) => string
  loading: (message: ReactNode, options?: ToastOptions) => string
}

export interface ToastFunction {
  (props: ToastInput): string

  addToast: (props: ToastInput) => string
  show: ToastContextValue['show']
  success: ToastContextValue['success']
  error: ToastContextValue['error']
  warning: ToastContextValue['warning']
  info: ToastContextValue['info']
  loading: ToastContextValue['loading']
  default: (message: ReactNode, options?: ToastOptions) => string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTEXT                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  return context
}

/* ═══════════════════════════════════════════════════════════════ */
/*  REDUCER                                                        */
/* ═══════════════════════════════════════════════════════════════ */

type ToastReducerAction =
  | { type: 'ADD'; toast: ToastItem }
  | { type: 'REMOVE'; id: string }
  | { type: 'UPDATE'; id: string; data: Partial<ToastItem> }
  | { type: 'CLEAR' }

function toastReducer(
  state: ToastItem[],
  action: ToastReducerAction
): ToastItem[] {
  switch (action.type) {
    case 'ADD':
      return [...state, action.toast]

    case 'REMOVE':
      return state.filter((toast) => toast.id !== action.id)

    case 'UPDATE':
      return state.map((toast) =>
        toast.id === action.id ? { ...toast, ...action.data } : toast
      )

    case 'CLEAR':
      return []

    default:
      return state
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function isToastInput(value: unknown): value is ToastInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    !isValidElement(value) &&
    'message' in value
  )
}

function isActionButton(value: unknown): value is ToastActionButton {
  return (
    typeof value === 'object' &&
    value !== null &&
    !isValidElement(value) &&
    'label' in value &&
    'onClick' in value
  )
}

function playToastSound(type: ToastType): void {
  if (typeof window === 'undefined') return

  try {
    const AudioConstructor =
      window.AudioContext ||
      (window as unknown as {
        webkitAudioContext?: typeof AudioContext
      }).webkitAudioContext

    if (!AudioConstructor) return

    const audioContext = new AudioConstructor()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.onended = () => {
      void audioContext.close()
    }

    if (type === 'success') {
      oscillator.frequency.value = 880
      oscillator.type = 'sine'
      gainNode.gain.value = 0.08
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.12)
      return
    }

    if (type === 'error') {
      oscillator.frequency.value = 220
      oscillator.type = 'square'
      gainNode.gain.value = 0.08
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.18)
      return
    }

    void audioContext.close()
  } catch {
    // silencieux
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DESIGN TOKENS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const iconMap: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 size={20} aria-hidden="true" />,
  error: <AlertCircle size={20} aria-hidden="true" />,
  warning: <AlertTriangle size={20} aria-hidden="true" />,
  info: <Info size={20} aria-hidden="true" />,
  loading: <Loader2 size={20} className="animate-spin" aria-hidden="true" />,
  default: <Info size={20} aria-hidden="true" />,
}

const solidTypeClasses: Record<ToastType, string> = {
  success: 'bg-success text-success-contrast',
  error: 'bg-danger text-danger-contrast',
  warning: 'bg-warning text-warning-contrast',
  info: 'bg-info text-info-contrast',
  loading: 'bg-accent text-accent-contrast',
  default: 'bg-surface text-fg border border-line',
}

const variantBaseClasses: Record<ToastVariant, string> = {
  solid: '',
  outlined: 'border border-line bg-surface text-fg',
  glass:
    'border border-line/60 bg-surface/80 text-fg backdrop-blur-xl',
  minimal:
    'border border-transparent bg-transparent text-fg shadow-none',
}

const accentBorderClasses: Record<ToastType, string> = {
  success: 'border-l-success',
  error: 'border-l-danger',
  warning: 'border-l-warning',
  info: 'border-l-info',
  loading: 'border-l-accent',
  default: 'border-l-line-strong',
}

const iconColorClasses: Record<ToastType, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  loading: 'text-accent',
  default: 'text-fg-subtle',
}

const progressFillClasses: Record<ToastType, string> = {
  success: 'bg-success',
  error: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
  loading: 'bg-accent',
  default: 'bg-fg-subtle',
}

const solidProgressTrackClasses: Record<ToastType, string> = {
  success: 'bg-success-contrast/15',
  error: 'bg-danger-contrast/15',
  warning: 'bg-warning-contrast/15',
  info: 'bg-info-contrast/15',
  loading: 'bg-accent-contrast/15',
  default: 'bg-line',
}

const solidProgressFillClasses: Record<ToastType, string> = {
  success: 'bg-success-contrast/70',
  error: 'bg-danger-contrast/70',
  warning: 'bg-warning-contrast/70',
  info: 'bg-info-contrast/70',
  loading: 'bg-accent-contrast/70',
  default: 'bg-accent',
}

const solidCloseButtonClasses: Record<ToastType, string> = {
  success:
    'text-success-contrast hover:bg-success-contrast/10 focus-visible:ring-success-contrast',
  error:
    'text-danger-contrast hover:bg-danger-contrast/10 focus-visible:ring-danger-contrast',
  warning:
    'text-warning-contrast hover:bg-warning-contrast/10 focus-visible:ring-warning-contrast',
  info:
    'text-info-contrast hover:bg-info-contrast/10 focus-visible:ring-info-contrast',
  loading:
    'text-accent-contrast hover:bg-accent-contrast/10 focus-visible:ring-accent-contrast',
  default:
    'text-fg-muted hover:bg-muted hover:text-fg focus-visible:ring-accent',
}

const solidActionButtonClasses: Record<ToastType, string> = {
  success:
    'border-success-contrast/20 bg-success-contrast/10 text-success-contrast hover:bg-success-contrast/20 focus-visible:ring-success-contrast',
  error:
    'border-danger-contrast/20 bg-danger-contrast/10 text-danger-contrast hover:bg-danger-contrast/20 focus-visible:ring-danger-contrast',
  warning:
    'border-warning-contrast/20 bg-warning-contrast/10 text-warning-contrast hover:bg-warning-contrast/20 focus-visible:ring-warning-contrast',
  info:
    'border-info-contrast/20 bg-info-contrast/10 text-info-contrast hover:bg-info-contrast/20 focus-visible:ring-info-contrast',
  loading:
    'border-accent-contrast/20 bg-accent-contrast/10 text-accent-contrast hover:bg-accent-contrast/20 focus-visible:ring-accent-contrast',
  default:
    'border-line bg-muted text-fg hover:bg-muted/80 focus-visible:ring-accent',
}

const neutralActionButtonClasses =
  'border border-line bg-muted text-fg hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

const neutralCloseButtonClasses =
  'text-fg-muted hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

const positionClasses: Record<ToastPosition, string> = {
  'top-left': 'top-4 left-4 items-start',
  'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
  'top-right': 'top-4 right-4 items-end',
  'bottom-left': 'bottom-4 left-4 items-start',
  'bottom-center':
    'bottom-4 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-4 right-4 items-end',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GLOBAL BRIDGE POUR L'API STANDALONE                            */
/* ═══════════════════════════════════════════════════════════════ */

let addToastGlobal: ((toast: ToastInput) => string) | null = null

/* ═══════════════════════════════════════════════════════════════ */
/*  PROVIDER                                                       */
/* ═══════════════════════════════════════════════════════════════ */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, [])

  const toastsRef = useRef<ToastItem[]>(toasts)
  toastsRef.current = toasts

  const addToast = useCallback((input: ToastInput): string => {
    const id =
      input.id ??
      `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

    const duration =
      input.duration ?? (input.type === 'loading' ? 0 : 5000)

    const nextToast: ToastItem = {
      ...input,
      id,
      duration,
    }

    if (toastsRef.current.some((toast) => toast.id === id)) {
      dispatch({ type: 'UPDATE', id, data: nextToast })
      return id
    }

    dispatch({ type: 'ADD', toast: nextToast })

    if (nextToast.sound === true && nextToast.type) {
      playToastSound(nextToast.type)
    }

    nextToast.onOpen?.()

    return id
  }, [])

  const removeToast = useCallback((id: string): void => {
    const existing = toastsRef.current.find((toast) => toast.id === id)

    if (!existing) return

    existing.onClose?.()
    dispatch({ type: 'REMOVE', id })
  }, [])

  const updateToast = useCallback(
    (id: string, data: Partial<ToastItem>): void => {
      dispatch({ type: 'UPDATE', id, data })
    },
    []
  )

  const clearToasts = useCallback((): void => {
    dispatch({ type: 'CLEAR' })
  }, [])

  const show = useCallback(
    (
      messageOrProps: ReactNode | ToastInput,
      typeOrOptions?: ToastType | (ToastOptions & { type?: ToastType }),
      duration?: number
    ): string => {
      if (isToastInput(messageOrProps)) {
        return addToast(messageOrProps)
      }

      const options: ToastOptions & { type?: ToastType } =
        typeof typeOrOptions === 'string'
          ? { type: typeOrOptions }
          : typeOrOptions ?? {}

      return addToast({
        ...options,
        ...(duration !== undefined ? { duration } : {}),
        message: messageOrProps as ReactNode,
      })
    },
    [addToast]
  )

  useEffect(() => {
    addToastGlobal = addToast

    return () => {
      addToastGlobal = null
    }
  }, [addToast])

  const value = useMemo<ToastContextValue>(() => {
    const withType =
      (type: ToastType) =>
      (message: ReactNode, options?: ToastOptions): string =>
        addToast({ ...options, type, message })

    const callable = ((props: ToastInput) =>
      addToast(props)) as ToastContextValue

    return Object.assign(callable, {
      toasts,
      addToast,
      updateToast,
      removeToast,
      dismiss: removeToast,
      clearToasts,
      show,
      success: withType('success'),
      error: withType('error'),
      warning: withType('warning'),
      info: withType('info'),
      loading: withType('loading'),
    })
  }, [
    addToast,
    clearToasts,
    removeToast,
    show,
    toasts,
    updateToast,
  ])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  RENDER ACTION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function renderAction(
  action: ToastItem['action'],
  variant: ToastVariant,
  type: ToastType
): ReactNode {
  if (!action) return null

  if (isActionButton(action)) {
    const buttonClasses =
      variant === 'solid' && type !== 'default'
        ? cn(
            'inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2',
            solidActionButtonClasses[type]
          )
        : cn(
            'inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
            neutralActionButtonClasses
          )

    return (
      <button
        type="button"
        onClick={action.onClick}
        className={buttonClasses}
      >
        {action.label}
      </button>
    )
  }

  return action
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TOAST ITEM                                                     */
/* ═══════════════════════════════════════════════════════════════ */

function ToastComponent({
  toast,
  onRemove,
}: {
  toast: ToastItem
  onRemove: () => void
}) {
  const accessibility = useAccessibilityPreferences() as {
    prefersReducedMotion?: boolean
  }

  const prefersReducedMotion = Boolean(accessibility?.prefersReducedMotion)

  const [progress, setProgress] = useState(100)
  const [isPaused, setIsPaused] = useState(false)

  const duration = toast.duration ?? 5000
  const persistent = toast.persistent === true || duration === 0

  const onRemoveRef = useRef(onRemove)
  onRemoveRef.current = onRemove

  const remainingRef = useRef(duration)

  const type = toast.type ?? 'default'
  const variant = toast.variant ?? 'solid'

  useEffect(() => {
    remainingRef.current = duration
    setProgress(100)
  }, [duration])

  useEffect(() => {
    if (persistent || isPaused) return

    const startedAt = Date.now()
    const startRemaining = remainingRef.current

    const interval = window.setInterval(() => {
      const remaining = startRemaining - (Date.now() - startedAt)
      remainingRef.current = Math.max(0, remaining)

      if (remaining <= 0) {
        window.clearInterval(interval)
        setProgress(0)
        onRemoveRef.current()
      } else {
        setProgress((remaining / duration) * 100)
      }
    }, 30)

    return () => {
      window.clearInterval(interval)
    }
  }, [duration, isPaused, persistent])

  const pause = () => setIsPaused(true)
  const resume = () => setIsPaused(false)

  const isSolid = variant === 'solid'
  const isSolidColored = isSolid && type !== 'default'

  const containerClasses = cn(
    'pointer-events-auto relative flex w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-card shadow-card sm:w-auto',
    isSolid ? solidTypeClasses[type] : variantBaseClasses[variant],
    !isSolid && 'border-l-4',
    !isSolid && accentBorderClasses[type]
  )

  const iconClasses = cn(
    'mt-0.5 shrink-0',
    !isSolidColored && iconColorClasses[type]
  )

  const closeButtonClasses = cn(
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2',
    isSolidColored
      ? solidCloseButtonClasses[type]
      : neutralCloseButtonClasses
  )

  const progressTrackClasses = cn(
    'h-1 w-full',
    isSolidColored
      ? solidProgressTrackClasses[type]
      : 'bg-line'
  )

  const progressFillClasses = cn(
    'h-full transition-[width] duration-75 ease-linear motion-reduce:transition-none',
    isSolidColored
      ? solidProgressFillClasses[type]
      : progressFillClasses[type]
  )

  const actionsNode = toast.actions ?? renderAction(toast.action, variant, type)

  const motionInitial = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 0, y: 24, scale: 0.96 }

  const motionAnimate = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 1, y: 0, scale: 1 }

  const motionExit = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, y: -16, scale: 0.96 }

  return (
    <motion.div
      layout
      initial={motionInitial}
      animate={motionAnimate}
      exit={motionExit}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.22,
        ease: 'easeOut',
      }}
      className={containerClasses}
      onMouseEnter={pause}
      onMouseLeave={resume}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={iconClasses}>
          {toast.icon ?? iconMap[type]}
        </span>

        <div className="min-w-0 flex-1">
          {toast.title ? (
            <p className="text-sm font-semibold leading-tight">
              {toast.title}
            </p>
          ) : null}

          <p className="text-sm leading-relaxed opacity-90 break-words">
            {toast.message}
          </p>

          {toast.description ? (
            <p className="mt-1 text-xs leading-relaxed opacity-75 break-words">
              {toast.description}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onRemove}
          className={closeButtonClasses}
          aria-label="Fermer la notification"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {actionsNode ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          {actionsNode}
        </div>
      ) : null}

      {!persistent && toast.showProgress !== false ? (
        <div className={progressTrackClasses}>
          <div
            className={progressFillClasses}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TOAST CONTAINER                                                */
/* ═══════════════════════════════════════════════════════════════ */

function ToastContainer({
  position = 'bottom-right',
}: {
  position?: ToastPosition
}) {
  const { toasts, removeToast } = useToast()

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const container = (
    <div
      className={cn(
        'pointer-events-none fixed z-[100] flex flex-col gap-2',
        positionClasses[position]
      )}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      <AnimatePresence mode="sync">
        {toasts.map((toast) => (
          <ToastComponent
            key={toast.id}
            toast={toast}
            onRemove={() => removeToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  )

  if (!mounted) {
    return container
  }

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(container, document.body)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  API STANDALONE                                                 */
/* ═══════════════════════════════════════════════════════════════ */

const toastFn = ((props: ToastInput): string => {
  if (!addToastGlobal) {
    console.warn(
      'Toast function called before ToastProvider is mounted.'
    )
    return ''
  }

  return addToastGlobal(props)
}) as ToastFunction

export const toast: ToastFunction = Object.assign(toastFn, {
  addToast: (props: ToastInput) => toastFn(props),

  show: (
    messageOrProps: ReactNode | ToastInput,
    typeOrOptions?: ToastType | (ToastOptions & { type?: ToastType }),
    duration?: number
  ): string => {
    if (isToastInput(messageOrProps)) {
      return toastFn(messageOrProps)
    }

    const options: ToastOptions & { type?: ToastType } =
      typeof typeOrOptions === 'string'
        ? { type: typeOrOptions }
        : typeOrOptions ?? {}

    return toastFn({
      ...options,
      ...(duration !== undefined ? { duration } : {}),
      message: messageOrProps as ReactNode,
    })
  },

  success: (message: ReactNode, options?: ToastOptions) =>
    toastFn({ type: 'success', message, ...options }),

  error: (message: ReactNode, options?: ToastOptions) =>
    toastFn({ type: 'error', message, ...options }),

  warning: (message: ReactNode, options?: ToastOptions) =>
    toastFn({ type: 'warning', message, ...options }),

  info: (message: ReactNode, options?: ToastOptions) =>
    toastFn({ type: 'info', message, ...options }),

  loading: (message: ReactNode, options?: ToastOptions) =>
    toastFn({ type: 'loading', message, ...options }),

  default: (message: ReactNode, options?: ToastOptions) =>
    toastFn({ type: 'default', message, ...options }),
})

export default ToastProvider