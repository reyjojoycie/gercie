// app/api/commandes/[id]/generer-code-client/route.ts
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
    id: `admin-gen-code-client:${ip}`,
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

  // Vérifier la commande
  const { data: commande, error: commandeErr } = await supabase
    .from('commandes')
    .select('id, statut, code_client')
    .eq('id', parsedId.data)
    .single()

  if (commandeErr || !commande) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  // Ne peut être généré que si payée (ou en attente si on autorise)
  if (!['payee', 'en_attente'].includes(commande.statut)) {
    return NextResponse.json(
      { error: `Impossible de générer le code client depuis le statut "${commande.statut}"` },
      { status: 422 }
    )
  }

  // Si déjà un code, on le renvoie (idempotent)
  if (commande.code_client) {
    return NextResponse.json({ code_client: commande.code_client, success: true })
  }

  // Générer un code unique
  const code = await generateUniqueCode(supabase, 'code_client', 'commandes')
  if (!code) {
    return NextResponse.json({ error: 'Impossible de générer un code client unique' }, { status: 500 })
  }

  const { error: updateErr } = await supabase
    .from('commandes')
    .update({
      code_client: code,
      statut: 'conditionnement_premium', // ou 'collecte' selon votre logique
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsedId.data)

  if (updateErr) {
    logger.error(`Erreur mise à jour code client commande ${parsedId.data}`, updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  logger.info(`Code client généré pour commande ${parsedId.data}`)
  return NextResponse.json({ code_client: code, success: true })
}