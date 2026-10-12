'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import dynamic from 'next/dynamic'

const MapItineraire = dynamic(() => import('@/components/MapItineraire'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-full flex items-center justify-center bg-neutral-100 dark:bg-midnight-800 rounded-xl animate-pulse">
      <span className="text-sm text-neutral-500">Chargement de la carte...</span>
    </div>
  )
})

import {
  MapPin, Package, AlertCircle, Truck, ChevronRight,
  Filter, X, RefreshCw, User, BarChart3, History,
  Bell, ToggleLeft, ToggleRight, Navigation, Sparkles,
  Search, ArrowUpDown, ChevronDown, Calendar, DollarSign,
  CheckCircle2, Star, TrendingUp, Activity, Zap,
  Map, Layers, Eye, Smartphone, RotateCcw
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
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { useGeolocation } from '@/hooks/useGeolocation'

interface Course {
  id: string
  numero: string
  total: number
  type_livraison: string
  adresse: string
  point_retrait_nom: string | null
  commune: string
  commune_id?: number | null
  latitude?: number | null
  longitude?: number | null
  distance_km?: number | null
  statut?: string
}

interface Commune {
  id: number
  nom: string
}

interface LivreurProfile {
  id: string
  nom: string
  prenom: string
  telephone: string
  email: string
  est_disponible: boolean
  est_actif: boolean
  zone_operation_principale: string | null
  photo_url: string | null
  total_livraisons: number
  evaluation_moyenne: number
  latitude?: number | null
  longitude?: number | null
}

interface DashboardStats {
  coursesEnCours: number
  coursesLivrees: number
  coursesAnnulees: number
  totalKmParcourus: number
  gainDuMois: number
  tempsMoyenCourse: number
}

export default function LivreurDashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { position: geoPosition, loading: geoLoading, error: geoError, requestPosition } = useGeolocation({
    continuous: true,
    enableHighAccuracy: true,
  })

  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    commune_id: '',
    type_livraison: '',
    min_total: '',
    max_total: '',
  })
  const [sortBy, setSortBy] = useState<'distance' | 'total' | 'date'>('distance')
  const [searchQuery, setSearchQuery] = useState('')
  const [modeVue, setModeVue] = useState<'liste' | 'carte'>('liste')
  const [acceptModalOpen, setAcceptModalOpen] = useState<Course | null>(null)

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  const { data: communes = [] } = useQuery<Commune[]>({
    queryKey: ['communes-all'],
    queryFn: async () => {
      const res = await fetch('/api/communes/all')
      if (!res.ok) throw new Error('Erreur')
      return res.json()
    },
    staleTime: 60 * 60 * 1000,
  })

  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useQuery<LivreurProfile>({
    queryKey: ['livreur-profile', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/livreur/profile')
      if (!res.ok) throw new Error('Erreur')
      return res.json()
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const { data: alertesData } = useQuery({
    queryKey: ['livreur-alertes-count', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/livreur/alertes?non_lues=true&limit=1')
      if (!res.ok) return { total: 0 }
      const data = await res.json()
      return { total: data.meta?.non_lues || 0 }
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  })

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['livreur-dashboard-stats', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/livreur/stats/dashboard')
      if (!res.ok) throw new Error('Erreur')
      return res.json()
    },
    enabled: !!user,
    staleTime: 60_000,
  })

  const { data: courses = [], isLoading: coursesLoading, isFetching, refetch: refetchCourses } = useQuery<Course[]>({
    queryKey: ['livreur-courses', filters, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.commune_id) params.append('commune_id', filters.commune_id)
      if (filters.type_livraison) params.append('type_livraison', filters.type_livraison)
      if (filters.min_total) params.append('min_total', filters.min_total)
      if (filters.max_total) params.append('max_total', filters.max_total)
      const url = `/api/livreur/courses${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Erreur')
      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
    enabled: !!user,
    staleTime: 20_000,
  })

  const coursesWithDistance = useMemo(() => {
    if (!geoPosition) return courses.map(c => ({ ...c, distance_km: null }))
    return courses.map(c => {
      if (!c.latitude || !c.longitude) return { ...c, distance_km: null }
      const dist = calculateDistance(geoPosition.latitude, geoPosition.longitude, c.latitude, c.longitude)
      return { ...c, distance_km: dist }
    })
  }, [courses, geoPosition])

  const sortedCourses = useMemo(() => {
    const arr = [...coursesWithDistance]
    if (sortBy === 'distance' && geoPosition) {
      arr.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
    } else if (sortBy === 'total') {
      arr.sort((a, b) => b.total - a.total)
    }
    return arr
  }, [coursesWithDistance, sortBy, geoPosition])

  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return sortedCourses
    const q = searchQuery.toLowerCase()
    return sortedCourses.filter(c =>
      c.numero.toLowerCase().includes(q) ||
      c.commune.toLowerCase().includes(q) ||
      (c.adresse && c.adresse.toLowerCase().includes(q))
    )
  }, [sortedCourses, searchQuery])

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/livreur/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ est_disponible: !profile?.est_disponible }),
      })
      if (!res.ok) throw new Error('Erreur')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['livreur-profile'] })
      toast({ type: 'success', message: profile?.est_disponible ? 'Vous êtes maintenant indisponible' : 'Vous êtes maintenant disponible' })
    },
    onError: () => toast({ type: 'error', message: 'Erreur lors du changement de statut' }),
  })

  const acceptMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const res = await fetch('/api/livreur/courses/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: courseId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['livreur-courses'] })
      toast({ type: 'success', message: 'Course acceptée !' })
      setAcceptModalOpen(null)
    },
    onError: (err: any) => {
      toast({ type: 'error', message: err.message })
    },
  })

  const handleAccept = (course: Course) => {
    setAcceptModalOpen(course)
  }

  const confirmAccept = () => {
    if (acceptModalOpen) {
      acceptMutation.mutate(acceptModalOpen.id)
    }
  }

  const resetFilters = () => {
    setFilters({ commune_id: '', type_livraison: '', min_total: '', max_total: '' })
    setShowFilters(false)
    setSearchQuery('')
  }

  const mapWaypoints = useMemo(() => {
    return filteredCourses
      .filter(c => c.latitude && c.longitude)
      .map(c => ({
        label: `#${c.numero}`,
        latitude: c.latitude!,
        longitude: c.longitude!,
        type: 'waypoint' as const,
        id: c.id,
      }))
  }, [filteredCourses])

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center">
        <Spinner size="xl" variant="premium" label="Chargement..." />
      </div>
    )
  }

  if (!user) {
    window.location.href = '/login'
    return null
  }

  if (profile && !profile.est_actif) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <div className="text-center space-y-4 p-8 max-w-md">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">Compte désactivé</h1>
          <p className="text-neutral-600 dark:text-neutral-300">
            Votre compte livreur est actuellement désactivé. Veuillez contacter le support.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="text-sm text-gold-500 underline hover:text-gold-600"
          >
            Retour à l’accueil
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />

      <div className="relative z-20 bg-midnight-900 border-b border-gold-400/20">
        <Container className="py-3 flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] font-bold text-gold-200 overflow-hidden">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Truck size={14} className="text-gold-400" />
              Espace Livreur
            </span>
            <div className="w-px h-4 bg-gold-400/30" />
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Package size={14} className="text-gold-400" />
              Gercie Express
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending}
              className="flex items-center gap-1 text-xs disabled:opacity-50"
            >
              {profile.est_disponible ? (
                <ToggleRight size={18} className="text-green-400" />
              ) : (
                <ToggleLeft size={18} className="text-red-400" />
              )}
              <span>{profile.est_disponible ? 'Disponible' : 'Indisponible'}</span>
            </button>
            <Link href="/dashboard/livreur/alertes" className="relative">
              <Bell size={16} />
              {alertesData && alertesData.total > 0 && (
                <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">
                  {alertesData.total > 9 ? '9+' : alertesData.total}
                </span>
              )}
            </Link>
          </div>
        </Container>
      </div>

      <div className="sticky top-0 z-10 backdrop-blur-xl bg-white/70 dark:bg-midnight-900/70 border-b border-gold-400/20 shadow-soft">
        <Container className="py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">
              Tableau de bord livreur
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Gérez vos livraisons en temps réel
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content="Statistiques">
              <Link href="/dashboard/livreur/stats">
                <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-gold-500">
                  <BarChart3 size={20} />
                </Button>
              </Link>
            </Tooltip>
            <Tooltip content="Historique">
              <Link href="/dashboard/livreur/historique">
                <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-gold-500">
                  <History size={20} />
                </Button>
              </Link>
            </Tooltip>
            <Tooltip content="Mon profil">
              <Link href="/dashboard/livreur/profile">
                <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-gold-500">
                  <User size={20} />
                </Button>
              </Link>
            </Tooltip>
            <Tooltip content="Actualiser">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetchCourses()}
                className="text-neutral-500 hover:text-gold-500"
              >
                <RefreshCw size={20} className={cn(isFetching && 'animate-spin')} />
              </Button>
            </Tooltip>
            <div className="flex items-center rounded-full bg-neutral-100 dark:bg-midnight-700/40 p-1 border border-gold-400/20">
              <button
                onClick={() => setModeVue('liste')}
                className={cn('p-1.5 rounded-full transition', modeVue === 'liste' ? 'bg-gold-500 text-white' : 'text-neutral-400')}
              >
                <Eye size={16} />
              </button>
              <button
                onClick={() => setModeVue('carte')}
                className={cn('p-1.5 rounded-full transition', modeVue === 'carte' ? 'bg-gold-500 text-white' : 'text-neutral-400')}
              >
                <Map size={16} />
              </button>
            </div>
            <Button
              variant={showFilters ? 'luxe' : 'outline-gold'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              leftIcon={<Filter size={16} />}
            >
              Filtres
            </Button>
          </div>
        </Container>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white/80 dark:bg-midnight-800/80 backdrop-blur-md border-b border-gold-400/20"
          >
            <Container className="py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Commune</label>
                  <select
                    value={filters.commune_id}
                    onChange={e => setFilters({ ...filters, commune_id: e.target.value })}
                    className="w-full border border-gold-400/30 rounded-xl p-2 text-sm bg-white/50 dark:bg-midnight-700/50 backdrop-blur-sm"
                  >
                    <option value="">Toutes</option>
                    {communes.map(c => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Type</label>
                  <select
                    value={filters.type_livraison}
                    onChange={e => setFilters({ ...filters, type_livraison: e.target.value })}
                    className="w-full border border-gold-400/30 rounded-xl p-2 text-sm bg-white/50 dark:bg-midnight-700/50 backdrop-blur-sm"
                  >
                    <option value="">Tous</option>
                    <option value="domicile">Domicile</option>
                    <option value="point_retrait">Point retrait</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Min (FC)</label>
                  <Input
                    type="number"
                    variant="glass"
                    placeholder="0"
                    value={filters.min_total}
                    onChange={e => setFilters({ ...filters, min_total: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Max (FC)</label>
                  <Input
                    type="number"
                    variant="glass"
                    placeholder="Illimité"
                    value={filters.max_total}
                    onChange={e => setFilters({ ...filters, max_total: e.target.value })}
                  />
                </div>
              </div>
              {hasActiveFilters && (
                <div className="mt-4 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={resetFilters} leftIcon={<X size={14} />}>
                    Effacer les filtres
                  </Button>
                </div>
              )}
            </Container>
          </motion.div>
        )}
      </AnimatePresence>

      <Container className="py-8 relative z-10">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'En cours', value: stats.coursesEnCours, icon: <Activity size={20} className="text-amber-500" /> },
                { label: 'Livrées', value: stats.coursesLivrees, icon: <CheckCircle2 size={20} className="text-green-500" /> },
                { label: 'Km parcourus', value: `${stats.totalKmParcourus?.toFixed(0) || 0} km`, icon: <TrendingUp size={20} className="text-blue-500" /> },
                { label: 'Gain du mois', value: `${stats.gainDuMois?.toLocaleString() || 0} FC`, icon: <DollarSign size={20} className="text-gold-500" /> },
              ].map((stat, idx) => (
                <Card key={idx} variant="glass" className="border-gold-400/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">{stat.icon}</div>
                    <div>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="font-bold text-foreground">{stat.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {mounted && modeVue === 'carte' && mapWaypoints.length > 0 && (
            <Card variant="glass" className="mb-8 border-gold-400/20 shadow-gold">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <Navigation size={18} className="text-gold-500" />
                  Vue d'ensemble
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MapItineraire
                  origin={{
                    label: 'Ma position',
                    latitude: geoPosition?.latitude ?? profile?.latitude ?? -4.4419,
                    longitude: geoPosition?.longitude ?? profile?.longitude ?? 15.2663,
                  }}
                  waypoints={mapWaypoints}
                  height="400px"
                  optimize={false}
                />
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
              <Input
                variant="glass"
                placeholder="Rechercher par numéro, commune..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
                allowClear
                onClear={() => setSearchQuery('')}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">Trier :</span>
              {[
                { key: 'distance', label: 'Distance' },
                { key: 'total', label: 'Montant' },
                { key: 'date', label: 'Date' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key as typeof sortBy)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition border',
                    sortBy === opt.key
                      ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm'
                      : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="ml-auto text-xs text-neutral-500">
              {filteredCourses.length} course{filteredCourses.length > 1 ? 's' : ''}
            </div>
          </div>

          {coursesLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-midnight-800/40 rounded-2xl p-5 border border-gold-400/10">
                  <div className="flex justify-between mb-3">
                    <Skeleton variant="text" className="w-48 h-6" shimmer shimmerVariant="gold" />
                    <Skeleton variant="rounded" className="w-24 h-6 rounded-full" shimmer shimmerVariant="gold" />
                  </div>
                  <Skeleton variant="text" className="w-2/3 h-4 mb-2" shimmer shimmerVariant="gold" />
                  <div className="flex justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
                    <Skeleton variant="text" className="w-32 h-6" shimmer shimmerVariant="gold" />
                    <Skeleton variant="rounded" className="w-24 h-8 rounded-xl" shimmer shimmerVariant="gold" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCourses.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12 bg-white/50 dark:bg-midnight-800/40 backdrop-blur rounded-2xl border border-gold-400/20"
            >
              <Package size={48} className="mx-auto text-neutral-300 dark:text-neutral-600 mb-4" />
              <p className="text-neutral-500 dark:text-neutral-400">Aucune course disponible.</p>
              <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-2">
                Revenez plus tard ou ajustez vos filtres.
              </p>
            </motion.div>
          ) : (
            <div className="grid gap-4">
              <AnimatePresence>
                {filteredCourses.map((course, idx) => (
                  <motion.div
                    key={course.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ y: -2 }}
                  >
                    <Card className="overflow-hidden border-gold-400/10 hover:shadow-gold transition-shadow bg-white/70 dark:bg-midnight-800/60 backdrop-blur-sm">
                      <CardContent className="p-5">
                        <div className="flex flex-wrap justify-between items-start gap-4">
                          <div>
                            <h3 className="font-bold text-neutral-900 dark:text-neutral-100 text-lg flex items-center gap-2">
                              Commande #{course.numero}
                              {course.distance_km != null && (
                                <Badge variant="neutral" size="sm">
                                  <MapPin size={12} className="mr-1" /> {course.distance_km.toFixed(1)} km
                                </Badge>
                              )}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
                              <MapPin size={14} className="text-gold-500" />
                              <span>{course.commune}</span>
                            </div>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                              {course.adresse}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Link href={`/dashboard/livreur/courses/${course.id}`}>
                              <Button variant="outline-gold" size="sm" rightIcon={<ChevronRight size={16} />}>
                                Détails
                              </Button>
                            </Link>
                            <Button
                              variant="luxe"
                              size="sm"
                              onClick={() => handleAccept(course)}
                              leftIcon={<CheckCircle2 size={14} />}
                            >
                              Accepter
                            </Button>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gold-400/10 flex justify-between items-center">
                          <Badge variant="neutral" size="sm">
                            {course.type_livraison === 'domicile' ? '🏠 Domicile' : '📍 Point retrait'}
                          </Badge>
                          <span className="text-xl font-bold text-gold-600">
                            {course.total.toLocaleString()} FC
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </Container>

      <Modal
        isOpen={!!acceptModalOpen}
        onClose={() => setAcceptModalOpen(null)}
        title="Accepter la course ?"
        size="sm"
        accent="gold"
      >
        {acceptModalOpen && (
          <div className="space-y-4">
            <div className="bg-neutral-50 dark:bg-midnight-700/40 rounded-xl p-4 text-sm space-y-2 border border-gold-400/10">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Commande</span>
                <span className="font-bold">#{acceptModalOpen.numero}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Total</span>
                <span className="font-bold text-gold-600">{acceptModalOpen.total.toLocaleString()} FC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Adresse</span>
                <span className="text-right text-xs max-w-[150px] truncate">{acceptModalOpen.adresse}</span>
              </div>
              {acceptModalOpen.distance_km && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Distance</span>
                  <span>{acceptModalOpen.distance_km.toFixed(1)} km</span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="luxe" fullWidth onClick={confirmAccept} loading={acceptMutation.isPending} leftIcon={<CheckCircle2 size={16} />}>
                Accepter
              </Button>
              <Button variant="outline-gold" fullWidth onClick={() => setAcceptModalOpen(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}