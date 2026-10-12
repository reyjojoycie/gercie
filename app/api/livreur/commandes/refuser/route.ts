// app/api/livreur/commandes/refuser/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/auth/authGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const bodySchema = z.object({
  commande_id: z.string().uuid('ID commande invalide'),
})

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `livreur-refuser:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification du livreur
  const supabase = await createClient(true)
  let user: any
  try {
    const authResult = await requireAuth()
    user = authResult.user
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Non authentifié' }, { status: 401 })
  }

  // Vérifier que l'utilisateur est livreur
  const { data: profile, error: profileErr } = await supabase
    .from('utilisateurs')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileErr || profile?.role !== 'livreur') {
    return NextResponse.json({ error: 'Action réservée aux livreurs.' }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsedBody = bodySchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { commande_id } = parsedBody.data

  // Récupérer la commande
  const { data: commande, error: commandeErr } = await supabase
    .from('commandes')
    .select('id, statut, livreur_id, mode_attribution, code_livreur')
    .eq('id', commande_id)
    .single()

  if (commandeErr || !commande) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  // Vérifier que le livreur connecté est bien le livreur assigné
  if (commande.livreur_id !== user.id) {
    return NextResponse.json({ error: 'Vous n’êtes pas le livreur assigné à cette commande.' }, { status: 403 })
  }

  // Empêcher le refus d’une commande assignée d’office
  if (commande.mode_attribution === 'ASSIGNE') {
    return NextResponse.json(
      { error: 'Vous ne pouvez pas refuser une commande qui vous a été assignée. Contactez l’administration.' },
      { status: 403 }
    )
  }

  // Libération de la commande
  const { error: updateErr } = await supabase
    .from('commandes')
    .update({
      livreur_id: null,
      code_livreur: null,
      mode_attribution: null,
      statut: 'conditionnement_premium', // la rend disponible aux autres livreurs
      updated_at: new Date().toISOString(),
    })
    .eq('id', commande_id)

  if (updateErr) {
    logger.error(updateErr, `Erreur libération commande ${commande_id} refusée par livreur ${user.id}`)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  logger.info(`Commande ${commande_id} refusée par livreur ${user.id}, libérée.`)

  return NextResponse.json({
    success: true,
    message: 'Commande libérée. Elle est de nouveau disponible pour les autres livreurs.',
  })
}