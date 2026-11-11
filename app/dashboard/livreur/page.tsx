// app/dashboard/livreur/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import Link from 'next/link'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'

import { cn } from '@/lib/utils'

import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle,
  Clock,
  History,
  MapPin,
  Package,
  RefreshCw,
  Settings,
  ShieldCheck,
  Star,
  Truck,
  User,
  WifiOff,
  XCircle,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface LivreurProfile {
  id: string
  nom: string
  prenom: string
  email: string
  telephone: string | null
  photo_url: string | null
  est_actif: boolean
  est_disponible: boolean
  zone_operation_principale: string | null
  moto_modele: string | null
  moto_plaque: string | null
  total_livraisons: number
  evaluation_moyenne: number
  distance_parcourue_km: number
  derniere_activite: string | null
}

interface LivreurStats {
  total_livraisons: number
  evaluation_moyenne: number
  total_evaluations: number
  distance_parcourue_km: number
  courses_en_cours: {
    count: number
    details: any[]
  }
  periode: {
    total_livraisons: number
  }
}

interface LivraisonRapide {
  id: string
  commande_id: string
  numero_commande: string
  statut: string
  commune: string
  adresse: string
  type_livraison: string
  date_acceptation: string | null
  date_livraison: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const AUTO_REFRESH_INTERVAL_MS = 30_000

const STATUS_ALIASES: Record<string, string> = {
  delivered: 'livree',
  completed: 'livree',
  termine: 'livree',
  terminee: 'livree',

  cancelled: 'annulee',
  canceled: 'annulee',
  refusee: 'annulee',
  echouee: 'annulee',
  failed: 'annulee',

  assigned: 'acceptee',
  accepted: 'acceptee',
  acceptee: 'acceptee',

  picked_up: 'colis_recupere',
  recupere: 'colis_recupere',
  collecte: 'colis_recupere',

  in_transit: 'en_route',
  en_cours: 'en_route',
  route: 'en_route',

  pending: 'en_attente',
  en_attente: 'en_attente',
}

const STATUS_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  acceptee: 'Acceptée',
  colis_recupere: 'Colis récupéré',
  en_route: 'En route',
  livree: 'Livrée',
  annulee: 'Annulée',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function notify(
  toast: any,
  type: 'success' | 'error' | 'info' | 'warning',
  message: string
) {
  if (typeof toast?.addToast === 'function') {
    toast.addToast({ type, message })
    return
  }

  if (typeof toast?.show === 'function') {
    toast.show({ type, message })
  }
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'oui', 'yes', 'on', 'actif', 'active', 'disponible'].includes(str)) {
    return true
  }

  if (['false', 'non', 'no', 'off', 'inactif', 'inactive', 'indisponible'].includes(str)) {
    return false
  }

  return fallback
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function getInitials(prenom?: string | null, nom?: string | null): string {
  const first = String(prenom || '').trim().charAt(0)
  const last = String(nom || '').trim().charAt(0)

  return `${first}${last}`.toUpperCase() || 'L'
}

function formatNumber(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('fr-FR')
}

function formatDecimal(
  value: number | null | undefined,
  digits = 1
): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'

  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatDate(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(value)
  }
}

