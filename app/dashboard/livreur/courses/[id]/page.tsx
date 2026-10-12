// app/dashboard/livreur/courses/[id]/page.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  ArrowLeft, MapPin, Package, Camera, CheckCircle, Phone, X, Loader2,
  ClipboardList, Check, AlertTriangle, MessageCircle,
  Navigation, Copy, CreditCard, Trash2, Key,
  Route, Truck, ShieldCheck, Activity,
  ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { toast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import LivraisonTimeline from '@/components/LivraisonTimeline'
import { MapItineraire } from '@/components/MapItineraire'
import SignaturePad from '@/components/SignaturePad'

// Schémas de validation
const codeArticleSchema = z.string().length(6).regex(/^\d{6}$/) // pour les articles
const codeClientSchema = z.string().length(6).regex(/^[A-Za-z0-9]{6}$/) // pour le code client final
const motifRefusSchema = z.string().min(3).max(500)

interface Article {
  id: string
  produit_id: string
  nom: string
  quantite: number
  prix_unitaire: number
  specifications?: string
  variante?: { attributes: Record<string, string> }
  code_vendeur?: string
  statut_collecte?: string
  motif_refus?: string
  photo_preuve?: string
  produits?: {
    id: string
    nom: string
    images: string[]
    vendeur_id: string
  }
  vendeur?: {
    nom: string
    prenom: string
    telephone: string
    adresse_boutique: string
    latitude?: number
    longitude?: number
  }
}

interface CourseDetail {
  id: string
  numero: string
  total: number
  statut_commande: string
  type_livraison: string
  adresse: string
  point_retrait_nom: string | null
  commune: string
  code_livraison_client: string   // code client que le livreur doit saisir
  code_livreur?: string           // code livreur à montrer au dispatch
  client: {
    nom: string
    prenom: string
    telephone: string
    latitude?: number
    longitude?: number
  }
  articles: Article[]
  livraison: {
    id: string
    statut: string
    code_pin?: string              // conservé pour rétrocompatibilité, non utilisé
    tentativas_code?: number
  } | null
  disponible: boolean
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  // Blocage des redirections intempestives (hack conservé)
  useEffect(() => {
    const originalPush = router.push.bind(router)
    const originalReplace = router.replace.bind(router)
    router.push = (...args: any[]) => {
      if (args[0] === '/') return
      return originalPush(...args)
    }
    router.replace = (...args: any[]) => {
      if (args[0] === '/') return
      return originalReplace(...args)
    }
    return () => {
      router.push = originalPush
      router.replace = originalReplace
    }
  }, [router])

  const { data: course, isLoading, isError, error, refetch } = useQuery<CourseDetail>({
    queryKey: ['livreur-course', id],
    queryFn: async () => {
      const res = await fetch(`/api/livreur/courses/${id}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || data.error || 'Erreur')
      }
      return res.json()
    },
    enabled: !!user && !authLoading,
    staleTime: 8_000,
    placeholderData: (prev) => prev,
  })

  const [collectCodes, setCollectCodes] = useState<Record<string, string>>({})
  const [validatingArticle, setValidatingArticle] = useState<string | null>(null)
  const [refuseModal, setRefuseModal] = useState<{ articleId: string; articleNom: string } | null>(null)
  const [refuseMotif, setRefuseMotif] = useState('')
  const [refusePhoto, setRefusePhoto] = useState<File | null>(null)
  const [livraisonPhotos, setLivraisonPhotos] = useState<{ file: File; preview: string }[]>([])
  const [showLivraisonPhotoModal, setShowLivraisonPhotoModal] = useState(false)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [clientCode, setClientCode] = useState('')      // code client saisi pour la livraison
  const [tentativesRestantes, setTentativesRestantes] = useState(3)
  const [showSignalModal, setShowSignalModal] = useState(false)
  const [signalType, setSignalType] = useState('warning')
  const [signalMessage, setSignalMessage] = useState('')
  const [signalPhoto, setSignalPhoto] = useState<File | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set())
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => refetch(), 30_000)
    return () => clearInterval(interval)
  }, [autoRefresh, refetch])

  useEffect(() => {
    if (course?.livraison?.tentativas_code !== undefined) {
      setTentativesRestantes(3 - course.livraison.tentativas_code)
    }
  }, [course])

  const acceptCourse = async () => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/livreur/courses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || data.error)
      }
      toast({ type: 'success', message: 'Course acceptée – code livreur généré' })
      await refetch()
    } catch (err: any) {
      toast({ type: 'error', message: err.message })
    } finally { setActionLoading(false) }
  }

  const validateArticle = async (articleId: string) => {
    const code = collectCodes[articleId] || ''
    const parsed = codeArticleSchema.safeParse(code)
    if (!parsed.success) {
      toast({ type: 'error', message: 'Code article à 6 chiffres requis' })
      return
    }
    setValidatingArticle(articleId)
    try {
      const res = await fetch(`/api/livreur/courses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate-article', article_id: articleId, code }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || data.error)
      }
      toast({ type: 'success', message: 'Article validé' })
      setCollectCodes(prev => { const next = { ...prev }; delete next[articleId]; return next })
      await refetch()
    } catch (err: any) {
      toast({ type: 'error', message: err.message })
    } finally { setValidatingArticle(null) }
  }

  const refuseArticle = async () => {
    if (!refuseModal) return
    const parsedMotif = motifRefusSchema.safeParse(refuseMotif)
    if (!parsedMotif.success) {
      toast({ type: 'error', message: parsedMotif.error.errors[0].message })
      return
    }
    setActionLoading(true)
    try {
      let photoUrl = null
      if (refusePhoto) {
        const fileName = `refus_${Date.now()}_${refusePhoto.name}`
        const { error: uploadError } = await supabaseBrowser.storage.from('preuves').upload(fileName, refusePhoto)
        if (!uploadError) {
          const { data: { publicUrl } } = supabaseBrowser.storage.from('preuves').getPublicUrl(fileName)
          photoUrl = publicUrl
        }
      }
      const res = await fetch(`/api/livreur/courses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refuse-article', article_id: refuseModal.articleId, motif: parsedMotif.data, photo_preuve: photoUrl }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || data.error)
      }
      toast({ type: 'success', message: 'Article refusé' })
      setRefuseModal(null)
      setRefuseMotif('')
      setRefusePhoto(null)
      await refetch()
    } catch (err: any) {
      toast({ type: 'error', message: err.message })
    } finally { setActionLoading(false) }
  }

  const deliverCourse = async () => {
    // Validation du code client (6 caractères alphanumériques)
    const parsedCode = codeClientSchema.safeParse(clientCode)
    if (!parsedCode.success) {
      toast({ type: 'error', message: 'Code client invalide (6 caractères alphanumériques)' })
      return
    }
    // Vérification côté client (optionnelle, le serveur vérifiera aussi)
    if (parsedCode.data !== course?.code_livraison_client) {
      toast({ type: 'error', message: 'Le code client ne correspond pas' })
      return
    }

    setActionLoading(true)
    const photoUrls = await uploadLivraisonPhotos()
    let geoloc = null
    if (navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject)
        )
        geoloc = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }
      } catch {}
    }
    try {
      const res = await fetch(`/api/livreur/courses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deliver',
          code_client: parsedCode.data,   // envoi du code client
          photos_livraison: photoUrls,
          signature_client: signatureData,
          geoloc,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || data.error)
      }
      toast({ type: 'success', message: 'Livraison validée !' })
      router.push('/dashboard/livreur?success=1')
    } catch (err: any) {
      toast({ type: 'error', message: err.message })
      if (course?.livraison) {
        setTentativesRestantes(3 - ((course.livraison.tentativas_code ?? 0) + 1))
      }
    } finally { setActionLoading(false) }
  }

  const uploadLivraisonPhotos = async () => {
    if (livraisonPhotos.length === 0) return []
    const urls: string[] = []
    for (const photo of livraisonPhotos) {
      try {
        const fileName = `livraison_${Date.now()}_${photo.file.name}`
        const { error } = await supabaseBrowser.storage.from('livraisons').upload(fileName, photo.file)
        if (!error) {
          const { data: { publicUrl } } = supabaseBrowser.storage.from('livraisons').getPublicUrl(fileName)
          urls.push(publicUrl)
        }
      } catch {}
    }
    return urls
  }

  const signalIncident = async () => {
    if (!signalMessage) { toast({ type: 'error', message: 'Message requis' }); return }
    setActionLoading(true)
    try {
      let photoUrl = null
      if (signalPhoto) {
        const fileName = `signal_${Date.now()}_${signalPhoto.name}`
        const { error } = await supabaseBrowser.storage.from('signalements').upload(fileName, signalPhoto)
        if (!error) {
          const { data: { publicUrl } } = supabaseBrowser.storage.from('signalements').getPublicUrl(fileName)
          photoUrl = publicUrl
        }
      }
      const res = await fetch(`/api/livreur/courses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signal', type: signalType, message: signalMessage, photo: photoUrl }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast({ type: 'success', message: 'Signalement envoyé' })
      setShowSignalModal(false)
      setSignalMessage('')
      setSignalPhoto(null)
    } catch {
      toast({ type: 'error', message: 'Erreur envoi' })
    } finally { setActionLoading(false) }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ type: 'success', message: 'Copié !' })
  }

  const openWhatsApp = (phone: string) => window.open(`https://wa.me/${phone.replace(/^0/, '243')}`, '_blank')
  const openPhone = (phone: string) => window.location.href = `tel:${phone}`

  const mapWaypoints = useMemo(() => {
    if (!course) return []
    return course.articles
      .filter(a => a.vendeur?.latitude && a.vendeur?.longitude)
      .map(a => ({
        id: a.id,
        label: a.vendeur?.nom ?? 'Vendeur',
        latitude: a.vendeur!.latitude!,
        longitude: a.vendeur!.longitude!,
        type: 'vendeur' as const,
      }))
  }, [course])

  const destination = course?.client?.latitude && course?.client?.longitude ? {
    id: 'client',
    label: `${course.client.prenom} ${course.client.nom}`,
    latitude: course.client.latitude,
    longitude: course.client.longitude,
    type: 'client' as const,
  } : undefined

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="xl" variant="premium" label="Chargement de la course..." />
      </div>
    )
  }

  if (isError || !course) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card variant="glass" className="text-center max-w-md">
          <CardContent className="py-12">
            <Package size={48} className="mx-auto text-neutral-400 mb-4" />
            <p className="text-neutral-500">Course introuvable.</p>
            <Link href="/dashboard/livreur"><Button variant="outline-gold" className="mt-4">Retour</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isAccepted = course.livraison !== null && course.livraison.statut !== 'annulee'
  const allArticlesTraites = course.articles.length > 0 && course.articles.every(a => a.statut_collecte === 'accepte' || a.statut_collecte === 'refuse')
  const isDelivered = course.livraison?.statut === 'livree'
  const toggleExpandArticle = (id: string) => setExpandedArticles(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/70 dark:bg-midnight-900/70 border-b border-gold-400/20 shadow-soft">
        <Container className="py-4 flex items-center gap-4">
          <Link href="/dashboard/livreur" className="p-2 rounded-xl hover:bg-gold-400/10 text-neutral-400 hover:text-gold-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">
                Commande #{course.numero}
              </h1>
              <Badge variant={isDelivered ? 'accent' : 'gold'} size="sm">
                {isDelivered ? 'Livrée' : 'En cours'}
              </Badge>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 flex items-center gap-1">
              <MapPin size={14} className="text-gold-500" /> {course.commune}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content={autoRefresh ? 'Arrêter le rafraîchissement auto' : 'Activer le rafraîchissement auto (30s)'}>
              <Button variant="ghost" size="sm" onClick={() => setAutoRefresh(!autoRefresh)} leftIcon={<Activity size={14} />}>
                {autoRefresh ? 'ON' : 'OFF'}
              </Button>
            </Tooltip>
            <Button variant="danger" size="sm" onClick={() => setShowSignalModal(true)} leftIcon={<AlertTriangle size={14} />}>
              Signaler
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()} leftIcon={<RefreshCw size={14} />}>
              Actualiser
            </Button>
          </div>
        </Container>
      </div>

      <Container className="py-8 max-w-5xl relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">

              {/* Code livreur (à montrer au dispatch) */}
              {course.code_livreur && (
                <Card variant="glass" className="border-l-4 border-l-blue-400">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-600">
                        <Key size={20} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Votre code livreur (à communiquer au dispatch)</p>
                        <p className="text-xl font-mono font-bold tracking-widest">{course.code_livreur}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(course.code_livreur!)}>
                      <Copy size={16} />
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card variant="glass" className="border-gold-400/20 shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck size={18} className="text-gold-500" /> Progression
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <LivraisonTimeline
                    statut={course.livraison?.statut ?? 'en_attente'}
                    collecteValidee={allArticlesTraites}
                    dateAcceptation={course.livraison?.created_at}
                    showDetails
                    animated
                  />
                </CardContent>
              </Card>

              {/* Carte itinéraire */}
              {course.livraison && (
                <Card variant="glass" className="border-gold-400/20 shadow-gold">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Route size={18} className="text-gold-500" /> Itinéraire
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MapItineraire
                      height="350px"
                      waypoints={mapWaypoints}
                      destination={destination}
                      showRecenter
                    />
                  </CardContent>
                </Card>
              )}

              {/* Articles à collecter */}
              <Card variant="glass" className="border-gold-400/20 shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList size={18} className="text-gold-500" /> Articles à collecter ({course.articles.length})
                  </CardTitle>
                  <CardDescription>Scannez ou saisissez le code de chaque article</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {course.articles.map((article, idx) => {
                    const isExpanded = expandedArticles.has(article.id)
                    const isOk = article.statut_collecte === 'accepte'
                    const isRefused = article.statut_collecte === 'refuse'
                    return (
                      <motion.div key={article.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                        className={cn(
                          'rounded-xl p-4 border transition-colors',
                          isOk ? 'bg-green-50 dark:bg-green-900/10 border-green-300' :
                          isRefused ? 'bg-red-50 dark:bg-red-900/10 border-red-300' :
                          'bg-white/50 dark:bg-midnight-800/40 border-gold-400/10'
                        )}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex gap-3">
                            {article.produits?.images?.[0] ? (
                              <div className="w-12 h-12 rounded-lg overflow-hidden border relative">
                                <Image src={article.produits.images[0]} alt={article.nom} fill className="object-cover" />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-neutral-100 dark:bg-midnight-700 flex items-center justify-center">
                                <Package size={20} className="text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <h4 className="font-semibold text-sm">{article.nom}</h4>
                              <p className="text-xs text-muted-foreground">Qté : {article.quantite}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOk ? (
                              <Badge variant="accent" size="sm"><CheckCircle size={12} className="mr-1" />Validé</Badge>
                            ) : isRefused ? (
                              <Badge variant="danger" size="sm"><X size={12} className="mr-1" />Refusé</Badge>
                            ) : (
                              <Badge variant="neutral" size="sm">En attente</Badge>
                            )}
                            <button onClick={() => toggleExpandArticle(article.id)} className="text-muted-foreground">
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>
                        <AnimatePresence>
                          {isExpanded && !isOk && !isRefused && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3 space-y-3">
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Code article (6 chiffres)"
                                  value={collectCodes[article.id] || ''}
                                  onChange={e => setCollectCodes(prev => ({ ...prev, [article.id]: e.target.value }))}
                                  maxLength={6}
                                  className="font-mono flex-1"
                                />
                                <Button variant="accent" size="sm" onClick={() => validateArticle(article.id)} loading={validatingArticle === article.id}>
                                  Valider
                                </Button>
                              </div>
                              <Button variant="danger" size="sm" onClick={() => setRefuseModal({ articleId: article.id, articleNom: article.nom })}>
                                <X size={14} className="mr-1" /> Refuser l'article
                              </Button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )
                  })}
                </CardContent>
              </Card>

              {/* Finalisation livraison – saisie du code client */}
              {allArticlesTraites && !isDelivered && (
                <Card variant="glass" className="border-gold-400/20 shadow-gold">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck size={18} className="text-gold-500" /> Finaliser la livraison
                    </CardTitle>
                    <CardDescription>
                      Demandez au client son code secret (6 caractères) et saisissez‑le ci‑dessous
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input
                      placeholder="Code client (ex: A1B2C3)"
                      value={clientCode}
                      onChange={e => setClientCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      className="font-mono text-xl tracking-widest"
                    />
                    <div className="flex gap-2">
                      <Button variant="luxe" fullWidth onClick={deliverCourse} loading={actionLoading} disabled={clientCode.length !== 6}>
                        Valider la remise
                      </Button>
                    </div>
                    {tentativesRestantes < 3 && (
                      <p className="text-sm text-red-500 mt-2">Tentatives restantes : {tentativesRestantes}</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline-gold" size="sm" onClick={() => setShowLivraisonPhotoModal(true)} leftIcon={<Camera size={14} />}>
                        Ajouter des photos
                      </Button>
                      <Button variant="outline-gold" size="sm" onClick={() => setShowSignatureModal(true)} leftIcon={<Check size={14} />}>
                        Signature client
                      </Button>
                    </div>
                    {signatureData && (
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <CheckCircle size={14} className="text-green-500" /> Signature enregistrée
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ... la suite du code (sidebar, modales, etc.) est identique à votre code actuel ... */}
              {/* Je l'omets pour ne pas surcharger, mais il faut le conserver tel quel dans le fichier final. */}
              {/* Vous pouvez copier-coller la partie manquante à partir de votre code original, en veillant à remplacer les références à `pinCode` par `clientCode` dans la sidebar si elle contenait la saisie. */}
              {/* Assurez-vous de garder les mêmes structures pour la sidebar client, les modales (refus, signalement, photos, signature, etc.). */}
              {/* Les seules modifications sont : affichage du code_livreur, remplacement du PIN par code_client. */}
              {/* Tout le reste (carte, boutons, sidebar, modales) reste inchangé. */}

            </div>

            {/* Sidebar (inchangée, sauf suppression éventuelle de la saisie PIN) */}
            <div className="space-y-6">
              {/* ... code sidebar existant ... */}
            </div>
          </div>
        </motion.div>
      </Container>

      {/* Modales (inchangées) */}
      {/* ... */}
    </div>
  )
}