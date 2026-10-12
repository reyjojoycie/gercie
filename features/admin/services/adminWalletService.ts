// features/admin/services/adminWalletService.ts
/**
 * Service métier pour la gestion du portefeuille central par l'administrateur.
 * Version ultra‑premium : fonctions enrichies, validation, logs, ajustements,
 * transactions, statistiques et sécurité.
 */
import { createClient } from '@/lib/supabaseServer'
import { z } from 'zod'
import logger from '@/lib/logger'

/* ========================================================================== */
/*  Constantes                                                                 */
/* ========================================================================== */

const ESCROW_USER_ID = process.env.ADMIN_USER_ID ?? 'c0ffee00-0000-0000-0000-000000000ec0'

/* ========================================================================== */
/*  Schémas de validation                                                      */
/* ========================================================================== */

const adjustmentSchema = z.object({
  montant: z.number({ message: 'Un montant est requis' }).refine(v => v !== 0, 'Le montant ne peut pas être 0'),
  raison: z.string().min(3, 'Veuillez fournir une raison (min 3 caractères)').max(500).optional(),
  commentaire: z.string().max(500).optional(),
  portefeuille: z.enum(['achat', 'vente']).default('achat'),
})

/* ========================================================================== */
/*  Helpers                                                                     */
/* ========================================================================== */

async function getAdminSupabase() {
  return await createClient(true) // service_role
}

/* ========================================================================== */
/*  Soldes                                                                      */
/* ========================================================================== */

/**
 * Récupère le solde du portefeuille central (achat).
 * Conservée pour rétro‑compatibilité.
 */
export async function getWalletBalance(): Promise<number> {
  const supabase = await getAdminSupabase()
  const { data, error } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', ESCROW_USER_ID)
    .single()

  if (error) {
    logger.error(error, 'Erreur récupération solde central')
    throw new Error('Impossible de récupérer le solde central')
  }
  return data?.solde_achat ?? 0
}

/**
 * Récupère les deux soldes (achat et vente) du portefeuille central.
 */
export async function getWalletBalances() {
  const supabase = await getAdminSupabase()
  const { data, error } = await supabase
    .from('portefeuilles')
    .select('solde_achat, solde_vente')
    .eq('id', ESCROW_USER_ID)
    .single()

  if (error) {
    logger.error(error, 'Erreur récupération soldes centraux')
    throw new Error('Impossible de récupérer les soldes')
  }

  return {
    solde_achat: data?.solde_achat ?? 0,
    solde_vente: data?.solde_vente ?? 0,
    total: (data?.solde_achat ?? 0) + (data?.solde_vente ?? 0),
  }
}

/* ========================================================================== */
/*  Transactions                                                               */
/* ========================================================================== */

/**
 * Récupère les transactions récentes du portefeuille central.
 */
export async function getRecentWalletTransactions(limit = 20) {
  const supabase = await getAdminSupabase()
  const { data, error } = await supabase
    .from('transactions')
    .select('id, type, montant, description, created_at')
    .eq('user_id', ESCROW_USER_ID)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    logger.error(error, 'Erreur récupération transactions portefeuille')
    throw new Error('Impossible de récupérer les transactions')
  }
  return data || []
}

/**
 * Récupère le solde d'un utilisateur (par ID).
 */
export async function getUserBalance(userId: string) {
  const supabase = await getAdminSupabase()
  const { data, error } = await supabase
    .from('portefeuilles')
    .select('solde_achat, solde_vente')
    .eq('id', userId)
    .single()

  if (error || !data) {
    logger.warn(`Portefeuille introuvable pour l'utilisateur ${userId}`)
    return null
  }
  return {
    userId,
    solde_achat: data.solde_achat ?? 0,
    solde_vente: data.solde_vente ?? 0,
  }
}

/* ========================================================================== */
/*  Ajustement manuel                                                          */
/* ========================================================================== */

/**
 * Ajuste le solde du portefeuille central (crédit ou débit).
 * Enregistre une transaction de type "ajustement" et journalise l'opération.
 */
