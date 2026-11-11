// features/admin/produits/steps/VariantsStep.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  List,
  Palette,
  Plus,
  Ruler,
  Settings2,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import PhotoUpload from '@/components/PhotoUpload'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { useStepContext } from '../context/ProductFormContext'
import type {
  VariantAttributeConfig,
  VariantAttributeType,
  VariantConfig,
  VariantOption,
  VarianteAdvanced,
} from '../types'
import {
  formatCdf,
  formatUsd,
  num,
  positiveNum,
  slugify,
} from '../lib/product-utils'
import {
  buildVariantSummary,
  createDefaultVariantConfig,
  createVarianteFromCombination,
  generateCombinationsFromAttributes,
  getAvailableOptionResults,
  getEffectivePricing,
  getEffectiveStock,
  getMatchingVariant,
  getRecommendedSelectedAttributes,
  getVariantAttributeKeys,
  getVariantGallery,
  getVariantKey,
  hasCompleteSelection,
  isVariantPurchasable,
  normalizeVariantAttributes,
  normalizeVariantConfig,
  normalizeVariante,
  normalizeVariantes,
  sortVariantOptions,
  syncVariantesWithAttributes,
  validateAdvancedVariants,
} from '../lib/variant-utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const smallInputBase =
  'w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const ATTRIBUTE_TYPES: {
  value: VariantAttributeType
  label: string
  hint: string
}[] = [
  { value: 'text', label: 'Texte', hint: 'Attribut libre' },
  { value: 'size', label: 'Taille', hint: 'S, M, L, XL…' },
  { value: 'color', label: 'Couleur', hint: 'Rouge, Bleu, Noir…' },
  { value: 'image', label: 'Image', hint: 'Option avec photo' },
  { value: 'swatch', label: 'Pastille', hint: 'Couleur / matière visuelle' },
  { value: 'model', label: 'Modèle', hint: 'Modèle avec image' },
]

const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']

