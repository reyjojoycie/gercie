// app/admin/commandes/[id]/page.tsx
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
import Image from 'next/image'

import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'

import {
  ArrowLeft,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Copy,
  CreditCard,
  Edit3,
  Eye,
  FileText,
  History,
  Key,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  Phone,
  QrCode,
  RotateCcw,
  Send,
  ShieldCheck,
  Truck,
  User,
  XCircle,
  Zap,
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { Input } from '@/components/ui/Input'
import { GoldDivider } from '@/components/GoldDivider'
import LivraisonTimeline from '@/components/LivraisonTimeline'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

type DeliveryMode = 'domicile' | 'point_retrait' | 'express'

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
  images: string[]
  quantity: number
  specifications: string | null
  unitPair: MoneyPair
  linePair: MoneyPair
  code_vendeur?: string | null
  code_acheteur?: string | null
  status: ArticleStatus
  motif_refus?: string | null
  photo_preuve?: string | null
  vendeur_id?: string | null
}

interface NormalizedPointRetrait {
  nom: string
  adresse: string
  photo_url: string | null
  telephone: string | null
  horaires: string | null
  points_de_repere: string | null
  ville_nom: string | null
  province_nom: string | null
  latitude: number | null
  longitude: number | null
  instructions_retrait: string | null
}

interface NormalizedTransaction {
  id?: string
  type: string
  montant: number
  description: string
  date: string
  portefeuille_type: string
  utilisateur: string
  pair: MoneyPair
}

interface NormalizedHistoriqueStatut {
  id: string
  ancien_statut: string
  nouveau_statut: string
  commentaire: string | null
  modified_by: string
  created_at: string
}

interface NormalizedLivreur {
  id: string
  nom: string
  prenom: string
  email: string
}

interface NormalizedMessage {
  id: string
  auteur: { nom: string; prenom: string }
  message: string
  created_at: string
}

interface NormalizedAcheteur {
  id: string
  nom: string
  prenom: string
  email: string
  telephone?: string
}

interface EnrichedCommande {
  id: string
  numero: string
  statut: string
  date: string
  type_livraison: DeliveryMode

  adresse_livraison?: string | null
  point_retrait?: NormalizedPointRetrait | null

  code_client?: string | null
  code_livraison?: string | null
  code_livreur?: string | null
  code_pin?: string | null

  numero_suivi?: string | null
  note_interne?: string | null
  mode_attribution?: 'LIBRE' | 'ASSIGNE' | null
  code_promo?: string | null

  articles: NormalizedArticle[]
  articleQuantity: number

  subtotalPair: MoneyPair
  shippingPair: MoneyPair
  discountPair: MoneyPair
  totalPair: MoneyPair

  exchange_rate?: number | null

  acheteur: NormalizedAcheteur
  livreur?: NormalizedLivreur | null

  transactions: NormalizedTransaction[]
  historique_statuts: NormalizedHistoriqueStatut[]
  messages: NormalizedMessage[]
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONFIGURATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const statusLabels: Record<string, string> = {
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

const statusVariant: Record<
  string,
  'warm' | 'gold' | 'accent' | 'danger' | 'neutral'
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

const transactionTypeLabels: Record<string, string> = {
  achat: 'Achat',
  vente: 'Vente',
  escrow_in: 'Entrée séquestre',
  escrow_out: 'Sortie séquestre',
  commission: 'Commission',
  remboursement: 'Remboursement',
  retrait: 'Retrait',
  recharge: 'Recharge',
}

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

function formatSignedUsd(value: number): string {
  if (!Number.isFinite(value)) return '—'

  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  return `${sign}$${abs.toFixed(2)}`
}

function formatSignedCdf(value: number): string {
  if (!Number.isFinite(value)) return '—'

  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  return `${sign}${Math.round(abs).toLocaleString('fr-FR')} FC`
}

function formatSignedPair(pair: MoneyPair): string {
  const hasUsd = pair.usd !== 0
  const hasCdf = pair.cdf !== 0

  if (hasUsd) {
    return hasCdf
      ? `${formatSignedUsd(pair.usd)} ≈ ${formatSignedCdf(pair.cdf)}`
      : formatSignedUsd(pair.usd)
  }

  if (hasCdf) {
    return formatSignedCdf(pair.cdf)
  }

  return '—'
}

function formatDateFull(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleString('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
    })
  } catch {
    return value
  }
}

