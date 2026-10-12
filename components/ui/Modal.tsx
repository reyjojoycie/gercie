// components/ui/Modal.tsx
'use client'

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  createContext,
  useContext,
  ReactNode,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { X, GripHorizontal } from 'lucide-react'
import { AnimatePresence, motion, type Variants, type PanInfo } from 'framer-motion'

/* ========================================================================
   Hook : useMediaQuery (interne, sans dépendance externe)
   ======================================================================== */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

/* ========================================================================
   Contexte d'empilement des modales (z‑index dynamique)
   ======================================================================== */
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

function useModalStack() {
  const ctx = useContext(ModalStackContext)
  if (!ctx) throw new Error('ModalStackProvider manquant – enveloppez votre app dans <ModalStackProvider>')
  return ctx
}

export function ModalStackProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<ModalStackItem[]>([])

  const register = useCallback((id: string, close: () => void) => {
    setStack(prev => {
      if (prev.some(item => item.id === id)) return prev
      return [...prev, { id, close }]
    })
  }, [])

  const unregister = useCallback((id: string) => {
    setStack(prev => prev.filter(item => item.id !== id))
  }, [])

  const value: ModalStackContextValue = {
    register,
    unregister,
    activeCount: stack.length,
    topId: stack.length > 0 ? stack[stack.length - 1].id : null,
  }

  return <ModalStackContext.Provider value={value}>{children}</ModalStackContext.Provider>
}

/* ========================================================================
   Types & Variantes
   ======================================================================== */
type ModalSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full' | string
type ModalAccent =
  | 'brand'
  | 'accent'
  | 'warm'
  | 'luxury'
  | 'gold'
  | 'burgundy'
  | 'champagne'
  | 'rosegold'
  | 'teal'
  | 'copper'
  | 'plum'
  | 'neutral'
type AnimationVariant = 'spring' | 'tween' | 'fade' | 'slideUp'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  description?: string
  size?: ModalSize
  accent?: ModalAccent
  showCloseButton?: boolean
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  className?: string
  bodyClassName?: string
  footer?: React.ReactNode
  showFooterClose?: boolean
  zIndex?: number
  /** Identifiant unique pour l'empilement (utilisé avec ModalStackProvider) */
  modalId?: string
  /** Callback après ouverture complète */
  onAfterOpen?: () => void
  /** Callback après fermeture complète */
  onAfterClose?: () => void
  /** Désactive le verrouillage du scroll */
  disableScrollLock?: boolean
  /** Rendu en portail (dans document.body) */
  portal?: boolean
  /** Ref à un élément à focaliser à l'ouverture */
  initialFocusRef?: React.RefObject<HTMLElement>
  /** Passe le backdrop en version claire */
  lightBackdrop?: boolean
  /** Classe additionnelle pour le backdrop */
  backdropClassName?: string
  /** Variante d'animation */
  animationVariant?: AnimationVariant
  /** Affiche une poignée de drag en version mobile */
  showDragHandle?: boolean
  /** Désactive le drag-to-dismiss sur mobile */
  disableDrag?: boolean
  /** Ferme la modale si on glisse vers le bas (mobile) */
  dragToDismiss?: boolean
  /** Contenu de la poignée personnalisé */
  dragHandle?: ReactNode
}

/* ------------------------------------------------------------------ */
/*  Dictionnaires de styles                                            */
/* ------------------------------------------------------------------ */
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

const accentBorderMap: Record<ModalAccent, string> = {
  brand: 'border-t-brand-500',
  accent: 'border-t-accent-500',
  warm: 'border-t-warm-500',
  luxury: 'border-t-luxury-500',
  gold: 'border-t-gold-400',
  burgundy: 'border-t-burgundy-500',
  champagne: 'border-t-champagne-500',
  rosegold: 'border-t-rosegold-500',
  teal: 'border-t-teal-500',
  copper: 'border-t-copper-500',
  plum: 'border-t-plum-500',
  neutral: '',
}

const accentHeaderMap: Record<ModalAccent, string> = {
  brand: 'bg-brand-50/30 dark:bg-brand-900/10',
  accent: 'bg-accent-50/30 dark:bg-accent-900/10',
  warm: 'bg-warm-50/30 dark:bg-warm-900/10',
  luxury: 'bg-luxury-50/30 dark:bg-luxury-900/10',
  gold: 'bg-gold-50/30 dark:bg-gold-900/10',
  burgundy: 'bg-burgundy-50/30 dark:bg-burgundy-900/10',
  champagne: 'bg-champagne-50/30 dark:bg-champagne-900/10',
  rosegold: 'bg-rosegold-50/30 dark:bg-rosegold-900/10',
  teal: 'bg-teal-50/30 dark:bg-teal-900/10',
  copper: 'bg-copper-50/30 dark:bg-copper-900/10',
  plum: 'bg-plum-50/30 dark:bg-plum-900/10',
  neutral: '',
}

const accentTitleMap: Record<ModalAccent, string> = {
  brand: 'text-brand-800 dark:text-brand-300',
  accent: 'text-accent-800 dark:text-accent-300',
  warm: 'text-warm-800 dark:text-warm-300',
  luxury: 'text-luxury-800 dark:text-luxury-300',
  gold: 'text-gold-800 dark:text-gold-300',
  burgundy: 'text-burgundy-800 dark:text-burgundy-300',
  champagne: 'text-champagne-800 dark:text-champagne-300',
  rosegold: 'text-rosegold-800 dark:text-rosegold-300',
  teal: 'text-teal-800 dark:text-teal-300',
  copper: 'text-copper-800 dark:text-copper-300',
  plum: 'text-plum-800 dark:text-plum-300',
  neutral: 'text-neutral-900 dark:text-neutral-100',
}

