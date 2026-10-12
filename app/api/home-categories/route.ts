import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient(false)
  const { data, error } = await supabase
    .from('popular_categories_config')
    .select('category_id, display_name, image_url')
    .eq('actif', true)
    .order('ordre')
  if (error) return NextResponse.json([])
  return NextResponse.json(data || [])
}