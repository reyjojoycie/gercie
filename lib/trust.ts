// lib/trust.ts
// ============================================================================
// Types, constantes et helpers pour la section Confiance / Trust.
// Sans wallet / portefeuille / solde / retrait.
// ============================================================================

export interface TrustStat {
  id: string
  label: string
  value: number
  suffix: string
  prefix: string
  decimals: number
  icon_name: string
  description: string | null
  color: string
  sort_order: number
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
}

export interface TrustTestimonial {
  id: string
  author: string
  role: string | null
  quote: string
  rating: number
  avatar_url: string | null
  commune: string | null
  verified: boolean
  sort_order: number
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
}

export interface TrustSettings {
  id: string
  show_header: boolean
  section_title: string
  section_subtitle: string
  badge_text: string
  show_stats: boolean
  show_testimonials: boolean
  stats_columns: number
  testimonials_display_mode: 'rotate' | 'grid'
  testimonials_max_display: number
  autoplay_interval_ms: number
  pause_on_hover: boolean
  animation_enabled: boolean
  show_rating_stars: boolean
  show_avatar_initials: boolean
  accent_color: string
  advanced_config: Record<string, any>
  updated_at?: string | null
}

export interface TrustAuditLog {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before: any
  after: any
  created_at: string
}

export interface TrustData {
  stats: TrustStat[]
  testimonials: TrustTestimonial[]
  settings: TrustSettings
  logs: TrustAuditLog[]
}

/* ═══════════════════════════════════════════════════════════════ */
/*  OPTIONS ADMIN                                                  */
/* ═══════════════════════════════════════════════════════════════ */

export const ICON_OPTIONS = [
  'Users',
  'Package',
  'Star',
  'Store',
  'MapPin',
  'Headphones',
  'ThumbsUp',
  'Clock',
  'ShieldCheck',
  'Truck',
  'HeartHandshake',
  'BadgeCheck',
  'CheckCircle2',
  'Award',
  'Globe',
  'Zap',
  'Lock',
  'MessageSquare',
  'Phone',
  'Mail',
]

export const COLOR_OPTIONS = [
  { value: 'text-gold-600 dark:text-gold-400', label: 'Or' },
  { value: 'text-emerald-600 dark:text-emerald-400', label: 'Émeraude' },
  { value: 'text-blue-600 dark:text-blue-400', label: 'Bleu' },
  { value: 'text-purple-600 dark:text-purple-400', label: 'Violet' },
  { value: 'text-cyan-600 dark:text-cyan-400', label: 'Cyan' },
  { value: 'text-green-600 dark:text-green-400', label: 'Vert' },
  { value: 'text-orange-600 dark:text-orange-400', label: 'Orange' },
  { value: 'text-red-600 dark:text-red-400', label: 'Rouge' },
  { value: 'text-pink-600 dark:text-pink-400', label: 'Rose' },
  { value: 'text-indigo-600 dark:text-indigo-400', label: 'Indigo' },
]

