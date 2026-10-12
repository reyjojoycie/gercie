// features/orders/services/orderService.ts
import { createClient as createServerClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'

// Types partagés
export interface OrderArticle {
  produit_id: string
  quantite: number
  prix_unitaire: number
  specifications?: string | null
  variante?: Record<string, any> | null
}

export interface CreateOrderInput {
  items: OrderArticle[]
  total_articles: number
  frais_livraison: number
  type_livraison: 'domicile' | 'point_retrait'
  adresse_livraison?: string
  commune_livraison_id?: number | null
  point_retrait_id?: number | null
}

export interface Order {
  id: string
  numero: string
  total: number
  statut: string
  date: string
  type_livraison: string
  adresse_livraison?: string
  articles: Array<{
    id: string
    nom: string
    quantite: number
    prix_unitaire: number
    specifications?: string | null
    variante?: Record<string, any> | null
    code_acheteur?: string | null
    statut_collecte?: string
  }>
}

export interface OrderDetail extends Order {
  acheteur: { id: string; nom: string; prenom: string; email: string; telephone?: string }
  code_livraison?: string | null
  code_livreur?: string | null
  code_pin?: string | null
  point_retrait?: { nom: string; adresse: string } | null
}

const ESCROW_USER_ID = 'c0ffee00-0000-0000-0000-000000000ec0'

// ------------------- 1. Création d'une commande -------------------
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non authentifié')

  const supabase = await createServerClient(true) // service_role pour contourner RLS

  const priceArticles = Number(input.total_articles) || 0
  const priceDelivery = Number(input.frais_livraison) || 0
  const totalGlobal = priceArticles + priceDelivery

  const numero_commande = `CMD-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  // Insérer la commande
  const { data: commande, error: commandeError } = await supabase
    .from('commandes')
    .insert({
      acheteur_id: user.id,
      numero_commande,
      statut: 'en_attente',
      total_articles: priceArticles,
      frais_livraison: priceDelivery,
      total_global: totalGlobal,
      adresse_livraison: input.adresse_livraison || null,
      commune_livraison_id: input.commune_livraison_id || null,
      type_livraison: input.type_livraison,
      point_retrait_id: input.point_retrait_id || null,
    })
    .select()
    .single()

  if (commandeError) throw new Error(`Erreur création commande: ${commandeError.message}`)

  // Insérer les articles
  const articlesToInsert = input.items.map((item) => ({
    commande_id: commande.id,
    produit_id: item.produit_id,
    quantite: item.quantite,
    prix_unitaire: item.prix_unitaire,
    specifications: item.specifications || null,
    variante: item.variante || null,
  }))

  const { error: articlesError } = await supabase
    .from('commande_articles')
    .insert(articlesToInsert)

  if (articlesError) {
    // rollback
    await supabase.from('commandes').delete().eq('id', commande.id)
    throw new Error(`Erreur insertion articles: ${articlesError.message}`)
  }

  // Récupérer les noms des produits pour le retour
  const { data: articlesWithNames } = await supabase
    .from('commande_articles')
    .select('id, quantite, prix_unitaire, specifications, variante, produits(nom)')
    .eq('commande_id', commande.id)

  const formattedArticles = (articlesWithNames || []).map((a: any) => ({
    id: a.id,
    nom: a.produits?.nom || 'Produit inconnu',
    quantite: a.quantite,
    prix_unitaire: a.prix_unitaire,
    specifications: a.specifications,
    variante: a.variante,
  }))

  return {
    id: commande.id,
    numero: commande.numero_commande,
    total: commande.total_global,
    statut: commande.statut,
    date: commande.created_at,
    type_livraison: commande.type_livraison,
    adresse_livraison: commande.adresse_livraison,
    articles: formattedArticles,
  }
}

// ------------------- 2. Récupérer une commande par ID -------------------
export async function getOrderById(orderId: string): Promise<OrderDetail | null> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non authentifié')

  const supabase = await createServerClient(true)

  const { data: commande, error } = await supabase
    .from('commandes')
    .select(`
      id, numero_commande, total_global, statut, created_at, type_livraison, adresse_livraison, code_livraison,
      point_retrait_id, points_retrait(nom, adresse),
      acheteur:acheteur_id(id, nom, prenom, email, telephone),
      commande_articles(id, quantite, prix_unitaire, specifications, variante, code_acheteur, statut_collecte, produits(nom))
    `)
    .eq('id', orderId)
    .single()

  if (error || !commande) return null

  // Autorisation : acheteur ou admin uniquement (le vendeur n'existe plus)
  const isAcheteur = commande.acheteur_id === user.id
  if (!isAcheteur) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    if (!profile?.is_admin) {
      throw new Error('Accès non autorisé')
    }
  }

  // Récupérer la livraison pour code livreur et PIN
  const { data: livraison } = await supabase
    .from('livraisons')
    .select('code_livreur, code_pin')
    .eq('commande_id', orderId)
    .maybeSingle()

  const articles = (commande.commande_articles || []).map((a: any) => ({
    id: a.id,
    nom: a.produits?.nom || 'Produit inconnu',
    quantite: a.quantite,
    prix_unitaire: a.prix_unitaire,
    specifications: a.specifications,
    variante: a.variante,
    code_acheteur: a.code_acheteur,
    statut_collecte: a.statut_collecte,
  }))

  return {
    id: commande.id,
    numero: commande.numero_commande,
    total: commande.total_global,
    statut: commande.statut,
    date: commande.created_at,
    type_livraison: commande.type_livraison,
    adresse_livraison: commande.adresse_livraison,
    articles,
    acheteur: commande.acheteur,
    code_livraison: commande.code_livraison,
    code_livreur: livraison?.code_livreur || null,
    code_pin: livraison?.code_pin || null,
    point_retrait: commande.points_retrait,
  }
}

// ------------------- 3. Commandes d'un utilisateur -------------------
export async function getUserOrders(filters?: { statut?: string; limit?: number; offset?: number }): Promise<Order[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non authentifié')

  const supabase = await createServerClient()
  let query = supabase
    .from('commandes')
    .select(`
      id, numero_commande, total_global, statut, created_at, type_livraison, adresse_livraison,
      commande_articles(quantite, prix_unitaire, specifications, variante, produits(nom))
    `)
    .eq('acheteur_id', user.id)
    .order('created_at', { ascending: false })

  if (filters?.statut) query = query.eq('statut', filters.statut)
  if (filters?.limit) query = query.limit(filters.limit)
  if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 10) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Erreur récupération commandes: ${error.message}`)

  return (data || []).map((cmd: any) => ({
    id: cmd.id,
    numero: cmd.numero_commande,
    total: cmd.total_global,
    statut: cmd.statut,
    date: cmd.created_at,
    type_livraison: cmd.type_livraison,
    adresse_livraison: cmd.adresse_livraison,
    articles: (cmd.commande_articles || []).map((a: any) => ({
      nom: a.produits?.nom || 'Produit inconnu',
      quantite: a.quantite,
      prix_unitaire: a.prix_unitaire,
      specifications: a.specifications,
      variante: a.variante,
    }))
  }))
}

