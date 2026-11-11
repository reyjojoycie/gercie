// hooks/useTrustData.ts
'use client'

import { useQuery } from '@tanstack/react-query'

import {
  DEFAULT_TRUST_SETTINGS,
  DEFAULT_TRUST_STATS,
  DEFAULT_TRUST_TESTIMONIALS,
  normalizeSettings,
  normalizeStat,
  normalizeTestimonial,
  type TrustSettings,
  type TrustStat,
  type TrustTestimonial,
} from '@/lib/trust'

interface TrustData {
  stats: TrustStat[]
  testimonials: TrustTestimonial[]
  settings: TrustSettings
}

export function useTrustData(enabled = true) {
  const query = useQuery<TrustData>({
    queryKey: ['trust-data-public'],
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const res = await fetch('/api/trust/public', {
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Impossible de charger les données de confiance.'
        )
      }

      const payload = json?.data ?? json ?? {}

      const rawStats = Array.isArray(payload.stats)
        ? payload.stats
        : Array.isArray(json.stats)
          ? json.stats
          : []

      const rawTestimonials = Array.isArray(payload.testimonials)
        ? payload.testimonials
        : Array.isArray(json.testimonials)
          ? json.testimonials
          : []

      const rawSettings = payload.settings ?? json.settings ?? null

      return {
        stats: rawStats
          .map((row: any, index: number) => normalizeStat(row, index))
          .filter((row): row is TrustStat => Boolean(row))
          .sort((a, b) => a.sort_order - b.sort_order),
        testimonials: rawTestimonials
          .map((row: any, index: number) => normalizeTestimonial(row, index))
          .filter((row): row is TrustTestimonial => Boolean(row))
          .sort((a, b) => a.sort_order - b.sort_order),
        settings: normalizeSettings(rawSettings ?? DEFAULT_TRUST_SETTINGS),
      }
    },
    placeholderData: {
      stats: DEFAULT_TRUST_STATS,
      testimonials: DEFAULT_TRUST_TESTIMONIALS,
      settings: DEFAULT_TRUST_SETTINGS,
    },
  })

  return {
    stats: query.data?.stats ?? DEFAULT_TRUST_STATS,
    testimonials: query.data?.testimonials ?? DEFAULT_TRUST_TESTIMONIALS,
    settings: query.data?.settings ?? DEFAULT_TRUST_SETTINGS,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}