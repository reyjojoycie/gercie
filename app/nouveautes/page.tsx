// app/nouveautes/page.tsx
'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useCart } from '@/contexts/CartContext'
import { useFavorites } from '@/hooks/useFavorites'
import { useToast } from '@/components/ui/Toast'
import { Container, Section } from '@/components/layout/Container'
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
  Sparkles, ArrowLeft, Search, Sliders, ArrowUpDown, Grid, List,
  Heart, Share2, ShoppingBag, Clock, Package, Star, Zap,
  TrendingUp, DollarSign, Calendar, Filter, X, Eye, ChevronDown,
  ChevronUp, ExternalLink, RefreshCcw, Layers, Check, RotateCcw,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types enrichis (doit correspondre aux colonnes de votre table)     */
/* ------------------------------------------------------------------ */
interface Product {
  id: string
  nom: string
  description: string
  prix: number
  prix_usd?: number | null
  images: string[]
  categorie: string
  stock: number
  rating?: number
  reviews_count?: number
  badges?: string[]
  created_at: string
  est_actif: boolean
  total_ventes?: number
  // colonnes éventuelles
  remise_percent?: number | null
  featured?: boolean
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                        */
/* ------------------------------------------------------------------ */
const SEUIL_NOUVEAUTE_JOURS = 14 // produit créé il y a moins de 14 jours = badge "Nouveau"

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Plus récent' },
  { value: 'prix_asc', label: 'Prix croissant' },
  { value: 'prix_desc', label: 'Prix décroissant' },
  { value: 'popularite', label: 'Popularité' },
]

const CATEGORIES_FILTER = ['all', 'Électronique', 'Audio', 'Logiciel', 'Mode', 'Maison', 'Sport', 'Jouets', 'Livres']

