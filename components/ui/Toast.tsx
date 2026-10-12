// components/ui/Toast.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
  useMemo,
  useReducer,
  ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
} from 'lucide-react'

/* ========================================================================
   Types
   ======================================================================== */
type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'default'
type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
type ToastVariant = 'solid' | 'outlined' | 'glass' | 'minimal'

export interface ToastItem {
  id: string
  type?: ToastType
  message: ReactNode
  title?: string
  description?: string
  duration?: number
  showProgress?: boolean
  actions?: ReactNode
  icon?: ReactNode
  variant?: ToastVariant
  persistent?: boolean
  onClose?: () => void
  onOpen?: () => void
}

interface ToastContextValue {
  toasts: ToastItem[]
  addToast: (toast: Omit<ToastItem, 'id'> & { id?: string }) => string
  updateToast: (id: string, toast: Partial<ToastItem>) => void
  removeToast: (id: string) => void
  clearToasts: () => void
}

/* ========================================================================
   Contexte & Provider
   ======================================================================== */
export const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

type ToastAction =
  | { type: 'ADD'; toast: ToastItem }
  | { type: 'REMOVE'; id: string }
  | { type: 'UPDATE'; id: string; data: Partial<ToastItem> }
  | { type: 'CLEAR' }

function toastReducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case 'ADD':
      return [...state, action.toast]
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id)
    case 'UPDATE':
      return state.map((t) => (t.id === action.id ? { ...t, ...action.data } : t))
    case 'CLEAR':
      return []
    default:
      return state
  }
}

// Son de notification (côté client uniquement)
const playSound = (type: ToastType) => {
  if (typeof window === 'undefined') return
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'success') {
      oscillator.frequency.value = 880
      oscillator.type = 'sine'
      gain.gain.value = 0.1
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.15)
    } else if (type === 'error') {
      oscillator.frequency.value = 220
      oscillator.type = 'square'
      gain.gain.value = 0.1
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.2)
    }
  } catch (_) {}
}

