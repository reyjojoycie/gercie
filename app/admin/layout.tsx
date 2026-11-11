// app/admin/layout.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { ScrollToTop } from '@/components/ui/ScrollToTop'

import {
  LayoutDashboard,
  Users,
  Truck,
  ShieldCheck,
  Package,
  Menu,
  ChevronDown,
  ChevronRight,
  Bell,
  Receipt,
  Sun,
  Moon,
  Home,
  ChevronLeft,
  Globe,
  SquarePlay,
  Tag,
  Flag,
  MessageCircle,
  LayoutGrid,
  Landmark,
  ClipboardCheck,
  Layers,
  Search,
  X,
  Command,
  PanelLeft,
  LogOut,
  User,
  AlertTriangle,
  WifiOff,
  Check,
  Inbox,
  ArrowRight,
  CreditCard,
  MapPin,
  ShoppingBag,
  Key,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type IconType = React.ComponentType<{
  size?: number
  className?: string
}>

interface NavChild {
  href: string
  label: string
  description?: string
}

interface NavItem {
  href: string
  label: string
  icon: IconType
  description?: string
  children?: NavChild[]
  badge?: string | number
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

interface NotificationItem {
  id: string
  title: string
  message?: string
  type?: string
  read: boolean
  created_at?: string
  href?: string
}

interface CommandItem {
  href: string
  label: string
  group: string
  icon: IconType
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NAVIGATION                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'pilotage',
    label: 'Pilotage',
    items: [
      {
        href: '/admin',
        label: 'Tableau de bord',
        icon: LayoutDashboard,
        description: 'Vue globale de l’activité',
      },
      {
        href: '/admin/commandes',
        label: 'Commandes',
        icon: ShoppingBag,
        description: 'Suivi des commandes clients',
      },
      {
        href: '/admin/transactions',
        label: 'Transactions',
        icon: Receipt,
        description: 'Paiements, remboursements, ajustements',
      },
      {
        href: '/admin/litiges',
        label: 'Litiges',
        icon: AlertTriangle,
        description: 'Réclamations et incidents',
      },
      {
        href: '/admin/dispatch',
        label: 'Dispatch',
        icon: ClipboardCheck,
        description: 'Affectation des livraisons',
      },
    ],
  },
  {
    id: 'catalogue',
    label: 'Catalogue',
    items: [
      {
        href: '/admin/produits',
        label: 'Produits',
        icon: Package,
        description: 'Gestion du catalogue',
        children: [
          { href: '/admin/produits', label: 'Tous les produits' },
          { href: '/admin/produits/ajouter', label: 'Ajouter un produit' },
        ],
      },
      {
        href: '/admin/categories',
        label: 'Catégories',
        icon: Layers,
        description: 'Arborescence des catégories',
      },
      {
        href: '/admin/home-categories',
        label: 'Catégories populaires',
        icon: LayoutGrid,
        description: 'Sections mises en avant',
      },
      {
        href: '/admin/promotions',
        label: 'Promotions',
        icon: Tag,
        description: 'Réductions et offres',
      },
      {
        href: '/admin/promo-banners',
        label: 'Bannières promo',
        icon: Flag,
        description: 'Bannières marketing',
      },
      {
        href: '/admin/hero-carousel',
        label: 'Hero carousel',
        icon: SquarePlay,
        description: 'Carrousel de la page d’accueil',
      },
      {
        href: '/admin/temoignages',
        label: 'Témoignages',
        icon: MessageCircle,
        description: 'Avis clients mis en avant',
      },
      {
        href: '/admin/trust',
        label: 'Confiance',
        icon: ShieldCheck,
        description: 'Statistiques et éléments de réassurance',
      },
    ],
  },
  {
    id: 'logistique',
    label: 'Logistique',
    items: [
      {
        href: '/admin/livraison',
        label: 'Livraison',
        icon: Globe,
        description: 'Paramètres globaux de livraison',
      },
      {
        href: '/admin/zones',
        label: 'Zones de livraison',
        icon: MapPin,
        description: 'Découpage géographique',
      },
      {
        href: '/admin/points-retrait',
        label: 'Points de retrait',
        icon: MapPin,
        description: 'Points partenaires',
      },
      {
        href: '/admin/livreurs',
        label: 'Livreurs',
        icon: Truck,
        description: 'Équipe de livraison',
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance & promos',
    items: [
      {
        href: '/admin/paiements',
        label: 'Moyens de paiement',
        icon: Landmark,
        description: 'Mobile Money, carte, virement, livraison',
      },
      {
        href: '/admin/exchange-rate',
        label: 'Taux de change',
        icon: CreditCard,
        description: 'Conversion USD / CDF',
      },
      {
        href: '/admin/codes',
        label: 'Codes promo',
        icon: Key,
        description: 'Réductions et campagnes',
      },
    ],
  },
  {
    id: 'communaute',
    label: 'Communauté',
    items: [
      {
        href: '/admin/utilisateurs',
        label: 'Utilisateurs',
        icon: Users,
        description: 'Comptes clients et droits',
      },
    ],
  },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  STORAGE KEYS                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const THEME_KEY = 'gercie-admin-theme'
const SIDEBAR_COLLAPSED_KEY = 'gercie-admin-sidebar-collapsed'
const EXPANDED_MENUS_KEY = 'gercie-admin-expanded-menus'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // silencieux
  }
}

function normalizeNotification(raw: any, index: number): NotificationItem {
  const id = String(raw?.id || raw?.uuid || `notification-${index}`)

  const title = String(
    raw?.title ||
      raw?.message ||
      raw?.text ||
      raw?.subject ||
      'Notification'
  ).trim()

  const message =
    raw?.title && raw?.message
      ? String(raw.message).trim()
      : raw?.body
        ? String(raw.body).trim()
        : undefined

  const read = Boolean(
    raw?.read ??
      raw?.is_read ??
      raw?.lu ??
      raw?.seen ??
      false
  )

  return {
    id,
    title,
    message,
    type: raw?.type ? String(raw.type) : undefined,
    read,
    created_at: raw?.created_at || raw?.date || raw?.timestamp,
    href: raw?.href || raw?.link || raw?.url || undefined,
  }
}

function formatRelativeDate(value?: string | null): string {
  if (!value) return ''

  try {
    const date = new Date(value)
    const diff = Date.now() - date.getTime()

    const minutes = Math.floor(diff / 60_000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return "à l'instant"
    if (minutes < 60) return `il y a ${minutes} min`
    if (hours < 24) return `il y a ${hours} h`
    if (days < 30) return `il y a ${days} j`

    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatSegment(segment: string): string {
  if (!segment) return ''

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (uuidRegex.test(segment)) return 'Détail'

  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getDisplayName(profile: any, fallbackEmail?: string | null): string {
  const firstName = String(profile?.prenom || '').trim()
  const lastName = String(profile?.nom || '').trim()

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  if (fullName) return fullName
  if (fallbackEmail) return fallbackEmail
  return 'Administrateur'
}

function getInitials(name: string): string {
  return String(name || 'A')
    .trim()
    .split(/\s+/)
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  const auth = useAuth() as any
  const user = auth?.user
  const authLoading = Boolean(auth?.loading)
  const logout = auth?.logout
  const contextIsAdmin = auth?.isAdmin

  /* ---------------------------------------------------------- */
  /* États auth / profil                                         */
  /* ---------------------------------------------------------- */

  const [isAdmin, setIsAdmin] = useState<boolean | null>(
    typeof contextIsAdmin === 'boolean' ? contextIsAdmin : null
  )

  const [profile, setProfile] = useState<any | null>(null)

  /* ---------------------------------------------------------- */
  /* États UI                                                    */
  /* ---------------------------------------------------------- */

  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set())

  const [search, setSearch] = useState('')

  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const [online, setOnline] = useState(true)

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)

  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0)

  /* ---------------------------------------------------------- */
  /* Refs                                                        */
  /* ---------------------------------------------------------- */

  const notifRef = useRef<HTMLDivElement | null>(null)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const commandInputRef = useRef<HTMLInputElement | null>(null)

  /* ---------------------------------------------------------- */
  /* Dérivés                                                     */
  /* ---------------------------------------------------------- */

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  )

  const displayName = useMemo(
    () => getDisplayName(profile, user?.email),
    [profile, user?.email]
  )

  const displayRole = useMemo(() => {
    const role = String(profile?.role || '').trim()

    if (role === 'super_admin') return 'Super administrateur'
    if (role === 'admin') return 'Administrateur'
    if (role === 'vendeur') return 'Vendeur'
    if (role === 'user') return 'Utilisateur'

    return isAdmin ? 'Administrateur' : 'Membre'
  }, [isAdmin, profile?.role])

  /* ---------------------------------------------------------- */
  /* Command palette items                                       */
  /* ---------------------------------------------------------- */

  const commandItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    NAV_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        items.push({
          href: item.href,
          label: item.label,
          group: group.label,
          icon: item.icon,
        })

        item.children?.forEach((child) => {
          items.push({
            href: child.href,
            label: child.label,
            group: `${group.label} › ${item.label}`,
            icon: item.icon,
          })
        })
      })
    })

    return items
  }, [])

  const labelByHref = useMemo(() => {
    const map = new Map<string, string>()

    NAV_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        map.set(item.href, item.label)

        item.children?.forEach((child) => {
          map.set(child.href, child.label)
        })
      })
    })

    return map
  }, [])

  const filteredCommands = useMemo(() => {
    const query = commandQuery.trim().toLowerCase()

    if (!query) return commandItems.slice(0, 12)

    return commandItems
      .filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          item.href.toLowerCase().includes(query) ||
          item.group.toLowerCase().includes(query)
      )
      .slice(0, 25)
  }, [commandItems, commandQuery])

  /* ---------------------------------------------------------- */
  /* Filtrage sidebar                                            */
  /* ---------------------------------------------------------- */

  const filteredNavGroups = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return NAV_GROUPS

    return NAV_GROUPS.map((group) => {
      const items = group.items
        .map((item) => {
          const children = item.children?.filter((child) =>
            child.label.toLowerCase().includes(query)
          )

          const itemMatches =
            item.label.toLowerCase().includes(query) ||
            item.href.toLowerCase().includes(query)

          if (!itemMatches && (!children || children.length === 0)) {
            return null
          }

          return {
            ...item,
            children: children && children.length > 0 ? children : item.children,
          }
        })
        .filter(Boolean) as NavItem[]

      return {
        ...group,
        items,
      }
    }).filter((group) => group.items.length > 0)
  }, [search])

  const hasSidebarResults = filteredNavGroups.some(
    (group) => group.items.length > 0
  )

  /* ---------------------------------------------------------- */
  /* Active helpers                                              */
  /* ---------------------------------------------------------- */

  const isActive = useCallback(
    (href: string) => {
      if (href === '/admin') return pathname === '/admin'
      return pathname === href || pathname.startsWith(`${href}/`)
    },
    [pathname]
  )

  const isChildActive = useCallback(
    (href: string) => pathname === href,
    [pathname]
  )

  /* ---------------------------------------------------------- */
  /* Breadcrumb                                                  */
  /* ---------------------------------------------------------- */

  const breadcrumbSegments = useMemo(() => {
    const raw = pathname.replace(/^\/admin\/?/, '')

    return raw
      .split('/')
      .filter(Boolean)
      .map((segment, index, arr) => {
        const href = `/admin/${arr.slice(0, index + 1).join('/')}`

        return {
          href,
          label: labelByHref.get(href) || formatSegment(segment),
        }
      })
  }, [labelByHref, pathname])

  /* ---------------------------------------------------------- */
  /* Effets initiaux                                             */
  /* ---------------------------------------------------------- */

  // Thème
  useEffect(() => {
    const stored = safeLocalStorageGet(THEME_KEY)

    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches

    const initialTheme =
      stored === 'dark' || stored === 'light'
        ? stored
        : prefersDark
          ? 'dark'
          : 'light'

    setTheme(initialTheme)
    document.documentElement.classList.toggle('dark', initialTheme === 'dark')
  }, [])

  // Sidebar collapsed
  useEffect(() => {
    const stored = safeLocalStorageGet(SIDEBAR_COLLAPSED_KEY)
    setCollapsed(stored === 'true')
  }, [])

  // Expanded menus persistés
  useEffect(() => {
    const stored = safeLocalStorageGet(EXPANDED_MENUS_KEY)

    if (stored) {
      try {
        const parsed = JSON.parse(stored)

        if (Array.isArray(parsed)) {
          setExpandedMenus(new Set(parsed.map(String)))
        }
      } catch {
        // silencieux
      }
    }
  }, [])

  // Auto-expand menus actifs
  useEffect(() => {
    setExpandedMenus((prev) => {
      const next = new Set(prev)

      NAV_GROUPS.forEach((group) => {
        group.items.forEach((item) => {
          if (item.children && pathname.startsWith(item.href)) {
            next.add(item.href)
          }
        })
      })

      safeLocalStorageSet(EXPANDED_MENUS_KEY, JSON.stringify(Array.from(next)))

      return next
    })
  }, [pathname])

  // Ferme menu mobile au changement de route
  useEffect(() => {
    setMobileMenuOpen(false)
    setNotifOpen(false)
    setUserMenuOpen(false)
  }, [pathname])

  // Online / offline
  useEffect(() => {
    setOnline(navigator.onLine)

    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Verrou scroll quand overlays ouverts
  useEffect(() => {
    const shouldLock = mobileMenuOpen || commandOpen

    document.body.style.overflow = shouldLock ? 'hidden' : ''

    return () => {
      document.body.style.overflow = ''
    }
  }, [commandOpen, mobileMenuOpen])

  // Click outside notifications / user menu
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node

      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false)
      }

      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  // Focus command palette
  useEffect(() => {
    if (!commandOpen) return

    const timeout = setTimeout(() => {
      commandInputRef.current?.focus()
    }, 50)

    return () => clearTimeout(timeout)
  }, [commandOpen])

  // Reset command selection
  useEffect(() => {
    setCommandSelectedIndex(0)
  }, [commandQuery])

  /* ---------------------------------------------------------- */
  /* Vérification admin                                          */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      setProfile(null)
      return
    }

    if (typeof contextIsAdmin === 'boolean') {
      setIsAdmin(contextIsAdmin)
    }

    let cancelled = false

    const checkProfile = async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from('profiles')
          .select(
            'id, email, nom, prenom, role, status, avatar_url, is_admin'
          )
          .eq('id', user.id)
          .maybeSingle()

        if (cancelled) return

        if (error) throw error

        setProfile(data || null)

        const detectedAdmin =
          typeof contextIsAdmin === 'boolean'
            ? contextIsAdmin
            : data?.is_admin === true ||
              ['admin', 'super_admin'].includes(String(data?.role || ''))

        setIsAdmin(Boolean(detectedAdmin))
      } catch {
        if (cancelled) return

        setProfile(null)

        setIsAdmin(
          typeof contextIsAdmin === 'boolean'
            ? contextIsAdmin
            : false
        )
      }
    }

    void checkProfile()

    return () => {
      cancelled = true
    }
  }, [contextIsAdmin, user])

  /* ---------------------------------------------------------- */
  /* Notifications                                               */
  /* ---------------------------------------------------------- */

  const loadNotifications = useCallback(async () => {
    if (!user) return

    setNotifLoading(true)
    setNotifError(null)

    try {
      const res = await fetch('/api/admin/notifications?limit=20', {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Impossible de charger les notifications.')
      }

      const json = await res.json()

      const rawItems = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.notifications)
            ? json.notifications
            : []

      setNotifications(rawItems.map(normalizeNotification))
    } catch (err: any) {
      setNotifications([])
      setNotifError(err?.message || 'Notifications indisponibles.')
    } finally {
      setNotifLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user || !isAdmin) return

    void loadNotifications()

    const interval = setInterval(() => {
      void loadNotifications()
    }, 60_000)

    return () => clearInterval(interval)
  }, [isAdmin, loadNotifications, user])

  const markNotificationAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )

      try {
        await fetch(`/api/admin/notifications/${id}/read`, {
          method: 'PATCH',
          credentials: 'include',
        })
      } catch {
        // silencieux : optimiste déjà appliqué
      }
    },
    []
  )

  const markAllNotificationsAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))

    try {
      await fetch('/api/admin/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // silencieux
    }
  }, [])

  const handleNotificationClick = useCallback(
    (notification: NotificationItem) => {
      void markNotificationAsRead(notification.id)

      if (notification.href) {
        router.push(notification.href)
        setNotifOpen(false)
      }
    },
    [markNotificationAsRead, router]
  )

  /* ---------------------------------------------------------- */
  /* Actions UI                                                  */
  /* ---------------------------------------------------------- */

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'

      document.documentElement.classList.toggle('dark', next === 'dark')
      safeLocalStorageSet(THEME_KEY, next)

      return next
    })
  }, [])

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      safeLocalStorageSet(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }, [])

  const toggleSubmenu = useCallback((href: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev)

      if (next.has(href)) {
        next.delete(href)
      } else {
        next.add(href)
      }

      safeLocalStorageSet(EXPANDED_MENUS_KEY, JSON.stringify(Array.from(next)))

      return next
    })
  }, [])

  const openCommandPalette = useCallback(() => {
    setCommandOpen(true)
    setCommandQuery('')
    setCommandSelectedIndex(0)
  }, [])

  const closeCommandPalette = useCallback(() => {
    setCommandOpen(false)
    setCommandQuery('')
    setCommandSelectedIndex(0)
  }, [])

  const navigateCommand = useCallback(
    (href: string) => {
      router.push(href)
      closeCommandPalette()
      setMobileMenuOpen(false)
    },
    [closeCommandPalette, router]
  )

  const handleLogout = useCallback(async () => {
    try {
      await logout?.()
    } catch {
      // silencieux
    } finally {
      router.push('/login')
    }
  }, [logout, router])

  /* ---------------------------------------------------------- */
  /* Raccourcis clavier globaux                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMac =
        typeof navigator !== 'undefined' &&
        /Mac|iPod|iPhone|iPad/.test(navigator.platform)

      const mod = isMac ? event.metaKey : event.ctrlKey

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((prev) => !prev)
        return
      }

      if (mod && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleSidebar()
        return
      }

      if (event.key === 'Escape') {
        setCommandOpen(false)
        setMobileMenuOpen(false)
        setNotifOpen(false)
        setUserMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handler)

    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [toggleSidebar])

  /* ---------------------------------------------------------- */
  /* Command palette keyboard                                    */
  /* ---------------------------------------------------------- */

  const handleCommandKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setCommandSelectedIndex((prev) =>
          Math.min(prev + 1, Math.max(0, filteredCommands.length - 1))
        )
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setCommandSelectedIndex((prev) => Math.max(0, prev - 1))
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()

        const selected = filteredCommands[commandSelectedIndex]

        if (selected) {
          navigateCommand(selected.href)
        }
      }
    },
    [commandSelectedIndex, filteredCommands, navigateCommand]
  )

  /* ---------------------------------------------------------- */
  /* Rendu loading / non connecté / accès refusé                 */
  /* ---------------------------------------------------------- */

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="xl" variant="premium" label="Vérification des accès..." />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl border border-border bg-card/70 p-8 text-center shadow-soft backdrop-blur-xl"
        >
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-500">
            <ShieldCheck size={30} />
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            Connexion requise
          </h1>

          <p className="mt-3 text-sm text-muted-foreground">
            Veuillez vous connecter pour accéder à l’espace administrateur.
          </p>

          <Link
            href="/login?redirect=/admin"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 px-5 py-2.5 text-sm font-semibold text-midnight-900 shadow-gold transition hover:shadow-glow-gold"
          >
            Se connecter
          </Link>
        </motion.div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl border border-red-200 bg-red-50/80 p-8 text-center shadow-soft backdrop-blur-xl dark:border-red-900/40 dark:bg-red-950/20"
        >
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
            <AlertTriangle size={30} />
          </div>

          <h1 className="text-2xl font-bold text-red-700 dark:text-red-300">
            Accès refusé
          </h1>

          <p className="mt-3 text-sm text-red-700/80 dark:text-red-300/80">
            Vous n’avez pas les droits nécessaires pour accéder à cette zone.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white shadow-gold transition hover:bg-gold-600"
          >
            Retour à l’accueil
          </Link>
        </motion.div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Sidebar renderer                                            */
  /* ---------------------------------------------------------- */

  const renderSidebar = (isCollapsed: boolean) => (
    <div className="flex h-full flex-col border-r border-gold-400/20 bg-midnight-900 text-neutral-100 dark:bg-midnight-950">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-gold-400/20 px-3">
        <Link
          href="/admin"
          className={cn(
            'flex min-w-0 items-center gap-2 transition hover:opacity-90',
            isCollapsed && 'justify-center'
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 text-midnight-900 shadow-gold">
            <ShieldCheck size={20} />
          </div>

          {!isCollapsed && (
            <div className="min-w-0">
              <p className="truncate font-serif text-lg font-bold text-gold-400">
                Admin
              </p>
              <p className="truncate text-[11px] text-gold-200/70">
                Gercie Console
              </p>
            </div>
          )}
        </Link>

        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden rounded-xl p-2 text-neutral-400 transition hover:bg-gold-400/10 hover:text-gold-400 lg:block"
          aria-label={isCollapsed ? 'Déplier la sidebar' : 'Replier la sidebar'}
          title={isCollapsed ? 'Déplier (Ctrl+B)' : 'Replier (Ctrl+B)'}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-xl p-2 text-neutral-400 transition hover:bg-gold-400/10 hover:text-gold-400 lg:hidden"
          aria-label="Fermer le menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Search */}
      {!isCollapsed && (
        <div className="shrink-0 border-b border-gold-400/10 px-3 py-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une section..."
              className="w-full rounded-xl border border-gold-400/20 bg-midnight-950/60 py-2 pl-9 pr-9 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-gold-400/50 focus:outline-none focus:ring-2 focus:ring-gold-500/30"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-neutral-500 transition hover:bg-gold-400/10 hover:text-gold-400"
                aria-label="Effacer la recherche"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={openCommandPalette}
            className="mt-2 flex w-full items-center justify-between rounded-xl border border-gold-400/10 bg-midnight-950/40 px-3 py-2 text-xs text-neutral-400 transition hover:border-gold-400/30 hover:text-gold-300"
          >
            <span className="inline-flex items-center gap-2">
              <Command size={14} />
              Command palette
            </span>

            <kbd className="rounded-md border border-gold-400/20 bg-midnight-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {isCollapsed && (
        <div className="shrink-0 border-b border-gold-400/10 px-2 py-3">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex w-full items-center justify-center rounded-xl border border-gold-400/10 bg-midnight-950/40 p-2 text-neutral-400 transition hover:border-gold-400/30 hover:text-gold-300"
            aria-label="Ouvrir la command palette"
            title="Command palette (⌘K)"
          >
            <Search size={18} />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {!hasSidebarResults && (
          <div className="rounded-2xl border border-gold-400/10 bg-midnight-950/40 p-4 text-center text-xs text-neutral-400">
            Aucune section trouvée.
          </div>
        )}

        {filteredNavGroups.map((group) => (
          <div key={group.id} className="space-y-1">
            {!isCollapsed && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                {group.label}
              </p>
            )}

            {group.items.map((item) => {
              const active = isActive(item.href)
              const expanded = expandedMenus.has(item.href)
              const hasChildren = Boolean(item.children?.length)

              const baseClass = cn(
                'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-gradient-to-r from-gold-400/20 to-gold-400/5 text-gold-300 shadow-[inset_0_0_0_1px_rgba(234,179,8,0.18)]'
                  : 'text-neutral-300 hover:bg-gold-400/5 hover:text-gold-300',
                isCollapsed && 'justify-center px-2'
              )

              const icon = (
                <item.icon
                  size={18}
                  className={cn(
                    'shrink-0 transition-colors',
                    active ? 'text-gold-400' : 'text-neutral-400 group-hover:text-gold-400'
                  )}
                />
              )

              if (hasChildren) {
                return (
                  <div key={item.href}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isCollapsed) {
                          setCollapsed(false)
                          safeLocalStorageSet(SIDEBAR_COLLAPSED_KEY, 'false')
                        }

                        toggleSubmenu(item.href)
                      }}
                      className={baseClass}
                      title={isCollapsed ? item.label : undefined}
                      aria-expanded={expanded}
                    >
                      {icon}

                      {!isCollapsed && (
                        <>
                          <span className="min-w-0 flex-1 truncate text-left">
                            {item.label}
                          </span>

                          {item.badge !== undefined && (
                            <Badge variant="gold" size="sm">
                              {item.badge}
                            </Badge>
                          )}

                          <ChevronDown
                            size={14}
                            className={cn(
                              'shrink-0 transition-transform',
                              expanded && 'rotate-180'
                            )}
                          />
                        </>
                      )}
                    </button>

                    <AnimatePresence initial={false}>
                      {expanded && !isCollapsed && item.children && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="ml-6 mt-1 space-y-1 overflow-hidden border-l border-gold-400/15 pl-3"
                        >
                          {item.children.map((child) => {
                            const childActive = isChildActive(child.href)

                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={cn(
                                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                                  childActive
                                    ? 'bg-gold-400/10 text-gold-300'
                                    : 'text-neutral-400 hover:bg-gold-400/5 hover:text-gold-300'
                                )}
                              >
                                {child.label}
                              </Link>
                            )
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={baseClass}
                  title={isCollapsed ? item.label : undefined}
                >
                  {icon}

                  {!isCollapsed && (
                    <>
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>

                      {item.badge !== undefined && (
                        <Badge variant="gold" size="sm">
                          {item.badge}
                        </Badge>
                      )}

                      {active && (
                        <motion.span
                          layoutId="admin-active-indicator"
                          className="h-5 w-1.5 rounded-full bg-gold-400 shadow-gold"
                          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                        />
                      )}
                    </>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 space-y-2 border-t border-gold-400/20 p-3">
        {!isCollapsed && (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-gold-400/10 bg-midnight-950/40 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-sm font-bold text-gold-300">
              {getInitials(displayName)}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-100">
                {displayName}
              </p>
              <p className="truncate text-[11px] text-neutral-400">
                {displayRole}
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-neutral-300 transition hover:bg-gold-400/10 hover:text-gold-300',
            isCollapsed && 'justify-center px-2'
          )}
          title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}

          {!isCollapsed && (
            <span>{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
          )}
        </button>

        <Link
          href="/"
          className={cn(
            'flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 px-3 py-2.5 text-sm font-semibold text-midnight-900 shadow-gold transition hover:shadow-glow-gold',
            isCollapsed && 'justify-center px-2'
          )}
          title="Retour au site"
        >
          <Home size={18} />

          {!isCollapsed && <span>Retour au site</span>}
        </Link>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-300 transition hover:bg-red-500/10 hover:text-red-200',
            isCollapsed && 'justify-center px-2'
          )}
          title="Déconnexion"
        >
          <LogOut size={18} />

          {!isCollapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </div>
  )

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 transition-all duration-300 lg:block',
          collapsed ? 'w-[76px]' : 'w-72'
        )}
      >
        {renderSidebar(collapsed)}
      </aside>

      {/* Contenu */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-xl p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500 lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu size={20} />
            </button>

            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden rounded-xl p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500 lg:block"
              aria-label={collapsed ? 'Déplier la sidebar' : 'Replier la sidebar'}
              title={collapsed ? 'Déplier (Ctrl+B)' : 'Replier (Ctrl+B)'}
            >
              <PanelLeft size={20} />
            </button>

            {/* Breadcrumb */}
            <nav
              aria-label="Fil d’Ariane"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-sm"
            >
              <Link
                href="/admin"
                className="shrink-0 font-medium text-muted-foreground transition hover:text-gold-500"
              >
                Admin
              </Link>

              {breadcrumbSegments.map((segment, index) => (
                <span
                  key={segment.href}
                  className="flex min-w-0 items-center gap-1.5"
                >
                  <ChevronRight
                    size={14}
                    className="shrink-0 text-muted-foreground/60"
                  />

                  {index === breadcrumbSegments.length - 1 ? (
                    <span className="truncate font-semibold text-foreground">
                      {segment.label}
                    </span>
                  ) : (
                    <Link
                      href={segment.href}
                      className="truncate text-muted-foreground transition hover:text-gold-500"
                    >
                      {segment.label}
                    </Link>
                  )}
                </span>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={openCommandPalette}
                className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:border-gold-400/40 hover:text-gold-500 md:flex"
              >
                <Search size={16} />
                <span>Rechercher</span>

                <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
                  ⌘K
                </kbd>
              </button>

              <button
                type="button"
                onClick={openCommandPalette}
                className="rounded-xl p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500 md:hidden"
                aria-label="Rechercher"
              >
                <Search size={20} />
              </button>

              {/* Notifications */}
              <div ref={notifRef} className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((prev) => !prev)}
                  className="relative rounded-xl p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500"
                  aria-label="Notifications"
                >
                  <Bell size={20} />

                  {unreadNotifications > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.97 }}
                      transition={{ duration: 0.16 }}
                      className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-strong"
                    >
                      <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Notifications
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {unreadNotifications > 0
                              ? `${unreadNotifications} non lue${unreadNotifications > 1 ? 's' : ''}`
                              : 'Tout est à jour'}
                          </p>
                        </div>

                        {notifications.length > 0 && (
                          <button
                            type="button"
                            onClick={() => void markAllNotificationsAsRead()}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gold-600 transition hover:bg-gold-400/10"
                          >
                            <Check size={14} />
                            Tout lire
                          </button>
                        )}
                      </div>

                      <div className="max-h-80 overflow-y-auto p-2">
                        {notifLoading && notifications.length === 0 ? (
                          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                            <Spinner size="sm" className="mr-2" />
                            Chargement...
                          </div>
                        ) : notifError && notifications.length === 0 ? (
                          <div className="m-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                            {notifError}
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 text-center">
                            <Inbox size={28} className="mb-2 text-muted-foreground" />
                            <p className="text-sm font-medium text-foreground">
                              Aucune notification
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Les alertes admin apparaîtront ici.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {notifications.map((notification) => (
                              <button
                                key={notification.id}
                                type="button"
                                onClick={() => handleNotificationClick(notification)}
                                className={cn(
                                  'flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-gold-400/5',
                                  !notification.read && 'bg-gold-400/5'
                                )}
                              >
                                <span
                                  className={cn(
                                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                                    notification.read
                                      ? 'bg-muted'
                                      : 'bg-gold-500 shadow-gold'
                                  )}
                                />

                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-foreground">
                                    {notification.title}
                                  </span>

                                  {notification.message && (
                                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                                      {notification.message}
                                    </span>
                                  )}

                                  <span className="mt-1 block text-[11px] text-muted-foreground/80">
                                    {formatRelativeDate(notification.created_at)}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="border-t border-border px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void loadNotifications()}
                          className="text-xs font-medium text-muted-foreground transition hover:text-gold-500"
                        >
                          Rafraîchir
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* User menu */}
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 rounded-xl border border-transparent p-1 transition hover:border-border hover:bg-muted/40"
                  aria-label="Menu utilisateur"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-500/15 text-sm font-bold text-gold-600">
                    {getInitials(displayName)}
                  </span>

                  <ChevronDown
                    size={16}
                    className={cn(
                      'hidden text-muted-foreground transition-transform sm:block',
                      userMenuOpen && 'rotate-180'
                    )}
                  />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.97 }}
                      transition={{ duration: 0.16 }}
                      className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-strong"
                    >
                      <div className="border-b border-border p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-500/15 text-sm font-bold text-gold-600">
                            {getInitials(displayName)}
                          </span>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {user?.email || '—'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <Badge variant="gold" size="sm">
                            <User size={12} className="mr-1" />
                            {displayRole}
                          </Badge>

                          {profile?.status && (
                            <Badge
                              variant={
                                profile.status === 'active' ? 'accent' : 'neutral'
                              }
                              size="sm"
                            >
                              {profile.status}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="p-2">
                        <Link
                          href="/profile"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition hover:bg-gold-400/10 hover:text-gold-600"
                        >
                          <User size={16} />
                          Mon profil
                        </Link>

                        <Link
                          href="/"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition hover:bg-gold-400/10 hover:text-gold-600"
                        >
                          <Home size={16} />
                          Voir le site
                        </Link>

                        <button
                          type="button"
                          onClick={() => {
                            toggleTheme()
                            setUserMenuOpen(false)
                          }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition hover:bg-gold-400/10 hover:text-gold-600"
                        >
                          {theme === 'dark' ? (
                            <Sun size={16} />
                          ) : (
                            <Moon size={16} />
                          )}
                          {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
                        </button>
                      </div>

                      <div className="border-t border-border p-2">
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false)
                            void handleLogout()
                          }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                        >
                          <LogOut size={16} />
                          Déconnexion
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Offline banner */}
          <AnimatePresence>
            {!online && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20"
              >
                <div className="flex items-center gap-2 px-4 py-2 text-xs text-amber-800 dark:text-amber-300 md:px-6">
                  <WifiOff size={14} />
                  Vous êtes hors ligne. Certaines actions peuvent échouer.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Main */}
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] shadow-2xl lg:hidden"
          >
            {renderSidebar(false)}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Command palette */}
      <AnimatePresence>
        {commandOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 p-4 backdrop-blur-sm sm:p-8"
            onClick={closeCommandPalette}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="mt-10 w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-strong sm:mt-20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Search size={18} className="shrink-0 text-muted-foreground" />

                <input
                  ref={commandInputRef}
                  value={commandQuery}
                  onChange={(e) => setCommandQuery(e.target.value)}
                  onKeyDown={handleCommandKeyDown}
                  placeholder="Rechercher une page admin..."
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />

                <button
                  type="button"
                  onClick={closeCommandPalette}
                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Fermer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-2">
                {filteredCommands.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Inbox size={30} className="mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      Aucun résultat
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Essaie un autre mot-clé.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredCommands.map((item, index) => {
                      const selected = index === commandSelectedIndex

                      return (
                        <button
                          key={`${item.href}-${item.label}`}
                          type="button"
                          onMouseEnter={() => setCommandSelectedIndex(index)}
                          onClick={() => navigateCommand(item.href)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                            selected
                              ? 'bg-gold-400/10 text-gold-700 dark:text-gold-300'
                              : 'text-foreground hover:bg-muted/50'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                              selected
                                ? 'border-gold-400/30 bg-gold-400/10 text-gold-600'
                                : 'border-border bg-background text-muted-foreground'
                            )}
                          >
                            <item.icon size={16} />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {item.label}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.group}
                            </span>
                          </span>

                          <ArrowRight
                            size={14}
                            className={cn(
                              'shrink-0 transition',
                              selected
                                ? 'text-gold-500'
                                : 'text-muted-foreground/50'
                            )}
                          />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono">
                    ↑↓
                  </kbd>
                  naviguer
                </span>

                <span className="inline-flex items-center gap-2">
                  <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono">
                    ↵
                  </kbd>
                  ouvrir
                </span>

                <span className="inline-flex items-center gap-2">
                  <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono">
                    Esc
                  </kbd>
                  fermer
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}