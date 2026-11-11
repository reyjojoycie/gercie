// app/admin/paiements/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'

import { cn } from '@/lib/utils'

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Banknote,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Image as ImageIcon,
  Info,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type PaymentMethodType =
  | 'mobile_money'
  | 'card'
  | 'bank_transfer'
  | 'cash_on_delivery'

interface PaymentMethod {
  id: string
  nom: string
  code: string
  type: PaymentMethodType
  logo_url?: string | null
  instructions?: string | null
  ordre?: number
  actif?: boolean
  created_at?: string
  updated_at?: string
}

interface MethodFormState {
  id?: string
  nom: string
  code: string
  type: PaymentMethodType
  logo_url: string | null
  logo_file: File | null
  logo_removed: boolean
  instructions: string
  ordre: number
  actif: boolean
}

interface ApiErrorPayload {
  error?: string
  details?: any
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const MAX_LOGO_SIZE = 2 * 1024 * 1024 // 2 Mo

const ACCEPTED_LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]

const TYPE_OPTIONS: {
  value: PaymentMethodType
  label: string
  description: string
  icon: React.ReactNode
  color: string
  badgeVariant: 'accent' | 'gold' | 'warm' | 'neutral'
}[] = [
  {
    value: 'mobile_money',
    label: 'Mobile Money',
    description: 'Orange Money / Airtel Money / M-Pesa',
    icon: <Smartphone size={18} />,
    color: 'from-orange-500/20 to-amber-500/20',
    badgeVariant: 'warm',
  },
  {
    value: 'card',
    label: 'Carte bancaire',
    description: 'Visa / Mastercard / Amex',
    icon: <CreditCard size={18} />,
    color: 'from-blue-500/20 to-indigo-500/20',
    badgeVariant: 'accent',
  },
  {
    value: 'bank_transfer',
    label: 'Virement bancaire',
    description: 'Paiement par transfert bancaire',
    icon: <Banknote size={18} />,
    color: 'from-emerald-500/20 to-teal-500/20',
    badgeVariant: 'gold',
  },
  {
    value: 'cash_on_delivery',
    label: 'Paiement à la livraison',
    description: 'Espèces à la réception',
    icon: <Package size={18} />,
    color: 'from-purple-500/20 to-pink-500/20',
    badgeVariant: 'neutral',
  },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'inactive', label: 'Inactifs' },
] as const

const inputClass =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const textareaClass =
  'w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const EMPTY_FORM: MethodFormState = {
  nom: '',
  code: '',
  type: 'mobile_money',
  logo_url: null,
  logo_file: null,
  logo_removed: false,
  instructions: '',
  ordre: 0,
  actif: true,
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50)
}

function getTypeConfig(type?: string | null) {
  return (
    TYPE_OPTIONS.find((option) => option.value === type) ||
    TYPE_OPTIONS[0]
  )
}

function getInitials(value: string): string {
  return String(value || '?')
    .trim()
    .split(/\s+/)
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
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
    return value
  }
}

function validateForm(form: MethodFormState): Partial<Record<keyof MethodFormState, string>> {
  const errors: Partial<Record<keyof MethodFormState, string>> = {}

  if (!form.nom.trim() || form.nom.trim().length < 2) {
    errors.nom = 'Le nom doit comporter au moins 2 caractères.'
  }

  if (!form.code.trim()) {
    errors.code = 'Le code est requis.'
  } else if (!/^[a-z0-9][a-z0-9-_]*$/.test(form.code.trim())) {
    errors.code = 'Code invalide. Utilise lettres minuscules, chiffres, - ou _.'
  }

  if (!TYPE_OPTIONS.some((option) => option.value === form.type)) {
    errors.type = 'Type de paiement invalide.'
  }

  if (!Number.isFinite(form.ordre) || form.ordre < 0) {
    errors.ordre = 'L’ordre doit être un nombre positif.'
  }

  if (form.instructions.length > 1000) {
    errors.instructions = 'Les instructions ne doivent pas dépasser 1000 caractères.'
  }

  return errors
}

