import { createClient } from '@/lib/supabaseServer'
import { requireLivreur } from '@/lib/auth/livreurGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail, sendSMS, createNotification } from '@/lib/notifications'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const ESCROW_USER_ID = process.env.ESCROW_USER_ID ?? ''
const MAX_PIN_ATTEMPTS = 3

const acceptSchema = z.object({
  action: z.literal('accept'),
  current_lat: z.number().min(-90).max(90).optional(),
  current_lng: z.number().min(-180).max(180).optional(),
})

const validateArticleSchema = z.object({
  action: z.literal('validate-article'),
  article_id: z.string().uuid(),
  code: z.string().length(6, 'Le code doit contenir 6 caractères'),
})

const refuseArticleSchema = z.object({
  action: z.literal('refuse-article'),
  article_id: z.string().uuid(),
  motif: z.string().min(5, 'Le motif doit contenir au moins 5 caractères'),
  photo_preuve: z.string().url().optional().nullable(),
})

const deliverSchema = z.object({
  action: z.literal('deliver'),
  pin: z.string().length(6, 'Le code PIN doit contenir 6 chiffres'),
  photos_livraison: z.array(z.string().url()).optional(),
  signature_client: z.string().optional(),
  geoloc: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().optional(),
  }).optional(),
})

const signalSchema = z.object({
  action: z.literal('signal'),
  type: z.enum(['warning', 'danger', 'info']),
  message: z.string().min(10, 'Veuillez décrire le problème'),
  photo: z.string().url().optional(),
})

const actionSchema = z.discriminatedUnion('action', [
  acceptSchema,
  validateArticleSchema,
  refuseArticleSchema,
  deliverSchema,
  signalSchema,
])

async function updateLivreurStats(supabase: any, livreurId: string, distanceKm: number = 0) {
  const now = new Date().toISOString()
  try {
    await supabase.rpc('increment_livreur_stats', {
      p_livreur_id: livreurId,
      p_distance: distanceKm,
      p_now: now,
    })
  } catch {
    const { data: stats } = await supabase
      .from('livreurs')
      .select('total_livraisons, distance_parcourue_km')
      .eq('id', livreurId)
      .single()
    const newTotal = (stats?.total_livraisons || 0) + 1
    const newDistance = (stats?.distance_parcourue_km || 0) + distanceKm
    await supabase
      .from('livreurs')
      .update({
        total_livraisons: newTotal,
        distance_parcourue_km: newDistance,
        derniere_activite: now,
      })
      .eq('id', livreurId)
  }
}

async function addHistorique(
  supabase: any,
  livreurId: string,
  commandeId: string,
  action: string,
  details: any = {},
  ip?: string
) {
  try {
    await supabase.from('livreur_historique').insert({
      livreur_id: livreurId,
      commande_id: commandeId,
      action,
      details: { ...details, timestamp: new Date().toISOString(), ip: ip || 'unknown' },
    })
  } catch (e) {
    logger.error(e, 'Échec ajout historique livreur')
  }
}

async function notifyArticleValidated(
  supabase: any,
  article: any,
  commandeId: string,
  livreurName: string
) {
  try {
    const vendeurId = article.produits?.vendeur_id
    if (!vendeurId) return
    const { data: vendeurProfile } = await supabase
      .from('profiles')
      .select('email, telephone, prenom, nom')
      .eq('id', vendeurId)
      .single()
    if (vendeurProfile?.email) {
      await sendEmail(
        vendeurProfile.email,
        `✅ Article validé – ${article.produits?.nom}`,
        `<p>Bonjour ${vendeurProfile.prenom},</p>
         <p>L'article <strong>${article.produits?.nom}</strong> a été validé par le livreur <strong>${livreurName}</strong> lors de la collecte.</p>
         <p>Il sera livré prochainement.</p>`
      )
    }
    if (vendeurProfile) {
      await createNotification(
        vendeurId,
        'collecte',
        'Article validé',
        `Votre article "${article.produits?.nom}" a été récupéré par le livreur.`,
        { commande_id: commandeId, article_id: article.id }
      )
    }
  } catch (err) {
    logger.error(err, 'Erreur notification validation article')
  }
}

