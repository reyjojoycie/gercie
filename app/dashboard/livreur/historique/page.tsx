// app/dashboard/livreur/historique/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'
import { useInfiniteQuery } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'

import { cn } from '@/lib/utils'

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Filter,
  History,
  ImageOff,
  MapPin,
  Navigation,
  Package,
  RefreshCw,
  Search,
  TrendingUp,
  Truck,
  User,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type SortBy = 'date' | 'statut' | 'commune'
type SortOrder = 'asc' | 'desc'
type StatusVariant = 'accent' | 'danger' | 'warm' | 'neutral' | 'gold'

interface FiltersState {
  statut: string
  date_debut: string
  date_fin: string
  sort_by: SortBy
  sort_order: SortOrder
}

interface Livraison {
  id: string
  commande_id: string
  numero_commande: string
  type_livraison: string
  adresse: string
  point_retrait_nom: string | null
  commune: string
  statut: string
  date_acceptation: string | null
  date_recuperation: string | null
  date_livraison: string | null
  photo_colis: string | null
  photo_livraison: string | null
  client?: {
    nom: string
    prenom: string
  }
}

interface PaginationState {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface LivraisonPage {
  data: Livraison[]
  pagination: PaginationState
}

interface StatusMeta {
  key: string
  label: string
  variant: StatusVariant
  icon?: ReactNode
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PAGE_SIZE = 10
const AUTO_REFRESH_INTERVAL_MS = 30_000
const SEARCH_DEBOUNCE_MS = 350

const DEFAULT_FILTERS: FiltersState = {
  statut: '',
  date_debut: '',
  date_fin: '',
  sort_by: 'date',
  sort_order: 'desc',
}

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

const STATUS_CONFIG: Record<string, Omit<StatusMeta, 'key'>> = {
  en_attente: {
    label: 'En attente',
    variant: 'neutral',
    icon: <Clock size={12} />,
  },
  acceptee: {
    label: 'Acceptée',
    variant: 'warm',
    icon: <CheckCircle size={12} />,
  },
  en_route: {
    label: 'En route',
    variant: 'gold',
    icon: <Truck size={12} />,
  },
  colis_recupere: {
    label: 'Colis récupéré',
    variant: 'gold',
    icon: <Package size={12} />,
  },
  livree: {
    label: 'Livrée',
    variant: 'accent',
    icon: <CheckCircle size={12} />,
  },
  annulee: {
    label: 'Annulée',
    variant: 'danger',
    icon: <XCircle size={12} />,
  },
}

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'date-desc', label: 'Plus récentes' },
  { value: 'date-asc', label: 'Plus anciennes' },
  { value: 'statut-asc', label: 'Statut A → Z' },
  { value: 'statut-desc', label: 'Statut Z → A' },
  { value: 'commune-asc', label: 'Commune A → Z' },
  { value: 'commune-desc', label: 'Commune Z → A' },
]

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

function toSafeNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
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

