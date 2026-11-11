// app/api/promo-banners/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabaseServer'

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
  /** Nombre max de lignes lues depuis Supabase avant filtrage applicatif */
  MAX_ROWS: 200,

  /** Limite par défaut du response */
  DEFAULT_LIMIT: 50,

  /** Limite max demandable via ?limit= */
  MAX_LIMIT: 100,

  /** Cache HTTP public */
  CACHE: {
    /** CDN / proxy shared cache */
    sMaxAge: 60,

    /** Servir une réponse périmée pendant que le CDN revalide */
    staleWhileRevalidate: 300,

    /** Browser cache */
    browserMaxAge: 30,
  },

  /**
   * Rate limiting léger in-memory.
   * En serverless multi-instance, ce n’est pas global.
   * Pour une vraie protection, utiliser Upstash Redis / Vercel KV.
   */
  ENABLE_RATE_LIMIT: false,
  RATE_LIMIT: {
    windowMs: 60_000,
    max: 300,
  },

  /** Activer CORS si ton front est sur un autre domaine */
  ENABLE_CORS: false,

  /** Icônes autorisés, alignés sur components/home/PromoBanner.tsx */
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

  /** Cibles de lien autorisées */
  ALLOWED_TARGETS: ['_self', '_blank', 'auto'] as const,
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type IconName = (typeof CONFIG.ALLOWED_ICONS)[number]
type LinkTarget = (typeof CONFIG.ALLOWED_TARGETS)[number]

export interface PromoMessageLite {
  id: string
  message: string
  lien: string | null
}

export interface PromoMessageFull extends PromoMessageLite {
  cta_text: string | null
  cta_link: string | null
  target: LinkTarget
  icon: IconName | null
  badge: string | null
  priority: number
  start_date: string | null
  end_date: string | null
}

type PromoMessageOutput = PromoMessageLite | PromoMessageFull

interface InternalBanner {
  id: string
  message: string
  lien: string | null
  ordre: number
  actif: boolean
  start_date: string | null
  end_date: string | null
  created_at: string | null
  updated_at: string | null
  cta_text: string | null
  cta_link: string | null
  target: LinkTarget
  icon: IconName | null
  badge: string | null
  priority: number
  tags: string[]
}

interface QueryOptions {
  limit: number
  includeInactive: boolean
  includeExpired: boolean
  includeScheduled: boolean
  tag?: string
  format: 'array' | 'envelope'
  fields: 'lite' | 'full'
  debug: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRIQUES                                             */
/* ═══════════════════════════════════════════════════════════════ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function safeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  return trimmed.slice(0, maxLength)
}

function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return clamp(Math.trunc(parsed), min, max)
}

function safeLink(value: unknown): string | null {
  const v = safeString(value, 2048)
  if (!v) return null

  if (
    v.startsWith('/') ||
    v.startsWith('#') ||
    v.startsWith('mailto:') ||
    v.startsWith('tel:')
  ) {
    return v
  }

  try {
    const url = new URL(v)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return v
    }
    return null
  } catch {
    return null
  }
}

function safeIcon(value: unknown): IconName | null {
  if (typeof value !== 'string') return null
  const v = value.trim() as IconName
  return CONFIG.ALLOWED_ICONS.includes(v) ? v : null
}

function safeTarget(value: unknown): LinkTarget {
  if (typeof value !== 'string') return 'auto'
  const v = value.trim() as LinkTarget
  return CONFIG.ALLOWED_TARGETS.includes(v) ? v : 'auto'
}

function safeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((item) => safeString(item, 40))
        .filter((item): item is string => Boolean(item))
    )
  ).slice(0, 20)
}

function parseDateOrNull(value: unknown, endOfDay = false): Date | null {
  if (value === null || value === undefined || value === '') return null

  const raw = String(value).trim()
  if (!raw) return null

  const normalized =
    raw.length <= 10
      ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
      : raw

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function hashPayload(payload: unknown): string {
  const serialized = JSON.stringify(payload)
  return createHash('sha1').update(serialized).digest('hex')
}

function buildEtag(hash: string): string {
  return `"${hash}"`
}

function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false

  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim())
    .some((candidate) => {
      const normalized = candidate.replace(/^W\//, '')
      return normalized === etag || normalized === `W/${etag}`
    })
}

function isMissingColumnError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null

  if (!err) return false

  const message = String(err.message || '')

  return (
    err.code === '42703' ||
    /column .* does not exist/i.test(message) ||
    /Could not find the .* column/i.test(message) ||
    /schema cache/i.test(message)
  )
}

function log(level: 'info' | 'warn' | 'error', scope: string, payload?: unknown) {
  const meta = {
    ts: new Date().toISOString(),
    scope,
    level,
  }

  if (level === 'error') {
    console.error('[promo-banners/public]', meta, payload ?? '')
  } else if (level === 'warn') {
    console.warn('[promo-banners/public]', meta, payload ?? '')
  } else if (process.env.NODE_ENV === 'development') {
    console.log('[promo-banners/public]', meta, payload ?? '')
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  RATE LIMITING LÉGER                                            */
/* ═══════════════════════════════════════════════════════════════ */

interface RateBucket {
  count: number
  resetAt: number
}

const rateBuckets = new Map<string, RateBucket>()

function pruneRateBuckets(now: number) {
  if (rateBuckets.size < 1000) return

  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(key)
    }
  }
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const firstForwarded = forwarded?.split(',')[0]?.trim()

  return (
    firstForwarded ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function consumeRateToken(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  if (!CONFIG.ENABLE_RATE_LIMIT) {
    return { allowed: true }
  }

  const now = Date.now()
  pruneRateBuckets(now)

  const bucket = rateBuckets.get(ip)

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, {
      count: 1,
      resetAt: now + CONFIG.RATE_LIMIT.windowMs,
    })
    return { allowed: true }
  }

  if (bucket.count >= CONFIG.RATE_LIMIT.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    return { allowed: false, retryAfterSeconds }
  }

  bucket.count += 1
  return { allowed: true }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HEADERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
  }
}

