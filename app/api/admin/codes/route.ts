// app/api/admin/codes/route.ts
import { createServiceClient } from '@/lib/supabaseServer' // 👈 Modification ici
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/* Schémas de validation                                                     */
/* ========================================================================== */

const getQuerySchema = z.object({
  search: z.string().optional().default(''),
  statut: z.enum(['all', 'actif', 'epuise']).optional().default('all'),
  sort_by: z.enum(['created_at', 'code', 'reduction_percent']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
})

const generateSchema = z.object({
  count: z.number().int().min(1).max(100),
  reduction_percent: z.number().int().min(1).max(99),
  max_utilisations: z.number().int().min(1).max(1000).default(1),
  expires_at: z.string().optional(),
})

const toggleSchema = z.object({
  id: z.string().uuid(),
  actif: z.boolean(),
})

/* ========================================================================== */
/* Cache mémoire simple                                                      */
/* ========================================================================== */
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 15_000

function getCache(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() })
}

/* ========================================================================== */
/* GET – Liste des codes promo                                               */
/* ========================================================================== */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-codes:${ip}`,
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
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const { search, statut, sort_by, sort_order, page, limit } = parsed.data
  const offset = (page - 1) * limit

  const cacheKey = `admin-codes-promo:${JSON.stringify(parsed.data)}`
  const cached = getCache(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const supabase = createServiceClient() // 👈 Remplacement (synchrone, pas de await)

    let query = supabase
      .from('codes_promo')
      .select('*', { count: 'exact' })

    if (search) {
      query = query.ilike('code', `%${search}%`)
    }

    if (statut === 'actif') {
      query = query.eq('actif', true)
    } else if (statut === 'epuise') {
      query = query.lt('utilisations_actuelles', query.raw('max_utilisations')).eq('actif', true)
    }

    const ascending = sort_order === 'asc'
    query = query.order(sort_by, { ascending })

    query = query.range(offset, offset + limit - 1)

    const { data: codes, error, count } = await query

    if (error) {
      // Table manquante ou colonne inexistante : on renvoie un tableau vide
      logger.warn('Erreur GET codes_promo : ' + error.message)
      return NextResponse.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } })
    }

    const response = {
      data: codes || [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    }

    setCache(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error('Crash GET admin/codes', error)
    // En cas d'erreur inconnue, on renvoie un tableau vide plutôt qu'une 500
    return NextResponse.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } })
  }
}

/* ========================================================================== */
/* POST – Génération de codes promo                                          */
/* ========================================================================== */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
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
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { count, reduction_percent, max_utilisations, expires_at } = parsed.data

  try {
    const supabase = createServiceClient() // 👈 Remplacement (synchrone, pas de await)
    const batch: any[] = []

    for (let i = 0; i < count; i++) {
      const code = Array.from({ length: 8 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
      ).join('')

      const { data: existing } = await supabase
        .from('codes_promo')
        .select('id')
        .eq('code', code)
        .maybeSingle()

      if (existing) {
        i--
        continue
      }

      batch.push({
        code,
        reduction_percent,
        max_utilisations,
        expires_at: expires_at ? new Date(expires_at).toISOString() : null,
        created_at: new Date().toISOString(),
      })
    }

    const { error: insertErr } = await supabase.from('codes_promo').insert(batch)
    if (insertErr) throw insertErr

    cache.clear()
    return NextResponse.json({ codes: batch.map(b => b.code), count: batch.length }, { status: 201 })
  } catch (error: any) {
    logger.error('Crash POST admin/codes', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/* ========================================================================== */
/* PUT – Activer / désactiver un code promo                                  */
/* ========================================================================== */
export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
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
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = toggleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient() // 👈 Remplacement (synchrone, pas de await)
    const { error } = await supabase
      .from('codes_promo')
      .update({ actif: parsed.data.actif })
      .eq('id', parsed.data.id)

    if (error) throw error
    cache.clear()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/* ========================================================================== */
/* DELETE – Supprimer un code promo (s’il n’a jamais été utilisé)            */
/* ========================================================================== */
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
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
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID du code requis (UUID valide)' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient() // 👈 Remplacement (synchrone, pas de await)

    const { data: code } = await supabase
      .from('codes_promo')
      .select('utilisations_actuelles')
      .eq('id', id)
      .single()

    if (!code) return NextResponse.json({ error: 'Code introuvable' }, { status: 404 })
    if (code.utilisations_actuelles > 0) {
      return NextResponse.json({ error: 'Impossible de supprimer un code déjà utilisé' }, { status: 400 })
    }

    const { error } = await supabase.from('codes_promo').delete().eq('id', id)
    if (error) throw error

    cache.clear()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}