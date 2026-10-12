// app/dashboard/livreur/historique/page.tsx
'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useInfiniteQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  ArrowLeft, Package, MapPin, Calendar, Search, Filter, X,
  Eye, Truck, CheckCircle, XCircle, Loader2, Clock,
  Sparkles, History, RefreshCw, ArrowUpDown, ChevronDown,
  Download, Copy, Check, ExternalLink, BarChart3,
  TrendingUp, DollarSign, Activity, Star, Zap
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Validation Zod pour les filtres                                    */
/* ------------------------------------------------------------------ */
const filtersSchema = z.object({
  statut: z.string().optional(),
  search: z.string().optional(),
  date_debut: z.string().optional(),
  date_fin: z.string().optional(),
  sort_by: z.enum(['date', 'total', 'statut']).optional().default('date'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
})

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Livraison {
  id: string
  commande_id: string
  numero_commande: string
  total: number
  type_livraison: string
  adresse: string
  point_retrait_nom: string | null
  commune: string
  statut: string
  date_acceptation: string | null
  date_recuperation: string | null
  date_livraison: string | null
  photo_colis: string | null
  photo_livraison: string | null
  client?: { nom: string; prenom: string }
}

interface LivraisonPage {
  data: Livraison[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

/* ------------------------------------------------------------------ */
/*  Configuration statuts                                              */
/* ------------------------------------------------------------------ */
const statutConfig: Record<string, { variant: 'accent' | 'danger' | 'warm' | 'neutral' | 'gold'; label: string; icon: React.ReactNode }> = {
  livree:          { variant: 'accent', label: 'Livrée', icon: <CheckCircle size={12} /> },
  annulee:         { variant: 'danger', label: 'Annulée', icon: <XCircle size={12} /> },
  acceptee:        { variant: 'warm', label: 'Acceptée', icon: <Clock size={12} /> },
  colis_recupere:  { variant: 'gold', label: 'Colis récupéré', icon: <Truck size={12} /> },
}

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return 'Date inconnue'
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const formatRelativeDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return null
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `Il y a ${days} j`
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function LivreurHistoriquePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const toast = useToast()

  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    statut: '',
    search: '',
    date_debut: '',
    date_fin: '',
    sort_by: 'date' as 'date' | 'total' | 'statut',
    sort_order: 'desc' as 'asc' | 'desc',
  })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [detailModal, setDetailModal] = useState<Livraison | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  /* ---------- React Query : pagination infinie ---------- */
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useInfiniteQuery<LivraisonPage>({
    queryKey: ['livreur-historique', filters],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      if (filters.statut) params.append('statut', filters.statut)
      if (filters.search) params.append('search', filters.search)
      if (filters.date_debut) params.append('date_debut', filters.date_debut)
      if (filters.date_fin) params.append('date_fin', filters.date_fin)
      params.append('sort_by', filters.sort_by)
      params.append('sort_order', filters.sort_order)
      params.append('page', String(pageParam))
      params.append('limit', '10')
      const res = await fetch(`/api/livreur/historique?${params.toString()}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      return res.json()
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination
      return page < totalPages ? page + 1 : undefined
    },
    enabled: !!user,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  const livraisons = useMemo(() => data?.pages.flatMap(p => p.data) ?? [], [data])
  const totalLivraisons = data?.pages[0]?.pagination?.total ?? 0

  // Stats rapides
  const stats = useMemo(() => {
    const livrees = livraisons.filter(l => l.statut === 'livree').length
    const annulees = livraisons.filter(l => l.statut === 'annulee').length
    const totalGains = livraisons.filter(l => l.statut === 'livree').reduce((sum, l) => sum + l.total, 0)
    return { livrees, annulees, totalGains }
  }, [livraisons])

  const resetFilters = useCallback(() => {
    setFilters({ statut: '', search: '', date_debut: '', date_fin: '', sort_by: 'date', sort_order: 'desc' })
    setShowFilters(false)
  }, [])

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(text)
    toast.addToast({ type: 'success', message: 'Copié !' })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const exportCSV = () => {
    if (livraisons.length === 0) return
    const headers = ['Commande', 'Statut', 'Type', 'Adresse', 'Total (FC)', 'Date']
    const rows = livraisons.map(l => [
      l.numero_commande,
      statutConfig[l.statut]?.label || l.statut,
      l.type_livraison,
      l.adresse,
      l.total,
      formatDate(l.date_livraison || l.date_acceptation),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `historique_livraisons_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center">
        <Spinner size="xl" variant="premium" label="Chargement..." />
      </div>
    )
  }
  if (!user) return null

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/70 dark:bg-midnight-900/70 border-b border-gold-400/20 shadow-soft">
        <Container className="py-4 flex items-center gap-4">
          <Link href="/dashboard/livreur" className="p-2 rounded-xl hover:bg-gold-400/10 text-neutral-400 hover:text-gold-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">Historique des courses</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{totalLivraisons} course(s) au total</p>
          </div>
          <div className="flex gap-2">
            <Tooltip content="Exporter CSV">
              <Button variant="outline-gold" size="sm" onClick={exportCSV} leftIcon={<Download size={14} />}>Export</Button>
            </Tooltip>
            <Button variant="outline-gold" size="sm" onClick={() => refetch()} leftIcon={<RefreshCw size={14} />}>Actualiser</Button>
            <Button variant={showFilters ? 'luxe' : 'outline-gold'} size="sm" onClick={() => setShowFilters(!showFilters)} leftIcon={<Filter size={16} />}>Filtres</Button>
          </div>
        </Container>
      </div>

      {/* Mini stats */}
      <Container className="py-4 relative z-10">
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: 'Livrées', value: stats.livrees, icon: <CheckCircle size={20} className="text-green-500" /> },
            { label: 'Annulées', value: stats.annulees, icon: <XCircle size={20} className="text-red-500" /> },
            { label: 'Gains', value: `${stats.totalGains.toLocaleString()} FC`, icon: <DollarSign size={20} className="text-gold-500" /> },
          ].map((s, i) => (
            <Card key={i} variant="glass" className="border-gold-400/20"><CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">{s.icon}</div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="font-bold text-foreground text-sm">{s.value}</p></div>
            </CardContent></Card>
          ))}
        </div>
      </Container>

      {/* Panneau filtres */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white/80 dark:bg-midnight-800/80 backdrop-blur-md border-b border-gold-400/20">
            <Container className="py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Statut</label>
                  <select value={filters.statut} onChange={e => setFilters({ ...filters, statut: e.target.value })}
                    className="w-full border border-gold-400/30 rounded-xl p-2 text-sm bg-white/50 dark:bg-midnight-700/50 backdrop-blur-sm">
                    <option value="">Tous</option>
                    {Object.entries(statutConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Tri</label>
                  <select value={`${filters.sort_by}-${filters.sort_order}`}
                    onChange={e => {
                      const [sort_by, sort_order] = e.target.value.split('-') as ['date' | 'total' | 'statut', 'asc' | 'desc']
                      setFilters({ ...filters, sort_by, sort_order })
                    }}
                    className="w-full border border-gold-400/30 rounded-xl p-2 text-sm bg-white/50 dark:bg-midnight-700/50 backdrop-blur-sm">
                    <option value="date-desc">Plus récentes</option>
                    <option value="date-asc">Plus anciennes</option>
                    <option value="total-desc">Montant ↓</option>
                    <option value="total-asc">Montant ↑</option>
                  </select>
                </div>
                <div><label className="block text-xs font-medium mb-1">Date début</label><Input variant="glass" type="date" value={filters.date_debut} onChange={e => setFilters({ ...filters, date_debut: e.target.value })} /></div>
                <div><label className="block text-xs font-medium mb-1">Date fin</label><Input variant="glass" type="date" value={filters.date_fin} onChange={e => setFilters({ ...filters, date_fin: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between mt-4">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                  <Input variant="glass" placeholder="N° commande" value={filters.search}
                    onChange={e => setFilters({ ...filters, search: e.target.value })} className="pl-9" />
                </div>
                {hasActiveFilters && <Button variant="ghost" size="sm" onClick={resetFilters} leftIcon={<X size={14} />}>Effacer</Button>}
              </div>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Liste */}
      <Container className="py-8 max-w-5xl relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-midnight-800/40 rounded-2xl p-5 shadow-card border border-gold-400/10">
                  <div className="flex justify-between mb-3"><Skeleton variant="text" className="w-48 h-6" shimmer shimmerVariant="gold" /><Skeleton variant="rounded" className="w-24 h-6 rounded-full" shimmer shimmerVariant="gold" /></div>
                  <Skeleton variant="text" className="w-2/3 h-4 mb-2" shimmer shimmerVariant="gold" />
                  <div className="flex justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700"><Skeleton variant="text" className="w-32 h-6" shimmer shimmerVariant="gold" /><Skeleton variant="rounded" className="w-24 h-8 rounded-xl" shimmer shimmerVariant="gold" /></div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="text-center py-12"><p className="text-red-500">{(error as Error)?.message || 'Erreur'}</p><Button variant="outline-gold" onClick={() => refetch()} className="mt-4">Réessayer</Button></div>
          ) : livraisons.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="text-center py-12 bg-white/50 dark:bg-midnight-800/40 backdrop-blur rounded-2xl border border-gold-400/20">
              <Package size={48} className="mx-auto text-neutral-300 dark:text-neutral-600 mb-4" />
              <p className="text-neutral-500 dark:text-neutral-400">Aucune course trouvée.</p>
              {hasActiveFilters && <Button variant="outline-gold" size="sm" onClick={resetFilters} className="mt-3">Réinitialiser les filtres</Button>}
            </motion.div>
          ) : (
            <>
              <div className="space-y-4">
                {livraisons.map((liv, idx) => {
                  const config = statutConfig[liv.statut] || { variant: 'neutral' as const, label: liv.statut, icon: undefined }
                  const isExpanded = expandedCards.has(liv.id)
                  const displayDate = liv.date_livraison || liv.date_acceptation
                  return (
                    <motion.div key={liv.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }} whileHover={{ y: -2 }}>
                      <Card className="overflow-hidden border-gold-400/10 hover:shadow-gold transition-shadow bg-white/70 dark:bg-midnight-800/60 backdrop-blur-sm">
                        <CardContent className="p-5">
                          <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-neutral-900 dark:text-neutral-100 text-lg">Commande #{liv.numero_commande}</p>
                                <button onClick={() => copyToClipboard(liv.numero_commande)} className="text-neutral-400 hover:text-gold-500">
                                  {copiedId === liv.numero_commande ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                </button>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500 mt-1">
                                <span className="flex items-center gap-1"><Calendar size={14} />{formatDate(displayDate)}</span>
                                <span className="flex items-center gap-1"><MapPin size={14} />{liv.commune}</span>
                                <span className="flex items-center gap-1"><Truck size={14} />{liv.type_livraison === 'domicile' ? 'Domicile' : 'Point retrait'}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={config.variant} size="sm" className="flex items-center gap-1">{config.icon}{config.label}</Badge>
                              <button onClick={() => toggleExpand(liv.id)} className="text-neutral-400 hover:text-gold-500">
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronDown size={18} className="rotate-180" />}
                              </button>
                            </div>
                          </div>
                          <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">{liv.adresse}</div>
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="pt-3 border-t border-gold-400/10 text-sm space-y-2">
                                  {liv.client && <p><span className="text-muted-foreground">Client :</span> {liv.client.prenom} {liv.client.nom}</p>}
                                  <p className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Date acceptation :</span> {formatDate(liv.date_acceptation)}
                                    <span className="text-xs">({formatRelativeDate(liv.date_acceptation)})</span>
                                  </p>
                                  {liv.date_livraison && <p><span className="text-muted-foreground">Date livraison :</span> {formatDate(liv.date_livraison)}</p>}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <div className="flex justify-between items-center pt-3 border-t border-gold-400/10">
                            <span className="text-xl font-bold text-gold-600">{liv.total.toLocaleString()} FC</span>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setDetailModal(liv)} leftIcon={<Eye size={14} />}>Détails</Button>
                              <Link href={`/dashboard/livreur/courses/${liv.commande_id}`}>
                                <Button variant="outline-gold" size="sm" rightIcon={<ExternalLink size={14} />}>Voir</Button>
                              </Link>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </div>
              {hasNextPage && (
                <div className="flex justify-center mt-6">
                  <Button variant="outline-gold" onClick={() => fetchNextPage()} loading={isFetchingNextPage} size="sm">Afficher plus</Button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </Container>

      {/* Modal détail rapide */}
      <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title="Détail de la livraison" size="md" accent="gold">
        {detailModal && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div><span className="text-muted-foreground">Commande</span><p className="font-bold">#{detailModal.numero_commande}</p></div>
              <div><span className="text-muted-foreground">Statut</span><Badge variant={statutConfig[detailModal.statut]?.variant || 'neutral'} size="sm">{statutConfig[detailModal.statut]?.label || detailModal.statut}</Badge></div>
              <div><span className="text-muted-foreground">Type</span><p>{detailModal.type_livraison === 'domicile' ? 'Domicile' : 'Point retrait'}</p></div>
              <div><span className="text-muted-foreground">Total</span><p className="font-bold text-gold-600">{detailModal.total.toLocaleString()} FC</p></div>
              <div className="col-span-2"><span className="text-muted-foreground">Adresse</span><p>{detailModal.adresse}</p></div>
              <div><span className="text-muted-foreground">Acceptée le</span><p>{formatDate(detailModal.date_acceptation)}</p></div>
              {detailModal.date_livraison && <div><span className="text-muted-foreground">Livrée le</span><p>{formatDate(detailModal.date_livraison)}</p></div>}
            </div>
            <div className="flex gap-2 pt-4">
              <Link href={`/dashboard/livreur/courses/${detailModal.commande_id}`}><Button variant="luxe" size="sm">Voir la course</Button></Link>
              <Button variant="outline" size="sm" onClick={() => setDetailModal(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}