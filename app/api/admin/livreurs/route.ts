// app/api/admin/livreurs/route.ts
// ============================================================================
// API Admin – Gestion des livreurs
// Version complète, sécurisée, enrichie et nettoyée.
//
// Supporte :
// - GET    : liste paginée, recherche, filtres, tri, stats, export CSV
// - POST   : création d'un livreur
// - PUT    : mise à jour partielle ou complète
// - DELETE : suppression d'un livreur
//
// Cette version ne contient aucune logique de portefeuille / solde / recharge.
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

const TABLE = 'livreurs'
const PROFILES_TABLE = 'profiles'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const CSV_MAX_ROWS = 10_000

const CACHE_TTL = 30_000

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRAUX                                               */
/* ═══════════════════════════════════════════════════════════════ */

function nowIso(): string {
  return new Date().toISOString()
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

  if (['true', 'actif', 'active', 'oui', 'yes', 'on'].includes(str)) return true
  if (['false', 'inactif', 'inactive', 'non', 'no', 'off'].includes(str)) return false

  return fallback
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function sanitizeLike(value: unknown): string {
  return String(value || '')
    .replace(/[(),%\s]+/g, ' ')
    .trim()
    .slice(0, 120)
}

function normalizePhone(value: unknown): string | null {
  const raw = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[-.]/g, '')

  if (!raw) return null

  // +243XXXXXXXXX
  if (/^\+243[1-9][0-9]{8}$/.test(raw)) return raw

  // 243XXXXXXXXX
  if (/^243[1-9][0-9]{8}$/.test(raw)) return `+${raw}`

  // 0XXXXXXXXX
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

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function isUuid(value: unknown): boolean {
  return typeof value === 'string' && z.string().uuid().safeParse(value).success
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

function errorMessage(error: any, fallback: string): string {
  return String(error?.message || error?.details || error?.hint || fallback)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE CLIENT TOÉRANT                                        */
/* ═══════════════════════════════════════════════════════════════ */

async function getSupabaseAdmin(): Promise<any> {
  const client: any = await createClient(true)

  // Certains projets exportent { supabase } ou un client direct.
  return client?.supabase ?? client
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE MÉMOIRE                                                  */
/* ═══════════════════════════════════════════════════════════════ */

const cache = new Map<string, { data: any; timestamp: number }>()

function cacheGet(key: string): any | null {
  const entry = cache.get(key)

  if (!entry) return null

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }

  return entry.data
}

function cacheSet(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() })
}

function cacheClear(): void {
  cache.clear()
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS ZOD                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => textOrNull(value))

const optionalUrl = z
  .union([z.string().url('URL invalide'), z.literal(''), z.null()])
  .optional()
  .transform((value) => {
    const str = textOrNull(value)
    return str || null
  })

const optionalPhone = z
  .union([z.string(), z.literal(''), z.null()])
  .optional()
  .refine((value) => isValidPhone(value), {
    message: 'Numéro invalide. Format attendu : 08xxxxxxxx ou +2438xxxxxxxx.',
  })
  .transform((value) => normalizePhone(value))

const getQuerySchema = z.object({
  search: z.string().optional().default(''),

  est_actif: z
    .enum(['all', 'true', 'false'])
    .optional()
    .default('all'),

  est_disponible: z
    .enum(['all', 'true', 'false'])
    .optional()
    .default('all'),

  zone: z.string().optional().default(''),

  sort_by: z.string().optional().default('created_at'),

  sort_order: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc'),

  page: z.coerce.number().int().positive().optional().default(DEFAULT_PAGE),

  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_LIMIT)
    .optional()
    .default(DEFAULT_LIMIT),

  format: z
    .enum(['json', 'csv'])
    .optional()
    .default('json'),
})

const createLivreurSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),

  nom: z
    .string()
    .trim()
    .min(1, 'Nom requis')
    .max(100, 'Nom trop long'),

  prenom: z
    .string()
    .trim()
    .min(1, 'Prénom requis')
    .max(100, 'Prénom trop long'),

  email: z
    .string()
    .trim()
    .email('Email invalide')
    .max(190, 'Email trop long')
    .transform((value) => value.toLowerCase()),

  telephone: optionalPhone,

  moto_modele: optionalText,
  moto_plaque: optionalText,
  zone_operation_principale: optionalText,
  photo_url: optionalUrl,

  est_actif: z.boolean().optional().default(true),
  est_disponible: z.boolean().optional().default(false),

  total_livraisons: z
    .coerce.number()
    .int()
    .min(0)
    .optional()
    .default(0),

  distance_parcourue_km: z
    .coerce.number()
    .min(0)
    .optional()
    .default(0),

  note_moyenne: z
    .union([z.coerce.number().min(0).max(5), z.null()])
    .optional()
    .default(null),

  derniere_activite: z
    .union([z.string().datetime({ offset: true }), z.literal(''), z.null()])
    .optional()
    .transform((value) => textOrNull(value)),
})

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
    .transform((value) => value.toLowerCase())
    .optional(),

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
    .min(0)
    .optional(),

  distance_parcourue_km: z.coerce
    .number()
    .min(0)
    .optional(),

  note_moyenne: z
    .union([z.coerce.number().min(0).max(5), z.null()])
    .optional(),

  derniere_activite: z
    .union([z.string().datetime({ offset: true }), z.literal(''), z.null()])
    .optional()
    .transform((value) => textOrNull(value)),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  MAPPING TRI                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const SORT_ALIAS_MAP: Record<string, string> = {
  livreur: 'prenom',
  contact: 'email',
  performance: 'total_livraisons',
  note: 'note_moyenne',
  zone: 'zone_operation_principale',
  availability: 'est_disponible',
  status: 'est_actif',

  created_at: 'created_at',
  total_livraisons: 'total_livraisons',
  distance_parcourue_km: 'distance_parcourue_km',
  derniere_activite: 'derniere_activite',
  note_moyenne: 'note_moyenne',

  nom: 'nom',
  prenom: 'prenom',
  email: 'email',
  telephone: 'telephone',

  est_actif: 'est_actif',
  est_disponible: 'est_disponible',
}

