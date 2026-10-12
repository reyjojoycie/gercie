// app/commande/confirmation/page.tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle, XCircle, RefreshCw, AlertCircle,
  Copy, CreditCard, Key, Truck, MapPin, Package,
  MessageCircle, Facebook, FileText, Clock,
  ExternalLink, HelpCircle, Loader2, Star, Share2,
  ShoppingBag, ChevronRight, Download, Printer, Gift,
  ShieldCheck, Users, ThumbsUp, TrendingUp, Sparkles,
  ChevronLeft, Phone, Mail, BadgeCheck, Camera, Zap,
  Heart, Eye, QrCode
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { confettiCelebration } from '@/lib/confetti'
import { cn } from '@/lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

/* ========================================================================== */
/* Modèles de Types Stricts – adaptés au nouveau flux                        */
/* ========================================================================== */

interface Article {
  id: string
  nom: string
  quantite: number
  prix_unitaire: number
  image?: string
  specifications?: string
  statut_collecte?: string
  motif_refus?: string
}

interface OrderDetail {
  id: string
  numero: string
  total: number
  statut: string
  date: string
  type_livraison: string
  adresse_livraison?: string
  point_retrait?: { nom: string; adresse: string; latitude?: number; longitude?: number }
  articles: Article[]
  code_client?: string          // code secret client pour validation livraison
  suivi_url?: string
  facture_url?: string
  message_cadeau?: string
}

// Configuration des statuts étendue avec le nouveau statut "conditionnement_premium"
const statutConfig: Record<string, { variant: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral'; label: string; icon?: React.ReactNode }> = {
  en_attente: { variant: 'warm', label: 'En attente de paiement', icon: <Clock size={14} /> },
  payee: { variant: 'gold', label: 'Commande Payée', icon: <CreditCard size={14} /> },
  conditionnement_premium: { variant: 'neutral', label: 'Conditionnement Premium', icon: <Package size={14} /> },
  collecte: { variant: 'neutral', label: 'En cours de préparation', icon: <Package size={14} /> }, // rétrocompatibilité
  en_livraison: { variant: 'warm', label: 'Colis en cours de livraison', icon: <Truck size={14} /> },
  livree: { variant: 'accent', label: 'Livraison effectuée', icon: <CheckCircle size={14} /> },
  annulee: { variant: 'danger', label: 'Commande Annulée', icon: <XCircle size={14} /> },
}

const getCollecteBadge = (statut?: string) => {
  if (statut === 'accepte') return { variant: 'accent' as const, icon: <CheckCircle size={14} />, label: 'Validé en stock' }
  if (statut === 'refuse') return { variant: 'danger' as const, icon: <XCircle size={14} />, label: 'Indisponible' }
  return { variant: 'neutral' as const, icon: <Clock size={14} />, label: 'Vérification logistique' }
}

/* ========================================================================== */
/* Composant Core Principal                                                   */
/* ========================================================================== */

