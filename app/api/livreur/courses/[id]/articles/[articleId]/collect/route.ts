// app/api/livreur/courses/[id]/articles/[articleId]/collect/route.ts
// ============================================================================
// API Ultra‑Premium – Collecte d'un article par le livreur
// Validation Zod, rate limiting, notifications enrichies, logs structurés.
// ============================================================================
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail, createNotification } from '@/lib/notifications'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// Schéma de validation pour le corps de la requête
// ---------------------------------------------------------------------------
const collectArticleSchema = z.object({
  code: z.string().length(6, 'Le code vendeur doit contenir exactement 6 caractères'),
})

// ---------------------------------------------------------------------------
// Notifications premium (vendeur + livreur)
// ---------------------------------------------------------------------------
async function notifyVendeurCollecte(
  supabase: any,
  article: any,
  commandeId: string,
  netVendeur: number,
  livreurName: string
) {
  try {
    const vendeurId = article.produits?.vendeur_id
    if (!vendeurId) return

    const { data: vendeurProfile } = await supabase
      .from('profiles')
      .select('email, prenom, nom')
      .eq('id', vendeurId)
      .single()

    if (vendeurProfile?.email) {
      await sendEmail(
        vendeurProfile.email,
        `✅ Article collecté – ${article.produits?.nom}`,
        `<div style="font-family:Outfit,sans-serif;max-width:600px;background:#fafaf9;padding:24px;border-radius:16px">
          <h2 style="color:#1b1a16;">Collecte validée</h2>
          <p>Bonjour ${vendeurProfile.prenom},</p>
          <p>L'article <strong>${article.produits?.nom}</strong> a été récupéré par le livreur <strong>${livreurName}</strong>.</p>
          <p>Montant net crédité sur votre portefeuille vente : <strong>${netVendeur.toLocaleString()} FC</strong> (après commission).</p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #d1cec7;"/>
          <p style="font-size:12px;color:#7d7970;">Gercie – Marketplace de prestige</p>
        </div>`
      )
    }

    await createNotification(
      vendeurId,
      'collecte',
      'Article collecté',
      `"${article.produits?.nom}" récupéré par le livreur. ${netVendeur.toLocaleString()} FC crédités.`,
      { commande_id: commandeId, article_id: article.id, montant: netVendeur }
    )
  } catch (err) {
    logger.error(err, 'Échec notification vendeur collecte article')
  }
}

async function notifyLivreurCollecteValidee(
  supabase: any,
  livreurId: string,
  articleNom: string,
  commandeId: string
) {
  try {
    await createNotification(
      livreurId,
      'livraison',
      'Article validé',
      `"${articleNom}" validé avec succès.`,
      { commande_id: commandeId }
    )
  } catch (err) {
    logger.error(err, 'Échec notification livreur validation article')
  }
}

