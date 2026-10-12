// app/admin/commandes/page.tsx
'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import {
  Search, ChevronRight, Package, Filter, X, ChevronLeft, AlertTriangle, Loader2,
  ShoppingBag, Truck, MapPin, User, Calendar, BadgeCheck, AlertCircle, CheckCircle2,
  RefreshCcw, Download, Eye, MoreVertical, ArrowUpDown, Clock, CreditCard,
  CheckSquare, Square, ExternalLink, Star, DollarSign, BarChart3, TrendingUp,
  FileText, Printer, RotateCcw, History, Ban, Circle, Map, Phone, Info,
  ChevronDown, Sliders, Layers, Copy, Send, Edit3, Trash2, PlusCircle,
  Key, ShieldCheck, QrCode, ClipboardCheck, TimerReset
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'

/* ------------------------------------------------------------------ */
/*  Types enrichies – ajout des champs de double validation            */
/* ------------------------------------------------------------------ */
interface Article {
  produit_id: string
  nom: string
  quantite: number
  prix_unitaire: number
  image?: string
}

interface Commande {
  id: string
  numero: string
  total: number
  sous_total: number
  frais_livraison: number
  remise: number
  code_promo?: string
  statut: string
  date: string
  type_livraison: string
  acheteur: { id: string; nom: string; prenom: string; email: string; telephone?: string }
  articles: Article[]
  adresse_livraison?: string
  point_retrait?: string
  livreur?: { id: string; nom: string; prenom: string }
  note_interne?: string
  numero_suivi?: string
  mode_paiement?: string
  code_client?: string          // nouveau
  code_livreur?: string         // nouveau
  mode_attribution?: 'LIBRE' | 'ASSIGNE'  // nouveau
}

interface CommandesResponse {
  data: Commande[]
  total: number
  page: number
  totalPages: number
  chiffre_affaires: number
  panier_moyen: number
  commandes_jour: number
}

/* ------------------------------------------------------------------ */
/*  Colonnes autorisées pour le tri côté serveur                        */
/* ------------------------------------------------------------------ */
const SERVER_SORTABLE_COLUMNS = ['created_at', 'total', 'statut', 'date']

