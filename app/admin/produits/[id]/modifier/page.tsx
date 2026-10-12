// app/admin/produits/[id]/modifier/page.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import {
  ArrowLeft,
  Save,
  Eye,
  Copy,
  Trash2,
  Sparkles,
  AlertTriangle,
  RefreshCcw,
  History,
  ShoppingCart,
  Star,
  Package,
  DollarSign,
  Zap,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProductDetail {
  id: string
  nom: string
  prix: number
  prix_usd?: number
  stock: number
  est_actif: boolean
  images: string[]
  categorie?: string
  description?: string
  variantes?: any[]
  total_ventes?: number
  note_moyenne?: number
  created_at?: string
  updated_at?: string
  badges?: string[]
  sku?: string
  barcode?: string
  meta_title?: string
  meta_description?: string
  tags?: string
  marque?: string
  poids_kg?: number
  longueur_cm?: number
  largeur_cm?: number
  hauteur_cm?: number
  remise_percent?: number
  featured?: boolean
  ribbon?: string
  delay_livraison?: string
  limit_per_client?: number
  notes_internes?: string
}

/* ------------------------------------------------------------------ */
/*  Page de modification d’un produit                                  */
/* ------------------------------------------------------------------ */

export default function ModifierProduitPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, loading: authLoading, isAdmin } = useAuth()
  const toast = useToast()

  const [submitting, setSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceSuggestion, setPriceSuggestion] = useState<{ suggestedPrice: number; reasoning: string } | null>(null)
  const formRef = useRef<{ getValues: () => any; reset: () => void; setDescription?: (desc: string) => void }>(null)

  // Vérification admin
  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      router.replace('/')
      toast.addToast({ type: 'error', message: 'Accès réservé aux administrateurs' })
    }
  }, [authLoading, user, isAdmin, router, toast])

  // Chargement du produit
  const {
    data: product,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ProductDetail>({
    queryKey: ['admin-product', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/produits/${id}`)
      if (!res.ok) throw new Error('Produit introuvable')
      return res.json()
    },
    enabled: !!id && !!user && isAdmin,
    staleTime: 30_000,
  })

  // Mutation update
  const updateMutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await fetch(`/api/admin/produits/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur mise à jour')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-product', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.addToast({ type: 'success', message: 'Produit mis à jour avec succès !' })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  // Mutation suppression
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/produits/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur suppression')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.addToast({ type: 'success', message: 'Produit supprimé' })
      router.push('/admin/produits')
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  // Mutation duplication
  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/produits/${id}/duplicate`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur duplication')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.addToast({ type: 'success', message: 'Produit dupliqué !' })
      router.push(`/admin/produits/${data.id}/modifier`)
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  const handleSubmit = async () => {
    const form = formRef.current
    if (!form) return
    const values = form.getValues()
    setSubmitting(true)
    await updateMutation.mutateAsync(values)
    setSubmitting(false)
  }

  const handleDelete = () => {
    deleteMutation.mutate()
    setConfirmDelete(false)
  }

  // Callback pour description générée
  const handleDescriptionGenerated = (description: string) => {
    if (formRef.current?.setDescription) {
      formRef.current.setDescription(description)
    } else {
      toast.addToast({ type: 'info', message: 'Description générée (copiez-la dans le champ)' })
    }
  }

  // Suggestion de prix IA
  const handlePriceSuggestion = async () => {
    setPriceLoading(true)
    setPriceSuggestion(null)
    try {
      const res = await fetch('/api/ai/admin/price-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      const data = await res.json()
      setPriceSuggestion(data)
      toast.addToast({ type: 'info', message: `Prix suggéré : ${data.suggestedPrice} FC` })
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setPriceLoading(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="xl" variant="premium" label="Chargement du produit..." />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <AlertTriangle size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Produit introuvable</h2>
        <p className="text-muted-foreground mb-6">{(error as Error)?.message || 'Ce produit n’existe pas ou a été supprimé.'}</p>
        <div className="flex gap-3">
          <Button variant="outline-gold" onClick={() => refetch()}>
            <RefreshCcw size={14} className="mr-1" /> Réessayer
          </Button>
          <Link href="/admin/produits">
            <Button variant="luxe">Retour aux produits</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!product) return null

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8 max-w-6xl">
        {/* Fil d’ariane */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/admin/produits" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-gold-500 transition-colors">
            <ArrowLeft size={16} /> Produits
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-foreground">Modifier</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold text-gold-600">{product.nom}</span>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En‑tête avec actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground font-serif flex items-center gap-3">
                <Sparkles size={28} className="text-gold-500" />
                Modifier le produit
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={product.est_actif ? 'accent' : 'danger'} size="sm">
                  {product.est_actif ? 'Actif' : 'Inactif'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  ID : {product.id.slice(0, 8)}...
                </span>
                <span className="text-xs text-muted-foreground">
                  Créé le {product.created_at ? new Date(product.created_at).toLocaleDateString('fr-FR') : '—'}
                </span>
                {product.updated_at && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <History size={12} /> Mis à jour le {new Date(product.updated_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Tooltip content="Aperçu du produit côté client">
                <Button variant="outline-gold" size="sm" onClick={() => setShowPreview(true)} leftIcon={<Eye size={16} />}>
                  Aperçu
                </Button>
              </Tooltip>
              <Tooltip content="Dupliquer ce produit">
                <Button
                  variant="outline-gold"
                  size="sm"
                  onClick={() => duplicateMutation.mutate()}
                  loading={duplicateMutation.isPending}
                  leftIcon={<Copy size={16} />}
                >
                  Dupliquer
                </Button>
              </Tooltip>
              <Tooltip content="Supprimer définitivement ce produit">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  leftIcon={<Trash2 size={16} />}
                >
                  Supprimer
                </Button>
              </Tooltip>
              {/* Boutons IA */}
              <Tooltip content="Générer une description avec l'IA">
                <GenerateDescriptionButton
                  productName={product.nom}
                  category={product.categorie}
                  attributes={product.marque ? `Marque : ${product.marque}` : undefined}
                  onGenerated={handleDescriptionGenerated}
                />
              </Tooltip>
              <Tooltip content="Suggestion de prix basée sur l'IA">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePriceSuggestion}
                  loading={priceLoading}
                  leftIcon={<Zap size={16} />}
                >
                  Prix IA
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* Stats rapides */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { icon: <ShoppingCart size={20} className="text-gold-500" />, label: 'Ventes', value: product.total_ventes ?? 0 },
              { icon: <Star size={20} className="text-amber-500" />, label: 'Note', value: product.note_moyenne?.toFixed(1) || '—' },
              { icon: <Package size={20} className="text-blue-500" />, label: 'Stock', value: product.stock ?? 0 },
              { icon: <DollarSign size={20} className="text-green-500" />, label: 'Prix', value: `${product.prix.toLocaleString()} FC` },
            ].map((stat, idx) => (
              <div key={idx} className="bg-card rounded-xl p-4 border border-border flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gold-400/10">{stat.icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="font-bold text-foreground">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Suggestion de prix IA */}
          {priceSuggestion && (
            <div className="mb-6 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                <Sparkles size={16} />
                <strong>Suggestion IA :</strong> {priceSuggestion.suggestedPrice.toLocaleString()} FC
                {product && priceSuggestion.suggestedPrice !== product.prix && (
                  <span className="text-xs ml-2">
                    ({(priceSuggestion.suggestedPrice - product.prix > 0 ? '+' : '')}{(priceSuggestion.suggestedPrice - product.prix).toLocaleString()} FC)
                  </span>
                )}
              </div>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">{priceSuggestion.reasoning}</p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="luxe"
                  onClick={() => {
                    if (formRef.current) {
                      // Mettre à jour le champ prix via une méthode du formulaire
                      // Supposons que le formulaire expose une méthode setPrice (ou on utilise getValues et on modifie)
                      // Pour rester générique, on va utiliser une astuce : on récupère les valeurs actuelles et on soumet
                      // une mise à jour du prix uniquement.
                      const currentValues = formRef.current.getValues()
                      updateMutation.mutate({ ...currentValues, prix: priceSuggestion.suggestedPrice })
                      setPriceSuggestion(null)
                    }
                  }}
                >
                  Appliquer ce prix
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPriceSuggestion(null)}>
                  Ignorer
                </Button>
              </div>
            </div>
          )}

          {/* Formulaire principal */}
          <Card variant="glass" className="border-gold-400/20 shadow-soft">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">Informations du produit</CardTitle>
              <CardDescription>
                Modifiez les champs ci-dessous et enregistrez vos modifications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminProductForm
                ref={formRef}
                productId={product.id}
                initialData={product}
                submitting={submitting}
                onSubmit={async (values) => {
                  // non utilisé directement
                }}
              />
            </CardContent>
          </Card>

          {/* Boutons d’enregistrement (fixes en bas) */}
          <div className="flex items-center justify-between mt-6">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/produits')}>
              <ArrowLeft size={16} className="mr-1" /> Retour aux produits
            </Button>
            <div className="flex gap-2">
              <Button variant="outline-gold" size="sm" onClick={() => {
                formRef.current?.reset()
                toast.addToast({ type: 'info', message: 'Formulaire réinitialisé' })
              }}>
                <RefreshCcw size={16} className="mr-1" /> Annuler les modifications
              </Button>
              <Button
                variant="luxe"
                size="md"
                onClick={handleSubmit}
                loading={updateMutation.isPending}
              >
                <Save size={16} className="mr-1" /> Enregistrer les modifications
              </Button>
            </div>
          </div>
        </motion.div>
      </Container>

      {/* Modal de confirmation suppression */}
      <Modal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} title="Confirmer la suppression" size="sm" accent="danger">
        <div className="text-center space-y-4">
          <AlertTriangle size={48} className="mx-auto text-red-500" />
          <p className="text-neutral-700 dark:text-neutral-300">
            Voulez-vous vraiment supprimer <strong>{product.nom}</strong> ?<br />
            Cette action est irréversible.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="danger" onClick={handleDelete} loading={deleteMutation.isPending}>
              Supprimer définitivement
            </Button>
            <Button variant="outline-gold" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      {/* Modal d’aperçu enrichi */}
      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Aperçu du produit" size="lg" accent="gold">
        {product && (
          <div className="space-y-4">
            {product.images?.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {product.images.map((url, idx) => (
                  <img key={idx} src={url} alt="" className="w-32 h-32 object-cover rounded-lg" />
                ))}
              </div>
            )}
            <h3 className="text-xl font-bold">{product.nom}</h3>
            {product.description && <p className="text-muted-foreground text-sm line-clamp-3">{product.description}</p>}
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-gold-600">{product.prix?.toLocaleString()} FC</span>
              <Badge variant={product.stock > 0 ? 'accent' : 'danger'}>
                Stock : {product.stock}
              </Badge>
            </div>
            {product.badges && product.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {product.badges.map(badgeId => (
                  <Badge key={badgeId} variant="gold" size="sm">{badgeId}</Badge>
                ))}
              </div>
            )}
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