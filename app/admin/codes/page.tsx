// app/admin/codes/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useRouter } from 'next/navigation'

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useDebounce } from '@/hooks/useDebounce'

import {
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  Check,
  Clock,
  Copy,
  DollarSign,
  Edit3,
  Filter,
  Hash,
  Info,
  Key,
  Percent,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion'

import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type PromoType = 'percent' | 'fixed'

type StatutFiltre = 'all' | 'actif' | 'inactif' | 'epuise' | 'expire'

type SortField =
  | 'created_at'
  | 'code'
  | 'value'
  | 'utilisations_actuelles'
  | 'expires_at'

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

interface CodePromo {
  id: string
  code: string

  type?: PromoType | null
  value?: number | null
  reduction_percent?: number | null

  value_usd?: number | null
  value_cdf?: number | null

  min_total_usd?: number | null
  max_discount_usd?: number | null

  min_total?: number | null
  max_discount?: number | null

  min_total_cdf?: number | null
  max_discount_cdf?: number | null

  max_utilisations: number
  utilisations_actuelles: number

  actif: boolean

  created_at: string
  updated_at?: string | null
  expires_at: string | null

  description?: string | null
}

interface NormalizedPromo extends CodePromo {
  normalizedType: PromoType
  minTotalPair: MoneyPair
  maxDiscountPair: MoneyPair
  fixedValuePair: MoneyPair
}

interface CodesPagination {
  page: number
  totalPages: number
  total: number
}

interface CodesStats {
  total?: number
  active?: number
  used?: number
  expiring_soon?: number
}

interface CodesResponse {
  data?: CodePromo[]
  pagination?: CodesPagination
  stats?: CodesStats
  total?: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PER_PAGE = 10

const STATUT_FILTERS: {
  value: StatutFiltre
  label: string
}[] = [
  { value: 'all', label: 'Tous' },
  { value: 'actif', label: 'Actifs' },
  { value: 'inactif', label: 'Inactifs' },
  { value: 'epuise', label: 'Épuisés' },
  { value: 'expire', label: 'Expirés' },
]

const SORT_OPTIONS: {
  value: SortField
  label: string
}[] = [
  { value: 'created_at', label: 'Date de création' },
  { value: 'code', label: 'Code' },
  { value: 'value', label: 'Valeur' },
  { value: 'utilisations_actuelles', label: 'Utilisations' },
  { value: 'expires_at', label: 'Expiration' },
]

const inputClass =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const selectClass = inputClass

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
 * USD : autorise 0.
 * Important : 0 USD explicite doit être respecté.
 */
function explicitUsd(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return round2(n)
    }
  }

  return null
}

