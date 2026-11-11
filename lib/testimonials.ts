// lib/testimonials.ts
// ============================================================================
// Types, constantes et helpers pour le module Témoignages / Avis clients.
// Sans wallet / portefeuille / solde / retrait.
// ============================================================================

export type TestimonialStatus =
  | 'pending'
  | 'published'
  | 'rejected'
  | 'archived'

export interface Testimonial {
  id: string
  name: string
  role: string | null
  avatar: string | null
  text: string
  rating: number
  date: string | null
  produit: string | null
  verified: boolean
  likes: number
  admin_response: string | null
  is_featured: boolean
  status: TestimonialStatus
  author_id?: string | null
  product_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  published_at?: string | null
}

export interface TestimonialStats {
  total: number
  published: number
  pending: number
  rejected: number
  archived: number
  featured: number
  verified: number
  avgRating: string
  totalLikes: number
  distribution: Record<string, number>
  products: string[]
}

export interface TestimonialSettings {
  id: string
  allow_anonymous_submissions: boolean
  require_login_to_post: boolean
  auto_publish_authenticated: boolean
  default_rating: number
  max_featured: number
  moderation_message: string
  show_product_field: boolean
  show_avatar_field: boolean
  show_likes: boolean
  advanced_config: Record<string, any>
  updated_at?: string | null
}

export interface TestimonialAuditLog {
  id: string
  actor_id: string | null
  action: string
  entity_id: string | null
  before: any
  after: any
  created_at: string
}

export interface TestimonialAdminPayload {
  data: Testimonial[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    stats: TestimonialStats
    products: string[]
  }
  logs?: TestimonialAuditLog[]
  settings?: TestimonialSettings
}

export interface TestimonialFilters {
  search: string
  status: 'all' | TestimonialStatus
  rating: 'all' | string
  verified: 'all' | 'true' | 'false'
  featured: 'all' | 'true' | 'false'
  product: string
}

export interface TestimonialSort {
  field: 'created_at' | 'rating' | 'likes' | 'is_featured' | 'status'
  order: 'asc' | 'desc'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export const STATUS_OPTIONS: Array<{
  value: 'all' | TestimonialStatus
  label: string
}> = [
  { value: 'all', label: 'Tous' },
  { value: 'pending', label: 'En attente' },
  { value: 'published', label: 'Publié' },
  { value: 'rejected', label: 'Rejeté' },
  { value: 'archived', label: 'Archivé' },
]

export const RATING_OPTIONS = [
  { value: 'all', label: 'Toutes notes' },
  { value: '5', label: '5 étoiles' },
  { value: '4', label: '4 étoiles' },
  { value: '3', label: '3 étoiles' },
  { value: '2', label: '2 étoiles' },
  { value: '1', label: '1 étoile' },
]

export const SORT_FIELD_OPTIONS = [
  { value: 'created_at', label: 'Date' },
  { value: 'rating', label: 'Note' },
  { value: 'likes', label: 'Likes' },
  { value: 'is_featured', label: 'Mis en avant' },
  { value: 'status', label: 'Statut' },
]

export const DEFAULT_TESTIMONIAL_SETTINGS: TestimonialSettings = {
  id: 'global',
  allow_anonymous_submissions: true,
  require_login_to_post: false,
  auto_publish_authenticated: false,
  default_rating: 5,
  max_featured: 6,
  moderation_message:
    'Votre avis sera publié après vérification.',
  show_product_field: true,
  show_avatar_field: true,
  show_likes: true,
  advanced_config: {},
}

export const DEFAULT_TESTIMONIAL_STATS: TestimonialStats = {
  total: 0,
  published: 0,
  pending: 0,
  rejected: 0,
  archived: 0,
  featured: 0,
  verified: 0,
  avgRating: '0.0',
  totalLikes: 0,
  distribution: {
    '5': 0,
    '4': 0,
    '3': 0,
    '2': 0,
    '1': 0,
  },
  products: [],
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str ? str : null
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const cleaned = value
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')

    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }

  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function toNum(value: unknown, fallback = 0): number {
  return parseNumber(value) ?? fallback
}

export function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'oui', 'yes', 'on', 'actif', 'active'].includes(str)) return true
  if (['false', 'non', 'no', 'off', 'inactif', 'inactive'].includes(str)) {
    return false
  }

  return fallback
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function normalizeStatus(value: unknown): TestimonialStatus {
  const str = String(value || '')
    .toLowerCase()
    .trim()

  if (str === 'published' || str === 'publie' || str === 'publié') {
    return 'published'
  }

  if (str === 'rejected' || str === 'rejete' || str === 'rejeté') {
    return 'rejected'
  }

  if (str === 'archived' || str === 'archive' || str === 'archivé') {
    return 'archived'
  }

  return 'pending'
}

