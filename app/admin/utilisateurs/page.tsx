// app/admin/utilisateurs/page.tsx
'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/components/ui/Toast'
import {
  Search, Shield, ShieldOff, User, UserCheck, Copy, Check,
  Edit3, RefreshCcw, ChevronLeft, ChevronRight, Clock,
  Smartphone, Mail, ExternalLink, Users, Filter, X,
  PlusCircle, Download, ArrowUpDown, Eye, AlertTriangle,
  MoreHorizontal, Trash2, BarChart3, TrendingUp, UserPlus,
  Activity, Star, Zap, Ban, Circle, Lock, Unlock, Key,
  Pencil, Save, UserX,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
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
interface Utilisateur {
  id: string
  email: string
  nom: string
  prenom: string
  telephone: string
  type_user: string
  is_admin: boolean
  est_actif: boolean
  created_at: string
  derniere_connexion?: string | null
  total_commandes?: number
}

interface UtilisateursResponse {
  data: Utilisateur[]
  pagination: {
    page: number
    totalPages: number
    total: number
  }
}

type RoleFilter = 'all' | 'acheteur' | 'vendeur' | 'admin'

/* ------------------------------------------------------------------ */
/*  Schémas de validation pour les formulaires                          */
/* ------------------------------------------------------------------ */
const createUserSchema = z.object({
  email: z.string().email('Email invalide'),
  nom: z.string().min(1, 'Nom requis'),
  prenom: z.string().min(1, 'Prénom requis'),
  telephone: z.string().optional(),
  type_user: z.enum(['acheteur', 'vendeur']).default('acheteur'),
  password: z.string().min(6, 'Mot de passe (min. 6 caractères)'),
})

type CreateUserForm = z.infer<typeof createUserSchema>

/* ------------------------------------------------------------------ */
/*  Composants Table & Pagination (identiques à l'original)             */
/* ------------------------------------------------------------------ */
// (Je réutilise les composants Table et Pagination fournis précédemment,
//  ils sont inclus dans le code complet ci-dessous.)

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function UtilisateursAdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const searchParams = useSearchParams()

  // États depuis URL ou locaux
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [filterRole, setFilterRole] = useState<RoleFilter>((searchParams.get('role') as RoleFilter) || 'all')
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pageSize, setPageSize] = useState(Number(searchParams.get('limit') || 15))
  const [sortColumn, setSortColumn] = useState(searchParams.get('sort') || 'created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>((searchParams.get('dir') as 'asc' | 'desc') || 'desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  // Modales
  const [roleModalUser, setRoleModalUser] = useState<Utilisateur | null>(null)
  const [newRole, setNewRole] = useState<'acheteur' | 'vendeur'>('acheteur')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [editModalUser, setEditModalUser] = useState<Utilisateur | null>(null)
  const [resetPasswordTargetId, setResetPasswordTargetId] = useState<string | null>(null)
  const [banTargetId, setBanTargetId] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Formulaires
  const createForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', nom: '', prenom: '', telephone: '', type_user: 'acheteur', password: '' },
  })

  const editForm = useForm<{ nom: string; prenom: string; email: string; telephone: string }>({
    defaultValues: { nom: '', prenom: '', email: '', telephone: '' },
  })

  // Mise à jour de l'URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filterRole !== 'all') params.set('role', filterRole)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 15) params.set('limit', String(pageSize))
    if (sortColumn !== 'created_at') params.set('sort', sortColumn)
    if (sortDirection !== 'desc') params.set('dir', sortDirection)
    router.replace(`/admin/utilisateurs?${params.toString()}`, { scroll: false })
  }, [debouncedSearch, filterRole, page, pageSize, sortColumn, sortDirection, router])

  // Requête utilisateurs
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<UtilisateursResponse>({
    queryKey: ['admin-utilisateurs', debouncedSearch, filterRole, page, pageSize, sortColumn, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterRole !== 'all') params.set('role', filterRole)
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      params.set('sort_by', sortColumn)
      params.set('sort_order', sortDirection)
      const res = await fetch(`/api/admin/utilisateurs?${params.toString()}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement utilisateurs')
      const json = await res.json()
      return Array.isArray(json) ? { data: json, pagination: { page: 1, totalPages: 1, total: json.length } } : json
    },
    enabled: !!user,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const utilisateurs = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, totalPages: 1, total: 0 }

  // ======================== MUTATIONS ========================
  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const res = await fetch('/api/admin/utilisateurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates: { type_user: newRole } }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-utilisateurs'] })
      toast.addToast({ type: 'success', message: 'Rôle modifié avec succès' })
      setRoleModalUser(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const res = await fetch('/api/admin/utilisateurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates: { is_admin: !isAdmin } }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-utilisateurs'] })
      toast.addToast({ type: 'success', message: 'Statut admin mis à jour' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/utilisateurs?id=${userId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-utilisateurs'] })
      toast.addToast({ type: 'success', message: 'Utilisateur supprimé' })
      setDeleteTargetId(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: any }) => {
      const res = await fetch('/api/admin/utilisateurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-utilisateurs'] })
      toast.addToast({ type: 'success', message: 'Utilisateur mis à jour' })
      setEditModalUser(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Endpoint spécial pour réinitialiser le mot de passe sans vérification
      const res = await fetch('/api/admin/utilisateurs/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: (data) => {
      toast.addToast({ type: 'success', message: `Nouveau mot de passe : ${data.newPassword}` })
      setResetPasswordTargetId(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const toggleBanMutation = useMutation({
    mutationFn: async ({ userId, est_actif }: { userId: string; est_actif: boolean }) => {
      const res = await fetch('/api/admin/utilisateurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates: { est_actif: !est_actif } }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-utilisateurs'] })
      toast.addToast({ type: 'success', message: 'Statut du compte mis à jour' })
      setBanTargetId(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserForm) => {
      const res = await fetch('/api/admin/utilisateurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-utilisateurs'] })
      toast.addToast({ type: 'success', message: 'Utilisateur créé' })
      setCreateModalOpen(false)
      createForm.reset()
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  // Handlers
  const handleChangeRole = (u: Utilisateur) => { setRoleModalUser(u); setNewRole(u.type_user as 'acheteur' | 'vendeur') }
  const handleToggleAdmin = (u: Utilisateur) => toggleAdminMutation.mutate({ userId: u.id, isAdmin: u.is_admin })
  const handleCopyId = (id: string) => { navigator.clipboard.writeText(id); setCopiedId(id); toast.addToast({ type: 'success', message: 'ID copié' }); setTimeout(() => setCopiedId(null), 2000) }
  const handleRoleConfirm = () => { if (roleModalUser) changeRoleMutation.mutate({ userId: roleModalUser.id, newRole }) }
  const handleDelete = (id: string) => setDeleteTargetId(id)
  const handleEdit = (u: Utilisateur) => {
    setEditModalUser(u)
    editForm.reset({ nom: u.nom, prenom: u.prenom, email: u.email, telephone: u.telephone || '' })
  }
  const handleEditSubmit = (data: any) => {
    if (editModalUser) updateUserMutation.mutate({ userId: editModalUser.id, updates: data })
  }
  const handleResetPassword = (id: string) => setResetPasswordTargetId(id)
  const handleBan = (id: string) => setBanTargetId(id)
  const handleBanConfirm = () => {
    if (banTargetId) {
      const user = utilisateurs.find(u => u.id === banTargetId)
      if (user) toggleBanMutation.mutate({ userId: user.id, est_actif: user.est_actif })
    }
  }
  const handleCreateUser = (data: CreateUserForm) => createUserMutation.mutate(data)
  const handleSort = (col: string) => {
    if (sortColumn === col) setSortDirection(p => (p === 'asc' ? 'desc' : 'asc'))
    else { setSortColumn(col); setSortDirection('asc') }
  }
  const handleSelectAll = () => {
    if (selectedIds.size === utilisateurs.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(utilisateurs.map(u => u.id)))
  }
  const handleSelectOne = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  // Stats rapides
  const stats = useMemo(() => {
    const total = pagination.total
    const admins = utilisateurs.filter(u => u.is_admin).length
    const acheteurs = utilisateurs.filter(u => u.type_user === 'acheteur').length
    const vendeurs = utilisateurs.filter(u => u.type_user === 'vendeur').length
    const banned = utilisateurs.filter(u => !u.est_actif).length
    return { total, admins, acheteurs, vendeurs, banned }
  }, [utilisateurs, pagination.total])

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950"><Spinner size="xl" variant="premium" label="Chargement..." /></div>
  }

  // Colonnes enrichies avec actions
  const columns = [
    ...(selectedIds.size > 0 ? [{
      header: '',
      accessor: (row: Utilisateur) => <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => handleSelectOne(row.id)} className="text-gold-500 rounded" />,
      className: 'w-10',
    }] : []),
    {
      header: 'Utilisateur',
      accessor: (row: Utilisateur) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center text-gold-700 dark:text-gold-300 font-bold text-sm border border-gold-400/20">
            {row.prenom?.[0]}{row.nom?.[0]}
          </div>
          <div>
            <p className="font-semibold text-neutral-900 dark:text-neutral-100">
              {row.prenom} {row.nom}
              {!row.est_actif && <Badge variant="danger" size="sm" className="ml-2">Banni</Badge>}
            </p>
            {row.telephone && (
              <p className="text-xs text-neutral-500 flex items-center gap-1">
                <Smartphone size={12} /> {row.telephone}
              </p>
            )}
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Email',
      accessor: (row: Utilisateur) => (
        <div className="flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-300">
          <Mail size={14} className="text-neutral-400" />
          {row.email}
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Rôle',
      accessor: (row: Utilisateur) => (
        <div className="flex items-center gap-2">
          <Badge variant={row.type_user === 'vendeur' ? 'accent' : 'brand'} size="sm">
            {row.type_user === 'vendeur' ? 'Vendeur' : 'Acheteur'}
          </Badge>
          <Tooltip content="Modifier le rôle">
            <button onClick={(e) => { e.stopPropagation(); handleChangeRole(row) }} className="text-neutral-400 hover:text-gold-500">
              <Edit3 size={14} />
            </button>
          </Tooltip>
        </div>
      ),
      className: 'text-center',
      sortable: true,
    },
    {
      header: 'Admin',
      accessor: (row: Utilisateur) => (
        <div className="flex justify-center">
          <Button
            variant={row.is_admin ? 'luxe' : 'outline'}
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleToggleAdmin(row) }}
            leftIcon={row.is_admin ? <Shield size={14} /> : <ShieldOff size={14} />}
          >
            {row.is_admin ? 'Admin' : 'Standard'}
          </Button>
        </div>
      ),
      className: 'text-center',
    },
    {
      header: 'ID',
      accessor: (row: Utilisateur) => (
        <div className="flex items-center gap-2">
          <code className="text-xs bg-neutral-100 dark:bg-midnight-700/60 px-2 py-0.5 rounded font-mono text-neutral-600 dark:text-neutral-400">
            {row.id.substring(0, 8)}...
          </code>
          <button onClick={(e) => { e.stopPropagation(); handleCopyId(row.id) }} className="text-neutral-400 hover:text-gold-500" title="Copier l'ID">
            {copiedId === row.id ? <Check size={14} className="text-accent-500" /> : <Copy size={14} />}
          </button>
        </div>
      ),
    },
    {
      header: 'Inscription',
      accessor: (row: Utilisateur) => (
        <div className="text-sm text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
          <Clock size={14} className="text-neutral-400" />
          {new Date(row.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })}
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Dernière connexion',
      accessor: (row: Utilisateur) => (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {row.derniere_connexion
            ? new Date(row.derniere_connexion).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })
            : '—'}
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Commandes',
      accessor: (row: Utilisateur) => (
        <div className="text-center text-neutral-700 dark:text-neutral-300">
          {row.total_commandes ?? 0}
        </div>
      ),
      className: 'text-center',
      sortable: true,
    },
    {
      header: 'Actions',
      accessor: (row: Utilisateur) => (
        <div className="flex items-center gap-1 justify-center">
          <Tooltip content="Modifier informations">
            <button onClick={(e) => { e.stopPropagation(); handleEdit(row) }} className="p-1.5 rounded-lg text-neutral-400 hover:text-gold-500 hover:bg-gold-400/10 transition">
              <Pencil size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Réinitialiser mot de passe">
            <button onClick={(e) => { e.stopPropagation(); handleResetPassword(row.id) }} className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-500 hover:bg-blue-50 transition">
              <Key size={16} />
            </button>
          </Tooltip>
          <Tooltip content={row.est_actif ? 'Bannir' : 'Débannir'}>
            <button onClick={(e) => { e.stopPropagation(); handleBan(row.id) }} className={`p-1.5 rounded-lg transition ${row.est_actif ? 'text-neutral-400 hover:text-red-500 hover:bg-red-50' : 'text-red-500 hover:bg-red-50'}`}>
              {row.est_actif ? <Ban size={16} /> : <Circle size={16} />}
            </button>
          </Tooltip>
          <Tooltip content="Supprimer">
            <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition">
              <Trash2 size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Voir détail">
            <Link href={`/admin/utilisateurs/${row.id}`} className="p-1.5 rounded-lg text-neutral-400 hover:text-gold-500 hover:bg-gold-400/10 transition" onClick={(e) => e.stopPropagation()}>
              <ExternalLink size={16} />
            </Link>
          </Tooltip>
        </div>
      ),
      className: 'text-center',
    },
  ]

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />
      <Container className="py-8 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En-tête + stats */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gold-100 dark:bg-gold-900/30 text-gold-600 dark:text-gold-400"><Users size={24} /></div>
                Gestion des utilisateurs
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400 mt-1">{pagination.total} utilisateur(s) enregistré(s)</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline-gold" size="sm" onClick={() => refetch()} leftIcon={<RefreshCcw size={16} />}>Actualiser</Button>
              <Button variant="luxe" size="sm" onClick={() => setCreateModalOpen(true)} leftIcon={<UserPlus size={16} />}>
                Créer un utilisateur
              </Button>
            </div>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[
              { icon: <Users size={20} className="text-gold-500" />, label: 'Total', value: stats.total },
              { icon: <Shield size={20} className="text-blue-500" />, label: 'Admins', value: stats.admins },
              { icon: <User size={20} className="text-green-500" />, label: 'Acheteurs', value: stats.acheteurs },
              { icon: <UserCheck size={20} className="text-purple-500" />, label: 'Vendeurs', value: stats.vendeurs },
              { icon: <Ban size={20} className="text-red-500" />, label: 'Bannis', value: stats.banned },
            ].map((s, i) => (
              <div key={i} className="bg-card rounded-xl p-4 border border-border flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">{s.icon}</div>
                <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="font-bold text-foreground">{s.value}</p></div>
              </div>
            ))}
          </div>

          {/* Filtres */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
              <Input variant="glass" placeholder="Rechercher par email, nom..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-10" allowClear onClear={() => setSearch('')} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[{ key: 'all', label: 'Tous' }, { key: 'acheteur', label: 'Acheteurs' }, { key: 'vendeur', label: 'Vendeurs' }, { key: 'admin', label: 'Admins' }].map(f => (
                <button key={f.key} onClick={() => { setFilterRole(f.key as RoleFilter); setPage(1) }} className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition border', filterRole === f.key ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm' : 'bg-card border-border text-muted-foreground hover:border-gold-400')}>
                  {f.label}
                </button>
              ))}
            </div>
            {selectedIds.size > 0 && (
              <div className="flex gap-2 items-center ml-auto">
                <span className="text-xs text-neutral-500">{selectedIds.size} sélectionné(s)</span>
                <Button variant="danger" size="sm" onClick={() => {}}>Supprimer sélection</Button>
              </div>
            )}
          </div>

          {/* Tableau */}
          <Card variant="glass" className="border-gold-400/20 overflow-hidden">
            <Table
              columns={columns}
              data={utilisateurs}
              keyExtractor={(row) => row.id}
              emptyMessage="Aucun utilisateur trouvé."
              emptyIcon={<Users size={48} className="text-neutral-400" />}
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
              onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
            />
          )}
        </motion.div>
      </Container>

      {/* Modal changement de rôle (inchangé) */}
      <Modal isOpen={!!roleModalUser} onClose={() => setRoleModalUser(null)} title="Modifier le rôle" size="sm" accent="gold">
        <div className="space-y-4">
          <p className="text-sm">Utilisateur : <strong>{roleModalUser?.prenom} {roleModalUser?.nom}</strong></p>
          <select value={newRole} onChange={e => setNewRole(e.target.value as 'acheteur' | 'vendeur')} className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm">
            <option value="acheteur">Acheteur</option>
            <option value="vendeur">Vendeur</option>
          </select>
          <div className="flex gap-3">
            <Button variant="luxe" fullWidth onClick={handleRoleConfirm} loading={changeRoleMutation.isPending}>Confirmer</Button>
            <Button variant="outline-gold" fullWidth onClick={() => setRoleModalUser(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal de suppression */}
      <Modal isOpen={!!deleteTargetId} onClose={() => setDeleteTargetId(null)} title="Supprimer l'utilisateur" size="sm" accent="danger">
        <div className="space-y-4">
          <p className="text-sm">Êtes‑vous sûr de vouloir supprimer définitivement cet utilisateur ? Cette action est irréversible.</p>
          <div className="flex gap-3">
            <Button variant="danger" fullWidth onClick={() => deleteTargetId && deleteUserMutation.mutate(deleteTargetId)} loading={deleteUserMutation.isPending}>Supprimer</Button>
            <Button variant="outline-gold" fullWidth onClick={() => setDeleteTargetId(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal édition utilisateur */}
      <Modal isOpen={!!editModalUser} onClose={() => setEditModalUser(null)} title="Modifier les informations" size="md" accent="gold">
        <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
          <Input label="Prénom" {...editForm.register('prenom')} variant="glass" />
          <Input label="Nom" {...editForm.register('nom')} variant="glass" />
          <Input label="Email" {...editForm.register('email')} variant="glass" />
          <Input label="Téléphone" {...editForm.register('telephone')} variant="glass" />
          <div className="flex gap-3">
            <Button variant="luxe" fullWidth type="submit" loading={updateUserMutation.isPending}>Enregistrer</Button>
            <Button variant="outline-gold" fullWidth onClick={() => setEditModalUser(null)}>Annuler</Button>
          </div>
        </form>
      </Modal>

      {/* Modal réinitialisation mot de passe */}
      <Modal isOpen={!!resetPasswordTargetId} onClose={() => setResetPasswordTargetId(null)} title="Réinitialiser le mot de passe" size="sm" accent="gold">
        <div className="space-y-4">
          <p className="text-sm">Un nouveau mot de passe sera généré et affiché. L'utilisateur pourra le changer par la suite.</p>
          <div className="flex gap-3">
            <Button variant="luxe" fullWidth onClick={() => resetPasswordTargetId && resetPasswordMutation.mutate(resetPasswordTargetId)} loading={resetPasswordMutation.isPending}>
              Réinitialiser
            </Button>
            <Button variant="outline-gold" fullWidth onClick={() => setResetPasswordTargetId(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal bannir/débannir */}
      <Modal isOpen={!!banTargetId} onClose={() => setBanTargetId(null)} title={utilisateurs.find(u => u.id === banTargetId)?.est_actif ? 'Bannir l\'utilisateur' : 'Débannir l\'utilisateur'} size="sm" accent="gold">
        <div className="space-y-4">
          <p className="text-sm">
            {utilisateurs.find(u => u.id === banTargetId)?.est_actif
              ? 'Le compte sera désactivé et l\'utilisateur ne pourra plus se connecter.'
              : 'Le compte sera réactivé.'}
          </p>
          <div className="flex gap-3">
            <Button variant={utilisateurs.find(u => u.id === banTargetId)?.est_actif ? 'danger' : 'accent'} fullWidth onClick={handleBanConfirm} loading={toggleBanMutation.isPending}>
              Confirmer
            </Button>
            <Button variant="outline-gold" fullWidth onClick={() => setBanTargetId(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal création utilisateur */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Créer un utilisateur" size="md" accent="gold">
        <form onSubmit={createForm.handleSubmit(handleCreateUser)} className="space-y-4">
          <Input label="Prénom *" {...createForm.register('prenom')} variant="glass" error={createForm.formState.errors.prenom?.message} />
          <Input label="Nom *" {...createForm.register('nom')} variant="glass" error={createForm.formState.errors.nom?.message} />
          <Input label="Email *" type="email" {...createForm.register('email')} variant="glass" error={createForm.formState.errors.email?.message} />
          <Input label="Téléphone" {...createForm.register('telephone')} variant="glass" />
          <select {...createForm.register('type_user')} className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm">
            <option value="acheteur">Acheteur</option>
            <option value="vendeur">Vendeur</option>
          </select>
          <Input label="Mot de passe *" type="password" {...createForm.register('password')} variant="glass" error={createForm.formState.errors.password?.message} />
          <div className="flex gap-3">
            <Button variant="luxe" fullWidth type="submit" loading={createUserMutation.isPending}>Créer</Button>
            <Button variant="outline-gold" fullWidth onClick={() => setCreateModalOpen(false)}>Annuler</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// Composants Table et Pagination (identiques à l'original)
function Table({ columns, data, keyExtractor, emptyMessage, emptyIcon, onRowClick, sortColumn, sortDirection, onSort, loading }: any) {
  return (
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
}

function Pagination({ currentPage, totalPages, onPageChange, totalItems, pageSize, onPageSizeChange }: any) {
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
            {[15, 25, 50].map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}