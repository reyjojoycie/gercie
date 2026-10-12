// components/HomePageClient.tsx
'use client'

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react'
import {
  ArrowUp,
  Shield,
  Truck,
  Sparkles,
  Zap,
  Star,
  TrendingUp,
  Loader2,
  AlertTriangle,
  RefreshCcw,
  ShoppingBag,
  Percent,
  Gift,
  Clock,
  MapPin,
  ChevronRight,
  LayoutGrid,
  List,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { HeroSection } from '@/components/HeroSection'
import { ProductGrid } from '@/components/ProductGrid'
import { FilterBar } from '@/components/FilterBar'
import { Recommendations } from '@/components/Recommendations'
import { useProductFilters } from '@/hooks/useProductFilters'
import { useProducts } from '@/hooks/useProducts'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useCart } from '@/contexts/CartContext'
import { cn } from '@/lib/utils'
import { useInView } from 'react-intersection-observer'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Client React Query ultra‑optimisé ─────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      keepPreviousData: true, // évite les flashs
    },
  },
})

// ─── Composant principal (wrappé par QueryClientProvider) ─
function HomeContent() {
  const filters = useProductFilters()
  const { rate } = useExchangeRate()
  const { addItem } = useCart()

  // Requête produits avec pagination automatique via useInfiniteQuery ? 
  // On garde useProducts (version sans pagination) mais on pourrait l'améliorer
  const {
    products,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useProducts({
    search: filters.debouncedSearch || undefined,
    categorie_prefix: filters.selectedDetail
      ? `${filters.selectedMainCategory} > ${filters.selectedSubCategory} > ${filters.selectedType} > ${filters.selectedDetail}`
      : filters.selectedType
        ? `${filters.selectedMainCategory} > ${filters.selectedSubCategory} > ${filters.selectedType}`
        : filters.selectedSubCategory
          ? `${filters.selectedMainCategory} > ${filters.selectedSubCategory}`
          : filters.selectedMainCategory || undefined,
    min_price: filters.minPrice || undefined,
    max_price: filters.maxPrice || undefined,
    sort_by: filters.sortBy,
    sort_order: filters.sortOrder,
  })

  // États UI
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Détection de la section pour lazy loading des recommandations
  const { ref: recosRef, inView: recosInView } = useInView({
    triggerOnce: true,
    rootMargin: '200px',
  })

  // Scroll to top
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 600)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Ajout rapide au panier (fonction exposée au ProductGrid, déjà géré)
  // On pourrait ajouter un indicateur de quick add, mais c'est déjà dans ProductCard

  // Filtres actifs (pour afficher des badges)
  const activeFilterCount = useMemo(
    () =>
      (filters.selectedMainCategory ? 1 : 0) +
      (filters.selectedSubCategory ? 1 : 0) +
      (filters.selectedType ? 1 : 0) +
      (filters.selectedDetail ? 1 : 0) +
      (filters.minPrice ? 1 : 0) +
      (filters.maxPrice ? 1 : 0),
    [filters]
  )

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 relative">
      {/* Hero compact (déjà optimisé) */}
      <HeroSection
        badge="Marketplace Ultra‑Premium"
        title="L'excellence redéfinie"
        highlight="à la congolaise"
        description="Achetez et vendez en toute confiance. Authenticité, livraison express, paiement en CDF et USD."
        badges={[
          { icon: <Shield size={12} />, text: 'Paiement sécurisé' },
          { icon: <Truck size={12} />, text: 'Livraison express' },
          { icon: <Sparkles size={12} />, text: 'Authenticité' },
        ]}
        ctaLabel="Explorer"
        ctaHref="/categories"
        showScrollIndicator={false}
      />

      {/* Barre de filtres améliorée */}
      <div className="sticky top-16 z-40 bg-white/80 dark:bg-midnight-900/80 backdrop-blur-xl border-b border-gold-400/20 shadow-soft">
        <Container className="py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 overflow-x-auto scrollbar-hide">
              <FilterBar
                selectedMainCategory={filters.selectedMainCategory}
                setSelectedMainCategory={filters.setSelectedMainCategory}
                selectedSubCategory={filters.selectedSubCategory}
                setSelectedSubCategory={filters.setSelectedSubCategory}
                selectedType={filters.selectedType}
                setSelectedType={filters.setSelectedType}
                selectedDetail={filters.selectedDetail}
                setSelectedDetail={filters.setSelectedDetail}
                minPrice={filters.minPrice}
                setMinPrice={filters.setMinPrice}
                maxPrice={filters.maxPrice}
                setMaxPrice={filters.setMaxPrice}
                sortBy={filters.sortBy}
                setSortBy={filters.setSortBy}
                sortOrder={filters.sortOrder}
                setSortOrder={filters.setSortOrder}
                totalProducts={products.length}
                onResetFilters={filters.resetFilters}
              />
            </div>

            {/* Actions rapides */}
            <div className="hidden md:flex items-center gap-2">
              <Button
                variant="outline-gold"
                size="icon"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                title={viewMode === 'grid' ? 'Vue liste' : 'Vue grille'}
              >
                {viewMode === 'grid' ? <List size={16} /> : <LayoutGrid size={16} />}
              </Button>
              <Button
                variant="outline-gold"
                size="sm"
                leftIcon={<RefreshCcw size={14} />}
                onClick={() => refetch()}
                loading={isFetching}
              >
                Actualiser
              </Button>
            </div>

            {/* Mobile filter toggle */}
            <Button
              variant="outline-gold"
              size="sm"
              className="md:hidden"
              leftIcon={<SlidersHorizontal size={16} />}
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              Filtres {activeFilterCount > 0 && `(${activeFilterCount})`}
            </Button>
          </div>

          {/* Badges de filtres actifs */}
          <AnimatePresence>
            {activeFilterCount > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex flex-wrap gap-2 mt-3 overflow-hidden"
              >
                {filters.selectedMainCategory && (
                  <Badge variant="gold" size="sm" className="cursor-pointer" onClick={() => filters.setSelectedMainCategory('')}>
                    {filters.selectedMainCategory} <X size={12} className="ml-1" />
                  </Badge>
                )}
                {filters.selectedSubCategory && (
                  <Badge variant="gold" size="sm" className="cursor-pointer" onClick={() => filters.setSelectedSubCategory('')}>
                    {filters.selectedSubCategory} <X size={12} className="ml-1" />
                  </Badge>
                )}
                {filters.selectedType && (
                  <Badge variant="gold" size="sm" className="cursor-pointer" onClick={() => filters.setSelectedType('')}>
                    {filters.selectedType} <X size={12} className="ml-1" />
                  </Badge>
                )}
                {filters.selectedDetail && (
                  <Badge variant="gold" size="sm" className="cursor-pointer" onClick={() => filters.setSelectedDetail('')}>
                    {filters.selectedDetail} <X size={12} className="ml-1" />
                  </Badge>
                )}
                {filters.minPrice && (
                  <Badge variant="gold" size="sm" className="cursor-pointer" onClick={() => filters.setMinPrice('')}>
                    Min {Number(filters.minPrice).toLocaleString()} FC <X size={12} className="ml-1" />
                  </Badge>
                )}
                {filters.maxPrice && (
                  <Badge variant="gold" size="sm" className="cursor-pointer" onClick={() => filters.setMaxPrice('')}>
                    Max {Number(filters.maxPrice).toLocaleString()} FC <X size={12} className="ml-1" />
                  </Badge>
                )}
                <button onClick={filters.resetFilters} className="text-xs text-gold-600 hover:text-gold-500">
                  Tout effacer
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </Container>
      </div>

      {/* Panneau mobile pour les filtres (overlay) */}
      <AnimatePresence>
        {showMobileFilters && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 md:hidden bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMobileFilters(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 max-h-[80vh] bg-white dark:bg-midnight-900 rounded-t-3xl p-6 overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-lg">Filtres</h3>
                <button onClick={() => setShowMobileFilters(false)}><X size={20} /></button>
              </div>
              {/* On réutilise FilterBar avec une orientation verticale ? 
                  On peut simplement afficher les mêmes composants mais en mode mobile optimisé.
                  Pour la simplicité, on passe les mêmes props au FilterBar en dessous, mais
                  idéalement FilterBar devrait être responsive. Ici on va juste afficher les catégories.
              */}
              <FilterBar
                selectedMainCategory={filters.selectedMainCategory}
                setSelectedMainCategory={filters.setSelectedMainCategory}
                selectedSubCategory={filters.selectedSubCategory}
                setSelectedSubCategory={filters.setSelectedSubCategory}
                selectedType={filters.selectedType}
                setSelectedType={filters.setSelectedType}
                selectedDetail={filters.selectedDetail}
                setSelectedDetail={filters.setSelectedDetail}
                minPrice={filters.minPrice}
                setMinPrice={filters.setMinPrice}
                maxPrice={filters.maxPrice}
                setMaxPrice={filters.setMaxPrice}
                sortBy={filters.sortBy}
                setSortBy={filters.setSortBy}
                sortOrder={filters.sortOrder}
                setSortOrder={filters.setSortOrder}
                totalProducts={products.length}
                onResetFilters={filters.resetFilters}
              />
              <Button
                variant="luxe"
                fullWidth
                className="mt-6"
                onClick={() => setShowMobileFilters(false)}
              >
                Appliquer
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section produits */}
      <div className="relative pattern-dots opacity-5 dark:opacity-10">
        <Container className="py-8 md:py-12 min-h-[50vh]">
          {/* Barre de stats */}
          <div className="flex items-center justify-between mb-6">
            <div>
              {!isLoading && !isFetching && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                    {products.length}
                  </span>{' '}
                  produit{products.length > 1 ? 's' : ''} trouvé{products.length > 1 ? 's' : ''}
                </p>
              )}
              {(isLoading || isFetching) && (
                <p className="text-sm text-neutral-400 animate-pulse flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Chargement...
                </p>
              )}
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <AlertTriangle size={14} />
                <span>Erreur</span>
                <Button variant="outline-gold" size="sm" onClick={() => refetch()}>
                  Réessayer
                </Button>
              </div>
            )}
          </div>

          <ProductGrid
            products={products}
            loading={isLoading}
            error={error ?? undefined}
            onRetry={refetch}
            emptyState={{
              title: 'Aucun produit trouvé',
              description: 'Essayez d’autres critères ou explorez notre catalogue.',
              actionLabel: 'Voir tout le catalogue',
              onAction: filters.resetFilters,
            }}
            viewMode={viewMode}
            animated
          />
        </Container>
      </div>

      {/* Section promos / nouveautés (affichée dès que visible) */}
      <div ref={recosRef}>
        {recosInView && (
          <>
            <Recommendations type="trending" maxItems={6} title="🔥 Tendances du moment" />
            <Recommendations type="ai-personalized" maxItems={6} title="✨ Recommandé pour vous" />
          </>
        )}
      </div>

      {/* Barre de confiance */}
      <div className="border-t border-gold-400/20 bg-gradient-to-r from-midnight-900/50 via-midnight-800/30 to-midnight-900/50 py-6">
        <Container>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
            <div className="flex flex-col items-center gap-1">
              <Shield size={20} className="text-gold-400" />
              <span className="font-medium text-neutral-300">Paiement sécurisé</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Truck size={20} className="text-gold-400" />
              <span className="font-medium text-neutral-300">Livraison rapide</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <RefreshCcw size={20} className="text-gold-400" />
              <span className="font-medium text-neutral-300">Retours gratuits</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Headset size={20} className="text-gold-400" />
              <span className="font-medium text-neutral-300">Support 7/7</span>
            </div>
          </div>
        </Container>
      </div>

      {/* Bouton retour en haut */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="fixed bottom-6 right-6 z-50 p-3 bg-gold-500 hover:bg-gold-600 text-white rounded-full shadow-gold animate-glow-pulse"
            onClick={scrollToTop}
            aria-label="Retour en haut"
          >
            <ArrowUp size={20} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Export du composant avec le provider ───────────────
export default function HomePageClient() {
  return (
    <QueryClientProvider client={queryClient}>
      <HomeContent />
    </QueryClientProvider>
  )
}