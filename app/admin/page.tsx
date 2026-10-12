// app/admin/page.tsx
'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Users, ShoppingBag, CreditCard, TrendingUp,
  AlertCircle, BarChart3, DollarSign, Sparkles, ShieldCheck,
  Package, Truck, Wallet, Gift, Star, Activity, Clock,
  RefreshCcw, ArrowUp, ArrowDown, Download, Eye, ExternalLink,
  Search, Filter, ChevronRight, TrendingDown, PieChart, Zap,
  Calendar, Bell, MessageSquare, BadgeCheck, UserPlus,
  Layers, Image, FileText, Hash, MousePointerClick, Percent,
  Timer, Radio, ThumbsUp, ThumbsDown, AlertTriangle, Info,
  Settings, Sliders, Maximize2, Minimize2, RotateCw,
  BarChart2, PieChart as PieChartIcon, LineChart as LineChartIcon,
  List, Grid, MoreHorizontal, X, Check, HelpCircle,
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Cell, ResponsiveContainer,
  LineChart, Line, PieChart as RechartsPieChart, Pie, Legend, Area, AreaChart,
  ComposedChart
} from 'recharts'
import InsightsWidget from '@/components/admin/InsightsWidget'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Stats {
  totalUsers: number
  totalVendeurs: number
  totalCommandes: number
  totalVentes: number
  retraitsEnAttente: number
  litigesOuverts: number
  soldeEscrow: number
  commandesDuJour?: number
  ventesDuJour?: number
  nouveauxUtilisateurs?: number
  tauxConversion?: number
  panierMoyen?: number
  commandesEnAttente?: number
  produitsActifs?: number
  produitsTotal?: number
  rupturesStock?: number
}

interface CommandesStats {
  parStatut: { name: string; value: number }[]
  evolution: { date: string; montant: number; commandes: number }[]
}

interface RecentOrder {
  id: string
  numero: string
  client: string
  montant: number
  statut: string
  date: string
}

interface TopProduct {
  id: string
  nom: string
  ventes: number
  vues: number
  prix: number
}

interface TopCategory {
  name: string
  ventes: number
  produits: number
}

interface RecentUser {
  id: string
  email: string
  date_inscription: string
}

