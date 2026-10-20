// app/api/admin/stats/recent-activity/route.ts
import { createClient } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { z } from "zod"
import logger from "@/lib/logger"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30_000

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-recent-activity:${ip}`,
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
  })
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 })
  }

  const limit = parsed.data.limit
  const cacheKey = `admin-recent-activity:${limit}`

  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  try {
    const supabase = await createClient(true)

    // Récupération des dernières connexions et inscriptions
    const [profilesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, created_at, last_sign_in_at")
        .order("created_at", { ascending: false })
        .limit(limit),
    ])

    const activities = (profilesRes.data || []).map((p: any) => ({
      id: p.id,
      type: p.last_sign_in_at && p.last_sign_in_at > p.created_at ? "connexion" : "inscription",
      user: p.email,
      date: p.last_sign_in_at || p.created_at,
    }))

    // Tri par date décroissante
    activities.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const result = activities.slice(0, limit)

    cache.set(cacheKey, { data: result, timestamp: Date.now() })
    return NextResponse.json(result)
  } catch (error: any) {
    logger.error("Crash GET admin/stats/recent-activity", error)
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}