function downloadJson(data: any, filename: string) {
  if (typeof window === 'undefined') return

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

async function uploadLogo(file: File, oldUrl?: string | null): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  if (oldUrl) {
    formData.append('old_url', oldUrl)
  }

  const res = await fetch('/api/admin/moyens-paiement/logo', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(json?.error || "Impossible d'envoyer le logo vers Supabase.")
  }

  return json.url as string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SOUS-COMPOSANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50',
        checked ? 'bg-gold-500' : 'bg-muted'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

function LogoPreview({
  url,
  name,
  type,
  size = 'md',
}: {
  url?: string | null
  name: string
  type: PaymentMethodType
  size?: 'sm' | 'md' | 'lg'
}) {
  const config = getTypeConfig(type)

  const dimensions =
    size === 'sm'
      ? 'h-10 w-10'
      : size === 'lg'
        ? 'h-20 w-20'
        : 'h-14 w-14'

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={cn(
          dimensions,
          'shrink-0 rounded-xl border border-border bg-white object-contain p-1.5 shadow-sm'
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        dimensions,
        'flex shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-sm font-bold text-muted-foreground'
      )}
      aria-hidden="true"
    >
      {config.icon}
    </div>
  )
}

function LogoUploader({
  file,
  existingUrl,
  onFileChange,
  onRemove,
  disabled,
  name,
  type,
}: {
  file: File | null
  existingUrl: string | null
  onFileChange: (file: File | null) => void
  onRemove: () => void
  disabled?: boolean
  name: string
  type: PaymentMethodType
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [localError, setLocalError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (!file) {
      setLocalPreview(null)
      return
    }

    const url = URL.createObjectURL(file)
    setLocalPreview(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const selected = files?.[0]
      if (!selected) return

      setLocalError('')

      if (!ACCEPTED_LOGO_TYPES.includes(selected.type)) {
        setLocalError('Formats acceptés : PNG, JPG, WEBP.')
        return
      }

      if (selected.size > MAX_LOGO_SIZE) {
        setLocalError('Taille maximale : 2 Mo.')
        return
      }

      onFileChange(selected)
    },
    [onFileChange]
  )

  const displayedUrl = localPreview || existingUrl

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <div
          className={cn(
            'relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition',
            dragOver
              ? 'border-gold-500 bg-gold-500/10'
              : displayedUrl
                ? 'border-border bg-card'
                : 'border-border bg-muted/40'
          )}
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (!disabled) handleFiles(e.dataTransfer.files)
          }}
        >
          {displayedUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayedUrl}
                alt={name || 'Aperçu logo'}
                className="h-full w-full object-contain p-2"
              />

              {localPreview && (
                <Badge
                  variant="gold"
                  size="sm"
                  className="absolute left-1 top-1"
                >
                  Nouveau
                </Badge>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageIcon size={24} />
              <span className="text-[10px]">Aucun logo</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline-gold"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              leftIcon={<Upload size={14} />}
            >
              {displayedUrl ? 'Changer le logo' : 'Choisir un logo'}
            </Button>

            {(displayedUrl || file) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="text-red-500 hover:bg-red-500/10"
                onClick={() => {
                  onRemove()
                  setLocalError('')
                }}
                leftIcon={<Trash2 size={14} />}
              >
                Retirer
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            PNG, JPG ou WEBP • 2 Mo maximum • Hébergé sur Supabase Storage.
          </p>

          {localError && (
            <p className="flex items-center gap-2 text-xs text-red-500">
              <AlertTriangle size={14} />
              {localError}
            </p>
          )}

          {!displayedUrl && (
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info size={14} className="text-gold-500" />
                Si aucun logo n’est fourni, une icône de secours sera affichée.
              </p>
            </div>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_LOGO_TYPES.join(',')}
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <LogoPreview url={null} name={name} type={type} size="sm" />
    </div>
  )
}

function MethodCard({
  method,
  onEdit,
  onDelete,
  onToggle,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  disabling,
  toggling,
  deleting,
  reorderedDisabled,
}: {
  method: PaymentMethod
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  disabling: boolean
  toggling: boolean
  deleting: boolean
  reorderedDisabled: boolean
}) {
  const config = getTypeConfig(method.type)
  const isActive = method.actif !== false

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative overflow-hidden rounded-3xl border bg-card/70 p-4 backdrop-blur-xl transition hover:shadow-card',
        isActive ? 'border-gold-400/20' : 'border-border opacity-80'
      )}
    >
      <div
        className={cn(
          'absolute inset-0 -z-10 bg-gradient-to-br opacity-0 transition group-hover:opacity-100',
          config.color
        )}
      />

      <div className="flex items-start gap-4">
        <LogoPreview
          url={method.logo_url}
          name={method.nom}
          type={method.type}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-foreground">
                {method.nom}
              </h3>

              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {method.code}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={config.badgeVariant} size="sm">
                <span className="mr-1">{config.icon}</span>
                {config.label}
              </Badge>

              <Badge variant={isActive ? 'accent' : 'neutral'} size="sm">
                {isActive ? 'Actif' : 'Inactif'}
              </Badge>
            </div>
          </div>

          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {method.instructions || config.description}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Ordre : {method.ordre ?? 0}</span>
            {method.updated_at && (
              <>
                <span>•</span>
                <span>Maj : {formatDateTime(method.updated_at)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <Tooltip content={isActive ? 'Désactiver' : 'Activer'}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggle}
              disabled={toggling}
              leftIcon={
                toggling ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isActive ? (
                  <ToggleRight size={14} className="text-emerald-500" />
                ) : (
                  <ToggleLeft size={14} className="text-muted-foreground" />
                )
              }
            >
              {isActive ? 'Actif' : 'Inactif'}
            </Button>
          </Tooltip>

          <Tooltip content="Modifier">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEdit}
              disabled={disabling}
              leftIcon={<Pencil size={14} />}
            >
              Modifier
            </Button>
          </Tooltip>

          <Tooltip content="Supprimer">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-500 hover:bg-red-500/10"
              onClick={onDelete}
              disabled={deleting}
              leftIcon={
                deleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )
              }
            >
              Supprimer
            </Button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip
            content={
              reorderedDisabled
                ? 'Réordonnement disponible sans filtre'
                : canMoveUp
                  ? 'Monter'
                  : 'Déjà en premier'
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onMoveUp}
              disabled={!canMoveUp || reorderedDisabled}
              aria-label="Monter le moyen de paiement"
            >
              <ArrowUp size={14} />
            </Button>
          </Tooltip>

          <Tooltip
            content={
              reorderedDisabled
                ? 'Réordonnement disponible sans filtre'
                : canMoveDown
                  ? 'Descendre'
                  : 'Déjà en dernier'
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onMoveDown}
              disabled={!canMoveDown || reorderedDisabled}
              aria-label="Descendre le moyen de paiement"
            >
              <ArrowDown size={14} />
            </Button>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  )
}

