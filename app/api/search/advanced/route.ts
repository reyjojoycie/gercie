// app/api/search/advanced/route.ts
// Recherche avancée – supporte le mode 'smart' (IA multi-intentions) par défaut,
// ainsi que les modes legacy (text, semantic, hybrid).
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchProducts } from '@/lib/searchEngine';
import { hybridSearch, smartSearch } from '@/lib/ai/semanticSearch';
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit';
import { createServiceClient as supabaseServer } from '@/lib/supabaseServer';
import logger from '@/lib/logger';

// Schéma de validation enrichi
const searchParamsSchema = z.object({
  query: z.string().optional().default(''),
  q: z.string().optional(), // Fallback si le front envoie 'q'
  mode: z.enum(['smart', 'text', 'semantic', 'hybrid']).optional().default('smart'),
  category: z.string().optional(),
  categoryPrefix: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sortBy: z.enum(['prix', 'created_at', 'pertinence']).optional().default('pertinence'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(12),
  textWeight: z.coerce.number().min(0).max(1).optional().default(0.3),
  semanticWeight: z.coerce.number().min(0).max(1).optional().default(0.7),
  minScore: z.coerce.number().min(0).max(1).optional().default(0.01),
});

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  
  // Rate limiting : 30 requêtes par minute
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `search-advanced:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
    banDurationSeconds: 300,
  });

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Veuillez patienter.' }, { status: 429 }),
      rateLimitHeaders
    );
  }

  const { searchParams } = new URL(request.url);
  const rawParams: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => { rawParams[key] = value; });
  
  // Support adaptatif 'q' -> 'query'
  if (rawParams['q'] && !rawParams['query']) {
    rawParams['query'] = rawParams['q'];
  }

  const parsed = searchParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  let {
    query, mode, category, categoryPrefix, minPrice, maxPrice,
    sortBy, sortOrder, page, limit, textWeight, semanticWeight, minScore
  } = parsed.data;

  // =========================================================================
  // MODE SMART (IA Multi-intentions + Produits compatibles)
  // =========================================================================
  if (mode === 'smart') {
    try {
      if (!query.trim()) {
        // Si requête vide, on retombe sur le catalogue classique
        mode = 'text'; 
      } else {
        const smartResult = await smartSearch(query, { limit: 50 });
        
        // Collecter tous les IDs pour hydrater en une seule requête Supabase
        const mainIds = smartResult.results.map(r => r.product_id);
        const compatIds = smartResult.compatible.map(r => r.product_id);
        const allIds = Array.from(new Set([...mainIds, ...compatIds]));

        let productsMap = new Map<string, any>();
        if (allIds.length > 0) {
          const { data: products, error } = await supabaseServer()
            .from('produits')
            .select('*')
            .in('id', allIds);
          
          if (!error && products) {
            products.forEach(p => productsMap.set(p.id, p));
          }
        }

        // Hydrater les résultats principaux
        const hydratedResults = mainIds
          .map(id => productsMap.get(id))
          .filter(Boolean)
          .slice(0, limit);

        // Hydrater les produits compatibles
        const hydratedCompatible = compatIds
          .map(id => productsMap.get(id))
          .filter(Boolean)
          .slice(0, 8);

        return NextResponse.json({
          data: hydratedResults,
          compatible: hydratedCompatible,
          intents: smartResult.intents,
          source: smartResult.source,
          pagination: {
            page: 1,
            limit: limit,
            total: hydratedResults.length,
            totalPages: 1,
          },
          facets: {},
        });
      }
    } catch (error: any) {
      logger.error('Erreur mode smart, bascule sur texte', error);
      mode = 'text'; // Fallback gracieux
    }
  }

  // =========================================================================
  // MODE TEXTE CLASSIQUE (Fallback ou choix explicite)
  // =========================================================================
  if (mode === 'text') {
    const offset = (page - 1) * limit;
    try {
      const result = await searchProducts({
        query, category, categoryPrefix, minPrice, maxPrice,
        sortBy, sortOrder, limit, offset,
      });
      return NextResponse.json({
        data: result.results,
        pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
        facets: result.facets,
      });
    } catch (error: any) {
      logger.warn('Échec Meilisearch/Texte, bascule sur Hybride', error);
      mode = 'hybrid';
    }
  }

  // =========================================================================
  // MODE SÉMANTIQUE / HYBRIDE (Legacy)
  // =========================================================================
  if (mode === 'semantic' || mode === 'hybrid') {
    try {
      const isSemanticPure = mode === 'semantic';
      const results = await hybridSearch(query || '', {
        limit: 100,
        minScore: 0.01,
        textWeight: isSemanticPure ? 0 : textWeight,
        semanticWeight: isSemanticPure ? 1 : semanticWeight,
        onlySemantic: isSemanticPure,
      });

      if (!results || !results.length) {
        return NextResponse.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 }, facets: {} });
      }

      const productIds = results.map((s) => s.product_id).filter(Boolean);
      const { data: products, error: prodError } = await supabaseServer()
        .from('produits')
        .select('*')
        .in('id', productIds);

      if (prodError || !products) {
        return NextResponse.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 }, facets: {} });
      }

      const blendedData = products.map((p) => {
        const matchScore = results.find((s) => s.product_id === p.id);
        return { ...p, _score: matchScore?.score || 0 };
      }).sort((a, b) => productIds.indexOf(a.id) - productIds.indexOf(b.id));

      let filteredData = blendedData;
      if (typeof minPrice === 'number') filteredData = filteredData.filter(p => p.prix >= minPrice);
      if (typeof maxPrice === 'number') filteredData = filteredData.filter(p => p.prix <= maxPrice);

      const total = filteredData.length;
      const offset = (page - 1) * limit;
      const pagedData = filteredData.slice(offset, offset + limit);

      return NextResponse.json({
        data: pagedData,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        facets: {},
      });
    } catch (error: any) {
      logger.error('Erreur critique mode hybride', error);
      return NextResponse.json({ error: 'Erreur de recherche', details: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Mode inconnu' }, { status: 400 });
}