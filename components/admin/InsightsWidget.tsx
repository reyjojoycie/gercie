// components/admin/InsightsWidget.tsx
'use client'

import { useState, useEffect } from 'react'
import {
  BrainCircuit,
  MousePointerClick,
  SearchCheck,
  Percent,
  AlertTriangle,
  ShoppingBag,
  RefreshCw,
} from 'lucide-react'

interface IaStats {
  produitsAvecEmbedding: number
  interactionsUtilisateurs: number
  recherchesCachees: number
  tauxConversionReel: number
  commandesAnnuleesRecentes: number
  achatsPourRecommandations: number
}

interface StatsResponse {
  ia?: IaStats
}

export default function InsightsWidget() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [stats, setStats] = useState<IaStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async (selectedRange: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/stats?range=${selectedRange}`)
      if (!res.ok) throw new Error('Erreur de chargement')
      const data: StatsResponse = await res.json()
      setStats(data.ia || null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats(range)
  }, [range])

  const handleRefresh = () => {
    fetchStats(range)
  }

  const cards = stats
    ? [
        {
          title: 'Produits vectorisés',
          value: stats.produitsAvecEmbedding,
          icon: BrainCircuit,
          color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
        },
        {
          title: 'Interactions (30j)',
          value: stats.interactionsUtilisateurs,
          icon: MousePointerClick,
          color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
        },
        {
          title: 'Recherches en cache',
          value: stats.recherchesCachees,
          icon: SearchCheck,
          color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
        },
        {
          title: 'Taux de conversion',
          value: `${stats.tauxConversionReel}%`,
          icon: Percent,
          color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
        },
        {
          title: 'Commandes annulées',
          value: stats.commandesAnnuleesRecentes,
          icon: AlertTriangle,
          color: 'text-red-600 bg-red-100 dark:bg-red-900/30',
        },
        {
          title: 'Achats (base recos)',
          value: stats.achatsPourRecommandations,
          icon: ShoppingBag,
          color: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30',
        },
      ]
    : []

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-blue-600" />
          Insights IA
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as any)}
            className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7d">7 jours</option>
            <option value="30d">30 jours</option>
            <option value="90d">90 jours</option>
          </select>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Actualiser"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700 p-4">
              <div className="h-4 w-20 bg-gray-300 dark:bg-gray-600 rounded mb-2" />
              <div className="h-8 w-12 bg-gray-300 dark:bg-gray-600 rounded" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-6 text-red-500 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-gray-100 dark:border-gray-700 p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-750"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${card.color}`}>
                  <card.icon className="h-4 w-4" />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {card.title}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && !stats && (
        <p className="text-center text-gray-500 text-sm py-4">
          Aucune donnée IA disponible.
        </p>
      )}
    </div>
  )
}