// features/admin/components/AdminProductForm.tsx
'use client'

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useToast } from '@/components/ui/Toast'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useCategories, flattenTree } from '@/hooks/useCategories'

import PhotoUpload from '@/components/PhotoUpload'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'

import AdminBadgeSelector from '@/features/admin/components/AdminBadgeSelector'
import { ProductBadges } from '@/components/badges/ProductBadges'

import {
  X,
  Trash2,
  AlertCircle,
  Loader2,
  Plus,
  ArrowLeft,
  CheckCircle,
  Video,
  Sparkles,
  Eye,
  Save,
  RotateCcw,
  Copy,
  Barcode,
  Tag,
  Star,
  Package,
  Weight,
  Ruler,
  Image as ImageIcon,
  Info,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  Globe,
  ExternalLink,
  Truck,
  BrainCircuit,
  ArrowUpDown,
  Layers,
  DollarSign,
  Percent,
  ShieldCheck,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const MAX_IMAGES = 15
const MAX_VIDEO_SIZE = 30 * 1024 * 1024
const DRAFT_BASE_KEY = 'admin-product-form-draft-v4'
const AUTOSAVE_INTERVAL = 15_000

const RIBBONS = [
  { value: 'none', label: 'Aucun' },
  { value: 'new', label: 'Nouveauté' },
  { value: 'sale', label: 'Soldes' },
  { value: 'popular', label: 'Populaire' },
  { value: 'exclusive', label: 'Exclusivité' },
  { value: 'limited', label: 'Édition limitée' },
]

const FORBIDDEN_WALLET_KEYS = new Set([
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

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const textareaBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 resize-none disabled:opacity-60'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface Variante {
  id: string
  attributes: Record<string, string>
  stock: number
  prix_specifique_usd?: number | null
  prix_specifique_cdf?: number | null
  sku?: string | null
  image?: string | null
}

interface Specification {
  id: string
  key: string
  value: string
}

interface AdminProductFormProps {
  productId?: string
  onSubmit?: (data: any) => Promise<void> | void
  submitting?: boolean
  initialData?: any
  activeSection?: string
  onValuesChange?: (values: any) => void
  enableAutosave?: boolean
  hideActions?: boolean
  storageKey?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMA ZOD                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const productSchema = z.object({
  nom: z.string().min(3, 'Le nom doit comporter au moins 3 caractères').max(200),
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

type ProductFormValues = z.infer<typeof productSchema>

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function num(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function positiveNum(value: any): number | null {
  const n = num(value)
  return n !== null && n > 0 ? n : null
}

function formatUsd(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `$${n.toFixed(2)}`
}

function formatCdf(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${Math.round(n).toLocaleString('fr-FR')} FC`
}

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 120)
}

function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${performance.now().toString(36)}`
}

function cartesianProduct(...arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>(
    (acc, curr) => acc.flatMap((a) => curr.map((c) => [...a, c])),
    [[]]
  )
}

function toStringArray(value: any): string[] {
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

function isForbiddenKey(key: string): boolean {
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

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

const AdminProductForm = forwardRef<any, AdminProductFormProps>(
  (
    {
      productId,
      onSubmit: externalOnSubmit,
      submitting: externalSubmitting = false,
      initialData,
      activeSection: propsActiveSection,
      onValuesChange,
      enableAutosave = true,
      hideActions = Boolean(externalOnSubmit),
      storageKey,
    },
    ref
  ) => {
    const router = useRouter()
    const { user } = useAuth()
    const toast = useToast()
    const { rate } = useExchangeRate()

    const { data: categoriesTree, isLoading: isLoadingCats } = useCategories()
    const flatCategories = useMemo(
      () => (categoriesTree ? flattenTree(categoriesTree) : []),
      [categoriesTree]
    )

    const draftKey = storageKey || `${DRAFT_BASE_KEY}-${productId || 'new'}`
    const shouldAutosave = enableAutosave && !hideActions

    /* ---------------------------------------------------------- */
    /* États locaux                                                */
    /* ---------------------------------------------------------- */

    const [internalActiveSection, setInternalActiveSection] =
      useState('general')
    const activeSection = propsActiveSection ?? internalActiveSection

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [savedId, setSavedId] = useState<string | null>(null)

    const [imageUrls, setImageUrls] = useState<string[]>([])
    const [mainImageIndex, setMainImageIndex] = useState(0)

    const [videoUrl, setVideoUrl] = useState<string | null>(null)
    const [videoUploading, setVideoUploading] = useState(false)
    const [videoError, setVideoError] = useState('')

    const [priceUsd, setPriceUsd] = useState('')
    const [priceCdf, setPriceCdf] = useState('')
    const [originalUsd, setOriginalUsd] = useState('')

    const [selectedCategoryId, setSelectedCategoryId] = useState('')
    const [initialCategoryPath, setInitialCategoryPath] = useState('')

    const [variantes, setVariantes] = useState<Variante[]>([])
    const [attributKeys, setAttributKeys] = useState<string[]>([
      'Couleur',
      'Taille',
    ])
    const [newAttributKey, setNewAttributKey] = useState('')

    const [showBulkGenerator, setShowBulkGenerator] = useState(false)
    const [bulkValues, setBulkValues] = useState<Record<string, string>>({})

    const [specs, setSpecs] = useState<Specification[]>([])
    const [tagsList, setTagsList] = useState<string[]>([])
    const [tagInput, setTagInput] = useState('')

    const [slugTouched, setSlugTouched] = useState(false)
    const prevAutoSlugRef = useRef('')

    const [showPreview, setShowPreview] = useState(false)
    const [previewValues, setPreviewValues] = useState<any>(null)

    const [generatingDescription, setGeneratingDescription] = useState(false)
    const [priceSuggestion, setPriceSuggestion] = useState<{
      suggestedPrice: number
      suggestedPriceUsd?: number
      reasoning: string
    } | null>(null)
    const [priceSuggestionLoading, setPriceSuggestionLoading] = useState(false)

    const [lastSaved, setLastSaved] = useState<string | null>(null)
    const [autosaveIndicator, setAutosaveIndicator] = useState(false)
    const [isDraftLoaded, setIsDraftLoaded] = useState(false)

    const baselineRef = useRef<any>(null)
    const lastHydratedRef = useRef<string | null>(null)
    const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null)

    /* ---------------------------------------------------------- */
    /* Formulaire RHF                                              */
    /* ---------------------------------------------------------- */

    const {
      register,
      handleSubmit,
      formState: { errors, isDirty },
      reset,
      getValues,
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

    /* ---------------------------------------------------------- */
    /* Catégories                                                  */
    /* ---------------------------------------------------------- */

    const buildFullCategory = useCallback((): string => {
      if (selectedCategoryId) {
        const cat = flatCategories.find((c: any) => c.id === selectedCategoryId)
        if (cat?.chemin_complet) return cat.chemin_complet
      }

      const fv = getValues()
      return String(fv.categorie || baselineRef.current?.categorie || '')
    }, [flatCategories, getValues, selectedCategoryId])

    /* ---------------------------------------------------------- */
    /* Valeurs fusionnées                                          */
    /* ---------------------------------------------------------- */

    const getProductValues = useCallback((): any => {
      const fv = getValues()

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

      const normalizedVariantes: any[] = variantes
        .map((v) => {
          const vUsd = positiveNum(v.prix_specifique_usd)
          const vCdf =
            positiveNum(v.prix_specifique_cdf) ??
            (vUsd && rate ? Math.round(vUsd * rate) : 0)

          const vFinalUsd =
            vUsd ?? (vCdf && rate ? Number((vCdf / rate).toFixed(2)) : null)

          return {
            id: v.id,
            attributes: v.attributes || {},
            stock: Number(v.stock) || 0,
            sku: v.sku || null,
            image: v.image || null,
            prix_specifique_usd: vFinalUsd,
            prix_specifique: vCdf || undefined,
            prix_specifique_cdf: vCdf || undefined,
          }
        })
        .filter((v) =>
          Object.values(v.attributes || {}).some((attr) =>
            String(attr || '').trim()
          )
        )

      const filteredSpecs = specs
        .filter((s) => s.key.trim() !== '' && s.value.trim() !== '')
        .map((s) => ({ id: s.id, key: s.key.trim(), value: s.value.trim() }))

      const payload = stripForbidden({
        ...fv,
        slug: fv.slug || slugify(fv.nom || ''),
        categorie: buildFullCategory(),
        categorie_id: selectedCategoryId || null,

        images: imageUrls,
        main_image_index: mainImageIndex,
        video_url: videoUrl,

        variantes: normalizedVariantes.length > 0 ? normalizedVariantes : null,
        specifications: filteredSpecs,

        tags: tagsList.join(', '),

        prix_usd: computedUsd || null,
        prix: computedCdf || null,
        prix_cdf: computedCdf || null,

        prix_original_usd: computedOriginalUsd || null,
        prix_original: computedOriginalCdf || null,
        remise_percent: computedRemise || null,
      })

      return payload
    }, [
      buildFullCategory,
      getValues,
      imageUrls,
      mainImageIndex,
      originalUsd,
      priceCdf,
      priceUsd,
      rate,
      selectedCategoryId,
      specs,
      tagsList,
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

        const normalizedVariantes: Variante[] = Array.isArray(clean.variantes)
          ? clean.variantes.map((v: any) => {
              const vUsd = positiveNum(v.prix_specifique_usd)
              const vCdf = positiveNum(v.prix_specifique ?? v.prix_specifique_cdf)

              return {
                id: v.id && String(v.id).trim() ? String(v.id) : generateUniqueId(),
                attributes: v.attributes || {},
                stock: Number(v.stock) || 0,
                sku: v.sku || null,
                image: v.image || null,
                prix_specifique_usd:
                  vUsd ?? (vCdf && rate ? Number((vCdf / rate).toFixed(2)) : null),
                prix_specifique_cdf:
                  vCdf ?? (vUsd && rate ? Math.round(vUsd * rate) : null),
              }
            })
          : []

        setVariantes(normalizedVariantes)

        const keys = new Set<string>()
        normalizedVariantes.forEach((v) =>
          Object.keys(v.attributes || {}).forEach((k) => keys.add(k))
        )

        if (keys.size > 0) {
          setAttributKeys(Array.from(keys))
        }

        setSpecs(
          Array.isArray(clean.specifications)
            ? clean.specifications.map((s: any) => ({
                id: s.id || generateUniqueId(),
                key: String(s.key || ''),
                value: String(s.value || ''),
              }))
            : []
        )

        setTagsList(toStringArray(clean.tags))
        setSlugTouched(Boolean(clean.slug))
        setError('')
        setSuccess('')
      },
      [rate, reset]
    )

    useEffect(() => {
      if (!user) return

      const dataId = String(initialData?.id || productId || 'new-init')
      if (lastHydratedRef.current === dataId) return

      if (initialData && (initialData.id || initialData.nom)) {
        hydrate(initialData)
        lastHydratedRef.current = dataId
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
            setSavedId(data.id || productId)
            lastHydratedRef.current = dataId
          } catch (err: any) {
            toast.addToast({
              type: 'error',
              message: err?.message || 'Impossible de charger le produit.',
            })
          }
        }

        fetchProduct()
      }
    }, [hydrate, initialData, productId, toast, user])

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

      setVariantes((prev) =>
        prev.map((v) => {
          const usd = positiveNum(v.prix_specifique_usd)
          const cdf = positiveNum(v.prix_specifique_cdf)

          return {
            ...v,
            prix_specifique_usd:
              usd ?? (cdf ? Number((cdf / rate).toFixed(2)) : null),
            prix_specifique_cdf:
              cdf ?? (usd ? Math.round(usd * rate) : null),
          }
        })
      )
    }, [priceCdf, priceUsd, rate])

    /* ---------------------------------------------------------- */
    /* Catégorie initiale                                          */
    /* ---------------------------------------------------------- */

    useEffect(() => {
      if (selectedCategoryId || !initialCategoryPath || flatCategories.length === 0) {
        return
      }

      const match = flatCategories.find(
        (c: any) =>
          c.chemin_complet === initialCategoryPath ||
          c.nom === initialCategoryPath
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
    /* Tags                                                        */
    /* ---------------------------------------------------------- */

    useEffect(() => {
      setValue('tags', tagsList.join(', '), { shouldDirty: true })
    }, [setValue, tagsList])

    /* ---------------------------------------------------------- */
    /* onValuesChange                                              */
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
      selectedCategoryId,
      specs,
      tagsList,
      variantes,
      videoUrl,
    ])

    /* ---------------------------------------------------------- */
    /* Autosave                                                    */
    /* ---------------------------------------------------------- */

    useEffect(() => {
      if (!shouldAutosave) return

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
    }, [draftKey, getProductValues, shouldAutosave])

    const loadDraft = useCallback(() => {
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

    const deleteDraft = useCallback(() => {
      localStorage.removeItem(draftKey)
      setIsDraftLoaded(false)
      toast.addToast({ type: 'info', message: 'Brouillon supprimé.' })
    }, [draftKey, toast])

    /* ---------------------------------------------------------- */
    /* Images                                                      */
    /* ---------------------------------------------------------- */

    const handleImageUploaded = useCallback((url: string) => {
      setImageUrls((prev) => [...prev, url].slice(0, MAX_IMAGES))
    }, [])

    const removeImage = useCallback(
      (index: number) => {
        setImageUrls((prev) => prev.filter((_, i) => i !== index))

        setMainImageIndex((prev) => {
          if (index < prev) return prev - 1
          if (index === prev) return Math.max(0, prev - 1)
          return prev
        })
      },
      []
    )

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
          setVideoError(`Taille maximale : ${MAX_VIDEO_SIZE / (1024 * 1024)} Mo.`)
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
          setVideoError(err?.message || 'Erreur lors de l’upload vidéo.')
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
    /* Variantes                                                   */
    /* ---------------------------------------------------------- */

    const addVariante = useCallback(() => {
      const newVariante: Variante = {
        id: generateUniqueId(),
        attributes: attributKeys.reduce(
          (acc, key) => ({ ...acc, [key]: '' }),
          {} as Record<string, string>
        ),
        stock: 0,
        prix_specifique_usd: null,
        prix_specifique_cdf: null,
        sku: null,
        image: null,
      }

      setVariantes((prev) => [...prev, newVariante])
    }, [attributKeys])

    const addAttributKey = useCallback(() => {
      const key = newAttributKey.trim()
      if (!key) return
      if (attributKeys.includes(key)) {
        toast.addToast({ type: 'info', message: 'Cet attribut existe déjà.' })
        return
      }

      setAttributKeys((prev) => [...prev, key])
      setVariantes((prev) =>
        prev.map((v) => ({
          ...v,
          attributes: { ...v.attributes, [key]: '' },
        }))
      )
      setBulkValues((prev) => ({ ...prev, [key]: '' }))
      setNewAttributKey('')
    }, [attributKeys, newAttributKey, toast])

    const removeAttributKey = useCallback(
      (key: string) => {
        if (attributKeys.length <= 1) {
          toast.addToast({
            type: 'error',
            message: 'Il faut au moins un attribut.',
          })
          return
        }

        setAttributKeys((prev) => prev.filter((k) => k !== key))
        setVariantes((prev) =>
          prev.map((v) => {
            const next = { ...v.attributes }
            delete next[key]
            return { ...v, attributes: next }
          })
        )
        setBulkValues((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      },
      [attributKeys.length, toast]
    )

    const updateVariante = useCallback(
      (
        id: string,
        field: keyof Variante | 'attribute',
        value: any,
        attributeKey?: string
      ) => {
        setVariantes((prev) =>
          prev.map((v) => {
            if (v.id !== id) return v

            if (field === 'attribute' && attributeKey) {
              return {
                ...v,
                attributes: { ...v.attributes, [attributeKey]: value },
              }
            }

            return { ...v, [field]: value }
          })
        )
      },
      []
    )

    const removeVariante = useCallback((id: string) => {
      setVariantes((prev) => prev.filter((v) => v.id !== id))
    }, [])

    const duplicateVariante = useCallback(
      (id: string) => {
        const source = variantes.find((v) => v.id === id)
        if (!source) return

        setVariantes((prev) => [
          ...prev,
          {
            ...source,
            id: generateUniqueId(),
            attributes: { ...source.attributes },
          },
        ])
      },
      [variantes]
    )

    const clearAllVariantes = useCallback(() => {
      if (variantes.length === 0) return
      if (typeof window !== 'undefined' && !window.confirm('Supprimer toutes les variantes ?')) {
        return
      }
      setVariantes([])
    }, [variantes.length])

    const generateBulkVariantes = useCallback(() => {
      const arrays = attributKeys.map((key) =>
        String(bulkValues[key] || '')
          .split(/[\n,]/)
          .map((v) => v.trim())
          .filter(Boolean)
      )

      if (arrays.some((arr) => arr.length === 0)) {
        toast.addToast({
          type: 'error',
          message: 'Renseigne au moins une valeur pour chaque attribut.',
        })
        return
      }

      const combos = cartesianProduct(...arrays)
      const existingKeys = new Set(
        variantes.map((v) => JSON.stringify(v.attributes))
      )

      const newVariantes: Variante[] = combos
        .filter((combo) => {
          const attributes = attributKeys.reduce(
            (acc, key, idx) => ({ ...acc, [key]: combo[idx] || '' }),
            {} as Record<string, string>
          )
          return !existingKeys.has(JSON.stringify(attributes))
        })
        .map((combo) => ({
          id: generateUniqueId(),
          attributes: attributKeys.reduce(
            (acc, key, idx) => ({ ...acc, [key]: combo[idx] || '' }),
            {} as Record<string, string>
          ),
          stock: 0,
          prix_specifique_usd: null,
          prix_specifique_cdf: null,
          sku: null,
          image: null,
        }))

      if (newVariantes.length === 0) {
        toast.addToast({ type: 'info', message: 'Aucune nouvelle variante à ajouter.' })
        return
      }

      setVariantes((prev) => [...prev, ...newVariantes])
      setShowBulkGenerator(false)
      toast.addToast({
        type: 'success',
        message: `${newVariantes.length} variante(s) ajoutée(s).`,
      })
    }, [attributKeys, bulkValues, toast, variantes])

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
          prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
        )
      },
      []
    )

    const removeSpec = useCallback((id: string) => {
      setSpecs((prev) => prev.filter((s) => s.id !== id))
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
      setTagsList((prev) => prev.filter((t) => t !== tag))
    }, [])

    /* ---------------------------------------------------------- */
    /* IA                                                          */
    /* ---------------------------------------------------------- */

    const handleGenerateDescription = useCallback(async () => {
      const productName = String(watch('nom') || '')

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
          message: err?.message || 'Impossible de générer la description.',
        })
      } finally {
        setGeneratingDescription(false)
      }
    }, [buildFullCategory, setValue, toast, watch])

    const handlePriceSuggestion = useCallback(async () => {
      if (!productId) {
        toast.addToast({
          type: 'info',
          message: 'Enregistre d’abord le produit pour obtenir une suggestion.',
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
          message: `Prix suggéré : ${formatUsd(suggestedUsd)} ≈ ${formatCdf(data.suggestedPrice)}`,
        })
      } catch (err: any) {
        toast.addToast({
          type: 'error',
          message: err?.message || 'Impossible d’obtenir une suggestion.',
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
        (suggestedCdf && rate ? Number((suggestedCdf / rate).toFixed(2)) : null)

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
    /* Validation / soumission                                     */
    /* ---------------------------------------------------------- */

    const validateValues = useCallback((values: any): string[] => {
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
        for (const v of values.variantes) {
          const attrs = Object.values(v.attributes || {}).filter((a) =>
            String(a || '').trim()
          )

          if (attrs.length === 0) {
            errorsList.push('Chaque variante doit avoir au moins un attribut rempli.')
            break
          }

          if (v.prix_specifique_usd && !rate) {
            errorsList.push(
              'Le taux de change est requis pour enregistrer un prix spécifique en USD.'
            )
            break
          }
        }
      }

      return errorsList
    }, [rate])

    const submitInternal = useCallback(
      async (values: any) => {
        setLoading(true)
        setError('')
        setSuccess('')

        try {
          const url = productId
            ? `/api/admin/produits/${productId}`
            : '/api/admin/produits'

          const method = productId ? 'PUT' : 'POST'

          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(values),
          })

          const result = await res.json().catch(() => ({}))

          if (!res.ok) {
            throw new Error(result?.error || 'Erreur lors de l’enregistrement.')
          }

          const message = productId
            ? 'Produit mis à jour avec succès.'
            : 'Produit créé avec succès.'

          setSuccess(message)
          toast.addToast({ type: 'success', message })

          localStorage.removeItem(draftKey)

          if (!productId && (result?.id || result?.data?.id)) {
            setSavedId(result.id || result.data.id)
          }
        } catch (err: any) {
          const message = err?.message || 'Impossible d’enregistrer le produit.'
          setError(message)
          toast.addToast({ type: 'error', message })
        } finally {
          setLoading(false)
        }
      },
      [draftKey, productId, toast]
    )

    const onValidSubmit = useCallback(async () => {
      const values = getProductValues()
      const validationErrors = validateValues(values)

      if (validationErrors.length > 0) {
        const message = validationErrors.join(' • ')
        setError(message)
        toast.addToast({ type: 'error', message })
        return
      }

      if (externalOnSubmit) {
        await externalOnSubmit(values)
        return
      }

      await submitInternal(values)
    }, [externalOnSubmit, getProductValues, submitInternal, toast, validateValues])

    const openPreview = useCallback(() => {
      setPreviewValues(getProductValues())
      setShowPreview(true)
    }, [getProductValues])

    /* ---------------------------------------------------------- */
    /* Imperative handle                                           */
    /* ---------------------------------------------------------- */

    useImperativeHandle(
      ref,
      () => ({
        getValues: getProductValues,
        getProductValues,
        reset: (data?: any) => {
          const target = data || baselineRef.current || initialData || {}
          hydrate(target)
        },
        setDescription: (desc: string) => {
          setValue('description', desc, {
            shouldDirty: true,
            shouldValidate: true,
          })
          toast.addToast({ type: 'success', message: 'Description mise à jour.' })
        },
        setPrice: (price: number, currency: 'USD' | 'CDF' = 'CDF') => {
          if (currency === 'USD') {
            setPriceUsd(String(price))
            setPriceCdf(rate ? String(Math.round(price * rate)) : '')
          } else {
            setPriceCdf(String(price))
            setPriceUsd(rate ? String((price / rate).toFixed(2)) : '')
          }
        },
        setPriceUsd: (price: number) => {
          setPriceUsd(String(price))
          setPriceCdf(rate ? String(Math.round(price * rate)) : '')
        },
        setPriceCdf: (price: number) => {
          setPriceCdf(String(price))
          setPriceUsd(rate ? String((price / rate).toFixed(2)) : '')
        },
        validate: () => validateValues(getProductValues()),
      }),
      [
        getProductValues,
        hydrate,
        initialData,
        rate,
        setValue,
        toast,
        validateValues,
      ]
    )

    /* ---------------------------------------------------------- */
    /* Rendu                                                       */
    /* ---------------------------------------------------------- */

    if (!user) return null

    const isSubmitting = externalSubmitting || loading

    const sections = [
      { id: 'general', label: 'Général', icon: <Package size={16} /> },
      { id: 'media', label: 'Médias', icon: <ImageIcon size={16} /> },
      { id: 'prix', label: 'Prix & Stock', icon: <DollarSign size={16} /> },
      { id: 'variantes', label: 'Variantes', icon: <Layers size={16} /> },
      { id: 'livraison', label: 'Livraison', icon: <Truck size={16} /> },
      { id: 'specs', label: 'Spécifications', icon: <Info size={16} /> },
      { id: 'seo', label: 'SEO & Tags', icon: <Globe size={16} /> },
      { id: 'badges', label: 'Badges', icon: <Tag size={16} /> },
      { id: 'details', label: 'Détails', icon: <Settings2Placeholder /> },
    ]

    const currentPriceUsd = positiveNum(priceUsd)
    const currentPriceCdf = positiveNum(priceCdf)

    return (
      <div className="relative">
        {!hideActions && (
          <div className="sticky top-16 z-20 -mx-4 mb-6 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-4 py-3 shadow-sm backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-xl p-2 text-muted-foreground transition hover:bg-gold-400/10 hover:text-gold-500"
                aria-label="Retour"
              >
                <ArrowLeft size={20} />
              </button>

              <div>
                <h2 className="font-semibold text-foreground">
                  {productId ? 'Modifier le produit' : 'Nouveau produit'}
                </h2>

                {autosaveIndicator && (
                  <p className="text-xs text-green-500">
                    Brouillon sauvegardé à {lastSaved}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip content="Charger le brouillon">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={loadDraft}
                  leftIcon={<RotateCcw size={14} />}
                >
                  Brouillon
                </Button>
              </Tooltip>

              {isDraftLoaded && (
                <Tooltip content="Supprimer le brouillon">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={deleteDraft}
                  >
                    <Trash2 size={14} className="text-red-500" />
                  </Button>
                </Tooltip>
              )}

              <Tooltip content="Aperçu">
                <Button
                  type="button"
                  variant="outline-gold"
                  size="sm"
                  onClick={openPreview}
                  leftIcon={<Eye size={14} />}
                >
                  Aperçu
                </Button>
              </Tooltip>

              <Button
                type="button"
                variant="luxe"
                size="sm"
                onClick={handleSubmit(onValidSubmit)}
                loading={isSubmitting}
                leftIcon={<Save size={14} />}
              >
                {productId ? 'Mettre à jour' : 'Publier'}
              </Button>
            </div>
          </div>
        )}

        {!propsActiveSection && !hideActions && (
          <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setInternalActiveSection(sec.id)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition',
                  activeSection === sec.id
                    ? 'border-gold-500 bg-gold-500 text-white shadow-gold'
                    : 'border-border bg-card text-muted-foreground hover:border-gold-400'
                )}
              >
                {sec.icon}
                {sec.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
          >
            <AlertCircle size={20} />
            <span className="text-sm">{error}</span>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
          >
            <CheckCircle size={20} />
            <span className="text-sm">{success}</span>
          </motion.div>
        )}

        <Card variant="glass" className="border-gold-400/20 shadow-soft">
          <CardContent className="space-y-6 p-6">
            <AnimatePresence mode="wait">
              {/* SECTION : Général */}
              {activeSection === 'general' && (
                <motion.div
                  key="general"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <Input
                    variant="glass"
                    label="Nom du produit *"
                    {...register('nom')}
                    error={errors.nom?.message}
                    placeholder="Ex : iPhone 15 Pro Max 256 Go"
                  />

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Slug URL
                    </label>
                    <input
                      {...register('slug')}
                      onChange={(e) => {
                        setSlugTouched(true)
                        e.target.value = slugify(e.target.value)
                        // @ts-expect-error native event target value assignment
                        register('slug').onChange(e)
                      }}
                      className={inputBase}
                      placeholder="iphone-15-pro-max-256-go"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      /produits/{slugWatch || slugify(nomWatch || '')}
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Description *
                    </label>

                    <textarea
                      {...register('description')}
                      rows={6}
                      className={textareaBase}
                      placeholder="Décrivez le produit en détail..."
                    />

                    {errors.description && (
                      <p className="mt-1 text-xs text-red-500">
                        {errors.description.message}
                      </p>
                    )}

                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {descriptionWatch?.length || 0}/5000
                      </p>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleGenerateDescription}
                        loading={generatingDescription}
                        leftIcon={<BrainCircuit size={14} />}
                      >
                        Générer avec IA
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Catégorie *
                    </label>

                    {isLoadingCats ? (
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                        <Spinner size="sm" className="animate-spin" />
                        Chargement des catégories...
                      </div>
                    ) : (
                      <select
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        className={inputBase}
                        required
                      >
                        <option value="">Sélectionner une catégorie...</option>
                        {flatCategories.map((cat: any) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.depth > 0 ? `${'— '.repeat(cat.depth)} ` : ''}
                            {cat.nom}
                          </option>
                        ))}
                      </select>
                    )}

                    {selectedCategoryId && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Chemin : {buildFullCategory()}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input
                      variant="glass"
                      label="SKU (référence interne)"
                      {...register('sku')}
                      placeholder="SKU-001"
                    />

                    <Input
                      variant="glass"
                      label="Code-barres (EAN/UPC)"
                      {...register('barcode')}
                      placeholder="1234567890123"
                      leftIcon={<Barcode size={16} />}
                    />
                  </div>

                  <Input
                    variant="glass"
                    label="Marque"
                    {...register('marque')}
                    placeholder="Apple, Samsung…"
                  />
                </motion.div>
              )}

              {/* SECTION : Médias */}
              {activeSection === 'media' && (
                <motion.div
                  key="media"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <label className="text-sm font-medium text-foreground">
                        Images ({imageUrls.length}/{MAX_IMAGES})
                      </label>

                      <span className="text-xs text-muted-foreground">
                        Étoile = image principale • flèches = réordonner
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <AnimatePresence>
                        {imageUrls.map((url, idx) => (
                          <motion.div
                            key={`${url}-${idx}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className={cn(
                              'group relative aspect-square overflow-hidden rounded-xl border-2',
                              idx === mainImageIndex
                                ? 'border-gold-400 ring-2 ring-gold-400/30'
                                : 'border-border'
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt=""
                              className="h-full w-full object-cover"
                            />

                            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                              <Tooltip content="Image principale">
                                <button
                                  type="button"
                                  onClick={() => setAsMainImage(idx)}
                                  className="rounded-full bg-white/90 p-1.5"
                                >
                                  <Star
                                    size={14}
                                    className={
                                      idx === mainImageIndex
                                        ? 'text-gold-500 fill-current'
                                        : 'text-neutral-500'
                                    }
                                  />
                                </button>
                              </Tooltip>

                              <Tooltip content="Monter">
                                <button
                                  type="button"
                                  onClick={() => moveImage(idx, -1)}
                                  disabled={idx === 0}
                                  className="rounded-full bg-white/90 p-1.5 disabled:opacity-40"
                                >
                                  <ChevronUp size={14} />
                                </button>
                              </Tooltip>

                              <Tooltip content="Descendre">
                                <button
                                  type="button"
                                  onClick={() => moveImage(idx, 1)}
                                  disabled={idx === imageUrls.length - 1}
                                  className="rounded-full bg-white/90 p-1.5 disabled:opacity-40"
                                >
                                  <ChevronDown size={14} />
                                </button>
                              </Tooltip>

                              <Tooltip content="Supprimer">
                                <button
                                  type="button"
                                  onClick={() => removeImage(idx)}
                                  className="rounded-full bg-white/90 p-1.5"
                                >
                                  <Trash2 size={14} className="text-red-500" />
                                </button>
                              </Tooltip>
                            </div>

                            {idx === mainImageIndex && (
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

                        {imageUrls.length < MAX_IMAGES && (
                          <div className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-gold-400/30 bg-muted/30">
                            <PhotoUpload
                              onUpload={handleImageUploaded}
                              bucket="photos-produits"
                              folder={`${user.id}/images`}
                              label="Ajouter"
                              aspectRatio="square"
                              size="md"
                            />
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Vidéo (optionnelle, max 30 Mo)
                    </label>

                    <div className="rounded-xl border-2 border-dashed border-gold-400/30 p-4 text-center">
                      <input
                        type="file"
                        accept="video/*"
                        onChange={onVideoUpload}
                        disabled={videoUploading}
                        className="hidden"
                        id="video-upload"
                      />

                      <label
                        htmlFor="video-upload"
                        className="inline-flex cursor-pointer items-center gap-2 text-gold-500 hover:text-gold-600"
                      >
                        <Video size={18} />
                        {videoUploading ? (
                          <Loader2 className="animate-spin" size={18} />
                        ) : videoUrl ? (
                          'Modifier la vidéo'
                        ) : (
                          'Ajouter une vidéo'
                        )}
                      </label>

                      {videoError && (
                        <p className="mt-2 text-xs text-red-500">{videoError}</p>
                      )}

                      {videoUrl && (
                        <div className="relative mx-auto mt-3 max-w-sm overflow-hidden rounded-xl border border-border">
                          <video controls src={videoUrl} className="w-full" />

                          <button
                            type="button"
                            onClick={removeVideo}
                            className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* SECTION : Prix & Stock */}
              {activeSection === 'prix' && (
                <motion.div
                  key="prix"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
                    <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <DollarSign size={16} className="text-gold-500" />
                      Prix principal : USD
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">
                          Prix USD *
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={priceUsd}
                          onChange={(e) => {
                            const value = e.target.value
                            setPriceUsd(value)

                            const n = Number(value)
                            if (Number.isFinite(n) && n > 0 && rate) {
                              setPriceCdf(String(Math.round(n * rate)))
                            }
                          }}
                          className={inputBase}
                          placeholder="Ex : 49.99"
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-foreground">
                          Prix CDF
                        </span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={priceCdf}
                          onChange={(e) => {
                            const value = e.target.value
                            setPriceCdf(value)

                            const n = Number(value)
                            if (Number.isFinite(n) && n > 0 && rate) {
                              setPriceUsd((n / rate).toFixed(2))
                            }
                          }}
                          className={inputBase}
                          placeholder="Calculé automatiquement"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {rate ? (
                        <Badge variant="accent" size="sm">
                          1 USD ≈ {formatCdf(Number(rate))}
                        </Badge>
                      ) : (
                        <Badge variant="danger" size="sm">
                          <AlertCircle size={12} className="mr-1" />
                          Taux indisponible
                        </Badge>
                      )}

                      {currentPriceUsd && currentPriceCdf && (
                        <span className="text-muted-foreground">
                          {formatUsd(currentPriceUsd)} ≈ {formatCdf(currentPriceCdf)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-foreground">
                        Prix barré USD (optionnel)
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={originalUsd}
                        onChange={(e) => setOriginalUsd(e.target.value)}
                        className={inputBase}
                        placeholder="Ex : 59.99"
                      />
                      <span className="text-xs text-muted-foreground">
                        Si vide, calculé depuis la remise.
                      </span>
                    </label>

                    <Input
                      variant="glass"
                      label="Remise (%)"
                      type="number"
                      step="0.1"
                      min="0"
                      max="90"
                      {...register('remise_percent', { valueAsNumber: true })}
                      placeholder="Ex : 15"
                      leftIcon={<Percent size={14} />}
                    />
                  </div>

                  {priceSuggestion && (
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-200">
                      <Sparkles size={16} className="text-purple-500" />

                      <div>
                        <p className="font-medium">Suggestion IA</p>
                        <p className="text-xs opacity-90">
                          {priceSuggestion.reasoning || 'Analyse du marché'}
                        </p>
                      </div>

                      <div className="ml-auto flex items-center gap-2">
                        <span className="font-semibold">
                          {formatUsd(
                            positiveNum(priceSuggestion.suggestedPriceUsd) ??
                              (positiveNum(priceSuggestion.suggestedPrice) && rate
                                ? priceSuggestion.suggestedPrice / rate
                                : null)
                          )}
                        </span>

                        <Button
                          type="button"
                          size="sm"
                          variant="accent"
                          onClick={applyPriceSuggestion}
                        >
                          Appliquer
                        </Button>

                        <button
                          type="button"
                          onClick={() => setPriceSuggestion(null)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {productId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handlePriceSuggestion}
                      loading={priceSuggestionLoading}
                      leftIcon={<Zap size={14} className="text-purple-500" />}
                    >
                      Obtenir une suggestion de prix IA
                    </Button>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      variant="glass"
                      label="Stock *"
                      type="number"
                      {...register('stock', { valueAsNumber: true })}
                      error={errors.stock?.message}
                    />

                    <Input
                      variant="glass"
                      label="Limite par client"
                      type="number"
                      {...register('limit_per_client', { valueAsNumber: true })}
                      placeholder="Optionnel"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        {...register('negociable')}
                        className="rounded text-gold-500 focus:ring-gold-500"
                      />
                      <span>Produit négociable</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        {...register('featured')}
                        className="rounded text-gold-500 focus:ring-gold-500"
                      />
                      <span>Produit en vedette</span>
                    </label>
                  </div>
                </motion.div>
              )}

              {/* SECTION : Variantes */}
              {activeSection === 'variantes' && (
                <motion.div
                  key="variantes"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold text-foreground">
                      Variantes ({variantes.length})
                    </h3>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline-gold"
                        size="sm"
                        onClick={addVariante}
                        leftIcon={<Plus size={14} />}
                      >
                        Ajouter
                      </Button>

                      <Button
                        type="button"
                        variant="outline-gold"
                        size="sm"
                        onClick={() => setShowBulkGenerator((v) => !v)}
                        leftIcon={<Zap size={14} />}
                      >
                        Générer
                      </Button>

                      {variantes.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearAllVariantes}
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {attributKeys.map((key) => (
                      <Badge
                        key={key}
                        variant="gold"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => removeAttributKey(key)}
                      >
                        {key}
                        <X size={12} className="ml-1" />
                      </Badge>
                    ))}

                    <div className="flex items-center gap-2">
                      <input
                        value={newAttributKey}
                        onChange={(e) => setNewAttributKey(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addAttributKey()
                          }
                        }}
                        placeholder="Nouvel attribut"
                        className={cn(inputBase, 'h-9 w-40 py-1 text-xs')}
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={addAttributKey}
                      >
                        <Plus size={14} />
                      </Button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showBulkGenerator && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden rounded-2xl border border-border bg-background/60 p-4"
                      >
                        <p className="mb-3 text-sm font-medium text-foreground">
                          Génération par combinaisons
                        </p>

                        <div className="space-y-3">
                          {attributKeys.map((key) => (
                            <label key={key} className="block space-y-1.5">
                              <span className="text-xs font-medium text-muted-foreground">
                                {key} (valeurs séparées par virgule ou ligne)
                              </span>

                              <textarea
                                value={bulkValues[key] || ''}
                                onChange={(e) =>
                                  setBulkValues((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                rows={2}
                                className={textareaBase}
                                placeholder={`Rouge, Bleu, Vert`}
                              />
                            </label>
                          ))}
                        </div>

                        <div className="mt-3 flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowBulkGenerator(false)}
                          >
                            Annuler
                          </Button>

                          <Button
                            type="button"
                            variant="luxe"
                            size="sm"
                            onClick={generateBulkVariantes}
                            leftIcon={<Sparkles size={14} />}
                          >
                            Générer les variantes
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {variantes.map((v, idx) => (
                      <motion.div
                        key={v.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="group relative rounded-xl border border-border bg-card p-4"
                      >
                        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => duplicateVariante(v.id)}
                            className="p-1 text-muted-foreground hover:text-gold-500"
                          >
                            <Copy size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => removeVariante(v.id)}
                            className="p-1 text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <p className="mb-3 text-sm font-medium">
                          Variante {idx + 1}
                        </p>

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          {attributKeys.map((key) => (
                            <label key={key} className="block space-y-1">
                              <span className="text-xs text-muted-foreground">
                                {key}
                              </span>

                              <input
                                type="text"
                                value={v.attributes[key] || ''}
                                onChange={(e) =>
                                  updateVariante(
                                    v.id,
                                    'attribute',
                                    e.target.value,
                                    key
                                  )
                                }
                                className={cn(inputBase, 'py-1.5 text-sm')}
                                placeholder={key}
                              />
                            </label>
                          ))}

                          <label className="block space-y-1">
                            <span className="text-xs text-muted-foreground">
                              Stock
                            </span>

                            <input
                              type="number"
                              min="0"
                              value={v.stock}
                              onChange={(e) =>
                                updateVariante(
                                  v.id,
                                  'stock',
                                  Number(e.target.value) || 0
                                )
                              }
                              className={cn(inputBase, 'py-1.5 text-sm')}
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
                              value={v.prix_specifique_usd ?? ''}
                              onChange={(e) => {
                                const value = e.target.value
                                const n = Number(value)

                                updateVariante(
                                  v.id,
                                  'prix_specifique_usd',
                                  Number.isFinite(n) && n > 0 ? n : null
                                )

                                updateVariante(
                                  v.id,
                                  'prix_specifique_cdf',
                                  Number.isFinite(n) && n > 0 && rate
                                    ? Math.round(n * rate)
                                    : null
                                )
                              }}
                              className={cn(inputBase, 'py-1.5 text-sm')}
                              placeholder="Optionnel"
                            />

                            {v.prix_specifique_cdf && (
                              <span className="block text-[10px] text-muted-foreground">
                                ≈ {formatCdf(v.prix_specifique_cdf)}
                              </span>
                            )}
                          </label>

                          <label className="block space-y-1">
                            <span className="text-xs text-muted-foreground">
                              SKU variante
                            </span>

                            <input
                              type="text"
                              value={v.sku || ''}
                              onChange={(e) =>
                                updateVariante(v.id, 'sku', e.target.value)
                              }
                              className={cn(inputBase, 'py-1.5 text-sm')}
                              placeholder="Optionnel"
                            />
                          </label>

                          <div className="col-span-2 md:col-span-1">
                            <span className="mb-1 block text-xs text-muted-foreground">
                              Image variante
                            </span>

                            {v.image ? (
                              <div className="relative h-24 w-full overflow-hidden rounded-lg border border-border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={v.image}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />

                                <button
                                  type="button"
                                  onClick={() =>
                                    updateVariante(v.id, 'image', null)
                                  }
                                  className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <PhotoUpload
                                onUpload={(url) =>
                                  updateVariante(v.id, 'image', url)
                                }
                                bucket="photos-produits"
                                folder={`${user.id}/variantes`}
                                label="Ajouter"
                                aspectRatio="square"
                                size="sm"
                              />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {variantes.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Aucune variante. Clique sur “Ajouter” ou “Générer”.
                    </p>
                  )}
                </motion.div>
              )}

              {/* SECTION : Livraison */}
              {activeSection === 'livraison' && (
                <motion.div
                  key="livraison"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Frais et disponibilité de livraison
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Définis le tarif en FC et active/désactive chaque mode pour
                      ce produit.
                    </p>
                  </div>

                  <Input
                    variant="glass"
                    label="Délai de livraison estimé"
                    {...register('delay_livraison')}
                    placeholder="Ex : 24-48h, 3-5 jours"
                    leftIcon={<Clock size={14} />}
                  />

                  {/* Domicile */}
                  <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Livraison à domicile
                      </span>

                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          {...register('livraison_domicile_active')}
                        />

                        <div className="h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-gold-500 peer-checked:after:translate-x-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gold-300 dark:bg-gray-700" />
                      </label>
                    </div>

                    <Input
                      variant="glass"
                      label="Tarif (FC)"
                      type="number"
                      step="any"
                      {...register('livraison_domicile', { valueAsNumber: true })}
                      placeholder="Ex : 5000"
                      disabled={!watch('livraison_domicile_active')}
                    />
                  </div>

                  {/* Point retrait */}
                  <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Point de retrait
                      </span>

                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          {...register('livraison_point_retrait_active')}
                        />

                        <div className="h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-gold-500 peer-checked:after:translate-x-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gold-300 dark:bg-gray-700" />
                      </label>
                    </div>

                    <Input
                      variant="glass"
                      label="Tarif (FC)"
                      type="number"
                      step="any"
                      {...register('livraison_point_retrait', {
                        valueAsNumber: true,
                      })}
                      placeholder="Ex : 0"
                      disabled={!watch('livraison_point_retrait_active')}
                    />
                  </div>

                  {/* Express */}
                  <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Livraison express
                      </span>

                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          {...register('livraison_express_active')}
                        />

                        <div className="h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-gold-500 peer-checked:after:translate-x-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gold-300 dark:bg-gray-700" />
                      </label>
                    </div>

                    <Input
                      variant="glass"
                      label="Supplément express (FC)"
                      type="number"
                      step="any"
                      {...register('livraison_express', { valueAsNumber: true })}
                      placeholder="Supplément express"
                      disabled={!watch('livraison_express_active')}
                    />

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        {...register('express_gratuit')}
                        className="rounded text-gold-500 focus:ring-gold-500"
                      />
                      <span>Livraison express offerte sur ce produit</span>
                    </label>
                  </div>
                </motion.div>
              )}

              {/* SECTION : Spécifications */}
              {activeSection === 'specs' && (
                <motion.div
                  key="specs"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">
                      Spécifications techniques
                    </h3>

                    <Button
                      type="button"
                      variant="outline-gold"
                      size="sm"
                      onClick={addSpec}
                      leftIcon={<Plus size={14} />}
                    >
                      Ajouter une ligne
                    </Button>
                  </div>

                  <AnimatePresence>
                    {specs.map((spec, idx) => (
                      <motion.div
                        key={spec.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                      >
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => moveSpec(idx, -1)}
                            disabled={idx === 0}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronUp size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => moveSpec(idx, 1)}
                            disabled={idx === specs.length - 1}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>

                        <div className="flex-1">
                          <input
                            type="text"
                            value={spec.key}
                            onChange={(e) =>
                              updateSpec(spec.id, 'key', e.target.value)
                            }
                            placeholder="Clé (ex : Taille)"
                            className={cn(inputBase, 'py-1.5 text-sm')}
                          />
                        </div>

                        <div className="flex-1">
                          <input
                            type="text"
                            value={spec.value}
                            onChange={(e) =>
                              updateSpec(spec.id, 'value', e.target.value)
                            }
                            placeholder="Valeur (ex : 45 cm)"
                            className={cn(inputBase, 'py-1.5 text-sm')}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeSpec(spec.id)}
                          className="p-1 text-red-500 hover:text-red-600"
                        >
                          <X size={16} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {specs.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Aucune spécification. Clique sur “Ajouter une ligne”.
                    </p>
                  )}
                </motion.div>
              )}

              {/* SECTION : SEO & Tags */}
              {activeSection === 'seo' && (
                <motion.div
                  key="seo"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <div>
                    <Input
                      variant="glass"
                      label="Méta-titre (SEO)"
                      {...register('meta_title')}
                      placeholder="Max 70 caractères"
                      maxLength={70}
                    />

                    <p className="mt-1 text-right text-xs text-muted-foreground">
                      {metaTitleWatch?.length || 0}/70
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Méta-description (SEO)
                    </label>

                    <textarea
                      {...register('meta_description')}
                      rows={3}
                      maxLength={180}
                      className={textareaBase}
                      placeholder="Max 180 caractères"
                    />

                    <p className="mt-1 text-right text-xs text-muted-foreground">
                      {metaDescriptionWatch?.length || 0}/180
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Mots-clés (tags)
                    </label>

                    <div className="mb-2 flex gap-2">
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addTag()
                          }
                        }}
                        placeholder="Ajouter un tag…"
                        className={cn(inputBase, 'flex-1')}
                      />

                      <Button
                        type="button"
                        variant="outline-gold"
                        size="sm"
                        onClick={addTag}
                      >
                        <Plus size={14} />
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {tagsList.map((tag) => (
                        <Badge
                          key={tag}
                          variant="gold"
                          size="sm"
                          className="cursor-pointer"
                          onClick={() => removeTag(tag)}
                        >
                          {tag}
                          <X size={12} className="ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* SECTION : Badges */}
              {activeSection === 'badges' && (
                <motion.div
                  key="badges"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <AdminBadgeSelector
                    selected={watch('badges') || []}
                    onChange={(badges) => setValue('badges', badges)}
                    max={3}
                  />

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Ruban / Étiquette
                    </label>

                    <select
                      {...register('ribbon')}
                      className={inputBase}
                    >
                      {RIBBONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </motion.div>
              )}

              {/* SECTION : Détails */}
              {activeSection === 'details' && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Input
                      variant="glass"
                      label="Poids (kg)"
                      type="number"
                      step="0.01"
                      {...register('poids_kg', { valueAsNumber: true })}
                      leftIcon={<Weight size={14} />}
                    />

                    <Input
                      variant="glass"
                      label="Longueur (cm)"
                      type="number"
                      step="0.1"
                      {...register('longueur_cm', { valueAsNumber: true })}
                      leftIcon={<Ruler size={14} />}
                    />

                    <Input
                      variant="glass"
                      label="Largeur (cm)"
                      type="number"
                      step="0.1"
                      {...register('largeur_cm', { valueAsNumber: true })}
                    />

                    <Input
                      variant="glass"
                      label="Hauteur (cm)"
                      type="number"
                      step="0.1"
                      {...register('hauteur_cm', { valueAsNumber: true })}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Notes internes (non visibles par les clients)
                    </label>

                    <textarea
                      {...register('notes_internes')}
                      rows={3}
                      maxLength={1000}
                      className={textareaBase}
                      placeholder="Notes réservées à l’équipe…"
                    />

                    <p className="mt-1 text-right text-xs text-muted-foreground">
                      {notesWatch?.length || 0}/1000
                    </p>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      {...register('est_actif')}
                      className="rounded text-gold-500 focus:ring-gold-500"
                    />
                    <span>Produit actif (visible dans le catalogue)</span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            {!hideActions && (
              <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="luxe"
                  size="lg"
                  onClick={handleSubmit(onValidSubmit)}
                  loading={isSubmitting}
                  className="shadow-gold"
                  leftIcon={<Save size={16} />}
                >
                  {productId ? 'Mettre à jour le produit' : 'Créer le produit'}
                </Button>

                {savedId && (
                  <Link href={`/produits/${savedId}`} target="_blank">
                    <Button
                      type="button"
                      variant="outline-gold"
                      size="lg"
                      leftIcon={<ExternalLink size={16} />}
                    >
                      Voir le produit
                    </Button>
                  </Link>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    reset(makeDefaults(baselineRef.current || initialData))
                    setError('')
                    setSuccess('')
                    toast.addToast({
                      type: 'info',
                      message: 'Formulaire réinitialisé.',
                    })
                  }}
                  leftIcon={<RotateCcw size={16} />}
                >
                  Annuler les modifications
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Modal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          title="Aperçu du produit"
          size="lg"
          accent="gold"
        >
          {previewValues && (
            <div className="space-y-4">
              {previewValues.images?.[previewValues.main_image_index || 0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewValues.images[previewValues.main_image_index || 0]}
                  alt=""
                  className="h-64 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-64 w-full items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
                  Aucune image
                </div>
              )}

              {previewValues.badges?.length > 0 && (
                <ProductBadges badgeIds={previewValues.badges} size="md" />
              )}

              <h2 className="text-2xl font-bold text-foreground">
                {previewValues.nom || 'Sans titre'}
              </h2>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-3xl font-extrabold text-gold-600">
                  {formatUsd(previewValues.prix_usd)}
                </span>

                <span className="text-sm text-muted-foreground">
                  ≈ {formatCdf(previewValues.prix)}
                </span>

                {previewValues.remise_percent > 0 && (
                  <Badge variant="danger" size="sm">
                    -{previewValues.remise_percent}%
                  </Badge>
                )}

                {previewValues.ribbon && previewValues.ribbon !== 'none' && (
                  <Badge variant="gold" size="sm">
                    {RIBBONS.find((r) => r.value === previewValues.ribbon)?.label}
                  </Badge>
                )}
              </div>

              <p className="line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">
                {previewValues.description || 'Aucune description.'}
              </p>

              {previewValues.tags && (
                <div className="flex flex-wrap gap-1.5">
                  {toStringArray(previewValues.tags).map((tag: string) => (
                    <Badge key={tag} variant="neutral" size="sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {previewValues.specifications?.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    Spécifications
                  </p>

                  <div className="space-y-1">
                    {previewValues.specifications.map((s: any) => (
                      <div
                        key={s.id}
                        className="flex justify-between text-xs text-muted-foreground"
                      >
                        <span>{s.key}</span>
                        <span className="font-medium text-foreground">
                          {s.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewValues.variantes?.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    Variantes ({previewValues.variantes.length})
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {previewValues.variantes.slice(0, 8).map((v: any) => (
                      <Badge key={v.id} variant="neutral" size="sm">
                        {Object.values(v.attributes || {})
                          .filter(Boolean)
                          .join(' • ') || 'Variante'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Button
                type="button"
                variant="outline-gold"
                fullWidth
                onClick={() => setShowPreview(false)}
              >
                Fermer
              </Button>
            </div>
          )}
        </Modal>
      </div>
    )
  }
)

AdminProductForm.displayName = 'AdminProductForm'

function Settings2Placeholder() {
  return <Info size={16} />
}

export default AdminProductForm