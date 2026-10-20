// app/api/livreur/commandes/accepter/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/auth/authGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { generateUniqueCode } from '@/lib/codes'

const bodySchema = z.object({
  commande_id: z.string().uuid('ID commande invalide'),
})

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `livreur-accepter:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification
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
    return NextResponse.json({ error: 'Seuls les livreurs peuvent accepter une commande.' }, { status: 403 })
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
    .select('id, statut, livreur_id, code_livreur')
    .eq('id', commande_id)
    .single()

  if (commandeErr || !commande) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  // Vérifier le statut éligible
  const statutsEligibles = ['conditionnement_premium', 'collecte']
  if (!statutsEligibles.includes(commande.statut)) {
    return NextResponse.json(
      { error: `Cette commande n'est pas disponible (statut ${commande.statut}).` },
      { status: 422 }
    )
  }

  // Vérifier qu'elle n'a pas déjà un livreur
  if (commande.livreur_id) {
    return NextResponse.json(
      { error: 'Cette commande a déjà un livreur assigné.' },
      { status: 409 }
    )
  }

  // Générer un code livreur unique
  const codeLivreur = await generateUniqueCode(supabase, 'code_livreur', 'commandes')
  if (!codeLivreur) {
    return NextResponse.json({ error: 'Impossible de générer un code livreur.' }, { status: 500 })
  }

  // Mise à jour
  const { error: updateErr } = await supabase
    .from('commandes')
    .update({
      livreur_id: user.id,
      code_livreur: codeLivreur,
      mode_attribution: 'LIBRE',
      updated_at: new Date().toISOString(),
    })
    .eq('id', commande_id)

  if (updateErr) {
    logger.error(`Erreur acceptation commande ${commande_id} par livreur ${user.id}`, updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  logger.info(`Commande ${commande_id} acceptée par livreur ${user.id}, code_livreur généré.`)

  return NextResponse.json({
    success: true,
    code_livreur: codeLivreur,
    message: 'Commande acceptée. Vous pouvez maintenant la collecter au dispatch.',
  })
}