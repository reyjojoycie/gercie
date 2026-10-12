// app/api/produits/route.ts
import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const categorie = searchParams.get('categorie')
  const categoriePrefix = searchParams.get('categorie_prefix')
  const search = searchParams.get('search')
  const minPrice = searchParams.get('min_price')
  const maxPrice = searchParams.get('max_price')
  const sortBy = searchParams.get('sort_by') || 'created_at'
  const sortOrder = searchParams.get('sort_order') || 'desc'

  const supabase = await createClient()
  let query = supabase
    .from('produits')
    .select('*')
    .eq('est_actif', true)

  if (categorie) {
    query = query.eq('categorie', categorie)
  }
  if (categoriePrefix) {
    query = query.ilike('categorie', `${categoriePrefix}%`)
  }
  if (search) {
    query = query.ilike('nom', `%${search}%`)
  }
  if (minPrice) {
    query = query.gte('prix', parseFloat(minPrice))
  }
  if (maxPrice) {
    query = query.lte('prix', parseFloat(maxPrice))
  }

  const orderColumn = sortBy === 'prix' ? 'prix' : 'created_at'
  query = query.order(orderColumn, { ascending: sortOrder === 'asc' })

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// La méthode POST est supprimée : seul l'admin peut créer des produits via /api/admin/produits