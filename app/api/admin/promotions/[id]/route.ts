// app/api/admin/promotions/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const updateSchema = z.object({
  produit_id: z.string().uuid().optional().nullable(),
  categorie_id: z.string().optional().nullable(),
  type_promo: z.enum(['prix_fixe', 'pourcentage', 'flash', 'lot_degressif', 'cadeau']).optional(),
  prix_promo: z.number().nonnegative().optional().nullable(),
  valeur_pourcentage: z.number().int().min(0).max(99).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  date_debut: z.string().min(1).optional(),
  date_fin: z.string().min(1).optional(),
  actif: z.boolean().optional(),
  quantite_min: z.number().int().min(1).optional(),
  cumulable: z.boolean().optional(),
  banniere_url: z.string().url().optional().nullable().or(z.literal('')),
  produit_cadeau_id: z.string().uuid().optional().nullable(),
})

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 15_000

function getCache(key: string) { /* ... */ return null }
function setCache(key: string, data: any) { /* ... */ }

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-promotions-put:${ip}`,
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

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID invalide' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsedBody = updateSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient(true)

    // Si la mise à jour active la promotion, désactiver les autres sur le même produit
    if (parsedBody.data.actif && parsedBody.data.produit_id) {
      await supabase
        .from('promotions')
        .update({ actif: false })
        .eq('produit_id', parsedBody.data.produit_id)
        .eq('actif', true)
        .neq('id', parsedId.data)
    }

    const { error } = await supabase
      .from('promotions')
      .update(parsedBody.data)
      .eq('id', parsedId.data)

    if (error) throw error

    cache.clear()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Crash PUT admin/promotions', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-promotions-delete:${ip}`,
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

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)
    const { error } = await supabase.from('promotions').delete().eq('id', parsedId.data)
    if (error) throw error

    cache.clear()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Crash DELETE admin/promotions', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}