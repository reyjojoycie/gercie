// app/api/admin/produits/bulk-price/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const bulkPriceSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  pourcentage: z.number().min(-90).max(900), // entre -90% et +900%
})

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-bulk-price:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = bulkPriceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { ids, pourcentage } = parsed.data
  const coefficient = 1 + pourcentage / 100

  try {
    const supabase = await createClient(true)

    // Récupérer les anciens prix des produits concernés
    const { data: produits, error: fetchErr } = await supabase
      .from('produits')
      .select('id, prix')
      .in('id', ids)

    if (fetchErr) throw fetchErr
    if (!produits?.length) return NextResponse.json({ error: 'Aucun produit trouvé' }, { status: 404 })

    const ajustementId = crypto.randomUUID()

    // Mettre à jour les prix et enregistrer l'historique
    const updates = produits.map(p => ({
      id: p.id,
      prix: Math.round(p.prix * coefficient),
    }))

    const historiques = produits.map(p => ({
      produit_id: p.id,
      ancien_prix: p.prix,
      nouveau_prix: Math.round(p.prix * coefficient),
      ajustement_id: ajustementId,
    }))

    // Exécuter les mises à jour en parallèle
    await Promise.all(updates.map(u => supabase.from('produits').update({ prix: u.prix }).eq('id', u.id)))
    await supabase.from('historique_prix').insert(historiques)

    return NextResponse.json({
      success: true,
      ajustementId,
      produits: updates.map((u, i) => ({
        id: u.id,
        ancienPrix: historiques[i].ancien_prix,
        nouveauPrix: u.prix,
      })),
    })
  } catch (error: any) {
    logger.error('Crash POST bulk-price', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Route pour annuler un ajustement précédent
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-bulk-price-delete:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const ajustementId = searchParams.get('ajustementId')
  if (!ajustementId) return NextResponse.json({ error: 'ajustementId requis' }, { status: 400 })

  try {
    const supabase = await createClient(true)

    // Récupérer les historiques de cet ajustement
    const { data: historiques, error: histErr } = await supabase
      .from('historique_prix')
      .select('produit_id, ancien_prix')
      .eq('ajustement_id', ajustementId)

    if (histErr || !historiques?.length) return NextResponse.json({ error: 'Ajustement introuvable' }, { status: 404 })

    // Restaurer les anciens prix
    await Promise.all(historiques.map(h => supabase.from('produits').update({ prix: h.ancien_prix }).eq('id', h.produit_id)))

    // Supprimer l'historique de cet ajustement
    await supabase.from('historique_prix').delete().eq('ajustement_id', ajustementId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Crash DELETE bulk-price', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}