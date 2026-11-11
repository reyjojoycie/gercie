// app/api/testimonials/route.ts
// ============================================================================
// API publique Témoignages / Avis clients
// - GET : liste des avis publiés
// - POST : dépôt d’un nouvel avis (pending ou auto-published selon réglages)
// Sans wallet / portefeuille / solde / retrait.
// ============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'

import {
  DEFAULT_TESTIMONIAL_SETTINGS,
  DEFAULT_TESTIMONIAL_STATS,
  normalizeSettings,
  normalizeTestimonial,
  toBool,
  toNum,
  type Testimonial,
  type TestimonialSettings,
  type TestimonialStats,
} from '@/lib/testimonials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TABLE = 'testimonials'
const SETTINGS_TABLE = 'testimonial_settings'

/* ═══════════════════════════════════════════════════════════════ */
/*  RATE LIMIT SIMPLE                                              */
/* ═══════════════════════════════════════════════════════════════ */

const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 5

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = (rateLimitMap.get(ip) || []).filter(
    (time) => now - time < RATE_LIMIT_WINDOW_MS
  )

  if (timestamps.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, timestamps)
    return true
  }

  timestamps.push(now)
  rateLimitMap.set(ip, timestamps)
  return false
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function isTableMissingError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '42P01' ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('n’existe pas') ||
    message.includes("n'existe pas")
  )
}

async function getSupabaseAdmin(): Promise<any> {
  try {
    const client: any = await createClient(true)
    return client?.supabase ?? client
  } catch {
    return null
  }
}

async function getUserId(): Promise<string | null> {
  try {
    const client: any = await createClient(false)
    const supabase = client?.supabase ?? client

    if (!supabase) return null

    const { data, error } = await supabase.auth.getUser()

    if (error || !data?.user) return null

    return String(data.user.id)
  } catch {
    return null
  }
}

