// app/api/user/addresses/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { logActivity, getRequestMeta } from '@/lib/activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

const MAX_ADDRESSES_PER_USER = 10

const ADDRESS_TABLES = ['user_addresses', 'addresses'] as const

const ADDRESS_TYPES = ['maison', 'bureau', 'point_retrait', 'autre'] as const

/* ------------------------------------------------------------------ */
/* Schémas                                                             */
/* ------------------------------------------------------------------ */

const addressSchema = z.object({
  nom: z.string().min(1, 'Le nom de l\'adresse est requis').max(120),
  destinataire: z.string().max(160).optional().nullable(),
  telephone: z
    .string()
    .regex(/^0[0-9]{9}$/, 'Numéro invalide (format : 08xxxxxxxx)')
    .optional()
    .nullable()
    .or(z.literal('')),
  type: z.enum(ADDRESS_TYPES).optional().default('maison'),
  province_id: z.any().optional().nullable(),
  ville_id: z.any().optional().nullable(),
  commune_id: z.any().optional().nullable(),
  quartier: z.string().max(160).optional().nullable(),
  avenue: z.string().max(160).optional().nullable(),
  numero: z.string().max(50).optional().nullable(),
  reference: z.string().max(255).optional().nullable(),
  is_default: z.boolean().optional().default(false),
})

const patchSchema = addressSchema.partial().extend({
  id: z.string().min(1, 'ID requis'),
})

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

function isMissingTableError(error: any) {
  return (
    error?.code === '42P01' ||
    String(error?.message || '').toLowerCase().includes('does not exist') ||
    String(error?.details || '').toLowerCase().includes('does not exist')
  )
}

function isMissingColumnError(error: any) {
  return (
    error?.code === '42703' ||
    String(error?.message || '').toLowerCase().includes('column') ||
    String(error?.details || '').toLowerCase().includes('column')
  )
}

function extractMissingColumn(error: any): string | null {
  const message = String(error?.message || error?.details || '')

  const match =
    message.match(/column\s+"?([a-zA-Z0-9_]+)"?/i) ||
    message.match(/field\s+"?([a-zA-Z0-9_]+)"?/i) ||
    message.match(/Could not find the ([a-zA-Z0-9_]+)/i)

  return match?.[1] || null
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'X-Robots-Tag': 'noindex, nofollow',
  }
}

function buildAddressText(address: any) {
  return [
    address?.quartier,
    address?.avenue,
    address?.numero,
    address?.reference,
  ]
    .filter(Boolean)
    .join(', ')
}

function normalizeAddress(address: any) {
  if (!address) return address

  return {
    ...address,
    adresse_text: address.adresse_text || buildAddressText(address),
  }
}

async function listAddresses(supabase: any, userId: string) {
  for (const table of ADDRESS_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (!error) {
        return {
          table,
          data: (data || []).map(normalizeAddress),
        }
      }

      if (!isMissingTableError(error)) {
        logger.error('Erreur lecture adresses', {
          userId,
          table,
          error,
        })
      }
    } catch (error: any) {
      logger.error('Crash lecture adresses', {
        userId,
        table,
        error: error?.message,
      })
    }
  }

  return { table: null, data: [] }
}

async function countAddresses(supabase: any, userId: string) {
  for (const table of ADDRESS_TABLES) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      if (!error) return count || 0
    } catch {
      // ignore
    }
  }

  return 0
}

async function unsetOtherDefaults(
  supabase: any,
  table: string,
  userId: string,
  excludeId?: string
) {
  try {
    let query = supabase
      .from(table)
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('is_default', true)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { error } = await query

    if (error && !isMissingColumnError(error) && !isMissingTableError(error)) {
      logger.warn('Erreur désactivation autres adresses par défaut', {
        userId,
        table,
        error: error.message,
      })
    }
  } catch (error: any) {
    logger.warn('Crash désactivation autres adresses par défaut', {
      userId,
      table,
      error: error?.message,
    })
  }
}

