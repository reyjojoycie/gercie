// app/admin/livreurs/page.tsx
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import {
  Search, Shield, ShieldOff, RefreshCcw, UserCheck, Truck,
  MapPin, Phone, Star, Activity, ChevronLeft, ChevronRight,
  Plus, Download, Eye, CheckCircle2, XCircle, Clock,
  Navigation, Trash2, UserPlus, TrendingUp, Zap, Pencil,
  Ban, ArrowUpDown, User, MoreHorizontal, UserX, ArrowDown,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Livreur {
  id: string
  nom: string
  prenom: string
  email: string
  telephone: string
  est_actif: boolean
  est_disponible: boolean
  total_livraisons: number
  distance_parcourue_km: number
  derniere_activite: string | null
  zone_operation_principale: string | null
  photo_url: string | null
  moto_modele: string | null
  moto_plaque: string | null
  note_moyenne?: number
}

interface LivreursResponse {
  data: Livreur[]
  pagination: { page: number; totalPages: number; total: number }
}

/* ------------------------------------------------------------------ */
/*  Colonnes autorisées pour le tri côté serveur                        */
/* ------------------------------------------------------------------ */
const SERVER_SORTABLE_COLUMNS = ['total_livraisons', 'distance_parcourue_km', 'derniere_activite', 'created_at']

/* ------------------------------------------------------------------ */
/*  Composants Table & Pagination (identiques à l'original)            */
/* ------------------------------------------------------------------ */
const Table = ({ columns, data, keyExtractor, emptyMessage, emptyIcon, onRowClick, sortColumn, sortDirection, onSort, loading }: any) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gold-400/20 text-left">
          {columns.map((col: any, idx: number) => (
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
            <tr key={`skeleton-${i}`} className="border-b border-gold-400/5">
              {columns.map((_: any, j: number) => (
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
          data.map((row: any) => (
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
              {columns.map((col: any, idx: number) => (
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

const Pagination = ({ currentPage, totalPages, onPageChange, totalItems, pageSize, onPageSizeChange }: any) => {
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
    <div className="flex items-center justify-between gap-4 mt-4">
      <div className="flex items-center gap-1">
        <Button variant="outline-gold" size="icon" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>
          <ChevronLeft size={16} />
        </Button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-neutral-400">…</span>
          ) : (
            <Button
              key={`page-${p}`}
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

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function AdminLivreursPage() {
  const { user, loading: authLoading, isAdmin } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const toast = useToast()

  // États depuis les paramètres d'URL
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pageSize, setPageSize] = useState(Number(searchParams.get('limit') || 10))
  const [sortColumn, setSortColumn] = useState(searchParams.get('sort') || 'created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>((searchParams.get('dir') as 'asc' | 'desc') || 'asc')
  const [activeFilter, setActiveFilter] = useState(searchParams.get('actif') || 'all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const debouncedSearch = useDebounce(search, 300)

  // Modales
  const [showAddEditModal, setShowAddEditModal] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [currentLivreur, setCurrentLivreur] = useState<Livreur | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<{ id: string; current: boolean } | null>(null)
  const [promoteUserId, setPromoteUserId] = useState<string | null>(null) // pour promotion utilisateur

  // Promotion d’un utilisateur existant
  const [showPromoteModal, setShowPromoteModal] = useState(false)
  const [searchUser, setSearchUser] = useState('')
  const [usersList, setUsersList] = useState<{ id: string; email: string; nom: string; prenom: string }[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  // Formulaire (react-hook-form)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      nom: '', prenom: '', email: '', telephone: '',
      moto_modele: '', moto_plaque: '', zone_operation_principale: '',
      photo_url: '', est_actif: true, est_disponible: true,
    }
  })

  // Mise à jour de l'URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 10) params.set('limit', String(pageSize))
    if (sortColumn && SERVER_SORTABLE_COLUMNS.includes(sortColumn)) {
      params.set('sort_by', sortColumn)
      params.set('sort_order', sortDirection)
    }
    if (activeFilter !== 'all') params.set('actif', activeFilter)
    router.replace(`/admin/livreurs?${params.toString()}`, { scroll: false })
  }, [debouncedSearch, page, pageSize, sortColumn, sortDirection, activeFilter, router])

  // Vérification rôle admin
  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      router.replace('/')
      toast.addToast({ type: 'error', message: 'Accès réservé aux administrateurs' })
    }
  }, [authLoading, user, isAdmin, router, toast])

  // ---- Requête des livreurs ----
  const { data, isLoading, isError, error, refetch } = useQuery<LivreursResponse>({
    queryKey: ['admin-livreurs', debouncedSearch, page, pageSize, sortColumn, sortDirection, activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      if (sortColumn && SERVER_SORTABLE_COLUMNS.includes(sortColumn)) {
        params.set('sort_by', sortColumn)
        params.set('sort_order', sortDirection)
      }
      if (activeFilter !== 'all') params.set('est_actif', activeFilter === 'actif' ? 'true' : 'false')
      const res = await fetch(`/api/admin/livreurs?${params.toString()}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement')
      return res.json()
    },
    enabled: !!user && isAdmin,
    staleTime: 30_000,
  })

  const rawLivreurs = data?.data ?? []

  // Tri local pour les colonnes non supportées par l'API
  const livreurs = useMemo(() => {
    if (SERVER_SORTABLE_COLUMNS.includes(sortColumn)) return rawLivreurs

    const sorted = [...rawLivreurs]
    sorted.sort((a, b) => {
      let valA: any, valB: any
      if (sortColumn === 'nom') {
        valA = (a.nom || '').toLowerCase()
        valB = (b.nom || '').toLowerCase()
      } else if (sortColumn === 'prenom') {
        valA = (a.prenom || '').toLowerCase()
        valB = (b.prenom || '').toLowerCase()
      } else if (sortColumn === 'email') {
        valA = (a.email || '').toLowerCase()
        valB = (b.email || '').toLowerCase()
      } else {
        return 0
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [rawLivreurs, sortColumn, sortDirection])

  const pagination = data?.pagination ?? { page: 1, totalPages: 1, total: 0 }

  // Tri côté serveur
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // ---- Mutations ----
  const createMutation = useMutation({
    mutationFn: async (formData: any) => {
      const res = await fetch('/api/admin/livreurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-livreurs'] })
      toast.addToast({ type: 'success', message: 'Livreur créé avec succès' })
      setShowAddEditModal(false)
      reset()
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const res = await fetch('/api/admin/livreurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-livreurs'] })
      toast.addToast({ type: 'success', message: 'Livreur mis à jour' })
      setShowAddEditModal(false)
      setCurrentLivreur(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/livreurs?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-livreurs'] })
      toast.addToast({ type: 'success', message: 'Livreur supprimé' })
      setConfirmDelete(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, est_actif }: { id: string; est_actif: boolean }) => {
      const res = await fetch('/api/admin/livreurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates: { est_actif: !est_actif } }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-livreurs'] })
      toast.addToast({ type: 'success', message: 'Statut modifié' })
      setConfirmToggle(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  // Promotion / rétrogradation via l'API utilisateurs
  const promoteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch('/api/admin/utilisateurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates: { type_user: 'livreur' } }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      toast.addToast({ type: 'success', message: 'Utilisateur promu livreur' })
      setPromoteUserId(null)
      setShowPromoteModal(false)
      queryClient.invalidateQueries({ queryKey: ['admin-utilisateurs'] })
      queryClient.invalidateQueries({ queryKey: ['admin-livreurs'] }) // au cas où un nouveau livreur apparaît
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const demoteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch('/api/admin/utilisateurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates: { type_user: 'acheteur' } }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      toast.addToast({ type: 'success', message: 'Utilisateur rétrogradé' })
      queryClient.invalidateQueries({ queryKey: ['admin-utilisateurs'] })
      queryClient.invalidateQueries({ queryKey: ['admin-livreurs'] })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  // ---- Recherche d'utilisateurs pour promotion ----
  const searchUsers = useCallback(async (query: string) => {
    setSearchingUsers(true)
    try {
      const res = await fetch(`/api/admin/utilisateurs?search=${encodeURIComponent(query)}&role=acheteur&limit=10`)
      const json = await res.json()
      setUsersList(json.data || [])
    } catch {
      setUsersList([])
    } finally {
      setSearchingUsers(false)
    }
  }, [])

  useEffect(() => {
    if (!showPromoteModal) return
    const timer = setTimeout(() => searchUsers(searchUser), 300)
    return () => clearTimeout(timer)
  }, [searchUser, showPromoteModal, searchUsers])

  const handlePromote = () => {
    if (selectedUserId) promoteMutation.mutate(selectedUserId)
  }

  const handleDemote = (livreurId: string) => {
    if (confirm('Rétrograder ce livreur en simple utilisateur ?')) {
      demoteMutation.mutate(livreurId)
    }
  }

  // Handlers
  const handleToggle = (livreurId: string, current: boolean) => {
    setConfirmToggle({ id: livreurId, current })
  }

  const confirmToggleAction = () => {
    if (confirmToggle) {
      toggleMutation.mutate({ id: confirmToggle.id, est_actif: confirmToggle.current })
    }
  }

  const openCreate = () => {
    setEditMode('create')
    setCurrentLivreur(null)
    reset({
      nom: '', prenom: '', email: '', telephone: '',
      moto_modele: '', moto_plaque: '', zone_operation_principale: '',
      photo_url: '', est_actif: true, est_disponible: true,
    })
    setShowAddEditModal(true)
  }

  const openEdit = (livreur: Livreur) => {
    setEditMode('edit')
    setCurrentLivreur(livreur)
    reset({
      nom: livreur.nom, prenom: livreur.prenom, email: livreur.email,
      telephone: livreur.telephone || '',
      moto_modele: livreur.moto_modele || '', moto_plaque: livreur.moto_plaque || '',
      zone_operation_principale: livreur.zone_operation_principale || '',
      photo_url: livreur.photo_url || '',
      est_actif: livreur.est_actif, est_disponible: livreur.est_disponible,
    })
    setShowAddEditModal(true)
  }

  const handleSave = (data: any) => {
    if (editMode === 'create') {
      createMutation.mutate(data)
    } else if (currentLivreur) {
      updateMutation.mutate({ id: currentLivreur.id, updates: data })
    }
  }

  const handleDelete = (id: string) => setConfirmDelete(id)

  // Sélection multiple
  const toggleSelectAll = () => {
    if (selectedIds.size === livreurs.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(livreurs.map(l => l.id)))
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkActivate = async () => {
    for (const id of selectedIds) {
      const liv = livreurs.find(l => l.id === id)
      if (liv && !liv.est_actif) await toggleMutation.mutateAsync({ id, est_actif: false })
    }
    setSelectedIds(new Set())
  }

  const bulkDeactivate = async () => {
    for (const id of selectedIds) {
      const liv = livreurs.find(l => l.id === id)
      if (liv && liv.est_actif) await toggleMutation.mutateAsync({ id, est_actif: true })
    }
    setSelectedIds(new Set())
  }

  const exportCSV = () => {
    if (livreurs.length === 0) return
    const headers = ['Nom', 'Prénom', 'Email', 'Téléphone', 'Actif', 'Disponible', 'Livraisons', 'Km', 'Zone']
    const rows = livreurs.map(l => [
      l.nom, l.prenom, l.email, l.telephone,
      l.est_actif ? 'Oui' : 'Non', l.est_disponible ? 'Oui' : 'Non',
      l.total_livraisons, l.distance_parcourue_km, l.zone_operation_principale || ''
    ])
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `livreurs_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Colonnes enrichies (avec rétrogradation)
  const columns = [
    {
      header: '',
      accessor: (row: Livreur) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelectOne(row.id)}
          className="text-gold-500 rounded focus:ring-gold-400"
        />
      ),
      className: 'w-10',
    },
    {
      header: 'Livreur',
      accessor: (row: Livreur) => (
        <div className="flex items-center gap-3">
          {row.photo_url ? (
            <img src={row.photo_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-gold-400/30" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center text-gold-700 dark:text-gold-300 font-bold text-sm border border-gold-400/20">
              {row.prenom?.[0]}{row.nom?.[0]}
            </div>
          )}
          <div>
            <p className="font-semibold text-foreground">{row.prenom} {row.nom}</p>
            {row.moto_modele && (
              <p className="text-xs text-muted-foreground">🏍️ {row.moto_modele}{row.moto_plaque ? ` · ${row.moto_plaque}` : ''}</p>
            )}
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Contact',
      accessor: (row: Livreur) => (
        <div className="space-y-0.5">
          <p className="text-sm text-foreground">{row.email}</p>
          {row.telephone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={12} /> {row.telephone}</p>}
        </div>
      ),
    },
    {
      header: 'Livraisons',
      accessor: (row: Livreur) => (
        <div className="text-center">
          <p className="font-bold text-foreground">{row.total_livraisons}</p>
          <p className="text-xs text-muted-foreground">{row.distance_parcourue_km.toFixed(0)} km</p>
        </div>
      ),
      className: 'text-center',
      sortable: true,
    },
    {
      header: 'Note',
      accessor: (row: Livreur) => (
        <div className="flex items-center justify-center gap-1 text-amber-500">
          <Star size={14} className="fill-current" />
          <span className="text-sm font-medium">{row.note_moyenne?.toFixed(1) || '—'}</span>
        </div>
      ),
      className: 'text-center',
      sortable: true,
    },
    {
      header: 'Zone',
      accessor: (row: Livreur) => (
        <div className="flex items-center gap-1 text-sm text-foreground">
          <MapPin size={14} className="text-gold-500" /> {row.zone_operation_principale || '—'}
        </div>
      ),
    },
    {
      header: 'Dispo.',
      accessor: (row: Livreur) =>
        row.est_disponible ? (
          <Badge variant="accent" size="sm"><Activity size={12} className="mr-1 animate-pulse" /> En ligne</Badge>
        ) : (
          <Badge variant="neutral" size="sm">Indisponible</Badge>
        ),
      className: 'text-center',
    },
    {
      header: 'Statut',
      accessor: (row: Livreur) =>
        row.est_actif ? (
          <Badge variant="brand" size="sm"><Shield size={12} className="mr-1" /> Actif</Badge>
        ) : (
          <Badge variant="danger" size="sm"><ShieldOff size={12} className="mr-1" /> Inactif</Badge>
        ),
      className: 'text-center',
      sortable: true,
    },
    {
      header: 'Actions',
      accessor: (row: Livreur) => (
        <div className="flex items-center justify-center gap-2">
          <Tooltip content="Modifier">
            <button onClick={(e) => { e.stopPropagation(); openEdit(row) }} className="p-1.5 rounded-lg text-neutral-400 hover:text-gold-500">
              <Pencil size={16} />
            </button>
          </Tooltip>
          <Tooltip content={row.est_actif ? 'Désactiver' : 'Activer'}>
            <button onClick={(e) => { e.stopPropagation(); handleToggle(row.id, row.est_actif) }} className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500">
              {row.est_actif ? <Ban size={16} /> : <CheckCircle2 size={16} />}
            </button>
          </Tooltip>
          <Tooltip content="Rétrograder (retirer le rôle livreur)">
            <button onClick={(e) => { e.stopPropagation(); handleDemote(row.id) }} className="p-1.5 rounded-lg text-neutral-400 hover:text-orange-500">
              <ArrowDown size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Supprimer">
            <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500">
              <Trash2 size={16} />
            </button>
          </Tooltip>
        </div>
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

  if (!user || !isAdmin) return null

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />
      <Container className="py-8 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En-tête avec stats */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground font-serif flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gold-100 dark:bg-gold-900/30 text-gold-600 dark:text-gold-400">
                  <Truck size={24} />
                </div>
                Gestion des livreurs
              </h1>
              <p className="text-muted-foreground mt-1">
                {pagination.total} livreur(s) enregistré(s)
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="luxe" size="sm" onClick={openCreate} leftIcon={<UserPlus size={16} />}>
                Ajouter un livreur
              </Button>
              <Button variant="outline-gold" size="sm" onClick={() => setShowPromoteModal(true)} leftIcon={<UserCheck size={16} />}>
                Promouvoir un utilisateur
              </Button>
              <Button variant="outline-gold" size="sm" onClick={() => refetch()} leftIcon={<RefreshCcw size={16} />}>
                Actualiser
              </Button>
              <Button variant="outline-gold" size="sm" onClick={exportCSV} leftIcon={<Download size={16} />}>
                Export CSV
              </Button>
            </div>
          </div>

          {/* Stats rapides */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-4 text-center">
                <Activity size={20} className="mx-auto text-green-500 mb-1" />
                <p className="text-2xl font-bold">{livreurs.filter(l => l.est_disponible).length}</p>
                <p className="text-xs text-muted-foreground">En ligne</p>
              </CardContent>
            </Card>
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-4 text-center">
                <Truck size={20} className="mx-auto text-gold-500 mb-1" />
                <p className="text-2xl font-bold">{pagination.total}</p>
                <p className="text-xs text-muted-foreground">Total livreurs</p>
              </CardContent>
            </Card>
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-4 text-center">
                <Star size={20} className="mx-auto text-amber-500 mb-1" />
                <p className="text-2xl font-bold">
                  {livreurs.length > 0
                    ? (livreurs.reduce((acc, l) => acc + (l.note_moyenne || 0), 0) / livreurs.length).toFixed(1)
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground">Note moyenne</p>
              </CardContent>
            </Card>
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-4 text-center">
                <TrendingUp size={20} className="mx-auto text-blue-500 mb-1" />
                <p className="text-2xl font-bold">{livreurs.reduce((acc, l) => acc + l.total_livraisons, 0)}</p>
                <p className="text-xs text-muted-foreground">Livraisons totales</p>
              </CardContent>
            </Card>
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap gap-4 mb-6 items-center">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
              <Input
                variant="glass"
                placeholder="Rechercher par nom, email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-10"
                allowClear
                onClear={() => setSearch('')}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'all', label: 'Tous' },
                { value: 'actif', label: 'Actifs' },
                { value: 'inactif', label: 'Inactifs' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setActiveFilter(opt.value); setPage(1) }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition border',
                    activeFilter === opt.value
                      ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm'
                      : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-muted-foreground">{selectedIds.size} sélectionné(s)</span>
                <Button variant="accent" size="sm" onClick={bulkActivate} loading={toggleMutation.isPending}>
                  Activer
                </Button>
                <Button variant="danger" size="sm" onClick={bulkDeactivate} loading={toggleMutation.isPending}>
                  Désactiver
                </Button>
              </div>
            )}
          </div>

          {/* Tableau */}
          <Card variant="glass" className="border-gold-400/20 overflow-hidden">
            <Table
              columns={columns}
              data={livreurs}
              keyExtractor={(row) => row.id}
              emptyMessage="Aucun livreur trouvé."
              emptyIcon={<UserCheck size={48} className="text-neutral-400" />}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              loading={isLoading}
            />
          </Card>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-between items-center mt-6">
              <Pagination
                currentPage={page}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
                totalItems={pagination.total}
                pageSize={pageSize}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
              />
            </div>
          )}
        </motion.div>
      </Container>

      {/* Modal Ajout/Modification */}
      <Modal isOpen={showAddEditModal} onClose={() => setShowAddEditModal(false)} title={editMode === 'create' ? 'Nouveau livreur' : 'Modifier le livreur'} size="md" accent="gold">
        <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Prénom *" {...register('prenom', { required: 'Prénom requis' })} error={errors.prenom?.message} variant="glass" />
            <Input label="Nom *" {...register('nom', { required: 'Nom requis' })} error={errors.nom?.message} variant="glass" />
            <Input label="Email *" type="email" {...register('email', { required: 'Email requis' })} error={errors.email?.message} variant="glass" />
            <Input label="Téléphone" {...register('telephone')} variant="glass" />
            <Input label="Modèle moto" {...register('moto_modele')} variant="glass" />
            <Input label="Plaque" {...register('moto_plaque')} variant="glass" />
            <Input label="Zone principale" {...register('zone_operation_principale')} variant="glass" />
            <Input label="Photo (URL)" {...register('photo_url')} variant="glass" />
            <label className="flex items-center gap-2 col-span-2">
              <input type="checkbox" {...register('est_actif')} /> Livreur actif
            </label>
            <label className="flex items-center gap-2 col-span-2">
              <input type="checkbox" {...register('est_disponible')} /> Disponible
            </label>
          </div>
          <div className="flex gap-3">
            <Button variant="luxe" fullWidth type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {editMode === 'create' ? 'Créer' : 'Enregistrer'}
            </Button>
            <Button variant="outline-gold" fullWidth onClick={() => setShowAddEditModal(false)}>Annuler</Button>
          </div>
        </form>
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Supprimer le livreur" size="sm" accent="danger">
        <div className="space-y-4">
          <p>Êtes-vous sûr de vouloir supprimer définitivement ce livreur ?</p>
          <div className="flex gap-3">
            <Button variant="danger" fullWidth onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete)} loading={deleteMutation.isPending}>
              Supprimer
            </Button>
            <Button variant="outline-gold" fullWidth onClick={() => setConfirmDelete(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal confirmation activation/désactivation */}
      <Modal isOpen={!!confirmToggle} onClose={() => setConfirmToggle(null)} title="Confirmation" accent="gold" size="sm">
        {confirmToggle && (
          <div className="text-center space-y-4">
            <p>Voulez-vous vraiment {confirmToggle.current ? 'désactiver' : 'activer'} ce livreur ?</p>
            <div className="flex gap-3 justify-center">
              <Button variant="luxe" onClick={confirmToggleAction} loading={toggleMutation.isPending}>
                Confirmer
              </Button>
              <Button variant="outline-gold" onClick={() => setConfirmToggle(null)}>Annuler</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal promotion d'un utilisateur existant */}
      <Modal isOpen={showPromoteModal} onClose={() => setShowPromoteModal(false)} title="Promouvoir un utilisateur en livreur" size="md" accent="gold">
        <div className="space-y-4">
          <Input
            variant="glass"
            placeholder="Rechercher un utilisateur (acheteur)..."
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            leftIcon={<Search size={16} />}
          />
          {searchingUsers && <Spinner size="sm" />}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {usersList.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                className={cn(
                  'w-full text-left p-3 rounded-lg border transition',
                  selectedUserId === u.id ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/20' : 'border-border hover:border-gold-400'
                )}
              >
                <p className="font-medium">{u.prenom} {u.nom}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </button>
            ))}
            {usersList.length === 0 && searchUser && !searchingUsers && (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun utilisateur trouvé.</p>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="luxe" fullWidth onClick={handlePromote} loading={promoteMutation.isPending} disabled={!selectedUserId}>
              Promouvoir
            </Button>
            <Button variant="outline-gold" fullWidth onClick={() => setShowPromoteModal(false)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}