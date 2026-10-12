// hooks/useWallet.ts
'use client'

import { useCallback, useMemo, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast' // notre système premium

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface WalletData {
  solde_achat: number
  solde_vente: number
  total_recharges?: number
  total_achats?: number
  total_ventes?: number
  last_transaction?: string
}

export interface Transaction {
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

export interface PaginatedTransactions {
  data: Transaction[]
  total: number
  nextPage: number | null
}

/* ========================================================================== */
/*  Fetchers                                                                  */
/* ========================================================================== */

async function fetchWallet(): Promise<WalletData> {
  const res = await fetch('/api/user/wallet')
  if (!res.ok) throw new Error('Impossible de récupérer le portefeuille')
  return res.json()
}

async function fetchTransactions(
  page: number = 1,
  limit: number = 20,
  type?: string,
  portefeuille?: string
): Promise<PaginatedTransactions> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (type) params.set('type', type)
  if (portefeuille) params.set('portefeuille', portefeuille)
  const res = await fetch(`/api/user/transactions?${params.toString()}`)
  if (!res.ok) throw new Error('Impossible de charger les transactions')
  return res.json()
}

/* ========================================================================== */
/*  Hook useWallet (ultra‑premium)                                            */
/* ========================================================================== */

export function useWallet() {
  const { user } = useAuth()
  const { rate, isLoading: rateLoading } = useExchangeRate()
  const queryClient = useQueryClient()
  const toast = useToast()

  // ── 1. Soldes ──────────────────────────────────────────
  const walletQuery = useQuery<WalletData>({
    queryKey: ['wallet', user?.id],
    queryFn: fetchWallet,
    enabled: !!user,
    staleTime: 30_000,       // 30 secondes
    gcTime: 5 * 60 * 1000,   // 5 minutes
  })

  const soldeAchat = walletQuery.data?.solde_achat ?? 0
  const soldeVente = walletQuery.data?.solde_vente ?? 0
  const soldeAchatUSD = rate ? soldeAchat / rate : null
  const soldeVenteUSD = rate ? soldeVente / rate : null

  // ── 2. Transactions récentes ────────────────────────────
  const [transactionsPage, setTransactionsPage] = useState(1)
  const [transactionType, setTransactionType] = useState<string | undefined>(undefined)

  const transactionsQuery = useQuery<PaginatedTransactions>({
    queryKey: ['transactions', user?.id, transactionsPage, transactionType],
    queryFn: () => fetchTransactions(transactionsPage, 20, transactionType),
    enabled: !!user,
    staleTime: 60_000,
    placeholderData: (prev) => prev, // conserve les données précédentes
  })

  const transactions = transactionsQuery.data?.data ?? []
  const totalTransactions = transactionsQuery.data?.total ?? 0
  const hasMoreTransactions = transactionsQuery.data?.nextPage !== null

  const loadMoreTransactions = useCallback(() => {
    if (!transactionsQuery.isFetching && hasMoreTransactions) {
      setTransactionsPage(prev => prev + 1)
    }
  }, [transactionsQuery.isFetching, hasMoreTransactions])

  const setTransactionFilter = useCallback((type?: string) => {
    setTransactionType(type || undefined)
    setTransactionsPage(1)
  }, [])

  // ── 3. Mutations ───────────────────────────────────────
  const rechargeMutation = useMutation({
    mutationFn: async ({
      montant,
      currency,
      method,
      phone,
      pin,
    }: {
      montant: number
      currency: 'CDF' | 'USD'
      method: string
      phone: string
      pin?: string
    }) => {
      const res = await fetch('/api/user/recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant, currency, method, phone, pin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Échec du rechargement')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['transactions', user?.id] })
      toast.addToast({ type: 'success', message: 'Rechargement effectué avec succès !' })
    },
    onError: (error: Error) => {
      toast.addToast({ type: 'error', message: error.message })
    },
  })

  const transferMutation = useMutation({
    mutationFn: async ({
      montant,
      source,
      destination,
    }: {
      montant: number
      source: 'achat' | 'vente'
      destination: 'achat' | 'vente'
    }) => {
      const res = await fetch('/api/transferts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant, source, destination }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Échec du transfert')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['transactions', user?.id] })
      toast.addToast({ type: 'success', message: 'Transfert effectué !' })
    },
    onError: (error: Error) => {
      toast.addToast({ type: 'error', message: error.message })
    },
  })

  // ── 4. Helpers ─────────────────────────────────────────
  const formatCurrency = useCallback(
    (montant: number, showSymbol = true) => {
      return `${montant.toLocaleString()}${showSymbol ? ' FC' : ''}`
    },
    []
  )

  const formatUSD = useCallback(
    (montantCDF: number) => {
      if (!rate) return null
      return `≈ ${(montantCDF / rate).toFixed(2)} USD`
    },
    [rate]
  )

  // ── 5. Retour ──────────────────────────────────────────
  return {
    // Soldes
    soldeAchat,
    soldeVente,
    soldeAchatUSD,
    soldeVenteUSD,
    totalRecharges: walletQuery.data?.total_recharges ?? 0,
    totalAchats: walletQuery.data?.total_achats ?? 0,
    totalVentes: walletQuery.data?.total_ventes ?? 0,

    // États
    isLoading: walletQuery.isLoading || rateLoading,
    isFetching: walletQuery.isFetching,
    error: walletQuery.error?.message ?? null,
    refetch: walletQuery.refetch,

    // Transactions
    transactions,
    totalTransactions,
    hasMoreTransactions,
    loadMoreTransactions,
    setTransactionFilter,
    isTransactionsLoading: transactionsQuery.isLoading,
    isTransactionsFetching: transactionsQuery.isFetching,
    transactionsError: transactionsQuery.error?.message ?? null,

    // Mutations
    recharge: rechargeMutation.mutate,
    rechargeAsync: rechargeMutation.mutateAsync,
    isRecharging: rechargeMutation.isPending,
    rechargeError: rechargeMutation.error?.message ?? null,

    transfer: transferMutation.mutate,
    transferAsync: transferMutation.mutateAsync,
    isTransferring: transferMutation.isPending,
    transferError: transferMutation.error?.message ?? null,

    // Utilitaires
    rate,
    formatCurrency,
    formatUSD,
  }
}