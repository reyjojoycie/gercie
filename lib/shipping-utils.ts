// lib/shipping-utils.ts

/* ═══════════════════════════════════════════════════════════════ */
/*  SHIPPING / LIVRAISON INTELLIGENTE                              */
/*  Vendeur unique : Gercie                                        */
/*  USD = devise principale, CDF = conversion calculée             */
/*                                                                 */
/*  Règle :                                                        */
/*  - Les frais de livraison sont configurés en USD.               */
/*  - Le CDF est dérivé : CDF = USD × taux USD/CDF.                */
/*  - Les commandes déjà créées doivent garder leur snapshot.      */
/* ═══════════════════════════════════════════════════════════════ */

export type Currency = 'USD' | 'CDF'

export const DELIVERY_MODE_IDS = ['domicile', 'point_retrait', 'express'] as const

export type DeliveryModeId = (typeof DELIVERY_MODE_IDS)[number]

export type DeliveryCalculationMode =
  | 'free'
  | 'per_unit'
  | 'shared'
  | 'mandatory_per_unit'
  | 'weight_based'

export type LogisticsGroup =
  | 'small'
  | 'standard'
  | 'bulky'
  | 'heavy'
  | 'liquid'
  | 'fragile'
  | 'hazardous'
  | 'installation'
  | 'mandatory'
  | 'other'

export interface DeliveryModeConfig {
  enabled: boolean

  /**
   * USD = source de vérité.
   */
  fee_usd: number

  /**
   * CDF = conversion dérivée.
   * Peut être conservé pour compatibilité legacy / affichage.
   */
  fee_cdf?: number | null

  delay_min_hours?: number | null
  delay_max_hours?: number | null
  delay_label?: string | null

  calculation_mode: DeliveryCalculationMode

  base_fee_usd?: number | null
  additional_unit_fee_usd?: number | null

  max_line_fee_usd?: number | null
  min_line_fee_usd?: number | null

  mandatory_per_unit?: boolean
  non_consolidable?: boolean
  protect_margin?: boolean

  handling_fee_usd?: number | null
  installation_fee_usd?: number | null
  labor_fee_usd?: number | null

  free_weight_kg?: number | null
  per_extra_kg_usd?: number | null
  max_weight_kg?: number | null

  free_shipping_threshold_usd?: number | null

  notes?: string | null
}

export interface LogisticsConfig {
  group: LogisticsGroup

  weight_kg?: number | null
  length_cm?: number | null
  width_cm?: number | null
  height_cm?: number | null

  fragile?: boolean
  liquid?: boolean
  hazardous?: boolean
  bulky?: boolean

  installation_required?: boolean
  requires_signature?: boolean
}

export interface DeliveryConsolidationConfig {
  enabled: boolean

  discount_percent?: number
  cross_group_discount_percent?: number

  max_order_shipping_usd?: number | null
  min_order_shipping_usd?: number | null

  free_shipping_threshold_usd?: number | null

  free_shipping_applies_to?: 'all' | 'consolidable_only'
}

export interface ProductDeliveryConfig {
  enabled: boolean

  modes: Record<DeliveryModeId, DeliveryModeConfig>

  logistics?: LogisticsConfig | null

  consolidation?: DeliveryConsolidationConfig | null

  global_delay_label?: string | null
}

export interface ShippingCartItem {
  id?: string
  product_id?: string
  nom?: string
  name?: string

  quantity?: number | null
  quantite?: number | null

  unit_price_usd?: number | null
  prix_usd?: number | null
  price_usd?: number | null

  prix?: number | null
  price?: number | null
  prix_cdf?: number | null
  price_cdf?: number | null

  delivery_config?: ProductDeliveryConfig | null

  product?: any
  variante?: any

  poids_kg?: number | null
  weight_kg?: number | null

  longueur_cm?: number | null
  largeur_cm?: number | null
  hauteur_cm?: number | null

  delay_livraison?: string | null

  livraison_domicile?: number | null
  livraison_point_retrait?: number | null
  livraison_express?: number | null

  express_gratuit?: boolean | null

  livraison_domicile_active?: boolean | null
  livraison_point_retrait_active?: boolean | null
  livraison_express_active?: boolean | null

  [key: string]: any
}

export interface ShippingBreakdownItem {
  id: string
  label: string
  type:
    | 'mandatory'
    | 'consolidable'
    | 'line'
    | 'discount'
    | 'free_shipping'
    | 'cap'
    | 'floor'
    | 'group'

  amount_usd: number
  amount_cdf?: number | null

  quantity?: number
  product_id?: string
  group?: LogisticsGroup
  mode?: DeliveryModeId
  note?: string | null
}

export interface ShippingGroupBreakdown {
  group: LogisticsGroup
  label: string
  amount_usd: number
  amount_cdf?: number | null
  items: ShippingBreakdownItem[]
}

export interface ShippingQuote {
  mode: DeliveryModeId
  available: boolean
  unavailable_reason?: string | null

  subtotal_usd: number

  total_usd: number
  total_cdf: number

  rate_used: number | null

  mandatory_usd: number
  consolidable_before_discount_usd: number
  consolidable_after_discount_usd: number
  consolidable_final_usd: number

  free_shipping_applied: boolean
  free_shipping_threshold_usd?: number | null

  delay_min_hours?: number | null
  delay_max_hours?: number | null
  delay_label: string

  breakdown: ShippingBreakdownItem[]
  groups: ShippingGroupBreakdown[]

  warnings: string[]

