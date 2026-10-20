// app/api/admin/stats/top-categories/route.ts
import { createClient } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { z } from "zod"
import logger from "@/lib/logger"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 120_000

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
  refresh: z.enum(["true", "false"]).default("false"),
})

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-top-categories:${ip}`,
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
    limit: searchParams.get("limit") || 5,
    refresh: searchParams.get("refresh") || "false",
  })
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 })
  }

  const { limit, refresh } = parsed.data
  const forceRefresh = refresh === "true"

  const cacheKey = `admin-top-categories:${limit}`
  if (!forceRefresh) {
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }
  }

  try {
    const supabase = await createClient(true)

    // Essayer de récupérer les produits avec categorie et total_ventes
    const { data, error } = await supabase
      .from("produits")
      .select("categorie, total_ventes")
      .eq("est_actif", true)

    if (error) {
      logger.warn(`Erreur top-categories : ${error.message}`)
      return NextResponse.json([])
    }

    // Agrégation manuelle
    const aggr = new Map<string, { ventes: number; produits: number }>()
    ;(data || []).forEach((p: any) => {
      const cat = p.categorie?.split(" > ")[0] || "Non classé"
      const cur = aggr.get(cat) || { ventes: 0, produits: 0 }
      cur.ventes += p.total_ventes || 0
      cur.produits += 1
      aggr.set(cat, cur)
    })

    const result = Array.from(aggr.entries())
      .map(([name, val]) => ({ name, ventes: val.ventes, produits: val.produits }))
      .sort((a, b) => b.ventes - a.ventes)
      .slice(0, limit)

    cache.set(cacheKey, { data: result, timestamp: Date.now() })
    return NextResponse.json(result)
  } catch (error: any) {
    logger.error("Crash GET admin/stats/top-categories", error)
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}