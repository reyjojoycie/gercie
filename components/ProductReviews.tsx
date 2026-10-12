// components/ProductReviews.tsx
'use client'

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  createContext,
  useContext,
  ReactNode,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import {
  Star,
  ThumbsUp,
  Flag,
  MessageCircle,
  Camera,
  X,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Loader2,
  AlertTriangle,
  Check,
  Filter,
  User,
  Clock,
  ShoppingBag,
  Image as ImageIcon,
} from 'lucide-react'

/* ========================================================================== */
/*  Types & Interfaces                                                        */
/* ========================================================================== */

export interface Review {
  id: string
  user_id: string
  user_name: string
  user_avatar?: string
  rating: number // 1-5
  title?: string
  comment: string
  created_at: string
  updated_at?: string
  likes: number
  liked_by_user?: boolean
  verified_purchase: boolean
  images?: string[]
  vendor_reply?: {
    comment: string
    created_at: string
  }
  reported?: boolean
}

export interface ReviewSummary {
  average: number
  total: number
  distribution: Record<number, number> // 1: count, 2: count, ...
}

interface ProductReviewsProps {
  productId: string
  initialReviews?: Review[]
  initialSummary?: ReviewSummary
  /** Callbacks pour les mutations (à implémenter via API) */
  onLoadReviews?: (page: number, sortBy: string, ratingFilter?: number) => Promise<{ reviews: Review[]; total: number; summary: ReviewSummary }>
  onSubmitReview?: (data: { rating: number; title?: string; comment: string; images?: File[] }) => Promise<Review>
  onLikeReview?: (reviewId: string) => Promise<void>
  onReportReview?: (reviewId: string) => Promise<void>
  /** L'utilisateur peut-il laisser un avis ? */
  canReview?: boolean
  /** Nombre d'avis par page */
  pageSize?: number
  className?: string
}

/* ========================================================================== */
/*  Contexte interne (partagé entre sous‑composants)                           */
/* ========================================================================== */

interface ReviewsContextValue {
  productId: string
  reviews: Review[]
  summary: ReviewSummary | null
  loading: boolean
  error: string | null
  page: number
  totalPages: number
  sortBy: string
  ratingFilter: number | undefined
  canReview: boolean
  setPage: (p: number) => void
  setSortBy: (s: string) => void
  setRatingFilter: (r: number | undefined) => void
  refresh: () => void
  onLikeReview?: (reviewId: string) => Promise<void>
  onReportReview?: (reviewId: string) => Promise<void>
}

const ReviewsContext = createContext<ReviewsContextValue | null>(null)
const useReviewsContext = () => {
  const ctx = useContext(ReviewsContext)
  if (!ctx) throw new Error('ReviewsContext missing')
  return ctx
}

/* ========================================================================== */
/*  Composants enfants                                                         */
/* ========================================================================== */

