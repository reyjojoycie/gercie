// app/api/paiement/route.ts
// ---------------------------------------------------------------------------
// API de paiement – USD source principale, CDF recalculé serveur
// Portefeuille, Mobile Money, Carte, Virement, Paiement à la livraison
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import {
  sendEmail,
  sendSMS,
  createNotification,
} from '@/lib/notifications'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type PaymentMethodType =
  | 'wallet'
  | 'mobile_money'
  | 'card'
  | 'bank_transfer'
  | 'cash_on_delivery'
  | 'unknown'

interface NormalizedPaymentMethod {
  code: string
  type: PaymentMethodType
  provider: string | null
  requiresPhone: boolean
}

interface OrderForPayment {
  id: string
  statut: string
  acheteur_id: string
  numero_commande: string
  currency?: string | null

  total_usd?: number | null
  total_cdf?: number | null
  total_global?: number | null

  subtotal_usd?: number | null
  subtotal_cdf?: number | null

  reduction_usd?: number | null
  reduction_cdf?: number | null

  shipping_usd?: number | null
  shipping_cdf?: number | null

  exchange_rate?: number | null
  shipping_rate_used?: number | null
}

interface TransactionInsertPayload {
  id: string
  userId: string
  type: string
  amountCdf: number
  amountUsd: number
  commandeId: string
  description: string
  method: string
  provider?: string | null
  status: string
  externalId?: string | null
  idempotencyKey?: string | null
  phone?: string | null
  metadata: Record<string, any>
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS NUMÉRIQUES                                             */
/* ═══════════════════════════════════════════════════════════════ */

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

  return Number.isFinite(n) && n > 0 ? n : null
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined

  const n = Number(value)

  return Number.isFinite(n) ? n : undefined
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round(value + Number.EPSILON)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return roundCdf(usd * rate)
}

function toUsd(cdf: number, rate: number): number {
  if (!Number.isFinite(cdf) || cdf <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return round2(cdf / rate)
}

function formatUsd(value: number): string {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0
  return `$${n.toFixed(2)}`
}

function formatCdf(value: number): string {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0
  return `${Math.round(n).toLocaleString('fr-FR')} FC`
}

function removeUndefined(obj: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = value
    }
  }

  return clean
}

function maskPhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '')

  if (digits.length <= 4) return '****'

  return `****${digits.slice(-4)}`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ERROR DETECTION SUPABASE / POSTGRES                            */
/* ═══════════════════════════════════════════════════════════════ */

function isMissingTableError(error: any): boolean {
  const code = error?.code
  const message = String(error?.message || '')

  return (
    code === '42P01' ||
    /relation .* does not exist|table .* does not exist|could not find the relationship/i.test(
      message
    )
  )
}

function isMissingColumnError(error: any): boolean {
  const code = error?.code
  const message = String(error?.message || '')

  return (
    code === '42703' ||
    code === '42701' ||
    /column .* does not exist|could not find the .* column|schema cache.*could not find/i.test(
      message
    )
  )
}

function isNoRowsError(error: any): boolean {
  return error?.code === 'PGRST116'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SECURITY / METADATA                                            */
/* ═══════════════════════════════════════════════════════════════ */

const SENSITIVE_METADATA_KEYS = new Set([
  'card',
  'card_number',
  'cardnumber',
  'number',
  'pan',
  'cvv',
  'cvc',
  'pin',
  'password',
  'secret',
  'expiry',
  'expiration',
  'holder',
  'cardholder',
  'save_card',
  'saveCard',
])

function sanitizeMetadata(input: any): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }

  const clean: Record<string, any> = {}

  for (const [key, value] of Object.entries(input)) {
    const lower = String(key || '').toLowerCase()

    if (SENSITIVE_METADATA_KEYS.has(lower)) continue

    clean[key] = value
  }

  return clean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAYMENT METHOD NORMALIZATION                                   */
/* ═══════════════════════════════════════════════════════════════ */

