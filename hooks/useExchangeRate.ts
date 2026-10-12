// hooks/useExchangeRate.ts
'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * Hook global pour obtenir le taux de change USD/CDF.
 * Met en cache le résultat pendant 10 minutes et le partage entre tous les composants.
 * Plus aucun appel multiple.
 */
export function useExchangeRate() {
  const { data: rate, isLoading: loading, error } = useQuery<number>({
    queryKey: ['exchange-rate'],
    queryFn: async () => {
      const res = await fetch('/api/exchange-rate')
      if (!res.ok) throw new Error('Erreur taux de change')
      const data = await res.json()
      return data.rate as number
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,    // garde en cache 30 minutes
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const convert = (cdf: number, targetCurrency: 'CDF' | 'USD' = 'USD'): number => {
    if (!rate) return cdf
    if (targetCurrency === 'USD') return cdf / rate
    return cdf
  }

  return { rate: rate ?? null, loading, error, convert }
}