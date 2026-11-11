// app/profile/page.tsx
'use client'

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type {
  UserProfile,
  UserAddress,
  ProfileLoadState,
} from '@/lib/types/profile'
import {
  ArrowLeft,
  RefreshCw,
  WifiOff,
  Loader2,
  UserCircle,
  LayoutDashboard,
  Package,
  Heart,
  MapPin,
  Bell,
  ShieldCheck,
  Settings,
  Award,
  Gift,
  Star,
  LifeBuoy,
  Database,
  Trash2,
  Pencil,
  Plus,
  Check,
  X,
  Copy,
  Download,
  LogOut,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Search,
  ChevronRight,
  ExternalLink,
  CreditCard,
  Banknote,
  Globe,
  Moon,
  Sun,
  MonitorSmartphone,
  Volume2,
  VolumeX,
  Sparkles,
  TrendingUp,
  Users,
  Ticket,
  FileText,
  Lock,
  KeyRound,
  Mail,
  Phone,
  Home,
  Briefcase,
  Save,
  RotateCcw,
  Info,
  Zap,
  ShieldAlert,
  UserCog,
  Languages,
  Palette,
  Hourglass,
  ShoppingCart,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type TabId =
  | 'overview'
  | 'orders'
  | 'favorites'
  | 'addresses'
  | 'notifications'
  | 'security'
  | 'preferences'
  | 'loyalty'
  | 'referral'
  | 'reviews'
  | 'support'
  | 'privacy'

type SectionStatus = 'idle' | 'loading' | 'success' | 'error'

interface ExtendedProfile extends UserProfile {
  [key: string]: any
}

interface Address extends UserAddress {
  [key: string]: any
}

interface Order {
  id: string
  numero_commande?: string
  statut: string
  total_usd?: number
  total_cdf?: number
  currency?: string
  created_at?: string
  items_count?: number
  [key: string]: any
}

interface Favorite {
  id: string
  product_id?: string
  nom?: string
  prix_usd?: number
  image?: string
  [key: string]: any
}

interface NotificationItem {
  id: string
  title?: string
  message?: string
  read?: boolean
  created_at?: string
  type?: string
  [key: string]: any
}

interface SessionDevice {
  id: string
  device?: string
  location?: string
  last_seen?: string
  current?: boolean
  [key: string]: any
}

interface ActivityLog {
  id: string
  action?: string
  description?: string
  created_at?: string
  ip?: string
  [key: string]: any
}

interface Preference {
  language: string
  currency_display: 'USD' | 'CDF'
  secondary_currency: 'USD' | 'CDF'
  theme: 'system' | 'light' | 'dark'
  timezone: string
  date_format: string
  notif_email: boolean
  notif_sms: boolean
  notif_push: boolean
  notif_whatsapp: boolean
  notif_orders: boolean
  notif_promos: boolean
  sound: boolean
  reduced_motion: boolean
  auto_refresh: boolean
  marketing_consent: boolean
  profile_visibility: 'public' | 'private' | 'friends'
  [key: string]: any
}

interface Loyalty {
  points: number
  tier: string
  next_tier?: string
  progress?: number
  history?: any[]
  [key: string]: any
}

interface Referral {
  code: string
  link: string
  invited_count: number
  rewarded_count: number
  total_earned: number
  [key: string]: any
}

interface Review {
  id: string
  product_name?: string
  rating?: number
  comment?: string
  created_at?: string
  [key: string]: any
}

interface SupportTicket {
  id: string
  sujet?: string
  message?: string
  statut?: string
  categorie?: string
  priorite?: string
  created_at?: string
  [key: string]: any
}

interface CachedData {
  profile: ExtendedProfile | null
  addresses: Address[]
  orders: Order[]
  favorites: Favorite[]
  notifications: NotificationItem[]
  sessions: SessionDevice[]
  activity: ActivityLog[]
  preferences: Preference
  loyalty: Loyalty | null
  referral: Referral | null
  reviews: Review[]
  tickets: SupportTicket[]
  timestamp: number
}

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

const FETCH_TIMEOUT = 15000
const CACHE_KEY = 'profile_page_v2_no_wallet'
const CACHE_TTL_MS = 5 * 60 * 1000

const ERROR_MESSAGES = {
  network: "Connexion instable. Certaines données n'ont pas pu être chargées.",
  timeout: 'Le chargement prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne. Affichage des données en cache.',
  unknown: 'Une erreur est survenue lors du chargement.',
}

const TABS: {
  id: TabId
  label: string
  icon: ReactNode
  description: string
}[] = [
  {
    id: 'overview',
    label: 'Aperçu',
    icon: <LayoutDashboard size={18} />,
    description: 'Vue générale de votre compte',
  },
  {
    id: 'orders',
    label: 'Commandes',
    icon: <Package size={18} />,
    description: 'Historique et suivi',
  },
  {
    id: 'favorites',
    label: 'Favoris',
    icon: <Heart size={18} />,
    description: 'Produits enregistrés',
  },
  {
    id: 'addresses',
    label: 'Adresses',
    icon: <MapPin size={18} />,
    description: 'Livraison et retrait',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell size={18} />,
    description: 'Alertes et messages',
  },
  {
    id: 'security',
    label: 'Sécurité',
    icon: <ShieldCheck size={18} />,
    description: 'Mot de passe, sessions, 2FA',
  },
  {
    id: 'preferences',
    label: 'Préférences',
    icon: <Settings size={18} />,
    description: 'Langue, devise, thème',
  },
  {
    id: 'loyalty',
    label: 'Fidélité',
    icon: <Award size={18} />,
    description: 'Points et avantages',
  },
  {
    id: 'referral',
    label: 'Parrainage',
    icon: <Gift size={18} />,
    description: 'Invitez et gagnez',
  },
  {
    id: 'reviews',
    label: 'Avis',
    icon: <Star size={18} />,
    description: 'Vos évaluations',
  },
  {
    id: 'support',
    label: 'Support',
    icon: <LifeBuoy size={18} />,
    description: 'Assistance et tickets',
  },
  {
    id: 'privacy',
    label: 'Données',
    icon: <Database size={18} />,
    description: 'Export et suppression',
  },
]

const DEFAULT_PREFERENCES: Preference = {
  language: 'fr',
  currency_display: 'USD',
  secondary_currency: 'CDF',
  theme: 'system',
  timezone: 'Africa/Kinshasa',
  date_format: 'DD/MM/YYYY',
  notif_email: true,
  notif_sms: false,
  notif_push: true,
  notif_whatsapp: false,
  notif_orders: true,
  notif_promos: false,
  sound: true,
  reduced_motion: false,
  auto_refresh: true,
  marketing_consent: false,
  profile_visibility: 'private',
}

const ORDER_STATUS_MAP: Record<
  string,
  { label: string; variant: 'accent' | 'warm' | 'danger' | 'neutral' | 'brand' | 'gold' }
> = {
  pending: { label: 'En attente', variant: 'warm' },
  processing: { label: 'En préparation', variant: 'brand' },
  shipped: { label: 'Expédiée', variant: 'accent' },
  delivered: { label: 'Livrée', variant: 'gold' },
  cancelled: { label: 'Annulée', variant: 'danger' },
  refunded: { label: 'Remboursée', variant: 'neutral' },
  return_requested: { label: 'Retour demandé', variant: 'warm' },
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toArray(res: any): any[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.results)) return res.results
  return []
}

function getErrorMessage(err: any): string {
  return err?.message || ERROR_MESSAGES.unknown
}

