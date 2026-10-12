// app/admin/promotions/page.tsx
'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import {
  Plus, Pencil, Trash2, Tag, Clock, AlertTriangle, RefreshCcw, Search,
  Percent, Zap, Gift, Layers, Copy, Power, PowerOff, Download,
  Eye, ChevronLeft, ChevronRight, X, Filter, ArrowUpDown, BarChart3,
  TrendingUp, Calendar, DollarSign, Info, MoreHorizontal, CheckCircle2,
  LayoutGrid, List, FileText,
} from 'lucide-react'
import { format, isAfter, isBefore, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Promotion {
  id: string
  produit_id: string | null
  produit_nom?: string
  produit_prix?: number
  produit_image?: string
  type_promo: 'prix_fixe' | 'pourcentage' | 'flash' | 'lot_degressif' | 'cadeau'
  prix_promo: number
  valeur_pourcentage?: number
  description?: string
  date_debut: string
  date_fin: string
  actif: boolean
  created_at?: string
  quantite_min?: number
  cumulable?: boolean
  banniere_url?: string
  produit_cadeau_id?: string | null
  categorie_id?: string | null
}

interface Produit {
  id: string
  nom: string
  prix: number
  images: string[]
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */
const TYPE_OPTIONS = [
  { value: 'prix_fixe', label: 'Prix fixe', icon: <Tag size={14} /> },
  { value: 'pourcentage', label: '% Réduction', icon: <Percent size={14} /> },
  { value: 'flash', label: 'Offre flash', icon: <Zap size={14} /> },
  { value: 'lot_degressif', label: 'Lot dégressif', icon: <Layers size={14} /> },
  { value: 'cadeau', label: 'Cadeau offert', icon: <Gift size={14} /> },
]

const PER_PAGE = 10

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function AdminPromotionsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<'all' | 'actif' | 'inactif' | 'expire'>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [sortColumn, setSortColumn] = useState<'date_debut' | 'prix_promo' | 'produit_nom'>('date_debut')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [form, setForm] = useState({
    produit_id: null as string | null,
    type_promo: 'prix_fixe' as Promotion['type_promo'],
    prix_promo: 0,
    valeur_pourcentage: 0,
    description: '',
    date_debut: '',
    date_fin: '',
    actif: true,
    quantite_min: 1,
    cumulable: false,
    banniere_url: '',
    produit_cadeau_id: null as string | null,
    categorie_id: null as string | null,
  })
  const [produitSearch, setProduitSearch] = useState('')
  const [produitResults, setProduitResults] = useState<Produit[]>([])
  const [showProduitSearch, setShowProduitSearch] = useState(false)
  const [detailPromo, setDetailPromo] = useState<Promotion | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  // Onglets de la modale
  const [activeTab, setActiveTab] = useState<'general' | 'restrictions' | 'apparence'>('general')

  // Récupération des promotions
  const { data: promotionsData, isLoading, isError, refetch } = useQuery<Promotion[]>({
    queryKey: ['admin-promotions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/promotions')
      if (!res.ok) throw new Error('Erreur')
      return res.json()
    },
    staleTime: 30_000,
  })

  const promotions = Array.isArray(promotionsData) ? promotionsData : []

  // Filtrage
  const filtered = useMemo(() => {
    let list = promotions.filter(p =>
      (p.produit_nom || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(debouncedSearch.toLowerCase())
    )

    if (filterStatut === 'actif') {
      const now = new Date()
      list = list.filter(p => p.actif && isAfter(parseISO(p.date_fin), now))
    } else if (filterStatut === 'inactif') {
      list = list.filter(p => !p.actif)
    } else if (filterStatut === 'expire') {
      const now = new Date()
      list = list.filter(p => p.actif && isBefore(parseISO(p.date_fin), now))
    }

    if (filterType !== 'all') {
      list = list.filter(p => p.type_promo === filterType)
    }

    return list
  }, [promotions, debouncedSearch, filterStatut, filterType])

  // Tri
  const sorted = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let valA: any, valB: any
      switch (sortColumn) {
        case 'date_debut':
          valA = a.date_debut
          valB = b.date_debut
          break
        case 'prix_promo':
          valA = a.prix_promo
          valB = b.prix_promo
          break
        case 'produit_nom':
          valA = (a.produit_nom || '').toLowerCase()
          valB = (b.produit_nom || '').toLowerCase()
          break
        default:
          return 0
      }
      if (valA < valB) return -1 * dir
      if (valA > valB) return 1 * dir
      return 0
    })
  }, [filtered, sortColumn, sortDirection])

  // Pagination
  const totalPages = Math.ceil(sorted.length / PER_PAGE)
  const paginated = useMemo(() => {
    const start = (page - 1) * PER_PAGE
    return sorted.slice(start, start + PER_PAGE)
  }, [sorted, page])

  // Stats
  const stats = useMemo(() => {
    const now = new Date()
    const actives = promotions.filter(p => p.actif && isAfter(parseISO(p.date_fin), now)).length
    const expirees = promotions.filter(p => p.actif && isBefore(parseISO(p.date_fin), now)).length
    const inactives = promotions.filter(p => !p.actif).length
    return { total: promotions.length, actives, expirees, inactives }
  }, [promotions])

  // Recherche de produit pour le formulaire
  const searchProduits = async (query: string) => {
    if (query.length < 2) { setProduitResults([]); return }
    const res = await fetch(`/api/admin/produits?search=${encodeURIComponent(query)}&limit=10`)
    if (res.ok) {
      const data = await res.json()
      const prods = Array.isArray(data.data) ? data.data : data
      setProduitResults(prods)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => searchProduits(produitSearch), 300)
    return () => clearTimeout(timer)
  }, [produitSearch])

  const selectProduit = (prod: Produit) => {
    setForm({ ...form, produit_id: prod.id })
    setProduitSearch(prod.nom)
    setProduitResults([])
    setShowProduitSearch(false)
  }

  // Avertissement de conflit
  function PromoConflictWarning({ produitId, excludeId }: { produitId: string; excludeId?: string }) {
    const conflit = promotions.find(p => p.produit_id === produitId && p.actif && p.id !== excludeId)
    if (!conflit) return null
    return (
      <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 flex items-center gap-2">
        <AlertTriangle size={16} />
        Une promotion active existe déjà pour ce produit ({conflit.produit_nom}). Elle sera désactivée si vous enregistrez celle-ci.
      </div>
    )
  }

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!editing && payload.actif && payload.produit_id) {
        const conflit = promotions.find(p => p.produit_id === payload.produit_id && p.actif && p.id !== editing?.id)
        if (conflit) throw new Error(`Une promotion active existe déjà pour ce produit (${conflit.produit_nom})`)
      }
      const url = editing ? `/api/admin/promotions/${editing.id}` : '/api/admin/promotions'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })
      toast.addToast({ type: 'success', message: editing ? 'Promotion mise à jour' : 'Promotion créée' })
      setEditing(null)
      setCreating(false)
      setForm({
        produit_id: null, type_promo: 'prix_fixe', prix_promo: 0, valeur_pourcentage: 0,
        description: '', date_debut: '', date_fin: '', actif: true,
        quantite_min: 1, cumulable: false, banniere_url: '', produit_cadeau_id: null, categorie_id: null
      })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const toggleMutation = useMutation({
    mutationFn: async (promo: Promotion) => {
      await fetch(`/api/admin/promotions/${promo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...promo, actif: !promo.actif }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })
      toast.addToast({ type: 'success', message: 'Statut modifié' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await fetch(`/api/admin/promotions/${id}`, { method: 'DELETE' }) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })
      toast.addToast({ type: 'success', message: 'Promotion supprimée' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const duplicateMutation = useMutation({
    mutationFn: async (promo: Promotion) => {
      const { id, created_at, produit_nom, produit_prix, produit_image, ...rest } = promo
      await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, date_debut: new Date().toISOString(), date_fin: promo.date_fin, actif: false }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })
      toast.addToast({ type: 'success', message: 'Promotion dupliquée' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const openCreate = () => {
    setForm({
      produit_id: null, type_promo: 'prix_fixe', prix_promo: 0, valeur_pourcentage: 0,
      description: '', date_debut: '', date_fin: '', actif: true,
      quantite_min: 1, cumulable: false, banniere_url: '', produit_cadeau_id: null, categorie_id: null
    })
    setProduitSearch('')
    setCreating(true)
    setActiveTab('general')
  }

  const openEdit = (p: Promotion) => {
    setEditing(p)
    setForm({
      produit_id: p.produit_id || null,
      type_promo: p.type_promo || 'prix_fixe',
      prix_promo: p.prix_promo || 0,
      valeur_pourcentage: p.valeur_pourcentage || 0,
      description: p.description || '',
      date_debut: p.date_debut.slice(0, 16),
      date_fin: p.date_fin.slice(0, 16),
      actif: p.actif,
      quantite_min: p.quantite_min || 1,
      cumulable: p.cumulable || false,
      banniere_url: p.banniere_url || '',
      produit_cadeau_id: p.produit_cadeau_id || null,
      categorie_id: p.categorie_id || null,
    })
    setProduitSearch(p.produit_nom || '')
    setActiveTab('general')
  }

  const handleSave = () => {
  // Nettoyer et normaliser les champs
  const cleaned = {
    ...form,
    // UUID : chaîne vide → null
    produit_id: form.produit_id?.trim() || null,
    produit_cadeau_id: form.produit_cadeau_id?.trim() || null,
    categorie_id: form.categorie_id?.startsWith('cat') ? null : (form.categorie_id?.trim() || null),
    banniere_url: form.banniere_url?.trim() || "",
    // Dates : s'assurer qu'elles sont au format ISO complet
    date_debut: form.date_debut ? new Date(form.date_debut).toISOString() : null,
    date_fin: form.date_fin ? new Date(form.date_fin).toISOString() : null,
    // Prix / pourcentage
    prix_promo: form.type_promo === 'cadeau' ? 0 : Number(form.prix_promo) || 0,
    valeur_pourcentage: form.type_promo === 'pourcentage' ? Number(form.valeur_pourcentage) || null : null,
    quantite_min: Number(form.quantite_min) || 1,
  }

  // Validations locales
  if (!cleaned.produit_id && !cleaned.categorie_id) {
    toast.addToast({ type: 'error', message: 'Veuillez sélectionner un produit ou une catégorie' })
    return
  }
  if (cleaned.type_promo !== 'cadeau' && cleaned.type_promo !== 'pourcentage' && (!cleaned.prix_promo || cleaned.prix_promo <= 0)) {
    toast.addToast({ type: 'error', message: 'Le prix promotionnel est requis et doit être positif' })
    return
  }
  if (cleaned.type_promo === 'pourcentage' && (!cleaned.valeur_pourcentage || cleaned.valeur_pourcentage <= 0)) {
    toast.addToast({ type: 'error', message: 'Le pourcentage de réduction est requis' })
    return
  }
  if (!cleaned.date_debut || !cleaned.date_fin) {
    toast.addToast({ type: 'error', message: 'Les dates sont requises' })
    return
  }
  if (new Date(cleaned.date_fin) <= new Date(cleaned.date_debut)) {
    toast.addToast({ type: 'error', message: 'La date de fin doit être après la date de début' })
    return
  }

  saveMutation.mutate(cleaned)
}

  const exportCSV = () => {
    const headers = ['Produit', 'Type', 'Prix promo', '% Réduction', 'Début', 'Fin', 'Actif']
    const rows = filtered.map(p => [
      p.produit_nom, TYPE_OPTIONS.find(t => t.value === p.type_promo)?.label || p.type_promo,
      p.prix_promo, p.valeur_pourcentage || '', p.date_debut, p.date_fin, p.actif ? 'Oui' : 'Non'
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `promotions_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const handleSort = (col: typeof sortColumn) => {
    if (sortColumn === col) setSortDirection(p => p === 'asc' ? 'desc' : 'asc')
    else { setSortColumn(col); setSortDirection('asc') }
  }

  return (
    <Container className="py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                <Tag size={24} />
              </div>
              Promotions & Offres éclair
            </h1>
            <p className="text-muted-foreground mt-1">{stats.total} promotions · {stats.actives} actives</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline-gold" size="sm" onClick={exportCSV} leftIcon={<Download size={14} />}>Export CSV</Button>
            <Button variant="outline-gold" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'grid' : 'table')}>
              {viewMode === 'table' ? <LayoutGrid size={14} /> : <List size={14} />}
            </Button>
            <Button variant="luxe" onClick={openCreate}><Plus size={16} className="mr-1" /> Nouvelle promotion</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: <Tag size={20} className="text-amber-500" />, label: 'Total', value: stats.total },
            { icon: <CheckCircle2 size={20} className="text-green-500" />, label: 'Actives', value: stats.actives },
            { icon: <Clock size={20} className="text-red-500" />, label: 'Expirées', value: stats.expirees },
            { icon: <PowerOff size={20} className="text-neutral-500" />, label: 'Inactives', value: stats.inactives },
          ].map((stat, i) => (
            <div key={i} className="bg-card rounded-xl p-4 border border-border flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">{stat.icon}</div>
              <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="font-bold text-foreground">{stat.value}</p></div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
            <Input variant="glass" placeholder="Rechercher..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-10" allowClear onClear={() => setSearch('')} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all', label: 'Tous' },
              { key: 'actif', label: 'Actives' },
              { key: 'inactif', label: 'Inactives' },
              { key: 'expire', label: 'Expirées' },
            ].map(opt => (
              <button key={opt.key} onClick={() => { setFilterStatut(opt.key as any); setPage(1) }}
                className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition border', filterStatut === opt.key ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm' : 'bg-card border-border text-muted-foreground hover:border-gold-400')}>
                {opt.label}
              </button>
            ))}
            <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }} className="bg-card border border-border rounded-full px-3 py-1.5 text-xs">
              <option value="all">Tous types</option>
              {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {(search || filterStatut !== 'all' || filterType !== 'all') && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterStatut('all'); setFilterType('all'); setPage(1) }} className="text-red-500"><X size={14} className="mr-1" /> Effacer</Button>
          )}
        </div>

        {/* Contenu */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner variant="premium" size="lg" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center py-12 gap-4">
            <AlertTriangle size={48} className="text-red-500" />
            <Button variant="outline-gold" onClick={() => refetch()}><RefreshCcw size={16} className="mr-1" /> Réessayer</Button>
          </div>
        ) : paginated.length === 0 ? (
          <Card variant="glass"><CardContent className="text-center py-8 text-muted-foreground">Aucune promotion trouvée.</CardContent></Card>
        ) : viewMode === 'table' ? (
          <Card variant="glass" className="border-gold-400/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gold-400/20 text-left">
                    <th className="px-4 py-3 font-semibold cursor-pointer" onClick={() => handleSort('produit_nom')}>Produit {sortColumn === 'produit_nom' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold cursor-pointer" onClick={() => handleSort('prix_promo')}>Prix promo {sortColumn === 'prix_promo' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                    <th className="px-4 py-3 font-semibold cursor-pointer" onClick={() => handleSort('date_debut')}>Période {sortColumn === 'date_debut' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                    <th className="px-4 py-3 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(promo => {
                    const now = new Date()
                    const expired = promo.actif && isBefore(parseISO(promo.date_fin), now)
                    return (
                      <motion.tr key={promo.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-gold-400/5 hover:bg-gold-400/5">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {promo.produit_image ? <img src={promo.produit_image} className="w-8 h-8 rounded-lg object-cover" /> : <Tag size={20} className="text-amber-500" />}
                            <span className="font-medium">{promo.produit_nom || 'Produit inconnu'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{TYPE_OPTIONS.find(t => t.value === promo.type_promo)?.icon} {TYPE_OPTIONS.find(t => t.value === promo.type_promo)?.label}</td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="line-through text-muted-foreground mr-2 text-xs">{promo.produit_prix?.toLocaleString()} FC</span>
                            <span className="font-bold text-amber-600">{promo.prix_promo?.toLocaleString()} FC</span>
                            {promo.valeur_pourcentage ? <span className="text-xs text-green-600 ml-1">(-{promo.valeur_pourcentage}%)</span> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {format(parseISO(promo.date_debut), 'Pp', { locale: fr })} →<br />{format(parseISO(promo.date_fin), 'Pp', { locale: fr })}
                        </td>
                        <td className="px-4 py-3">
                          {!promo.actif ? <Badge variant="danger">Inactive</Badge>
                          : expired ? <Badge variant="neutral">Expirée</Badge>
                          : <Badge variant="accent">Active</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Tooltip content="Détails"><button onClick={() => setDetailPromo(promo)} className="p-1.5 rounded-lg text-neutral-400 hover:text-gold-500"><Eye size={16} /></button></Tooltip>
                            <Tooltip content="Modifier"><button onClick={() => openEdit(promo)} className="p-1.5 rounded-lg text-neutral-400 hover:text-gold-500"><Pencil size={16} /></button></Tooltip>
                            <Tooltip content="Dupliquer"><button onClick={() => duplicateMutation.mutate(promo)} className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-500"><Copy size={16} /></button></Tooltip>
                            <Tooltip content={promo.actif ? 'Désactiver' : 'Activer'}><button onClick={() => toggleMutation.mutate(promo)} className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-500">{promo.actif ? <PowerOff size={16} /> : <Power size={16} />}</button></Tooltip>
                            <Tooltip content="Supprimer"><button onClick={() => { if (confirm('Supprimer cette promotion ?')) deleteMutation.mutate(promo.id) }} className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500"><Trash2 size={16} /></button></Tooltip>
                          </div>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map(promo => (
              <Card key={promo.id} variant="glass" className="border-l-4 border-l-amber-400">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={promo.actif ? 'accent' : 'danger'}>{promo.actif ? 'Active' : 'Inactive'}</Badge>
                      <Badge variant="neutral">{TYPE_OPTIONS.find(t => t.value === promo.type_promo)?.label}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(promo)} className="p-1 text-neutral-400 hover:text-gold-500"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm('Supprimer ?')) deleteMutation.mutate(promo.id) }} className="p-1 text-neutral-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <h3 className="font-semibold">{promo.produit_nom || 'Produit inconnu'}</h3>
                  <div className="text-sm mt-2">
                    <span className="line-through mr-2">{promo.produit_prix?.toLocaleString()} FC</span>
                    <span className="font-bold text-amber-600">{promo.prix_promo?.toLocaleString()} FC</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Clock size={12} />
                    {format(parseISO(promo.date_debut), 'Pp', { locale: fr })} → {format(parseISO(promo.date_fin), 'Pp', { locale: fr })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6">
            <div className="flex items-center gap-1">
              <Button variant="outline-gold" size="icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft size={16} /></Button>
              <span className="text-sm px-3">{page} / {totalPages}</span>
              <Button variant="outline-gold" size="icon" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight size={16} /></Button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Modal création/édition */}
      <Modal
        isOpen={creating || !!editing}
        onClose={() => {
          setCreating(false); setEditing(null);
          setForm({
            produit_id: null, type_promo: 'prix_fixe', prix_promo: 0, valeur_pourcentage: 0,
            description: '', date_debut: '', date_fin: '', actif: true,
            quantite_min: 1, cumulable: false, banniere_url: '', produit_cadeau_id: null, categorie_id: null
          })
        }}
        title={editing ? 'Modifier la promotion' : 'Nouvelle promotion'}
        size="xl"
        accent="gold"
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* Onglets */}
          <div className="flex gap-2 border-b border-border pb-2">
            {(['general', 'restrictions', 'apparence'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2 rounded-t-lg text-sm font-medium transition',
                  activeTab === tab
                    ? 'bg-gold-400/10 text-gold-600 border-b-2 border-gold-400'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab === 'general' ? 'Général' : tab === 'restrictions' ? 'Restrictions' : 'Apparence'}
              </button>
            ))}
          </div>

          {/* Onglet Général */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={!form.categorie_id} onChange={() => setForm({ ...form, categorie_id: null })} className="text-gold-500" />
                  <span className="text-sm">Produit unique</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={!!form.categorie_id} onChange={() => setForm({ ...form, produit_id: null })} className="text-gold-500" />
                  <span className="text-sm">Catégorie entière</span>
                </label>
              </div>

              {!form.categorie_id ? (
                <div>
                  <label className="text-sm font-medium mb-1 block">Produit</label>
                  {form.produit_id ? (
                    <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border">
                      {produitResults.find(p => p.id === form.produit_id)?.images?.[0] ? (
                        <img src={produitResults.find(p => p.id === form.produit_id)?.images?.[0]} className="w-10 h-10 rounded-lg object-cover" />
                      ) : <Tag size={20} className="text-amber-500" />}
                      <div>
                        <span className="font-medium">{produitSearch}</span>
                        <p className="text-xs text-muted-foreground">{produitResults.find(p => p.id === form.produit_id)?.prix?.toLocaleString()} FC</p>
                      </div>
                      <button onClick={() => { setForm({ ...form, produit_id: null }); setProduitSearch('') }} className="ml-auto text-red-400"><X size={16} /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Rechercher un produit (nom, SKU)..."
                        value={produitSearch}
                        onChange={e => { setProduitSearch(e.target.value); setShowProduitSearch(true) }}
                        onFocus={() => setShowProduitSearch(true)}
                        leftIcon={<Search size={16} className="text-muted-foreground" />}
                      />
                      {showProduitSearch && produitResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                          {produitResults.map(prod => (
                            <button
                              key={prod.id}
                              onClick={() => selectProduit(prod)}
                              className="w-full text-left px-4 py-3 hover:bg-gold-400/10 flex items-center gap-3 transition-colors border-b border-border/50 last:border-0"
                            >
                              {prod.images?.[0] ? (
                                <img src={prod.images[0]} className="w-12 h-12 rounded-lg object-cover" />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                  <Tag size={18} className="text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{prod.nom}</p>
                                <p className="text-xs text-muted-foreground">{prod.prix?.toLocaleString()} FC</p>
                              </div>
                              <Plus size={16} className="text-gold-500 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium mb-1 block">Catégorie</label>
                  <select
                    value={form.categorie_id || ''}
                    onChange={e => setForm({ ...form, categorie_id: e.target.value || null })}
                    className="w-full border border-border rounded-xl bg-card px-3 py-2 text-sm"
                  >
                    <option value="">Sélectionner une catégorie</option>
                    <option value="cat1">Électronique</option>
                    <option value="cat2">Mode</option>
                    <option value="cat3">Maison</option>
                  </select>
                </div>
              )}

              {/* Type de promotion */}
              <div>
                <label className="text-sm font-medium mb-2 block">Type de promotion</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, type_promo: opt.value as any })}
                      className={cn(
                        'flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left',
                        form.type_promo === opt.value
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 shadow-sm'
                          : 'border-border hover:border-amber-400/50'
                      )}
                    >
                      <span className={cn(form.type_promo === opt.value ? 'text-amber-600' : 'text-muted-foreground')}>{opt.icon}</span>
                      <span className="text-sm font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Prix ou pourcentage */}
              <div className="grid grid-cols-2 gap-4">
                {form.type_promo !== 'cadeau' && form.type_promo !== 'lot_degressif' && (
                  <>
                    {form.type_promo === 'pourcentage' ? (
                      <Input
                        label="Réduction (%)"
                        type="number"
                        min="1"
                        max="99"
                        value={form.valeur_pourcentage}
                        onChange={e => setForm({ ...form, valeur_pourcentage: parseFloat(e.target.value) || 0 })}
                        leftIcon={<Percent size={16} className="text-muted-foreground" />}
                      />
                    ) : (
                      <Input
                        label={form.type_promo === 'flash' ? 'Prix flash (FC)' : 'Prix promotionnel (FC)'}
                        type="number"
                        min="0"
                        value={form.prix_promo}
                        onChange={e => setForm({ ...form, prix_promo: parseFloat(e.target.value) || 0 })}
                        leftIcon={<DollarSign size={16} className="text-muted-foreground" />}
                      />
                    )}
                    {form.produit_id && (
                      <div className="flex items-center justify-center p-3 bg-card rounded-xl border border-border">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Prix final</p>
                          <p className="text-2xl font-bold text-amber-600">
                            {form.type_promo === 'pourcentage'
                              ? Math.round((produitResults.find(p => p.id === form.produit_id)?.prix || 0) * (1 - form.valeur_pourcentage / 100))?.toLocaleString()
                              : form.prix_promo.toLocaleString()
                            } FC
                          </p>
                          {form.type_promo !== 'pourcentage' && (
                            <p className="text-xs line-through text-muted-foreground">
                              {produitResults.find(p => p.id === form.produit_id)?.prix?.toLocaleString()} FC
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {form.type_promo === 'lot_degressif' && (
                  <Input
                    label="Prix unitaire dégressif (FC)"
                    type="number"
                    value={form.prix_promo}
                    onChange={e => setForm({ ...form, prix_promo: parseFloat(e.target.value) || 0 })}
                  />
                )}

                {form.type_promo === 'cadeau' && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Produit offert</label>
                    <Input
                      placeholder="Rechercher le produit cadeau..."
                      value={form.produit_cadeau_id || ''}
                      onChange={e => setForm({ ...form, produit_cadeau_id: e.target.value || null })}
                    />
                  </div>
                )}
              </div>

              <Input
                label="Description (visible sur la fiche produit)"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Ex: Offre spéciale rentrée !"
              />

              <div className="grid grid-cols-2 gap-4">
                <Input label="Date de début" type="datetime-local" value={form.date_debut} onChange={e => setForm({ ...form, date_debut: e.target.value })} />
                <Input label="Date de fin" type="datetime-local" value={form.date_fin} onChange={e => setForm({ ...form, date_fin: e.target.value })} />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.actif} onChange={e => setForm({ ...form, actif: e.target.checked })} id="actif" />
                <label htmlFor="actif" className="text-sm">Activer immédiatement</label>
              </div>
            </div>
          )}

          {/* Onglet Restrictions */}
          {activeTab === 'restrictions' && (
            <div className="space-y-4">
              <Input
                label="Quantité minimum d'achat"
                type="number"
                min="1"
                value={form.quantite_min || 1}
                onChange={e => setForm({ ...form, quantite_min: parseInt(e.target.value) || 1 })}
              />
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.cumulable} onChange={e => setForm({ ...form, cumulable: e.target.checked })} id="cumulable" />
                <label htmlFor="cumulable" className="text-sm">Cumulable avec d'autres promotions</label>
              </div>
              {form.produit_id && form.actif && (
                <PromoConflictWarning produitId={form.produit_id} excludeId={editing?.id} />
              )}
            </div>
          )}

          {/* Onglet Apparence */}
          {activeTab === 'apparence' && (
            <div className="space-y-4">
              <Input
                label="URL de la bannière promotionnelle"
                placeholder="https://..."
                value={form.banniere_url || ''}
                onChange={e => setForm({ ...form, banniere_url: e.target.value || null })}
              />
              {form.banniere_url && (
                <div className="relative w-full h-24 rounded-xl overflow-hidden border border-border">
                  <img src={form.banniere_url} alt="Aperçu bannière" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          )}

          {/* Boutons d'action */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button variant="luxe" fullWidth onClick={handleSave} loading={saveMutation.isPending}>
              {editing ? 'Mettre à jour' : 'Créer la promotion'}
            </Button>
            <Button variant="outline" fullWidth onClick={() => { setCreating(false); setEditing(null) }}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal détail */}
      <Modal isOpen={!!detailPromo} onClose={() => setDetailPromo(null)} title={detailPromo?.produit_nom || 'Promotion'} size="md" accent="gold">
        {detailPromo && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Type :</span><Badge variant="neutral">{TYPE_OPTIONS.find(t => t.value === detailPromo.type_promo)?.label}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Prix promo :</span><span className="font-bold text-amber-600">{detailPromo.prix_promo?.toLocaleString()} FC</span></div>
            {detailPromo.valeur_pourcentage ? <div className="flex justify-between"><span className="text-muted-foreground">Réduction :</span><span>{detailPromo.valeur_pourcentage}%</span></div> : null}
            <div className="flex justify-between"><span className="text-muted-foreground">Période :</span><span>{format(parseISO(detailPromo.date_debut), 'Pp', { locale: fr })} → {format(parseISO(detailPromo.date_fin), 'Pp', { locale: fr })}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Statut :</span><Badge variant={detailPromo.actif ? 'accent' : 'danger'}>{detailPromo.actif ? 'Active' : 'Inactive'}</Badge></div>
            {detailPromo.description && <div><span className="text-muted-foreground">Description :</span><p className="mt-1">{detailPromo.description}</p></div>}
          </div>
        )}
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </Container>
  )
}