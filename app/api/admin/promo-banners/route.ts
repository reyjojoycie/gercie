// app/api/admin/promo-banners/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'

/* ═══════════════════════════════════════════════════════════════ */
/*  RUNTIME / DYNAMIC                                              */
/* ═══════════════════════════════════════════════════════════════ */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/* ═══════════════════════════════════════════════════════════════ */
/*  CONFIGURATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const CONFIG = {
  /** Taille max du body JSON en octets (2 Mo) */
  MAX_BODY_BYTES: 2 * 1024 * 1024,

  /** Longueur max du message */
  MAX_MESSAGE_LENGTH: 500,

  /** Nombre max de bannières traitées en batch */
  MAX_BATCH_SIZE: 200,

  /** Activer un cache HTTP court sur GET admin (déconseillé, admin = sensible) */
  ENABLE_HTTP_CACHE: false,

  /** Cache-Control si ENABLE_HTTP_CACHE = true */
  CACHE_CONTROL: 'private, max-age=15, stale-while-revalidate=30',

  /** Rate limiting (requêtes / fenêtre) */
  RATE_LIMIT: {
    windowMs: 60_000,
    read: 120,
    write: 40,
    delete: 20,
  },

  /** Noms d'icônes autorisés (alignés sur le front PromoBanner) */
  ALLOWED_ICONS: [
    'sparkles',
    'gift',
    'truck',
    'percent',
    'clock',
    'star',
    'heart',
    'shield',
    'zap',
    'info',
    'none',
  ] as const,

  /** Statuts d'approbation autorisés */
  ALLOWED_APPROVAL_STATUS: ['draft', 'review', 'approved'] as const,
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type IconName = (typeof CONFIG.ALLOWED_ICONS)[number]
type ApprovalStatus = (typeof CONFIG.ALLOWED_APPROVAL_STATUS)[number]

interface PromoBannerConfig {
  badge?: string | null
  icon?: IconName | null
  cta_text?: string | null
  cta_link?: string | null
  target?: '_self' | '_blank' | 'auto' | null
  priority?: number
  tags?: string[]
  track?: Record<string, unknown>
  notes?: string | null
  approval_status?: ApprovalStatus
  css_class?: string | null
  custom_style?: string | null
  [key: string]: unknown
}

interface PromoBannerRow {
  id: string
  message: string
  lien: string | null
  ordre: number
  actif: boolean
  date_debut: string | null
  date_fin: string | null
  config?: PromoBannerConfig | null
  created_by?: string | null
  updated_by?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

type Json = Record<string, unknown>

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRIQUES                                             */
/* ═══════════════════════════════════════════════════════════════ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function emptyToNull(val: unknown): unknown {
  if (val === '' || val === undefined) return null
  if (typeof val === 'string' && val.trim() === '') return null
  return val
}

function asObject(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Json
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidLink(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  if (v.startsWith('/') || v.startsWith('#') || v.startsWith('mailto:') || v.startsWith('tel:')) {
    return true
  }
  try {
    // eslint-disable-next-line no-new
    new URL(v)
    return true
  } catch {
    return false
  }
}

function parseDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeEndOfDay(value: unknown): string | null {
  const date = parseDateOrNull(value)
  if (!date) return null

  // Si la date arrive sans heure (YYYY-MM-DD), on la pousse à 23:59:59 local UTC
  const raw = String(value).trim()
  if (raw.length <= 10) {
    const end = new Date(date)
    end.setUTCHours(23, 59, 59, 999)
    return end.toISOString()
  }

  return date.toISOString()
}

function normalizeStartOfDay(value: unknown): string | null {
  const date = parseDateOrNull(value)
  if (!date) return null

  const raw = String(value).trim()
  if (raw.length <= 10) {
    const start = new Date(date)
    start.setUTCHours(0, 0, 0, 0)
    return start.toISOString()
  }

  return date.toISOString()
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return 'Erreur inconnue'
  }
}

function log(level: 'info' | 'warn' | 'error', scope: string, payload?: unknown) {
  const meta = {
    ts: new Date().toISOString(),
    scope,
    level,
  }

  if (level === 'error') {
    console.error(`[promo-banners/admin]`, meta, payload ?? '')
  } else if (level === 'warn') {
    console.warn(`[promo-banners/admin]`, meta, payload ?? '')
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`[promo-banners/admin]`, meta, payload ?? '')
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HEADERS SÉCURITÉ + CACHE                                       */
/* ═══════════════════════════════════════════════════════════════ */

function securityHeaders(): HeadersInit {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': CONFIG.ENABLE_HTTP_CACHE ? CONFIG.CACHE_CONTROL : 'no-store, must-revalidate',
  }
}