async function insertWithColumnFallback(
  supabase: any,
  table: string,
  payload: Record<string, any>
) {
  let current = { ...payload }
  let lastError: any = null

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const { data, error } = await supabase
        .from(table)
        .insert(current)
        .select()
        .single()

      if (!error) return { data: normalizeAddress(data), error: null }

      lastError = error

      if (isMissingTableError(error)) {
        return { data: null, error }
      }

      const missingColumn = extractMissingColumn(error)

      if (
        missingColumn &&
        missingColumn !== 'user_id' &&
        missingColumn !== 'nom' &&
        Object.prototype.hasOwnProperty.call(current, missingColumn)
      ) {
        delete current[missingColumn]
        continue
      }

      return { data: null, error }
    } catch (error: any) {
      lastError = error
      return { data: null, error }
    }
  }

  return { data: null, error: lastError }
}

async function updateWithColumnFallback(
  supabase: any,
  table: string,
  id: string,
  userId: string,
  payload: Record<string, any>
) {
  let current = { ...payload }
  let lastError: any = null

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const { data, error } = await supabase
        .from(table)
        .update(current)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()

      if (!error) return { data: normalizeAddress(data), error: null }

      lastError = error

      if (isMissingTableError(error)) {
        return { data: null, error }
      }

      const missingColumn = extractMissingColumn(error)

      if (
        missingColumn &&
        missingColumn !== 'id' &&
        missingColumn !== 'user_id' &&
        Object.prototype.hasOwnProperty.call(current, missingColumn)
      ) {
        delete current[missingColumn]
        continue
      }

      return { data: null, error }
    } catch (error: any) {
      lastError = error
      return { data: null, error }
    }
  }

  return { data: null, error: lastError }
}

function buildInsertPayload(userId: string, data: z.infer<typeof addressSchema>) {
  return {
    user_id: userId,
    nom: data.nom.trim(),
    destinataire: data.destinataire?.trim() || null,
    telephone: data.telephone?.trim() || null,
    type: data.type || 'maison',
    province_id: data.province_id ?? null,
    ville_id: data.ville_id ?? null,
    commune_id: data.commune_id ?? null,
    quartier: data.quartier?.trim() || null,
    avenue: data.avenue?.trim() || null,
    numero: data.numero?.trim() || null,
    reference: data.reference?.trim() || null,
    is_default: Boolean(data.is_default),
  }
}

function buildUpdatePayload(data: z.infer<typeof patchSchema>) {
  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (data.nom !== undefined) payload.nom = String(data.nom).trim()
  if (data.destinataire !== undefined) payload.destinataire = data.destinataire?.trim() || null
  if (data.telephone !== undefined) payload.telephone = data.telephone?.trim() || null
  if (data.type !== undefined) payload.type = data.type
  if (data.province_id !== undefined) payload.province_id = data.province_id ?? null
  if (data.ville_id !== undefined) payload.ville_id = data.ville_id ?? null
  if (data.commune_id !== undefined) payload.commune_id = data.commune_id ?? null
  if (data.quartier !== undefined) payload.quartier = data.quartier?.trim() || null
  if (data.avenue !== undefined) payload.avenue = data.avenue?.trim() || null
  if (data.numero !== undefined) payload.numero = data.numero?.trim() || null
  if (data.reference !== undefined) payload.reference = data.reference?.trim() || null
  if (data.is_default !== undefined) payload.is_default = Boolean(data.is_default)

  return payload
}

/* ------------------------------------------------------------------ */
/* GET                                                                 */
/* ------------------------------------------------------------------ */