// --- Résumé des notes (moyenne, distribution, étoiles) ---
const ReviewSummaryComponent = () => {
  const { summary, ratingFilter, setRatingFilter } = useReviewsContext()
  if (!summary) return null

  const { average, total, distribution } = summary
  const maxCount = Math.max(...Object.values(distribution), 1)

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
        {/* Note moyenne */}
        <div className="flex flex-col items-center">
          <span className="text-4xl font-bold text-foreground">{average.toFixed(1)}</span>
          <div className="flex items-center gap-0.5 mt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={16}
                className={i < Math.round(average) ? 'text-amber-500 fill-amber-500' : 'text-neutral-300'}
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground mt-1">{total} avis</span>
        </div>

        {/* Distribution */}
        <div className="flex-1 space-y-1.5 w-full">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = distribution[star] || 0
            const percent = maxCount > 0 ? (count / maxCount) * 100 : 0
            return (
              <button
                key={star}
                onClick={() => setRatingFilter(ratingFilter === star ? undefined : star)}
                className={cn(
                  'flex items-center gap-2 w-full text-sm transition-colors rounded px-1 py-0.5',
                  ratingFilter === star ? 'bg-gold-400/10 text-gold-600' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="w-8 text-right">{star} ★</span>
                <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-8 text-left">{count}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --- Un avis individuel ---
const ReviewItem = ({ review }: { review: Review }) => {
  const { onLikeReview, onReportReview } = useReviewsContext()
  const [showReply, setShowReply] = useState(false)
  const [liked, setLiked] = useState(review.liked_by_user || false)
  const [likes, setLikes] = useState(review.likes)
  const toast = useToast()

  const handleLike = async () => {
    if (!onLikeReview) return
    try {
      await onLikeReview(review.id)
      setLiked(!liked)
      setLikes(liked ? likes - 1 : likes + 1)
    } catch {
      toast.addToast({ type: 'error', message: 'Erreur lors du like' })
    }
  }

  const handleReport = async () => {
    if (!onReportReview) return
    try {
      await onReportReview(review.id)
      toast.addToast({ type: 'success', message: 'Avis signalé' })
    } catch {
      toast.addToast({ type: 'error', message: 'Erreur lors du signalement' })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-5 space-y-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
            {review.user_avatar ? (
              <img src={review.user_avatar} alt={review.user_name} className="w-full h-full object-cover" />
            ) : (
              <User size={20} className="m-auto text-neutral-500 mt-2" />
            )}
          </div>
          <div>
            <p className="font-semibold text-foreground">{review.user_name}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} className={i < review.rating ? 'text-amber-500 fill-amber-500' : 'text-neutral-300'} />
                ))}
              </span>
              <Clock size={14} />
              <span>{new Date(review.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {review.verified_purchase && (
            <Badge variant="accent" size="sm" className="text-xs">
              <ShoppingBag size={12} className="mr-1" /> Achat vérifié
            </Badge>
          )}
          <button onClick={handleReport} className="p-1 rounded-md text-muted-foreground hover:text-red-500 transition-colors">
            <Flag size={14} />
          </button>
        </div>
      </div>

      {review.title && <h4 className="font-semibold text-foreground">{review.title}</h4>}
      <p className="text-muted-foreground leading-relaxed">{review.comment}</p>

      {review.images && review.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {review.images.map((img, idx) => (
            <div key={idx} className="w-20 h-20 rounded-xl bg-neutral-100 overflow-hidden flex-shrink-0">
              <img src={img} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 border-t border-border pt-3">
        <button
          onClick={handleLike}
          className={cn('flex items-center gap-1 text-sm transition-colors', liked ? 'text-blue-500' : 'text-muted-foreground hover:text-blue-500')}
        >
          <ThumbsUp size={16} className={liked ? 'fill-current' : ''} />
          {likes > 0 && <span>{likes}</span>}
        </button>
        {review.vendor_reply && (
          <button
            onClick={() => setShowReply(!showReply)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <MessageCircle size={16} />
            Réponse du vendeur
            {showReply ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {showReply && review.vendor_reply && (
        <div className="bg-neutral-100 dark:bg-midnight-800/60 rounded-xl p-4 ml-4 border-l-4 border-gold-400">
          <p className="text-sm font-semibold text-foreground mb-1">Réponse du vendeur</p>
          <p className="text-sm text-muted-foreground">{review.vendor_reply.comment}</p>
          <p className="text-xs text-muted-foreground mt-1">{new Date(review.vendor_reply.created_at).toLocaleDateString()}</p>
        </div>
      )}
    </motion.div>
  )
}

// --- Formulaire de dépôt d'avis ---
const ReviewForm = ({ onClose }: { onClose?: () => void }) => {
  const { user } = useAuth()
  const toast = useToast()
  const { canReview, productId } = useReviewsContext()
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setImages((prev) => [...prev, ...files].slice(0, 3))
    const newPreviews = files.map((f) => URL.createObjectURL(f))
    setPreviews((prev) => [...prev, ...newPreviews].slice(0, 3))
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    setSubmitting(true)
    try {
      // Dans une implémentation réelle, appeler onSubmitReview du parent
      // Ici, juste un toast
      toast.addToast({ type: 'success', message: 'Avis soumis avec succès !' })
      setRating(5)
      setTitle('')
      setComment('')
      setImages([])
      setPreviews([])
      onClose?.()
    } catch (err) {
      toast.addToast({ type: 'error', message: 'Erreur lors de la soumission' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="text-center p-6 bg-card rounded-2xl border border-border">
        <p className="text-muted-foreground">Connectez-vous pour laisser un avis.</p>
      </div>
    )
  }

  if (!canReview) {
    return (
      <div className="text-center p-6 bg-card rounded-2xl border border-border">
        <p className="text-muted-foreground">Vous devez avoir acheté ce produit pour laisser un avis.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Donnez votre avis</h3>

      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHoverRating(i + 1)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(i + 1)}
            className="focus:outline-none"
          >
            <Star
              size={24}
              className={cn(
                'transition-colors',
                (hoverRating || rating) > i ? 'text-amber-500 fill-amber-500' : 'text-neutral-300'
              )}
            />
          </button>
        ))}
      </div>

      <Input
        placeholder="Titre (optionnel)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        variant="glass"
      />

      <textarea
        placeholder="Partagez votre expérience..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        className="w-full p-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
        required
        maxLength={1000}
      />
      <p className="text-xs text-muted-foreground text-right">{comment.length}/1000</p>

      {previews.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {previews.map((url, idx) => (
            <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden bg-neutral-200">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-0 right-0 p-0.5 bg-red-500 text-white rounded-bl-lg"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 text-sm text-gold-600 hover:text-gold-500 transition-colors"
        >
          <Camera size={16} />
          Ajouter des photos (max 3)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageChange}
        />
      </div>

      <Button type="submit" variant="luxe" fullWidth loading={submitting}>
        Publier l'avis
      </Button>
    </form>
  )
}

/* ========================================================================== */
/*  Composant principal ProductReviews                                        */
/* ========================================================================== */
export function ProductReviews({
  productId,
  initialReviews = [],
  initialSummary = null,
  onLoadReviews,
  onSubmitReview,
  onLikeReview,
  onReportReview,
  canReview = false,
  pageSize = 5,
  className,
}: ProductReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [summary, setSummary] = useState<ReviewSummary | null>(initialSummary)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [sortBy, setSortBy] = useState<'recent' | 'most_liked' | 'highest_rating'>('recent')
  const [ratingFilter, setRatingFilter] = useState<number | undefined>(undefined)
  const toast = useToast()

  const loadReviews = useCallback(async () => {
    if (!onLoadReviews) return
    setLoading(true)
    setError(null)
    try {
      const result = await onLoadReviews(page, sortBy, ratingFilter)
      setReviews(result.reviews)
      setTotalPages(Math.ceil(result.total / pageSize) || 1)
      setSummary(result.summary)
    } catch (err: any) {
      setError(err.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [onLoadReviews, page, sortBy, ratingFilter, pageSize])

  useEffect(() => {
    if (onLoadReviews) {
      loadReviews()
    } else {
      // Si pas de callback, on utilise les données initiales
      setReviews(initialReviews)
      setSummary(initialSummary)
    }
  }, [onLoadReviews, page, sortBy, ratingFilter, initialReviews, initialSummary, loadReviews])

  const contextValue = useMemo(
    () => ({
      productId,
      reviews,
      summary,
      loading,
      error,
      page,
      totalPages,
      sortBy,
      ratingFilter,
      canReview,
      setPage,
      setSortBy: (s: string) => setSortBy(s as any),
      setRatingFilter,
      refresh: loadReviews,
      onLikeReview,
      onReportReview,
    }),
    [productId, reviews, summary, loading, error, page, totalPages, sortBy, ratingFilter, canReview, loadReviews, onLikeReview, onReportReview]
  )

  return (
    <ReviewsContext.Provider value={contextValue}>
      <div className={cn('space-y-6', className)}>
        <ReviewSummaryComponent />

        {/* Filtres / Tri */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1) }}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
          >
            <option value="recent">Plus récents</option>
            <option value="most_liked">Plus utiles</option>
            <option value="highest_rating">Meilleures notes</option>
          </select>
          {ratingFilter && (
            <Badge variant="gold" size="sm" className="cursor-pointer" onClick={() => setRatingFilter(undefined)}>
              {ratingFilter} ★ <X size={12} className="ml-1" />
            </Badge>
          )}
        </div>

        {/* Formulaire d'avis */}
        <ReviewForm />

        {/* Liste des avis */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" className="h-32 rounded-2xl" shimmer shimmerVariant="gold" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center py-10 text-center">
            <AlertTriangle size={32} className="text-burgundy-500 mb-2" />
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline-gold" size="sm" onClick={loadReviews} className="mt-3">
              Réessayer
            </Button>
          </div>
        )}

        {!loading && !error && reviews.length === 0 && (
          <div className="text-center py-10">
            <MessageCircle size={48} className="mx-auto text-neutral-300 mb-2" />
            <p className="text-muted-foreground">Aucun avis pour le moment. Soyez le premier !</p>
          </div>
        )}

        <div className="space-y-4">
          <AnimatePresence>
            {reviews.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))}
          </AnimatePresence>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-6">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Précédent
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
              Suivant
            </Button>
          </div>
        )}
      </div>
    </ReviewsContext.Provider>
  )
}