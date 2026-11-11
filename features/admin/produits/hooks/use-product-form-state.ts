// features/admin/produits/hooks/use-product-form-state.ts
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useCategories, flattenTree } from '@/hooks/useCategories'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

import type {
  RichContent,
  VariantAttributeConfig,
  VariantAttributeType,
  VariantConfig,
  VarianteAdvanced,
} from '../types'

import type {
  DeliveryModeId,
  ProductDeliveryConfig,
} from '@/lib/shipping-utils'

import {
  createDefaultDeliveryConsolidationConfig,
  createDefaultLogisticsConfig,
  DELIVERY_MODE_IDS,
  normalizeProductDeliveryConfig,
} from '@/lib/shipping-utils'

import {
  applyDeliveryPresetToAllModes,
  applyDeliveryPresetToMode,
  DELIVERY_PRESETS,
} from '../constants/delivery-presets'

import {
  formatCdf,
  formatUsd,
  isForbiddenKey,
  num,
  positiveNum,
  slugify,
  toStringArray,
} from '../lib/product-utils'

import {
  createEmptyRichContent,
  normalizeRichContent,
} from '../lib/rich-content-utils'

import {
  createRichContentFromTemplate,
  guessTemplateIdFromCategory,
} from '../constants/rich-templates'

import {
  createDefaultVariantConfig,
  getVariantAttributeKeys,
  normalizeVariantAttributes,
  normalizeVariantConfig,
  normalizeVariante,
  normalizeVariantes,
  validateAdvancedVariants,
} from '../lib/variant-utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES INTERNES                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export interface Specification {
  id: string
  key: string
  value: string
}

export interface PriceSuggestion {
  suggestedPrice: number
  suggestedPriceUsd?: number
  reasoning: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const MAX_IMAGES = 15
const MAX_VIDEO_SIZE = 30 * 1024 * 1024
const DRAFT_BASE_KEY = 'admin-product-form-draft-v6'
const AUTOSAVE_INTERVAL = 15_000

const RIBBONS = [
  { value: 'none', label: 'Aucun' },
  { value: 'new', label: 'Nouveauté' },
  { value: 'sale', label: 'Soldes' },
  { value: 'popular', label: 'Populaire' },
  { value: 'exclusive', label: 'Exclusivité' },
  { value: 'limited', label: 'Édition limitée' },
] as const

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMA ZOD                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const productSchema = z.object({
  nom: z
    .string()
    .min(3, 'Le nom doit comporter au moins 3 caractères')
    .max(200),

  slug: z.string().max(120).optional().nullable(),

  description: z
    .string()
    .min(10, 'La description doit comporter au moins 10 caractères')
    .max(5000),

  categorie: z.string().optional().nullable(),

  stock: z.number().int().min(0, 'Le stock doit être positif'),

  negociable: z.boolean().default(false),

  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),

  meta_title: z.string().max(70).optional().nullable(),
  meta_description: z.string().max(180).optional().nullable(),

  tags: z.string().optional().nullable(),
  marque: z.string().max(100).optional().nullable(),

  poids_kg: z.number().min(0).nullable().optional(),
  longueur_cm: z.number().min(0).nullable().optional(),
  largeur_cm: z.number().min(0).nullable().optional(),
  hauteur_cm: z.number().min(0).nullable().optional(),

  remise_percent: z.number().min(0).max(90).nullable().optional(),

  featured: z.boolean().default(false),

  ribbon: z
    .enum(['none', 'new', 'sale', 'popular', 'exclusive', 'limited'])
    .default('none'),

  delay_livraison: z.string().max(120).optional().nullable(),
  limit_per_client: z.number().int().min(0).nullable().optional(),
  notes_internes: z.string().max(1000).optional().nullable(),

  est_actif: z.boolean().default(true),

  badges: z.array(z.string()).default([]),

  livraison_domicile: z.number().min(0).default(0),
  livraison_point_retrait: z.number().min(0).default(0),
  livraison_express: z.number().min(0).default(0),
  express_gratuit: z.boolean().default(false),

  livraison_domicile_active: z.boolean().default(true).optional(),
  livraison_point_retrait_active: z.boolean().default(true).optional(),
  livraison_express_active: z.boolean().default(true).optional(),
})

