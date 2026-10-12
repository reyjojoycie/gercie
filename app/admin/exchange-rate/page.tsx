// app/admin/exchange-rate/page.tsx
'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import {
  TrendingUp, Clock, ArrowRightLeft, ShieldCheck, DollarSign, Sparkles,
  RefreshCcw, ArrowUp, ArrowDown, History, Download, Copy, Check,
  ChevronLeft, Eye, ExternalLink, AlertCircle, BarChart3, Zap, PenLine,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts'

/* ------------------------------------------------------------------ */
/*  Schéma Zod pour mise à jour                                        */
/* ------------------------------------------------------------------ */
const rateSchema = z.object({
  rate: z.coerce
    .number({ message: 'Veuillez entrer un nombre valide' })
    .positive('Le taux doit être supérieur à 0')
    .min(100, 'Le taux minimum est de 100 CDF')
    .max(100000, 'Le taux semble trop élevé (max 100 000)'),
  comment: z.string().max(200, '200 caractères max').optional(),
})

type RateForm = z.infer<typeof rateSchema>

/* ------------------------------------------------------------------ */
/*  Types pour l'historique                                            */
/* ------------------------------------------------------------------ */
interface RateHistoryEntry {
  id: number
  rate: number
  comment: string | null
  created_at: string
  user_email?: string
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function ExchangeRateAdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [usdAmount, setUsdAmount] = useState('')
  const [cdfAmount, setCdfAmount] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RateForm>({
    resolver: zodResolver(rateSchema),
    defaultValues: { rate: undefined, comment: '' },
  })

  const rateValue = watch('rate')

  // ---- Taux actuel ----
  const {
    data: rateData,
    isLoading: loadingRate,
    isError: rateError,
    error: fetchError,
  } = useQuery<{ rate: number; updated_at?: string; variation?: number }>({
    queryKey: ['admin-exchange-rate'],
    queryFn: async () => {
      const res = await fetch('/api/admin/exchange-rate')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur chargement taux')
      return json
    },
    staleTime: 60_000,
    enabled: !!user,
    onSuccess: (data) => {
      // Pré-remplir le formulaire seulement si le champ est vide
      if (data?.rate && !rateValue) {
        setValue('rate', data.rate)
      }
    },
  })

  const currentRate = rateData?.rate ?? 0
  const variation = rateData?.variation ?? 0 // pourcentage simulé

  // ---- Historique des taux ----
  const {
    data: historyData,
    isLoading: loadingHistory,
  } = useQuery<RateHistoryEntry[]>({
    queryKey: ['admin-exchange-rate-history'],
    queryFn: async () => {
      const res = await fetch('/api/admin/exchange-rate/history?limit=30')
      if (!res.ok) return []
      return res.json()
    },
    enabled: showHistory && !!user,
    staleTime: 120_000,
  })

  // ---- Mutation de mise à jour ----
  const updateMutation = useMutation({
    mutationFn: async (values: RateForm) => {
      const res = await fetch('/api/admin/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: values.rate, comment: values.comment }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur mise à jour')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-exchange-rate'] })
      queryClient.invalidateQueries({ queryKey: ['admin-exchange-rate-history'] })
      toast.success('Taux mis à jour avec succès', { icon: '✨' })
      setShowConfirmModal(false)
      reset({ rate: undefined, comment: '' })
    },
    onError: (err: any) => toast.error(err.message),
  })

  // ---- Convertisseur ----
  const convertedUsdToCdf = useMemo(() => {
    const usd = parseFloat(usdAmount)
    if (isNaN(usd) || currentRate <= 0) return null
    return usd * currentRate
  }, [usdAmount, currentRate])

  const convertedCdfToUsd = useMemo(() => {
    const cdf = parseFloat(cdfAmount)
    if (isNaN(cdf) || currentRate <= 0) return null
    return cdf / currentRate
  }, [cdfAmount, currentRate])

  const swapCurrencies = () => {
    if (usdAmount || cdfAmount) {
      setUsdAmount(cdfAmount ? convertedCdfToUsd?.toFixed(2) || '' : '')
      setCdfAmount(usdAmount ? convertedUsdToCdf?.toFixed(0) || '' : '')
    }
  }

