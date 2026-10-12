// features/admin/components/AdminProductForm.tsx
'use client'

import { useState, useEffect, useCallback, useRef, useMemo, useImperativeHandle, forwardRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useToast } from '@/components/ui/Toast'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { mainCategories, getSubCategories, getTypes, getDetails } from '@/lib/categories'
import PhotoUpload from '@/components/PhotoUpload'
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import {
  X, Trash2, AlertCircle, Loader2,
  Plus, ArrowLeft, CheckCircle, Video, Sparkles,
  Eye, Save, RotateCcw, Copy, Barcode, Tag,
  Star, TrendingUp, Package, Weight, Ruler,
  ShoppingBag, Image as ImageIcon, Upload, Info,
  GripVertical, ChevronDown, ChevronUp, Zap,
  Clock, Globe, Search, ExternalLink, Truck,
  BrainCircuit,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---- Nouveaux composants ----
import AdminBadgeSelector from '@/features/admin/components/AdminBadgeSelector'
import { ProductBadges } from '@/components/badges/ProductBadges'

/* ========================================================================== */
/*  Constantes                                                                 */
/* ========================================================================== */

const MAX_IMAGES = 15
const MAX_VIDEO_SIZE = 30 * 1024 * 1024
const MAX_VIDEO_DURATION = 30
const DRAFT_STORAGE_KEY = 'admin-product-draft'
const AUTOSAVE_INTERVAL = 15_000

const RIBBONS = [
  { value: 'none', label: 'Aucun' },
  { value: 'new', label: 'Nouveauté' },
  { value: 'sale', label: 'Soldes' },
  { value: 'popular', label: 'Populaire' },
  { value: 'exclusive', label: 'Exclusivité' },
  { value: 'limited', label: 'Édition limitée' },
]

/* ========================================================================== */
/*  Schéma Zod enrichi                                                         */
/* ========================================================================== */

const productSchema = z.object({
  nom: z.string().min(3, 'Le nom doit comporter au moins 3 caractères').max(200),
  description: z.string().min(10, 'La description doit comporter au moins 10 caractères').max(5000),
  stock: z.number().int().min(0, 'Le stock doit être un nombre positif'),
  negociable: z.boolean().default(false),
  sku: z.string().max(50).optional(),
  barcode: z.string().max(50).optional(),
  meta_title: z.string().max(70).optional(),
  meta_description: z.string().max(160).optional(),
  tags: z.string().optional(),
  marque: z.string().max(100).optional(),
  poids_kg: z.number().min(0).optional().nullable(),
  longueur_cm: z.number().min(0).optional().nullable(),
  largeur_cm: z.number().min(0).optional().nullable(),
  hauteur_cm: z.number().min(0).optional().nullable(),
  remise_percent: z.number().min(0).max(99).optional().nullable(),
  featured: z.boolean().default(false),
  ribbon: z.enum(['none', 'new', 'sale', 'popular', 'exclusive', 'limited']).default('none'),
  delay_livraison: z.string().optional(),
  limit_per_client: z.number().int().min(0).optional().nullable(),
  notes_internes: z.string().max(1000).optional(),
  est_actif: z.boolean().default(true),
  badges: z.array(z.string()).default([]),
  // Nouveaux champs livraison
  livraison_domicile: z.number().min(0).default(0),
  livraison_point_retrait: z.number().min(0).default(0),
  livraison_express: z.number().min(0).default(0),
  express_gratuit: z.boolean().default(false),
})

type ProductFormValues = z.infer<typeof productSchema>

interface Variante {
  id: string
  attributes: Record<string, string>
  stock: number
  prix_specifique?: number
  sku?: string
  image?: string
}

interface Specification {
  id: string
  key: string
  value: string
}

interface AdminProductFormProps {
  productId?: string
  onSubmit?: (data: any) => Promise<void>
  submitting?: boolean
  initialData?: any
  activeSection?: string   // pour pilotage externe (stepper ajout)
}

/* ========================================================================== */
/*  Composant Principal                                                        */
/* ========================================================================== */

const AdminProductForm = forwardRef<any, AdminProductFormProps>(({
  productId,
  onSubmit: externalOnSubmit,
  submitting: externalSubmitting = false,
  initialData,
  activeSection: propsActiveSection,
}, ref) => {
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const { rate } = useExchangeRate()

  // Gestion de la section active : soit pilotée depuis l'extérieur, soit par les onglets internes
  const [internalActiveSection, setInternalActiveSection] = useState('general')
  const activeSection = propsActiveSection ?? internalActiveSection

  // États
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploadingImageIndex, setUploadingImageIndex] = useState<number | null>(null)
  const [mainImageIndex, setMainImageIndex] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [priceCurrency, setPriceCurrency] = useState<'CDF' | 'USD'>('CDF')
  const [priceValue, setPriceValue] = useState('')
  const [convertedPrice, setConvertedPrice] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [isDraftLoaded, setIsDraftLoaded] = useState(false)

  // États IA
  const [generatingDescription, setGeneratingDescription] = useState(false)
  const [priceSuggestion, setPriceSuggestion] = useState<{ suggestedPrice: number; reasoning: string } | null>(null)
  const [priceSuggestionLoading, setPriceSuggestionLoading] = useState(false)

  // Catégories
  const [selectedMain, setSelectedMain] = useState('')
  const [selectedSub, setSelectedSub] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedDetail, setSelectedDetail] = useState('')
  const [subCategories, setSubCategories] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [details, setDetails] = useState<string[]>([])

  // Variantes
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [attributKeys, setAttributKeys] = useState<string[]>(['Couleur', 'Taille'])

  // Spécifications techniques
  const [specs, setSpecs] = useState<Specification[]>(initialData?.specifications || [])

  // Autosave
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [autosaveEnabled, setAutosaveEnabled] = useState(true)
  const [autosaveIndicator, setAutosaveIndicator] = useState(false)

  // Formulaire
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    getValues,
    watch,
    setValue,
    control,
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      negociable: false,
      stock: 0,
      featured: false,
      ribbon: 'none',
      est_actif: true,
      remise_percent: null,
      poids_kg: null,
      longueur_cm: null,
      largeur_cm: null,
      hauteur_cm: null,
      limit_per_client: null,
      badges: [],
      livraison_domicile: 0,
      livraison_point_retrait: 0,
      livraison_express: 0,
      express_gratuit: false,
      ...initialData,
    },
  })

  // Exposition de méthodes pour le composant parent
  useImperativeHandle(ref, () => ({
    getValues,
    reset,
    setDescription: (desc: string) => {
      setValue('description', desc, { shouldDirty: true, shouldValidate: true })
      toast.addToast({ type: 'success', message: 'Description générée !' })
    },
    setPrice: (price: number) => {
      if (priceCurrency === 'CDF') {
        setPriceValue(price.toString())
      } else if (rate) {
        const converted = price / rate
        setPriceValue(converted.toFixed(2))
      } else {
        setPriceCurrency('CDF')
        setPriceValue(price.toString())
      }
    },
  }), [getValues, reset, setValue, priceCurrency, rate, toast])

  const watchedValues = watch()

  // Chargement en mode édition
  useEffect(() => {
    if (!productId || !user) return

    const fetchProduct = async () => {
      try {
        const res = await fetch(`/api/admin/produits/${productId}`)
        if (!res.ok) throw new Error('Produit introuvable')
        const data = await res.json()

        reset({
          nom: data.nom || '',
          description: data.description || '',
          stock: data.stock || 0,
          negociable: data.negociable || false,
          sku: data.sku || '',
          barcode: data.barcode || '',
          meta_title: data.meta_title || '',
          meta_description: data.meta_description || '',
          tags: data.tags || '',
          marque: data.marque || '',
          poids_kg: data.poids_kg ?? null,
          longueur_cm: data.longueur_cm ?? null,
          largeur_cm: data.largeur_cm ?? null,
          hauteur_cm: data.hauteur_cm ?? null,
          remise_percent: data.remise_percent ?? null,
          featured: data.featured || false,
          ribbon: data.ribbon || 'none',
          delay_livraison: data.delay_livraison || '',
          limit_per_client: data.limit_per_client ?? null,
          notes_internes: data.notes_internes || '',
          est_actif: data.est_actif ?? true,
          badges: data.badges || [],
          livraison_domicile: data.livraison_domicile ?? 0,
          livraison_point_retrait: data.livraison_point_retrait ?? 0,
          livraison_express: data.livraison_express ?? 0,
          express_gratuit: data.express_gratuit ?? false,
        })

        setImageUrls(data.images || [])
        setMainImageIndex(data.main_image_index || 0)
        setVideoUrl(data.video_url || null)
        if (data.prix_usd && data.prix_usd > 0) {
          setPriceCurrency('USD')
          setPriceValue(data.prix_usd.toString())
        } else {
          setPriceCurrency('CDF')
          setPriceValue(data.prix?.toString() || '')
        }

        const parts = data.categorie?.split(' > ') || []
        if (parts[0]) setSelectedMain(parts[0])
        if (parts[1]) setSelectedSub(parts[1])
        if (parts[2]) setSelectedType(parts[2])
        if (parts[3]) setSelectedDetail(parts[3])

        if (data.variantes && Array.isArray(data.variantes)) {
          const normalized = data.variantes.map((v: Variante) => ({
            ...v,
            id: v.id && v.id.trim() !== '' ? v.id : generateUniqueId(),
          }))
          setVariantes(normalized)
          const keys = new Set<string>()
          normalized.forEach((v: Variante) => Object.keys(v.attributes).forEach(k => keys.add(k)))
          if (keys.size > 0) setAttributKeys(Array.from(keys))
        }

        setSpecs(data.specifications || [])

        setSavedId(data.id)
      } catch (err: any) {
        toast.addToast({ type: 'error', message: 'Impossible de charger le produit' })
      }
    }

    fetchProduct()
  }, [productId, user, reset])

  // Conversion devise
  useEffect(() => {
    if (rate && priceValue) {
      const num = parseFloat(priceValue)
      if (!isNaN(num)) {
        if (priceCurrency === 'CDF') setConvertedPrice(`${(num / rate).toFixed(2)} USD`)
        else setConvertedPrice(`${(num * rate).toLocaleString()} FC`)
      } else setConvertedPrice(null)
    } else setConvertedPrice(null)
  }, [priceValue, priceCurrency, rate])

  // Hiérarchie catégories
  useEffect(() => {
    if (selectedMain) {
      setSubCategories(getSubCategories(selectedMain))
      if (!productId) { setSelectedSub(''); setSelectedType(''); setSelectedDetail('') }
    } else setSubCategories([])
  }, [selectedMain, productId])

  useEffect(() => {
    if (selectedMain && selectedSub) {
      setTypes(getTypes(selectedMain, selectedSub))
      if (!productId) setSelectedType('')
    } else setTypes([])
  }, [selectedMain, selectedSub, productId])

  useEffect(() => {
    if (selectedMain && selectedSub && selectedType) {
      setDetails(getDetails(selectedMain, selectedSub, selectedType))
      if (!productId) setSelectedDetail('')
    } else setDetails([])
  }, [selectedMain, selectedSub, selectedType, productId])

  const buildFullCategory = () => {
    let cat = selectedMain
    if (selectedSub) cat += ` > ${selectedSub}`
    if (selectedType) cat += ` > ${selectedType}`
    if (selectedDetail) cat += ` > ${selectedDetail}`
    return cat
  }

  // ---- Autosave (brouillon local) ----
  useEffect(() => {
    if (!autosaveEnabled) return
    autosaveTimerRef.current = setInterval(() => {
      const formValues = getValues()
      const draft = {
        ...formValues,
        imageUrls,
        videoUrl,
        priceCurrency,
        priceValue,
        selectedMain,
        selectedSub,
        selectedType,
        selectedDetail,
        variantes,
        attributKeys,
        mainImageIndex,
        specs,
      }
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
      setLastSaved(new Date().toLocaleTimeString())
      setAutosaveIndicator(true)
      setTimeout(() => setAutosaveIndicator(false), 1000)
    }, AUTOSAVE_INTERVAL)

    return () => { if (autosaveTimerRef.current) clearInterval(autosaveTimerRef.current) }
  }, [autosaveEnabled, getValues, imageUrls, videoUrl, priceCurrency, priceValue, selectedMain, selectedSub, selectedType, selectedDetail, variantes, attributKeys, mainImageIndex, specs])

  const loadDraft = () => {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) {
      toast.addToast({ type: 'info', message: 'Aucun brouillon trouvé' })
      return
    }
    try {
      const draft = JSON.parse(raw)
      reset({
        nom: draft.nom || '', description: draft.description || '', stock: draft.stock || 0,
        negociable: draft.negociable || false, sku: draft.sku || '', barcode: draft.barcode || '',
        meta_title: draft.meta_title || '', meta_description: draft.meta_description || '',
        tags: draft.tags || '', marque: draft.marque || '',
        poids_kg: draft.poids_kg ?? null, longueur_cm: draft.longueur_cm ?? null,
        largeur_cm: draft.largeur_cm ?? null, hauteur_cm: draft.hauteur_cm ?? null,
        remise_percent: draft.remise_percent ?? null, featured: draft.featured || false,
        ribbon: draft.ribbon || 'none', delay_livraison: draft.delay_livraison || '',
        limit_per_client: draft.limit_per_client ?? null, notes_internes: draft.notes_internes || '',
        est_actif: draft.est_actif ?? true,
        badges: draft.badges || [],
        livraison_domicile: draft.livraison_domicile ?? 0,
        livraison_point_retrait: draft.livraison_point_retrait ?? 0,
        livraison_express: draft.livraison_express ?? 0,
        express_gratuit: draft.express_gratuit ?? false,
      })
      setImageUrls(draft.imageUrls || [])
      setVideoUrl(draft.videoUrl || null)
      setPriceCurrency(draft.priceCurrency || 'CDF')
      setPriceValue(draft.priceValue || '')
      setSelectedMain(draft.selectedMain || '')
      setSelectedSub(draft.selectedSub || '')
      setSelectedType(draft.selectedType || '')
      setSelectedDetail(draft.selectedDetail || '')
      const draftVariantes = (draft.variantes || []).map((v: Variante) => ({
        ...v,
        id: v.id && v.id.trim() !== '' ? v.id : generateUniqueId(),
      }))
      setVariantes(draftVariantes)
      setAttributKeys(draft.attributKeys || ['Couleur', 'Taille'])
      setMainImageIndex(draft.mainImageIndex || 0)
      setSpecs(draft.specs || [])
      setIsDraftLoaded(true)
      toast.addToast({ type: 'success', message: 'Brouillon chargé' })
    } catch {
      toast.addToast({ type: 'error', message: 'Brouillon corrompu' })
    }
  }

  const deleteDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    toast.addToast({ type: 'info', message: 'Brouillon supprimé' })
  }

  // Génération de description via IA
  const handleGenerateDescription = async () => {
    const productName = watch('nom')
    if (!productName || productName.length < 3) {
      toast.addToast({ type: 'error', message: 'Le nom du produit est trop court.' })
      return
    }
    setGeneratingDescription(true)
    try {
      const res = await fetch('/api/ai/admin/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          category: buildFullCategory(),
          attributes: watch('marque') ? `Marque : ${watch('marque')}` : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur de génération')
      }
      const data = await res.json()
      if (data.description) {
        setValue('description', data.description, { shouldDirty: true, shouldValidate: true })
        toast.addToast({ type: 'success', message: 'Description générée avec succès !' })
      }
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setGeneratingDescription(false)
    }
  }

  // Suggestion de prix IA
  const handlePriceSuggestion = async () => {
    if (!productId) {
      toast.addToast({ type: 'warning', message: 'Enregistrez d’abord le produit pour obtenir une suggestion.' })
      return
    }
    setPriceSuggestionLoading(true)
    setPriceSuggestion(null)
    try {
      const res = await fetch('/api/ai/admin/price-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      const data = await res.json()
      setPriceSuggestion(data)
      toast.addToast({ type: 'info', message: `Prix suggéré : ${data.suggestedPrice} FC` })
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setPriceSuggestionLoading(false)
    }
  }

  const applyPriceSuggestion = () => {
    if (!priceSuggestion) return
    if (priceCurrency === 'CDF') {
      setPriceValue(priceSuggestion.suggestedPrice.toString())
    } else if (rate) {
      setPriceValue((priceSuggestion.suggestedPrice / rate).toFixed(2))
    } else {
      setPriceCurrency('CDF')
      setPriceValue(priceSuggestion.suggestedPrice.toString())
    }
    setPriceSuggestion(null)
    toast.addToast({ type: 'success', message: 'Prix appliqué' })
  }

  // Upload images
  const handleImageUploaded = (url: string) => {
    setImageUrls(prev => [...prev, url])
    setUploadingImageIndex(null)
  }

  const removeImage = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index))
    if (mainImageIndex >= imageUrls.length - 1) {
      setMainImageIndex(Math.max(0, imageUrls.length - 2))
    }
  }

  const setAsMainImage = (index: number) => setMainImageIndex(index)

  // Upload vidéo
  const onVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setVideoUploading(true)
    setVideoError('')

    if (!user?.id) {
      const { data: { session } } = await supabaseBrowser.auth.getSession()
      if (!session) {
        setVideoError('Vous devez être connecté pour uploader une vidéo.')
        setVideoUploading(false)
        toast.addToast({ type: 'error', message: 'Session expirée, veuillez vous reconnecter.' })
        return
      }
    }

    if (!file.type.startsWith('video/')) {
      setVideoError('Format vidéo requis')
      setVideoUploading(false)
      return
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setVideoError(`Taille max ${MAX_VIDEO_SIZE / (1024 * 1024)} MB`)
      setVideoUploading(false)
      return
    }

    try {
      const userId = user?.id || (await supabaseBrowser.auth.getSession()).data.session?.user.id
      if (!userId) throw new Error('Non authentifié')

      const videoPath = `${userId}/videos/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabaseBrowser.storage
        .from('photos-produits')
        .upload(videoPath, file, {
          cacheControl: '3600',
          upsert: false,
        })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabaseBrowser.storage
        .from('photos-produits')
        .getPublicUrl(videoPath)

      setVideoUrl(publicUrl)
      toast.addToast({ type: 'success', message: 'Vidéo chargée' })
    } catch (err: any) {
      setVideoError(err.message || 'Erreur lors de l’upload')
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setVideoUploading(false)
    }
  }

  const removeVideo = () => setVideoUrl(null)

  // ---- Génération d'ID unique ----
  const generateUniqueId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${performance.now().toString(36)}`
  }

  // ---- Variantes ----
  const addVariante = () => {
    const newVariante: Variante = {
      id: generateUniqueId(),
      attributes: attributKeys.reduce((acc, key) => ({ ...acc, [key]: '' }), {}),
      stock: 0,
      prix_specifique: undefined,
    }
    setVariantes([...variantes, newVariante])
  }

  const addVarianteBulk = () => {
    const values = attributKeys.map(key => {
      const val = prompt(`Valeurs pour "${key}" (séparées par des virgules)`)
      return val ? val.split(',').map(v => v.trim()).filter(Boolean) : []
    })
    if (values.every(arr => arr.length === 0)) return

    const combos = cartesianProduct(...values)
    const newVariantes: Variante[] = combos.map((combo) => ({
      id: generateUniqueId(),
      attributes: attributKeys.reduce((acc, key, idx) => ({ ...acc, [key]: combo[idx] || '' }), {}),
      stock: 0,
    }))
    setVariantes(prev => [...prev, ...newVariantes])
    toast.addToast({ type: 'success', message: `${newVariantes.length} variantes ajoutées` })
  }

  const updateVariante = (id: string, field: keyof Variante | 'attribute' | 'image', value: any, attributeKey?: string) => {
    setVariantes(prev => prev.map(v => {
      if (v.id !== id) return v
      if (field === 'attribute' && attributeKey) return { ...v, attributes: { ...v.attributes, [attributeKey]: value } }
      return { ...v, [field]: value }
    }))
  }

  const removeVariante = (id: string) => setVariantes(prev => prev.filter(v => v.id !== id))

  const duplicateVariante = (id: string) => {
    const source = variantes.find(v => v.id === id)
    if (!source) return
    setVariantes(prev => [...prev, { ...source, id: generateUniqueId() }])
  }

  const clearAllVariantes = () => {
    if (confirm('Supprimer toutes les variantes ?')) setVariantes([])
  }

  const addAttributKey = () => {
    const newKey = prompt('Nom du nouvel attribut (ex: Matière, Style…)')
    if (newKey && !attributKeys.includes(newKey)) {
      setAttributKeys([...attributKeys, newKey])
      setVariantes(prev => prev.map(v => ({ ...v, attributes: { ...v.attributes, [newKey]: '' } })))
    }
  }

  const removeAttributKey = (key: string) => {
    if (attributKeys.length <= 1) { toast.addToast({ type: 'error', message: 'Il faut au moins un attribut' }); return }
    setAttributKeys(prev => prev.filter(k => k !== key))
    setVariantes(prev => prev.map(v => {
      const newAttrs = { ...v.attributes }; delete newAttrs[key]; return { ...v, attributes: newAttrs }
    }))
  }

  // ---- Spécifications techniques ----
  const addSpec = () => {
    setSpecs(prev => [...prev, { id: generateUniqueId(), key: '', value: '' }])
  }

  const updateSpec = (id: string, field: 'key' | 'value', value: string) => {
    setSpecs(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const removeSpec = (id: string) => setSpecs(prev => prev.filter(s => s.id !== id))

  // ---- Tags ----
  const [tagInput, setTagInput] = useState('')
  const [tagsList, setTagsList] = useState<string[]>([])
  const addTag = () => {
    const trimmed = tagInput.trim()
    if (trimmed && !tagsList.includes(trimmed)) {
      const updated = [...tagsList, trimmed]
      setTagsList(updated)
      setValue('tags', updated.join(', '))
      setTagInput('')
    }
  }
  const removeTag = (tag: string) => {
    const updated = tagsList.filter(t => t !== tag)
    setTagsList(updated)
    setValue('tags', updated.join(', '))
  }

  // ---- Soumission ----
  const handleFormSubmit = async (data: ProductFormValues) => {
    if (imageUrls.length === 0) { toast.addToast({ type: 'error', message: 'Ajoutez au moins une image' }); return }
    const fullCategory = buildFullCategory()
    if (!fullCategory) { toast.addToast({ type: 'error', message: 'Sélectionnez une catégorie' }); return }

    let prix_cdf: number, prix_usd: number | null = null
    const num = parseFloat(priceValue)
    if (isNaN(num) || num <= 0) { toast.addToast({ type: 'error', message: 'Prix invalide' }); return }
    if (priceCurrency === 'CDF') {
      prix_cdf = num
      prix_usd = rate ? num / rate : null
    } else {
      prix_usd = num
      prix_cdf = rate ? num * rate : num * 2500
    }

    if (variantes.length > 0 && variantes.some(v => Object.values(v.attributes).some(val => !val.trim()))) {
      toast.addToast({ type: 'error', message: 'Tous les attributs des variantes sont requis' }); return
    }

    let variantesFinales = variantes
    if (variantes.length > 0 && priceCurrency === 'USD' && rate) {
      variantesFinales = variantes.map(v => ({
        ...v,
        prix_specifique: v.prix_specifique ? v.prix_specifique * rate : undefined
      }))
    }

    // Filtrer les spécifications vides
    const filteredSpecs = specs.filter(s => s.key.trim() !== '' && s.value.trim() !== '')

    const body = {
      nom: data.nom,
      description: data.description,
      prix: prix_cdf,
      prix_usd,
      categorie: fullCategory,
      stock: data.stock,
      negociable: data.negociable,
      images: imageUrls,
      main_image_index: mainImageIndex,
      video_url: videoUrl,
      variantes: variantesFinales.length > 0 ? variantesFinales : null,
      sku: data.sku || null,
      barcode: data.barcode || null,
      meta_title: data.meta_title || null,
      meta_description: data.meta_description || null,
      tags: tagsList.join(', '),
      marque: data.marque || null,
      poids_kg: data.poids_kg ?? null,
      longueur_cm: data.longueur_cm ?? null,
      largeur_cm: data.largeur_cm ?? null,
      hauteur_cm: data.hauteur_cm ?? null,
      remise_percent: data.remise_percent ?? null,
      featured: data.featured,
      ribbon: data.ribbon === 'none' ? null : data.ribbon,
      delay_livraison: data.delay_livraison || null,
      limit_per_client: data.limit_per_client ?? null,
      notes_internes: data.notes_internes || null,
      est_actif: data.est_actif,
      badges: data.badges || [],
      specifications: filteredSpecs,
      livraison_domicile: data.livraison_domicile ?? 0,
      livraison_point_retrait: data.livraison_point_retrait ?? 0,
      livraison_express: data.livraison_express ?? 0,
      express_gratuit: data.express_gratuit ?? false,
    }

    if (externalOnSubmit) {
      await externalOnSubmit(body)
      return
    }

    setLoading(true); setError('')
    try {
      const url = productId ? `/api/admin/produits/${productId}` : '/api/admin/produits'
      const method = productId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur')

      toast.addToast({ type: 'success', message: productId ? 'Produit mis à jour !' : 'Produit créé !' })
      localStorage.removeItem(DRAFT_STORAGE_KEY)

      if (!productId && result.id) {
        setSavedId(result.id)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Sections du formulaire
  const sections = [
    { id: 'general', label: 'Général', icon: <Package size={16} /> },
    { id: 'media', label: 'Médias', icon: <ImageIcon size={16} /> },
    { id: 'prix', label: 'Prix & Stock', icon: <Tag size={16} /> },
    { id: 'variantes', label: 'Variantes', icon: <Sparkles size={16} /> },
    { id: 'livraison', label: 'Livraison', icon: <Truck size={16} /> },
    { id: 'specs', label: 'Spécifications', icon: <Info size={16} /> },
    { id: 'seo', label: 'SEO & Tags', icon: <Globe size={16} /> },
    { id: 'badges', label: 'Badges', icon: <Tag size={16} /> },
    { id: 'details', label: 'Détails', icon: <Info size={16} /> },
  ]

  if (!user) return null

  const isSubmitting = externalSubmitting || loading

  return (
    <div className="relative">
      {/* Barre d'actions flottante */}
      <div className="sticky top-16 z-20 bg-background/80 backdrop-blur-xl border-b border-border mb-6 -mx-4 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gold-400/10 text-muted-foreground hover:text-gold-500 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="font-semibold text-foreground">
              {productId ? 'Modifier le produit' : 'Nouveau produit'}
            </h2>
            {autosaveIndicator && <p className="text-xs text-green-500">Brouillon sauvegardé à {lastSaved}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Charger le brouillon">
            <Button variant="ghost" size="sm" onClick={loadDraft} leftIcon={<RotateCcw size={14} />}>
              Brouillon
            </Button>
          </Tooltip>
          {isDraftLoaded && (
            <Tooltip content="Supprimer le brouillon">
              <Button variant="ghost" size="sm" onClick={deleteDraft}><Trash2 size={14} className="text-red-500" /></Button>
            </Tooltip>
          )}
          <Tooltip content="Aperçu">
            <Button variant="outline-gold" size="sm" onClick={() => setShowPreview(true)} leftIcon={<Eye size={14} />}>
              Aperçu
            </Button>
          </Tooltip>
          <Button
            variant="luxe"
            size="sm"
            onClick={handleSubmit(handleFormSubmit)}
            loading={isSubmitting}
            leftIcon={<Save size={14} />}
          >
            {productId ? 'Mettre à jour' : 'Publier'}
          </Button>
        </div>
      </div>

      {/* Sections (tabs) – masquées si pilotage externe */}
      {!propsActiveSection && (
        <div className="flex gap-2 overflow-x-auto mb-6 pb-2 scrollbar-hide">
          {sections.map(sec => (
            <button
              key={sec.id}
              onClick={() => setInternalActiveSection(sec.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition border whitespace-nowrap',
                activeSection === sec.id
                  ? 'bg-gold-500 text-white border-gold-500 shadow-gold'
                  : 'bg-card border-border text-muted-foreground hover:border-gold-400'
              )}
            >
              {sec.icon}
              {sec.label}
            </button>
          ))}
        </div>
      )}

      {/* Alerte erreur / succès */}
      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-red-700 flex items-center gap-3">
          <AlertCircle size={20} /> <span>{error}</span>
        </motion.div>
      )}

      {success && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl text-green-700 flex items-center gap-3">
          <CheckCircle size={20} /> <span>{success}</span>
        </motion.div>
      )}

      <Card variant="glass" className="border-gold-400/20 shadow-soft">
        <CardContent className="p-6 space-y-6">
          <AnimatePresence mode="wait">
            {/* SECTION : Général */}
            {activeSection === 'general' && (
              <motion.div key="general" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <Input variant="glass" label="Nom du produit *" {...register('nom')} error={errors.nom?.message} placeholder="Ex: iPhone 15 Pro Max 256 Go" />
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Description *</label>
                  <textarea
                    {...register('description')}
                    rows={5}
                    className="w-full rounded-xl border border-gold-400/30 bg-card p-3 text-sm focus:ring-2 focus:ring-gold-500/50 resize-none"
                    placeholder="Décrivez le produit en détail..."
                  />
                  {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">{watch('description')?.length || 0}/5000</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateDescription}
                      loading={generatingDescription}
                      leftIcon={<BrainCircuit size={14} />}
                    >
                      Générer description
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input variant="glass" label="SKU (référence interne)" {...register('sku')} placeholder="SKU-001" />
                  <Input variant="glass" label="Code-barres (EAN/UPC)" {...register('barcode')} placeholder="1234567890123" leftIcon={<Barcode size={16} />} />
                </div>
                <Input variant="glass" label="Marque" {...register('marque')} placeholder="Apple, Samsung…" />
              </motion.div>
            )}

            {/* SECTION : Médias */}
            {activeSection === 'media' && (
              <motion.div key="media" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-foreground">
                      Images ({imageUrls.length}/{MAX_IMAGES})
                    </label>
                    <span className="text-xs text-muted-foreground">Cliquez sur une image pour la définir comme principale</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <AnimatePresence>
                      {imageUrls.map((url, idx) => (
                        <motion.div key={url} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                          className={cn(
                            'relative aspect-square rounded-xl border-2 overflow-hidden group',
                            idx === mainImageIndex ? 'border-gold-400 ring-2 ring-gold-400/30' : 'border-border'
                          )}
                        >
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <Tooltip content="Image principale">
                              <button onClick={() => setAsMainImage(idx)} className="p-1.5 bg-white/80 rounded-full"><Star size={14} className={idx === mainImageIndex ? 'text-gold-500' : 'text-neutral-500'} /></button>
                            </Tooltip>
                            <Tooltip content="Supprimer">
                              <button onClick={() => removeImage(idx)} className="p-1.5 bg-white/80 rounded-full"><Trash2 size={14} className="text-red-500" /></button>
                            </Tooltip>
                          </div>
                          {idx === mainImageIndex && (
                            <Badge variant="gold" size="sm" className="absolute top-2 left-2">Principale</Badge>
                          )}
                        </motion.div>
                      ))}
                      {imageUrls.length < MAX_IMAGES && (
                        <div className="aspect-square rounded-xl border-2 border-dashed border-gold-400/30 flex items-center justify-center bg-muted/30">
                          <PhotoUpload
                            onUpload={(url) => handleImageUploaded(url)}
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
                  <label className="text-sm font-medium text-foreground mb-2 block">Vidéo (optionnelle, max 30 Mo)</label>
                  <div className="border-2 border-dashed border-gold-400/30 rounded-xl p-4 text-center">
                    <input type="file" accept="video/*" onChange={onVideoUpload} disabled={videoUploading} className="hidden" id="video-upload" />
                    <label htmlFor="video-upload" className="cursor-pointer inline-flex items-center gap-2 text-gold-500 hover:text-gold-600">
                      <Video size={18} /> {videoUploading ? <Loader2 className="animate-spin" size={18} /> : videoUrl ? 'Modifier la vidéo' : 'Ajouter une vidéo'}
                    </label>
                    {videoError && <p className="text-red-500 text-xs mt-2">{videoError}</p>}
                    {videoUrl && (
                      <div className="mt-3 relative rounded-xl overflow-hidden border border-border max-w-sm mx-auto">
                        <video controls src={videoUrl} className="w-full" />
                        <button onClick={removeVideo} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"><X size={14} /></button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* SECTION : Prix & Stock */}
            {activeSection === 'prix' && (
              <motion.div key="prix" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Prix *</label>
                  <div className="flex gap-2">
                    <select value={priceCurrency} onChange={e => setPriceCurrency(e.target.value as any)} className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                      <option value="CDF">FC (CDF)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                    <Input variant="glass" type="number" className="flex-1" value={priceValue} onChange={e => setPriceValue(e.target.value)} placeholder={`Prix en ${priceCurrency}`} step="any" />
                  </div>
                  {convertedPrice && <p className="text-xs text-muted-foreground mt-1">≈ {convertedPrice}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    {productId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handlePriceSuggestion}
                        loading={priceSuggestionLoading}
                        leftIcon={<Zap size={14} className="text-purple-500" />}
                      >
                        Prix IA
                      </Button>
                    )}
                    {priceSuggestion && (
                      <div className="flex items-center gap-2 text-sm bg-purple-50 dark:bg-purple-900/20 px-3 py-1 rounded-lg">
                        <Sparkles size={14} className="text-purple-500" />
                        <span>{priceSuggestion.suggestedPrice.toLocaleString()} FC</span>
                        <Button size="xs" variant="accent" onClick={applyPriceSuggestion}>Appliquer</Button>
                        <button onClick={() => setPriceSuggestion(null)} className="text-muted-foreground"><X size={14} /></button>
                      </div>
                    )}
                  </div>
                </div>
                <Input variant="glass" label="Remise (%)" type="number" step="0.1" min="0" max="99" {...register('remise_percent', { valueAsNumber: true })} placeholder="Ex: 15" />
                <div className="grid md:grid-cols-2 gap-4">
                  <Input variant="glass" label="Stock *" type="number" {...register('stock', { valueAsNumber: true })} error={errors.stock?.message} />
                  <Input variant="glass" label="Limite par client" type="number" {...register('limit_per_client', { valueAsNumber: true })} placeholder="Optionnel" />
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" {...register('negociable')} className="text-gold-500 focus:ring-gold-500 rounded" />
                    <span>Produit négociable</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" {...register('featured')} className="text-gold-500 focus:ring-gold-500 rounded" />
                    <span>Produit en vedette</span>
                  </label>
                </div>
              </motion.div>
            )}

            {/* SECTION : Variantes */}
            {activeSection === 'variantes' && (
              <motion.div key="variantes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Variantes ({variantes.length})</h3>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline-gold" size="sm" onClick={addVariante} leftIcon={<Plus size={14} />}>Ajouter</Button>
                    <Button type="button" variant="outline-gold" size="sm" onClick={addVarianteBulk} leftIcon={<Zap size={14} />}>Générer</Button>
                    {variantes.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={clearAllVariantes}><Trash2 size={14} className="text-red-500" /></Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {attributKeys.map(key => (
                    <Badge key={key} variant="gold" size="sm" className="cursor-pointer" onClick={() => removeAttributKey(key)}>
                      {key} <X size={12} className="ml-1" />
                    </Badge>
                  ))}
                  <Button type="button" variant="ghost" size="sm" onClick={addAttributKey} className="text-gold-500 text-xs">
                    + Attribut
                  </Button>
                </div>
                <AnimatePresence>
                  {variantes.map((v, idx) => (
                    <motion.div key={v.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="bg-card rounded-xl p-4 border border-border relative group">
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => duplicateVariante(v.id)} className="p-1 text-muted-foreground hover:text-gold-500"><Copy size={14} /></button>
                        <button type="button" onClick={() => removeVariante(v.id)} className="p-1 text-muted-foreground hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                      <p className="font-medium text-sm mb-3">Variante {idx + 1}</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {attributKeys.map(key => (
                          <div key={key}>
                            <label className="text-xs text-muted-foreground mb-1 block">{key}</label>
                            <input
                              type="text"
                              value={v.attributes[key] || ''}
                              onChange={e => updateVariante(v.id, 'attribute', e.target.value, key)}
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                              placeholder={key}
                            />
                          </div>
                        ))}
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Stock</label>
                          <input
                            type="number"
                            value={v.stock}
                            onChange={e => updateVariante(v.id, 'stock', parseInt(e.target.value) || 0)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Prix spécifique (opt.)</label>
                          <input
                            type="number"
                            step="any"
                            value={v.prix_specifique || ''}
                            onChange={e => updateVariante(v.id, 'prix_specifique', parseFloat(e.target.value) || undefined)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                            placeholder="Si différent"
                          />
                        </div>
                        {/* Bloc image variante */}
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Image (optionnelle)</label>
                          {v.image ? (
                            <div className="relative w-full h-24 rounded-lg overflow-hidden border border-border">
                              <img src={v.image} alt="" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => updateVariante(v.id, 'image', undefined)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                              ><X size={12} /></button>
                            </div>
                          ) : (
                            <PhotoUpload
                              onUpload={(url) => updateVariante(v.id, 'image', url)}
                              bucket="photos-produits"
                              folder={`${user!.id}/variantes`}
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
                  <p className="text-sm text-muted-foreground text-center py-6">Aucune variante. Cliquez sur "Ajouter" ou "Générer" pour en créer.</p>
                )}
              </motion.div>
            )}

            {/* SECTION : Livraison */}
{activeSection === 'livraison' && (
  <motion.div key="livraison" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
    <h3 className="font-semibold">Frais et disponibilité de livraison</h3>
    <p className="text-sm text-muted-foreground">
      Définissez le prix et activez/désactivez chaque mode pour ce produit.
    </p>

    {/* Livraison à domicile */}
    <div className="p-4 bg-card/50 rounded-xl border border-border space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">Livraison à domicile</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" {...register('livraison_domicile_active')} />
          <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gold-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold-500"></div>
        </label>
      </div>
      <Input variant="glass" label="Tarif (FC)" type="number" step="any" {...register('livraison_domicile', { valueAsNumber: true })} placeholder="Ex: 5000" disabled={!watch('livraison_domicile_active')} />
    </div>

    {/* Point de retrait */}
    <div className="p-4 bg-card/50 rounded-xl border border-border space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">Point de retrait</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" {...register('livraison_point_retrait_active')} />
          <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gold-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold-500"></div>
        </label>
      </div>
      <Input variant="glass" label="Tarif (FC)" type="number" step="any" {...register('livraison_point_retrait', { valueAsNumber: true })} placeholder="Ex: 0" disabled={!watch('livraison_point_retrait_active')} />
    </div>

    {/* Livraison express */}
    <div className="p-4 bg-card/50 rounded-xl border border-border space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">Livraison express</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" {...register('livraison_express_active')} />
          <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gold-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold-500"></div>
        </label>
      </div>
      <Input variant="glass" label="Tarif supplémentaire (FC)" type="number" step="any" {...register('livraison_express', { valueAsNumber: true })} placeholder="Supplément express" disabled={!watch('livraison_express_active')} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('express_gratuit')} className="text-gold-500 rounded" />
        <span>Livraison express offerte sur ce produit</span>
      </label>
    </div>
  </motion.div>
)}

            {/* SECTION : Spécifications techniques */}
            {activeSection === 'specs' && (
              <motion.div key="specs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Spécifications techniques</h3>
                  <Button type="button" variant="outline-gold" size="sm" onClick={addSpec} leftIcon={<Plus size={14} />}>
                    Ajouter une ligne
                  </Button>
                </div>
                <AnimatePresence>
                  {specs.map((spec, idx) => (
                    <motion.div key={spec.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-3 bg-card rounded-xl p-3 border border-border">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={spec.key}
                          onChange={(e) => updateSpec(spec.id, 'key', e.target.value)}
                          placeholder="Clé (ex: Taille)"
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={spec.value}
                          onChange={(e) => updateSpec(spec.id, 'value', e.target.value)}
                          placeholder="Valeur (ex: 45 cm)"
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                        />
                      </div>
                      <button onClick={() => removeSpec(spec.id)} className="text-red-500 hover:text-red-600 p-1">
                        <X size={16} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {specs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Aucune spécification. Cliquez sur "Ajouter une ligne".</p>
                )}
              </motion.div>
            )}

            {/* SECTION : SEO & Tags */}
            {activeSection === 'seo' && (
              <motion.div key="seo" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <Input variant="glass" label="Méta-titre (SEO)" {...register('meta_title')} placeholder="Max 70 caractères" maxLength={70} />
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Méta-description (SEO)</label>
                  <textarea
                    {...register('meta_description')}
                    rows={2}
                    maxLength={160}
                    className="w-full rounded-xl border border-gold-400/30 bg-card p-3 text-sm resize-none"
                    placeholder="Max 160 caractères"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{watch('meta_description')?.length || 0}/160</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Mots-clés (tags)</label>
                  <div className="flex gap-2 mb-2">
                    <Input variant="glass" size="sm" className="flex-1" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Ajouter un tag…" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} />
                    <Button type="button" variant="outline-gold" size="sm" onClick={addTag}><Plus size={14} /></Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tagsList.map(tag => (
                      <Badge key={tag} variant="gold" size="sm" className="cursor-pointer" onClick={() => removeTag(tag)}>
                        {tag} <X size={12} className="ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* SECTION : Badges */}
            {activeSection === 'badges' && (
              <motion.div key="badges" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <AdminBadgeSelector
                  selected={watch('badges') || []}
                  onChange={(badges) => setValue('badges', badges)}
                  max={3}
                />
              </motion.div>
            )}

            {/* SECTION : Détails supplémentaires */}
            {activeSection === 'details' && (
              <motion.div key="details" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Catégorie</label>
                  <div className="space-y-2">
                    <select value={selectedMain} onChange={e => setSelectedMain(e.target.value)} className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                      <option value="">Catégorie principale</option>
                      {mainCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    {selectedMain && subCategories.length > 0 && (
                      <select value={selectedSub} onChange={e => setSelectedSub(e.target.value)} className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                        <option value="">Sous-catégorie</option>
                        {subCategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                      </select>
                    )}
                    {selectedSub && types.length > 0 && (
                      <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                        <option value="">Type</option>
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                    {selectedType && details.length > 0 && (
                      <select value={selectedDetail} onChange={e => setSelectedDetail(e.target.value)} className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                        <option value="">Détail</option>
                        {details.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Ruban / Étiquette</label>
                  <select {...register('ribbon')} className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                    {RIBBONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>

                <Input variant="glass" label="Délai de livraison estimé" {...register('delay_livraison')} placeholder="Ex: 24-48h, 3-5 jours" />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Input variant="glass" label="Poids (kg)" type="number" step="0.01" {...register('poids_kg', { valueAsNumber: true })} leftIcon={<Weight size={14} />} />
                  <Input variant="glass" label="Longueur (cm)" type="number" step="0.1" {...register('longueur_cm', { valueAsNumber: true })} leftIcon={<Ruler size={14} />} />
                  <Input variant="glass" label="Largeur (cm)" type="number" step="0.1" {...register('largeur_cm', { valueAsNumber: true })} />
                  <Input variant="glass" label="Hauteur (cm)" type="number" step="0.1" {...register('hauteur_cm', { valueAsNumber: true })} />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Notes internes (non visibles par les clients)</label>
                  <textarea
                    {...register('notes_internes')}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-card p-3 text-sm resize-none"
                    placeholder="Notes réservées à l'équipe…"
                    maxLength={1000}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{watch('notes_internes')?.length || 0}/1000</p>
                </div>

                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" {...register('est_actif')} className="text-gold-500 focus:ring-gold-500 rounded" />
                    <span>Produit actif (visible dans le catalogue)</span>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bouton Enregistrer (bas) */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button
              variant="luxe"
              fullWidth
              size="lg"
              onClick={handleSubmit(handleFormSubmit)}
              loading={isSubmitting}
              className="shadow-gold"
            >
              {productId ? 'Mettre à jour le produit' : 'Créer le produit'}
            </Button>
            {savedId && (
              <Link href={`/produits/${savedId}`} target="_blank">
                <Button variant="outline-gold" size="lg" leftIcon={<ExternalLink size={16} />}>
                  Voir
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal d'aperçu (enrichi avec les badges) */}
      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Aperçu du produit" size="lg" accent="gold">
        <div className="space-y-4">
          {imageUrls.length > 0 && (
            <img src={imageUrls[mainImageIndex]} alt="" className="w-full h-64 object-cover rounded-xl" />
          )}
          {watch('badges')?.length > 0 && (
            <ProductBadges badgeIds={watch('badges')} size="md" />
          )}
          <h2 className="text-2xl font-bold">{watch('nom') || 'Sans titre'}</h2>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-gold-600">{parseFloat(priceValue)?.toLocaleString() || '—'} {priceCurrency}</span>
            {watch('remise_percent') ? (
              <Badge variant="danger">-{watch('remise_percent')}%</Badge>
            ) : null}
          </div>
          {watch('ribbon') && watch('ribbon') !== 'none' && (
            <Badge variant="gold">{RIBBONS.find(r => r.value === watch('ribbon'))?.label}</Badge>
          )}
          <p className="text-muted-foreground text-sm line-clamp-3">{watch('description')}</p>
          <div className="flex gap-2">
            {tagsList.map(tag => <Badge key={tag} variant="neutral" size="sm">{tag}</Badge>)}
          </div>
          {specs.length > 0 && (
            <div className="border-t border-border pt-3 mt-3">
              <p className="text-sm font-medium mb-2">Spécifications</p>
              {specs.filter(s => s.key.trim() !== '' && s.value.trim() !== '').map((s, i) => (
                <div key={i} className="flex justify-between text-xs py-1">
                  <span className="text-muted-foreground">{s.key}</span>
                  <span className="font-medium">{s.value}</span>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline-gold" fullWidth onClick={() => setShowPreview(false)}>Fermer</Button>
        </div>
      </Modal>
    </div>
  )
})

// Utilitaire : produit cartésien
function cartesianProduct(...arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>(
    (acc, curr) => acc.flatMap(a => curr.map(c => [...a, c])),
    [[]]
  )
}

export default AdminProductForm