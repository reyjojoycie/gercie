// api/retours/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { sendEmail, sendSMS, createNotification } from '@/lib/notifications'

/* ========================================================================== */
/*  Schémas de validation                                                     */
/* ========================================================================== */

// Création d'un retour par l'acheteur
const createReturnSchema = z.object({
  commande_id: z.string().uuid('ID commande invalide'),
  articles: z.array(z.object({
    article_id: z.string().uuid('ID article invalide'),
    quantite: z.number().int().positive().default(1),
    motif: z.string().min(10, 'Veuillez préciser le motif (min 10 caractères)').max(1000),
    type: z.enum(['defectueux', 'non_conforme', 'endommage', 'autre']),
    photos: z.array(z.string().url()).max(5).optional(),
  })).min(1, 'Au moins un article à retourner'),
  remboursement_prefere: z.enum(['wallet', 'mobile', 'virement']).default('wallet'),
  commentaire: z.string().max(1000).optional(),
})

// Mise à jour du statut par l'admin
const updateReturnSchema = z.object({
  statut: z.enum(['en_attente', 'accepte', 'refuse', 'rembourse']),
  commentaire_admin: z.string().max(500).optional(),
  montant_rembourse: z.number().positive().optional(), // si remboursement partiel
})

/* ========================================================================== */
/*  Constantes métier                                                         */
/* ========================================================================== */

const DELAI_RETOUR_JOURS = 14
const ESCROW_USER_ID = process.env.ADMIN_USER_ID || 'c0ffee00-0000-0000-0000-000000000ec0'

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

async function checkReturnEligibility(supabase: any, commandeId: string, userId: string) {
  // Récupérer la commande
  const { data: commande, error: cmdError } = await supabase
    .from('commandes')
    .select('id, acheteur_id, statut, livree_at, created_at')
    .eq('id', commandeId)
    .single()

  if (cmdError || !commande) throw new Error('Commande introuvable')
  if (commande.acheteur_id !== userId) throw new Error('Non autorisé')
  if (commande.statut !== 'livree') throw new Error('La commande doit être livrée pour effectuer un retour')

  // Vérifier le délai de 14 jours
  const livreeDate = commande.livree_at ? new Date(commande.livree_at) : new Date(commande.created_at)
  const maintenant = new Date()
  const diffJours = (maintenant.getTime() - livreeDate.getTime()) / (1000 * 3600 * 24)
  if (diffJours > DELAI_RETOUR_JOURS) {
    throw new Error(`Le délai de ${DELAI_RETOUR_JOURS} jours est dépassé`)
  }

  return commande
}

async function sendReturnNotifications(
  supabase: any,
  userId: string,
  commandeNumero: string,
  statut: string,
  details?: string,
) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, telephone, prenom')
      .eq('id', userId)
      .single()

    if (!profile) return

    const sujet = `Demande de retour #${commandeNumero} – ${statut}`
    const message = details || `Votre demande de retour pour la commande #${commandeNumero} a été mise à jour : ${statut}.`

    await sendEmail(profile.email, sujet, message)
    await createNotification(userId, 'retour', `Retour ${statut}`, message, { commande_id: commandeNumero })
    if (profile.telephone) {
      await sendSMS(profile.telephone, `Gercie: Retour #${commandeNumero} – ${statut}.`)
    }
  } catch (err) {
    logger.warn('Erreur notification retour', err)
  }
}

async function processRefund(
  supabase: any,
  userId: string,
  commandeId: string,
  montant: number,
  commentaire?: string,
) {
  // Rembourser depuis le compte admin vers l'acheteur
  const { data: walletAdmin, error: adminErr } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', ESCROW_USER_ID)
    .single()

  if (adminErr || !walletAdmin) throw new Error('Portefeuille administrateur introuvable')
  if (walletAdmin.solde_achat < montant) throw new Error('Solde administrateur insuffisant')

  // Débiter admin
  await supabase
    .from('portefeuilles')
    .update({ solde_achat: walletAdmin.solde_achat - montant })
    .eq('id', ESCROW_USER_ID)

  // Créditer acheteur
  const { data: walletAcheteur } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', userId)
    .single()
  if (!walletAcheteur) throw new Error('Portefeuille acheteur introuvable')

  await supabase
    .from('portefeuilles')
    .update({ solde_achat: walletAcheteur.solde_achat + montant })
    .eq('id', userId)

  // Transactions
  const now = new Date().toISOString()
  await supabase.from('transactions').insert([
    {
      user_id: userId,
      type: 'remboursement',
      montant: montant,
      commande_id: commandeId,
      description: `Remboursement retour commande #${commandeId}${commentaire ? ' : ' + commentaire : ''}`,
      portefeuille_type: 'achat',
      created_at: now,
    },
    {
      user_id: ESCROW_USER_ID,
      type: 'debit_remboursement',
      montant: -montant,
      commande_id: commandeId,
      description: `Sortie remboursement retour #${commandeId}`,
      portefeuille_type: 'achat',
      created_at: now,
    },
  ])
}

