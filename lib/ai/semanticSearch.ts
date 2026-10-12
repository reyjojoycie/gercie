// lib/ai/semanticSearch.ts
// Moteur de recherche hybride : full-text (Meilisearch) + vectoriel (pgvector).
// Retourne une liste de product_id triée par pertinence globale.
// ---------------------------------------------------------------------------
import { generateEmbedding } from './embeddings';
import { searchSimilarProducts } from './vectorStore';
import { analyzeQuery } from './queryAnalyzer';
import { searchProducts } from '@/lib/searchEngine';
import logger from '@/lib/logger';

// Correction de l'import pour s'adapter aux exports nommés de meilisearch.ts sous Turbopack
import * as meilisearchModule from '@/lib/search/meilisearch';

// Résilience : extraction du client ou fallback si encapsulé différemment
const meilisearchClient = (meilisearchModule as any).meilisearchClient || (meilisearchModule as any).client || meilisearchModule;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ScoredProduct {
  product_id: string;
  score: number;           // Score final combiné (0-1)
  textScore?: number;      // Score du moteur textuel (0-1)
  semanticScore?: number;  // Score du moteur vectoriel (0-1)
}

export interface HybridSearchOptions {
  limit?: number;          // Nombre de résultats (défaut 20)
  minScore?: number;       // Seuil minimal du score combiné (défaut 0.2)
  textWeight?: number;     // Poids du score textuel (défaut 0.3)
  semanticWeight?: number; // Poids du score sémantique (défaut 0.7)
  onlySemantic?: boolean;  // Ignore la recherche textuelle
  onlyText?: boolean;      // Ignore la recherche sémantique
}

export interface SmartSearchResult {
  results: ScoredProduct[];
  compatible: ScoredProduct[];
  intents: string[];
  source: 'llm' | 'heuristic';
}

// ---------------------------------------------------------------------------
// Helpers internes (Hybrid Search)
// ---------------------------------------------------------------------------
/**
 * Recherche textuelle via Meilisearch.
 * Retourne un mapping product_id → _rankingScore (0-1).
 */
async function textSearch(
  query: string,
  limit: number
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  try {
    const index = typeof meilisearchClient.index === 'function'
      ? meilisearchClient.index('products')
      : null;
    if (!index) {
      if (typeof (meilisearchModule as any).searchProducts === 'function') {
        const result = await (meilisearchModule as any).searchProducts(query, { limit });
        for (const hit of result?.hits || []) {
          scores.set(hit.id, typeof hit._rankingScore === 'number' ? hit._rankingScore : 0.5);
        }
        return scores;
      }
      throw new Error("Impossible de trouver une méthode de recherche valide dans le module Meilisearch.");
    }
    const result = await index.search(query, {
      limit,
      attributesToRetrieve: [],
      showRankingScore: true,
    });
    for (const hit of result.hits) {
      const score = typeof hit._rankingScore === 'number' ? hit._rankingScore : 0.5;
      scores.set(hit.id, score);
    }
  } catch (error) {
    console.error('⚠️ Meilisearch indisponible pour la recherche textuelle (Utilisation fallback sémantique pur).');
  }
  return scores;
}

/**
 * Recherche sémantique via pgvector.
 * Retourne un mapping product_id → similarity (0-1).
 */
async function semanticSearch(
  query: string,
  limit: number
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  try {
    const embedding = await generateEmbedding(query);
    const similar = await searchSimilarProducts(embedding, limit, -1.0);
    for (const { product_id, similarity } of similar) {
      scores.set(product_id, similarity);
    }
  } catch (error) {
    console.error('⚠️ Échec de la recherche sémantique vectorielle:', error);
  }
  return scores;
}

// ---------------------------------------------------------------------------
// Fonction principale (Hybrid Search - EXISTANT, NON MODIFIÉ)
// ---------------------------------------------------------------------------
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<ScoredProduct[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const {
    limit = 20,
    minScore = 0.01,
    textWeight = 0.3,
    semanticWeight = 0.7,
    onlySemantic = false,
    onlyText = false,
  } = options;

  const effectiveTextWeight = onlySemantic ? 0 : textWeight;
  const effectiveSemanticWeight = onlyText ? 0 : semanticWeight;

  const [textMap, semanticMap] = await Promise.all([
    onlySemantic ? Promise.resolve(new Map<string, number>()) : textSearch(trimmed, limit * 2),
    onlyText ? Promise.resolve(new Map<string, number>()) : semanticSearch(trimmed, limit * 2),
  ]);

  const combinedScores = new Map<string, { text?: number; semantic?: number }>();

  for (const [productId, score] of textMap.entries()) {
    combinedScores.set(productId, { text: score });
  }

  for (const [productId, score] of semanticMap.entries()) {
    const existing = combinedScores.get(productId);
    if (existing) {
      existing.semantic = score;
    } else {
      combinedScores.set(productId, { semantic: score });
    }
  }

  const finalResults: ScoredProduct[] = [];
  for (const [productId, scores] of combinedScores.entries()) {
    const textScore = scores.text ?? 0;
    const semanticScore = scores.semantic ?? 0;

    let finalScore = 0;
    if (textScore > 0 && semanticScore > 0) {
      finalScore = (textScore * effectiveTextWeight + semanticScore * effectiveSemanticWeight) / (effectiveTextWeight + effectiveSemanticWeight);
    } else if (semanticScore > 0) {
      finalScore = semanticScore;
    } else {
      finalScore = textScore;
    }

    if (finalScore >= minScore || textMap.size === 0) {
      finalResults.push({
        product_id: productId,
        score: finalScore,
        textScore: textScore > 0 ? textScore : undefined,
        semanticScore: semanticScore > 0 ? semanticScore : undefined,
      });
    }
  }

  finalResults.sort((a, b) => b.score - a.score);
  console.log(`[DEBUG SEMANTIC] Requête: "${trimmed}" | Trouvés en DB: ${semanticMap.size} | Envoyés au front: ${finalResults.length}`);
  
  return finalResults.slice(0, limit);
}

