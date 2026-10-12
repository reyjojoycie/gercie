'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { Confetti } from '@/components/Confetti'
import { triggerConfetti } from '@/lib/confetti'
import PaymentMethodSelector, { PaymentMethod } from '@/components/paiement/PaymentMethodSelector'
import {
  ArrowLeft, Wallet, CreditCard, Smartphone, AlertTriangle,
  CheckCircle2, ShieldCheck, Clock, Info, Lock
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Schémas de validation dynamiques                                    */
/* ------------------------------------------------------------------ */
const baseMobileSchema = z.object({
  phone: z.string().regex(/^0[0-9]{9}$/, 'Numéro invalide (format : 08xxxxxxxx)'),
  pin: z.string().length(4, 'PIN à 4 chiffres').optional(),
})

const cardSchema = z.object({
  cardNumber: z.string()
    .min(16, 'Numéro de carte invalide')
    .max(19, 'Numéro de carte invalide')
    .regex(/^\d[\d\s]*$/, 'Format invalide'),
  expiry: z.string()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Format MM/AA requis'),
  cvv: z.string()
    .length(3, 'CVV à 3 chiffres')
    .regex(/^\d{3}$/, 'CVV invalide'),
})

type MobileFormData = z.infer<typeof baseMobileSchema>
type CardFormData = z.infer<typeof cardSchema>

interface OrderSummary {
  id: string
  numero: string
  total: number
  statut: string
  type_livraison: string
  articles: Array<{
    nom: string
    quantite: number
    prix_unitaire: number
    specifications?: string
  }>
}

export default function PaiementPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { items, summary, activePromo, total } = useCart()
  const { rate, loading: rateLoading } = useExchangeRate()
  const toast = useToast()

  const commandeId = searchParams.get('id')
  const currency = (searchParams.get('currency') || 'CDF') as 'CDF' | 'USD'

  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [loadingOrder, setLoadingOrder] = useState(true)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [walletBalance, setWalletBalance] = useState<number>(0)
  const [loadingWallet, setLoadingWallet] = useState(true)

  const [timeLeft, setTimeLeft] = useState(15 * 60)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Formulaires
  const mobileForm = useForm<MobileFormData>({
    resolver: zodResolver(baseMobileSchema),
    defaultValues: { phone: '', pin: '' },
  })

  const cardForm = useForm<CardFormData>({
    resolver: zodResolver(cardSchema),
    defaultValues: { cardNumber: '', expiry: '', cvv: '' },
  })

  // Charger les détails de la commande
  useEffect(() => {
    if (!commandeId || !user) return
    setLoadingOrder(true)
    fetch(`/api/commandes/${commandeId}`)
      .then(res => res.json())
      .then(data => {
        if (data && (data.id || Array.isArray(data.articles))) setOrder(data)
        else setError('Commande introuvable ou non initialisée.')
      })
      .catch(() => setError('Erreur réseau lors du chargement de la commande.'))
      .finally(() => setLoadingOrder(false))
  }, [commandeId, user])

  // Solde du wallet
  useEffect(() => {
    if (!user) return
    fetch('/api/user/wallet')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setWalletBalance(Number(d.solde_achat) || 0))
      .catch(() => setWalletBalance(0))
      .finally(() => setLoadingWallet(false))
  }, [user])

  // Compte à rebours
  useEffect(() => {
    if (loadingOrder || success) return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          router.push('/panier')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [loadingOrder, success, router])

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  // Calculs financiers
  const prixTotal = Number(order?.total ?? total)
  const fraisLivraison = Number(summary.fraisLivraison || 0)
  const totalAvecLivraison = prixTotal + fraisLivraison
  const amountToPost = currency === 'USD' && rate ? totalAvecLivraison / rate : totalAvecLivraison
  const totalInCurrency = currency === 'USD' && rate ? totalAvecLivraison / rate : totalAvecLivraison
  const soldeInsuffisant = walletBalance < totalAvecLivraison

  // Exécution du paiement
  const executePaymentRequest = async (payload: any) => {
    setProcessing(true)
    setError('')
    try {
      const res = await fetch('/api/paiement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur transaction.')
      setSuccess(true)
      triggerConfetti({ duration: 4000, spread: 80, origin: { x: 0.5, y: 0.5 } })
      toast.addToast({ type: 'success', message: data.message || 'Opération réussie !' })
      setTimeout(() => router.push(`/commande/confirmation?id=${commandeId}`), 2200)
    } catch (err: any) {
      setError(err.message)
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setProcessing(false)
    }
  }

  const handleSubmitPayment = () => {
    if (!selectedMethod || !commandeId) return

    const basePayload = {
      commande_id: commandeId,
      method: selectedMethod.code,
      amount: Number(amountToPost),
      currency: currency,
    }

    if (selectedMethod.type === 'wallet') {
      executePaymentRequest(basePayload)
    } else if (selectedMethod.type === 'mobile_money') {
      mobileForm.handleSubmit((data) => {
        executePaymentRequest({
          ...basePayload,
          phone: data.phone.trim().replace(/\s+/g, ''),
          pin: data.pin || undefined,
        })
      })()
    } else if (selectedMethod.type === 'card') {
      cardForm.handleSubmit((data) => {
        executePaymentRequest({
          ...basePayload,
          card: {
            number: data.cardNumber.replace(/\s/g, ''),
            expiry: data.expiry,
            cvv: data.cvv,
          },
        })
      })()
    }
  }

  // Réinitialiser les formulaires lors du changement de méthode
  useEffect(() => {
    mobileForm.reset({ phone: '', pin: '' })
    cardForm.reset({ cardNumber: '', expiry: '', cvv: '' })
  }, [selectedMethod?.code])

  if (authLoading || loadingOrder || rateLoading || loadingWallet) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="xl" variant="premium" label="Sécurisation de la passerelle..." />
      </div>
    )
  }

  if (!user) {
    router.push(`/login?redirect=/commande/paiement?id=${commandeId}`)
    return null
  }

  if (error && !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md text-center p-8 border-gold-400/20 bg-card/70 backdrop-blur-xl">
          <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-muted-foreground mb-4">{error}</p>
          <Link href="/panier"><Button variant="luxe">Retour au panier</Button></Link>
        </Card>
      </div>
    )
  }

  const articles = order?.articles || items.map(i => ({ nom: i.nom, quantite: i.quantite, prix_unitaire: i.prix }))

  return (
    <div className="min-h-screen bg-background pb-16">
      <Confetti active={success} duration={4} count={150} />
      <Container className="py-8 md:py-12 max-w-4xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <Link href="/panier" className="inline-flex items-center gap-2 text-muted-foreground hover:text-gold-500 text-sm">
            <ArrowLeft size={16} /> Retour au Panier
          </Link>
          <div className="flex items-center gap-4">
            <div className={cn("flex items-center gap-2 text-sm font-mono px-3 py-1.5 rounded-md bg-card border border-border", timeLeft < 120 && "text-red-500 border-red-500/30 animate-pulse")}>
              <Clock size={16} />
              Session de paiement : {formatTime(timeLeft)}
            </div>
            <Tooltip content="Vos articles sont réservés le temps de finaliser la transaction.">
              <Info size={16} className="text-muted-foreground cursor-help" />
            </Tooltip>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl font-extrabold text-foreground font-serif mb-2">Paiement Sécurisé</h1>
          <p className="text-muted-foreground mb-8">
            Finalisez votre commande sur l'écosystème Gercie
            {currency === 'USD' && rate && ` · Taux actuel : 1 USD = ${rate.toLocaleString()} CDF`}
          </p>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard size={20} className="text-gold-500" />
                    Modes de paiement disponibles
                  </CardTitle>
                  <CardDescription>
                    Sélectionnez votre canal financier de règlement
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PaymentMethodSelector
                    selected={selectedMethod}
                    onSelect={setSelectedMethod}
                  />
                </CardContent>
              </Card>

              {/* Instructions spécifiques à la méthode */}
              {selectedMethod?.instructions && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-sm"
                >
                  <Info size={16} className="inline mr-2" />
                  {selectedMethod.instructions}
                </motion.div>
              )}

              {/* Formulaire Mobile Money */}
              <AnimatePresence mode="wait">
                {selectedMethod?.type === 'mobile_money' && (
                  <motion.div key="mobile-form" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <Card variant="glass" className="border-gold-400/20">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Smartphone size={18} className="text-gold-500" />
                          Coordonnées {selectedMethod.nom}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Controller
                          name="phone"
                          control={mobileForm.control}
                          render={({ field }) => (
                            <Input
                              label="Numéro de téléphone lié au compte"
                              type="tel"
                              placeholder="0812345678"
                              {...field}
                              error={mobileForm.formState.errors.phone?.message}
                              variant="glass"
                            />
                          )}
                        />
                        <Controller
                          name="pin"
                          control={mobileForm.control}
                          render={({ field }) => (
                            <Input
                              label="Code PIN (optionnel, si requis par l'opérateur)"
                              type="password"
                              placeholder="••••"
                              maxLength={4}
                              {...field}
                              variant="glass"
                            />
                          )}
                        />
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Formulaire Carte Bancaire */}
              <AnimatePresence mode="wait">
                {selectedMethod?.type === 'card' && (
                  <motion.div key="card-form" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <Card variant="glass" className="border-gold-400/20">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CreditCard size={18} className="text-gold-500" />
                          Détails de la carte bancaire
                        </CardTitle>
                        <CardDescription>Vos informations sont chiffrées et sécurisées</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Controller
                          name="cardNumber"
                          control={cardForm.control}
                          render={({ field }) => (
                            <Input
                              label="Numéro de carte"
                              type="text"
                              placeholder="1234 5678 9012 3456"
                              {...field}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\s/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
                                field.onChange(value)
                              }}
                              error={cardForm.formState.errors.cardNumber?.message}
                              variant="glass"
                            />
                          )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <Controller
                            name="expiry"
                            control={cardForm.control}
                            render={({ field }) => (
                              <Input
                                label="Date d'expiration"
                                type="text"
                                placeholder="MM/AA"
                                {...field}
                                onChange={(e) => {
                                  let value = e.target.value.replace(/\D/g, '').slice(0, 4)
                                  if (value.length >= 2) value = value.slice(0, 2) + '/' + value.slice(2)
                                  field.onChange(value)
                                }}
                                error={cardForm.formState.errors.expiry?.message}
                                variant="glass"
                              />
                            )}
                          />
                          <Controller
                            name="cvv"
                            control={cardForm.control}
                            render={({ field }) => (
                              <Input
                                label="CVV"
                                type="password"
                                placeholder="123"
                                maxLength={3}
                                {...field}
                                error={cardForm.formState.errors.cvv?.message}
                                variant="glass"
                              />
                            )}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 text-sm flex items-center gap-2"
                >
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </motion.div>
              )}

              {!success ? (
                <Button
                  variant="luxe"
                  fullWidth
                  size="xl"
                  loading={processing}
                  disabled={
                    !selectedMethod ||
                    (selectedMethod.type === 'wallet' && soldeInsuffisant) ||
                    processing
                  }
                  onClick={handleSubmitPayment}
                  className="shadow-gold hover:shadow-glow-gold transition-all duration-300"
                >
                  {processing
                    ? 'Exécution de la transaction...'
                    : `Payer ${totalInCurrency.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`}
                </Button>
              ) : (
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-300 dark:border-green-800"
                >
                  <CheckCircle2 size={48} className="mx-auto text-green-500 mb-2" />
                  <h2 className="text-xl font-bold text-green-700 dark:text-green-300">Transaction Approuvée !</h2>
                  <p className="text-green-600 dark:text-green-400">Préparation de votre reçu de confirmation...</p>
                </motion.div>
              )}
            </div>

            {/* Sidebar récapitulatif */}
            <div className="lg:col-span-1">
              <Card className="sticky top-24 border-gold-400/20 bg-card/70 backdrop-blur-xl shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ShieldCheck size={20} className="text-gold-500" /> Facture abrégée
                  </CardTitle>
                  {order?.numero && <CardDescription>Commande n° {order.numero}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {articles.map((article: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-foreground">{article.nom}</p>
                          <p className="text-xs text-muted-foreground">Quantité : {article.quantite}</p>
                        </div>
                        <span className="font-medium text-foreground whitespace-nowrap">
                          {(Number(article.prix_unitaire) * Number(article.quantite)).toLocaleString()} FC
                        </span>
                      </div>
                    ))}
                  </div>
                  <hr className="border-gold-400/20" />
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Sous-total</span>
                      <span>{prixTotal.toLocaleString()} FC</span>
                    </div>
                    {fraisLivraison > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Frais de livraison</span>
                        <span>{fraisLivraison.toLocaleString()} FC</span>
                      </div>
                    )}
                    {activePromo && (
                      <div className="flex justify-between text-green-600">
                        <span>Code Réduction ({activePromo.code})</span>
                        <span>-{summary.remiseTotal.toLocaleString()} FC</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t border-gold-400/20">
                    <span>Net à payer</span>
                    <span className="text-gold-600">
                      {currency === 'USD' && rate
                        ? `${totalInCurrency.toFixed(2)} USD`
                        : `${totalAvecLivraison.toLocaleString()} FC`}
                    </span>
                  </div>

                  <div className="bg-card rounded-xl p-4 border border-gold-400/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Votre solde Gercie</p>
                        <p className="text-xl font-bold text-foreground">{walletBalance.toLocaleString()} FC</p>
                      </div>
                      <Wallet className="text-gold-500" size={28} />
                    </div>
                    {soldeInsuffisant && selectedMethod?.code === 'wallet' && (
                      <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                        Fonds insuffisants.{' '}
                        <Link href="/profile/recharge" className="underline font-medium text-gold-500 hover:text-gold-400">Recharger</Link>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-gold-400/20">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Lock size={14} className="text-gold-400" /> Flux monétique chiffré SSL End-to-End
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </Container>
      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}