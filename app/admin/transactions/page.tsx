// app/admin/transactions/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
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
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'

import { cn } from '@/lib/utils'

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Banknote,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Info,
  LayoutGrid,
  List,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  Smartphone,
  User,
  X,
  XCircle,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

const ALLOWED_TYPES = ['paiement', 'remboursement', 'ajustement'] as const
type TransactionType = (typeof ALLOWED_TYPES)[number]

const ALLOWED_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'failed',
  'refunded',
] as const
type TransactionStatus = (typeof ALLOWED_STATUSES)[number]

type SortColumn = 'created_at' | 'montant' | 'status' | 'type'
type SortDirection = 'asc' | 'desc'
type Period = '7d' | '30d' | '90d' | '365d' | 'all'
type ViewMode = 'table' | 'cards'

interface TransactionUser {
  id?: string | null
  email?: string | null
  nom?: string | null
  prenom?: string | null
  telephone?: string | null
}

interface TransactionCommande {
  id?: string | null
  numero_commande?: string | null
  statut?: string | null
}

interface Transaction {
  id: string
  user_id?: string | null
  commande_id?: string | null
  type: TransactionType
  montant: number
  devise: string
  description?: string | null
  method?: string | null
  phone?: string | null
  status: TransactionStatus
  reference?: string | null
  external_id?: string | null
  metadata?: Record<string, any> | null
  created_at: string
  updated_at?: string | null
  user?: TransactionUser | null
  commande?: TransactionCommande | null
}

interface TransactionsStats {
  total: number
  pending: number
  approved: number
  rejected: number
  failed: number
  refunded: number
}

interface TransactionsResponse {
  data: Transaction[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  stats: TransactionsStats
  generated_at?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PAGE_SIZES = [15, 25, 50, 100]

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
  { value: '365d', label: '1 an' },
  { value: 'all', label: 'Tout' },
]

const SORT_OPTIONS: { value: SortColumn; label: string }[] = [
  { value: 'created_at', label: 'Date' },
  { value: 'montant', label: 'Montant' },
  { value: 'status', label: 'Statut' },
  { value: 'type', label: 'Type' },
]

const METHOD_OPTIONS = [
  { value: 'all', label: 'Toutes méthodes' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'card', label: 'Carte bancaire' },
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'cash_on_delivery', label: 'Paiement à la livraison' },
]

const TYPE_CONFIG: Record<
  TransactionType,
  {
    label: string
    badge: 'accent' | 'warm' | 'gold'
    icon: React.ReactNode
    description: string
  }
> = {
  paiement: {
    label: 'Paiement',
    badge: 'accent',
    icon: <CreditCard size={14} />,
    description: 'Paiement client reçu',
  },
  remboursement: {
    label: 'Remboursement',
    badge: 'warm',
    icon: <RotateCcw size={14} />,
    description: 'Remboursement traité',
  },
  ajustement: {
    label: 'Ajustement',
    badge: 'gold',
    icon: <Scale size={14} />,
    description: 'Correction administrative',
  },
}

const STATUS_CONFIG: Record<
  TransactionStatus,
  {
    label: string
    badge: 'accent' | 'warm' | 'danger' | 'gold' | 'neutral'
    icon: React.ReactNode
  }
> = {
  pending: {
    label: 'En attente',
    badge: 'warm',
    icon: <Clock size={14} />,
  },
  approved: {
    label: 'Approuvé',
    badge: 'accent',
    icon: <CheckCircle2 size={14} />,
  },
  rejected: {
    label: 'Rejeté',
    badge: 'danger',
    icon: <XCircle size={14} />,
  },
  failed: {
    label: 'Échoué',
    badge: 'danger',
    icon: <AlertTriangle size={14} />,
  },
  refunded: {
    label: 'Remboursé',
    badge: 'gold',
    icon: <RotateCcw size={14} />,
  },
}

const DEFAULT_STATS: TransactionsStats = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  failed: 0,
  refunded: 0,
}

const inputClass =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const selectClass = inputClass

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function isTransactionType(value: unknown): value is TransactionType {
  return (
    typeof value === 'string' &&
    (ALLOWED_TYPES as readonly string[]).includes(value)
  )
}

function isTransactionStatus(value: unknown): value is TransactionStatus {
  return (
    typeof value === 'string' &&
    (ALLOWED_STATUSES as readonly string[]).includes(value)
  )
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

    return formatDateTime(value)
  } catch {
    return ''
  }
}

