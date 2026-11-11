// components/TrustSection.tsx
'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react'

import Image from 'next/image'

import {
  AnimatePresence,
  motion,
  useInView,
} from 'framer-motion'

import { useQuery } from '@tanstack/react-query'

import { Container } from '@/components/layout/Container'
import { Skeleton } from '@/components/ui/Skeleton'

import { cn } from '@/lib/utils'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

import {
  normalizeSettings,
  normalizeStat,
  normalizeTestimonial,
  DEFAULT_TRUST_SETTINGS,
  DEFAULT_TRUST_STATS,
  DEFAULT_TRUST_TESTIMONIALS,
  type TrustSettings,
  type TrustStat,
  type TrustTestimonial,
} from '@/lib/trust'

import {
  AlertTriangle,
  Award,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Headphones,
  HeartHandshake,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Quote,
  RefreshCw,
  ShieldCheck,
  Star,
  Store,
  ThumbsUp,
  Truck,
  Users,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface TrustSectionProps {
  apiEndpoint?: string | null
  fallbackToDefaults?: boolean
  className?: string
}

interface TrustPublicPayload {
  stats: TrustStat[]
  testimonials: TrustTestimonial[]
  settings: TrustSettings
}

type IconComponent = ComponentType<{
  size?: number | string
  className?: string
  'aria-hidden'?: boolean
}>

type AccentTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

interface AccentClasses {
  badge: string
  icon: string
  dotActive: string
  cardHover: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ICON MAP                                                       */
/* ═══════════════════════════════════════════════════════════════ */

const ICON_MAP: Record<string, IconComponent> = {
  Users,
  Package,
  Star,
  Store,
  MapPin,
  Headphones,
  ThumbsUp,
  Clock,
  ShieldCheck,
  Truck,
  HeartHandshake,
  BadgeCheck,
  CheckCircle2,
  Award,
  Globe,
  Zap,
  Lock,
  MessageSquare,
  Phone,
  Mail,
}

function resolveIcon(name?: string | null): IconComponent {
  if (!name) return ShieldCheck
  if (ICON_MAP[name]) return ICON_MAP[name]

  const normalized = name.charAt(0).toUpperCase() + name.slice(1)
  return ICON_MAP[normalized] || ShieldCheck
}

function StatIcon({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const Icon = resolveIcon(name)

  return (
    <Icon
      size={28}
      className={className}
      aria-hidden="true"
    />
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DESIGN TOKENS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const accentClasses: Record<AccentTone, AccentClasses> = {
  accent: {
    badge: 'border-accent/20 bg-accent-soft text-accent',
    icon: 'text-accent',
    dotActive: 'bg-accent',
    cardHover: 'hover:border-accent/30',
  },
  success: {
    badge: 'border-success/20 bg-success-soft text-success',
    icon: 'text-success',
    dotActive: 'bg-success',
    cardHover: 'hover:border-success/30',
  },
  warning: {
    badge: 'border-warning/20 bg-warning-soft text-warning',
    icon: 'text-warning',
    dotActive: 'bg-warning',
    cardHover: 'hover:border-warning/30',
  },
  danger: {
    badge: 'border-danger/20 bg-danger-soft text-danger',
    icon: 'text-danger',
    dotActive: 'bg-danger',
    cardHover: 'hover:border-danger/30',
  },
  info: {
    badge: 'border-info/20 bg-info-soft text-info',
    icon: 'text-info',
    dotActive: 'bg-info',
    cardHover: 'hover:border-info/30',
  },
  neutral: {
    badge: 'border-line bg-muted text-fg-muted',
    icon: 'text-fg-muted',
    dotActive: 'bg-fg-subtle',
    cardHover: 'hover:border-line-strong',
  },
}

function resolveAccentTone(accent?: string | null): AccentTone {
  const value = String(accent || '')
    .toLowerCase()
    .trim()

  if (['success', 'emerald', 'green'].includes(value)) {
    return 'success'
  }

  if (['warning', 'amber', 'orange'].includes(value)) {
    return 'warning'
  }

  if (['danger', 'rose', 'red'].includes(value)) {
    return 'danger'
  }

  if (['info', 'blue', 'purple', 'violet'].includes(value)) {
    return 'info'
  }

  if (['neutral', 'gray', 'grey', 'slate'].includes(value)) {
    return 'neutral'
  }

  return 'accent'
}

function getAccentClasses(accent?: string | null): AccentClasses {
  return accentClasses[resolveAccentTone(accent)]
}

const controlButtonClasses = cn(
  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-fg-muted shadow-card',
  'transition-colors duration-200 motion-reduce:transition-none',
  'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
)

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return 'G'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function sortAndNormalizeStats(raw: any[]): TrustStat[] {
  return raw
    .map((row, index) => normalizeStat(row, index))
    .filter((row): row is TrustStat => Boolean(row))
    .sort((a, b) => a.sort_order - b.sort_order)
}

function sortAndNormalizeTestimonials(
  raw: any[]
): TrustTestimonial[] {
  return raw
    .map((row, index) => normalizeTestimonial(row, index))
    .filter((row): row is TrustTestimonial => Boolean(row))
    .sort((a, b) => a.sort_order - b.sort_order)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ANIMATED COUNTER                                               */
/* ═══════════════════════════════════════════════════════════════ */

function AnimatedCounter({
  target,
  suffix = '',
  prefix = '',
  duration = 2,
  decimals = 0,
  animate = true,
}: {
  target: number
  suffix?: string
  prefix?: string
  duration?: number
  decimals?: number
  animate?: boolean
}) {
  const { prefersReducedMotion } = useAccessibilityPreferences()

  const shouldAnimate = animate && !prefersReducedMotion

  const [count, setCount] = useState(shouldAnimate ? 0 : target)

  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, {
    once: true,
    margin: '-50px',
  })

  useEffect(() => {
    if (!shouldAnimate) {
      setCount(target)
      return
    }

    if (!inView) return

    let frame = 0
    const startTime = performance.now()

    const tick = (now: number) => {
      const progress = Math.min(
        (now - startTime) / (duration * 1000),
        1
      )

      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(target * eased)

      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        setCount(target)
      }
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [
    duration,
    inView,
    shouldAnimate,
    target,
  ])

  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(count)

  return (
    <span
      ref={ref}
      aria-label={`${prefix}${formatted}${suffix}`}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  RATING STARS                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function RatingStars({ rating }: { rating: number }) {
  if (!Number.isFinite(rating) || rating <= 0) return null

  const rounded = Math.round(rating)

  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`Note : ${rating.toFixed(1)} sur 5`}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          size={12}
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
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export default function TrustSection({
  apiEndpoint = '/api/trust/public',
  fallbackToDefaults = true,
  className,
}: TrustSectionProps) {
  const { prefersReducedMotion } = useAccessibilityPreferences()

  const query = useQuery<TrustPublicPayload>({
    queryKey: ['trust-section-public', apiEndpoint],
    enabled: Boolean(apiEndpoint),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const response = await fetch(apiEndpoint!, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      })

      const json = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          typeof json?.error === 'string'
            ? json.error
            : 'Impossible de charger les données de confiance.'
        )
      }

      const payload = json?.data ?? json ?? {}

      const rawStats = Array.isArray(payload.stats)
        ? payload.stats
        : Array.isArray(json.stats)
          ? json.stats
          : []

      const rawTestimonials = Array.isArray(payload.testimonials)
        ? payload.testimonials
        : Array.isArray(json.testimonials)
          ? json.testimonials
          : []

      const rawSettings = payload.settings ?? json.settings ?? null

      return {
        stats: sortAndNormalizeStats(rawStats),
        testimonials: sortAndNormalizeTestimonials(rawTestimonials),
        settings: normalizeSettings(
          rawSettings ?? DEFAULT_TRUST_SETTINGS
        ),
      }
    },
  })

  const fallbackPayload = useMemo<TrustPublicPayload>(
    () => ({
      stats: DEFAULT_TRUST_STATS,
      testimonials: DEFAULT_TRUST_TESTIMONIALS,
      settings: DEFAULT_TRUST_SETTINGS,
    }),
    []
  )

  const payload =
    query.data ?? (fallbackToDefaults ? fallbackPayload : null)

  const loading =
    Boolean(apiEndpoint) &&
    query.isLoading &&
    !query.data &&
    !fallbackToDefaults

  const error = query.isError && !payload

  const settings = payload?.settings ?? DEFAULT_TRUST_SETTINGS
  const stats = payload?.stats ?? []
  const testimonials = payload?.testimonials ?? []

  const visibleStats = useMemo(
    () =>
      settings.show_stats
        ? stats.filter((stat) => stat.is_active)
        : [],
    [settings.show_stats, stats]
  )

  const visibleTestimonials = useMemo(
    () =>
      settings.show_testimonials
        ? testimonials.filter((testimonial) => testimonial.is_active)
        : [],
    [settings.show_testimonials, testimonials]
  )

  const displayedTestimonials = useMemo(
    () =>
      visibleTestimonials.slice(
        0,
        Math.max(
          1,
          Number(settings.testimonials_max_display) || 3
        )
      ),
    [
      settings.testimonials_max_display,
      visibleTestimonials,
    ]
  )

  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const shouldAnimate =
    settings.animation_enabled && !prefersReducedMotion

  const accent = getAccentClasses(settings.accent_color)

  /* ───────────────────────────────────────────────────────────── */
  /*  RESET INDEX IF LIST CHANGES                                  */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (activeIndex >= visibleTestimonials.length) {
      setActiveIndex(0)
    }
  }, [activeIndex, visibleTestimonials.length])

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTO ROTATION                                                */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (
      settings.testimonials_display_mode !== 'rotate' ||
      visibleTestimonials.length <= 1 ||
      !shouldAnimate ||
      paused ||
      settings.autoplay_interval_ms <= 0
    ) {
      return
    }

    const interval = window.setInterval(() => {
      setActiveIndex(
        (previous) =>
          (previous + 1) % visibleTestimonials.length
      )
    }, settings.autoplay_interval_ms)

    return () => {
      window.clearInterval(interval)
    }
  }, [
    paused,
    settings.autoplay_interval_ms,
    settings.testimonials_display_mode,
    shouldAnimate,
    visibleTestimonials.length,
  ])

  const goPrev = () => {
    if (visibleTestimonials.length <= 1) return

    setActiveIndex(
      (previous) =>
        (previous - 1 + visibleTestimonials.length) %
        visibleTestimonials.length
    )
  }

  const goNext = () => {
    if (visibleTestimonials.length <= 1) return

    setActiveIndex(
      (previous) => (previous + 1) % visibleTestimonials.length
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  LOADING                                                      */
  /* ───────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <section
        className={cn(
          'relative isolate bg-canvas py-16 md:py-24',
          className
        )}
        aria-busy="true"
        aria-label="Chargement des données de confiance"
      >
        <Container>
          <div className="mb-10 text-center">
            <Skeleton
              variant="text"
              className="mx-auto mb-4 h-7 w-48 rounded-full"
            />

            <Skeleton
              variant="text"
              className="mx-auto h-10 w-72 rounded-full"
            />

            <Skeleton
              variant="text"
              className="mx-auto mt-3 h-5 w-96 max-w-full rounded-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-8">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`trust-stat-skeleton-${index}`}
                className="rounded-card border border-line bg-surface p-4 text-center shadow-card"
              >
                <Skeleton
                  variant="rectangular"
                  className="mx-auto mb-3 h-14 w-14 rounded-2xl"
                />

                <Skeleton
                  variant="text"
                  className="mx-auto mb-2 h-7 w-20 rounded-full"
                />

                <Skeleton
                  variant="text"
                  className="mx-auto h-4 w-24 rounded-full"
                />
              </div>
            ))}
          </div>

          <span className="sr-only">Chargement…</span>
        </Container>
      </section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  ERROR                                                        */
  /* ───────────────────────────────────────────────────────────── */

  if (error) {
    return (
      <section
        className={cn(
          'relative isolate bg-canvas py-16 md:py-24',
          className
        )}
      >
        <Container>
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
                : 'Impossible de charger les données de confiance.'}
            </p>

            <p className="max-w-sm text-xs text-fg-muted">
              Les statistiques et témoignages de confiance ne sont pas
              disponibles pour le moment.
            </p>

            <button
              type="button"
              onClick={() => void query.refetch()}
              className={controlButtonClasses}
              aria-label="Réessayer de charger les données de confiance"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        </Container>
      </section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  EMPTY                                                        */
  /* ───────────────────────────────────────────────────────────── */

  if (
    visibleStats.length === 0 &&
    displayedTestimonials.length === 0
  ) {
    return null
  }

  const activeTestimonial =
    visibleTestimonials.length > 0
      ? visibleTestimonials[
          Math.min(activeIndex, visibleTestimonials.length - 1)
        ]
      : null

  const statsGridStyle = {
    '--trust-cols': String(
      Number(settings.stats_columns) || 4
    ),
  } as CSSProperties

  return (
    <section
      aria-labelledby="trust-section-title"
      className={cn(
        'relative isolate overflow-hidden bg-canvas py-16 md:py-24',
        className
      )}
    >
      {/* Décor premium discret */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.04] via-transparent to-transparent"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent"
        aria-hidden="true"
      />

      <Container className="relative z-10">
        {/* ====================================================
            HEADER + TESTIMONIALS
           ==================================================== */}
        <motion.div
          initial={
            shouldAnimate ? { opacity: 0, y: 18 } : { opacity: 1 }
          }
          whileInView={
            shouldAnimate ? { opacity: 1, y: 0 } : undefined
          }
          viewport={{ once: true, margin: '-100px' }}
          transition={{
            duration: shouldAnimate ? 0.45 : 0,
            ease: 'easeOut',
          }}
          className={cn(
            'text-center',
            displayedTestimonials.length > 0 ? 'mb-12' : 'mb-0'
          )}
        >
          {settings.show_header ? (
            <>
              <div
                className={cn(
                  'mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
                  accent.badge
                )}
              >
                <BadgeCheck
                  size={14}
                  className={accent.icon}
                  aria-hidden="true"
                />

                <span>{settings.badge_text}</span>
              </div>

              <h2
                id="trust-section-title"
                className="text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl md:text-4xl"
              >
                {settings.section_title}
              </h2>

              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted sm:text-base md:text-lg">
                {settings.section_subtitle}
              </p>
            </>
          ) : (
            <h2 id="trust-section-title" className="sr-only">
              Données de confiance Gercie
            </h2>
          )}

          {/* -------------------------------------------------- */}
          {/*  ROTATE MODE                                        */}
          {/* -------------------------------------------------- */}

          {settings.testimonials_display_mode === 'rotate' &&
            activeTestimonial ? (
            <motion.div
              initial={
                shouldAnimate ? { opacity: 0, y: 18 } : { opacity: 1 }
              }
              whileInView={
                shouldAnimate ? { opacity: 1, y: 0 } : undefined
              }
              viewport={{ once: true }}
              transition={{
                duration: shouldAnimate ? 0.4 : 0,
                ease: 'easeOut',
              }}
              className="mx-auto mt-8 max-w-xl"
              onMouseEnter={() => {
                if (settings.pause_on_hover) setPaused(true)
              }}
              onMouseLeave={() => setPaused(false)}
              onFocusCapture={() => {
                if (settings.pause_on_hover) setPaused(true)
              }}
              onBlurCapture={() => setPaused(false)}
            >
              <div
                className={cn(
                  'rounded-card border border-line bg-surface p-5 shadow-card',
                  'transition-colors duration-200 motion-reduce:transition-none',
                  accent.cardHover
                )}
              >
                <div className="flex items-start gap-3">
                  <Quote
                    size={20}
                    className={cn(
                      'mt-1 shrink-0 opacity-70',
                      accent.icon
                    )}
                    aria-hidden="true"
                  />

                  <AnimatePresence mode="wait">
                    <motion.blockquote
                      key={activeTestimonial.id}
                      initial={{
                        opacity: shouldAnimate ? 0 : 1,
                        y: shouldAnimate ? 8 : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: shouldAnimate ? 0 : 1,
                        y: shouldAnimate ? -8 : 0,
                      }}
                      transition={{
                        duration: shouldAnimate ? 0.25 : 0,
                        ease: 'easeOut',
                      }}
                      className="min-h-[7.5rem] flex-1 text-left"
                    >
                      <p className="text-sm italic leading-relaxed text-fg-muted sm:text-base md:text-lg">
                        « {activeTestimonial.quote} »
                      </p>

                      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {settings.show_avatar_initials ? (
                            <div
                              className={cn(
                                'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-sm font-bold',
                                accent.badge
                              )}
                            >
                              {activeTestimonial.avatar_url ? (
                                <Image
                                  src={activeTestimonial.avatar_url}
                                  alt={activeTestimonial.author}
                                  width={40}
                                  height={40}
                                  className="h-full w-full object-cover"
                                  unoptimized
                                />
                              ) : (
                                getInitials(
                                  activeTestimonial.author
                                )
                              )}
                            </div>
                          ) : null}

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-fg">
                              <cite>
                                {activeTestimonial.author}
                              </cite>
                            </p>

                            {(activeTestimonial.role ||
                              activeTestimonial.commune) ? (
                              <p className="truncate text-xs text-fg-muted">
                                {[
                                  activeTestimonial.role,
                                  activeTestimonial.commune,
                                ]
                                  .filter(Boolean)
                                  .join(' • ')}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {settings.show_rating_stars ? (
                          <RatingStars
                            rating={activeTestimonial.rating}
                          />
                        ) : null}
                      </footer>
                    </motion.blockquote>
                  </AnimatePresence>
                </div>

                {visibleTestimonials.length > 1 ? (
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={goPrev}
                      className={controlButtonClasses}
                      aria-label="Témoignage précédent"
                    >
                      <ChevronLeft
                        size={16}
                        aria-hidden="true"
                      />
                    </button>

                    <div
                      role="tablist"
                      aria-label="Sélection du témoignage"
                      className="flex items-center gap-2"
                    >
                      {visibleTestimonials.map(
                        (testimonial, index) => {
                          const isActive = index === activeIndex

                          return (
                            <button
                              key={testimonial.id}
                              type="button"
                              role="tab"
                              aria-selected={isActive}
                              aria-label={`Afficher le témoignage ${index + 1}`}
                              onClick={() =>
                                setActiveIndex(index)
                              }
                              className={cn(
                                'h-2 rounded-full transition-all duration-200 motion-reduce:transition-none',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                                isActive
                                  ? cn('w-6', accent.dotActive)
                                  : 'w-2 bg-line hover:bg-accent/60'
                              )}
                            />
                          )
                        }
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={goNext}
                      className={controlButtonClasses}
                      aria-label="Témoignage suivant"
                    >
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : null}

          {/* -------------------------------------------------- */}
          {/*  GRID MODE                                          */}
          {/* -------------------------------------------------- */}

          {settings.testimonials_display_mode === 'grid' &&
            displayedTestimonials.length > 0 ? (
            <motion.div
              initial={
                shouldAnimate ? { opacity: 0, y: 18 } : { opacity: 1 }
              }
              whileInView={
                shouldAnimate ? { opacity: 1, y: 0 } : undefined
              }
              viewport={{ once: true }}
              transition={{
                duration: shouldAnimate ? 0.4 : 0,
                ease: 'easeOut',
              }}
              className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {displayedTestimonials.map((testimonial) => (
                <div
                  key={testimonial.id}
                  className={cn(
                    'rounded-card border border-line bg-surface p-5 text-left shadow-card',
                    'transition-colors duration-200 motion-reduce:transition-none',
                    accent.cardHover
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Quote
                      size={18}
                      className={cn(
                        'mt-1 shrink-0 opacity-70',
                        accent.icon
                      )}
                      aria-hidden="true"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm italic leading-relaxed text-fg-muted md:text-base">
                        « {testimonial.quote} »
                      </p>

                      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {settings.show_avatar_initials ? (
                            <div
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-bold',
                                accent.badge
                              )}
                            >
                              {testimonial.avatar_url ? (
                                <Image
                                  src={testimonial.avatar_url}
                                  alt={testimonial.author}
                                  width={36}
                                  height={36}
                                  className="h-full w-full object-cover"
                                  unoptimized
                                />
                              ) : (
                                getInitials(testimonial.author)
                              )}
                            </div>
                          ) : null}

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-fg">
                              <cite>{testimonial.author}</cite>
                            </p>

                            {(testimonial.role ||
                              testimonial.commune) ? (
                              <p className="truncate text-xs text-fg-muted">
                                {[
                                  testimonial.role,
                                  testimonial.commune,
                                ]
                                  .filter(Boolean)
                                  .join(' • ')}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {settings.show_rating_stars ? (
                          <RatingStars
                            rating={testimonial.rating}
                          />
                        ) : null}
                      </footer>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          ) : null}
        </motion.div>

        {/* ====================================================
            STATS
           ==================================================== */}
        {visibleStats.length > 0 ? (
          <motion.div
            initial={
              shouldAnimate ? { opacity: 0, y: 18 } : { opacity: 1 }
            }
            whileInView={
              shouldAnimate ? { opacity: 1, y: 0 } : undefined
            }
            viewport={{ once: true, margin: '-100px' }}
            transition={{
              duration: shouldAnimate ? 0.45 : 0,
              ease: 'easeOut',
            }}
            className={cn(
              'grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-[repeat(var(--trust-cols),minmax(0,1fr))]',
              displayedTestimonials.length > 0 ||
                settings.show_header
                ? 'mt-12'
                : 'mt-0'
            )}
            style={statsGridStyle}
            role="list"
            aria-label="Statistiques de confiance"
          >
            {visibleStats.map((stat, index) => (
              <motion.div
                key={stat.id}
                initial={
                  shouldAnimate ? { opacity: 0, y: 16 } : { opacity: 1 }
                }
                whileInView={
                  shouldAnimate ? { opacity: 1, y: 0 } : undefined
                }
                viewport={{ once: true, margin: '-50px' }}
                transition={{
                  duration: shouldAnimate ? 0.35 : 0,
                  delay: shouldAnimate
                    ? Math.min(index * 0.04, 0.25)
                    : 0,
                  ease: 'easeOut',
                }}
                whileHover={
                  shouldAnimate ? { y: -4 } : undefined
                }
                className={cn(
                  'group rounded-card border border-line bg-surface p-4 text-center shadow-card',
                  'transition-all duration-200 motion-reduce:transition-none',
                  'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover',
                  accent.cardHover
                )}
                role="listitem"
              >
                <div
                  className={cn(
                    'mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors duration-200 motion-reduce:transition-none',
                    accent.badge
                  )}
                >
                  <StatIcon
                    name={stat.icon_name}
                    className={accent.icon}
                  />
                </div>

                <p className="font-mono text-2xl font-extrabold tracking-tight text-fg md:text-3xl">
                  <AnimatedCounter
                    target={stat.value}
                    suffix={stat.suffix}
                    prefix={stat.prefix}
                    decimals={stat.decimals}
                    animate={shouldAnimate}
                  />
                </p>

                <p className="mt-1 text-sm font-semibold text-fg">
                  {stat.label}
                </p>

                {stat.description ? (
                  <p className="mt-1 hidden text-xs leading-relaxed text-fg-muted sm:block">
                    {stat.description}
                  </p>
                ) : null}
              </motion.div>
            ))}
          </motion.div>
        ) : null}
      </Container>
    </section>
  )
}