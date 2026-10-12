// app/api/admin/commandes/[id]/suivi/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const putBodySchema = z.object({
  numero_suivi: z.string().max(200).optional().nullable(),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-commande-suivi:${ip}`,
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

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsedBody = putBodySchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { numero_suivi } = parsedBody.data

  try {
    const supabase = await createClient(true)

    const { error: updateErr } = await supabase
      .from('commandes')
      .update({ numero_suivi, updated_at: new Date().toISOString() })
      .eq('id', parsedId.data)

    if (updateErr) {
      logger.error(updateErr, `Erreur mise à jour suivi commande ${parsedId.data}`)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    logger.info(`Numéro de suivi mis à jour pour commande ${parsedId.data}`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, `Crash PUT commande suivi ${id}`)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}