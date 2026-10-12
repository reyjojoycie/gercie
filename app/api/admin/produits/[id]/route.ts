// app/api/admin/produits/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { updateProductSchema } from '@/lib/validations/product'

/* ========================================================================== */
/*  Cache simple (partagé)                                                    */
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

const idSchema = z.string().uuid('ID produit invalide')

/* ========================================================================== */
/*  GET – Détail d’un produit                                                  */
/* ========================================================================== */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-produit-get:${ip}`,
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

  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID produit invalide' }, { status: 400 })
  }

  const cacheKey = `admin-produit:${parsedId.data}`
  const cached = getCache(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const supabase = await createClient(true)
    const { data, error } = await supabase
      .from('produits')
      .select('*')
      .eq('id', parsedId.data)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }

    setCache(cacheKey, data)
    return NextResponse.json(data)
  } catch (error: any) {
    logger.error(error, `Crash GET admin/produits/${id}`)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  PUT – Mise à jour complète d’un produit                                   */
/* ========================================================================== */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-produit-put:${ip}`,
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

  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID produit invalide' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = updateProductSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient(true)

    const { data: existing, error: fetchError } = await supabase
      .from('produits')
      .select('id')
      .eq('id', parsedId.data)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from('produits')
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsedId.data)

    if (updateError) {
      logger.error(updateError, `Erreur PUT admin/produits/${id}`)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    clearCachePrefix('admin-produits')
    clearCachePrefix('admin-produit')

    logger.info(`Produit ${parsedId.data} mis à jour`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, `Crash PUT admin/produits/${id}`)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  DELETE – Suppression d’un produit                                          */
/* ========================================================================== */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-produit-delete:${ip}`,
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

  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID produit invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    const { error } = await supabase
      .from('produits')
      .delete()
      .eq('id', parsedId.data)

    if (error) {
      logger.error(error, `Erreur DELETE admin/produits/${id}`)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    clearCachePrefix('admin-produits')
    clearCachePrefix('admin-produit')

    logger.info(`Produit ${parsedId.data} supprimé`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, `Crash DELETE admin/produits/${id}`)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}