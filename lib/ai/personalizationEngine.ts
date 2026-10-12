// lib/ai/personalizationEngine.ts
// Moteur de recommandations personnalisées.
// Combine l'historique utilisateur et les embeddings produits pour suggérer
// des articles pertinents. En l'absence d'historique, renvoie une liste vide
// (l'appelant pourra alors proposer des tendances).
// ---------------------------------------------------------------------------
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getProductEmbedding, searchSimilarProducts } from './vectorStore';
import { GercieLogger as logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ScoredRecommendation {
  product_id: string;
  score: number; // similarité cosinus entre l'embedding utilisateur et le produit
}

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

// Poids par type d'interaction
const INTERACTION_WEIGHTS: Record<string, number> = {
  view: 0.5,
  cart_add: 1.0,
  favorite: 1.5,
  purchase: 3.0,
  search_click: 0.3,
};

// Période d'analyse des interactions (en jours)
const INTERACTION_WINDOW_DAYS = 30;

// Nombre maximum d'interactions pondérées à considérer
const MAX_TOP_PRODUCTS = 20;

// Cache mémoire simple pour l'embedding utilisateur (évite de recalculer trop souvent)
const userEmbeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Calcule des recommandations personnalisées pour un utilisateur donné.
 *
 * @param userId - UUID de l'utilisateur connecté
 * @param options - Limite de résultats et produits à exclure (ex: déjà vus)
 * @returns Liste triée de produits avec leur score de recommandation.
 *          Retourne un tableau vide si l'utilisateur n'a pas d'historique.
 */
export async function getPersonalizedRecommendations(
  userId: string,
  options: { limit?: number; excludeProductIds?: string[] } = {}
): Promise<ScoredRecommendation[]> {
  const { limit = 10, excludeProductIds = [] } = options;

  try {
    // 1. Obtenir l'embedding utilisateur (calculé ou depuis le cache)
    const userEmbedding = await getUserEmbedding(userId);
    if (!userEmbedding) {
      // Aucun historique significatif
      return [];
    }

    // 2. Rechercher les produits similaires à cet embedding
    //    On demande plus de résultats pour pouvoir exclure ceux déjà interactés
    const similar = await searchSimilarProducts(
      userEmbedding,
      limit + excludeProductIds.length + 10, // marge
      0.5 // similarité minimale
    );

    // 3. Filtrer les produits exclus et limiter
    const excludeSet = new Set(excludeProductIds);
    const recommendations: ScoredRecommendation[] = [];

    for (const { product_id, similarity } of similar) {
      if (!excludeSet.has(product_id)) {
        recommendations.push({ product_id, score: similarity });
        if (recommendations.length >= limit) break;
      }
    }

    return recommendations;
  } catch (error) {
    logger.error(`Erreur lors des recommandations pour ${userId}`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Calcul de l'embedding utilisateur à partir de son historique
// ---------------------------------------------------------------------------

async function getUserEmbedding(userId: string): Promise<number[] | null> {
  // Vérifier le cache mémoire
  const cached = userEmbeddingCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.embedding;
  }

  try {
    // Récupérer les interactions récentes de l'utilisateur
    const interactions = await fetchUserInteractions(userId);
    if (!interactions.length) return null;

    // Calculer le profil pondéré (top produits)
    const weightedProducts = computeWeightedProducts(interactions);

    // Récupérer les embeddings des produits dominants
    const productEmbeddings = await fetchEmbeddingsForProducts(
      Array.from(weightedProducts.keys())
    );

    // Calculer l'embedding moyen pondéré
    const avgEmbedding = computeWeightedAverageEmbedding(
      weightedProducts,
      productEmbeddings
    );

    if (!avgEmbedding) return null;

    // Mettre en cache
    userEmbeddingCache.set(userId, { embedding: avgEmbedding, timestamp: Date.now() });
    // Nettoyage basique du cache si trop volumineux
    if (userEmbeddingCache.size > 500) {
      const oldest = [...userEmbeddingCache.entries()].reduce((a, b) =>
        a[1].timestamp < b[1].timestamp ? a : b
      );
      userEmbeddingCache.delete(oldest[0]);
    }

    return avgEmbedding;
  } catch (error) {
    logger.error(`Impossible de calculer l'embedding utilisateur pour ${userId}`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Récupère les interactions récentes depuis la base Supabase.
 */
async function fetchUserInteractions(
  userId: string
): Promise<Array<{ product_id: string; interaction_type: string }>> {
  const since = new Date();
  since.setDate(since.getDate() - INTERACTION_WINDOW_DAYS);

  const { data, error } = await supabaseAdmin
    .from('user_interactions')
    .select('product_id, interaction_type')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(200); // Large enough to catch meaningful signals

  if (error) {
    logger.error(`Erreur fetchUserInteractions pour ${userId}`, error);
    return [];
  }

  return data ?? [];
}

/**
 * Regroupe les interactions par produit avec un poids cumulé.
 * Retourne une Map product_id → poids total.
 */
function computeWeightedProducts(
  interactions: Array<{ product_id: string; interaction_type: string }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const { product_id, interaction_type } of interactions) {
    const weight = INTERACTION_WEIGHTS[interaction_type] ?? 0.1;
    const current = map.get(product_id) ?? 0;
    map.set(product_id, current + weight);
  }

  // Trier et ne garder que les MAX_TOP_PRODUCTS plus influents
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, MAX_TOP_PRODUCTS);
  return new Map(top);
}

/**
 * Récupère les embeddings pour une liste de product_id.
 * Ignore les produits sans embedding.
 */
async function fetchEmbeddingsForProducts(
  productIds: string[]
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  await Promise.all(
    productIds.map(async (pid) => {
      try {
        const emb = await getProductEmbedding(pid);
        if (emb) map.set(pid, emb);
      } catch (err) {
        // Silencieux, on saute ce produit
      }
    })
  );
  return map;
}

/**
 * Calcule la moyenne pondérée des embeddings.
 * @param weights - Map product_id → poids
 * @param embeddings - Map product_id → embedding
 * @returns Un vecteur de même dimension, ou null si aucun embedding valide.
 */
function computeWeightedAverageEmbedding(
  weights: Map<string, number>,
  embeddings: Map<string, number[]>
): number[] | null {
  let totalWeight = 0;
  let firstEmbedding: number[] | null = null;

  // Initialiser un vecteur nul de la bonne dimension
  for (const [, emb] of embeddings) {
    firstEmbedding = emb;
    break;
  }
  if (!firstEmbedding) return null;

  const dimension = firstEmbedding.length;
  const sum = new Array(dimension).fill(0);

  for (const [productId, weight] of weights) {
    const emb = embeddings.get(productId);
    if (!emb) continue;
    totalWeight += weight;
    for (let i = 0; i < dimension; i++) {
      sum[i] += emb[i] * weight;
    }
  }

  if (totalWeight === 0) return null;

  // Normalisation (pas obligatoire mais aide la similarité cosinus)
  const norm = Math.sqrt(sum.reduce((acc, v) => acc + v * v, 0));
  if (norm === 0) return null;
  return sum.map(v => v / norm);
}