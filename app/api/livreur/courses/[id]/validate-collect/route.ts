// app/api/livreur/courses/[id]/validate-collect/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

// Helper pour ajouter une entrée dans l'historique du livreur
async function addHistorique(supabase: any, livreurId: string, commandeId: string, action: string, details: any = {}) {
  await supabase
    .from('livreur_historique')
    .insert({
      livreur_id: livreurId,
      commande_id: commandeId,
      action: action,
      details: details
    })
    .catch(e => console.error('Erreur ajout historique:', e))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { id: commandeId } = await params
    const supabase = await createClient(true) // service_role

    // 1. Vérifier que l'utilisateur est un livreur actif
    const { data: livreur, error: livreurError } = await supabase
      .from('livreurs')
      .select('id, est_actif')
      .eq('id', user.id)
      .single()

    if (livreurError || !livreur || !livreur.est_actif) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    // 2. Vérifier que la commande existe et que le livreur a bien accepté cette course
    const { data: livraison, error: livError } = await supabase
      .from('livraisons')
      .select('id, statut')
      .eq('commande_id', commandeId)
      .eq('livreur_id', user.id)
      .maybeSingle()

    if (livError || !livraison) {
      return NextResponse.json({ error: 'Vous n’avez pas accepté cette course' }, { status: 404 })
    }

    if (livraison.statut !== 'acceptee') {
      return NextResponse.json({ error: 'La collecte n’est plus possible (statut actuel : ' + livraison.statut + ')' }, { status: 400 })
    }

    // 3. Récupérer les données de la requête
    const body = await request.json()
    const { vendeur_id, code } = body

    if (!vendeur_id || !code) {
      return NextResponse.json({ error: 'Vendeur et code requis' }, { status: 400 })
    }

    // 4. Vérifier le code collecte pour ce vendeur
    const { data: cv, error: cvError } = await supabase
      .from('commandes_vendeurs')
      .select('id, code_collecte, collecte_validee')
      .eq('commande_id', commandeId)
      .eq('vendeur_id', vendeur_id)
      .single()

    if (cvError || !cv) {
      return NextResponse.json({ error: 'Aucune collecte trouvée pour ce vendeur' }, { status: 404 })
    }

    if (cv.collecte_validee) {
      return NextResponse.json({ error: 'Collecte déjà validée pour ce vendeur' }, { status: 400 })
    }

    if (cv.code_collecte !== code) {
      // Incrémenter le compteur de tentatives dans la livraison (optionnel)
      const { data: liv } = await supabase
        .from('livraisons')
        .select('tentatives_code')
        .eq('commande_id', commandeId)
        .maybeSingle()
      const newAttempts = (liv?.tentatives_code || 0) + 1
      await supabase
        .from('livraisons')
        .update({ tentatives_code: newAttempts, tentative_code_derniere: new Date().toISOString() })
        .eq('commande_id', commandeId)

      return NextResponse.json({ error: 'Code de collecte invalide' }, { status: 400 })
    }

    // 5. Marquer la collecte comme validée
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('commandes_vendeurs')
      .update({ collecte_validee: true, collecte_validee_at: now })
      .eq('id', cv.id)

    if (updateError) {
      console.error('Erreur validation collecte:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 6. Récupérer le montant des articles de ce vendeur pour créditer son portefeuille vente (moins 5% de commission)
    const { data: articlesVendeur, error: artError } = await supabase
      .from('commande_articles')
      .select(`
        prix_unitaire,
        quantite,
        produits (vendeur_id)
      `)
      .eq('commande_id', commandeId)

    if (artError) {
      console.error('Erreur récupération articles:', artError)
    }

    let totalVendeur = 0
    if (articlesVendeur) {
      totalVendeur = articlesVendeur
        .filter(a => a.produits?.vendeur_id === vendeur_id)
        .reduce((sum, a) => sum + (a.prix_unitaire * a.quantite), 0)
    }

    const commission = totalVendeur * 0.05
    const netVendeur = totalVendeur - commission

    // Créditer le portefeuille vente du vendeur
    if (netVendeur > 0) {
      const { data: walletVendeur } = await supabase
        .from('portefeuilles')
        .select('solde_vente')
        .eq('id', vendeur_id)
        .single()

      const nouveauSoldeVente = (walletVendeur?.solde_vente || 0) + netVendeur
      const { error: creditError } = await supabase
        .from('portefeuilles')
        .update({ solde_vente: nouveauSoldeVente })
        .eq('id', vendeur_id)

      if (creditError) {
        console.error('Erreur crédit vendeur:', creditError)
        // Non bloquant, on continue
      }

      // Enregistrer la transaction
      await supabase
        .from('transactions')
        .insert({
          user_id: vendeur_id,
          type: 'vente',
          montant: netVendeur,
          commande_id: commandeId,
          description: `Vente (collecte validée) - Commande #${commandeId}`,
          portefeuille_type: 'vente',
          commission: commission
        })
    }

    // 7. Vérifier si toutes les collectes sont maintenant validées
    const { data: toutesCollectes, error: allError } = await supabase
      .from('commandes_vendeurs')
      .select('collecte_validee')
      .eq('commande_id', commandeId)

    if (!allError && toutesCollectes) {
      const toutesValidees = toutesCollectes.every(c => c.collecte_validee === true)
      if (toutesValidees) {
        // Mettre à jour la livraison et la commande
        await supabase
          .from('livraisons')
          .update({ statut: 'colis_recupere', recupere_at: now })
          .eq('commande_id', commandeId)

        await supabase
          .from('commandes')
          .update({ statut: 'en_livraison' })
          .eq('id', commandeId)
      }
    }

    // 8. Ajouter à l'historique du livreur
    await addHistorique(supabase, user.id, commandeId, 'collect_validated', { vendeur_id, code })

    return NextResponse.json({
      success: true,
      message: 'Collecte validée avec succès',
      vendeur_id,
      montant_credite: netVendeur,
      commission_prelevee: commission
    })
  } catch (err) {
    console.error('Erreur POST /api/livreur/courses/[id]/validate-collect:', err)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}