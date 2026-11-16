// app/api/ai/admin/generate-description/route.ts
// Génération de description produit par IA – réservé à l'administration.
// Accepte des informations basiques et retourne un texte prêt à l'emploi.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { generateProductDescription } from '@/lib/ai/contentGenerator';
import { requireAdminApi } from '@/lib/auth/adminGuard';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const DescriptionRequestSchema = z.object({
  productName: z.string().min(1, 'Nom du produit requis'),
  category: z.string().optional(),
  attributes: z.string().optional(),
  language: z.enum(['fr', 'en', 'ar']).optional().default('fr'),
});

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdminApi();
  if (authError) return authError;

  // Valider le corps de la requête
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const parsed = DescriptionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const description = await generateProductDescription(
      parsed.data.productName,
      parsed.data.category,
      parsed.data.attributes
    );

    return NextResponse.json({ description });
  } catch (error: any) {
    logger.error('Erreur génération description IA', error);
    return NextResponse.json(
      { error: 'Échec de la génération de description.' },
      { status: 500 }
    );
  }
}
