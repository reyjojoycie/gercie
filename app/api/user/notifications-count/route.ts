// app/api/user/notifications-count/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import logger from '@/lib/logger'

/**
 * GET /api/user/notifications-count
 * Retourne le nombre de notifications non lues pour l'utilisateur connecté.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ count: 0, error: 'Non authentifié' }, { status: 401 })
    }

    // Le client standard (anon key) suffit car RLS filtre par user_id
    const supabase = await createClient()

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)

    if (error) {
      logger.error('Erreur comptage notifications', error)
      return NextResponse.json({ count: 0, error: 'Erreur serveur' }, { status: 500 })
    }

    logger.info({ userId: user.id, count }, 'Notifications non lues comptées')
    return NextResponse.json({ count: count ?? 0 })
  } catch (err: any) {
    logger.error('Crash comptage notifications', err)
    return NextResponse.json({ count: 0, error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