async function getSettings(supabase: any): Promise<TestimonialSettings> {
  try {
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('*')
      .eq('id', 'global')
      .maybeSingle()

    if (error || !data) return DEFAULT_TESTIMONIAL_SETTINGS

    return normalizeSettings(data)
  } catch {
    return DEFAULT_TESTIMONIAL_SETTINGS
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMAS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const getSchema = z.object({
  page: z.coerce.number().int().min(1).max(200).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(6),

  ratingMin: z.coerce.number().min(0).max(5).optional(),
  ratingMax: z.coerce.number().min(0).max(5).optional(),

  verified: z.enum(['true', 'false', 'all']).optional().default('all'),
  featured: z.enum(['true', 'false', 'all']).optional().default('all'),

  product: z.string().max(160).optional().default(''),
  search: z.string().max(160).optional().default(''),

  sort: z
    .enum(['date', 'rating', 'likes', 'featured', 'relevance'])
    .optional()
    .default('relevance'),

  order: z.enum(['asc', 'desc']).optional().default('desc'),
})

const postSchema = z.object({
  name: z.string().min(2).max(120),
  text: z.string().min(10).max(2000),
  rating: z.coerce.number().min(1).max(5),
  product: z.string().max(160).optional().default(''),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional().default(''), // honeypot
})

/* ═══════════════════════════════════════════════════════════════ */
/*  STATS                                                          */
/* ═══════════════════════════════════════════════════════════════ */

async function computePublicStats(supabase: any): Promise<TestimonialStats> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('rating, likes, product_name, is_featured, verified')
      .eq('status', 'published')
      .limit(10000)

    if (error || !Array.isArray(data)) {
      return DEFAULT_TESTIMONIAL_STATS
    }

    const total = data.length
    const sumRating = data.reduce((acc, row) => acc + toNum(row.rating, 0), 0)
    const avgRating = total > 0 ? (sumRating / total).toFixed(1) : '0.0'

    const distribution: Record<string, number> = {
      '5': 0,
      '4': 0,
      '3': 0,
      '2': 0,
      '1': 0,
    }

    let totalLikes = 0
    let featured = 0
    let verified = 0

    const productsSet = new Set<string>()

    for (const row of data) {
      const rating = Math.round(toNum(row.rating, 0))
      const key = String(Math.min(5, Math.max(1, rating)))
      distribution[key] = (distribution[key] || 0) + 1

      totalLikes += toNum(row.likes, 0)

      if (toBool(row.is_featured, false)) featured += 1
      if (toBool(row.verified, false)) verified += 1

      const product = String(row.product_name || '').trim()
      if (product) productsSet.add(product)
    }

    return {
      total,
      published: total,
      pending: 0,
      rejected: 0,
      archived: 0,
      featured,
      verified,
      avgRating,
      totalLikes,
      distribution,
      products: Array.from(productsSet).slice(0, 50),
    }
  } catch {
    return DEFAULT_TESTIMONIAL_STATS
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const parsed = getSchema.safeParse(
      Object.fromEntries(searchParams.entries())
    )

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Paramètres invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
          data: [],
        },
        { status: 400 }
      )
    }

    const input = parsed.data
    const supabase = await getSupabaseAdmin()

    if (!supabase) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            total: 0,
            page: input.page,
            limit: input.limit,
            totalPages: 1,
            stats: DEFAULT_TESTIMONIAL_STATS,
            warning: 'Configuration Supabase indisponible.',
          },
        },
        { status: 200 }
      )
    }

    let query = supabase
      .from(TABLE)
      .select('*')
      .eq('status', 'published')

    if (input.ratingMin !== undefined) {
      query = query.gte('rating', input.ratingMin)
    }

    if (input.ratingMax !== undefined) {
      query = query.lte('rating', input.ratingMax)
    }

    if (input.verified === 'true') {
      query = query.eq('verified', true)
    } else if (input.verified === 'false') {
      query = query.eq('verified', false)
    }

    if (input.featured === 'true') {
      query = query.eq('is_featured', true)
    } else if (input.featured === 'false') {
      query = query.eq('is_featured', false)
    }

    if (input.product) {
      query = query.ilike('product_name', `%${input.product}%`)
    }

    if (input.search) {
      const search = `%${input.search}%`
      query = query.or(`name.ilike.${search},content.ilike.${search},product_name.ilike.${search}`)
    }

    if (input.sort === 'date') {
      query = query.order('published_at', { ascending: input.order === 'asc' })
      query = query.order('created_at', { ascending: input.order === 'asc' })
    } else if (input.sort === 'rating') {
      query = query.order('rating', { ascending: input.order === 'asc' })
      query = query.order('created_at', { ascending: false })
    } else if (input.sort === 'likes') {
      query = query.order('likes', { ascending: input.order === 'asc' })
      query = query.order('created_at', { ascending: false })
    } else if (input.sort === 'featured') {
      query = query.order('is_featured', { ascending: false })
      query = query.order('created_at', { ascending: input.order === 'asc' })
    } else {
      // relevance
      query = query.order('is_featured', { ascending: false })
      query = query.order('rating', { ascending: false })
      query = query.order('likes', { ascending: false })
      query = query.order('published_at', { ascending: false })
      query = query.order('created_at', { ascending: false })
    }

    const from = (input.page - 1) * input.limit
    const to = from + input.limit - 1

    const [{ data, error }, stats] = await Promise.all([
      query.range(from, to),
      computePublicStats(supabase),
    ])

    if (error) {
      if (isTableMissingError(error)) {
        return NextResponse.json(
          {
            success: true,
            data: [],
            meta: {
              total: 0,
              page: input.page,
              limit: input.limit,
              totalPages: 1,
              stats: DEFAULT_TESTIMONIAL_STATS,
              warning:
                'La table public.testimonials est introuvable. Exécute la migration SQL.',
            },
          },
          { status: 200 }
        )
      }

      throw error
    }

    const rawItems = Array.isArray(data) ? data : []
    const items: Testimonial[] = rawItems
      .map(normalizeTestimonial)
      .filter((item): item is Testimonial => Boolean(item))

    const total = stats.total
    const totalPages = Math.max(1, Math.ceil(total / input.limit))

    const response = NextResponse.json({
      success: true,
      data: items,
      meta: {
        total,
        page: input.page,
        limit: input.limit,
        totalPages,
        stats,
      },
    })

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300'
    )

    return response
  } catch (error: any) {
    console.error('Crash GET /api/testimonials', error)

    return NextResponse.json(
      {
        success: true,
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 6,
          totalPages: 1,
          stats: DEFAULT_TESTIMONIAL_STATS,
          warning: 'Erreur interne, liste vide renvoyée.',
          details:
            process.env.NODE_ENV === 'development'
              ? String(error?.message || 'Erreur inconnue')
              : undefined,
        },
      },
      { status: 200 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)

    if (isRateLimited(ip)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Trop de tentatives. Réessaie dans une heure.',
          code: 'RATE_LIMITED',
        },
        { status: 429 }
      )
    }

    let body: any

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'JSON invalide.',
          code: 'INVALID_JSON',
        },
        { status: 400 }
      )
    }

    // Honeypot
    if (body?.website) {
      return NextResponse.json(
        { success: true, message: 'Merci.' },
        { status: 200 }
      )
    }

    const parsed = postSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Données invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const input = parsed.data
    const supabase = await getSupabaseAdmin()

    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Configuration serveur indisponible.',
          code: 'SUPABASE_ERROR',
        },
        { status: 500 }
      )
    }

    const settings = await getSettings(supabase)
    const userId = await getUserId()

    if (settings.require_login_to_post && !userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tu dois être connecté pour laisser un avis.',
          code: 'AUTH_REQUIRED',
        },
        { status: 401 }
      )
    }

    if (!settings.allow_anonymous_submissions && !userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Les avis anonymes ne sont pas autorisés.',
          code: 'ANONYMOUS_DISABLED',
        },
        { status: 403 }
      )
    }

    const status =
      userId && settings.auto_publish_authenticated
        ? 'published'
        : 'pending'

    const insertPayload = {
      name: input.name.trim(),
      content: input.text.trim(),
      rating: input.rating,
      product_name: input.product?.trim() || null,
      author_id: userId || null,
      status,
      verified: false,
      is_featured: false,
      likes: 0,
      published_at: status === 'published' ? new Date().toISOString() : null,
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert(insertPayload)
      .select('*')
      .maybeSingle()

    if (error) {
      throw error
    }

    const testimonial = normalizeTestimonial(data)

    return NextResponse.json({
      success: true,
      message:
        status === 'published'
          ? 'Merci ! Ton avis est publié.'
          : settings.moderation_message,
      data: testimonial,
      meta: {
        status,
      },
    })
  } catch (error: any) {
    console.error('Crash POST /api/testimonials', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Impossible d’enregistrer ton avis pour le moment.',
        code: 'INTERNAL_ERROR',
        details:
          process.env.NODE_ENV === 'development'
            ? String(error?.message || 'Erreur inconnue')
            : undefined,
      },
      { status: 500 }
    )
  }
}