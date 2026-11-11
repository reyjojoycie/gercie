// components/profile/ProfileContent.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  User,
  ShieldCheck,
  MapPin,
  Plus,
  Trash2,
  Edit,
  Key,
  Clock,
  Mail,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  X,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  MonitorSmartphone,
  Settings,
  Bell,
  Download,
  Database,
  Globe,
  Moon,
  Sun,
  Palette,
  Lock,
  RefreshCw,
  Search,
  ChevronRight,
  Copy,
  Check,
  ShieldAlert,
  FileText,
  RotateCcw,
  Info,
  Zap,
  BadgeCheck,
  DollarSign,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import LocationSelector from '@/components/LocationSelector'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type TabId =
  | 'general'
  | 'security'
  | 'addresses'
  | 'preferences'
  | 'notifications'
  | 'data'

interface Address {
  id: string
  nom: string
  destinataire?: string
  telephone?: string
  type?: string
  province_id?: number | string | null
  ville_id?: number | string | null
  commune_id?: number | string | null
  quartier?: string
  avenue?: string
  numero?: string
  reference?: string
  is_default?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: any
}

interface AddressForm {
  id: string | null
  nom: string
  destinataire: string
  telephone: string
  type: string
  province_id: number | string | null
  ville_id: number | string | null
  commune_id: number | string | null
  quartier: string
  avenue: string
  numero: string
  reference: string
  is_default: boolean
}

interface SessionDevice {
  id: string
  device: string
  browser?: string
  os?: string
  location?: string
  ip?: string
  last_seen?: string
  created_at?: string
  current?: boolean
  raw?: any
}

interface ActivityLog {
  id: string
  action: string
  description?: string
  created_at?: string
  ip?: string
  raw?: any
}

interface NotificationItem {
  id: string
  title: string
  message: string
  read: boolean
  type?: string
  created_at?: string
  raw?: any
}

interface Preferences {
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
  notif_security: boolean
  sound: boolean
  reduced_motion: boolean
  auto_refresh: boolean
  marketing_consent: boolean
  profile_visibility: 'public' | 'private' | 'friends'
  [key: string]: any
}

export interface ProfileContentProps {
  profile: any
  setProfile: (profile: any) => void
  user: any
  isOnboarded: boolean
  addresses: Address[]
  setAddresses: (addresses: Address[]) => void
  activeTab?: TabId | string
  onTabChange?: (tab: TabId) => void
  className?: string
}

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

const FETCH_TIMEOUT = 15000
const PHONE_REGEX = /^0[0-9]{9}$/

const TAB_ITEMS: {
  id: TabId
  label: string
  icon: ReactNode
  description: string
}[] = [
  {
    id: 'general',
    label: 'Général',
    icon: <User size={16} />,
    description: 'Informations personnelles',
  },
  {
    id: 'security',
    label: 'Sécurité',
    icon: <ShieldCheck size={16} />,
    description: 'Mot de passe, 2FA, sessions',
  },
  {
    id: 'addresses',
    label: 'Adresses',
    icon: <MapPin size={16} />,
    description: 'Livraison et retrait',
  },
  {
    id: 'preferences',
    label: 'Préférences',
    icon: <Settings size={16} />,
    description: 'Langue, devise, thème',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell size={16} />,
    description: 'Alertes et messages',
  },
  {
    id: 'data',
    label: 'Données',
    icon: <Database size={16} />,
    description: 'Export, cache, suppression',
  },
]

const DEFAULT_PREFERENCES: Preferences = {
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
  notif_security: true,
  sound: true,
  reduced_motion: false,
  auto_refresh: true,
  marketing_consent: false,
  profile_visibility: 'private',
}

const EMPTY_ADDRESS_FORM: AddressForm = {
  id: null,
  nom: '',
  destinataire: '',
  telephone: '',
  type: 'maison',
  province_id: null,
  ville_id: null,
  commune_id: null,
  quartier: '',
  avenue: '',
  numero: '',
  reference: '',
  is_default: false,
}

