// components/admin/testimonials/TestimonialForm.tsx
'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

import {
  STATUS_OPTIONS,
  type Testimonial,
  type TestimonialStatus,
} from '@/lib/testimonials'

interface TestimonialFormProps {
  initialData?: Partial<Testimonial> | null
  onSave: (data: Partial<Testimonial> & { id?: string }) => Promise<void> | void
  onCancel: () => void
  isSaving?: boolean
  productSuggestions?: string[]
}

interface FormState {
  id?: string
  name: string
  role: string
  avatar: string
  text: string
  rating: string
  produit: string
  status: TestimonialStatus
  verified: boolean
  is_featured: boolean
  admin_response: string
  likes: string
}

function createInitialState(initialData?: Partial<Testimonial> | null): FormState {
  return {
    id: initialData?.id,
    name: initialData?.name || '',
    role: initialData?.role || '',
    avatar: initialData?.avatar || '',
    text: initialData?.text || '',
    rating: String(initialData?.rating ?? 5),
    produit: initialData?.produit || '',
    status: initialData?.status || 'pending',
    verified: Boolean(initialData?.verified),
    is_featured: Boolean(initialData?.is_featured),
    admin_response: initialData?.admin_response || '',
    likes: String(initialData?.likes ?? 0),
  }
}

function RatingPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const [hover, setHover] = useState(0)

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => {
        const starValue = index + 1
        const active = starValue <= (hover || value)

        return (
          <button
            key={starValue}
            type="button"
            onClick={() => onChange(starValue)}
            onMouseEnter={() => setHover(starValue)}
            onMouseLeave={() => setHover(0)}
            className="rounded p-1 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label={`Note ${starValue}`}
          >
            <Star
              size={22}
              className={cn(
                active
                  ? 'fill-amber-500 text-amber-500'
                  : 'text-neutral-300 dark:text-neutral-600'
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

export function TestimonialForm({
  initialData,
  onSave,
  onCancel,
  isSaving,
  productSuggestions = [],
}: TestimonialFormProps) {
  const [form, setForm] = useState<FormState>(() => createInitialState(initialData))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(createInitialState(initialData))
    setError(null)
  }, [initialData])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const name = form.name.trim()
    const text = form.text.trim()
    const rating = Number(form.rating)
    const likes = Number(form.likes)

    if (!name) {
      setError('Le nom du client est requis.')
      return
    }

    if (!text) {
      setError('Le contenu de l’avis est requis.')
      return
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      setError('La note doit être comprise entre 1 et 5.')
      return
    }

    if (!Number.isFinite(likes) || likes < 0) {
      setError('Les likes doivent être un nombre positif.')
      return
    }

    try {
      await onSave({
        id: form.id,
        name,
        role: form.role.trim() || null,
        avatar: form.avatar.trim() || null,
        text,
        rating,
        produit: form.produit.trim() || null,
        status: form.status,
        verified: form.verified,
        is_featured: form.is_featured,
        admin_response: form.admin_response.trim() || null,
        likes: Math.round(likes),
      })
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’enregistrement.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Nom du client <span className="text-red-500">*</span>
          </label>
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            placeholder="Amina K."
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Rôle / ville</label>
          <input
            value={form.role}
            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            placeholder="Cliente à Gombe"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-foreground">Avatar URL</label>
          <input
            value={form.avatar}
            onChange={(event) => setForm((prev) => ({ ...prev, avatar: event.target.value }))}
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            placeholder="https://..."
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-foreground">
            Contenu de l’avis <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.text}
            onChange={(event) => setForm((prev) => ({ ...prev, text: event.target.value }))}
            rows={5}
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            placeholder="Écris ici l’avis client..."
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Note</label>
          <RatingPicker
            value={Number(form.rating)}
            onChange={(value) => setForm((prev) => ({ ...prev, rating: String(value) }))}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Produit concerné</label>
          <input
            value={form.produit}
            onChange={(event) => setForm((prev) => ({ ...prev, produit: event.target.value }))}
            list="admin-testimonial-product-suggestions"
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            placeholder="Casque Bluetooth Premium"
          />
          <datalist id="admin-testimonial-product-suggestions">
            {productSuggestions.map((product) => (
              <option key={product} value={product} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Statut</label>
          <select
            value={form.status}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, status: event.target.value as TestimonialStatus }))
            }
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            {STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Likes</label>
          <input
            type="number"
            min={0}
            value={form.likes}
            onChange={(event) => setForm((prev) => ({ ...prev, likes: event.target.value }))}
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-foreground">Réponse admin</label>
          <textarea
            value={form.admin_response}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, admin_response: event.target.value }))
            }
            rows={3}
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            placeholder="Merci pour votre retour..."
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
          <span className="text-sm font-medium text-foreground">Vérifié</span>
          <input
            type="checkbox"
            checked={form.verified}
            onChange={(event) => setForm((prev) => ({ ...prev, verified: event.target.checked }))}
            className="h-4 w-4 rounded border-border"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
          <span className="text-sm font-medium text-foreground">Mis en avant</span>
          <input
            type="checkbox"
            checked={form.is_featured}
            onChange={(event) => setForm((prev) => ({ ...prev, is_featured: event.target.checked }))}
            className="h-4 w-4 rounded border-border"
          />
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Annuler
        </Button>

        <Button type="submit" variant="luxe" loading={isSaving}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}