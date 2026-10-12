// app/api/ai/recommendations/route.ts
// Endpoint de recommandations personnalisées (utilisateur connecté requis).
// Si l'utilisateur n'a pas d'historique, renvoie les produits les plus populaires.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { getPersonalizedRecommendations } from '@/lib/ai/personalizationEngine';
import { createClient } from '@/lib/supabaseServer'; // ✅ Changé : import factory
import { GercieLogger as logger } from '@/lib/logger';
import { z } from 'zod';

const RecommendationParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export async function GET(request: NextRequest) {
  // ✅ Initialiser le client (async factory)
  const supabase = await createClient();

  // Authentification requise : récupérer l'utilisateur via le token JWT
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Authentification requise pour les recommandations personnalisées.' },
      { status: 401 }
    );
  }

  // Extraire les paramètres de requête
  const { searchParams } = new URL(request.url);
  const params = Object.fromEntries(searchParams.entries());
  const parsed = RecommendationParamsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Récupérer les IDs des produits déjà interactés récemment (exclusion)
    const excludeIds: string[] = [];
    // Optionnel : tu peux ajouter une logique pour exclure les produits déjà vus aujourd'hui

    const recommendations = await getPersonalizedRecommendations(user.id, {
      limit: parsed.data.limit,
      excludeProductIds: excludeIds,
    });

    // Si aucune recommandation personnalisée (historique insuffisant), fallback vers les meilleures ventes
    if (!recommendations.length) {
      const { data: topProducts, error: topError } = await supabase
        .from('produits')
        .select('id, nom, prix, images') // ⚠️ colonne `ventes` → `total_ventes`, `image_url` → `images`
        .order('total_ventes', { ascending: false }) // ✅ Corrigé selon le schéma Supabase
        .limit(parsed.data.limit);

      if (topError) {
        throw topError;
      }

      return NextResponse.json({
        source: 'popular',
        recommendations: topProducts,
      });
    }

    // Récupérer les détails des produits recommandés
    const productIds = recommendations.map(r => r.product_id);
    const { data: products, error: productsError } = await supabase
      .from('produits')
      .select('id, nom, description, prix, images') // ⚠️ image_url → images
      .in('id', productIds);

    if (productsError) {
      throw productsError;
    }

    // Fusionner avec les scores
    const scoredProducts = products.map(p => {
      const rec = recommendations.find(r => r.product_id === p.id);
      return {
        ...p,
        score: rec?.score || 0,
      };
    }).sort((a, b) => b.score - a.score);

    return NextResponse.json({
      source: 'personalized',
      recommendations: scoredProducts,
    });
  } catch (error: any) {
    logger.error('Erreur API recommandations', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération des recommandations.' },
      { status: 500 }
    );
  }
}