function MethodModal({
  open,
  onClose,
  form,
  setForm,
  saving,
  uploadingLogo,
  onSave,
  errors,
  isEditing,
}: {
  open: boolean
  onClose: () => void
  form: MethodFormState
  setForm: React.Dispatch<React.SetStateAction<MethodFormState>>
  saving: boolean
  uploadingLogo: boolean
  onSave: () => void
  errors: Partial<Record<keyof MethodFormState, string>>
  isEditing: boolean
}) {
  const [codeTouched, setCodeTouched] = useState(false)

  useEffect(() => {
    if (!open) {
      setCodeTouched(false)
    }
  }, [open])

  useEffect(() => {
    if (isEditing || codeTouched) return

    setForm((prev) => ({
      ...prev,
      code: slugify(prev.nom),
    }))
  }, [codeTouched, form.nom, isEditing, setForm])

  const config = getTypeConfig(form.type)

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEditing ? 'Modifier le moyen de paiement' : 'Nouveau moyen de paiement'}
      description="Les logos sont hébergés sur Supabase Storage, pas en dur dans le code."
      size="lg"
      accent="gold"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving || uploadingLogo}>
            Annuler
          </Button>

          <Button
            variant="luxe"
            onClick={onSave}
            disabled={saving || uploadingLogo}
            leftIcon={
              saving || uploadingLogo ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )
            }
          >
            {isEditing ? 'Enregistrer' : 'Créer'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/70 p-2 text-gold-600 dark:bg-midnight-800/70">
              {config.icon}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {config.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {config.description}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Nom du moyen <span className="text-red-500">*</span>
            </span>

            <input
              value={form.nom}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nom: e.target.value }))
              }
              placeholder="Ex : Orange Money"
              className={inputClass}
              disabled={saving || uploadingLogo}
            />

            {errors.nom && (
              <span className="block text-xs text-red-500">{errors.nom}</span>
            )}
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Code technique <span className="text-red-500">*</span>
            </span>

            <input
              value={form.code}
              onChange={(e) => {
                setCodeTouched(true)
                setForm((prev) => ({
                  ...prev,
                  code: slugify(e.target.value),
                }))
              }}
              placeholder="orange_money"
              className={cn(inputClass, 'font-mono')}
              disabled={saving || uploadingLogo}
            />

            {errors.code && (
              <span className="block text-xs text-red-500">{errors.code}</span>
            )}
          </label>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-foreground">
            Type <span className="text-red-500">*</span>
          </span>

          <div className="grid gap-3 sm:grid-cols-2">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={saving || uploadingLogo}
                onClick={() =>
                  setForm((prev) => ({ ...prev, type: option.value }))
                }
                className={cn(
                  'flex items-start gap-3 rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60',
                  form.type === option.value
                    ? 'border-gold-400 bg-gold-500/10'
                    : 'border-border bg-card hover:border-gold-400/40'
                )}
                aria-pressed={form.type === option.value}
              >
                <span className="mt-0.5 text-gold-500">{option.icon}</span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {option.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>

                {form.type === option.value && (
                  <CheckCircle2 size={16} className="shrink-0 text-gold-500" />
                )}
              </button>
            ))}
          </div>

          {errors.type && (
            <span className="mt-2 block text-xs text-red-500">{errors.type}</span>
          )}
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-foreground">
            Logo / image
          </span>

          <LogoUploader
            file={form.logo_file}
            existingUrl={form.logo_removed ? null : form.logo_url}
            name={form.nom}
            type={form.type}
            disabled={saving || uploadingLogo}
            onFileChange={(file) =>
              setForm((prev) => ({
                ...prev,
                logo_file: file,
                logo_removed: false,
              }))
            }
            onRemove={() =>
              setForm((prev) => ({
                ...prev,
                logo_file: null,
                logo_removed: true,
              }))
            }
          />
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Instructions affichées au client
          </span>

          <textarea
            value={form.instructions}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, instructions: e.target.value }))
            }
            rows={4}
            maxLength={1000}
            placeholder="Ex : Saisissez votre code PIN après le prompt USSD..."
            className={textareaClass}
            disabled={saving || uploadingLogo}
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Optionnel</span>
            <span>{form.instructions.length}/1000</span>
          </div>

          {errors.instructions && (
            <span className="block text-xs text-red-500">
              {errors.instructions}
            </span>
          )}
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Ordre d’affichage
            </span>

            <input
              type="number"
              min={0}
              value={form.ordre}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  ordre: Number(e.target.value) || 0,
                }))
              }
              className={inputClass}
              disabled={saving || uploadingLogo}
            />

            {errors.ordre && (
              <span className="block text-xs text-red-500">{errors.ordre}</span>
            )}
          </label>

          <div className="rounded-2xl border border-border bg-background/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Moyen actif
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Visible uniquement si activé.
                </p>
              </div>

              <Switch
                checked={form.actif}
                onChange={(v) => setForm((prev) => ({ ...prev, actif: v }))}
                label="Activer le moyen de paiement"
                disabled={saving || uploadingLogo}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function DeleteModal({
  open,
  onClose,
  method,
  deleting,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  method: PaymentMethod | null
  deleting: boolean
  onConfirm: () => void
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Supprimer ce moyen de paiement ?"
      description="Cette action est irréversible."
      size="sm"
      accent="red"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Annuler
          </Button>

          <Button
            variant="outline"
            className="border-red-500/40 text-red-500 hover:bg-red-500/10"
            onClick={onConfirm}
            disabled={deleting}
            leftIcon={
              deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )
            }
          >
            Supprimer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} />
            Attention
          </p>

          <p className="mt-2">
            Le moyen <strong>{method?.nom}</strong> sera supprimé du back-office
            et ne sera plus proposé aux clients.
          </p>
        </div>

        {method?.logo_url && (
          <p className="text-xs text-muted-foreground">
            Le logo hébergé sur Supabase Storage sera également supprimé si
            possible.
          </p>
        )}
      </div>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminPaiementsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const prefersReduced = useReducedMotion()
  const { user, loading: authLoading, isAdmin } = useAuth()

  const currentIsAdmin = Boolean(isAdmin)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | PaymentMethodType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<MethodFormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof MethodFormState, string>>>({})
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<PaymentMethod | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  /* ---------------------------------------------------------- */
  /* Titre page                                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Moyens de paiement | Admin Gercie'
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Guard admin                                                 */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent('/admin/paiements')}`
      )
      return
    }

    if (!currentIsAdmin) {
      router.replace('/')
    }
  }, [authLoading, currentIsAdmin, router, user])

  /* ---------------------------------------------------------- */
  /* Query moyens de paiement                                    */
  /* ---------------------------------------------------------- */

  const {
    data: methodsData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<PaymentMethod[]>({
    queryKey: ['admin-moyens-paiement'],
    queryFn: async () => {
      const res = await fetch('/api/admin/moyens-paiement', {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => [])

      if (!res.ok) {
        const payload = json as ApiErrorPayload
        throw new Error(payload?.error || 'Impossible de charger les moyens de paiement.')
      }

      return Array.isArray(json) ? json : json?.data || []
    },
    enabled: !!user && currentIsAdmin,
    staleTime: 30_000,
  })

  const methods = useMemo(() => {
    const list = Array.isArray(methodsData) ? methodsData : []

    return [...list]
      .filter((m) => m.type !== ('wallet' as any))
      .sort((a, b) => {
        const orderA = Number(a.ordre ?? 0)
        const orderB = Number(b.ordre ?? 0)

        if (orderA !== orderB) return orderA - orderB

        return String(a.nom || '').localeCompare(String(b.nom || ''))
      })
  }, [methodsData])

  const filteredMethods = useMemo(() => {
    const q = search.trim().toLowerCase()

    return methods.filter((method) => {
      const matchesSearch =
        !q ||
        method.nom?.toLowerCase().includes(q) ||
        method.code?.toLowerCase().includes(q) ||
        method.instructions?.toLowerCase().includes(q)

      const matchesType = typeFilter === 'all' || method.type === typeFilter

      const isActive = method.actif !== false
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive)

      return matchesSearch && matchesType && matchesStatus
    })
  }, [methods, search, statusFilter, typeFilter])

  const hasActiveFilters =
    Boolean(search.trim()) || typeFilter !== 'all' || statusFilter !== 'all'

  const stats = useMemo(() => {
    const total = methods.length
    const active = methods.filter((m) => m.actif !== false).length
    const inactive = total - active

    const byType = TYPE_OPTIONS.map((option) => ({
      ...option,
      count: methods.filter((m) => m.type === option.value).length,
    }))

    return { total, active, inactive, byType }
  }, [methods])

  /* ---------------------------------------------------------- */
  /* Mutations                                                   */
  /* ---------------------------------------------------------- */

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/moyens-paiement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Impossible de créer le moyen de paiement.')
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-moyens-paiement'] })
      closeModal()
      toast.addToast({ type: 'success', message: 'Moyen de paiement créé.' })
    },
    onError: (err: any) => {
      toast.addToast({
        type: 'error',
        message: err?.message || 'Erreur lors de la création.',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: any) => {
      const res = await fetch(`/api/admin/moyens-paiement/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Impossible de mettre à jour le moyen de paiement.')
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-moyens-paiement'] })
      closeModal()
      toast.addToast({ type: 'success', message: 'Moyen de paiement mis à jour.' })
    },
    onError: (err: any) => {
      toast.addToast({
        type: 'error',
        message: err?.message || 'Erreur lors de la mise à jour.',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/moyens-paiement/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Impossible de supprimer le moyen de paiement.')
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-moyens-paiement'] })
      setDeleteTarget(null)
      toast.addToast({ type: 'success', message: 'Moyen de paiement supprimé.' })
    },
    onError: (err: any) => {
      toast.addToast({
        type: 'error',
        message: err?.message || 'Erreur lors de la suppression.',
      })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, actif }: { id: string; actif: boolean }) => {
      const res = await fetch(`/api/admin/moyens-paiement/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ actif }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Impossible de modifier le statut.')
      }

      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-moyens-paiement'] })
    },
    onError: (err: any) => {
      toast.addToast({
        type: 'error',
        message: err?.message || 'Erreur lors du changement de statut.',
      })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; ordre: number }[]) => {
      for (const update of updates) {
        const res = await fetch(`/api/admin/moyens-paiement/${update.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ordre: update.ordre }),
        })

        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json?.error || 'Erreur lors du réordonnancement.')
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-moyens-paiement'] })
      toast.addToast({ type: 'success', message: 'Ordre mis à jour.' })
    },
    onError: (err: any) => {
      toast.addToast({
        type: 'error',
        message: err?.message || 'Impossible de réordonner les moyens.',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const openCreate = useCallback(() => {
    setForm({
      ...EMPTY_FORM,
      ordre: methods.length,
    })
    setErrors({})
    setModalOpen(true)
  }, [methods.length])

  const openEdit = useCallback((method: PaymentMethod) => {
    setForm({
      id: method.id,
      nom: method.nom || '',
      code: method.code || '',
      type: method.type,
      logo_url: method.logo_url || null,
      logo_file: null,
      logo_removed: false,
      instructions: method.instructions || '',
      ordre: Number(method.ordre ?? 0),
      actif: method.actif !== false,
    })
    setErrors({})
    setModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setErrors({})
    setSaving(false)
    setUploadingLogo(false)
  }, [])

  const handleSave = useCallback(async () => {
    const validationErrors = validateForm(form)

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      toast.addToast({
        type: 'error',
        message: 'Corrige les champs en rouge avant d’enregistrer.',
      })
      return
    }

    setSaving(true)
    setErrors({})

    try {
      let finalLogoUrl = form.logo_removed ? null : form.logo_url

      if (form.logo_file) {
        setUploadingLogo(true)
        finalLogoUrl = await uploadLogo(form.logo_file, form.logo_url)
        setUploadingLogo(false)
      }

      const payload = {
        nom: form.nom.trim(),
        code: form.code.trim(),
        type: form.type,
        logo_url: finalLogoUrl,
        instructions: form.instructions.trim() || null,
        ordre: form.ordre,
        actif: form.actif,
      }

      if (form.id) {
        await updateMutation.mutateAsync({ id: form.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
    } catch (err: any) {
      setUploadingLogo(false)
      toast.addToast({
        type: 'error',
        message: err?.message || 'Impossible d’enregistrer le moyen de paiement.',
      })
    } finally {
      setSaving(false)
    }
  }, [createMutation, form, toast, updateMutation])

  const handleToggle = useCallback(
    (method: PaymentMethod) => {
      toggleMutation.mutate({
        id: method.id,
        actif: method.actif === false,
      })
    },
    [toggleMutation]
  )

  const handleMove = useCallback(
    (methodId: string, direction: -1 | 1) => {
      if (hasActiveFilters) {
        toast.addToast({
          type: 'info',
          message: 'Retire les filtres pour réordonner les moyens.',
        })
        return
      }

      const currentIndex = methods.findIndex((m) => m.id === methodId)
      const targetIndex = currentIndex + direction

      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= methods.length) {
        return
      }

      const next = [...methods]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(targetIndex, 0, moved)

      const updates = next.map((method, index) => ({
        id: method.id,
        ordre: index,
      }))

      reorderMutation.mutate(updates)
    },
    [hasActiveFilters, methods, reorderMutation, toast]
  )

  const handleCopyCode = useCallback(
    async (method: PaymentMethod) => {
      const ok = await copyText(method.code)

      if (ok) {
        setCopiedId(method.id)
        toast.addToast({ type: 'success', message: 'Code copié.' })
        setTimeout(() => setCopiedId(null), 1800)
      } else {
        toast.addToast({ type: 'error', message: 'Copie impossible.' })
      }
    },
    [toast]
  )

  const handleExport = useCallback(() => {
    if (methods.length === 0) {
      toast.addToast({ type: 'error', message: 'Aucun moyen à exporter.' })
      return
    }

    downloadJson(
      methods,
      `moyens-paiement-${new Date().toISOString().slice(0, 10)}.json`
    )

    toast.addToast({ type: 'success', message: 'Export JSON réalisé.' })
  }, [methods, toast])

  /* ---------------------------------------------------------- */
  /* Rendu                                                       */
  /* ---------------------------------------------------------- */

  if (authLoading || !currentIsAdmin) {
    return (
      <Container className="py-10">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full rounded-3xl" />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-3xl" />
            ))}
          </div>
        </div>
      </Container>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8 md:py-10">
        {/* Header */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-extrabold text-foreground font-serif md:text-4xl">
              <ShieldCheck size={30} className="text-gold-500" />
              Moyens de paiement
            </h1>

            <p className="mt-2 text-muted-foreground">
              Configure les modes de paiement acceptés par la plateforme. Les
              logos sont stockés sur Supabase, jamais en dur.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="gold" size="sm">
                {stats.active} actif{stats.active > 1 ? 's' : ''}
              </Badge>

              <Badge variant="neutral" size="sm">
                {stats.inactive} inactif{stats.inactive > 1 ? 's' : ''}
              </Badge>

              <Badge variant="accent" size="sm">
                {stats.total} moyen{stats.total > 1 ? 's' : ''}
              </Badge>

              {isFetching && (
                <Badge variant="warm" size="sm">
                  <Loader2 size={12} className="mr-1 animate-spin" />
                  Synchronisation
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              leftIcon={
                isFetching ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )
              }
            >
              Actualiser
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              leftIcon={<Download size={14} />}
            >
              Exporter
            </Button>

            <Button
              variant="luxe"
              size="sm"
              onClick={openCreate}
              leftIcon={<Plus size={14} />}
            >
              Nouveau moyen
            </Button>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.byType.map((item) => (
            <Card key={item.value} className="border-border bg-card/70">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-muted p-2 text-gold-500">
                      {item.icon}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <p className="text-2xl font-extrabold text-gold-600">
                    {item.count}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un moyen..."
                className={cn(inputClass, 'pl-9')}
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Effacer la recherche"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Filter size={16} className="text-muted-foreground" />

              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as 'all' | PaymentMethodType)
                }
                className={cn(inputClass, 'h-10 w-auto py-0')}
              >
                <option value="all">Tous les types</option>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')
                }
                className={cn(inputClass, 'h-10 w-auto py-0')}
              >
                {STATUS_FILTERS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {filteredMethods.length} affiché{filteredMethods.length > 1 ? 's' : ''} sur {methods.length}
            </span>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setTypeFilter('all')
                  setStatusFilter('all')
                }}
                leftIcon={<X size={14} />}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </div>

        {/* Alertes */}
        {isError && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Erreur de chargement</p>
                <p className="mt-1">
                  {error instanceof Error
                    ? error.message
                    : 'Impossible de charger les moyens de paiement.'}
                </p>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        {/* Contenu */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full rounded-3xl" />
            ))}
          </div>
        ) : filteredMethods.length === 0 ? (
          <Card className="border-border bg-card/70">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-gold-400/30 bg-gold-400/10">
                <CreditCard size={36} className="text-gold-500" />
              </div>

              <h2 className="text-xl font-bold text-foreground">
                Aucun moyen de paiement
              </h2>

              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {hasActiveFilters
                  ? 'Aucun résultat avec ces filtres. Réinitialise la recherche ou crée un nouveau moyen.'
                  : 'Crée ton premier moyen de paiement pour accepter Mobile Money, carte, virement ou paiement à la livraison.'}
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('')
                      setTypeFilter('all')
                      setStatusFilter('all')
                    }}
                    leftIcon={<X size={14} />}
                  >
                    Effacer les filtres
                  </Button>
                )}

                <Button variant="luxe" onClick={openCreate} leftIcon={<Plus size={14} />}>
                  Créer un moyen
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            layout
            className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {filteredMethods.map((method, index) => (
                <MethodCard
                  key={method.id}
                  method={method}
                  onEdit={() => openEdit(method)}
                  onDelete={() => setDeleteTarget(method)}
                  onToggle={() => handleToggle(method)}
                  onMoveUp={() => handleMove(method.id, -1)}
                  onMoveDown={() => handleMove(method.id, 1)}
                  canMoveUp={index > 0 && !hasActiveFilters}
                  canMoveDown={index < filteredMethods.length - 1 && !hasActiveFilters}
                  disabling={createMutation.isPending || updateMutation.isPending}
                  toggling={toggleMutation.isPending && toggleMutation.variables?.id === method.id}
                  deleting={deleteMutation.isPending && deleteMutation.variables === method.id}
                  reorderedDisabled={hasActiveFilters || reorderMutation.isPending}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Aide */}
        <Card variant="glass" className="mt-10 border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info size={18} className="text-gold-500" />
              Bonne pratique
            </CardTitle>
            <CardDescription>
              Recommandations pour configurer les paiements sans portefeuille interne.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Smartphone size={14} className="text-gold-500" />
                Mobile Money
              </p>
              <p className="mt-2">
                Privilégie Orange Money, Airtel Money et M-Pesa pour la RDC.
                Ajoute des instructions claires pour le prompt USSD.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <CreditCard size={14} className="text-gold-500" />
                Carte bancaire
              </p>
              <p className="mt-2">
                Utilise un PSP sécurisé. Ne stocke jamais les données cartes en
                clair dans ta base.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Upload size={14} className="text-gold-500" />
                Logos Supabase
              </p>
              <p className="mt-2">
                Les images sont envoyées dans le bucket
                <span className="mx-1 font-mono text-xs">moyens-paiement-logos</span>
                afin d’éviter les fichiers en dur.
              </p>
            </div>
          </CardContent>
        </Card>
      </Container>

      {/* Modal création / édition */}
      <MethodModal
        open={modalOpen}
        onClose={closeModal}
        form={form}
        setForm={setForm}
        saving={saving || createMutation.isPending || updateMutation.isPending}
        uploadingLogo={uploadingLogo}
        onSave={handleSave}
        errors={errors}
        isEditing={Boolean(form.id)}
      />

      {/* Modal suppression */}
      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        method={deleteTarget}
        deleting={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />
    </div>
  )
}