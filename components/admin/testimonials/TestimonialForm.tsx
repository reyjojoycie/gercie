// components/admin/testimonials/TestimonialForm.tsx
'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent
} from 'react'
import { motion } from 'framer-motion'
import {
  Star,
  Upload,
  X,
  Loader2,
  AlertCircle,
  Image as ImageIcon
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
export interface TestimonialFormData {
  name: string
  role: string
  text: string
  rating: number
  produit: string
  verified: boolean
  status: 'published' | 'pending' | 'rejected'
  is_featured: boolean
  avatar?: File | null // pour l'upload, géré côté parent si besoin
  // les champs suivants sont généralement fournis par le parent
  id?: string
  date?: string
  created_at?: string
  updated_at?: string
}

interface TestimonialFormProps {
  /** Données initiales pour l'édition (undefined = création) */
  initialData?: Partial<TestimonialFormData> | null
  /** Appelé à la soumission avec les données du formulaire */
  onSave: (data: TestimonialFormData) => Promise<void> | void
  /** Annulation (fermeture modale, etc.) */
  onCancel: () => void
  /** Indique si une sauvegarde est en cours (désactive le bouton) */
  isSaving?: boolean
  /** Suggestions de produits (autocomplétion) */
  productSuggestions?: string[]
  /** Désactiver des champs spécifiques (lecture seule) */
  disabledFields?: Partial<Record<keyof TestimonialFormData, boolean>>
  /** Limite de caractères pour le texte */
  textMaxLength?: number
}

/* ========================================================================== */
/*  Sous‑composants internes                                                   */
/* ========================================================================== */

function StarRatingPicker({
  rating,
  onChange,
  disabled = false
}: {
  rating: number
  onChange: (r: number) => void
  disabled?: boolean
}) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Note sur 5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="p-0.5 transition-transform hover:scale-110 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
          role="radio"
          aria-checked={rating === star}
        >
          <Star
            size={22}
            className={cn(
              'transition-colors duration-150',
              (hovered ? star <= hovered : star <= rating)
                ? 'text-amber-500 fill-amber-500'
                : 'text-neutral-300 dark:text-neutral-600'
            )}
          />
        </button>
      ))}
      <span className="ml-2 text-xs text-muted-foreground">{rating}/5</span>
    </div>
  )
}

