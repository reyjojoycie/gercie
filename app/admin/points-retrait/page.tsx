// app/admin/points-retrait/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Building,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Globe,
  Info,
  Layers,
  Mail,
  Map,
  MapPin,
  MoreHorizontal,
  Navigation,
  Pencil,
  Phone,
  Pin,
  Plus,
  QrCode,
  RefreshCcw,
  Route,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  Store,
  Trash2,
  Upload,
  User,
  X,
  XCircle,
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

import { cn } from '@/lib/utils'

import {
  buildDirectionsUrl,
  buildMapsUrl,
  buildOsmEmbedUrl,
  buildQrUrl,
  computePickupStats,
  haversineDistanceKm,
  pickupPointsToCsv,
  type PickupPoint,
  type PickupPointStats,
} from '@/lib/pickup-points'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES LOCAUX                                                   */
/* ═══════════════════════════════════════════════════════════════ */

interface Commune {
  id: number
  nom: string
}

interface FormState {
  id?: number
  nom: string
  adresse: string
  telephone: string
  email: string
  site_web: string
  whatsapp: string
  commune_id: string
  province_nom: string
  ville_nom: string
  quartier: string
  avenue: string
  numero: string
  code_postal: string
  reference: string
  latitude: string
  longitude: string
  horaires: string
  contact_nom: string
  type_etablissement: string
  photo_url: string
  points_de_repere: string
  instructions_retrait: string
  est_actif: boolean
  est_partenaire_verifie: boolean
  note_moyenne: string
  capacite: string
  delai_moyen_heures: string
  sort_order: string
}

type ViewMode = 'table' | 'cards' | 'map'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function notify(
  toast: any,
  type: 'success' | 'error' | 'info' | 'warning',
  message: string
) {
  if (typeof toast?.addToast === 'function') {
    toast.addToast({ type, message })
    return
  }

  if (typeof toast?.show === 'function') {
    toast.show({ type, message })
  }
}

function numToString(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null

  const n = Number(trimmed.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function emptyForm(): FormState {
  return {
    nom: '',
    adresse: '',
    telephone: '',
    email: '',
    site_web: '',
    whatsapp: '',
    commune_id: '',
    province_nom: '',
    ville_nom: '',
    quartier: '',
    avenue: '',
    numero: '',
    code_postal: '',
    reference: '',
    latitude: '',
    longitude: '',
    horaires: '',
    contact_nom: '',
    type_etablissement: '',
    photo_url: '',
    points_de_repere: '',
    instructions_retrait: '',
    est_actif: true,
    est_partenaire_verifie: false,
    note_moyenne: '',
    capacite: '',
    delai_moyen_heures: '',
    sort_order: '0',
  }
}

function pointToForm(point: PickupPoint): FormState {
  return {
    id: point.id,
    nom: point.nom,
    adresse: point.adresse,
    telephone: point.telephone || '',
    email: point.email || '',
    site_web: point.site_web || '',
    whatsapp: point.whatsapp || '',
    commune_id: numToString(point.commune_id),
    province_nom: point.province_nom || '',
    ville_nom: point.ville_nom || '',
    quartier: point.quartier || '',
    avenue: point.avenue || '',
    numero: point.numero || '',
    code_postal: point.code_postal || '',
    reference: point.reference || '',
    latitude: numToString(point.latitude),
    longitude: numToString(point.longitude),
    horaires: point.horaires || '',
    contact_nom: point.contact_nom || '',
    type_etablissement: point.type_etablissement || '',
    photo_url: point.photo_url || '',
    points_de_repere: point.points_de_repere || '',
    instructions_retrait: point.instructions_retrait || '',
    est_actif: point.est_actif,
    est_partenaire_verifie: point.est_partenaire_verifie,
    note_moyenne: numToString(point.note_moyenne),
    capacite: numToString(point.capacite),
    delai_moyen_heures: numToString(point.delai_moyen_heures),
    sort_order: numToString(point.sort_order),
  }
}

function formToPayload(form: FormState) {
  return {
    id: form.id,
    nom: form.nom.trim(),
    adresse: form.adresse.trim(),
    telephone: form.telephone.trim() || null,
    email: form.email.trim() || null,
    site_web: form.site_web.trim() || null,
    whatsapp: form.whatsapp.trim() || null,
    commune_id: parseOptionalNumber(form.commune_id),
    province_nom: form.province_nom.trim() || null,
    ville_nom: form.ville_nom.trim() || null,
    quartier: form.quartier.trim() || null,
    avenue: form.avenue.trim() || null,
    numero: form.numero.trim() || null,
    code_postal: form.code_postal.trim() || null,
    reference: form.reference.trim() || null,
    latitude: parseOptionalNumber(form.latitude),
    longitude: parseOptionalNumber(form.longitude),
    horaires: form.horaires.trim() || null,
    contact_nom: form.contact_nom.trim() || null,
    type_etablissement: form.type_etablissement.trim() || null,
    photo_url: form.photo_url.trim() || null,
    points_de_repere: form.points_de_repere.trim() || null,
    instructions_retrait: form.instructions_retrait.trim() || null,
    est_actif: form.est_actif,
    est_partenaire_verifie: form.est_partenaire_verifie,
    note_moyenne: parseOptionalNumber(form.note_moyenne),
    capacite: parseOptionalNumber(form.capacite),
    delai_moyen_heures: parseOptionalNumber(form.delai_moyen_heures),
    sort_order: parseOptionalNumber(form.sort_order) ?? 0,
  }
}

function normalizeHeader(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    if (char === '\r') {
      continue
    }

    field += char
  }

  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  if (rows.length < 2) return []

  const headers = rows[0].map(normalizeHeader)

  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {}

    headers.forEach((header, index) => {
      obj[header] = cells[index] ?? ''
    })

    return obj
  })
}

