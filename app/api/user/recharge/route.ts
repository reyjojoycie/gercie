// app/api/user/recharge/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'

const rechargeSchema = z.object({
  montant: z.number().positive('Le montant doit être positif'),
  currency: z.enum(['CDF', 'USD']),
  method: z.enum(['orange', 'airtel', 'mpesa', 'afrimoney']),
  phone: z.string().regex(/^0[0-9]{9}$/, 'Numéro invalide (ex: 0812345678)'),
})

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const rawBody = await request.json()
    const parsed = rechargeSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { montant, currency, method, phone } = parsed.data

    // Conversion en CDF
    let montantCDF: number
    if (currency === 'USD') {
      const supabase = await createClient()
      const { data: rateData } = await supabase
        .from('exchange_rates')
        .select('rate')
        .eq('currency', 'USD')
        .single()
      if (!rateData?.rate) {
        return NextResponse.json({ error: 'Taux de change non disponible' }, { status: 500 })
      }
      montantCDF = Math.round(montant * rateData.rate)
    } else {
      montantCDF = montant
    }

    if (montantCDF < 100) {
      return NextResponse.json({ error: 'Montant minimum 100 FC' }, { status: 400 })
    }

    const supabase = await createClient()

    // Portefeuille
    let wallet: { solde_achat: number; solde_vente: number } | null = null
    const { data: existing, error: walletError } = await supabase
      .from('portefeuilles')
      .select('solde_achat, solde_vente')
      .eq('id', user.id)
      .single()

    if (walletError && walletError.code === 'PGRST116') {
      // Créer le portefeuille
      const { error: insertError } = await supabase
        .from('portefeuilles')
        .insert({ id: user.id, solde_achat: 0, solde_vente: 0 })
      if (insertError) {
        logger.error(insertError, 'Erreur création portefeuille')
        return NextResponse.json({ error: 'Erreur technique' }, { status: 500 })
      }
      wallet = { solde_achat: 0, solde_vente: 0 }
    } else if (walletError) {
      logger.error(walletError, 'Erreur récupération portefeuille')
      return NextResponse.json({ error: 'Erreur technique' }, { status: 500 })
    } else {
      wallet = existing as any
    }

    if (!wallet) {
      return NextResponse.json({ error: 'Portefeuille introuvable' }, { status: 500 })
    }

    const newSolde = wallet.solde_achat + montantCDF
    const { error: updateError } = await supabase
      .from('portefeuilles')
      .update({ solde_achat: newSolde })
      .eq('id', user.id)

    if (updateError) {
      logger.error(updateError, 'Erreur mise à jour portefeuille')
      return NextResponse.json({ error: 'Erreur technique' }, { status: 500 })
    }

    // Transaction
    const description =
      currency === 'USD'
        ? `Recharge de ${montant} USD via ${method} (${phone})`
        : `Recharge de ${montantCDF} FC via ${method} (${phone})`

    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'recharge',
      montant: montantCDF,
      method,
      phone,
      description,
      portefeuille_type: 'achat',
    })

    logger.info({ userId: user.id, montantCDF, method }, 'Recharge réussie')
    return NextResponse.json({ success: true, newSolde })
  } catch (err: any) {
    logger.error(err, 'Erreur dans recharge')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}
