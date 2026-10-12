'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useTheme } from '@/contexts/ThemeContext'
import {
  Menu,
} from 'lucide-react'
import React from 'react'

// Lib de catégories
import { categoryTree, getCategoryIconComponent } from '@/lib/categories'
import type { CategoryNode } from '@/lib/categories'

// Sous‑composants
import { NavbarTopBar } from './NavbarTopBar'
import { NavbarSearch } from './NavbarSearch'
import { NavbarMegaMenu } from './NavbarMegaMenu'
import { NavbarActions } from './NavbarActions'
import { NavbarMobileMenu } from './NavbarMobileMenu'
import { NavbarSecondaryNav } from './NavbarSecondaryNav'

// Types pour les composants de navigation
export interface MegaMenuCategory {
  id: string
  name: string
  icon: React.ReactNode
  href: string
  children?: MegaMenuCategory[]   // récursif
  badge?: string
  badgeVariant?: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral'
}

export interface MobileCategory {
  id: string
  name: string
  icon: React.ReactNode
  href: string
  children?: MobileCategory[]
}

/* ==========================================================================
   Helper de conversion CategoryNode → MegaMenuCategory / MobileCategory
   ========================================================================== */
function convertCategoryNode(node: CategoryNode): MegaMenuCategory {
  return {
    id: node.id,
    name: node.name,
    icon: React.createElement(getCategoryIconComponent(node.icon), { size: 20 }),
    href: `/categories/${node.id}`,
    children: node.children ? node.children.map(convertCategoryNode) : undefined,
  }
}

export default function Navbar() {
  const { user, logout, isAdmin, isLivreur } = useAuth()
  const { itemCount, items, isSyncing } = useCart()
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()

  // États partagés
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [megaMenuOpen, setMegaMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  // Génération des catégories à partir de l’arbre central
  const categories = useMemo<MegaMenuCategory[]>(() => {
    return categoryTree.map(convertCategoryNode)
  }, [])

  // Détection du scroll
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Chargement des données utilisateur (sécurisé contre les 401)
  useEffect(() => {
    if (!user) {
      setAvatarUrl(null)
      setWalletBalance(null)
      setNotifCount(0)
      return
    }
    fetch('/api/user/profile')
      .then(res => { if (!res.ok) return; return res.json(); })
      .then(data => { if (data) setAvatarUrl(data.avatar_url || null); })
      .catch(() => {})
    fetch('/api/user/wallet')
      .then(res => { if (!res.ok) return; return res.json(); })
      .then(data => { if (data) setWalletBalance(data.balance ?? 0); })
      .catch(() => {})
    fetch('/api/user/notifications-count')
      .then(res => { if (!res.ok) return; return res.json(); })
      .then(data => { if (data) setNotifCount(data.count || 0); })
      .catch(() => {})
  }, [user])

  const closeAll = useCallback(() => {
    setMobileMenuOpen(false)
    setUserMenuOpen(false)
    setMegaMenuOpen(false)
    setCartPreviewOpen(false)
  }, [])

  const handleSearchSubmit = useCallback((query: string) => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
      setSearchFocused(false)
      setSearchQuery('')
    }
  }, [router])

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 transition-all duration-500',
          isScrolled
            ? 'backdrop-blur-xl bg-white/70 dark:bg-[#0b1120]/80 shadow-soft border-b border-gold-400/10'
            : 'backdrop-blur-xl bg-white/70 dark:bg-[#0b1120]/80 border-b border-gold-400/10'
        )}
      >
        {/* Barre supérieure */}
        <NavbarTopBar />

        {/* Barre principale */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 lg:h-18 gap-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 shrink-0" onClick={closeAll}>
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-r from-gold-500 to-gold-700 flex items-center justify-center shadow-gold">
                <span className="text-midnight-900 font-bold text-lg lg:text-xl">G</span>
              </div>
              <span className="text-xl lg:text-2xl font-bold text-neutral-900 dark:text-neutral-100 hidden sm:block font-serif tracking-tight">
                ERCIE
              </span>
            </Link>

            {/* Méga-menu (desktop) – reçoit les catégories complètes */}
            <NavbarMegaMenu
              open={megaMenuOpen}
              onOpenChange={setMegaMenuOpen}
              categories={categories}
              onLinkClick={() => setMegaMenuOpen(false)}
            />

            {/* Recherche (desktop) */}
            <NavbarSearch
              query={searchQuery}
              onChange={setSearchQuery}
              focused={searchFocused}
              onFocusChange={setSearchFocused}
              onSubmit={handleSearchSubmit}
            />

            {/* Actions (icônes) */}
            <NavbarActions
              theme={theme}
              toggleTheme={toggleTheme}
              notifCount={notifCount}
              itemCount={itemCount}
              isSyncing={isSyncing}
              items={items}
              cartPreviewOpen={cartPreviewOpen}
              onCartPreviewChange={setCartPreviewOpen}
              userMenuOpen={userMenuOpen}
              onUserMenuToggle={() => setUserMenuOpen(!userMenuOpen)}
              avatarUrl={avatarUrl}
              user={user}
              isAdmin={isAdmin}
              isLivreur={isLivreur}
              walletBalance={walletBalance}
              onLogout={() => { logout(); closeAll() }}
              onMobileMenuOpen={() => setMobileMenuOpen(true)}
            />

            {/* Bouton burger mobile */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Menu mobile"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>

        {/* Navigation secondaire (desktop) */}
        <NavbarSecondaryNav />
      </header>

      {/* Menu mobile (hors header) – reçoit les mêmes catégories */}
      <NavbarMobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        categories={categories as any}  // compatible MobileCategory[]
        user={user}
        isAdmin={isAdmin}
        isLivreur={isLivreur}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    </>
  )
}