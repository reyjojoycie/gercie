// components/navbar/NavbarMegaMenu.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'

import Link from 'next/link'

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'

import { cn } from '@/lib/utils'

import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Loader2,
  Menu,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type MegaMenuBadgeVariant =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  // Legacy compatibility
  | 'gold'
  | 'warm'
  | 'burgundy'

export interface MegaMenuCategory {
  id: string
  name: string
  icon?: React.ReactNode
  href: string
  description?: string
  badge?: string | number
  badgeVariant?: MegaMenuBadgeVariant
  children?: MegaMenuCategory[]
  featured?: boolean
}

export interface NavbarMegaMenuProps {
  /** Catégories affichées dans le méga-menu */
  categories?: MegaMenuCategory[]

  /** État contrôlé depuis Navbar.tsx */
  open?: boolean

  /** Callback pour ouvrir/fermer le méga-menu */
  onOpenChange?: (open: boolean) => void

  /** Callback appelé quand un lien interne au méga-menu est cliqué */
  onLinkClick?: () => void

  /** Nombre de colonnes du grid principal */
  columns?: 3 | 4 | 5

  /** Classes additionnelles */
  className?: string

  /** Libellé du bouton déclencheur */
  label?: string

  /** Mode compact : affiche uniquement l’icône */
  compact?: boolean

  /** Délai avant fermeture au survol, en ms */
  hoverDelay?: number

  /** État de chargement */
  isLoading?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BADGE TOKENS                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const badgeStyles: Record<
  Exclude<MegaMenuBadgeVariant, 'gold' | 'warm' | 'burgundy'>,
  string
> = {
  accent: 'bg-accent-soft text-accent border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  neutral: 'bg-muted text-fg-muted border-line',
}

function normalizeBadgeVariant(
  variant?: MegaMenuBadgeVariant
): keyof typeof badgeStyles {
  switch (variant) {
    case 'gold':
    case 'accent':
      return 'accent'

    case 'warm':
    case 'warning':
      return 'warning'

    case 'burgundy':
    case 'danger':
      return 'danger'

    case 'success':
      return 'success'

    case 'neutral':
    default:
      return 'neutral'
  }
}

function MegaMenuBadge({
  children,
  variant = 'neutral',
}: {
  children?: React.ReactNode
  variant?: MegaMenuBadgeVariant
}) {
  if (children === undefined || children === null || children === '') return null

  const normalized = normalizeBadgeVariant(variant)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border px-2 py-0.5',
        'text-[10px] font-bold leading-none',
        badgeStyles[normalized]
      )}
    >
      {children}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LAYOUT MAPS                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const panelWidthMap: Record<3 | 4 | 5, string> = {
  3: 'w-[min(820px,calc(100vw-2rem))]',
  4: 'w-[min(1040px,calc(100vw-2rem))]',
  5: 'w-[min(1240px,calc(100vw-2rem))]',
}

const subGridMap: Record<3 | 4 | 5, string> = {
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SKELETON                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function MegaMenuSkeleton({ columns }: { columns: 3 | 4 | 5 }) {
  return (
    <div className="flex min-h-[20rem]">
      <div className="hidden w-64 shrink-0 border-r border-line p-3 md:block lg:w-72">
        <ul className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <li key={`mega-skeleton-main-${index}`}>
              <div className="skeleton h-10 w-full rounded-control" />
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 flex-1 p-5">
        <div
          className={cn(
            'grid gap-3',
            subGridMap[columns]
          )}
        >
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`mega-skeleton-card-${index}`}
              className="rounded-control border border-line bg-muted p-4"
            >
              <div className="flex items-start gap-3">
                <div className="skeleton h-9 w-9 shrink-0 rounded-lg" />

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded-full" />
                  <div className="skeleton h-3 w-1/2 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN CATEGORY BUTTON                                           */
/* ═══════════════════════════════════════════════════════════════ */

interface MainCategoryButtonProps {
  category: MegaMenuCategory
  isActive: boolean
  onSelect: (id: string) => void
}

function MainCategoryButton({
  category,
  isActive,
  onSelect,
}: MainCategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(category.id)}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'group flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm',
        'transition-colors duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        isActive
          ? 'bg-accent-soft text-accent'
          : 'text-fg hover:bg-muted hover:text-fg'
      )}
    >
      {category.icon && (
        <span
          className="w-5 shrink-0 text-current"
          aria-hidden="true"
        >
          {category.icon}
        </span>
      )}

      <span className="min-w-0 flex-1 truncate font-medium">
        {category.name}
      </span>

      {category.badge && (
        <MegaMenuBadge variant={category.badgeVariant}>
          {category.badge}
        </MegaMenuBadge>
      )}

      {Boolean(category.children?.length) && (
        <ChevronRight
          size={14}
          className={cn(
            'shrink-0 transition-transform duration-200',
            isActive && 'translate-x-0.5'
          )}
          aria-hidden="true"
        />
      )}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUBCATEGORY CARD                                               */
