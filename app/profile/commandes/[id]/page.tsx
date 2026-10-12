// app/profile/commandes/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Package, Truck, MapPin, CheckCircle, XCircle,
  RefreshCw, CreditCard, Copy, AlertCircle,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types & configuration                                              */
/* ------------------------------------------------------------------ */

interface Article {
  id: string
  nom: string
  quantite: number
  prix_unitaire: number
  specifications?: string
  variante?: { attributes: Record<string, string> }
  code_acheteur?: string
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
  point_retrait?: { nom: string; adresse: string }
  articles: Article[]
  code_livraison?: string
}

const statusConfig: Record<string, { variant: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral'; label: string }> = {
  en_attente: { variant: 'warm', label: 'En attente' },
  payee: { variant: 'gold', label: 'Payée' },
  collecte: { variant: 'neutral', label: 'Collecte' },
  en_livraison: { variant: 'warm', label: 'En livraison' },
  livree: { variant: 'accent', label: 'Livrée' },
  annulee: { variant: 'danger', label: 'Annulée' },
}

const collecteBadge = (statut?: string) => {
  if (statut === 'accepte') return { variant: 'accent' as const, icon: <CheckCircle size={14} />, label: 'Validé' }
  if (statut === 'refuse') return { variant: 'danger' as const, icon: <XCircle size={14} />, label: 'Refusé' }
  return { variant: 'neutral' as const, icon: null as any, label: 'En attente' }
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [copiedGlobal, setCopiedGlobal] = useState(false)
  const [copiedArticleId, setCopiedArticleId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push(`/login?redirect=/profile/commandes/${id}`); return }
      if (id) {
        fetch(`/api/commandes/${id}`)
          .then(r => r.json())
          .then(data => { if (data.error) throw new Error(data.error); setOrder(data); setLoading(false) })
          .catch(err => { setError(err.message); setLoading(false) })
      }
    }
  }, [id, user, authLoading, router])

  const handleCancel = async () => {
    if (!order) return
    if (!confirm(`Annuler la commande #${order.numero} ?`)) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/commandes/${order.id}/cancel`, { method: 'PUT' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`Commande #${order.numero} annulée`)
      setOrder({ ...order, statut: 'annulee' })
    } catch (err: any) { toast.error(err.message) } finally { setActionLoading(false) }
  }

  const handleReturn = async () => {
    if (!order) return
    if (!confirm(`Demander un retour pour #${order.numero} ?`)) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/retours', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commande_id: order.id }) })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`Demande de retour envoyée pour #${order.numero}`)
    } catch (err: any) { toast.error(err.message) } finally { setActionLoading(false) }
  }

  const copyCode = (code: string, context: 'global' | string) => {
    navigator.clipboard.writeText(code)
    if (context === 'global') {
      setCopiedGlobal(true)
      setTimeout(() => setCopiedGlobal(false), 2000)
    } else {
      setCopiedArticleId(context)
      setTimeout(() => setCopiedArticleId(null), 2000)
    }
    toast.success('Code copié !')
  }

  if (authLoading || loading) return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
      <Spinner size="xl" variant="premium" label="Chargement..." />
    </div>
  )
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-midnight-950 px-4">
      <Card variant="glass" className="max-w-md text-center border-gold-400/20">
        <CardContent className="py-8">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2 text-neutral-900 dark:text-neutral-100">Erreur</h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">{error}</p>
          <Link href="/profile/commandes"><Button variant="luxe">Voir mes commandes</Button></Link>
        </CardContent>
      </Card>
    </div>
  )
  if (!order) return null

  const statut = statusConfig[order.statut] || statusConfig.en_attente
  const isCancellable = ['en_attente', 'payee'].includes(order.statut)
  const isReturnable = order.statut === 'livree'
  const showGlobalCode = order.code_livraison && ['payee', 'collecte', 'en_livraison'].includes(order.statut)

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 py-8">
      <Container className="max-w-3xl">
        <Link href="/profile/commandes" className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 mb-6 transition-colors">
          <ArrowLeft size={18} /> Retour à mes commandes
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En-tête premium */}
          <Card className="bg-gradient-to-r from-gold-600 to-burgundy-700 text-white border-0 shadow-strong mb-6">
            <CardContent className="p-6">
              <h1 className="text-2xl font-bold font-serif">Commande #{order.numero}</h1>
              <p className="text-gold-100 text-sm mt-1">
                {new Date(order.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              <Badge variant={statut.variant} size="md" className="mt-2 bg-white/20 border-white/20 backdrop-blur-sm">{statut.label}</Badge>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {/* Code global */}
            {showGlobalCode && (
              <Card variant="glass" className="border-l-4 border-l-gold-400">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-gold-100 dark:bg-gold-900/30">
                      <CreditCard size={20} className="text-gold-600 dark:text-gold-400" />
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500">Code de livraison</p>
                      <p className="text-xl font-mono font-bold tracking-widest text-gold-700 dark:text-gold-300">{order.code_livraison}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyCode(order.code_livraison!, 'global')} className="text-gold-500">
                    {copiedGlobal ? <CheckCircle size={16} className="text-accent-500" /> : <Copy size={16} />}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Statut & actions */}
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={statut.variant}>{statut.label}</Badge>
              {isCancellable && (
                <Button variant="danger" size="sm" onClick={handleCancel} loading={actionLoading} leftIcon={<XCircle size={14} />}>
                  Annuler
                </Button>
              )}
              {isReturnable && (
                <Button variant="outline-gold" size="sm" onClick={handleReturn} loading={actionLoading} leftIcon={<RefreshCw size={14} />}>
                  Retour
                </Button>
              )}
            </div>

            {/* Livraison */}
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-neutral-800 dark:text-neutral-200"><Truck size={18} className="text-gold-500" /> Livraison</CardTitle>
              </CardHeader>
              <CardContent>
                {order.type_livraison === 'domicile' ? (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin size={16} className="mt-0.5 text-gold-500" />
                    <span className="text-neutral-700 dark:text-neutral-300">{order.adresse_livraison || 'Non renseignée'}</span>
                  </div>
                ) : (
                  <div className="text-sm">
                    <p className="font-medium text-neutral-800 dark:text-neutral-200">{order.point_retrait?.nom}</p>
                    <p className="text-neutral-500">{order.point_retrait?.adresse}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Articles */}
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-neutral-800 dark:text-neutral-200"><Package size={18} className="text-gold-500" /> Articles ({order.articles.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order.articles.map(article => {
                  const badge = collecteBadge(article.statut_collecte)
                  const variantDisplay = article.variante?.attributes
                    ? Object.entries(article.variante.attributes).map(([k, v]) => `${k}: ${v}`).join(' · ')
                    : null
                  return (
                    <div key={article.id} className="bg-white/50 dark:bg-midnight-800/40 backdrop-blur-sm rounded-xl p-4 border border-gold-400/20">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-sm text-neutral-800 dark:text-neutral-200">{article.nom}</h4>
                          {variantDisplay && <p className="text-xs text-gold-600 dark:text-gold-400 mt-0.5">{variantDisplay}</p>}
                          <p className="text-sm text-neutral-500 mt-1">Quantité : {article.quantite}</p>
                          <p className="text-sm font-semibold text-gold-600 dark:text-gold-400">{(article.prix_unitaire * article.quantite).toLocaleString()} FC</p>
                          {article.specifications && <p className="text-xs text-neutral-400 mt-1">Note : {article.specifications}</p>}
                        </div>
                        <Badge variant={badge.variant} size="sm">
                          {badge.icon && <span className="mr-1">{badge.icon}</span>}
                          {badge.label}
                        </Badge>
                      </div>
                      {article.motif_refus && (
                        <div className="mt-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs p-2 rounded-lg">
                          Motif : {article.motif_refus}
                        </div>
                      )}
                      {article.code_acheteur && (
                        <div className="mt-3 pt-3 border-t border-gold-400/20 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs text-neutral-500">Code produit</p>
                            <code className="text-lg font-mono font-bold text-gold-600 dark:text-gold-400">{article.code_acheteur}</code>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => copyCode(article.code_acheteur!, article.id)} className="text-gold-500">
                            {copiedArticleId === article.id ? <CheckCircle size={16} className="text-accent-500" /> : <Copy size={16} />}
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="flex justify-between pt-2 border-t border-gold-400/20 font-bold text-lg">
                  <span>Total</span>
                  <span className="text-gold-600">{order.total.toLocaleString()} FC</span>
                </div>
              </CardContent>
            </Card>

            {/* Paiement rapide */}
            {order.statut === 'en_attente' && (
              <Link href={`/commande/paiement?id=${order.id}`} className="block">
                <Button variant="luxe" fullWidth size="lg" className="shadow-gold hover:shadow-glow-gold">Payer cette commande</Button>
              </Link>
            )}
          </div>
        </motion.div>
      </Container>
    </div>
  )
}