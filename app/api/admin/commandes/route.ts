// app/api/admin/commandes/route.ts
/**
 * API de gestion des commandes pour l'administration.
 * Version ultra‑premium : filtrage avancé, tri, pagination,
 * cache, rate limiting, export CSV, mise à jour groupée du statut,
 * journalisation, et validation Zod.
 */
import { createClient } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { z } from "zod"
import logger from "@/lib/logger"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"
import { sendEmail, sendSMS, createNotification } from "@/lib/notifications"

export const dynamic = "force-dynamic"

/* ========================================================================== */
/*  Schémas de validation                                                     */
/* ========================================================================== */
const getQuerySchema = z.object({
  search: z.string().optional().default(""),
  statut: z.string().optional().default(""),
  date_debut: z.string().optional().default(""),
  date_fin: z.string().optional().default(""),
  type_livraison: z.string().optional().default(""),
  sort_by: z.enum(["created_at", "total_global", "statut", "numero_commande"]).optional().default("created_at"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  min_total: z.coerce.number().positive().optional(),
  max_total: z.coerce.number().positive().optional(),
  format: z.enum(["json", "csv"]).optional().default("json"),
})

const bulkStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Au moins un ID requis"),
  statut: z.enum(["en_attente", "payee", "collecte", "en_livraison", "livree", "annulee"]),
  commentaire: z.string().max(500).optional(),
})

