import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// ✅ DYNAMIQUE (pas de force-static) car dépend du query param
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const provinceId = searchParams.get('province_id')

    console.log('[VILLES] Requête reçue, province_id:', provinceId)

    // ✅ Validation minimale
    if (!provinceId) {
      console.error('[VILLES] province_id manquant')
      return NextResponse.json(
        { error: 'province_id requis' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('villes')
      .select('id, nom, province_id')
      .eq('province_id', provinceId)
      .order('nom')

    if (error) {
      console.error('[VILLES] Erreur DB:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[VILLES] OK:', data?.length, 'villes pour province', provinceId)
    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[VILLES] Crash:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}