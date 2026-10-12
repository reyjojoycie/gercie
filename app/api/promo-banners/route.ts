import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient(false)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('promo_banners')
    .select('message, lien')
    .eq('actif', true)
    .or(`date_debut.is.null,date_debut.lte.${now}`)
    .or(`date_fin.is.null,date_fin.gte.${now}`)
    .order('ordre')
  if (error) return NextResponse.json([])
  return NextResponse.json(data || [])
}