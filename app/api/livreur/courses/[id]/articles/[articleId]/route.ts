// app/api/livreur/courses/[id]/articles/route.ts
// ============================================================================
// API Ultra‑Premium – Liste des articles d'une course pour le livreur
// Validation, sécurité, logs structurés, enrichissement des données.
// ============================================================================
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  const { allowed, headers } = rateLimit({ id: `course-articles:${ip}`, maxRequests: 20 })
  if (!allowed) return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 }), headers)

  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { id: commandeId } = await params
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

    // 2. Vérifier que la livraison existe pour ce livreur
    const { data: livraison, error: livError } = await supabase
      .from('livraisons')
      .select('id, statut')
      .eq('commande_id', commandeId)
      .eq('livreur_id', user.id)
      .maybeSingle()

    if (livError || !livraison) {
      return NextResponse.json({ error: 'Vous n’êtes pas associé à cette commande' }, { status: 404 })
    }

    // 3. Récupérer les articles
    const { data: articles, error: articlesError } = await supabase
      .from('commande_articles')
      .select(`
        id,
        quantite,
        prix_unitaire,
        specifications,
        variante,
        code_vendeur,
        code_acheteur,
        statut_collecte,
        motif_refus,
        photo_preuve,
        collecte_validee_at,
        produits (
          id,
          nom,
          description,
          images,
          prix,
          video_url,
          vendeur_id
        )
      `)
      .eq('commande_id', commandeId)
      .order('id', { ascending: true })

    if (articlesError) {
      logger.error('Erreur récupération articles course', articlesError)
      return NextResponse.json({ error: 'Impossible de charger les articles' }, { status: 500 })
    }

    // 4. Enrichir avec les infos vendeur (adresse boutique, téléphone)
    const articlesAvecVendeur = await Promise.all(
      (articles || []).map(async (article: any) => {
        const vendeurId = article.produits?.vendeur_id
        let vendeur = null
        if (vendeurId) {
          const { data: v } = await supabase
            .from('profiles')
            .select('nom, prenom, telephone, adresse_boutique')
            .eq('id', vendeurId)
            .single()
          vendeur = v
        }
        return {
          ...article,
          vendeur: vendeur || { nom: '', prenom: '', telephone: '', adresse_boutique: '' },
        }
      })
    )

    // 5. Construire une réponse enrichie avec des indicateurs pour l'UX
    const totalArticles = articlesAvecVendeur.length
    const collectes = articlesAvecVendeur.filter(a => a.statut_collecte === 'accepte').length
    const refuses = articlesAvecVendeur.filter(a => a.statut_collecte === 'refuse').length
    const enAttente = totalArticles - collectes - refuses

    return NextResponse.json({
      articles: articlesAvecVendeur,
      resume: {
        total: totalArticles,
        collectes,
        refuses,
        en_attente: enAttente,
        progression: totalArticles > 0 ? Math.round((collectes / totalArticles) * 100) : 0,
      },
      statut_livraison: livraison.statut,
    })
  } catch (err) {
    logger.error('Erreur GET articles course', err)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}