function corsHeaders(): Record<string, string> {
  if (!CONFIG.ENABLE_CORS) return {}

  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag, X-Promo-Banners-Count, X-Promo-Banners-Mode',
    'Access-Control-Max-Age': '86400',
  }
}

function cacheHeaders(options: {
  etag?: string
  lastModified?: string | null
  noStore?: boolean
}): Record<string, string> {
  const headers: Record<string, string> = {
    ...securityHeaders(),
    ...corsHeaders(),
    Vary: 'Accept-Encoding',
  }

  if (options.noStore) {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    headers.Pragma = 'no-cache'
    headers.Expires = '0'
  } else {
    headers['Cache-Control'] = [
      'public',
      `s-maxage=${CONFIG.CACHE.sMaxAge}`,
      `stale-while-revalidate=${CONFIG.CACHE.staleWhileRevalidate}`,
      `max-age=${CONFIG.CACHE.browserMaxAge}`,
    ].join(', ')
  }

  if (options.etag) {
    headers.ETag = options.etag
  }

  if (options.lastModified) {
    headers['Last-Modified'] = options.lastModified
  }

  return headers
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE COLUMN DETECTION                                      */
/* ═══════════════════════════════════════════════════════════════ */

type SelectMode = 'full' | 'metadata' | 'core'

const SELECT_STATEMENTS: Record<SelectMode, string> = {
  core: 'id, message, lien, ordre, actif, date_debut, date_fin',
  metadata: 'id, message, lien, ordre, actif, date_debut, date_fin, created_at, updated_at',
  full: 'id, message, lien, ordre, actif, date_debut, date_fin, created_at, updated_at, config',
}

let cachedSelectMode: SelectMode | null = null

function getSelectModes(): SelectMode[] {
  const allModes: SelectMode[] = ['full', 'metadata', 'core']

  if (!cachedSelectMode) return allModes

  return [cachedSelectMode, ...allModes.filter((mode) => mode !== cachedSelectMode)]
}

async function fetchBannerRows(): Promise<{
  rows: Record<string, unknown>[]
  mode: SelectMode
}> {
  const supabase = createServiceClient()
  const modes = getSelectModes()

  let lastError: unknown = null

  for (const mode of modes) {
    const select = SELECT_STATEMENTS[mode]

    const { data, error } = await supabase
      .from('promo_banners')
      .select(select)
      .eq('actif', true)
      .order('ordre', { ascending: true })
      .limit(CONFIG.MAX_ROWS)

    if (!error) {
      cachedSelectMode = mode
      return {
        rows: Array.isArray(data) ? (data as Record<string, unknown>[]) : [],
        mode,
      }
    }

    lastError = error

    if (isMissingColumnError(error)) {
      continue
    }

    throw error
  }

  throw lastError instanceof Error ? lastError : new Error('Erreur de lecture promo_banners')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeRow(row: Record<string, unknown>): InternalBanner | null {
  const message = safeString(row.message, 500)
  if (!message) return null

  const id =
    safeString(row.id, 120) ||
    `promo-${hashPayload({ message, ordre: row.ordre })}`

  const config = asObject(row.config)

  return {
    id,
    message,
    lien: safeLink(row.lien),
    ordre: safeNumber(row.ordre, 0, 0, 100000),
    actif: row.actif !== false,
    start_date: safeString(row.date_debut, 80),
    end_date: safeString(row.date_fin, 80),
    created_at: safeString(row.created_at, 80),
    updated_at: safeString(row.updated_at, 80),
    cta_text: safeString(config.cta_text, 60),
    cta_link: safeLink(config.cta_link),
    target: safeTarget(config.target),
    icon: safeIcon(config.icon),
    badge: safeString(config.badge, 40),
    priority: safeNumber(config.priority, 0, 0, 1000),
    tags: safeTags(config.tags),
  }
}

function isVisibleBanner(
  banner: InternalBanner,
  now: Date,
  options: Pick<QueryOptions, 'includeInactive' | 'includeExpired' | 'includeScheduled'>
): boolean {
  if (!options.includeInactive && !banner.actif) {
    return false
  }

  const start = parseDateOrNull(banner.start_date, false)
  if (start && start > now && !options.includeScheduled) {
    return false
  }

  const end = parseDateOrNull(banner.end_date, true)
  if (end && end < now && !options.includeExpired) {
    return false
  }

  return true
}

function matchesTag(banner: InternalBanner, tag?: string): boolean {
  if (!tag) return true
  return banner.tags.includes(tag)
}

function sortBanners(banners: InternalBanner[]): InternalBanner[] {
  return [...banners].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority
    }

    return a.ordre - b.ordre
  })
}

