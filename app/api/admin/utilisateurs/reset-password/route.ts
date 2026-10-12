import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try { await requireAdmin() } catch (e) { return NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }
  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 })

  const newPassword = Math.random().toString(36).slice(-8) // génération simple
  const supabase = await createClient(true)
  const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ newPassword })
}