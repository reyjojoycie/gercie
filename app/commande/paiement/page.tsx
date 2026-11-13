// app/commande/paiement/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

import { motion, AnimatePresence } from 'framer-motion'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import confetti from 'canvas-confetti'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

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

import { cn } from '@/lib/utils'

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Truck,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

type PaymentStatus = 'idle' | 'processing' | 'pending' | 'success' | 'failed'

type MethodType =
  | 'mobile_money'
  | 'card'
  | 'bank_transfer'
  | 'cash_on_delivery'

interface PaymentMethod {
  id: string
  nom: string
  code: string
  type: MethodType
  logo_url?: string | null
  instructions?: string | null
  ordre?: number
  actif?: boolean
}

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
  prix_unitaire?: number
  prix_unitaire_usd?: number
  specifications?: string | null
}

interface OrderSummary {
  id: string
  numero: string
  statut: string
  type_livraison: string
  adresse_livraison?: string | null
  articles: OrderArticle[]

  subtotal_usd?: number
  subtotal_cdf?: number

  reduction_usd?: number
  reduction_cdf?: number

  shipping_usd?: number
  shipping_cdf?: number

  total_usd?: number
  total_cdf?: number

  exchange_rate?: number
  shipping_delay_label?: string | null
  promo_code?: string | null
}

interface RawCartItem {
  id?: string
  product_id?: string
  nom?: string
  name?: string

  prix?: number | null
  price?: number | null
  prix_cdf?: number | null
  price_cdf?: number | null

  prix_usd?: number | null
  price_usd?: number | null
  unit_price_usd?: number | null

  quantite?: number | null
  quantity?: number | null

  image?: string | null
  images?: string[] | null

  variante?: any

  [key: string]: any
}

interface ComputedTotals {
  subtotalUsd: number
  subtotalCdf: number

  discountUsd: number
  discountCdf: number

  shippingUsd: number
  shippingCdf: number

  totalUsd: number
  totalCdf: number

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
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PLACEHOLDER = '/placeholder.jpg'
const SESSION_DURATION_SECONDS = 15 * 60
const LAST_METHOD_KEY = 'gercie_last_payment_method_v3'
const PREF_CURRENCY_KEY = 'gercie_pref_currency_v3'

const PAID_STATUSES = new Set([
  'payee',
  'paid',
  'confirmee',
  'confirmed',
])

const STEPS = [
  { id: 'cart', label: 'Panier', icon: ShoppingBag },
  { id: 'checkout', label: 'Commande', icon: MapPin },
  { id: 'payment', label: 'Paiement', icon: CreditCard },
  { id: 'confirmation', label: 'Confirmation', icon: CheckCircle2 },
]

const METHOD_ICONS: Record<MethodType, ReactNode> = {
  mobile_money: <Smartphone size={20} />,
  card: <CreditCard size={20} />,
  bank_transfer: <Truck size={20} />,
  cash_on_delivery: <Package size={20} />,
}

const METHOD_COLORS: Record<MethodType, string> = {
  mobile_money: 'from-orange-500/20 to-amber-500/20',
  card: 'from-blue-500/20 to-indigo-500/20',
  bank_transfer: 'from-emerald-500/20 to-teal-500/20',
  cash_on_delivery: 'from-purple-500/20 to-pink-500/20',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS NUMÉRIQUES                                             */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeNumeric(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined

  const n = Number(value)

  return Number.isFinite(n) ? n : undefined
}

function positiveNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null

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

function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(safe / 60)
  const s = safe % 60

  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux courant.
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

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANTES / ARTICLES                                           */
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

function getVariantLabel(raw: any): string | null {
  if (!raw) return null

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    return trimmed || null
  }

  const attrs =
    raw?.attributes ??
    raw?.attrs ??
    raw?.variant_attributes

  const label = variantLabelFromAttributes(attrs)

  if (label) return label

  const nom = raw?.nom || raw?.name

  if (nom) return String(nom)

  return null
}

function getItemName(item: RawCartItem): string {
  return String(item?.nom || item?.name || 'Produit')
}

function normalizeOrderArticle(raw: any): OrderArticle {
  const attrs =
    raw?.variant_attributes ??
    raw?.variante

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

    prix_unitaire: normalizeNumeric(
      raw?.prix_unitaire ??
        raw?.prix_cdf ??
        raw?.price_cdf ??
        raw?.prix ??
        raw?.price
    ),

    prix_unitaire_usd: normalizeNumeric(
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
  }
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

function normalizeOrder(raw: any, fallbackId: string): OrderSummary {
  const payload = raw?.data ?? raw

  const articlesSource = Array.isArray(payload?.articles)
    ? payload.articles
    : Array.isArray(payload?.commande_articles)
      ? payload.commande_articles
      : []

  return {
    id: String(payload?.id || fallbackId),

    numero: String(
      payload?.numero_commande ||
        payload?.numero ||
        fallbackId.slice(0, 8)
    ),

    statut: String(
      payload?.statut || payload?.status || 'en_attente'
    ).toLowerCase(),

    type_livraison: normalizeDeliveryMode(
      payload?.type_livraison || payload?.shipping_method
    ),

    adresse_livraison:
      payload?.adresse_livraison ||
      payload?.address ||
      null,

    articles: articlesSource.map(normalizeOrderArticle),

    subtotal_usd: normalizeNumeric(
      payload?.subtotal_usd ??
        payload?.subtotalUSD ??
        payload?.sous_total_usd
    ),

    subtotal_cdf: normalizeNumeric(
      payload?.subtotal_cdf ??
        payload?.subtotalCDF ??
        payload?.sous_total ??
        payload?.subtotal
    ),

    reduction_usd: normalizeNumeric(
      payload?.reduction_usd ??
        payload?.remise_usd ??
        payload?.discount_usd
    ),

    reduction_cdf: normalizeNumeric(
      payload?.reduction_cdf ??
        payload?.remise_cdf ??
        payload?.reduction ??
        payload?.discount
    ),

    shipping_usd: normalizeNumeric(
      payload?.shipping_usd ??
        payload?.frais_livraison_usd
    ),

    shipping_cdf: normalizeNumeric(
      payload?.shipping_cdf ??
        payload?.frais_livraison
    ),

    total_usd: normalizeNumeric(
      payload?.total_usd ?? payload?.totalUSD
    ),

    total_cdf: normalizeNumeric(
      payload?.total_cdf ??
        payload?.total_global ??
        payload?.total
    ),

    exchange_rate: normalizeNumeric(
      payload?.exchange_rate ??
        payload?.shipping_rate_used ??
        payload?.rate
    ),

    shipping_delay_label:
      payload?.shipping_delay_label ||
      payload?.delay_label ||
      null,

    promo_code:
      payload?.code_promo_utilise ||
      payload?.code_promo ||
      null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LOCAL STORAGE                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function safeLocalStorageGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)

    if (!raw) return fallback

    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeLocalStorageSet(key: string, value: any): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // silencieux
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CARD / LUHN                                                    */
/* ═══════════════════════════════════════════════════════════════ */

function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '')

  if (digits.length < 12 || digits.length > 19) return false

  let sum = 0
  let shouldDouble = false

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10)