interface SystemStatus {
  lastBackup: string
  diskSpace: number
  activeConnections: number
  uptime: string
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const CHART_COLORS = ['#4766f7', '#18c78a', '#f6cf2a', '#8b5cf6', '#e37d32', '#ef4444', '#ec4899', '#10b981', '#6366f1', '#f59e0b']
const PERIOD_OPTIONS = ['7j', '30j', '90j', '1an'] as const
type Period = typeof PERIOD_OPTIONS[number]

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function AdminDashboardPage() {
  const [period, setPeriod] = useState<Period>('30j')
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [topCategories, setTopCategories] = useState<TopCategory[]>([])
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Récupération des stats principales
  const {
    data: stats,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Stats>({
    queryKey: ['admin-stats', period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/stats?period=${period}`)
      if (!res.ok) throw new Error('Erreur chargement stats')
      return res.json()
    },
    staleTime: 30_000,
  })

  // Récupération des stats commandes (graphiques)
  const { data: commandesStats } = useQuery<CommandesStats>({
    queryKey: ['admin-commandes-stats', period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/stats/commandes?period=${period}`)
      if (!res.ok) throw new Error('Erreur')
      return res.json()
    },
    staleTime: 60_000,
  })

  // Dernières commandes
  useEffect(() => {
    fetch('/api/admin/commandes?limit=5&sort=created_at&order=desc')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setRecentOrders(data.slice(0, 5))
        else if (data.data) setRecentOrders(data.data.slice(0, 5))
      })
      .catch(() => {})
  }, [])

  // Top produits
  useEffect(() => {
    fetch('/api/admin/stats/top-products')
      .then(res => res.json())
      .then(data => setTopProducts(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // Top catégories
  useEffect(() => {
    fetch('/api/admin/stats/top-categories')
      .then(res => res.json())
      .then(data => setTopCategories(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // Utilisateurs récents
  useEffect(() => {
    fetch('/api/admin/utilisateurs?limit=5&sort=created_at&order=desc')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setRecentUsers(data.slice(0, 5))
        else if (data.data) setRecentUsers(data.data.slice(0, 5))
      })
      .catch(() => {})
  }, [])

  // Statut système
  useEffect(() => {
    fetch('/api/admin/stats/system')
      .then(res => res.json())
      .then(data => setSystemStatus(data))
      .catch(() => {})
  }, [])

  // Auto‑refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => refetch(), 30_000)
    return () => clearInterval(interval)
  }, [autoRefresh, refetch])

  // Sécurise l'objet stats
  const safeStats: Stats = {
    totalUsers: stats?.totalUsers ?? 0,
    totalVendeurs: stats?.totalVendeurs ?? 0,
    totalCommandes: stats?.totalCommandes ?? 0,
    totalVentes: stats?.totalVentes ?? 0,
    retraitsEnAttente: stats?.retraitsEnAttente ?? 0,
    litigesOuverts: stats?.litigesOuverts ?? 0,
    soldeEscrow: stats?.soldeEscrow ?? 0,
    commandesDuJour: stats?.commandesDuJour ?? 0,
    ventesDuJour: stats?.ventesDuJour ?? 0,
    nouveauxUtilisateurs: stats?.nouveauxUtilisateurs ?? 0,
    tauxConversion: stats?.tauxConversion ?? 0,
    panierMoyen: stats?.panierMoyen ?? 0,
    commandesEnAttente: stats?.commandesEnAttente ?? 0,
    produitsActifs: stats?.produitsActifs ?? 0,
    produitsTotal: stats?.produitsTotal ?? 0,
    rupturesStock: stats?.rupturesStock ?? 0,
  }

  // Indicateurs principaux (KPIs)
  const mainKpis = [
    { label: 'Utilisateurs', value: safeStats.totalUsers, icon: <Users size={24} className="text-brand-600 dark:text-brand-400" />, bg: 'bg-brand-100 dark:bg-brand-900/20', link: '/admin/utilisateurs', color: 'brand', trend: '+12%', trendUp: true },
    { label: 'Ventes totales', value: `${safeStats.totalVentes.toLocaleString()} FC`, icon: <DollarSign size={24} className="text-warm-600 dark:text-warm-400" />, bg: 'bg-warm-100 dark:bg-warm-900/20', link: '/admin/commandes', color: 'warm', trend: '+8%', trendUp: true },
    { label: 'Commandes', value: safeStats.totalCommandes, icon: <ShoppingBag size={24} className="text-accent-600 dark:text-accent-400" />, bg: 'bg-accent-100 dark:bg-accent-900/20', link: '/admin/commandes', color: 'accent', trend: '-3%', trendUp: false },
    { label: 'Trésorerie', value: `${safeStats.soldeEscrow.toLocaleString()} FC`, icon: <ShieldCheck size={24} className="text-gold-600 dark:text-gold-400" />, bg: 'bg-gold-100 dark:bg-gold-900/20', link: '/admin/wallet', color: 'gold', trend: '+15%', trendUp: true },
  ]

  // KPIs secondaires
  const secondaryKpis = [
    { label: 'Aujourd\'hui', value: safeStats.commandesDuJour, sous: 'commandes', icon: <Zap size={16} className="text-blue-500" /> },
    { label: 'Ventes jour', value: `${safeStats.ventesDuJour.toLocaleString()} FC`, icon: <DollarSign size={16} className="text-green-500" /> },
    { label: 'Nouveaux', value: safeStats.nouveauxUtilisateurs, sous: 'utilisateurs', icon: <UserPlus size={16} className="text-purple-500" /> },
    { label: 'Conversion', value: `${safeStats.tauxConversion.toFixed(1)}%`, icon: <TrendingUp size={16} className="text-amber-500" /> },
    { label: 'Panier moyen', value: `${safeStats.panierMoyen.toLocaleString()} FC`, icon: <Hash size={16} className="text-cyan-500" /> },
    { label: 'En attente', value: safeStats.commandesEnAttente, sous: 'commandes', icon: <Timer size={16} className="text-orange-500" /> },
    { label: 'Produits actifs', value: `${safeStats.produitsActifs}/${safeStats.produitsTotal}`, icon: <Layers size={16} className="text-indigo-500" /> },
    { label: 'Ruptures stock', value: safeStats.rupturesStock, icon: <AlertTriangle size={16} className="text-red-500" /> },
  ]

  // Données graphiques
  const barData = commandesStats?.parStatut ?? []
  const evolutionData = commandesStats?.evolution ?? []
  const pieData = topCategories.length > 0 ? topCategories.map(c => ({ name: c.name, value: c.ventes })) : []

  const statutVariant = (s: string): 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' => {
    const m: Record<string, any> = {
      en_attente: 'warm', payee: 'gold', collecte: 'neutral',
      en_livraison: 'warm', livree: 'accent', annulee: 'danger',
    }
    return m[s] || 'neutral'
  }

  // Filtrage recherche rapide
  const filteredOrders = recentOrders.filter(o =>
    o.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.numero?.includes(searchTerm)
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="xl" variant="premium" label="Chargement du tableau de bord..." />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <AlertCircle size={48} className="text-red-500" />
        <p className="text-red-500">{(error as Error)?.message || 'Erreur chargement'}</p>
        <Button variant="outline-gold" onClick={() => refetch()}>Réessayer</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />

      <Container className="py-8 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En-tête */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">
                Tableau de bord administrateur
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                Supervision complète de la marketplace Gercie
              </p>
            </div>
            <div className="flex gap-3 items-center">
              {/* Période */}
              <div className="flex items-center gap-1 bg-card rounded-full border border-border p-0.5">
                {PERIOD_OPTIONS.map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-full transition',
                      period === p
                        ? 'bg-gold-400 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {/* Auto‑refresh */}
              <Tooltip content="Actualisation auto (30s)">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={cn('p-2 rounded-lg border transition', autoRefresh ? 'bg-green-100 border-green-400 text-green-600' : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  <RotateCw size={16} className={autoRefresh ? 'animate-spin' : ''} />
                </button>
              </Tooltip>
              <Button variant="outline-gold" size="sm" onClick={() => refetch()} leftIcon={<RefreshCcw size={16} />}>
                Actualiser
              </Button>
              <Link href="/admin/commandes">
                <Button variant="luxe" size="sm" leftIcon={<ShoppingBag size={16} />}>
                  Voir les commandes
                </Button>
              </Link>
            </div>
          </div>

          {/* KPIs principaux */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {mainKpis.map((kpi, idx) => (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Link href={kpi.link} className="block">
                  <Card variant="glass" className="border-gold-400/20 shadow-soft hover:shadow-gold transition-all hover:-translate-y-1">
                    <CardContent className="p-5">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{kpi.label}</p>
                          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{kpi.value}</p>
                          <span className={cn('text-xs flex items-center gap-1', kpi.trendUp ? 'text-green-500' : 'text-red-500')}>
                            {kpi.trendUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                            {kpi.trend} ce mois
                          </span>
                        </div>
                        <div className={cn('p-3 rounded-full', kpi.bg)}>
                          {kpi.icon}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* KPIs secondaires */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {secondaryKpis.map((kpi, idx) => (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + idx * 0.03 }}
                className="bg-card rounded-xl p-4 border border-border flex items-center gap-3"
              >
                <div className="p-2 rounded-lg bg-muted">{kpi.icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="font-bold text-foreground">{kpi.value}</p>
                  {kpi.sous && <p className="text-xs text-muted-foreground">{kpi.sous}</p>}
                </div>
              </motion.div>
            ))}
          </div>

          {/* ========== NOUVEAU : Widget Insights IA ========== */}
          <div className="mb-8">
            <InsightsWidget />
          </div>

          {/* Graphiques */}
          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            {/* Commandes par statut */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <PieChartIcon size={18} className="text-gold-500" />
                  Répartition des commandes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        {CHART_COLORS.map((color, idx) => (
                          <linearGradient key={idx} id={`adminBarGrad_${idx}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.3} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.15)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        cursor={{ fill: 'rgba(201,169,98,0.08)' }}
                        contentStyle={{
                          backgroundColor: 'rgba(255,255,255,0.9)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(201,169,98,0.3)',
                          borderRadius: '16px',
                        }}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} animationBegin={200} animationDuration={1500}>
                        {barData.map((_, idx) => (
                          <Cell key={idx} fill={`url(#adminBarGrad_${idx % CHART_COLORS.length})`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">Aucune donnée</div>
                )}
              </CardContent>
            </Card>

            {/* Évolution des ventes */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <TrendingUp size={18} className="text-gold-500" />
                  Évolution des ventes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {evolutionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={evolutionData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4766f7" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#4766f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.15)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255,255,255,0.9)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(201,169,98,0.3)',
                          borderRadius: '16px',
                        }}
                      />
                      <Line type="monotone" dataKey="montant" stroke="#4766f7" strokeWidth={3} dot={false} fill="url(#salesGrad)" name="Ventes (FC)" />
                      <Line type="monotone" dataKey="commandes" stroke="#f6cf2a" strokeWidth={2} dot={false} name="Commandes" />
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">Aucune donnée</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Deuxième rangée de graphiques */}
          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            {/* Camembert des catégories */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <PieChartIcon size={18} className="text-gold-500" />
                  Ventes par catégorie
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={50}
                        paddingAngle={5}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {pieData.map((_, idx) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255,255,255,0.9)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(201,169,98,0.3)',
                          borderRadius: '16px',
                        }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">Aucune donnée</div>
                )}
              </CardContent>
            </Card>

            {/* Top 10 produits */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <BarChart2 size={18} className="text-gold-500" />
                  Top 10 produits – ventes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topProducts.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {topProducts.slice(0, 10).map((p, idx) => (
                      <div key={p.id} className="flex items-center gap-3 text-sm">
                        <span className={cn('w-6 text-center font-bold', idx < 3 ? 'text-gold-500' : 'text-muted-foreground')}>
                          {idx + 1}
                        </span>
                        <span className="flex-1 truncate">{p.nom}</span>
                        <span className="font-semibold text-gold-600">{p.ventes} vendus</span>
                        <span className="text-xs text-muted-foreground">{p.prix.toLocaleString()} FC</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">Aucune donnée</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Dernières commandes + Top catégories + Utilisateurs récents */}
          <div className="grid lg:grid-cols-3 gap-8 mb-8">
            {/* Dernières commandes */}
            <Card variant="glass" className="lg:col-span-2 border-gold-400/20 shadow-soft">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <Clock size={18} className="text-gold-500" />
                  Dernières commandes
                </CardTitle>
                <Link href="/admin/commandes" className="text-sm text-gold-500 hover:underline flex items-center gap-1">
                  Tout voir <ChevronRight size={14} />
                </Link>
              </CardHeader>
              <CardContent>
                {filteredOrders.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Aucune commande récente.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredOrders.map((order, idx) => (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center justify-between p-3 rounded-xl bg-neutral-100 dark:bg-midnight-800/40 hover:bg-gold-400/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center text-gold-600 font-bold text-sm">
                            #{order.numero?.slice(-3)}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">{order.client}</p>
                            <p className="text-xs text-neutral-400">{new Date(order.date).toLocaleDateString('fr-FR')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-gold-600">{(order.montant ?? 0).toLocaleString()} FC</span>
                          <Badge variant={statutVariant(order.statut)} size="sm">{order.statut}</Badge>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Colonne droite : alertes + liens rapides + système */}
            <div className="space-y-6">
              {/* Alertes retraits */}
              {safeStats.retraitsEnAttente > 0 && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                  <Card className="border-l-4 border-l-gold-400 bg-gold-50 dark:bg-gold-900/20 shadow-soft">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white dark:bg-midnight-800 shadow-sm">
                          <CreditCard size={20} className="text-gold-600 dark:text-gold-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gold-800 dark:text-gold-300">
                            {safeStats.retraitsEnAttente} demande{safeStats.retraitsEnAttente > 1 ? 's' : ''} de retrait
                          </p>
                          <p className="text-sm text-gold-600 dark:text-gold-400">Validation requise</p>
                        </div>
                        <Link href="/admin/retraits">
                          <Button variant="luxe" size="sm">Traiter</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Alertes litiges */}
              {safeStats.litigesOuverts > 0 && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
                  <Card className="border-l-4 border-l-red-400 bg-red-50 dark:bg-red-900/20 shadow-soft">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white dark:bg-midnight-800 shadow-sm">
                          <AlertCircle size={20} className="text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-red-800 dark:text-red-300">
                            {safeStats.litigesOuverts} litige{safeStats.litigesOuverts > 1 ? 's' : ''} ouvert{safeStats.litigesOuverts > 1 ? 's' : ''}
                          </p>
                          <p className="text-sm text-red-600 dark:text-red-400">Action requise</p>
                        </div>
                        <Link href="/admin/litiges">
                          <Button variant="danger" size="sm">Résoudre</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Ruptures de stock */}
              {safeStats.rupturesStock > 0 && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                  <Card className="border-l-4 border-l-orange-400 bg-orange-50 dark:bg-orange-900/20 shadow-soft">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white dark:bg-midnight-800 shadow-sm">
                          <Package size={20} className="text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-orange-800 dark:text-orange-300">
                            {safeStats.rupturesStock} rupture{safeStats.rupturesStock > 1 ? 's' : ''} de stock
                          </p>
                          <p className="text-sm text-orange-600 dark:text-orange-400">Réapprovisionnement conseillé</p>
                        </div>
                        <Link href="/admin/produits">
                          <Button variant="outline-gold" size="sm">Voir</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Top catégories (mini) */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Layers size={16} /> Top catégories
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {topCategories.slice(0, 4).map((cat, idx) => (
                    <div key={cat.name} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{cat.name}</span>
                      <span className="font-semibold">{cat.ventes} ventes</span>
                    </div>
                  ))}
                  {topCategories.length === 0 && (
                    <p className="text-xs text-muted-foreground">Aucune donnée</p>
                  )}
                </CardContent>
              </Card>

              {/* Accès rapides */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Accès rapides</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {[
                    { href: '/admin/produits/ajouter', label: 'Ajouter un produit', icon: <Package size={16} /> },
                    { href: '/admin/produits', label: 'Gérer les produits', icon: <Layers size={16} /> },
                    { href: '/admin/utilisateurs', label: 'Gérer les utilisateurs', icon: <Users size={16} /> },
                    { href: '/admin/livreurs', label: 'Gérer les livreurs', icon: <Truck size={16} /> },
                    { href: '/admin/codes', label: 'Codes promo', icon: <Gift size={16} /> },
                    { href: '/admin/settings', label: 'Paramètres', icon: <Settings size={16} /> },
                  ].map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gold-400/5 transition-colors"
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      <ChevronRight size={14} className="ml-auto text-muted-foreground" />
                    </Link>
                  ))}
                </CardContent>
              </Card>

              {/* Statut système */}
              {systemStatus && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Activity size={16} /> Statut système
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dernière sauvegarde</span>
                      <span>{systemStatus.lastBackup}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Espace disque</span>
                      <span>{systemStatus.diskSpace}% libre</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Connexions</span>
                      <span>{systemStatus.activeConnections}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Uptime</span>
                      <span>{systemStatus.uptime}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Derniers utilisateurs + Top produits vus */}
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Derniers utilisateurs inscrits */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <UserPlus size={18} className="text-gold-500" />
                  Derniers utilisateurs inscrits
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentUsers.length > 0 ? (
                  <div className="space-y-3">
                    {recentUsers.map((u, idx) => (
                      <div key={u.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{u.email}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(u.date_inscription).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">Aucune donnée</div>
                )}
              </CardContent>
            </Card>

            {/* Top produits vus (si différent) */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <Eye size={18} className="text-gold-500" />
                  Produits les plus consultés
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topProducts.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {topProducts.sort((a, b) => (b.vues ?? 0) - (a.vues ?? 0)).slice(0, 5).map((p, idx) => (
                      <div key={p.id} className="flex items-center gap-3 text-sm">
                        <span className={cn('w-6 text-center font-bold', idx < 3 ? 'text-gold-500' : 'text-muted-foreground')}>
                          {idx + 1}
                        </span>
                        <span className="flex-1 truncate">{p.nom}</span>
                        <span className="text-xs text-muted-foreground">{p.vues} vues</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">Aucune donnée</div>
                )}
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </Container>
    </div>
  )
}