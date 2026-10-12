'use client'

import { useState, useCallback, FormEvent } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getCategoryIconComponent } from '@/lib/categories'
import {
  Search, X, Sun, Moon, Heart, Bell, ClipboardCheck,
  Wallet, Headset, LayoutDashboard, Truck, LogIn, UserPlus, User,
  ChevronDown,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface MobileCategory {
  id: string
  name: string
  icon: React.ReactNode
  href: string
  children?: MobileCategory[]
}

export interface NavbarMobileMenuProps {
  open: boolean
  onClose: () => void
  searchQuery: string
  onSearchChange: (value: string) => void
  onSearchSubmit: (query: string) => void
  categories: MobileCategory[]
  user: any | null
  isAdmin: boolean
  isLivreur: boolean
  theme: 'light' | 'dark'
  toggleTheme: () => void
  className?: string
}

/* ================================================================== */
/*  Sous‑composant récursif pour l'accordéon                            */
/* ================================================================== */
function RecursiveCategoryItem({
  category,
  onClose,
}: {
  category: MobileCategory
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = category.children && category.children.length > 0
  const Icon = getCategoryIconComponent(category.icon?.toString())

  return (
    <div>
      <div className="flex items-center">
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full text-left text-neutral-700 dark:text-neutral-300 hover:bg-gold-400/10 hover:text-gold-600 transition-colors"
          >
            <span className="text-gold-500">{category.icon}</span>
            <span className="flex-1">{category.name}</span>
            <ChevronDown
              size={14}
              className={cn(
                'transition-transform duration-200',
                expanded && 'rotate-180'
              )}
            />
          </button>
        ) : (
          <Link
            href={category.href}
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full text-neutral-700 dark:text-neutral-300 hover:bg-gold-400/10 hover:text-gold-600 transition-colors"
          >
            <span className="text-gold-500">{category.icon}</span>
            {category.name}
          </Link>
        )}
      </div>
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden ml-4 border-l border-gold-400/20 pl-2"
          >
            {category.children!.map((child) => (
              <RecursiveCategoryItem
                key={child.id}
                category={child}
                onClose={onClose}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ================================================================== */
/*  Composant NavbarMobileMenu                                          */
/* ================================================================== */
export function NavbarMobileMenu({
  open,
  onClose,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  categories,
  user,
  isAdmin,
  isLivreur,
  theme,
  toggleTheme,
  className,
}: NavbarMobileMenuProps) {
  const handleSearch = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (searchQuery.trim()) {
        onSearchSubmit(searchQuery.trim())
        onClose()
      }
    },
    [searchQuery, onSearchSubmit, onClose]
  )

  const quickLinks = [
    ...(user
      ? [
          { href: '/profile', icon: <User size={18} />, label: 'Mon compte' },
          { href: '/profile/commandes', icon: <ClipboardCheck size={18} />, label: 'Mes commandes' },
          { href: '/profile/wallet', icon: <Wallet size={18} />, label: 'Portefeuille' },
          { href: '/profile/favoris', icon: <Heart size={18} />, label: 'Favoris' },
          { href: '/profile/notifications', icon: <Bell size={18} />, label: 'Notifications' },
        ]
      : []),
    ...(isAdmin
      ? [{ href: '/admin', icon: <LayoutDashboard size={18} />, label: 'Administration' }]
      : []),
    ...(isLivreur
      ? [{ href: '/dashboard/livreur', icon: <Truck size={18} />, label: 'Espace Livreur' }]
      : []),
    { href: '/support', icon: <Headset size={18} />, label: 'Aide & Support' },
  ]

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              'fixed top-0 right-0 bottom-0 w-[85vw] max-w-sm bg-white/95 dark:bg-midnight-900/95 backdrop-blur-xl z-[100] overflow-y-auto shadow-2xl lg:hidden',
              className
            )}
          >
            {/* En‑tête */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-midnight-500/30">
              <h2 className="font-bold text-lg text-gold-600 dark:text-gold-400">Menu</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Fermer le menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Barre de recherche mobile */}
            <div className="p-4">
              <form onSubmit={handleSearch}>
                <Input
                  variant="glass"
                  leftIcon={<Search size={18} className="text-neutral-400" />}
                  placeholder="Rechercher un produit…"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  allowClear
                  onClear={() => onSearchChange('')}
                />
              </form>
            </div>

            {/* Catégories hiérarchiques */}
            <div className="px-4 pb-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Catégories
              </h3>
              <div className="space-y-0.5">
                {categories.map((cat) => (
                  <RecursiveCategoryItem
                    key={cat.id}
                    category={cat}
                    onClose={onClose}
                  />
                ))}
              </div>
            </div>

            {/* Accès rapides */}
            {quickLinks.length > 0 && (
              <div className="px-4 pb-4">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                  Accès rapides
                </h3>
                <div className="space-y-1">
                  {quickLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={onClose}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-neutral-700 dark:text-neutral-300 hover:bg-gold-400/10 hover:text-gold-600 transition-colors"
                    >
                      <span className="text-neutral-400 dark:text-neutral-500">{link.icon}</span>
                      {link.label}
                    </Link>
                  ))}
                  <button
                    onClick={() => {
                      toggleTheme()
                      onClose()
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                    <span>{theme === 'light' ? 'Mode sombre' : 'Mode clair'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Connexion / Inscription */}
            {!user && (
              <div className="px-4 pt-2 pb-6 flex gap-3">
                <Link href="/login" onClick={onClose} className="flex-1">
                  <Button variant="luxe" fullWidth>Connexion</Button>
                </Link>
                <Link href="/register" onClick={onClose} className="flex-1">
                  <Button variant="outline-gold" fullWidth>Inscription</Button>
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}