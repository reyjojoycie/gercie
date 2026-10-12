// app/api/admin/commandes/[id]/historique/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-commande-historique:${ip}`,
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

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    const { data, error } = await supabase
      .from('historique_statuts')
      .select('*')
      .eq('commande_id', parsedId.data)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error(error, `Erreur récupération historique commande ${parsedId.data}`)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error: any) {
    logger.error(error, `Crash GET historique commande/${id}`)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}