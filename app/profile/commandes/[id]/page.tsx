// app/profile/commandes/[id]/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

import { motion, useReducedMotion } from 'framer-motion'

import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  Key,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  Truck,
  XCircle,
  Zap,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

type ArticleStatus = 'ok' | 'refuse' | 'pending'

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
  id: string
  nom: string
  quantity: number
  specifications: string | null

  usdSource: number
  cdfSource: number

  status: ArticleStatus
  motifRefus: string | null
  codeAcheteur: string | null
}

interface EnrichedArticle extends NormalizedArticle {
  unitPair: MoneyPair
  linePair: MoneyPair
  unitDisplay: DisplayMoney
  lineDisplay: DisplayMoney
  hasPrice: boolean
}

interface NormalizedOrder {
  id: string
  numero: string
  statut: string
  date: string
  type_livraison: string

  adresse_livraison?: string | null
  point_retrait?: {
    nom: string
    adresse: string
  } | null

  articles: NormalizedArticle[]

  code_client?: string | null
  code_livreur?: string | null

  payment_method?: string | null
  payment_reference?: string | null

  subtotal_usd?: number
  subtotal_cdf?: number

  reduction_usd?: number
  reduction_cdf?: number

  shipping_usd?: number
  shipping_cdf?: number

  total_usd?: number
  total_cdf?: number
  total_global?: number
  total?: number

  exchange_rate?: number
}

interface EnrichedOrder extends Omit<NormalizedOrder, 'articles'> {
  articles: EnrichedArticle[]

  subtotalPair: MoneyPair
  discountPair: MoneyPair
  shippingPair: MoneyPair
  totalPair: MoneyPair

