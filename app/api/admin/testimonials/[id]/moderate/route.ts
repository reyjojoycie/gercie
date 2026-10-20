// app/api/admin/testimonials/[id]/moderate/route.ts
/**
 * Endpoint pour modérer un témoignage via l'IA.
 * Réservé aux administrateurs.
 * POST /api/admin/testimonials/:id/moderate
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { moderateText } from '@/lib/ai/moderation';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Vérifier que l'utilisateur est administrateur
  try {
    await requireAdmin();
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Accès non autorisé.' },
      { status: 403 }
    );
  }

  const testimonialId = params.id;

  if (!testimonialId) {
    return NextResponse.json(
      { error: 'ID du témoignage manquant.' },
      { status: 400 }
    );
  }

  try {
    // Récupérer le témoignage depuis la base de données
    const { data: testimonial, error: fetchError } = await supabaseAdmin
      .from('testimonials')
      .select('content, moderation_status')
      .eq('id', testimonialId)
      .single();

    if (fetchError || !testimonial) {
      return NextResponse.json(
        { error: 'Témoignage introuvable.' },
        { status: 404 }
      );
    }

    // Analyse de modération via l'IA
    const flagged = await moderateText(testimonial.content);

    // Mettre à jour le statut de modération et la date de modération
    const newStatus = flagged ? 'flagged' : 'approved';
    const { error: updateError } = await supabaseAdmin
      .from('testimonials')
      .update({
        moderation_status: newStatus,
        moderated_at: new Date().toISOString(),
      })
      .eq('id', testimonialId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      flagged,
      moderation_status: newStatus,
      message: flagged
        ? 'Contenu signalé comme inapproprié.'
        : 'Contenu approuvé.',
    });
  } catch (error: any) {
    logger.error(
      `Erreur lors de la modération du témoignage ${testimonialId}`,
      error
    );
    return NextResponse.json(
      { error: 'Erreur serveur lors de la modération.' },
      { status: 500 }
    );
  }
}