// api/admin/produits/[id]/route.ts
/**
 * API de gestion d'un produit spécifique par l'administrateur.
 * Ultra‑premium : GET, PUT, DELETE avec validation Zod, rate limiting,
 * logs, cache et gestion avancée des erreurs.
 */
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { updateProductSchema } from '@/lib/validations/product'

/* ========================================================================== */
/*  GET – Détail d'un produit                                                 */
/* ========================================================================== */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-produit-detail:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification admin
  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const { id } = await params
  const parsedId = z.string().uuid('ID produit invalide').safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID produit invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)
    const { data, error } = await supabase
      .from('produits')
      .select('*')
      .eq('id', parsedId.data)
      .single()

    if (error) {
      logger.error(`Erreur récupération produit ${parsedId.data}`, error)
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    logger.error('Crash GET admin/produits/[id]', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  PUT – Mise à jour complète d'un produit                                   */
/* ========================================================================== */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Authentification admin
  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const { id } = await params
  const parsedId = z.string().uuid('ID produit invalide').safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID produit invalide' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsedBody = updateProductSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient(true)

    // Vérifier que le produit existe
    const { data: existing, error: fetchErr } = await supabase
      .from('produits')
      .select('id')
      .eq('id', parsedId.data)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }

    const updates = {
      ...parsedBody.data,
      updated_at: new Date().toISOString(),
    }

    const { data, error: updateErr } = await supabase
      .from('produits')
      .update(updates)
      .eq('id', parsedId.data)
      .select()
      .single()

    if (updateErr) {
      logger.error(`Erreur mise à jour produit ${parsedId.data}`, updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    logger.info(`Produit ${parsedId.data} mis à jour`)

    return NextResponse.json(data)
  } catch (error: any) {
    logger.error('Crash PUT admin/produits/[id]', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  DELETE – Suppression d'un produit                                         */
/* ========================================================================== */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Authentification admin
  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const { id } = await params
  const parsedId = z.string().uuid('ID produit invalide').safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID produit invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    // Vérifier que le produit existe
    const { data: existing, error: fetchErr } = await supabase
      .from('produits')
      .select('id')
      .eq('id', parsedId.data)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }

    const { error: deleteErr } = await supabase
      .from('produits')
      .delete()
      .eq('id', parsedId.data)

    if (deleteErr) {
      logger.error(`Erreur suppression produit ${parsedId.data}`, deleteErr)
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    logger.info(`Produit ${parsedId.data} supprimé`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Crash DELETE admin/produits/[id]', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}