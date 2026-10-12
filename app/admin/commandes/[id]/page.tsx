// app/admin/commandes/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import {
  ArrowLeft, Package, Truck, MapPin, User, Phone, Clock, CreditCard, Copy, Key,
  Navigation, XCircle, CheckCircle, ShieldCheck, Sparkles,
  Pencil, Save, RotateCcw, History, FileText, QrCode,
  MessageSquare, Send, PlusCircle, Edit3, Eye, Info, ClipboardCheck,
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { Input } from '@/components/ui/Input'
import { GoldDivider } from '@/components/GoldDivider'
import LivraisonTimeline from '@/components/LivraisonTimeline'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types – enrichis pour la double validation                         */
/* ------------------------------------------------------------------ */
interface Article {
  id: string
  nom: string
  images: string[]
  quantite: number
  prix_unitaire: number
  specifications?: string
  variante?: { attributes: Record<string, string> }
  code_vendeur?: string
  code_acheteur?: string
  statut_collecte?: string
  motif_refus?: string
  photo_preuve?: string
  vendeur_id?: string
}

interface PointRetrait {
  nom: string
  adresse: string
  photo_url: string | null
  telephone: string | null
  horaires: string | null
  points_de_repere: string | null
  ville_nom: string | null
  province_nom: string | null
  latitude: number | null
  longitude: number | null
  instructions_retrait: string | null
}

interface Transaction {
  type: string
  montant: number
  description: string
  date: string
  portefeuille_type: string
  utilisateur: string
}

interface HistoriqueStatut {
  id: string
  ancien_statut: string
  nouveau_statut: string
  commentaire: string | null
  modified_by: string
  created_at: string
}

interface Livreur {
  id: string
  nom: string
  prenom: string
  email: string
}

interface Message {
  id: string
  auteur: { nom: string; prenom: string }
  message: string
  created_at: string
}

interface CommandeDetail {
  id: string
  numero: string
  total: number
  sous_total: number
  frais_livraison: number
  remise: number
  code_promo?: string
  statut: string
  date: string
  type_livraison: string
  adresse_livraison?: string
  code_client?: string          // nouveau (prioritaire)
  code_livraison?: string       // ancien, conservé pour rétrocompatibilité
  code_livreur?: string | null
  code_pin?: string | null
  numero_suivi?: string
  note_interne?: string
  livreur?: Livreur | null
  point_retrait?: PointRetrait | null
  articles: Article[]
  acheteur: {
    id: string
    nom: string
    prenom: string
    email: string
    telephone?: string
  }
  transactions: Transaction[]
  historique_statuts?: HistoriqueStatut[]
  messages?: Message[]
  mode_attribution?: 'LIBRE' | 'ASSIGNE'  // nouveau
}

/* ------------------------------------------------------------------ */
/*  Configuration (statuts étendus)                                    */
/* ------------------------------------------------------------------ */
const statusLabels: Record<string, string> = {
  en_attente: 'En attente',
  payee: 'Payée',
  conditionnement_premium: 'Conditionnement Premium', // nouveau
  collecte: 'Collecte',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
}

const statusVariant: Record<string, 'warm' | 'gold' | 'accent' | 'danger' | 'neutral'> = {
  en_attente: 'warm',
  payee: 'gold',
  conditionnement_premium: 'neutral', // nouveau
  collecte: 'neutral',
  en_livraison: 'warm',
  livree: 'accent',
  annulee: 'danger',
}

const transactionTypeLabels: Record<string, string> = {
  achat: 'Achat', vente: 'Vente', escrow_in: 'Entrée séquestre',
  escrow_out: 'Sortie séquestre', commission: 'Commission',
  remboursement: 'Remboursement', retrait: 'Retrait', recharge: 'Recharge',
}

