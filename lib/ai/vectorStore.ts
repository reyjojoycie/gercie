// lib/ai/vectorStore.ts
// Abstraction pour le stockage et la recherche vectorielle via pgvector.
// Conçu pour fonctionner avec la colonne 'embedding' ajoutée directement à la table 'produits'.
// ---------------------------------------------------------------------------
import { createClient as createServerClient } from '@/lib/supabaseServer';
import logger from '@/lib/logger';

export interface SimilarProduct {
  product_id: string;
  similarity: number;
}

// ---------------------------------------------------------------------------
// Récupération d'un embedding individuel
// ---------------------------------------------------------------------------

/**
 * Récupère l'embedding stocké pour un produit donné.
 * Utilisé par le moteur de personnalisation pour construire le profil utilisateur.
 */
export async function getProductEmbedding(
  productId: string
): Promise<number[] | null> {
  if (!productId) return null;

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('produits')
    .select('embedding')
    .eq('id', productId)
    .maybeSingle();

  if (error) {
    logger.error(`Erreur getProductEmbedding pour ${productId}`, error);
    return null;
  }

  if (!data?.embedding) return null;

  // pgvector peut retourner une chaîne "[0.1,0.2,...]" ou un tableau natif
  if (typeof data.embedding === 'string') {
    try {
      return JSON.parse(data.embedding) as number[];
    } catch {
      // Fallback pour le format PostgreSQL array
      const cleaned = data.embedding.replace(/[{}[\]]/g, '');
      return cleaned.split(',').map(Number);
    }
  }

  if (Array.isArray(data.embedding)) {
    return data.embedding as number[];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Upsert d'un embedding individuel
// ---------------------------------------------------------------------------

/**
 * Met à jour l'embedding d'un produit directement dans la table 'produits'.
 * @param productId – UUID du produit
 * @param embedding – Vecteur de nombres (dimension 384)
 */
export async function upsertProductEmbedding(
  productId: string,
  embedding: number[]
): Promise<void> {
  if (!productId || !embedding || embedding.length === 0) {
    throw new Error('ID produit ou embedding invalide');
  }

  const supabase = await createServerClient();

  const { error } = await supabase
    .from('produits')
    .update({ embedding: embedding })
    .eq('id', productId);

  if (error) {
    logger.error(`Échec upsertProductEmbedding pour ${productId}`, error);
    throw new Error(`Erreur upsert embedding : ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Recherche de similarité
// ---------------------------------------------------------------------------

/**
 * Recherche les produits les plus similaires à un vecteur d'embedding donné.
 * Appelle la fonction RPC 'search_similar_products' créée dans Supabase.
 *
 * @param embedding – Vecteur de la requête (tableau de nombres, dim 384)
 * @param limit – Nombre maximum de résultats
 * @param minSimilarity – Seuil minimal de similarité cosinus (-1 à 1)
 * @returns Liste de produits avec score de similarité
 */
export async function searchSimilarProducts(
  embedding: number[],
  limit: number = 20,
  minSimilarity: number = -1.0
): Promise<SimilarProduct[]> {
  if (!embedding || embedding.length === 0) {
    logger.warn('searchSimilarProducts appelé avec un embedding vide.');
    return [];
  }

  const supabase = await createServerClient();

  // Conversion explicite en chaîne formatée "[0.1, 0.2, ...]"
  // pour garantir la compatibilité avec l'entrée vector de PostgreSQL via RPC
  const embeddingStr = `[${embedding.join(',')}]`;

  const { data, error } = await supabase.rpc('search_similar_products', {
    query_embedding: embeddingStr,
    match_count: limit,
    similarity_threshold: minSimilarity,
  });

  if (error) {
    logger.error('Erreur RPC search_similar_products', error);
    return [];
  }

  return (data ?? []) as SimilarProduct[];
}

// ---------------------------------------------------------------------------
// Opérations batch
// ---------------------------------------------------------------------------

/**
 * Upsert en masse des embeddings (utile pour le script d'initialisation admin).
 * Traite les éléments de manière séquentielle pour éviter de saturer la connexion.
 */
export async function batchUpsertProductEmbeddings(
  items: Array<{ productId: string; embedding: number[] }>
): Promise<void> {
  if (!items.length) return;

  const supabase = await createServerClient();

  for (const { productId, embedding } of items) {
    const { error } = await supabase
      .from('produits')
      .update({ embedding: embedding })
      .eq('id', productId);

    if (error) {
      logger.error(`Échec batch upsert pour ${productId}`, error);
    }
  }
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

/**
 * Supprime l'embedding d'un produit (remet la colonne à NULL).
 */
export async function deleteProductEmbedding(
  productId: string
): Promise<void> {
  if (!productId) return;

  const supabase = await createServerClient();

  const { error } = await supabase
    .from('produits')
    .update({ embedding: null })
    .eq('id', productId);

  if (error) {
    logger.error(`Erreur deleteProductEmbedding pour ${productId}`, error);
    throw new Error(`Erreur suppression embedding : ${error.message}`);
  }
}

// ===========================================================================
// MAILLON S2 : Fonctions CLIP (Recherche par image - 512 dimensions)
// ===========================================================================

/**
 * Met à jour l'embedding CLIP (texte) d'un produit.
 * Utilisé lors de l'indexation des descriptions produits pour la recherche visuelle.
 * 
 * @param productId – UUID du produit
 * @param embedding – Vecteur de nombres (dimension 512)
 */
export async function upsertProductClipTextEmbedding(
  productId: string,
  embedding: number[]
): Promise<void> {
  if (!productId || !embedding || embedding.length !== 512) {
    throw new Error('ID produit ou embedding CLIP invalide (doit être 512 dims)');
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('produits')
    .update({ embedding_clip_text: embedding })
    .eq('id', productId);

  if (error) {
    logger.error(`Échec upsertProductClipTextEmbedding pour ${productId}`, error);
    throw new Error(`Erreur upsert embedding CLIP texte : ${error.message}`);
  }
}

/**
 * Met à jour l'embedding CLIP (image) d'un produit.
 * Utilisé lors de l'indexation de l'image principale du produit.
 * 
 * @param productId – UUID du produit
 * @param embedding – Vecteur de nombres (dimension 512)
 */
export async function upsertProductClipImageEmbedding(
  productId: string,
  embedding: number[]
): Promise<void> {
  if (!productId || !embedding || embedding.length !== 512) {
    throw new Error('ID produit ou embedding CLIP image invalide (doit être 512 dims)');
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('produits')
    .update({ embedding_clip_image: embedding })
    .eq('id', productId);

  if (error) {
    logger.error(`Échec upsertProductClipImageEmbedding pour ${productId}`, error);
    throw new Error(`Erreur upsert embedding CLIP image : ${error.message}`);
  }
}