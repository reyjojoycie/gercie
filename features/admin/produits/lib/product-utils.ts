// features/admin/produits/lib/product-utils.ts

import type {
  DraftProduct,
  FormSummary,
  PreparedProductPayload,
  ProductAdminMode,
  ProductDraft,
} from '../types'

import { normalizeProductDeliveryConfig } from '@/lib/shipping-utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type PriceSource =
  | 'USD'
  | 'CDF_CONVERTED'
  | 'CDF_LEGACY'
  | 'NONE'

export interface PriceResolution {
  /**
   * Prix USD principal.
   * Peut être 0 si explicitement renseigné.
   */
  prixUsd: number

  /**
   * Prix CDF recalculé ou legacy.
   * Si cdfKnown = false, ce 0 ne doit pas être interprété comme un 0 CDF explicite.
   */
  prixCdf: number

  /**
   * Indique si le CDF est réellement connu.
   */
  cdfKnown: boolean

  /**
   * Indique si l’USD est réellement connu.
   * true même pour 0 USD explicite.
   */
  usdKnown: boolean

  /**
   * Taux serveur valide.
   */
  rateOk: boolean

  /**
   * Source principale du prix résolu.
   */
  source: PriceSource
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export const PRODUCT_CREATE_DRAFT_STORAGE_KEY = 'admin-draft-product-v2'

export const PRODUCT_EDIT_DRAFT_STORAGE_PREFIX = 'admin-product-draft-v2-'

export const PRODUCT_AUTO_SAVE_ENABLED_STORAGE_KEY =
  'admin-product-autosave-enabled-v2'

export const PRODUCT_AUTO_SAVE_INTERVAL_MS = 20_000

export const PRODUCT_RATE_WAIT_TIMEOUT_MS = 2_500

export const DEFAULT_DELAY_LIVRAISON = '24h - 72h'

export const FORBIDDEN_WALLET_KEYS = new Set([
  'wallet',
  'wallet_balance',
  'wallet_id',
  'portefeuille',
  'solde',
  'balance',
  'recharge',
  'deposit',
  'withdrawal',
  'retrait',
  'escrow',
  'money_exchange',
  'exchange',
])

export const EMPTY_SUMMARY: FormSummary = {
  nom: '',
  slug: '',
  categorie: '',
  prixUsd: 0,
  prixCdf: 0,
  stock: null,
  imagesCount: 0,
  variantesCount: 0,
  remisePercent: 0,
  estActif: true,
  descriptionLength: 0,
  metaTitleLength: 0,
  metaDescriptionLength: 0,
  variantAttributesCount: 0,
  variantConfigEnabled: false,
  deliveryAdvancedEnabled: false,
  deliveryActiveModesCount: 0,
  deliveryNonConsolidable: false,
}

const PRICE_USD_KEYS = [
  'prix_usd',
  'price_usd',
  'unit_price_usd',
] as const

const PRICE_CDF_KEYS = [
  'prix',
  'prix_cdf',
  'price',
  'price_cdf',
] as const

const ORIGINAL_PRICE_USD_KEYS = [
  'prix_original_usd',
] as const

const ORIGINAL_PRICE_CDF_KEYS = [
  'prix_original',
  'prix_cdf_original',
] as const

/* ═══════════════════════════════════════════════════════════════ */
/*  BASIC NUMBER HELPERS                                           */
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

function pickValues(source: any, keys: readonly string[]): unknown[] {
  return keys.map((key) => source?.[key])
}

export function num(value: any): number | null {
  return parseFiniteNumber(value)
}

export function positiveNum(value: any): number | null {
  const n = parseFiniteNumber(value)
  return n !== null && n > 0 ? n : null
}

function clampRemise(value: unknown): number {
  const n = parseFiniteNumber(value) ?? 0
  return Math.min(90, Math.max(0, n))
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FORMAT HELPERS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  return `$${round2(value).toFixed(2)}`
}

export function formatCdf(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  return `${Math.round(value).toLocaleString('fr-FR')} FC`
}

export function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 90)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ARRAY / IMAGE HELPERS                                          */
/* ═══════════════════════════════════════════════════════════════ */

export function toStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  }

  return []
}

export function toImageArray(values: any): string[] {
  if (Array.isArray(values?.images)) {
    return values.images.filter(Boolean).map(String)
  }

  if (typeof values?.image === 'string' && values.image.trim()) {
    return [values.image]
  }

  return []
}