// ---------------------------------------------------------------------------
// POST – Valider la collecte d'un article
// ---------------------------------------------------------------------------
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; articleId: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  // Rate limiting : 10 requêtes par minute (action sensible)
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `collect-article:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Veuillez patienter.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      logger.warn('Tentative collecte article sans authentification')
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { id: commandeId, articleId } = await params
    const supabase = await createClient(true) // service_role pour écritures sensibles

    // 2. Vérifier que l'utilisateur est un livreur actif
    const { data: livreur, error: livreurError } = await supabase
      .from('livreurs')
      .select('id, est_actif, prenom, nom')
      .eq('id', user.id)
      .maybeSingle()

    if (livreurError || !livreur || !livreur.est_actif) {
      logger.warn({ userId: user.id }, 'Tentative collecte par un non‑livreur')
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const livreurName = `${livreur.prenom || ''} ${livreur.nom || ''}`.trim()

    // 3. Vérifier que la livraison existe et que le livreur y est associé
    const { data: livraison, error: livError } = await supabase
      .from('livraisons')
      .select('id, statut')
      .eq('commande_id', commandeId)
      .eq('livreur_id', user.id)
      .maybeSingle()

    if (livError || !livraison) {
      return NextResponse.json({ error: 'Vous n’êtes pas associé à cette commande' }, { status: 404 })
    }

    if (livraison.statut === 'livree' || livraison.statut === 'annulee') {
      return NextResponse.json({ error: 'Cette livraison est déjà terminée' }, { status: 400 })
    }

    // 4. Valider le corps de la requête (code vendeur)
    const rawBody = await request.json()
    const parsed = collectArticleSchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn({ userId: user.id, errors: parsed.error.flatten() }, 'Données de collecte invalides')
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { code } = parsed.data

    // 5. Récupérer l'article
    const { data: article, error: artError } = await supabase
      .from('commande_articles')
      .select(`
        id,
        produit_id,
        quantite,
        prix_unitaire,
        code_vendeur,
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
      return NextResponse.json({ error: 'Cet article a déjà été validé' }, { status: 400 })
    }

    if (article.statut_collecte === 'refuse') {
      return NextResponse.json({ error: 'Cet article a déjà été refusé' }, { status: 400 })
    }

    // 6. Vérifier le code vendeur
    if (article.code_vendeur !== code) {
      // Incrémenter les tentatives
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

      logger.warn({ userId: user.id, articleId, attempts: newAttempts }, 'Code vendeur invalide')
      return NextResponse.json(
        { error: 'Code vendeur invalide', tentatives_restantes: Math.max(0, 3 - newAttempts) },
        { status: 400 }
      )
    }

    // 7. Marquer l'article comme accepté
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('commande_articles')
      .update({
        statut_collecte: 'accepte',
        collecte_validee_at: now,
      })
      .eq('id', articleId)

    if (updateError) {
      logger.error(updateError, 'Échec mise à jour statut article')
      return NextResponse.json({ error: 'Erreur lors de la validation' }, { status: 500 })
    }

    // 8. Créditer le vendeur (net après commission 5%)
    const montantArticle = article.prix_unitaire * article.quantite
    const commission = Math.round(montantArticle * 0.05)
    const netVendeur = montantArticle - commission

    const vendeurId = article.produits?.vendeur_id
    if (vendeurId) {
      const { data: wallet, error: walletError } = await supabase
        .from('portefeuilles')
        .select('solde_vente')
        .eq('id', vendeurId)
        .maybeSingle()

      if (walletError) {
        logger.error(walletError, 'Erreur récupération portefeuille vendeur')
      }

      const nouveauSolde = (wallet?.solde_vente || 0) + netVendeur
      const { error: creditError } = await supabase
        .from('portefeuilles')
        .update({ solde_vente: nouveauSolde })
        .eq('id', vendeurId)

      if (creditError) {
        logger.error(creditError, 'Échec crédit vendeur – article validé mais solde non mis à jour')
      }

      // Enregistrer la transaction
      await supabase.from('transactions').insert({
        user_id: vendeurId,
        type: 'vente',
        montant: netVendeur,
        commande_id: commandeId,
        description: `Vente article "${article.produits?.nom}" – Commande #${commandeId}`,
        portefeuille_type: 'vente',
        metadata: { commission, article_id: articleId },
      })
    }

    // 9. Vérifier si tous les articles sont collectés
    const { data: allArticles, error: allError } = await supabase
      .from('commande_articles')
      .select('statut_collecte')
      .eq('commande_id', commandeId)

    if (!allError && allArticles) {
      const tousAcceptesOuRefuses = allArticles.every(
        a => a.statut_collecte === 'accepte' || a.statut_collecte === 'refuse'
      )
      if (tousAcceptesOuRefuses) {
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

    // 10. Notifications premium (vendeur + livreur)
    await notifyVendeurCollecte(supabase, article, commandeId, netVendeur, livreurName)
    await notifyLivreurCollecteValidee(supabase, user.id, article.produits?.nom || 'Article', commandeId)

    // 11. Historique du livreur
    await supabase
      .from('livreur_historique')
      .insert({
        livreur_id: user.id,
        commande_id: commandeId,
        action: 'validate-article',
        details: { article_id: articleId, code_validated: true, ip },
      })
      .catch(e => logger.error(e, 'Échec ajout historique'))

    logger.info(
      { userId: user.id, articleId, commandeId, netVendeur, commission },
      'Article collecté avec succès'
    )

    return applyRateLimitHeaders(
      NextResponse.json({
        success: true,
        message: 'Article validé avec succès',
        net_vendeur: netVendeur,
        commission_prelevee: commission,
      }),
      rateLimitHeaders
    )
  } catch (err: any) {
    logger.error(err, 'Erreur interne collecte article')
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}