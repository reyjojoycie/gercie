// app/admin/promotions/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useRouter } from 'next/navigation'

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useDebounce } from '@/hooks/useDebounce'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'

import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  Gift,
  Info,
  Layers,
  LayoutGrid,
  List,
  MoreHorizontal,
  Percent,
  Power,
  PowerOff,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Tag,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'

import { format, isAfter, isBefore, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface MoneyPair {
  usd: number
  cdf: number | null
  cdfKnown: boolean
  source:
    | 'USD'
    | 'CDF_CONVERTED'
    | 'CDF_LEGACY'
    | 'NONE'
}

type PromoType =
  | 'prix_fixe'
  | 'pourcentage'
  | 'flash'
  | 'lot_degressif'
  | 'cadeau'

interface RawPromotion {
  id: string
  produit_id: string | null
  produit_nom?: string
  produit_prix?: number | string | null
  produit_prix_usd?: number | string | null
  produit_prix_cdf?: number | string | null
  produit_image?: string

  type_promo: PromoType
  prix_promo?: number | string | null
  prix_promo_usd?: number | string | null
  prix_promo_cdf?: number | string | null
  valeur_pourcentage?: number | string | null

  description?: string
  date_debut: string
  date_fin: string
  actif: boolean
  created_at?: string
  quantite_min?: number | string | null
  cumulable?: boolean
  banniere_url?: string
  produit_cadeau_id?: string | null
  categorie_id?: string | null
}

interface NormalizedPromotion extends RawPromotion {
  promoPricePair: MoneyPair
  originalPricePair: MoneyPair
  finalPricePair: MoneyPair
  hasUsdSignal: boolean
}

interface RawProduit {
  id: string
  nom: string
  prix?: number | string | null
  prix_usd?: number | string | null
  prix_cdf?: number | string | null
  images?: string[]
}

interface NormalizedProduit {
  id: string
  nom: string
  pricePair: MoneyPair
  images: string[]
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const TYPE_OPTIONS: {
  value: PromoType
  label: string
  icon: React.ReactNode
}[] = [
  { value: 'prix_fixe', label: 'Prix fixe', icon: <Tag size={14} aria-hidden="true" /> },
  { value: 'pourcentage', label: '% Réduction', icon: <Percent size={14} aria-hidden="true" /> },
  { value: 'flash', label: 'Offre flash', icon: <Zap size={14} aria-hidden="true" /> },
  { value: 'lot_degressif', label: 'Lot dégressif', icon: <Layers size={14} aria-hidden="true" /> },
  { value: 'cadeau', label: 'Cadeau offert', icon: <Gift size={14} aria-hidden="true" /> },
]

const PER_PAGE = 10

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

function explicitUsd(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return round2(n)
    }
  }

  return null
}

