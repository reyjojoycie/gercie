// app/api/ai/admin/price-suggestion/route.ts
// Suggère un prix optimal pour un produit – réservé aux administrateurs.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { suggestOptimalPrice } from '@/lib/ai/priceOptimizer';
import { supabaseServer } from '@/lib/supabaseServer';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const PriceSuggestionRequestSchema = z.object({
  productId: z.string().uuid('ID produit invalide'),
});

export async function POST(request: NextRequest) {
  // Vérification admin
  const {
    data: { user },
    error: authError,
  } = await supabaseServer.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseServer
    .from('utilisateurs')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userError || !userData || userData.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs.' }, { status: 403 });
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