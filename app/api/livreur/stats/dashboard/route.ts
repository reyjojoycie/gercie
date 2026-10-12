// app/api/livreur/stats/dashboard/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { requireLivreur } from '@/lib/auth/livreurGuard'

export async function GET() {
  try {
    // Vérifie que l'utilisateur est un livreur authentifié
    const livreur = await requireLivreur()
    const livreurId = livreur.id

    const supabase = await createClient(true)

    // Récupère toutes les livraisons du livreur
    const { data: livraisons, error } = await supabase
      .from('livraisons')
      .select('id, statut')
      .eq('livreur_id', livreurId)

    if (error) {
      console.error('Erreur Supabase (livraisons):', error)
      return NextResponse.json({ error: 'Erreur lors de la récupération des données' }, { status: 500 })
    }

    const total = livraisons?.length || 0

    // Statuts utilisés dans Gercie :
    // 'acceptee'       -> le livreur a accepté la course
    // 'colis_recupere' -> les articles sont récupérés (en cours de livraison)
    // 'livree'         -> livraison terminée avec succès
    const terminees = livraisons?.filter(l => l.statut === 'livree').length || 0
    const enCours = livraisons?.filter(l => l.statut === 'acceptee' || l.statut === 'colis_recupere').length || 0

    // Facultatif : vous pouvez aussi calculer le taux de succès
    const tauxSucces = total > 0 ? ((terminees / total) * 100).toFixed(1) : 0

    return NextResponse.json({
      success: true,
      stats: {
        total,
        terminees,
        enCours,
        tauxSucces,
      },
    })
  } catch (err: any) {
    console.error('Erreur Critique Dashboard:', err)
    return NextResponse.json(
      { error: 'Erreur interne du serveur', details: err.message },
      { status: 500 }
    )
  }
}