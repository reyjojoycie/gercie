// components/admin/AdminSidebar.tsx
'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Input } from '@/components/ui/Input'
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  Wallet,
  ShoppingBag,
  AlertCircle,
  MapPin,
  FileText,
  CreditCard,
  Key,
  Tag,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Home,
  Search,
  Bell,
  Sun,
  Moon,
  Gift,
  Star,
  TrendingUp,
  Zap,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

interface AdminNavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: number | string
  badgeVariant?: 'gold' | 'accent' | 'danger' | 'warm' | 'neutral'
  children?: { label: string; href: string; badge?: number | string }[]
  disabled?: boolean
}

export interface AdminSidebarProps {
  /** Liens de navigation personnalisés (remplace ceux par défaut) */
  items?: AdminNavItem[]
  /** Afficher l'en-tête avec logo et infos */
  showHeader?: boolean
  /** Afficher le pied de page (déconnexion, thème) */
  showFooter?: boolean
  /** État contrôlé du mode réduit */
  collapsed?: boolean
  /** Callback lors du changement de mode réduit */
  onToggleCollapse?: () => void
  /** Variante de style */
  variant?: 'default' | 'glass' | 'minimal'
  /** Classes additionnelles */
  className?: string
  /** Version mobile (overlay) */
  isMobile?: boolean
  /** Ouverture mobile contrôlée */
  mobileOpen?: boolean
  /** Callback fermeture mobile */
  onMobileClose?: () => void
  /** Activer la recherche dans la sidebar */
  searchable?: boolean
  /** Compteur de notifications non lues */
  unreadNotifications?: number
  /** Fonction de déconnexion personnalisée */
  onLogout?: () => void
}

/* ========================================================================== */
/*  Navigation par défaut                                                      */
/* ========================================================================== */

const defaultNavItems: AdminNavItem[] = [
  {
    label: 'Tableau de bord',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    label: 'Produits',
    href: '/admin/produits',
    icon: Package,
    children: [
      { label: 'Tous les produits', href: '/admin/produits' },
      { label: 'Ajouter un produit', href: '/admin/produits/ajouter' },
    ],
  },
  {
    label: 'Commandes',
    href: '/admin/commandes',
    icon: ShoppingBag,
  },
  {
    label: 'Utilisateurs',
    href: '/admin/utilisateurs',
    icon: Users,
  },
  {
    label: 'Livreurs',
    href: '/admin/livreurs',
    icon: Truck,
  },
  {
    label: 'Portefeuille central',
    href: '/admin/wallet',
    icon: Wallet,
  },
  {
    label: 'Transactions',
    href: '/admin/transactions',
    icon: FileText,
  },
  {
    label: 'Demandes de retrait',
    href: '/admin/retraits',
    icon: CreditCard,
  },
  {
    label: 'Litiges',
    href: '/admin/litiges',
    icon: AlertCircle,
  },
  {
    label: 'Points de retrait',
    href: '/admin/points-retrait',
    icon: MapPin,
  },
  {
    label: 'Codes d\'activation',
    href: '/admin/codes',
    icon: Key,
  },
  {
    label: 'Taux de change',
    href: '/admin/exchange-rate',
    icon: TrendingUp,
  },
]

/* ========================================================================== */
/*  Composant AdminSidebar                                                     */
/* ========================================================================== */

