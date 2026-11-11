// components/navbar/Navbar.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import Link from 'next/link'
import Image from 'next/image'

import { useRouter, usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useCategories } from '@/hooks/useCategories'

import { NavbarTopBar } from './NavbarTopBar'
import { NavbarSearch } from './NavbarSearch'
import { NavbarMegaMenu } from './NavbarMegaMenu'
import { NavbarActions } from './NavbarActions'
import { NavbarMobileMenu } from './NavbarMobileMenu'
import { NavbarSecondaryNav } from './NavbarSecondaryNav'
import { NavbarMobileSearch } from './NavbarMobileSearch'

import {
  Heart,
  Loader2,
  Menu,
  Package,
  ShoppingBag,
  User,
} from 'lucide-react'

import * as Icons from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ThemeMode = 'auto' | 'light' | 'dark'

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPAT TEMPORAIRE                                              */
/*                                                                 */
/*  Ces casts permettent à Navbar.tsx d'être la nouvelle source    */
/*  de vérité architecturale, même si certains sous-composants     */
/*  ne sont pas encore totalement mis à jour.                      */
/* ═══════════════════════════════════════════════════════════════ */

const TopBar = NavbarTopBar as any
const Search = NavbarSearch as any
const MegaMenu = NavbarMegaMenu as any
const Actions = NavbarActions as any
const MobileMenu = NavbarMobileMenu as any
const SecondaryNav = NavbarSecondaryNav as any
const MobileSearch = NavbarMobileSearch as any

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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tag = target.tagName.toLowerCase()

  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  )
}

function getCategoryIcon(icon?: unknown, size = 18): React.ReactNode {
  const name = typeof icon === 'string' ? icon.trim() : ''

  if (name && name in Icons) {
    const IconComponent = (Icons as any)[name]

    if (IconComponent) {
      return <IconComponent size={size} strokeWidth={1.8} aria-hidden="true" />
    }
  }

  return <Package size={size} strokeWidth={1.8} aria-hidden="true" />
}

