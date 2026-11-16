// app/api/ai/admin/fraud-score/route.ts
// Obtient le score de fraude d'une commande – réservé aux administrateurs.
// Combine règles heuristiques et analyse IA.
// ---------------------------------------------------------------------------
import { NextRequest } from 'next/server';
import { calculateFraudScore } from '@/lib/ai/fraudDetection';
import { requireAdminApi } from '@/lib/auth/adminGuard';
import { successResponse, errorResponse, validationErrorResponse } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const FraudScoreRequestSchema = z.object({
  orderId: z.string().uuid('ID de commande invalide'),
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

  const parsed = FraudScoreRequestSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  try {
    const assessment = await calculateFraudScore(parsed.data.orderId);
    return successResponse(assessment);
  } catch (error: any) {
    logger.error('Erreur score fraude', error);
    return errorResponse('Erreur lors du calcul du score de fraude.', 500);
  }
}
