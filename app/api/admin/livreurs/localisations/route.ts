// app/api/admin/livreurs/localisations/route.ts
// ============================================================================
// API Admin – Localisations groupées des livreurs
// Version complète, sécurisée et tolérante.
//
// Endpoint :
// - GET /api/admin/livreurs/localisations
//
// Paramètres query :
// - active_only=true|false        défaut : true
// - available_only=true|false     défaut : false
// - include_stale=true|false      défaut : false
// - zone=string                   défaut : vide
// - search=string                 défaut : vide
// - max_age_minutes=number        défaut : 30
// - limit=number                  défaut : 500, max : 1000
// - include_history=true|false    défaut : false
// - format=json|geojson           défaut : json
//
// Cette route ne contient aucune logique de paiement interne.
// ============================================================================

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

const LIVREURS_TABLE = 'livreurs'
const HISTORY_TABLE = 'livreur_localisations'

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface LivreurLocation {
  id: string
  nom: string
  prenom: string
  display_name: string
  email: string
  telephone: string | null
  zone: string | null
  est_actif: boolean
  est_disponible: boolean
  latitude: number
  longitude: number
  accuracy_m: number | null
  speed_kmh: number | null
  heading_deg: number | null
  altitude_m: number | null
  captured_at: string | null
  location_updated_at: string | null
  source: string
  metadata: Record<string, any>
  age_seconds: number | null
  is_fresh: boolean
  used_history: boolean
}

interface ZoneStat {
  zone: string
  total: number
  fresh: number
}

interface LocationsStats {
  fetched: number
  located: number
  fresh: number
  stale: number
  active: number
  available: number
  by_zone: ZoneStat[]
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRAUX                                               */
/* ═══════════════════════════════════════════════════════════════ */

function nowIso(): string {
  return new Date().toISOString()
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip')?.trim() ??
    '127.0.0.1'
  )
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'oui', 'yes', 'on', 'actif', 'active'].includes(str)) {
    return true
  }

  if (['false', 'non', 'no', 'off', 'inactif', 'inactive'].includes(str)) {
    return false
  }

  return fallback
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function safeJsonObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>
      }
    } catch {
      // silencieux
    }
  }

  return {}
}

function errorMessage(error: any, fallback: string): string {
  return String(error?.message || error?.details || error?.hint || fallback)
}

function isTableMissingError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '42P01' ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('n’existe pas') ||
    message.includes("n'existe pas")
  )
}

function isColumnError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '42703' ||
    message.includes('column') ||
    message.includes('does not exist') ||
    message.includes('could not find')
  )
}

function boolParam(value: 'true' | 'false'): boolean {
  return value === 'true'
}

