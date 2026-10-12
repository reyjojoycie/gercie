// app/api/testimonials/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import { moderateText } from '@/lib/ai/moderation'
import { z } from 'zod'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

const ALLOWED_SORT_FIELDS = ['date', 'rating', 'likes', 'name']
const ALLOWED_SORT_ORDERS = ['asc', 'desc']

// Validation des paramètres (?limit=12&sort=date&order=desc)
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  page: z.coerce.number().int().min(1).optional().default(1),
  ratingMin: z.coerce.number().int().min(0).max(5).optional().default(0),
  search: z.string().optional().default(''),
  produit: z.string().optional().default(''),
  sort: z.enum(ALLOWED_SORT_FIELDS as [string, ...string[]]).optional().default('date'),
  order: z.enum(ALLOWED_SORT_ORDERS as [string, ...string[]]).optional().default('desc'),
})

// Validation du corps pour la création d'un témoignage
const createTestimonialSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(10).max(2000),
  produit: z.string().optional(),
  product_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
})

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

/* ========================================================================== */
/* GET : Liste publique des témoignages (Bypass RLS)                           */
/* ========================================================================== */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient()

    const { searchParams } = request.nextUrl
    const rawParams: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      rawParams[key] = value
    })

    const parsed = querySchema.safeParse(rawParams)
    if (!parsed.success) {
      return errorResponse('Paramètres invalides', 400)
    }

    const { limit, page, ratingMin, search, produit, sort, order } = parsed.data
    const databaseSortField = sort === 'date' ? 'date' : sort

    let query = supabase
      .from('testimonials')
      .select('*')
      .eq('status', 'published')

    if (ratingMin > 0) {
      query = query.gte('rating', ratingMin)
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,text.ilike.%${search}%`)
    }
    if (produit) {
      query = query.ilike('produit', `%${produit}%`)
    }

    query = query.order(databaseSortField, { ascending: order === 'asc' })
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error } = await query

    if (error) {
      console.error('❌ Erreur Supabase Principale:', error.message)
      return errorResponse(`Erreur Supabase: ${error.message}`, 500)
    }

    const response = NextResponse.json(data || [], { status: 200 })
    response.headers.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30')
    return response
  } catch (err: any) {
    console.error('❌ Crash interne route API testimonials:', err)
    return errorResponse(err.message || 'Erreur interne du serveur', 500)
  }
}

/* ========================================================================== */
/* POST : Création d'un témoignage avec modération IA automatique              */
/* ========================================================================== */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient()

    // Valider le corps de la requête
    let body
    try {
      body = await request.json()
    } catch {
      return errorResponse('Corps JSON invalide', 400)
    }

    const parsed = createTestimonialSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse('Données invalides : ' + JSON.stringify(parsed.error.flatten()), 400)
    }

    const { name, email, rating, text, produit, product_id, user_id } = parsed.data

    // Analyse de modération IA
    let moderationStatus = 'pending'
    try {
      const flagged = await moderateText(text)
      if (flagged) {
        moderationStatus = 'flagged'
      }
    } catch (moderationError) {
      console.warn('⚠️ Modération IA indisponible, statut "pending" par défaut')
      // On garde "pending" si l'IA échoue
    }

    // Insérer le témoignage dans la base (statut = pending pour validation admin)
    const { data, error } = await supabase
      .from('testimonials')
      .insert({
        name,
        email: email || null,
        rating,
        text,
        produit: produit || null,
        product_id: product_id || null,
        user_id: user_id || null,
        status: 'pending',                 // sera validé par l'admin
        moderation_status: moderationStatus, // flagged ou pending
        date: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Erreur insertion témoignage:', error.message)
      return errorResponse(`Erreur lors de l'enregistrement du témoignage : ${error.message}`, 500)
    }

    return NextResponse.json(
      {
        success: true,
        message: moderationStatus === 'flagged'
          ? 'Votre témoignage a été reçu mais nécessite une vérification supplémentaire.'
          : 'Témoignage enregistré avec succès. Il sera publié après validation.',
        data,
      },
      { status: 201 }
    )
  } catch (err: any) {
    console.error('❌ Crash création témoignage:', err)
    return errorResponse(err.message || 'Erreur interne du serveur', 500)
  }
}