// app/admin/retraits/page.tsx
'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import {
  Search,
  Check,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Wallet,
  Clock,
  User,
  DollarSign,
  ShieldCheck,
  FileText,
  Filter,
  Download,
  ArrowUpDown,
  Eye,
  MoreVertical,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Hourglass,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Retrait {
  id: string
  userId: string
  montant: number
  description: string
  date: string
  status: string
  commentaire?: string | null
  utilisateur: {
    email: string
    nom: string
    prenom: string
    telephone?: string
  } | null
  methode?: string // mobile money, etc.
}

interface RetraitsResponse {
  data: Retrait[]
  pagination: {
    page: number
    totalPages: number
    total: number
  }
}

type RetraitStatus = 'pending' | 'approved' | 'rejected' | 'all'

/* ------------------------------------------------------------------ */
/*  Configuration des statuts                                          */
/* ------------------------------------------------------------------ */
const statutFilters: { key: RetraitStatus; label: string; variant: 'warm' | 'accent' | 'danger' | 'neutral' }[] = [
  { key: 'pending', label: 'En attente', variant: 'warm' },
  { key: 'approved', label: 'Approuvés', variant: 'accent' },
  { key: 'rejected', label: 'Rejetés', variant: 'danger' },
  { key: 'all', label: 'Tous', variant: 'neutral' },
]

const getStatusBadge = (status: string) => {
  if (status === 'approved') return { variant: 'accent' as const, label: 'Approuvé', icon: <Check size={12} /> }
  if (status === 'rejected') return { variant: 'danger' as const, label: 'Rejeté', icon: <X size={12} /> }
  return { variant: 'warm' as const, label: 'En attente', icon: <Clock size={12} /> }
}

