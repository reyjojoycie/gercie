// app/admin/wallet/page.tsx
'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
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
import {
  Wallet, TrendingUp, TrendingDown, RefreshCcw, Download,
  Search, Filter, ChevronLeft, ChevronRight, DollarSign,
  ArrowUpDown, History, ArrowRightLeft, ArrowUp, ArrowDown,
  ShoppingBag, Zap, Gift, Banknote, CreditCard, Smartphone,
  Users, Clock, CheckCircle2, AlertTriangle, X, Eye, Info,
  BarChart3, PieChart, Calendar, FileText, Copy, Layers,
  MoreHorizontal, Sliders, RotateCw, List, Grid,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid,
  ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend,
  LineChart, Line, Area, AreaChart
} from 'recharts'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Transaction {
  id: string
  type: 'recharge' | 'achat' | 'retrait' | 'transfert' | 'vente' | 'remboursement' | 'escrow_in' | 'escrow_out' | 'commission'
  montant: number
  description: string
  created_at: string
  method?: string
  phone?: string
  status?: 'pending' | 'approved' | 'rejected'
  portefeuille_type?: string
  user?: { id: string; nom: string; prenom: string; email: string }
}

interface WalletData {
  solde_achat: number
  solde_vente: number
  total_recharges: number
  total_achats: number
  total_ventes: number
  last_updated: string
}

interface StatsPeriode {
  entrees: number
  sorties: number
  net: number
}

/* ------------------------------------------------------------------ */
/*  Constantes & Helpers                                                */
/* ------------------------------------------------------------------ */

const typeLabels: Record<string, string> = {
  recharge: 'Recharge', achat: 'Achat', retrait: 'Retrait',
  transfert: 'Transfert', vente: 'Vente', remboursement: 'Remboursement',
  escrow_in: 'Séquestre in', escrow_out: 'Séquestre out', commission: 'Commission',
}

const typeIcons: Record<string, React.ReactNode> = {
  recharge: <Wallet size={16} />, achat: <ShoppingBag size={16} />,
  retrait: <ArrowUp size={16} />, transfert: <ArrowRightLeft size={16} />,
  vente: <ArrowDown size={16} />, remboursement: <RefreshCcw size={16} />,
  escrow_in: <ArrowDown size={16} />, escrow_out: <ArrowUp size={16} />,
  commission: <DollarSign size={16} />,
}

const COLORS = ['#4766f7', '#18c78a', '#f6cf2a', '#8b5cf6', '#e37d32', '#ef4444', '#ec4899', '#10b981', '#6366f1', '#f59e0b']

