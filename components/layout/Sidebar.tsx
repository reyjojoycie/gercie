// components/layout/Sidebar.tsx
'use client'

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  createContext,
  useContext,
} from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTheme } from '@/contexts/ThemeContext'
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Search,
  LayoutDashboard,
  Store,
  ShoppingCart,
  Users,
  FileText,
  Settings,
  HelpCircle,
  Sun,
  Moon,
  Bell,
  AlertCircle,
  ArrowLeftRight,
  LogOut,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SidebarLink {
  href: string
  label: string
  icon?: React.ReactNode
  badge?: string | number
  disabled?: boolean
  onClick?: () => void
  /** Sous‑liens (menu dépliable) */
  children?: SidebarLink[]
  /** Si vrai, le groupe sera ouvert par défaut */
  defaultOpen?: boolean
}

export interface SidebarSection {
  title?: string
  links: SidebarLink[]
  /** Icône facultative de la section (affichée en collapsed si pas de titre ?) */
  icon?: React.ReactNode
}

export interface SidebarFooterAction {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  badge?: string | number
}

interface SidebarProps {
  sections?: SidebarSection[]
  links?: SidebarLink[]           // liens sans sections
  footerActions?: SidebarFooterAction[]
  logo?: React.ReactNode
  className?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  onToggle?: (collapsed: boolean) => void
  mobileOpen?: boolean
  onMobileClose?: () => void
  header?: React.ReactNode
  footer?: React.ReactNode
  /** Routes sur lesquelles la sidebar est masquée (ex: ['/login', '/register']) */
  hideOnRoutes?: string[]
  /** Affiche une barre de recherche en haut */
  searchable?: boolean
  /** Placeholder de la recherche */
  searchPlaceholder?: string
  /** Action exécutée lors de la validation de la recherche */
  onSearch?: (query: string) => void
  /** Composant utilisateur (avatar, nom) affiché en bas */
  userSection?: React.ReactNode
}

/* ================================================================== */
/*  Contexte interne pour éviter les props drilling                  */
/* ================================================================== */
interface SidebarContextType {
  collapsed: boolean
  toggleCollapsed: () => void
  searchQuery: string
  setSearchQuery: (q: string) => void
}
const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

const useSidebarContext = () => {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('SidebarContext missing')
  return ctx
}

/* ================================================================== */
/*  Sous‑composants réutilisables                                     */
/* ================================================================== */