/* ========================================================================== */
/*  Cache simple                                                               */
/* ========================================================================== */
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 15_000 // 15 secondes

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
/*  GET – Liste des commandes                                                  */
/* ========================================================================== */
export async function GET(request: Request) {
  // Rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-cmd:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Trop de requêtes." }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification admin
  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Accès non autorisé" }, { status: err.status || 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres invalides", details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const {
    search, statut, date_debut, date_fin, type_livraison,
    sort_by, sort_order, page, limit, min_total, max_total, format
  } = parsed.data
  const offset = (page - 1) * limit

  // Vérification cache
  const cacheKey = `admin-cmd:${JSON.stringify(parsed.data)}`
  if (format === "json") {
    const cached = getCache(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const supabase = await createClient(true) // service_role

    // Requête principale
    let query = supabase
      .from("commandes")
      .select(
        `id, numero_commande, total_global, statut, created_at, type_livraison,
         acheteur:acheteur_id (nom, prenom, email),
         commande_articles (produit_id, quantite, prix_unitaire, produits (nom))`,
        { count: "exact" }
      )

    // Filtres
    if (statut) query = query.eq("statut", statut)
    if (type_livraison) query = query.eq("type_livraison", type_livraison)
    if (date_debut) query = query.gte("created_at", date_debut)
    if (date_fin) query = query.lte("created_at", `${date_fin}T23:59:59`)
    if (min_total) query = query.gte("total_global", min_total)
    if (max_total) query = query.lte("total_global", max_total)

    if (search) {
      const term = `%${search}%`
      query = query.or(
        `numero_commande.ilike.${term},acheteur.email.ilike.${term},acheteur.nom.ilike.${term}`
      )
    }

    // Tri
    const ascending = sort_order === "asc"
    if (sort_by === "numero_commande") {
      query = query.order("numero_commande", { ascending })
    } else if (sort_by === "total_global") {
      query = query.order("total_global", { ascending })
    } else if (sort_by === "statut") {
      query = query.order("statut", { ascending })
    } else {
      query = query.order("created_at", { ascending })
    }

    // Pagination
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) {
      logger.error(error, "Erreur récupération commandes admin")
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Formatage des commandes
    const commandes = (data || []).map((cmd: any) => ({
      id: cmd.id,
      numero: cmd.numero_commande,
      total: cmd.total_global,
      statut: cmd.statut,
      date: cmd.created_at,
      type_livraison: cmd.type_livraison,
      adresse_livraison: cmd.adresse_livraison,
      acheteur: {
        nom: cmd.acheteur?.nom || "",
        prenom: cmd.acheteur?.prenom || "",
        email: cmd.acheteur?.email || "",
      },
      articles: (cmd.commande_articles || []).map((a: any) => ({
        produit_id: a.produit_id,
        nom: a.produits?.nom || "Produit inconnu",
        quantite: a.quantite,
        prix_unitaire: a.prix_unitaire,
      })),
    }))

    // Statistiques complémentaires (asynchrones)
    const debutJour = new Date().toISOString().slice(0, 10) + "T00:00:00"
    const finJour = new Date().toISOString().slice(0, 10) + "T23:59:59"

    const [statsJour, statsCAJour, statsEnAttente] = await Promise.all([
      supabase.from("commandes").select("*", { count: "exact", head: true }).gte("created_at", debutJour).lte("created_at", finJour),
      supabase.from("commandes").select("total_global").gte("created_at", debutJour).lte("created_at", finJour).eq("statut", "livree"),
      supabase.from("commandes").select("*", { count: "exact", head: true }).eq("statut", "en_attente"),
    ])

    const commandesJour = statsJour.count ?? 0
    const caJour = (statsCAJour.data || []).reduce((sum: number, c: any) => sum + (c.total_global || 0), 0)
    const enAttente = statsEnAttente.count ?? 0

    const response = {
      data: commandes,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
      stats: {
        commandesJour,
        caJour,
        enAttente,
      },
    }

    // Cache
    if (format === "json") {
      setCache(cacheKey, response)
    }

    // Export CSV
    if (format === "csv") {
      const headers = ["Numéro", "Client", "Email", "Total (FC)", "Statut", "Livraison", "Date", "Articles"]
      const rows = commandes.map((c: any) => [
        c.numero,
        `${c.acheteur.prenom} ${c.acheteur.nom}`,
        c.acheteur.email,
        c.total,
        c.statut,
        c.type_livraison,
        c.date,
        c.articles.map((a: any) => `${a.nom} x${a.quantite}`).join("; "),
      ])
      const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n")
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=commandes_${new Date().toISOString().slice(0, 10)}.csv`,
        },
      })
    }

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error(error, "Crash GET admin/commandes")
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}

/* ========================================================================== */
/*  PUT – Changement de statut en masse (bulk)                                 */
/* ========================================================================== */
export async function PUT(request: Request) {
  // Rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-cmd-put:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Trop de requêtes." }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification admin
  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Accès non autorisé" }, { status: err.status || 403 })
  }

  // Validation du corps
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const parsed = bulkStatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { ids, statut, commentaire } = parsed.data

  try {
    const supabase = await createClient(true) // service_role pour mise à jour
    const now = new Date().toISOString()

    // Récupération des commandes existantes pour vérification
    const { data: commandes, error: fetchError } = await supabase
      .from("commandes")
      .select("id, acheteur_id, statut, numero_commande")
      .in("id", ids)

    if (fetchError || !commandes) {
      return NextResponse.json({ error: "Erreur lors de la récupération des commandes" }, { status: 500 })
    }

    // Appliquer la mise à jour sur chaque commande
    for (const cmd of commandes) {
      const { error: updateError } = await supabase
        .from("commandes")
        .update({
          statut,
          commentaire_statut: commentaire || null,
          updated_at: now,
        })
        .eq("id", cmd.id)

      if (updateError) {
        logger.error(updateError, `Erreur mise à jour commande ${cmd.id}`)
        continue
      }

      // Notifier le client du changement de statut
      try {
        const { data: acheteur } = await supabase
          .from("profiles")
          .select("email, telephone")
          .eq("id", cmd.acheteur_id)
          .single()

        if (acheteur) {
          const statutLabel = statut.charAt(0).toUpperCase() + statut.slice(1).replace("_", " ")
          await sendEmail(
            acheteur.email,
            `Commande #${cmd.numero_commande} – ${statutLabel}`,
            `Votre commande est désormais « ${statutLabel} »${commentaire ? `.\nCommentaire : ${commentaire}` : "."}`
          )
          await createNotification(
            cmd.acheteur_id,
            "commande",
            `Statut : ${statutLabel}`,
            `Commande #${cmd.numero_commande} → ${statutLabel}`,
            { commande_id: cmd.id }
          )
          if (acheteur.telephone) {
            await sendSMS(
              acheteur.telephone,
              `Gercie: Votre commande #${cmd.numero_commande} est maintenant ${statutLabel}.`
            )
          }
        }
      } catch (notifErr) {
        logger.warn(notifErr, "Erreur notification changement statut")
      }
    }

    // Invalider le cache
    cache.clear()

    logger.info(`Statut ${statut} appliqué à ${commandes.length} commande(s)`, { ids })

    return NextResponse.json({ success: true, updated: commandes.length })
  } catch (error: any) {
    logger.error(error, "Crash PUT admin/commandes")
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}