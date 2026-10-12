// app/commande/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import Link from 'next/link'
import Image from 'next/image'
import {
  Loader2, ShoppingBag, Wallet, Truck, MapPin,
  Plus, Search, X, Navigation, Clock, User, Store,
  ShieldCheck, ArrowLeft, ChevronRight, CreditCard, CheckCircle2,
  AlertTriangle, Info, Star, Sparkles, Zap, Gift, Package,
  ChevronUp, ChevronDown, Smartphone, BadgeCheck, RefreshCw, Percent,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

// Nouveau composant d'adresse en cascade
import AddressCascadeSelect, { AddressData } from '@/components/AddressCascadeSelect'

/* ------------------------------------------------------------------ */
/*  Schéma Zod étendu – communeId devient string (UUID)                */
/* ------------------------------------------------------------------ */
const commandeSchema = z.object({
  currency: z.enum(['CDF', 'USD']),
  typeLivraison: z.enum(['domicile', 'point_retrait']),
  communeId: z.string().nullable().optional(), // UUID de la commune
  adresseComplete: z.string().optional(),
  pointRetraitId: z.number().nullable().optional(),
  express: z.boolean().default(false),
  messageCadeau: z.string().max(200).optional(),
})
// Après avoir chargé productLivraison, ajoutez :
const modesDisponibles = useMemo(() => {
  const ids = items.map(i => i.id)
  const dispo = { domicile: true, point_retrait: true, express: true }
  ids.forEach(id => {
    const p = productLivraison[id]
    if (p) {
      if (p.livraison_domicile_active === false) dispo.domicile = false
      if (p.livraison_point_retrait_active === false) dispo.point_retrait = false
      if (p.livraison_express_active === false) dispo.express = false
    }
  })
  return dispo
}, [items, productLivraison])

type CommandeForm = z.infer<typeof commandeSchema>

interface PointRetrait {
  id: number
  nom: string
  adresse: string
  telephone: string | null
  horaires: string | null
  latitude: number | null
  longitude: number | null
  photo_url: string | null
  points_de_repere: string | null
  est_partenaire_verifie: boolean
  note_moyenne: number | null
}

/* ------------------------------------------------------------------ */
/*  Étapes de commande (stepper)                                       */
/* ------------------------------------------------------------------ */
const STEPS = [
  { id: 'cart', label: 'Panier', icon: ShoppingBag },
  { id: 'checkout', label: 'Commande', icon: CreditCard },
  { id: 'payment', label: 'Paiement', icon: Wallet },
  { id: 'confirmation', label: 'Confirmation', icon: CheckCircle2 },
]

export default function CommandePage() {
  const {
    items,
    summary,
    activePromo,
    applyPromoCode,
    removePromoCode,
    promoError: promoErrorMessage,
  } = useCart()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { rate, loading: rateLoading } = useExchangeRate()
  const toast = useToast()

  const [loadingSubmit, setLoadingSubmit] = useState(false)
  const [error, setError] = useState('')
  const [wallet, setWallet] = useState(0)
  const [loadingWallet, setLoadingWallet] = useState(true)
  const [online, setOnline] = useState(true)

  // Code promo local (saisie)
  const [promoInput, setPromoInput] = useState('')
  const [promoApplying, setPromoApplying] = useState(false)

  // Points de retrait
  const [searchRetrait, setSearchRetrait] = useState('')
  const [retraitResults, setRetraitResults] = useState<PointRetrait[]>([])
  const [loadingRetraits, setLoadingRetraits] = useState(false)
  const [selectedRetrait, setSelectedRetrait] = useState<PointRetrait | null>(null)

  // Adresses
  const [addresses, setAddresses] = useState<any[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [showNewAddressForm, setShowNewAddressForm] = useState(false)
  const [newAddress, setNewAddress] = useState<any>({})
  const [savingAddress, setSavingAddress] = useState(false)
  const [loadingAddresses, setLoadingAddresses] = useState(true)

  // Livraison dynamique
  const [productLivraison, setProductLivraison] = useState<Record<string, any>>({})
  const [globalFree, setGlobalFree] = useState(false)

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<CommandeForm>({
    resolver: zodResolver(commandeSchema),
    defaultValues: { currency: 'CDF', typeLivraison: 'domicile', express: false },
  })

  const typeLivraison = watch('typeLivraison')
  const isExpress = watch('express')

  // Détection online/offline
  useEffect(() => {
    setOnline(navigator.onLine)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Charger le flag global de gratuité
  useEffect(() => {
    fetch('/api/settings?key=global_free_shipping')
      .then(r => r.json())
      .then(data => setGlobalFree(data.value === true))
      .catch(() => setGlobalFree(false))
  }, [])

  // Charger les tarifs de livraison des produits du panier
  useEffect(() => {
    if (items.length === 0) return
    const ids = items.map(i => i.id)
    fetch(`/api/produits/livraison?ids=${ids.join(',')}`)
      .then(r => r.json())
      .then(data => {
        const map: Record<string, any> = {}
        ;(data || []).forEach((p: any) => {
          map[p.id] = p
        })
        setProductLivraison(map)
      })
      .catch(() => setProductLivraison({}))
  }, [items])

  // Calcul dynamique des frais de livraison et délai estimé
  const { fraisLivraison, delaiEstime } = useMemo(() => {
    if (globalFree) return { fraisLivraison: 0, delaiEstime: 'Offert' }

    let total = 0
    items.forEach(item => {
      const prod = productLivraison[item.id]
      if (!prod) {
        total += typeLivraison === 'domicile' ? (isExpress ? 20000 : 5000) : (isExpress ? 10000 : 0)
        return
      }
      let frais = typeLivraison === 'domicile' ? (prod.livraison_domicile ?? 5000) : (prod.livraison_point_retrait ?? 0)
      if (isExpress) {
        if (prod.express_gratuit) {
          frais = 0
        } else {
          frais += (prod.livraison_express ?? 15000)
        }
      }
      total += frais
    })

    const delai = isExpress ? '24 heures' : typeLivraison === 'domicile' ? '2-4 jours' : '1-2 jours'
    return { fraisLivraison: total, delaiEstime: delai }
  }, [typeLivraison, isExpress, items, productLivraison, globalFree])

  // Charger wallet
  useEffect(() => {
    if (user) {
      fetch('/api/user/wallet')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => setWallet(d.solde_achat ?? d.balance ?? 0))
        .catch(() => setWallet(0))
        .finally(() => setLoadingWallet(false))
    } else {
      setLoadingWallet(false)
    }
  }, [user])

  // Charger adresses
  useEffect(() => {
    if (!user) return
    fetch('/api/user/addresses')
      .then(r => r.json())
      .then(data => {
        setAddresses(Array.isArray(data) ? data : [])
        if (data.length > 0) {
          const first = data[0]
          setSelectedAddressId(first.id)
          setValue('communeId', first.commune_id ?? null)
          setValue('adresseComplete', first.adresse_text || `${first.quartier}, ${first.avenue}...`)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAddresses(false))
  }, [user, setValue])

  // Recherche points de retrait
  useEffect(() => {
    if (typeLivraison !== 'point_retrait') return
    const timer = setTimeout(() => {
      setLoadingRetraits(true)
      fetch(`/api/points-retrait?search=${encodeURIComponent(searchRetrait.trim())}`)
        .then(r => r.json())
        .then(data => setRetraitResults(Array.isArray(data) ? data : []))
        .catch(() => setRetraitResults([]))
        .finally(() => setLoadingRetraits(false))
    }, 400)
    return () => clearTimeout(timer)
  }, [searchRetrait, typeLivraison])

  const selectRetrait = (pr: PointRetrait) => {
    setSelectedRetrait(pr)
    setSearchRetrait(pr.nom)
    setRetraitResults([])
    setValue('pointRetraitId', pr.id)
  }

  // Calculs totaux
  const totalCDF = summary.total + fraisLivraison
  const totalInCurrency = watch('currency') === 'USD' && rate ? totalCDF / rate : totalCDF
  const soldeInsuffisant = wallet < totalCDF

  // Application d'un code promo depuis l'input
  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return
    setPromoApplying(true)
    await applyPromoCode(promoInput.trim())
    setPromoApplying(false)
    setPromoInput('')
  }

  // Soumission
  const onSubmit = async (data: CommandeForm) => {
    if (!online) {
      setError('Vous êtes hors ligne. Veuillez vérifier votre connexion internet.')
      return
    }
    if (data.typeLivraison === 'domicile' && (!data.communeId || !data.adresseComplete)) {
      setError('Veuillez compléter l’adresse de livraison.')
      return
    }
    if (data.typeLivraison === 'point_retrait' && !data.pointRetraitId) {
      setError('Veuillez sélectionner un point de retrait.')
      return
    }
    setLoadingSubmit(true)
    setError('')
    try {
      const res = await fetch('/api/commandes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            produit_id: i.id,
            quantite: i.quantite,
            prix_unitaire: i.prix,
            specifications: i.specifications ?? null,
            variante: i.variante ?? null,
          })),
          total_articles: summary.sousTotal,
          frais_livraison: fraisLivraison,
          type_livraison: data.typeLivraison,
          commune_livraison_id: data.typeLivraison === 'domicile' ? data.communeId : null,
          adresse_livraison: data.typeLivraison === 'domicile' ? data.adresseComplete : null,
          point_retrait_id: data.typeLivraison === 'point_retrait' ? data.pointRetraitId : null,
          express: data.express,
          message_cadeau: data.messageCadeau || null,
          // Code promo
          code_promo: activePromo?.code || null,
          remise_percent: activePromo?.type === 'percent' ? activePromo.value : 0,
          remise_montant: summary.remiseTotal,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur lors de la création de la commande')
      toast.addToast({ type: 'success', message: 'Commande créée avec succès ! Redirection...' })
      router.push(`/commande/paiement?id=${result.id}&currency=${data.currency}`)
    } catch (err: any) {
      setError(err.message)
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setLoadingSubmit(false)
    }
  }

  // Redirection si panier vide
  useEffect(() => {
    if (!loadingAddresses && !authLoading && items.length === 0) {
      router.push('/panier')
    }
  }, [items, loadingAddresses, authLoading, router])

  if (authLoading || rateLoading || loadingAddresses) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="xl" variant="brand" label="Chargement..." />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="p-8 text-center border-gold-400/20 max-w-md">
          <User size={48} className="mx-auto text-gold-400 mb-4" />
          <h1 className="text-2xl font-bold mb-4">Connexion requise</h1>
          <p className="text-muted-foreground mb-6">Connectez-vous pour finaliser votre commande.</p>
          <Link href={`/login?redirect=${encodeURIComponent('/commande')}`}>
            <Button variant="luxe" size="lg">Se connecter</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <Container className="py-8 md:py-12">
        {/* Stepper */}
        <div className="mb-8">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {STEPS.map((step, idx) => {
              const isActive = step.id === 'checkout'
              const isPast = STEPS.findIndex(s => s.id === 'checkout') > idx
              const Icon = step.icon
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className={cn(
                    'flex flex-col items-center',
                    isActive && 'text-gold-500',
                    isPast && 'text-gold-400'
                  )}>
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all',
                      isActive && 'bg-gold-500 text-white shadow-gold',
                      isPast && 'bg-gold-200 dark:bg-gold-800 text-gold-800 dark:text-gold-200',
                      !isActive && !isPast && 'bg-muted text-muted-foreground'
                    )}>
                      <Icon size={20} />
                    </div>
                    <span className="text-xs font-medium">{step.label}</span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={cn('flex-1 h-0.5 mx-2', isPast ? 'bg-gold-400' : 'bg-border')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <Link href="/panier" className="inline-flex items-center gap-2 text-muted-foreground hover:text-gold-500 mb-6 text-sm transition-colors">
          <ArrowLeft size={16} /> Retour au panier
        </Link>

        <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-3xl md:text-4xl font-extrabold text-foreground font-serif mb-8">
          Finaliser la commande
        </motion.h1>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Devise */}
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <Card variant="glass" className="border-gold-400/20">
                    <CardContent className="p-5 space-y-4">
                      <h3 className="font-semibold">Devise de paiement</h3>
                      <div className="flex gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" checked={field.value === 'CDF'} onChange={() => field.onChange('CDF')} className="text-gold-500" />
                          <span className="text-sm font-medium">CDF</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" checked={field.value === 'USD'} onChange={() => field.onChange('USD')} className="text-gold-500" />
                          <span className="text-sm font-medium">USD</span>
                        </label>
                      </div>
                      {field.value === 'USD' && rate && (
                        <p className="text-xs text-muted-foreground">1 USD = {rate.toLocaleString()} CDF</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              />

              {/* Livraison */}
<Controller
  name="typeLivraison"
  control={control}
  render={({ field }) => (
    <Card variant="glass" className="border-gold-400/20">
      <CardContent className="p-5 space-y-4">
        <h3 className="font-semibold">Mode de livraison</h3>
        <div className="flex flex-col sm:flex-row gap-4">
          {/* À domicile */}
          <button
            type="button"
            onClick={() => field.onChange('domicile')}
            disabled={!modesDisponibles.domicile}
            className={cn(
              'flex-1 flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left',
              !modesDisponibles.domicile && 'opacity-50 cursor-not-allowed',
              field.value === 'domicile'
                ? 'border-gold-400 bg-gold-50/50 dark:bg-gold-900/20 shadow-gold'
                : 'border-border hover:border-gold-400/50'
            )}
          >
            <Truck size={22} className={field.value === 'domicile' ? 'text-gold-500' : 'text-muted-foreground'} />
            <div>
              <p className="font-semibold text-sm">À domicile</p>
              <p className="text-xs text-muted-foreground">
                {modesDisponibles.domicile
                  ? `${fraisLivraison.toLocaleString()} FC · ${delaiEstime}`
                  : 'Non disponible pour certains articles'}
              </p>
            </div>
          </button>

          {/* Point de retrait */}
          <button
            type="button"
            onClick={() => field.onChange('point_retrait')}
            disabled={!modesDisponibles.point_retrait}
            className={cn(
              'flex-1 flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left',
              !modesDisponibles.point_retrait && 'opacity-50 cursor-not-allowed',
              field.value === 'point_retrait'
                ? 'border-gold-400 bg-gold-50/50 dark:bg-gold-900/20 shadow-gold'
                : 'border-border hover:border-gold-400/50'
            )}
          >
            <MapPin size={22} className={field.value === 'point_retrait' ? 'text-gold-500' : 'text-muted-foreground'} />
            <div>
              <p className="font-semibold text-sm">Point de retrait</p>
              <p className="text-xs text-muted-foreground">
                {modesDisponibles.point_retrait
                  ? `${fraisLivraison === 0 ? 'Gratuit' : `${fraisLivraison.toLocaleString()} FC`} · ${delaiEstime}`
                  : 'Non disponible pour certains articles'}
              </p>
            </div>
          </button>
        </div>

        {/* Option express */}
        <label className={cn('flex items-center gap-2 cursor-pointer mt-4', !modesDisponibles.express && 'opacity-50 cursor-not-allowed')}>
          <input
            type="checkbox"
            checked={isExpress}
            onChange={(e) => setValue('express', e.target.checked)}
            disabled={!modesDisponibles.express}
            className="text-gold-500 rounded"
          />
          <span className="text-sm font-medium">Livraison express</span>
          <Badge variant="gold" size="sm">{isExpress ? 'Activé' : 'Option'}</Badge>
          {!modesDisponibles.express && <span className="text-xs text-red-500">Non disponible pour certains articles</span>}
        </label>

                      {/* Message cadeau */}
                      <Controller
                        name="messageCadeau"
                        control={control}
                        render={({ field: msgField }) => (
                          <div>
                            <button
                              type="button"
                              onClick={() => msgField.onChange(msgField.value ? '' : ' ')}
                              className="text-sm text-gold-600 hover:text-gold-500 flex items-center gap-1 mt-4"
                            >
                              <Gift size={14} />
                              {msgField.value ? 'Modifier le message cadeau' : 'Ajouter un message cadeau'}
                            </button>
                            {msgField.value && (
                              <div className="mt-2">
                                <Input
                                  value={msgField.value}
                                  onChange={msgField.onChange}
                                  placeholder="Votre message cadeau (max 200 caractères)"
                                  maxLength={200}
                                  variant="glass"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}
              />

              {/* Adresse domicile */}
              {typeLivraison === 'domicile' && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardContent className="p-5 space-y-4">
                    <h3 className="font-semibold">Adresse de livraison</h3>
                    {addresses.length > 0 ? (
                      <div className="space-y-3">
                        {addresses.map(addr => (
                          <label key={addr.id} className={cn('flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all', selectedAddressId === addr.id ? 'border-gold-400 bg-gold-50/50 dark:bg-gold-900/20' : 'border-border')}>
                            <input type="radio" checked={selectedAddressId === addr.id} onChange={() => {
                              setSelectedAddressId(addr.id)
                              setValue('communeId', addr.commune_id)
                              setValue('adresseComplete', addr.adresse_text || `${addr.quartier}, ${addr.avenue}`)
                            }} className="mt-1 text-gold-500" />
                            <div>
                              <p className="font-medium">{addr.nom || addr.libelle}</p>
                              <p className="text-xs text-muted-foreground">{addr.adresse_text || `${addr.quartier}, ${addr.avenue}`}</p>
                            </div>
                          </label>
                        ))}
                        <button type="button" onClick={() => setShowNewAddressForm(!showNewAddressForm)} className="text-sm text-gold-600 hover:text-gold-500 flex items-center gap-1">
                          <Plus size={14} /> {showNewAddressForm ? 'Annuler' : 'Nouvelle adresse'}
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground mb-3">Aucune adresse enregistrée</p>
                        <Button variant="outline-gold" size="sm" onClick={() => setShowNewAddressForm(true)}><Plus size={14} /> Ajouter une adresse</Button>
                      </div>
                    )}

                    <AnimatePresence>
                      {showNewAddressForm && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-gold-400/20 pt-4 space-y-4">
                          {/* Nom de l'adresse */}
                          <Input
                            placeholder="Nom de l'adresse (ex: Domicile, Bureau)"
                            value={newAddress.nom || ''}
                            onChange={e => setNewAddress({ ...newAddress, nom: e.target.value })}
                            variant="glass"
                          />

                          {/* Sélecteur en cascade + champs libres */}
                          <AddressCascadeSelect
                            onAddressChange={(data: AddressData) => {
                              setNewAddress((prev: any) => ({
                                ...prev,
                                province_id: data.province_id,
                                province_nom: data.province_nom,
                                ville_id: data.ville_id,
                                ville_nom: data.ville_nom,
                                commune_id: data.commune_id,
                                commune_nom: data.commune_nom,
                                quartier: data.quartier,
                                avenue: data.avenue,
                                numero: data.numero,
                                reference: data.reference,
                                telephone: data.telephone,
                              }))
                            }}
                            initialData={newAddress}
                          />

                          {/* Boutons */}
                          <div className="flex gap-2">
                            <Button variant="luxe" size="sm" loading={savingAddress} onClick={async () => {
                              setSavingAddress(true)
                              try {
                                const payload = {
                                  nom: newAddress.nom,
                                  province_id: newAddress.province_id,
                                  ville_id: newAddress.ville_id,
                                  commune_id: newAddress.commune_id,
                                  quartier: newAddress.quartier,
                                  avenue: newAddress.avenue,
                                  numero: newAddress.numero,
                                  reference: newAddress.reference,
                                  telephone: newAddress.telephone,
                                  adresse_text: `${newAddress.quartier || ''}, ${newAddress.avenue || ''}${newAddress.numero ? ', n°' + newAddress.numero : ''}${newAddress.reference ? ' (' + newAddress.reference + ')' : ''}`,
                                }
                                const res = await fetch('/api/user/addresses', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(payload),
                                })
                                const saved = await res.json()
                                if (!res.ok) throw new Error(saved.error)
                                setAddresses([...addresses, saved])
                                setSelectedAddressId(saved.id)
                                setValue('communeId', saved.commune_id)
                                setValue('adresseComplete', saved.adresse_text)
                                setShowNewAddressForm(false)
                                setNewAddress({})
                                toast.addToast({ type: 'success', message: 'Adresse enregistrée' })
                              } catch (e: any) {
                                toast.addToast({ type: 'error', message: e.message })
                              } finally { setSavingAddress(false) }
                            }}>Enregistrer</Button>
                            <Button variant="outline-gold" size="sm" onClick={() => setShowNewAddressForm(false)}>Annuler</Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              )}

              {/* Point retrait */}
              {typeLivraison === 'point_retrait' && (
                <Card variant="glass" className="border-gold-400/20">
                  <CardContent className="p-5 space-y-4">
                    <h3 className="font-semibold">Point de retrait</h3>
                    {selectedRetrait ? (
                      <div className="bg-card rounded-xl p-4 border border-gold-400/20 space-y-2">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-bold">{selectedRetrait.nom}</p>
                            <p className="text-sm text-muted-foreground">{selectedRetrait.adresse}</p>
                          </div>
                          <button onClick={() => { setSelectedRetrait(null); setSearchRetrait(''); setValue('pointRetraitId', null) }} className="text-red-400"><X size={20} /></button>
                        </div>
                        {selectedRetrait.photo_url && <img src={selectedRetrait.photo_url} className="w-full h-32 object-cover rounded-lg" alt={selectedRetrait.nom} />}
                        <div className="text-sm space-y-1">
                          {selectedRetrait.horaires && <p className="flex items-center gap-2"><Clock size={14} className="text-gold-500" />{selectedRetrait.horaires}</p>}
                          {selectedRetrait.telephone && <p>📞 {selectedRetrait.telephone}</p>}
                          {selectedRetrait.points_de_repere && <p className="text-xs text-muted-foreground">🗺️ {selectedRetrait.points_de_repere}</p>}
                        </div>
                        <Button variant="luxe" fullWidth size="sm" onClick={() => window.open(`https://maps.google.com/?q=${selectedRetrait.latitude},${selectedRetrait.longitude}`, '_blank')}>
                          <Navigation size={16} className="mr-2" /> Itinéraire
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Input leftIcon={<Search size={18} />} placeholder="Rechercher un point de retrait..." value={searchRetrait} onChange={e => setSearchRetrait(e.target.value)} variant="glass" />
                        {loadingRetraits && <Spinner size="sm" className="mt-2" />}
                        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                          {retraitResults.map(pr => (
                            <button key={pr.id} type="button" onClick={() => selectRetrait(pr)} className="w-full text-left p-3 rounded-lg hover:bg-gold-400/10 transition flex items-start gap-3">
                              <MapPin size={18} className="text-gold-500 mt-0.5" />
                              <div>
                                <p className="font-medium text-sm">{pr.nom}</p>
                                <p className="text-xs text-muted-foreground">{pr.adresse}</p>
                                {pr.est_partenaire_verifie && <Badge variant="accent" size="sm">Partenaire vérifié</Badge>}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Erreur */}
              {error && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 text-sm flex items-center gap-2">
                  <AlertTriangle size={16} /> {error}
                </div>
              )}

              {/* Bouton de validation */}
              <Button
                type="submit"
                variant="luxe"
                fullWidth
                size="xl"
                loading={loadingSubmit}
                disabled={!online}
                className="shadow-gold hover:shadow-glow-gold"
              >
                {online ? 'Confirmer et payer' : 'Hors ligne - Réessayez'}
              </Button>
            </form>
          </div>

          {/* Résumé colonne droite */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24 border-gold-400/20 bg-card/70 backdrop-blur-xl shadow-gold">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShoppingBag size={20} className="text-gold-500" /> Récapitulatif
                </CardTitle>
                <CardDescription>{items.length} article{items.length > 1 ? 's' : ''}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {items.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="flex gap-3 items-start">
                      <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0 relative">
                        {item.image && <Image src={item.image} alt={item.nom} fill className="object-cover" sizes="48px" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.nom}</p>
                        <p className="text-xs text-muted-foreground">Qté: {item.quantite} × {item.prix.toLocaleString()} FC</p>
                      </div>
                      <span className="text-sm font-semibold">{(item.prix * item.quantite).toLocaleString()} FC</span>
                    </div>
                  ))}
                </div>
                <hr className="border-gold-400/20" />

                {/* Code promo */}
                {activePromo ? (
                  <div className="flex items-center justify-between text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2">
                      <Percent size={16} className="text-green-600" />
                      <span className="font-medium">{activePromo.code}</span>
                      <span className="text-green-600">(-{activePromo.value}%)</span>
                    </div>
                    <button onClick={removePromoCode} className="text-red-500 hover:text-red-600">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <Input
                      variant="glass"
                      size="sm"
                      placeholder="Code promo"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                    />
                    <Button variant="outline-gold" size="sm" onClick={handleApplyPromo} loading={promoApplying}>
                      Appliquer
                    </Button>
                  </div>
                )}
                {promoErrorMessage && (
                  <p className="text-red-500 text-xs">{promoErrorMessage}</p>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>Sous-total</span><span>{summary.sousTotal.toLocaleString()} FC</span></div>
                  {summary.remiseTotal > 0 && (
                    <div className="flex justify-between text-green-600"><span>Réduction</span><span>-{summary.remiseTotal.toLocaleString()} FC</span></div>
                  )}
                  <div className="flex justify-between text-muted-foreground"><span>Livraison {isExpress && '⚡'}</span><span>{fraisLivraison === 0 ? 'Gratuite' : `${fraisLivraison.toLocaleString()} FC`}</span></div>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-gold-400/20">
                  <span>Total</span>
                  <span className="text-gold-600">
                    {watch('currency') === 'USD' && rate ? `${totalInCurrency.toFixed(2)} USD` : `${totalCDF.toLocaleString()} FC`}
                  </span>
                </div>

                <div className="bg-card rounded-xl p-4 border border-gold-400/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Solde Gercie</p>
                      <p className="text-xl font-bold">{wallet.toLocaleString()} FC</p>
                    </div>
                    <Wallet className="text-gold-500" size={28} />
                  </div>
                  {soldeInsuffisant && (
                    <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                      Solde insuffisant.{' '}
                      <Link href="/profile/recharge" className="underline font-medium hover:text-red-400">Recharger</Link>
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-gold-400/20">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck size={14} className="text-gold-500" /> Paiement 100 % sécurisé
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Truck size={14} className="text-gold-500" /> Livraison estimée : {delaiEstime}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw size={14} className="text-gold-500" /> Retours gratuits sous 7 jours
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  )
}