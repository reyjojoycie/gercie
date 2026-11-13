// lib/promo-utils.ts
/**
 * Utilitaires pour la gestion des codes promo.
 *
 * Fonctions pures, réutilisables côté client comme côté serveur.
 *
 * Règle monétaire absolue :
 * - USD = source principale / vérité.
 * - CDF = conversion recalculée à partir du taux fourni.
 * - Aucun taux codé en dur.
 * - Legacy CDF-only toléré seulement s’il peut être converti ou utilisé en fallback explicite.
 */

/* ========================================================================== */
/*  Types monétaires                                                           */
/* ========================================================================== */

export interface MoneyPair {
  usd: number
  cdf: number | null
  cdfKnown: boolean
  source:
    | 'USD'
    | 'CDF_CONVERTED'
    | 'CDF_LEGACY'
    | 'NONE'
}

/* ========================================================================== */
/*  Types promo                                                                */
/* ========================================================================== */

export interface PromoCode {
  code: string
  type: 'percent' | 'fixed'
  value: number

  minTotal?: number
  maxDiscount?: number

  /**
   * Champs alignés USD / CDF.
   */
  value_usd?: number | null
  value_cdf?: number | null

  min_total_usd?: number | null
  min_total_cdf?: number | null

  max_discount_usd?: number | null
  max_discount_cdf?: number | null

  /**
   * Ancien champ possible pour les pourcentages.
   */
  reduction_percent?: number | null

  /**
   * Marqueurs legacy.
   * Si currency = CDF ou usd_source = false, les champs non suffixés sont traités comme CDF legacy.
   */
  currency?: string | null
  usd_source?: boolean | null

  /**
   * Cumul avec d’autres promos.
   */
  cumulable?: boolean | null
}

export type PromoCodeInput =
  | PromoCode
  | (Partial<PromoCode> & Record<string, any>)

export interface NormalizedPromoCode {
  code: string
  type: 'percent' | 'fixed'

  percent: number | null
  fixed: MoneyPair

  minTotal: MoneyPair
  maxDiscount: MoneyPair

  cumulable: boolean
}

export interface PromoValidationResult {
  valid: boolean
  error?: string
  warnings?: string[]
}

export interface PromoStatusCheck {
  actif?: boolean | null
  active?: boolean | null

  expires_at?: string | null
  expiresAt?: string | null
  expiration_date?: string | null

  utilisations_actuelles?: number | null
  utilisation_actuelle?: number | null

  max_utilisations?: number | null
  max_utilisation?: number | null
}

export interface DiscountCalculationResult {
  valid: boolean
  error?: string
  warnings: string[]

  discountUsd: number
  discountCdf: number | null
  discountCdfKnown: boolean

  applied: boolean
  normalizedPromo: NormalizedPromoCode
}

/* ========================================================================== */
/*  Number helpers                                                             */
/* ========================================================================== */

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