function mapCategoryNodes(nodes: unknown): any[] {
  if (!Array.isArray(nodes)) return []

  return nodes
    .map((rawNode, index) => {
      if (!rawNode || typeof rawNode !== 'object') return null

      const node = rawNode as Record<string, unknown>

      const id = String(node.id ?? node._id ?? node.slug ?? node.name ?? index)
      const name = String(node.name ?? node.nom ?? 'Catégorie')
      const slug = String(node.slug ?? id)

      return {
        id,
        name,
        icon: getCategoryIcon(node.icon),
        href: slug ? `/categories/${slug}` : `/categories?id=${id}`,
        badge: node.badge ? String(node.badge) : undefined,
        featured: Boolean(node.featured),
        children: mapCategoryNodes(
          node.children ?? node.enfants ?? node.subcategories
        ),
      }
    })
    .filter(Boolean)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLES PARTAGÉS                                                */
/* ═══════════════════════════════════════════════════════════════ */

const mobileIconButton =
  'relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-fg-muted transition-colors duration-200 hover:bg-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

const mobileBadge =
  'absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-accent-contrast ring-2 ring-surface'

const notificationDot =
  'absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-surface'

/* ═══════════════════════════════════════════════════════════════ */
/*  NAVBAR                                                         */
/* ═══════════════════════════════════════════════════════════════ */

export default function Navbar() {
  const router = useRouter()
  const pathname = normalizePathname(usePathname() ?? '/')

  const auth = useAuth() as any
  const user = auth?.user ?? null
  const logout = auth?.logout

  const cart = useCart() as any
  const items = Array.isArray(cart?.items) ? cart.items : []
  const itemCount =
    typeof cart?.itemCount === 'number'
      ? cart.itemCount
      : items.reduce(
          (sum: number, item: any) => sum + Number(item?.quantite ?? 1),
          0
        )
  const isSyncing = Boolean(cart?.isSyncing)

  /* ---------------------------------------------------------- */
  /* FIX HYDRATION                                              */
  /*                                                            */
  /* Le panier local peut être lu depuis localStorage côté      */
  /* client, mais pas côté serveur.                             */
  /* Donc on évite d'afficher un badge panier différent          */
  /* pendant l'hydratation React.                               */
  /* ---------------------------------------------------------- */

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const safeItemCount = mounted ? itemCount : 0
  const safeItems = mounted ? items : []

  const themeContext = useTheme() as any

  const rawThemeMode =
    themeContext?.themeChoice ??
    themeContext?.theme ??
    'auto'

  const themeMode: ThemeMode =
    mounted &&
    (rawThemeMode === 'auto' ||
      rawThemeMode === 'light' ||
      rawThemeMode === 'dark')
      ? (rawThemeMode as ThemeMode)
      : 'auto'

  const rawResolvedTheme = themeContext?.resolvedTheme

  const resolvedTheme: 'light' | 'dark' = mounted
    ? rawResolvedTheme === 'dark' || rawResolvedTheme === 'light'
      ? (rawResolvedTheme as 'light' | 'dark')
      : typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light'
    : 'light'

  const setThemeChoice =
    typeof themeContext?.setThemeChoice === 'function'
      ? themeContext.setThemeChoice
      : undefined

  const toggleTheme =
    typeof themeContext?.toggleTheme === 'function'
      ? themeContext.toggleTheme
      : undefined

  const cycleTheme = useCallback(() => {
    if (typeof setThemeChoice === 'function') {
      const order: ThemeMode[] = ['auto', 'light', 'dark']
      const currentIndex = order.indexOf(themeMode)
      const nextIndex = (currentIndex + 1) % order.length
      setThemeChoice(order[nextIndex])
      return
    }

    if (typeof toggleTheme === 'function') {
      toggleTheme()
    }
  }, [setThemeChoice, themeMode, toggleTheme])

  const categoriesQuery = useCategories() as any
  const categoriesData = categoriesQuery?.data
  const isLoadingCategories = Boolean(categoriesQuery?.isLoading)

  const categories = useMemo(() => {
    if (Array.isArray(categoriesData)) return categoriesData

    if (
      categoriesData &&
      typeof categoriesData === 'object' &&
      Array.isArray((categoriesData as any).categories)
    ) {
      return (categoriesData as any).categories
    }

    return []
  }, [categoriesData])

  const mappedCategories = useMemo(
    () => mapCategoryNodes(categories),
    [categories]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  ÉTATS UI                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const [notifCount, setNotifCount] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [isScrolled, setIsScrolled] = useState(false)
  const [isHidden, setIsHidden] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)

  const lastScrollY = useRef(0)
  const headerRef = useRef<HTMLElement | null>(null)

  const overlaysOpen =
    mobileMenuOpen ||
    cartPreviewOpen ||
    userMenuOpen ||
    searchFocused

  const overlaysOpenRef = useRef(overlaysOpen)

  useEffect(() => {
    overlaysOpenRef.current = overlaysOpen
  }, [overlaysOpen])

  const isAdmin = Boolean(
    user?.role === 'admin' ||
      user?.isAdmin === true ||
      user?.metadata?.role === 'admin'
  )

  const isLivreur = Boolean(
    user?.role === 'livreur' ||
      user?.isLivreur === true ||
      user?.metadata?.role === 'livreur'
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  SCROLL                                                       */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY

      setIsScrolled(currentY > 8)

      const documentElement = document.documentElement
      const totalHeight =
        documentElement.scrollHeight - documentElement.clientHeight

      const progress =
        totalHeight > 0
          ? Math.min(100, (currentY / totalHeight) * 100)
          : 0

      setScrollProgress(progress)

      if (overlaysOpenRef.current) {
        setIsHidden(false)
        lastScrollY.current = currentY
        return
      }

      if (currentY > 140 && currentY > lastScrollY.current + 10) {
        setIsHidden(true)
      } else if (
        currentY < lastScrollY.current - 10 ||
        currentY < 90
      ) {
        setIsHidden(false)
      }

      lastScrollY.current = currentY
    }

    handleScroll()

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  KEYBOARD                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const closeAll = useCallback(() => {
    setMobileMenuOpen(false)
    setCartPreviewOpen(false)
    setUserMenuOpen(false)
    setSearchFocused(false)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAll()
        return
      }

      if (
        event.key === '/' &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault()

        const input =
          document.querySelector<HTMLInputElement>(
            'input[type="search"]'
          )

        input?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeAll])

  /* ───────────────────────────────────────────────────────────── */
  /*  USER DATA                                                    */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!user) {
      setAvatarUrl(null)
      setNotifCount(0)
      return
    }

    let cancelled = false

    setAvatarUrl(
      typeof user.avatar_url === 'string' && user.avatar_url.trim()
        ? user.avatar_url
        : null
    )

    fetch('/api/notifications/unread-count', {
      credentials: 'include',
    })
      .then((response) => (response.ok ? response.json() : {}))
      .then((data) => {
        if (cancelled) return

        const count = Number(
          data?.count ?? data?.unread_count ?? data?.total ?? 0
        )

        setNotifCount(Number.isFinite(count) ? count : 0)
      })
      .catch(() => {
        if (!cancelled) {
          setNotifCount(0)
        }
      })

    return () => {
      cancelled = true
    }
  }, [user])

  /* ───────────────────────────────────────────────────────────── */
  /*  ROUTE CHANGE                                                 */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    closeAll()
  }, [pathname, closeAll])

  /* ───────────────────────────────────────────────────────────── */
  /*  BODY SCROLL LOCK MOBILE MENU                                 */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!mobileMenuOpen) return
    if (typeof document === 'undefined') return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [mobileMenuOpen])

  /* ───────────────────────────────────────────────────────────── */
  /*  ACTIONS                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const openMobileMenu = useCallback(() => {
    setMobileMenuOpen(true)
  }, [])

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false)
  }, [])

  const handleLogout = useCallback(() => {
    logout?.()
    closeAll()
  }, [closeAll, logout])

  const handleSearchSubmit = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return

      router.push(`/search?q=${encodeURIComponent(trimmed)}`)
      closeAll()
      setSearchQuery('')
    },
    [closeAll, router]
  )

  const toggleUserMenu = useCallback(() => {
    setUserMenuOpen((previous) => !previous)
    setCartPreviewOpen(false)
  }, [])

  const handleCartPreviewChange = useCallback((open: boolean) => {
    setCartPreviewOpen(open)

    if (open) {
      setUserMenuOpen(false)
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          'sticky top-0 z-50 w-full border-b border-line bg-surface/95 backdrop-blur-xl transition-transform duration-300',
          isHidden && '-translate-y-full'
        )}
      >
        {/* Progression de scroll */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-transparent"
          aria-hidden="true"
        >
          <div
            className="h-full bg-accent transition-[width] duration-100 ease-linear"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>

        {/* Top bar : desktop uniquement */}
        <div className="hidden md:block">
          <TopBar
            showOnMobile={false}
            compact
            showLanguageSwitcher={false}
            supportPhone="+243 973 868 195"
            supportHours="Lun–Sam : 8h–20h"
            showStatus
          />
        </div>

        {/* Barre principale */}
        <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 lg:px-8">
          <div className="flex h-14 items-center gap-2 md:h-16 lg:h-18">
            {/* Bouton menu mobile / tablette basse */}
            <button
              type="button"
              onClick={openMobileMenu}
              className={cn(mobileIconButton, 'lg:hidden')}
              aria-label="Ouvrir le menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu size={22} aria-hidden="true" />
            </button>

            {/* Mega menu desktop */}
            <div className="hidden md:block">
              <MegaMenu
                categories={mappedCategories}
                onLinkClick={closeAll}
                isLoading={isLoadingCategories}
                columns={4}
                label="Catalogue"
                compact={false}
                hoverDelay={200}
              />
            </div>

            {/* Logo */}
            <Link
              href="/"
              onClick={closeAll}
              className="flex shrink-0 items-center gap-2 rounded-xl px-1 py-1 text-fg transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              aria-label="Gercie — accueil"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-contrast shadow-card">
                G
              </span>

              <span className="hidden text-base font-semibold tracking-tight sm:inline">
                Gercie
                <span className="text-accent">.</span>
              </span>
            </Link>

            {/* Recherche desktop / tablette */}
            <div className="hidden min-w-0 flex-1 md:block">
              <Search
                query={searchQuery}
                onChange={setSearchQuery}
                focused={searchFocused}
                onFocusChange={setSearchFocused}
                onSubmit={handleSearchSubmit}
              />
            </div>

            {/* Actions desktop */}
            <div className="ml-auto hidden items-center gap-2 lg:flex">
              <Actions
                theme={resolvedTheme}
                toggleTheme={toggleTheme}
                themeMode={themeMode}
                resolvedTheme={resolvedTheme}
                onThemeCycle={cycleTheme}
                showMobileActions={false}
                notifCount={notifCount}
                itemCount={safeItemCount}
                isSyncing={isSyncing}
                items={safeItems}
                cartPreviewOpen={cartPreviewOpen}
                onCartPreviewChange={handleCartPreviewChange}
                userMenuOpen={userMenuOpen}
                onUserMenuToggle={toggleUserMenu}
                avatarUrl={avatarUrl}
                user={user}
                isAdmin={isAdmin}
                isLivreur={isLivreur}
                onLogout={handleLogout}
              />
            </div>

            {/* Actions directes mobile / tablette basse */}
            <div className="ml-auto flex items-center gap-1 lg:hidden">
              <Link
                href="/profile/favoris"
                onClick={closeAll}
                className={mobileIconButton}
                aria-label="Favoris"
              >
                <Heart size={20} aria-hidden="true" />
              </Link>

              <Link
                href="/panier"
                onClick={closeAll}
                className={mobileIconButton}
                aria-label={
                  safeItemCount > 0
                    ? `Panier — ${safeItemCount} article${safeItemCount > 1 ? 's' : ''}`
                    : 'Panier'
                }
              >
                <ShoppingBag size={20} aria-hidden="true" />

                {safeItemCount > 0 && (
                  <span className={mobileBadge}>
                    {safeItemCount > 99 ? '99+' : safeItemCount}
                  </span>
                )}

                {isSyncing && (
                  <Loader2
                    size={12}
                    className="absolute -bottom-0.5 -right-0.5 animate-spin text-accent"
                    aria-hidden="true"
                  />
                )}
              </Link>

              <Link
                href={user ? '/profile' : '/login'}
                onClick={closeAll}
                className={mobileIconButton}
                aria-label={user ? 'Mon compte' : 'Connexion'}
              >
                {user && avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt=""
                    width={24}
                    height={24}
                    className="rounded-full object-cover"
                    style={{ width: 24, height: 24 }}
                  />
                ) : (
                  <User size={20} aria-hidden="true" />
                )}

                {user && notifCount > 0 && (
                  <span className={notificationDot} aria-hidden="true" />
                )}
              </Link>
            </div>
          </div>

          {/* Bande de recherche mobile permanente */}
          <div className="pb-2 md:hidden">
            <MobileSearch
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={handleSearchSubmit}
              placeholder="Rechercher, photo ou voix…"
            />
          </div>
        </div>

        {/* Navigation secondaire : desktop / tablette uniquement */}
        <div className="hidden md:block">
          <SecondaryNav showOnMobile={false} />
        </div>
      </header>

      {/* Menu mobile complet */}
      <MobileMenu
        open={mobileMenuOpen}
        onClose={closeMobileMenu}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        categories={mappedCategories}
        user={user}
        isAdmin={isAdmin}
        isLivreur={isLivreur}
        theme={resolvedTheme}
        toggleTheme={toggleTheme}
        themeMode={themeMode}
        resolvedTheme={resolvedTheme}
        onThemeCycle={cycleTheme}
        onThemeModeChange={setThemeChoice}
      />
    </>
  )
}