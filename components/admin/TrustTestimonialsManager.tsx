// components/admin/TrustTestimonialsManager.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Quote,
  Search,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

import type { TrustTestimonial } from '@/lib/trust'

import {
  AdminModal,
  EmptyState,
  Field,
  NumberInput,
  StatusPill,
  SwitchInput,
  TextArea,
  TextInput,
} from './TrustAdminUI'

interface TestimonialFormState {
  id?: string
  author: string
  role: string
  quote: string
  rating: string
  avatar_url: string
  commune: string
  verified: boolean
  sort_order: string
  is_active: boolean
}

interface TrustTestimonialsManagerProps {
  testimonials: TrustTestimonial[]
  loading?: boolean
  onSave: (testimonial: Partial<TrustTestimonial> & { id?: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (ids: string[]) => Promise<void>
  onBulk: (bulkAction: string, ids: string[]) => Promise<void>
}

function emptyForm(): TestimonialFormState {
  return {
    author: '',
    role: '',
    quote: '',
    rating: '5',
    avatar_url: '',
    commune: '',
    verified: false,
    sort_order: '0',
    is_active: true,
  }
}

function toForm(testimonial: TrustTestimonial): TestimonialFormState {
  return {
    id: testimonial.id,
    author: testimonial.author,
    role: testimonial.role || '',
    quote: testimonial.quote,
    rating: String(testimonial.rating),
    avatar_url: testimonial.avatar_url || '',
    commune: testimonial.commune || '',
    verified: testimonial.verified,
    sort_order: String(testimonial.sort_order),
    is_active: testimonial.is_active,
  }
}

export function TrustTestimonialsManager({
  testimonials,
  loading,
  onSave,
  onDelete,
  onReorder,
  onBulk,
}: TrustTestimonialsManagerProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all')
  const [sortKey, setSortKey] = useState<'sort_order' | 'author' | 'rating'>('sort_order')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<TestimonialFormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let result = [...testimonials]

    if (query.trim()) {
      const q = query.toLowerCase()
      result = result.filter(
        (item) =>
          item.author.toLowerCase().includes(q) ||
          (item.role || '').toLowerCase().includes(q) ||
          item.quote.toLowerCase().includes(q) ||
          (item.commune || '').toLowerCase().includes(q)
      )
    }

    if (statusFilter === 'active') {
      result = result.filter((item) => item.is_active)
    } else if (statusFilter === 'inactive') {
      result = result.filter((item) => !item.is_active)
    }

    if (verifiedFilter === 'verified') {
      result = result.filter((item) => item.verified)
    } else if (verifiedFilter === 'unverified') {
      result = result.filter((item) => !item.verified)
    }

    result.sort((a, b) => {
      let comparison = 0

      if (sortKey === 'author') {
        comparison = a.author.localeCompare(b.author)
      } else if (sortKey === 'rating') {
        comparison = a.rating - b.rating
      } else {
        comparison = a.sort_order - b.sort_order
      }

      return sortDir === 'asc' ? comparison : -comparison
    })

    return result
  }, [
    query,
    sortDir,
    sortKey,
    statusFilter,
    testimonials,
    verifiedFilter,
  ])