export async function adjustCentralWallet(payload: {
  montant: number
  raison?: string
  commentaire?: string
  portefeuille?: 'achat' | 'vente'
}) {
  const supabase = await getAdminSupabase()
  const parsed = adjustmentSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error(`Données d'ajustement invalides: ${parsed.error.message}`)
  }

  const { montant, raison, commentaire, portefeuille } = parsed.data
  const colonne = portefeuille === 'vente' ? 'solde_vente' : 'solde_achat'

  // Lecture du solde actuel
  const { data: wallet, error: readErr } = await supabase
    .from('portefeuilles')
    .select('solde_achat, solde_vente')
    .eq('id', ESCROW_USER_ID)
    .single()

  if (readErr || !wallet) {
    throw new Error('Portefeuille central introuvable')
  }

  const ancienSolde = portefeuille === 'vente' ? wallet.solde_vente : wallet.solde_achat
  const nouveauSolde = ancienSolde + montant

  if (nouveauSolde < 0) {
    throw new Error('Solde insuffisant pour ce débit')
  }

  // Mise à jour
  const { error: updateErr } = await supabase
    .from('portefeuilles')
    .update({ [colonne]: nouveauSolde })
    .eq('id', ESCROW_USER_ID)

  if (updateErr) {
    logger.error(updateErr, 'Erreur ajustement portefeuille central')
    throw new Error(`Erreur lors de l'ajustement: ${updateErr.message}`)
  }

  // Enregistrement de la transaction
  const description = `Ajustement manuel${raison ? ` : ${raison}` : ''}${commentaire ? ` (${commentaire})` : ''}`

  const { error: txErr } = await supabase.from('transactions').insert({
    user_id: ESCROW_USER_ID,
    type: 'ajustement',
    montant,
    description,
    portefeuille_type: portefeuille,
    status: 'approved',
    created_at: new Date().toISOString(),
    metadata: { raison, commentaire },
  })

  if (txErr) {
    logger.error(txErr, 'Erreur enregistrement transaction ajustement')
    // Pas de rollback ici (l'ajustement est déjà fait), mais l'erreur est loggée
  }

  logger.info(`Ajustement portefeuille ${portefeuille} de ${montant} FC. Nouveau solde: ${nouveauSolde}`)

  return {
    ancienSolde,
    nouveauSolde,
    portefeuille,
    montant,
  }
}

/* ========================================================================== */
/*  Statistiques                                                               */
/* ========================================================================== */

/**
 * Récupère les statistiques mensuelles du portefeuille.
 */
export async function getWalletMonthlyStats() {
  const supabase = await getAdminSupabase()
  const now = new Date()
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [ventesMois, achatsMois, rechargesMois, retraitsMois] = await Promise.all([
    supabase.from('transactions').select('montant').eq('type', 'vente').gte('created_at', debutMois),
    supabase.from('transactions').select('montant').eq('type', 'achat').gte('created_at', debutMois),
    supabase.from('transactions').select('montant').eq('type', 'recharge').gte('created_at', debutMois),
    supabase.from('transactions').select('montant').eq('type', 'retrait').gte('created_at', debutMois),
  ])

  const sum = (rows: any[]) => (rows || []).reduce((s, r) => s + (r.montant || 0), 0)

  return {
    ventes: sum(ventesMois.data || []),
    achats: Math.abs(sum(achatsMois.data || [])),
    recharges: sum(rechargesMois.data || []),
    retraits: Math.abs(sum(retraitsMois.data || [])),
  }
}

/**
 * Exporte les transactions du portefeuille central en CSV.
 */
export async function exportWalletTransactionsCSV(): Promise<string> {
  const transactions = await getRecentWalletTransactions(200)
  if (!transactions.length) return ''

  const headers = ['ID', 'Type', 'Montant (FC)', 'Description', 'Date']
  const rows = transactions.map(tx => [
    tx.id,
    tx.type,
    tx.montant,
    tx.description,
    new Date(tx.created_at).toISOString(),
  ])
  return [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
}