/* ═══════════════════════════════════════════════════════════════ */
/*  OBJECT HELPERS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function isPlainObject(value: any): boolean {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  WALLET / FORBIDDEN KEY HELPERS                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function isForbiddenKey(key: string): boolean {
  const lower = key.toLowerCase()

  return (
    FORBIDDEN_WALLET_KEYS.has(lower) ||
    lower.includes('wallet') ||
    lower.includes('portefeuille') ||
    lower.includes('solde') ||
    lower.includes('balance') ||
    lower.includes('recharge') ||
    lower.includes('retrait') ||
    lower.includes('deposit') ||
    lower.includes('withdraw') ||
    lower.includes('escrow')
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRICE RESOLUTION                                               */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Règle absolue :
 * - Si USD existe (y compris 0) → USD = vérité.
 *   CDF = USD × taux.
 *   Si USD = 0, CDF = 0 même sans taux.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux.
 *
 * - Si CDF seul et taux indisponible → CDF_LEGACY.
 *   Lecture tolérée, écriture refusée.
 *
 * - Aucun taux codé en dur.
 */
function resolvePriceFromSignals(
  usdSignal: number | null,
  cdfSignal: number | null,
  rate: number | null
): PriceResolution {
  const rateNum = parseFiniteNumber(rate)
  const rateOk = rateNum != null && rateNum > 0

  if (usdSignal != null) {
    const usd = round2(usdSignal)

    if (usd === 0) {
      return {
        prixUsd: 0,
        prixCdf: 0,
        cdfKnown: true,
        usdKnown: true,
        rateOk,
        source: 'USD',
      }
    }

    if (rateOk && rateNum != null) {
      return {
        prixUsd: usd,
        prixCdf: roundCdf(toCdf(usd, rateNum)),
        cdfKnown: true,
        usdKnown: true,
        rateOk,
        source: 'USD',
      }
    }

    /**
     * Taux indisponible.
     *
     * On ne garde un CDF legacy que s’il est strictement positif.
     * Un CDF = 0 en présence d’un USD > 0 est considéré comme incohérent
     * et n’est pas marqué comme connu.
     */
    const fallbackCdf =
      cdfSignal != null && cdfSignal > 0
        ? roundCdf(cdfSignal)
        : null

    return {
      prixUsd: usd,
      prixCdf: fallbackCdf ?? 0,
      cdfKnown: fallbackCdf != null,
      usdKnown: true,
      rateOk,
      source: 'USD',
    }
  }

  if (cdfSignal != null) {
    const cdf = roundCdf(cdfSignal)

    if (cdf === 0) {
      return {
        prixUsd: 0,
        prixCdf: 0,
        cdfKnown: true,
        usdKnown: true,
        rateOk,
        source: 'USD',
      }
    }

    if (rateOk && rateNum != null) {
      const usd = round2(toUsd(cdf, rateNum))

      return {
        prixUsd: usd,
        prixCdf: cdf,
        cdfKnown: true,
        usdKnown: true,
        rateOk,
        source: 'CDF_CONVERTED',
      }
    }

    return {
      prixUsd: 0,
      prixCdf: cdf,
      cdfKnown: true,
      usdKnown: false,
      rateOk,
      source: 'CDF_LEGACY',
    }
  }

  return {
    prixUsd: 0,
    prixCdf: 0,
    cdfKnown: false,
    usdKnown: false,
    rateOk,
    source: 'NONE',
  }
}

export function computePrices(
  values: any,
  rate: number | null
): PriceResolution {
  const usdSignal = explicitUsd(...pickValues(values, PRICE_USD_KEYS))
  const cdfSignal = explicitCdf(...pickValues(values, PRICE_CDF_KEYS))

  return resolvePriceFromSignals(usdSignal, cdfSignal, rate)
}

