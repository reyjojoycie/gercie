// app/api/admin/stats/route.ts
/**
 * API de statistiques pour le tableau de bord administrateur.
 * Enrichie avec +30 indicateurs, cache optimisé, agrégations temporelles,
 * gestion avancée des erreurs, et désormais des métriques IA.
 */
import { createClient } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"
import { z } from "zod"
import logger from "@/lib/logger"

// ID du portefeuille central (escrow)
const ESCROW_USER_ID = process.env.ESCROW_USER_ID ?? "c0ffee00-0000-0000-0000-000000000ec0"

// Cache simple en mémoire (peut être remplacé par Redis)
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30_000 // 30 secondes

function getFromCache(key: string) {
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

// Validation du paramètre de période
const querySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
  refresh: z.enum(['true', 'false']).default('false'),
})

export async function GET(request: Request) {
  // Rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-stats:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Trop de requêtes. Patientez." }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification admin
  let user: { id: string; email?: string }
  try {
    user = await requireAdmin()
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Accès non autorisé" }, { status: error.status || 403 })
  }

  // Paramètres de période
  const { searchParams } = new URL(request.url)
  const parsedParams = querySchema.safeParse({
    range: searchParams.get("range") || "30d",
    refresh: searchParams.get("refresh") || "false",
  })

  const range = parsedParams.success ? parsedParams.data.range : "30d"
  const forceRefresh = parsedParams.success ? parsedParams.data.refresh === "true" : false

  // Déterminer les dates selon la période
  const now = new Date()
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

  const cacheKey = `admin-stats:${range}`
  if (!forceRefresh) {
    const cached = getFromCache(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const supabase = await createClient(true) // service_role

    // Fonctions de requête sécurisées
    const safeCount = async (query: any, label: string) => {
      try {
        const { count, error } = await query
        if (error) throw new Error(error.message)
        return count ?? 0
      } catch (err: any) {
        logger.warn(`Stats query error [${label}]: ${err.message}`)
        return 0
      }
    }

    const safeSum = async (query: any, label: string) => {
      try {
        const { data, error } = await query
        if (error) throw new Error(error.message)
        return (data || []).reduce((sum: number, row: any) => sum + (row.total_global || row.montant || 0), 0)
      } catch (err: any) {
        logger.warn(`Stats query error [${label}]: ${err.message}`)
        return 0
      }
    }

    // Lancement de toutes les requêtes en parallèle (existantes + IA)
    const [
      totalUsers,
      newUsersMonth,
      newUsersToday,
      totalCommandes,
      commandesEnAttente,
      commandesPayees,
      commandesLivrees,
      commandesAnnulees,
      totalVentes,
      totalVentesMois,
      retraitsEnAttente,
      soldeEscrow,
      produitsActifs,
      produitsRupture,
      totalLivreurs,
      livreursActifs,
      commandesDuJour,
      ventesDuJour,
      rechargesMois,
      retraitsMois,
      // ============ NOUVEAUX INDICATEURS IA ============
      nbEmbeddingsProduits,
      nbInteractionsUtilisateurs,
      nbRecherchesCachees,
      tauxConversion,
      commandesFraude,
      totalRecommandationsPersonnalisees,
    ] = await Promise.all([
      safeCount(supabase.from("profiles").select("*", { count: "exact", head: true }), "profiles total"),
      safeCount(supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", thisMonthStart), "nouveaux ce mois"),
      safeCount(supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", todayStart), "nouveaux aujourd'hui"),
      safeCount(supabase.from("commandes").select("*", { count: "exact", head: true }), "commandes total"),
      safeCount(supabase.from("commandes").select("*", { count: "exact", head: true }).eq("statut", "en_attente"), "cmd en_attente"),
      safeCount(supabase.from("commandes").select("*", { count: "exact", head: true }).eq("statut", "payee"), "cmd payee"),
      safeCount(supabase.from("commandes").select("*", { count: "exact", head: true }).eq("statut", "livree"), "cmd livree"),
      safeCount(supabase.from("commandes").select("*", { count: "exact", head: true }).eq("statut", "annulee"), "cmd annulee"),
      safeSum(supabase.from("commandes").select("total_global").eq("statut", "livree"), "ventes totales"),
      safeSum(supabase.from("commandes").select("total_global").eq("statut", "livree").gte("created_at", thisMonthStart), "ventes ce mois"),
      safeCount(supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "retrait").eq("status", "pending"), "retraits en attente"),
      safeSum(supabase.from("portefeuilles").select("solde_achat").eq("id", ESCROW_USER_ID).single(), "solde escrow"),
      safeCount(supabase.from("produits").select("*", { count: "exact", head: true }).eq("est_actif", true), "produits actifs"),
      safeCount(supabase.from("produits").select("*", { count: "exact", head: true }).lte("stock", 0).eq("est_actif", true), "produits rupture"),
      safeCount(supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "livreur"), "livreurs total"),
      safeCount(supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "livreur").eq("est_disponible", true), "livreurs actifs"),
      safeCount(supabase.from("commandes").select("*", { count: "exact", head: true }).gte("created_at", todayStart), "commandes du jour"),
      safeSum(supabase.from("commandes").select("total_global").eq("statut", "livree").gte("created_at", todayStart), "ventes du jour"),
      safeSum(supabase.from("transactions").select("montant").eq("type", "recharge").gte("created_at", thisMonthStart), "recharges mois"),
      safeSum(supabase.from("transactions").select("montant").eq("type", "retrait").gte("created_at", thisMonthStart), "retraits mois"),
      // NOUVEAUX : indicateurs IA (sans casser si les tables manquent)
      safeCount(supabase.from("product_embeddings").select("*", { count: "exact", head: true }), "embeddings produits"),
      safeCount(supabase.from("user_interactions").select("*", { count: "exact", head: true }).gte("created_at", periodStart), "interactions utilisateurs"),
      safeCount(supabase.from("search_cache").select("*", { count: "exact", head: true }), "cache de recherche"),
      safeCount(supabase.from("commandes").select("*", { count: "exact", head: true }).eq("statut", "payee").or("statut.eq.livree") , "commandes payées ou livrées").then(count => totalUsers > 0 ? count / totalUsers : 0), // approximation du taux de conversion
      safeCount(supabase.from("commandes").select("*", { count: "exact", head: true }).filter("statut", "eq", "annulee").gte("created_at", periodStart).lt("created_at", new Date().toISOString()).abortSignal(undefined as any), "commandes annulées"), // on pourrait améliorer avec l'IA de fraude, ici on compte les annulations suspectes (simplifié)
      safeCount(supabase.from("user_interactions").select("*", { count: "exact", head: true }).eq("interaction_type", "purchase").gte("created_at", periodStart), "recommandations personnalisées"), // interactions qui alimentent les recos
    ])

    // Calculs dérivés
    const panierMoyen = commandesLivrees > 0 ? Math.round(totalVentes / commandesLivrees) : 0
    const tauxConversionReel = totalUsers > 0 ? Math.round((commandesLivrees / totalUsers) * 10000) / 100 : 0
    const produitsAvecEmbedding = nbEmbeddingsProduits
    const interactionsTotal = nbInteractionsUtilisateurs
    const recherchesEnCache = nbRecherchesCachees

    const stats = {
      // Indicateurs principaux (compatibles avec votre page actuelle)
      totalUsers,
      totalVendeurs: 0, // sera remplacé si la colonne is_vendeur existe
      totalCommandes,
      totalVentes,
      retraitsEnAttente,
      litigesOuverts: 0, // à enrichir avec une table litiges
      soldeEscrow,
      commandesDuJour,
      ventesDuJour,
      nouveauxUtilisateurs: newUsersMonth,
      tauxConversion: tauxConversionReel,
      // Détails supplémentaires pour graphiques
      parStatut: [
        { name: "En attente", value: commandesEnAttente },
        { name: "Payées", value: commandesPayees },
        { name: "Livrées", value: commandesLivrees },
        { name: "Annulées", value: commandesAnnulees },
      ],
      evolution: [], // sera enrichi avec des données quotidiennes si besoin
      // Stats additionnelles (pour vos futurs besoins)
      produitsActifs,
      produitsRupture,
      totalLivreurs,
      livreursActifs,
      panierMoyen,
      rechargesMois,
      retraitsMois,
      meta: {
        generatedAt: new Date().toISOString(),
        range: days,
        cacheTtl: CACHE_TTL,
      },
      // ============ NOUVELLES STATS IA ============
      ia: {
        produitsAvecEmbedding,
        interactionsUtilisateurs: interactionsTotal,
        recherchesCachees: recherchesEnCache,
        tauxConversionReel, // en %
        // Indicateur de fraude : nombre de commandes annulées récemment (simplifié, pourrait être enrichi avec le score IA)
        commandesAnnuleesRecentes: commandesAnnulees,
        // Nombre d'interactions d'achat (pour les recos)
        achatsPourRecommandations: totalRecommandationsPersonnalisees,
      },
    }

    // Mise en cache
    setCache(cacheKey, stats)

    return NextResponse.json(stats)
  } catch (error: any) {
    logger.error(error, "Crash dans GET /api/admin/stats")
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}