// ---------------------------------------------------------------------------
// NOUVEAU : Smart Search (Multi-intentions + Boost texte + Compatibles)
// ---------------------------------------------------------------------------
/**
 * Recherche intelligente : analyse les intentions via LLM/heuristique,
 * cherche les produits principaux, booste avec le texte, et trouve les accessoires compatibles.
 */
export async function smartSearch(
  query: string,
  options: { limit?: number } = {}
): Promise<SmartSearchResult> {
  const limit = options.limit || 20;
  const trimmed = query.trim();
  
  if (!trimmed) {
    return { results: [], compatible: [], intents: [], source: 'heuristic' };
  }

  // 1. Analyser la requête (LLM avec fallback heuristique)
  const analysis = await analyzeQuery(trimmed);
  const intents = analysis.intents.length > 0 ? analysis.intents : [trimmed];
  const hints = analysis.compatibilityHints;

  // 2. Recherche vectorielle pour chaque intent en parallèle
  const intentEmbeddings = await Promise.all(
    intents.slice(0, 4).map(async (intent) => {
      try {
        const emb = await generateEmbedding(intent);
        const similar = await searchSimilarProducts(emb, limit, -1.0);
        return { intent, similar };
      } catch (e) {
        logger.warn(`[SmartSearch] Échec embedding pour intent "${intent}"`);
        return { intent, similar: [] };
      }
    })
  );

  // 3. Boost texte via searchEngine (fallback ILIKE)
  let textBoostIds = new Set<string>();
  try {
    const textResults = await searchProducts({ query: trimmed, limit: 20 });
    textResults.results.forEach(r => textBoostIds.add(r.id));
  } catch (e) {
    logger.warn('[SmartSearch] Échec du boost texte (searchEngine)');
  }

  // 4. Fusion des résultats vectoriels (round-robin pour la diversité) + boost texte
  const combinedMap = new Map<string, number>();
  
  const maxLen = Math.max(...intentEmbeddings.map(i => i.similar.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const { similar } of intentEmbeddings) {
      if (i < similar.length) {
        const { product_id, similarity } = similar[i];
        if (!combinedMap.has(product_id)) {
          combinedMap.set(product_id, similarity);
        }
      }
    }
  }

  // Application du boost texte
  for (const id of textBoostIds) {
    if (combinedMap.has(id)) {
      combinedMap.set(id, (combinedMap.get(id) || 0) + 0.25); // Boost exact match
    } else {
      combinedMap.set(id, 0.6); // Injection des IDs texte manquants
    }
  }

  // Tri et limitation des résultats principaux
  const results: ScoredProduct[] = Array.from(combinedMap.entries())
    .map(([product_id, score]) => ({ product_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // 5. Recherche des produits compatibles (via hints d'accessoires)
  const compatible: ScoredProduct[] = [];
  const resultIds = new Set(results.map(r => r.product_id));
  
  if (hints.length > 0) {
    const hintEmbeddings = await Promise.all(
      hints.slice(0, 4).map(async (hint) => {
        try {
          const emb = await generateEmbedding(hint);
          return await searchSimilarProducts(emb, 4, -1.0);
        } catch {
          return [];
        }
      })
    );

    const compatibleMap = new Map<string, number>();
    for (const hintResults of hintEmbeddings) {
      for (const { product_id, similarity } of hintResults) {
        if (!resultIds.has(product_id) && !compatibleMap.has(product_id)) {
          compatibleMap.set(product_id, similarity);
        }
      }
    }

    const compatibleResults = Array.from(compatibleMap.entries())
      .map(([product_id, score]) => ({ product_id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    
    compatible.push(...compatibleResults);
  }

  logger.info(`[SMART SEARCH] "${trimmed}" | Intents: ${intents.length} | Résultats: ${results.length} | Compatibles: ${compatible.length} | Source: ${analysis.source}`);

  return {
    results,
    compatible,
    intents,
    source: analysis.source,
  };
}