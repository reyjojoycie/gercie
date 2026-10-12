import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// ✅ DYNAMIQUE
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const villeId = searchParams.get('ville_id')

    console.log('[COMMUNES] Requête reçue, ville_id:', villeId)

    if (!villeId) {
      console.error('[COMMUNES] ville_id manquant')
      return NextResponse.json(
        { error: 'ville_id requis' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('communes')
      .select('id, nom, ville_id')
      .eq('ville_id', villeId)
      .order('nom')

    if (error) {
      console.error('[COMMUNES] Erreur DB:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[COMMUNES] OK:', data?.length, 'communes pour ville', villeId)
    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[COMMUNES] Crash:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}