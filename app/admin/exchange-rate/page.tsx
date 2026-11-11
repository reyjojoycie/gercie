// app/admin/exchange-rate/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'

import { cn } from '@/lib/utils'

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Gauge,
  History,
  Info,
  Loader2,
  Percent,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type CurrencyCode = 'USD' | 'EUR' | 'GBP'

interface RatePoint {
  id?: string
  currency: CurrencyCode | string
  rate: number
  date: string
  updated_at?: string | null
  source?: string | null
  note?: string | null
}

interface AuditEntry {
  id: string
  created_at: string
  user_email: string
  currency: string
  old_rate?: number | null
  new_rate: number
  reason?: string | null
  source?: string | null
}

interface ExchangeRateBundle {
  current: RatePoint | null
  history: RatePoint[]
  audit: AuditEntry[]
  source?: string
  freshness?: 'fresh' | 'stale' | 'unknown'
  last_sync_at?: string | null
}

interface SavePayload {
  currency: string
  rate: number
  previous_rate?: number | null
  change_percent?: number
  reason: string
  source: string
  applies_at?: string | null
  updated_by?: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_CURRENCY: CurrencyCode = 'USD'
const DEFAULT_PERIOD = 30
const DRAFT_PREFIX = 'admin-exchange-rate-draft-v4'
const AUTOSAVE_INTERVAL = 10_000
const REASON_THRESHOLD_PERCENT = 5
const CONFIRM_THRESHOLD_PERCENT = 15
const MIN_RATE = 1
const MAX_RATE = 100000
const STALE_AFTER_HOURS = 24

const CURRENCIES: {
  code: CurrencyCode
  label: string
  hint: string
  isPrimary: boolean
}[] = [
  {
    code: 'USD',
    label: 'USD',
    hint: 'Dollar américain — DEVISE PRINCIPALE du projet',
    isPrimary: true,
  },
  {
    code: 'EUR',
    label: 'EUR',
    hint: 'Euro — conversion secondaire (optionnelle)',
    isPrimary: false,
  },
  {
    code: 'GBP',
    label: 'GBP',
    hint: 'Livre sterling — conversion secondaire (optionnelle)',
    isPrimary: false,
  },
]

const PERIODS = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
  { value: 365, label: '1 an' },
]

const SOURCES = [
  { value: 'manuel', label: 'Saisie manuelle' },
  { value: 'banque_centrale', label: 'Banque Centrale du Congo' },
  { value: 'api', label: 'API externe (exchangerate-api, frankfurter...)' },
  { value: 'correction', label: 'Correction urgente' },
  { value: 'import', label: 'Import CSV' },
]

const inputClass =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const selectClass = inputClass