  const allSelected =
    filtered.length > 0 && filtered.every((item) => selected.has(item.id))

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map((item) => item.id)))
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
    setForm(emptyForm())
    setError(null)
    setModalOpen(true)
  }

  const openEdit = (testimonial: TrustTestimonial) => {
    setForm(toForm(testimonial))
    setError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)

    const author = form.author.trim()
    const quote = form.quote.trim()
    const rating = Number(form.rating)
    const sortOrder = Number(form.sort_order)

    if (!author) {
      setError('L’auteur est requis.')
      return
    }

    if (!quote) {
      setError('La citation est requise.')
      return
    }

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      setError('La note doit être comprise entre 0 et 5.')
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
        author,
        role: form.role.trim() || null,
        quote,
        rating,
        avatar_url: form.avatar_url.trim() || null,
        commune: form.commune.trim() || null,
        verified: form.verified,
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

  const handleDelete = async (testimonial: TrustTestimonial) => {
    if (!window.confirm(`Supprimer le témoignage de "${testimonial.author}" ?`)) {
      return
    }

    try {
      await onDelete(testimonial.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(testimonial.id)
        return next
      })
    } catch (err) {
      console.error(err)
    }
  }

  const handleDuplicate = async (testimonial: TrustTestimonial) => {
    try {
      await onSave({
        ...testimonial,
        id: undefined,
        author: `${testimonial.author} (copie)`,
        verified: false,
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
      !window.confirm(`Supprimer ${ids.length} témoignage(s) ?`)
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

  const move = async (id: string, direction: 'up' | 'down') => {
    const ids = filtered.map((item) => item.id)
    const index = ids.indexOf(id)

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
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un témoignage..."
              className="w-full rounded-xl border border-border bg-background/50 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as any)}
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="all">Tous statuts</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>

          <select
            value={verifiedFilter}
            onChange={(event) => setVerifiedFilter(event.target.value as any)}
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="all">Tous vérifiés</option>
            <option value="verified">Vérifiés</option>
            <option value="unverified">Non vérifiés</option>
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
            <option value="author:asc">Auteur A-Z</option>
            <option value="author:desc">Auteur Z-A</option>
            <option value="rating:asc">Note croissante</option>
            <option value="rating:desc">Note décroissante</option>
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
            {selected.size} sélectionné(s)
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
          Chargement des témoignages...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Quote size={32} />}
          title="Aucun témoignage"
          description="Ajoute des retours clients pour renforcer la confiance."
          action={
            <Button variant="luxe" size="sm" onClick={openCreate}>
              Ajouter un témoignage
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
            <div className="col-span-3">Auteur</div>
            <div className="col-span-5">Citation</div>
            <div className="col-span-1">Note</div>
            <div className="col-span-1">Statut</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          <div className="divide-y divide-border">
            {filtered.map((testimonial, index) => {
              const isSelected = selected.has(testimonial.id)

              return (
                <div
                  key={testimonial.id}
                  className={cn(
                    'grid grid-cols-1 gap-3 px-4 py-4 transition lg:grid-cols-12 lg:items-start',
                    isSelected && 'bg-gold-500/5'
                  )}
                >
                  <div className="flex items-start gap-3 lg:col-span-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(testimonial.id)}
                      className="mt-1 h-4 w-4 rounded border-border"
                    />
                  </div>

                  <div className="min-w-0 lg:col-span-3">
                    <p className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
                      {testimonial.author}
                      {testimonial.verified && (
                        <BadgeCheck size={14} className="shrink-0 text-blue-500" />
                      )}
                    </p>

                    {(testimonial.role || testimonial.commune) && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[testimonial.role, testimonial.commune]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 lg:col-span-5">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      « {testimonial.quote} »
                    </p>
                  </div>

                  <div className="text-sm text-muted-foreground lg:col-span-1">
                    {testimonial.rating.toFixed(1)}
                  </div>

                  <div className="lg:col-span-1">
                    <StatusPill active={testimonial.is_active} />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1 lg:col-span-1">
                    <button
                      type="button"
                      onClick={() => move(testimonial.id, 'up')}
                      disabled={index === 0}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
                      aria-label="Monter"
                    >
                      <ArrowUp size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => move(testimonial.id, 'down')}
                      disabled={index === filtered.length - 1}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
                      aria-label="Descendre"
                    >
                      <ArrowDown size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => openEdit(testimonial)}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-gold-500"
                      aria-label="Modifier"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicate(testimonial)}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-blue-500"
                      aria-label="Dupliquer"
                    >
                      <Copy size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(testimonial)}
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
        title={form.id ? 'Modifier le témoignage' : 'Nouveau témoignage'}
        description="Contrôle le contenu affiché publiquement."
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
          <Field label="Auteur" required>
            <TextInput
              value={form.author}
              onChange={(value) => setForm((prev) => ({ ...prev, author: value }))}
              placeholder="Amina K."
            />
          </Field>

          <Field label="Rôle / fonction">
            <TextInput
              value={form.role}
              onChange={(value) => setForm((prev) => ({ ...prev, role: value }))}
              placeholder="Cliente à Gombe"
            />
          </Field>

          <Field label="Commune / ville">
            <TextInput
              value={form.commune}
              onChange={(value) => setForm((prev) => ({ ...prev, commune: value }))}
              placeholder="Kinshasa"
            />
          </Field>

          <Field label="Note" hint="0 à 5">
            <NumberInput
              value={form.rating}
              onChange={(value) => setForm((prev) => ({ ...prev, rating: value }))}
              min={0}
              max={5}
              step={0.1}
            />
          </Field>

          <Field label="Citation" required className="sm:col-span-2">
            <TextArea
              value={form.quote}
              onChange={(value) => setForm((prev) => ({ ...prev, quote: value }))}
              placeholder="Écris ici le témoignage client..."
              rows={4}
            />
          </Field>

          <Field label="Avatar URL" className="sm:col-span-2">
            <TextInput
              value={form.avatar_url}
              onChange={(value) => setForm((prev) => ({ ...prev, avatar_url: value }))}
              placeholder="https://..."
            />
          </Field>

          <Field label="Ordre d’affichage">
            <NumberInput
              value={form.sort_order}
              onChange={(value) => setForm((prev) => ({ ...prev, sort_order: value }))}
              min={0}
            />
          </Field>

          <div className="space-y-3 sm:col-span-2">
            <SwitchInput
              checked={form.verified}
              onChange={(checked) => setForm((prev) => ({ ...prev, verified: checked }))}
              label="Témoignage vérifié"
              description="Affiche un badge de vérification."
            />

            <SwitchInput
              checked={form.is_active}
              onChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
              label="Témoignage actif"
              description="Si désactivé, il ne sera pas affiché publiquement."
            />
          </div>
        </div>

        {/* Preview */}
        {form.quote && form.author && (
          <div className="mt-6 rounded-2xl border border-gold-400/20 bg-muted/30 p-4">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Aperçu
            </p>

            <div className="flex items-start gap-3">
              <Quote size={18} className="mt-1 shrink-0 text-gold-500/60" />

              <div>
                <p className="text-sm italic text-muted-foreground">
                  « {form.quote} »
                </p>

                <p className="mt-2 text-sm font-semibold text-foreground">
                  {form.author}
                </p>

                {(form.role || form.commune) && (
                  <p className="text-xs text-muted-foreground">
                    {[form.role, form.commune].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  )
}