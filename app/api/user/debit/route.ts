// app/api/user/debit/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'

// Schéma Zod pour la demande de débit
const debitSchema = z.object({
  montant: z.number().positive('Le montant doit être positif'),
  commande_id: z.string().uuid('ID de commande invalide').optional(),
})

export async function POST(request: Request) {
  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // 2. Validation du corps de la requête
    const rawBody = await request.json()
    const parsed = debitSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { montant, commande_id } = parsed.data

    const supabase = await createClient() // pas de service_role nécessaire

    // 3. Récupérer le portefeuille achat
    const { data: wallet, error: walletError } = await supabase
      .from('portefeuilles')
      .select('solde_achat')
      .eq('id', user.id)
      .single()

    if (walletError || !wallet) {
      logger.warn({ userId: user.id }, 'Portefeuille introuvable lors d’une tentative de débit')
      return NextResponse.json({ error: 'Portefeuille introuvable' }, { status: 404 })
    }

    // 4. Vérifier le solde
    if (wallet.solde_achat < montant) {
      return NextResponse.json({ error: 'Solde achat insuffisant' }, { status: 400 })
    }

    // 5. Débiter le portefeuille achat
    const nouveauSolde = wallet.solde_achat - montant
    const { error: updateError } = await supabase
      .from('portefeuilles')
      .update({ solde_achat: nouveauSolde })
      .eq('id', user.id)

    if (updateError) {
      logger.error(updateError, 'Erreur lors du débit du portefeuille')
      return NextResponse.json({ error: 'Erreur lors du débit' }, { status: 500 })
    }

    // 6. Enregistrer la transaction (optionnel)
    if (commande_id) {
      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'achat',
        montant: -montant,
        commande_id,
        description: `Paiement commande #${commande_id}`,
        portefeuille_type: 'achat',
      })
    } else {
      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'debit',
        montant: -montant,
        description: 'Débit manuel',
        portefeuille_type: 'achat',
      })
    }

    logger.info({ userId: user.id, montant, commande_id }, 'Débit effectué avec succès')
    return NextResponse.json({ success: true, newSolde: nouveauSolde })
  } catch (error: any) {
    logger.error(error, 'Crash dans la route de débit')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}
