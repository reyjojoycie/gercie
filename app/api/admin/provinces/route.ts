// app/api/admin/provinces/route.ts
// 1. Ajoutez l'import de createServiceClient
import { createClient, createServiceClient } from '@/lib/supabaseServer' 
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'

export async function GET() {
  try { await requireAdmin() } catch (e) { return NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }
  try {
    // Optionnel : Vous pouvez aussi utiliser createServiceClient() ici pour être tranquille
    const supabase = createServiceClient() 
    const { data, error } = await supabase.from('provinces').select('*').order('nom')
    if (error) {
      console.error('GET provinces error:', error)
      return NextResponse.json([])
    }
    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try { await requireAdmin() } catch (e) { return NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }
  const { nom } = await request.json()
  if (!nom) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
  try {
    // 2. Remplacer `await createClient(true)` par `createServiceClient()`
    // Attention : createServiceClient() est synchrone, enlevez le `await` !
    const supabase = createServiceClient() 
    const { data, error } = await supabase.from('provinces').insert({ nom }).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try { await requireAdmin() } catch (e) { return NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }
  const { id, nom, actif } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })
  try {
    // 3. Idem pour le PUT
    const supabase = createServiceClient() 
    const { error } = await supabase.from('provinces').update({ nom, actif }).eq('id', id)
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
    // 4. Idem pour le DELETE
    const supabase = createServiceClient() 
    const { error } = await supabase.from('provinces').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}