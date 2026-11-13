// app/admin/produits/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useDebounce } from '@/hooks/useDebounce'

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Download,
  Eye,
  Grid3X3,
  ImageIcon,
  List,
  Loader2,
  Package,
  Pencil,
  PlusCircle,
  RefreshCcw,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { ProductBadges } from '@/components/badges/ProductBadges'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface MoneyPair {
  usd: number
  cdf: number
}

interface RawProduct {
  id?: string | number
  nom?: string
  name?: string

  prix?: number | string | null
  prix_cdf?: number | string | null
  price_cdf?: number | string | null
  prixCDF?: number | string | null
  priceCDF?: number | string | null

  prix_usd?: number | string | null
  price_usd?: number | string | null
  unit_price_usd?: number | string | null
  prixUSD?: number | string | null
  priceUSD?: number | string | null

  stock?: number | string | null
  quantity?: number | string | null

  est_actif?: boolean
  active?: boolean

  images?: any
  image?: any
  photos?: any

  categorie?: string | null
  category?: string | null

  total_ventes?: number | string | null
  sales?: number | string | null

  created_at?: string | null

  sku?: string | null

  badges?: string[] | null

  variante?: any
  product?: any

  [key: string]: any
}

interface NormalizedProduct {
  id: string
  nom: string
  sku: string
  categorie: string
  stock: number
  active: boolean
  images: string[]
  badges: string[]
  totalVentes: number
  createdAt: string
  pricePair: MoneyPair
  hasUsdSignal: boolean
}

interface ProductsResponse {
  data?: RawProduct[]
  pagination?: {
    page?: number
    totalPages?: number
    total?: number
  }
  page?: number
  totalPages?: number
  total?: number
}

interface PreviewPrice {
  id: string
  nom: string
  ancienPair: MoneyPair
  nouveauPair: MoneyPair
  canApply: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function parseFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return null

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) ? n : null
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round(value + Number.EPSILON)
}

function toUsd(cdf: number, rate: number): number {
  if (!Number.isFinite(cdf) || cdf < 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return round2(cdf / rate)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return roundCdf(usd * rate)
}

/**
 * Autorise 0.
 * Important : 0 USD explicite doit être respecté.
 */
function explicitNonNegative(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return round2(n)
    }
  }

  return null
}

function resolveRate(exchange: any): number | null {
  const candidates = [
    exchange?.rate,
    exchange?.usdRate,
    exchange?.data?.rate,
    exchange?.data?.current?.rate,
    exchange,
  ]

  for (const candidate of candidates) {
    const n = Number(candidate)

    if (Number.isFinite(n) && n > 0) return n
  }

  return null
}

/**
 * Règle absolue :
 * - Si USD existe (y compris 0) → USD = vérité.
 *   CDF = USD × taux courant.
 *   Si USD = 0, CDF = 0 même sans taux.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux courant.
 *
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number | null,
  cdfSource: number | null,
  rate: number | null,
  hasUsdSignal: boolean
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let usd = 0
  let cdf = 0

  if (hasUsdSignal) {
    usd = round2(usdSource ?? 0)

    if (usd === 0) {
      cdf = 0
    } else {
      cdf = rateOk
        ? roundCdf(toCdf(usd, rateNum))
        : roundCdf(cdfSource ?? 0)
    }
  } else {
    cdf = cdfSource != null ? roundCdf(cdfSource) : 0

    if (cdf > 0 && rateOk) {
      usd = round2(toUsd(cdf, rateNum))
    }
  }

  return {
    usd: round2(Math.max(0, usd)),
    cdf: roundCdf(Math.max(0, cdf)),
  }
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '—'

  return `$${value.toFixed(2)}`
}

function formatCdf(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'

  return `${Math.round(value).toLocaleString('fr-FR')} FC`
}

function formatPairDisplay(
  pair: MoneyPair,
  hasUsd: boolean
): string {
  if (hasUsd || pair.usd > 0) {
    const usdText = formatUsd(pair.usd)

    if (pair.cdf > 0) {
      return `${usdText} ≈ ${formatCdf(pair.cdf)}`
    }

    return usdText
  }

  if (pair.cdf > 0) {
    return formatCdf(pair.cdf)
  }

  return '—'
}

function formatDate(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

function parseTimestamp(value?: string | null): number {
  const t = new Date(value || 0).getTime()
  return Number.isFinite(t) ? t : 0
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeImages(raw: RawProduct): string[] {
  const candidates = [
    raw.images,
    raw.image,
    raw.photos,
    raw.product?.images,
    raw.product?.image,
    raw.variante?.images,
    raw.variante?.image,
  ]

  const result: string[] = []
  const seen = new Set<string>()

  const pushImage = (value: any) => {
    if (!value) return

    if (typeof value === 'string') {
      const clean = value.trim()
      if (clean && !seen.has(clean)) {
        seen.add(clean)
        result.push(clean)
      }
      return
    }

    if (Array.isArray(value)) {
      value.forEach(pushImage)
      return
    }

    if (typeof value === 'object') {
      const url =
        value.url ||
        value.src ||
        value.path ||
        value.public_url ||
        value.image

      if (typeof url === 'string') {
        const clean = url.trim()
        if (clean && !seen.has(clean)) {
          seen.add(clean)
          result.push(clean)
        }
      }
    }
  }

  candidates.forEach(pushImage)

  return result
}

function normalizeProduct(
  raw: RawProduct,
  rate: number | null
): NormalizedProduct {
  const usdSource = explicitNonNegative(
    raw.prix_usd,
    raw.price_usd,
    raw.unit_price_usd,
    raw.prixUSD,
    raw.priceUSD,
    raw.variante?.prix_usd,
    raw.variante?.price_usd,
    raw.variante?.unit_price_usd,
    raw.product?.prix_usd,
    raw.product?.price_usd,
    raw.product?.unit_price_usd
  )

  const cdfSource = explicitNonNegative(
    raw.prix,
    raw.price,
    raw.prix_cdf,
    raw.price_cdf,
    raw.prixCDF,
    raw.priceCDF,
    raw.variante?.prix,
    raw.variante?.price,
    raw.variante?.prix_cdf,
    raw.variante?.price_cdf,
    raw.product?.prix,
    raw.product?.price,
    raw.product?.prix_cdf,
    raw.product?.price_cdf
  )

  const hasUsdSignal = usdSource != null

  const pricePair = resolvePricePair(
    usdSource,
    cdfSource,
    rate,
    hasUsdSignal
  )

  const stock = Math.max(
    0,
    Math.floor(Number(raw.stock ?? raw.quantity ?? 0) || 0)
  )

  const active =
    typeof raw.est_actif === 'boolean'
      ? raw.est_actif
      : typeof raw.active === 'boolean'
        ? raw.active
        : true

  const totalVentes = Math.max(
    0,
    Math.floor(Number(raw.total_ventes ?? raw.sales ?? 0) || 0)
  )

  return {
    id: String(raw.id ?? ''),
    nom: String(raw.nom ?? raw.name ?? 'Produit'),
    sku: String(raw.sku ?? ''),
    categorie: String(raw.categorie ?? raw.category ?? ''),
    stock,
    active,
    images: normalizeImages(raw),
    badges: Array.isArray(raw.badges)
      ? raw.badges.map((b) => String(b)).filter(Boolean)
      : [],
    totalVentes,
    createdAt: String(raw.created_at ?? ''),
    pricePair,
    hasUsdSignal,
  }
}

function normalizeSortParam(value?: string | null): string {
  const raw = String(value || 'created_at').trim().toLowerCase()

  if (['created_at', 'date', 'createdat'].includes(raw)) return 'created_at'
  if (['prix', 'price', 'total', 'montant'].includes(raw)) return 'prix'
  if (['nom', 'name', 'titre'].includes(raw)) return 'nom'
  if (['stock', 'quantite', 'quantity'].includes(raw)) return 'stock'

  return raw || 'created_at'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI HELPERS                                               */
