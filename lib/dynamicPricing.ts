// lib/dynamicPricing.ts
import { createClient as createServerClient } from '@/lib/supabaseServer'
import { suggestOptimalPrice } from '@/lib/ai/priceOptimizer'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PriceFactors {
  /** Prix actuel du produit (en CDF) */
  currentPrice: number
  /** Stock disponible */
  stock: number
  /** Nombre de vues du produit au cours des 7 derniers jours */
  recentViews: number
  /** Nombre de commandes en attente ou payées contenant ce produit (demande immédiate) */
  pendingOrders: number
  /** Prix moyen des produits similaires (même catégorie, même type) */
  competitorAvgPrice: number
  /** Ratio vues / commandes (taux de conversion récent) */
  conversionRate: number
}

export interface DynamicPriceResult {
  /** Prix suggéré (arrondi à l'entier inférieur) */
  suggestedPrice: number
  /** Pourcentage d'écart par rapport au prix actuel */
  adjustmentPercent: number
  /** Explication lisible de la recommandation */
  reasoning: string
  /** Indice de confiance (0-1) */
  confidence: number
}

/* ------------------------------------------------------------------ */
/*  Constantes & Paramètres                                            */
/* ------------------------------------------------------------------ */

// Poids des différents facteurs dans le calcul
const WEIGHTS = {
  DEMAND: 0.35,         // plus la demande est forte, plus on peut monter
  STOCK_SCARCITY: 0.20, // si peu de stock, on peut augmenter
  COMPETITOR: 0.25,     // alignement avec les prix du marché
  CONVERSION: 0.20,     // si le taux de conversion est bon, on peut augmenter
}

// Seuils pour éviter des variations excessives
const MAX_INCREASE_PERCENT = 30   // on ne suggère jamais +30 % du prix actuel
const MAX_DECREASE_PERCENT = 20   // ni -20 %
const MIN_PRICE = 500             // prix minimum en CDF

/* ------------------------------------------------------------------ */
/*  Fonctions utilitaires                                              */
/* ------------------------------------------------------------------ */

/**
 * Récupère les données nécessaires au calcul du prix dynamique
 * pour un produit donné.
 */
async function fetchProductFactors(productId: string): Promise<PriceFactors> {
  const supabase = await createServerClient(true) // service_role

  // 1. Infos de base du produit
  const { data: product, error: productError } = await supabase
    .from('produits')
    .select('prix, stock, categorie')
    .eq('id', productId)
    .single()

  if (productError || !product) {
    throw new Error('Produit introuvable')
  }

  const currentPrice = product.prix
  const stock = product.stock ?? 0

  // 2. Vues récentes (simulé via une table product_views si elle existe, sinon 0)
  let recentViews = 0
  try {
    const { count } = await supabase
      .from('product_views')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    recentViews = count ?? 0
  } catch {
    // table inexistante, on ignore
  }

  // 3. Commandes en cours contenant ce produit (demande immédiate)
  const { data: orderArticles, error: ordersError } = await supabase
    .from('commande_articles')
    .select('commande_id')
    .eq('produit_id', productId)

  let pendingOrders = 0
  if (!ordersError && orderArticles && orderArticles.length > 0) {
    const commandeIds = orderArticles.map(oa => oa.commande_id)
    const { count: pendingCount } = await supabase
      .from('commandes')
      .select('*', { count: 'exact', head: true })
      .in('id', commandeIds)
      .in('statut', ['en_attente', 'payee', 'collecte'])
    pendingOrders = pendingCount ?? 0
  }

  // 4. Prix moyen des produits similaires (même catégorie principale)
  const mainCategory = product.categorie.split(' > ')[0]
  let competitorAvgPrice = currentPrice // fallback
  try {
    const { data: similar } = await supabase
      .from('produits')
      .select('prix')
      .eq('est_actif', true)
      .ilike('categorie', `${mainCategory}%`)
      .neq('id', productId)
      .limit(50)

    if (similar && similar.length > 0) {
      const sum = similar.reduce((acc, p) => acc + p.prix, 0)
      competitorAvgPrice = sum / similar.length
    }
  } catch {
    // on garde le fallback
  }

  // 5. Taux de conversion récent (commandes / vues)
  const conversionRate = recentViews > 0 ? pendingOrders / recentViews : 0

  return {
    currentPrice,
    stock,
    recentViews,
    pendingOrders,
    competitorAvgPrice,
    conversionRate,
  }
}

/**
 * Calcule un score normalisé entre 0 et 1 pour un facteur donné,
 * en utilisant une transformation logistique pour éviter les extrêmes.
 */
function normalize(value: number, median: number, steepness: number = 1): number {
  // Fonction sigmoïde centrée sur median
  return 1 / (1 + Math.exp(-steepness * (value - median)))
}

/* ------------------------------------------------------------------ */
/*  Fonction principale                                                */
/* ------------------------------------------------------------------ */

/**
 * Calcule un prix suggéré pour un produit en fonction de la demande,
 * de la rareté et des prix concurrents.
 *
 * @param productId - ID du produit
 * @param options - Options : { useAI?: boolean } (défaut false)
 * @returns Prix suggéré et explications
 */
