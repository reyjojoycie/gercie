// app/categories/[slug]/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'

import { motion, AnimatePresence } from 'framer-motion'

import { Container } from '@/components/layout/Container'
import { ProductGrid } from '@/components/ProductGrid'
import { FilterBar } from '@/components/FilterBar'
import { useProductFilters } from '@/hooks/useProductFilters'
import { useProducts } from '@/hooks/useProducts'

import { useCategories, findCategoryBySlug } from '@/hooks/useCategories'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ScrollToTop } from '@/components/ui/ScrollToTop'

import {
  AlertTriangle,
  ChevronRight,
  Filter,
  Grid3X3,
  Home,
  List,
  Loader2,
  Package,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'

import * as Icons from 'lucide-react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  DYNAMIC IMPORTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Vrai QuickView aligné USD principal / CDF calculé.
 * Il charge le produit, applique useExchangeRate(), gère les variantes
 * et ajoute au panier avec un payload cohérent CartContext.
 */
const ProductQuickView = dynamic(
  () => import('@/components/ProductQuickView'),
  { ssr: false }
)

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface CategoryNode {
  id: string
  nom: string
  slug?: string | null
  chemin_complet?: string | null
  description?: string | null
  icone?: string | null
  children?: CategoryNode[]
  [key: string]: any
}

type ViewMode = 'grid' | 'list'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 350

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function getSlugParam(param: unknown): string | undefined {
  if (Array.isArray(param)) {
    return typeof param[0] === 'string' ? param[0] : undefined
  }

  return typeof param === 'string' ? param : undefined
}

function findCategoryPath(
  nodes: CategoryNode[] | undefined,
  slug: string,
  trail: CategoryNode[] = []
): CategoryNode[] | null {
  for (const node of nodes || []) {
    const nextTrail = [...trail, node]

    if (node.slug === slug) {
      return nextTrail
    }

    const childPath = findCategoryPath(node.children, slug, nextTrail)

    if (childPath) {
      return childPath
    }
  }

  return null
}

function resolveIcon(iconName?: string | null) {
  if (!iconName) return Package

  const candidate = (Icons as any)[iconName]

  return typeof candidate === 'function' ? candidate : Package
}

function getCategoryPrefix(
  category: CategoryNode | null,
  path: CategoryNode[] | null
): string | undefined {
  if (category?.chemin_complet) {
    return category.chemin_complet
  }

  if (path && path.length > 0) {
    return path.map((node) => node.nom).join(' > ')
  }

  return category?.nom || undefined
}

function buildCategoryHref(node: CategoryNode): string {
  const slug = node.slug || node.nom

  return `/categories/${encodeURIComponent(slug)}`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SKELETON                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function CategoryPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-16 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <Container className="py-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="skeleton h-4 w-20 rounded-full" />
            <div className="skeleton h-4 w-4 rounded-full" />
            <div className="skeleton h-4 w-32 rounded-full" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="skeleton h-9 w-64 rounded-full" />
              <div className="skeleton h-4 w-96 rounded-full" />
            </div>

            <div className="skeleton h-10 w-64 rounded-full" />
          </div>
        </Container>
      </div>

      <Container className="py-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`category-skeleton-${index}`}
              className="space-y-3 rounded-card border border-border bg-card p-3"
            >
              <div className="skeleton aspect-square w-full rounded-control" />
              <div className="skeleton h-4 w-3/4 rounded-full" />
              <div className="skeleton h-3 w-1/2 rounded-full" />
            </div>
          ))}
        </div>
      </Container>

      <span className="sr-only">Chargement de la catégorie…</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function CategoryPage() {
  const params = useParams<{ slug: string | string[] }>()
  const slug = getSlugParam(params?.slug)

  const router = useRouter()
  const filters = useProductFilters()

  const {
    data: categoriesTree,
    isLoading: isCategoriesLoading,
    error: categoriesError,
  } = useCategories()

  const [searchQuery, setSearchQuery] = useState('')
  const [deferredSearchQuery, setDeferredSearchQuery] = useState('')

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)
  const [quickViewProductId, setQuickViewProductId] = useState<string | null>(null)

  /* ---------------------------------------------------------- */
  /* Arbre catégories                                            */
  /* ---------------------------------------------------------- */

  const tree = useMemo<CategoryNode[]>(() => {
    return Array.isArray(categoriesTree) ? categoriesTree : []
  }, [categoriesTree])

  const currentCategory = useMemo(() => {
    if (!tree.length || !slug) return null

    return findCategoryBySlug(tree, slug) || null
  }, [slug, tree])

  const categoryPath = useMemo(() => {
    if (!tree.length || !slug) return null

    return findCategoryPath(tree, slug)
  }, [slug, tree])

  const subCategories = useMemo(() => {
    return currentCategory?.children || []
  }, [currentCategory])

  const categoryPrefix = useMemo(() => {
    return getCategoryPrefix(currentCategory, categoryPath)
  }, [categoryPath, currentCategory])

  const lockedMainCategory = useMemo(() => {
    return (
      categoryPath?.[0]?.nom ||
      currentCategory?.nom ||
      'Catalogue'
    )
  }, [categoryPath, currentCategory])

  /* ---------------------------------------------------------- */
  /* Recherche débouncée                                         */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDeferredSearchQuery(searchQuery.trim())
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [searchQuery])

  /* ---------------------------------------------------------- */
  /* Filtres produits                                            */
  /* ---------------------------------------------------------- */

  /**
   * IMPORTANT :
   * On ne passe pas selectedMainCategory depuis les filtres globaux,
   * sinon il pourrait entrer en conflit avec la catégorie courante.
   *
   * La catégorie est verrouillée via categorie_prefix.
   * Les autres filtres restent actifs.
   */
  const productFilters = useMemo(() => {
    return {
      categorie_prefix: categoryPrefix,

      selectedSubCategory: filters.selectedSubCategory || undefined,
      selectedType: filters.selectedType || undefined,
      selectedDetail: filters.selectedDetail || undefined,

      min_price: filters.minPrice || undefined,
      max_price: filters.maxPrice || undefined,

      sort_by: filters.sortBy || 'recent',
      sort_order: filters.sortOrder || 'desc',

      search: deferredSearchQuery || undefined,
    }
  }, [
    categoryPrefix,
    deferredSearchQuery,
    filters.maxPrice,
    filters.minPrice,
    filters.selectedDetail,
    filters.selectedSubCategory,
    filters.selectedType,
    filters.sortBy,
    filters.sortOrder,
  ])

  const {
    products,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useProducts(productFilters as any)

  /* ---------------------------------------------------------- */
  /* Pagination locale                                           */
  /* ---------------------------------------------------------- */

  const visibleCount = currentPage * PAGE_SIZE

  const paginatedProducts = useMemo(() => {
    return products.slice(0, visibleCount)
  }, [products, visibleCount])

  const canLoadMore = visibleCount < products.length

  const loadMore = useCallback(() => {
    setCurrentPage((previous) => previous + 1)
  }, [])

  /* ---------------------------------------------------------- */
  /* Reset pagination                                            */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    setCurrentPage(1)
  }, [
    categoryPrefix,
    deferredSearchQuery,
    filters.maxPrice,
    filters.minPrice,
    filters.selectedDetail,
    filters.selectedSubCategory,
    filters.selectedType,
    filters.sortBy,
    filters.sortOrder,
    slug,
  ])

  /* ---------------------------------------------------------- */
  /* Titre document                                              */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document === 'undefined') return

    if (currentCategory?.nom) {
      document.title = `${currentCategory.nom} | Gercie`
    } else if (slug) {
      document.title = 'Catégorie | Gercie'
    }
  }, [currentCategory?.nom, slug])

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleResetFilters = useCallback(() => {
    filters.resetFilters?.()
    setSearchQuery('')
    setDeferredSearchQuery('')
    setCurrentPage(1)
  }, [filters])

  const handleCloseQuickView = useCallback(() => {
    setQuickViewProductId(null)
  }, [])

  const handleGoToAllCategories = useCallback(() => {
    router.push('/categories')
  }, [router])

  /* ---------------------------------------------------------- */
  /* FilterBar props                                             */
  /* ---------------------------------------------------------- */

  const filterBarProps = useMemo(() => {
    return {
      selectedMainCategory: lockedMainCategory,
      setSelectedMainCategory: () => {
        // Verrouillé sur la page catégorie.
      },

      selectedSubCategory: filters.selectedSubCategory ?? '',
      setSelectedSubCategory:
        filters.setSelectedSubCategory ?? (() => {}),

      selectedType: filters.selectedType ?? '',
      setSelectedType: filters.setSelectedType ?? (() => {}),

      selectedDetail: filters.selectedDetail ?? '',
      setSelectedDetail: filters.setSelectedDetail ?? (() => {}),

      minPrice: filters.minPrice ?? 0,
      setMinPrice: filters.setMinPrice ?? (() => {}),

      maxPrice: filters.maxPrice ?? 0,
      setMaxPrice: filters.setMaxPrice ?? (() => {}),

      sortBy: filters.sortBy ?? 'recent',
      setSortBy: filters.setSortBy ?? (() => {}),

      sortOrder: filters.sortOrder ?? 'desc',
      setSortOrder: filters.setSortOrder ?? (() => {}),
    }
  }, [
    filters.maxPrice,
    filters.minPrice,
    filters.selectedDetail,
    filters.selectedSubCategory,
    filters.selectedType,
    filters.setDetail,
    filters.setMaxPrice,
    filters.setMinPrice,
    filters.setSelectedDetail,
    filters.setSelectedSubCategory,
    filters.setSelectedType,
    filters.setSortBy,
    filters.setSortOrder,
    filters.sortBy,
    filters.sortOrder,
    lockedMainCategory,
  ])

  /* ---------------------------------------------------------- */
  /* Icône catégorie                                             */
  /* ---------------------------------------------------------- */

  const IconComponent = useMemo(() => {
    return resolveIcon(currentCategory?.icone)
  }, [currentCategory?.icone])

  /* ---------------------------------------------------------- */
  /* États early return                                          */
  /* ---------------------------------------------------------- */

  if (isCategoriesLoading) {
    return <CategoryPageSkeleton />
  }

  if (categoriesError && !currentCategory) {
    return (
      <Container className="py-20 text-center">
        <AlertTriangle
          className="mx-auto mb-4 text-amber-500"
          size={48}
          aria-hidden="true"
        />

        <h2 className="mb-2 text-2xl font-bold text-foreground">
          Catégories indisponibles
        </h2>

        <p className="mb-6 text-muted-foreground">
          Impossible de charger l’arborescence des catégories pour le moment.
        </p>

        <Button
          variant="luxe"
          onClick={() => router.refresh()}
          leftIcon={<RefreshCw size={16} aria-hidden="true" />}
        >
          Réessayer
        </Button>
      </Container>
    )
  }

  if (!currentCategory) {
    return (
      <Container className="py-20 text-center">
        <AlertTriangle
          className="mx-auto mb-4 text-amber-500"
          size={48}
          aria-hidden="true"
        />

        <h2 className="mb-2 text-2xl font-bold text-foreground">
          Catégorie introuvable
        </h2>

        <p className="mb-6 text-muted-foreground">
          La catégorie que vous recherchez n’existe pas ou a été supprimée.
        </p>

        <Button
          variant="luxe"
          onClick={handleGoToAllCategories}
          leftIcon={<Package size={16} aria-hidden="true" />}
        >
          Voir toutes les catégories
        </Button>
      </Container>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ====================================================
          BARRE SUPÉRIEURE / FILTRES
         ==================================================== */}
      <div className="sticky top-16 z-30 border-b border-border bg-background/80 shadow-sm backdrop-blur-xl">
        <Container className="py-3">
          {/* Breadcrumb */}
          <nav
            className="scrollbar-hide mb-3 flex items-center gap-2 overflow-x-auto text-xs"
            aria-label="Fil d’Ariane"
          >
            <Link
              href="/"
              className="flex shrink-0 items-center gap-1 text-muted-foreground transition-colors hover:text-gold-500"
            >
              <Home size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Accueil</span>
            </Link>

            {categoryPath && categoryPath.length > 0 ? (
              categoryPath.map((node, index) => {
                const isLast = index === categoryPath.length - 1

                return (
                  <div
                    key={`${node.id || node.nom}-${index}`}
                    className="flex shrink-0 items-center gap-2"
                  >
                    <ChevronRight
                      size={12}
                      className="text-muted-foreground"
                      aria-hidden="true"
                    />

                    {isLast ? (
                      <span
                        className="max-w-[180px] truncate font-medium text-gold-500"
                        aria-current="page"
                      >
                        {node.nom}
                      </span>
                    ) : node.slug ? (
                      <Link
                        href={buildCategoryHref(node)}
                        className="max-w-[140px] truncate text-muted-foreground transition-colors hover:text-gold-500"
                      >
                        {node.nom}
                      </Link>
                    ) : (
                      <span className="max-w-[140px] truncate text-muted-foreground">
                        {node.nom}
                      </span>
                    )}
                  </div>
                )
              })
            ) : (
              <>
                <ChevronRight
                  size={12}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />

                <span
                  className="max-w-[180px] truncate font-medium text-gold-500"
                  aria-current="page"
                >
                  {currentCategory.nom}
                </span>
              </>
            )}
          </nav>

          {/* Titre + actions */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="flex items-center gap-3 font-serif text-3xl font-bold text-foreground md:text-4xl">
                <IconComponent
                  className="shrink-0 text-gold-500"
                  size={32}
                  aria-hidden="true"
                />

                <span className="truncate">{currentCategory.nom}</span>
              </h1>

              {currentCategory.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentCategory.description}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => setShowMobileFilters(true)}
                className="md:hidden"
                leftIcon={<Filter size={16} aria-hidden="true" />}
              >
                Filtres
              </Button>

              <div className="hidden items-center gap-2 md:flex">
                <Input
                  leftIcon={
                    <Search
                      size={16}
                      className="text-muted-foreground"
                      aria-hidden="true"
                    />
                  }
                  placeholder="Rechercher dans cette catégorie..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  allowClear
                  onClear={() => setSearchQuery('')}
                  variant="glass"
                  size="sm"
                  className="w-64"
                />

                <div className="flex rounded-full border border-border bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      'rounded-full p-1.5 transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                      viewMode === 'grid'
                        ? 'bg-gold-500 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    aria-label="Vue grille"
                    aria-pressed={viewMode === 'grid'}
                  >
                    <Grid3X3 size={16} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={cn(
                      'rounded-full p-1.5 transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                      viewMode === 'list'
                        ? 'bg-gold-500 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    aria-label="Vue liste"
                    aria-pressed={viewMode === 'list'}
                  >
                    <List size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sous-catégories */}
          {subCategories.length > 0 && (
            <div className="scrollbar-hide -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-2">
              {subCategories.map((sub) => (
                <Link
                  key={sub.id || sub.nom}
                  href={buildCategoryHref(sub)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-gold-400 hover:bg-gold-400/10 hover:text-gold-600"
                >
                  {sub.nom}
                </Link>
              ))}
            </div>
          )}

          {/* FilterBar desktop */}
          <div className="hidden md:block">
            <FilterBar
              {...filterBarProps}
              totalProducts={products.length}
              onResetFilters={handleResetFilters}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              placeholderSearch="Rechercher un produit..."
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              showViewToggle
              isFetching={isFetching || isLoading}
            />
          </div>
        </Container>
      </div>

      {/* ====================================================
          CONTENU PRINCIPAL
         ==================================================== */}
      <Container className="flex-1 py-8">
        {error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle
              className="mx-auto mb-4 text-red-500"
              size={48}
              aria-hidden="true"
            />

            <h3 className="mb-2 text-xl font-semibold text-foreground">
              Erreur de chargement
            </h3>

            <p className="mb-6 text-sm text-muted-foreground">
              {typeof error === 'string'
                ? error
                : 'Impossible de charger les produits de cette catégorie.'}
            </p>

            <Button
              variant="danger"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshCw size={16} aria-hidden="true" />}
            >
              Réessayer
            </Button>
          </div>
        ) : (
          <>
            <ProductGrid
              products={paginatedProducts}
              loading={isLoading}
              onRetry={refetch}
              emptyState={{
                title: 'Aucun produit dans cette catégorie',
                description:
                  'Aucun article trouvé avec les critères actuels. Essayez d’élargir votre recherche.',
                actionLabel: 'Voir toutes les catégories',
                onAction: handleGoToAllCategories,
              }}
              columns="auto"
              viewMode={viewMode}
              animated
              showQuickSort
              onQuickView={setQuickViewProductId}
            />

            {canLoadMore && (
              <div className="mt-8 flex justify-center">
                <Button
                  variant="outline-gold"
                  size="md"
                  onClick={loadMore}
                  disabled={isFetching || isLoading}
                  loading={isFetching || isLoading}
                  leftIcon={
                    isFetching || isLoading ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : undefined
                  }
                >
                  Afficher plus de produits
                </Button>
              </div>
            )}
          </>
        )}
      </Container>

      {/* ====================================================
          MOBILE FILTER DRAWER
         ==================================================== */}
      <AnimatePresence>
        {showMobileFilters && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowMobileFilters(false)}
              aria-hidden="true"
            />

            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute bottom-0 left-0 top-0 z-10 w-80 overflow-y-auto bg-card p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Filtres mobiles"
            >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">Filtres</h3>

                <button
                  type="button"
                  onClick={() => setShowMobileFilters(false)}
                  className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                  aria-label="Fermer les filtres"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              <FilterBar
                {...filterBarProps}
                totalProducts={products.length}
                onResetFilters={handleResetFilters}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                showViewToggle
                isFetching={isFetching || isLoading}
                className="static border-none bg-transparent p-0 shadow-none backdrop-blur-none"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ====================================================
          QUICK VIEW
         ==================================================== */}
      {quickViewProductId && (
        <ProductQuickView
          productId={quickViewProductId}
          isOpen
          onClose={handleCloseQuickView}
        />
      )}

      <ScrollToTop
        variant="circle"
        showProgress
        tooltip="Retour en haut"
      />
    </div>
  )
}