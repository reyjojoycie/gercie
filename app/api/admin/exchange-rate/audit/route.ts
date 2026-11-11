// app/api/admin/exchange-rate/audit/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const ALLOWED_CURRENCIES = ['USD', 'EUR', 'GBP', 'ALL'] as const
type CurrencyFilter = (typeof ALLOWED_CURRENCIES)[number]

const MIN_RATE = 1
const MAX_RATE = 100_000

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface AuditEntry {
  id: string
  created_at: string
  currency: string
  user_email: string
  old_rate: number | null
  new_rate: number
  reason: string
  source: string | null
  action: string
  metadata: any
}

interface AuditFilters {
  currency: string | null
  action: string | null
  search: string | null
  since: string | null
  until: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRAUX                                               */
/* ═══════════════════════════════════════════════════════════════ */

function isThenable(value: any): value is Promise<any> {
  return value != null && typeof value.then === 'function'
}

async function getSupabase(): Promise<any | null> {
  try {
    const raw = (createClient as any)(true)
    return isThenable(raw) ? await raw : raw
  } catch (err: any) {
    log.error?.('admin exchange-rate audit: impossible de créer le client Supabase', err)
    return null
  }
}

function normalizeCurrencyFilter(value: unknown): CurrencyFilter {
  const upper = String(value || 'ALL').toUpperCase().trim()

  if ((ALLOWED_CURRENCIES as readonly string[]).includes(upper)) {
    return upper as CurrencyFilter
  }

  // Si l’on demande CDF, on revient à la référence USD -> CDF
  if (upper === 'CDF') return 'USD'

  return 'ALL'
}

function extractRateValue(input: any): number | null {
  if (input == null) return null

  if (typeof input === 'number' || typeof input === 'string') {
    const n = Number(String(input).replace(',', '.'))
    if (!Number.isFinite(n)) return null
    if (n < MIN_RATE || n > MAX_RATE) return null
    return n
  }

  if (typeof input === 'object') {
    const candidate =
      input.rate ??
      input.value ??
      input.taux ??
      input.montant ??
      input.amount ??
      input.exchange_rate ??
      input.new_rate

    return extractRateValue(candidate)
  }

  return null
}

function parseLimit(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)))
}

function parseIsoDate(value: unknown): string | null {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

function nowIso(): string {
  return new Date().toISOString()
}

function isMissingTableError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(
    error?.message || error?.details || error?.hint || ''
  ).toLowerCase()

  return (
    code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('schema')
  )
}

function isMissingColumnError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || error?.details || error?.hint || '')

  return (
    code === '42703' ||
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message) ||
    /is not a column/i.test(message) ||
    /schema cache/i.test(message)
  )
}

function extractMissingColumnName(message: string): string | null {
  const patterns = [
    /column\s+"?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)"?\s+does not exist/i,
    /Could not find the\s+'([a-zA-Z_][a-zA-Z0-9_]*)'\s+column/i,
    /"([a-zA-Z_][a-zA-Z0-9_]*)"\s+is not a column/i,
    /schema cache: could not find column\s+'([a-zA-Z_][a-zA-Z0-9_]*)'/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) {
      const raw = match[1]
      const parts = raw.split('.')
      return parts[parts.length - 1] || null
    }
  }

  return null
}

