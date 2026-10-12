// api/admin/wallet/route.ts
/**
 * API de gestion du portefeuille central par l'administrateur.
 * Version ultra‑premium :
 *  - GET : soldes (achat/vente), stats, transactions récentes
 *  - POST : ajustement manuel du solde (crédit/débit)
 *  - Rate limiting, cache mémoire, logs structurés
 *  - Validation Zod pour toutes les entrées
 *  - Authentification admin via requireAdmin
 */
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Schémas de validation                                                     */
/* ========================================================================== */

const getQuerySchema = z.object({
  /** Nombre de transactions récentes à inclure */
  recentLimit: z.coerce.number().int().positive().max(50).optional().default(10),
  /** Inclure les stats mensuelles */
  includeMonthly: z.enum(['true', 'false']).optional().default('false'),
  /** Cache busting */
  refresh: z.enum(['true', 'false']).optional().default('false'),
})

const adjustmentSchema = z.object({
  montant: z.number({ message: 'Un montant est requis' }).refine(v => v !== 0, 'Le montant ne peut pas être 0'),
  raison: z.string().min(3, 'Veuillez donner une raison (min 3 caractères)').max(500).optional(),
  commentaire: z.string().max(500).optional(),
  portefeuille: z.enum(['achat', 'vente']).optional().default('achat'),
})

/* ========================================================================== */
/*  Cache simple (30 secondes)                                                 */
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
/*  GET – Soldes & statistiques                                                */
/* ========================================================================== */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-wallet:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { recentLimit, includeMonthly, refresh } = parsed.data

  const cacheKey = `admin-wallet:${recentLimit}:${includeMonthly}`
  if (refresh !== 'true') {
    const cached = getCache(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const supabase = await createClient(true)
    const adminId = process.env.ADMIN_USER_ID!
    if (!adminId) throw new Error('ADMIN_USER_ID manquant dans les variables d’environnement')

    // Récupérer les soldes
    const { data: walletData, error: walletErr } = await supabase
      .from('portefeuilles')
      .select('solde_achat, solde_vente')
      .eq('id', adminId)
      .single()

    if (walletErr) {
      logger.error(walletErr, 'Erreur récupération portefeuille admin')
      return NextResponse.json({ error: 'Erreur lors du chargement du portefeuille' }, { status: 500 })
    }

    const soldeAchat = walletData?.solde_achat ?? 0
    const soldeVente = walletData?.solde_vente ?? 0

    // Transactions récentes (créditées ou débitées sur le compte admin)
    const { data: recentTx, error: txErr } = await supabase
      .from('transactions')
      .select('id, type, montant, description, created_at')
      .eq('user_id', adminId)
      .order('created_at', { ascending: false })
      .limit(recentLimit)

    if (txErr) {
      logger.warn(txErr, 'Erreur récupération transactions admin')
    }

    // Statistiques mensuelles (si demandé)
    let monthlyStats: any = null
    if (includeMonthly === 'true') {
      const now = new Date()
      const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const debutAnnee = new Date(now.getFullYear(), 0, 1).toISOString()

      const [ventesMois, achatsMois, rechargesMois] = await Promise.all([
        supabase.from('transactions').select('montant').eq('type', 'vente').gte('created_at', debutMois).neq('user_id', adminId), // pas admin
        supabase.from('transactions').select('montant').eq('type', 'achat').gte('created_at', debutMois).neq('user_id', adminId),
        supabase.from('transactions').select('montant').eq('type', 'recharge').gte('created_at', debutMois).neq('user_id', adminId),
      ])

      const sum = (rows: any[]) => rows.reduce((s, r) => s + (r.montant || 0), 0)

      monthlyStats = {
        ventes: sum(ventesMois.data || []),
        achats: Math.abs(sum(achatsMois.data || [])),
        recharges: sum(rechargesMois.data || []),
      }
    }

    const response = {
      solde_achat: soldeAchat,
      solde_vente: soldeVente,
      total_disponible: soldeAchat + soldeVente,
      transactions_recentes: recentTx || [],
      monthlyStats,
      last_updated: new Date().toISOString(),
    }

    setCache(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error(error, 'Crash GET admin/wallet')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  POST – Ajustement manuel du solde                                          */
/* ========================================================================== */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-wallet-adj:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes sensibles. Réessayez dans une minute.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let adminUser: { id: string; email?: string }
  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = adjustmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { montant, raison, commentaire, portefeuille } = parsed.data
  const adminId = process.env.ADMIN_USER_ID!
  if (!adminId) return NextResponse.json({ error: 'Configuration admin manquante' }, { status: 500 })

  try {
    const supabase = await createClient(true)

    // Lire le solde actuel
    const { data: wallet, error: readErr } = await supabase
      .from('portefeuilles')
      .select('solde_achat, solde_vente')
      .eq('id', adminId)
      .single()

    if (readErr || !wallet) {
      return NextResponse.json({ error: 'Portefeuille central introuvable' }, { status: 500 })
    }

    const colonne = portefeuille === 'vente' ? 'solde_vente' : 'solde_achat'
    const ancienSolde = portefeuille === 'vente' ? wallet.solde_vente : wallet.solde_achat
    const nouveauSolde = ancienSolde + montant

    if (nouveauSolde < 0) {
      return NextResponse.json({ error: 'Solde insuffisant pour ce débit' }, { status: 400 })
    }

    // Mise à jour
    const { error: updateErr } = await supabase
      .from('portefeuilles')
      .update({ [colonne]: nouveauSolde })
      .eq('id', adminId)

    if (updateErr) {
      logger.error(updateErr, 'Erreur ajustement portefeuille admin')
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Enregistrer la transaction
    const now = new Date().toISOString()
    const description = `Ajustement manuel par ${adminUser.email || 'admin'}` +
      (raison ? ` : ${raison}` : '') +
      (commentaire ? ` (${commentaire})` : '')

    const { error: txErr } = await supabase.from('transactions').insert({
      user_id: adminId,
      type: 'ajustement',
      montant,
      description,
      portefeuille_type: portefeuille,
      created_at: now,
      status: 'approved',
      metadata: { administrateur: adminUser.id, raison, commentaire },
    })

    if (txErr) {
      logger.error(txErr, 'Erreur enregistrement transaction ajustement')
      // Pas de rollback ici, l'ajustement est déjà fait
    }

    // Invalider le cache
    cache.clear()

    logger.info(`Ajustement portefeuille ${portefeuille} de ${montant} FC par ${adminUser.email}`)

    return NextResponse.json({
      success: true,
      ancienSolde,
      nouveauSolde,
      portefeuille,
      montant,
    })
  } catch (error: any) {
    logger.error(error, 'Crash POST admin/wallet')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}