// features/payment/services/paymentService.ts
// Logique métier de paiement : portefeuille interne, mobile money (Orange, Airtel, M‑Pesa)
import { createClient } from '@/lib/supabaseServer'
import { orangeMoney, formatPhoneNumber as formatOrangePhone } from '@/lib/payment/orangeMoney'
import { airtelMoney, formatPhoneNumber as formatAirtelPhone } from '@/lib/payment/airtelMoney'
// import { mpesa, formatPhoneNumber as formatMpesaPhone } from '@/lib/payment/mpesa'

const ESCROW_USER_ID = process.env.ESCROW_USER_ID || 'c0ffee00-0000-0000-0000-000000000ec0'

// ---------------------------------------------------------------------------
// 1. Paiement par portefeuille (appelé depuis la route POST /api/paiement)
// ---------------------------------------------------------------------------
export async function payWithWallet(userId: string, commandeId: string): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient(true)

  // Vérifier la commande
  const { data: commande, error: cmdError } = await supabase
    .from('commandes')
    .select('id, statut, total_global, acheteur_id')
    .eq('id', commandeId)
    .eq('acheteur_id', userId)
    .single()

  if (cmdError || !commande) throw new Error('Commande introuvable')
  if (commande.statut !== 'en_attente') throw new Error(`Commande déjà ${commande.statut}`)

  // Vérifier le solde
  const { data: wallet, error: walletError } = await supabase
    .from('portefeuilles')
    .select('solde_achat')
    .eq('id', userId)
    .single()

  if (walletError || !wallet) throw new Error('Portefeuille introuvable')
  if (wallet.solde_achat < commande.total_global) throw new Error('Solde insuffisant')

  // Appeler la mise à jour du statut (qui débite et crédite l'escrow)
  const { error: updateError } = await supabase.functions.invoke('update-status', {
    body: { commande_id: commandeId, statut: 'payee' },
  }) // Alternative : directement appeler la fonction interne
  // Ici, on peut réutiliser la logique de update-status en interne, mais pour ne pas créer de boucle,
  // on va reproduire la logique de débit/crédit (voir plus bas).

  // Solution simple : on appelle l'endpoint interne via fetch, comme le fait la route actuelle.
  // On garde cette approche pour ne pas dupliquer la logique critique.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/commandes/update-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commande_id: commandeId, statut: 'payee' }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Échec du paiement')
  }
  return { success: true, message: 'Paiement effectué avec succès' }
}

// ---------------------------------------------------------------------------
// 2. Initiation d'un paiement Mobile Money
// ---------------------------------------------------------------------------
export async function initiateMobilePayment(
  commandeId: string,
  userId: string,
  method: 'orange' | 'airtel' | 'mpesa',
  phone: string,
  amountCDF: number,
): Promise<{ success: boolean; transactionId?: string; status: string; message?: string }> {
  const supabase = await createClient(true)

  // Vérifier la commande
  const { data: commande, error: cmdError } = await supabase
    .from('commandes')
    .select('id, statut, total_global, acheteur_id')
    .eq('id', commandeId)
    .eq('acheteur_id', userId)
    .single()

  if (cmdError || !commande) throw new Error('Commande introuvable')
  if (commande.statut !== 'en_attente') throw new Error(`Paiement impossible : commande déjà ${commande.statut}`)

  let formattedPhone: string
  let paymentResponse: { success: boolean; transactionId?: string; status: string; message?: string }

  const reference = `GERC-${commandeId.substring(0, 8)}-${Date.now()}`

  switch (method) {
    case 'orange':
      formattedPhone = formatOrangePhone(phone)
      paymentResponse = await orangeMoney.requestPayment({
        amount: amountCDF,
        customerPhone: formattedPhone,
        reference,
        description: `Commande #${commandeId}`,
      })
      break
    case 'airtel':
      formattedPhone = formatAirtelPhone(phone)
      paymentResponse = await airtelMoney.requestPayment({
        amount: amountCDF,
        customerPhone: formattedPhone,
        reference,
        description: `Commande #${commandeId}`,
      })
      break
    case 'mpesa':
      // Simulation / placeholder
      formattedPhone = '243' + phone.replace(/^0/, '').replace(/\D/g, '')
      paymentResponse = {
        success: true,
        transactionId: `MPESA-SIM-${Date.now()}`,
        status: 'pending',
        message: 'Paiement initié (simulation)',
      }
      break
    default:
      throw new Error('Méthode de paiement non supportée')
  }

  if (!paymentResponse.success) throw new Error(paymentResponse.message || 'Échec de la demande de paiement')

  // Enregistrer la transaction en attente
  const { error: txError } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'achat',
    montant: -amountCDF,
    commande_id: commandeId,
    description: `Paiement ${method.toUpperCase()} – Commande #${commandeId}`,
    method,
    phone,
    portefeuille_type: 'achat',
    status: 'pending',
    metadata: { paymentReference: reference, externalId: paymentResponse.transactionId },
  })

  if (txError) console.error('Erreur enregistrement transaction mobile money:', txError)

  return {
    success: true,
    transactionId: paymentResponse.transactionId,
    status: paymentResponse.status,
    message: 'Demande de paiement envoyée',
  }
}

// ---------------------------------------------------------------------------
// 3. Confirmation d'un paiement Mobile Money (appelé par le webhook)
// ---------------------------------------------------------------------------
export async function confirmMobilePayment(
  transactionId: string,
  provider: string,
  newStatus: 'approved' | 'rejected'
): Promise<void> {
  const supabase = await createClient(true)

  // Rechercher la transaction en attente
  const { data: pendingTx, error: fetchError } = await supabase
    .from('transactions')
    .select('id, commande_id, status, metadata')
    .eq('status', 'pending')
    .eq('type', 'achat')
    .filter('metadata->>externalId', 'eq', transactionId)
    .maybeSingle()

  if (fetchError || !pendingTx) {
    // Essayer par référence
    const match = referenceFromExternalId?.(transactionId)
    if (match) {
      // ... (logique déjà existante dans le webhook)
    }
    throw new Error('Transaction introuvable')
  }

  if (pendingTx.status !== 'pending') {
    // Déjà traitée
    return
  }

  // Mettre à jour la transaction
  const { error: updateTxError } = await supabase
    .from('transactions')
    .update({
      status: newStatus,
      metadata: { ...pendingTx.metadata, webhook: { status: newStatus, resolvedAt: new Date().toISOString() } },
    })
    .eq('id', pendingTx.id)

  if (updateTxError) throw new Error('Erreur mise à jour transaction')

  // Si approuvé, basculer la commande en payée
  if (newStatus === 'approved' && pendingTx.commande_id) {
    const { data: commande } = await supabase
      .from('commandes')
      .select('statut')
      .eq('id', pendingTx.commande_id)
      .single()

    if (commande?.statut === 'en_attente') {
      // Appeler update-status
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      await fetch(`${baseUrl}/api/commandes/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commande_id: pendingTx.commande_id, statut: 'payee' }),
      })
    }
  }
}