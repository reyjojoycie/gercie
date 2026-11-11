// app/dashboard/livreur/stats/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
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
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'

import { cn } from '@/lib/utils'

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  MapPin,
  Package,
  PieChart as PieChartIcon,
  RefreshCw,
  RotateCw,
  Star,
  Timer,
  TrendingDown,
  TrendingUp,
  WifiOff,
} from 'lucide-react'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Periode = 'day' | 'week' | 'month' | 'year' | 'all'

interface Trend {
  variation_absolue: number
  variation_pourcentage: number
}

interface Comparaison {
  total_livraisons_prec: number
  distance_prec: number
  evaluation_prec: number | null
}

interface ActiveCourse {
  id: string
  commande_id: string
  statut: string
  created_at: string | null
  commune: string | null
  adresse: string | null
}

interface TopCommune {
  nom: string
  count: number
}

interface EvolutionPoint {
  date: string
  livraisons: number
}

interface DistributionItem {
  name: string
  value: number
}

interface MonthlyItem {
  key: string
  label: string
  livraisons: number
}

interface LivreurStats {
  total_livraisons: number
  evaluation_moyenne: number
  total_evaluations: number
  distance_parcourue_km: number
  derniere_activite: string | null
  periode: {
    nom: string
    total_livraisons: number
  }
  courses_en_cours: {
    count: number
    details: ActiveCourse[]
  }
  top_communes: TopCommune[]
  tendance: Trend | null
  comparaison: Comparaison | null
  evolution: EvolutionPoint[]
  repartition_statuts: DistributionItem[]
  repartition_types: DistributionItem[]
  activite_mensuelle: MonthlyItem[]
  generated_at: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PERIODES: { value: Periode; label: string }[] = [
  { value: 'day', label: "Aujourd'hui" },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' },
  { value: 'all', label: 'Tout' },
]

const CHART_COLORS = [
  '#c99a14',
  '#0fa073',
  '#4766f7',
  '#dc3f62',
  '#8b5cf6',
  '#e37d32',
  '#10b981',
  '#6366f1',
  '#f59e0b',
  '#ef4444',
]

const AUTO_REFRESH_INTERVAL_MS = 30_000

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

function getFirstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value
  }

  return undefined
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampNullable(
  value: unknown,
  min: number,
  max: number
): number | null {
  const n = toNullableNumber(value)
  if (n === null) return null
  return clamp(n, min, max)
}

function toArray(payload: any, keys: string[] = []): any[] {
  if (Array.isArray(payload)) return payload

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }

  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.results)) return payload.results

  return []
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

function formatVariation(value: number, pourcentage: number): string {
  const sign = value >= 0 ? '+' : ''
  const abs =
    Math.abs(value) < 10
      ? value.toFixed(1)
      : Math.round(value).toLocaleString('fr-FR')

  return `${sign}${abs} (${pourcentage.toFixed(1)}%)`
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(value)
  }
}

function formatDateShort(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
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

    return formatDateShort(value)
  } catch {
    return '—'
  }
}

function buildTrend(
  current: number,
  previous: number | null | undefined
): Trend | null {
  if (previous === null || previous === undefined) return null

  const variation_absolue = current - previous
  const variation_pourcentage =
    previous > 0
      ? (variation_absolue / previous) * 100
      : variation_absolue > 0
        ? 100
        : 0

  return {
    variation_absolue,
    variation_pourcentage,
  }
}

function courseStatusVariant(
  statut: string
): 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' {
  const s = String(statut || '').toLowerCase()

  if (['livree', 'completed', 'delivered', 'terminée'].includes(s)) {
    return 'accent'
  }

  if (
    [
      'en_route',
      'en_livraison',
      'assigned',
      'in_transit',
      'en cours',
    ].includes(s)
  ) {
    return 'warm'
  }

  if (
    [
      'collecte',
      'picked_up',
      'conditionnement',
      'preparation',
    ].includes(s)
  ) {
    return 'neutral'
  }

  if (['annulee', 'cancelled', 'refusee', 'échouée'].includes(s)) {
    return 'danger'
  }

  return 'gold'
}

