import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { requireLivreur } from '@/lib/auth/livreurGuard';
import { z } from 'zod';
import { sendNotification } from '@/lib/notifications';
import logger from '@/lib/logger';
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit';

// --------------------------------------------------------------------------
// GET – Liste des courses disponibles (CORRIGÉ)
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const { allowed, headers } = rateLimit({ id: `courses-list:${ip}`, maxRequests: 30 });
  if (!allowed) return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 }), headers);

  try {
    await requireLivreur();
    const supabase = await createClient(true);

    // 1. Récupérer les IDs des commandes déjà associées à une livraison pour les exclure
    const { data: dejaPrises, error: exclusionError } = await supabase
      .from('livraisons')
      .select('commande_id');

    if (exclusionError) throw exclusionError;

    const idsExclus = dejaPrises?.map(l => l.commande_id) || [];

    // 2. Récupérer les commandes payées non livrées
    let query = supabase
      .from('commandes')
      .select(`
        id,
        numero_commande,
        total_global,
        type_livraison,
        adresse_livraison,
        point_retrait_id,
        commune_livraison_id,
        created_at,
        points_retrait ( nom, adresse ),
        communes ( nom )
      `)
      .eq('statut', 'payee');

    // Appliquer l'exclusion si des commandes sont déjà prises
    if (idsExclus.length > 0) {
      query = query.not('id', 'in', `(${idsExclus.join(',')})`);
    }

    const { data: courses, error } = await query
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Erreur récupération courses', error);
      return NextResponse.json({ error: 'Erreur lors de la récupération' }, { status: 500 });
    }

    const formatted = (courses || []).map((c: any) => ({
      id: c.id,
      numero: c.numero_commande,
      total: c.total_global,
      type_livraison: c.type_livraison,
      adresse: c.type_livraison === 'domicile' ? c.adresse_livraison : c.points_retrait?.adresse,
      commune: c.communes?.nom,
      point_retrait_nom: c.type_livraison === 'point_retrait' ? c.points_retrait?.nom : null,
      date: c.created_at,
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    logger.error('Erreur GET courses', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST – Accepter une course (INCHANGÉ - Fonctionnel)
// ---------------------------------------------------------------------------
const acceptSchema = z.object({
  course_id: z.string().uuid(),
  current_lat: z.number().min(-90).max(90).optional(),
  current_lng: z.number().min(-180).max(180).optional(),
});

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `course-accept:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  });
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    );
  }

  try {
    const livreur = await requireLivreur();
    const livreurId = livreur.id;
    const supabase = await createClient(true);

    const body = await request.json();
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 });

    const { course_id } = parsed.data;

    const { data: commande, error: cmdError } = await supabase
      .from('commandes')
      .select('statut, numero_commande')
      .eq('id', course_id)
      .single();
    
    if (cmdError || !commande) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    if (commande.statut !== 'payee') return NextResponse.json({ error: 'Commande non disponible' }, { status: 400 });

    const { data: existing } = await supabase
      .from('livraisons')
      .select('id')
      .eq('commande_id', course_id)
      .maybeSingle();
    
    if (existing) return NextResponse.json({ error: 'Cette commande a déjà été prise' }, { status: 400 });

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const codeLivreur = Math.floor(100000 + Math.random() * 900000).toString();

    const { data: livraison, error: insertError } = await supabase
      .from('livraisons')
      .insert({
        commande_id: course_id,
        livreur_id: livreurId,
        statut: 'acceptee',
        code_pin: pin,
        code_livreur: codeLivreur,
        tentatives_code: 0,
        acceptee_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    await supabase.from('commandes').update({ statut: 'collecte' }).eq('id', course_id);

    await sendNotification(livreurId, {
      type: 'livraison',
      title: 'Course acceptée',
      body: `Vous avez accepté la commande #${commande.numero_commande}.`,
      data: { commande_id: course_id },
      channels: ['email', 'in_app'],
    });

    return applyRateLimitHeaders(NextResponse.json(livraison), rateLimitHeaders);
  } catch (error: any) {
    logger.error('Erreur POST courses', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}