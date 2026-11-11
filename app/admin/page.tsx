// app/admin/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import Link from 'next/link'
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'

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
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'

import { cn } from '@/lib/utils'

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BarChart2,
  Check,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  Eye,
  ExternalLink,
  Gift,
  Grid,
  Hash,
  Info,
  Landmark,
  Layers,
  List,
  Package,
  Percent,
  PieChart as PieChartIcon,
  Receipt,
  RefreshCw,
  RotateCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Timer,
  TrendingUp,
  Truck,
  Users,
  UserPlus,
  X,
  Zap,
} from 'lucide-react'

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
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

type Period = '7j' | '30j' | '90j' | '1an'
type ViewMode = 'table' | 'cards'

interface DashboardStats {
  totalUsers: number
  totalVendeurs: number
  totalCommandes: number
  caCdf: number
  caUsd: number
  paiementsEnAttente: number
  litigesOuverts: number
  commandesDuJour: number
  ventesDuJourCdf: number
  ventesDuJourUsd: number
  nouveauxUtilisateurs: number
  tauxConversion: number
  panierMoyenCdf: number
  panierMoyenUsd: number
  commandesEnAttente: number
  produitsActifs: number
  produitsTotal: number
  rupturesStock: number
  tauxChange: number | null
}

interface CommandesStats {
  parStatut: { name: string; value: number }[]
  evolution: { date: string; montant: number; commandes: number }[]
}

interface RecentOrder {
  id: string
  numero: string
  client: string
  email?: string | null
  montantCdf: number
  montantUsd?: number | null
  statut: string
  date: string
}

interface TopProduct {
  id: string
  nom: string
  ventes: number
  vues: number
  prixCdf: number
  prixUsd?: number | null
}

interface TopCategory {
  name: string
  ventes: number
  produits: number
}

interface RecentUser {
  id: string
  email: string
  nom?: string | null
  prenom?: string | null
  date: string
}

interface SystemStatus {
  lastBackup: string
  diskSpace: number
  activeConnections: number
  uptime: string
  databaseSize?: string | null
  apiLatency?: string | null
}

interface Kpi {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon: React.ReactNode
  href: string
  tone: 'brand' | 'accent' | 'gold' | 'warm' | 'danger' | 'neutral'
  trend?: string
  trendUp?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7j', label: '7 jours' },
  { value: '30j', label: '30 jours' },
  { value: '90j', label: '90 jours' },
  { value: '1an', label: '1 an' },
]

const PERIOD_DAYS: Record<Period, number> = {
  '7j': 7,
  '30j': 30,
  '90j': 90,
  '1an': 365,
}

const CHART_COLORS = [
  '#4766f7',
  '#18c78a',
  '#f6cf2a',
  '#8b5cf6',
  '#e37d32',
  '#ef4444',
  '#ec4899',
  '#10b981',
  '#6366f1',
  '#f59e0b',
]

const EMPTY_STATS: DashboardStats = {
  totalUsers: 0,
  totalVendeurs: 0,
  totalCommandes: 0,
  caCdf: 0,
  caUsd: 0,
  paiementsEnAttente: 0,
  litigesOuverts: 0,
  commandesDuJour: 0,
  ventesDuJourCdf: 0,
  ventesDuJourUsd: 0,
  nouveauxUtilisateurs: 0,
  tauxConversion: 0,
  panierMoyenCdf: 0,
  panierMoyenUsd: 0,
  commandesEnAttente: 0,
  produitsActifs: 0,
  produitsTotal: 0,
  rupturesStock: 0,
  tauxChange: null,
}

