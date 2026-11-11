// lib/activity.ts
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'

export interface LogActivityInput {
  userId: string
  action: string
  description?: string
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, any>
}

export function getRequestMeta(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null

  const userAgent = request.headers.get('user-agent') || null

  return { ip, userAgent }
}

/**
 * Enregistre une action utilisateur dans user_activity_logs.
 * Ne bloque jamais l'appel principal en cas d'échec.
 */
export async function logActivity(input: LogActivityInput) {
  try {
    if (!input.userId || !input.action) return

    const supabase = await createClient(true)

    const { error } = await supabase.from('user_activity_logs').insert({
      user_id: input.userId,
      action: input.action,
      description: input.description || null,
      ip: input.ip || null,
      user_agent: input.userAgent || null,
      metadata: input.metadata || {},
    })

    if (error) {
      // Table pas encore créée : on ignore silencieusement en développement
      if (error.code === '42P01') return

      logger.error('Erreur logActivity', {
        userId: input.userId,
        action: input.action,
        error,
      })
    }
  } catch (error) {
    logger.error('Crash logActivity', error)
  }
}