/* ------------------------------------------------------------------ */
/*  Composants Table & Pagination (inchangés)                          */
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
export default function AdminCommandesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const toast = useToast()

  // États des filtres
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [filterStatut, setFilterStatut] = useState(searchParams.get('statut') || '')
  const [filterLivraison, setFilterLivraison] = useState(searchParams.get('livraison') || '')
  const [filterDateDebut, setFilterDateDebut] = useState(searchParams.get('date_debut') || '')
  const [filterDateFin, setFilterDateFin] = useState(searchParams.get('date_fin') || '')
  const [filterMin, setFilterMin] = useState(searchParams.get('min') || '')
  const [filterMax, setFilterMax] = useState(searchParams.get('max') || '')

  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pageSize, setPageSize] = useState(Number(searchParams.get('limit') || 10))
  const [sortColumn, setSortColumn] = useState(searchParams.get('sort') || 'created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>((searchParams.get('dir') as 'asc' | 'desc') || 'desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [changeStatutModal, setChangeStatutModal] = useState<{ commandeIds: string[]; newStatut: string } | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [showExportConfirm, setShowExportConfirm] = useState(false)
  const [detailCommande, setDetailCommande] = useState<Commande | null>(null)
  const [assignLivreurModal, setAssignLivreurModal] = useState<Commande | null>(null)
  const [livreurs, setLivreurs] = useState<any[]>([])
  const [selectedLivreurId, setSelectedLivreurId] = useState('')
  const [noteInterne, setNoteInterne] = useState('')
  const [showNotesModal, setShowNotesModal] = useState<Commande | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Nouveaux états pour la double validation
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set()) // IDs de commandes dont on révèle un code
  const [validateCollecteModal, setValidateCollecteModal] = useState<Commande | null>(null)
  const [saisiCodeLivreur, setSaisiCodeLivreur] = useState('')

  const debouncedSearch = useDebounce(search, 300)

  // Synchronisation URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filterStatut) params.set('statut', filterStatut)
    if (filterLivraison) params.set('livraison', filterLivraison)
    if (filterDateDebut) params.set('date_debut', filterDateDebut)
    if (filterDateFin) params.set('date_fin', filterDateFin)
    if (filterMin) params.set('min', filterMin)
    if (filterMax) params.set('max', filterMax)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 10) params.set('limit', String(pageSize))
    if (sortColumn && SERVER_SORTABLE_COLUMNS.includes(sortColumn)) {
      params.set('sort', sortColumn)
      params.set('dir', sortDirection)
    }
    router.replace(`/admin/commandes?${params.toString()}`, { scroll: false })
  }, [debouncedSearch, filterStatut, filterLivraison, filterDateDebut, filterDateFin, filterMin, filterMax, page, pageSize, sortColumn, sortDirection, router])

  // Auto‑refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => refetch(), 30_000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  // Chargement des livreurs pour assignation
  useEffect(() => {
    fetch('/api/admin/livreurs?limit=100')
      .then(r => r.json())
      .then(d => setLivreurs(d.data || []))
      .catch(() => [])
  }, [])

  // Query
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<CommandesResponse>({
    queryKey: ['admin-commandes', debouncedSearch, filterStatut, filterLivraison, filterDateDebut, filterDateFin, filterMin, filterMax, page, pageSize, sortColumn, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterStatut) params.set('statut', filterStatut)
      if (filterLivraison) params.set('livraison', filterLivraison)
      if (filterDateDebut) params.set('date_debut', filterDateDebut)
      if (filterDateFin) params.set('date_fin', filterDateFin)
      if (filterMin) params.set('min', filterMin)
      if (filterMax) params.set('max', filterMax)
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      if (sortColumn && SERVER_SORTABLE_COLUMNS.includes(sortColumn)) {
        params.set('sort_by', sortColumn)
        params.set('sort_order', sortDirection)
      }
      const res = await fetch(`/api/admin/commandes?${params.toString()}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      return res.json()
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const rawCommandes = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const chiffreAffaires = data?.chiffre_affaires ?? 0
  const panierMoyen = data?.panier_moyen ?? 0
  const commandesJour = data?.commandes_jour ?? 0

  // Tri local si la colonne n'est pas gérée par le serveur
  const commandes = useMemo(() => {
    if (SERVER_SORTABLE_COLUMNS.includes(sortColumn)) return rawCommandes
    const sorted = [...rawCommandes]
    sorted.sort((a, b) => {
      let valA: any, valB: any
      switch (sortColumn) {
        case 'N°':
          valA = a.numero
          valB = b.numero
          break
        case 'Client':
          valA = (a.acheteur?.nom + ' ' + a.acheteur?.prenom).toLowerCase()
          valB = (b.acheteur?.nom + ' ' + b.acheteur?.prenom).toLowerCase()
          break
        case 'Livraison':
          valA = a.type_livraison
          valB = b.type_livraison
          break
        case 'Articles':
          valA = a.articles?.length || 0
          valB = b.articles?.length || 0
          break
        default:
          return 0
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [rawCommandes, sortColumn, sortDirection])

  // Mutations
  const updateStatutMutation = useMutation({
    mutationFn: async ({ commandeIds, newStatut, comment }: { commandeIds: string[]; newStatut: string; comment?: string }) => {
      const res = await fetch('/api/admin/commandes/bulk-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: commandeIds, statut: newStatut, commentaire: comment }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commandes'] })
      toast.addToast({ type: 'success', message: 'Statut(s) mis à jour' })
      setSelectedIds(new Set())
      setChangeStatutModal(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const assignLivreurMutation = useMutation({
    mutationFn: async ({ commandeId, livreurId }: { commandeId: string; livreurId: string }) => {
      const res = await fetch(`/api/admin/commandes/${commandeId}/assigner-livreur`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ livreur_id: livreurId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commandes'] })
      toast.addToast({ type: 'success', message: 'Livreur assigné et code livreur généré' })
      setAssignLivreurModal(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const saveNoteMutation = useMutation({
    mutationFn: async ({ commandeId, note }: { commandeId: string; note: string }) => {
      const res = await fetch(`/api/admin/commandes/${commandeId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_interne: note }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commandes'] })
      toast.addToast({ type: 'success', message: 'Note enregistrée' })
      setShowNotesModal(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  // Nouvelle mutation pour valider la collecte (saisie du code livreur par l'admin)
  const validateCollecteMutation = useMutation({
    mutationFn: async ({ commandeId, code }: { commandeId: string; code: string }) => {
      const res = await fetch(`/api/commandes/${commandeId}/valider-collecte`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_livreur: code }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commandes'] })
      toast.addToast({ type: 'success', message: 'Collecte validée – commande en cours de livraison' })
      setValidateCollecteModal(null)
      setSaisiCodeLivreur('')
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  // Handlers
  const handleStatutChangeClick = (commande: Commande, newStatut: string) => {
    setChangeStatutModal({ commandeIds: [commande.id], newStatut })
    setCommentaire('')
  }

  const handleBulkStatutChangeClick = (newStatut: string) => {
    if (selectedIds.size === 0) {
      toast.addToast({ type: 'error', message: 'Aucune commande sélectionnée' })
      return
    }
    setChangeStatutModal({ commandeIds: Array.from(selectedIds), newStatut })
    setCommentaire('')
  }

  const confirmStatutChange = async () => {
    if (!changeStatutModal) return
    updateStatutMutation.mutate({
      commandeIds: changeStatutModal.commandeIds,
      newStatut: changeStatutModal.newStatut,
      comment: commentaire,
    })
  }

  const resetFilters = () => {
    setSearch(''); setFilterStatut(''); setFilterLivraison(''); setFilterDateDebut(''); setFilterDateFin(''); setFilterMin(''); setFilterMax(''); setPage(1)
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => (prev.size === commandes.length ? new Set() : new Set(commandes.map(c => c.id))))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportCSV = () => {
    if (commandes.length === 0) return
    const headers = ['Numéro', 'Client', 'Total (FC)', 'Statut', 'Livraison', 'Date', 'Livreur', 'Suivi', 'Remise', 'Code promo', 'Code Client', 'Code Livreur', 'Attribution']
    const rows = commandes.map(c => [
      c.numero,
      `${c.acheteur?.prenom || ''} ${c.acheteur?.nom || ''}`,
      c.total,
      c.statut,
      c.type_livraison,
      new Date(c.date).toISOString(),
      c.livreur ? `${c.livreur.prenom} ${c.livreur.nom}` : '',
      c.numero_suivi || '',
      c.remise,
      c.code_promo || '',
      c.code_client || '',
      c.code_livreur || '',
      c.mode_attribution || '',
    ])
    const csvContent = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `commandes_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportConfirm(false)
  }

  // Configuration des statuts enrichie
  const statutOptions = [
    { value: '', label: 'Tous les statuts' },
    { value: 'en_attente', label: 'En attente' },
    { value: 'payee', label: 'Payée' },
    { value: 'conditionnement_premium', label: 'Conditionnement Premium' }, // nouveau
    { value: 'collecte', label: 'Collecte' },
    { value: 'en_livraison', label: 'En livraison' },
    { value: 'livree', label: 'Livrée' },
    { value: 'annulee', label: 'Annulée' },
  ]

  const statutConfig: Record<string, { variant: 'warm' | 'gold' | 'accent' | 'danger' | 'neutral'; label: string }> = {
    en_attente: { variant: 'warm', label: 'En attente' },
    payee: { variant: 'gold', label: 'Payée' },
    conditionnement_premium: { variant: 'neutral', label: 'Cond. Premium' }, // nouveau
    collecte: { variant: 'neutral', label: 'Préparation' },
    en_livraison: { variant: 'warm', label: 'En livraison' },
    livree: { variant: 'accent', label: 'Livrée' },
    annulee: { variant: 'danger', label: 'Annulée' },
  }

  const statutCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    commandes.forEach(c => {
      counts[c.statut] = (counts[c.statut] || 0) + 1
    })
    return counts
  }, [commandes])

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  // Révélation temporaire d’un code
  const revealCode = (commandeId: string) => {
    setRevealedCodes(prev => new Set(prev).add(commandeId))
    setTimeout(() => {
      setRevealedCodes(prev => {
        const next = new Set(prev)
        next.delete(commandeId)
        return next
      })
    }, 15000)
  }

  const columns = [
    {
      header: '',
      accessor: (row: Commande) => (
        <button onClick={(e) => { e.stopPropagation(); toggleSelect(row.id) }} className="text-neutral-400 hover:text-gold-500">
          {selectedIds.has(row.id) ? <CheckSquare size={18} className="text-gold-500" /> : <Square size={18} />}
        </button>
      ),
      className: 'w-10',
    },
    {
      header: 'N°',
      accessor: (row: Commande) => (
        <div className="flex items-center gap-2">
          <Link href={`/admin/commandes/${row.id}`} className="font-bold text-foreground hover:text-gold-500">{row.numero}</Link>
          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(row.numero); toast.addToast({ type: 'success', message: 'Numéro copié' }) }} className="text-neutral-400 hover:text-gold-500">
            <Copy size={14} />
          </button>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Client',
      accessor: (row: Commande) => {
        const clientId = row.acheteur?.id
        const clientName = `${row.acheteur?.prenom || ''} ${row.acheteur?.nom || ''}`.trim() || 'Client inconnu'
        if (clientId) {
          return (
            <Link href={`/admin/utilisateurs/${clientId}`} className="flex items-center gap-2 hover:text-gold-500" onClick={(e) => e.stopPropagation()}>
              <User size={16} className="text-gold-500" />
              <span className="text-foreground">{clientName}</span>
            </Link>
          )
        }
        return (
          <div className="flex items-center gap-2">
            <User size={16} className="text-muted-foreground" />
            <span className="text-muted-foreground">{clientName}</span>
          </div>
        )
      },
      sortable: true,
    },
    {
      header: 'Total',
      accessor: (row: Commande) => (
        <div>
          <span className="font-bold text-gold-600">{row.total.toLocaleString()} FC</span>
          {row.remise > 0 && <span className="text-xs text-green-600 block">-{row.remise.toLocaleString()} FC</span>}
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Statut',
      accessor: (row: Commande) => (
        <Badge variant={statutConfig[row.statut]?.variant || 'neutral'} size="sm">
          {statutConfig[row.statut]?.label || row.statut}
        </Badge>
      ),
      sortable: true,
    },
    {
      header: 'Livraison',
      accessor: (row: Commande) => (
        <div className="flex items-center gap-1">
          {row.type_livraison === 'domicile' ? <MapPin size={14} className="text-gold-500" /> : <Package size={14} className="text-gold-500" />}
          <span className="text-sm">{row.type_livraison === 'domicile' ? 'Domicile' : 'Retrait'}</span>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Livreur',
      accessor: (row: Commande) => (
        row.livreur ? (
          <span className="text-sm">{row.livreur.prenom} {row.livreur.nom}</span>
        ) : (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setAssignLivreurModal(row) }} className="text-xs">
            <PlusCircle size={14} className="mr-1" /> Assigner
          </Button>
        )
      ),
    },
    {
      header: 'Codes',
      accessor: (row: Commande) => {
        const isRevealed = revealedCodes.has(row.id)
        return (
          <div className="flex items-center gap-2 text-xs">
            {row.code_client ? (
              <Tooltip content={isRevealed ? row.code_client : 'Cliquez pour voir le code client'}>
                <button
                  onClick={(e) => { e.stopPropagation(); revealCode(row.id) }}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-gold-500/5 border border-gold-400/20 hover:bg-gold-500/10"
                >
                  <Key size={12} className="text-gold-500" />
                  {isRevealed ? <span className="font-mono font-bold">{row.code_client}</span> : 'Client'}
                </button>
              </Tooltip>
            ) : null}
            {row.code_livreur ? (
              <Tooltip content={isRevealed ? row.code_livreur : 'Cliquez pour voir le code livreur'}>
                <button
                  onClick={(e) => { e.stopPropagation(); revealCode(row.id) }}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/5 border border-blue-400/20 hover:bg-blue-500/10"
                >
                  <Truck size={12} className="text-blue-500" />
                  {isRevealed ? <span className="font-mono font-bold">{row.code_livreur}</span> : 'Livreur'}
                </button>
              </Tooltip>
            ) : null}
          </div>
        )
      },
    },
    {
      header: 'Attribution',
      accessor: (row: Commande) => (
        <Badge variant={row.mode_attribution === 'ASSIGNE' ? 'gold' : 'neutral'} size="sm">
          {row.mode_attribution === 'ASSIGNE' ? 'Assigné' : 'Libre'}
        </Badge>
      ),
    },
    {
      header: 'Date',
      accessor: (row: Commande) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      ),
      sortable: true,
    },
    {
      header: 'Articles',
      accessor: (row: Commande) => (
        <span className="text-sm">{row.articles?.length || 0}</span>
      ),
      sortable: true,
    },
    {
      header: 'Actions',
      accessor: (row: Commande) => (
        <div className="flex items-center gap-1 flex-wrap">
          <Tooltip content="Détails (page complète)">
            <Link href={`/admin/commandes/${row.id}`} className="p-1.5 rounded-lg text-neutral-400 hover:text-gold-500" onClick={(e) => e.stopPropagation()}>
              <Eye size={16} />
            </Link>
          </Tooltip>
          <Tooltip content="Notes internes">
            <button onClick={(e) => { e.stopPropagation(); setShowNotesModal(row); setNoteInterne(row.note_interne || '') }} className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-500">
              <Edit3 size={16} />
            </button>
          </Tooltip>
          {/* Bouton de validation de collecte (dispatch) */}
          {['conditionnement_premium', 'collecte'].includes(row.statut) && row.code_livreur && (
            <Tooltip content="Valider la collecte (saisir code livreur)">
              <button
                onClick={(e) => { e.stopPropagation(); setValidateCollecteModal(row); setSaisiCodeLivreur('') }}
                className="p-1.5 rounded-lg text-green-600 hover:text-green-500"
              >
                <ClipboardCheck size={16} />
              </button>
            </Tooltip>
          )}
          <select
            value={row.statut}
            onChange={e => handleStatutChangeClick(row, e.target.value)}
            className="text-xs border border-border rounded-lg px-2 py-1 bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            {Object.keys(statutConfig).map(s => (
              <option key={s} value={s}>{statutConfig[s].label}</option>
            ))}
          </select>
        </div>
      ),
      className: 'text-center',
    },
  ]

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />

      {/* En-tête sticky avec stats */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/70 dark:bg-midnight-900/70 border-b border-gold-400/20 shadow-soft">
        <Container className="py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">Supervision des commandes</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {total} commandes · CA : {chiffreAffaires.toLocaleString()} FC · Panier moy. : {panierMoyen.toLocaleString()} FC · Aujourd'hui : {commandesJour}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline-gold" size="sm" onClick={() => setAutoRefresh(!autoRefresh)} className={cn(autoRefresh && 'text-green-600 border-green-400')}>
              <RefreshCcw size={16} className={cn(autoRefresh && 'animate-spin')} /> {autoRefresh ? 'Auto' : 'Refresh'}
            </Button>
            <Button variant="outline-gold" size="sm" onClick={() => setShowExportConfirm(true)} leftIcon={<Download size={14} />}>Export CSV</Button>
            <Button variant="outline-gold" size="sm" onClick={() => refetch()} leftIcon={<RefreshCcw size={16} />}>Actualiser</Button>
          </div>
        </Container>
      </div>

      <Container className="py-8 relative z-10 max-w-7xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* Résumé rapide des statuts */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {Object.entries(statutConfig).map(([key, { variant, label }]) => (
              <button
                key={key}
                onClick={() => { setFilterStatut(key); setPage(1) }}
                className={cn(
                  'p-3 rounded-xl border text-center transition-all',
                  filterStatut === key
                    ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/20 shadow-gold'
                    : 'border-border bg-card hover:border-gold-400/50',
                )}
              >
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="text-xl font-bold text-foreground">{statutCounts[key] || 0}</p>
              </button>
            ))}
          </div>

          {/* Filtres avancés */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
              <Input
                variant="glass"
                placeholder="Rechercher..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="pl-10"
                allowClear onClear={() => setSearch('')}
              />
            </div>
            <select value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1) }} className="border border-gold-400/30 rounded-xl px-3 py-2 bg-white/50 dark:bg-midnight-800/50 backdrop-blur-sm text-sm">
              {statutOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={filterLivraison} onChange={e => { setFilterLivraison(e.target.value); setPage(1) }} className="border border-gold-400/30 rounded-xl px-3 py-2 bg-white/50 dark:bg-midnight-800/50 backdrop-blur-sm text-sm">
              <option value="">Tous types</option>
              <option value="domicile">Domicile</option>
              <option value="point_retrait">Point retrait</option>
            </select>
            <div className="flex gap-2 items-center">
              <Input type="date" value={filterDateDebut} onChange={e => { setFilterDateDebut(e.target.value); setPage(1) }} className="text-xs" />
              <span className="text-neutral-400">-</span>
              <Input type="date" value={filterDateFin} onChange={e => { setFilterDateFin(e.target.value); setPage(1) }} className="text-xs" />
            </div>
            <Input type="number" placeholder="Min (FC)" value={filterMin} onChange={e => { setFilterMin(e.target.value); setPage(1) }} className="text-xs" />
            <Input type="number" placeholder="Max (FC)" value={filterMax} onChange={e => { setFilterMax(e.target.value); setPage(1) }} className="text-xs" />
            {(search || filterStatut || filterLivraison || filterDateDebut || filterDateFin || filterMin || filterMax) && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-red-500 col-span-full justify-self-start">
                <X size={14} className="mr-1" /> Effacer les filtres
              </Button>
            )}
          </div>

          {/* Sélection multiple */}
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-gold-50 dark:bg-gold-900/20 rounded-xl border border-gold-400/30 flex items-center gap-4 flex-wrap"
            >
              <span className="text-sm font-medium text-gold-800 dark:text-gold-300">{selectedIds.size} commande(s) sélectionnée(s)</span>
              <div className="flex gap-2 flex-wrap">
                {['payee', 'conditionnement_premium', 'collecte', 'en_livraison', 'livree', 'annulee'].map(s => (
                  <Button key={s} variant="outline-gold" size="sm" onClick={() => handleBulkStatutChangeClick(s)} disabled={bulkActionLoading}>
                    {statutConfig[s]?.label ?? s}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Annuler</Button>
            </motion.div>
          )}

          {/* Tableau */}
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} variant="glass" className="border-gold-400/20">
                  <CardContent className="p-5"><Skeleton variant="text" className="w-48 h-6 mb-3" shimmer shimmerVariant="gold" /><Skeleton variant="text" className="w-2/3 h-4" shimmer shimmerVariant="gold" /></CardContent>
                </Card>
              ))}
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
              <p className="text-red-500 mb-4">{(error as Error)?.message || 'Erreur'}</p>
              <Button variant="outline-gold" onClick={() => refetch()}>Réessayer</Button>
            </div>
          ) : commandes.length === 0 ? (
            <Card variant="glass" className="border-gold-400/20 text-center py-12">
              <CardContent>
                <Package size={48} className="mx-auto text-neutral-400 mb-4" />
                <p className="text-neutral-500">Aucune commande trouvée.</p>
              </CardContent>
            </Card>
          ) : (
            <Card variant="glass" className="border-gold-400/20 overflow-hidden">
              <Table
                columns={columns}
                data={commandes}
                keyExtractor={(row) => row.id}
                emptyMessage="Aucune commande trouvée."
                emptyIcon={<Package size={48} className="text-neutral-400" />}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                loading={isLoading}
              />
            </Card>
          )}

          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={total}
              pageSize={pageSize}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
            />
          )}
        </motion.div>
      </Container>

      {/* Modal changement de statut */}
      <Modal isOpen={!!changeStatutModal} onClose={() => setChangeStatutModal(null)} title="Changer le statut" size="sm" accent="gold">
        <div className="space-y-4">
          <textarea rows={3} value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Commentaire (optionnel)" className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm" />
          <div className="flex gap-3">
            <Button variant="luxe" fullWidth onClick={confirmStatutChange} loading={updateStatutMutation.isPending}>Confirmer</Button>
            <Button variant="outline" fullWidth onClick={() => setChangeStatutModal(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal détail commande (enrichie avec les codes) */}
      <Modal isOpen={!!detailCommande} onClose={() => setDetailCommande(null)} title={`Commande #${detailCommande?.numero}`} size="lg" accent="gold">
        {detailCommande && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div><span className="text-muted-foreground">Client :</span> <Link href={`/admin/utilisateurs/${detailCommande.acheteur?.id}`} className="font-medium hover:text-gold-500">{detailCommande.acheteur?.prenom} {detailCommande.acheteur?.nom}</Link></div>
              <div><span className="text-muted-foreground">Email :</span> {detailCommande.acheteur?.email}</div>
              <div><span className="text-muted-foreground">Téléphone :</span> {detailCommande.acheteur?.telephone || '—'}</div>
              <div><span className="text-muted-foreground">Date :</span> {new Date(detailCommande.date).toLocaleString('fr-FR')}</div>
              <div><span className="text-muted-foreground">Statut :</span> <Badge variant={statutConfig[detailCommande.statut]?.variant}>{statutConfig[detailCommande.statut]?.label}</Badge></div>
              <div><span className="text-muted-foreground">Livraison :</span> {detailCommande.type_livraison === 'domicile' ? 'Domicile' : 'Point retrait'}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Adresse :</span> {detailCommande.adresse_livraison || detailCommande.point_retrait || '—'}</div>
              <div><span className="text-muted-foreground">Livreur :</span> {detailCommande.livreur ? `${detailCommande.livreur.prenom} ${detailCommande.livreur.nom}` : '—'}</div>
              <div><span className="text-muted-foreground">Suivi :</span> {detailCommande.numero_suivi || '—'}</div>
              {detailCommande.code_client && (
                <div className="col-span-2"><span className="text-muted-foreground">Code client :</span> <span className="font-mono font-bold text-gold-600">{detailCommande.code_client}</span></div>
              )}
              {detailCommande.code_livreur && (
                <div className="col-span-2"><span className="text-muted-foreground">Code livreur :</span> <span className="font-mono font-bold text-blue-600">{detailCommande.code_livreur}</span></div>
              )}
              {detailCommande.mode_attribution && (
                <div><span className="text-muted-foreground">Attribution :</span> <Badge variant={detailCommande.mode_attribution === 'ASSIGNE' ? 'gold' : 'neutral'}>{detailCommande.mode_attribution === 'ASSIGNE' ? 'Assignée' : 'Libre'}</Badge></div>
              )}
            </div>
            <div className="border-t border-border pt-2">
              <h4 className="font-semibold mb-2">Articles</h4>
              {detailCommande.articles?.map((a, i) => (
                <div key={i} className="flex justify-between py-1">
                  <span>{a.nom} x{a.quantite}</span>
                  <span className="font-medium">{(a.prix_unitaire * a.quantite).toLocaleString()} FC</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="text-muted-foreground">Sous-total</span>
              <span>{detailCommande.sous_total?.toLocaleString()} FC</span>
            </div>
            {detailCommande.remise > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Remise {detailCommande.code_promo && `(${detailCommande.code_promo})`}</span>
                <span>-{detailCommande.remise.toLocaleString()} FC</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Livraison</span>
              <span>{detailCommande.frais_livraison?.toLocaleString()} FC</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
              <span>Total</span>
              <span className="text-gold-600">{detailCommande.total.toLocaleString()} FC</span>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline-gold" size="sm" onClick={() => { setDetailCommande(null); setAssignLivreurModal(detailCommande) }}>Assigner livreur</Button>
              <Button variant="outline-gold" size="sm" onClick={() => window.open(`/admin/commandes/${detailCommande.id}/facture`, '_blank')}>Facture PDF</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal assignation livreur */}
      <Modal isOpen={!!assignLivreurModal} onClose={() => setAssignLivreurModal(null)} title="Assigner un livreur" size="sm" accent="gold">
        {assignLivreurModal && (
          <div className="space-y-4">
            <select value={selectedLivreurId} onChange={e => setSelectedLivreurId(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2 bg-card text-sm">
              <option value="">-- Choisir un livreur --</option>
              {livreurs.map(l => <option key={l.id} value={l.id}>{l.prenom} {l.nom}</option>)}
            </select>
            <div className="flex gap-3">
              <Button variant="luxe" fullWidth onClick={() => assignLivreurMutation.mutate({ commandeId: assignLivreurModal.id, livreurId: selectedLivreurId })} loading={assignLivreurMutation.isPending} disabled={!selectedLivreurId}>Assigner (génère le code livreur)</Button>
              <Button variant="outline" fullWidth onClick={() => setAssignLivreurModal(null)}>Annuler</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal validation collecte (dispatch) */}
      <Modal isOpen={!!validateCollecteModal} onClose={() => setValidateCollecteModal(null)} title="Validation de la collecte" size="sm" accent="gold">
        {validateCollecteModal && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Saisissez le <strong>code livreur</strong> que le livreur vous a communiqué pour confirmer le transfert.
            </p>
            <Input
              value={saisiCodeLivreur}
              onChange={e => setSaisiCodeLivreur(e.target.value)}
              placeholder="Code livreur (6 caractères)"
              maxLength={6}
              className="font-mono"
            />
            <div className="flex gap-3">
              <Button
                variant="luxe"
                fullWidth
                onClick={() => validateCollecteMutation.mutate({ commandeId: validateCollecteModal.id, code: saisiCodeLivreur })}
                loading={validateCollecteMutation.isPending}
                disabled={saisiCodeLivreur.length !== 6}
              >
                Valider la collecte
              </Button>
              <Button variant="outline" fullWidth onClick={() => setValidateCollecteModal(null)}>Annuler</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal notes internes */}
      <Modal isOpen={!!showNotesModal} onClose={() => setShowNotesModal(null)} title="Notes internes" size="sm" accent="gold">
        {showNotesModal && (
          <div className="space-y-4">
            <textarea rows={4} value={noteInterne} onChange={e => setNoteInterne(e.target.value)} placeholder="Ajouter une note interne..." className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm" />
            <div className="flex gap-3">
              <Button variant="luxe" fullWidth onClick={() => saveNoteMutation.mutate({ commandeId: showNotesModal.id, note: noteInterne })} loading={saveNoteMutation.isPending}>Enregistrer</Button>
              <Button variant="outline" fullWidth onClick={() => setShowNotesModal(null)}>Annuler</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal export */}
      <Modal isOpen={showExportConfirm} onClose={() => setShowExportConfirm(false)} title="Exporter les commandes" size="sm" accent="gold">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
          Un fichier CSV contenant toutes les commandes filtrées ({commandes.length} entrées) sera téléchargé.
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