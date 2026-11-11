// components/home/PopularCategoriesSection.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import Link from 'next/link'
import Image from 'next/image'

import { motion } from 'framer-motion'

import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Package,
  RefreshCw,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'

import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

// ✅ Import corrigé : le hook vient bien de @/hooks/useCategories
import { useHomeCategories, type CategoryNode } from '@/hooks/useCategories'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface FlatCategory {
  id: string
  name: string
  slug: string
  image?: string | null
  depth: number
  chemin: string
  parentId?: string | null
  pathIds: string[]
  pathNames: string[]
}

export interface PopularCategoriesSectionProps {
  title?: string
  subtitle?: string
  maxCategories?: number
  categoryIds?: string[]
  excludeIds?: string[]
  parentIds?: string[]
  includeDescendantsOfParents?: boolean
  includeParentsThemselves?: boolean
  levels?: number[]
  minLevel?: number
  maxLevel?: number
  showLevelBadge?: boolean
  showPath?: boolean
  showViewAll?: boolean
  viewAllHref?: string
  viewAllLabel?: string
  emptyMessage?: string
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const SCROLL_AMOUNT = 320
const SKELETON_COUNT = 8
const PRELOAD_COUNT = 6

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function levelLabel(depth: number): string {
  if (depth === 0) return 'Racine'
  if (depth === 1) return 'Enfant'
  if (depth === 2) return 'Petit-enfant'
  if (depth === 3) return 'Arrière-petit-enfant'
  return `Niveau ${depth}`
}

function getFirstLetter(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeCategories(input: unknown): FlatCategory[] {
  const output: FlatCategory[] = []
  const seen = new Set<string>()

  function walk(
    nodes: unknown,
    depth = 0,
    parentIds: string[] = [],
    parentNames: string[] = [],
    parentId: string | null = null
  ) {
    if (!Array.isArray(nodes)) return

    for (const rawNode of nodes) {
      if (!rawNode || typeof rawNode !== 'object') continue

      const node = rawNode as Record<string, unknown>

      const id = String(node.id ?? node._id ?? '').trim()
      if (!id || seen.has(id)) continue

      seen.add(id)

      const name = String(node.nom ?? node.name ?? 'Catégorie').trim() || 'Catégorie'
      const slug = String(node.slug ?? id).trim() || id
      const image =
        normalizeImageUrl(node.image) ??
        normalizeImageUrl(node.image_url) ??
        normalizeImageUrl(node.thumbnail) ??
        normalizeImageUrl(node.photo)

      const pathIds = [...parentIds, id]
      const pathNames = [...parentNames, name]

      const chemin =
        typeof node.chemin === 'string' && node.chemin.trim()
          ? node.chemin.trim()
          : pathNames.join(' > ')

      output.push({
        id,
        name,
        slug,
        image,
        depth,
        chemin,
        parentId,
        pathIds,
        pathNames,
      })

      walk(
        node.children ?? node.enfants ?? node.subcategories ?? [],
        depth + 1,
        pathIds,
        pathNames,
        id
      )
    }
  }

  if (Array.isArray(input)) {
    walk(input)
  } else if (input && typeof input === 'object') {
    const container = input as Record<string, unknown>
    walk(container.categories ?? container.data ?? container.items ?? [])
  }

  return output
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SKELETON CARD                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function CategorySkeletonCard() {
  return (
    <div
      className="relative w-40 shrink-0 overflow-hidden rounded-card border border-line bg-surface shadow-card sm:w-44 md:w-48 lg:w-52"
      aria-hidden="true"
    >
      <div className="skeleton aspect-[3/5] w-full" />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CATEGORY CARD — FORMAT 3:5, TEXTE SUR LA PHOTO, CLIQUABLE     */
/* ═══════════════════════════════════════════════════════════════ */

interface CategoryCardProps {
  category: FlatCategory
  index: number
  prefersReducedMotion: boolean
  isMobile: boolean
  hasImageError: boolean
  onImageError: (categoryId: string) => void
  showLevelBadge: boolean
  showPath: boolean
}

function CategoryCard({
  category,
  index,
  prefersReducedMotion,
  isMobile,
  hasImageError,
  onImageError,
  showLevelBadge,
  showPath,
}: CategoryCardProps) {
  const shouldShowImage = Boolean(category.image) && !hasImageError
  const initial = getFirstLetter(category.name)

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
      whileInView={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.28,
        delay: prefersReducedMotion ? 0 : Math.min(index * 0.035, 0.24),
        ease: 'easeOut',
      }}
      className="shrink-0 snap-start"
      role="listitem"
    >
      <Link
        href={`/categories/${category.slug}`}
        aria-label={`Ouvrir la catégorie ${category.name}`}
        className={cn(
          'group relative block w-40 overflow-hidden rounded-card border border-line bg-surface shadow-card',
          'transition-all duration-300 ease-out',
          'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'sm:w-44 md:w-48 lg:w-52'
        )}
      >
        <div className="relative aspect-[3/5] w-full overflow-hidden bg-muted">
          {shouldShowImage ? (
            <Image
              src={category.image as string}
              alt={category.name}
              fill
              sizes={
                isMobile
                  ? '(max-width: 640px) 160px'
                  : '(max-width: 768px) 176px, (max-width: 1024px) 192px, 208px'
              }
              quality={isMobile ? 75 : 85}
              priority={index < 3}
              loading={index < 3 ? 'eager' : 'lazy'}
              decoding="async"
              className={cn(
                'object-cover transition-transform duration-500 ease-out',
                'group-hover:scale-[1.04]'
              )}
              onError={() => onImageError(category.id)}
            />
          ) : (
            <div
              className={cn(
                'flex h-full w-full items-center justify-center',
                'bg-gradient-to-br from-fg to-fg/80 text-canvas'
              )}
              aria-hidden="true"
            >
              <span className="font-heading text-4xl font-bold leading-none opacity-90">
                {initial}
              </span>
            </div>
          )}

          {/* Overlay permanent pour garder le texte lisible sur la photo */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0',
              'bg-gradient-to-t from-black/88 via-black/48 to-black/10',
              'transition-opacity duration-300',
              'group-hover:from-black/92 group-hover:via-black/56'
            )}
            aria-hidden="true"
          />

          {/* Léger contour interne premium */}
          <div
            className="pointer-events-none absolute inset-0 rounded-card ring-1 ring-inset ring-white/10 transition duration-300 group-hover:ring-white/20"
            aria-hidden="true"
          />

          {/* Badge niveau */}
          {showLevelBadge && (
            <span
              className={cn(
                'absolute right-2 top-2 inline-flex items-center rounded-full',
                'border border-white/15 bg-black/45 px-2 py-0.5',
                'text-[9px] font-bold uppercase tracking-wide text-white/90 backdrop-blur-sm'
              )}
              title={levelLabel(category.depth)}
            >
              N{category.depth}
            </span>
          )}

          {/* Contenu texte toujours sur la photo */}
          <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
            <p
              className={cn(
                'line-clamp-2 font-heading text-sm font-semibold leading-tight text-white',
                'drop-shadow-sm sm:text-base'
              )}
              title={category.name}
            >
              {category.name}
            </p>

            {showPath && (
              <p
                className="mt-1 line-clamp-1 text-[11px] font-medium leading-snug text-white/70"
                title={category.chemin}
              >
                {category.chemin}
              </p>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export default function PopularCategoriesSection({
  title = 'Explorez les catégories',
  subtitle = 'Trouvez exactement ce qu’il vous faut',
  maxCategories = 12,
  categoryIds,
  excludeIds,
  parentIds,
  includeDescendantsOfParents = true,
  includeParentsThemselves = true,
  levels,
  minLevel,
  maxLevel,
  showLevelBadge = false,
  showPath = false,
  showViewAll = true,
  viewAllHref = '/categories',
  viewAllLabel = 'Voir toutes les catégories',
  emptyMessage,
  className,
}: PopularCategoriesSectionProps) {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  const isOnline = useOnlineStatus()

  const sectionRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [isInView, setIsInView] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  /* ───────────────────────────────────────────────────────────── */
  /*  FETCH CATÉGORIES                                             */
  /* ───────────────────────────────────────────────────────────── */

  const {
    data: dynamicCategories,
    isLoading,
    isError,
    refetch,
  } = useHomeCategories() as {
    data?: CategoryNode[]
    isLoading?: boolean
    isError?: boolean
    refetch?: () => void
  }

  const allCategories = useMemo<FlatCategory[]>(
    () => normalizeCategories(dynamicCategories),
    [dynamicCategories]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  FILTRAGE                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const categoriesToDisplay = useMemo<FlatCategory[]>(() => {
    let list = [...allCategories]

    if (categoryIds && categoryIds.length > 0) {
      const map = new Map(list.map((category) => [category.id, category]))

      list = categoryIds
        .map((id) => map.get(id))
        .filter((category): category is FlatCategory => Boolean(category))
    }

    if (excludeIds && excludeIds.length > 0) {
      const excludeSet = new Set(excludeIds)
      list = list.filter((category) => !excludeSet.has(category.id))
    }

    if (parentIds && parentIds.length > 0) {
      const parentSet = new Set(parentIds)

      list = list.filter((category) => {
        const isParent = parentSet.has(category.id)
        const hasParentAncestor = category.pathIds
          .slice(0, -1)
          .some((id) => parentSet.has(id))

        if (includeDescendantsOfParents) {
          return includeParentsThemselves
            ? isParent || hasParentAncestor
            : hasParentAncestor
        }

        return isParent
      })
    }

    if (levels && levels.length > 0) {
      const levelSet = new Set(levels)
      list = list.filter((category) => levelSet.has(category.depth))
    }

    if (typeof minLevel === 'number') {
      list = list.filter((category) => category.depth >= minLevel)
    }

    if (typeof maxLevel === 'number') {
      list = list.filter((category) => category.depth <= maxLevel)
    }

    if (!categoryIds || categoryIds.length === 0) {
      list.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth
        return a.name.localeCompare(b.name, 'fr')
      })
    }

    if (typeof maxCategories === 'number' && maxCategories >= 0) {
      list = list.slice(0, maxCategories)
    }

    return list
  }, [
    allCategories,
    categoryIds,
    excludeIds,
    includeDescendantsOfParents,
    includeParentsThemselves,
    levels,
    maxCategories,
    maxLevel,
    minLevel,
    parentIds,
  ])

  /* ───────────────────────────────────────────────────────────── */
  /*  MOBILE DETECTION                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(max-width: 640px)')

    const update = () => setIsMobile(mediaQuery.matches)
    update()

    mediaQuery.addEventListener('change', update)

    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  IN VIEW OBSERVER                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const element = sectionRef.current

    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting)
      },
      { threshold: 0.1 }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  PRÉCHARGEMENT IMAGES                                         */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isInView || categoriesToDisplay.length === 0) return

    categoriesToDisplay.slice(0, PRELOAD_COUNT).forEach((category) => {
      if (!category.image) return

      const img = new window.Image()
      img.src = category.image
    })
  }, [categoriesToDisplay, isInView])

  /* ───────────────────────────────────────────────────────────── */
  /*  SCROLL STATE                                                 */
  /* ───────────────────────────────────────────────────────────── */

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current

    if (!element) return

    const maxScrollLeft = element.scrollWidth - element.clientWidth

    setCanScrollLeft(element.scrollLeft > 4)
    setCanScrollRight(element.scrollLeft < maxScrollLeft - 4)
  }, [])