function relativeTime(dateStr?: string): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `il y a ${days} j`
  return date.toLocaleDateString('fr-FR')
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function initials(first?: string, last?: string): string {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || 'U'
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function notify(
  toast: any,
  type: 'success' | 'error' | 'info' | 'warning',
  message: string
) {
  try {
    if (toast?.addToast) {
      toast.addToast({ type, message })
    } else if (toast?.show) {
      toast.show({ type, message })
    } else if (typeof toast === 'function') {
      toast(message, { type })
    }
  } catch {
    // silencieux
  }
}

async function fetchJSON<T = any>(
  url: string,
  options: RequestInit = {},
  timeout = FETCH_TIMEOUT
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const isFormData =
      typeof FormData !== 'undefined' && options.body instanceof FormData

    const response = await fetch(url, {
      ...options,
      headers: isFormData
        ? options.headers
        : {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      let message = `HTTP ${response.status}`
      try {
        const err = await response.json()
        message = err.error || err.message || message
      } catch {
        // ignore
      }
      throw new Error(message)
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return (await response.json()) as T
    }

    return (await response.text()) as unknown as T
  } finally {
    clearTimeout(timeoutId)
  }
}

function readCache(): CachedData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedData
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(data: Omit<CachedData, 'timestamp'>): void {
  if (typeof window === 'undefined') return
  try {
    const payload: CachedData = {
      ...data,
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    // silencieux
  }
}

/* ------------------------------------------------------------------ */
/* Mini composants UI                                                  */
/* ------------------------------------------------------------------ */

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const selectClass = inputClass

function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 ${
        checked ? 'bg-gold-500' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <Card variant="glass" className="border-gold-400/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="rounded-xl bg-muted p-2 text-gold-500">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Card variant="glass" className="border-border/60">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="rounded-2xl bg-muted p-4 text-muted-foreground">{icon}</div>
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </CardContent>
    </Card>
  )
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} variant="glass" className="border-border/50">
          <CardContent className="p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  if (!open) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`w-full ${sizes[size]} max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-3 border-t border-border p-5">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page principale                                                     */
/* ------------------------------------------------------------------ */

export default function ProfilePage() {
  const { user, loading: authLoading, logout, isVerified, isOnboarded } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const toast = useToast()
  const { rate, loading: rateLoading } = useExchangeRate()

  const queryTab = searchParams.get('tab') as TabId | null
  const initialTab: TabId =
    queryTab && TABS.some((t) => t.id === queryTab) ? queryTab : 'overview'

  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  const [profile, setProfile] = useState<ExtendedProfile | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [sessions, setSessions] = useState<SessionDevice[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [preferences, setPreferences] = useState<Preference>(DEFAULT_PREFERENCES)
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null)
  const [referral, setReferral] = useState<Referral | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [tickets, setTickets] = useState<SupportTicket[]>([])

  const [loadState, setLoadState] = useState<ProfileLoadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [sectionStatus, setSectionStatus] = useState<Record<TabId, SectionStatus>>({
    overview: 'idle',
    orders: 'idle',
    favorites: 'idle',
    addresses: 'idle',
    notifications: 'idle',
    security: 'idle',
    preferences: 'idle',
    loyalty: 'idle',
    referral: 'idle',
    reviews: 'idle',
    support: 'idle',
    privacy: 'idle',
  })

  const [sectionErrors, setSectionErrors] = useState<Partial<Record<TabId, string>>>({})

  const hasLoadedRef = useRef(false)
  const loadedSectionsRef = useRef<Set<TabId>>(new Set())
  const abortControllerRef = useRef<AbortController | null>(null)

  /* Modals */
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)

  /* Loading states */
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [creatingTicket, setCreatingTicket] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [exportingData, setExportingData] = useState(false)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [toggling2FA, setToggling2FA] = useState(false)
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)
  const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)
  const [returningOrderId, setReturningOrderId] = useState<string | null>(null)

  /* Forms */
  const [profileForm, setProfileForm] = useState({
    nom: '',
    prenom: '',
    telephone: '',
    email: '',
    bio: '',
    date_naissance: '',
    genre: '',
  })

  const [addressForm, setAddressForm] = useState({
    id: null as string | null,
    nom: '',
    destinataire: '',
    telephone: '',
    type: 'maison',
    province: '',
    ville: '',
    commune: '',
    quartier: '',
    avenue: '',
    numero: '',
    reference: '',
    is_default: false,
  })

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [securityForm, setSecurityForm] = useState({
    question_secrete: '',
    reponse_secrete: '',
  })

  const [preferenceForm, setPreferenceForm] = useState<Preference>(DEFAULT_PREFERENCES)

  const [ticketForm, setTicketForm] = useState({
    sujet: '',
    message: '',
    categorie: 'general',
    priorite: 'normal',
  })

  const [deleteForm, setDeleteForm] = useState({
    password: '',
    confirmText: '',
  })

  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  /* Filtres / recherche */
  const [orderSearch, setOrderSearch] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [favoriteSearch, setFavoriteSearch] = useState('')
  const [addressSearch, setAddressSearch] = useState('')
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all')
  const [reviewSearch, setReviewSearch] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')

  /* ---------------------------------------------------------------- */
  /* Effets de base                                                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/profile')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      notify(toast, 'warning', ERROR_MESSAGES.offline)
    }

    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [toast])

  useEffect(() => {
    if (queryTab && queryTab !== activeTab && TABS.some((t) => t.id === queryTab)) {
      setActiveTab(queryTab as TabId)
    }
  }, [queryTab, activeTab])

  useEffect(() => {
    if (!pathname) return
    const current = searchParams.get('tab') || 'overview'
    if (current !== activeTab) {
      router.replace(`${pathname}?tab=${activeTab}`, { scroll: false })
    }
  }, [activeTab, pathname, router, searchParams])

  useEffect(() => {
    if (profile) {
      setProfileForm({
        nom: profile.nom || '',
        prenom: profile.prenom || '',
        telephone: profile.telephone || '',
        email: profile.email || user?.email || '',
        bio: profile.bio || '',
        date_naissance: profile.date_naissance || '',
        genre: profile.genre || '',
      })

      setSecurityForm({
        question_secrete: profile.question_secrete || '',
        reponse_secrete: '',
      })
    }
  }, [profile, user?.email])

  useEffect(() => {
    setPreferenceForm({
      ...DEFAULT_PREFERENCES,
      ...preferences,
    })
  }, [preferences])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement

    if (preferences.theme === 'dark') {
      root.classList.add('dark')
    } else if (preferences.theme === 'light') {
      root.classList.remove('dark')
    } else {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const apply = () => {
        if (mq.matches) root.classList.add('dark')
        else root.classList.remove('dark')
      }
      apply()
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [preferences.theme])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /* Cache                                                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!profile) return

    writeCache({
      profile,
      addresses,
      orders,
      favorites,
      notifications,
      sessions,
      activity,
      preferences,
      loyalty,
      referral,
      reviews,
      tickets,
    })
  }, [
    profile,
    addresses,
    orders,
    favorites,
    notifications,
    sessions,
    activity,
    preferences,
    loyalty,
    referral,
    reviews,
    tickets,
  ])

  /* ---------------------------------------------------------------- */
  /* Format monétaire                                                  */
  /* ---------------------------------------------------------------- */

  const formatAmount = useCallback(
    (amount?: number | string | null, currency?: string) => {
      const value = Number(amount || 0)
      const curr = currency || preferences.currency_display || 'USD'

      if (curr === 'CDF') {
        return `${value.toLocaleString('fr-FR')} FC`
      }

      const usd = value
      const cdf = rate ? usd * rate : 0

      if (preferences.secondary_currency === 'CDF' && rate) {
        return `$${usd.toFixed(2)} • ${Math.round(cdf).toLocaleString('fr-FR')} FC`
      }

      return `$${usd.toFixed(2)}`
    },
    [preferences.currency_display, preferences.secondary_currency, rate]
  )

  /* ---------------------------------------------------------------- */
  /* Chargement core                                                   */
  /* ---------------------------------------------------------------- */

  const loadCore = useCallback(
    async (force = false) => {
      if (!user) return

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()

      const cached = readCache()
      if (cached) {
        if (cached.profile) setProfile(cached.profile)
        if (cached.addresses) setAddresses(cached.addresses)
        if (cached.orders) setOrders(cached.orders)
        if (cached.favorites) setFavorites(cached.favorites)
        if (cached.notifications) setNotifications(cached.notifications)
        if (cached.sessions) setSessions(cached.sessions)
        if (cached.activity) setActivity(cached.activity)
        if (cached.preferences) setPreferences(cached.preferences)
        if (cached.loyalty) setLoyalty(cached.loyalty)
        if (cached.referral) setReferral(cached.referral)
        if (cached.reviews) setReviews(cached.reviews)
        if (cached.tickets) setTickets(cached.tickets)
      }

      if (!force && cached?.profile) {
        setLoadState('success')
      } else {
        setLoadState('loading')
      }

      setErrorMessage('')

      const errors: string[] = []

      try {
        const [profileRes, addressesRes, prefsRes] = await Promise.allSettled([
          fetchJSON('/api/user/profile', {
            signal: abortControllerRef.current?.signal,
          }),
          fetchJSON('/api/user/addresses', {
            signal: abortControllerRef.current?.signal,
          }),
          fetchJSON('/api/user/preferences', {
            signal: abortControllerRef.current?.signal,
          }),
        ])

        if (profileRes.status === 'fulfilled') {
          const data: any = profileRes.value
          const p = data?.data || data
          setProfile(p)
        } else {
          errors.push('profil')
        }

        if (addressesRes.status === 'fulfilled') {
          setAddresses(toArray(addressesRes.value))
        } else {
          errors.push('adresses')
        }

        if (prefsRes.status === 'fulfilled') {
          const data: any = prefsRes.value
          const prefs = data?.data || data || {}
          setPreferences({
            ...DEFAULT_PREFERENCES,
            ...prefs,
          })
        } else {
          setPreferences(DEFAULT_PREFERENCES)
        }

        if (errors.length === 0) {
          setLoadState('success')
        } else if (profile || cached?.profile) {
          setLoadState('partial')
          setErrorMessage(
            `Certaines données n'ont pas pu être chargées : ${errors.join(', ')}`
          )
        } else {
          setLoadState('error')
          setErrorMessage(ERROR_MESSAGES.network)
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return

        setLoadState(profile || cached?.profile ? 'partial' : 'error')
        setErrorMessage(getErrorMessage(err))
      }
    },
    [user]
  )

  /* ---------------------------------------------------------------- */
  /* Chargement par section                                            */
  /* ---------------------------------------------------------------- */

  const setSection = useCallback((tab: TabId, status: SectionStatus, error?: string) => {
    setSectionStatus((prev) => ({ ...prev, [tab]: status }))
    setSectionErrors((prev) => ({
      ...prev,
      [tab]: error,
    }))
  }, [])

  const ensureSection = useCallback(
    async (tab: TabId, force = false) => {
      if (!user) return
      if (tab === 'overview' || tab === 'preferences' || tab === 'privacy') {
        setSection(tab, 'success')
        return
      }

      if (!force && loadedSectionsRef.current.has(tab)) return

      setSection(tab, 'loading')

      try {
        switch (tab) {
          case 'orders': {
            const res = await fetchJSON('/api/user/orders?limit=100')
            setOrders(
              toArray(res).map((o: any) => ({
                id: o.id || o.commande_id,
                numero_commande: o.numero_commande || o.reference || o.id,
                statut: o.statut || o.status || 'pending',
                total_usd: o.total_usd ?? o.total ?? o.montant ?? 0,
                total_cdf: o.total_cdf,
                currency: o.currency || 'USD',
                created_at: o.created_at || o.date,
                items_count: o.items_count ?? o.items?.length ?? 0,
                ...o,
              }))
            )
            break
          }

          case 'favorites': {
            const res = await fetchJSON('/api/user/favorites')
            setFavorites(
              toArray(res).map((f: any) => ({
                id: f.id || f.product_id,
                product_id: f.product_id || f.id,
                nom: f.nom || f.product?.nom || 'Produit',
                prix_usd: f.prix_usd ?? f.price_usd ?? f.prix ?? 0,
                image: f.image || f.images?.[0] || f.product?.images?.[0],
                ...f,
              }))
            )
            break
          }

          case 'addresses': {
            const res = await fetchJSON('/api/user/addresses')
            setAddresses(toArray(res))
            break
          }

          case 'notifications': {
            const res = await fetchJSON('/api/user/notifications?limit=100')
            setNotifications(
              toArray(res).map((n: any) => ({
                id: n.id,
                title: n.title || n.subject || 'Notification',
                message: n.message || n.body || '',
                read: n.read ?? n.lu ?? false,
                created_at: n.created_at || n.date,
                type: n.type || 'info',
                ...n,
              }))
            )
            break
          }

          case 'security': {
            const [sessionsRes, activityRes] = await Promise.allSettled([
              fetchJSON('/api/user/sessions'),
              fetchJSON('/api/user/activity?limit=50'),
            ])

            if (sessionsRes.status === 'fulfilled') {
              setSessions(
                toArray(sessionsRes.value).map((s: any) => ({
                  id: s.id,
                  device: s.device || s.user_agent || 'Appareil',
                  location: s.location || s.ip || '—',
                  last_seen: s.last_seen || s.created_at,
                  current: s.current ?? s.is_current ?? false,
                  ...s,
                }))
              )
            }

            if (activityRes.status === 'fulfilled') {
              setActivity(
                toArray(activityRes.value).map((a: any) => ({
                  id: a.id,
                  action: a.action || 'action',
                  description: a.description || a.message || '',
                  created_at: a.created_at || a.date,
                  ip: a.ip,
                  ...a,
                }))
              )
            }

            break
          }

          case 'loyalty': {
            const res = await fetchJSON('/api/user/loyalty')
            const data: any = res?.data || res || {}
            setLoyalty({
              points: data.points ?? data.solde_points ?? 0,
              tier: data.tier || data.niveau || 'Bronze',
              next_tier: data.next_tier || data.next_niveau || 'Argent',
              progress: data.progress ?? 0,
              history: toArray(data.history || data.transactions),
              ...data,
            })
            break
          }

          case 'referral': {
            const res = await fetchJSON('/api/user/referral')
            const data: any = res?.data || res || {}
            const origin =
              typeof window !== 'undefined' ? window.location.origin : ''
            const code = data.code || data.referral_code || user.id?.slice(0, 8) || 'REF'
            setReferral({
              code,
              link: data.link || `${origin}/refer?code=${code}`,
              invited_count: data.invited_count ?? data.invites ?? 0,
              rewarded_count: data.rewarded_count ?? data.recompenses ?? 0,
              total_earned: data.total_earned ?? data.gains ?? 0,
              ...data,
            })
            break
          }

          case 'reviews': {
            const res = await fetchJSON('/api/user/reviews')
            setReviews(
              toArray(res).map((r: any) => ({
                id: r.id,
                product_name: r.product_name || r.produit?.nom || 'Produit',
                rating: r.rating || r.note || 0,
                comment: r.comment || r.message || '',
                created_at: r.created_at || r.date,
                ...r,
              }))
            )
            break
          }

          case 'support': {
            const res = await fetchJSON('/api/user/support/tickets')
            setTickets(
              toArray(res).map((t: any) => ({
                id: t.id,
                sujet: t.sujet || t.subject || 'Ticket',
                message: t.message || t.description || '',
                statut: t.statut || t.status || 'open',
                categorie: t.categorie || 'general',
                priorite: t.priorite || 'normal',
                created_at: t.created_at || t.date,
                ...t,
              }))
            )
            break
          }
        }

        loadedSectionsRef.current.add(tab)
        setSection(tab, 'success')
      } catch (err: any) {
        setSection(tab, 'error', getErrorMessage(err))
      }
    },
    [setSection, user]
  )

  useEffect(() => {
    if (!user || hasLoadedRef.current) return
    hasLoadedRef.current = true

    ;(async () => {
      await loadCore(true)
      await ensureSection(activeTab)
    })()
  }, [user, activeTab, loadCore, ensureSection])

  useEffect(() => {
    if (user && hasLoadedRef.current) {
      ensureSection(activeTab)
    }
  }, [activeTab, user, ensureSection])

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return

    setIsRefreshing(true)
    loadedSectionsRef.current.clear()

    await loadCore(true)
    await ensureSection(activeTab, true)

    setIsRefreshing(false)
    notify(toast, 'info', 'Données actualisées')
  }, [activeTab, ensureSection, isRefreshing, loadCore, toast])

  const changeTab = useCallback((tab: TabId) => {
    setActiveTab(tab)
  }, [])

  const copyToClipboard = useCallback(
    async (text: string, message = 'Copié') => {
      try {
        await navigator.clipboard.writeText(text)
        notify(toast, 'success', message)
      } catch {
        notify(toast, 'error', 'Copie impossible')
      }
    },
    [toast]
  )

  const saveProfile = useCallback(async () => {
    setSavingProfile(true)
    try {
      const res = await fetchJSON('/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      })
      const updated = res?.data || res
      setProfile((prev) => ({ ...(prev || {}), ...updated }))
      notify(toast, 'success', 'Profil mis à jour')
      setProfileModalOpen(false)
    } catch (err: any) {
      notify(toast, 'error', getErrorMessage(err))
    } finally {
      setSavingProfile(false)
    }
  }, [profileForm, toast])

  const handleAvatarFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !user) return

      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', user.id)

      try {
        const res = await fetchJSON('/api/user/avatar', {
          method: 'POST',
          body: formData,
        })
        const url = res?.url || res?.data?.url || res?.avatar_url
        if (url) {
          setProfile((prev) => ({ ...(prev || {}), avatar_url: url }))
          notify(toast, 'success', 'Photo mise à jour')
        }
      } catch (err: any) {
        notify(toast, 'error', getErrorMessage(err))
      }
    },
    [toast, user]
  )

  const openAddAddress = useCallback(() => {
    setAddressForm({
      id: null,
      nom: '',
      destinataire: '',
      telephone: '',
      type: 'maison',
      province: '',
      ville: '',
      commune: '',
      quartier: '',
      avenue: '',
      numero: '',
      reference: '',
      is_default: addresses.length === 0,
    })
    setAddressModalOpen(true)
  }, [addresses.length])

  const openEditAddress = useCallback((addr: Address) => {
    setAddressForm({
      id: addr.id,
      nom: addr.nom || '',
      destinataire: addr.destinataire || addr.nom || '',
      telephone: addr.telephone || '',
      type: addr.type || 'maison',
      province: addr.province || '',
      ville: addr.ville || '',
      commune: addr.commune || '',
      quartier: addr.quartier || '',
      avenue: addr.avenue || '',
      numero: addr.numero || '',
      reference: addr.reference || '',
      is_default: !!addr.is_default,
    })
    setAddressModalOpen(true)
  }, [])

  const saveAddress = useCallback(async () => {
    if (!addressForm.nom.trim()) {
      notify(toast, 'error', 'Le nom de l\'adresse est requis')
      return
    }

    setSavingAddress(true)
    try {
      const url = addressForm.id
        ? `/api/user/addresses/${addressForm.id}`
        : '/api/user/addresses'

      const method = addressForm.id ? 'PATCH' : 'POST'

      const res = await fetchJSON(url, {
        method,
        body: JSON.stringify(addressForm),
      })

      const saved = res?.data || res

      if (addressForm.id) {
        setAddresses((prev) =>
          prev.map((a) => (a.id === addressForm.id ? { ...a, ...saved } : a))
        )
      } else {
        setAddresses((prev) => [...prev, saved])
      }

      notify(toast, 'success', addressForm.id ? 'Adresse mise à jour' : 'Adresse ajoutée')
      setAddressModalOpen(false)
    } catch (err: any) {
      notify(toast, 'error', getErrorMessage(err))
    } finally {
      setSavingAddress(false)
    }
  }, [addressForm, toast])

  const deleteAddress = useCallback(
    async (id: string) => {
      try {
        await fetchJSON(`/api/user/addresses/${id}`, { method: 'DELETE' })
        setAddresses((prev) => prev.filter((a) => a.id !== id))
        notify(toast, 'success', 'Adresse supprimée')
      } catch (err: any) {
        notify(toast, 'error', getErrorMessage(err))
      }
    },
    [toast]
  )

  const setDefaultAddress = useCallback(
    async (id: string) => {
      try {
        await fetchJSON(`/api/user/addresses/${id}/default`, { method: 'POST' })
        setAddresses((prev) =>
          prev.map((a) => ({ ...a, is_default: a.id === id }))
        )
        notify(toast, 'success', 'Adresse par défaut définie')
      } catch {
        try {
          await fetchJSON(`/api/user/addresses/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_default: true }),
          })
          setAddresses((prev) =>
            prev.map((a) => ({ ...a, is_default: a.id === id }))
          )
          notify(toast, 'success', 'Adresse par défaut définie')
        } catch (err: any) {
          notify(toast, 'error', getErrorMessage(err))
        }
      }
    },
    [toast]
  )

  const changePassword = useCallback(async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      notify(toast, 'error', 'Les mots de passe ne correspondent pas')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      notify(toast, 'error', 'Le nouveau mot de passe doit contenir au moins 8 caractères')
      return
    }

    setSavingPassword(true)
    try {
      await fetchJSON('/api/user/password', {
        method: 'POST',
        body: JSON.stringify(passwordForm),
      })
      notify(toast, 'success', 'Mot de passe modifié')
      setPasswordModalOpen(false)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      notify(toast, 'error', getErrorMessage(err))
    } finally {
      setSavingPassword(false)
    }
  }, [passwordForm, toast])

  const saveSecurityQuestion = useCallback(async () => {
    try {
      await fetchJSON('/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          question_secrete: securityForm.question_secrete,
          reponse_secrete: securityForm.reponse_secrete,
        }),
      })
      setProfile((prev) => ({
        ...(prev || {}),
        question_secrete: securityForm.question_secrete,
      }))
      setSecurityForm((prev) => ({ ...prev, reponse_secrete: '' }))
      notify(toast, 'success', 'Question secrète mise à jour')
    } catch (err: any) {
      notify(toast, 'error', getErrorMessage(err))
    }
  }, [securityForm, toast])

  const toggle2FA = useCallback(async () => {
    setToggling2FA(true)
    try {
      const enabled = !!profile?.two_factor_enabled
      await fetchJSON(`/api/user/2fa/${enabled ? 'disable' : 'enable'}`, {
        method: 'POST',
      })
      setProfile((prev) => ({
        ...(prev || {}),
        two_factor_enabled: !enabled,
      }))
      notify(toast, 'success', enabled ? '2FA désactivée' : '2FA activée')
    } catch (err: any) {
      notify(toast, 'error', getErrorMessage(err))
    } finally {
      setToggling2FA(false)
    }
  }, [profile?.two_factor_enabled, toast])

  const revokeSession = useCallback(
    async (id: string) => {
      setRevokingSessionId(id)
      try {
        await fetchJSON(`/api/user/sessions/${id}`, { method: 'DELETE' })
        setSessions((prev) => prev.filter((s) => s.id !== id))
        notify(toast, 'success', 'Session révoquée')
      } catch (err: any) {
        notify(toast, 'error', getErrorMessage(err))
      } finally {
        setRevokingSessionId(null)
      }
    },
    [toast]
  )

  const markNotificationRead = useCallback(
    async (id: string) => {
      try {
        await fetchJSON(`/api/user/notifications/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ read: true }),
        })
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        )
      } catch (err: any) {
        notify(toast, 'error', getErrorMessage(err))
      }
    },
    [toast]
  )

  const markAllNotificationsRead = useCallback(async () => {
    setMarkingAllRead(true)
    try {
      await fetchJSON('/api/user/notifications/read-all', { method: 'POST' })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      notify(toast, 'success', 'Toutes les notifications ont été lues')
    } catch {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      notify(toast, 'info', 'Marquées comme lues localement')
    } finally {
      setMarkingAllRead(false)
    }
  }, [toast])

  const savePreferences = useCallback(async () => {
    setSavingPreferences(true)
    try {
      const res = await fetchJSON('/api/user/preferences', {
        method: 'PATCH',
        body: JSON.stringify(preferenceForm),
      })
      const saved = res?.data || res
      setPreferences({ ...DEFAULT_PREFERENCES, ...saved })
      notify(toast, 'success', 'Préférences enregistrées')
    } catch (err: any) {
      notify(toast, 'error', getErrorMessage(err))
    } finally {
      setSavingPreferences(false)
    }
  }, [preferenceForm, toast])

  const removeFavorite = useCallback(
    async (id: string) => {
      setRemovingFavoriteId(id)
      try {
        await fetchJSON(`/api/user/favorites/${id}`, { method: 'DELETE' })
        setFavorites((prev) => prev.filter((f) => f.id !== id))
        notify(toast, 'success', 'Retiré des favoris')
      } catch (err: any) {
        notify(toast, 'error', getErrorMessage(err))
      } finally {
        setRemovingFavoriteId(null)
      }
    },
    [toast]
  )

  const cancelOrder = useCallback(
    async (id: string) => {
      setCancellingOrderId(id)
      try {
        await fetchJSON(`/api/commandes/${id}/annuler`, { method: 'POST' })
        setOrders((prev) =>
          prev.map((o) =>
            o.id === id ? { ...o, statut: 'cancelled' } : o
          )
        )
        notify(toast, 'success', 'Commande annulée')
      } catch (err: any) {
        notify(toast, 'error', getErrorMessage(err))
      } finally {
        setCancellingOrderId(null)
      }
    },
    [toast]
  )

  const requestReturn = useCallback(
    async (id: string) => {
      setReturningOrderId(id)
      try {
        await fetchJSON('/api/retours', {
          method: 'POST',
          body: JSON.stringify({ commande_id: id }),
        })
        setOrders((prev) =>
          prev.map((o) =>
            o.id === id ? { ...o, statut: 'return_requested' } : o
          )
        )
        notify(toast, 'success', 'Demande de retour enregistrée')
      } catch (err: any) {
        notify(toast, 'error', getErrorMessage(err))
      } finally {
        setReturningOrderId(null)
      }
    },
    [toast]
  )

  const createTicket = useCallback(async () => {
    if (!ticketForm.sujet.trim() || !ticketForm.message.trim()) {
      notify(toast, 'error', 'Sujet et message requis')
      return
    }

    setCreatingTicket(true)
    try {
      const res = await fetchJSON('/api/user/support/tickets', {
        method: 'POST',
        body: JSON.stringify(ticketForm),
      })
      const saved = res?.data || res
      setTickets((prev) => [saved, ...prev])
      setTicketForm({ sujet: '', message: '', categorie: 'general', priorite: 'normal' })
      notify(toast, 'success', 'Ticket envoyé')
    } catch (err: any) {
      notify(toast, 'error', getErrorMessage(err))
    } finally {
      setCreatingTicket(false)
    }
  }, [ticketForm, toast])

  const exportData = useCallback(async () => {
    setExportingData(true)
    try {
      const res = await fetchJSON('/api/user/export-data')
      downloadBlob(
        JSON.stringify(res, null, 2),
        `mon-compte-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json'
      )
      notify(toast, 'success', 'Export téléchargé')
    } catch {
      const local = {
        profile,
        addresses,
        orders,
        favorites,
        notifications,
        preferences,
        loyalty,
        referral,
        reviews,
        tickets,
        exported_at: new Date().toISOString(),
      }
      downloadBlob(
        JSON.stringify(local, null, 2),
        `mon-compte-local-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json'
      )
      notify(toast, 'info', 'Export local généré')
    } finally {
      setExportingData(false)
      setExportModalOpen(false)
    }
  }, [
    addresses,
    favorites,
    loyalty,
    notifications,
    orders,
    preferences,
    profile,
    referral,
    reviews,
    tickets,
    toast,
  ])

  const deleteAccount = useCallback(async () => {
    if (deleteForm.confirmText !== 'SUPPRIMER') {
      notify(toast, 'error', 'Tapez SUPPRIMER pour confirmer')
      return
    }

    setDeletingAccount(true)
    try {
      await fetchJSON('/api/user/account/delete', {
        method: 'POST',
        body: JSON.stringify({
          password: deleteForm.password,
          confirm: 'SUPPRIMER',
        }),
      })

      localStorage.removeItem(CACHE_KEY)
      notify(toast, 'success', 'Compte supprimé')
      logout()
      router.push('/')
    } catch (err: any) {
      notify(toast, 'error', getErrorMessage(err))
    } finally {
      setDeletingAccount(false)
    }
  }, [deleteForm, logout, router, toast])

  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY)
    loadedSectionsRef.current.clear()
    notify(toast, 'success', 'Cache vidé')
    handleRefresh()
  }, [handleRefresh, toast])

  /* ---------------------------------------------------------------- */
  /* Données dérivées                                                  */
  /* ---------------------------------------------------------------- */

  const stats = useMemo(() => {
    const inProgress = orders.filter((o) =>
      ['pending', 'processing', 'shipped'].includes(o.statut)
    ).length

    const unread = notifications.filter((n) => !n.read).length

    return {
      totalOrders: orders.length,
      inProgress,
      unread,
      favoritesCount: favorites.length,
      addressesCount: addresses.length,
      points: loyalty?.points || 0,
      tickets: tickets.filter((t) => t.statut === 'open' || t.statut === 'pending').length,
    }
  }, [favorites.length, loyalty?.points, notifications, orders, tickets])

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        !orderSearch ||
        `${o.numero_commande || ''} ${o.id}`.toLowerCase().includes(orderSearch.toLowerCase())

      const matchesStatus =
        orderStatusFilter === 'all' || o.statut === orderStatusFilter

      return matchesSearch && matchesStatus
    })
  }, [orderSearch, orderStatusFilter, orders])

  const filteredFavorites = useMemo(() => {
    return favorites.filter((f) =>
      !favoriteSearch ||
      (f.nom || '').toLowerCase().includes(favoriteSearch.toLowerCase())
    )
  }, [favoriteSearch, favorites])

  const filteredAddresses = useMemo(() => {
    return addresses.filter((a) =>
      !addressSearch ||
      `${a.nom || ''} ${a.ville || ''} ${a.quartier || ''}`
        .toLowerCase()
        .includes(addressSearch.toLowerCase())
    )
  }, [addressSearch, addresses])

  const filteredNotifications = useMemo(() => {
    if (notificationFilter === 'unread') {
      return notifications.filter((n) => !n.read)
    }
    return notifications
  }, [notificationFilter, notifications])

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) =>
      !reviewSearch ||
      `${r.product_name || ''} ${r.comment || ''}`
        .toLowerCase()
        .includes(reviewSearch.toLowerCase())
    )
  }, [reviewSearch, reviews])

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) =>
      !ticketSearch ||
      `${t.sujet || ''} ${t.message || ''}`
        .toLowerCase()
        .includes(ticketSearch.toLowerCase())
    )
  }, [ticketSearch, tickets])

  /* ---------------------------------------------------------------- */
  /* Rendus de sections                                                */
  /* ---------------------------------------------------------------- */

  const renderOverview = () => (
    <div className="space-y-6">
      <Card variant="glass" className="border-gold-400/20">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-muted">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile?.prenom || 'Avatar'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl font-bold text-gold-500">
                    {initials(profile?.prenom, profile?.nom)}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bienvenue</p>
                <h2 className="text-2xl font-bold text-foreground">
                  {profile?.prenom || profile?.nom || 'Mon compte'}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant={isVerified ? 'accent' : 'warm'} size="sm">
                    {isVerified ? 'Vérifié' : 'Non vérifié'}
                  </Badge>
                  <Badge variant="neutral" size="sm">
                    {loyalty?.tier || 'Bronze'}
                  </Badge>
                  {isOnboarded && (
                    <Badge variant="gold" size="sm">
                      Onboarding terminé
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="luxe"
                size="sm"
                leftIcon={<Pencil size={14} />}
                onClick={() => setProfileModalOpen(true)}
              >
                Modifier profil
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<MapPin size={14} />}
                onClick={() => changeTab('addresses')}
              >
                Adresses
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Package size={20} />}
          label="Commandes"
          value={stats.totalOrders}
          sub={`${stats.inProgress} en cours`}
        />
        <StatCard
          icon={<Heart size={20} />}
          label="Favoris"
          value={stats.favoritesCount}
        />
        <StatCard
          icon={<Bell size={20} />}
          label="Notifications"
          value={stats.unread}
          sub="non lues"
        />
        <StatCard
          icon={<Award size={20} />}
          label="Fidélité"
          value={stats.points}
          sub="points"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package size={18} className="text-gold-500" />
              Dernières commandes
            </CardTitle>
            <CardDescription>Aperçu rapide de vos achats</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sectionStatus.orders === 'loading' ? (
              <LoadingRows count={2} />
            ) : orders.length === 0 ? (
              <EmptyState
                icon={<Package size={28} />}
                title="Aucune commande"
                description="Vos commandes apparaîtront ici."
                action={
                  <Button variant="outline-gold" size="sm" onClick={() => router.push('/')}>
                    Découvrir la boutique
                  </Button>
                }
              />
            ) : (
              orders.slice(0, 3).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      #{order.numero_commande || order.id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.created_at)} • {order.items_count || 0} article(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={ORDER_STATUS_MAP[order.statut]?.variant || 'neutral'} size="sm">
                      {ORDER_STATUS_MAP[order.statut]?.label || order.statut}
                    </Badge>
                    <p className="mt-1 text-sm font-semibold text-gold-600">
                      {formatAmount(order.total_usd, order.currency)}
                    </p>
                  </div>
                </div>
              ))
            )}

            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => changeTab('orders')}
              rightIcon={<ChevronRight size={14} />}
            >
              Voir toutes les commandes
            </Button>
          </CardContent>
        </Card>

        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell size={18} className="text-gold-500" />
              Notifications récentes
            </CardTitle>
            <CardDescription>Restez informé de votre activité</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sectionStatus.notifications === 'loading' ? (
              <LoadingRows count={2} />
            ) : notifications.length === 0 ? (
              <EmptyState
                icon={<Bell size={28} />}
                title="Aucune notification"
                description="Vous êtes à jour."
              />
            ) : (
              notifications.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border p-3 ${
                    n.read
                      ? 'border-border bg-card'
                      : 'border-gold-400/30 bg-gold-500/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {n.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {n.message}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(n.created_at)}
                    </span>
                  </div>
                </div>
              ))
            )}

            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => changeTab('notifications')}
              rightIcon={<ChevronRight size={14} />}
            >
              Voir toutes les notifications
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap size={18} className="text-gold-500" />
            Actions rapides
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" onClick={() => setProfileModalOpen(true)} leftIcon={<UserCog size={14} />}>
              Modifier profil
            </Button>
            <Button variant="outline" onClick={openAddAddress} leftIcon={<Plus size={14} />}>
              Ajouter adresse
            </Button>
            <Button variant="outline" onClick={() => setPasswordModalOpen(true)} leftIcon={<KeyRound size={14} />}>
              Mot de passe
            </Button>
            <Button variant="outline" onClick={() => changeTab('support')} leftIcon={<LifeBuoy size={14} />}>
              Support
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderOrders = () => (
    <div className="space-y-5">
      <SectionHeader
        title="Mes commandes"
        description="Suivez, annulez ou demandez un retour"
      >
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            placeholder="Rechercher..."
            className={`${inputClass} pl-9`}
          />
        </div>

        <select
          value={orderStatusFilter}
          onChange={(e) => setOrderStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">Tous statuts</option>
          <option value="pending">En attente</option>
          <option value="processing">En préparation</option>
          <option value="shipped">Expédiée</option>
          <option value="delivered">Livrée</option>
          <option value="cancelled">Annulée</option>
          <option value="refunded">Remboursée</option>
          <option value="return_requested">Retour demandé</option>
        </select>
      </SectionHeader>

      {sectionStatus.orders === 'loading' ? (
        <LoadingRows count={4} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title="Aucune commande trouvée"
          description="Modifiez vos filtres ou explorez la boutique."
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const status = ORDER_STATUS_MAP[order.statut] || {
              label: order.statut,
              variant: 'neutral' as const,
            }

            return (
              <Card key={order.id} variant="glass" className="border-gold-400/20">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                          #{order.numero_commande || order.id}
                        </p>
                        <Badge variant={status.variant} size="sm">
                          {status.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDate(order.created_at)} • {order.items_count || 0} article(s)
                      </p>
                      <p className="mt-2 text-lg font-bold text-gold-600">
                        {formatAmount(order.total_usd, order.currency)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<ExternalLink size={14} />}
                        onClick={() => router.push(`/commande/confirmation?id=${order.id}`)}
                      >
                        Détails
                      </Button>

                      {['pending', 'processing'].includes(order.statut) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                          disabled={cancellingOrderId === order.id}
                          onClick={() => cancelOrder(order.id)}
                          leftIcon={
                            cancellingOrderId === order.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <X size={14} />
                            )
                          }
                        >
                          Annuler
                        </Button>
                      )}

                      {order.statut === 'delivered' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={returningOrderId === order.id}
                          onClick={() => requestReturn(order.id)}
                          leftIcon={
                            returningOrderId === order.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RotateCcw size={14} />
                            )
                          }
                        >
                          Retour
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Download size={14} />}
                        onClick={() => window.open(`/api/commandes/${order.id}/facture`, '_blank')}
                      >
                        Facture
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderFavorites = () => (
    <div className="space-y-5">
      <SectionHeader title="Mes favoris" description="Produits enregistrés">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={favoriteSearch}
            onChange={(e) => setFavoriteSearch(e.target.value)}
            placeholder="Rechercher..."
            className={`${inputClass} pl-9`}
          />
        </div>
      </SectionHeader>

      {sectionStatus.favorites === 'loading' ? (
        <LoadingRows count={3} />
      ) : filteredFavorites.length === 0 ? (
        <EmptyState
          icon={<Heart size={28} />}
          title="Aucun favori"
          description="Ajoutez des produits à vos favoris pour les retrouver ici."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFavorites.map((fav) => (
            <Card key={fav.id} variant="glass" className="border-gold-400/20">
              <CardContent className="p-4">
                <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                  {fav.image ? (
                    <img src={fav.image} alt={fav.nom} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ShoppingCart size={28} />
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  <p className="line-clamp-1 font-medium text-foreground">{fav.nom}</p>
                  <p className="text-sm font-semibold text-gold-600">
                    {formatAmount(fav.prix_usd, 'USD')}
                  </p>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => router.push(`/produits/${fav.product_id || fav.id}`)}
                    >
                      Voir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                      disabled={removingFavoriteId === fav.id}
                      onClick={() => removeFavorite(fav.id)}
                    >
                      {removingFavoriteId === fav.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )

  const renderAddresses = () => (
    <div className="space-y-5">
      <SectionHeader title="Mes adresses" description="Points de livraison et retrait">
        <Button variant="luxe" size="sm" leftIcon={<Plus size={14} />} onClick={openAddAddress}>
          Ajouter
        </Button>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={addressSearch}
            onChange={(e) => setAddressSearch(e.target.value)}
            placeholder="Rechercher..."
            className={`${inputClass} pl-9`}
          />
        </div>
      </SectionHeader>

      {sectionStatus.addresses === 'loading' ? (
        <LoadingRows count={3} />
      ) : filteredAddresses.length === 0 ? (
        <EmptyState
          icon={<MapPin size={28} />}
          title="Aucune adresse"
          description="Ajoutez une adresse pour faciliter vos commandes."
          action={
            <Button variant="outline-gold" size="sm" onClick={openAddAddress}>
              Ajouter une adresse
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredAddresses.map((addr) => (
            <Card key={addr.id} variant="glass" className="border-gold-400/20">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{addr.nom}</p>
                      {addr.is_default && (
                        <Badge variant="gold" size="sm">
                          Par défaut
                        </Badge>
                      )}
                      <Badge variant="neutral" size="sm">
                        {addr.type || 'maison'}
                      </Badge>
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {addr.destinataire || profile?.prenom} • {addr.telephone || profile?.telephone}
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {[addr.quartier, addr.avenue, addr.numero, addr.ville, addr.province]
                        .filter(Boolean)
                        .join(', ')}
                    </p>

                    {addr.reference && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Référence : {addr.reference}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditAddress(addr)}
                      aria-label="Modifier"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:bg-red-500/10"
                      onClick={() => deleteAddress(addr.id)}
                      aria-label="Supprimer"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {!addr.is_default && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setDefaultAddress(addr.id)}
                    leftIcon={<Check size={14} />}
                  >
                    Définir par défaut
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )

  const renderNotifications = () => (
    <div className="space-y-5">
      <SectionHeader title="Notifications" description="Alertes commandes, promos et système">
        <select
          value={notificationFilter}
          onChange={(e) => setNotificationFilter(e.target.value as any)}
          className={selectClass}
        >
          <option value="all">Toutes</option>
          <option value="unread">Non lues</option>
        </select>

        <Button
          variant="outline"
          size="sm"
          disabled={markingAllRead}
          onClick={markAllNotificationsRead}
          leftIcon={markingAllRead ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        >
          Tout lire
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setNotificationSettingsOpen(true)}
          leftIcon={<Settings size={14} />}
        >
          Réglages
        </Button>
      </SectionHeader>

      {sectionStatus.notifications === 'loading' ? (
        <LoadingRows count={4} />
      ) : filteredNotifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={28} />}
          title="Aucune notification"
          description="Vous êtes à jour."
        />
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((n) => (
            <Card
              key={n.id}
              variant="glass"
              className={`border ${n.read ? 'border-border' : 'border-gold-400/30 bg-gold-500/5'}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{n.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {relativeTime(n.created_at)}
                    </p>
                  </div>

                  {!n.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markNotificationRead(n.id)}
                      leftIcon={<Check size={14} />}
                    >
                      Lu
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )

  const renderSecurity = () => (
    <div className="space-y-6">
      <SectionHeader title="Sécurité" description="Protégez votre compte" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock size={18} className="text-gold-500" />
              Mot de passe
            </CardTitle>
            <CardDescription>Modifiez régulièrement votre mot de passe</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline-gold"
              leftIcon={<KeyRound size={14} />}
              onClick={() => setPasswordModalOpen(true)}
            >
              Changer le mot de passe
            </Button>
          </CardContent>
        </Card>

        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-gold-500" />
              Authentification à deux facteurs
            </CardTitle>
            <CardDescription>
              Ajoutez une couche de sécurité supplémentaire
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Statut : {profile?.two_factor_enabled ? 'Activée' : 'Désactivée'}
              </span>
              <Switch
                checked={!!profile?.two_factor_enabled}
                onChange={toggle2FA}
                disabled={toggling2FA}
              />
            </div>

            {toggling2FA && (
              <p className="text-xs text-muted-foreground">
                Mise à jour en cours...
              </p>
            )}
          </CardContent>
        </Card>

        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText size={18} className="text-gold-500" />
              Question secrète
            </CardTitle>
            <CardDescription>Récupération de compte</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Question secrète">
              <input
                value={securityForm.question_secrete}
                onChange={(e) =>
                  setSecurityForm((p) => ({ ...p, question_secrete: e.target.value }))
                }
                className={inputClass}
                placeholder="Ex : nom du premier animal"
              />
            </Field>

            <Field label="Réponse secrète">
              <input
                value={securityForm.reponse_secrete}
                onChange={(e) =>
                  setSecurityForm((p) => ({ ...p, reponse_secrete: e.target.value }))
                }
                className={inputClass}
                placeholder="Laissez vide pour conserver l'ancienne réponse"
              />
            </Field>

            <Button variant="luxe" onClick={saveSecurityQuestion} leftIcon={<Save size={14} />}>
              Enregistrer
            </Button>
          </CardContent>
        </Card>

        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MonitorSmartphone size={18} className="text-gold-500" />
              Sessions actives
            </CardTitle>
            <CardDescription>Appareils connectés à votre compte</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sectionStatus.security === 'loading' ? (
              <LoadingRows count={2} />
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune session détectée.</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {s.device}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.location} • {relativeTime(s.last_seen)}
                    </p>
                  </div>

                  {s.current ? (
                    <Badge variant="accent" size="sm">
                      Actuelle
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                      disabled={revokingSessionId === s.id}
                      onClick={() => revokeSession(s.id)}
                    >
                      {revokingSessionId === s.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        'Révoquer'
                      )}
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock size={18} className="text-gold-500" />
            Journal d'activité
          </CardTitle>
          <CardDescription>Dernières actions sur votre compte</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sectionStatus.security === 'loading' ? (
            <LoadingRows count={3} />
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune activité récente.</p>
          ) : (
            activity.slice(0, 10).map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                <div className="rounded-lg bg-muted p-2 text-gold-500">
                  <Info size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{a.action}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {relativeTime(a.created_at)} {a.ip ? `• ${a.ip}` : ''}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderPreferences = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Préférences"
        description="Personnalisez votre expérience"
      />

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe size={18} className="text-gold-500" />
            Général
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Langue">
            <select
              value={preferenceForm.language}
              onChange={(e) =>
                setPreferenceForm((p) => ({ ...p, language: e.target.value }))
              }
              className={selectClass}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="sw">Kiswahili</option>
              <option value="ln">Lingala</option>
            </select>
          </Field>

          <Field label="Devise principale">
            <select
              value={preferenceForm.currency_display}
              onChange={(e) =>
                setPreferenceForm((p) => ({
                  ...p,
                  currency_display: e.target.value as any,
                }))
              }
              className={selectClass}
            >
              <option value="USD">USD - Dollar</option>
              <option value="CDF">CDF - Franc Congolais</option>
            </select>
          </Field>

          <Field label="Devise secondaire">
            <select
              value={preferenceForm.secondary_currency}
              onChange={(e) =>
                setPreferenceForm((p) => ({
                  ...p,
                  secondary_currency: e.target.value as any,
                }))
              }
              className={selectClass}
            >
              <option value="CDF">CDF - Franc Congolais</option>
              <option value="USD">USD - Dollar</option>
            </select>
          </Field>

          <Field label="Fuseau horaire">
            <input
              value={preferenceForm.timezone}
              onChange={(e) =>
                setPreferenceForm((p) => ({ ...p, timezone: e.target.value }))
              }
              className={inputClass}
            />
          </Field>

          <Field label="Format de date">
            <select
              value={preferenceForm.date_format}
              onChange={(e) =>
                setPreferenceForm((p) => ({ ...p, date_format: e.target.value }))
              }
              className={selectClass}
            >
              <option value="DD/MM/YYYY">JJ/MM/AAAA</option>
              <option value="MM/DD/YYYY">MM/JJ/AAAA</option>
              <option value="YYYY-MM-DD">AAAA-MM-JJ</option>
            </select>
          </Field>
        </CardContent>
      </Card>

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette size={18} className="text-gold-500" />
            Apparence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { value: 'system', label: 'Système', icon: <MonitorSmartphone size={16} /> },
              { value: 'light', label: 'Clair', icon: <Sun size={16} /> },
              { value: 'dark', label: 'Sombre', icon: <Moon size={16} /> },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setPreferenceForm((p) => ({ ...p, theme: opt.value as any }))
                }
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm transition ${
                  preferenceForm.theme === opt.value
                    ? 'border-gold-400 bg-gold-500/10 text-gold-600'
                    : 'border-border bg-card text-muted-foreground hover:border-gold-400/50'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Son</p>
              <p className="text-xs text-muted-foreground">Activer les sons d'interface</p>
            </div>
            <Switch
              checked={preferenceForm.sound}
              onChange={(v) => setPreferenceForm((p) => ({ ...p, sound: v }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Mouvement réduit</p>
              <p className="text-xs text-muted-foreground">Limiter les animations</p>
            </div>
            <Switch
              checked={preferenceForm.reduced_motion}
              onChange={(v) => setPreferenceForm((p) => ({ ...p, reduced_motion: v }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Actualisation automatique</p>
              <p className="text-xs text-muted-foreground">Rafraîchir les données en arrière-plan</p>
            </div>
            <Switch
              checked={preferenceForm.auto_refresh}
              onChange={(v) => setPreferenceForm((p) => ({ ...p, auto_refresh: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell size={18} className="text-gold-500" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {[
            { key: 'notif_email', label: 'Email', icon: <Mail size={14} /> },
            { key: 'notif_sms', label: 'SMS', icon: <Phone size={14} /> },
            { key: 'notif_push', label: 'Push', icon: <Smartphone size={14} /> },
            { key: 'notif_whatsapp', label: 'WhatsApp', icon: <MessageIcon /> },
            { key: 'notif_orders', label: 'Commandes', icon: <Package size={14} /> },
            { key: 'notif_promos', label: 'Promotions', icon: <Gift size={14} /> },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-gold-500">{item.icon}</span>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </div>
              <Switch
                checked={Boolean((preferenceForm as any)[item.key])}
                onChange={(v) => setPreferenceForm((p) => ({ ...p, [item.key]: v }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-gold-500" />
            Confidentialité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Visibilité du profil">
            <select
              value={preferenceForm.profile_visibility}
              onChange={(e) =>
                setPreferenceForm((p) => ({
                  ...p,
                  profile_visibility: e.target.value as any,
                }))
              }
              className={selectClass}
            >
              <option value="private">Privé</option>
              <option value="friends">Amis</option>
              <option value="public">Public</option>
            </select>
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Consentement marketing</p>
              <p className="text-xs text-muted-foreground">
                Recevoir des offres et newsletters
              </p>
            </div>
            <Switch
              checked={preferenceForm.marketing_consent}
              onChange={(v) => setPreferenceForm((p) => ({ ...p, marketing_consent: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Button
        variant="luxe"
        fullWidth
        disabled={savingPreferences}
        onClick={savePreferences}
        leftIcon={savingPreferences ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
      >
        Enregistrer les préférences
      </Button>
    </div>
  )

  const renderLoyalty = () => (
    <div className="space-y-6">
      <SectionHeader title="Fidélité" description="Vos points et avantages" />

      {sectionStatus.loyalty === 'loading' ? (
        <LoadingRows count={3} />
      ) : (
        <>
          <Card variant="glass" className="border-gold-400/20">
            <CardContent className="p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Solde de points</p>
                  <p className="mt-1 text-4xl font-bold text-gold-600">
                    {loyalty?.points || 0}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Niveau actuel : <span className="font-semibold text-foreground">{loyalty?.tier || 'Bronze'}</span>
                  </p>
                </div>

                <div className="w-full max-w-sm">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progression</span>
                    <span>{loyalty?.progress || 0}%</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${loyalty?.progress || 0}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Prochain niveau : {loyalty?.next_tier || 'Argent'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard icon={<Sparkles size={20} />} label="Avantage actuel" value={loyalty?.tier || 'Bronze'} />
            <StatCard icon={<TrendingUp size={20} />} label="Points gagnés" value={loyalty?.points || 0} />
            <StatCard icon={<Users size={20} />} label="Parrainages" value={referral?.invited_count || 0} />
          </div>

          <Card variant="glass" className="border-gold-400/20">
            <CardHeader>
              <CardTitle>Historique fidélité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(loyalty?.history || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun historique disponible.</p>
              ) : (
                (loyalty?.history || []).slice(0, 10).map((h: any, idx: number) => (
                  <div key={h.id || idx} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{h.description || h.action}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(h.created_at)}</p>
                    </div>
                    <p className={`text-sm font-bold ${h.points > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {h.points > 0 ? '+' : ''}{h.points}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )

  const renderReferral = () => (
    <div className="space-y-6">
      <SectionHeader title="Parrainage" description="Invitez des amis et gagnez des récompenses" />

      {sectionStatus.referral === 'loading' ? (
        <LoadingRows count={2} />
      ) : (
        <>
          <Card variant="glass" className="border-gold-400/20">
            <CardContent className="p-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Votre code</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="rounded-lg border border-border bg-muted px-3 py-2 text-lg font-bold text-gold-600">
                      {referral?.code || '—'}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(referral?.code || '', 'Code copié')}
                      leftIcon={<Copy size={14} />}
                    >
                      Copier
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Lien de parrainage</p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={referral?.link || ''}
                      className={`${inputClass} truncate`}
                    />
                    <Button
                      variant="luxe"
                      size="sm"
                      onClick={() => copyToClipboard(referral?.link || '', 'Lien copié')}
                    >
                      <Copy size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={<Users size={20} />} label="Invités" value={referral?.invited_count || 0} />
            <StatCard icon={<CheckCircle2 size={20} />} label="Récompensés" value={referral?.rewarded_count || 0} />
            <StatCard icon={<Banknote size={20} />} label="Gains" value={formatAmount(referral?.total_earned || 0, 'USD')} />
          </div>

          <Card variant="glass" className="border-gold-400/20">
            <CardHeader>
              <CardTitle>Comment ça marche</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                'Partagez votre code ou lien unique.',
                'Votre ami s\'inscrit et passe une première commande.',
                'Vous recevez tous les deux une récompense.',
              ].map((step, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-sm font-bold text-gold-600">
                    {idx + 1}
                  </div>
                  <p className="text-sm text-muted-foreground">{step}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )

  const renderReviews = () => (
    <div className="space-y-5">
      <SectionHeader title="Mes avis" description="Vos évaluations produits">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={reviewSearch}
            onChange={(e) => setReviewSearch(e.target.value)}
            placeholder="Rechercher..."
            className={`${inputClass} pl-9`}
          />
        </div>
      </SectionHeader>

      {sectionStatus.reviews === 'loading' ? (
        <LoadingRows count={3} />
      ) : filteredReviews.length === 0 ? (
        <EmptyState
          icon={<Star size={28} />}
          title="Aucun avis"
          description="Partagez votre expérience après vos commandes."
        />
      ) : (
        <div className="space-y-3">
          {filteredReviews.map((r) => (
            <Card key={r.id} variant="glass" className="border-gold-400/20">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.product_name}</p>
                    <div className="mt-1 flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={14}
                          className={i < (r.rating || 0) ? 'text-gold-500' : 'text-muted'}
                          fill={i < (r.rating || 0) ? 'currentColor' : 'none'}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(r.created_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )

  const renderSupport = () => (
    <div className="space-y-6">
      <SectionHeader title="Support" description="Contactez-nous ou suivez vos tickets" />

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket size={18} className="text-gold-500" />
            Nouveau ticket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Sujet">
              <input
                value={ticketForm.sujet}
                onChange={(e) => setTicketForm((p) => ({ ...p, sujet: e.target.value }))}
                className={inputClass}
                placeholder="Objet de votre demande"
              />
            </Field>

            <Field label="Catégorie">
              <select
                value={ticketForm.categorie}
                onChange={(e) => setTicketForm((p) => ({ ...p, categorie: e.target.value }))}
                className={selectClass}
              >
                <option value="general">Général</option>
                <option value="commande">Commande</option>
                <option value="paiement">Paiement</option>
                <option value="livraison">Livraison</option>
                <option value="retour">Retour</option>
                <option value="compte">Compte</option>
              </select>
            </Field>
          </div>

          <Field label="Priorité">
            <select
              value={ticketForm.priorite}
              onChange={(e) => setTicketForm((p) => ({ ...p, priorite: e.target.value }))}
              className={selectClass}
            >
              <option value="low">Basse</option>
              <option value="normal">Normale</option>
              <option value="high">Haute</option>
              <option value="urgent">Urgente</option>
            </select>
          </Field>

          <Field label="Message">
            <textarea
              value={ticketForm.message}
              onChange={(e) => setTicketForm((p) => ({ ...p, message: e.target.value }))}
              rows={5}
              className={inputClass}
              placeholder="Décrivez votre problème..."
            />
          </Field>

          <Button
            variant="luxe"
            disabled={creatingTicket}
            onClick={createTicket}
            leftIcon={creatingTicket ? <Loader2 size={14} className="animate-spin" /> : <SendIcon />}
          >
            Envoyer
          </Button>
        </CardContent>
      </Card>

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle>Mes tickets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sectionStatus.support === 'loading' ? (
            <LoadingRows count={2} />
          ) : filteredTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun ticket ouvert.</p>
          ) : (
            filteredTickets.map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{t.sujet}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.message}</p>
                  </div>
                  <Badge
                    variant={
                      t.statut === 'closed'
                        ? 'neutral'
                        : t.statut === 'resolved'
                        ? 'accent'
                        : 'warm'
                    }
                    size="sm"
                  >
                    {t.statut}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDate(t.created_at)} • {t.categorie} • {t.priorite}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderPrivacy = () => (
    <div className="space-y-6">
      <SectionHeader title="Données et confidentialité" description="Contrôlez vos informations" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download size={18} className="text-gold-500" />
              Exporter mes données
            </CardTitle>
            <CardDescription>
              Téléchargez une copie de vos informations personnelles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Profil, adresses, commandes, favoris, notifications, préférences et plus.
            </p>
            <Button
              variant="outline-gold"
              onClick={() => setExportModalOpen(true)}
              leftIcon={<FileText size={14} />}
            >
              Lancer l'export
            </Button>
          </CardContent>
        </Card>

        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw size={18} className="text-gold-500" />
              Cache local
            </CardTitle>
            <CardDescription>
              Supprimez les données temporairement stockées sur cet appareil
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={clearCache} leftIcon={<Trash2 size={14} />}>
              Vider le cache
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card variant="glass" className="border-red-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500">
            <AlertTriangle size={18} />
            Supprimer mon compte
          </CardTitle>
          <CardDescription>
            Cette action est irréversible. Toutes vos données seront effacées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="border-red-500/40 text-red-500 hover:bg-red-500/10"
            onClick={() => setDeleteModalOpen(true)}
            leftIcon={<Trash2 size={14} />}
          >
            Supprimer définitivement
          </Button>
        </CardContent>
      </Card>
    </div>
  )

  /* ---------------------------------------------------------------- */
  /* Rendu principal                                                   */
  /* ---------------------------------------------------------------- */

  if (authLoading || (loadState === 'loading' && !profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center" role="status" aria-live="polite">
          <Loader2 size={40} className="mx-auto animate-spin text-gold-500" />
          <p className="text-sm text-muted-foreground">Chargement du profil...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground transition hover:text-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
          >
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">Retour</span>
          </Link>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge variant="warm" size="sm">
                <WifiOff size={12} className="mr-1" />
                Hors ligne
              </Badge>
            )}

            <button
              onClick={handleRefresh}
              disabled={isRefreshing || !isOnline}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted-foreground transition hover:text-gold-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label="Actualiser"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
          </div>
        </div>

        {/* Titre */}
        <div className="mb-8 flex items-center gap-3">
          <UserCircle size={32} className="text-gold-500" />
          <h1 className="text-3xl font-bold text-foreground font-serif">Mon Profil</h1>
        </div>

        {/* Alertes */}
        {!isOnline && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <WifiOff size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Mode hors ligne</p>
              <p className="mt-1 text-xs opacity-80">
                Affichage des données en cache. Certaines actions peuvent échouer.
              </p>
            </div>
          </div>
        )}

        {loadState === 'partial' && errorMessage && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p>{errorMessage}</p>
              <button
                onClick={() => handleRefresh()}
                className="mt-2 text-xs font-medium underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {loadState === 'error' && !profile && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/40">
            <AlertTriangle size={40} className="mx-auto text-red-500" />
            <p className="mt-3 font-medium text-lg text-red-800 dark:text-red-200">
              Impossible de charger le profil
            </p>
            <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
              {errorMessage}
            </p>
            <Button
              variant="outline"
              className="mx-auto mt-4"
              onClick={() => loadCore(true)}
              disabled={!isOnline}
            >
              <RefreshCw size={16} className="mr-2" />
              Réessayer
            </Button>
          </div>
        )}

        {isRefreshing && profile && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <Loader2 size={16} className="animate-spin" />
            Actualisation en cours...
          </div>
        )}

        {/* Layout */}
        {profile && (
          <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
            {/* Sidebar */}
            <aside className="space-y-4">
              <Card variant="glass" className="border-gold-400/20">
                <CardContent className="p-5 text-center">
                  <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-3xl bg-muted">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.prenom || 'Avatar'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-gold-500">
                        {initials(profile.prenom, profile.nom)}
                      </div>
                    )}

                    <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition hover:opacity-100">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarFile}
                      />
                      <Pencil size={18} className="text-white" />
                    </label>
                  </div>

                  <h2 className="mt-4 text-lg font-bold text-foreground">
                    {profile.prenom} {profile.nom}
                  </h2>
                  <p className="text-sm text-muted-foreground">{profile.email || user.email}</p>

                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <Badge variant={isVerified ? 'accent' : 'warm'} size="sm">
                      {isVerified ? 'Vérifié' : 'Non vérifié'}
                    </Badge>
                    <Badge variant="neutral" size="sm">
                      {loyalty?.tier || 'Bronze'}
                    </Badge>
                  </div>

                  <div className="mt-5 space-y-2">
                    <Button
                      variant="luxe"
                      fullWidth
                      size="sm"
                      leftIcon={<Pencil size={14} />}
                      onClick={() => setProfileModalOpen(true)}
                    >
                      Modifier profil
                    </Button>

                    <Button
                      variant="outline-gold"
                      fullWidth
                      size="sm"
                      leftIcon={<Settings size={14} />}
                      onClick={() => changeTab('preferences')}
                    >
                      Préférences
                    </Button>

                    <Button
                      variant="outline"
                      fullWidth
                      size="sm"
                      className="text-red-500"
                      leftIcon={<LogOut size={14} />}
                      onClick={logout}
                    >
                      Déconnexion
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <nav className="space-y-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => changeTab(tab.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-gold-500 ${
                      activeTab === tab.id
                        ? 'border-gold-400/40 bg-gold-500/10 text-gold-600'
                        : 'border-transparent text-muted-foreground hover:border-gold-400/20 hover:bg-muted'
                    }`}
                  >
                    <span className={activeTab === tab.id ? 'text-gold-500' : ''}>
                      {tab.icon}
                    </span>
                    <span className="flex-1 font-medium">{tab.label}</span>
                    {tab.id === 'notifications' && stats.unread > 0 && (
                      <Badge variant="danger" size="sm">
                        {stats.unread}
                      </Badge>
                    )}
                    {tab.id === 'support' && stats.tickets > 0 && (
                      <Badge variant="warm" size="sm">
                        {stats.tickets}
                      </Badge>
                    )}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Contenu */}
            <main className="min-w-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {activeTab === 'overview' && renderOverview()}
                  {activeTab === 'orders' && renderOrders()}
                  {activeTab === 'favorites' && renderFavorites()}
                  {activeTab === 'addresses' && renderAddresses()}
                  {activeTab === 'notifications' && renderNotifications()}
                  {activeTab === 'security' && renderSecurity()}
                  {activeTab === 'preferences' && renderPreferences()}
                  {activeTab === 'loyalty' && renderLoyalty()}
                  {activeTab === 'referral' && renderReferral()}
                  {activeTab === 'reviews' && renderReviews()}
                  {activeTab === 'support' && renderSupport()}
                  {activeTab === 'privacy' && renderPrivacy()}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        )}
      </Container>

      {/* Modal profil */}
      <Dialog
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Modifier le profil"
        description="Mettez à jour vos informations personnelles"
        footer={
          <>
            <Button variant="outline" onClick={() => setProfileModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="luxe"
              disabled={savingProfile}
              onClick={saveProfile}
              leftIcon={savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Prénom">
            <input
              value={profileForm.prenom}
              onChange={(e) => setProfileForm((p) => ({ ...p, prenom: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Nom">
            <input
              value={profileForm.nom}
              onChange={(e) => setProfileForm((p) => ({ ...p, nom: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Téléphone">
            <input
              value={profileForm.telephone}
              onChange={(e) => setProfileForm((p) => ({ ...p, telephone: e.target.value }))}
              className={inputClass}
              placeholder="08xxxxxxxx"
            />
          </Field>

          <Field label="Email">
            <input
              value={profileForm.email}
              onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
              className={inputClass}
              type="email"
            />
          </Field>

          <Field label="Date de naissance">
            <input
              value={profileForm.date_naissance}
              onChange={(e) => setProfileForm((p) => ({ ...p, date_naissance: e.target.value }))}
              className={inputClass}
              type="date"
            />
          </Field>

          <Field label="Genre">
            <select
              value={profileForm.genre}
              onChange={(e) => setProfileForm((p) => ({ ...p, genre: e.target.value }))}
              className={selectClass}
            >
              <option value="">Non précisé</option>
              <option value="male">Homme</option>
              <option value="female">Femme</option>
              <option value="other">Autre</option>
            </select>
          </Field>

          <div className="md:col-span-2">
            <Field label="Bio">
              <textarea
                value={profileForm.bio}
                onChange={(e) => setProfileForm((p) => ({ ...p, bio: e.target.value }))}
                rows={4}
                className={inputClass}
                placeholder="Parlez-nous un peu de vous..."
              />
            </Field>
          </div>
        </div>
      </Dialog>

      {/* Modal adresse */}
      <Dialog
        open={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        title={addressForm.id ? 'Modifier l\'adresse' : 'Ajouter une adresse'}
        description="Informations de livraison ou de retrait"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddressModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="luxe"
              disabled={savingAddress}
              onClick={saveAddress}
              leftIcon={savingAddress ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nom de l'adresse">
            <input
              value={addressForm.nom}
              onChange={(e) => setAddressForm((p) => ({ ...p, nom: e.target.value }))}
              className={inputClass}
              placeholder="Ex : Domicile, Bureau"
            />
          </Field>

          <Field label="Destinataire">
            <input
              value={addressForm.destinataire}
              onChange={(e) => setAddressForm((p) => ({ ...p, destinataire: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Téléphone">
            <input
              value={addressForm.telephone}
              onChange={(e) => setAddressForm((p) => ({ ...p, telephone: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Type">
            <select
              value={addressForm.type}
              onChange={(e) => setAddressForm((p) => ({ ...p, type: e.target.value }))}
              className={selectClass}
            >
              <option value="maison">Maison</option>
              <option value="bureau">Bureau</option>
              <option value="point_retrait">Point de retrait</option>
              <option value="autre">Autre</option>
            </select>
          </Field>

          <Field label="Province">
            <input
              value={addressForm.province}
              onChange={(e) => setAddressForm((p) => ({ ...p, province: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Ville">
            <input
              value={addressForm.ville}
              onChange={(e) => setAddressForm((p) => ({ ...p, ville: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Commune">
            <input
              value={addressForm.commune}
              onChange={(e) => setAddressForm((p) => ({ ...p, commune: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Quartier">
            <input
              value={addressForm.quartier}
              onChange={(e) => setAddressForm((p) => ({ ...p, quartier: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Avenue">
            <input
              value={addressForm.avenue}
              onChange={(e) => setAddressForm((p) => ({ ...p, avenue: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Numéro">
            <input
              value={addressForm.numero}
              onChange={(e) => setAddressForm((p) => ({ ...p, numero: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Point de repère">
              <input
                value={addressForm.reference}
                onChange={(e) => setAddressForm((p) => ({ ...p, reference: e.target.value }))}
                className={inputClass}
                placeholder="Ex : à côté de l'école, en face du marché"
              />
            </Field>
          </div>

          <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Adresse par défaut</p>
              <p className="text-xs text-muted-foreground">Utilisée automatiquement au checkout</p>
            </div>
            <Switch
              checked={addressForm.is_default}
              onChange={(v) => setAddressForm((p) => ({ ...p, is_default: v }))}
            />
          </div>
        </div>
      </Dialog>

      {/* Modal mot de passe */}
      <Dialog
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title="Changer le mot de passe"
        description="Sécurisez votre compte"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPasswordModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="luxe"
              disabled={savingPassword}
              onClick={changePassword}
              leftIcon={savingPassword ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            >
              Valider
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Mot de passe actuel">
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Field label="Nouveau mot de passe">
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Field label="Confirmer le mot de passe">
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>
      </Dialog>

      {/* Modal paramètres notifications */}
      <Dialog
        open={notificationSettingsOpen}
        onClose={() => setNotificationSettingsOpen(false)}
        title="Paramètres de notifications"
        description="Choisissez ce que vous souhaitez recevoir"
        footer={
          <Button
            variant="luxe"
            onClick={async () => {
              await savePreferences()
              setNotificationSettingsOpen(false)
            }}
            leftIcon={<Save size={14} />}
          >
            Enregistrer
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { key: 'notif_email', label: 'Email' },
            { key: 'notif_sms', label: 'SMS' },
            { key: 'notif_push', label: 'Push' },
            { key: 'notif_whatsapp', label: 'WhatsApp' },
            { key: 'notif_orders', label: 'Commandes' },
            { key: 'notif_promos', label: 'Promotions' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              <Switch
                checked={Boolean((preferenceForm as any)[item.key])}
                onChange={(v) => setPreferenceForm((p) => ({ ...p, [item.key]: v }))}
              />
            </div>
          ))}
        </div>
      </Dialog>

      {/* Modal export */}
      <Dialog
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Exporter mes données"
        description="Générer un fichier JSON contenant vos informations"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setExportModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="luxe"
              disabled={exportingData}
              onClick={exportData}
              leftIcon={exportingData ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            >
              Télécharger
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          L'export inclura votre profil, vos adresses, commandes, favoris, notifications,
          préférences, fidélité, parrainage, avis et tickets support si disponibles.
        </p>
      </Dialog>

      {/* Modal suppression compte */}
      <Dialog
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Supprimer le compte"
        description="Cette action est définitive"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="outline"
              className="border-red-500/40 text-red-500 hover:bg-red-500/10"
              disabled={deletingAccount}
              onClick={deleteAccount}
              leftIcon={deletingAccount ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            >
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
            Toutes vos données seront effacées : profil, commandes, adresses, favoris,
            notifications, préférences et historique.
          </div>

          <Field label="Mot de passe">
            <input
              type="password"
              value={deleteForm.password}
              onChange={(e) => setDeleteForm((p) => ({ ...p, password: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label='Tapez "SUPPRIMER" pour confirmer'>
            <input
              value={deleteForm.confirmText}
              onChange={(e) => setDeleteForm((p) => ({ ...p, confirmText: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>
      </Dialog>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }

        .animate-slide-down {
          animation: slideDown 0.3s ease-out;
        }

        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in,
          .animate-slide-down {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Icônes locales simples pour éviter dépendances manquantes           */
/* ------------------------------------------------------------------ */

function MessageIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}