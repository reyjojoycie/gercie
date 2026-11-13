// app/profile/commandes/page.tsx
'use client'

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion'

import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Key,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  XCircle,
  Zap,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useOrders } from '@/hooks/useOrders'
import { useToast } from '@/components/ui/Toast'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import {
  Card,
  CardContent,
} from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

interface MoneyPair {
  usd: number
  cdf: number
}

interface DisplayMoney {
  primaryCurrency: Currency
  primaryAmount: number
  secondaryCurrency: Currency
  secondaryAmount: number
}

interface NormalizedArticle {
  nom: string
  quantity: number
  specifications: string | null
  usdSource: number
  cdfSource: number
}

interface EnrichedArticle extends NormalizedArticle {
  unitPair: MoneyPair
  linePair: MoneyPair
}

interface NormalizedOrder {
  id: string
  numero: string
  statut: string
  date: string
  type_livraison: string

  articles: NormalizedArticle[]

  code_client?: string | null
  code_livreur?: string | null

  mode_attribution?: string | null
  livreur?: {
    nom?: string
    prenom?: string
  } | null

  total_usd?: number
  total_cdf?: number
  total_global?: number
  total?: number
  exchange_rate?: number
}

interface EnrichedOrder extends Omit<NormalizedOrder, 'articles'> {
  articles: EnrichedArticle[]
  totalPair: MoneyPair
  totalDisplay: DisplayMoney
  articleQuantity: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const REQUEST_LIMIT = 100
const PAGE_SIZE = 10

const STATUS_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  payee: 'Payée',
  conditionnement_premium: 'Conditionnement Premium',
  collecte: 'Collecte',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
  refusee: 'Refusée',
  rembourse: 'Remboursée',
  retour_demande: 'Retour demandé',
}

const STATUS_VARIANTS: Record<
  string,
  'gold' | 'accent' | 'warm' | 'danger' | 'neutral'
> = {
  en_attente: 'warm',
  payee: 'gold',
  conditionnement_premium: 'neutral',
  collecte: 'neutral',
  en_livraison: 'warm',
  livree: 'accent',
  annulee: 'danger',
  refusee: 'danger',
  rembourse: 'neutral',
  retour_demande: 'warm',
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'payee', label: 'Payées' },
  { value: 'conditionnement_premium', label: 'Conditionnement' },
  { value: 'collecte', label: 'Collecte' },
  { value: 'en_livraison', label: 'En livraison' },
  { value: 'livree', label: 'Livrées' },
  { value: 'annulee', label: 'Annulées' },
  { value: 'refusee', label: 'Refusées' },
  { value: 'rembourse', label: 'Remboursées' },
  { value: 'retour_demande', label: 'Retour demandé' },
]

const SORT_OPTIONS = [
  { value: 'created_at-desc', label: 'Plus récentes' },
  { value: 'created_at-asc', label: 'Plus anciennes' },
  { value: 'total-desc', label: 'Montant ↓' },
  { value: 'total-asc', label: 'Montant ↑' },
]

const CODE_VALID_STATUSES = new Set([
  'payee',
  'conditionnement_premium',
  'collecte',
  'en_livraison',
])

const CANCELLABLE_STATUSES = new Set([
  'en_attente',
  'payee',
  'collecte',
])

const RETURNABLE_STATUSES = new Set(['livree'])

const PAYABLE_STATUSES = new Set(['en_attente'])

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) ? n : undefined
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) && n > 0 ? n : null
}

