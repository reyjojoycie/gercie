// app/api/livreur/alertes/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireLivreur } from '@/lib/auth/livreurGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// Schémas de validation
// ---------------------------------------------------------------------------
const getAlertesSchema = z.object({
  non_lues: z.enum(['true', 'false']).optional(),
  type: z.enum(['danger', 'warning', 'info']).optional(),
  criticite: z.coerce.number().int().min(1).max(3).optional(),
  search: z.string().max(200).optional(),
  date_debut: z.string().datetime().optional(),
  date_fin: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  tri: z.enum(['created_at', 'criticite']).optional().default('created_at'),
  ordre: z.enum(['asc', 'desc']).optional().default('desc'),
})

const putAlertesSchema = z.object({
  alerte_ids: z.array(z.string().uuid()).optional(),
  toutes: z.boolean().optional(),
  idempotency_key: z.string().uuid().optional(),
})

const deleteAlertesSchema = z.object({
  alerte_ids: z.array(z.string().uuid()).min(1),
})

// ---------------------------------------------------------------------------
// GET : liste des alertes du livreur
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  // Rate limiting : en cas d'échec, on continue quand même pour ne pas bloquer le dev
  try {
    const { rateLimit } = await import('@/lib/rateLimit')
    await rateLimit(request, { maxRequests: 30, windowMs: 60_000 })
  } catch (err: any) {
    // Si l'erreur est une 429, on la renvoie ; sinon on log et on continue
    if (err?.status === 429) {
      return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
    }
    logger.warn('Rate limiting non disponible, requête autorisée')
  }

  try {
    // Authentification + vérification du rôle livreur
    const user = await requireLivreur()
    const supabase = await createClient(true)

    // Optionnel : vérifier que le livreur est actif (table livreurs)
    // await verifyLivreur(supabase, user.id) → déjà fait par requireLivreur

    // Validation des paramètres
    const url = new URL(request.url)
    const params = Object.fromEntries(url.searchParams.entries())
    const parsed = getAlertesSchema.safeParse(params)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { non_lues, type, criticite, search, date_debut, date_fin, limit, offset, tri, ordre } = parsed.data

    let alertes: any[] = []
    let total = 0
    let nonLuesCount = 0

    try {
      let query = supabase
        .from('livreur_alertes')
        .select('*', { count: 'exact' })
        .eq('livreur_id', user.id)

      if (non_lues === 'true') query = query.eq('lue', false)
      if (type) query = query.eq('type', type)
      if (criticite) query = query.eq('criticite', criticite)
      if (search) query = query.or(`titre.ilike.%${search}%,message.ilike.%${search}%`)
      if (date_debut) query = query.gte('created_at', date_debut)
      if (date_fin) query = query.lte('created_at', date_fin)

      query = query.order(tri, { ascending: ordre === 'asc' }).range(offset, offset + limit - 1)

      const { data, error, count } = await query
      if (error) {
        logger.warn('Erreur récupération alertes (table peut être manquante) : ' + error.message)
      } else {
        alertes = data || []
        total = count || 0
      }

      // Nombre d'alertes non lues (indépendant des filtres)
      const { count: countNL } = await supabase
        .from('livreur_alertes')
        .select('*', { count: 'exact', head: true })
        .eq('livreur_id', user.id)
        .eq('lue', false)
      nonLuesCount = countNL || 0
    } catch (err) {
      logger.error(err, 'Exception GET alertes')
      return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
    }

    const pages = Math.ceil(total / limit)

    return NextResponse.json(
      {
        data: alertes,
        meta: { total, limit, offset, pages, non_lues: nonLuesCount },
        liens: {
          precedent: offset > 0 ? `/api/livreur/alertes?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null,
          suivant: offset + limit < total ? `/api/livreur/alertes?limit=${limit}&offset=${offset + limit}` : null,
        },
      },
      {
        headers: { 'X-Request-Id': uuidv4(), 'Cache-Control': 'private, max-age=5' },
      }
    )
  } catch (err: any) {
    if (err.message === 'Non authentifié') {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (err.message === 'Accès réservé aux livreurs') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }
    logger.error(err, 'Erreur GET /api/livreur/alertes')
    return NextResponse.json({ error: 'Erreur interne', trace_id: uuidv4() }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT : marquer une ou plusieurs alertes comme lues
// ---------------------------------------------------------------------------
export async function PUT(request: Request) {
  try {
    const { rateLimit } = await import('@/lib/rateLimit')
    await rateLimit(request, { maxRequests: 20, windowMs: 60_000 })
  } catch (err: any) {
    if (err?.status === 429) {
      return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
    }
    logger.warn('Rate limiting non disponible, requête autorisée')
  }

  try {
    const user = await requireLivreur()
    const supabase = await createClient(true)

    const body = await request.json()
    const parsed = putAlertesSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { alerte_ids, toutes, idempotency_key } = parsed.data

    // Idempotence simple
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from('livreur_alertes')
        .select('id')
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ success: true, message: 'Déjà marquées', idempotent: true })
      }
    }

    const now = new Date().toISOString()
    let updatedCount = 0

    if (toutes === true) {
      const { error, count } = await supabase
        .from('livreur_alertes')
        .update({ lue: true, lue_at: now })
        .eq('livreur_id', user.id)
        .eq('lue', false)
      if (error) {
        logger.error(error, 'Erreur marquage toutes alertes')
        return NextResponse.json({ error: 'Erreur lors du marquage' }, { status: 500 })
      }
      updatedCount = count || 0
    } else if (alerte_ids && alerte_ids.length > 0) {
      const { error, count } = await supabase
        .from('livreur_alertes')
        .update({ lue: true, lue_at: now })
        .in('id', alerte_ids)
        .eq('livreur_id', user.id)
      if (error) {
        logger.error(error, 'Erreur marquage alertes sélectionnées')
        return NextResponse.json({ error: 'Erreur lors du marquage' }, { status: 500 })
      }
      updatedCount = count || 0
    } else {
      return NextResponse.json({ error: 'Aucune alerte spécifiée' }, { status: 400 })
    }

    return NextResponse.json(
      { success: true, marquees: updatedCount, timestamp: now },
      { headers: { 'X-Request-Id': uuidv4() } }
    )
  } catch (err: any) {
    if (err.message === 'Non authentifié') return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    if (err.message === 'Accès réservé aux livreurs') return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    logger.error(err, 'Erreur PUT /api/livreur/alertes')
    return NextResponse.json({ error: 'Erreur interne', trace_id: uuidv4() }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE : supprimer une ou plusieurs alertes
// ---------------------------------------------------------------------------
export async function DELETE(request: Request) {
  try {
    const { rateLimit } = await import('@/lib/rateLimit')
    await rateLimit(request, { maxRequests: 10, windowMs: 60_000 })
  } catch (err: any) {
    if (err?.status === 429) {
      return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
    }
    logger.warn('Rate limiting non disponible, requête autorisée')
  }

  try {
    const user = await requireLivreur()
    const supabase = await createClient(true)

    const body = await request.json()
    const parsed = deleteAlertesSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { alerte_ids } = parsed.data

    const { error, count } = await supabase
      .from('livreur_alertes')
      .delete()
      .in('id', alerte_ids)
      .eq('livreur_id', user.id)

    if (error) {
      logger.error(error, 'Erreur suppression alertes')
      return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
    }

    return NextResponse.json(
      { success: true, supprimees: count || 0 },
      { headers: { 'X-Request-Id': uuidv4() } }
    )
  } catch (err: any) {
    if (err.message === 'Non authentifié') return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    if (err.message === 'Accès réservé aux livreurs') return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    logger.error(err, 'Erreur DELETE /api/livreur/alertes')
    return NextResponse.json({ error: 'Erreur interne', trace_id: uuidv4() }, { status: 500 })
  }
}