function resolveSortColumn(value: unknown): string {
  const raw = String(value || 'created_at').trim()
  return SORT_ALIAS_MAP[raw] || 'created_at'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION RÉPONSE                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface NormalizedLivreur {
  id: string
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
}

function normalizeLivreurRow(row: any, profile?: any): NormalizedLivreur {
  return {
    id: String(row?.id || ''),
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
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STATISTIQUES                                                   */
/* ═══════════════════════════════════════════════════════════════ */

interface LivreurStats {
  total: number
  active: number
  available: number
  avgRating: number | null
  totalDeliveries: number
  totalKm: number

  // Alias compatibles avec d'anciens appels
  actifs: number
  disponibles: number
  livraisons: number
  km: number
}

function computeStats(rows: any[], fallbackTotal = 0): LivreurStats {
  const safeRows = Array.isArray(rows) ? rows : []

  const active = safeRows.filter((r) => toBool(r?.est_actif, false)).length
  const available = safeRows.filter((r) => toBool(r?.est_disponible, false)).length

  const ratedRows = safeRows
    .map((r) => toNullableNumber(r?.note_moyenne))
    .filter((n): n is number => n !== null && n > 0)

  const avgRating =
    ratedRows.length > 0
      ? round(
          ratedRows.reduce((acc, n) => acc + n, 0) / ratedRows.length,
          2
        )
      : null

  const totalDeliveries = safeRows.reduce(
    (acc, r) => acc + toNumber(r?.total_livraisons, 0),
    0
  )

  const totalKm = round(
    safeRows.reduce(
      (acc, r) => acc + toNumber(r?.distance_parcourue_km, 0),
      0
    ),
    1
  )

  const total = fallbackTotal || safeRows.length

  return {
    total,
    active,
    available,
    avgRating,
    totalDeliveries,
    totalKm,

    actifs: active,
    disponibles: available,
    livraisons: totalDeliveries,
    km: totalKm,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CSV                                                            */
/* ═══════════════════════════════════════════════════════════════ */

function buildCsv(rows: NormalizedLivreur[]): string {
  const headers = [
    'ID',
    'Prénom',
    'Nom',
    'Email',
    'Téléphone',
    'Actif',
    'Disponible',
    'Livraisons',
    'Distance km',
    'Note moyenne',
    'Zone',
    'Moto',
    'Plaque',
    'Dernière activité',
    'Créé le',
  ]

  const escape = (value: unknown) =>
    `"${String(value ?? '').replace(/"/g, '""')}"`

  const lines = rows.map((row) =>
    [
      row.id,
      row.prenom,
      row.nom,
      row.email,
      row.telephone || '',
      row.est_actif ? 'Oui' : 'Non',
      row.est_disponible ? 'Oui' : 'Non',
      String(row.total_livraisons),
      String(row.distance_parcourue_km),
      row.note_moyenne === null ? '' : String(row.note_moyenne),
      row.zone_operation_principale || '',
      row.moto_modele || '',
      row.moto_plaque || '',
      row.derniere_activite || '',
      row.created_at || '',
    ]
      .map(escape)
      .join(',')
  )

  return [headers.map(escape).join(','), ...lines].join('\n')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FILTRES SUPABASE                                               */
/* ═══════════════════════════════════════════════════════════════ */

interface FilterOptions {
  search: string
  est_actif: 'all' | 'true' | 'false'
  est_disponible: 'all' | 'true' | 'false'
  zone: string
}

function applyLivreurFilters(query: any, options: FilterOptions): any {
  let q = query

  if (options.est_actif === 'true') {
    q = q.eq('est_actif', true)
  } else if (options.est_actif === 'false') {
    q = q.eq('est_actif', false)
  }

  if (options.est_disponible === 'true') {
    q = q.eq('est_disponible', true)
  } else if (options.est_disponible === 'false') {
    q = q.eq('est_disponible', false)
  }

  const zone = sanitizeLike(options.zone)
  if (zone) {
    q = q.ilike('zone_operation_principale', `%${zone}%`)
  }

  const search = sanitizeLike(options.search)
  if (search) {
    const term = `%${search}%`

    q = q.or(
      [
        `nom.ilike.${term}`,
        `prenom.ilike.${term}`,
        `email.ilike.${term}`,
        `telephone.ilike.${term}`,
        `zone_operation_principale.ilike.${term}`,
        `moto_plaque.ilike.${term}`,
        `moto_modele.ilike.${term}`,
      ].join(',')
    )
  }

  return q
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Liste des livreurs                                       */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-livreurs-get:${ip}`,
    maxRequests: 60,
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
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || 'Accès non autorisé',
        code: 'FORBIDDEN',
      },
      { status: err?.status || 403 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)

    const parsed = getQuerySchema.safeParse(
      Object.fromEntries(searchParams.entries())
    )

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Paramètres invalides',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const input = parsed.data

    const isCsv = input.format === 'csv'

    const page = isCsv ? 1 : Math.max(1, input.page)
    const limit = isCsv ? CSV_MAX_ROWS : Math.min(MAX_LIMIT, Math.max(1, input.limit))
    const offset = (page - 1) * limit

    const sortColumn = resolveSortColumn(input.sort_by)
    const ascending = input.sort_order === 'asc'

    const filters: FilterOptions = {
      search: input.search,
      est_actif: input.est_actif,
      est_disponible: input.est_disponible,
      zone: input.zone,
    }

    const cacheKey = isCsv
      ? null
      : `admin-livreurs:${JSON.stringify({
          ...input,
          sort_by: sortColumn,
          page,
          limit,
        })}`

    if (cacheKey) {
      const cached = cacheGet(cacheKey)
      if (cached) {
        return NextResponse.json(cached)
      }
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

    /* ---------------------------------------------------------- */
    /* 1. Count total filtré                                        */
    /* ---------------------------------------------------------- */

    let countResult = await applyLivreurFilters(
      supabase.from(TABLE).select('*', { count: 'exact', head: true }),
      filters
    )

    if (countResult.error && isColumnError(countResult.error)) {
      // Fallback : recherche désactivée si une colonne recherchée n'existe pas.
      countResult = await supabase
        .from(TABLE)
        .select('*', { count: 'exact', head: true })
        .eq(
          'est_actif',
          filters.est_actif === 'all'
            ? countResult?.data?.est_actif ?? true
            : filters.est_actif === 'true'
        )
    }

    if (countResult.error) {
      if (isTableMissingError(countResult.error)) {
        return NextResponse.json(
          {
            error:
              'La table public.livreurs est introuvable. Exécute la migration SQL nécessaire.',
            code: 'TABLE_MISSING',
            details: errorMessage(countResult.error, 'Table manquante'),
          },
          { status: 503 }
        )
      }

      throw countResult.error
    }

    const total = toNumber(countResult.count, 0)
    const totalPages = Math.max(1, Math.ceil(total / limit))

    /* ---------------------------------------------------------- */
    /* 2. Statistiques filtrées                                     */
    /* ---------------------------------------------------------- */

    let statsRows: any[] = []

    try {
      const statsQuery = await applyLivreurFilters(
        supabase
          .from(TABLE)
          .select(
            'est_actif, est_disponible, total_livraisons, distance_parcourue_km, note_moyenne'
          )
          .limit(CSV_MAX_ROWS),
        filters
      )

      if (!statsQuery.error) {
        statsRows = Array.isArray(statsQuery.data) ? statsQuery.data : []
      } else if (!isColumnError(statsQuery.error)) {
        log.warn?.('admin-livreurs stats query warning', statsQuery.error)
      }
    } catch (statsErr) {
      log.warn?.('admin-livreurs stats exception', statsErr)
    }

    const stats = computeStats(statsRows, total)

    /* ---------------------------------------------------------- */
    /* 3. Données paginées                                          */
    /* ---------------------------------------------------------- */

    async function fetchRows(orderColumn: string | null): Promise<any> {
      let query = applyLivreurFilters(
        supabase.from(TABLE).select('*'),
        filters
      )

      if (orderColumn) {
        query = query.order(orderColumn, { ascending })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      if (!isCsv) {
        query = query.range(offset, offset + limit - 1)
      }

      return await query
    }

    let rowsResult = await fetchRows(sortColumn)

    if (rowsResult.error && isColumnError(rowsResult.error)) {
      rowsResult = await fetchRows(null)
    }

    if (rowsResult.error) {
      if (isTableMissingError(rowsResult.error)) {
        return NextResponse.json(
          {
            error:
              'La table public.livreurs est introuvable. Exécute la migration SQL nécessaire.',
            code: 'TABLE_MISSING',
            details: errorMessage(rowsResult.error, 'Table manquante'),
          },
          { status: 503 }
        )
      }

      throw rowsResult.error
    }

    const rawRows = Array.isArray(rowsResult.data) ? rowsResult.data : []

    /* ---------------------------------------------------------- */
    /* 4. Enrichissement optionnel depuis profiles                  */
    /* ---------------------------------------------------------- */

    const missingProfileIds = rawRows
      .filter(
        (row: any) =>
          !row?.nom ||
          !row?.prenom ||
          !row?.email ||
          !row?.telephone ||
          !row?.photo_url
      )
      .map((row: any) => row?.id)
      .filter(Boolean)

    const profilesMap = new Map<string, any>()

    if (missingProfileIds.length > 0) {
      try {
        const { data: profilesData, error: profilesError } = await supabase
          .from(PROFILES_TABLE)
          .select('id, nom, prenom, email, telephone, avatar_url')
          .in('id', missingProfileIds)

        if (!profilesError && Array.isArray(profilesData)) {
          for (const profile of profilesData) {
            profilesMap.set(String(profile.id), profile)
          }
        } else if (profilesError && !isTableMissingError(profilesError)) {
          log.warn?.('admin-livreurs profiles enrichment warning', profilesError)
        }
      } catch (profileErr) {
        log.warn?.('admin-livreurs profiles enrichment exception', profileErr)
      }
    }

    const data: NormalizedLivreur[] = rawRows.map((row: any) =>
      normalizeLivreurRow(row, profilesMap.get(String(row?.id)))
    )

    /* ---------------------------------------------------------- */
    /* 5. Export CSV                                                */
    /* ---------------------------------------------------------- */

    if (isCsv) {
      const csv = buildCsv(data)

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=livreurs-${new Date()
            .toISOString()
            .slice(0, 10)}.csv`,
          'Cache-Control': 'no-store',
        },
      })
    }

    /* ---------------------------------------------------------- */
    /* 6. Réponse JSON                                              */
    /* ---------------------------------------------------------- */

    const response = {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats,
      filters: {
        search: sanitizeLike(input.search) || null,
        est_actif: input.est_actif,
        est_disponible: input.est_disponible,
        zone: sanitizeLike(input.zone) || null,
        sort_by: sortColumn,
        sort_order: input.sort_order,
      },
      generated_at: nowIso(),
    }

    if (cacheKey) {
      cacheSet(cacheKey, response)
    }

    const jsonResponse = NextResponse.json(response)
    jsonResponse.headers.set('Cache-Control', 'private, no-cache')

    return jsonResponse
  } catch (error: any) {
    log.error?.('Crash GET /api/admin/livreurs', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors du chargement des livreurs.',
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
/*  POST – Création d'un livreur                                   */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-livreurs-post:${ip}`,
    maxRequests: 15,
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
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || 'Accès non autorisé',
        code: 'FORBIDDEN',
      },
      { status: err?.status || 403 }
    )
  }

  let body: unknown

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

  const parsed = createLivreurSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Données invalides.',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const input = parsed.data

  try {
    const supabase = await getSupabaseAdmin()

    const livreurId = input.user_id || input.id || undefined

    const payload: Record<string, unknown> = {
      ...(livreurId ? { id: livreurId } : {}),
      nom: input.nom,
      prenom: input.prenom,
      email: input.email,
      telephone: input.telephone ?? null,
      moto_modele: input.moto_modele ?? null,
      moto_plaque: input.moto_plaque ?? null,
      zone_operation_principale: input.zone_operation_principale ?? null,
      photo_url: input.photo_url ?? null,
      est_actif: input.est_actif,
      est_disponible: input.est_disponible,
      total_livraisons: input.total_livraisons ?? 0,
      distance_parcourue_km: input.distance_parcourue_km ?? 0,
      note_moyenne: input.note_moyenne ?? null,
      derniere_activite: input.derniere_activite ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single()

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

      if (isDuplicateError(error)) {
        return NextResponse.json(
          {
            error: 'Ce livreur existe déjà.',
            code: 'DUPLICATE',
            details: errorMessage(error, 'Doublon'),
          },
          { status: 409 }
        )
      }

      if (isForeignKeyError(error)) {
        return NextResponse.json(
          {
            error: 'Référence invalide.',
            code: 'FOREIGN_KEY_ERROR',
            details: errorMessage(error, 'Clé étrangère invalide'),
          },
          { status: 400 }
        )
      }

      throw error
    }

    /* ---------------------------------------------------------- */
    /* Synchronisation optionnelle avec profiles                    */
    /* ---------------------------------------------------------- */

    if (livreurId) {
      try {
        const profilePayload: Record<string, unknown> = {}

        if (input.nom) profilePayload.nom = input.nom
        if (input.prenom) profilePayload.prenom = input.prenom
        if (input.email) profilePayload.email = input.email
        if (input.telephone) profilePayload.telephone = input.telephone
        if (input.photo_url) profilePayload.avatar_url = input.photo_url

        if (Object.keys(profilePayload).length > 0) {
          const { error: profileError } = await supabase
            .from(PROFILES_TABLE)
            .update(profilePayload)
            .eq('id', livreurId)

          if (profileError && !isTableMissingError(profileError)) {
            log.warn?.(
              'admin-livreurs POST profile sync warning',
              profileError
            )
          }
        }
      } catch (profileSyncErr) {
        log.warn?.(
          'admin-livreurs POST profile sync exception',
          profileSyncErr
        )
      }
    }

    cacheClear()

    const normalized = normalizeLivreurRow(data)

    log.info?.('Livreur créé', {
      livreurId: normalized.id,
      email: normalized.email,
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Livreur créé avec succès.',
        data: normalized,
      },
      { status: 201 }
    )
  } catch (error: any) {
    log.error?.('Crash POST /api/admin/livreurs', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors de la création du livreur.',
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
/*  PUT – Mise à jour d'un livreur                                 */
/* ═══════════════════════════════════════════════════════════════ */

export async function PUT(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-livreurs-put:${ip}`,
    maxRequests: 20,
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
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || 'Accès non autorisé',
        code: 'FORBIDDEN',
      },
      { status: err?.status || 403 }
    )
  }

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

  // Formats acceptés :
  // { id, updates: {...} }
  // { livreurId, ...updates }
  // { id, ...updates }
  const id = body?.id || body?.livreurId

  if (!isUuid(id)) {
    return NextResponse.json(
      {
        error: 'ID de livreur invalide.',
        code: 'INVALID_ID',
      },
      { status: 400 }
    )
  }

  const updates =
    body?.updates && typeof body.updates === 'object'
      ? body.updates
      : (() => {
          const clone = { ...body }
          delete clone.id
          delete clone.livreurId
          return clone
        })()

  const parsedUpdates = updateLivreurSchema.safeParse(updates)

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

  const updateData = parsedUpdates.data

  try {
    const supabase = await getSupabaseAdmin()

    /* ---------------------------------------------------------- */
    /* Vérification existence                                       */
    /* ---------------------------------------------------------- */

    const { data: existing, error: fetchError } = await supabase
      .from(TABLE)
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      if (isTableMissingError(fetchError)) {
        return NextResponse.json(
          {
            error:
              'La table public.livreurs est introuvable. Exécute la migration SQL nécessaire.',
            code: 'TABLE_MISSING',
            details: errorMessage(fetchError, 'Table manquante'),
          },
          { status: 503 }
        )
      }

      throw fetchError
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

    /* ---------------------------------------------------------- */
    /* Mise à jour table livreurs                                   */
    /* ---------------------------------------------------------- */

    const livreurPayload: Record<string, unknown> = {}

    const assignableLivreurFields: Array<keyof typeof updateData> = [
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
    ]

    for (const field of assignableLivreurFields) {
      if (updateData[field] !== undefined) {
        livreurPayload[field] = updateData[field]
      }
    }

    if (Object.keys(livreurPayload).length > 0) {
      livreurPayload.updated_at = nowIso()

      const { error: updateError } = await supabase
        .from(TABLE)
        .update(livreurPayload)
        .eq('id', id)

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

        throw updateError
      }
    }

    /* ---------------------------------------------------------- */
    /* Synchronisation optionnelle avec profiles                    */
    /* ---------------------------------------------------------- */

    const profilePayload: Record<string, unknown> = {}

    if (updateData.nom !== undefined) profilePayload.nom = updateData.nom
    if (updateData.prenom !== undefined) profilePayload.prenom = updateData.prenom
    if (updateData.email !== undefined) profilePayload.email = updateData.email
    if (updateData.telephone !== undefined)
      profilePayload.telephone = updateData.telephone
    if (updateData.photo_url !== undefined)
      profilePayload.avatar_url = updateData.photo_url

    if (Object.keys(profilePayload).length > 0) {
      try {
        const { error: profileError } = await supabase
          .from(PROFILES_TABLE)
          .update(profilePayload)
          .eq('id', id)

        if (profileError) {
          if (isDuplicateError(profileError)) {
            return NextResponse.json(
              {
                error: 'Cet email est déjà utilisé par un autre compte.',
                code: 'DUPLICATE_EMAIL',
                details: errorMessage(profileError, 'Email doublon'),
              },
              { status: 409 }
            )
          }

          if (!isTableMissingError(profileError) && !isColumnError(profileError)) {
            log.warn?.('admin-livreurs PUT profile sync warning', profileError)
          }
        }
      } catch (profileSyncErr) {
        log.warn?.(
          'admin-livreurs PUT profile sync exception',
          profileSyncErr
        )
      }
    }

    /* ---------------------------------------------------------- */
    /* Récupération finale                                          */
    /* ---------------------------------------------------------- */

    const { data: updatedRow, error: refetchError } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (refetchError) {
      log.warn?.('admin-livreurs PUT refetch warning', refetchError)
    }

    cacheClear()

    const normalized = updatedRow
      ? normalizeLivreurRow(updatedRow)
      : {
          id,
          nom: updateData.nom || '',
          prenom: updateData.prenom || '',
          email: updateData.email || '',
          telephone: updateData.telephone || null,
          est_actif: updateData.est_actif ?? true,
          est_disponible: updateData.est_disponible ?? false,
          total_livraisons: updateData.total_livraisons ?? 0,
          distance_parcourue_km: updateData.distance_parcourue_km ?? 0,
          derniere_activite: updateData.derniere_activite || null,
          zone_operation_principale: updateData.zone_operation_principale || null,
          photo_url: updateData.photo_url || null,
          moto_modele: updateData.moto_modele || null,
          moto_plaque: updateData.moto_plaque || null,
          note_moyenne: updateData.note_moyenne ?? null,
          created_at: null,
          updated_at: nowIso(),
        }

    log.info?.('Livreur mis à jour', {
      livreurId: id,
      updatedFields: Object.keys(livreurPayload).filter(
        (k) => k !== 'updated_at'
      ),
    })

    return NextResponse.json({
      success: true,
      message: 'Livreur mis à jour avec succès.',
      data: normalized,
    })
  } catch (error: any) {
    log.error?.('Crash PUT /api/admin/livreurs', error)

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

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE – Suppression d'un livreur                              */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-livreurs-delete:${ip}`,
    maxRequests: 10,
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
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || 'Accès non autorisé',
        code: 'FORBIDDEN',
      },
      { status: err?.status || 403 }
    )
  }

  const { searchParams } = new URL(request.url)

  let id = searchParams.get('id')

  if (!id) {
    try {
      const body = await request.json()
      id = body?.id || body?.livreurId
    } catch {
      // silencieux : id peut venir uniquement des query params
    }
  }

  if (!isUuid(id)) {
    return NextResponse.json(
      {
        error: 'ID de livreur invalide.',
        code: 'INVALID_ID',
      },
      { status: 400 }
    )
  }

  try {
    const supabase = await getSupabaseAdmin()

    const { data: existing, error: fetchError } = await supabase
      .from(TABLE)
      .select('id, email')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      if (isTableMissingError(fetchError)) {
        return NextResponse.json(
          {
            error:
              'La table public.livreurs est introuvable. Exécute la migration SQL nécessaire.',
            code: 'TABLE_MISSING',
            details: errorMessage(fetchError, 'Table manquante'),
          },
          { status: 503 }
        )
      }

      throw fetchError
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

    const { error: deleteError } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id)

    if (deleteError) {
      throw deleteError
    }

    cacheClear()

    log.info?.('Livreur supprimé', {
      livreurId: id,
      email: existing.email || null,
    })

    return NextResponse.json({
      success: true,
      message: 'Livreur supprimé avec succès.',
    })
  } catch (error: any) {
    log.error?.('Crash DELETE /api/admin/livreurs', error)

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