function mapCsvRowToPayload(row: Record<string, string>) {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const normalized = normalizeHeader(key)
      if (row[normalized] !== undefined && row[normalized] !== '') {
        return row[normalized]
      }
    }
    return ''
  }

  return {
    nom: get('nom', 'name', 'point'),
    adresse: get('adresse', 'address'),
    telephone: get('telephone', 'phone', 'tel'),
    email: get('email'),
    site_web: get('site_web', 'website', 'url'),
    whatsapp: get('whatsapp', 'wa'),
    commune_id: get('commune_id', 'commune'),
    province_nom: get('province_nom', 'province'),
    ville_nom: get('ville_nom', 'ville', 'city'),
    quartier: get('quartier'),
    avenue: get('avenue', 'rue', 'street'),
    numero: get('numero', 'number', 'num'),
    code_postal: get('code_postal', 'postal_code', 'zip'),
    reference: get('reference', 'ref'),
    latitude: get('latitude', 'lat'),
    longitude: get('longitude', 'longitude', 'lng', 'lon'),
    horaires: get('horaires', 'hours', 'opening_hours'),
    contact_nom: get('contact_nom', 'contact', 'responsable'),
    type_etablissement: get('type_etablissement', 'type', 'establishment_type'),
    photo_url: get('photo_url', 'photo', 'image_url'),
    points_de_repere: get('points_de_repere', 'landmarks', 'repere'),
    instructions_retrait: get(
      'instructions_retrait',
      'pickup_instructions',
      'instructions'
    ),
    est_actif: get('est_actif', 'active', 'is_active') || 'true',
    est_partenaire_verifie:
      get('est_partenaire_verifie', 'verified', 'is_verified') || 'false',
    note_moyenne: get('note_moyenne', 'rating', 'note'),
    capacite: get('capacite', 'capacity'),
    delai_moyen_heures: get(
      'delai_moyen_heures',
      'delay_hours',
      'delai',
      'delay'
    ),
    sort_order: get('sort_order', 'order'),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UI PRIMITIVES                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function AdminModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [onClose, open])

  if (!open) return null

  const sizeClass =
    size === 'sm'
      ? 'max-w-md'
      : size === 'lg'
        ? 'max-w-3xl'
        : size === 'xl'
          ? 'max-w-5xl'
          : 'max-w-2xl'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full rounded-2xl border border-border bg-card shadow-2xl',
          sizeClass
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-3 border-t border-border p-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>

      {children}

      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  step,
  min,
  max,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  step?: string
  min?: string
  max?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      className={cn(
        'w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60',
        className
      )}
    />
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  className?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={cn(
        'w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60',
        className
      )}
    />
  )
}