const COLOR_PRESETS = [
  { label: 'Noir', hex: '#111111' },
  { label: 'Blanc', hex: '#FFFFFF' },
  { label: 'Rouge', hex: '#D71920' },
  { label: 'Bleu', hex: '#1E40AF' },
  { label: 'Vert', hex: '#15803D' },
  { label: 'Jaune', hex: '#FACC15' },
  { label: 'Gris', hex: '#6B7280' },
  { label: 'Beige', hex: '#D6C7A1' },
  { label: 'Marron', hex: '#7C4A2D' },
  { label: 'Or', hex: '#D4AF37' },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `variant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function makeAttributeKey(
  label: string,
  existing: VariantAttributeConfig[]
): string {
  const base = slugify(label) || 'attribut'
  let key = base
  let index = 2

  while (existing.some((attribute) => attribute.key === key)) {
    key = `${base}-${index}`
    index += 1
  }

  return key
}

function varianteLabel(
  variante: VarianteAdvanced,
  attributeKeys: string[]
): string {
  const parts = attributeKeys
    .map((key) => variante.attributes?.[key])
    .filter(Boolean)

  return parts.length > 0 ? parts.join(' • ') : 'Variante sans attribut'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export default function VariantsStep() {
  const { form, rate: contextRate } = useStepContext()
  const f = form as any

  const { user } = useAuth()
  const toast = useToast()

  const rate = contextRate ?? f.rate ?? null
  const basePriceUsd = positiveNum(f.priceUsd ?? f.prix_usd) ?? 0
  const generalImages = Array.isArray(f.imageUrls)
    ? f.imageUrls.filter(Boolean).map(String)
    : []

  const uploadFolder = `${user?.id || 'admin'}/variantes`

  /* ---------------------------------------------------------- */
  /* Setters externes du hook                                    */
  /* ---------------------------------------------------------- */
  const setExternalVariantes =
    f.setVariantes ?? f.set_variantes ?? f.updateVariantes
  const setExternalAttributes =
    f.setVariantAttributes ??
    f.set_variant_attributes ??
    f.updateVariantAttributes
  const setExternalConfig =
    f.setVariantConfig ?? f.set_variant_config ?? f.updateVariantConfig

  const hasPersistentVariantState = Boolean(
    setExternalVariantes && setExternalAttributes && setExternalConfig
  )

  /* ---------------------------------------------------------- */
  /* Données initiales depuis le hook                            */
  /* ---------------------------------------------------------- */
  const initialAttributes = useMemo(
    () =>
      normalizeVariantAttributes(
        f.variantAttributes ?? f.variant_attributes ?? []
      ),
    [f.variantAttributes, f.variant_attributes]
  )

  const initialVariantes = useMemo(
    () =>
      normalizeVariantes(
        f.variantes ?? [],
        getVariantAttributeKeys(initialAttributes)
      ),
    [f.variantes, initialAttributes]
  )

  const initialConfig = useMemo(
    () =>
      normalizeVariantConfig(
        f.variantConfig ?? f.variant_config ?? createDefaultVariantConfig()
      ),
    [f.variantConfig, f.variant_config]
  )

  /* ---------------------------------------------------------- */
  /* États locaux                                */
  /* ---------------------------------------------------------- */
  const [attributes, setAttributesState] =
    useState<VariantAttributeConfig[]>(initialAttributes)

  const [variantes, setVariantesState] =
    useState<VarianteAdvanced[]>(initialVariantes)

  const [config, setConfigState] = useState<VariantConfig>(initialConfig)

  useEffect(() => {
    setAttributesState(initialAttributes)
  }, [initialAttributes])

  useEffect(() => {
    setVariantesState(initialVariantes)
  }, [initialVariantes])

  useEffect(() => {
    setConfigState(initialConfig)
  }, [initialConfig])

  /* ---------------------------------------------------------- */
  /* Commits                                                     */
  /* ---------------------------------------------------------- */
  const commitAttributes = useCallback(
    (next: VariantAttributeConfig[]) => {
      const normalized = normalizeVariantAttributes(next)
      setAttributesState(normalized)
      setExternalAttributes?.(normalized)
    },
    [setExternalAttributes]
  )

  const commitVariantes = useCallback(
    (next: VarianteAdvanced[]) => {
      const normalized = normalizeVariantes(
        next,
        getVariantAttributeKeys(attributes)
      )
      setVariantesState(normalized)
      setExternalVariantes?.(normalized)
    },
    [attributes, setExternalVariantes]
  )

  const commitConfig = useCallback(
    (next: VariantConfig) => {
      const normalized = normalizeVariantConfig(next)
      setConfigState(normalized)
      setExternalConfig?.(normalized)
    },
    [setExternalConfig]
  )

  /* ---------------------------------------------------------- */
  /* Développés                                                  */
  /* ---------------------------------------------------------- */
  const attributeKeys = useMemo(
    () => getVariantAttributeKeys(attributes, variantes),
    [attributes, variantes]
  )

  const combinations = useMemo(
    () => generateCombinationsFromAttributes(attributes),
    [attributes]
  )

  const existingKeys = useMemo(
    () =>
      new Set(
        variantes.map((variante) =>
          getVariantKey(variante.attributes || {}, attributeKeys)
        )
      ),
    [attributeKeys, variantes]
  )

  const missingCombinations = useMemo(
    () =>
      combinations.filter(
        (combination) =>
          !existingKeys.has(getVariantKey(combination, attributeKeys))
      ),
    [attributeKeys, combinations, existingKeys]
  )

  const validKeys = useMemo(
    () =>
      new Set(
        combinations.map((combination) =>
          getVariantKey(combination, attributeKeys)
        )
      ),
    [attributeKeys, combinations]
  )

  const obsoleteVariantes = useMemo(
    () =>
      variantes.filter(
        (variante) =>
          !validKeys.has(getVariantKey(variante.attributes || {}, attributeKeys))
      ),
    [attributeKeys, validKeys, variantes]
  )

  const summary = useMemo(
    () => buildVariantSummary({ attributes, variantes, config }),
    [attributes, config, variantes]
  )

  const validationErrors = useMemo(
    () => validateAdvancedVariants({ attributes, variantes, config }),
    [attributes, config, variantes]
  )

  /* ---------------------------------------------------------- */
  /* UI state                                                    */
  /* ---------------------------------------------------------- */
  const [tab, setTab] = useState<
    'attributes' | 'variants' | 'config' | 'preview'
  >('attributes')

  const [variantView, setVariantView] = useState<'mixed' | 'table' | 'cards'>(
    'mixed'
  )

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'available' | 'low' | 'out' | 'inactive'
  >('all')

  const [newAttributeLabel, setNewAttributeLabel] = useState('')
  const [newAttributeType, setNewAttributeType] =
    useState<VariantAttributeType>('text')

  const [previewSelection, setPreviewSelection] = useState<
    Record<string, string>
  >({})

  useEffect(() => {
    setPreviewSelection(
      getRecommendedSelectedAttributes({ variantes, attributes, config })
    )
  }, [attributes, config, variantes])

  /* ---------------------------------------------------------- */
  /* Filtrage variantes                                          */
  /* ---------------------------------------------------------- */
  const filteredVariantes = useMemo(() => {
    const term = search.trim().toLowerCase()

    return variantes.filter((variante) => {
      const label = varianteLabel(variante, attributeKeys).toLowerCase()
      const sku = String(variante.sku || '').toLowerCase()
      const barcode = String(variante.barcode || '').toLowerCase()

      const matchesSearch =
        !term ||
        label.includes(term) ||
        sku.includes(term) ||
        barcode.includes(term)

      if (!matchesSearch) return false

      const purchasable = isVariantPurchasable(variante, config)
      const stock = num(variante.stock) ?? 0

      if (statusFilter === 'available') return purchasable && stock > 0
      if (statusFilter === 'low')
        return purchasable && stock > 0 && stock <= config.lowStockThreshold
      if (statusFilter === 'out') return !purchasable || stock <= 0
      if (statusFilter === 'inactive') return variante.is_active === false

      return true
    })
  }, [attributeKeys, config, search, statusFilter, variantes])

  /* ---------------------------------------------------------- */
  /* Attributs                                                   */
  /* ---------------------------------------------------------- */
  const addAttribute = useCallback(() => {
    const label = newAttributeLabel.trim()

    if (!label) {
      toast.addToast({
        type: 'error',
        message: 'Donne un nom à l’attribut.',
      })
      return
    }

    const key = makeAttributeKey(label, attributes)

    const attribute: VariantAttributeConfig = {
      key,
      label,
      type: newAttributeType,
      required: true,
      options: [],
      sortOrder: attributes.length,
    }

    commitAttributes([...attributes, attribute])
    setNewAttributeLabel('')
    toast.addToast({
      type: 'success',
      message: `Attribut "${label}" ajouté.`,
    })
  }, [attributes, commitAttributes, newAttributeLabel, newAttributeType, toast])

  const updateAttribute = useCallback(
    (key: string, patch: Partial<VariantAttributeConfig>) => {
      commitAttributes(
        attributes.map((attribute) =>
          attribute.key === key ? { ...attribute, ...patch } : attribute
        )
      )
    },
    [attributes, commitAttributes]
  )

  const removeAttribute = useCallback(
    (key: string) => {
      if (attributes.length <= 1) {
        toast.addToast({
          type: 'error',
          message: 'Il faut au moins un attribut.',
        })
        return
      }

      const attribute = attributes.find((item) => item.key === key)
      const label = attribute?.label || key

      if (
        variantes.length > 0 &&
        typeof window !== 'undefined' &&
        !window.confirm(
          `Supprimer l’attribut "${label}" ? Les variantes existantes seront mises à jour.`
        )
      ) {
        return
      }

      commitAttributes(attributes.filter((item) => item.key !== key))

      commitVariantes(
        variantes.map((variante) => {
          const nextAttributes = { ...(variante.attributes || {}) }
          delete nextAttributes[key]
          return { ...variante, attributes: nextAttributes }
        })
      )

      toast.addToast({
        type: 'info',
        message: `Attribut "${label}" supprimé.`,
      })
    },
    [attributes, commitAttributes, commitVariantes, toast, variantes]
  )

  /* ---------------------------------------------------------- */
  /* Options                                                     */
  /* ---------------------------------------------------------- */
  const addOption = useCallback(
    (attributeKey: string) => {
      const attribute = attributes.find((item) => item.key === attributeKey)
      if (!attribute) return

      const value = `Option ${attribute.options.length + 1}`

      const option: VariantOption = {
        value,
        label: value,
        image: null,
        colorHex: attribute.type === 'color' ? '#CCCCCC' : null,
        sort: attribute.options.length,
        active: true,
      }

      updateAttribute(attributeKey, {
        options: [...attribute.options, option],
      })
    },
    [attributes, updateAttribute]
  )

  const updateOption = useCallback(
    (
      attributeKey: string,
      index: number,
      patch: Partial<VariantOption>
    ) => {
      const attribute = attributes.find((item) => item.key === attributeKey)
      if (!attribute) return

      const oldOption = attribute.options[index]
      if (!oldOption) return

      const nextOptions = attribute.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option
      )

      updateAttribute(attributeKey, { options: nextOptions })

      if (
        typeof patch.value === 'string' &&
        patch.value.trim() &&
        patch.value !== oldOption.value
      ) {
        commitVariantes(
          variantes.map((variante) =>
            variante.attributes?.[attributeKey] === oldOption.value
              ? {
                  ...variante,
                  attributes: {
                    ...(variante.attributes || {}),
                    [attributeKey]: patch.value,
                  },
                }
              : variante
          )
        )
      }
    },
    [attributes, commitVariantes, updateAttribute, variantes]
  )

  const removeOption = useCallback(
    (attributeKey: string, index: number) => {
      const attribute = attributes.find((item) => item.key === attributeKey)
      if (!attribute) return

      const option = attribute.options[index]
      if (!option) return

      updateAttribute(attributeKey, {
        options: attribute.options.filter((_, itemIndex) => itemIndex !== index),
      })

      toast.addToast({
        type: 'info',
        message: `Option "${option.label || option.value}" supprimée.`,
      })
    },
    [attributes, toast, updateAttribute]
  )

  const moveOption = useCallback(
    (attributeKey: string, index: number, direction: -1 | 1) => {
      const attribute = attributes.find((item) => item.key === attributeKey)
      if (!attribute) return

      const target = index + direction
      if (target < 0 || target >= attribute.options.length) return

      const next = [...attribute.options]
      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp

      updateAttribute(attributeKey, {
        options: next.map((option, optionIndex) => ({
          ...option,
          sort: optionIndex,
        })),
      })
    },
    [attributes, updateAttribute]
  )

  const addPresetOptions = useCallback(
    (attributeKey: string, presets: { label: string; hex?: string }[]) => {
      const attribute = attributes.find((item) => item.key === attributeKey)
      if (!attribute) return

      const existingValues = new Set(
        attribute.options.map((option) => option.value.toLowerCase())
      )

      const newOptions: VariantOption[] = presets
        .filter((preset) => !existingValues.has(preset.label.toLowerCase()))
        .map((preset, index) => ({
          value: preset.label,
          label: preset.label,
          image: null,
          colorHex: preset.hex || null,
          sort: attribute.options.length + index,
          active: true,
        }))

      if (newOptions.length === 0) {
        toast.addToast({
          type: 'info',
          message: 'Toutes les options existent déjà.',
        })
        return
      }

      updateAttribute(attributeKey, {
        options: [...attribute.options, ...newOptions],
      })

      toast.addToast({
        type: 'success',
        message: `${newOptions.length} option(s) ajoutée(s).`,
      })
    },
    [attributes, toast, updateAttribute]
  )

  /* ---------------------------------------------------------- */
  /* Combinaisons                                                */
  /* ---------------------------------------------------------- */
  const generateMissingCombinations = useCallback(() => {
    if (missingCombinations.length === 0) {
      toast.addToast({
        type: 'info',
        message: 'Aucune combinaison manquante.',
      })
      return
    }

    const created = missingCombinations.map((combination) =>
      createVarianteFromCombination(combination)
    )

    commitVariantes([...variantes, ...created])

    toast.addToast({
      type: 'success',
      message: `${created.length} variante(s) ajoutée(s).`,
    })
  }, [commitVariantes, missingCombinations, toast, variantes])

  const syncKeepObsolete = useCallback(() => {
    const result = syncVariantesWithAttributes(variantes, attributes, {
      keepExisting: true,
      removeObsolete: false,
    })

    commitVariantes(result.variantes)

    toast.addToast({
      type: 'success',
      message: 'Variantes synchronisées. Les obsolètes ont été conservées.',
    })
  }, [attributes, commitVariantes, toast, variantes])

  const syncRemoveObsolete = useCallback(() => {
    if (obsoleteVariantes.length === 0) {
      toast.addToast({
        type: 'info',
        message: 'Aucune variante obsolète.',
      })
      return
    }

    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `${obsoleteVariantes.length} variante(s) obsolète(s) seront supprimées. Continuer ?`
      )
    ) {
      return
    }

    const result = syncVariantesWithAttributes(variantes, attributes, {
      keepExisting: true,
      removeObsolete: true,
    })

    commitVariantes(result.variantes)

    toast.addToast({
      type: 'success',
      message: 'Variantes synchronisées et obsolètes supprimées.',
    })
  }, [
    attributes,
    commitVariantes,
    obsoleteVariantes.length,
    toast,
    variantes,
  ])

  const regenerateAllCombinations = useCallback(() => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Toutes les variantes actuelles seront remplacées par les combinaisons complètes. Continuer ?'
      )
    ) {
      return
    }

    const fresh = combinations.map((combination) =>
      createVarianteFromCombination(combination)
    )

    commitVariantes(fresh)

    toast.addToast({
      type: 'success',
      message: `${fresh.length} variante(s) régénérée(s).`,
    })
  }, [combinations, commitVariantes, toast])

  const clearAllVariantes = useCallback(() => {
    if (variantes.length === 0) return

    if (
      typeof window !== 'undefined' &&
      !window.confirm('Supprimer toutes les variantes ?')
    ) {
      return
    }

    commitVariantes([])
    toast.addToast({ type: 'info', message: 'Variantes supprimées.' })
  }, [commitVariantes, toast, variantes.length])

  /* ---------------------------------------------------------- */
  /* Variantes                                                   */
  /* ---------------------------------------------------------- */
  const addManualVariante = useCallback(() => {
    const emptyAttributes = attributeKeys.reduce<Record<string, string>>(
      (acc, key) => ({ ...acc, [key]: '' }),
      {}
    )

    const variante = normalizeVariante(
      {
        id: newId(),
        attributes: emptyAttributes,
        stock: 0,
        is_active: true,
        images: [],
        specs: {},
      },
      attributeKeys
    )

    commitVariantes([...variantes, variante])
    toast.addToast({ type: 'success', message: 'Variante ajoutée.' })
  }, [attributeKeys, commitVariantes, toast, variantes])

  const updateVariante = useCallback(
    (id: string, patch: Partial<VarianteAdvanced>) => {
      commitVariantes(
        variantes.map((variante) =>
          variante.id === id
            ? normalizeVariante(
                { ...variante, ...patch },
                attributeKeys
              )
            : variante
        )
      )
    },
    [attributeKeys, commitVariantes, variantes]
  )

  const updateVarianteAttribute = useCallback(
    (id: string, key: string, value: string) => {
      const variante = variantes.find((item) => item.id === id)
      if (!variante) return

      updateVariante(id, {
        attributes: {
          ...(variante.attributes || {}),
          [key]: value,
        },
      })
    },
    [updateVariante, variantes]
  )

  const removeVariante = useCallback(
    (id: string) => {
      commitVariantes(variantes.filter((variante) => variante.id !== id))
      if (expandedId === id) setExpandedId(null)
      toast.addToast({ type: 'info', message: 'Variante supprimée.' })
    },
    [commitVariantes, expandedId, toast, variantes]
  )

  const duplicateVariante = useCallback(
    (id: string) => {
      const source = variantes.find((variante) => variante.id === id)
      if (!source) return

      const copy = normalizeVariante(
        {
          ...source,
          id: newId(),
          is_default: false,
          attributes: { ...(source.attributes || {}) },
          images: [...(source.images || [])],
          specs: { ...(source.specs || {}) },
        },
        attributeKeys
      )

      commitVariantes([...variantes, copy])
      toast.addToast({ type: 'success', message: 'Variante dupliquée.' })
    },
    [attributeKeys, commitVariantes, toast, variantes]
  )

  const setDefaultVariante = useCallback(
    (id: string) => {
      commitVariantes(
        variantes.map((variante) => ({
          ...variante,
          is_default: variante.id === id,
        }))
      )
    },
    [commitVariantes, variantes]
  )

  const toggleVarianteActive = useCallback(
    (id: string) => {
      const variante = variantes.find((item) => item.id === id)
      if (!variante) return

      updateVariante(id, { is_active: variante.is_active === false })
    },
    [updateVariante, variantes]
  )

  /* ---------------------------------------------------------- */
  /* Images variante                                             */
  /* ---------------------------------------------------------- */
  const addVarianteImage = useCallback(
    (id: string, url: string) => {
      const variante = variantes.find((item) => item.id === id)
      if (!variante) return

      const images = [...(variante.images || []), url]

      updateVariante(id, {
        images,
        image: images[0] || null,
      })
    },
    [updateVariante, variantes]
  )

  const removeVarianteImage = useCallback(
    (id: string, index: number) => {
      const variante = variantes.find((item) => item.id === id)
      if (!variante) return

      const images = (variante.images || []).filter(
        (_, itemIndex) => itemIndex !== index
      )

      updateVariante(id, {
        images,
        image: images[0] || null,
      })
    },
    [updateVariante, variantes]
  )

  const moveVarianteImage = useCallback(
    (id: string, index: number, direction: -1 | 1) => {
      const variante = variantes.find((item) => item.id === id)
      if (!variante) return

      const images = [...(variante.images || [])]
      const target = index + direction

      if (target < 0 || target >= images.length) return

      const tmp = images[index]
      images[index] = images[target]
      images[target] = tmp

      updateVariante(id, {
        images,
        image: images[0] || null,
      })
    },
    [updateVariante, variantes]
  )

  const setVariantePrimaryImage = useCallback(
    (id: string, index: number) => {
      const variante = variantes.find((item) => item.id === id)
      if (!variante) return

      const images = [...(variante.images || [])]
      const [image] = images.splice(index, 1)
      images.unshift(image)

      updateVariante(id, {
        images,
        image: images[0] || null,
      })
    },
    [updateVariante, variantes]
  )

  /* ---------------------------------------------------------- */
  /* Specs variante                                              */
  /* ---------------------------------------------------------- */
  const addVarianteSpec = useCallback(
    (id: string) => {
      const variante = variantes.find((item) => item.id === id)
      if (!variante) return

      const currentSpecs = variante.specs || {}
      const key = `Spec ${Object.keys(currentSpecs).length + 1}`

      updateVariante(id, {
        specs: { ...currentSpecs, [key]: '' },
      })
    },
    [updateVariante, variantes]
  )

  const updateVarianteSpec = useCallback(
    (
      id: string,
      oldKey: string,
      patch: { key?: string; value?: string }
    ) => {
      const variante = variantes.find((item) => item.id === id)
      if (!variante) return

      const currentSpecs = { ...(variante.specs || {}) }
      const oldValue = currentSpecs[oldKey] ?? ''

      delete currentSpecs[oldKey]

      const nextKey =
        typeof patch.key === 'string' && patch.key.trim()
          ? patch.key.trim()
          : oldKey

      const nextValue =
        typeof patch.value === 'string' ? patch.value : oldValue

      currentSpecs[nextKey] = nextValue

      updateVariante(id, { specs: currentSpecs })
    },
    [updateVariante, variantes]
  )

  const removeVarianteSpec = useCallback(
    (id: string, key: string) => {
      const variante = variantes.find((item) => item.id === id)
      if (!variante) return

      const currentSpecs = { ...(variante.specs || {}) }
      delete currentSpecs[key]

      updateVariante(id, { specs: currentSpecs })
    },
    [updateVariante, variantes]
  )

  /* ---------------------------------------------------------- */
  /* Config                                                      */
  /* ---------------------------------------------------------- */
  const updateConfig = useCallback(
    (patch: Partial<VariantConfig>) => {
      commitConfig({ ...config, ...patch })
    },
    [commitConfig, config]
  )

  /* ---------------------------------------------------------- */
  /* Preview                                                     */
  /* ---------------------------------------------------------- */
  const previewVariant = useMemo(
    () =>
      getMatchingVariant({
        variantes,
        selectedAttributes: previewSelection,
        attributeKeys,
      }),
    [attributeKeys, previewSelection, variantes]
  )

  const previewComplete = useMemo(
    () =>
      hasCompleteSelection({
        selectedAttributes: previewSelection,
        attributes,
      }),
    [attributes, previewSelection]
  )

  const previewPricing = useMemo(
    () =>
      getEffectivePricing({
        product: {
          prix_usd: basePriceUsd,
          prix: basePriceUsd && rate ? Math.round(basePriceUsd * rate) : null,
          prix_original_usd: null,
          prix_original: null,
          remise_percent: num(f.remise_percent) ?? 0,
        },
        variante: previewVariant,
        rate,
      }),
    [basePriceUsd, f.remise_percent, previewVariant, rate]
  )

  const previewStock = useMemo(
    () =>
      getEffectiveStock({
        product: { stock: num(f.stock) },
        variante: previewVariant,
        variantes,
        config,
      }),
    [config, f.stock, previewVariant, variantes]
  )

  const previewGallery = useMemo(
    () =>
      getVariantGallery({
        product: { images: generalImages },
        selectedVariant: previewVariant,
        config,
      }),
    [config, generalImages, previewVariant]
  )

  const getPreviewOptionResults = useCallback(
    (attributeKey: string) =>
      getAvailableOptionResults({
        attributeKey,
        selectedAttributes: previewSelection,
        variantes,
        attributes,
        config,
      }),
    [attributes, config, previewSelection, variantes]
  )

  const selectPreviewOption = useCallback((key: string, value: string) => {
    setPreviewSelection((prev) => {
      const next = { ...prev }

      if (next[key] === value) {
        delete next[key]
      } else {
        next[key] = value
      }

      return next
    })
  }, [])

  /* ---------------------------------------------------------- */
  /* Rendu détails variante                                      */
  /* ---------------------------------------------------------- */
  const renderVariantDetails = (variante: VarianteAdvanced) => {
    const images = variante.images || []
    const specsEntries = Object.entries(variante.specs || {})

    return (
      <div className="space-y-5 rounded-2xl border border-border bg-background/60 p-4">
        {/* Images */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Images de la variante ({images.length})
            </h4>
            <span className="text-xs text-muted-foreground">
              Première image = image principale / mini photo
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <AnimatePresence>
              {images.map((image, index) => (
                <motion.div
                  key={`${image}-${index}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    'group relative aspect-square overflow-hidden rounded-xl border-2',
                    index === 0
                      ? 'border-gold-400 ring-2 ring-gold-400/30'
                      : 'border-border'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt=""
                    className="h-full w-full object-cover"
                  />

                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setVariantePrimaryImage(variante.id, index)}
                      className="rounded-full bg-white/90 p-1.5"
                      title="Image principale"
                    >
                      <CheckCircle2
                        size={14}
                        className={
                          index === 0 ? 'text-gold-500' : 'text-neutral-500'
                        }
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        moveVarianteImage(variante.id, index, -1)
                      }
                      disabled={index === 0}
                      className="rounded-full bg-white/90 p-1.5 disabled:opacity-40"
                      title="Monter"
                    >
                      <ChevronUp size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        moveVarianteImage(variante.id, index, 1)
                      }
                      disabled={index === images.length - 1}
                      className="rounded-full bg-white/90 p-1.5 disabled:opacity-40"
                      title="Descendre"
                    >
                      <ChevronDown size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => removeVarianteImage(variante.id, index)}
                      className="rounded-full bg-white/90 p-1.5"
                      title="Supprimer"
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </div>

                  {index === 0 && (
                    <Badge
                      variant="gold"
                      size="sm"
                      className="absolute left-2 top-2"
                    >
                      Principale
                    </Badge>
                  )}
                </motion.div>
              ))}

              <div className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-gold-400/30 bg-muted/30">
                <PhotoUpload
                  onUpload={(url) => addVarianteImage(variante.id, url)}
                  bucket="photos-produits"
                  folder={uploadFolder}
                  label="Ajouter"
                  aspectRatio="square"
                  size="sm"
                />
              </div>
            </AnimatePresence>
          </div>
        </div>

        {/* Champs avancés */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Code-barres variante
            </span>
            <input
              value={variante.barcode || ''}
              onChange={(e) =>
                updateVariante(variante.id, { barcode: e.target.value })
              }
              placeholder="Optionnel"
              className={smallInputBase}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Notes internes variante
            </span>
            <input
              value={variante.notes || ''}
              onChange={(e) =>
                updateVariante(variante.id, { notes: e.target.value })
              }
              placeholder="Optionnel"
              className={smallInputBase}
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Poids (kg)
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={variante.poids_kg ?? ''}
              onChange={(e) =>
                updateVariante(variante.id, {
                  poids_kg: num(e.target.value),
                })
              }
              className={smallInputBase}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Longueur (cm)
            </span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={variante.longueur_cm ?? ''}
              onChange={(e) =>
                updateVariante(variante.id, {
                  longueur_cm: num(e.target.value),
                })
              }
              className={smallInputBase}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Largeur (cm)
            </span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={variante.largeur_cm ?? ''}
              onChange={(e) =>
                updateVariante(variante.id, {
                  largeur_cm: num(e.target.value),
                })
              }
              className={smallInputBase}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Hauteur (cm)
            </span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={variante.hauteur_cm ?? ''}
              onChange={(e) =>
                updateVariante(variante.id, {
                  hauteur_cm: num(e.target.value),
                })
              }
              className={smallInputBase}
            />
          </label>
        </div>

        {/* Specs variante */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Spécifiques de la variante
            </h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addVarianteSpec(variante.id)}
              leftIcon={<Plus size={14} />}
            >
              Ajouter
            </Button>
          </div>

          {specsEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune spécifique. Utile pour matière, finition, garantie, etc.
            </p>
          ) : (
            <div className="space-y-2">
              {specsEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="grid gap-2 rounded-lg border border-border p-2 md:grid-cols-[1fr_1fr_auto]"
                >
                  <input
                    value={key}
                    onChange={(e) =>
                      updateVarianteSpec(variante.id, key, {
                        key: e.target.value,
                      })
                    }
                    placeholder="Clé"
                    className={smallInputBase}
                  />
                  <input
                    value={value}
                    onChange={(e) =>
                      updateVarianteSpec(variante.id, key, {
                        value: e.target.value,
                      })
                    }
                    placeholder="Valeur"
                    className={smallInputBase}
                  />
                  <button
                    type="button"
                    onClick={() => removeVarianteSpec(variante.id, key)}
                    className="p-1 text-red-500 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu ligne variante                                        */
  /* ---------------------------------------------------------- */
  const renderVarianteRow = (variante: VarianteAdvanced) => {
    const purchasable = isVariantPurchasable(variante, config)
    const stock = num(variante.stock) ?? 0
    const isExpanded = expandedId === variante.id
    const variantPricing = getEffectivePricing({
      product: {
        prix_usd: basePriceUsd,
        prix: basePriceUsd && rate ? Math.round(basePriceUsd * rate) : null,
      },
      variante,
      rate,
    })

    return (
      <>
        <tr
          key={variante.id}
          className={cn(
            'border-b border-border transition hover:bg-muted/30',
            variante.is_default && 'bg-gold-500/5',
            variante.is_active === false && 'opacity-60'
          )}
        >
          <td className="px-3 py-2">
            <button
              type="button"
              onClick={() => setDefaultVariante(variante.id)}
              className={cn(
                'inline-flex h-5 w-5 items-center justify-center rounded-full border transition',
                variante.is_default
                  ? 'border-gold-500 bg-gold-500 text-white'
                  : 'border-border bg-card text-transparent hover:border-gold-400'
              )}
              title="Variante par défaut"
            >
              <CheckCircle2 size={12} />
            </button>
          </td>

          <td className="px-3 py-2">
            <button
              type="button"
              onClick={() => toggleVarianteActive(variante.id)}
              className={cn(
                'inline-flex h-5 w-9 items-center rounded-full transition',
                variante.is_active !== false ? 'bg-emerald-500' : 'bg-muted'
              )}
              title={variante.is_active !== false ? 'Active' : 'Inactive'}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition',
                  variante.is_active !== false
                    ? 'translate-x-4'
                    : 'translate-x-1'
                )}
              />
            </button>
          </td>

          <td className="px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {attributeKeys.map((key) => (
                <input
                  key={key}
                  value={variante.attributes?.[key] || ''}
                  onChange={(e) =>
                    updateVarianteAttribute(
                      variante.id,
                      key,
                      e.target.value
                    )
                  }
                  placeholder={key}
                  className={cn(smallInputBase, 'w-24')}
                />
              ))}
            </div>
          </td>

          <td className="px-3 py-2">
            <input
              type="number"
              min="0"
              value={stock}
              onChange={(e) =>
                updateVariante(variante.id, {
                  stock: num(e.target.value) ?? 0,
                })
              }
              className={cn(smallInputBase, 'w-20')}
            />
          </td>

          <td className="px-3 py-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={variante.prix_specifique_usd ?? ''}
              onChange={(e) => {
                const value = num(e.target.value)
                updateVariante(variante.id, {
                  prix_specifique_usd: value && value > 0 ? value : null,
                  prix_specifique_cdf:
                    value && value > 0 && rate
                      ? Math.round(value * rate)
                      : null,
                })
              }}
              placeholder="—"
              className={cn(smallInputBase, 'w-24')}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {variantPricing.prixCdf > 0
                ? formatCdf(variantPricing.prixCdf)
                : 'Prix produit'}
            </p>
          </td>

          <td className="px-3 py-2">
            <input
              value={variante.sku || ''}
              onChange={(e) =>
                updateVariante(variante.id, { sku: e.target.value })
              }
              placeholder="SKU"
              className={cn(smallInputBase, 'w-28')}
            />
          </td>

          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              {(variante.images || []).length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(variante.images || [])[0]}
                  alt=""
                  className="h-8 w-8 rounded-lg border border-border object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}

              <Badge
                variant={purchasable ? 'accent' : 'neutral'}
                size="sm"
              >
                {(variante.images || []).length}
              </Badge>
            </div>
          </td>

          <td className="px-3 py-2">
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() =>
                  setExpandedId(isExpanded ? null : variante.id)
                }
                className="p-1 text-muted-foreground hover:text-foreground"
                title={isExpanded ? 'Réduire' : 'Détails'}
              >
                {isExpanded ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>

              <button
                type="button"
                onClick={() => duplicateVariante(variante.id)}
                className="p-1 text-muted-foreground hover:text-gold-500"
                title="Dupliquer"
              >
                <Copy size={14} />
              </button>

              <button
                type="button"
                onClick={() => removeVariante(variante.id)}
                className="p-1 text-muted-foreground hover:text-red-500"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </td>
        </tr>

        {isExpanded && (
          <tr>
            <td colSpan={9} className="bg-muted/20 px-3 py-3">
              {renderVariantDetails(variante)}
            </td>
          </tr>
        )}
      </>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu carte variante                                        */
  /* ---------------------------------------------------------- */
  const renderVarianteCard = (variante: VarianteAdvanced) => {
    const purchasable = isVariantPurchasable(variante, config)
    const stock = num(variante.stock) ?? 0
    const isExpanded = expandedId === variante.id
    const variantPricing = getEffectivePricing({
      product: {
        prix_usd: basePriceUsd,
        prix: basePriceUsd && rate ? Math.round(basePriceUsd * rate) : null,
      },
      variante,
      rate,
    })

    return (
      <motion.div
        key={variante.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'rounded-2xl border bg-card p-4',
          variante.is_default
            ? 'border-gold-400 ring-1 ring-gold-400/30'
            : 'border-border',
          variante.is_active === false && 'opacity-60'
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground">
              {varianteLabel(variante, attributeKeys) || 'Variante sans nom'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant={purchasable ? 'accent' : 'neutral'}
                size="sm"
              >
                {purchasable ? 'Disponible' : 'Indisponible'}
              </Badge>
              {variante.is_default && (
                <Badge variant="gold" size="sm">
                  Défaut
                </Badge>
              )}
              {variante.is_active === false && (
                <Badge variant="warm" size="sm">
                  Inactive
                </Badge>
              )}
              <span>Stock : {stock}</span>
              <span>
                Prix :{' '}
                {variantPricing.prixUsd > 0
                  ? formatUsd(variantPricing.prixUsd)
                  : '—'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDefaultVariante(variante.id)}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full border transition',
                variante.is_default
                  ? 'border-gold-500 bg-gold-500 text-white'
                  : 'border-border bg-card text-muted-foreground hover:border-gold-400'
              )}
              title="Variante par défaut"
            >
              <CheckCircle2 size={14} />
            </button>

            <button
              type="button"
              onClick={() => toggleVarianteActive(variante.id)}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full border transition',
                variante.is_active !== false
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                  : 'border-border bg-muted text-muted-foreground'
              )}
              title={variante.is_active !== false ? 'Active' : 'Inactive'}
            >
              {variante.is_active !== false ? (
                <CheckCircle2 size={14} />
              ) : (
                <X size={14} />
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                setExpandedId(isExpanded ? null : variante.id)
              }
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <button
              type="button"
              onClick={() => duplicateVariante(variante.id)}
              className="p-1 text-muted-foreground hover:text-gold-500"
            >
              <Copy size={14} />
            </button>

            <button
              type="button"
              onClick={() => removeVariante(variante.id)}
              className="p-1 text-muted-foreground hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {attributeKeys.map((key) => (
            <label key={key} className="block space-y-1">
              <span className="text-xs text-muted-foreground">{key}</span>
              <input
                value={variante.attributes?.[key] || ''}
                onChange={(e) =>
                  updateVarianteAttribute(variante.id, key, e.target.value)
                }
                placeholder={key}
                className={smallInputBase}
              />
            </label>
          ))}

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Stock</span>
            <input
              type="number"
              min="0"
              value={stock}
              onChange={(e) =>
                updateVariante(variante.id, {
                  stock: num(e.target.value) ?? 0,
                })
              }
              className={smallInputBase}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">
              Prix spécifique USD
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={variante.prix_specifique_usd ?? ''}
              onChange={(e) => {
                const value = num(e.target.value)
                updateVariante(variante.id, {
                  prix_specifique_usd: value && value > 0 ? value : null,
                  prix_specifique_cdf:
                    value && value > 0 && rate
                      ? Math.round(value * rate)
                      : null,
                })
              }}
              placeholder="Optionnel"
              className={smallInputBase}
            />
            <span className="block text-[10px] text-muted-foreground">
              {variantPricing.prixCdf > 0
                ? formatCdf(variantPricing.prixCdf)
                : 'Hérité du prix produit'}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">SKU</span>
            <input
              value={variante.sku || ''}
              onChange={(e) =>
                updateVariante(variante.id, { sku: e.target.value })
              }
              placeholder="Optionnel"
              className={smallInputBase}
            />
          </label>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              {renderVariantDetails(variante)}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu option attribut                                       */
  /* ---------------------------------------------------------- */
  const renderAttributeOptions = (attribute: VariantAttributeConfig) => {
    const sortedOptions = sortVariantOptions(attribute.options)

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            Options ({attribute.options.length})
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addOption(attribute.key)}
              leftIcon={<Plus size={14} />}
            >
              Ajouter
            </Button>

            {attribute.type === 'size' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  addPresetOptions(
                    attribute.key,
                    SIZE_PRESETS.map((size) => ({ label: size }))
                  )
                }
              >
                Tailles courantes
              </Button>
            )}

            {(attribute.type === 'color' || attribute.type === 'swatch') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => addPresetOptions(attribute.key, COLOR_PRESETS)}
                leftIcon={<Palette size={14} />}
              >
                Couleurs courantes
              </Button>
            )}
          </div>
        </div>

        {sortedOptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Aucune option. Ajoute-en une ou utilise les raccourcis.
          </p>
        ) : (
          <div className="space-y-2">
            {sortedOptions.map((option, index) => {
              const originalIndex = attribute.options.findIndex(
                (item) => item.value === option.value
              )

              return (
                <div
                  key={`${option.value}-${index}`}
                  className="grid gap-2 rounded-xl border border-border bg-background/60 p-3 md:grid-cols-[auto_1fr_1fr_auto_auto_auto]"
                >
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        moveOption(attribute.key, originalIndex, -1)
                      }
                      disabled={index === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        moveOption(attribute.key, originalIndex, 1)
                      }
                      disabled={index === sortedOptions.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  <input
                    value={option.value}
                    onChange={(e) =>
                      updateOption(attribute.key, originalIndex, {
                        value: e.target.value,
                      })
                    }
                    placeholder="Valeur"
                    className={smallInputBase}
                  />

                  <input
                    value={option.label || ''}
                    onChange={(e) =>
                      updateOption(attribute.key, originalIndex, {
                        label: e.target.value,
                      })
                    }
                    placeholder="Label affiché"
                    className={smallInputBase}
                  />

                  <div className="flex items-center gap-2">
                    {option.image ? (
                      <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={option.image}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateOption(attribute.key, originalIndex, {
                              image: null,
                            })
                          }
                          className="absolute right-0 top-0 rounded-bl bg-red-500 p-0.5 text-white"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-lg border border-dashed border-border" />
                    )}

                    <PhotoUpload
                      onUpload={(url) =>
                        updateOption(attribute.key, originalIndex, {
                          image: url,
                        })
                      }
                      bucket="photos-produits"
                      folder={uploadFolder}
                      label="Mini"
                      aspectRatio="square"
                      size="sm"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={option.colorHex || '#CCCCCC'}
                      onChange={(e) =>
                        updateOption(attribute.key, originalIndex, {
                          colorHex: e.target.value.toUpperCase(),
                        })
                      }
                      className="h-8 w-8 cursor-pointer rounded border border-border bg-card"
                    />
                    <input
                      value={option.colorHex || ''}
                      onChange={(e) =>
                        updateOption(attribute.key, originalIndex, {
                          colorHex: e.target.value,
                        })
                      }
                      placeholder="#Hex"
                      className={cn(smallInputBase, 'w-20')}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={option.active !== false}
                        onChange={(e) =>
                          updateOption(attribute.key, originalIndex, {
                            active: e.target.checked,
                          })
                        }
                        className="rounded text-gold-500 focus:ring-gold-500"
                      />
                      Active
                    </label>

                    <button
                      type="button"
                      onClick={() => removeOption(attribute.key, originalIndex)}
                      className="p-1 text-red-500 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu preview option                                        */
  /* ---------------------------------------------------------- */
  const renderPreviewOptionButton = (
    attribute: VariantAttributeConfig,
    result: ReturnType<typeof getAvailableOptionResults>[number]
  ) => {
    const { option, available, disabled, hidden } = result

    if (hidden) return null

    const selected = previewSelection[attribute.key] === option.value

    const showImage =
      config.showMiniPhotos && option.image && attribute.type !== 'size'

    const showSwatch =
      config.showColorSwatches &&
      option.colorHex &&
      (attribute.type === 'color' || attribute.type === 'swatch')

    return (
      <button
        key={option.value}
        type="button"
        disabled={disabled}
        onClick={() => selectPreviewOption(attribute.key, option.value)}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-gold-500',
          selected
            ? 'border-gold-500 bg-gold-500/10 text-gold-700 dark:text-gold-300'
            : available
            ? 'border-border bg-card text-foreground hover:border-gold-400/50'
            : 'cursor-not-allowed border-border bg-muted text-muted-foreground opacity-60',
          disabled && 'line-through'
        )}
        aria-pressed={selected}
      >
        {showSwatch && (
          <span
            className="h-4 w-4 rounded-full border border-border"
            style={{ backgroundColor: option.colorHex || '#ccc' }}
          />
        )}

        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={option.image || ''}
            alt=""
            className="h-6 w-6 rounded-lg object-cover"
          />
        )}

        <span>{option.label || option.value}</span>
      </button>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */
  return (
    <motion.div
      key="variants"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-5"
    >
      {!hasPersistentVariantState && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Mode local actif</p>
            <p className="mt-1 text-xs opacity-90">
              Le hook formulaire n’expose pas encore les setters avancés
              (`setVariantes`, `setVariantAttributes`, `setVariantConfig`).
              Tu peux configurer les variantes ici, mais pour les enregistrer
              dans le produit, il faudra mettre à jour
              `use-product-form-state.ts`.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { id: 'attributes', label: 'Attributs', icon: <Layers size={14} /> },
          { id: 'variants', label: 'Variantes', icon: <Grid3X3 size={14} /> },
          { id: 'config', label: 'Config', icon: <Settings2 size={14} /> },
          { id: 'preview', label: 'Aperçu', icon: <Eye size={14} /> },
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
        <Badge variant="neutral" size="sm">
          {summary.attributesCount} attribut(s)
        </Badge>
        <Badge variant="neutral" size="sm">
          {summary.variantesCount} variante(s)
        </Badge>
        <Badge variant="accent" size="sm">
          {summary.purchasableVariantesCount} disponible(s)
        </Badge>
        <Badge variant="gold" size="sm">
          Stock total : {summary.totalStock}
        </Badge>
        {summary.hasDefaultVariant && (
          <Badge variant="gold" size="sm">
            Variante par défaut définie
          </Badge>
        )}
        {missingCombinations.length > 0 && (
          <Badge variant="warm" size="sm">
            {missingCombinations.length} combinaison(s) manquante(s)
          </Badge>
        )}
        {obsoleteVariantes.length > 0 && (
          <Badge variant="danger" size="sm">
            {obsoleteVariantes.length} variante(s) obsolète(s)
          </Badge>
        )}
      </div>

      {validationErrors.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          <p className="flex items-center gap-2 font-medium">
            <AlertCircle size={16} />
            Points à corriger
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* TAB ATTRIBUTS */}
      {tab === 'attributes' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <h3 className="mb-3 font-semibold text-foreground">
              Ajouter un attribut
            </h3>

            <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <input
                value={newAttributeLabel}
                onChange={(e) => setNewAttributeLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addAttribute()
                  }
                }}
                placeholder="Nom de l’attribut (ex : Couleur, Taille, Modèle)"
                className={inputBase}
              />

              <select
                value={newAttributeType}
                onChange={(e) =>
                  setNewAttributeType(e.target.value as VariantAttributeType)
                }
                className={inputBase}
              >
                {ATTRIBUTE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label} — {type.hint}
                  </option>
                ))}
              </select>

              <Button
                type="button"
                variant="luxe"
                onClick={addAttribute}
                leftIcon={<Plus size={14} />}
              >
                Ajouter
              </Button>
            </div>
          </div>

          <AnimatePresence>
            {attributes.map((attribute) => (
              <motion.div
                key={attribute.key}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden rounded-2xl border border-border bg-card/60 p-4"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {attribute.label}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Clé : {attribute.key} • Type : {attribute.type}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={attribute.required !== false}
                        onChange={(e) =>
                          updateAttribute(attribute.key, {
                            required: e.target.checked,
                          })
                        }
                        className="rounded text-gold-500 focus:ring-gold-500"
                      />
                      Obligatoire
                    </label>

                    <select
                      value={attribute.type}
                      onChange={(e) =>
                        updateAttribute(attribute.key, {
                          type: e.target.value as VariantAttributeType,
                        })
                      }
                      className={cn(smallInputBase, 'w-32')}
                    >
                      {ATTRIBUTE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => removeAttribute(attribute.key)}
                      className="p-1 text-red-500 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <label className="mb-4 block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Label affiché
                  </span>
                  <input
                    value={attribute.label}
                    onChange={(e) =>
                      updateAttribute(attribute.key, {
                        label: e.target.value,
                      })
                    }
                    className={smallInputBase}
                  />
                </label>

                {renderAttributeOptions(attribute)}
              </motion.div>
            ))}
          </AnimatePresence>

          {attributes.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Aucun attribut. Ajoute-en un pour commencer.
            </p>
          )}

          <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
            <h4 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
              <Zap size={16} className="text-gold-500" />
              Génération des combinaisons
            </h4>

            <p className="mb-3 text-sm text-muted-foreground">
              Combinaisons théoriques : {combinations.length} • Manquantes :{' '}
              {missingCombinations.length} • Obsolètes :{' '}
              {obsoleteVariantes.length}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="luxe"
                size="sm"
                onClick={generateMissingCombinations}
                disabled={missingCombinations.length === 0}
                leftIcon={<Sparkles size={14} />}
              >
                Générer manquantes
              </Button>

              <Button
                type="button"
                variant="outline-gold"
                size="sm"
                onClick={syncKeepObsolete}
              >
                Synchroniser sans supprimer
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={syncRemoveObsolete}
                disabled={obsoleteVariantes.length === 0}
              >
                Synchroniser + supprimer obsolètes
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={regenerateAllCombinations}
              >
                Régénérer tout
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-500 hover:bg-red-500/10"
                onClick={clearAllVariantes}
                disabled={variantes.length === 0}
                leftIcon={<Trash2 size={14} />}
              >
                Vider les variantes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB VARIANTES */}
      {tab === 'variants' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher SKU, couleur, taille…"
                className={cn(inputBase, 'h-10 w-64 py-2')}
              />

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as any)
                }
                className={cn(inputBase, 'h-10 w-44 py-2')}
              >
                <option value="all">Toutes</option>
                <option value="available">Disponibles</option>
                <option value="low">Stock faible</option>
                <option value="out">Indisponibles</option>
                <option value="inactive">Inactives</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-border bg-card p-0.5 text-xs">
                {[
                  { id: 'mixed', label: 'Mixte', icon: <Rows3 size={14} /> },
                  { id: 'table', label: 'Tableau', icon: <List size={14} /> },
                  { id: 'cards', label: 'Cartes', icon: <Grid3X3 size={14} /> },
                ].map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setVariantView(view.id as any)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium transition',
                      variantView === view.id
                        ? 'bg-gold-500 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {view.icon}
                    {view.label}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="outline-gold"
                size="sm"
                onClick={addManualVariante}
                leftIcon={<Plus size={14} />}
              >
                Variante manuelle
              </Button>
            </div>
          </div>

          {filteredVariantes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Aucune variante à afficher. Génère les combinaisons depuis
              l’onglet Attributs ou ajoute une variante manuelle.
            </p>
          ) : variantView === 'cards' ? (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredVariantes.map((variante) =>
                renderVarianteCard(variante)
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card/60">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Défaut</th>
                    <th className="px-3 py-2 text-left">Active</th>
                    <th className="px-3 py-2 text-left">Attributs</th>
                    <th className="px-3 py-2 text-left">Stock</th>
                    <th className="px-3 py-2 text-left">Prix USD</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Images</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredVariantes.map((variante) =>
                    renderVarianteRow(variante)
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONFIG */}
      {tab === 'config' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <h3 className="mb-4 font-semibold text-foreground">
              Comportement client des variantes
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">
                  Mode d’affichage
                </span>
                <select
                  value={config.displayMode}
                  onChange={(e) =>
                    updateConfig({
                      displayMode: e.target.value as VariantConfig['displayMode'],
                    })
                  }
                  className={inputBase}
                >
                  <option value="swatches">Pastilles / mini photos</option>
                  <option value="buttons">Boutons texte</option>
                  <option value="dropdown">Menu déroulant</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">
                  Stratégie de galerie
                </span>
                <select
                  value={config.galleryStrategy}
                  onChange={(e) =>
                    updateConfig({
                      galleryStrategy: e.target
                        .value as VariantConfig['galleryStrategy'],
                    })
                  }
                  className={inputBase}
                >
                  <option value="variant_first">
                    Images variante en priorité
                  </option>
                  <option value="general_first">
                    Images générales en priorité
                  </option>
                  <option value="variant_only">
                    Uniquement images variante
                  </option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">
                  Sélection par défaut
                </span>
                <select
                  value={config.defaultSelection}
                  onChange={(e) =>
                    updateConfig({
                      defaultSelection: e.target
                        .value as VariantConfig['defaultSelection'],
                    })
                  }
                  className={inputBase}
                >
                  <option value="none">Aucune</option>
                  <option value="first_available">Première disponible</option>
                  <option value="default_variant">Variante par défaut</option>
                  <option value="preferred">Préférences configurées</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">
                  Comportement rupture
                </span>
                <select
                  value={config.outOfStockBehavior}
                  onChange={(e) =>
                    updateConfig({
                      outOfStockBehavior: e.target
                        .value as VariantConfig['outOfStockBehavior'],
                    })
                  }
                  className={inputBase}
                >
                  <option value="disable">Griser</option>
                  <option value="hide">Masquer</option>
                  <option value="allow_backorder">Permettre réservation</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <h3 className="mb-4 font-semibold text-foreground">
              Affichage des options
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.showMiniPhotos}
                  onChange={(e) =>
                    updateConfig({ showMiniPhotos: e.target.checked })
                  }
                  className="rounded text-gold-500 focus:ring-gold-500"
                />
                Afficher mini photos
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.showColorSwatches}
                  onChange={(e) =>
                    updateConfig({ showColorSwatches: e.target.checked })
                  }
                  className="rounded text-gold-500 focus:ring-gold-500"
                />
                Afficher pastilles couleur
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.showSizeLabels}
                  onChange={(e) =>
                    updateConfig({ showSizeLabels: e.target.checked })
                  }
                  className="rounded text-gold-500 focus:ring-gold-500"
                />
                Afficher labels tailles
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.showStockCount}
                  onChange={(e) =>
                    updateConfig({ showStockCount: e.target.checked })
                  }
                  className="rounded text-gold-500 focus:ring-gold-500"
                />
                Afficher nombre en stock
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.hideUnavailable}
                  onChange={(e) =>
                    updateConfig({ hideUnavailable: e.target.checked })
                  }
                  className="rounded text-gold-500 focus:ring-gold-500"
                />
                Masquer combinaisons indisponibles
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.disableUnavailable}
                  onChange={(e) =>
                    updateConfig({ disableUnavailable: e.target.checked })
                  }
                  className="rounded text-gold-500 focus:ring-gold-500"
                />
                Griser combinaisons indisponibles
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.requireCompleteSelection}
                  onChange={(e) =>
                    updateConfig({
                      requireCompleteSelection: e.target.checked,
                    })
                  }
                  className="rounded text-gold-500 focus:ring-gold-500"
                />
                Exiger sélection complète
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.allowBackorder}
                  onChange={(e) =>
                    updateConfig({ allowBackorder: e.target.checked })
                  }
                  className="rounded text-gold-500 focus:ring-gold-500"
                />
                Autoriser backorder / réservation
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">
                  Seuil stock faible
                </span>
                <input
                  type="number"
                  min="0"
                  value={config.lowStockThreshold}
                  onChange={(e) =>
                    updateConfig({
                      lowStockThreshold: num(e.target.value) ?? 0,
                    })
                  }
                  className={inputBase}
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <h3 className="mb-4 font-semibold text-foreground">
              Préférences de sélection
            </h3>

            {attributes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ajoute d’abord des attributs pour définir des préférences.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {attributes.map((attribute) => (
                  <label key={attribute.key} className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {attribute.label}
                    </span>
                    <select
                      value={config.preferredAttributes[attribute.key] || ''}
                      onChange={(e) =>
                        updateConfig({
                          preferredAttributes: {
                            ...config.preferredAttributes,
                            [attribute.key]: e.target.value,
                          },
                        })
                      }
                      className={inputBase}
                    >
                      <option value="">Aucune préférence</option>
                      {sortVariantOptions(attribute.options).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label || option.value}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB PREVIEW */}
      {tab === 'preview' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
              <Eye size={16} className="text-gold-500" />
              Aperçu du sélecteur client
            </h3>

            {attributes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun attribut configuré.
              </p>
            ) : (
              <div className="space-y-4">
                {attributes.map((attribute) => {
                  const results = getPreviewOptionResults(attribute.key)

                  if (results.length === 0) return null

                  if (config.displayMode === 'dropdown') {
                    return (
                      <label key={attribute.key} className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">
                          {attribute.label}
                        </span>
                        <select
                          value={previewSelection[attribute.key] || ''}
                          onChange={(e) =>
                            selectPreviewOption(
                              attribute.key,
                              e.target.value
                            )
                          }
                          className={inputBase}
                        >
                          <option value="">Choisir…</option>
                          {results
                            .filter((result) => !result.hidden)
                            .map((result) => (
                              <option
                                key={result.option.value}
                                value={result.option.value}
                                disabled={result.disabled}
                              >
                                {result.option.label || result.option.value}
                                {result.disabled ? ' (indisponible)' : ''}
                              </option>
                            ))}
                        </select>
                      </label>
                    )
                  }

                  return (
                    <div key={attribute.key}>
                      <p className="mb-2 text-sm font-medium text-foreground">
                        {attribute.label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {results.map((result) =>
                          renderPreviewOptionButton(attribute, result)
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <h4 className="mb-3 font-semibold text-foreground">
                Variante correspondante
              </h4>

              {previewVariant ? (
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Attributs :</span>{' '}
                    <span className="font-medium text-foreground">
                      {varianteLabel(previewVariant, attributeKeys)}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Stock :</span>{' '}
                    <span className="font-medium text-foreground">
                      {previewStock}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Prix USD :</span>{' '}
                    <span className="font-medium text-gold-600">
                      {formatUsd(previewPricing.prixUsd)}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Prix CDF :</span>{' '}
                    <span className="font-medium text-foreground">
                      {formatCdf(previewPricing.prixCdf)}
                    </span>
                  </p>
                  {previewVariant.sku && (
                    <p>
                      <span className="text-muted-foreground">SKU :</span>{' '}
                      <span className="font-mono text-foreground">
                        {previewVariant.sku}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucune variante correspondante pour cette sélection.
                </p>
              )}

              {!previewComplete && config.requireCompleteSelection && (
                <p className="mt-3 flex items-center gap-2 text-xs text-amber-600">
                  <AlertCircle size={14} />
                  Sélection incomplète : le client devra choisir toutes les
                  options.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <h4 className="mb-3 font-semibold text-foreground">
                Galerie dynamique
              </h4>

              {previewGallery.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {previewGallery.slice(0, 9).map((image, index) => (
                    <div
                      key={`${image}-${index}`}
                      className="aspect-square overflow-hidden rounded-xl border border-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucune image pour cette sélection.
                </p>
              )}

              <p className="mt-3 text-xs text-muted-foreground">
                Stratégie : {config.galleryStrategy}
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}