const collecteBadge = (statut?: string) => {
  if (statut === 'accepte') return { variant: 'accent' as const, label: 'Validé', icon: <CheckCircle size={12} /> }
  if (statut === 'refuse') return { variant: 'danger' as const, label: 'Refusé', icon: <XCircle size={12} /> }
  return { variant: 'neutral' as const, label: 'En attente', icon: null }
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function AdminCommandeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [copied, setCopied] = useState<string | null>(null)

  const [showAssignLivreur, setShowAssignLivreur] = useState(false)
  const [selectedLivreurId, setSelectedLivreurId] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [showSuivi, setShowSuivi] = useState(false)
  const [suiviText, setSuiviText] = useState('')
  const [messageText, setMessageText] = useState('')
  const [showQrCode, setShowQrCode] = useState(false)

  // Nouveaux états pour la validation de collecte (dispatch)
  const [showValidateCollecte, setShowValidateCollecte] = useState(false)
  const [saisiCodeLivreur, setSaisiCodeLivreur] = useState('')

  const { data: livreursData } = useQuery<Livreur[]>({
    queryKey: ['admin-livreurs-list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/livreurs?limit=100')
      if (!res.ok) return []
      const json = await res.json()
      return json.data || []
    },
    staleTime: 60_000,
  })

  const {
    data: commande,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CommandeDetail>({
    queryKey: ['admin-commande', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/commandes/${id}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      return res.json()
    },
    enabled: !!id,
    staleTime: 30_000,
  })

  // Mutations existantes
  const changeStatutMutation = useMutation({
    mutationFn: async (newStatut: string) => {
      const res = await fetch(`/api/admin/commandes/${commande!.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: newStatut }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: (_, newStatut) => {
      queryClient.invalidateQueries({ queryKey: ['admin-commande', id] })
      toast.addToast({ type: 'success', message: `Statut changé en "${statusLabels[newStatut]}"` })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const assignLivreurMutation = useMutation({
    mutationFn: async (livreurId: string) => {
      const res = await fetch(`/api/admin/commandes/${id}/assigner-livreur`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ livreur_id: livreurId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commande', id] })
      toast.addToast({ type: 'success', message: 'Livreur assigné et code livreur généré' })
      setShowAssignLivreur(false)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const saveNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await fetch(`/api/admin/commandes/${id}/notes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_interne: note }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commande', id] })
      toast.addToast({ type: 'success', message: 'Note enregistrée' })
      setShowNotes(false)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const saveSuiviMutation = useMutation({
    mutationFn: async (numero: string) => {
      const res = await fetch(`/api/admin/commandes/${id}/suivi`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_suivi: numero }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commande', id] })
      toast.addToast({ type: 'success', message: 'Numéro de suivi enregistré' })
      setShowSuivi(false)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`/api/admin/commandes/${id}/conversation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commande', id] })
      toast.addToast({ type: 'success', message: 'Message envoyé' })
      setMessageText('')
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  // Nouvelle mutation pour la validation de collecte (dispatch)
  const validateCollecteMutation = useMutation({
    mutationFn: async ({ commandeId, code }: { commandeId: string; code: string }) => {
      const res = await fetch(`/api/commandes/${commandeId}/valider-collecte`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_livreur: code }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-commande', id] })
      toast.addToast({ type: 'success', message: 'Collecte validée – commande en cours de livraison' })
      setShowValidateCollecte(false)
      setSaisiCodeLivreur('')
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const changeStatut = async (newStatut: string) => {
    if (!commande) return
    if (!confirm(`Passer la commande en "${statusLabels[newStatut]}" ?`)) return
    changeStatutMutation.mutate(newStatut)
  }

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    toast.addToast({ type: 'success', message: 'Copié !' })
    setTimeout(() => setCopied(null), 2000)
  }

  const getVariantDisplay = (article: Article) => {
    if (!article.variante?.attributes) return null
    return Object.entries(article.variante.attributes).map(([k, v]) => `${k} : ${v}`).join(' · ')
  }

  const openItineraire = (pt: PointRetrait) => {
    if (pt.latitude && pt.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${pt.latitude},${pt.longitude}`, '_blank')
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pt.adresse)}`, '_blank')
    }
  }

  useEffect(() => {
    if (commande) {
      setSelectedLivreurId(commande.livreur?.id || '')
      setNoteText(commande.note_interne || '')
      setSuiviText(commande.numero_suivi || '')
    }
  }, [commande])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center">
        <Spinner size="xl" variant="premium" label="Chargement de la commande..." />
      </div>
    )
  }

  if (isError || !commande) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center p-6">
        <Card variant="glass" className="text-center max-w-md">
          <CardContent className="py-12">
            <Package size={48} className="mx-auto text-neutral-400 mb-4" />
            <p className="text-neutral-500">Commande introuvable.</p>
            <Link href="/admin/commandes">
              <Button variant="outline-gold" className="mt-4">Retour aux commandes</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Déterminer le code client à afficher (nouveau > ancien)
  const displayCodeClient = commande.code_client || commande.code_livraison
  const statutCfg = { variant: statusVariant[commande.statut] ?? 'neutral', label: statusLabels[commande.statut] ?? commande.statut }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/70 dark:bg-midnight-900/70 border-b border-gold-400/20 shadow-soft">
        <Container className="py-4 flex items-center gap-4">
          <Link href="/admin/commandes" className="p-2 rounded-xl hover:bg-gold-400/10 text-neutral-400 hover:text-gold-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="font-bold text-neutral-900 dark:text-neutral-100 font-serif text-2xl">
                Commande #{commande.numero}
              </div>
              <Badge variant={statutCfg.variant} size="sm" style="solid" className="shadow-soft">
                {statutCfg.label}
              </Badge>
              {commande.code_promo && <Badge variant="gold" size="sm">🎟️ {commande.code_promo}</Badge>}
              {commande.mode_attribution && (
                <Badge variant={commande.mode_attribution === 'ASSIGNE' ? 'gold' : 'neutral'} size="sm">
                  {commande.mode_attribution === 'ASSIGNE' ? 'Assigné' : 'Libre'}
                </Badge>
              )}
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {new Date(commande.date).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Tooltip content="Actualiser"><Button variant="outline-gold" size="sm" onClick={() => refetch()}><RotateCcw size={16} /></Button></Tooltip>
            <Tooltip content="Facture PDF"><Button variant="outline-gold" size="sm" onClick={() => window.open(`/api/admin/commandes/${id}/facture`, '_blank')}><FileText size={16} /></Button></Tooltip>
            <Tooltip content="QR Code"><Button variant="outline-gold" size="sm" onClick={() => setShowQrCode(true)}><QrCode size={16} /></Button></Tooltip>
          </div>
        </Container>
      </div>

      <Container className="py-8 max-w-6xl relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Timeline */}
              <Card variant="glass" className="border-gold-400/20 shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Truck size={18} className="text-gold-500" />Progression</CardTitle>
                </CardHeader>
                <CardContent>
                  <LivraisonTimeline
                    statut={commande.statut ?? 'en_attente'}
                    collecteValidee={commande.articles.every(a => a.statut_collecte === 'accepte')}
                    dateAcceptation={commande.date}
                  />
                </CardContent>
              </Card>

              {/* Articles */}
              <Card variant="glass" className="border-gold-400/20 shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Package size={18} className="text-gold-500" />Articles ({commande.articles.length})</CardTitle>
                  <CardDescription>Détails et codes de sécurité</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {commande.articles.map((article, idx) => {
                    const badge = collecteBadge(article.statut_collecte)
                    return (
                      <motion.div
                        key={`article-${article.id || idx}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-white/50 dark:bg-midnight-800/40 backdrop-blur-sm rounded-xl p-4 border border-gold-400/10 shadow-card"
                      >
                        <div className="flex gap-4">
                          <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border border-gold-400/20 bg-neutral-100 dark:bg-midnight-700/40 relative">
                            <Image src={article.images?.[0] || '/placeholder.jpg'} alt={article.nom} fill className="object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-semibold">{article.nom}</h4>
                                {getVariantDisplay(article) && <p className="text-xs text-gold-600 mt-0.5">{getVariantDisplay(article)}</p>}
                                <p className="text-sm text-neutral-500 mt-1">
                                  Qté : {article.quantite ?? 1} · {((article.prix_unitaire ?? 0) * (article.quantite ?? 1)).toLocaleString()} FC
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant={badge.variant} size="sm">{badge.icon}{badge.label}</Badge>
                                {article.motif_refus && <span className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">{article.motif_refus}</span>}
                              </div>
                            </div>
                            {(article.code_vendeur || article.code_acheteur) && (
                              <div className="mt-3 pt-3 border-t border-gold-400/10 space-y-2">
                                {article.code_vendeur && (
                                  <div className="flex items-center justify-between text-sm">
                                    <span><Key size={14} className="text-gold-500 inline mr-1" />Code vendeur : <code className="font-mono font-semibold text-gold-600">{article.code_vendeur}</code></span>
                                    <Button variant="ghost" size="sm" onClick={() => copyText(article.code_vendeur!, `vendeur-${article.id}`)}>{copied === `vendeur-${article.id}` ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}</Button>
                                  </div>
                                )}
                                {article.code_acheteur && (
                                  <div className="flex items-center justify-between text-sm">
                                    <span><Key size={14} className="text-brand-500 inline mr-1" />Code acheteur : <code className="font-mono font-semibold text-brand-600">{article.code_acheteur}</code></span>
                                    <Button variant="ghost" size="sm" onClick={() => copyText(article.code_acheteur!, `acheteur-${article.id}`)}>{copied === `acheteur-${article.id}` ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}</Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}

                  <GoldDivider />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-gold-600">{(commande.total ?? 0).toLocaleString()} FC</span>
                  </div>
                  {commande.remise > 0 && (
                    <div className="flex justify-between text-sm text-green-600 mt-1">
                      <span>Remise {commande.code_promo && `(${commande.code_promo})`}</span>
                      <span>-{(commande.remise ?? 0).toLocaleString()} FC</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Livraison */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><MapPin size={18} className="text-gold-500" />Livraison</CardTitle>
                  <Button variant="outline-gold" size="sm" onClick={() => setShowSuivi(true)}>Modifier suivi</Button>
                </CardHeader>
                <CardContent>
                  {commande.type_livraison === 'domicile' ? (
                    <div className="bg-white/50 dark:bg-midnight-800/40 rounded-xl p-4 border border-gold-400/10">
                      <p className="text-sm"><span className="font-medium">Adresse :</span> {commande.adresse_livraison || 'Non renseignée'}</p>
                    </div>
                  ) : commande.point_retrait ? (
                    <div className="bg-white/50 dark:bg-midnight-800/40 rounded-xl p-4 border border-gold-400/10 space-y-3">
                      <div className="flex items-start gap-2">
                        <MapPin size={16} className="text-gold-500 mt-1 flex-shrink-0" />
                        <div>
                          <p className="font-medium">{commande.point_retrait.nom}</p>
                          <p className="text-sm text-neutral-500">{commande.point_retrait.adresse}</p>
                          {commande.point_retrait.ville_nom && <p className="text-xs text-neutral-400">{commande.point_retrait.ville_nom}, {commande.point_retrait.province_nom}</p>}
                        </div>
                      </div>
                      {commande.point_retrait.photo_url && <div className="relative w-full h-32 rounded-lg overflow-hidden border border-gold-400/20"><Image src={commande.point_retrait.photo_url} alt="" fill className="object-cover" /></div>}
                      {commande.point_retrait.telephone && <p className="text-sm"><Phone size={14} className="text-gold-500 inline mr-1" />{commande.point_retrait.telephone}</p>}
                      {commande.point_retrait.horaires && <p className="text-sm"><Clock size={14} className="text-gold-500 inline mr-1" />{commande.point_retrait.horaires}</p>}
                      {commande.point_retrait.instructions_retrait && <div className="bg-gold-50 dark:bg-gold-900/20 border border-gold-400/20 rounded-lg p-3 text-xs text-gold-700 dark:text-gold-300">⚠️ {commande.point_retrait.instructions_retrait}</div>}
                      <Button variant="outline-gold" size="sm" onClick={() => openItineraire(commande.point_retrait!)} leftIcon={<Navigation size={14} />}>Voir l'itinéraire</Button>
                    </div>
                  ) : (
                    <p className="text-neutral-500 text-sm">Aucun point de retrait.</p>
                  )}
                  {commande.numero_suivi && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm"><span className="font-medium">N° de suivi :</span> {commande.numero_suivi}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Livreur */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Truck size={18} className="text-gold-500" />Livreur</CardTitle>
                  <Button variant="outline-gold" size="sm" onClick={() => setShowAssignLivreur(true)}>{commande.livreur ? 'Modifier' : 'Assigner'}</Button>
                </CardHeader>
                <CardContent>
                  {commande.livreur ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center text-gold-600 font-bold">{commande.livreur.prenom?.[0]}{commande.livreur.nom?.[0]}</div>
                      <div><p className="font-medium">{commande.livreur.prenom} {commande.livreur.nom}</p><p className="text-xs text-muted-foreground">{commande.livreur.email}</p></div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">Aucun livreur assigné.</p>
                  )}
                </CardContent>
              </Card>

              {/* Validation de collecte (dispatch) */}
              {['conditionnement_premium', 'collecte'].includes(commande.statut) && commande.code_livreur && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck size={20} className="text-green-500" />
                      <span className="text-sm font-medium">Valider la collecte au dispatch</span>
                    </div>
                    <Button variant="accent" size="sm" onClick={() => { setShowValidateCollecte(true); setSaisiCodeLivreur('') }}>
                      Saisir le code livreur
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Transactions */}
              {commande.transactions.length > 0 && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard size={18} className="text-gold-500" />Transactions</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {commande.transactions.map((t, idx) => (
                        <div key={`tr-${idx}`} className="flex justify-between text-sm border-b border-gold-400/10 pb-2 last:border-0">
                          <div>
                            <span className="font-medium">{transactionTypeLabels[t.type] || t.type}</span>
                            <span className="text-neutral-500 ml-2">{t.utilisateur}</span>
                            <p className="text-xs text-neutral-400 mt-0.5">{new Date(t.date).toLocaleString()}</p>
                          </div>
                          <span className={cn('font-medium', t.montant > 0 ? 'text-accent-600' : 'text-red-500')}>
                            {t.montant > 0 ? '+' : ''}{(t.montant ?? 0).toLocaleString()} FC
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Historique des statuts */}
              {commande.historique_statuts && commande.historique_statuts.length > 0 && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardHeader><CardTitle className="flex items-center gap-2"><History size={18} className="text-gold-500" />Historique des statuts</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {commande.historique_statuts.map(h => (
                        <div key={h.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{statusLabels[h.ancien_statut] || h.ancien_statut} → {statusLabels[h.nouveau_statut] || h.nouveau_statut}</span>
                          <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* (Futur) Historique des validations de codes – à activer lorsque l'API les renverra */}
              {/* 
              {commande.validations && commande.validations.length > 0 && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck size={18} className="text-gold-500" />Validations de codes</CardTitle></CardHeader>
                  <CardContent>...</CardContent>
                </Card>
              )}
              */}

              {/* Messages */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><MessageSquare size={18} className="text-gold-500" />Messages internes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {commande.messages?.map(msg => (
                    <div key={msg.id} className="p-3 bg-white/50 dark:bg-midnight-800/40 rounded-lg border border-gold-400/10">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{msg.auteur.prenom} {msg.auteur.nom}</span>
                        <span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm mt-1">{msg.message}</p>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input placeholder="Écrire un message interne..." value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessageMutation.mutate(messageText)} variant="glass" />
                    <Button variant="luxe" size="sm" onClick={() => sendMessageMutation.mutate(messageText)} loading={sendMessageMutation.isPending} disabled={!messageText.trim()}><Send size={16} /></Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Actions rapides */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader><CardTitle className="text-neutral-800 dark:text-neutral-200">Actions rapides</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <select value={commande.statut} onChange={e => changeStatut(e.target.value)} disabled={changeStatutMutation.isPending}
                    className="w-full rounded-xl border border-gold-400/30 bg-white/50 dark:bg-midnight-800/50 backdrop-blur-sm px-4 py-2.5 text-sm font-medium">
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <Button variant="outline-gold" fullWidth size="sm" onClick={() => setShowNotes(true)} leftIcon={<Edit3 size={14} />}>Notes internes</Button>
                  <Button variant="outline-gold" fullWidth size="sm" onClick={() => setShowSuivi(true)} leftIcon={<Truck size={14} />}>N° de suivi</Button>
                  <Button variant="outline-gold" fullWidth size="sm" onClick={() => setShowAssignLivreur(true)} leftIcon={<User size={14} />}>Assigner livreur</Button>
                  {/* Bouton rapide pour valider la collecte */}
                  {['conditionnement_premium', 'collecte'].includes(commande.statut) && commande.code_livreur && (
                    <Button variant="accent" fullWidth size="sm" onClick={() => setShowValidateCollecte(true)} leftIcon={<ClipboardCheck size={14} />}>
                      Valider la collecte
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Client */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader><CardTitle className="flex items-center gap-2"><User size={18} className="text-gold-500" />Client</CardTitle></CardHeader>
                <CardContent>
                  <p className="font-semibold">{commande.acheteur.prenom} {commande.acheteur.nom}</p>
                  <p className="text-sm text-neutral-500 mt-1">{commande.acheteur.email}</p>
                  {commande.acheteur.telephone && <p className="text-sm flex items-center gap-1 mt-1"><Phone size={14} className="text-gold-500" />{commande.acheteur.telephone}</p>}
                  <Link href={`/admin/utilisateurs/${commande.acheteur.id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-gold-500 hover:underline"><Eye size={12} />Voir le profil</Link>
                </CardContent>
              </Card>

              {/* Codes (client et livreur) */}
              {(displayCodeClient || commande.code_livreur) && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck size={18} className="text-gold-500" />Codes de sécurité</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {displayCodeClient && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-neutral-500">Code client</p>
                          <Button variant="ghost" size="sm" onClick={() => copyText(displayCodeClient!, 'code_client')}>
                            {copied === 'code_client' ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
                          </Button>
                        </div>
                        <code className="text-lg font-mono font-bold text-gold-600 tracking-widest">{displayCodeClient}</code>
                      </div>
                    )}
                    {commande.code_livreur && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-neutral-500">Code livreur</p>
                          <Button variant="ghost" size="sm" onClick={() => copyText(commande.code_livreur!, 'code_livreur')}>
                            {copied === 'code_livreur' ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
                          </Button>
                        </div>
                        <code className="text-lg font-mono font-bold text-brand-600 tracking-widest">{commande.code_livreur}</code>
                      </div>
                    )}
                    {commande.code_pin && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-neutral-500">Code PIN</p>
                          <Button variant="ghost" size="sm" onClick={() => copyText(commande.code_pin!, 'code_pin')}>
                            {copied === 'code_pin' ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
                          </Button>
                        </div>
                        <code className="text-lg font-mono font-bold text-luxury-600 tracking-widest">{commande.code_pin}</code>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Résumé financier */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard size={18} className="text-gold-500" />Résumé</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Sous-total</span><span>{(commande.sous_total ?? 0).toLocaleString()} FC</span></div>
                  {commande.remise > 0 && <div className="flex justify-between text-green-600"><span>Remise</span><span>-{(commande.remise ?? 0).toLocaleString()} FC</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Livraison</span><span>{(commande.frais_livraison ?? 0).toLocaleString()} FC</span></div>
                  <div className="flex justify-between font-bold text-base border-t border-gold-400/20 pt-2"><span>Total</span><span className="text-gold-600">{(commande.total ?? 0).toLocaleString()} FC</span></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </Container>

      {/* Modale assignation livreur */}
      <Modal isOpen={showAssignLivreur} onClose={() => setShowAssignLivreur(false)} title="Assigner un livreur" size="sm" accent="gold">
        <select value={selectedLivreurId} onChange={e => setSelectedLivreurId(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2 bg-card text-sm mb-4">
          <option value="">-- Choisir --</option>
          {(livreursData || []).map(l => <option key={l.id} value={l.id}>{l.prenom} {l.nom}</option>)}
        </select>
        <Button variant="luxe" fullWidth onClick={() => assignLivreurMutation.mutate(selectedLivreurId)} loading={assignLivreurMutation.isPending} disabled={!selectedLivreurId}>Assigner (génère le code livreur)</Button>
      </Modal>

      {/* Modale notes internes */}
      <Modal isOpen={showNotes} onClose={() => setShowNotes(false)} title="Notes internes" size="sm" accent="gold">
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4} className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm mb-4" />
        <Button variant="luxe" fullWidth onClick={() => saveNoteMutation.mutate(noteText)} loading={saveNoteMutation.isPending}>Enregistrer</Button>
      </Modal>

      {/* Modale suivi */}
      <Modal isOpen={showSuivi} onClose={() => setShowSuivi(false)} title="Numéro de suivi" size="sm" accent="gold">
        <Input value={suiviText} onChange={e => setSuiviText(e.target.value)} placeholder="N° de suivi" variant="glass" />
        <Button variant="luxe" fullWidth onClick={() => saveSuiviMutation.mutate(suiviText)} loading={saveSuiviMutation.isPending} className="mt-4">Enregistrer</Button>
      </Modal>

      {/* Modale validation collecte (dispatch) */}
      <Modal isOpen={showValidateCollecte} onClose={() => setShowValidateCollecte(false)} title="Validation de la collecte" size="sm" accent="gold">
        <p className="text-sm text-muted-foreground mb-4">
          Saisissez le <strong>code livreur</strong> communiqué par le livreur pour confirmer le transfert.
        </p>
        <Input
          value={saisiCodeLivreur}
          onChange={e => setSaisiCodeLivreur(e.target.value)}
          placeholder="Code livreur (6 caractères)"
          maxLength={6}
          className="font-mono mb-4"
        />
        <Button
          variant="luxe"
          fullWidth
          onClick={() => validateCollecteMutation.mutate({ commandeId: commande.id, code: saisiCodeLivreur })}
          loading={validateCollecteMutation.isPending}
          disabled={saisiCodeLivreur.length !== 6}
        >
          Valider la collecte
        </Button>
      </Modal>

      {/* Modale QR Code */}
      <Modal isOpen={showQrCode} onClose={() => setShowQrCode(false)} title="QR Code" size="sm" accent="gold">
        <div className="flex justify-center">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(displayCodeClient || commande.numero)}`} alt="QR Code" />
        </div>
      </Modal>
    </div>
  )
}