function jsonResponse<T>(
  body: T,
  init?: { status?: number; headers?: HeadersInit }
): NextResponse<T> {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      ...securityHeaders(),
      ...(init?.headers ?? {}),
    },
  })
}

function errorResponse(message: string, status = 400, details?: unknown) {
  return jsonResponse(
    { error: message, ...(details !== undefined ? { details } : {}) },
    { status }
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  RATE LIMITING IN-MEMORY                                        */
/* ═══════════════════════════════════════════════════════════════ */
/*
 * Attention : en environnement serverless multi-instance, ce rate limit
 * n'est pas global. Pour une vraie protection, remplace par Upstash Redis
 * ou Vercel KV. Ici c'est une protection légère contre les abus simples.
 */

interface RateBucket {
  count: number
  resetAt: number
}

const rateBuckets = new Map<string, RateBucket>()

function pruneRateBuckets(now: number) {
  if (rateBuckets.size < 1000) return
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) rateBuckets.delete(key)
  }
}

function checkRateLimit(key: string, kind: 'read' | 'write' | 'delete'): boolean {
  const now = Date.now()
  pruneRateBuckets(now)

  const limit = CONFIG.RATE_LIMIT[kind]
  const bucket = rateBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + CONFIG.RATE_LIMIT.windowMs })
    return true
  }

  if (bucket.count >= limit) {
    return false
  }

  bucket.count += 1
  return true
}

function getClientKey(req: NextRequest, userId?: string): string {
  if (userId) return `u:${userId}`
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  return `ip:${ip}`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LECTURE BODY SÉCURISÉE                                         */
/* ═══════════════════════════════════════════════════════════════ */

async function readJsonBody(req: NextRequest): Promise<unknown> {
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > CONFIG.MAX_BODY_BYTES) {
    throw new Error(`Payload trop volumineux (max ${CONFIG.MAX_BODY_BYTES} octets).`)
  }

  const text = await req.text()

  if (Buffer.byteLength(text, 'utf8') > CONFIG.MAX_BODY_BYTES) {
    throw new Error(`Payload trop volumineux (max ${CONFIG.MAX_BODY_BYTES} octets).`)
  }

  if (!text.trim()) return null

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('JSON malformé.')
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  AUTH + GUARD COMMUN                                            */
/* ═══════════════════════════════════════════════════════════════ */

interface AuthContext {
  userId: string
  email?: string
}

async function guardAdmin(req: NextRequest, kind: 'read' | 'write' | 'delete') {
  try {
    const admin = await requireAdmin()
    const userId =
      (admin as { id?: string; user_id?: string; userId?: string })?.id ??
      (admin as { user_id?: string })?.user_id ??
      (admin as { userId?: string })?.userId ??
      'admin'

    const key = getClientKey(req, String(userId))

    if (!checkRateLimit(key, kind)) {
      return {
        ok: false as const,
        response: errorResponse('Trop de requêtes. Réessayez dans une minute.', 429),
      }
    }

    return {
      ok: true as const,
      ctx: {
        userId: String(userId),
        email: (admin as { email?: string })?.email,
      } satisfies AuthContext,
    }
  } catch (err: unknown) {
    const message = safeErrorMessage(err)
    log('warn', 'guardAdmin:denied', { message })
    return {
      ok: false as const,
      response: errorResponse(message || 'Accès refusé.', 403),
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DÉTECTION DE COLONNES OPTIONNELLES                             */
/* ═══════════════════════════════════════════════════════════════ */

const columnCache = new Map<string, boolean>()

async function hasColumn(
  supabase: ReturnType<typeof createServiceClient>,
  column: string
): Promise<boolean> {
  if (columnCache.has(column)) return columnCache.get(column)!

  try {
    const { error } = await supabase.from('promo_banners').select(column).limit(1)
    // 42703 = column does not exist (Postgres)
    const missing =
      !!error &&
      (error.code === '42703' ||
        /column .* does not exist/i.test(error.message || '') ||
        /Could not find the .* column/i.test(error.message || ''))

    const exists = !missing
    columnCache.set(column, exists)
    return exists
  } catch {
    columnCache.set(column, false)
    return false
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS ZOD                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const linkSchema = z
  .preprocess(emptyToNull, z.string().trim().max(2048).nullable().optional())
  .refine((val) => val === null || val === undefined || isValidLink(val), {
    message: 'Lien invalide (chemin interne, http(s), mailto: ou tel:).',
  })

const dateSchema = z.preprocess(emptyToNull, z.string().nullable().optional())

const configSchema = z
  .object({
    badge: z.string().trim().max(40).nullable().optional(),
    icon: z.enum(CONFIG.ALLOWED_ICONS).nullable().optional(),
    cta_text: z.string().trim().max(60).nullable().optional(),
    cta_link: linkSchema,
    target: z.enum(['_self', '_blank', 'auto']).nullable().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    track: z.record(z.unknown()).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    approval_status: z.enum(CONFIG.ALLOWED_APPROVAL_STATUS).optional(),
    css_class: z.string().trim().max(200).nullable().optional(),
    custom_style: z.string().trim().max(2000).nullable().optional(),
  })
  .passthrough()
  .nullable()
  .optional()

const bannerCoreSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Le message ne peut pas être vide.')
    .max(CONFIG.MAX_MESSAGE_LENGTH, `Le message ne doit pas dépasser ${CONFIG.MAX_MESSAGE_LENGTH} caractères.`),
  lien: linkSchema,
  ordre: z.number().int().min(0).max(100000).optional(),
  actif: z.boolean().optional(),
  date_debut: dateSchema,
  date_fin: dateSchema,
  config: configSchema,
})

const bannerWithIdSchema = bannerCoreSchema.extend({
  id: z.string().uuid("L'id doit être un UUID valide."),
})

const createSchema = bannerCoreSchema

const updateSchema = z.array(bannerWithIdSchema).min(1).max(CONFIG.MAX_BATCH_SIZE)

const createBatchSchema = z.array(createSchema).min(1).max(CONFIG.MAX_BATCH_SIZE)

const reorderSchema = z.object({
  action: z.literal('reorder'),
  ids: z.array(z.string().uuid()).min(1).max(CONFIG.MAX_BATCH_SIZE),
})

const patchSchema = bannerCoreSchema.partial().extend({
  id: z.string().uuid(),
})

const deleteSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(CONFIG.MAX_BATCH_SIZE) }),
])

