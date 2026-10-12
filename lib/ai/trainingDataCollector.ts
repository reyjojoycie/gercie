// lib/ai/trainingDataCollector.ts
// Collecte des interactions utilisateur pour l'entraînement des modèles IA
// (recommandations, tendances, détection de fraude). Insertion asynchrone
// avec file d'attente (BullMQ) et mode "fire-and-forget".
// ---------------------------------------------------------------------------
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Types d'interaction autorisés (doit correspondre à la contrainte SQL)
export type InteractionType =
  | 'view'
  | 'cart_add'
  | 'favorite'
  | 'purchase'
  | 'search_click';

// Options de tracking
interface TrackOptions {
  /** Poids de l'interaction (par défaut 1.0) */
  weight?: number;
  /** Métadonnées additionnelles (stockées dans la table sous forme JSONB si besoin) */
  metadata?: Record<string, unknown>;
}

// File d'attente BullMQ (si disponible) pour insérer sans ralentir la réponse
let trackQueue: any = null;

async function getQueue() {
  if (trackQueue) return trackQueue;
  try {
    const { Queue } = await import('bullmq');
    
    // Nettoyage de l'URL pour s'assurer que l'objet URL est valide même avec un protocole alternatif
    const redisUrlString = process.env.BULLMQ_REDIS_URL || 'redis://127.0.0.1:6379';
    const cleanUrlString = redisUrlString.startsWith('redis') 
      ? redisUrlString.replace(/^redis:/, 'http:').replace(/^rediss:/, 'https:') 
      : redisUrlString;

    const redisUrl = new URL(cleanUrlString);

    trackQueue = new Queue('ai-interactions', {
      connection: {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379'),
      },
    });
    console.log('[INFO] Queue IA interactions initialisée avec succès.');
  } catch (error) {
    // ✅ CORRECTION : Utilisation de console.warn natif pour intercepter silencieusement l'absence de Redis
    console.warn('⚠️ [BullMQ] Non disponible (Redis hors-ligne). Bascule automatique sur l\'insertion DB directe.');
    trackQueue = null;
  }
  return trackQueue;
}

// ---------------------------------------------------------------------------
// Insertion directe (fallback)
// ---------------------------------------------------------------------------
async function insertDirectly(
  userId: string,
  productId: string,
  interactionType: InteractionType,
  options: TrackOptions = {}
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('user_interactions')
      .insert({
        user_id: userId,
        product_id: productId,
        interaction_type: interactionType,
        weight: options.weight ?? 1.0,
        // metadata: options.metadata ?? null, // à activer si la colonne existe
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error(`❌ [DB Error] Échec insertion interaction pour l'ID ${productId}:`, error.message);
    }
  } catch (err: any) {
    console.error('❌ [Exception DB] Erreur lors du repli direct sur table user_interactions:', err?.message || err);
  }
}

// ---------------------------------------------------------------------------
// Fonction publique principale
// ---------------------------------------------------------------------------

/**
 * Enregistre une interaction utilisateur de manière non bloquante.
 * Utilise BullMQ si disponible, sinon écrit directement en base.
 */
export async function trackInteraction(
  userId: string | undefined,
  productId: string,
  interactionType: InteractionType,
  options: TrackOptions = {}
): Promise<void> {
  // Ne rien faire si l'utilisateur n'est pas identifié (pas de personnalisation possible)
  if (!userId) return;

  // Vérifier que le produitId est valide
  if (!productId) return;

  const queue = await getQueue();

  if (queue) {
    // Ajout à la file d'attente (instantané, sans attente)
    queue
      .add(
        'track-interaction',
        {
          userId,
          productId,
          interactionType,
          weight: options.weight ?? 1.0,
          metadata: options.metadata ?? null,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: 100,
        }
      )
      .catch((err: any) => {
        console.error('❌ [Queue Error] Impossible d\'ajouter le job dans BullMQ, lancement du repli direct DB.', err);
        // Fallback insertion directe en cas d'échec de la queue
        insertDirectly(userId, productId, interactionType, options);
      });
  } else {
    // Pas de queue, insertion directe (promesse non attendue pour ne pas bloquer)
    insertDirectly(userId, productId, interactionType, options);
  }
}

/**
 * Version simplifiée pour le tracking de vues (utilisé dans les composants).
 */
export async function trackProductView(
  userId: string | undefined,
  productId: string
): Promise<void> {
  await trackInteraction(userId, productId, 'view', { weight: 0.5 });
}

/**
 * Enregistre l'ajout au panier.
 */
export async function trackCartAdd(
  userId: string | undefined,
  productId: string
): Promise<void> {
  await trackInteraction(userId, productId, 'cart_add', { weight: 1.0 });
}

/**
 * Enregistre un ajout aux favoris.
 */
export async function trackFavorite(
  userId: string | undefined,
  productId: string
): Promise<void> {
  await trackInteraction(userId, productId, 'favorite', { weight: 1.5 });
}

/**
 * Enregistre un achat (à appeler après validation de la commande).
 */
export async function trackPurchase(
  userId: string,
  productIds: string[]
): Promise<void> {
  for (const productId of productIds) {
    await trackInteraction(userId, productId, 'purchase', { weight: 3.0 });
  }
}

/**
 * Enregistre un clic sur un résultat de recherche.
 */
export async function trackSearchClick(
  userId: string | undefined,
  productId: string
): Promise<void> {
  await trackInteraction(userId, productId, 'search_click', { weight: 0.3 });
}