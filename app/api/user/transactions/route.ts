// app/api/user/transactions/route.ts
// ---------------------------------------------------------------------------
// Historique des transactions utilisateur – Niveau Ultra‑Premium
// ---------------------------------------------------------------------------
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// Schéma de validation des paramètres de requête
// ---------------------------------------------------------------------------
const transactionsParamsSchema = z.object({
  type: z
    .enum([
      'recharge',
      'achat',
      'vente',
      'retrait',
      'transfert',
      'remboursement',
      'commission',
      'escrow_in',
      'escrow_out',
      'activation',
    ])
    .optional(),
  portefeuille_type: z.enum(['achat', 'vente']).optional(),
  statut: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sort_by: z.enum(['created_at', 'montant']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().max(100).optional(),
})

// ---------------------------------------------------------------------------
// GET – Récupérer l'historique des transactions
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  // Rate limiting : 30 req/min
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `transactions:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Veuillez patienter quelques secondes.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      logger.warn('Tentative accès transactions sans authentification')
      return NextResponse.json(
        { error: 'Authentification requise.', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // 2. Validation des paramètres
    const { searchParams } = new URL(request.url)
    const rawParams = Object.fromEntries(searchParams.entries())
    const parsed = transactionsParamsSchema.safeParse(rawParams)
    if (!parsed.success) {
      logger.warn({ userId: user.id, errors: parsed.error.flatten() }, 'Paramètres invalides pour transactions')
      return NextResponse.json(
        {
          error: 'Paramètres invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { type, portefeuille_type, statut, page, limit, sort_by, sort_order, search } = parsed.data
    const offset = (page - 1) * limit

    // 3. Construction de la requête Supabase
    const supabase = await createClient() // RLS gère l'accès via user_id
    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order(sort_by, { ascending: sort_order === 'asc' })
      .range(offset, offset + limit - 1)

    // Filtres optionnels
    if (type) query = query.eq('type', type)
    if (portefeuille_type) query = query.eq('portefeuille_type', portefeuille_type)
    if (statut) query = query.eq('status', statut)

    // Recherche textuelle dans la description
    if (search) {
      query = query.ilike('description', `%${search}%`)
    }

    // 4. Exécution
    const { data, error, count } = await query

    if (error) {
      logger.error('Erreur récupération transactions', error)
      return NextResponse.json(
        { error: 'Impossible de charger les transactions.', code: 'FETCH_ERROR' },
        { status: 500 }
      )
    }

    // 5. Formatage enrichi de la réponse
    const transactions = (data || []).map((tx: any) => ({
      id: tx.id,
      type: tx.type,
      montant: tx.montant,
      description: tx.description,
      date: tx.created_at,
      portefeuille_type: tx.portefeuille_type,
      statut: tx.status || 'approved',
      commande_id: tx.commande_id,
      method: tx.method,
      phone: tx.phone,
      metadata: tx.metadata,
    }))

    const totalPages = Math.ceil((count || 0) / limit)

    logger.info(
      { userId: user.id, count: count ?? 0, filters: { type, portefeuille_type, statut } },
      'Transactions récupérées avec succès'
    )

    // 6. Réponse enrichie avec métadonnées de pagination et cache headers
    const response = NextResponse.json(
      {
        data: transactions,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
      },
      { status: 200 }
    )

    // Headers de cache pour les requêtes GET (1 minute)
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')

    return response
  } catch (error: any) {
    logger.error('Crash GET transactions', error)
    return NextResponse.json(
      { error: 'Erreur serveur interne. Veuillez réessayer.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
