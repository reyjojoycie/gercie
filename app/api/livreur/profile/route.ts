// app/api/livreur/profile/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireLivreur } from '@/lib/auth/livreurGuard' // ✅ déjà créé
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Schéma de validation pour le PUT                                          */
/* ========================================================================== */
const putBodySchema = z.object({
  telephone: z
    .string()
    .regex(/^0[0-9]{9}$/, 'Format invalide (ex: 0812345678)')
    .optional()
    .nullable(),
  avatar_url: z.string().url().optional().nullable(),
  est_disponible: z.boolean().optional(),
  zone_operation_principale: z.string().max(100).optional(),
  moto_modele: z.string().max(50).optional(),
  moto_plaque: z.string().max(20).optional(),
  photo_url: z.string().url().optional().nullable(),
  est_actif: z.boolean().optional(),
  evaluation_moyenne: z.number().min(0).max(5).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'Aucun champ à mettre à jour' })

/* ========================================================================== */
/*  Cache (30 secondes)                                                       */
/* ========================================================================== */
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 30_000

function cacheGet(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null }
  return entry.data
}
function cacheSet(key: string, data: any) { cache.set(key, { data, ts: Date.now() }) }

/* ========================================================================== */
/*  GET – Profil livreur                                                      */
/* ========================================================================== */
export async function GET() {
  const ip = 'server'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `livreur-profile:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // 1. Authentification et vérification du rôle livreur
  let livreurId: string
  try {
    const livreur = await requireLivreur()   // ✅ utilise le guard
    livreurId = livreur.id
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.message === 'Non authentifié' ? 401 : 403 })
  }

  // 2. Cache
  const cacheKey = `livreur-profile:${livreurId}`
  const cached = cacheGet(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const supabase = await createClient(true)

    // 3. Récupération du profil de base (table profiles)
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('nom, prenom, email, telephone, avatar_url')
      .eq('id', livreurId)
      .maybeSingle()

    // Ne pas bloquer si le profil n'existe pas encore – on met des chaînes vides
    if (profileErr) logger.error('Erreur récupération profil utilisateur', profileErr)

    // 4. Récupération des données livreur (table livreurs)
    const { data: livreurData, error: livreurErr } = await supabase
      .from('livreurs')
      .select('est_actif, est_disponible, total_livraisons, distance_parcourue_km, zone_operation_principale, photo_url, moto_modele, moto_plaque, derniere_activite')
      .eq('id', livreurId)
      .maybeSingle()

    // Si la table livreurs n'existe pas, on garde les valeurs par défaut
    if (livreurErr && livreurErr.code !== '42P01') {
      logger.error('Erreur récupération livreur', livreurErr)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // 5. Évaluation moyenne (optionnelle)
    let evaluationMoyenne = 0
    let totalEvaluations = 0
    try {
      const { data: evaluations } = await supabase
        .from('evaluations_livreurs')
        .select('note')
        .eq('livreur_id', livreurId)
      if (evaluations && evaluations.length > 0) {
        totalEvaluations = evaluations.length
        evaluationMoyenne = evaluations.reduce((sum, e) => sum + e.note, 0) / totalEvaluations
      }
    } catch (_) { /* table absente, on garde 0 */ }

    // 6. Construction de la réponse
    const response = {
      id: livreurId,
      nom: profile?.nom || '',
      prenom: profile?.prenom || '',
      email: profile?.email || '',
      telephone: profile?.telephone || '',
      avatar_url: profile?.avatar_url || '',
      est_actif: livreurData?.est_actif ?? false,
      est_disponible: livreurData?.est_disponible ?? true,
      total_livraisons: livreurData?.total_livraisons ?? 0,
      evaluation_moyenne: evaluationMoyenne,
      total_evaluations: totalEvaluations,
      distance_parcourue_km: livreurData?.distance_parcourue_km ?? 0,
      zone_operation_principale: livreurData?.zone_operation_principale ?? null,
      photo_url: livreurData?.photo_url ?? null,
      moto_modele: livreurData?.moto_modele ?? null,
      moto_plaque: livreurData?.moto_plaque ?? null,
      derniere_activite: livreurData?.derniere_activite ?? null,
    }

    cacheSet(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error('Crash GET /api/livreur/profile', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  PUT – Mise à jour du profil                                               */
/* ========================================================================== */
export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `livreur-profile-put:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let livreurId: string
  try {
    const livreur = await requireLivreur()
    livreurId = livreur.id
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.message === 'Non authentifié' ? 401 : 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = putBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const updates = parsed.data
  const supabase = await createClient(true)

  // 1. Mise à jour des champs dans profiles
  const profileUpdates: Record<string, any> = {}
  if (updates.telephone !== undefined) profileUpdates.telephone = updates.telephone
  if (updates.avatar_url !== undefined) profileUpdates.avatar_url = updates.avatar_url

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileErr } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', livreurId)
    if (profileErr) {
      logger.error('Erreur mise à jour profile', profileErr)
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }
  }

  // 2. Mise à jour des champs spécifiques au livreur
  const livreurUpdates: Record<string, any> = {}
  if (updates.est_disponible !== undefined) livreurUpdates.est_disponible = updates.est_disponible
  if (updates.zone_operation_principale !== undefined) livreurUpdates.zone_operation_principale = updates.zone_operation_principale
  if (updates.moto_modele !== undefined) livreurUpdates.moto_modele = updates.moto_modele
  if (updates.moto_plaque !== undefined) livreurUpdates.moto_plaque = updates.moto_plaque
  if (updates.photo_url !== undefined) livreurUpdates.photo_url = updates.photo_url
  if (updates.est_actif !== undefined) livreurUpdates.est_actif = updates.est_actif
  if (updates.evaluation_moyenne !== undefined) livreurUpdates.evaluation_moyenne = updates.evaluation_moyenne

  if (Object.keys(livreurUpdates).length > 0) {
    livreurUpdates.updated_at = new Date().toISOString()

    const { error: upsertErr } = await supabase
      .from('livreurs')
      .upsert({
        id: livreurId,
        est_actif: true,
        est_disponible: true,
        total_livraisons: 0,
        distance_parcourue_km: 0,
        ...livreurUpdates,
      })
    if (upsertErr) {
      logger.error('Erreur upsert livreur', upsertErr)
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }
  }

  cache.clear()
  return NextResponse.json({ success: true })
}