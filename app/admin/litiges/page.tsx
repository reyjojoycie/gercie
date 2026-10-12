// app/admin/litiges/page.tsx
'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import {
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Check,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Filter,
  Download,
  ArrowUpDown,
  Eye,
  ExternalLink,
  Users,
  Tag,
  History,
  RotateCcw,
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
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Litige {
  id: number
  commande: { id: string; numero: string; total: number } | null
  utilisateur: { email: string; nom: string; prenom: string; id: string }
  type: string
  description: string
  statut: string
  resolution: string | null
  created_at: string
  resolved_at: string | null
  resolved_by?: string | null
}

interface LitigesResponse {
  data: Litige[]
  pagination: {
    page: number
    totalPages: number
    total: number
  }
}

/* ------------------------------------------------------------------ */
/*  Configuration des statuts / types                                  */
/* ------------------------------------------------------------------ */
const statutConfig: Record<string, { variant: 'danger' | 'warm' | 'accent' | 'neutral'; label: string; icon: React.ReactNode }> = {
  ouvert: { variant: 'danger', label: 'Ouvert', icon: <AlertCircle size={12} /> },
  en_cours: { variant: 'warm', label: 'En cours', icon: <Clock size={12} /> },
  resolu: { variant: 'accent', label: 'Résolu', icon: <CheckCircle size={12} /> },
  rejete: { variant: 'neutral', label: 'Rejeté', icon: <XCircle size={12} /> },
}

const typeConfig: Record<string, { variant: 'brand' | 'accent' | 'luxury' | 'neutral'; label: string }> = {
  acheteur: { variant: 'brand', label: 'Acheteur' },
  vendeur: { variant: 'accent', label: 'Vendeur' },
  livraison: { variant: 'luxury', label: 'Livraison' },
  autre: { variant: 'neutral', label: 'Autre' },
}

/* ------------------------------------------------------------------ */
/*  Schéma Zod pour le traitement d’un litige                          */
/* ------------------------------------------------------------------ */
const traitementSchema = z.object({
  statut: z.enum(['ouvert', 'en_cours', 'resolu', 'rejete']),
  resolution: z.string().optional(),
}).refine((data) => {
  if (['resolu', 'rejete'].includes(data.statut) && (!data.resolution || data.resolution.trim().length === 0)) {
    return false
  }
  return true
}, { message: 'Une résolution est requise pour clore le litige', path: ['resolution'] })

