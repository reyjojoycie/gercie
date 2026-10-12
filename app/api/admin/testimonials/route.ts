// app/api/admin/testimonials/route.ts

import { NextRequest, NextResponse } from 'next/server'
// 💡 On supprime @supabase/auth-helpers-nextjs qui fait crasher Turbopack
// 💡 On utilise votre createClient d'infrastructure qui est propre et configuré
import { createClient } from '@/lib/supabaseServer'
import { z } from 'zod'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

const ALLOWED_SORT_FIELDS = ['name', 'rating', 'date', 'status', 'likes', 'created_at', 'updated_at']
const ALLOWED_SORT_ORDERS = ['asc', 'desc']
const ALLOWED_STATUSES = ['published', 'pending', 'rejected']

// Schéma de validation pour la création
const createTestimonialSchema = z.object({
  name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
  role: z.string().optional().default(''),
  text: z.string().min(10, 'Le témoignage doit comporter au moins 10 caractères'),
  rating: z.number().int().min(1).max(5),
  produit: z.string().optional().default(''),
  verified: z.boolean().optional().default(false),
  status: z.enum(['published', 'pending', 'rejected']).optional().default('published'),
  is_featured: z.boolean().optional().default(false),
  avatar: z.string().url().optional().nullable(),
})

function errorResponse(message: string, status = 400, details?: any) {
  return NextResponse.json({ success: false, error: message, details }, { status })
}

function successResponse(data: any, meta?: any, status = 200) {
  return NextResponse.json({ success: true, data, meta }, { status })
}

/* ========================================================================== */
/* GET : Liste d'administration (Filtres, Tri & Stats)                       */
/* ========================================================================== */
export async function GET(request: NextRequest) {
  try {
    // 💡 true pour charger le mode administrateur (Bypass RLS)
    const supabase = await createClient(true)

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') || String(DEFAULT_PAGE)))
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT))))
    const status = searchParams.get('status')
    const rating = searchParams.get('rating')
    const search = searchParams.get('search')
    const sort = searchParams.get('sort') || 'date'
    const order = searchParams.get('order') || 'desc'

    let query = supabase.from('testimonials').select('*', { count: 'exact' })

    if (status && ALLOWED_STATUSES.includes(status)) {
      query = query.eq('status', status)
    }
    if (rating) {
      const r = parseInt(rating)
      if (!isNaN(r)) query = query.eq('rating', r)
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,text.ilike.%${search}%`)
    }

    const sortField = sort === 'date' ? 'date' : ALLOWED_SORT_FIELDS.includes(sort) ? sort : 'created_at'
    const sortOrder = ALLOWED_SORT_ORDERS.includes(order) ? order : 'desc'
    query = query.order(sortField, { ascending: sortOrder === 'asc' })

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) return errorResponse(`Erreur Supabase: ${error.message}`, 500)

    // Calcul des statistiques globales
    const { data: statsData } = await supabase.from('testimonials').select('status, rating')
    const stats = { total: 0, published: 0, pending: 0, rejected: 0, avgRating: '0.0' }

    if (statsData) {
      stats.total = statsData.length
      let sumRating = 0
      statsData.forEach(t => {
        sumRating += t.rating
        if (t.status === 'published') stats.published++
        if (t.status === 'pending') stats.pending++
        if (t.status === 'rejected') stats.rejected++
      })
      stats.avgRating = stats.total > 0 ? (sumRating / stats.total).toFixed(1) : '0.0'
    }

    const total = count || 0
    return successResponse(data, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats
    })
  } catch (err: any) {
    return errorResponse(err.message || 'Erreur interne', 500)
  }
}

/* ========================================================================== */
/* POST : Création d'un témoignage                                            */
/* ========================================================================== */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient(true)
    const body = await request.json()

    const parsed = createTestimonialSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse('Données invalides', 400, parsed.error.flatten().fieldErrors)
    }

    const testimonialData = parsed.data
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user.id || null

    const { data, error } = await supabase
      .from('testimonials')
      .insert({
        name: testimonialData.name,
        role: testimonialData.role,
        text: testimonialData.text,
        rating: testimonialData.rating,
        produit: testimonialData.produit,
        verified: testimonialData.verified,
        status: testimonialData.status,
        is_featured: testimonialData.is_featured,
        user_id: userId,
        avatar: testimonialData.avatar ?? null
      })
      .select()
      .single()

    if (error) return errorResponse(`Erreur création: ${error.message}`, 500)
    return successResponse(data, null, 201)
  } catch (err: any) {
    return errorResponse(err.message || 'Erreur interne', 500)
  }
}