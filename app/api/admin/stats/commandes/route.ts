// app/api/admin/stats/commandes/route.ts
import { createClient } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { z } from "zod"
import logger from "@/lib/logger"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60_000 // 1 minute

const querySchema = z.object({
  range: z.enum(["7j", "30j", "90j", "1an"]).default("30j"),
  refresh: z.enum(["true", "false"]).default("false"),
})

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-stats-commandes:${ip}`,
    maxRequests: 30,
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
    range: searchParams.get("range") || "30j",
    refresh: searchParams.get("refresh") || "false",
  })
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres invalides", details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { range, refresh } = parsed.data
  const forceRefresh = refresh === "true"

  const cacheKey = `admin-commandes-stats:${range}`
  if (!forceRefresh) {
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }
  }

  try {
    const supabase = await createClient(true)

    // Calcul de la date de début
    const now = new Date()
    let days = 30
    switch (range) {
      case "7j": days = 7; break
      case "90j": days = 90; break
      case "1an": days = 365; break
    }
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

    // 1. Répartition par statut
    const { data: statutData, error: statutError } = await supabase
      .from("commandes")
      .select("statut, count", { count: "exact" })
      .gte("created_at", startDate)
      .order("statut", { ascending: true })

    // Reformater
    const parStatut = (statutData ?? []).map((s: any) => ({
      name: s.statut,
      value: s.count ?? 0,
    }))

    // 2. Évolution quotidienne (ventes + nombre de commandes)
    // On utilise une agrégation simplifiée : on récupère toutes les commandes et on traite côté serveur
    const { data: allCommandes, error: allError } = await supabase
      .from("commandes")
      .select("created_at, total_global")
      .gte("created_at", startDate)
      .order("created_at", { ascending: true })

    // Construction d'un tableau quotidien
    const dailyMap = new Map<string, { montant: number; commandes: number }>()
    if (allCommandes) {
      allCommandes.forEach((cmd: any) => {
        const day = new Date(cmd.created_at).toISOString().slice(0, 10)
        const entry = dailyMap.get(day) || { montant: 0, commandes: 0 }
        entry.montant += cmd.total_global || 0
        entry.commandes += 1
        dailyMap.set(day, entry)
      })
    }

    const evolution = Array.from(dailyMap.entries())
      .map(([date, val]) => ({ date, montant: val.montant, commandes: val.commandes }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const result = { parStatut, evolution }

    cache.set(cacheKey, { data: result, timestamp: Date.now() })
    return NextResponse.json(result)
  } catch (error: any) {
    logger.error("Crash GET admin/stats/commandes", error)
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}