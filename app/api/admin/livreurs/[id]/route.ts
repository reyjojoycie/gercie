// app/api/admin/livreurs/[id]/route.ts
// ============================================================================
// API Admin – Détail / mise à jour / suppression d'un livreur
// Version complète, sécurisée, tolérante et sans wallet / portefeuille / retrait.
//
// Endpoints :
// - GET    /api/admin/livreurs/:id
// - PUT    /api/admin/livreurs/:id
// - PATCH  /api/admin/livreurs/:id
// - DELETE /api/admin/livreurs/:id?mode=hard|soft&detach_profile=true|false
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
const PROFILES_TABLE = 'profiles'

const log = (logger as any) || console

const UPDATE_FIELDS = [
  'nom',
  'prenom',
  'email',
  'telephone',
  'moto_modele',
  'moto_plaque',
  'zone_operation_principale',
  'photo_url',
  'est_actif',
  'est_disponible',
  'total_livraisons',
  'distance_parcourue_km',
  'note_moyenne',
  'derniere_activite',
] as const

type UpdateField = (typeof UPDATE_FIELDS)[number]

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
  if (value === 0 || value === 'false') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'actif', 'active', 'oui', 'yes', 'on'].includes(str)) return true
  if (['false', 'inactif', 'inactive', 'non', 'no', 'off'].includes(str))
    return false

  return fallback
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function normalizePhone(value: unknown): string | null {
  const raw = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[-.]/g, '')

  if (!raw) return null

  if (/^\+243[1-9][0-9]{8}$/.test(raw)) return raw
  if (/^243[1-9][0-9]{8}$/.test(raw)) return `+${raw}`
  if (/^0[1-9][0-9]{8}$/.test(raw)) return `+243${raw.slice(1)}`

  return raw
}

function isValidPhone(value: unknown): boolean {
  const raw = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[-.]/g, '')

  if (!raw) return true

  return (
    /^\+243[1-9][0-9]{8}$/.test(raw) ||
    /^243[1-9][0-9]{8}$/.test(raw) ||
    /^0[1-9][0-9]{8}$/.test(raw)
  )
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

function isDuplicateError(error: any): boolean {
  return error?.code === '23505'
}

function isForeignKeyError(error: any): boolean {
  return error?.code === '23503'
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
    id: `admin-livreurs-${scope}:${ip}`,
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

const optionalText = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null || value === undefined) return null
    const str = String(value).trim()
    return str ? str : null
  })
  .optional()

const optionalPhone = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null || value === undefined) return null

    const str = String(value).trim()
    if (!str) return null

    return normalizePhone(str)
  })
  .refine((value) => value === null || isValidPhone(value), {
    message:
      'Numéro invalide. Format attendu : 08xxxxxxxx ou +2438xxxxxxxx.',
  })
  .optional()

const optionalUrl = z
  .union([z.string().url('URL invalide'), z.literal(''), z.null()])
  .transform((value) => {
    if (value === null || value === undefined) return null

    const str = String(value).trim()
    return str ? str : null
  })
  .optional()

const optionalDatetime = z
  .union([z.string().datetime({ offset: true }), z.literal(''), z.null()])
  .transform((value) => {
    if (value === null || value === undefined) return null

    const str = String(value).trim()
    return str ? str : null
  })
  .optional()

const updateLivreurSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, 'Nom requis')
    .max(100, 'Nom trop long')
    .optional(),

  prenom: z
    .string()
    .trim()
    .min(1, 'Prénom requis')
    .max(100, 'Prénom trop long')
    .optional(),

  email: z
    .string()
    .trim()
    .email('Email invalide')
    .max(190, 'Email trop long')
    .optional()
    .transform((value) => (value ? value.toLowerCase() : undefined)),

  telephone: optionalPhone,

  moto_modele: optionalText,
  moto_plaque: optionalText,
  zone_operation_principale: optionalText,
  photo_url: optionalUrl,

  est_actif: z.boolean().optional(),
  est_disponible: z.boolean().optional(),

  total_livraisons: z.coerce
    .number()
    .int()
    .min(0, 'Nombre de livraisons invalide')
    .optional(),

  distance_parcourue_km: z.coerce
    .number()
    .min(0, 'Distance invalide')
    .optional(),

  note_moyenne: z
    .union([z.coerce.number().min(0).max(5), z.null()])
    .optional(),

  derniere_activite: optionalDatetime,
})

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface NormalizedLivreur {
  id: string
  user_id: string
  nom: string
  prenom: string
  email: string
  telephone: string | null
  est_actif: boolean
  est_disponible: boolean
  total_livraisons: number
  distance_parcourue_km: number
  derniere_activite: string | null
  zone_operation_principale: string | null
  photo_url: string | null
  moto_modele: string | null
  moto_plaque: string | null
  note_moyenne: number | null
  created_at: string | null
  updated_at: string | null
  profile?: {
    id: string
    email: string | null
    nom: string | null
    prenom: string | null
    telephone: string | null
    avatar_url: string | null
    role: string | null
    status: string | null
  } | null
}

