// app/api/promo/validate/route.ts
import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

import logger from '@/lib/logger'
import {
  checkRateLimit,
  applyRateLimitHeaders,
} from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PROMO_TABLE_CANDIDATES = ['promo_codes', 'codes_promo'] as const

const MIN_CODE_LENGTH = 1
const MAX_CODE_LENGTH = 50

const RATE_CACHE_TTL_MS = 30_000

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface MoneyPair {
  usd: number
  cdf: number | null
  cdfKnown: boolean
  source:
    | 'USD'
    | 'CDF_CONVERTED'
    | 'CDF_LEGACY'
    | 'NONE'
}

interface NormalizedPromoValidation {
  code: string
  type: 'percent' | 'fixed'

  reduction_percent: number | null

  value_usd: number | null
  value_cdf: number | null

  min_total_usd: number | null
  min_total_cdf: number | null

  max_discount_usd: number | null
  max_discount_cdf: number | null

  max_utilisations: number
  utilisations_actuelles: number

  actif: boolean
  expires_at: string | null

  exchange_rate: number | null
  price_source: MoneyPair['source']

  warnings: string[]
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function parseFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return null

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) ? n : null
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
  if (!Number.isFinite(cdf) || cdf < 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return round2(cdf / rate)
}

function toCdf(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0

  return roundCdf(usd * rate)
}

/**
 * USD : autorise 0.
 * Important : 0 USD explicite doit être respecté.
 */
function explicitUsd(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return round2(n)
    }
  }

  return null
}

/**
 * CDF : autorise 0.
 */
function explicitCdf(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null && n >= 0) {
      return roundCdf(n)
    }
  }

  return null
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseFiniteNumber(value)

    if (n != null) return n
  }

  return null
}

function normalizeBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase()

    if (clean === 'true' || clean === 'yes' || clean === 'oui') return true
    if (clean === 'false' || clean === 'no' || clean === 'non') return false
  }

  return fallback
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TAUX SERVEUR                                                   */
/* ═══════════════════════════════════════════════════════════════ */

let cachedServerRate: {
  value: number | null
  expiresAt: number
} | null = null

function resolveRateFromRow(row: any): number | null {
  const candidates = [
    row?.rate,
    row?.usd_rate,
    row?.taux,
    row?.value,
    row?.data?.rate,
    row?.current?.rate,
  ]

  for (const candidate of candidates) {
    const n = parseFiniteNumber(candidate)

    if (n != null && n > 0) {
      return round2(n)
    }
  }

  return null
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('relation') ||
    String(error?.code || '') === '42P01'
  )
}

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || '')

  return (
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message) ||
    /is not a column/i.test(message) ||
    String(error?.code || '') === '42703'
  )
}

