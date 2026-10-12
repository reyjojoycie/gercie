// app/profile/commandes/page.tsx
'use client'

import { useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, ChevronRight, Truck, MapPin, XCircle, RefreshCw, CreditCard,
  Loader2, AlertTriangle, Search, Filter, ChevronDown, ChevronUp,
  Download, Eye, Clock, Calendar, Wallet, ShoppingBag, ArrowUpDown,
  FileText, ExternalLink, HelpCircle, Star, ChevronLeft, Key, ShieldCheck
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useOrders } from '@/hooks/useOrders'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

// ─── Helpers (étendus avec conditionnement_premium) ─────────
const getStatutVariant = (statut: string): 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' => {
  const map: Record<string, any> = {
    en_attente: 'warm',
    payee: 'gold',
    conditionnement_premium: 'neutral',  // nouveau statut (style neutre comme collecte)
    collecte: 'neutral',
    en_livraison: 'warm',
    livree: 'accent',
    annulee: 'danger',
  }
  return map[statut] || 'neutral'
}

const getStatutLabel = (statut: string) => {
  const labels: Record<string, string> = {
    en_attente: 'En attente',
    payee: 'Payée',
    conditionnement_premium: 'Conditionnement Premium',
    collecte: 'Collecte',
    en_livraison: 'En livraison',
    livree: 'Livrée',
    annulee: 'Annulée',
  }
  return labels[statut] || statut
}

const statusFilters = [
  { value: 'all', label: 'Toutes' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'payee', label: 'Payées' },
  { value: 'conditionnement_premium', label: 'Conditionnement Premium' },
  { value: 'collecte', label: 'Collecte' },
  { value: 'en_livraison', label: 'En livraison' },
  { value: 'livree', label: 'Livrées' },
  { value: 'annulee', label: 'Annulées' },
]

const sortOptions = [
  { value: 'created_at-desc', label: 'Plus récentes' },
  { value: 'created_at-asc', label: 'Plus anciennes' },
  { value: 'total_global-desc', label: 'Montant ↓' },
  { value: 'total_global-asc', label: 'Montant ↑' },
]

