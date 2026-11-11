// features/admin/produits/lib/variant-utils.ts

import type {
  ProductDetail,
  ProductDraft,
  VariantAttributeConfig,
  VariantAttributeType,
  VariantConfig,
  VariantOption,
  VarianteAdvanced,
} from '../types'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS BASIC                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `variant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function safeString(value: any, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  return String(value)
}

function safeNullableString(value: any): string | null {
  const s = safeString(value, '')
  return s.trim() ? s.trim() : null
}

function safeBoolean(value: any, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function safeNumber(value: any, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function safePositiveNumber(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function safeNonNegativeNumber(value: any, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function normalizeColorHex(value: any): string | null {
  const raw = safeString(value, '').trim()
  if (!raw) return null

  const hex = raw.startsWith('#') ? raw.slice(1) : raw

  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.toUpperCase()}`
  }

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return `#${hex.toUpperCase()}`
  }

  return null
}

function normalizeImageUrl(value: any): string | null {
  const url = safeNullableString(value)
  if (!url) return null

  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
  } catch {
    return null
  }

  return null
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT OPTION / ATTRIBUTE NORMALIZATION                       */
/* ═══════════════════════════════════════════════════════════════ */

export function normalizeVariantOption(
  input: any,
  index = 0
): VariantOption | null {
  const value = safeString(input?.value).trim()
  if (!value) return null

  return {
    value,
    label: safeString(input?.label).trim() || value,
    image: normalizeImageUrl(input?.image),
    colorHex: normalizeColorHex(input?.colorHex ?? input?.color),
    sort: safeNumber(input?.sort, index),
    active: safeBoolean(input?.active, true),
  }
}

export function normalizeVariantAttribute(
  input: any,
  index = 0
): VariantAttributeConfig | null {
  const key = safeString(input?.key).trim()
  if (!key) return null

  const type: VariantAttributeType =
    input?.type === 'size' ||
    input?.type === 'color' ||
    input?.type === 'image' ||
    input?.type === 'swatch' ||
    input?.type === 'model' ||
    input?.type === 'text'
      ? input.type
      : 'text'

  const options = Array.isArray(input?.options)
    ? (input.options
        .map((option: any, optionIndex: number) =>
          normalizeVariantOption(option, optionIndex)
        )
        .filter(Boolean) as VariantOption[])
    : []

  return {
    key,
    label: safeString(input?.label).trim() || key,
    type,
    required: safeBoolean(input?.required, true),
    options,
    sortOrder: safeNumber(input?.sortOrder, index),
  }
}