const textareaClass =
  'w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function parseRate(value: string): number | null {
  const n = Number(String(value || '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  if (n < MIN_RATE || n > MAX_RATE) return null
  return n
}

function formatCdf(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${Math.round(n).toLocaleString('fr-FR')} FC`
}

function formatUsd(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `$${n.toFixed(2)}`
}

function formatPercent(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
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

function formatRelative(value?: string | null): string {
  if (!value) return ''
  try {
    const diff = Date.now() - new Date(value).getTime()
    const minutes = Math.floor(diff / 60_000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return "à l'instant"
    if (minutes < 60) return `il y a ${minutes} min`
    if (hours < 24) return `il y a ${hours} h`
    if (days < 30) return `il y a ${days} j`
    return formatDate(value)
  } catch {
    return ''
  }
}

function getFreshness(updatedAt?: string | null): 'fresh' | 'stale' | 'unknown' {
  if (!updatedAt) return 'unknown'

  const diff = Date.now() - new Date(updatedAt).getTime()
  const hours = diff / (1000 * 60 * 60)

  if (hours <= STALE_AFTER_HOURS) return 'fresh'
  return 'stale'
}

function draftKey(currency: string): string {
  return `${DRAFT_PREFIX}:${currency}`
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

function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // silencieux
  }
}

async function copyText(text: string): Promise<boolean> {
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

function downloadBlob(content: string, filename: string, mime: string) {
  if (typeof window === 'undefined') return

  const blob = new Blob([content], { type: `${mime};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function normalizeRatePoint(raw: any, currency: string): RatePoint | null {
  const rate = Number(
    raw?.rate ??
      raw?.value ??
      raw?.taux ??
      raw?.montant ??
      raw?.exchange_rate ??
      raw
  )

  if (!Number.isFinite(rate) || rate <= 0) return null

  const date =
    raw?.date ||
    raw?.updated_at ||
    raw?.created_at ||
    new Date().toISOString()

  return {
    id: raw?.id ? String(raw.id) : undefined,
    currency: raw?.currency || currency,
    rate,
    date: new Date(date).toISOString(),
    updated_at: raw?.updated_at || raw?.created_at || date,
    source: raw?.source || null,
    note: raw?.note || raw?.raison || raw?.commentaire || null,
  }
}

function normalizeAudit(raw: any): AuditEntry {
  return {
    id: String(raw?.id || `${Date.now()}-${Math.random()}`),
    created_at: raw?.created_at || raw?.date || new Date().toISOString(),
    user_email:
      raw?.user_email ||
      raw?.admin?.email ||
      raw?.user?.email ||
      raw?.modifie_par ||
      'Système',
    currency: raw?.currency || 'USD',
    old_rate:
      raw?.old_rate != null
        ? Number(raw.old_rate)
        : raw?.previous_rate != null
          ? Number(raw.previous_rate)
          : raw?.ancien_taux != null
            ? Number(raw.ancien_taux)
            : null,
    new_rate: Number(
      raw?.new_rate ?? raw?.rate ?? raw?.nouveau_taux ?? raw?.value ?? 0
    ),
    reason: raw?.reason || raw?.note || raw?.commentaire || raw?.raison || '',
    source: raw?.source || null,
  }
}

function normalizeBundle(json: any, currency: string): ExchangeRateBundle {
  let current: RatePoint | null = null
  let history: RatePoint[] = []
  let audit: AuditEntry[] = []

  if (Array.isArray(json)) {
    history = json
      .map((item) => normalizeRatePoint(item, currency))
      .filter(Boolean) as RatePoint[]
  } else if (json && typeof json === 'object') {
    const direct = normalizeRatePoint(
      json.current || json.data || json.rate || json.value || json,
      currency
    )

    if (direct) current = direct

    const rawHistory =
      json.history ||
      json.rates ||
      json.points ||
      (Array.isArray(json.data) ? json.data : [])

    if (Array.isArray(rawHistory)) {
      history = rawHistory
        .map((item: any) => normalizeRatePoint(item, currency))
        .filter(Boolean) as RatePoint[]
    }

    const rawAudit = json.audit || json.logs || json.journal || []
    if (Array.isArray(rawAudit)) {
      audit = rawAudit.map(normalizeAudit)
    }
  }

  history.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  if (!current && history.length > 0) {
    current = history[0]
  }

  const updatedAt = current?.updated_at || current?.date

  return {
    current,
    history,
    audit,
    source: json?.source || null,
    freshness: getFreshness(updatedAt),
    last_sync_at: updatedAt,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH / SAVE — SOURCE UNIQUE                                   */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * RÈGLE :
 * - La source officielle du taux est la table Supabase `exchange_rates`.
 * - L'endpoint public `/api/exchange-rate` lit cette table.
 * - L'endpoint admin `/api/admin/exchange-rate` écrit dans cette table
 *   ET crée une entrée dans `exchange_rate_audit`.
 *
 * Ce helper essaie d'abord l'endpoint admin dédié, puis retombe
 * sur les anciens endpoints de compatibilité si nécessaire.
 */
async function fetchExchangeRateBundle(
  currency: string,
  period: number
): Promise<ExchangeRateBundle> {
  const candidates = [
    `/api/admin/exchange-rate?currency=${encodeURIComponent(currency)}&period=${period}`,
    `/api/exchange-rate?currency=${encodeURIComponent(currency)}&period=${period}&admin=true`,
    `/api/admin/exchange-rate/history?currency=${encodeURIComponent(currency)}&period=${period}`,
  ]

  let lastError = ''

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        lastError = body?.error || `HTTP ${res.status}`
        continue
      }

      const json = await res.json()
      const bundle = normalizeBundle(json, currency)

      if (bundle.current || bundle.history.length > 0) {
        return bundle
      }
    } catch (err: any) {
      lastError = err?.message || 'Erreur réseau'
    }
  }

  throw new Error(
    lastError ||
      'Aucune source de taux disponible. Vérifiez que la table exchange_rates existe et contient des données.'
  )
}

/**
 * RÈGLE :
 * - Écriture PRIORITAIRE dans `/api/admin/exchange-rate` (PUT).
 * - Si l'endpoint admin n'existe pas encore, fallback sur `/api/settings`.
 * - Ne JAMAIS écrire dans plusieurs sources en même temps :
 *   ça créerait des divergences entre admin et frontend.
 */
async function saveExchangeRate(payload: SavePayload): Promise<any> {
  const primaryCandidate = {
    url: '/api/admin/exchange-rate',
    method: 'PUT',
    body: payload,
  }

  try {
    const res = await fetch(primaryCandidate.url, {
      method: primaryCandidate.method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(primaryCandidate.body),
    })

    const json = await res.json().catch(() => ({}))

    if (res.ok) {
      return json
    }

    /*
     * Si l'endpoint admin n'existe pas (404), on tente le POST.
     * Si ni PUT ni POST ne marchent, on retombe sur settings.
     */
    if (res.status === 404 || res.status === 405) {
      const postRes = await fetch('/api/admin/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const postJson = await postRes.json().catch(() => ({}))

      if (postRes.ok) {
        return postJson
      }
    }

    throw new Error(json?.error || `HTTP ${res.status}`)
  } catch (primaryErr: any) {
    /*
     * Fallback compatibilité : settings.
     * Ce fallback ne doit servir QUE pendant la transition.
     */
    const settingsKeys =
      payload.currency === 'USD'
        ? ['exchange_rate', 'exchange_rate_usd', 'usd_cdf_rate']
        : [`exchange_rate_${payload.currency.toLowerCase()}`]

    let lastSettingsError = ''

    for (const key of settingsKeys) {
      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            key,
            value: payload.rate,
            currency: payload.currency,
            updated_at: new Date().toISOString(),
            reason: payload.reason,
            source: payload.source,
          }),
        })

        const json = await res.json().catch(() => ({}))

        if (res.ok) {
          return { ...json, _fallback: 'settings' }
        }

        lastSettingsError = json?.error || `HTTP ${res.status}`
      } catch (err: any) {
        lastSettingsError = err?.message || 'Erreur réseau'
      }
    }

    throw new Error(
      lastSettingsError ||
        primaryErr?.message ||
        "Impossible d'enregistrer le taux."
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MINI COMPOSANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50',
        checked ? 'bg-gold-500' : 'bg-muted'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

function StatBox({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
  tone?: 'default' | 'up' | 'down' | 'gold' | 'warn'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        tone === 'gold'
          ? 'border-gold-400/25 bg-gold-500/5'
          : tone === 'up'
            ? 'border-emerald-500/20 bg-emerald-500/5'
            : tone === 'down'
              ? 'border-red-500/20 bg-red-500/5'
              : tone === 'warn'
                ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-border bg-background/50'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        {icon && <span className="text-gold-500">{icon}</span>}
      </div>

      <p
        className={cn(
          'mt-2 text-xl font-bold',
          tone === 'up'
            ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'down'
              ? 'text-red-600 dark:text-red-400'
              : tone === 'warn'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-foreground'
        )}
      >
        {value}
      </p>

      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function RateChart({ points }: { points: RatePoint[] }) {
  const prefersReduced = useReducedMotion()
  const data = useMemo(
    () =>
      [...points]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-90),
    [points]
  )

  if (data.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 text-sm text-muted-foreground">
        Pas assez de données historiques pour afficher un graphique.
      </div>
    )
  }

  const values = data.map((p) => p.rate)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((a, b) => a + b, 0) / values.length

  const width = 800
  const height = 220
  const paddingX = 12
  const paddingY = 24

  const innerWidth = width - paddingX * 2
  const innerHeight = height - paddingY * 2
  const range = max - min || 1

  const coords = data.map((point, index) => {
    const x = paddingX + (index / (data.length - 1)) * innerWidth
    const y =
      paddingY + innerHeight - ((point.rate - min) / range) * innerHeight
    return { x, y, point }
  })

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
    .join(' ')

  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height - paddingY} L ${coords[0].x} ${height - paddingY} Z`

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-background/40">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-56 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="Graphique historique du taux de change"
        >
          <defs>
            <linearGradient id="rateArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(234 179 8)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(234 179 8)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={paddingX}
              x2={width - paddingX}
              y1={paddingY + innerHeight * ratio}
              y2={paddingY + innerHeight * ratio}
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
          ))}

          <motion.path
            d={areaPath}
            fill="url(#rateArea)"
            initial={prefersReduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          />

          <motion.path
            d={linePath}
            fill="none"
            stroke="rgb(234 179 8)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={prefersReduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8 }}
          />

          {coords.map((c, idx) => (
            <circle
              key={`${c.point.date}-${idx}`}
              cx={c.x}
              cy={c.y}
              r={idx === coords.length - 1 ? 5 : 2.5}
              className={idx === coords.length - 1 ? 'fill-gold-500' : 'fill-muted-foreground'}
            >
              <title>
                {formatDate(c.point.date)} — {formatCdf(c.point.rate)}
              </title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl border border-border bg-background/50 p-3">
          <p className="text-muted-foreground">Minimum</p>
          <p className="mt-1 font-semibold text-foreground">{formatCdf(min)}</p>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-3">
          <p className="text-muted-foreground">Moyenne</p>
          <p className="mt-1 font-semibold text-foreground">{formatCdf(avg)}</p>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-3">
          <p className="text-muted-foreground">Maximum</p>
          <p className="mt-1 font-semibold text-foreground">{formatCdf(max)}</p>
        </div>
      </div>
    </div>
  )
}

function PropagationBanner({
  currency,
  rate,
  isPrimary,
}: {
  currency: string
  rate: number | null
  isPrimary: boolean
}) {
  if (!isPrimary) {
    return (
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
        <Info size={18} className="mt-0.5 shrink-0" />
        <p>
          Le taux <strong>{currency} → CDF</strong> est secondaire.
          Il n'alimente pas le panier ni la commande.
          Seule la devise <strong>USD</strong> est la source de vérité prix.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-gold-400/25 bg-gold-500/5 p-4 text-sm">
      <Zap size={18} className="mt-0.5 shrink-0 text-gold-600" />
      <div className="flex-1">
        <p className="font-semibold text-foreground">
          Taux USD → CDF : {rate ? formatCdf(rate) : '—'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ce taux alimente automatiquement :
          <span className="ml-1 font-medium text-foreground">catalogue produits</span>,
          <span className="ml-1 font-medium text-foreground">panier</span>,
          <span className="ml-1 font-medium text-foreground">commande</span>,
          <span className="ml-1 font-medium text-foreground">livraison CDF</span>,
          <span className="ml-1 font-medium text-foreground">promotions</span>,
          <span className="ml-1 font-medium text-foreground">paiement Mobile Money</span>.
        </p>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          ⚠ Les commandes déjà créées ne sont PAS affectées : elles gardent leur snapshot
          (shipping_rate_used, total_cdf, shipping_cdf).
        </p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminExchangeRatePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast() as any
  const prefersReduced = useReducedMotion()
  const isOnline = useOnlineStatus()
  const { user, loading: authLoading, isAdmin } = useAuth()

  const currentIsAdmin = Boolean(isAdmin)

  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY)
  const [period, setPeriod] = useState(DEFAULT_PERIOD)

  const [rateInput, setRateInput] = useState('')
  const [reason, setReason] = useState('')
  const [source, setSource] = useState('manuel')
  const [appliesAt, setAppliesAt] = useState('')

  const [dirty, setDirty] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [historyView, setHistoryView] = useState<'chart' | 'table'>('chart')
  const [sortKey, setSortKey] = useState<'date' | 'rate'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [calcAmount, setCalcAmount] = useState('100')
  const [calcDirection, setCalcDirection] = useState<'usd_cdf' | 'cdf_usd'>(
    'usd_cdf'
  )

  const loadedRef = useRef<string | null>(null)
  const autosaveRef = useRef<NodeJS.Timeout | null>(null)

  const currentCurrencyMeta = useMemo(
    () => CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0],
    [currency]
  )

  /* ---------------------------------------------------------- */
  /* Titre page                                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Taux de change | Admin Gercie'
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Guard admin                                                 */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/admin/exchange-rate')}`
      )
      return
    }

    if (!currentIsAdmin) {
      router.replace('/')
    }
  }, [authLoading, currentIsAdmin, router, user])

  /* ---------------------------------------------------------- */
  /* Query bundle                                                */
  /* ---------------------------------------------------------- */

  const {
    data: bundle,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<ExchangeRateBundle>({
    queryKey: ['admin-exchange-rate', currency, period],
    queryFn: () => fetchExchangeRateBundle(currency, period),
    enabled: !!user && currentIsAdmin,
    staleTime: 15_000,
    retry: 1,
  })

  const history = useMemo(() => bundle?.history ?? [], [bundle?.history])
  const audit = useMemo(() => bundle?.audit ?? [], [bundle?.audit])

  const currentRate = bundle?.current?.rate ?? history[0]?.rate ?? null
  const previousRate = history[1]?.rate ?? null
  const updatedAt = bundle?.current?.updated_at || bundle?.current?.date
  const freshness = bundle?.freshness ?? 'unknown'

  const trendPercent =
    currentRate && previousRate
      ? ((currentRate - previousRate) / previousRate) * 100
      : 0

  const parsedRate = parseRate(rateInput)
  const changePercent =
    currentRate && parsedRate
      ? ((parsedRate - currentRate) / currentRate) * 100
      : 0

  const needsReason = Math.abs(changePercent) >= REASON_THRESHOLD_PERCENT
  const needsConfirm = Math.abs(changePercent) >= CONFIRM_THRESHOLD_PERCENT

  const sortedHistory = useMemo(() => {
    const arr = [...history]

    arr.sort((a, b) => {
      if (sortKey === 'rate') {
        return sortDir === 'asc' ? a.rate - b.rate : b.rate - a.rate
      }

      const da = new Date(a.date).getTime()
      const db = new Date(b.date).getTime()
      return sortDir === 'asc' ? da - db : db - da
    })

    return arr
  }, [history, sortDir, sortKey])

  /* ---------------------------------------------------------- */
  /* Application du taux courant au formulaire                   */
  /* ---------------------------------------------------------- */

  const applyCurrentToForm = useCallback((rate?: number | null) => {
    setRateInput(rate != null ? String(rate) : '')
    setReason('')
    setAppliesAt('')
    setConfirmed(false)
    setDirty(false)
  }, [])

  useEffect(() => {
    if (!bundle?.current) return
    if (draftRestored) return

    const key = `${currency}:${bundle.current.updated_at || bundle.current.rate}`
    if (loadedRef.current === key) return

    loadedRef.current = key
    applyCurrentToForm(bundle.current.rate)
  }, [applyCurrentToForm, bundle, currency, draftRestored])

  /* ---------------------------------------------------------- */
  /* Brouillon local                                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!user || !currentIsAdmin) return

    const key = draftKey(currency)
    const draft = safeLocalStorageGet<any>(key, null)

    if (draft?.rateInput) {
      setRateInput(String(draft.rateInput))
      setReason(String(draft.reason || ''))
      setSource(String(draft.source || 'manuel'))
      setAppliesAt(String(draft.appliesAt || ''))
      setDraftRestored(true)
      setDirty(true)
      setConfirmed(false)
    } else {
      setDraftRestored(false)
    }

    loadedRef.current = null
  }, [currency, currentIsAdmin, user])

  useEffect(() => {
    if (!dirty) return

    if (autosaveRef.current) clearInterval(autosaveRef.current)

    autosaveRef.current = setInterval(() => {
      if (!dirty) return

      safeLocalStorageSet(draftKey(currency), {
        rateInput,
        reason,
        source,
        appliesAt,
        saved_at: new Date().toISOString(),
      })
    }, AUTOSAVE_INTERVAL)

    return () => {
      if (autosaveRef.current) clearInterval(autosaveRef.current)
    }
  }, [appliesAt, currency, dirty, rateInput, reason, source])

  const saveDraftNow = useCallback(() => {
    safeLocalStorageSet(draftKey(currency), {
      rateInput,
      reason,
      source,
      appliesAt,
      saved_at: new Date().toISOString(),
    })

    toast?.addToast?.({
      type: 'success',
      message: 'Brouillon local enregistré.',
    })
  }, [appliesAt, currency, rateInput, reason, source, toast])

  const discardDraft = useCallback(() => {
    safeLocalStorageRemove(draftKey(currency))
    setDraftRestored(false)
    loadedRef.current = null
    applyCurrentToForm(currentRate)
    toast?.addToast?.({
      type: 'info',
      message: 'Brouillon supprimé.',
    })
  }, [applyCurrentToForm, currentRate, currency, toast])

  /* ---------------------------------------------------------- */
  /* Mutations — CORRECTION CRITIQUE DE PROPAGATION              */
  /* ---------------------------------------------------------- */

  const saveMutation = useMutation({
    mutationFn: (payload: SavePayload) => saveExchangeRate(payload),
    onSuccess: (response) => {
      /*
       * 1. Rafraîchit la page admin elle-même.
       */
      queryClient.invalidateQueries({
        queryKey: ['admin-exchange-rate'],
      })

      /*
       * 2. Rafraîchit TOUTES les clés React Query potentiellement
       *    utilisées par le hook global useExchangeRate().
       *
       *    On couvre plusieurs conventions de nommage pour éviter
       *    les oublis si le hook a été écrit avec un nom différent.
       */
      queryClient.invalidateQueries({ queryKey: ['exchange-rate'] })
      queryClient.invalidateQueries({ queryKey: ['exchange-rate', currency] })
      queryClient.invalidateQueries({ queryKey: ['useExchangeRate'] })
      queryClient.invalidateQueries({ queryKey: ['use-exchange-rate'] })
      queryClient.invalidateQueries({ queryKey: ['current-exchange-rate'] })
      queryClient.invalidateQueries({ queryKey: ['current-exchange-rate', currency] })
      queryClient.invalidateQueries({ queryKey: ['global-exchange-rate'] })

      /*
       * 3. Invalide aussi les caches panier / commande / produits
       *    qui pourraient avoir mémorisé d'anciennes conversions CDF.
       */
      queryClient.invalidateQueries({ queryKey: ['cart-raw'] })
      queryClient.invalidateQueries({ queryKey: ['produits-batch-cart'] })
      queryClient.invalidateQueries({ queryKey: ['produits'] })
      queryClient.invalidateQueries({ queryKey: ['product-detail'] })

      /*
       * 4. Event global de secours pour les composants hors React Query
       *    (ex : composants qui lisent le taux via un state local).
       */
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('gercie:exchange-rate-updated', {
            detail: {
              currency,
              rate: parsedRate,
              previous_rate: currentRate,
              change_percent: changePercent,
              source: response?.source || source,
              updated_at: new Date().toISOString(),
              is_primary: currentCurrencyMeta.isPrimary,
            },
          })
        )
      }

      /*
       * 5. Nettoyage draft.
       */
      safeLocalStorageRemove(draftKey(currency))
      setDraftRestored(false)
      setDirty(false)
      setConfirmed(false)
      setShowConfirmModal(false)
      loadedRef.current = null

      /*
       * 6. Toast explicite sur la propagation.
       */
      const propagationMsg = currentCurrencyMeta.isPrimary
        ? `Taux USD → CDF mis à jour : ${formatCdf(parsedRate)}. Panier, commande, livraison et promotions vont recalculer les conversions CDF.`
        : `Taux ${currency} → CDF mis à jour : ${formatCdf(parsedRate)}. Ce taux est secondaire et n'affecte pas le panier ni la commande.`

      toast?.addToast?.({
        type: 'success',
        message: propagationMsg,
      })
    },
    onError: (err: any) => {
      toast?.addToast?.({
        type: 'error',
        message: err?.message || "Impossible d'enregistrer le taux.",
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Validation / save                                             */
  /* ---------------------------------------------------------- */

  const buildPayload = useCallback((): SavePayload | null => {
    if (!parsedRate) return null

    return {
      currency,
      rate: parsedRate,
      previous_rate: currentRate,
      change_percent: Number(changePercent.toFixed(2)),
      reason: reason.trim(),
      source,
      applies_at: appliesAt ? new Date(appliesAt).toISOString() : null,
      updated_by: user?.email || null,
    }
  }, [
    appliesAt,
    changePercent,
    currency,
    currentRate,
    parsedRate,
    reason,
    source,
    user?.email,
  ])

  const attemptSave = useCallback(() => {
    if (!parsedRate) {
      toast?.addToast?.({
        type: 'error',
        message: `Taux invalide. Entre un nombre entre ${MIN_RATE} et ${MAX_RATE}.`,
      })
      return
    }

    if (needsReason && !reason.trim()) {
      toast?.addToast?.({
        type: 'error',
        message: `Une raison est obligatoire pour une variation de ${formatPercent(changePercent)}.`,
      })
      return
    }

    if (needsConfirm && !confirmed) {
      setShowConfirmModal(true)
      return
    }

    const payload = buildPayload()
    if (!payload) return

    saveMutation.mutate(payload)
  }, [
    buildPayload,
    changePercent,
    confirmed,
    needsConfirm,
    needsReason,
    parsedRate,
    reason,
    saveMutation,
    toast,
  ])

  /* ---------------------------------------------------------- */
  /* Raccourcis / beforeunload                                   */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        attemptSave()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [attemptSave])

  useEffect(() => {
    if (!dirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  /* ---------------------------------------------------------- */
  /* Auto refresh                                                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!autoRefresh || dirty) return

    const id = setInterval(() => {
      queryClient.invalidateQueries({
        queryKey: ['admin-exchange-rate', currency, period],
      })
    }, 60_000)

    return () => clearInterval(id)
  }, [autoRefresh, currency, dirty, period, queryClient])

  /* ---------------------------------------------------------- */
  /* Handlers UI                                                 */
  /* ---------------------------------------------------------- */

  const updateRateInput = useCallback((value: string) => {
    setRateInput(value)
    setDirty(true)
    setConfirmed(false)
  }, [])

  const applyDelta = useCallback(
    (percent: number) => {
      const base = parsedRate ?? currentRate
      if (!base) return

      const next = base * (1 + percent / 100)
      updateRateInput(next.toFixed(2))
    },
    [currentRate, parsedRate, updateRateInput]
  )

  const roundRate = useCallback(
    (step: number) => {
      const base = parsedRate ?? currentRate
      if (!base) return

      const next = Math.round(base / step) * step
      updateRateInput(String(next))
    },
    [currentRate, parsedRate, updateRateInput]
  )

  const handleCopy = useCallback(
    async (text: string, id: string) => {
      const ok = await copyText(text)
      if (ok) {
        setCopied(id)
        toast?.addToast?.({ type: 'success', message: 'Copié.' })
        setTimeout(() => setCopied(null), 1800)
      } else {
        toast?.addToast?.({ type: 'error', message: 'Copie impossible.' })
      }
    },
    [toast]
  )

  const exportHistoryCsv = useCallback(() => {
    if (history.length === 0) {
      toast?.addToast?.({ type: 'error', message: 'Aucun historique à exporter.' })
      return
    }

    const headers = ['Date', 'Devise', 'Taux', 'Source', 'Note']
    const rows = history.map((h) => [
      h.date,
      h.currency,
      h.rate,
      h.source || '',
      (h.note || '').replace(/\n/g, ' '),
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    downloadBlob(
      csv,
      `exchange-rate-${currency}-${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv'
    )

    toast?.addToast?.({ type: 'success', message: 'Historique exporté.' })
  }, [currency, history, toast])

  const exportBundleJson = useCallback(() => {
    if (!bundle) {
      toast?.addToast?.({ type: 'error', message: 'Aucune donnée à exporter.' })
      return
    }

    downloadBlob(
      JSON.stringify(bundle, null, 2),
      `exchange-rate-${currency}-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    )

    toast?.addToast?.({ type: 'success', message: 'Données JSON exportées.' })
  }, [bundle, currency, toast])

  const toggleSort = useCallback((key: 'date' | 'rate') => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'))
        return prevKey
      }

      setSortDir('desc')
      return key
    })
  }, [])

  /* ---------------------------------------------------------- */
  /* Calculateur                                                 */
  /* ---------------------------------------------------------- */

  const calcValue = Number(String(calcAmount).replace(',', '.'))
  const calcValid = Number.isFinite(calcValue) && calcValue > 0

  const converted = useMemo(() => {
    if (!currentRate || !calcValid) return null

    if (calcDirection === 'usd_cdf') {
      return {
        from: formatUsd(calcValue),
        to: formatCdf(calcValue * currentRate),
      }
    }

    return {
      from: formatCdf(calcValue),
      to: formatUsd(calcValue / currentRate),
    }
  }, [calcAmount, calcDirection, calcValid, currentRate])

  /* ---------------------------------------------------------- */
  /* Rendu loading / erreur                                      */
  /* ---------------------------------------------------------- */

  if (authLoading || !currentIsAdmin) {
    return (
      <Container className="py-10">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full rounded-3xl" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-[520px] lg:col-span-2" />
            <Skeleton className="h-[520px]" />
          </div>
        </div>
      </Container>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background pb-28">
      <Container className="py-8 md:py-10">
        {/* Breadcrumb */}
        <nav
          aria-label="Fil d'Ariane admin"
          className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        >
          <Link href="/admin" className="transition hover:text-gold-500">
            Admin
          </Link>

          <span>/</span>

          <span className="font-medium text-foreground">Taux de change</span>
        </nav>

        {/* Header */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-extrabold text-foreground font-serif md:text-4xl">
              <Banknote size={30} className="text-gold-500" />
              Taux de change
            </h1>

            <p className="mt-2 text-muted-foreground">
              Source de vérité : table Supabase <code className="rounded bg-muted px-1.5 py-0.5 text-xs">exchange_rates</code>.
              Le taux USD/CDF alimente catalogue, panier, commande, livraison, promos et paiement.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="gold" size="sm">
                <Banknote size={12} className="mr-1" />
                {currency} vers CDF
              </Badge>

              {currentRate ? (
                <Badge variant="accent" size="sm">
                  1 {currency} ≈ {formatCdf(currentRate)}
                </Badge>
              ) : (
                <Badge variant="danger" size="sm">
                  <AlertTriangle size={12} className="mr-1" />
                  Taux indisponible
                </Badge>
              )}

              {updatedAt && (
                <Badge
                  variant={freshness === 'fresh' ? 'accent' : 'warm'}
                  size="sm"
                >
                  <Clock size={12} className="mr-1" />
                  {formatRelative(updatedAt)}
                  {freshness === 'stale' && ' (obsolète)'}
                </Badge>
              )}

              {dirty && (
                <Badge variant="warm" size="sm">
                  <AlertTriangle size={12} className="mr-1" />
                  Non enregistré
                </Badge>
              )}

              {draftRestored && (
                <Badge variant="gold" size="sm">
                  <Save size={12} className="mr-1" />
                  Brouillon
                </Badge>
              )}

              {appliesAt && new Date(appliesAt).getTime() > Date.now() && (
                <Badge variant="accent" size="sm">
                  <CalendarClock size={12} className="mr-1" />
                  Programmé
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tooltip content={isFetching ? 'Chargement...' : 'Actualiser'}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                leftIcon={
                  isFetching ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )
                }
              >
                Actualiser
              </Button>
            </Tooltip>

            <Tooltip content="Exporter l'historique CSV">
              <Button
                variant="outline"
                size="sm"
                onClick={exportHistoryCsv}
                leftIcon={<Download size={14} />}
              >
                CSV
              </Button>
            </Tooltip>

            <Tooltip content="Exporter le bundle JSON">
              <Button
                variant="outline"
                size="sm"
                onClick={exportBundleJson}
                leftIcon={<FileText size={14} />}
              >
                JSON
              </Button>
            </Tooltip>
          </div>
        </motion.div>

        {/* Bandeau de propagation — USD principal */}
        <PropagationBanner
          currency={currency}
          rate={currentRate}
          isPrimary={currentCurrencyMeta.isPrimary}
        />

        {/* Alertes */}
        {!isOnline && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p>
              Mode hors ligne : les données affichées peuvent être obsolètes.
              La sauvegarde nécessitera une connexion internet.
            </p>
          </div>
        )}

        {freshness === 'stale' && currentRate && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <Clock size={18} className="mt-0.5 shrink-0" />
            <p>
              Le taux n'a pas été mis à jour depuis plus de {STALE_AFTER_HOURS} heures.
              Dernière mise à jour : {formatDate(updatedAt)}.
              Pense à le rafraîchir pour que les conversions CDF restent fiables.
            </p>
          </div>
        )}

        {isError && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Erreur de chargement</p>
                <p className="mt-1">
                  {error instanceof Error
                    ? error.message
                    : 'Impossible de charger le taux de change.'}
                </p>
                <p className="mt-2 text-xs opacity-80">
                  Vérifie que la table <code>exchange_rates</code> existe dans Supabase
                  et contient au moins une ligne pour {currency}.
                </p>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        <AnimatePresence>
          {draftRestored && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <Save size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Brouillon local restauré</p>
                  <p className="mt-1 text-xs opacity-90">
                    Des modifications non enregistrées ont été retrouvées dans
                    ce navigateur.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveDraftNow}
                  leftIcon={<Save size={14} />}
                >
                  Sauver
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:bg-red-500/10"
                  onClick={discardDraft}
                  leftIcon={<Trash2 size={14} />}
                >
                  Supprimer
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Devise
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value as CurrencyCode)
                  loadedRef.current = null
                }}
                className={cn(selectClass, 'h-10 w-28 py-0')}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} {c.isPrimary ? '★' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Période
              <select
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                className={cn(selectClass, 'h-10 w-32 py-0')}
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={autoRefresh}
                onChange={setAutoRefresh}
                label="Rafraîchissement automatique"
              />
              Auto-refresh
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" size="sm">
              {history.length} point{history.length > 1 ? 's' : ''} historique
            </Badge>

            <Badge variant="neutral" size="sm">
              {audit.length} entrée{audit.length > 1 ? 's' : ''} d'audit
            </Badge>

            {bundle?.source && (
              <Badge variant="neutral" size="sm">
                Source : {bundle.source}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Colonne principale */}
          <div className="space-y-6 lg:col-span-2">
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatBox
                label={`Taux actuel ${currency}`}
                value={currentRate ? formatCdf(currentRate) : '—'}
                sub={updatedAt ? formatDate(updatedAt) : undefined}
                icon={<Gauge size={18} />}
                tone="gold"
              />

              <StatBox
                label="Variation précédente"
                value={formatPercent(trendPercent)}
                sub={previousRate ? `Avant : ${formatCdf(previousRate)}` : undefined}
                icon={
                  trendPercent >= 0 ? (
                    <ArrowUp size={18} />
                  ) : (
                    <ArrowDown size={18} />
                  )
                }
                tone={trendPercent >= 0 ? 'up' : 'down'}
              />

              <StatBox
                label="Nouvelle valeur saisie"
                value={parsedRate ? formatCdf(parsedRate) : '—'}
                sub={
                  parsedRate
                    ? `Écart : ${formatPercent(changePercent)}`
                    : 'En attente de saisie valide'
                }
                icon={<Percent size={18} />}
              />

              <StatBox
                label="Rôle dans le système"
                value={currentCurrencyMeta.isPrimary ? 'PRINCIPAL' : 'Secondaire'}
                sub={
                  currentCurrencyMeta.isPrimary
                    ? 'Alimente panier, commande, livraison, promos'
                    : 'Conversion optionnelle uniquement'
                }
                icon={<Zap size={18} />}
                tone={currentCurrencyMeta.isPrimary ? 'gold' : 'default'}
              />
            </div>

            {/* Graphique / historique */}
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History size={18} className="text-gold-500" />
                      Historique du taux
                    </CardTitle>
                    <CardDescription>
                      Évolution sur {period} jours pour {currency}.
                    </CardDescription>
                  </div>

                  <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setHistoryView('chart')}
                      className={cn(
                        'rounded-full px-3 py-1.5 font-medium transition',
                        historyView === 'chart'
                          ? 'bg-gold-500 text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Graphique
                    </button>

                    <button
                      type="button"
                      onClick={() => setHistoryView('table')}
                      className={cn(
                        'rounded-full px-3 py-1.5 font-medium transition',
                        historyView === 'table'
                          ? 'bg-gold-500 text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Tableau
                    </button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-56 w-full rounded-2xl" />
                ) : historyView === 'chart' ? (
                  <RateChart points={history} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border text-left text-xs font-semibold uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => toggleSort('date')}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              Date
                              {sortKey === 'date' && (
                                <span className="text-gold-500">
                                  {sortDir === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </button>
                          </th>

                          <th className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => toggleSort('rate')}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              Taux
                              {sortKey === 'rate' && (
                                <span className="text-gold-500">
                                  {sortDir === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </button>
                          </th>

                          <th className="px-3 py-3">Variation</th>
                          <th className="px-3 py-3">Source</th>
                          <th className="px-3 py-3">Note</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-border">
                        {sortedHistory.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-3 py-8 text-center text-muted-foreground"
                            >
                              Aucun historique disponible.
                            </td>
                          </tr>
                        ) : (
                          sortedHistory.map((row, idx) => {
                            const older = sortedHistory[idx + 1]
                            const rowChange =
                              older && older.rate > 0
                                ? ((row.rate - older.rate) / older.rate) * 100
                                : 0

                            return (
                              <tr key={`${row.date}-${idx}`} className="hover:bg-muted/30">
                                <td className="px-3 py-3 text-muted-foreground">
                                  {formatDate(row.date)}
                                </td>

                                <td className="px-3 py-3 font-semibold text-foreground">
                                  {formatCdf(row.rate)}
                                </td>

                                <td
                                  className={cn(
                                    'px-3 py-3 font-medium',
                                    rowChange >= 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-red-600 dark:text-red-400'
                                  )}
                                >
                                  {formatPercent(rowChange)}
                                </td>

                                <td className="px-3 py-3 text-muted-foreground">
                                  {row.source || '—'}
                                </td>

                                <td className="max-w-[220px] truncate px-3 py-3 text-muted-foreground">
                                  {row.note || '—'}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Journal d'audit */}
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck size={18} className="text-gold-500" />
                  Journal d'audit
                </CardTitle>
                <CardDescription>
                  Traçabilité des modifications du taux de change.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun journal d'audit disponible pour le moment.
                  </p>
                ) : (
                  audit.slice(0, 20).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-border bg-background/50 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {entry.user_email}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(entry.created_at)} •{' '}
                            {formatRelative(entry.created_at)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="neutral" size="sm">
                            {entry.currency}
                          </Badge>
                          <Badge variant="neutral" size="sm">
                            {entry.source || 'admin'}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        {entry.old_rate ? (
                          <span className="text-muted-foreground line-through">
                            {formatCdf(entry.old_rate)}
                          </span>
                        ) : null}

                        <ArrowRight size={14} className="text-muted-foreground" />

                        <span className="font-semibold text-gold-600">
                          {formatCdf(entry.new_rate)}
                        </span>
                      </div>

                      {entry.reason && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {entry.reason}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              {/* Éditeur */}
              <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles size={18} className="text-gold-500" />
                    Mettre à jour le taux
                  </CardTitle>
                  <CardDescription>
                    Saisis la nouvelle valeur, la raison et éventuellement une
                    date d'application.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-3">
                    <p className="text-xs text-muted-foreground">
                      Taux courant
                    </p>
                    <p className="mt-1 text-2xl font-extrabold text-gold-600">
                      {currentRate ? formatCdf(currentRate) : '—'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      1 {currency} ≈ {currentRate ? formatCdf(currentRate) : '—'}
                    </p>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Nouveau taux {currency} → CDF
                    </span>

                    <div className="relative">
                      <input
                        value={rateInput}
                        onChange={(e) => updateRateInput(e.target.value)}
                        inputMode="decimal"
                        placeholder="Ex : 2850"
                        className={cn(inputClass, 'pr-20')}
                      />

                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                        FC
                      </span>
                    </div>

                    {parsedRate ? (
                      <span className="block text-xs text-muted-foreground">
                        1 {currency} = {formatCdf(parsedRate)}
                      </span>
                    ) : (
                      rateInput && (
                        <span className="block text-xs text-red-500">
                          Valeur invalide.
                        </span>
                      )
                    )}
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyDelta(1)}
                    >
                      +1%
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyDelta(-1)}
                    >
                      -1%
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => roundRate(10)}
                    >
                      Arrondir 10
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => roundRate(50)}
                    >
                      Arrondir 50
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateRateInput(currentRate ? String(currentRate) : '')}
                    >
                      Réinitialiser
                    </Button>
                  </div>

                  {Math.abs(changePercent) >= REASON_THRESHOLD_PERCENT && (
                    <div
                      className={cn(
                        'rounded-2xl border p-3 text-xs',
                        Math.abs(changePercent) >= CONFIRM_THRESHOLD_PERCENT
                          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
                      )}
                    >
                      <p className="flex items-center gap-2 font-medium">
                        <AlertTriangle size={14} />
                        Variation de {formatPercent(changePercent)}
                      </p>
                      <p className="mt-1">
                        {Math.abs(changePercent) >= CONFIRM_THRESHOLD_PERCENT
                          ? 'Une confirmation explicite sera demandée avant enregistrement.'
                          : 'Une raison est obligatoire pour ce niveau de variation.'}
                      </p>
                    </div>
                  )}

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Raison du changement
                      {needsReason && <span className="ml-1 text-red-500">*</span>}
                    </span>

                    <textarea
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value)
                        setDirty(true)
                      }}
                      rows={3}
                      maxLength={300}
                      placeholder="Ex : alignement Banque Centrale, correction API, variation marché..."
                      className={textareaClass}
                    />

                    <span className="block text-right text-xs text-muted-foreground">
                      {reason.length}/300
                    </span>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Source
                    </span>

                    <select
                      value={source}
                      onChange={(e) => {
                        setSource(e.target.value)
                        setDirty(true)
                      }}
                      className={selectClass}
                    >
                      {SOURCES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Appliquer à partir de (optionnel)
                    </span>

                    <input
                      type="datetime-local"
                      value={appliesAt}
                      onChange={(e) => {
                        setAppliesAt(e.target.value)
                        setDirty(true)
                      }}
                      className={inputClass}
                    />

                    <span className="block text-xs text-muted-foreground">
                      Laisse vide pour une application immédiate.
                    </span>
                  </label>

                  <div className="rounded-2xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      <Info size={14} className="text-gold-500" />
                      Rappel architecture
                    </p>
                    <p className="mt-1">
                      USD est la devise principale du catalogue.
                      Le CDF est calculé automatiquement via ce taux.
                      Les commandes déjà créées gardent leur snapshot et ne bougent pas.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Calculateur */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Gauge size={18} className="text-gold-500" />
                    Calculateur
                  </CardTitle>
                  <CardDescription>
                    Test rapide de conversion avec le taux courant.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="inline-flex w-full rounded-full border border-border bg-background/60 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setCalcDirection('usd_cdf')}
                      className={cn(
                        'flex-1 rounded-full px-3 py-2 font-medium transition',
                        calcDirection === 'usd_cdf'
                          ? 'bg-gold-500 text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {currency} → CDF
                    </button>

                    <button
                      type="button"
                      onClick={() => setCalcDirection('cdf_usd')}
                      className={cn(
                        'flex-1 rounded-full px-3 py-2 font-medium transition',
                        calcDirection === 'cdf_usd'
                          ? 'bg-gold-500 text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      CDF → {currency}
                    </button>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Montant
                    </span>

                    <input
                      value={calcAmount}
                      onChange={(e) => setCalcAmount(e.target.value)}
                      inputMode="decimal"
                      className={inputClass}
                      placeholder="100"
                    />
                  </label>

                  {converted ? (
                    <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
                      <p className="text-sm font-semibold text-foreground">
                        {converted.from}
                      </p>

                      <p className="mt-2 text-xl font-extrabold text-gold-600">
                        {converted.to}
                      </p>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-3"
                        onClick={() =>
                          handleCopy(converted.to, 'calc')
                        }
                        leftIcon={
                          copied === 'calc' ? (
                            <CheckCircle2 size={14} className="text-green-500" />
                          ) : (
                            <Copy size={14} />
                          )
                        }
                      >
                        Copier résultat
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Saisis un montant valide et assure-toi que le taux courant
                      est disponible.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Aide architecture */}
              <Card variant="glass" className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-muted p-2 text-gold-500">
                      <ShieldCheck size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Architecture prix
                      </p>

                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <li>• <strong>USD</strong> = source de vérité (produits.prix_usd)</li>
                        <li>• <strong>CDF</strong> = calculé via ce taux (produits.prix)</li>
                        <li>• Panier / commande = conversions live</li>
                        <li>• Commandes créées = snapshot figé</li>
                        <li>• Variations &gt; {CONFIRM_THRESHOLD_PERCENT}% = confirmation</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Barre d'action sticky */}
        <div className="sticky bottom-0 z-30 mt-8 rounded-2xl border border-border bg-background/95 p-3 shadow-strong backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={saveDraftNow}
                disabled={!dirty}
                leftIcon={<Save size={14} />}
              >
                Brouillon
              </Button>

              {draftRestored && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:bg-red-500/10"
                  onClick={discardDraft}
                  leftIcon={<Trash2 size={14} />}
                >
                  Effacer brouillon
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadedRef.current = null
                  applyCurrentToForm(currentRate)
                  safeLocalStorageRemove(draftKey(currency))
                  setDraftRestored(false)
                  toast?.addToast?.({
                    type: 'info',
                    message: 'Formulaire réinitialisé.',
                  })
                }}
                disabled={!dirty && !draftRestored}
                leftIcon={<RefreshCw size={14} />}
              >
                Réinitialiser
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {dirty
                  ? 'Modifications non enregistrées'
                  : draftRestored
                    ? 'Brouillon chargé'
                    : 'À jour'}
              </span>

              <Button
                variant="luxe"
                size="sm"
                onClick={attemptSave}
                disabled={saveMutation.isPending || !dirty}
                loading={saveMutation.isPending}
                leftIcon={<Save size={16} />}
              >
                Enregistrer le taux
              </Button>
            </div>
          </div>
        </div>
      </Container>

      {/* Modal confirmation */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirmer la variation du taux"
        description="Cette modification dépasse le seuil de sécurité."
        size="sm"
        accent="gold"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={saveMutation.isPending}
            >
              Annuler
            </Button>

            <Button
              variant="luxe"
              onClick={() => {
                setConfirmed(true)
                setShowConfirmModal(false)

                const payload = buildPayload()
                if (payload) saveMutation.mutate(payload)
              }}
              disabled={saveMutation.isPending}
              leftIcon={
                saveMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )
              }
            >
              Confirmer et enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle size={16} />
              Variation importante détectée
            </p>

            <p className="mt-2">
              Tu es sur le point de passer de{' '}
              <strong>{currentRate ? formatCdf(currentRate) : '—'}</strong> à{' '}
              <strong>{parsedRate ? formatCdf(parsedRate) : '—'}</strong>, soit
              une variation de{' '}
              <strong>{formatPercent(changePercent)}</strong>.
            </p>
          </div>

          {currentCurrencyMeta.isPrimary && (
            <div className="rounded-2xl border border-gold-400/25 bg-gold-500/5 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Zap size={14} className="text-gold-600" />
                Impact propagation
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ce taux USD est <strong>principal</strong>. Après enregistrement :
                catalogue, panier, commande, livraison, promos et paiement
                recalculeront leurs conversions CDF.
                Les commandes déjà créées restent figées avec leur snapshot.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-background/60 p-3 text-sm">
            <p className="text-muted-foreground">Raison</p>
            <p className="mt-1 text-foreground">
              {reason.trim() || 'Aucune raison fournie.'}
            </p>
          </div>

          {appliesAt && (
            <div className="rounded-2xl border border-border bg-background/60 p-3 text-sm">
              <p className="text-muted-foreground">Application</p>
              <p className="mt-1 text-foreground">
                {new Date(appliesAt).getTime() > Date.now()
                  ? `Programmé le ${formatDate(appliesAt)}`
                  : `Immédiat / passé : ${formatDate(appliesAt)}`}
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}