export const ACCENT_COLOR_OPTIONS = [
  { value: 'gold', label: 'Or' },
  { value: 'purple', label: 'Violet' },
  { value: 'blue', label: 'Bleu' },
  { value: 'emerald', label: 'Émeraude' },
  { value: 'rose', label: 'Rose' },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  DEFAULTS                                                       */
/* ═══════════════════════════════════════════════════════════════ */

export const DEFAULT_TRUST_SETTINGS: TrustSettings = {
  id: 'global',
  show_header: true,
  section_title: 'Ils nous font confiance',
  section_subtitle:
    'Rejoignez les milliers de clients satisfaits qui ont choisi Gercie pour leurs achats en ligne en RDC.',
  badge_text: 'La confiance, notre priorité',
  show_stats: true,
  show_testimonials: true,
  stats_columns: 8,
  testimonials_display_mode: 'rotate',
  testimonials_max_display: 1,
  autoplay_interval_ms: 6000,
  pause_on_hover: true,
  animation_enabled: true,
  show_rating_stars: true,
  show_avatar_initials: true,
  accent_color: 'gold',
  advanced_config: {},
}

export const DEFAULT_TRUST_STATS: TrustStat[] = [
  {
    id: 'default-clients',
    label: 'Clients satisfaits',
    value: 12500,
    suffix: '+',
    prefix: '',
    decimals: 0,
    icon_name: 'Users',
    description: 'Une communauté active en RDC',
    color: 'text-gold-600 dark:text-gold-400',
    sort_order: 0,
    is_active: true,
  },
  {
    id: 'default-commandes',
    label: 'Commandes livrées',
    value: 8300,
    suffix: '+',
    prefix: '',
    decimals: 0,
    icon_name: 'Package',
    description: 'Suivi logistique transparent',
    color: 'text-emerald-600 dark:text-emerald-400',
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'default-note',
    label: 'Note moyenne',
    value: 4.8,
    suffix: '/5',
    prefix: '',
    decimals: 1,
    icon_name: 'Star',
    description: 'Avis clients vérifiés',
    color: 'text-amber-500 dark:text-amber-400',
    sort_order: 2,
    is_active: true,
  },
  {
    id: 'default-vendeurs',
    label: 'Vendeurs partenaires',
    value: 450,
    suffix: '+',
    prefix: '',
    decimals: 0,
    icon_name: 'Store',
    description: 'Boutiques locales sélectionnées',
    color: 'text-blue-600 dark:text-blue-400',
    sort_order: 3,
    is_active: true,
  },
  {
    id: 'default-communes',
    label: 'Communes couvertes',
    value: 24,
    suffix: '',
    prefix: '',
    decimals: 0,
    icon_name: 'MapPin',
    description: 'Kinshasa et au-delà',
    color: 'text-purple-600 dark:text-purple-400',
    sort_order: 4,
    is_active: true,
  },
  {
    id: 'default-support',
    label: 'Support réactif',
    value: 24,
    suffix: '/7',
    prefix: '',
    decimals: 0,
    icon_name: 'Headphones',
    description: 'Une équipe à votre écoute',
    color: 'text-cyan-600 dark:text-cyan-400',
    sort_order: 5,
    is_active: true,
  },
  {
    id: 'default-satisfaction',
    label: 'Taux de satisfaction',
    value: 96,
    suffix: '%',
    prefix: '',
    decimals: 0,
    icon_name: 'ThumbsUp',
    description: 'Les clients recommandent Gercie',
    color: 'text-green-600 dark:text-green-400',
    sort_order: 6,
    is_active: true,
  },
  {
    id: 'default-delai',
    label: 'Délai moyen',
    value: 48,
    suffix: 'h',
    prefix: '',
    decimals: 0,
    icon_name: 'Clock',
    description: 'Livraison rapide et suivie',
    color: 'text-orange-600 dark:text-orange-400',
    sort_order: 7,
    is_active: true,
  },
]

export const DEFAULT_TRUST_TESTIMONIALS: TrustTestimonial[] = [
  {
    id: 'default-t1',
    author: 'Amina K.',
    role: 'Cliente à Gombe, Kinshasa',
    quote:
      'J’ai commandé plusieurs articles et tout est arrivé correctement. Le suivi de livraison m’a vraiment rassurée.',
    rating: 5,
    avatar_url: null,
    commune: 'Gombe',
    verified: true,
    sort_order: 0,
    is_active: true,
  },
  {
    id: 'default-t2',
    author: 'Jean-Paul M.',
    role: 'Client à Lubumbashi',
    quote:
      'Gercie est devenu mon réflexe pour acheter en ligne. Les produits sont bien présentés et la livraison est sérieuse.',
    rating: 4.7,
    avatar_url: null,
    commune: 'Lubumbashi',
    verified: true,
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'default-t3',
    author: 'Sarah T.',
    role: 'Cliente à Matadi',
    quote:
      'Ce que j’aime, c’est la transparence. Je vois les informations du colis, l’adresse, le statut, et je peux suivre simplement.',
    rating: 4.9,
    avatar_url: null,
    commune: 'Matadi',
    verified: true,
    sort_order: 2,
    is_active: true,
  },
  {
    id: 'default-t4',
    author: 'Patrick L.',
    role: 'Client à Goma',
    quote:
      'Service clair, produits variés et une expérience d’achat beaucoup plus fiable que ce que je trouvais ailleurs.',
    rating: 4.6,
    avatar_url: null,
    commune: 'Goma',
    verified: false,
    sort_order: 3,
    is_active: true,
  },
]

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

export function normalizeStat(raw: any, index = 0): TrustStat | null {
  const label = textOrNull(raw?.label ?? raw?.titre ?? raw?.title)
  if (!label) return null

  const value = parseNumber(raw?.value ?? raw?.nombre ?? raw?.count)
  if (value === null) return null

  const inferredDecimals = Number.isInteger(value) ? 0 : 1

  return {
    id: textOrNull(raw?.id) || `stat-${index}-${Date.now()}`,
    label,
    value,
    suffix: textOrNull(raw?.suffix) || '',
    prefix: textOrNull(raw?.prefix) || '',
    decimals: clamp(toNum(raw?.decimals, inferredDecimals), 0, 2),
    icon_name: textOrNull(raw?.icon_name ?? raw?.icon) || 'ShieldCheck',
    description: textOrNull(raw?.description),
    color:
      textOrNull(raw?.color) ||
      'text-gold-600 dark:text-gold-400',
    sort_order: toNum(raw?.sort_order, index),
    is_active: toBool(raw?.is_active ?? raw?.active, true),
    created_at: textOrNull(raw?.created_at),
    updated_at: textOrNull(raw?.updated_at),
  }
}

export function normalizeTestimonial(
  raw: any,
  index = 0
): TrustTestimonial | null {
  const quote = textOrNull(
    raw?.quote ?? raw?.texte ?? raw?.message ?? raw?.commentaire
  )

  const author = textOrNull(
    raw?.author ?? raw?.nom ?? raw?.name ?? raw?.client
  )

  if (!quote || !author) return null

  return {
    id: textOrNull(raw?.id) || `testimonial-${index}-${Date.now()}`,
    author,
    role: textOrNull(raw?.role ?? raw?.fonction ?? raw?.ville),
    quote,
    rating: clamp(toNum(raw?.rating ?? raw?.note, 5), 0, 5),
    avatar_url: textOrNull(raw?.avatar_url ?? raw?.photo),
    commune: textOrNull(raw?.commune ?? raw?.city),
    verified: toBool(raw?.verified, false),
    sort_order: toNum(raw?.sort_order, index),
    is_active: toBool(raw?.is_active ?? raw?.active, true),
    created_at: textOrNull(raw?.created_at),
    updated_at: textOrNull(raw?.updated_at),
  }
}

export function normalizeSettings(raw: any): TrustSettings {
  const advancedConfig =
    raw?.advanced_config && typeof raw.advanced_config === 'object'
      ? raw.advanced_config
      : {}

  return {
    id: textOrNull(raw?.id) || 'global',
    show_header: toBool(raw?.show_header, DEFAULT_TRUST_SETTINGS.show_header),
    section_title:
      textOrNull(raw?.section_title) ||
      DEFAULT_TRUST_SETTINGS.section_title,
    section_subtitle:
      textOrNull(raw?.section_subtitle) ||
      DEFAULT_TRUST_SETTINGS.section_subtitle,
    badge_text:
      textOrNull(raw?.badge_text) || DEFAULT_TRUST_SETTINGS.badge_text,
    show_stats: toBool(raw?.show_stats, DEFAULT_TRUST_SETTINGS.show_stats),
    show_testimonials: toBool(
      raw?.show_testimonials,
      DEFAULT_TRUST_SETTINGS.show_testimonials
    ),
    stats_columns: clamp(
      toNum(raw?.stats_columns, DEFAULT_TRUST_SETTINGS.stats_columns),
      1,
      12
    ),
    testimonials_display_mode:
      raw?.testimonials_display_mode === 'grid' ? 'grid' : 'rotate',
    testimonials_max_display: clamp(
      toNum(
        raw?.testimonials_max_display,
        DEFAULT_TRUST_SETTINGS.testimonials_max_display
      ),
      1,
      12
    ),
    autoplay_interval_ms: clamp(
      toNum(
        raw?.autoplay_interval_ms,
        DEFAULT_TRUST_SETTINGS.autoplay_interval_ms
      ),
      0,
      60000
    ),
    pause_on_hover: toBool(
      raw?.pause_on_hover,
      DEFAULT_TRUST_SETTINGS.pause_on_hover
    ),
    animation_enabled: toBool(
      raw?.animation_enabled,
      DEFAULT_TRUST_SETTINGS.animation_enabled
    ),
    show_rating_stars: toBool(
      raw?.show_rating_stars,
      DEFAULT_TRUST_SETTINGS.show_rating_stars
    ),
    show_avatar_initials: toBool(
      raw?.show_avatar_initials,
      DEFAULT_TRUST_SETTINGS.show_avatar_initials
    ),
    accent_color:
      textOrNull(raw?.accent_color) || DEFAULT_TRUST_SETTINGS.accent_color,
    advanced_config: advancedConfig,
    updated_at: textOrNull(raw?.updated_at),
  }
}

export function sortTrustItems<T extends { sort_order: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order)
}