import { createClient } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { z } from "zod"
import logger from "@/lib/logger"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"

const querySchema = z.object({
  search: z.string().optional().default(""),
  type: z.string().optional().default("all"),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
})

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-tx:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Trop de requêtes." }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres invalides", details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { search, type, page, limit } = parsed.data
  const offset = (page - 1) * limit

  try {
    const supabase = await createClient(true)

    let query = supabase
      .from("transactions")
      .select("id, type, montant, description, created_at, status, user_id, portefeuille_type, profiles(email, nom, prenom)", { count: "exact" })
      .order("created_at", { ascending: false })

    if (type !== "all") query = query.eq("type", type)

    if (search) {
      const term = `%${search}%`
      query = query.or(`description.ilike.${term},profiles.email.ilike.${term},profiles.nom.ilike.${term}`)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const transactions = (data || []).map((tx: any) => ({
      id: tx.id,
      type: tx.type,
      montant: tx.montant,
      description: tx.description,
      created_at: tx.created_at,
      status: tx.status || "approved",
      portefeuille_type: tx.portefeuille_type,
      user: tx.profiles ? {
        nom: tx.profiles.nom || "",
        prenom: tx.profiles.prenom || "",
        email: tx.profiles.email || "",
      } : null,
    }))

    return NextResponse.json({
      data: transactions,
      total: count ?? 0,
    })
  } catch (error: any) {
    logger.error("Erreur GET admin/transactions", error)
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}