type TraitementForm = z.infer<typeof traitementSchema>

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
export default function AdminLitigesPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // États (depuis URL ou valeurs par défaut)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [filterStatut, setFilterStatut] = useState<string>(searchParams.get('statut') || 'tous')
  const [filterType, setFilterType] = useState<string>(searchParams.get('type') || 'tous')
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pageSize, setPageSize] = useState(Number(searchParams.get('limit') || 10))
  const [sortColumn, setSortColumn] = useState(searchParams.get('sort') || 'created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>((searchParams.get('dir') as 'asc' | 'desc') || 'desc')
  const [selectedLitige, setSelectedLitige] = useState<Litige | null>(null)
  const [traitementModalOpen, setTraitementModalOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const debouncedSearch = useDebounce(search, 300)

  // Mise à jour de l'URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filterStatut !== 'tous') params.set('statut', filterStatut)
    if (filterType !== 'tous') params.set('type', filterType)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 10) params.set('limit', String(pageSize))
    if (sortColumn !== 'created_at') params.set('sort', sortColumn)
    if (sortDirection !== 'desc') params.set('dir', sortDirection)
    router.replace(`/admin/litiges?${params.toString()}`, { scroll: false })
  }, [debouncedSearch, filterStatut, filterType, page, pageSize, sortColumn, sortDirection, router])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TraitementForm>({
    resolver: zodResolver(traitementSchema),
  })

  // Redirection si non authentifié
  if (!authLoading && !user) {
    router.push('/login?redirect=/admin/litiges')
    return null
  }

  /* ---------- React Query : chargement des litiges ---------- */
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<LitigesResponse>({
    queryKey: ['admin-litiges', debouncedSearch, filterStatut, filterType, page, pageSize, sortColumn, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterStatut !== 'tous') params.set('statut', filterStatut)
      if (filterType !== 'tous') params.set('type', filterType)
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      params.set('sort_by', sortColumn)
      params.set('sort_order', sortDirection)
      const res = await fetch(`/api/admin/litiges?${params.toString()}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement litiges')
      const json = await res.json()
      return Array.isArray(json) ? { data: json, pagination: { page: 1, totalPages: 1, total: json.length } } : json
    },
    enabled: !!user,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const litiges = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, totalPages: 1, total: 0 }

  /* ---------- Mutation : mise à jour d’un litige ---------- */
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: TraitementForm & { id: number }) => {
      const res = await fetch(`/api/admin/litiges/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors de la mise à jour')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Litige mis à jour avec succès')
      queryClient.invalidateQueries({ queryKey: ['admin-litiges'] })
      setTraitementModalOpen(false)
      setSelectedLitige(null)
      setSelectedIds(new Set())
      reset()
    },
    onError: (err: any) => toast.error(err.message),
  })

  const handleOpenTraitement = (litige: Litige) => {
    setSelectedLitige(litige)
    reset({ statut: litige.statut as any, resolution: litige.resolution || '' })
    setTraitementModalOpen(true)
  }

  const handleTraitementSubmit = async (data: TraitementForm) => {
    if (!selectedLitige) return
    updateMutation.mutate({ id: selectedLitige.id, ...data })
  }

  const handleCopyId = (id: number) => {
    navigator.clipboard.writeText(String(id))
    setCopiedId(id)
    toast.success('ID copié')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const clearFilters = () => {
    setSearch('')
    setFilterStatut('tous')
    setFilterType('tous')
    setPage(1)
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
    if (litiges.length === 0) return
    const headers = ['ID', 'Type', 'Statut', 'Utilisateur', 'Email', 'Commande', 'Description', 'Date']
    const rows = litiges.map(l => [
      l.id,
      typeConfig[l.type]?.label || l.type,
      statutConfig[l.statut]?.label || l.statut,
      `${l.utilisateur?.prenom || ''} ${l.utilisateur?.nom || ''}`,
      l.utilisateur?.email || '',
      l.commande?.numero || '',
      l.description,
      new Date(l.created_at).toISOString(),
    ])
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `litiges_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const stats = useMemo(() => {
    const total = pagination.total
    const ouverts = litiges.filter(l => l.statut === 'ouvert').length
    const enCours = litiges.filter(l => l.statut === 'en_cours').length
    const resolus = litiges.filter(l => l.statut === 'resolu').length
    return { total, ouverts, enCours, resolus }
  }, [litiges, pagination.total])

  const hasActiveFilters = search || filterStatut !== 'tous' || filterType !== 'tous'

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <Spinner size="xl" variant="premium" label="Chargement..." />
      </div>
    )
  }

  const columns = [
    {
      header: '',
      accessor: (row: Litige) => (
        <button onClick={(e) => { e.stopPropagation(); toggleSelect(row.id) }} className="text-neutral-400 hover:text-gold-500">
          {selectedIds.has(row.id) ? (
            <CheckCircle size={18} className="text-gold-500" />
          ) : (
            <div className="w-4 h-4 rounded border border-neutral-300 dark:border-neutral-600" />
          )}
        </button>
      ),
      className: 'w-10',
    },
    {
      header: 'ID',
      accessor: (row: Litige) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{row.id}</span>
          <button onClick={(e) => { e.stopPropagation(); handleCopyId(row.id) }} className="text-neutral-400 hover:text-gold-500">
            {copiedId === row.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Type',
      accessor: (row: Litige) => {
        const t = typeConfig[row.type] ?? { variant: 'neutral', label: row.type }
        return <Badge variant={t.variant} size="sm">{t.label}</Badge>
      },
      sortable: true,
    },
    {
      header: 'Statut',
      accessor: (row: Litige) => {
        const s = statutConfig[row.statut] ?? { variant: 'neutral', label: row.statut, icon: undefined }
        return (
          <Badge variant={s.variant} size="sm">
            {s.icon && <span className="mr-1">{s.icon}</span>}
            {s.label}
          </Badge>
        )
      },
      sortable: true,
    },
    {
      header: 'Utilisateur',
      accessor: (row: Litige) => (
        <div className="text-sm">
          <p className="font-medium">{row.utilisateur?.prenom} {row.utilisateur?.nom}</p>
          <p className="text-xs text-muted-foreground">{row.utilisateur?.email}</p>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Commande',
      accessor: (row: Litige) => row.commande ? (
        <span className="text-sm">#{row.commande.numero} · {row.commande.total.toLocaleString()} FC</span>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      header: 'Date',
      accessor: (row: Litige) => (
        <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      ),
      sortable: true,
    },
    {
      header: 'Actions',
      accessor: (row: Litige) => (
        <div className="flex items-center gap-1">
          <Tooltip content="Traiter le litige">
            <Button variant="luxe" size="icon" onClick={(e) => { e.stopPropagation(); handleOpenTraitement(row) }}>
              <MessageSquare size={16} />
            </Button>
          </Tooltip>
          {row.commande && (
            <Tooltip content="Voir la commande">
              <a href={`/admin/commandes/${row.commande.id}`} onClick={e => e.stopPropagation()} className="p-2 text-neutral-400 hover:text-gold-500">
                <ExternalLink size={16} />
              </a>
            </Tooltip>
          )}
        </div>
      ),
      className: 'text-center',
    },
  ]

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
                <div className="p-2 rounded-xl bg-burgundy-100 dark:bg-burgundy-900/30 text-burgundy-600 dark:text-burgundy-400">
                  <AlertCircle size={24} />
                </div>
                Gestion des litiges
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                Superviser et résoudre les réclamations
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline-gold" size="sm" onClick={exportCSV} leftIcon={<Download size={14} />}>
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
              { icon: <AlertCircle size={20} className="text-red-500" />, label: 'Total', value: stats.total },
              { icon: <AlertCircle size={20} className="text-amber-500" />, label: 'Ouverts', value: stats.ouverts },
              { icon: <Clock size={20} className="text-blue-500" />, label: 'En cours', value: stats.enCours },
              { icon: <CheckCircle size={20} className="text-green-500" />, label: 'Résolus', value: stats.resolus },
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
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
              <Input
                variant="glass"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-10"
                allowClear
                onClear={() => setSearch('')}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {['tous', 'ouvert', 'en_cours', 'resolu', 'rejete'].map((s) => (
                <button
                  key={s}
                  onClick={() => { setFilterStatut(s); setPage(1) }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition border',
                    filterStatut === s
                      ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm'
                      : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                  )}
                >
                  {s === 'tous' ? 'Tous' : statutConfig[s]?.label ?? s}
                </button>
              ))}
              <select
                value={filterType}
                onChange={e => { setFilterType(e.target.value); setPage(1) }}
                className="bg-card border border-border rounded-full px-3 py-1.5 text-xs"
              >
                <option value="tous">Tous les types</option>
                {Object.entries(typeConfig).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-red-500">
                <XCircle size={14} className="mr-1" /> Effacer
              </Button>
            )}
            <div className="ml-auto text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {pagination.total} litige(s)
            </div>
          </div>

          {/* Actions groupées (si sélection) */}
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-gold-50 dark:bg-gold-900/20 rounded-xl border border-gold-400/30 flex items-center gap-4 flex-wrap"
            >
              <span className="text-sm font-medium text-gold-800 dark:text-gold-300">
                {selectedIds.size} litige(s) sélectionné(s)
              </span>
              <div className="flex gap-2">
                {['en_cours', 'resolu', 'rejete'].map(s => (
                  <Button key={s} variant="outline-gold" size="sm" onClick={() => {
                    // on pourrait ouvrir une modal pour traitement groupé
                    toast.success(`${selectedIds.size} litige(s) → ${statutConfig[s]?.label}`)
                  }}>
                    {statutConfig[s]?.label ?? s}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Annuler
              </Button>
            </motion.div>
          )}

          {/* Tableau */}
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
              <p className="text-red-500 mb-4">{(error as Error)?.message || 'Erreur de chargement'}</p>
              <Button variant="outline-gold" onClick={() => refetch()}>Réessayer</Button>
            </div>
          ) : litiges.length === 0 ? (
            <Card variant="glass" className="border-gold-400/20 text-center py-12">
              <CardContent>
                <ShieldCheck size={48} className="mx-auto text-neutral-400 mb-4" />
                <p className="text-neutral-500">Aucun litige trouvé.</p>
              </CardContent>
            </Card>
          ) : (
            <Card variant="glass" className="border-gold-400/20 overflow-hidden">
              <Table
                columns={columns}
                data={litiges}
                keyExtractor={(row) => row.id.toString()}
                emptyMessage="Aucun litige trouvé."
                emptyIcon={<ShieldCheck size={48} className="text-neutral-400" />}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                loading={isLoading}
              />
            </Card>
          )}

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

      {/* Modal de traitement */}
      <Modal
        isOpen={traitementModalOpen}
        onClose={() => { setTraitementModalOpen(false); setSelectedLitige(null) }}
        title={`Traiter le litige #${selectedLitige?.id ?? '—'}`}
        description="Modifiez le statut et ajoutez une résolution si nécessaire."
        size="md"
        accent="gold"
        closeOnOverlayClick={!updateMutation.isPending}
      >
        <form onSubmit={handleSubmit(handleTraitementSubmit)} className="space-y-5">
          {selectedLitige && (
            <div className="bg-neutral-50 dark:bg-midnight-700/40 rounded-xl p-4 text-sm space-y-2 border border-gold-400/10">
              <p className="font-medium text-neutral-800 dark:text-neutral-200">
                {selectedLitige.description}
              </p>
              {selectedLitige.commande && (
                <p className="text-neutral-500">
                  Commande : #{selectedLitige.commande.numero} · {selectedLitige.commande.total.toLocaleString()} FC
                </p>
              )}
              <p className="text-xs text-neutral-400">
                Signalé par {selectedLitige.utilisateur.prenom} {selectedLitige.utilisateur.nom} ({selectedLitige.utilisateur.email})
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Nouveau statut
            </label>
            <select
              {...register('statut')}
              className="w-full bg-white/50 dark:bg-midnight-800/50 backdrop-blur-sm border border-gold-400/20 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-gold-500/50 transition-colors"
            >
              {Object.keys(statutConfig).map(s => (
                <option key={s} value={s}>{statutConfig[s].label}</option>
              ))}
            </select>
            {errors.statut && <p className="text-red-500 text-xs mt-1">{errors.statut.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Résolution / Commentaire
              {['resolu', 'rejete'].includes(watch('statut')) && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              {...register('resolution')}
              rows={4}
              className="w-full bg-white/50 dark:bg-midnight-800/50 backdrop-blur-sm border border-gold-400/20 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-gold-500/50 transition-colors resize-none"
              placeholder="Expliquez la décision..."
            />
            {errors.resolution && <p className="text-red-500 text-xs mt-1">{errors.resolution.message}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              variant="luxe"
              fullWidth
              loading={isSubmitting || updateMutation.isPending}
            >
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="outline-gold"
              fullWidth
              onClick={() => { setTraitementModalOpen(false); setSelectedLitige(null) }}
              disabled={isSubmitting || updateMutation.isPending}
            >
              Annuler
            </Button>
          </div>
        </form>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}