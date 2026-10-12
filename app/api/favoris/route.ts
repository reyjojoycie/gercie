// app/api/favoris/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  // ✅ Ne plus renvoyer 401, simplement false
  if (!user) {
    return NextResponse.json({ isFavorite: false })
  }

  const { searchParams } = new URL(request.url)
  const produit_id = searchParams.get('produit_id')

  const supabase = await createClient()

  try {
    if (produit_id) {
      // Vérifier si ce produit est en favori
      const { data, error } = await supabase
        .from('favoris')
        .select('id')
        .eq('user_id', user.id)
        .eq('produit_id', produit_id)
        .maybeSingle()

      if (error) {
        console.error('Erreur vérification favori:', error)
        return NextResponse.json({ isFavorite: false })
      }
      return NextResponse.json({ isFavorite: !!data })
    } else {
      // Liste des favoris avec détails produits
      const { data, error } = await supabase
        .from('favoris')
        .select(`
          produit_id,
          produits (*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Erreur liste favoris:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const produits = data.map(f => f.produits).filter(p => p !== null)
      return NextResponse.json(produits)
    }
  } catch (err) {
    console.error('Erreur inattendue:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { produit_id } = await request.json()
  if (!produit_id) {
    return NextResponse.json({ error: 'Produit requis' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('favoris')
    .insert({ user_id: user.id, produit_id })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Déjà en favoris' }, { status: 409 })
    }
    console.error('Erreur insertion favori:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const produit_id = searchParams.get('produit_id')
  if (!produit_id) {
    return NextResponse.json({ error: 'Produit requis' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('favoris')
    .delete()
    .eq('user_id', user.id)
    .eq('produit_id', produit_id)

  if (error) {
    console.error('Erreur suppression favori:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}