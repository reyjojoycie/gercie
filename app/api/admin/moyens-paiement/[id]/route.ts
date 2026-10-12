// app/api/admin/moyens-paiement/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ------------------------------------------------------------------ */
/*  Schéma de validation pour la mise à jour (partielle)                */
/* ------------------------------------------------------------------ */
const updateSchema = z.object({
  nom: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  type: z.enum(['wallet', 'card', 'mobile_money']).optional(),
  logo_url: z.string().url().optional().nullable(),
  instructions: z.string().optional().nullable(),
  ordre: z.number().int().min(0).optional(),
  actif: z.boolean().optional(),
}).strict(); // rejette les champs inconnus

/* ------------------------------------------------------------------ */
/*  GET : détails d’un moyen                                            */
/* ------------------------------------------------------------------ */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-get-id:${ip}`,
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

  const { id } = await params

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID invalide' }, { status: 400 })
  }

  const supabase = await createClient(true)

  const { data, error } = await supabase
    .from('moyens_paiement')
    .select('*')
    .eq('id', parsedId.data)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Moyen de paiement introuvable' }, { status: 404 })
  }

  return NextResponse.json(data)
}

/* ------------------------------------------------------------------ */
/*  PUT : mise à jour partielle                                         */
/* ------------------------------------------------------------------ */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-put:${ip}`,
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

  const { id } = await params

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID invalide' }, { status: 400 })
  }

  const supabase = await createClient(true)

  // Vérifier l’existence avant mise à jour
  const { data: existing, error: fetchErr } = await supabase
    .from('moyens_paiement')
    .select('id')
    .eq('id', parsedId.data)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Moyen de paiement introuvable' }, { status: 404 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  // Ne mettre à jour que les champs fournis
  const { error: updateErr } = await supabase
    .from('moyens_paiement')
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsedId.data)

  if (updateErr) {
    logger.error(updateErr, `Erreur mise à jour moyen de paiement ${parsedId.data}`)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  logger.info(`Moyen de paiement ${parsedId.data} mis à jour`)
  return NextResponse.json({ success: true })
}

/* ------------------------------------------------------------------ */
/*  DELETE : suppression                                                */
/* ------------------------------------------------------------------ */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-delete:${ip}`,
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

  const { id } = await params

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID invalide' }, { status: 400 })
  }

  const supabase = await createClient(true)

  // Vérifier l’existence avant suppression
  const { data: existing, error: fetchErr } = await supabase
    .from('moyens_paiement')
    .select('id')
    .eq('id', parsedId.data)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Moyen de paiement introuvable' }, { status: 404 })
  }

  const { error: deleteErr } = await supabase
    .from('moyens_paiement')
    .delete()
    .eq('id', parsedId.data)

  if (deleteErr) {
    logger.error(deleteErr, `Erreur suppression moyen de paiement ${parsedId.data}`)
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  logger.info(`Moyen de paiement ${parsedId.data} supprimé`)
  return NextResponse.json({ success: true })
}