  requires_signature: boolean
  fragile: boolean
  bulky: boolean
  hazardous: boolean
  installation_required: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DEFAULTS                                                       */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_DELAYS: Record<
  DeliveryModeId,
  { min: number; max: number; label: string }
> = {
  domicile: { min: 24, max: 72, label: '24h - 72h' },
  point_retrait: { min: 24, max: 48, label: '24h - 48h' },
  express: { min: 4, max: 24, label: 'Aujourd’hui / demain' },
}

const MODE_LABELS: Record<DeliveryModeId, string> = {
  domicile: 'Livraison à domicile',
  point_retrait: 'Point de retrait',
  express: 'Livraison express',
}

const GROUP_LABELS: Record<LogisticsGroup, string> = {
  small: 'Petits articles',
  standard: 'Articles standards',
  bulky: 'Articles volumineux',
  heavy: 'Articles lourds',
  liquid: 'Liquides / cosmétiques',
  fragile: 'Articles fragiles',
  hazardous: 'Articles sensibles / dangereux',
  installation: 'Installation / manutention',
  mandatory: 'Frais obligatoires',
  other: 'Autres articles',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER HELPERS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function toNumber(value: any, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function positiveNum(value: any): number {
  const n = toNumber(value, 0)
  return n > 0 ? n : 0
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundCdf(value: number): number {
  return Math.round(value + Number.EPSILON)
}

/**
 * Autorise 0.
 * Utile pour les frais explicitement gratuits.
 */
function nullableNonNegative(value: any): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return roundUsd(n)
}

/**
 * Ignore 0.
 * Utile pour les prix unitaires : si un prix est 0,
 * on peut tenter un fallback depuis l'autre devise.
 */
function nullablePositive(value: any): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return roundUsd(n)
}

/**
 * Taux USD/CDF.
 * On garde plus de précision que pour un montant USD.
 */
function nullablePositiveRate(value: any): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Number(n.toFixed(4))
}

function clampPercent(value: any): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, n))
}

function formatUsdPreview(value: number): string {
  return `$${roundUsd(value).toFixed(2)}`
}

function hoursToLabel(hours: number): string {
  const h = Math.max(0, Math.round(hours))

  if (h <= 0) return '—'
  if (h < 24) return `${h}h`
  if (h < 48) return '1 jour'

  return `${Math.ceil(h / 24)} jours`
}

function formatHoursRange(minHours: number, maxHours: number): string {
  const min = Math.max(0, Math.round(minHours))
  const max = Math.max(0, Math.round(maxHours))

  if (max <= 0) return '—'
  if (min === max) return hoursToLabel(min)

  return `${hoursToLabel(min)} - ${hoursToLabel(max)}`
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const clean = String(value || '').trim()
    if (!clean) continue

    if (!seen.has(clean)) {
      seen.add(clean)
      result.push(clean)
    }
  }

  return result
}