function formatDateShort(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
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
/*  DELIVERY / STATUS HELPERS                                      */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeDeliveryMode(value: any): DeliveryMode {
  const raw = String(value || '').trim()

  if (raw === 'point_retrait' || raw === 'pickup' || raw === 'relais') {
    return 'point_retrait'
  }

  if (raw === 'express' || raw === 'same_day' || raw === 'jour_meme') {
    return 'express'
  }

  return 'domicile'
}

function getDeliveryLabel(mode: DeliveryMode): string {
  if (mode === 'point_retrait') return 'Point relais'
  if (mode === 'express') return 'Express'
  return 'Domicile'
}

function normalizeArticleStatus(value: any): ArticleStatus {
  const raw = String(value || '')
    .trim()
    .toLowerCase()

  if (
    raw === 'ok' ||
    raw === 'accepte' ||
    raw === 'accepté' ||
    raw === 'accepted' ||
    raw === 'validé' ||
    raw === 'valide'
  ) {
    return 'ok'
  }

  if (
    raw === 'refuse' ||
    raw === 'refusé' ||
    raw === 'rejected' ||
    raw === 'reject'
  ) {
    return 'refuse'
  }

  return 'pending'
}

function collecteBadge(statut: ArticleStatus) {
  if (statut === 'ok') {
    return {
      variant: 'accent' as const,
      label: 'Validé',
      icon: <CheckCircle size={12} aria-hidden="true" />,
    }
  }

  if (statut === 'refuse') {
    return {
      variant: 'danger' as const,
      label: 'Refusé',
      icon: <XCircle size={12} aria-hidden="true" />,
    }
  }

  return {
    variant: 'neutral' as const,
    label: 'En attente',
    icon: null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT / JSON HELPERS                                         */
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
    raw?.variant_key,
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
  const clean = cleanVariantAttributes(attributes)

  if (!clean) return null

  const entries = Object.entries(clean)

  if (entries.length === 0) return null

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  return entries.map(([key, value]) => `${key} : ${value}`).join(' · ')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function getFirstImage(...sources: any[]): string | null {
  for (const source of sources) {
    if (!source) continue

    if (typeof source === 'string' && source.trim()) {
      return source
    }

    if (Array.isArray(source)) {
      for (const item of source) {
        if (typeof item === 'string' && item.trim()) {
          return item
        }

        if (item && typeof item === 'object') {
          const url =
            item.url ||
            item.src ||
            item.path ||
            item.public_url ||
            item.image

          if (typeof url === 'string' && url.trim()) {
            return url
          }
        }
      }
    }

    if (typeof source === 'object') {
      const url =
        source.url ||
        source.src ||
        source.path ||
        source.public_url ||
        source.image

      if (typeof url === 'string' && url.trim()) {
        return url
      }
    }
  }

  return null
}

function normalizeArticle(
  raw: any,
  rate: number | null
): NormalizedArticle {
  const product = raw?.produits || raw?.product || raw?.produit || null

  const quantity = Math.max(
    1,
    Math.floor(Number(raw?.quantite ?? raw?.quantity ?? 1) || 1)
  )

  const usdSource = firstPositive(
    raw?.prix_unitaire_usd,
    raw?.unit_price_usd,
    raw?.prix_usd,
    raw?.price_usd,
    product?.prix_usd,
    product?.price_usd
  )

  const cdfSource = firstPositive(
    raw?.prix_unitaire,
    raw?.prix_cdf,
    raw?.price_cdf,
    raw?.price,
    product?.prix,
    product?.price,
    product?.prix_cdf
  )

  const unitPair = resolvePricePair(usdSource, cdfSource, rate)

  const linePair: MoneyPair = {
    usd: round2(unitPair.usd * quantity),
    cdf: roundCdf(unitPair.cdf * quantity),
  }

  const attrs = extractVariantAttributes(raw)
  const variantLabel = variantLabelFromAttributes(attrs)

  const image = getFirstImage(
    raw?.image,
    raw?.images,
    product?.images,
    product?.image
  )

  return {
    id: String(
      raw?.id ||
        raw?.produit_id ||
        `${raw?.nom || 'article'}-${quantity}`
    ),

    nom: String(
      raw?.nom ||
        product?.nom ||
        raw?.produit?.nom ||
        raw?.products?.nom ||
        raw?.product?.nom ||
        'Produit'
    ),

    images: image ? [image] : [],

    quantity,

    specifications:
      raw?.specifications ||
      variantLabel ||
      (typeof raw?.variante === 'string' ? raw.variante : null),

    unitPair,
    linePair,

    code_vendeur:
      raw?.code_vendeur ||
      raw?.vendeur_code ||
      null,

    code_acheteur:
      raw?.code_acheteur ||
      raw?.code_client ||
      null,

    status: normalizeArticleStatus(
      raw?.statut_collecte ?? raw?.status ?? raw?.statut
    ),

    motif_refus:
      raw?.motif_refus ||
      raw?.refusal_reason ||
      null,

    photo_preuve:
      raw?.photo_preuve ||
      raw?.proof_image ||
      null,

    vendeur_id:
      raw?.vendeur_id ||
      raw?.seller_id ||
      null,
  }
}

function normalizeTransaction(
  raw: any,
  rate: number | null
): NormalizedTransaction {
  const usdSource = optionalNumber(
    raw?.amount_usd ??
      raw?.montant_usd ??
      raw?.total_usd
  )

  const cdfSource = optionalNumber(
    raw?.montant ??
      raw?.amount_cdf ??
      raw?.amount
  )

  const sign =
    (usdSource != null && usdSource < 0) ||
    (cdfSource != null && cdfSource < 0)
      ? -1
      : 1

  const pair = resolvePricePair(
    Math.abs(usdSource ?? 0),
    Math.abs(cdfSource ?? 0),
    rate
  )

  return {
    id: raw?.id ? String(raw.id) : undefined,
    type: String(raw?.type || 'achat'),
    montant: Number(raw?.montant ?? raw?.amount ?? 0) || 0,
    description: String(raw?.description || ''),
    date: String(raw?.date || raw?.created_at || new Date().toISOString()),
    portefeuille_type: String(raw?.portefeuille_type || 'achat'),
    utilisateur: String(
      raw?.utilisateur ||
        raw?.user?.nom ||
        raw?.user?.prenom ||
        ''
    ),
    pair: {
      usd: pair.usd * sign,
      cdf: pair.cdf * sign,
    },
  }
}

function normalizePointRetrait(raw: any): NormalizedPointRetrait | null {
  if (!raw) return null

  const nom = String(
    raw?.nom ||
      raw?.point_retrait_nom ||
      ''
  ).trim()

  const adresse = String(
    raw?.adresse ||
      raw?.point_retrait_adresse ||
      ''
  ).trim()

  if (!nom && !adresse) return null

  return {
    nom: nom || 'Point de retrait',
    adresse,
    photo_url: raw?.photo_url ?? null,
    telephone: raw?.telephone ?? null,
    horaires: raw?.horaires ?? null,
    points_de_repere: raw?.points_de_repere ?? null,
    ville_nom: raw?.ville_nom ?? null,
    province_nom: raw?.province_nom ?? null,
    latitude: optionalNumber(raw?.latitude) ?? null,
    longitude: optionalNumber(raw?.longitude) ?? null,
    instructions_retrait: raw?.instructions_retrait ?? null,
  }
}

function normalizeOrder(
  raw: any,
  rate: number | null
): EnrichedCommande {
  const payload = raw?.data ?? raw

  const articlesSource = Array.isArray(payload?.articles)
    ? payload.articles
    : Array.isArray(payload?.commande_articles)
      ? payload.commande_articles
      : []

  const articles = articlesSource.map((article: any) =>
    normalizeArticle(article, rate)
  )

  const articleQuantity = articles.reduce(
    (acc, article) => acc + article.quantity,
    0
  )

  const computedSubtotalUsd = round2(
    articles.reduce((acc, article) => acc + article.linePair.usd, 0)
  )

  const computedSubtotalCdfFallback = roundCdf(
    articles.reduce((acc, article) => acc + article.linePair.cdf, 0)
  )

  const storedSubtotalUsd = firstPositive(
    payload?.subtotal_usd,
    payload?.subtotalUSD,
    payload?.sous_total_usd
  )

  const storedSubtotalCdf = firstPositive(
    payload?.subtotal_cdf,
    payload?.subtotalCDF,
    payload?.sous_total,
    payload?.subtotal
  )

  const subtotalPair = resolvePricePair(
    storedSubtotalUsd > 0 ? storedSubtotalUsd : computedSubtotalUsd,
    storedSubtotalCdf > 0 ? storedSubtotalCdf : computedSubtotalCdfFallback,
    rate
  )

  const discountRawPair = resolvePricePair(
    firstPositive(
      payload?.reduction_usd,
      payload?.remise_usd,
      payload?.discount_usd
    ),
    firstPositive(
      payload?.reduction_cdf,
      payload?.remise_cdf,
      payload?.remise,
      payload?.discount
    ),
    rate
  )

  const discountPair = capPair(discountRawPair, subtotalPair, rate)

  const shippingPair = resolvePricePair(
    firstPositive(
      payload?.shipping_usd,
      payload?.frais_livraison_usd
    ),
    firstPositive(
      payload?.shipping_cdf,
      payload?.frais_livraison
    ),
    rate
  )

  const storedTotalUsd = firstPositive(
    payload?.total_usd,
    payload?.totalUSD
  )

  const storedTotalCdf = firstPositive(
    payload?.total_cdf,
    payload?.totalCDF,
    payload?.total_global,
    payload?.total
  )

  let totalPair: MoneyPair

  if (storedTotalUsd > 0) {
    totalPair = resolvePricePair(
      storedTotalUsd,
      storedTotalCdf,
      rate
    )
  } else if (
    subtotalPair.usd > 0 ||
    shippingPair.usd > 0 ||
    discountPair.usd > 0
  ) {
    const computedUsd = round2(
      Math.max(
        0,
        subtotalPair.usd - discountPair.usd + shippingPair.usd
      )
    )

    const rateNum = Number(rate)
    const rateOk = Number.isFinite(rateNum) && rateNum > 0

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
  } else if (storedTotalCdf > 0) {
    totalPair = resolvePricePair(0, storedTotalCdf, rate)
  } else {
    totalPair = {
      usd: 0,
      cdf: 0,
    }
  }

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (rateOk && totalPair.usd > 0) {
    totalPair.cdf = roundCdf(toCdf(totalPair.usd, rateNum))
  } else if (
    rateOk &&
    totalPair.cdf > 0 &&
    totalPair.usd <= 0
  ) {
    totalPair.usd = round2(toUsd(totalPair.cdf, rateNum))
  }

  const acheteurRaw = payload?.acheteur || payload?.client || {}

  const acheteur: NormalizedAcheteur = {
    id: String(
      acheteurRaw?.id ||
        payload?.acheteur_id ||
        payload?.client_id ||
        ''
    ),

    nom: String(
      acheteurRaw?.nom ||
        payload?.acheteur_nom ||
        payload?.client_nom ||
        ''
    ),

    prenom: String(
      acheteurRaw?.prenom ||
        payload?.acheteur_prenom ||
        payload?.client_prenom ||
        ''
    ),

    email: String(
      acheteurRaw?.email ||
        payload?.acheteur_email ||
        payload?.client_email ||
        ''
    ),

    telephone:
      acheteurRaw?.telephone ||
      payload?.acheteur_telephone ||
      payload?.client_telephone ||
      undefined,
  }

  const livreurRaw =
    payload?.livreur ||
    (payload?.livreur_id
      ? {
          id: payload.livreur_id,
          nom: payload?.livreur_nom || '',
          prenom: payload?.livreur_prenom || '',
          email: payload?.livreur_email || '',
        }
      : null)

  const livreur: NormalizedLivreur | null =
    livreurRaw && (livreurRaw.id || livreurRaw.nom || livreurRaw.prenom)
      ? {
          id: String(livreurRaw.id || ''),
          nom: String(livreurRaw.nom || ''),
          prenom: String(livreurRaw.prenom || ''),
          email: String(livreurRaw.email || ''),
        }
      : null

  const transactionsSource = Array.isArray(payload?.transactions)
    ? payload.transactions
    : []

  const transactions = transactionsSource.map((t: any) =>
    normalizeTransaction(t, rate)
  )

  const historiqueSource = Array.isArray(
    payload?.historique_statuts ?? payload?.historique
  )
    ? payload?.historique_statuts ?? payload?.historique
    : []

  const historique_statuts: NormalizedHistoriqueStatut[] =
    historiqueSource.map((h: any) => ({
      id: String(h?.id || ''),
      ancien_statut: String(h?.ancien_statut || h?.old_status || ''),
      nouveau_statut: String(h?.nouveau_statut || h?.new_status || ''),
      commentaire: h?.commentaire ?? h?.comment ?? null,
      modified_by: String(h?.modified_by || h?.by || ''),
      created_at: String(
        h?.created_at || h?.date || new Date().toISOString()
      ),
    }))

  const messagesSource = Array.isArray(payload?.messages)
    ? payload.messages
    : []

  const messages: NormalizedMessage[] = messagesSource.map((m: any) => {
    const auteur = m?.auteur || m?.user || {}

    return {
      id: String(m?.id || ''),
      auteur: {
        nom: String(auteur?.nom || m?.auteur_nom || ''),
        prenom: String(auteur?.prenom || m?.auteur_prenom || ''),
      },
      message: String(m?.message || ''),
      created_at: String(
        m?.created_at || m?.date || new Date().toISOString()
      ),
    }
  })

  const pointRetrait = normalizePointRetrait(
    payload?.point_retrait ||
      (payload?.point_retrait_nom
        ? {
            nom: payload.point_retrait_nom,
            adresse: payload.point_retrait_adresse || '',
            photo_url: payload.point_retrait_photo_url || null,
            telephone: payload.point_retrait_telephone || null,
            horaires: payload.point_retrait_horaires || null,
            points_de_repere: payload.point_retrait_points_de_repere || null,
            ville_nom: payload.point_retrait_ville_nom || null,
            province_nom: payload.point_retrait_province_nom || null,
            latitude: payload.point_retrait_latitude || null,
            longitude: payload.point_retrait_longitude || null,
            instructions_retrait:
              payload.point_retrait_instructions || null,
          }
        : null)
  )

  const attributionRaw = String(payload?.mode_attribution || '').toUpperCase()

  return {
    id: String(payload?.id || ''),

    numero: String(
      payload?.numero ||
        payload?.numero_commande ||
        String(payload?.id || '').slice(0, 8)
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

    point_retrait: pointRetrait,

    code_client:
      payload?.code_client ||
      payload?.client_code ||
      null,

    code_livraison:
      payload?.code_livraison ||
      payload?.code_client ||
      payload?.client_code ||
      null,

    code_livreur:
      payload?.code_livreur ||
      payload?.driver_code ||
      null,

    code_pin:
      payload?.code_pin ||
      payload?.pin_code ||
      null,

    numero_suivi:
      payload?.numero_suivi ||
      payload?.tracking_number ||
      null,

    note_interne:
      payload?.note_interne ||
      payload?.internal_note ||
      null,

    mode_attribution:
      attributionRaw === 'ASSIGNE' || attributionRaw === 'LIBRE'
        ? attributionRaw
        : null,

    code_promo:
      payload?.code_promo ||
      payload?.promo_code ||
      null,

    articles,
    articleQuantity,

    subtotalPair,
    shippingPair,
    discountPair,
    totalPair,

    exchange_rate: optionalNumber(
      payload?.exchange_rate ?? payload?.shipping_rate_used
    ),

    acheteur,
    livreur,
    transactions,
    historique_statuts,
    messages,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CLIPBOARD                                                      */
/* ═══════════════════════════════════════════════════════════════ */

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
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

export default function AdminCommandeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const toast = useToast() as any

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const { user, loading: authLoading } = useAuth()
  const exchange = useExchangeRate() as any

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const rawRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   */
  const effectiveRate = mounted ? rawRate : null

  const [copied, setCopied] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showAssignLivreur, setShowAssignLivreur] = useState(false)
  const [selectedLivreurId, setSelectedLivreurId] = useState('')

  const [showNotes, setShowNotes] = useState(false)
  const [noteText, setNoteText] = useState('')

  const [showSuivi, setShowSuivi] = useState(false)
  const [suiviText, setSuiviText] = useState('')

  const [messageText, setMessageText] = useState('')
  const [showQrCode, setShowQrCode] = useState(false)

  const [showValidateCollecte, setShowValidateCollecte] = useState(false)
  const [saisiCodeLivreur, setSaisiCodeLivreur] = useState('')

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!authLoading && !user && id) {
      router.replace(
        `/login?redirect=${encodeURIComponent(
          `/admin/commandes/${id}`
        )}`
      )
    }
  }, [authLoading, id, router, user])

  /* ---------------------------------------------------------- */
  /* Livreurs                                                    */
  /* ---------------------------------------------------------- */

  const { data: livreursData } = useQuery<NormalizedLivreur[]>({
    queryKey: ['admin-livreurs-list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/livreurs?limit=100', {
        credentials: 'include',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) return []

      const list = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : []

      return list
        .map((l: any) => ({
          id: String(l?.id || ''),
          nom: String(l?.nom || ''),
          prenom: String(l?.prenom || ''),
          email: String(l?.email || ''),
        }))
        .filter((l: NormalizedLivreur) => l.id)
    },
    enabled: !!user,
    staleTime: 60_000,
  })

  /* ---------------------------------------------------------- */
  /* Commande brute                                              */
  /* ---------------------------------------------------------- */

  const {
    data: rawCommande,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<any>({
    queryKey: ['admin-commande-raw', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/commandes/${id}`, {
        credentials: 'include',
      })

      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          payload?.error || 'Impossible de charger la commande.'
        )
      }

      return payload
    },
    enabled: !!id && !!user,
    staleTime: 30_000,
  })

  const commande = useMemo<EnrichedCommande | null>(() => {
    if (!rawCommande) return null

    return normalizeOrder(
      rawCommande,
      effectiveRate ??
        optionalNumber(rawCommande?.exchange_rate) ??
        null
    )
  }, [effectiveRate, rawCommande])

  useEffect(() => {
    if (!commande) return

    setSelectedLivreurId(commande.livreur?.id || '')
    setNoteText(commande.note_interne || '')
    setSuiviText(commande.numero_suivi || '')
  }, [commande])

  /* ---------------------------------------------------------- */
  /* Mutations                                                   */
  /* ---------------------------------------------------------- */

  const changeStatutMutation = useMutation({
    mutationFn: async ({
      commandeId,
      newStatut,
    }: {
      commandeId: string
      newStatut: string
    }) => {
      const res = await fetch(`/api/admin/commandes/${commandeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ statut: newStatut }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || 'Échec changement de statut')
      }

      return data
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ['admin-commande-raw', id],
      })

      addToast({
        type: 'success',
        message: `Statut changé en "${
          statusLabels[vars.newStatut] || vars.newStatut
        }"`,
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Échec changement de statut',
      })
    },
  })

  const assignLivreurMutation = useMutation({
    mutationFn: async ({
      commandeId,
      livreurId,
    }: {
      commandeId: string
      livreurId: string
    }) => {
      const res = await fetch(
        `/api/admin/commandes/${commandeId}/assigner-livreur`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ livreur_id: livreurId }),
        }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || 'Échec assignation livreur')
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-commande-raw', id],
      })

      addToast({
        type: 'success',
        message: 'Livreur assigné et code livreur généré',
      })

      setShowAssignLivreur(false)
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Échec assignation livreur',
      })
    },
  })

  const saveNoteMutation = useMutation({
    mutationFn: async ({
      commandeId,
      note,
    }: {
      commandeId: string
      note: string
    }) => {
      const res = await fetch(
        `/api/admin/commandes/${commandeId}/notes`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ note_interne: note }),
        }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || 'Échec sauvegarde note')
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-commande-raw', id],
      })

      addToast({
        type: 'success',
        message: 'Note enregistrée',
      })

      setShowNotes(false)
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Échec sauvegarde note',
      })
    },
  })

  const saveSuiviMutation = useMutation({
    mutationFn: async ({
      commandeId,
      numero,
    }: {
      commandeId: string
      numero: string
    }) => {
      const res = await fetch(
        `/api/admin/commandes/${commandeId}/suivi`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ numero_suivi: numero }),
        }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || 'Échec sauvegarde suivi')
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-commande-raw', id],
      })

      addToast({
        type: 'success',
        message: 'Numéro de suivi enregistré',
      })

      setShowSuivi(false)
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Échec sauvegarde suivi',
      })
    },
  })

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      commandeId,
      message,
    }: {
      commandeId: string
      message: string
    }) => {
      const res = await fetch(
        `/api/admin/commandes/${commandeId}/conversation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ message }),
        }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || 'Échec envoi message')
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-commande-raw', id],
      })

      addToast({
        type: 'success',
        message: 'Message envoyé',
      })

      setMessageText('')
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Échec envoi message',
      })
    },
  })

  const validateCollecteMutation = useMutation({
    mutationFn: async ({
      commandeId,
      code,
    }: {
      commandeId: string
      code: string
    }) => {
      const res = await fetch(
        `/api/commandes/${commandeId}/valider-collecte`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ code_livreur: code }),
        }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || 'Échec validation collecte')
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-commande-raw', id],
      })

      addToast({
        type: 'success',
        message: 'Collecte validée – commande en cours de livraison',
      })

      setShowValidateCollecte(false)
      setSaisiCodeLivreur('')
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Échec validation collecte',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const changeStatut = useCallback(
    (newStatut: string) => {
      if (!commande) return

      if (
        !window.confirm(
          `Passer la commande en "${
            statusLabels[newStatut] || newStatut
          }" ?`
        )
      ) {
        return
      }

      changeStatutMutation.mutate({
        commandeId: commande.id,
        newStatut,
      })
    },
    [changeStatutMutation, commande]
  )

  const handleCopy = useCallback(
    async (text: string, label: string) => {
      const ok = await copyToClipboard(text)

      if (!ok) {
        addToast({
          type: 'error',
          message: 'Copie impossible',
        })

        return
      }

      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }

      setCopied(label)

      copyTimerRef.current = setTimeout(() => {
        setCopied(null)
        copyTimerRef.current = null
      }, 2_000)

      addToast({
        type: 'success',
        message: 'Copié !',
      })
    },
    [addToast]
  )

  const openItineraire = useCallback((pt: NormalizedPointRetrait) => {
    if (pt.latitude != null && pt.longitude != null) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${pt.latitude},${pt.longitude}`,
        '_blank'
      )
    } else {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          pt.adresse
        )}`,
        '_blank'
      )
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Rendu loading / auth                                        */
  /* ---------------------------------------------------------- */

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <Spinner
          size="xl"
          variant="premium"
          label="Chargement..."
        />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <Spinner
          size="xl"
          variant="premium"
          label="Chargement de la commande..."
        />
      </div>
    )
  }

  if (isError || !commande) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-midnight-950">
        <Card variant="glass" className="max-w-md text-center">
          <CardContent className="py-12">
            <Package
              size={48}
              className="mx-auto mb-4 text-neutral-400"
              aria-hidden="true"
            />

            <p className="text-neutral-500">
              {error instanceof Error
                ? error.message
                : 'Commande introuvable.'}
            </p>

            <Link href="/admin/commandes">
              <Button variant="outline-gold" className="mt-4">
                Retour aux commandes
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Valeurs dérivées                                            */
  /* ---------------------------------------------------------- */

  const statutCfg = {
    variant: statusVariant[commande.statut] ?? 'neutral',
    label: statusLabels[commande.statut] ?? commande.statut,
  }

  const displayCodeClient =
    commande.code_client || commande.code_livraison

  const collecteValidee =
    commande.articles.length > 0 &&
    commande.articles.every((a) => a.status === 'ok')

  const totalDisplay = selectDisplay(commande.totalPair, 'USD')
  const subtotalDisplay = selectDisplay(commande.subtotalPair, 'USD')
  const shippingDisplay = selectDisplay(commande.shippingPair, 'USD')
  const discountDisplay = selectDisplay(commande.discountPair, 'USD')

  const showTotalSecondary =
    totalDisplay.secondaryAmount > 0 &&
    totalDisplay.secondaryAmount !== totalDisplay.primaryAmount

  const showSubtotalSecondary =
    subtotalDisplay.secondaryAmount > 0 &&
    subtotalDisplay.secondaryAmount !== subtotalDisplay.primaryAmount

  const showShippingSecondary =
    shippingDisplay.secondaryAmount > 0 &&
    shippingDisplay.secondaryAmount !== shippingDisplay.primaryAmount

  const showDiscountSecondary =
    discountDisplay.secondaryAmount > 0 &&
    discountDisplay.secondaryAmount !== discountDisplay.primaryAmount

  const hasDiscount =
    commande.discountPair.usd > 0 || commande.discountPair.cdf > 0

  const hasShipping =
    commande.shippingPair.usd > 0 || commande.shippingPair.cdf > 0

  const deliveryMode = commande.type_livraison

  const DeliveryIcon =
    deliveryMode === 'point_retrait'
      ? MapPin
      : deliveryMode === 'express'
        ? Zap
        : Truck

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-50 pb-16 dark:bg-midnight-950">
      <div className="pattern-dots pointer-events-none absolute inset-0 opacity-5 dark:opacity-10" />

      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-gold-400/20 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-midnight-900/70">
        <Container className="flex items-center gap-4 py-4">
          <Link
            href="/admin/commandes"
            className="rounded-xl p-2 text-neutral-400 transition hover:bg-gold-400/10 hover:text-gold-500"
            aria-label="Retour aux commandes"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <div className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                Commande #{commande.numero}
              </div>

              <Badge
                variant={statutCfg.variant}
                size="sm"
                className="shadow-soft"
              >
                {statutCfg.label}
              </Badge>

              {commande.code_promo && (
                <Badge variant="gold" size="sm">
                  🎟️ {commande.code_promo}
                </Badge>
              )}

              {commande.mode_attribution && (
                <Badge
                  variant={
                    commande.mode_attribution === 'ASSIGNE'
                      ? 'gold'
                      : 'neutral'
                  }
                  size="sm"
                >
                  {commande.mode_attribution === 'ASSIGNE'
                    ? 'Assigné'
                    : 'Libre'}
                </Badge>
              )}
            </div>

            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {formatDateFull(commande.date)}
            </p>
          </div>

          <div className="flex gap-2">
            <Tooltip content="Actualiser">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => void refetch()}
              >
                <RotateCcw size={16} aria-hidden="true" />
              </Button>
            </Tooltip>

            <Tooltip content="Facture PDF">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() =>
                  window.open(
                    `/api/admin/commandes/${id}/facture`,
                    '_blank'
                  )
                }
              >
                <FileText size={16} aria-hidden="true" />
              </Button>
            </Tooltip>

            <Tooltip content="QR Code">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => setShowQrCode(true)}
              >
                <QrCode size={16} aria-hidden="true" />
              </Button>
            </Tooltip>
          </div>
        </Container>
      </div>

      <Container className="relative z-10 max-w-6xl py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {/* Timeline */}
              <Card variant="glass" className="border-gold-400/20 shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck
                      size={18}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    Progression
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <LivraisonTimeline
                    statut={commande.statut ?? 'en_attente'}
                    collecteValidee={collecteValidee}
                    dateAcceptation={commande.date}
                  />
                </CardContent>
              </Card>

              {/* Articles */}
              <Card variant="glass" className="border-gold-400/20 shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package
                      size={18}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    Articles ({commande.articleQuantity})
                  </CardTitle>

                  <CardDescription>
                    Détails et codes de sécurité
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {commande.articles.map((article, idx) => {
                    const badge = collecteBadge(article.status)

                    const lineDisplay = selectDisplay(
                      article.linePair,
                      'USD'
                    )

                    const showLineSecondary =
                      lineDisplay.secondaryAmount > 0 &&
                      lineDisplay.secondaryAmount !==
                        lineDisplay.primaryAmount

                    return (
                      <motion.div
                        key={`article-${article.id || idx}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="rounded-xl border border-gold-400/10 bg-white/50 p-4 shadow-card backdrop-blur-sm dark:bg-midnight-800/40"
                      >
                        <div className="flex gap-4">
                          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-gold-400/20 bg-neutral-100 dark:bg-midnight-700/40">
                            <Image
                              src={article.images[0] || '/placeholder.jpg'}
                              alt={article.nom}
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="font-semibold text-foreground">
                                  {article.nom}
                                </h4>

                                {article.specifications && (
                                  <p className="mt-0.5 text-xs text-gold-600">
                                    {article.specifications}
                                  </p>
                                )}

                                <p className="mt-1 text-sm text-neutral-500">
                                  Qté : {article.quantity}
                                </p>

                                <p className="mt-1 text-sm font-semibold text-gold-600">
                                  {formatMoney(
                                    lineDisplay.primaryAmount,
                                    lineDisplay.primaryCurrency
                                  )}
                                </p>

                                {showLineSecondary && (
                                  <p className="text-xs text-neutral-400">
                                    ≈{' '}
                                    {formatMoney(
                                      lineDisplay.secondaryAmount,
                                      lineDisplay.secondaryCurrency
                                    )}
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-col items-end gap-1">
                                <Badge variant={badge.variant} size="sm">
                                  {badge.icon}
                                  {badge.label}
                                </Badge>

                                {article.motif_refus && (
                                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500 dark:bg-red-900/20">
                                    {article.motif_refus}
                                  </span>
                                )}
                              </div>
                            </div>

                            {(article.code_vendeur ||
                              article.code_acheteur) && (
                              <div className="mt-3 space-y-2 border-t border-gold-400/10 pt-3">
                                {article.code_vendeur && (
                                  <div className="flex items-center justify-between text-sm">
                                    <span>
                                      <Key
                                        size={14}
                                        className="mr-1 inline text-gold-500"
                                        aria-hidden="true"
                                      />
                                      Code vendeur :{' '}
                                      <code className="font-mono font-semibold text-gold-600">
                                        {article.code_vendeur}
                                      </code>
                                    </span>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        void handleCopy(
                                          article.code_vendeur!,
                                          `vendeur-${article.id}`
                                        )
                                      }
                                      aria-label="Copier le code vendeur"
                                    >
                                      {copied ===
                                      `vendeur-${article.id}` ? (
                                        <CheckCircle
                                          size={14}
                                          className="text-green-500"
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Copy size={14} aria-hidden="true" />
                                      )}
                                    </Button>
                                  </div>
                                )}

                                {article.code_acheteur && (
                                  <div className="flex items-center justify-between text-sm">
                                    <span>
                                      <Key
                                        size={14}
                                        className="mr-1 inline text-brand-500"
                                        aria-hidden="true"
                                      />
                                      Code acheteur :{' '}
                                      <code className="font-mono font-semibold text-brand-600">
                                        {article.code_acheteur}
                                      </code>
                                    </span>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        void handleCopy(
                                          article.code_acheteur!,
                                          `acheteur-${article.id}`
                                        )
                                      }
                                      aria-label="Copier le code acheteur"
                                    >
                                      {copied ===
                                      `acheteur-${article.id}` ? (
                                        <CheckCircle
                                          size={14}
                                          className="text-green-500"
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Copy size={14} aria-hidden="true" />
                                      )}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}

                  <GoldDivider />

                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-bold text-lg text-foreground">
                        Total
                      </p>

                      {hasDiscount && (
                        <p className="mt-1 text-sm text-green-600">
                          Remise{' '}
                          {commande.code_promo &&
                            `(${commande.code_promo})`}{' '}
                          : -{' '}
                          {formatMoney(
                            discountDisplay.primaryAmount,
                            discountDisplay.primaryCurrency
                          )}
                          {showDiscountSecondary && (
                            <span className="text-xs text-muted-foreground">
                              {' '}≈{' '}
                              {formatMoney(
                                discountDisplay.secondaryAmount,
                                discountDisplay.secondaryCurrency
                              )}
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold text-gold-600">
                        {formatMoney(
                          totalDisplay.primaryAmount,
                          totalDisplay.primaryCurrency
                        )}
                      </p>

                      {showTotalSecondary && (
                        <p className="text-xs text-neutral-400">
                          ≈{' '}
                          {formatMoney(
                            totalDisplay.secondaryAmount,
                            totalDisplay.secondaryCurrency
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Livraison */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin
                      size={18}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    Livraison
                  </CardTitle>

                  <Button
                    variant="outline-gold"
                    size="sm"
                    onClick={() => setShowSuivi(true)}
                  >
                    Modifier suivi
                  </Button>
                </CardHeader>

                <CardContent>
                  <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <DeliveryIcon
                      size={16}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    <span>{getDeliveryLabel(deliveryMode)}</span>
                  </div>

                  {deliveryMode === 'domicile' ? (
                    <div className="rounded-xl border border-gold-400/10 bg-white/50 p-4 dark:bg-midnight-800/40">
                      <p className="text-sm">
                        <span className="font-medium">Adresse :</span>{' '}
                        {commande.adresse_livraison || 'Non renseignée'}
                      </p>
                    </div>
                  ) : commande.point_retrait ? (
                    <div className="space-y-3 rounded-xl border border-gold-400/10 bg-white/50 p-4 dark:bg-midnight-800/40">
                      <div className="flex items-start gap-2">
                        <MapPin
                          size={16}
                          className="mt-1 flex-shrink-0 text-gold-500"
                          aria-hidden="true"
                        />

                        <div>
                          <p className="font-medium text-foreground">
                            {commande.point_retrait.nom}
                          </p>

                          <p className="text-sm text-neutral-500">
                            {commande.point_retrait.adresse}
                          </p>

                          {commande.point_retrait.ville_nom && (
                            <p className="text-xs text-neutral-400">
                              {commande.point_retrait.ville_nom},{' '}
                              {commande.point_retrait.province_nom}
                            </p>
                          )}
                        </div>
                      </div>

                      {commande.point_retrait.photo_url && (
                        <div className="relative h-32 w-full overflow-hidden rounded-lg border border-gold-400/20">
                          <Image
                            src={commande.point_retrait.photo_url}
                            alt={commande.point_retrait.nom}
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="object-cover"
                          />
                        </div>
                      )}

                      {commande.point_retrait.telephone && (
                        <p className="text-sm">
                          <Phone
                            size={14}
                            className="mr-1 inline text-gold-500"
                            aria-hidden="true"
                          />
                          {commande.point_retrait.telephone}
                        </p>
                      )}

                      {commande.point_retrait.horaires && (
                        <p className="text-sm">
                          <Clock
                            size={14}
                            className="mr-1 inline text-gold-500"
                            aria-hidden="true"
                          />
                          {commande.point_retrait.horaires}
                        </p>
                      )}

                      {commande.point_retrait.instructions_retrait && (
                        <div className="rounded-lg border border-gold-400/20 bg-gold-50 p-3 text-xs text-gold-700 dark:bg-gold-900/20 dark:text-gold-300">
                          ⚠️ {commande.point_retrait.instructions_retrait}
                        </div>
                      )}

                      <Button
                        variant="outline-gold"
                        size="sm"
                        onClick={() =>
                          openItineraire(commande.point_retrait!)
                        }
                        leftIcon={
                          <Navigation size={14} aria-hidden="true" />
                        }
                      >
                        Voir l'itinéraire
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      Aucun point de retrait.
                    </p>
                  )}

                  {commande.numero_suivi && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                      <p className="text-sm">
                        <span className="font-medium">N° de suivi :</span>{' '}
                        {commande.numero_suivi}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Livreur */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Truck
                      size={18}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    Livreur
                  </CardTitle>

                  <Button
                    variant="outline-gold"
                    size="sm"
                    onClick={() => setShowAssignLivreur(true)}
                  >
                    {commande.livreur ? 'Modifier' : 'Assigner'}
                  </Button>
                </CardHeader>

                <CardContent>
                  {commande.livreur ? (
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-100 font-bold text-gold-600 dark:bg-gold-900/30">
                        {commande.livreur.prenom?.[0] || ''}
                        {commande.livreur.nom?.[0] || ''}
                      </div>

                      <div>
                        <p className="font-medium text-foreground">
                          {commande.livreur.prenom} {commande.livreur.nom}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {commande.livreur.email}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aucun livreur assigné.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Validation de collecte */}
              {['conditionnement_premium', 'collecte'].includes(
                commande.statut
              ) &&
                commande.code_livreur && (
                  <Card variant="glass" className="border-gold-400/20">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck
                          size={20}
                          className="text-green-500"
                          aria-hidden="true"
                        />

                        <span className="text-sm font-medium text-foreground">
                          Valider la collecte au dispatch
                        </span>
                      </div>

                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => {
                          setShowValidateCollecte(true)
                          setSaisiCodeLivreur('')
                        }}
                      >
                        Saisir le code livreur
                      </Button>
                    </CardContent>
                  </Card>
                )}

              {/* Transactions */}
              {commande.transactions.length > 0 && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard
                        size={18}
                        className="text-gold-500"
                        aria-hidden="true"
                      />
                      Transactions
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-3">
                      {commande.transactions.map((t, idx) => {
                        const isPositive =
                          t.pair.usd >= 0 && t.pair.cdf >= 0

                        return (
                          <div
                            key={`tr-${t.id || idx}`}
                            className="flex justify-between border-b border-gold-400/10 pb-2 text-sm last:border-0"
                          >
                            <div>
                              <span className="font-medium text-foreground">
                                {transactionTypeLabels[t.type] || t.type}
                              </span>

                              {t.utilisateur && (
                                <span className="ml-2 text-neutral-500">
                                  {t.utilisateur}
                                </span>
                              )}

                              <p className="mt-0.5 text-xs text-neutral-400">
                                {formatDateShort(t.date)}
                              </p>
                            </div>

                            <span
                              className={cn(
                                'font-medium',
                                isPositive
                                  ? 'text-accent-600'
                                  : 'text-red-500'
                              )}
                            >
                              {formatSignedPair(t.pair)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Historique des statuts */}
              {commande.historique_statuts.length > 0 && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <History
                        size={18}
                        className="text-gold-500"
                        aria-hidden="true"
                      />
                      Historique des statuts
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-2">
                      {commande.historique_statuts.map((h) => (
                        <div
                          key={h.id}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            {statusLabels[h.ancien_statut] ||
                              h.ancien_statut}{' '}
                            →{' '}
                            {statusLabels[h.nouveau_statut] ||
                              h.nouveau_statut}
                          </span>

                          <span className="text-xs text-muted-foreground">
                            {formatDateShort(h.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Messages */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare
                      size={18}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    Messages internes
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  {commande.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-lg border border-gold-400/10 bg-white/50 p-3 dark:bg-midnight-800/40"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {msg.auteur.prenom} {msg.auteur.nom}
                        </span>

                        <span className="text-xs text-muted-foreground">
                          {formatDateShort(msg.created_at)}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-foreground">
                        {msg.message}
                      </p>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Input
                      placeholder="Écrire un message interne..."
                      value={messageText}
                      onChange={(e) =>
                        setMessageText(e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === 'Enter' &&
                          messageText.trim() &&
                          !sendMessageMutation.isPending
                        ) {
                          sendMessageMutation.mutate({
                            commandeId: commande.id,
                            message: messageText,
                          })
                        }
                      }}
                      variant="glass"
                    />

                    <Button
                      variant="luxe"
                      size="sm"
                      onClick={() =>
                        sendMessageMutation.mutate({
                          commandeId: commande.id,
                          message: messageText,
                        })
                      }
                      loading={sendMessageMutation.isPending}
                      disabled={!messageText.trim()}
                    >
                      <Send size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Actions rapides */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="text-neutral-800 dark:text-neutral-200">
                    Actions rapides
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  <select
                    value={commande.statut}
                    onChange={(e) => changeStatut(e.target.value)}
                    disabled={changeStatutMutation.isPending}
                    className="w-full rounded-xl border border-gold-400/30 bg-white/50 px-4 py-2.5 text-sm font-medium backdrop-blur-sm dark:bg-midnight-800/50"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="outline-gold"
                    fullWidth
                    size="sm"
                    onClick={() => setShowNotes(true)}
                    leftIcon={
                      <Edit3 size={14} aria-hidden="true" />
                    }
                  >
                    Notes internes
                  </Button>

                  <Button
                    variant="outline-gold"
                    fullWidth
                    size="sm"
                    onClick={() => setShowSuivi(true)}
                    leftIcon={
                      <Truck size={14} aria-hidden="true" />
                    }
                  >
                    N° de suivi
                  </Button>

                  <Button
                    variant="outline-gold"
                    fullWidth
                    size="sm"
                    onClick={() => setShowAssignLivreur(true)}
                    leftIcon={
                      <User size={14} aria-hidden="true" />
                    }
                  >
                    Assigner livreur
                  </Button>

                  {['conditionnement_premium', 'collecte'].includes(
                    commande.statut
                  ) &&
                    commande.code_livreur && (
                      <Button
                        variant="accent"
                        fullWidth
                        size="sm"
                        onClick={() => {
                          setShowValidateCollecte(true)
                          setSaisiCodeLivreur('')
                        }}
                        leftIcon={
                          <ClipboardCheck size={14} aria-hidden="true" />
                        }
                      >
                        Valider la collecte
                      </Button>
                    )}
                </CardContent>
              </Card>

              {/* Client */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User
                      size={18}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    Client
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <p className="font-semibold text-foreground">
                    {commande.acheteur.prenom} {commande.acheteur.nom}
                  </p>

                  <p className="mt-1 text-sm text-neutral-500">
                    {commande.acheteur.email}
                  </p>

                  {commande.acheteur.telephone && (
                    <p className="mt-1 flex items-center gap-1 text-sm">
                      <Phone
                        size={14}
                        className="text-gold-500"
                        aria-hidden="true"
                      />
                      {commande.acheteur.telephone}
                    </p>
                  )}

                  <Link
                    href={`/admin/utilisateurs/${commande.acheteur.id}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-gold-500 hover:underline"
                  >
                    <Eye size={12} aria-hidden="true" />
                    Voir le profil
                  </Link>
                </CardContent>
              </Card>

              {/* Codes */}
              {(displayCodeClient ||
                commande.code_livreur ||
                commande.code_pin) && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck
                        size={18}
                        className="text-gold-500"
                        aria-hidden="true"
                      />
                      Codes de sécurité
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {displayCodeClient && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-medium text-neutral-500">
                            Code client
                          </p>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void handleCopy(
                                displayCodeClient!,
                                'code_client'
                              )
                            }
                            aria-label="Copier le code client"
                          >
                            {copied === 'code_client' ? (
                              <CheckCircle
                                size={14}
                                className="text-green-500"
                                aria-hidden="true"
                              />
                            ) : (
                              <Copy size={14} aria-hidden="true" />
                            )}
                          </Button>
                        </div>

                        <code className="text-lg font-mono font-bold tracking-widest text-gold-600">
                          {displayCodeClient}
                        </code>
                      </div>
                    )}

                    {commande.code_livreur && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-medium text-neutral-500">
                            Code livreur
                          </p>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void handleCopy(
                                commande.code_livreur!,
                                'code_livreur'
                              )
                            }
                            aria-label="Copier le code livreur"
                          >
                            {copied === 'code_livreur' ? (
                              <CheckCircle
                                size={14}
                                className="text-green-500"
                                aria-hidden="true"
                              />
                            ) : (
                              <Copy size={14} aria-hidden="true" />
                            )}
                          </Button>
                        </div>

                        <code className="text-lg font-mono font-bold tracking-widest text-brand-600">
                          {commande.code_livreur}
                        </code>
                      </div>
                    )}

                    {commande.code_pin && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-medium text-neutral-500">
                            Code PIN
                          </p>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void handleCopy(
                                commande.code_pin!,
                                'code_pin'
                              )
                            }
                            aria-label="Copier le code PIN"
                          >
                            {copied === 'code_pin' ? (
                              <CheckCircle
                                size={14}
                                className="text-green-500"
                                aria-hidden="true"
                              />
                            ) : (
                              <Copy size={14} aria-hidden="true" />
                            )}
                          </Button>
                        </div>

                        <code className="text-lg font-mono font-bold tracking-widest text-luxury-600">
                          {commande.code_pin}
                        </code>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Résumé financier */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard
                      size={18}
                      className="text-gold-500"
                      aria-hidden="true"
                    />
                    Résumé
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sous-total</span>

                    <div className="text-right">
                      <p className="font-medium text-foreground">
                        {formatMoney(
                          subtotalDisplay.primaryAmount,
                          subtotalDisplay.primaryCurrency
                        )}
                      </p>

                      {showSubtotalSecondary && (
                        <p className="text-xs text-muted-foreground">
                          ≈{' '}
                          {formatMoney(
                            subtotalDisplay.secondaryAmount,
                            subtotalDisplay.secondaryCurrency
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {hasDiscount && (
                    <div className="flex justify-between text-green-600">
                      <span>Remise</span>

                      <div className="text-right">
                        <p>
                          -{' '}
                          {formatMoney(
                            discountDisplay.primaryAmount,
                            discountDisplay.primaryCurrency
                          )}
                        </p>

                        {showDiscountSecondary && (
                          <p className="text-xs text-muted-foreground">
                            ≈{' '}
                            {formatMoney(
                              discountDisplay.secondaryAmount,
                              discountDisplay.secondaryCurrency
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Livraison</span>

                    <div className="text-right">
                      <p className="font-medium text-foreground">
                        {hasShipping
                          ? formatMoney(
                              shippingDisplay.primaryAmount,
                              shippingDisplay.primaryCurrency
                            )
                          : 'Incluse'}
                      </p>

                      {hasShipping && showShippingSecondary && (
                        <p className="text-xs text-muted-foreground">
                          ≈{' '}
                          {formatMoney(
                            shippingDisplay.secondaryAmount,
                            shippingDisplay.secondaryCurrency
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between border-t border-gold-400/20 pt-2 text-base font-bold">
                    <span>Total</span>

                    <div className="text-right">
                      <p className="text-gold-600">
                        {formatMoney(
                          totalDisplay.primaryAmount,
                          totalDisplay.primaryCurrency
                        )}
                      </p>

                      {showTotalSecondary && (
                        <p className="text-xs text-muted-foreground">
                          ≈{' '}
                          {formatMoney(
                            totalDisplay.secondaryAmount,
                            totalDisplay.secondaryCurrency
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </Container>

      {/* Modale assignation livreur */}
      <Modal
        isOpen={showAssignLivreur}
        onClose={() => setShowAssignLivreur(false)}
        title="Assigner un livreur"
        size="sm"
        accent="gold"
      >
        <select
          value={selectedLivreurId}
          onChange={(e) => setSelectedLivreurId(e.target.value)}
          className="mb-4 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">-- Choisir --</option>

          {(livreursData || []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.prenom} {l.nom}
            </option>
          ))}
        </select>

        <Button
          variant="luxe"
          fullWidth
          onClick={() =>
            assignLivreurMutation.mutate({
              commandeId: commande.id,
              livreurId: selectedLivreurId,
            })
          }
          loading={assignLivreurMutation.isPending}
          disabled={!selectedLivreurId}
        >
          Assigner (génère le code livreur)
        </Button>
      </Modal>

      {/* Modale notes internes */}
      <Modal
        isOpen={showNotes}
        onClose={() => setShowNotes(false)}
        title="Notes internes"
        size="sm"
        accent="gold"
      >
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          className="mb-4 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />

        <Button
          variant="luxe"
          fullWidth
          onClick={() =>
            saveNoteMutation.mutate({
              commandeId: commande.id,
              note: noteText,
            })
          }
          loading={saveNoteMutation.isPending}
        >
          Enregistrer
        </Button>
      </Modal>

      {/* Modale suivi */}
      <Modal
        isOpen={showSuivi}
        onClose={() => setShowSuivi(false)}
        title="Numéro de suivi"
        size="sm"
        accent="gold"
      >
        <Input
          value={suiviText}
          onChange={(e) => setSuiviText(e.target.value)}
          placeholder="N° de suivi"
          variant="glass"
        />

        <Button
          variant="luxe"
          fullWidth
          onClick={() =>
            saveSuiviMutation.mutate({
              commandeId: commande.id,
              numero: suiviText,
            })
          }
          loading={saveSuiviMutation.isPending}
          className="mt-4"
        >
          Enregistrer
        </Button>
      </Modal>

      {/* Modale validation collecte */}
      <Modal
        isOpen={showValidateCollecte}
        onClose={() => setShowValidateCollecte(false)}
        title="Validation de la collecte"
        size="sm"
        accent="gold"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Saisissez le <strong>code livreur</strong> communiqué par le
          livreur pour confirmer le transfert.
        </p>

        <Input
          value={saisiCodeLivreur}
          onChange={(e) =>
            setSaisiCodeLivreur(
              e.target.value
                .replace(/[^A-Za-z0-9]/g, '')
                .toUpperCase()
                .slice(0, 6)
            )
          }
          placeholder="Code livreur (6 caractères)"
          maxLength={6}
          className="mb-4 font-mono"
        />

        <Button
          variant="luxe"
          fullWidth
          onClick={() =>
            validateCollecteMutation.mutate({
              commandeId: commande.id,
              code: saisiCodeLivreur,
            })
          }
          loading={validateCollecteMutation.isPending}
          disabled={saisiCodeLivreur.length !== 6}
        >
          Valider la collecte
        </Button>
      </Modal>

      {/* Modale QR Code */}
      <Modal
        isOpen={showQrCode}
        onClose={() => setShowQrCode(false)}
        title="QR Code"
        size="sm"
        accent="gold"
      >
        <div className="flex justify-center">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
              displayCodeClient || commande.numero
            )}`}
            alt="QR Code"
            className="rounded-lg border border-gold-400/20 bg-white p-2"
          />
        </div>
      </Modal>
    </div>
  )
}