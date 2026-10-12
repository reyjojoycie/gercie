// components/Recommendations.tsx
'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import {
  Sparkles, TrendingUp, History, Eye, ChevronRight, RefreshCw, UserPlus, LogIn,
  ArrowLeft, ArrowRight, Loader2, AlertTriangle, Zap, Star, Clock, Flame,
  BarChart3, ShoppingBag, ThumbsUp, Filter, Sliders, Heart, X, Info,
  Layers, Target, Award, Compass, MapPin, Gift, Percent, Package,
  Play, Pause, RotateCcw, MoreHorizontal, ExternalLink, Share2,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import ProductCard from '@/components/ProductCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Types de recommandations étendus
export type RecommendationType =
  | 'ai-personalized'
  | 'trending'
  | 'history'
  | 'similar-to-cart'
  | 'best-sellers'
  | 'new-arrivals'
  | 'for-you'
  | 'hybrid'             // mélange tendances + personnalisé
  | 'category-based'
  | 'popular'

interface Product {
  id: string
  nom: string
  prix: number
  prix_usd?: number
  images: string[]
  vendeur?: { boutique_nom: string }
  categorie?: string
  created_at?: string
  total_ventes?: number
  rating?: number
  reviews_count?: number
  stock?: number
  tags?: string
  badges?: string[]
}

interface RecommendationsProps {
  type?: RecommendationType
  title?: string
  description?: string
  products?: Product[]
  maxItems?: number
  seeMoreUrl?: string
  className?: string
  onRefresh?: () => void
  cardVariant?: 'compact' | 'standard'
  carousel?: boolean
  /** Catégorie pour filtrer (si type === 'category-based') */
  category?: string
  /** ID de produit pour les similaires */
  similarToProductId?: string
  /** Cache l'en-tête (titre, description) */
  hideHeader?: boolean
  /** Ajoute un bouton de filtre rapide par catégorie */
  showCategoryFilter?: boolean
  /** Personnalise le message pour "Recommandé pour vous" */
  reason?: string
  /** Affiche un compteur de temps pour les offres flash */
  showTimer?: boolean
}

// Styles par type (enrichis)
const typeStyles: Record<string, { icon: React.ReactNode; bg: string; border: string; text: string; gradient: string }> = {
  'ai-personalized': {
    icon: <Sparkles size={20} className="text-purple-400" />,
    bg: 'from-purple-900/20 to-purple-600/10',
    border: 'border-purple-400/30',
    text: 'text-purple-300',
    gradient: 'from-purple-500/10 to-pink-500/10',
  },
  trending: {
    icon: <Flame size={20} className="text-amber-400" />,
    bg: 'from-amber-900/20 to-amber-600/10',
    border: 'border-amber-400/30',
    text: 'text-amber-300',
    gradient: 'from-amber-500/10 to-orange-500/10',
  },
  history: {
    icon: <History size={20} className="text-teal-400" />,
    bg: 'from-teal-900/20 to-teal-600/10',
    border: 'border-teal-400/30',
    text: 'text-teal-300',
    gradient: 'from-teal-500/10 to-green-500/10',
  },
  'similar-to-cart': {
    icon: <Eye size={20} className="text-rose-400" />,
    bg: 'from-rose-900/20 to-rose-600/10',
    border: 'border-rose-400/30',
    text: 'text-rose-300',
    gradient: 'from-rose-500/10 to-pink-500/10',
  },
  'best-sellers': {
    icon: <Star size={20} className="text-gold-400" />,
    bg: 'from-gold-900/20 to-gold-600/10',
    border: 'border-gold-400/30',
    text: 'text-gold-300',
    gradient: 'from-gold-500/10 to-yellow-500/10',
  },
  'new-arrivals': {
    icon: <Zap size={20} className="text-blue-400" />,
    bg: 'from-blue-900/20 to-blue-600/10',
    border: 'border-blue-400/30',
    text: 'text-blue-300',
    gradient: 'from-blue-500/10 to-cyan-500/10',
  },
  'for-you': {
    icon: <Target size={20} className="text-pink-400" />,
    bg: 'from-pink-900/20 to-pink-600/10',
    border: 'border-pink-400/30',
    text: 'text-pink-300',
    gradient: 'from-pink-500/10 to-rose-500/10',
  },
  hybrid: {
    icon: <Layers size={20} className="text-indigo-400" />,
    bg: 'from-indigo-900/20 to-purple-600/10',
    border: 'border-indigo-400/30',
    text: 'text-indigo-300',
    gradient: 'from-indigo-500/10 to-purple-500/10',
  },
  'category-based': {
    icon: <Compass size={20} className="text-emerald-400" />,
    bg: 'from-emerald-900/20 to-green-600/10',
    border: 'border-emerald-400/30',
    text: 'text-emerald-300',
    gradient: 'from-emerald-500/10 to-teal-500/10',
  },
  popular: {
    icon: <BarChart3 size={20} className="text-red-400" />,
    bg: 'from-red-900/20 to-orange-600/10',
    border: 'border-red-400/30',
    text: 'text-red-300',
    gradient: 'from-red-500/10 to-orange-500/10',
  },
}

