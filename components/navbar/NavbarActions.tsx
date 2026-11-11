// components/navbar/NavbarActions.tsx
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

import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { useCart } from '@/contexts/CartContext'

import { NavbarCartPreview } from './NavbarCartPreview'

import {
  Bell,
  BellDot,
  ClipboardCheck,
  Heart,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  MonitorSmartphone,
  Moon,
  Settings,
  ShoppingBag,
  Sun,
  Truck,
  User,
  UserPlus,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ThemeMode = 'auto' | 'light' | 'dark'

export interface CartItem {
  id: string
  nom: string
  prix?: number
  quantite: number
  image?: string
  variante?: any
}

export interface NavbarActionsProps {
  theme?: 'light' | 'dark'
  toggleTheme?: () => void
  themeMode?: ThemeMode
  resolvedTheme?: 'light' | 'dark'
  onThemeCycle?: () => void
  showMobileActions?: boolean
  notifCount: number
  itemCount: number
  isSyncing: boolean
  items: CartItem[]
  cartPreviewOpen?: boolean
  onCartPreviewChange?: (open: boolean) => void
  userMenuOpen?: boolean
  onUserMenuToggle?: () => void
  avatarUrl: string | null
  user: any | null
  isAdmin: boolean
  isLivreur: boolean
  walletBalance?: number | null
  onLogout: () => void
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLES                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const actionButtonBase =
  'relative inline-flex h-10 w-10 items-center justify-center rounded-control text-fg-muted transition-colors duration-200 motion-reduce:transition-none hover:bg-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

const notificationBadgeClass =
  'absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-pill bg-accent px-1 text-[9px] font-bold leading-none text-accent-contrast ring-2 ring-surface'

const authPrimaryClass =
  'inline-flex h-9 items-center justify-center gap-2 rounded-pill bg-accent px-3 text-xs font-semibold text-accent-contrast shadow-card transition-colors duration-200 motion-reduce:transition-none hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

const authSecondaryClass =
  'inline-flex h-9 items-center justify-center gap-2 rounded-pill border border-line bg-surface px-3 text-xs font-semibold text-fg transition-colors duration-200 motion-reduce:transition-none hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

const menuRowClass =
  'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm text-fg-muted transition-colors duration-200 motion-reduce:transition-none hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

const menuRowDangerClass =
  'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm text-danger transition-colors duration-200 motion-reduce:transition-none hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL MENU ROW                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function MenuRow({
  href,
  icon,
  label,
  onClick,
  danger = false,
  external = false,
}: {
  href?: string
  icon?: React.ReactNode
  label: string
  onClick?: () => void
  danger?: boolean
  external?: boolean
}) {
  const content = (
    <>
      {icon ? (
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center',
            danger ? 'text-danger' : 'text-fg-subtle'
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}

      <span className="min-w-0 flex-1 truncate">{label}</span>
    </>
  )

  const className = danger ? menuRowDangerClass : menuRowClass

  if (href) {
    const handleClick = onClick
      ? () => {
          onClick()
        }
      : undefined

    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          role="menuitem"
          onClick={handleClick}
        >
          {content}
        </a>
      )
    }

    return (
      <Link
        href={href}
        className={className}
        role="menuitem"
        onClick={handleClick}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      role="menuitem"
    >
      {content}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NAVBAR ACTIONS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarActions({
  themeMode,
  resolvedTheme,
  onThemeCycle,
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
  onLogout,
  className,
}: NavbarActionsProps) {
  const cart = useCart() as any

  const cartRef = useRef<HTMLDivElement | null>(null)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const cartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [mounted, setMounted] = useState(false)
  const [internalCartOpen, setInternalCartOpen] = useState(false)
  const [internalUserMenuOpen, setInternalUserMenuOpen] = useState(false)

  const isCartControlled = typeof cartPreviewOpen === 'boolean'
  const isUserMenuControlled = typeof userMenuOpen === 'boolean'

  const cartOpen = isCartControlled ? cartPreviewOpen : internalCartOpen
  const userMenuOpenState = isUserMenuControlled
    ? userMenuOpen
    : internalUserMenuOpen

  useEffect(() => {
    setMounted(true)
  }, [])

  const clearCartTimer = useCallback(() => {
    if (cartTimerRef.current) {
      clearTimeout(cartTimerRef.current)
      cartTimerRef.current = null
    }
  }, [])

  const setCartOpen = useCallback(
    (open: boolean) => {
      if (typeof onCartPreviewChange === 'function') {
        onCartPreviewChange(open)
        return
      }

      setInternalCartOpen(open)
    },
    [onCartPreviewChange]
  )

  const openCartPreview = useCallback(() => {
    clearCartTimer()
    setCartOpen(true)
  }, [clearCartTimer, setCartOpen])

  const closeCartPreview = useCallback(() => {
    clearCartTimer()

    cartTimerRef.current = setTimeout(() => {
      setCartOpen(false)
    }, 180)
  }, [clearCartTimer, setCartOpen])

  const handleCartBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const relatedTarget = event.relatedTarget as Node | null

      if (relatedTarget && cartRef.current?.contains(relatedTarget)) {
        return
      }

      closeCartPreview()
    },
    [closeCartPreview]
  )

  const toggleUserMenu = useCallback(() => {
    if (typeof onUserMenuToggle === 'function') {
      onUserMenuToggle()
      return
    }

    setInternalUserMenuOpen((previous) => !previous)
  }, [onUserMenuToggle])

  const closeUserMenu = useCallback(() => {
    if (typeof onUserMenuToggle === 'function') {
      if (userMenuOpen) {
        onUserMenuToggle()
      }

      return
    }

    setInternalUserMenuOpen(false)
  }, [onUserMenuToggle, userMenuOpen])

  /* ───────────────────────────────────────────────────────────── */
  /*  CLICK OUTSIDE                                                */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!userMenuOpenState) return

    const handleMouseDown = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        closeUserMenu()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeUserMenu()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeUserMenu, userMenuOpenState])

  useEffect(() => {
    return () => {
      clearCartTimer()
    }
  }, [clearCartTimer])

  /* ───────────────────────────────────────────────────────────── */
  /*  MENU KEYBOARD NAVIGATION                                     */
  /* ───────────────────────────────────────────────────────────── */

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const menu = event.currentTarget
      const menuItems = Array.from(
        menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
      )

      if (menuItems.length === 0) return

      const activeElement = document.activeElement as HTMLElement | null
      let currentIndex = activeElement ? menuItems.indexOf(activeElement) : -1

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          currentIndex =
            currentIndex < 0 ? 0 : Math.min(currentIndex + 1, menuItems.length - 1)
          menuItems[currentIndex]?.focus()
          break

        case 'ArrowUp':
          event.preventDefault()
          currentIndex =
            currentIndex <= 0 ? menuItems.length - 1 : currentIndex - 1
          menuItems[currentIndex]?.focus()
          break

        case 'Home':
          event.preventDefault()
          menuItems[0]?.focus()
          break

        case 'End':
          event.preventDefault()
          menuItems[menuItems.length - 1]?.focus()
          break

        default:
          break
      }
    },
    []
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  THEME                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const currentThemeMode: ThemeMode | null = themeMode ?? null
  const currentResolvedTheme: 'light' | 'dark' = resolvedTheme ?? 'light'

  /* ───────────────────────────────────────────────────────────── */
  /*  CART                                                         */
  /* ───────────────────────────────────────────────────────────── */

  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items])

  const handleRemoveCartItem = useCallback(
    (id: string) => {
      cart?.removeItem?.(id)
    },
    [cart]
  )

  const notificationAriaLabel =
    mounted && notifCount > 0
      ? `Notifications — ${notifCount} non lue${notifCount > 1 ? 's' : ''}`
      : 'Notifications'

  const cartAriaLabel =
    mounted && itemCount > 0
      ? `Panier — ${itemCount} article${itemCount > 1 ? 's' : ''}`
      : 'Panier'

  const hasAvatar = Boolean(avatarUrl && avatarUrl.trim() !== '')
  const displayName = user?.email?.split('@')[0] || 'Utilisateur'
  const userInitial = (displayName[0] || 'U').toUpperCase()

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Thème */}
      {typeof onThemeCycle === 'function' ? (
        <Tooltip content="Basculer le thème">
          <button
            type="button"
            onClick={onThemeCycle}
            className={actionButtonBase}
            aria-label="Basculer le thème"
          >
            <span
              className="relative inline-flex h-[18px] w-[18px]"
              aria-hidden="true"
            >
              <MonitorSmartphone
                size={18}
                className={cn(
                  'absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none',
                  mounted
                    ? currentThemeMode === 'auto'
                      ? 'opacity-100'
                      : 'opacity-0'
                    : 'opacity-0'
                )}
              />

              <Sun
                size={18}
                className={cn(
                  'absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none',
                  mounted
                    ? currentThemeMode !== 'auto' &&
                      currentResolvedTheme === 'light'
                      ? 'opacity-100'
                      : 'opacity-0'
                    : 'opacity-100 dark:opacity-0'
                )}
              />

              <Moon
                size={18}
                className={cn(
                  'absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none',
                  mounted
                    ? currentThemeMode !== 'auto' &&
                      currentResolvedTheme === 'dark'
                      ? 'opacity-100'
                      : 'opacity-0'
                    : 'opacity-0 dark:opacity-100'
                )}
              />
            </span>
          </button>
        </Tooltip>
      ) : null}

      {/* Notifications */}
      <Tooltip content="Notifications">
        <Link
          href="/profile/notifications"
          className={actionButtonBase}
          aria-label={notificationAriaLabel}
        >
          {mounted && notifCount > 0 ? (
            <BellDot size={18} aria-hidden="true" />
          ) : (
            <Bell size={18} aria-hidden="true" />
          )}

          {mounted && notifCount > 0 && (
            <span className={notificationBadgeClass} aria-hidden="true">
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </Link>
      </Tooltip>

      {/* Favoris */}
      <Tooltip content="Favoris">
        <Link
          href="/profile/favoris"
          className={actionButtonBase}
          aria-label="Favoris"
        >
          <Heart size={18} aria-hidden="true" />
        </Link>
      </Tooltip>

      {/* Panier + aperçu desktop */}
      <div
        ref={cartRef}
        className="relative"
        onMouseEnter={openCartPreview}
        onMouseLeave={closeCartPreview}
        onFocusCapture={openCartPreview}
        onBlurCapture={handleCartBlur}
      >
        <Tooltip content="Panier">
          <Link
            href="/panier"
            className={actionButtonBase}
            aria-label={cartAriaLabel}
            onClick={() => setCartOpen(false)}
          >
            <ShoppingBag size={18} aria-hidden="true" />

            {mounted && itemCount > 0 && (
              <span className={notificationBadgeClass} aria-hidden="true">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}

            {mounted && isSyncing && (
              <Loader2
                size={12}
                className="absolute -bottom-0.5 -right-0.5 motion-safe:animate-spin text-accent"
                aria-hidden="true"
              />
            )}
          </Link>
        </Tooltip>

        {cartOpen ? (
          <NavbarCartPreview
            items={safeItems as any}
            totalItems={itemCount}
            onRemove={handleRemoveCartItem}
            onClose={() => setCartOpen(false)}
          />
        ) : null}
      </div>

      {/* Compte utilisateur */}
      {!user ? (
        <div className="ml-1 flex items-center gap-2">
          <Link href="/login" className={authSecondaryClass}>
            <LogIn size={14} aria-hidden="true" />
            <span className="hidden xl:inline">Connexion</span>
          </Link>

          <Link href="/register" className={authPrimaryClass}>
            <UserPlus size={14} aria-hidden="true" />
            <span className="hidden xl:inline">Inscription</span>
          </Link>
        </div>
      ) : (
        <div ref={userMenuRef} className="relative ml-1">
          <button
            type="button"
            onClick={toggleUserMenu}
            aria-expanded={userMenuOpenState}
            aria-haspopup="menu"
            aria-label="Menu du compte"
            className="flex items-center gap-2 rounded-control p-1 pr-2 transition-colors duration-200 motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-pill bg-accent text-xs font-bold text-accent-contrast shadow-card">
              {mounted && hasAvatar ? (
                <Image
                  src={avatarUrl!}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-pill object-cover"
                />
              ) : (
                userInitial
              )}
            </span>

            <span className="hidden max-w-[8rem] truncate text-xs font-semibold text-fg xl:inline">
              {displayName}
            </span>
          </button>

          {userMenuOpenState ? (
            <div
              role="menu"
              aria-label="Menu utilisateur"
              onKeyDown={handleMenuKeyDown}
              className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-card border border-line bg-surface p-2 shadow-card"
            >
              <div className="mb-1 flex items-center gap-3 rounded-control bg-muted px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-accent text-sm font-bold text-accent-contrast">
                  {mounted && hasAvatar ? (
                    <Image
                      src={avatarUrl!}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-pill object-cover"
                    />
                  ) : (
                    userInitial
                  )}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">
                    {displayName}
                  </p>

                  <p className="truncate text-xs text-fg-subtle">
                    {user?.email ?? 'Compte Gercie'}
                  </p>
                </div>
              </div>

              <MenuRow
                href="/profile"
                icon={<User size={16} />}
                label="Mon compte"
                onClick={closeUserMenu}
              />

              <MenuRow
                href="/profile/commandes"
                icon={<ClipboardCheck size={16} />}
                label="Mes commandes"
                onClick={closeUserMenu}
              />

              <MenuRow
                href="/profile/favoris"
                icon={<Heart size={16} />}
                label="Mes favoris"
                onClick={closeUserMenu}
              />

              <MenuRow
                href="/profile/notifications"
                icon={<Bell size={16} />}
                label="Notifications"
                onClick={closeUserMenu}
              />

              {isAdmin ? (
                <MenuRow
                  href="/admin"
                  icon={<LayoutDashboard size={16} />}
                  label="Administration"
                  onClick={closeUserMenu}
                />
              ) : null}

              {isLivreur ? (
                <MenuRow
                  href="/dashboard/livreur"
                  icon={<Truck size={16} />}
                  label="Espace Livreur"
                  onClick={closeUserMenu}
                />
              ) : null}

              <MenuRow
                href="/profile/parametres"
                icon={<Settings size={16} />}
                label="Paramètres"
                onClick={closeUserMenu}
              />

              <div className="my-1 h-px bg-line" aria-hidden="true" />

              <MenuRow
                icon={<LogOut size={16} />}
                label="Déconnexion"
                danger
                onClick={() => {
                  closeUserMenu()
                  onLogout()
                }}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default NavbarActions