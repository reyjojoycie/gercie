// components/home/TestimonialsSection.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import Link from 'next/link'

import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Container } from '@/components/layout/Container'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Pin,
  Plus,
  Quote,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Star,
  ThumbsUp,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  normalizeTestimonial,
  type Testimonial,
} from '@/lib/testimonials'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface TestimonialsApiResponse {
  success: boolean
  data: Testimonial[]
  meta?: {
    total: number
    page: number
    limit: number
    totalPages: number
    stats?: {
      totalPublished?: number
      avgRating?: string
      distribution?: Record<string, number>
      products?: string[]
    }
  }
}

interface ReviewFormState {
  name: string
  text: string
  rating: number
  product: string
  email: string
  website: string
}

interface ActionButtonProps {
  children: ReactNode
  onClick?: () => void
  buttonType?: 'button' | 'submit' | 'reset'
  loading?: boolean
  icon?: ReactNode
  className?: string
  disabled?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function notifyToast(
  toast: any,
  type: 'success' | 'error' | 'info' | 'warning',
  message: string
): void {
  if (typeof toast?.addToast === 'function') {
    toast.addToast({ type, message })
    return
  }

  if (typeof toast?.show === 'function') {
    toast.show({ type, message })
  }
}

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return 'G'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function formatDate(date?: string | null): string {
  if (!date) return ''

  try {
    return new Date(date).toLocaleDateString('fr-FR', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BUTTONS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const primaryButtonClasses = cn(
  'inline-flex h-10 items-center justify-center gap-2 rounded-control px-4',
  'bg-accent text-accent-contrast shadow-card',
  'text-sm font-semibold',
  'transition-colors duration-200 motion-reduce:transition-none',
  'hover:bg-accent-hover',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
  'disabled:pointer-events-none disabled:opacity-60'
)

const secondaryButtonClasses = cn(
  'inline-flex h-10 items-center justify-center gap-2 rounded-control px-4',
  'border border-line bg-surface text-fg shadow-card',
  'text-sm font-semibold',
  'transition-colors duration-200 motion-reduce:transition-none',
  'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
  'disabled:pointer-events-none disabled:opacity-60'
)

function PrimaryButton({
  children,
  onClick,
  buttonType = 'button',
  loading = false,
  icon,
  className,
  disabled = false,
}: ActionButtonProps) {
  return (
    <button
      type={buttonType}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(primaryButtonClasses, className)}
    >
      {loading ? (
        <Loader2
          size={16}
          className="motion-safe:animate-spin"
          aria-hidden="true"
        />
      ) : (
        icon
      )}

      <span>{children}</span>
    </button>
  )
}

function SecondaryButton({
  children,
  onClick,
  buttonType = 'button',
  loading = false,
  icon,
  className,
  disabled = false,
}: ActionButtonProps) {
  return (
    <button
      type={buttonType}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(secondaryButtonClasses, className)}
    >
      {loading ? (
        <Loader2
          size={16}
          className="motion-safe:animate-spin"
          aria-hidden="true"
        />
      ) : (
        icon
      )}

      <span>{children}</span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STAR ROW                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function StarRow({
  rating,
  size = 14,
}: {
  rating: number
  size?: number
}) {
  const rounded = Math.round(rating)

  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`Note ${rounded} sur 5`}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          size={size}
          className={cn(
            index < rounded
              ? 'fill-accent text-accent'
              : 'text-fg-subtle'
          )}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TESTIMONIAL CARD                                               */
/* ═══════════════════════════════════════════════════════════════ */

function TestimonialCard({
  testimonial,
  index,
  showLikes,
  onLike,
  isLiking,
  onShare,
}: {
  testimonial: Testimonial
  index: number
  showLikes: boolean
  onLike: (id: string) => void
  isLiking: boolean
  onShare: (testimonial: Testimonial) => void
}) {
  const { prefersReducedMotion } = useAccessibilityPreferences()

  return (
    <motion.article
      initial={
        prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 18 }
      }
      whileInView={
        prefersReducedMotion ? undefined : { opacity: 1, y: 0 }
      }
      viewport={{ once: true, margin: '-50px' }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.35,
        delay: prefersReducedMotion ? 0 : Math.min(index * 0.04, 0.25),
        ease: 'easeOut',
      }}
      whileHover={prefersReducedMotion ? undefined : { y: -4 }}
      className={cn(
        'group relative flex h-full flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:p-6',
        'transition-all duration-200 motion-reduce:transition-none',
        'hover:border-line-strong hover:shadow-card-hover'
      )}
    >
      {testimonial.is_featured ? (
        <div className="absolute right-3 top-3">
          <Tooltip content="Mis en avant">
            <span
              role="img"
              aria-label="Avis mis en avant"
              className="inline-flex text-accent"
            >
              <Pin size={14} aria-hidden="true" />
            </span>
          </Tooltip>
        </div>
      ) : null}

      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-pill border border-line bg-muted text-sm font-bold text-fg">
          {testimonial.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={testimonial.avatar}
              alt={testimonial.name}
              className="h-full w-full rounded-pill object-cover"
            />
          ) : (
            getInitials(testimonial.name)
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate text-sm font-semibold text-fg">
              {testimonial.name}
            </p>

            {testimonial.verified ? (
              <Tooltip content="Achat vérifié">
                <span
                  role="img"
                  aria-label="Achat vérifié"
                  className="inline-flex shrink-0 text-accent"
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                </span>
              </Tooltip>
            ) : null}
          </div>

          <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
            <span className="truncate">
              {testimonial.role || 'Client'}
            </span>

            {testimonial.date ? (
              <>
                <span aria-hidden="true">•</span>
                <span>{formatDate(testimonial.date)}</span>
              </>
            ) : null}
          </div>
        </div>

        <Badge
          variant="accent"
          size="sm"
          className="shrink-0"
        >
          <Star
            size={12}
            className="fill-current"
            aria-hidden="true"
          />
          {testimonial.rating.toFixed(1)}
        </Badge>
      </div>

      <StarRow rating={testimonial.rating} />

      <div className="mt-3 flex-1">
        <Quote
          size={18}
          className="mb-2 rotate-180 text-accent opacity-50"
          aria-hidden="true"
        />

        <p className="line-clamp-4 text-sm italic leading-relaxed text-fg-muted transition-all duration-200 group-hover:line-clamp-none motion-reduce:transition-none">
          « {testimonial.text} »
        </p>
      </div>

      {testimonial.admin_response ? (
        <div className="mt-3 border-t border-dashed border-line pt-3">
          <div className="flex items-start gap-2">
            <ShieldCheck
              size={14}
              className="mt-0.5 shrink-0 text-accent"
              aria-hidden="true"
            />

            <div className="text-xs leading-relaxed text-fg-muted">
              <span className="font-semibold text-fg">
                Réponse de Gercie :
              </span>{' '}
              {testimonial.admin_response}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-fg-muted">
        <div className="flex min-w-0 items-center gap-2">
          {showLikes ? (
            <button
              type="button"
              onClick={() => onLike(testimonial.id)}
              disabled={isLiking}
              className={cn(
                'inline-flex items-center gap-1 rounded-pill border border-line px-2 py-1',
                'text-fg-muted transition-colors duration-200 motion-reduce:transition-none',
                'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'disabled:pointer-events-none disabled:opacity-60'
              )}
              aria-label={
                testimonial.produit
                  ? `Trouver utile l'avis sur ${testimonial.produit}`
                  : 'Trouver cet avis utile'
              }
            >
              {isLiking ? (
                <Loader2
                  size={12}
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ThumbsUp size={12} aria-hidden="true" />
              )}

              <span className="tabular-nums">
                {testimonial.likes || 0}
              </span>
            </button>
          ) : null}

          {testimonial.produit ? (
            <span className="max-w-[140px] truncate text-fg-subtle">
              {testimonial.produit}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onShare(testimonial)}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-pill',
            'text-fg-muted transition-colors duration-200 motion-reduce:transition-none',
            'hover:bg-muted hover:text-accent',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          )}
          aria-label="Partager cet avis"
        >
          <ExternalLink size={14} aria-hidden="true" />
        </button>
      </div>
    </motion.article>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  REVIEW MODAL                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function ReviewModal({
  onClose,
  onSuccess,
  productSuggestions = [],
}: {
  onClose: () => void
  onSuccess: () => void
  productSuggestions?: string[]
}) {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const toast = useToast() as any

  const nameRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  const [form, setForm] = useState<ReviewFormState>({
    name: '',
    text: '',
    rating: 5,
    product: '',
    email: '',
    website: '',
  })

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTimeout = window.setTimeout(() => {
      nameRef.current?.focus()
    }, 80)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      const focusableSelector = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ')

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      )

      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (!panelRef.current.contains(active)) {
        event.preventDefault()
        first.focus()
        return
      }

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
        return
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(focusTimeout)
      previousFocusRef.current?.focus()
    }
  }, [])

  const mutation = useMutation({
    mutationFn: async (payload: ReviewFormState) => {
      const response = await fetch('/api/testimonials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: payload.name,
          text: payload.text,
          rating: payload.rating,
          product: payload.product,
          email: payload.email || undefined,
          website: payload.website || undefined,
        }),
      })

      const json = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          typeof json?.error === 'string'
            ? json.error
            : 'Impossible d’envoyer ton avis.'
        )
      }