async function notifyArticleRefused(
  supabase: any,
  article: any,
  commandeId: string,
  motif: string,
  livreurName: string
) {
  try {
    const vendeurId = article.produits?.vendeur_id
    if (!vendeurId) return
    const { data: vendeurProfile } = await supabase
      .from('profiles')
      .select('email, telephone, prenom')
      .eq('id', vendeurId)
      .single()
    if (vendeurProfile?.email) {
      await sendEmail(
        vendeurProfile.email,
        `❌ Article refusé – ${article.produits?.nom}`,
        `<p>Bonjour ${vendeurProfile.prenom},</p>
         <p>L'article <strong>${article.produits?.nom}</strong> a été refusé par le livreur pour le motif suivant :</p>
         <blockquote>${motif}</blockquote>`
      )
    }
    if (vendeurProfile) {
      await createNotification(
        vendeurId,
        'collecte',
        'Article refusé',
        `"${article.produits?.nom}" refusé. Motif : ${motif.substring(0, 80)}`,
        { commande_id: commandeId, article_id: article.id, motif }
      )
    }
  } catch (err) {
    logger.error(err, 'Erreur notification refus article')
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers } = rateLimit({ id: `course-get:${ip}`, maxRequests: 20 })
  if (!allowed) return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 }), headers)

  try {
    const livreur = await requireLivreur()
    const livreurId = livreur.id
    const { id } = await params
    const supabase = await createClient(true)

    const { data: commande, error: cmdError } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, total_global, statut, type_livraison,
        adresse_livraison, code_livraison, point_retrait_id,
        points_retrait (nom, adresse), commune_livraison_id,
        communes (nom), acheteur:acheteur_id(nom, prenom, telephone)
      `)
      .eq('id', id)
      .single()
    if (cmdError || !commande) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    const { data: articles } = await supabase
      .from('commande_articles')
      .select(`
        id, quantite, prix_unitaire, specifications, variante,
        code_vendeur, code_acheteur, statut_collecte, motif_refus,
        photo_preuve, collecte_validee_at,
        produits (id, nom, description, images, video_url, vendeur_id)
      `)
      .eq('commande_id', id)

    const articlesAvecVendeur = await Promise.all(
      (articles || []).map(async (article: any) => {
        const vendeurId = article.produits?.vendeur_id
        let vendeur = null
        if (vendeurId) {
          const { data: v } = await supabase
            .from('profiles')
            .select('nom, prenom, telephone, adresse_boutique, latitude, longitude')
            .eq('id', vendeurId)
            .single()
          vendeur = v
        }
        return {
          ...article,
          vendeur: vendeur || { nom: '', prenom: '', telephone: '', adresse_boutique: '', latitude: null, longitude: null },
        }
      })
    )

    const { data: existingLivraison } = await supabase
      .from('livraisons')
      .select('*')
      .eq('commande_id', id)
      .maybeSingle()

    const isAvailable = commande.statut === 'payee' && !existingLivraison
    const adresse =
      commande.type_livraison === 'domicile'
        ? commande.adresse_livraison
        : commande.points_retrait?.adresse

    const { data: acheteurProfile } = await supabase
      .from('profiles')
      .select('latitude, longitude')
      .eq('id', commande.acheteur_id)
      .single()

    return NextResponse.json({
      id: commande.id,
      numero: commande.numero_commande,
      total: commande.total_global,
      statut_commande: commande.statut,
      type_livraison: commande.type_livraison,
      adresse,
      point_retrait_nom: commande.type_livraison === 'point_retrait' ? commande.points_retrait?.nom : null,
      commune: commande.communes?.nom,
      code_livraison_client: commande.code_livraison,
      client: {
        nom: commande.acheteur?.nom || '',
        prenom: commande.acheteur?.prenom || '',
        telephone: commande.acheteur?.telephone || '',
        latitude: acheteurProfile?.latitude || null,
        longitude: acheteurProfile?.longitude || null,
      },
      articles: articlesAvecVendeur,
      livraison: existingLivraison,
      code_livreur: existingLivraison?.code_livreur || null,
      disponible: isAvailable,
    })
  } catch (error: any) {
    logger.error(error, 'Erreur GET course')
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `course-action:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Veuillez patienter.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide (JSON attendu)' }, { status: 400 })
  }

  try {
    let livreur
    try {
      livreur = await requireLivreur()
    } catch (authError: any) {
      logger.warn(authError, 'Échec authentification livreur')
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const livreurId = livreur.id
    const { id } = await params
    const supabase = await createClient(true)

    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) {
      logger.warn({ userId: livreurId, errors: parsed.error.flatten() }, 'Action invalide sur course')
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { action } = parsed.data
    logger.info({ userId: livreurId, commandeId: id, action }, 'Action livreur sur course')

    if (action === 'accept') {
      const { current_lat, current_lng } = parsed.data

      const { data: commande, error: cmdError } = await supabase
        .from('commandes')
        .select('statut, total_global, adresse_livraison')
        .eq('id', id)
        .single()
      if (cmdError || !commande) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
      if (commande.statut !== 'payee') return NextResponse.json({ error: 'Commande non disponible' }, { status: 400 })

      const { data: existing } = await supabase
        .from('livraisons')
        .select('id')
        .eq('commande_id', id)
        .maybeSingle()
      if (existing) return NextResponse.json({ error: 'Cette commande a déjà été prise' }, { status: 400 })

      const pin = Math.floor(100000 + Math.random() * 900000).toString()
      const codeLivreur = Math.floor(100000 + Math.random() * 900000).toString()

      const { data: livraison, error: insertError } = await supabase
        .from('livraisons')
        .insert({
          commande_id: id,
          livreur_id: livreurId,
          statut: 'acceptee',
          code_pin: pin,
          code_livreur: codeLivreur,
          tentatives_code: 0,
          acceptee_at: new Date().toISOString(),
          position_acceptation: current_lat && current_lng ? { lat: current_lat, lng: current_lng } : null,
        })
        .select()
        .single()
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

      await supabase.from('commandes').update({ statut: 'collecte' }).eq('id', id)
      await addHistorique(supabase, livreurId, id, 'accept', { current_lat, current_lng, commande_id: id }, ip)

      return applyRateLimitHeaders(NextResponse.json({
        ...livraison,
        code_livreur: codeLivreur,
      }), rateLimitHeaders)
    }

    if (action === 'validate-article') {
      const { article_id, code } = parsed.data
      const { data: article, error: artError } = await supabase
        .from('commande_articles')
        .select('id, code_vendeur, statut_collecte, produits(vendeur_id, nom)')
        .eq('id', article_id)
        .single()
      if (artError || !article) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
      if (article.statut_collecte === 'accepte') return NextResponse.json({ error: 'Déjà validé' }, { status: 400 })
      if (article.code_vendeur !== code) return NextResponse.json({ error: 'Code invalide' }, { status: 400 })

      const now = new Date().toISOString()
      await supabase
        .from('commande_articles')
        .update({ statut_collecte: 'accepte', collecte_validee_at: now })
        .eq('id', article_id)

      await notifyArticleValidated(supabase, article, id, `${livreur.prenom} ${livreur.nom}`)

      const { data: allArticles } = await supabase
        .from('commande_articles')
        .select('statut_collecte')
        .eq('commande_id', id)
      const tousTraites = allArticles?.every(a => a.statut_collecte === 'accepte' || a.statut_collecte === 'refuse') || false
      if (tousTraites) {
        await supabase
          .from('livraisons')
          .update({ statut: 'colis_recupere', recupere_at: now })
          .eq('commande_id', id)
        await supabase.from('commandes').update({ statut: 'en_livraison' }).eq('id', id)
      }

      await addHistorique(supabase, livreurId, id, 'validate-article', { article_id, code }, ip)
      return applyRateLimitHeaders(NextResponse.json({ success: true, tousTraites }), rateLimitHeaders)
    }

    if (action === 'refuse-article') {
      const { article_id, motif, photo_preuve } = parsed.data
      const now = new Date().toISOString()
      await supabase
        .from('commande_articles')
        .update({
          statut_collecte: 'refuse',
          motif_refus: motif,
          photo_preuve: photo_preuve || null,
          collecte_validee_at: now,
        })
        .eq('id', article_id)

      const { data: article } = await supabase
        .from('commande_articles')
        .select('produits(nom), produits(vendeur_id)')
        .eq('id', article_id)
        .single()
      if (article) {
        await notifyArticleRefused(supabase, article, id, motif, `${livreur.prenom} ${livreur.nom}`)
      }

      const { data: allArticles } = await supabase
        .from('commande_articles')
        .select('statut_collecte')
        .eq('commande_id', id)
      const tousTraites = allArticles?.every(a => a.statut_collecte === 'accepte' || a.statut_collecte === 'refuse') || false
      if (tousTraites) {
        await supabase
          .from('livraisons')
          .update({ statut: 'colis_recupere', recupere_at: now })
          .eq('commande_id', id)
        await supabase.from('commandes').update({ statut: 'en_livraison' }).eq('id', id)
      }

      await addHistorique(supabase, livreurId, id, 'refuse-article', { article_id, motif }, ip)
      return applyRateLimitHeaders(NextResponse.json({ success: true, tousTraites }), rateLimitHeaders)
    }

    if (action === 'deliver') {
      if (!ESCROW_USER_ID) {
        return NextResponse.json({ error: 'Configuration serveur incomplète (ESCROW_USER_ID)' }, { status: 500 })
      }

      const { pin, photos_livraison, signature_client, geoloc } = parsed.data

      const { data: livraisonExists } = await supabase
        .from('livraisons')
        .select('id, livreur_id, code_pin, tentatives_code, position_acceptation')
        .eq('commande_id', id)
        .maybeSingle()

      if (!livraisonExists) {
        return NextResponse.json({ error: 'Aucune livraison trouvée pour cette commande' }, { status: 404 })
      }
      if (livraisonExists.livreur_id !== livreurId) {
        return NextResponse.json({ error: 'Vous n\'êtes pas le livreur attitré' }, { status: 403 })
      }

      if (String(livraisonExists.code_pin).trim() !== String(pin).trim()) {
        const newAttempts = (livraisonExists.tentatives_code || 0) + 1
        await supabase
          .from('livraisons')
          .update({ tentatives_code: newAttempts, tentative_code_derniere: new Date().toISOString() })
          .eq('commande_id', id)
        return NextResponse.json(
          { error: 'Code PIN incorrect', tentatives_restantes: MAX_PIN_ATTEMPTS - newAttempts },
          { status: 400 }
        )
      }

      const { data: commande, error: cmdErr } = await supabase
        .from('commandes')
        .select(`id, acheteur_id, total_global, frais_livraison, statut,
                 commande_articles (id, produit_id, quantite, prix_unitaire, statut_collecte, produits (vendeur_id, nom))`)
        .eq('id', id)
        .single()
      if (!commande || cmdErr) {
        return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
      }

      let totalADebiter = 0
      const creditsVendeurs = new Map<string, number>()
      let remboursementAcheteur = 0

      for (const article of commande.commande_articles) {
        const montant = article.prix_unitaire * article.quantite
        if (article.statut_collecte === 'accepte') {
          const netVendeur = Math.round(montant * 0.95)
          creditsVendeurs.set(article.produits.vendeur_id, (creditsVendeurs.get(article.produits.vendeur_id) || 0) + netVendeur)
          totalADebiter += montant
        } else if (article.statut_collecte === 'refuse') {
          remboursementAcheteur += montant
          totalADebiter += montant
        }
      }

      const { data: escrow } = await supabase
        .from('portefeuilles')
        .select('solde_achat')
        .eq('id', ESCROW_USER_ID)
        .single()
      if (!escrow || escrow.solde_achat < totalADebiter) {
        return NextResponse.json({ error: 'Fonds insuffisants sur le compte séquestre' }, { status: 500 })
      }

      for (const [vendeurId, montant] of creditsVendeurs) {
        const { data: walletV } = await supabase
          .from('portefeuilles')
          .select('solde_vente')
          .eq('id', vendeurId)
          .single()
        await supabase
          .from('portefeuilles')
          .update({ solde_vente: (walletV?.solde_vente || 0) + montant })
          .eq('id', vendeurId)
        await supabase.from('transactions').insert({
          user_id: vendeurId,
          type: 'vente',
          montant,
          commande_id: id,
          description: 'Vente nette (après commission)',
          portefeuille_type: 'vente',
        })
      }

      if (remboursementAcheteur > 0) {
        const { data: walletA } = await supabase
          .from('portefeuilles')
          .select('solde_achat')
          .eq('id', commande.acheteur_id)
          .single()
        await supabase
          .from('portefeuilles')
          .update({ solde_achat: (walletA?.solde_achat || 0) + remboursementAcheteur })
          .eq('id', commande.acheteur_id)
        await supabase.from('transactions').insert({
          user_id: commande.acheteur_id,
          type: 'remboursement',
          montant: remboursementAcheteur,
          commande_id: id,
          description: 'Remboursement articles refusés',
          portefeuille_type: 'achat',
        })

        const { data: acheteurInfo } = await supabase
          .from('profiles')
          .select('email, telephone, prenom')
          .eq('id', commande.acheteur_id)
          .single()
        if (acheteurInfo) {
          await sendEmail(
            acheteurInfo.email,
            'Remboursement articles refusés',
            `<p>Bonjour ${acheteurInfo.prenom},</p><p>Un ou plusieurs articles de votre commande n'ont pas pu être livrés. Le montant correspondant a été remboursé sur votre portefeuille Gercie.</p>`
          )
          await createNotification(
            commande.acheteur_id,
            'commande',
            'Remboursement articles refusés',
            `${remboursementAcheteur.toLocaleString()} FC remboursés.`,
            { commande_id: id, montant: remboursementAcheteur }
          )
        }
      }

      const nouveauSoldeEscrow = escrow.solde_achat - totalADebiter
      await supabase
        .from('portefeuilles')
        .update({ solde_achat: nouveauSoldeEscrow })
        .eq('id', ESCROW_USER_ID)
      await supabase.from('transactions').insert({
        user_id: ESCROW_USER_ID,
        type: 'escrow_out',
        montant: -totalADebiter,
        commande_id: id,
        description: `Distribution fonds commande #${id}`,
        portefeuille_type: 'achat',
      })

      if (commande.frais_livraison > 0) {
        await supabase.from('transactions').insert({
          user_id: ESCROW_USER_ID,
          type: 'commission',
          montant: commande.frais_livraison,
          commande_id: id,
          description: `Frais de livraison commande #${id}`,
          portefeuille_type: 'achat',
        })
      }

      const updateData: any = {
        statut: 'livree',
        livree_at: new Date().toISOString(),
        photos_livraison: photos_livraison || [],
      }
      if (signature_client) updateData.signature_client = signature_client
      if (geoloc) updateData.geoloc_livraison = geoloc

      await supabase.from('livraisons').update(updateData).eq('commande_id', id)
      await supabase.from('commandes').update({ statut: 'livree' }).eq('id', id)

      let distanceParcourue = 0
      if (livraisonExists.position_acceptation && geoloc) {
        distanceParcourue = calculerDistance(
          livraisonExists.position_acceptation.lat,
          livraisonExists.position_acceptation.lng,
          geoloc.latitude,
          geoloc.longitude
        )
      }
      await updateLivreurStats(supabase, livreurId, distanceParcourue)
      await addHistorique(supabase, livreurId, id, 'deliver', { pin_validated: true, distanceParcourue }, ip)

      return applyRateLimitHeaders(NextResponse.json({ success: true }), rateLimitHeaders)
    }

    if (action === 'signal') {
      const { type, message, photo } = parsed.data
      await supabase.from('livreur_alertes').insert({
        livreur_id: livreurId,
        type,
        titre: `Incident sur commande #${id}`,
        message,
        data: { commande_id: id, photo: photo || null },
      })
      await addHistorique(supabase, livreurId, id, 'signal', { type, message }, ip)
      return applyRateLimitHeaders(NextResponse.json({ success: true }), rateLimitHeaders)
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (error: any) {
    logger.error(error, 'Erreur POST course')
    return NextResponse.json(
      { error: 'Erreur interne du serveur', detail: error.message },
      { status: 500 }
    )
  }
}

function calculerDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}