function computeOriginalPrices(
  values: any,
  finalPrice: PriceResolution,
  rate: number | null
): PriceResolution {
  const usdSignal = explicitUsd(
    ...pickValues(values, ORIGINAL_PRICE_USD_KEYS)
  )

  const cdfSignal = explicitCdf(
    ...pickValues(values, ORIGINAL_PRICE_CDF_KEYS)
  )

  let resolved = resolvePriceFromSignals(usdSignal, cdfSignal, rate)

  const percent = clampRemise(values?.remise_percent)

  /**
   * Si aucun prix original n’est renseigné mais qu’une remise existe,
   * on peut le déduire depuis le prix final.
   */
  if (resolved.source === 'NONE' && percent > 0) {
    const denominator = 1 - percent / 100

    if (denominator > 0) {
      if (
        (finalPrice.source === 'USD' ||
          finalPrice.source === 'CDF_CONVERTED') &&
        finalPrice.usdKnown
      ) {
        const originalUsd = round2(finalPrice.prixUsd / denominator)

        resolved = resolvePriceFromSignals(originalUsd, null, rate)
      } else if (finalPrice.cdfKnown && finalPrice.prixCdf > 0) {
        const originalCdf = roundCdf(finalPrice.prixCdf / denominator)

        resolved = resolvePriceFromSignals(null, originalCdf, rate)
      }
    }
  }

  return resolved
}

