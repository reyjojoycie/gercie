// api/commandes/[id]/cancel/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { sendEmail, sendSMS, createNotification } from '@/lib/notifications'

/* ========================================================================== */
/*  Constantes métier                                                         */
/* ========================================================================== */

const ESCROW_USER_ID = 'c0ffee00-0000-0000-0000-000000000ec0' // Compte central Gercie
const STATUTS_ANNULABLES = ['en_attente', 'payee'] // Statuts où l'annulation est autorisée
const STATUTS_REMBOURSABLES = ['payee'] // Statuts où un remboursement doit être effectué

/* ========================================================================== */
/*  Schéma de validation                                                      */
/* ========================================================================== */

const cancelSchema = z.object({
  raison: z.string().max(500).optional(), // Raison de l'annulation (optionnelle)
})

/* ========================================================================== */
/*  Helpers métier                                                             */
/* ========================================================================== */

async function restoreStock(supabase: any, commandeId: string) {
  // Restaurer le stock de chaque article de la commande
  const { data: articles } = await supabase
    .from('commande_articles')
    .select('produit_id, quantite')
    .eq('commande_id', commandeId)

  if (!articles) return

  for (const article of articles) {
    const { error: stockError } = await supabase.rpc('increment_stock', {
      p_produit_id: article.produit_id,
      p_quantite: article.quantite,
    })
    if (stockError) {
      logger.error({ produit_id: article.produit_id, error: stockError }, 'Erreur restauration stock')
    }
  }
}

async function refundWallet(
  supabase: any,
  acheteurId: string,
  montant: number,
  commandeId: string,
) {
  // 1. Débiter le compte admin (escrow) – s'il a été crédité
  const { data: walletAdmin, error: adminErr } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', ESCROW_USER_ID)
    .single()

  if (adminErr || !walletAdmin) {
    throw new Error('Portefeuille administrateur introuvable')
  }

  if (walletAdmin.solde_achat < montant) {
    // Log mais on peut tenter un remboursement partiel (ou lever une erreur)
    logger.error({ commandeId, montant, solde: walletAdmin.solde_achat }, 'Solde admin insuffisant pour remboursement')
    // On ne bloque pas, on essaie de rembourser quand même
  }

  // 2. Débiter l'admin
  const nouveauSoldeAdmin = walletAdmin.solde_achat - montant
  const { error: debitAdminErr } = await supabase
    .from('portefeuilles')
    .update({ solde_achat: nouveauSoldeAdmin })
    .eq('id', ESCROW_USER_ID)

  if (debitAdminErr) {
    throw new Error('Erreur lors du débit du compte central')
  }

  // 3. Créditer l'acheteur
  const { data: walletAcheteur, error: walletErr } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', acheteurId)
    .single()

  if (walletErr || !walletAcheteur) {
    // Rollback du débit admin
    await supabase
      .from('portefeuilles')
      .update({ solde_achat: walletAdmin.solde_achat })
      .eq('id', ESCROW_USER_ID)
    throw new Error('Portefeuille acheteur introuvable')
  }

  const nouveauSoldeAcheteur = walletAcheteur.solde_achat + montant
  const { error: creditAcheteurErr } = await supabase
    .from('portefeuilles')
    .update({ solde_achat: nouveauSoldeAcheteur })
    .eq('id', acheteurId)

  if (creditAcheteurErr) {
    // Rollback
    await supabase
      .from('portefeuilles')
      .update({ solde_achat: walletAdmin.solde_achat })
      .eq('id', ESCROW_USER_ID)
    throw new Error('Erreur lors du remboursement du portefeuille acheteur')
  }

  // 4. Enregistrer les transactions
  const now = new Date().toISOString()
  await supabase.from('transactions').insert([
    {
      user_id: acheteurId,
      type: 'remboursement',
      montant: montant,
      commande_id: commandeId,
      description: `Remboursement annulation commande #${commandeId}`,
      portefeuille_type: 'achat',
      created_at: now,
    },
    {
      user_id: ESCROW_USER_ID,
      type: 'debit_remboursement',
      montant: -montant,
      commande_id: commandeId,
      description: `Sortie remboursement commande #${commandeId}`,
      portefeuille_type: 'achat',
      created_at: now,
    },
  ])
}

