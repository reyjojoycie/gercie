// components/layout/Sidebar.tsx
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { useTheme } from '@/contexts/ThemeContext'

import {
  ChevronDown,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface SidebarLink {
  href?: string
  label: string
  icon?: ReactNode
  badge?: string | number
  disabled?: boolean
  onClick?: () => void
  children?: SidebarLink[]
  defaultOpen?: boolean
}

export interface SidebarSection {
  title?: string
  links: SidebarLink[]
  icon?: ReactNode
}

export interface SidebarFooterAction {
  label: string
  icon?: ReactNode
  onClick: () => void
  badge?: string | number
}

export interface SidebarProps {
  sections?: SidebarSection[]
  links?: SidebarLink[]
  footerActions?: SidebarFooterAction[]
  logo?: ReactNode
  className?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  onToggle?: (collapsed: boolean) => void
  mobileOpen?: boolean
  onMobileClose?: () => void
  header?: ReactNode
  footer?: ReactNode
  hideOnRoutes?: string[]
  searchable?: boolean
  searchPlaceholder?: string
  onSearch?: (query: string) => void
  userSection?: ReactNode
}

interface SidebarContextValue {
  collapsed: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  searchPlaceholder: string
  closeMobile?: () => void
  openSubmenuFlyout?: (link: SidebarLink, rect: DOMRect) => void
  closeSubmenuFlyout?: () => void
}

interface FlyoutState {
  link: SidebarLink
  top: number
  left: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const SIDEBAR_COLLAPSED_KEY = 'gercie-sidebar-collapsed'

const sidebarItemBase =
  'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

const sidebarBadgeBase =
  'inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-accent'

const sidebarIconButtonBase =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors duration-200 hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function normalizePathname(pathname: string): string {
  const raw = pathname || '/'

  if (raw.length > 1 && raw.endsWith('/')) {
    return raw.slice(0, -1)
  }

  return raw
}

function isHrefActive(href: string, pathname: string): boolean {
  const normalizedHref = normalizePathname(href)
  const normalizedPath = normalizePathname(pathname)

  if (normalizedHref === '/') {
    return normalizedPath === '/'
  }

  return (
    normalizedPath === normalizedHref ||
    normalizedPath.startsWith(`${normalizedHref}/`)
  )
}

function hasActiveDescendant(
  link: SidebarLink,
  pathname: string
): boolean {
  if (link.href && isHrefActive(link.href, pathname)) {
    return true
  }

  if (!link.children || link.children.length === 0) {
    return false
  }

  return link.children.some((child) =>
    hasActiveDescendant(child, pathname)
  )
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

function filterSidebarLink(
  link: SidebarLink,
  query: string
): SidebarLink | null {
  const q = normalizeSearch(query)

  if (!q) return link

  const labelMatches = normalizeSearch(link.label).includes(q)

  if (labelMatches) {
    return link
  }

  const filteredChildren = link.children
    ?.map((child) => filterSidebarLink(child, q))
    .filter((child): child is SidebarLink => Boolean(child))

  if (filteredChildren && filteredChildren.length > 0) {
    return {
      ...link,
      children: filteredChildren,
      defaultOpen: true,
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTEXT                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const SidebarContext = createContext<SidebarContextValue | undefined>(
  undefined
)

function useSidebarContext(): SidebarContextValue {
  const context = useContext(SidebarContext)

  if (!context) {
    throw new Error('useSidebarContext must be used inside <Sidebar />')
  }

  return context
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SIDEBAR ITEM                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function SidebarItem({ link }: { link: SidebarLink }) {
  const pathname = usePathname() ?? '/'
  const {
    collapsed,
    searchQuery,
    closeMobile,
    openSubmenuFlyout,
  } = useSidebarContext()

  const [open, setOpen] = useState(Boolean(link.defaultOpen))

  const hasChildren = Boolean(link.children && link.children.length > 0)
  const active = hasActiveDescendant(link, pathname)
  const query = normalizeSearch(searchQuery)

  const visibleChildren = useMemo(() => {
    if (!link.children || link.children.length === 0) return []

    if (!query) return link.children

    return link.children
      .map((child) => filterSidebarLink(child, query))
      .filter((child): child is SidebarLink => Boolean(child))
  }, [link.children, query])

  useEffect(() => {
    if (!hasChildren) return

    const shouldOpen = query
      ? visibleChildren.length > 0
      : active

    if (shouldOpen) {
      setOpen(true)
    }
  }, [active, hasChildren, query, visibleChildren.length])

  const itemClasses = cn(
    sidebarItemBase,
    active
      ? 'bg-accent-soft text-accent'
      : 'text-fg-muted hover:bg-muted hover:text-fg',
    link.disabled && 'pointer-events-none opacity-50',
    collapsed && 'justify-center px-2'
  )

  const iconClasses = cn(
    'flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
    active
      ? 'text-accent'
      : 'text-fg-subtle group-hover:text-fg-muted'
  )

  const handleToggleChildren = (
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()

    if (collapsed) {
      openSubmenuFlyout?.(link, event.currentTarget.getBoundingClientRect())
      return
    }

    setOpen((previous) => !previous)
  }

  const handleCloseNavigation = () => {
    closeMobile?.()
  }

  const content = (
    <>
      {link.icon ? (
        <span className={iconClasses} aria-hidden="true">
          {link.icon}
        </span>
      ) : null}

      {!collapsed ? (
        <span className="min-w-0 flex-1 truncate">{link.label}</span>
      ) : null}

      {collapsed && link.badge !== undefined ? (
        <span
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface"
          aria-hidden="true"
        />
      ) : null}

      {!collapsed && link.badge !== undefined ? (
        <span
          className={cn(
            sidebarBadgeBase,
            hasChildren ? 'ml-2' : 'ml-auto'
          )}
        >
          {link.badge}
        </span>
      ) : null}

      {hasChildren && !collapsed ? (
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 text-fg-subtle transition-transform duration-200',
            open && 'rotate-180 text-accent'
          )}
          aria-hidden="true"
        />
      ) : null}
    </>
  )

  if (hasChildren) {
    const showInlineChildren =
      !collapsed && open && visibleChildren.length > 0

    return (
      <li className="relative">
        <button
          type="button"
          onClick={handleToggleChildren}
          disabled={link.disabled}
          className={itemClasses}
          aria-expanded={!collapsed ? open : undefined}
          aria-haspopup={collapsed ? 'true' : undefined}
          aria-label={collapsed ? link.label : undefined}
          title={collapsed ? link.label : undefined}
        >
          {content}
        </button>

        {showInlineChildren ? (
          <ul className="ml-4 mt-1 space-y-1 border-l border-line pl-3">
            {visibleChildren.map((child) => (
              <SidebarItem
                key={child.href || child.label}
                link={child}
              />
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  if (link.disabled || !link.href) {
    return (
      <li>
        <span
          className={itemClasses}
          aria-label={collapsed ? link.label : undefined}
          title={collapsed ? link.label : undefined}
        >
          {content}
        </span>
      </li>
    )
  }

  if (link.onClick) {
    return (
      <li>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            link.onClick?.()
            handleCloseNavigation()
          }}
          className={itemClasses}
          aria-current={active ? 'page' : undefined}
          aria-label={collapsed ? link.label : undefined}
          title={collapsed ? link.label : undefined}
        >
          {content}
        </button>
      </li>
    )
  }

  return (
    <li>
      <Link
        href={link.href}
        onClick={handleCloseNavigation}
        className={itemClasses}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? link.label : undefined}
        title={collapsed ? link.label : undefined}
      >
        {content}
      </Link>
    </li>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SIDEBAR SEARCH                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function SidebarSearch() {
  const {
    collapsed,
    searchQuery,
    setSearchQuery,
    searchPlaceholder,
  } = useSidebarContext()

  if (collapsed) return null

  return (
    <div className="px-3 pb-3">
      <form
        role="search"
        onSubmit={(event) => event.preventDefault()}
        className="relative"
      >
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />

        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className={cn(
            'h-10 w-full rounded-control border border-line bg-canvas pl-9 pr-9 text-sm text-fg',
            'placeholder:text-fg-subtle',
            'transition-colors duration-200',
            'hover:border-line-strong',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15'
          )}
        />

        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className={cn(
              'absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md',
              'text-fg-subtle transition-colors duration-200',
              'hover:bg-muted hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            )}
            aria-label="Effacer la recherche"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </form>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SIDEBAR                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export function Sidebar({
  sections,
  links,
  footerActions,
  logo,
  className,
  collapsible = true,
  defaultCollapsed = false,
  onToggle,
  mobileOpen = false,
  onMobileClose,
  header,
  footer,
  hideOnRoutes = [],
  searchable = false,
  searchPlaceholder = 'Rechercher...',
  onSearch,
  userSection,
}: SidebarProps) {
  const pathname = usePathname() ?? '/'
  const normalizedPathname = normalizePathname(pathname)

  const theme = useTheme() as {
    resolvedTheme?: 'light' | 'dark'
    toggleTheme?: () => void
  }

  const resolvedTheme = theme.resolvedTheme ?? 'light'
  const toggleTheme = theme.toggleTheme

  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDesktop, setIsDesktop] = useState(false)
  const [flyout, setFlyout] = useState<FlyoutState | null>(null)

  const onSearchRef = useRef(onSearch)

  useEffect(() => {
    onSearchRef.current = onSearch
  }, [onSearch])

  /* ───────────────────────────────────────────────────────────── */
  /*  DESKTOP DETECTION                                            */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(min-width: 768px)')

    const update = () => setIsDesktop(mediaQuery.matches)
    update()

    mediaQuery.addEventListener('change', update)

    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  PERSIST COLLAPSED STATE                                      */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)

      if (stored === 'true' || stored === 'false') {
        setCollapsed(stored === 'true')
      }
    } catch {
      // stockage indisponible
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_KEY,
        String(collapsed)
      )
    } catch {
      // stockage indisponible
    }
  }, [collapsed])

  useEffect(() => {
    onToggle?.(collapsed)
  }, [collapsed, onToggle])

  const effectiveCollapsed = collapsed && isDesktop

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => !previous)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  FLYOUT SOUS-MENUS EN MODE COLLAPSED                          */
  /* ───────────────────────────────────────────────────────────── */

  const closeSubmenuFlyout = useCallback(() => {
    setFlyout(null)
  }, [])

  const openSubmenuFlyout = useCallback(
    (link: SidebarLink, rect: DOMRect) => {
      if (!effectiveCollapsed) return

      setFlyout({
        link,
        top: rect.top,
        left: rect.right + 8,
      })
    },
    [effectiveCollapsed]
  )

  useEffect(() => {
    closeSubmenuFlyout()
  }, [normalizedPathname, closeSubmenuFlyout])

  useEffect(() => {
    if (!flyout) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSubmenuFlyout()
      }
    }

    const handleScroll = () => {
      closeSubmenuFlyout()
    }

    const handleResize = () => {
      closeSubmenuFlyout()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [closeSubmenuFlyout, flyout])

  /* ───────────────────────────────────────────────────────────── */
  /*  MOBILE DRAWER                                                */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!mobileOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onMobileClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen, onMobileClose])

  useEffect(() => {
    if (!mobileOpen || typeof document === 'undefined') return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [mobileOpen])

  /* ───────────────────────────────────────────────────────────── */
  /*  SEARCH DEBOUNCE                                              */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!onSearchRef.current) return

    const timer = setTimeout(() => {
      onSearchRef.current?.(searchQuery)
    }, 250)

    return () => clearTimeout(timer)
  }, [searchQuery])

  /* ───────────────────────────────────────────────────────────── */
  /*  CONTEXT VALUE                                                */
  /* ───────────────────────────────────────────────────────────── */

  const contextValue = useMemo<SidebarContextValue>(
    () => ({
      collapsed: effectiveCollapsed,
      searchQuery,
      setSearchQuery,
      searchPlaceholder,
      closeMobile: onMobileClose,
      openSubmenuFlyout,
      closeSubmenuFlyout,
    }),
    [
      effectiveCollapsed,
      onMobileClose,
      openSubmenuFlyout,
      closeSubmenuFlyout,
      searchPlaceholder,
      searchQuery,
    ]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  FILTER SECTIONS                                              */
  /* ───────────────────────────────────────────────────────────── */

  const filteredSections = useMemo<SidebarSection[]>(() => {
    const baseSections: SidebarSection[] =
      sections ?? (links ? [{ links }] : [])

    const query = normalizeSearch(searchQuery)

    if (!query) return baseSections

    return baseSections
      .map((section) => ({
        ...section,
        links: section.links
          .map((link) => filterSidebarLink(link, query))
          .filter((link): link is SidebarLink => Boolean(link)),
      }))
      .filter((section) => section.links.length > 0)
  }, [links, searchQuery, sections])

  /* ───────────────────────────────────────────────────────────── */
  /*  HIDE ON ROUTES                                               */
  /* ───────────────────────────────────────────────────────────── */

  const isHiddenRoute = hideOnRoutes.some((route) => {
    const normalizedRoute = normalizePathname(route)

    return (
      normalizedPathname === normalizedRoute ||
      normalizedPathname.startsWith(`${normalizedRoute}/`)
    )
  })

  if (isHiddenRoute) {
    return null
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  FLYOUT CHILDREN                                              */
  /* ───────────────────────────────────────────────────────────── */

  const flyoutQuery = normalizeSearch(searchQuery)

  const flyoutChildren = flyout
    ? (flyout.link.children ?? [])
        .map((child) => filterSidebarLink(child, flyoutQuery))
        .filter((child): child is SidebarLink => Boolean(child))
    : []

  const flyoutStyle = flyout
    ? {
        top: Math.max(
          8,
          Math.min(
            flyout.top,
            typeof window !== 'undefined'
              ? window.innerHeight - 320
              : flyout.top
          )
        ),
        left: Math.max(
          8,
          Math.min(
            flyout.left,
            typeof window !== 'undefined'
              ? window.innerWidth - 288
              : flyout.left
          )
        ),
      }
    : undefined

  /* ───────────────────────────────────────────────────────────── */
  /*  SIDEBAR CONTENT                                              */
  /* ───────────────────────────────────────────────────────────── */

  const sidebarContent = (
    <SidebarContext.Provider value={contextValue}>
      <div
        className={cn(
          'flex h-full flex-col bg-surface text-fg',
          className
        )}
      >
        {/* ====================================================
            HEADER
           ==================================================== */}
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-4">
          <div
            className={cn(
              'min-w-0 flex-1 overflow-hidden',
              effectiveCollapsed && 'flex justify-center'
            )}
          >
            {logo ? (
              logo
            ) : effectiveCollapsed ? (
              <Link
                href="/"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-contrast shadow-card"
                aria-label="Gercie"
              >
                G
              </Link>
            ) : (
              <Link
                href="/"
                className="truncate text-lg font-semibold tracking-tight text-fg"
              >
                Gercie
                <span className="text-accent">.</span>
              </Link>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {collapsible ? (
              <button
                type="button"
                onClick={toggleCollapsed}
                className={cn(sidebarIconButtonBase, 'hidden md:inline-flex')}
                aria-label={
                  effectiveCollapsed
                    ? 'Développer la barre latérale'
                    : 'Réduire la barre latérale'
                }
                title={
                  effectiveCollapsed ? 'Développer' : 'Réduire'
                }
              >
                {effectiveCollapsed ? (
                  <PanelLeftOpen size={18} aria-hidden="true" />
                ) : (
                  <PanelLeftClose size={18} aria-hidden="true" />
                )}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onMobileClose}
              className={cn(sidebarIconButtonBase, 'md:hidden')}
              aria-label="Fermer la barre latérale"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ====================================================
            CUSTOM HEADER
           ==================================================== */}
        {header && !effectiveCollapsed ? (
          <div className="border-b border-line px-3 py-3">
            {header}
          </div>
        ) : null}

        {/* ====================================================
            SEARCH
           ==================================================== */}
        {searchable ? <SidebarSearch /> : null}

        {/* ====================================================
            NAVIGATION
           ==================================================== */}
        <nav
          className="flex-1 overflow-y-auto px-3 py-4"
          aria-label="Navigation principale"
        >
          {filteredSections.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-fg-subtle">
              {searchQuery
                ? 'Aucun élément trouvé.'
                : 'Aucune navigation configurée.'}
            </p>
          ) : (
            <div className="space-y-6">
              {filteredSections.map((section, sectionIndex) => (
                <div key={`${section.title || 'section'}-${sectionIndex}`}>
                  {section.title && !effectiveCollapsed ? (
                    <div className="mb-2 flex items-center justify-between px-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                        {section.title}
                      </h3>

                      {section.icon ? (
                        <span
                          className="text-fg-subtle"
                          aria-hidden="true"
                        >
                          {section.icon}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <ul className="space-y-1">
                    {section.links.map((link) => (
                      <SidebarItem
                        key={link.href || link.label}
                        link={link}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </nav>

        {/* ====================================================
            USER SECTION
           ==================================================== */}
        {userSection && !effectiveCollapsed ? (
          <div className="border-t border-line px-3 py-3">
            {userSection}
          </div>
        ) : null}

        {/* ====================================================
            FOOTER ACTIONS
           ==================================================== */}
        {(footer || (footerActions && footerActions.length > 0)) && (
          <div className="space-y-1 border-t border-line px-3 py-3">
            {footer}

            {footerActions?.map((action) => {
              const actionClasses = cn(
                sidebarItemBase,
                'text-fg-muted hover:bg-muted hover:text-fg',
                effectiveCollapsed && 'justify-center px-2'
              )

              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    action.onClick()
                    onMobileClose?.()
                  }}
                  className={actionClasses}
                  aria-label={
                    effectiveCollapsed ? action.label : undefined
                  }
                  title={effectiveCollapsed ? action.label : undefined}
                >
                  {action.icon ? (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center text-fg-subtle"
                      aria-hidden="true"
                    >
                      {action.icon}
                    </span>
                  ) : null}

                  {!effectiveCollapsed ? (
                    <span className="min-w-0 flex-1 truncate">
                      {action.label}
                    </span>
                  ) : null}

                  {effectiveCollapsed && action.badge !== undefined ? (
                    <span
                      className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface"
                      aria-hidden="true"
                    />
                  ) : null}

                  {!effectiveCollapsed && action.badge !== undefined ? (
                    <span className={cn(sidebarBadgeBase, 'ml-auto')}>
                      {action.badge}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}

        {/* ====================================================
            THEME TOGGLE
           ==================================================== */}
        {typeof toggleTheme === 'function' ? (
          <div className="border-t border-line px-3 py-3">
            <button
              type="button"
              onClick={toggleTheme}
              className={cn(
                sidebarItemBase,
                'text-fg-muted hover:bg-muted hover:text-fg',
                effectiveCollapsed && 'justify-center px-2'
              )}
              aria-label={
                resolvedTheme === 'dark'
                  ? 'Activer le mode clair'
                  : 'Activer le mode sombre'
              }
              title={
                resolvedTheme === 'dark'
                  ? 'Mode clair'
                  : 'Mode sombre'
              }
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center text-fg-subtle"
                aria-hidden="true"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun size={18} />
                ) : (
                  <Moon size={18} />
                )}
              </span>

              {!effectiveCollapsed ? (
                <span className="min-w-0 flex-1 truncate">
                  {resolvedTheme === 'dark'
                    ? 'Mode clair'
                    : 'Mode sombre'}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}
      </div>
    </SidebarContext.Provider>
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-overlay/60 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      ) : null}

      {/* Sidebar desktop */}
      <aside
        className={cn(
          'fixed bottom-0 left-0 top-0 z-30 hidden border-r border-line bg-surface transition-[width] duration-300 md:flex md:flex-col',
          effectiveCollapsed ? 'w-[4.5rem]' : 'w-72'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar mobile */}
      <aside
        className={cn(
          'fixed bottom-0 left-0 top-0 z-50 w-80 max-w-[85vw] border-r border-line bg-surface shadow-card transition-[transform,visibility] duration-300 md:hidden',
          mobileOpen
            ? 'visible translate-x-0'
            : 'invisible -translate-x-full'
        )}
        aria-hidden={!mobileOpen}
      >
        {sidebarContent}
      </aside>

      {/* Flyout sous-menus en mode collapsed */}
      {flyout ? (
        <SidebarContext.Provider
          value={{
            ...contextValue,
            collapsed: false,
            openSubmenuFlyout: undefined,
            closeSubmenuFlyout: undefined,
          }}
        >
          <div
            role="menu"
            aria-label={flyout.link.label}
            className="fixed z-[80] w-64 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-2 shadow-card"
            style={flyoutStyle}
            onMouseLeave={closeSubmenuFlyout}
          >
            <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              {flyout.link.label}
            </p>

            <ul className="space-y-1">
              {flyoutChildren.map((child) => (
                <SidebarItem
                  key={child.href || child.label}
                  link={child}
                />
              ))}
            </ul>
          </div>
        </SidebarContext.Provider>
      ) : null}
    </>
  )
}

export default Sidebar