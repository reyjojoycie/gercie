import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/categories
 *
 * Récupère les catégories publiques depuis Supabase.
 *
 * Query Params:
 * - ?accueil=true
 *   Retourne uniquement les catégories :
 *   - actives
 *   - marquées pour l'accueil
 *
 * - aucun paramètre
 *   Retourne toutes les catégories actives.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const accueilOnly = searchParams.get('accueil') === 'true'

    // Client anonyme : respecte la RLS Supabase
    const supabase = await createClient(false)

    let query = supabase
      .from('categories')
      .select(`
        id,
        nom,
        slug,
        parent_id,
        image_url,
        icone,
        description,
        chemin_complet,
        ordre,
        actif,
        afficher_accueil,
        ordre_accueil
      `)

    if (accueilOnly) {
      /**
       * Mode page d'accueil :
       * - la catégorie doit être active
       * - la catégorie doit être marquée pour l'accueil
       */
      query = query
        .eq('actif', true)
        .eq('afficher_accueil', true)
        .order('ordre_accueil', { ascending: true })
        .order('ordre', { ascending: true })
        .order('nom', { ascending: true })
    } else {
      /**
       * Mode public global :
       * navbar, pages catégories, recherche, etc.
       */
      query = query
        .eq('actif', true)
        .order('ordre', { ascending: true })
        .order('nom', { ascending: true })
    }

    const { data, error } = await query

    if (error) {
      console.error('[API /categories] Erreur Supabase:', error)

      return NextResponse.json(
        {
          error: 'Erreur lors de la récupération des catégories',
          details: error.message,
        },
        { status: 500 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[API /categories] accueilOnly:', accueilOnly)
      console.log('[API /categories] nombre de catégories:', data?.length ?? 0)
    }

    return NextResponse.json(data || [], {
      headers: {
        // En développement : pas de cache, pour voir les changements immédiatement.
        // En production : cache court pour éviter de surcharger la base.
        'Cache-Control':
          process.env.NODE_ENV === 'production'
            ? 'public, s-maxage=60, stale-while-revalidate=300'
            : 'no-store, must-revalidate',
      },
    })
  } catch (error: any) {
    console.error('[API /categories] Crash:', error)

    return NextResponse.json(
      {
        error: 'Erreur interne du serveur',
        details: error?.message || String(error),
      },
      { status: 500 }
    )
  }
}