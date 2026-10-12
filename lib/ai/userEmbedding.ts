// lib/ai/userEmbedding.ts
// Calcule l'embedding vectoriel d'un utilisateur à partir de ses interactions
// pondérées sur les produits. Utilise un cache mémoire pour limiter les calculs.
// ---------------------------------------------------------------------------
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getProductEmbedding } from './vectorStore';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------
const INTERACTION_WEIGHTS: Record<string, number> = {
  view: 0.5,
  cart_add: 1.0,
  favorite: 1.5,
  purchase: 3.0,
  search_click: 0.3,
};

const INTERACTION_WINDOW_DAYS = 30;
const MAX_TOP_PRODUCTS = 20;

// Cache mémoire pour éviter de recalculer l'embedding à chaque requête
const cache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Fonction publique
// ---------------------------------------------------------------------------

/**
 * Récupère (ou calcule) l'embedding d'un utilisateur basé sur ses interactions
 * récentes. Retourne null si l'utilisateur n'a pas assez d'historique.
 *
 * @param userId - UUID de l'utilisateur
 * @returns Le vecteur d'embedding normalisé, ou null
 */
export async function getUserEmbedding(userId: string): Promise<number[] | null> {
  // Vérifier le cache
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.embedding;
  }

  try {
    const interactions = await fetchRecentInteractions(userId);
    if (!interactions.length) return null;

    // Pondération et sélection des produits dominants
    const weighted = computeWeightedProducts(interactions);
    if (weighted.size === 0) return null;

    // Récupération des embeddings des produits dominants
    const productIds = Array.from(weighted.keys());
    const embeddings = await fetchEmbeddings(productIds);

    // Calcul de la moyenne pondérée
    const avgEmbedding = computeWeightedAverageEmbedding(weighted, embeddings);
    if (!avgEmbedding) return null;

    // Mettre en cache
    cache.set(userId, { embedding: avgEmbedding, timestamp: Date.now() });
    if (cache.size > 500) {
      // Éviction simple : supprimer l'entrée la plus ancienne
      const oldest = [...cache.entries()].reduce((a, b) =>
        a[1].timestamp < b[1].timestamp ? a : b
      );
      cache.delete(oldest[0]);
    }

    return avgEmbedding;
  } catch (error) {
    logger.error(`Erreur getUserEmbedding pour ${userId}`, error);
    return null;
  }
}

/**
 * Invalide le cache d'embedding pour un utilisateur (à appeler après un achat,
 * ajout aux favoris, etc.).
 */
export function invalidateUserEmbeddingCache(userId: string): void {
  cache.delete(userId);
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

async function fetchRecentInteractions(
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
    .limit(200);

  if (error) {
    logger.error(`Erreur fetchRecentInteractions pour ${userId}`, error);
    return [];
  }
  return data ?? [];
}

function computeWeightedProducts(
  interactions: Array<{ product_id: string; interaction_type: string }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const { product_id, interaction_type } of interactions) {
    const weight = INTERACTION_WEIGHTS[interaction_type] ?? 0.1;
    map.set(product_id, (map.get(product_id) ?? 0) + weight);
  }

  // Garder les N produits les plus influents
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  return new Map(sorted.slice(0, MAX_TOP_PRODUCTS));
}

async function fetchEmbeddings(
  productIds: string[]
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  await Promise.all(
    productIds.map(async (pid) => {
      try {
        const emb = await getProductEmbedding(pid);
        if (emb) map.set(pid, emb);
      } catch {
        // silencieux
      }
    })
  );
  return map;
}

function computeWeightedAverageEmbedding(
  weights: Map<string, number>,
  embeddings: Map<string, number[]>
): number[] | null {
  let totalWeight = 0;
  let dimension: number | null = null;

  // Déterminer la dimension à partir du premier embedding valide
  for (const [, emb] of embeddings) {
    dimension = emb.length;
    break;
  }
  if (dimension === null) return null;

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

  // Normalisation L2
  const norm = Math.sqrt(sum.reduce((acc, v) => acc + v * v, 0));
  if (norm === 0) return null;
  return sum.map(v => v / norm);
}