function normalizeBoolean(value: unknown, fallback = false): boolean {
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

/* ========================================================================== */
/*  Money resolution                                                           */
/* ========================================================================== */

/**
 * Règle absolue :
 * - Si USD existe (y compris 0) → USD = vérité.
 *   CDF = USD × taux.
 *   Si USD = 0, CDF = 0 même sans taux.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux.
 *
 * - Si CDF seul et taux indisponible → fallback lecture seulement.
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

function resolveInputMoneyPair(
  input: any,
  keys: {
    usd: string[]
    cdf: string[]
    legacy: string[]
  },
  rate: number | null,
  defaultCurrency: 'USD' | 'CDF' = 'USD'
): MoneyPair {
  const usd = explicitUsd(...keys.usd.map((key) => input?.[key]))
  const cdf = explicitCdf(...keys.cdf.map((key) => input?.[key]))

  if (usd != null || cdf != null) {
    return resolvePricePair(usd, cdf, rate)
  }

  const legacy = firstFinite(...keys.legacy.map((key) => input?.[key]))

  if (legacy == null) {
    return {
      usd: 0,
      cdf: null,
      cdfKnown: false,
      source: 'NONE',
    }
  }

  const currency = String(input?.currency || '').toUpperCase()
  const usdSource = input?.usd_source

  if (currency === 'CDF' || usdSource === false) {
    return resolvePricePair(null, legacy, rate)
  }

  if (currency === 'USD' || usdSource === true) {
    return resolvePricePair(legacy, null, rate)
  }

  return defaultCurrency === 'USD'
    ? resolvePricePair(legacy, null, rate)
    : resolvePricePair(null, legacy, rate)
}

/* ========================================================================== */
/*  Promo normalization                                                        */
/* ========================================================================== */

function inferPromoType(input: any): 'percent' | 'fixed' {
  const raw = String(
    input?.type ?? input?.kind ?? input?.discount_type ?? ''
  )
    .trim()
    .toLowerCase()

  if (raw === 'fixed' || raw === 'fixe' || raw === 'montant_fixe') {
    return 'fixed'
  }

  if (raw === 'percent' || raw === 'pourcentage' || raw === '%') {
    return 'percent'
  }

  if (input?.reduction_percent != null) {
    return 'percent'
  }

  if (input?.value_usd != null || input?.value_cdf != null) {
    return 'fixed'
  }

  return 'percent'
}

export function normalizePromoCode(
  input: PromoCodeInput,
  rate: number | null = null
): NormalizedPromoCode {
  const type = inferPromoType(input)

  const percent =
    type === 'percent'
      ? firstFinite(
          input?.reduction_percent,
          input?.value,
          input?.valeur,
          input?.discount
        )
      : null

  const fixed =
    type === 'fixed'
      ? resolveInputMoneyPair(
          input,
          {
            usd: ['value_usd'],
            cdf: ['value_cdf'],
            legacy: ['value', 'valeur', 'discount'],
          },
          rate,
          'USD'
        )
      : {
          usd: 0,
          cdf: null,
          cdfKnown: false,
          source: 'NONE' as const,
        }

  const minTotal = resolveInputMoneyPair(
    input,
    {
      usd: ['min_total_usd', 'minTotalUsd'],
      cdf: ['min_total_cdf'],
      legacy: ['minTotal', 'min_total'],
    },
    rate,
    'USD'
  )

  const maxDiscount = resolveInputMoneyPair(
    input,
    {
      usd: ['max_discount_usd', 'maxDiscountUsd'],
      cdf: ['max_discount_cdf'],
      legacy: ['maxDiscount', 'max_discount'],
    },
    rate,
    'USD'
  )

  return {
    code: sanitizePromoCode(String(input?.code ?? '')),
    type,

    percent: percent != null ? round2(Math.max(0, percent)) : null,
    fixed,

    minTotal,
    maxDiscount,

    cumulable: normalizeBoolean(input?.cumulable, false),
  }
}

/* ========================================================================== */
/*  Subtotal resolution                                                        */
/* ========================================================================== */

interface ResolvedSubtotal {
  usd: number | null
  cdf: number | null
  warnings: string[]
}

function resolveSubtotal(
  subtotal: MoneyPair | number | null | undefined,
  rate: number | null
): ResolvedSubtotal {
  const warnings: string[] = []

  if (subtotal == null) {
    return {
      usd: null,
      cdf: null,
      warnings: ['Montant du panier indisponible.'],
    }
  }

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (typeof subtotal === 'number') {
    const n = parseFiniteNumber(subtotal)

    if (n == null || n < 0) {
      return {
        usd: null,
        cdf: null,
        warnings: ['Montant du panier USD invalide.'],
      }
    }

    const usd = round2(n)

    return {
      usd,
      cdf: rateOk ? roundCdf(toCdf(usd, rateNum)) : null,
      warnings,
    }
  }

  const source = String((subtotal as any)?.source || '')
  const usdCandidate = parseFiniteNumber((subtotal as any)?.usd)
  const cdfCandidate = parseFiniteNumber((subtotal as any)?.cdf)

  /**
   * Legacy CDF-only :
   * usd peut être 0, mais ce 0 n’est pas une vérité USD.
   */
  if (
    source === 'CDF_LEGACY' &&
    (usdCandidate == null || usdCandidate === 0) &&
    cdfCandidate != null &&
    cdfCandidate > 0
  ) {
    if (rateOk) {
      return {
        usd: round2(toUsd(cdfCandidate, rateNum)),
        cdf: roundCdf(cdfCandidate),
        warnings,
      }
    }

    return {
      usd: null,
      cdf: roundCdf(cdfCandidate),
      warnings: [
        'Montant du panier uniquement en CDF legacy et taux USD/CDF indisponible.',
      ],
    }
  }

  if (usdCandidate != null && usdCandidate >= 0) {
    const usd = round2(usdCandidate)

    return {
      usd,
      cdf:
        cdfCandidate != null && cdfCandidate >= 0
          ? roundCdf(cdfCandidate)
          : rateOk
            ? roundCdf(toCdf(usd, rateNum))
            : null,
      warnings,
    }
  }

  if (cdfCandidate != null && cdfCandidate >= 0) {
    if (rateOk) {
      return {
        usd: round2(toUsd(cdfCandidate, rateNum)),
        cdf: roundCdf(cdfCandidate),
        warnings,
      }
    }

    return {
      usd: null,
      cdf: roundCdf(cdfCandidate),
      warnings: [
        'Montant du panier uniquement en CDF et taux USD/CDF indisponible.',
      ],
    }
  }

  return {
    usd: null,
    cdf: null,
    warnings: ['Montant du panier indisponible.'],
  }
}

/* ========================================================================== */
/*  Discount calculation                                                       */
/* ========================================================================== */

function applyMaxDiscount(
  discountUsd: number,
  maxDiscount: MoneyPair,
  subtotalCdf: number | null,
  rate: number | null
): { discountUsd: number; error?: string; warnings: string[] } {
  const warnings: string[] = []

  if (maxDiscount.source === 'NONE') {
    return { discountUsd, warnings }
  }

  /**
   * 0 USD explicite = aucun plafond.
   */
  if (maxDiscount.usd === 0 && maxDiscount.source === 'USD') {
    return { discountUsd, warnings }
  }

  if (maxDiscount.source === 'CDF_LEGACY') {
    const rateNum = Number(rate)
    const rateOk = Number.isFinite(rateNum) && rateNum > 0

    if (!rateOk) {
      return {
        discountUsd,
        error:
          'Plafond de réduction CDF legacy non convertible : taux USD/CDF indisponible.',
        warnings,
      }
    }

    if (maxDiscount.cdf != null && maxDiscount.cdf > 0) {
      const maxUsd = round2(toUsd(maxDiscount.cdf, rateNum))
      return {
        discountUsd: Math.min(discountUsd, maxUsd),
        warnings,
      }
    }
  }

  if (maxDiscount.usd > 0) {
    return {
      discountUsd: Math.min(discountUsd, maxDiscount.usd),
      warnings,
    }
  }

  return { discountUsd, warnings }
}

function applyMinTotal(
  subtotalUsd: number,
  subtotalCdf: number | null,
  minTotal: MoneyPair,
  rate: number | null
): { valid: boolean; error?: string; warnings: string[] } {
  const warnings: string[] = []

  if (minTotal.source === 'NONE') {
    return { valid: true, warnings }
  }

  /**
   * 0 USD explicite = aucun minimum.
   */
  if (minTotal.usd === 0 && minTotal.source === 'USD') {
    return { valid: true, warnings }
  }

  if (minTotal.source === 'CDF_LEGACY') {
    const rateNum = Number(rate)
    const rateOk = Number.isFinite(rateNum) && rateNum > 0

    if (rateOk && minTotal.cdf != null && minTotal.cdf > 0) {
      const minUsd = round2(toUsd(minTotal.cdf, rateNum))

      if (subtotalUsd < minUsd) {
        return {
          valid: false,
          error: 'Le montant minimum du panier n’est pas atteint.',
          warnings,
        }
      }

      return { valid: true, warnings }
    }

    if (
      !rateOk &&
      subtotalCdf != null &&
      minTotal.cdf != null &&
      minTotal.cdf > 0
    ) {
      if (subtotalCdf < minTotal.cdf) {
        return {
          valid: false,
          error:
            'Le montant minimum du panier (CDF legacy) n’est pas atteint.',
          warnings,
        }
      }

      warnings.push(
        'Minimum panier vérifié en CDF legacy faute de taux USD/CDF.'
      )

      return { valid: true, warnings }
    }

    return {
      valid: false,
      error:
        'Minimum panier CDF legacy non convertible : taux USD/CDF indisponible.',
      warnings,
    }
  }

  if (minTotal.usd > 0 && subtotalUsd < minTotal.usd) {
    return {
      valid: false,
      error: 'Le montant minimum du panier n’est pas atteint.',
      warnings,
    }
  }

  return { valid: true, warnings }
}

export function calculateDiscountPair(
  subtotal: MoneyPair | number | null | undefined,
  promo: PromoCodeInput,
  rate: number | null = null
): DiscountCalculationResult {
  const normalizedPromo = normalizePromoCode(promo, rate)
  const resolvedSubtotal = resolveSubtotal(subtotal, rate)

  const warnings: string[] = [...resolvedSubtotal.warnings]

  const emptyResult: DiscountCalculationResult = {
    valid: false,
    warnings,
    discountUsd: 0,
    discountCdf: null,
    discountCdfKnown: false,
    applied: false,
    normalizedPromo,
  }

  if (resolvedSubtotal.usd == null) {
    return {
      ...emptyResult,
      error:
        'Montant du panier USD indisponible ou non convertible en toute sécurité.',
    }
  }

  const subtotalUsd = round2(Math.max(0, resolvedSubtotal.usd))
  const subtotalCdf =
    resolvedSubtotal.cdf != null ? roundCdf(resolvedSubtotal.cdf) : null

  let discountUsd = 0

  if (normalizedPromo.type === 'percent') {
    const percent = normalizedPromo.percent

    if (percent == null || percent < 1 || percent > 99) {
      return {
        ...emptyResult,
        error: 'Réduction en pourcentage invalide.',
      }
    }

    discountUsd = round2((subtotalUsd * percent) / 100)

    const maxResult = applyMaxDiscount(
      discountUsd,
      normalizedPromo.maxDiscount,
      subtotalCdf,
      rate
    )

    warnings.push(...maxResult.warnings)

    if (maxResult.error) {
      return {
        ...emptyResult,
        error: maxResult.error,
        warnings,
      }
    }

    discountUsd = maxResult.discountUsd

    const minResult = applyMinTotal(
      subtotalUsd,
      subtotalCdf,
      normalizedPromo.minTotal,
      rate
    )

    warnings.push(...minResult.warnings)

    if (!minResult.valid) {
      return {
        ...emptyResult,
        error: minResult.error,
        warnings,
      }
    }
  } else {
    const fixed = normalizedPromo.fixed

    if (fixed.source === 'NONE') {
      return {
        ...emptyResult,
        error: 'Montant fixe USD manquant.',
      }
    }

    if (fixed.source === 'CDF_LEGACY') {
      const rateNum = Number(rate)
      const rateOk = Number.isFinite(rateNum) && rateNum > 0

      if (!rateOk) {
        return {
          ...emptyResult,
          error:
            'Montant fixe CDF legacy non convertible : taux USD/CDF indisponible.',
        }
      }
    }

    const valueUsd =
      fixed.source === 'CDF_LEGACY' && fixed.cdf != null && fixed.cdf > 0
        ? round2(toUsd(fixed.cdf, Number(rate)))
        : fixed.usd

    if (valueUsd == null || valueUsd <= 0) {
      return {
        ...emptyResult,
        error: 'Le montant fixe USD doit être supérieur à 0.',
      }
    }

    discountUsd = round2(Math.min(subtotalUsd, valueUsd))

    const maxResult = applyMaxDiscount(
      discountUsd,
      normalizedPromo.maxDiscount,
      subtotalCdf,
      rate
    )

    warnings.push(...maxResult.warnings)

    if (maxResult.error) {
      return {
        ...emptyResult,
        error: maxResult.error,
        warnings,
      }
    }

    discountUsd = maxResult.discountUsd

    const minResult = applyMinTotal(
      subtotalUsd,
      subtotalCdf,
      normalizedPromo.minTotal,
      rate
    )

    warnings.push(...minResult.warnings)

    if (!minResult.valid) {
      return {
        ...emptyResult,
        error: minResult.error,
        warnings,
      }
    }
  }

  discountUsd = round2(Math.max(0, Math.min(discountUsd, subtotalUsd)))

  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  const discountCdf =
    discountUsd === 0
      ? 0
      : rateOk
        ? roundCdf(toCdf(discountUsd, rateNum))
        : null

  return {
    valid: true,
    warnings,
    discountUsd,
    discountCdf,
    discountCdfKnown: discountCdf != null,
    applied: discountUsd > 0,
    normalizedPromo,
  }
}

/**
 * Backward-compatible helper.
 *
 * Important :
 * - `sousTotal` est désormais considéré comme USD principal.
 * - Retourne le discount en USD.
 * - Si le calcul n’est pas sécurisé, retourne 0.
 */
export function calculateDiscount(
  sousTotal: number,
  promo: PromoCode,
  rate: number | null = null
): number {
  const result = calculateDiscountPair(sousTotal, promo, rate)

  return result.valid ? result.discountUsd : 0
}

/* ========================================================================== */
/*  Promo status validation                                                    */
/* ========================================================================== */

export function isPromoValid(
  promo: PromoStatusCheck
): PromoValidationResult {
  const warnings: string[] = []

  const actifValue =
    promo.actif !== undefined ? promo.actif : promo.active

  const actif =
    actifValue === undefined
      ? true
      : normalizeBoolean(actifValue, true)

  if (!actif) {
    return {
      valid: false,
      error: "Ce code promo n'est plus actif.",
      warnings,
    }
  }

  const expiresRaw =
    promo.expires_at ??
    promo.expiresAt ??
    promo.expiration_date ??
    null

  if (expiresRaw) {
    const expiry = new Date(String(expiresRaw))

    if (Number.isNaN(expiry.getTime())) {
      return {
        valid: false,
        error: 'Date d’expiration invalide pour ce code promo.',
        warnings,
      }
    }

    if (expiry < new Date()) {
      return {
        valid: false,
        error: 'Ce code promo a expiré.',
        warnings,
      }
    }
  }

  const usedRaw = firstFinite(
    promo.utilisations_actuelles,
    promo.utilisation_actuelle
  )

  const used =
    usedRaw != null && usedRaw >= 0 ? Math.floor(usedRaw) : 0

  const maxRaw = firstFinite(
    promo.max_utilisations,
    promo.max_utilisation
  )

  /**
   * Règle alignée :
   * 0 = illimité.
   * Absence = illimité par défaut dans cette utilitaire pure.
   */
  const max =
    maxRaw != null && maxRaw >= 0 ? Math.floor(maxRaw) : 0

  if (max > 0 && used >= max) {
    return {
      valid: false,
      error:
        'Ce code promo a déjà été utilisé le nombre maximum de fois.',
      warnings,
    }
  }

  return {
    valid: true,
    warnings,
  }
}

/* ========================================================================== */
/*  Code generation / sanitization                                             */
/* ========================================================================== */

const PROMO_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function getRandomValues(length: number): Uint32Array {
  const array = new Uint32Array(length)

  const cryptoObj = (globalThis as any).crypto

  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(array)
    return array
  }

  for (let i = 0; i < length; i++) {
    array[i] = Math.floor(Math.random() * 0xffffffff)
  }

  return array
}