export function normalizeTestimonial(raw: any): Testimonial | null {
  const id = textOrNull(raw?.id)
  if (!id) return null

  const name = textOrNull(raw?.name ?? raw?.author ?? raw?.nom)
  if (!name) return null

  const text = textOrNull(raw?.text ?? raw?.content ?? raw?.message)
  if (!text) return null

  const rating = clamp(toNum(raw?.rating, 5), 0, 5)

  const status = normalizeStatus(raw?.status)

  const date =
    textOrNull(raw?.published_at) ||
    textOrNull(raw?.created_at) ||
    textOrNull(raw?.date)

  return {
    id,
    name,
    role: textOrNull(raw?.role ?? raw?.fonction ?? raw?.ville),
    avatar: textOrNull(raw?.avatar ?? raw?.avatar_url ?? raw?.photo),
    text,
    rating,
    date,
    produit: textOrNull(raw?.produit ?? raw?.product_name ?? raw?.productName),
    verified: toBool(raw?.verified, false),
    likes: toNum(raw?.likes, 0),
    admin_response: textOrNull(raw?.admin_response ?? raw?.adminResponse),
    is_featured: toBool(raw?.is_featured ?? raw?.isFeatured, false),
    status,
    author_id: textOrNull(raw?.author_id ?? raw?.userId),
    product_id: textOrNull(raw?.product_id ?? raw?.productId),
    created_at: textOrNull(raw?.created_at),
    updated_at: textOrNull(raw?.updated_at),
    published_at: textOrNull(raw?.published_at),
  }
}

export function normalizeStats(raw: any): TestimonialStats {
  const distribution = raw?.distribution ?? {}

  return {
    total: toNum(raw?.total, 0),
    published: toNum(raw?.published, 0),
    pending: toNum(raw?.pending, 0),
    rejected: toNum(raw?.rejected, 0),
    archived: toNum(raw?.archived, 0),
    featured: toNum(raw?.featured, 0),
    verified: toNum(raw?.verified, 0),
    avgRating: textOrNull(raw?.avgRating) || '0.0',
    totalLikes: toNum(raw?.totalLikes, 0),
    distribution: {
      '5': toNum(distribution['5'], 0),
      '4': toNum(distribution['4'], 0),
      '3': toNum(distribution['3'], 0),
      '2': toNum(distribution['2'], 0),
      '1': toNum(distribution['1'], 0),
    },
    products: Array.isArray(raw?.products)
      ? raw.products.map((item: any) => String(item)).filter(Boolean)
      : [],
  }
}

export function normalizeSettings(raw: any): TestimonialSettings {
  const advancedConfig =
    raw?.advanced_config && typeof raw.advanced_config === 'object'
      ? raw.advanced_config
      : {}

  return {
    id: textOrNull(raw?.id) || 'global',
    allow_anonymous_submissions: toBool(
      raw?.allow_anonymous_submissions,
      DEFAULT_TESTIMONIAL_SETTINGS.allow_anonymous_submissions
    ),
    require_login_to_post: toBool(
      raw?.require_login_to_post,
      DEFAULT_TESTIMONIAL_SETTINGS.require_login_to_post
    ),
    auto_publish_authenticated: toBool(
      raw?.auto_publish_authenticated,
      DEFAULT_TESTIMONIAL_SETTINGS.auto_publish_authenticated
    ),
    default_rating: clamp(
      toNum(raw?.default_rating, DEFAULT_TESTIMONIAL_SETTINGS.default_rating),
      1,
      5
    ),
    max_featured: clamp(
      toNum(raw?.max_featured, DEFAULT_TESTIMONIAL_SETTINGS.max_featured),
      0,
      50
    ),
    moderation_message:
      textOrNull(raw?.moderation_message) ||
      DEFAULT_TESTIMONIAL_SETTINGS.moderation_message,
    show_product_field: toBool(
      raw?.show_product_field,
      DEFAULT_TESTIMONIAL_SETTINGS.show_product_field
    ),
    show_avatar_field: toBool(
      raw?.show_avatar_field,
      DEFAULT_TESTIMONIAL_SETTINGS.show_avatar_field
    ),
    show_likes: toBool(
      raw?.show_likes,
      DEFAULT_TESTIMONIAL_SETTINGS.show_likes
    ),
    advanced_config: advancedConfig,
    updated_at: textOrNull(raw?.updated_at),
  }
}

export function buildTestimonialQuery(params: Record<string, any>): string {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (value === 'all') return

    search.set(key, String(value))
  })

  return search.toString()
}

export function escapeCsv(value: unknown): string {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

export function testimonialsToCsv(items: Testimonial[]): string {
  const headers = [
    'id',
    'name',
    'role',
    'rating',
    'status',
    'verified',
    'featured',
    'likes',
    'date',
    'produit',
    'text',
    'admin_response',
  ]

  const rows = items.map((item) =>
    [
      item.id,
      item.name,
      item.role || '',
      item.rating,
      item.status,
      item.verified ? 'true' : 'false',
      item.is_featured ? 'true' : 'false',
      item.likes,
      item.date || '',
      item.produit || '',
      item.text,
      item.admin_response || '',
    ]
      .map(escapeCsv)
      .join(',')
  )

  return [headers.join(','), ...rows].join('\n')
}