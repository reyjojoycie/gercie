'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, Gift, Sparkles, Send, CheckCircle2, CreditCard,
  Smartphone, Mail, Copy, Calendar, User, MessageSquare,
  Palette, LayoutGrid, ShoppingBag, Star, Clock,
  Wallet, Percent, ShieldCheck, Info, ExternalLink,
  Image as ImageIcon, ChevronLeft, ChevronRight, X,
  RefreshCcw, AlertCircle, Phone, DollarSign, // ← DollarSign ajouté
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query' // ← useQuery ajouté

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface GiftCardTemplate {
  id: string
  name: string
  gradient: string
  accentColor: string
  preview: string
}

interface GiftCardHistory {
  id: string
  code: string
  montant: number
  beneficiaire: string
  date_achat: string
  statut: 'actif' | 'utilise' | 'expire'
}

/* ------------------------------------------------------------------ */
/*  Schéma de validation                                                */
/* ------------------------------------------------------------------ */
const giftCardSchema = z.object({
  beneficiaire: z.string().min(2, 'Nom requis (minimum 2 caractères)'),
  telephone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  message: z.string().max(200, '200 caractères maximum').optional(),
  dateEnvoi: z.string().optional(),
})

type GiftCardForm = z.infer<typeof giftCardSchema>

/* ------------------------------------------------------------------ */
/*  Templates de cartes cadeaux                                         */
/* ------------------------------------------------------------------ */
const TEMPLATES: GiftCardTemplate[] = [
  {
    id: 'premium',
    name: 'Premium',
    gradient: 'from-purple-600 via-indigo-700 to-blue-800',
    accentColor: 'text-purple-300',
    preview: '🎁',
  },
  {
    id: 'gold',
    name: 'Gold',
    gradient: 'from-amber-400 via-yellow-500 to-orange-600',
    accentColor: 'text-amber-200',
    preview: '🌟',
  },
  {
    id: 'nature',
    name: 'Nature',
    gradient: 'from-emerald-500 via-green-600 to-teal-700',
    accentColor: 'text-emerald-200',
    preview: '🌿',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    gradient: 'from-pink-500 via-rose-600 to-red-700',
    accentColor: 'text-pink-200',
    preview: '🌅',
  },
]