function normalizeLivreur(row: any, profile?: any): NormalizedLivreur {
  return {
    id: String(row?.id || ''),
    user_id: String(row?.id || ''),
    nom: String(row?.nom || profile?.nom || '').trim(),
    prenom: String(row?.prenom || profile?.prenom || '').trim(),
    email: String(row?.email || profile?.email || '').trim().toLowerCase(),
    telephone: textOrNull(row?.telephone || profile?.telephone),

    est_actif: toBool(row?.est_actif, true),
    est_disponible: toBool(row?.est_disponible, false),

    total_livraisons: toNumber(row?.total_livraisons, 0),
    distance_parcourue_km: toNumber(row?.distance_parcourue_km, 0),

    derniere_activite: textOrNull(row?.derniere_activite),
    zone_operation_principale: textOrNull(row?.zone_operation_principale),

    photo_url: textOrNull(row?.photo_url || profile?.avatar_url),
    moto_modele: textOrNull(row?.moto_modele),
    moto_plaque: textOrNull(row?.moto_plaque),

    note_moyenne: toNullableNumber(row?.note_moyenne),

    created_at: textOrNull(row?.created_at),
    updated_at: textOrNull(row?.updated_at),

    profile: profile
      ? {
          id: String(profile.id || ''),
          email: textOrNull(profile.email),
          nom: textOrNull(profile.nom),
          prenom: textOrNull(profile.prenom),
          telephone: textOrNull(profile.telephone),
          avatar_url: textOrNull(profile.avatar_url),
          role: textOrNull(profile.role),
          status: textOrNull(profile.status),
        }
      : null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UPDATE AVEC FALLBACK COLONNES MANQUANTES                       */
/* ═══════════════════════════════════════════════════════════════ */

async function updateLivreurWithFallback(
  supabase: any,
  id: string,
  payload: Record<string, unknown>
): Promise<{ data: any | null; error: any | null }> {
  let currentPayload = { ...payload }
  let lastError: any = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from(LIVREURS_TABLE)
      .update(currentPayload)
      .eq('id', id)
      .select()
      .maybeSingle()

    if (!error) {
      return { data, error: null }
    }

    lastError = error

    if (isColumnError(error)) {
      const missingColumn = extractMissingColumn(errorMessage(error, ''))

      if (missingColumn && missingColumn in currentPayload) {
        delete currentPayload[missingColumn]
        continue
      }
    }

    break
  }

  return { data: null, error: lastError }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SYNC PROFILES BEST-EFFORT                                      */
/* ═══════════════════════════════════════════════════════════════ */

async function syncProfileBestEffort(
  supabase: any,
  livreurId: string,
  values: Record<string, any>
): Promise<void> {
  const profilePayload: Record<string, unknown> = {}

  if (values.nom !== undefined) profilePayload.nom = values.nom
  if (values.prenom !== undefined) profilePayload.prenom = values.prenom
  if (values.email !== undefined) profilePayload.email = values.email
  if (values.telephone !== undefined) profilePayload.telephone = values.telephone
  if (values.photo_url !== undefined) profilePayload.avatar_url = values.photo_url

  if (Object.keys(profilePayload).length === 0) return

  try {
    const { error } = await supabase
      .from(PROFILES_TABLE)
      .update(profilePayload)
      .eq('id', livreurId)

    if (error) {
      if (
        !isTableMissingError(error) &&
        !isColumnError(error) &&
        !isDuplicateError(error)
      ) {
        log.warn?.('admin-livreurs/[id] profile sync warning', error)
      }
    }
  } catch (err) {
    log.warn?.('admin-livreurs/[id] profile sync exception', err)
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Détail d'un livreur                                      */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(
  request: Request,
  context: { params: any }
) {
  const limited = rateLimitResponse(request, 'get-id', 60)
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
    const url = new URL(request.url)
    const includeProfile = url.searchParams.get('include_profile') !== 'false'

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

    const { data: livreur, error: livreurError } = await supabase
      .from(LIVREURS_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (livreurError) {
      if (isTableMissingError(livreurError)) {
        return NextResponse.json(
          {
            error:
              'La table public.livreurs est introuvable. Exécute la migration SQL nécessaire.',
            code: 'TABLE_MISSING',
            details: errorMessage(livreurError, 'Table manquante'),
          },
          { status: 503 }
        )
      }

      throw livreurError
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

    let profile: any = null

    if (includeProfile) {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from(PROFILES_TABLE)
          .select(
            'id, email, nom, prenom, telephone, avatar_url, role, status'
          )
          .eq('id', id)
          .maybeSingle()

        if (!profileError) {
          profile = profileData
        } else if (
          !isTableMissingError(profileError) &&
          !isColumnError(profileError)
        ) {
          log.warn?.('admin-livreurs/[id] GET profile enrichment warning', profileError)
        }
      } catch (profileErr) {
        log.warn?.('admin-livreurs/[id] GET profile enrichment exception', profileErr)
      }
    }

    const data = normalizeLivreur(livreur, profile)

    return NextResponse.json({
      success: true,
      data,
      generated_at: nowIso(),
    })
  } catch (error: any) {
    log.error?.('Crash GET /api/admin/livreurs/[id]', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors du chargement du livreur.',
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
/*  PUT / PATCH – Mise à jour d'un livreur                         */
/* ═══════════════════════════════════════════════════════════════ */

async function handleUpdate(
  request: Request,
  context: { params: any },
  methodLabel: 'PUT' | 'PATCH'
) {
  const limited = rateLimitResponse(request, `${methodLabel.toLowerCase()}-id`, 20)
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

    // Formats acceptés :
    // { updates: { ... } }
    // { ...champs }
    const candidate =
      body.updates && typeof body.updates === 'object' && !Array.isArray(body.updates)
        ? body.updates
        : (() => {
            const clone = { ...body }
            delete clone.id
            return clone
          })()

    const parsedUpdates = updateLivreurSchema.safeParse(candidate)

    if (!parsedUpdates.success) {
      return NextResponse.json(
        {
          error: 'Données de mise à jour invalides.',
          code: 'VALIDATION_ERROR',
          details: parsedUpdates.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const values = parsedUpdates.data as Record<string, any>

    const payload: Record<string, unknown> = {}

    for (const field of UPDATE_FIELDS) {
      if (values[field] !== undefined) {
        payload[field] = values[field]
      }
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        {
          error: 'Aucun champ valide à mettre à jour.',
          code: 'EMPTY_UPDATE',
        },
        { status: 400 }
      )
    }

    payload.updated_at = nowIso()

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

    // Vérification existence
    const { data: existing, error: existingError } = await supabase
      .from(LIVREURS_TABLE)
      .select('id, email')
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

    // Vérification email dupliqué dans profiles si email modifié
    if (values.email !== undefined && values.email !== null) {
      try {
        const { count, error: emailCountError } = await supabase
          .from(PROFILES_TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('email', values.email)
          .neq('id', id)

        if (!emailCountError && toNumber(count, 0) > 0) {
          return NextResponse.json(
            {
              error: 'Cet email est déjà utilisé par un autre compte.',
              code: 'DUPLICATE_EMAIL',
            },
            { status: 409 }
          )
        }
      } catch (emailCheckErr) {
        log.warn?.('admin-livreurs/[id] email duplicate check warning', emailCheckErr)
      }
    }

    // Mise à jour principale dans livreurs
    const { data: updatedLivreur, error: updateError } =
      await updateLivreurWithFallback(supabase, id, payload)

    if (updateError) {
      if (isDuplicateError(updateError)) {
        return NextResponse.json(
          {
            error: 'Cette valeur est déjà utilisée.',
            code: 'DUPLICATE',
            details: errorMessage(updateError, 'Doublon'),
          },
          { status: 409 }
        )
      }

      if (isForeignKeyError(updateError)) {
        return NextResponse.json(
          {
            error: 'Référence invalide.',
            code: 'FOREIGN_KEY_ERROR',
            details: errorMessage(updateError, 'Clé étrangère invalide'),
          },
          { status: 400 }
        )
      }

      throw updateError
    }

    // Synchronisation optionnelle avec profiles
    await syncProfileBestEffort(supabase, id, values)

    // Relecture finale si nécessaire
    let finalRow = updatedLivreur

    if (!finalRow) {
      const { data: refetched, error: refetchError } = await supabase
        .from(LIVREURS_TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (refetchError) {
        log.warn?.('admin-livreurs/[id] refetch warning', refetchError)
      } else {
        finalRow = refetched
      }
    }

    let profile: any = null

    try {
      const { data: profileData, error: profileError } = await supabase
        .from(PROFILES_TABLE)
        .select(
          'id, email, nom, prenom, telephone, avatar_url, role, status'
        )
        .eq('id', id)
        .maybeSingle()

      if (!profileError) {
        profile = profileData
      }
    } catch (profileErr) {
      log.warn?.('admin-livreurs/[id] final profile fetch warning', profileErr)
    }

    const data = finalRow
      ? normalizeLivreur(finalRow, profile)
      : normalizeLivreur(
          {
            id,
            ...payload,
          },
          profile
        )

    log.info?.(`Livreur ${id} mis à jour via ${methodLabel}`, {
      updatedFields: Object.keys(payload).filter((k) => k !== 'updated_at'),
    })

    return NextResponse.json({
      success: true,
      message: 'Livreur mis à jour avec succès.',
      data,
      generated_at: nowIso(),
    })
  } catch (error: any) {
    log.error?.(`Crash ${methodLabel} /api/admin/livreurs/[id]`, error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors de la mise à jour du livreur.',
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

export async function PUT(
  request: Request,
  context: { params: any }
) {
  return handleUpdate(request, context, 'PUT')
}

export async function PATCH(
  request: Request,
  context: { params: any }
) {
  return handleUpdate(request, context, 'PATCH')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE – Suppression dure ou douce                             */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(
  request: Request,
  context: { params: any }
) {
  const limited = rateLimitResponse(request, 'delete-id', 10)
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
    const url = new URL(request.url)

    const modeParam = (url.searchParams.get('mode') || 'hard').toLowerCase()
    const detachProfileParam = url.searchParams.get('detach_profile') === 'true'

    if (!['hard', 'soft'].includes(modeParam)) {
      return NextResponse.json(
        {
          error: 'Mode de suppression invalide. Utilise hard ou soft.',
          code: 'INVALID_MODE',
        },
        { status: 400 }
      )
    }

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
      .select('id, email')
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
    /* Soft delete : désactivation                                   */
    /* ------------------------------------------------------------ */

    if (modeParam === 'soft') {
      const { data: softUpdated, error: softError } =
        await updateLivreurWithFallback(supabase, id, {
          est_actif: false,
          est_disponible: false,
          updated_at: nowIso(),
        })

      if (softError) {
        throw softError
      }

      if (detachProfileParam) {
        try {
          await supabase
            .from(PROFILES_TABLE)
            .update({ type_user: 'acheteur' })
            .eq('id', id)
        } catch (detachErr) {
          log.warn?.('admin-livreurs/[id] soft delete detach profile warning', detachErr)
        }
      }

      log.info?.(`Livreur ${id} désactivé (soft delete)`, {
        email: existing.email || null,
      })

      return NextResponse.json({
        success: true,
        message: 'Livreur désactivé avec succès.',
        mode: 'soft',
        data: softUpdated ? normalizeLivreur(softUpdated) : null,
        generated_at: nowIso(),
      })
    }

    /* ------------------------------------------------------------ */
    /* Hard delete : suppression physique                            */
    /* ------------------------------------------------------------ */

    const { error: deleteError } = await supabase
      .from(LIVREURS_TABLE)
      .delete()
      .eq('id', id)

    if (deleteError) {
      if (isForeignKeyError(deleteError)) {
        return NextResponse.json(
          {
            error:
              'Impossible de supprimer ce livreur car il est référencé par d’autres données. Utilise mode=soft ou supprime d’abord les dépendances.',
            code: 'FOREIGN_KEY_CONSTRAINT',
            details: errorMessage(deleteError, 'Contrainte de clé étrangère'),
          },
          { status: 409 }
        )
      }

      throw deleteError
    }

    if (detachProfileParam) {
      try {
        await supabase
          .from(PROFILES_TABLE)
          .update({ type_user: 'acheteur' })
          .eq('id', id)
      } catch (detachErr) {
        log.warn?.('admin-livreurs/[id] hard delete detach profile warning', detachErr)
      }
    }

    log.info?.(`Livreur ${id} supprimé`, {
      email: existing.email || null,
    })

    return NextResponse.json({
      success: true,
      message: 'Livreur supprimé avec succès.',
      mode: 'hard',
      generated_at: nowIso(),
    })
  } catch (error: any) {
    log.error?.('Crash DELETE /api/admin/livreurs/[id]', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors de la suppression du livreur.',
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