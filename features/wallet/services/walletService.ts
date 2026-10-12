// features/wallet/services/walletService.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'

const ESCROW_USER_ID = process.env.ESCROW_USER_ID || 'c0ffee00-0000-0000-0000-000000000ec0'

// Types
export interface Wallet {
  id: string
  solde_achat: number
  solde_vente: number
}

export interface Transaction {
  id: string
  user_id: string
  type: string
  montant: number
  description: string | null
  created_at: string
  commande_id?: string | null
}

/**
 * Récupérer le portefeuille d'un utilisateur
 */
export async function getUserWallet(userId: string): Promise<Wallet> {
  const supabase = await createClient(true)
  const { data, error } = await supabase
    .from('portefeuilles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw new Error('Portefeuille introuvable')
  return data as Wallet
}

/**
 * Recharge du portefeuille achat
 */
export async function rechargeWallet(
  userId: string,
  amountCDF: number,
  method: string,
  phone?: string
): Promise<void> {
  if (amountCDF <= 0) throw new Error('Montant invalide')

  const supabase = await createClient(true)

  const { data: wallet, error: fetchError } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', userId)
    .single()
  if (fetchError || !wallet) throw new Error('Portefeuille introuvable')

  const newBalance = wallet.solde_achat + amountCDF
  const { error: updateError } = await supabase
    .from('portefeuilles')
    .update({ solde_achat: newBalance })
    .eq('id', userId)
  if (updateError) throw new Error('Erreur lors de la recharge')

  await supabase.from('transactions').insert({
    user_id: userId,
    type: 'recharge',
    montant: amountCDF,
    description: `Recharge via ${method}${phone ? ` (${phone})` : ''}`,
    portefeuille_type: 'achat',
    method,
    status: 'approved',
  })
}

/**
 * Débiter le portefeuille achat d'un utilisateur
 */
export async function debitWallet(
  userId: string,
  amountCDF: number,
  type: string,
  description: string,
  commandeId?: string
): Promise<void> {
  const supabase = await createClient(true)
  const { data: wallet } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', userId)
    .single()
  if (!wallet) throw new Error('Portefeuille introuvable')
  if (wallet.solde_achat < amountCDF) throw new Error('Solde insuffisant')

  const newBalance = wallet.solde_achat - amountCDF
  await supabase.from('portefeuilles').update({ solde_achat: newBalance }).eq('id', userId)

  await supabase.from('transactions').insert({
    user_id: userId,
    type,
    montant: -amountCDF,
    description,
    commande_id: commandeId || null,
    portefeuille_type: 'achat',
    status: 'approved',
  })
}

/**
 * Créditer le compte escrow (admin central) après un paiement réussi
 */
export async function creditEscrow(amountCDF: number, commandeId: string): Promise<void> {
  const supabase = await createClient(true)
  const { data: escrow } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', ESCROW_USER_ID)
    .single()
  if (!escrow) throw new Error('Compte escrow introuvable')

  const newBalance = escrow.solde_achat + amountCDF
  await supabase.from('portefeuilles').update({ solde_achat: newBalance }).eq('id', ESCROW_USER_ID)

  await supabase.from('transactions').insert({
    user_id: ESCROW_USER_ID,
    type: 'escrow_in',
    montant: amountCDF,
    description: `Paiement commande #${commandeId}`,
    commande_id: commandeId,
    portefeuille_type: 'achat',
    status: 'approved',
  })
}

/**
 * Rembourser un acheteur depuis l'escrow (annulation de commande)
 */
export async function refundFromEscrow(
  userId: string,
  amountCDF: number,
  commandeId: string
): Promise<void> {
  const supabase = await createClient(true)

  const { data: escrow } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', ESCROW_USER_ID)
    .single()
  if (!escrow || escrow.solde_achat < amountCDF) throw new Error('Fonds insuffisants dans l\'escrow')

  await supabase.from('portefeuilles')
    .update({ solde_achat: escrow.solde_achat - amountCDF })
    .eq('id', ESCROW_USER_ID)

  const { data: acheteur } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', userId)
    .single()
  if (!acheteur) throw new Error('Portefeuille acheteur introuvable')

  await supabase.from('portefeuilles')
    .update({ solde_achat: acheteur.solde_achat + amountCDF })
    .eq('id', userId)

  await supabase.from('transactions').insert([
    {
      user_id: ESCROW_USER_ID,
      type: 'escrow_out',
      montant: -amountCDF,
      description: `Remboursement commande #${commandeId}`,
      commande_id: commandeId,
      portefeuille_type: 'achat',
      status: 'approved',
    },
    {
      user_id: userId,
      type: 'remboursement',
      montant: amountCDF,
      description: `Remboursement commande #${commandeId}`,
      commande_id: commandeId,
      portefeuille_type: 'achat',
      status: 'approved',
    },
  ])
}

/**
 * Historique des transactions d'un utilisateur
 */
export async function getTransactionHistory(
  userId: string,
  limit = 20,
  offset = 0
): Promise<Transaction[]> {
  const supabase = await createClient(true)
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error('Impossible de récupérer les transactions')
  return data as Transaction[]
}