// components/home/RecentlyViewed.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'

import Link from 'next/link'
import Image from 'next/image'

import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'

import { Container } from '@/components/layout/Container'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'

import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

import {
  AlertTriangle,
  Clock,
  Grid3X3,
  History,
  List,
  Package,
  RefreshCw,
  ShoppingCart,
  Star,
  Trash2,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface RecentlyViewedProps {
  productId?: string
  maxDisplay?: number
}

interface RecentItem {
  id: string
  timestamp: number
  views?: number
}

interface Product {
  id: string
  nom: string
  slug?: string | null
  prix: number
  prix_promo?: number | null
  effective_price: number
  images: string[]
  categorie?: string | null
  note_moyenne?: number | null
  stock?: number | null
  est_actif: boolean
  discount: number
}

interface CachedProductEntry {
  product: Product
  cached_at: number
}

type ProductCache = Record<string, CachedProductEntry>

interface ProductsBatchResult {
  idsKey: string
  products: Product[]
}

type PillTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'gercie_recent_products_v3'
const CACHE_KEY = 'gercie_recent_products_cache_v3'

const MAX_TRACKED = 20
const DEFAULT_MAX_DISPLAY = 6
const CACHE_TTL = 24 * 60 * 60 * 1000
const EVENT_NAME = 'gercie:recently-viewed-updated'

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

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function notify(
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

function stringifyImage(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = stringifyImage(item)
      if (url) return url
    }

    return null
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return (
      stringifyImage(record.url) ??
      stringifyImage(record.src) ??
      stringifyImage(record.path) ??
      stringifyImage(record.publicUrl) ??
      stringifyImage(record.secure_url) ??
      stringifyImage(record.image_url) ??
      null
    )
  }

  return null
}

function normalizeImages(value: unknown): string[] {
  const output: string[] = []
  const seen = new Set<string>()

  const push = (candidate: unknown) => {
    const url = stringifyImage(candidate)

    if (!url || seen.has(url)) return

    seen.add(url)
    output.push(url)
  }

  if (Array.isArray(value)) {
    value.forEach(push)
  } else {
    push(value)
  }

  return output
}

function formatNumber(value: number | null | undefined): string {
  const n = Number(value || 0)

  if (!Number.isFinite(n)) return '0'

  return n.toLocaleString('fr-FR')
}

