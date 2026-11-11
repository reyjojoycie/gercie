// components/admin/TrustStatsManager.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

import {
  COLOR_OPTIONS,
  ICON_OPTIONS,
  type TrustStat,
} from '@/lib/trust'

import {
  AdminModal,
  EmptyState,
  Field,
  NumberInput,
  SelectInput,
  StatusPill,
  SwitchInput,
  TextArea,
  TextInput,
} from './TrustAdminUI'

interface StatFormState {
  id?: string
  label: string
  value: string
  suffix: string
  prefix: string
  decimals: string
  icon_name: string
  color: string
  description: string
  sort_order: string
  is_active: boolean
}

interface TrustStatsManagerProps {
  stats: TrustStat[]
  loading?: boolean
  onSave: (stat: Partial<TrustStat> & { id?: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (ids: string[]) => Promise<void>
  onBulk: (bulkAction: string, ids: string[]) => Promise<void>
}

function emptyStatForm(): StatFormState {
  return {
    label: '',
    value: '0',
    suffix: '',
    prefix: '',
    decimals: '0',
    icon_name: 'ShieldCheck',
    color: COLOR_OPTIONS[0].value,
    description: '',
    sort_order: '0',
    is_active: true,
  }
}

function statToForm(stat: TrustStat): StatFormState {
  return {
    id: stat.id,
    label: stat.label,
    value: String(stat.value),
    suffix: stat.suffix,
    prefix: stat.prefix,
    decimals: String(stat.decimals),
    icon_name: stat.icon_name,
    color: stat.color,
    description: stat.description || '',
    sort_order: String(stat.sort_order),
    is_active: stat.is_active,
  }
}

export function TrustStatsManager({
  stats,
  loading,
  onSave,
  onDelete,
  onReorder,
  onBulk,
}: TrustStatsManagerProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortKey, setSortKey] = useState<'sort_order' | 'label' | 'value'>('sort_order')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<StatFormState>(emptyStatForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredStats = useMemo(() => {
    let result = [...stats]

    if (query.trim()) {
      const q = query.toLowerCase()
      result = result.filter(
        (stat) =>
          stat.label.toLowerCase().includes(q) ||
          (stat.description || '').toLowerCase().includes(q) ||
          stat.icon_name.toLowerCase().includes(q)
      )
    }

    if (statusFilter === 'active') {
      result = result.filter((stat) => stat.is_active)
    } else if (statusFilter === 'inactive') {
      result = result.filter((stat) => !stat.is_active)
    }

    result.sort((a, b) => {
      let comparison = 0

      if (sortKey === 'label') {
        comparison = a.label.localeCompare(b.label)
      } else if (sortKey === 'value') {
        comparison = a.value - b.value
      } else {
        comparison = a.sort_order - b.sort_order
      }

      return sortDir === 'asc' ? comparison : -comparison
    })

    return result
  }, [query, sortDir, sortKey, stats, statusFilter])

  const allSelected =
    filteredStats.length > 0 &&
    filteredStats.every((stat) => selected.has(stat.id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredStats.map((stat) => stat.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openCreate = () => {
    setForm(emptyStatForm())
    setError(null)
    setModalOpen(true)
  }

  const openEdit = (stat: TrustStat) => {
    setForm(statToForm(stat))
    setError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)

    const label = form.label.trim()
    const value = Number(form.value)
    const decimals = Number(form.decimals)
    const sortOrder = Number(form.sort_order)

    if (!label) {
      setError('Le libellé est requis.')
      return
    }

    if (!Number.isFinite(value) || value < 0) {
      setError('La valeur doit être un nombre positif.')
      return
    }

    if (!Number.isFinite(decimals) || decimals < 0 || decimals > 2) {
      setError('Les décimales doivent être entre 0 et 2.')
      return
    }

    if (!Number.isFinite(sortOrder)) {
      setError('L’ordre doit être un nombre valide.')
      return
    }

    setSaving(true)

    try {
      await onSave({
        id: form.id,
        label,
        value,
        suffix: form.suffix,
        prefix: form.prefix,
        decimals,
        icon_name: form.icon_name,
        color: form.color,
        description: form.description.trim() || null,
        sort_order: sortOrder,
        is_active: form.is_active,
      })

      closeModal()
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (stat: TrustStat) => {
    if (!window.confirm(`Supprimer la statistique "${stat.label}" ?`)) return

    try {
      await onDelete(stat.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(stat.id)
        return next
      })
    } catch (err) {
      console.error(err)
    }
  }

  const handleDuplicate = async (stat: TrustStat) => {
    try {
      await onSave({
        ...stat,
        id: undefined,
        label: `${stat.label} (copie)`,
        is_active: false,
      })
    } catch (err) {
      console.error(err)
    }
  }

  const handleBulk = async (bulkAction: string) => {
    const ids = Array.from(selected)
    if (ids.length === 0) return

    if (
      bulkAction === 'delete' &&
      !window.confirm(`Supprimer ${ids.length} statistique(s) ?`)
    ) {
      return
    }

    try {
      await onBulk(bulkAction, ids)
      setSelected(new Set())
    } catch (err) {
      console.error(err)
    }
  }

  const move = async (statId: string, direction: 'up' | 'down') => {
    const ids = filteredStats.map((stat) => stat.id)
    const index = ids.indexOf(statId)

    if (index === -1) return
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === ids.length - 1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const nextIds = [...ids]
    ;[nextIds[index], nextIds[targetIndex]] = [
      nextIds[targetIndex],
      nextIds[index],
    ]

    try {
      await onReorder(nextIds)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
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
              placeholder="Rechercher une statistique..."
              className="w-full rounded-xl border border-border bg-background/50 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as any)
            }
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>

          <select
            value={`${sortKey}:${sortDir}`}
            onChange={(event) => {
              const [key, dir] = event.target.value.split(':')
              setSortKey(key as any)
              setSortDir(dir as any)
            }}
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="sort_order:asc">Ordre ↑</option>
            <option value="sort_order:desc">Ordre ↓</option>
            <option value="label:asc">Libellé A-Z</option>
            <option value="label:desc">Libellé Z-A</option>
            <option value="value:asc">Valeur croissante</option>
            <option value="value:desc">Valeur décroissante</option>
          </select>
        </div>

        <Button
          variant="luxe"
          size="sm"
          onClick={openCreate}
          leftIcon={<Plus size={16} />}
        >
          Ajouter
        </Button>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-400/30 bg-gold-500/5 p-3">
          <p className="text-sm font-medium text-foreground">
            {selected.size} sélectionnée(s)
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => handleBulk('activate')}
              leftIcon={<Eye size={14} />}
            >
              Activer
            </Button>

            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => handleBulk('deactivate')}
              leftIcon={<EyeOff size={14} />}
            >
              Désactiver
            </Button>

            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => handleBulk('duplicate')}
              leftIcon={<Copy size={14} />}
            >
              Dupliquer
            </Button>

            <Button
              variant="danger"
              size="sm"
              onClick={() => handleBulk('delete')}
              leftIcon={<Trash2 size={14} />}
            >
              Supprimer
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Chargement des statistiques...
        </div>
      ) : filteredStats.length === 0 ? (
        <EmptyState
          icon={<Plus size={32} />}
          title="Aucune statistique"
          description="Ajoute une première statistique pour afficher la confiance sur ton site."
          action={
            <Button variant="luxe" size="sm" onClick={openCreate}>
              Ajouter une statistique
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-12 gap-3 border-b border-border bg-muted/30 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground lg:grid">
            <div className="col-span-1 flex items-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-border"
              />
            </div>
            <div className="col-span-4">Libellé</div>
            <div className="col-span-2">Valeur</div>
            <div className="col-span-2">Icône</div>
            <div className="col-span-1">Statut</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          <div className="divide-y divide-border">
            {filteredStats.map((stat, index) => {
              const isSelected = selected.has(stat.id)

              return (
                <div
                  key={stat.id}
                  className={cn(
                    'grid grid-cols-1 gap-3 px-4 py-4 transition lg:grid-cols-12 lg:items-center',
                    isSelected && 'bg-gold-500/5'
                  )}
                >
                  <div className="flex items-center gap-3 lg:col-span-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(stat.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                  </div>

                  <div className="min-w-0 lg:col-span-4">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {stat.label}
                    </p>
                    {stat.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {stat.description}
                      </p>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground lg:col-span-2">
                    {stat.prefix}
                    {stat.value.toLocaleString('fr-FR', {
                      minimumFractionDigits: stat.decimals,
                      maximumFractionDigits: stat.decimals,
                    })}
                    {stat.suffix}
                  </div>

                  <div className="lg:col-span-2">
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {stat.icon_name}
                    </span>
                  </div>

                  <div className="lg:col-span-1">
                    <StatusPill active={stat.is_active} />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1 lg:col-span-2">
                    <button
                      type="button"
                      onClick={() => move(stat.id, 'up')}
                      disabled={index === 0}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
                      aria-label="Monter"
                    >
                      <ArrowUp size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => move(stat.id, 'down')}
                      disabled={index === filteredStats.length - 1}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
                      aria-label="Descendre"
                    >
                      <ArrowDown size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => openEdit(stat)}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-gold-500"
                      aria-label="Modifier"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicate(stat)}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-blue-500"
                      aria-label="Dupliquer"
                    >
                      <Copy size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(stat)}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      <AdminModal
        open={modalOpen}
        onClose={closeModal}
        title={form.id ? 'Modifier la statistique' : 'Nouvelle statistique'}
        description="Contrôle l’affichage public de cette statistique."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>
              Annuler
            </Button>

            <Button
              variant="luxe"
              onClick={handleSubmit}
              loading={saving}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Libellé" required className="sm:col-span-2">
            <TextInput
              value={form.label}
              onChange={(value) => setForm((prev) => ({ ...prev, label: value }))}
              placeholder="Clients satisfaits"
            />
          </Field>

          <Field label="Valeur" required>
            <NumberInput
              value={form.value}
              onChange={(value) => setForm((prev) => ({ ...prev, value }))}
              min={0}
              step={0.1}
            />
          </Field>

          <Field label="Décimales" hint="0, 1 ou 2">
            <NumberInput
              value={form.decimals}
              onChange={(value) => setForm((prev) => ({ ...prev, decimals: value }))}
              min={0}
              max={2}
            />
          </Field>

          <Field label="Préfixe">
            <TextInput
              value={form.prefix}
              onChange={(value) => setForm((prev) => ({ ...prev, prefix: value }))}
              placeholder="≈"
            />
          </Field>

          <Field label="Suffixe">
            <TextInput
              value={form.suffix}
              onChange={(value) => setForm((prev) => ({ ...prev, suffix: value }))}
              placeholder="+, %, /5, h"
            />
          </Field>

          <Field label="Icône">
            <SelectInput
              value={form.icon_name}
              onChange={(value) => setForm((prev) => ({ ...prev, icon_name: value }))}
              options={ICON_OPTIONS.map((icon) => ({ value: icon, label: icon }))}
            />
          </Field>

          <Field label="Couleur">
            <SelectInput
              value={form.color}
              onChange={(value) => setForm((prev) => ({ ...prev, color: value }))}
              options={COLOR_OPTIONS}
            />
          </Field>

          <Field label="Ordre d’affichage">
            <NumberInput
              value={form.sort_order}
              onChange={(value) => setForm((prev) => ({ ...prev, sort_order: value }))}
              min={0}
            />
          </Field>

          <Field label="Description" className="sm:col-span-2">
            <TextArea
              value={form.description}
              onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
              placeholder="Texte optionnel affiché sous la statistique"
              rows={2}
            />
          </Field>

          <div className="sm:col-span-2">
            <SwitchInput
              checked={form.is_active}
              onChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
              label="Statistique active"
              description="Si désactivée, elle ne sera pas affichée publiquement."
            />
          </div>
        </div>
      </AdminModal>
    </div>
  )
}