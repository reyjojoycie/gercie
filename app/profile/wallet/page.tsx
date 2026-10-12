// app/profile/wallet/page.tsx
'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Wallet, TrendingUp, History, RefreshCw, AlertCircle, Clock, Filter,
  ChevronDown, ChevronUp, Download, ExternalLink, Eye, Search, X,
  ArrowUp, ArrowDown, DollarSign, CreditCard, Smartphone, Zap, Gift,
  BarChart3, PieChart, Calendar, BadgeCheck, Info,
  ShoppingBag, ArrowRightLeft   // ← ajoutés
} from 'lucide-react'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { Tabs } from '@/components/ui/Tabs'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { FixedSizeList as List } from 'react-window'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

// ... tout le reste du code (types, composants, etc.) reste inchangé ...

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Transaction {
  id: string
  type: 'recharge' | 'achat' | 'retrait' | 'transfert' | 'vente' | 'remboursement' | 'escrow_in' | 'escrow_out' | 'commission'
  montant: number
  description: string
  created_at: string
  method?: string
  phone?: string
  status?: 'pending' | 'approved' | 'rejected'
  portefeuille_type?: string
}

interface TransactionsPage {
  data: Transaction[]
  nextPage: number | null
  total: number
}

type TransactionFilter = 'all' | 'recharge' | 'achat' | 'retrait' | 'vente' | 'transfert' | 'remboursement'

const typeLabels: Record<string, string> = {
  recharge: 'Recharge',
  achat: 'Achat',
  retrait: 'Retrait',
  transfert: 'Transfert',
  vente: 'Vente',
  remboursement: 'Remboursement',
  escrow_in: 'Séquestre in',
  escrow_out: 'Séquestre out',
  commission: 'Commission',
}

const typeBadge = (type: string): 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' => {
  const map: Record<string, 'gold' | 'accent' | 'warm' | 'danger' | 'neutral'> = {
    recharge: 'gold',
    achat: 'accent',
    vente: 'accent',
    remboursement: 'danger',
    retrait: 'warm',
    transfert: 'neutral',
    escrow_in: 'neutral',
    escrow_out: 'neutral',
    commission: 'gold',
  }
  return map[type] || 'neutral'
}

const typeIcons: Record<string, React.ReactNode> = {
  recharge: <Wallet size={16} />,
  achat: <ShoppingBag size={16} />,
  vente: <TrendingUp size={16} />,
  retrait: <ArrowUp size={16} />,
  transfert: <ArrowRightLeft size={16} />,
  remboursement: <RefreshCw size={16} />,
}

