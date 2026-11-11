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

/* ═══════════════════════════════════════════════════════════════ */
/*  BASIC NUMBER HELPERS                                           */
/* ═══════════════════════════════════════════════════════════════ */

export function num(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function positiveNum(value: any): number | null {
  const n = num(value)
  return n !== null && n > 0 ? n : null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FORMAT HELPERS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `$${value.toFixed(2)}`
}

export function formatCdf(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
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
/*  PRICE HELPERS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

export function computePrices(values: any, rate: number | null) {
  const rawUsd = positiveNum(values?.prix_usd ?? values?.price_usd)
  const rawCdf = positiveNum(values?.prix ?? values?.prix_cdf ?? values?.price)
  const rateOk = positiveNum(rate)

  let prixUsd = rawUsd ?? 0
  let prixCdf = rawCdf ?? 0

  if (!prixUsd && prixCdf && rateOk) {
    prixUsd = Number((prixCdf / rateOk).toFixed(2))
  }

  if (!prixCdf && prixUsd && rateOk) {
    prixCdf = Math.round(prixUsd * rateOk)
  }

  return {
    prixUsd,
    prixCdf,
    rateOk,
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

  const base: ProductDraft = { ...product }

  base.images = toImageArray(base)

  base.variantes = Array.isArray(base.variantes) ? base.variantes : []

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

  const { prixUsd, prixCdf } = computePrices(base, rate)

  if (prixUsd > 0) base.prix_usd = prixUsd

  if (prixCdf > 0) {
    base.prix = prixCdf
    base.prix_cdf = prixCdf
  }

  const remisePercent = Math.max(0, num(base.remise_percent) ?? 0)

  const rawOriginalUsd = positiveNum(base.prix_original_usd)
  const rawOriginalCdf = positiveNum(base.prix_original)

  let originalUsd = rawOriginalUsd ?? 0
  let originalCdf = rawOriginalCdf ?? 0

  if (!originalUsd && originalCdf && rate) {
    originalUsd = Number((originalCdf / rate).toFixed(2))
  }

  if (!originalCdf && originalUsd && rate) {
    originalCdf = Math.round(originalUsd * rate)
  }

  if (remisePercent > 0 && prixUsd > 0 && !originalUsd) {
    originalUsd = Number((prixUsd / (1 - remisePercent / 100)).toFixed(2))
  }

  if (remisePercent > 0 && prixCdf > 0 && !originalCdf) {
    originalCdf = Math.round(prixCdf / (1 - remisePercent / 100))
  }

  if (originalUsd > 0) base.prix_original_usd = originalUsd
  if (originalCdf > 0) base.prix_original = originalCdf

  return base
}

/* ═══════════════════════════════════════════════════════════════ */
/*  BUILD SUMMARY                                                  */
/* ═══════════════════════════════════════════════════════════════ */

export function buildSummary(values: any, rate: number | null): FormSummary {
  if (!values) return EMPTY_SUMMARY

  const { prixUsd, prixCdf } = computePrices(values, rate)
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

  const remisePercent = Math.max(0, num(values.remise_percent) ?? 0)

  return {
    nom: String(values.nom || '').trim(),
    slug: String(values.slug || '').trim() || slugify(values.nom || ''),
    categorie: String(values.categorie || '').trim(),
    prixUsd,
    prixCdf,
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

  const { prixUsd, prixCdf, rateOk } = computePrices(values, rate)

  const stock = num(values?.stock) ?? 0
  const remisePercent = Math.min(
    90,
    Math.max(0, num(values?.remise_percent) ?? 0)
  )

  const images = toImageArray(values)

  const variantes = Array.isArray(values?.variantes)
    ? values.variantes
    : []

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

  if (prixUsd <= 0) {
    errors.push('Le prix USD est requis : USD est la devise principale.')
  }

  if (prixCdf <= 0) {
    errors.push(
      rateOk
        ? 'Le prix CDF est invalide.'
        : 'Le prix CDF ne peut pas être calculé : taux de change indisponible.'
    )
  }

  if (stock < 0) errors.push('Le stock ne peut pas être négatif.')

  if (remisePercent < 0 || remisePercent > 90) {
    errors.push('La remise doit être entre 0 et 90%.')
  }

  for (const variante of variantes) {
    const varianteStock = num(variante?.stock)

    if (varianteStock !== null && varianteStock < 0) {
      errors.push('Le stock d’une variante ne peut pas être négatif.')
      break
    }
  }

  if (normalizedDeliveryConfig.enabled) {
    const activeModes = Object.values(
      normalizedDeliveryConfig.modes || {}
    ).some((mode: any) => mode?.enabled)

    if (!activeModes) {
      errors.push(
        'La livraison avancée est activée, mais aucun mode de livraison nest actif.'
      )
    }
  }

  const prixOriginalUsd =
    positiveNum(values?.prix_original_usd) ??
    (remisePercent > 0 && prixUsd > 0
      ? Number((prixUsd / (1 - remisePercent / 100)).toFixed(2))
      : null)

  const prixOriginalCdf =
    positiveNum(values?.prix_original) ??
    positiveNum(values?.prix_cdf_original) ??
    (remisePercent > 0 && prixCdf > 0
      ? Math.round(prixCdf / (1 - remisePercent / 100))
      : null)

  const payload: ProductDraft = { ...values }

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

    prix_usd: prixUsd,
    prix: prixCdf,
    prix_cdf: prixCdf,
    prix_original_usd: prixOriginalUsd,
    prix_original: prixOriginalCdf,
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
  })

  for (const key of Object.keys(payload)) {
    if (isForbiddenKey(key)) {
      delete payload[key]
    }
  }

  return {
    payload,
    errors,
    summary: buildSummary(payload, rate),
  }
}