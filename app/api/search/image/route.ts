// app/api/search/image/route.ts
// Endpoint de recherche par image (avec option texte)
// Accepte : upload de fichier OU URL d'image + texte optionnel
// Retourne : produits similaires trouvés via CLIP
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateClipHybridEmbedding } from '@/lib/ai/imageEmbeddings';
import { createServiceClient as supabaseServer } from '@/lib/supabaseServer';
import logger from '@/lib/logger';

// Schéma de validation
const ImageSearchSchema = z.object({
  imageUrl: z.string().url().optional(),
  text: z.string().max(500).optional(),
  textWeight: z.coerce.number().min(0).max(1).default(0.5),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minSimilarity: z.coerce.number().min(0).max(1).default(0.3),
});

// Fonction de traitement partagée (pour éviter la duplication)
async function processImageSearch(
  imageUrl: string | undefined,
  text: string | undefined,
  textWeight: number,
  limit: number,
  minSimilarity: number
) {
  try {
    if (!imageUrl && !text) {
      return {
        error: 'Au moins une image ou un texte est requis',
        status: 400
      };
    }

    // -----------------------------------------------------------------------
    // 1. Générer l'embedding CLIP (hybride si image + texte)
    // -----------------------------------------------------------------------
    logger.info(`[Recherche Image] Début - Image: ${!!imageUrl}, Texte: "${text?.substring(0, 30)}..."`);
    
    let embedding: number[];
    try {
      embedding = await generateClipHybridEmbedding(
        text || null,
        imageUrl || null,
        textWeight
      );
    } catch (error: any) {
      logger.error('[Recherche Image] Échec génération embedding CLIP', error);
      return {
        error: 'Erreur lors de l\'analyse de l\'image',
        details: error.message,
        status: 500
      };
    }

    // -----------------------------------------------------------------------
    // 2. Rechercher les produits similaires via RPC Supabase
    // -----------------------------------------------------------------------
    const supabase = await supabaseServer();
    const embeddingStr = `[${embedding.join(',')}]`;

    const { data, error } = await supabase.rpc('search_similar_clip_hybrid', {
      query_embedding: embeddingStr,
      match_count: limit,
      similarity_threshold: minSimilarity,
    });

    if (error) {
      logger.error('[Recherche Image] Erreur RPC Supabase', error);
      return {
        error: 'Erreur de recherche dans la base de données',
        details: error.message,
        status: 500
      };
    }

    // -----------------------------------------------------------------------
    // 3. Formater et retourner les résultats
    // -----------------------------------------------------------------------
    const results = (data || []).map((item: any) => ({
      product_id: item.product_id,
      similarity: Math.round(item.similarity * 100) / 100, // 2 décimales
      nom: item.nom,
      prix: item.prix,
      images: item.images || [],
    }));

    logger.info(`[Recherche Image] Succès - ${results.length} produits trouvés`);

    return {
      success: true,
      data: {
        query: {
          hasImage: !!imageUrl,
          text: text || null,
          textWeight,
        },
        count: results.length,
        results,
      }
    };

  } catch (error: any) {
    logger.error('[Recherche Image] Erreur critique', error);
    return {
      error: 'Erreur interne du serveur',
      details: error.message,
      status: 500
    };
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  
  try {
    // Vérifier le type de contenu
    const contentType = request.headers.get('content-type') || '';
    
    let imageUrl: string | undefined;
    let text: string | undefined;
    let textWeight: number = 0.5;
    let limit: number = 20;
    let minSimilarity: number = 0.3;

    if (contentType.includes('multipart/form-data')) {
      // Upload de fichier
      const formData = await request.formData();
      const file = formData.get('image') as File | null;
      text = formData.get('text') as string | undefined;
      textWeight = parseFloat(formData.get('textWeight') as string) || 0.5;
      limit = parseInt(formData.get('limit') as string) || 20;
      minSimilarity = parseFloat(formData.get('minSimilarity') as string) || 0.3;

      if (!file) {
        return NextResponse.json(
          { error: 'Aucun fichier image fourni' },
          { status: 400 }
        );
      }

      // Valider le fichier
      if (!file.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Le fichier doit être une image' },
          { status: 400 }
        );
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB max
        return NextResponse.json(
          { error: 'L\'image ne doit pas dépasser 10MB' },
          { status: 400 }
        );
      }

      // Convertir en base64 pour l'embedding
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      imageUrl = `data:${file.type};base64,${base64}`;
      
    } else {
      // Requête JSON
      const body = await request.json();
      const parsed = ImageSearchSchema.safeParse(body);
      
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Paramètres invalides', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      imageUrl = parsed.data.imageUrl;
      text = parsed.data.text;
      textWeight = parsed.data.textWeight;
      limit = parsed.data.limit;
      minSimilarity = parsed.data.minSimilarity;
    }

    // Appeler la fonction de traitement partagée
    const result = await processImageSearch(imageUrl, text, textWeight, limit, minSimilarity);
    
    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    return NextResponse.json(result.data);

  } catch (error: any) {
    logger.error('[Recherche Image] Erreur critique', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur', details: error.message },
      { status: 500 }
    );
  }
}

// Support GET pour tester avec des paramètres URL
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('imageUrl') || undefined;
  const text = searchParams.get('text') || undefined;
  const textWeight = parseFloat(searchParams.get('textWeight') || '0.5');
  const limit = parseInt(searchParams.get('limit') || '20');
  const minSimilarity = parseFloat(searchParams.get('minSimilarity') || '0.3');

  // ✅ CORRECTION : Appeler directement la fonction de traitement
  // au lieu d'essayer de créer un faux NextRequest
  const result = await processImageSearch(imageUrl, text, textWeight, limit, minSimilarity);
  
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data);
}