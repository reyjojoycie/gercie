// app/api/user/is-livreur/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import logger from '@/lib/logger'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ isLivreur: false }, { status: 401 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('livreurs')
      .select('est_actif')
      .eq('id', user.id)
      .single()

    if (error || !data) {
      logger.info({ userId: user.id }, 'Utilisateur non livreur')
      return NextResponse.json({ isLivreur: false })
    }

    return NextResponse.json({ isLivreur: data.est_actif === true })
  } catch (error: any) {
    logger.error(error, 'Crash dans is-livreur')
    return NextResponse.json({ isLivreur: false })
  }
}