function stableVariantKey(variante: any): string {
  if (!variante) return ''

  if (typeof variante === 'string') {
    const trimmed = variante.trim()
    if (!trimmed) return ''

    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') {
        return stableVariantKey({ attributes: parsed })
      }
    } catch {
      return trimmed
    }

    return trimmed
  }

  const attrs = variante?.attributes

  if (!attrs || typeof attrs !== 'object') return ''

  const entries = Object.entries(attrs).filter(([key, value]) => {
    if (!key) return false
    if (value === null || value === undefined) return false
    return String(value).trim() !== ''
  })

  if (entries.length === 0) return ''

  entries.sort(([a], [b]) => String(a).localeCompare(String(b)))

  try {
    return JSON.stringify(Object.fromEntries(entries))
  } catch {
    return ''
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPE GUARDS                                                    */
/* ═══════════════════════════════════════════════════════════════ */

function isDeliveryModeId(value: any): value is DeliveryModeId {
  return DELIVERY_MODE_IDS.includes(value)
}

function isValidCalculationMode(value: any): value is DeliveryCalculationMode {
  return (
    value === 'free' ||
    value === 'per_unit' ||
    value === 'shared' ||
    value === 'mandatory_per_unit' ||
    value === 'weight_based'
  )
}

function isValidLogisticsGroup(value: any): value is LogisticsGroup {
  return (
    value === 'small' ||
    value === 'standard' ||
    value === 'bulky' ||
    value === 'heavy' ||
    value === 'liquid' ||
    value === 'fragile' ||
    value === 'hazardous' ||
    value === 'installation' ||
    value === 'mandatory' ||
    value === 'other'
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUBLIC LABEL HELPERS                                           */
/* ═══════════════════════════════════════════════════════════════ */

export function getDeliveryModeLabel(modeId: DeliveryModeId): string {
  return MODE_LABELS[modeId] || modeId
}

export function getLogisticsGroupLabel(group: LogisticsGroup): string {
  return GROUP_LABELS[group] || GROUP_LABELS.other
}

export function getDefaultDelayLabel(modeId: DeliveryModeId): string {
  return DEFAULT_DELAYS[modeId]?.label || '24h - 72h'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FACTORIES                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function createDefaultDeliveryModeConfig(
  modeId: DeliveryModeId
): DeliveryModeConfig {
  const defaults = DEFAULT_DELAYS[modeId]

  return {
    enabled: modeId !== 'express',

    fee_usd: 0,
    fee_cdf: 0,

    delay_min_hours: defaults.min,
    delay_max_hours: defaults.max,
    delay_label: defaults.label,

    calculation_mode: 'shared',

    base_fee_usd: 0,
    additional_unit_fee_usd: 0,

    max_line_fee_usd: null,
    min_line_fee_usd: null,

    mandatory_per_unit: false,
    non_consolidable: false,
    protect_margin: false,

    handling_fee_usd: 0,
    installation_fee_usd: 0,
    labor_fee_usd: 0,

    free_weight_kg: 0,
    per_extra_kg_usd: 0,
    max_weight_kg: null,

    free_shipping_threshold_usd: null,

    notes: null,
  }
}

export function createDefaultLogisticsConfig(): LogisticsConfig {
  return {
    group: 'standard',

    weight_kg: null,
    length_cm: null,
    width_cm: null,
    height_cm: null,

    fragile: false,
    liquid: false,
    hazardous: false,
    bulky: false,

    installation_required: false,
    requires_signature: false,
  }
}

export function createDefaultDeliveryConsolidationConfig(): DeliveryConsolidationConfig {
  return {
    enabled: true,

    discount_percent: 0,
    cross_group_discount_percent: 50,

    max_order_shipping_usd: null,
    min_order_shipping_usd: 1,

    free_shipping_threshold_usd: null,

    free_shipping_applies_to: 'consolidable_only',
  }
}

export function createDefaultProductDeliveryConfig(): ProductDeliveryConfig {
  const modes = {} as Record<DeliveryModeId, DeliveryModeConfig>

  for (const modeId of DELIVERY_MODE_IDS) {
    modes[modeId] = createDefaultDeliveryModeConfig(modeId)
  }

  return {
    enabled: true,
    modes,
    logistics: createDefaultLogisticsConfig(),
    consolidation: createDefaultDeliveryConsolidationConfig(),
    global_delay_label: null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LEGACY HELPERS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function getLegacyFeeCdf(legacy: any, modeId: DeliveryModeId): number {
  if (modeId === 'domicile') return positiveNum(legacy?.livraison_domicile)
  if (modeId === 'point_retrait')
    return positiveNum(legacy?.livraison_point_retrait)
  return positiveNum(legacy?.livraison_express)
}

function getLegacyActive(
  legacy: any,
  modeId: DeliveryModeId
): boolean | null {
  if (modeId === 'domicile') {
    return typeof legacy?.livraison_domicile_active === 'boolean'
      ? legacy.livraison_domicile_active
      : null
  }

  if (modeId === 'point_retrait') {
    return typeof legacy?.livraison_point_retrait_active === 'boolean'
      ? legacy.livraison_point_retrait_active
      : null
  }

  return typeof legacy?.livraison_express_active === 'boolean'
    ? legacy.livraison_express_active
    : null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

export function normalizeDeliveryModeConfig(
  input: any,
  modeId: DeliveryModeId,
  legacy: any = {},
  rate: number | null = null
): DeliveryModeConfig {
  const def = createDefaultDeliveryModeConfig(modeId)

  const legacyFeeCdf = getLegacyFeeCdf(legacy, modeId)
  const legacyActive = getLegacyActive(legacy, modeId)
  const expressGratuit = modeId === 'express' && Boolean(legacy?.express_gratuit)
  const legacyWeight = positiveNum(legacy?.poids_kg ?? legacy?.weight_kg)

  const enabled =
    typeof input?.enabled === 'boolean'
      ? input.enabled
      : expressGratuit
      ? true
      : legacyActive ?? (legacyFeeCdf > 0 || def.enabled)

  const feeCdfInput =
    nullableNonNegative(input?.fee_cdf) ??
    (legacyFeeCdf > 0 ? legacyFeeCdf : null)

  const feeUsdInput = nullableNonNegative(input?.fee_usd)

  let feeUsd: number

  if (feeUsdInput != null) {
    feeUsd = feeUsdInput
  } else if (feeCdfInput != null && rate && rate > 0) {
    feeUsd = roundUsd(feeCdfInput / rate)
  } else {
    feeUsd = 0
  }

  if (expressGratuit) {
    feeUsd = 0
  }

  /*
   * USD principal :
   * si le taux est disponible, le CDF est toujours dérivé du USD.
   * Sinon, on garde une valeur legacy pour compatibilité d'affichage.
   */
  const derivedFeeCdf =
    rate && rate > 0 ? roundCdf(feeUsd * rate) : null

  const feeCdf =
    derivedFeeCdf ??
    (feeCdfInput != null ? roundCdf(feeCdfInput) : null)

  const defaultCalculationMode: DeliveryCalculationMode = expressGratuit
    ? 'free'
    : legacyWeight > 20
    ? 'mandatory_per_unit'
    : 'shared'

  const inputCalculationMode = isValidCalculationMode(input?.calculation_mode)
    ? input.calculation_mode
    : defaultCalculationMode

  const handling = positiveNum(input?.handling_fee_usd)
  const installation = positiveNum(input?.installation_fee_usd)
  const labor = positiveNum(input?.labor_fee_usd)
  const extraPerUnit = roundUsd(handling + installation + labor)

  const mandatoryByFlags =
    Boolean(input?.mandatory_per_unit) ||
    Boolean(input?.non_consolidable) ||
    Boolean(input?.protect_margin) ||
    extraPerUnit > 0

  const calculationMode: DeliveryCalculationMode = mandatoryByFlags
    ? 'mandatory_per_unit'
    : inputCalculationMode

  const baseFeeUsd =
    nullableNonNegative(input?.base_fee_usd) ?? feeUsd

  const additionalUnitFeeUsd =
    input?.additional_unit_fee_usd === null
      ? null
      : nullableNonNegative(input?.additional_unit_fee_usd) ??
        (calculationMode === 'shared' ? 0 : null)

  const maxLineFeeUsd =
    input?.max_line_fee_usd === null
      ? null
      : nullableNonNegative(input?.max_line_fee_usd) ??
        (calculationMode === 'shared' && legacyFeeCdf > 0 ? feeUsd : null)

  const minLineFeeUsd =
    input?.min_line_fee_usd === null
      ? null
      : nullableNonNegative(input?.min_line_fee_usd) ?? null

  const delayMinHours =
    nullableNonNegative(input?.delay_min_hours) ?? def.delay_min_hours ?? null

  const delayMaxHours =
    nullableNonNegative(input?.delay_max_hours) ?? def.delay_max_hours ?? null

  const delayLabel =
    typeof input?.delay_label === 'string' && input.delay_label.trim()
      ? input.delay_label.trim()
      : typeof legacy?.delay_livraison === 'string' &&
        legacy.delay_livraison.trim() &&
        modeId === 'domicile'
      ? legacy.delay_livraison.trim()
      : def.delay_label

  return {
    enabled,

    fee_usd: roundUsd(feeUsd),
    fee_cdf: feeCdf,

    delay_min_hours: delayMinHours,
    delay_max_hours: delayMaxHours,
    delay_label: delayLabel,

    calculation_mode: calculationMode,

    base_fee_usd: baseFeeUsd != null ? roundUsd(baseFeeUsd) : null,
    additional_unit_fee_usd:
      additionalUnitFeeUsd != null ? roundUsd(additionalUnitFeeUsd) : null,

    max_line_fee_usd:
      maxLineFeeUsd != null ? roundUsd(maxLineFeeUsd) : null,
    min_line_fee_usd:
      minLineFeeUsd != null ? roundUsd(minLineFeeUsd) : null,

    mandatory_per_unit: calculationMode === 'mandatory_per_unit',
    non_consolidable:
      Boolean(input?.non_consolidable) ||
      extraPerUnit > 0 ||
      calculationMode === 'mandatory_per_unit',
    protect_margin: Boolean(input?.protect_margin),

    handling_fee_usd: roundUsd(handling),
    installation_fee_usd: roundUsd(installation),
    labor_fee_usd: roundUsd(labor),

    free_weight_kg:
      nullableNonNegative(input?.free_weight_kg) ?? def.free_weight_kg ?? 0,
    per_extra_kg_usd:
      nullableNonNegative(input?.per_extra_kg_usd) ??
      def.per_extra_kg_usd ??
      0,
    max_weight_kg:
      input?.max_weight_kg === null
        ? null
        : nullableNonNegative(input?.max_weight_kg),

    free_shipping_threshold_usd:
      input?.free_shipping_threshold_usd === null
        ? null
        : nullableNonNegative(input?.free_shipping_threshold_usd),

    notes:
      typeof input?.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null,
  }
}

export function normalizeLogisticsConfig(
  input: any,
  legacy: any = {},
  modeConfig?: DeliveryModeConfig
): LogisticsConfig {
  const def = createDefaultLogisticsConfig()

  const weightKg =
    nullableNonNegative(input?.weight_kg) ??
    nullableNonNegative(legacy?.poids_kg) ??
    nullableNonNegative(legacy?.weight_kg) ??
    nullableNonNegative(legacy?.variante?.poids_kg) ??
    null

  const lengthCm =
    nullableNonNegative(input?.length_cm) ??
    nullableNonNegative(legacy?.longueur_cm) ??
    null

  const widthCm =
    nullableNonNegative(input?.width_cm) ??
    nullableNonNegative(legacy?.largeur_cm) ??
    null

  const heightCm =
    nullableNonNegative(input?.height_cm) ??
    nullableNonNegative(legacy?.hauteur_cm) ??
    null

  const fragile =
    typeof input?.fragile === 'boolean'
      ? input.fragile
      : Boolean(legacy?.fragile)

  const liquid =
    typeof input?.liquid === 'boolean'
      ? input.liquid
      : Boolean(legacy?.liquid)

  const hazardous =
    typeof input?.hazardous === 'boolean'
      ? input.hazardous
      : Boolean(legacy?.hazardous)

  const bulky =
    typeof input?.bulky === 'boolean'
      ? input.bulky
      : Boolean(legacy?.bulky)

  const installationRequired =
    typeof input?.installation_required === 'boolean'
      ? input.installation_required
      : Boolean(legacy?.installation_required) ||
        positiveNum(modeConfig?.installation_fee_usd) > 0

  const requiresSignature =
    typeof input?.requires_signature === 'boolean'
      ? input.requires_signature
      : Boolean(legacy?.requires_signature)

  let group: LogisticsGroup = isValidLogisticsGroup(input?.group)
    ? input.group
    : 'standard'

  if (!isValidLogisticsGroup(input?.group)) {
    if (hazardous) group = 'hazardous'
    else if (installationRequired) group = 'installation'
    else if (weightKg != null && weightKg > 20) group = 'heavy'
    else if (bulky || (weightKg != null && weightKg > 5)) group = 'bulky'
    else if (liquid) group = 'liquid'
    else if (fragile) group = 'fragile'
    else if (weightKg != null && weightKg > 0 && weightKg <= 0.5)
      group = 'small'
    else group = 'standard'
  }

  if (
    modeConfig?.mandatory_per_unit ||
    modeConfig?.non_consolidable ||
    modeConfig?.protect_margin
  ) {
    if (group === 'standard' || group === 'small') {
      group = 'mandatory'
    }
  }

  return {
    group,

    weight_kg: weightKg,
    length_cm: lengthCm,
    width_cm: widthCm,
    height_cm: heightCm,

    fragile,
    liquid,
    hazardous,
    bulky,

    installation_required: installationRequired,
    requires_signature: requiresSignature,
  }
}

export function normalizeDeliveryConsolidationConfig(
  input: any
): DeliveryConsolidationConfig {
  const def = createDefaultDeliveryConsolidationConfig()

  return {
    enabled:
      typeof input?.enabled === 'boolean' ? input.enabled : def.enabled,

    discount_percent:
      clampPercent(input?.discount_percent) ?? def.discount_percent ?? 0,

    cross_group_discount_percent:
      clampPercent(input?.cross_group_discount_percent) ??
      def.cross_group_discount_percent ??
      50,

    max_order_shipping_usd:
      input?.max_order_shipping_usd === null
        ? null
        : nullableNonNegative(input?.max_order_shipping_usd),

    min_order_shipping_usd:
      input?.min_order_shipping_usd === null
        ? null
        : nullableNonNegative(input?.min_order_shipping_usd) ??
          def.min_order_shipping_usd ??
          1,

    free_shipping_threshold_usd:
      input?.free_shipping_threshold_usd === null
        ? null
        : nullableNonNegative(input?.free_shipping_threshold_usd),

    free_shipping_applies_to:
      input?.free_shipping_applies_to === 'all'
        ? 'all'
        : 'consolidable_only',
  }
}

export function normalizeProductDeliveryConfig(
  input: any,
  legacy: any = {},
  rate: number | null = null
): ProductDeliveryConfig {
  const hasAdvanced = Boolean(
    input &&
      typeof input === 'object' &&
      (input.enabled === true ||
        input.modes ||
        input.logistics ||
        input.consolidation)
  )

  const modes = {} as Record<DeliveryModeId, DeliveryModeConfig>

  for (const modeId of DELIVERY_MODE_IDS) {
    modes[modeId] = normalizeDeliveryModeConfig(
      hasAdvanced ? input?.modes?.[modeId] : undefined,
      modeId,
      legacy,
      rate
    )
  }

  const logistics = normalizeLogisticsConfig(
    hasAdvanced ? input?.logistics : undefined,
    legacy,
    modes.domicile
  )

  const consolidation = normalizeDeliveryConsolidationConfig(
    hasAdvanced ? input?.consolidation : undefined
  )

  const globalDelayLabel =
    typeof input?.global_delay_label === 'string' &&
    input.global_delay_label.trim()
      ? input.global_delay_label.trim()
      : typeof legacy?.delay_livraison === 'string' &&
        legacy.delay_livraison.trim()
      ? legacy.delay_livraison.trim()
      : null

  return {
    enabled: hasAdvanced ? Boolean(input?.enabled ?? true) : false,
    modes,
    logistics,
    consolidation,
    global_delay_label: globalDelayLabel,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NON CONSOLIDABLE HELPER                                        */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Utilisable dans :
 * - CartContext
 * - panier
 * - commande
 * - admin produit
 *
 * Retourne true si la configuration contient des frais
 * obligatoires / non consolidables.
 */
export function isNonConsolidableDeliveryConfig(
  config?: ProductDeliveryConfig | null
): boolean {
  if (!config?.modes) return false

  return Object.values(config.modes).some((mode) =>
    Boolean(
      mode?.mandatory_per_unit ||
        mode?.non_consolidable ||
        mode?.protect_margin ||
        mode?.calculation_mode === 'mandatory_per_unit'
    )
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CART ITEM NORMALIZATION                                        */
/* ═══════════════════════════════════════════════════════════════ */

interface NormalizedShippingItem {
  key: string
  product_id?: string
  nom: string
  quantity: number
  unit_price_usd: number
  deliveryConfig: ProductDeliveryConfig
  modeConfig: DeliveryModeConfig
  logistics: LogisticsConfig
  warnings: string[]
}

function mergeLegacySource(item: ShippingCartItem): any {
  const product = item?.product || {}
  const variante = item?.variante || {}

  return {
    ...product,
    ...variante,
    ...item,
  }
}

export function normalizeShippingCartItem(
  item: ShippingCartItem,
  modeId: DeliveryModeId,
  rate: number | null = null
): NormalizedShippingItem {
  const legacy = mergeLegacySource(item)

  const deliveryInput =
    item?.delivery_config ??
    item?.product?.delivery_config ??
    legacy?.delivery_config ??
    null

  const deliveryConfig = normalizeProductDeliveryConfig(
    deliveryInput,
    legacy,
    rate
  )

  const modeConfig = deliveryConfig.modes[modeId]

  const logistics = normalizeLogisticsConfig(
    deliveryConfig.logistics,
    legacy,
    modeConfig
  )

  const quantity = Math.max(
    1,
    Math.floor(positiveNum(item.quantity ?? item.quantite ?? 1))
  )

  const directUsd =
    nullablePositive(item.unit_price_usd) ??
    nullablePositive(item.prix_usd) ??
    nullablePositive(item.price_usd)

  const directCdf =
    nullablePositive(item.prix) ??
    nullablePositive(item.price) ??
    nullablePositive(item.prix_cdf) ??
    nullablePositive(item.price_cdf)

  const unitPriceUsd =
    directUsd ??
    (directCdf != null && rate && rate > 0
      ? roundUsd(directCdf / rate)
      : 0)

  const warnings: string[] = []

  if (
    !deliveryConfig.enabled &&
    logistics.weight_kg != null &&
    logistics.weight_kg > 20
  ) {
    warnings.push(
      `${item.nom || legacy.nom || 'Article'} : poids élevé sans configuration livraison avancée.`
    )
  }

  const nom = String(item.nom ?? item.name ?? legacy.nom ?? 'Article')
  const variantKey = stableVariantKey(
    item.variante ?? item.product?.variante ?? legacy.variante
  )

  const baseKey =
    item.id ??
    item.product_id ??
    item.product?.id ??
    legacy.id ??
    null

  const key = String(
    baseKey
      ? `${baseKey}${variantKey ? `::${variantKey}` : ''}`
      : `${nom}${variantKey ? `::${variantKey}` : ''}`
  )

  return {
    key,
    product_id: item.product_id ?? item.product?.id ?? legacy.id,
    nom,
    quantity,
    unit_price_usd: roundUsd(unitPriceUsd),
    deliveryConfig,
    modeConfig,
    logistics,
    warnings,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LINE CALCULATION                                               */
/* ═══════════════════════════════════════════════════════════════ */

interface LineResult {
  key: string
  label: string
  product_id?: string
  group: LogisticsGroup
  quantity: number
  amount_usd: number
  consolidable: boolean
  type: 'mandatory' | 'consolidable'
  note?: string | null
  warnings: string[]
}

function computeLine(item: NormalizedShippingItem): LineResult {
  const mode = item.modeConfig
  const qty = item.quantity
  const warnings: string[] = []

  const base = positiveNum(mode.base_fee_usd ?? mode.fee_usd)

  const extraPerUnit = roundUsd(
    positiveNum(mode.handling_fee_usd) +
      positiveNum(mode.installation_fee_usd) +
      positiveNum(mode.labor_fee_usd)
  )

  let calculationMode = mode.calculation_mode

  if (extraPerUnit > 0) {
    calculationMode = 'mandatory_per_unit'
  }

  if (
    mode.mandatory_per_unit ||
    mode.non_consolidable ||
    mode.protect_margin
  ) {
    calculationMode = 'mandatory_per_unit'
  }

  const weightTotal = roundUsd(qty * positiveNum(item.logistics.weight_kg))

  let raw = 0
  let consolidable = true

  switch (calculationMode) {
    case 'free':
      raw = 0
      consolidable = true
      break

    case 'mandatory_per_unit':
      raw = roundUsd((base + extraPerUnit) * qty)
      consolidable = false
      break

    case 'per_unit':
      raw = roundUsd((base + extraPerUnit) * qty)
      consolidable = !(mode.non_consolidable || mode.protect_margin)
      break

    case 'shared': {
      const additional = positiveNum(mode.additional_unit_fee_usd)
      raw = roundUsd(base + Math.max(0, qty - 1) * additional + extraPerUnit)
      consolidable = !(mode.non_consolidable || mode.protect_margin)
      break
    }

    case 'weight_based': {
      const freeWeight = positiveNum(mode.free_weight_kg)
      const perExtra = positiveNum(mode.per_extra_kg_usd)
      const excess = Math.max(0, weightTotal - freeWeight)

      raw = roundUsd(base + excess * perExtra + extraPerUnit)

      if (
        mode.max_weight_kg != null &&
        weightTotal > positiveNum(mode.max_weight_kg)
      ) {
        const over = weightTotal - positiveNum(mode.max_weight_kg)

        if (perExtra > 0) {
          raw = roundUsd(raw + over * perExtra)
        }

        warnings.push(
          `${item.nom} : poids supérieur au maximum colis (${mode.max_weight_kg} kg).`
        )
      }

      consolidable = !(mode.non_consolidable || mode.protect_margin)
      break
    }

    default:
      raw = base
      consolidable = true
  }

  let amount = roundUsd(raw)
  let note: string | null = null

  if (consolidable) {
    const min =
      mode.min_line_fee_usd != null ? positiveNum(mode.min_line_fee_usd) : 0

    const max =
      mode.max_line_fee_usd != null
        ? positiveNum(mode.max_line_fee_usd)
        : null

    if (max != null && amount > max) {
      amount = max
      note = `Plafonné à ${formatUsdPreview(max)}`
    }

    if (amount < min) {
      amount = min
      note = `Porté au minimum ${formatUsdPreview(min)}`
    }
  }

  return {
    key: item.key,
    label: item.nom,
    product_id: item.product_id,
    group: item.logistics.group,
    quantity: qty,
    amount_usd: amount,
    consolidable,
    type: consolidable ? 'consolidable' : 'mandatory',
    note,
    warnings,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSOLIDATION MERGE                                            */
/* ═══════════════════════════════════════════════════════════════ */

function mergeConsolidationConfigs(
  configs: DeliveryConsolidationConfig[]
): DeliveryConsolidationConfig {
  if (!configs.length) {
    return createDefaultDeliveryConsolidationConfig()
  }

  const enabled = configs.every((config) => config.enabled)

  const discountPercent = Math.min(
    ...configs.map((config) => clampPercent(config.discount_percent) ?? 0)
  )

  const crossGroupDiscountPercent = Math.min(
    ...configs.map(
      (config) =>
        clampPercent(config.cross_group_discount_percent) ?? 50
    )
  )

  const maxValues = configs
    .map((config) => config.max_order_shipping_usd)
    .filter((value): value is number => value != null)

  const minValues = configs
    .map((config) => config.min_order_shipping_usd)
    .filter((value): value is number => value != null)

  const freeValues = configs
    .map((config) => config.free_shipping_threshold_usd)
    .filter((value): value is number => value != null)

  return {
    enabled,

    discount_percent: discountPercent,
    cross_group_discount_percent: crossGroupDiscountPercent,

    max_order_shipping_usd: maxValues.length
      ? Math.max(...maxValues)
      : null,

    min_order_shipping_usd: minValues.length
      ? Math.max(...minValues)
      : 1,

    free_shipping_threshold_usd: freeValues.length
      ? Math.max(...freeValues)
      : null,

    free_shipping_applies_to: 'consolidable_only',
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELAY                                                          */
/* ═══════════════════════════════════════════════════════════════ */

function computeDelay(
  items: NormalizedShippingItem[],
  modeId: DeliveryModeId,
  globalDelayLabel?: string | null
): {
  delay_min_hours: number | null
  delay_max_hours: number | null
  delay_label: string
} {
  const defaults = DEFAULT_DELAYS[modeId]

  let minHours = 0
  let maxHours = 0

  for (const item of items) {
    const mode = item.modeConfig

    if (mode.delay_min_hours != null) {
      minHours = Math.max(minHours, positiveNum(mode.delay_min_hours))
    }

    if (mode.delay_max_hours != null) {
      maxHours = Math.max(maxHours, positiveNum(mode.delay_max_hours))
    }
  }

  if (maxHours <= 0) {
    return {
      delay_min_hours: defaults.min,
      delay_max_hours: defaults.max,
      delay_label: globalDelayLabel || defaults.label,
    }
  }

  const finalMin = minHours > 0 ? minHours : defaults.min

  return {
    delay_min_hours: finalMin,
    delay_max_hours: maxHours,
    delay_label: formatHoursRange(finalMin, maxHours),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  QUOTE HELPERS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function lineToBreakdownItem(
  line: LineResult,
  type: ShippingBreakdownItem['type'],
  modeId: DeliveryModeId
): ShippingBreakdownItem {
  return {
    id: `${line.key}-${type}`,
    label: line.label,
    type,
    amount_usd: line.amount_usd,
    quantity: line.quantity,
    product_id: line.product_id,
    group: line.group,
    mode: modeId,
    note: line.note || null,
  }
}

function createEmptyQuote(
  modeId: DeliveryModeId,
  rate: number | null
): ShippingQuote {
  const delay = computeDelay([], modeId, null)

  return {
    mode: modeId,
    available: true,
    unavailable_reason: null,

    subtotal_usd: 0,

    total_usd: 0,
    total_cdf: 0,

    rate_used: rate,

    mandatory_usd: 0,
    consolidable_before_discount_usd: 0,
    consolidable_after_discount_usd: 0,
    consolidable_final_usd: 0,

    free_shipping_applied: false,
    free_shipping_threshold_usd: null,

    delay_min_hours: delay.delay_min_hours,
    delay_max_hours: delay.delay_max_hours,
    delay_label: delay.delay_label,

    breakdown: [],
    groups: [],

    warnings: [],

    requires_signature: false,
    fragile: false,
    bulky: false,
    hazardous: false,
    installation_required: false,
  }
}

function createUnavailableQuote(
  modeId: DeliveryModeId,
  blockedProductName: string,
  rate: number | null
): ShippingQuote {
  const base = createEmptyQuote(modeId, rate)

  const reason = `Certains articles ne peuvent pas être livrés en ${getDeliveryModeLabel(
    modeId
  )} : ${blockedProductName}.`

  return {
    ...base,
    available: false,
    unavailable_reason: reason,
    warnings: [reason],
  }
}

function enrichBreakdown(
  items: ShippingBreakdownItem[],
  rate: number | null
): ShippingBreakdownItem[] {
  return items.map((item) => ({
    ...item,
    amount_usd: roundUsd(item.amount_usd),
    amount_cdf:
      rate && rate > 0 ? roundCdf(item.amount_usd * rate) : item.amount_cdf ?? 0,
  }))
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN QUOTE CALCULATION                                         */
/* ═══════════════════════════════════════════════════════════════ */

export function calculateShippingQuote(params: {
  items: ShippingCartItem[]
  modeId: DeliveryModeId
  rate?: number | null
  subtotalUsd?: number | null
}): ShippingQuote {
  const rateUsed = nullablePositiveRate(params.rate)
  const modeId = isDeliveryModeId(params.modeId)
    ? params.modeId
    : 'domicile'

  if (!params.items || params.items.length === 0) {
    return createEmptyQuote(modeId, rateUsed)
  }

  const normalizedItems = params.items.map((item) =>
    normalizeShippingCartItem(item, modeId, rateUsed)
  )

  const blockedItem = normalizedItems.find((item) => !item.modeConfig.enabled)

  if (blockedItem) {
    return createUnavailableQuote(modeId, blockedItem.nom, rateUsed)
  }

  const lines = normalizedItems.map(computeLine)

  const mandatoryLines = lines.filter((line) => !line.consolidable)
  const consolidableLines = lines.filter((line) => line.consolidable)

  const mandatoryTotal = roundUsd(
    mandatoryLines.reduce((sum, line) => sum + line.amount_usd, 0)
  )

  const consolidableBeforeDiscount = roundUsd(
    consolidableLines.reduce((sum, line) => sum + line.amount_usd, 0)
  )

  const consolidation = mergeConsolidationConfigs(
    normalizedItems.map(
      (item) =>
        item.deliveryConfig.consolidation ??
        createDefaultDeliveryConsolidationConfig()
    )
  )

  const breakdown: ShippingBreakdownItem[] = []

  for (const line of mandatoryLines) {
    breakdown.push(lineToBreakdownItem(line, 'mandatory', modeId))
  }

  const groupMap = new Map<
    LogisticsGroup,
    {
      group: LogisticsGroup
      amount: number
      items: LineResult[]
    }
  >()

  for (const line of consolidableLines) {
    const existing = groupMap.get(line.group)

    if (existing) {
      existing.amount = roundUsd(existing.amount + line.amount_usd)
      existing.items.push(line)
    } else {
      groupMap.set(line.group, {
        group: line.group,
        amount: line.amount_usd,
        items: [line],
      })
    }
  }

  const rawGroups = Array.from(groupMap.values()).sort(
    (a, b) =>
      b.amount - a.amount ||
      String(a.group).localeCompare(String(b.group))
  )

  const groups: ShippingGroupBreakdown[] = []

  let consolidableAfterCross = 0

  if (consolidation.enabled && rawGroups.length > 1) {
    const crossDiscountPercent =
      clampPercent(consolidation.cross_group_discount_percent) ?? 50

    rawGroups.forEach((rawGroup, index) => {
      const factor =
        index === 0 ? 1 : 1 - crossDiscountPercent / 100

      const afterAmount = roundUsd(rawGroup.amount * factor)

      consolidableAfterCross = roundUsd(
        consolidableAfterCross + afterAmount
      )

      groups.push({
        group: rawGroup.group,
        label: getLogisticsGroupLabel(rawGroup.group),
        amount_usd: afterAmount,
        items: rawGroup.items.map((line) =>
          lineToBreakdownItem(line, 'line', modeId)
        ),
      })

      if (index > 0 && rawGroup.amount > afterAmount) {
        const discountAmount = roundUsd(afterAmount - rawGroup.amount)

        breakdown.push({
          id: `cross-group-${rawGroup.group}`,
          label: `Remise consolidation ${getLogisticsGroupLabel(
            rawGroup.group
          )}`,
          type: 'discount',
          amount_usd: discountAmount,
          group: rawGroup.group,
          mode: modeId,
        })
      }
    })
  } else {
    for (const rawGroup of rawGroups) {
      consolidableAfterCross = roundUsd(
        consolidableAfterCross + rawGroup.amount
      )

      groups.push({
        group: rawGroup.group,
        label: getLogisticsGroupLabel(rawGroup.group),
        amount_usd: rawGroup.amount,
        items: rawGroup.items.map((line) =>
          lineToBreakdownItem(line, 'line', modeId)
        ),
      })
    }
  }

  consolidableAfterCross = roundUsd(consolidableAfterCross)

  let consolidableFinal = consolidableAfterCross

  const finalDiscountPercent =
    clampPercent(consolidation.discount_percent) ?? 0

  if (
    consolidation.enabled &&
    finalDiscountPercent > 0 &&
    consolidableFinal > 0
  ) {
    const discountAmount = roundUsd(
      (consolidableFinal * finalDiscountPercent) / 100
    )

    if (discountAmount > 0) {
      breakdown.push({
        id: 'order-consolidation-discount',
        label: 'Remise livraison groupée',
        type: 'discount',
        amount_usd: -discountAmount,
        mode: modeId,
      })

      consolidableFinal = roundUsd(consolidableFinal - discountAmount)
    }
  }

  const computedSubtotalUsd = roundUsd(
    normalizedItems.reduce(
      (sum, item) => sum + item.unit_price_usd * item.quantity,
      0
    )
  )

  const subtotalUsd =
    nullablePositive(params.subtotalUsd) ?? computedSubtotalUsd

  let freeShippingApplied = false

  const freeThreshold = consolidation.free_shipping_threshold_usd

  if (
    freeThreshold != null &&
    freeThreshold > 0 &&
    subtotalUsd >= freeThreshold &&
    consolidableFinal > 0
  ) {
    freeShippingApplied = true

    breakdown.push({
      id: 'free-shipping-threshold',
      label: `Livraison gratuite dès ${formatUsdPreview(freeThreshold)}`,
      type: 'free_shipping',
      amount_usd: -consolidableFinal,
      mode: modeId,
      note: 'Appliquée uniquement sur la partie consolidable.',
    })

    consolidableFinal = 0
  }

  if (
    !freeShippingApplied &&
    consolidation.max_order_shipping_usd != null &&
    consolidableFinal > positiveNum(consolidation.max_order_shipping_usd)
  ) {
    const maxAmount = positiveNum(consolidation.max_order_shipping_usd)
    const adjustment = roundUsd(maxAmount - consolidableFinal)

    breakdown.push({
      id: 'order-cap',
      label: 'Plafond livraison consolidée',
      type: 'cap',
      amount_usd: adjustment,
      mode: modeId,
    })

    consolidableFinal = maxAmount
  }

  if (
    !freeShippingApplied &&
    consolidableFinal > 0 &&
    consolidation.min_order_shipping_usd != null &&
    consolidableFinal < positiveNum(consolidation.min_order_shipping_usd)
  ) {
    const minAmount = positiveNum(consolidation.min_order_shipping_usd)
    const adjustment = roundUsd(minAmount - consolidableFinal)

    breakdown.push({
      id: 'order-floor',
      label: 'Minimum livraison consolidée',
      type: 'floor',
      amount_usd: adjustment,
      mode: modeId,
    })

    consolidableFinal = minAmount
  }

  if (consolidableFinal < 0) {
    consolidableFinal = 0
  }

  const totalUsd = roundUsd(mandatoryTotal + consolidableFinal)
  const totalCdf =
    rateUsed && rateUsed > 0 ? roundCdf(totalUsd * rateUsed) : 0

  const enrichedBreakdown = enrichBreakdown(breakdown, rateUsed)

  const enrichedGroups: ShippingGroupBreakdown[] = groups.map((group) => ({
    ...group,
    amount_usd: roundUsd(group.amount_usd),
    amount_cdf:
      rateUsed && rateUsed > 0
        ? roundCdf(group.amount_usd * rateUsed)
        : 0,
    items: enrichBreakdown(group.items, rateUsed),
  }))

  const warnings = uniqueStrings([
    ...normalizedItems.flatMap((item) => item.warnings),
    ...lines.flatMap((line) => line.warnings),
  ])

  if (mandatoryTotal > 0 && consolidableFinal === 0 && !freeShippingApplied) {
    warnings.push(
      'Certains articles ont des frais de livraison obligatoires non consolidables.'
    )
  }

  const delay = computeDelay(
    normalizedItems,
    modeId,
    normalizedItems[0]?.deliveryConfig.global_delay_label ?? null
  )

  const requiresSignature = normalizedItems.some(
    (item) => item.logistics.requires_signature
  )

  const fragile = normalizedItems.some((item) => item.logistics.fragile)

  const bulky = normalizedItems.some((item) => item.logistics.bulky)

  const hazardous = normalizedItems.some((item) => item.logistics.hazardous)

  const installationRequired = normalizedItems.some(
    (item) => item.logistics.installation_required
  )

  return {
    mode: modeId,
    available: true,
    unavailable_reason: null,

    subtotal_usd: subtotalUsd,

    total_usd: totalUsd,
    total_cdf: totalCdf,

    rate_used: rateUsed,

    mandatory_usd: mandatoryTotal,
    consolidable_before_discount_usd: consolidableBeforeDiscount,
    consolidable_after_discount_usd: consolidableAfterCross,
    consolidable_final_usd: consolidableFinal,

    free_shipping_applied: freeShippingApplied,
    free_shipping_threshold_usd: freeThreshold ?? null,

    delay_min_hours: delay.delay_min_hours,
    delay_max_hours: delay.delay_max_hours,
    delay_label: delay.delay_label,

    breakdown: enrichedBreakdown,
    groups: enrichedGroups,

    warnings: uniqueStrings(warnings),

    requires_signature: requiresSignature,
    fragile,
    bulky,
    hazardous,
    installation_required: installationRequired,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  AVAILABLE MODES                                                */
/* ═══════════════════════════════════════════════════════════════ */

export interface DeliveryModeAvailability {
  available: boolean
  reason?: string | null
}

export function getAvailableDeliveryModes(
  items: ShippingCartItem[],
  rate: number | null = null
): Record<DeliveryModeId, DeliveryModeAvailability> {
  const result = {} as Record<DeliveryModeId, DeliveryModeAvailability>

  for (const modeId of DELIVERY_MODE_IDS) {
    const normalizedItems = items.map((item) =>
      normalizeShippingCartItem(item, modeId, rate)
    )

    const blocked = normalizedItems.find((item) => !item.modeConfig.enabled)

    result[modeId] = {
      available: !blocked,
      reason: blocked
        ? `Certains articles ne peuvent pas être livrés en ${getDeliveryModeLabel(
            modeId
          )} : ${blocked.nom}.`
        : null,
    }
  }

  return result
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT ESTIMATION                                             */
/* ═══════════════════════════════════════════════════════════════ */

export interface ProductDeliveryEstimate {
  available: boolean
  amount_usd: number
  amount_cdf: number
  delay_label: string
  warnings: string[]
  quote: ShippingQuote
}

export function estimateProductDeliveryFee(
  product: any,
  modeId: DeliveryModeId,
  quantity = 1,
  rate: number | null = null
): ProductDeliveryEstimate {
  const safeQuantity = Math.max(1, Math.floor(positiveNum(quantity)))

  const unitPriceUsd =
    nullablePositive(product?.prix_usd) ??
    nullablePositive(product?.price_usd) ??
    (nullablePositive(product?.prix) != null && rate && rate > 0
      ? roundUsd(positiveNum(product?.prix) / rate)
      : 0)

  const item: ShippingCartItem = {
    ...(product || {}),
    id: product?.id,
    product_id: product?.id,
    nom: product?.nom,
    quantity: safeQuantity,
    unit_price_usd: unitPriceUsd,
    delivery_config: product?.delivery_config ?? null,
    product: product ?? null,
    variante: product?.variante ?? null,
    poids_kg: product?.poids_kg ?? null,
  }

  const quote = calculateShippingQuote({
    items: [item],
    modeId,
    rate,
    subtotalUsd: unitPriceUsd * safeQuantity,
  })

  return {
    available: quote.available,
    amount_usd: quote.total_usd,
    amount_cdf: quote.total_cdf,
    delay_label: quote.delay_label,
    warnings: quote.warnings,
    quote,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DISPLAY HELPERS                                                */
/* ═══════════════════════════════════════════════════════════════ */

export function formatShippingMoney(
  value: number | null | undefined,
  currency: Currency
): string {
  const n = Number(value ?? 0)

  if (!Number.isFinite(n) || n <= 0) return '—'

  if (currency === 'USD') {
    return `$${n.toFixed(2)}`
  }

  return `${Math.round(n).toLocaleString('fr-FR')} FC`
}

export function getShippingPrimaryValue(
  quote: ShippingQuote,
  currency: Currency
): number {
  return currency === 'USD' ? quote.total_usd : quote.total_cdf
}

export function getShippingSecondaryValue(
  quote: ShippingQuote,
  currency: Currency
): number {
  return currency === 'USD' ? quote.total_cdf : quote.total_usd
}

export function getShippingSecondaryCurrency(currency: Currency): Currency {
  return currency === 'USD' ? 'CDF' : 'USD'
}