function normalizeDevise(value: unknown): string {
  const raw = String(value || 'CDF').toUpperCase().trim()

  if (raw === 'FC' || raw === 'CDF' || raw === 'XAF' || raw === 'FRW') {
    return 'CDF'
  }

  if (raw === '$' || raw === 'USD' || raw === 'DOLLAR') {
    return 'USD'
  }

  return raw || 'CDF'
}

function getMethodLabel(method?: string | null): string {
  const value = String(method || '').toLowerCase().trim()

  const found = METHOD_OPTIONS.find((option) => option.value === value)
  if (found) return found.label

  if (!value) return 'Non précisé'

  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getMethodIcon(method?: string | null): React.ReactNode {
  const value = String(method || '').toLowerCase().trim()

  if (
    value.includes('orange') ||
    value.includes('airtel') ||
    value.includes('mpesa') ||
    value.includes('m-pesa') ||
    value.includes('mobile')
  ) {
    return <Smartphone size={14} />
  }

  if (value.includes('card') || value.includes('carte') || value === 'card') {
    return <CreditCard size={14} />
  }

  if (
    value.includes('bank') ||
    value.includes('virement') ||
    value.includes('transfer')
  ) {
    return <Banknote size={14} />
  }

  if (
    value.includes('cash') ||
    value.includes('livraison') ||
    value.includes('cod')
  ) {
    return <Package size={14} />
  }

  return <FileText size={14} />
}

function getUserDisplayName(tx: Transaction): string {
  const user = tx.user

  const name = [user?.prenom, user?.nom].filter(Boolean).join(' ').trim()

  if (name) return name
  if (user?.email) return user.email
  if (tx.phone) return tx.phone
  if (tx.user_id) return `${tx.user_id.slice(0, 8)}...`

  return 'Utilisateur inconnu'
}

function getCommandeLabel(tx: Transaction): string {
  if (tx.commande?.numero_commande) return `#${tx.commande.numero_commande}`
  if (tx.commande_id) return `${tx.commande_id.slice(0, 8)}...`
  return '—'
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

  const escape = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`

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
/*  SOUS-COMPOSANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function AmountCell({
  amount,
  devise,
  rate,
}: {
  amount: number
  devise: string
  rate: number | null | undefined
}) {
  const value = Number(amount) || 0
  const abs = Math.abs(value)
  const negative = value < 0
  const currency = normalizeDevise(devise)

  const primary =
    currency === 'USD'
      ? `$${abs.toFixed(2)}`
      : `${abs.toLocaleString('fr-FR')} FC`

  const secondary =
    currency === 'USD'
      ? rate
        ? `≈ ${Math.round(abs * rate).toLocaleString('fr-FR')} FC`
        : ''
      : rate
        ? `≈ $${(abs / rate).toFixed(2)}`
        : ''

  return (
    <div
      className={cn(
        'text-sm font-semibold',
        negative ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
      )}
    >
      <span>
        {negative ? '−' : ''}
        {primary}
      </span>

      {secondary && (
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {secondary}
        </span>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  tone?: 'default' | 'gold' | 'accent' | 'warm' | 'danger'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        tone === 'gold'
          ? 'border-gold-400/25 bg-gold-500/5'
          : tone === 'accent'
            ? 'border-emerald-500/20 bg-emerald-500/5'
            : tone === 'warm'
              ? 'border-amber-500/20 bg-amber-500/5'
              : tone === 'danger'
                ? 'border-red-500/20 bg-red-500/5'
                : 'border-border bg-background/50'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className="text-gold-500">{icon}</span>
      </div>

      <p className="mt-2 text-2xl font-extrabold text-foreground">{value}</p>
    </div>
  )
}

function SortButton({
  column,
  label,
  activeColumn,
  direction,
  onSort,
}: {
  column: SortColumn
  label: string
  activeColumn: SortColumn
  direction: SortDirection
  onSort: (column: SortColumn) => void
}) {
  const isActive = activeColumn === column

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'inline-flex items-center gap-1 text-left text-xs font-semibold uppercase transition hover:text-foreground',
        isActive ? 'text-gold-600' : 'text-muted-foreground'
      )}
    >
      {label}
      {isActive && (
        <span className="text-gold-500">
          {direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
        </span>
      )}
    </button>
  )
}

function DetailModal({
  open,
  transaction,
  onClose,
  onCopy,
  copiedId,
  rate,
}: {
  open: boolean
  transaction: Transaction | null
  onClose: () => void
  onCopy: (text: string, id: string) => void
  copiedId: string | null
  rate: number | null | undefined
}) {
  if (!transaction) return null

  const type = TYPE_CONFIG[transaction.type]
  const status = STATUS_CONFIG[transaction.status]

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Détail de la transaction"
      description="Informations complètes de l’opération."
      size="lg"
      accent="gold"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={type.badge} size="sm">
                <span className="mr-1">{type.icon}</span>
                {type.label}
              </Badge>

              <Badge variant={status.badge} size="sm">
                <span className="mr-1">{status.icon}</span>
                {status.label}
              </Badge>
            </div>

            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {transaction.id}
            </p>
          </div>

          <div className="text-right">
            <AmountCell
              amount={transaction.montant}
              devise={transaction.devise}
              rate={rate}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(transaction.created_at)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background/50 p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <User size={14} />
              Utilisateur
            </p>

            <p className="mt-2 text-sm font-semibold text-foreground">
              {getUserDisplayName(transaction)}
            </p>

            {transaction.user?.email && (
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {transaction.user.email}
              </p>
            )}

            {(transaction.user?.telephone || transaction.phone) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {transaction.user?.telephone || transaction.phone}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-background/50 p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Package size={14} />
              Commande
            </p>

            <p className="mt-2 text-sm font-semibold text-foreground">
              {getCommandeLabel(transaction)}
            </p>

            {transaction.commande?.statut && (
              <p className="mt-1 text-xs text-muted-foreground">
                Statut : {transaction.commande.statut}
              </p>
            )}

            {transaction.commande_id && (
              <Link
                href={`/admin/commandes/${transaction.commande_id}`}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gold-600 transition hover:text-gold-500"
              >
                Ouvrir la commande
                <ExternalLink size={12} />
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-background/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">Méthode</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              {getMethodIcon(transaction.method)}
              {getMethodLabel(transaction.method)}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">Référence</p>
            <div className="mt-2 flex items-center gap-2">
              <p className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                {transaction.reference || transaction.external_id || '—'}
              </p>

              {(transaction.reference || transaction.external_id) && (
                <Tooltip content="Copier la référence">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      onCopy(
                        transaction.reference || transaction.external_id || '',
                        `ref-${transaction.id}`
                      )
                    }
                  >
                    {copiedId === `ref-${transaction.id}` ? (
                      <Check size={14} className="text-green-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {transaction.description && (
          <div className="rounded-2xl border border-border bg-background/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Description
            </p>
            <p className="mt-2 whitespace-pre-line text-sm text-foreground">
              {transaction.description}
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-background/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Métadonnées
            </p>

            <Tooltip content="Copier l’ID">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onCopy(transaction.id, `id-${transaction.id}`)}
                leftIcon={
                  copiedId === `id-${transaction.id}` ? (
                    <Check size={14} className="text-green-500" />
                  ) : (
                    <Copy size={14} />
                  )
                }
              >
                Copier ID
              </Button>
            </Tooltip>
          </div>

          <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-muted p-3 text-xs text-foreground">
            {JSON.stringify(transaction.metadata ?? {}, null, 2)}
          </pre>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose} leftIcon={<X size={14} />}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminTransactionsPage() {
  const router = useRouter()
  const toast = useToast()
  const prefersReduced = useReducedMotion()
  const { user, loading: authLoading, isAdmin } = useAuth()
  const { rate } = useExchangeRate()

  const currentIsAdmin = Boolean(isAdmin)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | TransactionStatus>('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [period, setPeriod] = useState<Period>('30d')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  /* ---------------------------------------------------------- */
  /* Titre page                                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Transactions | Admin Gercie'
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Guard admin                                                 */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/admin/transactions')}`
      )
      return
    }

    if (!currentIsAdmin) {
      router.replace('/')
    }
  }, [authLoading, currentIsAdmin, router, user])

  /* ---------------------------------------------------------- */
  /* Debounce recherche                                          */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 350)

    return () => clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [
    debouncedSearch,
    methodFilter,
    pageSize,
    period,
    sortColumn,
    sortDirection,
    statusFilter,
    typeFilter,
  ])

  /* ---------------------------------------------------------- */
  /* Query transactions                                          */
  /* ---------------------------------------------------------- */

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<TransactionsResponse>({
    queryKey: [
      'admin-transactions',
      debouncedSearch,
      typeFilter,
      statusFilter,
      methodFilter,
      period,
      page,
      pageSize,
      sortColumn,
      sortDirection,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()

      if (debouncedSearch) params.set('search', debouncedSearch)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (methodFilter !== 'all') params.set('method', methodFilter)

      params.set('period', period)
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      params.set('sort_by', sortColumn)
      params.set('sort_order', sortDirection)

      const res = await fetch(`/api/admin/transactions?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Impossible de charger les transactions.')
      }

      return json as TransactionsResponse
    },
    enabled: !!user && currentIsAdmin,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  })

  const transactions = useMemo(() => {
    const rows = Array.isArray(data?.data) ? data.data : []

    return rows
      .map((row) => {
        const normalized = {
          ...row,
          type: isTransactionType(row.type) ? row.type : null,
          status: isTransactionStatus(row.status) ? row.status : 'pending',
          montant: Number(row.montant) || 0,
          devise: normalizeDevise(row.devise),
          created_at: row.created_at || new Date().toISOString(),
        }

        return normalized.type ? (normalized as Transaction) : null
      })
      .filter(Boolean) as Transaction[]
  }, [data?.data])

  const pagination = data?.pagination ?? {
    page: 1,
    limit: pageSize,
    total: 0,
    totalPages: 1,
  }

  const stats = data?.stats ?? DEFAULT_STATS

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortColumn(column)
        setSortDirection('desc')
      }
    },
    [sortColumn]
  )

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
    if (transactions.length === 0) {
      toast.addToast({
        type: 'error',
        message: 'Aucune transaction à exporter.',
      })
      return
    }

    const headers = [
      'ID',
      'Date',
      'Utilisateur',
      'Email',
      'Téléphone',
      'Type',
      'Statut',
      'Méthode',
      'Montant',
      'Devise',
      'Description',
      'Référence',
      'Référence externe',
      'Commande',
    ]

    const rows = transactions.map((tx) => [
      tx.id,
      tx.created_at,
      getUserDisplayName(tx),
      tx.user?.email || '',
      tx.user?.telephone || tx.phone || '',
      TYPE_CONFIG[tx.type]?.label || tx.type,
      STATUS_CONFIG[tx.status]?.label || tx.status,
      getMethodLabel(tx.method),
      String(tx.montant),
      normalizeDevise(tx.devise),
      tx.description || '',
      tx.reference || '',
      tx.external_id || '',
      tx.commande?.numero_commande || tx.commande_id || '',
    ])

    downloadCsv(
      [headers, ...rows],
      `transactions-${new Date().toISOString().slice(0, 10)}.csv`
    )

    toast.addToast({
      type: 'success',
      message: 'Export CSV réalisé.',
    })
  }, [toast, transactions])

  const resetFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setTypeFilter('all')
    setStatusFilter('all')
    setMethodFilter('all')
    setPeriod('30d')
    setSortColumn('created_at')
    setSortDirection('desc')
    setPage(1)
  }, [])

  /* ---------------------------------------------------------- */
  /* Rendu loading / garde                                       */
  /* ---------------------------------------------------------- */

  if (authLoading || !currentIsAdmin) {
    return (
      <Container className="py-10">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[520px] w-full rounded-3xl" />
        </div>
      </Container>
    )
  }

  if (!user) return null

  const hasActiveFilters =
    Boolean(debouncedSearch) ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    methodFilter !== 'all' ||
    period !== '30d'

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8 md:py-10">
        {/* Header */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-extrabold text-foreground font-serif md:text-4xl">
              <ShieldCheck size={30} className="text-gold-500" />
              Transactions
            </h1>

            <p className="mt-2 text-muted-foreground">
              Historique des paiements, remboursements et ajustements de la
              plateforme.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="gold" size="sm">
                {stats.total} transaction{stats.total > 1 ? 's' : ''}
              </Badge>

              <Badge variant="warm" size="sm">
                {stats.pending} en attente
              </Badge>

              <Badge variant="accent" size="sm">
                {stats.approved} approuvée{stats.approved > 1 ? 's' : ''}
              </Badge>

              {stats.rejected > 0 && (
                <Badge variant="danger" size="sm">
                  {stats.rejected} rejetée{stats.rejected > 1 ? 's' : ''}
                </Badge>
              )}

              {isFetching && (
                <Badge variant="neutral" size="sm">
                  <Loader2 size={12} className="mr-1 animate-spin" />
                  Synchronisation
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                <LayoutGrid size={14} />
                Cartes
              </button>
            </div>

            <Tooltip content="Actualiser">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                leftIcon={
                  isFetching ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )
                }
              >
                Actualiser
              </Button>
            </Tooltip>

            <Tooltip content="Exporter la page courante en CSV">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={transactions.length === 0}
                leftIcon={<Download size={14} />}
              >
                CSV
              </Button>
            </Tooltip>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Total"
            value={stats.total}
            icon={<FileText size={18} />}
            tone="gold"
          />

          <StatCard
            label="En attente"
            value={stats.pending}
            icon={<Clock size={18} />}
            tone="warm"
          />

          <StatCard
            label="Approuvées"
            value={stats.approved}
            icon={<CheckCircle2 size={18} />}
            tone="accent"
          />

          <StatCard
            label="Rejetées"
            value={stats.rejected}
            icon={<XCircle size={18} />}
            tone="danger"
          />

          <StatCard
            label="Échouées"
            value={stats.failed}
            icon={<AlertTriangle size={18} />}
            tone="danger"
          />

          <StatCard
            label="Remboursées"
            value={stats.refunded}
            icon={<RotateCcw size={18} />}
            tone="default"
          />
        </div>

        {/* Filtres */}
        <Card className="mb-6 border-border bg-card/70">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="relative sm:col-span-2 xl:col-span-1">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />

                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher..."
                    className={cn(inputClass, 'pl-9')}
                  />

                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                      aria-label="Effacer la recherche"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  value={typeFilter}
                  onChange={(e) =>
                    setTypeFilter(e.target.value as 'all' | TransactionType)
                  }
                  className={selectClass}
                  aria-label="Filtrer par type"
                >
                  <option value="all">Tous les types</option>
                  {ALLOWED_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_CONFIG[type].label}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'all' | TransactionStatus)
                  }
                  className={selectClass}
                  aria-label="Filtrer par statut"
                >
                  <option value="all">Tous les statuts</option>
                  {ALLOWED_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_CONFIG[status].label}
                    </option>
                  ))}
                </select>

                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className={selectClass}
                  aria-label="Filtrer par méthode"
                >
                  {METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as Period)}
                  className={selectClass}
                  aria-label="Filtrer par période"
                >
                  {PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {pagination.total} résultat{pagination.total > 1 ? 's' : ''}
                </span>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    leftIcon={<X size={14} />}
                  >
                    Réinitialiser
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Erreur */}
        {isError && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Erreur de chargement</p>
                <p className="mt-1">
                  {error instanceof Error
                    ? error.message
                    : 'Impossible de charger les transactions.'}
                </p>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        {/* Contenu */}
        {isLoading ? (
          <Card className="border-border bg-card/70">
            <CardContent className="p-4">
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : transactions.length === 0 ? (
          <Card className="border-border bg-card/70">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-gold-400/30 bg-gold-400/10">
                <FileText size={36} className="text-gold-500" />
              </div>

              <h2 className="text-xl font-bold text-foreground">
                Aucune transaction
              </h2>

              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {hasActiveFilters
                  ? 'Aucun résultat avec ces filtres. Réinitialise la recherche ou modifie les filtres.'
                  : 'Aucune transaction disponible pour le moment.'}
              </p>

              {hasActiveFilters && (
                <Button
                  variant="outline-gold"
                  className="mt-6"
                  onClick={resetFilters}
                  leftIcon={<X size={14} />}
                >
                  Réinitialiser les filtres
                </Button>
              )}
            </CardContent>
          </Card>
        ) : viewMode === 'table' ? (
          <Card className="overflow-hidden border-border bg-card/70">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-left text-xs font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">
                      <SortButton
                        column="created_at"
                        label="Date"
                        activeColumn={sortColumn}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                    </th>

                    <th className="px-4 py-3">Utilisateur</th>

                    <th className="px-4 py-3">
                      <SortButton
                        column="type"
                        label="Type"
                        activeColumn={sortColumn}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                    </th>

                    <th className="px-4 py-3">
                      <SortButton
                        column="status"
                        label="Statut"
                        activeColumn={sortColumn}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                    </th>

                    <th className="px-4 py-3">Méthode</th>

                    <th className="px-4 py-3">
                      <SortButton
                        column="montant"
                        label="Montant"
                        activeColumn={sortColumn}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                    </th>

                    <th className="px-4 py-3">Commande</th>

                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {transactions.map((tx) => {
                      const type = TYPE_CONFIG[tx.type]
                      const status = STATUS_CONFIG[tx.status]

                      return (
                        <motion.tr
                          key={tx.id}
                          initial={prefersReduced ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="transition hover:bg-muted/30"
                        >
                          <td className="px-4 py-3">
                            <p className="whitespace-nowrap text-sm font-medium text-foreground">
                              {formatDateTime(tx.created_at)}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatRelative(tx.created_at)}
                            </p>
                          </td>

                          <td className="px-4 py-3">
                            <p className="max-w-[180px] truncate text-sm font-medium text-foreground">
                              {getUserDisplayName(tx)}
                            </p>
                            {tx.user?.email && (
                              <p className="mt-0.5 max-w-[180px] truncate text-xs text-muted-foreground">
                                {tx.user.email}
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <Badge variant={type.badge} size="sm">
                              <span className="mr-1">{type.icon}</span>
                              {type.label}
                            </Badge>
                          </td>

                          <td className="px-4 py-3">
                            <Badge variant={status.badge} size="sm">
                              <span className="mr-1">{status.icon}</span>
                              {status.label}
                            </Badge>
                          </td>

                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                              {getMethodIcon(tx.method)}
                              {getMethodLabel(tx.method)}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <AmountCell
                              amount={tx.montant}
                              devise={tx.devise}
                              rate={rate}
                            />
                          </td>

                          <td className="px-4 py-3">
                            <p className="max-w-[140px] truncate text-sm text-muted-foreground">
                              {getCommandeLabel(tx)}
                            </p>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip content="Voir le détail">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setSelectedTransaction(tx)}
                                  aria-label="Voir le détail"
                                >
                                  <Eye size={14} />
                                </Button>
                              </Tooltip>

                              <Tooltip content="Copier l’ID">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleCopy(tx.id, `row-${tx.id}`)}
                                  aria-label="Copier l’ID"
                                >
                                  {copiedId === `row-${tx.id}` ? (
                                    <Check size={14} className="text-green-500" />
                                  ) : (
                                    <Copy size={14} />
                                  )}
                                </Button>
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
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {transactions.map((tx) => {
                const type = TYPE_CONFIG[tx.type]
                const status = STATUS_CONFIG[tx.status]

                return (
                  <motion.button
                    key={tx.id}
                    type="button"
                    initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    onClick={() => setSelectedTransaction(tx)}
                    className="group rounded-3xl border border-border bg-card/70 p-4 text-left transition hover:border-gold-400/40 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-gold-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {getUserDisplayName(tx)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(tx.created_at)}
                        </p>
                      </div>

                      <Badge variant={status.badge} size="sm">
                        {status.label}
                      </Badge>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <Badge variant={type.badge} size="sm">
                        <span className="mr-1">{type.icon}</span>
                        {type.label}
                      </Badge>

                      <AmountCell
                        amount={tx.montant}
                        devise={tx.devise}
                        rate={rate}
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {getMethodIcon(tx.method)}
                        {getMethodLabel(tx.method)}
                      </span>

                      <span className="truncate">
                        {getCommandeLabel(tx)}
                      </span>
                    </div>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                Page {pagination.page} sur {pagination.totalPages}
              </span>

              <span>•</span>

              <span>{pagination.total} transaction(s)</span>

              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
                aria-label="Nombre par page"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                leftIcon={<ChevronLeft size={14} />}
              >
                Précédent
              </Button>

              <Button
                variant="luxe"
                size="sm"
                onClick={() =>
                  setPage((prev) => Math.min(pagination.totalPages, prev + 1))
                }
                disabled={page >= pagination.totalPages}
                rightIcon={<ChevronRight size={14} />}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}

        {/* Aide */}
        <Card className="mt-10 border-border bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info size={18} className="text-gold-500" />
              Lecture des transactions
            </CardTitle>
            <CardDescription>
              Les transactions affichées correspondent aux opérations réelles de
              la plateforme.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <CreditCard size={14} className="text-gold-500" />
                Paiement
              </p>
              <p className="mt-2">
                Correspond à un règlement client via Mobile Money, carte,
                virement ou paiement à la livraison.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <RotateCcw size={14} className="text-gold-500" />
                Remboursement
              </p>
              <p className="mt-2">
                Correspond à un retour de fonds traité par le support ou
                automatiquement après annulation.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Scale size={14} className="text-gold-500" />
                Ajustement
              </p>
              <p className="mt-2">
                Correspond à une correction administrative tracée, par exemple
                pour régulariser un dossier.
              </p>
            </div>
          </CardContent>
        </Card>
      </Container>

      {/* Modal détail */}
      <AnimatePresence>
        {selectedTransaction && (
          <DetailModal
            open={Boolean(selectedTransaction)}
            transaction={selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
            onCopy={handleCopy}
            copiedId={copiedId}
            rate={rate}
          />
        )}
      </AnimatePresence>
    </div>
  )
}