// components/ProfileSidebar.tsx
'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useWallet } from '@/hooks/useWallet'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import {
  User,
  Package,
  Wallet,
  Heart,
  Bell,
  Settings,
  LogOut,
  ShoppingBag,
  MapPin,
  Star,
  Gift,
  TrendingUp,
  ChevronRight,
  Menu,
  X,
  BadgeCheck,
  Home,
  Store,
  Users,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Zap,
  Crown,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import Image from 'next/image'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface ProfileNavItem {
  label: string
  href: string
  icon: LucideIcon | React.ReactNode
  badge?: number | string
  badgeVariant?: 'gold' | 'accent' | 'danger' | 'neutral'
  children?: ProfileNavItem[]
  active?: boolean
  onClick?: () => void
  disabled?: boolean
}

interface ProfileSidebarProps {
  /** Liens personnalisés (remplace les liens par défaut) */
  items?: ProfileNavItem[]
  /** Afficher les informations de l'utilisateur en haut */
  showUserInfo?: boolean
  /** Afficher les liens de navigation */
  showNavigation?: boolean
  /** Afficher les raccourcis (wallet, commandes…) */
  showQuickLinks?: boolean
  /** Afficher le pied de page (déconnexion…) */
  showFooter?: boolean
  /** Variante compacte (icônes seulement) */
  compact?: boolean
  /** État contrôlé du mode compact */
  collapsed?: boolean
  /** Callback pour basculer le mode compact */
  onToggleCollapse?: () => void
  /** Variante de style */
  variant?: 'default' | 'glass' | 'minimal'
  /** Classe additionnelle */
  className?: string
  /** Version mobile (drawer) */
  isMobile?: boolean
  /** Ouverture mobile */
  mobileOpen?: boolean
  /** Callback fermeture mobile */
  onMobileClose?: () => void
}

/* ========================================================================== */
/*  Liens par défaut                                                          */
/* ========================================================================== */

const defaultItems: ProfileNavItem[] = [
  {
    label: 'Tableau de bord',
    href: '/profile',
    icon: Home,
  },
  {
    label: 'Mes commandes',
    href: '/profile/commandes',
    icon: Package,
  },
  {
    label: 'Portefeuille',
    href: '/profile/wallet',
    icon: Wallet,
  },
  {
    label: 'Recharger',
    href: '/profile/recharge',
    icon: Zap,
  },
  {
    label: 'Favoris',
    href: '/profile/favoris',
    icon: Heart,
  },
  {
    label: 'Notifications',
    href: '/profile/notifications',
    icon: Bell,
  },
  {
    label: 'Adresses',
    href: '/profile/adresses',
    icon: MapPin,
  },
  {
    label: 'Programme fidélité',
    href: '/profile/fidelite',
    icon: Crown,
  },
  {
    label: 'Parrainage',
    href: '/profile/parrainage',
    icon: Users,
  },
]

const secondaryItems: ProfileNavItem[] = [
  {
    label: 'Paramètres',
    href: '/profile/parametres',
    icon: Settings,
  },
  {
    label: 'Aide & Support',
    href: '/support',
    icon: HelpCircle,
  },
]

/* ========================================================================== */
/*  Sous-composant : NavItem individuel                                       */
/* ========================================================================== */