function normalizePaymentMethod(raw: unknown): NormalizedPaymentMethod {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')

  if (
    value === 'wallet' ||
    value === 'portefeuille' ||
    value === 'gercie_wallet' ||
    value === 'gercie_wallet' ||
    value === 'balance'
  ) {
    return {
      code: 'wallet',
      type: 'wallet',
      provider: null,
      requiresPhone: false,
    }
  }

  if (
    value === 'orange' ||
    value === 'orange_money' ||
    value === 'orangemoney' ||
    value === 'orange_money_mobile'
  ) {
    return {
      code: 'orange',
      type: 'mobile_money',
      provider: 'orange',
      requiresPhone: true,
    }
  }

  if (
    value === 'airtel' ||
    value === 'airtel_money' ||
    value === 'airtelmoney' ||
    value === 'airtel_money_mobile'
  ) {
    return {
      code: 'airtel',
      type: 'mobile_money',
      provider: 'airtel',
      requiresPhone: true,
    }
  }

  if (
    value === 'mpesa' ||
    value === 'm_pesa' ||
    value === 'safaricom' ||
    value === 'mpesa_mobile'
  ) {
    return {
      code: 'mpesa',
      type: 'mobile_money',
      provider: 'mpesa',
      requiresPhone: true,
    }
  }

  if (
    value === 'card' ||
    value === 'carte' ||
    value === 'credit_card' ||
    value === 'debit_card' ||
    value === 'visa' ||
    value === 'mastercard' ||
    value === 'amex' ||
    value === 'stripe'
  ) {
    return {
      code: 'card',
      type: 'card',
      provider: 'card',
      requiresPhone: false,
    }
  }

  if (
    value === 'bank_transfer' ||
    value === 'virement' ||
    value === 'transfer' ||
    value === 'wire'
  ) {
    return {
      code: 'bank_transfer',
      type: 'bank_transfer',
      provider: 'bank_transfer',
      requiresPhone: false,
    }
  }

  if (
    value === 'cash_on_delivery' ||
    value === 'cod' ||
    value === 'paiement_livraison' ||
    value === 'livraison' ||
    value === 'cash'
  ) {
    return {
      code: 'cash_on_delivery',
      type: 'cash_on_delivery',
      provider: 'cash_on_delivery',
      requiresPhone: false,
    }
  }

  return {
    code: value || 'unknown',
    type: 'unknown',
    provider: null,
    requiresPhone: false,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMA                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const paymentSchema = z
  .object({
    commande_id: z.string().min(1, 'commande_id requis'),

    method: z.string().min(1, 'method requis'),

    /**
     * Montant affiché / soumis par le client.
     * Peut être USD ou CDF selon currency.
     * Le serveur ne l’utilise jamais comme vérité absolue si USD principal existe.
     */
    amount: z.number().min(0).optional(),

    /** USD principal, si le client l’envoie. */
    amount_usd: z.number().min(0).optional(),

    /** CDF calculé côté client, seulement fallback. */
    amount_cdf: z.number().min(0).optional(),

    currency: z.enum(['USD', 'CDF']).default('USD'),

    /** Taux client, utilisé seulement si le serveur n’a pas de taux officiel. */
    exchange_rate: z.number().positive().optional(),

    idempotency_key: z.string().max(180).optional(),

    phone: z.string().optional(),
    pin: z.string().max(6).optional(),
    owner_name: z.string().max(120).optional(),

    /** Token carte sécurisé. Jamais de numéro brut en production. */
    card_token: z.string().optional(),
    payment_method_id: z.string().optional(),
    save_card: z.boolean().optional(),

    /** Données carte brutes : refusées sauf simulation explicitement activée. */
    card: z
      .object({
        number: z.string().optional(),
        holder: z.string().optional(),
        expiry: z.string().optional(),
        cvv: z.string().optional(),
        brand: z.string().optional(),
      })
      .optional(),

    metadata: z.record(z.any()).optional(),

    /** Totaux optionnels envoyés par la page paiement pour traçabilité. */
    total_usd: z.number().min(0).optional(),
    total_cdf: z.number().min(0).optional(),

    subtotal_usd: z.number().min(0).optional(),
    subtotal_cdf: z.number().min(0).optional(),

    reduction_usd: z.number().min(0).optional(),
    reduction_cdf: z.number().min(0).optional(),

    shipping_usd: z.number().min(0).optional(),
    shipping_cdf: z.number().min(0).optional(),
  })
  .passthrough()

/* ═══════════════════════════════════════════════════════════════ */
/*  SERVER RATE                                                    */
/* ═══════════════════════════════════════════════════════════════ */

function resolveRateFromRow(row: any): number | null {
  return positiveNumber(
    row?.rate ??
      row?.usd_rate ??
      row?.taux ??
      row?.value ??
      row?.data?.rate ??
      row?.current?.rate
  )
}

async function getServerUsdRate(supabase: any): Promise<number | null> {
  const attempts = [
    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .eq('currency', 'USD')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .eq('devise', 'USD')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('exchange_rates')
        .select('*')
        .limit(1)
        .maybeSingle(),
  ]

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt()

      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data
        const rate = resolveRateFromRow(row)

        if (rate) return round2(rate)
      }

      if (isMissingTableError(error)) {
        break
      }

      if (isMissingColumnError(error)) {
        continue
      }
    } catch (err) {
      logger.warn({ err }, 'Exception lecture exchange_rates')
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ORDER FETCH                                                    */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeOrderRow(row: any): OrderForPayment | null {
  if (!row?.id) return null

  return {
    id: String(row.id),
    statut: String(row.statut || row.status || '').toLowerCase(),
    acheteur_id: String(row.acheteur_id || row.user_id || ''),
    numero_commande: String(
      row.numero_commande || row.numero || row.id
    ),

    currency: row.currency ?? null,

    total_usd: optionalNumber(row.total_usd ?? row.totalUSD),
    total_cdf: optionalNumber(
      row.total_cdf ?? row.totalCDF ?? row.total_global ?? row.total
    ),
    total_global: optionalNumber(row.total_global ?? row.total),

    subtotal_usd: optionalNumber(row.subtotal_usd ?? row.subtotalUSD),
    subtotal_cdf: optionalNumber(row.subtotal_cdf ?? row.subtotalCDF),

    reduction_usd: optionalNumber(
      row.reduction_usd ?? row.remise_usd ?? row.discount_usd
    ),
    reduction_cdf: optionalNumber(
      row.reduction_cdf ?? row.remise_cdf ?? row.reduction ?? row.discount
    ),

    shipping_usd: optionalNumber(
      row.shipping_usd ?? row.frais_livraison_usd
    ),
    shipping_cdf: optionalNumber(
      row.shipping_cdf ?? row.frais_livraison
    ),

    exchange_rate: optionalNumber(row.exchange_rate),
    shipping_rate_used: optionalNumber(row.shipping_rate_used),
  }
}

async function fetchOrderForPayment(
  supabase: any,
  commandeId: string,
  userId: string
): Promise<OrderForPayment | null> {
  const columnSets = [
    'id, statut, acheteur_id, numero_commande, currency, total_usd, total_cdf, total_global, subtotal_usd, subtotal_cdf, reduction_usd, reduction_cdf, shipping_usd, shipping_cdf, exchange_rate, shipping_rate_used',

    'id, statut, acheteur_id, numero_commande, total_usd, total_cdf, total_global',

    'id, statut, acheteur_id, numero_commande, total_global, total_cdf',

    'id, statut, acheteur_id, numero_commande, total_global',

    'id, statut, acheteur_id, numero_commande',
  ]

  for (const columns of columnSets) {
    try {
      const { data, error } = await supabase
        .from('commandes')
        .select(columns)
        .eq('id', commandeId)
        .eq('acheteur_id', userId)
        .single()

      if (!error && data) {
        return normalizeOrderRow(data)
      }

      if (isMissingTableError(error)) {
        return null
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn(
        { error, commandeId, userId },
        'Erreur fetch commande pour paiement'
      )
    } catch (err) {
      logger.warn(
        { err, commandeId, userId },
        'Exception fetch commande pour paiement'
      )
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  AMOUNT RESOLUTION                                              */
/* ═══════════════════════════════════════════════════════════════ */

function resolveOrderExpectedUsd(
  order: OrderForPayment,
  rate: number
): number {
  const directUsd = positiveNumber(order.total_usd)

  if (directUsd != null && directUsd > 0) {
    return round2(directUsd)
  }

  const directCdf =
    positiveNumber(order.total_cdf) ??
    positiveNumber(order.total_global)

  if (directCdf != null && directCdf > 0 && rate > 0) {
    return round2(toUsd(directCdf, rate))
  }

  return 0
}

function resolveRequestedUsd(
  body: any,
  rate: number
): number {
  const directUsd = positiveNumber(body.amount_usd)

  if (directUsd != null && directUsd > 0) {
    return round2(directUsd)
  }

  if (body.currency === 'USD') {
    const usd = positiveNumber(body.amount)

    if (usd != null && usd > 0) {
      return round2(usd)
    }
  }

  const directCdf = positiveNumber(body.amount_cdf)

  if (directCdf != null && directCdf > 0 && rate > 0) {
    return round2(toUsd(directCdf, rate))
  }

  if (body.currency === 'CDF') {
    const cdf = positiveNumber(body.amount)

    if (cdf != null && cdf > 0 && rate > 0) {
      return round2(toUsd(cdf, rate))
    }
  }

  return 0
}

function amountsClose(
  requestedUsd: number,
  expectedUsd: number
): boolean {
  if (!Number.isFinite(requestedUsd) || !Number.isFinite(expectedUsd)) {
    return false
  }

  const tolerance = Math.max(0.02, Math.abs(expectedUsd) * 0.01)

  return Math.abs(requestedUsd - expectedUsd) <= tolerance
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TRANSACTIONS                                                   */
/* ═══════════════════════════════════════════════════════════════ */

async function insertTransaction(
  supabase: any,
  payload: TransactionInsertPayload
): Promise<{
  data: any | null
  error: any | null
  missingTable: boolean
}> {
  const base = {
    id: payload.id,
    user_id: payload.userId,
    type: payload.type,
    montant: payload.amountCdf,
    commande_id: payload.commandeId,
    description: payload.description,
    method: payload.method,
    status: payload.status,
    metadata: payload.metadata,
  }

  const attempts = [
    {
      name: 'full',
      data: {
        ...base,
        montant_usd: payload.amountUsd,
        provider: payload.provider,
        external_transaction_id: payload.externalId,
        idempotency_key: payload.idempotencyKey,
        phone: payload.phone,
        created_at: new Date().toISOString(),
      },
    },
    {
      name: 'no_provider',
      data: {
        ...base,
        montant_usd: payload.amountUsd,
        external_transaction_id: payload.externalId,
        idempotency_key: payload.idempotencyKey,
        phone: payload.phone,
        created_at: new Date().toISOString(),
      },
    },
    {
      name: 'no_idempotency',
      data: {
        ...base,
        montant_usd: payload.amountUsd,
        external_transaction_id: payload.externalId,
        phone: payload.phone,
        created_at: new Date().toISOString(),
      },
    },
    {
      name: 'minimal',
      data: {
        ...base,
        created_at: new Date().toISOString(),
      },
    },
  ]

  let lastError: any = null

  for (const attempt of attempts) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert(removeUndefined(attempt.data))
        .select()
        .single()

      if (!error && data) {
        return { data, error: null, missingTable: false }
      }

      lastError = error

      if (isMissingTableError(error)) {
        return { data: null, error, missingTable: true }
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.error(
        { error, attempt: attempt.name },
        'Échec insertion transaction'
      )

      return { data: null, error, missingTable: false }
    } catch (err: any) {
      lastError = err

      if (isMissingTableError(err)) {
        return { data: null, error: err, missingTable: true }
      }

      if (isMissingColumnError(err)) {
        continue
      }

      logger.error(
        { err, attempt: attempt.name },
        'Exception insertion transaction'
      )

      return { data: null, error: err, missingTable: false }
    }
  }

  return { data: null, error: lastError, missingTable: false }
}

async function updateTransactionStatus(
  supabase: any,
  transactionId: string | null | undefined,
  status: string,
  extra: Record<string, any> = {}
): Promise<void> {
  if (!transactionId) return

  const attempts = [
    {
      name: 'full',
      data: {
        status,
        updated_at: new Date().toISOString(),
        ...extra,
      },
    },
    {
      name: 'no_updated_at',
      data: {
        status,
        ...extra,
      },
    },
    {
      name: 'minimal',
      data: {
        status,
      },
    },
  ]

  for (const attempt of attempts) {
    try {
      const { error } = await supabase
        .from('transactions')
        .update(removeUndefined(attempt.data))
        .eq('id', transactionId)

      if (!error) return

      if (isMissingTableError(error)) return

      if (isMissingColumnError(error)) continue

      logger.warn(
        { error, transactionId, status },
        'Échec mise à jour statut transaction'
      )
    } catch (err) {
      logger.warn(
        { err, transactionId, status },
        'Exception mise à jour statut transaction'
      )
    }
  }
}

async function findExistingTransaction(
  supabase: any,
  commandeId: string,
  methodCode: string
): Promise<any | null> {
  const attempts = [
    async () =>
      await supabase
        .from('transactions')
        .select(
          'id, status, external_transaction_id, method, commande_id, created_at, metadata'
        )
        .eq('commande_id', commandeId)
        .eq('method', methodCode)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    async () =>
      await supabase
        .from('transactions')
        .select('*')
        .eq('commande_id', commandeId)
        .eq('method', methodCode)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
  ]

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt()

      if (!error && data) {
        const status = String(data.status || '').toLowerCase()

        if (status === 'pending' || status === 'approved') {
          return data
        }
      }

      if (isMissingTableError(error)) return null

      if (isMissingColumnError(error)) continue
    } catch (err) {
      logger.warn(
        { err, commandeId, methodCode },
        'Exception recherche transaction existante'
      )
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ORDER STATUS UPDATE                                            */
/* ═══════════════════════════════════════════════════════════════ */

async function markOrderPaid(
  supabase: any,
  commandeId: string,
  transactionId: string | null,
  methodCode: string | null
): Promise<{
  data: any | null
  error: any | null
  conflict: boolean
}> {
  const now = new Date().toISOString()

  const attempts = [
    {
      name: 'full',
      data: {
        statut: 'payee',
        paid_at: now,
        payment_method: methodCode,
        transaction_id: transactionId,
        updated_at: now,
      },
    },
    {
      name: 'no_transaction_id',
      data: {
        statut: 'payee',
        paid_at: now,
        payment_method: methodCode,
        updated_at: now,
      },
    },
    {
      name: 'no_payment_method',
      data: {
        statut: 'payee',
        paid_at: now,
        updated_at: now,
      },
    },
    {
      name: 'minimal',
      data: {
        statut: 'payee',
      },
    },
  ]

  let lastError: any = null

  for (const attempt of attempts) {
    try {
      const { data, error } = await supabase
        .from('commandes')
        .update(removeUndefined(attempt.data))
        .eq('id', commandeId)
        .eq('statut', 'en_attente')
        .select('id, statut')
        .single()

      if (!error && data) {
        return { data, error: null, conflict: false }
      }

      lastError = error

      if (isNoRowsError(error)) {
        return { data: null, error: null, conflict: true }
      }

      if (isMissingTableError(error)) {
        return { data: null, error, conflict: false }
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.error(
        { error, commandeId, attempt: attempt.name },
        'Échec mise à jour statut commande'
      )

      return { data: null, error, conflict: false }
    } catch (err: any) {
      lastError = err

      if (isNoRowsError(err)) {
        return { data: null, error: null, conflict: true }
      }

      if (isMissingTableError(err)) {
        return { data: null, error: err, conflict: false }
      }

      if (isMissingColumnError(err)) {
        continue
      }

      logger.error(
        { err, commandeId, attempt: attempt.name },
        'Exception mise à jour statut commande'
      )

      return { data: null, error: err, conflict: false }
    }
  }

  return { data: null, error: lastError, conflict: false }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  WALLET                                                         */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchWallet(supabase: any, userId: string): Promise<any | null> {
  const attempts = [
    async () =>
      await supabase
        .from('portefeuilles')
        .select('id, solde_achat, updated_at')
        .eq('id', userId)
        .single(),

    async () =>
      await supabase
        .from('portefeuilles')
        .select('solde_achat')
        .eq('id', userId)
        .single(),

    async () =>
      await supabase
        .from('portefeuilles')
        .select('*')
        .eq('id', userId)
        .single(),
  ]

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt()

      if (!error && data) return data

      if (isMissingTableError(error)) return null

      if (isMissingColumnError(error)) continue
    } catch (err) {
      logger.warn({ err, userId }, 'Exception fetch portefeuille')
    }
  }

  return null
}

async function debitWalletOptimistic(
  supabase: any,
  userId: string,
  oldSolde: number,
  amountCdf: number
): Promise<{
  data: any | null
  error: any | null
  newSolde: number
}> {
  const newSolde = roundCdf(oldSolde - amountCdf)
  const now = new Date().toISOString()

  const attempts = [
    {
      name: 'with_updated_at',
      data: {
        solde_achat: newSolde,
        updated_at: now,
      },
    },
    {
      name: 'minimal',
      data: {
        solde_achat: newSolde,
      },
    },
  ]

  for (const attempt of attempts) {
    try {
      const { data, error } = await supabase
        .from('portefeuilles')
        .update(removeUndefined(attempt.data))
        .eq('id', userId)
        .eq('solde_achat', oldSolde)
        .select('id, solde_achat')
        .single()

      if (!error && data) {
        return { data, error: null, newSolde }
      }

      if (isNoRowsError(error)) {
        return {
          data: null,
          error: {
            code: 'CONCURRENT_WALLET_UPDATE',
            message:
              'Le solde du portefeuille a changé entre-temps. Réessayez.',
          },
          newSolde,
        }
      }

      if (isMissingTableError(error)) {
        return { data: null, error, newSolde }
      }

      if (isMissingColumnError(error)) {
        continue
      }

      return { data: null, error, newSolde }
    } catch (err: any) {
      if (isNoRowsError(err)) {
        return {
          data: null,
          error: {
            code: 'CONCURRENT_WALLET_UPDATE',
            message:
              'Le solde du portefeuille a changé entre-temps. Réessayez.',
          },
          newSolde,
        }
      }

      logger.error(
        { err, userId, attempt: attempt.name },
        'Exception débit portefeuille'
      )

      return { data: null, error: err, newSolde }
    }
  }

  return {
    data: null,
    error: {
      code: 'WALLET_DEBIT_FAILED',
      message: 'Impossible de débiter le portefeuille.',
    },
    newSolde,
  }
}

async function refundWalletOptimistic(
  supabase: any,
  userId: string,
  currentSolde: number,
  amountCdf: number
): Promise<boolean> {
  const restoredSolde = roundCdf(currentSolde + amountCdf)
  const now = new Date().toISOString()

  const attempts = [
    {
      name: 'with_updated_at',
      data: {
        solde_achat: restoredSolde,
        updated_at: now,
      },
    },
    {
      name: 'minimal',
      data: {
        solde_achat: restoredSolde,
      },
    },
  ]

  for (const attempt of attempts) {
    try {
      const { data, error } = await supabase
        .from('portefeuilles')
        .update(removeUndefined(attempt.data))
        .eq('id', userId)
        .eq('solde_achat', currentSolde)
        .select('id, solde_achat')
        .single()

      if (!error && data) return true

      if (isMissingTableError(error)) return false

      if (isMissingColumnError(error)) continue
    } catch (err) {
      logger.error(
        { err, userId, attempt: attempt.name },
        'Exception remboursement portefeuille'
      )
    }
  }

  return false
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NOTIFICATIONS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

async function notifyPaymentEvent(params: {
  supabase: any
  userId: string
  commandeNumero: string
  amountUsd: number
  amountCdf: number
  methodLabel: string
  status: 'pending' | 'approved'
}): Promise<void> {
  try {
    const {
      supabase,
      userId,
      commandeNumero,
      amountUsd,
      amountCdf,
      methodLabel,
      status,
    } = params

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, telephone')
      .eq('id', userId)
      .single()
      .catch(() => ({ data: null }))

    const title =
      status === 'approved'
        ? 'Paiement validé'
        : 'Paiement en attente'

    const amountLabel = `${formatUsd(amountUsd)} ≈ ${formatCdf(amountCdf)}`

    const body =
      status === 'approved'
        ? `Votre commande #${commandeNumero} a été réglée via ${methodLabel} pour ${amountLabel}.`
        : `Votre commande #${commandeNumero} est en attente de validation via ${methodLabel} pour ${amountLabel}.`

    await createNotification(userId, 'paiement', title, body).catch(
      (err: any) => {
        logger.warn({ err }, 'createNotification indisponible')
      }
    )

    if (profile?.email) {
      await sendEmail(
        profile.email,
        `${title} - Commande #${commandeNumero}`,
        body
      ).catch((err: any) => {
        logger.warn({ err }, 'sendEmail indisponible')
      })
    }

    if (profile?.telephone) {
      await sendSMS(
        profile.telephone,
        `Gercie: ${body}`
      ).catch((err: any) => {
        logger.warn({ err }, 'sendSMS indisponible')
      })
    }
  } catch (err) {
    logger.warn({ err }, 'Notifications paiement indisponibles')
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MOBILE MONEY FORMAT                                            */
/* ═══════════════════════════════════════════════════════════════ */

function formatMobilePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '')

  if (!digits) return ''

  if (digits.startsWith('243')) return digits

  if (digits.startsWith('0')) {
    return `243${digits.slice(1)}`
  }

  return `243${digits}`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `paiement:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error:
            'Trop de tentatives de paiement. Veuillez patienter une minute.',
          code: 'RATE_LIMITED',
        },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  let supabase: any

  try {
    const raw = await createClient(true)
    supabase = raw instanceof Promise ? await raw : raw
  } catch (err: any) {
    logger.error({ err }, 'Initialisation Supabase échouée')

    return NextResponse.json(
      {
        error: 'Service de paiement temporairement indisponible.',
        code: 'SUPABASE_UNAVAILABLE',
      },
      { status: 500 }
    )
  }

  if (!supabase) {
    return NextResponse.json(
      {
        error: 'Service de paiement temporairement indisponible.',
        code: 'SUPABASE_UNAVAILABLE',
      },
      { status: 500 }
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        {
          error: 'Authentification requise pour cette opération.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      )
    }

    let body: any

    try {
      const json = await request.json()
      const parsed = paymentSchema.safeParse(json)

      if (!parsed.success) {
        logger.warn(
          {
            userId: user.id,
            errors: parsed.error.flatten(),
          },
          'Données de paiement invalides interceptées'
        )

        return NextResponse.json(
          {
            error:
              'Données de paiement mal formées ou incomplètes.',
            code: 'VALIDATION_ERROR',
            details: parsed.error.flatten(),
          },
          { status: 400 }
        )
      }

      body = parsed.data
    } catch (err: any) {
      return NextResponse.json(
        {
          error: 'JSON invalide.',
          code: 'INVALID_JSON',
          details: err?.message,
        },
        { status: 400 }
      )
    }

    const normalizedMethod = normalizePaymentMethod(body.method)

    if (normalizedMethod.type === 'unknown') {
      return NextResponse.json(
        {
          error: 'Mode de paiement non supporté.',
          code: 'UNSUPPORTED_METHOD',
        },
        { status: 400 }
      )
    }

    const phone = String(body.phone || '').trim()

    if (normalizedMethod.requiresPhone && !phone) {
      return NextResponse.json(
        {
          error:
            'Le numéro de téléphone est requis pour ce mode de paiement.',
          code: 'PHONE_REQUIRED',
        },
        { status: 400 }
      )
    }

    const order = await fetchOrderForPayment(
      supabase,
      body.commande_id,
      user.id
    )

    if (!order) {
      return NextResponse.json(
        {
          error:
            'Commande introuvable ou non associée à votre compte.',
          code: 'ORDER_NOT_FOUND',
        },
        { status: 404 }
      )
    }

    if (
      order.statut === 'payee' ||
      order.statut === 'paid' ||
      order.statut === 'confirmee' ||
      order.statut === 'confirmed'
    ) {
      return NextResponse.json(
        {
          error: 'Cette commande est déjà payée.',
          code: 'ORDER_ALREADY_PAID',
          status: 'approved',
        },
        { status: 400 }
      )
    }

    if (order.statut !== 'en_attente') {
      return NextResponse.json(
        {
          error: `Le paiement ne peut pas être initié car la commande est déjà au statut : ${order.statut}.`,
          code: 'INVALID_ORDER_STATUS',
        },
        { status: 400 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Taux serveur prioritaire                                     */
    /* ------------------------------------------------------------ */

    const serverRate = await getServerUsdRate(supabase)
    const clientRate = positiveNumber(body.exchange_rate)

    const rate = serverRate ?? clientRate
    const rateSource = serverRate ? 'server' : 'client_fallback'

    if (!rate || rate <= 0) {
      return NextResponse.json(
        {
          error:
            'Le taux USD/CDF officiel est indisponible. Le paiement ne peut pas être validé.',
          code: 'RATE_MISSING',
        },
        { status: 500 }
      )
    }

    /* ------------------------------------------------------------ */
    /* USD = source principale                                        */
    /* ------------------------------------------------------------ */

    const expectedUsd = resolveOrderExpectedUsd(order, rate)
    const requestedUsd = resolveRequestedUsd(body, rate)

    let amountUsd = 0

    if (expectedUsd > 0) {
      amountUsd = expectedUsd

      if (
        requestedUsd > 0 &&
        !amountsClose(requestedUsd, expectedUsd)
      ) {
        return NextResponse.json(
          {
            error: `Le montant soumis (${formatUsd(
              requestedUsd
            )}) diverge du montant de commande (${formatUsd(
              expectedUsd
            )}).`,
            code: 'AMOUNT_MISMATCH',
            expected_usd: expectedUsd,
            requested_usd: requestedUsd,
          },
          { status: 400 }
        )
      }
    } else if (requestedUsd > 0) {
      amountUsd = requestedUsd
    } else {
      return NextResponse.json(
        {
          error:
            'Le montant USD de la commande est indisponible.',
          code: 'AMOUNT_UNAVAILABLE',
        },
        { status: 400 }
      )
    }

    const amountCdf = toCdf(amountUsd, rate)

    if (amountUsd <= 0 || amountCdf <= 0) {
      return NextResponse.json(
        {
          error: 'Montant de paiement invalide.',
          code: 'INVALID_AMOUNT',
        },
        { status: 400 }
      )
    }

    const idempotencyKey =
      String(body.idempotency_key || '').trim() ||
      `${body.commande_id}:${normalizedMethod.code}:${Math.round(
        amountUsd * 100
      )}`

    const safeMetadata = sanitizeMetadata({
      ...(body.metadata || {}),
      requested_currency: body.currency,
      requested_amount: body.amount,
      requested_amount_usd: body.amount_usd,
      requested_amount_cdf: body.amount_cdf,
      amount_usd: amountUsd,
      amount_cdf: amountCdf,
      exchange_rate: rate,
      rate_source: rateSource,
      order_numero: order.numero_commande,
      idempotency_key: idempotencyKey,
      owner_name: body.owner_name || null,
    })

    const existingTransaction = await findExistingTransaction(
      supabase,
      body.commande_id,
      normalizedMethod.code
    )

    if (existingTransaction) {
      const existingStatus = String(
        existingTransaction.status || ''
      ).toLowerCase()

      if (existingStatus === 'pending') {
        return NextResponse.json(
          {
            success: true,
            message:
              'Une transaction de paiement est déjà en cours pour cette commande.',
            status: 'pending',
            transactionId:
              existingTransaction.external_transaction_id ||
              existingTransaction.id,
            amount_usd: amountUsd,
            amount_cdf: amountCdf,
            exchange_rate: rate,
          },
          { status: 200 }
        )
      }

      if (existingStatus === 'approved') {
        return NextResponse.json(
          {
            success: true,
            message:
              'Cette commande a déjà été payée.',
            status: 'approved',
            transactionId:
              existingTransaction.external_transaction_id ||
              existingTransaction.id,
            amount_usd: amountUsd,
            amount_cdf: amountCdf,
            exchange_rate: rate,
          },
          { status: 200 }
        )
      }
    }

    /* ------------------------------------------------------------ */
    /* WALLET                                                       */
    /* ------------------------------------------------------------ */

    if (normalizedMethod.type === 'wallet') {
      const wallet = await fetchWallet(supabase, user.id)

      if (!wallet) {
        return NextResponse.json(
          {
            error:
              "Votre portefeuille interne Gercie n'a pas pu être localisé.",
            code: 'WALLET_NOT_FOUND',
          },
          { status: 500 }
        )
      }

      const oldSolde = Number(wallet.solde_achat ?? 0)

      if (!Number.isFinite(oldSolde)) {
        return NextResponse.json(
          {
            error: 'Solde portefeuille invalide.',
            code: 'WALLET_INVALID_BALANCE',
          },
          { status: 500 }
        )
      }

      if (oldSolde < amountCdf) {
        const missing = roundCdf(amountCdf - oldSolde)

        return NextResponse.json(
          {
            error: `Solde insuffisant. Il vous manque ${missing.toLocaleString(
              'fr-FR'
            )} FC sur votre compte.`,
            code: 'INSUFFICIENT_FUNDS',
            missing_cdf: missing,
          },
          { status: 400 }
        )
      }

      const transactionId = uuidv4()

      const txInsert = await insertTransaction(supabase, {
        id: transactionId,
        userId: user.id,
        type: 'achat',
        amountCdf: -amountCdf,
        amountUsd,
        commandeId: body.commande_id,
        description: `Paiement portefeuille – Commande #${order.numero_commande}`,
        method: normalizedMethod.code,
        provider: normalizedMethod.provider,
        status: 'pending',
        externalId: `WALLET-${transactionId}`,
        idempotencyKey,
        phone: null,
        metadata: safeMetadata,
      })

      if (txInsert.missingTable) {
        return NextResponse.json(
          {
            error:
              "Le registre des transactions est indisponible. Paiement bloqué pour garantie comptable.",
            code: 'TRANSACTION_STORE_UNAVAILABLE',
          },
          { status: 500 }
        )
      }

      if (txInsert.error) {
        return NextResponse.json(
          {
            error:
              'Impossible denregistrer la transaction de paiement.',
            code: 'TRANSACTION_INSERT_FAILED',
            details: txInsert.error?.message,
          },
          { status: 500 }
        )
      }

      const debit = await debitWalletOptimistic(
        supabase,
        user.id,
        oldSolde,
        amountCdf
      )

      if (debit.error || !debit.data) {
        await updateTransactionStatus(
          supabase,
          transactionId,
          'failed',
          {
            metadata: sanitizeMetadata({
              ...safeMetadata,
              failure_reason:
                debit.error?.message ||
                'Debit portefeuille echoue',
            }),
          }
        )

        return NextResponse.json(
          {
            error:
              debit.error?.message ||
              'Transaction interrompue lors du débit de votre compte.',
            code:
              debit.error?.code || 'WALLET_DEBIT_FAILED',
          },
          { status: 500 }
        )
      }

      const orderUpdate = await markOrderPaid(
        supabase,
        body.commande_id,
        transactionId,
        normalizedMethod.code
      )

      if (orderUpdate.conflict) {
        const refunded = await refundWalletOptimistic(
          supabase,
          user.id,
          debit.newSolde,
          amountCdf
        )

        await updateTransactionStatus(
          supabase,
          transactionId,
          'failed',
          {
            metadata: sanitizeMetadata({
              ...safeMetadata,
              failure_reason:
                'Commande deja payee par une transaction concurrente',
              wallet_refunded: refunded,
            }),
          }
        )

        return NextResponse.json(
          {
            error:
              'Cette commande a déjà été payée. Votre solde a été restauré si nécessaire.',
            code: 'ORDER_ALREADY_PAID',
          },
          { status: 400 }
        )
      }

      if (orderUpdate.error || !orderUpdate.data) {
        const refunded = await refundWalletOptimistic(
          supabase,
          user.id,
          debit.newSolde,
          amountCdf
        )

        await updateTransactionStatus(
          supabase,
          transactionId,
          'failed',
          {
            metadata: sanitizeMetadata({
              ...safeMetadata,
              failure_reason:
                orderUpdate.error?.message ||
                'Mise a jour commande echouee',
              wallet_refunded: refunded,
            }),
          }
        )

        logger.error(
          {
            orderUpdateError: orderUpdate.error,
            commandeId: body.commande_id,
            transactionId,
            refunded,
          },
          'Échec critique mise à jour commande après débit portefeuille'
        )

        return NextResponse.json(
          {
            error: refunded
              ? 'Échec de la validation de la commande. Votre solde a été restauré.'
              : "Échec de la validation de la commande. Contactez le support, votre solde n'a pas pu être restauré automatiquement.",
            code: 'ORDER_UPDATE_FAILED',
          },
          { status: 500 }
        )
      }

      await updateTransactionStatus(
        supabase,
        transactionId,
        'approved',
        {
          metadata: sanitizeMetadata({
            ...safeMetadata,
            wallet_old_solde: oldSolde,
            wallet_new_solde: debit.newSolde,
          }),
        }
      )

      await notifyPaymentEvent({
        supabase,
        userId: user.id,
        commandeNumero: order.numero_commande,
        amountUsd,
        amountCdf,
        methodLabel: 'portefeuille Gercie',
        status: 'approved',
      })

      logger.info(
        {
          userId: user.id,
          commandeId: body.commande_id,
          transactionId,
          amount_usd: amountUsd,
          amount_cdf: amountCdf,
          exchange_rate: rate,
          rate_source: rateSource,
        },
        'Paiement portefeuille validé'
      )

      return NextResponse.json(
        {
          success: true,
          message:
            'Paiement effectué avec succès via votre portefeuille.',
          status: 'approved',
          transactionId,
          amount_usd: amountUsd,
          amount_cdf: amountCdf,
          exchange_rate: rate,
        },
        { status: 200 }
      )
    }

    /* ------------------------------------------------------------ */
    /* MOBILE MONEY                                                 */
    /* ------------------------------------------------------------ */

    if (normalizedMethod.type === 'mobile_money') {
      const formattedPhone = formatMobilePhone(phone)

      if (!formattedPhone) {
        return NextResponse.json(
          {
            error: 'Numéro de téléphone invalide.',
            code: 'PHONE_INVALID',
          },
          { status: 400 }
        )
      }

      const providerLabel =
        normalizedMethod.provider === 'orange'
          ? 'Orange Money'
          : normalizedMethod.provider === 'airtel'
            ? 'Airtel Money'
            : normalizedMethod.provider === 'mpesa'
              ? 'M-Pesa'
              : 'Mobile Money'

      const referenceId = `GERC-${body.commande_id.substring(
        0,
        8
      )}-${Date.now()}`

      const externalTransactionId = `TX-${String(
        normalizedMethod.provider || 'MOBILE'
      ).toUpperCase()}-${uuidv4().substring(0, 8)}`

      const transactionId = uuidv4()

      const txInsert = await insertTransaction(supabase, {
        id: transactionId,
        userId: user.id,
        type: 'achat',
        amountCdf: -amountCdf,
        amountUsd,
        commandeId: body.commande_id,
        description: `Paiement en attente ${providerLabel} – Commande #${order.numero_commande}`,
        method: normalizedMethod.code,
        provider: normalizedMethod.provider,
        status: 'pending',
        externalId: externalTransactionId,
        idempotencyKey,
        phone: formattedPhone,
        metadata: sanitizeMetadata({
          ...safeMetadata,
          payment_reference: referenceId,
          phone_masked: maskPhone(formattedPhone),
        }),
      })

      if (txInsert.missingTable || txInsert.error) {
        return NextResponse.json(
          {
            error:
              "Impossible d'enregistrer la transaction Mobile Money. Le suivi du webhook ne peut pas être garanti.",
            code: 'TRANSACTION_INSERT_FAILED',
            details: txInsert.error?.message,
          },
          { status: 500 }
        )
      }

      /**
       * IMPORTANT :
       * En production, cet appel doit être remplacé par un vrai provider :
       * Orange Money API, Airtel Money API, Safaricom M-Pesa API, etc.
       *
       * Ici on crée seulement la demande pending.
       * Le statut final de la commande doit être validé par webhook.
       */
      logger.info(
        {
          userId: user.id,
          commandeId: body.commande_id,
          transactionId,
          externalTransactionId,
          provider: normalizedMethod.provider,
          amount_usd: amountUsd,
          amount_cdf: amountCdf,
          exchange_rate: rate,
          rate_source: rateSource,
        },
        'Demande Mobile Money créée, en attente de validation opérateur'
      )

      await notifyPaymentEvent({
        supabase,
        userId: user.id,
        commandeNumero: order.numero_commande,
        amountUsd,
        amountCdf,
        methodLabel: providerLabel,
        status: 'pending',
      })

      return NextResponse.json(
        {
          success: true,
          message: `Demande d'autorisation transmise. Validez le prompt USSD ${providerLabel} sur votre téléphone pour finaliser.`,
          status: 'pending',
          transactionId: externalTransactionId,
          internal_transaction_id: transactionId,
          payment_reference: referenceId,
          amount_usd: amountUsd,
          amount_cdf: amountCdf,
          exchange_rate: rate,
        },
        { status: 200 }
      )
    }

    /* ------------------------------------------------------------ */
    /* CARD                                                         */
    /* ------------------------------------------------------------ */

    if (normalizedMethod.type === 'card') {
      const hasRawCard = Boolean(
        body.card?.number ||
          body.card?.cvv ||
          (body as any).card_number ||
          (body as any).cvv ||
          (body as any).pan
      )

      const cardToken =
        String(body.card_token || '').trim() ||
        String(body.payment_method_id || '').trim()

      const allowCardSimulation =
        process.env.PAYMENT_CARD_SIMULATION === 'true'

      if (!cardToken) {
        if (allowCardSimulation && hasRawCard) {
          /**
           * Uniquement en développement / simulation explicite.
           * Ne jamais activer cela en production.
           */
        } else {
          return NextResponse.json(
            {
              error: hasRawCard
                ? 'Les données carte brutes ne sont pas acceptées. Utilisez un token sécurisé (Stripe, etc.).'
                : 'Un token de carte sécurisé est requis.',
              code: hasRawCard
                ? 'CARD_RAW_DATA_NOT_ALLOWED'
                : 'CARD_TOKEN_REQUIRED',
            },
            { status: 400 }
          )
        }
      }

      const simulated =
        allowCardSimulation && !String(cardToken || '').startsWith('pm_')
      const externalTransactionId = simulated
        ? `CARD-SIM-${uuidv4().substring(0, 12)}`
        : cardToken || `CARD-${uuidv4().substring(0, 12)}`

      const transactionId = uuidv4()

      const initialStatus = simulated ? 'approved' : 'pending'

      const txInsert = await insertTransaction(supabase, {
        id: transactionId,
        userId: user.id,
        type: 'achat',
        amountCdf: -amountCdf,
        amountUsd,
        commandeId: body.commande_id,
        description: `Paiement Carte Bancaire – Commande #${order.numero_commande}`,
        method: normalizedMethod.code,
        provider: 'card',
        status: initialStatus,
        externalId: externalTransactionId,
        idempotencyKey,
        phone: null,
        metadata: sanitizeMetadata({
          ...safeMetadata,
          card_simulated: simulated,
          card_token_present: Boolean(cardToken),
        }),
      })

      if (txInsert.missingTable || txInsert.error) {
        return NextResponse.json(
          {
            error:
              "Impossible d'enregistrer la transaction carte.",
            code: 'TRANSACTION_INSERT_FAILED',
            details: txInsert.error?.message,
          },
          { status: 500 }
        )
      }

      if (!simulated) {
        /**
         * En production :
         * - appeler le PSP ;
         * - attendre webhook / confirmation 3DS ;
         * - ne pas marquer la commande payée ici.
         */
        return NextResponse.json(
          {
            success: true,
            message:
              'Demande carte créée. En attente de confirmation du prestataire de paiement.',
            status: 'pending',
            transactionId: externalTransactionId,
            internal_transaction_id: transactionId,
            amount_usd: amountUsd,
            amount_cdf: amountCdf,
            exchange_rate: rate,
          },
          { status: 200 }
        )
      }

      const orderUpdate = await markOrderPaid(
        supabase,
        body.commande_id,
        transactionId,
        normalizedMethod.code
      )

      if (orderUpdate.conflict) {
        await updateTransactionStatus(
          supabase,
          transactionId,
          'failed',
          {
            metadata: sanitizeMetadata({
              ...safeMetadata,
              failure_reason:
                'Commande deja payee par une transaction concurrente',
            }),
          }
        )

        return NextResponse.json(
          {
            error: 'Cette commande a déjà été payée.',
            code: 'ORDER_ALREADY_PAID',
          },
          { status: 400 }
        )
      }

      if (orderUpdate.error || !orderUpdate.data) {
        await updateTransactionStatus(
          supabase,
          transactionId,
          'failed',
          {
            metadata: sanitizeMetadata({
              ...safeMetadata,
              failure_reason:
                orderUpdate.error?.message ||
                'Mise a jour commande echouee',
            }),
          }
        )

        return NextResponse.json(
          {
            error:
              'Échec de validation de la commande après autorisation carte simulée.',
            code: 'ORDER_UPDATE_FAILED',
          },
          { status: 500 }
        )
      }

      await notifyPaymentEvent({
        supabase,
        userId: user.id,
        commandeNumero: order.numero_commande,
        amountUsd,
        amountCdf,
        methodLabel: 'carte bancaire (simulation)',
        status: 'approved',
      })

      return NextResponse.json(
        {
          success: true,
          message:
            "L'autorisation bancaire simulée a été accordée. Commande enregistrée.",
          status: 'approved',
          transactionId: externalTransactionId,
          internal_transaction_id: transactionId,
          amount_usd: amountUsd,
          amount_cdf: amountCdf,
          exchange_rate: rate,
        },
        { status: 200 }
      )
    }

    /* ------------------------------------------------------------ */
    /* BANK TRANSFER / CASH ON DELIVERY                             */
    /* ------------------------------------------------------------ */

    if (
      normalizedMethod.type === 'bank_transfer' ||
      normalizedMethod.type === 'cash_on_delivery'
    ) {
      const methodLabel =
        normalizedMethod.type === 'bank_transfer'
          ? 'virement bancaire'
          : 'paiement à la livraison'

      const externalTransactionId = `${String(
        normalizedMethod.code
      ).toUpperCase()}-${uuidv4().substring(0, 12)}`

      const transactionId = uuidv4()

      const txInsert = await insertTransaction(supabase, {
        id: transactionId,
        userId: user.id,
        type: 'achat',
        amountCdf: -amountCdf,
        amountUsd,
        commandeId: body.commande_id,
        description: `Paiement en attente ${methodLabel} – Commande #${order.numero_commande}`,
        method: normalizedMethod.code,
        provider: normalizedMethod.provider,
        status: 'pending',
        externalId: externalTransactionId,
        idempotencyKey,
        phone: phone ? formatMobilePhone(phone) : null,
        metadata: sanitizeMetadata({
          ...safeMetadata,
          method_label: methodLabel,
        }),
      })

      if (txInsert.missingTable || txInsert.error) {
        return NextResponse.json(
          {
            error:
              "Impossible d'enregistrer la transaction en attente.",
            code: 'TRANSACTION_INSERT_FAILED',
            details: txInsert.error?.message,
          },
          { status: 500 }
        )
      }

      await notifyPaymentEvent({
        supabase,
        userId: user.id,
        commandeNumero: order.numero_commande,
        amountUsd,
        amountCdf,
        methodLabel,
        status: 'pending',
      })

      return NextResponse.json(
        {
          success: true,
          message:
            normalizedMethod.type === 'bank_transfer'
              ? 'Commande enregistrée. En attente de confirmation du virement.'
              : 'Commande enregistrée. Paiement à effectuer à la livraison.',
          status: 'pending',
          transactionId: externalTransactionId,
          internal_transaction_id: transactionId,
          amount_usd: amountUsd,
          amount_cdf: amountCdf,
          exchange_rate: rate,
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        error: 'Méthode de paiement non gérée.',
        code: 'UNSUPPORTED_METHOD',
      },
      { status: 400 }
    )
  } catch (error: any) {
    logger.error(
      { error },
      "Crash critique du point d'accès de traitement des paiements"
    )

    return NextResponse.json(
      {
        error:
          'Une erreur technique interne sest produite sur nos serveurs de paiement.',
        code: 'INTERNAL_ERROR',
        details: error?.message,
      },
      { status: 500 }
    )
  }
}