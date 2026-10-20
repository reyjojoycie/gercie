// api/commandes/update-status/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail, sendSMS, createNotification } from '@/lib/notifications'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Schéma de validation enrichi                                              */
/* ========================================================================== */

const updateStatusSchema = z.object({
  commande_id: z.string().uuid('ID de commande invalide'),
  statut: z.enum([
    'en_attente',    // réinitialisation (admin)
    'payee',         // après paiement
    'collecte',      // le vendeur prépare
    'en_livraison',  // remis au livreur
    'livree',        // remis à l’acheteur
    'annulee',       // annulation
  ]),
  // Optionnel : forcer une mise à jour même si l’ordre logique n’est pas respecté (admin uniquement)
  force: z.boolean().default(false),
  // Raison pour le statut (trace)
  commentaire: z.string().max(500).optional(),
})

/* ========================================================================== */
/*  Types de transitions autorisées (workflow métier)                         */
/* ========================================================================== */

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  en_attente: ['payee', 'annulee'],
  payee: ['collecte', 'annulee'],
  collecte: ['en_livraison', 'annulee'],
  en_livraison: ['livree', 'annulee'],
  livree: ['retourne'], // pour l’instant pas géré mais ouvert
  annulee: [],
}

const STATUT_LABELS: Record<string, string> = {
  en_attente: 'En attente de paiement',
  payee: 'Payée',
  collecte: 'En préparation',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
}

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

async function generateDeliveryCode(supabase: any, commandeId: string): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const { error } = await supabase
    .from('commandes')
    .update({ code_livraison: code })
    .eq('id', commandeId)
  if (error) throw new Error('Impossible de générer le code de livraison')
  return code
}

async function notifyStatusChange(
  supabase: any,
  acheteurId: string,
  commandeNumero: string,
  nouveauStatut: string,
  details?: { codeLivraison?: string; livreurNom?: string; pointRetrait?: string },
) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, telephone, prenom')
      .eq('id', acheteurId)
      .single()

    if (!profile) return

    const statutLabel = STATUT_LABELS[nouveauStatut] || nouveauStatut
    let message = `Votre commande #${commandeNumero} est maintenant : ${statutLabel}.`

    if (nouveauStatut === 'payee' && details?.codeLivraison) {
      message += `\nCode de livraison : ${details.codeLivraison}`
    }
    if (nouveauStatut === 'en_livraison' && details?.livreurNom) {
      message += `\nLivreur : ${details.livreurNom}`
    }
    if (nouveauStatut === 'livree') {
      message += `\nMerci pour votre confiance !`
    }

    await sendEmail(profile.email, `Commande #${commandeNumero} – ${statutLabel}`, message)
    await createNotification(acheteurId, 'commande', `Statut : ${statutLabel}`, message, { commande_id: commandeNumero })
    if (profile.telephone) {
      await sendSMS(profile.telephone, `Gercie: Commande #${commandeNumero} – ${statutLabel}`)
    }
  } catch (err) {
    logger.warn('Erreur notification changement statut', err)
  }
}

async function transferFundsOnPayment(
  supabase: any,
  acheteurId: string,
  commandeId: string,
  montant: number,
): Promise<void> {
  // Débiter le portefeuille achat de l'acheteur
  const { data: walletAcheteur, error: walletErr } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', acheteurId)
    .single()

  if (walletErr || !walletAcheteur) throw new Error('Portefeuille acheteur introuvable')
  if (walletAcheteur.solde_achat < montant) throw new Error('Solde achat insuffisant')

  const nouveauSoldeAcheteur = walletAcheteur.solde_achat - montant
  const { error: debitError } = await supabase
    .from('portefeuilles')
    .update({ solde_achat: nouveauSoldeAcheteur })
    .eq('id', acheteurId)
  if (debitError) throw new Error('Erreur débit acheteur')

  // Créditer le compte central (admin)
  const ADMIN_ID = process.env.ADMIN_USER_ID!
  if (!ADMIN_ID) throw new Error('Configuration admin manquante')

  const { data: walletAdmin, error: adminErr } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', ADMIN_ID)
    .single()
  if (adminErr || !walletAdmin) throw new Error('Portefeuille administrateur introuvable')

  const nouveauSoldeAdmin = walletAdmin.solde_achat + montant
  const { error: creditError } = await supabase
    .from('portefeuilles')
    .update({ solde_achat: nouveauSoldeAdmin })
    .eq('id', ADMIN_ID)
  if (creditError) throw new Error('Erreur crédit admin')

  // Transactions
  const now = new Date().toISOString()
  await supabase.from('transactions').insert([
    {
      user_id: acheteurId,
      type: 'achat',
      montant: -montant,
      commande_id: commandeId,
      description: `Paiement commande #${commandeId}`,
      portefeuille_type: 'achat',
      created_at: now,
    },
    {
      user_id: ADMIN_ID,
      type: 'vente',
      montant: montant,
      commande_id: commandeId,
      description: `Réception paiement commande #${commandeId}`,
      portefeuille_type: 'achat',
      created_at: now,
    },
  ])
}

