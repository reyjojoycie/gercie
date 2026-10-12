// lib/queue/ai-embeddings.ts
// Worker BullMQ pour la génération d'embeddings
// ---------------------------------------------------------------------------
import { Worker } from 'bullmq'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { upsertProductEmbedding } from '@/lib/ai/vectorStore'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import logger from '@/lib/logger'

const REDIS_URL = process.env.BULLMQ_REDIS_URL || 'redis://127.0.0.1:6379'

// Initialisation du worker
export const embeddingsWorker = new Worker(
  'ai-embeddings',
  async (job) => {
    const { productId } = job.data

    if (!productId) {
      throw new Error('productId manquant')
    }

    // Récupérer le produit depuis la DB
    const { data: product, error } = await supabaseAdmin
      .from('produits')
      .select('id, nom, description')
      .eq('id', productId)
      .single()

    if (error || !product) {
      throw new Error(`Produit ${productId} introuvable`)
    }

    const text = `${product.nom} ${product.description || ''}`.trim()
    if (!text) return // rien à vectoriser

    const embedding = await generateEmbedding(text)
    await upsertProductEmbedding(product.id, embedding)

    logger.info(`Embedding mis à jour pour le produit ${productId}`)
  },
  {
    connection: {
      url: REDIS_URL,
    },
    concurrency: 5, // nombre de jobs simultanés (ajustable)
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  }
)

// Gestion des événements
embeddingsWorker.on('completed', (job) => {
  logger.debug(`Job ${job.id} terminé`)
})

embeddingsWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} échoué : ${err.message}`)
})