// ------------------- 4. Annuler une commande (avec remboursement) -------------------
export async function cancelOrder(orderId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non authentifié')

  const supabase = await createServerClient(true)

  // Vérifier que la commande appartient à l'utilisateur et est annulable
  const { data: commande, error: fetchError } = await supabase
    .from('commandes')
    .select('statut, total_global, acheteur_id')
    .eq('id', orderId)
    .single()

  if (fetchError || !commande) throw new Error('Commande introuvable')
  if (commande.acheteur_id !== user.id) throw new Error('Non autorisé')
  if (!['en_attente', 'payee'].includes(commande.statut)) throw new Error('Annulation impossible à ce stade')

  // Mise à jour du statut
  const { error: updateError } = await supabase
    .from('commandes')
    .update({ statut: 'annulee' })
    .eq('id', orderId)

  if (updateError) throw new Error(`Erreur annulation: ${updateError.message}`)

  // Remboursement si payée
  if (commande.statut === 'payee') {
    const total = commande.total_global

    // Debiter escrow
    const { data: escrow, error: escrowErr } = await supabase
      .from('portefeuilles')
      .select('solde_achat')
      .eq('id', ESCROW_USER_ID)
      .single()
    if (escrowErr || !escrow) throw new Error('Erreur accès escrow')

    if (escrow.solde_achat < total) throw new Error('Fonds insuffisants dans l’escrow')

    const newEscrow = escrow.solde_achat - total
    await supabase.from('portefeuilles').update({ solde_achat: newEscrow }).eq('id', ESCROW_USER_ID)

    // Créditer acheteur
    const { data: walletAcheteur } = await supabase
      .from('portefeuilles')
      .select('solde_achat')
      .eq('id', user.id)
      .single()

    const newAcheteur = (walletAcheteur?.solde_achat || 0) + total
    await supabase.from('portefeuilles').update({ solde_achat: newAcheteur }).eq('id', user.id)

    // Enregistrer les transactions
    await supabase.from('transactions').insert([
      {
        user_id: ESCROW_USER_ID,
        type: 'escrow_out',
        montant: -total,
        commande_id: orderId,
        description: `Remboursement annulation #${orderId}`,
        portefeuille_type: 'achat',
      },
      {
        user_id: user.id,
        type: 'remboursement',
        montant: total,
        commande_id: orderId,
        description: `Remboursement annulation #${orderId}`,
        portefeuille_type: 'achat',
      },
    ])
  }
}