/**
 * Génère un code promo alphanumérique en majuscules.
 * Utilise crypto.getRandomValues() quand disponible.
 */
export function generatePromoCode(length: number = 8): string {
  const safeLength = Math.max(4, Math.min(64, Math.floor(length) || 8))
  const random = getRandomValues(safeLength)

  let code = ''

  for (let i = 0; i < safeLength; i++) {
    code += PROMO_CODE_CHARS[random[i] % PROMO_CODE_CHARS.length]
  }

  return code
}

/**
 * Nettoie un code promo saisi par l’utilisateur.
 * - Supprime tous les espaces.
 * - Passe en majuscules.
 */
export function sanitizePromoCode(input: string): string {
  return String(input ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()
}

/* ========================================================================== */
/*  Stacking                                                                   */
/* ========================================================================== */

/**
 * Vérifie si deux codes promo peuvent être cumulés.
 *
 * Règle par défaut :
 * - Pas de cumul.
 * - Un code peut être cumulable seulement si `cumulable === true`.
 * - Tous les codes actifs doivent être cumulables.
 */
export function canStackPromo(
  activeCodes: PromoCode[],
  newCode: PromoCode
): boolean {
  if (activeCodes.length === 0) return true

  if (newCode.cumulable !== true) return false

  return activeCodes.every((code) => code.cumulable === true)
}