// app/admin/produits/ajouter/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import AdminProductForm from '@/features/admin/components/AdminProductForm'
import GenerateDescriptionButton from '@/components/admin/GenerateDescriptionButton' // 👈 ajout
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { Spinner } from '@/components/ui/Spinner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { ProductBadges } from '@/components/badges/ProductBadges'
import {
  ArrowLeft, Save, Eye, Upload, Sparkles, Wand2,
  AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft,
  LayoutGrid, List, Image as ImageIcon, Tag, DollarSign,
  Package, Info, HelpCircle, Search, Truck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'admin-draft-product'

export default function AjouterProduitPage() {
  const router = useRouter()
  const { user, loading: authLoading, isAdmin } = useAuth()
  const toast = useToast()

  const [submitting, setSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<DraftProduct | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const formRef = useRef<{ getValues: () => DraftProduct; reset: () => void; setDescription?: (desc: string) => void }>(null)

  // Ajout d'un état local pour les données du formulaire (nom, catégorie)
  const [formValues, setFormValues] = useState({ nom: '', categorie: '' })

  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      router.replace('/')
      toast.addToast({ type: 'error', message: 'Accès réservé aux administrateurs' })
    }
  }, [authLoading, user, isAdmin, router, toast])

  useEffect(() => {
    try {
      const draft = localStorage.getItem(STORAGE_KEY)
      if (draft) {
        const parsed = JSON.parse(draft)
        setDraftLoaded(true)
        setFormValues({ nom: parsed.nom || '', categorie: parsed.categorie || '' })
      }
    } catch {}
  }, [])

  // Mettre à jour les valeurs du formulaire lorsqu'elles changent
  const updateFormValues = useCallback(() => {
    if (formRef.current) {
      const vals = formRef.current.getValues()
      setFormValues({ nom: vals.nom || '', categorie: vals.categorie || '' })
    }
  }, [])

  const handleSubmit = async (values: DraftProduct) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/produits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur création')
      const data = await res.json()
      localStorage.removeItem(STORAGE_KEY)
      toast.addToast({ type: 'success', message: 'Produit créé avec succès !' })
      router.push(`/admin/produits/${data.id}/modifier`)
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveDraft = () => {
    const form = formRef.current
    if (!form) return
    const values = form.getValues()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
    toast.addToast({ type: 'info', message: 'Brouillon enregistré localement' })
  }

  const handlePreview = () => {
    const form = formRef.current
    if (!form) return
    const values = form.getValues()
    setPreviewData(values)
    setShowPreview(true)
  }

  // Callback pour la description générée
  const handleDescriptionGenerated = (description: string) => {
    if (formRef.current?.setDescription) {
      formRef.current.setDescription(description)
    } else {
      // Fallback : on pourrait utiliser l'état local ou un toast
      toast.addToast({ type: 'info', message: 'Description générée (copiez-la dans le champ)' })
    }
  }

  const steps = [
    { id: 'general', label: 'Général', icon: <Package size={18} /> },
    { id: 'media', label: 'Médias', icon: <ImageIcon size={18} /> },
    { id: 'prix', label: 'Prix & Stock', icon: <DollarSign size={18} /> },
    { id: 'variantes', label: 'Variantes', icon: <Tag size={18} /> },
    { id: 'livraison', label: 'Livraison', icon: <Truck size={18} /> },
    { id: 'specs', label: 'Spécifications', icon: <Info size={18} /> },
    { id: 'seo', label: 'SEO', icon: <Search size={18} /> },
    { id: 'badges', label: 'Badges', icon: <Tag size={18} /> },
    { id: 'details', label: 'Détails', icon: <Info size={18} /> },
  ]

  const stepToSection = (stepId: string): string => {
    if (stepId === 'media') return 'media'
    if (stepId === 'prix') return 'prix'
    if (stepId === 'variantes') return 'variantes'
    if (stepId === 'specs') return 'specs'
    if (stepId === 'seo') return 'seo'
    if (stepId === 'badges') return 'badges'
    if (stepId === 'details') return 'details'
    return 'general'
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="xl" variant="premium" label="Vérification des droits..." />
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8 max-w-6xl">
        {/* Breadcrumb & retour */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-gold-500 transition-colors"
          >
            <ArrowLeft size={16} /> Retour
          </button>
          <span className="text-muted-foreground">/</span>
          <Link href="/admin/produits" className="text-muted-foreground hover:text-gold-500">
            Produits
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-foreground">Ajouter un produit</span>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En‑tête avec actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground font-serif flex items-center gap-3">
                <Sparkles size={28} className="text-gold-500" />
                Nouveau produit
              </h1>
              <p className="text-muted-foreground mt-1">
                Complétez les informations pour ajouter un produit au catalogue
              </p>
            </div>
            <div className="flex gap-2">
              <Tooltip content="Aperçu avant publication">
                <Button variant="outline-gold" size="sm" onClick={handlePreview} leftIcon={<Eye size={16} />}>
                  Aperçu
                </Button>
              </Tooltip>
              <Tooltip content="Sauvegarder le brouillon localement">
                <Button variant="outline-gold" size="sm" onClick={handleSaveDraft} leftIcon={<Save size={16} />}>
                  Brouillon
                </Button>
              </Tooltip>
              <Tooltip content="Générer une description avec l'IA">
                <GenerateDescriptionButton
                  productName={formValues.nom}
                  category={formValues.categorie}
                  onGenerated={handleDescriptionGenerated}
                />
              </Tooltip>
            </div>
          </div>

          {/* Indicateur de brouillon existant */}
          {draftLoaded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300"
            >
              <Info size={16} />
              <span>Un brouillon a été détecté. Les champs ont été pré-remplis.</span>
              <button
                onClick={() => {
                  localStorage.removeItem(STORAGE_KEY)
                  setDraftLoaded(false)
                  formRef.current?.reset()
                  setFormValues({ nom: '', categorie: '' })
                  toast.addToast({ type: 'info', message: 'Brouillon supprimé' })
                }}
                className="ml-auto underline hover:text-red-500"
              >
                Effacer
              </button>
            </motion.div>
          )}

          {/* Stepper */}
          <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
            {steps.map((step, idx) => (
              <button
                key={step.id}
                onClick={() => setActiveStep(idx)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap border',
                  idx === activeStep
                    ? 'bg-gold-500 text-white border-gold-500 shadow-gold'
                    : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                )}
              >
                <span className={cn(idx === activeStep ? 'text-white' : 'text-muted-foreground')}>{step.icon}</span>
                {step.label}
                {idx < steps.length - 1 && <ChevronRight size={14} className="ml-1" />}
              </button>
            ))}
          </div>

          {/* Formulaire */}
          <Card variant="glass" className="border-gold-400/20 shadow-soft">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                {steps[activeStep]?.icon}
                {steps[activeStep]?.label}
              </CardTitle>
              <CardDescription>
                Remplissez les informations requises. Les champs marqués d’un astérisque (*) sont obligatoires.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminProductForm
                ref={formRef}
                initialData={draftLoaded ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') : undefined}
                onSubmit={handleSubmit}
                submitting={submitting}
                activeSection={stepToSection(steps[activeStep].id)}
                onValuesChange={updateFormValues}  // 👈 nouvelle prop pour suivre les changements
              />
            </CardContent>
          </Card>

          {/* Boutons de navigation (bas) */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
              disabled={activeStep === 0}
            >
              <ChevronLeft size={16} className="mr-1" /> Précédent
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => router.push('/admin/produits')}>
                Annuler
              </Button>
              <Button
                variant="luxe"
                size="sm"
                onClick={() => {
                  if (activeStep < steps.length - 1) {
                    setActiveStep(prev => prev + 1)
                  } else {
                    formRef.current?.getValues() && handleSubmit(formRef.current!.getValues())
                  }
                }}
                loading={submitting && activeStep === steps.length - 1}
              >
                {activeStep < steps.length - 1 ? (
                  <>
                    Suivant <ChevronRight size={16} className="ml-1" />
                  </>
                ) : (
                  <>
                    <Save size={16} className="mr-1" /> Publier le produit
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </Container>

      {/* Modal d’aperçu */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Aperçu du produit"
        size="lg"
        accent="gold"
      >
        {previewData && (
          <div className="space-y-4">
            {previewData.images?.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {previewData.images.map((url, idx) => (
                  <img key={idx} src={url} alt="" className="w-32 h-32 object-cover rounded-lg" />
                ))}
              </div>
            )}
            {previewData.badges && previewData.badges.length > 0 && (
              <ProductBadges badgeIds={previewData.badges} size="sm" />
            )}
            <h3 className="text-xl font-bold">{previewData.nom || 'Sans titre'}</h3>
            {previewData.description && <p className="text-muted-foreground text-sm line-clamp-3">{previewData.description}</p>}
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-gold-600">{previewData.prix?.toLocaleString()} FC</span>
              {previewData.stock !== undefined && (
                <Badge variant={previewData.stock > 0 ? 'accent' : 'danger'}>
                  Stock : {previewData.stock}
                </Badge>
              )}
            </div>
            {previewData.specifications && previewData.specifications.length > 0 && (
              <div className="border-t border-border pt-3 mt-3">
                <p className="text-sm font-medium mb-2">Spécifications</p>
                {previewData.specifications.map((s, i) => (
                  <div key={i} className="flex justify-between text-xs py-1">
                    <span className="text-muted-foreground">{s.key}</span>
                    <span className="font-medium">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground">Catégorie : {previewData.categorie || 'Non spécifiée'}</p>
            <Button variant="outline-gold" onClick={() => setShowPreview(false)}>
              Fermer l’aperçu
            </Button>
          </div>
        )}
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}