// components/ui/Dropdown.tsx
'use client'

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useMemo,
  useId,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence, type Variants } from 'framer-motion'

/* ========================================================================
   Contexte d'empilement des dropdowns (pour la navigation en cascade)
   ======================================================================== */
interface DropdownStackContextValue {
  activeMenuId: string | null
  setActiveMenuId: (id: string | null) => void
  closeAll: () => void
}

const DropdownStackContext = createContext<DropdownStackContextValue>({
  activeMenuId: null,
  setActiveMenuId: () => {},
  closeAll: () => {},
})

export const DropdownStackProvider = ({ children }: { children: ReactNode }) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const closeAll = useCallback(() => setActiveMenuId(null), [])
  const value = useMemo(
    () => ({ activeMenuId, setActiveMenuId, closeAll }),
    [activeMenuId]
  )
  return (
    <DropdownStackContext.Provider value={value}>
      {children}
    </DropdownStackContext.Provider>
  )
}

const useDropdownStack = () => useContext(DropdownStackContext)

/* ========================================================================
   Types
   ======================================================================== */
type DropdownSide = 'bottom' | 'top' | 'left' | 'right' | 'auto'
type DropdownAlign = 'start' | 'center' | 'end'
type TriggerMode = 'click' | 'hover'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  /** Alignement horizontal (mappé sur sideAlign) */
  align?: 'left' | 'right'
  /** Côté d'ouverture préféré */
  side?: DropdownSide
  /** Alignement le long de l'axe principal */
  sideAlign?: DropdownAlign
  className?: string
  /** Contrôle externe de l'état ouvert */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  /** Mode de déclenchement */
  triggerMode?: TriggerMode
  /** Délai avant fermeture en mode hover (ms) */
  closeDelay?: number
  /** Largeur minimale du menu */
  minWidth?: number
  /** Identifiant unique pour la pile de dropdowns */
  menuId?: string
  /** Passe le contenu en portail */
  portal?: boolean
  /** Rendu en tant que <li> à l'intérieur d'un menu */
  asChild?: boolean
  /** Callback après ouverture */
  onOpen?: () => void
  /** Callback après fermeture */
  onClose?: () => void
}

/* ========================================================================
   Sous-composants (inchangés)
   ======================================================================== */
// --- DropdownItem ---
interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  icon?: ReactNode
  shortcut?: string
  destructive?: boolean
  description?: string
}

const DropdownItem = forwardRef<HTMLButtonElement, DropdownItemProps>(
  (
    { children, onClick, disabled, className, icon, shortcut, destructive, description, ...rest },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={cn(
          'w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors rounded-lg mx-1',
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : destructive
              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-midnight-700/60',
          className
        )}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        role="menuitem"
      >
        {icon && (
          <span className="w-5 h-5 flex-shrink-0 text-neutral-400 dark:text-neutral-500">
            {icon}
          </span>
        )}
        <div className="flex-1">
          <span>{children}</span>
          {description && (
            <p className="text-xs text-neutral-400 mt-0.5 leading-tight">{description}</p>
          )}
        </div>
        {shortcut && (
          <kbd className="ml-auto text-xs text-neutral-400 font-mono tracking-wider bg-neutral-100 dark:bg-midnight-700 px-1.5 py-0.5 rounded-md">
            {shortcut}
          </kbd>
        )}
      </button>
    )
  }
)
DropdownItem.displayName = 'DropdownItem'

// --- DropdownCheckboxItem ---
interface DropdownCheckboxItemProps {
  children: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  icon?: ReactNode
  description?: string
}

