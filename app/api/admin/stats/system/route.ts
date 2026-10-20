// app/api/admin/stats/system/route.ts
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"
import logger from "@/lib/logger"

const startTime = Date.now()

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-system:${ip}`,
    maxRequests: 10,
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

  try {
    // Données simulées (vous pouvez les remplacer par de vraies métriques)
    const uptimeMs = Date.now() - startTime
    const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24))
    const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const uptime = `${uptimeDays}j ${uptimeHours}h`

    const systemStatus = {
      lastBackup: new Date(Date.now() - 3600 * 1000 * 6).toISOString(), // il y a 6h
      diskSpace: 72, // pourcentage libre simulé
      activeConnections: Math.floor(Math.random() * 50) + 10,
      uptime,
    }

    return NextResponse.json(systemStatus)
  } catch (error: any) {
    logger.error("Crash GET admin/stats/system", error)
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}