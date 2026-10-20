// app/api/livreur/stats/route.ts
/**
 * API de statistiques pour le livreur – version ultra‑premium.
 *
 * Enrichissements :
 *  - Validation Zod de la période
 *  - Rate limiting
 *  - Cache mémoire (TTL)
 *  - Calcul de tendances, répartition types, gains mensuels
 *  - Logs structurés
 *  - Récupération sécurisée de l'identité livreur
 */
import { createClient } from '@/lib/supabaseServer'
import { requireLivreur } from '@/lib/auth/livreurGuard'   // à créer si besoin, sinon utiliser requireAuth + vérification rôle
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Schéma de validation                                                      */
/* ========================================================================== */
const querySchema = z.object({
  periode: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('all'),
  refresh: z.enum(['true', 'false']).optional().default('false'),
})

/* ========================================================================== */
/*  Cache mémoire (30 secondes)                                                */
/* ========================================================================== */
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30_000

function getCache(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() })
}

/* ========================================================================== */
/*  GET – Retourne les statistiques                                            */
/* ========================================================================== */
export async function GET(request: Request) {
  // 1. Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `livreur-stats:${ip}`,
    maxRequests: 20,
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
    const livreur = await requireLivreur()  // doit renvoyer l'ID du livreur ou lever une erreur
    livreurId = livreur.id
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  // 3. Validation des paramètres
  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { periode, refresh } = parsed.data

  // 4. Cache
  const cacheKey = `livreur-stats:${livreurId}:${periode}`
  if (refresh !== 'true') {
    const cached = getCache(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const supabase = await createClient(true)

    // 5. Récupérer les stats globales du livreur
    const { data: livreur, error: livreurErr } = await supabase
      .from('livreurs')
      .select('id, est_actif, total_livraisons, evaluation_moyenne, distance_parcourue_km, derniere_activite')
      .eq('id', livreurId)
      .single()

    if (livreurErr || !livreur || !livreur.est_actif) {
      return NextResponse.json({ error: 'Livreur non trouvé ou inactif' }, { status: 403 })
    }

    // 6. Déterminer les dates de la période
    const now = new Date()
    let dateDebut: Date | null = null
    let dateDebutPrec: Date | null = null

    switch (periode) {
      case 'day':
        dateDebut = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        dateDebutPrec = new Date(dateDebut.getTime() - 24 * 3600 * 1000)
        break
      case 'week': {
        const day = now.getDay() || 7 // dimanche = 7
        dateDebut = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1)
        dateDebutPrec = new Date(dateDebut.getTime() - 7 * 24 * 3600 * 1000)
        break
      }
      case 'month':
        dateDebut = new Date(now.getFullYear(), now.getMonth(), 1)
        dateDebutPrec = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        break
      case 'year':
        dateDebut = new Date(now.getFullYear(), 0, 1)
        dateDebutPrec = new Date(now.getFullYear() - 1, 0, 1)
        break
      default:
        dateDebut = null
        dateDebutPrec = null
    }

    // 7. Livraisons terminées sur la période
    let queryLivraisons = supabase
      .from('livraisons')
      .select('id, livree_at, commande_id')
      .eq('livreur_id', livreurId)
      .eq('statut', 'livree')

    if (dateDebut) {
      queryLivraisons = queryLivraisons.gte('livree_at', dateDebut.toISOString())
    }

    const { data: livraisons, error: livraisonsErr } = await queryLivraisons
    if (livraisonsErr) throw livraisonsErr

    const totalLivraisonsPeriode = livraisons?.length ?? 0

    // 8. Gains (frais de livraison des commandes livrées)
    let gainsPeriode = 0
    if (livraisons && livraisons.length > 0) {
      const commandeIds = livraisons.map(l => l.commande_id)
      const { data: commandes } = await supabase
        .from('commandes')
        .select('frais_livraison')
        .in('id', commandeIds)
      gainsPeriode = (commandes || []).reduce((sum, c) => sum + (c.frais_livraison || 0), 0)
    }

    // 9. Courses en cours
    const { data: coursesEnCours, error: encoursErr } = await supabase
      .from('livraisons')
      .select('id, statut, commande_id, created_at')
      .eq('livreur_id', livreurId)
      .not('statut', 'in', '("livree","annulee")')
    if (encoursErr) throw encoursErr

    // 10. Top communes
    const { data: topData, error: topErr } = await supabase
      .from('livraisons')
      .select('commande_id, commandes!inner(commune_livraison_id, communes(nom))')
      .eq('livreur_id', livreurId)
      .eq('statut', 'livree')

    let communesMap = new Map<string, number>()
    if (!topErr && topData) {
      topData.forEach(row => {
        const nom = row.commandes?.communes?.nom
        if (nom) communesMap.set(nom, (communesMap.get(nom) || 0) + 1)
      })
    }
    const topCommunes = Array.from(communesMap.entries())
      .map(([nom, count]) => ({ nom, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // 11. Évaluations (table evaluations_livreurs)
    let evaluationMoyenne = livreur.evaluation_moyenne ?? 0
    let totalEvaluations = 0
    const { data: evaluations, error: evalErr } = await supabase
      .from('evaluations_livreurs')
      .select('note')
      .eq('livreur_id', livreurId)
    if (!evalErr && evaluations) {
      totalEvaluations = evaluations.length
      evaluationMoyenne = totalEvaluations > 0
        ? evaluations.reduce((sum, e) => sum + e.note, 0) / totalEvaluations
        : 0
    }

    // 12. Tendance (comparaison période précédente)
    let tendance = null
    if (dateDebut && dateDebutPrec) {
      const { data: livraisonsPrec } = await supabase
        .from('livraisons')
        .select('id')
        .eq('livreur_id', livreurId)
        .eq('statut', 'livree')
        .gte('livree_at', dateDebutPrec.toISOString())
        .lt('livree_at', dateDebut?.toISOString())
      const precCount = livraisonsPrec?.length ?? 0
      const variationAbsolue = totalLivraisonsPeriode - precCount
      const variationPourcentage = precCount === 0 ? (totalLivraisonsPeriode > 0 ? 100 : 0) : (variationAbsolue / precCount) * 100
      tendance = { variation_absolue: variationAbsolue, variation_pourcentage: variationPourcentage }
    }

    // 13. Répartition types (domicile / point retrait)
    let repartitionTypes: { name: string; value: number }[] = []
    if (livraisons && livraisons.length > 0) {
      const commandeIds = livraisons.map(l => l.commande_id)
      const { data: typesData } = await supabase
        .from('commandes')
        .select('type_livraison')
        .in('id', commandeIds)
      if (typesData) {
        const typeMap = new Map<string, number>()
        typesData.forEach(c => {
          const libelle = c.type_livraison === 'domicile' ? 'Domicile' : 'Point retrait'
          typeMap.set(libelle, (typeMap.get(libelle) || 0) + 1)
        })
        repartitionTypes = Array.from(typeMap.entries()).map(([name, value]) => ({ name, value }))
      }
    }

    // 14. Comparaison période précédente (gains + distance)
    let comparaison = null
    if (dateDebut && dateDebutPrec) {
      const { data: livsPrec } = await supabase
        .from('livraisons')
        .select('id, commande_id')
        .eq('livreur_id', livreurId)
        .eq('statut', 'livree')
        .gte('livree_at', dateDebutPrec.toISOString())
        .lt('livree_at', dateDebut?.toISOString())
      if (livsPrec) {
        const idsPrec = livsPrec.map(l => l.commande_id)
        const { data: cmdsPrec } = await supabase
          .from('commandes')
          .select('frais_livraison')
          .in('id', idsPrec)
        const gainsPrec = (cmdsPrec || []).reduce((sum, c) => sum + (c.frais_livraison || 0), 0)
        // Distance (simplifié, on peut avoir une colonne distance dans livraisons)
        const { data: distancesPrec } = await supabase
          .from('livraisons')
          .select('distance_km')
          .eq('livreur_id', livreurId)
          .eq('statut', 'livree')
          .gte('livree_at', dateDebutPrec.toISOString())
          .lt('livree_at', dateDebut?.toISOString())
        const distancePrec = (distancesPrec || []).reduce((sum, d) => sum + (d.distance_km || 0), 0)
        comparaison = {
          total_livraisons_prec: livsPrec.length,
          gains_prec: gainsPrec,
          distance_prec: distancePrec,
        }
      }
    }

    // 15. Évolution des gains (7 derniers jours, par jour)
    let evolutionGains: { date: string; montant: number }[] = []
    if (periode === 'week' || periode === 'day' || periode === 'month') {
      const { data: dailyGains } = await supabase
        .rpc('get_daily_gains_livreur', { p_livreur_id: livreurId, p_days: 7 })
        .maybeSingle()
      if (dailyGains?.days) evolutionGains = dailyGains.days
    }

    const stats = {
      total_livraisons: livreur.total_livraisons ?? 0,
      evaluation_moyenne: evaluationMoyenne,
      total_evaluations: totalEvaluations,
      distance_parcourue_km: livreur.distance_parcourue_km ?? 0,
      derniere_activite: livreur.derniere_activite,
      periode: {
        nom: periode,
        total_livraisons: totalLivraisonsPeriode,
        gains: gainsPeriode,
      },
      courses_en_cours: {
        count: coursesEnCours?.length ?? 0,
        details: (coursesEnCours || []).map(c => ({
          id: c.id,
          commande_id: c.commande_id,
          statut: c.statut,
          created_at: c.created_at,
        })),
      },
      top_communes: topCommunes,
      tendance,
      repartition_types: repartitionTypes,
      comparaison,
      evolution_gains: evolutionGains,
    }

    setCache(cacheKey, stats)
    return NextResponse.json(stats)
  } catch (error: any) {
    logger.error('Crash dans /api/livreur/stats', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}