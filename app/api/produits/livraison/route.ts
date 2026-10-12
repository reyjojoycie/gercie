// app/api/produits/livraison/route.ts
import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('ids')
  if (!idsParam) return NextResponse.json({ error: 'Paramètre ids requis' }, { status: 400 })

  const ids = idsParam.split(',').filter(Boolean).map(id => id.trim())

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('produits')
      .select(
        'id, livraison_domicile, livraison_point_retrait, livraison_express, express_gratuit, livraison_domicile_active, livraison_point_retrait_active, livraison_express_active'
      )
      .in('id', ids)

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}