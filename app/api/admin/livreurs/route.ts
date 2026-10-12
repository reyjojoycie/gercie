// app/api/admin/livreurs/route.ts
// ============================================================================
// API Admin – Gestion des livreurs (version Ultra‑Premium)
// Supporte GET (liste), POST (création), PUT (modification complète),
// DELETE (suppression + rétrogradation).
// ============================================================================
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Schémas de validation                                                     */
/* ========================================================================== */

const getQuerySchema = z.object({
  search: z.string().optional().default(''),
  est_actif: z.enum(['all', 'true', 'false']).optional().default('all'),
  est_disponible: z.enum(['all', 'true', 'false']).optional().default('all'),
  zone: z.string().optional().default(''),
  sort_by: z.enum(['total_livraisons', 'distance_parcourue_km', 'derniere_activite', 'created_at']).optional().default('total_livraisons'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  format: z.enum(['json', 'csv']).optional().default('json'),
})

// Schéma pour la création (tous les champs requis sont obligatoires)
const createLivreurSchema = z.object({
  nom: z.string().min(1, 'Nom requis').max(100),
  prenom: z.string().min(1, 'Prénom requis').max(100),
  email: z.string().email('Email invalide'),
  telephone: z.string().max(20).optional(),
  moto_modele: z.string().max(100).optional(),
  moto_plaque: z.string().max(20).optional(),
  zone_operation_principale: z.string().max(200).optional(),
  photo_url: z.string().url().optional().nullable(),
  est_actif: z.boolean().optional().default(true),
  est_disponible: z.boolean().optional().default(true),
  user_id: z.string().uuid().optional(), // pour lier un profil existant
})

// Schéma pour la modification (tous les champs optionnels)
const updateLivreurSchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  prenom: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  telephone: z.string().max(20).optional(),
  moto_modele: z.string().max(100).optional(),
  moto_plaque: z.string().max(20).optional(),
  zone_operation_principale: z.string().max(200).optional(),
  photo_url: z.string().url().optional().nullable(),
  est_actif: z.boolean().optional(),
  est_disponible: z.boolean().optional(),
})

/* ========================================================================== */
/*  Cache mémoire                                                              */
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