export type ProductFormValues = z.infer<typeof productSchema>

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${performance.now().toString(36)}`
}

function stripForbidden<T extends Record<string, any>>(obj: T): T {
  const output: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj || {})) {
    if (isForbiddenKey(key)) continue
    output[key] = value
  }

  return output as T
}

function makeDefaults(data?: any): ProductFormValues {
  const clean = stripForbidden(data || {})

  return {
    nom: String(clean.nom || ''),
    slug: String(clean.slug || ''),
    description: String(clean.description || ''),
    categorie: String(clean.categorie || ''),
    stock: Number(clean.stock) || 0,
    negociable: Boolean(clean.negociable),
    sku: String(clean.sku || ''),
    barcode: String(clean.barcode || ''),
    meta_title: String(clean.meta_title || ''),
    meta_description: String(clean.meta_description || ''),
    tags: String(clean.tags || ''),
    marque: String(clean.marque || ''),
    poids_kg: clean.poids_kg ?? null,
    longueur_cm: clean.longueur_cm ?? null,
    largeur_cm: clean.largeur_cm ?? null,
    hauteur_cm: clean.hauteur_cm ?? null,
    remise_percent: clean.remise_percent ?? null,
    featured: Boolean(clean.featured),
    ribbon: (clean.ribbon || 'none') as any,
    delay_livraison: String(clean.delay_livraison || ''),
    limit_per_client: clean.limit_per_client ?? null,
    notes_internes: String(clean.notes_internes || ''),
    est_actif: clean.est_actif ?? true,
    badges: toStringArray(clean.badges),
    livraison_domicile: Number(clean.livraison_domicile) || 0,
    livraison_point_retrait: Number(clean.livraison_point_retrait) || 0,
    livraison_express: Number(clean.livraison_express) || 0,
    express_gratuit: Boolean(clean.express_gratuit),
    livraison_domicile_active: clean.livraison_domicile_active ?? true,
    livraison_point_retrait_active:
      clean.livraison_point_retrait_active ?? true,
    livraison_express_active: clean.livraison_express_active ?? true,
  }
}

function guessColorHex(value: string): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const map: Record<string, string> = {
    'noir': '#111111',
    'black': '#111111',

    'blanc': '#FFFFFF',
    'white': '#FFFFFF',

    'rouge': '#D71920',
    'red': '#D71920',

    'bleu': '#1E40AF',
    'blue': '#1E40AF',

    'vert': '#15803D',
    'green': '#15803D',

    'jaune': '#FACC15',
    'yellow': '#FACC15',

    'gris': '#6B7280',
    'gray': '#6B7280',
    'grey': '#6B7280',

    'beige': '#D6C7A1',

    'marron': '#7C4A2D',
    'brown': '#7C4A2D',

    'or': '#D4AF37',
    'gold': '#D4AF37',

    'argent': '#C0C0C0',
    'silver': '#C0C0C0',

    'rose': '#F472B6',
    'pink': '#F472B6',

    'violet': '#7C3AED',
    'purple': '#7C3AED',

    'orange': '#F97316',

    'bordeaux': '#7F1D1D',
    'burgundy': '#7F1D1D',

    'marine': '#1E3A8A',
    'navy': '#1E3A8A',

    'kaki': '#4D7C0F',
    'olive': '#4D7C0F',

    'corail': '#FF7F50',

    'turquoise': '#14B8A6',

    'cyan': '#06B6D4',

    'magenta': '#C026D3',

    'indigo': '#4F46E5',

    'lavande': '#A78BFA',
    'lilas': '#A78BFA',

    'creme': '#FFFDD0',
    'cream': '#FFFDD0',

    'ivoire': '#FFFFF0',
    'ivory': '#FFFFF0',

    'anthracite': '#2B2B2B',

    'charbon': '#36454F',

    'slate': '#475569',

    'taupe': '#8B8589',

    'sable': '#C2B280',

    'terracotta': '#E2725B',

    'safran': '#F4C430',

    'moutarde': '#E1AD01',

    'emeraude': '#059669',
    'emerald': '#059669',

    'rubis': '#9B111E',

    'saphir': '#0F52BA',

    'amethyste': '#9966CC',

    'aqua': '#00FFFF',

    'mint': '#98FB98',
    'menthe': '#98FB98',

    'prune': '#5E239D',

    'wine': '#722F37',
    'vin': '#722F37',

    'chocolat': '#5C4033',
    'chocolate': '#5C4033',

    'cafe': '#6F4E37',
    'coffee': '#6F4E37',

    'caramel': '#AF6E4D',

    'noisette': '#B87333',
    'hazelnut': '#B87333',

    'peche': '#FFE5B4',
    'peach': '#FFE5B4',

    'abricot': '#FBCEB1',
    'apricot': '#FBCEB1',

    'limon': '#FFF700',
    'lemon': '#FFF700',

    'lime': '#BFFF00',

    'citron': '#FFF700',

    'fuchsia': '#FF00FF',

    'parme': '#915F6D',

    'mauve': '#E0B0FF',

    'periwinkle': '#CCCCFF',
    'pervenche': '#CCCCFF',

    'celeste': '#87CEEB',
    'sky': '#87CEEB',

    'azure': '#007FFF',

    'cobalt': '#0047AB',

    'roi': '#002366',
    'royal': '#002366',

    'nuit': '#0B1026',
    'night': '#0B1026',

    'minuit': '#0B1026',
    'midnight': '#0B1026',

    'acier': '#71797E',
    'steel': '#71797E',

    'fer': '#434B4D',
    'iron': '#434B4D',

    'bronze': '#CD7F32',

    'cuivre': '#B87333',
    'copper': '#B87333',

    'laiton': '#D4AF37',
    'brass': '#D4AF37',

    'etain': '#9EA7AD',
    'tin': '#9EA7AD',

    'platine': '#E5E4E2',
    'platinum': '#E5E4E2',

    'nacre': '#FDEEF4',
    'pearl': '#FDEEF4',

    'opale': '#A8C3BC',
    'opal': '#A8C3BC',

    'jade': '#00A86B',

    'topaze': '#FFC87C',

    'amber': '#FFBF00',
    'ambre': '#FFBF00',

    'miel': '#EB9605',
    'honey': '#EB9605',

    'dore': '#FFD700',
    'golden': '#FFD700',

    'argente': '#C0C0C0',

    'gris clair': '#D3D3D3',
    'lightgray': '#D3D3D3',

    'gris fonce': '#696969',
    'darkgray': '#696969',

    'bleu clair': '#ADD8E6',
    'lightblue': '#ADD8E6',

    'bleu fonce': '#00008B',
    'darkblue': '#00008B',

    'rouge clair': '#FF7F7F',
    'lightred': '#FF7F7F',

    'rouge fonce': '#8B0000',
    'darkred': '#8B0000',

    'vert clair': '#90EE90',
    'lightgreen': '#90EE90',

    'vert fonce': '#006400',
    'darkgreen': '#006400',

    'jaune clair': '#FFFFE0',
    'lightyellow': '#FFFFE0',

    'jaune fonce': '#B8860B',
    'darkyellow': '#B8860B',

    'bleu marine': '#1E3A8A',
    'bleu nuit': '#0B1026',
    'vert kaki': '#4D7C0F',
    'rouge bordeaux': '#7F1D1D',
    'noir mat': '#111111',
    'blanc casse': '#FFFFF0',
  }

  return map[normalized] || null
}

function inferAttributeType(key: string): VariantAttributeType {
  const lower = String(key || '').toLowerCase()

  if (
    lower.includes('taille') ||
    lower.includes('size') ||
    lower.includes('dimension')
  ) {
    return 'size'
  }

  if (
    lower.includes('couleur') ||
    lower.includes('color') ||
    lower.includes('colour')
  ) {
    return 'color'
  }

  if (
    lower.includes('modèle') ||
    lower.includes('modele') ||
    lower.includes('model') ||
    lower.includes('version')
  ) {
    return 'model'
  }

  if (
    lower.includes('finition') ||
    lower.includes('matière') ||
    lower.includes('matiere') ||
    lower.includes('material') ||
    lower.includes('texture')
  ) {
    return 'swatch'
  }

  return 'text'
}

function deriveVariantAttributesFromVariantes(
  variantes: VarianteAdvanced[]
): VariantAttributeConfig[] {
  const map = new Map<
    string,
    Map<string, { image?: string | null; colorHex?: string | null }>
  >()

  for (const variante of variantes || []) {
    const attributes = variante.attributes || {}

    for (const [key, rawValue] of Object.entries(attributes)) {
      const cleanKey = String(key || '').trim()
      const cleanValue = String(rawValue || '').trim()

      if (!cleanKey || !cleanValue) continue

      if (!map.has(cleanKey)) {
        map.set(cleanKey, new Map())
      }

      const optionsMap = map.get(cleanKey)!

      if (!optionsMap.has(cleanValue)) {
        optionsMap.set(cleanValue, {
          image: variante.image || variante.images?.[0] || null,
          colorHex: variante.colorHex || guessColorHex(cleanValue),
        })
      }
    }
  }

  return Array.from(map.entries()).map(([key, optionsMap], index) => {
    const type = inferAttributeType(key)

    const options = Array.from(optionsMap.entries()).map(
      ([value, meta], optionIndex) => ({
        value,
        label: value,
        image: meta.image || null,
        colorHex:
          type === 'color' || type === 'swatch'
            ? meta.colorHex || guessColorHex(value)
            : null,
        sort: optionIndex,
        active: true,
      })
    )

    return {
      key,
      label: key,
      type,
      required: true,
      options,
      sortOrder: index,
    }
  })
}

function mergeDeliveryConfig(
  prev: ProductDeliveryConfig,
  patch: Partial<ProductDeliveryConfig>
): ProductDeliveryConfig {
  const next: ProductDeliveryConfig = { ...prev, ...patch }

  if (patch.modes) {
    next.modes = { ...prev.modes }

    for (const modeId of DELIVERY_MODE_IDS) {
      const modePatch = (patch.modes as any)?.[modeId]

      if (modePatch) {
        next.modes[modeId] = {
          ...prev.modes[modeId],
          ...modePatch,
        }
      }
    }
  }

  if (patch.logistics) {
    next.logistics = {
      ...(prev.logistics || createDefaultLogisticsConfig()),
      ...patch.logistics,
    }
  }

  if (patch.consolidation) {
    next.consolidation = {
      ...(prev.consolidation || createDefaultDeliveryConsolidationConfig()),
      ...patch.consolidation,
    }
  }

  return next
}

/* ═══════════════════════════════════════════════════════════════ */
/*  OPTIONS DU HOOK                                                */
/* ═══════════════════════════════════════════════════════════════ */

export interface UseProductFormStateOptions {
  productId?: string | null
  initialData?: any
  onValuesChange?: (values: any) => void
  enableAutosave?: boolean
  storageKey?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOK PRINCIPAL                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function useProductFormState(options: UseProductFormStateOptions) {
  const {
    productId,
    initialData,
    onValuesChange,
    enableAutosave = true,
    storageKey,
  } = options

  const { user } = useAuth()
  const toast = useToast()
  const { rate } = useExchangeRate()
  const { data: categoriesTree, isLoading: isLoadingCats } = useCategories()

  const flatCategories = useMemo(
    () => (categoriesTree ? flattenTree(categoriesTree) : []),
    [categoriesTree]
  )

  const draftKey = storageKey || `${DRAFT_BASE_KEY}-${productId || 'new'}`

  /* ---------------------------------------------------------- */
  /* RHF                                                         */
  /* ---------------------------------------------------------- */
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    getValues: rhfGetValues,
    watch,
    setValue,
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: makeDefaults(initialData),
  })

  const formValues = watch()

  const nomWatch = watch('nom')
  const slugWatch = watch('slug')
  const descriptionWatch = watch('description')
  const metaTitleWatch = watch('meta_title')
  const metaDescriptionWatch = watch('meta_description')
  const notesWatch = watch('notes_internes')
  const remiseWatch = watch('remise_percent')
  const stockWatch = watch('stock')

  /* ---------------------------------------------------------- */
  /* États médias                                                */
  /* ---------------------------------------------------------- */
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [mainImageIndex, setMainImageIndex] = useState(0)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoError, setVideoError] = useState('')

  /* ---------------------------------------------------------- */
  /* États prix                                                  */
  /* ---------------------------------------------------------- */
  const [priceUsd, setPriceUsd] = useState('')
  const [priceCdf, setPriceCdf] = useState('')
  const [originalUsd, setOriginalUsd] = useState('')

  /* ---------------------------------------------------------- */
  /* États catégorie                                             */
  /* ---------------------------------------------------------- */
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [initialCategoryPath, setInitialCategoryPath] = useState('')

  /* ---------------------------------------------------------- */
  /* États variantes avancées                                    */
  /* ---------------------------------------------------------- */
  const [variantAttributes, setVariantAttributesState] = useState<
    VariantAttributeConfig[]
  >(() => {
    const incoming = normalizeVariantAttributes(
      initialData?.variant_attributes
    )

    if (incoming.length > 0) return incoming

    const incomingVariantes = normalizeVariantes(
      initialData?.variantes,
      []
    )

    return deriveVariantAttributesFromVariantes(incomingVariantes)
  })

  const [variantes, setVariantesState] = useState<VarianteAdvanced[]>(() => {
    const attributes = normalizeVariantAttributes(
      initialData?.variant_attributes
    )

    const derivedAttributes =
      attributes.length > 0
        ? attributes
        : deriveVariantAttributesFromVariantes(
            normalizeVariantes(initialData?.variantes, [])
          )

    const keys = getVariantAttributeKeys(derivedAttributes, [])

    return normalizeVariantes(initialData?.variantes, keys)
  })

  const [variantConfig, setVariantConfigState] = useState<VariantConfig>(() =>
    normalizeVariantConfig(
      initialData?.variant_config || createDefaultVariantConfig()
    )
  )

  /* ---------------------------------------------------------- */
  /* États livraison avancée                                     */
  /* ---------------------------------------------------------- */
  const [deliveryConfig, setDeliveryConfigState] =
    useState<ProductDeliveryConfig>(() =>
      normalizeProductDeliveryConfig(
        initialData?.delivery_config,
        initialData,
        null
      )
    )

  /* ---------------------------------------------------------- */
  /* États specs / tags / slug                                   */
  /* ---------------------------------------------------------- */
  const [specs, setSpecs] = useState<Specification[]>([])
  const [tagsList, setTagsList] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const prevAutoSlugRef = useRef('')

  /* ---------------------------------------------------------- */
  /* États IA                                                    */
  /* ---------------------------------------------------------- */
  const [generatingDescription, setGeneratingDescription] = useState(false)
  const [priceSuggestion, setPriceSuggestion] = useState<PriceSuggestion | null>(
    null
  )
  const [priceSuggestionLoading, setPriceSuggestionLoading] = useState(false)

  /* ---------------------------------------------------------- */
  /* États draft interne                                         */
  /* ---------------------------------------------------------- */
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [autosaveIndicator, setAutosaveIndicator] = useState(false)
  const [isDraftLoaded, setIsDraftLoaded] = useState(false)
  const baselineRef = useRef<any>(null)
  const lastHydratedRef = useRef<string | null>(null)
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  /* ---------------------------------------------------------- */
  /* États rich content                                          */
  /* ---------------------------------------------------------- */
  const [richContent, setRichContentState] = useState<RichContent>(() =>
    normalizeRichContent(
      initialData?.rich_content,
      createEmptyRichContent()
    )
  )

  const [richTemplateId, setRichTemplateId] = useState<string>(
    initialData?.rich_content?.templateId ||
      guessTemplateIdFromCategory(initialData?.categorie)
  )

  const [richGenerating, setRichGenerating] = useState(false)

  /* ---------------------------------------------------------- */
  /* Valeurs dérivées                                            */
  /* ---------------------------------------------------------- */
  const attributeKeys = useMemo(
    () => getVariantAttributeKeys(variantAttributes, variantes),
    [variantAttributes, variantes]
  )

  const initialDataSignature = useMemo(() => {
    if (!initialData) return null

    try {
      return JSON.stringify({
        id: initialData.id ?? null,
        nom: initialData.nom ?? null,
        saved_at: initialData._saved_at ?? null,
        updated_at: initialData.updated_at ?? null,
        prix_usd: initialData.prix_usd ?? null,
        images_len: Array.isArray(initialData.images)
          ? initialData.images.length
          : 0,
        variantes_len: Array.isArray(initialData.variantes)
          ? initialData.variantes.length
          : 0,
        variant_attributes_len: Array.isArray(initialData.variant_attributes)
          ? initialData.variant_attributes.length
          : 0,
        delivery_enabled: initialData.delivery_config?.enabled ?? null,
        rich_enabled: initialData.rich_content?.enabled ?? null,
      })
    } catch {
      return String(Date.now())
    }
  }, [initialData])

  /* ---------------------------------------------------------- */
  /* Catégories                                                  */
  /* ---------------------------------------------------------- */
  const buildFullCategory = useCallback((): string => {
    if (selectedCategoryId) {
      const cat = flatCategories.find((c: any) => c.id === selectedCategoryId)
      if (cat?.chemin_complet) return cat.chemin_complet
    }

    const fv = rhfGetValues()
    return String(fv.categorie || baselineRef.current?.categorie || '')
  }, [flatCategories, rhfGetValues, selectedCategoryId])

  /* ---------------------------------------------------------- */
  /* Get product values                                          */
  /* ---------------------------------------------------------- */
  const getProductValues = useCallback((): any => {
    const fv = rhfGetValues()

    const rawUsd = positiveNum(priceUsd)
    const rawCdf = positiveNum(priceCdf)

    const computedUsd =
      rawUsd ?? (rawCdf && rate ? Number((rawCdf / rate).toFixed(2)) : 0)

    const computedCdf =
      rawCdf ?? (computedUsd && rate ? Math.round(computedUsd * rate) : 0)

    const formRemise = Math.max(0, num(fv.remise_percent) ?? 0)

    const rawOriginalUsd = positiveNum(originalUsd)

    const computedOriginalUsd =
      rawOriginalUsd ??
      (computedUsd > 0 && formRemise > 0
        ? Number((computedUsd / (1 - formRemise / 100)).toFixed(2))
        : 0)

    const computedOriginalCdf =
      computedOriginalUsd > 0 && rate
        ? Math.round(computedOriginalUsd * rate)
        : computedCdf > 0 && formRemise > 0
        ? Math.round(computedCdf / (1 - formRemise / 100))
        : 0

    const computedRemise =
      computedOriginalUsd > 0 &&
      computedUsd > 0 &&
      computedOriginalUsd > computedUsd
        ? Math.round((1 - computedUsd / computedOriginalUsd) * 100)
        : formRemise

    const currentAttributeKeys = getVariantAttributeKeys(
      variantAttributes,
      variantes
    )

    const outgoingVariantes = normalizeVariantes(
      variantes,
      currentAttributeKeys
    )
      .filter((variante) =>
        Object.values(variante.attributes || {}).some((value) =>
          String(value || '').trim()
        )
      )
      .map((variante) => ({
        id: variante.id,
        attributes: variante.attributes || {},
        stock: Number(variante.stock) || 0,

        sku: variante.sku || null,
        barcode: variante.barcode || null,

        image: variante.image || variante.images?.[0] || null,
        images: Array.isArray(variante.images) ? variante.images : [],

        colorHex: variante.colorHex || null,

        is_default: Boolean(variante.is_default),
        is_active: variante.is_active !== false,

        prix_specifique_usd: variante.prix_specifique_usd ?? null,
        prix_specifique_cdf: variante.prix_specifique_cdf ?? null,
        prix_specifique: variante.prix_specifique_cdf ?? null,

        prix_original_usd: variante.prix_original_usd ?? null,
        prix_original_cdf: variante.prix_original_cdf ?? null,

        poids_kg: variante.poids_kg ?? null,
        longueur_cm: variante.longueur_cm ?? null,
        largeur_cm: variante.largeur_cm ?? null,
        hauteur_cm: variante.hauteur_cm ?? null,

        specs: variante.specs || {},
        notes: variante.notes || null,
      }))

    const filteredSpecs = specs
      .filter((spec) => spec.key.trim() !== '' && spec.value.trim() !== '')
      .map((spec) => ({
        id: spec.id,
        key: spec.key.trim(),
        value: spec.value.trim(),
      }))

    const hasVariants =
      variantAttributes.length > 0 || outgoingVariantes.length > 0

    const outgoingDeliveryConfig = deliveryConfig.enabled
      ? normalizeProductDeliveryConfig(deliveryConfig, fv, rate)
      : null

    const payload = stripForbidden({
      ...fv,

      slug: fv.slug || slugify(fv.nom || ''),
      categorie: buildFullCategory(),
      categorie_id: selectedCategoryId || null,

      images: imageUrls,
      main_image_index: mainImageIndex,
      video_url: videoUrl,

      variantes: outgoingVariantes.length > 0 ? outgoingVariantes : null,
      variant_attributes: hasVariants ? variantAttributes : null,
      variant_config: hasVariants ? variantConfig : null,

      delivery_config: outgoingDeliveryConfig,

      specifications: filteredSpecs.length > 0 ? filteredSpecs : null,

      tags: tagsList.join(', '),
      tags_array: tagsList,

      prix_usd: computedUsd || null,
      prix: computedCdf || null,
      prix_cdf: computedCdf || null,

      prix_original_usd: computedOriginalUsd || null,
      prix_original: computedOriginalCdf || null,

      remise_percent: computedRemise || null,

      rich_content: richContent.enabled
        ? normalizeRichContent(richContent)
        : null,
    })

    return payload
  }, [
    buildFullCategory,
    deliveryConfig,
    imageUrls,
    mainImageIndex,
    originalUsd,
    priceCdf,
    priceUsd,
    rate,
    rhfGetValues,
    richContent,
    selectedCategoryId,
    specs,
    tagsList,
    variantAttributes,
    variantConfig,
    variantes,
    videoUrl,
  ])

  /* ---------------------------------------------------------- */
  /* Hydratation                                                 */
  /* ---------------------------------------------------------- */
  const hydrate = useCallback(
    (data: any) => {
      const clean = stripForbidden(data || {})

      baselineRef.current = clean

      reset(makeDefaults(clean))

      setImageUrls(
        Array.isArray(clean.images)
          ? clean.images.filter(Boolean)
          : clean.image
          ? [clean.image]
          : []
      )

      setMainImageIndex(Number(clean.main_image_index) || 0)
      setVideoUrl(clean.video_url || null)

      const cleanUsd = positiveNum(clean.prix_usd)
      const cleanCdf = positiveNum(clean.prix ?? clean.prix_cdf)

      if (cleanUsd) {
        setPriceUsd(String(cleanUsd))
        setPriceCdf(
          cleanCdf
            ? String(cleanCdf)
            : rate
            ? String(Math.round(cleanUsd * rate))
            : ''
        )
      } else if (cleanCdf) {
        setPriceCdf(String(cleanCdf))
        setPriceUsd(rate ? String((cleanCdf / rate).toFixed(2)) : '')
      } else {
        setPriceUsd('')
        setPriceCdf('')
      }

      const cleanOriginalUsd = positiveNum(clean.prix_original_usd)
      setOriginalUsd(cleanOriginalUsd ? String(cleanOriginalUsd) : '')

      setSelectedCategoryId(String(clean.categorie_id || ''))
      setInitialCategoryPath(String(clean.categorie || ''))

      const incomingVariantes = normalizeVariantes(clean.variantes, [])

      const incomingAttributes = normalizeVariantAttributes(
        clean.variant_attributes
      )

      const finalAttributes =
        incomingAttributes.length > 0
          ? incomingAttributes
          : deriveVariantAttributesFromVariantes(incomingVariantes)

      const finalKeys = getVariantAttributeKeys(
        finalAttributes,
        incomingVariantes
      )

      const normalizedVariantes = normalizeVariantes(
        clean.variantes,
        finalKeys
      )

      setVariantAttributesState(finalAttributes)
      setVariantesState(normalizedVariantes)
      setVariantConfigState(
        normalizeVariantConfig(
          clean.variant_config || createDefaultVariantConfig()
        )
      )

      setDeliveryConfigState(
        normalizeProductDeliveryConfig(
          clean.delivery_config,
          clean,
          rate
        )
      )

      setSpecs(
        Array.isArray(clean.specifications)
          ? clean.specifications.map((spec: any) => ({
              id: spec.id || generateUniqueId(),
              key: String(spec.key || ''),
              value: String(spec.value || ''),
            }))
          : []
      )

      setTagsList(toStringArray(clean.tags))
      setSlugTouched(Boolean(clean.slug))

      setRichContentState(
        normalizeRichContent(
          clean.rich_content,
          createEmptyRichContent()
        )
      )

      setRichTemplateId(
        clean.rich_content?.templateId ||
          guessTemplateIdFromCategory(clean.categorie)
      )
    },
    [rate, reset]
  )

  /* ---------------------------------------------------------- */
  /* Effet hydratation initiale                                  */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (!user) return
    if (!initialDataSignature) return

    if (lastHydratedRef.current === initialDataSignature) return

    if (
      initialData &&
      (initialData.id || initialData.nom || initialData._saved_at)
    ) {
      hydrate(initialData)
      lastHydratedRef.current = initialDataSignature
      return
    }

    if (productId) {
      const fetchProduct = async () => {
        try {
          const res = await fetch(`/api/admin/produits/${productId}`, {
            credentials: 'include',
          })

          if (!res.ok) throw new Error('Produit introuvable')

          const json = await res.json()
          const data = json?.data ?? json

          hydrate(data)
          lastHydratedRef.current = initialDataSignature
        } catch (err: any) {
          toast.addToast({
            type: 'error',
            message: err?.message || 'Impossible de charger le produit.',
          })
        }
      }

      fetchProduct()
    }
  }, [
    hydrate,
    initialData,
    initialDataSignature,
    productId,
    toast,
    user,
  ])

  /* ---------------------------------------------------------- */
  /* Synchronisation taux                                        */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (!rate) return

    setPriceUsd((prev) => {
      if (!prev && priceCdf) {
        const n = Number(priceCdf)
        if (Number.isFinite(n) && n > 0) return (n / rate).toFixed(2)
      }

      return prev
    })

    setPriceCdf((prev) => {
      if (!prev && priceUsd) {
        const n = Number(priceUsd)
        if (Number.isFinite(n) && n > 0) return String(Math.round(n * rate))
      }

      return prev
    })

    setVariantesState((prev) =>
      prev.map((variante) => {
        const usd = positiveNum(variante.prix_specifique_usd)
        const cdf = positiveNum(variante.prix_specifique_cdf)

        return {
          ...variante,
          prix_specifique_usd:
            usd ?? (cdf ? Number((cdf / rate).toFixed(2)) : null),
          prix_specifique_cdf:
            cdf ?? (usd ? Math.round(usd * rate) : null),
        }
      })
    )

    setDeliveryConfigState((prev) =>
      normalizeProductDeliveryConfig(prev, prev, rate)
    )
  }, [priceCdf, priceUsd, rate])

  /* ---------------------------------------------------------- */
  /* Catégorie initiale                                          */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (
      selectedCategoryId ||
      !initialCategoryPath ||
      flatCategories.length === 0
    ) {
      return
    }

    const match = flatCategories.find(
      (cat: any) =>
        cat.chemin_complet === initialCategoryPath ||
        cat.nom === initialCategoryPath
    )

    if (match) {
      setSelectedCategoryId(match.id)
    }
  }, [flatCategories, initialCategoryPath, selectedCategoryId])

  /* ---------------------------------------------------------- */
  /* Slug auto                                                   */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (slugTouched) return

    const auto = slugify(nomWatch || '')

    if (!slugWatch || slugWatch === prevAutoSlugRef.current) {
      setValue('slug', auto, { shouldDirty: false })
      prevAutoSlugRef.current = auto
    }
  }, [nomWatch, setValue, slugTouched, slugWatch])

  /* ---------------------------------------------------------- */
  /* Tags sync                                                   */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    setValue('tags', tagsList.join(', '), { shouldDirty: true })
  }, [setValue, tagsList])

  /* ---------------------------------------------------------- */
  /* On values change                                            */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (!onValuesChange) return

    const timeout = setTimeout(() => {
      onValuesChange(getProductValues())
    }, 200)

    return () => clearTimeout(timeout)
  }, [
    formValues,
    getProductValues,
    imageUrls,
    mainImageIndex,
    onValuesChange,
    originalUsd,
    priceCdf,
    priceUsd,
    rate,
    richContent,
    selectedCategoryId,
    specs,
    tagsList,
    variantAttributes,
    variantConfig,
    variantes,
    deliveryConfig,
    videoUrl,
  ])

  /* ---------------------------------------------------------- */
  /* Autosave interne du formulaire                              */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (!enableAutosave) return

    autosaveTimerRef.current = setInterval(() => {
      try {
        const values = getProductValues()
        localStorage.setItem(draftKey, JSON.stringify(values))
        setLastSaved(new Date().toLocaleTimeString('fr-FR'))
        setAutosaveIndicator(true)
        setTimeout(() => setAutosaveIndicator(false), 1000)
      } catch {
        // silencieux
      }
    }, AUTOSAVE_INTERVAL)

    return () => {
      if (autosaveTimerRef.current) clearInterval(autosaveTimerRef.current)
    }
  }, [draftKey, enableAutosave, getProductValues])

  /* ---------------------------------------------------------- */
  /* Images                                                      */
  /* ---------------------------------------------------------- */
  const handleImageUploaded = useCallback((url: string) => {
    setImageUrls((prev) => [...prev, url].slice(0, MAX_IMAGES))
  }, [])

  const removeImage = useCallback((index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index))

    setMainImageIndex((prev) => {
      if (index < prev) return prev - 1
      if (index === prev) return Math.max(0, prev - 1)
      return prev
    })
  }, [])

  const moveImage = useCallback((index: number, direction: -1 | 1) => {
    setImageUrls((prev) => {
      const next = [...prev]
      const target = index + direction

      if (target < 0 || target >= next.length) return prev

      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp

      return next
    })

    setMainImageIndex((prev) => {
      const target = index + direction

      if (prev === index) return target
      if (prev === target) return index

      return prev
    })
  }, [])

  const setAsMainImage = useCallback((index: number) => {
    setMainImageIndex(index)
  }, [])

  /* ---------------------------------------------------------- */
  /* Vidéo                                                       */
  /* ---------------------------------------------------------- */
  const onVideoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setVideoUploading(true)
      setVideoError('')

      if (!file.type.startsWith('video/')) {
        setVideoError('Format vidéo requis.')
        setVideoUploading(false)
        return
      }

      if (file.size > MAX_VIDEO_SIZE) {
        setVideoError(
          `Taille maximale : ${MAX_VIDEO_SIZE / (1024 * 1024)} Mo.`
        )
        setVideoUploading(false)
        return
      }

      try {
        let userId = user?.id

        if (!userId) {
          const { data } = await supabaseBrowser.auth.getSession()
          userId = data?.session?.user?.id
        }

        if (!userId) throw new Error('Non authentifié.')

        const videoPath = `${userId}/videos/${Date.now()}_${file.name}`

        const { error: uploadError } = await supabaseBrowser.storage
          .from('photos-produits')
          .upload(videoPath, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) throw uploadError

        const {
          data: { publicUrl },
        } = supabaseBrowser.storage
          .from('photos-produits')
          .getPublicUrl(videoPath)

        setVideoUrl(publicUrl)
        toast.addToast({ type: 'success', message: 'Vidéo chargée.' })
      } catch (err: any) {
        setVideoError(err?.message || "Erreur lors de l'upload vidéo.")
        toast.addToast({
          type: 'error',
          message: err?.message || 'Erreur vidéo.',
        })
      } finally {
        setVideoUploading(false)
      }
    },
    [toast, user?.id]
  )

  const removeVideo = useCallback(() => setVideoUrl(null), [])

  /* ---------------------------------------------------------- */
  /* Variantes avancées : setters                                */
  /* ---------------------------------------------------------- */
  const setVariantes = useCallback(
    (next: VarianteAdvanced[]) => {
      const keys = getVariantAttributeKeys(variantAttributes, next)
      setVariantesState(normalizeVariantes(next, keys))
    },
    [variantAttributes]
  )

  const setVariantAttributes = useCallback(
    (next: VariantAttributeConfig[]) => {
      const normalized = normalizeVariantAttributes(next)
      setVariantAttributesState(normalized)
    },
    []
  )

  const setVariantConfig = useCallback((next: VariantConfig) => {
    setVariantConfigState(normalizeVariantConfig(next))
  }, [])

  /* ---------------------------------------------------------- */
  /* Livraison avancée : setters                                 */
  /* ---------------------------------------------------------- */
  const setDeliveryConfig = useCallback(
    (
      patch:
        | Partial<ProductDeliveryConfig>
        | ((prev: ProductDeliveryConfig) => Partial<ProductDeliveryConfig>)
    ) => {
      setDeliveryConfigState((prev) => {
        const resolved =
          typeof patch === 'function' ? patch(prev) : patch

        const merged = mergeDeliveryConfig(prev, resolved)

        return normalizeProductDeliveryConfig(merged, prev, rate)
      })
    },
    [rate]
  )

  const applyDeliveryPreset = useCallback(
    (presetId: string, modeId?: DeliveryModeId) => {
      setDeliveryConfigState((prev) => {
        const base = normalizeProductDeliveryConfig(prev, prev, rate)

        const next = modeId
          ? applyDeliveryPresetToMode(base, presetId, modeId)
          : applyDeliveryPresetToAllModes(base, presetId)

        return normalizeProductDeliveryConfig(
          {
            ...next,
            enabled: true,
          },
          prev,
          rate
        )
      })
    },
    [rate]
  )

  const resetDeliveryConfig = useCallback(() => {
    setDeliveryConfigState(
      normalizeProductDeliveryConfig(
        null,
        baselineRef.current || initialData || {},
        rate
      )
    )
  }, [initialData, rate])

  /* ---------------------------------------------------------- */
  /* Variantes legacy compatibles                                */
  /* ---------------------------------------------------------- */
  const addVariante = useCallback(() => {
    const keys = getVariantAttributeKeys(variantAttributes, variantes)

    const emptyAttributes = keys.reduce<Record<string, string>>(
      (acc, key) => ({ ...acc, [key]: '' }),
      {}
    )

    const newVariante = normalizeVariante(
      {
        id: generateUniqueId(),
        attributes: emptyAttributes,
        stock: 0,
        is_active: true,
        images: [],
        specs: {},
      },
      keys
    )

    setVariantes([...variantes, newVariante])
  }, [setVariantes, variantAttributes, variantes])

  const removeVariante = useCallback(
    (id: string) => {
      setVariantes(variantes.filter((variante) => variante.id !== id))
    },
    [setVariantes, variantes]
  )

  const updateVariante = useCallback(
    (id: string, patch: Partial<VarianteAdvanced>) => {
      const keys = getVariantAttributeKeys(variantAttributes, variantes)

      setVariantes(
        variantes.map((variante) =>
          variante.id === id
            ? normalizeVariante({ ...variante, ...patch }, keys)
            : variante
        )
      )
    },
    [setVariantes, variantAttributes, variantes]
  )

  const duplicateVariante = useCallback(
    (id: string) => {
      const source = variantes.find((variante) => variante.id === id)
      if (!source) return

      const keys = getVariantAttributeKeys(variantAttributes, variantes)

      const copy = normalizeVariante(
        {
          ...source,
          id: generateUniqueId(),
          is_default: false,
          attributes: { ...(source.attributes || {}) },
          images: [...(source.images || [])],
          specs: { ...(source.specs || {}) },
        },
        keys
      )

      setVariantes([...variantes, copy])
    },
    [setVariantes, variantAttributes, variantes]
  )

  const clearAllVariantes = useCallback(() => {
    setVariantes([])
  }, [setVariantes])

  /* ---------------------------------------------------------- */
  /* Spécifications                                              */
  /* ---------------------------------------------------------- */
  const addSpec = useCallback(() => {
    setSpecs((prev) => [
      ...prev,
      { id: generateUniqueId(), key: '', value: '' },
    ])
  }, [])

  const updateSpec = useCallback(
    (id: string, field: 'key' | 'value', value: string) => {
      setSpecs((prev) =>
        prev.map((spec) =>
          spec.id === id ? { ...spec, [field]: value } : spec
        )
      )
    },
    []
  )

  const removeSpec = useCallback((id: string) => {
    setSpecs((prev) => prev.filter((spec) => spec.id !== id))
  }, [])

  const moveSpec = useCallback((index: number, direction: -1 | 1) => {
    setSpecs((prev) => {
      const next = [...prev]
      const target = index + direction

      if (target < 0 || target >= next.length) return prev

      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp

      return next
    })
  }, [])

  /* ---------------------------------------------------------- */
  /* Tags                                                        */
  /* ---------------------------------------------------------- */
  const addTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (!trimmed) return

    if (tagsList.includes(trimmed)) {
      setTagInput('')
      return
    }

    setTagsList((prev) => [...prev, trimmed])
    setTagInput('')
  }, [tagInput, tagsList])

  const removeTag = useCallback((tag: string) => {
    setTagsList((prev) => prev.filter((item) => item !== tag))
  }, [])

  /* ---------------------------------------------------------- */
  /* IA description                                              */
  /* ---------------------------------------------------------- */
  const handleGenerateDescription = useCallback(async () => {
    const productName = String(nomWatch || '')

    if (productName.trim().length < 3) {
      toast.addToast({
        type: 'error',
        message: 'Le nom du produit est trop court.',
      })
      return
    }

    setGeneratingDescription(true)

    try {
      const res = await fetch('/api/ai/admin/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productName,
          category: buildFullCategory(),
          attributes: watch('marque') ? `Marque : ${watch('marque')}` : undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Erreur de génération.')
      }

      const data = await res.json()

      if (data?.description) {
        setValue('description', data.description, {
          shouldDirty: true,
          shouldValidate: true,
        })

        toast.addToast({
          type: 'success',
          message: 'Description générée avec succès.',
        })
      }
    } catch (err: any) {
      toast.addToast({
        type: 'error',
        message:
          err?.message || 'Impossible de générer la description.',
      })
    } finally {
      setGeneratingDescription(false)
    }
  }, [buildFullCategory, nomWatch, setValue, toast, watch])

  /* ---------------------------------------------------------- */
  /* IA prix                                                     */
  /* ---------------------------------------------------------- */
  const handlePriceSuggestion = useCallback(async () => {
    if (!productId) {
      toast.addToast({
        type: 'info',
        message:
          "Enregistre d'abord le produit pour obtenir une suggestion.",
      })
      return
    }

    setPriceSuggestionLoading(true)
    setPriceSuggestion(null)

    try {
      const res = await fetch('/api/ai/admin/price-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Erreur suggestion prix.')
      }

      const data = await res.json()
      setPriceSuggestion(data)

      const suggestedUsd =
        positiveNum(data.suggestedPriceUsd) ??
        (positiveNum(data.suggestedPrice) && rate
          ? Number((data.suggestedPrice / rate).toFixed(2))
          : null)

      toast.addToast({
        type: 'info',
        message: `Prix suggéré : ${formatUsd(suggestedUsd)} ≈ ${formatCdf(
          data.suggestedPrice
        )}`,
      })
    } catch (err: any) {
      toast.addToast({
        type: 'error',
        message:
          err?.message || "Impossible d'obtenir une suggestion.",
      })
    } finally {
      setPriceSuggestionLoading(false)
    }
  }, [productId, rate, toast])

  const applyPriceSuggestion = useCallback(() => {
    if (!priceSuggestion) return

    const suggestedCdf = positiveNum(priceSuggestion.suggestedPrice)
    const suggestedUsd =
      positiveNum(priceSuggestion.suggestedPriceUsd) ??
      (suggestedCdf && rate
        ? Number((suggestedCdf / rate).toFixed(2))
        : null)

    if (suggestedUsd) {
      setPriceUsd(String(suggestedUsd))
      setPriceCdf(rate ? String(Math.round(suggestedUsd * rate)) : '')
    } else if (suggestedCdf) {
      setPriceCdf(String(suggestedCdf))
      setPriceUsd(rate ? String((suggestedCdf / rate).toFixed(2)) : '')
    }

    setPriceSuggestion(null)
    toast.addToast({ type: 'success', message: 'Prix appliqué.' })
  }, [priceSuggestion, rate, toast])

  /* ---------------------------------------------------------- */
  /* Rich content actions                                        */
  /* ---------------------------------------------------------- */
  const setRichContent = useCallback((next: RichContent) => {
    setRichContentState(normalizeRichContent(next))
  }, [])

  const applyRichTemplate = useCallback(
    (templateId: string) => {
      const generated = createRichContentFromTemplate(templateId, {
        productName: nomWatch,
        category: buildFullCategory(),
        description: descriptionWatch,
        specs: specs.map((spec) => ({
          label: spec.key,
          value: spec.value,
        })),
        images: imageUrls,
        videoUrl,
      })

      setRichContentState(generated)
      setRichTemplateId(templateId)
    },
    [
      buildFullCategory,
      descriptionWatch,
      imageUrls,
      nomWatch,
      specs,
      videoUrl,
    ]
  )

  const generateRichContent = useCallback(
    async (opts?: {
      sourceUrl?: string
      templateId?: string
      productName?: string
      category?: string
      description?: string
      images?: string[]
      videoUrl?: string | null
      specs?: { key: string; value: string }[]
    }) => {
      setRichGenerating(true)

      try {
        const payload = {
          sourceUrl: opts?.sourceUrl || richContent.sourceUrl || null,
          templateId: opts?.templateId || richTemplateId || 'generic',
          productName: opts?.productName || nomWatch,
          category: opts?.category || buildFullCategory(),
          description: opts?.description || descriptionWatch,
          images: opts?.images || imageUrls,
          videoUrl: opts?.videoUrl || videoUrl,
          specs:
            opts?.specs ||
            specs.map((spec) => ({ key: spec.key, value: spec.value })),
          currentRichContent: richContent,
        }

        const res = await fetch('/api/ai/admin/generate-rich-page', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        })

        const json = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(
            json?.error || 'Impossible de générer la page riche.'
          )
        }

        const data = json?.data ?? json

        setRichContentState(
          normalizeRichContent(
            {
              ...data,
              sourceUrl: payload.sourceUrl,
              templateId: payload.templateId,
              generatedBy: 'ai',
              updatedAt: new Date().toISOString(),
            },
            richContent
          )
        )

        toast.addToast({
          type: 'success',
          message: 'Page riche générée avec succès.',
        })
      } catch (err: any) {
        toast.addToast({
          type: 'error',
          message:
            err?.message ||
            'Erreur lors de la génération de la page riche.',
        })
      } finally {
        setRichGenerating(false)
      }
    },
    [
      buildFullCategory,
      descriptionWatch,
      imageUrls,
      nomWatch,
      richContent,
      richTemplateId,
      specs,
      toast,
      videoUrl,
    ]
  )

  /* ---------------------------------------------------------- */
  /* Validation                                                  */
  /* ---------------------------------------------------------- */
  const validateValues = useCallback(
    (values: any): string[] => {
      const errorsList: string[] = []

      if (!values.nom || String(values.nom).trim().length < 3) {
        errorsList.push('Le nom du produit est requis (min. 3 caractères).')
      }

      if (!values.description || String(values.description).trim().length < 10) {
        errorsList.push('La description est requise (min. 10 caractères).')
      }

      if (!values.categorie) {
        errorsList.push('La catégorie est requise.')
      }

      if (!Array.isArray(values.images) || values.images.length === 0) {
        errorsList.push('Ajoutez au moins une image produit.')
      }

      if (!positiveNum(values.prix_usd)) {
        errorsList.push('Le prix USD est requis : USD est la devise principale.')
      }

      if (!positiveNum(values.prix)) {
        errorsList.push(
          rate
            ? 'Le prix CDF est invalide.'
            : 'Le prix CDF ne peut pas être calculé : taux de change indisponible.'
        )
      }

      if (num(values.stock) === null || Number(values.stock) < 0) {
        errorsList.push('Le stock doit être un nombre positif.')
      }

      const remise = num(values.remise_percent) ?? 0

      if (remise < 0 || remise > 90) {
        errorsList.push('La remise doit être entre 0 et 90%.')
      }

      if (Array.isArray(values.variantes)) {
        for (const variante of values.variantes) {
          const attrs = Object.values(variante.attributes || {}).filter(
            (attr) => String(attr || '').trim()
          )

          if (attrs.length === 0) {
            errorsList.push(
              'Chaque variante doit avoir au moins un attribut rempli.'
            )
            break
          }

          if (variante.prix_specifique_usd && !rate) {
            errorsList.push(
              'Le taux de change est requis pour enregistrer un prix spécifique en USD.'
            )
            break
          }
        }
      }

      const advancedVariantErrors = validateAdvancedVariants({
        attributes: variantAttributes,
        variantes,
        config: variantConfig,
      })

      errorsList.push(...advancedVariantErrors)

      if (values.delivery_config?.enabled) {
        const activeModes = Object.values(
          values.delivery_config.modes || {}
        ).some((mode: any) => mode?.enabled)

        if (!activeModes) {
          errorsList.push(
            'La livraison avancée est activée, mais aucun mode de livraison nest actif.'
          )
        }
      }

      return errorsList
    },
    [
      rate,
      variantAttributes,
      variantConfig,
      variantes,
    ]
  )

  /* ---------------------------------------------------------- */
  /* Draft interne                                               */
  /* ---------------------------------------------------------- */
  const loadInternalDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(draftKey)

      if (!raw) {
        toast.addToast({ type: 'info', message: 'Aucun brouillon trouvé.' })
        return
      }

      const draft = JSON.parse(raw)
      hydrate(draft)
      setIsDraftLoaded(true)
      toast.addToast({ type: 'success', message: 'Brouillon chargé.' })
    } catch {
      toast.addToast({ type: 'error', message: 'Brouillon corrompu.' })
    }
  }, [draftKey, hydrate, toast])

  const deleteInternalDraft = useCallback(() => {
    localStorage.removeItem(draftKey)
    setIsDraftLoaded(false)
    toast.addToast({ type: 'info', message: 'Brouillon supprimé.' })
  }, [draftKey, toast])

  const resetForm = useCallback(() => {
    const target = baselineRef.current || initialData || {}
    hydrate(target)
  }, [hydrate, initialData])

  /* ---------------------------------------------------------- */
  /* Prix setters                                                */
  /* ---------------------------------------------------------- */
  const setPrice = useCallback(
    (price: number, currency: 'USD' | 'CDF' = 'CDF') => {
      if (currency === 'USD') {
        setPriceUsd(String(price))
        setPriceCdf(rate ? String(Math.round(price * rate)) : '')
      } else {
        setPriceCdf(String(price))
        setPriceUsd(rate ? String((price / rate).toFixed(2)) : '')
      }
    },
    [rate]
  )

  const setDescription = useCallback(
    (desc: string) => {
      setValue('description', desc, {
        shouldDirty: true,
        shouldValidate: true,
      })
    },
    [setValue]
  )

  /* ---------------------------------------------------------- */
  /* Return                                                      */
  /* ---------------------------------------------------------- */
  return {
    // RHF
    register,
    handleSubmit,
    errors,
    isDirty,
    reset,
    rhfGetValues,
    watch,
    setValue,
    formValues,

    // Watches
    nomWatch,
    slugWatch,
    descriptionWatch,
    metaTitleWatch,
    metaDescriptionWatch,
    notesWatch,
    remiseWatch,
    stockWatch,

    // Valeurs numériques pratiques
    stock: num(stockWatch) ?? 0,
    remise_percent: num(remiseWatch) ?? 0,
    prix_usd: positiveNum(priceUsd),

    // Rate
    rate,

    // Médias
    imageUrls,
    mainImageIndex,
    videoUrl,
    videoUploading,
    videoError,

    // Prix
    priceUsd,
    priceCdf,
    originalUsd,

    // Catégorie
    selectedCategoryId,
    initialCategoryPath,
    flatCategories,
    isLoadingCats,
    buildFullCategory,

    // Variantes avancées
    variantes,
    variantAttributes,
    variant_attributes: variantAttributes,
    variantConfig,
    variant_config: variantConfig,
    attributeKeys,

    setVariantes,
    setVariantAttributes,
    setVariantConfig,

    // Alias compatibilité
    updateVariantes: setVariantes,
    updateVariantAttributes: setVariantAttributes,
    updateVariantConfig: setVariantConfig,

    // Variantes legacy
    addVariante,
    removeVariante,
    updateVariante,
    duplicateVariante,
    clearAllVariantes,

    // Livraison avancée
    deliveryConfig,
    delivery_config: deliveryConfig,
    setDeliveryConfig,
    set_delivery_config: setDeliveryConfig,
    applyDeliveryPreset,
    resetDeliveryConfig,
    deliveryPresets: DELIVERY_PRESETS,

    // Specs
    specs,
    addSpec,
    updateSpec,
    removeSpec,
    moveSpec,

    // Tags
    tagsList,
    tagInput,
    setTagInput,
    addTag,
    removeTag,

    // Slug
    slugTouched,
    setSlugTouched,

    // IA
    generatingDescription,
    handleGenerateDescription,
    priceSuggestion,
    priceSuggestionLoading,
    handlePriceSuggestion,
    applyPriceSuggestion,
    setPriceSuggestion,

    // Rich content
    richContent,
    setRichContent,
    richTemplateId,
    setRichTemplateId,
    richGenerating,
    generateRichContent,
    applyRichTemplate,

    // Values
    getProductValues,
    hydrate,
    resetForm,
    validateValues,

    // Draft
    lastSaved,
    autosaveIndicator,
    isDraftLoaded,
    loadInternalDraft,
    deleteInternalDraft,
    draftKey,

    // Images
    handleImageUploaded,
    removeImage,
    moveImage,
    setAsMainImage,

    // Vidéo
    onVideoUpload,
    removeVideo,

    // Prix helpers
    setPriceUsd,
    setPriceCdf,
    setOriginalUsd,
    setPrice,
    setDescription,

    // Constantes
    MAX_IMAGES,
    MAX_VIDEO_SIZE,
    RIBBONS,
  }
}

export type ProductFormState = ReturnType<typeof useProductFormState>