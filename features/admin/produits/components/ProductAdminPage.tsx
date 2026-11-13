// features/admin/produits/components/ProductAdminPage.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'

import { Container } from '@/components/layout/Container'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'

import { Button } from '@/components/ui/Button'

import {
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'

import { PRODUCT_STEPS } from '../constants/steps'

import {
  buildSummary,
  normalizeProductForForm,
  sanitizePayload,
  EMPTY_SUMMARY,
  PRODUCT_RATE_WAIT_TIMEOUT_MS,
  readProductDraft,
  writeProductDraft,
  removeProductDraft,
  getProductDraftStorageKey,
  safeLocalStorageGet,
  safeLocalStorageSet,
  PRODUCT_AUTO_SAVE_ENABLED_STORAGE_KEY,
  PRODUCT_AUTO_SAVE_INTERVAL_MS,
} from '../lib/product-utils'

import { fetchProductById } from '../lib/product-api'
import { useProductFormState } from '../hooks/use-product-form-state'
import { ProductFormProvider } from '../context/ProductFormContext'

import StepIndicator from './StepIndicator'
import StepRenderer from './StepRenderer'
import ProductAdminHeader from './ProductAdminHeader'
import ProductAdminSidebar from './ProductAdminSidebar'
import ProductDraftBanner from './ProductDraftBanner'
import ProductAdminActions from './ProductAdminActions'
import ProductPreviewModal from './ProductPreviewModal'
import ProductDeleteModal from './ProductDeleteModal'
import ProductAdminSkeleton from './ProductAdminSkeleton'

import type {
  ProductAdminMode,
  ProductDetail,
  FormSummary,
} from '../types'

/* ═══════════════════════════════════════════════════════════════ */
/*  PROPS                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface ProductAdminPageProps {
  mode: ProductAdminMode
  productId?: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
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

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const raw =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value

  const n = Number(raw)

  return Number.isFinite(n) && n > 0 ? n : null
}

function hasUsdSignal(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false

  const directUsdKeys = [
    'prix_usd',
    'price_usd',
    'unit_price_usd',
    'total_usd',
    'subtotal_usd',
    'shipping_usd',
    'reduction_usd',
  ]

  for (const key of directUsdKeys) {
    if (positiveNumber(payload[key])) return true
  }

  const variants = payload.variants ?? payload.variantes

  if (Array.isArray(variants)) {
    for (const variant of variants) {
      if (hasUsdSignal(variant)) return true
    }
  }

  return false
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/*  ⚠️ RÈGLE ABSOLUE : TOUS LES HOOKS EN HAUT,                     */
/*     TOUS LES EARLY RETURNS EN BAS (juste avant le JSX)          */
/* ═══════════════════════════════════════════════════════════════ */

export default function ProductAdminPage({
  mode,
  productId,
}: ProductAdminPageProps) {
  /* ─────────────────────────────────────────────────────────── */
  /* 1. HOOKS DE CONTEXTE / NAVIGATION / DATA                    */
  /* ─────────────────────────────────────────────────────────── */

  const router = useRouter()
  const queryClient = useQueryClient()

  const { user, loading: authLoading, isAdmin } = useAuth()

  const toast = useToast() as any

  const addToast = useCallback(
    (payload: any) => {
      toast?.addToast?.(payload)
    },
    [toast]
  )

  const exchange = useExchangeRate() as any
  const prefersReducedMotion = useReducedMotion()

  const currentIsAdmin = Boolean(isAdmin)
  const isEdit = mode === 'edit'
  const storageKey = getProductDraftStorageKey(mode, productId)

  /* ─────────────────────────────────────────────────────────── */
  /* 2. HYDRATION / TAUX NORMALISÉ                               */
  /* ─────────────────────────────────────────────────────────── */

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const rawRate = useMemo(
    () => resolveRate(exchange),
    [exchange]
  )

  const rateLoading = Boolean(exchange?.loading)

  /**
   * FIX HYDRATION :
   * Le taux peut être chargé côté client seulement.
   */
  const effectiveRate = mounted ? rawRate : null

  const rateNum = Number(effectiveRate)
  const rateOk = Number.isFinite(rateNum) && rateNum > 0

  /* ─────────────────────────────────────────────────────────── */
  /* 3. ÉTATS LOCAUX                                              */
  /* ─────────────────────────────────────────────────────────── */

  const [activeStep, setActiveStep] = useState(0)
  const [rateWaited, setRateWaited] = useState(false)
  const [summary, setSummary] = useState<FormSummary>(EMPTY_SUMMARY)
  const [initialValues, setInitialValues] = useState<any>(null)
  const [formKey, setFormKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // Brouillon
  const [draftExists, setDraftExists] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const [autoSave, setAutoSave] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  // Modals / actions
  const [showPreview, setShowPreview] = useState(false)
  const [previewValues, setPreviewValues] = useState<any>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [duplicatePending, setDuplicatePending] = useState(false)
  const [deletePending, setDeletePending] = useState(false)

  const initializedRef = useRef(false)

  /* ─────────────────────────────────────────────────────────── */
  /* 4. QUERY PRODUIT                                             */
  /* ─────────────────────────────────────────────────────────── */

  const {
    data: product,
    isLoading: productLoading,
    isError: productError,
    error: productErrorObj,
    refetch,
  } = useQuery<ProductDetail>({
    queryKey: ['admin-product', productId],
    queryFn: () => fetchProductById(productId!),
    enabled: isEdit && !!productId && !!user && currentIsAdmin,
    staleTime: 30_000,
  })

  /* ─────────────────────────────────────────────────────────── */
  /* 5. HOOK FORMULAIRE                                           */
  /* ─────────────────────────────────────────────────────────── */

  const form = useProductFormState({
    productId: isEdit ? productId : null,
    initialData: initialValues,
    onValuesChange: (values: any) => {
      setSummary(buildSummary(values, effectiveRate))
    },
    enableAutosave: false,
    storageKey,
  })

  const formRef = useRef(form)
  formRef.current = form

  /* ─────────────────────────────────────────────────────────── */
  /* 6. VALEURS DÉRIVÉES                                          */
  /* ─────────────────────────────────────────────────────────── */

  const dirty = Boolean(form.isDirty) || draftRestored
  const canSave = dirty || draftRestored

  /* ─────────────────────────────────────────────────────────── */
  /* 7. CALLBACKS                                                 */
  /* ─────────────────────────────────────────────────────────── */

  const toggleAutoSave = useCallback(() => {
    setAutoSave((prev) => {
      const next = !prev
      safeLocalStorageSet(PRODUCT_AUTO_SAVE_ENABLED_STORAGE_KEY, next)
      return next
    })
  }, [])

  const goNext = useCallback(() => {
    setActiveStep((prev) =>
      Math.min(prev + 1, PRODUCT_STEPS.length - 1)
    )
  }, [])

  const goPrev = useCallback(() => {
    setActiveStep((prev) => Math.max(prev - 1, 0))
  }, [])

  const handleSave = useCallback(async () => {
    const values = form.getProductValues?.()

    if (!values) {
      addToast({
        type: 'error',
        message: 'Formulaire indisponible.',
      })

      return
    }

    const prepared = sanitizePayload(values, effectiveRate)

    if (prepared.errors.length > 0) {
      addToast({
        type: 'error',
        message: prepared.errors.join(' • '),
      })

      return
    }

    /**
     * Garde de sécurité USD :
     * - Si le taux est disponible, sanitizePayload doit pouvoir recalculer le CDF.
     * - Si le taux n’est pas disponible, on exige un signal USD explicite.
     */
    if (!rateOk && !hasUsdSignal(prepared.payload)) {
      addToast({
        type: 'error',
        message:
          'Aucun prix USD détecté et le taux USD/CDF est indisponible. Impossible d’enregistrer en toute sécurité.',
      })

      return
    }

    setSubmitting(true)

    try {
      const url = isEdit
        ? `/api/admin/produits/${productId}`
        : '/api/admin/produits'

      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(prepared.payload),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || "Erreur lors de l'enregistrement."
        )
      }

      queryClient.invalidateQueries({
        queryKey: ['admin-product', productId],
      })

      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      removeProductDraft(storageKey)

      setDraftExists(false)
      setDraftRestored(false)
      setShowDraftBanner(false)
      setLastSavedAt(new Date().toISOString())

      addToast({
        type: 'success',
        message: isEdit
          ? 'Produit mis à jour avec succès.'
          : 'Produit créé avec succès.',
      })

      if (!isEdit) {
        const newId = json?.data?.id || json?.id

        if (newId) {
          router.push(`/admin/produits/${newId}/modifier`)
        } else {
          router.push('/admin/produits')
        }
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        message:
          err?.message || "Impossible d'enregistrer le produit.",
      })
    } finally {
      setSubmitting(false)
    }
  }, [
    addToast,
    effectiveRate,
    form,
    isEdit,
    productId,
    queryClient,
    rateOk,
    router,
    storageKey,
  ])

  const handlePreview = useCallback(() => {
    const values = form.getProductValues?.()

    if (!values) {
      addToast({
        type: 'error',
        message: 'Formulaire indisponible.',
      })

      return
    }

    const prepared = sanitizePayload(values, effectiveRate)

    if (prepared.errors.length > 0) {
      addToast({
        type: 'error',
        message: prepared.errors[0],
      })

      return
    }

    setPreviewValues(values)
    setShowPreview(true)
  }, [addToast, effectiveRate, form])

  const handleDuplicate = useCallback(async () => {
    if (!productId) return

    setDuplicatePending(true)

    try {
      const res = await fetch(
        `/api/admin/produits/${productId}/duplicate`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Erreur duplication.')
      }

      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      const newId = json?.data?.id || json?.id

      addToast({
        type: 'success',
        message: 'Produit dupliqué.',
      })

      if (newId) {
        router.push(`/admin/produits/${newId}/modifier`)
      } else {
        router.push('/admin/produits')
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur.',
      })
    } finally {
      setDuplicatePending(false)
    }
  }, [addToast, productId, queryClient, router])

  const handleDelete = useCallback(async () => {
    if (!productId) return

    setDeletePending(true)

    try {
      const res = await fetch(
        `/api/admin/produits/${productId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Erreur suppression.')
      }

      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      removeProductDraft(storageKey)

      addToast({
        type: 'success',
        message: 'Produit supprimé.',
      })

      router.push('/admin/produits')
    } catch (err: any) {
      addToast({
        type: 'error',
        message: err?.message || 'Erreur.',
      })
    } finally {
      setDeletePending(false)
      setShowDeleteModal(false)
    }
  }, [addToast, productId, queryClient, router, storageKey])

  const handleSaveDraft = useCallback(() => {
    const values = form.getProductValues?.()

    if (!values || Object.keys(values).length === 0) {
      addToast({
        type: 'error',
        message: 'Aucune donnée à sauvegarder.',
      })

      return
    }

    const payload = {
      ...values,
      _saved_at: new Date().toISOString(),
      _rate_used: effectiveRate ?? null,
      _usd_source: true,
    }

    const ok = writeProductDraft(storageKey, payload)

    if (ok) {
      setDraftExists(true)
      setLastSavedAt(payload._saved_at)

      addToast({
        type: 'success',
        message: 'Brouillon enregistré localement.',
      })
    } else {
      addToast({
        type: 'error',
        message: "Impossible d'enregistrer.",
      })
    }
  }, [addToast, effectiveRate, form, storageKey])

  const handleRestoreDraft = useCallback(() => {
    const draft = readProductDraft<any>(storageKey)

    if (!draft) {
      addToast({
        type: 'error',
        message: 'Aucun brouillon trouvé.',
      })

      return
    }

    const normalized = normalizeProductForForm(draft, effectiveRate)

    setInitialValues(normalized)
    setDraftRestored(true)
    setShowDraftBanner(false)
    setFormKey((k) => k + 1)
    initializedRef.current = true

    addToast({
      type: 'info',
      message: 'Brouillon local restauré.',
    })
  }, [addToast, effectiveRate, storageKey])

  const handleIgnoreDraft = useCallback(() => {
    setShowDraftBanner(false)
  }, [])

  const handleDiscardDraft = useCallback(() => {
    removeProductDraft(storageKey)

    setDraftExists(false)
    setDraftRestored(false)
    setShowDraftBanner(false)

    if (isEdit && product) {
      const normalized = normalizeProductForForm(
        product,
        effectiveRate
      )

      setInitialValues(normalized)
      setFormKey((k) => k + 1)
      initializedRef.current = true
    }

    addToast({
      type: 'info',
      message: 'Brouillon supprimé.',
    })
  }, [addToast, effectiveRate, isEdit, product, storageKey])

  const handleReloadServer = useCallback(() => {
    if (!isEdit || !product) return

    removeProductDraft(storageKey)

    const normalized = normalizeProductForForm(
      product,
      effectiveRate
    )

    setInitialValues(normalized)
    setFormKey((k) => k + 1)
    setDraftRestored(false)
    setShowDraftBanner(false)
    initializedRef.current = true

    addToast({
      type: 'info',
      message: 'Version serveur rechargée.',
    })
  }, [addToast, effectiveRate, isEdit, product, storageKey])

  /* ─────────────────────────────────────────────────────────── */
  /* 8. EFFETS                                                    */
  /* ─────────────────────────────────────────────────────────── */

  // Titre page
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = isEdit
        ? 'Modifier un produit | Admin Gercie'
        : 'Ajouter un produit | Admin Gercie'
    }
  }, [isEdit])

  // Guard admin
  useEffect(() => {
    if (authLoading) return

    if (!user) {
      const redirect = isEdit
        ? `/admin/produits/${productId}/modifier`
        : '/admin/produits/ajouter'

      router.replace(
        `/login?redirect=${encodeURIComponent(redirect)}`
      )

      return
    }

    if (!currentIsAdmin) {
      router.replace('/')
    }
  }, [
    authLoading,
    currentIsAdmin,
    isEdit,
    productId,
    router,
    user,
  ])

  // Wait rate
  useEffect(() => {
    if (!rateLoading) return

    const timeout = setTimeout(
      () => setRateWaited(true),
      PRODUCT_RATE_WAIT_TIMEOUT_MS
    )

    return () => clearTimeout(timeout)
  }, [rateLoading])

  // Préférence auto-save
  useEffect(() => {
    const saved = safeLocalStorageGet<boolean>(
      PRODUCT_AUTO_SAVE_ENABLED_STORAGE_KEY,
      false
    )

    setAutoSave(saved)
  }, [])

  /**
   * Initialisation unique :
   * - attend le produit en édition ;
   * - attend le taux sauf timeout ;
   * - ne se relance pas quand le taux change après initialisation,
   *   pour ne pas écraser une saisie en cours.
   */
  useEffect(() => {
    if (initializedRef.current) return

    if (isEdit) {
      if (productLoading) return
      if (!product) return
    }

    if (rateLoading && !rateWaited) return

    const draft = readProductDraft<any>(storageKey)

    const draftSavedAt = draft?._saved_at
      ? new Date(draft._saved_at).getTime()
      : 0

    const productUpdatedAt = (product as any)?.updated_at
      ? new Date((product as any).updated_at).getTime()
      : 0

    const draftIsNewer = Boolean(
      draft && draftSavedAt > productUpdatedAt
    )

    setDraftExists(Boolean(draft))
    setShowDraftBanner(Boolean(draft))
    setDraftRestored(draftIsNewer)

    const base = draftIsNewer
      ? draft
      : isEdit
        ? product
        : undefined

    const normalized = normalizeProductForForm(
      base,
      effectiveRate
    )

    setInitialValues(normalized || {})
    setFormKey((k) => k + 1)
    initializedRef.current = true
  }, [
    effectiveRate,
    isEdit,
    product,
    productLoading,
    rateLoading,
    rateWaited,
    storageKey,
  ])

  /**
   * Reset du hook formulaire quand initialValues change.
   * Cela évite de dépendre uniquement d’un remontage enfant.
   */
  useEffect(() => {
    if (!initialValues) return

    const f = formRef.current as any

    if (typeof f?.reset === 'function') {
      f.reset(initialValues)
    } else if (typeof f?.initialize === 'function') {
      f.initialize(initialValues)
    }

    setFormKey((k) => k + 1)
  }, [initialValues])

  // Résumé live
  useEffect(() => {
    const values = form.getProductValues?.()

    if (values) {
      setSummary(buildSummary(values, effectiveRate))
    }
  }, [effectiveRate, form.getProductValues])

  // Auto-save périodique
  useEffect(() => {
    if (!autoSave || !dirty) return

    const interval = setInterval(() => {
      const values = form.getProductValues?.()

      if (values && Object.keys(values).length > 0) {
        const payload = {
          ...values,
          _saved_at: new Date().toISOString(),
          _rate_used: effectiveRate ?? null,
          _usd_source: true,
        }

        writeProductDraft(storageKey, payload)
        setDraftExists(true)
        setLastSavedAt(payload._saved_at)
      }
    }, PRODUCT_AUTO_SAVE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [
    autoSave,
    dirty,
    effectiveRate,
    form.getProductValues,
    storageKey,
  ])

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 's'
      ) {
        e.preventDefault()
        void handleSave()
      }
    }

    window.addEventListener('keydown', handler)

    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // beforeunload
  useEffect(() => {
    if (!dirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)

    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  /* ─────────────────────────────────────────────────────────── */
  /* 9. USEMEMO CONTEXT                                           */
  /* ─────────────────────────────────────────────────────────── */

  const contextValue = useMemo(
    () => ({
      form,
      mode,
      productId: isEdit ? productId : null,
      rate: effectiveRate,
      rateLoading,
      rateOk,
      mounted,
    }),
    [
      effectiveRate,
      form,
      isEdit,
      mode,
      mounted,
      productId,
      rateLoading,
      rateOk,
    ]
  )

  /* ═══════════════════════════════════════════════════════════════ */
  /* 10. EARLY RETURNS                                               */
  /* ═══════════════════════════════════════════════════════════════ */

  if (authLoading || (isEdit && productLoading) || !initialValues) {
    return <ProductAdminSkeleton />
  }

  if (isEdit && productError && !product) {
    return (
      <Container className="py-16">
        <Card className="mx-auto max-w-md border-red-500/30 bg-red-500/5 p-8 text-center">
          <AlertTriangle
            size={48}
            className="mx-auto mb-4 text-red-500"
            aria-hidden="true"
          />

          <h2 className="mb-2 text-2xl font-bold text-foreground">
            Produit introuvable
          </h2>

          <p className="mb-6 text-muted-foreground">
            {productErrorObj instanceof Error
              ? productErrorObj.message
              : "Ce produit n'existe pas ou a été supprimé."}
          </p>

          <div className="flex justify-center gap-3">
            <Button
              variant="outline-gold"
              onClick={() => void refetch()}
              leftIcon={
                <RefreshCw size={14} aria-hidden="true" />
              }
            >
              Réessayer
            </Button>

            <Link href="/admin/produits">
              <Button variant="luxe">
                Retour aux produits
              </Button>
            </Link>
          </div>
        </Card>
      </Container>
    )
  }

  if (!user || !currentIsAdmin) return null
  if (isEdit && !product) return null

  /* ═══════════════════════════════════════════════════════════════ */
  /* 11. JSX FINAL                                                   */
  /* ═══════════════════════════════════════════════════════════════ */

  const motionInitial = prefersReducedMotion
    ? false
    : { opacity: 0, y: 12 }

  return (
    <ProductFormProvider value={contextValue}>
      <div className="min-h-screen bg-background pb-28">
        <Container className="py-8 md:py-10">
          {/* Breadcrumb */}
          <nav
            aria-label="Fil d'Ariane admin"
            className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link
              href="/admin"
              className="transition hover:text-gold-500"
            >
              Admin
            </Link>

            <ChevronRight size={14} aria-hidden="true" />

            <Link
              href="/admin/produits"
              className="transition hover:text-gold-500"
            >
              Produits
            </Link>

            <ChevronRight size={14} aria-hidden="true" />

            <span className="font-medium text-foreground">
              {isEdit ? 'Modifier' : 'Ajouter'}
            </span>

            {isEdit && product && (
              <>
                <ChevronRight size={14} aria-hidden="true" />

                <span className="max-w-[220px] truncate font-semibold text-gold-600">
                  {product.nom}
                </span>
              </>
            )}
          </nav>

          {/* Header */}
          <ProductAdminHeader
            mode={mode}
            product={isEdit ? product : null}
            rate={effectiveRate}
            rateLoading={rateLoading}
            dirty={dirty}
            draftRestored={draftRestored}
            activeStep={activeStep}
            submitting={submitting}
            deletePending={deletePending}
            duplicatePending={duplicatePending}
            onPreview={handlePreview}
            onDuplicate={handleDuplicate}
            onDelete={() => setShowDeleteModal(true)}
          />

          {/* Bannière brouillon */}
          <ProductDraftBanner
            showDraftBanner={showDraftBanner}
            draftRestored={draftRestored}
            submitting={submitting}
            onRestore={handleRestoreDraft}
            onIgnore={handleIgnoreDraft}
            onDiscard={handleDiscardDraft}
            onReloadServer={handleReloadServer}
            onSave={handleSave}
          />

          {/* Indicateur d'étapes */}
          <StepIndicator
            activeStep={activeStep}
            onStepChange={setActiveStep}
          />

          {/* Grille principale */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Formulaire */}
            <motion.div
              initial={motionInitial}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.3,
                delay: prefersReducedMotion ? 0 : 0.05,
              }}
              className="lg:col-span-2"
            >
              <Card className="overflow-hidden border-gold-400/20 bg-card/70 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {PRODUCT_STEPS[activeStep].icon}
                    {PRODUCT_STEPS[activeStep].label}
                  </CardTitle>

                  <CardDescription>
                    {PRODUCT_STEPS[activeStep].description}. USD reste la
                    source principale ; le CDF est recalculé automatiquement
                    quand le taux est disponible.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <StepRenderer
                    key={formKey}
                    activeStep={activeStep}
                  />
                </CardContent>
              </Card>
            </motion.div>

            {/* Sidebar */}
            <motion.aside
              initial={motionInitial}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.3,
                delay: prefersReducedMotion ? 0 : 0.1,
              }}
              className="lg:col-span-1"
            >
              <ProductAdminSidebar
                summary={summary}
                product={isEdit ? product : null}
                rate={effectiveRate}
                rateLoading={rateLoading}
                dirty={dirty}
                draftExists={draftExists}
                draftRestored={draftRestored}
                autoSave={autoSave}
                onToggleAutoSave={toggleAutoSave}
                lastSavedAt={lastSavedAt}
                initialValues={initialValues}
              />
            </motion.aside>
          </div>

          {/* Barre d'action */}
          <ProductAdminActions
            mode={mode}
            activeStep={activeStep}
            submitting={submitting}
            canSave={canSave}
            dirty={dirty}
            draftRestored={draftRestored}
            draftExists={draftExists}
            onPrev={goPrev}
            onNext={goNext}
            onSave={handleSave}
            onSaveDraft={handleSaveDraft}
            onReloadServer={handleReloadServer}
            onDiscardDraft={handleDiscardDraft}
          />
        </Container>

        {/* Modals */}
        <AnimatePresence>
          {showPreview && (
            <ProductPreviewModal
              open={showPreview}
              onClose={() => setShowPreview(false)}
              values={previewValues}
              rate={effectiveRate}
              saving={submitting}
              onSave={() => {
                setShowPreview(false)
                void handleSave()
              }}
              mode={mode}
            />
          )}
        </AnimatePresence>

        {isEdit && (
          <ProductDeleteModal
            open={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            productName={product?.nom || ''}
            deleting={deletePending}
            onConfirm={handleDelete}
          />
        )}
      </div>
    </ProductFormProvider>
  )
}