// app/api/admin/codes/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createServiceClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Nom de table principal attendu par l'architecture promo intelligente.
 * Fallback tolérant vers l'ancien nom si présent dans la base.
 */
const PROMO_TABLE_CANDIDATES = ['promo_codes', 'codes_promo'] as const

/**
 * Colonnes candidates pour la détection automatique du schéma.
 * L'API s'adapte à ce qui existe réellement dans la base.
 */
const PROMO_COLUMN_CANDIDATES = [
  'code',
  'type',
  'value',
  'reduction_percent',
  'min_total_usd',
  'max_discount_usd',
  'max_utilisations',
  'utilisations_actuelles',
  'actif',
  'expires_at',
  'description',
  'created_at',
  'updated_at',
] as const

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 100

/**
 * Pool maximum utilisé pour les filtres "actif" et "epuise",
 * car ces filtres nécessitent une comparaison colonne/colonne
 * (utilisations_actuelles >= max_utilisations) que PostgREST
 * ne peut pas exprimer directement sans RPC.
 */
const STATUS_POOL_LIMIT = 2000

/**
 * Pool maximum pour le calcul des statistiques globales.
 */
const STATS_POOL_LIMIT = 2000

const CACHE_TTL_MS = 15_000

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE MÉMOIRE + CACHE SCHÉMA                                   */
/* ═══════════════════════════════════════════════════════════════ */

const responseCache = new Map<string, { data: any; timestamp: number }>()

const schemaCache: {
  tableName: string | null
  resolvedAt: number
  availableColumns: Set<string> | null
  resolvedColumnsAt: number
} = {
  tableName: null,
  resolvedAt: 0,
  availableColumns: null,
  resolvedColumnsAt: 0,
}

const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000

function getCached(key: string): any | null {
  const entry = responseCache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key)
    return null
  }

  return entry.data
}

function setCached(key: string, data: any): void {
  responseCache.set(key, { data, timestamp: Date.now() })
}

function invalidateCache(): void {
  responseCache.clear()
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS SUPABASE TOLÉRANTS                                     */
/* ═══════════════════════════════════════════════════════════════ */

async function getSupabase(): Promise<any | null> {
  try {
    const raw = createServiceClient()
    return raw instanceof Promise ? await raw : raw
  } catch (err: any) {
    logger.error('Impossible de créer le client Supabase service', err)
    return null
  }
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('relation') ||
    String(error?.code || '') === '42P01'
  )
}

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || '')
  return (
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message) ||
    /is not a column/i.test(message) ||
    String(error?.code || '') === '42703'
  )
}