export function AdminSidebar({
  items = defaultNavItems,
  showHeader = true,
  showFooter = true,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  variant = 'default',
  className,
  isMobile = false,
  mobileOpen = false,
  onMobileClose,
  searchable = true,
  unreadNotifications = 0,
  onLogout,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()

  // État interne du mode réduit
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed

  // Sous-menus expansibles
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Détection du thème
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'dark' : 'light')
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
    localStorage.setItem('gercie-theme', newTheme)
  }

  const toggleCollapse = useCallback(() => {
    const next = !collapsed
    if (controlledCollapsed === undefined) setInternalCollapsed(next)
    onToggleCollapse?.()
  }, [collapsed, controlledCollapsed, onToggleCollapse])

  const toggleSubmenu = (href: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const handleLogout = () => {
    if (onLogout) {
      onLogout()
    } else {
      logout()
      router.push('/')
    }
  }

  // Fermer le menu mobile au changement de route
  useEffect(() => {
    if (isMobile) onMobileClose?.()
  }, [pathname, isMobile, onMobileClose])

  // Filtrage par recherche
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter(item =>
      item.label.toLowerCase().includes(q) ||
      (item.children && item.children.some(c => c.label.toLowerCase().includes(q)))
    )
  }, [items, searchQuery])

  const sidebarContent = (
    <div
      className={cn(
        'flex flex-col h-full',
        variant === 'glass' && 'bg-white/70 dark:bg-midnight-800/60 backdrop-blur-xl',
        variant === 'minimal' && 'bg-transparent',
        variant === 'default' && 'bg-midnight-900 dark:bg-midnight-950',
        !isMobile && 'border-r border-gold-400/20',
        isMobile ? 'w-72' : collapsed ? 'w-[72px]' : 'w-64',
        'transition-all duration-300',
        className,
      )}
    >
      {/* En-tête */}
      {showHeader && (
        <div className={cn('p-4 border-b border-gold-400/20 flex items-center justify-between', collapsed && 'justify-center')}>
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 flex items-center justify-center shadow-gold flex-shrink-0">
              <ShieldCheck size={20} className="text-midnight-900" />
            </div>
            {!collapsed && (
              <div>
                <h1 className="text-xl font-bold text-gold-400 font-serif">Admin</h1>
                <p className="text-xs text-gold-200/70">Gercie</p>
              </div>
            )}
          </Link>
          {!isMobile && (
            <button
              onClick={toggleCollapse}
              className="p-2 rounded-lg text-neutral-400 hover:text-gold-400 transition-colors"
              title={collapsed ? 'Développer' : 'Réduire'}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          )}
        </div>
      )}

      {/* Barre de recherche */}
      {searchable && !collapsed && (
        <div className="px-3 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-neutral-800/50 dark:bg-midnight-800/50 border border-neutral-700 focus:border-gold-400 focus:outline-none text-sm text-neutral-200 placeholder:text-neutral-500"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {filteredItems.map(item => (
          <div key={item.href}>
            <Link
              href={item.children && !collapsed ? '#' : item.href}
              onClick={item.children && !collapsed ? (e) => { e.preventDefault(); toggleSubmenu(item.href) } : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                isActive(item.href)
                  ? 'bg-gradient-to-r from-gold-400/20 to-gold-400/10 text-gold-400 border border-gold-400/30 shadow-gold'
                  : 'text-neutral-300 hover:text-gold-400 hover:bg-gold-400/5',
                item.disabled && 'opacity-50 cursor-not-allowed',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                size={18}
                className={cn(
                  isActive(item.href) ? 'text-gold-400' : 'text-neutral-400 group-hover:text-gold-400',
                  'flex-shrink-0'
                )}
              />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <Badge variant={item.badgeVariant || 'gold'} size="sm">
                      {item.badge}
                    </Badge>
                  )}
                  {item.children && (
                    <ChevronLeft
                      size={14}
                      className={cn(
                        'transition-transform',
                        expandedMenus.has(item.href) ? '-rotate-90' : ''
                      )}
                    />
                  )}
                  {isActive(item.href) && !item.children && (
                    <motion.div
                      layoutId="admin-nav-indicator"
                      className="w-1.5 h-5 rounded-full bg-gold-400"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    />
                  )}
                </>
              )}
            </Link>

            {/* Sous-menu */}
            <AnimatePresence>
              {item.children && expandedMenus.has(item.href) && !collapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden ml-6 mt-1 space-y-1 border-l border-gold-400/20 pl-3"
                >
                  {item.children.map(child => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        'block px-3 py-2 rounded-lg text-sm transition-colors',
                        pathname === child.href
                          ? 'text-gold-400 bg-gold-400/10'
                          : 'text-neutral-400 hover:text-gold-400'
                      )}
                    >
                      <span className="flex items-center justify-between">
                        {child.label}
                        {child.badge !== undefined && (
                          <Badge variant="neutral" size="sm">{child.badge}</Badge>
                        )}
                      </span>
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </nav>

      {/* Pied de page */}
      {showFooter && (
        <div className="border-t border-gold-400/20 p-4 space-y-2">
          {!collapsed && user && (
            <div className="flex items-center gap-3 px-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gold-400/20 flex items-center justify-center text-gold-400 font-bold flex-shrink-0">
                {user.email?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-200 truncate">{user.email}</p>
                <p className="text-xs text-neutral-400">Administrateur</p>
              </div>
            </div>
          )}
          <button
            onClick={toggleTheme}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-neutral-400 hover:text-gold-400 hover:bg-gold-400/5 transition-colors w-full',
              collapsed && 'justify-center'
            )}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {!collapsed && <span>{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>}
          </button>
          <Link
            href="/"
            className={cn(
              'flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 text-midnight-900 font-bold shadow-gold hover:shadow-glow-gold transition-all duration-300',
              collapsed && 'justify-center'
            )}
          >
            <Home size={16} />
            {!collapsed && <span>Retour au site</span>}
          </Link>
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition-colors w-full',
              collapsed && 'justify-center'
            )}
          >
            <LogOut size={16} />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      )}
    </div>
  )

  // Version mobile : overlay + drawer
  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={onMobileClose}
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 z-50 shadow-2xl"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    )
  }

  // Version desktop (fixe)
  return (
    <aside className="hidden lg:block sticky top-0 h-screen">
      {sidebarContent}
    </aside>
  )
}