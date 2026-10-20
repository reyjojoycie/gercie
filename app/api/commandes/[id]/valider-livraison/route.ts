// app/api/commandes/[id]/valider-livraison/route.ts
import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

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
    id: `livreur-valider-livraison:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification et autorisation (livreur assigné ou admin)
  const supabase = await createClient(true)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le rôle (depuis la table publique 'utilisateurs' ou 'profiles')
  const { data: profile } = await supabase
    .from('utilisateurs')  // ou votre table de profils
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  let isAssignedLivreur = false

  // Récupérer la commande avec livreur_id
  const { data: commande, error: commandeErr } = await supabase
    .from('commandes')
    .select('id, statut, code_client, livreur_id')
    .eq('id', id)
    .single()

  if (commandeErr || !commande) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  // Vérifier que l'utilisateur est le livreur assigné (si pas admin)
  if (!isAdmin) {
    if (commande.livreur_id !== user.id) {
      return NextResponse.json({ error: 'Vous n\'êtes pas le livreur assigné à cette commande' }, { status: 403 })
    }
    isAssignedLivreur = true
  }

  // Validation du corps
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
  const codeSaisi = code_client.trim().toUpperCase()

  // Vérifier le statut autorisé
  if (commande.statut !== 'en_livraison') {
    return NextResponse.json(
      { error: `La livraison ne peut être validée depuis le statut "${commande.statut}"` },
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

  // Compter les tentatives échouées précédentes
  const { count: failedAttempts, error: countErr } = await supabase
    .from('validation_codes')
    .select('*', { count: 'exact', head: true })
    .eq('commande_id', id)
    .eq('type_code', 'CLIENT')
    .eq('valide', false)

  if (countErr) {
    logger.error('Erreur comptage tentatives échouées', countErr)
  }
  const tentativeActuelle = (failedAttempts ?? 0) + 1

  // Comparer le code
  const codeAttendu = commande.code_client.toUpperCase()
  const estValide = codeSaisi === codeAttendu

  // Enregistrer la tentative
  const { error: insertErr } = await supabase
    .from('validation_codes')
    .insert({
      commande_id: id,
      type_code: 'CLIENT',
      code_saisi: code_client.trim(),
      valide: estValide,
      utilisateur_id: user.id,
      utilisateur_type: isAdmin ? 'ADMIN' : 'LIVREUR',
      adresse_ip: ip,
      cree_le: new Date().toISOString(),
    })

  if (insertErr) {
    logger.error('Erreur insertion validation_codes (livraison)', insertErr)
  }

  if (!estValide) {
    logger.warn(`Tentative échouée livraison commande ${id}, code saisi: ${codeSaisi}, tentative #${tentativeActuelle}`)
    return NextResponse.json(
      {
        error: 'Code client invalide.',
        tentatives_echouees: tentativeActuelle,
        tentatives_restantes: Math.max(0, 3 - tentativeActuelle),
      },
      { status: 400 }
    )
  }

  // Code valide : mise à jour du statut à "livree"
  const { error: updateErr } = await supabase
    .from('commandes')
    .update({
      statut: 'livree',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    logger.error(`Erreur mise à jour statut commande ${id}`, updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Historique des statuts
  await supabase.from('historique_statuts').insert({
    commande_id: id,
    ancien_statut: 'en_livraison',
    nouveau_statut: 'livree',
    motif: 'Livraison validée par code client',
    cree_par: user.email || 'livreur',
    cree_le: new Date().toISOString(),
  })

  logger.info(`Livraison validée pour la commande ${id} par ${user.email} (${isAdmin ? 'admin' : 'livreur'})`)

  return NextResponse.json({ success: true, nouveau_statut: 'livree' })
}