// components/ui/Modal.tsx
'use client'

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { AnimatePresence, motion, type Variants, type PanInfo } from 'framer-motion'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOK : useMediaQuery                                           */
/* ═══════════════════════════════════════════════════════════════ */

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mql = window.matchMedia(query)
    setMatches(mql.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mql.addEventListener('change', handler)

    return () => {
      mql.removeEventListener('change', handler)
    }
  }, [query])

  return matches
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTEXT : MODAL STACK                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface ModalStackItem {
  id: string
  close: () => void
}

interface ModalStackContextValue {
  register: (id: string, close: () => void) => void
  unregister: (id: string) => void
  activeCount: number
  topId: string | null
}

const ModalStackContext = createContext<ModalStackContextValue | null>(null)

export function ModalStackProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<ModalStackItem[]>([])

  const register = useCallback((id: string, close: () => void) => {
    setStack((previous) => {
      if (previous.some((item) => item.id === id)) return previous
      return [...previous, { id, close }]
    })
  }, [])

  const unregister = useCallback((id: string) => {
    setStack((previous) => previous.filter((item) => item.id !== id))
  }, [])

  const value: ModalStackContextValue = {
    register,
    unregister,
    activeCount: stack.length,
    topId: stack.length > 0 ? stack[stack.length - 1].id : null,
  }

  return (
    <ModalStackContext.Provider value={value}>
      {children}
    </ModalStackContext.Provider>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ModalSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | 'full'
  | string

export type ModalAccent =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  // ─────────────────────────────────────────────────────────────
  // Variantes legacy conservées pour compatibilité.
  // Elles sont automatiquement mappées vers les tokens sémantiques.
  // ─────────────────────────────────────────────────────────────
  | 'brand'
  | 'warm'
  | 'luxury'
  | 'gold'
  | 'burgundy'
  | 'champagne'
  | 'rosegold'
  | 'teal'
  | 'copper'
  | 'plum'

export type AnimationVariant = 'spring' | 'tween' | 'fade' | 'slideUp'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  description?: string
  size?: ModalSize
  accent?: ModalAccent
  showCloseButton?: boolean
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  className?: string
  bodyClassName?: string
  footer?: ReactNode
  showFooterClose?: boolean
  zIndex?: number
  modalId?: string
  onAfterOpen?: () => void
  onAfterClose?: () => void
  disableScrollLock?: boolean
  portal?: boolean
  initialFocusRef?: React.RefObject<HTMLElement>
  lightBackdrop?: boolean
  backdropClassName?: string
  animationVariant?: AnimationVariant
  showDragHandle?: boolean
  disableDrag?: boolean
  dragToDismiss?: boolean
  dragHandle?: ReactNode
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT MAPPING (legacy → sémantique)                          */
/* ═══════════════════════════════════════════════════════════════ */

type ResolvedAccent = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

function resolveAccent(accent: ModalAccent): ResolvedAccent {
  switch (accent) {
    case 'accent':
    case 'brand':
    case 'luxury':
      return 'accent'
    case 'success':
      return 'success'
    case 'warning':
    case 'warm':
    case 'gold':
    case 'champagne':
      return 'warning'
    case 'danger':
    case 'burgundy':
    case 'rosegold':
      return 'danger'
    case 'info':
    case 'teal':
    case 'copper':
    case 'plum':
      return 'info'
    case 'neutral':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLE MAPS                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const sizeMap: Record<string, string> = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  full: 'max-w-[95vw] max-h-[95vh]',
}

const accentBorderMap: Record<ResolvedAccent, string> = {
  accent: 'border-t-4 border-t-accent',
  success: 'border-t-4 border-t-success',
  warning: 'border-t-4 border-t-warning',
  danger: 'border-t-4 border-t-danger',
  info: 'border-t-4 border-t-info',
  neutral: '',
}

const accentHeaderMap: Record<ResolvedAccent, string> = {
  accent: 'bg-accent-soft/50',
  success: 'bg-success-soft/50',
  warning: 'bg-warning-soft/50',
  danger: 'bg-danger-soft/50',
  info: 'bg-info-soft/50',
  neutral: '',
}

const accentTitleMap: Record<ResolvedAccent, string> = {
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-fg',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MODAL COMPONENT                                                */
/* ═══════════════════════════════════════════════════════════════ */

export function Modal({
  isOpen,
  onClose,
  children,
  title,
  description,
  size = 'md',
  accent = 'neutral',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className,
  bodyClassName,
  footer,
  showFooterClose = false,
  zIndex: zIndexProp,
  modalId,
  onAfterOpen,
  onAfterClose,
  disableScrollLock = false,
  portal = true,
  initialFocusRef,
  lightBackdrop = false,
  backdropClassName,
  animationVariant = 'spring',
  showDragHandle = false,
  disableDrag = false,
  dragToDismiss = true,
  dragHandle,
}: ModalProps) {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const isMobile = useMediaQuery('(max-width: 767px)')

  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const uniqueId = useRef(modalId ?? `modal-${Math.random().toString(36).slice(2, 11)}`).current

  const resolvedAccent = resolveAccent(accent)

  const stackCtx = useContext(ModalStackContext)

  /* ───────────────────────────────────────────────────────────── */
  /*  STACK MANAGEMENT                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!stackCtx || !isOpen) return

    stackCtx.register(uniqueId, onClose)

    return () => {
      stackCtx.unregister(uniqueId)
    }
  }, [stackCtx, isOpen, onClose, uniqueId])

  /* ───────────────────────────────────────────────────────────── */
  /*  Z-INDEX                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const zIndex = zIndexProp ?? (stackCtx ? 50 + stackCtx.activeCount * 10 : 50)

  /* ───────────────────────────────────────────────────────────── */
  /*  FOCUS MANAGEMENT                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isOpen) return

    previousActiveElement.current = document.activeElement as HTMLElement

    const timeout = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
      } else {
        const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        firstFocusable?.focus()
      }

      onAfterOpen?.()
    }, 100)

    return () => {
      clearTimeout(timeout)

      if (
        previousActiveElement.current &&
        typeof previousActiveElement.current.focus === 'function'
      ) {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen, initialFocusRef, onAfterOpen])

  /* ───────────────────────────────────────────────────────────── */
  /*  KEYBOARD HANDLERS                                            */
  /* ───────────────────────────────────────────────────────────── */

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        if (!stackCtx || stackCtx.topId === uniqueId) {
          onClose()
        }
        return
      }

      if (event.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (!first || !last) return

        if (event.shiftKey && document.activeElement === first) {
          last.focus()
          event.preventDefault()
        } else if (!event.shiftKey && document.activeElement === last) {
          first.focus()
          event.preventDefault()
        }
      }
    },
    [onClose, closeOnEscape, stackCtx, uniqueId]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  SCROLL LOCK + KEYBOARD LISTENERS                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)

      if (!disableScrollLock) {
        document.body.style.overflow = 'hidden'
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)

      if (!disableScrollLock) {
        document.body.style.overflow = ''
      }

      if (!isOpen) {
        onAfterClose?.()
      }
    }
  }, [isOpen, handleKeyDown, disableScrollLock, onAfterClose])

  /* ───────────────────────────────────────────────────────────── */
  /*  DRAG-TO-DISMISS (MOBILE)                                     */
  /* ───────────────────────────────────────────────────────────── */

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (dragToDismiss && info.offset.y > 100) {
        onClose()
      }
    },
    [dragToDismiss, onClose]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  ANIMATION VARIANTS                                           */
  /* ───────────────────────────────────────────────────────────── */

  const overlayVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  }

  const shouldAnimate = !prefersReducedMotion

  const modalVariants: Variants =
    animationVariant === 'spring'
      ? {
          hidden: { opacity: 0, scale: 0.96, y: 10 },
          visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: shouldAnimate
              ? { type: 'spring', damping: 28, stiffness: 300 }
              : { duration: 0 },
          },
          exit: {
            opacity: 0,
            scale: 0.96,
            y: 10,
            transition: shouldAnimate ? { duration: 0.15 } : { duration: 0 },
          },
        }
      : animationVariant === 'tween'
        ? {
            hidden: { opacity: 0, scale: 0.96 },
            visible: {
              opacity: 1,
              scale: 1,
              transition: shouldAnimate ? { duration: 0.2 } : { duration: 0 },
            },
            exit: {
              opacity: 0,
              scale: 0.96,
              transition: shouldAnimate ? { duration: 0.15 } : { duration: 0 },
            },
          }
        : animationVariant === 'fade'
          ? {
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: shouldAnimate ? { duration: 0.15 } : { duration: 0 },
              },
              exit: {
                opacity: 0,
                transition: shouldAnimate ? { duration: 0.1 } : { duration: 0 },
              },
            }
          : {
              hidden: { y: '100%' },
              visible: {
                y: 0,
                transition: shouldAnimate
                  ? { type: 'spring', damping: 30, stiffness: 300 }
                  : { duration: 0 },
              },
              exit: {
                y: '100%',
                transition: shouldAnimate ? { duration: 0.2 } : { duration: 0 },
              },
            }

  /* ───────────────────────────────────────────────────────────── */
  /*  BOTTOM SHEET MODE (MOBILE)                                   */
  /* ───────────────────────────────────────────────────────────── */

  const bottomSheetMode = isMobile && (dragToDismiss || showDragHandle)

  /* ───────────────────────────────────────────────────────────── */
  /*  MODAL CONTENT                                                */
  /* ───────────────────────────────────────────────────────────── */

  const modalContent = (
    <AnimatePresence>
      {isOpen ? (
        <div
          className="fixed inset-0 flex items-end justify-center p-0 md:items-center md:p-4"
          style={{ zIndex }}
        >
          {/* Overlay */}
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'absolute inset-0',
              lightBackdrop ? 'bg-overlay/30' : 'bg-overlay-strong',
              'backdrop-blur-sm',
              backdropClassName
            )}
            onClick={() => {
              if (closeOnOverlayClick) onClose()
            }}
          />

          {/* Modal container */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            aria-describedby={description ? 'modal-description' : undefined}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            drag={bottomSheetMode && !disableDrag ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className={cn(
              'relative flex w-full flex-col',
              'bg-surface border border-line shadow-card',
              'rounded-t-2xl md:rounded-2xl',
              accentBorderMap[resolvedAccent],
              bottomSheetMode
                ? 'max-w-full max-h-[92vh] rounded-b-none'
                : cn(
                    size in sizeMap ? sizeMap[size] : size,
                    'max-h-[92vh]'
                  ),
              className
            )}
          >
            {/* Drag handle (mobile bottom sheet) */}
            {bottomSheetMode && (showDragHandle || dragToDismiss) ? (
              <div className="flex cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing">
                {dragHandle ?? (
                  <div className="h-1.5 w-10 rounded-full bg-line-strong" />
                )}
              </div>
            ) : null}

            {/* Header */}
            {title || showCloseButton ? (
              <div
                className={cn(
                  'flex flex-shrink-0 items-start justify-between rounded-t-2xl px-6 pb-4 pt-5',
                  accentHeaderMap[resolvedAccent]
                )}
              >
                <div className="min-w-0 flex-1">
                  {title ? (
                    <h2
                      id="modal-title"
                      className={cn(
                        'text-lg font-semibold',
                        accentTitleMap[resolvedAccent]
                      )}
                    >
                      {title}
                    </h2>
                  ) : null}

                  {description ? (
                    <p
                      id="modal-description"
                      className="mt-1 text-sm text-fg-muted"
                    >
                      {description}
                    </p>
                  ) : null}
                </div>

                {showCloseButton ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className={cn(
                      'rounded-lg p-1.5 transition-colors',
                      'text-fg-muted hover:text-fg',
                      'hover:bg-muted',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                    )}
                    aria-label="Fermer la fenêtre"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Body */}
            <div
              className={cn(
                'flex-1 overflow-y-auto overscroll-contain px-6 py-5',
                bodyClassName
              )}
            >
              {children}
            </div>

            {/* Footer */}
            {footer || showFooterClose ? (
              <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-line px-6 py-4">
                {footer}

                {showFooterClose && !footer ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl bg-muted px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Fermer
                  </button>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  PORTAL RENDER                                                */
  /* ───────────────────────────────────────────────────────────── */

  if (portal && typeof document !== 'undefined') {
    return createPortal(modalContent, document.body)
  }

  return modalContent
}

export default Modal