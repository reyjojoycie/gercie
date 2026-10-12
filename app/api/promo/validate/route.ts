// app/api/promo/validate/route.ts
import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  let code: string;
  try {
    const body = await request.json()
    code = body.code?.trim().toUpperCase()
  } catch {
    return NextResponse.json({ valid: false, error: 'Requête invalide' }, { status: 400 })
  }

  if (!code) {
    return NextResponse.json({ valid: false, error: 'Code promo requis' }, { status: 400 })
  }

  const supabase = await createClient(true)
  const { data: promo, error } = await supabase
    .from('codes_promo')
    .select('*')
    .eq('code', code)
    .single()

  if (error || !promo) {
    return NextResponse.json({ valid: false, error: 'Code promo invalide' })
  }

  if (!promo.actif) {
    return NextResponse.json({ valid: false, error: 'Ce code promo n\'est plus actif' })
  }

  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'Ce code promo a expiré' })
  }

  if (promo.utilisations_actuelles >= promo.max_utilisations) {
    return NextResponse.json({ valid: false, error: 'Ce code promo a déjà été utilisé le nombre maximum de fois' })
  }

  return NextResponse.json({
    valid: true,
    code: promo.code,
    reduction_percent: promo.reduction_percent,
    max_utilisations: promo.max_utilisations,
    utilisations_actuelles: promo.utilisations_actuelles,
    expires_at: promo.expires_at,
  })
}