function sanitizeSearchTerm(value: string): string {
  // Évite de casser la syntaxe PostgREST .or() avec des caractères spéciaux.
  return String(value || '')
    .replace(/[,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function buildSearchOr(search: string): string | null {
  const safe = sanitizeSearchTerm(search)
  if (!safe) return null

  return [
    `reason.ilike.%${safe}%`,
    `user_email.ilike.%${safe}%`,
    `source.ilike.%${safe}%`,
    `action.ilike.%${safe}%`,
    `currency.ilike.%${safe}%`,
  ].join(',')
}

function normalizeAuditEntry(row: any): AuditEntry | null {
  const newRate = extractRateValue(row?.new_rate ?? row?.rate ?? row?.value)
  if (!newRate) return null

  const oldRate =
    row?.old_rate != null
      ? extractRateValue(row.old_rate)
      : row?.previous_rate != null
        ? extractRateValue(row.previous_rate)
        : row?.ancien_taux != null
          ? extractRateValue(row.ancien_taux)
          : null

  return {
    id: String(row?.id || `${Date.now()}-${Math.random()}`),
    created_at: row?.created_at || row?.date || row?.updated_at || nowIso(),
    currency: String(row?.currency || 'USD').toUpperCase(),
    user_email:
      row?.user_email ||
      row?.admin?.email ||
      row?.user?.email ||
      row?.modifie_par ||
      'Système',
    old_rate: oldRate,
    new_rate: newRate,
    reason: String(row?.reason || row?.note || row?.commentaire || row?.raison || ''),
    source: row?.source || null,
    action: String(row?.action || 'updated'),
    metadata: row?.metadata ?? null,
  }
}

function localSearchFilter(entry: AuditEntry, search: string): boolean {
  const safe = sanitizeSearchTerm(search).toLowerCase()
  if (!safe) return true

  const haystack = [
    entry.user_email,
    entry.reason,
    entry.source || '',
    entry.action,
    entry.currency,
    entry.old_rate != null ? String(entry.old_rate) : '',
    String(entry.new_rate),
    typeof entry.metadata === 'string' ? entry.metadata : JSON.stringify(entry.metadata ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(safe)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const auditQuerySchema = z.object({
  currency: z.string().optional(),
  limit: z.union([z.number(), z.string()]).optional(),
  action: z.string().max(80).optional(),
  search: z.string().max(120).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  REQUÊTE TOLÉRANTE                                              */
/* ═══════════════════════════════════════════════════════════════ */

async function executeAuditQuery(
  supabase: any,
  initialFilters: AuditFilters,
  initialOrder: 'asc' | 'desc',
  limit: number
): Promise<{
  rows: any[]
  count: number | null
  tableMissing: boolean
  lastError: any
  activeFilters: AuditFilters
  usedServerSearch: boolean
}> {
  const filters: AuditFilters = { ...initialFilters }

  const orderCandidates = ['created_at', 'updated_at', 'id']
  let orderCandidateIndex = 0
  let orderColumn: string | null = orderCandidates[orderCandidateIndex] ?? null
  const orderAscending = initialOrder === 'asc'

  let rows: any[] = []
  let count: number | null = null
  let tableMissing = false
  let lastError: any = null
  let usedServerSearch = false

  // Si recherche texte active, on prend plus large pour compenser un éventuel filtrage local.
  const effectiveLimit = filters.search
    ? Math.min(MAX_LIMIT, Math.max(limit, limit * 3))
    : limit

  for (let attempt = 0; attempt < 18; attempt++) {
    try {
      let query: any = supabase
        .from('exchange_rate_audit')
        .select('*', { count: 'exact' })

      if (filters.currency) {
        query = query.eq('currency', filters.currency)
      }

      if (filters.action) {
        query = query.eq('action', filters.action)
      }

      if (filters.since) {
        query = query.gte('created_at', filters.since)
      }

      if (filters.until) {
        query = query.lte('created_at', filters.until)
      }

      if (filters.search) {
        const orExpression = buildSearchOr(filters.search)

        if (orExpression) {
          query = query.or(orExpression)
        } else {
          filters.search = null
        }
      }

      if (orderColumn) {
        query = query.order(orderColumn, { ascending: orderAscending })
      }

      query = query.limit(effectiveLimit)

      const result = await query

      if (result.error) {
        lastError = result.error

        if (isMissingTableError(result.error)) {
          tableMissing = true
          break
        }

        if (isMissingColumnError(result.error)) {
          const missingColumn = extractMissingColumnName(
            String(result.error.message || '')
          )

          if (!missingColumn) {
            break
          }

          // Colonne de tri absente : essayer une autre colonne.
          if (orderColumn && missingColumn === orderColumn) {
            orderCandidateIndex += 1
            orderColumn = orderCandidates[orderCandidateIndex] ?? null
            continue
          }

          // Colonne created_at absente : désactiver filtres date.
          if (missingColumn === 'created_at') {
            if (filters.since || filters.until) {
              filters.since = null
              filters.until = null
              continue
            }
          }

          // Colonne currency absente : désactiver filtre devise.
          if (missingColumn === 'currency' && filters.currency) {
            filters.currency = null
            continue
          }

          // Colonne action absente : désactiver filtre action.
          if (missingColumn === 'action' && filters.action) {
            filters.action = null
            continue
          }

          // Colonne liée à la recherche texte absente : désactiver recherche serveur.
          if (
            filters.search &&
            ['reason', 'user_email', 'source', 'action', 'currency'].includes(
              missingColumn
            )
          ) {
            filters.search = null
            continue
          }

          break
        }

        break
      }

      rows = Array.isArray(result.data) ? result.data : []
      count = typeof result.count === 'number' ? result.count : null
      usedServerSearch = Boolean(initialFilters.search && filters.search)
      break
    } catch (err: any) {
      lastError = err

      if (isMissingTableError(err)) {
        tableMissing = true
        break
      }

      if (isMissingColumnError(err)) {
        const missingColumn = extractMissingColumnName(String(err.message || ''))

        if (!missingColumn) {
          break
        }

        if (orderColumn && missingColumn === orderColumn) {
          orderCandidateIndex += 1
          orderColumn = orderCandidates[orderCandidateIndex] ?? null
          continue
        }

        if (missingColumn === 'created_at') {
          if (filters.since || filters.until) {
            filters.since = null
            filters.until = null
            continue
          }
        }

        if (missingColumn === 'currency' && filters.currency) {
          filters.currency = null
          continue
        }

        if (missingColumn === 'action' && filters.action) {
          filters.action = null
          continue
        }

        if (
          filters.search &&
          ['reason', 'user_email', 'source', 'action', 'currency'].includes(
            missingColumn
          )
        ) {
          filters.search = null
          continue
        }
      }

      break
    }
  }

  return {
    rows,
    count,
    tableMissing,
    lastError,
    activeFilters: filters,
    usedServerSearch,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Journal d'audit                                          */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-exchange-rate-audit-get:${ip}`,
    maxRequests: 60,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let adminUser: any = null

  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: Number(err?.status) || 403 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)

    const parsed = auditQuerySchema.safeParse({
      currency: searchParams.get('currency') || undefined,
      limit: searchParams.get('limit') || undefined,
      action: searchParams.get('action') || undefined,
      search: searchParams.get('search') || undefined,
      since: searchParams.get('since') || undefined,
      until: searchParams.get('until') || undefined,
      order: searchParams.get('order') || undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            'Paramètres de filtre invalides.',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const currencyFilter = normalizeCurrencyFilter(parsed.data.currency)
    const limit = parseLimit(parsed.data.limit)
    const actionFilter = String(parsed.data.action || '').trim() || null
    const search = String(parsed.data.search || '').trim() || null
    const since = parseIsoDate(parsed.data.since)
    const until = parseIsoDate(parsed.data.until)
    const order = parsed.data.order === 'asc' ? 'asc' : 'desc'

    const supabase = await getSupabase()

    if (!supabase) {
      return NextResponse.json(
        {
          error: 'Service Supabase indisponible.',
          data: [],
          audit: [],
          pagination: {
            total: 0,
            filtered_total: 0,
            returned: 0,
            limit,
          },
        },
        { status: 503 }
      )
    }

    const initialFilters: AuditFilters = {
      currency: currencyFilter !== 'ALL' ? currencyFilter : null,
      action: actionFilter,
      search,
      since,
      until,
    }

    const queryResult = await executeAuditQuery(
      supabase,
      initialFilters,
      order,
      limit
    )

    if (queryResult.tableMissing) {
      return NextResponse.json(
        {
          data: [],
          audit: [],
          pagination: {
            total: 0,
            filtered_total: 0,
            returned: 0,
            limit,
          },
          filters: {
            currency: currencyFilter,
            action: actionFilter,
            search,
            since,
            until,
            order,
          },
          message:
            'Aucun journal d’audit disponible. Crée la table exchange_rate_audit pour activer la traçabilité.',
          generated_at: nowIso(),
          admin_email: adminUser?.email || adminUser?.user?.email || null,
        },
        { status: 200 }
      )
    }

    let audit: AuditEntry[] = queryResult.rows
      .map((row) => normalizeAuditEntry(row))
      .filter(Boolean) as AuditEntry[]

    /*
     * Sécurité supplémentaire :
     * si la recherche serveur n’a pas pu être appliquée parce qu’une colonne
     * manquait, on filtre localement.
     */
    if (search && !queryResult.usedServerSearch) {
      audit = audit.filter((entry) => localSearchFilter(entry, search))
    }

    const auditSlice = audit.slice(0, limit)

    const totalFromServer =
      typeof queryResult.count === 'number' && queryResult.usedServerSearch
        ? queryResult.count
        : null

    return NextResponse.json(
      {
        data: auditSlice,
        audit: auditSlice,
        pagination: {
          total: totalFromServer ?? audit.length,
          filtered_total: audit.length,
          returned: auditSlice.length,
          limit,
          has_more: auditSlice.length < audit.length,
        },
        filters: {
          currency: currencyFilter,
          action: actionFilter,
          search,
          since,
          until,
          order,
        },
        schema_status: {
          used_server_search: queryResult.usedServerSearch,
          active_filters: queryResult.activeFilters,
          last_error: queryResult.lastError
            ? {
                message: String(queryResult.lastError.message || ''),
                code: String(queryResult.lastError.code || ''),
              }
            : null,
        },
        generated_at: nowIso(),
        admin_email: adminUser?.email || adminUser?.user?.email || null,
      },
      { status: 200 }
    )
  } catch (err: any) {
    log.error?.('GET /api/admin/exchange-rate/audit error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Erreur lors du chargement du journal d’audit du taux de change.',
        data: [],
        audit: [],
        pagination: {
          total: 0,
          filtered_total: 0,
          returned: 0,
          limit: DEFAULT_LIMIT,
        },
      },
      { status: 500 }
    )
  }
}