  totalDisplay: DisplayMoney
  articleQuantity: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const STATUS_CONFIG: Record<
  string,
  {
    variant: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral'
    label: string
  }
> = {
  en_attente: { variant: 'warm', label: 'En attente' },
  payee: { variant: 'gold', label: 'Payée' },
  conditionnement_premium: {
    variant: 'neutral',
    label: 'Conditionnement Premium',
  },
  collecte: { variant: 'neutral', label: 'Collecte' },
  en_livraison: { variant: 'warm', label: 'En livraison' },
  livree: { variant: 'accent', label: 'Livrée' },
  annulee: { variant: 'danger', label: 'Annulée' },
  refusee: { variant: 'danger', label: 'Refusée' },
  rembourse: { variant: 'neutral', label: 'Remboursée' },
  retour_demande: { variant: 'warm', label: 'Retour demandé' },
}

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

function capPair(
  pair: MoneyPair,
  limit: MoneyPair,
  rate: number | null
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let usd = Math.min(pair.usd, limit.usd)
  let cdf =
    rateOk && usd > 0
      ? roundCdf(toCdf(usd, rateNum))
      : Math.min(pair.cdf, limit.cdf)

  if (usd <= 0 && cdf > 0 && rateOk) {
    usd = round2(toUsd(cdf, rateNum))
  }

  if (cdf <= 0 && usd > 0 && rateOk) {
    cdf = roundCdf(toCdf(usd, rateNum))
  }

  return {
    usd: round2(Math.max(0, usd)),
    cdf: roundCdf(Math.max(0, cdf)),
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

function getStatutConfig(statut: string) {
  return STATUS_CONFIG[statut] || STATUS_CONFIG.en_attente
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

function normalizeArticleStatus(value: any): ArticleStatus {
  const raw = String(value || '')
    .trim()
    .toLowerCase()

  if (raw === 'ok' || raw === 'accepte' || raw === 'accepted') return 'ok'
  if (raw === 'refuse' || raw === 'rejected' || raw === 'refusé') return 'refuse'

  return 'pending'
}

function getCollecteBadge(status: ArticleStatus): {
  variant: 'accent' | 'danger' | 'neutral'
  icon: React.ReactNode
  label: string
} {
  if (status === 'ok') {
    return {
      variant: 'accent',
      icon: <CheckCircle size={14} aria-hidden="true" />,
      label: 'Validé',
    }
  }

  if (status === 'refuse') {
    return {
      variant: 'danger',
      icon: <XCircle size={14} aria-hidden="true" />,
      label: 'Refusé',
    }
  }

  return {
    variant: 'neutral',
    icon: null,
    label: 'En attente',
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT / ARTICLE NORMALIZATION                                */
/* ═══════════════════════════════════════════════════════════════ */

function parseMaybeJson(value: any): any {
  if (value === null || value === undefined) return null

  if (typeof value === 'object') return value

  const raw = String(value || '').trim()
  if (!raw) return null

  if (
    (raw.startsWith('{') && raw.endsWith('}')) ||
    (raw.startsWith('[') && raw.endsWith(']'))
  ) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  return raw
}

function cleanVariantAttributes(
  input: unknown
): Record<string, string> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const clean: Record<string, string> = {}

  for (const [key, value] of Object.entries(input)) {
    const cleanKey = String(key || '').trim()

    if (!cleanKey) continue
    if (value === null || value === undefined) continue

    const cleanValue = String(value).trim()
    if (!cleanValue) continue

    clean[cleanKey] = cleanValue
  }

  return Object.keys(clean).length > 0 ? clean : null
}

function extractVariantAttributes(raw: any): Record<string, string> | null {
  const candidates = [
    raw?.variant_attributes,
    raw?.variante,
    raw?.attributes,
    raw?.attrs,
  ]

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const attributes =
        (parsed as any).attributes ??
        (parsed as any).attrs ??
        parsed

      const clean = cleanVariantAttributes(attributes)

      if (clean) return clean
    }
  }

  return null
}

function variantLabelFromAttributes(
  attributes: Record<string, string> | null
): string | null {
  if (!attributes) return null

  const entries = Object.entries(attributes).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false

    return String(value).trim() !== ''
  })

  if (entries.length === 0) return null

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  return entries.map(([, value]) => String(value)).join(' • ')
}

function normalizeArticle(raw: any, index: number): NormalizedArticle {
  const attrs = extractVariantAttributes(raw)
  const variantLabel = variantLabelFromAttributes(attrs)

  return {
    id: String(
      raw?.id ||
        raw?.produit_id ||
        `${raw?.nom || 'article'}-${index}`
    ),

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
      variantLabel ||
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

    status: normalizeArticleStatus(
      raw?.statut_collecte ?? raw?.status ?? raw?.statut
    ),

    motifRefus:
      raw?.motif_refus ||
      raw?.refusal_reason ||
      raw?.refuse_motif ||
      null,

    codeAcheteur:
      raw?.code_acheteur ||
      raw?.code_client ||
      null,
  }
}

function normalizeOrder(raw: any, fallbackId: string): NormalizedOrder {
  const payload = raw?.data ?? raw

  const articlesSource = Array.isArray(payload?.articles)
    ? payload.articles
    : Array.isArray(payload?.commande_articles)
      ? payload.commande_articles
      : []

  const pointRetrait =
    payload?.point_retrait ??
    (payload?.point_retrait_nom
      ? {
          nom: String(payload.point_retrait_nom),
          adresse: String(payload.point_retrait_adresse || ''),
        }
      : null)

  return {
    id: String(payload?.id || fallbackId),

    numero: String(
      payload?.numero ||
        payload?.numero_commande ||
        fallbackId.slice(0, 8)
    ),

    statut: String(
      payload?.statut || payload?.status || 'en_attente'
    ).toLowerCase(),

    date:
      payload?.date ||
      payload?.created_at ||
      new Date().toISOString(),

    type_livraison: normalizeDeliveryMode(
      payload?.type_livraison || payload?.shipping_method
    ),

    adresse_livraison:
      payload?.adresse_livraison || payload?.address || null,

    point_retrait:
      pointRetrait && pointRetrait.nom
        ? {
            nom: String(pointRetrait.nom),
            adresse: String(pointRetrait.adresse || ''),
          }
        : null,

    articles: articlesSource.map(normalizeArticle),

    code_client:
      payload?.code_client ||
      payload?.client_code ||
      payload?.code_livraison ||
      null,

    code_livreur:
      payload?.code_livreur ||
      payload?.driver_code ||
      null,

    payment_method:
      payload?.payment_method ||
      payload?.method ||
      payload?.payment?.method ||
      null,

    payment_reference:
      payload?.payment_reference ||
      payload?.transaction_id ||
      payload?.external_transaction_id ||
      payload?.reference ||
      null,

    subtotal_usd: optionalNumber(
      payload?.subtotal_usd ?? payload?.subtotalUSD
    ),

    subtotal_cdf: optionalNumber(
      payload?.subtotal_cdf ??
        payload?.subtotalCDF ??
        payload?.sous_total ??
        payload?.subtotal
    ),

    reduction_usd: optionalNumber(
      payload?.reduction_usd ??
        payload?.remise_usd ??
        payload?.discount_usd
    ),

    reduction_cdf: optionalNumber(
      payload?.reduction_cdf ??
        payload?.remise_cdf ??
        payload?.reduction ??
        payload?.discount
    ),

    shipping_usd: optionalNumber(
      payload?.shipping_usd ?? payload?.frais_livraison_usd
    ),

    shipping_cdf: optionalNumber(
      payload?.shipping_cdf ?? payload?.frais_livraison
    ),

    total_usd: optionalNumber(payload?.total_usd ?? payload?.totalUSD),

    total_cdf: optionalNumber(
      payload?.total_cdf ??
        payload?.totalCDF ??
        payload?.total_global ??
        payload?.total
    ),

    total_global: optionalNumber(payload?.total_global ?? payload?.total),

    total: optionalNumber(payload?.total),

    exchange_rate: optionalNumber(
      payload?.exchange_rate ?? payload?.shipping_rate_used
    ),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CLIPBOARD HELPER                                               */
/* ═══════════════════════════════════════════════════════════════ */

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback
  }

  try {
    if (typeof document === 'undefined') return false

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'

    document.body.appendChild(textarea)
    textarea.select()

    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)

    return ok
  } catch {
    return false
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
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

  const id = params?.id ? String(params.id) : ''

  const [mounted, setMounted] = useState(false)
  const [order, setOrder] = useState<NormalizedOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const [copiedGlobal, setCopiedGlobal] = useState(false)
  const [copiedArticleId, setCopiedArticleId] = useState<string | null>(
    null
  )
  const [showSecondary, setShowSecondary] = useState(true)

  const globalCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const articleCopyTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map())

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    return () => {
      if (globalCopyTimerRef.current) {
        clearTimeout(globalCopyTimerRef.current)
      }

      articleCopyTimersRef.current.forEach((timer) => clearTimeout(timer))
      articleCopyTimersRef.current.clear()
    }
  }, [])

  const currentRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  const rateLoading = Boolean(exchange?.loading)

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   *
   * Stratégie :
   * - priorité au taux courant via useExchangeRate()
   * - fallback temporaire sur order.exchange_rate si le taux courant n’est pas encore prêt
   * - aucun taux codé en dur
   */
  const effectiveRate = useMemo(() => {
    if (!mounted) return null

    return currentRate ?? order?.exchange_rate ?? null
  }, [currentRate, mounted, order?.exchange_rate])

  const rateNum = Number(effectiveRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  /* ---------------------------------------------------------- */
  /* Auth redirect                                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(
        `/login?redirect=${encodeURIComponent(
          `/profile/commandes/${id}`
        )}`
      )
    }
  }, [authLoading, id, router, user])

  /* ---------------------------------------------------------- */
  /* Chargement commande                                         */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (authLoading) return

    if (!user) return

    if (!id) {
      setError('Identifiant de commande manquant.')
      setLoading(false)
      return
    }

    let cancelled = false

    setLoading(true)
    setError('')

    fetch(`/api/commandes/${id}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(
            data?.error || 'Impossible de charger la commande.'
          )
        }

        if (!cancelled) {
          setOrder(normalizeOrder(data, id))
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(
            err?.message || 'Erreur lors du chargement de la commande.'
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, id, user])

  /* ---------------------------------------------------------- */
  /* Enrichissement USD / CDF                                    */
  /* ---------------------------------------------------------- */

  const enrichedOrder = useMemo<EnrichedOrder | null>(() => {
    if (!order) return null

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

      const unitDisplay = selectDisplay(unitPair, 'USD')
      const lineDisplay = selectDisplay(linePair, 'USD')

      return {
        ...article,
        unitPair,
        linePair,
        unitDisplay,
        lineDisplay,
        hasPrice: linePair.usd > 0 || linePair.cdf > 0,
      }
    })

    const computedSubtotalUsd = round2(
      articles.reduce((acc, article) => acc + article.linePair.usd, 0)
    )

    const computedSubtotalCdfFallback = roundCdf(
      articles.reduce((acc, article) => acc + article.linePair.cdf, 0)
    )

    const subtotalPair = resolvePricePair(
      firstPositive(order.subtotal_usd) || computedSubtotalUsd,
      firstPositive(order.subtotal_cdf) || computedSubtotalCdfFallback,
      effectiveRate
    )

    const discountRawPair = resolvePricePair(
      firstPositive(order.reduction_usd),
      firstPositive(order.reduction_cdf),
      effectiveRate
    )

    const discountPair = capPair(
      discountRawPair,
      subtotalPair,
      effectiveRate
    )

    const shippingPair = resolvePricePair(
      firstPositive(order.shipping_usd),
      firstPositive(order.shipping_cdf),
      effectiveRate
    )

    let totalPair = resolvePricePair(
      firstPositive(order.total_usd),
      firstPositive(
        order.total_cdf,
        order.total_global,
        order.total
      ),
      effectiveRate
    )

    if (totalPair.usd <= 0 && totalPair.cdf <= 0) {
      const computedUsd = round2(
        Math.max(
          0,
          subtotalPair.usd - discountPair.usd + shippingPair.usd
        )
      )

      const computedCdf =
        rateOk && computedUsd > 0
          ? roundCdf(toCdf(computedUsd, rateNum))
          : roundCdf(
              Math.max(
                0,
                subtotalPair.cdf -
                  discountPair.cdf +
                  shippingPair.cdf
              )
            )

      totalPair = {
        usd: computedUsd,
        cdf: computedCdf,
      }
    }

    if (rateOk && totalPair.usd > 0) {
      totalPair.cdf = roundCdf(toCdf(totalPair.usd, rateNum))
    } else if (
      rateOk &&
      totalPair.cdf > 0 &&
      totalPair.usd <= 0
    ) {
      totalPair.usd = round2(toUsd(totalPair.cdf, rateNum))
    }

    const totalDisplay = selectDisplay(totalPair, 'USD')

    const articleQuantity = articles.reduce(
      (acc, article) => acc + article.quantity,
      0
    )

    return {
      ...order,
      articles,
      subtotalPair,
      discountPair,
      shippingPair,
      totalPair,
      totalDisplay,
      articleQuantity,
    }
  }, [order, effectiveRate, rateNum, rateOk])

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleCancel = useCallback(async () => {
    if (!order) return

    if (
      !window.confirm(
        `Annuler la commande #${order.numero} ?`
      )
    ) {
      return
    }

    setActionLoading(true)

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

      if (data && (data.id || data.statut || data.numero)) {
        setOrder(normalizeOrder(data, order.id))
      } else {
        setOrder((prev) =>
          prev ? { ...prev, statut: 'annulee' } : prev
        )
      }

      addToast({
        type: 'success',
        message: `Commande #${order.numero} annulée`,
      })
    } catch (err: any) {
      addToast({
        type: 'error',
        message:
          err?.message || 'Échec de l’annulation.',
      })
    } finally {
      setActionLoading(false)
    }
  }, [addToast, order])

  const handleReturn = useCallback(async () => {
    if (!order) return

    if (
      !window.confirm(
        `Demander un retour pour #${order.numero} ?`
      )
    ) {
      return
    }

    setActionLoading(true)

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
        message: `Demande de retour envoyée pour #${order.numero}`,
      })
    } catch (err: any) {
      addToast({
        type: 'error',
        message:
          err?.message ||
          'Échec de la demande de retour.',
      })
    } finally {
      setActionLoading(false)
    }
  }, [addToast, order])

  const handleCopyCode = useCallback(
    async (code: string, context: 'global' | string) => {
      const ok = await copyToClipboard(code)

      if (!ok) {
        addToast({
          type: 'error',
          message: 'Copie impossible.',
        })

        return
      }

      if (context === 'global') {
        if (globalCopyTimerRef.current) {
          clearTimeout(globalCopyTimerRef.current)
        }

        setCopiedGlobal(true)

        globalCopyTimerRef.current = setTimeout(() => {
          setCopiedGlobal(false)
          globalCopyTimerRef.current = null
        }, 2_000)
      } else {
        const existing = articleCopyTimersRef.current.get(context)

        if (existing) {
          clearTimeout(existing)
        }

        setCopiedArticleId(context)

        const timer = setTimeout(() => {
          setCopiedArticleId((prev) =>
            prev === context ? null : prev
          )

          articleCopyTimersRef.current.delete(context)
        }, 2_000)

        articleCopyTimersRef.current.set(context, timer)
      }

      addToast({
        type: 'success',
        message: 'Code copié !',
      })
    },
    [addToast]
  )

  const handleDownloadInvoice = useCallback(() => {
    if (!enrichedOrder || typeof window === 'undefined') return

    try {
      const articleLines = enrichedOrder.articles.map((article) => {
        const spec = article.specifications
          ? ` (${article.specifications})`
          : ''

        return `${article.quantity} × ${article.nom}${spec} — ${formatPair(
          article.linePair
        )}`
      })

      const content = [
        'GERCIE — DÉTAIL DE COMMANDE',
        '============================',
        `Commande : ${enrichedOrder.numero}`,
        `Date : ${formatDate(enrichedOrder.date)}`,
        `Statut : ${getStatutConfig(enrichedOrder.statut).label}`,
        `Livraison : ${getDeliveryLabel(enrichedOrder.type_livraison)}`,
        enrichedOrder.payment_method
          ? `Paiement : ${enrichedOrder.payment_method}`
          : '',
        enrichedOrder.payment_reference
          ? `Référence : ${enrichedOrder.payment_reference}`
          : '',
        '',
        'ARTICLES',
        '--------',
        ...articleLines,
        '',
        'TOTAUX',
        '------',
        `Sous-total : ${formatPair(enrichedOrder.subtotalPair)}`,
        `Livraison : ${formatPair(enrichedOrder.shippingPair)}`,
        `Remise : - ${formatPair(enrichedOrder.discountPair)}`,
        `Total : ${formatPair(enrichedOrder.totalPair)}`,
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
      a.download = `facture-${enrichedOrder.numero}.txt`

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
  }, [addToast, effectiveRate, enrichedOrder])

  /* ---------------------------------------------------------- */
  /* Rendu loading                                               */
  /* ---------------------------------------------------------- */

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="space-y-4 text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2
            size={48}
            className="mx-auto animate-spin text-gold-500"
            aria-hidden="true"
          />

          <p className="text-sm text-muted-foreground">
            Chargement de la commande...
          </p>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu erreur                                                */
  /* ---------------------------------------------------------- */

  if (error) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <Container className="max-w-md">
          <Card variant="glass" className="border-red-500/30">
            <CardContent className="py-8 text-center">
              <AlertCircle
                size={48}
                className="mx-auto mb-4 text-red-500"
                aria-hidden="true"
              />

              <h2 className="mb-2 text-xl font-bold text-foreground">
                Erreur
              </h2>

              <p className="mb-6 text-muted-foreground">{error}</p>

              <Link href="/profile/commandes">
                <Button variant="luxe">
                  Voir mes commandes
                </Button>
              </Link>
            </CardContent>
          </Card>
        </Container>
      </div>
    )
  }

  if (!order || !enrichedOrder) return null

  /* ---------------------------------------------------------- */
  /* Valeurs dérivées                                            */
  /* ---------------------------------------------------------- */

  const statutCfg = getStatutConfig(enrichedOrder.statut)

  const isPayable = PAYABLE_STATUSES.has(enrichedOrder.statut)
  const isCancellable = CANCELLABLE_STATUSES.has(enrichedOrder.statut)
  const isReturnable = RETURNABLE_STATUSES.has(enrichedOrder.statut)

  const showGlobalCode =
    !!enrichedOrder.code_client &&
    CODE_VALID_STATUSES.has(enrichedOrder.statut)

  const deliveryMode = normalizeDeliveryMode(
    enrichedOrder.type_livraison
  )

  const deliveryLabel = getDeliveryLabel(
    enrichedOrder.type_livraison
  )

  const DeliveryIcon =
    deliveryMode === 'point_retrait'
      ? MapPin
      : deliveryMode === 'express'
        ? Zap
        : Truck

  const amountLabel = isPayable
    ? 'Montant à payer'
    : 'Montant total'

  const totalSecondary =
    showSecondary &&
    enrichedOrder.totalDisplay.secondaryAmount > 0 &&
    enrichedOrder.totalDisplay.secondaryAmount !==
      enrichedOrder.totalDisplay.primaryAmount

  const hasShipping =
    enrichedOrder.shippingPair.usd > 0 ||
    enrichedOrder.shippingPair.cdf > 0

  const hasDiscount =
    enrichedOrder.discountPair.usd > 0 ||
    enrichedOrder.discountPair.cdf > 0

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-background py-8">
      <Container className="max-w-3xl">
        <Link
          href="/profile/commandes"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-gold-500"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Retour à mes commandes
        </Link>

        <motion.div
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: 20 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.5,
          }}
        >
          {/* En-tête premium */}
          <Card className="mb-6 border-0 bg-gradient-to-r from-gold-600 to-burgundy-700 text-white shadow-strong">
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="font-serif text-2xl font-bold">
                    Commande #{enrichedOrder.numero}
                  </h1>

                  <p className="mt-1 flex items-center gap-2 text-sm text-white/80">
                    <Calendar size={14} aria-hidden="true" />
                    {formatDate(enrichedOrder.date)}
                  </p>

                  <Badge
                    variant={statutCfg.variant}
                    size="sm"
                    className="mt-3 border-white/20 bg-white/20 text-white backdrop-blur-sm"
                  >
                    {statutCfg.label}
                  </Badge>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-[11px] uppercase tracking-wider text-white/70">
                    {amountLabel}
                  </p>

                  <p className="mt-1 text-2xl font-extrabold">
                    {formatMoney(
                      enrichedOrder.totalDisplay.primaryAmount,
                      enrichedOrder.totalDisplay.primaryCurrency
                    )}
                  </p>

                  {totalSecondary && (
                    <p className="text-xs text-white/75">
                      ≈{' '}
                      {formatMoney(
                        enrichedOrder.totalDisplay.secondaryAmount,
                        enrichedOrder.totalDisplay.secondaryCurrency
                      )}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <TooltipWrapper
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
              </TooltipWrapper>

              {isPayable && (
                <Link
                  href={`/commande/paiement?id=${enrichedOrder.id}&currency=USD`}
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
                  onClick={handleCancel}
                  loading={actionLoading}
                  leftIcon={
                    <XCircle size={14} aria-hidden="true" />
                  }
                >
                  Annuler
                </Button>
              )}

              {isReturnable && (
                <Button
                  variant="outline-gold"
                  size="sm"
                  onClick={handleReturn}
                  loading={actionLoading}
                  leftIcon={
                    <RefreshCw size={14} aria-hidden="true" />
                  }
                >
                  Retour
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadInvoice}
                leftIcon={
                  <Download size={14} aria-hidden="true" />
                }
              >
                Facture
              </Button>
            </div>

            {/* Code de validation */}
            {showGlobalCode && (
              <Card
                variant="glass"
                className="border-l-4 border-l-gold-400"
              >
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="rounded-lg bg-gold-100 p-2 dark:bg-gold-900/30">
                      <Key
                        size={20}
                        className="text-gold-600 dark:text-gold-400"
                        aria-hidden="true"
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Code de validation
                      </p>

                      <p className="truncate font-mono text-xl font-bold tracking-widest text-gold-700 dark:text-gold-300">
                        {enrichedOrder.code_client}
                      </p>
                    </div>
                  </div>

                  <TooltipWrapper
                    content={
                      copiedGlobal ? 'Copié !' : 'Copier'
                    }
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gold-500"
                      onClick={() =>
                        void handleCopyCode(
                          enrichedOrder.code_client!,
                          'global'
                        )
                      }
                      aria-label="Copier le code de validation"
                    >
                      {copiedGlobal ? (
                        <CheckCircle
                          size={16}
                          className="text-green-500"
                          aria-hidden="true"
                        />
                      ) : (
                        <Copy size={16} aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipWrapper>
                </CardContent>
              </Card>
            )}

            {/* Livraison */}
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck
                    size={18}
                    className="text-gold-500"
                    aria-hidden="true"
                  />
                  Livraison
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DeliveryIcon
                    size={16}
                    className="text-gold-500"
                    aria-hidden="true"
                  />
                  <span>{deliveryLabel}</span>
                </div>

                {deliveryMode === 'point_retrait' &&
                enrichedOrder.point_retrait ? (
                  <div>
                    <p className="font-medium text-foreground">
                      {enrichedOrder.point_retrait.nom}
                    </p>

                    <p className="text-muted-foreground">
                      {enrichedOrder.point_retrait.adresse}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <MapPin
                      size={16}
                      className="mt-0.5 shrink-0 text-gold-500"
                      aria-hidden="true"
                    />

                    <span className="text-foreground">
                      {enrichedOrder.adresse_livraison ||
                        'Non renseignée'}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Paiement */}
            {(enrichedOrder.payment_method ||
              enrichedOrder.payment_reference) && (
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard
                      size={18}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    Paiement
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-2 text-sm">
                  {enrichedOrder.payment_method && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Méthode
                      </span>

                      <span className="capitalize text-foreground">
                        {enrichedOrder.payment_method}
                      </span>
                    </div>
                  )}

                  {enrichedOrder.payment_reference && (
                    <div className="flex justify-between gap-3">
                      <span className="shrink-0 text-muted-foreground">
                        Référence
                      </span>

                      <span className="truncate font-mono text-xs text-foreground">
                        {enrichedOrder.payment_reference}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Articles */}
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package
                    size={18}
                    className="text-gold-500"
                    aria-hidden="true"
                  />
                  Articles ({enrichedOrder.articleQuantity})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {enrichedOrder.articles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun article renseigné pour cette commande.
                  </p>
                ) : (
                  enrichedOrder.articles.map((article) => {
                    const badge = getCollecteBadge(article.status)

                    const showUnitSecondary =
                      showSecondary &&
                      article.unitDisplay.secondaryAmount > 0 &&
                      article.unitDisplay.secondaryAmount !==
                        article.unitDisplay.primaryAmount

                    const showLineSecondary =
                      showSecondary &&
                      article.lineDisplay.secondaryAmount > 0 &&
                      article.lineDisplay.secondaryAmount !==
                        article.lineDisplay.primaryAmount

                    return (
                      <div
                        key={article.id}
                        className="rounded-xl border border-gold-400/20 bg-background/50 p-4 backdrop-blur-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-medium text-foreground">
                              {article.nom}
                            </h4>

                            {article.specifications && (
                              <p className="mt-0.5 text-xs text-gold-600 dark:text-gold-400">
                                {article.specifications}
                              </p>
                            )}

                            <p className="mt-1 text-sm text-muted-foreground">
                              Quantité : {article.quantity}
                            </p>

                            {article.hasPrice && (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                <span className="font-semibold text-gold-600 dark:text-gold-400">
                                  Unité :{' '}
                                  {formatMoney(
                                    article.unitDisplay.primaryAmount,
                                    article.unitDisplay.primaryCurrency
                                  )}
                                </span>

                                {showUnitSecondary && (
                                  <span className="text-xs text-muted-foreground">
                                    ≈{' '}
                                    {formatMoney(
                                      article.unitDisplay.secondaryAmount,
                                      article.unitDisplay.secondaryCurrency
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <Badge
                            variant={badge.variant}
                            size="sm"
                            className="shrink-0"
                          >
                            {badge.icon && (
                              <span className="mr-1">{badge.icon}</span>
                            )}
                            {badge.label}
                          </Badge>
                        </div>

                        {article.motifRefus && (
                          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                            Motif : {article.motifRefus}
                          </div>
                        )}

                        {article.codeAcheteur && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gold-400/20 pt-3">
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">
                                Code produit
                              </p>

                              <code className="truncate font-mono text-lg font-bold text-gold-600 dark:text-gold-400">
                                {article.codeAcheteur}
                              </code>
                            </div>

                            <TooltipWrapper
                              content={
                                copiedArticleId === article.id
                                  ? 'Copié !'
                                  : 'Copier'
                              }
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-gold-500"
                                onClick={() =>
                                  void handleCopyCode(
                                    article.codeAcheteur!,
                                    article.id
                                  )
                                }
                                aria-label="Copier le code produit"
                              >
                                {copiedArticleId === article.id ? (
                                  <CheckCircle
                                    size={16}
                                    className="text-green-500"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Copy
                                    size={16}
                                    aria-hidden="true"
                                  />
                                )}
                              </Button>
                            </TooltipWrapper>
                          </div>
                        )}

                        {article.hasPrice && (
                          <div className="mt-3 text-right">
                            <p className="text-sm font-bold text-foreground">
                              {formatMoney(
                                article.lineDisplay.primaryAmount,
                                article.lineDisplay.primaryCurrency
                              )}
                            </p>

                            {showLineSecondary && (
                              <p className="text-[11px] text-muted-foreground">
                                ≈{' '}
                                {formatMoney(
                                  article.lineDisplay.secondaryAmount,
                                  article.lineDisplay.secondaryCurrency
                                )}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}

                {/* Totaux */}
                <div className="space-y-2 border-t border-gold-400/20 pt-4 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Sous-total</span>

                    <span>
                      {formatMoney(
                        selectDisplay(
                          enrichedOrder.subtotalPair,
                          'USD'
                        ).primaryAmount,
                        'USD'
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-muted-foreground">
                    <span>Livraison</span>

                    <span>
                      {hasShipping
                        ? formatMoney(
                            selectDisplay(
                              enrichedOrder.shippingPair,
                              'USD'
                            ).primaryAmount,
                            'USD'
                          )
                        : 'Incluse'}
                    </span>
                  </div>

                  {hasDiscount && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Remise</span>

                      <span>
                        -{' '}
                        {formatMoney(
                          selectDisplay(
                            enrichedOrder.discountPair,
                            'USD'
                          ).primaryAmount,
                          'USD'
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-end justify-between gap-3 border-t border-gold-400/20 pt-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Total
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Toutes taxes et frais inclus
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-gold-600">
                      {formatMoney(
                        enrichedOrder.totalDisplay.primaryAmount,
                        enrichedOrder.totalDisplay.primaryCurrency
                      )}
                    </p>

                    {totalSecondary && (
                      <p className="text-xs text-muted-foreground">
                        ≈{' '}
                        {formatMoney(
                          enrichedOrder.totalDisplay.secondaryAmount,
                          enrichedOrder.totalDisplay.secondaryCurrency
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Trust */}
            <Card variant="glass" className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-gold-500/10 p-2 text-gold-500">
                    <ShieldCheck
                      size={18}
                      aria-hidden="true"
                    />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Protection acheteur
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Remboursement garanti si article non conforme.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </Container>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TOOLTIP WRAPPER LÉGER                                          */
/* ═══════════════════════════════════════════════════════════════ */

function TooltipWrapper({
  content,
  children,
}: {
  content: string
  children: React.ReactNode
}) {
  return (
    <span className="group relative inline-flex">
      {children}

      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground shadow-card group-hover:block">
        {content}
      </span>
    </span>
  )
}