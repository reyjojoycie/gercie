// app/api/admin/litiges/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const getQuerySchema = z.object({
  statut: z.string().optional().default('tous'),
  search: z.string().optional().default(''),
  sort_by: z.enum(['created_at', 'statut', 'type']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
})

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-litiges:${ip}`,
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
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { statut, search, sort_by, sort_order, page, limit } = parsed.data
  const offset = (page - 1) * limit

  try {
    const supabase = await createClient(true)

    let query = supabase
      .from('litiges')
      .select('*', { count: 'exact' })

    if (statut !== 'tous') query = query.eq('statut', statut)

    if (search) {
      const term = `%${search}%`
      query = query.or(`description.ilike.${term}`)
    }

    const ascending = sort_order === 'asc'
    query = query.order(sort_by, { ascending })
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      logger.error(error, 'Erreur récupération litiges')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    })
  } catch (error: any) {
    logger.error(error, 'Crash GET admin/litiges')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}