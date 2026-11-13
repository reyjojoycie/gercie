// app/admin/commandes/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

import { motion, useReducedMotion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { useDebounce } from '@/hooks/useDebounce'

import {
  AlertTriangle,
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  Info,
  Key,
  Loader2,
  MapPin,
  Package,
  PlusCircle,
  RefreshCcw,
  Search,
  Square,
  Truck,
  User,
  X,
  Zap,
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

type DeliveryMode = 'domicile' | 'point_retrait' | 'express'

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

interface AcheteurInfo {
  id?: string
  nom?: string
  prenom?: string
  email?: string
  telephone?: string
}

interface LivreurInfo {
  id?: string
  nom?: string
  prenom?: string
}

interface NormalizedArticle {
  id?: string
  produit_id?: string
  nom: string
  quantity: number
  image?: string | null
  unitPair: MoneyPair
  linePair: MoneyPair
}

interface NormalizedCommande {
  id: string
  numero: string
  statut: string
  date: string
  type_livraison: DeliveryMode

  acheteur: AcheteurInfo
  articles: NormalizedArticle[]
  articleQuantity: number

  subtotalPair: MoneyPair
  shippingPair: MoneyPair
  discountPair: MoneyPair
  totalPair: MoneyPair

  code_client?: string | null
  code_livreur?: string | null
  mode_attribution?: 'LIBRE' | 'ASSIGNE' | null

  livreur?: LivreurInfo | null
  note_interne?: string | null
  numero_suivi?: string | null
  mode_paiement?: string | null
  code_promo?: string | null

  exchange_rate?: number | null
}

interface AdminStats {
  total: number
  page: number
  totalPages: number
  commandesJour: number
  chiffreAffairesPair: MoneyPair
  panierMoyenPair: MoneyPair
}

interface ColumnDef {
  key: string
  header: string
  accessor: (row: NormalizedCommande) => React.ReactNode
  className?: string
  sortable?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const STATUT_CONFIG: Record<
  string,
  {
    variant: 'warm' | 'gold' | 'accent' | 'danger' | 'neutral'
    label: string
  }
> = {
  en_attente: { variant: 'warm', label: 'En attente' },
  payee: { variant: 'gold', label: 'Payée' },
  conditionnement_premium: {
    variant: 'neutral',
    label: 'Cond. Premium',
  },
  collecte: { variant: 'neutral', label: 'Collecte' },
  en_livraison: { variant: 'warm', label: 'En livraison' },
  livree: { variant: 'accent', label: 'Livrée' },
  annulee: { variant: 'danger', label: 'Annulée' },
  refusee: { variant: 'danger', label: 'Refusée' },
  rembourse: { variant: 'neutral', label: 'Remboursée' },
  retour_demande: { variant: 'warm', label: 'Retour demandé' },
}

const STATUT_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  ...Object.entries(STATUT_CONFIG).map(([value, cfg]) => ({
    value,
    label: cfg.label,
  })),
]

const BULK_STATUTS = [
  'payee',
  'conditionnement_premium',
  'collecte',
  'en_livraison',
  'livree',
  'annulee',
  'refusee',
  'rembourse',
  'retour_demande',
]

const SERVER_SORT_FIELD_MAP: Record<string, string> = {
  date: 'created_at',
  total: 'total',
  statut: 'statut',
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

function formatDate(value?: string | null): string {
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
/*  DELIVERY HELPERS                                               */
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

function DeliveryIcon({ mode }: { mode: DeliveryMode }) {
  if (mode === 'point_retrait') {
    return <MapPin size={14} className="text-gold-500" aria-hidden="true" />
  }

  if (mode === 'express') {
    return <Zap size={14} className="text-gold-500" aria-hidden="true" />
  }

  return <Truck size={14} className="text-gold-500" aria-hidden="true" />
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeArticle(raw: any, rate: number | null): NormalizedArticle {
  const quantity = Math.max(
    1,
    Math.floor(Number(raw?.quantite ?? raw?.quantity ?? 1) || 1)
  )

  const usdSource = firstPositive(
    raw?.prix_unitaire_usd,
    raw?.unit_price_usd,
    raw?.prix_usd,
    raw?.price_usd,
    raw?.produits?.prix_usd,
    raw?.product?.prix_usd,
    raw?.produit?.prix_usd
  )

  const cdfSource = firstPositive(
    raw?.prix_unitaire,
    raw?.prix_cdf,
    raw?.price_cdf,
    raw?.price,
    raw?.produits?.prix,
    raw?.product?.prix,
    raw?.produit?.prix,
    raw?.produits?.prix_cdf,
    raw?.product?.prix_cdf,
    raw?.produit?.prix_cdf
  )

  const unitPair = resolvePricePair(usdSource, cdfSource, rate)

  const linePair: MoneyPair = {
    usd: round2(unitPair.usd * quantity),
    cdf: roundCdf(unitPair.cdf * quantity),
  }

  const image =
    typeof raw?.image === 'string' && raw.image.trim()
      ? raw.image
      : Array.isArray(raw?.images) && raw.images.length > 0
        ? String(raw.images[0] || '')
        : Array.isArray(raw?.produits?.images) && raw.produits.images.length > 0
          ? String(raw.produits.images[0] || '')
          : null

  return {
    id: raw?.id ? String(raw.id) : undefined,
    produit_id: raw?.produit_id ? String(raw.produit_id) : undefined,
    nom: String(
      raw?.nom ||
        raw?.produit?.nom ||
        raw?.products?.nom ||
        raw?.product?.nom ||
        'Produit'
    ),
    quantity,
    image: image || null,
    unitPair,
    linePair,
  }
}

function normalizeCommande(
  raw: any,
  rate: number | null
): NormalizedCommande {
  const articlesSource = Array.isArray(raw?.articles)
    ? raw.articles
    : Array.isArray(raw?.commande_articles)
      ? raw.commande_articles
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

  const subtotalPair = resolvePricePair(
    firstPositive(
      raw?.subtotal_usd,
      raw?.subtotalUSD,
      raw?.sous_total_usd
    ) || computedSubtotalUsd,
    firstPositive(
      raw?.subtotal_cdf,
      raw?.subtotalCDF,
      raw?.sous_total,
      raw?.subtotal
    ) || computedSubtotalCdfFallback,
    rate
  )

  const discountRawPair = resolvePricePair(
    firstPositive(
      raw?.reduction_usd,
      raw?.remise_usd,
      raw?.discount_usd
    ),
    firstPositive(
      raw?.reduction_cdf,
      raw?.remise_cdf,
      raw?.remise,
      raw?.discount
    ),
    rate
  )

  const discountPair = capPair(discountRawPair, subtotalPair, rate)

  const shippingPair = resolvePricePair(
    firstPositive(
      raw?.shipping_usd,
      raw?.frais_livraison_usd
    ),
    firstPositive(
      raw?.shipping_cdf,
      raw?.frais_livraison
    ),
    rate
  )

  let totalPair = resolvePricePair(
    firstPositive(raw?.total_usd, raw?.totalUSD),
    firstPositive(
      raw?.total_cdf,
      raw?.totalCDF,
      raw?.total_global,
      raw?.total
    ),
    rate
  )

  if (totalPair.usd <= 0 && totalPair.cdf <= 0) {
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

  const acheteurRaw = raw?.acheteur || raw?.client || {}

  const acheteur: AcheteurInfo = {
    id: String(
      acheteurRaw?.id ||
        raw?.acheteur_id ||
        raw?.client_id ||
        ''
    ),
    nom: String(
      acheteurRaw?.nom ||
        raw?.acheteur_nom ||
        raw?.client_nom ||
        ''
    ),
    prenom: String(
      acheteurRaw?.prenom ||
        raw?.acheteur_prenom ||
        raw?.client_prenom ||
        ''
    ),
    email: String(
      acheteurRaw?.email ||
        raw?.acheteur_email ||
        raw?.client_email ||
        ''
    ),
    telephone:
      acheteurRaw?.telephone ||
      raw?.acheteur_telephone ||
      raw?.client_telephone ||
      undefined,
  }

  const livreurRaw =
    raw?.livreur ||
    (raw?.livreur_id
      ? {
          id: String(raw.livreur_id),
          nom: raw?.livreur_nom || '',
          prenom: raw?.livreur_prenom || '',
        }
      : null)

  const livreur: LivreurInfo | null =
    livreurRaw &&
    (livreurRaw.id || livreurRaw.nom || livreurRaw.prenom)
      ? {
          id: String(livreurRaw.id || ''),
          nom: String(livreurRaw.nom || ''),
          prenom: String(livreurRaw.prenom || ''),
        }
      : null

  return {
    id: String(raw?.id || ''),
    numero: String(
      raw?.numero ||
        raw?.numero_commande ||
        String(raw?.id || '').slice(0, 8)
    ),
    statut: String(raw?.statut || raw?.status || 'en_attente').toLowerCase(),
    date:
      raw?.date ||
      raw?.created_at ||
      new Date().toISOString(),
    type_livraison: normalizeDeliveryMode(
      raw?.type_livraison || raw?.shipping_method
    ),
    acheteur,
    articles,
    articleQuantity,
    subtotalPair,
    shippingPair,
    discountPair,
    totalPair,
    code_client:
      raw?.code_client ||
      raw?.client_code ||
      raw?.code_livraison ||
      null,
    code_livreur:
      raw?.code_livreur ||
      raw?.driver_code ||
      null,
    mode_attribution:
      raw?.mode_attribution === 'ASSIGNE' || raw?.mode_attribution === 'LIBRE'
        ? raw.mode_attribution
        : null,
    livreur,
    note_interne: raw?.note_interne || null,
    numero_suivi: raw?.numero_suivi || raw?.tracking_number || null,
    mode_paiement:
      raw?.mode_paiement ||
      raw?.payment_method ||
      raw?.method ||
      null,
    code_promo:
      raw?.code_promo ||
      raw?.promo_code ||
      null,
    exchange_rate: optionalNumber(
      raw?.exchange_rate ?? raw?.shipping_rate_used
    ),
  }
}

function normalizeStats(
  raw: any,
  orders: NormalizedCommande[],
  rate: number | null
): AdminStats {
  const total = Number(raw?.total ?? orders.length) || orders.length
  const page = Number(raw?.page ?? 1) || 1
  const totalPages = Number(raw?.totalPages ?? 1) || 1
  const commandesJour = Number(raw?.commandes_jour ?? 0) || 0

  const sumUsd = round2(
    orders.reduce((acc, order) => acc + order.totalPair.usd, 0)
  )

  const sumCdf = roundCdf(
    orders.reduce((acc, order) => acc + order.totalPair.cdf, 0)
  )

  const caUsd =
    firstPositive(
      raw?.chiffre_affaires_usd,
      raw?.chiffreAffairesUsd
    ) || sumUsd

  const caCdf =
    firstPositive(
      raw?.chiffre_affaires_cdf,
      raw?.chiffre_affaires,
      raw?.chiffre_affaires_fc
    ) || sumCdf

  const chiffreAffairesPair = resolvePricePair(caUsd, caCdf, rate)

  let panierUsd = firstPositive(
    raw?.panier_moyen_usd,
    raw?.panierMoyenUsd
  )

  let panierCdf = firstPositive(
    raw?.panier_moyen_cdf,
    raw?.panier_moyen,
    raw?.panier_moyen_fc
  )

  if (
    panierUsd <= 0 &&
    panierCdf <= 0 &&
    chiffreAffairesPair.usd > 0 &&
    total > 0
  ) {
    panierUsd = round2(chiffreAffairesPair.usd / total)
  }

  const panierMoyenPair = resolvePricePair(panierUsd, panierCdf, rate)

  return {
    total,
    page,
    totalPages,
    commandesJour,
    chiffreAffairesPair,
    panierMoyenPair,
  }
}

function getClientName(order: NormalizedCommande): string {
  return (
    `${order.acheteur?.prenom || ''} ${order.acheteur?.nom || ''}`.trim() ||
    'Client inconnu'
  )
}

function getLivreurName(livreur?: LivreurInfo | null): string {
  if (!livreur) return ''
  return `${livreur.prenom || ''} ${livreur.nom || ''}`.trim()
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CLIPBOARD                                                      */
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
/*  UI HELPERS                                                     */
/* ═══════════════════════════════════════════════════════════════ */

function MoneyCell({
  pair,
  className,
  primaryClassName,
  secondaryClassName,
}: {
  pair: MoneyPair
  className?: string
  primaryClassName?: string
  secondaryClassName?: string
}) {
  const display = selectDisplay(pair, 'USD')

  const showSecondary =
    display.secondaryAmount > 0 &&
    display.secondaryAmount !== display.primaryAmount

  return (
    <div className={cn('text-right', className)}>
      <p className={cn('font-bold text-gold-600', primaryClassName)}>
        {formatMoney(display.primaryAmount, display.primaryCurrency)}
      </p>

      {showSecondary && (
        <p className={cn('text-[11px] text-muted-foreground', secondaryClassName)}>
          ≈{' '}
          {formatMoney(display.secondaryAmount, display.secondaryCurrency)}
        </p>
      )}
    </div>
  )
}

function StatPairText({ pair }: { pair: MoneyPair }) {
  const display = selectDisplay(pair, 'USD')

  const showSecondary =
    display.secondaryAmount > 0 &&
    display.secondaryAmount !== display.primaryAmount

  return (
    <span>
      {formatMoney(display.primaryAmount, display.primaryCurrency)}
      {showSecondary && (
        <span className="text-xs opacity-75">
          {' '}≈{' '}
          {formatMoney(display.secondaryAmount, display.secondaryCurrency)}
        </span>
      )}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TABLE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

function Table({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'Aucune donnée',
  emptyIcon,
  sortColumn,
  sortDirection,
  onSort,
  loading,
}: {
  columns: ColumnDef[]
  data: NormalizedCommande[]
  keyExtractor: (row: NormalizedCommande) => string
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (column: string) => void
  loading?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gold-400/20 text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'whitespace-nowrap px-4 py-3 font-semibold text-neutral-600 dark:text-neutral-300',
                  col.sortable &&
                    'cursor-pointer select-none hover:text-gold-500',
                  col.className
                )}
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                <span className="flex items-center gap-1">
                  {col.header}
                  {sortColumn === col.key &&
                    (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-b border-gold-400/5">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <Skeleton
                      variant="text"
                      className="h-4 w-full"
                      shimmer
                      shimmerVariant="gold"
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center">
                {emptyIcon && <div className="mb-2">{emptyIcon}</div>}
                <p className="text-neutral-500">{emptyMessage}</p>
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <motion.tr
                key={keyExtractor(row)}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="border-b border-gold-400/5 transition-colors hover:bg-gold-400/5"
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3', col.className)}>
                    {col.accessor(row)}
                  </td>
                ))}
              </motion.tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize?: number
  onPageSizeChange?: (size: number) => void
}) {
  if (totalPages <= 1) return null

  const pages: (number | string)[] = []
  const delta = 2

  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - delta && i <= currentPage + delta)
    ) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <div className="mt-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-1">
        <Button
          variant="outline-gold"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e-${i}`} className="px-2 text-neutral-400">
              …
            </span>
          ) : (
            <Button
              key={`p-${p}`}
              variant={p === currentPage ? 'luxe' : 'outline-gold'}
              size="sm"
              onClick={() => onPageChange(p as number)}
              className={cn(p === currentPage && 'shadow-gold')}
            >
              {p}
            </Button>
          )
        )}

        <Button
          variant="outline-gold"
          size="icon"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>

      {pageSize && onPageSizeChange && (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <span>Afficher</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SORT PARAM NORMALIZATION                                       */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeSortParam(value?: string | null): string {
  const raw = String(value || 'date').trim()
  const lower = raw.toLowerCase()

  if (['created_at', 'date'].includes(lower)) return 'date'
  if (['total', 'total_usd', 'total_cdf'].includes(lower)) return 'total'
  if (lower === 'statut') return 'statut'
  if (['numero', 'n°'].includes(lower)) return 'numero'
  if (lower === 'client') return 'client'
  if (lower === 'livraison') return 'livraison'
  if (lower === 'articles') return 'articles'

  return raw
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminCommandesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const prefersReducedMotion = useReducedMotion()

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

  const rawRate = useMemo(() => resolveRate(exchange), [exchange])
  const rateLoading = Boolean(exchange?.loading)

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   */
  const effectiveRate = mounted ? rawRate : null
  const rateNum = Number(effectiveRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  /* ---------------------------------------------------------- */
  /* Filtres / état                                              */
  /* ---------------------------------------------------------- */

  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [filterStatut, setFilterStatut] = useState(
    searchParams.get('statut') || ''
  )
  const [filterLivraison, setFilterLivraison] = useState(
    searchParams.get('livraison') || ''
  )
  const [filterDateDebut, setFilterDateDebut] = useState(
    searchParams.get('date_debut') || ''
  )
  const [filterDateFin, setFilterDateFin] = useState(
    searchParams.get('date_fin') || ''
  )
  const [filterMin, setFilterMin] = useState(searchParams.get('min') || '')
  const [filterMax, setFilterMax] = useState(searchParams.get('max') || '')

  const [page, setPage] = useState(Number(searchParams.get('page') || 1) || 1)
  const [pageSize, setPageSize] = useState(
    Number(searchParams.get('limit') || 10) || 10
  )

  const [sortColumn, setSortColumn] = useState(
    normalizeSortParam(searchParams.get('sort'))
  )
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    (searchParams.get('dir') as 'asc' | 'desc') || 'desc'
  )

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [changeStatutModal, setChangeStatutModal] = useState<{
    commandeIds: string[]
    newStatut: string
  } | null>(null)

  const [commentaire, setCommentaire] = useState('')
  const [showExportConfirm, setShowExportConfirm] = useState(false)

  const [detailCommande, setDetailCommande] =
    useState<NormalizedCommande | null>(null)

  const [assignLivreurModal, setAssignLivreurModal] =
    useState<NormalizedCommande | null>(null)

  const [livreurs, setLivreurs] = useState<LivreurInfo[]>([])
  const [selectedLivreurId, setSelectedLivreurId] = useState('')

  const [noteInterne, setNoteInterne] = useState('')
  const [showNotesModal, setShowNotesModal] =
    useState<NormalizedCommande | null>(null)

  const [autoRefresh, setAutoRefresh] = useState(false)

  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set())
  const [validateCollecteModal, setValidateCollecteModal] =
    useState<NormalizedCommande | null>(null)
  const [saisiCodeLivreur, setSaisiCodeLivreur] = useState('')

  const revealTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map())

  const debouncedSearch = useDebounce(search, 300)

  /* ---------------------------------------------------------- */
  /* Auth redirect                                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/admin/commandes')}`
      )
    }
  }, [authLoading, router, user])

  /* ---------------------------------------------------------- */
  /* Cleanup timers                                              */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    return () => {
      revealTimersRef.current.forEach((timer) => clearTimeout(timer))
      revealTimersRef.current.clear()
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Reset selection on data change                              */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, debouncedSearch, filterStatut, filterLivraison, filterDateDebut, filterDateFin, filterMin, filterMax])

  /* ---------------------------------------------------------- */
  /* URL sync                                                    */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    const params = new URLSearchParams()

    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filterStatut) params.set('statut', filterStatut)
    if (filterLivraison) params.set('livraison', filterLivraison)
    if (filterDateDebut) params.set('date_debut', filterDateDebut)
    if (filterDateFin) params.set('date_fin', filterDateFin)
    if (filterMin) params.set('min', filterMin)
    if (filterMax) params.set('max', filterMax)

    if (page > 1) params.set('page', String(page))
    if (pageSize !== 10) params.set('limit', String(pageSize))

    params.set('sort', sortColumn)
    params.set('dir', sortDirection)

    router.replace(`/admin/commandes?${params.toString()}`, {
      scroll: false,
    })
  }, [
    debouncedSearch,
    filterDateDebut,
    filterDateFin,
    filterLivraison,
    filterMax,
    filterMin,
    filterStatut,
    page,
    pageSize,
    router,
    sortColumn,
    sortDirection,
  ])

  /* ---------------------------------------------------------- */
  /* Livreurs                                                    */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!user) return

    let cancelled = false

    fetch('/api/admin/livreurs?limit=100', {
      credentials: 'include',
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(data?.error || 'Erreur chargement livreurs')
        }

        return data
      })
      .then((data) => {
        if (cancelled) return

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : []

        setLivreurs(
          list
            .filter((l: any) => l?.actif !== false)
            .map((l: any) => ({
              id: String(l.id || ''),
              nom: String(l.nom || ''),
              prenom: String(l.prenom || ''),
            }))
        )
      })
      .catch((err) => {
        if (!cancelled) {
          addToast({
            type: 'error',
            message: err?.message || 'Erreur chargement livreurs',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [addToast, user])

  /* ---------------------------------------------------------- */
  /* Query commandes                                             */
  /* ---------------------------------------------------------- */

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [
      'admin-commandes',
      debouncedSearch,
      filterStatut,
      filterLivraison,
      filterDateDebut,
      filterDateFin,
      filterMin,
      filterMax,
      page,
      pageSize,
      sortColumn,
      sortDirection,
      effectiveRate,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()

      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterStatut) params.set('statut', filterStatut)
      if (filterLivraison) params.set('livraison', filterLivraison)
      if (filterDateDebut) params.set('date_debut', filterDateDebut)
      if (filterDateFin) params.set('date_fin', filterDateFin)

      const minVal = Number(filterMin)
      const maxVal = Number(filterMax)

      if (Number.isFinite(minVal) && minVal > 0) {
        params.set('min_usd', String(round2(minVal)))

        if (rateOk) {
          params.set('min', String(roundCdf(toCdf(minVal, rateNum))))
        }
      }

      if (Number.isFinite(maxVal) && maxVal > 0) {
        params.set('max_usd', String(round2(maxVal)))

        if (rateOk) {
          params.set('max', String(roundCdf(toCdf(maxVal, rateNum))))
        }
      }

      params.set('page', String(page))
      params.set('limit', String(pageSize))

      const serverField = SERVER_SORT_FIELD_MAP[sortColumn]

      if (serverField) {
        params.set('sort_by', serverField)
        params.set('sort_order', sortDirection)

        if (sortColumn === 'total') {
          params.set('sort_by_usd', 'total_usd')
        }
      }

      const res = await fetch(`/api/admin/commandes?${params.toString()}`, {
        credentials: 'include',
      })

      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload?.error || 'Erreur chargement commandes')
      }

      return payload
    },
    enabled: !!user,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  /* ---------------------------------------------------------- */
  /* Auto refresh                                                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!autoRefresh || !user) return

    const interval = setInterval(() => {
      void refetch()
    }, 30_000)

    return () => clearInterval(interval)
  }, [autoRefresh, refetch, user])

  /* ---------------------------------------------------------- */
  /* Normalization                                               */
  /* ---------------------------------------------------------- */

  const rawCommandes = useMemo<any[]>(() => {
    return Array.isArray(data?.data) ? data.data : []
  }, [data])

  const commandes = useMemo<NormalizedCommande[]>(() => {
    return rawCommandes.map((raw: any) =>
      normalizeCommande(
        raw,
        effectiveRate ?? optionalNumber(raw?.exchange_rate) ?? null
      )
    )
  }, [effectiveRate, rawCommandes])

  const sortedCommandes = useMemo<NormalizedCommande[]>(() => {
    const arr = [...commandes]
    const dir = sortDirection === 'asc' ? 1 : -1

    switch (sortColumn) {
      case 'numero':
        arr.sort((a, b) => a.numero.localeCompare(b.numero) * dir)
        break

      case 'client':
        arr.sort((a, b) =>
          getClientName(a).localeCompare(getClientName(b)) * dir
        )
        break

      case 'total':
        arr.sort((a, b) => {
          const usdDiff = a.totalPair.usd - b.totalPair.usd

          if (usdDiff !== 0) return usdDiff * dir

          return (a.totalPair.cdf - b.totalPair.cdf) * dir
        })
        break

      case 'statut':
        arr.sort((a, b) => {
          const labelA = STATUT_CONFIG[a.statut]?.label || a.statut
          const labelB = STATUT_CONFIG[b.statut]?.label || b.statut

          return labelA.localeCompare(labelB) * dir
        })
        break

      case 'livraison':
        arr.sort((a, b) =>
          getDeliveryLabel(a.type_livraison).localeCompare(
            getDeliveryLabel(b.type_livraison)
          ) * dir
        )
        break

      case 'date':
        arr.sort(
          (a, b) =>
            (parseTimestamp(a.date) - parseTimestamp(b.date)) * dir
        )
        break

      case 'articles':
        arr.sort(
          (a, b) =>
            (a.articleQuantity - b.articleQuantity) * dir
        )
        break

      default:
        break
    }

    return arr
  }, [commandes, sortColumn, sortDirection])

  const stats = useMemo<AdminStats>(() => {
    return normalizeStats(data, commandes, effectiveRate)
  }, [commandes, data, effectiveRate])

  const statutCounts = useMemo(() => {
    const counts: Record<string, number> = {}

    commandes.forEach((c) => {
      counts[c.statut] = (counts[c.statut] || 0) + 1
    })

    return counts
  }, [commandes])

  /* ---------------------------------------------------------- */
  /* Mutations                                                   */
  /* ---------------------------------------------------------- */

  const updateStatutMutation = useMutation({
    mutationFn: async ({
      commandeIds,
      newStatut,
      comment,
    }: {
      commandeIds: string[]
      newStatut: string
      comment?: string
    }) => {
      const res = await fetch('/api/admin/commandes/bulk-status', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ids: commandeIds,
          statut: newStatut,
          commentaire: comment,
        }),
      })

      const dataRes = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(dataRes?.error || 'Échec mise à jour statut')
      }

      return dataRes
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commandes'] })
      addToast({
        type: 'success',
        message: 'Statut(s) mis à jour',
      })
      setSelectedIds(new Set())
      setChangeStatutModal(null)
      setCommentaire('')
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Échec mise à jour statut',
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

      const dataRes = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(dataRes?.error || 'Échec assignation livreur')
      }

      return dataRes
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commandes'] })
      addToast({
        type: 'success',
        message: 'Livreur assigné et code livreur généré',
      })
      setAssignLivreurModal(null)
      setSelectedLivreurId('')
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

      const dataRes = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(dataRes?.error || 'Échec sauvegarde note')
      }

      return dataRes
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commandes'] })
      addToast({
        type: 'success',
        message: 'Note enregistrée',
      })
      setShowNotesModal(null)
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message: err?.message || 'Échec sauvegarde note',
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

      const dataRes = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(dataRes?.error || 'Échec validation collecte')
      }

      return dataRes
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commandes'] })
      addToast({
        type: 'success',
        message: 'Collecte validée – commande en cours de livraison',
      })
      setValidateCollecteModal(null)
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

  const handleSort = useCallback((key: string) => {
    setSortColumn((prev) => {
      if (prev === key) {
        setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'))
        return prev
      }

      setSortDirection(key === 'date' ? 'desc' : 'asc')
      return key
    })
  }, [])

  const handleStatutChangeClick = useCallback(
    (commande: NormalizedCommande, newStatut: string) => {
      setChangeStatutModal({
        commandeIds: [commande.id],
        newStatut,
      })
      setCommentaire('')
    },
    []
  )

  const handleBulkStatutChangeClick = useCallback(
    (newStatut: string) => {
      if (selectedIds.size === 0) {
        addToast({
          type: 'error',
          message: 'Aucune commande sélectionnée',
        })
        return
      }

      setChangeStatutModal({
        commandeIds: Array.from(selectedIds),
        newStatut,
      })
      setCommentaire('')
    },
    [addToast, selectedIds]
  )

  const confirmStatutChange = useCallback(() => {
    if (!changeStatutModal) return

    updateStatutMutation.mutate({
      commandeIds: changeStatutModal.commandeIds,
      newStatut: changeStatutModal.newStatut,
      comment: commentaire,
    })
  }, [changeStatutModal, commentaire, updateStatutMutation])

  const resetFilters = useCallback(() => {
    setSearch('')
    setFilterStatut('')
    setFilterLivraison('')
    setFilterDateDebut('')
    setFilterDateFin('')
    setFilterMin('')
    setFilterMax('')
    setPage(1)
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === sortedCommandes.length
        ? new Set()
        : new Set(sortedCommandes.map((c) => c.id))
    )
  }, [sortedCommandes])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)

      if (next.has(id)) next.delete(id)
      else next.add(id)

      return next
    })
  }, [])

  const revealCode = useCallback((commandeId: string) => {
    const existing = revealTimersRef.current.get(commandeId)

    if (existing) {
      clearTimeout(existing)
    }

    setRevealedCodes((prev) => new Set(prev).add(commandeId))

    const timer = setTimeout(() => {
      setRevealedCodes((prev) => {
        const next = new Set(prev)
        next.delete(commandeId)
        return next
      })

      revealTimersRef.current.delete(commandeId)
    }, 15_000)

    revealTimersRef.current.set(commandeId, timer)
  }, [])

  const handleCopy = useCallback(
    async (text: string, message = 'Copié') => {
      const ok = await copyToClipboard(text)

      addToast({
        type: ok ? 'success' : 'error',
        message: ok ? message : 'Copie impossible',
      })
    },
    [addToast]
  )

  const openAssignLivreur = useCallback((commande: NormalizedCommande) => {
    setAssignLivreurModal(commande)
    setSelectedLivreurId('')
  }, [])

  const openNotes = useCallback((commande: NormalizedCommande) => {
    setShowNotesModal(commande)
    setNoteInterne(commande.note_interne || '')
  }, [])

  const openValidateCollecte = useCallback((commande: NormalizedCommande) => {
    setValidateCollecteModal(commande)
    setSaisiCodeLivreur('')
  }, [])

  const exportCSV = useCallback(() => {
    if (sortedCommandes.length === 0) return

    const escapeCsv = (value: any) => {
      const s = value == null ? '' : String(value)
      return `"${s.replace(/"/g, '""')}"`
    }

    const headers = [
      'Numéro',
      'Client',
      'Total USD',
      'Total CDF',
      'Sous-total USD',
      'Sous-total CDF',
      'Livraison USD',
      'Livraison CDF',
      'Remise USD',
      'Remise CDF',
      'Statut',
      'Livraison',
      'Date',
      'Livreur',
      'Suivi',
      'Mode paiement',
      'Code promo',
      'Code client',
      'Code livreur',
      'Attribution',
      'Taux',
    ]

    const rows = sortedCommandes.map((c) => [
      c.numero,
      getClientName(c),
      c.totalPair.usd.toFixed(2),
      String(c.totalPair.cdf),
      c.subtotalPair.usd.toFixed(2),
      String(c.subtotalPair.cdf),
      c.shippingPair.usd.toFixed(2),
      String(c.shippingPair.cdf),
      c.discountPair.usd.toFixed(2),
      String(c.discountPair.cdf),
      STATUT_CONFIG[c.statut]?.label || c.statut,
      getDeliveryLabel(c.type_livraison),
      new Date(c.date).toISOString(),
      getLivreurName(c.livreur),
      c.numero_suivi || '',
      c.mode_paiement || '',
      c.code_promo || '',
      c.code_client || '',
      c.code_livreur || '',
      c.mode_attribution || '',
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
    a.download = `commandes_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()

    URL.revokeObjectURL(url)
    setShowExportConfirm(false)

    addToast({
      type: 'success',
      message: 'Export CSV généré',
    })
  }, [addToast, effectiveRate, sortedCommandes])

  /* ---------------------------------------------------------- */
  /* Colonnes                                                    */
  /* ---------------------------------------------------------- */

  const columns: ColumnDef[] = [
    {
      key: 'select',
      header: '',
      className: 'w-10',
      accessor: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleSelect(row.id)
          }}
          className="text-neutral-400 transition hover:text-gold-500"
          aria-label="Sélectionner la commande"
        >
          {selectedIds.has(row.id) ? (
            <CheckSquare size={18} className="text-gold-500" aria-hidden="true" />
          ) : (
            <Square size={18} aria-hidden="true" />
          )}
        </button>
      ),
    },
    {
      key: 'numero',
      header: 'N°',
      sortable: true,
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/commandes/${row.id}`}
            className="font-bold text-foreground transition hover:text-gold-500"
          >
            {row.numero}
          </Link>

          <button
            onClick={(e) => {
              e.stopPropagation()
              void handleCopy(row.numero, 'Numéro copié')
            }}
            className="text-neutral-400 transition hover:text-gold-500"
            aria-label="Copier le numéro"
          >
            <Copy size={14} aria-hidden="true" />
          </button>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      sortable: true,
      accessor: (row) => {
        const clientId = row.acheteur?.id
        const clientName = getClientName(row)

        if (clientId) {
          return (
            <Link
              href={`/admin/utilisateurs/${clientId}`}
              className="flex items-center gap-2 transition hover:text-gold-500"
              onClick={(e) => e.stopPropagation()}
            >
              <User size={16} className="text-gold-500" aria-hidden="true" />
              <span className="text-foreground">{clientName}</span>
            </Link>
          )
        }

        return (
          <div className="flex items-center gap-2">
            <User size={16} className="text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">{clientName}</span>
          </div>
        )
      },
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      accessor: (row) => (
        <div>
          <MoneyCell pair={row.totalPair} />

          {row.discountPair.usd > 0 || row.discountPair.cdf > 0 ? (
            <p className="mt-0.5 text-right text-xs text-green-600">
              - {formatPair(row.discountPair)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'statut',
      header: 'Statut',
      sortable: true,
      accessor: (row) => (
        <Badge
          variant={STATUT_CONFIG[row.statut]?.variant || 'neutral'}
          size="sm"
        >
          {STATUT_CONFIG[row.statut]?.label || row.statut}
        </Badge>
      ),
    },
    {
      key: 'livraison',
      header: 'Livraison',
      sortable: true,
      accessor: (row) => (
        <div className="flex items-center gap-1">
          <DeliveryIcon mode={row.type_livraison} />
          <span className="text-sm">
            {getDeliveryLabel(row.type_livraison)}
          </span>
        </div>
      ),
    },
    {
      key: 'livreur',
      header: 'Livreur',
      accessor: (row) =>
        row.livreur ? (
          <span className="text-sm">
            {getLivreurName(row.livreur) || '—'}
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              openAssignLivreur(row)
            }}
            className="text-xs"
            leftIcon={
              <PlusCircle size={14} aria-hidden="true" />
            }
          >
            Assigner
          </Button>
        ),
    },
    {
      key: 'codes',
      header: 'Codes',
      accessor: (row) => {
        const isRevealed = revealedCodes.has(row.id)

        return (
          <div className="flex items-center gap-2 text-xs">
            {row.code_client ? (
              <Tooltip
                content={
                  isRevealed
                    ? row.code_client
                    : 'Cliquez pour voir le code client'
                }
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    revealCode(row.id)
                  }}
                  className="flex items-center gap-1 rounded border border-gold-400/20 bg-gold-500/5 px-2 py-1 transition hover:bg-gold-500/10"
                >
                  <Key size={12} className="text-gold-500" aria-hidden="true" />
                  {isRevealed ? (
                    <span className="font-mono font-bold">
                      {row.code_client}
                    </span>
                  ) : (
                    'Client'
                  )}
                </button>
              </Tooltip>
            ) : null}

            {row.code_livreur ? (
              <Tooltip
                content={
                  isRevealed
                    ? row.code_livreur
                    : 'Cliquez pour voir le code livreur'
                }
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    revealCode(row.id)
                  }}
                  className="flex items-center gap-1 rounded border border-blue-400/20 bg-blue-500/5 px-2 py-1 transition hover:bg-blue-500/10"
                >
                  <Truck size={12} className="text-blue-500" aria-hidden="true" />
                  {isRevealed ? (
                    <span className="font-mono font-bold">
                      {row.code_livreur}
                    </span>
                  ) : (
                    'Livreur'
                  )}
                </button>
              </Tooltip>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'attribution',
      header: 'Attribution',
      accessor: (row) => (
        <Badge
          variant={row.mode_attribution === 'ASSIGNE' ? 'gold' : 'neutral'}
          size="sm"
        >
          {row.mode_attribution === 'ASSIGNE' ? 'Assigné' : 'Libre'}
        </Badge>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      accessor: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.date)}
        </span>
      ),
    },
    {
      key: 'articles',
      header: 'Articles',
      sortable: true,
      accessor: (row) => (
        <span className="text-sm">{row.articleQuantity}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-center',
      accessor: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Tooltip content="Page complète">
            <Link
              href={`/admin/commandes/${row.id}`}
              className="rounded-lg p-1.5 text-neutral-400 transition hover:text-gold-500"
              onClick={(e) => e.stopPropagation()}
              aria-label="Ouvrir la page complète"
            >
              <Eye size={16} aria-hidden="true" />
            </Link>
          </Tooltip>

          <Tooltip content="Détail rapide">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDetailCommande(row)
              }}
              className="rounded-lg p-1.5 text-neutral-400 transition hover:text-gold-500"
              aria-label="Voir le détail"
            >
              <Info size={16} aria-hidden="true" />
            </button>
          </Tooltip>

          <Tooltip content="Notes internes">
            <button
              onClick={(e) => {
                e.stopPropagation()
                openNotes(row)
              }}
              className="rounded-lg p-1.5 text-neutral-400 transition hover:text-blue-500"
              aria-label="Notes internes"
            >
              <ClipboardCheck size={16} aria-hidden="true" />
            </button>
          </Tooltip>

          {['conditionnement_premium', 'collecte'].includes(row.statut) &&
            row.code_livreur && (
              <Tooltip content="Valider la collecte">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openValidateCollecte(row)
                  }}
                  className="rounded-lg p-1.5 text-green-600 transition hover:text-green-500"
                  aria-label="Valider la collecte"
                >
                  <ClipboardCheck size={16} aria-hidden="true" />
                </button>
              </Tooltip>
            )}

          <select
            value={row.statut}
            onChange={(e) =>
              handleStatutChangeClick(row, e.target.value)
            }
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
            aria-label="Changer le statut"
          >
            {Object.entries(STATUT_CONFIG).map(([value, cfg]) => (
              <option key={value} value={value}>
                {cfg.label}
              </option>
            ))}
          </select>
        </div>
      ),
    },
  ]

  /* ---------------------------------------------------------- */
  /* Rendu                                                       */
  /* ---------------------------------------------------------- */

  if (authLoading || (!user && !authLoading)) {
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

  const amountFilterNeedsRate =
    (Number(filterMin) > 0 || Number(filterMax) > 0) && !rateOk

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-50 pb-16 dark:bg-midnight-950">
      <div className="pattern-dots pointer-events-none absolute inset-0 opacity-5 dark:opacity-10" />

      {/* En-tête sticky */}
      <div className="sticky top-0 z-20 border-b border-gold-400/20 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-midnight-900/70">
        <Container className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Supervision des commandes
            </h1>

            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {stats.total} commandes · CA :{' '}
              <StatPairText pair={stats.chiffreAffairesPair} /> · Panier moy. :{' '}
              <StatPairText pair={stats.panierMoyenPair} /> · Aujourd&apos;hui :{' '}
              {stats.commandesJour}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(autoRefresh && 'border-green-400 text-green-600')}
              leftIcon={
                <RefreshCcw
                  size={16}
                  className={cn(autoRefresh && 'animate-spin')}
                  aria-hidden="true"
                />
              }
            >
              {autoRefresh ? 'Auto' : 'Refresh'}
            </Button>

            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => setShowExportConfirm(true)}
              leftIcon={
                <Download size={14} aria-hidden="true" />
              }
            >
              Export CSV
            </Button>

            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => void refetch()}
              loading={isLoading || isFetching}
              leftIcon={
                <RefreshCcw size={16} aria-hidden="true" />
              }
            >
              Actualiser
            </Button>
          </div>
        </Container>
      </div>

      <Container className="relative z-10 max-w-7xl py-8">
        <motion.div
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: 20 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.5,
          }}
        >
          {/* Résumé statuts */}
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {Object.entries(STATUT_CONFIG).map(([key, { variant, label }]) => (
              <button
                key={key}
                onClick={() => {
                  setFilterStatut(key)
                  setPage(1)
                }}
                className={cn(
                  'rounded-xl border p-3 text-center transition-all',
                  filterStatut === key
                    ? 'border-gold-400 bg-gold-50 shadow-gold dark:bg-gold-900/20'
                    : 'border-border bg-card hover:border-gold-400/50'
                )}
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {label}
                </p>

                <p className="text-xl font-bold text-foreground">
                  {statutCounts[key] || 0}
                </p>

                <Badge variant={variant} size="sm" className="mt-1">
                  {label}
                </Badge>
              </button>
            ))}
          </div>

          {/* Filtres */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
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

            <select
              value={filterStatut}
              onChange={(e) => {
                setFilterStatut(e.target.value)
                setPage(1)
              }}
              className="rounded-xl border border-gold-400/30 bg-white/50 px-3 py-2 text-sm backdrop-blur-sm dark:bg-midnight-800/50"
            >
              {STATUT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={filterLivraison}
              onChange={(e) => {
                setFilterLivraison(e.target.value)
                setPage(1)
              }}
              className="rounded-xl border border-gold-400/30 bg-white/50 px-3 py-2 text-sm backdrop-blur-sm dark:bg-midnight-800/50"
            >
              <option value="">Tous types</option>
              <option value="domicile">Domicile</option>
              <option value="point_retrait">Point retrait</option>
              <option value="express">Express</option>
            </select>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={filterDateDebut}
                onChange={(e) => {
                  setFilterDateDebut(e.target.value)
                  setPage(1)
                }}
                className="text-xs"
              />

              <span className="text-neutral-400">-</span>

              <Input
                type="date"
                value={filterDateFin}
                onChange={(e) => {
                  setFilterDateFin(e.target.value)
                  setPage(1)
                }}
                className="text-xs"
              />
            </div>

            <Input
              type="number"
              placeholder="Min (USD)"
              value={filterMin}
              onChange={(e) => {
                setFilterMin(e.target.value)
                setPage(1)
              }}
              className="text-xs"
            />

            <Input
              type="number"
              placeholder="Max (USD)"
              value={filterMax}
              onChange={(e) => {
                setFilterMax(e.target.value)
                setPage(1)
              }}
              className="text-xs"
            />

            {(search ||
              filterStatut ||
              filterLivraison ||
              filterDateDebut ||
              filterDateFin ||
              filterMin ||
              filterMax) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="col-span-full justify-self-start text-red-500"
                leftIcon={
                  <X size={14} aria-hidden="true" />
                }
              >
                Effacer les filtres
              </Button>
            )}
          </div>

          {amountFilterNeedsRate && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
              <Loader2
                size={18}
                className="mt-0.5 shrink-0 animate-spin"
                aria-hidden="true"
              />

              <p>
                Les filtres de montant sont saisis en USD principal. La
                conversion legacy CDF sera appliquée dès que le taux sera
                disponible.
              </p>
            </div>
          )}

          {/* Sélection multiple */}
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-gold-400/30 bg-gold-50 p-3 dark:bg-gold-900/20"
            >
              <span className="text-sm font-medium text-gold-800 dark:text-gold-300">
                {selectedIds.size} commande(s) sélectionnée(s)
              </span>

              <div className="flex flex-wrap gap-2">
                {BULK_STATUTS.map((s) => (
                  <Button
                    key={s}
                    variant="outline-gold"
                    size="sm"
                    onClick={() => handleBulkStatutChangeClick(s)}
                    disabled={updateStatutMutation.isPending}
                  >
                    {STATUT_CONFIG[s]?.label ?? s}
                  </Button>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Annuler
              </Button>
            </motion.div>
          )}

          {/* Tableau */}
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} variant="glass" className="border-gold-400/20">
                  <CardContent className="p-5">
                    <Skeleton
                      variant="text"
                      className="mb-3 h-6 w-48"
                      shimmer
                      shimmerVariant="gold"
                    />
                    <Skeleton
                      variant="text"
                      className="h-4 w-2/3"
                      shimmer
                      shimmerVariant="gold"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center">
              <AlertTriangle
                size={48}
                className="mx-auto mb-4 text-red-500"
                aria-hidden="true"
              />

              <p className="mb-4 text-red-500">
                {(error as Error)?.message || 'Erreur'}
              </p>

              <Button variant="outline-gold" onClick={() => void refetch()}>
                Réessayer
              </Button>
            </div>
          ) : sortedCommandes.length === 0 ? (
            <Card variant="glass" className="border-gold-400/20 py-12 text-center">
              <CardContent>
                <Package
                  size={48}
                  className="mx-auto mb-4 text-neutral-400"
                  aria-hidden="true"
                />

                <p className="text-neutral-500">
                  Aucune commande trouvée.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card variant="glass" className="overflow-hidden border-gold-400/20">
              <div className="flex items-center justify-between border-b border-gold-400/10 px-4 py-3">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-xs text-muted-foreground transition hover:text-gold-500"
                >
                  {selectedIds.size === sortedCommandes.length &&
                  sortedCommandes.length > 0 ? (
                    <CheckSquare size={16} className="text-gold-500" aria-hidden="true" />
                  ) : (
                    <Square size={16} aria-hidden="true" />
                  )}
                  Tout sélectionner
                </button>

                <span className="text-xs text-muted-foreground">
                  {sortedCommandes.length} commande(s) affichée(s)
                </span>
              </div>

              <Table
                columns={columns}
                data={sortedCommandes}
                keyExtractor={(row) => row.id}
                emptyMessage="Aucune commande trouvée."
                emptyIcon={
                  <Package
                    size={48}
                    className="text-neutral-400"
                    aria-hidden="true"
                  />
                }
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                loading={isLoading}
              />
            </Card>
          )}

          {stats.totalPages > 1 && (
            <Pagination
              currentPage={stats.page}
              totalPages={stats.totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          )}
        </motion.div>
      </Container>

      {/* Modal changement de statut */}
      <Modal
        isOpen={!!changeStatutModal}
        onClose={() => setChangeStatutModal(null)}
        title="Changer le statut"
        size="sm"
        accent="gold"
      >
        <div className="space-y-4">
          <textarea
            rows={3}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Commentaire (optionnel)"
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />

          <div className="flex gap-3">
            <Button
              variant="luxe"
              fullWidth
              onClick={confirmStatutChange}
              loading={updateStatutMutation.isPending}
            >
              Confirmer
            </Button>

            <Button
              variant="outline"
              fullWidth
              onClick={() => setChangeStatutModal(null)}
            >
              Annuler
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal détail commande */}
      <Modal
        isOpen={!!detailCommande}
        onClose={() => setDetailCommande(null)}
        title={`Commande #${detailCommande?.numero || ''}`}
        size="lg"
        accent="gold"
      >
        {detailCommande && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-muted-foreground">Client : </span>
                <Link
                  href={`/admin/utilisateurs/${detailCommande.acheteur?.id || ''}`}
                  className="font-medium transition hover:text-gold-500"
                >
                  {getClientName(detailCommande)}
                </Link>
              </div>

              <div>
                <span className="text-muted-foreground">Email : </span>
                {detailCommande.acheteur?.email || '—'}
              </div>

              <div>
                <span className="text-muted-foreground">Téléphone : </span>
                {detailCommande.acheteur?.telephone || '—'}
              </div>

              <div>
                <span className="text-muted-foreground">Date : </span>
                {formatDate(detailCommande.date)}
              </div>

              <div>
                <span className="text-muted-foreground">Statut : </span>
                <Badge
                  variant={
                    STATUT_CONFIG[detailCommande.statut]?.variant || 'neutral'
                  }
                >
                  {STATUT_CONFIG[detailCommande.statut]?.label ||
                    detailCommande.statut}
                </Badge>
              </div>

              <div>
                <span className="text-muted-foreground">Livraison : </span>
                {getDeliveryLabel(detailCommande.type_livraison)}
              </div>

              <div className="col-span-2">
                <span className="text-muted-foreground">Livreur : </span>
                {getLivreurName(detailCommande.livreur) || '—'}
              </div>

              <div className="col-span-2">
                <span className="text-muted-foreground">Suivi : </span>
                {detailCommande.numero_suivi || '—'}
              </div>

              {detailCommande.code_client && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Code client : </span>
                  <span className="font-mono font-bold text-gold-600">
                    {detailCommande.code_client}
                  </span>
                </div>
              )}

              {detailCommande.code_livreur && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Code livreur : </span>
                  <span className="font-mono font-bold text-blue-600">
                    {detailCommande.code_livreur}
                  </span>
                </div>
              )}

              {detailCommande.mode_attribution && (
                <div>
                  <span className="text-muted-foreground">Attribution : </span>
                  <Badge
                    variant={
                      detailCommande.mode_attribution === 'ASSIGNE'
                        ? 'gold'
                        : 'neutral'
                    }
                  >
                    {detailCommande.mode_attribution === 'ASSIGNE'
                      ? 'Assignée'
                      : 'Libre'}
                  </Badge>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-2">
              <h4 className="mb-2 font-semibold">Articles</h4>

              {detailCommande.articles.length === 0 ? (
                <p className="text-muted-foreground">
                  Aucun article renseigné.
                </p>
              ) : (
                detailCommande.articles.map((a, i) => (
                  <div
                    key={`${a.nom}-${i}`}
                    className="flex justify-between py-1"
                  >
                    <span>
                      {a.nom} x{a.quantity}
                    </span>

                    <span className="font-medium">
                      {formatPair(a.linePair)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-1 border-t border-border pt-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sous-total</span>
                <span>{formatPair(detailCommande.subtotalPair)}</span>
              </div>

              {detailCommande.discountPair.usd > 0 ||
              detailCommande.discountPair.cdf > 0 ? (
                <div className="flex justify-between text-green-600">
                  <span>
                    Remise{' '}
                    {detailCommande.code_promo &&
                      `(${detailCommande.code_promo})`}
                  </span>
                  <span>- {formatPair(detailCommande.discountPair)}</span>
                </div>
              ) : null}

              <div className="flex justify-between">
                <span className="text-muted-foreground">Livraison</span>
                <span>{formatPair(detailCommande.shippingPair)}</span>
              </div>

              <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
                <span>Total</span>
                <span className="text-gold-600">
                  {formatPair(detailCommande.totalPair)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => {
                  const current = detailCommande
                  setDetailCommande(null)
                  openAssignLivreur(current)
                }}
              >
                Assigner livreur
              </Button>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() =>
                  window.open(
                    `/admin/commandes/${detailCommande.id}/facture`,
                    '_blank'
                  )
                }
              >
                Facture PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal assignation livreur */}
      <Modal
        isOpen={!!assignLivreurModal}
        onClose={() => setAssignLivreurModal(null)}
        title="Assigner un livreur"
        size="sm"
        accent="gold"
      >
        {assignLivreurModal && (
          <div className="space-y-4">
            <select
              value={selectedLivreurId}
              onChange={(e) => setSelectedLivreurId(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">-- Choisir un livreur --</option>

              {livreurs.map((l) => (
                <option key={l.id} value={l.id}>
                  {`${l.prenom || ''} ${l.nom || ''}`.trim() || l.id}
                </option>
              ))}
            </select>

            <div className="flex gap-3">
              <Button
                variant="luxe"
                fullWidth
                onClick={() =>
                  assignLivreurMutation.mutate({
                    commandeId: assignLivreurModal.id,
                    livreurId: selectedLivreurId,
                  })
                }
                loading={assignLivreurMutation.isPending}
                disabled={!selectedLivreurId}
              >
                Assigner (génère le code livreur)
              </Button>

              <Button
                variant="outline"
                fullWidth
                onClick={() => setAssignLivreurModal(null)}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal validation collecte */}
      <Modal
        isOpen={!!validateCollecteModal}
        onClose={() => setValidateCollecteModal(null)}
        title="Validation de la collecte"
        size="sm"
        accent="gold"
      >
        {validateCollecteModal && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Saisissez le <strong>code livreur</strong> que le livreur vous a
              communiqué pour confirmer le transfert.
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
              className="font-mono"
            />

            <div className="flex gap-3">
              <Button
                variant="luxe"
                fullWidth
                onClick={() =>
                  validateCollecteMutation.mutate({
                    commandeId: validateCollecteModal.id,
                    code: saisiCodeLivreur,
                  })
                }
                loading={validateCollecteMutation.isPending}
                disabled={saisiCodeLivreur.length !== 6}
              >
                Valider la collecte
              </Button>

              <Button
                variant="outline"
                fullWidth
                onClick={() => setValidateCollecteModal(null)}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal notes internes */}
      <Modal
        isOpen={!!showNotesModal}
        onClose={() => setShowNotesModal(null)}
        title="Notes internes"
        size="sm"
        accent="gold"
      >
        {showNotesModal && (
          <div className="space-y-4">
            <textarea
              rows={4}
              value={noteInterne}
              onChange={(e) => setNoteInterne(e.target.value)}
              placeholder="Ajouter une note interne..."
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />

            <div className="flex gap-3">
              <Button
                variant="luxe"
                fullWidth
                onClick={() =>
                  saveNoteMutation.mutate({
                    commandeId: showNotesModal.id,
                    note: noteInterne,
                  })
                }
                loading={saveNoteMutation.isPending}
              >
                Enregistrer
              </Button>

              <Button
                variant="outline"
                fullWidth
                onClick={() => setShowNotesModal(null)}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal export */}
      <Modal
        isOpen={showExportConfirm}
        onClose={() => setShowExportConfirm(false)}
        title="Exporter les commandes"
        size="sm"
        accent="gold"
      >
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
          Un fichier CSV contenant les commandes affichées (
          {sortedCommandes.length} entrées) sera téléchargé, avec montants USD
          et CDF.
        </p>

        <div className="flex gap-3">
          <Button variant="luxe" onClick={exportCSV}>
            Télécharger CSV
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowExportConfirm(false)}
          >
            Annuler
          </Button>
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}