function exportToCSV(transactions: Transaction[]) {
  const headers = ['ID', 'Type', 'Description', 'Montant (FC)', 'Date', 'Méthode', 'Statut', 'Utilisateur']
  const rows = transactions.map(tx => [
    tx.id, typeLabels[tx.type] || tx.type, tx.description, tx.montant,
    new Date(tx.created_at).toISOString(), tx.method || '', tx.status || 'approved',
    tx.user ? `${tx.user.prenom} ${tx.user.nom}` : '',
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `transactions_admin_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminWalletPage() {
  const { user, loading: authLoading, isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const { rate } = useExchangeRate()
  const toast = useToast()

  // États
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('30d')
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ action: string; ids: string[] } | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

  // ---- Wallet Data ----
  const { data: wallet, isLoading: walletLoading, error: walletError, refetch: refetchWallet } = useQuery<WalletData>({
    queryKey: ['admin-wallet'],
    queryFn: async () => {
      const res = await fetch('/api/admin/wallet')
      if (!res.ok) throw new Error('Erreur chargement wallet')
      return res.json()
    },
    enabled: !!user && isAdmin,
    staleTime: 30_000,
  })

  // ---- Transactions ----
  const { data: txData, isLoading: txLoading, error: txError, refetch: refetchTx } = useQuery<{ data: Transaction[], total: number, stats?: StatsPeriode }>({
    queryKey: ['admin-transactions', search, typeFilter, statusFilter, page, pageSize, period],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      params.set('period', period)
      const res = await fetch(`/api/admin/transactions?${params.toString()}`)
      if (!res.ok) throw new Error('Erreur chargement transactions')
      return res.json()
    },
    enabled: !!user && isAdmin,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  // ---- Statistiques graphiques (indépendantes) ----
  const { data: chartData } = useQuery<{ parType: { name: string; value: number }[]; evolution: { date: string; montant: number }[] }>({
    queryKey: ['admin-wallet-charts', period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/transactions/stats?period=${period}`)
      if (!res.ok) return { parType: [], evolution: [] }
      return res.json()
    },
    enabled: !!user && isAdmin,
    staleTime: 60_000,
  })

  const transactions = txData?.data ?? []
  const totalTx = txData?.total ?? 0
  const totalPages = Math.ceil(totalTx / pageSize)

  // Ajustement manuel
  const handleAdjust = async () => {
    const amount = parseInt(adjustAmount)
    if (isNaN(amount) || amount === 0) {
      toast.addToast({ type: 'error', message: 'Montant invalide' })
      return
    }
    setAdjusting(true)
    try {
      const res = await fetch('/api/admin/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant: amount, raison: adjustReason || 'Ajustement manuel' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.addToast({ type: 'success', message: `Ajustement de ${amount.toLocaleString()} FC effectué` })
      setShowAdjustModal(false)
      setAdjustAmount('')
      setAdjustReason('')
      queryClient.invalidateQueries({ queryKey: ['admin-wallet'] })
      queryClient.invalidateQueries({ queryKey: ['admin-transactions'] })
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setAdjusting(false)
    }
  }

  // Actions groupées (approuver/rejeter)
  const handleBulkAction = async () => {
    if (!confirmAction) return
    const { action, ids } = confirmAction
    try {
      const res = await fetch('/api/admin/transactions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.addToast({ type: 'success', message: `${ids.length} transaction(s) mises à jour` })
      queryClient.invalidateQueries({ queryKey: ['admin-transactions'] })
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setConfirmAction(null)
    }
  }

  const pendingRetraits = transactions.filter(t => t.type === 'retrait' && t.status === 'pending')

  if (authLoading || walletLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="xl" variant="premium" label="Chargement du portefeuille..." />
      </div>
    )
  }

  if (!user || !isAdmin) return null

  if (walletError) {
    return (
      <Container className="py-8">
        <div className="text-center p-12 rounded-2xl border border-gold-400/20 bg-card">
          <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-red-500 mb-4">Impossible de charger le solde du portefeuille central.</p>
          <Button variant="outline-gold" onClick={() => refetchWallet()}>
            <RefreshCcw size={16} className="mr-2" /> Réessayer
          </Button>
        </div>
      </Container>
    )
  }

  const soldeAchat = wallet?.solde_achat ?? 0
  const soldeVente = wallet?.solde_vente ?? 0
  const soldeAchatUSD = rate ? soldeAchat / rate : null
  const soldeVenteUSD = rate ? soldeVente / rate : null

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En-tête */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground font-serif flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gold-100 dark:bg-gold-900/30 text-gold-600 dark:text-gold-400">
                  <Wallet size={24} />
                </div>
                Portefeuille central
              </h1>
              <p className="text-muted-foreground mt-1">
                Dernière mise à jour : {wallet?.last_updated ? new Date(wallet.last_updated).toLocaleString() : '—'}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline-gold" size="sm" onClick={() => { refetchWallet(); refetchTx() }}>
                <RefreshCcw size={16} className="mr-1" /> Actualiser
              </Button>
              <Button variant="luxe" size="sm" onClick={() => setShowAdjustModal(true)}>
                <DollarSign size={16} className="mr-1" /> Ajuster le solde
              </Button>
              <Tooltip content="Exporter les transactions filtrées">
                <Button variant="outline-gold" size="sm" onClick={() => exportToCSV(transactions)} leftIcon={<Download size={14} />}>
                  CSV
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* Cartes de soldes */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-gold-500 to-gold-700 text-midnight-950 border-0 shadow-gold">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gold-900/80 text-sm font-medium">Solde achat (central)</p>
                    <p className="text-4xl font-bold mt-2">{soldeAchat.toLocaleString()} FC</p>
                    {soldeAchatUSD && <p className="text-midnight-800/70 text-sm mt-1">≈ {soldeAchatUSD.toFixed(2)} USD</p>}
                  </div>
                  <div className="bg-white/20 p-3 rounded-full backdrop-blur-sm">
                    <Wallet size={28} />
                  </div>
                </div>
                <div className="mt-4 text-sm text-midnight-900/70">
                  Total recharges : {wallet?.total_recharges?.toLocaleString() || 0} FC
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-luxury-600 to-luxury-800 text-white border-0 shadow-glow-luxury">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-luxury-100 text-sm">Solde vente (central)</p>
                    <p className="text-4xl font-bold mt-2">{soldeVente.toLocaleString()} FC</p>
                    {soldeVenteUSD && <p className="text-luxury-200 text-sm mt-1">≈ {soldeVenteUSD.toFixed(2)} USD</p>}
                  </div>
                  <div className="bg-white/20 p-3 rounded-full backdrop-blur-sm">
                    <TrendingUp size={28} />
                  </div>
                </div>
                <div className="mt-4 text-sm text-luxury-100/80">
                  Total ventes : {wallet?.total_ventes?.toLocaleString() || 0} FC
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { icon: <ArrowUp size={20} className="text-green-500" />, label: 'Entrées période', value: `+${txData?.stats?.entrees?.toLocaleString() || 0} FC` },
              { icon: <ArrowDown size={20} className="text-red-500" />, label: 'Sorties période', value: `-${txData?.stats?.sorties?.toLocaleString() || 0} FC` },
              { icon: <Users size={20} className="text-blue-500" />, label: 'Transactions', value: totalTx },
              { icon: <RefreshCcw size={20} className="text-amber-500" />, label: 'Taux USD', value: rate ? `${rate.toLocaleString()} FC` : '...' },
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

          {/* Graphiques */}
          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><PieChart size={18} className="text-gold-500" />Répartition par type</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData?.parType?.length ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <RechartsPieChart>
                      <Pie data={chartData.parType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {chartData.parType.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                      </Pie>
                      <Legend />
                      <RechartsTooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : <p className="text-center py-8 text-muted-foreground">Aucune donnée</p>}
              </CardContent>
            </Card>

            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart3 size={18} className="text-gold-500" />Évolution des flux</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData?.evolution?.length ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={chartData.evolution}>
                      <defs>
                        <linearGradient id="colorMontant" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4766f7" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#4766f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.15)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Area type="monotone" dataKey="montant" stroke="#4766f7" fill="url(#colorMontant)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <p className="text-center py-8 text-muted-foreground">Aucune donnée</p>}
              </CardContent>
            </Card>
          </div>

          {/* Transactions */}
          <Card variant="glass" className="border-gold-400/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History size={20} className="text-gold-500" />Historique des transactions</CardTitle>
              <CardDescription>Toutes les transactions de la plateforme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Barre d'outils */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 flex flex-col sm:flex-row gap-2">
                  <Input
                    leftIcon={<Search size={16} className="text-muted-foreground" />}
                    placeholder="Rechercher..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    allowClear onClear={() => setSearch('')}
                    variant="glass" size="sm"
                  />
                  <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }} className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs">
                    <option value="all">Tous types</option>
                    {Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs">
                    <option value="all">Tous statuts</option>
                    <option value="pending">En attente</option>
                    <option value="approved">Approuvé</option>
                    <option value="rejected">Rejeté</option>
                  </select>
                  <select value={period} onChange={e => { setPeriod(e.target.value as any); setPage(1) }} className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs">
                    <option value="7d">7 jours</option>
                    <option value="30d">30 jours</option>
                    <option value="all">Tout</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-gold-500">
                    {viewMode === 'table' ? <Grid size={16} /> : <List size={16} />}
                  </button>
                  {pendingRetraits.length > 0 && (
                    <div className="flex gap-1">
                      <Button variant="accent" size="sm" onClick={() => setConfirmAction({ action: 'approve', ids: pendingRetraits.map(t => t.id) })}>
                        <CheckCircle2 size={14} className="mr-1" /> Approuver tous les retraits
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Table ou cartes */}
              {txLoading && transactions.length === 0 ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="text" className="h-12" shimmer shimmerVariant="gold" />)}
                </div>
              ) : txError ? (
                <div className="text-center py-8">
                  <AlertTriangle size={32} className="mx-auto text-red-500 mb-2" />
                  <p className="text-muted-foreground">Erreur lors du chargement</p>
                  <Button variant="danger" size="sm" onClick={() => refetchTx()} className="mt-2"><RefreshCcw size={14} className="mr-1" /> Réessayer</Button>
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History size={48} className="mx-auto mb-4 text-neutral-300" />
                  <p>Aucune transaction trouvée.</p>
                </div>
              ) : viewMode === 'table' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border">
                      <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                        <th className="px-3 py-3">Type</th>
                        <th className="px-3 py-3">Description</th>
                        <th className="px-3 py-3">Montant</th>
                        <th className="px-3 py-3">Date</th>
                        <th className="px-3 py-3">Utilisateur</th>
                        <th className="px-3 py-3">Statut</th>
                        <th className="px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <AnimatePresence>
                        {transactions.map(tx => (
                          <motion.tr key={tx.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="hover:bg-gold-400/5">
                            <td className="px-3 py-3">
                              <Badge variant={tx.montant > 0 ? 'accent' : 'danger'} size="sm">
                                <span className="flex items-center gap-1">{typeIcons[tx.type]} {typeLabels[tx.type] || tx.type}</span>
                              </Badge>
                            </td>
                            <td className="px-3 py-3 max-w-[200px] truncate">{tx.description}</td>
                            <td className="px-3 py-3 font-mono font-semibold">{tx.montant.toLocaleString()} FC</td>
                            <td className="px-3 py-3 text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</td>
                            <td className="px-3 py-3 text-xs">{tx.user ? `${tx.user.prenom} ${tx.user.nom}` : '—'}</td>
                            <td className="px-3 py-3">
                              {tx.status === 'pending' ? <Badge variant="warm" size="sm"><Clock size={12} className="mr-1" /> En attente</Badge>
                              : tx.status === 'rejected' ? <Badge variant="danger" size="sm"><X size={12} className="mr-1" /> Refusée</Badge>
                              : <Badge variant="accent" size="sm"><CheckCircle2 size={12} className="mr-1" /> Approuvée</Badge>}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex gap-1">
                                <Tooltip content="Détails">
                                  <button onClick={() => setSelectedTx(tx)} className="p-1 rounded text-muted-foreground hover:text-gold-500"><Eye size={14} /></button>
                                </Tooltip>
                                {tx.status === 'pending' && (
                                  <>
                                    <Tooltip content="Approuver">
                                      <button onClick={() => setConfirmAction({ action: 'approve', ids: [tx.id] })} className="p-1 rounded text-green-500 hover:bg-green-50"><CheckCircle2 size={14} /></button>
                                    </Tooltip>
                                    <Tooltip content="Rejeter">
                                      <button onClick={() => setConfirmAction({ action: 'reject', ids: [tx.id] })} className="p-1 rounded text-red-500 hover:bg-red-50"><X size={14} /></button>
                                    </Tooltip>
                                  </>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {transactions.map(tx => (
                    <Card key={tx.id} className="p-4 border-border hover:shadow-soft transition cursor-pointer" onClick={() => setSelectedTx(tx)}>
                      <div className="flex justify-between items-start">
                        <Badge variant={tx.montant > 0 ? 'accent' : 'danger'} size="sm">{typeLabels[tx.type]}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="font-semibold mt-2">{tx.montant.toLocaleString()} FC</p>
                      <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                    </Card>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{totalTx} transactions</span>
                    <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }} className="text-xs border border-border rounded-lg px-2 py-1 bg-card">
                      {[10, 25, 50].map(s => <option key={s} value={s}>{s}/page</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline-gold" size="icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft size={16} /></Button>
                    <span className="text-sm px-3">{page} / {totalPages}</span>
                    <Button variant="outline-gold" size="icon" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight size={16} /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </Container>

      {/* Modal ajustement */}
      <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Ajuster le solde central" size="sm" accent="gold">
        <div className="space-y-4">
          <Input type="number" placeholder="Montant (positif ou négatif)" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} variant="glass" />
          <Input placeholder="Raison (optionnelle)" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} variant="glass" />
          <div className="flex gap-3">
            <Button variant="luxe" onClick={handleAdjust} loading={adjusting}>Valider</Button>
            <Button variant="outline-gold" onClick={() => setShowAdjustModal(false)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal détail transaction */}
      <Modal isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} title="Détail de la transaction" size="md" accent="gold">
        {selectedTx && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">ID</span><span className="font-mono text-xs">{selectedTx.id}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><Badge variant="accent">{typeLabels[selectedTx.type]}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Montant</span><span className="font-bold">{selectedTx.montant.toLocaleString()} FC</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{new Date(selectedTx.created_at).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Utilisateur</span><span>{selectedTx.user ? `${selectedTx.user.prenom} ${selectedTx.user.nom} (${selectedTx.user.email})` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Statut</span><Badge variant={selectedTx.status === 'approved' ? 'accent' : selectedTx.status === 'pending' ? 'warm' : 'danger'}>{selectedTx.status}</Badge></div>
            {selectedTx.method && <div className="flex justify-between"><span className="text-muted-foreground">Méthode</span><span>{selectedTx.method}</span></div>}
          </div>
        )}
      </Modal>

      {/* Modal confirmation action groupée */}
      <Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)} title="Confirmer l'action" size="sm" accent="gold">
        <p className="mb-4">Voulez-vous vraiment {confirmAction?.action === 'approve' ? 'approuver' : 'rejeter'} {confirmAction?.ids.length} transaction(s) ?</p>
        <div className="flex gap-3">
          <Button variant={confirmAction?.action === 'approve' ? 'accent' : 'danger'} onClick={handleBulkAction}>Confirmer</Button>
          <Button variant="outline-gold" onClick={() => setConfirmAction(null)}>Annuler</Button>
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}