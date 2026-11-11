// features/admin/produits/components/ProductAdminPage.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
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
import type { ProductAdminMode, ProductDetail, FormSummary } from '../types'

/* ═══════════════════════════════════════════════════════════════ */
/*  PROPS                                                          */
/* ═══════════════════════════════════════════════════════════════ */
interface ProductAdminPageProps {
  mode: ProductAdminMode
  productId?: string | null
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
  const toast = useToast()
  const { rate, loading: rateLoading } = useExchangeRate()

  const currentIsAdmin = Boolean(isAdmin)
  const isEdit = mode === 'edit'
  const storageKey = getProductDraftStorageKey(mode, productId)

  /* ─────────────────────────────────────────────────────────── */
  /* 2. ÉTATS LOCAUX (useState)                                   */
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

  // Modals
  const [showPreview, setShowPreview] = useState(false)
  const [previewValues, setPreviewValues] = useState<any>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  /* ─────────────────────────────────────────────────────────── */
  /* 3. QUERY (React Query)                                       */
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
  /* 4. EFFETS (useEffect)                                        */
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
      router.replace(`/login?redirect=${encodeURIComponent(redirect)}`)
      return
    }
    if (!currentIsAdmin) {
      router.replace('/')
    }
  }, [authLoading, currentIsAdmin, isEdit, productId, router, user])

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

  // Initialisation : produit + brouillon
  useEffect(() => {
    if (isEdit) {
      if (!product) return
      if (rateLoading && !rateWaited) return
    } else {
      if (rateLoading && !rateWaited) return
    }

    const draft = readProductDraft<any>(storageKey)
    const draftSavedAt = draft?._saved_at
      ? new Date(draft._saved_at).getTime()
      : 0
    const productUpdatedAt = product?.updated_at
      ? new Date(product.updated_at).getTime()
      : 0
    const draftIsNewer = Boolean(draft && draftSavedAt > productUpdatedAt)

    setDraftExists(Boolean(draft))
    setShowDraftBanner(Boolean(draft))
    setDraftRestored(draftIsNewer)

    const base = draftIsNewer ? draft : (isEdit ? product : undefined)
    const normalized = normalizeProductForForm(base, rate)
    setInitialValues(normalized || {})
    setFormKey((k) => k + 1)
  }, [product, rate, rateLoading, rateWaited, storageKey, isEdit])

  /* ─────────────────────────────────────────────────────────── */
  /* 5. HOOK PERSONNALISÉ : FORMULAIRE                            */
  /* ─────────────────────────────────────────────────────────── */
  const form = useProductFormState({
    productId: isEdit ? productId : null,
    initialData: initialValues,
    onValuesChange: (values) => {
      setSummary(buildSummary(values, rate))
    },
    enableAutosave: false,
    storageKey,
  })

  /* ─────────────────────────────────────────────────────────── */
  /* 6. VALEURS DÉRIVÉES (pas des hooks, simples calculs)         */
  /* ─────────────────────────────────────────────────────────── */
  const dirty = form.isDirty || draftRestored
  const canSave = dirty || draftRestored

  /* ─────────────────────────────────────────────────────────── */
  /* 7. EFFETS SUPPLÉMENTAIRES (dépendent de form)                */
  /* ─────────────────────────────────────────────────────────── */

  // Résumé live
  useEffect(() => {
    const values = form.getProductValues()
    if (values) {
      setSummary(buildSummary(values, rate))
    }
  }, [form.getProductValues, rate])

  // Auto-save périodique
  useEffect(() => {
    if (!autoSave || !dirty) return
    const interval = setInterval(() => {
      const values = form.getProductValues()
      if (values && Object.keys(values).length > 0) {
        const payload = { ...values, _saved_at: new Date().toISOString() }
        writeProductDraft(storageKey, payload)
        setDraftExists(true)
        setLastSavedAt(payload._saved_at)
      }
    }, PRODUCT_AUTO_SAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [autoSave, dirty, form.getProductValues, storageKey])

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
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
  /* 8. CALLBACKS (useCallback)                                   */
  /* ─────────────────────────────────────────────────────────── */

  const toggleAutoSave = useCallback(() => {
    setAutoSave((prev) => {
      const next = !prev
      safeLocalStorageSet(PRODUCT_AUTO_SAVE_ENABLED_STORAGE_KEY, next)
      return next
    })
  }, [])

  const goNext = useCallback(() => {
    setActiveStep((prev) => Math.min(prev + 1, PRODUCT_STEPS.length - 1))
  }, [])

  const goPrev = useCallback(() => {
    setActiveStep((prev) => Math.max(prev - 1, 0))
  }, [])

  const handleSave = useCallback(async () => {
    const values = form.getProductValues()
    if (!values) {
      toast.addToast({ type: 'error', message: 'Formulaire indisponible.' })
      return
    }
    const prepared = sanitizePayload(values, rate)
    if (prepared.errors.length > 0) {
      toast.addToast({
        type: 'error',
        message: prepared.errors.join(' • '),
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(prepared.payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || "Erreur lors de l'enregistrement.")
      }
      queryClient.invalidateQueries({ queryKey: ['admin-product', productId] })
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      removeProductDraft(storageKey)
      setDraftExists(false)
      setDraftRestored(false)
      setShowDraftBanner(false)
      setLastSavedAt(new Date().toISOString())
      toast.addToast({
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
      toast.addToast({
        type: 'error',
        message: err?.message || "Impossible d'enregistrer le produit.",
      })
    } finally {
      setSubmitting(false)
    }
  }, [form, isEdit, productId, queryClient, rate, router, storageKey, toast])

  const handlePreview = useCallback(() => {
    const values = form.getProductValues()
    if (!values) {
      toast.addToast({ type: 'error', message: 'Formulaire indisponible.' })
      return
    }
    const prepared = sanitizePayload(values, rate)
    if (prepared.errors.length > 0) {
      toast.addToast({ type: 'error', message: prepared.errors[0] })
      return
    }
    setPreviewValues(values)
    setShowPreview(true)
  }, [form, rate, toast])

  const handleDuplicate = useCallback(async () => {
    if (!productId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/produits/${productId}/duplicate`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Erreur duplication.')
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      const newId = json?.data?.id || json?.id
      toast.addToast({ type: 'success', message: 'Produit dupliqué.' })
      if (newId) router.push(`/admin/produits/${newId}/modifier`)
      else router.push('/admin/produits')
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err?.message || 'Erreur.' })
    } finally {
      setSubmitting(false)
    }
  }, [productId, queryClient, router, toast])

  const handleDelete = useCallback(async () => {
    if (!productId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/produits/${productId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Erreur suppression.')
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      removeProductDraft(storageKey)
      toast.addToast({ type: 'success', message: 'Produit supprimé.' })
      router.push('/admin/produits')
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err?.message || 'Erreur.' })
    } finally {
      setSubmitting(false)
    }
  }, [productId, queryClient, router, storageKey, toast])

  const handleSaveDraft = useCallback(() => {
    const values = form.getProductValues()
    if (!values || Object.keys(values).length === 0) {
      toast.addToast({
        type: 'error',
        message: 'Aucune donnée à sauvegarder.',
      })
      return
    }
    const payload = { ...values, _saved_at: new Date().toISOString() }
    const ok = writeProductDraft(storageKey, payload)
    if (ok) {
      setDraftExists(true)
      setLastSavedAt(payload._saved_at)
      toast.addToast({
        type: 'success',
        message: 'Brouillon enregistré localement.',
      })
    } else {
      toast.addToast({
        type: 'error',
        message: "Impossible d'enregistrer.",
      })
    }
  }, [form, storageKey, toast])

  const handleRestoreDraft = useCallback(() => {
    const draft = readProductDraft<any>(storageKey)
    if (!draft) {
      toast.addToast({ type: 'error', message: 'Aucun brouillon trouvé.' })
      return
    }
    const normalized = normalizeProductForForm(draft, rate)
    setInitialValues(normalized)
    setDraftRestored(true)
    setShowDraftBanner(false)
    setFormKey((k) => k + 1)
    toast.addToast({ type: 'info', message: 'Brouillon local restauré.' })
  }, [rate, storageKey, toast])

  const handleIgnoreDraft = useCallback(() => {
    setShowDraftBanner(false)
  }, [])

  const handleDiscardDraft = useCallback(() => {
    removeProductDraft(storageKey)
    setDraftExists(false)
    setDraftRestored(false)
    setShowDraftBanner(false)
    if (isEdit && product) {
      const normalized = normalizeProductForForm(product, rate)
      setInitialValues(normalized)
      setFormKey((k) => k + 1)
    }
    toast.addToast({ type: 'info', message: 'Brouillon supprimé.' })
  }, [isEdit, product, rate, storageKey, toast])

  const handleReloadServer = useCallback(() => {
    if (!isEdit || !product) return
    removeProductDraft(storageKey)
    const normalized = normalizeProductForForm(product, rate)
    setInitialValues(normalized)
    setFormKey((k) => k + 1)
    setDraftRestored(false)
    setShowDraftBanner(false)
    toast.addToast({ type: 'info', message: 'Version serveur rechargée.' })
  }, [isEdit, product, rate, storageKey, toast])

  /* ─────────────────────────────────────────────────────────── */
  /* 9. USEMEMO (TOUJOURS AVANT LES EARLY RETURNS !)              */
  /* ─────────────────────────────────────────────────────────── */
  const contextValue = useMemo(
    () => ({
      form,
      mode,
      productId: isEdit ? productId : null,
      rate,
      rateLoading,
    }),
    [form, mode, isEdit, productId, rate, rateLoading]
  )

  /* ═══════════════════════════════════════════════════════════════ */
  /* 10. EARLY RETURNS (REGROUPÉS ICI, APRÈS TOUS LES HOOKS)        */
  /* ═══════════════════════════════════════════════════════════════ */

  if (authLoading || (isEdit && productLoading) || !initialValues) {
    return <ProductAdminSkeleton />
  }

  if (isEdit && productError && !product) {
    return (
      <Container className="py-16">
        <Card className="mx-auto max-w-md border-red-500/30 bg-red-500/5 p-8 text-center">
          <AlertTriangle size={48} className="mx-auto mb-4 text-red-500" />
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
              onClick={() => refetch()}
              leftIcon={<RefreshCw size={14} />}
            >
              Réessayer
            </Button>
            <Link href="/admin/produits">
              <Button variant="luxe">Retour aux produits</Button>
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
  return (
    <ProductFormProvider value={contextValue}>
      <div className="min-h-screen bg-background pb-28">
        <Container className="py-8 md:py-10">
          {/* Breadcrumb */}
          <nav
            aria-label="Fil d'Ariane admin"
            className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link href="/admin" className="transition hover:text-gold-500">
              Admin
            </Link>
            <ChevronRight size={14} />
            <Link
              href="/admin/produits"
              className="transition hover:text-gold-500"
            >
              Produits
            </Link>
            <ChevronRight size={14} />
            <span className="font-medium text-foreground">
              {isEdit ? 'Modifier' : 'Ajouter'}
            </span>
            {isEdit && product && (
              <>
                <ChevronRight size={14} />
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
            rate={rate}
            rateLoading={rateLoading}
            dirty={dirty}
            draftRestored={draftRestored}
            activeStep={activeStep}
            submitting={submitting}
            deletePending={false}
            duplicatePending={false}
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
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="lg:col-span-2"
            >
              <Card className="overflow-hidden border-gold-400/20 bg-card/70 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {PRODUCT_STEPS[activeStep].icon}
                    {PRODUCT_STEPS[activeStep].label}
                  </CardTitle>
                  <CardDescription>
                    {PRODUCT_STEPS[activeStep].description}. Les anciennes
                    données de portefeuille sont automatiquement ignorées.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StepRenderer activeStep={activeStep} />
                </CardContent>
              </Card>
            </motion.div>

            {/* Sidebar */}
            <motion.aside
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="lg:col-span-1"
            >
              <ProductAdminSidebar
                summary={summary}
                product={isEdit ? product : null}
                rate={rate}
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
              rate={rate}
              saving={submitting}
              onSave={() => {
                setShowPreview(false)
                handleSave()
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
            deleting={submitting}
            onConfirm={handleDelete}
          />
        )}
      </div>
    </ProductFormProvider>
  )
}