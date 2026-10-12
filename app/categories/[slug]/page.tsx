// app/categories/[slug]/page.tsx
'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Container,
  Section,
  Stack,
} from '@/components/layout/Container'
import { ProductGrid } from '@/components/ProductGrid'
import { FilterBar } from '@/components/FilterBar'
import { useProductFilters } from '@/hooks/useProductFilters'
import { useProducts, useInfiniteProducts } from '@/hooks/useProducts'
import { categoryTree, mainCategories, getSubCategories, getTypes, getDetails, getCategoryIcon } from '@/lib/categories'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import {
  ChevronRight,
  Home,
  SlidersHorizontal,
  Search,
  Grid3X3,
  List,
  TrendingUp,
  Sparkles,
  Filter,
  X,
  ChevronDown,
  Star,
  Package,
  Users,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types utilitaires pour l'arbre des catégories (inchangé)          */
/* ------------------------------------------------------------------ */
interface CategoryNode {
  id: string
  name: string
  icon?: string
  children?: CategoryNode[]
}

/* ------------------------------------------------------------------ */
/*  Fonctions récursives pour le breadcrumb et le chemin              */
/* ------------------------------------------------------------------ */
function getCategoryPathById(
  node: CategoryNode,
  targetId: string,
  path: string[] = [],
): string[] | null {
  const currentPath = [...path, node.name]
  if (node.id === targetId) return currentPath
  if (node.children) {
    for (const child of node.children) {
      const result = getCategoryPathById(child, targetId, currentPath)
      if (result) return result
    }
  }
  return null
}

function getCategoryNodeById(node: CategoryNode, targetId: string): CategoryNode | null {
  if (node.id === targetId) return node
  if (node.children) {
    for (const child of node.children) {
      const found = getCategoryNodeById(child, targetId)
      if (found) return found
    }
  }
  return null
}

function getFullPathFromSlug(slug: string): string | null {
  for (const root of categoryTree) {
    const path = getCategoryPathById(root, slug)
    if (path) return path.join(' > ')
  }
  return null
}

function getBreadcrumbsFromSlug(slug: string): { name: string; id: string }[] {
  for (const root of categoryTree) {
    const parts = getCategoryPathById(root, slug)
    if (parts) {
      let currentRoot = categoryTree
      return parts.map(name => {
        const found = currentRoot.find(c => c.name === name)
        const id = found?.id ?? ''
        currentRoot = found?.children || []
        return { name, id }
      })
    }
  }
  return []
}

/* ================================================================== */
/*  Composant principal de la page catégorie                           */
/* ================================================================== */
export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const filters = useProductFilters()

  // États locaux
  const [categoryName, setCategoryName] = useState<string>('')
  const [categoryPath, setCategoryPath] = useState<string | null>(null)
  const [categoryBreadcrumbs, setCategoryBreadcrumbs] = useState<{ name: string; id: string }[]>([])
  const [categoryDescription, setCategoryDescription] = useState<string>('')
  const [categoryIcon, setCategoryIcon] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Catégorie courante (nœud complet)
  const currentCategoryNode = useMemo(() => {
    for (const root of categoryTree) {
      const node = getCategoryNodeById(root, slug)
      if (node) return node
    }
    return null
  }, [slug])

  // Sous-catégories directes (enfants du nœud courant)
  const subCategories = useMemo(
    () => currentCategoryNode?.children || [],
    [currentCategoryNode],
  )

  // Initialisation des métadonnées et du breadcrumb
  useEffect(() => {
    if (!slug) return
    const fullPath = getFullPathFromSlug(slug)
    const parts = fullPath ? fullPath.split(' > ') : []
    const name = parts[parts.length - 1] || 'Catégorie'
    setCategoryName(name)
    setCategoryPath(fullPath)

    const crumbs = getBreadcrumbsFromSlug(slug)
    setCategoryBreadcrumbs(crumbs)

    const node = crumbs.length > 0
      ? getCategoryNodeById(categoryTree.find(c => c.id === crumbs[0].id)!, slug) // un peu tordu mais pour récup l'icône
      : null
    if (currentCategoryNode) {
      setCategoryIcon(currentCategoryNode.icon)
      // On peut définir une description basée sur le nom
      setCategoryDescription(`Découvrez notre sélection de ${name.toLowerCase()}.`)
    }

    // Mise à jour du titre de la page
    document.title = `${name} | Gercie`
  }, [slug, currentCategoryNode])

  // Récupération des produits avec filtres et recherche locale
  const {
    products,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useProducts({
    categorie_prefix: categoryPath || undefined,
    search: searchQuery || undefined,
    min_price: filters.minPrice || undefined,
    max_price: filters.maxPrice || undefined,
    sort_by: filters.sortBy,
    sort_order: filters.sortOrder,
  })

  // Pagination infinie (alternative, on peut laisser le choix selon les besoins)
  // Ici, nous utilisons la version simple, mais nous pourrions switcher si nécessaire.
  // Pour l'exemple, on garde la pagination simple, mais on ajoute un bouton "Charger plus".
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return products.slice(start, start + pageSize)
  }, [products, currentPage, pageSize])
  const totalPages = Math.ceil(products.length / pageSize)
  const canLoadMore = currentPage < totalPages

  const loadMore = useCallback(() => {
    setCurrentPage(prev => prev + 1)
  }, [])

  // Réinitialiser la page quand les filtres changent
  useEffect(() => {
    setCurrentPage(1)
  }, [filters.selectedMainCategory, searchQuery, filters.minPrice, filters.maxPrice, categoryPath])

  // Gérer la recherche via FilterBar (si on utilise la version enrichie, il faut lui passer les props)
  // Nous allons utiliser FilterBar avec les nouvelles props : searchQuery, onSearchChange, viewMode...
  // Si la version enrichie n'est pas utilisée, on peut gérer la recherche localement.

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* --- Barre supérieure avec glassmorphism & filtres --- */}
      <div className="sticky top-16 z-30 backdrop-blur-xl bg-background/80 border-b border-border shadow-sm">
        <Container className="py-3">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs mb-3 overflow-x-auto scrollbar-hide" aria-label="Breadcrumb">
            <Link href="/" className="flex items-center gap-1 text-muted-foreground hover:text-gold-500 transition-colors">
              <Home size={14} />
              <span className="hidden sm:inline">Accueil</span>
            </Link>
            <ChevronRight size={12} className="text-muted-foreground" />
            {categoryBreadcrumbs.length === 0 && (
              <span className="text-gold-500 font-medium">{categoryName}</span>
            )}
            {categoryBreadcrumbs.map((crumb, index) => {
              const isLast = index === categoryBreadcrumbs.length - 1
              return (
                <div key={crumb.id} className="flex items-center gap-2">
                  {isLast ? (
                    <span className="text-gold-500 font-medium truncate max-w-[150px]">{crumb.name}</span>
                  ) : (
                    <>
                      <Link
                        href={`/categories/${crumb.id}`}
                        className="text-muted-foreground hover:text-gold-500 transition-colors truncate max-w-[120px]"
                      >
                        {crumb.name}
                      </Link>
                      <ChevronRight size={12} className="text-muted-foreground" />
                    </>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Titre & description */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground font-serif flex items-center gap-3">
                {categoryIcon && <span className="text-4xl">{categoryIcon}</span>}
                {categoryName || 'Catégorie'}
              </h1>
              {categoryDescription && (
                <p className="text-sm text-muted-foreground mt-1">{categoryDescription}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => setShowMobileFilters(true)}
                className="md:hidden"
                leftIcon={<Filter size={16} />}
              >
                Filtres
              </Button>
              <div className="hidden md:flex items-center gap-2">
                <Input
                  leftIcon={<Search size={16} className="text-muted-foreground" />}
                  placeholder="Rechercher dans cette catégorie..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  allowClear
                  onClear={() => setSearchQuery('')}
                  variant="glass"
                  size="sm"
                  className="w-64"
                />
                <div className="flex rounded-full bg-muted p-1 border border-border">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={cn('p-1.5 rounded-full transition', viewMode === 'grid' ? 'bg-gold-500 text-white' : 'text-muted-foreground')}
                    aria-label="Vue grille"
                  >
                    <Grid3X3 size={16} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={cn('p-1.5 rounded-full transition', viewMode === 'list' ? 'bg-gold-500 text-white' : 'text-muted-foreground')}
                    aria-label="Vue liste"
                  >
                    <List size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Barre de sous-catégories (si présentes) */}
          {subCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
              {subCategories.map(sub => (
                <Link
                  key={sub.id}
                  href={`/categories/${sub.id}`}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-card border border-border hover:bg-gold-400/10 hover:border-gold-400 transition-colors text-muted-foreground hover:text-gold-600"
                >
                  {sub.icon && <span>{sub.icon}</span>}
                  {sub.name}
                </Link>
              ))}
            </div>
          )}

          {/* FilterBar (version enrichie) – ici on lui passe les nouvelles props */}
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
            setSortOrder={filters.sortOrder}
            totalProducts={products.length}
            onResetFilters={filters.resetFilters}
            // nouvelles props
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            placeholderSearch="Rechercher un produit..."
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showViewToggle
            isFetching={isFetching || isLoading}
          />
        </Container>
      </div>

      {/* --- Contenu principal --- */}
      <Container className="py-8 flex-1">
        {/* État d'erreur */}
        {error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="mx-auto text-burgundy-500 mb-4" size={48} />
            <h3 className="text-xl font-semibold text-foreground mb-2">Erreur de chargement</h3>
            <p className="text-muted-foreground text-sm mb-6">{error}</p>
            <Button variant="danger" size="sm" onClick={() => refetch()} leftIcon={<RefreshCw size={16} />}>
              Réessayer
            </Button>
          </div>
        )}

        {/* Grille de produits */}
        {!error && (
          <>
            <ProductGrid
              products={paginatedProducts}
              loading={isLoading}
              error={null}
              onRetry={refetch}
              emptyState={{
                title: 'Aucun produit dans cette catégorie',
                description: 'Aucun article trouvé avec les critères actuels. Essayez d’élargir votre recherche.',
                actionLabel: 'Voir toutes les catégories',
                onAction: () => { window.location.href = '/' },
              }}
              columns="auto"
              viewMode={viewMode}
              animated
            />

            {/* Pagination "Charger plus" */}
            {canLoadMore && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline-gold"
                  size="md"
                  onClick={loadMore}
                  disabled={isFetching || isLoading}
                  loading={isFetching || isLoading}
                >
                  Afficher plus de produits
                </Button>
              </div>
            )}
          </>
        )}
      </Container>

      {/* Bouton retour en haut */}
      <ScrollToTop variant="circle" showProgress tooltip="Retour en haut" />

      {/* Overlay & drawer mobile pour les filtres (similaire à celui de FilterBar mais ici on peut l'étendre) */}
      <AnimatePresence>
        {showMobileFilters && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowMobileFilters(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute left-0 top-0 bottom-0 w-80 bg-card p-6 overflow-y-auto shadow-2xl z-10"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-foreground">Filtres</h3>
                <button onClick={() => setShowMobileFilters(false)}>
                  <X size={20} className="text-muted-foreground" />
                </button>
              </div>
              {/* Contenu simplifié des filtres, on réutilise FilterBar mais sans sticky */}
              <FilterBar
                {...filters}
                totalProducts={products.length}
                onResetFilters={filters.resetFilters}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                showViewToggle
                className="static border-none shadow-none p-0 bg-transparent backdrop-blur-none"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}