const DropdownCheckboxItem = ({
  children,
  checked,
  onCheckedChange,
  disabled,
  className,
  icon,
  description,
}: DropdownCheckboxItemProps) => {
  return (
    <button
      type="button"
      className={cn(
        'w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors rounded-lg mx-1',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-midnight-700/60',
        className
      )}
      onClick={() => onCheckedChange(!checked)}
      disabled={disabled}
      role="menuitemcheckbox"
      aria-checked={checked}
    >
      <span
        className={cn(
          'w-5 h-5 flex-shrink-0 flex items-center justify-center',
          checked ? 'text-gold-500' : 'text-neutral-400'
        )}
      >
        {checked ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          icon || <div className="w-5 h-5 rounded border border-neutral-300 dark:border-neutral-600" />
        )}
      </span>
      <div className="flex-1">
        <span>{children}</span>
        {description && (
          <p className="text-xs text-neutral-400 mt-0.5 leading-tight">{description}</p>
        )}
      </div>
    </button>
  )
}

// --- DropdownRadioItem ---
interface DropdownRadioItemProps {
  children: ReactNode
  value: string
  checked: boolean
  onSelect: (value: string) => void
  disabled?: boolean
  className?: string
  icon?: ReactNode
  description?: string
}

const DropdownRadioItem = ({
  children,
  value,
  checked,
  onSelect,
  disabled,
  className,
  icon,
  description,
}: DropdownRadioItemProps) => {
  return (
    <button
      type="button"
      className={cn(
        'w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors rounded-lg mx-1',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-midnight-700/60',
        className
      )}
      onClick={() => onSelect(value)}
      disabled={disabled}
      role="menuitemradio"
      aria-checked={checked}
    >
      <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
        <span
          className={cn(
            'w-4 h-4 rounded-full border-2 flex items-center justify-center',
            checked
              ? 'border-gold-500'
              : 'border-neutral-300 dark:border-neutral-600'
          )}
        >
          {checked && <span className="w-2 h-2 rounded-full bg-gold-500" />}
        </span>
      </span>
      <div className="flex-1">
        <span>{children}</span>
        {description && (
          <p className="text-xs text-neutral-400 mt-0.5 leading-tight">{description}</p>
        )}
      </div>
    </button>
  )
}

// --- DropdownSub ---
interface DropdownSubProps {
  trigger: ReactNode
  children: ReactNode
  disabled?: boolean
  className?: string
  side?: 'right' | 'left' | 'bottom' | 'top'
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const DropdownSub = ({
  trigger,
  children,
  disabled,
  className,
  side = 'right',
  align = 'start',
  open: controlledOpen,
  onOpenChange,
}: DropdownSubProps) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const subRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const open = useCallback(() => {
    if (disabled) return
    if (controlledOpen === undefined) setInternalOpen(true)
    onOpenChange?.(true)
  }, [disabled, controlledOpen, onOpenChange])

  const close = useCallback(() => {
    if (controlledOpen === undefined) setInternalOpen(false)
    onOpenChange?.(false)
  }, [controlledOpen, onOpenChange])

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current!)
    open()
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(close, 150)
  }

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current!)
  }, [])

  const subPositionClasses: Record<string, Record<string, string>> = {
    right: {
      start: 'left-full top-0 ml-2',
      center: 'left-full top-1/2 -translate-y-1/2 ml-2',
      end: 'left-full bottom-0 ml-2',
    },
    left: {
      start: 'right-full top-0 mr-2',
      center: 'right-full top-1/2 -translate-y-1/2 mr-2',
      end: 'right-full bottom-0 mr-2',
    },
    bottom: {
      start: 'top-full left-0 mt-2',
      center: 'top-full left-1/2 -translate-x-1/2 mt-2',
      end: 'top-full right-0 mt-2',
    },
    top: {
      start: 'bottom-full left-0 mb-2',
      center: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
      end: 'bottom-full right-0 mb-2',
    },
  }

  return (
    <div
      ref={subRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(
          'w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors rounded-lg mx-1',
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-midnight-700/60',
          className
        )}
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {trigger}
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-[60] min-w-[14rem] rounded-xl bg-white dark:bg-midnight-800/90 backdrop-blur-xl shadow-strong border border-neutral-200/60 dark:border-midnight-500/30 py-1',
              subPositionClasses[side]?.[align]
            )}
            role="menu"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// --- DropdownSeparator ---
