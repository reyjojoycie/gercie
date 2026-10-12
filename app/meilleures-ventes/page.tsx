// app/meilleures-ventes/page.tsx
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useCart } from '@/contexts/CartContext'
import { useFavorites } from '@/hooks/useFavorites'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { ProductBadges } from '@/components/badges/ProductBadges'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, Search, Sliders, Grid, List, Heart, Share2, ShoppingBag,
  Trophy, Star, TrendingUp, Package, Award, Flame, RotateCcw,
  ChevronLeft, ChevronRight, X, Check, ExternalLink,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Product {
  id: string
  nom: string
  description: string
  prix: number
  images: string[]
  categorie: string
  stock: number
  rating?: number
  reviews_count?: number
  badges?: string[]
  total_ventes: number
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */
const PER_PAGE = 10
const CATEGORIES = ['all', 'Électronique', 'Audio', 'Logiciel', 'Mode', 'Maison', 'Sport']

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function MeilleuresVentesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addItem } = useCart()
  const toast = useToast()

  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [categorie, setCategorie] = useState(searchParams.get('categorie') || 'all')
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  // Synchronisation URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (categorie !== 'all') params.set('categorie', categorie)
    if (page > 1) params.set('page', String(page))
    router.replace(`/meilleures-ventes?${params.toString()}`, { scroll: false })
  }, [search, categorie, page, router])

  // Requête API
  const queryParams = new URLSearchParams({
    limit: String(PER_PAGE),
    page: String(page),
    sort_by: 'total_ventes',
    sort_order: 'desc',
    search,
    ...(categorie !== 'all' && { categorie }),
  })

  const { data, isLoading, isError, error, refetch } = useQuery<{
    data: Product[]
    total: number
    totalPages: number
  }>({
    queryKey: ['meilleures-ventes', queryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/produits?${queryParams.toString()}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement')
      return res.json()
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  const produits = data?.data ?? []
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  // Ajout panier
  const handleAddToCart = (prod: Product) => {
    addItem({
      id: prod.id,
      nom: prod.nom,
      prix: prod.prix,
      quantite: 1,
      image: prod.images?.[0],
    })
    toast.addToast({ type: 'success', message: `${prod.nom} ajouté au panier` })
  }

  // Rang badge
  const getRankBadge = (position: number) => {
    if (position === 1) return { icon: <Trophy size={20} className="text-amber-400" />, bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400', label: '#1' }
    if (position === 2) return { icon: <Award size={20} className="text-slate-300" />, bg: 'bg-slate-400/10 border-slate-400/30 text-slate-300', label: '#2' }
    if (position === 3) return { icon: <Flame size={20} className="text-orange-400" />, bg: 'bg-orange-500/10 border-orange-500/30 text-orange-400', label: '#3' }
    return { icon: null, bg: 'bg-muted border-border text-muted-foreground', label: `#${position}` }
  }

  // Réinitialiser les filtres
  const resetFilters = () => {
    setSearch('')
    setCategorie('all')
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-background">
      <ScrollToTop variant="circle" showProgress />

      {/* En‑tête */}
      <section className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border shadow-sm">
        <Container className="py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 rounded-xl hover:bg-gold-400/10 transition-colors">
              <ArrowLeft size={20} className="text-muted-foreground hover:text-gold-500" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold font-serif flex items-center gap-2">
                <Trophy size={24} className="text-amber-400" />
                Meilleures Ventes
              </h1>
              <p className="text-xs text-muted-foreground">
                {total} produit{total > 1 ? 's' : ''} classé{total > 1 ? 's' : ''} par popularité
              </p>
            </div>
          </div>
          <Button variant="outline-gold" size="sm" onClick={() => refetch()}>
            <RotateCcw size={14} className="mr-1" /> Actualiser
          </Button>
        </Container>
      </section>

      <Container className="py-8">
        {/* Barre d'outils */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un produit..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-10"
              allowClear
              onClear={() => setSearch('')}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={categorie}
              onChange={e => { setCategorie(e.target.value); setPage(1) }}
              className="border border-border rounded-full px-3 py-1.5 text-xs bg-card text-muted-foreground"
            >
              <option value="all">Toutes catégories</option>
              {CATEGORIES.filter(c => c !== 'all').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
            >
              {viewMode === 'list' ? <Grid size={16} /> : <List size={16} />}
            </button>
          </div>
          {(search || categorie !== 'all') && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-red-500">
              <X size={14} className="mr-1" /> Effacer filtres
            </Button>
          )}
        </div>

        {/* Contenu */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border p-6 flex items-center gap-6">
                <Skeleton variant="rectangular" className="w-14 h-14 rounded-xl" shimmer shimmerVariant="gold" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" className="h-5 w-1/2" shimmer shimmerVariant="gold" />
                  <Skeleton variant="text" className="h-4 w-3/4" shimmer shimmerVariant="gold" />
                  <div className="flex gap-3">
                    <Skeleton variant="text" className="w-16 h-4 rounded-full" shimmer shimmerVariant="gold" />
                    <Skeleton variant="text" className="w-20 h-4" shimmer shimmerVariant="gold" />
                  </div>
                </div>
                <Skeleton variant="text" className="w-24 h-7" shimmer shimmerVariant="gold" />
                <Skeleton variant="rectangular" className="w-10 h-10 rounded-lg" shimmer shimmerVariant="gold" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20">
            <Package size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-red-500 mb-4">{(error as Error)?.message || 'Erreur'}</p>
            <Button variant="outline-gold" onClick={() => refetch()}>
              <RotateCcw size={14} className="mr-1" /> Réessayer
            </Button>
          </div>
        ) : produits.length === 0 ? (
          <div className="text-center py-20">
            <Trophy size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucune vente trouvée pour ces critères.</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-4">
            <AnimatePresence>
              {produits.map((prod, idx) => {
                const globalRank = (page - 1) * PER_PAGE + idx + 1
                const { icon, bg, label } = getRankBadge(globalRank)
                const { isFavorite, toggleFavorite } = useFavorites(prod.id)
                return (
                  <motion.div
                    key={prod.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-card hover:bg-muted/50 border border-border hover:border-gold-400/30 transition-all duration-300 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group shadow-sm"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      {/* Rang */}
                      <div className={cn('h-14 w-14 rounded-xl flex flex-col items-center justify-center font-black border shrink-0', bg)}>
                        {icon ? icon : <span className="text-lg">{label}</span>}
                      </div>

                      {/* Image */}
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0">
                        <Image
                          src={prod.images?.[0] || '/placeholder.jpg'}
                          alt={prod.nom}
                          width={64}
                          height={64}
                          className="object-cover w-full h-full"
                        />
                      </div>

                      {/* Infos */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-bold text-foreground group-hover:text-gold-500 transition-colors">
                            {prod.nom}
                          </h3>
                          {prod.badges?.map(b => (
                            <Badge key={b} variant="gold" size="sm">{b}</Badge>
                          ))}
                          {prod.stock <= 5 && prod.stock > 0 && (
                            <Badge variant="danger" size="sm" className="animate-pulse">Stock critique</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{prod.description}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <Badge variant="neutral" size="sm">{prod.categorie}</Badge>
                          {prod.rating && (
                            <span className="flex items-center gap-1 text-amber-400 font-bold">
                              <Star size={14} className="fill-amber-400" /> {prod.rating.toFixed(1)}
                              <span className="text-muted-foreground">({prod.reviews_count || 0})</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            <TrendingUp size={14} /> {prod.total_ventes?.toLocaleString() || 0} ventes
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-4 shrink-0 w-full md:w-auto justify-between md:justify-end pt-3 md:pt-0 border-t md:border-t-0 border-border/50">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Prix</p>
                        <p className="text-xl font-bold text-gold-600">{prod.prix.toLocaleString()} FC</p>
                      </div>
                      <div className="flex gap-1">
                        <Tooltip content={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                          <button onClick={toggleFavorite} className="p-2 rounded-lg hover:bg-red-400/10 transition">
                            <Heart size={18} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'} />
                          </button>
                        </Tooltip>
                        <Tooltip content="Ajouter au panier">
                          <button onClick={() => handleAddToCart(prod)} disabled={prod.stock === 0} className="p-2 rounded-lg bg-gold-400/10 text-gold-400 hover:bg-gold-400/20 transition disabled:opacity-40">
                            <ShoppingBag size={18} />
                          </button>
                        </Tooltip>
                        <Tooltip content="Voir détails">
                          <Link href={`/produits/${prod.id}`} className="p-2 rounded-lg hover:bg-gold-400/10 transition">
                            <ExternalLink size={18} className="text-muted-foreground" />
                          </Link>
                        </Tooltip>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence>
              {produits.map((prod, idx) => {
                const globalRank = (page - 1) * PER_PAGE + idx + 1
                const { icon, bg, label } = getRankBadge(globalRank)
                const { isFavorite, toggleFavorite } = useFavorites(prod.id)
                return (
                  <motion.div
                    key={prod.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-card rounded-2xl border border-border hover:border-gold-400/50 transition overflow-hidden group flex flex-col"
                  >
                    <div className="aspect-square relative bg-muted">
                      <Image
                        src={prod.images?.[0] || '/placeholder.jpg'}
                        alt={prod.nom}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className={cn('absolute top-2 left-2 h-8 w-8 rounded-lg flex items-center justify-center font-bold text-sm border', bg)}>
                        {icon ? icon : <span>{label}</span>}
                      </div>
                    </div>
                    <div className="p-4 flex flex-col flex-1 gap-2">
                      <h3 className="font-semibold text-sm line-clamp-2">{prod.nom}</h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TrendingUp size={12} className="text-emerald-400" />
                        {prod.total_ventes?.toLocaleString() || 0} ventes
                      </div>
                      <div className="mt-auto flex items-center justify-between">
                        <span className="font-bold text-gold-600">{prod.prix.toLocaleString()} FC</span>
                        <div className="flex gap-1">
                          <button onClick={toggleFavorite} className="p-1.5 rounded-lg hover:bg-red-400/10">
                            <Heart size={16} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'} />
                          </button>
                          <button onClick={() => handleAddToCart(prod)} className="p-1.5 rounded-lg bg-gold-400/10 text-gold-400 hover:bg-gold-400/20">
                            <ShoppingBag size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-10">
            <Button variant="outline-gold" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft size={16} /> Précédent
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <Button key={p} variant={p === page ? 'gold' : 'outline-gold'} size="sm" onClick={() => setPage(p)}>
                {p}
              </Button>
            ))}
            <Button variant="outline-gold" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Suivant <ChevronRight size={16} />
            </Button>
          </div>
        )}
      </Container>
    </div>
  )
}