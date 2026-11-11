// components/product/InfiniteCarouselRow.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'

import ProductCard from '@/components/ProductCard'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

import {
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  WifiOff,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface Product {
  id?: string
  _id?: string
  nom?: string
  name?: string
  prix?: number | null
  price?: number | null
  prix_promo?: number | null
  promo_price?: number | null
  effective_price?: number | null
  images?: string[] | string | null
  image?: string | null
  thumbnail?: string | null
  discount?: number | null
  remise_percent?: number | null
  rating?: number | null
  note_moyenne?: number | null
  average_rating?: number | null
  stock?: number | null
  total_ventes?: number | null
  ventes?: number | null
  created_at?: string | null
  createdAt?: string | null
  vendeur?: {
    boutique_nom?: string | null
  } | null
  categorie?: string | null
  category?: string | null
  description?: string | null
  slug?: string | null
  is_nouveau?: boolean | null
  is_trending?: boolean | null
  stock_faible?: boolean | null
  rupture?: boolean | null
  est_actif?: boolean | null
  active?: boolean | null
  is_active?: boolean | null
  score?: number | null
  rank?: number | null
  reasons?: string[] | null
  [key: string]: unknown
}

interface InfiniteCarouselRowProps {
  products: Product[]
  autoPlayInterval?: number
  className?: string
  compact?: boolean
  visibleItems?: number
  maxProductsPerRow?: number
  onQuickView?: (productId: string) => void
  onAddToCart?: (productId: string) => void
  onToggleFavorite?: (productId: string) => void
  onCompare?: (productId: string) => void
  compareList?: string[]
  favorites?: Set<string>
  adminMode?: boolean
  selectedIds?: Set<string>
  onSelectProduct?: (id: string) => void
  columnsPerView?: {
    mobile?: number
    tablet?: number
    desktop?: number
  }
  disableAnimations?: boolean
  showNavigationAlways?: boolean
  disableAutoplayOnMobile?: boolean
}

type PillTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

interface CarouselProduct extends Product {
  _id: string
  _nom: string
  _discount: number
  _isNew: boolean
  _isTopSeller: boolean
  _hasLowStock: boolean
  _isOutOfStock: boolean
  _isFavorite: boolean
  _isCompared: boolean
  _isSelected: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const NEW_PRODUCT_DAYS = 7
const TOP_SELLER_THRESHOLD = 100
const LOW_STOCK_THRESHOLD = 5
const EMPTY_SET: Set<string> = new Set()
const EMPTY_ARRAY: string[] = []
const MOBILE_BREAKPOINT = 640
const TABLET_BREAKPOINT = 1024

/* ═══════════════════════════════════════════════════════════════ */
/*  DESIGN TOKENS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const pillTones: Record<PillTone, string> = {
  accent: 'border-accent/20 bg-accent-soft text-accent',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  danger: 'border-danger/20 bg-danger-soft text-danger',
  info: 'border-info/20 bg-info-soft text-info',
  neutral: 'border-line bg-muted text-fg-muted',
}

const overlayButtonBase =
  'inline-flex h-8 w-8 items-center justify-center rounded-pill border border-line bg-surface/95 text-fg-muted shadow-card backdrop-blur transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50'

const overlayButtonHover =
  'hover:border-accent/30 hover:bg-accent-soft hover:text-accent'

const overlayButtonActiveAccent =
  'border-accent/30 bg-accent text-accent-contrast hover:bg-accent-hover hover:text-accent-contrast'

const overlayButtonActiveDanger =
  'border-danger/30 bg-danger-soft text-danger hover:bg-danger/15 hover:text-danger'

const navigationButtonBase =
  'inline-flex h-10 w-10 items-center justify-center rounded-pill border border-line bg-surface/95 text-fg-muted shadow-card backdrop-blur transition-all duration-200 motion-reduce:transition-none hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-40'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str ? str : null
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'oui', 'yes', 'on', 'actif', 'active'].includes(str)) {
    return true
  }

  if (['false', 'non', 'no', 'off', 'inactif', 'inactive'].includes(str)) {
    return false
  }

  return fallback
}

function getProductId(product: Product, index: number): string {
  return textOrNull(product.id ?? product._id) ?? `product-${index}`
}

function getProductName(product: Product): string {
  return textOrNull(product.nom ?? product.name) ?? 'Produit'
}

function getEffectivePrice(product: Product): number {
  const prix = toNum(product.prix ?? product.price, 0)
  const prixPromo = toNullableNumber(product.prix_promo ?? product.promo_price)
  const effective = toNullableNumber(product.effective_price)

  if (effective !== null && effective > 0) return effective
  if (prixPromo !== null && prixPromo > 0 && prixPromo < prix) return prixPromo

  return prix
}

function getDiscount(product: Product): number {
  const prix = toNum(product.prix ?? product.price, 0)
  const effectivePrice = getEffectivePrice(product)
  const rawDiscount = toNum(product.discount ?? product.remise_percent, 0)

  if (rawDiscount > 0 && rawDiscount < 100) {
    return Math.round(rawDiscount)
  }

  if (prix > 0 && effectivePrice < prix) {
    return Math.round(((prix - effectivePrice) / prix) * 100)
  }

  return 0
}

function getStock(product: Product): number | null {
  return toNullableNumber(product.stock)
}

function getSales(product: Product): number {
  return toNum(product.total_ventes ?? product.ventes, 0)
}

function getCreatedAt(product: Product): string | null {
  return textOrNull(product.created_at ?? product.createdAt)
}

function isNewProduct(product: Product): boolean {
  if (toBool(product.is_nouveau, false)) return true

  const createdAt = getCreatedAt(product)
  if (!createdAt) return false

  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return false

  return Date.now() - date.getTime() < NEW_PRODUCT_DAYS * 86_400_000
}

function isTopSellerProduct(product: Product): boolean {
  return getSales(product) > TOP_SELLER_THRESHOLD
}

function hasLowStock(product: Product): boolean {
  if (toBool(product.stock_faible, false)) return true

  const stock = getStock(product)
  return stock !== null && stock > 0 && stock <= LOW_STOCK_THRESHOLD
}

function isOutOfStock(product: Product): boolean {
  if (toBool(product.rupture, false)) return true

  const active =
    product.est_actif === undefined &&
    product.active === undefined &&
    product.is_active === undefined
      ? true
      : toBool(product.est_actif ?? product.active ?? product.is_active, true)

  if (!active) return true

  const stock = getStock(product)
  return stock !== null && stock <= 0
}

function isValidProduct(product: unknown): product is Product {
  if (!product || typeof product !== 'object') return false

  const data = product as Product
  const id = textOrNull(data.id ?? data._id)
  const nom = textOrNull(data.nom ?? data.name)

  return Boolean(id && nom)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function CarouselPill({
  tone = 'neutral',
  icon,
  children,
  className,
  pulse = false,
}: {
  tone?: PillTone
  icon?: ReactNode
  children?: ReactNode
  className?: string
  pulse?: boolean
}) {
  if (children === null || children === undefined || children === '') {
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-pill border px-2 py-0.5',
        'text-[10px] font-bold leading-none shadow-card',
        pillTones[tone],
        pulse && 'motion-safe:animate-pulse',
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}

function CarouselActionButton({
  label,
  icon,
  onClick,
  active = false,
  danger = false,
  disabled = false,
}: {
  label: string
  icon: ReactNode
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  active?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          overlayButtonBase,
          !active && !disabled && overlayButtonHover,
          active && !danger && overlayButtonActiveAccent,
          active && danger && overlayButtonActiveDanger
        )}
      >
        {icon}
      </button>
    </Tooltip>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export const InfiniteCarouselRow = React.memo<InfiniteCarouselRowProps>(
  ({
    products,
    autoPlayInterval,
    className,
    compact = false,
    visibleItems,
    maxProductsPerRow = 10,
    onQuickView,
    onAddToCart,
    onToggleFavorite,
    onCompare,
    compareList = EMPTY_ARRAY,
    favorites = EMPTY_SET,
    adminMode = false,
    selectedIds = EMPTY_SET,
    onSelectProduct,
    columnsPerView,
    disableAnimations = false,
    showNavigationAlways = false,
    disableAutoplayOnMobile = true,
  }) => {
    const accessibility = useAccessibilityPreferences() as {
      prefersReducedMotion?: boolean
    }

    const prefersReducedMotion = Boolean(accessibility?.prefersReducedMotion)

    const onlineStatus = useOnlineStatus() as unknown

    const isOnline =
      typeof onlineStatus === 'boolean'
        ? onlineStatus
        : Boolean((onlineStatus as { isOnline?: boolean })?.isOnline ?? true)

    const rootRef = useRef<HTMLDivElement | null>(null)
    const viewportRef = useRef<HTMLDivElement | null>(null)

    const [columns, setColumns] = useState(5)
    const [isMobile, setIsMobile] = useState(false)
    const [canScrollPrev, setCanScrollPrev] = useState(false)
    const [canScrollNext, setCanScrollNext] = useState(true)
    const [isHovered, setIsHovered] = useState(false)
    const [isFocused, setIsFocused] = useState(false)
    const [isVisible, setIsVisible] = useState(true)
    const [isDocumentVisible, setIsDocumentVisible] = useState(true)

    /* ───────────────────────────────────────────────────────────── */
    /*  PRODUCTS                                                     */
    /* ───────────────────────────────────────────────────────────── */

    const validProducts = useMemo(() => {
      return (Array.isArray(products) ? products : [])
        .filter(isValidProduct)
        .slice(0, Math.max(1, maxProductsPerRow))
    }, [maxProductsPerRow, products])

    const compareSet = useMemo(() => new Set(compareList), [compareList])

    const items = useMemo<CarouselProduct[]>(() => {
      return validProducts.map((product, index) => {
        const id = getProductId(product, index)
        const nom = getProductName(product)
        const discount = getDiscount(product)
        const stock = getStock(product)

        return {
          ...product,
          _id: id,
          _nom: nom,
          _discount: discount,
          _isNew: isNewProduct(product),
          _isTopSeller: isTopSellerProduct(product),
          _hasLowStock: stock !== null && stock > 0 && stock <= LOW_STOCK_THRESHOLD,
          _isOutOfStock: isOutOfStock(product),
          _isFavorite: favorites.has(id),
          _isCompared: compareSet.has(id),
          _isSelected: selectedIds.has(id),
        }
      })
    }, [compareSet, favorites, selectedIds, validProducts])

    /* ───────────────────────────────────────────────────────────── */
    /*  RESPONSIVE COLUMNS                                           */
    /* ───────────────────────────────────────────────────────────── */

    const getPreferredColumns = useCallback(
      (containerWidth: number): number => {
        let base: number

        if (visibleItems && visibleItems > 0) {
          base = visibleItems
        } else if (columnsPerView) {
          if (containerWidth < MOBILE_BREAKPOINT && columnsPerView.mobile) {
            base = columnsPerView.mobile
          } else if (
            containerWidth < TABLET_BREAKPOINT &&
            columnsPerView.tablet
          ) {
            base = columnsPerView.tablet
          } else if (columnsPerView.desktop) {
            base = columnsPerView.desktop
          } else {
            base = compact ? 4 : 5
          }
        } else {
          if (containerWidth < 480) {
            base = compact ? 1 : 2
          } else if (containerWidth < MOBILE_BREAKPOINT) {
            base = 2
          } else if (containerWidth < 768) {
            base = compact ? 2 : 3
          } else if (containerWidth < TABLET_BREAKPOINT) {
            base = compact ? 3 : 4
          } else {
            base = compact ? 4 : 5
          }
        }

        const safeBase = Math.max(1, Math.min(10, Math.round(base)))

        if (items.length === 0) return safeBase

        return Math.max(1, Math.min(safeBase, items.length))
      },
      [columnsPerView, compact, items.length, visibleItems]
    )

    const updateScrollState = useCallback(() => {
      const element = viewportRef.current
      if (!element) return

      const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)

      setCanScrollPrev(element.scrollLeft > 2)
      setCanScrollNext(element.scrollLeft < maxScroll - 2)
    }, [])

    useEffect(() => {
      const element = viewportRef.current

      const compute = () => {
        const width =
          element?.clientWidth ||
          (typeof window !== 'undefined' ? window.innerWidth : 1280)

        const nextColumns = getPreferredColumns(width)

        setColumns((previous) =>
          previous === nextColumns ? previous : nextColumns
        )

        setIsMobile(width < MOBILE_BREAKPOINT)
        updateScrollState()
      }

      compute()

      let resizeObserver: ResizeObserver | undefined

      if (element && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(compute)
        resizeObserver.observe(element)
      }

      window.addEventListener('resize', compute)

      return () => {
        resizeObserver?.disconnect()
        window.removeEventListener('resize', compute)
      }
    }, [getPreferredColumns, updateScrollState])

    useEffect(() => {
      const element = viewportRef.current
      if (!element) return

      const handleScroll = () => {
        updateScrollState()
      }

      element.addEventListener('scroll', handleScroll, { passive: true })
      handleScroll()

      return () => {
        element.removeEventListener('scroll', handleScroll)
      }
    }, [columns, items.length, updateScrollState])

    /* ───────────────────────────────────────────────────────────── */
    /*  VISIBILITY / INTERSECTION                                    */
    /* ───────────────────────────────────────────────────────────── */

    useEffect(() => {
      const element = rootRef.current

      if (!element || typeof IntersectionObserver === 'undefined') {
        setIsVisible(true)
        return
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          setIsVisible(entry.isIntersecting)
        },
        {
          threshold: 0.15,
          rootMargin: '100px',
        }
      )

      observer.observe(element)

      return () => observer.disconnect()
    }, [])

    useEffect(() => {
      if (typeof document === 'undefined') return

      const handleVisibilityChange = () => {
        setIsDocumentVisible(!document.hidden)
      }

      handleVisibilityChange()

      document.addEventListener('visibilitychange', handleVisibilityChange)

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }, [])

    /* ───────────────────────────────────────────────────────────── */
    /*  SCROLLING                                                    */
    /* ───────────────────────────────────────────────────────────── */

    const scrollByDirection = useCallback(
      (direction: 'prev' | 'next') => {
        const element = viewportRef.current
        if (!element) return

        const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
        if (maxScroll <= 0) return

        const slideWidth = element.clientWidth / Math.max(1, columns)
        const amount = Math.max(
          slideWidth,
          Math.round(element.clientWidth * 0.85)
        )

        const behavior: ScrollBehavior = prefersReducedMotion
          ? 'auto'
          : 'smooth'

        if (direction === 'next') {
          if (element.scrollLeft >= maxScroll - 2) {
            element.scrollTo({
              left: 0,
              behavior: 'auto',
            })
          } else {
            element.scrollBy({
              left: amount,
              behavior,
            })
          }

          return
        }

        if (element.scrollLeft <= 2) {
          element.scrollTo({
            left: maxScroll,
            behavior: 'auto',
          })
        } else {
          element.scrollBy({
            left: -amount,
            behavior,
          })
        }
      },
      [columns, prefersReducedMotion]
    )

    const scrollToStart = useCallback(() => {
      const element = viewportRef.current
      if (!element) return

      element.scrollTo({
        left: 0,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
    }, [prefersReducedMotion])

    const scrollToEnd = useCallback(() => {
      const element = viewportRef.current
      if (!element) return

      const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)

      element.scrollTo({
        left: maxScroll,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
    }, [prefersReducedMotion])

    /* ───────────────────────────────────────────────────────────── */
    /*  AUTOPLAY                                                     */
    /* ───────────────────────────────────────────────────────────── */

    const shouldAutoPlay = Boolean(
      autoPlayInterval &&
        autoPlayInterval > 0 &&
        items.length > columns &&
        isVisible &&
        isDocumentVisible &&
        !isHovered &&
        !isFocused &&
        !prefersReducedMotion &&
        !(disableAutoplayOnMobile && isMobile)
    )

    useEffect(() => {
      if (!shouldAutoPlay || !autoPlayInterval) return

      const timer = window.setInterval(() => {
        scrollByDirection('next')
      }, autoPlayInterval)

      return () => {
        window.clearInterval(timer)
      }
    }, [autoPlayInterval, scrollByDirection, shouldAutoPlay])

    /* ───────────────────────────────────────────────────────────── */
    /*  KEYBOARD                                                     */
    /* ───────────────────────────────────────────────────────────── */

    const handleKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          scrollByDirection('prev')
          return
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault()
          scrollByDirection('next')
          return
        }

        if (event.key === 'Home') {
          event.preventDefault()
          scrollToStart()
          return
        }

        if (event.key === 'End') {
          event.preventDefault()
          scrollToEnd()
        }
      },
      [scrollByDirection, scrollToStart, scrollToEnd]
    )

    /* ───────────────────────────────────────────────────────────── */
    /*  ACTION HANDLERS                                              */
    /* ───────────────────────────────────────────────────────────── */

    const handleQuickView = useCallback(
      (productId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        onQuickView?.(productId)
      },
      [onQuickView]
    )

    const handleAddToCart = useCallback(
      (productId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        onAddToCart?.(productId)
      },
      [onAddToCart]
    )

    const handleToggleFavorite = useCallback(
      (productId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        onToggleFavorite?.(productId)
      },
      [onToggleFavorite]
    )

    const handleCompare = useCallback(
      (productId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        onCompare?.(productId)
      },
      [onCompare]
    )

    const handleSelectProduct = useCallback(
      (productId: string, event: ReactMouseEvent<HTMLInputElement>) => {
        event.stopPropagation()
        onSelectProduct?.(productId)
      },
      [onSelectProduct]
    )

    /* ───────────────────────────────────────────────────────────── */
    /*  DERIVED                                                      */
    /* ───────────────────────────────────────────────────────────── */

    const shouldAnimate = !disableAnimations && !prefersReducedMotion

    const shouldShowNavigation =
      items.length > 1 && (showNavigationAlways || canScrollPrev || canScrollNext)

    const navigationVisibility = showNavigationAlways
      ? 'flex opacity-100 pointer-events-auto'
      : 'hidden md:inline-flex opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'

    const hasOfflineIndicator = !isOnline

    /* ───────────────────────────────────────────────────────────── */
    /*  EARLY RETURN                                                 */
    /* ───────────────────────────────────────────────────────────── */

    if (items.length === 0) {
      return null
    }

    /* ───────────────────────────────────────────────────────────── */
    /*  RENDER                                                       */
    /* ───────────────────────────────────────────────────────────── */

    return (
      <div
        ref={rootRef}
        className={cn('group relative isolate', className)}
        role="region"
        aria-roledescription="carrousel"
        aria-label="Carrousel de produits"
        tabIndex={0}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsFocused(true)}
        onBlurCapture={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
      >
        {/* ====================================================
            OFFLINE INDICATOR
        ==================================================== */}
        {hasOfflineIndicator ? (
          <div className="pointer-events-none absolute right-2 top-2 z-30">
            <CarouselPill
              tone="info"
              icon={<WifiOff size={10} aria-hidden="true" />}
            >
              Hors ligne
            </CarouselPill>
          </div>
        ) : null}

        {/* ====================================================
            NAVIGATION BUTTONS
        ==================================================== */}
        {shouldShowNavigation ? (
          <>
            <button
              type="button"
              onClick={() => scrollByDirection('prev')}
              disabled={!canScrollPrev}
              aria-label="Produits précédents"
              className={cn(
                navigationButtonBase,
                navigationVisibility,
                'absolute left-1 top-1/2 z-30 -translate-y-1/2 md:left-2'
              )}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => scrollByDirection('next')}
              disabled={!canScrollNext}
              aria-label="Produits suivants"
              className={cn(
                navigationButtonBase,
                navigationVisibility,
                'absolute right-1 top-1/2 z-30 -translate-y-1/2 md:right-2'
              )}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </>
        ) : null}

        {/* ====================================================
            VIEWPORT / TRACK
        ==================================================== */}
        <div
          ref={viewportRef}
          className={cn(
            'flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1',
            '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          )}
          style={{
            scrollBehavior: prefersReducedMotion ? 'auto' : 'smooth',
          }}
          role="group"
          aria-label="Liste de produits"
        >
          {items.map((item, index) => {
            const badges: ReactNode[] = []

            if (item._isOutOfStock) {
              badges.push(
                <CarouselPill key="stock" tone="danger">
                  Indisponible
                </CarouselPill>
              )
            } else if (item._hasLowStock) {
              badges.push(
                <CarouselPill key="stock" tone="warning">
                  Stock limité
                </CarouselPill>
              )
            }

            if (item._discount > 0) {
              badges.push(
                <CarouselPill key="discount" tone="danger">
                  -{item._discount}%
                </CarouselPill>
              )
            }

            if (item._isNew) {
              badges.push(
                <CarouselPill
                  key="new"
                  tone="accent"
                  icon={<Sparkles size={10} aria-hidden="true" />}
                >
                  Nouveau
                </CarouselPill>
              )
            }

            if (item._isTopSeller) {
              badges.push(
                <CarouselPill
                  key="top"
                  tone="success"
                  icon={<TrendingUp size={10} aria-hidden="true" />}
                >
                  Top vente
                </CarouselPill>
              )
            }

            const visibleBadges = badges.slice(0, 3)

            const actionButtons: ReactNode[] = []

            if (!adminMode && onQuickView) {
              actionButtons.push(
                <CarouselActionButton
                  key="quick-view"
                  label={`Aperçu rapide de ${item._nom}`}
                  icon={<Eye size={16} aria-hidden="true" />}
                  onClick={(event) => handleQuickView(item._id, event)}
                />
              )
            }

            if (!adminMode && onAddToCart) {
              actionButtons.push(
                <CarouselActionButton
                  key="cart"
                  label={
                    item._isOutOfStock
                      ? `${item._nom} est indisponible`
                      : `Ajouter ${item._nom} au panier`
                  }
                  icon={<ShoppingCart size={16} aria-hidden="true" />}
                  disabled={item._isOutOfStock}
                  onClick={(event) => handleAddToCart(item._id, event)}
                />
              )
            }

            if (!adminMode && onCompare) {
              actionButtons.push(
                <CarouselActionButton
                  key="compare"
                  label={
                    item._isCompared
                      ? `Retirer ${item._nom} du comparateur`
                      : `Comparer ${item._nom}`
                  }
                  active={item._isCompared}
                  icon={
                    item._isCompared ? (
                      <Check size={16} aria-hidden="true" />
                    ) : (
                      <BarChart3 size={16} aria-hidden="true" />
                    )
                  }
                  onClick={(event) => handleCompare(item._id, event)}
                />
              )
            }

            if (!adminMode && onToggleFavorite) {
              actionButtons.push(
                <CarouselActionButton
                  key="favorite"
                  label={
                    item._isFavorite
                      ? `Retirer ${item._nom} des favoris`
                      : `Ajouter ${item._nom} aux favoris`
                  }
                  active={item._isFavorite}
                  danger
                  icon={
                    <Heart
                      size={16}
                      className={item._isFavorite ? 'fill-current' : undefined}
                      aria-hidden="true"
                    />
                  }
                  onClick={(event) => handleToggleFavorite(item._id, event)}
                />
              )
            }

            return (
              <div
                key={item._id}
                className="relative flex min-w-0 shrink-0 snap-start px-1.5 sm:px-2"
                style={{
                  width: `${100 / Math.max(1, columns)}%`,
                }}
                role="group"
                aria-roledescription="diapositive"
                aria-label={`Produit ${index + 1} sur ${items.length} : ${item._nom}`}
              >
                <div className="group/card relative h-full w-full">
                  {/* ==============================================
                      BADGES
                  ============================================== */}
                  {visibleBadges.length > 0 ? (
                    <div className="absolute left-2 top-2 z-20 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1">
                      {visibleBadges}
                    </div>
                  ) : null}

                  {/* ==============================================
                      ADMIN CHECKBOX
                  ============================================== */}
                  {adminMode ? (
                    <div className="absolute right-2 top-2 z-30">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-pill border border-line bg-surface/95 px-2 py-1 text-[10px] font-semibold text-fg-muted shadow-card backdrop-blur">
                        <input
                          type="checkbox"
                          checked={item._isSelected}
                          onChange={(event) =>
                            handleSelectProduct(item._id, event)
                          }
                          className="h-4 w-4 rounded-control border-line bg-canvas text-accent focus:ring-2 focus:ring-accent"
                          aria-label={`Sélectionner ${item._nom}`}
                        />
                        <span className="hidden sm:inline">Sélectionner</span>
                      </label>
                    </div>
                  ) : null}

                  {/* ==============================================
                      QUICK ACTIONS
                  ============================================== */}
                  {!adminMode && actionButtons.length > 0 ? (
                    <div
                      className={cn(
                        'absolute right-2 z-20 flex flex-col gap-1.5 opacity-100 transition-opacity duration-200 motion-reduce:transition-none',
                        'sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100',
                        hasOfflineIndicator ? 'top-10' : 'top-2'
                      )}
                    >
                      {actionButtons}
                    </div>
                  ) : null}

                  {/* ==============================================
                      PRODUCT CARD
                  ============================================== */}
                  <div className="h-full w-full">
                    <ProductCard
                      product={item as any}
                      variant={compact ? 'compact' : 'default'}
                      animated={shouldAnimate}
                      showActions={false}
                      showShareButton={false}
                      className="h-full"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ====================================================
            SCREEN READER LIVE REGION
        ==================================================== */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          Carrousel de {items.length} produit{items.length > 1 ? 's' : ''}.
          {' '}
          Utilisez les touches fléchées gauche et droite pour naviguer.
        </div>
      </div>
    )
  }
)

InfiniteCarouselRow.displayName = 'InfiniteCarouselRow'

export default InfiniteCarouselRow