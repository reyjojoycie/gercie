// app/admin/transactions/page.tsx
'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  RefreshCcw,
  FileText,
  ArrowUpDown,
  Clock,
  User,
  DollarSign,
  CreditCard,
  ShoppingCart,
  Wallet,
  ArrowLeftRight,
  RotateCcw,
  Key,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Download,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  BarChart3,
  PieChart,
  Zap,
  Gift,
  ShieldCheck,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { toast } from 'react-hot-toast'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Transaction {
  id: string
  user_id: string
  email: string
  nom: string
  prenom: string
  type: string
  montant: number
  description: string
  date: string
  portefeuille_type: string
  commande_id: string | null
  status?: 'pending' | 'approved' | 'rejected'
  method?: string
  phone?: string
}

interface TransactionsResponse {
  data: Transaction[]
  pagination: {
    page: number
    totalPages: number
    total: number
  }
}

/* ------------------------------------------------------------------ */
/*  Configuration des types de transactions                             */
/* ------------------------------------------------------------------ */
type TransactionTypeKey =
  | 'achat'
  | 'vente'
  | 'recharge'
  | 'retrait'
  | 'transfert'
  | 'remboursement'
  | 'escrow_in'
  | 'escrow_out'
  | 'commission'
  | 'activation'

const typeConfig: Record<TransactionTypeKey, { label: string; variant: 'brand' | 'accent' | 'warm' | 'danger' | 'neutral' | 'gold'; icon: React.ReactNode }> = {
  achat: { label: 'Achat', variant: 'brand', icon: <ShoppingCart size={12} /> },
  vente: { label: 'Vente', variant: 'accent', icon: <TrendingUp size={12} /> },
  recharge: { label: 'Recharge', variant: 'gold', icon: <Wallet size={12} /> },
  retrait: { label: 'Retrait', variant: 'warm', icon: <CreditCard size={12} /> },
  transfert: { label: 'Transfert', variant: 'neutral', icon: <ArrowLeftRight size={12} /> },
  remboursement: { label: 'Remboursement', variant: 'danger', icon: <RotateCcw size={12} /> },
  escrow_in: { label: 'Séquestre (in)', variant: 'luxury' as any, icon: <TrendingDown size={12} /> },
  escrow_out: { label: 'Séquestre (out)', variant: 'luxury' as any, icon: <TrendingUp size={12} /> },
  commission: { label: 'Commission', variant: 'gold', icon: <DollarSign size={12} /> },
  activation: { label: 'Activation', variant: 'brand', icon: <Key size={12} /> },
}

/* ------------------------------------------------------------------ */
/*  Composants Table & Pagination (inline premium)                     */
/* ------------------------------------------------------------------ */
const Table = ({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'Aucune donnée',
  emptyIcon,
  onRowClick,
  sortColumn,
  sortDirection,
  onSort,
  loading,
}: {
  columns: { header: string; accessor: (row: any) => React.ReactNode; className?: string; sortable?: boolean }[]
  data: any[]
  keyExtractor: (row: any) => string
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  onRowClick?: (row: any) => void
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (column: string) => void
  loading?: boolean
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gold-400/20 text-left">
          {columns.map((col, idx) => (
            <th
              key={idx}
              className={cn(
                'px-4 py-3 font-semibold text-neutral-600 dark:text-neutral-300 whitespace-nowrap',
                col.sortable && 'cursor-pointer hover:text-gold-500 select-none',
                col.className,
              )}
              onClick={() => col.sortable && onSort?.(col.header)}
            >
              <span className="flex items-center gap-1">
                {col.header}
                {sortColumn === col.header && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={`sk-${i}`} className="border-b border-gold-400/5">
              {columns.map((_, j) => (
                <td key={j} className="px-4 py-3">
                  <Skeleton variant="text" className="h-4 w-full" shimmer shimmerVariant="gold" />
                </td>
              ))}
            </tr>
          ))
        ) : data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="text-center py-12">
              {emptyIcon && <div className="mb-2">{emptyIcon}</div>}
              <p className="text-neutral-500">{emptyMessage}</p>
            </td>
          </tr>
        ) : (
          data.map(row => (
            <motion.tr
              key={keyExtractor(row)}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'border-b border-gold-400/5 hover:bg-gold-400/5 transition-colors',
                onRowClick && 'cursor-pointer',
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col, idx) => (
                <td key={idx} className={cn('px-4 py-3', col.className)}>
                  {col.accessor(row)}
                </td>
              ))}
            </motion.tr>
          ))
        )}
      </tbody>
    </table>
  </div>
)