function sanitizeLike(value: unknown): string {
  return String(value || '')
    .replace(/[(),%'"\s,]+/g, ' ')
    .trim()
    .slice(0, 120)
}

function buildSearchOr(term: string): string | null {
  if (!term) return null

  const like = `%${term}%`

  return [
    `nom.ilike.${like}`,
    `prenom.ilike.${like}`,
    `email.ilike.${like}`,
    `telephone.ilike.${like}`,
    `zone_operation_principale.ilike.${like}`,
  ].join(',')
}

function toDate(value: unknown): Date | null {
  if (!value) return null

  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function getTimestampValue(row: any): string | null {
  return textOrNull(
    row?.location_updated_at ||
      row?.captured_at ||
      row?.updated_at ||
      row?.created_at
  )
}

function hasCoordinates(row: any): boolean {
  const latitude = toNullableNumber(row?.latitude)
  const longitude = toNullableNumber(row?.longitude)

  return (
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

function isStaleRow(row: any, maxAgeSeconds: number): boolean {
  const date = toDate(getTimestampValue(row))

  if (!date) return true

  return Date.now() - date.getTime() > maxAgeSeconds * 1000
}

async function getSupabaseAdmin(): Promise<any> {
  const client: any = await createClient(true)
  return client?.supabase ?? client
}

function rateLimitResponse(
  request: Request,
  scope: string,
  maxRequests: number
): NextResponse | null {
  const ip = getClientIp(request)

  const { allowed, headers } = rateLimit({
    id: `admin-livreurs-localisations-${scope}:${ip}`,
    maxRequests,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: 'Trop de requêtes. Patientez une minute.',
          code: 'RATE_LIMITED',
        },
        { status: 429 }
      ),
      headers
    )
  }

  return null
}

async function guardAdmin(): Promise<NextResponse | null> {
  try {
    await requireAdmin()
    return null
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || 'Accès non autorisé',
        code: 'FORBIDDEN',
      },
      { status: err?.status || 403 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMA QUERY                                                   */
/* ═══════════════════════════════════════════════════════════════ */

const querySchema = z.object({
  active_only: z
    .enum(['true', 'false'])
    .optional()
    .default('true'),

  available_only: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),

  include_stale: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),

  zone: z
    .string()
    .max(160)
    .optional()
    .default(''),

  search: z
    .string()
    .max(160)
    .optional()
    .default(''),

  max_age_minutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .optional()
    .default(30),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(500),

  include_history: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),

  format: z
    .enum(['json', 'geojson'])
    .optional()
    .default('json'),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH LIVREURS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchLivreurs(
  supabase: any,
  options: {
    activeOnly: boolean
    availableOnly: boolean
    zone: string
    search: string
    limit: number
  }
): Promise<any[]> {
  const zone = sanitizeLike(options.zone)
  const search = sanitizeLike(options.search)

  const attempts: Array<{ filters: boolean; order: boolean }> = [
    { filters: true, order: true },
    { filters: true, order: false },
    { filters: false, order: false },
  ]

  let lastError: any = null

  for (const attempt of attempts) {
    try {
      let query = supabase.from(LIVREURS_TABLE).select('*')

      if (attempt.filters) {
        if (options.activeOnly) {
          query = query.eq('est_actif', true)
        }

        if (options.availableOnly) {
          query = query.eq('est_disponible', true)
        }

        if (zone) {
          query = query.ilike('zone_operation_principale', `%${zone}%`)
        }

        const orFilter = buildSearchOr(search)
        if (orFilter) {
          query = query.or(orFilter)
        }
      }

      if (attempt.order) {
        query = query.order('location_updated_at', { ascending: false })
      }

      query = query.limit(options.limit)

      const { data, error } = await query

      if (!error) {
        return Array.isArray(data) ? data : []
      }

      lastError = error

      if (isTableMissingError(error)) {
        throw error
      }

      if (isColumnError(error)) {
        continue
      }

      break
    } catch (err: any) {
      lastError = err

      if (isTableMissingError(err)) {
        throw err
      }

      if (isColumnError(err)) {
        continue
      }

      break
    }
  }

  if (lastError) {
    throw lastError
  }

  return []
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FETCH HISTORIQUE                                               */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchLatestHistory(
  supabase: any,
  ids: string[]
): Promise<Map<string, any>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 500)

  if (uniqueIds.length === 0) {
    return new Map()
  }

  const limit = Math.min(2000, uniqueIds.length * 5)

  const attempts: Array<{ order: boolean }> = [
    { order: true },
    { order: false },
  ]

  let rows: any[] = []
  let lastError: any = null

  for (const attempt of attempts) {
    try {
      let query = supabase
        .from(HISTORY_TABLE)
        .select('*')
        .in('livreur_id', uniqueIds)
        .limit(limit)

      if (attempt.order) {
        query = query.order('captured_at', { ascending: false })
      }

      const { data, error } = await query

      if (!error) {
        rows = Array.isArray(data) ? data : []
        break
      }

      lastError = error

      if (isTableMissingError(error)) {
        return new Map()
      }

      if (isColumnError(error)) {
        continue
      }

      break
    } catch (err: any) {
      lastError = err

      if (isTableMissingError(err)) {
        return new Map()
      }

      if (isColumnError(err)) {
        continue
      }

      break
    }
  }

  if (rows.length === 0) {
    if (
      lastError &&
      !isTableMissingError(lastError) &&
      !isColumnError(lastError)
    ) {
      log.warn?.(
        'admin-livreurs/localisations history fetch warning',
        lastError
      )
    }

    return new Map()
  }

  rows.sort((a, b) => {
    const dateA = toDate(a?.captured_at || a?.created_at)
    const dateB = toDate(b?.captured_at || b?.created_at)

    const timeA = dateA ? dateA.getTime() : 0
    const timeB = dateB ? dateB.getTime() : 0

    return timeB - timeA
  })

  const map = new Map<string, any>()

  for (const row of rows) {
    const id = String(row?.livreur_id || '')
    if (!id) continue

    if (!map.has(id)) {
      map.set(id, row)
    }
  }

  return map
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MERGE HISTORIQUE                                               */
/* ═══════════════════════════════════════════════════════════════ */

function mergeHistory(row: any, history: any): any {
  if (!history) return row

  const historyHasCoords = hasCoordinates(history)
  if (!historyHasCoords) return row

  const rowHasCoords = hasCoordinates(row)

  const historyDate = toDate(history?.captured_at || history?.created_at)
  const rowDate = toDate(getTimestampValue(row))

  const shouldUseHistory =
    !rowHasCoords ||
    (historyDate && (!rowDate || historyDate > rowDate))

  if (!shouldUseHistory) return row

  return {
    ...row,
    latitude: history.latitude,
    longitude: history.longitude,
    precision_m: history.precision_m ?? row?.precision_m ?? null,
    speed_kmh: history.speed_kmh ?? row?.speed_kmh ?? null,
    heading_deg: history.heading_deg ?? row?.heading_deg ?? null,
    altitude_m: history.altitude_m ?? row?.altitude_m ?? null,
    location_updated_at:
      history.captured_at || history.created_at || row?.location_updated_at,
    location_source: history.source || row?.location_source || 'history',
    location_metadata: history.metadata ?? row?.location_metadata ?? {},
    _used_history: true,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeLocation(
  row: any,
  maxAgeSeconds: number,
  includeStale: boolean
): LivreurLocation | null {
  const id = String(row?.id || '')
  if (!id) return null

  const latitude = toNullableNumber(row?.latitude)
  const longitude = toNullableNumber(row?.longitude)

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }

  const timestampValue = getTimestampValue(row)
  const timestampDate = toDate(timestampValue)

  const ageSeconds = timestampDate
    ? Math.max(0, Math.floor((Date.now() - timestampDate.getTime()) / 1000))
    : null

  const isFresh = ageSeconds !== null && ageSeconds <= maxAgeSeconds

  if (!includeStale && !isFresh) {
    return null
  }

  const prenom = textOrNull(row?.prenom) || ''
  const nom = textOrNull(row?.nom) || ''
  const email = textOrNull(row?.email) || ''

  const displayName =
    [prenom, nom].filter(Boolean).join(' ').trim() ||
    email ||
    `Livreur ${id.slice(0, 8)}`

  return {
    id,
    nom,
    prenom,
    display_name: displayName,
    email,
    telephone: textOrNull(row?.telephone),
    zone: textOrNull(row?.zone_operation_principale),
    est_actif: toBool(row?.est_actif, true),
    est_disponible: toBool(row?.est_disponible, false),
    latitude,
    longitude,
    accuracy_m: toNullableNumber(row?.precision_m),
    speed_kmh: toNullableNumber(row?.speed_kmh),
    heading_deg: toNullableNumber(row?.heading_deg),
    altitude_m: toNullableNumber(row?.altitude_m),
    captured_at: textOrNull(row?.captured_at),
    location_updated_at: timestampValue,
    source: textOrNull(row?.location_source || row?.source) || 'unknown',
    metadata: safeJsonObject(row?.location_metadata ?? row?.metadata),
    age_seconds: ageSeconds,
    is_fresh: isFresh,
    used_history: Boolean(row?._used_history),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATS                                                          */
/* ═══════════════════════════════════════════════════════════════ */

function buildStats(
  items: LivreurLocation[],
  fetchedCount: number
): LocationsStats {
  const zoneMap = new Map<string, { total: number; fresh: number }>()

  let fresh = 0
  let active = 0
  let available = 0

  for (const item of items) {
    if (item.is_fresh) fresh += 1
    if (item.est_actif) active += 1
    if (item.est_disponible) available += 1

    const zone = item.zone || 'Non définie'
    const current = zoneMap.get(zone) || { total: 0, fresh: 0 }

    current.total += 1
    if (item.is_fresh) current.fresh += 1

    zoneMap.set(zone, current)
  }

  const by_zone: ZoneStat[] = Array.from(zoneMap.entries())
    .map(([zone, value]) => ({
      zone,
      total: value.total,
      fresh: value.fresh,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    fetched: fetchedCount,
    located: items.length,
    fresh,
    stale: items.length - fresh,
    active,
    available,
    by_zone,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GEOJSON                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toGeoJson(items: LivreurLocation[]) {
  return {
    type: 'FeatureCollection',
    features: items.map((item) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [item.longitude, item.latitude],
      },
      properties: {
        id: item.id,
        display_name: item.display_name,
        email: item.email,
        telephone: item.telephone,
        zone: item.zone,
        est_actif: item.est_actif,
        est_disponible: item.est_disponible,
        accuracy_m: item.accuracy_m,
        speed_kmh: item.speed_kmh,
        heading_deg: item.heading_deg,
        altitude_m: item.altitude_m,
        location_updated_at: item.location_updated_at,
        source: item.source,
        age_seconds: item.age_seconds,
        is_fresh: item.is_fresh,
        used_history: item.used_history,
      },
    })),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Localisations groupées                                   */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const limited = rateLimitResponse(request, 'get', 60)
  if (limited) return limited

  const denied = await guardAdmin()
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse(
      Object.fromEntries(searchParams.entries())
    )

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Paramètres de requête invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const input = parsed.data

    const activeOnly = boolParam(input.active_only)
    const availableOnly = boolParam(input.available_only)
    const includeStale = boolParam(input.include_stale)
    const includeHistory = boolParam(input.include_history)

    const zone = sanitizeLike(input.zone)
    const search = sanitizeLike(input.search)

    const maxAgeMinutes = Math.max(1, input.max_age_minutes)
    const maxAgeSeconds = maxAgeMinutes * 60

    const responseLimit = Math.max(1, Math.min(1000, input.limit))

    // On récupère parfois plus que la limite finale,
    // parce que certains résultats peuvent être filtrés pour fraîcheur.
    const fetchLimit = Math.min(1000, responseLimit * 2)

    const supabase = await getSupabaseAdmin()

    if (!supabase || typeof supabase.from !== 'function') {
      return NextResponse.json(
        {
          error: 'Configuration Supabase invalide côté serveur.',
          code: 'SUPABASE_CLIENT_ERROR',
        },
        { status: 500 }
      )
    }

    let rows: any[] = []

    try {
      rows = await fetchLivreurs(supabase, {
        activeOnly,
        availableOnly,
        zone,
        search,
        limit: fetchLimit,
      })
    } catch (error: any) {
      if (isTableMissingError(error)) {
        return NextResponse.json(
          {
            error:
              'La table public.livreurs est introuvable. Exécute la migration SQL nécessaire.',
            code: 'TABLE_MISSING',
            details: errorMessage(error, 'Table manquante'),
          },
          { status: 503 }
        )
      }

      log.error?.('Crash GET /api/admin/livreurs/localisations fetch', error)

      return NextResponse.json(
        {
          error:
            'Erreur serveur interne lors du chargement des localisations.',
          code: 'INTERNAL_ERROR',
          details:
            process.env.NODE_ENV === 'development'
              ? errorMessage(error, 'Erreur inconnue')
              : undefined,
        },
        { status: 500 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Complétion historique optionnelle                             */
    /* ------------------------------------------------------------ */

    let historyMap = new Map<string, any>()

    if (includeHistory && rows.length > 0) {
      const needHistoryIds = rows
        .filter(
          (row) =>
            !hasCoordinates(row) || isStaleRow(row, maxAgeSeconds)
        )
        .map((row) => String(row?.id || ''))
        .filter(Boolean)

      if (needHistoryIds.length > 0) {
        historyMap = await fetchLatestHistory(supabase, needHistoryIds)
      }
    }

    const enrichedRows = rows.map((row) => {
      const id = String(row?.id || '')
      const history = id ? historyMap.get(id) : undefined
      return mergeHistory(row, history)
    })

    /* ------------------------------------------------------------ */
    /* Normalisation + filtrage fraîcheur                            */
    /* ------------------------------------------------------------ */

    let items = enrichedRows
      .map((row) => normalizeLocation(row, maxAgeSeconds, includeStale))
      .filter(Boolean) as LivreurLocation[]

    items.sort((a, b) => {
      const dateA = toDate(a.location_updated_at)
      const dateB = toDate(b.location_updated_at)

      const timeA = dateA ? dateA.getTime() : 0
      const timeB = dateB ? dateB.getTime() : 0

      return timeB - timeA
    })

    items = items.slice(0, responseLimit)

    const stats = buildStats(items, rows.length)

    /* ------------------------------------------------------------ */
    /* Réponse GeoJSON                                               */
    /* ------------------------------------------------------------ */

    if (input.format === 'geojson') {
      const geoJson = toGeoJson(items)

      const response = NextResponse.json(geoJson)
      response.headers.set('Cache-Control', 'private, no-store')
      response.headers.set('X-Content-Type-Options', 'nosniff')

      return response
    }

    /* ------------------------------------------------------------ */
    /* Réponse JSON standard                                         */
    /* ------------------------------------------------------------ */

    const response = NextResponse.json({
      success: true,
      count: items.length,
      data: items,
      meta: {
        generated_at: nowIso(),
        filters: {
          active_only: activeOnly,
          available_only: availableOnly,
          include_stale: includeStale,
          include_history: includeHistory,
          zone: zone || null,
          search: search || null,
          max_age_minutes: maxAgeMinutes,
          limit: responseLimit,
          format: input.format,
        },
        stats,
      },
    })

    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')

    return response
  } catch (error: any) {
    log.error?.('Crash GET /api/admin/livreurs/localisations', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors du chargement des localisations.',
        code: 'INTERNAL_ERROR',
        details:
          process.env.NODE_ENV === 'development'
            ? errorMessage(error, 'Erreur inconnue')
            : undefined,
      },
      { status: 500 }
    )
  }
}