const NavItemComponent = ({
  item,
  collapsed,
  pathname,
}: {
  item: ProfileNavItem
  collapsed: boolean
  pathname: string
}) => {
  const [open, setOpen] = useState(false)
  const hasChildren = item.children && item.children.length > 0
  const isActive = item.href
    ? pathname === item.href || (item.href !== '/profile' && pathname.startsWith(item.href))
    : item.active

  const content = (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer',
        isActive
          ? 'bg-gold-400/10 text-gold-700 dark:text-gold-300 shadow-sm'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        item.disabled && 'opacity-50 cursor-not-allowed',
        collapsed && 'justify-center px-2'
      )}
    >
      <span
        className={cn(
          'flex-shrink-0',
          isActive ? 'text-gold-500' : 'text-muted-foreground group-hover:text-foreground'
        )}
      >
        {typeof item.icon === 'function' ? <item.icon size={20} /> : item.icon}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge !== undefined && (
            <Badge variant={item.badgeVariant || 'gold'} size="sm">
              {item.badge}
            </Badge>
          )}
          {hasChildren && (
            <span className="ml-auto">
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          )}
        </>
      )}
    </div>
  )

  if (hasChildren) {
    return (
      <div>
        <button onClick={() => setOpen(!open)} className="w-full text-left">
          {content}
        </button>
        {open && !collapsed && (
          <div className="ml-6 mt-1 space-y-1 border-l border-border pl-3">
            {item.children!.map((child) => (
              <NavItemComponent
                key={child.href || child.label}
                item={child}
                collapsed={false}
                pathname={pathname}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (item.href) {
    return <Link href={item.href}>{content}</Link>
  }
  if (item.onClick) {
    return <button onClick={item.onClick} className="w-full text-left">{content}</button>
  }
  return <div>{content}</div>
}

/* ========================================================================== */
/*  Composant principal ProfileSidebar                                        */
/* ========================================================================== */

export function ProfileSidebar({
  items = defaultItems,
  showUserInfo = true,
  showNavigation = true,
  showQuickLinks = true,
  showFooter = true,
  compact: controlledCompact,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  variant = 'default',
  className,
  isMobile = false,
  mobileOpen = false,
  onMobileClose,
}: ProfileSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { totalItems } = useCart()
  const { soldeAchat, soldeVente } = useWallet()
  const toast = useToast()

  // État interne du mode compact
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed

  const toggleCollapse = useCallback(() => {
    const next = !collapsed
    if (controlledCollapsed === undefined) setInternalCollapsed(next)
    onToggleCollapse?.()
  }, [collapsed, controlledCollapsed, onToggleCollapse])

  // Nombre de notifications non lues (à remplacer par un vrai compteur)
  const unreadNotifications = 0 // placeholder

  // Enrichissement des items avec des badges dynamiques
  const enrichedItems = items.map(item => {
    let badge: number | string | undefined = item.badge
    if (item.href === '/profile/notifications' && unreadNotifications > 0) {
      badge = unreadNotifications
    }
    if (item.href === '/panier') {
      badge = totalItems > 0 ? totalItems : undefined
    }
    return { ...item, badge }
  })

  // Contenu principal
  const sidebarContent = (
    <div
      className={cn(
        'flex flex-col h-full',
        variant === 'glass' && 'bg-white/70 dark:bg-midnight-800/60 backdrop-blur-xl',
        variant === 'minimal' && 'bg-transparent',
        variant === 'default' && 'bg-card',
        !isMobile && 'border-r border-border',
        isMobile ? 'w-72' : collapsed ? 'w-[72px]' : 'w-64',
        'transition-all duration-300',
        className
      )}
    >
      {/* En-tête utilisateur */}
      {showUserInfo && user && (
        <div className={cn('p-4 border-b border-border', collapsed && 'flex flex-col items-center gap-2')}>
          <Link href="/profile" className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-muted overflow-hidden ring-2 ring-gold-400/20">
                {user.user_metadata?.avatar_url ? (
                  <Image
                    src={user.user_metadata.avatar_url}
                    alt="Avatar"
                    width={40}
                    height={40}
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground font-bold">
                    {user.email?.[0]?.toUpperCase() || 'G'}
                  </div>
                )}
              </div>
              {user.isVendeur && (
                <BadgeCheck size={14} className="absolute -bottom-0.5 -right-0.5 text-gold-500 bg-background rounded-full" />
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground truncate">
                  {user.user_metadata?.prenom || user.email?.split('@')[0] || 'Utilisateur'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            )}
          </Link>
          {!collapsed && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="bg-muted rounded-lg p-2 text-center">
                <p className="text-xs text-muted-foreground">Achat</p>
                <p className="font-semibold text-sm">{soldeAchat?.toLocaleString() || 0} FC</p>
              </div>
              {user.isVendeur && (
                <div className="bg-muted rounded-lg p-2 text-center">
                  <p className="text-xs text-muted-foreground">Vente</p>
                  <p className="font-semibold text-sm">{soldeVente?.toLocaleString() || 0} FC</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bouton collapse (desktop) */}
      {!isMobile && (
        <button
          onClick={toggleCollapse}
          className="mx-3 mt-4 p-2 rounded-lg text-muted-foreground hover:bg-secondary transition-colors self-end"
          title={collapsed ? 'Développer' : 'Réduire'}
        >
          <ChevronRight size={18} className={cn('transition-transform', collapsed && 'rotate-180')} />
        </button>
      )}

      {/* Navigation */}
      {showNavigation && (
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {enrichedItems.map(item => (
            <NavItemComponent key={item.href || item.label} item={item} collapsed={collapsed} pathname={pathname} />
          ))}
        </nav>
      )}

      {/* Pied de page */}
      {showFooter && (
        <div className="border-t border-border px-3 py-4 space-y-1">
          {secondaryItems.map(item => (
            <NavItemComponent key={item.href || item.label} item={item} collapsed={collapsed} pathname={pathname} />
          ))}
          <button
            onClick={() => {
              logout()
              toast.addToast({ type: 'info', message: 'Déconnexion réussie' })
              router.push('/')
            }}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left',
              'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20',
              collapsed && 'justify-center px-2'
            )}
          >
            <LogOut size={20} />
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
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={onMobileClose}
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 z-50 lg:hidden shadow-2xl"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    )
  }

  // Version desktop (toujours visible)
  return (
    <aside className="hidden lg:block sticky top-16 h-[calc(100vh-4rem)]">
      {sidebarContent}
    </aside>
  )
}