  const handleCopyRate = () => {
    if (currentRate) {
      navigator.clipboard.writeText(`1 USD = ${currentRate.toLocaleString()} CDF`)
      setCopied(true)
      toast.success('Taux copié')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const onSubmit = (data: RateForm) => setShowConfirmModal(true)
  const confirmSave = () => rateValue && updateMutation.mutate({ rate: Number(rateValue), comment: watch('comment') })

  const exportHistoryCSV = () => {
    if (!historyData?.length) return
    const headers = ['Date', 'Taux (CDF)', 'Commentaire']
    const rows = historyData.map(row => [
      new Date(row.created_at).toISOString(),
      row.rate,
      row.comment || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `historique_taux_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  if (authLoading || loadingRate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="xl" variant="premium" label="Chargement..." />
      </div>
    )
  }

  if (!user) {
    router.push('/login?redirect=/admin/exchange-rate')
    return null
  }

  return (
    <div className="min-h-screen bg-background pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />
      <Container className="py-8 relative z-10 max-w-4xl">
        {/* Fil d'Ariane */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/admin" className="hover:text-gold-500 transition-colors">Admin</Link>
          <ChevronLeft size={14} />
          <span className="font-medium text-foreground">Taux de change</span>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En-tête */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-gold-100 dark:bg-gold-900/30 shadow-gold border border-gold-400/20">
                <DollarSign size={28} className="text-gold-600 dark:text-gold-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground font-serif">Taux de change</h1>
                <p className="text-muted-foreground mt-1">USD → CDF · Configuration du marché</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Tooltip content="Copier le taux actuel">
                <Button variant="outline-gold" size="sm" onClick={handleCopyRate} leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}>
                  {copied ? 'Copié' : 'Copier le taux'}
                </Button>
              </Tooltip>
              <Button variant="outline-gold" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-exchange-rate'] })} leftIcon={<RefreshCcw size={14} />}>
                Actualiser
              </Button>
            </div>
          </div>

          {/* Taux actuel */}
          <Card variant="glass" className="border-gold-400/20 shadow-gold mb-8">
            <CardContent className="p-6">
              {rateError ? (
                <div className="text-center py-8">
                  <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
                  <p className="text-red-500 mb-4">{(fetchError as Error)?.message || 'Impossible de charger le taux'}</p>
                  <Button variant="outline-gold" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-exchange-rate'] })}>
                    Réessayer
                  </Button>
                </div>
              ) : currentRate > 0 ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Taux actuel</p>
                    <p className="text-4xl font-extrabold text-foreground mt-2 font-mono tracking-tight">
                      1 USD = {currentRate.toLocaleString()} CDF
                    </p>
                    {rateData?.updated_at && (
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                        <Clock size={14} className="text-gold-500" />
                        <span>Dernière mise à jour : {new Date(rateData.updated_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</span>
                      </div>
                    )}
                    {variation !== undefined && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {variation >= 0 ? (
                          <Badge variant="accent" size="sm"><ArrowUp size={12} /> +{variation.toFixed(1)}%</Badge>
                        ) : (
                          <Badge variant="danger" size="sm"><ArrowDown size={12} /> {variation.toFixed(1)}%</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">vs mois dernier</span>
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:block p-4 rounded-full bg-gold-100 dark:bg-gold-900/30 border border-gold-400/20 shadow-gold">
                    <TrendingUp size={36} className="text-gold-600 dark:text-gold-400" />
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun taux défini pour le moment.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formulaire de mise à jour */}
          <Card variant="glass" className="border-gold-400/20 shadow-gold mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PenLine size={18} className="text-gold-500" /> Modifier le taux
              </CardTitle>
              <CardDescription>Définissez manuellement la valeur d'1 USD en CDF</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <Input
                  label="1 USD = ? CDF"
                  type="number"
                  variant="glass"
                  step="1"
                  placeholder={currentRate > 0 ? `${currentRate}` : 'ex: 2800'}
                  {...register('rate')}
                  error={errors.rate?.message}
                  leftIcon={<DollarSign size={16} className="text-muted-foreground" />}
                  suffix="CDF"
                  helperText="Valeur entière recommandée. Exemple : 2850"
                />
                <Input
                  label="Commentaire (optionnel)"
                  variant="glass"
                  placeholder="Raison de la modification..."
                  {...register('comment')}
                  error={errors.comment?.message}
                  maxLength={200}
                />
                <div className="flex gap-3">
                  <Button
                    type="submit"
                    variant="luxe"
                    size="lg"
                    className="shadow-gold flex-1"
                    loading={isSubmitting}
                    disabled={!isDirty}
                  >
                    <Sparkles size={16} className="mr-2" /> Mettre à jour le taux
                  </Button>
                  {isDirty && (
                    <Button
                      type="button"
                      variant="outline-gold"
                      size="lg"
                      onClick={() => reset({ rate: undefined, comment: '' })}
                    >
                      Annuler
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Convertisseur interactif */}
          <Card variant="glass" className="border-gold-400/20 shadow-gold mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-gold-500" /> Convertisseur instantané
              </CardTitle>
              <CardDescription>
                Basé sur le taux actuel de <strong>{currentRate.toLocaleString()} CDF</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4 items-center">
                <div>
                  <Input
                    variant="glass"
                    label="Montant en USD"
                    type="number"
                    step="0.01"
                    value={usdAmount}
                    onChange={e => setUsdAmount(e.target.value)}
                    placeholder="ex: 10"
                    prefix="$"
                  />
                  {convertedUsdToCdf !== null && (
                    <p className="mt-2 text-sm font-medium text-gold-600 dark:text-gold-400">
                      ≈ {convertedUsdToCdf.toLocaleString()} CDF
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={swapCurrencies}
                    className="p-3 rounded-full bg-gold-100 dark:bg-gold-900/30 border border-gold-400/20 hover:shadow-gold transition-all"
                    title="Inverser les devises"
                  >
                    <ArrowRightLeft size={20} className="text-gold-600" />
                  </button>
                </div>
                <div>
                  <Input
                    variant="glass"
                    label="Montant en CDF"
                    type="number"
                    value={cdfAmount}
                    onChange={e => setCdfAmount(e.target.value)}
                    placeholder="ex: 50000"
                    suffix="FC"
                  />
                  {convertedCdfToUsd !== null && (
                    <p className="mt-2 text-sm font-medium text-gold-600 dark:text-gold-400">
                      ≈ {convertedCdfToUsd.toFixed(2)} USD
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Historique des taux (accordéon) */}
          <div className="mb-8">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm font-medium text-gold-600 hover:text-gold-500 mb-4 transition-colors"
            >
              <History size={16} />
              {showHistory ? 'Masquer l\'historique' : 'Voir l\'historique des taux'}
            </button>
            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Card variant="glass" className="border-gold-400/20 shadow-gold">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart3 size={18} className="text-gold-500" /> Évolution du taux (30 jours)
                      </CardTitle>
                      {historyData && historyData.length > 0 && (
                        <Button variant="outline-gold" size="sm" onClick={exportHistoryCSV} leftIcon={<Download size={14} />}>
                          Export CSV
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent>
                      {loadingHistory ? (
                        <div className="space-y-3">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} variant="text" className="h-6" shimmer shimmerVariant="gold" />
                          ))}
                        </div>
                      ) : historyData && historyData.length > 0 ? (
                        <>
                          {/* Graphique */}
                          <div className="mb-6 h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={historyData.slice().reverse()}>
                                <defs>
                                  <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#c99a14" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#c99a14" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.15)" />
                                <XAxis dataKey="created_at" tick={{ fontSize: 10, fill: '#a8a49b' }} tickFormatter={(v) => new Date(v).toLocaleDateString('fr', { day: 'numeric', month: 'short' })} />
                                <YAxis tick={{ fontSize: 10, fill: '#a8a49b' }} domain={['dataMin - 50', 'dataMax + 50']} />
                                <RechartsTooltip
                                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: '1px solid rgba(201,169,98,0.3)' }}
                                  formatter={(value: number) => [`${value.toLocaleString()} CDF`, 'Taux']}
                                />
                                <Line type="monotone" dataKey="rate" stroke="#c99a14" strokeWidth={2} dot={false} fill="url(#rateGrad)" />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Tableau simplifié */}
                          <div className="overflow-x-auto max-h-64">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gold-400/10 text-left">
                                  <th className="px-4 py-2 font-semibold text-muted-foreground">Date</th>
                                  <th className="px-4 py-2 font-semibold text-muted-foreground">Taux (CDF)</th>
                                  <th className="px-4 py-2 font-semibold text-muted-foreground">Commentaire</th>
                                </tr>
                              </thead>
                              <tbody>
                                {historyData.map(row => (
                                  <tr key={row.id} className="border-b border-gold-400/5 hover:bg-gold-400/5">
                                    <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                                    <td className="px-4 py-2 font-mono font-bold">{row.rate.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.comment || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <p className="text-center py-8 text-muted-foreground">Aucun historique disponible.</p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </Container>

      {/* Modal de confirmation */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirmer la modification du taux"
        size="sm"
        accent="gold"
      >
        <div className="text-center space-y-5">
          <div className="mx-auto w-16 h-16 rounded-full bg-gold-100 dark:bg-gold-900/30 border border-gold-400/30 flex items-center justify-center">
            <ShieldCheck size={28} className="text-gold-600 dark:text-gold-400" />
          </div>
          <div>
            <p className="text-muted-foreground">
              Vous allez définir le taux à{' '}
              <strong className="text-gold-600 dark:text-gold-400">
                {rateValue ? Number(rateValue).toLocaleString() : '—'} CDF
              </strong>{' '}
              pour 1 USD.
            </p>
            {currentRate > 0 && rateValue && (
              <p className="text-xs text-muted-foreground mt-2">
                Ancien taux : {currentRate.toLocaleString()} CDF
                {' → '}
                Variation : {((Number(rateValue) - currentRate) / currentRate * 100).toFixed(2)}%
              </p>
            )}
            {watch('comment') && (
              <p className="mt-2 p-2 bg-neutral-100 dark:bg-midnight-700 rounded-lg text-sm italic">
                "{watch('comment')}"
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Cette modification affectera instantanément tous les affichages et calculs.
          </p>
          <div className="flex gap-3">
            <Button variant="luxe" fullWidth onClick={confirmSave} loading={updateMutation.isPending}>
              Confirmer
            </Button>
            <Button variant="outline-gold" fullWidth onClick={() => setShowConfirmModal(false)} disabled={updateMutation.isPending}>
              Annuler
            </Button>
          </div>
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}