// Défauts pour les types non listés
const defaultStyle = {
  icon: <Sparkles size={20} className="text-gold-400" />,
  bg: 'from-gold-900/20 to-gold-600/10',
  border: 'border-gold-400/30',
  text: 'text-gold-300',
  gradient: 'from-gold-500/10 to-amber-500/10',
}

// Récupère les catégories visitées depuis localStorage
function getVisitedCategories(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('gercie_visited_categories')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// Enregistre une catégorie visitée
function recordVisitedCategory(category: string) {
  if (typeof window === 'undefined') return
  const current = getVisitedCategories()
  const updated = [category, ...current.filter(c => c !== category)].slice(0, 10)
  localStorage.setItem('gercie_visited_categories', JSON.stringify(updated))
}

export function Recommendations({
  type = 'trending',
  title,
  description,
  products: propProducts,
  maxItems = 5,
  seeMoreUrl,
  className,
  onRefresh,
  cardVariant = 'standard',
  carousel = true,
  category,
  similarToProductId,
  hideHeader = false,
  showCategoryFilter = false,
  reason,
  showTimer = false,
}: RecommendationsProps) {
  const { user } = useAuth()
  const pathname = usePathname()
  const [products, setProducts] = useState<Product[]>(propProducts ?? [])
  const [loading, setLoading] = useState(!propProducts)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [categories, setCategories] = useState<string[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const style = typeStyles[type] || defaultStyle

  const showNotConnected = type === 'ai-personalized' && !user
  const isForYou = type === 'for-you'
  const isTrending = type === 'trending'

  // Chargement intelligent des données
  const fetchData = useCallback(async () => {
    if (showNotConnected) {
      setProducts([])
      setLoading(false)
      return
    }
    if (propProducts) {
      setProducts(propProducts)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      let url = `/api/recommendations?type=${type}&limit=${maxItems}`
      if (category) url += `&category=${encodeURIComponent(category)}`
      if (similarToProductId) url += `&product_id=${similarToProductId}`

      const res = await fetch(url)
      if (!res.ok) throw new Error('Erreur lors du chargement des recommandations')
      const data = await res.json()

      // Fallback : si l'API ne renvoie rien, on utilise les meilleures ventes
      if (!data || data.length === 0) {
        const fallbackRes = await fetch(`/api/produits?sort_by=total_ventes&limit=${maxItems}&est_actif=true`)
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json()
          setProducts(fallbackData.data?.slice(0, maxItems) || [])
        } else {
          setProducts([])
        }
        return
      }

      setProducts(data.slice(0, maxItems))

      // Extraire les catégories pour le filtre
      if (showCategoryFilter) {
        const cats = [...new Set(data.map((p: Product) => p.categorie).filter(Boolean))] as string[]
        setCategories(cats)
      }
    } catch (err: any) {
      setError(err.message || 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [type, maxItems, propProducts, showNotConnected, category, similarToProductId, showCategoryFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData, retryCount])

  const handleRetry = () => setRetryCount(c => c + 1)

  // Navigation du carousel
  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return
    const scrollAmount = 320
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  // Filtrage par catégorie (local, simple)
  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all' || !showCategoryFilter) return products
    return products.filter(p => p.categorie === selectedCategory)
  }, [products, selectedCategory, showCategoryFilter])

  // Titre intelligent pour "Recommandé pour vous"
  const dynamicTitle = useMemo(() => {
    if (title) return title
    if (type === 'for-you') {
      if (reason) return reason
      const visitedCats = getVisitedCategories()
      if (visitedCats.length > 0) {
        return `Inspiré par vos goûts`
      }
      return 'Recommandé pour vous'
    }
    if (type === 'trending') return 'Tendances du moment'
    if (type === 'best-sellers') return 'Meilleures ventes'
    if (type === 'new-arrivals') return 'Nouveautés'
    return 'Recommandations'
  }, [title, type, reason])

  const dynamicDescription = useMemo(() => {
    if (description) return description
    if (type === 'for-you') {
      const visitedCats = getVisitedCategories()
      if (visitedCats.length > 0) {
        return `Basé sur vos recherches récentes dans ${visitedCats.slice(0, 2).join(', ')}`
      }
      return 'Des produits sélectionnés pour vous'
    }
    if (type === 'trending') return 'Les produits les plus populaires en ce moment'
    return ''
  }, [description, type])

  // ----- État non connecté pour for-you -----
  if (showNotConnected) {
    return (
      <section className={cn('py-16 md:py-20 bg-neutral-50/50 dark:bg-midnight-900/30', className)}>
        <Container>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col items-center text-center max-w-md mx-auto"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400/20 to-pink-400/10 flex items-center justify-center mb-6 border border-purple-400/30">
              <Sparkles size={32} className="text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-serif mb-2">
              Des recommandations rien que pour vous
            </h2>
            <p className="text-neutral-500 dark:text-neutral-400 mb-8">
              Connectez‑vous ou créez un compte pour recevoir des suggestions personnalisées basées sur vos goûts et votre historique.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href={`/login?redirect=${encodeURIComponent(pathname)}`}>
                <Button variant="luxe" leftIcon={<LogIn size={18} />} size="lg">
                  Se connecter
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="outline-gold" leftIcon={<UserPlus size={18} />} size="lg">
                  Créer un compte
                </Button>
              </Link>
            </div>
          </motion.div>
        </Container>
      </section>
    )
  }

  if (!loading && filteredProducts.length === 0 && !error) return null

  return (
    <section
      className={cn(
        'py-16 md:py-20 relative overflow-hidden',
        'bg-gradient-to-br', style.bg,
        className
      )}
    >
      {/* Décoration de fond */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-20" style={{ color: style.border.split('border-')[1]?.split('-')[0] || 'gold' }} />

      <Container>
        {/* En-tête */}
        {!hideHeader && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row sm:items-end justify-between mb-10"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border ${style.border}`}>
                  {style.icon}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">
                  {dynamicTitle}
                </h2>
                {type === 'trending' && (
                  <Badge variant="danger" size="sm" className="animate-pulse">
                    <Flame size={12} className="mr-1" /> Chaud
                  </Badge>
                )}
                {type === 'for-you' && (
                  <Badge variant="accent" size="sm">
                    <Sparkles size={12} className="mr-1" /> Pour vous
                  </Badge>
                )}
              </div>
              {dynamicDescription && (
                <p className="text-neutral-500 dark:text-neutral-400 text-sm md:text-base mt-1">
                  {dynamicDescription}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 mt-4 sm:mt-0">
              {onRefresh && (
                <Tooltip content="Actualiser les recommandations">
                  <Button variant="ghost" size="sm" onClick={onRefresh} leftIcon={<RefreshCw size={14} />}>
                    Actualiser
                  </Button>
                </Tooltip>
              )}
              {showCategoryFilter && categories.length > 1 && (
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  <option value="all">Toutes catégories</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
              {seeMoreUrl && products.length > 0 && (
                <Link href={seeMoreUrl} className="group flex items-center text-sm font-medium text-gold-600 dark:text-gold-400 hover:underline">
                  Voir tout
                  <ChevronRight size={16} className="ml-1 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
            </div>
          </motion.div>
        )}

        {/* États chargement / erreur */}
        {loading && (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {Array.from({ length: maxItems }).map((_, i) => (
              <div key={i} className="min-w-[220px] md:min-w-[250px] flex-shrink-0">
                <div className="bg-white dark:bg-midnight-800/40 rounded-2xl p-4 shadow-card">
                  <Skeleton variant="rectangular" className="w-full aspect-square rounded-xl mb-3" shimmer shimmerVariant="gold" />
                  <Skeleton variant="text" className="w-3/4 mb-2" shimmer shimmerVariant="gold" />
                  <Skeleton variant="text" className="w-1/2" shimmer shimmerVariant="gold" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-burgundy-50 dark:bg-burgundy-900/20 rounded-2xl p-8 max-w-md border border-burgundy-200 dark:border-burgundy-800">
              <AlertTriangle className="mx-auto text-burgundy-500 mb-4" size={32} />
              <p className="text-burgundy-700 dark:text-burgundy-300 text-sm mb-4">{error}</p>
              <Button variant="danger" size="sm" onClick={handleRetry} leftIcon={<RefreshCw size={16} />}>
                Réessayer
              </Button>
            </div>
          </div>
        )}

        {/* Produits */}
        {!loading && !error && filteredProducts.length > 0 && (
          <div className="relative group">
            {carousel && filteredProducts.length > 2 && (
              <>
                <button
                  onClick={() => scroll('left')}
                  className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 dark:bg-neutral-800/90 shadow-xl hover:bg-gold-100 transition opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0"
                  aria-label="Défiler à gauche"
                >
                  <ArrowLeft size={18} className="text-neutral-600" />
                </button>
                <button
                  onClick={() => scroll('right')}
                  className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 dark:bg-neutral-800/90 shadow-xl hover:bg-gold-100 transition opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0"
                  aria-label="Défiler à droite"
                >
                  <ArrowRight size={18} className="text-neutral-600" />
                </button>
              </>
            )}
            <div
              ref={scrollContainerRef}
              className={cn(
                'flex overflow-x-auto gap-4 pb-4 scrollbar-hide snap-x snap-mandatory',
                'md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-6 md:overflow-visible md:pb-0 md:snap-none'
              )}
            >
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="min-w-[220px] md:min-w-0 flex-shrink-0 w-[220px] md:w-auto snap-start"
                >
                  <ProductCard
                    product={product}
                    variant={cardVariant === 'compact' ? 'grid' : 'grid'}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Bouton "Voir plus" si pas de seeMoreUrl */}
        {!seeMoreUrl && products.length > maxItems && (
          <div className="text-center mt-6">
            <Button variant="outline-gold" size="sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Voir plus de recommandations
              <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        )}
      </Container>
    </section>
  )
}