  useEffect(() => {
    updateScrollState()

    const element = scrollRef.current

    if (!element) return

    const handleScroll = () => updateScrollState()

    element.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      element.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [categoriesToDisplay.length, updateScrollState])

  const scrollByDirection = useCallback(
    (direction: 1 | -1) => {
      const element = scrollRef.current

      if (!element) return

      element.scrollBy({
        left: direction * SCROLL_AMOUNT,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
    },
    [prefersReducedMotion]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  IMAGE ERROR                                                  */
  /* ───────────────────────────────────────────────────────────── */

  const handleImageError = useCallback((categoryId: string) => {
    setImageErrors((previous) => {
      const next = new Set(previous)
      next.add(categoryId)
      return next
    })
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  ÉTATS                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const hasCategories = categoriesToDisplay.length > 0
  const hasAnyCategoryInDatabase = allCategories.length > 0

  const finalEmptyMessage =
    emptyMessage ??
    (hasAnyCategoryInDatabase
      ? 'Aucune catégorie ne correspond aux filtres actuels.'
      : 'Aucune catégorie disponible pour le moment.')

  const showOfflineNotice = !isOnline && hasCategories

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDU                                                        */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <section
      ref={sectionRef}
      className={cn(
        'relative bg-canvas py-8 sm:py-10 md:py-14',
        className
      )}
      aria-labelledby="popular-categories-heading"
    >
      <Container padding="section" size="default">
        {/* ====================================================
            HEADER
           ==================================================== */}
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2
              id="popular-categories-heading"
              className="text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl"
            >
              {title}
            </h2>

            {subtitle && (
              <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-fg-muted sm:text-base">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {hasCategories && (
              <div
                className="hidden items-center gap-1 md:flex"
                role="group"
                aria-label="Navigation des catégories"
              >
                <button
                  type="button"
                  onClick={() => scrollByDirection(-1)}
                  disabled={!canScrollLeft}
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-full',
                    'border border-line bg-surface text-fg-muted shadow-card',
                    'transition-colors duration-200',
                    'hover:border-line-strong hover:bg-raised hover:text-fg',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                    'disabled:pointer-events-none disabled:opacity-40'
                  )}
                  aria-label="Précédent"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => scrollByDirection(1)}
                  disabled={!canScrollRight}
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-full',
                    'border border-line bg-surface text-fg-muted shadow-card',
                    'transition-colors duration-200',
                    'hover:border-line-strong hover:bg-raised hover:text-fg',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                    'disabled:pointer-events-none disabled:opacity-40'
                  )}
                  aria-label="Suivant"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            )}

            {showViewAll && (
              <Link
                href={viewAllHref}
                className={cn(
                  'hidden items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 py-2',
                  'text-xs font-semibold text-fg shadow-card',
                  'transition-colors duration-200',
                  'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  'sm:inline-flex'
                )}
              >
                {viewAllLabel}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        {/* ====================================================
            OFFLINE NOTICE
           ==================================================== */}
        {showOfflineNotice && (
          <div
            className={cn(
              'mb-4 flex items-center gap-2 rounded-control border border-warning/20',
              'bg-warning-soft px-3 py-2 text-xs font-medium text-warning'
            )}
            role="status"
          >
            <AlertTriangle size={14} aria-hidden="true" />
            <span>Mode hors ligne — affichage des catégories en cache.</span>
          </div>
        )}

        {/* ====================================================
            LOADING
           ==================================================== */}
        {isLoading && (
          <div
            className="flex gap-3 overflow-hidden pb-2 sm:gap-4"
            role="status"
            aria-label="Chargement des catégories"
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <CategorySkeletonCard key={`category-skeleton-${index}`} />
            ))}

            <span className="sr-only">Chargement des catégories…</span>
          </div>
        )}

