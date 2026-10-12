// app/api/admin/utilisateurs/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Validation des paramètres de requête                                      */
/* ========================================================================== */
const getQuerySchema = z.object({
  search: z.string().optional().default(''),
  role: z.enum(['all', 'acheteur', 'vendeur', 'admin']).optional().default('all'),
  is_admin: z.enum(['true', 'false', 'all']).optional().default('all'),
  sort_by: z.enum(['created_at', 'email', 'nom', 'type_user', 'total_commandes']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  est_actif: z.enum(['true', 'false', 'all']).optional().default('all'),
})

const putBodySchema = z.object({
  userId: z.string().uuid('ID utilisateur invalide'),
  updates: z.object({
    type_user: z.enum(['acheteur', 'vendeur']).optional(),
    is_admin: z.boolean().optional(),
    est_actif: z.boolean().optional(),
    nom: z.string().min(1).max(100).optional(),
    prenom: z.string().min(1).max(100).optional(),
    telephone: z.string().regex(/^0[0-9]{9}$/, 'Format téléphone invalide').optional(),
    email: z.string().email().optional(), // pour la modification de l'email
  }).refine(data => Object.keys(data).length > 0, { message: 'Aucun champ à mettre à jour' }),
})

const createUserSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Le mot de passe doit comporter au moins 6 caractères'),
  nom: z.string().min(1, 'Nom requis'),
  prenom: z.string().min(1, 'Prénom requis'),
  telephone: z.string().optional(),
  type_user: z.enum(['acheteur', 'vendeur']).default('acheteur'),
})

/* ========================================================================== */
/*  Cache mémoire simple (30 secondes)                                         */
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
/*  GET – Liste paginée, filtrée et triée des utilisateurs                     */
/* ========================================================================== */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-utilisateurs:${ip}`,
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

  const { search, role, is_admin, sort_by, sort_order, page, limit, est_actif } = parsed.data
  const offset = (page - 1) * limit

  const cacheKey = `admin-users:${search}:${role}:${is_admin}:${sort_by}:${sort_order}:${page}:${limit}:${est_actif}`
  const cached = getCache(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const supabase = await createClient(true)

    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' })

    if (role !== 'all') {
      query = query.eq('type_user', role)
    }

    if (is_admin === 'true') {
      query = query.eq('is_admin', true)
    } else if (is_admin === 'false') {
      query = query.eq('is_admin', false)
    }

    if (est_actif === 'true') {
      query = query.eq('est_actif', true)
    } else if (est_actif === 'false') {
      query = query.eq('est_actif', false)
    }

    if (search) {
      const term = `%${search}%`
      query = query.or(`email.ilike.${term},nom.ilike.${term},prenom.ilike.${term}`)
    }

    const ALLOWED_SORT_COLUMNS = ['created_at', 'email', 'prenom', 'nom', 'type_user', 'total_commandes']
    const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sort_by) ? sort_by : 'created_at'
    const ascending = sort_order === 'asc'

    if (safeSortBy === 'nom') {
      query = query.order('prenom', { ascending })
    } else {
      query = query.order(safeSortBy, { ascending })
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      logger.error(error, 'Erreur récupération utilisateurs admin')
      return NextResponse.json({ error: 'Erreur lors du chargement des utilisateurs' }, { status: 500 })
    }

    const total = count ?? 0
    const totalPages = Math.ceil(total / limit)

    const response = {
      data: data || [],
      pagination: { page, limit, total, totalPages },
    }

    setCache(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error(error, 'Crash GET admin/utilisateurs')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  PUT – Mise à jour d’un utilisateur                                        */
/* ========================================================================== */
export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-utilisateurs-put:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)
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

  const parsed = putBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { userId, updates } = parsed.data

  try {
    const supabase = await createClient(true)

    const { data: targetUser, error: fetchErr } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('id', userId)
      .single()

    if (fetchErr || !targetUser) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    if (updates.is_admin !== undefined && targetUser.id === currentUser.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas modifier votre propre statut admin' },
        { status: 403 }
      )
    }

    // Si l'email doit être mis à jour, il faut le faire via l'API Auth
    if (updates.email) {
      const { error: emailErr } = await supabase.auth.admin.updateUserById(userId, { email: updates.email })
      if (emailErr) return NextResponse.json({ error: emailErr.message }, { status: 500 })
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateErr) {
      logger.error(updateErr, `Erreur mise à jour utilisateur ${userId}`)
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
    }

    cache.clear()
    logger.info(`Utilisateur ${userId} mis à jour par admin`, { updates })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, 'Crash PUT admin/utilisateurs')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  DELETE – Suppression complète d’un utilisateur (auth + profil)            */
/* ========================================================================== */
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-utilisateurs-delete:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID utilisateur invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    // Suppression de l'utilisateur auth (cascade vers profiles si FK configurée)
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    cache.clear()
    logger.info(`Utilisateur ${id} supprimé par admin`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, 'Crash DELETE admin/utilisateurs')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  POST – Création d’un utilisateur sans vérification                        */
/* ========================================================================== */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-utilisateurs-create:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)
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

  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { email, password, nom, prenom, telephone, type_user } = parsed.data

  try {
    const supabase = await createClient(true)

    // Création dans Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,  // pas de vérification
      user_metadata: { nom, prenom, telephone },
    })

    if (authError) throw authError

    // Mise à jour du profil avec les champs additionnels
    const { error: profileError } = await supabase.from('profiles').update({
      nom,
      prenom,
      telephone: telephone || null,
      type_user,
      est_actif: true,
    }).eq('id', authUser.user.id)

    if (profileError) throw profileError

    cache.clear()
    return NextResponse.json({ success: true, user: authUser.user }, { status: 201 })
  } catch (error: any) {
    logger.error(error, 'Crash POST admin/utilisateurs')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}