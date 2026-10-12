// app/api/points-retrait/route.ts
import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const commune_id = searchParams.get('commune_id')
    const search = searchParams.get('search')

    const supabase = await createClient(true)

    let query = supabase
      .from('points_retrait')
      .select('*')
      .eq('est_actif', true)
      .order('nom')

    // Filtre par commune
    if (commune_id) {
      const id = parseInt(commune_id)
      if (!isNaN(id)) {
        query = query.eq('commune_id', id)
      }
    }

    // Recherche textuelle sécurisée
    if (search && search.trim().length > 0) {
      // Échapper les guillemets doubles et les antislashs
      const safeSearch = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const pattern = `%${safeSearch}%`

      // Colonnes dans lesquelles chercher
      const columns = [
        'nom',
        'adresse',
        'province_nom',
        'ville_nom',
        'quartier',
        'points_de_repere',
        'type_etablissement',
        'contact_nom',
      ]

      // Construire les conditions avec guillemets pour protéger le motif
      const conditions = columns
        .map((col) => `${col}.ilike."${pattern}"`)
        .join(', ')

      query = query.or(conditions)
    }

    const { data, error } = await query.limit(50)

    if (error) {
      console.error('❌ Erreur Supabase points-retrait:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('💥 Exception points-retrait:', err)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
