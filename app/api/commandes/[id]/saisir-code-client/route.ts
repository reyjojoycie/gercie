// app/api/commandes/[id]/saisir-code-client/route.ts
import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { normalizeCode } from '@/lib/codes'
import { isCodeBlocked, recordAttempt, isCodeAlreadyUsed, remainingAttempts } from '@/lib/anti-fraude'

const bodySchema = z.object({
  code_client: z.string().min(1, 'Le code client est requis'),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `saisir-code-client:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification obligatoire
  const supabase = await createClient(true)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le rôle (depuis la table des profils, adaptez le nom si besoin)
  const { data: profile } = await supabase
    .from('utilisateurs')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  // Récupérer la commande
  const { data: commande, error: commandeErr } = await supabase
    .from('commandes')
    .select('id, statut, code_client, livreur_id')
    .eq('id', id)
    .single()

  if (commandeErr || !commande) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  // Autorisation : admin ou livreur assigné
  if (!isAdmin && commande.livreur_id !== user.id) {
    return NextResponse.json(
      { error: "Vous n'êtes pas autorisé à valider cette livraison." },
      { status: 403 }
    )
  }

  // Vérifier le statut
  if (commande.statut !== 'en_livraison') {
    return NextResponse.json(
      { error: `La livraison ne peut être validée depuis le statut "${commande.statut}".` },
      { status: 422 }
    )
  }

  // Vérifier que la commande possède un code client
  if (!commande.code_client) {
    return NextResponse.json(
      { error: 'Aucun code client défini pour cette commande.' },
      { status: 422 }
    )
  }

  // Corps de la requête
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

  const { code_client } = parsedBody.data
  const codeSaisi = normalizeCode(code_client)

  // Vérifications anti-fraude
  const [bloqué, déjàUtilisé] = await Promise.all([
    isCodeBlocked(supabase, id, 'CLIENT'),
    isCodeAlreadyUsed(supabase, id, 'CLIENT'),
  ])

  if (bloqué) {
    return NextResponse.json(
      { error: 'Trop de tentatives échouées. Veuillez réessayer plus tard.' },
      { status: 429 }
    )
  }

  if (déjàUtilisé) {
    return NextResponse.json(
      { error: 'Ce code a déjà été utilisé avec succès.' },
      { status: 400 }
    )
  }

  // Comparaison
  const estValide = codeSaisi === normalizeCode(commande.code_client)

  const utilisateurType = isAdmin ? 'ADMIN' : 'LIVREUR'

  // Enregistrer la tentative
  await recordAttempt(
    supabase,
    id,
    'CLIENT',
    code_client.trim(),
    estValide,
    user.id,
    utilisateurType,
    ip,
  )

  if (!estValide) {
    const restantes = await remainingAttempts(supabase, id, 'CLIENT')
    logger.warn(`Tentative échouée saisie code client commande ${id}, code saisi: ${codeSaisi}`)
    return NextResponse.json(
      { error: 'Code client invalide.', tentatives_restantes: restantes },
      { status: 400 }
    )
  }

  // Succès : mise à jour du statut à "livree"
  const { error: updateErr } = await supabase
    .from('commandes')
    .update({
      statut: 'livree',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    logger.error(updateErr, `Erreur mise à jour statut commande ${id}`)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Historique des statuts
  await supabase.from('historique_statuts').insert({
    commande_id: id,
    ancien_statut: 'en_livraison',
    nouveau_statut: 'livree',
    motif: 'Livraison validée par saisie du code client',
    cree_par: user.email || 'livreur',
    cree_le: new Date().toISOString(),
  })

  logger.info(`Code client saisi avec succès pour commande ${id} par ${user.email} (${utilisateurType})`)

  return NextResponse.json({ success: true, nouveau_statut: 'livree' })
}