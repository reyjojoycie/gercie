// app/api/ai/product-summary/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { openai } from '@/lib/ai/openaiClient';
import logger from '@/lib/logger';
import { createServiceClient as supabaseServer } from '@/lib/supabaseServer'; // ✅ Import corrigé

const requestSchema = z.object({
  productId: z.string().uuid('ID produit invalide'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }

    const { productId } = parsed.data;

    // ✅ Appel de la fonction avec les parenthèses ()
    const supabase = await supabaseServer();
    
    const { data: product, error } = await supabase
      .from('produits')
      .select('nom, description')
      .eq('id', productId)
      .single();

    if (error || !product) {
      return NextResponse.json({ error: 'Produit non trouvé' }, { status: 404 });
    }

    const prompt = `Rédige un résumé accrocheur et commercial en français (max 100 mots) pour le produit suivant :
Nom : ${product.nom}
Description : ${product.description || 'Aucune description disponible.'}`;

    const completion = await openai.chat.completions.create({
      model: process.env.AI_CHAT_MODEL || 'llama-3.1-70b-versatile', // ✅ Modèle corrigé
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 150,
    });

    const summary = completion.choices[0]?.message?.content || '';

    return NextResponse.json({ summary });
  } catch (error: any) {
    logger.error('Erreur génération résumé produit', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}