/** Élément de lien unique (avec badge, active state, sous‑liens éventuels) */
const SidebarItem = ({ link }: { link: SidebarLink }) => {
  const pathname = usePathname()
  const { collapsed, toggleCollapsed } = useSidebarContext()
  const [open, setOpen] = useState(link.defaultOpen ?? false)
  const hasChildren = link.children && link.children.length > 0

  const isActive = useCallback(
    (href: string) => {
      if (href === '/') return pathname === '/'
      return pathname.startsWith(href)
    },
    [pathname]
  )

  const active = link.href ? isActive(link.href) : false
  const LinkWrapper = link.onClick ? 'button' : Link

  // Pour les sous‑liens, on utilise un bouton toggle
  const handleToggleChildren = (e: React.MouseEvent) => {
    e.preventDefault()
    setOpen(!open)
  }

  const baseClasses = cn(
    'flex items-center w-full rounded-xl text-sm font-medium transition-all duration-200 group relative',
    'focus-visible:outline-2 focus-visible:outline-brand-500',
    active
      ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 shadow-sm'
      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200',
    link.disabled && 'opacity-50 cursor-not-allowed',
    collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
  )

  const content = (
    <>
      {link.icon && (
        <span
          className={cn(
            'flex-shrink-0 transition-colors',
            active
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300'
          )}
        >
          {link.icon}
        </span>
      )}
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{link.label}</span>
          {hasChildren && (
            <ChevronDown
              size={16}
              className={cn(
                'transition-transform ml-2',
                open && 'rotate-180'
              )}
            />
          )}
          {link.badge !== undefined && !hasChildren && (
            <span className="ml-auto inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 min-w-[1.25rem] animate-pulse-soft">
              {link.badge}
            </span>
          )}
          {hasChildren && link.badge !== undefined && (
            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 min-w-[1.25rem]">
              {link.badge}
            </span>
          )}
        </>
      )}
      {collapsed && link.badge !== undefined && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-[0.625rem] font-bold rounded-full bg-red-500 text-white ring-2 ring-white dark:ring-neutral-900">
          {link.badge}
        </span>
      )}
    </>
  )

  if (hasChildren) {
    return (
      <div>
        <button
          type="button"
          onClick={handleToggleChildren}
          disabled={link.disabled}
          className={baseClasses}
          aria-expanded={!collapsed ? open : undefined}
          title={collapsed ? link.label : undefined}
        >
          {content}
        </button>
        {!collapsed && open && (
          <ul className="ml-6 mt-1 space-y-1 border-l border-neutral-200 dark:border-neutral-700 pl-3">
            {link.children!.map((child) => (
              <SidebarItem key={child.href || child.label} link={child} />
            ))}
          </ul>
        )}
        {collapsed && open && (
          <div className="absolute left-full top-0 ml-2 w-48 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 p-2 z-50 animate-scale-in">
            {link.children!.map((child) => (
              <SidebarItem key={child.href || child.label} link={{ ...child, badge: undefined }} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <li>
      <LinkWrapper
        {...(link.onClick
          ? { onClick: link.onClick }
          : { href: link.href })}
        className={baseClasses}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? link.label : undefined}
      >
        {content}
      </LinkWrapper>
    </li>
  )
}

/** Barre de recherche intégrée (optionnelle) */
const SidebarSearch = () => {
  const { collapsed, searchQuery, setSearchQuery } = useSidebarContext()
  if (collapsed) return null
  return (
    <div className="px-4 pb-4">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher..."
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-transparent focus:border-brand-400 focus:outline-none text-sm text-neutral-700 dark:text-neutral-200 placeholder-neutral-400"
        />
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Composant principal                                                */
/* ================================================================== */

const Sidebar = ({
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
}: SidebarProps) => {
  const pathname = usePathname()
  const { resolvedTheme, toggleTheme } = useTheme()
  const [collapsed, setCollapsedState] = useState(defaultCollapsed)
  const [searchQuery, setSearchQuery] = useState('')
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Sauvegarde / restauration de l'état collapsed
  useEffect(() => {
    const stored = localStorage.getItem('gercie-sidebar-collapsed')
    if (stored === 'true' || stored === 'false') {
      setCollapsedState(stored === 'true')
    }
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev
      localStorage.setItem('gercie-sidebar-collapsed', String(next))
      return next
    })
  }, [])

  useEffect(() => {
    onToggle?.(collapsed)
  }, [collapsed, onToggle])

  // Fermeture mobile automatique au changement de route
  useEffect(() => {
    onMobileClose?.()
  }, [pathname, onMobileClose])

  // Filtrage éventuel des liens (recherche)
  const filterLinks = useCallback(
    (link: SidebarLink): boolean => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      if (link.label.toLowerCase().includes(q)) return true
      if (link.children?.some((c) => c.label.toLowerCase().includes(q)))
        return true
      return false
    },
    [searchQuery]
  )

  // Sections filtrées
  const filteredSections = useMemo(() => {
    if (!searchQuery) return sections || (links ? [{ links }] : [])
    if (sections) {
      return sections
        .map((section) => ({
          ...section,
          links: section.links.filter(filterLinks),
        }))
        .filter((section) => section.links.length > 0)
    }
    if (links) {
      return [{ links: links.filter(filterLinks) }]
    }
    return []
  }, [sections, links, filterLinks, searchQuery])

  // Si la route actuelle est dans hideOnRoutes, on masque complètement la sidebar
  if (hideOnRoutes.some((route) => pathname.startsWith(route))) {
    return null
  }

  const sidebarContent = (
    <SidebarContext.Provider
      value={{ collapsed, toggleCollapsed, searchQuery, setSearchQuery }}
    >
      <div
        ref={sidebarRef}
        className={cn('flex flex-col h-full', className)}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-neutral-200 dark:border-neutral-800">
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              {logo || (
                <Link
                  href="/"
                  className="text-xl font-bold text-neutral-900 dark:text-neutral-100"
                >
                  Gercie
                </Link>
              )}
            </div>
          )}
          <div className="flex items-center gap-1">
            {collapsible && (
              <button
                onClick={toggleCollapsed}
                className="hidden md:flex p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title={collapsed ? 'Développer' : 'Réduire'}
                aria-label={collapsed ? 'Développer la barre latérale' : 'Réduire la barre latérale'}
              >
                {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
            )}
            <button
              onClick={onMobileClose}
              className="md:hidden p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Fermer la barre latérale"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Header personnalisé */}
        {header && !collapsed && <div className="px-4 pt-4">{header}</div>}

        {/* Barre de recherche */}
        {searchable && <SidebarSearch />}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {filteredSections.map((section, sectionIdx) => (
            <div key={sectionIdx}>
              {section.title && !collapsed && (
                <div className="flex items-center justify-between px-4 mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                    {section.title}
                  </h3>
                  {section.icon && (
                    <span className="text-neutral-400">{section.icon}</span>
                  )}
                </div>
              )}
              <ul className="space-y-1">
                {section.links.map((link) => (
                  <SidebarItem key={link.href || link.label} link={link} />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer utilisateur */}
        {userSection && !collapsed && (
          <div className="px-3 pb-2 border-t border-neutral-200 dark:border-neutral-800 pt-3">
            {userSection}
          </div>
        )}

        {/* Footer actions */}
        {(footer || footerActions) && !collapsed && (
          <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-4">
            {footer}
            {footerActions && (
              <div className="space-y-1">
                {footerActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={action.onClick}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors"
                  >
                    {action.icon && (
                      <span className="text-neutral-400 dark:text-neutral-500">
                        {action.icon}
                      </span>
                    )}
                    <span>{action.label}</span>
                    {action.badge && (
                      <span className="ml-auto text-xs bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full">
                        {action.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bouton de thème (optionnel, toujours présent) */}
        {!collapsed && (
          <div className="px-3 pb-4 border-t border-neutral-200 dark:border-neutral-800 pt-3">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors"
            >
              {resolvedTheme === 'dark' ? (
                <Sun size={18} className="text-neutral-400 dark:text-neutral-500" />
              ) : (
                <Moon size={18} className="text-neutral-400 dark:text-neutral-500" />
              )}
              <span>
                {resolvedTheme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              </span>
            </button>
          </div>
        )}
      </div>
    </SidebarContext.Provider>
  )

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar desktop (fixe) */}
      <aside
        className={cn(
          'hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-30 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 transition-all duration-300',
          collapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar mobile (overlay) */}
      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 shadow-2xl transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}

export { Sidebar }