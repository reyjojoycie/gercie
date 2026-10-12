// app/api/cron/ai-embeddings/route.ts
import { NextResponse } from 'next/server'
import { Queue } from 'bullmq'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import logger from '@/lib/logger'

const REDIS_URL = process.env.BULLMQ_REDIS_URL || 'redis://127.0.0.1:6379'

export async function GET(request: Request) {
  // Vérifier un token de sécurité
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  try {
    const queue = new Queue('ai-embeddings', { connection: { url: REDIS_URL } })

    // Récupérer les produits modifiés dans les dernières 24h (par exemple)
    const { data: products, error } = await supabaseAdmin
      .from('produits')
      .select('id')
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (error) throw error

    for (const product of products || []) {
      await queue.add('generate-embedding', { productId: product.id })
    }

    logger.info(`${products?.length || 0} jobs d'embedding ajoutés à la queue.`)
    return NextResponse.json({ success: true, count: products?.length || 0 })
  } catch (err: any) {
    logger.error('Erreur cron ai-embeddings', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}