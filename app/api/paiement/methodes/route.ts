import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient(false)
  const { data } = await supabase
    .from('moyens_paiement')
    .select('id, nom, code, logo_url, instructions, type')
    .eq('actif', true)
    .order('ordre')
  return NextResponse.json(data || [])
}