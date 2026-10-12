// app/admin/produits/page.tsx
'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import {
  PlusCircle,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Search,
  Loader2,
  Sparkles,
  TrendingUp,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Filter,
  Download,
  Copy,
  Check,
  X,
  AlertTriangle,
  RefreshCcw,
  Grid3X3,
  List,
  ArrowUpDown,
  DollarSign,
  Tag,
  ImageIcon,
  MoreVertical,
  RotateCcw,
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { useDebounce } from '@/hooks/useDebounce'
import { ProductBadges } from '@/components/badges/ProductBadges'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Product {
  id: string
  nom: string
  prix: number
  stock: number
  est_actif: boolean
  images?: string[]
  categorie?: string
  total_ventes?: number
  created_at?: string
  sku?: string
  badges?: string[]
}

interface ProductsResponse {
  data: Product[]
  pagination: {
    page: number
    totalPages: number
    total: number
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminProduitsPage() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()

  // États depuis l'URL
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [filter, setFilter] = useState<'all' | 'actif' | 'inactif'>(
    (searchParams.get('filter') as 'all' | 'actif' | 'inactif') || 'all'
  )
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pageSize, setPageSize] = useState(Number(searchParams.get('limit') || 10))
  const [sortColumn, setSortColumn] = useState(searchParams.get('sort') || 'created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    (searchParams.get('dir') as 'asc' | 'desc') || 'desc'
  )
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null)
  const [priceRange, setPriceRange] = useState({ min: '', max: '' })
  const [badgeSearch, setBadgeSearch] = useState('')

  // ---- Nouveaux états pour l'ajustement de prix ----
  const [adjustPriceModal, setAdjustPriceModal] = useState(false)
  const [pricePercent, setPricePercent] = useState('')
  const [previewPrices, setPreviewPrices] = useState<{ id: string; nom: string; ancienPrix: number; nouveauPrix: number }[]>([])
  const [lastAjustementId, setLastAjustementId] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  // Synchronisation URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filter !== 'all') params.set('filter', filter)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 10) params.set('limit', String(pageSize))
    if (sortColumn !== 'created_at') params.set('sort', sortColumn)
    if (sortDirection !== 'desc') params.set('dir', sortDirection)
    if (badgeSearch) params.set('badge', badgeSearch)
    router.replace(`/admin/produits?${params.toString()}`, { scroll: false })
  }, [debouncedSearch, filter, page, pageSize, sortColumn, sortDirection, badgeSearch, router])

  // Requête des produits
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<ProductsResponse>({
    queryKey: ['admin-products', debouncedSearch, filter, page, pageSize, sortColumn, sortDirection, badgeSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filter !== 'all') params.set('est_actif', filter === 'actif' ? 'true' : 'false')
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      params.set('sort_by', sortColumn)
      params.set('sort_order', sortDirection)
      if (priceRange.min) params.set('min_price', priceRange.min)
      if (priceRange.max) params.set('max_price', priceRange.max)
      if (badgeSearch) params.set('badge', badgeSearch)
      const res = await fetch(`/api/admin/produits?${params.toString()}`)
      if (!res.ok) throw new Error('Erreur chargement')
      return res.json()
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const products = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, totalPages: 1, total: 0 }

  // Mutation : toggle actif/inactif
  const toggleMutation = useMutation({
    mutationFn: async ({ id, actif }: { id: string; actif: boolean }) => {
      const res = await fetch(`/api/admin/produits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ est_actif: !actif }),
      })
      if (!res.ok) throw new Error('Erreur')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.addToast({ type: 'success', message: 'Statut mis à jour' })
    },
    onError: () => toast.addToast({ type: 'error', message: 'Erreur lors de la mise à jour' }),
  })

  // Mutation : supprimer
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/produits/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur suppression')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.addToast({ type: 'success', message: 'Produit supprimé' })
      setConfirmDeleteId(null)
    },
    onError: () => toast.addToast({ type: 'error', message: 'Erreur lors de la suppression' }),
  })

  // Mutation : duplication rapide
  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/produits/${id}/duplicate`, { method: 'POST' })
      if (!res.ok) throw new Error('Erreur duplication')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.addToast({ type: 'success', message: 'Produit dupliqué' })
    },
    onError: () => toast.addToast({ type: 'error', message: 'Erreur duplication' }),
  })

  // ---- Nouvelles mutations pour l'ajustement de prix ----
  const bulkPriceMutation = useMutation({
    mutationFn: async ({ ids, pourcentage }: { ids: string[]; pourcentage: number }) => {
      const res = await fetch('/api/admin/produits/bulk-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, pourcentage }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.addToast({ type: 'success', message: `${data.produits.length} prix mis à jour` })
      setAdjustPriceModal(false)
      setLastAjustementId(data.ajustementId)
      setSelectedIds(new Set())
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const undoPriceMutation = useMutation({
    mutationFn: async (ajustementId: string) => {
      const res = await fetch(`/api/admin/produits/bulk-price?ajustementId=${ajustementId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.addToast({ type: 'success', message: 'Ajustement annulé' })
      setLastAjustementId(null)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const handleToggle = (id: string, current: boolean) => {
    toggleMutation.mutate({ id, actif: current })
  }

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id)
  }

  const confirmDelete = () => {
    if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId)
  }

  // Sélection
  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(products.map(p => p.id)))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Actions groupées
  const bulkToggle = (activate: boolean) => {
    Array.from(selectedIds).forEach(id => {
      const product = products.find(p => p.id === id)
      if (product && product.est_actif !== activate) {
        toggleMutation.mutate({ id, actif: product.est_actif })
      }
    })
    setSelectedIds(new Set())
  }

  const bulkDelete = () => {
    if (selectedIds.size === 0) return
    if (confirm(`Supprimer ${selectedIds.size} produit(s) ?`)) {
      Array.from(selectedIds).forEach(id => deleteMutation.mutate(id))
      setSelectedIds(new Set())
    }
  }

  // ---- Prévisualisation de l'ajustement de prix ----
  const handlePreviewPrice = () => {
    const percent = parseFloat(pricePercent)
    if (isNaN(percent)) return
    const preview = products
      .filter(p => selectedIds.has(p.id))
      .map(p => ({
        id: p.id,
        nom: p.nom,
        ancienPrix: p.prix,
        nouveauPrix: Math.round(p.prix * (1 + percent / 100)),
      }))
    setPreviewPrices(preview)
  }

  // Export CSV
  const exportCSV = () => {
    if (products.length === 0) return
    const headers = ['ID', 'Nom', 'Prix (FC)', 'Stock', 'Actif', 'Catégorie', 'Ventes', 'SKU', 'Badges']
    const rows = products.map(p => [
      p.id,
      p.nom,
      p.prix,
      p.stock,
      p.est_actif ? 'Oui' : 'Non',
      p.categorie || '',
      p.total_ventes || 0,
      p.sku || '',
      (p.badges || []).join(', '),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `produits_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Tri
  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  // Pagination
  const totalPages = pagination.totalPages || 1

  // Stats rapides
  const stats = useMemo(() => ({
    total: products.length,
    actifs: products.filter(p => p.est_actif).length,
    inactifs: products.filter(p => !p.est_actif).length,
    valeurStock: products.reduce((acc, p) => acc + p.prix * (p.stock || 0), 0),
  }), [products])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-48 h-8" shimmer shimmerVariant="gold" />
          <Skeleton variant="rectangular" className="w-32 h-10 rounded-lg" shimmer shimmerVariant="gold" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" className="h-20 rounded-xl" shimmer shimmerVariant="gold" />
          ))}
        </div>
        <Skeleton variant="rectangular" className="w-full h-96 rounded-2xl" shimmer shimmerVariant="gold" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
        <p className="text-red-500 mb-4">{(error as Error)?.message || 'Impossible de charger les produits.'}</p>
        <Button variant="outline-gold" onClick={() => refetch()}>
          <RefreshCcw size={16} className="mr-2" /> Réessayer
        </Button>
      </div>
    )
  }

  return (
    <div>
      {/* En-tête */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">
            Produits
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {pagination.total} produit(s) dans le catalogue
          </p>
        </div>
        <div className="flex gap-2">
          <Tooltip content="Exporter en CSV">
            <Button variant="outline-gold" size="sm" onClick={exportCSV} leftIcon={<Download size={14} />}>
              Export
            </Button>
          </Tooltip>
          <Link href="/admin/produits/ajouter">
            <Button variant="luxe" size="md" leftIcon={<PlusCircle size={16} />}>
              Ajouter un produit
            </Button>
          </Link>
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: <Package size={20} className="text-gold-500" />, label: 'Total', value: stats.total },
          { icon: <Check size={20} className="text-green-500" />, label: 'Actifs', value: stats.actifs },
          { icon: <X size={20} className="text-red-500" />, label: 'Inactifs', value: stats.inactifs },
          { icon: <DollarSign size={20} className="text-blue-500" />, label: 'Valeur stock', value: `${stats.valeurStock.toLocaleString()} FC` },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white/50 dark:bg-midnight-800/40 backdrop-blur-sm rounded-xl p-4 border border-gold-400/10 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gold-400/10">{stat.icon}</div>
            <div>
              <p className="text-xs text-neutral-500">{stat.label}</p>
              <p className="font-bold text-neutral-900 dark:text-neutral-100">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recherche & filtres */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div className="flex flex-1 gap-3 items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
            <Input
              variant="glass"
              placeholder="Rechercher un produit..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-10"
              allowClear
              onClear={() => setSearch('')}
            />
          </div>
          {/* Filtre par badge */}
          <div className="relative flex-1 max-w-xs">
            <Input
              variant="glass"
              placeholder="Filtrer par badge..."
              value={badgeSearch}
              onChange={(e) => { setBadgeSearch(e.target.value); setPage(1) }}
              className="pl-10"
              size="sm"
              leftIcon={<Tag size={14} className="text-neutral-400" />}
              allowClear
              onClear={() => setBadgeSearch('')}
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'actif', 'inactif'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1) }}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition border',
                  filter === f
                    ? 'bg-gold-400/20 border-gold-400/50 text-gold-600 shadow-gold'
                    : 'bg-white dark:bg-midnight-800 border-gold-400/20 text-neutral-600 dark:text-neutral-300 hover:border-gold-400'
                )}
              >
                {f === 'all' ? 'Tous' : f === 'actif' ? 'Actifs' : 'Inactifs'}
              </button>
            ))}
          </div>
          {/* Filtre prix rapide */}
          <div className="flex items-center gap-2">
            <Input
              variant="glass"
              type="number"
              placeholder="Min FC"
              value={priceRange.min}
              onChange={e => { setPriceRange(prev => ({ ...prev, min: e.target.value })); setPage(1) }}
              className="w-24"
              size="sm"
            />
            <span className="text-neutral-400">–</span>
            <Input
              variant="glass"
              type="number"
              placeholder="Max FC"
              value={priceRange.max}
              onChange={e => { setPriceRange(prev => ({ ...prev, max: e.target.value })); setPage(1) }}
              className="w-24"
              size="sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">{selectedIds.size} sélectionné(s)</span>
              <Button variant="accent" size="sm" onClick={() => bulkToggle(true)}>Activer</Button>
              <Button variant="danger" size="sm" onClick={() => bulkToggle(false)}>Désactiver</Button>
              <Button variant="danger" size="sm" onClick={bulkDelete}>Supprimer</Button>
              {/* Nouveau bouton d'ajustement de prix */}
              <Button variant="gold" size="sm" onClick={() => { setAdjustPriceModal(true); setPricePercent(''); setPreviewPrices([]) }}>
                <DollarSign size={14} className="mr-1" /> Ajuster prix
              </Button>
            </div>
          )}
          <button
            onClick={() => setViewMode(viewMode === 'table' ? 'grid' : 'table')}
            className={cn('p-2 rounded-lg border transition', viewMode === 'grid' ? 'bg-gold-400/10 border-gold-400/30' : 'border-neutral-200 dark:border-neutral-700')}
          >
            {viewMode === 'table' ? <Grid3X3 size={16} /> : <List size={16} />}
          </button>
        </div>
      </div>

      {/* Liste vide */}
      {products.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-gold-400/20 bg-white/50 dark:bg-midnight-800/40 p-12 text-center"
        >
          <Package size={48} className="mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-500">
            {search || filter !== 'all' || badgeSearch
              ? 'Aucun produit ne correspond à ces critères.'
              : "Aucun produit pour le moment."}
          </p>
          {!search && filter === 'all' && !badgeSearch && (
            <Link
              href="/admin/produits/ajouter"
              className="mt-4 inline-flex items-center gap-1 text-gold-500 hover:underline"
            >
              <PlusCircle size={14} /> Créer le premier produit
            </Link>
          )}
        </motion.div>
      ) : viewMode === 'table' ? (
        /* --- Vue TABLE --- */
        <div className="overflow-x-auto rounded-2xl border border-gold-400/20 bg-white/50 dark:bg-midnight-800/40 backdrop-blur-sm">
          <table className="min-w-full divide-y divide-gold-400/10">
            <thead className="bg-neutral-50 dark:bg-midnight-900/50">
              <tr>
                {[
                  <th key="select" className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === products.length && products.length > 0}
                      onChange={toggleSelectAll}
                      className="text-gold-500 rounded"
                    />
                  </th>,
                  <th
                    key="nom"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 cursor-pointer hover:text-gold-500"
                    onClick={() => handleSort('nom')}
                  >
                    Nom {sortColumn === 'nom' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>,
                  <th key="image" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Image
                  </th>,
                  <th key="badges" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Badges
                  </th>,
                  <th
                    key="prix"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 cursor-pointer hover:text-gold-500"
                    onClick={() => handleSort('prix')}
                  >
                    Prix {sortColumn === 'prix' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>,
                  <th
                    key="stock"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 cursor-pointer hover:text-gold-500"
                    onClick={() => handleSort('stock')}
                  >
                    Stock {sortColumn === 'stock' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>,
                  <th key="ventes" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Ventes
                  </th>,
                  <th key="statut" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Statut
                  </th>,
                  <th key="actions" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Actions
                  </th>,
                ]}
              </tr>
            </thead>
            <tbody className="divide-y divide-gold-400/5">
              <AnimatePresence>
                {products.map((prod) => (
                  <motion.tr
                    key={prod.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="hover:bg-gold-400/5 transition-colors"
                  >
                    {[
                      <td key="checkbox" className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(prod.id)}
                          onChange={() => toggleSelectOne(prod.id)}
                          className="text-gold-500 rounded"
                        />
                      </td>,
                      <td key="nom" className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        <button
                          className="hover:text-gold-500 text-left"
                          onClick={() => setQuickViewProduct(prod)}
                        >
                          {prod.nom}
                        </button>
                        {prod.categorie && (
                          <p className="text-xs text-neutral-400">{prod.categorie}</p>
                        )}
                        {prod.sku && (
                          <p className="text-xs text-neutral-400">SKU: {prod.sku}</p>
                        )}
                      </td>,
                      <td key="image" className="px-6 py-4">
                        {prod.images?.[0] ? (
                          <img src={prod.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover border border-gold-400/20" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center">
                            <ImageIcon size={16} className="text-neutral-400" />
                          </div>
                        )}
                      </td>,
                      <td key="badges" className="px-6 py-4">
                        <ProductBadges badgeIds={prod.badges || []} size="sm" />
                      </td>,
                      <td key="prix" className="px-6 py-4 whitespace-nowrap text-sm text-gold-600 font-semibold">
                        {prod.prix.toLocaleString()} FC
                      </td>,
                      <td key="stock" className="px-6 py-4 whitespace-nowrap text-sm text-neutral-700 dark:text-neutral-300">
                        {prod.stock ?? 0}
                      </td>,
                      <td key="ventes" className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                        {prod.total_ventes ?? 0}
                      </td>,
                      <td key="statut" className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggle(prod.id, prod.est_actif)}
                          disabled={toggleMutation.isPending}
                        >
                          <Badge
                            variant={prod.est_actif ? 'accent' : 'danger'}
                            size="sm"
                          >
                            {prod.est_actif ? 'Actif' : 'Inactif'}
                          </Badge>
                        </button>
                      </td>,
                      <td key="actions" className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <Tooltip content="Aperçu rapide">
                            <button
                              onClick={() => setQuickViewProduct(prod)}
                              className="p-2 rounded-lg text-neutral-400 hover:text-gold-500 hover:bg-gold-400/10 transition"
                            >
                              <Eye size={16} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Modifier">
                            <Link
                              href={`/admin/produits/${prod.id}/modifier`}
                              className="p-2 rounded-lg text-neutral-400 hover:text-gold-500 hover:bg-gold-400/10 transition"
                            >
                              <Pencil size={16} />
                            </Link>
                          </Tooltip>
                          <Tooltip content="Dupliquer">
                            <button
                              onClick={() => duplicateMutation.mutate(prod.id)}
                              disabled={duplicateMutation.isPending}
                              className="p-2 rounded-lg text-neutral-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                            >
                              <Copy size={16} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Supprimer">
                            <button
                              onClick={() => handleDelete(prod.id)}
                              className="p-2 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                            >
                              {deleteMutation.isPending && deleteMutation.variables === prod.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </Tooltip>
                        </div>
                      </td>,
                    ]}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : (
        /* --- Vue GRID --- */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <AnimatePresence>
            {products.map(prod => (
              <motion.div
                key={prod.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white/50 dark:bg-midnight-800/40 rounded-2xl border border-gold-400/10 p-4 hover:shadow-card-hover transition group"
              >
                <div className="aspect-square bg-neutral-100 dark:bg-neutral-700 rounded-xl mb-3 overflow-hidden relative">
                  {prod.images?.[0] ? (
                    <img src={prod.images[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Package size={32} className="absolute inset-0 m-auto text-neutral-400" />
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setQuickViewProduct(prod)} className="p-1.5 bg-white/80 rounded-full"><Eye size={14} /></button>
                    <Link href={`/admin/produits/${prod.id}/modifier`} className="p-1.5 bg-white/80 rounded-full"><Pencil size={14} /></Link>
                  </div>
                  {prod.badges && prod.badges.length > 0 && (
                    <div className="absolute top-2 left-2">
                      <ProductBadges badgeIds={prod.badges} size="sm" />
                    </div>
                  )}
                </div>
                <h3 className="font-semibold text-sm truncate">{prod.nom}</h3>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-gold-600 font-bold">{prod.prix.toLocaleString()} FC</span>
                  <Badge variant={prod.est_actif ? 'accent' : 'danger'} size="sm">
                    {prod.est_actif ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-500 mt-2">
                  <span>Stock: {prod.stock ?? 0}</span>
                  <span>Ventes: {prod.total_ventes ?? 0}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline-gold" size="sm" fullWidth onClick={() => handleToggle(prod.id, prod.est_actif)}>
                    {prod.est_actif ? 'Désactiver' : 'Activer'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(prod.id)}>
                    <Trash2 size={14} className="text-red-500" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-1">
            <Button variant="outline-gold" size="icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft size={16} />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <div key={p}>
                  {idx > 0 && p - arr[idx - 1] > 1 && <span className="px-2 text-neutral-400">…</span>}
                  <Button
                    variant={p === page ? 'gold' : 'outline-gold'}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                </div>
              ))}
            <Button variant="outline-gold" size="icon" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight size={16} />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <span>Afficher</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="bg-card border border-border rounded-lg px-2 py-1 text-xs"
            >
              {[10, 25, 50].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Modal de confirmation suppression */}
      <Modal isOpen={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="Confirmer la suppression" size="sm" accent="danger">
        <div className="text-center space-y-4">
          <AlertTriangle size={48} className="mx-auto text-red-500" />
          <p className="text-neutral-700 dark:text-neutral-300">Cette action est irréversible. Êtes-vous sûr ?</p>
          <div className="flex gap-3 justify-center">
            <Button variant="danger" onClick={confirmDelete} loading={deleteMutation.isPending}>Supprimer</Button>
            <Button variant="outline-gold" onClick={() => setConfirmDeleteId(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal aperçu rapide */}
      <Modal isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} title={quickViewProduct?.nom || 'Détail produit'} size="md" accent="gold">
        {quickViewProduct && (
          <div className="space-y-4">
            {quickViewProduct.images?.[0] && (
              <img src={quickViewProduct.images[0]} alt="" className="w-full h-48 object-cover rounded-xl" />
            )}
            <ProductBadges badgeIds={quickViewProduct.badges || []} size="sm" />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-neutral-500">Prix :</span> <span className="font-bold text-gold-600">{quickViewProduct.prix.toLocaleString()} FC</span></div>
              <div><span className="text-neutral-500">Stock :</span> {quickViewProduct.stock ?? 0}</div>
              <div><span className="text-neutral-500">Statut :</span> <Badge variant={quickViewProduct.est_actif ? 'accent' : 'danger'} size="sm">{quickViewProduct.est_actif ? 'Actif' : 'Inactif'}</Badge></div>
              <div><span className="text-neutral-500">Ventes :</span> {quickViewProduct.total_ventes ?? 0}</div>
              {quickViewProduct.categorie && <div className="col-span-2"><span className="text-neutral-500">Catégorie :</span> {quickViewProduct.categorie}</div>}
              {quickViewProduct.sku && <div className="col-span-2"><span className="text-neutral-500">SKU :</span> {quickViewProduct.sku}</div>}
            </div>
            <div className="flex gap-2">
              <Link href={`/admin/produits/${quickViewProduct.id}/modifier`}>
                <Button variant="luxe" size="sm"><Pencil size={14} className="mr-1" /> Modifier</Button>
              </Link>
              <Button variant="outline-gold" size="sm" onClick={() => setQuickViewProduct(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal d'ajustement de prix */}
      <Modal isOpen={adjustPriceModal} onClose={() => { setAdjustPriceModal(false); setPreviewPrices([]) }} title="Ajuster les prix" size="md" accent="gold">
        <div className="space-y-4">
          <p className="text-sm">Appliquer un pourcentage à {selectedIds.size} produit(s) sélectionné(s).</p>
          <div className="flex gap-2 items-end">
            <Input
              type="number"
              label="Pourcentage (%)"
              value={pricePercent}
              onChange={e => setPricePercent(e.target.value)}
              placeholder="10 pour +10%, -20 pour -20%"
            />
            <Button variant="outline-gold" onClick={handlePreviewPrice}>Prévisualiser</Button>
          </div>
          {previewPrices.length > 0 && (
            <div className="max-h-60 overflow-y-auto border rounded-lg p-2 space-y-1">
              {previewPrices.map(p => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="truncate">{p.nom}</span>
                  <span className="line-through text-muted-foreground mr-2">{p.ancienPrix.toLocaleString()} FC</span>
                  <span className="font-bold text-gold-600">{p.nouveauPrix.toLocaleString()} FC</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <Button
              variant="luxe"
              fullWidth
              onClick={() => bulkPriceMutation.mutate({ ids: Array.from(selectedIds), pourcentage: parseFloat(pricePercent) })}
              loading={bulkPriceMutation.isPending}
              disabled={!pricePercent || isNaN(parseFloat(pricePercent))}
            >
              Appliquer
            </Button>
            <Button variant="outline" fullWidth onClick={() => { setAdjustPriceModal(false); setPreviewPrices([]) }}>Annuler</Button>
          </div>
          {lastAjustementId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => undoPriceMutation.mutate(lastAjustementId)}
              loading={undoPriceMutation.isPending}
              className="text-red-500 w-full"
            >
              <RotateCcw size={14} className="mr-1" /> Annuler le dernier ajustement
            </Button>
          )}
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}