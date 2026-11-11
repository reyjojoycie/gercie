// features/admin/produits/constants/delivery-presets.ts

import type {
  DeliveryCalculationMode,
  DeliveryModeConfig,
  DeliveryModeId,
  LogisticsConfig,
  LogisticsGroup,
  ProductDeliveryConfig,
} from '@/lib/shipping-utils'

import {
  createDefaultLogisticsConfig,
  createDefaultProductDeliveryConfig,
  DELIVERY_MODE_IDS,
} from '@/lib/shipping-utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface DeliveryPresetDefinition {
  id: string
  label: string
  description: string

  /**
   * true = l’admin doit confirmer manuellement avant application.
   * Utile pour produits lourds / installation / frais obligatoires.
   */
  requiresManualConfirmation?: boolean

  recommendedGroups?: LogisticsGroup[]

  logistics?: Partial<LogisticsConfig>

  modePatch: Partial<DeliveryModeConfig>
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRESETS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export const DELIVERY_PRESETS: DeliveryPresetDefinition[] = [
  {
    id: 'small_light',
    label: 'Petit article léger',
    description:
      'Brosse, câble, petit accessoire. Frais consolidables avec plafond par ligne.',
    recommendedGroups: ['small'],
    logistics: {
      group: 'small',
      fragile: false,
      liquid: false,
      bulky: false,
      hazardous: false,
      installation_required: false,
      requires_signature: false,
    },
    modePatch: {
      enabled: true,
      fee_usd: 1,
      base_fee_usd: 1,
      additional_unit_fee_usd: 0.1,
      max_line_fee_usd: 3,
      min_line_fee_usd: 1,
      calculation_mode: 'shared',
      mandatory_per_unit: false,
      non_consolidable: false,
      protect_margin: false,
      handling_fee_usd: 0,
      installation_fee_usd: 0,
      labor_fee_usd: 0,
      free_weight_kg: 1,
      per_extra_kg_usd: 0,
      max_weight_kg: 5,
      delay_min_hours: 24,
      delay_max_hours: 72,
      delay_label: '24h - 72h',
    },
  },

  {
    id: 'electronics_standard',
    label: 'Électronique standard',
    description:
      'Téléphone, tablette, petit électronique. Consolidable mais fragile.',
    recommendedGroups: ['standard', 'fragile'],
    logistics: {
      group: 'standard',
      fragile: true,
      liquid: false,
      bulky: false,
      hazardous: false,
      installation_required: false,
      requires_signature: false,
    },
    modePatch: {
      enabled: true,
      fee_usd: 2,
      base_fee_usd: 2,
      additional_unit_fee_usd: 0.2,
      max_line_fee_usd: 4,
      min_line_fee_usd: 1.5,
      calculation_mode: 'shared',
      mandatory_per_unit: false,
      non_consolidable: false,
      protect_margin: false,
      handling_fee_usd: 0,
      installation_fee_usd: 0,
      labor_fee_usd: 0,
      free_weight_kg: 2,
      per_extra_kg_usd: 0.2,
      max_weight_kg: 10,
      delay_min_hours: 24,
      delay_max_hours: 72,
      delay_label: '24h - 72h',
    },
  },

  {
    id: 'liquid_cosmetic',
    label: 'Liquide / cosmétique',
    description:
      'Lotion, huile légère, parfum non dangereux. Consolidable avec supplément liquide.',
    recommendedGroups: ['liquid'],
    logistics: {
      group: 'liquid',
      fragile: false,
      liquid: true,
      bulky: false,
      hazardous: false,
      installation_required: false,
      requires_signature: false,
    },
    modePatch: {
      enabled: true,
      fee_usd: 1.5,
      base_fee_usd: 1.5,
      additional_unit_fee_usd: 0.2,
      max_line_fee_usd: 4,
      min_line_fee_usd: 1,
      calculation_mode: 'shared',
      mandatory_per_unit: false,
      non_consolidable: false,
      protect_margin: false,
      handling_fee_usd: 0,
      installation_fee_usd: 0,
      labor_fee_usd: 0,
      free_weight_kg: 2,
      per_extra_kg_usd: 0.3,
      max_weight_kg: 10,
      delay_min_hours: 24,
      delay_max_hours: 72,
      delay_label: '24h - 72h',
    },
  },

  {
    id: 'fragile',
    label: 'Article fragile',
    description:
      'Verre, céramique, article cassable. Consolidable avec protection.',
    recommendedGroups: ['fragile'],
    logistics: {
      group: 'fragile',
      fragile: true,
      liquid: false,
      bulky: false,
      hazardous: false,
      installation_required: false,
      requires_signature: false,
    },
    modePatch: {
      enabled: true,
      fee_usd: 2,
      base_fee_usd: 2,
      additional_unit_fee_usd: 0.25,
      max_line_fee_usd: 5,
      min_line_fee_usd: 2,
      calculation_mode: 'shared',
      mandatory_per_unit: false,
      non_consolidable: false,
      protect_margin: false,
      handling_fee_usd: 0,
      installation_fee_usd: 0,
      labor_fee_usd: 0,
      free_weight_kg: 2,
      per_extra_kg_usd: 0.3,
      max_weight_kg: 10,
      delay_min_hours: 24,
      delay_max_hours: 72,
      delay_label: '24h - 72h',
    },
  },

  {
    id: 'bulky',
    label: 'Article volumineux',
    description:
      'Meuble, carton volumineux, article qui prend de la place. Souvent non consolidable.',
    requiresManualConfirmation: true,
    recommendedGroups: ['bulky'],
    logistics: {
      group: 'bulky',
      fragile: false,
      liquid: false,
      bulky: true,
      hazardous: false,
      installation_required: false,
      requires_signature: true,
    },
    modePatch: {
      enabled: true,
      fee_usd: 8,
      base_fee_usd: 8,
      additional_unit_fee_usd: 0,
      max_line_fee_usd: null,
      min_line_fee_usd: 8,
      calculation_mode: 'mandatory_per_unit',
      mandatory_per_unit: true,
      non_consolidable: true,
      protect_margin: false,
      handling_fee_usd: 0,
      installation_fee_usd: 0,
      labor_fee_usd: 0,
      free_weight_kg: 10,
      per_extra_kg_usd: 0.5,
      max_weight_kg: 50,
      delay_min_hours: 72,
      delay_max_hours: 168,
      delay_label: '3 - 7 jours',
    },
  },

  {
    id: 'heavy',
    label: 'Article lourd',
    description:
      'Électroménager lourd, machine, matériel dense. Frais obligatoires par unité.',
    requiresManualConfirmation: true,
    recommendedGroups: ['heavy', 'mandatory'],
    logistics: {
      group: 'heavy',
      fragile: false,
      liquid: false,
      bulky: true,
      hazardous: false,
      installation_required: false,
      requires_signature: true,
    },
    modePatch: {
      enabled: true,
      fee_usd: 20,
      base_fee_usd: 20,
      additional_unit_fee_usd: 0,
      max_line_fee_usd: null,
      min_line_fee_usd: 20,
      calculation_mode: 'mandatory_per_unit',
      mandatory_per_unit: true,
      non_consolidable: true,
      protect_margin: true,
      handling_fee_usd: 10,
      installation_fee_usd: 0,
      labor_fee_usd: 0,
      free_weight_kg: 20,
      per_extra_kg_usd: 0.8,
      max_weight_kg: 100,
      delay_min_hours: 72,
      delay_max_hours: 168,
      delay_label: '3 - 7 jours',
    },
  },

  {
    id: 'machine_handling',
    label: 'Machine / manutention',
    description:
      'Produit nécessitant manutention, équipe ou préparation spéciale.',
    requiresManualConfirmation: true,
    recommendedGroups: ['mandatory', 'heavy'],
    logistics: {
      group: 'mandatory',
      fragile: false,
      liquid: false,
      bulky: true,
      hazardous: false,
      installation_required: false,
      requires_signature: true,
    },
    modePatch: {
      enabled: true,
      fee_usd: 50,
      base_fee_usd: 50,
      additional_unit_fee_usd: 0,
      max_line_fee_usd: null,
      min_line_fee_usd: 50,
      calculation_mode: 'mandatory_per_unit',
      mandatory_per_unit: true,
      non_consolidable: true,
      protect_margin: true,
      handling_fee_usd: 20,
      installation_fee_usd: 0,
      labor_fee_usd: 0,
      free_weight_kg: 30,
      per_extra_kg_usd: 1,
      max_weight_kg: 200,
      delay_min_hours: 72,
      delay_max_hours: 168,
      delay_label: '3 - 7 jours',
    },
  },

  {
    id: 'installation_required',
    label: 'Installation requise',
    description:
      'Produit avec pose, branchement, montage ou intervention humaine.',
    requiresManualConfirmation: true,
    recommendedGroups: ['installation', 'mandatory'],
    logistics: {
      group: 'installation',
      fragile: false,
      liquid: false,
      bulky: true,
      hazardous: false,
      installation_required: true,
      requires_signature: true,
    },
    modePatch: {
      enabled: true,
      fee_usd: 0,
      base_fee_usd: 0,
      additional_unit_fee_usd: 0,
      max_line_fee_usd: null,
      min_line_fee_usd: 30,
      calculation_mode: 'mandatory_per_unit',
      mandatory_per_unit: true,
      non_consolidable: true,
      protect_margin: true,
      handling_fee_usd: 0,
      installation_fee_usd: 30,
      labor_fee_usd: 0,
      free_weight_kg: 0,
      per_extra_kg_usd: 0,
      max_weight_kg: null,
      delay_min_hours: 120,
      delay_max_hours: 240,
      delay_label: '5 - 10 jours',
    },
  },

  {
    id: 'mandatory_non_consolidable',
    label: 'Frais obligatoires non consolidables',
    description:
      'Le produit garde son frais de livraison complet, même si le client achète plusieurs articles.',
    requiresManualConfirmation: true,
    recommendedGroups: ['mandatory'],
    logistics: {
      group: 'mandatory',
    },
    modePatch: {
      enabled: true,
      calculation_mode: 'mandatory_per_unit',
      mandatory_per_unit: true,
      non_consolidable: true,
      protect_margin: true,
      max_line_fee_usd: null,
    },
  },

  {
    id: 'free_shipping',
    label: 'Livraison gratuite',
    description:
      'Frais client à 0 pour ce mode. Attention : ne pas utiliser sur produits lourds sans vérifier la marge.',
    requiresManualConfirmation: true,
    recommendedGroups: ['small', 'standard'],
    modePatch: {
      enabled: true,
      fee_usd: 0,
      base_fee_usd: 0,
      additional_unit_fee_usd: 0,
      max_line_fee_usd: 0,
      min_line_fee_usd: 0,
      calculation_mode: 'free',
      mandatory_per_unit: false,
      non_consolidable: false,
      protect_margin: false,
      handling_fee_usd: 0,
      installation_fee_usd: 0,
      labor_fee_usd: 0,
    },
  },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export function getDeliveryPresetById(
  presetId?: string | null
): DeliveryPresetDefinition | null {
  if (!presetId) return null

  return (
    DELIVERY_PRESETS.find((preset) => preset.id === presetId) || null
  )
}

export function getDeliveryPresetsForGroup(
  group?: LogisticsGroup | null
): DeliveryPresetDefinition[] {
  if (!group) return DELIVERY_PRESETS

  return DELIVERY_PRESETS.filter((preset) =>
    preset.recommendedGroups?.includes(group)
  )
}

export function createEmptyDeliveryPresetState(): ProductDeliveryConfig {
  return createDefaultProductDeliveryConfig()
}

export function applyDeliveryPresetToMode(
  config: ProductDeliveryConfig,
  presetId: string,
  modeId: DeliveryModeId = 'domicile'
): ProductDeliveryConfig {
  const preset = getDeliveryPresetById(presetId)

  if (!preset) return config

  const next: ProductDeliveryConfig = JSON.parse(
    JSON.stringify(config)
  ) as ProductDeliveryConfig

  next.enabled = true

  const currentMode =
    next.modes?.[modeId] || createDefaultModeForPreset(modeId)

  next.modes[modeId] = {
    ...currentMode,
    ...preset.modePatch,
  }

  if (preset.logistics) {
    next.logistics = {
      ...(next.logistics || createDefaultLogisticsConfig()),
      ...preset.logistics,
    }
  }

  return next
}

export function applyDeliveryPresetToAllModes(
  config: ProductDeliveryConfig,
  presetId: string
): ProductDeliveryConfig {
  let next = config

  for (const modeId of DELIVERY_MODE_IDS) {
    next = applyDeliveryPresetToMode(next, presetId, modeId)
  }

  return next
}

function createDefaultModeForPreset(
  modeId: DeliveryModeId
): DeliveryModeConfig {
  const defaultConfig = createDefaultProductDeliveryConfig()

  return defaultConfig.modes[modeId]
}

export function isDeliveryPresetCritical(
  presetId?: string | null
): boolean {
  const preset = getDeliveryPresetById(presetId)

  return Boolean(preset?.requiresManualConfirmation)
}

export function getDeliveryPresetCalculationMode(
  presetId?: string | null
): DeliveryCalculationMode | null {
  const preset = getDeliveryPresetById(presetId)

  return preset?.modePatch?.calculation_mode || null
}