function formatDecimal(
  value: number | null | undefined,
  digits = 1
): string {
  const n = Number(value || 0)

  if (!Number.isFinite(n)) return '0'

  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatPrice(value: number | null | undefined): string {
  return `${formatNumber(value)} FC`
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return "à l'instant"

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`

  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days} j`

  const months = Math.floor(days / 30)
  return `il y a ${months} mois`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT NORMALIZATION                                          */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeProduct(raw: unknown): Product | null {
  const data =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {}

  const id = textOrNull(data.id ?? data._id)
  if (!id) return null

  const nom = textOrNull(data.nom ?? data.name)
  if (!nom) return null

  const prix = toNum(data.prix ?? data.price, 0)
  if (prix <= 0) return null

  const prixPromo = toNullableNumber(data.prix_promo ?? data.promo_price)

  const effectivePrice =
    data.effective_price !== undefined && data.effective_price !== null
      ? toNum(data.effective_price, prix)
      : prixPromo !== null && prixPromo > 0 && prixPromo < prix
        ? prixPromo
        : prix

  const discount =
    data.remise_percent !== undefined && data.remise_percent !== null
      ? toNum(data.remise_percent, 0)
      : prix > 0 && effectivePrice < prix
        ? Math.round(((prix - effectivePrice) / prix) * 100)
        : 0

  return {
    id,
    nom,
    slug: textOrNull(data.slug),
    prix,
    prix_promo: prixPromo,
    effective_price: effectivePrice,
    images: normalizeImages(
      data.images ?? data.image ?? data.thumbnail ?? data.photo
    ),
    categorie: textOrNull(data.categorie ?? data.category),
    note_moyenne: toNullableNumber(
      data.note_moyenne ?? data.rating ?? data.average_rating
    ),
    stock: toNullableNumber(data.stock),
    est_actif:
      data.est_actif === undefined
        ? true
        : toBool(data.est_actif ?? data.active ?? data.is_active, true),
    discount,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LOCAL STORAGE HELPERS                                          */
/* ═══════════════════════════════════════════════════════════════ */

function readRecentItems(): RecentItem[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) return []

    // Migration ancien format : string[]
    if (parsed.length > 0 && typeof parsed[0] === 'string') {
      const migrated: RecentItem[] = parsed.map((id: string) => ({
        id,
        timestamp: Date.now() - 3_600_000,
        views: 1,
      }))

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      return migrated.slice(0, MAX_TRACKED)
    }

    return parsed
      .filter(
        (item: unknown): item is RecentItem =>
          Boolean(item) &&
          typeof (item as RecentItem).id === 'string' &&
          typeof (item as RecentItem).timestamp === 'number'
      )
      .map((item) => ({
        id: String(item.id),
        timestamp: Number(item.timestamp),
        views: toNum(item.views, 1),
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_TRACKED)
  } catch {
    return []
  }
}

function writeRecentItems(items: RecentItem[]): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // stockage indisponible : silencieux
  }
}

function readProductCache(): ProductCache {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return parsed as ProductCache
  } catch {
    return {}
  }
}

function writeProductCache(products: Product[]): void {
  if (typeof window === 'undefined' || products.length === 0) return

  try {
    const cache = readProductCache()
    const now = Date.now()

    for (const product of products) {
      cache[product.id] = {
        product,
        cached_at: now,
      }
    }

    // Limiter le cache à 100 entrées, les plus récentes conservées
    const entries = Object.entries(cache).sort(
      (a, b) => b[1].cached_at - a[1].cached_at
    )

    const limited = Object.fromEntries(entries.slice(0, 100))

    window.localStorage.setItem(CACHE_KEY, JSON.stringify(limited))
  } catch {
    // stockage plein : silencieux
  }
}

function getCachedProducts(ids: string[]): Product[] {
  if (typeof window === 'undefined' || ids.length === 0) return []

  const cache = readProductCache()
  const now = Date.now()
  const products: Product[] = []

  for (const id of ids) {
    const entry = cache[id]

    if (entry && now - entry.cached_at < CACHE_TTL) {
      const normalized = normalizeProduct(entry.product)

      if (normalized) {
        products.push(normalized)
      }
    }
  }

  return products
}

function recordLocalView(productId: string): RecentItem[] {
  const id = String(productId || '').trim()
  if (!id) return readRecentItems()

  const items = readRecentItems()
  const existing = items.find((item) => item.id === id)

  const next: RecentItem[] = existing
    ? items.map((item) =>
        item.id === id
          ? {
              ...item,
              timestamp: Date.now(),
              views: toNum(item.views, 1) + 1,
            }
          : item
      )
    : [
        {
          id,
          timestamp: Date.now(),
          views: 1,
        },
        ...items,
      ]

  const trimmed = next
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_TRACKED)

  writeRecentItems(trimmed)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: { items: trimmed },
      })
    )
  }

  return trimmed
}

function removeLocalView(productId: string): RecentItem[] {
  const id = String(productId || '').trim()
  const items = readRecentItems().filter((item) => item.id !== id)

  writeRecentItems(items)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: { items },
      })
    )
  }

  return items
}

