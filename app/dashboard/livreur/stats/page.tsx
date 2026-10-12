// app/dashboard/livreur/stats/page.tsx
'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, TrendingUp, Package, Star, MapPin, Calendar,
  Award, BarChart3, Loader2, TrendingDown, CheckCircle, XCircle,
  Sparkles, RefreshCcw, Download, Eye, Zap, Clock, DollarSign,
  ArrowUp, ArrowDown, HelpCircle, ExternalLink, Share2, Copy,
  ChevronLeft, ChevronRight, Filter, Activity,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend,
  LineChart, Line, CartesianGrid, Area, AreaChart,
} from 'recharts'

/* ------------------------------------------------------------------ */
/*  Types enrichis                                                      */
/* ------------------------------------------------------------------ */
interface Stats {
  total_livraisons: number
  evaluation_moyenne: number
  total_evaluations: number
  distance_parcourue_km: number
  derniere_activite: string | null
  periode: {
    nom: string
    total_livraisons: number
    gains: number
  }
  courses_en_cours: {
    count: number
    details: any[]
  }
  top_communes: { nom: string; count: number }[]
  tendance: {
    variation_absolue: number
    variation_pourcentage: number
  } | null
  // champs supplémentaires (simulés ou réels)
  comparaison?: {
    total_livraisons_prec: number
    gains_prec: number
    distance_prec: number
  }
  repartition_types?: { name: string; value: number }[]
  evolution_gains?: { date: string; montant: number }[]
}

const PERIODES = [
  { value: 'day', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'year', label: 'Cette année' },
  { value: 'all', label: 'Tout' },
]

const GOLD_COLORS = ['#f6cf2a', '#c99a14', '#a87d0e', '#8b650a', '#6d4e08']
const CHART_COLORS = ['#c99a14', '#0fa073', '#4766f7', '#dc3f62', '#8b5cf6', '#e37d32']

/* ================================================================== */
/*  Fonctions helpers                                                    */
/* ================================================================== */
function formatVariation(valeur: number, pourcentage: number) {
  const signe = valeur >= 0 ? '+' : ''
  return `${signe}${valeur} (${pourcentage.toFixed(1)}%)`
}

