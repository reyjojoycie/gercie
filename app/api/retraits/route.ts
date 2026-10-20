// app/api/retraits/route.ts
// ---------------------------------------------------------------------------
// Demandes de retrait – Portefeuille Vente → Mobile Money
// Niveau Ultra‑Premium – Validation, Sécurité, Traçabilité
// ---------------------------------------------------------------------------
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// Schémas de validation
// ---------------------------------------------------------------------------
const retraitRequestSchema = z.object({
  montant: z
    .number({ invalid_type_error: 'Le montant doit être un nombre' })
    .int('Le montant doit être un entier')
    .min(1000, 'Le montant minimum est de 1 000 FC')
    .max(5000000, 'Le montant maximum par retrait est de 5 000 000 FC'),
  phone: z
    .string()
    .regex(/^0[0-9]{9}$/, 'Numéro de téléphone invalide (format 08xxxxxxxx)'),
})

const retraitFiltersSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  statut: z.enum(['pending', 'approved', 'rejected']).optional(),
})

// ---------------------------------------------------------------------------
// POST – Créer une demande de retrait
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  // Rate limiting : 3 requêtes par minute (opération critique)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `retrait-create:${ip}`,
    maxRequests: 3,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de demandes de retrait. Veuillez patienter.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      logger.warn('Tentative de retrait sans authentification')
      return NextResponse.json(
        { error: 'Authentification requise.', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // 2. Validation des données entrantes
    const rawBody = await request.json()
    const parsed = retraitRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn({ userId: user.id, errors: parsed.error.flatten().fieldErrors }, 'Données de retrait invalides')
      return NextResponse.json(
        {
          error: 'Données invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { montant, phone } = parsed.data

    // 3. Vérification du portefeuille vente
    const supabase = await createClient(true) // service_role pour garantir l'intégrité des écritures
    let wallet: { solde_vente: number; solde_achat: number }
    const { data: walletData, error: walletError } = await supabase
      .from('portefeuilles')
      .select('solde_vente, solde_achat')
      .eq('id', user.id)
      .single()

    if (walletError && walletError.code === 'PGRST116') {
      // Portefeuille inexistant → création
      logger.info({ userId: user.id }, 'Création portefeuille avant retrait')
      const { error: insertError } = await supabase
        .from('portefeuilles')
        .insert({ id: user.id, solde_achat: 0, solde_vente: 0 })
      if (insertError) {
        logger.error('Échec création portefeuille pour retrait', insertError)
        return NextResponse.json(
          { error: 'Portefeuille introuvable.', code: 'WALLET_CREATION_FAILED' },
          { status: 500 }
        )
      }
      wallet = { solde_vente: 0, solde_achat: 0 }
    } else if (walletError) {
      logger.error('Erreur récupération portefeuille', walletError)
      return NextResponse.json(
        { error: 'Erreur base de données.', code: 'DB_ERROR' },
        { status: 500 }
      )
    } else {
      wallet = walletData
    }

    // Vérification du solde vente
    if (wallet.solde_vente < montant) {
      logger.warn({ userId: user.id, montant, solde: wallet.solde_vente }, 'Solde vente insuffisant pour retrait')
      return NextResponse.json(
        { error: `Solde vente insuffisant. Disponible : ${wallet.solde_vente.toLocaleString()} FC.`, code: 'INSUFFICIENT_FUNDS' },
        { status: 400 }
      )
    }

    const newSoldeVente = wallet.solde_vente - montant

    // 4. Débit du portefeuille vente (on réserve les fonds)
    const { error: updateError } = await supabase
      .from('portefeuilles')
      .update({ solde_vente: newSoldeVente, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (updateError) {
      logger.error('Erreur débit portefeuille vente pour retrait', updateError)
      return NextResponse.json(
        { error: 'Erreur lors du traitement.', code: 'UPDATE_ERROR' },
        { status: 500 }
      )
    }

    // 5. Enregistrement de la transaction de retrait (statut pending)
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type: 'retrait',
        montant: -montant, // débit
        description: `Demande de retrait de ${montant.toLocaleString()} FC vers ${phone}`,
        status: 'pending',
        portefeuille_type: 'vente',
        method: 'mobile_money',
        phone,
        metadata: { requested_at: new Date().toISOString() },
      })
      .select('id, created_at')
      .single()

    if (txError) {
      // Rollback du solde vente
      await supabase
        .from('portefeuilles')
        .update({ solde_vente: wallet.solde_vente })
        .eq('id', user.id)
      logger.error('Échec enregistrement transaction retrait', txError)
      return NextResponse.json(
        { error: "Erreur lors de l'enregistrement.", code: 'TX_ERROR' },
        { status: 500 }
      )
    }

    logger.info(
      { userId: user.id, montant, phone, transactionId: transaction.id },
      'Demande de retrait créée avec succès'
    )

    return NextResponse.json({
      success: true,
      message: `Votre demande de retrait de ${montant.toLocaleString()} FC a bien été enregistrée. Elle sera traitée sous 48h.`,
      data: {
        id: transaction.id,
        montant,
        statut: 'pending',
        nouveau_solde_vente: newSoldeVente,
      },
    }, { status: 201 })
  } catch (error: any) {
    logger.error('Crash POST retrait', error)
    return NextResponse.json(
      { error: 'Erreur serveur interne.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// GET – Historique des retraits de l'utilisateur (pagination, filtrage)
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `retrait-list:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.', code: 'RATE_LIMITED' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentification requise.', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const raw = Object.fromEntries(searchParams.entries())
    const parsed = retraitFiltersSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Paramètres invalides.', code: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { page, limit, statut } = parsed.data
    const offset = (page - 1) * limit

    const supabase = await createClient()
    let query = supabase
      .from('transactions')
      .select('id, montant, description, status, created_at, phone, metadata', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('type', 'retrait')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (statut) {
      query = query.eq('status', statut)
    }

    const { data, error, count } = await query
    if (error) {
      logger.error('Erreur récupération retraits', error)
      return NextResponse.json({ error: 'Impossible de charger les retraits.', code: 'FETCH_ERROR' }, { status: 500 })
    }

    const retraits = (data || []).map((r: any) => ({
      id: r.id,
      montant: Math.abs(r.montant),
      description: r.description,
      statut: r.status,
      date: r.created_at,
      phone: r.phone,
      metadata: r.metadata,
    }))

    return NextResponse.json({
      data: retraits,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error: any) {
    logger.error('Crash GET retraits', error)
    return NextResponse.json({ error: 'Erreur serveur interne.', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}