/* ------------------------------------------------------------------ */
/*  Schéma Zod pour le traitement d'un retrait                         */
/* ------------------------------------------------------------------ */
const traitementRetraitSchema = z.object({
  retraitId: z.string().uuid(),
  action: z.enum(['approved', 'rejected']),
  commentaire: z.string().optional(),
})

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
            {[10, 25, 50].map(size => (
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
export default function DemandesRetraitPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<RetraitStatus>(
    (searchParams.get('status') as RetraitStatus) || 'pending'
  )
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pageSize, setPageSize] = useState(Number(searchParams.get('limit') || 10))
  const [sortColumn, setSortColumn] = useState(searchParams.get('sort') || 'date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    (searchParams.get('dir') as 'asc' | 'desc') || 'desc'
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState<{ retrait: Retrait; action: 'approved' | 'rejected' } | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [showExportConfirm, setShowExportConfirm] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  // Mise à jour de l'URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (activeTab !== 'pending') params.set('status', activeTab)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 10) params.set('limit', String(pageSize))
    if (sortColumn !== 'date') params.set('sort', sortColumn)
    if (sortDirection !== 'desc') params.set('dir', sortDirection)
    router.replace(`/admin/retraits?${params.toString()}`, { scroll: false })
  }, [activeTab, debouncedSearch, page, pageSize, sortColumn, sortDirection, router])

  // Redirection si non authentifié
  if (!authLoading && !user) {
    router.push('/login?redirect=/admin/retraits')
    return null
  }

  /* ---------- React Query : chargement des retraits ---------- */
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<RetraitsResponse>({
    queryKey: ['admin-retraits', activeTab, debouncedSearch, page, pageSize, sortColumn, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (activeTab !== 'all') params.set('status', activeTab)
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      params.set('sort_by', sortColumn)
      params.set('sort_order', sortDirection)

      const res = await fetch(`/api/admin/retraits?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur chargement des retraits')
      }
      return res.json()
    },
    enabled: !!user,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const retraits = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, totalPages: 1, total: 0 }

  /* ---------- Mutation : traitement d'un retrait ---------- */
  const traitementMutation = useMutation({
    mutationFn: async (payload: { retraitIds: string[]; action: 'approved' | 'rejected'; commentaire?: string }) => {
      const res = await fetch('/api/admin/retraits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors du traitement')
      return res.json()
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === 'approved'
          ? `${variables.retraitIds.length} retrait(s) approuvé(s)`
          : `${variables.retraitIds.length} retrait(s) refusé(s)`
      )
      queryClient.invalidateQueries({ queryKey: ['admin-retraits'] })
      setSelectedIds(new Set())
      setShowModal(null)
      setCommentaire('')
    },
    onError: (err: any) => toast.error(err.message),
  })

  const handleAction = (retrait: Retrait, action: 'approved' | 'rejected') => {
    setShowModal({ retrait, action })
    setCommentaire('')
  }

  const handleBulkAction = (action: 'approved' | 'rejected') => {
    if (selectedIds.size === 0) {
      toast.error('Aucune demande sélectionnée')
      return
    }
    // On utilise la modal avec un résumé pour le bulk
    const firstRetrait = retraits.find(r => selectedIds.has(r.id))
    if (!firstRetrait) return
    setShowModal({ retrait: firstRetrait, action })
    setCommentaire('')
  }

  const confirmAction = () => {
    if (!showModal) return
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : [showModal.retrait.id]
    traitementMutation.mutate({
      retraitIds: ids,
      action: showModal.action,
      commentaire: commentaire || undefined,
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.size === retraits.length ? new Set() : new Set(retraits.map(r => r.id))
    )
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

  // Stats rapides
  const stats = useMemo(() => {
    const total = pagination.total
    const pending = retraits.filter(r => r.status === 'pending').length
    const approved = retraits.filter(r => r.status === 'approved').length
    const rejected = retraits.filter(r => r.status === 'rejected').length
    const totalAmount = retraits
      .filter(r => r.status === 'pending')
      .reduce((acc, r) => acc + r.montant, 0)
    return { total, pending, approved, rejected, totalAmount }
  }, [retraits, pagination.total])

  const exportCSV = () => {
    if (retraits.length === 0) return
    const headers = ['ID', 'Demandeur', 'Email', 'Montant (FC)', 'Statut', 'Date']
    const rows = retraits.map(r => [
      r.id,
      `${r.utilisateur?.prenom || ''} ${r.utilisateur?.nom || ''}`,
      r.utilisateur?.email || '',
      r.montant,
      r.status,
      new Date(r.date).toISOString(),
    ])
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `retraits_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportConfirm(false)
  }

  const columns = [
    {
      header: '',
      accessor: (row: Retrait) => (
        <button onClick={(e) => { e.stopPropagation(); toggleSelect(row.id) }} className="text-neutral-400 hover:text-gold-500">
          {selectedIds.has(row.id) ? (
            <CheckCircle2 size={18} className="text-gold-500" />
          ) : (
            <div className="w-4 h-4 rounded border border-neutral-300 dark:border-neutral-600" />
          )}
        </button>
      ),
      className: 'w-10',
    },
    {
      header: 'Demandeur',
      accessor: (row: Retrait) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center text-gold-600 font-bold text-xs border border-gold-400/20">
            {row.utilisateur?.prenom?.[0]}{row.utilisateur?.nom?.[0]}
          </div>
          <div>
            <p className="font-medium text-foreground">
              {row.utilisateur?.prenom} {row.utilisateur?.nom}
            </p>
            <p className="text-xs text-muted-foreground">{row.utilisateur?.email}</p>
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Montant',
      accessor: (row: Retrait) => (
        <span className="font-bold text-gold-600">{row.montant.toLocaleString()} FC</span>
      ),
      sortable: true,
    },
    {
      header: 'Statut',
      accessor: (row: Retrait) => {
        const badge = getStatusBadge(row.status)
        return (
          <Badge variant={badge.variant} size="sm">
            {badge.icon && <span className="mr-1">{badge.icon}</span>}
            {badge.label}
          </Badge>
        )
      },
      sortable: true,
    },
    {
      header: 'Date',
      accessor: (row: Retrait) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.date)}</span>
      ),
      sortable: true,
    },
    {
      header: 'Actions',
      accessor: (row: Retrait) =>
        row.status === 'pending' ? (
          <div className="flex items-center gap-2">
            <Tooltip content="Approuver">
              <Button
                variant="accent"
                size="icon"
                onClick={(e) => { e.stopPropagation(); handleAction(row, 'approved') }}
                disabled={traitementMutation.isPending}
              >
                <Check size={16} />
              </Button>
            </Tooltip>
            <Tooltip content="Rejeter">
              <Button
                variant="danger"
                size="icon"
                onClick={(e) => { e.stopPropagation(); handleAction(row, 'rejected') }}
                disabled={traitementMutation.isPending}
              >
                <X size={16} />
              </Button>
            </Tooltip>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">Traité</span>
        ),
      className: 'text-center',
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* En-tête */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gold-100 dark:bg-gold-900/30 text-gold-600 dark:text-gold-400">
                  <Wallet size={24} />
                </div>
                Demandes de retrait
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                Gérez les demandes de retrait des vendeurs
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

          {/* Stats rapides */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { icon: <FileText size={20} className="text-gold-500" />, label: 'Total', value: stats.total },
              { icon: <Clock size={20} className="text-amber-500" />, label: 'En attente', value: stats.pending },
              { icon: <CheckCircle2 size={20} className="text-green-500" />, label: 'Approuvés', value: stats.approved },
              { icon: <XCircle size={20} className="text-red-500" />, label: 'Rejetés', value: stats.rejected },
            ].map((stat, idx) => (
              <div key={idx} className="bg-card rounded-xl p-4 border border-border flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">{stat.icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="font-bold text-foreground">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filtres */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center">
            <div className="flex gap-2 flex-wrap">
              {statutFilters.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setPage(1) }}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium transition border whitespace-nowrap',
                    activeTab === tab.key
                      ? 'bg-gold-400/20 border-gold-400/50 text-gold-600 dark:text-gold-400 shadow-gold'
                      : 'bg-white/50 dark:bg-midnight-800/50 border-gold-400/20 text-neutral-600 dark:text-neutral-400 hover:border-gold-400'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
              <Input
                variant="glass"
                placeholder="Rechercher par email, nom..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-10"
                allowClear
                onClear={() => setSearch('')}
              />
            </div>

            <div className="ml-auto text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {pagination.total} demande(s)
            </div>
          </div>

          {/* Actions groupées */}
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-gold-50 dark:bg-gold-900/20 rounded-xl border border-gold-400/30 flex items-center gap-4 flex-wrap"
            >
              <span className="text-sm font-medium text-gold-800 dark:text-gold-300">
                {selectedIds.size} demande(s) sélectionnée(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => handleBulkAction('approved')}
                  disabled={traitementMutation.isPending}
                >
                  Approuver
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleBulkAction('rejected')}
                  disabled={traitementMutation.isPending}
                >
                  Rejeter
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Annuler
              </Button>
            </motion.div>
          )}

          {/* Contenu */}
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} variant="glass" className="border-gold-400/20">
                  <CardContent className="p-5">
                    <Skeleton variant="text" className="w-48 h-6 mb-3" shimmer shimmerVariant="gold" />
                    <Skeleton variant="text" className="w-2/3 h-4" shimmer shimmerVariant="gold" />
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
          ) : retraits.length === 0 ? (
            <Card variant="glass" className="border-gold-400/20 text-center py-12">
              <CardContent>
                <FileText size={48} className="mx-auto text-neutral-400 mb-4" />
                <p className="text-neutral-500">Aucune demande de retrait trouvée.</p>
              </CardContent>
            </Card>
          ) : (
            <Card variant="glass" className="border-gold-400/20 overflow-hidden">
              <Table
                columns={columns}
                data={retraits}
                keyExtractor={(row) => row.id}
                emptyMessage="Aucune demande de retrait trouvée."
                emptyIcon={<FileText size={48} className="text-neutral-400" />}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                loading={isLoading}
              />
            </Card>
          )}

          {/* Pagination */}
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
        </motion.div>
      </Container>

      {/* Modal de confirmation */}
      <Modal
        isOpen={!!showModal}
        onClose={() => setShowModal(null)}
        title={showModal?.action === 'approved' ? 'Approuver le retrait' : 'Rejeter le retrait'}
        description={
          showModal && selectedIds.size > 1
            ? `${selectedIds.size} retrait(s) sélectionné(s)`
            : undefined
        }
        size="sm"
        accent={showModal?.action === 'approved' ? 'gold' : 'danger'}
        closeOnOverlayClick={!traitementMutation.isPending}
      >
        {showModal && (
          <div className="space-y-5">
            {selectedIds.size <= 1 && (
              <div className="bg-neutral-50 dark:bg-midnight-700/40 rounded-xl p-4 text-sm space-y-2 border border-gold-400/10">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Montant</span>
                  <span className="font-bold text-gold-600 dark:text-gold-400">
                    {showModal.retrait.montant.toLocaleString()} FC
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Demandeur</span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {showModal.retrait.utilisateur?.prenom} {showModal.retrait.utilisateur?.nom}
                  </span>
                </div>
              </div>
            )}

            {showModal.action === 'rejected' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Motif du rejet (optionnel)
                </label>
                <textarea
                  rows={3}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  className="w-full bg-white/50 dark:bg-midnight-800/50 backdrop-blur-sm border border-gold-400/20 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-red-500/50 transition-colors resize-none"
                  placeholder="Raison du rejet..."
                />
              </div>
            )}

            <p className="text-xs text-neutral-500">
              {showModal.action === 'approved'
                ? 'Cette action créditera le compte mobile money du vendeur.'
                : 'Le montant sera recrédité sur le portefeuille vente du demandeur.'}
            </p>

            <div className="flex gap-3">
              <Button
                variant={showModal.action === 'approved' ? 'accent' : 'danger'}
                fullWidth
                onClick={confirmAction}
                loading={traitementMutation.isPending}
                leftIcon={showModal.action === 'approved' ? <Check size={16} /> : <X size={16} />}
              >
                {showModal.action === 'approved' ? 'Approuver' : 'Rejeter'}
              </Button>
              <Button
                variant="outline"
                fullWidth
                onClick={() => setShowModal(null)}
                disabled={traitementMutation.isPending}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal confirmation export */}
      <Modal isOpen={showExportConfirm} onClose={() => setShowExportConfirm(false)} title="Exporter les retraits" size="sm" accent="gold">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
          Un fichier CSV contenant toutes les demandes filtrées ({retraits.length} entrées) sera téléchargé.
        </p>
        <div className="flex gap-3">
          <Button variant="luxe" onClick={exportCSV}>Télécharger CSV</Button>
          <Button variant="outline" onClick={() => setShowExportConfirm(false)}>Annuler</Button>
        </div>
      </Modal>
    </div>
  )
}