function SelectInput({
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={cn(
        'w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60',
        className
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function CheckboxField({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-background/50 p-3 transition hover:border-gold-400/40',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-border text-gold-500 focus:ring-gold-500"
      />
    </label>
  )
}

function StatCard({
  title,
  value,
  icon,
  color,
  onClick,
}: {
  title: string
  value: string | number
  icon: ReactNode
  color: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-border bg-card p-4 text-left transition hover:border-gold-400/40 hover:shadow-gold focus:outline-none focus:ring-2 focus:ring-gold-500',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        </div>

        <div className={cn('rounded-xl p-2', color)}>{icon}</div>
      </div>
    </button>
  )
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/30 p-10 text-center">
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {start}-{end} sur {totalItems}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={String(pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
        >
          <option value="5">5 / page</option>
          <option value="10">10 / page</option>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>

        <Button
          variant="outline-gold"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Page précédente"
        >
          <ChevronLeft size={16} />
        </Button>

        <span className="text-sm text-muted-foreground">
          {page} / {Math.max(1, totalPages)}
        </span>

        <Button
          variant="outline-gold"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          aria-label="Page suivante"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function PointsRetraitAdminPage() {
  const auth = useAuth() as any
  const user = auth?.user
  const authLoading = Boolean(auth?.loading)

  const isAdmin = Boolean(
    auth?.isAdmin ??
      user?.user_metadata?.role === 'admin' ??
      user?.app_metadata?.role === 'admin' ??
      user?.is_admin
  )

  const toast = useToast() as any
  const queryClient = useQueryClient()

  const [points, setPoints] = useState<PickupPoint[]>([])
  const [stats, setStats] = useState<PickupPointStats | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [cityFilter, setCityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [noteFilter, setNoteFilter] = useState<'all' | '4+' | '3+' | '<3'>('all')
  const [coordsFilter, setCoordsFilter] = useState<'all' | 'with' | 'without'>('all')

  const [sortColumn, setSortColumn] = useState<
    'nom' | 'ville' | 'note' | 'created_at' | 'distance' | 'sort_order'
  >('sort_order')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PickupPoint | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)

  const [detail, setDetail] = useState<PickupPoint | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PickupPoint | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [csvText, setCsvText] = useState('')
  const [importPreview, setImportPreview] = useState<Record<string, string>[]>([])

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [mapPointId, setMapPointId] = useState<number | null>(null)

  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  /* ---------------------------------------------------------- */
  /* Fetch points                                                */
  /* ---------------------------------------------------------- */

  const query = useQuery({
    queryKey: ['admin-points-retrait'],
    enabled: Boolean(user && isAdmin),
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const res = await fetch('/api/admin/points-retrait', {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Erreur lors du chargement des points.')
      }

      return json as {
        success: boolean
        data: PickupPoint[]
        meta?: { stats?: PickupPointStats }
      }
    },
  })

  useEffect(() => {
    if (query.data) {
      setPoints(Array.isArray(query.data.data) ? query.data.data : [])
      setStats(query.data.meta?.stats ?? computePickupStats(query.data.data ?? []))
    }
  }, [query.data])

  /* ---------------------------------------------------------- */
  /* Fetch communes optionnel                                    */
  /* ---------------------------------------------------------- */

  const communesQuery = useQuery<Commune[]>({
    queryKey: ['communes-all'],
    enabled: Boolean(user && isAdmin),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      try {
        const res = await fetch('/api/communes/all', { cache: 'no-store' })
        if (!res.ok) return []
        const json = await res.json()
        return Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : []
      } catch {
        return []
      }
    },
  })

  const communes = communesQuery.data ?? []

  /* ---------------------------------------------------------- */
  /* Action API                                                  */
  /* ---------------------------------------------------------- */

  const callAction = useCallback(
    async (action: string, payload?: any, successMessage?: string) => {
      setBusy(true)

      try {
        const res = await fetch('/api/admin/points-retrait', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action, payload }),
        })

        const json = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(json?.error || 'Erreur serveur.')
        }

        if (successMessage) {
          notify(toast, 'success', successMessage)
        }

        await queryClient.invalidateQueries({ queryKey: ['admin-points-retrait'] })
        await query.refetch()

        return json
      } catch (err: any) {
        notify(toast, 'error', err?.message || 'Erreur lors de l’action.')
        throw err
      } finally {
        setBusy(false)
      }
    },
    [query, queryClient, toast]
  )

  /* ---------------------------------------------------------- */
  /* Geolocation                                                 */
  /* ---------------------------------------------------------- */

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      notify(toast, 'warning', 'Géolocalisation non disponible sur cet appareil.')
      return
    }

    setLocationLoading(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        notify(toast, 'success', 'Position mise à jour.')
        setLocationLoading(false)
      },
      () => {
        notify(toast, 'error', 'Impossible d’obtenir ta position.')
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [toast])

  /* ---------------------------------------------------------- */
  /* Derived list                                                */
  /* ---------------------------------------------------------- */

  const enrichedPoints = useMemo(() => {
    if (!userLocation) return points

    return points.map((point) => {
      if (point.latitude === null || point.longitude === null) {
        return { ...point, distance: undefined }
      }

      const distance = haversineDistanceKm(
        userLocation.lat,
        userLocation.lng,
        point.latitude,
        point.longitude
      )

      return { ...point, distance: Number(distance.toFixed(2)) }
    })
  }, [points, userLocation])

  const filteredPoints = useMemo(() => {
    let list = [...enrichedPoints]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (point) =>
          point.nom.toLowerCase().includes(q) ||
          point.adresse.toLowerCase().includes(q) ||
          (point.ville_nom || '').toLowerCase().includes(q) ||
          (point.quartier || '').toLowerCase().includes(q) ||
          (point.contact_nom || '').toLowerCase().includes(q) ||
          (point.type_etablissement || '').toLowerCase().includes(q) ||
          (point.reference || '').toLowerCase().includes(q)
      )
    }

    if (statusFilter === 'active') {
      list = list.filter((point) => point.est_actif)
    } else if (statusFilter === 'inactive') {
      list = list.filter((point) => !point.est_actif)
    }

    if (verifiedFilter === 'yes') {
      list = list.filter((point) => point.est_partenaire_verifie)
    } else if (verifiedFilter === 'no') {
      list = list.filter((point) => !point.est_partenaire_verifie)
    }

    if (cityFilter.trim()) {
      const q = cityFilter.toLowerCase()
      list = list.filter((point) =>
        (point.ville_nom || '').toLowerCase().includes(q)
      )
    }

    if (typeFilter.trim()) {
      const q = typeFilter.toLowerCase()
      list = list.filter((point) =>
        (point.type_etablissement || '').toLowerCase().includes(q)
      )
    }

    if (noteFilter === '4+') {
      list = list.filter((point) => (point.note_moyenne || 0) >= 4)
    } else if (noteFilter === '3+') {
      list = list.filter((point) => (point.note_moyenne || 0) >= 3)
    } else if (noteFilter === '<3') {
      list = list.filter((point) => (point.note_moyenne || 0) < 3)
    }

    if (coordsFilter === 'with') {
      list = list.filter(
        (point) => point.latitude !== null && point.longitude !== null
      )
    } else if (coordsFilter === 'without') {
      list = list.filter(
        (point) => point.latitude === null || point.longitude === null
      )
    }

    return list
  }, [
    enrichedPoints,
    search,
    statusFilter,
    verifiedFilter,
    cityFilter,
    typeFilter,
    noteFilter,
    coordsFilter,
  ])

  const sortedPoints = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1

    return [...filteredPoints].sort((a, b) => {
      let comparison = 0

      if (sortColumn === 'nom') {
        comparison = a.nom.localeCompare(b.nom)
      } else if (sortColumn === 'ville') {
        comparison = (a.ville_nom || '').localeCompare(b.ville_nom || '')
      } else if (sortColumn === 'note') {
        comparison = (a.note_moyenne || 0) - (b.note_moyenne || 0)
      } else if (sortColumn === 'created_at') {
        comparison = String(a.created_at).localeCompare(String(b.created_at))
      } else if (sortColumn === 'distance') {
        const aDist = a.distance ?? Number.POSITIVE_INFINITY
        const bDist = b.distance ?? Number.POSITIVE_INFINITY
        comparison = aDist - bDist
      } else {
        comparison = a.sort_order - b.sort_order
      }

      return comparison * dir
    })
  }, [filteredPoints, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedPoints.length / pageSize))
  const paginatedPoints = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedPoints.slice(start, start + pageSize)
  }, [page, pageSize, sortedPoints])

  const displayStats = stats ?? computePickupStats(points)

  const cityOptions = useMemo(() => {
    const set = new Set(
      points.map((point) => textOrNull(point.ville_nom)).filter(Boolean) as string[]
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [points])

  const typeOptions = useMemo(() => {
    const set = new Set(
      points
        .map((point) => textOrNull(point.type_etablissement))
        .filter(Boolean) as string[]
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [points])

  const selectedMapPoint = useMemo(() => {
    if (mapPointId) {
      const found = sortedPoints.find((point) => point.id === mapPointId)
      if (found) return found
    }

    return (
      sortedPoints.find(
        (point) => point.latitude !== null && point.longitude !== null
      ) ?? sortedPoints[0] ?? null
    )
  }, [mapPointId, sortedPoints])

  /* ---------------------------------------------------------- */
  /* Selection                                                   */
  /* ---------------------------------------------------------- */

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selected.size === paginatedPoints.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(paginatedPoints.map((point) => point.id)))
    }
  }, [paginatedPoints, selected.size])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  useEffect(() => {
    clearSelection()
  }, [page, search, statusFilter, verifiedFilter, cityFilter, typeFilter, noteFilter, coordsFilter, sortColumn, sortDirection, clearSelection])

  /* ---------------------------------------------------------- */
  /* Form handlers                                               */
  /* ---------------------------------------------------------- */

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((point: PickupPoint) => {
    setEditing(point)
    setForm(pointToForm(point))
    setFormError(null)
    setModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
  }, [])

  const handleSave = useCallback(async () => {
    setFormError(null)

    const payload = formToPayload(form)

    if (!payload.nom) {
      setFormError('Le nom est requis.')
      return
    }

    if (!payload.adresse) {
      setFormError('L’adresse est requise.')
      return
    }

    setSaving(true)

    try {
      await callAction('save', payload, editing ? 'Point mis à jour.' : 'Point créé.')
      closeModal()
    } catch {
      // erreur déjà notifiée
    } finally {
      setSaving(false)
    }
  }, [callAction, closeModal, editing, form])

  const handleDelete = useCallback(
    async (point: PickupPoint) => {
      setDeleting(true)

      try {
        await callAction('delete', { id: point.id }, 'Point supprimé.')
        setDeleteTarget(null)
      } catch {
        // erreur déjà notifiée
      } finally {
        setDeleting(false)
      }
    },
    [callAction]
  )

  const handleToggleActive = useCallback(
    async (point: PickupPoint) => {
      try {
        await callAction(
          'save',
          { id: point.id, est_actif: !point.est_actif },
          point.est_actif ? 'Point désactivé.' : 'Point activé.'
        )
      } catch {
        // erreur déjà notifiée
      }
    },
    [callAction]
  )

  const handleToggleVerified = useCallback(
    async (point: PickupPoint) => {
      try {
        await callAction(
          'save',
          {
            id: point.id,
            est_partenaire_verifie: !point.est_partenaire_verifie,
          },
          point.est_partenaire_verifie
            ? 'Vérification retirée.'
            : 'Partenaire vérifié.'
        )
      } catch {
        // erreur déjà notifiée
      }
    },
    [callAction]
  )

  const handleDuplicate = useCallback(
    async (point: PickupPoint) => {
      try {
        await callAction('bulk', { bulkAction: 'duplicate', ids: [point.id] }, 'Point dupliqué.')
      } catch {
        // erreur déjà notifiée
      }
    },
    [callAction]
  )

  const handleBulk = useCallback(
    async (bulkAction: string) => {
      const ids = Array.from(selected)
      if (ids.length === 0) return

      if (
        bulkAction === 'delete' &&
        !window.confirm(`Supprimer ${ids.length} point(s) ?`)
      ) {
        return
      }

      try {
        await callAction(
          'bulk',
          { bulkAction, ids },
          'Action de masse appliquée.'
        )
        clearSelection()
      } catch {
        // erreur déjà notifiée
      }
    },
    [callAction, clearSelection, selected]
  )

  /* ---------------------------------------------------------- */
  /* CSV                                                         */
  /* ---------------------------------------------------------- */

  const handleExportCsv = useCallback(() => {
    try {
      const csv = pickupPointsToCsv(sortedPoints)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `points_retrait_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      notify(toast, 'success', 'Export CSV généré.')
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur lors de l’export.')
    }
  }, [sortedPoints, toast])

  const handleCsvTextChange = useCallback((value: string) => {
    setCsvText(value)

    try {
      const parsed = parseCsv(value)
      setImportPreview(parsed.map(mapCsvRowToPayload).slice(0, 50))
    } catch {
      setImportPreview([])
    }
  }, [])

  const handleFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      const reader = new FileReader()

      reader.onload = () => {
        handleCsvTextChange(String(reader.result || ''))
      }

      reader.onerror = () => {
        notify(toast, 'error', 'Impossible de lire le fichier.')
      }

      reader.readAsText(file)
      event.target.value = ''
    },
    [handleCsvTextChange, toast]
  )

  const handleImport = useCallback(async () => {
    if (importPreview.length === 0) {
      notify(toast, 'error', 'Aucune ligne valide à importer.')
      return
    }

    try {
      await callAction(
        'import',
        { mode: importMode, rows: importPreview },
        `${importPreview.length} point(s) importé(s).`
      )

      setImportOpen(false)
      setCsvText('')
      setImportPreview([])
    } catch {
      // erreur déjà notifiée
    }
  }, [callAction, importMode, importPreview, toast])

  /* ---------------------------------------------------------- */
  /* Clipboard / share                                           */
  /* ---------------------------------------------------------- */

  const copyAddress = useCallback(
    async (point: PickupPoint) => {
      const text = `${point.nom}\n${point.adresse}\n${point.ville_nom || ''}`.trim()

      try {
        await navigator.clipboard.writeText(text)
        notify(toast, 'success', 'Adresse copiée.')
      } catch {
        notify(toast, 'error', 'Impossible de copier l’adresse.')
      }
    },
    [toast]
  )

  const sharePoint = useCallback(
    async (point: PickupPoint) => {
      const url = buildMapsUrl(point)

      try {
        if (navigator.share) {
          await navigator.share({
            title: point.nom,
            text: `${point.nom} - ${point.adresse}`,
            url,
          })
        } else {
          await navigator.clipboard.writeText(url)
          notify(toast, 'success', 'Lien copié.')
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          notify(toast, 'error', 'Impossible de partager.')
        }
      }
    },
    [toast]
  )

  /* ---------------------------------------------------------- */
  /* Sort handler                                                */
  /* ---------------------------------------------------------- */

  const handleSort = useCallback(
    (column: typeof sortColumn) => {
      if (sortColumn === column) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortColumn(column)
        setSortDirection('asc')
      }
    },
    [sortColumn]
  )

  /* ---------------------------------------------------------- */
  /* Access control                                              */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Skeleton variant="circular" className="h-12 w-12" shimmer shimmerVariant="gold" />
      </div>
    )
  }

  if (!user || !isAdmin) {
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <ShieldCheck size={40} className="mx-auto mb-4 text-muted-foreground" />

          <h1 className="text-xl font-bold text-foreground">
            Accès réservé
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Tu dois être administrateur pour gérer les points de retrait.
          </p>
        </div>
      </Container>
    )
  }

  return (
    <div className="relative min-h-screen bg-background pb-16">
      <div className="pointer-events-none absolute inset-0 pattern-dots opacity-5 dark:opacity-10" />

      <Container className="relative z-10 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground md:text-3xl">
              <div className="rounded-xl bg-gold-100 p-2 text-gold-600 dark:bg-gold-900/30 dark:text-gold-400">
                <MapPin size={24} />
              </div>
              Points de retrait
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Gérez les relais colis, adresses, coordonnées GPS, vérifications et disponibilités.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => query.refetch()}
              loading={query.isFetching}
              leftIcon={<RefreshCcw size={14} />}
            >
              Actualiser
            </Button>

            <Button
              variant="outline-gold"
              size="sm"
              onClick={handleExportCsv}
              leftIcon={<Download size={14} />}
            >
              Export CSV
            </Button>

            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => setImportOpen(true)}
              leftIcon={<Upload size={14} />}
            >
              Import CSV
            </Button>

            <Button
              variant="outline-gold"
              size="sm"
              onClick={requestLocation}
              loading={locationLoading}
              leftIcon={<Navigation size={14} />}
            >
              Ma position
            </Button>

            <Button
              variant="luxe"
              size="sm"
              onClick={openAdd}
              leftIcon={<Plus size={14} />}
            >
              Ajouter
            </Button>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <StatCard
            title="Total"
            value={displayStats.total}
            icon={<MapPin size={18} className="text-gold-500" />}
            color="bg-gold-500/10"
            onClick={() => {
              setStatusFilter('all')
              setVerifiedFilter('all')
              setCoordsFilter('all')
            }}
          />

          <StatCard
            title="Actifs"
            value={displayStats.actifs}
            icon={<CheckCircle2 size={18} className="text-emerald-500" />}
            color="bg-emerald-500/10"
            onClick={() => setStatusFilter('active')}
          />

          <StatCard
            title="Inactifs"
            value={displayStats.inactifs}
            icon={<XCircle size={18} className="text-red-500" />}
            color="bg-red-500/10"
            onClick={() => setStatusFilter('inactive')}
          />

          <StatCard
            title="Vérifiés"
            value={displayStats.verifies}
            icon={<BadgeCheck size={18} className="text-blue-500" />}
            color="bg-blue-500/10"
            onClick={() => setVerifiedFilter('yes')}
          />

          <StatCard
            title="Avec GPS"
            value={displayStats.avecCoords}
            icon={<Globe size={18} className="text-purple-500" />}
            color="bg-purple-500/10"
            onClick={() => setCoordsFilter('with')}
          />

          <StatCard
            title="Sans GPS"
            value={displayStats.sansCoords}
            icon={<AlertCircle size={18} className="text-amber-500" />}
            color="bg-amber-500/10"
            onClick={() => setCoordsFilter('without')}
          />

          <StatCard
            title="Note moy."
            value={displayStats.avgNote}
            icon={<Star size={18} className="text-amber-500" />}
            color="bg-amber-500/10"
          />

          <StatCard
            title="Villes"
            value={displayStats.villes}
            icon={<Building size={18} className="text-cyan-500" />}
            color="bg-cyan-500/10"
          />
        </div>

        {/* Filters */}
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-[220px] flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Rechercher un point, une adresse, une ville..."
                  className="w-full rounded-xl border border-border bg-background/50 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as any)
                  setPage(1)
                }}
                className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
              >
                <option value="all">Tous statuts</option>
                <option value="active">Actifs</option>
                <option value="inactive">Inactifs</option>
              </select>

              <select
                value={verifiedFilter}
                onChange={(event) => {
                  setVerifiedFilter(event.target.value as any)
                  setPage(1)
                }}
                className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
              >
                <option value="all">Vérification : tous</option>
                <option value="yes">Vérifiés</option>
                <option value="no">Non vérifiés</option>
              </select>

              <select
                value={noteFilter}
                onChange={(event) => {
                  setNoteFilter(event.target.value as any)
                  setPage(1)
                }}
                className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
              >
                <option value="all">Toutes notes</option>
                <option value="4+">4+ ★</option>
                <option value="3+">3+ ★</option>
                <option value="<3">&lt; 3 ★</option>
              </select>

              <select
                value={coordsFilter}
                onChange={(event) => {
                  setCoordsFilter(event.target.value as any)
                  setPage(1)
                }}
                className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
              >
                <option value="all">GPS : tous</option>
                <option value="with">Avec GPS</option>
                <option value="without">Sans GPS</option>
              </select>

              <div className="relative min-w-[160px]">
                <input
                  value={cityFilter}
                  onChange={(event) => {
                    setCityFilter(event.target.value)
                    setPage(1)
                  }}
                  list="pickup-city-options"
                  placeholder="Ville..."
                  className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
                <datalist id="pickup-city-options">
                  {cityOptions.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </div>

              <div className="relative min-w-[160px]">
                <input
                  value={typeFilter}
                  onChange={(event) => {
                    setTypeFilter(event.target.value)
                    setPage(1)
                  }}
                  list="pickup-type-options"
                  placeholder="Type..."
                  className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
                <datalist id="pickup-type-options">
                  {typeOptions.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={`${sortColumn}:${sortDirection}`}
                onChange={(event) => {
                  const [column, direction] = event.target.value.split(':')
                  setSortColumn(column as any)
                  setSortDirection(direction as any)
                }}
                className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
              >
                <option value="sort_order:asc">Ordre ↑</option>
                <option value="sort_order:desc">Ordre ↓</option>
                <option value="nom:asc">Nom A-Z</option>
                <option value="nom:desc">Nom Z-A</option>
                <option value="ville:asc">Ville A-Z</option>
                <option value="ville:desc">Ville Z-A</option>
                <option value="note:desc">Note décroissante</option>
                <option value="note:asc">Note croissante</option>
                <option value="created_at:desc">Plus récents</option>
                <option value="created_at:asc">Plus anciens</option>
                {userLocation && (
                  <>
                    <option value="distance:asc">Distance ↑</option>
                    <option value="distance:desc">Distance ↓</option>
                  </>
                )}
              </select>

              <div className="flex rounded-xl border border-border p-1">
                {(['table', 'cards', 'map'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                      viewMode === mode
                        ? 'bg-gold-500/10 text-gold-600 dark:text-gold-300'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    aria-label={`Vue ${mode}`}
                  >
                    {mode === 'table' ? (
                      <Layers size={14} />
                    ) : mode === 'cards' ? (
                      <MoreHorizontal size={14} />
                    ) : (
                      <Map size={14} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {(search ||
            statusFilter !== 'all' ||
            verifiedFilter !== 'all' ||
            cityFilter ||
            typeFilter ||
            noteFilter !== 'all' ||
            coordsFilter !== 'all') && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('all')
                  setVerifiedFilter('all')
                  setCityFilter('')
                  setTypeFilter('')
                  setNoteFilter('all')
                  setCoordsFilter('all')
                  setPage(1)
                }}
                leftIcon={<X size={14} />}
              >
                Effacer filtres
              </Button>
            </div>
          )}
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-400/30 bg-gold-500/5 p-3"
          >
            <p className="text-sm font-medium text-foreground">
              {selected.size} sélectionné(s)
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => handleBulk('activate')}
                disabled={busy}
                leftIcon={<Check size={14} />}
              >
                Activer
              </Button>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => handleBulk('deactivate')}
                disabled={busy}
                leftIcon={<X size={14} />}
              >
                Désactiver
              </Button>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => handleBulk('verify')}
                disabled={busy}
                leftIcon={<BadgeCheck size={14} />}
              >
                Vérifier
              </Button>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => handleBulk('unverify')}
                disabled={busy}
                leftIcon={<ShieldCheck size={14} />}
              >
                Dévérifier
              </Button>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => handleBulk('duplicate')}
                disabled={busy}
                leftIcon={<Copy size={14} />}
              >
                Dupliquer
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={() => handleBulk('delete')}
                disabled={busy}
                leftIcon={<Trash2 size={14} />}
              >
                Supprimer
              </Button>

              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Annuler
              </Button>
            </div>
          </motion.div>
        )}

        {/* Content */}
        {query.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <Skeleton variant="text" className="mb-2 h-5 w-1/3" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="mb-2 h-4 w-2/3" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="h-4 w-1/4" shimmer shimmerVariant="gold" />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center dark:border-red-900/40 dark:bg-red-950/20">
            <AlertCircle size={40} className="mx-auto mb-3 text-red-500" />

            <p className="text-sm text-red-700 dark:text-red-300">
              {query.error instanceof Error
                ? query.error.message
                : 'Impossible de charger les points de retrait.'}
            </p>

            <Button
              variant="outline-gold"
              className="mt-4"
              onClick={() => query.refetch()}
              leftIcon={<RefreshCcw size={14} />}
            >
              Réessayer
            </Button>
          </div>
        ) : sortedPoints.length === 0 ? (
          <EmptyState
            icon={<MapPin size={32} />}
            title="Aucun point de retrait"
            description="Ajoute un premier point ou modifie les filtres."
            action={
              <Button variant="luxe" size="sm" onClick={openAdd}>
                Ajouter un point
              </Button>
            }
          />
        ) : viewMode === 'table' ? (
          <>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="hidden grid-cols-12 gap-3 border-b border-border bg-muted/30 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground lg:grid">
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    checked={selected.size === paginatedPoints.length && paginatedPoints.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border"
                  />
                </div>

                <div className="col-span-4">Point</div>
                <div className="col-span-2">Ville</div>
                <div className="col-span-2">Contact</div>
                <div className="col-span-1">Note</div>
                <div className="col-span-1">Statut</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>

              <div className="divide-y divide-border">
                {paginatedPoints.map((point) => {
                  const isSelected = selected.has(point.id)

                  return (
                    <div
                      key={point.id}
                      className={cn(
                        'grid grid-cols-1 gap-3 px-4 py-4 transition lg:grid-cols-12 lg:items-center',
                        isSelected && 'bg-gold-500/5'
                      )}
                    >
                      <div className="flex items-center gap-3 lg:col-span-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(point.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                      </div>

                      <div className="min-w-0 lg:col-span-4">
                        <div className="flex items-center gap-3">
                          {point.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={point.photo_url}
                              alt={point.nom}
                              className="h-10 w-10 rounded-xl border border-border object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-100 text-gold-600 dark:bg-gold-900/30 dark:text-gold-400">
                              <Store size={18} />
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {point.nom}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {point.adresse}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="text-sm text-muted-foreground lg:col-span-2">
                        {point.ville_nom || '—'}
                      </div>

                      <div className="min-w-0 text-sm text-muted-foreground lg:col-span-2">
                        <p className="truncate">{point.telephone || '—'}</p>
                        <p className="truncate text-xs">{point.contact_nom || ''}</p>
                      </div>

                      <div className="lg:col-span-1">
                        {point.note_moyenne !== null ? (
                          <div className="flex items-center gap-1 text-amber-500">
                            <Star size={14} fill="currentColor" />
                            <span className="text-sm font-medium">
                              {point.note_moyenne.toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1 lg:col-span-1">
                        <Badge variant={point.est_actif ? 'accent' : 'danger'} size="sm">
                          {point.est_actif ? 'Actif' : 'Inactif'}
                        </Badge>

                        {point.est_partenaire_verifie && (
                          <Badge variant="neutral" size="sm">
                            Vérifié
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-1 lg:col-span-1">
                        <Tooltip content="Détails">
                          <button
                            type="button"
                            onClick={() => setDetail(point)}
                            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-gold-500"
                            aria-label="Détails"
                          >
                            <Eye size={14} />
                          </button>
                        </Tooltip>

                        <Tooltip content="Modifier">
                          <button
                            type="button"
                            onClick={() => openEdit(point)}
                            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-gold-500"
                            aria-label="Modifier"
                          >
                            <Pencil size={14} />
                          </button>
                        </Tooltip>

                        <Tooltip content={point.est_actif ? 'Désactiver' : 'Activer'}>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(point)}
                            disabled={busy}
                            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-emerald-500 disabled:opacity-40"
                            aria-label="Activer / désactiver"
                          >
                            {point.est_actif ? <X size={14} /> : <Check size={14} />}
                          </button>
                        </Tooltip>

                        <Tooltip content="Supprimer">
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(point)}
                            className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20"
                            aria-label="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={sortedPoints.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          </>
        ) : viewMode === 'cards' ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedPoints.map((point) => (
                <motion.div
                  key={point.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-border bg-card p-4 transition hover:border-gold-400/40 hover:shadow-gold"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {point.nom}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {point.ville_nom || '—'}
                      </p>
                    </div>

                    <Badge variant={point.est_actif ? 'accent' : 'danger'} size="sm">
                      {point.est_actif ? 'Actif' : 'Inactif'}
                    </Badge>
                  </div>

                  {point.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={point.photo_url}
                      alt={point.nom}
                      className="mb-3 h-32 w-full rounded-xl object-cover"
                    />
                  )}

                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p className="flex items-start gap-2">
                      <MapPin size={14} className="mt-0.5 shrink-0 text-gold-500" />
                      <span className="line-clamp-2">{point.adresse}</span>
                    </p>

                    {point.telephone && (
                      <p className="flex items-center gap-2">
                        <Phone size={14} className="shrink-0" />
                        {point.telephone}
                      </p>
                    )}

                    {point.horaires && (
                      <p className="flex items-center gap-2">
                        <Clock size={14} className="shrink-0" />
                        {point.horaires}
                      </p>
                    )}

                    {point.note_moyenne !== null && (
                      <p className="flex items-center gap-2 text-amber-500">
                        <Star size={14} fill="currentColor" />
                        {point.note_moyenne.toFixed(1)}
                      </p>
                    )}

                    {point.distance !== undefined && (
                      <p className="flex items-center gap-2 text-purple-500">
                        <Route size={14} />
                        {point.distance} km
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline-gold"
                      size="sm"
                      onClick={() => setDetail(point)}
                      leftIcon={<Eye size={14} />}
                    >
                      Détails
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(point)}
                      leftIcon={<Pencil size={14} />}
                    >
                      Modifier
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={sortedPoints.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          </>
        ) : (
          /* Map view */
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4 lg:col-span-1">
              <h3 className="mb-3 text-sm font-bold text-foreground">
                Points avec coordonnées
              </h3>

              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {sortedPoints.map((point) => {
                  const hasCoords = point.latitude !== null && point.longitude !== null
                  const isActive = selectedMapPoint?.id === point.id

                  return (
                    <button
                      key={point.id}
                      type="button"
                      onClick={() => setMapPointId(point.id)}
                      className={cn(
                        'w-full rounded-xl border p-3 text-left transition',
                        isActive
                          ? 'border-gold-400/50 bg-gold-500/10'
                          : 'border-border bg-background/40 hover:border-gold-400/40'
                      )}
                    >
                      <p className="truncate text-sm font-semibold text-foreground">
                        {point.nom}
                      </p>

                      <p className="truncate text-xs text-muted-foreground">
                        {point.adresse}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                        <Badge variant={point.est_actif ? 'accent' : 'danger'} size="sm">
                          {point.est_actif ? 'Actif' : 'Inactif'}
                        </Badge>

                        {!hasCoords && (
                          <Badge variant="warm" size="sm">
                            Sans GPS
                          </Badge>
                        )}

                        {point.distance !== undefined && (
                          <span className="text-muted-foreground">
                            {point.distance} km
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
              {selectedMapPoint ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {selectedMapPoint.nom}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedMapPoint.adresse}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <a
                        href={buildDirectionsUrl(selectedMapPoint)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="outline-gold" size="sm" leftIcon={<Navigation size={14} />}>
                          Itinéraire
                        </Button>
                      </a>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyAddress(selectedMapPoint)}
                        leftIcon={<Copy size={14} />}
                      >
                        Copier
                      </Button>
                    </div>
                  </div>

                  {selectedMapPoint.latitude !== null &&
                  selectedMapPoint.longitude !== null ? (
                    <iframe
                      title={`Carte ${selectedMapPoint.nom}`}
                      src={buildOsmEmbedUrl(selectedMapPoint) || ''}
                      className="h-[500px] w-full rounded-xl border border-border"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-[500px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-center text-sm text-muted-foreground">
                      Ce point n’a pas encore de coordonnées GPS.
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-[500px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-center text-sm text-muted-foreground">
                  Sélectionne un point pour afficher la carte.
                </div>
              )}
            </div>
          </div>
        )}
      </Container>

      {/* Detail modal */}
      <AdminModal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.nom || 'Détail'}
        description={detail?.adresse}
        size="lg"
        footer={
          detail ? (
            <>
              <Button variant="outline" onClick={() => setDetail(null)}>
                Fermer
              </Button>

              <Button
                variant="outline-gold"
                onClick={() => {
                  setDetail(null)
                  openEdit(detail)
                }}
                leftIcon={<Pencil size={14} />}
              >
                Modifier
              </Button>

              <Button
                variant="danger"
                onClick={() => {
                  setDeleteTarget(detail)
                  setDetail(null)
                }}
                leftIcon={<Trash2 size={14} />}
              >
                Supprimer
              </Button>
            </>
          ) : null
        }
      >
        {detail && (
          <div className="space-y-5">
            {detail.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={detail.photo_url}
                alt={detail.nom}
                className="h-48 w-full rounded-xl object-cover"
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow icon={<MapPin size={14} />} label="Adresse" value={detail.adresse} />
              <InfoRow icon={<Building size={14} />} label="Ville" value={detail.ville_nom || '—'} />
              <InfoRow icon={<Phone size={14} />} label="Téléphone" value={detail.telephone || '—'} />
              <InfoRow icon={<Mail size={14} />} label="Email" value={detail.email || '—'} />
              <InfoRow icon={<User size={14} />} label="Contact" value={detail.contact_nom || '—'} />
              <InfoRow icon={<Clock size={14} />} label="Horaires" value={detail.horaires || '—'} />
              <InfoRow icon={<Store size={14} />} label="Type" value={detail.type_etablissement || '—'} />
              <InfoRow icon={<Star size={14} />} label="Note" value={detail.note_moyenne !== null ? detail.note_moyenne.toFixed(1) : '—'} />
              <InfoRow icon={<PackageIcon />} label="Capacité" value={detail.capacite !== null ? String(detail.capacite) : '—'} />
              <InfoRow icon={<Clock size={14} />} label="Délai moyen" value={detail.delai_moyen_heures !== null ? `${detail.delai_moyen_heures} h` : '—'} />
              <InfoRow icon={<Globe size={14} />} label="Latitude" value={detail.latitude !== null ? String(detail.latitude) : '—'} />
              <InfoRow icon={<Globe size={14} />} label="Longitude" value={detail.longitude !== null ? String(detail.longitude) : '—'} />
            </div>

            {detail.instructions_retrait && (
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Instructions de retrait
                </p>
                <p className="text-sm text-foreground">{detail.instructions_retrait}</p>
              </div>
            )}

            {detail.points_de_repere && (
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Points de repère
                </p>
                <p className="text-sm text-foreground">{detail.points_de_repere}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <a href={buildMapsUrl(detail)} target="_blank" rel="noreferrer">
                <Button variant="outline-gold" size="sm" leftIcon={<ExternalLink size={14} />}>
                  Ouvrir Google Maps
                </Button>
              </a>

              <a href={buildDirectionsUrl(detail)} target="_blank" rel="noreferrer">
                <Button variant="outline-gold" size="sm" leftIcon={<Navigation size={14} />}>
                  Itinéraire
                </Button>
              </a>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyAddress(detail)}
                leftIcon={<Copy size={14} />}
              >
                Copier adresse
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => sharePoint(detail)}
                leftIcon={<Smartphone size={14} />}
              >
                Partager
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleActive(detail)}
                leftIcon={detail.est_actif ? <X size={14} /> : <Check size={14} />}
              >
                {detail.est_actif ? 'Désactiver' : 'Activer'}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleVerified(detail)}
                leftIcon={<BadgeCheck size={14} />}
              >
                {detail.est_partenaire_verifie ? 'Dévérifier' : 'Vérifier'}
              </Button>
            </div>

            {detail.latitude !== null && detail.longitude !== null && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  QR code localisation
                </p>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildQrUrl(detail)}
                  alt="QR code point de retrait"
                  className="mx-auto h-36 w-36 rounded-lg bg-white p-2"
                />

                <p className="mt-2 text-[10px] text-muted-foreground">
                  Scanne pour ouvrir l’itinéraire.
                </p>
              </div>
            )}
          </div>
        )}
      </AdminModal>

      {/* Form modal */}
      <AdminModal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Modifier le point' : 'Nouveau point de retrait'}
        description="Renseigne les informations visibles par les clients et les livreurs."
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              Annuler
            </Button>

            <Button variant="luxe" onClick={handleSave} loading={saving}>
              Enregistrer
            </Button>
          </>
        }
      >
        {formError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {formError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nom *" required>
            <TextInput
              value={form.nom}
              onChange={(value) => setForm((prev) => ({ ...prev, nom: value }))}
              placeholder="Point Gercie - Gombe"
            />
          </Field>

          <Field label="Commune">
            <SelectInput
              value={form.commune_id}
              onChange={(value) => setForm((prev) => ({ ...prev, commune_id: value }))}
              options={[
                { value: '', label: '— Aucune —' },
                ...communes.map((commune) => ({
                  value: String(commune.id),
                  label: commune.nom,
                })),
              ]}
            />
          </Field>

          <Field label="Adresse *" required className="md:col-span-2">
            <TextArea
              value={form.adresse}
              onChange={(value) => setForm((prev) => ({ ...prev, adresse: value }))}
              placeholder="Avenue du Commerce, Immeuble Crystal, Gombe"
              rows={2}
            />
          </Field>

          <Field label="Province">
            <TextInput
              value={form.province_nom}
              onChange={(value) => setForm((prev) => ({ ...prev, province_nom: value }))}
              placeholder="Kinshasa"
            />
          </Field>

          <Field label="Ville">
            <TextInput
              value={form.ville_nom}
              onChange={(value) => setForm((prev) => ({ ...prev, ville_nom: value }))}
              placeholder="Kinshasa"
            />
          </Field>

          <Field label="Quartier">
            <TextInput
              value={form.quartier}
              onChange={(value) => setForm((prev) => ({ ...prev, quartier: value }))}
              placeholder="Gombe"
            />
          </Field>

          <Field label="Avenue / Rue">
            <TextInput
              value={form.avenue}
              onChange={(value) => setForm((prev) => ({ ...prev, avenue: value }))}
              placeholder="Avenue du Commerce"
            />
          </Field>

          <Field label="Numéro">
            <TextInput
              value={form.numero}
              onChange={(value) => setForm((prev) => ({ ...prev, numero: value }))}
              placeholder="12"
            />
          </Field>

          <Field label="Code postal">
            <TextInput
              value={form.code_postal}
              onChange={(value) => setForm((prev) => ({ ...prev, code_postal: value }))}
              placeholder="12345"
            />
          </Field>

          <Field label="Référence">
            <TextInput
              value={form.reference}
              onChange={(value) => setForm((prev) => ({ ...prev, reference: value }))}
              placeholder="En face de la station"
            />
          </Field>

          <Field label="Téléphone">
            <TextInput
              value={form.telephone}
              onChange={(value) => setForm((prev) => ({ ...prev, telephone: value }))}
              placeholder="+243 ..."
            />
          </Field>

          <Field label="Email">
            <TextInput
              type="email"
              value={form.email}
              onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
              placeholder="contact@exemple.cd"
            />
          </Field>

          <Field label="WhatsApp">
            <TextInput
              value={form.whatsapp}
              onChange={(value) => setForm((prev) => ({ ...prev, whatsapp: value }))}
              placeholder="+243 ..."
            />
          </Field>

          <Field label="Site web">
            <TextInput
              value={form.site_web}
              onChange={(value) => setForm((prev) => ({ ...prev, site_web: value }))}
              placeholder="https://..."
            />
          </Field>

          <Field label="Photo URL">
            <TextInput
              value={form.photo_url}
              onChange={(value) => setForm((prev) => ({ ...prev, photo_url: value }))}
              placeholder="https://..."
            />
          </Field>

          <Field label="Contact responsable">
            <TextInput
              value={form.contact_nom}
              onChange={(value) => setForm((prev) => ({ ...prev, contact_nom: value }))}
              placeholder="Amina"
            />
          </Field>

          <Field label="Type d’établissement">
            <TextInput
              value={form.type_etablissement}
              onChange={(value) => setForm((prev) => ({ ...prev, type_etablissement: value }))}
              placeholder="Boutique, kiosque, agence..."
            />
          </Field>

          <Field label="Horaires">
            <TextInput
              value={form.horaires}
              onChange={(value) => setForm((prev) => ({ ...prev, horaires: value }))}
              placeholder="Lun-Sam 08:00-18:00"
            />
          </Field>

          <Field label="Latitude" hint="Ex: -4.3217">
            <TextInput
              type="number"
              step="any"
              value={form.latitude}
              onChange={(value) => setForm((prev) => ({ ...prev, latitude: value }))}
              placeholder="-4.3217"
            />
          </Field>

          <Field label="Longitude" hint="Ex: 15.3115">
            <TextInput
              type="number"
              step="any"
              value={form.longitude}
              onChange={(value) => setForm((prev) => ({ ...prev, longitude: value }))}
              placeholder="15.3115"
            />
          </Field>

          <Field label="Note moyenne" hint="0 à 5">
            <TextInput
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={form.note_moyenne}
              onChange={(value) => setForm((prev) => ({ ...prev, note_moyenne: value }))}
              placeholder="4.5"
            />
          </Field>

          <Field label="Capacité">
            <TextInput
              type="number"
              min="0"
              value={form.capacite}
              onChange={(value) => setForm((prev) => ({ ...prev, capacite: value }))}
              placeholder="200"
            />
          </Field>

          <Field label="Délai moyen (heures)">
            <TextInput
              type="number"
              min="0"
              value={form.delai_moyen_heures}
              onChange={(value) => setForm((prev) => ({ ...prev, delai_moyen_heures: value }))}
              placeholder="24"
            />
          </Field>

          <Field label="Ordre d’affichage">
            <TextInput
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(value) => setForm((prev) => ({ ...prev, sort_order: value }))}
              placeholder="0"
            />
          </Field>

          <Field label="Points de repère" className="md:col-span-2">
            <TextArea
              value={form.points_de_repere}
              onChange={(value) => setForm((prev) => ({ ...prev, points_de_repere: value }))}
              placeholder="À côté du marché, devant la pharmacie..."
              rows={2}
            />
          </Field>

          <Field label="Instructions de retrait" className="md:col-span-2">
            <TextArea
              value={form.instructions_retrait}
              onChange={(value) => setForm((prev) => ({ ...prev, instructions_retrait: value }))}
              placeholder="Présenter le code PIN ou le QR code de commande."
              rows={3}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CheckboxField
            checked={form.est_actif}
            onChange={(checked) => setForm((prev) => ({ ...prev, est_actif: checked }))}
            label="Point actif"
            description="Visible publiquement pour les clients."
          />

          <CheckboxField
            checked={form.est_partenaire_verifie}
            onChange={(checked) =>
              setForm((prev) => ({ ...prev, est_partenaire_verifie: checked }))
            }
            label="Partenaire vérifié"
            description="Affiche un badge de confiance."
          />
        </div>
      </AdminModal>

      {/* Delete modal */}
      <AdminModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer ce point ?"
        description="Cette action est irréversible."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Annuler
            </Button>

            <Button
              variant="danger"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              loading={deleting}
            >
              Supprimer
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">{deleteTarget.nom}</p>
            <p>{deleteTarget.adresse}</p>
          </div>
        )}
      </AdminModal>

      {/* Import modal */}
      <AdminModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importer des points de retrait"
        description="Colle un CSV ou charge un fichier. Première ligne = en-têtes."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Annuler
            </Button>

            <Button
              variant="luxe"
              onClick={handleImport}
              loading={busy}
              disabled={importPreview.length === 0}
            >
              Importer {importPreview.length > 0 ? `(${importPreview.length})` : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Field label="Mode" className="min-w-[180px]">
              <SelectInput
                value={importMode}
                onChange={(value) => setImportMode(value as any)}
                options={[
                  { value: 'merge', label: 'Fusionner' },
                  { value: 'replace', label: 'Remplacer tout' },
                ]}
              />
            </Field>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
            />

            <Button
              variant="outline-gold"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              leftIcon={<Upload size={14} />}
              className="mt-6"
            >
              Charger un fichier
            </Button>
          </div>

          <Field
            label="CSV"
            hint="Colonnes reconnues : nom, adresse, ville, telephone, latitude, longitude, horaires, contact_nom, type_etablissement, note_moyenne, est_actif, est_partenaire_verifie..."
          >
            <TextArea
              value={csvText}
              onChange={handleCsvTextChange}
              rows={10}
              placeholder={`nom,adresse,ville,telephone,latitude,longitude\nPoint Test,Adresse Test,Kinshasa,+243..., -4.3217,15.3115`}
              className="font-mono text-xs"
            />
          </Field>

          {importPreview.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Aperçu ({importPreview.length} ligne(s))
              </p>

              <div className="max-h-48 overflow-auto text-xs">
                {importPreview.slice(0, 10).map((row, index) => (
                  <div key={index} className="border-b border-border py-1 last:border-0">
                    <span className="font-medium text-foreground">{row.nom || '—'}</span>{' '}
                    <span className="text-muted-foreground">
                      {row.adresse || '—'} • {row.ville_nom || row.ville || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AdminModal>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL INFO ROW                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="break-words text-sm text-foreground">{value}</p>
    </div>
  )
}

function PackageIcon() {
  return <Store size={14} />
}