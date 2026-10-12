import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

// GET un produit par ID (public)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params  // ← DÉBALLER LA PROMESSE
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('produits')
    .select(`
      *,
      vendeur:vendeurs (
        boutique_nom,
        profile:profiles (nom, prenom, telephone)
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Produit non trouvé' }, { status: 404 })
  }
  return NextResponse.json(data)
}

// PUT mettre à jour un produit (vendeur propriétaire)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params  // ← DÉBALLER LA PROMESSE
  const supabase = await createClient(true)

  const { data: produit, error: produitError } = await supabase
    .from('produits')
    .select('vendeur_id')
    .eq('id', id)
    .single()

  if (produitError || !produit) {
    return NextResponse.json({ error: 'Produit non trouvé' }, { status: 404 })
  }

  if (produit.vendeur_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { nom, description, prix, prix_usd, categorie, images, stock, negociable, est_actif } = body

    const updateData: any = {
      nom,
      description,
      categorie,
      images,
      stock,
      negociable,
      est_actif,
      updated_at: new Date().toISOString(),
    }
    if (prix !== undefined) updateData.prix = prix
    if (prix_usd !== undefined) updateData.prix_usd = prix_usd

    const { data, error } = await supabase
      .from('produits')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ Erreur mise à jour produit :', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('💥 Erreur serveur :', err)
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}

// DELETE supprimer un produit (vendeur propriétaire)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params  // ← DÉBALLER LA PROMESSE
  const supabase = await createClient(true)

  const { data: produit, error: produitError } = await supabase
    .from('produits')
    .select('vendeur_id')
    .eq('id', id)
    .single()

  if (produitError || !produit) {
    return NextResponse.json({ error: 'Produit non trouvé' }, { status: 404 })
  }

  if (produit.vendeur_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { error } = await supabase
    .from('produits')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}