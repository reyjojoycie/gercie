// app/api/recommendations/route.ts
// Recommandations produits – supporte les types : trending, ai-personalized, hybrid, history, similar-to-cart
// ---------------------------------------------------------------------------
import { createClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPersonalizedRecommendations } from '@/lib/ai/personalizationEngine';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Validation des paramètres
// ---------------------------------------------------------------------------
const querySchema = z.object({
  type: z
    .enum(['ai-personalized', 'trending', 'hybrid', 'history', 'similar-to-cart'])
    .default('trending'),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  fallback: z.coerce.boolean().default(true), // si true, complète avec des tendances quand l'historique est insuffisant
});

// ---------------------------------------------------------------------------
// Route GET
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  // 1. Parsing des paramètres
  const { searchParams } = new URL(request.url);
  const rawParams = {
    type: searchParams.get('type') ?? 'trending',
    limit: searchParams.get('limit') ?? 10,
    fallback: searchParams.get('fallback') ?? 'true',
  };

  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
  }

  const { type, limit, fallback } = parsed.data;

  // 2. Connexion Supabase (service_role pour accéder aux données)
  const supabase = await createClient(true);

  // 3. Récupération de l'utilisateur connecté (optionnel)
  let userId: string | null = null;
  try {
    const supabaseAuth = await createClient(false);
    const {
      data: { session },
    } = await supabaseAuth.auth.getSession();
    userId = session?.user?.id ?? null;
  } catch (error) {
    logger.error('Erreur récupération utilisateur:', error);
  }

  logger.info('📊 Recommandations demandées', { type, limit, userId });

  // 4. Exécution selon le type
  try {
    let products: any[] = [];

    switch (type) {
      // -----------------------------------------------------------------------
      // PERSONNALISÉES (IA)
      // -----------------------------------------------------------------------
      case 'ai-personalized': {
        if (!userId) {
          // Pas d'utilisateur → fallback vers les tendances (si autorisé)
          products = fallback ? await getTrendingProducts(supabase, limit) : [];
        } else {
          logger.info('🧠 Recommandations personnalisées pour', userId);
          // Appel du moteur IA
          const recs = await getPersonalizedRecommendations(userId, { limit });
          if (recs.length === 0 && fallback) {
            // Aucune recommandation personnalisée (historique vide)
            products = await getTrendingProducts(supabase, limit);
          } else {
            // Récupération des détails produits
            const ids = recs.map(r => r.product_id);
            const { data: prodData, error } = await supabase
              .from('produits')
              .select('id, nom, prix, images, categorie')
              .in('id', ids);

            if (error) throw error;

            // Fusion avec les scores
            const scoreMap = new Map(recs.map(r => [r.product_id, r.score]));
            products = (prodData || []).map((p: any) => ({
              id: p.id,
              nom: p.nom,
              prix: p.prix,
              images: p.images || [],
              categorie: p.categorie,
              score: scoreMap.get(p.id) || 0,
              vendeur: { boutique_nom: 'Gercie' },
            }));
            // Tri par score décroissant
            products.sort((a, b) => b.score - a.score);
          }
        }
        break;
      }

      // -----------------------------------------------------------------------
      // HYBRIDE (personnalisé + tendances) – utile pour les pages d'accueil
      // -----------------------------------------------------------------------
      case 'hybrid': {
        if (!userId) {
          products = await getTrendingProducts(supabase, limit);
        } else {
          const recs = await getPersonalizedRecommendations(userId, { limit: Math.ceil(limit / 2) });
          const personalizedIds = recs.map(r => r.product_id);
          const trending = await getTrendingProducts(supabase, limit);
          // On garde les personnalisés d'abord, puis on complète avec les tendances (en évitant les doublons)
          const trendingFiltered = trending.filter((p: any) => !personalizedIds.includes(p.id));
          // Fusion
          products = [
            ...recs.map(r => ({
              id: r.product_id,
              score: r.score,
              source: 'personalized',
            })),
            ...trendingFiltered.map((p: any) => ({
              ...p,
              source: 'trending',
            })),
          ].slice(0, limit);
          // Récupération des détails complets pour les personnalisés
          const personalizedMissing = products.filter(p => !p.nom).map(p => p.id);
          if (personalizedMissing.length > 0) {
            const { data: details } = await supabase
              .from('produits')
              .select('id, nom, prix, images, categorie')
              .in('id', personalizedMissing);
            if (details) {
              products = products.map(p => {
                const detail = details.find(d => d.id === p.id);
                if (detail) {
                  return { ...p, ...detail, vendeur: { boutique_nom: 'Gercie' } };
                }
                return p;
              });
            }
          }
          // S'assurer que les tendances ont la structure attendue
          products = products.map(p => ({
            ...p,
            vendeur: p.vendeur || { boutique_nom: 'Gercie' },
          }));
        }
        break;
      }

      // -----------------------------------------------------------------------
      // TENDANCES (produits récents)
      // -----------------------------------------------------------------------
      case 'trending': {
        logger.info('🔥 Produits tendances');
        products = await getTrendingProducts(supabase, limit);
        break;
      }

      // -----------------------------------------------------------------------
      // HISTORIQUE (à implémenter plus tard)
      // -----------------------------------------------------------------------
      case 'history': {
        // Pourrait utiliser user_interactions pour suggérer des produits vus récemment
        products = [];
        break;
      }

      // -----------------------------------------------------------------------
      // SIMILAIRE AU PANIER (à implémenter plus tard)
      // -----------------------------------------------------------------------
      case 'similar-to-cart': {
        // Pourrait utiliser les embeddings des produits du panier
        products = [];
        break;
      }

      default:
        break;
    }

    logger.info(`✅ ${products.length} produits retournés`);
    return NextResponse.json(products);
  } catch (error: any) {
    logger.error('💥 Erreur dans le traitement des recommandations', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des recommandations' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Récupère les produits les plus récents (tendances).
 */
async function getTrendingProducts(supabase: any, limit: number) {
  logger.info('📡 Requête produits tendances...');
  const { data, error } = await supabase
    .from('produits')
    .select('id, nom, prix, images, categorie')
    .eq('est_actif', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('❌ Erreur Supabase produits:', error.message);
    throw error;
  }

  logger.info(`📦 ${data.length} produits récupérés`);
  return data.map((p: any) => ({
    id: p.id,
    nom: p.nom,
    prix: p.prix,
    images: p.images || [],
    categorie: p.categorie,
    vendeur: { boutique_nom: 'Gercie' },
  }));
}