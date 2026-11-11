// app/api/admin/livreurs/[id]/disponibilite/route.ts
// ============================================================================
// API Admin – Disponibilité d'un livreur
// Version complète, sécurisée et sans wallet / portefeuille / solde / retrait.
//
// Endpoints :
// - GET    /api/admin/livreurs/:id/disponibilite
// - POST   /api/admin/livreurs/:id/disponibilite
// - PUT    /api/admin/livreurs/:id/disponibilite
// - PATCH  /api/admin/livreurs/:id/disponibilite
//
// Payload attendu pour mise à jour :
// {
//   "est_disponible": true
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

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
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

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'oui', 'yes', 'on', 'disponible', 'active', 'actif'].includes(str)) {
    return true
  }

  if (['false', 'non', 'no', 'off', 'indisponible', 'inactive', 'inactif'].includes(str)) {
    return false
  }

  return fallback
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
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
    id: `admin-livreurs-disponibilite-${scope}:${ip}`,
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

const availabilitySchema = z
  .object({
    est_disponible: z.boolean().optional(),
    disponible: z.boolean().optional(),
    is_available: z.boolean().optional(),
    available: z.boolean().optional(),
  })
  .passthrough()
  .transform((data) => {
    const value =
      data.est_disponible ??
      data.disponible ??
      data.is_available ??
      data.available

    if (value === undefined) {
      return {
        valid: false as const,
        est_disponible: null,
      }
    }

    return {
      valid: true as const,
      est_disponible: toBool(value, false),
    }
  })

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface AvailabilityResponse {
  id: string
  est_disponible: boolean
  derniere_activite: string | null
  updated_at: string | null
}

function normalizeAvailability(row: any): AvailabilityResponse {
  return {
    id: String(row?.id || ''),
    est_disponible: toBool(row?.est_disponible, false),
    derniere_activite: textOrNull(row?.derniere_activite),
    updated_at: textOrNull(row?.updated_at),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UPDATE TOLÉRANT                                                */
/* ═══════════════════════════════════════════════════════════════ */

async function updateAvailabilityWithFallback(
  supabase: any,
  id: string,
  est_disponible: boolean
): Promise<{ data: any | null; error: any | null }> {
  const payloads = [
    {
      est_disponible,
      updated_at: nowIso(),
    },
    {
      est_disponible,
    },
  ]

  let lastError: any = null

  for (const payload of payloads) {
    const { data, error } = await supabase
      .from(LIVREURS_TABLE)
      .update(payload)
      .eq('id', id)
      .select('id, est_disponible, derniere_activite, updated_at')
      .maybeSingle()

    if (!error) {
      return { data, error: null }
    }

    lastError = error

    if (isColumnError(error)) {
      const missingColumn = extractMissingColumn(errorMessage(error, ''))

      // Si la colonne manquante est updated_at, on réessaie sans updated_at.
      if (missingColumn === 'updated_at') {
        continue
      }

      // Si la colonne manquante est est_disponible, on ne peut pas continuer.
      if (missingColumn === 'est_disponible') {
        return { data: null, error }
      }
    }

    break
  }

  return { data: null, error: lastError }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Lire la disponibilité actuelle                           */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(
  request: Request,
  context: { params: any }
) {
  const limited = rateLimitResponse(request, 'get', 60)
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

    const { data: livreur, error } = await supabase
      .from(LIVREURS_TABLE)
      .select('id, est_disponible, derniere_activite, updated_at')
      .eq('id', id)
      .maybeSingle()

    if (error) {
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

      throw error
    }

    if (!livreur) {
      return NextResponse.json(
        {
          error: 'Livreur introuvable.',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: normalizeAvailability(livreur),
      generated_at: nowIso(),
    })
  } catch (error: any) {
    log.error?.('Crash GET /api/admin/livreurs/[id]/disponibilite', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors de la lecture de la disponibilité.',
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
/*  POST / PUT / PATCH – Mettre à jour la disponibilité            */
/* ═══════════════════════════════════════════════════════════════ */

async function handleUpdateAvailability(
  request: Request,
  context: { params: any },
  methodLabel: 'POST' | 'PUT' | 'PATCH'
) {
  const limited = rateLimitResponse(request, methodLabel.toLowerCase(), 30)
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

    const parsedBody = availabilitySchema.safeParse(body)

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Données invalides.',
          code: 'VALIDATION_ERROR',
          details: parsedBody.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const result = parsedBody.data

    if (!result.valid || result.est_disponible === null) {
      return NextResponse.json(
        {
          error: 'Le champ est_disponible est requis.',
          code: 'MISSING_AVAILABILITY',
          expected: {
            est_disponible: true,
          },
        },
        { status: 400 }
      )
    }

    const est_disponible = result.est_disponible

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

    /* ------------------------------------------------------------ */
    /* Vérification existence                                        */
    /* ------------------------------------------------------------ */

    const { data: existing, error: existingError } = await supabase
      .from(LIVREURS_TABLE)
      .select('id, est_disponible')
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

    /* ------------------------------------------------------------ */
    /* Mise à jour                                                   */
    /* ------------------------------------------------------------ */

    const { data: updated, error: updateError } =
      await updateAvailabilityWithFallback(supabase, id, est_disponible)

    if (updateError) {
      if (isColumnError(updateError)) {
        return NextResponse.json(
          {
            error:
              'La colonne est_disponible est introuvable dans la table public.livreurs.',
            code: 'COLUMN_MISSING',
            details: errorMessage(updateError, 'Colonne manquante'),
          },
          { status: 503 }
        )
      }

      throw updateError
    }

    const data = updated
      ? normalizeAvailability(updated)
      : {
          id,
          est_disponible,
          derniere_activite: textOrNull(existing?.derniere_activite),
          updated_at: nowIso(),
        }

    log.info?.(`Disponibilité livreur mise à jour via ${methodLabel}`, {
      livreurId: id,
      est_disponible,
    })

    return NextResponse.json({
      success: true,
      message: est_disponible
        ? 'Livreur marqué comme disponible.'
        : 'Livreur marqué comme indisponible.',
      data,
      generated_at: nowIso(),
    })
  } catch (error: any) {
    log.error?.(`Crash ${methodLabel} /api/admin/livreurs/[id]/disponibilite`, error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors de la mise à jour de la disponibilité.',
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
  return handleUpdateAvailability(request, context, 'POST')
}

export async function PUT(
  request: Request,
  context: { params: any }
) {
  return handleUpdateAvailability(request, context, 'PUT')
}

export async function PATCH(
  request: Request,
  context: { params: any }
) {
  return handleUpdateAvailability(request, context, 'PATCH')
}