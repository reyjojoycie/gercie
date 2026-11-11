// components/navbar/NavbarMobileMenu.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import Link from 'next/link'
import Image from 'next/image'

import { usePathname } from 'next/navigation'

import { AnimatePresence, motion } from 'framer-motion'

import { cn } from '@/lib/utils'

import {
  Bell,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Gift,
  Headset,
  Heart,
  LayoutDashboard,
  LogIn,
  LogOut,
  MonitorSmartphone,
  Moon,
  Package,
  Percent,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Sun,
  Truck,
  TrendingUp,
  User,
  UserPlus,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ThemeMode = 'auto' | 'light' | 'dark'

export interface MobileMenuCategory {
  id: string
  name: string
  icon?: React.ReactNode
  href: string
  children?: MobileMenuCategory[]
  badge?: string
}

export interface NavbarMobileMenuProps {
  open: boolean
  onClose: () => void
  searchQuery: string
  onSearchChange: (value: string) => void
  onSearchSubmit: (query: string) => void
  categories: MobileMenuCategory[]
  user: {
    email: string
    avatar_url?: string | null
  } | null
  isAdmin?: boolean
  isLivreur?: boolean
  theme?: 'light' | 'dark'
  toggleTheme?: () => void
  themeMode?: ThemeMode
  resolvedTheme?: 'light' | 'dark'
  onThemeCycle?: () => void
  onThemeModeChange?: (mode: ThemeMode) => void
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLES                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const menuLinkClass =
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors duration-200 hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

const menuLinkActiveClass =
  'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent'

const sectionTitleClass =
  'px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle'

/* ═══════════════════════════════════════════════════════════════ */
/*  QUICK LINK                                                     */
/* ═══════════════════════════════════════════════════════════════ */

function MobileQuickLink({
  href,
  label,
  icon,
  onClick,
  active = false,
}: {
  href: string
  label: string
  icon: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        menuLinkClass,
        active && menuLinkActiveClass
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-fg-subtle">
        {icon}
      </span>

      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CATEGORY TREE                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function MobileCategoryTree({
  items,
  onClose,
  depth = 0,
}: {
  items: MobileMenuCategory[]
  onClose: () => void
  depth?: number
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <ul className={cn('space-y-1', depth > 0 && 'ml-3 border-l border-line pl-3')}>
      {items.map((item) => {
        const hasChildren = Boolean(item.children && item.children.length > 0)
        const isOpen = openId === item.id

        return (
          <li key={item.id}>
            <div className="flex items-center gap-1">
              <Link
                href={item.href}
                onClick={onClose}
                className={cn(menuLinkClass, 'flex-1')}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-fg-subtle">
                  {item.icon ?? <Package size={16} aria-hidden="true" />}
                </span>

                <span className="min-w-0 flex-1 truncate">{item.name}</span>

                {item.badge ? (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                    {item.badge}
                  </span>
                ) : null}
              </Link>

              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  aria-expanded={isOpen}
                  aria-label={`Afficher les sous-catégories de ${item.name}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-subtle transition-colors duration-200 hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <ChevronDown
                    size={16}
                    className={cn('transition-transform duration-200', isOpen && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
              ) : null}
            </div>

            {hasChildren && isOpen ? (
              <MobileCategoryTree
                items={item.children!}
                onClose={onClose}
                depth={depth + 1}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  THEME SECTION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function MobileThemeSection({
  themeMode,
  resolvedTheme,
  onThemeCycle,
  onThemeModeChange,
  onClose,
}: {
  themeMode?: ThemeMode
  resolvedTheme?: 'light' | 'dark'
  onThemeCycle?: () => void
  onThemeModeChange?: (mode: ThemeMode) => void
  onClose: () => void
}) {
  if (!onThemeCycle && !onThemeModeChange) return null

  const modes: Array<{
    mode: ThemeMode
    label: string
    icon: React.ReactNode
  }> = [
    {
      mode: 'auto',
      label: 'Auto',
      icon: <MonitorSmartphone size={14} aria-hidden="true" />,
    },
    {
      mode: 'light',
      label: 'Clair',
      icon: <Sun size={14} aria-hidden="true" />,
    },
    {
      mode: 'dark',
      label: 'Sombre',
      icon: <Moon size={14} aria-hidden="true" />,
    },
  ]

  const activeMode =
    themeMode ?? (resolvedTheme === 'dark' ? 'dark' : 'light')

  if (typeof onThemeModeChange === 'function') {
    return (
      <div className="px-1 py-2">
        <p className={cn(sectionTitleClass, 'mb-2')}>Apparence</p>

        <div
          role="group"
          aria-label="Choix du thème"
          className="grid grid-cols-3 gap-1 rounded-pill border border-line bg-muted p-1"
        >
          {modes.map((item) => {
            const active = activeMode === item.mode

            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => {
                  onThemeModeChange(item.mode)
                  onClose()
                }}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-8 items-center justify-center gap-1.5 rounded-pill px-2 text-xs font-semibold transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  active
                    ? 'bg-surface text-accent shadow-card'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="px-1 py-2">
      <button
        type="button"
        onClick={() => {
          onThemeCycle?.()
          onClose()
        }}
        className={menuLinkClass}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-fg-subtle">
          {activeMode === 'auto' ? (
            <MonitorSmartphone size={16} aria-hidden="true" />
          ) : resolvedTheme === 'dark' ? (
            <Moon size={16} aria-hidden="true" />
          ) : (
            <Sun size={16} aria-hidden="true" />
          )}
        </span>

        <span className="min-w-0 flex-1 truncate">
          {activeMode === 'auto'
            ? 'Thème automatique'
            : resolvedTheme === 'dark'
              ? 'Mode sombre'
              : 'Mode clair'}
        </span>
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN MOBILE MENU                                               */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarMobileMenu({
  open,
  onClose,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  categories,
  user,
  isAdmin = false,
  isLivreur = false,
  themeMode,
  resolvedTheme,
  onThemeCycle,
  onThemeModeChange,
  className,
}: NavbarMobileMenuProps) {
  const pathname = usePathname() ?? '/'
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  /* ───────────────────────────────────────────────────────────── */
  /*  ESCAPE + FOCUS                                               */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    const timer = setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 80)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timer)
    }
  }, [onClose, open])

  /* ───────────────────────────────────────────────────────────── */
  /*  BODY SCROLL LOCK                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!open) return
    if (typeof document === 'undefined') return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [open])

  /* ───────────────────────────────────────────────────────────── */
  /*  CLOSE ON ROUTE CHANGE                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    onClose()
  }, [pathname, onClose])

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onSearchSubmit(searchQuery)
    },
    [onSearchSubmit, searchQuery]
  )

  const isActive = useCallback(
    (href: string) => {
      if (href === '/') return pathname === '/'
      return pathname.startsWith(href)
    },
    [pathname]
  )

  const displayName = user?.email?.split('@')[0] || 'Utilisateur'
  const userInitial = (displayName[0] || 'U').toUpperCase()
  const hasAvatar = Boolean(user?.avatar_url && user.avatar_url.trim() !== '')

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] bg-overlay/60 backdrop-blur-sm lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label="Menu mobile"
            className={cn(
              'fixed inset-y-0 left-0 z-[70] flex w-[88vw] max-w-sm flex-col border-r border-line bg-surface shadow-card lg:hidden',
              className
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <Link
                href="/"
                onClick={onClose}
                className="flex items-center gap-2 text-fg"
                aria-label="Gercie — accueil"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-contrast">
                  G
                </span>

                <span className="text-base font-semibold tracking-tight">
                  Gercie<span className="text-accent">.</span>
                </span>
              </Link>

              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted transition-colors duration-200 hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Fermer le menu"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {/* Recherche */}
              <form role="search" onSubmit={handleSearchSubmit} className="mb-5">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
                    aria-hidden="true"
                  />

                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Rechercher un produit…"
                    aria-label="Rechercher dans le menu mobile"
                    className="h-10 w-full rounded-pill border border-line bg-canvas pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                  />
                </div>
              </form>

              {/* Compte */}
              <section className="mb-6" aria-label="Compte">
                {user ? (
                  <div className="mb-3 flex items-center gap-3 rounded-card border border-line bg-muted/40 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-bold text-accent-contrast">
                      {hasAvatar ? (
                        <Image
                          src={user.avatar_url!}
                          alt=""
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        userInitial
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">
                        {displayName}
                      </p>

                      <p className="truncate text-xs text-fg-muted">
                        {user.email}
                      </p>
                    </div>

                    <Link
                      href="/profile"
                      onClick={onClose}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors duration-200 hover:bg-surface hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label="Voir le profil"
                    >
                      <ChevronRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                ) : (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <Link
                      href="/login"
                      onClick={onClose}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-pill border border-line bg-surface px-3 text-xs font-semibold text-fg transition-colors duration-200 hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <LogIn size={14} aria-hidden="true" />
                      Connexion
                    </Link>

                    <Link
                      href="/register"
                      onClick={onClose}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-accent px-3 text-xs font-semibold text-accent-contrast shadow-card transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <UserPlus size={14} aria-hidden="true" />
                      Inscription
                    </Link>
                  </div>
                )}

                <div className="space-y-1">
                  <MobileQuickLink
                    href={user ? '/profile' : '/login'}
                    label={user ? 'Mon compte' : 'Connexion'}
                    icon={<User size={18} aria-hidden="true" />}
                    onClick={onClose}
                    active={isActive(user ? '/profile' : '/login')}
                  />

                  {user ? (
                    <>
                      <MobileQuickLink
                        href="/profile/commandes"
                        label="Mes commandes"
                        icon={<ClipboardCheck size={18} aria-hidden="true" />}
                        onClick={onClose}
                        active={isActive('/profile/commandes')}
                      />

                      <MobileQuickLink
                        href="/profile/favoris"
                        label="Mes favoris"
                        icon={<Heart size={18} aria-hidden="true" />}
                        onClick={onClose}
                        active={isActive('/profile/favoris')}
                      />

                      <MobileQuickLink
                        href="/profile/notifications"
                        label="Notifications"
                        icon={<Bell size={18} aria-hidden="true" />}
                        onClick={onClose}
                        active={isActive('/profile/notifications')}
                      />

                      {isAdmin ? (
                        <MobileQuickLink
                          href="/admin"
                          label="Administration"
                          icon={<LayoutDashboard size={18} aria-hidden="true" />}
                          onClick={onClose}
                          active={isActive('/admin')}
                        />
                      ) : null}

                      {isLivreur ? (
                        <MobileQuickLink
                          href="/dashboard/livreur"
                          label="Espace Livreur"
                          icon={<Truck size={18} aria-hidden="true" />}
                          onClick={onClose}
                          active={isActive('/dashboard/livreur')}
                        />
                      ) : null}

                      <MobileQuickLink
                        href="/profile/parametres"
                        label="Paramètres"
                        icon={<Settings size={18} aria-hidden="true" />}
                        onClick={onClose}
                        active={isActive('/profile/parametres')}
                      />
                    </>
                  ) : null}
                </div>
              </section>

              {/* Actions rapides */}
              <section className="mb-6" aria-label="Actions rapides">
                <p className={cn(sectionTitleClass, 'mb-2')}>Accès rapide</p>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/panier"
                    onClick={onClose}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-card border border-line bg-surface px-3 text-xs font-semibold text-fg shadow-card transition-colors duration-200 hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ShoppingBag size={16} aria-hidden="true" />
                    Panier
                  </Link>

                  <Link
                    href="/profile/favoris"
                    onClick={onClose}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-card border border-line bg-surface px-3 text-xs font-semibold text-fg shadow-card transition-colors duration-200 hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Heart size={16} aria-hidden="true" />
                    Favoris
                  </Link>
                </div>
              </section>

              {/* Catalogue */}
              <section className="mb-6" aria-label="Catalogue">
                <div className="mb-2 flex items-center justify-between">
                  <p className={sectionTitleClass}>Catalogue</p>

                  <Link
                    href="/categories"
                    onClick={onClose}
                    className="text-[11px] font-semibold text-accent transition-colors hover:text-accent-hover"
                  >
                    Tout voir
                  </Link>
                </div>

                {categories && categories.length > 0 ? (
                  <MobileCategoryTree items={categories} onClose={onClose} />
                ) : (
                  <p className="px-1 py-3 text-xs text-fg-subtle">
                    Aucune catégorie disponible.
                  </p>
                )}
              </section>

              {/* Découvrir */}
              <section className="mb-6" aria-label="Découvrir">
                <p className={cn(sectionTitleClass, 'mb-2')}>Découvrir</p>

                <div className="space-y-1">
                  <MobileQuickLink
                    href="/promotions"
                    label="Promotions"
                    icon={<Percent size={18} aria-hidden="true" />}
                    onClick={onClose}
                    active={isActive('/promotions')}
                  />

                  <MobileQuickLink
                    href="/nouveautes"
                    label="Nouveautés"
                    icon={<Sparkles size={18} aria-hidden="true" />}
                    onClick={onClose}
                    active={isActive('/nouveautes')}
                  />

                  <MobileQuickLink
                    href="/meilleures-ventes"
                    label="Meilleures ventes"
                    icon={<TrendingUp size={18} aria-hidden="true" />}
                    onClick={onClose}
                    active={isActive('/meilleures-ventes')}
                  />

                  <MobileQuickLink
                    href="/carte-cadeau"
                    label="Cartes cadeaux"
                    icon={<Gift size={18} aria-hidden="true" />}
                    onClick={onClose}
                    active={isActive('/carte-cadeau')}
                  />

                  <MobileQuickLink
                    href="/aide/livraison"
                    label="Suivi de commande"
                    icon={<Truck size={18} aria-hidden="true" />}
                    onClick={onClose}
                    active={isActive('/aide/livraison')}
                  />

                  <MobileQuickLink
                    href="/aide/retours"
                    label="Retours"
                    icon={<RefreshCw size={18} aria-hidden="true" />}
                    onClick={onClose}
                    active={isActive('/aide/retours')}
                  />
                </div>
              </section>

              {/* Support */}
              <section className="mb-4" aria-label="Support">
                <p className={cn(sectionTitleClass, 'mb-2')}>Support</p>

                <div className="space-y-1">
                  <MobileQuickLink
                    href="/support"
                    label="Aide & Contact"
                    icon={<Headset size={18} aria-hidden="true" />}
                    onClick={onClose}
                    active={isActive('/support')}
                  />
                </div>
              </section>

              {/* Thème */}
              <MobileThemeSection
                themeMode={themeMode}
                resolvedTheme={resolvedTheme}
                onThemeCycle={onThemeCycle}
                onThemeModeChange={onThemeModeChange}
                onClose={onClose}
              />

              {/* Déconnexion */}
              {user ? (
                <div className="mt-4 border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger transition-colors duration-200 hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                  >
                    <LogOut size={18} aria-hidden="true" />
                    Déconnexion
                  </button>
                </div>
              ) : null}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}

export default NavbarMobileMenu