function formatRelative(value?: string | null): string {
  if (!value) return '—'

  try {
    const diff = Date.now() - new Date(value).getTime()
    const minutes = Math.floor(diff / 60_000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return "à l'instant"
    if (minutes < 60) return `il y a ${minutes} min`
    if (hours < 24) return `il y a ${hours} h`
    if (days < 30) return `il y a ${days} j`

    return formatDate(value)
  } catch {
    return '—'
  }
}

function normalizeStatus(value: unknown): string {
  const raw = String(value || 'en_attente')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')

  return STATUS_ALIASES[raw] || raw
}

function statusLabel(value: string): string {
  const normalized = normalizeStatus(value)
  return STATUS_LABELS[normalized] || normalized
}

function statusVariant(
  value: string
): 'accent' | 'danger' | 'warm' | 'neutral' | 'gold' {
  const normalized = normalizeStatus(value)

  if (normalized === 'livree') return 'accent'
  if (normalized === 'annulee') return 'danger'
  if (normalized === 'en_route' || normalized === 'colis_recupere') return 'gold'
  if (normalized === 'acceptee') return 'warm'

  return 'neutral'
}

function deliveryTypeLabel(type: string): string {
  const value = String(type || '').toLowerCase()

  if (
    value.includes('retrait') ||
    value.includes('pickup') ||
    value === 'point_retrait'
  ) {
    return 'Point retrait'
  }

  return 'Domicile'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeProfile(payload: any): LivreurProfile {
  const src = payload?.data ?? payload?.profile ?? payload ?? {}

  return {
    id: String(src.id || src.user_id || ''),
    nom: String(src.nom || src.last_name || '').trim(),
    prenom: String(src.prenom || src.first_name || '').trim(),
    email: String(src.email || '').trim(),
    telephone: textOrNull(src.telephone ?? src.phone),
    photo_url: textOrNull(src.photo_url ?? src.avatar_url),
    est_actif: toBool(src.est_actif ?? src.active ?? src.is_active, true),
    est_disponible: toBool(
      src.est_disponible ?? src.available ?? src.is_online ?? src.disponible,
      false
    ),
    zone_operation_principale: textOrNull(
      src.zone_operation_principale ?? src.zone ?? src.main_zone ?? src.commune
    ),
    moto_modele: textOrNull(
      src.moto_modele ?? src.motorcycle_model ?? src.vehicle_model
    ),
    moto_plaque: textOrNull(src.moto_plaque ?? src.license_plate ?? src.plate),
    total_livraisons: toNum(
      src.total_livraisons ?? src.livraisons ?? src.deliveries ?? src.delivery_count
    ),
    evaluation_moyenne: toNum(
      src.evaluation_moyenne ?? src.note_moyenne ?? src.rating ?? src.average_rating
    ),
    distance_parcourue_km: toNum(
      src.distance_parcourue_km ?? src.distance_km ?? src.km ?? src.distance
    ),
    derniere_activite: textOrNull(
      src.derniere_activite ?? src.last_activity ?? src.last_seen ?? src.updated_at
    ),
  }
}

function normalizeStats(payload: any): LivreurStats {
  const src = payload?.data ?? payload?.stats ?? payload ?? {}

  const coursesSrc =
    src.courses_en_cours ?? src.active_courses ?? src.en_cours ?? {}

  const details = Array.isArray(coursesSrc.details)
    ? coursesSrc.details
    : Array.isArray(coursesSrc.courses)
      ? coursesSrc.courses
      : Array.isArray(coursesSrc)
        ? coursesSrc
        : []

  const count = toNum(
    coursesSrc.count ?? coursesSrc.total ?? details.length,
    details.length
  )

  const periodeSrc = src.periode ?? {}

  return {
    total_livraisons: toNum(
      src.total_livraisons ?? src.livraisons ?? src.deliveries ?? 0
    ),
    evaluation_moyenne: toNum(
      src.evaluation_moyenne ?? src.note_moyenne ?? src.rating ?? 0
    ),
    total_evaluations: toNum(
      src.total_evaluations ?? src.evaluations ?? src.rating_count ?? 0
    ),
    distance_parcourue_km: toNum(
      src.distance_parcourue_km ?? src.distance_km ?? src.km ?? 0
    ),
    courses_en_cours: {
      count,
      details,
    },
    periode: {
      total_livraisons: toNum(
        periodeSrc.total_livraisons ??
          periodeSrc.livraisons ??
          src.livraisons_periode ??
          0
      ),
    },
  }
}

function normalizeLivraisonRapide(raw: any, index = 0): LivraisonRapide {
  const id = String(
    raw?.id || raw?.livraison_id || raw?.commande_id || `livraison-${index}`
  )

  const commandeId = String(
    raw?.commande_id || raw?.order_id || raw?.id || id
  )

  return {
    id,
    commande_id: commandeId,
    numero_commande: String(
      raw?.numero_commande ||
        raw?.order_number ||
        raw?.numero ||
        commandeId.slice(-8)
    ),
    statut: normalizeStatus(raw?.statut || raw?.status),
    commune: textOrNull(raw?.commune || raw?.ville || raw?.zone) || '',
    adresse:
      textOrNull(
        raw?.adresse ||
          raw?.adresse_livraison ||
          raw?.address ||
          raw?.livraison_adresse
      ) || '',
    type_livraison: String(raw?.type_livraison || 'domicile').toLowerCase(),
    date_acceptation: textOrNull(
      raw?.date_acceptation || raw?.accepted_at || raw?.assigned_at
    ),
    date_livraison: textOrNull(
      raw?.date_livraison || raw?.delivered_at || raw?.completed_at
    ),
  }
}

function normalizeHistoryResponse(payload: any): LivraisonRapide[] {
  const arr = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.livraisons)
        ? payload.livraisons
        : Array.isArray(payload?.items)
          ? payload.items
          : []

  return arr.map(normalizeLivraisonRapide)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon: React.ReactNode
  tone?: 'default' | 'gold' | 'accent' | 'warm' | 'danger'
}) {
  return (
    <Card
      className={cn(
        'border-gold-400/20 bg-card/70 shadow-soft transition hover:shadow-gold',
        tone === 'accent' && 'border-emerald-400/20',
        tone === 'warm' && 'border-amber-400/20',
        tone === 'danger' && 'border-red-400/20'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>

            <p className="mt-2 truncate text-2xl font-extrabold text-foreground">
              {value}
            </p>

            {sub && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {sub}
              </p>
            )}
          </div>

          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              tone === 'gold' && 'bg-gold-500/10 text-gold-600 dark:text-gold-400',
              tone === 'accent' &&
                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              tone === 'warm' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
              tone === 'danger' && 'bg-red-500/10 text-red-600 dark:text-red-400',
              tone === 'default' && 'bg-muted text-muted-foreground'
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function QuickActionCard({
  title,
  description,
  href,
  icon,
  variant = 'outline-gold',
}: {
  title: string
  description: string
  href: string
  icon: React.ReactNode
  variant?: 'luxe' | 'outline-gold' | 'ghost'
}) {
  return (
    <Card className="border-gold-400/20 bg-card/70 shadow-soft transition hover:shadow-gold">
      <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-500/10 text-gold-600 dark:text-gold-400">
            {icon}
          </div>

          <h3 className="mt-4 text-base font-bold text-foreground">
            {title}
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        </div>

        <Link href={href}>
          <Button variant={variant} size="sm" rightIcon={<ArrowRight size={14} />}>
            Ouvrir
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function LivreurDashboardPage() {
  const auth = useAuth() as any
  const user = auth?.user
  const authLoading = Boolean(auth?.loading)

  const toast = useToast()
  const queryClient = useQueryClient()
  const prefersReduced = useReducedMotion()

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [online, setOnline] = useState(true)

  /* ---------------------------------------------------------- */
  /* Title                                                       */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Tableau de bord livreur | Gercie'
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Online status                                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof window === 'undefined') return

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

  /* ---------------------------------------------------------- */
  /* Queries                                                     */
  /* ---------------------------------------------------------- */

  const profileQuery = useQuery<LivreurProfile>({
    queryKey: ['livreur-profile', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/livreur/profile', {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || json?.message || 'Impossible de charger le profil.'
        )
      }

      return normalizeProfile(json)
    },
    enabled: Boolean(user && !authLoading),
    staleTime: 30_000,
    retry: 1,
  })

  const statsQuery = useQuery<LivreurStats>({
    queryKey: ['livreur-dashboard-stats', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/livreur/stats?periode=week', {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || json?.message || 'Impossible de charger les statistiques.'
        )
      }

      return normalizeStats(json)
    },
    enabled: Boolean(user && !authLoading),
    staleTime: 30_000,
    retry: 1,
  })

  const historyQuery = useQuery<LivraisonRapide[]>({
    queryKey: ['livreur-dashboard-history', user?.id],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '5',
        page: '1',
        sort_by: 'date',
        sort_order: 'desc',
      })

      const res = await fetch(`/api/livreur/historique?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || json?.message || 'Impossible de charger l’historique.'
        )
      }

      return normalizeHistoryResponse(json)
    },
    enabled: Boolean(user && !authLoading),
    staleTime: 30_000,
    retry: 1,
  })

  /* ---------------------------------------------------------- */
  /* Auto refresh                                                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['livreur-profile'] })
      queryClient.invalidateQueries({ queryKey: ['livreur-dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['livreur-dashboard-history'] })
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [autoRefresh, queryClient])

  /* ---------------------------------------------------------- */
  /* Mutation disponibilité                                      */
  /* ---------------------------------------------------------- */

  const availabilityMutation = useMutation({
    mutationFn: async (est_disponible: boolean) => {
      const res = await fetch('/api/livreur/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ est_disponible }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || json?.message || 'Impossible de mettre à jour la disponibilité.'
        )
      }

      return normalizeProfile(json)
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['livreur-profile', user?.id], data)
      queryClient.invalidateQueries({ queryKey: ['livreur-dashboard-stats'] })

      notify(
        toast,
        'success',
        variables
          ? 'Tu es maintenant disponible.'
          : 'Tu es maintenant indisponible.'
      )
    },
    onError: (err: any) => {
      notify(
        toast,
        'error',
        err?.message || 'Erreur lors de la mise à jour de la disponibilité.'
      )
    },
  })

  /* ---------------------------------------------------------- */
  /* Derived data                                                */
  /* ---------------------------------------------------------- */

  const profile = profileQuery.data
  const stats = statsQuery.data
  const recentDeliveries = historyQuery.data ?? []

  const isFetching =
    profileQuery.isFetching ||
    statsQuery.isFetching ||
    historyQuery.isFetching

  const displayName = useMemo(() => {
    if (profile?.prenom || profile?.nom) {
      return [profile.prenom, profile.nom].filter(Boolean).join(' ')
    }

    return user?.email?.split('@')[0] || 'Livreur'
  }, [profile?.nom, profile?.prenom, user?.email])

  const initials = useMemo(
    () => getInitials(profile?.prenom, profile?.nom),
    [profile?.nom, profile?.prenom]
  )

  const totalLivraisons =
    stats?.total_livraisons ?? profile?.total_livraisons ?? 0

  const evaluationMoyenne =
    stats?.evaluation_moyenne ?? profile?.evaluation_moyenne ?? 0

  const distanceParcourue =
    stats?.distance_parcourue_km ?? profile?.distance_parcourue_km ?? 0

  const coursesEnCoursCount = stats?.courses_en_cours?.count ?? 0

  const activeCourses = useMemo(() => {
    const details = stats?.courses_en_cours?.details ?? []

    return details
      .map((item, index) => normalizeLivraisonRapide(item, index))
      .filter(
        (course) =>
          ['acceptee', 'en_route', 'colis_recupere'].includes(course.statut)
      )
      .slice(0, 3)
  }, [stats?.courses_en_cours?.details])

  const handleToggleAvailability = useCallback(() => {
    if (!profile) return

    if (!profile.est_actif) {
      notify(
        toast,
        'warning',
        'Ton compte est inactif. Contacte l’administration Gercie.'
      )
      return
    }

    availabilityMutation.mutate(!profile.est_disponible)
  }, [availabilityMutation, profile, toast])

  const handleManualRefresh = useCallback(() => {
    profileQuery.refetch()
    statsQuery.refetch()
    historyQuery.refetch()
  }, [historyQuery, profileQuery, statsQuery])

  /* ---------------------------------------------------------- */
  /* Render guards                                               */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="xl" variant="premium" label="Chargement..." />
          <p className="text-sm text-muted-foreground">
            Préparation de ton tableau de bord...
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-midnight-950">
        <Card className="w-full max-w-md border-border bg-card/70">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <User size={40} className="text-muted-foreground" />

            <div>
              <h1 className="text-xl font-bold text-foreground">
                Connexion requise
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tu dois être connecté pour accéder à ton espace livreur.
              </p>
            </div>

            <Link
              href={`/login?redirect=${encodeURIComponent('/dashboard/livreur')}`}
            >
              <Button variant="luxe">Se connecter</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (profileQuery.isLoading && !profile) {
    return (
      <div className="min-h-screen bg-neutral-50 pb-16 dark:bg-midnight-950">
        <div className="sticky top-0 z-20 border-b border-gold-400/20 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-midnight-900/70">
          <Container className="flex items-center gap-4 py-4">
            <div className="h-12 w-12 animate-pulse rounded-2xl bg-muted" />
            <div className="space-y-2">
              <div className="h-6 w-52 animate-pulse rounded bg-muted" />
              <div className="h-4 w-36 animate-pulse rounded bg-muted" />
            </div>
          </Container>
        </div>

        <Container className="relative z-10 py-8">
          <div className="grid gap-6 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="h-72 animate-pulse rounded-3xl bg-muted lg:col-span-2" />
            <div className="h-72 animate-pulse rounded-3xl bg-muted" />
          </div>
        </Container>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Render                                                      */
  /* ---------------------------------------------------------- */

  return (
    <div className="relative min-h-screen bg-neutral-50 pb-16 dark:bg-midnight-950">
      <div className="pattern-dots pointer-events-none absolute inset-0 opacity-5 dark:opacity-10" />

      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-gold-400/20 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-midnight-900/70">
        <Container className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {profile?.photo_url ? (
              <img
                src={profile.photo_url}
                alt=""
                className="h-12 w-12 rounded-2xl border border-gold-400/20 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500/10 text-lg font-bold text-gold-600 dark:text-gold-400">
                {initials}
              </div>
            )}

            <div className="min-w-0">
              <h1 className="truncate font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                Bonjour {displayName}
              </h1>

              <p className="mt-1 flex items-center gap-2 truncate text-sm text-neutral-500 dark:text-neutral-400">
                <MapPin size={14} className="text-gold-500" />
                {profile?.zone_operation_principale || 'Zone non définie'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={profile?.est_actif ? 'gold' : 'danger'}
              size="sm"
            >
              {profile?.est_actif ? 'Compte actif' : 'Compte inactif'}
            </Badge>

            <Badge
              variant={profile?.est_disponible ? 'accent' : 'neutral'}
              size="sm"
            >
              {profile?.est_disponible ? 'Disponible' : 'Indisponible'}
            </Badge>

            <Tooltip
              content={
                autoRefresh
                  ? 'Désactiver l’actualisation automatique'
                  : 'Activer l’actualisation automatique'
              }
            >
              <button
                type="button"
                onClick={() => setAutoRefresh((prev) => !prev)}
                className={cn(
                  'rounded-xl border p-2 transition',
                  autoRefresh
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={autoRefresh}
                aria-label="Actualisation automatique"
              >
                <RefreshCw
                  size={16}
                  className={autoRefresh ? 'animate-spin' : ''}
                />
              </button>
            </Tooltip>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualRefresh}
              loading={isFetching}
              leftIcon={<RefreshCw size={14} />}
            >
              Actualiser
            </Button>

            <Link href="/dashboard/livreur/profile">
              <Button variant="outline-gold" size="sm" leftIcon={<Settings size={14} />}>
                Profil
              </Button>
            </Link>
          </div>
        </Container>
      </div>

      <Container className="relative z-10 py-8">
        {/* Offline banner */}
        <AnimatePresence>
          {!online && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
            >
              <WifiOff size={18} className="shrink-0" />
              <p>
                Vous êtes hors ligne. Certaines données peuvent être obsolètes.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inactive account banner */}
        {profile && !profile.est_actif && (
          <Card className="mb-8 border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20">
            <CardContent className="flex items-start gap-3 p-4 text-sm text-red-800 dark:text-red-300">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p>
                Ton compte livreur est inactif. Tu ne peux pas recevoir de
                nouvelles affectations tant que l’administration n’a pas
                réactivé ton profil.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Availability card */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-8"
        >
          <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold">
            <CardContent className="p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl',
                      profile?.est_disponible
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <ShieldCheck size={28} />
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      Disponibilité
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Active cette option pour recevoir de nouvelles courses.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge
                        variant={profile?.est_disponible ? 'accent' : 'neutral'}
                        size="sm"
                      >
                        {profile?.est_disponible ? 'En ligne' : 'Hors ligne'}
                      </Badge>

                      {profile?.derniere_activite && (
                        <span className="text-xs text-muted-foreground">
                          Dernière activité :{' '}
                          {formatRelative(profile.derniere_activite)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  variant={profile?.est_disponible ? 'danger' : 'luxe'}
                  size="lg"
                  onClick={handleToggleAvailability}
                  loading={availabilityMutation.isPending}
                  disabled={!profile?.est_actif || availabilityMutation.isPending}
                  leftIcon={
                    profile?.est_disponible ? (
                      <XCircle size={18} />
                    ) : (
                      <CheckCircle size={18} />
                    )
                  }
                >
                  {profile?.est_disponible
                    ? 'Me mettre hors ligne'
                    : 'Me mettre en ligne'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Livraisons"
            value={formatNumber(totalLivraisons)}
            sub={
              stats?.periode.total_livraisons
                ? `${formatNumber(stats.periode.total_livraisons)} cette semaine`
                : 'Total cumulé'
            }
            icon={<Package size={20} />}
            tone="gold"
          />

          <StatCard
            label="Évaluation"
            value={`${formatDecimal(evaluationMoyenne, 1)} / 5`}
            sub={
              stats?.total_evaluations
                ? `${formatNumber(stats.total_evaluations)} évaluation(s)`
                : 'Note moyenne'
            }
            icon={<Star size={20} />}
            tone="warm"
          />

          <StatCard
            label="Distance"
            value={`${formatDecimal(distanceParcourue, 0)} km`}
            sub="Distance parcourue"
            icon={<MapPin size={20} />}
            tone="accent"
          />

          <StatCard
            label="En cours"
            value={formatNumber(coursesEnCoursCount)}
            sub="Courses actives"
            icon={<Activity size={20} />}
            tone={coursesEnCoursCount > 0 ? 'danger' : 'default'}
          />
        </div>

        {/* Quick actions */}
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard
            title="Historique"
            description="Consultez vos livraisons passées."
            href="/dashboard/livreur/historique"
            icon={<History size={20} />}
          />

          <QuickActionCard
            title="Statistiques"
            description="Analysez votre performance."
            href="/dashboard/livreur/stats"
            icon={<BarChart3 size={20} />}
          />

          <QuickActionCard
            title="Profil"
            description="Mettez à jour vos informations."
            href="/dashboard/livreur/profile"
            icon={<User size={20} />}
          />

          <QuickActionCard
            title="Courses"
            description="Accédez au détail de vos courses."
            href="/dashboard/livreur/historique"
            icon={<Truck size={20} />}
            variant="luxe"
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Active courses */}
          <div className="lg:col-span-2">
            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity size={18} className="text-gold-500" />
                    Courses en cours
                  </CardTitle>
                  <CardDescription>
                    Affectations actives à traiter.
                  </CardDescription>
                </div>

                <Badge variant="warm" size="sm">
                  {formatNumber(coursesEnCoursCount)} active(s)
                </Badge>
              </CardHeader>

              <CardContent>
                {activeCourses.length > 0 ? (
                  <div className="space-y-3">
                    {activeCourses.map((course) => (
                      <div
                        key={course.id}
                        className="flex flex-col gap-3 rounded-2xl border border-border bg-background/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-semibold text-foreground">
                            #{course.numero_commande}
                          </p>

                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge
                              variant={statusVariant(course.statut)}
                              size="sm"
                            >
                              {statusLabel(course.statut)}
                            </Badge>

                            {course.commune && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin size={12} />
                                {course.commune}
                              </span>
                            )}

                            <span className="text-xs text-muted-foreground">
                              {deliveryTypeLabel(course.type_livraison)}
                            </span>
                          </div>

                          {course.adresse && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {course.adresse}
                            </p>
                          )}
                        </div>

                        <Link
                          href={`/dashboard/livreur/courses/${course.commande_id || course.id}`}
                          className="shrink-0"
                        >
                          <Button
                            variant="outline-gold"
                            size="sm"
                            rightIcon={<ArrowRight size={14} />}
                          >
                            Ouvrir
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-500/10 text-gold-600 dark:text-gold-400">
                      <Truck size={28} />
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Aucune course en cours pour le moment.
                    </p>

                    {profile?.est_disponible ? (
                      <p className="text-xs text-muted-foreground">
                        Reste disponible, une nouvelle affectation arrivera bientôt.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Mets-toi en ligne pour recevoir des courses.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent deliveries */}
          <div>
            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock size={18} className="text-gold-500" />
                  Dernières livraisons
                </CardTitle>
                <CardDescription>
                  Aperçu rapide de ton activité récente.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {historyQuery.isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-20 animate-pulse rounded-2xl bg-muted"
                    />
                  ))
                ) : recentDeliveries.length > 0 ? (
                  recentDeliveries.map((delivery) => (
                    <Link
                      key={delivery.id}
                      href={`/dashboard/livreur/courses/${delivery.commande_id || delivery.id}`}
                      className="block"
                    >
                      <div className="rounded-2xl border border-border bg-background/50 p-3 transition hover:border-gold-400/40">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm font-semibold text-foreground">
                              #{delivery.numero_commande}
                            </p>

                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {delivery.commune || 'Commune inconnue'}
                            </p>
                          </div>

                          <Badge
                            variant={statusVariant(delivery.statut)}
                            size="sm"
                          >
                            {statusLabel(delivery.statut)}
                          </Badge>
                        </div>

                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatRelative(
                            delivery.date_livraison || delivery.date_acceptation
                          )}
                        </p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <Package size={32} className="text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Aucune livraison récente.
                    </p>
                  </div>
                )}

                <Link href="/dashboard/livreur/historique">
                  <Button
                    variant="ghost"
                    size="sm"
                    fullWidth
                    rightIcon={<ArrowRight size={14} />}
                  >
                    Voir tout l’historique
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}