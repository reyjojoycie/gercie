'use client'

import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import {
  User,
  ClipboardCheck,
  Wallet,
  Heart,
  Bell,
  BellDot,
  LayoutDashboard,
  Truck,
  Headset,
  Settings,
  LogOut,
  ChevronRight,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

interface NavbarUserMenuProps {
  /** Objet utilisateur (provient du contexte Auth) */
  user: {
    email: string
    avatar_url?: string | null
  } | null
  /** Indique si l'utilisateur est admin */
  isAdmin?: boolean
  /** Indique si l'utilisateur est livreur */
  isLivreur?: boolean
  /** Solde du portefeuille (affiché en FC) */
  walletBalance?: number | null
  /** Nombre de notifications non lues */
  notifCount?: number
  /** Callback de déconnexion */
  onLogout: () => void
  /** Callback pour fermer le menu */
  onClose: () => void
  /** Liens personnalisés à ajouter après les liens par défaut */
  extraLinks?: {
    label: string
    href: string
    icon?: React.ReactNode
  }[]
  /** Classes additionnelles */
  className?: string
}

/* ========================================================================== */
/*  Composant NavbarUserMenu                                                  */
/* ========================================================================== */

export function NavbarUserMenu({
  user,
  isAdmin = false,
  isLivreur = false,
  walletBalance = null,
  notifCount = 0,
  onLogout,
  onClose,
  extraLinks = [],
  className,
}: NavbarUserMenuProps) {
  if (!user) return null

  const hasAvatar = user.avatar_url && user.avatar_url.trim() !== ''
  const displayName = user.email?.split('@')[0] || 'Utilisateur'

  const menuItems = [
    { href: '/profile', icon: <User size={18} />, label: 'Mon compte' },
    { href: '/profile/commandes', icon: <ClipboardCheck size={18} />, label: 'Mes commandes' },
    { href: '/profile/wallet', icon: <Wallet size={18} />, label: 'Portefeuille' },
    { href: '/profile/favoris', icon: <Heart size={18} />, label: 'Favoris' },
    {
      href: '/profile/notifications',
      icon: <Bell size={18} />,
      label: 'Notifications',
      badge: notifCount > 0 ? (notifCount > 9 ? '9+' : notifCount) : undefined,
    },
    ...(isAdmin
      ? [{ href: '/admin', icon: <LayoutDashboard size={18} />, label: 'Administration' }]
      : []),
    ...(isLivreur
      ? [{ href: '/dashboard/livreur', icon: <Truck size={18} />, label: 'Espace Livreur' }]
      : []),
    { href: '/support', icon: <Headset size={18} />, label: 'Aide & Support' },
    ...extraLinks,
  ]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -5, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -5, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'absolute right-0 top-full mt-2 w-72 bg-white/95 dark:bg-midnight-800/95 backdrop-blur-xl rounded-xl shadow-strong border border-gold-400/20 py-2 z-20 overflow-hidden',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête : avatar + email + solde */}
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-midnight-500/30">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 flex items-center justify-center shadow-gold overflow-hidden flex-shrink-0">
              {hasAvatar ? (
                <Image
                  src={user.avatar_url!}
                  alt="Avatar"
                  width={36}
                  height={36}
                  className="w-9 h-9 rounded-full object-cover"
                />
              ) : (
                <span className="text-midnight-900 font-bold text-sm">
                  {displayName[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                {displayName}
              </p>
              <p className="text-xs text-neutral-500 truncate">{user.email}</p>
            </div>
          </div>
          {walletBalance !== null && (
            <div className="flex items-center gap-2 bg-gold-50 dark:bg-gold-900/20 rounded-lg px-3 py-1.5 mt-2">
              <Wallet size={14} className="text-gold-500" />
              <span className="text-xs font-semibold text-gold-700 dark:text-gold-300">
                {walletBalance.toLocaleString()} FC
              </span>
            </div>
          )}
        </div>

        {/* Liens */}
        <div className="py-1">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-gold-400/10 hover:text-gold-600 dark:hover:text-gold-400 transition-colors"
            >
              <span className="text-neutral-400 dark:text-neutral-500 w-5 flex-shrink-0">
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <Badge variant="gold" size="sm" className="ml-auto">
                  {item.badge}
                </Badge>
              )}
            </Link>
          ))}
        </div>

        {/* Pied : paramètres + déconnexion */}
        <div className="border-t border-neutral-200 dark:border-midnight-500/30 pt-1">
          <Link
            href="/profile/parametres"
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-500 hover:bg-gold-400/10 hover:text-gold-600 dark:hover:text-gold-400 transition-colors"
          >
            <Settings size={18} className="text-neutral-400 dark:text-neutral-500" />
            <span>Paramètres</span>
          </Link>
          <button
            onClick={() => {
              onLogout()
              onClose()
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={18} />
            <span>Déconnexion</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}