/**
 * GET /api/user/addresses
 * Liste les adresses de l'utilisateur connecté.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-addresses-get:${ip}`,
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
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const supabase = await createClient(true)

    const { table, data } = await listAddresses(supabase, user.id)

    const response = NextResponse.json({
      data,
      meta: {
        table,
        count: data.length,
      },
    })

    for (const [key, value] of Object.entries(noStoreHeaders())) {
      response.headers.set(key, value)
    }

    return response
  } catch (error: any) {
    logger.error('Crash GET /api/user/addresses', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* POST                                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/user/addresses
 * Crée une nouvelle adresse pour l'utilisateur connecté.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-addresses-post:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans une minute.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    let body: any

    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    const parsed = addressSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const count = await countAddresses(supabase, user.id)

    if (count >= MAX_ADDRESSES_PER_USER) {
      return NextResponse.json(
        {
          error: `Vous avez atteint le maximum de ${MAX_ADDRESSES_PER_USER} adresses.`,
        },
        { status: 400 }
      )
    }

    const payload = buildInsertPayload(user.id, parsed.data)

    let created: any = null
    let usedTable: string | null = null

    for (const table of ADDRESS_TABLES) {
      if (payload.is_default) {
        await unsetOtherDefaults(supabase, table, user.id)
      }

      const result = await insertWithColumnFallback(supabase, table, payload)

      if (result.data) {
        created = result.data
        usedTable = table
        break
      }

      if (!isMissingTableError(result.error)) {
        logger.error('Erreur insertion adresse', {
          userId: user.id,
          table,
          error: result.error,
        })
      }
    }

    if (!created) {
      return NextResponse.json(
        {
          error:
            'Aucune table d\'adresses disponible. Créez user_addresses ou addresses dans Supabase.',
          code: 'ADDRESS_TABLE_MISSING',
        },
        { status: 500 }
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'address_created',
      description: 'Nouvelle adresse ajoutée',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        address_id: created.id,
        table: usedTable,
      },
    })

    const response = NextResponse.json(
      { data: created },
      { status: 201 }
    )

    for (const [key, value] of Object.entries(noStoreHeaders())) {
      response.headers.set(key, value)
    }

    return response
  } catch (error: any) {
    logger.error('Crash POST /api/user/addresses', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* PATCH (fallback par body.id)                                        */
/* ------------------------------------------------------------------ */

/**
 * PATCH /api/user/addresses
 * Met à jour une adresse via { id, ...data }.
 * Fallback utile si la route dynamique [id] n'est pas atteinte.
 */
export async function PATCH(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-addresses-patch:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans une minute.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    let body: any

    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { id, ...data } = parsed.data

    const supabase = await createClient(true)

    let updated: any = null
    let usedTable: string | null = null

    for (const table of ADDRESS_TABLES) {
      const { data: existing, error: fetchError } = await supabase
        .from(table)
        .select('id, user_id, is_default')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (fetchError && !isMissingTableError(fetchError)) {
        logger.error('Erreur vérification adresse', {
          userId: user.id,
          addressId: id,
          table,
          error: fetchError,
        })
      }

      if (!existing) continue

      const payload = buildUpdatePayload(data as any)

      if (payload.is_default) {
        await unsetOtherDefaults(supabase, table, user.id, id)
      }

      const result = await updateWithColumnFallback(
        supabase,
        table,
        id,
        user.id,
        payload
      )

      if (result.data) {
        updated = result.data
        usedTable = table
        break
      }

      if (!isMissingTableError(result.error)) {
        logger.error('Erreur mise à jour adresse', {
          userId: user.id,
          addressId: id,
          table,
          error: result.error,
        })
      }
    }

    if (!updated) {
      return NextResponse.json(
        { error: 'Adresse introuvable ou non modifiable' },
        { status: 404 }
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'address_updated',
      description: 'Adresse mise à jour',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        address_id: id,
        table: usedTable,
        updated_fields: Object.keys(buildUpdatePayload(data as any)).filter(
          (k) => k !== 'updated_at'
        ),
      },
    })

    const response = NextResponse.json({ data: updated })

    for (const [key, value] of Object.entries(noStoreHeaders())) {
      response.headers.set(key, value)
    }

    return response
  } catch (error: any) {
    logger.error('Crash PATCH /api/user/addresses', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}