async function getServerUsdRate(supabase: any): Promise<number | null> {
  if (!supabase) return null

  const now = Date.now()

  if (cachedServerRate && cachedServerRate.expiresAt > now) {
    return cachedServerRate.value
  }

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

        cachedServerRate = {
          value: rate,
          expiresAt: now + RATE_CACHE_TTL_MS,
        }

        return rate
      }

      if (isMissingTableError(error)) {
        cachedServerRate = {
          value: null,
          expiresAt: now + RATE_CACHE_TTL_MS,
        }

        return null
      }

      if (isMissingColumnError(error)) {
        continue
      }
    } catch (err) {
      logger.warn?.('Exception lecture exchange_rates promo validate', err)
    }
  }

  cachedServerRate = {
    value: null,
    expiresAt: now + RATE_CACHE_TTL_MS,
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  USD / CDF RESOLUTION                                           */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Règle absolue :
 * - Si USD existe (y compris 0) → USD = vérité.
 *   CDF = USD × taux serveur.
 *   Si USD = 0, CDF = 0 même sans taux.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux serveur.
 *
 * - Si CDF seul et taux indisponible → lecture tolérée en fallback.
 *
 * - Aucun taux codé en dur.
 */
function resolvePricePair(
  usdSource: number | null,
  cdfSource: number | null,
  rate: number | null
): MoneyPair {
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (usdSource != null) {
    const usd = round2(usdSource)

    if (usd === 0) {
      return {
        usd: 0,
        cdf: 0,
        cdfKnown: true,
        source: 'USD',
      }
    }

    if (rateOk) {
      return {
        usd,
        cdf: roundCdf(toCdf(usd, rateNum)),
        cdfKnown: true,
        source: 'USD',
      }
    }

    return {
      usd,
      cdf: cdfSource != null ? roundCdf(cdfSource) : null,
      cdfKnown: cdfSource != null,
      source: 'USD',
    }
  }

  if (cdfSource != null) {
    const cdf = roundCdf(cdfSource)

    if (cdf === 0) {
      return {
        usd: 0,
        cdf: 0,
        cdfKnown: true,
        source: 'USD',
      }
    }

    if (rateOk) {
      const usd = round2(toUsd(cdf, rateNum))

      return {
        usd,
        cdf,
        cdfKnown: true,
        source: 'CDF_CONVERTED',
      }
    }

    return {
      usd: 0,
      cdf,
      cdfKnown: true,
      source: 'CDF_LEGACY',
    }
  }

  return {
    usd: 0,
    cdf: null,
    cdfKnown: false,
    source: 'NONE',
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PROMO NORMALIZATION                                            */
/* ═══════════════════════════════════════════════════════════════ */

function inferPromoType(row: any): 'percent' | 'fixed' {
  const raw = String(
    row?.type ?? row?.kind ?? row?.discount_type ?? ''
  ).trim().toLowerCase()

  if (raw === 'fixed' || raw === 'fixe' || raw === 'montant_fixe') {
    return 'fixed'
  }

  if (raw === 'percent' || raw === 'pourcentage' || raw === '%') {
    return 'percent'
  }

  if (row?.reduction_percent != null) {
    return 'percent'
  }

  if (
    row?.value_usd != null ||
    row?.value_cdf != null
  ) {
    return 'fixed'
  }

  return 'percent'
}

function getFixedMoneySources(row: any): {
  usd: number | null
  cdf: number | null
} {
  const explicitValueUsd = explicitUsd(row?.value_usd)
  const explicitValueCdf = explicitCdf(row?.value_cdf)

  if (explicitValueUsd != null || explicitValueCdf != null) {
    return {
      usd: explicitValueUsd,
      cdf: explicitValueCdf,
    }
  }

  const legacy = firstFinite(
    row?.value,
    row?.valeur,
    row?.discount
  )

  if (legacy == null) {
    return { usd: null, cdf: null }
  }

  const currency = String(row?.currency || '').toUpperCase()
  const usdSourceFlag = row?.usd_source

  if (currency === 'CDF' || usdSourceFlag === false) {
    return { usd: null, cdf: legacy }
  }

  /**
   * Par défaut, USD = source principale.
   * Un ancien champ `value` sans marqueur CDF est traité comme USD.
   */
  return { usd: legacy, cdf: null }
}

function getMinTotalSources(row: any): {
  usd: number | null
  cdf: number | null
} {
  return {
    usd: explicitUsd(row?.min_total_usd, row?.minTotalUsd),
    cdf: explicitCdf(row?.min_total_cdf, row?.min_total),
  }
}

function getMaxDiscountSources(row: any): {
  usd: number | null
  cdf: number | null
} {
  return {
    usd: explicitUsd(row?.max_discount_usd, row?.maxDiscountUsd),
    cdf: explicitCdf(row?.max_discount_cdf, row?.max_discount),
  }
}

function normalizePromoForValidation(
  row: any,
  rate: number | null
): NormalizedPromoValidation {
  const type = inferPromoType(row)

  let reduction_percent: number | null = null
  let fixedPair: MoneyPair = {
    usd: 0,
    cdf: null,
    cdfKnown: false,
    source: 'NONE',
  }

  if (type === 'percent') {
    const pct = firstFinite(
      row?.reduction_percent,
      row?.value,
      row?.valeur,
      row?.discount
    )

    reduction_percent = pct != null ? round2(Math.max(0, pct)) : null
  } else {
    const fixedSources = getFixedMoneySources(row)
    fixedPair = resolvePricePair(fixedSources.usd, fixedSources.cdf, rate)
  }

  const minSources = getMinTotalSources(row)
  const minPair = resolvePricePair(minSources.usd, minSources.cdf, rate)

  const maxSources = getMaxDiscountSources(row)
  const maxPair = resolvePricePair(maxSources.usd, maxSources.cdf, rate)

  const maxRaw = firstFinite(
    row?.max_utilisations,
    row?.max_utilisation
  )

  const max_utilisations =
    maxRaw != null && maxRaw >= 0 ? Math.floor(maxRaw) : 0

  const usedRaw = firstFinite(
    row?.utilisations_actuelles,
    row?.utilisation_actuelle
  )

  const utilisations_actuelles =
    usedRaw != null && usedRaw >= 0 ? Math.floor(usedRaw) : 0

  const actifValue =
    row?.actif !== undefined ? row?.actif : row?.active

  const actif =
    actifValue === undefined
      ? true
      : normalizeBoolean(actifValue, true)

  const expires_at =
    row?.expires_at ??
    row?.expiresAt ??
    row?.expiration_date ??
    null

  const warnings: string[] = []

  if (rate == null) {
    if (type === 'fixed' && fixedPair.source === 'CDF_LEGACY') {
      warnings.push(
        'Taux USD/CDF indisponible : montant fixe CDF legacy non convertible en USD.'
      )
    }

    if (minPair.source === 'CDF_LEGACY') {
      warnings.push(
        'Taux USD/CDF indisponible : minimum panier CDF legacy conservé en fallback.'
      )
    }

    if (maxPair.source === 'CDF_LEGACY') {
      warnings.push(
        'Taux USD/CDF indisponible : plafond de réduction CDF legacy conservé en fallback.'
      )
    }
  }

  return {
    code: String(row?.code ?? '').trim().toUpperCase(),
    type,

    reduction_percent,

    value_usd:
      type === 'fixed'
        ? fixedPair.source === 'NONE' || fixedPair.source === 'CDF_LEGACY'
          ? null
          : fixedPair.usd
        : null,

    value_cdf:
      type === 'fixed'
        ? fixedPair.cdfKnown
          ? fixedPair.cdf
          : null
        : null,

    min_total_usd:
      minPair.source === 'NONE' || minPair.source === 'CDF_LEGACY'
        ? null
        : minPair.usd,

    min_total_cdf:
      minPair.cdfKnown
        ? minPair.cdf
        : null,

    max_discount_usd:
      maxPair.source === 'NONE' || maxPair.source === 'CDF_LEGACY'
        ? null
        : maxPair.usd,

    max_discount_cdf:
      maxPair.cdfKnown
        ? maxPair.cdf
        : null,

    max_utilisations,
    utilisations_actuelles,

    actif,
    expires_at,

    exchange_rate: rate,

    price_source:
      type === 'fixed'
        ? fixedPair.source
        : reduction_percent != null
          ? 'USD'
          : 'NONE',

    warnings,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TABLE RESOLUTION                                               */
/* ═══════════════════════════════════════════════════════════════ */

async function findPromoByCode(
  supabase: any,
  code: string
): Promise<{ promo: any | null; tableName: string | null }> {
  for (const tableName of PROMO_TABLE_CANDIDATES) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('code', code)
        .maybeSingle()

      if (!error && data) {
        return { promo: data, tableName }
      }

      if (error) {
        if (
          isMissingTableError(error) ||
          isMissingColumnError(error)
        ) {
          continue
        }

        logger.warn?.(
          `Erreur recherche code promo dans ${tableName}`,
          error
        )
      }
    } catch (err: any) {
      logger.warn?.(
        `Exception recherche code promo dans ${tableName}`,
        err
      )
    }
  }

  return { promo: null, tableName: null }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ROUTE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = await checkRateLimit({
    id: `promo-validate:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          valid: false,
          error: 'Trop de tentatives de validation de code promo.',
        },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  let rawCode: unknown

  try {
    const body = await request.json()
    rawCode = body?.code
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Requête invalide' },
      { status: 400 }
    )
  }

  const code = String(rawCode ?? '').trim().toUpperCase()

  if (
    !code ||
    code.length < MIN_CODE_LENGTH ||
    code.length > MAX_CODE_LENGTH
  ) {
    return NextResponse.json(
      { valid: false, error: 'Code promo invalide' },
      { status: 200 }
    )
  }

  let supabase: any

  try {
    supabase = await createClient(true)
  } catch (err: any) {
    logger.error?.('Crash création client Supabase promo validate', err)

    return NextResponse.json(
      {
        valid: false,
        error: 'Service momentanément indisponible.',
      },
      { status: 503 }
    )
  }

  if (!supabase) {
    return NextResponse.json(
      {
        valid: false,
        error: 'Service momentanément indisponible.',
      },
      { status: 503 }
    )
  }

  try {
    const { promo } = await findPromoByCode(supabase, code)

    if (!promo) {
      return NextResponse.json(
        { valid: false, error: 'Code promo invalide' },
        { status: 200 }
      )
    }

    const rate = await getServerUsdRate(supabase)
    const normalized = normalizePromoForValidation(promo, rate)

    if (!normalized.actif) {
      return NextResponse.json(
        {
          valid: false,
          error: "Ce code promo n'est plus actif",
          code: normalized.code,
        },
        { status: 200 }
      )
    }

    if (normalized.expires_at) {
      const expiry = new Date(normalized.expires_at)

      if (Number.isNaN(expiry.getTime())) {
        return NextResponse.json(
          {
            valid: false,
            error: 'Date d’expiration invalide pour ce code promo.',
            code: normalized.code,
          },
          { status: 200 }
        )
      }

      if (expiry < new Date()) {
        return NextResponse.json(
          {
            valid: false,
            error: 'Ce code promo a expiré',
            code: normalized.code,
          },
          { status: 200 }
        )
      }
    }

    if (
      normalized.max_utilisations > 0 &&
      normalized.utilisations_actuelles >= normalized.max_utilisations
    ) {
      return NextResponse.json(
        {
          valid: false,
          error:
            'Ce code promo a déjà été utilisé le nombre maximum de fois',
          code: normalized.code,
        },
        { status: 200 }
      )
    }

    if (normalized.type === 'percent') {
      if (
        normalized.reduction_percent == null ||
        normalized.reduction_percent < 1 ||
        normalized.reduction_percent > 99
      ) {
        return NextResponse.json(
          {
            valid: false,
            error: 'Réduction en pourcentage invalide pour ce code promo.',
            code: normalized.code,
          },
          { status: 200 }
        )
      }
    } else {
      if (normalized.price_source === 'CDF_LEGACY') {
        return NextResponse.json(
          {
            valid: false,
            error:
              'Taux USD/CDF indisponible : impossible de convertir ce montant fixe CDF legacy en USD.',
            code: normalized.code,
            warnings: normalized.warnings,
          },
          { status: 200 }
        )
      }

      if (
        normalized.value_usd == null ||
        normalized.value_usd <= 0
      ) {
        return NextResponse.json(
          {
            valid: false,
            error: 'Montant fixe USD invalide pour ce code promo.',
            code: normalized.code,
          },
          { status: 200 }
        )
      }
    }

    return NextResponse.json(
      {
        valid: true,
        code: normalized.code,
        type: normalized.type,

        reduction_percent: normalized.reduction_percent,

        value_usd: normalized.value_usd,
        value_cdf: normalized.value_cdf,

        min_total_usd: normalized.min_total_usd,
        min_total_cdf: normalized.min_total_cdf,

        max_discount_usd: normalized.max_discount_usd,
        max_discount_cdf: normalized.max_discount_cdf,

        max_utilisations: normalized.max_utilisations,
        utilisations_actuelles: normalized.utilisations_actuelles,

        expires_at: normalized.expires_at,
        actif: normalized.actif,

        exchange_rate: normalized.exchange_rate,
        price_source: normalized.price_source,

        warnings: normalized.warnings,
      },
      { status: 200 }
    )
  } catch (error: any) {
    logger.error?.('Crash POST promo/validate', error)

    return NextResponse.json(
      {
        valid: false,
        error: 'Erreur serveur lors de la validation du code promo.',
      },
      { status: 500 }
    )
  }
}