// app/admin/trust/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3,
  MessageSquare,
  RefreshCw,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  User,
  Wrench,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

import {
  DEFAULT_TRUST_SETTINGS,
  DEFAULT_TRUST_STATS,
  DEFAULT_TRUST_TESTIMONIALS,
  type TrustAuditLog,
  type TrustData,
  type TrustSettings,
  type TrustStat,
  type TrustTestimonial,
} from '@/lib/trust'

import { TrustStatsManager } from '@/components/admin/TrustStatsManager'
import { TrustTestimonialsManager } from '@/components/admin/TrustTestimonialsManager'
import { TrustSettingsManager } from '@/components/admin/TrustSettingsManager'
import { TrustAuditLogManager } from '@/components/admin/TrustAuditLogManager'
import { TrustToolsManager } from '@/components/admin/TrustToolsManager'

type TabKey = 'stats' | 'testimonials' | 'settings' | 'logs' | 'tools'

export default function AdminTrustPage() {
  const auth = useAuth() as any
  const user = auth?.user
  const authLoading = Boolean(auth?.loading)

  const toast = useToast() as any

  const [activeTab, setActiveTab] = useState<TabKey>('stats')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [data, setData] = useState<TrustData>({
    stats: DEFAULT_TRUST_STATS,
    testimonials: DEFAULT_TRUST_TESTIMONIALS,
    settings: DEFAULT_TRUST_SETTINGS,
    logs: [],
  })

  const notify = useCallback(
    (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
      if (typeof toast?.addToast === 'function') {
        toast.addToast({ type, message })
        return
      }

      if (typeof toast?.show === 'function') {
        toast.show({ type, message })
      }
    },
    [toast]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/trust', {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || 'Impossible de charger les données de confiance.'
        )
      }

      setData({
        stats: Array.isArray(json?.data?.stats) ? json.data.stats : [],
        testimonials: Array.isArray(json?.data?.testimonials)
          ? json.data.testimonials
          : [],
        settings: json?.data?.settings || DEFAULT_TRUST_SETTINGS,
        logs: Array.isArray(json?.data?.logs) ? json.data.logs : [],
      })
    } catch (err: any) {
      setError(err?.message || 'Erreur lors du chargement.')
      notify('error', err?.message || 'Erreur lors du chargement.')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    if (!authLoading && user) {
      fetchData()
    }
  }, [authLoading, fetchData, user])

  const apiPost = useCallback(
    async (action: string, payload?: any) => {
      setSaving(true)
      setError(null)

      try {
        const res = await fetch('/api/admin/trust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action, payload }),
        })

        const json = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(json?.error || 'Erreur serveur.')
        }

        return json
      } finally {
        setSaving(false)
      }
    },
    []
  )

  const runAction = useCallback(
    async (action: string, payload: any, successMessage: string) => {
      try {
        await apiPost(action, payload)
        notify('success', successMessage)
        await fetchData()
      } catch (err: any) {
        notify('error', err?.message || 'Erreur lors de l’action.')
        throw err
      }
    },
    [apiPost, fetchData, notify]
  )

  const saveStat = useCallback(
    async (stat: Partial<TrustStat> & { id?: string }) => {
      await runAction('save-stat', stat, 'Statistique enregistrée.')
    },
    [runAction]
  )

  const deleteStat = useCallback(
    async (id: string) => {
      await runAction('delete-stat', { id }, 'Statistique supprimée.')
    },
    [runAction]
  )

  const reorderStats = useCallback(
    async (ids: string[]) => {
      await runAction('reorder-stats', { ids }, 'Ordre mis à jour.')
    },
    [runAction]
  )

  const bulkStats = useCallback(
    async (bulkAction: string, ids: string[]) => {
      await runAction(
        'bulk-stats',
        { bulkAction, ids },
        'Action de masse appliquée.'
      )
    },
    [runAction]
  )

  const saveTestimonial = useCallback(
    async (testimonial: Partial<TrustTestimonial> & { id?: string }) => {
      await runAction('save-testimonial', testimonial, 'Témoignage enregistré.')
    },
    [runAction]
  )

  const deleteTestimonial = useCallback(
    async (id: string) => {
      await runAction('delete-testimonial', { id }, 'Témoignage supprimé.')
    },
    [runAction]
  )

  const reorderTestimonials = useCallback(
    async (ids: string[]) => {
      await runAction(
        'reorder-testimonials',
        { ids },
        'Ordre des témoignages mis à jour.'
      )
    },
    [runAction]
  )

  const bulkTestimonials = useCallback(
    async (bulkAction: string, ids: string[]) => {
      await runAction(
        'bulk-testimonials',
        { bulkAction, ids },
        'Action de masse appliquée.'
      )
    },
    [runAction]
  )

  const saveSettings = useCallback(
    async (settings: Partial<TrustSettings>) => {
      await runAction('save-settings', settings, 'Réglages enregistrés.')
    },
    [runAction]
  )

  const resetDefaults = useCallback(async () => {
    await runAction('reset-defaults', {}, 'Données réinitialisées.')
  }, [runAction])

  const importData = useCallback(
    async (mode: 'replace' | 'merge', payload: any) => {
      await runAction(
        'import-data',
        { mode, ...payload },
        'Import terminé.'
      )
    },
    [runAction]
  )

  const clearLogs = useCallback(async () => {
    await runAction('clear-logs', {}, 'Journal vidé.')
  }, [runAction])

  const tabs = useMemo(
    () => [
      {
        key: 'stats' as TabKey,
        label: 'Statistiques',
        icon: <BarChart3 size={16} />,
      },
      {
        key: 'testimonials' as TabKey,
        label: 'Témoignages',
        icon: <MessageSquare size={16} />,
      },
      {
        key: 'settings' as TabKey,
        label: 'Réglages',
        icon: <SlidersHorizontal size={16} />,
      },
      {
        key: 'logs' as TabKey,
        label: 'Journal',
        icon: <Settings size={16} />,
      },
      {
        key: 'tools' as TabKey,
        label: 'Outils',
        icon: <Wrench size={16} />,
      },
    ],
    []
  )

  /* ---------------------------------------------------------- */
  /* Auth guards                                                 */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <User size={40} className="mx-auto mb-4 text-muted-foreground" />

          <h1 className="text-xl font-bold text-foreground">
            Connexion requise
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Tu dois être connecté pour accéder à l’administration de la section confiance.
          </p>

          <Link
            href={`/login?redirect=${encodeURIComponent('/admin/trust')}`}
            className="mt-6 inline-block"
          >
            <Button variant="luxe">Se connecter</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ShieldAlert size={24} className="text-gold-500" />
            Section Confiance
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Contrôle total des statistiques, témoignages, réglages publics, journal d’audit, import/export.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline-gold"
            size="sm"
            onClick={fetchData}
            loading={loading}
            leftIcon={<RefreshCw size={14} />}
          >
            Rafraîchir
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                isActive
                  ? 'bg-gold-500/10 text-gold-700 dark:text-gold-300'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.slice(0, 4)}</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-border bg-card p-5">
        {activeTab === 'stats' && (
          <TrustStatsManager
            stats={data.stats}
            loading={loading}
            onSave={saveStat}
            onDelete={deleteStat}
            onReorder={reorderStats}
            onBulk={bulkStats}
          />
        )}

        {activeTab === 'testimonials' && (
          <TrustTestimonialsManager
            testimonials={data.testimonials}
            loading={loading}
            onSave={saveTestimonial}
            onDelete={deleteTestimonial}
            onReorder={reorderTestimonials}
            onBulk={bulkTestimonials}
          />
        )}

        {activeTab === 'settings' && (
          <TrustSettingsManager
            settings={data.settings}
            loading={loading || saving}
            onSave={saveSettings}
          />
        )}

        {activeTab === 'logs' && (
          <TrustAuditLogManager
            logs={data.logs}
            loading={loading}
            onClear={clearLogs}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'tools' && (
          <TrustToolsManager
            data={data}
            loading={loading || saving}
            onImport={importData}
            onReset={resetDefaults}
          />
        )}
      </div>
    </div>
  )
}