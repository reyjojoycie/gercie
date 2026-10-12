// app/admin/points-retrait/page.tsx
'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/components/ui/Toast'
import {
  Plus, Pencil, Trash2, Search, X, Check, Star, MapPin, Phone, Clock,
  User, Store, ShieldCheck, Sparkles, RefreshCcw, Navigation, Globe,
  Building, BadgeCheck, Camera, Download, Filter, ArrowUpDown,
  ChevronLeft, ChevronRight, Eye, ExternalLink, Copy, CheckCircle2,
  AlertCircle, BarChart3, MapPinned, Smartphone, QrCode, Upload,
  MoreHorizontal, Map, Route, Layers, Sliders, RotateCw, FileText,
  Image as ImageIcon, Video, HelpCircle, Info,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

// Chargement dynamique de la carte pour éviter les erreurs SSR
const PointRetraitMap = dynamic(() => import('@/components/maps/PointRetraitMap'), { ssr: false })

/* ------------------------------------------------------------------ */
/*  Types enrichies                                                     */
/* ------------------------------------------------------------------ */
interface PointRetrait {
  id: number
  nom: string
  adresse: string
  telephone: string | null
  commune_id: number | null
  horaires: string | null
  est_actif: boolean
  province_nom: string | null
  ville_nom: string | null
  quartier: string | null
  avenue: string | null
  numero: string | null
  reference: string | null
  latitude: number | null
  longitude: number | null
  photo_url: string | null
  points_de_repere: string | null
  instructions_retrait: string | null
  contact_nom: string | null
  type_etablissement: string | null
  est_partenaire_verifie: boolean
  note_moyenne: number | null
  created_at: string
  total_colis?: number
  dernier_colis?: string
  distance?: number // calculée
}

interface Commune {
  id: number
  nom: string
}

/* ------------------------------------------------------------------ */
/*  Schéma Zod pour le formulaire                                       */
/* ------------------------------------------------------------------ */
const pointRetraitSchema = z.object({
  nom: z.string().min(2, 'Le nom est requis (2 caractères min)'),
  adresse: z.string().min(5, 'L\'adresse est requise'),
  commune_id: z.number().nullable().optional(),
  telephone: z.string().optional().nullable(),
  horaires: z.string().optional().nullable(),
  est_actif: z.boolean().default(true),
  province_nom: z.string().optional().nullable(),
  ville_nom: z.string().optional().nullable(),
  quartier: z.string().optional().nullable(),
  avenue: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  photo_url: z.string().url('URL invalide').optional().nullable().or(z.literal('')),
  points_de_repere: z.string().optional().nullable(),
  instructions_retrait: z.string().optional().nullable(),
  contact_nom: z.string().optional().nullable(),
  type_etablissement: z.string().optional().nullable(),
  est_partenaire_verifie: z.boolean().default(false),
  note_moyenne: z.number().min(0).max(5).nullable().optional(),
})

type PointRetraitForm = z.infer<typeof pointRetraitSchema>

/* ------------------------------------------------------------------ */
/*  Composants Table & Pagination (identiques à l'original)            */
/* ------------------------------------------------------------------ */
// (Inchangés, repris de l'original)

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function PointsRetraitAdminPage() {
  const { user, loading: authLoading, isAdmin } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const toast = useToast()

  // États depuis URL ou défaut
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [filterActif, setFilterActif] = useState(searchParams.get('actif') || 'all')
  const [filterVerifie, setFilterVerifie] = useState(searchParams.get('verifie') || 'all')
  const [filterVille, setFilterVille] = useState(searchParams.get('ville') || '')
  const [filterNote, setFilterNote] = useState(searchParams.get('note') || 'all') // 'all', '4+', '3+', '<3'
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pageSize, setPageSize] = useState(Number(searchParams.get('limit') || 10))
  const [sortColumn, setSortColumn] = useState(searchParams.get('sort') || 'nom')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>((searchParams.get('dir') as 'asc' | 'desc') || 'asc')
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'map'>('table')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PointRetrait | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showDetail, setShowDetail] = useState<PointRetrait | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [importCsvModal, setImportCsvModal] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filterActif !== 'all') params.set('actif', filterActif)
    if (filterVerifie !== 'all') params.set('verifie', filterVerifie)
    if (filterVille) params.set('ville', filterVille)
    if (filterNote !== 'all') params.set('note', filterNote)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 10) params.set('limit', String(pageSize))
    if (sortColumn !== 'nom') params.set('sort', sortColumn)
    if (sortDirection !== 'asc') params.set('dir', sortDirection)
    router.replace(`/admin/points-retrait?${params.toString()}`, { scroll: false })
  }, [debouncedSearch, filterActif, filterVerifie, filterVille, filterNote, page, pageSize, sortColumn, sortDirection, router])

  // Vérification admin
  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      router.replace('/')
      toast.addToast({ type: 'error', message: 'Accès réservé aux administrateurs' })
    }
  }, [authLoading, user, isAdmin, router, toast])

  // Géolocalisation utilisateur
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      )
    }
  }, [])

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PointRetraitForm>({
    resolver: zodResolver(pointRetraitSchema),
    defaultValues: {
      nom: '', adresse: '', commune_id: null, telephone: '', horaires: '',
      est_actif: true, province_nom: '', ville_nom: '', quartier: '', avenue: '',
      numero: '', reference: '', latitude: null, longitude: null, photo_url: '',
      points_de_repere: '', instructions_retrait: '', contact_nom: '',
      type_etablissement: '', est_partenaire_verifie: false, note_moyenne: null,
    },
  })

  // Chargement des points
  const {
    data: points = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<PointRetrait[]>({
    queryKey: ['admin-points-retrait'],
    queryFn: async () => {
      const res = await fetch('/api/admin/points-retrait')
      if (!res.ok) throw new Error('Erreur chargement points de retrait')
      const json = await res.json()
      return Array.isArray(json.data) ? json.data : json
    },
    enabled: !!user && isAdmin,
    staleTime: 30_000,
  })

  // Communes
  const { data: communes = [] } = useQuery<Commune[]>({
    queryKey: ['communes-all'],
    queryFn: async () => {
      const res = await fetch('/api/communes/all')
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!user && isAdmin,
    staleTime: 10 * 60 * 1000,
  })

  // Filtrage local avancé
  const filtered = useMemo(() => {
    let list = points
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(p =>
        p.nom?.toLowerCase().includes(q) ||
        p.adresse?.toLowerCase().includes(q) ||
        (p.ville_nom || '').toLowerCase().includes(q) ||
        (p.contact_nom || '').toLowerCase().includes(q) ||
        (p.type_etablissement || '').toLowerCase().includes(q)
      )
    }
    if (filterActif !== 'all') {
      list = list.filter(p => p.est_actif === (filterActif === 'actif'))
    }
    if (filterVerifie !== 'all') {
      list = list.filter(p => p.est_partenaire_verifie === (filterVerifie === 'oui'))
    }
    if (filterVille) {
      list = list.filter(p => (p.ville_nom || '').toLowerCase() === filterVille.toLowerCase())
    }
    if (filterNote === '4+') {
      list = list.filter(p => (p.note_moyenne || 0) >= 4)
    } else if (filterNote === '3+') {
      list = list.filter(p => (p.note_moyenne || 0) >= 3)
    } else if (filterNote === '<3') {
      list = list.filter(p => (p.note_moyenne || 0) < 3)
    }
    return list
  }, [points, debouncedSearch, filterActif, filterVerifie, filterVille, filterNote])

  // Tri local
  const sorted = useMemo(() => {
    const safeList = Array.isArray(filtered) ? filtered : []
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...safeList].sort((a, b) => {
      let aVal: any = a[sortColumn as keyof PointRetrait]
      let bVal: any = b[sortColumn as keyof PointRetrait]
      if (sortColumn === 'nom') { aVal = a.nom?.toLowerCase(); bVal = b.nom?.toLowerCase() }
      else if (sortColumn === 'ville') { aVal = (a.ville_nom || '').toLowerCase(); bVal = (b.ville_nom || '').toLowerCase() }
      else if (sortColumn === 'note') { aVal = a.note_moyenne || 0; bVal = b.note_moyenne || 0 }
      else if (sortColumn === 'created_at') { aVal = a.created_at || ''; bVal = b.created_at || '' }
      if (aVal < bVal) return -1 * dir
      if (aVal > bVal) return 1 * dir
      return 0
    })
  }, [filtered, sortColumn, sortDirection])

  // Pagination locale
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, pageSize])
  const totalPages = Math.ceil(sorted.length / pageSize)

  // Statistiques
  const stats = useMemo(() => {
    const list = Array.isArray(points) ? points : []
    const withNote = list.filter(p => p.note_moyenne != null)
    return {
      total: list.length,
      actifs: list.filter(p => p.est_actif).length,
      verifies: list.filter(p => p.est_partenaire_verifie).length,
      avgNote: withNote.length > 0
        ? (withNote.reduce((acc, p) => acc + (p.note_moyenne || 0), 0) / withNote.length).toFixed(1)
        : '—',
      villes: new Set(list.map(p => p.ville_nom).filter(Boolean)).size,
    }
  }, [points])

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async ({ data, id }: { data: PointRetraitForm; id?: number }) => {
      const url = id ? `/api/admin/points-retrait/${id}` : '/api/admin/points-retrait'
      const method = id ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur enregistrement')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-points-retrait'] })
      toast.addToast({ type: 'success', message: editing ? 'Point modifié' : 'Point créé' })
      setModalOpen(false); setEditing(null); reset()
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const toggleMutation = useMutation({
    mutationFn: async (point: PointRetrait) => {
      const res = await fetch(`/api/admin/points-retrait/${point.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...point, est_actif: !point.est_actif }),
      })
      if (!res.ok) throw new Error('Erreur')
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-points-retrait'] }); toast.addToast({ type: 'success', message: 'Statut mis à jour' }) },
    onError: () => toast.addToast({ type: 'error', message: 'Erreur mise à jour' }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/points-retrait/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-points-retrait'] })
      toast.addToast({ type: 'success', message: 'Point supprimé' })
      setDeleteTargetId(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const duplicateMutation = useMutation({
    mutationFn: async (point: PointRetrait) => {
      const { id, created_at, ...rest } = point
      const res = await fetch('/api/admin/points-retrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, nom: `${rest.nom} (copie)` }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-points-retrait'] })
      toast.addToast({ type: 'success', message: 'Point dupliqué' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const importCsvMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/points-retrait/import', { method: 'POST', body: formData })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-points-retrait'] })
      toast.addToast({ type: 'success', message: `${data.count} point(s) importé(s)` })
      setImportCsvModal(false)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  // Handlers
  const handleOpenAdd = () => { setEditing(null); reset(); setModalOpen(true) }
  const handleOpenEdit = (point: PointRetrait) => {
    setEditing(point)
    reset({
      nom: point.nom, adresse: point.adresse, commune_id: point.commune_id,
      telephone: point.telephone, horaires: point.horaires, est_actif: point.est_actif,
      province_nom: point.province_nom, ville_nom: point.ville_nom, quartier: point.quartier,
      avenue: point.avenue, numero: point.numero, reference: point.reference,
      latitude: point.latitude, longitude: point.longitude, photo_url: point.photo_url,
      points_de_repere: point.points_de_repere, instructions_retrait: point.instructions_retrait,
      contact_nom: point.contact_nom, type_etablissement: point.type_etablissement,
      est_partenaire_verifie: point.est_partenaire_verifie, note_moyenne: point.note_moyenne,
    })
    setModalOpen(true)
  }
  const handleToggle = (point: PointRetrait) => toggleMutation.mutate(point)
  const handleDeleteRequest = (id: number) => setDeleteTargetId(id)
  const handleFormSubmit = (data: PointRetraitForm) => {
    saveMutation.mutate({ data: { ...data, photo_url: data.photo_url || null, telephone: data.telephone || null }, id: editing?.id })
  }
  const handleDuplicate = (point: PointRetrait) => duplicateMutation.mutate(point)
  const handleImportCsv = () => {
    if (csvFile) importCsvMutation.mutate(csvFile)
  }

  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  const handleSort = (col: string) => {
    if (sortColumn === col) setSortDirection(p => p === 'asc' ? 'desc' : 'asc')
    else { setSortColumn(col); setSortDirection('asc') }
  }

  const exportCSV = () => {
    const headers = ['Nom', 'Adresse', 'Ville', 'Téléphone', 'Actif', 'Vérifié', 'Note']
    const rows = filtered.map(p => [p.nom, p.adresse, p.ville_nom, p.telephone, p.est_actif ? 'Oui' : 'Non', p.est_partenaire_verifie ? 'Oui' : 'Non', p.note_moyenne])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `points_retrait_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  // Colonnes
  const columns = [
    {
      header: '',
      accessor: (row: PointRetrait) => (
        <button onClick={(e) => { e.stopPropagation(); toggleSelect(row.id) }} className="text-neutral-400 hover:text-gold-500">
          {selectedIds.has(row.id) ? <CheckCircle2 size={18} className="text-gold-500" /> : <div className="w-4 h-4 rounded border border-neutral-300" />}
        </button>
      ),
      className: 'w-10',
    },
    {
      header: 'Point',
      accessor: (row: PointRetrait) => (
        <div className="flex items-center gap-3">
          {row.photo_url ? (
            <img src={row.photo_url} alt="" className="w-10 h-10 rounded-xl object-cover border-2 border-gold-400/20" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center border border-gold-400/20">
              <Store size={18} className="text-gold-600" />
            </div>
          )}
          <div>
            <p className="font-semibold text-foreground">{row.nom}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{row.adresse}</p>
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Ville',
      accessor: (row: PointRetrait) => (
        <span className="text-sm">{row.ville_nom || '—'}</span>
      ),
      sortable: true,
    },
    {
      header: 'Téléphone',
      accessor: (row: PointRetrait) => (
        row.telephone ? <span className="text-sm">{row.telephone}</span> : <span className="text-xs text-neutral-400">—</span>
      ),
    },
    {
      header: 'Vérifié',
      accessor: (row: PointRetrait) =>
        row.est_partenaire_verifie ? <Badge variant="accent" size="sm"><BadgeCheck size={12} className="mr-1" /> Oui</Badge> : <Badge variant="neutral" size="sm">Non</Badge>,
      className: 'text-center',
    },
    {
      header: 'Note',
      accessor: (row: PointRetrait) =>
        row.note_moyenne != null ? (
          <div className="flex items-center gap-1 text-gold-500 justify-center">
            <Star size={14} fill="currentColor" />
            <span className="font-medium">{row.note_moyenne.toFixed(1)}</span>
          </div>
        ) : <span className="text-neutral-400">—</span>,
      className: 'text-center',
      sortable: true,
    },
    {
      header: 'Statut',
      accessor: (row: PointRetrait) =>
        row.est_actif ? <Badge variant="accent" size="sm">Actif</Badge> : <Badge variant="danger" size="sm">Inactif</Badge>,
      className: 'text-center',
    },
    {
      header: 'Actions',
      accessor: (row: PointRetrait) => (
        <div className="flex items-center justify-center gap-1">
          <Tooltip content="Détails">
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setShowDetail(row) }}>
              <Eye size={16} className="text-gold-500" />
            </Button>
          </Tooltip>
          <Tooltip content="Modifier">
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleOpenEdit(row) }}>
              <Pencil size={16} className="text-neutral-400 hover:text-gold-500" />
            </Button>
          </Tooltip>
          <Tooltip content="Dupliquer">
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDuplicate(row) }} loading={duplicateMutation.isPending}>
              <Copy size={16} className="text-neutral-400 hover:text-blue-500" />
            </Button>
          </Tooltip>
          <Tooltip content={row.est_actif ? 'Désactiver' : 'Activer'}>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleToggle(row) }}>
              {row.est_actif ? <X size={16} className="text-amber-500" /> : <Check size={16} className="text-green-500" />}
            </Button>
          </Tooltip>
          <Tooltip content="Supprimer">
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteRequest(row.id) }}>
              <Trash2 size={16} className="text-red-500" />
            </Button>
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
          {/* En-tête */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gold-100 dark:bg-gold-900/30 text-gold-600 dark:text-gold-400">
                  <MapPin size={24} />
                </div>
                Points de retrait
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                {stats.total} point(s) · {stats.villes} ville(s)
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline-gold" size="sm" onClick={() => refetch()} leftIcon={<RefreshCcw size={16} />}>
                Actualiser
              </Button>
              <Button variant="outline-gold" size="sm" onClick={exportCSV} leftIcon={<Download size={14} />}>
                Export CSV
              </Button>
              <Button variant="outline-gold" size="sm" onClick={() => setImportCsvModal(true)} leftIcon={<Upload size={14} />}>
                Import CSV
              </Button>
              <Button variant="outline-gold" size="sm" onClick={() => setViewMode(viewMode === 'map' ? 'table' : 'map')} leftIcon={viewMode === 'map' ? <Layers size={14} /> : <Map size={14} />}>
                {viewMode === 'map' ? 'Tableau' : 'Carte'}
              </Button>
              <Button variant="luxe" size="md" onClick={handleOpenAdd} leftIcon={<Plus size={16} />}>
                Ajouter un point
              </Button>
            </div>
          </div>

          {/* Stats rapides */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[
              { icon: <MapPin size={20} className="text-gold-500" />, label: 'Total', value: stats.total },
              { icon: <CheckCircle2 size={20} className="text-green-500" />, label: 'Actifs', value: stats.actifs },
              { icon: <BadgeCheck size={20} className="text-blue-500" />, label: 'Vérifiés', value: stats.verifies },
              { icon: <Star size={20} className="text-amber-500" />, label: 'Note moy.', value: stats.avgNote },
              { icon: <Building size={20} className="text-purple-500" />, label: 'Villes', value: stats.villes },
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
              {[
                { key: 'all', label: 'Tous' },
                { key: 'actif', label: 'Actifs' },
                { key: 'inactif', label: 'Inactifs' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setFilterActif(opt.key); setPage(1) }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition border',
                    filterActif === opt.key
                      ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm'
                      : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <select
                value={filterVerifie}
                onChange={e => { setFilterVerifie(e.target.value); setPage(1) }}
                className="bg-card border border-border rounded-full px-3 py-1.5 text-xs"
              >
                <option value="all">Tous vérifiés</option>
                <option value="oui">Vérifié</option>
                <option value="non">Non vérifié</option>
              </select>
              <select
                value={filterNote}
                onChange={e => { setFilterNote(e.target.value); setPage(1) }}
                className="bg-card border border-border rounded-full px-3 py-1.5 text-xs"
              >
                <option value="all">Toutes notes</option>
                <option value="4+">4+ ★</option>
                <option value="3+">3+ ★</option>
                <option value="<3">&lt; 3 ★</option>
              </select>
              <Input
                variant="glass"
                placeholder="Filtrer par ville..."
                value={filterVille}
                onChange={e => { setFilterVille(e.target.value); setPage(1) }}
                size="sm"
                className="w-32"
                allowClear
                onClear={() => setFilterVille('')}
              />
            </div>
            {(search || filterActif !== 'all' || filterVerifie !== 'all' || filterVille || filterNote !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterActif('all'); setFilterVerifie('all'); setFilterVille(''); setFilterNote('all'); setPage(1) }} className="text-red-500">
                <X size={14} className="mr-1" /> Effacer
              </Button>
            )}
          </div>

          {/* Actions groupées */}
          {selectedIds.size > 0 && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-gold-50 dark:bg-gold-900/20 rounded-xl border border-gold-400/30 flex items-center gap-4 flex-wrap">
              <span className="text-sm font-medium text-gold-800 dark:text-gold-300">
                {selectedIds.size} sélectionné(s)
              </span>
              <div className="flex gap-2">
                <Button variant="accent" size="sm" onClick={() => {
                  selectedIds.forEach(id => {
                    const p = points.find(pt => pt.id === id)
                    if (p) toggleMutation.mutate(p)
                  })
                  setSelectedIds(new Set())
                }} disabled={toggleMutation.isPending}>Activer/Désactiver</Button>
                <Button variant="danger" size="sm" onClick={() => {
                  if (confirm(`Supprimer ${selectedIds.size} point(s) ?`)) {
                    selectedIds.forEach(id => deleteMutation.mutate(id))
                    setSelectedIds(new Set())
                  }
                }}>Supprimer</Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Annuler</Button>
            </motion.div>
          )}

          {/* Vue carte */}
          {viewMode === 'map' && (
            <Card variant="glass" className="border-gold-400/20 mb-8 overflow-hidden">
              <CardContent className="p-0 h-[500px]">
                {typeof window !== 'undefined' && (
                  <PointRetraitMap
                    points={sorted.map(p => ({
                      id: p.id,
                      nom: p.nom,
                      latitude: p.latitude || 0,
                      longitude: p.longitude || 0,
                      adresse: p.adresse,
                      est_actif: p.est_actif,
                    }))}
                    userLocation={userLocation}
                    onSelect={(id) => {
                      const point = points.find(p => p.id === id)
                      if (point) setShowDetail(point)
                    }}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Tableau / Grille */}
          {viewMode !== 'map' && (
            <>
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
                  <p className="text-red-500 mb-4">{error?.message || 'Erreur'}</p>
                  <Button variant="outline-gold" onClick={() => refetch()}>Réessayer</Button>
                </div>
              ) : paginated.length === 0 ? (
                <Card variant="glass" className="border-gold-400/20 text-center py-12">
                  <CardContent>
                    <MapPin size={48} className="mx-auto text-neutral-400 mb-4" />
                    <p className="text-neutral-500">Aucun point de retrait trouvé.</p>
                  </CardContent>
                </Card>
              ) : viewMode === 'table' ? (
                <>
                  <Card variant="glass" className="border-gold-400/20 overflow-hidden">
                    <Table
                      columns={columns}
                      data={paginated}
                      keyExtractor={(row) => String(row.id)}
                      emptyMessage="Aucun point."
                      emptyIcon={<MapPin size={48} className="text-neutral-400" />}
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      loading={isLoading}
                    />
                  </Card>
                  {totalPages > 1 && (
                    <Pagination
                      currentPage={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                      totalItems={sorted.length}
                      pageSize={pageSize}
                      onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
                    />
                  )}
                </>
              ) : (
                /* Vue grille */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paginated.map(point => (
                    <Card key={point.id} variant="glass" className="border-gold-400/20 hover:shadow-gold transition cursor-pointer" onClick={() => setShowDetail(point)}>
                      {point.photo_url && <img src={point.photo_url} className="w-full h-32 object-cover rounded-t-xl" />}
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold">{point.nom}</h3>
                            <p className="text-xs text-muted-foreground">{point.ville_nom}</p>
                          </div>
                          <Badge variant={point.est_actif ? 'accent' : 'danger'} size="sm">{point.est_actif ? 'Actif' : 'Inactif'}</Badge>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <MapPin size={14} className="text-gold-500" />
                          <span className="text-xs truncate">{point.adresse}</span>
                        </div>
                        {point.note_moyenne != null && (
                          <div className="flex items-center gap-1 mt-2 text-amber-500">
                            <Star size={14} fill="currentColor" />
                            <span className="text-sm font-medium">{point.note_moyenne.toFixed(1)}</span>
                          </div>
                        )}
                        <div className="flex gap-2 mt-3">
                          <Button variant="outline-gold" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenEdit(point) }}>Modifier</Button>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleToggle(point) }}>{point.est_actif ? 'Désactiver' : 'Activer'}</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </motion.div>
      </Container>

      {/* Modal détail (enrichie) */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail?.nom} size="lg" accent="gold">
        {showDetail && (
          <div className="space-y-4">
            {showDetail.photo_url && <img src={showDetail.photo_url} className="w-full h-48 object-cover rounded-xl" />}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Adresse :</span> <p className="font-medium">{showDetail.adresse}</p></div>
              <div><span className="text-muted-foreground">Téléphone :</span> <p className="font-medium">{showDetail.telephone || '—'}</p></div>
              <div><span className="text-muted-foreground">Horaires :</span> <p className="font-medium">{showDetail.horaires || '—'}</p></div>
              <div><span className="text-muted-foreground">Contact :</span> <p className="font-medium">{showDetail.contact_nom || '—'}</p></div>
              <div><span className="text-muted-foreground">Province :</span> <p className="font-medium">{showDetail.province_nom || '—'}</p></div>
              <div><span className="text-muted-foreground">Ville :</span> <p className="font-medium">{showDetail.ville_nom || '—'}</p></div>
              <div className="col-span-2"><span className="text-muted-foreground">Instructions :</span> <p className="font-medium">{showDetail.instructions_retrait || '—'}</p></div>
              <div><span className="text-muted-foreground">Type :</span> <Badge variant="neutral">{showDetail.type_etablissement || '—'}</Badge></div>
              <div><span className="text-muted-foreground">Statut :</span> <Badge variant={showDetail.est_actif ? 'accent' : 'danger'}>{showDetail.est_actif ? 'Actif' : 'Inactif'}</Badge></div>
            </div>
            {showDetail.latitude && showDetail.longitude && (
              <div className="flex gap-2">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${showDetail.latitude},${showDetail.longitude}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-gold-500 hover:underline text-sm"
                >
                  <Navigation size={14} /> Itinéraire
                </a>
                <button onClick={() => { /* générer QR code */ }} className="text-gold-500 text-sm flex items-center gap-1">
                  <QrCode size={14} /> QR Code
                </button>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="outline-gold" size="sm" onClick={() => { setShowDetail(null); handleOpenEdit(showDetail) }}>Modifier</Button>
              <Button variant="danger" size="sm" onClick={() => { handleDeleteRequest(showDetail.id); setShowDetail(null) }}>Supprimer</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Ajout/Modification */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); reset() }}
        title={editing ? 'Modifier le point' : 'Nouveau point de retrait'}
        size="xl"
        accent="gold"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nom *" variant="glass" {...register('nom')} error={errors.nom?.message} placeholder="Ex: Point Gercie - Gombe" />
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Commune</label>
              <select
                {...register('commune_id', { valueAsNumber: true })}
                className="w-full bg-white/50 dark:bg-midnight-800/50 backdrop-blur-sm border border-gold-400/20 rounded-xl px-4 py-2.5 text-sm"
              >
                <option value="">Sélectionner une commune</option>
                {communes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <Input label="Province" variant="glass" {...register('province_nom')} />
            <Input label="Ville" variant="glass" {...register('ville_nom')} />
            <Input label="Quartier" variant="glass" {...register('quartier')} />
            <Input label="Avenue / Rue" variant="glass" {...register('avenue')} />
            <Input label="Numéro" variant="glass" {...register('numero')} />
            <Input label="Référence" variant="glass" {...register('reference')} placeholder="Ex: En face de la station" />
            <Input label="Téléphone" variant="glass" {...register('telephone')} placeholder="+243..." />
            <Input label="Horaires" variant="glass" {...register('horaires')} placeholder="Lun-Sam 8h-18h" />
            <Input label="Photo URL" variant="glass" {...register('photo_url')} placeholder="https://..." error={errors.photo_url?.message} />
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Points de repère</label>
            <textarea {...register('points_de_repere')} rows={2} className="w-full bg-white/50 dark:bg-midnight-800/50 backdrop-blur-sm border border-gold-400/20 rounded-xl px-4 py-3 text-sm resize-none" placeholder="À côté du marché..." />
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Instructions de retrait</label>
            <textarea {...register('instructions_retrait')} rows={2} className="w-full bg-white/50 dark:bg-midnight-800/50 backdrop-blur-sm border border-gold-400/20 rounded-xl px-4 py-3 text-sm resize-none" placeholder="Présenter le code PIN..." />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Input label="Contact nom" variant="glass" {...register('contact_nom')} placeholder="Responsable" />
            <Input label="Type établissement" variant="glass" {...register('type_etablissement')} placeholder="Supermarché, Kiosque..." />
            <Input label="Note moyenne" variant="glass" type="number" step="0.1" min="0" max="5" {...register('note_moyenne', { valueAsNumber: true })} placeholder="4.5" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Latitude" variant="glass" type="number" step="any" {...register('latitude', { valueAsNumber: true })} placeholder="-4.4419" />
            <Input label="Longitude" variant="glass" type="number" step="any" {...register('longitude', { valueAsNumber: true })} placeholder="15.2663" />
          </div>
          <div className="flex items-center gap-8 pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" {...register('est_actif')} className="w-4 h-4 rounded border-neutral-300 text-gold-500 focus:ring-gold-500" />
              <span className="text-sm font-medium">Actif</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" {...register('est_partenaire_verifie')} className="w-4 h-4 rounded border-neutral-300 text-gold-500 focus:ring-gold-500" />
              <span className="text-sm font-medium">Partenaire vérifié <BadgeCheck size={14} className="inline text-gold-500 ml-1" /></span>
            </label>
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="submit" variant="luxe" fullWidth loading={isSubmitting || saveMutation.isPending}>
              {editing ? 'Modifier' : 'Ajouter'}
            </Button>
            <Button type="button" variant="outline-gold" fullWidth onClick={() => { setModalOpen(false); setEditing(null); reset() }} disabled={isSubmitting || saveMutation.isPending}>
              Annuler
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal isOpen={!!deleteTargetId} onClose={() => setDeleteTargetId(null)} title="Supprimer le point de retrait ?" size="sm" accent="danger">
        <p className="text-sm mb-4">Cette action est irréversible.</p>
        <div className="flex gap-3">
          <Button variant="danger" fullWidth loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTargetId!)}>Supprimer</Button>
          <Button variant="outline" fullWidth onClick={() => setDeleteTargetId(null)} disabled={deleteMutation.isPending}>Annuler</Button>
        </div>
      </Modal>

      {/* Modal import CSV */}
      <Modal isOpen={importCsvModal} onClose={() => setImportCsvModal(false)} title="Importer des points de retrait" size="sm" accent="gold">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Sélectionnez un fichier CSV (colonnes : nom, adresse, telephone, ville, latitude, longitude…).</p>
          <input type="file" accept=".csv" ref={fileInputRef} onChange={e => setCsvFile(e.target.files?.[0] || null)} className="w-full text-sm" />
          <div className="flex gap-3">
            <Button variant="luxe" fullWidth onClick={handleImportCsv} loading={importCsvMutation.isPending} disabled={!csvFile}>Importer</Button>
            <Button variant="outline-gold" fullWidth onClick={() => setImportCsvModal(false)}>Annuler</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}