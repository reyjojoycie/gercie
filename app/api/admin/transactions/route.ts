// app/api/admin/transactions/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const ALLOWED_TYPES = ['paiement', 'remboursement', 'ajustement'] as const
type TransactionType = (typeof ALLOWED_TYPES)[number]

const ALLOWED_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'failed',
  'refunded',
] as const
type TransactionStatus = (typeof ALLOWED_STATUSES)[number]

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

const PERIOD_DAYS: Record<string, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
  all: null,
}

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const querySchema = z.object({
  search: z.string().max(200).optional(),

  type: z
    .enum([...ALLOWED_TYPES, 'all'] as const)
    .optional()
    .default('all'),

  status: z
    .enum([...ALLOWED_STATUSES, 'all'] as const)
    .optional()
    .default('all'),

  method: z.string().max(100).optional(),

  period: z
    .enum(['7d', '30d', '90d', '365d', 'all'] as const)
    .optional()
    .default('30d'),

  page: z.coerce.number().int().positive().optional().default(1),

  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_LIMIT)
    .optional()
    .default(DEFAULT_LIMIT),

  sort_by: z
    .enum(['created_at', 'montant', 'status', 'type'] as const)
    .optional()
    .default('created_at'),

  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function nowIso(): string {
  return new Date().toISOString()
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function sanitizeSearch(value: string): string {
  return String(value || '')
    .replace(/[(),%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function normalizeType(value: unknown): TransactionType | null {
  const raw = String(value || '').toLowerCase().trim()

  if (raw === 'paiement' || raw === 'payment' || raw === 'achat' || raw === 'purchase') {
    return 'paiement'
  }

  if (raw === 'remboursement' || raw === 'refund' || raw === 'refunded') {
    return 'remboursement'
  }

  if (raw === 'ajustement' || raw === 'adjustment' || raw === 'admin_adjust') {
    return 'ajustement'
  }

  return null
}

function normalizeStatus(value: unknown): TransactionStatus {
  const raw = String(value || '').toLowerCase().trim()

  if (raw === 'pending' || raw === 'en_attente' || raw === 'wait') {
    return 'pending'
  }

  if (
    raw === 'approved' ||
    raw === 'paid' ||
    raw === 'success' ||
    raw === 'succeed' ||
    raw === 'validé' ||
    raw === 'valide'
  ) {
    return 'approved'
  }

  if (raw === 'rejected' || raw === 'declined' || raw === 'refusé' || raw === 'refuse') {
    return 'rejected'
  }

  if (raw === 'failed' || raw === 'error' || raw === 'échoué' || raw === 'echoue') {
    return 'failed'
  }

  if (raw === 'refunded' || raw === 'remboursé' || raw === 'rembourse') {
    return 'refunded'
  }

  return 'pending'
}

function normalizeDevise(value: unknown): string {
  const raw = String(value || 'CDF').toUpperCase().trim()

  if (raw === 'FC' || raw === 'CDF' || raw === 'XAF' || raw === 'FRW') {
    return 'CDF'
  }

  if (raw === '$' || raw === 'USD' || raw === 'DOLLAR') {
    return 'USD'
  }

  return raw || 'CDF'
}

function normalizeMethod(value: unknown): string | null {
  const raw = String(value || '').toLowerCase().trim()
  if (!raw) return null
  return raw.replace(/\s+/g, '_').slice(0, 100)
}

function safeJsonParse(value: unknown): Record<string, any> | null {
  if (value == null) return null

  if (typeof value === 'object') return value as Record<string, any>

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return { raw: value }
    }
  }

  return null
}

function firstRelation(value: any): any {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function normalizeTransaction(row: any): any | null {
  const type = normalizeType(row?.type)
  if (!type) return null

  const status = normalizeStatus(row?.status)
  const montant = Number(row?.montant ?? 0)
  const devise = normalizeDevise(row?.devise ?? row?.currency)

  const profile = firstRelation(row?.profiles ?? row?.user)
  const commande = firstRelation(row?.commandes ?? row?.commande)

  return {
    id: String(row?.id || ''),
    user_id: row?.user_id ? String(row.user_id) : null,
    commande_id: row?.commande_id ? String(row.commande_id) : null,
    type,
    montant: Number.isFinite(montant) ? montant : 0,
    devise,
    description: row?.description ? String(row.description) : null,
    method: normalizeMethod(row?.method ?? row?.payment_method),
    phone: row?.phone ? String(row.phone) : null,
    status,
    reference: row?.reference ? String(row.reference) : null,
    external_id: row?.external_id ? String(row.external_id) : null,
    metadata: safeJsonParse(row?.metadata),
    created_at: row?.created_at || nowIso(),
    updated_at: row?.updated_at || null,
    user: profile
      ? {
          id: profile.id ? String(profile.id) : null,
          email: profile.email || null,
          nom: profile.nom || null,
          prenom: profile.prenom || null,
          telephone: profile.telephone || null,
        }
      : null,
    commande: commande
      ? {
          id: commande.id ? String(commande.id) : null,
          numero_commande: commande.numero_commande || null,
          statut: commande.statut || null,
        }
      : null,
  }
}

function isRelationshipError(error: any): boolean {
  const message = String(
    error?.message || error?.details || error?.hint || ''
  ).toLowerCase()

  return (
    message.includes('relationship') ||
    message.includes('profile') ||
    message.includes('commande') ||
    message.includes('could not find') ||
    message.includes('foreign table') ||
    message.includes('embedding') ||
    message.includes('resource')
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FILTERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function applyTypeFilter(query: any, type: 'all' | TransactionType) {
  if (type === 'all') {
    return query.in('type', ALLOWED_TYPES as readonly string[])
  }

  return query.eq('type', type)
}

function applyStatusFilter(query: any, status: 'all' | TransactionStatus) {
  if (status === 'all') return query
  return query.eq('status', status)
}

function applyMethodFilter(query: any, method: string | null) {
  if (!method) return query
  return query.eq('method', method)
}

function applyPeriodFilter(query: any, period: string) {
  const days = PERIOD_DAYS[period]

  if (!days) return query

  return query.gte('created_at', daysAgoIso(days))
}

function applySearchFilter(
  query: any,
  search: string | null,
  includeRelations: boolean
) {
  if (!search) return query

  const clean = sanitizeSearch(search)
  if (!clean) return query

  const term = `%${clean}%`

  const parts = [
    `description.ilike.${term}`,
    `reference.ilike.${term}`,
    `external_id.ilike.${term}`,
    `method.ilike.${term}`,
    `phone.ilike.${term}`,
  ]

  if (includeRelations) {
    parts.push(
      `profiles.email.ilike.${term}`,
      `profiles.nom.ilike.${term}`,
      `profiles.prenom.ilike.${term}`
    )
  }

  return query.or(parts.join(','))
}

function applySort(query: any, sortBy: string, sortOrder: string) {
  const ascending = sortOrder === 'asc'

  if (sortBy === 'montant') {
    return query.order('montant', { ascending })
  }

  if (sortBy === 'status') {
    return query.order('status', { ascending })
  }

  if (sortBy === 'type') {
    return query.order('type', { ascending })
  }

  return query.order('created_at', { ascending })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATS                                                          */
/* ═══════════════════════════════════════════════════════════════ */

async function countTransactions(
  supabase: any,
  options: {
    type: 'all' | TransactionType
    status?: TransactionStatus
    method: string | null
    period: string
  }
): Promise<number> {
  try {
    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })

    query = applyTypeFilter(query, options.type)
    query = applyMethodFilter(query, options.method)
    query = applyPeriodFilter(query, options.period)

    if (options.status) {
      query = query.eq('status', options.status)
    }

    const { count, error } = await query

    if (error) {
      log.warn?.('countTransactions error', error)
      return 0
    }

    return Number(count || 0)
  } catch (err) {
    log.warn?.('countTransactions exception', err)
    return 0
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-transactions-get:${ip}`,
    maxRequests: 60,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse({
      search: searchParams.get('search') || undefined,
      type: searchParams.get('type') || undefined,
      status: searchParams.get('status') || undefined,
      method: searchParams.get('method') || undefined,
      period: searchParams.get('period') || undefined,
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
      sort_by: searchParams.get('sort_by') || undefined,
      sort_order: searchParams.get('sort_order') || undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            'Paramètres de requête invalides.',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const input = parsed.data

    const search = input.search ? sanitizeSearch(input.search) : null
    const method = input.method
      ? String(input.method).toLowerCase().trim()
      : null

    const page = Math.max(1, Number(input.page || 1))
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(input.limit || DEFAULT_LIMIT)))
    const offset = (page - 1) * limit

    const supabase = await createClient(true)

    const selectRich =
      '*, profiles(email, nom, prenom, telephone), commandes(id, numero_commande, statut)'

    let useRelations = true

    let query = supabase
      .from('transactions')
      .select(selectRich, { count: 'exact' })

    query = applyTypeFilter(query, input.type)
    query = applyStatusFilter(query, input.status)
    query = applyMethodFilter(query, method)
    query = applyPeriodFilter(query, input.period)
    query = applySearchFilter(query, search, true)
    query = applySort(query, input.sort_by, input.sort_order)
    query = query.range(offset, offset + limit - 1)

    let result = await query

    if (result.error && isRelationshipError(result.error)) {
      useRelations = false

      let fallbackQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact' })

      fallbackQuery = applyTypeFilter(fallbackQuery, input.type)
      fallbackQuery = applyStatusFilter(fallbackQuery, input.status)
      fallbackQuery = applyMethodFilter(fallbackQuery, method)
      fallbackQuery = applyPeriodFilter(fallbackQuery, input.period)
      fallbackQuery = applySearchFilter(fallbackQuery, search, false)
      fallbackQuery = applySort(fallbackQuery, input.sort_by, input.sort_order)
      fallbackQuery = fallbackQuery.range(offset, offset + limit - 1)

      result = await fallbackQuery
    }

    if (result.error) {
      throw result.error
    }

    const rows = Array.isArray(result.data) ? result.data : []

    const data = rows
      .map(normalizeTransaction)
      .filter(Boolean)

    const total = Number(result.count || data.length || 0)
    const totalPages = Math.max(1, Math.ceil(total / limit))

    const [
      statsTotal,
      statsPending,
      statsApproved,
      statsRejected,
      statsFailed,
      statsRefunded,
    ] = await Promise.all([
      countTransactions(supabase, {
        type: input.type,
        method,
        period: input.period,
      }),
      countTransactions(supabase, {
        type: input.type,
        status: 'pending',
        method,
        period: input.period,
      }),
      countTransactions(supabase, {
        type: input.type,
        status: 'approved',
        method,
        period: input.period,
      }),
      countTransactions(supabase, {
        type: input.type,
        status: 'rejected',
        method,
        period: input.period,
      }),
      countTransactions(supabase, {
        type: input.type,
        status: 'failed',
        method,
        period: input.period,
      }),
      countTransactions(supabase, {
        type: input.type,
        status: 'refunded',
        method,
        period: input.period,
      }),
    ])

    return NextResponse.json(
      {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        stats: {
          total: statsTotal,
          pending: statsPending,
          approved: statsApproved,
          rejected: statsRejected,
          failed: statsFailed,
          refunded: statsRefunded,
        },
        filters: {
          search,
          type: input.type,
          status: input.status,
          method,
          period: input.period,
          sort_by: input.sort_by,
          sort_order: input.sort_order,
        },
        relations: useRelations,
        generated_at: nowIso(),
      },
      { status: 200 }
    )
  } catch (err: any) {
    log.error?.('GET /api/admin/transactions error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Impossible de charger les transactions.',
      },
      { status: 500 }
    )
  }
}