const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  onPageSizeChange,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems?: number
  pageSize?: number
  onPageSizeChange?: (size: number) => void
}) => {
  if (totalPages <= 1) return null
  const pages = []
  const delta = 2
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }
  return (
    <div className="flex items-center justify-between gap-4 mt-6">
      <div className="flex items-center gap-1">
        <Button variant="outline-gold" size="icon" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>
          <ChevronLeft size={16} />
        </Button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e-${i}`} className="px-2 text-neutral-400">…</span>
          ) : (
            <Button
              key={`p-${p}`}
              variant={p === currentPage ? 'gold' : 'outline-gold'}
              size="sm"
              onClick={() => onPageChange(p as number)}
              className={cn(p === currentPage && 'shadow-gold')}
            >
              {p}
            </Button>
          ),
        )}
        <Button variant="outline-gold" size="icon" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>
          <ChevronRight size={16} />
        </Button>
      </div>
      {pageSize && onPageSizeChange && (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <span>Afficher</span>
          <select
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            className="bg-card border border-border rounded-lg px-2 py-1 text-xs"
          >
            {[15, 25, 50].map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function AdminTransactionsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  // États depuis URL ou défaut
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [filterType, setFilterType] = useState(searchParams.get('type') || '')
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pageSize, setPageSize] = useState(Number(searchParams.get('limit') || 15))
  const [sortColumn, setSortColumn] = useState(searchParams.get('sort') || 'date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>((searchParams.get('dir') as 'asc' | 'desc') || 'desc')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState<Transaction | null>(null)
  const [showExportConfirm, setShowExportConfirm] = useState(false)
  const debouncedSearch = useDebounce(search, 300)

  // Mise à jour de l'URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filterType) params.set('type', filterType)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 15) params.set('limit', String(pageSize))
    if (sortColumn !== 'date') params.set('sort', sortColumn)
    if (sortDirection !== 'desc') params.set('dir', sortDirection)
    router.replace(`/admin/transactions?${params.toString()}`, { scroll: false })
  }, [debouncedSearch, filterType, page, pageSize, sortColumn, sortDirection, router])

  // Redirection si non authentifié
  if (!authLoading && !user) {
    router.push('/login?redirect=/admin/transactions')
    return null
  }

  /* ---------- React Query : chargement des transactions ---------- */
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<TransactionsResponse>({
    queryKey: ['admin-transactions', debouncedSearch, filterType, page, pageSize, sortColumn, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterType) params.set('type', filterType)
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      params.set('sort_by', sortColumn)
      params.set('sort_order', sortDirection)
      const res = await fetch(`/api/admin/transactions?${params.toString()}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement')
      return res.json()
    },
    enabled: !!user,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const transactions = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, totalPages: 1, total: 0 }

  const availableTypes = Object.keys(typeConfig) as TransactionTypeKey[]

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    toast.success('ID copié')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(p => (p === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  const exportCSV = () => {
    if (transactions.length === 0) return
    const headers = ['ID', 'Date', 'Utilisateur', 'Email', 'Type', 'Montant (FC)', 'Description', 'Portefeuille', 'Commande']
    const rows = transactions.map(tx => [
      tx.id,
      new Date(tx.date).toISOString(),
      `${tx.prenom} ${tx.nom}`,
      tx.email,
      typeConfig[tx.type as TransactionTypeKey]?.label || tx.type,
      tx.montant,
      tx.description,
      tx.portefeuille_type || '',
      tx.commande_id || '',
    ])
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `transactions_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
    setShowExportConfirm(false)
  }

  // Stats rapides
  const stats = useMemo(() => {
    const total = pagination.total
    const entrees = transactions.filter(tx => tx.montant > 0).reduce((acc, tx) => acc + tx.montant, 0)
    const sorties = transactions.filter(tx => tx.montant < 0).reduce((acc, tx) => acc + Math.abs(tx.montant), 0)
    return { total, entrees, sorties }
  }, [transactions, pagination.total])

  const columns = [
    {
      header: 'Date',
      accessor: (row: Transaction) => (
        <div className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
          <Clock size={14} className="inline mr-1 text-neutral-400" />
          {new Date(row.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      ),
      sortable: true,
      className: 'w-[170px]',
    },
    {
      header: 'Utilisateur',
      accessor: (row: Transaction) => (
        <div>
          <p className="font-medium text-neutral-900 dark:text-neutral-100 text-sm">
            {row.prenom} {row.nom}
          </p>
          <p className="text-xs text-neutral-500">{row.email}</p>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Type',
      accessor: (row: Transaction) => {
        const config = typeConfig[row.type as TransactionTypeKey] ?? { label: row.type, variant: 'neutral', icon: null }
        return (
          <Badge variant={config.variant as any} size="sm">
            {config.icon && <span className="mr-1">{config.icon}</span>}
            {config.label}
          </Badge>
        )
      },
      sortable: true,
      className: 'text-center w-[120px]',
    },
    {
      header: 'Montant',
      accessor: (row: Transaction) => (
        <span className={cn('font-bold text-sm', row.montant >= 0 ? 'text-accent-600 dark:text-accent-400' : 'text-red-500 dark:text-red-400')}>
          {row.montant >= 0 ? '+' : ''}{row.montant.toLocaleString()} FC
        </span>
      ),
      sortable: true,
      className: 'text-right w-[130px]',
    },
    {
      header: 'Description',
      accessor: (row: Transaction) => (
        <span className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 max-w-[250px] block">
          {row.description}
        </span>
      ),
    },
    {
      header: 'Portefeuille',
      accessor: (row: Transaction) => (
        <span className="text-xs capitalize text-neutral-500 dark:text-neutral-400">
          {row.portefeuille_type || '—'}
        </span>
      ),
      className: 'text-center w-[100px]',
    },
    {
      header: 'ID',
      accessor: (row: Transaction) => (
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-neutral-400">{String(row.id).slice(0, 8)}...</span>
          <button onClick={(e) => { e.stopPropagation(); handleCopyId(row.id) }} className="text-neutral-400 hover:text-gold-500">
            {copiedId === row.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
        </div>
      ),
    },
    {
      header: '',
      accessor: (row: Transaction) => (
        <Tooltip content="Détails">
          <button onClick={(e) => { e.stopPropagation(); setShowDetail(row) }} className="p-1.5 rounded-lg text-neutral-400 hover:text-gold-500">
            <Eye size={16} />
          </button>
        </Tooltip>
      ),
      className: 'w-10',
    },
  ]

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <Spinner size="xl" variant="premium" label="Chargement..." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />

      <Container className="py-8 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En-tête */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gold-100 dark:bg-gold-900/30 text-gold-600 dark:text-gold-400">
                  <FileText size={24} />
                </div>
                Historique des transactions
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                Vue complète des mouvements financiers
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline-gold" size="sm" onClick={() => setShowExportConfirm(true)} leftIcon={<Download size={14} />}>
                Export CSV
              </Button>
              <Button variant="outline-gold" size="sm" onClick={() => refetch()} leftIcon={<RefreshCcw size={16} />}>
                Actualiser
              </Button>
            </div>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { icon: <FileText size={20} className="text-gold-500" />, label: 'Total', value: stats.total },
              { icon: <TrendingUp size={20} className="text-green-500" />, label: 'Entrées', value: `${stats.entrees.toLocaleString()} FC` },
              { icon: <TrendingDown size={20} className="text-red-500" />, label: 'Sorties', value: `${stats.sorties.toLocaleString()} FC` },
              { icon: <BarChart3 size={20} className="text-blue-500" />, label: 'Filtre actif', value: filterType ? typeConfig[filterType as TransactionTypeKey]?.label || filterType : 'Tous' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-card rounded-xl p-4 border border-border flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">{stat.icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="font-bold text-foreground text-sm">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filtres */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
              <Input
                variant="glass"
                placeholder="Rechercher par email, description..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-10"
                allowClear
                onClear={() => setSearch('')}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setFilterType(''); setPage(1) }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition border',
                  !filterType ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm' : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                )}
              >
                Tous
              </button>
              {availableTypes.map((typeKey) => (
                <button
                  key={typeKey}
                  onClick={() => { setFilterType(typeKey); setPage(1) }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition border whitespace-nowrap',
                    filterType === typeKey ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm' : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                  )}
                >
                  {typeConfig[typeKey].label}
                </button>
              ))}
            </div>

            <div className="ml-auto text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {pagination.total} transaction(s)
            </div>
          </div>

          {/* Contenu principal */}
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} variant="glass" className="border-gold-400/20">
                  <CardContent className="p-5">
                    <Skeleton variant="text" className="w-full h-10" shimmer shimmerVariant="gold" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-4">{error?.message || 'Erreur de chargement'}</p>
              <Button variant="outline-gold" onClick={() => refetch()}>
                Réessayer
              </Button>
            </div>
          ) : transactions.length === 0 ? (
            <Card variant="glass" className="border-gold-400/20 text-center py-12">
              <CardContent>
                <FileText size={48} className="mx-auto text-neutral-400 mb-4" />
                <p className="text-neutral-500">Aucune transaction trouvée.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card variant="glass" className="border-gold-400/20 overflow-hidden">
                <Table
                  columns={columns}
                  data={transactions}
                  keyExtractor={(row) => row.id}
                  emptyMessage="Aucune transaction."
                  emptyIcon={<FileText size={48} className="text-neutral-400" />}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  loading={isLoading}
                />
              </Card>

              {pagination.totalPages > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                  totalItems={pagination.total}
                  pageSize={pageSize}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
                />
              )}
            </>
          )}
        </motion.div>
      </Container>

      {/* Modal détail transaction */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title="Détail de la transaction" size="sm" accent="gold">
        {showDetail && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono text-xs">{showDetail.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{typeConfig[showDetail.type as TransactionTypeKey]?.label || showDetail.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant</span>
              <span className="font-bold">{showDetail.montant.toLocaleString()} FC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{new Date(showDetail.date).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Utilisateur</span>
              <span>{showDetail.prenom} {showDetail.nom}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Portefeuille</span>
              <span>{showDetail.portefeuille_type || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Description</span>
              <span className="text-right max-w-[200px]">{showDetail.description}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal confirmation export */}
      <Modal isOpen={showExportConfirm} onClose={() => setShowExportConfirm(false)} title="Exporter les transactions" size="sm" accent="gold">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
          Un fichier CSV contenant toutes les transactions filtrées ({transactions.length} entrées) sera téléchargé.
        </p>
        <div className="flex gap-3">
          <Button variant="luxe" onClick={exportCSV}>Télécharger CSV</Button>
          <Button variant="outline" onClick={() => setShowExportConfirm(false)}>Annuler</Button>
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}