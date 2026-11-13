// app/commande/confirmation/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

import { motion, useReducedMotion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import confetti from 'canvas-confetti'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'

import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'

import { cn } from '@/lib/utils'

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  Gift,
  HelpCircle,
  Key,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  Users,
  XCircle,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

type OrderStatus =
  | 'en_attente'
  | 'payee'
  | 'collecte'
  | 'conditionnement_premium'
  | 'en_livraison'
  | 'livree'
  | 'annulee'
  | 'refusee'
  | 'rembourse'
  | 'retour_demande'

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

interface OrderArticle {
  nom: string
  quantite: number
  prix_unitaire?: number | null
  prix_unitaire_usd?: number | null
  specifications?: string | null
  image?: string | null
  statut?: ArticleStatus
  motif_refus?: string | null
}

interface OrderTimelineStep {
  id: string
  label: string
  description?: string
  timestamp?: string | null
  done: boolean
  active: boolean
}

interface OrderDetail {
  id: string
  numero: string
  statut: OrderStatus
  type_livraison: string
  created_at: string
  updated_at?: string
  delivered_at?: string | null

  total_usd?: number | null
  total_cdf?: number | null
  total_global?: number | null

  subtotal_usd?: number | null
  subtotal_cdf?: number | null
  sous_total?: number | null

  shipping_usd?: number | null
  shipping_cdf?: number | null
  frais_livraison?: number | null

  reduction_usd?: number | null
  reduction_cdf?: number | null
  reduction?: number | null

  exchange_rate?: number | null

  payment_method?: string | null
  payment_reference?: string | null

  adresse_livraison?: string | null
  commune_livraison?: string | null
  point_retrait?: { nom: string; adresse: string } | null

  code_client?: string | null
  code_livreur?: string | null

  articles: OrderArticle[]
  timeline?: OrderTimelineStep[]

  vendeur?: { boutique_nom: string; telephone?: string } | null
  message_cadeau?: string | null
}

interface ReviewPayload {
  commande_id: string
  note: number
  commentaire: string
  article_index?: number
}

interface ArticleLine {
  article: OrderArticle
  quantity: number
  unitPair: MoneyPair
  linePair: MoneyPair
}

interface ArticleView extends ArticleLine {
  lineDisplay: DisplayMoney
  unitDisplay: DisplayMoney
  hasPrice: boolean
}

interface TotalsView {
  subtotalPair: MoneyPair
  discountPair: MoneyPair
  shippingPair: MoneyPair
  totalPair: MoneyPair

  primarySubtotal: number
  secondarySubtotal: number

  primaryDiscount: number
  secondaryDiscount: number

  primaryShipping: number
  secondaryShipping: number

  primaryTotal: number
  secondaryTotal: number

  primaryCurrency: Currency
  secondaryCurrency: Currency

  hasUsd: boolean
  hasCdf: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PLACEHOLDER = '/placeholder.jpg'
const POLL_INTERVAL_ACTIVE = 30_000
const POLL_INTERVAL_DELIVERED = 120_000

const STEPS = [
  { id: 'cart', label: 'Panier', icon: ShoppingBag },
  { id: 'checkout', label: 'Commande', icon: MapPin },
  { id: 'payment', label: 'Paiement', icon: CreditCard },
  { id: 'confirmation', label: 'Confirmation', icon: CheckCircle2 },
] as const

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string
    variant: 'accent' | 'gold' | 'warm' | 'danger' | 'neutral'
    icon: React.ReactNode
    description: string
  }
> = {
  en_attente: {
    label: 'En attente de paiement',
    variant: 'warm',
    icon: <Clock size={14} aria-hidden="true" />,
    description:
      'Votre commande est réservée. Finalisez le paiement pour la valider.',
  },
  payee: {
    label: 'Paiement confirmé',
    variant: 'accent',
    icon: <CheckCircle2 size={14} aria-hidden="true" />,
    description: 'Paiement reçu. Préparation en cours.',
  },
  collecte: {
    label: 'En collecte',
    variant: 'accent',
    icon: <Package size={14} aria-hidden="true" />,
    description: 'Vos articles sont récupérés chez les vendeurs.',
  },
  conditionnement_premium: {
    label: 'Conditionnement premium',
    variant: 'gold',
    icon: <Gift size={14} aria-hidden="true" />,
    description: 'Emballage soigné et contrôle qualité en cours.',
  },
  en_livraison: {
    label: 'En livraison',
    variant: 'accent',
    icon: <Truck size={14} aria-hidden="true" />,
    description: 'Le livreur est en route vers votre adresse.',
  },
  livree: {
    label: 'Livrée',
    variant: 'gold',
    icon: <CheckCircle size={14} aria-hidden="true" />,
    description: 'Commande livrée avec succès. Merci pour votre confiance !',
  },
  annulee: {
    label: 'Annulée',
    variant: 'danger',
    icon: <XCircle size={14} aria-hidden="true" />,
    description: 'Cette commande a été annulée.',
  },
  refusee: {
    label: 'Refusée',
    variant: 'danger',
    icon: <XCircle size={14} aria-hidden="true" />,
    description: 'Un ou plusieurs articles ont été refusés à la livraison.',
  },
  rembourse: {
    label: 'Remboursée',
    variant: 'neutral',
    icon: <RotateCcw size={14} aria-hidden="true" />,
    description: 'Le remboursement a été effectué.',
  },
  retour_demande: {
    label: 'Retour demandé',
    variant: 'warm',
    icon: <RotateCcw size={14} aria-hidden="true" />,
    description: 'Votre demande de retour est en cours de traitement.',
  },
}

const TIMELINE_STEPS: {
  id: OrderStatus
  label: string
  description: string
  icon: React.ReactNode
}[] = [
  {
    id: 'payee',
    label: 'Paiement validé',
    description: 'Transaction confirmée',
    icon: <CreditCard size={16} aria-hidden="true" />,
  },
  {
    id: 'collecte',
    label: 'Collecte',
    description: 'Récupération des articles',
    icon: <Package size={16} aria-hidden="true" />,
  },
  {
    id: 'conditionnement_premium',
    label: 'Conditionnement',
    description: 'Emballage premium',
    icon: <Gift size={16} aria-hidden="true" />,
  },
  {
    id: 'en_livraison',
    label: 'En livraison',
    description: 'En route chez vous',
    icon: <Truck size={16} aria-hidden="true" />,
  },
  {
    id: 'livree',
    label: 'Livrée',
    description: 'Commande reçue',
    icon: <CheckCircle size={16} aria-hidden="true" />,
  },
]

const ARTICLE_STATUS_CONFIG: Record<
  ArticleStatus,
  {
    variant: 'accent' | 'danger' | 'neutral'
    icon: React.ReactNode
    label: string
  }
> = {
  ok: {
    variant: 'accent',
    icon: <CheckCircle2 size={14} aria-hidden="true" />,
    label: 'Accepté',
  },
  refuse: {
    variant: 'danger',
    icon: <XCircle size={14} aria-hidden="true" />,
    label: 'Indésirable',
  },
  pending: {
    variant: 'neutral',
    icon: <Clock size={14} aria-hidden="true" />,
    label: 'Vérification',
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS NUMÉRIQUES                                             */
/* ═══════════════════════════════════════════════════════════════ */

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined

  const n = Number(value)

  return Number.isFinite(n) ? n : undefined
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

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
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function formatRelativeTime(value?: string | null): string {
  if (!value) return ''

  try {
    const diff = Date.now() - new Date(value).getTime()
    const minutes = Math.floor(diff / 60_000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'à l’instant'
    if (minutes < 60) return `il y a ${minutes} min`
    if (hours < 24) return `il y a ${hours} h`
    if (days < 7) return `il y a ${days} j`

    return formatDate(value)
  } catch {
    return ''
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
/*  RÉSOLUTION USD / CDF                                           */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Règle absolue :
 * - Si USD existe → USD = vérité.
 *   CDF = USD × taux courant.
 *   Le CDF stocké n’est conservé que comme fallback temporaire si le taux n’est pas encore disponible.
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
/*  NORMALISATION COMMANDE                                         */
/* ═══════════════════════════════════════════════════════════════ */

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

function normalizeArticleStatus(value: any): ArticleStatus {
  const raw = String(value || '')
    .trim()
    .toLowerCase()

  if (raw === 'ok' || raw === 'accepte' || raw === 'accepted') return 'ok'
  if (raw === 'refuse' || raw === 'rejected' || raw === 'refusé') return 'refuse'

  return 'pending'
}

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

function getArticleImage(raw: any): string | null {
  if (typeof raw?.image === 'string' && raw.image.trim()) {
    return raw.image
  }

  if (Array.isArray(raw?.images) && raw.images.length > 0) {
    const first = raw.images[0]

    if (typeof first === 'string' && first.trim()) return first
  }

  if (typeof raw?.produits?.images === 'string' && raw.produits.images.trim()) {
    return raw.produits.images
  }

  if (
    Array.isArray(raw?.produits?.images) &&
    raw.produits.images.length > 0
  ) {
    const first = raw.produits.images[0]

    if (typeof first === 'string' && first.trim()) return first
  }

  if (typeof raw?.product?.images === 'string' && raw.product.images.trim()) {
    return raw.product.images
  }

  if (
    Array.isArray(raw?.product?.images) &&
    raw.product.images.length > 0
  ) {
    const first = raw.product.images[0]

    if (typeof first === 'string' && first.trim()) return first
  }

  return null
}

function normalizeOrderArticle(raw: any): OrderArticle {
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

    quantite: Math.max(
      1,
      Math.floor(Number(raw?.quantite ?? raw?.quantity ?? 1) || 1)
    ),

    prix_unitaire: optionalNumber(
      raw?.prix_unitaire ??
        raw?.prix_cdf ??
        raw?.price_cdf ??
        raw?.prix ??
        raw?.price
    ),

    prix_unitaire_usd: optionalNumber(
      raw?.prix_unitaire_usd ??
        raw?.unit_price_usd ??
        raw?.prix_usd ??
        raw?.price_usd
    ),

    specifications:
      raw?.specifications ||
      variantLabelFromAttributes(attrs) ||
      (typeof raw?.variante === 'string' ? raw.variante : null) ||
      null,

    image: getArticleImage(raw),

    statut: normalizeArticleStatus(raw?.statut ?? raw?.status),

    motif_refus:
      raw?.motif_refus ||
      raw?.refusal_reason ||
      raw?.refuse_motif ||
      null,
  }
}

function normalizeOrderDetail(raw: any, fallbackId: string): OrderDetail {
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
      payload?.numero_commande ||
        payload?.numero ||
        fallbackId.slice(0, 8)
    ),

    statut: String(
      payload?.statut || payload?.status || 'en_attente'
    ).toLowerCase() as OrderStatus,

    type_livraison: normalizeDeliveryMode(
      payload?.type_livraison || payload?.shipping_method
    ),

    created_at:
      payload?.created_at ||
      payload?.date ||
      new Date().toISOString(),

    updated_at: payload?.updated_at,
    delivered_at: payload?.delivered_at ?? null,

    total_usd: optionalNumber(payload?.total_usd ?? payload?.totalUSD),
    total_cdf: optionalNumber(
      payload?.total_cdf ??
        payload?.totalCDF ??
        payload?.total_global ??
        payload?.total
    ),
    total_global: optionalNumber(payload?.total_global ?? payload?.total),

    subtotal_usd: optionalNumber(
      payload?.subtotal_usd ??
        payload?.subtotalUSD ??
        payload?.sous_total_usd
    ),
    subtotal_cdf: optionalNumber(
      payload?.subtotal_cdf ??
        payload?.subtotalCDF ??
        payload?.sous_total ??
        payload?.subtotal
    ),
    sous_total: optionalNumber(payload?.sous_total ?? payload?.subtotal),

    shipping_usd: optionalNumber(
      payload?.shipping_usd ?? payload?.frais_livraison_usd
    ),
    shipping_cdf: optionalNumber(
      payload?.shipping_cdf ?? payload?.frais_livraison
    ),
    frais_livraison: optionalNumber(payload?.frais_livraison),

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
    reduction: optionalNumber(payload?.reduction ?? payload?.discount),

    exchange_rate: optionalNumber(
      payload?.exchange_rate ??
        payload?.shipping_rate_used ??
        payload?.rate
    ),

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

    adresse_livraison:
      payload?.adresse_livraison || payload?.address || null,

    commune_livraison:
      payload?.commune_livraison || payload?.commune || null,

    point_retrait:
      pointRetrait && pointRetrait.nom
        ? {
            nom: String(pointRetrait.nom),
            adresse: String(pointRetrait.adresse || ''),
          }
        : null,

    code_client: payload?.code_client || payload?.client_code || null,
    code_livreur: payload?.code_livreur || payload?.driver_code || null,

    articles: articlesSource.map(normalizeOrderArticle),

    timeline: Array.isArray(payload?.timeline)
      ? payload.timeline.map((step: any) => ({
          id: String(step?.id || ''),
          label: String(step?.label || ''),
          description: step?.description ?? undefined,
          timestamp: step?.timestamp ?? null,
          done: Boolean(step?.done),
          active: Boolean(step?.active),
        }))
      : undefined,

    vendeur:
      payload?.vendeur ||
      payload?.seller ||
      (payload?.boutique_nom
        ? {
            boutique_nom: String(payload.boutique_nom),
            telephone: payload?.boutique_telephone ?? undefined,
          }
        : null),

    message_cadeau:
      payload?.message_cadeau || payload?.gift_message || null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATUS HELPERS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function getStatusConfig(status: OrderStatus) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.en_attente
}

function getTimelineForStatus(
  status: OrderStatus,
  custom?: OrderTimelineStep[]
): OrderTimelineStep[] {
  if (custom && custom.length > 0) {
    return custom
  }

  const order = TIMELINE_STEPS.map((s) => s.id)
  const currentIndex = order.indexOf(status)

  return TIMELINE_STEPS.map((step, idx) => ({
    id: step.id,
    label: step.label,
    description: step.description,
    done: currentIndex >= 0 && idx <= currentIndex,
    active: currentIndex === idx,
    timestamp: null,
  }))
}

function isDeliveredStatus(status: OrderStatus): boolean {
  return status === 'livree'
}

function isFinalStatus(status: OrderStatus): boolean {
  return (
    status === 'livree' ||
    status === 'annulee' ||
    status === 'refusee' ||
    status === 'rembourse'
  )
}

function canCancel(status: OrderStatus): boolean {
  return status === 'en_attente' || status === 'payee' || status === 'collecte'
}

function canReturn(status: OrderStatus): boolean {
  return status === 'livree'
}

function canReview(status: OrderStatus): boolean {
  return status === 'livree'
}

function canPay(status: OrderStatus): boolean {
  return status === 'en_attente'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UTILITAIRES UI                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function triggerConfetti(duration = 3000) {
  if (typeof window === 'undefined') return

  try {
    const end = Date.now() + duration
    const colors = ['#FFD700', '#FFA500', '#FF6347', '#32CD32', '#1E90FF']

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      })

      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }

    frame()
  } catch {
    // silencieux
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()

    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)

    return ok
  } catch {
    return false
  }
}

function buildShareUrl(order: OrderDetail): string {
  if (typeof window === 'undefined') return ''

  return `${window.location.origin}/commande/confirmation?id=${order.id}`
}

function buildShareText(order: OrderDetail): string {
  return `J'ai passé une commande sur Gercie (n° ${order.numero}). Découvrez la boutique !`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SOUS-COMPOSANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function Stepper({ currentStep }: { currentStep: string }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
  const prefersReduced = useReducedMotion()

  return (
    <div className="mb-8">
      <div className="scrollbar-hide flex items-center justify-between gap-2 overflow-x-auto pb-2">
        {STEPS.map((step, idx) => {
          const Icon = step.icon
          const isActive = step.id === currentStep
          const isCompleted = idx < currentIndex

          return (
            <motion.div
              key={step.id}
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                'flex min-w-[110px] flex-1 flex-col items-center gap-2 rounded-2xl border px-3 py-3 text-center transition',
                isActive
                  ? 'border-gold-400/40 bg-gold-500/10 text-gold-700 dark:text-gold-300'
                  : isCompleted
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                    : 'border-border bg-card text-muted-foreground'
              )}
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full',
                  isActive
                    ? 'bg-gold-500 text-white'
                    : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 size={16} aria-hidden="true" />
                ) : (
                  <Icon size={16} aria-hidden="true" />
                )}
              </span>

              <span className="text-xs font-medium sm:text-sm">
                {step.label}
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function StatusBanner({
  order,
  totals,
  onPrint,
  onDownload,
  onShare,
}: {
  order: OrderDetail
  totals: TotalsView
  onPrint: () => void
  onDownload: () => void
  onShare: () => void
}) {
  const config = getStatusConfig(order.statut)
  const prefersReduced = useReducedMotion()

  const amountLabel =
    order.statut === 'en_attente' ? 'Montant à payer' : 'Montant payé'

  const paymentLabel =
    order.payment_method ||
    (order.statut === 'en_attente' ? 'À finaliser' : 'Mobile Money')

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative mb-8 overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-gold-600 via-gold-500 to-burgundy-700 text-white shadow-strong"
    >
      <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

      <div className="relative p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="neutral"
                size="sm"
                className="bg-white/20 text-white"
              >
                {config.icon}
                <span className="ml-1">{config.label}</span>
              </Badge>

              <span className="text-xs opacity-80">
                Commande #{order.numero}
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-extrabold md:text-3xl">
              Merci pour votre commande !
            </h1>

            <p className="mt-2 max-w-xl text-sm opacity-90">
              {config.description}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-wider opacity-75">
                  {amountLabel}
                </p>

                <p className="mt-1 text-lg font-bold">
                  {formatMoney(
                    totals.primaryTotal,
                    totals.primaryCurrency
                  )}
                </p>

                {totals.secondaryTotal > 0 &&
                  totals.secondaryTotal !== totals.primaryTotal && (
                    <p className="text-[11px] opacity-75">
                      ≈{' '}
                      {formatMoney(
                        totals.secondaryTotal,
                        totals.secondaryCurrency
                      )}
                    </p>
                  )}
              </div>

              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-wider opacity-75">
                  Date
                </p>

                <p className="mt-1 text-sm font-semibold">
                  {formatDate(order.created_at)}
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-wider opacity-75">
                  Paiement
                </p>

                <p className="mt-1 text-sm font-semibold capitalize">
                  {paymentLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 md:min-w-[180px]">
            <Button
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={onPrint}
              leftIcon={<Printer size={14} aria-hidden="true" />}
            >
              Imprimer
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={onDownload}
              leftIcon={<Download size={14} aria-hidden="true" />}
            >
              Facture
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={onShare}
              leftIcon={<Share2 size={14} aria-hidden="true" />}
            >
              Partager
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function Timeline({
  steps,
  status,
}: {
  steps: OrderTimelineStep[]
  status: OrderStatus
}) {
  const prefersReduced = useReducedMotion()

  return (
    <Card variant="glass" className="border-gold-400/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock size={18} className="text-gold-500" aria-hidden="true" />
          Progression de la commande
        </CardTitle>

        <CardDescription>
          Suivi en temps réel de votre colis
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ol className="relative space-y-6 border-l-2 border-gold-400/20 pl-6">
          {steps.map((step, idx) => {
            const stepConfig = TIMELINE_STEPS.find((s) => s.id === step.id)
            const Icon = stepConfig?.icon || (
              <Package size={16} aria-hidden="true" />
            )

            return (
              <motion.li
                key={step.id}
                initial={prefersReduced ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                className="relative"
              >
                <span
                  className={cn(
                    'absolute -left-[34px] flex h-6 w-6 items-center justify-center rounded-full border-2 transition',
                    step.done
                      ? 'border-gold-500 bg-gold-500 text-white'
                      : step.active
                        ? 'animate-pulse border-gold-500 bg-background text-gold-500'
                        : 'border-border bg-background text-muted-foreground'
                  )}
                >
                  {step.done ? (
                    <CheckCircle2 size={14} aria-hidden="true" />
                  ) : (
                    Icon
                  )}
                </span>

                <div className="pb-2">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      step.done || step.active
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </p>

                  {step.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  )}

                  {step.timestamp && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(step.timestamp)} •{' '}
                      {formatRelativeTime(step.timestamp)}
                    </p>
                  )}
                </div>
              </motion.li>
            )
          })}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gold-400/10 pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Truck size={12} className="text-gold-500" aria-hidden="true" />
            <span>Traçabilité de flotte intégrée</span>
          </div>

          <div className="flex items-center gap-1.5">
            <ShieldCheck
              size={12}
              className="text-gold-500"
              aria-hidden="true"
            />
            <span>Garantie protection acheteur RDC</span>
          </div>

          {status === 'en_livraison' && (
            <div className="flex items-center gap-1.5 text-gold-600">
              <Zap size={12} aria-hidden="true" />
              <span>Livreur en route</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CodeValidationCard({
  order,
  onCopy,
  copied,
  onShowQr,
}: {
  order: OrderDetail
  onCopy: (code: string, id: string) => void
  copied: string | null
  onShowQr: (code: string, label: string) => void
}) {
  if (!order.code_client && !order.code_livreur) return null

  return (
    <Card variant="glass" className="border-gold-400/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Key size={18} className="text-gold-500" aria-hidden="true" />
          Codes de validation
        </CardTitle>

        <CardDescription>
          Communiquez ces codes au livreur pour confirmer la réception.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {order.code_client && (
          <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Code client (à donner au livreur)
                </p>

                <p className="mt-1 truncate font-mono text-2xl font-bold tracking-widest text-gold-600 dark:text-gold-400">
                  {order.code_client}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Tooltip
                  content={copied === 'client' ? 'Copié !' : 'Copier'}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-gold-500 hover:bg-gold-500/5"
                    onClick={() => onCopy(order.code_client!, 'client')}
                    aria-label="Copier le code client"
                  >
                    {copied === 'client' ? (
                      <CheckCircle
                        size={18}
                        className="text-green-500"
                        aria-hidden="true"
                      />
                    ) : (
                      <Copy size={18} aria-hidden="true" />
                    )}
                  </Button>
                </Tooltip>

                <Tooltip content="QR code">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-gold-500 hover:bg-gold-500/5"
                    onClick={() => onShowQr(order.code_client!, 'Client')}
                    aria-label="Afficher QR code"
                  >
                    <QrCode size={18} aria-hidden="true" />
                  </Button>
                </Tooltip>
              </div>
            </div>
          </div>
        )}

        {order.code_livreur && (
          <div className="rounded-2xl border border-border bg-background/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Code livreur (interne)
            </p>

            <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">
              {order.code_livreur}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ArticlesCard({
  articles,
  totals,
}: {
  articles: ArticleView[]
  totals: TotalsView
}) {
  const hasShipping =
    totals.shippingPair.usd > 0 || totals.shippingPair.cdf > 0

  const hasDiscount =
    totals.discountPair.usd > 0 || totals.discountPair.cdf > 0

  return (
    <Card variant="glass" className="border-gold-400/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package size={18} className="text-gold-500" aria-hidden="true" />
          Articles de la commande
        </CardTitle>

        <CardDescription>
          {articles.length} article{articles.length > 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {articles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun article renseigné pour cette commande.
          </p>
        ) : (
          articles.map((view, idx) => {
            const article = view.article
            const statusCfg =
              ARTICLE_STATUS_CONFIG[article.statut || 'pending']

            return (
              <motion.div
                key={`${article.nom}-${idx}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="flex items-start gap-3 rounded-2xl border border-border bg-background/50 p-3"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                  <Image
                    src={article.image || PLACEHOLDER}
                    alt={article.nom}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">
                    {article.nom}
                  </p>

                  {article.specifications && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {article.specifications}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={statusCfg.variant} size="sm">
                      <span className="mr-1">{statusCfg.icon}</span>
                      {statusCfg.label}
                    </Badge>

                    <span className="text-xs text-muted-foreground">
                      Qté : {view.quantity}
                    </span>

                    {view.hasPrice && (
                      <span className="text-xs text-muted-foreground">
                        Unité :{' '}
                        {formatMoney(
                          view.unitDisplay.primaryAmount,
                          view.unitDisplay.primaryCurrency
                        )}
                      </span>
                    )}
                  </div>

                  {article.statut === 'refuse' && article.motif_refus && (
                    <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                      Motif : {article.motif_refus}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-gold-600">
                    {view.hasPrice
                      ? formatMoney(
                          view.lineDisplay.primaryAmount,
                          view.lineDisplay.primaryCurrency
                        )
                      : '—'}
                  </p>

                  {view.hasPrice &&
                    view.lineDisplay.secondaryAmount > 0 &&
                    view.lineDisplay.secondaryAmount !==
                      view.lineDisplay.primaryAmount && (
                      <p className="text-[11px] text-muted-foreground">
                        ≈{' '}
                        {formatMoney(
                          view.lineDisplay.secondaryAmount,
                          view.lineDisplay.secondaryCurrency
                        )}
                      </p>
                    )}
                </div>
              </motion.div>
            )
          })
        )}

        <div className="space-y-2 border-t border-gold-400/20 pt-4 text-sm">
          {(totals.subtotalPair.usd > 0 ||
            totals.subtotalPair.cdf > 0) && (
            <div className="flex justify-between text-muted-foreground">
              <span>Sous-total</span>

              <span>
                {formatMoney(
                  totals.primarySubtotal,
                  totals.primaryCurrency
                )}
              </span>
            </div>
          )}

          {hasShipping && (
            <div className="flex justify-between text-muted-foreground">
              <span>Livraison</span>

              <span>
                {formatMoney(
                  totals.primaryShipping,
                  totals.primaryCurrency
                )}
              </span>
            </div>
          )}

          {!hasShipping && (
            <div className="flex justify-between text-muted-foreground">
              <span>Livraison</span>
              <span>Incluse</span>
            </div>
          )}

          {hasDiscount && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Remise</span>

              <span>
                -{' '}
                {formatMoney(
                  totals.primaryDiscount,
                  totals.primaryCurrency
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 border-t border-gold-400/20 pt-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Total facturé
            </p>

            <p className="text-xs text-muted-foreground">
              Toutes taxes et frais inclus
            </p>
          </div>

          <div className="text-right">
            <p className="font-serif text-2xl font-bold text-gold-500">
              {formatMoney(totals.primaryTotal, totals.primaryCurrency)}
            </p>

            {totals.secondaryTotal > 0 &&
              totals.secondaryTotal !== totals.primaryTotal && (
                <p className="text-xs text-muted-foreground">
                  ≈{' '}
                  {formatMoney(
                    totals.secondaryTotal,
                    totals.secondaryCurrency
                  )}
                </p>
              )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DeliveryCard({ order }: { order: OrderDetail }) {
  return (
    <Card variant="glass" className="border-gold-400/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin size={18} className="text-gold-500" aria-hidden="true" />
          Livraison
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted-foreground">Mode</span>

          <span className="font-medium text-foreground capitalize">
            {order.type_livraison?.replace('_', ' ') || 'Domicile'}
          </span>
        </div>

        {order.adresse_livraison && (
          <div>
            <p className="text-xs text-muted-foreground">Adresse</p>

            <p className="mt-1 text-sm text-foreground">
              {order.adresse_livraison}
            </p>

            {order.commune_livraison && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {order.commune_livraison}
              </p>
            )}
          </div>
        )}

        {order.point_retrait && (
          <div>
            <p className="text-xs text-muted-foreground">Point de retrait</p>

            <p className="mt-1 text-sm font-medium text-foreground">
              {order.point_retrait.nom}
            </p>

            <p className="text-xs text-muted-foreground">
              {order.point_retrait.adresse}
            </p>
          </div>
        )}

        {order.message_cadeau && (
          <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-gold-700 dark:text-gold-300">
              <Gift size={12} aria-hidden="true" />
              Message cadeau
            </p>

            <p className="mt-1 text-sm italic text-foreground">
              « {order.message_cadeau} »
            </p>
          </div>
        )}

        {order.vendeur && (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Vendeur</p>

            <p className="mt-1 text-sm font-medium text-foreground">
              {order.vendeur.boutique_nom}
            </p>

            {order.vendeur.telephone && (
              <a
                href={`tel:${order.vendeur.telephone}`}
                className="mt-1 inline-flex items-center gap-1 text-xs text-gold-600 hover:underline"
              >
                <MessageCircle size={12} aria-hidden="true" />
                Appeler le vendeur
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReviewModal({
  open,
  onClose,
  onSubmit,
  submitting,
  order,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: ReviewPayload) => void
  submitting: boolean
  order: OrderDetail
}) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [hovered, setHovered] = useState(0)

  const handleSubmit = () => {
    if (!comment.trim()) return

    onSubmit({
      commande_id: order.id,
      note: rating,
      commentaire: comment.trim(),
    })

    setComment('')
    setRating(5)
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Laisser un avis"
      description="Partagez votre expérience avec cette commande."
      size="md"
      accent="gold"
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Annuler
          </Button>

          <Button
            variant="luxe"
            onClick={handleSubmit}
            disabled={submitting || !comment.trim()}
            leftIcon={
              submitting ? (
                <Loader2
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send size={14} aria-hidden="true" />
              )
            }
          >
            Publier
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            Votre note
          </p>

          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="rounded p-1 transition focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label={`Note ${star} sur 5`}
              >
                <Star
                  size={28}
                  className={cn(
                    'transition',
                    (hovered || rating) >= star
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-neutral-300'
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}

            <span className="ml-2 text-sm font-medium text-foreground">
              {rating}/5
            </span>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Commentaire
          </span>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Décrivez votre expérience : qualité, livraison, service..."
            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          />

          <span className="block text-right text-xs text-muted-foreground">
            {comment.length}/500
          </span>
        </label>
      </div>
    </Modal>
  )
}

function QrCodeModal({
  open,
  onClose,
  code,
  label,
}: {
  open: boolean
  onClose: () => void
  code: string
  label: string
}) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(code)}`

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`QR Code — ${label}`}
      description="Scannez ce code pour valider la réception."
      size="sm"
      accent="gold"
    >
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="rounded-2xl border border-gold-400/30 bg-white p-4 shadow-gold">
          <img
            src={qrUrl}
            alt={`QR code ${label}`}
            className="h-48 w-48 rounded-lg bg-white"
            loading="lazy"
          />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Code :{' '}
          <span className="font-mono font-bold text-foreground">{code}</span>
        </p>
      </div>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                */
/* ═══════════════════════════════════════════════════════════════ */

export default function ConfirmationPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const toast = useToast() as any

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const queryClient = useQueryClient()
  const prefersReduced = useReducedMotion()

  const { user, loading: authLoading } = useAuth()
  const cart = useCart() as any
  const clearCart = cart?.clearCart

  const exchange = useExchangeRate() as any

  const onlineStatus = useOnlineStatus() as any
  const isOnline =
    typeof onlineStatus === 'boolean'
      ? onlineStatus
      : Boolean(
          onlineStatus?.online ??
            onlineStatus?.isOnline ??
            onlineStatus
        )

  const commandeId = searchParams.get('id') || ''

  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showReturnModal, setShowReturnModal] = useState(false)

  const [qrModal, setQrModal] = useState<{
    open: boolean
    code: string
    label: string
  }>({
    open: false,
    code: '',
    label: '',
  })

  const isCartCleared = useRef(false)
  const confettiFired = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  const rateLoading = Boolean(exchange?.loading)

  /* ---------------------------------------------------------- */
  /* Chargement commande                                         */
  /* ---------------------------------------------------------- */

  const {
    data: order,
    isLoading: loading,
    error,
    refetch,
    isFetching,
  } = useQuery<OrderDetail>({
    queryKey: ['commande', commandeId],
    queryFn: async () => {
      if (!commandeId) {
        throw new Error('Aucun identifiant de commande.')
      }

      const res = await fetch(`/api/commandes/${commandeId}`, {
        credentials: 'include',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          data?.error || 'Impossible de charger la commande.'
        )
      }

      return normalizeOrderDetail(data, commandeId)
    },
    enabled: !!commandeId && !!user,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const status = query.state.data?.statut

      if (!status) return false
      if (isFinalStatus(status)) return POLL_INTERVAL_DELIVERED

      return POLL_INTERVAL_ACTIVE
    },
    refetchIntervalInBackground: false,
    retry: 1,
  })

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   *
   * Stratégie :
   * - priorité au taux courant via useExchangeRate()
   * - fallback temporaire sur order.exchange_rate si le taux courant n’est pas encore prêt
   * - aucun taux codé en dur
   */
  const conversionRate = useMemo(() => {
    if (!mounted) return null

    return currentRate ?? order?.exchange_rate ?? null
  }, [currentRate, mounted, order?.exchange_rate])

  const rateNum = Number(conversionRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  /* ---------------------------------------------------------- */
  /* Articles alignés USD / CDF                                  */
  /* ---------------------------------------------------------- */

  const articleLines = useMemo<ArticleLine[]>(() => {
    if (!order?.articles) return []

    return order.articles.map((article) => {
      const quantity = Math.max(
        1,
        Math.floor(Number(article.quantite) || 1)
      )

      const unitPair = resolvePricePair(
        positiveNumber(article.prix_unitaire_usd) ?? 0,
        positiveNumber(article.prix_unitaire) ?? 0,
        conversionRate
      )

      const linePair: MoneyPair = {
        usd: round2(unitPair.usd * quantity),
        cdf: roundCdf(unitPair.cdf * quantity),
      }

      return {
        article,
        quantity,
        unitPair,
        linePair,
      }
    })
  }, [conversionRate, order?.articles])

  /* ---------------------------------------------------------- */
  /* Totaux alignés                                              */
  /* ---------------------------------------------------------- */

  const totals = useMemo<TotalsView>(() => {
    const computedSubtotalUsd = round2(
      articleLines.reduce((acc, line) => acc + line.linePair.usd, 0)
    )

    const computedSubtotalCdf = roundCdf(
      articleLines.reduce((acc, line) => acc + line.linePair.cdf, 0)
    )

    const orderSubtotalUsd = firstPositive(
      order?.subtotal_usd,
      (order as any)?.subtotalUSD,
      (order as any)?.sous_total_usd
    )

    const orderSubtotalCdf = firstPositive(
      order?.subtotal_cdf,
      (order as any)?.subtotalCDF,
      order?.sous_total,
      (order as any)?.subtotal
    )

    const subtotalPair = resolvePricePair(
      orderSubtotalUsd > 0 ? orderSubtotalUsd : computedSubtotalUsd,
      orderSubtotalCdf > 0 ? orderSubtotalCdf : computedSubtotalCdf,
      conversionRate
    )

    const discountRawPair = resolvePricePair(
      firstPositive(
        order?.reduction_usd,
        (order as any)?.remise_usd,
        (order as any)?.discount_usd
      ),
      firstPositive(
        order?.reduction_cdf,
        (order as any)?.remise_cdf,
        order?.reduction,
        (order as any)?.discount
      ),
      conversionRate
    )

    const discountPair = capPair(
      discountRawPair,
      subtotalPair,
      conversionRate
    )

    const shippingPair = resolvePricePair(
      firstPositive(
        order?.shipping_usd,
        (order as any)?.frais_livraison_usd
      ),
      firstPositive(
        order?.shipping_cdf,
        order?.frais_livraison
      ),
      conversionRate
    )

    let totalPair = resolvePricePair(
      firstPositive(order?.total_usd, (order as any)?.totalUSD),
      firstPositive(
        order?.total_cdf,
        (order as any)?.totalCDF,
        order?.total_global,
        (order as any)?.total
      ),
      conversionRate
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

    const hasUsd =
      subtotalPair.usd > 0 ||
      discountPair.usd > 0 ||
      shippingPair.usd > 0 ||
      totalPair.usd > 0

    const hasCdf =
      subtotalPair.cdf > 0 ||
      discountPair.cdf > 0 ||
      shippingPair.cdf > 0 ||
      totalPair.cdf > 0

    const primaryCurrency: Currency = hasUsd
      ? 'USD'
      : hasCdf
        ? 'CDF'
        : 'USD'

    const secondaryCurrency: Currency =
      primaryCurrency === 'USD' ? 'CDF' : 'USD'

    const subtotalDisplay = selectDisplay(
      subtotalPair,
      primaryCurrency
    )

    const discountDisplay = selectDisplay(
      discountPair,
      primaryCurrency
    )

    const shippingDisplay = selectDisplay(
      shippingPair,
      primaryCurrency
    )

    const totalDisplay = selectDisplay(
      totalPair,
      primaryCurrency
    )

    return {
      subtotalPair,
      discountPair,
      shippingPair,
      totalPair,

      primarySubtotal: subtotalDisplay.primaryAmount,
      secondarySubtotal: subtotalDisplay.secondaryAmount,

      primaryDiscount: discountDisplay.primaryAmount,
      secondaryDiscount: discountDisplay.secondaryAmount,

      primaryShipping: shippingDisplay.primaryAmount,
      secondaryShipping: shippingDisplay.secondaryAmount,

      primaryTotal: totalDisplay.primaryAmount,
      secondaryTotal: totalDisplay.secondaryAmount,

      primaryCurrency,
      secondaryCurrency,

      hasUsd,
      hasCdf,
    }
  }, [
    articleLines,
    conversionRate,
    order,
    rateNum,
    rateOk,
  ])

  const articlesView = useMemo<ArticleView[]>(() => {
    return articleLines.map((line) => {
      const lineDisplay = selectDisplay(
        line.linePair,
        totals.primaryCurrency
      )

      const unitDisplay = selectDisplay(
        line.unitPair,
        totals.primaryCurrency
      )

      return {
        ...line,
        lineDisplay,
        unitDisplay,
        hasPrice: line.linePair.usd > 0 || line.linePair.cdf > 0,
      }
    })
  }, [articleLines, totals.primaryCurrency])

  /* ---------------------------------------------------------- */
  /* Timeline                                                    */
  /* ---------------------------------------------------------- */

  const timeline = useMemo(
    () =>
      getTimelineForStatus(
        order?.statut || 'en_attente',
        order?.timeline
      ),
    [order?.statut, order?.timeline]
  )

  /* ---------------------------------------------------------- */
  /* Effets                                                      */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!authLoading && !user && commandeId) {
      router.replace(
        `/login?redirect=${encodeURIComponent(
          `/commande/confirmation?id=${commandeId}`
        )}`
      )
    }
  }, [authLoading, commandeId, router, user])

  useEffect(() => {
    if (!authLoading && user && !commandeId) {
      router.replace('/profile?tab=orders')
    }
  }, [authLoading, commandeId, router, user])

  useEffect(() => {
    if (!order || isCartCleared.current) return

    const validStatuses: OrderStatus[] = [
      'payee',
      'collecte',
      'conditionnement_premium',
      'en_livraison',
      'livree',
    ]

    if (validStatuses.includes(order.statut)) {
      isCartCleared.current = true

      void Promise.resolve(clearCart?.()).catch(() => {})
    }
  }, [clearCart, order])

  useEffect(() => {
    if (!order || confettiFired.current) return
    if (!isDeliveredStatus(order.statut)) return

    confettiFired.current = true

    if (!prefersReduced) {
      triggerConfetti(3500)
    }
  }, [order, prefersReduced])

  /* ---------------------------------------------------------- */
  /* Mutations                                                   */
  /* ---------------------------------------------------------- */

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/commandes/${commandeId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || 'Échec de l’annulation.')
      }

      return data
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        message: 'Votre commande a été annulée.',
      })

      setShowCancelModal(false)
      queryClient.invalidateQueries({
        queryKey: ['commande', commandeId],
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Échec de l’annulation.',
      })
    },
  })

  const returnMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/retours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ commande_id: commandeId }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          data?.error || 'Échec de la demande de retour.'
        )
      }

      return data
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        message:
          'Demande de retour enregistrée. Le support vous contactera.',
      })

      setShowReturnModal(false)
      queryClient.invalidateQueries({
        queryKey: ['commande', commandeId],
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message:
          err?.message || 'Échec de la demande de retour.',
      })
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async (payload: ReviewPayload) => {
      const res = await fetch('/api/avis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          data?.error || 'Échec de l’enregistrement de l’avis.'
        )
      }

      return data
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        message: 'Merci pour votre avis !',
      })

      setShowReviewModal(false)
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message:
          err?.message || 'Échec de l’enregistrement de l’avis.',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleCopy = useCallback(
    async (code: string, id: string) => {
      const ok = await copyToClipboard(code)

      if (ok) {
        setCopied(id)
        addToast({ type: 'success', message: 'Code copié.' })
        setTimeout(() => setCopied(null), 2000)
      } else {
        addToast({ type: 'error', message: 'Copie impossible.' })
      }
    },
    [addToast]
  )

  const handleShowQr = useCallback((code: string, label: string) => {
    setQrModal({ open: true, code, label })
  }, [])

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }, [])

  const handleDownload = useCallback(() => {
    if (!order || typeof window === 'undefined') return

    try {
      const articleLinesText = articlesView.map((view) => {
        const spec = view.article.specifications
          ? ` (${view.article.specifications})`
          : ''

        return `${view.quantity} × ${view.article.nom}${spec} — ${formatPair(
          view.linePair
        )}`
      })

      const content = [
        'GERCIE — CONFIRMATION DE COMMANDE',
        '=================================',
        `Commande : ${order.numero}`,
        `Date : ${formatDate(order.created_at)}`,
        `Statut : ${getStatusConfig(order.statut).label}`,
        `Paiement : ${order.payment_method || 'À confirmer'}`,
        order.payment_reference
          ? `Référence : ${order.payment_reference}`
          : '',
        '',
        'ARTICLES',
        '--------',
        ...articleLinesText,
        '',
        'TOTAUX',
        '------',
        `Sous-total : ${formatPair(totals.subtotalPair)}`,
        `Livraison : ${formatPair(totals.shippingPair)}`,
        `Remise : - ${formatPair(totals.discountPair)}`,
        `Total : ${formatPair(totals.totalPair)}`,
        conversionRate
          ? `Taux utilisé : 1 USD ≈ ${formatCdf(Number(conversionRate))}`
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
  }, [
    addToast,
    articlesView,
    conversionRate,
    order,
    totals.discountPair,
    totals.shippingPair,
    totals.subtotalPair,
    totals.totalPair,
  ])

  const handleShare = useCallback(async () => {
    if (!order) return

    const url = buildShareUrl(order)
    const text = buildShareText(order)

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Commande ${order.numero}`,
          text,
          url,
        })

        return
      } catch {
        // fallback
      }
    }

    const ok = await copyToClipboard(`${text}\n${url}`)

    addToast({
      type: ok ? 'success' : 'error',
      message: ok
        ? 'Lien de partage copié.'
        : 'Impossible de préparer le partage.',
    })
  }, [addToast, order])

  /* ---------------------------------------------------------- */
  /* Rendu loading                                               */
  /* ---------------------------------------------------------- */

  if (authLoading || (loading && !order)) {
    return (
      <Container className="py-10">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-3xl" />

          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-96 lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </Container>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu erreur                                                */
  /* ---------------------------------------------------------- */

  if (error && !order) {
    return (
      <Container className="py-16">
        <Card className="mx-auto max-w-md border-red-500/30 bg-red-500/5 p-8 text-center">
          <AlertCircle
            size={48}
            className="mx-auto mb-4 text-red-500"
            aria-hidden="true"
          />

          <h2 className="mb-2 text-2xl font-bold text-foreground">
            Fiche de commande inaccessible
          </h2>

          <p className="mb-6 text-muted-foreground">
            {error instanceof Error
              ? error.message
              : 'La commande demandée est introuvable ou a été archivée.'}
          </p>

          <div className="flex justify-center gap-3">
            <Button
              variant="luxe"
              onClick={() => refetch()}
              leftIcon={
                <RefreshCw size={14} aria-hidden="true" />
              }
            >
              Actualiser
            </Button>

            <Link href="/profile?tab=orders">
              <Button variant="outline-gold">
                Mes commandes
              </Button>
            </Link>
          </div>
        </Card>
      </Container>
    )
  }

  if (!order) return null

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  const statusCfg = getStatusConfig(order.statut)

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-16">
      <Container className="py-8 md:py-12">
        <Stepper currentStep="confirmation" />

        {/* Alerte hors ligne */}
        {!isOnline && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertCircle
              size={18}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />

            <p>
              Vous êtes hors ligne. Les informations affichées peuvent ne pas
              être à jour. Reconnectez-vous pour un suivi en temps réel.
            </p>
          </div>
        )}

        {/* Alerte taux */}
        {rateLoading && !rateOk && totals.hasCdf && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            <RefreshCw
              size={18}
              className="mt-0.5 shrink-0 animate-spin"
              aria-hidden="true"
            />

            <p>
              Chargement du taux USD/CDF. Les montants CDF affichés peuvent
              encore provenir du snapshot de commande.
            </p>
          </div>
        )}

        {/* Commande en attente de paiement */}
        {canPay(order.statut) && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <div className="flex items-start gap-3">
              <AlertCircle
                size={18}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="font-medium">Paiement en attente</p>
                <p className="mt-1 text-xs opacity-90">
                  Votre commande est réservée mais n’a pas encore été payée.
                </p>
              </div>
            </div>

            <Button
              variant="luxe"
              size="sm"
              onClick={() =>
                router.push(
                  `/commande/paiement?id=${encodeURIComponent(
                    order.id
                  )}&currency=${encodeURIComponent(totals.primaryCurrency)}`
                )
              }
              leftIcon={
                <CreditCard size={14} aria-hidden="true" />
              }
            >
              Finaliser le paiement
            </Button>
          </div>
        )}

        {/* Bandeau statut */}
        <StatusBanner
          order={order}
          totals={totals}
          onPrint={handlePrint}
          onDownload={handleDownload}
          onShare={handleShare}
        />

        {/* Indicateur rafraîchissement auto */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-3 text-xs text-muted-foreground backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {isFetching ? (
              <Loader2
                size={14}
                className="animate-spin text-gold-500"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw
                size={14}
                className="text-gold-500"
                aria-hidden="true"
              />
            )}

            <span>
              Suivi automatique{' '}
              {isFinalStatus(order.statut)
                ? ' toutes les 2 min'
                : ' toutes les 30 s'}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            leftIcon={
              <RefreshCw size={12} aria-hidden="true" />
            }
          >
            Actualiser
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Colonne principale */}
          <div className="space-y-6 lg:col-span-2">
            <Timeline steps={timeline} status={order.statut} />

            <ArticlesCard articles={articlesView} totals={totals} />

            <CodeValidationCard
              order={order}
              onCopy={handleCopy}
              copied={copied}
              onShowQr={handleShowQr}
            />

            <DeliveryCard order={order} />

            {/* Actions post-commande */}
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles
                    size={18}
                    className="text-gold-500"
                    aria-hidden="true"
                  />
                  Actions
                </CardTitle>

                <CardDescription>
                  Gérez votre commande après validation.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {canPay(order.statut) && (
                    <Button
                      variant="luxe"
                      onClick={() =>
                        router.push(
                          `/commande/paiement?id=${encodeURIComponent(
                            order.id
                          )}&currency=${encodeURIComponent(
                            totals.primaryCurrency
                          )}`
                        )
                      }
                      leftIcon={
                        <CreditCard size={14} aria-hidden="true" />
                      }
                    >
                      Finaliser le paiement
                    </Button>
                  )}

                  {canCancel(order.statut) && (
                    <Button
                      variant="outline"
                      className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                      onClick={() => setShowCancelModal(true)}
                      leftIcon={
                        <XCircle size={14} aria-hidden="true" />
                      }
                    >
                      Annuler la commande
                    </Button>
                  )}

                  {canReturn(order.statut) && (
                    <Button
                      variant="outline-gold"
                      onClick={() => setShowReturnModal(true)}
                      leftIcon={
                        <RotateCcw size={14} aria-hidden="true" />
                      }
                    >
                      Demander un retour
                    </Button>
                  )}

                  {canReview(order.statut) && (
                    <Button
                      variant="luxe"
                      onClick={() => setShowReviewModal(true)}
                      leftIcon={<Star size={14} aria-hidden="true" />}
                    >
                      Laisser un avis
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push('/profile?tab=support')
                    }
                    leftIcon={
                      <HelpCircle size={14} aria-hidden="true" />
                    }
                  >
                    Contacter le support
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePrint}
                    leftIcon={
                      <Printer size={14} aria-hidden="true" />
                    }
                  >
                    Imprimer
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownload}
                    leftIcon={
                      <Download size={14} aria-hidden="true" />
                    }
                  >
                    Facture
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleShare}
                    leftIcon={
                      <Share2 size={14} aria-hidden="true" />
                    }
                  >
                    Partager
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/')}
                    leftIcon={
                      <ShoppingBag size={14} aria-hidden="true" />
                    }
                  >
                    Continuer mes achats
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Conseils / trust */}
            <Card variant="glass" className="border-border">
              <CardContent className="p-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-gold-500/10 p-2 text-gold-500">
                      <ShieldCheck size={18} aria-hidden="true" />
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

                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-gold-500/10 p-2 text-gold-500">
                      <Truck size={18} aria-hidden="true" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Livraison suivie
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Suivi GPS en temps réel à Kinshasa et provinces.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-gold-500/10 p-2 text-gold-500">
                      <Users size={18} aria-hidden="true" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Support 7j/7
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Une question ? Notre équipe répond en moins de 2 h.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              {/* Résumé */}
              <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package
                      size={18}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    Récapitulatif
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      N° commande
                    </span>

                    <span className="font-mono font-semibold text-foreground">
                      {order.numero}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="text-foreground">
                      {formatDate(order.created_at)}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Statut</span>

                    <Badge variant={statusCfg.variant} size="sm">
                      <span className="mr-1">{statusCfg.icon}</span>
                      {statusCfg.label}
                    </Badge>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paiement</span>

                    <span className="capitalize text-foreground">
                      {order.payment_method ||
                        (canPay(order.statut)
                          ? 'À finaliser'
                          : 'Mobile Money')}
                    </span>
                  </div>

                  {order.payment_reference && (
                    <div className="flex justify-between gap-3">
                      <span className="shrink-0 text-muted-foreground">
                        Réf. transaction
                      </span>

                      <span className="truncate font-mono text-xs text-foreground">
                        {order.payment_reference}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-gold-400/20 pt-3">
                    <div className="flex items-end justify-between">
                      <span className="text-sm font-semibold text-foreground">
                        Total
                      </span>

                      <div className="text-right">
                        <p className="text-xl font-extrabold text-gold-600">
                          {formatMoney(
                            totals.primaryTotal,
                            totals.primaryCurrency
                          )}
                        </p>

                        {totals.secondaryTotal > 0 &&
                          totals.secondaryTotal !==
                            totals.primaryTotal && (
                            <p className="text-xs text-muted-foreground">
                              ≈{' '}
                              {formatMoney(
                                totals.secondaryTotal,
                                totals.secondaryCurrency
                              )}
                            </p>
                          )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

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

                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin
                      size={14}
                      className="mt-0.5 shrink-0 text-gold-500"
                      aria-hidden="true"
                    />

                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Adresse
                      </p>

                      <p className="line-clamp-3 text-foreground">
                        {order.adresse_livraison ||
                          order.point_retrait?.adresse ||
                          '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Calendar
                      size={14}
                      className="mt-0.5 shrink-0 text-gold-500"
                      aria-hidden="true"
                    />

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Délai estimé
                      </p>

                      <p className="text-foreground">
                        {order.type_livraison === 'express'
                          ? 'Aujourd’hui / demain'
                          : order.type_livraison === 'point_retrait'
                            ? '24h - 48h'
                            : '24h - 72h'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Besoin d'aide */}
              <Card variant="glass" className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-muted p-2 text-gold-500">
                      <HelpCircle size={18} aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Une question ?
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Notre support est disponible 7j/7 pour vous
                        accompagner.
                      </p>

                      <Link
                        href="/profile?tab=support"
                        className="mt-3 block"
                      >
                        <Button
                          variant="outline-gold"
                          size="sm"
                          fullWidth
                        >
                          Ouvrir un ticket
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Container>

      {/* Barre mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Total</p>

            <p className="truncate text-lg font-bold text-gold-600">
              {formatMoney(
                totals.primaryTotal,
                totals.primaryCurrency
              )}
            </p>

            {totals.secondaryTotal > 0 &&
              totals.secondaryTotal !== totals.primaryTotal && (
                <p className="truncate text-[11px] text-muted-foreground">
                  ≈{' '}
                  {formatMoney(
                    totals.secondaryTotal,
                    totals.secondaryCurrency
                  )}
                </p>
              )}
          </div>

          {canPay(order.statut) ? (
            <Button
              variant="luxe"
              className="shrink-0"
              onClick={() =>
                router.push(
                  `/commande/paiement?id=${encodeURIComponent(
                    order.id
                  )}&currency=${encodeURIComponent(
                    totals.primaryCurrency
                  )}`
                )
              }
              leftIcon={
                <CreditCard size={16} aria-hidden="true" />
              }
            >
              Payer
            </Button>
          ) : canReview(order.statut) ? (
            <Button
              variant="luxe"
              className="shrink-0"
              onClick={() => setShowReviewModal(true)}
              leftIcon={<Star size={16} aria-hidden="true" />}
            >
              Avis
            </Button>
          ) : (
            <Button
              variant="luxe"
              className="shrink-0"
              onClick={() => router.push('/')}
              leftIcon={
                <ShoppingBag size={16} aria-hidden="true" />
              }
            >
              Continuer
            </Button>
          )}
        </div>
      </div>

      {/* Modals */}
      <ReviewModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onSubmit={(payload) => reviewMutation.mutate(payload)}
        submitting={reviewMutation.isPending}
        order={order}
      />

      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Annuler la commande ?"
        description="Cette action est irréversible."
        size="sm"
        accent="red"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowCancelModal(false)}
              disabled={cancelMutation.isPending}
            >
              Garder la commande
            </Button>

            <Button
              variant="outline"
              className="border-red-500/40 text-red-500 hover:bg-red-500/10"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              leftIcon={
                cancelMutation.isPending ? (
                  <Loader2
                    size={14}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <XCircle size={14} aria-hidden="true" />
                )
              }
            >
              Confirmer l’annulation
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Votre commande #{order.numero} sera annulée. Si un paiement a déjà
          été effectué, le remboursement sera traité sous 3 à 5 jours ouvrés.
        </p>
      </Modal>

      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title="Demander un retour"
        description="Le support vous contactera pour organiser la reprise."
        size="sm"
        accent="gold"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowReturnModal(false)}
              disabled={returnMutation.isPending}
            >
              Annuler
            </Button>

            <Button
              variant="luxe"
              onClick={() => returnMutation.mutate()}
              disabled={returnMutation.isPending}
              leftIcon={
                returnMutation.isPending ? (
                  <Loader2
                    size={14}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <RotateCcw size={14} aria-hidden="true" />
                )
              }
            >
              Envoyer la demande
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Assurez-vous que les articles sont dans leur emballage d’origine. Un
          agent vous contactera sous 24 h pour convenir d’un créneau.
        </p>
      </Modal>

      <QrCodeModal
        open={qrModal.open}
        onClose={() =>
          setQrModal({ open: false, code: '', label: '' })
        }
        code={qrModal.code}
        label={qrModal.label}
      />
    </div>
  )
}