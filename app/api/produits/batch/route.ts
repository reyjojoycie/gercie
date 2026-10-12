import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('ids')
  if (!idsParam) return NextResponse.json({ error: 'ids requis' }, { status: 400 })
  const ids = idsParam.split(',').filter(Boolean).map(id => id.trim())

  const supabase = await createClient(true)
  const { data, error } = await supabase
    .from('produits')
    .select('id, nom, prix, prix_promo, images, categorie, total_ventes, note_moyenne, stock, remise_percent')
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}