// app/api/admin/points-retrait/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = await createClient(true)

  // Vérifier admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await request.json()
  // Accepter tous les champs possibles
  const {
    nom, adresse, commune_id, telephone, horaires, est_actif,
    province_nom, ville_nom, quartier, avenue, numero, reference,
    latitude, longitude, photo_url, points_de_repere,
    instructions_retrait, contact_nom, type_etablissement,
    est_partenaire_verifie, note_moyenne
  } = body

  if (!nom || !adresse) {
    return NextResponse.json({ error: 'Nom et adresse obligatoires' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('points_retrait')
    .update({
      nom,
      adresse,
      commune_id: commune_id || null,
      telephone: telephone || null,
      horaires: horaires || null,
      est_actif: est_actif ?? true,
      province_nom: province_nom || null,
      ville_nom: ville_nom || null,
      quartier: quartier || null,
      avenue: avenue || null,
      numero: numero || null,
      reference: reference || null,
      latitude: latitude || null,
      longitude: longitude || null,
      photo_url: photo_url || null,
      points_de_repere: points_de_repere || null,
      instructions_retrait: instructions_retrait || null,
      contact_nom: contact_nom || null,
      type_etablissement: type_etablissement || null,
      est_partenaire_verifie: est_partenaire_verifie ?? false,
      note_moyenne: note_moyenne || null,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = await createClient(true)

  // Vérifier admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { error } = await supabase
    .from('points_retrait')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}