function canWritePriceResolution(resolved: PriceResolution): boolean {
  return (
    resolved.source === 'USD' ||
    resolved.source === 'CDF_CONVERTED'
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT HELPERS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function hasVariantPriceSignal(variant: any): boolean {
  return (
    variant?.prix_usd !== undefined ||
    variant?.price_usd !== undefined ||
    variant?.unit_price_usd !== undefined ||
    variant?.prix !== undefined ||
    variant?.prix_cdf !== undefined ||
    variant?.price !== undefined ||
    variant?.price_cdf !== undefined
  )
}

function normalizeVariantPrices(
  variantes: any[],
  rate: number | null
): any[] {
  if (!Array.isArray(variantes)) return []

  return variantes.map((variant) => {
    if (!isPlainObject(variant)) return variant
    if (!hasVariantPriceSignal(variant)) return variant

    const price = computePrices(variant, rate)
    const out: any = { ...variant }

    if (price.source !== 'NONE') {
      out.prix_usd = price.prixUsd
    }

    if (price.cdfKnown) {
      out.prix = price.prixCdf
      out.prix_cdf = price.prixCdf
    }

    return out
  })
}

function validateVariantPrices(
  variantes: any[],
  rate: number | null,
  errors: string[]
): void {
  for (const variant of variantes) {
    if (!isPlainObject(variant)) continue
    if (!hasVariantPriceSignal(variant)) continue

    const price = computePrices(variant, rate)

    if (price.source === 'CDF_LEGACY') {
      errors.push(
        'Une variante contient un prix CDF legacy sans taux USD/CDF disponible. Le prix USD doit être renseigné ou le taux doit être disponible.'
      )

      return
    }

    if (price.source === 'NONE') {
      errors.push(
        'Une variante ne contient aucun prix USD ou CDF exploitable.'
      )

      return
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LOCAL STORAGE HELPERS                                          */
/* ═══════════════════════════════════════════════════════════════ */

export function safeLocalStorageGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function safeLocalStorageSet(key: string, value: any): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // silencieux
  }
}

export function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(key)
  } catch {
    // silencieux
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DRAFT STORAGE KEY HELPERS                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function getProductDraftStorageKey(
  mode: ProductAdminMode,
  productId?: string | null
): string {
  if (mode === 'edit' && productId) {
    return `${PRODUCT_EDIT_DRAFT_STORAGE_PREFIX}${productId}`
  }

  return PRODUCT_CREATE_DRAFT_STORAGE_KEY
}

export function readProductDraft<T = DraftProduct>(
  storageKey: string | null
): T | null {
  if (!storageKey || typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeProductDraft(
  storageKey: string | null,
  value: any
): boolean {
  if (!storageKey || typeof window === 'undefined') return false

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeProductDraft(storageKey: string | null): void {
  if (!storageKey) return
  safeLocalStorageRemove(storageKey)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZE PRODUCT FOR FORM                                     */
/* ═══════════════════════════════════════════════════════════════ */

export function normalizeProductForForm(
  product: ProductDraft | DraftProduct | null,
  rate: number | null
): ProductDraft | null {
  if (!product) return null

  const base: any = { ...product }

  base.images = toImageArray(base)

  base.variantes = normalizeVariantPrices(
    Array.isArray(base.variantes) ? base.variantes : [],
    rate
  )

  base.variant_attributes = Array.isArray(base.variant_attributes)
    ? base.variant_attributes
    : []

  base.variant_config = isPlainObject(base.variant_config)
    ? base.variant_config
    : null

  base.delivery_config = isPlainObject(base.delivery_config)
    ? base.delivery_config
    : null

  base.specifications = Array.isArray(base.specifications)
    ? base.specifications
    : []

  base.rich_content = isPlainObject(base.rich_content)
    ? base.rich_content
    : null

  base.tags_array = toStringArray(base.tags)
  base.tags = base.tags_array.join(', ')
  base.badges = toStringArray(base.badges)

  if (!base.slug) {
    base.slug = slugify(base.nom || '')
  }

  const price = computePrices(base, rate)

  if (price.source !== 'NONE') {
    base.prix_usd = price.prixUsd
  }

  if (price.cdfKnown) {
    base.prix = price.prixCdf
    base.prix_cdf = price.prixCdf
  }

  base.remise_percent = clampRemise(base.remise_percent)

  const original = computeOriginalPrices(base, price, rate)

  if (original.source !== 'NONE') {
    base.prix_original_usd = original.prixUsd
  }

  if (original.cdfKnown) {
    base.prix_original = original.prixCdf
  }

  return base as ProductDraft
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BUILD SUMMARY                                                  */
/* ═══════════════════════════════════════════════════════════════ */

export function buildSummary(values: any, rate: number | null): FormSummary {
  if (!values) return EMPTY_SUMMARY

  const price = computePrices(values, rate)
  const images = toImageArray(values)
  const variantes = Array.isArray(values.variantes) ? values.variantes : []
  const variantAttributes = Array.isArray(values.variant_attributes)
    ? values.variant_attributes
    : []
  const variantConfig = isPlainObject(values.variant_config)
    ? values.variant_config
    : null
  const deliveryConfig = isPlainObject(values.delivery_config)
    ? values.delivery_config
    : null

  const deliveryModes =
    deliveryConfig?.modes && typeof deliveryConfig.modes === 'object'
      ? Object.values(deliveryConfig.modes)
      : []

  const deliveryActiveModesCount = deliveryModes.filter(
    (mode: any) => Boolean(mode?.enabled)
  ).length

  const deliveryNonConsolidable = deliveryModes.some((mode: any) =>
    Boolean(
      mode?.non_consolidable ||
        mode?.mandatory_per_unit ||
        mode?.protect_margin
    )
  )

  const remisePercent = clampRemise(values.remise_percent)

  return {
    nom: String(values.nom || '').trim(),
    slug: String(values.slug || '').trim() || slugify(values.nom || ''),
    categorie: String(values.categorie || '').trim(),
    prixUsd: price.prixUsd,
    prixCdf: price.prixCdf,
    stock: num(values.stock),
    imagesCount: images.length,
    variantesCount: variantes.length,
    remisePercent,
    estActif: values.est_actif !== false,
    descriptionLength: String(values.description || '').trim().length,
    metaTitleLength: String(values.meta_title || values.nom || '').trim().length,
    metaDescriptionLength: String(values.meta_description || '').trim().length,
    variantAttributesCount: variantAttributes.length,
    variantConfigEnabled: Boolean(variantConfig),
    deliveryAdvancedEnabled: Boolean(deliveryConfig?.enabled),
    deliveryActiveModesCount,
    deliveryNonConsolidable,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SANITIZE PAYLOAD                                               */
/* ═══════════════════════════════════════════════════════════════ */

export function sanitizePayload(
  values: any,
  rate: number | null
): PreparedProductPayload {
  const errors: string[] = []

  const nom = String(values?.nom || '').trim()
  const categorie = String(values?.categorie || '').trim()
  const description = String(values?.description || '').trim()
  const slug = String(values?.slug || '').trim() || slugify(nom)

  const price = computePrices(values, rate)
  const original = computeOriginalPrices(values, price, rate)

  const rawRemise = num(values?.remise_percent) ?? 0
  const remisePercent = clampRemise(rawRemise)

  const stock = num(values?.stock) ?? 0

  const images = toImageArray(values)

  const variantes = normalizeVariantPrices(
    Array.isArray(values?.variantes) ? values.variantes : [],
    rate
  )

  const variantAttributes = Array.isArray(values?.variant_attributes)
    ? values.variant_attributes
    : []

  const variantConfig = isPlainObject(values?.variant_config)
    ? values.variant_config
    : null

  const deliveryConfigInput = isPlainObject(values?.delivery_config)
    ? values.delivery_config
    : null

  const normalizedDeliveryConfig = normalizeProductDeliveryConfig(
    deliveryConfigInput,
    values,
    rate
  )

  const specifications = Array.isArray(values?.specifications)
    ? values.specifications
    : []

  const richContent = isPlainObject(values?.rich_content)
    ? values.rich_content
    : null

  const tags = toStringArray(values?.tags)
  const badges = toStringArray(values?.badges)

  if (!nom) errors.push('Le nom du produit est requis.')
  if (!categorie) errors.push('La catégorie est requise.')
  if (images.length === 0) errors.push('Ajoutez au moins une image produit.')

  if (price.source === 'NONE') {
    errors.push('Aucun prix USD ou CDF exploitable détecté.')
  } else if (price.source === 'CDF_LEGACY') {
    errors.push(
      'Prix CDF legacy détecté sans taux USD/CDF disponible. Le prix USD doit être renseigné ou le taux doit être disponible.'
    )
  }

  if (stock < 0) errors.push('Le stock ne peut pas être négatif.')

  if (rawRemise < 0 || rawRemise > 90) {
    errors.push('La remise doit être entre 0 et 90%.')
  }

  validateVariantPrices(variantes, rate, errors)

  if (normalizedDeliveryConfig.enabled) {
    const activeModes = Object.values(
      normalizedDeliveryConfig.modes || {}
    ).some((mode: any) => mode?.enabled)

    if (!activeModes) {
      errors.push(
        'La livraison avancée est activée, mais aucun mode de livraison n’est actif.'
      )
    }
  }

  const canWritePrice = canWritePriceResolution(price)
  const canWriteOriginal = canWritePriceResolution(original)

  const payload: any = { ...values }

  delete payload._saved_at

  Object.assign(payload, {
    nom,
    slug,
    categorie,
    description,

    rich_content: richContent,

    variantes: variantes.length > 0 ? variantes : null,
    variant_attributes: variantAttributes.length > 0 ? variantAttributes : null,
    variant_config: variantConfig,

    delivery_config: normalizedDeliveryConfig.enabled
      ? normalizedDeliveryConfig
      : null,

    specifications: specifications.length > 0 ? specifications : null,

    main_image_index: num(values?.main_image_index) ?? 0,
    categorie_id: values?.categorie_id || null,

    prix_usd: canWritePrice ? price.prixUsd : null,
    prix: price.cdfKnown ? price.prixCdf : null,
    prix_cdf: price.cdfKnown ? price.prixCdf : null,

    prix_original_usd: canWriteOriginal ? original.prixUsd : null,
    prix_original:
      canWriteOriginal && original.cdfKnown
        ? original.prixCdf
        : null,

    remise_percent: remisePercent,

    stock,
    est_actif: values?.est_actif !== false,

    images,

    tags: tags.join(', '),
    tags_array: tags,
    badges,

    meta_title: String(values?.meta_title || nom).slice(0, 120),
    meta_description: String(
      values?.meta_description || description.slice(0, 160)
    ).slice(0, 180),

    video_url: values?.video_url || null,
    marque: values?.marque || null,
    sku: values?.sku || null,
    barcode: values?.barcode || null,

    poids_kg: num(values?.poids_kg),
    longueur_cm: num(values?.longueur_cm),
    largeur_cm: num(values?.largeur_cm),
    hauteur_cm: num(values?.hauteur_cm),

    delay_livraison: values?.delay_livraison || DEFAULT_DELAY_LIVRAISON,
    livraison_domicile: num(values?.livraison_domicile),
    livraison_point_retrait: num(values?.livraison_point_retrait),
    livraison_express: num(values?.livraison_express),
    express_gratuit: Boolean(values?.express_gratuit),

    livraison_domicile_active:
      values?.livraison_domicile_active ?? true,
    livraison_point_retrait_active:
      values?.livraison_point_retrait_active ?? true,
    livraison_express_active:
      values?.livraison_express_active ?? true,

    notes_internes: values?.notes_internes || null,

    featured: Boolean(values?.featured),
    ribbon: values?.ribbon || 'none',
    limit_per_client: num(values?.limit_per_client),
    negociable: Boolean(values?.negociable),

    exchange_rate: price.rateOk ? parseFiniteNumber(rate) : null,
    price_source: price.source,
  })

  for (const key of Object.keys(payload)) {
    if (isForbiddenKey(key)) {
      delete payload[key]
    }
  }

  return {
    payload: payload as ProductDraft,
    errors,
    summary: buildSummary(payload, rate),
  }
}