function humanizeStatus(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function resolveStatus(statut: string): StatusMeta {
  const key = normalizeStatus(statut)
  const config = STATUS_CONFIG[key]

  if (config) {
    return {
      key,
      ...config,
    }
  }

  return {
    key,
    label: humanizeStatus(key),
    variant: 'neutral',
  }
}

function isCompletedStatus(statut: string): boolean {
  return normalizeStatus(statut) === 'livree'
}

function isCancelledStatus(statut: string): boolean {
  return normalizeStatus(statut) === 'annulee'
}

function isActiveStatus(statut: string): boolean {
  const key = normalizeStatus(statut)
  return ['acceptee', 'en_route', 'colis_recupere'].includes(key)
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

function buildMapsUrl(adresse?: string | null, commune?: string | null): string | null {
  const query = [adresse, commune].filter(Boolean).join(', ').trim()
  if (!query) return null

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
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

function normalizeLivraison(raw: any, index = 0): Livraison {
  const id = String(
    raw?.id ||
      raw?.livraison_id ||
      raw?.commande_id ||
      raw?.order_id ||
      `livraison-${index}`
  )

  const commandeId = String(
    raw?.commande_id || raw?.order_id || raw?.id || id
  )

  const numeroCommande = String(
    raw?.numero_commande ||
      raw?.order_number ||
      raw?.numero ||
      commandeId.slice(-8)
  )

  const clientNom = textOrNull(
    raw?.client?.nom ||
      raw?.client_nom ||
      raw?.acheteur_nom ||
      raw?.customer_last_name
  )

  const clientPrenom = textOrNull(
    raw?.client?.prenom ||
      raw?.client_prenom ||
      raw?.acheteur_prenom ||
      raw?.customer_first_name
  )

  return {
    id,
    commande_id: commandeId,
    numero_commande: numeroCommande,
    type_livraison: String(
      raw?.type_livraison || raw?.delivery_type || 'domicile'
    ).toLowerCase(),
    adresse:
      textOrNull(
        raw?.adresse ||
          raw?.adresse_livraison ||
          raw?.address ||
          raw?.livraison_adresse ||
          raw?.adresse_complete
      ) || '',
    point_retrait_nom: textOrNull(
      raw?.point_retrait_nom ||
        raw?.pickup_point_name ||
        raw?.point_retrait?.nom
    ),
    commune:
      textOrNull(raw?.commune || raw?.ville || raw?.zone) || '',
    statut: normalizeStatus(raw?.statut || raw?.status),
    date_acceptation: textOrNull(
      raw?.date_acceptation || raw?.accepted_at || raw?.assigned_at
    ),
    date_recuperation: textOrNull(
      raw?.date_recuperation || raw?.picked_up_at || raw?.collecte_at
    ),
    date_livraison: textOrNull(
      raw?.date_livraison || raw?.delivered_at || raw?.completed_at
    ),
    photo_colis: textOrNull(
      raw?.photo_colis || raw?.package_photo || raw?.pickup_photo
    ),
    photo_livraison: textOrNull(
      raw?.photo_livraison || raw?.delivery_proof || raw?.delivery_photo
    ),
    client:
      clientNom || clientPrenom
        ? {
            nom: clientNom || '',
            prenom: clientPrenom || '',
          }
        : undefined,
  }
}

function normalizeResponse(
  payload: any,
  page: number,
  limit: number
): LivraisonPage {
  const arr = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.livraisons)
        ? payload.livraisons
        : Array.isArray(payload?.items)
          ? payload.items
          : []

  const data = arr.map((item, index) => normalizeLivraison(item, index))

  const total = toSafeNumber(
    payload?.pagination?.total ??
      payload?.total ??
      payload?.count ??
      data.length,
    data.length
  )

  const calculatedTotalPages = Math.max(
    1,
    Math.ceil(total / Math.max(1, limit))
  )

  const pagination: PaginationState = {
    page: toSafeNumber(
      payload?.pagination?.page ?? payload?.page ?? page,
      page
    ),
    limit: toSafeNumber(
      payload?.pagination?.limit ?? payload?.limit ?? limit,
      limit
    ),
    total,
    totalPages: toSafeNumber(
      payload?.pagination?.totalPages ??
        payload?.totalPages ??
        calculatedTotalPages,
      calculatedTotalPages
    ),
  }

  return {
    data,
    pagination,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function LivreurHistoriquePage() {
  const auth = useAuth() as any
  const user = auth?.user
  const authLoading = Boolean(auth?.loading)

  const toast = useToast()
  const prefersReduced = useReducedMotion()

  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [detailLivraison, setDetailLivraison] = useState<Livraison | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [online, setOnline] = useState(true)

  /* ---------------------------------------------------------- */
  /* Titre de page                                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Historique des courses | Gercie'
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Debounce recherche                                          */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [searchInput])

  /* ---------------------------------------------------------- */
  /* Statut connexion                                            */
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

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useInfiniteQuery<LivraisonPage>({
    queryKey: ['livreur-historique', filters, debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams()

      if (filters.statut) params.set('statut', filters.statut)
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filters.date_debut) params.set('date_debut', filters.date_debut)
      if (filters.date_fin) params.set('date_fin', filters.date_fin)

      params.set('sort_by', filters.sort_by)
      params.set('sort_order', filters.sort_order)
      params.set('page', String(pageParam))
      params.set('limit', String(PAGE_SIZE))

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

      return normalizeResponse(json, Number(pageParam), PAGE_SIZE)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination
      return page < totalPages ? page + 1 : undefined
    },
    enabled: Boolean(user && !authLoading),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
    retry: 1,
  })

  /* ---------------------------------------------------------- */
  /* Auto refresh                                                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      refetch()
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [autoRefresh, refetch])

  /* ---------------------------------------------------------- */
  /* Derived data                                                */
  /* ---------------------------------------------------------- */

  const livraisons = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data]
  )

  const pagination = data?.pages[0]?.pagination

  const totalCourses = pagination?.total ?? livraisons.length

  const stats = useMemo(() => {
    const completed = livraisons.filter((l) => isCompletedStatus(l.statut)).length
    const cancelled = livraisons.filter((l) => isCancelledStatus(l.statut)).length
    const active = livraisons.filter((l) => isActiveStatus(l.statut)).length

    const denominator = completed + cancelled
    const successRate =
      denominator > 0 ? (completed / denominator) * 100 : null

    return {
      completed,
      cancelled,
      active,
      successRate,
    }
  }, [livraisons])

  const activeFiltersCount = useMemo(() => {
    let count = 0

    if (filters.statut) count += 1
    if (debouncedSearch) count += 1
    if (filters.date_debut) count += 1
    if (filters.date_fin) count += 1

    return count
  }, [debouncedSearch, filters])

  const hasActiveFilters = activeFiltersCount > 0

  const errorMessage =
    error instanceof Error ? error.message : 'Erreur inconnue.'

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const updateFilter = useCallback(
    <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
      setFilters((prev) => ({
        ...prev,
        [key]: value,
      }))
    },
    []
  )

  const updateSort = useCallback((value: string) => {
    const [sort_by, sort_order] = value.split('-') as [SortBy, SortOrder]
    setFilters((prev) => ({
      ...prev,
      sort_by,
      sort_order,
    }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setSearchInput('')
    setDebouncedSearch('')
    setShowFilters(false)
  }, [])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }, [])

  const handleCopy = useCallback(
    async (text: string) => {
      const ok = await copyText(text)

      if (ok) {
        setCopiedId(text)
        notify(toast, 'success', 'Numéro copié.')
        setTimeout(() => setCopiedId(null), 2000)
      } else {
        notify(toast, 'error', 'Copie impossible.')
      }
    },
    [toast]
  )

  const handleExportCsv = useCallback(() => {
    if (livraisons.length === 0) {
      notify(toast, 'warning', 'Aucune course à exporter.')
      return
    }

    const headers = [
      'Commande',
      'Statut',
      'Type',
      'Commune',
      'Adresse',
      'Point retrait',
      'Client',
      'Acceptée le',
      'Récupérée le',
      'Livrée le',
    ]

    const rows = livraisons.map((livraison) => {
      const status = resolveStatus(livraison.statut)
      const clientName = livraison.client
        ? `${livraison.client.prenom} ${livraison.client.nom}`.trim()
        : ''

      return [
        livraison.numero_commande,
        status.label,
        deliveryTypeLabel(livraison.type_livraison),
        livraison.commune || '',
        livraison.adresse || '',
        livraison.point_retrait_nom || '',
        clientName,
        livraison.date_acceptation || '',
        livraison.date_recuperation || '',
        livraison.date_livraison || '',
      ]
    })

    downloadCsv(
      [headers, ...rows],
      `historique-livraisons-${new Date().toISOString().slice(0, 10)}.csv`
    )

    notify(toast, 'success', 'Export CSV réalisé.')
  }, [livraisons, toast])

  const handleToggleAutoRefresh = useCallback(() => {
    setAutoRefresh((prev) => !prev)
  }, [])

  /* ---------------------------------------------------------- */
  /* Render guards                                               */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="xl" variant="premium" label="Chargement..." />
          <p className="text-sm text-muted-foreground">
            Préparation de votre historique...
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
                Tu dois être connecté pour consulter ton historique de courses.
              </p>
            </div>
            <Link
              href={`/login?redirect=${encodeURIComponent('/dashboard/livreur/historique')}`}
            >
              <Button variant="luxe">Se connecter</Button>
            </Link>
          </CardContent>
        </Card>
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
          <Link
            href="/dashboard/livreur"
            className="rounded-xl p-2 text-neutral-400 transition hover:bg-gold-400/10 hover:text-gold-500"
            aria-label="Retour au tableau de bord"
          >
            <ArrowLeft size={20} />
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              <History size={22} className="text-gold-500" />
              Historique des courses
            </h1>
            <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
              {formatNumber(totalCourses)} course(s) enregistrée(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tooltip
              content={
                autoRefresh
                  ? 'Désactiver l’actualisation automatique'
                  : 'Activer l’actualisation automatique'
              }
            >
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
                <RefreshCw
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
                disabled={livraisons.length === 0}
                leftIcon={<Download size={14} />}
              >
                Export
              </Button>
            </Tooltip>

            <Tooltip content="Actualiser">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => refetch()}
                loading={isFetching}
                leftIcon={<RefreshCw size={14} />}
              >
                Actualiser
              </Button>
            </Tooltip>

            <Button
              variant={showFilters ? 'luxe' : 'outline-gold'}
              size="sm"
              onClick={() => setShowFilters((prev) => !prev)}
              leftIcon={<Filter size={14} />}
              rightIcon={
                hasActiveFilters ? (
                  <Badge variant="gold" size="sm">
                    {activeFiltersCount}
                  </Badge>
                ) : undefined
              }
            >
              Filtres
            </Button>
          </div>
        </Container>
      </div>

      <Container className="relative z-10 py-6">
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
                Vous êtes hors ligne. Les données affichées peuvent être
                obsolètes.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Syncing banner */}
        <AnimatePresence>
          {isFetching && Boolean(data) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 flex items-center gap-3 rounded-2xl border border-gold-400/20 bg-gold-500/5 p-3 text-sm text-muted-foreground"
            >
              <RefreshCw size={14} className="animate-spin" />
              Synchronisation de l’historique...
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error banner if data exists but refresh failed */}
        <AnimatePresence>
          {isError && Boolean(data) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
            >
              <AlertTriangle size={18} className="shrink-0" />
              <p>Impossible de rafraîchir l’historique : {errorMessage}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="border-gold-400/20 bg-card/70">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/10 text-gold-600 dark:text-gold-400">
                <History size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase text-muted-foreground">
                  Cours
                </p>
                <p className="truncate text-lg font-bold text-foreground">
                  {formatNumber(totalCourses)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gold-400/20 bg-card/70">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Truck size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase text-muted-foreground">
                  Actives
                </p>
                <p className="truncate text-lg font-bold text-foreground">
                  {formatNumber(stats.active)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gold-400/20 bg-card/70">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase text-muted-foreground">
                  Livrées
                </p>
                <p className="truncate text-lg font-bold text-foreground">
                  {formatNumber(stats.completed)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gold-400/20 bg-card/70">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                <XCircle size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase text-muted-foreground">
                  Annulées
                </p>
                <p className="truncate text-lg font-bold text-foreground">
                  {formatNumber(stats.cancelled)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gold-400/20 bg-card/70">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <TrendingUp size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase text-muted-foreground">
                  Réussite
                </p>
                <p className="truncate text-lg font-bold text-foreground">
                  {stats.successRate === null
                    ? '—'
                    : `${formatDecimal(stats.successRate, 0)} %`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden rounded-3xl border border-gold-400/20 bg-card/70 shadow-soft"
            >
              <div className="p-4">
                <div className="grid gap-4 lg:grid-cols-12">
                  <div className="relative lg:col-span-4">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />

                    <input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Rechercher un numéro de commande..."
                      className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                    />

                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => setSearchInput('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                        aria-label="Effacer la recherche"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Statut
                    </label>

                    <select
                      value={filters.statut}
                      onChange={(e) => updateFilter('statut', e.target.value)}
                      className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                    >
                      <option value="">Tous</option>

                      {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                        <option key={key} value={key}>
                          {config.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Tri
                    </label>

                    <select
                      value={`${filters.sort_by}-${filters.sort_order}`}
                      onChange={(e) => updateSort(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Date début
                    </label>

                    <input
                      type="date"
                      value={filters.date_debut}
                      onChange={(e) =>
                        updateFilter('date_debut', e.target.value)
                      }
                      className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Date fin
                    </label>

                    <input
                      type="date"
                      value={filters.date_fin}
                      onChange={(e) => updateFilter('date_fin', e.target.value)}
                      className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                    />
                  </div>
                </div>

                {hasActiveFilters && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetFilters}
                      leftIcon={<X size={14} />}
                    >
                      Réinitialiser les filtres
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          {isLoading && !data ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Card key={index} className="border-gold-400/10 bg-card/60">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <Skeleton className="h-6 w-48 rounded" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </div>

                    <Skeleton className="mb-2 h-4 w-2/3 rounded" />
                    <Skeleton className="h-4 w-1/2 rounded" />

                    <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                      <Skeleton className="h-8 w-28 rounded" />
                      <Skeleton className="h-8 w-36 rounded" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : isError && !data ? (
            <Card className="border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20">
              <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                <AlertTriangle size={40} className="text-red-500" />
                <div>
                  <p className="font-bold text-red-700 dark:text-red-300">
                    Impossible de charger l’historique
                  </p>
                  <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
                    {errorMessage}
                  </p>
                </div>

                <Button
                  variant="outline-gold"
                  onClick={() => refetch()}
                  leftIcon={<RefreshCw size={14} />}
                >
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : livraisons.length === 0 ? (
            <Card className="border-gold-400/20 bg-card/60">
              <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-gold-400/20 bg-gold-500/5">
                  <Package size={40} className="text-muted-foreground" />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    Aucune course trouvée
                  </h3>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    {hasActiveFilters
                      ? 'Aucun résultat ne correspond aux filtres actifs.'
                      : 'Votre historique apparaîtra ici dès que vous aurez effectué des livraisons.'}
                  </p>
                </div>

                {hasActiveFilters && (
                  <Button
                    variant="outline-gold"
                    size="sm"
                    onClick={resetFilters}
                    leftIcon={<X size={14} />}
                  >
                    Réinitialiser les filtres
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {livraisons.map((livraison, index) => {
                  const status = resolveStatus(livraison.statut)
                  const isExpanded = expandedIds.has(livraison.id)
                  const displayDate =
                    livraison.date_livraison ||
                    livraison.date_recuperation ||
                    livraison.date_acceptation

                  const clientName = livraison.client
                    ? `${livraison.client.prenom} ${livraison.client.nom}`.trim()
                    : '—'

                  const courseHref = `/dashboard/livreur/courses/${livraison.commande_id || livraison.id}`
                  const mapHref = buildMapsUrl(
                    livraison.adresse,
                    livraison.commune
                  )

                  return (
                    <motion.div
                      key={livraison.id}
                      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.03, 0.3) }}
                      whileHover={prefersReduced ? undefined : { y: -2 }}
                    >
                      <Card className="overflow-hidden border-gold-400/10 bg-card/70 shadow-soft transition hover:shadow-gold">
                        <CardContent className="p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-lg font-bold text-foreground">
                                  Commande #{livraison.numero_commande}
                                </p>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopy(livraison.numero_commande)
                                  }
                                  className="shrink-0 text-muted-foreground transition hover:text-gold-500"
                                  aria-label="Copier le numéro de commande"
                                >
                                  {copiedId === livraison.numero_commande ? (
                                    <Check size={14} className="text-green-500" />
                                  ) : (
                                    <Copy size={14} />
                                  )}
                                </button>
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <Calendar size={14} />
                                  {formatDate(displayDate)}
                                </span>

                                <span className="inline-flex items-center gap-1">
                                  <MapPin size={14} />
                                  {livraison.commune || '—'}
                                </span>

                                <span className="inline-flex items-center gap-1">
                                  <Truck size={14} />
                                  {deliveryTypeLabel(livraison.type_livraison)}
                                </span>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <Badge
                                variant={status.variant}
                                size="sm"
                                className="flex items-center gap-1"
                              >
                                {status.icon}
                                {status.label}
                              </Badge>

                              <button
                                type="button"
                                onClick={() => toggleExpand(livraison.id)}
                                className="rounded-lg p-1 text-muted-foreground transition hover:text-gold-500"
                                aria-label={
                                  isExpanded
                                    ? 'Réduire les détails'
                                    : 'Afficher les détails'
                                }
                              >
                                <ChevronDown
                                  size={18}
                                  className={cn(
                                    'transition-transform',
                                    isExpanded && 'rotate-180'
                                  )}
                                />
                              </button>
                            </div>
                          </div>

                          <p className="mt-3 text-sm text-muted-foreground">
                            {livraison.adresse || 'Adresse non renseignée'}
                          </p>

                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
                                  <div>
                                    <p className="text-muted-foreground">Client</p>
                                    <p className="mt-1 flex items-center gap-2 font-medium text-foreground">
                                      <User size={14} className="text-gold-500" />
                                      {clientName}
                                    </p>
                                  </div>

                                  {livraison.type_livraison ===
                                    'point_retrait' && (
                                    <div>
                                      <p className="text-muted-foreground">
                                        Point retrait
                                      </p>
                                      <p className="mt-1 font-medium text-foreground">
                                        {livraison.point_retrait_nom || '—'}
                                      </p>
                                    </div>
                                  )}

                                  <div>
                                    <p className="text-muted-foreground">
                                      Acceptée le
                                    </p>
                                    <p className="mt-1 font-medium text-foreground">
                                      {formatDateTime(
                                        livraison.date_acceptation
                                      )}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatRelative(
                                        livraison.date_acceptation
                                      )}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-muted-foreground">
                                      Récupérée le
                                    </p>
                                    <p className="mt-1 font-medium text-foreground">
                                      {formatDateTime(
                                        livraison.date_recuperation
                                      )}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-muted-foreground">
                                      Livrée le
                                    </p>
                                    <p className="mt-1 font-medium text-foreground">
                                      {formatDateTime(livraison.date_livraison)}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-muted-foreground">
                                      Dernière mise à jour
                                    </p>
                                    <p className="mt-1 font-medium text-foreground">
                                      {formatRelative(
                                        livraison.date_livraison ||
                                          livraison.date_recuperation ||
                                          livraison.date_acceptation
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDetailLivraison(livraison)}
                                leftIcon={<Eye size={14} />}
                              >
                                Détails
                              </Button>

                              {mapHref && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    window.open(mapHref, '_blank', 'noopener')
                                  }
                                  leftIcon={<Navigation size={14} />}
                                >
                                  Itinéraire
                                </Button>
                              )}
                            </div>

                            <Link href={courseHref}>
                              <Button
                                variant="outline-gold"
                                size="sm"
                                rightIcon={<ExternalLink size={14} />}
                              >
                                Voir la course
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </div>

              <div className="mt-6 flex flex-col items-center gap-3">
                {hasNextPage && (
                  <Button
                    variant="outline-gold"
                    onClick={() => fetchNextPage()}
                    loading={isFetchingNextPage}
                    leftIcon={<RefreshCw size={14} />}
                  >
                    Afficher plus
                  </Button>
                )}

                {!hasNextPage && livraisons.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Vous avez consulté toutes les courses disponibles.
                  </p>
                )}
              </div>
            </>
          )}
        </motion.div>
      </Container>

      {/* Modal détail */}
      <Modal
        isOpen={Boolean(detailLivraison)}
        onClose={() => setDetailLivraison(null)}
        title="Détail de la livraison"
        description="Informations complètes de la course."
        size="lg"
        accent="gold"
      >
        {detailLivraison && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xl font-bold text-foreground">
                  Commande #{detailLivraison.numero_commande}
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {detailLivraison.commune || 'Commune non renseignée'}
                </p>
              </div>

              <Badge
                variant={resolveStatus(detailLivraison.statut).variant}
                size="sm"
                className="flex items-center gap-1"
              >
                {resolveStatus(detailLivraison.statut).icon}
                {resolveStatus(detailLivraison.statut).label}
              </Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background/50 p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Informations
                </p>

                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium text-foreground">
                      {deliveryTypeLabel(detailLivraison.type_livraison)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Client</span>
                    <span className="truncate font-medium text-foreground">
                      {detailLivraison.client
                        ? `${detailLivraison.client.prenom} ${detailLivraison.client.nom}`
                        : '—'}
                    </span>
                  </div>

                  {detailLivraison.point_retrait_nom && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Point retrait</span>
                      <span className="font-medium text-foreground">
                        {detailLivraison.point_retrait_nom}
                      </span>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">
                      Adresse
                    </span>
                    <span className="text-right font-medium text-foreground">
                      {detailLivraison.adresse || '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background/50 p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Chronologie
                </p>

                <div className="mt-3 space-y-3 text-sm">
                  {[
                    {
                      label: 'Acceptée',
                      date: detailLivraison.date_acceptation,
                      icon: <CheckCircle size={14} />,
                    },
                    {
                      label: 'Colis récupéré',
                      date: detailLivraison.date_recuperation,
                      icon: <Package size={14} />,
                    },
                    {
                      label: 'Livrée',
                      date: detailLivraison.date_livraison,
                      icon: <Truck size={14} />,
                    },
                  ]
                    .filter((step) => Boolean(step.date))
                    .map((step) => (
                      <div
                        key={step.label}
                        className="flex items-start gap-3"
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-gold-600 dark:text-gold-400">
                          {step.icon}
                        </div>

                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {step.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(step.date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelative(step.date)}
                          </p>
                        </div>
                      </div>
                    ))}

                  {[
                    {
                      label: 'Acceptée',
                      date: detailLivraison.date_acceptation,
                      icon: <CheckCircle size={14} />,
                    },
                    {
                      label: 'Colis récupéré',
                      date: detailLivraison.date_recuperation,
                      icon: <Package size={14} />,
                    },
                    {
                      label: 'Livrée',
                      date: detailLivraison.date_livraison,
                      icon: <Truck size={14} />,
                    },
                  ].every((step) => !step.date) && (
                    <p className="text-sm text-muted-foreground">
                      Aucune date enregistrée pour cette course.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Preuves photos
              </p>

              {(detailLivraison.photo_colis ||
                detailLivraison.photo_livraison) ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {detailLivraison.photo_colis && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-foreground">
                        Photo du colis
                      </p>
                      <img
                        src={detailLivraison.photo_colis}
                        alt="Photo du colis"
                        className="h-40 w-full rounded-xl border border-border object-cover"
                      />
                    </div>
                  )}

                  {detailLivraison.photo_livraison && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-foreground">
                        Preuve de livraison
                      </p>
                      <img
                        src={detailLivraison.photo_livraison}
                        alt="Preuve de livraison"
                        className="h-40 w-full rounded-xl border border-border object-cover"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
                  <ImageOff size={28} />
                  <p>Aucune photo enregistrée pour cette livraison.</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              {buildMapsUrl(
                detailLivraison.adresse,
                detailLivraison.commune
              ) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(
                      buildMapsUrl(
                        detailLivraison.adresse,
                        detailLivraison.commune
                      )!,
                      '_blank',
                      'noopener'
                    )
                  }
                  leftIcon={<Navigation size={14} />}
                >
                  Itinéraire
                </Button>
              )}

              <Link
                href={`/dashboard/livreur/courses/${detailLivraison.commande_id || detailLivraison.id}`}
              >
                <Button
                  variant="luxe"
                  size="sm"
                  rightIcon={<ExternalLink size={14} />}
                >
                  Voir la course
                </Button>
              </Link>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDetailLivraison(null)}
              >
                Fermer
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}