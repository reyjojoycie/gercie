// app/api/commandes/[id]/generer-code-livreur/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { generateUniqueCode } from '@/lib/codes'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-gen-code-livreur:${ip}`,
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
    return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
  }

  const supabase = await createClient(true)

  // Récupérer la commande
  const { data: commande, error: commandeErr } = await supabase
    .from('commandes')
    .select('id, statut, livreur_id, mode_attribution')
    .eq('id', parsedId.data)
    .single()

  if (commandeErr || !commande) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  // Vérifier qu'un livreur est bien assigné
  if (!commande.livreur_id) {
    return NextResponse.json(
      { error: 'Aucun livreur assigné. Impossible de générer un code livreur.' },
      { status: 422 }
    )
  }

  // Vérifier le statut
  const statutsAutorises = ['conditionnement_premium', 'collecte', 'en_livraison']
  if (!statutsAutorises.includes(commande.statut)) {
    return NextResponse.json(
      { error: `Impossible de générer le code livreur depuis le statut "${commande.statut}".` },
      { status: 422 }
    )
  }

  // Générer un code unique
  const code = await generateUniqueCode(supabase, 'code_livreur', 'commandes')
  if (!code) {
    return NextResponse.json({ error: 'Impossible de générer un code livreur unique.' }, { status: 500 })
  }

  // Mettre à jour
  const { error: updateErr } = await supabase
    .from('commandes')
    .update({
      code_livreur: code,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsedId.data)

  if (updateErr) {
    logger.error(`Erreur mise à jour code livreur commande ${parsedId.data}`, updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  logger.info(`Code livreur généré/régénéré pour commande ${parsedId.data}`)

  return NextResponse.json({ code_livreur: code, success: true })
}