function explicitCdf(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return roundCdf(n)
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
 *   CDF = USD × taux serveur.
 *   Si USD = 0, CDF = 0 même sans taux.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux serveur.
 *
 * - Si CDF seul et taux indisponible → lecture tolérée en fallback.
 *
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number | null,
  cdfSource: number | null,
  rate: number | null
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (usdSource != null) {
    const usd = round2(usdSource)

    if (usd === 0) {
      return {
        usd: 0,
        cdf: 0,
        cdfKnown: true,
        source: 'USD',
      }
    }

    if (rateOk) {
      return {
        usd,
        cdf: roundCdf(toCdf(usd, rateNum)),
        cdfKnown: true,
        source: 'USD',
      }
    }

    return {
      usd,
      cdf: cdfSource != null ? roundCdf(cdfSource) : null,
      cdfKnown: cdfSource != null,
      source: 'USD',
    }
  }

  if (cdfSource != null && rateOk) {
    const usd = round2(toUsd(cdfSource, rateNum))

    return {
      usd,
      cdf: roundCdf(toCdf(usd, rateNum)),
      cdfKnown: true,
      source: 'CDF_CONVERTED',
    }
  }

  if (cdfSource != null) {
    return {
      usd: 0,
      cdf: roundCdf(cdfSource),
      cdfKnown: true,
      source: 'CDF_LEGACY',
    }
  }

  return {
    usd: 0,
    cdf: null,
    cdfKnown: false,
    source: 'NONE',
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FORMAT HELPERS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'

  return `$${round2(value).toFixed(2)}`
}

function formatCdf(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'

  return `${Math.round(value).toLocaleString('fr-FR')} FC`
}

function formatMoneyPair(pair: MoneyPair): string {
  if (pair.source === 'NONE') return '—'

  if (pair.usd > 0 || (pair.source === 'USD' && pair.usd === 0)) {
    const main = formatUsd(pair.usd)

    if (pair.cdf != null && pair.cdf > 0) {
      return `${main} ≈ ${formatCdf(pair.cdf)}`
    }

    return main
  }

  if (pair.cdf != null && pair.cdf > 0) {
    return formatCdf(pair.cdf)
  }

  return '—'
}

function moneyPairWarning(pair: MoneyPair): string | null {
  if (pair.source === 'CDF_LEGACY') {
    return 'CDF legacy · taux indisponible'
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeProduit(
  raw: RawProduit,
  rate: number | null
): NormalizedProduit {
  const usdSource = explicitUsd(
    raw.prix_usd,
    raw.prix
  )

  const cdfSource = explicitCdf(
    raw.prix_cdf,
    raw.prix
  )

  const pricePair = resolvePricePair(
    usdSource != null && usdSource > 0 ? usdSource : null,
    cdfSource,
    rate
  )

  return {
    id: String(raw.id ?? ''),
    nom: String(raw.nom ?? 'Produit'),
    pricePair,
    images: Array.isArray(raw.images) ? raw.images : [],
  }
}

function normalizePromotion(
  raw: RawPromotion,
  rate: number | null
): NormalizedPromotion {
  const promoUsdSource = explicitUsd(
    raw.prix_promo_usd
  )

  const promoCdfSource = explicitCdf(
    raw.prix_promo_cdf,
    raw.prix_promo
  )

  const promoPricePair = resolvePricePair(
    promoUsdSource,
    promoCdfSource,
    rate
  )

  const originalUsdSource = explicitUsd(
    raw.produit_prix_usd
  )

  const originalCdfSource = explicitCdf(
    raw.produit_prix_cdf,
    raw.produit_prix
  )

  const originalPricePair = resolvePricePair(
    originalUsdSource,
    originalCdfSource,
    rate
  )

  /**
   * Prix final :
   * - si type = pourcentage → original_usd × (1 - pct/100)
   * - si type = prix_fixe / flash / lot_degressif → promo_usd
   * - si type = cadeau → 0
   */
  let finalPricePair: MoneyPair

  if (raw.type_promo === 'cadeau') {
    finalPricePair = {
      usd: 0,
      cdf: 0,
      cdfKnown: true,
      source: 'USD',
    }
  } else if (raw.type_promo === 'pourcentage') {
    const pct = Number(raw.valeur_pourcentage ?? 0)

    if (originalPricePair.usd > 0 && pct > 0) {
      const finalUsd = round2(
        originalPricePair.usd * (1 - pct / 100)
      )

      finalPricePair = resolvePricePair(
        finalUsd,
        null,
        rate
      )
    } else {
      finalPricePair = promoPricePair
    }
  } else {
    finalPricePair = promoPricePair
  }

  const hasUsdSignal =
    promoUsdSource != null ||
    originalUsdSource != null

  return {
    ...raw,
    promoPricePair,
    originalPricePair,
    finalPricePair,
    hasUsdSignal,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATUS HELPERS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function isExpired(promo: RawPromotion): boolean {
  if (!promo.date_fin) return false

  return new Date(promo.date_fin) < new Date()
}

function getPromoStatus(
  promo: RawPromotion
): 'actif' | 'inactif' | 'expire' {
  if (!promo.actif) return 'inactif'
  if (isExpired(promo)) return 'expire'

  return 'actif'
}

function getStatusLabel(
  status: ReturnType<typeof getPromoStatus>
): string {
  switch (status) {
    case 'actif':
      return 'Active'
    case 'inactif':
      return 'Inactive'
    case 'expire':
      return 'Expirée'
    default:
      return 'Inconnue'
  }
}

function getStatusBadgeVariant(
  status: ReturnType<typeof getPromoStatus>
): 'accent' | 'neutral' | 'danger' {
  switch (status) {
    case 'actif':
      return 'accent'
    case 'inactif':
      return 'danger'
    case 'expire':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'

  try {
    const date = parseISO(value)

    if (Number.isNaN(date.getTime())) return '—'

    return format(date, 'dd/MM/yyyy HH:mm', { locale: fr })
  } catch {
    return '—'
  }
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return ''

  try {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return ''

    const localDate = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000
    )

    return localDate.toISOString().slice(0, 16)
  } catch {
    return ''
  }
}

function escapeCsv(value: any): string {
  const s = value == null ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function MoneyCell({
  pair,
  align = 'left',
  showWarning = true,
}: {
  pair: MoneyPair
  align?: 'left' | 'right'
  showWarning?: boolean
}) {
  const text = formatMoneyPair(pair)
  const warning = showWarning ? moneyPairWarning(pair) : null

  return (
    <div className={cn(align === 'right' ? 'text-right' : 'text-left')}>
      <p
        className={cn(
          'font-medium',
          pair.source === 'USD' || pair.source === 'CDF_CONVERTED'
            ? 'text-amber-600'
            : pair.source === 'CDF_LEGACY'
              ? 'text-amber-600'
              : 'text-muted-foreground'
        )}
      >
        {text}
      </p>

      {warning && (
        <p className="text-[11px] text-amber-600">{warning}</p>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  tone?: 'default' | 'amber' | 'green' | 'red'
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div
        className={cn(
          'rounded-lg p-2',
          tone === 'amber'
            ? 'bg-amber-500/10 text-amber-600'
            : tone === 'green'
              ? 'bg-green-500/10 text-green-600'
              : tone === 'red'
                ? 'bg-red-500/10 text-red-500'
                : 'bg-muted text-muted-foreground'
        )}
      >
        {icon}
      </div>

      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-bold text-foreground">{value}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminPromotionsPage() {
  const router = useRouter()
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

  /* ------------------------------------------------------------ */
  /* Taux normalisé + protection hydration                          */
  /* ------------------------------------------------------------ */

  const rawRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  const rateLoading = Boolean(exchange?.loading)

  const effectiveRate = mounted ? rawRate : null
  const rateNum = Number(effectiveRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  /* ------------------------------------------------------------ */
  /* Filtres / tri / pagination                                    */
  /* ------------------------------------------------------------ */

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const [filterStatut, setFilterStatut] = useState<
    'all' | 'actif' | 'inactif' | 'expire'
  >('all')

  const [filterType, setFilterType] = useState<string>('all')
  const [page, setPage] = useState(1)

  const [sortColumn, setSortColumn] = useState<
    'date_debut' | 'prix_promo' | 'produit_nom'
  >('date_debut')

  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')

  /* ------------------------------------------------------------ */
  /* Form state                                                    */
  /* ------------------------------------------------------------ */

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<NormalizedPromotion | null>(null)

  const [form, setForm] = useState({
    produit_id: null as string | null,
    type_promo: 'prix_fixe' as PromoType,
    prix_promo_usd: 0,
    valeur_pourcentage: 0,
    description: '',
    date_debut: '',
    date_fin: '',
    actif: true,
    quantite_min: 1,
    cumulable: false,
    banniere_url: '',
    produit_cadeau_id: null as string | null,
    categorie_id: null as string | null,
  })

  const [produitSearch, setProduitSearch] = useState('')
  const [produitResults, setProduitResults] = useState<NormalizedProduit[]>([])
  const [showProduitSearch, setShowProduitSearch] = useState(false)
  const [detailPromo, setDetailPromo] = useState<NormalizedPromotion | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'restrictions' | 'apparence'>('general')

  /* ------------------------------------------------------------ */
  /* Garde admin                                                   */
  /* ------------------------------------------------------------ */

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/admin/promotions')}`
      )
      return
    }

    if (!isAdmin) {
      router.replace('/')
    }
  }, [authLoading, isAdmin, router, user])

  /* ------------------------------------------------------------ */
  /* Requête promotions                                            */
  /* ------------------------------------------------------------ */

  const {
    data: promotionsData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<RawPromotion[]>({
    queryKey: ['admin-promotions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/promotions', {
        credentials: 'include',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur chargement promotions'
        )
      }

      return json
    },
    enabled: !!user && !!isAdmin,
    staleTime: 30_000,
  })

  const rawPromotions = useMemo<RawPromotion[]>(() => {
    return Array.isArray(promotionsData) ? promotionsData : []
  }, [promotionsData])

  const promotions = useMemo<NormalizedPromotion[]>(() => {
    return rawPromotions.map((raw) =>
      normalizePromotion(raw, effectiveRate)
    )
  }, [effectiveRate, rawPromotions])

  /* ------------------------------------------------------------ */
  /* Filtrage / tri / pagination                                   */
  /* ------------------------------------------------------------ */

  const filtered = useMemo(() => {
    let list = promotions.filter((p) => {
      const searchLower = debouncedSearch.toLowerCase()

      return (
        (p.produit_nom || '').toLowerCase().includes(searchLower) ||
        (p.description || '').toLowerCase().includes(searchLower)
      )
    })

    if (filterStatut === 'actif') {
      list = list.filter((p) => getPromoStatus(p) === 'actif')
    } else if (filterStatut === 'inactif') {
      list = list.filter((p) => getPromoStatus(p) === 'inactif')
    } else if (filterStatut === 'expire') {
      list = list.filter((p) => getPromoStatus(p) === 'expire')
    }

    if (filterType !== 'all') {
      list = list.filter((p) => p.type_promo === filterType)
    }

    return list
  }, [debouncedSearch, filterStatut, filterType, promotions])

  const sorted = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1

    return [...filtered].sort((a, b) => {
      let valA: any
      let valB: any

      switch (sortColumn) {
        case 'date_debut':
          valA = a.date_debut
          valB = b.date_debut
          break

        case 'prix_promo':
          valA = a.finalPricePair.usd
          valB = b.finalPricePair.usd
          break

        case 'produit_nom':
          valA = (a.produit_nom || '').toLowerCase()
          valB = (b.produit_nom || '').toLowerCase()
          break

        default:
          return 0
      }

      if (valA < valB) return -1 * dir
      if (valA > valB) return 1 * dir

      return 0
    })
  }, [filtered, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE))

  const paginated = useMemo(() => {
    const start = (page - 1) * PER_PAGE

    return sorted.slice(start, start + PER_PAGE)
  }, [page, sorted])

  /* ------------------------------------------------------------ */
  /* Stats                                                         */
  /* ------------------------------------------------------------ */

  const stats = useMemo(() => {
    const actives = promotions.filter(
      (p) => getPromoStatus(p) === 'actif'
    ).length

    const expirees = promotions.filter(
      (p) => getPromoStatus(p) === 'expire'
    ).length

    const inactives = promotions.filter(
      (p) => getPromoStatus(p) === 'inactif'
    ).length

    return {
      total: promotions.length,
      actives,
      expirees,
      inactives,
    }
  }, [promotions])

  const hasLegacyCdfOnly = useMemo(() => {
    return promotions.some(
      (p) =>
        p.promoPricePair.source === 'CDF_LEGACY' ||
        p.originalPricePair.source === 'CDF_LEGACY'
    )
  }, [promotions])

  /* ------------------------------------------------------------ */
  /* Recherche produit                                             */
  /* ------------------------------------------------------------ */

  const searchAbortRef = useRef<AbortController | null>(null)

  const searchProduits = useCallback(
    async (query: string) => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort()
      }

      if (query.length < 2) {
        setProduitResults([])
        return
      }

      const controller = new AbortController()
      searchAbortRef.current = controller

      try {
        const res = await fetch(
          `/api/admin/produits?search=${encodeURIComponent(query)}&limit=10`,
          {
            credentials: 'include',
            signal: controller.signal,
          }
        )

        const json = await res.json().catch(() => ({}))

        if (!res.ok) return

        const prods = Array.isArray(json?.data) ? json.data : json

        if (Array.isArray(prods)) {
          setProduitResults(
            prods.map((raw: RawProduit) =>
              normalizeProduit(raw, effectiveRate)
            )
          )
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          // silencieux
        }
      }
    },
    [effectiveRate]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchProduits(produitSearch)
    }, 300)

    return () => clearTimeout(timer)
  }, [produitSearch, searchProduits])

  /* ------------------------------------------------------------ */
  /* Handlers                                                      */
  /* ------------------------------------------------------------ */

  const selectProduit = useCallback(
    (prod: NormalizedProduit) => {
      setForm((prev) => ({
        ...prev,
        produit_id: prod.id,
      }))

      setProduitSearch(prod.nom)
      setProduitResults([])
      setShowProduitSearch(false)
    },
    []
  )

  const openCreate = useCallback(() => {
    setForm({
      produit_id: null,
      type_promo: 'prix_fixe',
      prix_promo_usd: 0,
      valeur_pourcentage: 0,
      description: '',
      date_debut: '',
      date_fin: '',
      actif: true,
      quantite_min: 1,
      cumulable: false,
      banniere_url: '',
      produit_cadeau_id: null,
      categorie_id: null,
    })

    setProduitSearch('')
    setProduitResults([])
    setCreating(true)
    setActiveTab('general')
  }, [])

  const openEdit = useCallback(
    (p: NormalizedPromotion) => {
      setEditing(p)

      setForm({
        produit_id: p.produit_id || null,
        type_promo: p.type_promo || 'prix_fixe',
        prix_promo_usd: p.promoPricePair.usd || 0,
        valeur_pourcentage: Number(p.valeur_pourcentage ?? 0),
        description: p.description || '',
        date_debut: toDateInputValue(p.date_debut),
        date_fin: toDateInputValue(p.date_fin),
        actif: p.actif,
        quantite_min: Number(p.quantite_min ?? 1),
        cumulable: p.cumulable ?? false,
        banniere_url: p.banniere_url || '',
        produit_cadeau_id: p.produit_cadeau_id || null,
        categorie_id: p.categorie_id || null,
      })

      setProduitSearch(p.produit_nom || '')
      setActiveTab('general')
    },
    []
  )

  const closeForm = useCallback(() => {
    setCreating(false)
    setEditing(null)

    setForm({
      produit_id: null,
      type_promo: 'prix_fixe',
      prix_promo_usd: 0,
      valeur_pourcentage: 0,
      description: '',
      date_debut: '',
      date_fin: '',
      actif: true,
      quantite_min: 1,
      cumulable: false,
      banniere_url: '',
      produit_cadeau_id: null,
      categorie_id: null,
    })

    setProduitSearch('')
    setProduitResults([])
  }, [])

  /* ------------------------------------------------------------ */
  /* Mutations                                                     */
  /* ------------------------------------------------------------ */

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!editing && payload.actif && payload.produit_id) {
        const conflit = promotions.find(
          (p) =>
            p.produit_id === payload.produit_id &&
            p.actif &&
            p.id !== editing?.id
        )

        if (conflit) {
          throw new Error(
            `Une promotion active existe déjà pour ce produit (${conflit.produit_nom})`
          )
        }
      }

      const url = editing
        ? `/api/admin/promotions/${editing.id}`
        : '/api/admin/promotions'

      const method = editing ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur sauvegarde promotion'
        )
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-promotions'],
      })

      addToast({
        type: 'success',
        message: editing
          ? 'Promotion mise à jour'
          : 'Promotion créée',
      })

      closeForm()
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur sauvegarde',
      })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async (promo: NormalizedPromotion) => {
      const res = await fetch(
        `/api/admin/promotions/${promo.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            ...promo,
            prix_promo_usd: promo.promoPricePair.usd,
            prix_promo_cdf: promo.promoPricePair.cdf,
            produit_prix_usd: promo.originalPricePair.usd,
            produit_prix_cdf: promo.originalPricePair.cdf,
            actif: !promo.actif,
          }),
        }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur changement statut'
        )
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-promotions'],
      })

      addToast({
        type: 'success',
        message: 'Statut modifié',
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur statut',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/admin/promotions/${id}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur suppression'
        )
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-promotions'],
      })

      addToast({
        type: 'success',
        message: 'Promotion supprimée',
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur suppression',
      })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: async (promo: NormalizedPromotion) => {
      const {
        id,
        created_at,
        produit_nom,
        produit_image,
        promoPricePair,
        originalPricePair,
        finalPricePair,
        hasUsdSignal,
        ...rest
      } = promo

      const res = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...rest,
          prix_promo_usd: promoPricePair.usd,
          prix_promo_cdf: promoPricePair.cdf,
          produit_prix_usd: originalPricePair.usd,
          produit_prix_cdf: originalPricePair.cdf,
          date_debut: new Date().toISOString(),
          date_fin: promo.date_fin,
          actif: false,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Erreur duplication'
        )
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-promotions'],
      })

      addToast({
        type: 'success',
        message: 'Promotion dupliquée',
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur duplication',
      })
    },
  })

  /* ------------------------------------------------------------ */
  /* Sauvegarde formulaire                                         */
  /* ------------------------------------------------------------ */

  const handleSave = useCallback(() => {
    const cleaned: any = {
      ...form,
      produit_id: form.produit_id?.trim() || null,
      produit_cadeau_id: form.produit_cadeau_id?.trim() || null,
      categorie_id: form.categorie_id?.trim() || null,
      banniere_url: form.banniere_url?.trim() || '',
      date_debut: form.date_debut
        ? new Date(form.date_debut).toISOString()
        : null,
      date_fin: form.date_fin
        ? new Date(form.date_fin).toISOString()
        : null,
      prix_promo_usd:
        form.type_promo === 'cadeau'
          ? 0
          : round2(Number(form.prix_promo_usd) || 0),
      valeur_pourcentage:
        form.type_promo === 'pourcentage'
          ? Number(form.valeur_pourcentage) || null
          : null,
      quantite_min: Number(form.quantite_min) || 1,
    }

    /**
     * Calcul du CDF promo si taux disponible.
     */
    if (rateOk && cleaned.prix_promo_usd > 0) {
      cleaned.prix_promo_cdf = roundCdf(
        toCdf(cleaned.prix_promo_usd, rateNum)
      )
    } else if (cleaned.prix_promo_usd === 0) {
      cleaned.prix_promo_cdf = 0
    }

    /**
     * Calcul du CDF original si taux disponible.
     */
    const selectedProduit = produitResults.find(
      (p) => p.id === cleaned.produit_id
    )

    if (selectedProduit) {
      cleaned.produit_prix_usd = selectedProduit.pricePair.usd

      if (rateOk && selectedProduit.pricePair.usd > 0) {
        cleaned.produit_prix_cdf = roundCdf(
          toCdf(selectedProduit.pricePair.usd, rateNum)
        )
      }
    }

    /**
     * Validations locales.
     */
    if (!cleaned.produit_id && !cleaned.categorie_id) {
      addToast({
        type: 'error',
        message:
          'Veuillez sélectionner un produit ou une catégorie',
      })
      return
    }

    if (
      cleaned.type_promo !== 'cadeau' &&
      cleaned.type_promo !== 'pourcentage' &&
      cleaned.type_promo !== 'lot_degressif'
    ) {
      if (!cleaned.prix_promo_usd || cleaned.prix_promo_usd <= 0) {
        addToast({
          type: 'error',
          message:
            'Le prix promotionnel USD est requis et doit être positif',
        })
        return
      }
    }

    if (
      cleaned.type_promo === 'pourcentage' &&
      (!cleaned.valeur_pourcentage || cleaned.valeur_pourcentage <= 0)
    ) {
      addToast({
        type: 'error',
        message: 'Le pourcentage de réduction est requis',
      })
      return
    }

    if (!cleaned.date_debut || !cleaned.date_fin) {
      addToast({
        type: 'error',
        message: 'Les dates sont requises',
      })
      return
    }

    if (new Date(cleaned.date_fin) <= new Date(cleaned.date_debut)) {
      addToast({
        type: 'error',
        message:
          'La date de fin doit être après la date de début',
      })
      return
    }

    /**
     * Blocage si legacy CDF-only et taux indisponible.
     */
    if (
      !rateOk &&
      cleaned.prix_promo_usd > 0 &&
      !selectedProduit?.pricePair.usd
    ) {
      addToast({
        type: 'error',
        message:
          'Taux USD/CDF indisponible : impossible de calculer le CDF promo en toute sécurité.',
      })
      return
    }

    saveMutation.mutate(cleaned)
  }, [
    addToast,
    form,
    produitResults,
    rateNum,
    rateOk,
    saveMutation,
  ])

  /* ------------------------------------------------------------ */
  /* Export CSV                                                    */
  /* ------------------------------------------------------------ */

  const exportCSV = useCallback(() => {
    if (sorted.length === 0) return

    const headers = [
      'Produit',
      'Type',
      'Prix promo USD',
      'Prix promo CDF',
      'Prix original USD',
      'Prix original CDF',
      '% Réduction',
      'Début',
      'Fin',
      'Actif',
      'Taux utilisé',
    ]

    const rows = sorted.map((p) => [
      p.produit_nom || '',
      TYPE_OPTIONS.find((t) => t.value === p.type_promo)?.label ||
        p.type_promo,
      p.promoPricePair.usd > 0
        ? p.promoPricePair.usd.toFixed(2)
        : '',
      p.promoPricePair.cdf != null
        ? String(p.promoPricePair.cdf)
        : '',
      p.originalPricePair.usd > 0
        ? p.originalPricePair.usd.toFixed(2)
        : '',
      p.originalPricePair.cdf != null
        ? String(p.originalPricePair.cdf)
        : '',
      p.valeur_pourcentage || '',
      p.date_debut,
      p.date_fin,
      p.actif ? 'Oui' : 'Non',
      effectiveRate ? String(round2(Number(effectiveRate))) : '',
    ])

    const csvContent = [headers, ...rows]
      .map((r) => r.map(escapeCsv).join(','))
      .join('\n')

    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url
    a.download = `promotions_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`
    a.click()

    URL.revokeObjectURL(url)

    addToast({
      type: 'success',
      message: 'Export CSV généré',
    })
  }, [addToast, effectiveRate, sorted])

  /* ------------------------------------------------------------ */
  /* Tri                                                           */
  /* ------------------------------------------------------------ */

  const handleSort = useCallback(
    (col: typeof sortColumn) => {
      if (sortColumn === col) {
        setSortDirection((prev) =>
          prev === 'asc' ? 'desc' : 'asc'
        )
      } else {
        setSortColumn(col)
        setSortDirection('asc')
      }
    },
    [sortColumn]
  )

  /* ------------------------------------------------------------ */
  /* Conflit                                                       */
  /* ------------------------------------------------------------ */

  const PromoConflictWarning = useCallback(
    ({
      produitId,
      excludeId,
    }: {
      produitId: string
      excludeId?: string
    }) => {
      const conflit = promotions.find(
        (p) =>
          p.produit_id === produitId &&
          p.actif &&
          p.id !== excludeId
      )

      if (!conflit) return null

      return (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <AlertTriangle
            size={16}
            aria-hidden="true"
          />

          Une promotion active existe déjà pour ce produit (
          {conflit.produit_nom}). Elle sera désactivée si vous
          enregistrez celle-ci.
        </div>
      )
    },
    [promotions]
  )

  /* ------------------------------------------------------------ */
  /* Prix final preview                                            */
  /* ------------------------------------------------------------ */

  const previewFinalPrice = useMemo<MoneyPair>(() => {
    if (form.type_promo === 'cadeau') {
      return {
        usd: 0,
        cdf: 0,
        cdfKnown: true,
        source: 'USD',
      }
    }

    const selectedProduit = produitResults.find(
      (p) => p.id === form.produit_id
    )

    if (form.type_promo === 'pourcentage') {
      const pct = Number(form.valeur_pourcentage ?? 0)

      if (selectedProduit && pct > 0) {
        const finalUsd = round2(
          selectedProduit.pricePair.usd * (1 - pct / 100)
        )

        return resolvePricePair(finalUsd, null, effectiveRate)
      }
    }

    return resolvePricePair(
      form.prix_promo_usd > 0 ? form.prix_promo_usd : null,
      null,
      effectiveRate
    )
  }, [
    effectiveRate,
    form.prix_promo_usd,
    form.produit_id,
    form.type_promo,
    form.valeur_pourcentage,
    produitResults,
  ])

  /* ------------------------------------------------------------ */
  /* Early returns                                                 */
  /* ------------------------------------------------------------ */

  if (authLoading) {
    return (
      <Container className="py-12">
        <div className="flex justify-center">
          <Spinner size="lg" />
        </div>
      </Container>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  const motionInitial = prefersReducedMotion
    ? false
    : { opacity: 0, y: 20 }

  /* ------------------------------------------------------------ */
  /* Rendu                                                         */
  /* ------------------------------------------------------------ */

  return (
    <Container className="py-8">
      <motion.div
        initial={motionInitial}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.5,
        }}
      >
        {/* En-tête */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-3 font-serif text-3xl font-bold text-foreground">
              <div className="rounded-xl bg-amber-100 p-2 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <Tag size={24} aria-hidden="true" />
              </div>
              Promotions & Offres éclair
            </h1>

            <p className="mt-1 text-muted-foreground">
              {stats.total} promotions · {stats.actives} actives
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!mounted ? (
              <Badge variant="neutral" size="sm">
                Initialisation du taux…
              </Badge>
            ) : rateOk ? (
              <Badge variant="accent" size="sm">
                1 USD ≈ {formatCdf(rateNum)}
              </Badge>
            ) : rateLoading ? (
              <Badge variant="neutral" size="sm">
                Chargement du taux…
              </Badge>
            ) : (
              <Badge variant="danger" size="sm">
                <AlertTriangle
                  size={12}
                  className="mr-1"
                  aria-hidden="true"
                />
                Taux indisponible
              </Badge>
            )}

            <Button
              variant="outline-gold"
              size="sm"
              onClick={exportCSV}
              leftIcon={
                <Download size={14} aria-hidden="true" />
              }
            >
              Export CSV
            </Button>

            <Button
              variant="outline-gold"
              size="sm"
              onClick={() =>
                setViewMode(
                  viewMode === 'table' ? 'grid' : 'table'
                )
              }
            >
              {viewMode === 'table' ? (
                <LayoutGrid size={14} aria-hidden="true" />
              ) : (
                <List size={14} aria-hidden="true" />
              )}
            </Button>

            <Button
              variant="luxe"
              onClick={openCreate}
              leftIcon={
                <Plus size={16} aria-hidden="true" />
              }
            >
              Nouvelle promotion
            </Button>
          </div>
        </div>

        {/* Alerte legacy CDF */}
        {!rateOk && hasLegacyCdfOnly && (
          <Card className="mb-6 border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20">
            <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle
                size={18}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="font-medium">
                  Montants CDF legacy détectés
                </p>

                <p className="mt-1 text-xs opacity-90">
                  Certaines promotions contiennent des prix uniquement
                  en CDF. Tant que le taux USD/CDF est indisponible,
                  ils sont affichés en fallback et ne peuvent pas être
                  édités en toute sécurité.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Total"
            value={stats.total}
            icon={<Tag size={20} aria-hidden="true" />}
            tone="amber"
          />

          <StatCard
            label="Actives"
            value={stats.actives}
            icon={<CheckCircle2 size={20} aria-hidden="true" />}
            tone="green"
          />

          <StatCard
            label="Expirées"
            value={stats.expirees}
            icon={<Clock size={20} aria-hidden="true" />}
            tone="red"
          />

          <StatCard
            label="Inactives"
            value={stats.inactives}
            icon={<PowerOff size={20} aria-hidden="true" />}
          />
        </div>

        {/* Filtres */}
        <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="relative max-w-xs flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
              size={18}
              aria-hidden="true"
            />

            <Input
              variant="glass"
              placeholder="Rechercher..."
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

          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: 'all', label: 'Tous' },
                { key: 'actif', label: 'Actives' },
                { key: 'inactif', label: 'Inactives' },
                { key: 'expire', label: 'Expirées' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setFilterStatut(opt.key)
                  setPage(1)
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  filterStatut === opt.key
                    ? 'border-gold-400/60 bg-gold-400/20 text-gold-600 shadow-sm'
                    : 'border-border bg-card text-muted-foreground hover:border-gold-400'
                )}
              >
                {opt.label}
              </button>
            ))}

            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value)
                setPage(1)
              }}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs"
              aria-label="Filtrer par type"
            >
              <option value="all">Tous types</option>

              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {(search ||
            filterStatut !== 'all' ||
            filterType !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setFilterStatut('all')
                setFilterType('all')
                setPage(1)
              }}
              className="text-red-500"
              leftIcon={<X size={14} aria-hidden="true" />}
            >
              Effacer
            </Button>
          )}
        </div>

        {/* Contenu */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <AlertTriangle
              size={48}
              className="text-red-500"
              aria-hidden="true"
            />

            <p className="text-sm text-red-500">
              {(error as Error)?.message ||
                'Impossible de charger les promotions.'}
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
        ) : paginated.length === 0 ? (
          <Card variant="glass">
            <CardContent className="py-8 text-center text-muted-foreground">
              Aucune promotion trouvée.
            </CardContent>
          </Card>
        ) : viewMode === 'table' ? (
          <Card
            variant="glass"
            className="overflow-hidden border-gold-400/20"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gold-400/20 text-left">
                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort('produit_nom')}
                    >
                      Produit{' '}
                      {sortColumn === 'produit_nom' &&
                        (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th className="px-4 py-3 font-semibold">Type</th>

                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort('prix_promo')}
                    >
                      Prix promo{' '}
                      {sortColumn === 'prix_promo' &&
                        (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort('date_debut')}
                    >
                      Période{' '}
                      {sortColumn === 'date_debut' &&
                        (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th className="px-4 py-3 font-semibold">Statut</th>

                    <th className="px-4 py-3 text-center font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  <AnimatePresence initial={false}>
                    {paginated.map((promo) => {
                      const status = getPromoStatus(promo)

                      return (
                        <motion.tr
                          key={promo.id}
                          initial={
                            prefersReducedMotion
                              ? false
                              : { opacity: 0 }
                          }
                          animate={{ opacity: 1 }}
                          exit={
                            prefersReducedMotion
                              ? undefined
                              : { opacity: 0 }
                          }
                          transition={{
                            duration: prefersReducedMotion
                              ? 0
                              : 0.2,
                          }}
                          className="border-b border-gold-400/5 transition-colors hover:bg-gold-400/5"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {promo.produit_image ? (
                                <img
                                  src={promo.produit_image}
                                  alt={promo.produit_nom || ''}
                                  className="h-8 w-8 rounded-lg object-cover"
                                />
                              ) : (
                                <Tag
                                  size={20}
                                  className="text-amber-500"
                                  aria-hidden="true"
                                />
                              )}

                              <span className="font-medium">
                                {promo.produit_nom ||
                                  'Produit inconnu'}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {
                              TYPE_OPTIONS.find(
                                (t) => t.value === promo.type_promo
                              )?.icon
                            }{' '}
                            {
                              TYPE_OPTIONS.find(
                                (t) => t.value === promo.type_promo
                              )?.label
                            }
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              {promo.originalPricePair.usd > 0 && (
                                <span className="text-xs text-muted-foreground line-through">
                                  {formatMoneyPair(
                                    promo.originalPricePair
                                  )}
                                </span>
                              )}

                              <MoneyCell
                                pair={promo.finalPricePair}
                              />

                              {promo.valeur_pourcentage ? (
                                <span className="text-xs text-green-600">
                                  -{promo.valeur_pourcentage}%
                                </span>
                              ) : null}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDate(promo.date_debut)}
                            <br />→ {formatDate(promo.date_fin)}
                          </td>

                          <td className="px-4 py-3">
                            <Badge
                              variant={getStatusBadgeVariant(status)}
                              size="sm"
                            >
                              {getStatusLabel(status)}
                            </Badge>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <Tooltip content="Détails">
                                <button
                                  onClick={() =>
                                    setDetailPromo(promo)
                                  }
                                  className="rounded-lg p-1.5 text-neutral-400 transition hover:text-gold-500"
                                  aria-label="Détails"
                                >
                                  <Eye size={16} aria-hidden="true" />
                                </button>
                              </Tooltip>

                              <Tooltip content="Modifier">
                                <button
                                  onClick={() => openEdit(promo)}
                                  className="rounded-lg p-1.5 text-neutral-400 transition hover:text-gold-500"
                                  aria-label="Modifier"
                                >
                                  <Pencil
                                    size={16}
                                    aria-hidden="true"
                                  />
                                </button>
                              </Tooltip>

                              <Tooltip content="Dupliquer">
                                <button
                                  onClick={() =>
                                    duplicateMutation.mutate(promo)
                                  }
                                  className="rounded-lg p-1.5 text-neutral-400 transition hover:text-blue-500"
                                  aria-label="Dupliquer"
                                >
                                  <Copy
                                    size={16}
                                    aria-hidden="true"
                                  />
                                </button>
                              </Tooltip>

                              <Tooltip
                                content={
                                  promo.actif
                                    ? 'Désactiver'
                                    : 'Activer'
                                }
                              >
                                <button
                                  onClick={() =>
                                    toggleMutation.mutate(promo)
                                  }
                                  className="rounded-lg p-1.5 text-neutral-400 transition hover:text-amber-500"
                                  aria-label={
                                    promo.actif
                                      ? 'Désactiver'
                                      : 'Activer'
                                  }
                                >
                                  {promo.actif ? (
                                    <PowerOff
                                      size={16}
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Power
                                      size={16}
                                      aria-hidden="true"
                                    />
                                  )}
                                </button>
                              </Tooltip>

                              <Tooltip content="Supprimer">
                                <button
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Supprimer cette promotion ?'
                                      )
                                    ) {
                                      deleteMutation.mutate(promo.id)
                                    }
                                  }}
                                  className="rounded-lg p-1.5 text-neutral-400 transition hover:text-red-500"
                                  aria-label="Supprimer"
                                >
                                  <Trash2
                                    size={16}
                                    aria-hidden="true"
                                  />
                                </button>
                              </Tooltip>
                            </div>
                          </td>
                        </motion.tr>
                      )
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {paginated.map((promo) => {
                const status = getPromoStatus(promo)

                return (
                  <motion.div
                    key={promo.id}
                    initial={
                      prefersReducedMotion
                        ? false
                        : { opacity: 0, scale: 0.95 }
                    }
                    animate={{ opacity: 1, scale: 1 }}
                    exit={
                      prefersReducedMotion
                        ? undefined
                        : { opacity: 0, scale: 0.95 }
                    }
                    transition={{
                      duration: prefersReducedMotion ? 0 : 0.2,
                    }}
                  >
                    <Card
                      variant="glass"
                      className="border-l-4 border-l-amber-400"
                    >
                      <CardContent className="p-4">
                        <div className="mb-2 flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                status === 'actif'
                                  ? 'accent'
                                  : status === 'expire'
                                    ? 'neutral'
                                    : 'danger'
                              }
                              size="sm"
                            >
                              {getStatusLabel(status)}
                            </Badge>

                            <Badge variant="neutral" size="sm">
                              {
                                TYPE_OPTIONS.find(
                                  (t) => t.value === promo.type_promo
                                )?.label
                              }
                            </Badge>
                          </div>

                          <div className="flex gap-1">
                            <button
                              onClick={() => openEdit(promo)}
                              className="p-1 text-neutral-400 transition hover:text-gold-500"
                              aria-label="Modifier"
                            >
                              <Pencil
                                size={14}
                                aria-hidden="true"
                              />
                            </button>

                            <button
                              onClick={() => {
                                if (
                                  window.confirm('Supprimer ?')
                                ) {
                                  deleteMutation.mutate(promo.id)
                                }
                              }}
                              className="p-1 text-neutral-400 transition hover:text-red-500"
                              aria-label="Supprimer"
                            >
                              <Trash2
                                size={14}
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        </div>

                        <h3 className="font-semibold text-foreground">
                          {promo.produit_nom || 'Produit inconnu'}
                        </h3>

                        <div className="mt-2 text-sm">
                          {promo.originalPricePair.usd > 0 && (
                            <span className="mr-2 text-xs text-muted-foreground line-through">
                              {formatMoneyPair(
                                promo.originalPricePair
                              )}
                            </span>
                          )}

                          <MoneyCell
                            pair={promo.finalPricePair}
                          />
                        </div>

                        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock
                            size={12}
                            aria-hidden="true"
                          />
                          {formatDate(promo.date_debut)} →{' '}
                          {formatDate(promo.date_fin)}
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
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="outline-gold"
                size="icon"
                onClick={() =>
                  setPage((p) => Math.max(1, p - 1))
                }
                disabled={page === 1}
              >
                <ChevronLeft
                  size={16}
                  aria-hidden="true"
                />
              </Button>

              <span className="px-3 text-sm">
                {page} / {totalPages}
              </span>

              <Button
                variant="outline-gold"
                size="icon"
                onClick={() =>
                  setPage((p) =>
                    Math.min(totalPages, p + 1)
                  )
                }
                disabled={page === totalPages}
              >
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODALE création / édition                              */}
      {/* ═══════════════════════════════════════════════════════ */}

      <Modal
        isOpen={creating || !!editing}
        onClose={closeForm}
        title={
          editing
            ? 'Modifier la promotion'
            : 'Nouvelle promotion'
        }
        size="xl"
        accent="gold"
      >
        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-2">
          {/* Onglets */}
          <div className="flex gap-2 border-b border-border pb-2">
            {(
              ['general', 'restrictions', 'apparence'] as const
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-t-lg px-4 py-2 text-sm font-medium transition',
                  activeTab === tab
                    ? 'border-b-2 border-gold-400 bg-gold-400/10 text-gold-600'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab === 'general'
                  ? 'Général'
                  : tab === 'restrictions'
                    ? 'Restrictions'
                    : 'Apparence'}
              </button>
            ))}
          </div>

          {/* Onglet Général */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    checked={!form.categorie_id}
                    onChange={() =>
                      setForm({
                        ...form,
                        categorie_id: null,
                      })
                    }
                    className="text-gold-500"
                  />

                  <span className="text-sm">Produit unique</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    checked={!!form.categorie_id}
                    onChange={() =>
                      setForm({
                        ...form,
                        produit_id: null,
                      })
                    }
                    className="text-gold-500"
                  />

                  <span className="text-sm">
                    Catégorie entière
                  </span>
                </label>
              </div>

              {!form.categorie_id ? (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Produit
                  </label>

                  {form.produit_id ? (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                      {produitResults.find(
                        (p) => p.id === form.produit_id
                      )?.images?.[0] ? (
                        <img
                          src={
                            produitResults.find(
                              (p) => p.id === form.produit_id
                            )?.images?.[0]
                          }
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <Tag
                          size={20}
                          className="text-amber-500"
                          aria-hidden="true"
                        />
                      )}

                      <div>
                        <span className="font-medium">
                          {produitSearch}
                        </span>

                        <div className="mt-0.5">
                          <MoneyCell
                            pair={
                              produitResults.find(
                                (p) => p.id === form.produit_id
                              )?.pricePair ?? {
                                usd: 0,
                                cdf: null,
                                cdfKnown: false,
                                source: 'NONE',
                              }
                            }
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setForm({
                            ...form,
                            produit_id: null,
                          })

                          setProduitSearch('')
                        }}
                        className="ml-auto text-red-400"
                        aria-label="Retirer le produit"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Rechercher un produit (nom, SKU)..."
                        value={produitSearch}
                        onChange={(e) => {
                          setProduitSearch(e.target.value)
                          setShowProduitSearch(true)
                        }}
                        onFocus={() => setShowProduitSearch(true)}
                        leftIcon={
                          <Search
                            size={16}
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                        }
                      />

                      {showProduitSearch &&
                        produitResults.length > 0 && (
                          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                            {produitResults.map((prod) => (
                              <button
                                key={prod.id}
                                onClick={() => selectProduit(prod)}
                                className="flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-gold-400/10"
                              >
                                {prod.images?.[0] ? (
                                  <img
                                    src={prod.images[0]}
                                    alt=""
                                    className="h-12 w-12 rounded-lg object-cover"
                                  />
                                ) : (
                                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                                    <Tag
                                      size={18}
                                      className="text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                  </div>
                                )}

                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium">
                                    {prod.nom}
                                  </p>

                                  <MoneyCell
                                    pair={prod.pricePair}
                                  />
                                </div>

                                <Plus
                                  size={16}
                                  className="flex-shrink-0 text-gold-500"
                                  aria-hidden="true"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Catégorie
                  </label>

                  <select
                    value={form.categorie_id || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        categorie_id:
                          e.target.value || null,
                      })
                    }
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  >
                    <option value="">
                      Sélectionner une catégorie
                    </option>

                    <option value="cat1">Électronique</option>
                    <option value="cat2">Mode</option>
                    <option value="cat3">Maison</option>
                  </select>
                </div>
              )}

              {/* Type de promotion */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Type de promotion
                </label>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          type_promo: opt.value,
                        })
                      }
                      className={cn(
                        'flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-all',
                        form.type_promo === opt.value
                          ? 'border-amber-400 bg-amber-50 shadow-sm dark:bg-amber-900/20'
                          : 'border-border hover:border-amber-400/50'
                      )}
                    >
                      <span
                        className={cn(
                          form.type_promo === opt.value
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                        )}
                      >
                        {opt.icon}
                      </span>

                      <span className="text-sm font-medium">
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Prix ou pourcentage */}
              <div className="grid grid-cols-2 gap-4">
                {form.type_promo !== 'cadeau' &&
                  form.type_promo !== 'lot_degressif' && (
                    <>
                      {form.type_promo === 'pourcentage' ? (
                        <Input
                          label="Réduction (%)"
                          type="number"
                          min="1"
                          max="99"
                          value={form.valeur_pourcentage}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              valeur_pourcentage:
                                parseFloat(e.target.value) || 0,
                            })
                          }
                          leftIcon={
                            <Percent
                              size={16}
                              className="text-muted-foreground"
                              aria-hidden="true"
                            />
                          }
                        />
                      ) : (
                        <Input
                          label={
                            form.type_promo === 'flash'
                              ? 'Prix flash (USD)'
                              : 'Prix promotionnel (USD)'
                          }
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.prix_promo_usd}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              prix_promo_usd:
                                parseFloat(e.target.value) || 0,
                            })
                          }
                          leftIcon={
                            <DollarSign
                              size={16}
                              className="text-muted-foreground"
                              aria-hidden="true"
                            />
                          }
                        />
                      )}

                      {form.produit_id && (
                        <div className="flex items-center justify-center rounded-xl border border-border bg-card p-3">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">
                              Prix final
                            </p>

                            <MoneyCell
                              pair={previewFinalPrice}
                            />

                            {form.type_promo !== 'pourcentage' &&
                              produitResults.find(
                                (p) => p.id === form.produit_id
                              ) && (
                                <p className="mt-0.5 text-xs text-muted-foreground line-through">
                                  {formatMoneyPair(
                                    produitResults.find(
                                      (p) => p.id === form.produit_id
                                    )!.pricePair
                                  )}
                                </p>
                              )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                {form.type_promo === 'lot_degressif' && (
                  <Input
                    label="Prix unitaire dégressif (USD)"
                    type="number"
                    step="0.01"
                    value={form.prix_promo_usd}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        prix_promo_usd:
                          parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                )}

                {form.type_promo === 'cadeau' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Produit offert
                    </label>

                    <Input
                      placeholder="Rechercher le produit cadeau..."
                      value={form.produit_cadeau_id || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          produit_cadeau_id:
                            e.target.value || null,
                        })
                      }
                    />
                  </div>
                )}
              </div>

              <Input
                label="Description (visible sur la fiche produit)"
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value,
                  })
                }
                placeholder="Ex: Offre spéciale rentrée !"
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Date de début"
                  type="datetime-local"
                  value={form.date_debut}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      date_debut: e.target.value,
                    })
                  }
                />

                <Input
                  label="Date de fin"
                  type="datetime-local"
                  value={form.date_fin}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      date_fin: e.target.value,
                    })
                  }
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.actif}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      actif: e.target.checked,
                    })
                  }
                  id="actif"
                  className="h-4 w-4 rounded border-border text-gold-500 focus:ring-gold-500"
                />

                <label
                  htmlFor="actif"
                  className="text-sm"
                >
                  Activer immédiatement
                </label>
              </div>
            </div>
          )}

          {/* Onglet Restrictions */}
          {activeTab === 'restrictions' && (
            <div className="space-y-4">
              <Input
                label="Quantité minimum d'achat"
                type="number"
                min="1"
                value={form.quantite_min || 1}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quantite_min:
                      parseInt(e.target.value) || 1,
                  })
                }
              />

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.cumulable}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cumulable: e.target.checked,
                    })
                  }
                  id="cumulable"
                  className="h-4 w-4 rounded border-border text-gold-500 focus:ring-gold-500"
                />

                <label
                  htmlFor="cumulable"
                  className="text-sm"
                >
                  Cumulable avec d&apos;autres promotions
                </label>
              </div>

              {form.produit_id && form.actif && (
                <PromoConflictWarning
                  produitId={form.produit_id}
                  excludeId={editing?.id}
                />
              )}
            </div>
          )}

          {/* Onglet Apparence */}
          {activeTab === 'apparence' && (
            <div className="space-y-4">
              <Input
                label="URL de la bannière promotionnelle"
                placeholder="https://..."
                value={form.banniere_url || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    banniere_url: e.target.value,
                  })
                }
              />

              {form.banniere_url && (
                <div className="relative h-24 w-full overflow-hidden rounded-xl border border-border">
                  <img
                    src={form.banniere_url}
                    alt="Aperçu bannière"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>
          )}

          {/* Boutons d'action */}
          <div className="flex gap-3 border-t border-border pt-4">
            <Button
              variant="luxe"
              fullWidth
              onClick={handleSave}
              loading={saveMutation.isPending}
              disabled={
                !rateOk &&
                form.type_promo !== 'cadeau' &&
                form.type_promo !== 'pourcentage' &&
                form.prix_promo_usd > 0 &&
                !produitResults.find(
                  (p) => p.id === form.produit_id
                )?.pricePair.usd
              }
            >
              {editing
                ? 'Mettre à jour'
                : 'Créer la promotion'}
            </Button>

            <Button
              variant="outline"
              fullWidth
              onClick={closeForm}
              disabled={saveMutation.isPending}
            >
              Annuler
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODALE détail                                           */}
      {/* ═══════════════════════════════════════════════════════ */}

      <Modal
        isOpen={!!detailPromo}
        onClose={() => setDetailPromo(null)}
        title={
          detailPromo?.produit_nom || 'Promotion'
        }
        size="md"
        accent="gold"
      >
        {detailPromo && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Type :
              </span>

              <Badge variant="neutral">
                {
                  TYPE_OPTIONS.find(
                    (t) => t.value === detailPromo.type_promo
                  )?.label
                }
              </Badge>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Prix promo :
              </span>

              <MoneyCell
                pair={detailPromo.promoPricePair}
              />
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Prix final :
              </span>

              <MoneyCell
                pair={detailPromo.finalPricePair}
              />
            </div>

            {detailPromo.valeur_pourcentage ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Réduction :
                </span>

                <span>
                  {detailPromo.valeur_pourcentage}%
                </span>
              </div>
            ) : null}

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Période :
              </span>

              <span>
                {formatDate(detailPromo.date_debut)} →{' '}
                {formatDate(detailPromo.date_fin)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Statut :
              </span>

              <Badge
                variant={
                  getStatusBadgeVariant(
                    getPromoStatus(detailPromo)
                  )
                }
              >
                {getStatusLabel(
                  getPromoStatus(detailPromo)
                )}
              </Badge>
            </div>

            {detailPromo.description && (
              <div>
                <span className="text-muted-foreground">
                  Description :
                </span>

                <p className="mt-1">
                  {detailPromo.description}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </Container>
  )
}