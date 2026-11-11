// components/admin/TrustAuditLogManager.tsx
'use client'

import { useMemo, useState } from 'react'
import { RefreshCw, Search, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'

import type { TrustAuditLog } from '@/lib/trust'

import { EmptyState } from './TrustAdminUI'

interface TrustAuditLogManagerProps {
  logs: TrustAuditLog[]
  loading?: boolean
  onClear: () => Promise<void>
  onRefresh: () => Promise<void>
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(value)
  }
}

export function TrustAuditLogManager({
  logs,
  loading,
  onClear,
  onRefresh,
}: TrustAuditLogManagerProps) {
  const [query, setQuery] = useState('')
  const [entityFilter, setEntityFilter] = useState('all')
  const [clearing, setClearing] = useState(false)

  const entityTypes = useMemo(() => {
    const set = new Set(logs.map((log) => log.entity_type).filter(Boolean))
    return Array.from(set)
  }, [logs])

  const filtered = useMemo(() => {
    let result = [...logs]

    if (entityFilter !== 'all') {
      result = result.filter((log) => log.entity_type === entityFilter)
    }

    if (query.trim()) {
      const q = query.toLowerCase()
      result = result.filter(
        (log) =>
          log.action.toLowerCase().includes(q) ||
          log.entity_type.toLowerCase().includes(q) ||
          (log.entity_id || '').toLowerCase().includes(q)
      )
    }

    return result
  }, [entityFilter, logs, query])

  const handleClear = async () => {
    if (!window.confirm('Vider tout le journal d’audit ?')) return

    setClearing(true)

    try {
      await onClear()
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher dans le journal..."
              className="w-full rounded-xl border border-border bg-background/50 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          <select
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.target.value)}
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="all">Toutes entités</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            leftIcon={<RefreshCw size={14} />}
          >
            Actualiser
          </Button>

          <Button
            variant="danger"
            size="sm"
            onClick={handleClear}
            loading={clearing}
            leftIcon={<Trash2 size={14} />}
          >
            Vider
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Chargement du journal...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Aucune entrée d’audit"
          description="Les actions admin seront tracées ici."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="divide-y divide-border">
            {filtered.map((log) => (
              <div key={log.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                      {log.action}
                    </span>

                    <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                      {log.entity_type}
                    </span>

                    {log.entity_id && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {log.entity_id.slice(0, 8)}
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(log.created_at)}
                  </span>
                </div>

                {(log.before || log.after) && (
                  <details className="mt-3 rounded-xl border border-border bg-background/40 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Voir détails
                    </summary>

                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
                      {JSON.stringify(
                        { before: log.before, after: log.after },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}