function toOutputBanner(
  banner: InternalBanner,
  fields: 'lite' | 'full'
): PromoMessageOutput {
  const base: PromoMessageLite = {
    id: banner.id,
    message: banner.message,
    lien: banner.lien,
  }

  if (fields === 'lite') {
    return base
  }

  const full: PromoMessageFull = {
    ...base,
    cta_text: banner.cta_text,
    cta_link: banner.cta_link,
    target: banner.target,
    icon: banner.icon,
    badge: banner.badge,
    priority: banner.priority,
    start_date: banner.start_date,
    end_date: banner.end_date,
  }

  return full
}

function getLastModified(banners: InternalBanner[]): string | null {
  let maxTimestamp = 0

  for (const banner of banners) {
    const updated = parseDateOrNull(banner.updated_at)?.getTime() ?? 0
    const created = parseDateOrNull(banner.created_at)?.getTime() ?? 0
    maxTimestamp = Math.max(maxTimestamp, updated, created)
  }

  if (!maxTimestamp) return null

  return new Date(maxTimestamp).toUTCString()
}

/* ═══════════════════════════════════════════════════════════════ */
/*  QUERY VALIDATION                                               */
/* ═══════════════════════════════════════════════════════════════ */

const booleanEnum = z.enum(['true', 'false'])

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(CONFIG.MAX_LIMIT).optional(),

  include_inactive: booleanEnum.optional(),
  include_expired: booleanEnum.optional(),
  include_scheduled: booleanEnum.optional(),

  tag: z.string().trim().min(1).max(40).optional(),

  format: z.enum(['array', 'envelope']).optional(),
  fields: z.enum(['lite', 'full']).optional(),

  debug: booleanEnum.optional(),
})

