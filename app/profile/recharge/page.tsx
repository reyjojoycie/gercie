'use client'

import { useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Wallet, Phone, ShieldCheck, Sparkles, History, ChevronLeft
} from 'lucide-react'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PaymentMethodSelector, { PaymentMethod } from '@/components/paiement/PaymentMethodSelector'

// Schémas de validation par type
const mobileSchema = z.object({
  phone: z.string().regex(/^0[0-9]{9}$/, 'Numéro invalide (ex: 0812345678)'),
  pin: z.string().length(4, 'PIN à 4 chiffres').optional(),
})

const cardSchema = z.object({
  cardNumber: z.string().min(16, 'Numéro de carte invalide').max(19),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Format MM/AA'),
  cvv: z.string().length(3, 'CVV à 3 chiffres'),
})

const amountPresets = {
  CDF: [1000, 5000, 10000, 25000, 50000],
  USD: [5, 10, 25, 50, 100],
}

export default function RechargePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { rate, loading: rateLoading } = useExchangeRate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [montant, setMontant] = useState<number>(1000)
  const [currency, setCurrency] = useState<'CDF' | 'USD'>('CDF')
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)

  // Charger tous les moyens actifs
  const { data: allMethods = [], isLoading: methodsLoading } = useQuery<PaymentMethod[]>({
    queryKey: ['active-payment-methods'],
    queryFn: () => fetch('/api/paiement/methodes').then(r => r.json()),
    staleTime: 60_000,
  })

  // Exclure le wallet Gercie
  const rechargeMethods = useMemo(() => allMethods.filter(m => m.type !== 'wallet'), [allMethods])

  // Formulaires spécifiques
  const mobileForm = useForm({
    resolver: zodResolver(mobileSchema),
    defaultValues: { phone: '', pin: '' },
  })
  const cardForm = useForm({
    resolver: zodResolver(cardSchema),
    defaultValues: { cardNumber: '', expiry: '', cvv: '' },
  })

  // Solde
  const { data: wallet } = useQuery({
    queryKey: ['wallet', user?.id],
    queryFn: () => fetch('/api/user/wallet').then(r => r.json()),
    enabled: !!user,
  })
  const solde = wallet?.solde_achat ?? 0
  const soldeUSD = rate ? solde / rate : null

  // Historique
  const { data: recentRecharges = [] } = useQuery({
    queryKey: ['recent-recharges', user?.id],
    queryFn: () => fetch('/api/user/transactions?type=recharge&limit=5').then(r => r.json()).then(d => d.data || []),
    enabled: !!user,
  })

  const montantCDF = currency === 'USD' ? Math.round(montant * (rate || 2500)) : montant
  const montantLabel = currency === 'USD' ? `${montant} USD` : `${montant.toLocaleString()} CDF`
  const minAmount = currency === 'USD' ? 0.5 : 100
  const isBelowMinimum = montant < minAmount

  const onSubmit = () => {
    if (isBelowMinimum) {
      toast.addToast({ type: 'error', message: `Minimum ${minAmount} ${currency}` })
      return
    }
    if (!selectedMethod) {
      toast.addToast({ type: 'error', message: 'Veuillez choisir un mode de paiement' })
      return
    }
    setShowConfirm(true)
  }

  const confirmRecharge = async () => {
    setSubmitting(true)
    try {
      const basePayload = {
        montant: currency === 'USD' ? montant : montantCDF,
        currency,
        method: selectedMethod!.code,
      }

      let extraFields = {}
      if (selectedMethod!.type === 'mobile_money') {
        const data = mobileForm.getValues()
        extraFields = {
          phone: data.phone.trim().replace(/\s+/g, ''),
          pin: data.pin || undefined,
        }
      } else if (selectedMethod!.type === 'card') {
        const data = cardForm.getValues()
        extraFields = {
          card: {
            number: data.cardNumber.replace(/\s/g, ''),
            expiry: data.expiry,
            cvv: data.cvv,
          },
        }
      }

      const res = await fetch('/api/user/recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...basePayload, ...extraFields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur lors du rechargement')
      toast.addToast({ type: 'success', message: `Rechargement de ${montantLabel} effectué !` })
      queryClient.invalidateQueries({ queryKey: ['wallet', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['recent-recharges', user?.id] })
      setShowConfirm(false)
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  // Réinitialiser les sous-formulaires lors du changement de méthode
  const handleMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method)
    mobileForm.reset()
    cardForm.reset()
  }

  if (authLoading || rateLoading || methodsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <Spinner size="xl" variant="premium" label="Chargement..." />
      </div>
    )
  }

  if (!user) {
    router.push('/login?redirect=/profile/recharge')
    return null
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-20">
      <Container size="small" className="max-w-xl py-8">
        <Link href="/profile/wallet" className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 mb-6 transition-colors">
          <ChevronLeft size={18} /> Retour au portefeuille
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif mb-1">Recharger mon compte</h1>
            <p className="text-neutral-500 dark:text-neutral-400">Ajoutez des fonds à votre portefeuille achat</p>
          </div>

          {/* Solde actuel */}
          <Card variant="glass" className="border-gold-400/20">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-gold-100 dark:bg-gold-900/30">
                  <Wallet size={20} className="text-gold-600 dark:text-gold-400" />
                </div>
                <div>
                  <p className="text-sm text-neutral-500">Solde achat</p>
                  <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                    {solde.toLocaleString()} FC
                    {soldeUSD && <span className="text-sm text-neutral-400 ml-1">≈ {soldeUSD.toFixed(2)} USD</span>}
                  </p>
                </div>
              </div>
              {rate && <div className="text-xs text-neutral-400">1 USD = {rate.toLocaleString()} CDF</div>}
            </CardContent>
          </Card>

          {/* Formulaire */}
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles size={18} className="text-gold-500" />Informations de recharge</CardTitle>
              <CardDescription>Choisissez le montant et le mode de paiement externe</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {/* Devise */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Devise</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setCurrency('CDF'); setMontant(1000) }}
                      className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border-2', currency === 'CDF' ? 'border-gold-400 bg-gold-50/50 shadow-gold' : 'border-neutral-200 dark:border-neutral-700')}
                    >CDF (Francs congolais)</button>
                    <button
                      type="button"
                      onClick={() => { setCurrency('USD'); setMontant(10) }}
                      className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border-2', currency === 'USD' ? 'border-gold-400 bg-gold-50/50 shadow-gold' : 'border-neutral-200 dark:border-neutral-700')}
                    >USD (Dollars américains)</button>
                  </div>
                </div>

                {/* Montant */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Montant</label>
                  <Input
                    type="number"
                    step={currency === 'USD' ? '0.01' : '100'}
                    value={montant}
                    onChange={e => setMontant(parseFloat(e.target.value) || 0)}
                    min={minAmount}
                    suffix={currency}
                    variant="glass"
                    error={isBelowMinimum ? `Minimum ${minAmount} ${currency}` : ''}
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {amountPresets[currency].map(amt => (
                      <button key={amt} type="button" onClick={() => setMontant(amt)}
                        className={cn('text-xs px-3 py-1.5 rounded-full border', montant === amt ? 'bg-gold-400/20 border-gold-400/60 text-gold-600' : 'bg-white/50 dark:bg-midnight-800/50 border-gold-400/30')}
                      >{amt.toLocaleString()} {currency}</button>
                    ))}
                  </div>
                  {rate && currency === 'USD' && <p className="text-xs text-neutral-400 mt-2">≈ {Math.round(montant * rate).toLocaleString()} CDF</p>}
                </div>

                {/* Mode de paiement */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Mode de paiement</label>
                  <PaymentMethodSelector
                    selected={selectedMethod}
                    onSelect={handleMethodSelect}
                    methods={rechargeMethods}
                  />
                </div>

                {/* Instructions */}
                {selectedMethod?.instructions && (
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
                    {selectedMethod.instructions}
                  </div>
                )}

                {/* Formulaire Mobile Money */}
                <AnimatePresence>
                  {selectedMethod?.type === 'mobile_money' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-4">
                      <Input
                        label="Numéro de téléphone"
                        type="tel"
                        placeholder="0812345678"
                        {...mobileForm.register('phone')}
                        error={mobileForm.formState.errors.phone?.message}
                        variant="glass"
                      />
                      <Input
                        label="Code PIN (optionnel)"
                        type="password"
                        placeholder="••••"
                        maxLength={4}
                        {...mobileForm.register('pin')}
                        variant="glass"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Formulaire Carte Bancaire */}
                <AnimatePresence>
                  {selectedMethod?.type === 'card' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-4">
                      <Input
                        label="Numéro de carte"
                        type="text"
                        placeholder="1234 5678 9012 3456"
                        {...cardForm.register('cardNumber')}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\s/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
                          cardForm.setValue('cardNumber', val)
                        }}
                        error={cardForm.formState.errors.cardNumber?.message}
                        variant="glass"
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="Expiration (MM/AA)"
                          type="text"
                          placeholder="MM/AA"
                          {...cardForm.register('expiry')}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, '').slice(0, 4)
                            if (val.length >= 2) val = val.slice(0, 2) + '/' + val.slice(2)
                            cardForm.setValue('expiry', val)
                          }}
                          error={cardForm.formState.errors.expiry?.message}
                          variant="glass"
                        />
                        <Input
                          label="CVV"
                          type="password"
                          placeholder="123"
                          maxLength={3}
                          {...cardForm.register('cvv')}
                          error={cardForm.formState.errors.cvv?.message}
                          variant="glass"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  variant="luxe"
                  fullWidth
                  size="lg"
                  onClick={onSubmit}
                  className="shadow-gold hover:shadow-glow-gold animate-glow-pulse"
                >
                  Recharger {montantLabel}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Historique */}
          {recentRecharges.length > 0 && (
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><History size={18} className="text-gold-500" />Dernières recharges</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {recentRecharges.slice(0, 5).map((tx: any) => (
                    <li key={tx.id} className="flex justify-between text-sm">
                      <div>
                        <p className="font-medium">{tx.description}</p>
                        <p className="text-xs text-neutral-400">{new Date(tx.created_at).toLocaleString()}</p>
                      </div>
                      <span className="font-medium text-green-600">+{tx.montant.toLocaleString()} FC</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Modal de confirmation */}
        <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="Confirmer le rechargement" size="sm" accent="gold">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-gold-100 dark:bg-gold-900/30 border border-gold-400/30 flex items-center justify-center">
              <ShieldCheck size={28} className="text-gold-600 dark:text-gold-400" />
            </div>
            <div>
              <p className="text-neutral-700 dark:text-neutral-300">Vous allez recharger <strong>{montantLabel}</strong></p>
              <p className="text-sm text-neutral-500">via <strong>{selectedMethod?.nom}</strong></p>
              {selectedMethod?.type === 'mobile_money' && <p className="text-sm text-neutral-500">N° : <strong>{mobileForm.getValues('phone') || '—'}</strong></p>}
              {rate && currency === 'USD' && <p className="text-xs text-neutral-400 mt-1">Taux : 1 USD = {rate.toLocaleString()} CDF</p>}
            </div>
            <div className="flex gap-3 mt-4">
              <Button variant="luxe" fullWidth onClick={confirmRecharge} loading={submitting}>Confirmer</Button>
              <Button variant="outline-gold" fullWidth onClick={() => setShowConfirm(false)}>Annuler</Button>
            </div>
          </div>
        </Modal>
      </Container>
      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}