function extractMissingColumnName(message: string): string | null {
  const patterns = [
    /column\s+"?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)"?\s+does not exist/i,
    /Could not find the\s+'([a-zA-Z_][a-zA-Z0-9_]*)'\s+column/i,
    /"([a-zA-Z_][a-zA-Z0-9_]*)"\s+is not a column/i,
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

/**
 * Résout le nom de table promo réellement disponible.
 * Priorité : promo_codes, fallback : codes_promo.
 */
async function resolvePromoTable(supabase: any): Promise<string | null> {
  if (!supabase) return null

  if (
    schemaCache.tableName &&
    Date.now() - schemaCache.resolvedAt < SCHEMA_CACHE_TTL_MS
  ) {
    return schemaCache.tableName
  }

  for (const candidate of PROMO_TABLE_CANDIDATES) {
    try {
      const { error } = await supabase
        .from(candidate)
        .select('code')
        .limit(1)

      if (!error) {
        schemaCache.tableName = candidate
        schemaCache.resolvedAt = Date.now()
        return candidate
      }

      if (!isMissingTableError(error)) {
        logger.warn(`Table promo candidate "${candidate}" erreur inattendue`, error)
      }
    } catch (err: any) {
      logger.warn(`Exception résolution table promo "${candidate}"`, err)
    }
  }

  return null
}

/**
 * Détecte les colonnes réellement disponibles dans la table promo.
 * Utilisé avant toute écriture pour ne jamais insérer une colonne inexistante.
 */
async function detectAvailableColumns(
  supabase: any,
  tableName: string
): Promise<Set<string>> {
  if (
    schemaCache.availableColumns &&
    schemaCache.resolvedColumnsAt < SCHEMA_CACHE_TTL_MS &&
    schemaCache.tableName === tableName
  ) {
    return schemaCache.availableColumns
  }

  let remaining = [...PROMO_COLUMN_CANDIDATES]

  for (let attempt = 0; attempt < PROMO_COLUMN_CANDIDATES.length + 5; attempt++) {
    if (remaining.length === 0) break

    const selectStr = remaining.join(',')

    try {
      const { error } = await supabase
        .from(tableName)
        .select(selectStr)
        .eq('code', '__schema_probe__')
        .limit(1)

      if (!error) {
        const set = new Set(remaining)
        schemaCache.availableColumns = set
        schemaCache.resolvedColumnsAt = Date.now()
        schemaCache.tableName = tableName
        return set
      }

      if (isMissingColumnError(error)) {
        const missing = extractMissingColumnName(String(error.message || ''))
        if (missing && remaining.includes(missing)) {
          remaining = remaining.filter((col) => col !== missing)
          continue
        }
      }

      // Erreur autre : on arrête la détection et on retourne ce qu'on a.
      break
    } catch (err: any) {
      logger.warn('Exception détection colonnes promo', err)
      break
    }
  }

  const fallbackSet = new Set(
    remaining.filter((col) => col !== 'updated_at' && col !== 'created_at')
  )

  schemaCache.availableColumns = fallbackSet
  schemaCache.resolvedColumnsAt = Date.now()
  schemaCache.tableName = tableName

  return fallbackSet
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION PROMOS                                           */
/* ═══════════════════════════════════════════════════════════════ */

function toNumber(value: any, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizePromoRow(row: any): any {
  if (!row) return null

  const rawType = String(row.type ?? row.kind ?? row.discount_type ?? '').toLowerCase()
  const hasExplicitType = rawType === 'percent' || rawType === 'fixed'

  const type: 'percent' | 'fixed' = hasExplicitType
    ? (rawType as 'percent' | 'fixed')
    : row.reduction_percent != null
      ? 'percent'
      : 'percent'

  const value =
    row.value != null
      ? toNumber(row.value, 0)
      : row.reduction_percent != null
        ? toNumber(row.reduction_percent, 0)
        : row.valeur != null
          ? toNumber(row.valeur, 0)
          : row.discount != null
            ? toNumber(row.discount, 0)
            : 0

  const minTotalUsd =
    row.min_total_usd != null
      ? toNumber(row.min_total_usd, 0)
      : row.minTotalUsd != null
        ? toNumber(row.minTotalUsd, 0)
        : row.min_total != null
          ? toNumber(row.min_total, 0)
          : 0

  const maxDiscountUsd =
    row.max_discount_usd != null
      ? toNumber(row.max_discount_usd, 0)
      : row.maxDiscountUsd != null
        ? toNumber(row.maxDiscountUsd, 0)
        : row.max_discount != null
          ? toNumber(row.max_discount, 0)
          : 0

  const maxUtilisations =
    row.max_utilisations != null
      ? toNumber(row.max_utilisations, 1)
      : row.max_utilisation != null
        ? toNumber(row.max_utilisation, 1)
        : 1

  const utilisationsActuelles =
    row.utilisations_actuelles != null
      ? toNumber(row.utilisations_actuelles, 0)
      : row.utilisation_actuelle != null
        ? toNumber(row.utilisation_actuelle, 0)
        : 0

  const expiresAt =
    row.expires_at ??
    row.expiresAt ??
    row.expiration_date ??
    null

  return {
    id: row.id,
    code: String(row.code ?? '').toUpperCase(),
    type,
    value,
    reduction_percent: type === 'percent' ? value : null,
    min_total_usd: minTotalUsd,
    max_discount_usd: maxDiscountUsd,
    max_utilisations: maxUtilisations,
    utilisations_actuelles: utilisationsActuelles,
    actif: row.actif !== false,
    expires_at: expiresAt,
    description: row.description ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GÉNÉRATION DE CODES UNIQUES                                    */
/* ═══════════════════════════════════════════════════════════════ */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomSuffix(length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

function generateRandomCode(prefix: string, totalLength = 10): string {
  const cleanPrefix = String(prefix || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)

  const suffixLength = Math.max(4, totalLength - cleanPrefix.length)
  return `${cleanPrefix}${randomSuffix(suffixLength)}`
}

async function ensureUniqueCodes(
  supabase: any,
  tableName: string,
  desiredCount: number,
  prefix: string,
  loggerRef: any
): Promise<string[]> {
  const unique = new Set<string>()
  let attempts = 0
  const maxAttempts = desiredCount * 8

  while (unique.size < desiredCount && attempts < maxAttempts) {
    attempts++

    const needed = desiredCount - unique.size
    const batch: string[] = []

    for (let i = 0; i < needed; i++) {
      batch.push(generateRandomCode(prefix, 10))
    }

    try {
      const { data: existing, error } = await supabase
        .from(tableName)
        .select('code')
        .in('code', batch)

      if (error) {
        loggerRef.warn('Vérification unicité codes promo impossible', error)
        // En cas d'échec de vérification, on ajoute quand même (la contrainte unique DB protège).
        batch.forEach((code) => unique.add(code))
        break
      }

      const existingSet = new Set(
        (existing || []).map((row: any) => String(row.code).toUpperCase())
      )

      batch.forEach((code) => {
        if (!existingSet.has(code)) {
          unique.add(code)
        }
      })
    } catch (err: any) {
      loggerRef.warn('Exception unicité codes promo', err)
      batch.forEach((code) => unique.add(code))
      break
    }
  }

  return Array.from(unique).slice(0, desiredCount)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTRUCTION PAYLOAD ÉCRITURE TOLÉRANT                         */
/* ═══════════════════════════════════════════════════════════════ */

function buildWritePayload(
  input: {
    code?: string
    type?: 'percent' | 'fixed'
    value?: number
    maxUtilisations?: number
    expiresAt?: string | null
    minTotalUsd?: number | null
    maxDiscountUsd?: number | null
    description?: string | null
    actif?: boolean
  },
  availableColumns: Set<string>
): Record<string, any> {
  const payload: Record<string, any> = {}

  if (input.code != null && availableColumns.has('code')) {
    payload.code = String(input.code).trim().toUpperCase()
  }

  if (availableColumns.has('type')) {
    payload.type = input.type === 'fixed' ? 'fixed' : 'percent'
  }

  if (availableColumns.has('value')) {
    payload.value = toNumber(input.value, 0)
  }

  // Compat ancienne table sans type/value : on remplit reduction_percent.
  if (!availableColumns.has('type') && !availableColumns.has('value') && availableColumns.has('reduction_percent')) {
    payload.reduction_percent = toNumber(input.value, 0)
  }

  if (availableColumns.has('reduction_percent') && input.type !== 'fixed') {
    payload.reduction_percent = toNumber(input.value, 0)
  }

  if (availableColumns.has('min_total_usd')) {
    payload.min_total_usd = toNumber(input.minTotalUsd, 0) > 0 ? toNumber(input.minTotalUsd, 0) : 0
  }

  if (availableColumns.has('max_discount_usd')) {
    payload.max_discount_usd = toNumber(input.maxDiscountUsd, 0) > 0 ? toNumber(input.maxDiscountUsd, 0) : 0
  }

  if (availableColumns.has('max_utilisations')) {
    payload.max_utilisations = Math.max(1, Math.floor(toNumber(input.maxUtilisations, 1)))
  }

  if (availableColumns.has('expires_at')) {
    payload.expires_at = input.expiresAt
      ? new Date(input.expiresAt).toISOString()
      : null
  }

  if (availableColumns.has('description')) {
    payload.description = input.description?.trim() || null
  }

  if (availableColumns.has('actif')) {
    payload.actif = input.actif !== false
  }

  if (availableColumns.has('utilisations_actuelles')) {
    // À la création, toujours 0.
    payload.utilisations_actuelles = 0
  }

  return payload
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS ZOD                                                    */
/* ═══════════════════════════════════════════════════════════════ */

const getQuerySchema = z.object({
  search: z.string().optional().default(''),
  statut: z
    .enum(['all', 'actif', 'inactif', 'epuise', 'expire'])
    .optional()
    .default('all'),
  sort_by: z
    .enum([
      'created_at',
      'code',
      'value',
      'reduction_percent',
      'utilisations_actuelles',
      'expires_at',
    ])
    .optional()
    .default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
})

const promoBaseSchema = z.object({
  type: z.enum(['percent', 'fixed']).optional().default('percent'),
  value: z.coerce.number().min(0).optional(),
  reduction_percent: z.coerce.number().min(0).max(99).optional(),
  max_utilisations: z.coerce.number().int().min(1).max(10000).optional().default(1),
  expires_at: z.string().nullable().optional(),
  min_total_usd: z.coerce.number().min(0).nullable().optional(),
  max_discount_usd: z.coerce.number().min(0).nullable().optional(),
  description: z.string().max(255).nullable().optional(),
  actif: z.boolean().optional().default(true),
})

const generateSchema = promoBaseSchema.extend({
  mode: z.literal('generate').optional().default('generate'),
  count: z.coerce.number().int().min(1).max(100),
  prefix: z
    .string()
    .max(12)
    .regex(/^[A-Z0-9]*$/i, 'Préfixe : lettres et chiffres uniquement.')
    .optional()
    .default(''),
})

const createSchema = promoBaseSchema.extend({
  mode: z.literal('create'),
  code: z
    .string()
    .min(3, 'Minimum 3 caractères')
    .max(30, 'Maximum 30 caractères')
    .regex(/^[A-Z0-9_-]+$/i, 'Lettres, chiffres, tirets et underscores uniquement.')
    .transform((value) => value.toUpperCase()),
})

const updateSchema = z.object({
  id: z.string().uuid('ID invalide'),
  code: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[A-Z0-9_-]+$/i)
    .transform((value) => value.toUpperCase())
    .optional(),
  type: z.enum(['percent', 'fixed']).optional(),
  value: z.coerce.number().min(0).optional(),
  reduction_percent: z.coerce.number().min(0).max(99).optional(),
  max_utilisations: z.coerce.number().int().min(1).max(10000).optional(),
  expires_at: z.string().nullable().optional(),
  min_total_usd: z.coerce.number().min(0).nullable().optional(),
  max_discount_usd: z.coerce.number().min(0).nullable().optional(),
  description: z.string().max(255).nullable().optional(),
  actif: z.boolean().optional(),
})

const deleteSchema = z.object({
  id: z.string().uuid('ID invalide'),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS RÉQUÊTE LECTURE                                        */
/* ═══════════════════════════════════════════════════════════════ */

function isoNowForOr(): string {
  return new Date().toISOString().split('.')[0] + 'Z'
}

function applySearch(query: any, search: string) {
  if (!search) return query
  return query.or(`code.ilike.%${search}%,description.ilike.%${search}%`)
}

function applySort(query: any, sortBy: string, sortOrder: string) {
  const ascending = sortOrder === 'asc'

  // value n'existe pas forcément dans les anciennes tables : fallback reduction_percent.
  const effectiveSort =
    sortBy === 'value' ? 'value' : sortBy

  return query.order(effectiveSort, { ascending })
}

async function fetchAllPromosPool(
  supabase: any,
  tableName: string,
  search: string,
  limit: number
): Promise<any[]> {
  let query = supabase.from(tableName).select('*')

  if (search) {
    query = applySearch(query, search)
  }

  query = query.order('created_at', { ascending: false }).limit(limit)

  const { data, error } = await query

  if (error) {
    logger.warn('Erreur pool promos', error)
    return []
  }

  return data || []
}

function computeStats(pool: any[]): {
  total: number
  active: number
  used: number
  expiring_soon: number
} {
  const now = new Date()
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  let active = 0
  let used = 0
  let expiringSoon = 0

  for (const raw of pool) {
    const promo = normalizePromoRow(raw)
    if (!promo) continue

    used += toNumber(promo.utilisations_actuelles, 0)

    const expired =
      promo.expires_at != null && new Date(promo.expires_at) < now

    const exhausted =
      toNumber(promo.max_utilisations, 0) > 0 &&
      toNumber(promo.utilisations_actuelles, 0) >= toNumber(promo.max_utilisations, 0)

    if (promo.actif && !expired && !exhausted) {
      active++
    }

    if (promo.expires_at != null) {
      const expiry = new Date(promo.expires_at)
      if (expiry >= now && expiry <= inSevenDays) {
        expiringSoon++
      }
    }
  }

  return {
    total: pool.length,
    active,
    used,
    expiring_soon: expiringSoon,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET – Liste des codes promo                                    */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-codes-get:${ip}`,
    maxRequests: 30,
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

  const { searchParams } = new URL(request.url)

  const parsed = getQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  )

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { search, statut, sort_by, sort_order, page, limit } = parsed.data
  const offset = (page - 1) * limit

  const cacheKey = `admin-codes-promo:${JSON.stringify(parsed.data)}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json(
      {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        stats: { total: 0, active: 0, used: 0, expiring_soon: 0 },
      },
      { status: 200 }
    )
  }

  const tableName = await resolvePromoTable(supabase)

  if (!tableName) {
    logger.warn('Aucune table promo trouvée (promo_codes / codes_promo)')
    return NextResponse.json(
      {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        stats: { total: 0, active: 0, used: 0, expiring_soon: 0 },
      },
      { status: 200 }
    )
  }

  try {
    /* ---------------------------------------------------------- */
    /* Stats globales (pool limité)                                */
    /* ---------------------------------------------------------- */

    const statsPool = await fetchAllPromosPool(supabase, tableName, '', STATS_POOL_LIMIT)
    const stats = computeStats(statsPool)

    /* ---------------------------------------------------------- */
    /* Filtres nécessitant un pool serveur                          */
    /* ---------------------------------------------------------- */

    const needsServerPool = statut === 'actif' || statut === 'epuise'

    if (needsServerPool) {
      const nowIso = new Date().toISOString()
      const isoOr = isoNowForOr()

      let query = supabase.from(tableName).select('*').eq('actif', true)

      // Non expiré : expires_at null OU > now
      query = query.or(`expires_at.is.null,expires_at.gt.${isoOr}`)

      if (search) {
        query = applySearch(query, search)
      }

      query = query.limit(STATUS_POOL_LIMIT)

      const { data: poolRaw, error: poolError } = await query

      if (poolError) {
        logger.warn('Erreur pool statut actif/epuise', poolError)
        return NextResponse.json({
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          stats,
        })
      }

      const pool = (poolRaw || []).map(normalizePromoRow).filter(Boolean)

      const filtered = pool.filter((promo: any) => {
        const exhausted =
          toNumber(promo.max_utilisations, 0) > 0 &&
          toNumber(promo.utilisations_actuelles, 0) >= toNumber(promo.max_utilisations, 0)

        if (statut === 'epuise') return exhausted
        return !exhausted
      })

      // Tri côté serveur sur le pool filtré
      filtered.sort((a: any, b: any) => {
        let cmp = 0

        if (sort_by === 'code') {
          cmp = String(a.code).localeCompare(String(b.code))
        } else if (sort_by === 'value' || sort_by === 'reduction_percent') {
          cmp = toNumber(a.value, 0) - toNumber(b.value, 0)
        } else if (sort_by === 'utilisations_actuelles') {
          cmp = toNumber(a.utilisations_actuelles, 0) - toNumber(b.utilisations_actuelles, 0)
        } else if (sort_by === 'expires_at') {
          const aTime = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY
          const bTime = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY
          cmp = aTime - bTime
        } else {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
          cmp = aTime - bTime
        }

        return sort_order === 'asc' ? cmp : -cmp
      })

      const total = filtered.length
      const totalPages = Math.max(1, Math.ceil(total / limit))
      const safeOffset = Math.min(offset, Math.max(0, total - 1))
      const slice = filtered.slice(safeOffset, safeOffset + limit)

      const response = {
        data: slice,
        pagination: { page, limit, total, totalPages },
        stats,
      }

      setCached(cacheKey, response)
      return NextResponse.json(response)
    }

    /* ---------------------------------------------------------- */
    /* Filtres simples : pagination serveur directe                 */
    /* ---------------------------------------------------------- */

    let query = supabase.from(tableName).select('*', { count: 'exact' })

    if (search) {
      query = applySearch(query, search)
    }

    if (statut === 'inactif') {
      query = query.eq('actif', false)
    } else if (statut === 'expire') {
      query = query.not('expires_at', 'is', null).lt('expires_at', new Date().toISOString())
    }
    // statut === 'all' : aucun filtre supplémentaire

    query = applySort(query, sort_by, sort_order)
    query = query.range(offset, offset + limit - 1)

    const { data: rows, error, count } = await query

    if (error) {
      if (isMissingColumnError(error) && (sort_by === 'value' || sort_by === 'utilisations_actuelles' || sort_by === 'expires_at')) {
        // Fallback tri sur created_at si colonne de tri absente
        let fallbackQuery = supabase.from(tableName).select('*', { count: 'exact' })

        if (search) fallbackQuery = applySearch(fallbackQuery, search)
        if (statut === 'inactif') fallbackQuery = fallbackQuery.eq('actif', false)
        if (statut === 'expire') {
          fallbackQuery = fallbackQuery
            .not('expires_at', 'is', null)
            .lt('expires_at', new Date().toISOString())
        }

        fallbackQuery = fallbackQuery.order('created_at', { ascending: sort_order === 'asc' })
        fallbackQuery = fallbackQuery.range(offset, offset + limit - 1)

        const fallback = await fallbackQuery

        if (!fallback.error) {
          const response = {
            data: (fallback.data || []).map(normalizePromoRow).filter(Boolean),
            pagination: {
              page,
              limit,
              total: fallback.count ?? 0,
              totalPages: Math.max(1, Math.ceil((fallback.count ?? 0) / limit)),
            },
            stats,
          }

          setCached(cacheKey, response)
          return NextResponse.json(response)
        }
      }

      logger.warn('Erreur GET codes promo', error)

      return NextResponse.json({
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        stats,
      })
    }

    const response = {
      data: (rows || []).map(normalizePromoRow).filter(Boolean),
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
      },
      stats,
    }

    setCached(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error('Crash GET admin/codes', error)

    return NextResponse.json({
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
      stats: { total: 0, active: 0, used: 0, expiring_soon: 0 },
    })
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST – Génération en masse OU création manuelle                */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-codes-post:${ip}`,
    maxRequests: 10,
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

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json(
      { error: 'Service Supabase indisponible.' },
      { status: 503 }
    )
  }

  const tableName = await resolvePromoTable(supabase)

  if (!tableName) {
    return NextResponse.json(
      { error: 'Aucune table promo disponible (promo_codes / codes_promo).' },
      { status: 500 }
    )
  }

  const availableColumns = await detectAvailableColumns(supabase, tableName)

  /* ---------------------------------------------------------- */
  /* Détection du mode                                            */
  /* ---------------------------------------------------------- */

  const isGenerate =
    body?.mode === 'generate' ||
    (body?.count != null && body?.code == null)

  const isCreate =
    body?.mode === 'create' ||
    (body?.code != null && body?.count == null)

  /* ---------------------------------------------------------- */
  /* Génération en masse                                          */
  /* ---------------------------------------------------------- */

  if (isGenerate) {
    const parsed = generateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const {
      count,
      prefix,
      type,
      value,
      reduction_percent,
      max_utilisations,
      expires_at,
      min_total_usd,
      max_discount_usd,
      description,
      actif,
    } = parsed.data

    const effectiveValue =
      value != null ? value : reduction_percent != null ? reduction_percent : 0

    if (effectiveValue <= 0) {
      return NextResponse.json(
        { error: 'La valeur de réduction doit être supérieure à 0.' },
        { status: 400 }
      )
    }

    if (type === 'percent' && effectiveValue > 99) {
      return NextResponse.json(
        { error: 'Une réduction en pourcentage ne peut pas dépasser 99%.' },
        { status: 400 }
      )
    }

    const codes = await ensureUniqueCodes(supabase, tableName, count, prefix || '', logger)

    if (codes.length === 0) {
      return NextResponse.json(
        { error: 'Impossible de générer des codes uniques.' },
        { status: 500 }
      )
    }

    const rows = codes.map((code) =>
      buildWritePayload(
        {
          code,
          type,
          value: effectiveValue,
          maxUtilisations: max_utilisations,
          expiresAt: expires_at ?? null,
          minTotalUsd: min_total_usd ?? null,
          maxDiscountUsd: max_discount_usd ?? null,
          description: description ?? null,
          actif: actif !== false,
        },
        availableColumns
      )
    )

    try {
      const { data: inserted, error: insertError } = await supabase
        .from(tableName)
        .insert(rows)
        .select('*')

      if (insertError) {
        // Fallback : si une colonne a échappé à la détection, on retire les colonnes optionnelles.
        if (isMissingColumnError(insertError)) {
          const minimalRows = codes.map((code) => {
            const payload: Record<string, any> = { code }

            if (availableColumns.has('reduction_percent')) {
              payload.reduction_percent = type === 'percent' ? effectiveValue : 0
            }

            if (availableColumns.has('actif')) payload.actif = true
            if (availableColumns.has('max_utilisations')) payload.max_utilisations = max_utilisations
            if (availableColumns.has('expires_at')) {
              payload.expires_at = expires_at ? new Date(expires_at).toISOString() : null
            }

            return payload
          })

          const retry = await supabase.from(tableName).insert(minimalRows).select('*')

          if (retry.error) throw retry.error

          invalidateCache()

          return NextResponse.json(
            {
              codes: (retry.data || []).map((row: any) => normalizePromoRow(row)).filter(Boolean),
              count: (retry.data || []).length,
            },
            { status: 201 }
          )
        }

        throw insertError
      }

      invalidateCache()

      return NextResponse.json(
        {
          codes: (inserted || []).map((row: any) => normalizePromoRow(row)).filter(Boolean),
          count: (inserted || []).length,
        },
        { status: 201 }
      )
    } catch (error: any) {
      logger.error('Crash POST generate admin/codes', error)
      return NextResponse.json(
        { error: error?.message || 'Erreur lors de la génération des codes.' },
        { status: 500 }
      )
    }
  }

  /* ---------------------------------------------------------- */
  /* Création manuelle                                            */
  /* ---------------------------------------------------------- */

  if (isCreate) {
    const parsed = createSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const {
      code,
      type,
      value,
      reduction_percent,
      max_utilisations,
      expires_at,
      min_total_usd,
      max_discount_usd,
      description,
      actif,
    } = parsed.data

    const effectiveValue =
      value != null ? value : reduction_percent != null ? reduction_percent : 0

    if (effectiveValue <= 0) {
      return NextResponse.json(
        { error: 'La valeur de réduction doit être supérieure à 0.' },
        { status: 400 }
      )
    }

    if (type === 'percent' && effectiveValue > 99) {
      return NextResponse.json(
        { error: 'Une réduction en pourcentage ne peut pas dépasser 99%.' },
        { status: 400 }
      )
    }

    // Vérification anti-doublon
    try {
      const { data: existing } = await supabase
        .from(tableName)
        .select('id')
        .eq('code', code)
        .maybeSingle()

      if (existing) {
        return NextResponse.json(
          { error: `Le code "${code}" existe déjà.` },
          { status: 409 }
        )
      }
    } catch (err: any) {
      logger.warn('Vérification doublon code promo impossible', err)
    }

    const payload = buildWritePayload(
      {
        code,
        type,
        value: effectiveValue,
        maxUtilisations: max_utilisations,
        expiresAt: expires_at ?? null,
        minTotalUsd: min_total_usd ?? null,
        maxDiscountUsd: max_discount_usd ?? null,
        description: description ?? null,
        actif: actif !== false,
      },
      availableColumns
    )

    try {
      const { data: inserted, error: insertError } = await supabase
        .from(tableName)
        .insert(payload)
        .select('*')
        .single()

      if (insertError) {
        if (isMissingColumnError(insertError)) {
          const minimalPayload: Record<string, any> = { code }

          if (availableColumns.has('reduction_percent')) {
            minimalPayload.reduction_percent = type === 'percent' ? effectiveValue : 0
          }

          if (availableColumns.has('actif')) minimalPayload.actif = actif !== false
          if (availableColumns.has('max_utilisations')) minimalPayload.max_utilisations = max_utilisations
          if (availableColumns.has('expires_at')) {
            minimalPayload.expires_at = expires_at ? new Date(expires_at).toISOString() : null
          }

          const retry = await supabase
            .from(tableName)
            .insert(minimalPayload)
            .select('*')
            .single()

          if (retry.error) throw retry.error

          invalidateCache()
          return NextResponse.json({ code: normalizePromoRow(retry.data) }, { status: 201 })
        }

        throw insertError
      }

      invalidateCache()
      return NextResponse.json({ code: normalizePromoRow(inserted) }, { status: 201 })
    } catch (error: any) {
      logger.error('Crash POST create admin/codes', error)
      return NextResponse.json(
        { error: error?.message || 'Erreur lors de la création du code.' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json(
    { error: 'Mode invalide. Utilisez mode=generate ou mode=create.' },
    { status: 400 }
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUT – Toggle actif OU édition complète                         */
/* ═══════════════════════════════════════════════════════════════ */

export async function PUT(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-codes-put:${ip}`,
    maxRequests: 10,
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

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json(
      { error: 'Service Supabase indisponible.' },
      { status: 503 }
    )
  }

  const tableName = await resolvePromoTable(supabase)

  if (!tableName) {
    return NextResponse.json(
      { error: 'Aucune table promo disponible.' },
      { status: 500 }
    )
  }

  const availableColumns = await detectAvailableColumns(supabase, tableName)

  const {
    id,
    code,
    type,
    value,
    reduction_percent,
    max_utilisations,
    expires_at,
    min_total_usd,
    max_discount_usd,
    description,
    actif,
  } = parsed.data

  const isToggleOnly =
    actif !== undefined &&
    code === undefined &&
    type === undefined &&
    value === undefined &&
    reduction_percent === undefined &&
    max_utilisations === undefined &&
    expires_at === undefined &&
    min_total_usd === undefined &&
    max_discount_usd === undefined &&
    description === undefined

  try {
    // Charger l'état actuel pour protections métier
    const { data: current, error: currentError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (currentError) throw currentError
    if (!current) {
      return NextResponse.json({ error: 'Code promo introuvable.' }, { status: 404 })
    }

    const currentNormalized = normalizePromoRow(current)
    const alreadyUsed = toNumber(currentNormalized.utilisations_actuelles, 0) > 0

    if (isToggleOnly) {
      if (!availableColumns.has('actif')) {
        return NextResponse.json(
          { error: 'La colonne actif est indisponible dans cette table.' },
          { status: 500 }
        )
      }

      const { error } = await supabase
        .from(tableName)
        .update({ actif })
        .eq('id', id)

      if (error) throw error

      invalidateCache()
      return NextResponse.json({ success: true, actif })
    }

    // Édition complète
    if (code !== undefined && alreadyUsed) {
      return NextResponse.json(
        {
          error:
            'Impossible de modifier le code d’une promotion déjà utilisée. Modifiez plutôt ses paramètres ou désactivez-la.',
        },
        { status: 400 }
      )
    }

    if (code !== undefined) {
      const { data: duplicate } = await supabase
        .from(tableName)
        .select('id')
        .eq('code', code)
        .neq('id', id)
        .maybeSingle()

      if (duplicate) {
        return NextResponse.json(
          { error: `Le code "${code}" existe déjà.` },
          { status: 409 }
        )
      }
    }

    const effectiveValue =
      value != null ? value : reduction_percent != null ? reduction_percent : undefined

    if (effectiveValue != null && effectiveValue <= 0) {
      return NextResponse.json(
        { error: 'La valeur de réduction doit être supérieure à 0.' },
        { status: 400 }
      )
    }

    if (type === 'percent' && effectiveValue != null && effectiveValue > 99) {
      return NextResponse.json(
        { error: 'Une réduction en pourcentage ne peut pas dépasser 99%.' },
        { status: 400 }
      )
    }

    const updatePayload: Record<string, any> = {}

    if (code !== undefined && availableColumns.has('code')) {
      updatePayload.code = String(code).trim().toUpperCase()
    }

    if (type !== undefined && availableColumns.has('type')) {
      updatePayload.type = type
    }

    if (effectiveValue != null) {
      if (availableColumns.has('value')) {
        updatePayload.value = effectiveValue
      }

      if (availableColumns.has('reduction_percent') && type !== 'fixed') {
        updatePayload.reduction_percent = effectiveValue
      }
    }

    if (max_utilisations !== undefined && availableColumns.has('max_utilisations')) {
      updatePayload.max_utilisations = Math.max(1, Math.floor(max_utilisations))
    }

    if (expires_at !== undefined && availableColumns.has('expires_at')) {
      updatePayload.expires_at = expires_at ? new Date(expires_at).toISOString() : null
    }

    if (min_total_usd !== undefined && availableColumns.has('min_total_usd')) {
      updatePayload.min_total_usd = toNumber(min_total_usd, 0)
    }

    if (max_discount_usd !== undefined && availableColumns.has('max_discount_usd')) {
      updatePayload.max_discount_usd = toNumber(max_discount_usd, 0)
    }

    if (description !== undefined && availableColumns.has('description')) {
      updatePayload.description = description?.trim() || null
    }

    if (actif !== undefined && availableColumns.has('actif')) {
      updatePayload.actif = actif
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ success: true, message: 'Aucune modification.' })
    }

    const { data: updated, error } = await supabase
      .from(tableName)
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    invalidateCache()
    return NextResponse.json({ success: true, code: normalizePromoRow(updated) })
  } catch (error: any) {
    logger.error('Crash PUT admin/codes', error)
    return NextResponse.json(
      { error: error?.message || 'Erreur lors de la mise à jour.' },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE – Suppression protégée                                  */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-codes-delete:${ip}`,
    maxRequests: 10,
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

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const parsed = deleteSchema.safeParse({ id })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ID du code requis (UUID valide).' },
      { status: 400 }
    )
  }

  const supabase = await getSupabase()

  if (!supabase) {
    return NextResponse.json(
      { error: 'Service Supabase indisponible.' },
      { status: 503 }
    )
  }

  const tableName = await resolvePromoTable(supabase)

  if (!tableName) {
    return NextResponse.json(
      { error: 'Aucune table promo disponible.' },
      { status: 500 }
    )
  }

  try {
    const { data: current, error: currentError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (currentError) throw currentError
    if (!current) {
      return NextResponse.json({ error: 'Code promo introuvable.' }, { status: 404 })
    }

    const normalized = normalizePromoRow(current)
    const used = toNumber(normalized.utilisations_actuelles, 0)

    if (used > 0) {
      return NextResponse.json(
        {
          error:
            'Impossible de supprimer un code déjà utilisé. Désactivez-le plutôt pour préserver l’historique.',
        },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', parsed.data.id)

    if (error) throw error

    invalidateCache()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Crash DELETE admin/codes', error)
    return NextResponse.json(
      { error: error?.message || 'Erreur lors de la suppression.' },
      { status: 500 }
    )
  }
}