function courseStatusLabel(statut: string): string {
  const map: Record<string, string> = {
    en_attente: 'En attente',
    assigned: 'Assignée',
    en_route: 'En route',
    en_livraison: 'En livraison',
    in_transit: 'En transit',
    collecte: 'Collecte',
    picked_up: 'Collectée',
    conditionnement: 'Conditionnement',
    preparation: 'Préparation',
    livree: 'Livrée',
    completed: 'Terminée',
    delivered: 'Livrée',
    annulee: 'Annulée',
    cancelled: 'Annulée',
    refusee: 'Refusée',
  }

  const s = String(statut || '').toLowerCase()
  return map[s] || statut || '—'
}

function downloadCsv(rows: string[][], filename: string) {
  if (typeof window === 'undefined') return

  const escape = (value: string) =>
    `"${String(value || '').replace(/"/g, '""')}"`

  const csv = rows.map((row) => row.map(escape).join(',')).join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeActiveCourse(raw: any, index: number): ActiveCourse {
  const id = String(raw?.id || `course-${index}`)
  const commandeId = String(
    getFirstDefined(raw?.commande_id, raw?.order_id, raw?.id, id)
  )

  return {
    id,
    commande_id: commandeId,
    statut: String(
      getFirstDefined(raw?.statut, raw?.status, 'en_attente')
    ).toLowerCase(),
    created_at: textOrNull(
      getFirstDefined(raw?.created_at, raw?.date, raw?.assigned_at)
    ),
    commune: textOrNull(
      getFirstDefined(raw?.commune, raw?.ville, raw?.zone)
    ),
    adresse: textOrNull(
      getFirstDefined(raw?.adresse, raw?.adresse_livraison, raw?.address)
    ),
  }
}

function normalizeTopCommune(raw: any, index: number): TopCommune {
  return {
    nom: String(
      getFirstDefined(
        raw?.nom,
        raw?.name,
        raw?.commune,
        raw?.zone,
        `Commune ${index + 1}`
      )
    ),
    count: toNumber(
      getFirstDefined(raw?.count, raw?.total, raw?.value, raw?.livraisons, 0)
    ),
  }
}

function normalizeEvolutionPoint(raw: any, index: number): EvolutionPoint {
  return {
    date: String(
      getFirstDefined(
        raw?.date,
        raw?.jour,
        raw?.day,
        raw?.created_at,
        new Date().toISOString()
      )
    ),
    livraisons: toNumber(
      getFirstDefined(raw?.livraisons, raw?.count, raw?.total, raw?.value, 0)
    ),
  }
}

function normalizeDistributionItem(
  raw: any,
  index: number
): DistributionItem {
  return {
    name: String(
      getFirstDefined(
        raw?.name,
        raw?.nom,
        raw?.label,
        raw?.statut,
        raw?.type,
        `Élément ${index + 1}`
      )
    ),
    value: toNumber(
      getFirstDefined(raw?.value, raw?.count, raw?.total, raw?.livraisons, 0)
    ),
  }
}

function normalizeMonthlyItem(raw: any, index: number): MonthlyItem {
  const dateValue = raw?.date ? new Date(String(raw.date)) : null
  const validDate = dateValue && !Number.isNaN(dateValue.getTime()) ? dateValue : null

  const key = String(
    getFirstDefined(
      raw?.key,
      validDate
        ? `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}`
        : `month-${index}`
    )
  )

  const label = String(
    getFirstDefined(
      raw?.label,
      raw?.month,
      raw?.name,
      validDate
        ? validDate.toLocaleDateString('fr-FR', { month: 'short' })
        : `M${index + 1}`
    )
  )

  return {
    key,
    label,
    livraisons: toNumber(
      getFirstDefined(raw?.livraisons, raw?.count, raw?.total, raw?.value, 0)
    ),
  }
}

function normalizeStats(payload: any, periodeValue: Periode): LivreurStats {
  const src = payload?.data ?? payload?.stats ?? payload ?? {}

  const total_livraisons = toNumber(
    getFirstDefined(
      src.total_livraisons,
      src.livraisons,
      src.deliveries,
      src.total_deliveries
    )
  )

  const evaluation_moyenne = clamp(
    toNumber(
      getFirstDefined(
        src.evaluation_moyenne,
        src.rating,
        src.note_moyenne,
        src.average_rating
      )
    ),
    0,
    5
  )

  const total_evaluations = toNumber(
    getFirstDefined(
      src.total_evaluations,
      src.evaluations,
      src.rating_count,
      src.review_count
    )
  )

  const distance_parcourue_km = toNumber(
    getFirstDefined(
      src.distance_parcourue_km,
      src.distance_km,
      src.km,
      src.distance
    )
  )

  const derniere_activite = textOrNull(
    getFirstDefined(
      src.derniere_activite,
      src.last_activity,
      src.last_seen,
      src.updated_at
    )
  )

  const periodeSrc = src.periode ?? {}
  const periodeLabel =
    PERIODES.find((p) => p.value === periodeValue)?.label || periodeValue

  const periodeTotal = toNumber(
    getFirstDefined(
      periodeSrc.total_livraisons,
      periodeSrc.livraisons,
      src.livraisons_periode,
      src.period_deliveries,
      periodeValue === 'all' ? total_livraisons : 0
    )
  )

  const comparaisonSrc = src.comparaison ?? src.previous ?? src.prev ?? null

  const comparaison: Comparaison | null = comparaisonSrc
    ? {
        total_livraisons_prec: toNumber(
          getFirstDefined(
            comparaisonSrc.total_livraisons_prec,
            comparaisonSrc.previous_deliveries,
            comparaisonSrc.livraisons_prec,
            0
          )
        ),
        distance_prec: toNumber(
          getFirstDefined(
            comparaisonSrc.distance_prec,
            comparaisonSrc.previous_distance,
            comparaisonSrc.distance_precedente,
            0
          )
        ),
        evaluation_prec: clampNullable(
          getFirstDefined(
            comparaisonSrc.evaluation_prec,
            comparaisonSrc.previous_rating,
            comparaisonSrc.note_prec
          ),
          0,
          5
        ),
      }
    : null

  const tendanceSrc = src.tendance ?? src.trend ?? null

  let tendance: Trend | null = tendanceSrc
    ? {
        variation_absolue: toNumber(
          getFirstDefined(
            tendanceSrc.variation_absolue,
            tendanceSrc.abs,
            tendanceSrc.delta,
            0
          )
        ),
        variation_pourcentage: toNumber(
          getFirstDefined(
            tendanceSrc.variation_pourcentage,
            tendanceSrc.percent,
            tendanceSrc.percentage,
            0
          )
        ),
      }
    : null

  if (!tendance && comparaison) {
    tendance = buildTrend(periodeTotal, comparaison.total_livraisons_prec)
  }

  const coursesSrc =
    src.courses_en_cours ?? src.active_courses ?? src.en_cours ?? {}

  const coursesDetails = toArray(
    coursesSrc.details ??
      coursesSrc.courses ??
      coursesSrc.items ??
      (Array.isArray(coursesSrc) ? coursesSrc : [])
  ).map(normalizeActiveCourse)

  const coursesCount = toNumber(
    getFirstDefined(coursesSrc.count, coursesSrc.total, coursesDetails.length),
    coursesDetails.length
  )

  const top_communes = toArray(
    src.top_communes ?? src.communes ?? src.zones
  )
    .map(normalizeTopCommune)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const evolution = toArray(
    src.evolution ?? src.evolution_livraisons ?? src.series
  )
    .map(normalizeEvolutionPoint)
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

  const repartition_statuts = toArray(
    src.repartition_statuts ?? src.statuts ?? src.status_distribution
  ).map(normalizeDistributionItem)

  const repartition_types = toArray(
    src.repartition_types ?? src.types_livraison ?? src.delivery_types
  ).map(normalizeDistributionItem)

  let activite_mensuelle = toArray(
    src.activite_mensuelle ?? src.monthly_activity ?? src.monthly
  ).map(normalizeMonthlyItem)

  if (activite_mensuelle.length === 0 && evolution.length > 0) {
    const map = new Map<string, MonthlyItem>()

    for (const point of evolution) {
      const d = new Date(point.date)
      if (Number.isNaN(d.getTime())) continue

      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('fr-FR', { month: 'short' })

      const existing = map.get(key)

      if (existing) {
        existing.livraisons += point.livraisons
      } else {
        map.set(key, {
          key,
          label,
          livraisons: point.livraisons,
        })
      }
    }

    activite_mensuelle = Array.from(map.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-12)
  }

  return {
    total_livraisons,
    evaluation_moyenne,
    total_evaluations,
    distance_parcourue_km,
    derniere_activite,
    periode: {
      nom: periodeLabel,
      total_livraisons: periodeTotal,
    },
    courses_en_cours: {
      count: coursesCount,
      details: coursesDetails,
    },
    top_communes,
    tendance,
    comparaison,
    evolution,
    repartition_statuts,
    repartition_types,
    activite_mensuelle,
    generated_at: textOrNull(
      getFirstDefined(payload?.generated_at, src?.generated_at)
    ),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UI SUBCOMPONENTS                                               */
/* ═══════════════════════════════════════════════════════════════ */

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'default',
  trend,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon: React.ReactNode
  tone?: 'default' | 'gold' | 'accent' | 'warm' | 'danger'
  trend?: Trend | null
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
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>

            <p className="mt-2 truncate text-3xl font-extrabold text-foreground">
              {value}
            </p>

            {sub && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {sub}
              </p>
            )}

            {trend && (
              <p
                className={cn(
                  'mt-2 inline-flex items-center gap-1 text-xs font-medium',
                  trend.variation_absolue >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {trend.variation_absolue >= 0 ? (
                  <TrendingUp size={12} />
                ) : (
                  <TrendingDown size={12} />
                )}
                {formatVariation(
                  trend.variation_absolue,
                  trend.variation_pourcentage
                )}
              </p>
            )}
          </div>

          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
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

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[250px] items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Card className="border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <AlertTriangle size={40} className="text-red-500" />
        <div>
          <p className="font-bold text-red-700 dark:text-red-300">
            Impossible de charger les statistiques
          </p>
          <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
            {message}
          </p>
        </div>
        <Button variant="outline-gold" onClick={onRetry}>
          Réessayer
        </Button>
      </CardContent>
    </Card>
  )
}

function MiniRow({
  label,
  value,
  icon,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-medium text-foreground">{value}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function LivreurStatsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const prefersReduced = useReducedMotion()

  const auth = useAuth() as any
  const user = auth?.user
  const authLoading = Boolean(auth?.loading)

  const [periode, setPeriode] = useState<Periode>('week')
  const [showDetails, setShowDetails] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [online, setOnline] = useState(true)

  /* ---------------------------------------------------------- */
  /* Title                                                       */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Statistiques livreur | Gercie'
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Auth guard                                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/dashboard/livreur/stats')}`
      )
    }
  }, [authLoading, router, user])

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
  /* Query                                                       */
  /* ---------------------------------------------------------- */

  const statsQuery = useQuery<LivreurStats>({
    queryKey: ['livreur-stats', periode, user?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ periode })

      const res = await fetch(`/api/livreur/stats?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Impossible de charger les statistiques.')
      }

      return normalizeStats(json, periode)
    },
    enabled: Boolean(user && !authLoading),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    retry: 1,
  })

  /* ---------------------------------------------------------- */
  /* Error toast                                                 */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!statsQuery.isError) return

    const message =
      statsQuery.error instanceof Error
        ? statsQuery.error.message
        : 'Erreur lors du chargement des statistiques.'

    notify(toast, 'error', message)
  }, [statsQuery.error, statsQuery.isError, toast])

  /* ---------------------------------------------------------- */
  /* Auto refresh                                                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['livreur-stats'] })
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [autoRefresh, queryClient])

  /* ---------------------------------------------------------- */
  /* Derived data                                                */
  /* ---------------------------------------------------------- */

  const stats = statsQuery.data
  const isFetching = statsQuery.isFetching

  const periodeLabel =
    PERIODES.find((p) => p.value === periode)?.label || periode

  const lastUpdate = stats?.generated_at
    ? formatDateTime(stats.generated_at)
    : '—'

  const distributionData = useMemo(() => {
    if (!stats) return []

    if (stats.repartition_statuts.length > 0) {
      return stats.repartition_statuts
    }

    if (stats.repartition_types.length > 0) {
      return stats.repartition_types
    }

    return []
  }, [stats])

  const evolutionChartData = useMemo(() => {
    if (!stats) return []

    return stats.evolution.map((point) => ({
      date: formatDateShort(point.date),
      livraisons: point.livraisons,
    }))
  }, [stats])

  const monthlyChartData = useMemo(() => {
    if (!stats) return []

    return stats.activite_mensuelle.map((month) => ({
      label: month.label,
      livraisons: month.livraisons,
    }))
  }, [stats])

  const topCommuneChartData = useMemo(() => {
    if (!stats) return []

    return stats.top_communes.map((commune) => ({
      nom: commune.nom,
      livraisons: commune.count,
    }))
  }, [stats])

  const evaluationTrend = useMemo(() => {
    if (!stats?.comparaison?.evaluation_prec) return null

    return buildTrend(
      stats.evaluation_moyenne,
      stats.comparaison.evaluation_prec
    )
  }, [stats])

  const distanceTrend = useMemo(() => {
    if (!stats?.comparaison) return null

    return buildTrend(
      stats.distance_parcourue_km,
      stats.comparaison.distance_prec
    )
  }, [stats])

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleRefresh = useCallback(() => {
    statsQuery.refetch()
  }, [statsQuery])

  const handleToggleAutoRefresh = useCallback(() => {
    setAutoRefresh((prev) => !prev)
  }, [])

  const handleExportCsv = useCallback(() => {
    if (!stats) {
      notify(toast, 'error', 'Aucune donnée à exporter.')
      return
    }

    const rows: string[][] = [
      ['Métrique', 'Valeur'],
      ['Période', periodeLabel],
      ['Total livraisons', String(stats.total_livraisons)],
      ['Livraisons période', String(stats.periode.total_livraisons)],
      ['Évaluation moyenne', stats.evaluation_moyenne.toFixed(1)],
      ['Total évaluations', String(stats.total_evaluations)],
      ['Distance km', stats.distance_parcourue_km.toFixed(1)],
      ['Courses en cours', String(stats.courses_en_cours.count)],
      ['Dernière activité', stats.derniere_activite || ''],
      ['Généré le', stats.generated_at || ''],
    ]

    if (stats.top_communes.length > 0) {
      rows.push(['', ''])
      rows.push(['Top communes', 'Livraisons'])

      for (const commune of stats.top_communes) {
        rows.push([commune.nom, String(commune.count)])
      }
    }

    downloadCsv(
      rows,
      `stats-livreur-${periode}-${new Date().toISOString().slice(0, 10)}.csv`
    )

    notify(toast, 'success', 'Export CSV réalisé.')
  }, [periodeLabel, stats, toast])

  /* ---------------------------------------------------------- */
  /* Render guards                                               */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="xl" variant="premium" label="Chargement..." />
          <p className="text-sm text-muted-foreground">
            Préparation de vos statistiques...
          </p>
        </div>
      </div>
    )
  }

  if (!user) return null

  /* ---------------------------------------------------------- */
  /* Render                                                      */
  /* ---------------------------------------------------------- */

  return (
    <div className="relative min-h-screen bg-neutral-50 pb-16 dark:bg-midnight-950">
      <div className="pattern-dots pointer-events-none absolute inset-0 opacity-5 dark:opacity-10" />

      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b border-gold-400/20 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-midnight-900/70">
        <Container className="flex flex-wrap items-center gap-4 py-4">
          <Link
            href="/dashboard/livreur"
            className="rounded-xl p-2 text-neutral-400 transition hover:bg-gold-400/10 hover:text-gold-500"
            aria-label="Retour au tableau de bord"
          >
            <ArrowLeft size={20} />
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Statistiques
            </h1>
            <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
              Analysez votre performance logistique
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tooltip content={autoRefresh ? 'Désactiver l’actualisation auto' : 'Activer l’actualisation auto'}>
              <button
                type="button"
                onClick={handleToggleAutoRefresh}
                className={cn(
                  'rounded-xl border p-2 transition',
                  autoRefresh
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={autoRefresh}
                aria-label="Actualisation automatique"
              >
                <RotateCw
                  size={16}
                  className={autoRefresh ? 'animate-spin' : ''}
                />
              </button>
            </Tooltip>

            <Tooltip content="Exporter en CSV">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={handleExportCsv}
                disabled={!stats}
                leftIcon={<Download size={14} />}
              >
                Export
              </Button>
            </Tooltip>

            <Tooltip content="Actualiser">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={handleRefresh}
                loading={isFetching}
                leftIcon={<RefreshCw size={14} />}
              >
                Actualiser
              </Button>
            </Tooltip>

            <Link href="/dashboard/livreur">
              <Button variant="ghost" size="sm">
                Tableau de bord
              </Button>
            </Link>
          </div>
        </Container>
      </div>

      <Container className="relative z-10 max-w-6xl py-8">
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-8"
        >
          {/* Offline banner */}
          <AnimatePresence>
            {!online && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
              >
                <WifiOff size={18} className="shrink-0" />
                <p>
                  Vous êtes hors ligne. Les données affichées peuvent être
                  obsolètes.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Period selector + meta */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex flex-wrap rounded-full border border-gold-400/20 bg-white p-1 shadow-soft dark:bg-midnight-800">
              {PERIODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriode(option.value)}
                  className={cn(
                    'whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition',
                    periode === option.value
                      ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                      : 'text-neutral-600 hover:bg-gold-400/10 dark:text-neutral-400'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <Badge variant="gold" size="sm">
                {periodeLabel}
              </Badge>

              <Badge variant="neutral" size="sm">
                <Clock size={12} className="mr-1" />
                {lastUpdate}
              </Badge>

              {isFetching && (
                <Badge variant="neutral" size="sm">
                  <RefreshCw size={12} className="mr-1 animate-spin" />
                  Synchronisation
                </Badge>
              )}
            </div>
          </div>

          {/* Loading */}
          {statsQuery.isLoading && !stats ? (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-2xl" />
                ))}
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                <Skeleton className="h-[330px] w-full rounded-2xl" />
                <Skeleton className="h-[330px] w-full rounded-2xl" />
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                <Skeleton className="h-[300px] w-full rounded-2xl" />
                <Skeleton className="h-[300px] w-full rounded-2xl" />
              </div>
            </div>
          ) : statsQuery.isError && !stats ? (
            <ErrorState
              message={
                statsQuery.error instanceof Error
                  ? statsQuery.error.message
                  : 'Erreur inconnue.'
              }
              onRetry={handleRefresh}
            />
          ) : stats ? (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                <StatCard
                  label="Livraisons"
                  value={formatNumber(stats.total_livraisons)}
                  sub={`${formatNumber(stats.periode.total_livraisons)} sur ${stats.periode.nom.toLowerCase()}`}
                  icon={<Package size={24} />}
                  tone="gold"
                  trend={stats.tendance}
                />

                <StatCard
                  label="Évaluation"
                  value={
                    <span className="inline-flex items-baseline gap-2">
                      {formatDecimal(stats.evaluation_moyenne, 1)}
                      <span className="inline-flex text-gold-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            fill={
                              i < Math.round(stats.evaluation_moyenne)
                                ? 'currentColor'
                                : 'none'
                            }
                          />
                        ))}
                      </span>
                    </span>
                  }
                  sub={`${formatNumber(stats.total_evaluations)} évaluation(s)`}
                  icon={<Star size={24} />}
                  tone="warm"
                  trend={evaluationTrend}
                />

                <StatCard
                  label="Distance"
                  value={`${formatDecimal(stats.distance_parcourue_km, 0)} km`}
                  sub="Distance cumulée"
                  icon={<MapPin size={24} />}
                  tone="accent"
                  trend={distanceTrend}
                />

                <StatCard
                  label="En cours"
                  value={formatNumber(stats.courses_en_cours.count)}
                  sub={`${formatNumber(stats.courses_en_cours.details.length)} détail(s) chargé(s)`}
                  icon={<Activity size={24} />}
                  tone={stats.courses_en_cours.count > 0 ? 'danger' : 'default'}
                />
              </div>

              {/* Charts row 1 */}
              <div className="grid gap-8 lg:grid-cols-2">
                <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <PieChartIcon size={18} className="text-gold-500" />
                      Répartition
                    </CardTitle>
                    <CardDescription>
                      Statuts ou types de livraison sur la période.
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    {distributionData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <RechartsPieChart>
                          <Pie
                            data={distributionData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={95}
                            paddingAngle={4}
                            isAnimationActive={!prefersReduced}
                            label={(entry: any) =>
                              `${entry.name} (${(((entry.percent || 0) * 100)).toFixed(0)}%)`
                            }
                          >
                            {distributionData.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                                stroke="none"
                              />
                            ))}
                          </Pie>

                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: 'rgba(255,255,255,0.95)',
                              border: '1px solid rgba(201,169,98,0.3)',
                              borderRadius: '12px',
                            }}
                            formatter={(value: any, name: any) => [
                              formatNumber(Number(value)),
                              name,
                            ]}
                          />

                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                          />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart message="Aucune donnée de répartition disponible." />
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Award size={18} className="text-gold-500" />
                      Top communes
                    </CardTitle>
                    <CardDescription>
                      Zones où vous livrez le plus souvent.
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    {topCommuneChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart
                          data={topCommuneChartData}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <defs>
                            <linearGradient
                              id="communeGradient"
                              x1="0"
                              y1="0"
                              x2="1"
                              y2="0"
                            >
                              <stop offset="0%" stopColor="#e8be4c" />
                              <stop offset="80%" stopColor="#a87d0e" />
                              <stop offset="100%" stopColor="#6d4e08" />
                            </linearGradient>
                          </defs>

                          <XAxis type="number" hide />

                          <YAxis
                            dataKey="nom"
                            type="category"
                            width={90}
                            tick={{ fontSize: 12, fill: '#a8a49b' }}
                            tickLine={false}
                            axisLine={false}
                          />

                          <RechartsTooltip
                            cursor={{ fill: 'rgba(201,169,98,0.1)' }}
                            contentStyle={{
                              backgroundColor: 'rgba(255,255,255,0.95)',
                              border: '1px solid rgba(201,169,98,0.3)',
                              borderRadius: '12px',
                            }}
                            formatter={(value: any) => [
                              formatNumber(Number(value)),
                              'Livraisons',
                            ]}
                          />

                          <Bar
                            dataKey="livraisons"
                            fill="url(#communeGradient)"
                            radius={[0, 8, 8, 0]}
                            barSize={20}
                            isAnimationActive={!prefersReduced}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart message="Aucune donnée de commune disponible." />
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Charts row 2 */}
              <div className="grid gap-8 lg:grid-cols-2">
                <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 size={18} className="text-gold-500" />
                      Évolution des livraisons
                    </CardTitle>
                    <CardDescription>
                      Activité quotidienne ou hebdomadaire.
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    {evolutionChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart
                          data={evolutionChartData}
                          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="evolutionGradient"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop offset="5%" stopColor="#c99a14" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#c99a14" stopOpacity={0} />
                            </linearGradient>
                          </defs>

                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(201,169,98,0.2)"
                          />

                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12, fill: '#a8a49b' }}
                            axisLine={false}
                            tickLine={false}
                          />

                          <YAxis
                            tick={{ fontSize: 12, fill: '#a8a49b' }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />

                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: 'rgba(255,255,255,0.95)',
                              border: '1px solid rgba(201,169,98,0.3)',
                              borderRadius: '12px',
                            }}
                            formatter={(value: any) => [
                              formatNumber(Number(value)),
                              'Livraisons',
                            ]}
                          />

                          <Area
                            type="monotone"
                            dataKey="livraisons"
                            stroke="#c99a14"
                            strokeWidth={2}
                            fill="url(#evolutionGradient)"
                            isAnimationActive={!prefersReduced}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart message="Aucune donnée d’évolution disponible." />
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calendar size={18} className="text-gold-500" />
                      Activité mensuelle
                    </CardTitle>
                    <CardDescription>
                      Volume de livraisons par mois.
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    {monthlyChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={monthlyChartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(201,169,98,0.2)"
                          />

                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 12, fill: '#a8a49b' }}
                            axisLine={false}
                            tickLine={false}
                          />

                          <YAxis
                            tick={{ fontSize: 12, fill: '#a8a49b' }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />

                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: 'rgba(255,255,255,0.95)',
                              border: '1px solid rgba(201,169,98,0.3)',
                              borderRadius: '12px',
                            }}
                            formatter={(value: any) => [
                              formatNumber(Number(value)),
                              'Livraisons',
                            ]}
                          />

                          <Bar
                            dataKey="livraisons"
                            fill="#c99a14"
                            radius={[8, 8, 0, 0]}
                            isAnimationActive={!prefersReduced}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart message="Aucune activité mensuelle disponible." />
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Active courses */}
              {stats.courses_en_cours.count > 0 && (
                <Card className="border-gold-400/20 bg-card/70">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Timer size={18} className="text-gold-500" />
                        Courses en cours
                      </CardTitle>
                      <CardDescription>
                        Affectations actives à traiter rapidement.
                      </CardDescription>
                    </div>

                    <Badge variant="warm" size="sm">
                      {formatNumber(stats.courses_en_cours.count)} active(s)
                    </Badge>
                  </CardHeader>

                  <CardContent>
                    {stats.courses_en_cours.details.length > 0 ? (
                      <div className="space-y-3">
                        {stats.courses_en_cours.details.map((course) => (
                          <div
                            key={course.id}
                            className="flex flex-col gap-3 rounded-2xl border border-border bg-background/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-mono text-sm font-semibold text-foreground">
                                #{course.commande_id.slice(-6)}
                              </p>

                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={courseStatusVariant(course.statut)}
                                  size="sm"
                                >
                                  {courseStatusLabel(course.statut)}
                                </Badge>

                                {course.commune && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin size={12} />
                                    {course.commune}
                                  </span>
                                )}

                                {course.created_at && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatRelative(course.created_at)}
                                  </span>
                                )}
                              </div>

                              {course.adresse && (
                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                  {course.adresse}
                                </p>
                              )}
                            </div>

                            <Link
                              href={`/dashboard/livreur/courses/${course.commande_id}`}
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
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Des courses sont marquées comme actives, mais le détail
                        n’est pas encore disponible.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Details */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-gold-600 transition hover:text-gold-500 dark:text-gold-400"
                >
                  <ChevronDown
                    size={16}
                    className={cn(
                      'transition-transform',
                      showDetails && 'rotate-180'
                    )}
                  />
                  {showDetails ? 'Masquer' : 'Afficher'} les détails
                </button>

                <AnimatePresence initial={false}>
                  {showDetails && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <Card className="mt-4 border-gold-400/20 bg-card/70">
                        <CardContent className="space-y-3 p-5">
                          <MiniRow
                            label="Dernière activité"
                            value={formatDateTime(stats.derniere_activite)}
                            icon={<Clock size={14} />}
                          />

                          <MiniRow
                            label="Évaluations reçues"
                            value={formatNumber(stats.total_evaluations)}
                            icon={<Star size={14} />}
                          />

                          <MiniRow
                            label="Distance totale"
                            value={`${formatDecimal(stats.distance_parcourue_km, 1)} km`}
                            icon={<MapPin size={14} />}
                          />

                          <MiniRow
                            label="Période analysée"
                            value={stats.periode.nom}
                            icon={<Calendar size={14} />}
                          />

                          <MiniRow
                            label="Généré le"
                            value={formatDateTime(stats.generated_at)}
                            icon={<Activity size={14} />}
                          />

                          {stats.comparaison && (
                            <>
                              <hr className="border-gold-400/20" />

                              <p className="text-sm font-semibold text-foreground">
                                Comparaison période précédente
                              </p>

                              <MiniRow
                                label="Livraisons précédentes"
                                value={formatNumber(
                                  stats.comparaison.total_livraisons_prec
                                )}
                              />

                              <MiniRow
                                label="Distance précédente"
                                value={`${formatDecimal(
                                  stats.comparaison.distance_prec,
                                  1
                                )} km`}
                              />

                              <MiniRow
                                label="Évaluation précédente"
                                value={
                                  stats.comparaison.evaluation_prec === null
                                    ? '—'
                                    : formatDecimal(
                                        stats.comparaison.evaluation_prec,
                                        1
                                      )
                                }
                              />
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : null}
        </motion.div>
      </Container>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}