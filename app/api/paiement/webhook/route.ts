// app/api/paiement/webhook/route.ts
// ---------------------------------------------------------------------------
// Webhook de confirmation de paiement
// USD = source principale, CDF recalculé serveur
// Multi-provider : Orange Money, Airtel Money, M-Pesa, Stripe / carte, générique
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server'
import crypto from 'crypto'

import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import {
  sendEmail,
  sendSMS,
  createNotification,
} from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type WebhookStatus = 'success' | 'failed' | 'pending'

interface MoneyPair {
  usd: number
  cdf: number
}

interface NormalizedWebhookEvent {
  provider: string
  transactionId: string
  reference: string | null
  commandeId: string | null
  status: WebhookStatus
  amount: number | null
  currency: string | null
  raw: any
}

interface TransactionRow {
  id: string
  commande_id: string
  status: string
  method?: string | null
  metadata?: any
  external_transaction_id?: string | null
  montant?: number | null
  montant_usd?: number | null
  created_at?: string
}

interface OrderRow {
  id: string
  statut: string
  acheteur_id?: string | null
  numero_commande?: string | null
  currency?: string | null

  total_usd?: number | null
  total_cdf?: number | null
  total_global?: number | null

  exchange_rate?: number | null
  shipping_rate_used?: number | null

  transaction_id?: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined

  const n = Number(value)

  return Number.isFinite(n) ? n : undefined
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = Number(value)

  return Number.isFinite(n) && n > 0 ? n : null
}

function firstPositive(...values: unknown[]): number {
  for (const value of values) {
    const n = positiveNumber(value)

    if (n != null) return n
  }

  return 0
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round(value + Number.EPSILON)
}

function toUsd(cdf: number, rate: number): number {
  if (!Number.isFinite(cdf) || cdf <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return round2(cdf / rate)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return roundCdf(usd * rate)
}

function formatUsd(value: number): string {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0
  return `$${n.toFixed(2)}`
}

function formatCdf(value: number): string {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0
  return `${Math.round(n).toLocaleString('fr-FR')} FC`
}

function formatPair(pair: MoneyPair): string {
  if (pair.usd > 0) {
    return pair.cdf > 0
      ? `${formatUsd(pair.usd)} ≈ ${formatCdf(pair.cdf)}`
      : formatUsd(pair.usd)
  }

  if (pair.cdf > 0) {
    return formatCdf(pair.cdf)
  }

  return '—'
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

/* ═══════════════════════════════════════════════════════════════ */
/*  USD / CDF RESOLUTION                                           */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Règle absolue :
 * - Si USD existe → USD = vérité.
 *   CDF = USD × taux serveur.
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux serveur.
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number,
  cdfSource: number,
  rate: number | null
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  let usd = usdSource > 0 ? round2(usdSource) : 0
  let cdf = cdfSource > 0 ? roundCdf(cdfSource) : 0

  if (usd > 0) {
    cdf = rateOk ? roundCdf(toCdf(usd, rateNum)) : cdf
  } else if (cdf > 0 && rateOk) {
    usd = round2(toUsd(cdf, rateNum))
  }

  return {
    usd: round2(usd),
    cdf: roundCdf(cdf),
  }
}

function resolveCurrency(value: unknown): 'USD' | 'CDF' | 'AUTO' {
  const raw = String(value || '')
    .trim()
    .toUpperCase()

  if (!raw) return 'AUTO'

  if (raw.includes('USD') || raw === 'DOLLAR' || raw === '$') return 'USD'

  if (
    raw.includes('CDF') ||
    raw.includes('FC') ||
    raw.includes('FCFA') ||
    raw === 'XAF'
  ) {
    return 'CDF'
  }

  return 'AUTO'
}

function buildCandidatePairs(
  amount: number,
  currency: string | null,
  rate: number | null
): MoneyPair[] {
  const values = new Set<number>()

  const add = (v: number) => {
    if (Number.isFinite(v) && v > 0) {
      values.add(round2(v))
    }
  }

  add(amount)

  /**
   * Certains providers envoient des centimes.
   * On teste donc aussi amount / 100 quand plausible.
   */
  if (Number.isFinite(amount) && amount > 0) {
    if (Number.isInteger(amount) && amount >= 100 && amount % 100 === 0) {
      add(amount / 100)
    }

    if (amount < 100) {
      add(amount * 100)
    }
  }

  const cur = resolveCurrency(currency)
  const pairs: MoneyPair[] = []

  for (const value of values) {
    if (cur === 'USD') {
      pairs.push(resolvePricePair(value, 0, rate))
    } else if (cur === 'CDF') {
      pairs.push(resolvePricePair(0, value, rate))
    } else {
      /**
       * Devise ambiguë :
       * on teste les deux interprétations.
       */
      pairs.push(resolvePricePair(value, 0, rate))
      pairs.push(resolvePricePair(0, value, rate))
    }
  }

  return pairs.filter((p) => p.usd > 0 || p.cdf > 0)
}

function scorePairAgainstExpected(
  pair: MoneyPair,
  expected: MoneyPair
): number {
  if (expected.usd > 0 && pair.usd > 0) {
    return Math.abs(pair.usd - expected.usd) / Math.max(1, expected.usd)
  }

  if (expected.cdf > 0 && pair.cdf > 0) {
    return Math.abs(pair.cdf - expected.cdf) / Math.max(1, expected.cdf)
  }

  return Number.POSITIVE_INFINITY
}

function chooseActualPair(
  amount: number | null,
  currency: string | null,
  expected: MoneyPair,
  rate: number | null,
  fallbackMetadata: any
): MoneyPair {
  if (amount != null && amount > 0) {
    const candidates = buildCandidatePairs(amount, currency, rate)

    if (candidates.length > 0) {
      if (expected.usd > 0 || expected.cdf > 0) {
        candidates.sort(
          (a, b) =>
            scorePairAgainstExpected(a, expected) -
            scorePairAgainstExpected(b, expected)
        )
      }

      return candidates[0]
    }
  }

  /**
   * Fallback seulement si le provider n’envoie pas de montant.
   * Ce fallback est bloqué en production sauf env explicite.
   */
  return resolvePricePair(
    firstPositive(
      fallbackMetadata?.amount_usd,
      fallbackMetadata?.total_usd,
      fallbackMetadata?.webhook?.amount_usd
    ),
    firstPositive(
      fallbackMetadata?.amount_cdf,
      fallbackMetadata?.total_cdf,
      fallbackMetadata?.webhook?.amount_cdf
    ),
    rate
  )
}

function amountsMatch(actual: MoneyPair, expected: MoneyPair): boolean {
  if (expected.usd > 0 && actual.usd > 0) {
    const tolerance = Math.max(0.02, expected.usd * 0.01)
    return Math.abs(actual.usd - expected.usd) <= tolerance
  }

  if (expected.cdf > 0 && actual.cdf > 0) {
    const tolerance = Math.max(1, expected.cdf * 0.01)
    return Math.abs(actual.cdf - expected.cdf) <= tolerance
  }

  return false
}

function resolveExpectedPair(
  order: OrderRow | null,
  txMetadata: any,
  rate: number | null
): MoneyPair {
  const usd = firstPositive(
    order?.total_usd,
    (order as any)?.totalUSD,
    txMetadata?.amount_usd,
    txMetadata?.total_usd,
    txMetadata?.webhook?.expected_usd
  )

  const cdf = firstPositive(
    order?.total_cdf,
    (order as any)?.totalCDF,
    order?.total_global,
    (order as any)?.total,
    txMetadata?.amount_cdf,
    txMetadata?.total_cdf,
    txMetadata?.webhook?.expected_cdf
  )

  return resolvePricePair(usd, cdf, rate)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE ERROR HELPERS                                         */
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
/*  SECURITY / REDACTION                                           */
/* ═══════════════════════════════════════════════════════════════ */

const SENSITIVE_KEYS = new Set([
  'signature',
  'sig',
  'hash',
  'secret',
  'authorization',
  'auth',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'password',
  'passwd',
  'pin',
  'cvv',
  'cvc',
  'card',
  'card_number',
  'cardnumber',
  'number',
  'pan',
  'expiry',
  'expiration',
  'holder',
  'cardholder',
  'save_card',
  'saveCard',
])

function isSensitiveKey(key: string): boolean {
  const lower = String(key || '').toLowerCase()

  return SENSITIVE_KEYS.has(lower)
}

function redactRaw(value: any, depth = 0): any {
  if (depth > 4) return '[depth-truncated]'

  if (value === null || value === undefined) return value

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactRaw(item, depth + 1))
  }

  if (typeof value === 'object') {
    const clean: Record<string, any> = {}

    for (const [key, val] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        clean[key] = '[redacted]'
        continue
      }

      clean[key] = redactRaw(val, depth + 1)
    }

    return clean
  }

  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value
  }

  return value
}