/* ═══════════════════════════════════════════════════════════════ */

interface SubCategoryCardProps {
  category: MegaMenuCategory
  onLinkClick?: () => void
}

function SubCategoryCard({
  category,
  onLinkClick,
}: SubCategoryCardProps) {
  return (
    <Link
      href={category.href}
      onClick={onLinkClick}
      className={cn(
        'group flex items-start gap-3 rounded-control border border-transparent p-3',
        'transition-all duration-200 ease-out',
        'hover:border-line hover:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
      )}
    >
      {category.icon && (
        <span
          className="mt-0.5 w-5 shrink-0 text-fg-muted transition-colors duration-200 group-hover:text-accent"
          aria-hidden="true"
        >
          {category.icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm font-semibold text-fg',
            'transition-colors duration-200 group-hover:text-accent'
          )}
        >
          {category.name}
        </span>

        {category.description && (
          <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-fg-muted">
            {category.description}
          </span>
        )}
      </span>

      {category.badge && (
        <MegaMenuBadge variant={category.badgeVariant}>
          {category.badge}
        </MegaMenuBadge>
      )}
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  EMPTY ACTIVE STATE                                             */
/* ═══════════════════════════════════════════════════════════════ */

function EmptyActiveState({
  category,
  onLinkClick,
}: {
  category: MegaMenuCategory | null
  onLinkClick?: () => void
}) {
  if (!category) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center p-8 text-center">
        <p className="text-sm text-fg-muted">
          Aucune catégorie disponible pour le moment.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[16rem] flex-col items-start justify-center gap-5 rounded-control border border-line bg-muted p-6">
      <div className="flex items-start gap-4">
        {category.icon && (
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-accent shadow-card"
            aria-hidden="true"
          >
            {category.icon}
          </span>
        )}

        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight text-fg">
            {category.name}
          </p>

          {category.description && (
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-fg-muted">
              {category.description}
            </p>
          )}
        </div>
      </div>

      <Link
        href={category.href}
        onClick={onLinkClick}
        className={cn(
          'inline-flex h-10 items-center justify-center gap-2 rounded-control',
          'bg-accent px-4 text-sm font-semibold text-accent-contrast shadow-card',
          'transition-colors duration-200 ease-out hover:bg-accent-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
        )}
      >
        Explorer {category.name}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarMegaMenu({
  categories = [],
  open: controlledOpen,
  onOpenChange,
  onLinkClick,
  columns = 4,
  className,
  label = 'Catalogue',
  compact = false,
  hoverDelay = 180,
  isLoading = false,
}: NavbarMegaMenuProps) {
  const prefersReducedMotion = useReducedMotion()
  const panelId = useId()

  const containerRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen ?? internalOpen

  const [activeId, setActiveId] = useState<string | null>(null)

  const safeCategories = useMemo(
    () => (Array.isArray(categories) ? categories : []),
    [categories]
  )

  const activeCategory = useMemo(() => {
    if (safeCategories.length === 0) return null

    return (
      safeCategories.find((category) => category.id === activeId) ??
      safeCategories[0] ??
      null
    )
  }, [activeId, safeCategories])

  /* ───────────────────────────────────────────────────────────── */
  /*  OPEN / CLOSE CONTROL                                         */
  /* ───────────────────────────────────────────────────────────── */

  const setOpen = useCallback(
    (next: boolean) => {
      if (typeof onOpenChange === 'function') {
        onOpenChange(next)
      } else {
        setInternalOpen(next)
      }
    },
    [onOpenChange]
  )

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()

    closeTimerRef.current = setTimeout(() => {
      setOpen(false)
    }, Math.max(0, hoverDelay))
  }, [clearCloseTimer, hoverDelay, setOpen])

  const toggleMenu = useCallback(() => {
    clearCloseTimer()
    setOpen(!isOpen)
  }, [clearCloseTimer, isOpen, setOpen])

  const handleMouseEnter = useCallback(() => {
    // En mode contrôlé, on évite le hover automatique pour ne pas entrer
    // en conflit avec la logique de Navbar.tsx.
    if (controlledOpen !== undefined) return

    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer, controlledOpen, setOpen])

  const handleMouseLeave = useCallback(() => {
    if (controlledOpen !== undefined) return

    scheduleClose()
  }, [controlledOpen, scheduleClose])

  const handleLinkClick = useCallback(() => {
    clearCloseTimer()
    setOpen(false)
    onLinkClick?.()
  }, [clearCloseTimer, onLinkClick, setOpen])

  /* ───────────────────────────────────────────────────────────── */
  /*  ACTIVE CATEGORY SYNC                                         */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isOpen) return

    const hasActive =
      activeId !== null &&
      safeCategories.some((category) => category.id === activeId)

    if (!hasActive) {
      setActiveId(safeCategories[0]?.id ?? null)
    }
  }, [activeId, isOpen, safeCategories])

  /* ───────────────────────────────────────────────────────────── */
  /*  OUTSIDE CLICK + ESCAPE                                       */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null

      if (!target) return
      if (containerRef.current?.contains(target)) return

      setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, setOpen])

  useEffect(() => {
    return () => {
      clearCloseTimer()
    }
  }, [clearCloseTimer])

  /* ───────────────────────────────────────────────────────────── */
  /*  MOTION                                                       */
  /* ───────────────────────────────────────────────────────────── */

  const panelMotion = prefersReducedMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 8, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 8, scale: 0.98 },
        transition: { duration: 0.18, ease: 'easeOut' as const },
      }

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={toggleMenu}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls={panelId}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-control border px-3 text-sm font-medium',
          'transition-all duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          isOpen
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-line bg-surface text-fg hover:border-line-strong hover:bg-raised',
          compact && 'px-2.5'
        )}
      >
        <Menu
          size={18}
          strokeWidth={1.9}
          aria-hidden="true"
        />

        {!compact && (
          <span className="hidden xl:inline">{label}</span>
        )}

        <ChevronDown
          size={14}
          className={cn(
            'hidden text-fg-subtle transition-transform duration-200 xl:block',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label={label}
            {...panelMotion}
            className={cn(
              'absolute left-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-line bg-surface text-fg',
              'shadow-overlay',
              panelWidthMap[columns]
            )}
          >
            {/* ====================================================
                PANEL HEADER
               ==================================================== */}
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                {label}
              </p>

              <div className="flex items-center gap-2">
                <Link
                  href="/categories"
                  onClick={handleLinkClick}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
                    'text-xs font-semibold text-accent',
                    'transition-colors duration-200 hover:bg-accent-soft hover:text-accent-hover',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
                  )}
                >
                  Toutes les catégories
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-lg',
                    'text-fg-subtle transition-colors duration-200',
                    'hover:bg-muted hover:text-fg',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    'md:hidden'
                  )}
                  aria-label="Fermer le catalogue"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* ====================================================
                PANEL BODY
               ==================================================== */}
            {isLoading ? (
              <MegaMenuSkeleton columns={columns} />
            ) : safeCategories.length === 0 ? (
              <div className="flex min-h-[16rem] items-center justify-center p-8 text-center">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-fg">
                    Aucune catégorie disponible
                  </p>
                  <p className="text-xs text-fg-muted">
                    Revenez bientôt pour découvrir notre catalogue.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[20rem]">
                {/* ================================================
                    LEFT SIDEBAR — DESKTOP
                   ================================================ */}
                <div className="hidden w-64 shrink-0 border-r border-line p-3 md:block lg:w-72">
                  <ul className="max-h-[24rem] space-y-1 overflow-y-auto pr-1 scrollbar-hide">
                    {safeCategories.map((category) => (
                      <li key={category.id}>
                        <MainCategoryButton
                          category={category}
                          isActive={activeCategory?.id === category.id}
                          onSelect={setActiveId}
                        />
                      </li>
                    ))}
                  </ul>
                </div>

                {/* ================================================
                    RIGHT CONTENT
                   ================================================ */}
                <div className="min-w-0 flex-1 p-4 sm:p-5">
                  {/* Mobile / tablette within panel : chips horizontales */}
                  <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide md:hidden">
                    {safeCategories.map((category) => {
                      const isActive = activeCategory?.id === category.id

                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => setActiveId(category.id)}
                          className={cn(
                            'inline-flex h-9 shrink-0 items-center gap-2 rounded-pill border px-3 text-xs font-semibold',
                            'transition-colors duration-200 ease-out',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                            'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                            isActive
                              ? 'border-accent bg-accent-soft text-accent'
                              : 'border-line bg-surface text-fg-muted hover:bg-muted hover:text-fg'
                          )}
                        >
                          {category.icon && (
                            <span
                              className="w-4 shrink-0"
                              aria-hidden="true"
                            >
                              {category.icon}
                            </span>
                          )}

                          <span className="max-w-[10rem] truncate">
                            {category.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {activeCategory?.children && activeCategory.children.length > 0 ? (
                    <div
                      className={cn(
                        'grid gap-2',
                        subGridMap[columns]
                      )}
                    >
                      {activeCategory.children.map((child) => (
                        <SubCategoryCard
                          key={child.id}
                          category={child}
                          onLinkClick={handleLinkClick}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyActiveState
                      category={activeCategory}
                      onLinkClick={handleLinkClick}
                    />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default NavbarMegaMenu