      return json
    },
    onSuccess: (data) => {
      const message =
        typeof data?.message === 'string'
          ? data.message
          : 'Merci pour ton avis !'

      notifyToast(toast, 'success', message)

      setForm({
        name: '',
        text: '',
        rating: 5,
        product: '',
        email: '',
        website: '',
      })

      setError(null)
      onSuccess()
      onCloseRef.current()
    },
    onError: (err: any) => {
      const message =
        err?.message || 'Impossible d’envoyer ton avis.'

      setError(message)
      notifyToast(toast, 'error', message)
    },
  })

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (form.website.trim()) {
      setError('Envoi refusé.')
      return
    }

    if (form.name.trim().length < 2) {
      setError('Ton nom doit contenir au moins 2 caractères.')
      return
    }

    if (form.text.trim().length < 10) {
      setError('Ton avis doit contenir au moins 10 caractères.')
      return
    }

    mutation.mutate(form)
  }

  const inputClasses = cn(
    'w-full rounded-control border border-line bg-canvas px-3 py-2.5 text-sm text-fg',
    'placeholder:text-fg-subtle',
    'transition-colors duration-200 motion-reduce:transition-none',
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'
  )

  const errorId = 'review-modal-error'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
        className="absolute inset-0 bg-muted/80 backdrop-blur-sm"
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />

      <motion.div
        ref={panelRef}
        initial={
          prefersReducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.96, y: 12 }
        }
        animate={
          prefersReducedMotion
            ? { opacity: 1 }
            : { opacity: 1, scale: 1, y: 0 }
        }
        exit={
          prefersReducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.96, y: 12 }
        }
        transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        aria-describedby={error ? errorId : undefined}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3
            id="review-modal-title"
            className="text-lg font-bold tracking-tight text-fg sm:text-xl"
          >
            Laisser un avis
          </h3>

          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-pill',
              'text-fg-muted transition-colors duration-200 motion-reduce:transition-none',
              'hover:bg-muted hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            )}
            aria-label="Fermer"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {error ? (
          <div
            id={errorId}
            role="alert"
            className="mb-4 rounded-card border border-danger/20 bg-danger-soft p-3 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="review-name"
              className="block text-sm font-medium text-fg"
            >
              Ton nom{' '}
              <span className="text-danger" aria-hidden="true">
                *
              </span>
            </label>

            <input
              id="review-name"
              ref={nameRef}
              value={form.name}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
              className={inputClasses}
              placeholder="Amina K."
              required
              aria-invalid={Boolean(error)}
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-fg">
              Note
            </span>

            <div
              role="group"
              aria-label="Attribuer une note"
              className="flex items-center gap-1"
            >
              {Array.from({ length: 5 }).map((_, index) => {
                const value = index + 1
                const active = value <= form.rating

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setForm((previous) => ({
                        ...previous,
                        rating: value,
                      }))
                    }
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-control',
                      'transition-transform duration-150 motion-reduce:transition-none',
                      'hover:scale-105 motion-safe:hover:scale-105',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                    )}
                    aria-label={`Note ${value} sur 5`}
                    aria-pressed={active}
                  >
                    <Star
                      size={24}
                      className={cn(
                        active
                          ? 'fill-accent text-accent'
                          : 'text-fg-subtle'
                      )}
                      aria-hidden="true"
                    />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="review-text"
              className="block text-sm font-medium text-fg"
            >
              Ton avis{' '}
              <span className="text-danger" aria-hidden="true">
                *
              </span>
            </label>

            <textarea
              id="review-text"
              value={form.text}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  text: event.target.value,
                }))
              }
              rows={5}
              className={cn(inputClasses, 'resize-y')}
              placeholder="Partage ton expérience avec Gercie..."
              required
              aria-invalid={Boolean(error)}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="review-product"
              className="block text-sm font-medium text-fg"
            >
              Produit concerné
            </label>

            <input
              id="review-product"
              value={form.product}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  product: event.target.value,
                }))
              }
              list="public-testimonial-product-suggestions"
              className={inputClasses}
              placeholder="Casque Bluetooth Premium"
            />

            <datalist id="public-testimonial-product-suggestions">
              {productSuggestions.map((product) => (
                <option key={product} value={product} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="review-email"
              className="block text-sm font-medium text-fg"
            >
              Email (optionnel)
            </label>

            <input
              id="review-email"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  email: event.target.value,
                }))
              }
              className={inputClasses}
              placeholder="ton@email.com"
            />
          </div>

          {/* Honeypot anti-spam */}
          <input
            type="text"
            value={form.website}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                website: event.target.value,
              }))
            }
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <SecondaryButton onClick={() => onCloseRef.current()}>
              Annuler
            </SecondaryButton>

            <PrimaryButton
              buttonType="submit"
              loading={mutation.isPending}
              icon={<Send size={16} aria-hidden="true" />}
            >
              Envoyer
            </PrimaryButton>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export default function TestimonialsSection() {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const queryClient = useQueryClient()
  const toast = useToast() as any

  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid')
  const [search, setSearch] = useState('')
  const [filterRating, setFilterRating] = useState<number | null>(null)
  const [filterVerified, setFilterVerified] = useState<
    'all' | 'true' | 'false'
  >('all')
  const [filterFeatured, setFilterFeatured] = useState<
    'all' | 'true' | 'false'
  >('all')
  const [sortBy, setSortBy] = useState<
    'relevance' | 'date' | 'rating' | 'likes' | 'featured'
  >('relevance')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [modalOpen, setModalOpen] = useState(false)

  const perPage = 6

  const openReviewModal = useCallback(() => setModalOpen(true), [])
  const closeReviewModal = useCallback(() => setModalOpen(false), [])

  const query = useQuery<TestimonialsApiResponse>({
    queryKey: [
      'testimonials-home',
      page,
      filterRating,
      filterVerified,
      filterFeatured,
      sortBy,
      sortOrder,
      search,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()

      params.set('limit', String(perPage))
      params.set('page', String(page))
      params.set('sort', sortBy)
      params.set('order', sortOrder)

      if (filterRating) {
        params.set('ratingMin', String(filterRating))
      }

      if (filterVerified !== 'all') {
        params.set('verified', filterVerified)
      }

      if (filterFeatured !== 'all') {
        params.set('featured', filterFeatured)
      }

      if (search.trim()) {
        params.set('search', search.trim())
      }

      const response = await fetch(
        `/api/testimonials?${params.toString()}`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        }
      )

      const json = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          typeof json?.error === 'string'
            ? json.error
            : 'Erreur serveur'
        )
      }

      const rawItems = Array.isArray(json?.data) ? json.data : []

      return {
        ...json,
        data: rawItems
          .map(normalizeTestimonial)
          .filter((item): item is Testimonial => Boolean(item)),
      }
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  })

  const handleReviewSuccess = useCallback(() => {
    void query.refetch()
  }, [query])

  const testimonials = useMemo(
    () => query.data?.data ?? [],
    [query.data?.data]
  )

  const meta = query.data?.meta
  const totalItems = meta?.total ?? 0
  const totalPages = Math.max(1, meta?.totalPages ?? 1)
  const avgRating = meta?.stats?.avgRating ?? '0.0'
  const distribution = meta?.stats?.distribution ?? {}

  const productOptions = useMemo(
    () => meta?.stats?.products ?? [],
    [meta?.stats?.products]
  )

  const totalDistribution = useMemo(() => {
    return Object.values(distribution).reduce(
      (accumulator, value) => accumulator + Number(value || 0),
      0
    )
  }, [distribution])

  const likeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/testimonials/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, type: 'like' }),
      })

      const json = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          typeof json?.error === 'string'
            ? json.error
            : 'Impossible d’enregistrer le like.'
        )
      }

      return json
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: ['testimonials-home'],
      })

      const previous = queryClient.getQueriesData<TestimonialsApiResponse>({
        queryKey: ['testimonials-home'],
      })

      queryClient.setQueriesData<TestimonialsApiResponse>(
        { queryKey: ['testimonials-home'] },
        (old) => {
          if (!old) return old

          return {
            ...old,
            data: old.data.map((item) =>
              item.id === id
                ? {
                    ...item,
                    likes: (item.likes || 0) + 1,
                  }
                : item
            ),
          }
        }
      )

      return { previous }
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => {
          if (data) {
            queryClient.setQueryData(key, data)
          }
        })
      }

      notifyToast(
        toast,
        'error',
        err?.message || 'Impossible d’enregistrer le like.'
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['testimonials-home'],
      })
    },
  })

  const handleShare = useCallback(
    async (testimonial: Testimonial) => {
      if (typeof window === 'undefined') return

      const url = `${window.location.origin}/avis#${testimonial.id}`

      try {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: `Avis de ${testimonial.name}`,
            text: testimonial.text,
            url,
          })

          return
        }

        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(url)
          notifyToast(toast, 'success', 'Lien copié.')
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          // eslint-disable-next-line no-console
          console.warn('Erreur partage avis:', err)
        }
      }
    },
    [toast]
  )

  const resetFilters = useCallback(() => {
    setSearch('')
    setFilterRating(null)
    setFilterVerified('all')
    setFilterFeatured('all')
    setSortBy('relevance')
    setSortOrder('desc')
    setPage(1)
  }, [])

  const shouldShowLoading = query.isLoading && !query.data
  const shouldShowError = query.isError && testimonials.length === 0
  const shouldShowEmpty =
    !query.isLoading && !query.isError && testimonials.length === 0

  const selectClasses = cn(
    'h-10 rounded-control border border-line bg-canvas px-3 text-xs text-fg',
    'transition-colors duration-200 motion-reduce:transition-none',
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'
  )

  const iconButtonClasses = cn(
    'inline-flex h-10 w-10 items-center justify-center rounded-control border border-line bg-surface text-fg-muted shadow-card',
    'transition-colors duration-200 motion-reduce:transition-none',
    'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    'disabled:pointer-events-none disabled:opacity-50'
  )

  if (shouldShowLoading) {
    return (
      <section
        className="relative isolate overflow-hidden bg-canvas py-12 sm:py-16 md:py-20"
        aria-busy="true"
        aria-label="Chargement des avis clients"
      >
        <Container>
          <div className="mb-10 text-center">
            <Skeleton
              variant="text"
              className="mx-auto h-8 w-64 rounded-pill"
            />
          </div>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`testimonial-skeleton-${index}`}
                className="space-y-3 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
              >
                <div className="flex items-center gap-3">
                  <Skeleton
                    variant="circular"
                    className="h-10 w-10"
                  />

                  <div className="flex-1 space-y-2">
                    <Skeleton
                      variant="text"
                      className="h-4 w-1/2 rounded-pill"
                    />
                    <Skeleton
                      variant="text"
                      className="h-3 w-1/3 rounded-pill"
                    />
                  </div>
                </div>

                <Skeleton
                  variant="text"
                  className="h-16 w-full rounded-pill"
                />
              </div>
            ))}
          </div>

          <span className="sr-only">Chargement des avis…</span>
        </Container>
      </section>
    )
  }

  return (
    <section
      className="relative isolate overflow-hidden bg-canvas py-12 sm:py-16 md:py-20"
      aria-labelledby="testimonials-section-heading"
    >
      {/* Décor premium discret */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-accent/5 via-transparent to-transparent"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
        aria-hidden="true"
      />

      <Container>
        {/* ====================================================
            HEADER
           ==================================================== */}
        <motion.div
          initial={
            prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 18 }
          }
          whileInView={
            prefersReducedMotion ? undefined : { opacity: 1, y: 0 }
          }
          viewport={{ once: true, margin: '-60px' }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.45,
            ease: 'easeOut',
          }}
          className="relative mb-8 text-center sm:mb-10"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-pill border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            <MessageCircle
              size={14}
              aria-hidden="true"
            />
            Avis clients
          </div>

          <h2
            id="testimonials-section-heading"
            className="text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl md:text-4xl"
          >
            Ce que disent nos clients
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-fg-muted sm:text-base">
            Note moyenne de{' '}
            <span className="font-bold text-accent">{avgRating}/5</span>{' '}
            basée sur{' '}
            <span className="font-semibold text-fg">
              {totalItems} avis
            </span>
            .
          </p>

          {totalDistribution > 0 ? (
            <div className="mx-auto mt-5 max-w-md space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = Number(distribution[String(star)] || 0)
                const percent =
                  totalDistribution > 0
                    ? (count / totalDistribution) * 100
                    : 0

                return (
                  <div
                    key={star}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-8 shrink-0 text-fg-muted">
                      {star}★
                    </span>

                    <div className="h-2 flex-1 overflow-hidden rounded-pill bg-muted">
                      <div
                        className="h-full rounded-pill bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <span className="w-10 shrink-0 text-right tabular-nums text-fg-muted">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* ==================================================
              CONTROLS
             ================================================== */}
          <div className="mt-6 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 text-left shadow-card lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
                  aria-hidden="true"
                />

                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Rechercher un avis..."
                  aria-label="Rechercher un avis"
                  className={cn(
                    'h-10 w-full rounded-control border border-line bg-canvas pl-9 pr-3 text-sm text-fg',
                    'placeholder:text-fg-subtle',
                    'transition-colors duration-200 motion-reduce:transition-none',
                    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'
                  )}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[null, 5, 4, 3].map((rating) => (
                  <button
                    key={rating ?? 'all'}
                    type="button"
                    onClick={() => {
                      setFilterRating(rating)
                      setPage(1)
                    }}
                    className={cn(
                      'inline-flex h-9 items-center justify-center rounded-pill border px-3 text-xs font-semibold',
                      'transition-colors duration-200 motion-reduce:transition-none',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      filterRating === rating
                        ? 'border-accent/40 bg-accent-soft text-accent'
                        : 'border-line bg-surface text-fg-muted hover:border-accent/30 hover:text-accent'
                    )}
                    aria-pressed={filterRating === rating}
                  >
                    {rating === null ? 'Tous' : `${rating}★`}
                  </button>
                ))}

                <select
                  value={filterVerified}
                  onChange={(event) => {
                    setFilterVerified(
                      event.target.value as typeof filterVerified
                    )
                    setPage(1)
                  }}
                  className={selectClasses}
                  aria-label="Filtrer par vérification"
                >
                  <option value="all">Tous</option>
                  <option value="true">Vérifiés</option>
                  <option value="false">Non vérifiés</option>
                </select>

                <select
                  value={filterFeatured}
                  onChange={(event) => {
                    setFilterFeatured(
                      event.target.value as typeof filterFeatured
                    )
                    setPage(1)
                  }}
                  className={selectClasses}
                  aria-label="Filtrer par mise en avant"
                >
                  <option value="all">Mis en avant : tous</option>
                  <option value="true">Mis en avant</option>
                  <option value="false">Non mis en avant</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(event) => {
                    setSortBy(event.target.value as typeof sortBy)
                    setPage(1)
                  }}
                  className={selectClasses}
                  aria-label="Trier les avis"
                >
                  <option value="relevance">Pertinence</option>
                  <option value="date">Date</option>
                  <option value="rating">Note</option>
                  <option value="likes">Utile</option>
                  <option value="featured">Mis en avant</option>
                </select>

                <button
                  type="button"
                  onClick={() =>
                    setSortOrder((previous) =>
                      previous === 'asc' ? 'desc' : 'asc'
                    )
                  }
                  className={iconButtonClasses}
                  aria-label={
                    sortOrder === 'asc'
                      ? 'Trier par ordre décroissant'
                      : 'Trier par ordre croissant'
                  }
                >
                  {sortOrder === 'asc' ? (
                    <ArrowUp size={16} aria-hidden="true" />
                  ) : (
                    <ArrowDown size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setViewMode((previous) =>
                    previous === 'grid' ? 'carousel' : 'grid'
                  )
                }
                className={iconButtonClasses}
                aria-label={
                  viewMode === 'grid'
                    ? 'Passer en vue carrousel'
                    : 'Passer en vue grille'
                }
              >
                {viewMode === 'grid' ? (
                  <ArrowRight size={16} aria-hidden="true" />
                ) : (
                  <LayoutGrid size={16} aria-hidden="true" />
                )}
              </button>

              <PrimaryButton
                onClick={openReviewModal}
                icon={<Plus size={16} aria-hidden="true" />}
              >
                Laisser un avis
              </PrimaryButton>
            </div>
          </div>
        </motion.div>

        {/* ====================================================
            ERROR
           ==================================================== */}
        {shouldShowError ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-3 rounded-card border border-danger/20 bg-danger-soft px-6 py-12 text-center"
          >
            <AlertTriangle
              size={32}
              className="text-danger"
              aria-hidden="true"
            />

            <p className="text-sm font-semibold text-danger">
              {query.error instanceof Error
                ? query.error.message
                : 'Impossible de charger les avis.'}
            </p>

            <p className="max-w-sm text-xs text-fg-muted">
              Une erreur est survenue lors de la récupération des avis
              clients.
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <SecondaryButton
                onClick={() => void query.refetch()}
                icon={
                  <RefreshCw size={16} aria-hidden="true" />
                }
              >
                Réessayer
              </SecondaryButton>

              <SecondaryButton
                onClick={resetFilters}
                icon={
                  <X size={16} aria-hidden="true" />
                }
              >
                Réinitialiser
              </SecondaryButton>
            </div>
          </div>
        ) : null}

        {/* ====================================================
            EMPTY
           ==================================================== */}
        {shouldShowEmpty ? (
          <div
            role="status"
            className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-muted/40 px-6 py-14 text-center"
          >
            <MessageCircle
              size={32}
              className="text-fg-subtle"
              aria-hidden="true"
            />

            <p className="text-sm font-medium text-fg-muted">
              Aucun avis trouvé avec ces critères.
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <SecondaryButton
                onClick={resetFilters}
                icon={
                  <X size={16} aria-hidden="true" />
                }
              >
                Réinitialiser les filtres
              </SecondaryButton>

              <PrimaryButton
                onClick={openReviewModal}
                icon={
                  <Plus size={16} aria-hidden="true" />
                }
              >
                Être le premier à laisser un avis
              </PrimaryButton>
            </div>
          </div>
        ) : null}

        {/* ====================================================
            GRID VIEW
           ==================================================== */}
        {!shouldShowError &&
          !shouldShowEmpty &&
          testimonials.length > 0 &&
          viewMode === 'grid' ? (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {testimonials.map((testimonial, index) => (
                <TestimonialCard
                  key={testimonial.id}
                  testimonial={testimonial}
                  index={index}
                  showLikes
                  isLiking={
                    likeMutation.isPending &&
                    likeMutation.variables === testimonial.id
                  }
                  onLike={(id) => likeMutation.mutate(id)}
                  onShare={handleShare}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : null}

        {/* ====================================================
            CAROUSEL VIEW
           ==================================================== */}
        {!shouldShowError &&
          !shouldShowEmpty &&
          testimonials.length > 0 &&
          viewMode === 'carousel' ? (
          <div
            className={cn(
              '-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0',
              '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            )}
            role="list"
            aria-label="Carrousel des avis clients"
          >
            {testimonials.map((testimonial, index) => (
              <div
                key={testimonial.id}
                className="w-[300px] min-w-[300px] flex-shrink-0 snap-start sm:w-[340px] sm:min-w-[340px]"
                role="listitem"
              >
                <TestimonialCard
                  testimonial={testimonial}
                  index={index}
                  showLikes
                  isLiking={
                    likeMutation.isPending &&
                    likeMutation.variables === testimonial.id
                  }
                  onLike={(id) => likeMutation.mutate(id)}
                  onShare={handleShare}
                />
              </div>
            ))}
          </div>
        ) : null}

        {/* ====================================================
            PAGINATION
           ==================================================== */}
        {!shouldShowError && !shouldShowEmpty && totalPages > 1 ? (
          <div className="mt-8 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <span className="text-xs text-fg-muted">
              Affichage de{' '}
              {Math.min((page - 1) * perPage + 1, totalItems)}–
              {Math.min(page * perPage, totalItems)} sur {totalItems}{' '}
              avis
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setPage((previous) => Math.max(1, previous - 1))
                }
                disabled={page === 1}
                className={iconButtonClasses}
                aria-label="Page précédente"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>

              <span className="text-sm tabular-nums text-fg-muted">
                {page} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() =>
                  setPage((previous) =>
                    Math.min(totalPages, previous + 1)
                  )
                }
                disabled={page === totalPages}
                className={iconButtonClasses}
                aria-label="Page suivante"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        {/* ====================================================
            BOTTOM LINKS
           ==================================================== */}
        {!shouldShowError && !shouldShowEmpty ? (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/avis"
              className={cn(
                'inline-flex items-center gap-1 text-sm font-semibold text-accent',
                'transition-colors duration-200 motion-reduce:transition-none',
                'hover:text-accent-hover',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
              )}
            >
              Voir tous les avis
              <ExternalLink
                size={14}
                aria-hidden="true"
              />
            </Link>

            <button
              type="button"
              onClick={openReviewModal}
              className={cn(
                'inline-flex items-center gap-1 text-sm font-semibold text-accent',
                'transition-colors duration-200 motion-reduce:transition-none',
                'hover:text-accent-hover',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
              )}
            >
              <Plus size={14} aria-hidden="true" />
              Laisser un avis
            </button>
          </div>
        ) : null}
      </Container>

      {/* ====================================================
          REVIEW MODAL
         ==================================================== */}
      <AnimatePresence>
        {modalOpen ? (
          <ReviewModal
            onClose={closeReviewModal}
            onSuccess={handleReviewSuccess}
            productSuggestions={productOptions}
          />
        ) : null}
      </AnimatePresence>
    </section>
  )
}