'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  Sun,
  Moon,
  Heart,
  Bell,
  BellDot,
  ShoppingBag,
  Loader2,
  LogIn,
  UserPlus,
  ChevronDown,
} from 'lucide-react'
import { NavbarCartPreview } from './NavbarCartPreview'
import { NavbarUserMenu } from './NavbarUserMenu'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface CartItem {
  id: string
  nom: string
  prix?: number
  quantite: number
  image?: string
  variante?: any
}

interface NavbarActionsProps {
  /** Thème actuel */
  theme: 'light' | 'dark'
  /** Callback pour basculer le thème */
  toggleTheme: () => void
  /** Nombre de notifications non lues */
  notifCount: number
  /** Nombre d'articles dans le panier */
  itemCount: number
  /** Indique si le panier est en cours de synchronisation */
  isSyncing: boolean
  /** Articles du panier (pour l'aperçu) */
  items: CartItem[]
  /** Le panier est-il ouvert ? */
  cartPreviewOpen: boolean
  /** Callback pour changer l'état du panier */
  onCartPreviewChange: (open: boolean) => void
  /** Le menu utilisateur est-il ouvert ? */
  userMenuOpen: boolean
  /** Callback pour basculer le menu utilisateur */
  onUserMenuToggle: () => void
  /** URL de l'avatar */
  avatarUrl: string | null
  /** Objet utilisateur (ou null) */
  user: any | null
  /** L'utilisateur est-il admin ? */
  isAdmin: boolean
  /** L'utilisateur est-il livreur ? */
  isLivreur: boolean
  /** Solde du portefeuille */
  walletBalance: number | null
  /** Callback de déconnexion */
  onLogout: () => void
  /** Classes additionnelles */
  className?: string
}

/* ========================================================================== */
/*  Composant NavbarActions                                                    */
/* ========================================================================== */

export function NavbarActions({
  theme,
  toggleTheme,
  notifCount,
  itemCount,
  isSyncing,
  items,
  cartPreviewOpen,
  onCartPreviewChange,
  userMenuOpen,
  onUserMenuToggle,
  avatarUrl,
  user,
  isAdmin,
  isLivreur,
  walletBalance,
  onLogout,
  className,
}: NavbarActionsProps) {
  const cartRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Fermeture du panier et du menu utilisateur au clic extérieur
  useEffect(() => {
    if (!cartPreviewOpen && !userMenuOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (cartPreviewOpen && cartRef.current && !cartRef.current.contains(e.target as Node)) {
        onCartPreviewChange(false)
      }
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        onUserMenuToggle()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [cartPreviewOpen, userMenuOpen, onCartPreviewChange, onUserMenuToggle])

  return (
    <div className={cn('flex items-center gap-1 ml-auto', className)}>
      {/* Bouton thème (caché sur mobile) */}
      <Tooltip content={theme === 'light' ? 'Mode sombre' : 'Mode clair'}>
        <button
          onClick={toggleTheme}
          className="hidden sm:flex p-2 rounded-xl text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 hover:bg-neutral-100 dark:hover:bg-midnight-700/40 transition-colors"
          aria-label={theme === 'light' ? 'Activer le mode sombre' : 'Activer le mode clair'}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </Tooltip>

      {/* Utilisateur connecté */}
      {user ? (
        <>
          {/* Notifications */}
          <Link
            href="/profile/notifications"
            className="hidden sm:flex relative p-2 rounded-xl text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 hover:bg-neutral-100 dark:hover:bg-midnight-700/40 transition-colors"
            aria-label="Notifications"
          >
            {notifCount > 0 ? <BellDot size={18} /> : <Bell size={18} />}
            {notifCount > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 text-[9px] font-bold rounded-full bg-red-500 text-white flex items-center justify-center">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </Link>

          {/* Favoris */}
          <Link
            href="/profile/favoris"
            className="hidden sm:flex p-2 rounded-xl text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 hover:bg-neutral-100 dark:hover:bg-midnight-700/40 transition-colors"
            aria-label="Favoris"
          >
            <Heart size={18} />
          </Link>

          {/* Panier */}
          <div
            ref={cartRef}
            className="relative"
            onMouseEnter={() => onCartPreviewChange(true)}
            onMouseLeave={() => onCartPreviewChange(false)}
          >
            <Link
              href="/panier"
              className="relative flex items-center gap-1.5 px-2 py-2 rounded-xl text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 hover:bg-neutral-100 dark:hover:bg-midnight-700/40 transition-colors"
              aria-label="Panier"
            >
              <ShoppingBag size={20} />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold bg-gradient-to-r from-gold-400 to-gold-600 text-midnight-950 shadow-gold">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
              {isSyncing && (
                <Loader2 size={14} className="absolute -bottom-1 -right-1 text-gold-500 animate-spin" />
              )}
            </Link>

            <AnimatePresence>
              {cartPreviewOpen && itemCount > 0 && (
                <NavbarCartPreview items={items} />
              )}
            </AnimatePresence>
          </div>

          {/* Menu utilisateur */}
          <div className="relative user-menu" ref={userMenuRef}>
            <button
              onClick={onUserMenuToggle}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-midnight-700/40 transition-colors"
              aria-label="Menu utilisateur"
              aria-expanded={userMenuOpen}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 flex items-center justify-center shadow-gold overflow-hidden">
                {avatarUrl && avatarUrl.trim() !== '' ? (
                  <Image
                    src={avatarUrl}
                    alt="Avatar"
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-midnight-900 font-bold text-sm">
                    {(user.email?.[0] || 'G').toUpperCase()}
                  </span>
                )}
              </div>
              <ChevronDown
                size={14}
                className={cn(
                  'hidden sm:block text-neutral-400 transition-transform duration-300',
                  userMenuOpen && 'rotate-180'
                )}
              />
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <NavbarUserMenu
                  user={user}
                  isAdmin={isAdmin}
                  isLivreur={isLivreur}
                  walletBalance={walletBalance}
                  notifCount={notifCount}
                  onLogout={onLogout}
                  onClose={() => onUserMenuToggle()}
                />
              )}
            </AnimatePresence>
          </div>
        </>
      ) : (
        /* Utilisateur non connecté */
        <div className="hidden sm:flex items-center gap-2">
          <Link href="/login">
            <Button variant="luxe" size="sm" leftIcon={<LogIn size={16} />}>
              Connexion
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="outline-gold" size="sm" leftIcon={<UserPlus size={16} />}>
              Inscription
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}