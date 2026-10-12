// app/api/transferts/route.ts
// ---------------------------------------------------------------------------
// Transfert entre portefeuilles (achat ↔ vente) – Niveau Ultra‑Premium
// ---------------------------------------------------------------------------
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// Schéma de validation – strict et complet
// ---------------------------------------------------------------------------
const transfertSchema = z.object({
  montant: z
    .number({ invalid_type_error: 'Le montant doit être un nombre' })
    .int('Le montant doit être un entier')
    .positive('Le montant doit être positif')
    .min(100, 'Le montant minimum est de 100 FC'),
  source: z.enum(['achat', 'vente'], { errorMap: () => ({ message: 'Source invalide (achat ou vente)' }) }),
  destination: z.enum(['achat', 'vente'], { errorMap: () => ({ message: 'Destination invalide (achat ou vente)' }) }),
}).refine((data) => data.source !== data.destination, {
  message: 'La source et la destination doivent être différentes',
  path: ['destination'],
})

// ---------------------------------------------------------------------------
// POST – Effectuer un transfert entre les deux poches du portefeuille
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  // Rate limiting : 5 req/min (opération très sensible)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `transfert:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Veuillez patienter quelques minutes.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      logger.warn('Tentative de transfert sans authentification')
      return NextResponse.json(
        { error: 'Authentification requise.', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // 2. Validation des données
    const rawBody = await request.json()
    const parsed = transfertSchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn({ userId: user.id, errors: parsed.error.flatten() }, 'Données de transfert invalides')
      return NextResponse.json(
        {
          error: 'Données invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { montant, source, destination } = parsed.data

    // 3. Récupération du portefeuille avec service_role pour garantir l'intégrité des écritures
    const supabase = await createClient(true)
    const { data: wallet, error: walletError } = await supabase
      .from('portefeuilles')
      .select('solde_achat, solde_vente')
      .eq('id', user.id)
      .single()

    if (walletError && walletError.code === 'PGRST116') {
      logger.info({ userId: user.id }, 'Portefeuille absent – création automatique')
      const { error: insertError } = await supabase
        .from('portefeuilles')
        .insert({ id: user.id, solde_achat: 0, solde_vente: 0 })
      if (insertError) {
        logger.error(insertError, 'Échec création portefeuille pour transfert')
        return NextResponse.json(
          { error: 'Portefeuille introuvable et impossible à créer.', code: 'WALLET_CREATION_FAILED' },
          { status: 500 }
        )
      }
      // Après création, les deux soldes sont à 0 donc le transfert échouera
      wallet = { solde_achat: 0, solde_vente: 0 }
    } else if (walletError) {
      logger.error(walletError, 'Erreur récupération portefeuille')
      return NextResponse.json(
        { error: 'Portefeuille introuvable.', code: 'DB_ERROR' },
        { status: 500 }
      )
    } else {
      wallet = wallet as { solde_achat: number; solde_vente: number }
    }

    // 4. Vérification du solde source
    const sourceSolde = source === 'achat' ? wallet.solde_achat : wallet.solde_vente
    if (sourceSolde < montant) {
      logger.warn({ userId: user.id, montant, source, soldeActuel: sourceSolde }, 'Solde insuffisant pour transfert')
      return NextResponse.json(
        { error: `Solde ${source} insuffisant. Disponible : ${sourceSolde.toLocaleString()} FC.`, code: 'INSUFFICIENT_FUNDS' },
        { status: 400 }
      )
    }

    // 5. Calcul des nouveaux soldes
    const newSourceSolde = sourceSolde - montant
    const destSolde = destination === 'achat' ? wallet.solde_achat : wallet.solde_vente
    const newDestSolde = destSolde + montant

    // 6. Construction de l'objet de mise à jour
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (source === 'achat') updates.solde_achat = newSourceSolde
    else updates.solde_vente = newSourceSolde
    if (destination === 'achat') updates.solde_achat = newDestSolde
    else updates.solde_vente = newDestSolde

    // 7. Mise à jour atomique
    const { error: updateError } = await supabase
      .from('portefeuilles')
      .update(updates)
      .eq('id', user.id)

    if (updateError) {
      logger.error(updateError, 'Erreur mise à jour portefeuille après transfert')
      return NextResponse.json(
        { error: 'Erreur lors du transfert.', code: 'UPDATE_ERROR' },
        { status: 500 }
      )
    }

    // 8. Enregistrement de la transaction (2 lignes : débit et crédit)
    const transactions = [
      {
        user_id: user.id,
        type: 'transfert',
        montant: -montant,
        description: `Transfert de ${montant.toLocaleString()} FC du portefeuille ${source} vers ${destination}`,
        portefeuille_type: source,
        status: 'approved',
        metadata: { source, destination, montant },
      },
      {
        user_id: user.id,
        type: 'transfert',
        montant: montant,
        description: `Réception de ${montant.toLocaleString()} FC depuis le portefeuille ${source}`,
        portefeuille_type: destination,
        status: 'approved',
        metadata: { source, destination, montant },
      },
    ]

    const { error: insertError } = await supabase.from('transactions').insert(transactions)
    if (insertError) {
      logger.error(insertError, 'Erreur enregistrement transactions transfert – transfert effectué mais historique incomplet')
      // On ne rollback pas volontairement (le transfert est déjà fait), on alerte
    }

    // 9. Récupération des nouveaux soldes confirmés
    const { data: refreshedWallet, error: refetchError } = await supabase
      .from('portefeuilles')
      .select('solde_achat, solde_vente')
      .eq('id', user.id)
      .single()

    const finalSolds = {
      solde_achat: refreshedWallet?.solde_achat ?? newDestSolde,
      solde_vente: refreshedWallet?.solde_vente ?? newDestSolde,
    }

    logger.info(
      {
        userId: user.id,
        montant,
        source,
        destination,
        nouveauxSoldes: finalSolds,
      },
      'Transfert effectué avec succès'
    )

    // 10. Réponse enrichie
    return NextResponse.json({
      success: true,
      message: `Transfert de ${montant.toLocaleString()} FC du portefeuille ${source} vers ${destination} réussi.`,
      data: {
        soldes: {
          solde_achat: finalSolds.solde_achat,
          solde_vente: finalSolds.solde_vente,
        },
        montant_transfere: montant,
      },
    })
  } catch (error: any) {
    logger.error(error, 'Crash POST transfert')
    return NextResponse.json(
      { error: 'Erreur serveur interne.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