/**
 * CDF : autorise 0.
 */
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
/*  PROMO HELPERS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeType(promo: Partial<CodePromo>): PromoType {
  return promo.type === 'fixed' ? 'fixed' : 'percent'
}

function getValue(promo: Partial<CodePromo>): number {
  const raw = promo.value ?? promo.reduction_percent ?? 0
  const n = Number(raw)

  return Number.isFinite(n) ? n : 0
}

function normalizePromo(
  promo: CodePromo,
  rate: number | null
): NormalizedPromo {
  const normalizedType = normalizeType(promo)

  const minTotalPair = resolvePricePair(
    explicitUsd(promo.min_total_usd),
    explicitCdf(promo.min_total, promo.min_total_cdf),
    rate
  )

  const maxDiscountPair = resolvePricePair(
    explicitUsd(promo.max_discount_usd),
    explicitCdf(promo.max_discount, promo.max_discount_cdf),
    rate
  )

  let fixedValuePair: MoneyPair = {
    usd: 0,
    cdf: null,
    cdfKnown: false,
    source: 'NONE',
  }

  if (normalizedType === 'fixed') {
    const usdSource = explicitUsd(promo.value_usd, promo.value)
    const cdfSource = explicitCdf(promo.value_cdf)

    fixedValuePair = resolvePricePair(usdSource, cdfSource, rate)
  }

  return {
    ...promo,
    normalizedType,
    minTotalPair,
    maxDiscountPair,
    fixedValuePair,
  }
}

function hasUnsafeLegacyMoney(promo: NormalizedPromo): boolean {
  return (
    promo.minTotalPair.source === 'CDF_LEGACY' ||
    promo.maxDiscountPair.source === 'CDF_LEGACY' ||
    (promo.normalizedType === 'fixed' &&
      promo.fixedValuePair.source === 'CDF_LEGACY')
  )
}

function isExpired(promo: CodePromo): boolean {
  if (!promo.expires_at) return false

  return new Date(promo.expires_at) < new Date()
}

function isExhausted(promo: CodePromo): boolean {
  const max = Number(promo.max_utilisations ?? 0)
  const used = Number(promo.utilisations_actuelles ?? 0)

  if (max <= 0) return false

  return used >= max
}

function getPromoStatus(
  promo: CodePromo
): 'actif' | 'inactif' | 'epuise' | 'expire' {
  if (!promo.actif) return 'inactif'
  if (isExpired(promo)) return 'expire'
  if (isExhausted(promo)) return 'epuise'

  return 'actif'
}

function getStatusLabel(
  status: ReturnType<typeof getPromoStatus>
): string {
  switch (status) {
    case 'actif':
      return 'Actif'
    case 'inactif':
      return 'Inactif'
    case 'epuise':
      return 'Épuisé'
    case 'expire':
      return 'Expiré'
    default:
      return 'Inconnu'
  }
}

function getStatusBadgeVariant(
  status: ReturnType<typeof getPromoStatus>
): 'accent' | 'neutral' | 'danger' | 'gold' {
  switch (status) {
    case 'actif':
      return 'accent'
    case 'inactif':
      return 'neutral'
    case 'epuise':
      return 'danger'
    case 'expire':
      return 'danger'
    default:
      return 'neutral'
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  )

  return localDate.toISOString().slice(0, 10)
}

function isExpiringSoon(promo: CodePromo): boolean {
  if (!promo.expires_at) return false

  const expiry = new Date(promo.expires_at)
  const now = new Date()
  const inSevenDays = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000
  )

  return expiry >= now && expiry <= inSevenDays
}

function formatUsageLimit(max: number | null | undefined): string {
  const n = Number(max ?? 0)

  return n > 0 ? String(n) : '∞'
}

function formatCdf(value: number | null | undefined): string {
  const n = Number(value ?? 0)

  if (!Number.isFinite(n) || n <= 0) return '—'

  return `${Math.round(n).toLocaleString('fr-FR')} FC`
}

function formatOptionalMoneyPair(pair: MoneyPair): string {
  if (pair.source === 'NONE') return '—'

  if (pair.usd > 0) {
    const main = `$${pair.usd.toFixed(2)}`

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

  if (pair.source === 'NONE') {
    return 'Montant indisponible'
  }

  return null
}

function buildPromoPayload(values: {
  type: PromoType
  value: number
  maxUtilisations: number
  expiresAt?: string | null
  minTotalUsd?: number | null
  maxDiscountUsd?: number | null
  description?: string | null
}) {
  let expires_at: string | null = null

  if (values.expiresAt) {
    const parts = String(values.expiresAt)
      .split('-')
      .map(Number)

    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      const [year, month, day] = parts

      const date = new Date(year, month - 1, day, 23, 59, 59, 999)

      if (!Number.isNaN(date.getTime())) {
        expires_at = date.toISOString()
      }
    }
  }

  const min = Number(values.minTotalUsd || 0)
  const max = Number(values.maxDiscountUsd || 0)

  return {
    type: values.type,
    value: Number(values.value || 0),
    max_utilisations: Number(values.maxUtilisations || 0),
    expires_at,
    min_total_usd: min > 0 ? round2(min) : null,
    max_discount_usd: max > 0 ? round2(max) : null,
    description: values.description?.trim() || null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION ZOD                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function validatePromoBase(data: any, ctx: z.RefinementCtx) {
  if (data.type === 'percent') {
    if (data.value < 1 || data.value > 99) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message:
          'La réduction en pourcentage doit être entre 1 et 99.',
      })
    }
  }

  if (data.type === 'fixed') {
    if (data.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message:
          'Le montant fixe USD doit être supérieur à 0.',
      })
    }
  }

  if (data.expiresAt) {
    const parts = String(data.expiresAt)
      .split('-')
      .map(Number)

    let date: Date | null = null

    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      const [year, month, day] = parts
      date = new Date(year, month - 1, day, 23, 59, 59, 999)
    } else {
      date = new Date(data.expiresAt)
    }

    if (!date || Number.isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Date d’expiration invalide.',
      })
    } else if (date < new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message:
          'La date d’expiration ne peut pas être dans le passé.',
      })
    }
  }

  if (data.minTotalUsd != null && Number(data.minTotalUsd) < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['minTotalUsd'],
      message: 'Le minimum ne peut pas être négatif.',
    })
  }

  if (data.maxDiscountUsd != null && Number(data.maxDiscountUsd) < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxDiscountUsd'],
      message: 'Le plafond de réduction ne peut pas être négatif.',
    })
  }
}

const commonPromoShape = {
  type: z.enum(['percent', 'fixed']).default('percent'),
  value: z.coerce.number().min(0).default(10),
  maxUtilisations: z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .default(1),
  expiresAt: z.string().optional().default(''),
  minTotalUsd: z.coerce.number().min(0).optional().default(0),
  maxDiscountUsd: z.coerce.number().min(0).optional().default(0),
  description: z.string().max(255).optional().default(''),
}

const generateSchema = z
  .object({
    ...commonPromoShape,
    count: z.coerce.number().int().min(1).max(100).default(5),
    prefix: z
      .string()
      .max(12)
      .regex(/^[A-Z0-9]*$/i, 'Lettres et chiffres uniquement.')
      .optional()
      .default(''),
  })
  .superRefine(validatePromoBase)

const manualSchema = z
  .object({
    ...commonPromoShape,
    code: z
      .string()
      .min(3, 'Minimum 3 caractères')
      .max(30, 'Maximum 30 caractères')
      .regex(
        /^[A-Z0-9_-]+$/i,
        'Lettres, chiffres, tirets et underscores uniquement.'
      )
      .transform((value) => value.toUpperCase()),
    actif: z.boolean().default(true),
  })
  .superRefine(validatePromoBase)

type GenerateForm = z.infer<typeof generateSchema>
type ManualForm = z.infer<typeof manualSchema>

/* ═══════════════════════════════════════════════════════════════ */
/*  MINI COMPOSANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function TypeSelector({
  value,
  onChange,
  disabled,
}: {
  value: PromoType
  onChange: (value: PromoType) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('percent')}
        className={cn(
          'flex min-w-[140px] flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60',
          value === 'percent'
            ? 'border-gold-400 bg-gold-500/10 text-gold-700 dark:text-gold-300'
            : 'border-border bg-card text-muted-foreground hover:border-gold-400/40'
        )}
      >
        <Percent size={14} aria-hidden="true" />
        Pourcentage %
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('fixed')}
        className={cn(
          'flex min-w-[140px] flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60',
          value === 'fixed'
            ? 'border-gold-400 bg-gold-500/10 text-gold-700 dark:text-gold-300'
            : 'border-border bg-card text-muted-foreground hover:border-gold-400/40'
        )}
      >
        <DollarSign size={14} aria-hidden="true" />
        Montant fixe USD
      </button>
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
  tone?: 'default' | 'gold' | 'danger' | 'emerald'
}) {
  return (
    <Card className="border-gold-400/20 bg-card/70">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>

            <p
              className={cn(
                'mt-1 text-2xl font-extrabold',
                tone === 'gold'
                  ? 'text-gold-600'
                  : tone === 'danger'
                    ? 'text-red-500'
                    : tone === 'emerald'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-foreground'
              )}
            >
              {value}
            </p>
          </div>

          <div
            className={cn(
              'rounded-xl p-2',
              tone === 'gold'
                ? 'bg-gold-500/10 text-gold-600'
                : tone === 'danger'
                  ? 'bg-red-500/10 text-red-500'
                  : tone === 'emerald'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MoneyCell({
  pair,
  align = 'left',
}: {
  pair: MoneyPair
  align?: 'left' | 'right'
}) {
  const text = formatOptionalMoneyPair(pair)
  const warning = moneyPairWarning(pair)

  return (
    <div className={cn(align === 'right' ? 'text-right' : 'text-left')}>
      <p
        className={cn(
          'text-sm font-medium',
          pair.source === 'USD' || pair.source === 'CDF_CONVERTED'
            ? 'text-gold-600'
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

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function CodesPromoPage() {
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

  const [filterStatut, setFilterStatut] = useState<StatutFiltre>('all')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  /* ------------------------------------------------------------ */
  /* UI state                                                      */
  /* ------------------------------------------------------------ */

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NormalizedPromo | null>(null)

  const [generateOpen, setGenerateOpen] = useState(false)

  const [manualOpen, setManualOpen] = useState(false)
  const [manualMode, setManualMode] = useState<'create' | 'edit'>('create')
  const [editingPromo, setEditingPromo] = useState<NormalizedPromo | null>(null)

  /* ------------------------------------------------------------ */
  /* Garde admin                                                   */
  /* ------------------------------------------------------------ */

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/admin/codes')}`
      )
      return
    }

    if (!isAdmin) {
      router.replace('/')
    }
  }, [authLoading, isAdmin, router, user])

  /* ------------------------------------------------------------ */
  /* Formulaires                                                   */
  /* ------------------------------------------------------------ */

  const generateForm = useForm<GenerateForm>({
    resolver: zodResolver(generateSchema as any),
    defaultValues: {
      count: 5,
      prefix: '',
      type: 'percent',
      value: 10,
      maxUtilisations: 1,
      expiresAt: '',
      minTotalUsd: 0,
      maxDiscountUsd: 0,
      description: '',
    },
  })

  const manualForm = useForm<ManualForm>({
    resolver: zodResolver(manualSchema as any),
    defaultValues: {
      code: '',
      type: 'percent',
      value: 10,
      maxUtilisations: 1,
      expiresAt: '',
      minTotalUsd: 0,
      maxDiscountUsd: 0,
      description: '',
      actif: true,
    },
  })

  const generateType = generateForm.watch('type')
  const manualType = manualForm.watch('type')

  /* ------------------------------------------------------------ */
  /* Requête liste                                                 */
  /* ------------------------------------------------------------ */

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<CodesResponse | CodePromo[]>({
    queryKey: [
      'admin-codes-promo',
      debouncedSearch,
      filterStatut,
      page,
      sortBy,
      sortOrder,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()

      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim())
      }

      if (filterStatut !== 'all') {
        params.set('statut', filterStatut)
      }

      params.set('page', String(page))
      params.set('limit', String(PER_PAGE))
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)

      const res = await fetch(
        `/api/admin/codes?${params.toString()}`,
        {
          credentials: 'include',
        }
      )

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))

        throw new Error(
          payload?.error ||
            'Erreur lors du chargement des codes promo.'
        )
      }

      return res.json()
    },
    enabled: !!user && !!isAdmin,
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  })

  /* ------------------------------------------------------------ */
  /* Normalisation réponse                                         */
  /* ------------------------------------------------------------ */

  const rawCodes = useMemo<CodePromo[]>(() => {
    if (Array.isArray(data)) return data

    if (
      data &&
      !Array.isArray(data) &&
      Array.isArray((data as CodesResponse).data)
    ) {
      return (data as CodesResponse).data as CodePromo[]
    }

    return []
  }, [data])

  const pagination = useMemo<CodesPagination>(() => {
    const response =
      data && !Array.isArray(data)
        ? (data as CodesResponse)
        : null

    const p = response?.pagination

    if (p) {
      return {
        page: Number(p.page ?? page),
        totalPages: Number(p.totalPages ?? 1),
        total: Number(p.total ?? 0),
      }
    }

    const total = Number(response?.total ?? rawCodes.length)

    return {
      page,
      totalPages: Math.max(1, Math.ceil(total / PER_PAGE)),
      total,
    }
  }, [data, page, rawCodes.length])

  const codes = useMemo<NormalizedPromo[]>(() => {
    return rawCodes.map((promo) =>
      normalizePromo(promo, effectiveRate)
    )
  }, [effectiveRate, rawCodes])

  const stats = useMemo(() => {
    const response =
      data && !Array.isArray(data)
        ? (data as CodesResponse)
        : null

    const apiStats = response?.stats

    if (apiStats) {
      return {
        total: Number(apiStats.total ?? pagination.total ?? 0),
        active: Number(apiStats.active ?? 0),
        used: Number(apiStats.used ?? 0),
        expiringSoon: Number(apiStats.expiring_soon ?? 0),
      }
    }

    const active = codes.filter(
      (promo) => getPromoStatus(promo) === 'actif'
    ).length

    const used = codes.reduce(
      (acc, promo) =>
        acc + Number(promo.utilisations_actuelles ?? 0),
      0
    )

    const expiringSoon = codes.filter(isExpiringSoon).length

    return {
      total: pagination.total,
      active,
      used,
      expiringSoon,
    }
  }, [codes, data, pagination.total])

  const hasLegacyCdfOnly = useMemo(() => {
    return codes.some(hasUnsafeLegacyMoney)
  }, [codes])

  /* ------------------------------------------------------------ */
  /* Mutation génération en masse                                  */
  /* ------------------------------------------------------------ */

  const generateMutation = useMutation({
    mutationFn: async (values: GenerateForm) => {
      const payload = {
        mode: 'generate',
        count: Number(values.count),
        prefix: values.prefix?.trim().toUpperCase() || '',
        ...buildPromoPayload(values),
      }

      const res = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))

        throw new Error(
          err?.error || 'Erreur lors de la génération des codes.'
        )
      }

      return res.json()
    },
    onSuccess: (response, variables) => {
      const count = Number(
        response?.count ?? variables.count ?? 0
      )

      addToast({
        type: 'success',
        message: `${count} code(s) promo généré(s).`,
      })

      queryClient.invalidateQueries({
        queryKey: ['admin-codes-promo'],
      })

      setGenerateOpen(false)
      generateForm.reset()
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message:
          err?.message ||
          'Impossible de générer les codes promo.',
      })
    },
  })

  /* ------------------------------------------------------------ */
  /* Mutation création / édition manuelle                          */
  /* ------------------------------------------------------------ */

  const saveManualMutation = useMutation({
    mutationFn: async (values: ManualForm) => {
      if (
        manualMode === 'edit' &&
        editingPromo &&
        hasUnsafeLegacyMoney(editingPromo) &&
        !rateOk
      ) {
        throw new Error(
          'Taux USD/CDF indisponible : impossible de convertir en toute sécurité les montants CDF legacy de ce code promo.'
        )
      }

      const payloadBase = buildPromoPayload(values)

      if (manualMode === 'create') {
        const res = await fetch('/api/admin/codes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            mode: 'create',
            code: values.code,
            actif: values.actif,
            ...payloadBase,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))

          throw new Error(
            err?.error || 'Erreur lors de la création du code.'
          )
        }

        return res.json()
      }

      if (!editingPromo) {
        throw new Error(
          'Aucun code promo sélectionné pour l’édition.'
        )
      }

      const res = await fetch('/api/admin/codes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          id: editingPromo.id,
          code: values.code,
          actif: values.actif,
          ...payloadBase,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))

        throw new Error(
          err?.error || 'Erreur lors de la mise à jour du code.'
        )
      }

      return res.json()
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        message:
          manualMode === 'create'
            ? 'Code promo créé.'
            : 'Code promo mis à jour.',
      })

      queryClient.invalidateQueries({
        queryKey: ['admin-codes-promo'],
      })

      setManualOpen(false)
      setEditingPromo(null)
      manualForm.reset()
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message:
          err?.message ||
          'Impossible d’enregistrer le code promo.',
      })
    },
  })

  /* ------------------------------------------------------------ */
  /* Mutation bascule actif / inactif                              */
  /* ------------------------------------------------------------ */

  const toggleMutation = useMutation({
    mutationFn: async ({
      id,
      actif,
    }: {
      id: string
      actif: boolean
    }) => {
      const res = await fetch('/api/admin/codes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          id,
          actif: !actif,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))

        throw new Error(
          err?.error || 'Erreur lors du changement de statut.'
        )
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-codes-promo'],
      })

      addToast({
        type: 'success',
        message: 'Statut mis à jour.',
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message:
          err?.message ||
          'Impossible de mettre à jour le statut.',
      })
    },
  })

  /* ------------------------------------------------------------ */
  /* Mutation suppression                                          */
  /* ------------------------------------------------------------ */

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/admin/codes?id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))

        throw new Error(
          err?.error || 'Erreur lors de la suppression.'
        )
      }

      return res.json()
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        message: 'Code promo supprimé.',
      })

      queryClient.invalidateQueries({
        queryKey: ['admin-codes-promo'],
      })

      setDeleteTarget(null)
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        message:
          err?.message ||
          'Impossible de supprimer ce code promo.',
      })
    },
  })

  /* ------------------------------------------------------------ */
  /* Handlers                                                      */
  /* ------------------------------------------------------------ */

  const handleCopy = useCallback(
    async (code: string, id: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code)
        } else {
          const textarea = document.createElement('textarea')
          textarea.value = code
          textarea.setAttribute('readonly', '')
          textarea.style.position = 'absolute'
          textarea.style.left = '-9999px'

          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
        }

        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)

        addToast({
          type: 'success',
          message: 'Code copié.',
        })
      } catch {
        addToast({
          type: 'error',
          message: 'Impossible de copier le code.',
        })
      }
    },
    [addToast]
  )

  const handleSortToggle = useCallback((field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }

    setPage(1)
  }, [sortBy])

  const clearFilters = useCallback(() => {
    setSearch('')
    setFilterStatut('all')
    setPage(1)
    setSortBy('created_at')
    setSortOrder('desc')
  }, [])

  const openGenerateModal = useCallback(() => {
    generateForm.reset({
      count: 5,
      prefix: '',
      type: 'percent',
      value: 10,
      maxUtilisations: 1,
      expiresAt: '',
      minTotalUsd: 0,
      maxDiscountUsd: 0,
      description: '',
    })

    setGenerateOpen(true)
  }, [generateForm])

  const openCreateModal = useCallback(() => {
    setManualMode('create')
    setEditingPromo(null)

    manualForm.reset({
      code: '',
      type: 'percent',
      value: 10,
      maxUtilisations: 1,
      expiresAt: '',
      minTotalUsd: 0,
      maxDiscountUsd: 0,
      description: '',
      actif: true,
    })

    setManualOpen(true)
  }, [manualForm])

  const openEditModal = useCallback(
    (promo: NormalizedPromo) => {
      setManualMode('edit')
      setEditingPromo(promo)

      manualForm.reset({
        code: promo.code,
        type: promo.normalizedType,
        value:
          promo.normalizedType === 'fixed'
            ? promo.fixedValuePair.usd
            : getValue(promo),
        maxUtilisations: Number(promo.max_utilisations ?? 1),
        expiresAt: toDateInputValue(promo.expires_at),
        minTotalUsd:
          promo.minTotalPair.usd > 0 ? promo.minTotalPair.usd : 0,
        maxDiscountUsd:
          promo.maxDiscountPair.usd > 0
            ? promo.maxDiscountPair.usd
            : 0,
        description: promo.description ?? '',
        actif: Boolean(promo.actif),
      })

      setManualOpen(true)
    },
    [manualForm]
  )

  const hasActiveFilters =
    Boolean(search.trim()) ||
    filterStatut !== 'all' ||
    sortBy !== 'created_at' ||
    sortOrder !== 'desc'

  const editBlockedByLegacyCdf =
    manualMode === 'edit' &&
    editingPromo &&
    hasUnsafeLegacyMoney(editingPromo) &&
    !rateOk

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
    <div className="min-h-screen bg-background pb-16">
      <Container className="py-8">
        <motion.div
          initial={motionInitial}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.4,
          }}
          className="space-y-6"
        >
          {/* En-tête */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-3 font-serif text-3xl font-extrabold text-foreground">
                <div className="rounded-xl bg-gold-100 p-2 text-gold-600 dark:bg-gold-900/30 dark:text-gold-400">
                  <Percent size={24} aria-hidden="true" />
                </div>
                Codes promo
              </h1>

              <p className="mt-2 text-sm text-muted-foreground">
                Générez, créez, éditez et supervisez vos codes de réduction.
                Les montants fixes et seuils sont exprimés en USD ; le CDF est
                affiché à titre indicatif.
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
                variant="ghost"
                size="sm"
                onClick={() => void refetch()}
                loading={isFetching}
                leftIcon={
                  <RefreshCw size={14} aria-hidden="true" />
                }
              >
                Rafraîchir
              </Button>

              <Button
                variant="outline-gold"
                size="md"
                onClick={openCreateModal}
                leftIcon={<Key size={16} aria-hidden="true" />}
              >
                Créer un code
              </Button>

              <Button
                variant="luxe"
                size="md"
                onClick={openGenerateModal}
                leftIcon={<Sparkles size={16} aria-hidden="true" />}
              >
                Générer en masse
              </Button>
            </div>
          </div>

          {/* Alerte legacy CDF */}
          {!rateOk && hasLegacyCdfOnly && (
            <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20">
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
                    Certains codes promo contiennent des minimums, plafonds ou
                    montants fixes uniquement en CDF. Tant que le taux USD/CDF
                    est indisponible, ils sont affichés en fallback et ne
                    peuvent pas être édités en toute sécurité.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total codes"
              value={stats.total}
              icon={<Hash size={18} aria-hidden="true" />}
              tone="gold"
            />

            <StatCard
              label="Actifs"
              value={stats.active}
              icon={<Power size={18} aria-hidden="true" />}
              tone="emerald"
            />

            <StatCard
              label="Utilisations"
              value={stats.used}
              icon={<RefreshCw size={18} aria-hidden="true" />}
            />

            <StatCard
              label="Expiration proche"
              value={stats.expiringSoon}
              icon={<AlertTriangle size={18} aria-hidden="true" />}
              tone="danger"
            />
          </div>

          {/* Filtres */}
          <Card className="border-gold-400/20 bg-card/70">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="relative max-w-sm flex-1">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />

                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setPage(1)
                    }}
                    placeholder="Rechercher un code..."
                    className={cn(inputClass, 'pl-9')}
                    aria-label="Rechercher un code promo"
                  />

                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('')
                        setPage(1)
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-gold-500"
                      aria-label="Effacer la recherche"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {STATUT_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => {
                        setFilterStatut(filter.value)
                        setPage(1)
                      }}
                      className={cn(
                        'whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition',
                        filterStatut === filter.value
                          ? 'border-gold-400/50 bg-gold-400/20 text-gold-600 shadow-gold'
                          : 'border-border bg-card text-muted-foreground hover:border-gold-400/40'
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                  <div className="relative min-w-[180px]">
                    <Filter
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />

                    <select
                      value={sortBy}
                      onChange={(event) => {
                        setSortBy(event.target.value as SortField)
                        setPage(1)
                      }}
                      className={cn(selectClass, 'pl-9')}
                      aria-label="Trier par"
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder((prev) =>
                        prev === 'asc' ? 'desc' : 'asc'
                      )
                      setPage(1)
                    }}
                    className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition hover:border-gold-400/40 hover:text-gold-500"
                    title={
                      sortOrder === 'asc'
                        ? 'Ordre croissant'
                        : 'Ordre décroissant'
                    }
                    aria-label="Inverser le tri"
                  >
                    <ArrowUpDown size={16} aria-hidden="true" />
                  </button>

                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="text-red-500"
                      leftIcon={<X size={14} aria-hidden="true" />}
                    >
                      Effacer
                    </Button>
                  )}

                  <div className="text-xs font-medium text-muted-foreground">
                    {pagination.total} code(s)
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tableau */}
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : isError ? (
            <Card className="border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
              <CardContent className="p-6 text-center">
                <AlertTriangle
                  size={32}
                  className="mx-auto mb-3 text-red-500"
                  aria-hidden="true"
                />

                <p className="font-medium text-red-700 dark:text-red-300">
                  {(error as Error)?.message ||
                    'Erreur de chargement des codes promo.'}
                </p>

                <Button
                  variant="outline-gold"
                  size="sm"
                  className="mt-4"
                  onClick={() => void refetch()}
                  leftIcon={
                    <RefreshCw size={14} aria-hidden="true" />
                  }
                >
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card
                variant="glass"
                className="overflow-hidden border-gold-400/20"
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => handleSortToggle('code')}
                            className="flex items-center gap-1 transition hover:text-gold-500"
                          >
                            Code
                            <ArrowUpDown
                              size={12}
                              aria-hidden="true"
                            />
                          </button>
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => handleSortToggle('value')}
                            className="flex items-center gap-1 transition hover:text-gold-500"
                          >
                            Réduction
                            <ArrowUpDown
                              size={12}
                              aria-hidden="true"
                            />
                          </button>
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button
                            type="button"
                            onClick={() =>
                              handleSortToggle('utilisations_actuelles')
                            }
                            className="flex items-center gap-1 transition hover:text-gold-500"
                          >
                            Utilisations
                            <ArrowUpDown
                              size={12}
                              aria-hidden="true"
                            />
                          </button>
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Minimum
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Plafond
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button
                            type="button"
                            onClick={() =>
                              handleSortToggle('expires_at')
                            }
                            className="flex items-center gap-1 transition hover:text-gold-500"
                          >
                            Expiration
                            <ArrowUpDown
                              size={12}
                              aria-hidden="true"
                            />
                          </button>
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Statut
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button
                            type="button"
                            onClick={() =>
                              handleSortToggle('created_at')
                            }
                            className="flex items-center gap-1 transition hover:text-gold-500"
                          >
                            Créé le
                            <ArrowUpDown
                              size={12}
                              aria-hidden="true"
                            />
                          </button>
                        </th>

                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border/50">
                      <AnimatePresence initial={false}>
                        {codes.length === 0 ? (
                          <tr>
                            <td
                              colSpan={9}
                              className="py-12 text-center text-sm text-muted-foreground"
                            >
                              Aucun code promo trouvé.
                            </td>
                          </tr>
                        ) : (
                          codes.map((promo) => {
                            const status = getPromoStatus(promo)
                            const type = promo.normalizedType
                            const canDelete =
                              Number(promo.utilisations_actuelles ?? 0) === 0

                            return (
                              <motion.tr
                                key={promo.id}
                                layout={!prefersReducedMotion}
                                initial={
                                  prefersReducedMotion
                                    ? false
                                    : { opacity: 0, y: 8 }
                                }
                                animate={{ opacity: 1, y: 0 }}
                                exit={
                                  prefersReducedMotion
                                    ? undefined
                                    : { opacity: 0 }
                                }
                                transition={{
                                  duration: prefersReducedMotion
                                    ? 0
                                    : 0.18,
                                }}
                                className="transition-colors hover:bg-gold-400/5"
                              >
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-1">
                                    <code className="w-fit rounded-lg bg-muted px-3 py-1.5 font-mono text-sm tracking-widest text-gold-600">
                                      {promo.code}
                                    </code>

                                    {promo.description && (
                                      <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                                        {promo.description}
                                      </p>
                                    )}
                                  </div>
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="neutral" size="sm">
                                      {type === 'percent' ? '%' : 'USD'}
                                    </Badge>

                                    {type === 'percent' ? (
                                      <span className="text-sm font-semibold text-foreground">
                                        {getValue(promo)}%
                                      </span>
                                    ) : (
                                      <MoneyCell
                                        pair={promo.fixedValuePair}
                                      />
                                    )}
                                  </div>
                                </td>

                                <td className="px-4 py-3 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-foreground">
                                      {promo.utilisations_actuelles}
                                    </span>

                                    <span className="text-muted-foreground">
                                      /
                                    </span>

                                    <span className="text-muted-foreground">
                                      {formatUsageLimit(
                                        promo.max_utilisations
                                      )}
                                    </span>
                                  </div>
                                </td>

                                <td className="px-4 py-3">
                                  <MoneyCell pair={promo.minTotalPair} />
                                </td>

                                <td className="px-4 py-3">
                                  <MoneyCell
                                    pair={promo.maxDiscountPair}
                                  />
                                </td>

                                <td className="px-4 py-3 text-sm">
                                  {promo.expires_at ? (
                                    <div className="flex flex-col gap-1">
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <Calendar
                                          size={12}
                                          aria-hidden="true"
                                        />
                                        {formatDate(promo.expires_at)}
                                      </span>

                                      {isExpiringSoon(promo) && (
                                        <Badge
                                          variant="danger"
                                          size="sm"
                                          className="w-fit"
                                        >
                                          Bientôt
                                        </Badge>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      Illimitée
                                    </span>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  <Badge
                                    variant={getStatusBadgeVariant(status)}
                                    size="sm"
                                  >
                                    {getStatusLabel(status)}
                                  </Badge>
                                </td>

                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Clock
                                      size={12}
                                      aria-hidden="true"
                                    />
                                    {formatDate(promo.created_at)}
                                  </div>
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleCopy(
                                          promo.code,
                                          promo.id
                                        )
                                      }
                                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500"
                                      title="Copier le code"
                                      aria-label={`Copier le code ${promo.code}`}
                                    >
                                      {copiedId === promo.id ? (
                                        <Check
                                          size={16}
                                          className="text-emerald-500"
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Copy
                                          size={16}
                                          aria-hidden="true"
                                        />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => openEditModal(promo)}
                                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500"
                                      title="Éditer"
                                      aria-label={`Éditer le code ${promo.code}`}
                                    >
                                      <Edit3
                                        size={16}
                                        aria-hidden="true"
                                      />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleMutation.mutate({
                                          id: promo.id,
                                          actif: promo.actif,
                                        })
                                      }
                                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500"
                                      title={
                                        promo.actif
                                          ? 'Désactiver'
                                          : 'Activer'
                                      }
                                      aria-label={
                                        promo.actif
                                          ? `Désactiver le code ${promo.code}`
                                          : `Activer le code ${promo.code}`
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

                                    {canDelete ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDeleteTarget(promo)
                                        }
                                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                                        title="Supprimer"
                                        aria-label={`Supprimer le code ${promo.code}`}
                                      >
                                        <Trash2
                                          size={16}
                                          aria-hidden="true"
                                        />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled
                                        className="cursor-not-allowed rounded-lg p-2 text-muted-foreground/40"
                                        title="Impossible de supprimer un code déjà utilisé. Désactivez-le plutôt."
                                        aria-label="Suppression impossible"
                                      >
                                        <Trash2
                                          size={16}
                                          aria-hidden="true"
                                        />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </motion.tr>
                            )
                          })
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline-gold"
                    size="sm"
                    onClick={() =>
                      setPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={page === 1 || isFetching}
                  >
                    Précédent
                  </Button>

                  <span className="text-sm text-muted-foreground">
                    Page {pagination.page} sur {pagination.totalPages}
                  </span>

                  <Button
                    variant="outline-gold"
                    size="sm"
                    onClick={() =>
                      setPage((prev) =>
                        Math.min(pagination.totalPages, prev + 1)
                      )
                    }
                    disabled={
                      page === pagination.totalPages || isFetching
                    }
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </Container>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODALE — GÉNÉRATION EN MASSE                           */}
      {/* ═══════════════════════════════════════════════════════ */}

      <Modal
        isOpen={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Générer des codes promo"
        description="Créez plusieurs codes uniques en une seule opération."
        size="md"
        accent="gold"
      >
        <form
          onSubmit={generateForm.handleSubmit((values) =>
            generateMutation.mutate(values)
          )}
          className="space-y-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nombre de codes"
              type="number"
              min={1}
              max={100}
              variant="glass"
              {...generateForm.register('count')}
              error={generateForm.formState.errors.count?.message}
              leftIcon={
                <Hash
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
            />

            <Input
              label="Préfixe optionnel"
              type="text"
              maxLength={12}
              variant="glass"
              placeholder="Ex : VIP, SUMMER"
              {...generateForm.register('prefix')}
              error={generateForm.formState.errors.prefix?.message}
              leftIcon={
                <Key
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Type de réduction
            </p>

            <TypeSelector
              value={generateType}
              onChange={(value) =>
                generateForm.setValue('type', value, {
                  shouldValidate: true,
                })
              }
            />
          </div>

          <Input
            label={
              generateType === 'percent'
                ? 'Réduction (%)'
                : 'Réduction fixe (USD)'
            }
            type="number"
            step="any"
            min={0}
            variant="glass"
            {...generateForm.register('value')}
            error={generateForm.formState.errors.value?.message}
            leftIcon={
              generateType === 'percent' ? (
                <Percent
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <DollarSign
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              )
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Utilisations max par code"
              type="number"
              min={0}
              max={10000}
              variant="glass"
              {...generateForm.register('maxUtilisations')}
              error={
                generateForm.formState.errors.maxUtilisations?.message
              }
              leftIcon={
                <RefreshCw
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
              hint="0 = illimité"
            />

            <Input
              label="Expiration (optionnelle)"
              type="date"
              variant="glass"
              {...generateForm.register('expiresAt')}
              error={generateForm.formState.errors.expiresAt?.message}
              leftIcon={
                <Calendar
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Montant minimum panier (USD)"
              type="number"
              step="0.01"
              min={0}
              variant="glass"
              placeholder="0 = aucun minimum"
              {...generateForm.register('minTotalUsd')}
              error={
                generateForm.formState.errors.minTotalUsd?.message
              }
              leftIcon={
                <Info
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
            />

            <Input
              label="Plafond réduction (USD)"
              type="number"
              step="0.01"
              min={0}
              variant="glass"
              placeholder="0 = aucun plafond"
              {...generateForm.register('maxDiscountUsd')}
              error={
                generateForm.formState.errors.maxDiscountUsd?.message
              }
              leftIcon={
                <DollarSign
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
            />
          </div>

          <Input
            label="Description interne"
            type="text"
            maxLength={255}
            variant="glass"
            placeholder="Ex : Campagne novembre 2026"
            {...generateForm.register('description')}
            error={
              generateForm.formState.errors.description?.message
            }
          />

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button
              type="submit"
              variant="luxe"
              fullWidth
              loading={generateMutation.isPending}
              leftIcon={<Sparkles size={16} aria-hidden="true" />}
            >
              Générer
            </Button>

            <Button
              type="button"
              variant="outline-gold"
              fullWidth
              onClick={() => setGenerateOpen(false)}
              disabled={generateMutation.isPending}
            >
              Annuler
            </Button>
          </div>
        </form>
      </Modal>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODALE — CRÉATION / ÉDITION MANUELLE                   */}
      {/* ═══════════════════════════════════════════════════════ */}

      <Modal
        isOpen={manualOpen}
        onClose={() => {
          setManualOpen(false)
          setEditingPromo(null)
        }}
        title={
          manualMode === 'create'
            ? 'Créer un code promo'
            : 'Éditer le code promo'
        }
        description={
          manualMode === 'create'
            ? "Définissez un code précis, ses règles et sa durée de vie."
            : "Modifiez les paramètres du code promo sélectionné."
        }
        size="md"
        accent="gold"
      >
        <form
          onSubmit={manualForm.handleSubmit((values) =>
            saveManualMutation.mutate(values)
          )}
          className="space-y-5"
        >
          {editBlockedByLegacyCdf && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              <p className="font-medium">
                Édition bloquée
              </p>

              <p className="mt-1">
                Ce code contient des montants CDF legacy sans prix USD
                explicite. Le taux USD/CDF est indisponible, donc la
                conversion ne peut pas être faite en toute sécurité.
              </p>
            </div>
          )}

          <Input
            label="Code promo"
            type="text"
            maxLength={30}
            variant="glass"
            placeholder="Ex : BIENVENUE10"
            disabled={
              manualMode === 'edit' &&
              Number(editingPromo?.utilisations_actuelles ?? 0) > 0
            }
            {...manualForm.register('code')}
            error={manualForm.formState.errors.code?.message}
            leftIcon={
              <Key
                size={16}
                className="text-muted-foreground"
                aria-hidden="true"
              />
            }
            hint={
              manualMode === 'edit' &&
              Number(editingPromo?.utilisations_actuelles ?? 0) > 0
                ? 'Le code ne peut plus être modifié car il a déjà été utilisé.'
                : undefined
            }
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Type de réduction
            </p>

            <TypeSelector
              value={manualType}
              onChange={(value) =>
                manualForm.setValue('type', value, {
                  shouldValidate: true,
                })
              }
            />
          </div>

          <Input
            label={
              manualType === 'percent'
                ? 'Réduction (%)'
                : 'Réduction fixe (USD)'
            }
            type="number"
            step="any"
            min={0}
            variant="glass"
            {...manualForm.register('value')}
            error={manualForm.formState.errors.value?.message}
            leftIcon={
              manualType === 'percent' ? (
                <Percent
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <DollarSign
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              )
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Utilisations max"
              type="number"
              min={0}
              max={10000}
              variant="glass"
              {...manualForm.register('maxUtilisations')}
              error={
                manualForm.formState.errors.maxUtilisations?.message
              }
              leftIcon={
                <RefreshCw
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
              hint="0 = illimité"
            />

            <Input
              label="Expiration (optionnelle)"
              type="date"
              variant="glass"
              {...manualForm.register('expiresAt')}
              error={manualForm.formState.errors.expiresAt?.message}
              leftIcon={
                <Calendar
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Montant minimum panier (USD)"
              type="number"
              step="0.01"
              min={0}
              variant="glass"
              placeholder="0 = aucun minimum"
              {...manualForm.register('minTotalUsd')}
              error={
                manualForm.formState.errors.minTotalUsd?.message
              }
              leftIcon={
                <Info
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
            />

            <Input
              label="Plafond réduction (USD)"
              type="number"
              step="0.01"
              min={0}
              variant="glass"
              placeholder="0 = aucun plafond"
              {...manualForm.register('maxDiscountUsd')}
              error={
                manualForm.formState.errors.maxDiscountUsd?.message
              }
              leftIcon={
                <DollarSign
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              }
            />
          </div>

          <Input
            label="Description interne"
            type="text"
            maxLength={255}
            variant="glass"
            placeholder="Ex : Code VIP client fidèle"
            {...manualForm.register('description')}
            error={
              manualForm.formState.errors.description?.message
            }
          />

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <input
              type="checkbox"
              {...manualForm.register('actif')}
              className="h-4 w-4 rounded border-border text-gold-500 focus:ring-gold-500"
            />

            <span className="font-medium text-foreground">
              Code actif
            </span>

            <span className="text-xs text-muted-foreground">
              Désactivez pour bloquer immédiatement son utilisation.
            </span>
          </label>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button
              type="submit"
              variant="luxe"
              fullWidth
              loading={saveManualMutation.isPending}
              disabled={Boolean(editBlockedByLegacyCdf)}
              leftIcon={
                manualMode === 'create' ? (
                  <Plus size={16} aria-hidden="true" />
                ) : (
                  <Check size={16} aria-hidden="true" />
                )
              }
            >
              {manualMode === 'create'
                ? 'Créer le code'
                : 'Enregistrer'}
            </Button>

            <Button
              type="button"
              variant="outline-gold"
              fullWidth
              onClick={() => {
                setManualOpen(false)
                setEditingPromo(null)
              }}
              disabled={saveManualMutation.isPending}
            >
              Annuler
            </Button>
          </div>
        </form>
      </Modal>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODALE — CONFIRMATION SUPPRESSION                      */}
      {/* ═══════════════════════════════════════════════════════ */}

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer ce code promo ?"
        description="Cette action est irréversible."
        size="sm"
        accent={'red' as any}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            <p className="font-semibold">
              {deleteTarget?.code}
            </p>

            <p className="mt-1 text-xs opacity-90">
              Ce code n’a jamais été utilisé. Il peut être supprimé
              définitivement.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="danger"
              fullWidth
              loading={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id)
                }
              }}
              leftIcon={<Trash2 size={16} aria-hidden="true" />}
            >
              Supprimer
            </Button>

            <Button
              variant="outline"
              fullWidth
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Annuler
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}