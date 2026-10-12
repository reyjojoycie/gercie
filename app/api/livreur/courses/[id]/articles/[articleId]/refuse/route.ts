// app/api/livreur/courses/[id]/articles/[articleId]/refuse/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { sendEmail, createNotification } from '@/lib/notifications'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; articleId: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { id: commandeId, articleId } = await params
    const supabase = await createClient(true)

    // 1. Vérifier que l'utilisateur est un livreur actif
    const { data: livreur, error: livreurError } = await supabase
      .from('livreurs')
      .select('id, est_actif')
      .eq('id', user.id)
      .maybeSingle()

    if (livreurError || !livreur || !livreur.est_actif) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    // 2. Vérifier que la commande existe et que le livreur y est associé
    const { data: livraison, error: livError } = await supabase
      .from('livraisons')
      .select('id, statut')
      .eq('commande_id', commandeId)
      .eq('livreur_id', user.id)
      .maybeSingle()

    if (livError || !livraison) {
      return NextResponse.json({ error: 'Vous n’êtes pas associé à cette commande' }, { status: 404 })
    }

    // 3. Récupérer l'article
    const { data: article, error: artError } = await supabase
      .from('commande_articles')
      .select(`
        id,
        produit_id,
        quantite,
        prix_unitaire,
        statut_collecte,
        produits (vendeur_id, nom)
      `)
      .eq('id', articleId)
      .eq('commande_id', commandeId)
      .single()

    if (artError || !article) {
      return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
    }

    if (article.statut_collecte === 'accepte') {
      return NextResponse.json({ error: 'Cet article a déjà été validé, impossible de le refuser' }, { status: 400 })
    }

    if (article.statut_collecte === 'refuse') {
      return NextResponse.json({ error: 'Cet article a déjà été refusé' }, { status: 400 })
    }

    // 4. Récupérer les données du refus
    const body = await request.json()
    const { motif, photo_preuve } = body

    if (!motif) {
      return NextResponse.json({ error: 'Motif du refus requis' }, { status: 400 })
    }

    // 5. Marquer l'article comme refusé
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('commande_articles')
      .update({
        statut_collecte: 'refuse',
        motif_refus: motif,
        photo_preuve: photo_preuve || null,
        collecte_validee_at: now,
      })
      .eq('id', articleId)

    if (updateError) {
      console.error('Erreur mise à jour article:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 6. Récupérer les informations du vendeur et de l'acheteur pour les notifications
    const vendeurId = article.produits?.vendeur_id
    let vendeurEmail = null
    let acheteurEmail = null
    let acheteurId = null

    if (vendeurId) {
      const { data: vendeur } = await supabase
        .from('profiles')
        .select('email, nom, prenom, telephone')
        .eq('id', vendeurId)
        .single()
      if (vendeur) vendeurEmail = vendeur.email
    }

    const { data: commande } = await supabase
      .from('commandes')
      .select('acheteur_id')
      .eq('id', commandeId)
      .single()
    if (commande) {
      acheteurId = commande.acheteur_id
      const { data: acheteur } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', acheteurId)
        .single()
      if (acheteur) acheteurEmail = acheteur.email
    }

    // 7. Notifier le vendeur et l'acheteur
    const produitNom = article.produits?.nom || 'Produit'
    const motifTexte = motif

    if (vendeurEmail) {
      await sendEmail(
        vendeurEmail,
        `Article refusé par le livreur - Commande #${commandeId}`,
        `<div style="font-family:sans-serif;">
          <h2>Article refusé lors de la collecte</h2>
          <p>Le livreur a refusé de prendre l'article suivant : <strong>${produitNom}</strong>.</p>
          <p><strong>Motif :</strong> ${motifTexte}</p>
          <p>Le paiement de cet article ne vous sera pas versé. Contactez le support si nécessaire.</p>
          <hr/>
          <p style="font-size:12px;">Gercie – Marketplace de prestige</p>
        </div>`
      )
      await createNotification(
        vendeurId!,
        'commande',
        'Article refusé',
        `Le livreur a refusé votre produit "${produitNom}". Motif : ${motifTexte.substring(0, 100)}`,
        { commande_id: commandeId, article_id: articleId, motif: motifTexte }
      )
    }

    if (acheteurEmail) {
      await sendEmail(
        acheteurEmail,
        `Article refusé dans votre commande #${commandeId}`,
        `<div style="font-family:sans-serif;">
          <h2>Un article de votre commande a été refusé</h2>
          <p>Le livreur n'a pas pu prendre l'article suivant : <strong>${produitNom}</strong>.</p>
          <p><strong>Motif :</strong> ${motifTexte}</p>
          <p>Cet article ne vous sera pas facturé. Vous serez remboursé si le paiement a déjà été effectué.</p>
          <hr/>
          <p style="font-size:12px;">Gercie – Marketplace de prestige</p>
        </div>`
      )
      if (acheteurId) {
        await createNotification(
          acheteurId,
          'commande',
          'Article refusé',
          `Le livreur a refusé le produit "${produitNom}" de votre commande. Motif : ${motifTexte.substring(0, 100)}`,
          { commande_id: commandeId, article_id: articleId, motif: motifTexte }
        )
      }
    }

    // 8. Ajouter à l'historique du livreur
    await supabase
      .from('livreur_historique')
      .insert({
        livreur_id: user.id,
        commande_id: commandeId,
        action: 'refuse-article',
        details: { article_id: articleId, motif: motifTexte, photo: photo_preuve || null },
      })
      .catch(e => console.error('Erreur ajout historique:', e))

    return NextResponse.json({
      success: true,
      message: 'Article refusé avec succès',
    })
  } catch (err) {
    console.error('Erreur POST /api/livreur/courses/[id]/articles/[articleId]/refuse:', err)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}