function sanitizeMetadata(input: any): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }

  const clean: Record<string, any> = {}

  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      clean[key] = '[redacted]'
      continue
    }

    clean[key] = redactRaw(value, 1)
  }

  return clean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SIGNATURE VERIFICATION                                         */
/* ═══════════════════════════════════════════════════════════════ */

function allowUnsignedWebhooks(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_UNSIGNED_WEBHOOKS === 'true'
  )
}

function allowWebhookAmountFromMetadata(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_WEBHOOK_AMOUNT_FROM_METADATA === 'true'
  )
}

function computeHmacHex(secret: string, payload: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex')
}

function normalizeSignatureValue(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, '')
    .replace(/^v1=/, '')
}

function safeHexEqual(a: string, b: string): boolean {
  const left = normalizeSignatureValue(a)
  const right = normalizeSignatureValue(b)

  if (!left || !right) return false
  if (left.length !== right.length) return false

  try {
    return crypto.timingSafeEqual(
      Buffer.from(left, 'utf8'),
      Buffer.from(right, 'utf8')
    )
  } catch {
    return false
  }
}

function getSignatureCandidates(
  headers: Headers,
  body: any
): string[] {
  const out: string[] = []

  const headerKeys = [
    'x-signature',
    'x-webhook-signature',
    'signature',
    'x-orange-signature',
    'x-airtel-signature',
    'x-mpesa-signature',
    'x-provider-signature',
    'stripe-signature',
  ]

  for (const key of headerKeys) {
    const value = headers.get(key)

    if (value) out.push(value)
  }

  const bodySignature =
    body?.signature ??
    body?.sig ??
    body?.hash ??
    body?.webhook_signature ??
    body?.headers?.signature

  if (bodySignature) out.push(String(bodySignature))

  return out.filter(Boolean)
}

function canonicalOrangePayload(body: any): string {
  const data = { ...(body || {}) }

  delete data.signature
  delete data.sig
  delete data.hash

  const keys = Object.keys(data).sort()

  return keys
    .map((key) => `${key}=${String((data as any)[key] ?? '')}`)
    .join('&')
}

function canonicalAirtelPayload(body: any): string {
  const data = { ...(body || {}) }

  delete data.signature
  delete data.sig
  delete data.hash

  try {
    return JSON.stringify(data)
  } catch {
    return ''
  }
}

function verifyStripeSignature(
  secret: string,
  rawBody: string,
  header: string
): boolean {
  const parts = String(header || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  const tPart = parts.find((part) => part.startsWith('t='))
  const v1Parts = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))

  if (!tPart || v1Parts.length === 0) return false

  const timestamp = Number(tPart.slice(2))

  if (!Number.isFinite(timestamp)) return false

  const nowSeconds = Math.floor(Date.now() / 1000)
  const toleranceSeconds = 300

  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false

  const signedPayload = `${timestamp}.${rawBody}`
  const computed = computeHmacHex(secret, signedPayload)

  return v1Parts.some((v1) => safeHexEqual(computed, v1))
}

