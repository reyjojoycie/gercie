import { createClient } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth/adminGuard"
import { NextResponse } from "next/server"
import { z } from "zod"
import logger from "@/lib/logger"
import { rateLimit, applyRateLimitHeaders } from "@/lib/rateLimit"

const ESCROW_USER_ID = process.env.ESCROW_USER_ID ?? "c0ffee00-0000-0000-0000-000000000ec0"

const adjustSchema = z.object({
  montant: z.number().refine(v => v !== 0, "Le montant ne peut pas être zéro"),
  raison: z.string().max(500).optional().default("Ajustement manuel"),
})

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-wallet:${ip}`,
    maxRequests: 20,
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

  try {
    const supabase = await createClient(true)

    // Vérifier si le portefeuille central existe
    let { data: wallet, error: fetchError } = await supabase
      .from("portefeuilles")
      .select("solde_achat, solde_vente")
      .eq("id", ESCROW_USER_ID)
      .maybeSingle()

    if (fetchError) {
      logger.error(fetchError, "Erreur GET wallet")
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Si le portefeuille n'existe pas, le créer automatiquement
    if (!wallet) {
      const { error: insertError } = await supabase
        .from("portefeuilles")
        .insert({ id: ESCROW_USER_ID, solde_achat: 0, solde_vente: 0 })

      if (insertError) {
        logger.error(insertError, "Impossible de créer le portefeuille central")
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      // Re‑lire après création
      const { data: newWallet, error: reFetchError } = await supabase
        .from("portefeuilles")
        .select("solde_achat, solde_vente")
        .eq("id", ESCROW_USER_ID)
        .single()

      if (reFetchError || !newWallet) {
        return NextResponse.json({ error: "Erreur lors de la création du portefeuille" }, { status: 500 })
      }

      wallet = newWallet
    }

    return NextResponse.json({
      solde_achat: wallet.solde_achat ?? 0,
      solde_vente: wallet.solde_vente ?? 0,
      total_recharges: 0,
      total_achats: 0,
      total_ventes: 0,
      last_updated: new Date().toISOString(),
    })
  } catch (error: any) {
    logger.error(error, "Erreur GET admin/wallet")
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-wallet-post:${ip}`,
    maxRequests: 10,
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

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const parsed = adjustSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { montant, raison } = parsed.data

  try {
    const supabase = await createClient(true)

    // Récupérer le portefeuille central (ou le créer)
    let { data: wallet, error: fetchError } = await supabase
      .from("portefeuilles")
      .select("solde_achat")
      .eq("id", ESCROW_USER_ID)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!wallet) {
      const { error: insertError } = await supabase
        .from("portefeuilles")
        .insert({ id: ESCROW_USER_ID, solde_achat: 0, solde_vente: 0 })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      // Re‑lire
      const { data: newWallet, error: reFetchError } = await supabase
        .from("portefeuilles")
        .select("solde_achat")
        .eq("id", ESCROW_USER_ID)
        .single()

      if (reFetchError || !newWallet) {
        return NextResponse.json({ error: "Erreur lors de la création du portefeuille" }, { status: 500 })
      }

      wallet = newWallet
    }

    const nouveauSolde = wallet.solde_achat + montant
    if (nouveauSolde < 0) {
      return NextResponse.json({ error: "Solde insuffisant pour un débit aussi important" }, { status: 400 })
    }

    // Mettre à jour le solde
    const { error: updateError } = await supabase
      .from("portefeuilles")
      .update({ solde_achat: nouveauSolde })
      .eq("id", ESCROW_USER_ID)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Enregistrer la transaction
    const { error: txError } = await supabase.from("transactions").insert({
      user_id: ESCROW_USER_ID,
      type: montant > 0 ? "recharge" : "retrait",
      montant: Math.abs(montant),
      description: raison,
      status: "approved",
      created_at: new Date().toISOString(),
      portefeuille_type: "achat",
    })

    if (txError) {
      logger.error(txError, "Impossible d'enregistrer la transaction")
    }

    return NextResponse.json({ success: true, nouveauSolde })
  } catch (error: any) {
    logger.error(error, "Erreur POST admin/wallet")
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
}