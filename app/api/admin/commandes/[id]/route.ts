// app/api/admin/commandes/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-commande-detail:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    // 1. Récupérer la commande
    const { data: commande, error: cmdError } = await supabase
      .from('commandes')
      .select('*')
      .eq('id', parsedId.data)
      .single()

    if (cmdError || !commande) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // 2. Récupérer les articles de la commande
    const { data: articles, error: artError } = await supabase
      .from('commande_articles')
      .select('*, produit:produits(nom, images)')
      .eq('commande_id', parsedId.data)

    // 3. Récupérer le profil de l'acheteur
    const { data: acheteur, error: achError } = await supabase
      .from('profiles')
      .select('id, nom, prenom, email, telephone')
      .eq('id', commande.acheteur_id)
      .single()

    // 4. Récupérer les transactions liées
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .or(`from_user_id.eq.${commande.acheteur_id},to_user_id.eq.${commande.acheteur_id}`)
      .order('created_at', { ascending: false })
      .limit(20)

    // 5. Récupérer l'historique des statuts
    const { data: historique, error: histError } = await supabase
      .from('historique_statuts')
      .select('*')
      .eq('commande_id', parsedId.data)
      .order('created_at', { ascending: false })

    // 6. Récupérer les messages internes
    const { data: messages, error: msgError } = await supabase
      .from('commande_messages')
      .select('id, message, created_at, auteur:profiles!commande_messages_auteur_id_fkey(nom, prenom)')
      .eq('commande_id', parsedId.data)
      .order('created_at', { ascending: true })

    // 7. Récupérer le livreur si assigné
    let livreur = null
    if (commande.livreur_id) {
      const { data: livData } = await supabase
        .from('livreurs')
        .select('id, nom, prenom')
        .eq('id', commande.livreur_id)
        .single()
      livreur = livData
    }

    // 8. Récupérer le point de retrait si nécessaire
    let pointRetrait = null
    if (commande.point_retrait_id) {
      const { data: prData } = await supabase
        .from('points_retrait')
        .select('*')
        .eq('id', commande.point_retrait_id)
        .single()
      pointRetrait = prData
    }

    // Formater la réponse
    const detail = {
      id: commande.id,
      numero: commande.numero,
      total: commande.total,
      sous_total: commande.sous_total,
      frais_livraison: commande.frais_livraison,
      remise: commande.remise,
      code_promo: commande.code_promo,
      statut: commande.statut,
      date: commande.created_at || commande.date,
      type_livraison: commande.type_livraison,
      adresse_livraison: commande.adresse_livraison,
      code_livraison: commande.code_livraison,
      code_livreur: commande.code_livreur,
      code_pin: commande.code_pin,
      numero_suivi: commande.numero_suivi,
      note_interne: commande.note_interne,
      acheteur: acheteur ? {
        id: acheteur.id,
        nom: acheteur.nom,
        prenom: acheteur.prenom,
        email: acheteur.email,
        telephone: acheteur.telephone,
      } : null,
      articles: (articles || []).map(a => ({
        id: a.id,
        nom: a.produit?.nom || 'Produit',
        images: a.produit?.images || [],
        quantite: a.quantite,
        prix_unitaire: a.prix_unitaire,
        specifications: a.specifications,
        variante: a.variante,
        code_vendeur: a.code_vendeur,
        code_acheteur: a.code_acheteur,
        statut_collecte: a.statut_collecte,
        motif_refus: a.motif_refus,
        photo_preuve: a.photo_preuve,
        vendeur_id: a.vendeur_id,
      })),
      transactions: transactions || [],
      historique_statuts: historique || [],
      messages: (messages || []).map(m => ({
        id: m.id,
        auteur: m.auteur ? { nom: m.auteur.nom, prenom: m.auteur.prenom } : { nom: 'Système', prenom: '' },
        message: m.message,
        created_at: m.created_at,
      })),
      livreur: livreur ? { id: livreur.id, nom: livreur.nom, prenom: livreur.prenom } : null,
      point_retrait: pointRetrait || null,
    }

    return NextResponse.json(detail)
  } catch (error: any) {
    logger.error(error, `Crash GET admin/commandes/${id}`)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

// Optionnel : un PUT pour changer le statut (utilisé par la page de détail)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-commande-put:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
  }

  const body = await request.json()
  const { statut } = body

  if (!statut || !['en_attente', 'payee', 'collecte', 'en_livraison', 'livree', 'annulee'].includes(statut)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    // Récupérer l'ancien statut pour l'historique
    const { data: old } = await supabase
      .from('commandes')
      .select('statut')
      .eq('id', parsedId.data)
      .single()

    const { error: updateErr } = await supabase
      .from('commandes')
      .update({ statut, updated_at: new Date().toISOString() })
      .eq('id', parsedId.data)

    if (updateErr) throw updateErr

    // Insérer dans l'historique
    if (old) {
      await supabase.from('historique_statuts').insert({
        commande_id: parsedId.data,
        ancien_statut: old.statut,
        nouveau_statut: statut,
        commentaire: 'Modification manuelle',
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, `Crash PUT admin/commandes/${id}`)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}