function verifyProviderSignature(params: {
  provider: string
  rawBody: string
  body: any
  headers: Headers
  secret: string
}): boolean {
  const { provider, rawBody, body, headers, secret } = params

  if (!secret) {
    logger.warn(
      { provider },
      'Secret webhook absent. Signature non vérifiée.'
    )

    return allowUnsignedWebhooks()
  }

  if (provider === 'stripe') {
    const stripeHeader = headers.get('stripe-signature')

    if (stripeHeader && verifyStripeSignature(secret, rawBody, stripeHeader)) {
      return true
    }
  }

  const candidates = getSignatureCandidates(headers, body)

  for (const candidate of candidates) {
    const normalized = normalizeSignatureValue(candidate)

    if (!normalized) continue

    /**
     * 1. HMAC sur le raw body.
     */
    if (safeHexEqual(computeHmacHex(secret, rawBody), normalized)) {
      return true
    }

    /**
     * 2. HMAC sur canonical provider.
     */
    if (provider === 'orange') {
      const canonical = canonicalOrangePayload(body)

      if (canonical && safeHexEqual(computeHmacHex(secret, canonical), normalized)) {
        return true
      }
    }

    if (provider === 'airtel') {
      const canonical = canonicalAirtelPayload(body)

      if (canonical && safeHexEqual(computeHmacHex(secret, canonical), normalized)) {
        return true
      }
    }
  }

  return false
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PROVIDER NORMALIZATION                                         */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeProvider(raw: unknown): string {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')

  if (!value) return ''

  if (value.includes('orange')) return 'orange'
  if (value.includes('airtel')) return 'airtel'
  if (value.includes('mpesa') || value.includes('m_pesa') || value.includes('daraja')) return 'mpesa'
  if (value.includes('stripe')) return 'stripe'
  if (value.includes('card') || value.includes('carte') || value.includes('visa') || value.includes('mastercard')) return 'card'
  if (value.includes('bank') || value.includes('virement') || value.includes('transfer')) return 'bank_transfer'
  if (value.includes('cash') || value.includes('cod') || value.includes('livraison')) return 'cash_on_delivery'

  return value
}

function normalizeWebhookStatus(raw: unknown): WebhookStatus {
  const value = String(raw || '')
    .trim()
    .toUpperCase()

  if (
    value === 'SUCCESS' ||
    value === 'COMPLETED' ||
    value === 'COMPLETION' ||
    value === 'APPROVED' ||
    value === 'PAID' ||
    value === 'SUCCEEDED' ||
    value === 'OK'
  ) {
    return 'success'
  }

  if (
    value === 'FAILED' ||
    value === 'FAILURE' ||
    value === 'REJECTED' ||
    value === 'DECLINED' ||
    value === 'CANCELLED' ||
    value === 'CANCELED' ||
    value === 'EXPIRED' ||
    value === 'ERROR' ||
    value === 'INVALID'
  ) {
    return 'failed'
  }

  return 'pending'
}

function extractCommonReference(
  body: any,
  searchParams: URLSearchParams
): string | null {
  return (
    body?.reference ||
    body?.merchantReference ||
    body?.merchant_reference ||
    body?.metadata?.reference ||
    body?.data?.object?.metadata?.reference ||
    searchParams.get('reference') ||
    null
  )
}

function extractCommonCommandeId(body: any): string | null {
  return (
    body?.commande_id ||
    body?.order_id ||
    body?.orderId ||
    body?.metadata?.commande_id ||
    body?.metadata?.order_id ||
    body?.data?.object?.metadata?.commande_id ||
    body?.data?.object?.metadata?.order_id ||
    null
  )
}

function parseWebhookEvent(
  provider: string,
  body: any,
  searchParams: URLSearchParams
): NormalizedWebhookEvent | null {
  const commonReference = extractCommonReference(body, searchParams)
  const commonCommandeId = extractCommonCommandeId(body)

  if (provider === 'orange') {
    const transactionId = String(
      body?.transactionId ||
        body?.transaction_id ||
        body?.id ||
        ''
    ).trim()

    if (!transactionId) return null

    return {
      provider,
      transactionId,
      reference: String(commonReference || '').trim() || null,
      commandeId: String(commonCommandeId || '').trim() || null,
      status: normalizeWebhookStatus(body?.status),
      amount: optionalNumber(body?.amount),
      currency: body?.currency ?? null,
      raw: body,
    }
  }

  if (provider === 'airtel') {
    const tx = body?.transaction || body || {}

    const transactionId = String(
      tx?.id ||
        tx?.transactionId ||
        tx?.transaction_id ||
        body?.transactionId ||
        body?.id ||
        ''
    ).trim()

    if (!transactionId) return null

    return {
      provider,
      transactionId,
      reference:
        String(
          body?.reference ||
            tx?.reference ||
            commonReference ||
            ''
        ).trim() || null,
      commandeId: String(commonCommandeId || '').trim() || null,
      status: normalizeWebhookStatus(tx?.status || body?.status),
      amount: optionalNumber(tx?.amount ?? body?.amount),
      currency: tx?.currency ?? body?.currency ?? null,
      raw: body,
    }
  }

  if (provider === 'mpesa') {
    const callback =
      body?.Body?.stkCallback ||
      body?.stkCallback ||
      body ||
      {}

    const transactionId = String(
      callback?.CheckoutRequestID ||
        callback?.checkoutRequestId ||
        callback?.MerchantRequestID ||
        body?.transactionId ||
        ''
    ).trim()

    if (!transactionId) return null

    const items: Array<{ Name?: string; Value?: string | number }> =
      callback?.CallbackMetadata?.Item ||
      callback?.callbackMetadata?.Item ||
      []

    const amountItem = items.find((item) =>
      /amount|transamount|montant/i.test(String(item?.Name || ''))
    )

    const currencyItem = items.find((item) =>
      /currency|devise/i.test(String(item?.Name || ''))
    )

    const resultCode = callback?.ResultCode

    let status: WebhookStatus = 'pending'

    if (resultCode === 0) {
      status = 'success'
    } else if (resultCode !== null && resultCode !== undefined) {
      status = 'failed'
    }

    return {
      provider,
      transactionId,
      reference:
        String(
          searchParams.get('reference') ||
            callback?.MerchantRequestID ||
            commonReference ||
            ''
        ).trim() || null,
      commandeId: String(commonCommandeId || '').trim() || null,
      status,
      amount: optionalNumber(amountItem?.Value),
      currency:
        currencyItem?.Value ??
        body?.currency ??
        'CDF',
      raw: body,
    }
  }

  if (provider === 'stripe' || provider === 'card') {
    const obj = body?.data?.object || body || {}

    const eventType = String(
      body?.type || body?.event || body?.event_type || ''
    ).toLowerCase()

    let status: WebhookStatus = normalizeWebhookStatus(obj?.status)

    if (
      eventType.includes('succeeded') ||
      eventType.includes('completed') ||
      eventType.includes('approved') ||
      eventType.includes('paid')
    ) {
      status = 'success'
    } else if (
      eventType.includes('failed') ||
      eventType.includes('canceled') ||
      eventType.includes('cancelled') ||
      eventType.includes('expired') ||
      eventType.includes('declined')
    ) {
      status = 'failed'
    }

    const transactionId = String(
      obj?.id ||
        obj?.latest_charge ||
        body?.transactionId ||
        body?.transaction_id ||
        ''
    ).trim()

    if (!transactionId) return null

    return {
      provider,
      transactionId,
      reference:
        String(
          obj?.metadata?.reference ||
            body?.reference ||
            commonReference ||
            ''
        ).trim() || null,
      commandeId:
        String(
          obj?.metadata?.commande_id ||
            obj?.metadata?.order_id ||
            commonCommandeId ||
            ''
        ).trim() || null,
      status,
      amount: optionalNumber(obj?.amount),
      currency: obj?.currency ?? body?.currency ?? null,
      raw: body,
    }
  }

  /**
   * Provider générique.
   */
  const transactionId = String(
    body?.transactionId ||
      body?.transaction_id ||
      body?.id ||
      ''
  ).trim()

  if (!transactionId) return null

  return {
    provider: provider || 'generic',
    transactionId,
    reference: String(commonReference || '').trim() || null,
    commandeId: String(commonCommandeId || '').trim() || null,
    status: normalizeWebhookStatus(body?.status),
    amount: optionalNumber(body?.amount),
    currency: body?.currency ?? null,
    raw: body,
  }
}

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
      logger.warn({ err }, 'Exception lecture exchange_rates webhook')
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TRANSACTION LOOKUP                                             */
/* ═══════════════════════════════════════════════════════════════ */

function extractCommandePrefixFromReference(reference: string | null): string | null {
  if (!reference) return null

  const match = String(reference).match(/^GERC-([0-9a-f]{8})-/i)

  return match?.[1] ?? null
}

async function findPendingTransaction(
  supabase: any,
  event: NormalizedWebhookEvent
): Promise<TransactionRow | null> {
  const columnSets = [
    'id, commande_id, status, method, metadata, external_transaction_id, montant, montant_usd, created_at',
    'id, commande_id, status, method, metadata, external_transaction_id, montant, created_at',
    'id, commande_id, status, method, metadata, created_at',
    '*',
  ]

  const referencePrefix = extractCommandePrefixFromReference(event.reference)

  const baseFilters: Array<{
    name: string
    apply: (query: any) => any
  }> = []

  if (event.commandeId) {
    baseFilters.push({
      name: 'commande_id',
      apply: (query) => query.eq('commande_id', event.commandeId),
    })
  }

  if (event.transactionId) {
    baseFilters.push({
      name: 'external_transaction_id',
      apply: (query) =>
        query.eq('external_transaction_id', event.transactionId),
    })

    baseFilters.push({
      name: 'metadata_provider_transaction_id',
      apply: (query) =>
        query.filter(
          'metadata->>provider_transaction_id',
          'eq',
          event.transactionId
        ),
    })

    baseFilters.push({
      name: 'metadata_externalId',
      apply: (query) =>
        query.filter('metadata->>externalId', 'eq', event.transactionId),
    })
  }

  if (event.reference) {
    baseFilters.push({
      name: 'metadata_payment_reference',
      apply: (query) =>
        query.filter(
          'metadata->>payment_reference',
          'eq',
          event.reference
        ),
    })

    baseFilters.push({
      name: 'metadata_reference',
      apply: (query) =>
        query.filter('metadata->>reference', 'eq', event.reference),
    })
  }

  if (referencePrefix) {
    baseFilters.push({
      name: 'commande_id_prefix',
      apply: (query) =>
        query.like('commande_id', `${referencePrefix}%`),
    })
  }

  for (const withMethod of [false, true]) {
    for (const columns of columnSets) {
      for (const filter of baseFilters) {
        try {
          let query = supabase
            .from('transactions')
            .select(columns)
            .eq('status', 'pending')
            .eq('type', 'achat')

          if (withMethod && event.provider) {
            query = query.eq('method', event.provider)
          }

          query = filter.apply(query)

          const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!error && data) {
            return data as TransactionRow
          }

          if (isMissingTableError(error)) {
            return null
          }

          if (isMissingColumnError(error)) {
            continue
          }
        } catch (err) {
          logger.warn(
            { err, filter: filter.name, withMethod },
            'Exception recherche transaction webhook'
          )
        }
      }
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ORDER FETCH                                                    */
/* ═══════════════════════════════════════════════════════════════ */

async function fetchOrderForWebhook(
  supabase: any,
  commandeId: string
): Promise<OrderRow | null> {
  const columnSets = [
    'id, statut, acheteur_id, numero_commande, currency, total_usd, total_cdf, total_global, exchange_rate, shipping_rate_used, transaction_id',

    'id, statut, acheteur_id, numero_commande, total_usd, total_cdf, total_global, transaction_id',

    'id, statut, acheteur_id, numero_commande, total_global, total_cdf, transaction_id',

    'id, statut, acheteur_id, numero_commande, total_global',

    'id, statut, acheteur_id, numero_commande',
  ]

  for (const columns of columnSets) {
    try {
      const { data, error } = await supabase
        .from('commandes')
        .select(columns)
        .eq('id', commandeId)
        .maybeSingle()

      if (!error && data) {
        return {
          id: String(data.id),
          statut: String(data.statut || data.status || ''),
          acheteur_id: data.acheteur_id ?? data.user_id ?? null,
          numero_commande:
            data.numero_commande || data.numero || null,
          currency: data.currency ?? null,
          total_usd: optionalNumber(data.total_usd ?? data.totalUSD),
          total_cdf: optionalNumber(
            data.total_cdf ??
              data.totalCDF ??
              data.total_global ??
              data.total
          ),
          total_global: optionalNumber(data.total_global ?? data.total),
          exchange_rate: optionalNumber(data.exchange_rate),
          shipping_rate_used: optionalNumber(data.shipping_rate_used),
          transaction_id: data.transaction_id ?? null,
        }
      }

      if (isMissingTableError(error)) {
        return null
      }

      if (isMissingColumnError(error)) {
        continue
      }

      logger.warn(
        { error, commandeId },
        'Erreur fetch commande webhook'
      )
    } catch (err) {
      logger.warn(
        { err, commandeId },
        'Exception fetch commande webhook'
      )
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TRANSACTION UPDATE                                             */
/* ═══════════════════════════════════════════════════════════════ */

async function updateTransactionOutcome(params: {
  supabase: any
  transactionId: string
  status: 'approved' | 'failed' | 'rejected'
  metadata: Record<string, any>
  extra?: Record<string, any>
}): Promise<{
  data: any | null
  error: any | null
  conflict: boolean
}> {
  const { supabase, transactionId, status, metadata, extra = {} } = params

  const now = new Date().toISOString()

  const base = {
    status,
    metadata,
    updated_at: now,
    resolved_at: now,
    ...extra,
  }

  const attempts = [
    { name: 'full', data: base },

    {
      name: 'no_provider',
      data: {
        ...base,
        provider: undefined,
      },
    },

    {
      name: 'no_external_transaction_id',
      data: {
        ...base,
        external_transaction_id: undefined,
      },
    },

    {
      name: 'no_montant_usd',
      data: {
        ...base,
        montant_usd: undefined,
      },
    },

    {
      name: 'no_resolved_at',
      data: {
        ...base,
        resolved_at: undefined,
        updated_at: undefined,
      },
    },

    {
      name: 'minimal_metadata',
      data: {
        status,
        metadata,
      },
    },

    {
      name: 'minimal_status',
      data: {
        status,
      },
    },
  ]

  let lastError: any = null

  for (const attempt of attempts) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .update(removeUndefined(attempt.data))
        .eq('id', transactionId)
        .eq('status', 'pending')
        .select('id, status')
        .maybeSingle()

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
        { error, transactionId, attempt: attempt.name },
        'Échec mise à jour transaction webhook'
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
        { err, transactionId, attempt: attempt.name },
        'Exception mise à jour transaction webhook'
      )

      return { data: null, error: err, conflict: false }
    }
  }

  return { data: null, error: lastError, conflict: false }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ORDER UPDATE                                                   */
/* ═══════════════════════════════════════════════════════════════ */

async function markOrderPaidFromWebhook(params: {
  supabase: any
  commandeId: string
  transactionId: string
  provider: string
  externalTransactionId: string
  amountUsd: number
  amountCdf: number
  rate: number | null
  rateSource: string
}): Promise<{
  data: any | null
  error: any | null
  conflict: boolean
}> {
  const {
    supabase,
    commandeId,
    transactionId,
    provider,
    externalTransactionId,
    amountUsd,
    amountCdf,
    rate,
    rateSource,
  } = params

  const now = new Date().toISOString()

  const base = {
    statut: 'payee',
    paid_at: now,
    payment_method: provider,
    payment_reference: externalTransactionId,
    transaction_id: transactionId,
    payment_amount_usd: round2(amountUsd),
    payment_amount_cdf: roundCdf(amountCdf),
    payment_exchange_rate: rate,
    payment_rate_source: rateSource,
    payment_webhook_at: now,
    updated_at: now,
  }

  const attempts = [
    { name: 'full', data: base },

    {
      name: 'no_rate_source',
      data: {
        ...base,
        payment_rate_source: undefined,
      },
    },

    {
      name: 'no_webhook_at',
      data: {
        ...base,
        payment_webhook_at: undefined,
        updated_at: undefined,
      },
    },

    {
      name: 'no_payment_amounts',
      data: {
        statut: 'payee',
        paid_at: now,
        payment_method: provider,
        payment_reference: externalTransactionId,
        transaction_id: transactionId,
        updated_at: now,
      },
    },

    {
      name: 'no_transaction_id',
      data: {
        statut: 'payee',
        paid_at: now,
        payment_method: provider,
        payment_reference: externalTransactionId,
        updated_at: now,
      },
    },

    {
      name: 'minimal',
      data: {
        statut: 'payee',
        paid_at: now,
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
        .select('id, statut, transaction_id')
        .maybeSingle()

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
        'Échec mise à jour commande webhook'
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
        'Exception mise à jour commande webhook'
      )

      return { data: null, error: err, conflict: false }
    }
  }

  return { data: null, error: lastError, conflict: false }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  METADATA BUILDER                                               */
/* ═══════════════════════════════════════════════════════════════ */

function buildWebhookMetadata(params: {
  tx: TransactionRow
  event: NormalizedWebhookEvent
  expectedPair: MoneyPair
  actualPair: MoneyPair
  finalPair: MoneyPair
  rate: number | null
  rateSource: string
  outcome: 'approved' | 'failed'
  reason?: string
}): Record<string, any> {
  const {
    tx,
    event,
    expectedPair,
    actualPair,
    finalPair,
    rate,
    rateSource,
    outcome,
    reason,
  } = params

  const now = new Date().toISOString()

  const baseMeta =
    tx?.metadata && typeof tx.metadata === 'object'
      ? tx.metadata
      : {}

  return sanitizeMetadata({
    ...baseMeta,

    provider_transaction_id: event.transactionId,
    payment_reference:
      event.reference || baseMeta?.payment_reference || null,

    amount_usd: finalPair.usd,
    amount_cdf: finalPair.cdf,

    exchange_rate: rate,
    rate_source: rateSource,

    resolved_at: now,

    webhook: {
      provider: event.provider,
      transaction_id: event.transactionId,
      reference: event.reference,
      status: event.status,
      received_at: now,
      outcome,
      reason: reason || null,

      expected_usd: expectedPair.usd,
      expected_cdf: expectedPair.cdf,

      webhook_amount_usd: actualPair.usd,
      webhook_amount_cdf: actualPair.cdf,

      raw: redactRaw(event.raw),
    },
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NOTIFICATIONS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

async function notifyWebhookOutcome(params: {
  supabase: any
  order: OrderRow | null
  event: NormalizedWebhookEvent
  outcome: 'approved' | 'failed'
  amountPair: MoneyPair
  reason?: string
}): Promise<void> {
  try {
    const {
      supabase,
      order,
      event,
      outcome,
      amountPair,
      reason,
    } = params

    if (!order?.acheteur_id) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, telephone')
      .eq('id', order.acheteur_id)
      .single()
      .catch(() => ({ data: null }))

    const amountLabel = formatPair(amountPair)
    const numero = order.numero_commande || order.id

    const title =
      outcome === 'approved'
        ? 'Paiement confirmé'
        : 'Paiement échoué'

    const body =
      outcome === 'approved'
        ? `Votre commande #${numero} a été payée via ${event.provider} pour ${amountLabel}.`
        : `Le paiement de votre commande #${numero} via ${event.provider} a échoué.${reason ? ` Motif : ${reason}.` : ''}`

    if (typeof createNotification === 'function') {
      await createNotification(
        order.acheteur_id,
        'paiement',
        title,
        body
      ).catch((err: any) => {
        logger.warn({ err }, 'createNotification webhook indisponible')
      })
    }

    if (profile?.email && typeof sendEmail === 'function') {
      await sendEmail(
        profile.email,
        `${title} - Commande #${numero}`,
        body
      ).catch((err: any) => {
        logger.warn({ err }, 'sendEmail webhook indisponible')
      })
    }

    if (profile?.telephone && typeof sendSMS === 'function') {
      await sendSMS(
        profile.telephone,
        `Gercie: ${body}`
      ).catch((err: any) => {
        logger.warn({ err }, 'sendSMS webhook indisponible')
      })
    }
  } catch (err) {
    logger.warn({ err }, 'Notifications webhook indisponibles')
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FAILURE HELPER                                                 */
/* ═══════════════════════════════════════════════════════════════ */

async function failWebhookTransaction(params: {
  supabase: any
  tx: TransactionRow
  event: NormalizedWebhookEvent
  order: OrderRow | null
  expectedPair: MoneyPair
  actualPair: MoneyPair
  rate: number | null
  rateSource: string
  reason: string
}): Promise<void> {
  const {
    supabase,
    tx,
    event,
    order,
    expectedPair,
    actualPair,
    rate,
    rateSource,
    reason,
  } = params

  const finalPair =
    expectedPair.usd > 0 || expectedPair.cdf > 0
      ? expectedPair
      : actualPair

  const metadata = buildWebhookMetadata({
    tx,
    event,
    expectedPair,
    actualPair,
    finalPair,
    rate,
    rateSource,
    outcome: 'failed',
    reason,
  })

  await updateTransactionOutcome({
    supabase,
    transactionId: tx.id,
    status: 'failed',
    metadata,
    extra: {
      external_transaction_id: event.transactionId,
      provider: event.provider,
    },
  })

  await notifyWebhookOutcome({
    supabase,
    order,
    event,
    outcome: 'failed',
    amountPair: finalPair,
    reason,
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `webhook-paiement:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: 'Trop de requêtes webhook.',
          code: 'RATE_LIMITED',
        },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  let rawBody = ''

  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json(
      { error: 'Body illisible.', code: 'INVALID_BODY' },
      { status: 400 }
    )
  }

  let body: any

  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json(
      { error: 'JSON invalide.', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  const { searchParams } = new URL(request.url)

  const provider = normalizeProvider(
    searchParams.get('provider') ||
      request.headers.get('x-payment-provider') ||
      body?.provider
  )

  if (!provider) {
    return NextResponse.json(
      { error: 'Provider manquant.', code: 'PROVIDER_MISSING' },
      { status: 400 }
    )
  }

  const secretByKey: Record<string, string | undefined> = {
    orange: process.env.ORANGE_MONEY_WEBHOOK_SECRET,
    airtel: process.env.AIRTEL_MONEY_WEBHOOK_SECRET,
    mpesa: process.env.MPESA_WEBHOOK_SECRET,
    stripe: process.env.STRIPE_WEBHOOK_SECRET,
    card: process.env.CARD_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET,
    bank_transfer: process.env.BANK_WEBHOOK_SECRET,
    cash_on_delivery: process.env.CASH_WEBHOOK_SECRET,
  }

  const secret =
    secretByKey[provider] ||
    process.env.WEBHOOK_SHARED_SECRET ||
    ''

  const signatureOk = verifyProviderSignature({
    provider,
    rawBody,
    body,
    headers: request.headers,
    secret,
  })

  if (!signatureOk) {
    logger.warn(
      { provider, ip },
      'Signature webhook invalide ou manquante'
    )

    return NextResponse.json(
      { error: 'Signature invalide.', code: 'INVALID_SIGNATURE' },
      { status: 403 }
    )
  }

  const event = parseWebhookEvent(provider, body, searchParams)

  if (!event) {
    return NextResponse.json(
      { error: 'Payload webhook incomplet.', code: 'INCOMPLETE_WEBHOOK' },
      { status: 400 }
    )
  }

  logger.info(
    {
      provider: event.provider,
      transactionId: event.transactionId,
      status: event.status,
      reference: event.reference,
    },
    'Webhook paiement reçu et signé'
  )

  if (event.status === 'pending') {
    return NextResponse.json(
      {
        success: true,
        status: 'pending',
        message: 'Événement en attente enregistré sans changement de statut.',
      },
      { status: 200 }
    )
  }

  let supabase: any

  try {
    const rawClient = await createClient(true)

    supabase =
      rawClient && typeof rawClient.from === 'function'
        ? rawClient
        : (rawClient as any)?.client
  } catch (err: any) {
    logger.error({ err }, 'Initialisation Supabase webhook échouée')

    return NextResponse.json(
      {
        error: 'Service webhook temporairement indisponible.',
        code: 'SUPABASE_UNAVAILABLE',
      },
      { status: 500 }
    )
  }

  if (!supabase) {
    return NextResponse.json(
      {
        error: 'Service webhook temporairement indisponible.',
        code: 'SUPABASE_UNAVAILABLE',
      },
      { status: 500 }
    )
  }

  try {
    const tx = await findPendingTransaction(supabase, event)

    if (!tx) {
      logger.warn(
        {
          provider: event.provider,
          transactionId: event.transactionId,
          reference: event.reference,
        },
        'Transaction webhook introuvable'
      )

      return NextResponse.json(
        {
          error: 'Transaction introuvable.',
          code: 'TRANSACTION_NOT_FOUND',
        },
        { status: 404 }
      )
    }

    const txStatus = String(tx.status || '').toLowerCase()

    if (txStatus !== 'pending') {
      return NextResponse.json(
        {
          success: true,
          status: txStatus,
          message: 'Transaction déjà traitée.',
        },
        { status: 200 }
      )
    }

    const order = await fetchOrderForWebhook(supabase, tx.commande_id)

    if (!order) {
      await failWebhookTransaction({
        supabase,
        tx,
        event,
        order: null,
        expectedPair: { usd: 0, cdf: 0 },
        actualPair: { usd: 0, cdf: 0 },
        rate: null,
        rateSource: 'none',
        reason: 'ORDER_NOT_FOUND',
      })

      return NextResponse.json(
        {
          success: true,
          status: 'failed',
          reason: 'ORDER_NOT_FOUND',
        },
        { status: 200 }
      )
    }

    const orderStatus = String(order.statut || '').toLowerCase()

    const paidStatuses = new Set([
      'payee',
      'paid',
      'confirmee',
      'confirmed',
    ])

    if (paidStatuses.has(orderStatus)) {
      /**
       * Réparation idempotente :
       * si la commande est déjà payée par cette même transaction,
       * on approuve la transaction sans repayer.
       */
      if (String(order.transaction_id || '') === String(tx.id)) {
        const serverRate = await getServerUsdRate(supabase)
        const txMetadata =
          tx.metadata && typeof tx.metadata === 'object'
            ? tx.metadata
            : {}

        const rate =
          serverRate ??
          positiveNumber(txMetadata.exchange_rate) ??
          positiveNumber(order.exchange_rate) ??
          positiveNumber(order.shipping_rate_used) ??
          null

        const rateSource = serverRate ? 'server' : rate ? 'fallback' : 'none'

        const expectedPair = resolveExpectedPair(order, txMetadata, rate)

        const finalUsd =
          positiveNumber(txMetadata.amount_usd) ??
          expectedPair.usd

        const rateNum = Number(rate)
        const rateOk = Number.isFinite(rateNum) && rateNum > 0

        const finalCdf =
          rateOk && finalUsd > 0
            ? roundCdf(toCdf(finalUsd, rateNum))
            : positiveNumber(txMetadata.amount_cdf) ?? expectedPair.cdf

        const finalPair = {
          usd: round2(finalUsd),
          cdf: roundCdf(finalCdf),
        }

        const metadata = buildWebhookMetadata({
          tx,
          event,
          expectedPair,
          actualPair: finalPair,
          finalPair,
          rate,
          rateSource,
          outcome: 'approved',
          reason: 'REPAIR_ALREADY_PAID_SAME_TRANSACTION',
        })

        await updateTransactionOutcome({
          supabase,
          transactionId: tx.id,
          status: 'approved',
          metadata,
          extra: {
            external_transaction_id: event.transactionId,
            provider: event.provider,
            montant_usd: finalPair.usd,
          },
        })

        return NextResponse.json(
          {
            success: true,
            status: 'approved',
            message: 'Transaction réparée : commande déjà payée par cette transaction.',
          },
          { status: 200 }
        )
      }

      await failWebhookTransaction({
        supabase,
        tx,
        event,
        order,
        expectedPair: { usd: 0, cdf: 0 },
        actualPair: { usd: 0, cdf: 0 },
        rate: null,
        rateSource: 'none',
        reason: 'ORDER_ALREADY_PAID',
      })

      return NextResponse.json(
        {
          success: true,
          status: 'failed',
          reason: 'ORDER_ALREADY_PAID',
        },
        { status: 200 }
      )
    }

    if (orderStatus !== 'en_attente') {
      await failWebhookTransaction({
        supabase,
        tx,
        event,
        order,
        expectedPair: { usd: 0, cdf: 0 },
        actualPair: { usd: 0, cdf: 0 },
        rate: null,
        rateSource: 'none',
        reason: `INVALID_ORDER_STATUS:${orderStatus}`,
      })

      return NextResponse.json(
        {
          success: true,
          status: 'failed',
          reason: 'INVALID_ORDER_STATUS',
        },
        { status: 200 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Taux serveur prioritaire                                     */
    /* ------------------------------------------------------------ */

    const serverRate = await getServerUsdRate(supabase)

    const txMetadata =
      tx.metadata && typeof tx.metadata === 'object'
        ? tx.metadata
        : {}

    const rate =
      serverRate ??
      positiveNumber(txMetadata.exchange_rate) ??
      positiveNumber(order.exchange_rate) ??
      positiveNumber(order.shipping_rate_used) ??
      null

    const rateSource = serverRate
      ? 'server'
      : rate
        ? 'fallback'
        : 'none'

    /* ------------------------------------------------------------ */
    /* USD = source principale                                        */
    /* ------------------------------------------------------------ */

    const expectedPair = resolveExpectedPair(order, txMetadata, rate)

    if (expectedPair.usd <= 0 && expectedPair.cdf <= 0) {
      await failWebhookTransaction({
        supabase,
        tx,
        event,
        order,
        expectedPair,
        actualPair: { usd: 0, cdf: 0 },
        rate,
        rateSource,
        reason: 'EXPECTED_AMOUNT_UNAVAILABLE',
      })

      return NextResponse.json(
        {
          success: true,
          status: 'failed',
          reason: 'EXPECTED_AMOUNT_UNAVAILABLE',
        },
        { status: 200 }
      )
    }

    const hasWebhookAmount =
      event.amount != null && Number(event.amount) > 0

    if (!hasWebhookAmount && !allowWebhookAmountFromMetadata()) {
      await failWebhookTransaction({
        supabase,
        tx,
        event,
        order,
        expectedPair,
        actualPair: { usd: 0, cdf: 0 },
        rate,
        rateSource,
        reason: 'WEBHOOK_AMOUNT_MISSING',
      })

      return NextResponse.json(
        {
          success: true,
          status: 'failed',
          reason: 'WEBHOOK_AMOUNT_MISSING',
        },
        { status: 200 }
      )
    }

    const actualPair = chooseActualPair(
      event.amount,
      event.currency,
      expectedPair,
      rate,
      txMetadata
    )

    if (!amountsMatch(actualPair, expectedPair)) {
      await failWebhookTransaction({
        supabase,
        tx,
        event,
        order,
        expectedPair,
        actualPair,
        rate,
        rateSource,
        reason: `AMOUNT_MISMATCH:expected=${formatPair(expectedPair)},received=${formatPair(actualPair)}`,
      })

      return NextResponse.json(
        {
          success: true,
          status: 'failed',
          reason: 'AMOUNT_MISMATCH',
          expected_usd: expectedPair.usd,
          expected_cdf: expectedPair.cdf,
          received_usd: actualPair.usd,
          received_cdf: actualPair.cdf,
        },
        { status: 200 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Montant final validé                                           */
    /* ------------------------------------------------------------ */

    const finalUsd =
      expectedPair.usd > 0 ? expectedPair.usd : actualPair.usd

    const rateNum = Number(rate)
    const rateOk = Number.isFinite(rateNum) && rateNum > 0

    const finalCdf =
      rateOk && finalUsd > 0
        ? roundCdf(toCdf(finalUsd, rateNum))
        : expectedPair.cdf > 0
          ? expectedPair.cdf
          : actualPair.cdf

    const finalPair: MoneyPair = {
      usd: round2(finalUsd),
      cdf: roundCdf(finalCdf),
    }

    if (event.status === 'failed') {
      await failWebhookTransaction({
        supabase,
        tx,
        event,
        order,
        expectedPair,
        actualPair,
        rate,
        rateSource,
        reason: 'PROVIDER_FAILED',
      })

      return NextResponse.json(
        {
          success: true,
          status: 'failed',
          reason: 'PROVIDER_FAILED',
        },
        { status: 200 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Passage commande payée                                         */
    /* ------------------------------------------------------------ */

    const orderUpdate = await markOrderPaidFromWebhook({
      supabase,
      commandeId: order.id,
      transactionId: tx.id,
      provider: event.provider,
      externalTransactionId: event.transactionId,
      amountUsd: finalPair.usd,
      amountCdf: finalPair.cdf,
      rate,
      rateSource,
    })

    if (orderUpdate.conflict) {
      await failWebhookTransaction({
        supabase,
        tx,
        event,
        order,
        expectedPair,
        actualPair,
        rate,
        rateSource,
        reason: 'CONCURRENT_ORDER_UPDATE',
      })

      return NextResponse.json(
        {
          success: true,
          status: 'failed',
          reason: 'CONCURRENT_ORDER_UPDATE',
        },
        { status: 200 }
      )
    }

    if (orderUpdate.error || !orderUpdate.data) {
      await failWebhookTransaction({
        supabase,
        tx,
        event,
        order,
        expectedPair,
        actualPair,
        rate,
        rateSource,
        reason: orderUpdate.error?.message || 'ORDER_UPDATE_FAILED',
      })

      logger.error(
        {
          error: orderUpdate.error,
          commandeId: order.id,
          transactionId: tx.id,
        },
        'Échec mise à jour commande après webhook validé'
      )

      return NextResponse.json(
        {
          error: 'Échec mise à jour commande.',
          code: 'ORDER_UPDATE_FAILED',
        },
        { status: 500 }
      )
    }

    /* ------------------------------------------------------------ */
    /* Transaction approuvée                                          */
    /* ------------------------------------------------------------ */

    const metadata = buildWebhookMetadata({
      tx,
      event,
      expectedPair,
      actualPair,
      finalPair,
      rate,
      rateSource,
      outcome: 'approved',
    })

    const txUpdate = await updateTransactionOutcome({
      supabase,
      transactionId: tx.id,
      status: 'approved',
      metadata,
      extra: {
        external_transaction_id: event.transactionId,
        provider: event.provider,
        montant_usd: finalPair.usd,
      },
    })

    if (txUpdate.conflict) {
      return NextResponse.json(
        {
          success: true,
          status: 'approved',
          message: 'Transaction déjà approuvée.',
        },
        { status: 200 }
      )
    }

    if (txUpdate.error) {
      logger.error(
        {
          error: txUpdate.error,
          transactionId: tx.id,
          commandeId: order.id,
        },
        'Commande payée mais transaction non approuvée — réparation possible au prochain webhook'
      )

      return NextResponse.json(
        {
          error: 'Transaction non mise à jour après validation commande.',
          code: 'TRANSACTION_UPDATE_FAILED',
        },
        { status: 500 }
      )
    }

    await notifyWebhookOutcome({
      supabase,
      order,
      event,
      outcome: 'approved',
      amountPair: finalPair,
    })

    logger.info(
      {
        commandeId: order.id,
        transactionId: tx.id,
        provider: event.provider,
        externalTransactionId: event.transactionId,
        amount_usd: finalPair.usd,
        amount_cdf: finalPair.cdf,
        exchange_rate: rate,
        rate_source: rateSource,
      },
      'Webhook paiement validé : commande payée'
    )

    return NextResponse.json(
      {
        success: true,
        status: 'approved',
        message: 'Paiement confirmé.',
        amount_usd: finalPair.usd,
        amount_cdf: finalPair.cdf,
        exchange_rate: rate,
      },
      { status: 200 }
    )
  } catch (error: any) {
    logger.error(
      { error },
      'Crash webhook paiement'
    )

    return NextResponse.json(
      {
        error: 'Erreur interne webhook.',
        code: 'INTERNAL_ERROR',
        details: error?.message,
      },
      { status: 500 }
    )
  }
}