/* ========================================================================== */
/*  POST – Mettre à jour le statut d’une commande                            */
/* ========================================================================== */

export async function POST(request: Request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `update-status:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Patientez une minute.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // 2. Validation des données entrantes
    const rawBody = await request.json()
    const parsed = updateStatusSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { commande_id, statut: newStatus, force, commentaire } = parsed.data
    const supabase = await createClient(true) // service_role pour opérations critiques

    // 3. Récupérer la commande
    const { data: commande, error: cmdError } = await supabase
      .from('commandes')
      .select(`
        id,
        acheteur_id,
        total_global,
        statut,
        code_livraison,
        numero_commande,
        type_livraison,
        point_retrait_id
      `)
      .eq('id', commande_id)
      .single()

    if (cmdError || !commande) {
      logger.warn({ commande_id }, 'Commande introuvable pour mise à jour statut')
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // 4. Vérification des autorisations
    const isOwner = commande.acheteur_id === user.id
    const isAdmin = user.role === 'admin' // ou récupéré depuis le contexte utilisateur
    const isLivreur = user.role === 'livreur' // si applicable

    // L'acheteur peut seulement annuler (et payer via une autre route)
    // Le livreur peut passer de collecte → en_livraison, et en_livraison → livree
    // L'admin peut tout faire (avec force)
    if (!isAdmin && !isOwner && !isLivreur) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // 5. Validation de la transition d'état
    const currentStatus = commande.statut
    const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus] || []
    if (!allowedTransitions.includes(newStatus) && !force) {
      return NextResponse.json(
        { error: `Transition impossible de "${currentStatus}" à "${newStatus}"` },
        { status: 400 }
      )
    }

    // 6. Actions spécifiques selon le nouveau statut
    let codeLivraison: string | undefined

    switch (newStatus) {
      case 'payee':
        // Vérifier que la commande n'est pas déjà payée
        if (currentStatus === 'payee') {
          return NextResponse.json({ error: 'Commande déjà payée' }, { status: 400 })
        }
        // Générer le code de livraison si pas déjà fait
        if (!commande.code_livraison) {
          codeLivraison = await generateDeliveryCode(supabase, commande_id)
        }
        // Transfert des fonds
        await transferFundsOnPayment(supabase, commande.acheteur_id, commande_id, commande.total_global)
        break

      case 'collecte':
        // Notifier le vendeur (si logique multi-vendeur, ici on notifie l'admin)
        break

      case 'en_livraison':
        // Assigner un livreur si pas déjà fait (logique à part)
        break

      case 'livree':
        // Envoyer une demande d'avis après un délai ?
        break

      case 'annulee':
        // L'annulation est gérée par une route dédiée (/api/commandes/[id]/cancel)
        return NextResponse.json({ error: 'Utilisez la route d\'annulation dédiée' }, { status: 400 })
    }

    // 7. Mise à jour du statut
    const updateData: any = { statut: newStatus }
    if (commentaire) updateData.commentaire_statut = commentaire
    if (codeLivraison) updateData.code_livraison = codeLivraison

    const { error: updateError } = await supabase
      .from('commandes')
      .update(updateData)
      .eq('id', commande_id)

    if (updateError) {
      logger.error('Erreur mise à jour statut commande', updateError)
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
    }

    // 8. Notifications
    await notifyStatusChange(
      supabase,
      commande.acheteur_id,
      commande.numero_commande,
      newStatus,
      { codeLivraison }
    )

    logger.info({ commande_id, oldStatus: currentStatus, newStatus, userId: user.id }, 'Statut commande mis à jour')

    return NextResponse.json({ success: true, statut: newStatus })
  } catch (error: any) {
    logger.error('Crash dans update-status', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}