/* ========================================================================== */
/*  GET – Liste paginée, filtrée et triée des livreurs                        */
/* ========================================================================== */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-livreurs:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Patientez une minute.' }, { status: 429 }),
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

  const { search, est_actif, est_disponible, zone, sort_by, sort_order, page, limit, format } = parsed.data
  const offset = (page - 1) * limit

  const cacheKey = `admin-livreurs:${JSON.stringify(parsed.data)}`
  if (format === 'json') {
    const cached = getCache(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const supabase = await createClient(true)

    // 1. Statistiques globales
    const [totalRes, actifsRes, disponiblesRes] = await Promise.all([
      supabase.from('livreurs').select('*', { count: 'exact', head: true }),
      supabase.from('livreurs').select('*', { count: 'exact', head: true }).eq('est_actif', true),
      supabase.from('livreurs').select('*', { count: 'exact', head: true }).eq('est_disponible', true),
    ])

    // 2. Récupération des IDs des livreurs selon les critères (sans recherche textuelle)
    let baseQuery = supabase.from('livreurs').select('id')

    if (est_actif === 'true') baseQuery = baseQuery.eq('est_actif', true)
    else if (est_actif === 'false') baseQuery = baseQuery.eq('est_actif', false)

    if (est_disponible === 'true') baseQuery = baseQuery.eq('est_disponible', true)
    else if (est_disponible === 'false') baseQuery = baseQuery.eq('est_disponible', false)

    if (zone) baseQuery = baseQuery.ilike('zone_operation_principale', `%${zone}%`)

    const { data: idsData, error: idsErr } = await baseQuery
    if (idsErr) throw idsErr

    let filteredIds = (idsData || []).map((l: any) => l.id)

    // 3. Recherche textuelle dans les profils (si search fourni)
    if (search && filteredIds.length > 0) {
      const term = `%${search}%`
      const { data: matchingProfiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('id')
        .or(`nom.ilike.${term},prenom.ilike.${term},email.ilike.${term},telephone.ilike.${term}`)
        .in('id', filteredIds)

      if (!profilesErr && matchingProfiles) {
        const matchingIds = new Set(matchingProfiles.map((p: any) => p.id))
        filteredIds = filteredIds.filter(id => matchingIds.has(id))
      } else {
        // Si erreur ou pas de correspondance, on renvoie vide
        filteredIds = []
      }
    }

    const total = filteredIds.length
    const totalPages = Math.ceil(total / limit)

    // 4. Pagination sur les IDs
    const pagedIds = filteredIds.slice(offset, offset + limit)

    if (pagedIds.length === 0) {
      const emptyResponse = {
        data: [],
        pagination: { page, limit, total, totalPages },
        stats: {
          total: totalRes.count ?? 0,
          actifs: actifsRes.count ?? 0,
          disponibles: disponiblesRes.count ?? 0,
        },
      }
      if (format === 'json') setCache(cacheKey, emptyResponse)
      return NextResponse.json(emptyResponse)
    }

    // 5. Récupération des données complètes (livreurs + profils)
    const { data: livreursData, error: livreursErr } = await supabase
      .from('livreurs')
      .select('*')
      .in('id', pagedIds)

    if (livreursErr) throw livreursErr

    const { data: profilesData, error: profsErr } = await supabase
      .from('profiles')
      .select('id, nom, prenom, email, telephone')
      .in('id', pagedIds)

    const profilesMap = new Map()
    if (profilesData) profilesData.forEach(p => profilesMap.set(p.id, p))

    const merged = (livreursData || []).map(l => {
      const prof = profilesMap.get(l.id)
      return {
        id: l.id,
        nom: prof?.nom || '',
        prenom: prof?.prenom || '',
        email: prof?.email || '',
        telephone: prof?.telephone || '',
        est_actif: l.est_actif,
        est_disponible: l.est_disponible,
        total_livraisons: l.total_livraisons,
        distance_parcourue_km: l.distance_parcourue_km,
        derniere_activite: l.derniere_activite,
        zone_operation_principale: l.zone_operation_principale,
        photo_url: l.photo_url,
        moto_modele: l.moto_modele,
        moto_plaque: l.moto_plaque,
        note_moyenne: l.note_moyenne || null,
        created_at: l.created_at,
      }
    })

    // Tri final (côté serveur, sur les données fusionnées)
    if (sort_by === 'nom') {
      merged.sort((a: any, b: any) => (a.nom || '').localeCompare(b.nom || ''))
      if (sort_order === 'desc') merged.reverse()
    } else {
      // déjà trié via la base, on peut ignorer
    }

    const response = {
      data: merged,
      pagination: { page, limit, total, totalPages },
      stats: {
        total: totalRes.count ?? 0,
        actifs: actifsRes.count ?? 0,
        disponibles: disponiblesRes.count ?? 0,
      },
    }

    if (format === 'json') setCache(cacheKey, response)

    // Export CSV
    if (format === 'csv') {
      const headers = ['Nom', 'Prénom', 'Email', 'Téléphone', 'Zone', 'Livraisons', 'Km parcourus', 'Actif', 'Disponible']
      const rows = merged.map(l => [
        l.nom, l.prenom, l.email, l.telephone, l.zone_operation_principale || '',
        l.total_livraisons, l.distance_parcourue_km,
        l.est_actif ? 'Oui' : 'Non', l.est_disponible ? 'Oui' : 'Non'
      ])
      const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=livreurs_${new Date().toISOString().slice(0,10)}.csv`,
        },
      })
    }

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error(error, 'Crash GET admin/livreurs')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  POST – Création d'un livreur (avec lien utilisateur optionnel)            */
/* ========================================================================== */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-livreurs-post:${ip}`,
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

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = createLivreurSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data
  const supabase = await createClient(true)

  // Si un user_id est fourni, on promeut l'utilisateur existant
  if (data.user_id) {
    const { error: roleErr } = await supabase
      .from('profiles')
      .update({ type_user: 'livreur' })
      .eq('id', data.user_id)
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 })
  }

  // Création du livreur
  const { data: newLivreur, error: insertErr } = await supabase
    .from('livreurs')
    .insert({
      // id sera le même que user_id si fourni, sinon généré automatiquement
      ...(data.user_id ? { id: data.user_id } : {}),
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      telephone: data.telephone || null,
      moto_modele: data.moto_modele || null,
      moto_plaque: data.moto_plaque || null,
      zone_operation_principale: data.zone_operation_principale || null,
      photo_url: data.photo_url || null,
      est_actif: data.est_actif ?? true,
      est_disponible: data.est_disponible ?? true,
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  cache.clear()
  return NextResponse.json(newLivreur, { status: 201 })
}

/* ========================================================================== */
/*  PUT – Mise à jour complète d'un livreur (livreurs + profiles)            */
/* ========================================================================== */
export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-livreurs-put:${ip}`,
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

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  // Accepter soit { livreurId, ... } (ancien format), soit { id, updates } (nouveau format)
  let id: string, updates: any
  if (body.livreurId) {
    id = body.livreurId
    updates = { est_actif: body.est_actif, est_disponible: body.est_disponible, zone_operation_principale: body.zone_operation_principale }
  } else if (body.id && body.updates) {
    id = body.id
    updates = body.updates
  } else {
    return NextResponse.json({ error: 'Format invalide' }, { status: 400 })
  }

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID invalide' }, { status: 400 })
  }

  const parsedUpdates = updateLivreurSchema.safeParse(updates)
  if (!parsedUpdates.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsedUpdates.error.flatten().fieldErrors }, { status: 400 })
  }

  const updateData = parsedUpdates.data

  try {
    const supabase = await createClient(true)

    // Vérifier que le livreur existe
    const { data: livreur, error: fetchErr } = await supabase
      .from('livreurs')
      .select('id')
      .eq('id', id)
      .single()

    if (fetchErr || !livreur) {
      return NextResponse.json({ error: 'Livreur introuvable' }, { status: 404 })
    }

    // Mise à jour dans la table livreurs
    const livreurUpdates: any = {}
    if (updateData.est_actif !== undefined) livreurUpdates.est_actif = updateData.est_actif
    if (updateData.est_disponible !== undefined) livreurUpdates.est_disponible = updateData.est_disponible
    if (updateData.zone_operation_principale !== undefined) livreurUpdates.zone_operation_principale = updateData.zone_operation_principale
    if (updateData.moto_modele !== undefined) livreurUpdates.moto_modele = updateData.moto_modele
    if (updateData.moto_plaque !== undefined) livreurUpdates.moto_plaque = updateData.moto_plaque
    if (updateData.photo_url !== undefined) livreurUpdates.photo_url = updateData.photo_url

    if (Object.keys(livreurUpdates).length > 0) {
      livreurUpdates.updated_at = new Date().toISOString()
      const { error: lUpdateErr } = await supabase
        .from('livreurs')
        .update(livreurUpdates)
        .eq('id', id)
      if (lUpdateErr) return NextResponse.json({ error: lUpdateErr.message }, { status: 500 })
    }

    // Mise à jour dans profiles (nom, prénom, email, téléphone)
    const profileUpdates: any = {}
    if (updateData.nom !== undefined) profileUpdates.nom = updateData.nom
    if (updateData.prenom !== undefined) profileUpdates.prenom = updateData.prenom
    if (updateData.email !== undefined) profileUpdates.email = updateData.email
    if (updateData.telephone !== undefined) profileUpdates.telephone = updateData.telephone

    if (Object.keys(profileUpdates).length > 0) {
      const { error: pUpdateErr } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', id)
      if (pUpdateErr) return NextResponse.json({ error: pUpdateErr.message }, { status: 500 })
    }

    cache.clear()
    logger.info(`Livreur ${id} mis à jour`, { updates })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, 'Crash PUT admin/livreurs')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  DELETE – Suppression d'un livreur (et rétrogradation du rôle)             */
/* ========================================================================== */
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-livreurs-delete:${ip}`,
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
    return NextResponse.json({ error: 'ID invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    // Récupérer l'email pour rétrograder le rôle dans profiles
    const { data: livreur, error: fetchErr } = await supabase
      .from('livreurs')
      .select('email')
      .eq('id', id)
      .single()

    // Supprimer l'entrée livreur
    const { error: deleteErr } = await supabase
      .from('livreurs')
      .delete()
      .eq('id', id)

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

    // Rétrograder l'utilisateur lié (s'il existe)
    if (livreur?.email) {
      await supabase
        .from('profiles')
        .update({ type_user: 'acheteur' })
        .eq('email', livreur.email)
    }

    cache.clear()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, 'Crash DELETE admin/livreurs')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}