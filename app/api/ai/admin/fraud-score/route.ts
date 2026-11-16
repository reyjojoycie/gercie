// app/api/ai/admin/fraud-score/route.ts
// Obtient le score de fraude d'une commande – réservé aux administrateurs.
// Combine règles heuristiques et analyse IA.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { calculateFraudScore } from '@/lib/ai/fraudDetection';
import { requireAdminApi } from '@/lib/auth/adminGuard';
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
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const parsed = FraudScoreRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const assessment = await calculateFraudScore(parsed.data.orderId);
    return NextResponse.json(assessment);
  } catch (error: any) {
    logger.error('Erreur score fraude', error);
    return NextResponse.json(
      { error: 'Erreur lors du calcul du score de fraude.' },
      { status: 500 }
    );
  }
}
