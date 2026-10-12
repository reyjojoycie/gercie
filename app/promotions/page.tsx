'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Section, Stack } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useToast } from '@/components/ui/Toast'
import { useCart } from '@/contexts/CartContext'
import { useFavorites } from '@/hooks/useFavorites'
import { cn } from '@/lib/utils'
import {
  Zap, Clock, Package, Search, Sliders, ArrowUpDown, Grid, List,
  Heart, Share2, Copy, Check, ShoppingBag, AlertCircle, Filter,
  ChevronDown, ChevronUp, X, Eye, BarChart3, Percent, DollarSign,
  Calendar, Info, RotateCcw, TrendingUp, Star, Gift, ExternalLink,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types enrichies                                                    */
/* ------------------------------------------------------------------ */
interface Deal {
  id: string
  title: string
  prix_normal: number
  prix_promo: number
  image: string
  date_fin: string
  date_debut?: string
  categorie?: string
  stock?: number
  description?: string
  remise_percent?: number
  vendu?: number
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */
const SORT_OPTIONS = [
  { value: 'remise', label: 'Meilleure réduction' },
  { value: 'prix_asc', label: 'Prix croissant' },
  { value: 'prix_desc', label: 'Prix décroissant' },
  { value: 'temps', label: 'Temps restant' },
  { value: 'recent', label: 'Plus récent' },
]

const FILTER_REMISE_MIN = [
  { value: 0, label: 'Toutes' },
  { value: 10, label: '≥ 10%' },
  { value: 25, label: '≥ 25%' },
  { value: 50, label: '≥ 50%' },
]

/* ------------------------------------------------------------------ */
/*  Composant d’une carte enrichie                                     */
/* ------------------------------------------------------------------ */
function DealCard({
  deal,
  getRemise,
  timeLeft,
  formatTimeLeft,
  onAddToCart,
}: {
  deal: Deal
  getRemise: (n: number, p: number) => number
  timeLeft: number
  formatTimeLeft: (diff: number) => string
  onAddToCart: (deal: Deal) => void
}) {
  const { isFavorite, toggleFavorite } = useFavorites(deal.id)
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/produits/${deal.id}`)
    setCopied(true)
    toast.addToast({ type: 'success', message: 'Lien copié !' })
    setTimeout(() => setCopied(false), 2000)
  }

  const shareDeal = () => {
    if (navigator.share) {
      navigator.share({
        title: deal.title,
        text: `${deal.title} à ${deal.prix_promo.toLocaleString()} FC au lieu de ${deal.prix_normal.toLocaleString()} FC`,
        url: `${window.location.origin}/produits/${deal.id}`,
      })
    } else {
      copyLink()
    }
  }

  const isExpired = timeLeft <= 0
  const remise = getRemise(deal.prix_normal, deal.prix_promo)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl bg-card border border-border transition-all duration-300 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-400/5',
        isExpired && 'opacity-60'
      )}
    >
      {/* Badge remise */}
      <span className="absolute top-4 left-4 z-10 inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-400 border border-amber-500/20 gap-1">
        <Zap size={14} />
        {remise > 0 ? `-${remise}%` : 'Promo'}
      </span>

      {/* Compte à rebours */}
      <span
        className={cn(
          'absolute top-4 right-4 z-10 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium gap-1 backdrop-blur-sm',
          timeLeft <= 3600000
            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
            : 'bg-black/40 text-white border border-white/20'
        )}
      >
        <Clock size={12} />
        {isExpired ? 'Expiré' : formatTimeLeft(timeLeft)}
      </span>

      {/* Image */}
      <div className="aspect-video w-full overflow-hidden bg-muted">
        <Image
          src={deal.image || '/placeholder.jpg'}
          alt={deal.title}
          width={640}
          height={360}
          className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      {/* Contenu */}
      <div className="flex-1 p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {deal.categorie && (
            <Badge variant="neutral" size="sm" className="text-xs">
              {deal.categorie}
            </Badge>
          )}
          {deal.vendu && deal.vendu > 10 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp size={12} /> {deal.vendu} vendus
            </span>
          )}
        </div>

        <h3 className="text-xl font-bold text-foreground group-hover:text-amber-400 transition-colors line-clamp-2">
          {deal.title}
        </h3>
        {deal.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{deal.description}</p>
        )}

        {/* Prix */}
        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-400">
              {deal.prix_promo.toLocaleString()} FC
            </span>
            <span className="text-sm text-muted-foreground line-through">
              {deal.prix_normal.toLocaleString()} FC
            </span>
          </div>
          <div className="flex gap-1">
            <Tooltip content="Ajouter au panier">
              <button
                onClick={(e) => { e.preventDefault(); onAddToCart(deal) }}
                disabled={isExpired}
                className="p-2 rounded-lg bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition disabled:opacity-40"
              >
                <ShoppingBag size={18} />
              </button>
            </Tooltip>
            <Tooltip content={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
              <button
                onClick={(e) => { e.preventDefault(); toggleFavorite() }}
                className="p-2 rounded-lg hover:bg-red-400/10 transition"
              >
                <Heart
                  size={18}
                  className={isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}
                />
              </button>
            </Tooltip>
            <Tooltip content="Partager">
              <button
                onClick={(e) => { e.preventDefault(); shareDeal() }}
                className="p-2 rounded-lg hover:bg-blue-400/10 transition"
              >
                <Share2 size={18} className="text-muted-foreground" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Stock restant */}
        {deal.stock !== undefined && deal.stock <= 5 && deal.stock > 0 && (
          <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
            <AlertCircle size={12} /> Plus que {deal.stock} en stock
          </div>
        )}

        {/* Bouton voir détail */}
        <Link href={`/produits/${deal.id}`} className="mt-2 block w-full text-center rounded-lg bg-muted py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 transition">
          Voir les détails <ExternalLink size={12} className="inline ml-1" />
        </Link>
      </div>
    </motion.div>
  )
}

/* ================================================================== */
/*  Page principale                                                     */
/* ================================================================== */
export default function DealsPage() {
  const { addItem } = useCart()
  const toast = useToast()
  const queryClient = useQueryClient()

  // États
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('remise')
  const [filterRemiseMin, setFilterRemiseMin] = useState<number>(0)
  const [filterCategorie, setFilterCategorie] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showExpired, setShowExpired] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)

  // Récupération des offres actives
  const { data: dealsData = [], isLoading, isError, refetch } = useQuery<Deal[]>({
    queryKey: ['active-deals'],
    queryFn: () => fetch('/api/promotions/actives').then(r => {
      if (!r.ok) throw new Error('Erreur')
      return r.json()
    }),
    staleTime: 60_000,
  })

  // Compteur de temps dynamique
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Calcul du pourcentage de réduction
  const getRemise = useCallback((normal: number, promo: number) =>
    Math.round(((normal - promo) / normal) * 100), [])

  // Formatage du temps restant
  const formatTimeLeft = useCallback((diff: number) => {
    if (diff <= 0) return 'Expiré'
    const hours = Math.floor(diff / 3_600_000)
    const minutes = Math.floor((diff % 3_600_000) / 60_000)
    return `${hours}h ${minutes}m`
  }, [])

  // Catégories uniques extraites des deals
  const categories = useMemo(() => {
    const cats = new Set<string>()
    dealsData.forEach(d => { if (d.categorie) cats.add(d.categorie) })
    return Array.from(cats)
  }, [dealsData])

  // Filtrage et tri
  const processedDeals = useMemo(() => {
    let list = dealsData

    // Recherche
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d => d.title.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q))
    }

    // Filtre catégorie
    if (filterCategorie !== 'all') {
      list = list.filter(d => d.categorie === filterCategorie)
    }

    // Filtre remise minimum
    if (filterRemiseMin > 0) {
      list = list.filter(d => getRemise(d.prix_normal, d.prix_promo) >= filterRemiseMin)
    }

    // Expirés ou non
    if (!showExpired) {
      list = list.filter(d => new Date(d.date_fin).getTime() > now)
    }

    // Tri
    switch (sortBy) {
      case 'remise':
        list.sort((a, b) => getRemise(b.prix_normal, b.prix_promo) - getRemise(a.prix_normal, a.prix_promo))
        break
      case 'prix_asc':
        list.sort((a, b) => a.prix_promo - b.prix_promo)
        break
      case 'prix_desc':
        list.sort((a, b) => b.prix_promo - a.prix_promo)
        break
      case 'temps':
        list.sort((a, b) => new Date(a.date_fin).getTime() - new Date(b.date_fin).getTime())
        break
      case 'recent':
        list.sort((a, b) => new Date(b.date_debut || 0).getTime() - new Date(a.date_debut || 0).getTime())
        break
    }

    return list
  }, [dealsData, search, filterCategorie, filterRemiseMin, showExpired, sortBy, now, getRemise])

  // Gestion de l'ajout au panier
  const handleAddToCart = (deal: Deal) => {
    addItem({
      id: deal.id,
      nom: deal.title,
      prix: deal.prix_promo,
      quantite: 1,
      image: deal.image,
    })
    toast.addToast({ type: 'success', message: `${deal.title} ajouté au panier` })
  }

  // États de chargement
  if (isLoading) {
    return (
      <Section title="Offres Éclair Gercie" subtitle="Chargement des offres..." background="none" padding="section">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border overflow-hidden">
              <Skeleton variant="rectangular" className="aspect-video w-full" shimmer shimmerVariant="gold" />
              <div className="p-6 space-y-3">
                <Skeleton variant="text" className="h-6 w-3/4" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="h-4 w-full" shimmer shimmerVariant="gold" />
                <Skeleton variant="rectangular" className="h-10 w-32 rounded-lg" shimmer shimmerVariant="gold" />
              </div>
            </div>
          ))}
        </div>
      </Section>
    )
  }

  // Erreur
  if (isError) {
    return (
      <Section title="Offres Éclair Gercie" background="none" padding="section">
        <div className="text-center py-12">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-muted-foreground">Impossible de charger les offres pour le moment.</p>
          <Button variant="outline-gold" onClick={() => refetch()} className="mt-4">
            <RotateCcw size={14} className="mr-1" /> Réessayer
          </Button>
        </div>
      </Section>
    )
  }

  return (
    <Section
      title="Offres Éclair Gercie"
      subtitle="Découvrez nos meilleures opportunités sur l'ensemble de nos catalogues. Des prix compétitifs, une expérience premium."
      background="none"
      padding="section"
      size="default"
      animate="fade-in"
      actions={
        <Link href="/" className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors">
          ← Retour à l'accueil
        </Link>
      }
    >
      {/* Barre d'outils */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une offre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
            allowClear
            onClear={() => setSearch('')}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="border border-border rounded-full px-3 py-1.5 text-xs bg-card text-muted-foreground"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select
            value={filterRemiseMin}
            onChange={e => setFilterRemiseMin(Number(e.target.value))}
            className="border border-border rounded-full px-3 py-1.5 text-xs bg-card text-muted-foreground"
          >
            {FILTER_REMISE_MIN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {categories.length > 0 && (
            <select
              value={filterCategorie}
              onChange={e => setFilterCategorie(e.target.value)}
              className="border border-border rounded-full px-3 py-1.5 text-xs bg-card text-muted-foreground"
            >
              <option value="all">Toutes catégories</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          )}

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showExpired}
              onChange={e => setShowExpired(e.target.checked)}
              className="rounded"
            />
            Voir les offres expirées
          </label>

          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
          >
            {viewMode === 'grid' ? <List size={16} /> : <Grid size={16} />}
          </button>
        </div>

        {(search || filterCategorie !== 'all' || filterRemiseMin > 0) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setFilterCategorie('all'); setFilterRemiseMin(0) }}
            className="text-red-500"
          >
            <X size={14} className="mr-1" /> Effacer filtres
          </Button>
        )}
      </div>

      {/* Résultats */}
      {processedDeals.length === 0 ? (
        <div className="text-center py-12">
          <Package size={48} className="mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            {search || filterCategorie !== 'all'
              ? 'Aucune offre ne correspond à ces critères.'
              : 'Aucune offre éclair pour le moment. Revenez bientôt !'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <motion.div layout className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {processedDeals.map(deal => (
              <DealCard
                key={deal.id}
                deal={deal}
                getRemise={getRemise}
                timeLeft={new Date(deal.date_fin).getTime() - now}
                formatTimeLeft={formatTimeLeft}
                onAddToCart={handleAddToCart}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {processedDeals.map(deal => (
            <Card key={deal.id} variant="glass" className="overflow-hidden">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                  <img src={deal.image} alt={deal.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{deal.title}</h3>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-amber-400">{deal.prix_promo.toLocaleString()} FC</span>
                    <span className="text-xs line-through text-muted-foreground">{deal.prix_normal.toLocaleString()} FC</span>
                    <Badge variant="accent" size="sm">-{getRemise(deal.prix_normal, deal.prix_promo)}%</Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Clock size={12} />
                    {new Date(deal.date_fin).getTime() - now <= 0
                      ? 'Expiré'
                      : formatTimeLeft(new Date(deal.date_fin).getTime() - now)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="luxe" size="sm" onClick={() => handleAddToCart(deal)}>
                    <ShoppingBag size={14} className="mr-1" /> Ajouter
                  </Button>
                  <Link href={`/produits/${deal.id}`}>
                    <Button variant="outline-gold" size="sm">Voir</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Section>
  )
}