// ─── Composant principal ─────────────────────────────────────
export default function MesCommandes() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const toast = useToast()

  // États
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState('created_at-desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set()) // pour affichage temporaire du code client
  const pageSize = 10

  // Paramètres pour le hook useOrders
  const filters = useMemo(() => ({
    statut: activeFilter === 'all' ? undefined : activeFilter,
    search: searchQuery || undefined,
    sort_by: sortKey.split('-')[0],
    sort_order: (sortKey.split('-')[1] as 'asc' | 'desc') || 'desc',
    page: currentPage,
    pageSize,
  }), [activeFilter, searchQuery, sortKey, currentPage])

  const {
    data: orders = [],
    isLoading: loadingOrders,
    error: ordersError,
    refetch,
    isFetching,
  } = useOrders(filters)

  // Calcul pagination
  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize))

  const toggleExpand = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  // Révélation temporaire du code client (10 secondes)
  const handleRevealCode = (orderId: string) => {
    setRevealedCodes(prev => new Set(prev).add(orderId))
    setTimeout(() => {
      setRevealedCodes(prev => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }, 10000)
  }

  // Actions
  const handleCancel = useCallback(async (orderId: string, orderNumero: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir annuler la commande #${orderNumero} ?`)) return
    setActionLoading(orderId)
    try {
      const res = await fetch(`/api/commandes/${orderId}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.addToast({ type: 'success', message: `Commande #${orderNumero} annulée` })
      refetch()
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setActionLoading(null)
    }
  }, [refetch, toast])

  const handleReturn = useCallback(async (orderId: string, orderNumero: string) => {
    if (!confirm(`Voulez-vous demander un retour pour la commande #${orderNumero} ?`)) return
    setActionLoading(orderId)
    try {
      const res = await fetch('/api/retours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commande_id: orderId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.addToast({ type: 'success', message: `Demande de retour envoyée pour #${orderNumero}.` })
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setActionLoading(null)
    }
  }, [toast])

  const handleDownloadInvoice = (orderId: string) => {
    toast.addToast({ type: 'info', message: 'Téléchargement de la facture (bientôt disponible)' })
  }

  const handleTrackOrder = (orderId: string) => {
    router.push(`/commande/confirmation?id=${orderId}`)
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 size={48} className="animate-spin text-gold-500" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <EmptyState
          icon={<Package size={48} className="text-muted-foreground" />}
          title="Connexion requise"
          description="Veuillez vous connecter pour voir vos commandes."
          actionLabel="Se connecter"
          onAction={() => window.location.href = '/login?redirect=/profile/commandes'}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <Container className="max-w-6xl py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* En‑tête */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link href="/profile" className="text-muted-foreground hover:text-gold-500">
                  <ChevronLeft size={20} />
                </Link>
                <h1 className="text-3xl font-bold text-foreground font-serif">Mes commandes</h1>
              </div>
              <p className="text-muted-foreground">Suivez l'état de vos achats</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => refetch()}
                loading={loadingOrders || isFetching}
              >
                <RefreshCw size={14} className="mr-1" /> Actualiser
              </Button>
              <Link href="/" className="text-sm text-gold-600 hover:underline flex items-center gap-1">
                <span>Continuer mes achats</span> <ChevronRight size={14} />
              </Link>
            </div>
          </div>

          {/* Rappel discret sur le nouveau système de validation */}
          {orders.some(o => o.code_client && ['payee','conditionnement_premium','collecte','en_livraison'].includes(o.statut)) && (
            <div className="mb-6 p-3 bg-gold-500/5 border border-gold-400/20 rounded-xl flex items-center gap-2 text-xs text-gold-700 dark:text-gold-300">
              <ShieldCheck size={16} className="shrink-0" />
              <span>Vos commandes comportent un <strong>code secret de validation</strong> à communiquer au livreur lors de la remise.</span>
            </div>
          )}

          {/* Barre de recherche et tri */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                leftIcon={<Search size={18} className="text-muted-foreground" />}
                placeholder="Rechercher par numéro de commande..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                allowClear
                onClear={() => { setSearchQuery(''); setCurrentPage(1) }}
                variant="glass"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sortKey}
                onChange={e => { setSortKey(e.target.value); setCurrentPage(1) }}
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground"
              >
                {sortOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Filtres rapides par statut */}
          <div className="flex flex-wrap gap-2 mb-8 overflow-x-auto scrollbar-hide">
            {statusFilters.map(filter => (
              <button
                key={filter.value}
                onClick={() => { setActiveFilter(filter.value); setCurrentPage(1) }}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap',
                  activeFilter === filter.value
                    ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                    : 'bg-card text-foreground border border-border hover:border-gold-400'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Erreur */}
          {ordersError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm flex items-center gap-2"
            >
              <AlertTriangle size={18} />
              {ordersError instanceof Error ? ordersError.message : 'Erreur inconnue'}
              <button onClick={() => refetch()} className="ml-auto underline">Réessayer</button>
            </motion.div>
          )}

          {/* Chargement */}
          {loadingOrders ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-card rounded-2xl p-5 shadow-card border border-border">
                  <div className="flex justify-between mb-4">
                    <Skeleton variant="text" className="w-48 h-6" shimmer shimmerVariant="gold" />
                    <Skeleton variant="rounded" className="w-24 h-6 rounded-full" shimmer shimmerVariant="gold" />
                  </div>
                  <Skeleton variant="text" className="w-2/3 h-4 mb-2" shimmer shimmerVariant="gold" />
                  <div className="flex justify-between pt-4 border-t border-border">
                    <Skeleton variant="text" className="w-32 h-6" shimmer shimmerVariant="gold" />
                    <Skeleton variant="rounded" className="w-24 h-8 rounded-xl" shimmer shimmerVariant="gold" />
                  </div>
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <EmptyState
                icon={<Package size={64} className="text-gold-400" />}
                title={activeFilter === 'all' ? 'Aucune commande' : `Aucune commande ${getStatutLabel(activeFilter).toLowerCase()}`}
                description={
                  activeFilter === 'all'
                    ? 'Vous n’avez pas encore passé de commande.'
                    : `Vous n’avez aucune commande avec ce statut.`
                }
                actionLabel="Découvrir nos produits"
                onAction={() => router.push('/')}
              />
            </motion.div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {orders.map((order, idx) => {
                  const statutVariant = getStatutVariant(order.statut)
                  const statutLabel = getStatutLabel(order.statut)
                  const isCancellable = ['en_attente', 'payee'].includes(order.statut)
                  const isReturnable = order.statut === 'livree'
                  const isExpanded = expandedOrders.has(order.id)
                  const isActionLoading = actionLoading === order.id

                  // Conditions d'affichage du code client
                  const canShowCode = order.code_client && ['payee','conditionnement_premium','collecte','en_livraison'].includes(order.statut)
                  const isCodeRevealed = revealedCodes.has(order.id)

                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <Card className="overflow-hidden border-border hover:shadow-card-hover backdrop-blur-sm bg-card/70">
                        <CardContent className="p-5 sm:p-6">
                          <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                            <div>
                              {/* Correction HTML : div au lieu de p pour autoriser l'imbrication de Tooltip */}
                              <div className="font-bold text-foreground text-lg flex items-center gap-2">
                                <span>Commande #{order.numero}</span>
                                <Tooltip content="Détails de la commande">
                                  <button onClick={() => toggleExpand(order.id)} className="text-muted-foreground hover:text-gold-500 flex items-center">
                                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                  </button>
                                </Tooltip>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                                <Calendar size={14} />
                                {new Date(order.date).toLocaleDateString('fr-FR', {
                                  day: 'numeric', month: 'long', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </p>
                            </div>
                            <Badge variant={statutVariant} size="sm" style="solid">
                              {statutLabel}
                            </Badge>
                          </div>

                          {/* Ligne résumé livraison + indicateur code client */}
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                            {order.type_livraison === 'domicile' ? (
                              <>
                                <Truck size={14} className="text-gold-500" />
                                <span>Livraison à domicile</span>
                              </>
                            ) : (
                              <>
                                <MapPin size={14} className="text-gold-500" />
                                <span>Retrait en point relais</span>
                              </>
                            )}
                            {canShowCode && (
                              <span className="ml-auto flex items-center gap-1 text-xs">
                                <Key size={12} className="text-gold-500" />
                                {isCodeRevealed ? (
                                  <span className="font-mono text-gold-600 font-bold">{order.code_client}</span>
                                ) : (
                                  <button
                                    onClick={() => handleRevealCode(order.id)}
                                    className="underline text-gold-500 hover:text-gold-600 font-medium"
                                  >
                                    Voir le code
                                  </button>
                                )}
                              </span>
                            )}
                          </div>

                          {/* Détails expansibles */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-border pt-4 mb-4">
                                  <ul className="space-y-2">
                                    {order.articles.map((article, idx) => (
                                      <li key={idx} className="flex justify-between text-sm">
                                        <span className="text-foreground flex-1">
                                          {article.nom} <span className="text-muted-foreground">x {article.quantite}</span>
                                        </span>
                                        <span className="font-medium text-foreground ml-4">
                                          {(article.prix_unitaire * article.quantite).toLocaleString()} FC
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Actions et total */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xl font-bold text-foreground">{order.total.toLocaleString()}</span>
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900">CDF</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {order.statut === 'en_attente' && (
                                <Link href={`/commande/paiement?id=${order.id}`}>
                                  <Button variant="luxe" size="sm" leftIcon={<CreditCard size={14} />}>
                                    Payer
                                  </Button>
                                </Link>
                              )}
                              {isCancellable && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleCancel(order.id, order.numero)}
                                  loading={isActionLoading}
                                  leftIcon={<XCircle size={14} />}
                                >
                                  Annuler
                                </Button>
                              )}
                              {isReturnable && (
                                <Button
                                  variant="outline-gold"
                                  size="sm"
                                  onClick={() => handleReturn(order.id, order.numero)}
                                  loading={isActionLoading}
                                  leftIcon={<RefreshCw size={14} />}
                                >
                                  Retour
                                </Button>
                              )}
                              <Tooltip content="Suivre la commande">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTrackOrder(order.id)}
                                  leftIcon={<ExternalLink size={14} />}
                                >
                                  Suivi
                                </Button>
                              </Tooltip>
                              <Tooltip content="Télécharger la facture">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownloadInvoice(order.id)}
                                  leftIcon={<FileText size={14} />}
                                >
                                  Facture
                                </Button>
                              </Tooltip>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={16} /> Précédent
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Suivant <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </motion.div>
      </Container>
    </div>
  )
}