/* ------------------------------------------------------------------ */
/*  Composant Modal                                                   */
/* ------------------------------------------------------------------ */

const Modal = ({
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
}: ModalProps) => {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const uniqueId = useRef(modalId ?? `modal-${Math.random().toString(36).substr(2, 9)}`).current

  // Gestion de la pile de modales (si le provider existe)
  const stackCtx = useContext(ModalStackContext)
  useEffect(() => {
    if (!stackCtx || !isOpen) return
    stackCtx.register(uniqueId, onClose)
    return () => stackCtx.unregister(uniqueId)
  }, [stackCtx, isOpen, onClose, uniqueId])

  // z-index calculé (priorité : prop > stack > défaut)
  const zIndex = zIndexProp ?? (stackCtx ? 50 + stackCtx.activeCount * 10 : 50)

  // Focus piège
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
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen, initialFocusRef, onAfterOpen])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        // Ne ferme que si c'est la modale la plus haute
        if (!stackCtx || stackCtx.topId === uniqueId) {
          onClose()
        }
        return
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) return
        if (e.shiftKey && document.activeElement === first) {
          last.focus()
          e.preventDefault()
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus()
          e.preventDefault()
        }
      }
    },
    [onClose, closeOnEscape, stackCtx, uniqueId]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      if (!disableScrollLock) document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (!disableScrollLock) document.body.style.overflow = ''
      if (!isOpen) onAfterClose?.()
    }
  }, [isOpen, handleKeyDown, disableScrollLock, onAfterClose])

  // Gestion du drag-to-dismiss sur mobile
  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      if (dragToDismiss && info.offset.y > 100) {
        onClose()
      }
    },
    [dragToDismiss, onClose]
  )

  // Animation variants
  const overlayVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  }

  const modalVariants: Variants =
    animationVariant === 'spring'
      ? {
          hidden: { opacity: 0, scale: 0.96, y: 10 },
          visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 28, stiffness: 300 } },
          exit: { opacity: 0, scale: 0.96, y: 10, transition: { duration: 0.15 } },
        }
      : animationVariant === 'tween'
        ? {
            hidden: { opacity: 0, scale: 0.96 },
            visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
            exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
          }
        : animationVariant === 'fade'
          ? {
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { duration: 0.15 } },
              exit: { opacity: 0, transition: { duration: 0.1 } },
            }
          : // slideUp (utilisé en mode mobile)
            {
              hidden: { y: '100%' },
              visible: { y: 0, transition: { type: 'spring', damping: 30, stiffness: 300 } },
              exit: { y: '100%', transition: { duration: 0.2 } },
            }

  // Pour mobile : on utilise un bottom sheet si demandé
  const bottomSheetMode = isMobile && (dragToDismiss || showDragHandle)

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-end md:items-center justify-center p-0 md:p-4" style={{ zIndex }}>
          {/* Overlay */}
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'absolute inset-0',
              lightBackdrop ? 'bg-black/30' : 'bg-black/50',
              'backdrop-blur-sm',
              backdropClassName
            )}
            onClick={() => closeOnOverlayClick && onClose()}
          />

          {/* Conteneur de la modale */}
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
              'relative w-full bg-white dark:bg-neutral-900 rounded-t-2xl md:rounded-2xl shadow-strong border border-neutral-100 dark:border-neutral-700 flex flex-col',
              accent !== 'neutral' && 'border-t-4',
              accentBorderMap[accent],
              bottomSheetMode
                ? 'max-w-full max-h-[92vh] rounded-b-none'
                : cn(
                    size in sizeMap ? sizeMap[size] : size, // custom class string
                    'max-h-[92vh]'
                  ),
              className
            )}
          >
            {/* Poignée de drag (mobile bottom sheet) */}
            {bottomSheetMode && (showDragHandle || dragToDismiss) && (
              <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
                {dragHandle || (
                  <div className="w-10 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                )}
              </div>
            )}

            {/* Header */}
            {(title || showCloseButton) && (
              <div
                className={cn(
                  'flex items-start justify-between px-6 pt-5 pb-4 rounded-t-2xl flex-shrink-0',
                  accentHeaderMap[accent]
                )}
              >
                <div>
                  {title && (
                    <h2
                      id="modal-title"
                      className={cn('text-lg font-semibold', accentTitleMap[accent])}
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id="modal-description" className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {description}
                    </p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className={cn(
                      'rounded-lg p-1.5 transition-colors',
                      'text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300',
                      'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                      accent !== 'neutral' && [
                        'hover:bg-opacity-50',
                        accent === 'brand' && 'hover:text-brand-700 dark:hover:text-brand-300',
                        accent === 'accent' && 'hover:text-accent-700 dark:hover:text-accent-300',
                        accent === 'warm' && 'hover:text-warm-700 dark:hover:text-warm-300',
                        accent === 'luxury' && 'hover:text-luxury-700 dark:hover:text-luxury-300',
                        accent === 'gold' && 'hover:text-gold-700 dark:hover:text-gold-300',
                      ]
                    )}
                    aria-label="Fermer la fenêtre"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}

            {/* Corps */}
            <div className={cn('px-6 py-5 overflow-y-auto overscroll-contain flex-1', bodyClassName)}>
              {children}
            </div>

            {/* Footer */}
            {(footer || showFooterClose) && (
              <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-end gap-3 flex-shrink-0">
                {footer}
                {showFooterClose && !footer && (
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-sm font-medium"
                  >
                    Fermer
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )

  // Rendu via portail si demandé (et côté client uniquement)
  if (portal && typeof document !== 'undefined') {
    return createPortal(modalContent, document.body)
  }

  return modalContent
}

export { Modal }