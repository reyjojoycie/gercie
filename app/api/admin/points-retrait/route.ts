// app/api/admin/points-retrait/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const getQuerySchema = z.object({
  search: z.string().optional().default(''),
  est_actif: z.enum(['all', 'true', 'false']).optional().default('all'),
  est_partenaire_verifie: z.enum(['all', 'true', 'false']).optional().default('all'),
  ville: z.string().optional().default(''),
  sort_by: z.enum(['nom', 'ville_nom', 'note_moyenne', 'created_at']).optional().default('nom'),
  sort_order: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  format: z.enum(['json', 'csv']).optional().default('json'),
})

const pointBodySchema = z.object({
  nom: z.string().min(2),
  adresse: z.string().min(5),
  commune_id: z.number().int().positive().nullable().optional(),
  telephone: z.string().optional().nullable(),
  horaires: z.string().optional().nullable(),
  est_actif: z.boolean().default(true),
  province_nom: z.string().optional().nullable(),
  ville_nom: z.string().optional().nullable(),
  quartier: z.string().optional().nullable(),
  avenue: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  photo_url: z.string().url().optional().nullable().or(z.literal('')),
  points_de_repere: z.string().optional().nullable(),
  instructions_retrait: z.string().optional().nullable(),
  contact_nom: z.string().optional().nullable(),
  type_etablissement: z.string().optional().nullable(),
  est_partenaire_verifie: z.boolean().default(false),
  note_moyenne: z.number().min(0).max(5).nullable().optional(),
})

// Cache mémoire
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30_000

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

function clearCachePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-points-retrait:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)

  try { await requireAdmin() } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })

  const { search, est_actif, est_partenaire_verifie, ville, sort_by, sort_order, page, limit, format } = parsed.data
  const offset = (page - 1) * limit

  const cacheKey = `admin-points:${JSON.stringify(parsed.data)}`
  if (format === 'json') { const cached = getCache(cacheKey); if (cached) return NextResponse.json(cached) }

  try {
    const supabase = await createClient(true)

    let query = supabase.from('points_retrait').select('*', { count: 'exact' })
    if (est_actif === 'true') query = query.eq('est_actif', true)
    else if (est_actif === 'false') query = query.eq('est_actif', false)
    if (est_partenaire_verifie === 'true') query = query.eq('est_partenaire_verifie', true)
    else if (est_partenaire_verifie === 'false') query = query.eq('est_partenaire_verifie', false)
    if (ville) query = query.ilike('ville_nom', `%${ville}%`)
    if (search) {
      const term = `%${search}%`
      query = query.or(`nom.ilike.${term},adresse.ilike.${term},ville_nom.ilike.${term},contact_nom.ilike.${term}`)
    }

    const ascending = sort_order === 'asc'
    query = query.order(sort_by, { ascending, nullsFirst: false })
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (format === 'csv') {
      const headers = ['Nom', 'Adresse', 'Ville', 'Téléphone', 'Actif', 'Vérifié']
      const rows = (data || []).map(p => [p.nom, p.adresse, p.ville_nom, p.telephone, p.est_actif ? 'Oui' : 'Non', p.est_partenaire_verifie ? 'Oui' : 'Non'])
      const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
      return new NextResponse(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
    }

    const response = { data: data || [], pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) } }
    setCache(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error(error, 'Crash GET admin/points-retrait')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({ id: `admin-points-post:${ip}`, maxRequests: 15, windowSeconds: 60 })
  if (!allowed) return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)

  try { await requireAdmin() } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }) }

  const parsed = pointBodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })

  try {
    const supabase = await createClient(true)
    const { data, error } = await supabase.from('points_retrait').insert({ ...parsed.data, created_at: new Date().toISOString() }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    clearCachePrefix('admin-points')
    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    logger.error(error, 'Crash POST admin/points-retrait')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({ id: `admin-points-put:${ip}`, maxRequests: 15, windowSeconds: 60 })
  if (!allowed) return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)

  try { await requireAdmin() } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  const pointId = segments[segments.length - 1]
  const parsedId = z.string().uuid().safeParse(pointId)
  if (!parsedId.success) return NextResponse.json({ error: 'ID UUID requis' }, { status: 400 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 }) }

  const parsed = pointBodySchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })

  try {
    const supabase = await createClient(true)
    const { error } = await supabase.from('points_retrait').update({ ...parsed.data, updated_at: new Date().toISOString() }).eq('id', parsedId.data)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    clearCachePrefix('admin-points')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, 'Crash PUT admin/points-retrait')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({ id: `admin-points-delete:${ip}`, maxRequests: 10, windowSeconds: 60 })
  if (!allowed) return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)

  try { await requireAdmin() } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  const pointId = segments[segments.length - 1]
  const parsedId = z.string().uuid().safeParse(pointId)
  if (!parsedId.success) return NextResponse.json({ error: 'ID UUID requis' }, { status: 400 })

  try {
    const supabase = await createClient(true)
    const { error } = await supabase.from('points_retrait').delete().eq('id', parsedId.data)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    clearCachePrefix('admin-points')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, 'Crash DELETE admin/points-retrait')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}