// app/api/ai/search/route.ts
// Endpoint public de recherche sémantique.
// Méthode : GET ou POST avec query, options de pagination, mode hybride.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { hybridSearch, ScoredProduct } from '@/lib/ai/semanticSearch';
import { GercieLogger } from '@/lib/ai/utils/logger'
import { z } from 'zod';

// Schéma de validation des paramètres
const SearchParamsSchema = z.object({
  q: z.string().min(1, 'Le paramètre "q" est requis').max(500),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minScore: z.coerce.number().min(0).max(1).default(0),
  textWeight: z.coerce.number().min(0).max(1).default(0.3),
  semanticWeight: z.coerce.number().min(0).max(1).default(0.7),
  onlySemantic: z.coerce.boolean().default(false),
  onlyText: z.coerce.boolean().default(false),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const params = Object.fromEntries(searchParams.entries());

  const parsed = SearchParamsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const results: ScoredProduct[] = await hybridSearch(parsed.data.q, {
      limit: parsed.data.limit,
      minScore: parsed.data.minScore,
      textWeight: parsed.data.textWeight,
      semanticWeight: parsed.data.semanticWeight,
      onlySemantic: parsed.data.onlySemantic,
      onlyText: parsed.data.onlyText,
    });

    return NextResponse.json({
      query: parsed.data.q,
      count: results.length,
      results,
    });
  } catch (error: any) {
    logger.error('Erreur API recherche sémantique', error);
    return NextResponse.json(
      { error: 'Erreur lors de la recherche sémantique.' },
      { status: 500 }
    );
  }
}

// Optionnel : support POST pour les requêtes complexes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SearchParamsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Paramètres invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const results = await hybridSearch(parsed.data.q, {
      limit: parsed.data.limit,
      minScore: parsed.data.minScore,
      textWeight: parsed.data.textWeight,
      semanticWeight: parsed.data.semanticWeight,
      onlySemantic: parsed.data.onlySemantic,
      onlyText: parsed.data.onlyText,
    });

    return NextResponse.json({
      query: parsed.data.q,
      count: results.length,
      results,
    });
  } catch (error: any) {
    logger.error('Erreur API recherche sémantique (POST)', error);
    return NextResponse.json(
      { error: 'Erreur lors de la recherche sémantique.' },
      { status: 500 }
    );
  }
}