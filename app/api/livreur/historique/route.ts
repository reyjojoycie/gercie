// app/api/livreur/historique/route.ts
/**
 * API d'historique des livraisons pour le livreur – version ultra‑premium.
 *
 * GET : retourne la liste paginée, filtrée et triée des livraisons passées.
 *
 * Enrichissements :
 *  - Validation Zod de tous les paramètres
 *  - Rate limiting
 *  - Cache mémoire (TTL)
 *  - Filtres avancés (statut, date, recherche, commune, type livraison)
 *  - Tri configurable (date, montant, statut)
 *  - Statistiques complémentaires (total, gains, compteurs par statut)
 *  - Export CSV (optionnel)
 *  - Logs structurés
 *  - Authentification livreur via requireLivreur
 */
import { createClient } from '@/lib/supabaseServer'
import { requireLivreur } from '@/lib/auth/livreurGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Schéma de validation                                                      */
/* ========================================================================== */
const querySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(10),
  statut: z.enum(['livree', 'annulee', 'acceptee', 'colis_recupere', 'all']).optional().default('all'),
  search: z.string().optional().default(''),
  date_debut: z.string().optional().default(''),   // YYYY-MM-DD
  date_fin: z.string().optional().default(''),
  commune: z.string().optional().default(''),
  type_livraison: z.enum(['domicile', 'point_retrait', '']).optional().default(''),
  sort_by: z.enum(['date', 'total', 'statut']).optional().default('date'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  format: z.enum(['json', 'csv']).optional().default('json'),
  refresh: z.enum(['true', 'false']).optional().default('false'),
})

/* ========================================================================== */
/*  Cache (30 secondes)                                                        */
/* ========================================================================== */
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 30_000

function cacheGet(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null }
  return entry.data
}
function cacheSet(key: string, data: any) { cache.set(key, { data, ts: Date.now() }) }

/* ========================================================================== */
/*  GET – Historique paginé                                                    */
/* ========================================================================== */
export async function GET(request: Request) {
  // 1. Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `livreur-historique:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Patientez une minute.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // 2. Authentification livreur
  let livreurId: string
  try {
    const livreur = await requireLivreur()
    livreurId = livreur.id
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  // 3. Validation des paramètres
  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const { page, limit, statut, search, date_debut, date_fin, commune, type_livraison, sort_by, sort_order, format, refresh } = parsed.data
  const offset = (page - 1) * limit

  // 4. Cache
  const cacheKey = `livreur-historique:${livreurId}:${JSON.stringify(parsed.data)}`
  if (refresh !== 'true' && format === 'json') {
    const cached = cacheGet(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const supabase = await createClient(true)

    // 5. Requête de base avec jointures
    let query = supabase
      .from('livraisons')
      .select(`
        id,
        commande_id,
        statut,
        created_at,
        acceptee_at,
        recupere_at,
        livree_at,
        photo_colis,
        photo_livraison,
        commandes!inner (
          numero_commande,
          total_global,
          type_livraison,
          adresse_livraison,
          point_retrait_id,
          points_retrait (nom, adresse),
          commune_livraison_id,
          communes (nom)
        )
      `, { count: 'exact' })
      .eq('livreur_id', livreurId)

    // 6. Filtres
    if (statut !== 'all') {
      query = query.eq('statut', statut)
    } else {
      // Par défaut, on montre tout (livrées, annulées, en cours…)
      // query = query.in('statut', ['livree', 'annulee', 'acceptee', 'colis_recupere'])
    }

    if (search) {
      query = query.ilike('commandes.numero_commande', `%${search}%`)
    }

    if (date_debut) {
      query = query.gte('livree_at', date_debut)
    }
    if (date_fin) {
      query = query.lte('livree_at', `${date_fin}T23:59:59`)
    }

    if (commune) {
      query = query.ilike('commandes.communes.nom', `%${commune}%`)
    }

    if (type_livraison) {
      query = query.eq('commandes.type_livraison', type_livraison)
    }

    // 7. Tri
    const ascending = sort_order === 'asc'
    if (sort_by === 'total') {
      query = query.order('commandes.total_global', { ascending })
    } else if (sort_by === 'statut') {
      query = query.order('statut', { ascending })
    } else {
      query = query.order('livree_at', { ascending, nullsLast: true })
    }

    // 8. Pagination
    query = query.range(offset, offset + limit - 1)

    const { data: livraisons, error, count } = await query
    if (error) {
      logger.error('Erreur récupération historique livreur', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 9. Statistiques rapides (indépendantes de la pagination)
    const { data: allLivraisons } = await supabase
      .from('livraisons')
      .select('statut')
      .eq('livreur_id', livreurId)

    const totalLivrees = allLivraisons?.filter(l => l.statut === 'livree').length ?? 0
    const totalAnnulees = allLivraisons?.filter(l => l.statut === 'annulee').length ?? 0
    const totalEnCours = allLivraisons?.filter(l => !['livree', 'annulee'].includes(l.statut)).length ?? 0

    // 10. Calcul des gains totaux (sur les livrées de la page ou sur tout ?)
    // Ici, on fournit le total des gains (frais de livraison) pour les livraisons affichées
    let gainsPage = 0
    if (livraisons && livraisons.length > 0) {
      const commandeIds = livraisons.map(l => l.commande_id)
      const { data: commandesGains } = await supabase
        .from('commandes')
        .select('frais_livraison')
        .in('id', commandeIds)
      gainsPage = (commandesGains || []).reduce((sum, c) => sum + (c.frais_livraison || 0), 0)
    }

    // 11. Formatage des données
    const formatted = (livraisons || []).map(l => {
      const cmd = l.commandes
      let adresseFinale = ''
      let pointRetraitNom = null
      if (cmd.type_livraison === 'domicile') {
        adresseFinale = cmd.adresse_livraison || 'Adresse non renseignée'
      } else {
        adresseFinale = cmd.points_retrait?.adresse || 'Adresse du point de retrait non renseignée'
        pointRetraitNom = cmd.points_retrait?.nom || null
      }
      return {
        id: l.id,
        commande_id: l.commande_id,
        numero_commande: cmd.numero_commande,
        total: cmd.total_global,
        type_livraison: cmd.type_livraison,
        adresse: adresseFinale,
        point_retrait_nom: pointRetraitNom,
        commune: cmd.communes?.nom || 'Commune non spécifiée',
        statut: l.statut,
        date_acceptation: l.acceptee_at,
        date_recuperation: l.recupere_at,
        date_livraison: l.livree_at,
        photo_colis: l.photo_colis,
        photo_livraison: l.photo_livraison,
      }
    })

    const response = {
      data: formatted,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
      stats: {
        total_livrees: totalLivrees,
        total_annulees: totalAnnulees,
        total_en_cours: totalEnCours,
        gains_page: gainsPage,
      },
    }

    // 12. Export CSV
    if (format === 'csv') {
      const headers = ['Commande', 'Statut', 'Type', 'Adresse', 'Total (FC)', 'Date livraison', 'Date acceptation']
      const rows = formatted.map(l => [
        l.numero_commande,
        l.statut,
        l.type_livraison,
        l.adresse,
        l.total,
        l.date_livraison ? new Date(l.date_livraison).toISOString() : '',
        l.date_acceptation ? new Date(l.date_acceptation).toISOString() : '',
      ])
      const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=historique_livraisons_${new Date().toISOString().slice(0, 10)}.csv`,
        },
      })
    }

    // 13. Mise en cache (sauf export)
    cacheSet(cacheKey, response)

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error('Crash GET /api/livreur/historique', error)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}