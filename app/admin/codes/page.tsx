// app/admin/codes/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/components/ui/Toast'

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

import { motion, AnimatePresence } from 'framer-motion'

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

interface CodePromo {
  id: string
  code: string
  type?: PromoType | null
  value?: number | null
  reduction_percent?: number | null
  min_total_usd?: number | null
  max_discount_usd?: number | null
  min_total?: number | null
  max_discount?: number | null
  max_utilisations: number
  utilisations_actuelles: number
  actif: boolean
  created_at: string
  updated_at?: string | null
  expires_at: string | null
  description?: string | null
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
  data: CodePromo[]
  pagination: CodesPagination
  stats?: CodesStats
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
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeType(promo: Partial<CodePromo>): PromoType {
  return promo.type === 'fixed' ? 'fixed' : 'percent'
}

function getValue(promo: Partial<CodePromo>): number {
  const raw = promo.value ?? promo.reduction_percent ?? 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function getMinTotalUsd(promo: Partial<CodePromo>): number {
  const raw = promo.min_total_usd ?? 0
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function getMaxDiscountUsd(promo: Partial<CodePromo>): number {
  const raw = promo.max_discount_usd ?? 0
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function formatUsd(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `$${n.toFixed(2)}`
}

function formatPromoValue(promo: Partial<CodePromo>): string {
  const type = normalizeType(promo)
  const value = getValue(promo)

  if (type === 'percent') {
    return `${value}%`
  }

  return formatUsd(value)
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

function getPromoStatus(promo: CodePromo): 'actif' | 'inactif' | 'epuise' | 'expire' {
  if (!promo.actif) return 'inactif'
  if (isExpired(promo)) return 'expire'
  if (isExhausted(promo)) return 'epuise'
  return 'actif'
}

function getStatusLabel(status: ReturnType<typeof getPromoStatus>): string {
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toISOString().slice(0, 10)
}

function isExpiringSoon(promo: CodePromo): boolean {
  if (!promo.expires_at) return false

  const expiry = new Date(promo.expires_at)
  const now = new Date()
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  return expiry >= now && expiry <= inSevenDays
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
  return {
    type: values.type,
    value: Number(values.value || 0),
    max_utilisations: Number(values.maxUtilisations || 1),
    expires_at: values.expiresAt
      ? new Date(values.expiresAt).toISOString()
      : null,
    min_total_usd: Number(values.minTotalUsd || 0) > 0
      ? Number(values.minTotalUsd)
      : null,
    max_discount_usd: Number(values.maxDiscountUsd || 0) > 0
      ? Number(values.maxDiscountUsd)
      : null,
    description: values.description?.trim() || null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION ZOD                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function validatePromoBase(
  data: any,
  ctx: z.RefinementCtx
) {
  if (data.type === 'percent') {
    if (data.value < 1 || data.value > 99) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'La réduction en pourcentage doit être entre 1 et 99.',
      })
    }
  }

  if (data.type === 'fixed') {
    if (data.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Le montant fixe doit être supérieur à 0.',
      })
    }
  }

  if (data.expiresAt) {
    const date = new Date(data.expiresAt)

    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Date d’expiration invalide.',
      })
    } else {
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      if (endOfDay < new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expiresAt'],
          message: 'La date d’expiration ne peut pas être dans le passé.',
        })
      }
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
  maxUtilisations: z.coerce.number().int().min(1).max(10000).default(1),
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
      .regex(/^[A-Z0-9_-]+$/i, 'Lettres, chiffres, tirets et underscores uniquement.')
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
        <Percent size={14} />
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
        <DollarSign size={14} />
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

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function CodesPromoPage() {
  const toast = useToast() as any
  const queryClient = useQueryClient()

  /* ---------------------------------------------------------- */
  /* Filtres / tri / pagination                                  */
  /* ---------------------------------------------------------- */

  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<StatutFiltre>('all')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  /* ---------------------------------------------------------- */
  /* UI state                                                    */
  /* ---------------------------------------------------------- */

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CodePromo | null>(null)

  const [generateOpen, setGenerateOpen] = useState(false)

  const [manualOpen, setManualOpen] = useState(false)
  const [manualMode, setManualMode] = useState<'create' | 'edit'>('create')
  const [editingPromo, setEditingPromo] = useState<CodePromo | null>(null)

  /* ---------------------------------------------------------- */
  /* Formulaires                                                 */
  /* ---------------------------------------------------------- */

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

  /* ---------------------------------------------------------- */
  /* Requête liste                                               */
  /* ---------------------------------------------------------- */

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<CodesResponse>({
    queryKey: [
      'admin-codes-promo',
      search,
      filterStatut,
      page,
      sortBy,
      sortOrder,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()

      if (search.trim()) {
        params.set('search', search.trim())
      }

      if (filterStatut !== 'all') {
        params.set('statut', filterStatut)
      }

      params.set('page', String(page))
      params.set('limit', String(PER_PAGE))
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)

      const res = await fetch(`/api/admin/codes?${params.toString()}`, {
        credentials: 'include',
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Erreur lors du chargement des codes promo.')
      }

      return res.json()
    },
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  })

  const codes = useMemo(() => data?.data ?? [], [data?.data])
  const pagination = data?.pagination ?? {
    page: 1,
    totalPages: 1,
    total: 0,
  }

  /* ---------------------------------------------------------- */
  /* Stats                                                       */
  /* ---------------------------------------------------------- */

  const stats = useMemo(() => {
    const apiStats = data?.stats

    if (apiStats) {
      return {
        total: Number(apiStats.total ?? pagination.total ?? 0),
        active: Number(apiStats.active ?? 0),
        used: Number(apiStats.used ?? 0),
        expiringSoon: Number(apiStats.expiring_soon ?? 0),
      }
    }

    const activeOnPage = codes.filter(
      (promo) => getPromoStatus(promo) === 'actif'
    ).length

    const usedOnPage = codes.reduce(
      (acc, promo) => acc + Number(promo.utilisations_actuelles ?? 0),
      0
    )

    const expiringSoonOnPage = codes.filter(isExpiringSoon).length

    return {
      total: Number(pagination.total ?? 0),
      active: activeOnPage,
      used: usedOnPage,
      expiringSoon: expiringSoonOnPage,
    }
  }, [codes, data?.stats, pagination.total])

  /* ---------------------------------------------------------- */
  /* Mutation génération en masse                                */
  /* ---------------------------------------------------------- */

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
        throw new Error(err?.error || 'Erreur lors de la génération des codes.')
      }

      return res.json()
    },
    onSuccess: (response, variables) => {
      const count = Number(response?.count ?? variables.count ?? 0)

      toast?.addToast?.({
        type: 'success',
        message: `${count} code(s) promo généré(s).`,
      })

      queryClient.invalidateQueries({ queryKey: ['admin-codes-promo'] })
      setGenerateOpen(false)
      generateForm.reset()
    },
    onError: (err: any) => {
      toast?.addToast?.({
        type: 'error',
        message: err?.message || 'Impossible de générer les codes promo.',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Mutation création / édition manuelle                        */
  /* ---------------------------------------------------------- */

  const saveManualMutation = useMutation({
    mutationFn: async (values: ManualForm) => {
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
          throw new Error(err?.error || 'Erreur lors de la création du code.')
        }

        return res.json()
      }

      if (!editingPromo) {
        throw new Error('Aucun code promo sélectionné pour l’édition.')
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
        throw new Error(err?.error || 'Erreur lors de la mise à jour du code.')
      }

      return res.json()
    },
    onSuccess: () => {
      toast?.addToast?.({
        type: 'success',
        message:
          manualMode === 'create'
            ? 'Code promo créé.'
            : 'Code promo mis à jour.',
      })

      queryClient.invalidateQueries({ queryKey: ['admin-codes-promo'] })
      setManualOpen(false)
      setEditingPromo(null)
      manualForm.reset()
    },
    onError: (err: any) => {
      toast?.addToast?.({
        type: 'error',
        message: err?.message || 'Impossible d’enregistrer le code promo.',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Mutation bascule actif / inactif                            */
  /* ---------------------------------------------------------- */

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
        throw new Error(err?.error || 'Erreur lors du changement de statut.')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-codes-promo'] })
      toast?.addToast?.({
        type: 'success',
        message: 'Statut mis à jour.',
      })
    },
    onError: (err: any) => {
      toast?.addToast?.({
        type: 'error',
        message: err?.message || 'Impossible de mettre à jour le statut.',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Mutation suppression                                        */
  /* ---------------------------------------------------------- */

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/codes?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Erreur lors de la suppression.')
      }

      return res.json()
    },
    onSuccess: () => {
      toast?.addToast?.({
        type: 'success',
        message: 'Code promo supprimé.',
      })

      queryClient.invalidateQueries({ queryKey: ['admin-codes-promo'] })
      setDeleteTarget(null)
    },
    onError: (err: any) => {
      toast?.addToast?.({
        type: 'error',
        message: err?.message || 'Impossible de supprimer ce code promo.',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleCopy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
      toast?.addToast?.({
        type: 'success',
        message: 'Code copié.',
      })
    } catch {
      toast?.addToast?.({
        type: 'error',
        message: 'Impossible de copier le code.',
      })
    }
  }

  const handleSortToggle = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }

    setPage(1)
  }

  const clearFilters = () => {
    setSearch('')
    setFilterStatut('all')
    setPage(1)
    setSortBy('created_at')
    setSortOrder('desc')
  }

  const openGenerateModal = () => {
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
  }

  const openCreateModal = () => {
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
  }

  const openEditModal = (promo: CodePromo) => {
    setManualMode('edit')
    setEditingPromo(promo)

    manualForm.reset({
      code: promo.code,
      type: normalizeType(promo),
      value: getValue(promo),
      maxUtilisations: Number(promo.max_utilisations ?? 1),
      expiresAt: toDateInputValue(promo.expires_at),
      minTotalUsd: getMinTotalUsd(promo),
      maxDiscountUsd: getMaxDiscountUsd(promo),
      description: promo.description ?? '',
      actif: Boolean(promo.actif),
    })

    setManualOpen(true)
  }

  const hasActiveFilters =
    Boolean(search.trim()) ||
    filterStatut !== 'all' ||
    sortBy !== 'created_at' ||
    sortOrder !== 'desc'

  /* ---------------------------------------------------------- */
  /* Rendu                                                       */
  /* ---------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-background pb-16">
      <Container className="py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* En-tête */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-3 font-serif text-3xl font-extrabold text-foreground">
                <div className="rounded-xl bg-gold-100 p-2 text-gold-600 dark:bg-gold-900/30 dark:text-gold-400">
                  <Percent size={24} />
                </div>
                Codes promo
              </h1>

              <p className="mt-2 text-sm text-muted-foreground">
                Générez, créez, éditez et supervisez vos codes de réduction.
                Les montants fixes et seuils sont exprimés en USD.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                loading={isFetching}
                leftIcon={<RefreshCw size={14} />}
              >
                Rafraîchir
              </Button>

              <Button
                variant="outline-gold"
                size="md"
                onClick={openCreateModal}
                leftIcon={<Key size={16} />}
              >
                Créer un code
              </Button>

              <Button
                variant="luxe"
                size="md"
                onClick={openGenerateModal}
                leftIcon={<Sparkles size={16} />}
              >
                Générer en masse
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total codes"
              value={stats.total}
              icon={<Hash size={18} />}
              tone="gold"
            />

            <StatCard
              label="Actifs"
              value={stats.active}
              icon={<Power size={18} />}
              tone="emerald"
            />

            <StatCard
              label="Utilisations"
              value={stats.used}
              icon={<RefreshCw size={18} />}
            />

            <StatCard
              label="Expiration proche"
              value={stats.expiringSoon}
              icon={<AlertTriangle size={18} />}
              tone="danger"
            />
          </div>

          {/* Filtres */}
          <Card className="border-gold-400/20 bg-card/70">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="relative flex-1 max-w-sm">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />

                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setPage(1)
                    }}
                    placeholder="Rechercher un code..."
                    className={cn(inputClass, 'pl-9')}
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
                      <X size={16} />
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
                        'rounded-full border px-4 py-2 text-sm font-medium transition whitespace-nowrap',
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
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                      setPage(1)
                    }}
                    className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition hover:border-gold-400/40 hover:text-gold-500"
                    title={sortOrder === 'asc' ? 'Ordre croissant' : 'Ordre décroissant'}
                    aria-label="Inverser le tri"
                  >
                    <ArrowUpDown size={16} />
                  </button>

                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="text-red-500"
                      leftIcon={<X size={14} />}
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
              <Spinner size="xl" />
            </div>
          ) : isError ? (
            <Card className="border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
              <CardContent className="p-6 text-center">
                <AlertTriangle
                  size={32}
                  className="mx-auto mb-3 text-red-500"
                />

                <p className="font-medium text-red-700 dark:text-red-300">
                  {(error as Error)?.message || 'Erreur de chargement des codes promo.'}
                </p>

                <Button
                  variant="outline-gold"
                  size="sm"
                  className="mt-4"
                  onClick={() => refetch()}
                  leftIcon={<RefreshCw size={14} />}
                >
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card variant="glass" className="overflow-hidden border-gold-400/20">
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
                            <ArrowUpDown size={12} />
                          </button>
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => handleSortToggle('value')}
                            className="flex items-center gap-1 transition hover:text-gold-500"
                          >
                            Réduction
                            <ArrowUpDown size={12} />
                          </button>
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => handleSortToggle('utilisations_actuelles')}
                            className="flex items-center gap-1 transition hover:text-gold-500"
                          >
                            Utilisations
                            <ArrowUpDown size={12} />
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
                            onClick={() => handleSortToggle('expires_at')}
                            className="flex items-center gap-1 transition hover:text-gold-500"
                          >
                            Expiration
                            <ArrowUpDown size={12} />
                          </button>
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Statut
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => handleSortToggle('created_at')}
                            className="flex items-center gap-1 transition hover:text-gold-500"
                          >
                            Créé le
                            <ArrowUpDown size={12} />
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
                            const type = normalizeType(promo)
                            const canDelete = Number(promo.utilisations_actuelles ?? 0) === 0

                            return (
                              <motion.tr
                                key={promo.id}
                                layout
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="hover:bg-gold-400/5 transition-colors"
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

                                    <span className="text-sm font-semibold text-foreground">
                                      {formatPromoValue(promo)}
                                    </span>
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
                                      {promo.max_utilisations}
                                    </span>
                                  </div>
                                </td>

                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                  {formatUsd(getMinTotalUsd(promo))}
                                </td>

                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                  {formatUsd(getMaxDiscountUsd(promo))}
                                </td>

                                <td className="px-4 py-3 text-sm">
                                  {promo.expires_at ? (
                                    <div className="flex flex-col gap-1">
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <Calendar size={12} />
                                        {formatDate(promo.expires_at)}
                                      </span>

                                      {isExpiringSoon(promo) && (
                                        <Badge variant="danger" size="sm" className="w-fit">
                                          Bientôt
                                        </Badge>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">Illimitée</span>
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
                                    <Clock size={12} />
                                    {formatDate(promo.created_at)}
                                  </div>
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(promo.code, promo.id)}
                                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500"
                                      title="Copier le code"
                                      aria-label={`Copier le code ${promo.code}`}
                                    >
                                      {copiedId === promo.id ? (
                                        <Check size={16} className="text-emerald-500" />
                                      ) : (
                                        <Copy size={16} />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => openEditModal(promo)}
                                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500"
                                      title="Éditer"
                                      aria-label={`Éditer le code ${promo.code}`}
                                    >
                                      <Edit3 size={16} />
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
                                      title={promo.actif ? 'Désactiver' : 'Activer'}
                                      aria-label={
                                        promo.actif
                                          ? `Désactiver le code ${promo.code}`
                                          : `Activer le code ${promo.code}`
                                      }
                                    >
                                      {promo.actif ? (
                                        <PowerOff size={16} />
                                      ) : (
                                        <Power size={16} />
                                      )}
                                    </button>

                                    {canDelete ? (
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget(promo)}
                                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                                        title="Supprimer"
                                        aria-label={`Supprimer le code ${promo.code}`}
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled
                                        className="cursor-not-allowed rounded-lg p-2 text-muted-foreground/40"
                                        title="Impossible de supprimer un code déjà utilisé. Désactivez-le plutôt."
                                        aria-label="Suppression impossible"
                                      >
                                        <Trash2 size={16} />
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
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
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
                    disabled={page === pagination.totalPages || isFetching}
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
              leftIcon={<Hash size={16} className="text-muted-foreground" />}
            />

            <Input
              label="Préfixe optionnel"
              type="text"
              maxLength={12}
              variant="glass"
              placeholder="Ex : VIP, SUMMER"
              {...generateForm.register('prefix')}
              error={generateForm.formState.errors.prefix?.message}
              leftIcon={<Key size={16} className="text-muted-foreground" />}
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
                <Percent size={16} className="text-muted-foreground" />
              ) : (
                <DollarSign size={16} className="text-muted-foreground" />
              )
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Utilisations max par code"
              type="number"
              min={1}
              max={10000}
              variant="glass"
              {...generateForm.register('maxUtilisations')}
              error={generateForm.formState.errors.maxUtilisations?.message}
              leftIcon={<RefreshCw size={16} className="text-muted-foreground" />}
            />

            <Input
              label="Expiration (optionnelle)"
              type="date"
              variant="glass"
              {...generateForm.register('expiresAt')}
              error={generateForm.formState.errors.expiresAt?.message}
              leftIcon={<Calendar size={16} className="text-muted-foreground" />}
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
              error={generateForm.formState.errors.minTotalUsd?.message}
              leftIcon={<Info size={16} className="text-muted-foreground" />}
            />

            <Input
              label="Plafond réduction (USD)"
              type="number"
              step="0.01"
              min={0}
              variant="glass"
              placeholder="0 = aucun plafond"
              {...generateForm.register('maxDiscountUsd')}
              error={generateForm.formState.errors.maxDiscountUsd?.message}
              leftIcon={<DollarSign size={16} className="text-muted-foreground" />}
            />
          </div>

          <Input
            label="Description interne"
            type="text"
            maxLength={255}
            variant="glass"
            placeholder="Ex : Campagne novembre 2026"
            {...generateForm.register('description')}
            error={generateForm.formState.errors.description?.message}
          />

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button
              type="submit"
              variant="luxe"
              fullWidth
              loading={generateMutation.isPending}
              leftIcon={<Sparkles size={16} />}
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
            leftIcon={<Key size={16} className="text-muted-foreground" />}
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
                <Percent size={16} className="text-muted-foreground" />
              ) : (
                <DollarSign size={16} className="text-muted-foreground" />
              )
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Utilisations max"
              type="number"
              min={1}
              max={10000}
              variant="glass"
              {...manualForm.register('maxUtilisations')}
              error={manualForm.formState.errors.maxUtilisations?.message}
              leftIcon={<RefreshCw size={16} className="text-muted-foreground" />}
            />

            <Input
              label="Expiration (optionnelle)"
              type="date"
              variant="glass"
              {...manualForm.register('expiresAt')}
              error={manualForm.formState.errors.expiresAt?.message}
              leftIcon={<Calendar size={16} className="text-muted-foreground" />}
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
              error={manualForm.formState.errors.minTotalUsd?.message}
              leftIcon={<Info size={16} className="text-muted-foreground" />}
            />

            <Input
              label="Plafond réduction (USD)"
              type="number"
              step="0.01"
              min={0}
              variant="glass"
              placeholder="0 = aucun plafond"
              {...manualForm.register('maxDiscountUsd')}
              error={manualForm.formState.errors.maxDiscountUsd?.message}
              leftIcon={<DollarSign size={16} className="text-muted-foreground" />}
            />
          </div>

          <Input
            label="Description interne"
            type="text"
            maxLength={255}
            variant="glass"
            placeholder="Ex : Code VIP client fidèle"
            {...manualForm.register('description')}
            error={manualForm.formState.errors.description?.message}
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
              leftIcon={
                manualMode === 'create' ? (
                  <Plus size={16} />
                ) : (
                  <Check size={16} />
                )
              }
            >
              {manualMode === 'create' ? 'Créer le code' : 'Enregistrer'}
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
              Ce code n’a jamais été utilisé. Il peut être supprimé définitivement.
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
              leftIcon={<Trash2 size={16} />}
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