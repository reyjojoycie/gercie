// app/api/ai/admin/price-suggestion/route.ts
// Suggère un prix optimal pour un produit – réservé aux administrateurs.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { suggestOptimalPrice } from '@/lib/ai/priceOptimizer';
import { NextRequest, NextResponse } from 'next/server';
import { suggestOptimalPrice } from '@/lib/ai/priceOptimizer';
import { requireAdmin } from '@/lib/auth/adminGuard'; // Import requireAdmin
import { logger } from '@/lib/logger';
import { MESSAGES } from '@/lib/constants'; // Import MESSAGES
import { z } from 'zod';

const PriceSuggestionRequestSchema = z.object({
  productId: z.string().uuid('ID produit invalide'),
});

export async function POST(request: NextRequest) {
  // Vérification admin centralisée
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === MESSAGES.NON_AUTHENTIFIE ? 401 : 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const parsed = PriceSuggestionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const suggestion = await suggestOptimalPrice(parsed.data.productId);
    return NextResponse.json(suggestion);
  } catch (error: any) {
    logger.error('Erreur suggestion de prix', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suggestion de prix.' },
      { status: 500 }
    );
  }
}