function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  disabled
}: {
  value: string
  onChange: (val: string) => void
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!suggestions || !value) return []
    const lower = value.toLowerCase()
    return suggestions.filter((s) => s.toLowerCase().includes(lower)).slice(0, 5)
  }, [suggestions, value])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50 disabled:opacity-50"
      />
      {show && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-strong z-10">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s)
                setShow(false)
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gold-400/10"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */
export function TestimonialForm({
  initialData,
  onSave,
  onCancel,
  isSaving = false,
  productSuggestions,
  disabledFields = {},
  textMaxLength = 500
}: TestimonialFormProps) {
  const [form, setForm] = useState<TestimonialFormData>({
    name: initialData?.name || '',
    role: initialData?.role || '',
    text: initialData?.text || '',
    rating: initialData?.rating || 5,
    produit: initialData?.produit || '',
    verified: initialData?.verified ?? false,
    status: initialData?.status || 'published',
    is_featured: initialData?.is_featured ?? false,
    avatar: null
  })
  const [errors, setErrors] = useState<Partial<Record<keyof TestimonialFormData, string>>>({})

  // Met à jour le formulaire si les données initiales changent (cas édition)
  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || '',
        role: initialData.role || '',
        text: initialData.text || '',
        rating: initialData.rating || 5,
        produit: initialData.produit || '',
        verified: initialData.verified ?? false,
        status: initialData.status || 'published',
        is_featured: initialData.is_featured ?? false,
        avatar: null
      })
      setErrors({})
    }
  }, [initialData])

  // Validation
  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {}
    if (!form.name.trim()) newErrors.name = 'Le nom est requis'
    else if (form.name.trim().length < 2) newErrors.name = 'Nom trop court (min. 2)'
    if (!form.text.trim()) newErrors.text = 'Le témoignage est requis'
    else if (form.text.trim().length < 10) newErrors.text = 'Minimum 10 caractères'
    if (form.text.length > textMaxLength) newErrors.text = `Maximum ${textMaxLength} caractères`
    if (form.rating < 1 || form.rating > 5) newErrors.rating = 'Note invalide'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [form, textMaxLength])

  const handleSubmit = async () => {
    if (!validate()) return
    await onSave({
      ...form,
      name: form.name.trim(),
      role: form.role.trim(),
      text: form.text.trim()
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const fieldDisabled = (field: keyof TestimonialFormData) =>
    disabledFields[field] === true

  return (
    <motion.form
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
      className="space-y-5"
      noValidate
    >
      {/* Nom */}
      <div>
        <label htmlFor="testimonial-name" className="block text-sm font-medium mb-1">
          Nom <span className="text-red-500">*</span>
        </label>
        <input
          id="testimonial-name"
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          disabled={fieldDisabled('name')}
          className={cn(
            'w-full bg-background border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50 disabled:opacity-50',
            errors.name ? 'border-red-500' : 'border-border'
          )}
          placeholder="Jean Dupont"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} /> {errors.name}
          </p>
        )}
      </div>

      {/* Rôle */}
      <div>
        <label htmlFor="testimonial-role" className="block text-sm font-medium mb-1">
          Rôle
        </label>
        <input
          id="testimonial-role"
          type="text"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          disabled={fieldDisabled('role')}
          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50 disabled:opacity-50"
          placeholder="Client Premium"
        />
      </div>

      {/* Témoignage */}
      <div>
        <label htmlFor="testimonial-text" className="block text-sm font-medium mb-1">
          Témoignage <span className="text-red-500">*</span>
        </label>
        <textarea
          id="testimonial-text"
          rows={4}
          maxLength={textMaxLength}
          value={form.text}
          onChange={(e) => setForm({ ...form, text: e.target.value })}
          disabled={fieldDisabled('text')}
          className={cn(
            'w-full bg-background border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50 disabled:opacity-50 resize-y',
            errors.text ? 'border-red-500' : 'border-border'
          )}
          placeholder="J'ai adoré..."
        />
        <div className="flex justify-between mt-1">
          {errors.text ? (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={12} /> {errors.text}
            </p>
          ) : <span />}
          <span className="text-xs text-muted-foreground">
            {form.text.length}/{textMaxLength}
          </span>
        </div>
      </div>

      {/* Note */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Note <span className="text-red-500">*</span>
        </label>
        <StarRatingPicker
          rating={form.rating}
          onChange={(r) => setForm({ ...form, rating: r })}
          disabled={fieldDisabled('rating')}
        />
        {errors.rating && (
          <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} /> {errors.rating}
          </p>
        )}
      </div>

      {/* Produit avec autocomplétion */}
      <div>
        <label htmlFor="testimonial-produit" className="block text-sm font-medium mb-1">
          Produit
        </label>
        <AutocompleteInput
          value={form.produit}
          onChange={(val) => setForm({ ...form, produit: val })}
          suggestions={productSuggestions}
          placeholder="Ex: iPhone 15 Pro"
          disabled={fieldDisabled('produit')}
        />
      </div>

      {/* Avatar (simplifié) */}
      <div>
        <label className="block text-sm font-medium mb-1">Avatar (optionnel)</label>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-100 to-amber-100 dark:from-gold-900/30 dark:to-amber-900/20 flex items-center justify-center text-gold-700 dark:text-gold-300 font-bold text-sm border border-gold-400/20">
            {form.avatar ? (
              <img
                src={URL.createObjectURL(form.avatar)}
                alt="Avatar"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              form.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase() || <ImageIcon size={18} className="text-gold-400" />
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              setForm({ ...form, avatar: file })
            }}
            className="hidden"
            id="avatar-upload"
            disabled={fieldDisabled('avatar')}
          />
          <label
            htmlFor="avatar-upload"
            className="inline-flex items-center gap-1 px-3 py-2 bg-card border border-border rounded-xl text-xs cursor-pointer hover:bg-gold-400/5 transition disabled:opacity-50"
          >
            <Upload size={14} /> Télécharger
          </label>
          {form.avatar && (
            <button
              type="button"
              onClick={() => setForm({ ...form, avatar: null })}
              className="text-red-500 hover:underline text-xs"
            >
              <X size={14} className="inline mr-1" /> Retirer
            </button>
          )}
        </div>
      </div>

      {/* Switches : Vérifié, En avant */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.verified}
            onChange={(e) => setForm({ ...form, verified: e.target.checked })}
            disabled={fieldDisabled('verified')}
            className="rounded border-gray-300 text-gold-500 focus:ring-gold-400"
          />
          <span>Achat vérifié</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.is_featured}
            onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
            disabled={fieldDisabled('is_featured')}
            className="rounded border-gray-300 text-gold-500 focus:ring-gold-400"
          />
          <span>Mettre en avant</span>
        </label>
      </div>

      {/* Statut (affiché seulement si l'admin peut le changer) */}
      {!fieldDisabled('status') && (
        <div>
          <label htmlFor="testimonial-status" className="block text-sm font-medium mb-1">
            Statut
          </label>
          <select
            id="testimonial-status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as any })}
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50"
          >
            <option value="published">Publié</option>
            <option value="pending">En attente</option>
            <option value="rejected">Rejeté</option>
          </select>
        </div>
      )}

      {/* Dates (lecture seule) */}
      {initialData?.created_at && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Créé le : {new Date(initialData.created_at).toLocaleString('fr-FR')}</p>
          {initialData.updated_at && (
            <p>Mis à jour le : {new Date(initialData.updated_at).toLocaleString('fr-FR')}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Annuler
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving || Object.keys(errors).length > 0}
          className="bg-gold-500 hover:bg-gold-600 text-white min-w-[120px] justify-center"
        >
          {isSaving ? (
            <>
              <Loader2 size={16} className="animate-spin mr-1" /> Enregistrement...
            </>
          ) : (
            'Enregistrer'
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-right">
        Ctrl+Enter pour enregistrer
      </p>
    </motion.form>
  )
}

export default TestimonialForm