/* ═══════════════════════════════════════════════════════════════ */

function PriceDisplay({
  pair,
  hasUsd,
  compact = false,
}: {
  pair: MoneyPair
  hasUsd: boolean
  compact?: boolean
}) {
  const showUsd = hasUsd || pair.usd > 0

  return (
    <div className={cn('text-right', compact ? 'text-sm' : 'text-sm')}>
      <p className="font-semibold text-gold-600">
        {showUsd
          ? formatUsd(pair.usd)
          : pair.cdf > 0
            ? formatCdf(pair.cdf)
            : '—'}
      </p>

      {showUsd && pair.cdf > 0 && (
        <p className="text-[11px] text-neutral-400">
          ≈ {formatCdf(pair.cdf)}
        </p>
      )}

      {!showUsd && pair.cdf > 0 && (
        <p className="text-[11px] text-amber-600">
          CDF legacy · taux indisponible
        </p>
      )}
    </div>
  )
}

function StatPairText({
  pair,
  hasUsd,
}: {
  pair: MoneyPair
  hasUsd: boolean
}) {
  return (
    <span>
      {formatPairDisplay(pair, hasUsd)}
    </span>
  )
}

function escapeCsv(value: any): string {
  const s = value == null ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminProduitsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const toast = useToast() as any

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const { user, loading: authLoading, isAdmin } = useAuth()
  const exchange = useExchangeRate() as any
  const prefersReducedMotion = useReducedMotion()

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const rawRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  const rateLoading = Boolean(exchange?.loading)

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   */
  const effectiveRate = mounted ? rawRate : null
  const rateNum = Number(effectiveRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  /* ---------------------------------------------------------- */
  /* États URL / filtres                                         */
  /* ---------------------------------------------------------- */

  const [search, setSearch] = useState(searchParams.get('search') || '')

  const [filter, setFilter] = useState<'all' | 'actif' | 'inactif'>(
    (searchParams.get('filter') as 'all' | 'actif' | 'inactif') || 'all'
  )

  const [page, setPage] = useState(
    Number(searchParams.get('page') || 1) || 1
  )

  const [pageSize, setPageSize] = useState(
    Number(searchParams.get('limit') || 10) || 10
  )

  const [sortColumn, setSortColumn] = useState(
    normalizeSortParam(searchParams.get('sort'))
  )

  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    (searchParams.get('dir') as 'asc' | 'desc') || 'desc'
  )

  const [viewMode, setViewMode] = useState<'table' | 'grid'>(
    searchParams.get('view') === 'grid' ? 'grid' : 'table'
  )

  const [badgeSearch, setBadgeSearch] = useState(
    searchParams.get('badge') || ''
  )

  /**
   * Filtres prix :
   * - USD = source principale saisie par l’admin.
   * - Legacy CDF seulement si ancienne URL sans USD.
   */
  const [priceMinUsd, setPriceMinUsd] = useState(
    searchParams.get('min_usd') || ''
  )

  const [priceMaxUsd, setPriceMaxUsd] = useState(
    searchParams.get('max_usd') || ''
  )

  const [legacyMinCdf, setLegacyMinCdf] = useState(
    !searchParams.get('min_usd')
      ? searchParams.get('min') || searchParams.get('min_price') || ''
      : ''
  )

  const [legacyMaxCdf, setLegacyMaxCdf] = useState(
    !searchParams.get('max_usd')
      ? searchParams.get('max') || searchParams.get('max_price') || ''
      : ''
  )

  /* ---------------------------------------------------------- */
  /* États locaux                                                */
  /* ---------------------------------------------------------- */

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [quickViewProduct, setQuickViewProduct] =
    useState<NormalizedProduct | null>(null)

  const [adjustPriceModal, setAdjustPriceModal] = useState(false)
  const [pricePercent, setPricePercent] = useState('')
  const [previewPrices, setPreviewPrices] = useState<PreviewPrice[]>([])
  const [lastAjustementId, setLastAjustementId] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  /* ---------------------------------------------------------- */
  /* Auth guard                                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/admin/produits')}`
      )
      return
    }

    if (!isAdmin) {
      router.replace('/')
    }
  }, [authLoading, isAdmin, router, user])

  /* ---------------------------------------------------------- */
  /* Conversion legacy CDF → USD quand le taux arrive            */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!rateOk) return

    if (legacyMinCdf && !priceMinUsd) {
      const cdf = explicitNonNegative(legacyMinCdf)

      if (cdf != null) {
        setPriceMinUsd(String(round2(toUsd(cdf, rateNum))))
        setLegacyMinCdf('')
      }
    }

    if (legacyMaxCdf && !priceMaxUsd) {
      const cdf = explicitNonNegative(legacyMaxCdf)

      if (cdf != null) {
        setPriceMaxUsd(String(round2(toUsd(cdf, rateNum))))
        setLegacyMaxCdf('')
      }
    }
  }, [
    legacyMaxCdf,
    legacyMinCdf,
    priceMaxUsd,
    priceMinUsd,
    rateNum,
    rateOk,
  ])

  /* ---------------------------------------------------------- */
  /* Reset sélection                                             */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    setSelectedIds(new Set())
  }, [
    badgeSearch,
    debouncedSearch,
    filter,
    page,
    pageSize,
    priceMaxUsd,
    priceMinUsd,
    sortColumn,
    sortDirection,
  ])

  /* ---------------------------------------------------------- */
  /* URL sync                                                    */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    const params = new URLSearchParams()

    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filter !== 'all') params.set('filter', filter)
    if (badgeSearch) params.set('badge', badgeSearch)

    if (page > 1) params.set('page', String(page))
    if (pageSize !== 10) params.set('limit', String(pageSize))

    params.set('sort', sortColumn)
    params.set('dir', sortDirection)

    if (viewMode === 'grid') params.set('view', 'grid')

    if (priceMinUsd) {
      params.set('min_usd', priceMinUsd)
    } else if (legacyMinCdf) {
      params.set('min_price', legacyMinCdf)
    }

    if (priceMaxUsd) {
      params.set('max_usd', priceMaxUsd)
    } else if (legacyMaxCdf) {
      params.set('max_price', legacyMaxCdf)
    }

    router.replace(`/admin/produits?${params.toString()}`, {
      scroll: false,
    })
  }, [
    badgeSearch,
    debouncedSearch,
    filter,
    legacyMaxCdf,
    legacyMinCdf,
    page,
    pageSize,
    priceMaxUsd,
    priceMinUsd,
    router,
    sortColumn,
    sortDirection,
    viewMode,
  ])

  /* ---------------------------------------------------------- */
  /* Query produits                                              */
  /* ---------------------------------------------------------- */

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<ProductsResponse>({
    queryKey: [
      'admin-products',
      debouncedSearch,
      filter,
      page,
      pageSize,
      sortColumn,
      sortDirection,
      badgeSearch,
      priceMinUsd,
      priceMaxUsd,
      legacyMinCdf,
      legacyMaxCdf,
      effectiveRate,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()

      if (debouncedSearch) params.set('search', debouncedSearch)

      if (filter !== 'all') {
        params.set('est_actif', filter === 'actif' ? 'true' : 'false')
      }

      params.set('page', String(page))
      params.set('limit', String(pageSize))

      const sortBy =
        sortColumn === 'prix'
          ? 'prix'
          : sortColumn === 'nom'
            ? 'nom'
            : sortColumn === 'stock'
              ? 'stock'
              : 'created_at'

      params.set('sort_by', sortBy)
      params.set('sort_order', sortDirection)

      if (sortColumn === 'prix') {
        params.set('sort_by_usd', 'prix_usd')
      }

      const minUsdNum = explicitNonNegative(priceMinUsd)
      const maxUsdNum = explicitNonNegative(priceMaxUsd)

      if (minUsdNum != null) {
        params.set('min_usd', String(round2(minUsdNum)))

        if (rateOk) {
          params.set(
            'min_price',
            String(roundCdf(toCdf(minUsdNum, rateNum)))
          )
        }
      } else if (legacyMinCdf) {
        params.set('min_price', legacyMinCdf)
      }

      if (maxUsdNum != null) {
        params.set('max_usd', String(round2(maxUsdNum)))

        if (rateOk) {
          params.set(
            'max_price',
            String(roundCdf(toCdf(maxUsdNum, rateNum)))
          )
        }
      } else if (legacyMaxCdf) {
        params.set('max_price', legacyMaxCdf)
      }

      if (badgeSearch) params.set('badge', badgeSearch)

      const res = await fetch(
        `/api/admin/produits?${params.toString()}`,
        {
          credentials: 'include',
        }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur chargement produits'
        )
      }

      return json
    },
    enabled: !!user && !!isAdmin,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  /* ---------------------------------------------------------- */
  /* Normalisation                                               */
  /* ---------------------------------------------------------- */

  const rawProducts = useMemo<RawProduct[]>(() => {
    return Array.isArray(data?.data) ? data.data : []
  }, [data])

  const pagination = useMemo(() => {
    return {
      page: Number(
        data?.pagination?.page ?? data?.page ?? page
      ) || 1,
      totalPages: Number(
        data?.pagination?.totalPages ?? data?.totalPages ?? 1
      ) || 1,
      total: Number(
        data?.pagination?.total ?? data?.total ?? rawProducts.length
      ) || 0,
    }
  }, [data, page, rawProducts.length])

  const normalizedProducts = useMemo<NormalizedProduct[]>(() => {
    return rawProducts.map((raw) =>
      normalizeProduct(
        raw,
        effectiveRate ?? null
      )
    )
  }, [effectiveRate, rawProducts])

  const sortedProducts = useMemo<NormalizedProduct[]>(() => {
    const arr = [...normalizedProducts]
    const dir = sortDirection === 'asc' ? 1 : -1

    switch (sortColumn) {
      case 'nom':
        arr.sort((a, b) => a.nom.localeCompare(b.nom) * dir)
        break

      case 'prix':
        arr.sort((a, b) => {
          const usdDiff = a.pricePair.usd - b.pricePair.usd

          if (usdDiff !== 0) return usdDiff * dir

          return (a.pricePair.cdf - b.pricePair.cdf) * dir
        })
        break

      case 'stock':
        arr.sort((a, b) => (a.stock - b.stock) * dir)
        break

      case 'created_at':
      default:
        arr.sort(
          (a, b) =>
            (parseTimestamp(a.createdAt) -
              parseTimestamp(b.createdAt)) *
            dir
        )
        break
    }

    return arr
  }, [normalizedProducts, sortColumn, sortDirection])

  const selectedProducts = useMemo<NormalizedProduct[]>(() => {
    return sortedProducts.filter((p) => selectedIds.has(p.id))
  }, [selectedIds, sortedProducts])

  const stats = useMemo(() => {
    const actifs = sortedProducts.filter((p) => p.active).length
    const inactifs = sortedProducts.length - actifs

    let stockUsd = 0
    let stockCdf = 0

    for (const p of sortedProducts) {
      stockUsd += p.pricePair.usd * p.stock
      stockCdf += p.pricePair.cdf * p.stock
    }

    const hasUsdGlobal =
      rateOk || sortedProducts.some((p) => p.hasUsdSignal)

    return {
      catalogue: pagination.total,
      pageCount: sortedProducts.length,
      actifs,
      inactifs,
      stockPair: {
        usd: round2(stockUsd),
        cdf: roundCdf(stockCdf),
      },
      hasUsdGlobal,
    }
  }, [pagination.total, rateOk, sortedProducts])

  /* ---------------------------------------------------------- */
  /* Mutations                                                   */
  /* ---------------------------------------------------------- */

  const toggleMutation = useMutation({
    mutationFn: async ({
      id,
      actif,
    }: {
      id: string
      actif: boolean
    }) => {
      const res = await fetch(`/api/admin/produits/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          est_actif: !actif,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Erreur mise à jour statut')
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      addToast({
        type: 'success',
        message: 'Statut mis à jour',
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur lors de la mise à jour',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/produits/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Erreur suppression produit')
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      addToast({
        type: 'success',
        message: 'Produit supprimé',
      })

      setConfirmDeleteId(null)
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur lors de la suppression',
      })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/admin/produits/${id}/duplicate`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Erreur duplication produit')
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      addToast({
        type: 'success',
        message: 'Produit dupliqué',
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur duplication',
      })
    },
  })

  const bulkPriceMutation = useMutation({
    mutationFn: async ({
      ids,
      pourcentage,
    }: {
      ids: string[]
      pourcentage: number
    }) => {
      const res = await fetch('/api/admin/produits/bulk-price', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ids,
          pourcentage,
          currency: 'USD',
          usd_source: true,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur ajustement prix'
        )
      }

      return json
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      const updatedCount =
        Array.isArray(data?.produits)
          ? data.produits.length
          : Number(data?.updated ?? selectedIds.size)

      addToast({
        type: 'success',
        message: `${updatedCount} prix mis à jour`,
      })

      setAdjustPriceModal(false)
      setPreviewPrices([])
      setLastAjustementId(data?.ajustementId ?? null)
      setSelectedIds(new Set())
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur ajustement prix',
      })
    },
  })

  const undoPriceMutation = useMutation({
    mutationFn: async (ajustementId: string) => {
      const res = await fetch(
        `/api/admin/produits/bulk-price?ajustementId=${encodeURIComponent(ajustementId)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur annulation ajustement'
        )
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      addToast({
        type: 'success',
        message: 'Ajustement annulé',
      })

      setLastAjustementId(null)
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur annulation ajustement',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleSort = useCallback((col: string) => {
    const normalized = normalizeSortParam(col)

    setSortColumn((prev) => {
      if (prev === normalized) {
        setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'))
        return prev
      }

      setSortDirection(normalized === 'created_at' ? 'desc' : 'asc')
      return normalized
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === sortedProducts.length
        ? new Set()
        : new Set(sortedProducts.map((p) => p.id))
    )
  }, [sortedProducts])

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)

      if (next.has(id)) next.delete(id)
      else next.add(id)

      return next
    })
  }, [])

  const bulkToggle = useCallback(
    (activate: boolean) => {
      if (selectedProducts.length === 0) return

      for (const product of selectedProducts) {
        if (product.active !== activate) {
          toggleMutation.mutate({
            id: product.id,
            actif: product.active,
          })
        }
      }

      setSelectedIds(new Set())
    },
    [selectedProducts, toggleMutation]
  )

  const bulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return

    if (
      !window.confirm(
        `Supprimer ${selectedIds.size} produit(s) ?`
      )
    ) {
      return
    }

    for (const id of Array.from(selectedIds)) {
      deleteMutation.mutate(id)
    }

    setSelectedIds(new Set())
  }, [deleteMutation, selectedIds])

  const handlePreviewPrice = useCallback(() => {
    const percent = Number(pricePercent)

    if (!Number.isFinite(percent)) {
      addToast({
        type: 'error',
        message: 'Pourcentage invalide.',
      })
      return
    }

    if (percent < -100 || percent > 1000) {
      addToast({
        type: 'error',
        message:
          'Le pourcentage doit être compris entre -100% et 1000%.',
      })
      return
    }

    if (selectedProducts.length === 0) {
      addToast({
        type: 'error',
        message: 'Aucun produit sélectionné.',
      })
      return
    }

    const factor = 1 + percent / 100

    const preview = selectedProducts.map((p) => {
      const oldUsd = p.pricePair.usd
      const oldCdf = p.pricePair.cdf

      const newUsd = round2(Math.max(0, oldUsd * factor))

      const newCdf = rateOk
        ? roundCdf(toCdf(newUsd, rateNum))
        : roundCdf(Math.max(0, oldCdf * factor))

      return {
        id: p.id,
        nom: p.nom,
        ancienPair: {
          usd: oldUsd,
          cdf: oldCdf,
        },
        nouveauPair: {
          usd: newUsd,
          cdf: newCdf,
        },
        canApply: p.hasUsdSignal || rateOk,
      }
    })

    setPreviewPrices(preview)
  }, [
    addToast,
    pricePercent,
    rateNum,
    rateOk,
    selectedProducts,
  ])

  const applyBulkPrice = useCallback(() => {
    const percent = Number(pricePercent)

    if (!Number.isFinite(percent)) {
      addToast({
        type: 'error',
        message: 'Pourcentage invalide.',
      })
      return
    }

    if (percent < -100 || percent > 1000) {
      addToast({
        type: 'error',
        message:
          'Le pourcentage doit être compris entre -100% et 1000%.',
      })
      return
    }

    if (selectedProducts.length === 0) {
      addToast({
        type: 'error',
        message: 'Aucun produit sélectionné.',
      })
      return
    }

    const missingUsdNoRate = selectedProducts.some(
      (p) => !p.hasUsdSignal && !rateOk
    )

    if (missingUsdNoRate) {
      addToast({
        type: 'error',
        message:
          "Impossible d'ajuster ces prix : certains produits n'ont pas de prix USD explicite et le taux USD/CDF est indisponible.",
      })
      return
    }

    bulkPriceMutation.mutate({
      ids: Array.from(selectedIds),
      pourcentage: percent,
    })
  }, [
    addToast,
    bulkPriceMutation,
    pricePercent,
    rateOk,
    selectedIds,
    selectedProducts,
  ])

  const exportCSV = useCallback(() => {
    if (sortedProducts.length === 0) return

    const headers = [
      'ID',
      'Nom',
      'SKU',
      'Catégorie',
      'Prix USD',
      'Prix CDF',
      'Stock',
      'Valeur stock USD',
      'Valeur stock CDF',
      'Actif',
      'Ventes',
      'Badges',
      'Créé le',
      'Taux utilisé',
    ]

    const rows = sortedProducts.map((p) => {
      const resolvedUsd =
        p.hasUsdSignal || rateOk
          ? p.pricePair.usd.toFixed(2)
          : ''

      const stockUsd =
        p.hasUsdSignal || rateOk
          ? (p.pricePair.usd * p.stock).toFixed(2)
          : ''

      return [
        p.id,
        p.nom,
        p.sku,
        p.categorie,
        resolvedUsd,
        String(p.pricePair.cdf),
        String(p.stock),
        stockUsd,
        String(roundCdf(p.pricePair.cdf * p.stock)),
        p.active ? 'Oui' : 'Non',
        String(p.totalVentes),
        p.badges.join(', '),
        p.createdAt,
        effectiveRate ? String(round2(Number(effectiveRate))) : '',
      ]
    })

    const csvContent = [headers, ...rows]
      .map((r) => r.map(escapeCsv).join(','))
      .join('\n')

    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url
    a.download = `produits_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`
    a.click()

    URL.revokeObjectURL(url)

    addToast({
      type: 'success',
      message: 'Export CSV généré',
    })
  }, [addToast, effectiveRate, rateOk, sortedProducts])

  /* ---------------------------------------------------------- */
  /* Correction page hors bornes                                 */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (pagination.totalPages > 0 && page > pagination.totalPages) {
      setPage(1)
    }
  }, [pagination.totalPages, page])

  /* ---------------------------------------------------------- */
  /* Early returns                                               */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <Container className="py-8">
        <div className="space-y-6">
          <Skeleton
            variant="text"
            className="h-8 w-48"
            shimmer
            shimmerVariant="gold"
          />
          <Skeleton
            variant="rectangular"
            className="h-96 w-full rounded-2xl"
            shimmer
            shimmerVariant="gold"
          />
        </div>
      </Container>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  if (isError) {
    return (
      <Container className="py-12">
        <div className="text-center">
          <AlertTriangle
            size={48}
            className="mx-auto mb-4 text-red-500"
            aria-hidden="true"
          />

          <p className="mb-4 text-red-500">
            {(error as Error)?.message ||
              'Impossible de charger les produits.'}
          </p>

          <Button
            variant="outline-gold"
            onClick={() => void refetch()}
            leftIcon={
              <RefreshCcw size={16} aria-hidden="true" />
            }
          >
            Réessayer
          </Button>
        </div>
      </Container>
    )
  }

  const motionInitial = prefersReducedMotion
    ? false
    : { opacity: 0, y: 20 }

  const canOpenBulkPrice = selectedIds.size > 0

  const bulkPriceBlockedReason =
    !rateOk &&
    selectedProducts.some((p) => !p.hasUsdSignal)

  return (
    <Container className="py-8">
      {/* En-tête */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            Produits
          </h1>

          <p className="mt-1 text-sm text-neutral-500">
            {pagination.total} produit(s) dans le catalogue
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Tooltip content="Exporter en CSV">
            <Button
              variant="outline-gold"
              size="sm"
              onClick={exportCSV}
              leftIcon={
                <Download size={14} aria-hidden="true" />
              }
            >
              Export
            </Button>
          </Tooltip>

          <Link href="/admin/produits/ajouter">
            <Button
              variant="luxe"
              size="md"
              leftIcon={
                <PlusCircle size={16} aria-hidden="true" />
              }
            >
              Ajouter un produit
            </Button>
          </Link>
        </div>
      </div>

      {/* Mini stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            icon: <Package size={20} className="text-gold-500" />,
            label: 'Catalogue',
            value: String(stats.catalogue),
          },
          {
            icon: <Check size={20} className="text-green-500" />,
            label: 'Actifs (page)',
            value: String(stats.actifs),
          },
          {
            icon: <X size={20} className="text-red-500" />,
            label: 'Inactifs (page)',
            value: String(stats.inactifs),
          },
          {
            icon: <DollarSign size={20} className="text-blue-500" />,
            label: 'Valeur stock (page)',
            value: (
              <StatPairText
                pair={stats.stockPair}
                hasUsd={stats.hasUsdGlobal}
              />
            ),
          },
        ].map((stat, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 rounded-xl border border-gold-400/10 bg-white/50 p-4 backdrop-blur-sm dark:bg-midnight-800/40"
          >
            <div className="rounded-lg bg-gold-400/10 p-2">
              {stat.icon}
            </div>

            <div className="min-w-0">
              <p className="text-xs text-neutral-500">
                {stat.label}
              </p>

              <p className="truncate font-bold text-neutral-900 dark:text-neutral-100">
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Recherche & filtres */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
              size={18}
              aria-hidden="true"
            />

            <Input
              variant="glass"
              placeholder="Rechercher un produit..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-10"
              allowClear
              onClear={() => setSearch('')}
            />
          </div>

          <div className="relative max-w-xs flex-1">
            <Input
              variant="glass"
              placeholder="Filtrer par badge..."
              value={badgeSearch}
              onChange={(e) => {
                setBadgeSearch(e.target.value)
                setPage(1)
              }}
              className="pl-10"
              size="sm"
              leftIcon={
                <Tag
                  size={14}
                  className="text-neutral-400"
                  aria-hidden="true"
                />
              }
              allowClear
              onClear={() => setBadgeSearch('')}
            />
          </div>

          <div className="flex gap-2">
            {(['all', 'actif', 'inactif'] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f)
                  setPage(1)
                }}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition',
                  filter === f
                    ? 'border-gold-400/50 bg-gold-400/20 text-gold-600 shadow-gold'
                    : 'border-gold-400/20 bg-white text-neutral-600 hover:border-gold-400 dark:bg-midnight-800 dark:text-neutral-300'
                )}
              >
                {f === 'all'
                  ? 'Tous'
                  : f === 'actif'
                    ? 'Actifs'
                    : 'Inactifs'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              variant="glass"
              type="number"
              placeholder="Min (USD)"
              value={priceMinUsd}
              onChange={(e) => {
                setPriceMinUsd(e.target.value)
                setLegacyMinCdf('')
                setPage(1)
              }}
              className="w-28"
              size="sm"
            />

            <span className="text-neutral-400">–</span>

            <Input
              variant="glass"
              type="number"
              placeholder="Max (USD)"
              value={priceMaxUsd}
              onChange={(e) => {
                setPriceMaxUsd(e.target.value)
                setLegacyMaxCdf('')
                setPage(1)
              }}
              className="w-28"
              size="sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canOpenBulkPrice && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">
                {selectedIds.size} sélectionné(s)
              </span>

              <Button
                variant="accent"
                size="sm"
                onClick={() => bulkToggle(true)}
                disabled={toggleMutation.isPending}
              >
                Activer
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={() => bulkToggle(false)}
                disabled={toggleMutation.isPending}
              >
                Désactiver
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={bulkDelete}
                disabled={deleteMutation.isPending}
              >
                Supprimer
              </Button>

              <Button
                variant="luxe"
                size="sm"
                onClick={() => {
                  setAdjustPriceModal(true)
                  setPricePercent('')
                  setPreviewPrices([])
                }}
                leftIcon={
                  <DollarSign
                    size={14}
                    aria-hidden="true"
                  />
                }
              >
                Ajuster prix
              </Button>
            </div>
          )}

          <button
            onClick={() =>
              setViewMode(viewMode === 'table' ? 'grid' : 'table')
            }
            className={cn(
              'rounded-lg border p-2 transition',
              viewMode === 'grid'
                ? 'border-gold-400/30 bg-gold-400/10'
                : 'border-neutral-200 dark:border-neutral-700'
            )}
            aria-label="Changer la vue"
          >
            {viewMode === 'table' ? (
              <Grid3X3 size={16} aria-hidden="true" />
            ) : (
              <List size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {!rateOk &&
        (priceMinUsd ||
          priceMaxUsd ||
          legacyMinCdf ||
          legacyMaxCdf ||
          selectedIds.size > 0) && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />

            <div>
              <p className="font-medium">
                {rateLoading
                  ? 'Chargement du taux USD/CDF…'
                  : 'Taux USD/CDF indisponible'}
              </p>

              <p className="mt-1 text-xs opacity-90">
                Les filtres et ajustements restent pilotés par USD.
                Tant que le taux n’est pas disponible, les anciens
                montants CDF ne peuvent être utilisés que comme
                fallback d’affichage, pas comme vérité.
              </p>
            </div>
          </div>
        )}

      {/* Liste vide */}
      {sortedProducts.length === 0 ? (
        <motion.div
          initial={motionInitial}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-gold-400/20 bg-white/50 p-12 text-center dark:bg-midnight-800/40"
        >
          <Package
            size={48}
            className="mx-auto mb-4 text-neutral-300"
            aria-hidden="true"
          />

          <p className="text-neutral-500">
            {search ||
            filter !== 'all' ||
            badgeSearch ||
            priceMinUsd ||
            priceMaxUsd
              ? 'Aucun produit ne correspond à ces critères.'
              : 'Aucun produit pour le moment.'}
          </p>

          {!search &&
            filter === 'all' &&
            !badgeSearch &&
            !priceMinUsd &&
            !priceMaxUsd && (
              <Link
                href="/admin/produits/ajouter"
                className="mt-4 inline-flex items-center gap-1 text-gold-500 hover:underline"
              >
                <PlusCircle size={14} aria-hidden="true" />
                Créer le premier produit
              </Link>
            )}
        </motion.div>
      ) : viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-2xl border border-gold-400/20 bg-white/50 backdrop-blur-sm dark:bg-midnight-800/40">
          <table className="min-w-full divide-y divide-gold-400/10">
            <thead className="bg-neutral-50 dark:bg-midnight-900/50">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === sortedProducts.length &&
                      sortedProducts.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="rounded text-gold-500"
                    aria-label="Tout sélectionner"
                  />
                </th>

                <th
                  className="cursor-pointer px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-gold-500"
                  onClick={() => handleSort('nom')}
                >
                  Nom{' '}
                  {sortColumn === 'nom' &&
                    (sortDirection === 'asc' ? '↑' : '↓')}
                </th>

                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Image
                </th>

                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Badges
                </th>

                <th
                  className="cursor-pointer px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-gold-500"
                  onClick={() => handleSort('prix')}
                >
                  Prix{' '}
                  {sortColumn === 'prix' &&
                    (sortDirection === 'asc' ? '↑' : '↓')}
                </th>

                <th
                  className="cursor-pointer px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-gold-500"
                  onClick={() => handleSort('stock')}
                >
                  Stock{' '}
                  {sortColumn === 'stock' &&
                    (sortDirection === 'asc' ? '↑' : '↓')}
                </th>

                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Ventes
                </th>

                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Statut
                </th>

                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gold-400/5">
              <AnimatePresence>
                {sortedProducts.map((prod) => (
                  <motion.tr
                    key={prod.id}
                    initial={
                      prefersReducedMotion
                        ? false
                        : { opacity: 0, y: 10 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="transition-colors hover:bg-gold-400/5"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(prod.id)}
                        onChange={() => toggleSelectOne(prod.id)}
                        className="rounded text-gold-500"
                        aria-label={`Sélectionner ${prod.nom}`}
                      />
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      <button
                        className="text-left hover:text-gold-500"
                        onClick={() => setQuickViewProduct(prod)}
                      >
                        {prod.nom}
                      </button>

                      {prod.categorie && (
                        <p className="text-xs text-neutral-400">
                          {prod.categorie}
                        </p>
                      )}

                      {prod.sku && (
                        <p className="text-xs text-neutral-400">
                          SKU: {prod.sku}
                        </p>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {prod.images[0] ? (
                        <img
                          src={prod.images[0]}
                          alt={prod.nom}
                          className="h-10 w-10 rounded-lg border border-gold-400/20 object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-700">
                          <ImageIcon
                            size={16}
                            className="text-neutral-400"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <ProductBadges
                        badgeIds={prod.badges}
                        size="sm"
                      />
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <PriceDisplay
                        pair={prod.pricePair}
                        hasUsd={prod.hasUsdSignal}
                      />
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-700 dark:text-neutral-300">
                      {prod.stock}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500">
                      {prod.totalVentes}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <button
                        onClick={() =>
                          toggleMutation.mutate({
                            id: prod.id,
                            actif: prod.active,
                          })
                        }
                        disabled={toggleMutation.isPending}
                      >
                        <Badge
                          variant={prod.active ? 'accent' : 'danger'}
                          size="sm"
                        >
                          {prod.active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </button>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <Tooltip content="Aperçu rapide">
                          <button
                            onClick={() => setQuickViewProduct(prod)}
                            className="rounded-lg p-2 text-neutral-400 transition hover:bg-gold-400/10 hover:text-gold-500"
                            aria-label="Aperçu rapide"
                          >
                            <Eye size={16} aria-hidden="true" />
                          </button>
                        </Tooltip>

                        <Tooltip content="Modifier">
                          <Link
                            href={`/admin/produits/${prod.id}/modifier`}
                            className="rounded-lg p-2 text-neutral-400 transition hover:bg-gold-400/10 hover:text-gold-500"
                            aria-label="Modifier"
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </Link>
                        </Tooltip>

                        <Tooltip content="Dupliquer">
                          <button
                            onClick={() =>
                              duplicateMutation.mutate(prod.id)
                            }
                            disabled={duplicateMutation.isPending}
                            className="rounded-lg p-2 text-neutral-400 transition hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
                            aria-label="Dupliquer"
                          >
                            <Copy size={16} aria-hidden="true" />
                          </button>
                        </Tooltip>

                        <Tooltip content="Supprimer">
                          <button
                            onClick={() => setConfirmDeleteId(prod.id)}
                            className="rounded-lg p-2 text-neutral-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                            aria-label="Supprimer"
                          >
                            {deleteMutation.isPending &&
                            deleteMutation.variables === prod.id ? (
                              <Loader2
                                size={16}
                                className="animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Trash2 size={16} aria-hidden="true" />
                            )}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence>
            {sortedProducts.map((prod) => (
              <motion.div
                key={prod.id}
                initial={
                  prefersReducedMotion
                    ? false
                    : { opacity: 0, scale: 0.9 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group rounded-2xl border border-gold-400/10 bg-white/50 p-4 transition hover:shadow-card-hover dark:bg-midnight-800/40"
              >
                <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-700">
                  {prod.images[0] ? (
                    <img
                      src={prod.images[0]}
                      alt={prod.nom}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package
                      size={32}
                      className="absolute inset-0 m-auto text-neutral-400"
                      aria-hidden="true"
                    />
                  )}

                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => setQuickViewProduct(prod)}
                      className="rounded-full bg-white/80 p-1.5"
                      aria-label="Aperçu rapide"
                    >
                      <Eye size={14} aria-hidden="true" />
                    </button>

                    <Link
                      href={`/admin/produits/${prod.id}/modifier`}
                      className="rounded-full bg-white/80 p-1.5"
                      aria-label="Modifier"
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </Link>
                  </div>

                  {prod.badges.length > 0 && (
                    <div className="absolute left-2 top-2">
                      <ProductBadges
                        badgeIds={prod.badges}
                        size="sm"
                      />
                    </div>
                  )}
                </div>

                <h3 className="truncate font-semibold text-sm text-foreground">
                  {prod.nom}
                </h3>

                <div className="mt-1 flex items-center justify-between gap-2">
                  <PriceDisplay
                    pair={prod.pricePair}
                    hasUsd={prod.hasUsdSignal}
                    compact
                  />

                  <Badge
                    variant={prod.active ? 'accent' : 'danger'}
                    size="sm"
                  >
                    {prod.active ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                  <span>Stock: {prod.stock}</span>
                  <span>Ventes: {prod.totalVentes}</span>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline-gold"
                    size="sm"
                    fullWidth
                    onClick={() =>
                      toggleMutation.mutate({
                        id: prod.id,
                        actif: prod.active,
                      })
                    }
                    disabled={toggleMutation.isPending}
                  >
                    {prod.active ? 'Désactiver' : 'Activer'}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDeleteId(prod.id)}
                  >
                    <Trash2
                      size={14}
                      className="text-red-500"
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <Button
              variant="outline-gold"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>

            {Array.from(
              { length: pagination.totalPages },
              (_, i) => i + 1
            )
              .filter(
                (p) =>
                  pagination.totalPages <= 7 ||
                  p === 1 ||
                  p === pagination.totalPages ||
                  Math.abs(p - page) <= 1
              )
              .map((p, idx, arr) => (
                <div key={p} className="flex items-center">
                  {idx > 0 && p - arr[idx - 1] > 1 && (
                    <span className="px-2 text-neutral-400">…</span>
                  )}

                  <Button
                    variant={p === page ? 'luxe' : 'outline-gold'}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                </div>
              ))}

            <Button
              variant="outline-gold"
              size="icon"
              onClick={() =>
                setPage((p) =>
                  Math.min(pagination.totalPages, p + 1)
                )
              }
              disabled={page === pagination.totalPages}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <span>Afficher</span>

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
            >
              {[10, 25, 50].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Modal confirmation suppression */}
      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Confirmer la suppression"
        size="sm"
        accent="danger"
      >
        <div className="space-y-4 text-center">
          <AlertTriangle
            size={48}
            className="mx-auto text-red-500"
            aria-hidden="true"
          />

          <p className="text-neutral-700 dark:text-neutral-300">
            Cette action est irréversible. Êtes-vous sûr ?
          </p>

          <div className="flex justify-center gap-3">
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDeleteId) {
                  deleteMutation.mutate(confirmDeleteId)
                }
              }}
              loading={deleteMutation.isPending}
            >
              Supprimer
            </Button>

            <Button
              variant="outline-gold"
              onClick={() => setConfirmDeleteId(null)}
            >
              Annuler
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal aperçu rapide */}
      <Modal
        isOpen={!!quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        title={quickViewProduct?.nom || 'Détail produit'}
        size="md"
        accent="gold"
      >
        {quickViewProduct && (
          <div className="space-y-4">
            {quickViewProduct.images[0] && (
              <img
                src={quickViewProduct.images[0]}
                alt={quickViewProduct.nom}
                className="h-48 w-full rounded-xl object-cover"
              />
            )}

            <ProductBadges
              badgeIds={quickViewProduct.badges}
              size="sm"
            />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-neutral-500">Prix : </span>
                <PriceDisplay
                  pair={quickViewProduct.pricePair}
                  hasUsd={quickViewProduct.hasUsdSignal}
                />
              </div>

              <div>
                <span className="text-neutral-500">Stock : </span>
                {quickViewProduct.stock}
              </div>

              <div>
                <span className="text-neutral-500">Statut : </span>
                <Badge
                  variant={
                    quickViewProduct.active ? 'accent' : 'danger'
                  }
                  size="sm"
                >
                  {quickViewProduct.active ? 'Actif' : 'Inactif'}
                </Badge>
              </div>

              <div>
                <span className="text-neutral-500">Ventes : </span>
                {quickViewProduct.totalVentes}
              </div>

              {quickViewProduct.categorie && (
                <div className="col-span-2">
                  <span className="text-neutral-500">
                    Catégorie :{' '}
                  </span>
                  {quickViewProduct.categorie}
                </div>
              )}

              {quickViewProduct.sku && (
                <div className="col-span-2">
                  <span className="text-neutral-500">SKU : </span>
                  {quickViewProduct.sku}
                </div>
              )}

              <div className="col-span-2">
                <span className="text-neutral-500">
                  Valeur stock :{' '}
                </span>
                <StatPairText
                  pair={{
                    usd: round2(
                      quickViewProduct.pricePair.usd *
                        quickViewProduct.stock
                    ),
                    cdf: roundCdf(
                      quickViewProduct.pricePair.cdf *
                        quickViewProduct.stock
                    ),
                  }}
                  hasUsd={
                    quickViewProduct.hasUsdSignal || rateOk
                  }
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/admin/produits/${quickViewProduct.id}/modifier`}
              >
                <Button variant="luxe" size="sm">
                  <Pencil
                    size={14}
                    className="mr-1"
                    aria-hidden="true"
                  />
                  Modifier
                </Button>
              </Link>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => setQuickViewProduct(null)}
              >
                Fermer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal ajustement de prix */}
      <Modal
        isOpen={adjustPriceModal}
        onClose={() => {
          setAdjustPriceModal(false)
          setPreviewPrices([])
        }}
        title="Ajuster les prix"
        size="md"
        accent="gold"
      >
        <div className="space-y-4">
          <p className="text-sm">
            Appliquer un pourcentage à {selectedIds.size} produit(s)
            sélectionné(s).
          </p>

          {bulkPriceBlockedReason && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Certains produits sélectionnés n’ont pas de prix USD
              explicite et le taux USD/CDF est indisponible.
              L’ajustement ne peut pas être appliqué en toute
              sécurité.
            </div>
          )}

          <div className="flex items-end gap-2">
            <Input
              type="number"
              label="Pourcentage (%)"
              value={pricePercent}
              onChange={(e) => setPricePercent(e.target.value)}
              placeholder="10 pour +10%, -20 pour -20%"
            />

            <Button
              variant="outline-gold"
              onClick={handlePreviewPrice}
            >
              Prévisualiser
            </Button>
          </div>

          {previewPrices.length > 0 && (
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border p-2">
              {previewPrices.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate">{p.nom}</span>

                  <div className="text-right">
                    <p className="text-xs text-muted-foreground line-through">
                      {formatPairDisplay(p.ancienPair, true)}
                    </p>

                    <p className="font-bold text-gold-600">
                      {formatPairDisplay(p.nouveauPair, true)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="luxe"
              fullWidth
              onClick={applyBulkPrice}
              loading={bulkPriceMutation.isPending}
              disabled={
                !pricePercent ||
                !Number.isFinite(Number(pricePercent)) ||
                bulkPriceBlockedReason
              }
            >
              Appliquer
            </Button>

            <Button
              variant="outline"
              fullWidth
              onClick={() => {
                setAdjustPriceModal(false)
                setPreviewPrices([])
              }}
            >
              Annuler
            </Button>
          </div>

          {lastAjustementId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                undoPriceMutation.mutate(lastAjustementId)
              }
              loading={undoPriceMutation.isPending}
              className="w-full text-red-500"
              leftIcon={
                <RotateCcw
                  size={14}
                  className="mr-1"
                  aria-hidden="true"
                />
              }
            >
              Annuler le dernier ajustement
            </Button>
          )}
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </Container>
  )
}