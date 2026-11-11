// app/commande/paiement/page.tsx
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
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'

import { cn } from '@/lib/utils'

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
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
  Tag,
  Truck,
  WifiOff,
  X,
  XCircle,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'
type PaymentStatus = 'idle' | 'processing' | 'pending' | 'success' | 'failed'
type MethodType = 'mobile_money' | 'card' | 'bank_transfer' | 'cash_on_delivery'

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

interface OrderArticle {
  nom: string
  quantite: number
  prix_unitaire: number
  specifications?: string | null
}

interface OrderSummary {
  id: string
  numero: string
  total: number
  total_global?: number
  statut: string
  type_livraison: string
  adresse_livraison?: string | null
  articles: OrderArticle[]
}

interface RawCartItem {
  id?: string
  product_id?: string
  nom?: string
  name?: string
  prix?: number | null
  price?: number | null
  prix_usd?: number | null
  price_usd?: number | null
  quantite?: number | null
  quantity?: number | null
  image?: string | null
  images?: string[] | null
  variante?: any
  [key: string]: any
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PLACEHOLDER = '/placeholder.jpg'
const SESSION_DURATION_SECONDS = 15 * 60 // 15 minutes
const LAST_METHOD_KEY = 'gercie_last_payment_method_v2'
const PREF_CURRENCY_KEY = 'gercie_pref_currency_v2'

const STEPS = [
  { id: 'cart', label: 'Panier', icon: ShoppingBag },
  { id: 'checkout', label: 'Commande', icon: MapPin },
  { id: 'payment', label: 'Paiement', icon: CreditCard },
  { id: 'confirmation', label: 'Confirmation', icon: CheckCircle2 },
]

const METHOD_ICONS: Record<MethodType, React.ReactNode> = {
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
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toPositiveNumber(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
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
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

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

function getItemImage(item: RawCartItem): string {
  if (typeof item.image === 'string' && item.image.trim()) return item.image
  if (Array.isArray(item.images) && item.images.length > 0) return item.images[0]
  return PLACEHOLDER
}

function getItemName(item: RawCartItem): string {
  return String(item.nom || item.name || 'Produit')
}

function getVariantLabel(item: RawCartItem): string | null {
  if (!item.variante) return null
  if (typeof item.variante === 'string') return item.variante

  const attrs = item.variante?.attributes
  if (attrs && typeof attrs === 'object') {
    const values = Object.values(attrs).filter(Boolean).map(String)
    if (values.length > 0) return values.join(' • ')
  }

  return null
}

function triggerConfetti() {
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
  cvv: z.string().length(3, 'CVV à 3 chiffres').regex(/^\d{3}$/, 'CVV invalide'),
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
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide">
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

              <span className="text-xs font-medium sm:text-sm">{step.label}</span>
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
  const gradient = METHOD_COLORS[method.type] || 'from-neutral-500/20 to-neutral-600/20'
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
          <p className="truncate text-sm font-semibold text-foreground">{method.nom}</p>
          {selected && <CheckCircle2 size={16} className="shrink-0 text-gold-500" />}
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
  }, [remaining, onExpire])

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
      <Clock size={14} className={urgent ? 'animate-pulse' : ''} />
      <span>Session : {formatTimer(remaining)}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const config: Record<PaymentStatus, { label: string; variant: any; icon: React.ReactNode }> = {
    idle: { label: 'En attente', variant: 'neutral', icon: <Clock size={12} /> },
    processing: { label: 'Traitement...', variant: 'accent', icon: <Loader2 size={12} className="animate-spin" /> },
    pending: { label: 'À valider', variant: 'warm', icon: <Phone size={12} /> },
    success: { label: 'Payé', variant: 'gold', icon: <CheckCircle2 size={12} /> },
    failed: { label: 'Échec', variant: 'danger', icon: <XCircle size={12} /> },
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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
          aria-label={visible ? 'Masquer' : 'Afficher'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
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
  currency,
  showSecondary,
  activePromo,
  shippingMethod,
  estimatedDate,
}: {
  order: OrderSummary | null
  items: RawCartItem[]
  totals: {
    subtotalUsd: number
    subtotalCdf: number
    discountUsd: number
    discountCdf: number
    shippingUsd: number
    shippingCdf: number
    totalUsd: number
    totalCdf: number
    primaryTotal: number
    secondaryTotal: number
    primarySubtotal: number
    secondarySubtotal: number
    primaryDiscount: number
    secondaryDiscount: number
    primaryShipping: number
    secondaryShipping: number
    primaryCurrency: Currency
    secondaryCurrency: Currency
  }
  currency: Currency
  showSecondary: boolean
  activePromo: any
  shippingMethod: string
  estimatedDate: string
}) {
  const articles = order?.articles?.length
    ? order.articles
    : items.map((i) => ({
        nom: getItemName(i),
        quantite: Number(i.quantite ?? i.quantity ?? 1),
        prix_unitaire: Number(i.prix ?? i.price ?? 0),
        specifications: getVariantLabel(i),
      }))

  return (
    <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck size={18} className="text-gold-500" />
          Facture abrégée
        </CardTitle>
        <CardDescription>
          {order?.numero ? `Commande n° ${order.numero}` : 'Récapitulatif'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Articles */}
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {articles.map((article: any, idx: number) => {
            const unitCdf = Number(article.prix_unitaire || 0)
            const unitUsd =
              totals.subtotalCdf > 0
                ? (unitCdf * totals.subtotalUsd) / totals.subtotalCdf
                : 0
            const qty = Number(article.quantite || 1)
            const lineCdf = unitCdf * qty
            const lineUsd = unitUsd * qty

            const primary = totals.primaryCurrency === 'USD' ? lineUsd : lineCdf
            const secondary = totals.secondaryCurrency === 'USD' ? lineUsd : lineCdf

            return (
              <div
                key={idx}
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
                    {formatMoney(primary, totals.primaryCurrency)}
                  </p>
                  {showSecondary && (
                    <p className="text-[11px] text-muted-foreground">
                      ≈ {formatMoney(secondary, totals.secondaryCurrency)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Totaux */}
        <div className="space-y-2 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Sous-total</span>
            <span>{formatMoney(totals.primarySubtotal, totals.primaryCurrency)}</span>
          </div>

          {totals.primaryDiscount > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>
                Remise {activePromo?.code ? `(${activePromo.code})` : ''}
              </span>
              <span>- {formatMoney(totals.primaryDiscount, totals.primaryCurrency)}</span>
            </div>
          )}

          <div className="flex justify-between text-muted-foreground">
            <span>Livraison</span>
            <span>
              {totals.primaryShipping > 0
                ? formatMoney(totals.primaryShipping, totals.primaryCurrency)
                : 'Incluse'}
            </span>
          </div>
        </div>

        <div className="border-t border-gold-400/20 pt-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Net à payer</p>
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
                {formatMoney(totals.primaryTotal, totals.primaryCurrency)}
              </p>
              {showSecondary && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatMoney(totals.secondaryTotal, totals.secondaryCurrency)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Livraison */}
        <div className="rounded-2xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Truck size={14} className="text-gold-500" />
            Livraison estimée
          </p>
          <p className="mt-1">{estimatedDate}</p>
          {order?.adresse_livraison && (
            <p className="mt-2 line-clamp-2">{order.adresse_livraison}</p>
          )}
        </div>

        {/* Sécurité */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock size={14} className="text-gold-500" />
            <span>Transaction chiffrée SSL/TLS</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={14} className="text-gold-500" />
            <span>3D Secure activé si disponible</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info size={14} className="text-gold-500" />
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
  const toast = useToast()

  const { user, loading: authLoading } = useAuth()
  const { items, summary, activePromo, total, clearCart } = useCart() as any
  const { rate, loading: rateLoading } = useExchangeRate()
  const isOnline = useOnlineStatus()
  const { prefersReducedMotion } = useAccessibilityPreferences()

  const commandeId = searchParams.get('id') || ''
  const initialCurrency = (searchParams.get('currency') || 'USD') as Currency

  /* ---------------------------------------------------------- */
  /* États                                                       */
  /* ---------------------------------------------------------- */

  const [currency, setCurrency] = useState<Currency>(initialCurrency)
  const [showSecondary, setShowSecondary] = useState(true)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loadingMethods, setLoadingMethods] = useState(true)
  const [methodsError, setMethodsError] = useState('')

  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [loadingOrder, setLoadingOrder] = useState(true)
  const [orderError, setOrderError] = useState('')

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [status, setStatus] = useState<PaymentStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const [showPin, setShowPin] = useState(false)
  const [showCard, setShowCard] = useState(false)

  const mobileForm = useForm<MobileFormData>({
    resolver: zodResolver(mobileSchema),
    defaultValues: { phone: '', pin: '', ownerName: '' },
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

  const didInit = useRef(false)
  const clearedCartRef = useRef(false)

  /* ---------------------------------------------------------- */
  /* Initialisation préférences                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true

    const savedCurrency = safeLocalStorageGet<Currency | null>(PREF_CURRENCY_KEY, null)
    if (savedCurrency === 'USD' || savedCurrency === 'CDF') {
      setCurrency(savedCurrency)
    }
  }, [])

  useEffect(() => {
    safeLocalStorageSet(PREF_CURRENCY_KEY, currency)
  }, [currency])

  /* ---------------------------------------------------------- */
  /* Prévention fermeture onglet pendant paiement                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (status !== 'processing' && status !== 'pending') return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  /* ---------------------------------------------------------- */
  /* Chargement commande                                         */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!commandeId || !user) {
      setLoadingOrder(false)
      return
    }

    let cancelled = false

    const loadOrder = async () => {
      setLoadingOrder(true)
      setOrderError('')

      try {
        const res = await fetch(`/api/commandes/${commandeId}`, {
          credentials: 'include',
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(data?.error || 'Impossible de charger la commande.')
        }

        if (!cancelled) {
          setOrder({
            id: data.id || commandeId,
            numero: data.numero_commande || data.numero || commandeId.slice(0, 8),
            total: Number(data.total_global ?? data.total ?? 0),
            total_global: Number(data.total_global ?? 0),
            statut: data.statut || 'en_attente',
            type_livraison: data.type_livraison || 'domicile',
            adresse_livraison: data.adresse_livraison || null,
            articles: Array.isArray(data.articles) ? data.articles : [],
          })
        }
      } catch (err: any) {
        if (!cancelled) setOrderError(err?.message || 'Erreur chargement commande.')
      } finally {
        if (!cancelled) setLoadingOrder(false)
      }
    }

    loadOrder()

    return () => {
      cancelled = true
    }
  }, [commandeId, user])

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

        const data = await res.json().catch(() => [])

        if (!res.ok) {
          throw new Error(data?.error || 'Impossible de charger les moyens de paiement.')
        }

        const list: PaymentMethod[] = Array.isArray(data) ? data : []

        // Filtrer : actif + supprimer le wallet
        const filtered = list.filter(
          (m) =>
            m.actif !== false &&
            m.type !== ('wallet' as any) &&
            m.code !== 'wallet'
        )

        if (!cancelled) {
          setMethods(filtered)

          // Restaurer le dernier moyen utilisé
          const lastCode = safeLocalStorageGet<string | null>(LAST_METHOD_KEY, null)
          const last = filtered.find((m) => m.code === lastCode)
          if (last) setSelectedMethod(last)
          else if (filtered.length > 0) setSelectedMethod(filtered[0])
        }
      } catch (err: any) {
        if (!cancelled) setMethodsError(err?.message || 'Erreur chargement moyens.')
      } finally {
        if (!cancelled) setLoadingMethods(false)
      }
    }

    loadMethods()

    return () => {
      cancelled = true
    }
  }, [user])

  /* ---------------------------------------------------------- */
  /* Totaux                                                      */
  /* ---------------------------------------------------------- */

  const rateOk = Number.isFinite(Number(rate)) && Number(rate) > 0

  const rawTotalCdf = toPositiveNumber(order?.total ?? order?.total_global ?? total ?? summary?.total) || 0
  const rawTotalUsd = toPositiveNumber(summary?.totalUSD ?? summary?.total_usd) || 0

  const subtotalCdf =
    toPositiveNumber(summary?.sousTotal ?? summary?.subtotal) || rawTotalCdf
  const subtotalUsd =
    toPositiveNumber(summary?.sousTotalUSD ?? summary?.subtotalUSD) ||
    (rateOk && subtotalCdf > 0 ? subtotalCdf / Number(rate) : 0)

  const discountCdf =
    toPositiveNumber(summary?.remiseTotal ?? summary?.discount) || 0
  const discountUsd =
    toPositiveNumber(summary?.remiseTotalUSD ?? summary?.discountUSD) ||
    (rateOk && discountCdf > 0 ? discountCdf / Number(rate) : 0)

  const shippingCdf = toPositiveNumber(summary?.fraisLivraison ?? summary?.shipping) || 0
  const shippingUsd =
    toPositiveNumber(summary?.fraisLivraisonUSD ?? summary?.shippingUSD) ||
    (rateOk && shippingCdf > 0 ? shippingCdf / Number(rate) : 0)

  const totalCdf =
    rawTotalCdf > 0
      ? rawTotalCdf
      : Math.max(0, subtotalCdf - discountCdf + shippingCdf)

  const totalUsd =
    rawTotalUsd > 0
      ? rawTotalUsd
      : rateOk && totalCdf > 0
        ? totalCdf / Number(rate)
        : Math.max(0, subtotalUsd - discountUsd + shippingUsd)

  const primaryCurrency: Currency = currency
  const secondaryCurrency: Currency = currency === 'USD' ? 'CDF' : 'USD'

  const totals = useMemo(
    () => ({
      subtotalUsd,
      subtotalCdf,
      discountUsd,
      discountCdf,
      shippingUsd,
      shippingCdf,
      totalUsd,
      totalCdf,
      primarySubtotal: primaryCurrency === 'USD' ? subtotalUsd : subtotalCdf,
      secondarySubtotal: secondaryCurrency === 'USD' ? subtotalUsd : subtotalCdf,
      primaryDiscount: primaryCurrency === 'USD' ? discountUsd : discountCdf,
      secondaryDiscount: secondaryCurrency === 'USD' ? discountUsd : discountCdf,
      primaryShipping: primaryCurrency === 'USD' ? shippingUsd : shippingCdf,
      secondaryShipping: secondaryCurrency === 'USD' ? shippingUsd : shippingCdf,
      primaryTotal: primaryCurrency === 'USD' ? totalUsd : totalCdf,
      secondaryTotal: secondaryCurrency === 'USD' ? totalUsd : totalCdf,
      primaryCurrency,
      secondaryCurrency,
    }),
    [
      subtotalUsd,
      subtotalCdf,
      discountUsd,
      discountCdf,
      shippingUsd,
      shippingCdf,
      totalUsd,
      totalCdf,
      primaryCurrency,
      secondaryCurrency,
    ]
  )

  const amountToPost =
    currency === 'USD'
      ? Number(totalUsd.toFixed(2))
      : Math.round(totalCdf)

  /* ---------------------------------------------------------- */
  /* Date estimée                                                */
  /* ---------------------------------------------------------- */

  const estimatedDate = useMemo(() => {
    const days =
      order?.type_livraison === 'express'
        ? 1
        : order?.type_livraison === 'point_retrait'
          ? 2
          : 3
    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
  }, [order?.type_livraison])

  /* ---------------------------------------------------------- */
  /* Sélection moyen                                             */
  /* ---------------------------------------------------------- */

  const handleSelectMethod = useCallback(
    (method: PaymentMethod) => {
      setSelectedMethod(method)
      setErrorMessage('')
      setStatus('idle')
      safeLocalStorageSet(LAST_METHOD_KEY, method.code)
    },
    []
  )

  /* ---------------------------------------------------------- */
  /* Exécution paiement                                          */
  /* ---------------------------------------------------------- */

  const executePaymentRequest = useCallback(
    async (payload: any) => {
      if (!isOnline) {
        setErrorMessage('Connexion internet requise pour valider le paiement.')
        setStatus('failed')
        toast.addToast({
          type: 'error',
          message: 'Connexion internet requise.',
        })
        return
      }

      setStatus('processing')
      setErrorMessage('')

      try {
        const res = await fetch('/api/paiement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(data?.error || 'Erreur lors de la transaction.')
        }

        setTransactionId(data.transactionId || null)

        if (data.status === 'pending') {
          setStatus('pending')
          toast.addToast({
            type: 'info',
            message:
              data.message ||
              'Validez le prompt USSD sur votre téléphone pour finaliser.',
          })
          return
        }

        setStatus('success')
        triggerConfetti()

        toast.addToast({
          type: 'success',
          message: data.message || 'Paiement réussi !',
        })

        // Purge du panier une seule fois
        if (!clearedCartRef.current) {
          clearedCartRef.current = true
          try {
            await clearCart?.()
          } catch {
            // silencieux
          }
        }

        setTimeout(() => {
          router.push(
            `/commande/confirmation?id=${encodeURIComponent(commandeId)}`
          )
        }, 2200)
      } catch (err: any) {
        const msg = err?.message || 'Impossible de traiter le paiement.'
        setErrorMessage(msg)
        setStatus('failed')
        toast.addToast({ type: 'error', message: msg })
      }
    },
    [clearCart, commandeId, isOnline, router, toast]
  )

  const handleMobileSubmit = useCallback(
    (data: MobileFormData) => {
      if (!selectedMethod || !commandeId) return

      executePaymentRequest({
        commande_id: commandeId,
        method: selectedMethod.code,
        amount: amountToPost,
        currency,
        phone: data.phone.trim().replace(/\s+/g, ''),
        pin: data.pin?.trim() || undefined,
        owner_name: data.ownerName?.trim() || undefined,
      })
    },
    [amountToPost, commandeId, currency, executePaymentRequest, selectedMethod]
  )

  const handleCardSubmit = useCallback(
    (data: CardFormData) => {
      if (!selectedMethod || !commandeId) return

      executePaymentRequest({
        commande_id: commandeId,
        method: selectedMethod.code,
        amount: amountToPost,
        currency,
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
    [amountToPost, commandeId, currency, executePaymentRequest, selectedMethod]
  )

  const handleCashSubmit = useCallback(() => {
    if (!selectedMethod || !commandeId) return

    executePaymentRequest({
      commande_id: commandeId,
      method: selectedMethod.code,
      amount: amountToPost,
      currency,
    })
  }, [amountToPost, commandeId, currency, executePaymentRequest, selectedMethod])

  const handleSubmit = useCallback(() => {
    if (!selectedMethod) {
      toast.addToast({
        type: 'error',
        message: 'Veuillez choisir un moyen de paiement.',
      })
      return
    }

    if (selectedMethod.type === 'mobile_money') {
      mobileForm.handleSubmit(handleMobileSubmit)()
    } else if (selectedMethod.type === 'card') {
      cardForm.handleSubmit(handleCardSubmit)()
    } else {
      handleCashSubmit()
    }
  }, [
    cardForm,
    handleCashSubmit,
    handleCardSubmit,
    handleMobileSubmit,
    mobileForm,
    selectedMethod,
    toast,
  ])

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1)
    setStatus('idle')
    setErrorMessage('')
    setTransactionId(null)
  }, [])

  const handleExpire = useCallback(() => {
    if (status === 'success') return
    setStatus('failed')
    setErrorMessage(
      'Votre session de paiement a expiré. Veuillez réessayer.'
    )
    toast.addToast({
      type: 'error',
      message: 'Session expirée.',
    })
  }, [status, toast])

  /* ---------------------------------------------------------- */
  /* Guards                                                      */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center" role="status" aria-live="polite">
          <Loader2 size={36} className="mx-auto animate-spin text-gold-500" />
          <p className="text-sm text-muted-foreground">
            Vérification de votre session...
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.href = `/login?redirect=${encodeURIComponent(
        `/commande/paiement?id=${commandeId}`
      )}`
    }
    return null
  }

  /* ---------------------------------------------------------- */
  /* Rendu erreurs                                               */
  /* ---------------------------------------------------------- */

  if (orderError && !order) {
    return (
      <Container className="py-16">
        <Card className="mx-auto max-w-md border-red-500/30 bg-red-500/5 p-8 text-center">
          <AlertTriangle size={48} className="mx-auto mb-4 text-red-500" />
          <p className="mb-4 text-muted-foreground">{orderError}</p>
          <Link href="/panier">
            <Button variant="luxe">Retour au panier</Button>
          </Link>
        </Card>
      </Container>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  const isProcessing = status === 'processing' || status === 'pending'
  const isSuccess = status === 'success'
  const isFailed = status === 'failed'
  const canSubmit =
    !isProcessing &&
    !isSuccess &&
    !!selectedMethod &&
    !!commandeId &&
    amountToPost > 0

  const cardNumberValue = cardForm.watch('cardNumber') || ''
  const cardBrand = detectCardBrand(cardNumberValue)

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
              <ArrowLeft size={16} />
              Retour à la commande
            </Link>

            <h1 className="text-3xl font-extrabold text-foreground font-serif md:text-4xl">
              Paiement sécurisé
            </h1>

            <p className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
              <span>
                Commande {order?.numero ? `n° ${order.numero}` : commandeId.slice(0, 8)}
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
              content={showSecondary ? 'Masquer le prix secondaire' : 'Afficher le prix secondaire'}
            >
              <button
                type="button"
                onClick={() => setShowSecondary((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                aria-label="Basculer prix secondaire"
              >
                {showSecondary ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </Tooltip>

            {/* Timer */}
            {!isSuccess && (
              <Timer
                seconds={SESSION_DURATION_SECONDS + retryCount * 60}
                onExpire={handleExpire}
              />
            )}
          </div>
        </div>

        {/* Alertes */}
        {!isOnline && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <WifiOff size={18} className="mt-0.5 shrink-0" />
            <p>
              Vous êtes hors ligne. Le paiement nécessite une connexion internet
              stable. Reconnectez-vous puis réessayez.
            </p>
          </div>
        )}

        {rateLoading && currency === 'USD' && totalCdf > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            <RefreshCw size={18} className="mt-0.5 shrink-0 animate-spin" />
            <p>
              Chargement du taux USD/CDF... Le montant final sera confirmé après
              réception du taux officiel.
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
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
                leftIcon={<RefreshCw size={14} />}
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
            <CheckCircle2 size={48} className="mx-auto mb-3 text-emerald-500" />
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
                  <CreditCard size={18} className="text-gold-500" />
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
                      <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : methodsError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                    {methodsError}
                  </div>
                ) : methods.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                    Aucun moyen de paiement disponible pour le moment. Contactez
                    le support.
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
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                >
                  <Card variant="glass" className="border-gold-400/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Smartphone size={18} className="text-gold-500" />
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
                            <Info size={14} />
                            Instructions
                          </p>
                          <p className="mt-1 whitespace-pre-line">
                            {selectedMethod.instructions}
                          </p>
                        </div>
                      )}

                      <form
                        id="mobile-form"
                        onSubmit={mobileForm.handleSubmit(handleMobileSubmit)}
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
                              error={mobileForm.formState.errors.pin?.message}
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
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                >
                  <Card variant="glass" className="border-gold-400/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CreditCard size={18} className="text-gold-500" />
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
                            <Info size={14} />
                            Instructions
                          </p>
                          <p className="mt-1 whitespace-pre-line">
                            {selectedMethod.instructions}
                          </p>
                        </div>
                      )}

                      <form
                        id="card-form"
                        onSubmit={cardForm.handleSubmit(handleCardSubmit)}
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
                              {cardForm.formState.errors.cardHolder.message}
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
                              {cardForm.formState.errors.cardNumber.message}
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
                                {cardForm.formState.errors.expiry.message}
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
                                onChange={(v) => field.onChange(v.replace(/\D/g, '').slice(0, 3))}
                                disabled={isProcessing || isSuccess}
                                placeholder="123"
                                error={cardForm.formState.errors.cvv?.message}
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
                          <Lock size={12} className="text-gold-500" />
                          Vos données bancaires sont chiffrées et ne sont jamais
                          stockées en clair.
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
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Card variant="glass" className="border-gold-400/20">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          {METHOD_ICONS[selectedMethod.type] || <Package size={18} />}
                          {selectedMethod.nom}
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {selectedMethod.instructions && (
                          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                            <p className="flex items-center gap-2 font-medium">
                              <Info size={14} />
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
                      <ShieldCheck size={18} />
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
              <FactureSidebar
                order={order}
                items={items || []}
                totals={totals}
                currency={currency}
                showSecondary={showSecondary}
                activePromo={activePromo}
                shippingMethod={order?.type_livraison || 'domicile'}
                estimatedDate={estimatedDate}
              />
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
              {formatMoney(totals.primaryTotal, totals.primaryCurrency)}
            </p>
            {showSecondary && (
              <p className="truncate text-[11px] text-muted-foreground">
                ≈ {formatMoney(totals.secondaryTotal, totals.secondaryCurrency)}
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
                <Loader2 size={16} className="animate-spin" />
              ) : isSuccess ? (
                <CheckCircle2 size={16} />
              ) : (
                <Lock size={16} />
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
                <Loader2 size={18} className="animate-spin" />
              ) : isSuccess ? (
                <CheckCircle2 size={18} />
              ) : (
                <Zap size={18} />
              )
            }
          >
            {isProcessing
              ? 'Traitement...'
              : isSuccess
                ? 'Paiement confirmé'
                : `Payer ${formatMoney(totals.primaryTotal, totals.primaryCurrency)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}