function firstPositive(...values: unknown[]): number {
  for (const value of values) {
    const n = positiveNumber(value)

    if (n != null) return n
  }

  return 0
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
  if (!Number.isFinite(cdf) || cdf <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return round2(cdf / rate)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return roundCdf(usd * rate)
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'

  return `$${value.toFixed(2)}`
}

function formatCdf(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'

  return `${Math.round(value).toLocaleString('fr-FR')} FC`
}

function formatMoney(value: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

function formatPair(pair: MoneyPair): string {
  if (pair.usd > 0) {
    return pair.cdf > 0
      ? `${formatUsd(pair.usd)} ≈ ${formatCdf(pair.cdf)}`
      : formatUsd(pair.usd)
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
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function parseTimestamp(value?: string | null): number {
  const t = new Date(value || 0).getTime()
  return Number.isFinite(t) ? t : 0
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

/* ═══════════════════════════════════════════════════════════════ */
/*  USD / CDF RESOLUTION                                           */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Règle absolue :
 * - Si USD existe → USD = vérité.
 *   CDF = USD × taux courant.
 *   Le CDF stocké n’est conservé que comme fallback temporaire si le taux n’est pas disponible.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux courant.
 *
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number,
  cdfSource: number,
  rate: number | null
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let usd = usdSource > 0 ? round2(usdSource) : 0
  let cdf = cdfSource > 0 ? roundCdf(cdfSource) : 0

  if (usd > 0) {
    cdf = rateOk ? roundCdf(toCdf(usd, rateNum)) : cdf
  } else if (cdf > 0 && rateOk) {
    usd = round2(toUsd(cdf, rateNum))
  }

  return {
    usd: round2(usd),
    cdf: roundCdf(cdf),
  }
}

function selectDisplay(
  pair: MoneyPair,
  preferredCurrency: Currency
): DisplayMoney {
  const otherCurrency: Currency =
    preferredCurrency === 'USD' ? 'CDF' : 'USD'

  let primaryCurrency = preferredCurrency
  let primaryAmount =
    preferredCurrency === 'USD' ? pair.usd : pair.cdf

  let secondaryCurrency = otherCurrency
  let secondaryAmount =
    otherCurrency === 'USD' ? pair.usd : pair.cdf

  if (primaryAmount <= 0 && secondaryAmount > 0) {
    primaryCurrency = otherCurrency
    primaryAmount = secondaryAmount

    secondaryCurrency = preferredCurrency
    secondaryAmount =
      preferredCurrency === 'USD' ? pair.usd : pair.cdf
  }

  return {
    primaryCurrency,
    primaryAmount:
      primaryCurrency === 'USD'
        ? round2(primaryAmount)
        : roundCdf(primaryAmount),
    secondaryCurrency,
    secondaryAmount:
      secondaryCurrency === 'USD'
        ? round2(secondaryAmount)
        : roundCdf(secondaryAmount),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATUS / DELIVERY HELPERS                                      */
/* ═══════════════════════════════════════════════════════════════ */

function getStatutLabel(statut: string): string {
  return STATUS_LABELS[statut] || statut
}

function getStatutVariant(
  statut: string
): 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' {
  return STATUS_VARIANTS[statut] || 'neutral'
}

function normalizeDeliveryMode(
  value: any
): 'domicile' | 'point_retrait' | 'express' {
  const raw = String(value || '').trim()

  if (raw === 'point_retrait' || raw === 'pickup' || raw === 'relais') {
    return 'point_retrait'
  }

  if (raw === 'express' || raw === 'same_day' || raw === 'jour_meme') {
    return 'express'
  }

  return 'domicile'
}

function getDeliveryLabel(mode: string): string {
  const normalized = normalizeDeliveryMode(mode)

  if (normalized === 'point_retrait') return 'Point relais'
  if (normalized === 'express') return 'Express'

  return 'Domicile'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT / ARTICLE NORMALIZATION                                */
/* ═══════════════════════════════════════════════════════════════ */

function variantLabelFromAttributes(attrs: any): string | null {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    return null
  }

  const entries = Object.entries(attrs).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false

    return String(value).trim() !== ''
  })

  if (entries.length === 0) return null

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  return entries.map(([, value]) => String(value)).join(' • ')
}

function normalizeArticle(raw: any): NormalizedArticle {
  const attrs =
    raw?.variant_attributes ??
    raw?.variante ??
    raw?.attributes

  return {
    nom: String(
      raw?.nom ||
        raw?.produit?.nom ||
        raw?.products?.nom ||
        raw?.product?.nom ||
        'Produit'
    ),

    quantity: Math.max(
      1,
      Math.floor(Number(raw?.quantite ?? raw?.quantity ?? 1) || 1)
    ),

    specifications:
      raw?.specifications ||
      variantLabelFromAttributes(attrs) ||
      (typeof raw?.variante === 'string' ? raw.variante : null) ||
      null,

    usdSource: firstPositive(
      raw?.prix_unitaire_usd,
      raw?.unit_price_usd,
      raw?.prix_usd,
      raw?.price_usd
    ),

    cdfSource: firstPositive(
      raw?.prix_unitaire,
      raw?.prix_cdf,
      raw?.price_cdf,
      raw?.price
    ),
  }
}

function normalizeOrder(raw: any): NormalizedOrder {
  const articlesSource = Array.isArray(raw?.articles)
    ? raw.articles
    : Array.isArray(raw?.commande_articles)
      ? raw.commande_articles
      : []

  return {
    id: String(raw?.id || ''),

    numero: String(
      raw?.numero ||
        raw?.numero_commande ||
        String(raw?.id || '').slice(0, 8)
    ),

    statut: String(
      raw?.statut || raw?.status || 'en_attente'
    ).toLowerCase(),

    date:
      raw?.date ||
      raw?.created_at ||
      new Date().toISOString(),

    type_livraison: normalizeDeliveryMode(
      raw?.type_livraison || raw?.shipping_method
    ),

    articles: articlesSource.map(normalizeArticle),

    code_client:
      raw?.code_client ||
      raw?.client_code ||
      null,

    code_livreur:
      raw?.code_livreur ||
      raw?.driver_code ||
      null,

    mode_attribution:
      raw?.mode_attribution ?? null,

    livreur: raw?.livreur
      ? {
          nom: String(raw.livreur.nom || ''),
          prenom: String(raw.livreur.prenom || ''),
        }
      : null,

    total_usd: optionalNumber(
      raw?.total_usd ?? raw?.totalUSD
    ),

    total_cdf: optionalNumber(
      raw?.total_cdf ??
        raw?.totalCDF ??
        raw?.total_global ??
        raw?.total
    ),

    total_global: optionalNumber(
      raw?.total_global ?? raw?.total
    ),

    total: optionalNumber(raw?.total),

    exchange_rate: optionalNumber(
      raw?.exchange_rate ?? raw?.shipping_rate_used
    ),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DEBOUNCE HOOK                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [delay, value])

  return debounced
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function MesCommandes() {
  const router = useRouter()

  const toast = useToast() as any

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const { user, loading: authLoading } = useAuth()

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

  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState('created_at-desc')
  const [currentPage, setCurrentPage] = useState(1)

  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(
    new Set()
  )

  const [actionLoading, setActionLoading] = useState<string | null>(
    null
  )

  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(
    new Set()
  )

  const [showSecondary, setShowSecondary] = useState(true)

  const revealTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map())

  useEffect(() => {
    return () => {
      revealTimersRef.current.forEach((timer) => clearTimeout(timer))
      revealTimersRef.current.clear()
    }
  }, [])

  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  const filters = useMemo(
    () => ({
      statut: activeFilter === 'all' ? undefined : activeFilter,
      search: debouncedSearch.trim() || undefined,
      page: 1,
      pageSize: REQUEST_LIMIT,
    }),
    [activeFilter, debouncedSearch]
  )

  const {
    data: orders = [],
    isLoading: loadingOrders,
    error: ordersError,
    refetch,
    isFetching,
  } = useOrders(filters)

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/profile/commandes')}`
      )
    }
  }, [authLoading, router, user])

  const normalizedOrders = useMemo<NormalizedOrder[]>(() => {
    return (Array.isArray(orders) ? orders : []).map(normalizeOrder)
  }, [orders])

  const enrichedOrders = useMemo<EnrichedOrder[]>(() => {
    return normalizedOrders.map((order) => {
      const articles = order.articles.map((article) => {
        const unitPair = resolvePricePair(
          article.usdSource,
          article.cdfSource,
          effectiveRate
        )

        const linePair: MoneyPair = {
          usd: round2(unitPair.usd * article.quantity),
          cdf: roundCdf(unitPair.cdf * article.quantity),
        }

        return {
          ...article,
          unitPair,
          linePair,
        }
      })

      const computedUsd = round2(
        articles.reduce((acc, article) => acc + article.linePair.usd, 0)
      )

      const computedCdfFallback = roundCdf(
        articles.reduce((acc, article) => acc + article.linePair.cdf, 0)
      )

      const orderUsd = firstPositive(order.total_usd)

      const orderCdf = firstPositive(
        order.total_cdf,
        order.total_global,
        order.total
      )

      const totalPair = resolvePricePair(
        orderUsd > 0 ? orderUsd : computedUsd,
        orderCdf > 0 ? orderCdf : computedCdfFallback,
        effectiveRate
      )

      const totalDisplay = selectDisplay(totalPair, 'USD')

      const articleQuantity = articles.reduce(
        (acc, article) => acc + article.quantity,
        0
      )

      return {
        ...order,
        articles,
        totalPair,
        totalDisplay,
        articleQuantity,
      }
    })
  }, [effectiveRate, normalizedOrders])

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return enrichedOrders.filter((order) => {
      if (activeFilter !== 'all' && order.statut !== activeFilter) {
        return false
      }

      if (
        q &&
        !order.numero.toLowerCase().includes(q) &&
        !order.id.toLowerCase().includes(q)
      ) {
        return false
      }

      return true
    })
  }, [activeFilter, enrichedOrders, searchQuery])

  const sortedOrders = useMemo(() => {
    const arr = [...filteredOrders]

    if (sortKey === 'created_at-desc') {
      arr.sort(
        (a, b) => parseTimestamp(b.date) - parseTimestamp(a.date)
      )
    } else if (sortKey === 'created_at-asc') {
      arr.sort(
        (a, b) => parseTimestamp(a.date) - parseTimestamp(b.date)
      )
    } else if (sortKey === 'total-desc') {
      arr.sort((a, b) => {
        const usdDiff = b.totalPair.usd - a.totalPair.usd

        if (usdDiff !== 0) return usdDiff

        return b.totalPair.cdf - a.totalPair.cdf
      })
    } else if (sortKey === 'total-asc') {
      arr.sort((a, b) => {
        const usdDiff = a.totalPair.usd - b.totalPair.usd

        if (usdDiff !== 0) return usdDiff

        return a.totalPair.cdf - b.totalPair.cdf
      })
    }

    return arr
  }, [filteredOrders, sortKey])

  const totalPages = Math.max(
    1,
    Math.ceil(sortedOrders.length / PAGE_SIZE)
  )

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [currentPage, totalPages])

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return sortedOrders.slice(start, start + PAGE_SIZE)
  }, [currentPage, sortedOrders])

  const hasCdfOnly = useMemo(() => {
    return enrichedOrders.some(
      (order) => order.totalPair.usd <= 0 && order.totalPair.cdf > 0
    )
  }, [enrichedOrders])

  const hasCodeReminder = useMemo(() => {
    return enrichedOrders.some(
      (order) =>
        order.code_client &&
        CODE_VALID_STATUSES.has(order.statut)
    )
  }, [enrichedOrders])

  const toggleExpand = useCallback((orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev)

      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)

      return next
    })
  }, [])

  const handleRevealCode = useCallback((orderId: string) => {
    const existing = revealTimersRef.current.get(orderId)

    if (existing) {
      clearTimeout(existing)
    }

    setRevealedCodes((prev) => new Set(prev).add(orderId))

    const timer = setTimeout(() => {
      setRevealedCodes((prev) => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })

      revealTimersRef.current.delete(orderId)
    }, 10_000)

    revealTimersRef.current.set(orderId, timer)
  }, [])

  const handleCancel = useCallback(
    async (order: EnrichedOrder) => {
      if (
        !window.confirm(
          `Êtes-vous sûr de vouloir annuler la commande #${order.numero} ?`
        )
      ) {
        return
      }

      setActionLoading(order.id)

      try {
        const res = await fetch(
          `/api/commandes/${order.id}/cancel`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          }
        )

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(
            data?.error || 'Échec de l’annulation.'
          )
        }

        addToast({
          type: 'success',
          message: `Commande #${order.numero} annulée`,
        })

        refetch?.()
      } catch (err: any) {
        addToast({
          type: 'error',
          message:
            err?.message || 'Échec de l’annulation.',
        })
      } finally {
        setActionLoading(null)
      }
    },
    [addToast, refetch]
  )

  const handleReturn = useCallback(
    async (order: EnrichedOrder) => {
      if (
        !window.confirm(
          `Voulez-vous demander un retour pour la commande #${order.numero} ?`
        )
      ) {
        return
      }

      setActionLoading(order.id)

      try {
        const res = await fetch('/api/retours', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            commande_id: order.id,
          }),
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(
            data?.error ||
              'Échec de la demande de retour.'
          )
        }

        addToast({
          type: 'success',
          message: `Demande de retour envoyée pour #${order.numero}.`,
        })

        refetch?.()
      } catch (err: any) {
        addToast({
          type: 'error',
          message:
            err?.message ||
            'Échec de la demande de retour.',
        })
      } finally {
        setActionLoading(null)
      }
    },
    [addToast, refetch]
  )

  const handleDownloadInvoice = useCallback(
    (order: EnrichedOrder) => {
      if (typeof window === 'undefined') return

      try {
        const articleLines = order.articles.map((article) => {
          const spec = article.specifications
            ? ` (${article.specifications})`
            : ''

          return `${article.quantity} × ${article.nom}${spec} — ${formatPair(
            article.linePair
          )}`
        })

        const content = [
          'GERCIE — RÉCAPULATIF DE COMMANDE',
          '=================================',
          `Commande : ${order.numero}`,
          `Date : ${formatDate(order.date)}`,
          `Statut : ${getStatutLabel(order.statut)}`,
          `Livraison : ${getDeliveryLabel(order.type_livraison)}`,
          '',
          'ARTICLES',
          '--------',
          ...articleLines,
          '',
          'TOTAUX',
          '------',
          `Total : ${formatPair(order.totalPair)}`,
          effectiveRate
            ? `Taux utilisé : 1 USD ≈ ${formatCdf(
                Number(effectiveRate)
              )}`
            : 'Taux indisponible au moment de l’export',
          '',
          'Merci pour votre confiance !',
        ]
          .filter(Boolean)
          .join('\n')

        const blob = new Blob([content], {
          type: 'text/plain;charset=utf-8',
        })

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')

        a.href = url
        a.download = `facture-${order.numero}.txt`

        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

        URL.revokeObjectURL(url)

        addToast({
          type: 'success',
          message: 'Facture téléchargée.',
        })
      } catch {
        addToast({
          type: 'error',
          message: 'Impossible de générer la facture.',
        })
      }
    },
    [addToast, effectiveRate]
  )

  const handleTrackOrder = useCallback(
    (orderId: string) => {
      router.push(`/commande/confirmation?id=${orderId}`)
    },
    [router]
  )

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2
          size={48}
          className="animate-spin text-gold-500"
          aria-hidden="true"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <Container className="max-w-6xl py-8">
        <motion.div
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: 20 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          {/* En-tête */}
          <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Link
                  href="/profile"
                  className="text-muted-foreground transition hover:text-gold-500"
                  aria-label="Retour au profil"
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </Link>

                <h1 className="font-serif text-3xl font-bold text-foreground">
                  Mes commandes
                </h1>
              </div>

              <p className="text-muted-foreground">
                Suivez l’état de vos achats • {sortedOrders.length}{' '}
                commande{sortedOrders.length > 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Tooltip
                content={
                  showSecondary
                    ? 'Masquer le prix secondaire'
                    : 'Afficher le prix secondaire'
                }
              >
                <button
                  type="button"
                  onClick={() => setShowSecondary((v) => !v)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                  aria-label="Basculer prix secondaire"
                >
                  {showSecondary ? (
                    <Eye size={16} aria-hidden="true" />
                  ) : (
                    <EyeOff size={16} aria-hidden="true" />
                  )}
                </button>
              </Tooltip>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => refetch?.()}
                loading={loadingOrders || isFetching}
                leftIcon={
                  <RefreshCw
                    size={14}
                    aria-hidden="true"
                  />
                }
              >
                Actualiser
              </Button>

              <Link
                href="/"
                className="flex items-center gap-1 text-sm text-gold-600 transition hover:underline"
              >
                <span>Continuer mes achats</span>
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                />
              </Link>
            </div>
          </div>

          {/* Rappel code client */}
          {hasCodeReminder && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-gold-400/20 bg-gold-500/5 p-3 text-xs text-gold-700 dark:text-gold-300">
              <ShieldCheck
                size={16}
                className="shrink-0"
                aria-hidden="true"
              />

              <span>
                Vos commandes comportent un{' '}
                <strong>code secret de validation</strong> à
                communiquer au livreur lors de la remise.
              </span>
            </div>
          )}

          {/* Alerte taux */}
          {rateLoading && !rateOk && hasCdfOnly && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
              <RefreshCw
                size={18}
                className="mt-0.5 shrink-0 animate-spin"
                aria-hidden="true"
              />

              <p>
                Chargement du taux USD/CDF. Certains montants peuvent
                encore être affichés en CDF en attendant la conversion
                officielle.
              </p>
            </div>
          )}

          {/* Recherche + tri */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Input
                leftIcon={
                  <Search
                    size={18}
                    className="text-muted-foreground"
                    aria-hidden="true"
                  />
                }
                placeholder="Rechercher par numéro de commande..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                allowClear
                onClear={() => {
                  setSearchQuery('')
                  setCurrentPage(1)
                }}
                variant="glass"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sortKey}
                onChange={(e) => {
                  setSortKey(e.target.value)
                  setCurrentPage(1)
                }}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label="Trier les commandes"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filtres statut */}
          <div className="scrollbar-hide mb-8 flex flex-wrap gap-2 overflow-x-auto">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setActiveFilter(filter.value)
                  setCurrentPage(1)
                }}
                className={cn(
                  'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition',
                  activeFilter === filter.value
                    ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                    : 'border border-border bg-card text-foreground hover:border-gold-400'
                )}
                aria-pressed={activeFilter === filter.value}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Erreur */}
          {ordersError && (
            <motion.div
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: -10 }
              }
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
            >
              <AlertTriangle
                size={18}
                aria-hidden="true"
              />

              {ordersError instanceof Error
                ? ordersError.message
                : 'Erreur inconnue'}

              <button
                type="button"
                onClick={() => refetch?.()}
                className="ml-auto underline"
              >
                Réessayer
              </button>
            </motion.div>
          )}

          {/* Chargement */}
          {loadingOrders ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-card p-5 shadow-card"
                >
                  <div className="mb-4 flex justify-between">
                    <Skeleton
                      variant="text"
                      className="h-6 w-48"
                      shimmer
                      shimmerVariant="gold"
                    />
                    <Skeleton
                      variant="rounded"
                      className="h-6 w-24 rounded-full"
                      shimmer
                      shimmerVariant="gold"
                    />
                  </div>

                  <Skeleton
                    variant="text"
                    className="mb-2 h-4 w-2/3"
                    shimmer
                    shimmerVariant="gold"
                  />

                  <div className="flex justify-between border-t border-border pt-4">
                    <Skeleton
                      variant="text"
                      className="h-6 w-32"
                      shimmer
                      shimmerVariant="gold"
                    />
                    <Skeleton
                      variant="rounded"
                      className="h-8 w-24 rounded-xl"
                      shimmer
                      shimmerVariant="gold"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : paginatedOrders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <EmptyState
                icon={
                  <Package
                    size={64}
                    className="text-gold-400"
                    aria-hidden="true"
                  />
                }
                title={
                  activeFilter === 'all'
                    ? 'Aucune commande'
                    : `Aucune commande ${getStatutLabel(
                        activeFilter
                      ).toLowerCase()}`
                }
                description={
                  activeFilter === 'all'
                    ? 'Vous n’avez pas encore passé de commande.'
                    : 'Vous n’avez aucune commande avec ce statut.'
                }
                actionLabel="Découvrir nos produits"
                onAction={() => router.push('/')}
              />
            </motion.div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {paginatedOrders.map((order, idx) => {
                  const statutVariant = getStatutVariant(
                    order.statut
                  )
                  const statutLabel = getStatutLabel(
                    order.statut
                  )

                  const isExpanded = expandedOrders.has(order.id)
                  const isActionLoading =
                    actionLoading === order.id

                  const canShowCode =
                    !!order.code_client &&
                    CODE_VALID_STATUSES.has(order.statut)

                  const isCodeRevealed = revealedCodes.has(
                    order.id
                  )

                  const isCancellable = CANCELLABLE_STATUSES.has(
                    order.statut
                  )

                  const isReturnable = RETURNABLE_STATUSES.has(
                    order.statut
                  )

                  const isPayable = PAYABLE_STATUSES.has(
                    order.statut
                  )

                  const deliveryMode = normalizeDeliveryMode(
                    order.type_livraison
                  )

                  const deliveryLabel = getDeliveryLabel(
                    order.type_livraison
                  )

                  const DeliveryIcon =
                    deliveryMode === 'point_retrait'
                      ? MapPin
                      : deliveryMode === 'express'
                        ? Zap
                        : Truck

                  const showTotalSecondary =
                    showSecondary &&
                    order.totalDisplay.secondaryAmount > 0 &&
                    order.totalDisplay.secondaryAmount !==
                      order.totalDisplay.primaryAmount

                  return (
                    <motion.div
                      key={order.id}
                      initial={
                        prefersReducedMotion
                          ? false
                          : { opacity: 0, y: 20 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{
                        delay: prefersReducedMotion
                          ? 0
                          : idx * 0.03,
                      }}
                    >
                      <Card className="overflow-hidden border-border bg-card/70 backdrop-blur-sm transition-all duration-300 hover:shadow-card-hover">
                        <CardContent className="p-5 sm:p-6">
                          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-lg font-bold text-foreground">
                                <Link
                                  href={`/commande/confirmation?id=${order.id}`}
                                  className="truncate transition hover:text-gold-500"
                                >
                                  Commande #{order.numero}
                                </Link>

                                <Tooltip content="Détails de la commande">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleExpand(order.id)
                                    }
                                    className="flex items-center text-muted-foreground transition hover:text-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                                    aria-label={
                                      isExpanded
                                        ? 'Réduire la commande'
                                        : 'Étendre la commande'
                                    }
                                  >
                                    {isExpanded ? (
                                      <ChevronUp
                                        size={18}
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <ChevronDown
                                        size={18}
                                        aria-hidden="true"
                                      />
                                    )}
                                  </button>
                                </Tooltip>
                              </div>

                              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar
                                  size={14}
                                  aria-hidden="true"
                                />
                                {formatDate(order.date)}
                              </p>
                            </div>

                            <Badge
                              variant={statutVariant}
                              size="sm"
                              className="shrink-0"
                            >
                              {statutLabel}
                            </Badge>
                          </div>

                          {/* Livraison + code */}
                          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                            <DeliveryIcon
                              size={14}
                              className="text-gold-500"
                              aria-hidden="true"
                            />

                            <span>{deliveryLabel}</span>

                            {canShowCode && (
                              <span className="ml-auto flex items-center gap-1 text-xs">
                                <Key
                                  size={12}
                                  className="text-gold-500"
                                  aria-hidden="true"
                                />

                                {isCodeRevealed ? (
                                  <span className="font-mono font-bold text-gold-600">
                                    {order.code_client}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRevealCode(order.id)
                                    }
                                    className="font-medium text-gold-500 underline transition hover:text-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                                  >
                                    Voir le code
                                  </button>
                                )}
                              </span>
                            )}
                          </div>

                          {/* Détails expansibles */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{
                                  height: 'auto',
                                  opacity: 1,
                                }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mb-4 border-t border-border pt-4">
                                  <ul className="space-y-2">
                                    {order.articles.map(
                                      (article, articleIdx) => {
                                        const lineDisplay =
                                          selectDisplay(
                                            article.linePair,
                                            'USD'
                                          )

                                        const showLineSecondary =
                                          showSecondary &&
                                          lineDisplay.secondaryAmount >
                                            0 &&
                                          lineDisplay.secondaryAmount !==
                                            lineDisplay.primaryAmount

                                        return (
                                          <li
                                            key={`${article.nom}-${articleIdx}`}
                                            className="flex items-start justify-between gap-3 text-sm"
                                          >
                                            <span className="min-w-0 flex-1 text-foreground">
                                              {article.nom}{' '}
                                              <span className="text-muted-foreground">
                                                x {article.quantity}
                                              </span>

                                              {article.specifications && (
                                                <span className="block text-xs text-muted-foreground">
                                                  {
                                                    article.specifications
                                                  }
                                                </span>
                                              )}
                                            </span>

                                            <span className="shrink-0 text-right font-medium text-foreground">
                                              {formatMoney(
                                                lineDisplay.primaryAmount,
                                                lineDisplay.primaryCurrency
                                              )}

                                              {showLineSecondary && (
                                                <span className="block text-[11px] text-muted-foreground">
                                                  ≈{' '}
                                                  {formatMoney(
                                                    lineDisplay.secondaryAmount,
                                                    lineDisplay.secondaryCurrency
                                                  )}
                                                </span>
                                              )}
                                            </span>
                                          </li>
                                        )
                                      }
                                    )}
                                  </ul>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Actions + total */}
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <div>
                              <p className="text-xl font-bold text-foreground">
                                {formatMoney(
                                  order.totalDisplay.primaryAmount,
                                  order.totalDisplay.primaryCurrency
                                )}
                              </p>

                              {showTotalSecondary && (
                                <p className="text-xs text-muted-foreground">
                                  ≈{' '}
                                  {formatMoney(
                                    order.totalDisplay.secondaryAmount,
                                    order.totalDisplay.secondaryCurrency
                                  )}
                                </p>
                              )}

                              <p className="mt-1 text-xs text-muted-foreground">
                                {order.articleQuantity} article
                                {order.articleQuantity > 1
                                  ? 's'
                                  : ''}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {isPayable && (
                                <Link
                                  href={`/commande/paiement?id=${order.id}&currency=USD`}
                                >
                                  <Button
                                    variant="luxe"
                                    size="sm"
                                    leftIcon={
                                      <CreditCard
                                        size={14}
                                        aria-hidden="true"
                                      />
                                    }
                                  >
                                    Payer
                                  </Button>
                                </Link>
                              )}

                              {isCancellable && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                                  onClick={() =>
                                    handleCancel(order)
                                  }
                                  loading={isActionLoading}
                                  leftIcon={
                                    <XCircle
                                      size={14}
                                      aria-hidden="true"
                                    />
                                  }
                                >
                                  Annuler
                                </Button>
                              )}

                              {isReturnable && (
                                <Button
                                  variant="outline-gold"
                                  size="sm"
                                  onClick={() =>
                                    handleReturn(order)
                                  }
                                  loading={isActionLoading}
                                  leftIcon={
                                    <RefreshCw
                                      size={14}
                                      aria-hidden="true"
                                    />
                                  }
                                >
                                  Retour
                                </Button>
                              )}

                              <Tooltip content="Suivre la commande">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleTrackOrder(order.id)
                                  }
                                  leftIcon={
                                    <ExternalLink
                                      size={14}
                                      aria-hidden="true"
                                    />
                                  }
                                >
                                  Suivi
                                </Button>
                              </Tooltip>

                              <Tooltip content="Télécharger la facture">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleDownloadInvoice(order)
                                  }
                                  leftIcon={
                                    <FileText
                                      size={14}
                                      aria-hidden="true"
                                    />
                                  }
                                >
                                  Facture
                                </Button>
                              </Tooltip>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.max(1, p - 1))
                }
                disabled={currentPage === 1}
                leftIcon={
                  <ChevronLeft
                    size={16}
                    aria-hidden="true"
                  />
                }
              >
                Précédent
              </Button>

              <span className="text-sm text-muted-foreground">
                Page {currentPage} / {totalPages}
              </span>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(totalPages, p + 1)
                  )
                }
                disabled={currentPage === totalPages}
                rightIcon={
                  <ChevronRight
                    size={16}
                    aria-hidden="true"
                  />
                }
              >
                Suivant
              </Button>
            </div>
          )}
        </motion.div>
      </Container>
    </div>
  )
}