async function notifyCancellation(
  supabase: any,
  acheteurId: string,
  commandeNumero: string,
  montant: number,
  raison?: string,
) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, telephone, prenom')
      .eq('id', acheteurId)
      .single()

    if (!profile) return

    const sujet = `Commande #${commandeNumero} annulée – Gercie`
    const messageEmail = `Bonjour ${profile.prenom || ''},\n\nVotre commande #${commandeNumero} a été annulée${raison ? ` pour la raison suivante : "${raison}"` : ''}.\nUn remboursement de ${montant.toLocaleString()} FC a été crédité sur votre portefeuille Gercie.`
    
    await sendEmail(profile.email, sujet, messageEmail)
    await createNotification(acheteurId, 'commande', 'Commande annulée', messageEmail, { commande_id: commandeNumero })
    if (profile.telephone) {
      await sendSMS(profile.telephone, `Gercie: Votre commande #${commandeNumero} a été annulée. Remboursement de ${montant.toLocaleString()} FC effectué.`)
    }
  } catch (err) {
    logger.warn('Erreur lors des notifications d’annulation', err)
  }
}

/* ========================================================================== */
/*  PUT – Annuler une commande                                                 */
/* ========================================================================== */

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `cancel-commande:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Veuillez patienter.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // 2. Authentification
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // 3. Validation de l'ID de commande
  const { id } = await params
  const parsedId = z.string().uuid('ID de commande invalide').safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID de commande invalide' }, { status: 400 })
  }

  const commandeId = parsedId.data

  // 4. Lire le corps (raison facultative)
  let body: { raison?: string } | undefined
  try {
    body = await request.json()
  } catch {
    body = undefined
  }
  const raison = body?.raison || undefined

  try {
    const supabase = await createClient(true)

    // 5. Récupérer la commande avec les informations nécessaires
    const { data: commande, error: fetchError } = await supabase
      .from('commandes')
      .select('statut, total_global, acheteur_id, numero_commande, reduction, total_articles, frais_livraison')
      .eq('id', commandeId)
      .single()

    if (fetchError || !commande) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // 6. Vérifier que l'utilisateur est propriétaire
    if (commande.acheteur_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // 7. Vérifier le statut actuel
    if (!STATUTS_ANNULABLES.includes(commande.statut)) {
      return NextResponse.json({ error: 'Cette commande ne peut plus être annulée.' }, { status: 400 })
    }

    // 8. Mise à jour du statut vers "annulee"
    const { error: updateError } = await supabase
      .from('commandes')
      .update({ statut: 'annulee', date_annulation: new Date().toISOString(), raison_annulation: raison || null })
      .eq('id', commandeId)

    if (updateError) {
      logger.error('Erreur annulation commande', updateError)
      return NextResponse.json({ error: 'Erreur lors de l\'annulation' }, { status: 500 })
    }

    // 9. Restaurer le stock des articles
    await restoreStock(supabase, commandeId)

    // 10. Si la commande était payée, rembourser l'acheteur
    const montantARembourser = commande.total_global // déjà calculé avec réduction éventuelle
    if (STATUTS_REMBOURSABLES.includes(commande.statut)) {
      try {
        await refundWallet(supabase, commande.acheteur_id, montantARembourser, commandeId)
      } catch (refundError: any) {
        logger.error('Échec remboursement annulation commande', refundError)
        // On ne bloque pas l'annulation, mais on notifie l'admin
        await createNotification(
          user.id,
          'alerte',
          'Échec remboursement automatique',
          `L'annulation de la commande #${commande.numero_commande} a réussi mais le remboursement a échoué. Contacter le support.`,
          { commande_id: commandeId }
        )
      }
    }

    // 11. Notifier l'acheteur (email, push, SMS)
    await notifyCancellation(supabase, commande.acheteur_id, commande.numero_commande, montantARembourser, raison)

    // 12. Notifier l'admin / log métier
    logger.info(
      { commandeId, acheteurId: user.id, montant: commande.total_global, statutPrecedent: commande.statut },
      'Commande annulée avec succès'
    )

    return NextResponse.json({
      success: true,
      statut: 'annulee',
      remboursement: STATUTS_REMBOURSABLES.includes(commande.statut) ? montantARembourser : 0,
    })
  } catch (error: any) {
    logger.error('Crash dans l\'annulation de commande', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}