const MONTANTS_PREDEFINIS = [25000, 50000, 100000, 250000]
const MODE_ENVOI_OPTIONS = ['email', 'sms', 'lien'] as const
type ModeEnvoi = typeof MODE_ENVOI_OPTIONS[number]

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function CarteCadeauPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { addItem } = useCart()
  const toast = useToast()

  const [montant, setMontant] = useState<number>(50000)
  const [montantPersonnalise, setMontantPersonnalise] = useState<string>('')
  const [templateActif, setTemplateActif] = useState<string>('premium')
  const [modeEnvoi, setModeEnvoi] = useState<ModeEnvoi>('email')
  const [isSent, setIsSent] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [etape, setEtape] = useState<'montant' | 'personnalisation' | 'recap'>('montant')

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<GiftCardForm>({
    resolver: zodResolver(giftCardSchema),
    defaultValues: {
      beneficiaire: '',
      telephone: '',
      email: '',
      message: '',
      dateEnvoi: '',
    },
  })

  const beneficiaire = watch('beneficiaire')
  const message = watch('message')

  // Calcul du montant final (prédéfini ou personnalisé)
  const montantFinal = useMemo(() => {
    const personnalise = parseInt(montantPersonnalise)
    if (!isNaN(personnalise) && personnalise >= 5000 && personnalise <= 1000000) {
      return personnalise
    }
    return montant
  }, [montant, montantPersonnalise])

  const template = TEMPLATES.find(t => t.id === templateActif) || TEMPLATES[0]

  // Soumission
  const onSubmit = (data: GiftCardForm) => {
    // Ajouter au panier comme un produit spécial
    addItem({
      id: `giftcard-${Date.now()}`,
      nom: `Carte Cadeau Gercie - ${montantFinal.toLocaleString()} FC`,
      prix: montantFinal,
      quantite: 1,
      image: '/images/gift-card-placeholder.png',
      specifications: JSON.stringify({
        type: 'giftcard',
        template: templateActif,
        beneficiaire: data.beneficiaire,
        message: data.message,
        modeEnvoi,
        contact: modeEnvoi === 'sms' ? data.telephone : data.email,
        dateEnvoi: data.dateEnvoi,
      }),
    })
    setIsSent(true)
    toast.addToast({
      type: 'success',
      message: 'Carte cadeau ajoutée au panier !',
    })
  }

  const resetForm = () => {
    setIsSent(false)
    setEtape('montant')
  }

  return (
    <div className="min-h-screen bg-background">
      <ScrollToTop variant="circle" showProgress />

      {/* En‑tête */}
      <section className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border shadow-sm">
        <Container className="py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 rounded-xl hover:bg-gold-400/10 transition-colors">
              <ArrowLeft size={20} className="text-muted-foreground hover:text-gold-500" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold font-serif flex items-center gap-2">
                <Gift size={24} className="text-purple-400" />
                E‑Cartes Cadeaux
              </h1>
              <p className="text-xs text-muted-foreground">
                Offrez la liberté de choisir sur Gercie
              </p>
            </div>
          </div>
          {user && (
            <Button variant="outline-gold" size="sm" onClick={() => setShowHistory(!showHistory)}>
              <Clock size={14} className="mr-1" /> Historique
            </Button>
          )}
        </Container>
      </section>

      <Container className="py-8">
        <AnimatePresence mode="wait">
          {isSent ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-lg mx-auto text-center py-12 space-y-6"
            >
              <div className="h-20 w-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 size={40} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold font-serif">Carte ajoutée au panier !</h2>
              <p className="text-muted-foreground">
                Votre carte cadeau de <strong>{montantFinal.toLocaleString()} FC</strong> pour <strong>{beneficiaire}</strong> est prête. Finalisez votre commande pour l'envoyer.
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="luxe" onClick={() => router.push('/panier')}>
                  <ShoppingBag size={16} className="mr-1" /> Voir le panier
                </Button>
                <Button variant="outline-gold" onClick={resetForm}>
                  Créer une autre carte
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid lg:grid-cols-2 gap-10"
            >
              {/* Aperçu de la carte */}
              <div className="flex flex-col items-center justify-center space-y-6">
                <div className="w-full max-w-md aspect-[1.586/1] rounded-2xl p-6 relative overflow-hidden bg-gradient-to-br border shadow-2xl group"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))`,
                  }}
                >
                  <div className={cn(
                    'absolute inset-0 rounded-2xl p-6 flex flex-col justify-between',
                    template.gradient
                  )}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />

                    <div className="flex justify-between items-start relative z-10">
                      <div>
                        <span className="text-[10px] font-bold tracking-widest uppercase text-white/70">Premium Voucher</span>
                        <h2 className="text-xl font-black tracking-tight text-white mt-1">GERCIE</h2>
                      </div>
                      <Sparkles className="h-5 w-5 text-white/70 animate-spin-slow" />
                    </div>

                    <div className="my-auto relative z-10">
                      <span className="block text-[10px] text-white/60 font-bold uppercase tracking-wider">Solde de la Carte</span>
                      <span className="text-3xl font-black text-white tracking-tight">
                        {montantFinal.toLocaleString()} <span className="text-sm text-white/70 font-bold">FC</span>
                      </span>
                      {message && (
                        <p className="text-xs text-white/50 mt-2 italic">"{message}"</p>
                      )}
                    </div>

                    <div className="flex justify-between items-end border-t border-white/10 pt-4 relative z-10">
                      <div>
                        <span className="block text-[8px] text-white/50 uppercase font-bold tracking-wide">Bénéficiaire</span>
                        <span className="text-xs font-bold text-white/80 truncate max-w-[180px] block">
                          {beneficiaire || 'Nom complet'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[8px] text-white/50 uppercase font-bold tracking-wide">Mode</span>
                        <span className="text-[10px] font-mono text-white/70 font-bold tracking-wider">
                          {modeEnvoi === 'email' ? '📧 Email' : modeEnvoi === 'sms' ? '📱 SMS' : '🔗 Lien'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sélecteur de template */}
                <div className="w-full max-w-md">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 block">
                    Design de la carte
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTemplateActif(t.id)}
                        className={cn(
                          'p-3 rounded-xl border-2 transition-all text-center',
                          templateActif === t.id
                            ? 'border-gold-400 bg-gold-400/10 shadow-sm'
                            : 'border-border hover:border-gold-400/50'
                        )}
                      >
                        <span className="text-2xl block mb-1">{t.preview}</span>
                        <span className="text-[10px] font-medium text-muted-foreground">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Formulaire */}
              <div className="bg-card border border-border p-8 rounded-2xl shadow-soft">
                {/* Étapes */}
                <div className="flex items-center gap-2 mb-8">
                  {(['montant', 'personnalisation', 'recap'] as const).map((step, idx) => (
                    <button
                      key={step}
                      onClick={() => setEtape(step)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition',
                        etape === step
                          ? 'bg-gold-500 text-white shadow-gold'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                        {idx + 1}
                      </span>
                      {step === 'montant' ? 'Montant' : step === 'personnalisation' ? 'Personnaliser' : 'Récap'}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {/* Étape 1 : Montant */}
                  {etape === 'montant' && (
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      <label className="block text-sm font-semibold text-foreground mb-3">
                        Choisissez un montant
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {MONTANTS_PREDEFINIS.map(val => (
                          <button
                            type="button"
                            key={val}
                            onClick={() => { setMontant(val); setMontantPersonnalise('') }}
                            className={cn(
                              'py-4 px-4 text-sm font-bold rounded-xl border-2 transition-all',
                              montant === val && !montantPersonnalise
                                ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20'
                                : 'bg-muted border-border text-muted-foreground hover:border-purple-400'
                            )}
                          >
                            {val.toLocaleString()} FC
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-card px-2 text-muted-foreground">ou</span>
                        </div>
                      </div>
                      <Input
                        label="Montant personnalisé (FC)"
                        type="number"
                        min="5000"
                        max="1000000"
                        placeholder="Ex: 75000"
                        value={montantPersonnalise}
                        onChange={e => { setMontantPersonnalise(e.target.value); if (e.target.value) setMontant(0) }}
                        leftIcon={<DollarSign size={16} className="text-muted-foreground" />}
                      />
                      {montantPersonnalise && (parseInt(montantPersonnalise) < 5000 || parseInt(montantPersonnalise) > 1000000) && (
                        <p className="text-xs text-red-500">Le montant doit être compris entre 5 000 et 1 000 000 FC</p>
                      )}
                      <div className="flex justify-end">
                        <Button type="button" variant="luxe" onClick={() => setEtape('personnalisation')}>
                          Continuer
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* Étape 2 : Personnalisation */}
                  {etape === 'personnalisation' && (
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      <Input
                        label="Nom du bénéficiaire *"
                        {...register('beneficiaire')}
                        error={errors.beneficiaire?.message}
                        placeholder="Ex: Marie K."
                        leftIcon={<User size={16} className="text-muted-foreground" />}
                      />

                      <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">Mode d'envoi</label>
                        <div className="grid grid-cols-3 gap-2">
                          {MODE_ENVOI_OPTIONS.map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setModeEnvoi(mode)}
                              className={cn(
                                'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all',
                                modeEnvoi === mode
                                  ? 'border-gold-400 bg-gold-400/10 text-gold-600'
                                  : 'border-border text-muted-foreground hover:border-gold-400/50'
                              )}
                            >
                              {mode === 'email' ? <Mail size={20} /> : mode === 'sms' ? <Smartphone size={20} /> : <Copy size={20} />}
                              <span className="text-xs font-medium">
                                {mode === 'email' ? 'Email' : mode === 'sms' ? 'SMS' : 'Lien'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {modeEnvoi === 'email' && (
                        <Input
                          label="Email du bénéficiaire"
                          type="email"
                          {...register('email')}
                          error={errors.email?.message}
                          placeholder="marie@email.com"
                        />
                      )}
                      {modeEnvoi === 'sms' && (
                        <Input
                          label="Téléphone du bénéficiaire"
                          {...register('telephone')}
                          placeholder="+243..."
                        />
                      )}

                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">
                          Message personnel (optionnel)
                        </label>
                        <textarea
                          {...register('message')}
                          rows={3}
                          maxLength={200}
                          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-gold-500/30"
                          placeholder="Joyeux anniversaire ! Profite bien de ce cadeau..."
                        />
                        <p className="text-xs text-muted-foreground mt-1">{message?.length || 0}/200</p>
                      </div>

                      <Input
                        label="Date d'envoi programmée (optionnel)"
                        type="datetime-local"
                        {...register('dateEnvoi')}
                      />

                      <div className="flex justify-between">
                        <Button type="button" variant="outline-gold" onClick={() => setEtape('montant')}>
                          Retour
                        </Button>
                        <Button type="button" variant="luxe" onClick={() => setEtape('recap')}>
                          Continuer
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* Étape 3 : Récapitulatif */}
                  {etape === 'recap' && (
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      <h3 className="font-semibold text-lg">Récapitulatif de votre carte</h3>
                      <div className="bg-muted rounded-xl p-4 space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Montant</span>
                          <span className="font-bold text-purple-600">{montantFinal.toLocaleString()} FC</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bénéficiaire</span>
                          <span className="font-medium">{beneficiaire || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Mode d'envoi</span>
                          <span className="font-medium">{modeEnvoi === 'email' ? 'Email' : modeEnvoi === 'sms' ? 'SMS' : 'Lien'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Design</span>
                          <span className="font-medium">{template.name}</span>
                        </div>
                        {message && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Message</span>
                            <span className="italic text-xs max-w-[200px] truncate">"{message}"</span>
                          </div>
                        )}
                      </div>

                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <Info size={16} />
                        La carte sera ajoutée à votre panier. Vous pourrez la payer avec votre solde Gercie ou par mobile money.
                      </div>

                      <div className="flex justify-between pt-2">
                        <Button type="button" variant="outline-gold" onClick={() => setEtape('personnalisation')}>
                          Retour
                        </Button>
                        <Button type="submit" variant="luxe" className="shadow-gold">
                          <ShoppingBag size={16} className="mr-1" /> Ajouter au panier
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Historique (si connecté) */}
        {showHistory && user && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-12"
          >
            <h2 className="text-xl font-bold font-serif mb-4">Vos cartes cadeaux</h2>
            <GiftCardHistory />
          </motion.div>
        )}
      </Container>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Composant historique (fetch API)                                    */
/* ------------------------------------------------------------------ */
function GiftCardHistory() {
  const { data: history, isLoading } = useQuery<GiftCardHistory[]>({
    queryKey: ['giftcard-history'],
    queryFn: async () => {
      const res = await fetch('/api/user/giftcards')
      if (!res.ok) return []
      return res.json()
    },
  })

  if (isLoading) return <Spinner />
  if (!history?.length) return <p className="text-muted-foreground text-center py-8">Aucune carte cadeau achetée.</p>

  return (
    <div className="space-y-3">
      {history.map(card => (
        <div key={card.id} className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
          <div>
            <p className="font-medium">{card.code}</p>
            <p className="text-xs text-muted-foreground">Pour {card.beneficiaire} · {new Date(card.date_achat).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold text-gold-600">{card.montant.toLocaleString()} FC</span>
            <Badge variant={card.statut === 'actif' ? 'accent' : card.statut === 'utilise' ? 'neutral' : 'danger'}>
              {card.statut === 'actif' ? 'Active' : card.statut === 'utilise' ? 'Utilisée' : 'Expirée'}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}