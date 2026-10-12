// lib/ai/embeddings.ts
// Service de génération d'embeddings pour produits et recherches.
// Utilise un modèle local gratuit (Xenova/all-MiniLM-L6-v2) via Transformers.js
// et un cache Redis/mémoire pour réduire la latence.
// ---------------------------------------------------------------------------

import { pipeline } from '@xenova/transformers';
import { createHash } from 'crypto';
import logger from '@/lib/logger';

// ---------------------------------------------------------------------------
// Configuration & Cache
// ---------------------------------------------------------------------------

// Modèle d'embedding local
const EMBEDDING_MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
// Dimension de sortie pour ce modèle
export const EMBEDDING_DIMENSION = 384;

// Instance du pipeline (initialisation paresseuse)
let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    logger.info('Chargement du modèle d\'embedding local...');
    embedder = await pipeline('feature-extraction', EMBEDDING_MODEL_NAME);
    logger.info('Modèle d\'embedding local chargé avec succès.');
  }
  return embedder;
}

// Taille max du cache local en nombre d'entrées (fallback si Redis absent)
const LOCAL_CACHE_MAX_SIZE = 500;

// Cache local simple avec éviction LRU simplifiée
const localCache = new Map<string, { embedding: number[]; timestamp: number }>();

// Fonction pour obtenir une instance de cache Redis (si disponible)
let redisCache: { get: (key: string) => Promise<string | null>; set: (key: string, value: string, ttlSeconds: number) => Promise<void> } | null = null;

async function initRedisCache() {
  if (redisCache) return redisCache;
  try {
    // ✅ CORRECTION : Vérification stricte de l'URL pour éviter les connexions fantômes
    if (process.env.REDIS_CACHE_URL && process.env.REDIS_CACHE_URL.startsWith('redis')) {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis(process.env.REDIS_CACHE_URL, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        // ✅ Stoppe les tentatives de reconnexion infinies qui spamment la console
        retryStrategy: (times) => {
          if (times > 1) return null; 
          return 1000;
        },
      });
      
      // ✅ CORRECTION CRITIQUE : Capturer l'événement 'error' pour empêcher le crash/spam Node.js
      redis.on('error', (err) => {
        logger.warn(`[Redis] Erreur de connexion ignorée (Bascule sur cache mémoire): ${err.message}`);
        redis.disconnect();
      });

      await redis.connect().catch((err) => {
        logger.warn('Impossible de se connecter à Redis. Utilisation du cache mémoire.');
        redis.disconnect();
        return null;
      });
      
      if (redis.status === 'ready') {
        redisCache = {
          get: async (key: string) => redis.get(key),
          set: async (key: string, value: string, ttlSeconds: number) =>
            redis.set(key, value, 'EX', ttlSeconds),
        };
        return redisCache;
      } else {
        redis.disconnect();
      }
    }
    logger.warn('Aucun cache Redis valide configuré. Cache mémoire activé.');
  } catch (error: any) {
    logger.warn('Erreur lors de l’initialisation du cache Redis.', error.message);
  }
  return null;
}

initRedisCache().then(cache => {
  if (cache) logger.info('Cache Redis pour embeddings activé.');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashText(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

async function getCachedEmbedding(key: string): Promise<number[] | null> {
  if (redisCache) {
    try {
      const cached = await redisCache.get(`embed:${key}`);
      if (cached) {
        return JSON.parse(cached) as number[];
      }
    } catch (err) {
      logger.error('Erreur lors de la récupération du cache Redis pour un embedding.', err);
    }
  }

  const local = localCache.get(key);
  if (local) {
    local.timestamp = Date.now();
    return local.embedding;
  }

  return null;
}

async function setCachedEmbedding(key: string, embedding: number[]): Promise<void> {
  if (redisCache) {
    try {
      await redisCache.set(`embed:${key}`, JSON.stringify(embedding), 60 * 60 * 24 * 30);
    } catch (err) {
      logger.error('Erreur lors du stockage Redis de l’embedding.', err);
    }
  }

  if (localCache.size >= LOCAL_CACHE_MAX_SIZE) {
    const oldest = [...localCache.entries()].reduce((a, b) =>
      a[1].timestamp < b[1].timestamp ? a : b
    );
    localCache.delete(oldest[0]);
  }
  localCache.set(key, { embedding, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Génère un embedding vectoriel pour un texte donné.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Le texte fourni pour l’embedding est vide.');
  }

  const cacheKey = hashText(trimmed);

  const cached = await getCachedEmbedding(cacheKey);
  if (cached) {
    logger.debug(`Embedding récupéré depuis le cache pour "${trimmed.substring(0, 50)}..."`);
    return cached;
  }

  try {
    const pipe = await getEmbedder();
    const result = await pipe(trimmed, { pooling: 'mean', normalize: true });
    const embedding = Array.from(result.data) as number[];

    await setCachedEmbedding(cacheKey, embedding);

    logger.info(`Embedding généré avec succès pour "${trimmed.substring(0, 50)}..." (dimension: ${embedding.length})`);
    return embedding;
  } catch (error: any) {
    logger.error(`Échec de la génération d’embedding pour "${trimmed.substring(0, 50)}..."`, error);
    throw new Error(`Erreur lors de la génération de l'embedding: ${error.message}`);
  }
}

/**
 * Version batch pour générer plusieurs embeddings à la fois.
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  if (!texts.length) return [];

  const validTexts = texts.map(t => t.trim()).filter(Boolean);
  const results: (number[] | null)[] = new Array(validTexts.length).fill(null);
  const keys = validTexts.map(t => hashText(t));

  const toFetchIndices: number[] = [];
  for (let i = 0; i < validTexts.length; i++) {
    const cached = await getCachedEmbedding(keys[i]);
    if (cached) {
      results[i] = cached;
    } else {
      toFetchIndices.push(i);
    }
  }

  if (toFetchIndices.length > 0) {
    try {
      const pipe = await getEmbedder();
      for (const idx of toFetchIndices) {
        const text = validTexts[idx];
        const result = await pipe(text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(result.data) as number[];
        results[idx] = embedding;
        setCachedEmbedding(keys[idx], embedding).catch(err =>
          logger.error('Erreur de mise en cache batch.', err)
        );
      }
    } catch (error: any) {
      logger.error('Erreur lors de la génération batch d’embeddings.', error);
      throw error;
    }
  }

  return results.map((emb, i) => {
    if (!emb) throw new Error(`Embedding manquant pour le texte: "${validTexts[i].substring(0, 50)}..."`);
    return emb;
  });
}