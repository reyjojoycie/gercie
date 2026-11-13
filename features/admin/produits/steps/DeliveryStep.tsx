// features/admin/produits/steps/DeliveryStep.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { motion, useReducedMotion } from 'framer-motion'

import {
  AlertCircle,
  Gauge,
  Info,
  Layers,
  Package,
  Settings2,
  Sparkles,
  Truck,
  Weight,
  Zap,
} from 'lucide-react'

import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import DeliveryBreakdown from '@/components/DeliveryBreakdown'

import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useStepContext } from '../context/ProductFormContext'

import type {
  DeliveryCalculationMode,
  DeliveryModeConfig,
  DeliveryModeId,
  LogisticsConfig,
  LogisticsGroup,
  ProductDeliveryConfig,
  ShippingQuote,
} from '@/lib/shipping-utils'

import {
  createDefaultDeliveryConsolidationConfig,
  createDefaultLogisticsConfig,
  createDefaultProductDeliveryConfig,
  DELIVERY_MODE_IDS,
  estimateProductDeliveryFee,
  formatShippingMoney,
  getDeliveryModeLabel,
  normalizeProductDeliveryConfig,
} from '@/lib/shipping-utils'

import {
  applyDeliveryPresetToAllModes,
  applyDeliveryPresetToMode,
  DELIVERY_PRESETS,
  isDeliveryPresetCritical,
} from '../constants/delivery-presets'

