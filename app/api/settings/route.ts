// app/api/settings/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'Paramètre key requis' }, { status: 400 })

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single()

    if (error || !data) return NextResponse.json({ value: null })
    return NextResponse.json({ value: data.value })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try { await requireAdmin() } catch (err: any) {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
  }

  const body = await request.json()
  const { key, value } = body
  if (!key || value === undefined) return NextResponse.json({ error: 'key et value requis' }, { status: 400 })

  try {
    const supabase = await createClient(true)
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}