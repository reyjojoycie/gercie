import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// ✅ Pas de force-static pour éviter les conflits
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    console.log('[PROVINCES] Requête reçue')
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('provinces')
      .select('id, nom')
      .order('nom')

    if (error) {
      console.error('[PROVINCES] Erreur DB:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[PROVINCES] OK:', data?.length, 'provinces')
    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[PROVINCES] Crash:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}