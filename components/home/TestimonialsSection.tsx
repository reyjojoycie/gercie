// components/TestimonialsSection.tsx
'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useQuery } from '@tanstack/react-query'
import {
  Star, ChevronLeft, ChevronRight, Quote, ShieldCheck,
  ThumbsUp, MessageCircle, RefreshCcw, AlertTriangle, ArrowRight,
  Filter, ExternalLink, Pin, ArrowUp, ArrowDown, PlusCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
interface Testimonial {
  id: string
  name: string
  role?: string
  avatar?: string
  text: string
  rating: number
  date?: string
  produit?: string
  verified?: boolean
  likes?: number
  admin_response?: string | null
  is_featured?: boolean
}

interface TestimonialsApiResponse {
  success: boolean
  data: Testimonial[]
  meta?: {
    total: number
    page: number
    limit: number
    totalPages: number
    stats?: {
      totalPublished: number
      avgRating: string
    }
  }
}

/* ========================================================================== */
/*  Sous‑composant : Carte témoignage                                         */
/* ========================================================================== */
function TestimonialCard({ testimonial, index }: { testimonial: Testimonial; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      className="bg-card p-6 rounded-2xl shadow-card border border-border hover:border-gold-400/40 transition-all duration-300 flex flex-col h-full group relative"
    >
      {/* Indicateur "Mis en avant" */}
      {testimonial.is_featured && (
        <div className="absolute top-3 right-3">
          <Tooltip content="Mis en avant">
            <Pin size={14} className="text-gold-500" />
          </Tooltip>
        </div>
      )}

      {/* En‑tête avec avatar et nom */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-100 to-amber-100 dark:from-gold-900/30 dark:to-amber-900/20 flex items-center justify-center text-gold-700 dark:text-gold-300 font-bold text-sm border border-gold-400/20 flex-shrink-0">
          {testimonial.avatar ? (
            <img src={testimonial.avatar} alt={testimonial.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            testimonial.name.split(' ').map(n => n[0]).join('')
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="font-semibold text-foreground truncate">{testimonial.name}</p>
            {testimonial.verified && (
              <Tooltip content="Achat vérifié">
                <ShieldCheck size={14} className="text-gold-500 flex-shrink-0" />
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{testimonial.role || 'Client'}</span>
            {testimonial.date && (
              <>
                <span>•</span>
                <span>{new Date(testimonial.date).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })}</span>
              </>
            )}
          </div>
        </div>
        <Badge variant="gold" size="sm" className="flex items-center gap-0.5 flex-shrink-0">
          <Star size={12} className="fill-gold-500 text-gold-500" />
          {testimonial.rating.toFixed(1)}
        </Badge>
      </div>

      {/* Étoiles */}
      <div className="flex items-center gap-0.5 mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={14}
            className={i < Math.round(testimonial.rating) ? 'text-amber-500 fill-amber-500' : 'text-neutral-300 dark:text-neutral-600'}
          />
        ))}
      </div>

      {/* Citation */}
      <div className="flex-1">
        <Quote size={18} className="text-gold-400/50 mb-2 rotate-180" />
        <p className="text-muted-foreground italic leading-relaxed line-clamp-4 group-hover:line-clamp-none transition-all duration-300">
          « {testimonial.text} »
        </p>
      </div>

      {/* Réponse admin (si présente) */}
      {testimonial.admin_response && (
        <div className="mt-3 pt-3 border-t border-border border-dashed">
          <div className="flex items-start gap-2">
            <ShieldCheck size={14} className="text-gold-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-gold-600 dark:text-gold-400">Réponse de Gercie :</span>{' '}
              {testimonial.admin_response}
            </div>
          </div>
        </div>
      )}

      {/* Pied : likes et produit */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <ThumbsUp size={12} />
          {testimonial.likes || 0}
        </span>
        {testimonial.produit && (
          <span className="truncate max-w-[120px]">
            {testimonial.produit}
          </span>
        )}
      </div>
    </motion.div>
  )
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */
export default function TestimonialsSection() {
  const [page, setPage] = useState(1)
  const [filterRating, setFilterRating] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid')
  const [sortBy, setSortBy] = useState<'date' | 'rating'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const perPage = 6

  // Récupération depuis l'API publique (uniquement les témoignages publiés)
  const {
    data: apiResponse,
    isLoading,
    isError,
    refetch
  } = useQuery<TestimonialsApiResponse>({
    queryKey: ['testimonials-home', page, filterRating, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', String(perPage))
      params.set('page', String(page))
      if (filterRating) params.set('ratingMin', String(filterRating))
      params.set('sort', sortBy)
      params.set('order', sortOrder)
      const res = await fetch(`/api/testimonials?${params.toString()}`)
      if (!res.ok) throw new Error('Erreur serveur')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const testimonials = apiResponse?.data ?? []
  const meta = apiResponse?.meta
  const totalItems = meta?.total ?? 0
  const totalPages = meta?.totalPages ?? 1
  const avgRating = meta?.stats?.avgRating ?? '0.0'

  // Chargement initial
  if (isLoading && !apiResponse) {
    return (
      <section className="py-12 md:py-16 bg-secondary/20">
        <Container>
          <div className="text-center mb-10">
            <Skeleton variant="text" className="w-64 h-8 mx-auto" shimmer shimmerVariant="gold" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-6 space-y-3 border border-border">
                <Skeleton variant="circular" className="w-10 h-10" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-3/4 h-4" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-full h-16" shimmer shimmerVariant="gold" />
              </div>
            ))}
          </div>
        </Container>
      </section>
    )
  }

  return (
    <section className="py-12 md:py-16 bg-secondary/20 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-400/40 to-transparent" />

      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-100 dark:bg-gold-900/30 border border-gold-400/30 mb-4">
            <MessageCircle size={16} className="text-gold-600" />
            <span className="text-sm font-medium text-gold-700 dark:text-gold-300">Avis clients</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground font-serif">
            Ce que disent nos clients
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            Note moyenne de <span className="font-bold text-gold-600">{avgRating}/5</span> basée sur{' '}
            <span className="font-bold">{totalItems} avis</span>.
          </p>

          {/* Contrôles : filtres + tri + vue */}
          <div className="flex items-center gap-2 justify-center mt-4 flex-wrap">
            {[null, 5, 4, 3].map(rating => (
              <button
                key={rating ?? 'all'}
                onClick={() => { setFilterRating(rating); setPage(1) }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition border',
                  filterRating === rating
                    ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm'
                    : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                )}
              >
                {rating === null ? 'Tous les avis' : `${rating} étoiles`}
              </button>
            ))}

            {/* Tri */}
            <div className="flex items-center gap-1 ml-2">
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as any); setPage(1) }}
                className="bg-card border border-border rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gold-400"
              >
                <option value="date">Date</option>
                <option value="rating">Note</option>
              </select>
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-gold-500"
                title={sortOrder === 'asc' ? 'Croissant' : 'Décroissant'}
              >
                {sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              </button>
            </div>

            {/* Vue */}
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'carousel' : 'grid')}
              className="ml-auto p-1.5 rounded-lg border border-border text-muted-foreground hover:text-gold-500 hover:border-gold-400/50 transition-colors"
              title={viewMode === 'grid' ? 'Vue carrousel' : 'Vue grille'}
            >
              {viewMode === 'grid' ? <ArrowRight size={16} /> : <Filter size={16} />}
            </button>
          </div>
        </motion.div>

        {/* Erreur */}
        {isError && (
          <div className="text-center py-8">
            <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
            <p className="text-muted-foreground mb-4">Impossible de charger les avis.</p>
            <Button variant="outline-gold" onClick={() => refetch()}>
              <RefreshCcw size={14} className="mr-1" /> Réessayer
            </Button>
          </div>
        )}

        {/* Aucun résultat */}
        {!isError && testimonials.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircle size={48} className="mx-auto mb-4 text-neutral-300" />
            <p>Aucun avis trouvé avec ces critères.</p>
          </div>
        )}

        {/* Grille d'avis */}
        {!isError && testimonials.length > 0 && viewMode === 'grid' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {testimonials.map((t, idx) => (
                <TestimonialCard key={t.id} testimonial={t} index={idx} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Carrousel horizontal */}
        {!isError && testimonials.length > 0 && viewMode === 'carousel' && (
          <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
            {testimonials.map((t, idx) => (
              <div key={t.id} className="min-w-[300px] w-[300px] flex-shrink-0 snap-start">
                <TestimonialCard testimonial={t} index={idx} />
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8">
            <span className="text-xs text-muted-foreground">
              Affichage de {Math.min((page - 1) * perPage + 1, totalItems)}–{Math.min(page * perPage, totalItems)} sur {totalItems} avis
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline-gold"
                size="icon"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline-gold"
                size="icon"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Liens */}
        <div className="flex justify-center gap-4 mt-8">
          <a href="/avis" className="inline-flex items-center gap-1 text-sm font-medium text-gold-600 hover:text-gold-500">
            Voir tous les avis <ExternalLink size={14} />
          </a>
          <a
            href="/avis/ajouter"
            className="inline-flex items-center gap-1 text-sm font-medium text-gold-600 hover:text-gold-500"
          >
            <PlusCircle size={14} /> Laisser un avis
          </a>
        </div>
      </Container>
    </section>
  )
}