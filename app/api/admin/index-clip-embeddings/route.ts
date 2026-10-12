// app/api/admin/index-clip-embeddings/route.ts
// Script d'indexation des embeddings CLIP pour tous les produits
// À exécuter UNE FOIS pour indexer les 62 produits existants
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server';
import { generateClipTextEmbedding, generateClipImageEmbedding } from '@/lib/ai/imageEmbeddings';
import { upsertProductClipTextEmbedding, upsertProductClipImageEmbedding } from '@/lib/ai/vectorStore';
import { createServiceClient as supabaseServer } from '@/lib/supabaseServer';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic'; // Désactive le cache

export async function GET(request: Request) {
  //  Protection basique (à renforcer en production)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET_KEY || 'dev-secret-key'}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const supabase = await supabaseServer();
  
  try {
    logger.info('[CLIP Indexing] Début de l\'indexation des embeddings CLIP...');

    // 1. Récupérer tous les produits actifs
    const { data: products, error: fetchError } = await supabase
      .from('produits')
      .select('id, nom, description, images')
      .eq('est_actif', true);

    if (fetchError) {
      logger.error('[CLIP Indexing] Erreur fetch produits', fetchError);
      return NextResponse.json({ error: 'Erreur récupération produits' }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ message: 'Aucun produit à indexer' });
    }

    logger.info(`[CLIP Indexing] ${products.length} produits à indexer`);

    // 2. Indexer chaque produit
    const results = {
      total: products.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const progress = `${i + 1}/${products.length}`;
      
      try {
        logger.info(`[CLIP Indexing] ${progress} - Produit: ${product.nom}`);

        // a) Embedding texte (nom + description)
        const textToEmbed = `${product.nom} ${product.description || ''}`.trim();
        let textEmbedding: number[] | null = null;
        
        if (textToEmbed.length > 0) {
          try {
            textEmbedding = await generateClipTextEmbedding(textToEmbed);
            await upsertProductClipTextEmbedding(product.id, textEmbedding);
            logger.info(`[CLIP Indexing] ${progress} - Embedding texte généré (dim: ${textEmbedding.length})`);
          } catch (err: any) {
            logger.warn(`[CLIP Indexing] ${progress} - Échec embedding texte: ${err.message}`);
          }
        }

        // b) Embedding image (première image si disponible)
        const imageUrl = product.images?.[0];
        let imageEmbedding: number[] | null = null;
        
        if (imageUrl) {
          try {
            imageEmbedding = await generateClipImageEmbedding(imageUrl);
            await upsertProductClipImageEmbedding(product.id, imageEmbedding);
            logger.info(`[CLIP Indexing] ${progress} - Embedding image généré (dim: ${imageEmbedding.length})`);
          } catch (err: any) {
            logger.warn(`[CLIP Indexing] ${progress} - Échec embedding image: ${err.message}`);
          }
        }

        results.success++;
        
        // Pause pour éviter de surcharger l'API (rate limiting)
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Produit ${product.id}: ${err.message}`);
        logger.error(`[CLIP Indexing] ${progress} - Erreur critique`, err);
      }
    }

    logger.info('[CLIP Indexing] Indexation terminée', results);

    return NextResponse.json({
      message: 'Indexation CLIP terminée',
      results,
    });

  } catch (error: any) {
    logger.error('[CLIP Indexing] Erreur critique', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}