export function normalizeVariantAttributes(input: any): VariantAttributeConfig[] {
  if (!Array.isArray(input)) return []

  const normalized = input
    .map((attribute, index) => normalizeVariantAttribute(attribute, index))
    .filter(Boolean) as VariantAttributeConfig[]

  const seen = new Set<string>()

  return normalized
    .filter((attribute) => {
      if (seen.has(attribute.key)) return false
      seen.add(attribute.key)
      return true
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANTE NORMALIZATION                                         */
/* ═══════════════════════════════════════════════════════════════ */

export function normalizeVariante(
  input: any,
  attributeKeys: string[] = []
): VarianteAdvanced {
  const attributes: Record<string, string> = {}

  if (input?.attributes && typeof input.attributes === 'object') {
    for (const [key, value] of Object.entries(input.attributes)) {
      const cleanKey = safeString(key).trim()
      const cleanValue = safeString(value).trim()
      if (cleanKey && cleanValue) {
        attributes[cleanKey] = cleanValue
      }
    }
  }

  for (const key of attributeKeys) {
    if (!attributes[key]) {
      attributes[key] = ''
    }
  }

  const images = Array.isArray(input?.images)
    ? input.images
        .map((image: any) => normalizeImageUrl(image))
        .filter(Boolean)
    : []

  const singleImage = normalizeImageUrl(input?.image)
  const finalImages = uniqueStrings([
    ...(singleImage ? [singleImage] : []),
    ...images,
  ])

  return {
    id: safeString(input?.id).trim() || generateId(),
    attributes,
    stock: safeNonNegativeNumber(input?.stock, 0),

    prix_specifique_usd: safePositiveNumber(input?.prix_specifique_usd),
    prix_specifique_cdf: safePositiveNumber(input?.prix_specifique_cdf),
    prix_original_usd: safePositiveNumber(input?.prix_original_usd),
    prix_original_cdf: safePositiveNumber(input?.prix_original_cdf),

    sku: safeNullableString(input?.sku),
    barcode: safeNullableString(input?.barcode),

    image: finalImages[0] ?? null,
    images: finalImages,

    colorHex: normalizeColorHex(input?.colorHex ?? input?.color),

    is_default: safeBoolean(input?.is_default, false),
    is_active: safeBoolean(input?.is_active, true),

    poids_kg: safePositiveNumber(input?.poids_kg),
    longueur_cm: safePositiveNumber(input?.longueur_cm),
    largeur_cm: safePositiveNumber(input?.largeur_cm),
    hauteur_cm: safePositiveNumber(input?.hauteur_cm),

    specs:
      input?.specs && typeof input.specs === 'object'
        ? Object.fromEntries(
            Object.entries(input.specs).map(([key, value]) => [
              safeString(key).trim(),
              safeString(value).trim(),
            ])
          )
        : {},

    notes: safeNullableString(input?.notes),

    created_at: safeNullableString(input?.created_at),
    updated_at: safeNullableString(input?.updated_at),
  }
}

export function normalizeVariantes(
  input: any,
  attributeKeys: string[] = []
): VarianteAdvanced[] {
  if (!Array.isArray(input)) return []

  return input
    .map((variante) => normalizeVariante(variante, attributeKeys))
    .filter((variante) => {
      const hasAttribute = Object.values(variante.attributes || {}).some((value) =>
        safeString(value).trim()
      )
      return hasAttribute
    })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT CONFIG NORMALIZATION                                   */
/* ═══════════════════════════════════════════════════════════════ */

export function createDefaultVariantConfig(): VariantConfig {
  return {
    displayMode: 'swatches',

    hideUnavailable: false,
    disableUnavailable: true,

    showMiniPhotos: true,
    showColorSwatches: true,
    showSizeLabels: true,

    galleryStrategy: 'variant_first',
    defaultSelection: 'first_available',
    preferredAttributes: {},

    allowBackorder: false,
    lowStockThreshold: 5,
    requireCompleteSelection: true,
    showStockCount: true,
    outOfStockBehavior: 'disable',
  }
}

export function normalizeVariantConfig(input: any): VariantConfig {
  const defaults = createDefaultVariantConfig()

  return {
    displayMode:
      input?.displayMode === 'buttons' ||
      input?.displayMode === 'dropdown' ||
      input?.displayMode === 'swatches'
        ? input.displayMode
        : defaults.displayMode,

    hideUnavailable: safeBoolean(input?.hideUnavailable, defaults.hideUnavailable),
    disableUnavailable: safeBoolean(
      input?.disableUnavailable,
      defaults.disableUnavailable
    ),

    showMiniPhotos: safeBoolean(input?.showMiniPhotos, defaults.showMiniPhotos),
    showColorSwatches: safeBoolean(
      input?.showColorSwatches,
      defaults.showColorSwatches
    ),
    showSizeLabels: safeBoolean(input?.showSizeLabels, defaults.showSizeLabels),

    galleryStrategy:
      input?.galleryStrategy === 'general_first' ||
      input?.galleryStrategy === 'variant_only' ||
      input?.galleryStrategy === 'variant_first'
        ? input.galleryStrategy
        : defaults.galleryStrategy,

    defaultSelection:
      input?.defaultSelection === 'none' ||
      input?.defaultSelection === 'preferred' ||
      input?.defaultSelection === 'default_variant' ||
      input?.defaultSelection === 'first_available'
        ? input.defaultSelection
        : defaults.defaultSelection,

    preferredAttributes:
      input?.preferredAttributes && typeof input.preferredAttributes === 'object'
        ? Object.fromEntries(
            Object.entries(input.preferredAttributes).map(([key, value]) => [
              safeString(key).trim(),
              safeString(value).trim(),
            ])
          )
        : {},

    allowBackorder: safeBoolean(input?.allowBackorder, defaults.allowBackorder),
    lowStockThreshold: safeNonNegativeNumber(
      input?.lowStockThreshold,
      defaults.lowStockThreshold
    ),
    requireCompleteSelection: safeBoolean(
      input?.requireCompleteSelection,
      defaults.requireCompleteSelection
    ),
    showStockCount: safeBoolean(input?.showStockCount, defaults.showStockCount),

    outOfStockBehavior:
      input?.outOfStockBehavior === 'hide' ||
      input?.outOfStockBehavior === 'allow_backorder' ||
      input?.outOfStockBehavior === 'disable'
        ? input.outOfStockBehavior
        : defaults.outOfStockBehavior,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ATTRIBUTE KEYS / ORDERING                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function getVariantAttributeKeys(
  attributes: VariantAttributeConfig[],
  variantes: VarianteAdvanced[] = []
): string[] {
  const fromAttributes = attributes.map((attribute) => attribute.key)

  const fromVariantes = variantes.flatMap((variante) =>
    Object.keys(variante.attributes || {})
  )

  return uniqueStrings([...fromAttributes, ...fromVariantes])
}

export function sortVariantOptions(options: VariantOption[]): VariantOption[] {
  return [...options].sort((a, b) => {
    const sortA = safeNumber(a.sort, 0)
    const sortB = safeNumber(b.sort, 0)

    if (sortA !== sortB) return sortA - sortB

    return safeString(a.label || a.value).localeCompare(
      safeString(b.label || b.value),
      'fr',
      { sensitivity: 'base' }
    )
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMBINATION GENERATION                                         */
/* ═══════════════════════════════════════════════════════════════ */

function cartesianProduct(...arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>(
    (acc, curr) => acc.flatMap((a) => curr.map((c) => [...a, c])),
    [[]]
  )
}

export function generateCombinationsFromAttributes(
  attributes: VariantAttributeConfig[]
): Record<string, string>[] {
  const activeAttributes = attributes.filter(
    (attribute) => attribute.options.some((option) => option.active !== false)
  )

  if (activeAttributes.length === 0) return []

  const arrays = activeAttributes.map((attribute) =>
    sortVariantOptions(attribute.options)
      .filter((option) => option.active !== false)
      .map((option) => option.value)
  )

  const combos = cartesianProduct(...arrays)

  return combos.map((combo) => {
    const attributesRecord: Record<string, string> = {}

    activeAttributes.forEach((attribute, index) => {
      attributesRecord[attribute.key] = combo[index] || ''
    })

    return attributesRecord
  })
}

export function createVarianteFromCombination(
  combination: Record<string, string>,
  defaults?: Partial<VarianteAdvanced>
): VarianteAdvanced {
  return normalizeVariante({
    id: generateId(),
    attributes: combination,
    stock: defaults?.stock ?? 0,
    prix_specifique_usd: defaults?.prix_specifique_usd ?? null,
    prix_specifique_cdf: defaults?.prix_specifique_cdf ?? null,
    sku: defaults?.sku ?? null,
    barcode: defaults?.barcode ?? null,
    image: defaults?.image ?? null,
    images: defaults?.images ?? [],
    is_default: defaults?.is_default ?? false,
    is_active: defaults?.is_active ?? true,
  })
}

export function getVariantKey(
  attributes: Record<string, string>,
  attributeKeys: string[]
): string {
  return attributeKeys
    .map((key) => `${key}:${safeString(attributes?.[key]).trim()}`)
    .join(' | ')
}

export function findVariantByAttributes(
  variantes: VarianteAdvanced[],
  attributes: Record<string, string>,
  attributeKeys: string[]
): VarianteAdvanced | null {
  const targetKey = getVariantKey(attributes, attributeKeys)

  return (
    variantes.find(
      (variante) => getVariantKey(variante.attributes || {}, attributeKeys) === targetKey
    ) || null
  )
}

export function syncVariantesWithAttributes(
  existingVariantes: VarianteAdvanced[],
  attributes: VariantAttributeConfig[],
  options?: {
    keepExisting?: boolean
    removeObsolete?: boolean
  }
): {
  variantes: VarianteAdvanced[]
  obsolete: VarianteAdvanced[]
} {
  const attributeKeys = getVariantAttributeKeys(attributes)
  const combinations = generateCombinationsFromAttributes(attributes)

  const existingByKey = new Map<string, VarianteAdvanced>()

  for (const variante of existingVariantes) {
    const key = getVariantKey(variante.attributes || {}, attributeKeys)
    existingByKey.set(key, variante)
  }

  const nextVariantes: VarianteAdvanced[] = []
  const usedKeys = new Set<string>()

  for (const combination of combinations) {
    const key = getVariantKey(combination, attributeKeys)
    usedKeys.add(key)

    const existing = existingByKey.get(key)

    if (existing && options?.keepExisting !== false) {
      nextVariantes.push(
        normalizeVariante(
          {
            ...existing,
            attributes: combination,
          },
          attributeKeys
        )
      )
    } else {
      nextVariantes.push(createVarianteFromCombination(combination))
    }
  }

  const obsolete =
    options?.removeObsolete === false
      ? []
      : existingVariantes.filter((variante) => {
          const key = getVariantKey(variante.attributes || {}, attributeKeys)
          return !usedKeys.has(key)
        })

  const keptObsolete =
    options?.removeObsolete === false ? obsolete : []

  return {
    variantes: [...nextVariantes, ...keptObsolete],
    obsolete,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  AVAILABILITY LOGIC                                             */
/* ═══════════════════════════════════════════════════════════════ */

export function isVariantPurchasable(
  variante: VarianteAdvanced,
  config: VariantConfig
): boolean {
  if (!variante.is_active) return false
  if (config.allowBackorder) return true
  return safeNonNegativeNumber(variante.stock, 0) > 0
}

function matchesSubset(
  variantAttributes: Record<string, string>,
  selectedAttributes: Record<string, string>
): boolean {
  for (const [key, value] of Object.entries(selectedAttributes)) {
    const cleanValue = safeString(value).trim()
    if (!cleanValue) continue

    if (safeString(variantAttributes?.[key]).trim() !== cleanValue) {
      return false
    }
  }

  return true
}

export interface AvailableOptionResult {
  option: VariantOption
  attributeKey: string
  available: boolean
  hidden: boolean
  disabled: boolean
}

export function getAvailableOptionResults({
  attributeKey,
  selectedAttributes,
  variantes,
  attributes,
  config,
}: {
  attributeKey: string
  selectedAttributes: Record<string, string>
  variantes: VarianteAdvanced[]
  attributes: VariantAttributeConfig[]
  config: VariantConfig
}): AvailableOptionResult[] {
  const attribute = attributes.find((item) => item.key === attributeKey)

  if (!attribute) return []

  const options = sortVariantOptions(attribute.options).filter(
    (option) => option.active !== false
  )

  const results: AvailableOptionResult[] = options.map((option) => {
    const testSelection = {
      ...selectedAttributes,
      [attributeKey]: option.value,
    }

    const available = variantes.some((variante) => {
      if (!isVariantPurchasable(variante, config)) return false
      return matchesSubset(variante.attributes || {}, testSelection)
    })

    const hidden = !available && config.hideUnavailable
    const disabled = !available && config.disableUnavailable

    return {
      option,
      attributeKey,
      available,
      hidden,
      disabled,
    }
  })

  if (config.hideUnavailable) {
    return results.filter((result) => result.available)
  }

  return results
}

export function getAvailableOptionValues({
  attributeKey,
  selectedAttributes,
  variantes,
  attributes,
  config,
}: {
  attributeKey: string
  selectedAttributes: Record<string, string>
  variantes: VarianteAdvanced[]
  attributes: VariantAttributeConfig[]
  config: VariantConfig
}): VariantOption[] {
  return getAvailableOptionResults({
    attributeKey,
    selectedAttributes,
    variantes,
    attributes,
    config,
  }).map((result) => result.option)
}

export function isOptionDisabled({
  attributeKey,
  value,
  selectedAttributes,
  variantes,
  attributes,
  config,
}: {
  attributeKey: string
  value: string
  selectedAttributes: Record<string, string>
  variantes: VarianteAdvanced[]
  attributes: VariantAttributeConfig[]
  config: VariantConfig
}): boolean {
  const results = getAvailableOptionResults({
    attributeKey,
    selectedAttributes,
    variantes,
    attributes,
    config,
  })

  const found = results.find((result) => result.option.value === value)

  return found ? found.disabled : true
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MATCHING VARIANT                                               */
/* ═══════════════════════════════════════════════════════════════ */

export function getMatchingVariant({
  variantes,
  selectedAttributes,
  attributeKeys,
}: {
  variantes: VarianteAdvanced[]
  selectedAttributes: Record<string, string>
  attributeKeys: string[]
}): VarianteAdvanced | null {
  const cleanSelection = Object.fromEntries(
    Object.entries(selectedAttributes || {}).filter(([, value]) =>
      safeString(value).trim()
    )
  )

  if (Object.keys(cleanSelection).length === 0) return null

  return (
    variantes.find((variante) =>
      matchesSubset(variante.attributes || {}, cleanSelection)
    ) || null
  )
}

export function hasCompleteSelection({
  selectedAttributes,
  attributes,
}: {
  selectedAttributes: Record<string, string>
  attributes: VariantAttributeConfig[]
}): boolean {
  const requiredAttributes = attributes.filter((attribute) => attribute.required !== false)

  return requiredAttributes.every((attribute) =>
    Boolean(safeString(selectedAttributes?.[attribute.key]).trim())
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DEFAULT SELECTION                                              */
/* ═══════════════════════════════════════════════════════════════ */

export function getRecommendedSelectedAttributes({
  variantes,
  attributes,
  config,
}: {
  variantes: VarianteAdvanced[]
  attributes: VariantAttributeConfig[]
  config: VariantConfig
}): Record<string, string> {
  if (config.defaultSelection === 'none') return {}

  const attributeKeys = getVariantAttributeKeys(attributes)

  if (config.defaultSelection === 'default_variant') {
    const defaultVariant = variantes.find(
      (variante) => variante.is_default && isVariantPurchasable(variante, config)
    )

    if (defaultVariant) {
      return { ...defaultVariant.attributes }
    }
  }

  if (config.defaultSelection === 'preferred') {
    const preferred = Object.fromEntries(
      Object.entries(config.preferredAttributes || {}).filter(([, value]) =>
        safeString(value).trim()
      )
    )

    const matching = getMatchingVariant({
      variantes,
      selectedAttributes: preferred,
      attributeKeys,
    })

    if (matching && isVariantPurchasable(matching, config)) {
      return { ...matching.attributes }
    }
  }

  const purchasableVariantes = variantes.filter((variante) =>
    isVariantPurchasable(variante, config)
  )

  if (purchasableVariantes.length === 0) return {}

  const defaultVariant = purchasableVariantes.find(
    (variante) => variante.is_default
  )

  if (defaultVariant) {
    return { ...defaultVariant.attributes }
  }

  const selection: Record<string, string> = {}

  const sortedAttributes = [...attributes].sort((a, b) => {
    const sortA = safeNumber(a.sortOrder, 0)
    const sortB = safeNumber(b.sortOrder, 0)
    return sortA - sortB
  })

  for (const attribute of sortedAttributes) {
    const options = sortVariantOptions(attribute.options).filter(
      (option) => option.active !== false
    )

    for (const option of options) {
      const testSelection = {
        ...selection,
        [attribute.key]: option.value,
      }

      const exists = purchasableVariantes.some((variante) =>
        matchesSubset(variante.attributes || {}, testSelection)
      )

      if (exists) {
        selection[attribute.key] = option.value
        break
      }
    }
  }

  return selection
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GALLERY LOGIC                                                  */
/* ═══════════════════════════════════════════════════════════════ */

export function getProductGeneralImages(product?: ProductDetail | ProductDraft | null): string[] {
  if (!product) return []

  if (Array.isArray(product.images)) {
    return product.images
      .map((image) => normalizeImageUrl(image))
      .filter(Boolean) as string[]
  }

  const single = normalizeImageUrl(product.image)
  return single ? [single] : []
}

export function getVariantImages(variante?: VarianteAdvanced | null): string[] {
  if (!variante) return []

  const fromImages = Array.isArray(variante.images)
    ? variante.images
        .map((image) => normalizeImageUrl(image))
        .filter(Boolean)
    : []

  const fromSingle = normalizeImageUrl(variante.image)

  return uniqueStrings([
    ...(fromSingle ? [fromSingle] : []),
    ...fromImages,
  ])
}

export function getVariantGallery({
  product,
  selectedVariant,
  config,
}: {
  product?: ProductDetail | ProductDraft | null
  selectedVariant?: VarianteAdvanced | null
  config: VariantConfig
}): string[] {
  const generalImages = getProductGeneralImages(product)
  const variantImages = getVariantImages(selectedVariant)

  if (!selectedVariant) {
    return generalImages
  }

  const strategy = config.galleryStrategy

  if (strategy === 'variant_only') {
    return variantImages.length > 0 ? variantImages : generalImages
  }

  if (strategy === 'general_first') {
    return uniqueStrings([...generalImages, ...variantImages])
  }

  return variantImages.length > 0 ? variantImages : generalImages
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRICING LOGIC                                                  */
/* ═══════════════════════════════════════════════════════════════ */

export function getEffectivePricing({
  product,
  variante,
  rate,
}: {
  product?: ProductDetail | ProductDraft | null
  variante?: VarianteAdvanced | null
  rate: number | null
}) {
  const baseUsd =
    safePositiveNumber(product?.prix_usd) ??
    (safePositiveNumber(product?.prix) && rate
      ? Number((Number(product?.prix) / Number(rate)).toFixed(2))
      : 0)

  const baseCdf =
    safePositiveNumber(product?.prix ?? product?.prix_cdf) ??
    (baseUsd && rate ? Math.round(baseUsd * Number(rate)) : 0)

  const variantUsdRaw = safePositiveNumber(variante?.prix_specifique_usd)
  const variantCdfRaw = safePositiveNumber(variante?.prix_specifique_cdf)

  let variantUsd = variantUsdRaw ?? 0
  let variantCdf = variantCdfRaw ?? 0

  if (!variantUsd && variantCdf && rate) {
    variantUsd = Number((variantCdf / Number(rate)).toFixed(2))
  }

  if (!variantCdf && variantUsd && rate) {
    variantCdf = Math.round(variantUsd * Number(rate))
  }

  const finalUsd = variantUsd > 0 ? variantUsd : baseUsd
  const finalCdf = variantCdf > 0 ? variantCdf : baseCdf

  const baseOriginalUsd =
    safePositiveNumber(product?.prix_original_usd) ??
    (safePositiveNumber(product?.prix_original) && rate
      ? Number((Number(product?.prix_original) / Number(rate)).toFixed(2))
      : 0)

  const baseOriginalCdf =
    safePositiveNumber(product?.prix_original) ??
    (baseOriginalUsd && rate ? Math.round(baseOriginalUsd * Number(rate)) : 0)

  const variantOriginalUsdRaw = safePositiveNumber(variante?.prix_original_usd)
  const variantOriginalCdfRaw = safePositiveNumber(variante?.prix_original_cdf)

  let variantOriginalUsd = variantOriginalUsdRaw ?? 0
  let variantOriginalCdf = variantOriginalCdfRaw ?? 0

  if (!variantOriginalUsd && variantOriginalCdf && rate) {
    variantOriginalUsd = Number((variantOriginalCdf / Number(rate)).toFixed(2))
  }

  if (!variantOriginalCdf && variantOriginalUsd && rate) {
    variantOriginalCdf = Math.round(variantOriginalUsd * Number(rate))
  }

  const finalOriginalUsd = variantOriginalUsd > 0 ? variantOriginalUsd : baseOriginalUsd
  const finalOriginalCdf = variantOriginalCdf > 0 ? variantOriginalCdf : baseOriginalCdf

  const discountPercent =
    finalOriginalUsd > 0 && finalUsd > 0 && finalOriginalUsd > finalUsd
      ? Math.round((1 - finalUsd / finalOriginalUsd) * 100)
      : safeNonNegativeNumber(product?.remise_percent, 0)

  return {
    prixUsd: finalUsd,
    prixCdf: finalCdf,
    prixOriginalUsd: finalOriginalUsd,
    prixOriginalCdf: finalOriginalCdf,
    discountPercent,
    hasVariantPrice: variantUsd > 0 || variantCdf > 0,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STOCK LOGIC                                                    */
/* ═══════════════════════════════════════════════════════════════ */

export function getEffectiveStock({
  product,
  variante,
  variantes,
  config,
}: {
  product?: ProductDetail | ProductDraft | null
  variante?: VarianteAdvanced | null
  variantes: VarianteAdvanced[]
  config: VariantConfig
}): number {
  if (variante) {
    return safeNonNegativeNumber(variante.stock, 0)
  }

  if (variantes.length > 0) {
    return variantes
      .filter((item) => isVariantPurchasable(item, config))
      .reduce((sum, item) => sum + safeNonNegativeNumber(item.stock, 0), 0)
  }

  return safeNonNegativeNumber(product?.stock, 0)
}

export function isLowStock(stock: number, config: VariantConfig): boolean {
  return stock > 0 && stock <= config.lowStockThreshold
}

export function isOutOfStock(stock: number, config: VariantConfig): boolean {
  if (config.allowBackorder) return false
  return stock <= 0
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION                                                     */
/* ═══════════════════════════════════════════════════════════════ */

export function validateAdvancedVariants({
  attributes,
  variantes,
  config,
}: {
  attributes: VariantAttributeConfig[]
  variantes: VarianteAdvanced[]
  config: VariantConfig
}): string[] {
  const errors: string[] = []

  const keys = attributes.map((attribute) => attribute.key)
  const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index)

  if (duplicateKeys.length > 0) {
    errors.push(
      `Clés d’attributs en double : ${uniqueStrings(duplicateKeys).join(', ')}`
    )
  }

  for (const attribute of attributes) {
    const activeOptions = attribute.options.filter((option) => option.active !== false)

    if (activeOptions.length === 0) {
      errors.push(`L’attribut "${attribute.label}" doit avoir au moins une option active.`)
    }

    const optionValues = activeOptions.map((option) => option.value)
    const duplicateOptions = optionValues.filter(
      (value, index) => optionValues.indexOf(value) !== index
    )

    if (duplicateOptions.length > 0) {
      errors.push(
        `Options en double dans "${attribute.label}" : ${uniqueStrings(duplicateOptions).join(', ')}`
      )
    }
  }

  const attributeKeys = getVariantAttributeKeys(attributes)
  const variantKeys = variantes.map((variante) =>
    getVariantKey(variante.attributes || {}, attributeKeys)
  )

  const duplicateVariants = variantKeys.filter(
    (key, index) => variantKeys.indexOf(key) !== index
  )

  if (duplicateVariants.length > 0) {
    errors.push(
      `Variantes en double : ${uniqueStrings(duplicateVariants).join(', ')}`
    )
  }

  for (const variante of variantes) {
    if (variante.stock < 0) {
      errors.push('Le stock d’une variante ne peut pas être négatif.')
    }

    for (const attribute of attributes) {
      if (attribute.required === false) continue

      const value = safeString(variante.attributes?.[attribute.key]).trim()

      if (!value) {
        errors.push(
          `Une variante est incomplète : attribut "${attribute.label}" manquant.`
        )
      }
    }
  }

  const defaultVariants = variantes.filter((variante) => variante.is_default)

  if (defaultVariants.length > 1) {
    errors.push('Il ne peut y avoir qu’une seule variante par défaut.')
  }

  if (defaultVariants.length === 1) {
    const defaultVariant = defaultVariants[0]

    if (!isVariantPurchasable(defaultVariant, config)) {
      errors.push('La variante par défaut doit être active et en stock.')
    }
  }

  return errors
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUMMARY HELPERS                                                */
/* ═══════════════════════════════════════════════════════════════ */

export function buildVariantSummary({
  attributes,
  variantes,
  config,
}: {
  attributes: VariantAttributeConfig[]
  variantes: VarianteAdvanced[]
  config: VariantConfig
}) {
  const activeVariantes = variantes.filter((variante) => variante.is_active)
  const purchasableVariantes = activeVariantes.filter((variante) =>
    isVariantPurchasable(variante, config)
  )

  const totalStock = purchasableVariantes.reduce(
    (sum, variante) => sum + safeNonNegativeNumber(variante.stock, 0),
    0
  )

  return {
    attributesCount: attributes.length,
    variantesCount: variantes.length,
    activeVariantesCount: activeVariantes.length,
    purchasableVariantesCount: purchasableVariantes.length,
    totalStock,
    hasDefaultVariant: variantes.some((variante) => variante.is_default),
  }
}