// app/api/admin/livreurs/[id]/localisation/route.ts
// ============================================================================
// API Admin – Localisation d'un livreur
// Version complète, sécurisée et sans wallet / portefeuille / solde / retrait.
//
// Endpoints :
// - GET    /api/admin/livreurs/:id/localisation
// - POST   /api/admin/livreurs/:id/localisation
// - PUT    /api/admin/livreurs/:id/localisation
// - PATCH  /api/admin/livreurs/:id/localisation
//
// Payload attendu pour mise à jour :
// {
//   "latitude": -4.3217,
//   "longitude": 15.3125,
//   "precision_m": 20,
//   "speed_kmh": 18.5,
//   "heading_deg": 90,
//   "altitude_m": 250,
//   "captured_at": "2026-10-25T08:00:00.000Z",
//   "source": "app",
//   "metadata": {}
// }
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

function extractMissingColumn(message: string): string | null {
  const patterns = [
    /column\s+"([^"]+)"/i,
    /column\s+([a-zA-Z0-9_]+)/i,
    /could not find .*?["']([a-zA-Z0-9_]+)["']/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

function isUuid(value: unknown): boolean {
  return typeof value === 'string' && z.string().uuid().safeParse(value).success
}

async function resolveRouteId(params: any): Promise<string | null> {
  try {
    const resolved = await params
    if (resolved && typeof resolved.id === 'string') return resolved.id
  } catch {
    // params peut déjà être un objet selon la version de Next.js
  }

  if (params && typeof params.id === 'string') return params.id

  return null
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
    id: `admin-livreurs-localisation-${scope}:${ip}`,
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
/*  SCHÉMAS ZOD                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const idSchema = z.string().uuid('ID de livreur invalide')

const locationSchema = z.object({
  latitude: z.coerce
    .number({ invalid_type_error: 'Latitude invalide' })
    .min(-90, 'Latitude invalide')
    .max(90, 'Latitude invalide'),

  longitude: z.coerce
    .number({ invalid_type_error: 'Longitude invalide' })
    .min(-180, 'Longitude invalide')
    .max(180, 'Longitude invalide'),

  precision_m: z.coerce
    .number()
    .min(0, 'Précision invalide')
    .max(10000, 'Précision invalide')
    .optional()
    .default(0),

  speed_kmh: z
    .union([
      z.coerce.number().min(0, 'Vitesse invalide').max(200, 'Vitesse invalide'),
      z.null(),
    ])
    .optional()
    .default(null),

  heading_deg: z
    .union([
      z.coerce.number().min(0, 'Cap invalide').max(360, 'Cap invalide'),
      z.null(),
    ])
    .optional()
    .default(null),

  altitude_m: z
    .union([
      z.coerce
        .number()
        .min(-500, 'Altitude invalide')
        .max(10000, 'Altitude invalide'),
      z.null(),
    ])
    .optional()
    .default(null),

  captured_at: z
    .union([z.string().datetime({ offset: true }), z.null()])
    .optional()
    .default(null),

  source: z
    .enum(['admin', 'app', 'gps', 'manual'])
    .optional()
    .default('admin'),

  metadata: z
    .record(z.string(), z.any())
    .optional()
    .default({}),
})

type LocationInput = z.output<typeof locationSchema>

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface NormalizedLocation {
  id: string
  latitude: number
  longitude: number
  precision_m: number | null
  speed_kmh: number | null
  heading_deg: number | null
  altitude_m: number | null
  location_updated_at: string | null
  captured_at: string | null
  source: string | null
  metadata: Record<string, any>
}

function normalizeLocation(row: any): NormalizedLocation | null {
  if (!row) return null

  const latitude = toNullableNumber(row.latitude)
  const longitude = toNullableNumber(row.longitude)

  if (latitude === null || longitude === null) return null

  return {
    id: String(row.id || ''),
    latitude,
    longitude,

    precision_m: toNullableNumber(row.precision_m),
    speed_kmh: toNullableNumber(row.speed_kmh),
    heading_deg: toNullableNumber(row.heading_deg),
    altitude_m: toNullableNumber(row.altitude_m),

    location_updated_at: textOrNull(
      row.location_updated_at || row.updated_at || row.captured_at
    ),

    captured_at: textOrNull(row.captured_at || row.location_updated_at),

    source: textOrNull(row.location_source || row.source) || 'unknown',

    metadata: safeJsonObject(
      row.location_metadata ?? row.metadata ?? {}
    ),
  }
}

function normalizeLocationFromInput(
  id: string,
  input: LocationInput
): NormalizedLocation {
  const capturedAt = input.captured_at || nowIso()

  return {
    id,
    latitude: input.latitude,
    longitude: input.longitude,
    precision_m: input.precision_m ?? null,
    speed_kmh: input.speed_kmh ?? null,
    heading_deg: input.heading_deg ?? null,
    altitude_m: input.altitude_m ?? null,
    location_updated_at: capturedAt,
    captured_at: capturedAt,
    source: input.source || 'admin',
    metadata: input.metadata || {},
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  EXTRACTION PAYLOAD                                             */
/* ═══════════════════════════════════════════════════════════════ */

function extractLocationPayload(body: any): unknown {
  if (!body || typeof body !== 'object') return body

  if (body.location && typeof body.location === 'object') {
    return body.location
  }

  if (body.updates && typeof body.updates === 'object') {
    return body.updates
  }

  const clone = { ...body }
  delete clone.id
  delete clone.livreurId
  delete clone.livreur_id

  return clone
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UPDATE TOLÉRANT                                                */
/* ═══════════════════════════════════════════════════════════════ */

const CRITICAL_LOCATION_COLUMNS = new Set(['latitude', 'longitude'])

async function updateLocationWithFallback(
  supabase: any,
  id: string,
  payload: Record<string, unknown>
): Promise<{ data: any | null; error: any | null }> {
  let currentPayload = { ...payload }
  let lastError: any = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (Object.keys(currentPayload).length === 0) {
      return {
        data: null,
        error: {
          message: 'Aucune colonne de localisation disponible pour la mise à jour.',
          code: 'EMPTY_UPDATE',
        },
      }
    }

    const { data, error } = await supabase
      .from(LIVREURS_TABLE)
      .update(currentPayload)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (!error) {
      return { data, error: null }
    }

    lastError = error

    if (isColumnError(error)) {
      const missingColumn = extractMissingColumn(errorMessage(error, ''))

      if (missingColumn && missingColumn in currentPayload) {
        if (CRITICAL_LOCATION_COLUMNS.has(missingColumn)) {
          return {
            data: null,
            error: {
              message: `La colonne obligatoire "${missingColumn}" est absente de la table public.livreurs.`,
              code: 'COLUMN_MISSING',
              column: missingColumn,
            },
          }
        }

        delete currentPayload[missingColumn]
        continue
      }
    }

    break
  }

  return { data: null, error: lastError }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HISTORIQUE BEST-EFFORT                                         */
/* ═══════════════════════════════════════════════════════════════ */

async function insertHistoryBestEffort(
  supabase: any,
  livreurId: string,
  input: LocationInput
): Promise<void> {
  const capturedAt = input.captured_at || nowIso()

  const fullPayload = {
    livreur_id: livreurId,
    latitude: input.latitude,
    longitude: input.longitude,
    precision_m: input.precision_m ?? null,
    speed_kmh: input.speed_kmh ?? null,
    heading_deg: input.heading_deg ?? null,
    altitude_m: input.altitude_m ?? null,
    source: input.source || 'admin',
    metadata: input.metadata || {},
    captured_at: capturedAt,
    created_at: nowIso(),
  }

  const minimalPayload = {
    livreur_id: livreurId,
    latitude: input.latitude,
    longitude: input.longitude,
    captured_at: capturedAt,
    created_at: nowIso(),
  }

  const payloads = [fullPayload, minimalPayload]

  for (const payload of payloads) {
    try {
      const { error } = await supabase
        .from(HISTORY_TABLE)
        .insert(payload)

      if (!error) return

      if (isTableMissingError(error)) {
        return
      }

      if (isColumnError(error)) {
        continue
      }

      log.warn?.(
        'admin-livreurs/[id]/localisation history insert warning',
        error
      )
      return
    } catch (err) {
      log.warn?.(
        'admin-livreurs/[id]/localisation history insert exception',
        err
      )
      return
    }
  }
}

async function fetchLatestHistory(
  supabase: any,
  livreurId: string
): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from(HISTORY_TABLE)
      .select('*')
      .eq('livreur_id', livreurId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      if (!isTableMissingError(error) && !isColumnError(error)) {
        log.warn?.(
          'admin-livreurs/[id]/localisation history fetch warning',
          error
        )
      }

      return null
    }

    return data
  } catch (err) {
    log.warn?.(
      'admin-livreurs/[id]/localisation history fetch exception',
      err
    )

    return null
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Lire la localisation actuelle                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(
  request: Request,
  context: { params: any }
) {
  const limited = rateLimitResponse(request, 'get', 120)
  if (limited) return limited

  const denied = await guardAdmin()
  if (denied) return denied

  try {
    const rawId = await resolveRouteId(context.params)
    const parsedId = idSchema.safeParse(rawId)

    if (!parsedId.success) {
      return NextResponse.json(
        {
          error: 'ID de livreur invalide.',
          code: 'INVALID_ID',
          details: parsedId.error.flatten(),
        },
        { status: 400 }
      )
    }

    const id = parsedId.data
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

    const { data: existing, error: existingError } = await supabase
      .from(LIVREURS_TABLE)
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      if (isTableMissingError(existingError)) {
        return NextResponse.json(
          {
            error:
              'La table public.livreurs est introuvable. Exécute la migration SQL nécessaire.',
            code: 'TABLE_MISSING',
            details: errorMessage(existingError, 'Table manquante'),
          },
          { status: 503 }
        )
      }

      throw existingError
    }

    if (!existing) {
      return NextResponse.json(
        {
          error: 'Livreur introuvable.',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      )
    }

    const { data: currentRow, error: currentError } = await supabase
      .from(LIVREURS_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (currentError) {
      if (isTableMissingError(currentError)) {
        return NextResponse.json(
          {
            error:
              'La table public.livreurs est introuvable. Exécute la migration SQL nécessaire.',
            code: 'TABLE_MISSING',
            details: errorMessage(currentError, 'Table manquante'),
          },
          { status: 503 }
        )
      }

      throw currentError
    }

    let location = normalizeLocation(currentRow)

    if (!location) {
      const historyRow = await fetchLatestHistory(supabase, id)
      location = normalizeLocation(historyRow)
    }

    return NextResponse.json({
      success: true,
      has_location: Boolean(location),
      data: location,
      generated_at: nowIso(),
    })
  } catch (error: any) {
    log.error?.('Crash GET /api/admin/livreurs/[id]/localisation', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors de la lecture de la localisation.',
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

/* ═══════════════════════════════════════════════════════════════ */
/*  POST / PUT / PATCH – Mettre à jour la localisation             */
/* ═══════════════════════════════════════════════════════════════ */

async function handleUpdateLocation(
  request: Request,
  context: { params: any },
  methodLabel: 'POST' | 'PUT' | 'PATCH'
) {
  const limited = rateLimitResponse(request, methodLabel.toLowerCase(), 60)
  if (limited) return limited

  const denied = await guardAdmin()
  if (denied) return denied

  try {
    const rawId = await resolveRouteId(context.params)
    const parsedId = idSchema.safeParse(rawId)

    if (!parsedId.success) {
      return NextResponse.json(
        {
          error: 'ID de livreur invalide.',
          code: 'INVALID_ID',
          details: parsedId.error.flatten(),
        },
        { status: 400 }
      )
    }

    const id = parsedId.data

    let body: any

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          error: 'Corps de requête JSON invalide.',
          code: 'INVALID_JSON',
        },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        {
          error: 'Corps de requête invalide.',
          code: 'INVALID_BODY',
        },
        { status: 400 }
      )
    }

    const rawPayload = extractLocationPayload(body)

    const parsedLocation = locationSchema.safeParse(rawPayload)

    if (!parsedLocation.success) {
      return NextResponse.json(
        {
          error: 'Données de localisation invalides.',
          code: 'VALIDATION_ERROR',
          details: parsedLocation.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const input = parsedLocation.data
    const capturedAt = input.captured_at || nowIso()

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

    const { data: existing, error: existingError } = await supabase
      .from(LIVREURS_TABLE)
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      if (isTableMissingError(existingError)) {
        return NextResponse.json(
          {
            error:
              'La table public.livreurs est introuvable. Exécute la migration SQL nécessaire.',
            code: 'TABLE_MISSING',
            details: errorMessage(existingError, 'Table manquante'),
          },
          { status: 503 }
        )
      }

      throw existingError
    }

    if (!existing) {
      return NextResponse.json(
        {
          error: 'Livreur introuvable.',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      )
    }

    const updatePayload: Record<string, unknown> = {
      latitude: input.latitude,
      longitude: input.longitude,
      precision_m: input.precision_m ?? 0,
      speed_kmh: input.speed_kmh ?? null,
      heading_deg: input.heading_deg ?? null,
      altitude_m: input.altitude_m ?? null,
      location_updated_at: capturedAt,
      location_source: input.source || 'admin',
      location_metadata: input.metadata || {},
      updated_at: nowIso(),
    }

    const { data: updatedRow, error: updateError } =
      await updateLocationWithFallback(supabase, id, updatePayload)

    if (updateError) {
      if (updateError.code === 'COLUMN_MISSING') {
        return NextResponse.json(
          {
            error:
              'Certaines colonnes de localisation sont manquantes dans la table public.livreurs. Exécute la migration SQL nécessaire.',
            code: 'COLUMN_MISSING',
            details: updateError.message,
          },
          { status: 503 }
        )
      }

      if (updateError.code === 'EMPTY_UPDATE') {
        return NextResponse.json(
          {
            error:
              'Aucune colonne de localisation n’est disponible pour enregistrer cette position.',
            code: 'EMPTY_UPDATE',
          },
          { status: 503 }
        )
      }

      throw updateError
    }

    await insertHistoryBestEffort(supabase, id, input)

    let finalRow = updatedRow

    if (!finalRow) {
      const { data: refetched, error: refetchError } = await supabase
        .from(LIVREURS_TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (refetchError) {
        log.warn?.(
          'admin-livreurs/[id]/localisation refetch warning',
          refetchError
        )
      } else {
        finalRow = refetched
      }
    }

    const location =
      normalizeLocation(finalRow) ?? normalizeLocationFromInput(id, input)

    log.info?.(`Localisation livreur mise à jour via ${methodLabel}`, {
      livreurId: id,
      latitude: location.latitude,
      longitude: location.longitude,
      source: location.source,
    })

    return NextResponse.json({
      success: true,
      message: 'Localisation mise à jour avec succès.',
      data: location,
      generated_at: nowIso(),
    })
  } catch (error: any) {
    log.error?.(
      `Crash ${methodLabel} /api/admin/livreurs/[id]/localisation`,
      error
    )

    return NextResponse.json(
      {
        error:
          'Erreur serveur interne lors de la mise à jour de la localisation.',
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

export async function POST(
  request: Request,
  context: { params: any }
) {
  return handleUpdateLocation(request, context, 'POST')
}

export async function PUT(
  request: Request,
  context: { params: any }
) {
  return handleUpdateLocation(request, context, 'PUT')
}

export async function PATCH(
  request: Request,
  context: { params: any }
) {
  return handleUpdateLocation(request, context, 'PATCH')
}