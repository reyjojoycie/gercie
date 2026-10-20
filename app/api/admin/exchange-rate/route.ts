// api/admin/exchange-rate/route.ts
/**
 * API de gestion du taux de change – version ultra‑premium.
 *
 * Enrichissements :
 *  - GET : taux actuel + historique paginé + stats (min, max, variation)
 *  - POST : mise à jour du taux avec commentaire
 *  - Validation Zod sur toutes les entrées
 *  - Rate limiting
 *  - Cache mémoire avec TTL configurable
 *  - Authentification admin via `requireAdmin`
 *  - Logs structurés
 *  - Export CSV de l'historique
 */
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Schémas de validation                                                     */
/* ========================================================================== */

const getQuerySchema = z.object({
  /** Devise (par défaut USD) */
  currency: z.enum(['USD', 'CDF']).optional().default('USD'),
  /** Récupérer l'historique au lieu du taux courant */
  history: z.enum(['true', 'false']).optional().default('false'),
  /** Pages pour l'historique */
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(30),
  /** Format de sortie */
  format: z.enum(['json', 'csv']).optional().default('json'),
})

const postBodySchema = z.object({
  rate: z.coerce
    .number({ message: 'Veuillez entrer un nombre valide' })
    .positive('Le taux doit être supérieur à 0')
    .min(100, 'Le taux minimum est de 100 CDF')
    .max(100000, 'Le taux semble trop élevé (max 100 000)'),
  currency: z.enum(['USD', 'CDF']).optional().default('USD'),
  comment: z.string().max(200, '200 caractères maximum').optional(),
})

/* ========================================================================== */
/*  Cache mémoire (30 secondes pour le taux, 2 minutes pour l'historique)     */
/* ========================================================================== */
const cache = new Map<string, { data: any; timestamp: number }>()

function getCache(key: string, ttlMs = 30_000) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() })
}

/* ========================================================================== */
/*  GET – Taux actuel ou historique                                            */
/* ========================================================================== */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-exrate:${ip}`,
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
  const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { currency, history, page, limit, format } = parsed.data

  try {
    const supabase = await createClient(true)

    // --- Mode historique ---
    if (history === 'true') {
      const cacheKey = `admin-exrate-history:${currency}:${page}:${limit}`
      const cached = getCache(cacheKey, 120_000)
      if (cached && format === 'json') return NextResponse.json(cached)

      const offset = (page - 1) * limit
      const { data: rows, error: histErr, count } = await supabase
        .from('exchange_rates_history')
        .select('id, rate, comment, created_at, updated_by', { count: 'exact' })
        .eq('currency', currency)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (histErr) {
        logger.error('Erreur récupération historique taux', histErr)
        return NextResponse.json({ error: histErr.message }, { status: 500 })
      }

      // Statistiques sur l'ensemble (hors pagination)
      const { data: allRates } = await supabase
        .from('exchange_rates_history')
        .select('rate')
        .eq('currency', currency)

      const allValues = (allRates || []).map(r => r.rate)
      const stats = {
        min: allValues.length > 0 ? Math.min(...allValues) : 0,
        max: allValues.length > 0 ? Math.max(...allValues) : 0,
        moyenne: allValues.length > 0 ? Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length) : 0,
        total: count ?? 0,
      }

      const response = {
        data: rows || [],
        pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
        stats,
      }

      setCache(cacheKey, response)

      if (format === 'csv') {
        const headers = ['Date', 'Taux (CDF)', 'Commentaire']
        const csvRows = (rows || []).map(r => [
          new Date(r.created_at).toISOString(),
          r.rate,
          r.comment || '',
        ])
        const csv = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename=taux_change_historique_${new Date().toISOString().slice(0, 10)}.csv`,
          },
        })
      }

      return NextResponse.json(response)
    }

    // --- Mode taux actuel ---
    const cacheKey = `admin-exrate:${currency}`
    const cached = getCache(cacheKey)
    if (cached) return NextResponse.json(cached)

    const { data, error } = await supabase
      .from('exchange_rates')
      .select('currency, rate, updated_at')
      .eq('currency', currency)
      .single()

    if (error) {
      logger.error('Erreur récupération taux', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calcul de la variation par rapport à la valeur précédente (si historique dispo)
    let variation: number | null = null
    try {
      const { data: prevRow } = await supabase
        .from('exchange_rates_history')
        .select('rate')
        .eq('currency', currency)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (prevRow && prevRow.rate !== data.rate) {
        variation = data.rate - prevRow.rate
      }
    } catch {
      // ignore
    }

    const response = {
      ...data,
      variation,
      variationPercent: variation !== null && data.rate !== variation
        ? ((variation / (data.rate - variation)) * 100).toFixed(2)
        : null,
    }

    setCache(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error('Crash GET admin/exchange-rate', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  POST – Mise à jour du taux + enregistrement dans l'historique             */
/* ========================================================================== */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-exrate-post:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let adminUser: { id: string; email?: string }
  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = postBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { rate, currency, comment } = parsed.data

  try {
    const supabase = await createClient(true)
    const now = new Date().toISOString()

    // 1. Récupérer l'ancien taux pour l'historique
    const { data: oldRate } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('currency', currency)
      .single()

    // 2. Mettre à jour le taux courant
    const { error: updateErr } = await supabase
      .from('exchange_rates')
      .upsert(
        { currency, rate, updated_at: now },
        { onConflict: 'currency' }
      )

    if (updateErr) {
      logger.error('Erreur mise à jour taux', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // 3. Insérer dans l'historique (table dédiée, si elle existe)
    try {
      await supabase.from('exchange_rates_history').insert({
        currency,
        rate,
        previous_rate: oldRate?.rate ?? null,
        comment: comment || null,
        updated_by: adminUser.id,
        created_at: now,
      })
    } catch (histErr) {
      logger.warn('Impossible d\'inscrire dans l\'historique (table manquante ?)', histErr)
    }

    // 4. Invalider le cache
    cache.clear()

    logger.info(`Taux ${currency} mis à jour : ${rate} CDF par ${adminUser.email}`, {
      previousRate: oldRate?.rate,
      comment,
    })

    return NextResponse.json({
      success: true,
      rate,
      previousRate: oldRate?.rate ?? null,
      currency,
      updatedAt: now,
    })
  } catch (error: any) {
    logger.error('Crash POST admin/exchange-rate', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}