const getQuerySchema = z.object({
  statut: z.enum(['all', 'active', 'scheduled', 'expired', 'inactive']).optional(),
  actif: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['ordre', 'message', 'debut', 'fin', 'statut', 'recent']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  includeConfig: z.enum(['true', 'false']).optional(),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION PAYLOAD                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface BuildPayloadOptions {
  includeConfig: boolean
  includeAudit: boolean
  userId?: string
  isNew?: boolean
}

function buildPayload(
  input: z.infer<typeof bannerCoreSchema> | z.infer<typeof bannerWithIdSchema>,
  options: BuildPayloadOptions
): Json {
  const payload: Json = {
    message: String(input.message ?? '').trim(),
    lien: (input.lien as string | null | undefined) ?? null,
    actif: typeof input.actif === 'boolean' ? input.actif : true,
  }

  if (typeof input.ordre === 'number') {
    payload.ordre = clamp(Math.trunc(input.ordre), 0, 100000)
  }

  payload.date_debut = normalizeStartOfDay(input.date_debut)
  payload.date_fin = normalizeEndOfDay(input.date_fin)

  if (options.includeConfig && input.config) {
    payload.config = input.config
  }

  if (options.includeAudit && options.userId) {
    if (options.isNew) payload.created_by = options.userId
    payload.updated_by = options.userId
  }

  return payload
}

function validateDateCoherence(payload: Json): string | null {
  const start = parseDateOrNull(payload.date_debut)
  const end = parseDateOrNull(payload.date_fin)

  if (payload.date_debut && !start) return 'Date de début invalide.'
  if (payload.date_fin && !end) return 'Date de fin invalide.'
  if (start && end && start > end) return 'La date de fin doit être postérieure à la date de début.'

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATUT / FILTRAGE                                              */
/* ═══════════════════════════════════════════════════════════════ */

type BannerStatus = 'active' | 'scheduled' | 'expired' | 'inactive'

function getRowStatus(row: PromoBannerRow, now: Date): BannerStatus {
  if (!row.actif) return 'inactive'

  const start = parseDateOrNull(row.date_debut)
  const end = parseDateOrNull(row.date_fin)

  if (start && start > now) return 'scheduled'
  if (end && end < now) return 'expired'

  return 'active'
}

function matchesSearch(row: PromoBannerRow, q: string): boolean {
  const needle = q.toLowerCase()
  const haystack = [
    row.message,
    row.lien ?? '',
    ...(row.config?.tags ?? []),
    row.config?.badge ?? '',
    row.config?.notes ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(needle)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  const guard = await guardAdmin(req, 'read')
  if (!guard.ok) return guard.response

  const parsedQuery = getQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsedQuery.success) {
    return errorResponse('Paramètres de requête invalides.', 400, parsedQuery.error.flatten())
  }

  const q = parsedQuery.data

  try {
    const supabase = createServiceClient()
    const hasConfig = await hasColumn(supabase, 'config')

    const selectColumns = [
      'id',
      'message',
      'lien',
      'ordre',
      'actif',
      'date_debut',
      'date_fin',
      'created_at',
      'updated_at',
      ...(hasConfig && q.includeConfig !== 'false' ? ['config'] : []),
    ].join(',')

    const { data, error } = await supabase
      .from('promo_banners')
      .select(selectColumns)
      .order('ordre', { ascending: q.order !== 'desc' })

    if (error) {
      log('error', 'GET:select', { message: error.message, code: error.code })
      return errorResponse(`Erreur de lecture: ${error.message}`, 500)
    }

    let rows = (data ?? []) as PromoBannerRow[]
    const now = new Date()

    // Filtre statut
    if (q.statut && q.statut !== 'all') {
      rows = rows.filter((row) => getRowStatus(row, now) === q.statut)
    }

    // Filtre actif
    if (q.actif) {
      const wanted = q.actif === 'true'
      rows = rows.filter((row) => Boolean(row.actif) === wanted)
    }

    // Recherche
    if (q.search) {
      rows = rows.filter((row) => matchesSearch(row, q.search!))
    }

    // Tri applicatif complémentaire
    if (q.sort === 'message') {
      rows.sort((a, b) => a.message.localeCompare(b.message, 'fr'))
    } else if (q.sort === 'debut') {
      rows.sort((a, b) => {
        const da = parseDateOrNull(a.date_debut)?.getTime() ?? Number.POSITIVE_INFINITY
        const db = parseDateOrNull(b.date_debut)?.getTime() ?? Number.POSITIVE_INFINITY
        return q.order === 'desc' ? db - da : da - db
      })
    } else if (q.sort === 'fin') {
      rows.sort((a, b) => {
        const da = parseDateOrNull(a.date_fin)?.getTime() ?? Number.POSITIVE_INFINITY
        const db = parseDateOrNull(b.date_fin)?.getTime() ?? Number.POSITIVE_INFINITY
        return q.order === 'desc' ? db - da : da - db
      })
    } else if (q.sort === 'statut') {
      rows.sort((a, b) => getRowStatus(a, now).localeCompare(getRowStatus(b, now)))
    } else if (q.sort === 'recent') {
      rows.sort((a, b) => {
        const da = parseDateOrNull(a.updated_at ?? a.created_at)?.getTime() ?? 0
        const db = parseDateOrNull(b.updated_at ?? b.created_at)?.getTime() ?? 0
        return db - da
      })
    }

    // Pagination
    const total = rows.length
    const limit = q.limit ?? 200
    const page = q.page ?? 1
    const startIdx = (page - 1) * limit
    const paginated = rows.slice(startIdx, startIdx + limit)

    return jsonResponse(
      {
        data: paginated,
        meta: {
          total,
          page,
          limit,
          hasMore: startIdx + paginated.length < total,
          filters: q,
        },
      },
      {
        headers: {
          'X-Total-Count': String(total),
          'X-Page': String(page),
          'X-Limit': String(limit),
        },
      }
    )
  } catch (err: unknown) {
    log('error', 'GET:unhandled', { message: safeErrorMessage(err) })
    return errorResponse(safeErrorMessage(err) || 'Erreur interne.', 500)
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST (création unitaire ou batch)                              */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(req: NextRequest) {
  const guard = await guardAdmin(req, 'write')
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (err: unknown) {
    return errorResponse(safeErrorMessage(err), 413)
  }

  try {
    const supabase = createServiceClient()
    const hasConfig = await hasColumn(supabase, 'config')
    const hasAudit = (await hasColumn(supabase, 'created_by')) && (await hasColumn(supabase, 'updated_by'))

    // Batch ?
    const isArray = Array.isArray(body)
    const parsed = isArray
      ? createBatchSchema.safeParse(body)
      : createSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse('Données invalides.', 400, parsed.error.flatten())
    }

    const inputs = (isArray ? parsed.data : [parsed.data]) as z.infer<typeof createSchema>[]

    if (inputs.length === 0) {
      return errorResponse('Aucune bannière à créer.', 400)
    }

    // Calcul du prochain ordre si non fourni
    const { data: maxRow, error: maxError } = await supabase
      .from('promo_banners')
      .select('ordre')
      .order('ordre', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (maxError) {
      log('warn', 'POST:maxOrdre', { message: maxError.message })
    }

    let nextOrdre = Number(maxRow?.ordre ?? 0) + 1

    const payloads: Json[] = []
    const created: PromoBannerRow[] = []
    const errors: string[] = []

    for (const input of inputs) {
      const payload = buildPayload(input, {
        includeConfig: hasConfig,
        includeAudit: hasAudit,
        userId: guard.ctx.userId,
        isNew: true,
      })

      if (typeof payload.ordre !== 'number') {
        payload.ordre = nextOrdre++
      }

      const dateError = validateDateCoherence(payload)
      if (dateError) {
        errors.push(dateError)
        continue
      }

      const { data, error } = await supabase.from('promo_banners').insert(payload).select().single()

      if (error) {
        errors.push(error.message)
        continue
      }

      created.push(data as PromoBannerRow)
    }

    if (created.length === 0) {
      return errorResponse(errors[0] || 'Échec de la création.', 500, { errors })
    }

    return jsonResponse(
      {
        success: true,
        created: created.length,
        data: created,
        ...(errors.length > 0 ? { warnings: errors } : {}),
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    log('error', 'POST:unhandled', { message: safeErrorMessage(err) })
    return errorResponse(safeErrorMessage(err) || 'Erreur interne.', 500)
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUT (mise à jour batch OU reorder atomique)                    */
/* ═══════════════════════════════════════════════════════════════ */

export async function PUT(req: NextRequest) {
  const guard = await guardAdmin(req, 'write')
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (err: unknown) {
    return errorResponse(safeErrorMessage(err), 413)
  }

  try {
    const supabase = createServiceClient()

    // Cas reorder atomique
    const reorderParsed = reorderSchema.safeParse(body)
    if (reorderParsed.success) {
      const { ids } = reorderParsed.data

      // Tentative RPC
      let rpcOk = false
      try {
        const { error: rpcError } = await supabase.rpc('reorder_promo_banners', { p_ids: ids })
        if (!rpcError) rpcOk = true
        else if (
          rpcError.code !== 'PGRST202' &&
          !/could not find the function/i.test(rpcError.message || '')
        ) {
          throw rpcError
        }
      } catch (rpcErr: unknown) {
        log('warn', 'PUT:reorder:rpc', { message: safeErrorMessage(rpcErr) })
      }

      if (!rpcOk) {
        // Fallback séquentiel
        for (let i = 0; i < ids.length; i += 1) {
          const { error } = await supabase
            .from('promo_banners')
            .update({ ordre: i + 1 })
            .eq('id', ids[i])

          if (error) {
            return errorResponse(`Erreur réordonnancement: ${error.message}`, 500)
          }
        }
      }

      return jsonResponse({ success: true, reordered: ids.length })
    }

    // Cas mise à jour batch classique
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse('Données invalides.', 400, parsed.error.flatten())
    }

    const hasConfig = await hasColumn(supabase, 'config')
    const hasAudit = await hasColumn(supabase, 'updated_by')

    const updates = parsed.data.map((item) => {
      const { id, ...rest } = item
      const payload = buildPayload(rest, {
        includeConfig: hasConfig,
        includeAudit: hasAudit,
        userId: guard.ctx.userId,
        isNew: false,
      })
      return { id, payload }
    })

    const results = await Promise.all(
      updates.map(({ id, payload }) =>
        supabase.from('promo_banners').update(payload).eq('id', id)
      )
    )

    const errors = results
      .map((r, idx) => (r.error ? `${updates[idx].id}: ${r.error.message}` : null))
      .filter(Boolean) as string[]

    if (errors.length > 0) {
      return errorResponse(`Erreur PostgreSQL: ${errors.join(' | ')}`, 500, { errors })
    }

    return jsonResponse({ success: true, updated: updates.length })
  } catch (err: unknown) {
    log('error', 'PUT:unhandled', { message: safeErrorMessage(err) })
    return errorResponse(safeErrorMessage(err) || 'Erreur interne.', 500)
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PATCH (mise à jour partielle d'une bannière)                   */
/* ═══════════════════════════════════════════════════════════════ */

export async function PATCH(req: NextRequest) {
  const guard = await guardAdmin(req, 'write')
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (err: unknown) {
    return errorResponse(safeErrorMessage(err), 413)
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse('Données invalides.', 400, parsed.error.flatten())
  }

  try {
    const supabase = createServiceClient()
    const hasConfig = await hasColumn(supabase, 'config')
    const hasAudit = await hasColumn(supabase, 'updated_by')

    const { id, ...rest } = parsed.data

    // Payload partiel : on n'envoie que les champs présents
    const payload: Json = {}

    if (rest.message !== undefined) payload.message = String(rest.message).trim()
    if (rest.lien !== undefined) payload.lien = rest.lien ?? null
    if (rest.actif !== undefined) payload.actif = Boolean(rest.actif)
    if (rest.ordre !== undefined) payload.ordre = clamp(Math.trunc(rest.ordre), 0, 100000)
    if (rest.date_debut !== undefined) payload.date_debut = normalizeStartOfDay(rest.date_debut)
    if (rest.date_fin !== undefined) payload.date_fin = normalizeEndOfDay(rest.date_fin)
    if (hasConfig && rest.config !== undefined) payload.config = rest.config ?? {}
    if (hasAudit) payload.updated_by = guard.ctx.userId

    if (Object.keys(payload).length === 0) {
      return errorResponse('Aucun champ à mettre à jour.', 400)
    }

    const dateError = validateDateCoherence(payload)
    if (dateError) return errorResponse(dateError, 400)

    const { data, error } = await supabase
      .from('promo_banners')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return errorResponse(`Erreur mise à jour: ${error.message}`, 500)
    }

    return jsonResponse({ success: true, data })
  } catch (err: unknown) {
    log('error', 'PATCH:unhandled', { message: safeErrorMessage(err) })
    return errorResponse(safeErrorMessage(err) || 'Erreur interne.', 500)
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE (unitaire, batch, soft ou hard)                         */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(req: NextRequest) {
  const guard = await guardAdmin(req, 'delete')
  if (!guard.ok) return guard.response

  const soft = req.nextUrl.searchParams.get('soft') === 'true'

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    body = null
  }

  // Support aussi ?ids=a,b,c en query param
  const idsParam = req.nextUrl.searchParams.get('ids')
  const idParam = req.nextUrl.searchParams.get('id')

  let ids: string[] = []

  if (body) {
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse('Données invalides.', 400, parsed.error.flatten())
    }
    ids = 'ids' in parsed.data ? parsed.data.ids : [parsed.data.id]
  } else if (idsParam) {
    ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (idParam) {
    ids = [idParam]
  }

  if (ids.length === 0) {
    return errorResponse('Aucun id fourni.', 400)
  }

  if (ids.length > CONFIG.MAX_BATCH_SIZE) {
    return errorResponse(`Maximum ${CONFIG.MAX_BATCH_SIZE} ids par requête.`, 400)
  }

  try {
    const supabase = createServiceClient()

    if (soft) {
      const { error } = await supabase
        .from('promo_banners')
        .update({ actif: false })
        .in('id', ids)

      if (error) {
        return errorResponse(`Erreur soft delete: ${error.message}`, 500)
      }

      return jsonResponse({ success: true, softDeleted: ids.length })
    }

    const { error } = await supabase.from('promo_banners').delete().in('id', ids)

    if (error) {
      return errorResponse(`Erreur suppression: ${error.message}`, 500)
    }

    return jsonResponse({ success: true, deleted: ids.length })
  } catch (err: unknown) {
    log('error', 'DELETE:unhandled', { message: safeErrorMessage(err) })
    return errorResponse(safeErrorMessage(err) || 'Erreur interne.', 500)
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HEAD / OPTIONS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...securityHeaders(),
      'X-Promo-Banners-API': 'ok',
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      ...securityHeaders(),
    },
  })
}