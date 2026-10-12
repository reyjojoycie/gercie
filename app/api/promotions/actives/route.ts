import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient(false)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('promotions')
    .select('produit_id, prix_promo, date_fin, produit:produit_id(nom, prix, images)')
    .eq('actif', true)
    .lte('date_debut', now)
    .gte('date_fin', now)
    .order('date_fin', { ascending: true })

  if (error) {
    return NextResponse.json([])
  }

  const deals = (data || []).map((p: any) => ({
    id: p.produit_id,
    title: p.produit?.nom ?? 'Produit',
    prix_normal: p.produit?.prix,
    prix_promo: p.prix_promo,
    image: p.produit?.images?.[0] ?? '/placeholder.jpg',
    date_fin: p.date_fin,
  }))

  return NextResponse.json(deals)
}