const Row = ({ index, style, data }: { index: number; style: React.CSSProperties; data: Transaction[] }) => {
  const tx = data?.[index]
  if (!tx) return null

  return (
    <div style={style}>
      <div className="px-4 py-3 border-b border-gold-400/10 flex items-center gap-3 hover:bg-gold-400/5 transition-colors">
        <Badge variant={typeBadge(tx.type)} size="sm">
          {typeLabels[tx.type] || tx.type}
        </Badge>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
            {tx.description}
          </p>
          <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
            <span>{new Date(tx.created_at).toLocaleString()}</span>
            {tx.method && (
              <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-midnight-700 rounded-full">
                via {tx.method}
              </span>
            )}
            {tx.status === 'pending' && (
              <span className="flex items-center gap-1 text-warm-600">
                <Clock size={12} /> En attente
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className={cn(
            'font-bold text-sm',
            tx.montant >= 0 ? 'text-accent-600 dark:text-accent-400' : 'text-red-500 dark:text-red-400'
          )}>
            {tx.montant > 0 ? '+' : ''}{tx.montant.toLocaleString()} FC
          </p>
        </div>
      </div>
    </div>
  )
}

export default function WalletPage() {
  const { user, loading: authLoading } = useAuth()
  const { rate } = useExchangeRate()
  const toast = useToast()
  const [soldeAchat, setSoldeAchat] = useState(0)
  const [soldeVente, setSoldeVente] = useState(0)
  const [isVendeur, setIsVendeur] = useState(false)
  const [filter, setFilter] = useState<TransactionFilter>('all')
  const [searchTx, setSearchTx] = useState('')
  const [walletLoading, setWalletLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return
    Promise.all([
      fetch('/api/user/is-vendeur').then(r => r.json()),
      fetch('/api/user/wallet').then(r => r.json()),
    ])
      .then(([vendeurData, walletData]) => {
        setIsVendeur(vendeurData.isVendeur)
        setSoldeAchat(walletData.solde_achat || 0)
        setSoldeVente(walletData.solde_vente || 0)
        setWalletLoading(false)
      })
      .catch(() => setWalletLoading(false))
  }, [user])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: transactionsLoading,
    isRefetching,
    refetch,
  } = useInfiniteQuery<TransactionsPage>({
    queryKey: ['transactions', filter, user?.id],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('type', filter)
      params.set('page', String(pageParam))
      params.set('limit', '20')
      const res = await fetch(`/api/user/transactions?${params.toString()}`)
      if (!res.ok) throw new Error('Erreur chargement transactions')
      return res.json()
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: !!user,
  })

  const allTransactions = data?.pages.flatMap(p => p.data).filter(Boolean) ?? []
  const soldeAchatUSD = rate ? soldeAchat / rate : null
  const soldeVenteUSD = rate ? soldeVente / rate : null

  const listHeight = 500

  if (authLoading || walletLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <Spinner size="xl" variant="premium" label="Chargement..." />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <p className="text-neutral-500">Veuillez vous connecter.</p>
      </div>
    )
  }

  const walletTabs = [
    {
      id: 'overview',
      label: 'Aperçu',
      icon: <Wallet size={18} />,
      content: (
        <div className="space-y-8">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-gradient-to-br from-gold-500 to-gold-700 text-midnight-950 border-0 shadow-gold">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gold-900/80 text-sm font-medium">Solde achat</p>
                    <p className="text-4xl font-bold mt-2">{soldeAchat.toLocaleString()} FC</p>
                    {soldeAchatUSD && (
                      <p className="text-midnight-800/70 text-sm mt-1">≈ {soldeAchatUSD.toFixed(2)} USD</p>
                    )}
                  </div>
                  <div className="bg-white/20 p-3 rounded-full backdrop-blur-sm">
                    <Wallet size={28} />
                  </div>
                </div>
                <Link href="/profile/recharge" className="mt-4 inline-block">
                  <Button variant="glass" size="sm" className="bg-white/20 border-white/30 text-midnight-900 hover:bg-white/30">
                    Recharger
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {isVendeur && (
              <Card className="bg-gradient-to-br from-luxury-600 to-luxury-800 text-white border-0 shadow-glow-luxury">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-luxury-100 text-sm">Solde vente</p>
                      <p className="text-4xl font-bold mt-2">{soldeVente.toLocaleString()} FC</p>
                      {soldeVenteUSD && (
                        <p className="text-luxury-200 text-sm mt-1">≈ {soldeVenteUSD.toFixed(2)} USD</p>
                      )}
                    </div>
                    <div className="bg-white/20 p-3 rounded-full backdrop-blur-sm">
                      <TrendingUp size={28} />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="glass" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                      onClick={() => {
                        // transfert modal logic
                      }}
                    >
                      Transférer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-4 text-center">
                <ArrowUp size={20} className="mx-auto text-green-500 mb-1" />
                <p className="text-lg font-bold">+{data?.pages[0]?.data?.filter(t => t.montant > 0).reduce((a, b) => a + b.montant, 0).toLocaleString()} FC</p>
                <p className="text-xs text-muted-foreground">Entrées ce mois</p>
              </CardContent>
            </Card>
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-4 text-center">
                <ArrowDown size={20} className="mx-auto text-red-500 mb-1" />
                <p className="text-lg font-bold">-{data?.pages[0]?.data?.filter(t => t.montant < 0).reduce((a, b) => a + Math.abs(b.montant), 0).toLocaleString()} FC</p>
                <p className="text-xs text-muted-foreground">Sorties ce mois</p>
              </CardContent>
            </Card>
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-4 text-center">
                <RefreshCw size={20} className="mx-auto text-blue-500 mb-1" />
                <p className="text-lg font-bold">{data?.pages[0]?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">Transactions</p>
              </CardContent>
            </Card>
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-4 text-center">
                <Gift size={20} className="mx-auto text-gold-500 mb-1" />
                <p className="text-lg font-bold">{soldeAchat.toLocaleString()} FC</p>
                <p className="text-xs text-muted-foreground">Disponible</p>
              </CardContent>
            </Card>
          </div>
        </div>
      ),
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: <History size={18} />,
      content: (
        <Card variant="glass" className="border-gold-400/20 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
              <History size={20} className="text-gold-500" />
              Historique
              <span className="text-xs font-normal text-neutral-500">
                ({data?.pages[0]?.total ?? 0} transactions)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {transactionsLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} variant="text" className="w-full h-10" shimmer shimmerVariant="gold" />
                ))}
              </div>
            ) : allTransactions.length === 0 ? (
              <div className="p-12 text-center text-neutral-500">
                <RefreshCw size={40} className="mx-auto mb-3 text-neutral-300" />
                <p>Aucune transaction.</p>
              </div>
            ) : (
              <div ref={containerRef}>
                <List
                  height={Math.min(listHeight, allTransactions.length * 80)}
                  itemCount={allTransactions.length}
                  itemSize={80}
                  width="100%"
                  itemData={allTransactions}
                >
                  {Row}
                </List>
              </div>
            )}

            {hasNextPage && (
              <div className="p-4 text-center border-t border-gold-400/10">
                <Button
                  variant="outline-gold"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  loading={isFetchingNextPage}
                >
                  Afficher plus
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-12">
      <div className="sticky top-16 z-30 backdrop-blur-xl bg-white/70 dark:bg-midnight-900/70 border-b border-gold-400/20 shadow-soft">
        <Container className="py-4 flex items-center gap-4">
          <Link href="/profile" className="p-2 rounded-xl hover:bg-gold-400/10 transition-colors text-neutral-400 hover:text-gold-500">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">Mon portefeuille</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Consultez vos soldes et transactions</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline-gold" size="sm" onClick={() => refetch()} loading={isRefetching}>
              <RefreshCw size={14} className="mr-1" /> Actualiser
            </Button>
            <Link href="/profile/recharge">
              <Button variant="luxe" size="sm">
                <Wallet size={14} className="mr-1" /> Recharger
              </Button>
            </Link>
          </div>
        </Container>
      </div>

      <Container className="py-8 max-w-5xl">
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {(['all', 'recharge', 'achat', 'retrait', 'vente', 'transfert', 'remboursement'] as TransactionFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap border',
                filter === f
                  ? 'bg-gold-400/20 border-gold-400/50 text-gold-600 dark:text-gold-400 shadow-gold'
                  : 'bg-white dark:bg-midnight-800 text-neutral-600 dark:text-neutral-300 border-gold-400/20 hover:border-gold-400'
              )}
            >
              {f === 'all' ? 'Toutes' : typeLabels[f] || f}
            </button>
          ))}
        </div>

        <Tabs tabs={walletTabs} variant="pills" size="md" animated />
      </Container>
      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}