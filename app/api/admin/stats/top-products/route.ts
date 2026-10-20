// app/api/admin/stats/top-products/route.ts
import { createClient } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { z } from "zod"
import logger from "@/lib/logger"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 120_000

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sort: z.enum(["ventes", "vues"]).default("ventes"),
  refresh: z.enum(["true", "false"]).default("false"),
})

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-top-products:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Trop de requêtes." }, { status: 429 }), rateLimitHeaders)
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Accès non autorisé" }, { status: err.status || 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") || 10,
    sort: searchParams.get("sort") || "ventes",
    refresh: searchParams.get("refresh") || "false",
  })
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 })
  }

  const { limit, sort, refresh } = parsed.data
  const forceRefresh = refresh === "true"

  const cacheKey = `admin-top-products:${sort}:${limit}`
  if (!forceRefresh) {
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }
  }

  try {
    const supabase = await createClient(true)

    // Récupération de base
    let query = supabase
      .from("produits")
      .select("id, nom, prix, total_ventes")
      .eq("est_actif", true)

    // Ajouter la colonne vues si elle existe
    if (sort === "vues") {
      query = supabase.from("produits").select("id, nom, prix, total_ventes, vues").eq("est_actif", true)
    }

    if (sort === "ventes") {
      query = query.order("total_ventes", { ascending: false })
    } else {
      query = query.order("vues", { ascending: false })
    }

    query = query.limit(limit)

    const { data, error } = await query

    if (error) {
      // Si la colonne vues ou total_ventes n'existe pas, on renvoie un tableau vide
      logger.warn(`Erreur top-products : ${error.message}`)
      return NextResponse.json([])
    }

    const result = (data || []).map((p: any) => ({
      id: p.id,
      nom: p.nom,
      prix: p.prix,
      ventes: p.total_ventes || 0,
      vues: p.vues || 0,
    }))

    cache.set(cacheKey, { data: result, timestamp: Date.now() })
    return NextResponse.json(result)
  } catch (error: any) {
    logger.error("Crash GET admin/stats/top-products", error)
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}