const DropdownSeparator = () => (
  <div className="my-1 border-t border-neutral-200 dark:border-midnight-500/30 mx-2" />
)

// --- DropdownLabel ---
const DropdownLabel = ({ children }: { children: ReactNode }) => (
  <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
    {children}
  </p>
)

/* ========================================================================
   Composant Dropdown principal (corrigé)
   ======================================================================== */
const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
  (
    {
      trigger,
      children,
      align = 'left',
      side = 'bottom',
      sideAlign: sideAlignProp,
      className,
      open: controlledOpen,
      onOpenChange,
      disabled = false,
      triggerMode = 'click',
      closeDelay = 300,
      minWidth,
      menuId: menuIdProp,
      portal = true,
      onOpen,
      onClose,
    },
    ref
  ) => {
    const generatedId = useId()
    const menuId = menuIdProp || `dropdown-menu-${generatedId}`

    const stackCtx = useDropdownStack()
    const [internalOpen, setInternalOpen] = useState(false)
    const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen

    const dropdownRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLDivElement>(null)
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)

    // ---- CORRECTION : éviter document.body pendant le SSR ----
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])
    // -----------------------------------------------------------

    const effectiveSideAlign = sideAlignProp ?? (align === 'left' ? 'start' : 'end')
    const [autoSide, setAutoSide] = useState<Exclude<DropdownSide, 'auto'>>(
      side === 'auto' ? 'bottom' : side
    )
    const [autoAlign, setAutoAlign] = useState<DropdownAlign>(effectiveSideAlign)

    const open = useCallback(() => {
      if (disabled) return
      clearTimeout(timeoutRef.current!)
      if (controlledOpen === undefined) setInternalOpen(true)
      onOpenChange?.(true)
      stackCtx?.setActiveMenuId(menuId)
      onOpen?.()
    }, [disabled, controlledOpen, onOpenChange, stackCtx, menuId, onOpen])

    const close = useCallback(() => {
      clearTimeout(timeoutRef.current!)
      if (controlledOpen === undefined) setInternalOpen(false)
      onOpenChange?.(false)
      if (stackCtx?.activeMenuId === menuId) stackCtx.setActiveMenuId(null)
      onClose?.()
    }, [controlledOpen, onOpenChange, stackCtx, menuId, onClose])

    // Fermeture si un autre dropdown de même pile s'ouvre
    useEffect(() => {
      if (stackCtx && isOpen && stackCtx.activeMenuId !== menuId) {
        close()
      }
    }, [stackCtx, isOpen, menuId, close])

    // Clic extérieur
    useEffect(() => {
      if (!isOpen) return
      const handleClickOutside = (e: globalThis.MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node) &&
          menuRef.current &&
          !menuRef.current.contains(e.target as Node)
        ) {
          close()
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen, close])

    // Échap
    useEffect(() => {
      if (!isOpen) return
      const handleEscape = (e: globalThis.KeyboardEvent) => {
        if (e.key === 'Escape') close()
      }
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, close])

    // Navigation clavier
    useEffect(() => {
      if (!isOpen || !menuRef.current) return
      const handleKeyDown = (e: globalThis.KeyboardEvent) => {
        const items = menuRef.current!.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled]), [role="menuitemradio"]:not([disabled])'
        )
        const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLElement)

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const next = currentIndex + 1 < items.length ? currentIndex + 1 : 0
          items[next]?.focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          const next = currentIndex - 1 >= 0 ? currentIndex - 1 : items.length - 1
          items[next]?.focus()
        } else if (e.key === 'Home') {
          e.preventDefault()
          items[0]?.focus()
        } else if (e.key === 'End') {
          e.preventDefault()
          items[items.length - 1]?.focus()
        }
      }
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen])

    // Positionnement automatique (side = 'auto')
    useEffect(() => {
      if (side !== 'auto' || !isOpen || !triggerRef.current || !menuRef.current) return

      const triggerRect = triggerRef.current.getBoundingClientRect()
      const menuRect = menuRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      let bestVertical: 'top' | 'bottom' = 'bottom'
      if (triggerRect.bottom + menuRect.height > vh && triggerRect.top - menuRect.height > 0) {
        bestVertical = 'top'
      }
      let bestHorizontal: 'left' | 'right' = 'left'
      if (triggerRect.left + menuRect.width > vw && triggerRect.right - menuRect.width > 0) {
        bestHorizontal = 'right'
      }

      setAutoSide(bestVertical)
      let newAlign: DropdownAlign = 'start'
      if (bestHorizontal === 'right') {
        const spaceRightEdge = vw - triggerRect.right
        if (spaceRightEdge < menuRect.width && triggerRect.left > menuRect.width) {
          newAlign = 'end'
        }
      } else {
        const spaceLeftEdge = triggerRect.left
        if (spaceLeftEdge < menuRect.width && vw - triggerRect.right > menuRect.width) {
          newAlign = 'end'
        }
      }
      setAutoAlign(newAlign)
    }, [isOpen, side])

    const effectiveSide = side === 'auto' ? autoSide : side
    const effectiveAlign = side === 'auto' ? autoAlign : effectiveSideAlign

    const positionClasses: Record<string, Record<string, string>> = {
      bottom: {
        start: 'top-full left-0 mt-2',
        center: 'top-full left-1/2 -translate-x-1/2 mt-2',
        end: 'top-full right-0 mt-2',
      },
      top: {
        start: 'bottom-full left-0 mb-2',
        center: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        end: 'bottom-full right-0 mb-2',
      },
      left: {
        start: 'right-full top-0 mr-2',
        center: 'right-full top-1/2 -translate-y-1/2 mr-2',
        end: 'right-full bottom-0 mr-2',
      },
      right: {
        start: 'left-full top-0 ml-2',
        center: 'left-full top-1/2 -translate-y-1/2 ml-2',
        end: 'left-full bottom-0 ml-2',
      },
    }

    const animationVariants: Variants = {
      hidden: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
      visible: {
        opacity: 1,
        scale: 1,
        transition: { type: 'spring', stiffness: 400, damping: 25 },
      },
      exit: { opacity: 0, scale: 0.95, transition: { duration: 0.1 } },
    }

    const triggerEvents =
      triggerMode === 'hover'
        ? {
            onMouseEnter: open,
            onMouseLeave: () => {
              timeoutRef.current = setTimeout(close, closeDelay)
            },
          }
        : {
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation()
              if (isOpen) close()
              else open()
            },
          }

    const menuContent = (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            id={menuId}
            variants={animationVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'absolute z-50 min-w-[12rem] rounded-xl bg-white dark:bg-midnight-800/90 backdrop-blur-xl shadow-strong border border-neutral-200/60 dark:border-midnight-500/30 py-1',
              positionClasses[effectiveSide]?.[effectiveAlign]
            )}
            style={{ minWidth }}
            role="menu"
            aria-orientation="vertical"
            onMouseEnter={triggerMode === 'hover' ? () => clearTimeout(timeoutRef.current!) : undefined}
            onMouseLeave={triggerMode === 'hover' ? () => { timeoutRef.current = setTimeout(close, closeDelay) } : undefined}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    )

    return (
      <div
        ref={dropdownRef}
        className={cn('relative inline-block', className)}
      >
        <div
          ref={triggerRef}
          {...triggerEvents}
          className={cn('cursor-pointer select-none', disabled && 'pointer-events-none opacity-60')}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-controls={menuId}
        >
          {trigger}
        </div>
        {/* ---- Utilisation du portal uniquement après le montage côté client ---- */}
        {portal && mounted ? createPortal(menuContent, document.body) : menuContent}
      </div>
    )
  }
)
Dropdown.displayName = 'Dropdown'

export {
  Dropdown,
  DropdownItem,
  DropdownCheckboxItem,
  DropdownRadioItem,
  DropdownSub,
  DropdownSeparator,
  DropdownLabel,
}