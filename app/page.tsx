// app/page.tsx
'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'

import {
  AlertTriangle,
  ArrowUp,
  Grid3X3,
  LayoutList,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Container } from '@/components/layout/Container'
import { ProductGrid } from '@/components/ProductGrid'
import { useProductFilters } from '@/hooks/useProductFilters'
import { useProducts } from '@/hooks/useProducts'
import { useHeroCarousel } from '@/hooks/useHeroCarousel'
import { Button } from '@/components/ui/Button'
import { useInView } from 'react-intersection-observer'

/* ═══════════════════════════════════════════════════════════════ */
/*  DYNAMIC IMPORTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

const HeroCarousel = dynamic(
  () => import('@/components/home/HeroCarousel'),
  { ssr: false, loading: () => <HeroSkeleton /> }
)

const PromoBanner = dynamic(
  () => import('@/components/home/PromoBanner'),
  { ssr: false }
)

const PopularCategoriesSection = dynamic(
  () => import('@/components/home/PopularCategoriesSection'),
  { ssr: false }
)

const TodaysDeals = dynamic(
  () => import('@/components/home/TodaysDeals'),
  { ssr: false }
)

const BestSellers = dynamic(
  () => import('@/components/home/BestSellers'),
  { ssr: false }
)

const NewArrivals = dynamic(
  () => import('@/components/home/NewArrivals'),
  { ssr: false }
)

const TrustSection = dynamic(
  () => import('@/components/home/TrustSection'),
  { ssr: false }
)

const TestimonialsSection = dynamic(
  () => import('@/components/home/TestimonialsSection'),
  { ssr: false }
)

const FooterReassurance = dynamic(
  () => import('@/components/home/FooterReassurance'),
  { ssr: false }
)

/**
 * Vrai QuickView aligné USD principal / CDF calculé.
 * Charge le produit via /api/produits/[id] et applique useExchangeRate().
 */
const ProductQuickView = dynamic(
  () => import('@/components/ProductQuickView'),
  { ssr: false }
)

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type ViewMode = 'grid' | 'list'

/* ═══════════════════════════════════════════════════════════════ */
/*  HERO SKELETON                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function HeroSkeleton() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-panel bg-muted"
      style={{ aspectRatio: '2 / 1' }}
      role="status"
      aria-label="Chargement du carrousel"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-accent" aria-hidden="true" />
      </div>
      <span className="sr-only">Chargement du carrousel…</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SECTION LOADING SKELETON                                       */
/* ═══════════════════════════════════════════════════════════════ */