export default function ConfirmationPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { clearCart } = useCart()
  const toast = useToast()
  const { rate } = useExchangeRate()
  const queryClient = useQueryClient()

  const commandeId = searchParams.get('id')
  const [copied, setCopied] = useState<string | null>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const isCartCleared = useRef(false)

  // Chargement asynchrone des métadonnées de la commande via React Query
  const {
    data: order,
    isLoading: loading,
    error,
    refetch,
  } = useQuery<OrderDetail>({
    queryKey: ['commande', commandeId],
    queryFn: async () => {
      if (!commandeId) throw new Error("Aucun identifiant de commande n'est présent dans l'URL.")
      const res = await fetch(`/api/commandes/${commandeId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Impossible d\'extraire les détails de la commande.')
      return data
    },
    enabled: !!commandeId && !!user,
    staleTime: 15_000,
    retry: 1,
  })

  // Purge sécurisée du panier du client uniquement si la commande est honorée ou payée
  useEffect(() => {
    if (order && !isCartCleared.current) {
      const statutsValidesPourVider = ['payee', 'conditionnement_premium', 'collecte', 'en_livraison', 'livree']
      if (statutsValidesPourVider.includes(order.statut.toLowerCase())) {
        clearCart()
        isCartCleared.current = true
      }
    }
  }, [order, clearCart])

  // Mutation d'annulation de la commande
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/commandes/${commandeId}/cancel`, { method: 'PUT' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'annulation.')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commande', commandeId] })
      refetch()
      toast.addToast({ type: 'success', message: 'Votre commande a été annulée de notre registre.' })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  // Mutation de traitement des retours colis
  const returnMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/retours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commande_id: commandeId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Échec de l\'enregistrement de votre demande de retour.')
      return data
    },
    onSuccess: () => {
      toast.addToast({ type: 'success', message: 'Votre demande de retour est en cours d\'examen par un conseiller Gercie.' })
      queryClient.invalidateQueries({ queryKey: ['commande', commandeId] })
      refetch()
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  // Mutation de dépôt d'avis qualitatif
  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commande_id: commandeId, rating: reviewRating, comment: reviewComment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Une erreur s\'est produite lors de l\'envoi de votre note.')
      return data
    },
    onSuccess: () => {
      toast.addToast({ type: 'success', message: 'Merci ! Votre précieux avis a été publié sur la vitrine de l\'article.' })
      setShowReviewModal(false)
      setReviewComment('')
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  // Déclenchement contrôlé des confettis en évitant les surcharges mémoires
  useEffect(() => {
    if (order?.statut === 'livree') {
      try {
        confettiCelebration()
      } catch (e) {
        console.error('Confetti error', e)
      }
    }
  }, [order])

  // Routage automatique des utilisateurs déconnectés
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=/commande/confirmation?id=${commandeId}`)
    }
  }, [authLoading, user, router, commandeId])

  // Copie dans le presse-papier unifié
  const handleCopy = useCallback((code: string, id: string) => {
    if (!navigator.clipboard) return
    navigator.clipboard.writeText(code)
    setCopied(id)
    toast.addToast({ type: 'success', message: 'Code copié avec succès.' })
    setTimeout(() => setCopied(null), 2000)
  }, [toast])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="xl" variant="premium" label="Sécurisation et synchronisation du reçu fiscal..." />
      </div>
    )
  }

  if (error instanceof Error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md text-center p-8 border-gold-400/20 bg-card/70 backdrop-blur-xl">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Fiche de commande inaccessible</h2>
          <p className="text-muted-foreground mb-6">{error?.message || 'La commande demandée est introuvable ou a été archivée.'}</p>
          <div className="flex gap-3 justify-center">
            <Button variant="luxe" onClick={() => refetch()}>Actualiser</Button>
            <Link href="/profile/commandes">
              <Button variant="outline-gold">Mes commandes</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // Utiliser le statut configuré (gère à la fois 'collecte' et 'conditionnement_premium')
  const statutKey = order.statut === 'conditionnement_premium' ? 'conditionnement_premium' : order.statut
  const statut = statutConfig[statutKey] || statutConfig.en_attente
  const isCancellable = ['en_attente', 'payee'].includes(order.statut)
  const isReturnable = order.statut === 'livree'

  // Le code client est visible dès que la commande est payée ou en préparation, jusqu'à livraison
  const showClientCode = order.code_client && ['payee', 'conditionnement_premium', 'collecte', 'en_livraison'].includes(order.statut)

  const etapesLogistiques = [
    { titre: 'Validation transactionnelle', desc: 'Règlement validé et inscrit dans le grand livre comptable.', actif: ['payee', 'conditionnement_premium', 'collecte', 'en_livraison', 'livree'].includes(order.statut) },
    { titre: 'Conditionnement Premium', desc: 'Préparation méticuleuse de vos boîtes à notre centre de dispatch.', actif: ['conditionnement_premium', 'collecte', 'en_livraison', 'livree'].includes(order.statut) },
    { titre: 'Transit Logistique', desc: 'Prise en charge directe par notre flotte de livreurs partenaires.', actif: ['en_livraison', 'livree'].includes(order.statut) },
    { titre: 'Livraison finale', desc: 'Colis remis en main propre contre validation de votre code d\'authentification unique.', actif: order.statut === 'livree' }
  ]

  return (
    <div className="min-h-screen bg-background pb-16">
      <Container className="py-8 md:py-12 max-w-5xl">
        
        {/* Fil d'Ariane épuré */}
        <div className="flex items-center gap-2 text-sm mb-6 text-muted-foreground">
          <Link href="/" className="hover:text-gold-500 transition-colors">Boutique</Link>
          <ChevronRight size={14} />
          <Link href="/profile/commandes" className="hover:text-gold-500 transition-colors">Espace Client</Link>
          <ChevronRight size={14} />
          <span className="font-medium text-foreground">Commande #{order.numero}</span>
        </div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          
          {/* En-tête Premium Omnicanal */}
          <Card className="bg-gradient-to-br from-gold-600 via-gold-500 to-burgundy-700 text-white border-0 shadow-strong overflow-hidden relative mb-8">
            <CardContent className="p-6 md:p-8">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-3xl md:text-4xl font-bold font-serif">#{order.numero}</span>
                    <Badge variant={statut.variant} size="md" className="bg-white/20 border border-white/30 text-white ml-2 px-3 py-1">
                      {statut.icon}
                      <span className="ml-1.5">{statut.label}</span>
                    </Badge>
                  </div>
                  <p className="text-gold-100 text-sm mt-2">
                    Inscrit le {new Date(order.date).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Truck size={16} className="text-gold-200" />
                    <span className="text-sm text-gold-100 font-medium">
                      {order.type_livraison === 'domicile' ? 'Livraison Directe Domicile' : 'Retrait Sécurisé Point Relais'}
                    </span>
                  </div>
                </div>
                
                {/* Partage Social Post-Achat */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Commande #${order.numero} validée sur Gercie pour un montant de : ${order.total.toLocaleString()} FC`)}`, '_blank')}
                    className="bg-white/10 border-white/20 text-white hover:bg-white/30"
                  >
                    <MessageCircle size={16} className="mr-1.5" /> WhatsApp
                  </Button>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank')}
                    className="bg-white/10 border-white/20 text-white hover:bg-white/30"
                  >
                    <Facebook size={16} className="mr-1.5" /> Facebook
                  </Button>
                  <Tooltip content="Partager par e-mail">
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => window.open(`mailto:?subject=Achat Gercie #${order.numero}&body=${encodeURIComponent(`Suivi de ma commande Gercie : ${order.total.toLocaleString()} FC`)}`, '_blank')}
                      className="bg-white/10 border-white/20 text-white hover:bg-white/30"
                    >
                      <Mail size={16} />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* Panneau Principal Logistique */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Code Client – Carte de validation */}
              <AnimatePresence mode="popLayout">
                {showClientCode && (
                  <motion.div key="client-code-card" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                    <Card className="border-l-4 border-l-gold-400 bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="p-2.5 rounded-xl bg-gold-500/10 text-gold-500 flex-shrink-0">
                            <Key size={20} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                              Code Secret de Validation (à communiquer au livreur)
                            </p>
                            <p className="text-2xl font-mono font-bold tracking-widest text-gold-600 dark:text-gold-400 mt-0.5 truncate">
                              {order.code_client}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Tooltip content={copied === 'client' ? "Code copié !" : "Copier le code"}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopy(order.code_client!, 'client')}
                              className="text-gold-500 flex-shrink-0 h-9 w-9 p-0 rounded-lg hover:bg-gold-500/5"
                            >
                              {copied === 'client' ? <CheckCircle size={18} className="text-green-500" /> : <Copy size={18} />}
                            </Button>
                          </Tooltip>
                          <Tooltip content="Afficher le QR code">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gold-500 flex-shrink-0 h-9 w-9 p-0 rounded-lg hover:bg-gold-500/5"
                              onClick={() => alert(`QR code pour ${order.code_client} – module à implémenter`)}
                            >
                              <QrCode size={18} />
                            </Button>
                          </Tooltip>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Console de Contrôle de la Commande */}
              <div className="flex flex-wrap items-center gap-3 bg-card/40 p-3 rounded-xl border border-border/60 backdrop-blur-sm">
                {isCancellable && (
                  <Button variant="danger" size="sm" onClick={() => { if (confirm('Confirmez-vous l\'annulation intégrale de cette commande et le recrédit de vos fonds ?')) cancelMutation.mutate() }} loading={cancelMutation.isPending} leftIcon={<XCircle size={14} />}>
                    Annuler la commande
                  </Button>
                )}
                {isReturnable && (
                  <Button variant="outline-gold" size="sm" onClick={() => { if (confirm('Engager une procédure de retour pour inspection d\'articles ?')) returnMutation.mutate() }} loading={returnMutation.isPending} leftIcon={<RefreshCw size={14} />}>
                    Demander un retour
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-muted-foreground hover:text-foreground">
                  <RefreshCw size={14} className="mr-1.5" /> Synchroniser l'état
                </Button>
                {order.statut === 'livree' && (
                  <Button variant="accent" size="sm" onClick={() => setShowReviewModal(true)} leftIcon={<Star size={14} />}>
                    Évaluer l'expérience
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => window.open(`/api/commandes/${order.id}/facture`, '_blank')} leftIcon={<Download size={14} />} className="ml-auto text-gold-500 hover:text-gold-600">
                  Éditer la facture PDF
                </Button>
              </div>

              {/* Module d'adresse Géolocalisé */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin size={18} className="text-gold-500" /> Coordonnées de destination
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {order.type_livraison === 'domicile' ? (
                    <div className="p-4 bg-background/50 rounded-xl border border-border/40">
                      <p className="text-sm font-semibold text-foreground">{order.adresse_livraison || 'Aucune adresse physique transmise.'}</p>
                      <p className="text-xs text-muted-foreground mt-1">Notre équipe se déplace directement à cette destination pour la remise.</p>
                    </div>
                  ) : (
                    <div className="p-4 bg-background/50 rounded-xl border border-border/40">
                      <p className="font-bold text-sm text-foreground">{order.point_retrait?.nom}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{order.point_retrait?.adresse}</p>
                      {order.point_retrait?.latitude && (
                        <a href={`https://www.google.com/maps/search/?api=1&query=${order.point_retrait.latitude},${order.point_retrait.longitude}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gold-500 hover:text-gold-600 font-semibold inline-flex items-center gap-1 mt-3 transition-colors">
                          <ExternalLink size={12} /> Tracer l'itinéraire sur Google Maps
                        </a>
                      )}
                    </div>
                  )}
                  {order.suivi_url && (
                    <a href={order.suivi_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-gold-500 hover:underline bg-gold-500/5 px-3 py-2 rounded-lg border border-gold-500/10 w-full justify-center">
                      <Truck size={16} /> Suivre l'approche de notre livreur en temps réel
                    </a>
                  )}
                </CardContent>
              </Card>

              {/* Module Message Cadeau Optionnel */}
              {order.message_cadeau && (
                <Card variant="glass" className="border-gold-400/20 bg-gold-50/30 dark:bg-gold-900/5">
                  <CardContent className="p-4 flex items-start gap-3">
                    <Gift size={20} className="text-gold-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-foreground">Dédicace d'accompagnement jointe</p>
                      <p className="text-sm italic text-muted-foreground mt-1 bg-background/40 p-3 rounded-lg border border-border/40">"{order.message_cadeau}"</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Inventaire Détaillé des Articles commandés */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package size={18} className="text-gold-500" /> Colisage des marchandises ({order.articles.length} lignes d'articles)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {order.articles.map((article, idx) => {
                    const badge = getCollecteBadge(article.statut_collecte)
                    const itemCompositeKey = `art-${order.id}-${article.id || idx}-${article.nom.substring(0,3)}`;
                    
                    return (
                      <div key={itemCompositeKey} className="bg-background/60 rounded-xl p-4 border border-gold-400/10 hover:border-gold-400/30 transition-all">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex gap-3">
                            {article.image ? (
                              <div className="w-14 h-14 rounded-lg overflow-hidden bg-card border border-border relative flex-shrink-0">
                                <Image src={article.image} alt={article.nom} fill className="object-cover" sizes="56px" />
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground flex-shrink-0">
                                <Package size={24} />
                              </div>
                            )}
                            <div>
                              <h4 className="font-bold text-sm text-foreground line-clamp-1">{article.nom}</h4>
                              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                                Quantité : {article.quantite} × {article.prix_unitaire.toLocaleString()} FC
                              </p>
                              {article.specifications && (
                                <p className="text-xs text-muted-foreground mt-1.5 bg-card/80 px-2 py-1 rounded border border-border/40 inline-block">
                                  Spécification : {article.specifications}
                                </p>
                              )}
                            </div>
                          </div>
                          <Badge variant={badge.variant} size="sm" className="whitespace-nowrap">
                            {badge.icon && <span className="mr-1">{badge.icon}</span>}
                            {badge.label}
                          </Badge>
                        </div>
                        {article.motif_refus && (
                          <div className="text-xs text-red-500 mt-3 bg-red-500/5 dark:bg-red-900/10 p-2.5 rounded-lg border border-red-500/20 font-medium">
                            Motif d'indisponibilité en rayon : {article.motif_refus}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  <div className="flex justify-between pt-4 border-t border-gold-400/20 font-bold text-lg text-foreground">
                    <span>Total Facturé</span>
                    <span className="text-gold-500 font-serif">{order.total.toLocaleString()} FC</span>
                  </div>
                </CardContent>
              </Card>

              {/* Ligne Logistique Interactive (Timeline) */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock size={18} className="text-gold-500" /> Progression de la commande
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 relative pl-6 before:absolute before:left-8 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                  {etapesLogistiques.map((etape, index) => {
                    const stepCompositeKey = `timeline-${order.id}-${index}`;
                    return (
                      <div key={stepCompositeKey} className="relative flex gap-4 items-start">
                        <div className={cn(
                          "absolute -left-[23px] mt-0.5 h-4 w-4 rounded-full border-2 bg-background flex items-center justify-center transition-all",
                          etape.actif ? 'border-gold-500 scale-110 shadow-md' : 'border-border'
                        )}>
                          {etape.actif && <div className="h-1.5 w-1.5 rounded-full bg-gold-500" />}
                        </div>
                        <div className="space-y-0.5">
                          <h4 className={cn("text-sm font-bold", etape.actif ? 'text-foreground' : 'text-muted-foreground')}>{etape.titre}</h4>
                          <p className="text-xs text-muted-foreground max-w-xl">{etape.desc}</p>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              {/* Centre d'Assistance Client */}
              <Card variant="glass" className="border-gold-400/20">
                <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-gold-500/10 text-gold-500">
                      <HelpCircle size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">Besoin d'assistance sur cette commande ?</p>
                      <p className="text-xs text-muted-foreground">Notre cellule d'accompagnement répond de manière prioritaire en RDC.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline-gold" size="sm" className="w-full sm:w-auto" onClick={() => window.open('https://wa.me/243973868195', '_blank')}>
                      <MessageCircle size={14} className="mr-1.5" /> Support WhatsApp
                    </Button>
                    <Link href="/support" className="w-full sm:w-auto">
                      <Button variant="luxe" size="sm" fullWidth>Ouvrir un ticket</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Panneau Latéral : Synthèse Comptable et Devises */}
            <div className="lg:col-span-1 space-y-6">
              <div className="sticky top-24 space-y-6">
                <Card className="border-gold-400/20 bg-card/70 backdrop-blur-xl shadow-gold overflow-hidden">
                  <CardContent className="p-5 space-y-4">
                    <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                      <Sparkles size={18} className="text-gold-500" /> Ventilation Financière
                    </h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Montant net en CDF</span>
                      <span className="font-bold text-foreground">{order.total.toLocaleString()} FC</span>
                    </div>
                    {order.type_livraison === 'domicile' && (
                      <div className="flex justify-between text-sm gap-4">
                        <span className="text-muted-foreground flex-shrink-0">Lieu de livraison</span>
                        <span className="text-xs text-foreground text-right truncate max-w-[140px]" title={order.adresse_livraison}>{order.adresse_livraison}</span>
                      </div>
                    )}
                    {rate && (
                      <div className="flex justify-between text-sm bg-gold-500/5 p-2 rounded-lg border border-gold-500/10">
                        <span className="text-muted-foreground font-medium">Contrevaleur indicative</span>
                        <span className="font-bold text-gold-600 font-mono">≈ {(order.total / rate).toFixed(2)} USD</span>
                      </div>
                    )}

                    <hr className="border-gold-400/10" />

                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <BadgeCheck size={14} className="text-gold-500" /> Certificat d'authenticité Gercie
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Truck size={14} className="text-gold-500" /> Traçabilité de flotte intégrée
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldCheck size={14} className="text-gold-500" /> Garantie protection acheteur RDC
                      </div>
                    </div>

                    <div className="pt-2 space-y-2">
                      <Button variant="outline-gold" fullWidth size="sm" onClick={() => router.push('/profile/commandes')} leftIcon={<ChevronLeft size={14} />}>
                        Retourner à mes commandes
                      </Button>
                      <Button variant="ghost" fullWidth size="sm" onClick={() => router.push('/')} leftIcon={<ShoppingBag size={14} />} className="text-muted-foreground hover:text-foreground">
                        Retourner à la boutique
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Bloc d'incitation d'avis post-achat */}
                {order.statut === 'livree' && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                    <Card className="border-gold-400/20 bg-gradient-to-br from-gold-50 to-white dark:from-gold-900/10 dark:to-midnight-800/40 text-center p-5">
                      <Star size={32} className="mx-auto text-gold-500 mb-2 fill-gold-500/10" />
                      <h4 className="font-bold text-sm text-foreground">Votre avis compte pour Gercie</h4>
                      <p className="text-xs text-muted-foreground mt-1">Aidez notre communauté en évaluant la qualité de vos articles reçus.</p>
                      <Button variant="luxe" size="sm" className="mt-4" fullWidth onClick={() => setShowReviewModal(true)}>
                        Rédiger mon avis
                      </Button>
                    </Card>
                  </motion.div>
                )}
              </div>
            </div>
            
          </div>
        </motion.div>
      </Container>

      {/* Boîte de Dialogue Modale Premium pour les Avis */}
      <Modal isOpen={showReviewModal} onClose={() => setShowReviewModal(false)} title="Évaluer votre expérience d'achat" accent="gold" size="md">
        <div className="space-y-5 p-1">
          <p className="text-xs text-muted-foreground">Sélectionnez une note par attribution d'étoiles et laissez vos impressions détaillées.</p>
          <div className="flex items-center gap-1.5 justify-center py-2">
            {[1, 2, 3, 4, 5].map((star) => {
              const starKey = `star-rating-${star}`;
              return (
                <button key={starKey} type="button" onClick={() => setReviewRating(star)} className="focus:outline-none transition-transform active:scale-95 hover:scale-105">
                  <Star size={32} className={cn('transition-colors duration-150', star <= reviewRating ? 'text-gold-500 fill-gold-500' : 'text-neutral-300 dark:text-neutral-700')} />
                </button>
              )
            })}
          </div>
          <textarea
            className="w-full p-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent resize-none min-h-[100px]"
            rows={4}
            placeholder="Décrivez la qualité de la livraison, du packaging ou du produit..."
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowReviewModal(false)}>
              Abandonner
            </Button>
            <Button variant="luxe" size="sm" onClick={() => reviewMutation.mutate()} loading={reviewMutation.isPending}>
              Déposer mon avis officiel
            </Button>
          </div>
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}