        {/* ====================================================
            ERROR
           ==================================================== */}
        {isError && allCategories.length === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-panel border border-danger/20 bg-danger-soft px-6 py-12 text-center"
            role="alert"
          >
            <AlertTriangle
              size={28}
              className="text-danger"
              aria-hidden="true"
            />

            <p className="text-sm font-semibold text-danger">
              Impossible de charger les catégories.
            </p>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => refetch?.()}
              leftIcon={<RefreshCw size={14} aria-hidden="true" />}
            >
              Réessayer
            </Button>
          </div>
        )}

        {/* ====================================================
            CATEGORIES SCROLLER
           ==================================================== */}
        {!isLoading && !isError && hasCategories && (
          <div
            ref={scrollRef}
            role="list"
            aria-label="Liste des catégories populaires"
            className={cn(
              'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2',
              'scrollbar-hide scroll-smooth',
              '-mx-4 px-4 sm:mx-0 sm:gap-4 sm:px-0'
            )}
          >
            {categoriesToDisplay.map((category, index) => (
              <CategoryCard
                key={category.id}
                category={category}
                index={index}
                prefersReducedMotion={Boolean(prefersReducedMotion)}
                isMobile={isMobile}
                hasImageError={imageErrors.has(category.id)}
                onImageError={handleImageError}
                showLevelBadge={showLevelBadge}
                showPath={showPath}
              />
            ))}
          </div>
        )}

        {/* ====================================================
            EMPTY
           ==================================================== */}
        {!isLoading && !isError && !hasCategories && (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line bg-muted/40 px-6 py-14 text-center"
            role="status"
          >
            <Package
              size={32}
              className="text-fg-subtle"
              aria-hidden="true"
            />

            <p className="text-sm font-medium text-fg-muted">
              {finalEmptyMessage}
            </p>
          </div>
        )}

        {/* ====================================================
            VOIR TOUT MOBILE
           ==================================================== */}
        {showViewAll && hasCategories && (
          <div className="mt-6 sm:hidden">
            <Link
              href={viewAllHref}
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-control',
                'border border-line bg-surface px-4 py-3',
                'text-sm font-semibold text-fg shadow-card',
                'transition-colors duration-200',
                'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
              )}
            >
              {viewAllLabel}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        )}
      </Container>
    </section>
  )
}