    if (shouldDouble) {
      digit *= 2

      if (digit > 9) digit -= 9
    }

    sum += digit
    shouldDouble = !shouldDouble
  }

  return sum % 10 === 0
}

function detectCardBrand(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '')

  if (/^4/.test(digits)) return 'Visa'
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  if (/^6(?:011|5)/.test(digits)) return 'Discover'

  return 'Carte'
}

function triggerConfetti(): void {
  if (typeof window === 'undefined') return

  try {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#FFD700', '#FFA500', '#FF6347', '#32CD32', '#1E90FF'],
    })
  } catch {
    // silencieux
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS FORMULAIRE                                             */
/* ═══════════════════════════════════════════════════════════════ */

const mobileSchema = z.object({
  phone: z
    .string()
    .min(10, 'Numéro requis')
    .regex(/^0[0-9]{9}$/, 'Format invalide (ex : 08xxxxxxxx)'),

  pin: z
    .string()
    .max(6, 'PIN trop long')
    .regex(/^\d*$/, 'Le PIN doit contenir uniquement des chiffres')
    .optional()
    .or(z.literal('')),

  ownerName: z.string().max(120).optional().or(z.literal('')),
})

const cardSchema = z.object({
  cardHolder: z.string().min(2, 'Nom du titulaire requis').max(120),

  cardNumber: z
    .string()
    .min(12, 'Numéro trop court')
    .max(19, 'Numéro trop long')
    .refine(luhnCheck, 'Numéro de carte invalide'),

  expiry: z
    .string()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Format MM/AA requis')
    .refine((val) => {
      const [month, year] = val.split('/')

      const now = new Date()
      const currentYear = now.getFullYear() % 100
      const currentMonth = now.getMonth() + 1

      const y = parseInt(year, 10)
      const m = parseInt(month, 10)

      return y > currentYear || (y === currentYear && m >= currentMonth)
    }, 'Carte expirée'),

  cvv: z
    .string()
    .min(3, 'CVV invalide')
    .max(4, 'CVV invalide')
    .regex(/^\d{3,4}$/, 'CVV invalide'),

  saveCard: z.boolean().default(false),
})

type MobileFormData = z.infer<typeof mobileSchema>
type CardFormData = z.infer<typeof cardSchema>

/* ═══════════════════════════════════════════════════════════════ */
/*  SOUS-COMPOSANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function Stepper({ currentStep }: { currentStep: string }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep)

  return (
    <div className="mb-8">
      <div className="scrollbar-hide flex items-center justify-between gap-2 overflow-x-auto pb-2">
        {STEPS.map((step, idx) => {
          const Icon = step.icon
          const isActive = step.id === currentStep
          const isCompleted = idx < currentIndex

          return (
            <div
              key={step.id}
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
                {isCompleted ? <CheckCircle2 size={16} /> : <Icon size={16} />}
              </span>

              <span className="text-xs font-medium sm:text-sm">
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MethodCard({
  method,
  selected,
  onSelect,
  disabled,
}: {
  method: PaymentMethod
  selected: boolean
  onSelect: () => void
  disabled?: boolean
}) {
  const gradient =
    METHOD_COLORS[method.type] || 'from-neutral-500/20 to-neutral-600/20'

  const icon = METHOD_ICONS[method.type] || <CreditCard size={20} />

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-gold-400 bg-gold-500/10 shadow-gold'
          : 'border-border bg-card hover:border-gold-400/40 hover:shadow-card'
      )}
      aria-pressed={selected}
    >
      <div
        className={cn(
          'absolute inset-0 -z-10 bg-gradient-to-br opacity-0 transition group-hover:opacity-100',
          gradient
        )}
      />

      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition',
          selected
            ? 'bg-gold-500 text-white'
            : 'bg-muted text-muted-foreground group-hover:text-gold-600'
        )}
      >
        {method.logo_url ? (
          <Image
            src={method.logo_url}
            alt={method.nom}
            width={40}
            height={40}
            className="h-10 w-10 rounded-lg object-contain"
          />
        ) : (
          icon
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {method.nom}
          </p>

          {selected && (
            <CheckCircle2
              size={16}
              className="shrink-0 text-gold-500"
              aria-hidden="true"
            />
          )}
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          {method.type === 'mobile_money' && 'Orange / Airtel / M-Pesa'}
          {method.type === 'card' && 'Visa / Mastercard / Amex'}
          {method.type === 'bank_transfer' && 'Virement bancaire'}
          {method.type === 'cash_on_delivery' && 'Paiement à la livraison'}
        </p>

        {method.instructions && (
          <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
            {method.instructions}
          </p>
        )}
      </div>
    </button>
  )
}

function Timer({
  seconds,
  onExpire,
}: {
  seconds: number
  onExpire: () => void
}) {
  const [remaining, setRemaining] = useState(seconds)
  const expiredRef = useRef(false)

  useEffect(() => {
    setRemaining(seconds)
    expiredRef.current = false
  }, [seconds])

  useEffect(() => {
    if (remaining <= 0) {
      if (!expiredRef.current) {
        expiredRef.current = true
        onExpire()
      }

      return
    }

    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1))
    }, 1000)

    return () => clearInterval(id)
  }, [onExpire, remaining])

  const urgent = remaining < 120

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
        urgent
          ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
          : 'border-border bg-card text-muted-foreground'
      )}
      role="timer"
      aria-live="polite"
    >
      <Clock
        size={14}
        className={urgent ? 'animate-pulse' : ''}
        aria-hidden="true"
      />

      <span>Session : {formatTimer(remaining)}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const config: Record<
    PaymentStatus,
    { label: string; variant: any; icon: ReactNode }
  > = {
    idle: {
      label: 'En attente',
      variant: 'neutral',
      icon: <Clock size={12} aria-hidden="true" />,
    },
    processing: {
      label: 'Traitement...',
      variant: 'accent',
      icon: (
        <Loader2
          size={12}
          className="animate-spin"
          aria-hidden="true"
        />
      ),
    },
    pending: {
      label: 'À valider',
      variant: 'warm',
      icon: <Phone size={12} aria-hidden="true" />,
    },
    success: {
      label: 'Payé',
      variant: 'gold',
      icon: <CheckCircle2 size={12} aria-hidden="true" />,
    },
    failed: {
      label: 'Échec',
      variant: 'danger',
      icon: <XCircle size={12} aria-hidden="true" />,
    },
  }

  const c = config[status]

  return (
    <Badge variant={c.variant} size="sm">
      <span className="mr-1">{c.icon}</span>
      {c.label}
    </Badge>
  )
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
  label,
  error,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  label?: string
  error?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-sm font-medium text-foreground">{label}</span>
      )}

      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-xl border border-border bg-card px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'
          )}
          autoComplete="off"
          inputMode="numeric"
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          aria-label={visible ? 'Masquer' : 'Afficher'}
        >
          {visible ? (
            <EyeOff size={16} aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
        </button>
      </div>

      {error && <span className="block text-xs text-red-500">{error}</span>}
    </label>
  )
}

function FactureSidebar({
  order,
  items,
  totals,
  rate,
  showSecondary,
  promoCode,
  shippingMethod,
  estimatedDate,
}: {
  order: OrderSummary | null
  items: RawCartItem[]
  totals: ComputedTotals
  rate: number | null
  showSecondary: boolean
  promoCode: string | null
  shippingMethod: string
  estimatedDate: string
}) {
  const articles = useMemo<OrderArticle[]>(() => {
    if (order?.articles?.length) return order.articles

    return items.map((item) => ({
      nom: getItemName(item),

      quantite: Math.max(
        1,
        Math.floor(Number(item.quantite ?? item.quantity ?? 1) || 1)
      ),

      prix_unitaire: normalizeNumeric(
        item.prix ??
          item.price ??
          item.prix_cdf ??
          item.price_cdf
      ),

      prix_unitaire_usd: normalizeNumeric(
        item.prix_usd ??
          item.price_usd ??
          item.unit_price_usd
      ),

      specifications: getVariantLabel(item.variante),
    }))
  }, [items, order?.articles])

  return (
    <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck
            size={18}
            className="text-gold-500"
            aria-hidden="true"
          />
          Facture abrégée
        </CardTitle>

        <CardDescription>
          {order?.numero ? `Commande n° ${order.numero}` : 'Récapitulatif'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {articles.map((article, idx) => {
            const qty = Math.max(
              1,
              Math.floor(Number(article.quantite) || 1)
            )

            const unitPair = resolvePricePair(
              positiveNumber(article.prix_unitaire_usd) ?? 0,
              positiveNumber(article.prix_unitaire) ?? 0,
              rate
            )

            const linePair: MoneyPair = {
              usd: round2(unitPair.usd * qty),
              cdf: roundCdf(unitPair.cdf * qty),
            }

            const display = selectDisplay(
              linePair,
              totals.primaryCurrency
            )

            const hasPrice =
              linePair.usd > 0 || linePair.cdf > 0

            return (
              <div
                key={`${article.nom}-${idx}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium text-foreground">
                    {article.nom}
                  </p>

                  {article.specifications && (
                    <p className="text-xs text-muted-foreground">
                      {article.specifications}
                    </p>
                  )}

                  <p className="mt-1 text-xs text-muted-foreground">
                    Qté : {qty}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-semibold text-gold-600">
                    {hasPrice
                      ? formatMoney(
                          display.primaryAmount,
                          display.primaryCurrency
                        )
                      : '—'}
                  </p>

                  {showSecondary &&
                    hasPrice &&
                    display.secondaryAmount > 0 &&
                    display.secondaryAmount !== display.primaryAmount && (
                      <p className="text-[11px] text-muted-foreground">
                        ≈{' '}
                        {formatMoney(
                          display.secondaryAmount,
                          display.secondaryCurrency
                        )}
                      </p>
                    )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="space-y-2 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Sous-total</span>

            <span>
              {formatMoney(
                totals.primarySubtotal,
                totals.primaryCurrency
              )}
            </span>
          </div>

          {totals.primaryDiscount > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>
                Remise {promoCode ? `(${promoCode})` : ''}
              </span>

              <span>
                -{' '}
                {formatMoney(
                  totals.primaryDiscount,
                  totals.primaryCurrency
                )}
              </span>
            </div>
          )}

          <div className="flex justify-between text-muted-foreground">
            <span>Livraison</span>

            <span>
              {totals.primaryShipping > 0
                ? formatMoney(
                    totals.primaryShipping,
                    totals.primaryCurrency
                  )
                : 'Incluse'}
            </span>
          </div>
        </div>

        <div className="border-t border-gold-400/20 pt-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Net à payer
              </p>

              <p className="text-xs text-muted-foreground">
                {shippingMethod === 'express'
                  ? 'Express'
                  : shippingMethod === 'point_retrait'
                    ? 'Point de retrait'
                    : 'À domicile'}
              </p>
            </div>

            <div className="text-right">
              <p className="text-2xl font-extrabold text-gold-600">
                {formatMoney(
                  totals.primaryTotal,
                  totals.primaryCurrency
                )}
              </p>

              {showSecondary &&
                totals.secondaryTotal > 0 &&
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
        </div>

        <div className="rounded-2xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Truck
              size={14}
              className="text-gold-500"
              aria-hidden="true"
            />
            Livraison estimée
          </p>

          <p className="mt-1">{estimatedDate}</p>

          {order?.adresse_livraison && (
            <p className="mt-2 line-clamp-2">
              {order.adresse_livraison}
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock
              size={14}
              className="text-gold-500"
              aria-hidden="true"
            />
            <span>Transaction chiffrée SSL/TLS</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck
              size={14}
              className="text-gold-500"
              aria-hidden="true"
            />
            <span>3D Secure activé si disponible</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info
              size={14}
              className="text-gold-500"
              aria-hidden="true"
            />
            <span>Aucun solde interne n’est utilisé</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                */
/* ═══════════════════════════════════════════════════════════════ */

export default function PaiementPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const toast = useToast() as any

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const { user, loading: authLoading } = useAuth()

  const cart = useCart() as any

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

  const accessibility = useAccessibilityPreferences() as any

  const prefersReducedMotion = Boolean(
    accessibility?.prefersReducedMotion ?? accessibility
  )

  const commandeId = searchParams.get('id') || ''

  const currencyParam = searchParams.get('currency')

  const initialCurrency: Currency =
    currencyParam === 'CDF' ? 'CDF' : 'USD'

  /* ---------------------------------------------------------- */
  /* États                                                       */
  /* ---------------------------------------------------------- */

  const [mounted, setMounted] = useState(false)

  const [currency, setCurrency] = useState<Currency>(initialCurrency)
  const [showSecondary, setShowSecondary] = useState(true)

  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loadingMethods, setLoadingMethods] = useState(true)
  const [methodsError, setMethodsError] = useState('')

  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [loadingOrder, setLoadingOrder] = useState(true)
  const [orderError, setOrderError] = useState('')

  const [selectedMethod, setSelectedMethod] =
    useState<PaymentMethod | null>(null)

  const [status, setStatus] = useState<PaymentStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const didInit = useRef(false)
  const clearedCartRef = useRef(false)

  const mobileForm = useForm<MobileFormData>({
    resolver: zodResolver(mobileSchema),
    defaultValues: {
      phone: '',
      pin: '',
      ownerName: '',
    },
  })

  const cardForm = useForm<CardFormData>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      cardHolder: '',
      cardNumber: '',
      expiry: '',
      cvv: '',
      saveCard: false,
    },
  })

  /* ---------------------------------------------------------- */
  /* Taux                                                        */
  /* ---------------------------------------------------------- */

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
  const rate = mounted ? rawRate : null

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  /* ---------------------------------------------------------- */
  /* Panier fallback                                             */
  /* ---------------------------------------------------------- */

  const items: RawCartItem[] = useMemo(
    () => (Array.isArray(cart?.items) ? cart.items : []),
    [cart?.items]
  )

  const summary = useMemo<any>(
    () => cart?.summary ?? {},
    [cart?.summary]
  )

  const activePromo = useMemo<any>(
    () => cart?.activePromo ?? null,
    [cart?.activePromo]
  )

  const clearCart = cart?.clearCart

  /* ---------------------------------------------------------- */
  /* Initialisation préférences                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (didInit.current) return

    didInit.current = true

    /**
     * Si l’URL contient déjà ?currency=..., elle prime.
     * Sinon on restaure la préférence locale.
     */
    if (!currencyParam) {
      const savedCurrency = safeLocalStorageGet<Currency | null>(
        PREF_CURRENCY_KEY,
        null
      )

      if (savedCurrency === 'USD' || savedCurrency === 'CDF') {
        setCurrency(savedCurrency)
      }
    }
  }, [currencyParam])

  useEffect(() => {
    safeLocalStorageSet(PREF_CURRENCY_KEY, currency)
  }, [currency])

  /* ---------------------------------------------------------- */
  /* Auth redirect                                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(
        `/login?redirect=${encodeURIComponent(
          `/commande/paiement?id=${commandeId}`
        )}`
      )
    }
  }, [authLoading, commandeId, router, user])

  /* ---------------------------------------------------------- */
  /* Prévention fermeture onglet pendant paiement                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (status !== 'processing' && status !== 'pending') return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)

    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  /* ---------------------------------------------------------- */
  /* Chargement commande                                         */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!commandeId) {
      setOrderError('Identifiant de commande manquant.')
      setLoadingOrder(false)
      return
    }

    if (!user) return

    let cancelled = false

    const loadOrder = async () => {
      setLoadingOrder(true)
      setOrderError('')

      try {
        const res = await fetch(`/api/commandes/${commandeId}`, {
          credentials: 'include',
        })

        const payload = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(
            payload?.error ||
              'Impossible de charger la commande.'
          )
        }

        if (!cancelled) {
          setOrder(normalizeOrder(payload, commandeId))
        }
      } catch (err: any) {
        if (!cancelled) {
          setOrderError(
            err?.message || 'Erreur chargement commande.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingOrder(false)
        }
      }
    }

    loadOrder()

    return () => {
      cancelled = true
    }
  }, [commandeId, user])

  /* ---------------------------------------------------------- */
  /* Si commande déjà payée                                      */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!order || !commandeId) return

    if (PAID_STATUSES.has(order.statut)) {
      router.replace(
        `/commande/confirmation?id=${encodeURIComponent(commandeId)}`
      )
    }
  }, [commandeId, order, router])

  /* ---------------------------------------------------------- */
  /* Chargement moyens de paiement                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!user) return

    let cancelled = false

    const loadMethods = async () => {
      setLoadingMethods(true)
      setMethodsError('')

      try {
        const res = await fetch('/api/admin/moyens-paiement', {
          credentials: 'include',
        })

        const payload = await res.json().catch(() => [])

        if (!res.ok) {
          throw new Error(
            payload?.error ||
              'Impossible de charger les moyens de paiement.'
          )
        }

        const rawList = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : []

        const filtered: PaymentMethod[] = rawList.filter(
          (m: any) =>
            m?.actif !== false &&
            m?.type !== 'wallet' &&
            m?.code !== 'wallet'
        )

        if (!cancelled) {
          setMethods(filtered)

          const lastCode = safeLocalStorageGet<string | null>(
            LAST_METHOD_KEY,
            null
          )

          const last = filtered.find((m) => m.code === lastCode)

          if (last) {
            setSelectedMethod(last)
          } else if (filtered.length > 0) {
            setSelectedMethod(filtered[0])
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setMethodsError(
            err?.message || 'Erreur chargement moyens.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingMethods(false)
        }
      }
    }

    loadMethods()

    return () => {
      cancelled = true
    }
  }, [user])

  /* ---------------------------------------------------------- */
  /* Totaux alignés                                              */
  /* ---------------------------------------------------------- */

  const orderTotals = useMemo(() => {
    const currentRateNum = Number(rate)
    const currentRateOk =
      Number.isFinite(currentRateNum) && currentRateNum > 0

    /* ------------------------------------------------------ */
    /* Fallback panier                                         */
    /* ------------------------------------------------------ */

    const cartSubtotalPair = resolvePricePair(
      firstPositive(
        summary?.sousTotalUSD,
        summary?.subtotalUSD,
        summary?.sous_total_usd
      ),
      firstPositive(
        summary?.sousTotal,
        summary?.subtotal,
        summary?.sous_total
      ),
      rate
    )

    const cartDiscountPair = resolvePricePair(
      firstPositive(
        summary?.remiseTotalUSD,
        summary?.discountUSD,
        summary?.remise_total_usd,
        summary?.promoReductionUsd
      ),
      firstPositive(
        summary?.remiseTotal,
        summary?.discount,
        summary?.remise_total
      ),
      rate
    )

    const cartShippingPair = resolvePricePair(
      firstPositive(
        summary?.shippingEstimateUsd,
        summary?.shippingQuote?.total_usd
      ),
      firstPositive(
        summary?.shippingEstimateCdf,
        summary?.shippingQuote?.total_cdf,
        summary?.fraisLivraison
      ),
      rate
    )

    const cartTotalPair = resolvePricePair(
      firstPositive(
        summary?.totalUSD,
        summary?.total_usd
      ),
      firstPositive(summary?.total),
      rate
    )

    /* ------------------------------------------------------ */
    /* Commande serveur : priorité absolue                     */
    /* ------------------------------------------------------ */

    const hasOrderSubtotal =
      order?.subtotal_usd !== undefined ||
      order?.subtotal_cdf !== undefined

    const orderSubtotalPair = resolvePricePair(
      positiveNumber(order?.subtotal_usd) ?? 0,
      positiveNumber(order?.subtotal_cdf) ?? 0,
      rate
    )

    const subtotalPair = hasOrderSubtotal
      ? orderSubtotalPair
      : cartSubtotalPair

    const hasOrderDiscount =
      order?.reduction_usd !== undefined ||
      order?.reduction_cdf !== undefined

    const orderDiscountPair = resolvePricePair(
      positiveNumber(order?.reduction_usd) ?? 0,
      positiveNumber(order?.reduction_cdf) ?? 0,
      rate
    )

    const discountRawPair = hasOrderDiscount
      ? orderDiscountPair
      : cartDiscountPair

    const discountPair = capPair(
      discountRawPair,
      subtotalPair,
      rate
    )

    const hasOrderShipping =
      order?.shipping_usd !== undefined ||
      order?.shipping_cdf !== undefined

    const orderShippingPair = resolvePricePair(
      positiveNumber(order?.shipping_usd) ?? 0,
      positiveNumber(order?.shipping_cdf) ?? 0,
      rate
    )

    const shippingPair = hasOrderShipping
      ? orderShippingPair
      : cartShippingPair

    const hasOrderTotal =
      order?.total_usd !== undefined ||
      order?.total_cdf !== undefined

    let totalPair: MoneyPair = hasOrderTotal
      ? resolvePricePair(
          positiveNumber(order?.total_usd) ?? 0,
          positiveNumber(order?.total_cdf) ?? 0,
          rate
        )
      : { usd: 0, cdf: 0 }

    if (
      !hasOrderTotal ||
      (totalPair.usd <= 0 && totalPair.cdf <= 0)
    ) {
      const computedUsd = round2(
        Math.max(
          0,
          subtotalPair.usd - discountPair.usd + shippingPair.usd
        )
      )

      const computedCdf =
        currentRateOk && computedUsd > 0
          ? roundCdf(toCdf(computedUsd, currentRateNum))
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

    /**
     * USD = vérité.
     * Si USD existe et taux disponible, CDF recalculé.
     */
    if (currentRateOk && totalPair.usd > 0) {
      totalPair.cdf = roundCdf(
        toCdf(totalPair.usd, currentRateNum)
      )
    } else if (
      currentRateOk &&
      totalPair.cdf > 0 &&
      totalPair.usd <= 0
    ) {
      totalPair.usd = round2(
        toUsd(totalPair.cdf, currentRateNum)
      )
    }

    return {
      subtotalPair,
      discountPair,
      shippingPair,
      totalPair,
      cartTotalPair,
    }
  }, [order, rate, summary])

  const totals = useMemo<ComputedTotals>(() => {
    const { subtotalPair, discountPair, shippingPair, totalPair } =
      orderTotals

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

    const primaryCurrency: Currency =
      currency === 'CDF' && hasCdf
        ? 'CDF'
        : hasUsd
          ? 'USD'
          : hasCdf
            ? 'CDF'
            : 'USD'

    const secondaryCurrency: Currency =
      primaryCurrency === 'USD' ? 'CDF' : 'USD'

    const displaySubtotal = selectDisplay(
      subtotalPair,
      primaryCurrency
    )

    const displayDiscount = selectDisplay(
      discountPair,
      primaryCurrency
    )

    const displayShipping = selectDisplay(
      shippingPair,
      primaryCurrency
    )

    const displayTotal = selectDisplay(
      totalPair,
      primaryCurrency
    )

    return {
      subtotalUsd: subtotalPair.usd,
      subtotalCdf: subtotalPair.cdf,

      discountUsd: discountPair.usd,
      discountCdf: discountPair.cdf,

      shippingUsd: shippingPair.usd,
      shippingCdf: shippingPair.cdf,

      totalUsd: totalPair.usd,
      totalCdf: totalPair.cdf,

      primarySubtotal: displaySubtotal.primaryAmount,
      secondarySubtotal: displaySubtotal.secondaryAmount,

      primaryDiscount: displayDiscount.primaryAmount,
      secondaryDiscount: displayDiscount.secondaryAmount,

      primaryShipping: displayShipping.primaryAmount,
      secondaryShipping: displayShipping.secondaryAmount,

      primaryTotal: displayTotal.primaryAmount,
      secondaryTotal: displayTotal.secondaryAmount,

      primaryCurrency,
      secondaryCurrency,
    }
  }, [currency, orderTotals])

  const amountUsd = round2(totals.totalUsd)

  const amountCdf =
    rateOk && amountUsd > 0
      ? roundCdf(toCdf(amountUsd, rateNum))
      : roundCdf(totals.totalCdf)

  const paymentAmount =
    totals.primaryCurrency === 'USD'
      ? round2(totals.primaryTotal)
      : roundCdf(totals.primaryTotal)

  const promoCode =
    order?.promo_code ||
    activePromo?.code ||
    null

  const shippingMethod =
    order?.type_livraison || 'domicile'

  const delayLabel =
    order?.shipping_delay_label || null

  const estimatedDate = useMemo(() => {
    if (delayLabel) return delayLabel

    const days =
      shippingMethod === 'express'
        ? 1
        : shippingMethod === 'point_retrait'
          ? 2
          : 3

    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
  }, [delayLabel, shippingMethod])

  const idempotencyKey = useMemo(() => {
    return `${commandeId}:${selectedMethod?.code || 'none'}:${retryCount}`
  }, [commandeId, retryCount, selectedMethod?.code])

  /* ---------------------------------------------------------- */
  /* Sélection moyen                                             */
  /* ---------------------------------------------------------- */

  const handleSelectMethod = useCallback(
    (method: PaymentMethod) => {
      setSelectedMethod(method)
      setErrorMessage('')
      setStatus('idle')
      setTransactionId(null)

      safeLocalStorageSet(LAST_METHOD_KEY, method.code)
    },
    []
  )

  /* ---------------------------------------------------------- */
  /* Exécution paiement                                          */
  /* ---------------------------------------------------------- */

  const executePaymentRequest = useCallback(
    async (extraPayload: Record<string, any>) => {
      if (!isOnline) {
        setErrorMessage(
          'Connexion internet requise pour valider le paiement.'
        )

        setStatus('failed')

        addToast({
          type: 'error',
          message: 'Connexion internet requise.',
        })

        return
      }

      if (!commandeId || !selectedMethod || !order) {
        setErrorMessage(
          'Commande ou moyen de paiement incomplet.'
        )

        setStatus('failed')

        return
      }

      if (amountUsd <= 0) {
        setErrorMessage(
          'Le montant USD principal est indisponible. Vérifiez le taux de change ou rechargez la page.'
        )

        setStatus('failed')

        addToast({
          type: 'error',
          message: 'Montant USD indisponible.',
        })

        return
      }

      if (paymentAmount <= 0) {
        setErrorMessage(
          'Le montant à payer est invalide.'
        )

        setStatus('failed')

        return
      }

      setStatus('processing')
      setErrorMessage('')

      try {
        const payload = {
          commande_id: commandeId,
          method: selectedMethod.code,

          amount: paymentAmount,
          currency: totals.primaryCurrency,

          amount_usd: amountUsd,
          amount_cdf: amountCdf,

          total_usd: amountUsd,
          total_cdf: amountCdf,

          subtotal_usd: round2(totals.subtotalUsd),
          subtotal_cdf: roundCdf(totals.subtotalCdf),

          reduction_usd: round2(totals.discountUsd),
          reduction_cdf: roundCdf(totals.discountCdf),

          shipping_usd: round2(totals.shippingUsd),
          shipping_cdf: roundCdf(totals.shippingCdf),

          exchange_rate: rate,

          idempotency_key: idempotencyKey,

          ...extraPayload,
        }

        const res = await fetch('/api/paiement', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(
            data?.error ||
              'Erreur lors de la transaction.'
          )
        }

        if (data?.status === 'failed') {
          throw new Error(
            data?.message ||
              'Le paiement a échoué.'
          )
        }

        setTransactionId(
          data?.transactionId ||
            data?.reference ||
            data?.id ||
            null
        )

        if (data?.status === 'pending') {
          setStatus('pending')

          addToast({
            type: 'info',
            message:
              data?.message ||
              'Validez le prompt USSD sur votre téléphone pour finaliser.',
          })

          return
        }

        setStatus('success')

        if (!prefersReducedMotion) {
          triggerConfetti()
        }

        addToast({
          type: 'success',
          message:
            data?.message || 'Paiement réussi !',
        })

        if (!clearedCartRef.current) {
          clearedCartRef.current = true

          try {
            if (typeof clearCart === 'function') {
              await clearCart()
            }
          } catch {
            // silencieux
          }
        }

        setTimeout(() => {
          router.push(
            `/commande/confirmation?id=${encodeURIComponent(
              commandeId
            )}`
          )
        }, 2200)
      } catch (err: any) {
        const msg =
          err?.message ||
          'Impossible de traiter le paiement.'

        setErrorMessage(msg)
        setStatus('failed')

        addToast({
          type: 'error',
          message: msg,
        })
      }
    },
    [
      addToast,
      amountCdf,
      amountUsd,
      commandeId,
      clearCart,
      idempotencyKey,
      isOnline,
      order,
      paymentAmount,
      prefersReducedMotion,
      rate,
      router,
      selectedMethod,
      totals,
    ]
  )

  const handleMobileSubmit = useCallback(
    (data: MobileFormData) => {
      void executePaymentRequest({
        phone: data.phone.trim().replace(/\s+/g, ''),
        pin: data.pin?.trim() || undefined,
        owner_name: data.ownerName?.trim() || undefined,
      })
    },
    [executePaymentRequest]
  )

  const handleCardSubmit = useCallback(
    (data: CardFormData) => {
      void executePaymentRequest({
        card: {
          number: data.cardNumber.replace(/\s/g, ''),
          holder: data.cardHolder.trim(),
          expiry: data.expiry,
          cvv: data.cvv,
          brand: detectCardBrand(data.cardNumber),
        },
        save_card: data.saveCard,
      })
    },
    [executePaymentRequest]
  )

  const handleCashSubmit = useCallback(() => {
    void executePaymentRequest({})
  }, [executePaymentRequest])

  const handleSubmit = useCallback(() => {
    if (!selectedMethod) {
      addToast({
        type: 'error',
        message: 'Veuillez choisir un moyen de paiement.',
      })

      return
    }

    if (selectedMethod.type === 'mobile_money') {
      mobileForm.handleSubmit(handleMobileSubmit)()
      return
    }

    if (selectedMethod.type === 'card') {
      cardForm.handleSubmit(handleCardSubmit)()
      return
    }

    handleCashSubmit()
  }, [
    addToast,
    cardForm,
    handleCashSubmit,
    handleCardSubmit,
    handleMobileSubmit,
    mobileForm,
    selectedMethod,
  ])

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1)
    setStatus('idle')
    setErrorMessage('')
    setTransactionId(null)
  }, [])

  const handleExpire = useCallback(() => {
    if (
      status === 'success' ||
      status === 'processing' ||
      status === 'pending'
    ) {
      return
    }

    setStatus('failed')

    setErrorMessage(
      'Votre session de paiement a expiré. Veuillez réessayer.'
    )

    addToast({
      type: 'error',
      message: 'Session expirée.',
    })
  }, [addToast, status])

  /* ---------------------------------------------------------- */
  /* Guards                                                      */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="space-y-4 text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2
            size={36}
            className="mx-auto animate-spin text-gold-500"
            aria-hidden="true"
          />

          <p className="text-sm text-muted-foreground">
            Vérification de votre session...
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2
          size={32}
          className="animate-spin text-gold-500"
          aria-hidden="true"
        />
      </div>
    )
  }

  if (orderError && !order) {
    return (
      <Container className="py-16">
        <Card className="mx-auto max-w-md border-red-500/30 bg-red-500/5 p-8 text-center">
          <AlertTriangle
            size={48}
            className="mx-auto mb-4 text-red-500"
            aria-hidden="true"
          />

          <p className="mb-4 text-muted-foreground">
            {orderError}
          </p>

          <Link href="/panier">
            <Button variant="luxe">
              Retour au panier
            </Button>
          </Link>
        </Card>
      </Container>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  const isProcessing =
    status === 'processing' || status === 'pending'

  const isSuccess = status === 'success'
  const isFailed = status === 'failed'

  const canSubmit =
    !loadingOrder &&
    !orderError &&
    !!order &&
    !!selectedMethod &&
    !!commandeId &&
    !isProcessing &&
    !isSuccess &&
    isOnline &&
    paymentAmount > 0 &&
    amountUsd > 0

  const cardNumberValue = cardForm.watch('cardNumber') || ''
  const cardBrand = detectCardBrand(cardNumberValue)

  const missingUsdAlert =
    amountUsd <= 0 && totals.totalCdf > 0

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-16">
      <Container className="py-8 md:py-12">
        <Stepper currentStep="payment" />

        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/commande"
              className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-gold-500"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Retour à la commande
            </Link>

            <h1 className="font-serif text-3xl font-extrabold text-foreground md:text-4xl">
              Paiement sécurisé
            </h1>

            <p className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
              <span>
                Commande{' '}
                {order?.numero
                  ? `n° ${order.numero}`
                  : commandeId.slice(0, 8)}
              </span>

              <StatusBadge status={status} />

              {transactionId && (
                <span className="text-xs text-muted-foreground">
                  Réf. {transactionId.slice(0, 12)}...
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Devise */}
            <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs">
              {(['USD', 'CDF'] as Currency[]).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setCurrency(curr)}
                  disabled={isProcessing}
                  className={cn(
                    'rounded-full px-3 py-1.5 font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60',
                    currency === curr
                      ? 'bg-gold-500 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-pressed={currency === curr}
                >
                  {curr}
                </button>
              ))}
            </div>

            {/* Prix secondaire */}
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

            {/* Timer */}
            {!isSuccess && (
              <Timer
                seconds={
                  SESSION_DURATION_SECONDS + retryCount * 60
                }
                onExpire={handleExpire}
              />
            )}
          </div>
        </div>

        {/* Alertes */}
        {!isOnline && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <WifiOff
              size={18}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />

            <p>
              Vous êtes hors ligne. Le paiement nécessite une connexion
              internet stable. Reconnectez-vous puis réessayez.
            </p>
          </div>
        )}

        {rateLoading && !rateOk && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            <RefreshCw
              size={18}
              className="mt-0.5 shrink-0 animate-spin"
              aria-hidden="true"
            />

            <p>
              Chargement du taux USD/CDF... Le montant final sera confirmé
              après réception du taux officiel.
            </p>
          </div>
        )}

        {missingUsdAlert && !rateLoading && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />

            <p>
              Le montant USD principal est indisponible. Le paiement ne peut
              pas être validé tant que la conversion officielle n’est pas
              prête.
            </p>
          </div>
        )}

        {status === 'pending' && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            <Phone
              size={18}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />

            <p>
              En attente de validation sur votre téléphone. Ne fermez pas
              cette page.
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={18}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />

              <div>
                <p className="font-medium">Échec du paiement</p>
                <p className="mt-1">{errorMessage}</p>
              </div>
            </div>

            {isFailed && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                leftIcon={
                  <RefreshCw
                    size={14}
                    aria-hidden="true"
                  />
                }
              >
                Réessayer
              </Button>
            )}
          </div>
        )}

        {isSuccess && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center"
          >
            <CheckCircle2
              size={48}
              className="mx-auto mb-3 text-emerald-500"
              aria-hidden="true"
            />

            <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
              Paiement approuvé !
            </h2>

            <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
              Préparation de votre confirmation...
            </p>
          </motion.div>
        )}

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Colonne principale */}
          <div className="space-y-6 lg:col-span-2">
            {/* Moyens de paiement */}
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard
                    size={18}
                    className="text-gold-500"
                    aria-hidden="true"
                  />
                  Moyen de paiement
                </CardTitle>

                <CardDescription>
                  Choisissez comment vous souhaitez payer votre commande.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {loadingMethods ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className="h-24 w-full rounded-2xl"
                      />
                    ))}
                  </div>
                ) : methodsError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                    {methodsError}
                  </div>
                ) : methods.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                    Aucun moyen de paiement disponible pour le moment.
                    Contactez le support.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {methods.map((method) => (
                      <MethodCard
                        key={method.id}
                        method={method}
                        selected={selectedMethod?.id === method.id}
                        onSelect={() => handleSelectMethod(method)}
                        disabled={isProcessing || isSuccess}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Formulaire dynamique */}
            <AnimatePresence mode="wait">
              {selectedMethod?.type === 'mobile_money' && (
                <motion.div
                  key="mobile"
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { opacity: 0, y: 10 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { opacity: 0, y: -10 }
                  }
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.2,
                  }}
                >
                  <Card variant="glass" className="border-gold-400/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Smartphone
                          size={18}
                          className="text-gold-500"
                          aria-hidden="true"
                        />
                        {selectedMethod.nom}
                      </CardTitle>

                      <CardDescription>
                        Saisissez le numéro lié à votre compte Mobile Money.
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {selectedMethod.instructions && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                          <p className="flex items-center gap-2 font-medium">
                            <Info
                              size={14}
                              aria-hidden="true"
                            />
                            Instructions
                          </p>

                          <p className="mt-1 whitespace-pre-line">
                            {selectedMethod.instructions}
                          </p>
                        </div>
                      )}

                      <form
                        id="mobile-form"
                        onSubmit={mobileForm.handleSubmit(
                          handleMobileSubmit
                        )}
                        className="space-y-4"
                      >
                        <label className="block space-y-1.5">
                          <span className="text-sm font-medium text-foreground">
                            Numéro Mobile Money
                            <span className="ml-1 text-red-500">*</span>
                          </span>

                          <div className="relative">
                            <Phone
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                              aria-hidden="true"
                            />

                            <input
                              {...mobileForm.register('phone')}
                              disabled={isProcessing || isSuccess}
                              placeholder="08xxxxxxxx"
                              inputMode="tel"
                              autoComplete="tel"
                              className={cn(
                                'w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'
                              )}
                            />
                          </div>

                          {mobileForm.formState.errors.phone && (
                            <span className="block text-xs text-red-500">
                              {mobileForm.formState.errors.phone.message}
                            </span>
                          )}
                        </label>

                        <label className="block space-y-1.5">
                          <span className="text-sm font-medium text-foreground">
                            Nom du titulaire
                          </span>

                          <input
                            {...mobileForm.register('ownerName')}
                            disabled={isProcessing || isSuccess}
                            placeholder="Optionnel"
                            className={cn(
                              'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'
                            )}
                          />
                        </label>

                        <Controller
                          name="pin"
                          control={mobileForm.control}
                          render={({ field }) => (
                            <PasswordInput
                              label="Code PIN (optionnel)"
                              value={field.value || ''}
                              onChange={field.onChange}
                              disabled={isProcessing || isSuccess}
                              placeholder="••••"
                              error={
                                mobileForm.formState.errors.pin?.message
                              }
                            />
                          )}
                        />

                        <p className="text-xs text-muted-foreground">
                          Un prompt USSD sera envoyé sur votre téléphone pour
                          valider le paiement. Ne fermez pas cette page.
                        </p>
                      </form>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {selectedMethod?.type === 'card' && (
                <motion.div
                  key="card"
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { opacity: 0, y: 10 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { opacity: 0, y: -10 }
                  }
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.2,
                  }}
                >
                  <Card variant="glass" className="border-gold-400/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CreditCard
                          size={18}
                          className="text-gold-500"
                          aria-hidden="true"
                        />
                        {selectedMethod.nom}
                      </CardTitle>

                      <CardDescription>
                        Paiement par carte Visa / Mastercard / Amex.
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {selectedMethod.instructions && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                          <p className="flex items-center gap-2 font-medium">
                            <Info
                              size={14}
                              aria-hidden="true"
                            />
                            Instructions
                          </p>

                          <p className="mt-1 whitespace-pre-line">
                            {selectedMethod.instructions}
                          </p>
                        </div>
                      )}

                      <form
                        id="card-form"
                        onSubmit={cardForm.handleSubmit(
                          handleCardSubmit
                        )}
                        className="space-y-4"
                      >
                        <label className="block space-y-1.5">
                          <span className="text-sm font-medium text-foreground">
                            Nom du titulaire
                            <span className="ml-1 text-red-500">*</span>
                          </span>

                          <input
                            {...cardForm.register('cardHolder')}
                            disabled={isProcessing || isSuccess}
                            placeholder="JEAN MUKENDI"
                            autoComplete="cc-name"
                            className={cn(
                              'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm uppercase text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'
                            )}
                          />

                          {cardForm.formState.errors.cardHolder && (
                            <span className="block text-xs text-red-500">
                              {
                                cardForm.formState.errors.cardHolder
                                  .message
                              }
                            </span>
                          )}
                        </label>

                        <label className="block space-y-1.5">
                          <span className="text-sm font-medium text-foreground">
                            Numéro de carte
                            <span className="ml-1 text-red-500">*</span>
                          </span>

                          <div className="relative">
                            <CreditCard
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                              aria-hidden="true"
                            />

                            <input
                              {...cardForm.register('cardNumber')}
                              disabled={isProcessing || isSuccess}
                              placeholder="4242 4242 4242 4242"
                              inputMode="numeric"
                              autoComplete="cc-number"
                              maxLength={23}
                              className={cn(
                                'w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-20 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'
                              )}
                            />

                            {cardNumberValue.length >= 4 && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                {cardBrand}
                              </span>
                            )}
                          </div>

                          {cardForm.formState.errors.cardNumber && (
                            <span className="block text-xs text-red-500">
                              {
                                cardForm.formState.errors.cardNumber
                                  .message
                              }
                            </span>
                          )}
                        </label>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block space-y-1.5">
                            <span className="text-sm font-medium text-foreground">
                              Expiration
                              <span className="ml-1 text-red-500">*</span>
                            </span>

                            <input
                              {...cardForm.register('expiry')}
                              disabled={isProcessing || isSuccess}
                              placeholder="MM/AA"
                              inputMode="numeric"
                              autoComplete="cc-exp"
                              maxLength={5}
                              className={cn(
                                'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'
                              )}
                            />

                            {cardForm.formState.errors.expiry && (
                              <span className="block text-xs text-red-500">
                                {
                                  cardForm.formState.errors.expiry
                                    .message
                                }
                              </span>
                            )}
                          </label>

                          <Controller
                            name="cvv"
                            control={cardForm.control}
                            render={({ field }) => (
                              <PasswordInput
                                label="CVV *"
                                value={field.value || ''}
                                onChange={(v) =>
                                  field.onChange(
                                    v.replace(/\D/g, '').slice(0, 4)
                                  )
                                }
                                disabled={isProcessing || isSuccess}
                                placeholder="123"
                                error={
                                  cardForm.formState.errors.cvv?.message
                                }
                              />
                            )}
                          />
                        </div>

                        <label className="flex items-center gap-3 rounded-2xl border border-border bg-background/60 p-3">
                          <input
                            type="checkbox"
                            {...cardForm.register('saveCard')}
                            disabled={isProcessing || isSuccess}
                            className="h-4 w-4 rounded border-border text-gold-500 focus:ring-gold-400"
                          />

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">
                              Enregistrer cette carte
                            </p>

                            <p className="text-xs text-muted-foreground">
                              Pour accélérer vos prochains paiements.
                            </p>
                          </div>
                        </label>

                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Lock
                            size={12}
                            className="text-gold-500"
                            aria-hidden="true"
                          />
                          Vos données bancaires sont chiffrées et ne sont
                          jamais stockées en clair.
                        </p>
                      </form>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {selectedMethod &&
                selectedMethod.type !== 'mobile_money' &&
                selectedMethod.type !== 'card' && (
                  <motion.div
                    key="other"
                    initial={
                      prefersReducedMotion
                        ? { opacity: 1 }
                        : { opacity: 0, y: 10 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      prefersReducedMotion
                        ? { opacity: 1 }
                        : { opacity: 0, y: -10 }
                    }
                  >
                    <Card variant="glass" className="border-gold-400/20">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          {METHOD_ICONS[selectedMethod.type] || (
                            <Package
                              size={18}
                              aria-hidden="true"
                            />
                          )}
                          {selectedMethod.nom}
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {selectedMethod.instructions && (
                          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                            <p className="flex items-center gap-2 font-medium">
                              <Info
                                size={14}
                                aria-hidden="true"
                              />
                              Instructions
                            </p>

                            <p className="mt-1 whitespace-pre-line">
                              {selectedMethod.instructions}
                            </p>
                          </div>
                        )}

                        <p className="text-sm text-muted-foreground">
                          Cliquez sur « Confirmer le paiement » pour valider
                          votre commande avec ce mode.
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
            </AnimatePresence>

            {/* Aide / contact */}
            <Card variant="glass" className="border-border">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-muted p-2 text-gold-500">
                      <ShieldCheck
                        size={18}
                        aria-hidden="true"
                      />
                    </div>

                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Besoin d’aide ?
                      </p>

                      <p className="text-xs text-muted-foreground">
                        Contactez le support avant de finaliser si un doute.
                      </p>
                    </div>
                  </div>

                  <Link href="/profile?tab=support">
                    <Button variant="outline" size="sm">
                      Ouvrir un ticket
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              {loadingOrder && !order ? (
                <Card className="border-gold-400/20 bg-card/70">
                  <CardContent className="space-y-3 p-5">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              ) : (
                <FactureSidebar
                  order={order}
                  items={items}
                  totals={totals}
                  rate={rate}
                  showSecondary={showSecondary}
                  promoCode={promoCode}
                  shippingMethod={shippingMethod}
                  estimatedDate={estimatedDate}
                />
              )}
            </div>
          </div>
        </div>
      </Container>

      {/* Barre mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Net à payer</p>

            <p className="truncate text-lg font-bold text-gold-600">
              {formatMoney(
                totals.primaryTotal,
                totals.primaryCurrency
              )}
            </p>

            {showSecondary &&
              totals.secondaryTotal > 0 &&
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

          <Button
            variant="luxe"
            className="shrink-0"
            disabled={!canSubmit}
            onClick={handleSubmit}
            leftIcon={
              isProcessing ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : isSuccess ? (
                <CheckCircle2
                  size={16}
                  aria-hidden="true"
                />
              ) : (
                <Lock size={16} aria-hidden="true" />
              )
            }
          >
            {isProcessing
              ? 'Traitement...'
              : isSuccess
                ? 'Payé'
                : 'Payer'}
          </Button>
        </div>
      </div>

      {/* CTA desktop flottant */}
      <div className="hidden lg:block">
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            variant="luxe"
            size="lg"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="shadow-gold hover:shadow-glow-gold"
            leftIcon={
              isProcessing ? (
                <Loader2
                  size={18}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : isSuccess ? (
                <CheckCircle2
                  size={18}
                  aria-hidden="true"
                />
              ) : (
                <Zap size={18} aria-hidden="true" />
              )
            }
          >
            {isProcessing
              ? 'Traitement...'
              : isSuccess
                ? 'Paiement confirmé'
                : `Payer ${formatMoney(
                    totals.primaryTotal,
                    totals.primaryCurrency
                  )}`}
          </Button>
        </div>
      </div>
    </div>
  )
}