function SectionSkeleton({
  title,
  count = 4,
}: {
  title: string
  count?: number
}) {
  return (
    <div className="space-y-4" role="status" aria-label={title}>
      <span className="sr-only">{title}</span>

      <div className="flex items-center justify-between">
        <div className="skeleton h-6 w-48 rounded-full" />
        <div className="skeleton h-8 w-24 rounded-pill" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={`section-skeleton-${index}`}
            className="space-y-3 rounded-card border border-line bg-surface p-3"
          >
            <div className="skeleton aspect-square w-full rounded-control" />
            <div className="skeleton h-3.5 w-3/4 rounded-full" />
            <div className="skeleton h-3 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export default function HomePage() {
  const router = useRouter()

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTH / ONBOARDING GUARD                                      */
  /* ───────────────────────────────────────────────────────────── */

  const [authLoading, setAuthLoading] = useState(true)
  const [mustCompleteOnboarding] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setAuthLoading(false), 300)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (authLoading || !mustCompleteOnboarding) return
    router.replace('/onboarding')
  }, [authLoading, mustCompleteOnboarding, router])

  /* ───────────────────────────────────────────────────────────── */
  /*  DOCUMENT TITLE                                               */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof document === 'undefined') return

    document.title =
      'Gercie Market Place | Marketplace premium en RDC, paiement Mobile Money, carte et livraison'
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  HERO                                                         */
  /* ───────────────────────────────────────────────────────────── */

  const {
    slides: heroSlides,
    componentProps: heroProps,
    loading: heroLoading,
    error: heroError,
    refetch: refetchHero,
  } = useHeroCarousel()

  /* ───────────────────────────────────────────────────────────── */
  /*  PRODUCT FILTERS & DATA                                       */
  /* ───────────────────────────────────────────────────────────── */

  const { filters, resetFilters, hasActiveFilters, activeFilterCount } =
    useProductFilters()

  const {
    products,
    isLoading,
    isFetching,
    error,
    refetch,
    productsCount,
    loadMore,
    hasNextPage,
    isFetchingNextPage,
  } = useProducts(filters)

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showFilters, setShowFilters] = useState(false)
  const [quickViewProductId, setQuickViewProductId] = useState<string | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  /* ───────────────────────────────────────────────────────────── */
  /*  INFINITE SCROLL                                              */
  /* ───────────────────────────────────────────────────────────── */

  const { ref: sentinelRef, inView } = useInView({
    threshold: 0.1,
    rootMargin: '200px',
  })

  const loadMoreRef = useRef(loadMore)

  useEffect(() => {
    loadMoreRef.current = loadMore
  }, [loadMore])

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isLoading) {
      loadMoreRef.current()
    }
  }, [hasNextPage, inView, isFetchingNextPage, isLoading])

  /* ───────────────────────────────────────────────────────────── */
  /*  SCROLL TO TOP                                                */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    let ticking = false
    let rafId = 0

    const onScroll = () => {
      if (!ticking) {
        rafId = window.requestAnimationFrame(() => {
          setShowScrollTop(window.scrollY > 600)
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  ACTIONS                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const handleResetFilters = useCallback(() => resetFilters(), [resetFilters])
  const handleRefetch = useCallback(() => refetch(), [refetch])
  const handleCloseQuickView = useCallback(() => setQuickViewProductId(null), [])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: HERO                                                 */
  /* ───────────────────────────────────────────────────────────── */

  const renderHero = useCallback(() => {
    if (heroLoading && heroSlides.length === 0) {
      return <HeroSkeleton />
    }

    if (heroError && heroSlides.length === 0) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-panel border border-line bg-surface py-16 text-center"
          role="alert"
        >
          <AlertTriangle className="text-danger" size={32} aria-hidden="true" />

          <p className="text-sm text-fg-muted">
            Impossible de charger le carrousel.
          </p>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refetchHero()}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Réessayer
          </Button>
        </div>
      )
    }

    if (heroSlides.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-line bg-muted py-16 text-center">
          <Sparkles className="text-accent" size={28} aria-hidden="true" />

          <p className="text-lg font-semibold text-fg">
            Rien à l&apos;horizon pour le moment
          </p>

          <p className="text-sm text-fg-muted">
            Explorez notre catalogue ci-dessous.
          </p>
        </div>
      )
    }

    return <HeroCarousel slides={heroSlides} {...heroProps} />
  }, [heroError, heroLoading, heroProps, heroSlides, refetchHero])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: CATALOGUE HEADER                                     */
  /* ───────────────────────────────────────────────────────────── */

  const catalogueHeader = useMemo(
    () => (
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            Catalogue
          </h2>

          <p className="mt-1 text-sm text-fg-muted" aria-live="polite">
            {isLoading || isFetching ? (
              <span className="inline-flex items-center gap-2">
                <Loader2
                  size={14}
                  className="animate-spin text-accent"
                  aria-hidden="true"
                />
                Chargement des produits…
              </span>
            ) : (
              <span>
                <span className="font-semibold text-fg">
                  {productsCount?.count ?? 0}
                </span>{' '}
                produit{productsCount?.count !== 1 ? 's' : ''} trouvé
                {productsCount?.count !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowFilters((prev) => !prev)}
            className="lg:hidden"
            aria-expanded={showFilters}
            aria-controls="catalogue-filters"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            Filtres

            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-contrast">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <div
            role="group"
            aria-label="Mode d'affichage"
            className="hidden items-center gap-0.5 rounded-pill border border-line bg-muted p-0.5 sm:flex"
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-pill transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                viewMode === 'grid'
                  ? 'bg-surface text-accent shadow-card'
                  : 'text-fg-subtle hover:text-fg'
              )}
              aria-label="Vue grille"
            >
              <Grid3X3 size={15} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-pill transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                viewMode === 'list'
                  ? 'bg-surface text-accent shadow-card'
                  : 'text-fg-subtle hover:text-fg'
              )}
              aria-label="Vue liste"
            >
              <LayoutList size={15} aria-hidden="true" />
            </button>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              <RotateCcw size={14} aria-hidden="true" />
              Réinitialiser
            </Button>
          )}
        </div>
      </div>
    ),
    [
      activeFilterCount,
      handleResetFilters,
      hasActiveFilters,
      isLoading,
      isFetching,
      productsCount?.count,
      showFilters,
      viewMode,
    ]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: ERROR STATE                                          */
  /* ───────────────────────────────────────────────────────────── */

  const catalogueError = useMemo(() => {
    if (!error) return null

    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-panel border border-danger/20 bg-danger-soft py-12 text-center"
        role="alert"
      >
        <AlertTriangle className="text-danger" size={28} aria-hidden="true" />

        <p className="text-sm font-medium text-danger">
          Erreur de chargement des produits
        </p>

        <p className="max-w-sm text-xs text-fg-muted">
          Une erreur est survenue lors de la récupération du catalogue. Veuillez
          réessayer.
        </p>

        <Button variant="secondary" size="sm" onClick={handleRefetch}>
          <RotateCcw size={14} aria-hidden="true" />
          Réessayer
        </Button>
      </div>
    )
  }, [error, handleRefetch])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: MAIN                                                 */
  /* ───────────────────────────────────────────────────────────── */

  if (authLoading || mustCompleteOnboarding) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas">
        <div className="space-y-4 text-center">
          <Loader2
            size={36}
            className="mx-auto animate-spin text-accent"
            aria-hidden="true"
          />

          <p className="text-sm text-fg-muted">Vérification du compte…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-canvas text-fg">
      {/* HERO */}
      <Container padding="hero" size="default">
        {renderHero()}
      </Container>

      {/* PROMO BANNER */}
      <Suspense fallback={null}>
        <PromoBanner />
      </Suspense>

      {/* POPULAR CATEGORIES */}
      <Container padding="section" size="default">
        <Suspense
          fallback={<SectionSkeleton title="Catégories populaires" count={6} />}
        >
          <PopularCategoriesSection />
        </Suspense>
      </Container>

      {/* TODAY'S DEALS */}
      <div className="bg-muted/40">
        <Container padding="section" size="default">
          <Suspense fallback={<SectionSkeleton title="Offres du jour" count={4} />}>
            <TodaysDeals />
          </Suspense>
        </Container>
      </div>

      {/* BEST SELLERS */}
      <Container padding="section" size="default">
        <Suspense
          fallback={<SectionSkeleton title="Meilleures ventes" count={4} />}
        >
          <BestSellers />
        </Suspense>
      </Container>

      {/* NEW ARRIVALS */}
      <div className="bg-muted/40">
        <Container padding="section" size="default">
          <Suspense fallback={<SectionSkeleton title="Nouveautés" count={4} />}>
            <NewArrivals />
          </Suspense>
        </Container>
      </div>

      {/* CATALOGUE */}
      <Container padding="section" size="default" id="catalogue">
        {catalogueHeader}

        {showFilters && (
          <div
            id="catalogue-filters"
            className="mb-6 rounded-card border border-line bg-surface p-4 lg:hidden"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Filtres actifs
            </p>

            <div className="flex flex-wrap gap-2">
              {hasActiveFilters ? (
                <Button variant="ghost" size="xs" onClick={handleResetFilters}>
                  <RotateCcw size={12} aria-hidden="true" />
                  Tout effacer
                </Button>
              ) : (
                <p className="text-xs text-fg-muted">Aucun filtre actif.</p>
              )}
            </div>
          </div>
        )}

        {catalogueError}

        {!error && (
          <ProductGrid
            products={products}
            loading={isLoading}
            onRetry={handleRefetch}
            emptyState={{
              title: 'Aucun produit trouvé',
              description: hasActiveFilters
                ? "Essayez d'autres critères ou réinitialisez vos filtres."
                : 'Explorez notre catalogue complet.',
              actionLabel: hasActiveFilters
                ? 'Réinitialiser les filtres'
                : 'Voir tout le catalogue',
              onAction: hasActiveFilters ? handleResetFilters : undefined,
            }}
            viewMode={viewMode}
            animated
            showQuickSort
            onQuickView={setQuickViewProductId}
          />
        )}

        {hasNextPage && !error && (
          <div ref={sentinelRef} className="mt-8 flex items-center justify-center">
            {isFetchingNextPage ? (
              <span className="inline-flex items-center gap-2 text-sm text-fg-muted">
                <Loader2
                  size={16}
                  className="animate-spin text-accent"
                  aria-hidden="true"
                />
                Chargement…
              </span>
            ) : (
              <Button variant="secondary" size="sm" onClick={loadMore}>
                Charger plus de produits
              </Button>
            )}
          </div>
        )}
      </Container>

      {/* TRUST */}
      <div className="border-t border-line bg-surface">
        <Container padding="section" size="default">
          <Suspense fallback={null}>
            <TrustSection />
          </Suspense>
        </Container>
      </div>

      {/* TESTIMONIALS */}
      <Container padding="section" size="default">
        <Suspense fallback={null}>
          <TestimonialsSection />
        </Suspense>
      </Container>

      {/* FOOTER REASSURANCE */}
      <div className="border-t border-line bg-muted/30">
        <Container padding="compact" size="default">
          <Suspense fallback={null}>
            <FooterReassurance />
          </Suspense>
        </Container>
      </div>

      {/* SCROLL TO TOP */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className={cn(
            'fixed bottom-6 right-6 z-40 inline-flex h-11 w-11 items-center justify-center',
            'rounded-full border border-line bg-surface text-fg shadow-raised',
            'transition-all duration-200 ease-out',
            'hover:border-accent hover:bg-accent hover:text-accent-contrast',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
            'animate-fade-in-up'
          )}
          aria-label="Retour en haut de page"
        >
          <ArrowUp size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      {/* QUICK VIEW — vrai composant aligné USD / CDF */}
      {quickViewProductId && (
        <ProductQuickView
          productId={quickViewProductId}
          onClose={handleCloseQuickView}
          isOpen
        />
      )}
    </div>
  )
}