function clearLocalViews(): void {
  writeRecentItems([])

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: { items: [] },
      })
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  API FETCH                                                      */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return []

  const params = new URLSearchParams()
  params.set('ids', ids.join(','))
  params.set('include_inactive', 'false')

  const response = await fetch(`/api/produits/batch?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  })

  const json = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >

  if (!response.ok) {
    throw new Error(
      typeof json.error === 'string'
        ? json.error
        : 'Impossible de charger les produits consultés.'
    )
  }

  const rawProducts = Array.isArray(json.data)
    ? json.data
    : Array.isArray(json)
      ? json
      : []

  const products = rawProducts
    .map(normalizeProduct)
    .filter((product): product is Product => Boolean(product))

  writeProductCache(products)

  return products
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function Pill({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: PillTone
  icon?: ReactNode
  children?: ReactNode
  className?: string
}) {
  if (children === null || children === undefined || children === '') {
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5',
        'text-[10px] font-bold leading-none shadow-sm',
        pillTones[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}

function StockPill({ product }: { product: Product }) {
  if (!product.est_actif) {
    return <Pill tone="danger">Indisponible</Pill>
  }

  if (product.stock !== null && product.stock <= 0) {
    return <Pill tone="danger">Rupture</Pill>
  }

  if (product.stock !== null && product.stock > 0 && product.stock <= 5) {
    return <Pill tone="warning">Stock limité</Pill>
  }

  return null
}

function HeaderIconButton({
  label,
  icon,
  onClick,
  danger = false,
  loading = false,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  danger?: boolean
  loading?: boolean
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-full border',
          'transition-colors duration-200 motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          danger
            ? 'border-line bg-surface text-fg-muted hover:border-danger/30 hover:bg-danger/10 hover:text-danger focus-visible:ring-danger'
            : 'border-line bg-surface text-fg-muted hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:ring-accent'
        )}
      >
        {loading ? (
          <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          icon
        )}
      </button>
    </Tooltip>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT TILE                                                   */
/* ═══════════════════════════════════════════════════════════════ */

interface RecentProductTileProps {
  product: Product
  timestamp?: number
  available: boolean
  index: number
  hasImageError: boolean
  imageSizes: string
  onImageError: (productId: string) => void
  onQuickAdd: (
    product: Product,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => void
  onRemove: (productId: string) => void
}

function RecentProductTile({
  product,
  timestamp,
  available,
  index,
  hasImageError,
  imageSizes,
  onImageError,
  onQuickAdd,
  onRemove,
}: RecentProductTileProps) {
  const image = product.images[0]
  const href = `/produits/${product.slug || product.id}`

  const media = (
    <div className="relative aspect-square w-full overflow-hidden bg-muted">
      {image && !hasImageError ? (
        <Image
          src={image}
          alt={product.nom}
          fill
          sizes={imageSizes}
          quality={85}
          priority={index < 4}
          loading={index < 4 ? 'eager' : 'lazy'}
          decoding="async"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          onError={() => onImageError(product.id)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-fg-subtle"
          aria-hidden="true"
        >
          <Package size={36} strokeWidth={1.5} />
        </div>
      )}

      {product.discount > 0 && (
        <span
          className="absolute left-2 top-2 inline-flex items-center rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-sm"
          aria-label={`Réduction de ${product.discount}%`}
        >
          -{product.discount}%
        </span>
      )}

      {timestamp ? (
        <span
          className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none"
        >
          <Clock size={10} aria-hidden="true" />
          {timeAgo(timestamp)}
        </span>
      ) : null}

      {!available && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
          aria-hidden="true"
        >
          <span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white">
            Indisponible
          </span>
        </div>
      )}
    </div>
  )

  const info = (
    <div className="flex flex-1 flex-col gap-1.5 p-3">
      <div className="min-w-0">
        <h3 className="line-clamp-2 min-h-[2.25rem] text-sm font-semibold leading-snug text-fg transition-colors duration-200 group-hover:text-accent motion-reduce:transition-none">
          {product.nom}
        </h3>

        {product.categorie && (
          <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-fg-subtle">
            {product.categorie}
          </p>
        )}
      </div>

      <div className="mt-auto space-y-1.5 pt-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-base font-bold tracking-tight text-fg">
            {formatPrice(product.effective_price)}
          </span>

          {product.prix > product.effective_price && (
            <span className="text-[11px] text-fg-subtle line-through">
              {formatPrice(product.prix)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-fg-muted">
          <div className="flex min-w-0 items-center gap-1">
            {product.note_moyenne != null && product.note_moyenne > 0 ? (
              <>
                <Star
                  size={12}
                  className="fill-accent text-accent"
                  aria-hidden="true"
                />
                <span className="font-semibold text-fg">
                  {formatDecimal(product.note_moyenne, 1)}
                </span>
              </>
            ) : (
              <span className="text-fg-subtle">Nouveau</span>
            )}
          </div>

          <StockPill product={product} />
        </div>
      </div>
    </div>
  )

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card',
        'transition-all duration-200 ease-out motion-reduce:transition-none',
        'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover motion-reduce:hover:translate-y-0',
        'focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-surface'
      )}
    >
      {available ? (
        <Link
          href={href}
          className="flex flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
          aria-label={`${product.nom} — ${formatPrice(product.effective_price)}`}
        >
          {media}
          {info}
        </Link>
      ) : (
        <div className="flex flex-1 flex-col">
          {media}
          {info}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-line p-2">
        <div className="flex-1 [&>div]:w-full">
          <Tooltip
            content={
              available ? 'Ajouter au panier' : 'Produit indisponible'
            }
          >
            <button
              type="button"
              disabled={!available}
              onClick={(event) => onQuickAdd(product, event)}
              className={cn(
                'inline-flex h-9 w-full items-center justify-center gap-2 rounded-pill text-xs font-semibold',
                'transition-colors duration-200 motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                available
                  ? 'bg-accent text-accent-contrast shadow-card hover:bg-accent-hover'
                  : 'cursor-not-allowed bg-muted text-fg-subtle'
              )}
              aria-label={
                available
                  ? `Ajouter ${product.nom} au panier`
                  : `${product.nom} est indisponible`
              }
            >
              {available ? (
                <ShoppingCart size={15} aria-hidden="true" />
              ) : (
                <AlertTriangle size={15} aria-hidden="true" />
              )}

              <span className="hidden sm:inline">
                {available ? 'Ajouter' : 'Indisponible'}
              </span>
            </button>
          </Tooltip>
        </div>

        <Tooltip content="Retirer de l’historique">
          <button
            type="button"
            onClick={() => onRemove(product.id)}
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border border-line',
              'text-fg-muted transition-colors duration-200 motion-reduce:transition-none',
              'hover:border-danger/30 hover:bg-danger/10 hover:text-danger',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
            )}
            aria-label={`Retirer ${product.nom} de l’historique`}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export default function RecentlyViewed({
  productId,
  maxDisplay = DEFAULT_MAX_DISPLAY,
}: RecentlyViewedProps) {
  const { prefersReducedMotion: reducedMotionPref } =
    useAccessibilityPreferences()

  const prefersReducedMotion = Boolean(reducedMotionPref)

  const cart = useCart() as any
  const toast = useToast() as any

  const recordedRef = useRef<string | null>(null)

  const [hydrated, setHydrated] = useState(false)
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [displayProducts, setDisplayProducts] = useState<Product[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid')
  const [usingCache, setUsingCache] = useState(false)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())

  /* ───────────────────────────────────────────────────────────── */
  /*  HYDRATION + ÉCOUTE ÉVÉNEMENTS                                */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setRecentItems(readRecentItems())
    setHydrated(true)

    const handleCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ items?: RecentItem[] }>

      if (Array.isArray(customEvent.detail?.items)) {
        setRecentItems(customEvent.detail.items)
      }
    }

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setRecentItems(readRecentItems())
      }
    }

    window.addEventListener(EVENT_NAME, handleCustomEvent)
    window.addEventListener('storage', handleStorageEvent)

    return () => {
      window.removeEventListener(EVENT_NAME, handleCustomEvent)
      window.removeEventListener('storage', handleStorageEvent)
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  TRACKING PRODUIT COURANT SI PROP FOURNIE                     */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!productId) return

    const id = String(productId).trim()
    if (!id) return

    if (recordedRef.current === id) return

    recordedRef.current = id
    const updated = recordLocalView(id)
    setRecentItems(updated)
  }, [productId])

  /* ───────────────────────────────────────────────────────────── */
  /*  PRODUITS À AFFICHER                                          */
  /* ───────────────────────────────────────────────────────────── */

  const safeMaxDisplay = useMemo(() => {
    const parsed = Math.round(toNum(maxDisplay, DEFAULT_MAX_DISPLAY))
    return Math.min(20, Math.max(1, parsed))
  }, [maxDisplay])

  const displayItems = useMemo(
    () => recentItems.slice(0, safeMaxDisplay),
    [recentItems, safeMaxDisplay]
  )

  const idsKey = useMemo(
    () => displayItems.map((item) => item.id).join(','),
    [displayItems]
  )

  const ids = useMemo(
    () => displayItems.map((item) => item.id),
    [displayItems]
  )

  const productsQuery = useQuery<ProductsBatchResult, Error>({
    queryKey: ['recently-viewed-products', idsKey],
    queryFn: async () => {
      const products = await fetchProductsByIds(ids)
      return { idsKey, products }
    },
    enabled: hydrated && idsKey.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    placeholderData: (previous) => previous,
  })

  /* ───────────────────────────────────────────────────────────── */
  /*  SYNC DISPLAY PRODUCTS                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!hydrated) return

    if (displayItems.length === 0) {
      setDisplayProducts([])
      setUsingCache(false)
      return
    }

    const result = productsQuery.data

    // IMPORTANT : on n'utilise les données React Query que si elles
    // correspondent exactement à la liste d'IDs courante.
    // Cela évite qu'un placeholderData d'une ancienne requête provoque
    // une purge incorrecte de l'historique.
    if (result && result.idsKey === idsKey) {
      const map = new Map(result.products.map((product) => [product.id, product]))
      const ordered = displayItems
        .map((item) => map.get(item.id))
        .filter((product): product is Product => Boolean(product))

      setDisplayProducts(ordered)
      setUsingCache(false)

      // Nettoie seulement les produits affichés qui n'existent plus / sont inactifs
      if (productsQuery.isSuccess && ordered.length !== displayItems.length) {
        const validIds = new Set(ordered.map((product) => product.id))
        const displayedIds = new Set(displayItems.map((item) => item.id))

        const pruned = recentItems.filter(
          (item) => !displayedIds.has(item.id) || validIds.has(item.id)
        )

        if (pruned.length !== recentItems.length) {
          setRecentItems(pruned)
          writeRecentItems(pruned)
        }
      }

      return
    }

    // En chargement, en erreur, ou si les données disponibles ne
    // correspondent pas à la requête courante : utiliser le cache local.
    const cached = getCachedProducts(ids)
    setDisplayProducts(cached)
    setUsingCache(cached.length > 0)
  }, [
    displayItems,
    hydrated,
    ids,
    idsKey,
    productsQuery.data,
    productsQuery.isSuccess,
    recentItems,
  ])

  /* ───────────────────────────────────────────────────────────── */
  /*  HANDLERS                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const handleImageError = useCallback((productId: string) => {
    setImageErrors((previous) => {
      const next = new Set(previous)
      next.add(productId)
      return next
    })
  }, [])

  const handleRemove = useCallback((productIdToRemove: string) => {
    const updated = removeLocalView(productIdToRemove)
    setRecentItems(updated)
    setDisplayProducts((previous) =>
      previous.filter((product) => product.id !== productIdToRemove)
    )
  }, [])

  const handleClearAll = useCallback(() => {
    clearLocalViews()
    setRecentItems([])
    setDisplayProducts([])
    setUsingCache(false)
    notify(toast, 'info', 'Historique des produits consultés vidé.')
  }, [toast])

  const handleQuickAdd = useCallback(
    (product: Product, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      const available =
        product.est_actif &&
        (product.stock === null || product.stock > 0)

      if (!available) {
        notify(toast, 'warning', `${product.nom} n’est plus disponible.`)
        return
      }

      try {
        if (typeof cart?.addItem === 'function') {
          cart.addItem({
            id: product.id,
            nom: product.nom,
            prix: product.effective_price,
            quantite: 1,
            image: product.images[0] ?? undefined,
          })
        } else if (typeof cart?.addToCart === 'function') {
          cart.addToCart(product.id, 1)
        } else {
          notify(toast, 'error', 'Panier indisponible.')
          return
        }

        notify(toast, 'success', `${product.nom} ajouté au panier.`)
      } catch (err: any) {
        notify(
          toast,
          'error',
          err?.message || 'Impossible d’ajouter ce produit au panier.'
        )
      }
    },
    [cart, toast]
  )

  const handleToggleView = useCallback(() => {
    setViewMode((previous) => (previous === 'grid' ? 'carousel' : 'grid'))
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  DERIVED STATES                                               */
  /* ───────────────────────────────────────────────────────────── */

  const isLoading =
    !hydrated ||
    (productsQuery.isLoading && displayProducts.length === 0)

  const isError =
    productsQuery.isError && displayProducts.length === 0

  const timestampById = useMemo(() => {
    const map = new Map<string, number>()

    recentItems.forEach((item) => {
      map.set(item.id, item.timestamp)
    })

    return map
  }, [recentItems])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: LOADING                                              */
  /* ───────────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <section
        className="relative isolate overflow-hidden bg-canvas py-12 sm:py-14 md:py-16"
        aria-busy="true"
        aria-label="Chargement des produits récemment consultés"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent/25 to-transparent"
          aria-hidden="true"
        />

        <Container>
          <div className="mb-6 flex items-center gap-3">
            <Skeleton
              variant="rectangular"
              className="h-10 w-10 rounded-xl"
            />

            <div className="space-y-2">
              <Skeleton variant="text" className="h-6 w-52 rounded-full" />
              <Skeleton variant="text" className="h-4 w-64 rounded-full" />
            </div>
          </div>

          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6"
            role="status"
            aria-label="Chargement de l’historique"
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`recently-viewed-skeleton-${index}`}
                className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card"
              >
                <Skeleton
                  variant="rectangular"
                  className="aspect-square w-full rounded-control"
                />

                <Skeleton variant="text" className="h-4 w-3/4 rounded-full" />
                <Skeleton variant="text" className="h-3 w-1/2 rounded-full" />
              </div>
            ))}
          </div>

          <span className="sr-only">Chargement…</span>
        </Container>
      </section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: ERROR                                                */
  /* ───────────────────────────────────────────────────────────── */

  if (isError) {
    return (
      <section className="relative isolate overflow-hidden bg-canvas py-12 sm:py-14 md:py-16">
        <Container>
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-card border border-danger/20 bg-danger-soft px-6 py-12 text-center"
            role="alert"
          >
            <AlertTriangle
              size={32}
              className="text-danger"
              aria-hidden="true"
            />

            <p className="text-sm font-semibold text-danger">
              {productsQuery.error instanceof Error
                ? productsQuery.error.message
                : 'Impossible de charger les produits récemment consultés.'}
            </p>

            <p className="max-w-sm text-xs text-fg-muted">
              Une erreur est survenue lors de la récupération de votre
              historique de consultation.
            </p>

            <button
              type="button"
              onClick={() => void productsQuery.refetch()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-pill border border-line bg-surface px-3.5 text-xs font-semibold text-fg shadow-card transition-colors duration-200 hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Réessayer
            </button>
          </div>
        </Container>
      </section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: EMPTY                                                */
  /* ───────────────────────────────────────────────────────────── */

  if (displayProducts.length === 0) {
    return (
      <section
        className="relative isolate overflow-hidden bg-canvas py-12 sm:py-14 md:py-16"
        aria-labelledby="recently-viewed-empty-heading"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent/25 to-transparent"
          aria-hidden="true"
        />

        <Container>
          <div className="mb-6 flex items-center gap-3">
            <span
              className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                'border border-accent/20 bg-accent-soft text-accent shadow-card'
              )}
              aria-hidden="true"
            >
              <History size={20} strokeWidth={2} />
            </span>

            <h2
              id="recently-viewed-empty-heading"
              className="text-balance text-xl font-bold tracking-tight text-fg sm:text-2xl"
            >
              Récemment consultés
            </h2>
          </div>

          <div
            className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-muted/40 px-6 py-14 text-center"
            role="status"
          >
            <History
              size={32}
              className="text-fg-subtle"
              aria-hidden="true"
            />

            <p className="text-sm font-medium text-fg-muted">
              Vous n’avez consulté aucun produit récemment.
            </p>

            <p className="text-xs text-fg-subtle">
              Vos produits visités apparaîtront ici.
            </p>

            <Link
              href="/produits"
              className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-pill border border-line bg-surface px-3.5 text-xs font-semibold text-fg shadow-card transition-colors duration-200 hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
            >
              Découvrir le catalogue
            </Link>
          </div>
        </Container>
      </section>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER: MAIN                                                 */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <section
      className="relative isolate overflow-hidden bg-canvas py-12 sm:py-14 md:py-16"
      aria-labelledby="recently-viewed-heading"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent/25 to-transparent"
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
          viewport={{ once: true, margin: '-50px' }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.45,
            ease: 'easeOut',
          }}
          className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  'border border-accent/20 bg-accent-soft text-accent shadow-card'
                )}
                aria-hidden="true"
              >
                <History size={20} strokeWidth={2} />
              </span>

              <h2
                id="recently-viewed-heading"
                className="text-balance text-xl font-bold tracking-tight text-fg sm:text-2xl md:text-3xl"
              >
                Récemment consultés
              </h2>

              <Pill tone="neutral">{displayProducts.length}</Pill>

              {usingCache && (
                <Pill tone="info" icon={<Clock size={10} aria-hidden="true" />}>
                  Données locales
                </Pill>
              )}
            </div>

            <p className="mt-1 hidden text-sm text-fg-muted sm:block">
              Reprenez votre exploration là où vous l’avez laissée.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <HeaderIconButton
              label={
                viewMode === 'grid'
                  ? 'Passer en vue carrousel'
                  : 'Passer en vue grille'
              }
              icon={
                viewMode === 'grid' ? (
                  <List size={16} aria-hidden="true" />
                ) : (
                  <Grid3X3 size={16} aria-hidden="true" />
                )
              }
              onClick={handleToggleView}
            />

            <HeaderIconButton
              label="Vider l’historique"
              icon={<Trash2 size={16} aria-hidden="true" />}
              onClick={handleClearAll}
              danger
            />

            <HeaderIconButton
              label="Actualiser"
              icon={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => void productsQuery.refetch()}
              loading={productsQuery.isFetching}
            />
          </div>
        </motion.div>

        {/* ====================================================
            GRID VIEW
           ==================================================== */}
        {viewMode === 'grid' ? (
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6"
            role="list"
            aria-label="Liste des produits récemment consultés"
          >
            {displayProducts.map((product, index) => {
              const timestamp = timestampById.get(product.id)
              const available =
                product.est_actif &&
                (product.stock === null || product.stock > 0)

              return (
                <motion.div
                  key={product.id}
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { opacity: 0, y: 18 }
                  }
                  whileInView={
                    prefersReducedMotion ? undefined : { opacity: 1, y: 0 }
                  }
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.35,
                    delay: prefersReducedMotion
                      ? 0
                      : Math.min(index * 0.04, 0.25),
                    ease: 'easeOut',
                  }}
                  className="h-full"
                  role="listitem"
                >
                  <RecentProductTile
                    product={product}
                    timestamp={timestamp}
                    available={available}
                    index={index}
                    hasImageError={imageErrors.has(product.id)}
                    imageSizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                    onImageError={handleImageError}
                    onQuickAdd={handleQuickAdd}
                    onRemove={handleRemove}
                  />
                </motion.div>
              )
            })}
          </div>
        ) : (
          /* ==================================================
              CAROUSEL VIEW
             ================================================== */
          <div
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:gap-4 sm:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="list"
            aria-label="Carrousel des produits récemment consultés"
            style={{ touchAction: 'pan-x' }}
          >
            {displayProducts.map((product, index) => {
              const timestamp = timestampById.get(product.id)
              const available =
                product.est_actif &&
                (product.stock === null || product.stock > 0)

              return (
                <motion.div
                  key={product.id}
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { opacity: 0, y: 18 }
                  }
                  whileInView={
                    prefersReducedMotion ? undefined : { opacity: 1, y: 0 }
                  }
                  viewport={{ once: true }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.35,
                    delay: prefersReducedMotion
                      ? 0
                      : Math.min(index * 0.04, 0.25),
                    ease: 'easeOut',
                  }}
                  className="w-[180px] min-w-[180px] flex-shrink-0 snap-start sm:w-[200px] sm:min-w-[200px]"
                  role="listitem"
                >
                  <RecentProductTile
                    product={product}
                    timestamp={timestamp}
                    available={available}
                    index={index}
                    hasImageError={imageErrors.has(product.id)}
                    imageSizes="200px"
                    onImageError={handleImageError}
                    onQuickAdd={handleQuickAdd}
                    onRemove={handleRemove}
                  />
                </motion.div>
              )
            })}
          </div>
        )}
      </Container>
    </section>
  )
}