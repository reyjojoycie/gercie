// app/api/commandes/[id]/valider-collecte/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const bodySchema = z.object({
  code_livreur: z.string().min(1, 'Le code livreur est requis'),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-valider-collecte:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Vérification admin (pas un livreur ou client)
  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  // Validation de l'ID commande
  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
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

  const { code_livreur } = parsedBody.data
  const codeSaisi = code_livreur.trim().toUpperCase() // normalisation

  try {
    const supabase = await createClient(true)

    // Récupérer la commande avec le code_livreur et le statut actuels
    const { data: commande, error: commandeErr } = await supabase
      .from('commandes')
      .select('id, statut, code_livreur')
      .eq('id', parsedId.data)
      .single()

    if (commandeErr || !commande) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // Vérifier que le statut permet la validation de collecte
    const statutsValides = ['conditionnement_premium', 'collecte']
    if (!statutsValides.includes(commande.statut)) {
      return NextResponse.json(
        { error: `Action impossible depuis le statut "${commande.statut}"` },
        { status: 422 }
      )
    }

    // Vérifier que la commande possède un code livreur
    if (!commande.code_livreur) {
      return NextResponse.json(
        { error: 'Aucun livreur assigné à cette commande.' },
        { status: 422 }
      )
    }

    // Comparer le code saisi avec celui en base (insensible à la casse)
    const codeAttendu = commande.code_livreur.toUpperCase()
    const estValide = codeSaisi === codeAttendu

    // Enregistrer la tentative dans validation_codes
    const { error: insertErr } = await supabase
      .from('validation_codes')
      .insert({
        commande_id: parsedId.data,
        type_code: 'LIVREUR',
        code_saisi: code_livreur.trim(), // on garde la saisie brute
        valide: estValide,
        utilisateur_id: (await supabase.auth.getUser()).data.user?.id, // admin connecté
        utilisateur_type: 'ADMIN',
        adresse_ip: ip,
        cree_le: new Date().toISOString(),
      })

    if (insertErr) {
      logger.error('Erreur insertion validation_codes', insertErr)
    }

    if (!estValide) {
      logger.warn(`Tentative échouée de validation collecte commande ${parsedId.data}, code saisi: ${codeSaisi}`)
      return NextResponse.json(
        { error: 'Code livreur invalide.' },
        { status: 400 }
      )
    }

    // Mise à jour du statut vers "en_livraison"
    const { error: updateErr } = await supabase
      .from('commandes')
      .update({
        statut: 'en_livraison',
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsedId.data)

    if (updateErr) {
      logger.error(`Erreur mise à jour statut commande ${parsedId.data}`, updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Optionnel : insérer dans historique_statuts
    await supabase.from('historique_statuts').insert({
      commande_id: parsedId.data,
      ancien_statut: commande.statut,
      nouveau_statut: 'en_livraison',
      motif: 'Validation collecte par code livreur',
      cree_par: (await supabase.auth.getUser()).data.user?.email || 'admin',
      cree_le: new Date().toISOString(),
    })

    logger.info(`Collecte validée pour la commande ${parsedId.data} par l'admin`)

    return NextResponse.json({ success: true, nouveau_statut: 'en_livraison' })
  } catch (error: any) {
    logger.error('Crash PUT valider-collecte', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}