/* ═══════════════════════════════════════════════════════════════ */
/*  STYLES                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const CALCULATION_MODES: {
  value: DeliveryCalculationMode
  label: string
  hint: string
}[] = [
  {
    value: 'shared',
    label: 'Partagé / consolidable',
    hint: 'Plusieurs articles peuvent être regroupés.',
  },
  {
    value: 'per_unit',
    label: 'Par unité',
    hint: 'Frais multipliés par la quantité.',
  },
  {
    value: 'mandatory_per_unit',
    label: 'Obligatoire par unité',
    hint: 'Frais non consolidables, sécurité marge.',
  },
  {
    value: 'weight_based',
    label: 'Selon poids',
    hint: 'Base + supplément au-delà du poids gratuit.',
  },
  {
    value: 'free',
    label: 'Gratuit',
    hint: 'Frais client à 0 pour ce mode.',
  },
]

const LOGISTICS_GROUPS: {
  value: LogisticsGroup
  label: string
}[] = [
  { value: 'small', label: 'Petit article léger' },
  { value: 'standard', label: 'Article standard' },
  { value: 'bulky', label: 'Volumineux' },
  { value: 'heavy', label: 'Lourd' },
  { value: 'liquid', label: 'Liquide / cosmétique' },
  { value: 'fragile', label: 'Fragile' },
  { value: 'hazardous', label: 'Sensible / dangereux' },
  { value: 'installation', label: 'Installation / manutention' },
  { value: 'mandatory', label: 'Frais obligatoires' },
  { value: 'other', label: 'Autre' },
]

const PREVIEW_QUANTITIES = [1, 2, 5, 12, 20]

/* ═══════════════════════════════════════════════════════════════ */
/*  NUMBER / MONEY HELPERS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function resolveRate(exchange: any): number | null {
  const candidates = [
    exchange?.rate,
    exchange?.usdRate,
    exchange?.data?.rate,
    exchange?.data?.current?.rate,
    exchange,
  ]

  for (const candidate of candidates) {
    const n = Number(candidate)

    if (Number.isFinite(n) && n > 0) return n
  }

  return null
}

function positiveNumber(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function firstPositive(...values: any[]): number {
  for (const value of values) {
    const n = Number(value)

    if (Number.isFinite(n) && n > 0) return n
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

function parseMoney(value: any): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return round2(n)
}

function parseOptionalMoney(value: any): number | null {
  if (value === '' || value === null || value === undefined) return null
  return parseMoney(value)
}

function parseOptionalInt(value: any): number | null {
  if (value === '' || value === null || value === undefined) return null

  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null

  return Math.round(n)
}

function parsePercent(value: any): number | null {
  if (value === '' || value === null || value === undefined) return null

  const n = Number(value)
  if (!Number.isFinite(n)) return null

  return Math.min(100, Math.max(0, Math.round(n)))
}

interface MoneyPair {
  usd: number
  cdf: number
}

/**
 * Règle absolue :
 * - Si USD existe → USD = vérité.
 *   CDF = USD × taux courant.
 *   Le CDF stocké n’est conservé que comme fallback temporaire si le taux n’est pas disponible.
 *
 * - Si seulement CDF existe → CDF = source temporaire.
 *   USD = CDF / taux courant.
 *
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

function modeExtraFees(mode: DeliveryModeConfig): number {
  return round2(
    positiveNumber((mode as any).handling_fee_usd) +
      positiveNumber((mode as any).installation_fee_usd) +
      positiveNumber((mode as any).labor_fee_usd)
  )
}

function isModeNonConsolidable(mode: DeliveryModeConfig): boolean {
  return Boolean(
    (mode as any).mandatory_per_unit ||
      (mode as any).non_consolidable ||
      (mode as any).protect_margin ||
      mode.calculation_mode === 'mandatory_per_unit' ||
      modeExtraFees(mode) > 0
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELIVERY CONFIG NORMALIZATION                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeModeMoney(
  mode: DeliveryModeConfig,
  rate: number | null
): DeliveryModeConfig {
  const out: any = { ...mode }
  const rateNum = Number(rate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  if (out.calculation_mode === 'free') {
    out.fee_usd = 0
    out.base_fee_usd = 0
    out.fee_cdf = 0
    out.additional_unit_fee_usd = 0
    out.max_line_fee_usd = 0
    out.min_line_fee_usd = 0
    out.free_shipping_threshold_usd = 0
    out.handling_fee_usd = 0
    out.installation_fee_usd = 0
    out.labor_fee_usd = 0
    out.mandatory_per_unit = false
    out.non_consolidable = false
    out.protect_margin = false
    return out
  }

  const feeUsd = firstPositive(out.fee_usd, out.base_fee_usd)
  const feeCdf = firstPositive(out.fee_cdf)

  if (feeUsd > 0) {
    out.fee_usd = round2(feeUsd)
    out.base_fee_usd = round2(feeUsd)
    out.fee_cdf = rateOk
      ? roundCdf(toCdf(feeUsd, rateNum))
      : feeCdf
  } else if (feeCdf > 0 && rateOk) {
    const derivedUsd = round2(toUsd(feeCdf, rateNum))
    out.fee_usd = derivedUsd
    out.base_fee_usd = derivedUsd
    out.fee_cdf = roundCdf(toCdf(derivedUsd, rateNum))
  } else {
    out.fee_usd = 0
    out.base_fee_usd = 0
    out.fee_cdf = feeCdf
  }

  const extra = modeExtraFees(out)

  if (extra > 0) {
    out.mandatory_per_unit = true
    out.non_consolidable = true
    out.calculation_mode = 'mandatory_per_unit'
  }

  if (
    out.mandatory_per_unit ||
    out.non_consolidable ||
    out.protect_margin
  ) {
    if (out.calculation_mode !== 'free') {
      out.calculation_mode = 'mandatory_per_unit'
    }
  }

  if (out.calculation_mode === 'mandatory_per_unit') {
    out.mandatory_per_unit = true
    out.non_consolidable = true
  }

  return out as DeliveryModeConfig
}

function normalizeConfigMoney(
  config: ProductDeliveryConfig,
  rate: number | null
): ProductDeliveryConfig {
  const modes: Record<string, DeliveryModeConfig> = {
    ...(config.modes || {}),
  }

  for (const modeId of DELIVERY_MODE_IDS) {
    if (modes[modeId]) {
      modes[modeId] = normalizeModeMoney(modes[modeId], rate)
    }
  }

  const consolidation = config.consolidation
    ? {
        ...config.consolidation,
        free_shipping_applies_to: 'consolidable_only',
      }
    : config.consolidation

  return {
    ...config,
    modes,
    consolidation,
  } as ProductDeliveryConfig
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI COMPONENTS                                            */
/* ═══════════════════════════════════════════════════════════════ */

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3 transition',
        disabled && 'opacity-60'
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:cursor-not-allowed',
          checked ? 'bg-emerald-500' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition',
            checked ? 'translate-x-4' : 'translate-x-1'
          )}
        />
      </button>

      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  hint,
  disabled = false,
  min = 0,
  max,
  step = '0.01',
  warning,
}: {
  label: string
  value: number | string | null | undefined
  onChange: (value: string) => void
  placeholder?: string
  suffix?: string
  hint?: string
  disabled?: boolean
  min?: number
  max?: number
  step?: string
  warning?: string | null
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>

      <div className="relative">
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          className={cn(
            inputBase,
            suffix && 'pr-12',
            warning && 'border-red-500/50 focus:ring-red-500'
          )}
        />

        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>

      {warning ? (
        <p className="text-[11px] text-red-500">{warning}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled = false,
}: {
  label: string
  value: string | null | undefined
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>

      <input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={inputBase}
      />

      {hint && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </label>
  )
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled = false,
  rows = 3,
}: {
  label: string
  value: string | null | undefined
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  disabled?: boolean
  rows?: number
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>

      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={cn(inputBase, 'resize-y')}
      />

      {hint && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; hint?: string }[]
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputBase}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.hint ? ` — ${option.hint}` : ''}
          </option>
        ))}
      </select>

      {hint && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </label>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function DeliveryStep() {
  const prefersReducedMotion = useReducedMotion()

  const stepContext = useStepContext() as any
  const f = (stepContext?.form ?? stepContext ?? {}) as any

  const toast = useToast() as any

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const exchange = useExchangeRate() as any

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  /* ------------------------------------------------------------ */
  /* Taux : contexte admin prioritaire, fallback hook global        */
  /* ------------------------------------------------------------ */

  const contextRate = f?.rate ?? stepContext?.rate

  const rawRate = useMemo(() => {
    const ctxRate = Number(contextRate)

    if (Number.isFinite(ctxRate) && ctxRate > 0) {
      return ctxRate
    }

    return resolveRate(exchange)
  }, [contextRate, exchange])

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   */
  const effectiveRate = mounted ? rawRate : null

  const rateNum = Number(effectiveRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0
  const rateLoading = !rateOk && Boolean(exchange?.loading)

  /* ------------------------------------------------------------ */
  /* Form values / delivery config                                 */
  /* ------------------------------------------------------------ */

  const legacyValuesRef = useRef<any>({})

  legacyValuesRef.current =
    typeof f?.watch === 'function'
      ? f.watch()
      : f?.formValues ?? {}

  const externalConfig =
    f?.deliveryConfig ??
    f?.delivery_config ??
    stepContext?.deliveryConfig

  const fallbackConfig = useMemo(
    () => createDefaultProductDeliveryConfig(),
    []
  )

  const setDeliveryConfigExternal =
    f?.setDeliveryConfig ??
    f?.set_delivery_config ??
    f?.updateDeliveryConfig ??
    stepContext?.setDeliveryConfig

  const hasPersistentDeliveryState = Boolean(
    setDeliveryConfigExternal
  )

  const [config, setConfigState] = useState<ProductDeliveryConfig>(
    () => {
      const base = normalizeProductDeliveryConfig(
        externalConfig,
        legacyValuesRef.current,
        effectiveRate
      )

      return normalizeConfigMoney(base, effectiveRate)
    }
  )

  useEffect(() => {
    const base = normalizeProductDeliveryConfig(
      externalConfig,
      legacyValuesRef.current,
      effectiveRate
    )

    const normalized = normalizeConfigMoney(base, effectiveRate)

    setConfigState(normalized)
  }, [externalConfig, effectiveRate])

  const commit = useCallback(
    (next: ProductDeliveryConfig) => {
      const base = normalizeProductDeliveryConfig(
        next,
        legacyValuesRef.current,
        effectiveRate
      )

      const normalized = normalizeConfigMoney(base, effectiveRate)

      setConfigState(normalized)
      setDeliveryConfigExternal?.(normalized)
    },
    [effectiveRate, setDeliveryConfigExternal]
  )

  const [tab, setTab] = useState<
    | 'general'
    | 'domicile'
    | 'point_retrait'
    | 'express'
    | 'consolidation'
    | 'preview'
  >('general')

  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    DELIVERY_PRESETS[0]?.id || 'small_light'
  )

  const [previewMode, setPreviewMode] =
    useState<DeliveryModeId>('domicile')

  const [previewQuantity, setPreviewQuantity] = useState(1)

  /* ---------------------------------------------------------- */
  /* Update helpers                                              */
  /* ---------------------------------------------------------- */

  const updateConfig = useCallback(
    (patch: Partial<ProductDeliveryConfig>) => {
      commit({ ...config, ...patch })
    },
    [commit, config]
  )

  const updateMode = useCallback(
    (modeId: DeliveryModeId, patch: Partial<DeliveryModeConfig>) => {
      const baseModes = config.modes || fallbackConfig.modes
      const current =
        baseModes[modeId] || fallbackConfig.modes[modeId]

      commit({
        ...config,
        modes: {
          ...baseModes,
          [modeId]: {
            ...current,
            ...patch,
          },
        },
      })
    },
    [commit, config, fallbackConfig.modes]
  )

  const updateLogistics = useCallback(
    (patch: Partial<LogisticsConfig>) => {
      const current =
        config.logistics ||
        fallbackConfig.logistics ||
        createDefaultLogisticsConfig()

      commit({
        ...config,
        logistics: {
          ...current,
          ...patch,
        },
      })
    },
    [commit, config, fallbackConfig.logistics]
  )

  const updateConsolidation = useCallback(
    (patch: any) => {
      const current =
        config.consolidation ||
        fallbackConfig.consolidation ||
        createDefaultDeliveryConsolidationConfig()

      commit({
        ...config,
        consolidation: {
          ...current,
          ...patch,
          free_shipping_applies_to: 'consolidable_only',
        },
      })
    },
    [commit, config, fallbackConfig.consolidation]
  )

  /* ---------------------------------------------------------- */
  /* Presets                                                     */
  /* ---------------------------------------------------------- */

  const handleApplyPreset = useCallback(
    (scope: 'all' | DeliveryModeId) => {
      const preset = DELIVERY_PRESETS.find(
        (item) => item.id === selectedPresetId
      )

      if (!preset) {
        addToast({
          type: 'error',
          message: 'Preset introuvable.',
        })
        return
      }

      if (
        isDeliveryPresetCritical(preset.id) &&
        typeof window !== 'undefined' &&
        !window.confirm(
          `Le preset "${preset.label}" peut rendre les frais de livraison obligatoires ou non consolidables. Continuer ?`
        )
      ) {
        return
      }

      const next =
        scope === 'all'
          ? applyDeliveryPresetToAllModes(config, preset.id)
          : applyDeliveryPresetToMode(config, preset.id, scope)

      commit({
        ...next,
        enabled: true,
      })

      addToast({
        type: 'success',
        message: `Preset "${preset.label}" appliqué.`,
      })
    },
    [addToast, commit, config, selectedPresetId]
  )

  /* ---------------------------------------------------------- */
  /* Summary                                                     */
  /* ---------------------------------------------------------- */

  const activeModes = useMemo(
    () =>
      DELIVERY_MODE_IDS.filter((modeId) =>
        Boolean(config.modes?.[modeId]?.enabled)
      ),
    [config.modes]
  )

  const nonConsolidableModes = useMemo(
    () =>
      activeModes.filter((modeId) =>
        isModeNonConsolidable(
          config.modes?.[modeId] || fallbackConfig.modes[modeId]
        )
      ),
    [activeModes, config.modes, fallbackConfig.modes]
  )

  const consolidation = useMemo(
    () =>
      config.consolidation ||
      fallbackConfig.consolidation ||
      createDefaultDeliveryConsolidationConfig(),
    [config.consolidation, fallbackConfig.consolidation]
  )

  /* ---------------------------------------------------------- */
  /* Preview                                                     */
  /* ---------------------------------------------------------- */

  const previewPair = useMemo<MoneyPair>(() => {
    const usdSource = firstPositive(
      f?.prix_usd,
      f?.priceUsd,
      legacyValuesRef.current?.prix_usd,
      legacyValuesRef.current?.price_usd
    )

    const cdfSource = firstPositive(
      f?.prix,
      f?.price_cdf,
      legacyValuesRef.current?.prix,
      legacyValuesRef.current?.prix_cdf
    )

    return resolvePricePair(usdSource, cdfSource, effectiveRate)
  }, [
    effectiveRate,
    f?.prix,
    f?.prix_usd,
    f?.priceUsd,
    f?.price_cdf,
  ])

  const previewPriceUsd = previewPair.usd

  const previewProduct = useMemo(() => {
    return {
      id: 'delivery-preview',
      nom: String(
        f?.nomWatch ||
          legacyValuesRef.current?.nom ||
          'Produit'
      ),
      prix_usd: previewPair.usd,
      prix: previewPair.cdf,
      poids_kg:
        config.logistics?.weight_kg ??
        legacyValuesRef.current?.poids_kg ??
        null,
      delivery_config: config,
    }
  }, [config, f?.nomWatch, previewPair])

  const previewRows = useMemo(() => {
    return PREVIEW_QUANTITIES.map((quantity) => {
      const estimate = estimateProductDeliveryFee(
        previewProduct,
        previewMode,
        quantity,
        effectiveRate
      )

      return {
        quantity,
        estimate,
      }
    })
  }, [effectiveRate, previewMode, previewProduct])

  const selectedPreviewQuote: ShippingQuote | null = useMemo(() => {
    const found = previewRows.find(
      (row) => row.quantity === previewQuantity
    )

    return (found?.estimate?.quote ?? null) as ShippingQuote | null
  }, [previewQuantity, previewRows])

  /* ---------------------------------------------------------- */
  /* Render mode editor                                          */
  /* ---------------------------------------------------------- */

  const renderModeEditor = (modeId: DeliveryModeId) => {
    const baseModes = config.modes || fallbackConfig.modes
    const mode =
      baseModes[modeId] || fallbackConfig.modes[modeId]

    const disabled = !config.enabled || !mode.enabled
    const extraFees = modeExtraFees(mode)
    const nonConsolidable = isModeNonConsolidable(mode)

    const feeUsd = firstPositive(mode.fee_usd, mode.base_fee_usd)

    const displayFeeCdf =
      feeUsd > 0 && rateOk
        ? roundCdf(toCdf(feeUsd, rateNum))
        : firstPositive((mode as any).fee_cdf)

    const maxLineUsd = positiveNumber(
      (mode as any).max_line_fee_usd
    )

    const minLineUsd = positiveNumber(
      (mode as any).min_line_fee_usd
    )

    const lineFeeWarning =
      maxLineUsd > 0 &&
      minLineUsd > 0 &&
      maxLineUsd < minLineUsd
        ? 'Le maximum de frais ligne est inférieur au minimum.'
        : null

    const freeThresholdUsd = positiveNumber(
      (mode as any).free_shipping_threshold_usd
    )

    const thresholdWarning =
      freeThresholdUsd > 0 &&
      feeUsd > 0 &&
      freeThresholdUsd < feeUsd
        ? 'Le seuil de livraison gratuite est inférieur aux frais de base. La livraison gratuite ne pourra jamais s’appliquer sur ce mode.'
        : null

    const handleCalculationModeChange = (
      value: string
    ) => {
      const nextMode = value as DeliveryCalculationMode

      const patch: Partial<DeliveryModeConfig> = {
        calculation_mode: nextMode,
      }

      if (nextMode === 'free') {
        patch.fee_usd = 0
        patch.base_fee_usd = 0
        ;(patch as any).fee_cdf = 0
        ;(patch as any).additional_unit_fee_usd = 0
        ;(patch as any).max_line_fee_usd = 0
        ;(patch as any).min_line_fee_usd = 0
        ;(patch as any).free_shipping_threshold_usd = 0
        ;(patch as any).handling_fee_usd = 0
        ;(patch as any).installation_fee_usd = 0
        ;(patch as any).labor_fee_usd = 0
        ;(patch as any).mandatory_per_unit = false
        ;(patch as any).non_consolidable = false
        ;(patch as any).protect_margin = false
      }

      if (nextMode === 'mandatory_per_unit') {
        ;(patch as any).mandatory_per_unit = true
        ;(patch as any).non_consolidable = true
      }

      updateMode(modeId, patch)
    }

    return (
      <div className="space-y-5 rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              {modeId === 'express' ? (
                <Zap size={16} className="text-gold-500" />
              ) : modeId === 'point_retrait' ? (
                <Package size={16} className="text-gold-500" />
              ) : (
                <Truck size={16} className="text-gold-500" />
              )}
              {getDeliveryModeLabel(modeId)}
            </h3>

            <p className="mt-1 text-xs text-muted-foreground">
              USD est la devise principale. Le CDF est calculé
              automatiquement.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {nonConsolidable && (
              <Badge variant="warm" size="sm">
                Non consolidable
              </Badge>
            )}

            {extraFees > 0 && (
              <Badge variant="neutral" size="sm">
                Frais annexes :{' '}
                {formatShippingMoney(extraFees, 'USD')}
              </Badge>
            )}

            <Toggle
              checked={Boolean(mode.enabled)}
              onChange={(value) =>
                updateMode(modeId, { enabled: value })
              }
              label="Activer ce mode"
              disabled={!config.enabled}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Mode de calcul"
            value={mode.calculation_mode}
            onChange={handleCalculationModeChange}
            options={CALCULATION_MODES.map((item) => ({
              value: item.value,
              label: item.label,
              hint: item.hint,
            }))}
            disabled={disabled}
          />

          {mode.calculation_mode !== 'free' && (
            <NumberField
              label="Frais USD principal"
              value={feeUsd}
              onChange={(value) => {
                const usd = parseMoney(value) ?? 0

                updateMode(modeId, {
                  fee_usd: usd,
                  base_fee_usd: usd,
                  fee_cdf:
                    usd > 0 && rateOk
                      ? roundCdf(toCdf(usd, rateNum))
                      : null,
                } as any)
              }}
              suffix="USD"
              hint={
                displayFeeCdf > 0
                  ? `≈ ${formatShippingMoney(displayFeeCdf, 'CDF')}`
                  : rateOk
                    ? 'CDF calculé avec le taux actuel.'
                    : 'En attente du taux USD/CDF pour calculer le CDF.'
              }
              disabled={disabled}
            />
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <NumberField
            label="Délai minimum (heures)"
            value={(mode as any).delay_min_hours ?? ''}
            onChange={(value) =>
              updateMode(modeId, {
                delay_min_hours: parseOptionalInt(value),
              } as any)
            }
            suffix="h"
            disabled={disabled}
          />

          <NumberField
            label="Délai maximum (heures)"
            value={(mode as any).delay_max_hours ?? ''}
            onChange={(value) =>
              updateMode(modeId, {
                delay_max_hours: parseOptionalInt(value),
              } as any)
            }
            suffix="h"
            disabled={disabled}
          />

          <TextField
            label="Label délai affiché"
            value={(mode as any).delay_label ?? ''}
            onChange={(value) =>
              updateMode(modeId, { delay_label: value } as any)
            }
            placeholder="Ex : 24h - 72h"
            disabled={disabled}
          />
        </div>

        {mode.calculation_mode === 'shared' && (
          <div className="grid gap-4 md:grid-cols-4">
            <NumberField
              label="Frais unité supplémentaire USD"
              value={
                (mode as any).additional_unit_fee_usd ?? 0
              }
              onChange={(value) =>
                updateMode(modeId, {
                  additional_unit_fee_usd:
                    parseMoney(value) ?? 0,
                } as any)
              }
              suffix="USD"
              hint="Appliqué après la première unité."
              disabled={disabled}
            />

            <NumberField
              label="Maximum frais ligne USD"
              value={
                (mode as any).max_line_fee_usd ?? ''
              }
              onChange={(value) =>
                updateMode(modeId, {
                  max_line_fee_usd:
                    parseOptionalMoney(value),
                } as any)
              }
              suffix="USD"
              hint="Ex : 12 téléphones plafonnés à 3$."
              warning={lineFeeWarning}
              disabled={disabled}
            />

            <NumberField
              label="Minimum frais ligne USD"
              value={
                (mode as any).min_line_fee_usd ?? ''
              }
              onChange={(value) =>
                updateMode(modeId, {
                  min_line_fee_usd:
                    parseOptionalMoney(value),
                } as any)
              }
              suffix="USD"
              hint="Protège la marge sur petits paniers."
              warning={lineFeeWarning}
              disabled={disabled}
            />

            <NumberField
              label="Seuil livraison gratuite USD"
              value={
                (mode as any).free_shipping_threshold_usd ?? ''
              }
              onChange={(value) =>
                updateMode(modeId, {
                  free_shipping_threshold_usd:
                    parseOptionalMoney(value),
                } as any)
              }
              suffix="USD"
              hint="Uniquement partie consolidable."
              warning={thresholdWarning}
              disabled={disabled}
            />
          </div>
        )}

        {mode.calculation_mode === 'weight_based' && (
          <div className="grid gap-4 md:grid-cols-4">
            <NumberField
              label="Poids gratuit (kg)"
              value={
                (mode as any).free_weight_kg ?? 0
              }
              onChange={(value) =>
                updateMode(modeId, {
                  free_weight_kg: parseMoney(value) ?? 0,
                } as any)
              }
              suffix="kg"
              disabled={disabled}
            />

            <NumberField
              label="Supplément par kg USD"
              value={
                (mode as any).per_extra_kg_usd ?? 0
              }
              onChange={(value) =>
                updateMode(modeId, {
                  per_extra_kg_usd: parseMoney(value) ?? 0,
                } as any)
              }
              suffix="USD"
              disabled={disabled}
            />

            <NumberField
              label="Poids max colis (kg)"
              value={
                (mode as any).max_weight_kg ?? ''
              }
              onChange={(value) =>
                updateMode(modeId, {
                  max_weight_kg: parseOptionalMoney(value),
                } as any)
              }
              suffix="kg"
              disabled={disabled}
            />

            <NumberField
              label="Seuil livraison gratuite USD"
              value={
                (mode as any).free_shipping_threshold_usd ?? ''
              }
              onChange={(value) =>
                updateMode(modeId, {
                  free_shipping_threshold_usd:
                    parseOptionalMoney(value),
                } as any)
              }
              suffix="USD"
              warning={thresholdWarning}
              disabled={disabled}
            />
          </div>
        )}

        {(mode.calculation_mode === 'per_unit' ||
          mode.calculation_mode === 'mandatory_per_unit') && (
          <div className="grid gap-4 md:grid-cols-3">
            <NumberField
              label="Minimum frais ligne USD"
              value={
                (mode as any).min_line_fee_usd ?? ''
              }
              onChange={(value) =>
                updateMode(modeId, {
                  min_line_fee_usd:
                    parseOptionalMoney(value),
                } as any)
              }
              suffix="USD"
              warning={lineFeeWarning}
              disabled={disabled}
            />

            <NumberField
              label="Seuil livraison gratuite USD"
              value={
                (mode as any).free_shipping_threshold_usd ?? ''
              }
              onChange={(value) =>
                updateMode(modeId, {
                  free_shipping_threshold_usd:
                    parseOptionalMoney(value),
                } as any)
              }
              suffix="USD"
              hint="Ne s’applique pas aux frais obligatoires."
              warning={thresholdWarning}
              disabled={disabled}
            />
          </div>
        )}

        {mode.calculation_mode !== 'free' && (
          <div className="grid gap-4 md:grid-cols-3">
            <NumberField
              label="Manutention USD"
              value={
                (mode as any).handling_fee_usd ?? 0
              }
              onChange={(value) => {
                const usd = parseMoney(value) ?? 0

                updateMode(modeId, {
                  handling_fee_usd: usd,
                  mandatory_per_unit:
                    usd > 0 ? true : (mode as any).mandatory_per_unit,
                  non_consolidable:
                    usd > 0 ? true : (mode as any).non_consolidable,
                  calculation_mode:
                    usd > 0
                      ? 'mandatory_per_unit'
                      : mode.calculation_mode,
                } as any)
              }}
              suffix="USD"
              hint="Équipe, portage, préparation spéciale."
              disabled={disabled}
            />

            <NumberField
              label="Installation USD"
              value={
                (mode as any).installation_fee_usd ?? 0
              }
              onChange={(value) => {
                const usd = parseMoney(value) ?? 0

                updateMode(modeId, {
                  installation_fee_usd: usd,
                  mandatory_per_unit:
                    usd > 0 ? true : (mode as any).mandatory_per_unit,
                  non_consolidable:
                    usd > 0 ? true : (mode as any).non_consolidable,
                  calculation_mode:
                    usd > 0
                      ? 'mandatory_per_unit'
                      : mode.calculation_mode,
                } as any)
              }}
              suffix="USD"
              hint="Pose, branchement, montage."
              disabled={disabled}
            />

            <NumberField
              label="Main-d’œuvre USD"
              value={
                (mode as any).labor_fee_usd ?? 0
              }
              onChange={(value) => {
                const usd = parseMoney(value) ?? 0

                updateMode(modeId, {
                  labor_fee_usd: usd,
                  mandatory_per_unit:
                    usd > 0 ? true : (mode as any).mandatory_per_unit,
                  non_consolidable:
                    usd > 0 ? true : (mode as any).non_consolidable,
                  calculation_mode:
                    usd > 0
                      ? 'mandatory_per_unit'
                      : mode.calculation_mode,
                } as any)
              }}
              suffix="USD"
              hint="Intervention humaine supplémentaire."
              disabled={disabled}
            />
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Toggle
            checked={Boolean((mode as any).mandatory_per_unit)}
            onChange={(value) =>
              updateMode(modeId, {
                mandatory_per_unit: value,
                non_consolidable: value
                  ? true
                  : (mode as any).non_consolidable,
                calculation_mode: value
                  ? 'mandatory_per_unit'
                  : mode.calculation_mode,
              } as any)
            }
            label="Frais obligatoires par unité"
            description="Ne pas consolider. Chaque unité garde son frais."
            disabled={disabled}
          />

          <Toggle
            checked={Boolean((mode as any).non_consolidable)}
            onChange={(value) =>
              updateMode(modeId, {
                non_consolidable: value,
                calculation_mode: value
                  ? 'mandatory_per_unit'
                  : mode.calculation_mode,
              } as any)
            }
            label="Non consolidable"
            description="Le produit ne peut pas être regroupé avec d’autres articles."
            disabled={disabled}
          />

          <Toggle
            checked={Boolean((mode as any).protect_margin)}
            onChange={(value) =>
              updateMode(modeId, {
                protect_margin: value,
                non_consolidable: value
                  ? true
                  : (mode as any).non_consolidable,
                calculation_mode: value
                  ? 'mandatory_per_unit'
                  : mode.calculation_mode,
              } as any)
            }
            label="Protéger la marge"
            description="Utile si le bénéfice du produit se trouve aussi dans la livraison."
            disabled={disabled}
          />
        </div>

        <TextareaField
          label="Notes admin"
          value={(mode as any).notes ?? ''}
          onChange={(value) =>
            updateMode(modeId, { notes: value } as any)
          }
          placeholder="Ex : produit fragile, prévoir emballage renforcé."
          disabled={disabled}
        />
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Render                                                      */
  /* ---------------------------------------------------------- */

  return (
    <motion.div
      key="delivery"
      initial={
        prefersReducedMotion ? false : { opacity: 0, y: 10 }
      }
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.2,
      }}
      className="space-y-5"
    >
      {!hasPersistentDeliveryState && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />

          <div>
            <p className="font-medium">Mode local actif</p>

            <p className="mt-1 text-xs opacity-90">
              Le hook formulaire n’expose pas encore
              `setDeliveryConfig`. Tu peux configurer la livraison
              ici, mais pour enregistrer la configuration dans le
              produit, il faut utiliser la version mise à jour de
              `use-product-form-state.ts`.
            </p>
          </div>
        </div>
      )}

      {!rateOk && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />

          <div>
            <p className="font-medium">
              {rateLoading
                ? 'Chargement du taux USD/CDF…'
                : 'Taux USD/CDF indisponible'}
            </p>

            <p className="mt-1 text-xs opacity-90">
              Les frais saisis en USD restent la source principale.
              Le CDF affiché peut être une valeur legacy non
              recalculée tant que le taux n’est pas disponible.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { id: 'general', label: 'Général', icon: <Settings2 size={14} /> },
          { id: 'domicile', label: 'Domicile', icon: <Truck size={14} /> },
          {
            id: 'point_retrait',
            label: 'Point retrait',
            icon: <Package size={14} />,
          },
          { id: 'express', label: 'Express', icon: <Zap size={14} /> },
          {
            id: 'consolidation',
            label: 'Consolidation',
            icon: <Layers size={14} />,
          },
          { id: 'preview', label: 'Aperçu', icon: <Gauge size={14} /> },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id as any)}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500',
              tab === item.id
                ? 'border-gold-400 bg-gold-500/10 text-gold-700 dark:text-gold-300'
                : 'border-border bg-card text-muted-foreground hover:border-gold-400/40 hover:text-foreground'
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={config.enabled ? 'accent' : 'neutral'} size="sm">
          Livraison avancée :{' '}
          {config.enabled ? 'activée' : 'désactivée'}
        </Badge>

        <Badge variant="neutral" size="sm">
          {activeModes.length} mode(s) actif(s)
        </Badge>

        {nonConsolidableModes.length > 0 && (
          <Badge variant="warm" size="sm">
            {nonConsolidableModes.length} mode(s) non
            consolidable(s)
          </Badge>
        )}

        {consolidation.enabled && (
          <Badge variant="gold" size="sm">
            Consolidation panier activée
          </Badge>
        )}

        {rateOk ? (
          <Badge variant="accent" size="sm">
            1 USD ≈ {formatShippingMoney(rateNum, 'CDF')}
          </Badge>
        ) : (
          <Badge variant="danger" size="sm">
            Taux non disponible
          </Badge>
        )}
      </div>

      {/* TAB GENERAL */}
      {tab === 'general' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <h3 className="mb-4 font-semibold text-foreground">
              Activer la livraison intelligente
            </h3>

            <Toggle
              checked={Boolean(config.enabled)}
              onChange={(value) => updateConfig({ enabled: value })}
              label="Activer la configuration avancée de livraison"
              description="Si désactivé, l’ancien comportement legacy est utilisé comme fallback."
            />

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <TextField
                label="Label délai global"
                value={(config as any).global_delay_label ?? ''}
                onChange={(value) =>
                  updateConfig({
                    global_delay_label: value,
                  } as any)
                }
                placeholder="Ex : Expédié sous 24h ouvrées"
                disabled={!config.enabled}
              />

              <SelectField
                label="Groupe logistique principal"
                value={
                  (config.logistics as any)?.group || 'standard'
                }
                onChange={(value) =>
                  updateLogistics({
                    group: value as LogisticsGroup,
                  })
                }
                options={LOGISTICS_GROUPS.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                disabled={!config.enabled}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
              <Weight
                size={16}
                className="text-gold-500"
                aria-hidden="true"
              />
              Profil logistique du produit
            </h3>

            <div className="grid gap-4 md:grid-cols-4">
              <NumberField
                label="Poids (kg)"
                value={
                  (config.logistics as any)?.weight_kg ?? ''
                }
                onChange={(value) =>
                  updateLogistics({
                    weight_kg: parseOptionalMoney(value),
                  })
                }
                suffix="kg"
                disabled={!config.enabled}
              />

              <NumberField
                label="Longueur (cm)"
                value={
                  (config.logistics as any)?.length_cm ?? ''
                }
                onChange={(value) =>
                  updateLogistics({
                    length_cm: parseOptionalMoney(value),
                  })
                }
                suffix="cm"
                disabled={!config.enabled}
              />

              <NumberField
                label="Largeur (cm)"
                value={
                  (config.logistics as any)?.width_cm ?? ''
                }
                onChange={(value) =>
                  updateLogistics({
                    width_cm: parseOptionalMoney(value),
                  })
                }
                suffix="cm"
                disabled={!config.enabled}
              />

              <NumberField
                label="Hauteur (cm)"
                value={
                  (config.logistics as any)?.height_cm ?? ''
                }
                onChange={(value) =>
                  updateLogistics({
                    height_cm: parseOptionalMoney(value),
                  })
                }
                suffix="cm"
                disabled={!config.enabled}
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Toggle
                checked={Boolean(
                  (config.logistics as any)?.fragile
                )}
                onChange={(value) =>
                  updateLogistics({ fragile: value })
                }
                label="Fragile"
                disabled={!config.enabled}
              />

              <Toggle
                checked={Boolean(
                  (config.logistics as any)?.liquid
                )}
                onChange={(value) =>
                  updateLogistics({ liquid: value })
                }
                label="Liquide"
                disabled={!config.enabled}
              />

              <Toggle
                checked={Boolean(
                  (config.logistics as any)?.hazardous
                )}
                onChange={(value) =>
                  updateLogistics({ hazardous: value })
                }
                label="Sensible / dangereux"
                disabled={!config.enabled}
              />

              <Toggle
                checked={Boolean(
                  (config.logistics as any)?.bulky
                )}
                onChange={(value) =>
                  updateLogistics({ bulky: value })
                }
                label="Volumineux"
                disabled={!config.enabled}
              />

              <Toggle
                checked={Boolean(
                  (config.logistics as any)
                    ?.installation_required
                )}
                onChange={(value) =>
                  updateLogistics({
                    installation_required: value,
                  })
                }
                label="Installation requise"
                disabled={!config.enabled}
              />

              <Toggle
                checked={Boolean(
                  (config.logistics as any)?.requires_signature
                )}
                onChange={(value) =>
                  updateLogistics({
                    requires_signature: value,
                  })
                }
                label="Signature requise"
                disabled={!config.enabled}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
              <Sparkles
                size={16}
                className="text-gold-500"
                aria-hidden="true"
              />
              Presets de livraison
            </h3>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
              <select
                value={selectedPresetId}
                onChange={(e) =>
                  setSelectedPresetId(e.target.value)
                }
                className={inputBase}
                disabled={!config.enabled}
              >
                {DELIVERY_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} — {preset.description}
                  </option>
                ))}
              </select>

              <Button
                type="button"
                variant="outline-gold"
                size="sm"
                onClick={() => handleApplyPreset('domicile')}
                disabled={!config.enabled}
              >
                Appliquer domicile
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyPreset('all')}
                disabled={!config.enabled}
              >
                Appliquer tous modes
              </Button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Les presets critiques (lourd, installation, frais
              obligatoires) demandent une confirmation. Ils
              protègent la marge en empêchant la consolidation
              dangereuse.
            </p>
          </div>
        </div>
      )}

      {/* TAB DOMICILE */}
      {tab === 'domicile' && renderModeEditor('domicile')}

      {/* TAB POINT RETRAIT */}
      {tab === 'point_retrait' && renderModeEditor('point_retrait')}

      {/* TAB EXPRESS */}
      {tab === 'express' && renderModeEditor('express')}

      {/* TAB CONSOLIDATION */}
      {tab === 'consolidation' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <h3 className="mb-4 font-semibold text-foreground">
              Consolidation intelligente du panier
            </h3>

            <Toggle
              checked={Boolean(consolidation.enabled)}
              onChange={(value) =>
                updateConsolidation({ enabled: value })
              }
              label="Activer la consolidation intelligente"
              description="Regroupe les articles consolidables et réduit seulement ce qui peut être réduit."
              disabled={!config.enabled}
            />

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <NumberField
                label="Remise consolidation (%)"
                value={
                  (consolidation as any).discount_percent ?? 0
                }
                onChange={(value) =>
                  updateConsolidation({
                    discount_percent: parsePercent(value) ?? 0,
                  })
                }
                suffix="%"
                hint="Réduction appliquée sur la partie consolidable."
                disabled={!config.enabled || !consolidation.enabled}
              />

              <NumberField
                label="Remise inter-groupes (%)"
                value={
                  (consolidation as any)
                    .cross_group_discount_percent ?? 50
                }
                onChange={(value) =>
                  updateConsolidation({
                    cross_group_discount_percent:
                      parsePercent(value) ?? 50,
                  })
                }
                suffix="%"
                hint="Ex : électronique + hygiène dans un même colis."
                disabled={!config.enabled || !consolidation.enabled}
              />

              <NumberField
                label="Plafond livraison consolidable USD"
                value={
                  (consolidation as any).max_order_shipping_usd ??
                  ''
                }
                onChange={(value) =>
                  updateConsolidation({
                    max_order_shipping_usd:
                      parseOptionalMoney(value),
                  })
                }
                suffix="USD"
                hint="Ne s’applique jamais aux frais obligatoires."
                disabled={!config.enabled || !consolidation.enabled}
              />

              <NumberField
                label="Plancher livraison commande USD"
                value={
                  (consolidation as any).min_order_shipping_usd ??
                  ''
                }
                onChange={(value) =>
                  updateConsolidation({
                    min_order_shipping_usd:
                      parseOptionalMoney(value),
                  })
                }
                suffix="USD"
                hint="Évite une livraison symbolique trop basse."
                disabled={!config.enabled || !consolidation.enabled}
              />

              <NumberField
                label="Seuil livraison gratuite commande USD"
                value={
                  (consolidation as any)
                    .free_shipping_threshold_usd ?? ''
                }
                onChange={(value) =>
                  updateConsolidation({
                    free_shipping_threshold_usd:
                      parseOptionalMoney(value),
                  })
                }
                suffix="USD"
                hint="Appliquée seulement sur la partie consolidable."
                disabled={!config.enabled || !consolidation.enabled}
              />
            </div>

            <div className="mt-4 rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Info
                  size={14}
                  className="text-gold-500"
                  aria-hidden="true"
                />
                Règle de sécurité
              </p>

              <p className="mt-1">
                La livraison gratuite et le plafond de consolidation
                n’annulent jamais les frais obligatoires / non
                consolidables. Exemple : un réfrigérateur lourd garde
                toujours ses frais de manutention.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB PREVIEW */}
      {tab === 'preview' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
              <Gauge
                size={16}
                className="text-gold-500"
                aria-hidden="true"
              />
              Aperçu du calcul livraison
            </h3>

            <div className="grid gap-4 md:grid-cols-3">
              <SelectField
                label="Mode simulé"
                value={previewMode}
                onChange={(value) =>
                  setPreviewMode(value as DeliveryModeId)
                }
                options={DELIVERY_MODE_IDS.map((modeId) => ({
                  value: modeId,
                  label: getDeliveryModeLabel(modeId),
                }))}
              />

              <SelectField
                label="Quantité simulée"
                value={String(previewQuantity)}
                onChange={(value) =>
                  setPreviewQuantity(Number(value) || 1)
                }
                options={PREVIEW_QUANTITIES.map((qty) => ({
                  value: String(qty),
                  label: `${qty} article(s)`,
                }))}
              />

              <div className="flex items-end">
                <div className="w-full rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                  Prix produit USD simulé :{' '}
                  <span className="font-semibold text-foreground">
                    {formatShippingMoney(previewPriceUsd, 'USD')}
                  </span>

                  {previewPair.cdf > 0 && (
                    <span className="block text-[11px]">
                      ≈{' '}
                      {formatShippingMoney(previewPair.cdf, 'CDF')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card/60">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Quantité</th>
                  <th className="px-3 py-2 text-left">
                    Total livraison
                  </th>
                  <th className="px-3 py-2 text-left">CDF</th>
                  <th className="px-3 py-2 text-left">
                    Obligatoire
                  </th>
                  <th className="px-3 py-2 text-left">
                    Consolidable
                  </th>
                  <th className="px-3 py-2 text-left">Délai</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {previewRows.map((row) => {
                  const quote = row.estimate?.quote

                  return (
                    <tr
                      key={row.quantity}
                      className={cn(
                        'transition hover:bg-muted/30',
                        row.quantity === previewQuantity &&
                          'bg-gold-500/5'
                      )}
                    >
                      <td className="px-3 py-2 font-medium text-foreground">
                        {row.quantity}
                      </td>

                      <td className="px-3 py-2">
                        {!row.estimate?.available ? (
                          <span className="text-red-500">
                            Indisponible
                          </span>
                        ) : row.estimate.amount_usd > 0 ? (
                          <span className="font-semibold text-gold-600">
                            {formatShippingMoney(
                              row.estimate.amount_usd,
                              'USD'
                            )}
                          </span>
                        ) : (
                          <span className="text-emerald-600">
                            Gratuite
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-muted-foreground">
                        {row.estimate?.amount_cdf > 0
                          ? formatShippingMoney(
                              row.estimate.amount_cdf,
                              'CDF'
                            )
                          : '—'}
                      </td>

                      <td className="px-3 py-2 text-muted-foreground">
                        {quote
                          ? formatShippingMoney(
                              (quote as any).mandatory_usd ?? 0,
                              'USD'
                            )
                          : '—'}
                      </td>

                      <td className="px-3 py-2 text-muted-foreground">
                        {quote
                          ? formatShippingMoney(
                              (quote as any)
                                .consolidable_final_usd ?? 0,
                              'USD'
                            )
                          : '—'}
                      </td>

                      <td className="px-3 py-2 text-muted-foreground">
                        {quote?.delay_label || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selectedPreviewQuote && (
            <DeliveryBreakdown
              quote={selectedPreviewQuote}
              primaryCurrency="USD"
              defaultOpen
              showTitle
            />
          )}
        </div>
      )}
    </motion.div>
  )
}