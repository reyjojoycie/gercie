// components/navbar/NavbarUserMenu.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'

import Link from 'next/link'
import Image from 'next/image'

import {
  motion,
  useReducedMotion,
} from 'framer-motion'

import { cn } from '@/lib/utils'
import { useTheme } from '@/contexts/ThemeContext'

import {
  NavbarMenuSeparator,
  UserMenuItem,
  type NavbarUserMenuLink,
} from './NavbarSubComponents'

import {
  Bell,
  ClipboardCheck,
  Headset,
  Heart,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Moon,
  Settings,
  Sun,
  Truck,
  User,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ThemeMode = 'auto' | 'light' | 'dark'

export interface NavbarUserMenuProps {
  /** Objet utilisateur */
  user: {
    email?: string | null
    name?: string | null
    prenom?: string | null
    nom?: string | null
    avatar_url?: string | null
  } | null

  /** L’utilisateur est-il administrateur ? */
  isAdmin?: boolean

  /** L’utilisateur est-il livreur ? */
  isLivreur?: boolean

  /** Nombre de notifications non lues */
  notifCount?: number

  /** Callback de déconnexion */
  onLogout: () => void

  /** Callback pour fermer le menu */
  onClose: () => void

  /** Liens personnalisés supplémentaires */
  extraLinks?: NavbarUserMenuLink[]

  /** Mode thème à 3 états */
  themeMode?: ThemeMode

  /** Thème réellement appliqué quand themeMode === 'auto' */
  resolvedTheme?: 'light' | 'dark'

  /** Cycle thème premium */
  onThemeCycle?: () => void

  /** Ancienne bascule clair/sombre */
  toggleTheme?: () => void

  /** Sélection directe du mode thème */
  setThemeMode?: (mode: ThemeMode) => void

  /** Classes additionnelles */
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  THEME OPTIONS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const themeOptions: Array<{
  value: ThemeMode
  label: string
  icon: typeof Sun | typeof Moon | typeof MonitorSmartphone
}> = [
  {
    value: 'auto',
    label: 'Auto',
    icon: MonitorSmartphone,
  },
  {
    value: 'light',
    label: 'Clair',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Sombre',
    icon: Moon,
  },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function getDisplayName(user?: NavbarUserMenuProps['user']): string {
  if (!user) return 'Utilisateur'

  const fullName = [user.prenom, user.nom].filter(Boolean).join(' ').trim()

  if (fullName) return fullName
  if (user.name) return user.name
  if (user.email) return user.email.split('@')[0] ?? 'Utilisateur'

  return 'Utilisateur'
}

function getUserInitial(user?: NavbarUserMenuProps['user']): string {
  const name = getDisplayName(user)
  return name.charAt(0).toUpperCase() || 'U'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarUserMenu({
  user,
  isAdmin = false,
  isLivreur = false,
  notifCount = 0,
  onLogout,
  onClose,
  extraLinks = [],
  themeMode,
  resolvedTheme,
  onThemeCycle,
  toggleTheme,
  setThemeMode,
  className,
}: NavbarUserMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useReducedMotion()

  const themeContext = useTheme() as any

  const [mounted, setMounted] = useStateSafe()

  const currentThemeMode: ThemeMode =
    themeMode ??
    themeContext?.themeMode ??
    'auto'

  const currentResolvedTheme: 'light' | 'dark' =
    resolvedTheme ??
    themeContext?.resolvedTheme ??
    'light'

  const hasAvatar = Boolean(user?.avatar_url && user.avatar_url.trim() !== '')
  const displayName = getDisplayName(user)
  const userInitial = getUserInitial(user)

  const showThemeSection = Boolean(
    setThemeMode ||
      onThemeCycle ||
      toggleTheme ||
      themeContext?.setThemeMode ||
      themeContext?.setThemeChoice ||
      themeContext?.cycleTheme ||
      themeContext?.toggleTheme
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  MOUNT                                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setMounted(true)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  THEME ACTIONS                                                */
  /* ───────────────────────────────────────────────────────────── */

  const handleThemeSelect = useCallback(
    (mode: ThemeMode) => {
      if (typeof setThemeMode === 'function') {
        setThemeMode(mode)
        return
      }

      if (typeof themeContext?.setThemeMode === 'function') {
        themeContext.setThemeMode(mode)
        return
      }

      if (typeof themeContext?.setThemeChoice === 'function') {
        themeContext.setThemeChoice(mode === 'auto' ? 'system' : mode)
        return
      }

      if (typeof onThemeCycle === 'function') {
        onThemeCycle()
        return
      }

      if (typeof toggleTheme === 'function') {
        toggleTheme()
      }
    },
    [onThemeCycle, setThemeMode, themeContext, toggleTheme]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  LOGOUT                                                       */
  /* ───────────────────────────────────────────────────────────── */

  const handleLogout = useCallback(() => {
    onLogout()
    onClose()
  }, [onClose, onLogout])

  /* ───────────────────────────────────────────────────────────── */
  /*  KEYBOARD NAVIGATION                                          */
  /* ───────────────────────────────────────────────────────────── */

  const getFocusableItems = useCallback(() => {
    if (!containerRef.current) return []

    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>('[data-menu-item]')
    ).filter(
      (element) =>
        element.offsetWidth > 0 ||
        element.offsetHeight > 0 ||
        element.getClientRects().length > 0
    )
  }, [])

  useEffect(() => {
    if (!mounted) return

    const items = getFocusableItems()
    items[0]?.focus({ preventScroll: true })
  }, [getFocusableItems, mounted])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const items = getFocusableItems()

      if (items.length === 0) return

      const currentIndex = items.findIndex(
        (item) => item === document.activeElement
      )

      let nextIndex = currentIndex

      if (event.key === 'ArrowDown') {
        event.preventDefault()

        nextIndex =
          currentIndex === -1
            ? 0
            : Math.min(currentIndex + 1, items.length - 1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()

        nextIndex =
          currentIndex === -1
            ? items.length - 1
            : Math.max(currentIndex - 1, 0)
      } else if (event.key === 'Home') {
        event.preventDefault()
        nextIndex = 0
      } else if (event.key === 'End') {
        event.preventDefault()
        nextIndex = items.length - 1
      } else {
        return
      }

      items[nextIndex]?.focus({ preventScroll: true })
    },
    [getFocusableItems]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  MENU ITEMS                                                   */
  /* ───────────────────────────────────────────────────────────── */

  const notificationBadge = useMemo(() => {
    if (notifCount <= 0) return undefined
    return notifCount > 9 ? '9+' : notifCount
  }, [notifCount])

  const safeExtraLinks = Array.isArray(extraLinks) ? extraLinks : []

  /* ───────────────────────────────────────────────────────────── */
  /*  MOTION                                                       */
  /* ───────────────────────────────────────────────────────────── */

  const panelMotion = prefersReducedMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 8, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 8, scale: 0.98 },
        transition: { duration: 0.16, ease: 'easeOut' as const },
      }

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  if (!user) return null

  return (
    <motion.div
      ref={containerRef}
      role="menu"
      aria-label="Menu du compte"
      onKeyDown={handleKeyDown}
      {...panelMotion}
      className={cn(
        'absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))]',
        'overflow-hidden rounded-card border border-line bg-surface text-fg',
        'shadow-overlay',
        className
      )}
    >
      <div className="max-h-[min(28rem,calc(100vh-8rem))] overflow-y-auto p-2">
        {/* ====================================================
            USER HEADER
           ==================================================== */}
        <div className="mb-2 rounded-card border border-line bg-muted p-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'relative flex h-10 w-10 shrink-0 items-center justify-center',
                'overflow-hidden rounded-full border border-line bg-surface'
              )}
            >
              {hasAvatar ? (
                <Image
                  src={user.avatar_url as string}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="text-sm font-bold text-accent">
                  {userInitial}
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">
                {displayName}
              </p>

              {user.email && (
                <p className="truncate text-xs text-fg-muted">
                  {user.email}
                </p>
              )}
            </div>
          </div>

          {(isAdmin || isLivreur) && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {isAdmin && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border border-accent/20',
                    'bg-accent-soft px-2 py-0.5 text-[10px] font-bold leading-none text-accent'
                  )}
                >
                  Admin
                </span>
              )}

              {isLivreur && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border border-success/20',
                    'bg-success-soft px-2 py-0.5 text-[10px] font-bold leading-none text-success'
                  )}
                >
                  Livreur
                </span>
              )}
            </div>
          )}
        </div>

        {/* ====================================================
            THEME CONTROL
           ==================================================== */}
        {showThemeSection && (
          <>
            <div className="mb-2 rounded-card border border-line bg-raised/50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                Apparence
              </p>

              <div
                role="group"
                aria-label="Mode d’affichage"
                className="grid grid-cols-3 gap-1 rounded-pill border border-line bg-muted p-1"
              >
                {themeOptions.map((option) => {
                  const Icon = option.icon
                  const isActive = currentThemeMode === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-menu-item
                      onClick={() => handleThemeSelect(option.value)}
                      aria-pressed={isActive}
                      className={cn(
                        'inline-flex h-9 items-center justify-center gap-1.5 rounded-pill text-xs font-semibold',
                        'transition-colors duration-200 ease-out',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        'focus-visible:ring-offset-2 focus-visible:ring-offset-muted',
                        isActive
                          ? 'bg-surface text-accent shadow-card'
                          : 'text-fg-muted hover:bg-surface/70 hover:text-fg'
                      )}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span>{option.label}</span>
                    </button>
                  )
                })}
              </div>

              {currentThemeMode === 'auto' && (
                <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
                  Mode automatique — thème actuel :{' '}
                  <span className="font-semibold text-fg-muted">
                    {currentResolvedTheme === 'dark' ? 'sombre' : 'clair'}
                  </span>
                </p>
              )}
            </div>

            <NavbarMenuSeparator spacing="sm" />
          </>
        )}

        {/* ====================================================
            MAIN LINKS
           ==================================================== */}
        <div className="space-y-0.5 py-1">
          <UserMenuItem
            href="/profile"
            icon={<User size={18} />}
            label="Mon compte"
            description="Profil et informations"
          />

          <UserMenuItem
            href="/profile/commandes"
            icon={<ClipboardCheck size={18} />}
            label="Mes commandes"
            description="Suivre vos achats"
          />

          <UserMenuItem
            href="/profile/favoris"
            icon={<Heart size={18} />}
            label="Favoris"
            description="Produits enregistrés"
          />

          <UserMenuItem
            href="/profile/notifications"
            icon={<Bell size={18} />}
            label="Notifications"
            badge={notificationBadge}
            badgeVariant="accent"
          />

          <UserMenuItem
            href="/profile/parametres"
            icon={<Settings size={18} />}
            label="Paramètres"
            description="Préférences du compte"
          />

          {isAdmin && (
            <UserMenuItem
              href="/admin"
              icon={<LayoutDashboard size={18} />}
              label="Administration"
              description="Gestion du site"
            />
          )}

          {isLivreur && (
            <UserMenuItem
              href="/dashboard/livreur"
              icon={<Truck size={18} />}
              label="Espace Livreur"
              description="Tournées et livraisons"
            />
          )}

          <UserMenuItem
            href="/support"
            icon={<Headset size={18} />}
            label="Aide & Support"
            description="Contacter l’équipe"
          />

          {safeExtraLinks.map((link, index) => (
            <UserMenuItem
              key={`${link.href}-${index}`}
              href={link.href}
              icon={link.icon}
              label={link.label}
              description={link.description}
              badge={link.badge}
            />
          ))}
        </div>

        {/* ====================================================
            FOOTER ACTIONS
           ==================================================== */}
        <NavbarMenuSeparator spacing="sm" />

        <div className="space-y-0.5 py-1">
          <UserMenuItem
            icon={<LogOut size={18} />}
            label="Déconnexion"
            danger
            onClick={handleLogout}
          />
        </div>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SAFE MOUNT HOOK                                                */
/* ═══════════════════════════════════════════════════════════════ */

function useStateSafe(): [boolean, (value: boolean) => void] {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return [mounted, setMounted]
}

export default NavbarUserMenu