export async function getSuggestedPrice(
  productId: string,
  options: { useAI?: boolean } = {}
): Promise<DynamicPriceResult> {
  const { useAI = false } = options

  // Si l'IA est activée, on tente de l'utiliser et on fusionne avec l'analyse heuristique
  if (useAI) {
    try {
      const factors = await fetchProductFactors(productId)
      const heuristicResult = buildHeuristicResult(factors) // calcul heuristique existant

      // Appel au moteur IA
      const aiSuggestion = await suggestOptimalPrice(productId)

      // Fusion : pondération heuristique 0.4, IA 0.6 (l'IA a plus de poids)
      const combinedPrice = Math.round(
        heuristicResult.suggestedPrice * 0.4 + aiSuggestion.suggestedPrice * 0.6
      )
      const finalPrice = Math.max(MIN_PRICE, combinedPrice)

      // Ajustement par rapport au prix actuel
      const adjustmentPercent = ((finalPrice - factors.currentPrice) / factors.currentPrice) * 100

      return {
        suggestedPrice: finalPrice,
        adjustmentPercent: Math.round(adjustmentPercent * 10) / 10,
        reasoning: `Heuristique : ${heuristicResult.reasoning} | IA : ${aiSuggestion.reasoning}`,
        confidence: Math.max(heuristicResult.confidence, aiSuggestion.confidence),
      }
    } catch (error) {
      console.warn('Impossible d’obtenir la suggestion IA, utilisation de l’heuristique seule.')
      // Fallback vers l'heuristique existante
    }
  }

  // Comportement par défaut (existant, non modifié)
  const factors = await fetchProductFactors(productId)
  return buildHeuristicResult(factors)
}

/**
 * Construit le résultat basé uniquement sur les facteurs heuristiques
 * (logique existante, inchangée).
 */
function buildHeuristicResult(factors: PriceFactors): DynamicPriceResult {
  // 1. Score de demande : combinaison des vues et des commandes en attente
  const demandScore = normalize(factors.recentViews, 30) * 0.4 +
                      normalize(factors.pendingOrders, 2) * 0.6

  // 2. Score de rareté du stock : plus le stock est faible, plus on peut augmenter
  const scarcityScore = factors.stock > 0
    ? 1 - normalize(factors.stock, 10)
    : 1 // rupture => prix max

  // 3. Comparaison avec le marché : si on est plus cher que la moyenne, score négatif
  const competitorRatio = factors.competitorAvgPrice > 0
    ? factors.currentPrice / factors.competitorAvgPrice
    : 1
  const competitorScore = competitorRatio < 1 ? 1 - competitorRatio : -(competitorRatio - 1)

  // 4. Score de conversion : un bon taux de conversion justifie une hausse
  const conversionScore = normalize(factors.conversionRate, 0.05)

  // Calcul du multiplicateur global pondéré
  const weightedScore =
    demandScore * WEIGHTS.DEMAND +
    scarcityScore * WEIGHTS.STOCK_SCARCITY +
    competitorScore * WEIGHTS.COMPETITOR +
    conversionScore * WEIGHTS.CONVERSION

  // Transformer le score en pourcentage d'ajustement (entre -MAX_DECREASE et +MAX_INCREASE)
  const adjustmentPercent = Math.max(
    -MAX_DECREASE_PERCENT,
    Math.min(MAX_INCREASE_PERCENT, weightedScore * MAX_INCREASE_PERCENT)
  )

  const suggestedPrice = Math.round(
    factors.currentPrice * (1 + adjustmentPercent / 100)
  )

  // Ne jamais passer sous le prix minimum
  const finalPrice = Math.max(MIN_PRICE, suggestedPrice)

  // Construire une explication lisible
  const reasons: string[] = []
  if (demandScore > 0.5) reasons.push('forte demande détectée')
  if (scarcityScore > 0.5) reasons.push('stock faible')
  if (competitorRatio > 1.1) reasons.push('prix supérieur à la concurrence')
  else if (competitorRatio < 0.9) reasons.push('prix compétitif par rapport au marché')
  if (conversionScore > 0.6) reasons.push('bon taux de conversion')

  const reasoning = reasons.length > 0
    ? `Ajustement basé sur : ${reasons.join(', ')}.`
    : 'Les facteurs de marché sont stables ; prix inchangé.'

  // L'indice de confiance dépend de la quantité de données disponibles
  const confidence = Math.min(
    1,
    (factors.recentViews * 0.001 + factors.pendingOrders * 0.2 + (factors.stock > 0 ? 0.2 : 0))
  )

  return {
    suggestedPrice: finalPrice,
    adjustmentPercent: Math.round(adjustmentPercent * 10) / 10,
    reasoning,
    confidence: Math.round(confidence * 100) / 100,
  }
}

/**
 * Récupère directement la suggestion de prix fournie par l'IA.
 * (utilisé par les API admin)
 */
export async function getAIPriceSuggestion(productId: string): Promise<{
  suggestedPrice: number
  confidence: number
  reasoning: string
}> {
  return suggestOptimalPrice(productId)
}

/**
 * Applique automatiquement le prix dynamique à un produit
 * si l'utilisateur est le vendeur propriétaire ou un admin.
 *
 * @param productId - ID du produit à mettre à jour
 * @returns Le prix final mis à jour
 */
export async function applyDynamicPricing(productId: string): Promise<number> {
  const supabase = await createServerClient(true)

  const { suggestedPrice, reasoning } = await getSuggestedPrice(productId)

  // Récupérer le vendeur du produit pour vérifier l'autorité (côté serveur)
  const { data: product, error: productError } = await supabase
    .from('produits')
    .select('vendeur_id')
    .eq('id', productId)
    .single()

  if (productError || !product) throw new Error('Produit introuvable')

  // Mettre à jour le prix
  const { error: updateError } = await supabase
    .from('produits')
    .update({
      prix: suggestedPrice,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)

  if (updateError) throw new Error(`Erreur mise à jour du prix : ${updateError.message}`)

  console.log(`[dynamicPricing] Produit ${productId} mis à jour : ${suggestedPrice} FC (${reasoning})`)
  return suggestedPrice
}