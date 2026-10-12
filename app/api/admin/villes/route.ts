// app/api/admin/villes/route.ts
// 1. Utilisez bien createServiceClient (sans cookies)
import { createServiceClient } from '@/lib/supabaseServer' 
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'

export async function GET() {
  try { await requireAdmin() } catch (e) { return NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.from('villes').select('*').order('nom')
    if (error) return NextResponse.json([])
    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try { await requireAdmin() } catch (e) { return NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }
  const body = await request.json() // Contient { nom, province_id }
  
  if (!body.nom || !body.province_id) {
    return NextResponse.json({ error: 'Nom et Province requis' }, { status: 400 })
  }

  try {
    // 2. Remplacer par createServiceClient() (synchrone, pas de 'await')
    const supabase = createServiceClient() 
    const { data, error } = await supabase.from('villes').insert(body).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try { await requireAdmin() } catch (e) { return NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }
  const { id, nom, actif, province_id } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })
  try {
    const supabase = createServiceClient() 
    const { error } = await supabase.from('villes').update({ nom, actif, province_id }).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try { await requireAdmin() } catch (e) { return NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })
  try {
    const supabase = createServiceClient() 
    const { error } = await supabase.from('villes').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}