// app/api/admin/transactions/stats/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Validation du paramètre de période                                        */
/* ========================================================================== */
const querySchema = z.object({
  period: z.enum(['7d', '30d', 'all']).default('30d'),
})

/* ========================================================================== */
/*  GET – Statistiques agrégées pour les graphiques du wallet                 */
/* ========================================================================== */
export async function GET(request: Request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-tx-stats:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification admin
  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({
    period: searchParams.get('period') || '30d',
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const { period } = parsed.data

  try {
    const supabase = await createClient(true)

    // Déterminer la date de début selon la période
    let startDate: string | null = null
    const now = new Date()
    if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    } else if (period === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    } // 'all' => startDate reste null

    // 1. Récupérer toutes les transactions de la période (ou toutes si 'all')
    let query = supabase
      .from('transactions')
      .select('id, type, montant, created_at')
      .order('created_at', { ascending: false })

    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    const { data: transactions, error } = await query
    if (error) {
      logger.error('Erreur récupération transactions pour stats', error)
      return NextResponse.json({ parType: [], evolution: [] })
    }

    const txData = transactions || []

    // 2. Agrégation par type (somme des montants absolus pour le camembert)
    const typeMap = new Map<string, number>()
    txData.forEach(tx => {
      const key = tx.type || 'autre'
      typeMap.set(key, (typeMap.get(key) || 0) + Math.abs(tx.montant))
    })
    const parType = Array.from(typeMap.entries()).map(([name, value]) => ({ name, value }))

    // 3. Évolution quotidienne (montant total des transactions par jour)
    const dailyMap = new Map<string, number>()
    txData.forEach(tx => {
      const day = new Date(tx.created_at).toISOString().slice(0, 10)
      dailyMap.set(day, (dailyMap.get(day) || 0) + tx.montant)
    })
    const evolution = Array.from(dailyMap.entries())
      .map(([date, montant]) => ({ date, montant }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({ parType, evolution })
  } catch (error: any) {
    logger.error('Crash GET admin/transactions/stats', error)
    return NextResponse.json({ parType: [], evolution: [] })
  }
}