/* ========================================================================== */
/*  POST – Créer une demande de retour                                        */
/* ========================================================================== */

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `retours:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Patientez une minute.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
    }

    const parsed = createReturnSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { commande_id, articles, remboursement_prefere, commentaire } = parsed.data
    const supabase = await createClient(true)

    // Vérifier éligibilité
    const commande = await checkReturnEligibility(supabase, commande_id, user.id)

    // Vérifier qu'aucun retour n'est déjà en cours pour cette commande (pas de doublon)
    const { data: existant } = await supabase
      .from('retours')
      .select('id')
      .eq('commande_id', commande_id)
      .in('statut', ['en_attente', 'accepte'])
      .maybeSingle()
    if (existant) {
      return NextResponse.json({ error: 'Un retour est déjà en cours pour cette commande' }, { status: 400 })
    }

    // Créer le retour
    const { data: retour, error: insertError } = await supabase
      .from('retours')
      .insert({
        commande_id,
        acheteur_id: user.id,
        statut: 'en_attente',
        articles: JSON.stringify(articles),
        remboursement_prefere,
        commentaire,
        date_demande: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !retour) {
      logger.error('Erreur création retour', insertError)
      return NextResponse.json({ error: 'Erreur lors de la création du retour' }, { status: 500 })
    }

    // Notifications
    await sendReturnNotifications(supabase, user.id, commande.numero_commande, 'en_attente',
      `Votre demande de retour pour la commande #${commande.numero_commande} a été enregistrée. Nous vous contacterons sous 48h.`
    )

    // Notifier l'admin
    await createNotification(
      ESCROW_USER_ID,
      'retour_admin',
      'Nouvelle demande de retour',
      `Commande #${commande.numero_commande} – ${articles.length} article(s)`,
      { commande_id, retour_id: retour.id }
    )

    logger.info({ userId: user.id, commande_id, retourId: retour.id }, 'Demande de retour créée')

    return NextResponse.json({ success: true, retour_id: retour.id }, { status: 201 })
  } catch (error: any) {
    logger.error('Crash POST retours', error)
    const message = error.message || 'Erreur serveur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/* ========================================================================== */
/*  GET – Lister les retours de l'utilisateur                                 */
/* ========================================================================== */

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || undefined
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    const supabase = await createClient()
    let query = supabase
      .from('retours')
      .select('id, commande_id, statut, articles, remboursement_prefere, commentaire, date_demande, date_resolution, commentaire_admin')
      .eq('acheteur_id', user.id)
      .order('date_demande', { ascending: false })

    if (statut) query = query.eq('statut', statut)

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data: retours, error } = await query
    if (error) {
      logger.error('Erreur récupération retours', error)
      return NextResponse.json({ error: 'Impossible de charger vos retours' }, { status: 500 })
    }

    return NextResponse.json(retours || [])
  } catch (error: any) {
    logger.error('Crash GET retours', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  PUT – Mettre à jour le statut d'un retour (admin)                         */
/* ========================================================================== */

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    // Vérifier que l'utilisateur est admin (vous adapterez selon votre système de rôles)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
    }

    const parsed = updateReturnSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { statut, commentaire_admin, montant_rembourse } = parsed.data
    const { searchParams } = new URL(request.url)
    const retourId = searchParams.get('id')
    if (!retourId || !z.string().uuid().safeParse(retourId).success) {
      return NextResponse.json({ error: 'ID retour invalide' }, { status: 400 })
    }

    const supabase = await createClient(true)

    // Récupérer le retour existant
    const { data: retour, error: fetchError } = await supabase
      .from('retours')
      .select('id, commande_id, acheteur_id, statut')
      .eq('id', retourId)
      .single()

    if (fetchError || !retour) {
      return NextResponse.json({ error: 'Retour introuvable' }, { status: 404 })
    }

    // Mettre à jour le retour
    const updateData: any = { statut, date_resolution: new Date().toISOString() }
    if (commentaire_admin) updateData.commentaire_admin = commentaire_admin

    const { error: updateError } = await supabase
      .from('retours')
      .update(updateData)
      .eq('id', retourId)

    if (updateError) {
      logger.error('Erreur mise à jour retour', updateError)
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
    }

    // Si le retour est accepté et remboursable, procéder au remboursement
    if (statut === 'accepte' || statut === 'rembourse') {
      try {
        // Récupérer le total payé pour cette commande (ou le montant spécifié)
        const { data: commande } = await supabase
          .from('commandes')
          .select('total_global, numero_commande')
          .eq('id', retour.commande_id)
          .single()

        if (commande) {
          const montant = montant_rembourse || commande.total_global
          await processRefund(supabase, retour.acheteur_id, retour.commande_id, montant, commentaire_admin)
          // Mettre à jour le statut du retour en "rembourse" si ce n'était pas déjà fait
          if (statut === 'accepte') {
            await supabase
              .from('retours')
              .update({ statut: 'rembourse' })
              .eq('id', retourId)
          }
          await sendReturnNotifications(supabase, retour.acheteur_id, commande.numero_commande, 'rembourse',
            `Votre retour a été accepté et un remboursement de ${montant.toLocaleString()} FC a été effectué.`)
        }
      } catch (refundError: any) {
        logger.error('Échec remboursement retour', refundError)
        // On notifie l'admin sans bloquer
        await createNotification(user.id, 'alerte', 'Échec remboursement retour',
          `Le retour ${retourId} a été accepté mais le remboursement a échoué : ${refundError.message}`)
      }
    } else {
      // Notification simple du changement de statut
      const { data: commande } = await supabase
        .from('commandes')
        .select('numero_commande')
        .eq('id', retour.commande_id)
        .single()
      if (commande) {
        await sendReturnNotifications(supabase, retour.acheteur_id, commande.numero_commande, statut,
          `Votre demande de retour a été ${statut === 'accepte' ? 'acceptée' : statut === 'refuse' ? 'refusée' : 'mise à jour'}.`
        )
      }
    }

    logger.info({ retourId, statut, adminId: user.id }, 'Retour mis à jour')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Crash PUT retours', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}