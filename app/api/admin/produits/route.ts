// app/api/admin/produits/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { createProductSchema } from '@/lib/validations/product'

/* ========================================================================== */
/*  Schémas de validation additionnels                                         */
/* ========================================================================== */
const getQuerySchema = z.object({
  search: z.string().optional().default(''),
  categorie: z.string().optional().default(''),
  est_actif: z.enum(['all', 'true', 'false']).optional().default('all'),
  min_prix: z.coerce.number().optional(),
  max_prix: z.coerce.number().optional(),
  min_stock: z.coerce.number().optional(),
  max_stock: z.coerce.number().optional(),
  sort_by: z.enum(['created_at', 'prix', 'nom', 'stock', 'total_ventes']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  format: z.enum(['json', 'csv']).optional().default('json'),
})

/* ========================================================================== */
/*  Cache simple (30 secondes)                                                 */
/* ========================================================================== */
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

/* ========================================================================== */
/*  GET – Liste paginée, filtrée, triée                                        */
/* ========================================================================== */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-produits:${ip}`,
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
    return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { search, categorie, est_actif, min_prix, max_prix, min_stock, max_stock, sort_by, sort_order, page, limit, format } = parsed.data
  const offset = (page - 1) * limit

  const cacheKey = `admin-produits:${JSON.stringify(parsed.data)}`
  if (format === 'json') {
    const cached = getCache(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const supabase = await createClient(true)

    // Statistiques globales (hors pagination)
    const [totalRes, actifsRes, ruptureRes] = await Promise.all([
      supabase.from('produits').select('*', { count: 'exact', head: true }),
      supabase.from('produits').select('*', { count: 'exact', head: true }).eq('est_actif', true),
      supabase.from('produits').select('*', { count: 'exact', head: true }).eq('est_actif', true).lte('stock', 0),
    ])

    // Requête principale
    let query = supabase
      .from('produits')
      .select('*', { count: 'exact' })

    // Filtres
    if (est_actif === 'true') query = query.eq('est_actif', true)
    else if (est_actif === 'false') query = query.eq('est_actif', false)

    if (categorie) {
      query = query.ilike('categorie', `%${categorie}%`)
    }

    if (search) {
      const term = `%${search}%`
      query = query.or(`nom.ilike.${term},description.ilike.${term},categorie.ilike.${term}`)
    }

    if (min_prix !== undefined) query = query.gte('prix', min_prix)
    if (max_prix !== undefined) query = query.lte('prix', max_prix)
    if (min_stock !== undefined) query = query.gte('stock', min_stock)
    if (max_stock !== undefined) query = query.lte('stock', max_stock)

    // Tri
    const ascending = sort_order === 'asc'
    if (sort_by === 'nom') {
      query = query.order('nom', { ascending })
    } else if (sort_by === 'prix') {
      query = query.order('prix', { ascending })
    } else if (sort_by === 'stock') {
      query = query.order('stock', { ascending })
    } else if (sort_by === 'total_ventes') {
      query = query.order('total_ventes', { ascending, nullsFirst: false })
    } else {
      query = query.order('created_at', { ascending })
    }

    // Pagination
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) {
      logger.error(error, 'Erreur récupération produits')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const response = {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
      stats: {
        total: totalRes.count ?? 0,
        actifs: actifsRes.count ?? 0,
        rupture: ruptureRes.count ?? 0,
      },
    }

    // Export CSV
    if (format === 'csv') {
      const headers = ['ID', 'Nom', 'Prix (FC)', 'Stock', 'Actif', 'Catégorie', 'Ventes']
      const rows = (data || []).map(p => [
        p.id, p.nom, p.prix, p.stock,
        p.est_actif ? 'Oui' : 'Non', p.categorie, p.total_ventes || 0
      ])
      const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=produits_${new Date().toISOString().slice(0,10)}.csv`,
        },
      })
    }

    setCache(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error(error, 'Crash GET admin/produits')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  POST – Création d'un produit                                               */
/* ========================================================================== */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-produits-post:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let currentUser: { id: string }
  try {
    currentUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = createProductSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const productData = {
    ...parsed.data,
    vendeur_id: currentUser.id,
    created_at: new Date().toISOString(),
  }

  try {
    const supabase = await createClient(true)
    const { data, error } = await supabase
      .from('produits')
      .insert(productData)
      .select()
      .single()

    if (error) {
      logger.error(error, 'Erreur création produit')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    clearCachePrefix('admin-produits')
    logger.info(`Produit créé : ${data.id} - ${data.nom}`)

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    logger.error(error, 'Crash POST admin/produits')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  PATCH – Toggle actif/inactif (ou mise à jour partielle)                    */
/* ========================================================================== */
export async function PATCH(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-produits-patch:${ip}`,
    maxRequests: 15,
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

  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  const productId = segments[segments.length - 1]
  const idSchema = z.string().uuid('ID produit invalide')
  const parsedId = idSchema.safeParse(productId)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID produit requis (UUID valide)' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const patchSchema = z.object({
    est_actif: z.boolean().optional(),
    stock: z.number().int().min(0).optional(),
    prix: z.number().positive().optional(),
  })
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)
    const { error } = await supabase
      .from('produits')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', parsedId.data)

    if (error) {
      logger.error(error, `Erreur PATCH produit ${parsedId.data}`)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    clearCachePrefix('admin-produits')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, 'Crash PATCH admin/produits')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  DELETE – Suppression d'un produit                                          */
/* ========================================================================== */
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-produits-delete:${ip}`,
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

  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  const productId = segments[segments.length - 1]
  const idSchema = z.string().uuid('ID produit invalide')
  const parsedId = idSchema.safeParse(productId)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID produit requis (UUID valide)' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)
    const { error } = await supabase
      .from('produits')
      .delete()
      .eq('id', parsedId.data)

    if (error) {
      logger.error(error, `Erreur suppression produit ${parsedId.data}`)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    clearCachePrefix('admin-produits')
    logger.info(`Produit ${parsedId.data} supprimé`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, 'Crash DELETE admin/produits')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}