// app/api/admin/promotions/route.ts
import { createServiceClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Schémas de validation                                                     */
/* ========================================================================== */
const promoBaseSchema = z.object({
  produit_id: z.string().uuid('ID produit invalide').optional().nullable(),
  categorie_id: z.string().optional().nullable(),
  type_promo: z.enum(['prix_fixe', 'pourcentage', 'flash', 'lot_degressif', 'cadeau']).default('prix_fixe'),
  prix_promo: z.number().nonnegative().optional().nullable(),
  valeur_pourcentage: z.number().int().min(0).max(99).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  date_debut: z.string().min(1, 'Date de début requise'),
  date_fin: z.string().min(1, 'Date de fin requise'),
  actif: z.boolean().default(true),
  quantite_min: z.number().int().min(1).default(1).optional(),
  cumulable: z.boolean().default(false).optional(),
  banniere_url: z.string().url().optional().nullable().or(z.literal('')),
  produit_cadeau_id: z.string().uuid().optional().nullable(),
})

const createPromoSchema = promoBaseSchema
  .refine((data) => {
    // Au moins un produit_id ou un categorie_id
    if (!data.produit_id && !data.categorie_id) return false
    return true
  }, { message: 'Un produit ou une catégorie doit être spécifié' })
  .refine((data) => {
    // Si le type n'est pas 'cadeau' et pas 'pourcentage', il faut un prix
    if (data.type_promo !== 'cadeau' && data.type_promo !== 'pourcentage' && (!data.prix_promo || data.prix_promo <= 0)) {
      return false
    }
    if (data.type_promo === 'pourcentage' && (!data.valeur_pourcentage || data.valeur_pourcentage <= 0)) {
      return false
    }
    return true
  }, { message: 'Le prix ou le pourcentage de réduction est requis pour ce type de promotion' })
  .refine((data) => {
    if (data.date_debut && data.date_fin && new Date(data.date_fin) <= new Date(data.date_debut)) {
      return false
    }
    return true
  }, { message: 'La date de fin doit être postérieure à la date de début' })

/* ========================================================================== */
/*  Cache                                                                      */
/* ========================================================================== */
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 15_000

function getCache(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) { cache.delete(key); return null }
  return entry.data
}
function setCache(key: string, data: any) { cache.set(key, { data, timestamp: Date.now() }) }

/* ========================================================================== */
/*  GET – Liste des promotions                                                 */
/* ========================================================================== */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-promotions:${ip}`,
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

  const cacheKey = 'admin-promotions-list'
  const cached = getCache(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('promotions')
      .select(`*`)
      .order('date_debut', { ascending: false })

    if (error) {
      logger.warn('Erreur GET promotions : ' + error.message)
      return NextResponse.json([])
    }

    // Récupérer les infos produits associées (batch)
    const produitIds = [...new Set((data || []).map(p => p.produit_id).filter(Boolean))]
    let produitsMap: Record<string, any> = {}
    if (produitIds.length > 0) {
      const { data: produits } = await supabase
        .from('produits')
        .select('id, nom, prix, images')
        .in('id', produitIds)
      ;(produits || []).forEach((prod: any) => { produitsMap[prod.id] = prod })
    }

    const formatted = (data || []).map((p: any) => ({
      id: p.id,
      produit_id: p.produit_id,
      produit_nom: produitsMap[p.produit_id]?.nom || 'Produit inconnu',
      produit_prix: produitsMap[p.produit_id]?.prix || 0,
      produit_image: produitsMap[p.produit_id]?.images?.[0] || null,
      type_promo: p.type_promo || 'prix_fixe',
      prix_promo: p.prix_promo,
      valeur_pourcentage: p.valeur_pourcentage,
      description: p.description,
      date_debut: p.date_debut,
      date_fin: p.date_fin,
      actif: p.actif,
      quantite_min: p.quantite_min,
      cumulable: p.cumulable,
      banniere_url: p.banniere_url,
      produit_cadeau_id: p.produit_cadeau_id,
      categorie_id: p.categorie_id,
      created_at: p.created_at,
    }))

    setCache(cacheKey, formatted)
    return NextResponse.json(formatted)
  } catch (error: any) {
    logger.error(error, 'Crash GET admin/promotions')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  POST – Création d'une promotion                                            */
/* ========================================================================== */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-promotions-post:${ip}`,
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

  const parsed = createPromoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const supabase = createServiceClient()

    // Si la promotion est active et qu'un produit_id est fourni, désactiver les autres promotions actives sur ce produit
    if (parsed.data.actif && parsed.data.produit_id) {
      await supabase
        .from('promotions')
        .update({ actif: false })
        .eq('produit_id', parsed.data.produit_id)
        .eq('actif', true)
    }

    const { data, error } = await supabase
      .from('promotions')
      .insert(parsed.data)
      .select()
      .single()

    if (error) throw error

    cache.clear()
    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    logger.error(error, 'Crash POST admin/promotions')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}