/* ------------------------------------------------------------------ */
/*  Composant Carte Enrichie                                           */
/* ------------------------------------------------------------------ */
function ProductCard({ product, onAddToCart, index }: {
  product: Product
  onAddToCart: (p: Product) => void
  index: number
}) {
  const router = useRouter()
  const toast = useToast()
  const { isFavorite, toggleFavorite } = useFavorites(product.id)
  const [copied, setCopied] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  const isNew = useMemo(() => {
    if (!product.created_at) return false
    const diff = Date.now() - new Date(product.created_at).getTime()
    return diff < SEUIL_NOUVEAUTE_JOURS * 24 * 60 * 60 * 1000
  }, [product.created_at])

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/produits/${product.id}`)
    setCopied(true)
    toast.addToast({ type: 'success', message: 'Lien copié !' })
    setTimeout(() => setCopied(false), 2000)
  }

  const shareDeal = () => {
    if (navigator.share) {
      navigator.share({
        title: product.nom,
        text: `${product.nom} à ${product.prix.toLocaleString()} FC`,
        url: `${window.location.origin}/produits/${product.id}`,
      })
    } else copyLink()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-card border border-border hover:border-gold-400/50 hover:shadow-lg hover:shadow-gold-400/5 transition-all duration-300"
    >
      {/* Badges en haut */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5">
        {isNew && (
          <Badge variant="gold" size="sm" className="flex items-center gap-1">
            <Sparkles size={12} /> Nouveau
          </Badge>
        )}
        {product.badges && product.badges.length > 0 && (
          <ProductBadges badgeIds={product.badges} size="sm" />
        )}
        {product.remise_percent && product.remise_percent > 0 && (
          <Badge variant="danger" size="sm">-{product.remise_percent}%</Badge>
        )}
      </div>

      {/* Actions en haut à droite */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip content={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
          <button onClick={toggleFavorite} className="p-1.5 rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-sm hover:bg-red-100">
            <Heart size={16} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'} />
          </button>
        </Tooltip>
        <Tooltip content="Partager">
          <button onClick={shareDeal} className="p-1.5 rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-sm hover:bg-blue-100">
            {copied ? <Check size={16} className="text-green-500" /> : <Share2 size={16} className="text-muted-foreground" />}
          </button>
        </Tooltip>
      </div>

      {/* Image */}
      <div className="aspect-square w-full overflow-hidden bg-muted relative">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size="sm" />
          </div>
        )}
        <Image
          src={product.images?.[0] || '/placeholder.jpg'}
          alt={product.nom}
          width={400}
          height={400}
          className={cn(
            'h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-110',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={() => setImageLoaded(true)}
        />
        <Link href={`/produits/${product.id}`} className="absolute inset-0" aria-label={product.nom} />
      </div>

      {/* Contenu */}
      <div className="flex-1 p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="neutral" size="sm" className="text-xs truncate max-w-[120px]">
            {product.categorie || 'Non classé'}
          </Badge>
          {product.rating && (
            <div className="flex items-center gap-0.5 text-amber-500 ml-auto">
              <Star size={14} className="fill-current" />
              <span className="text-xs font-medium">{product.rating.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">({product.reviews_count || 0})</span>
            </div>
          )}
        </div>

        <h3 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-gold-500 transition-colors leading-tight">
          {product.nom}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>

        <div className="mt-auto flex items-center justify-between pt-2 border-t border-border/50">
          <div>
            <span className="text-lg font-bold text-gold-600">{product.prix.toLocaleString()} FC</span>
          </div>
          <div className="flex gap-1">
            <Tooltip content="Ajouter au panier">
              <button
                onClick={() => onAddToCart(product)}
                disabled={product.stock === 0}
                className="p-2 rounded-lg bg-gold-400/10 text-gold-400 hover:bg-gold-400/20 transition disabled:opacity-40"
              >
                <ShoppingBag size={18} />
              </button>
            </Tooltip>
            <Tooltip content="Aperçu rapide">
              <Link href={`/produits/${product.id}`} className="p-2 rounded-lg hover:bg-gold-400/10 transition">
                <Eye size={18} className="text-muted-foreground" />
              </Link>
            </Tooltip>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ================================================================== */
/*  Page principale                                                     */
/* ================================================================== */
export default function NouveautesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addItem } = useCart()
  const toast = useToast()

  // États depuis URL
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [filterCategorie, setFilterCategorie] = useState(searchParams.get('categorie') || 'all')
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'created_at')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)
  const pageSize = 12

  // Compteur de temps pour calculer l'âge des produits
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Requête des nouveautés
  const queryParams = new URLSearchParams({
    limit: String(pageSize),
    page: String(page),
    sort_by: sortBy === 'popularite' ? 'total_ventes' : sortBy === 'prix_asc' ? 'prix' : sortBy === 'prix_desc' ? 'prix' : 'created_at',
    sort_order: sortBy === 'prix_asc' ? 'asc' : 'desc',
    search,
    ...(filterCategorie !== 'all' && { categorie: filterCategorie }),
    recent: String(SEUIL_NOUVEAUTE_JOURS), // <= paramètre pour filtrer les produits récents
  })

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: Product[]; total: number; totalPages: number }>({
    queryKey: ['nouveautes', queryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/produits?${queryParams.toString()}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement')
      return res.json()
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  const products = data?.data ?? []
  const totalPages = data?.totalPages ?? 1
  const totalProducts = data?.total ?? 0

  // Ajout panier
  const handleAddToCart = (product: Product) => {
    addItem({
      id: product.id,
      nom: product.nom,
      prix: product.prix,
      quantite: 1,
      image: product.images?.[0],
    })
    toast.addToast({ type: 'success', message: `${product.nom} ajouté au panier` })
  }

  // Réinitialiser les filtres
  const resetFilters = () => {
    setSearch('')
    setFilterCategorie('all')
    setSortBy('created_at')
    setPage(1)
  }

  // Synchronisation URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filterCategorie !== 'all') params.set('categorie', filterCategorie)
    if (sortBy !== 'created_at') params.set('sort', sortBy)
    if (page > 1) params.set('page', String(page))
    router.replace(`/nouveautes?${params.toString()}`, { scroll: false })
  }, [search, filterCategorie, sortBy, page, router])

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
                <Sparkles size={24} className="text-gold-500" />
                Nouveautés
              </h1>
              <p className="text-xs text-muted-foreground">
                {totalProducts} produit{totalProducts > 1 ? 's' : ''} découvert{totalProducts > 1 ? 's' : ''} récemment
              </p>
            </div>
          </div>
          <Button variant="outline-gold" size="sm" onClick={() => refetch()}>
            <RefreshCcw size={14} className="mr-1" /> Actualiser
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
              value={filterCategorie}
              onChange={e => { setFilterCategorie(e.target.value); setPage(1) }}
              className="border border-border rounded-full px-3 py-1.5 text-xs bg-card text-muted-foreground"
            >
              <option value="all">Toutes catégories</option>
              {CATEGORIES_FILTER.filter(c => c !== 'all').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setPage(1) }}
              className="border border-border rounded-full px-3 py-1.5 text-xs bg-card text-muted-foreground"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
            >
              {viewMode === 'grid' ? <List size={16} /> : <Grid size={16} />}
            </button>
          </div>

          {(search || filterCategorie !== 'all') && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-red-500">
              <X size={14} className="mr-1" /> Effacer filtres
            </Button>
          )}
        </div>

        {/* Résultats */}
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border overflow-hidden">
                <Skeleton variant="rectangular" className="aspect-square w-full" shimmer shimmerVariant="gold" />
                <div className="p-4 space-y-2">
                  <Skeleton variant="text" className="h-5 w-3/4" shimmer shimmerVariant="gold" />
                  <Skeleton variant="text" className="h-4 w-full" shimmer shimmerVariant="gold" />
                  <Skeleton variant="rectangular" className="h-10 w-24 rounded-lg" shimmer shimmerVariant="gold" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20">
            <Package size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-red-500 mb-4">{(error as Error)?.message || 'Erreur de chargement'}</p>
            <Button variant="outline-gold" onClick={() => refetch()}>
              <RotateCcw size={14} className="mr-1" /> Réessayer
            </Button>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <Sparkles size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search || filterCategorie !== 'all'
                ? 'Aucune nouveauté ne correspond à ces critères.'
                : "Aucune nouveauté pour le moment. Revenez bientôt !"}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <motion.div layout className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence>
              {products.map((product, idx) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                  index={idx}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {products.map(product => (
              <div
                key={product.id}
                className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-gold-400/50 transition"
              >
                <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                  <Image
                    src={product.images?.[0] || '/placeholder.jpg'}
                    alt={product.nom}
                    width={80}
                    height={80}
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{product.nom}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-1">{product.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="neutral" size="sm">{product.categorie}</Badge>
                    {product.badges?.map(b => <Badge key={b} variant="gold" size="sm">{b}</Badge>)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-gold-600">{product.prix.toLocaleString()} FC</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="luxe" size="sm" onClick={() => handleAddToCart(product)}>
                    <ShoppingBag size={14} className="mr-1" /> Ajouter
                  </Button>
                  <Link href={`/produits/${product.id}`}>
                    <Button variant="outline-gold" size="sm">Voir</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-10">
            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Précédent
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <Button
                key={p}
                variant={p === page ? 'gold' : 'outline-gold'}
                size="sm"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}
            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Suivant
            </Button>
          </div>
        )}
      </Container>
    </div>
  )
}