// Variable globale pour la fonction standalone toast
let addToastGlobal: ((toast: Omit<ToastItem, 'id'> & { id?: string }) => string) | null = null

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, dispatch] = useReducer(toastReducer, [])

  const addToast = useCallback(
    (toast: Omit<ToastItem, 'id'> & { id?: string }) => {
      const id = toast.id ?? `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const duration = toast.duration ?? (toast.type === 'loading' ? 0 : 5000)
      const newToast: ToastItem = { ...toast, id, duration }
      dispatch({ type: 'ADD', toast: newToast })
      if (toast.type && toast.type !== 'loading' && toast.type !== 'default') {
        playSound(toast.type)
      }
      newToast.onOpen?.()
      return id
    },
    []
  )

  const removeToast = useCallback((id: string) => {
    const toast = toasts.find((t) => t.id === id)
    toast?.onClose?.()
    dispatch({ type: 'REMOVE', id })
  }, [toasts])

  const updateToast = useCallback((id: string, data: Partial<ToastItem>) => {
    dispatch({ type: 'UPDATE', id, data })
  }, [])

  const clearToasts = useCallback(() => {
    dispatch({ type: 'CLEAR' })
  }, [])

  // Alimente la variable globale pour l'API standalone
  useEffect(() => {
    addToastGlobal = addToast
    return () => {
      addToastGlobal = null
    }
  }, [addToast])

  const value = useMemo(
    () => ({ toasts, addToast, updateToast, removeToast, clearToasts }),
    [toasts, addToast, updateToast, removeToast, clearToasts]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

/* ========================================================================
   Toast individuel
   ======================================================================== */
const iconMap: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 size={20} />,
  error: <AlertCircle size={20} />,
  warning: <AlertTriangle size={20} />,
  info: <Info size={20} />,
  loading: <Loader2 size={20} className="animate-spin" />,
  default: <Info size={20} />,
}

const variantStyles: Record<ToastVariant, string> = {
  solid: 'text-white',
  outlined:
    'border bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 text-neutral-800 dark:text-neutral-200',
  glass:
    'backdrop-blur-xl bg-white/70 dark:bg-neutral-900/70 border border-white/20 dark:border-neutral-700/30 text-neutral-800 dark:text-neutral-200',
  minimal:
    'bg-transparent border-none text-neutral-800 dark:text-neutral-200 shadow-none',
}

const typeSolidColors: Record<ToastType, string> = {
  success: 'bg-success-500',
  error: 'bg-danger-500',
  warning: 'bg-warning-500',
  info: 'bg-info-500',
  loading: 'bg-brand-500',
  default: 'bg-neutral-700',
}

const typeBorderColors: Record<ToastType, string> = {
  success: 'border-l-success-500',
  error: 'border-l-danger-500',
  warning: 'border-l-warning-500',
  info: 'border-l-info-500',
  loading: 'border-l-brand-500',
  default: 'border-l-neutral-500',
}

const ToastComponent = ({
  toast,
  onRemove,
}: {
  toast: ToastItem
  onRemove: () => void
}) => {
  const [progress, setProgress] = useState(100)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const duration = toast.duration ?? 5000
  const persistent = toast.persistent || duration === 0

  useEffect(() => {
    if (persistent || isPaused) return

    const startTime = Date.now()
    const totalDuration = duration

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = totalDuration - elapsed
      if (remaining <= 0) {
        setProgress(0)
        onRemove()
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      } else {
        setProgress((remaining / totalDuration) * 100)
      }
    }, 30)

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [persistent, isPaused, duration, onRemove])

  const pause = () => setIsPaused(true)
  const resume = () => setIsPaused(false)

  const type = toast.type || 'default'
  const variant = toast.variant || 'solid'

  const containerClasses = cn(
    'relative flex flex-col w-full max-w-sm rounded-xl shadow-strong overflow-hidden pointer-events-auto',
    variant === 'solid'
      ? typeSolidColors[type]
      : variantStyles[variant],
    variant !== 'solid' && 'border-l-4 ' + typeBorderColors[type]
  )

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.15 } }}
      className={containerClasses}
      onMouseEnter={pause}
      onMouseLeave={resume}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="flex-shrink-0 mt-0.5">
          {toast.icon ?? iconMap[type]}
        </span>

        <div className="flex-1 min-w-0">
          {toast.title && (
            <p className="font-semibold text-sm leading-tight">{toast.title}</p>
          )}
          <p className="text-sm opacity-90">{toast.message}</p>
          {toast.description && (
            <p className="text-xs opacity-70 mt-1">{toast.description}</p>
          )}
        </div>

        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          aria-label="Fermer la notification"
        >
          <X size={16} />
        </button>
      </div>

      {toast.actions && (
        <div className="flex items-center gap-2 px-4 pb-3">{toast.actions}</div>
      )}

      {!persistent && toast.showProgress !== false && (
        <div className="h-1 w-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full bg-white/60 dark:bg-white/30 transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </motion.div>
  )
}

/* ========================================================================
   ToastContainer – rendu des toasts empilés (corrigé SSR)
   ======================================================================== */
const positionClasses: Record<ToastPosition, string> = {
  'top-left': 'top-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
}

const ToastContainer = ({
  position = 'bottom-right',
}: {
  position?: ToastPosition
}) => {
  const { toasts, removeToast } = useToast()

  // ✅ Évite l'accès à document.body pendant le SSR
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const container = (
    <div
      className={cn(
        'fixed z-[100] flex flex-col gap-2 pointer-events-none',
        positionClasses[position]
      )}
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

  return mounted ? createPortal(container, document.body) : container
}

/* ========================================================================
   API standalone – utilisable hors composant
   ======================================================================== */
export const toast = (props: Omit<ToastItem, 'id'> & { id?: string }) => {
  if (!addToastGlobal) {
    console.warn('Toast function called before ToastProvider is mounted.')
    return ''
  }
  return addToastGlobal(props)
}

// Raccourcis pratiques
toast.success = (message: ReactNode, options?: Partial<Omit<ToastItem, 'type' | 'message'>>) => {
  return toast({ type: 'success', message, ...options })
}
toast.error = (message: ReactNode, options?: Partial<Omit<ToastItem, 'type' | 'message'>>) => {
  return toast({ type: 'error', message, ...options })
}
toast.warning = (message: ReactNode, options?: Partial<Omit<ToastItem, 'type' | 'message'>>) => {
  return toast({ type: 'warning', message, ...options })
}
toast.info = (message: ReactNode, options?: Partial<Omit<ToastItem, 'type' | 'message'>>) => {
  return toast({ type: 'info', message, ...options })
}
toast.loading = (message: ReactNode, options?: Partial<Omit<ToastItem, 'type' | 'message'>>) => {
  return toast({ type: 'loading', message, ...options })
}
toast.default = (message: ReactNode, options?: Partial<Omit<ToastItem, 'type' | 'message'>>) => {
  return toast({ type: 'default', message, ...options })
}