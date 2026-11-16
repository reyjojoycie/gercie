// app/api/ai/admin/price-suggestion/route.ts
// Suggère un prix optimal pour un produit – réservé aux administrateurs.
// ---------------------------------------------------------------------------
import { NextRequest } from 'next/server';
import { suggestOptimalPrice } from '@/lib/ai/priceOptimizer';
import { requireAdminApi } from '@/lib/auth/adminGuard';
import { successResponse, errorResponse, validationErrorResponse } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const PriceSuggestionRequestSchema = z.object({
  productId: z.string().uuid('ID produit invalide'),
});

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdminApi();
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Corps JSON invalide.', 400);
  }

  const parsed = PriceSuggestionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  try {
    const suggestion = await suggestOptimalPrice(parsed.data.productId);
    return successResponse(suggestion);
  } catch (error: any) {
    logger.error('Erreur suggestion de prix', error);
    return errorResponse('Erreur lors de la suggestion de prix.', 500);
  }
}