const TONE_CLASSES: Record<Kpi['tone'], string> = {
  brand: 'bg-brand-100 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400',
  accent:
    'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  gold: 'bg-gold-100 text-gold-600 dark:bg-gold-900/20 dark:text-gold-400',
  warm: 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  danger: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  neutral: 'bg-muted text-muted-foreground',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function formatNumber(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('fr-FR')
}

function formatFc(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${Math.round(n).toLocaleString('fr-FR')} FC`
}

function formatUsd(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `$${n.toFixed(2)}`
}

function formatPercent(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0%'
  return `${n.toFixed(1)}%`
}

function formatDate(value?: string | null): string {
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
    return value
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
    return value
  }
}

function formatRelative(value?: string | null): string {
  if (!value) return ''

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
    return ''
  }
}

function statutVariant(
  statut: string
): 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' {
  const map: Record<string, Kpi['tone']> = {
    en_attente: 'warm',
    pending: 'warm',
    payee: 'gold',
    approved: 'gold',
    collecte: 'neutral',
    conditionnement_premium: 'neutral',
    en_livraison: 'warm',
    livree: 'accent',
    annulee: 'danger',
    refusee: 'danger',
    rembourse: 'neutral',
    retour_demande: 'warm',
  }

  return map[String(statut || '').toLowerCase()] || 'neutral'
}

function statutLabel(statut: string): string {
  const map: Record<string, string> = {
    en_attente: 'En attente',
    pending: 'En attente',
    payee: 'Payée',
    approved: 'Approuvée',
    collecte: 'Collecte',
    conditionnement_premium: 'Conditionnement',
    en_livraison: 'En livraison',
    livree: 'Livrée',
    annulee: 'Annulée',
    refusee: 'Refusée',
    rembourse: 'Remboursée',
    retour_demande: 'Retour demandé',
  }

  return map[String(statut || '').toLowerCase()] || statut || '—'
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

function getFirstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function normalizeStats(raw: any): DashboardStats {
  const src = raw?.data ?? raw?.stats ?? raw ?? {}

  return {
    totalUsers: toNumber(
      getFirstDefined(
        src.totalUsers,
        src.total_users,
        src.users,
        src.utilisateurs,
        src.nb_utilisateurs
      )
    ),
    totalVendeurs: toNumber(
      getFirstDefined(
        src.totalVendeurs,
        src.total_vendeurs,
        src.vendeurs,
        src.sellers
      )
    ),
    totalCommandes: toNumber(
      getFirstDefined(
        src.totalCommandes,
        src.total_commandes,
        src.commandes,
        src.orders
      )
    ),
    caCdf: toNumber(
      getFirstDefined(
        src.ca_cdf,
        src.total_ventes,
        src.totalVentes,
        src.chiffre_affaires,
        src.revenue,
        src.sales
      )
    ),
    caUsd: toNumber(
      getFirstDefined(
        src.ca_usd,
        src.total_ventes_usd,
        src.totalVentesUsd,
        src.revenue_usd
      )
    ),
    paiementsEnAttente: toNumber(
      getFirstDefined(
        src.paiements_en_attente,
        src.paiementsEnAttente,
        src.pending_payments,
        src.transactions_pending,
        src.payment_pending
      )
    ),
    litigesOuverts: toNumber(
      getFirstDefined(
        src.litiges_ouverts,
        src.litigesOuverts,
        src.open_disputes,
        src.disputes
      )
    ),
    commandesDuJour: toNumber(
      getFirstDefined(
        src.commandes_du_jour,
        src.commandesDuJour,
        src.orders_today
      )
    ),
    ventesDuJourCdf: toNumber(
      getFirstDefined(
        src.ventes_du_jour,
        src.ventesDuJour,
        src.sales_today,
        src.revenue_today
      )
    ),
    ventesDuJourUsd: toNumber(
      getFirstDefined(
        src.ventes_du_jour_usd,
        src.ventesDuJourUsd,
        src.sales_today_usd
      )
    ),
    nouveauxUtilisateurs: toNumber(
      getFirstDefined(
        src.nouveaux_utilisateurs,
        src.nouveauxUtilisateurs,
        src.new_users,
        src.signups
      )
    ),
    tauxConversion: toNumber(
      getFirstDefined(
        src.taux_conversion,
        src.tauxConversion,
        src.conversion_rate
      )
    ),
    panierMoyenCdf: toNumber(
      getFirstDefined(
        src.panier_moyen,
        src.panierMoyen,
        src.average_cart,
        src.aov
      )
    ),
    panierMoyenUsd: toNumber(
      getFirstDefined(
        src.panier_moyen_usd,
        src.panierMoyenUsd,
        src.average_cart_usd
      )
    ),
    commandesEnAttente: toNumber(
      getFirstDefined(
        src.commandes_en_attente,
        src.commandesEnAttente,
        src.pending_orders
      )
    ),
    produitsActifs: toNumber(
      getFirstDefined(
        src.produits_actifs,
        src.produitsActifs,
        src.active_products
      )
    ),
    produitsTotal: toNumber(
      getFirstDefined(
        src.produits_total,
        src.produitsTotal,
        src.total_products
      )
    ),
    rupturesStock: toNumber(
      getFirstDefined(
        src.ruptures_stock,
        src.rupturesStock,
        src.stockouts,
        src.low_stock
      )
    ),
    tauxChange:
      getFirstDefined(
        src.taux_change,
        src.tauxChange,
        src.exchange_rate,
        src.usd_cdf_rate
      ) ?? null,
  }
}

function applyRateToStats(
  stats: DashboardStats,
  rate: number | null | undefined
): DashboardStats {
  const safeRate = Number(rate || 0)

  let caUsd = stats.caUsd
  let caCdf = stats.caCdf

  if (!caUsd && caCdf && safeRate > 0) caUsd = caCdf / safeRate
  if (!caCdf && caUsd && safeRate > 0) caCdf = caUsd * safeRate

  let ventesDuJourUsd = stats.ventesDuJourUsd
  let ventesDuJourCdf = stats.ventesDuJourCdf

  if (!ventesDuJourUsd && ventesDuJourCdf && safeRate > 0)
    ventesDuJourUsd = ventesDuJourCdf / safeRate
  if (!ventesDuJourCdf && ventesDuJourUsd && safeRate > 0)
    ventesDuJourCdf = ventesDuJourUsd * safeRate

  let panierMoyenUsd = stats.panierMoyenUsd
  let panierMoyenCdf = stats.panierMoyenCdf

  if (!panierMoyenUsd && panierMoyenCdf && safeRate > 0)
    panierMoyenUsd = panierMoyenCdf / safeRate
  if (!panierMoyenCdf && panierMoyenUsd && safeRate > 0)
    panierMoyenCdf = panierMoyenUsd * safeRate

  return {
    ...stats,
    caUsd,
    caCdf,
    ventesDuJourUsd,
    ventesDuJourCdf,
    panierMoyenUsd,
    panierMoyenCdf,
    tauxChange: stats.tauxChange ?? (safeRate > 0 ? safeRate : null),
  }
}

function normalizeOrder(raw: any, index: number): RecentOrder {
  const profiles = raw?.profiles ?? raw?.acheteur ?? raw?.user ?? null
  const clientName = [profiles?.prenom, profiles?.nom]
    .filter(Boolean)
    .join(' ')
    .trim()

  return {
    id: String(raw?.id || `order-${index}`),
    numero: String(
      getFirstDefined(
        raw?.numero_commande,
        raw?.numero,
        raw?.reference,
        raw?.id
      ) || `CMD-${index + 1}`
    ),
    client: String(
      getFirstDefined(clientName, raw?.client, profiles?.email, raw?.email) ||
        'Client'
    ),
    email: profiles?.email || raw?.email || null,
    montantCdf: toNumber(
      getFirstDefined(
        raw?.total_global,
        raw?.total,
        raw?.montant,
        raw?.prix_total
      )
    ),
    montantUsd:
      getFirstDefined(raw?.total_usd, raw?.montant_usd, raw?.prix_total_usd) ??
      null,
    statut: String(
      getFirstDefined(raw?.statut, raw?.status, 'en_attente')
    ).toLowerCase(),
    date: String(
      getFirstDefined(raw?.created_at, raw?.date, raw?.updated_at) ||
        new Date().toISOString()
    ),
  }
}

function normalizeTopProduct(raw: any, index: number): TopProduct {
  return {
    id: String(raw?.id || `product-${index}`),
    nom: String(
      getFirstDefined(raw?.nom, raw?.name, raw?.titre, 'Produit')
    ),
    ventes: toNumber(
      getFirstDefined(raw?.ventes, raw?.total_ventes, raw?.sold, raw?.quantity)
    ),
    vues: toNumber(
      getFirstDefined(raw?.vues, raw?.views, raw?.page_views, 0)
    ),
    prixCdf: toNumber(
      getFirstDefined(raw?.prix, raw?.price, raw?.prix_cdf, raw?.montant)
    ),
    prixUsd:
      getFirstDefined(raw?.prix_usd, raw?.price_usd, raw?.montant_usd) ?? null,
  }
}

function normalizeTopCategory(raw: any, index: number): TopCategory {
  return {
    name: String(
      getFirstDefined(raw?.name, raw?.nom, raw?.categorie, `Catégorie ${index + 1}`)
    ),
    ventes: toNumber(
      getFirstDefined(raw?.ventes, raw?.total_ventes, raw?.value, 0)
    ),
    produits: toNumber(
      getFirstDefined(raw?.produits, raw?.total_produits, raw?.count, 0)
    ),
  }
}

function normalizeUser(raw: any, index: number): RecentUser {
  return {
    id: String(raw?.id || `user-${index}`),
    email: String(getFirstDefined(raw?.email, '—')),
    nom: raw?.nom ? String(raw.nom) : null,
    prenom: raw?.prenom ? String(raw.prenom) : null,
    date: String(
      getFirstDefined(
        raw?.created_at,
        raw?.date_inscription,
        raw?.signup_date,
        new Date().toISOString()
      )
    ),
  }
}

function normalizeSystemStatus(raw: any): SystemStatus | null {
  if (!raw) return null

  const src = raw?.data ?? raw

  return {
    lastBackup: String(
      getFirstDefined(src.last_backup, src.lastBackup, src.backup_at, '—')
    ),
    diskSpace: toNumber(
      getFirstDefined(src.disk_space, src.diskSpace, src.free_space, 0)
    ),
    activeConnections: toNumber(
      getFirstDefined(
        src.active_connections,
        src.activeConnections,
        src.connections,
        0
      )
    ),
    uptime: String(getFirstDefined(src.uptime, src.availability, '—')),
    databaseSize:
      getFirstDefined(src.database_size, src.databaseSize, src.db_size) ?? null,
    apiLatency:
      getFirstDefined(src.api_latency, src.apiLatency, src.latency) ?? null,
  }
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

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MINI COMPOSANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function DashboardSkeleton() {
  return (
    <Container className="py-8 md:py-10">
      <div className="space-y-8">
        <Skeleton className="h-12 w-80" />

        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-3xl" />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="h-[380px] w-full rounded-3xl" />
          <Skeleton className="h-[380px] w-full rounded-3xl" />
        </div>

        <Skeleton className="h-[520px] w-full rounded-3xl" />
      </div>
    </Container>
  )
}

function AlertCard({
  title,
  description,
  icon,
  href,
  actionLabel,
  tone,
  delay = 0,
}: {
  title: string
  description: string
  icon: React.ReactNode
  href: string
  actionLabel: string
  tone: 'gold' | 'danger' | 'warm' | 'accent'
  delay?: number
}) {
  const toneClasses = {
    gold: 'border-l-gold-400 bg-gold-50 dark:bg-gold-900/20',
    danger: 'border-l-red-400 bg-red-50 dark:bg-red-900/20',
    warm: 'border-l-amber-400 bg-amber-50 dark:bg-amber-900/20',
    accent: 'border-l-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
  }

  const iconClasses = {
    gold: 'text-gold-600 dark:text-gold-400',
    danger: 'text-red-600 dark:text-red-400',
    warm: 'text-amber-600 dark:text-amber-400',
    accent: 'text-emerald-600 dark:text-emerald-400',
  }

  const buttonVariant =
    tone === 'danger' ? 'danger' : tone === 'gold' ? 'luxe' : 'outline-gold'

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay }}
    >
      <Card className={cn('border-l-4 shadow-soft', toneClasses[tone])}>
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white p-2 shadow-sm dark:bg-midnight-800">
              <span className={iconClasses[tone]}>{icon}</span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{title}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            <Link href={href}>
              <Button variant={buttonVariant as any} size="sm">
                {actionLabel}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function MiniStatRow({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="text-gold-500">{icon}</span>}
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold text-foreground">
            {value}
          </p>
        </div>
      </div>

      {sub && <p className="shrink-0 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminDashboardPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const prefersReduced = useReducedMotion()
  const { rate, loading: rateLoading } = useExchangeRate()

  const [period, setPeriod] = useState<Period>('30j')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [online, setOnline] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  /* ---------------------------------------------------------- */
  /* Online status                                               */
  /* ---------------------------------------------------------- */

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

  /* ---------------------------------------------------------- */
  /* Queries                                                     */
  /* ---------------------------------------------------------- */

  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['admin-dashboard', 'stats', period],
    queryFn: async () => {
      const days = PERIOD_DAYS[period]
      const res = await fetch(
        `/api/admin/stats?period=${period}&days=${days}`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Impossible de charger les statistiques.')
      }

      const json = await res.json()
      return normalizeStats(json)
    },
    staleTime: 30_000,
    retry: 1,
  })

  const commandesStatsQuery = useQuery<CommandesStats>({
    queryKey: ['admin-dashboard', 'commandes-stats', period],
    queryFn: async () => {
      const days = PERIOD_DAYS[period]
      const res = await fetch(
        `/api/admin/stats/commandes?period=${period}&days=${days}`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )

      if (!res.ok) return { parStatut: [], evolution: [] }

      const json = await res.json()
      const src = json?.data ?? json

      return {
        parStatut: Array.isArray(src?.parStatut)
          ? src.parStatut
          : Array.isArray(src?.par_statut)
            ? src.par_statut
            : [],
        evolution: Array.isArray(src?.evolution) ? src.evolution : [],
      }
    },
    staleTime: 60_000,
    retry: 1,
  })

  const recentOrdersQuery = useQuery<RecentOrder[]>({
    queryKey: ['admin-dashboard', 'recent-orders'],
    queryFn: async () => {
      const res = await fetch(
        '/api/admin/commandes?limit=10&sort=created_at&order=desc',
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )

      if (!res.ok) return []

      const json = await res.json()
      const arr = toArray(json, ['data', 'commandes', 'orders'])

      return arr.map(normalizeOrder)
    },
    staleTime: 30_000,
  })

  const topProductsQuery = useQuery<TopProduct[]>({
    queryKey: ['admin-dashboard', 'top-products', period],
    queryFn: async () => {
      const days = PERIOD_DAYS[period]
      const res = await fetch(
        `/api/admin/stats/top-products?limit=10&period=${period}&days=${days}`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )

      if (!res.ok) return []

      const json = await res.json()
      const arr = toArray(json, ['data', 'products', 'produits'])

      return arr.map(normalizeTopProduct)
    },
    staleTime: 60_000,
  })

  const topCategoriesQuery = useQuery<TopCategory[]>({
    queryKey: ['admin-dashboard', 'top-categories', period],
    queryFn: async () => {
      const days = PERIOD_DAYS[period]
      const res = await fetch(
        `/api/admin/stats/top-categories?limit=10&period=${period}&days=${days}`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )

      if (!res.ok) return []

      const json = await res.json()
      const arr = toArray(json, ['data', 'categories', 'categories'])

      return arr.map(normalizeTopCategory)
    },
    staleTime: 60_000,
  })

  const recentUsersQuery = useQuery<RecentUser[]>({
    queryKey: ['admin-dashboard', 'recent-users'],
    queryFn: async () => {
      const res = await fetch(
        '/api/admin/utilisateurs?limit=8&sort=created_at&order=desc',
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )

      if (!res.ok) return []

      const json = await res.json()
      const arr = toArray(json, ['data', 'users', 'utilisateurs'])

      return arr.map(normalizeUser)
    },
    staleTime: 60_000,
  })

  const systemQuery = useQuery<SystemStatus | null>({
    queryKey: ['admin-dashboard', 'system'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats/system', {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) return null

      const json = await res.json()
      return normalizeSystemStatus(json)
    },
    staleTime: 120_000,
  })

  const pendingPaymentsQuery = useQuery<number>({
    queryKey: ['admin-dashboard', 'pending-payments'],
    queryFn: async () => {
      try {
        const res = await fetch(
          '/api/admin/transactions?status=pending&limit=1',
          {
            credentials: 'include',
            cache: 'no-store',
          }
        )

        if (!res.ok) return 0

        const json = await res.json()

        return toNumber(
          getFirstDefined(
            json?.pagination?.total,
            json?.total,
            Array.isArray(json?.data) ? json.data.length : 0
          )
        )
      } catch {
        return 0
      }
    },
    staleTime: 30_000,
  })

  /* ---------------------------------------------------------- */
  /* Derived data                                                */
  /* ---------------------------------------------------------- */

  const rawStats = statsQuery.data ?? EMPTY_STATS

  const stats = useMemo(
    () => applyRateToStats(rawStats, rate),
    [rawStats, rate]
  )

  const recentOrders = recentOrdersQuery.data ?? []
  const topProducts = topProductsQuery.data ?? []
  const topCategories = topCategoriesQuery.data ?? []
  const recentUsers = recentUsersQuery.data ?? []
  const systemStatus = systemQuery.data ?? null

  const pendingPaymentsFromApi = pendingPaymentsQuery.data ?? 0
  const pendingPaymentsCount =
    pendingPaymentsFromApi > 0 ? pendingPaymentsFromApi : stats.paiementsEnAttente

  const isRefreshing =
    statsQuery.isFetching ||
    commandesStatsQuery.isFetching ||
    recentOrdersQuery.isFetching ||
    topProductsQuery.isFetching ||
    topCategoriesQuery.isFetching ||
    recentUsersQuery.isFetching ||
    systemQuery.isFetching ||
    pendingPaymentsQuery.isFetching

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) return recentOrders

    return recentOrders.filter(
      (order) =>
        order.client?.toLowerCase().includes(q) ||
        order.numero?.toLowerCase().includes(q) ||
        order.email?.toLowerCase().includes(q) ||
        order.statut?.toLowerCase().includes(q)
    )
  }, [recentOrders, search])

  const barData = commandesStatsQuery.data?.parStatut ?? []
  const evolutionData = (commandesStatsQuery.data?.evolution ?? []).map(
    (item) => ({
      ...item,
      date: formatDateShort(item.date),
    })
  )

  const pieData = topCategories.map((cat) => ({
    name: cat.name,
    value: cat.ventes,
  }))

  const topSoldProducts = useMemo(
    () => [...topProducts].sort((a, b) => b.ventes - a.ventes).slice(0, 10),
    [topProducts]
  )

  const topViewedProducts = useMemo(
    () => [...topProducts].sort((a, b) => b.vues - a.vues).slice(0, 8),
    [topProducts]
  )

  const rateMissing = !rateLoading && (!rate || rate <= 0)

  /* ---------------------------------------------------------- */
  /* KPIs                                                        */
  /* ---------------------------------------------------------- */

  const mainKpis: Kpi[] = [
    {
      label: 'Utilisateurs',
      value: formatNumber(stats.totalUsers),
      sub: `${formatNumber(stats.nouveauxUtilisateurs)} nouveaux`,
      icon: <Users size={24} />,
      href: '/admin/utilisateurs',
      tone: 'brand',
    },
    {
      label: 'Commandes',
      value: formatNumber(stats.totalCommandes),
      sub: `${formatNumber(stats.commandesDuJour)} aujourd’hui`,
      icon: <ShoppingBag size={24} />,
      href: '/admin/commandes',
      tone: 'accent',
    },
    {
      label: 'CA validé',
      value: formatUsd(stats.caUsd),
      sub: rate ? `≈ ${formatFc(stats.caCdf)}` : 'Taux USD indisponible',
      icon: <DollarSign size={24} />,
      href: '/admin/transactions?status=approved',
      tone: 'gold',
    },
    {
      label: 'Paiements en attente',
      value: formatNumber(pendingPaymentsCount),
      sub: pendingPaymentsCount > 0 ? 'À vérifier' : 'Aucune alerte',
      icon: <Receipt size={24} />,
      href: '/admin/transactions?status=pending',
      tone: pendingPaymentsCount > 0 ? 'warm' : 'neutral',
    },
  ]

  const secondaryKpis: Kpi[] = [
    {
      label: 'Ventes du jour',
      value: formatUsd(stats.ventesDuJourUsd),
      sub: rate ? `≈ ${formatFc(stats.ventesDuJourCdf)}` : undefined,
      icon: <Zap size={16} />,
      href: '/admin/commandes',
      tone: 'gold',
    },
    {
      label: 'Panier moyen',
      value: formatUsd(stats.panierMoyenUsd),
      sub: rate ? `≈ ${formatFc(stats.panierMoyenCdf)}` : undefined,
      icon: <Hash size={16} />,
      href: '/admin/commandes',
      tone: 'accent',
    },
    {
      label: 'Conversion',
      value: formatPercent(stats.tauxConversion),
      icon: <TrendingUp size={16} />,
      href: '/admin/trust',
      tone: 'brand',
    },
    {
      label: 'Commandes en attente',
      value: formatNumber(stats.commandesEnAttente),
      icon: <Timer size={16} />,
      href: '/admin/commandes?statut=en_attente',
      tone: 'warm',
    },
    {
      label: 'Litiges ouverts',
      value: formatNumber(stats.litigesOuverts),
      icon: <AlertTriangle size={16} />,
      href: '/admin/litiges',
      tone: stats.litigesOuverts > 0 ? 'danger' : 'neutral',
    },
    {
      label: 'Ruptures stock',
      value: formatNumber(stats.rupturesStock),
      icon: <Package size={16} />,
      href: '/admin/produits?stock=rupture',
      tone: stats.rupturesStock > 0 ? 'danger' : 'neutral',
    },
    {
      label: 'Produits actifs',
      value: `${formatNumber(stats.produitsActifs)} / ${formatNumber(stats.produitsTotal)}`,
      icon: <Layers size={16} />,
      href: '/admin/produits',
      tone: 'accent',
    },
    {
      label: 'Taux USD/CDF',
      value: rate ? formatFc(rate) : '—',
      sub: rate ? '1 USD' : 'Non défini',
      icon: <ArrowLeftRight size={16} />,
      href: '/admin/exchange-rate',
      tone: rateMissing ? 'danger' : 'gold',
    },
  ]

  /* ---------------------------------------------------------- */
  /* Actions                                                     */
  /* ---------------------------------------------------------- */

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }, [queryClient])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      handleRefresh()
    }, 30_000)

    return () => clearInterval(interval)
  }, [autoRefresh, handleRefresh])

  const handleCopy = useCallback(
    async (text: string, id: string) => {
      if (!text) return

      const ok = await copyText(text)

      if (ok) {
        setCopiedId(id)
        toast.addToast({ type: 'success', message: 'Copié.' })
        setTimeout(() => setCopiedId(null), 1800)
      } else {
        toast.addToast({ type: 'error', message: 'Copie impossible.' })
      }
    },
    [toast]
  )

  const handleExportCsv = useCallback(() => {
    if (filteredOrders.length === 0) {
      toast.addToast({
        type: 'error',
        message: 'Aucune commande à exporter.',
      })
      return
    }

    const headers = [
      'ID',
      'Numéro',
      'Client',
      'Email',
      'Montant USD',
      'Montant CDF',
      'Statut',
      'Date',
    ]

    const rows = filteredOrders.map((order) => [
      order.id,
      order.numero,
      order.client,
      order.email || '',
      order.montantUsd
        ? String(order.montantUsd)
        : rate && order.montantCdf
          ? String((order.montantCdf / rate).toFixed(2))
          : '',
      String(order.montantCdf),
      statutLabel(order.statut),
      order.date,
    ])

    downloadCsv(
      [headers, ...rows],
      `dashboard-commandes-${new Date().toISOString().slice(0, 10)}.csv`
    )

    toast.addToast({
      type: 'success',
      message: 'Export CSV réalisé.',
    })
  }, [filteredOrders, rate, toast])

  /* ---------------------------------------------------------- */
  /* Loading / error initial                                     */
  /* ---------------------------------------------------------- */

  if (statsQuery.isLoading && !statsQuery.data) {
    return <DashboardSkeleton />
  }

  if (statsQuery.isError && !statsQuery.data) {
    return (
      <Container className="py-16">
        <Card className="border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <AlertCircle size={48} className="text-red-500" />
            <div>
              <h1 className="text-xl font-bold text-red-700 dark:text-red-300">
                Impossible de charger le tableau de bord
              </h1>
              <p className="mt-2 text-sm text-red-700/80 dark:text-red-300/80">
                {statsQuery.error instanceof Error
                  ? statsQuery.error.message
                  : 'Erreur de récupération des statistiques admin.'}
              </p>
            </div>
            <Button variant="outline-gold" onClick={() => statsQuery.refetch()}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </Container>
    )
  }

  /* ---------------------------------------------------------- */
  /* Render                                                      */
  /* ---------------------------------------------------------- */

  return (
    <div className="relative min-h-screen bg-background pb-16">
      <div className="pattern-dots pointer-events-none absolute inset-0 opacity-5 dark:opacity-10" />

      <Container className="relative z-10 py-8 md:py-10">
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-extrabold text-foreground font-serif md:text-4xl">
                <ShieldCheck size={30} className="text-gold-500" />
                Tableau de bord
              </h1>
              <p className="mt-2 text-muted-foreground">
                Supervision temps réel de l’activité marketplace.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant="gold" size="sm">
                  {formatNumber(stats.totalCommandes)} commandes
                </Badge>

                <Badge variant="accent" size="sm">
                  {formatUsd(stats.caUsd)} CA
                </Badge>

                {pendingPaymentsCount > 0 && (
                  <Badge variant="warm" size="sm">
                    {pendingPaymentsCount} paiement
                    {pendingPaymentsCount > 1 ? 's' : ''} en attente
                  </Badge>
                )}

                {stats.litigesOuverts > 0 && (
                  <Badge variant="danger" size="sm">
                    {stats.litigesOuverts} litige
                    {stats.litigesOuverts > 1 ? 's' : ''}
                  </Badge>
                )}

                {isRefreshing && (
                  <Badge variant="neutral" size="sm">
                    <RefreshCw size={12} className="mr-1 animate-spin" />
                    Synchronisation
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5 text-xs">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPeriod(option.value)}
                    className={cn(
                      'rounded-full px-3 py-1.5 font-medium transition',
                      period === option.value
                        ? 'bg-gold-500 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <Tooltip content="Actualisation automatique toutes les 30 secondes">
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
                  aria-label="Activer la rafraîchissement automatique"
                >
                  <RotateCw
                    size={16}
                    className={autoRefresh ? 'animate-spin' : ''}
                  />
                </button>
              </Tooltip>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                leftIcon={
                  isRefreshing ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )
                }
              >
                Actualiser
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                leftIcon={<Download size={14} />}
              >
                CSV
              </Button>

              <Link href="/admin/commandes">
                <Button variant="luxe" size="sm" leftIcon={<ShoppingBag size={14} />}>
                  Commandes
                </Button>
              </Link>
            </div>
          </div>

          {/* Offline banner */}
          <AnimatePresence>
            {!online && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
              >
                <AlertTriangle size={18} className="shrink-0" />
                <p>
                  Vous êtes hors ligne. Les données affichées peuvent être
                  obsolètes.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Rate banner */}
          <AnimatePresence>
            {rateMissing && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Taux USD/CDF non défini</p>
                    <p className="mt-1 text-xs opacity-90">
                      Les conversions secondaires ne peuvent pas être calculées
                      correctement.
                    </p>
                  </div>
                </div>

                <Link href="/admin/exchange-rate">
                  <Button variant="outline" size="sm">
                    Configurer le taux
                  </Button>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Alerts */}
          <div className="space-y-4">
            <AnimatePresence>
              {pendingPaymentsCount > 0 && (
                <AlertCard
                  title={`${pendingPaymentsCount} paiement${pendingPaymentsCount > 1 ? 's' : ''} en attente`}
                  description="Vérifie les transactions reçues et valide les commandes correspondantes."
                  icon={<Receipt size={20} />}
                  href="/admin/transactions?status=pending"
                  actionLabel="Traiter"
                  tone="warm"
                />
              )}

              {stats.litigesOuverts > 0 && (
                <AlertCard
                  title={`${stats.litigesOuverts} litige${stats.litigesOuverts > 1 ? 's' : ''} ouvert${stats.litigesOuverts > 1 ? 's' : ''}`}
                  description="Des réclamations clients attendent une décision administrative."
                  icon={<AlertTriangle size={20} />}
                  href="/admin/litiges"
                  actionLabel="Résoudre"
                  tone="danger"
                  delay={0.05}
                />
              )}

              {stats.rupturesStock > 0 && (
                <AlertCard
                  title={`${stats.rupturesStock} rupture${stats.rupturesStock > 1 ? 's' : ''} de stock`}
                  description="Certains produits actifs n’ont plus d’unité disponible."
                  icon={<Package size={20} />}
                  href="/admin/produits?stock=rupture"
                  actionLabel="Réapprovisionner"
                  tone="warm"
                  delay={0.1}
                />
              )}

              {stats.commandesEnAttente > 0 && (
                <AlertCard
                  title={`${stats.commandesEnAttente} commande${stats.commandesEnAttente > 1 ? 's' : ''} en attente`}
                  description="Des commandes doivent être collectées, préparées ou affectées à un livreur."
                  icon={<Clock size={20} />}
                  href="/admin/commandes?statut=en_attente"
                  actionLabel="Voir"
                  tone="accent"
                  delay={0.15}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Main KPIs */}
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {mainKpis.map((kpi, index) => (
              <motion.div
                key={kpi.label}
                initial={prefersReduced ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={kpi.href} className="block">
                  <Card className="border-gold-400/20 bg-card/70 shadow-soft transition hover:-translate-y-1 hover:shadow-gold">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {kpi.label}
                          </p>

                          <p className="mt-2 truncate text-3xl font-extrabold text-foreground">
                            {kpi.value}
                          </p>

                          {kpi.sub && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {kpi.sub}
                            </p>
                          )}
                        </div>

                        <div
                          className={cn(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
                            TONE_CLASSES[kpi.tone]
                          )}
                        >
                          {kpi.icon}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {secondaryKpis.map((kpi, index) => (
              <motion.div
                key={kpi.label}
                initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.03 }}
              >
                <Link href={kpi.href} className="block">
                  <div className="flex h-full items-center gap-3 rounded-2xl border border-border bg-card/70 p-4 transition hover:border-gold-400/40 hover:shadow-card">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        TONE_CLASSES[kpi.tone]
                      )}
                    >
                      {kpi.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-muted-foreground">
                        {kpi.label}
                      </p>
                      <p className="truncate text-sm font-bold text-foreground">
                        {kpi.value}
                      </p>
                      {kpi.sub && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {kpi.sub}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Insights */}
          <Card className="border-gold-400/20 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info size={18} className="text-gold-500" />
                Lecture rapide
              </CardTitle>
              <CardDescription>
                Synthèse automatique des signaux importants de la période.
              </CardDescription>
            </CardHeader>

            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MiniStatRow
                label="Activité commandes"
                value={`${formatNumber(stats.commandesDuJour)} aujourd’hui`}
                sub={`${formatNumber(stats.totalCommandes)} total`}
                icon={<ShoppingBag size={16} />}
              />

              <MiniStatRow
                label="Santé financière"
                value={formatUsd(stats.caUsd)}
                sub={rate ? `≈ ${formatFc(stats.caCdf)}` : 'Taux manquant'}
                icon={<DollarSign size={16} />}
              />

              <MiniStatRow
                label="Risque opérationnel"
                value={`${formatNumber(pendingPaymentsCount + stats.litigesOuverts)} alertes`}
                sub="paiements + litiges"
                icon={<AlertTriangle size={16} />}
              />

              <MiniStatRow
                label="Catalogue"
                value={`${formatNumber(stats.produitsActifs)} actifs`}
                sub={`${formatNumber(stats.rupturesStock)} ruptures`}
                icon={<Package size={16} />}
              />
            </CardContent>
          </Card>

          {/* Charts row 1 */}
          <div className="grid gap-8 lg:grid-cols-2">
            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChartIcon size={18} className="text-gold-500" />
                  Répartition des commandes
                </CardTitle>
                <CardDescription>
                  Volume par statut sur la période sélectionnée.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={barData}
                      margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                    >
                      <defs>
                        {CHART_COLORS.map((color, idx) => (
                          <linearGradient
                            key={idx}
                            id={`dashboardBarGrad_${idx}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.3} />
                          </linearGradient>
                        ))}
                      </defs>

                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(201,169,98,0.15)"
                      />

                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#a8a49b' }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <YAxis
                        tick={{ fontSize: 11, fill: '#a8a49b' }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <RechartsTooltip
                        cursor={{ fill: 'rgba(201,169,98,0.08)' }}
                        contentStyle={{
                          backgroundColor: 'rgba(255,255,255,0.92)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(201,169,98,0.3)',
                          borderRadius: '16px',
                        }}
                      />

                      <Bar
                        dataKey="value"
                        radius={[8, 8, 0, 0]}
                        animationBegin={200}
                        animationDuration={1200}
                      >
                        {barData.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={`url(#dashboardBarGrad_${idx % CHART_COLORS.length})`}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 text-sm text-muted-foreground">
                    Aucune donnée de répartition disponible.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp size={18} className="text-gold-500" />
                  Évolution du chiffre d’affaires
                </CardTitle>
                <CardDescription>
                  CA et volume de commandes sur la période.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {evolutionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart
                      data={evolutionData}
                      margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="dashboardSalesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4766f7" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#4766f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(201,169,98,0.15)"
                      />

                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#a8a49b' }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11, fill: '#a8a49b' }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#a8a49b' }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255,255,255,0.92)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(201,169,98,0.3)',
                          borderRadius: '16px',
                        }}
                      />

                      <Legend />

                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="montant"
                        name="CA (FC)"
                        stroke="#4766f7"
                        fill="url(#dashboardSalesGrad)"
                        strokeWidth={2}
                      />

                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="commandes"
                        name="Commandes"
                        stroke="#f6cf2a"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 text-sm text-muted-foreground">
                    Aucune donnée d’évolution disponible.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts row 2 */}
          <div className="grid gap-8 lg:grid-cols-2">
            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChartIcon size={18} className="text-gold-500" />
                  Ventes par catégorie
                </CardTitle>
                <CardDescription>
                  Répartition du volume par famille de produits.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={55}
                        paddingAngle={4}
                        label={(entry: any) =>
                          `${entry.name} (${((entry.percent || 0) * 100).toFixed(0)}%)`
                        }
                      >
                        {pieData.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>

                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255,255,255,0.92)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(201,169,98,0.3)',
                          borderRadius: '16px',
                        }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 text-sm text-muted-foreground">
                    Aucune donnée de catégorie disponible.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart2 size={18} className="text-gold-500" />
                  Top produits – ventes
                </CardTitle>
                <CardDescription>
                  Meilleures ventes de la période.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {topSoldProducts.length > 0 ? (
                  <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
                    {topSoldProducts.map((product, idx) => {
                      const displayUsd =
                        product.prixUsd ??
                        (rate && product.prixCdf
                          ? product.prixCdf / rate
                          : null)

                      const displayCdf =
                        product.prixCdf ??
                        (rate && displayUsd ? displayUsd * rate : null)

                      return (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3"
                        >
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                              idx < 3
                                ? 'bg-gold-500/15 text-gold-600'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {idx + 1}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {product.nom}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(product.ventes)} vendus ·{' '}
                              {formatNumber(product.vues)} vues
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-gold-600">
                              {formatUsd(displayUsd)}
                            </p>
                            {displayCdf && (
                              <p className="text-[11px] text-muted-foreground">
                                ≈ {formatFc(displayCdf)}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 text-sm text-muted-foreground">
                    Aucun top produit disponible.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent orders + sidebar */}
          <div className="grid gap-8 lg:grid-cols-3">
            <Card className="border-gold-400/20 bg-card/70 lg:col-span-2">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock size={18} className="text-gold-500" />
                    Dernières commandes
                  </CardTitle>
                  <CardDescription>
                    {filteredOrders.length} commande
                    {filteredOrders.length > 1 ? 's' : ''} affichée
                    {filteredOrders.length > 1 ? 's' : ''}
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />

                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher..."
                      className="w-48 rounded-xl border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                    />

                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground transition hover:text-foreground"
                        aria-label="Effacer la recherche"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition',
                        viewMode === 'table'
                          ? 'bg-gold-500 text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      aria-pressed={viewMode === 'table'}
                    >
                      <List size={14} />
                      Table
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewMode('cards')}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition',
                        viewMode === 'cards'
                          ? 'bg-gold-500 text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      aria-pressed={viewMode === 'cards'}
                    >
                      <Grid size={14} />
                      Cartes
                    </button>
                  </div>

                  <Link href="/admin/commandes">
                    <Button variant="ghost" size="sm" rightIcon={<ChevronRight size={14} />}>
                      Tout voir
                    </Button>
                  </Link>
                </div>
              </CardHeader>

              <CardContent>
                {recentOrdersQuery.isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShoppingBag size={36} className="mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      Aucune commande récente
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {search
                        ? 'Aucun résultat avec cette recherche.'
                        : 'Les nouvelles commandes apparaîtront ici.'}
                    </p>
                  </div>
                ) : viewMode === 'table' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border text-left text-xs font-semibold uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-3">Commande</th>
                          <th className="px-3 py-3">Client</th>
                          <th className="px-3 py-3">Montant</th>
                          <th className="px-3 py-3">Statut</th>
                          <th className="px-3 py-3">Date</th>
                          <th className="px-3 py-3 text-right">Actions</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-border">
                        <AnimatePresence initial={false}>
                          {filteredOrders.map((order) => {
                            const orderUsd =
                              order.montantUsd ??
                              (rate && order.montantCdf
                                ? order.montantCdf / rate
                                : null)

                            const orderCdf =
                              order.montantCdf ??
                              (rate && orderUsd ? orderUsd * rate : null)

                            return (
                              <motion.tr
                                key={order.id}
                                initial={prefersReduced ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="transition hover:bg-muted/30"
                              >
                                <td className="px-3 py-3">
                                  <p className="font-mono text-xs font-semibold text-foreground">
                                    #{order.numero}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    {order.id.slice(0, 8)}...
                                  </p>
                                </td>

                                <td className="px-3 py-3">
                                  <p className="max-w-[160px] truncate font-medium text-foreground">
                                    {order.client}
                                  </p>
                                  {order.email && (
                                    <p className="max-w-[160px] truncate text-xs text-muted-foreground">
                                      {order.email}
                                    </p>
                                  )}
                                </td>

                                <td className="px-3 py-3">
                                  <p className="font-semibold text-gold-600">
                                    {formatUsd(orderUsd)}
                                  </p>
                                  {orderCdf && (
                                    <p className="text-xs text-muted-foreground">
                                      ≈ {formatFc(orderCdf)}
                                    </p>
                                  )}
                                </td>

                                <td className="px-3 py-3">
                                  <Badge
                                    variant={statutVariant(order.statut)}
                                    size="sm"
                                  >
                                    {statutLabel(order.statut)}
                                  </Badge>
                                </td>

                                <td className="px-3 py-3">
                                  <p className="whitespace-nowrap text-xs text-muted-foreground">
                                    {formatDateShort(order.date)}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground/80">
                                    {formatRelative(order.date)}
                                  </p>
                                </td>

                                <td className="px-3 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <Tooltip content="Copier l’ID">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() =>
                                          handleCopy(order.id, `order-${order.id}`)
                                        }
                                        aria-label="Copier l’ID de la commande"
                                      >
                                        {copiedId === `order-${order.id}` ? (
                                          <Check size={14} className="text-green-500" />
                                        ) : (
                                          <Eye size={14} />
                                        )}
                                      </Button>
                                    </Tooltip>

                                    <Tooltip content="Ouvrir la commande">
                                      <Link href={`/admin/commandes/${order.id}`}>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          aria-label="Ouvrir la commande"
                                        >
                                          <ExternalLink size={14} />
                                        </Button>
                                      </Link>
                                    </Tooltip>
                                  </div>
                                </td>
                              </motion.tr>
                            )
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <AnimatePresence initial={false}>
                      {filteredOrders.map((order) => {
                        const orderUsd =
                          order.montantUsd ??
                          (rate && order.montantCdf
                            ? order.montantCdf / rate
                            : null)

                        const orderCdf =
                          order.montantCdf ??
                          (rate && orderUsd ? orderUsd * rate : null)

                        return (
                          <motion.div
                            key={order.id}
                            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="rounded-2xl border border-border bg-background/50 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-xs font-semibold text-foreground">
                                  #{order.numero}
                                </p>
                                <p className="mt-1 truncate text-sm font-medium text-foreground">
                                  {order.client}
                                </p>
                              </div>

                              <Badge
                                variant={statutVariant(order.statut)}
                                size="sm"
                              >
                                {statutLabel(order.statut)}
                              </Badge>
                            </div>

                            <div className="mt-4 flex items-end justify-between gap-3">
                              <div>
                                <p className="text-lg font-bold text-gold-600">
                                  {formatUsd(orderUsd)}
                                </p>
                                {orderCdf && (
                                  <p className="text-xs text-muted-foreground">
                                    ≈ {formatFc(orderCdf)}
                                  </p>
                                )}
                              </div>

                              <p className="text-xs text-muted-foreground">
                                {formatRelative(order.date)}
                              </p>
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                              <Link
                                href={`/admin/commandes/${order.id}`}
                                className="flex-1"
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  fullWidth
                                  leftIcon={<ExternalLink size={14} />}
                                >
                                  Ouvrir
                                </Button>
                              </Link>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleCopy(order.id, `card-${order.id}`)
                                }
                              >
                                {copiedId === `card-${order.id}` ? (
                                  <Check size={14} className="text-green-500" />
                                ) : (
                                  <Eye size={14} />
                                )}
                              </Button>
                            </div>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right column */}
            <div className="space-y-6">
              <Card className="border-gold-400/20 bg-card/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Landmark size={18} className="text-gold-500" />
                    Accès rapides
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-1">
                  {[
                    {
                      href: '/admin/produits/ajouter',
                      label: 'Ajouter un produit',
                      icon: <Package size={16} />,
                    },
                    {
                      href: '/admin/produits',
                      label: 'Gérer les produits',
                      icon: <Layers size={16} />,
                    },
                    {
                      href: '/admin/commandes',
                      label: 'Gérer les commandes',
                      icon: <ShoppingBag size={16} />,
                    },
                    {
                      href: '/admin/transactions',
                      label: 'Transactions',
                      icon: <Receipt size={16} />,
                    },
                    {
                      href: '/admin/paiements',
                      label: 'Moyens de paiement',
                      icon: <Landmark size={16} />,
                    },
                    {
                      href: '/admin/exchange-rate',
                      label: 'Taux de change',
                      icon: <ArrowLeftRight size={16} />,
                    },
                    {
                      href: '/admin/codes',
                      label: 'Codes promo',
                      icon: <Gift size={16} />,
                    },
                    {
                      href: '/admin/livraison',
                      label: 'Livraison',
                      icon: <Truck size={16} />,
                    },
                    {
                      href: '/admin/utilisateurs',
                      label: 'Utilisateurs',
                      icon: <Users size={16} />,
                    },
                    {
                      href: '/admin/settings',
                      label: 'Paramètres',
                      icon: <Settings size={16} />,
                    },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition hover:bg-gold-400/10 hover:text-gold-600"
                    >
                      <span className="text-gold-500">{item.icon}</span>
                      <span className="flex-1 truncate">{item.label}</span>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </Link>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-gold-400/20 bg-card/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Layers size={18} className="text-gold-500" />
                    Top catégories
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-2">
                  {topCategories.length > 0 ? (
                    topCategories.slice(0, 6).map((cat, idx) => (
                      <div
                        key={cat.name}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                              idx < 3
                                ? 'bg-gold-500/15 text-gold-600'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {idx + 1}
                          </span>

                          <p className="truncate text-sm font-medium text-foreground">
                            {cat.name}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-gold-600">
                            {formatNumber(cat.ventes)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatNumber(cat.produits)} produits
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Aucune donnée de catégorie.
                    </p>
                  )}
                </CardContent>
              </Card>

              {systemStatus && (
                <Card className="border-gold-400/20 bg-card/70">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity size={18} className="text-gold-500" />
                      Statut système
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-2 text-xs">
                    <MiniStatRow
                      label="Dernière sauvegarde"
                      value={formatDate(systemStatus.lastBackup)}
                      icon={<Clock size={14} />}
                    />

                    <MiniStatRow
                      label="Espace disque"
                      value={`${systemStatus.diskSpace}% libre`}
                      icon={<Package size={14} />}
                    />

                    <MiniStatRow
                      label="Connexions actives"
                      value={formatNumber(systemStatus.activeConnections)}
                      icon={<Users size={14} />}
                    />

                    <MiniStatRow
                      label="Disponibilité"
                      value={systemStatus.uptime}
                      icon={<ShieldCheck size={14} />}
                    />

                    {systemStatus.databaseSize && (
                      <MiniStatRow
                        label="Base de données"
                        value={systemStatus.databaseSize}
                        icon={<Layers size={14} />}
                      />
                    )}

                    {systemStatus.apiLatency && (
                      <MiniStatRow
                        label="Latence API"
                        value={systemStatus.apiLatency}
                        icon={<Zap size={14} />}
                      />
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Bottom row */}
          <div className="grid gap-8 lg:grid-cols-2">
            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserPlus size={18} className="text-gold-500" />
                  Derniers utilisateurs inscrits
                </CardTitle>
                <CardDescription>
                  Nouveaux comptes créés récemment.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {recentUsers.length > 0 ? (
                  <div className="space-y-2">
                    {recentUsers.map((user) => {
                      const name = [user.prenom, user.nom]
                        .filter(Boolean)
                        .join(' ')
                        .trim()

                      return (
                        <div
                          key={user.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-xs font-bold text-gold-600">
                              {(name || user.email)
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {name || user.email}
                              </p>
                              {name && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {user.email}
                                </p>
                              )}
                            </div>
                          </div>

                          <p className="shrink-0 text-xs text-muted-foreground">
                            {formatRelative(user.date)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Aucun utilisateur récent.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Eye size={18} className="text-gold-500" />
                  Produits les plus consultés
                </CardTitle>
                <CardDescription>
                  Visites produit sur la période.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {topViewedProducts.length > 0 ? (
                  <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                    {topViewedProducts.map((product, idx) => {
                      const displayUsd =
                        product.prixUsd ??
                        (rate && product.prixCdf
                          ? product.prixCdf / rate
                          : null)

                      return (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3"
                        >
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                              idx < 3
                                ? 'bg-gold-500/15 text-gold-600'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {idx + 1}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {product.nom}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(product.vues)} vues ·{' '}
                              {formatNumber(product.ventes)} ventes
                            </p>
                          </div>

                          <p className="shrink-0 text-sm font-semibold text-gold-600">
                            {formatUsd(displayUsd)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Aucune donnée de consultation.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </Container>
    </div>
  )
}