const LOCAL_CACHE_KEYS = [
  'profile_page_data',
  'profile_page_v2_no_wallet',
  'profile_preferences',
  'profile_addresses',
  'profile_notifications',
  'profile_sessions',
  'profile_activity',
]

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

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
    const response = await fetch(url, {
      ...options,
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
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

function postJSON(url: string, body: any) {
  return fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchJSON(url: string, body: any) {
  return fetchJSON(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function toArray(res: any): any[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.results)) return res.results
  return []
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

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: 'Vide', color: 'bg-muted' }

  let score = 0
  if (password.length >= 8) score += 25
  if (password.length >= 12) score += 15
  if (/[A-Z]/.test(password)) score += 15
  if (/[a-z]/.test(password)) score += 10
  if (/\d/.test(password)) score += 15
  if (/[^A-Za-z0-9]/.test(password)) score += 20

  score = Math.min(100, score)

  if (score < 30) return { score, label: 'Faible', color: 'bg-red-500' }
  if (score < 60) return { score, label: 'Moyen', color: 'bg-amber-500' }
  if (score < 85) return { score, label: 'Bon', color: 'bg-blue-500' }
  return { score, label: 'Excellent', color: 'bg-green-500' }
}

/* ------------------------------------------------------------------ */
/* Mini composants UI                                                  */
/* ------------------------------------------------------------------ */

const fieldClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const selectClass = fieldClass

function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string
  children: ReactNode
  hint?: string
  required?: boolean
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50',
        checked ? 'bg-gold-500' : 'bg-muted'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
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

function MiniStat({
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
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl',
          sizes[size]
        )}
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
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                 */
/* ------------------------------------------------------------------ */

export function ProfileContent({
  profile,
  setProfile,
  user,
  isOnboarded,
  addresses,
  setAddresses,
  activeTab,
  onTabChange,
  className,
}: ProfileContentProps) {
  const toast = useToast()
  const { rate } = useExchangeRate()

  const [internalTab, setInternalTab] = useState<TabId>('general')
  const currentTab = ((activeTab as TabId) || internalTab) as TabId

  const changeTab = useCallback(
    (tab: TabId) => {
      if (onTabChange) onTabChange(tab)
      if (!activeTab) setInternalTab(tab)
    },
    [activeTab, onTabChange]
  )

  /* ---------------------------------------------------------------- */
  /* Profil général                                                    */
  /* ---------------------------------------------------------------- */

  const [profileForm, setProfileForm] = useState({
    nom: '',
    prenom: '',
    telephone: '',
    email: '',
    bio: '',
    date_naissance: '',
    genre: '',
  })

  const [editingProfile, setEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [copiedValue, setCopiedValue] = useState<string | null>(null)

  /* ---------------------------------------------------------------- */
  /* Sécurité                                                          */
  /* ---------------------------------------------------------------- */

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })
  const [savingPassword, setSavingPassword] = useState(false)

  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [toggling2FA, setToggling2FA] = useState(false)

  const [sessions, setSessions] = useState<SessionDevice[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)

  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  /* ---------------------------------------------------------------- */
  /* Adresses                                                          */
  /* ---------------------------------------------------------------- */

  const addressList = useMemo(() => addresses ?? [], [addresses])

  const [showAddressModal, setShowAddressModal] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [addressForm, setAddressForm] = useState<AddressForm>(EMPTY_ADDRESS_FORM)
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressSearch, setAddressSearch] = useState('')
  const [addressTypeFilter, setAddressTypeFilter] = useState('all')

  /* ---------------------------------------------------------------- */
  /* Préférences                                                       */
  /* ---------------------------------------------------------------- */

  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [preferenceForm, setPreferenceForm] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [loadingPreferences, setLoadingPreferences] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)

  /* ---------------------------------------------------------------- */
  /* Notifications                                                     */
  /* ---------------------------------------------------------------- */

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all')
  const [markingAllRead, setMarkingAllRead] = useState(false)

  /* ---------------------------------------------------------------- */
  /* Données / confidentialité                                         */
  /* ---------------------------------------------------------------- */

  const [exportingData, setExportingData] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteForm, setDeleteForm] = useState({
    password: '',
    confirm: '',
  })
  const [deletingAccount, setDeletingAccount] = useState(false)

  /* ---------------------------------------------------------------- */
  /* Effets                                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const p = profile || {}
    setProfileForm({
      nom: p.nom || '',
      prenom: p.prenom || '',
      telephone: p.telephone || '',
      email: p.email || user?.email || '',
      bio: p.bio || '',
      date_naissance: p.date_naissance || '',
      genre: p.genre || '',
    })
    setTwoFAEnabled(!!p.two_factor_enabled)
  }, [profile, user?.email])

  useEffect(() => {
    setPreferenceForm(preferences)
  }, [preferences])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const theme = preferenceForm.theme

    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
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
  }, [preferenceForm.theme])

  const loadPreferences = useCallback(async () => {
    setLoadingPreferences(true)
    try {
      const res = await fetchJSON('/api/user/preferences')
      const data: any = res?.data || res || {}
      const merged = { ...DEFAULT_PREFERENCES, ...data }
      setPreferences(merged)
      setPreferenceForm(merged)
    } catch {
      setPreferences(DEFAULT_PREFERENCES)
      setPreferenceForm(DEFAULT_PREFERENCES)
    } finally {
      setLoadingPreferences(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadPreferences()
    }
  }, [user, loadPreferences])

  const loadSecurityData = useCallback(async () => {
    if (!user) return

    setSessionsLoading(true)
    setActivityLoading(true)

    const [sessionsRes, activityRes] = await Promise.allSettled([
      fetchJSON('/api/user/sessions'),
      fetchJSON('/api/user/activity?limit=50'),
    ])

    if (sessionsRes.status === 'fulfilled') {
      setSessions(
        toArray(sessionsRes.value).map((s: any) => {
          const ua = String(s.device || s.user_agent || 'Appareil inconnu')
          const isMobile = /mobile|android|iphone|ipad/i.test(ua)
          return {
            id: s.id,
            device: isMobile ? 'Mobile' : 'Ordinateur',
            browser: s.browser || undefined,
            os: s.os || undefined,
            location: s.location || s.ip || '—',
            ip: s.ip,
            last_seen: s.last_seen || s.created_at,
            created_at: s.created_at,
            current: s.current ?? s.is_current ?? false,
            raw: s,
          }
        })
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
          raw: a,
        }))
      )
    }

    setSessionsLoading(false)
    setActivityLoading(false)
  }, [user])

  useEffect(() => {
    if (currentTab === 'security' && user) {
      loadSecurityData()
    }
  }, [currentTab, user, loadSecurityData])

  const loadNotifications = useCallback(async () => {
    if (!user) return

    setNotificationsLoading(true)
    try {
      const res = await fetchJSON('/api/user/notifications?limit=50')
      setNotifications(
        toArray(res).map((n: any) => ({
          id: n.id,
          title: n.title || n.subject || 'Notification',
          message: n.message || n.body || '',
          read: n.read ?? n.lu ?? false,
          type: n.type || 'info',
          created_at: n.created_at || n.date,
          raw: n,
        }))
      )
    } catch {
      setNotifications([])
    } finally {
      setNotificationsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (currentTab === 'notifications' && user) {
      loadNotifications()
    }
  }, [currentTab, user, loadNotifications])

  /* ---------------------------------------------------------------- */
  /* Actions profil                                                    */
  /* ---------------------------------------------------------------- */

  const copyText = useCallback(
    async (text: string, message = 'Copié') => {
      try {
        await navigator.clipboard.writeText(text)
        setCopiedValue(text)
        notify(toast, 'success', message)
        setTimeout(() => setCopiedValue(null), 2000)
      } catch {
        notify(toast, 'error', 'Copie impossible')
      }
    },
    [toast]
  )

  const saveProfile = useCallback(async () => {
    if (!profileForm.nom.trim() || !profileForm.prenom.trim()) {
      notify(toast, 'error', 'Nom et prénom requis')
      return
    }

    if (profileForm.telephone && !PHONE_REGEX.test(profileForm.telephone)) {
      notify(toast, 'error', 'Numéro invalide (format : 08xxxxxxxx)')
      return
    }

    setSavingProfile(true)
    try {
      const res = await patchJSON('/api/user/profile', profileForm)
      const updated: any = res?.data || res || {}
      setProfile({ ...(profile || {}), ...updated })
      setEditingProfile(false)
      notify(toast, 'success', 'Profil mis à jour')
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur lors de la mise à jour')
    } finally {
      setSavingProfile(false)
    }
  }, [profile, profileForm, setProfile, toast])

  /* ---------------------------------------------------------------- */
  Actions sécurité
  /* ---------------------------------------------------------------- */

  const changePassword = useCallback(async () => {
    if (!passwordForm.currentPassword) {
      notify(toast, 'error', 'Mot de passe actuel requis')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      notify(toast, 'error', 'Le nouveau mot de passe doit contenir au moins 8 caractères')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      notify(toast, 'error', 'Les mots de passe ne correspondent pas')
      return
    }

    setSavingPassword(true)
    try {
      try {
        await postJSON('/api/user/password', passwordForm)
      } catch {
        await postJSON('/api/user/change-password', passwordForm)
      }

      notify(toast, 'success', 'Mot de passe modifié')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setShowPasswordForm(false)
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur lors du changement de mot de passe')
    } finally {
      setSavingPassword(false)
    }
  }, [passwordForm, toast])

  const toggle2FA = useCallback(async () => {
    setToggling2FA(true)
    const enable = !twoFAEnabled

    try {
      const endpoints = enable
        ? ['/api/user/2fa/enable', '/api/user/two-factor/enable']
        : ['/api/user/2fa/disable', '/api/user/two-factor/disable']

      let success = false

      for (const url of endpoints) {
        try {
          await postJSON(url, {})
          success = true
          break
        } catch {
          // essaye le suivant
        }
      }

      if (!success) {
        await patchJSON('/api/user/profile', { two_factor_enabled: enable })
      }

      setTwoFAEnabled(enable)
      setProfile({ ...(profile || {}), two_factor_enabled: enable })
      notify(toast, 'success', enable ? '2FA activée' : '2FA désactivée')
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur 2FA')
    } finally {
      setToggling2FA(false)
    }
  }, [profile, setProfile, toast, twoFAEnabled])

  const revokeSession = useCallback(
    async (id: string) => {
      setRevokingSessionId(id)
      try {
        await fetchJSON(`/api/user/sessions/${id}`, { method: 'DELETE' })
        setSessions((prev) => prev.filter((s) => s.id !== id))
        notify(toast, 'success', 'Session révoquée')
      } catch (err: any) {
        notify(toast, 'error', err?.message || 'Erreur révocation session')
      } finally {
        setRevokingSessionId(null)
      }
    },
    [toast]
  )

  /* ---------------------------------------------------------------- */
  /* Actions préférences                                               */
  /* ---------------------------------------------------------------- */

  const persistPreferences = useCallback(
    async (payload: Preferences): Promise<boolean> => {
      try {
        const res = await patchJSON('/api/user/preferences', payload)
        const saved: any = res?.data || res || {}
        const merged = { ...DEFAULT_PREFERENCES, ...payload, ...saved }
        setPreferences(merged)
        setPreferenceForm(merged)
        return true
      } catch {
        try {
          await patchJSON('/api/user/profile', { preferences: payload })
          const merged = { ...DEFAULT_PREFERENCES, ...payload }
          setPreferences(merged)
          setPreferenceForm(merged)
          return true
        } catch {
          return false
        }
      }
    },
    []
  )

  const savePreferences = useCallback(async () => {
    setSavingPreferences(true)
    const ok = await persistPreferences(preferenceForm)
    setSavingPreferences(false)

    if (ok) {
      notify(toast, 'success', 'Préférences enregistrées')
    } else {
      notify(toast, 'error', 'Impossible denregistrer les préférences')
    }
  }, [persistPreferences, preferenceForm, toast])

  const updatePreference = useCallback(
    async (key: keyof Preferences, value: any) => {
      const next = { ...preferenceForm, [key]: value }
      setPreferenceForm(next)
      const ok = await persistPreferences(next)
      if (!ok) {
        notify(toast, 'error', 'Impossible de mettre à jour cette préférence')
      }
    },
    [persistPreferences, preferenceForm, toast]
  )

  /* ---------------------------------------------------------------- */
  /* Actions adresses                                                  */
  /* ---------------------------------------------------------------- */

  const openAddAddress = useCallback(() => {
    setEditingAddress(null)
    setAddressForm({
      ...EMPTY_ADDRESS_FORM,
      is_default: addressList.length === 0,
      destinataire: `${profile?.prenom || ''} ${profile?.nom || ''}`.trim(),
      telephone: profile?.telephone || user?.telephone || '',
    })
    setShowAddressModal(true)
  }, [addressList.length, profile, user?.telephone])

  const openEditAddress = useCallback((addr: Address) => {
    setEditingAddress(addr)
    setAddressForm({
      id: addr.id,
      nom: addr.nom || '',
      destinataire: addr.destinataire || '',
      telephone: addr.telephone || '',
      type: addr.type || 'maison',
      province_id: addr.province_id ?? null,
      ville_id: addr.ville_id ?? null,
      commune_id: addr.commune_id ?? null,
      quartier: addr.quartier || '',
      avenue: addr.avenue || '',
      numero: addr.numero || '',
      reference: addr.reference || '',
      is_default: !!addr.is_default,
    })
    setShowAddressModal(true)
  }, [])

  const saveAddress = useCallback(async () => {
    if (!addressForm.nom.trim()) {
      notify(toast, 'error', 'Le nom de ladresse est requis')
      return
    }

    if (addressForm.telephone && !PHONE_REGEX.test(addressForm.telephone)) {
      notify(toast, 'error', 'Numéro invalide (format : 08xxxxxxxx)')
      return
    }

    if (!addressForm.commune_id) {
      notify(toast, 'error', 'Veuillez sélectionner une commune')
      return
    }

    if (!addressForm.quartier.trim() || !addressForm.avenue.trim() || !addressForm.numero.trim()) {
      notify(toast, 'error', 'Quartier, avenue et numéro sont requis')
      return
    }

    setSavingAddress(true)

    try {
      const payload: any = { ...addressForm }
      delete payload.id

      let saved: any

      if (addressForm.id) {
        try {
          const res = await patchJSON(`/api/user/addresses/${addressForm.id}`, payload)
          saved = res?.data || res
        } catch {
          const res = await patchJSON('/api/user/addresses', {
            id: addressForm.id,
            ...payload,
          })
          saved = res?.data || res
        }

        setAddresses(
          addressList.map((a) =>
            a.id === addressForm.id
              ? { ...a, ...saved }
              : saved?.is_default
              ? { ...a, is_default: false }
              : a
          )
        )
      } else {
        const res = await postJSON('/api/user/addresses', payload)
        saved = res?.data || res

        setAddresses(
          saved?.is_default
            ? [...addressList.map((a) => ({ ...a, is_default: false })), saved]
            : [...addressList, saved]
        )
      }

      notify(toast, 'success', addressForm.id ? 'Adresse mise à jour' : 'Adresse ajoutée')
      setShowAddressModal(false)
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur lors de lenregistrement de ladresse')
    } finally {
      setSavingAddress(false)
    }
  }, [addressForm, addressList, setAddresses, toast])

  const deleteAddress = useCallback(
    async (id: string) => {
      try {
        await fetchJSON(`/api/user/addresses/${id}`, { method: 'DELETE' })
        setAddresses(addressList.filter((a) => a.id !== id))
        notify(toast, 'success', 'Adresse supprimée')
      } catch (err: any) {
        notify(toast, 'error', err?.message || 'Erreur suppression adresse')
      }
    },
    [addressList, setAddresses, toast]
  )

  const setDefaultAddress = useCallback(
    async (id: string) => {
      try {
        try {
          await postJSON(`/api/user/addresses/${id}/default`, {})
        } catch {
          try {
            await patchJSON(`/api/user/addresses/${id}`, { is_default: true })
          } catch {
            await patchJSON('/api/user/addresses', { id, is_default: true })
          }
        }

        setAddresses(addressList.map((a) => ({ ...a, is_default: a.id === id })))
        notify(toast, 'success', 'Adresse par défaut définie')
      } catch (err: any) {
        notify(toast, 'error', err?.message || 'Erreur adresse par défaut')
      }
    },
    [addressList, setAddresses, toast]
  )

  /* ---------------------------------------------------------------- */
  /* Actions notifications                                             */
  /* ---------------------------------------------------------------- */

  const markNotificationRead = useCallback(
    async (id: string) => {
      try {
        try {
          await patchJSON(`/api/user/notifications/${id}`, { read: true })
        } catch {
          await postJSON(`/api/user/notifications/${id}/read`, {})
        }

        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        )
      } catch (err: any) {
        notify(toast, 'error', err?.message || 'Erreur notification')
      }
    },
    [toast]
  )

  const markAllNotificationsRead = useCallback(async () => {
    setMarkingAllRead(true)
    try {
      try {
        await postJSON('/api/user/notifications/read-all', {})
      } catch {
        await patchJSON('/api/user/notifications', { read_all: true })
      }

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      notify(toast, 'success', 'Toutes les notifications ont été lues')
    } catch {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      notify(toast, 'info', 'Marquées comme lues localement')
    } finally {
      setMarkingAllRead(false)
    }
  }, [toast])

  /* ---------------------------------------------------------------- */
  /* Actions données                                                   */
  /* ---------------------------------------------------------------- */

  const exportData = useCallback(async () => {
    setExportingData(true)
    try {
      let payload: any

      try {
        const res = await fetchJSON('/api/user/export-data')
        payload = res?.data || res
      } catch {
        payload = {
          profile,
          addresses: addressList,
          preferences,
          notifications,
          sessions,
          activity,
          exported_at: new Date().toISOString(),
        }
      }

      downloadBlob(
        JSON.stringify(payload, null, 2),
        `mon-compte-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json'
      )
      notify(toast, 'success', 'Export téléchargé')
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur export')
    } finally {
      setExportingData(false)
    }
  }, [activity, addressList, notifications, preferences, profile, sessions, toast])

  const clearCache = useCallback(() => {
    LOCAL_CACHE_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key)
      } catch {
        // silencieux
      }
    })

    notify(toast, 'success', 'Cache local vidé')
  }, [toast])

  const deleteAccount = useCallback(async () => {
    if (deleteForm.confirm !== 'SUPPRIMER') {
      notify(toast, 'error', 'Tapez SUPPRIMER pour confirmer')
      return
    }

    if (!deleteForm.password) {
      notify(toast, 'error', 'Mot de passe requis')
      return
    }

    setDeletingAccount(true)

    try {
      try {
        await postJSON('/api/user/account/delete', {
          password: deleteForm.password,
          confirm: deleteForm.confirm,
        })
      } catch {
        await postJSON('/api/user/delete-account', {
          password: deleteForm.password,
          confirm: deleteForm.confirm,
        })
      }

      try {
        await postJSON('/api/auth/logout', {})
      } catch {
        // silencieux
      }

      clearCache()
      notify(toast, 'success', 'Compte supprimé')
      window.location.assign('/')
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur suppression du compte')
    } finally {
      setDeletingAccount(false)
    }
  }, [clearCache, deleteForm, toast])

  /* ---------------------------------------------------------------- */
  /* Données dérivées                                                  */
  /* ---------------------------------------------------------------- */

  const profileCompleteness = useMemo(() => {
    const fields = [
      profileForm.prenom,
      profileForm.nom,
      profileForm.email,
      profileForm.telephone,
      profileForm.bio,
      profileForm.date_naissance,
      profileForm.genre,
      profile?.avatar_url,
    ]

    const filled = fields.filter((f) => String(f || '').trim().length > 0).length
    return Math.round((filled / fields.length) * 100)
  }, [profile?.avatar_url, profileForm])

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  )

  const filteredAddresses = useMemo(() => {
    return addressList.filter((a) => {
      const matchesSearch =
        !addressSearch ||
        `${a.nom || ''} ${a.quartier || ''} ${a.avenue || ''} ${a.reference || ''}`
          .toLowerCase()
          .includes(addressSearch.toLowerCase())

      const matchesType =
        addressTypeFilter === 'all' || (a.type || 'maison') === addressTypeFilter

      return matchesSearch && matchesType
    })
  }, [addressList, addressSearch, addressTypeFilter])

  const filteredNotifications = useMemo(() => {
    if (notificationFilter === 'unread') {
      return notifications.filter((n) => !n.read)
    }
    return notifications
  }, [notificationFilter, notifications])

  const passwordStrength = useMemo(
    () => getPasswordStrength(passwordForm.newPassword),
    [passwordForm.newPassword]
  )

  const LocationSelectorAny = LocationSelector as any

  /* ---------------------------------------------------------------- */
  /* Rendus de sections                                                */
  /* ---------------------------------------------------------------- */

  const renderGeneral = () => (
    <div className="space-y-6">
      <Card variant="glass" className="border-gold-400/20">
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
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

              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-foreground">
                  {profile?.prenom || profile?.nom || 'Mon compte'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {profile?.email || user?.email || '—'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant={profile?.email_confirmed_at || user?.emailConfirmed ? 'accent' : 'warm'} size="sm">
                    {profile?.email_confirmed_at || user?.emailConfirmed ? (
                      <>
                        <BadgeCheck size={12} className="mr-1" />
                        Vérifié
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={12} className="mr-1" />
                        Non vérifié
                      </>
                    )}
                  </Badge>

                  {isOnboarded && (
                    <Badge variant="gold" size="sm">
                      Onboarding terminé
                    </Badge>
                  )}

                  <Badge variant="neutral" size="sm">
                    {preferences.language.toUpperCase()}
                  </Badge>

                  <Badge variant="neutral" size="sm">
                    {preferences.currency_display}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="luxe"
                size="sm"
                leftIcon={<Edit size={14} />}
                onClick={() => setEditingProfile((v) => !v)}
              >
                {editingProfile ? 'Fermer' : 'Modifier'}
              </Button>

              <Button
                variant="outline-gold"
                size="sm"
                leftIcon={<Key size={14} />}
                onClick={() => changeTab('security')}
              >
                Sécurité
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
        <MiniStat
          icon={<CheckCircle2 size={20} />}
          label="Complétude du profil"
          value={`${profileCompleteness}%`}
          sub={profileCompleteness >= 80 ? 'Excellent' : profileCompleteness >= 50 ? 'À améliorer' : 'Complétez votre profil'}
        />
        <MiniStat
          icon={<MapPin size={20} />}
          label="Adresses"
          value={addressList.length}
          sub={addressList.find((a) => a.is_default)?.nom || 'Aucune par défaut'}
        />
        <MiniStat
          icon={<Bell size={20} />}
          label="Notifications"
          value={unreadNotifications}
          sub="non lues"
        />
        <MiniStat
          icon={<ShieldCheck size={20} />}
          label="Sécurité"
          value={twoFAEnabled ? '2FA activée' : '2FA désactivée'}
          sub={sessions.length > 0 ? `${sessions.length} session(s)` : 'Aucune session détectée'}
        />
      </div>

      {editingProfile && (
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User size={18} className="text-gold-500" />
              Informations personnelles
            </CardTitle>
            <CardDescription>
              Mettez à jour vos informations personnelles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Prénom" required>
                <input
                  value={profileForm.prenom}
                  onChange={(e) => setProfileForm((p) => ({ ...p, prenom: e.target.value }))}
                  className={fieldClass}
                  placeholder="Votre prénom"
                />
              </Field>

              <Field label="Nom" required>
                <input
                  value={profileForm.nom}
                  onChange={(e) => setProfileForm((p) => ({ ...p, nom: e.target.value }))}
                  className={fieldClass}
                  placeholder="Votre nom"
                />
              </Field>

              <Field label="Email" hint="Modifiable selon la politique du site.">
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                  className={fieldClass}
                  placeholder="exemple@mail.com"
                />
              </Field>

              <Field label="Téléphone">
                <input
                  value={profileForm.telephone}
                  onChange={(e) => setProfileForm((p) => ({ ...p, telephone: e.target.value }))}
                  className={fieldClass}
                  placeholder="08xxxxxxxx"
                />
              </Field>

              <Field label="Date de naissance">
                <input
                  type="date"
                  value={profileForm.date_naissance}
                  onChange={(e) =>
                    setProfileForm((p) => ({ ...p, date_naissance: e.target.value }))
                  }
                  className={fieldClass}
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
            </div>

            <Field label="Bio">
              <textarea
                value={profileForm.bio}
                onChange={(e) => setProfileForm((p) => ({ ...p, bio: e.target.value }))}
                rows={4}
                className={fieldClass}
                placeholder="Parlez-nous un peu de vous..."
              />
            </Field>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="luxe"
                disabled={savingProfile}
                onClick={saveProfile}
                leftIcon={
                  savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />
                }
              >
                Enregistrer
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setEditingProfile(false)
                  setProfileForm({
                    nom: profile?.nom || '',
                    prenom: profile?.prenom || '',
                    telephone: profile?.telephone || '',
                    email: profile?.email || user?.email || '',
                    bio: profile?.bio || '',
                    date_naissance: profile?.date_naissance || '',
                    genre: profile?.genre || '',
                  })
                }}
                leftIcon={<RotateCcw size={14} />}
              >
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info size={18} className="text-gold-500" />
            Résumé du compte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Identifiant</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="truncate font-mono text-sm text-foreground">{user?.id || '—'}</p>
                {user?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyText(user.id, 'ID copié')}
                    leftIcon={copiedValue === user.id ? <Check size={14} /> : <Copy size={14} />}
                  >
                    {copiedValue === user.id ? 'Copié' : 'Copier'}
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Téléphone</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {profile?.telephone || 'Non renseigné'}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {profile?.email || user?.email || '—'}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Devise principale</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {preferences.currency_display}
                {preferences.currency_display === 'USD' && rate
                  ? ` • 1 USD ≈ ${Math.round(rate).toLocaleString('fr-FR')} FC`
                  : ''}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap size={18} className="text-gold-500" />
            Actions rapides
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button
              variant="outline"
              onClick={() => changeTab('security')}
              leftIcon={<ShieldCheck size={14} />}
            >
              Sécurité
            </Button>
            <Button
              variant="outline"
              onClick={openAddAddress}
              leftIcon={<Plus size={14} />}
            >
              Ajouter adresse
            </Button>
            <Button
              variant="outline"
              onClick={() => changeTab('preferences')}
              leftIcon={<Settings size={14} />}
            >
              Préférences
            </Button>
            <Button
              variant="outline"
              onClick={() => changeTab('notifications')}
              leftIcon={<Bell size={14} />}
            >
              Notifications
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderSecurity = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Sécurité"
        description="Protégez votre compte sans question secrète"
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock size={18} className="text-gold-500" />
              Mot de passe
            </CardTitle>
            <CardDescription>
              Modifiez votre mot de passe régulièrement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!showPasswordForm ? (
              <Button
                variant="outline-gold"
                onClick={() => setShowPasswordForm(true)}
                leftIcon={<Key size={14} />}
              >
                Changer le mot de passe
              </Button>
            ) : (
              <div className="space-y-4">
                <Field label="Mot de passe actuel" required>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))
                      }
                      className={cn(fieldClass, 'pr-10')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords((p) => ({ ...p, current: !p.current }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Afficher le mot de passe actuel"
                    >
                      {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                <Field label="Nouveau mot de passe" required>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))
                      }
                      className={cn(fieldClass, 'pr-10')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords((p) => ({ ...p, new: !p.new }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Afficher le nouveau mot de passe"
                    >
                      {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Force</span>
                    <span className="font-medium text-foreground">{passwordStrength.label}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full transition-all', passwordStrength.color)}
                      style={{ width: `${passwordStrength.score}%` }}
                    />
                  </div>
                </div>

                <Field label="Confirmer le mot de passe" required>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))
                      }
                      className={cn(fieldClass, 'pr-10')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords((p) => ({ ...p, confirm: !p.confirm }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Afficher la confirmation"
                    >
                      {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="luxe"
                    disabled={savingPassword}
                    onClick={changePassword}
                    leftIcon={
                      savingPassword ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />
                    }
                  >
                    Valider
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPasswordForm(false)
                      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                    }}
                    leftIcon={<X size={14} />}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-gold-500" />
              Authentification à deux facteurs
            </CardTitle>
            <CardDescription>
              Ajoutez une couche de sécurité supplémentaire.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div>
                <p className="text-sm font-medium text-foreground">2FA</p>
                <p className="text-xs text-muted-foreground">
                  {twoFAEnabled ? 'Activée' : 'Désactivée'}
                </p>
              </div>
              <Switch
                checked={twoFAEnabled}
                onChange={toggle2FA}
                disabled={toggling2FA}
                label="Activer ou désactiver la 2FA"
              />
            </div>

            {toggling2FA && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Mise à jour en cours...
              </p>
            )}

            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Alertes de connexion</p>
                <p className="text-xs text-muted-foreground">
                  Recevoir une notification lors dune nouvelle connexion.
                </p>
              </div>
              <Switch
                checked={preferenceForm.notif_security}
                onChange={(v) => updatePreference('notif_security', v)}
                label="Alertes de connexion"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone size={18} className="text-gold-500" />
            Sessions actives
          </CardTitle>
          <CardDescription>Appareils connectés à votre compte</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSecurityData}
              disabled={sessionsLoading}
              leftIcon={
                sessionsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />
              }
            >
              Actualiser
            </Button>
          </div>

          {sessionsLoading && sessions.length === 0 ? (
            <LoadingRows count={2} />
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune session détectée.</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-lg bg-muted p-2 text-gold-500">
                    {s.device === 'Mobile' ? <Smartphone size={16} /> : <Monitor size={16} />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{s.device}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.location || '—'} • {relativeTime(s.last_seen || s.created_at)}
                    </p>
                  </div>
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

      <Card variant="glass" className="border-gold-400/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock size={18} className="text-gold-500" />
            Journal dactivité
          </CardTitle>
          <CardDescription>Dernières actions sur votre compte</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activityLoading && activity.length === 0 ? (
            <LoadingRows count={3} />
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune activité récente.</p>
          ) : (
            activity.slice(0, 10).map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="rounded-lg bg-muted p-2 text-gold-500">
                  <FileText size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{a.action}</p>
                  {a.description && (
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                  )}
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

  const renderAddresses = () => (
    <div className="space-y-5">
      <SectionHeader title="Mes adresses" description="Points de livraison et de retrait">
        <Button variant="luxe" size="sm" leftIcon={<Plus size={14} />} onClick={openAddAddress}>
          Ajouter
        </Button>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={addressSearch}
            onChange={(e) => setAddressSearch(e.target.value)}
            placeholder="Rechercher..."
            className={cn(fieldClass, 'pl-9')}
          />
        </div>

        <select
          value={addressTypeFilter}
          onChange={(e) => setAddressTypeFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">Tous types</option>
          <option value="maison">Maison</option>
          <option value="bureau">Bureau</option>
          <option value="point_retrait">Point de retrait</option>
          <option value="autre">Autre</option>
        </select>
      </SectionHeader>

      {filteredAddresses.length === 0 ? (
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
                      {addr.destinataire || `${profile?.prenom || ''} ${profile?.nom || ''}`.trim()} •{' '}
                      {addr.telephone || profile?.telephone || '—'}
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {[addr.quartier, addr.avenue, addr.numero, addr.reference]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditAddress(addr)}
                      aria-label="Modifier"
                    >
                      <Edit size={14} />
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

      <Dialog
        open={showAddressModal}
        onClose={() => setShowAddressModal(false)}
        title={editingAddress ? "Modifier l'adresse" : 'Ajouter une adresse'}
        description="Informations de livraison ou de retrait"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddressModal(false)}>
              Annuler
            </Button>
            <Button
              variant="luxe"
              disabled={savingAddress}
              onClick={saveAddress}
              leftIcon={
                savingAddress ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />
              }
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nom de l'adresse" required>
            <input
              value={addressForm.nom}
              onChange={(e) => setAddressForm((p) => ({ ...p, nom: e.target.value }))}
              className={fieldClass}
              placeholder="Ex : Domicile, Bureau"
            />
          </Field>

          <Field label="Destinataire">
            <input
              value={addressForm.destinataire}
              onChange={(e) => setAddressForm((p) => ({ ...p, destinataire: e.target.value }))}
              className={fieldClass}
            />
          </Field>

          <Field label="Téléphone">
            <input
              value={addressForm.telephone}
              onChange={(e) => setAddressForm((p) => ({ ...p, telephone: e.target.value }))}
              className={fieldClass}
              placeholder="08xxxxxxxx"
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

          <div className="md:col-span-2">
            <Field label="Localisation" required hint="Province, ville et commune.">
              <LocationSelectorAny
                value={{
                  province_id: addressForm.province_id,
                  ville_id: addressForm.ville_id,
                  commune_id: addressForm.commune_id,
                }}
                onChange={(data: any) =>
                  setAddressForm((p) => ({
                    ...p,
                    province_id: data?.province_id ?? p.province_id,
                    ville_id: data?.ville_id ?? p.ville_id,
                    commune_id: data?.commune_id ?? p.commune_id,
                  }))
                }
              />
            </Field>
          </div>

          <Field label="Quartier" required>
            <input
              value={addressForm.quartier}
              onChange={(e) => setAddressForm((p) => ({ ...p, quartier: e.target.value }))}
              className={fieldClass}
            />
          </Field>

          <Field label="Avenue" required>
            <input
              value={addressForm.avenue}
              onChange={(e) => setAddressForm((p) => ({ ...p, avenue: e.target.value }))}
              className={fieldClass}
            />
          </Field>

          <Field label="Numéro" required>
            <input
              value={addressForm.numero}
              onChange={(e) => setAddressForm((p) => ({ ...p, numero: e.target.value }))}
              className={fieldClass}
            />
          </Field>

          <Field label="Point de repère">
            <input
              value={addressForm.reference}
              onChange={(e) => setAddressForm((p) => ({ ...p, reference: e.target.value }))}
              className={fieldClass}
              placeholder="Ex : à côté de l'école"
            />
          </Field>

          <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Adresse par défaut</p>
              <p className="text-xs text-muted-foreground">Utilisée automatiquement au checkout</p>
            </div>
            <Switch
              checked={addressForm.is_default}
              onChange={(v) => setAddressForm((p) => ({ ...p, is_default: v }))}
              label="Adresse par défaut"
            />
          </div>
        </div>
      </Dialog>
    </div>
  )

  const renderPreferences = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Préférences"
        description="Personnalisez votre expérience"
      >
        <Button
          variant="luxe"
          size="sm"
          disabled={savingPreferences}
          onClick={savePreferences}
          leftIcon={
            savingPreferences ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />
          }
        >
          Enregistrer
        </Button>
      </SectionHeader>

      {loadingPreferences ? (
        <LoadingRows count={2} />
      ) : (
        <>
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

              <Field label="Devise principale" hint="Le dollar est la référence principale.">
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
                  className={fieldClass}
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

              <Field label="Taux USD/CDF" hint="Utilisé pour afficher le franc congolais en secondaire.">
                <div className={cn(fieldClass, 'flex items-center gap-2 bg-muted/40')}>
                  <DollarSign size={14} className="text-gold-500" />
                  <span>
                    {rate ? `1 USD ≈ ${Math.round(rate).toLocaleString('fr-FR')} FC` : 'Chargement...'}
                  </span>
                </div>
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
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border p-3 text-sm transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                      preferenceForm.theme === opt.value
                        ? 'border-gold-400 bg-gold-500/10 text-gold-600'
                        : 'border-border bg-card text-muted-foreground hover:border-gold-400/50'
                    )}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>

              {[
                { key: 'sound', label: 'Son', description: 'Activer les sons dinterface' },
                { key: 'reduced_motion', label: 'Mouvement réduit', description: 'Limiter les animations' },
                { key: 'auto_refresh', label: 'Actualisation automatique', description: 'Rafraîchir les données en arrière-plan' },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch
                    checked={Boolean((preferenceForm as any)[item.key])}
                    onChange={(v) => setPreferenceForm((p) => ({ ...p, [item.key]: v }))}
                    label={item.label}
                  />
                </div>
              ))}
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
                { key: 'notif_whatsapp', label: 'WhatsApp', icon: <Phone size={14} /> },
                { key: 'notif_orders', label: 'Commandes', icon: <FileText size={14} /> },
                { key: 'notif_promos', label: 'Promotions', icon: <Zap size={14} /> },
                { key: 'notif_security', label: 'Sécurité', icon: <ShieldAlert size={14} /> },
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
                    label={item.label}
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
                  label="Consentement marketing"
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )

  const renderNotifications = () => (
    <div className="space-y-5">
      <SectionHeader title="Notifications" description="Alertes commandes, sécurité et promotions">
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
          leftIcon={
            markingAllRead ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />
          }
        >
          Tout lire
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={loadNotifications}
          disabled={notificationsLoading}
          leftIcon={
            notificationsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />
          }
        >
          Actualiser
        </Button>
      </SectionHeader>

      {notificationsLoading && notifications.length === 0 ? (
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
              className={cn(
                'border',
                n.read ? 'border-border' : 'border-gold-400/30 bg-gold-500/5'
              )}
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

  const renderData = () => (
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
              Téléchargez une copie de vos informations personnelles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Profil, adresses, préférences, notifications, sessions et activité si disponibles.
            </p>
            <Button
              variant="outline-gold"
              disabled={exportingData}
              onClick={exportData}
              leftIcon={
                exportingData ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />
              }
            >
              Lancer lexport
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
              Supprimez les données temporairement stockées sur cet appareil.
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
            onClick={() => setShowDeleteDialog(true)}
            leftIcon={<Trash2 size={14} />}
          >
            Supprimer définitivement
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Supprimer le compte"
        description="Cette action est définitive"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Annuler
            </Button>
            <Button
              variant="outline"
              className="border-red-500/40 text-red-500 hover:bg-red-500/10"
              disabled={deletingAccount}
              onClick={deleteAccount}
              leftIcon={
                deletingAccount ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />
              }
            >
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
            Toutes vos données seront effacées : profil, adresses, préférences, notifications et historique.
          </div>

          <Field label="Mot de passe" required>
            <input
              type="password"
              value={deleteForm.password}
              onChange={(e) => setDeleteForm((p) => ({ ...p, password: e.target.value }))}
              className={fieldClass}
            />
          </Field>

          <Field label='Tapez "SUPPRIMER" pour confirmer' required>
            <input
              value={deleteForm.confirm}
              onChange={(e) => setDeleteForm((p) => ({ ...p, confirm: e.target.value }))}
              className={fieldClass}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  )

  /* ---------------------------------------------------------------- */
  /* Rendu principal                                                   */
  /* ---------------------------------------------------------------- */

  if (!user) return null

  return (
    <div className={cn('space-y-6 animate-fade-in', className)}>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => changeTab(tab.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500',
              currentTab === tab.id
                ? 'border-gold-400/40 bg-gold-500/10 text-gold-600'
                : 'border-border bg-card text-muted-foreground hover:border-gold-400/30 hover:text-foreground'
            )}
            aria-current={currentTab === tab.id ? 'page' : undefined}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.id === 'notifications' && unreadNotifications > 0 && (
              <Badge variant="danger" size="sm">
                {unreadNotifications}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {currentTab === 'general' && renderGeneral()}
      {currentTab === 'security' && renderSecurity()}
      {currentTab === 'addresses' && renderAddresses()}
      {currentTab === 'preferences' && renderPreferences()}
      {currentTab === 'notifications' && renderNotifications()}
      {currentTab === 'data' && renderData()}

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fadeIn 0.35s ease-out;
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}

export default ProfileContent