function parseQuery(req: NextRequest):
  | { ok: true; options: QueryOptions }
  | { ok: false; response: NextResponse } {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))

  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Paramètres de requête invalides.',
          details: parsed.error.flatten(),
        },
        {
          status: 400,
          headers: cacheHeaders({ noStore: true }),
        }
      ),
    }
  }

  const q = parsed.data

  return {
    ok: true,
    options: {
      limit: q.limit ?? CONFIG.DEFAULT_LIMIT,
      includeInactive: q.include_inactive === 'true',
      includeExpired: q.include_expired === 'true',
      includeScheduled: q.include_scheduled === 'true',
      tag: q.tag,
      format: q.format ?? 'array',
      fields: q.fields ?? 'full',
      debug: q.debug === 'true',
    },
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  const parsedQuery = parseQuery(req)
  if (!parsedQuery.ok) return parsedQuery.response

  const options = parsedQuery.options

  const ip = getClientIp(req)
  const rate = consumeRateToken(ip)

  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Trop de requêtes.' },
      {
        status: 429,
        headers: {
          ...cacheHeaders({ noStore: true }),
          'Retry-After': String(rate.retryAfterSeconds ?? 60),
        },
      }
    )
  }

  const useEnvelope = options.format === 'envelope' || options.debug
  const now = new Date()

  try {
    const { rows, mode } = await fetchBannerRows()

    const normalized = rows
      .map(normalizeRow)
      .filter((banner): banner is InternalBanner => banner !== null)

    const visible = normalized.filter((banner) =>
      isVisibleBanner(banner, now, options)
    )

    const tagged = visible.filter((banner) => matchesTag(banner, options.tag))

    const sorted = sortBanners(tagged)
    const limited = sorted.slice(0, options.limit)

    const output = limited.map((banner) => toOutputBanner(banner, options.fields))

    const lastModified = getLastModified(limited)
    const etag = buildEtag(hashPayload(output))

    if (matchesEtag(req.headers.get('if-none-match'), etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: cacheHeaders({
          etag,
          lastModified,
        }),
      })
    }

    const meta = {
      count: output.length,
      total_before_limit: sorted.length,
      generated_at: now.toISOString(),
      mode,
      fields: options.fields,
      format: useEnvelope ? 'envelope' : 'array',
      filters: {
        include_inactive: options.includeInactive,
        include_expired: options.includeExpired,
        include_scheduled: options.includeScheduled,
        tag: options.tag ?? null,
        limit: options.limit,
      },
      cache: {
        s_maxage: CONFIG.CACHE.sMaxAge,
        stale_while_revalidate: CONFIG.CACHE.staleWhileRevalidate,
        browser_max_age: CONFIG.CACHE.browserMaxAge,
      },
      ...(options.debug
        ? {
            diagnostics: {
              rows_fetched: rows.length,
              rows_normalized: normalized.length,
              rows_visible: visible.length,
              rows_tagged: tagged.length,
              select_mode: mode,
              has_config_column: mode === 'full',
              has_timestamp_columns: mode === 'full' || mode === 'metadata',
            },
          }
        : {}),
    }

    const payload = useEnvelope
      ? {
          data: output,
          meta,
        }
      : output

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        ...cacheHeaders({
          etag,
          lastModified,
        }),
        'X-Promo-Banners-Count': String(output.length),
        'X-Promo-Banners-Mode': mode,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)

    log('error', 'GET:failed', {
      message,
      ip,
      options,
    })

    const emptyPayload = useEnvelope
      ? {
          data: [],
          meta: {
            count: 0,
            total_before_limit: 0,
            generated_at: now.toISOString(),
            mode: 'error',
            fields: options.fields,
            format: 'envelope',
            error: 'Le service temporise. Des messages de secours peuvent être utilisés côté client.',
            filters: {
              include_inactive: options.includeInactive,
              include_expired: options.includeExpired,
              include_scheduled: options.includeScheduled,
              tag: options.tag ?? null,
              limit: options.limit,
            },
          },
        }
      : []

    return NextResponse.json(emptyPayload, {
      status: 200,
      headers: {
        ...cacheHeaders({ noStore: true }),
        'X-Promo-Banners-Count': '0',
        'X-Promo-Banners-Mode': 'error',
        'X-Promo-Banners-Error': '1',
      },
    })
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  OPTIONS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...securityHeaders(),
      ...corsHeaders(),
      Allow: 'GET, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
      'Access-Control-Expose-Headers': 'ETag, X-Promo-Banners-Count, X-Promo-Banners-Mode',
      'Access-Control-Max-Age': '86400',
    },
  })
}