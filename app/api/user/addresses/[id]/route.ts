// app/api/user/addresses/[id]/route.ts
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

const ADDRESS_TABLES = ['user_addresses', 'addresses'] as const

const ADDRESS_TYPES = ['maison', 'bureau', 'point_retrait', 'autre'] as const

/* ------------------------------------------------------------------ */
/* Schémas                                                             */
/* ------------------------------------------------------------------ */

const paramsSchema = z.object({
  id: z.string().uuid('ID d\'adresse invalide'),
})

const updateSchema = z.object({
  nom: z.string().min(1).max(120).optional(),
  destinataire: z.string().max(160).optional().nullable(),
  telephone: z
    .string()
    .regex(/^0[0-9]{9}$/, 'Numéro invalide (format : 08xxxxxxxx)')
    .optional()
    .nullable()
    .or(z.literal('')),
  type: z.enum(ADDRESS_TYPES).optional(),
  province_id: z.any().optional().nullable(),
  ville_id: z.any().optional().nullable(),
  commune_id: z.any().optional().nullable(),
  quartier: z.string().max(160).optional().nullable(),
  avenue: z.string().max(160).optional().nullable(),
  numero: z.string().max(50).optional().nullable(),
  reference: z.string().max(255).optional().nullable(),
  is_default: z.boolean().optional(),
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

async function findAddress(
  supabase: any,
  id: string,
  userId: string
): Promise<{ table: string; address: any } | null> {
  for (const table of ADDRESS_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle()

      if (!error && data) {
        return { table, address: normalizeAddress(data) }
      }

      if (error && !isMissingTableError(error)) {
        logger.error('Erreur recherche adresse', {
          userId,
          addressId: id,
          table,
          error,
        })
      }
    } catch (error: any) {
      logger.error('Crash recherche adresse', {
        userId,
        addressId: id,
        table,
        error: error?.message,
      })
    }
  }

  return null
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

async function promoteAnotherDefaultIfNeeded(
  supabase: any,
  table: string,
  userId: string,
  deletedId: string
) {
  try {
    const { data: remaining, error } = await supabase
      .from(table)
      .select('id')
      .eq('user_id', userId)
      .neq('id', deletedId)
      .order('created_at', { ascending: true })
      .limit(1)

    if (error || !remaining || remaining.length === 0) return

    await supabase
      .from(table)
      .update({ is_default: true })
      .eq('id', remaining[0].id)
      .eq('user_id', userId)
  } catch (error: any) {
    logger.warn('Erreur promotion nouvelle adresse par défaut', {
      userId,
      table,
      deletedId,
      error: error?.message,
    })
  }
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

function buildUpdatePayload(data: z.infer<typeof updateSchema>) {
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
 * GET /api/user/addresses/[id]
 * Récupère une adresse spécifique de l'utilisateur connecté.
 */
export async function GET(
  request: Request,
  context: any
) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-address-detail-get:${ip}`,
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

    const params = await context?.params
    const parsedParams = paramsSchema.safeParse(params)

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'ID d\'adresse invalide' },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const found = await findAddress(supabase, parsedParams.data.id, user.id)

    if (!found) {
      return NextResponse.json(
        { error: 'Adresse introuvable' },
        { status: 404 }
      )
    }

    const response = NextResponse.json({ data: found.address })

    for (const [key, value] of Object.entries(noStoreHeaders())) {
      response.headers.set(key, value)
    }

    return response
  } catch (error: any) {
    logger.error('Crash GET /api/user/addresses/[id]', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* PATCH                                                               */
/* ------------------------------------------------------------------ */

/**
 * PATCH /api/user/addresses/[id]
 * Met à jour une adresse spécifique.
 */
export async function PATCH(
  request: Request,
  context: any
) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-address-patch:${ip}`,
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

    const params = await context?.params
    const parsedParams = paramsSchema.safeParse(params)

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'ID d\'adresse invalide' },
        { status: 400 }
      )
    }

    let body: any

    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    const parsedBody = updateSchema.safeParse(body)

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsedBody.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const found = await findAddress(supabase, parsedParams.data.id, user.id)

    if (!found) {
      return NextResponse.json(
        { error: 'Adresse introuvable' },
        { status: 404 }
      )
    }

    const payload = buildUpdatePayload(parsedBody.data)

    if (Object.keys(payload).length === 1 && payload.updated_at) {
      return NextResponse.json(
        { error: 'Aucune donnée à mettre à jour' },
        { status: 400 }
      )
    }

    if (payload.is_default) {
      await unsetOtherDefaults(
        supabase,
        found.table,
        user.id,
        parsedParams.data.id
      )
    }

    const result = await updateWithColumnFallback(
      supabase,
      found.table,
      parsedParams.data.id,
      user.id,
      payload
    )

    if (!result.data) {
      logger.error('Erreur mise à jour adresse [id]', {
        userId: user.id,
        addressId: parsedParams.data.id,
        table: found.table,
        error: result.error,
      })

      return NextResponse.json(
        { error: 'Impossible de mettre à jour l\'adresse' },
        { status: 500 }
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
        address_id: parsedParams.data.id,
        table: found.table,
        updated_fields: Object.keys(payload).filter((k) => k !== 'updated_at'),
      },
    })

    const response = NextResponse.json({ data: result.data })

    for (const [key, value] of Object.entries(noStoreHeaders())) {
      response.headers.set(key, value)
    }

    return response
  } catch (error: any) {
    logger.error('Crash PATCH /api/user/addresses/[id]', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* PUT (alias de PATCH)                                                */
/* ------------------------------------------------------------------ */

/**
 * PUT /api/user/addresses/[id]
 * Alias compatible avec les anciens appels PUT.
 */
export async function PUT(
  request: Request,
  context: any
) {
  return PATCH(request, context)
}

/* ------------------------------------------------------------------ */
/* DELETE                                                              */
/* ------------------------------------------------------------------ */

/**
 * DELETE /api/user/addresses/[id]
 * Supprime une adresse spécifique.
 */
export async function DELETE(
  request: Request,
  context: any
) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-address-delete:${ip}`,
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

    const params = await context?.params
    const parsedParams = paramsSchema.safeParse(params)

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'ID d\'adresse invalide' },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const found = await findAddress(supabase, parsedParams.data.id, user.id)

    if (!found) {
      return NextResponse.json(
        { error: 'Adresse introuvable' },
        { status: 404 }
      )
    }

    const wasDefault = Boolean(found.address.is_default)

    const { error: deleteError } = await supabase
      .from(found.table)
      .delete()
      .eq('id', parsedParams.data.id)
      .eq('user_id', user.id)

    if (deleteError) {
      logger.error('Erreur suppression adresse [id]', {
        userId: user.id,
        addressId: parsedParams.data.id,
        table: found.table,
        error: deleteError,
      })

      return NextResponse.json(
        { error: 'Impossible de supprimer l\'adresse' },
        { status: 500 }
      )
    }

    if (wasDefault) {
      await promoteAnotherDefaultIfNeeded(
        supabase,
        found.table,
        user.id,
        parsedParams.data.id
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'address_deleted',
      description: 'Adresse supprimée',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        address_id: parsedParams.data.id,
        table: found.table,
        was_default: wasDefault,
      },
    })

    const response = NextResponse.json({ success: true })

    for (const [key, value] of Object.entries(noStoreHeaders())) {
      response.headers.set(key, value)
    }

    return response
  } catch (error: any) {
    logger.error('Crash DELETE /api/user/addresses/[id]', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}