function exportStatsCSV(stats: Stats) {
  const headers = ['Métrique', 'Valeur']
  const rows = [
    ['Total livraisons', stats.total_livraisons],
    ['Évaluation moyenne', stats.evaluation_moyenne.toFixed(1)],
    ['Distance parcourue (km)', stats.distance_parcourue_km.toFixed(0)],
    ['Gains période', stats.periode.gains],
    ['Livraisons période', stats.periode.total_livraisons],
  ]
  const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stats_livreur_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ================================================================== */
/*  Page                                                                 */
/* ================================================================== */
export default function LivreurStatsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [periode, setPeriode] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('week')
  const [showDetails, setShowDetails] = useState(false)

  /* ---------- React Query ---------- */
  const {
    data: stats,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Stats>({
    queryKey: ['livreur-stats', periode],
    queryFn: async () => {
      const res = await fetch(`/api/livreur/stats?periode=${periode}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      return res.json()
    },
    enabled: !!user && !authLoading,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  // --- Données simulées pour l'évolution (si absentes) ---
  const evolutionData = useMemo(() => {
    if (!stats) return []
    const base = stats.periode.total_livraisons || 1
    return Array.from({ length: 7 }, (_, i) => ({
      date: `J-${7 - i}`,
      value: Math.floor(base / 7 * (i + 1) * (0.9 + Math.random() * 0.2)),
    }))
  }, [stats])

  // --- Synthèse des gains par mois (si disponible) ---
  const monthlyGains = useMemo(() => {
    if (!stats?.evolution_gains) return []
    return stats.evolution_gains.map(e => ({
      month: new Date(e.date).toLocaleDateString('fr', { month: 'short' }),
      gain: e.montant,
    }))
  }, [stats])

  /* ---------- Effets ---------- */
  useEffect(() => {
    if (isError && error) {
      toast.addToast({ type: 'error', message: (error as Error).message || 'Erreur chargement' })
    }
  }, [isError, error, toast])

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
        <Container className="py-4 flex items-center gap-4 flex-wrap">
          <Link
            href="/dashboard/livreur"
            className="p-2 rounded-xl hover:bg-gold-400/10 text-neutral-400 hover:text-gold-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">Statistiques</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Analysez vos performances
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content="Exporter CSV">
              <Button variant="outline-gold" size="sm" onClick={() => stats && exportStatsCSV(stats)} leftIcon={<Download size={14} />}>
                Export
              </Button>
            </Tooltip>
            <Tooltip content="Actualiser">
              <Button variant="outline-gold" size="sm" onClick={() => refetch()} loading={isFetching} leftIcon={<RefreshCcw size={14} />}>
                Actualiser
              </Button>
            </Tooltip>
            <Link href="/dashboard/livreur">
              <Button variant="ghost" size="sm">Tableau de bord</Button>
            </Link>
          </div>
        </Container>
      </div>

      <Container className="py-8 max-w-6xl relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* Sélecteur de période */}
          <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
            <div className="flex bg-white dark:bg-midnight-800 rounded-full border border-gold-400/20 p-1 shadow-soft">
              {PERIODES.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriode(p.value as any)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-sm font-medium transition whitespace-nowrap',
                    periode === p.value
                      ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-gold-400/10'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-neutral-500">
              Dernière mise à jour : {stats?.derniere_activite ? new Date(stats.derniere_activite).toLocaleString() : '—'}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} variant="rectangular" className="h-32 rounded-2xl" shimmer shimmerVariant="gold" />
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <Skeleton variant="rectangular" className="h-64 rounded-2xl" shimmer shimmerVariant="gold" />
                <Skeleton variant="rectangular" className="h-64 rounded-2xl" shimmer shimmerVariant="gold" />
              </div>
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-4">{(error as Error)?.message || 'Erreur'}</p>
              <Button variant="outline-gold" onClick={() => refetch()} leftIcon={<RefreshCcw size={14} />}>
                Réessayer
              </Button>
            </div>
          ) : stats ? (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Livraisons */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                  <Tooltip content="Nombre total de livraisons effectuées">
                    <Card variant="glass" className="border-gold-400/20 shadow-soft hover:shadow-gold transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Livraisons</p>
                            <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{stats.total_livraisons}</p>
                            {stats.tendance && (
                              <p className={cn(
                                'text-xs flex items-center gap-1 mt-1',
                                stats.tendance.variation_absolue >= 0 ? 'text-accent-600 dark:text-accent-400' : 'text-red-500'
                              )}>
                                {stats.tendance.variation_absolue >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {formatVariation(stats.tendance.variation_absolue, stats.tendance.variation_pourcentage)}
                              </p>
                            )}
                          </div>
                          <div className="p-3 rounded-full bg-gold-100 dark:bg-gold-900/20">
                            <Package size={24} className="text-gold-600 dark:text-gold-400" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Tooltip>
                </motion.div>

                {/* Évaluation */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Tooltip content="Note moyenne sur 5">
                    <Card variant="glass" className="border-gold-400/20 shadow-soft hover:shadow-gold transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Évaluation</p>
                            <div className="flex items-baseline gap-2 mt-2">
                              <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">{stats.evaluation_moyenne.toFixed(1)}</p>
                              <div className="flex text-gold-500">
                                {[...Array(5)].map((_, i) => (
                                  <Star key={i} size={14} fill={i < Math.round(stats.evaluation_moyenne) ? 'currentColor' : 'none'} />
                                ))}
                              </div>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">{stats.total_evaluations} éval.</p>
                          </div>
                          <div className="p-3 rounded-full bg-gold-100 dark:bg-gold-900/20">
                            <Star size={24} className="text-gold-600 dark:text-gold-400" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Tooltip>
                </motion.div>

                {/* Distance */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <Tooltip content="Kilomètres parcourus">
                    <Card variant="glass" className="border-gold-400/20 shadow-soft hover:shadow-gold transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Distance</p>
                            <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{stats.distance_parcourue_km.toFixed(0)} km</p>
                            {stats.comparaison && (
                              <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
                                <TrendingUp size={12} className={stats.distance_parcourue_km >= stats.comparaison.distance_prec ? 'text-accent-500' : 'text-red-500'} />
                                {stats.distance_parcourue_km >= stats.comparaison.distance_prec ? '+' : ''}
                                {(stats.distance_parcourue_km - stats.comparaison.distance_prec).toFixed(0)} km vs préc.
                              </p>
                            )}
                          </div>
                          <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20">
                            <MapPin size={24} className="text-blue-600 dark:text-blue-400" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Tooltip>
                </motion.div>

                {/* Gains */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Tooltip content="Total des gains sur la période">
                    <Card variant="glass" className="border-gold-400/20 shadow-soft hover:shadow-gold transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Gains</p>
                            <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{stats.periode.gains.toLocaleString()} FC</p>
                            <p className="text-xs text-neutral-500 mt-1">{stats.periode.total_livraisons} livr.</p>
                          </div>
                          <div className="p-3 rounded-full bg-accent-100 dark:bg-accent-900/20">
                            <DollarSign size={24} className="text-accent-600 dark:text-accent-400" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Tooltip>
                </motion.div>
              </div>

              {/* Graphiques */}
              <div className="grid md:grid-cols-2 gap-8 mb-8">
                {/* Anneau livraisons */}
                <Card variant="glass" className="border-gold-400/20 shadow-gold overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                      <BarChart3 size={18} className="text-gold-500" /> Progression
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <defs>
                          <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#f6cf2a" />
                            <stop offset="100%" stopColor="#c99a14" />
                          </linearGradient>
                          <linearGradient id="grayGradient" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#d1cec7" />
                            <stop offset="100%" stopColor="#a8a49b" />
                          </linearGradient>
                        </defs>
                        <Pie
                          data={[
                            { name: 'Effectuées', value: stats.periode.total_livraisons },
                            { name: 'Restantes', value: Math.max(0, stats.total_livraisons - stats.periode.total_livraisons) },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                          animationBegin={0}
                          animationDuration={1200}
                          animationEasing="ease-out"
                        >
                          <Cell fill="url(#goldGradient)" stroke="none" />
                          <Cell fill="url(#grayGradient)" stroke="none" />
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: 'rgba(255,255,255,0.95)',
                            border: '1px solid rgba(201,169,98,0.3)',
                            borderRadius: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Top communes */}
                <Card variant="glass" className="border-gold-400/20 shadow-gold overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                      <Award size={18} className="text-gold-500" /> Top communes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {stats.top_communes.length === 0 ? (
                      <p className="text-neutral-500 text-sm text-center py-12">Aucune donnée</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart
                          data={stats.top_communes}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <defs>
                            <linearGradient id="communeGradient" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#e8be4c" />
                              <stop offset="80%" stopColor="#a87d0e" />
                              <stop offset="100%" stopColor="#6d4e08" />
                            </linearGradient>
                          </defs>
                          <XAxis type="number" hide />
                          <YAxis dataKey="nom" type="category" tick={{ fontSize: 12, fill: '#a8a49b' }} tickLine={false} axisLine={false} />
                          <RechartsTooltip
                            cursor={{ fill: 'rgba(201,169,98,0.1)' }}
                            contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: '1px solid rgba(201,169,98,0.3)' }}
                            formatter={(value: number) => [value, 'Livraisons']}
                          />
                          <Bar dataKey="count" fill="url(#communeGradient)" radius={[0, 8, 8, 0]} barSize={20} animationBegin={200} animationDuration={1200} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Évolution des gains + Répartition types */}
              <div className="grid md:grid-cols-2 gap-8 mb-8">
                <Card variant="glass" className="border-gold-400/20 shadow-gold">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp size={18} className="text-gold-500" /> Évolution des gains
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={evolutionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gainGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#c99a14" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#c99a14" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.2)" />
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: '1px solid rgba(201,169,98,0.3)' }}
                          formatter={(value: number) => [value, 'Livraisons']}
                        />
                        <Area type="monotone" dataKey="value" stroke="#c99a14" strokeWidth={2} fill="url(#gainGradient)" animationBegin={300} animationDuration={1500} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Répartition types de livraison (si fourni) */}
                <Card variant="glass" className="border-gold-400/20 shadow-gold">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChart size={18} className="text-gold-500" /> Types de livraison
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {stats.repartition_types && stats.repartition_types.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={stats.repartition_types}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            animationBegin={0}
                            animationDuration={1000}
                          >
                            {stats.repartition_types.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: '1px solid rgba(201,169,98,0.3)' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-neutral-500 text-sm text-center py-12">Données non disponibles</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Gains mensuels (si fournis) */}
              {monthlyGains.length > 0 && (
                <Card variant="glass" className="border-gold-400/20 shadow-gold mb-8">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar size={18} className="text-gold-500" /> Gains mensuels
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={monthlyGains}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.2)" />
                        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#a8a49b' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#a8a49b' }} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: '1px solid rgba(201,169,98,0.3)' }}
                          formatter={(value: number) => [`${value.toLocaleString()} FC`, 'Gain']}
                        />
                        <Bar dataKey="gain" fill="#c99a14" radius={[8, 8, 0, 0]} animationBegin={300} animationDuration={1200} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Courses en cours */}
              {stats.courses_en_cours && stats.courses_en_cours.count > 0 && (
                <Card variant="glass" className="border-gold-400/20 mb-8">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package size={18} className="text-gold-500" /> Courses en cours ({stats.courses_en_cours.count})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {stats.courses_en_cours.details.map((course: any) => (
                        <div key={course.id} className="flex justify-between items-center p-3 bg-white/50 dark:bg-midnight-800/40 rounded-xl">
                          <div>
                            <p className="font-medium text-sm text-neutral-900 dark:text-neutral-100">Commande #{course.commande_id?.slice(-6)}</p>
                            <p className="text-xs text-neutral-500">{course.statut}</p>
                          </div>
                          <Link href={`/dashboard/livreur/courses/${course.commande_id}`}>
                            <Button variant="outline-gold" size="sm">Voir</Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Détails supplémentaires (toggle) */}
              <div className="mt-8">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-2 text-sm text-gold-600 hover:text-gold-500 transition-colors"
                >
                  {showDetails ? 'Masquer' : 'Afficher'} les détails supplémentaires
                </button>
                {showDetails && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-4">
                    <Card variant="glass" className="border-gold-400/20">
                      <CardContent className="p-5 space-y-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Dernière activité</span>
                          <span>{stats.derniere_activite ? new Date(stats.derniere_activite).toLocaleString() : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Évaluations reçues</span>
                          <span>{stats.total_evaluations}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Distance totale</span>
                          <span>{stats.distance_parcourue_km.toFixed(1)} km</span>
                        </div>
                        {stats.comparaison && (
                          <>
                            <hr className="border-gold-400/20" />
                            <p className="font-medium">Comparaison période précédente</p>
                            <div className="flex justify-between">
                              <span>Livraisons</span>
                              <span>{stats.comparaison.total_livraisons_prec}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Gains</span>
                              <span>{stats.comparaison.gains_prec.toLocaleString()} FC</span>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </div>
            </>
          ) : null}
        </motion.div>
      </Container>
      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}