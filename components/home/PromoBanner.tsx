// components/home/PromoBanner.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import Link from 'next/link'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'

import { Container } from '@/components/layout/Container'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'

import {
  X,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Gift,
  Truck,
  Percent,
  Clock,
  Star,
  Heart,
  ShieldCheck,
  Zap,
  Info,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type PromoBannerVariant =
  | 'gradient'
  | 'solid'
  | 'glass'
  | 'minimal'
  | 'luxe'
  | 'announcement'
  | 'soft'

export type PromoBannerPosition = 'static' | 'sticky'

export type PromoBannerAnimation =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom'

export type PromoBannerAlign = 'left' | 'center' | 'right'

export type PromoBannerDismissStorage = 'session' | 'local' | 'none'

export type PromoBannerLinkTarget = '_self' | '_blank' | 'auto'

export type PromoBannerIconName =
  | 'sparkles'
  | 'gift'
  | 'truck'
  | 'percent'
  | 'clock'
  | 'star'
  | 'heart'
  | 'shield'
  | 'zap'
  | 'info'
  | 'none'

export interface PromoMessage {
  id?: string
  message: string
  lien?: string | null
  cta_text?: string | null
  cta_link?: string | null
  target?: PromoBannerLinkTarget
  icon?: PromoBannerIconName
  badge?: string | null
  priority?: number
  start_date?: string | null
  end_date?: string | null
  track?: Record<string, unknown>
}

export interface PromoBannerProps {
  /** Endpoint API */
  endpoint?: string

  /** Messages de secours si l’API échoue ou renvoie vide */
  fallbackMessages?: PromoMessage[]

  /** Intervalle de rotation en ms */
  rotationInterval?: number

  /** Variante visuelle */
  variant?: PromoBannerVariant

  /** Position du bandeau */
  position?: PromoBannerPosition

  /** Animation entre messages */
  animation?: PromoBannerAnimation

  /** Alignement du contenu */
  align?: PromoBannerAlign

  /** Compact = plus petit */
  compact?: boolean

  /** Largeur max du contenu */
  maxWidth?: string

  /** Icône par défaut */
  icon?: PromoBannerIconName

  /** Texte du lien par défaut */
  linkText?: string | null

  /** Cible du lien : auto = nouvel onglet si externe */
  linkTarget?: PromoBannerLinkTarget

  /** Bandeau fermable */
  dismissible?: boolean

  /** Mémorisation de la fermeture */
  dismissStorage?: PromoBannerDismissStorage

  /** Durée de fermeture mémorisée en ms, si local */
  dismissDurationMs?: number

  /** Afficher les contrôles prev / pause / next */
  showControls?: boolean

  /** Afficher les dots */
  showDots?: boolean

  /** Afficher le compteur 1 / n */
  showCounter?: boolean

  /** Afficher la barre de progression */
  showProgress?: boolean

  /** Pause au survol */
  pauseOnHover?: boolean

  /** Pause au focus clavier */
  pauseOnFocus?: boolean

  /** Pause quand le bandeau est hors viewport */
  pauseWhenHidden?: boolean

  /** Pause quand l’onglet est caché */
  pauseWhenDocumentHidden?: boolean

  /** Swipe tactile activé */
  swipeEnabled?: boolean

  /** Navigation clavier activée */
  keyboardEnabled?: boolean

  /** Respecter prefers-reduced-motion */
  respectReducedMotion?: boolean

  /** Pause temporaire après interaction manuelle, 0 = désactivé */
  resumeAfterInteractionMs?: number

  /** Timeout API en ms */
  apiTimeoutMs?: number

  /** Nombre de retries API */
  apiRetry?: number

  /** Cache React Query en ms */
  cacheTtl?: number

  /** Aria label global */
  ariaLabel?: string

  /** Debug console */
  debug?: boolean

  /** Callback changement de message */
  onMessageChange?: (message: PromoMessage, index: number) => void

  /** Callback fermeture */
  onDismiss?: () => void

  /** Callback clic lien */
  onLinkClick?: (message: PromoMessage, href: string) => void

  /** Classe custom */
  className?: string

  /** Style custom */
  style?: CSSProperties
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_FALLBACK_MESSAGES: PromoMessage[] = [
  {
    id: 'fallback-delivery',
    message: "Livraison offerte dès 50$ d'achat ! 🚀",
    lien: '/promotions',
    icon: 'truck',
    priority: 10,
  },
]

const DISMISS_KEY = 'gercie-promo-banner-dismiss-v2'
const SWIPE_THRESHOLD = 40

const ICON_MAP = {
  sparkles: Sparkles,
  gift: Gift,
  truck: Truck,
  percent: Percent,
  clock: Clock,
  star: Star,
  heart: Heart,
  shield: ShieldCheck,
  zap: Zap,
  info: Info,
  none: null,
} as const

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANT TOKENS — PREMIUM MARKETPLACE                           */
/* ═══════════════════════════════════════════════════════════════ */

interface PromoVariantTokens {
  container: string
  control: string
  badge: string
  link: string
  dot: string
  progressTrack: string
  progressFill: string
  skeleton: string
}

const variantTokens: Record<PromoBannerVariant, PromoVariantTokens> = {
  gradient: {
    container:
      'bg-gradient-to-r from-accent to-accent-hover text-accent-contrast border-accent/20',
    control:
      'hover:bg-accent-contrast/10 focus-visible:ring-accent-contrast/60',
    badge: 'bg-accent-contrast/15 text-accent-contrast',
    link: 'hover:text-accent-contrast/80 focus-visible:ring-accent-contrast/60',
    dot: 'bg-accent-contrast',
    progressTrack: 'bg-accent-contrast/20',
    progressFill: 'bg-accent-contrast',
    skeleton: 'bg-accent-contrast/20',
  },

  solid: {
    container:
      'bg-accent text-accent-contrast border-accent/30',
    control:
      'hover:bg-accent-contrast/10 focus-visible:ring-accent-contrast/60',
    badge: 'bg-accent-contrast/15 text-accent-contrast',
    link: 'hover:text-accent-contrast/80 focus-visible:ring-accent-contrast/60',
    dot: 'bg-accent-contrast',
    progressTrack: 'bg-accent-contrast/20',
    progressFill: 'bg-accent-contrast',
    skeleton: 'bg-accent-contrast/20',
  },

  glass: {
    container:
      'bg-surface/80 text-fg border-line backdrop-blur-md',
    control:
      'hover:bg-muted focus-visible:ring-accent',
    badge: 'bg-muted text-fg-muted',
    link: 'text-accent hover:text-accent-hover focus-visible:ring-accent',
    dot: 'bg-accent',
    progressTrack: 'bg-line',
    progressFill: 'bg-accent',
    skeleton: 'bg-muted',
  },

  minimal: {
    container:
      'bg-muted text-fg-muted border-line',
    control:
      'hover:bg-surface hover:text-fg focus-visible:ring-accent',
    badge: 'bg-surface text-fg',
    link: 'text-accent hover:text-accent-hover focus-visible:ring-accent',
    dot: 'bg-fg-muted',
    progressTrack: 'bg-line',
    progressFill: 'bg-fg-muted',
    skeleton: 'bg-surface',
  },

  luxe: {
    container:
      'bg-raised text-fg border-line shadow-card',
    control:
      'hover:bg-muted focus-visible:ring-accent',
    badge: 'bg-accent-soft text-accent',
    link: 'text-accent hover:text-accent-hover focus-visible:ring-accent',
    dot: 'bg-accent',
    progressTrack: 'bg-line',
    progressFill: 'bg-accent',
    skeleton: 'bg-muted',
  },

  announcement: {
    container:
      'bg-info-soft text-info border-info/20',
    control:
      'hover:bg-info/10 focus-visible:ring-info',
    badge: 'bg-info/15 text-info',
    link: 'hover:text-info/80 focus-visible:ring-info',
    dot: 'bg-info',
    progressTrack: 'bg-info/20',
    progressFill: 'bg-info',
    skeleton: 'bg-info/20',
  },

  soft: {
    container:
      'bg-accent-soft text-accent border-accent/15',
    control:
      'hover:bg-accent/10 focus-visible:ring-accent',
    badge: 'bg-accent/15 text-accent',
    link: 'hover:text-accent-hover focus-visible:ring-accent',
    dot: 'bg-accent',
    progressTrack: 'bg-accent/20',
    progressFill: 'bg-accent',
    skeleton: 'bg-accent/20',
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const cx = cn

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function generateId(prefix: string, seed: string): string {
  const safeSeed = seed.trim().slice(0, 24).replace(/\s+/g, '-') || 'item'
  return `${prefix}-${safeSeed}-${Math.random().toString(36).slice(2, 8)}`
}

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href.trim()) || href.trim().startsWith('//')
}

function parseDateValue(value?: string | null, endOfDay = false): Date | null {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  const normalized =
    raw.length <= 10
      ? `${raw}T${endOfDay ? '23:59:59' : '00:00:00'}`
      : raw

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function isMessageActive(message: PromoMessage, now: Date): boolean {
  if (!message.message.trim()) return false

  const start = parseDateValue(message.start_date)
  if (start && start > now) return false

  const end = parseDateValue(message.end_date, true)
  if (end && end < now) return false

  return true
}

function normalizeMessage(raw: unknown, index: number): PromoMessage {
  const data = (raw || {}) as Record<string, unknown>

  const message = String(data.message ?? data.text ?? data.msg ?? '').trim()

  const lien =
    typeof data.lien === 'string'
      ? data.lien
      : typeof data.link === 'string'
        ? data.link
        : null

  const ctaLink =
    typeof data.cta_link === 'string'
      ? data.cta_link
      : typeof data.ctaLink === 'string'
        ? data.ctaLink
        : null

  const ctaText =
    typeof data.cta_text === 'string'
      ? data.cta_text
      : typeof data.ctaText === 'string'
        ? data.ctaText
        : null

  const badge = typeof data.badge === 'string' ? data.badge : null

  const icon =
    typeof data.icon === 'string' && data.icon in ICON_MAP
      ? (data.icon as PromoBannerIconName)
      : undefined

  const target =
    data.target === '_blank' || data.target === '_self' || data.target === 'auto'
      ? (data.target as PromoBannerLinkTarget)
      : undefined

  const priority = Number(data.priority ?? 0) || 0

  const startDate =
    typeof data.start_date === 'string'
      ? data.start_date
      : typeof data.startDate === 'string'
        ? data.startDate
        : null

  const endDate =
    typeof data.end_date === 'string'
      ? data.end_date
      : typeof data.endDate === 'string'
        ? data.endDate
        : null

  const track =
    data.track && typeof data.track === 'object' && !Array.isArray(data.track)
      ? (data.track as Record<string, unknown>)
      : undefined

  return {
    id:
      typeof data.id === 'string' && data.id.trim()
        ? data.id
        : generateId('promo', message || String(index)),
    message,
    lien,
    cta_text: ctaText,
    cta_link: ctaLink,
    target,
    icon,
    badge,
    priority,
    start_date: startDate,
    end_date: endDate,
    track,
  }
}

function normalizeResponse(payload: unknown): PromoMessage[] {
  const array = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { banners?: unknown[] })?.banners)
      ? (payload as { banners: unknown[] }).banners
      : []

  return array
    .map((item, index) => normalizeMessage(item, index))
    .filter((item) => item.message.trim().length > 0)
}

function sortAndFilterMessages(messages: PromoMessage[]): PromoMessage[] {
  const now = new Date()

  return messages
    .filter((message) => isMessageActive(message, now))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
}

function getIconComponent(name?: PromoBannerIconName | null) {
  if (!name || name === 'none') return null
  return ICON_MAP[name] ?? Sparkles
}

function getVariantClasses(variant: PromoBannerVariant, compact: boolean): string {
  const base = 'relative w-full overflow-hidden border-b'
  const padding = compact ? 'py-1.5' : 'py-2.5'

  return cx(base, padding, variantTokens[variant].container)
}

function getAlignClass(align: PromoBannerAlign): string {
  switch (align) {
    case 'left':
      return 'justify-start text-left'
    case 'right':
      return 'justify-end text-right'
    case 'center':
    default:
      return 'justify-center text-center'
  }
}

function getMotionVariants(
  animation: PromoBannerAnimation,
  direction: number,
  reduced: boolean
): Variants {
  if (reduced || animation === 'none') {
    return {
      enter: {},
      center: {},
      exit: {},
    }
  }

  switch (animation) {
    case 'fade':
      return {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }

    case 'slide-up':
      return {
        enter: { opacity: 0, y: direction >= 0 ? 12 : -12 },
        center: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: direction >= 0 ? -12 : 12 },
      }

    case 'slide-down':
      return {
        enter: { opacity: 0, y: direction >= 0 ? -12 : 12 },
        center: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: direction >= 0 ? 12 : -12 },
      }

    case 'slide-left':
      return {
        enter: { opacity: 0, x: direction >= 0 ? 24 : -24 },
        center: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direction >= 0 ? -24 : 24 },
      }

    case 'slide-right':
      return {
        enter: { opacity: 0, x: direction >= 0 ? -24 : 24 },
        center: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direction >= 0 ? 24 : -24 },
      }

    case 'zoom':
      return {
        enter: { opacity: 0, scale: 0.96 },
        center: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.04 },
      }

    default:
      return {
        enter: {},
        center: {},
        exit: {},
      }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DISMISS STORAGE                                                */
/* ═══════════════════════════════════════════════════════════════ */

interface DismissPayload {
  expiresAt: number
}

function readDismissed(
  storage: PromoBannerDismissStorage,
  durationMs: number
): boolean {
  if (typeof window === 'undefined') return false
  if (storage === 'none') return false

  try {
    if (storage === 'session') {
      return window.sessionStorage.getItem(DISMISS_KEY) === 'true'
    }

    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false

    const parsed = JSON.parse(raw) as DismissPayload

    if (!parsed || typeof parsed.expiresAt !== 'number') {
      window.localStorage.removeItem(DISMISS_KEY)
      return false
    }

    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(DISMISS_KEY)
      return false
    }

    return true
  } catch (err) {
    console.warn('Erreur lecture dismissal promo banner:', err)
    return false
  }
}

function writeDismissed(
  storage: PromoBannerDismissStorage,
  durationMs: number
): void {
  if (typeof window === 'undefined') return
  if (storage === 'none') return

  try {
    if (storage === 'session') {
      window.sessionStorage.setItem(DISMISS_KEY, 'true')
      return
    }

    const expiresAt =
      durationMs > 0 ? Date.now() + durationMs : Number.MAX_SAFE_INTEGER

    const payload: DismissPayload = { expiresAt }
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(payload))
  } catch (err) {
    console.warn('Erreur écriture dismissal promo banner:', err)
  }
}

function clearDismissed(storage: PromoBannerDismissStorage): void {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(DISMISS_KEY)
    window.localStorage.removeItem(DISMISS_KEY)

    if (storage === 'none') return
  } catch (err) {
    console.warn('Erreur suppression dismissal promo banner:', err)
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function PromoBanner({
  endpoint = '/api/promo-banners',
  fallbackMessages = DEFAULT_FALLBACK_MESSAGES,
  rotationInterval = 6000,
  variant = 'gradient',
  position = 'static',
  animation = 'slide-up',
  align = 'center',
  compact = false,
  maxWidth = 'full',
  icon = 'sparkles',
  linkText = null,
  linkTarget = 'auto',
  dismissible = true,
  dismissStorage = 'session',
  dismissDurationMs = 24 * 60 * 60 * 1000,
  showControls = true,
  showDots = true,
  showCounter = false,
  showProgress = true,
  pauseOnHover = true,
  pauseOnFocus = true,
  pauseWhenHidden = true,
  pauseWhenDocumentHidden = true,
  swipeEnabled = true,
  keyboardEnabled = true,
  respectReducedMotion = true,
  resumeAfterInteractionMs = 0,
  apiTimeoutMs = 10000,
  apiRetry = 2,
  cacheTtl = 5 * 60 * 1000,
  ariaLabel = 'Bannière promotionnelle',
  debug = false,
  onMessageChange,
  onDismiss,
  onLinkClick,
  className,
  style,
}: PromoBannerProps) {
  const { prefersReducedMotion } = useAccessibilityPreferences()

  /* ───────────────────────────────────────────────────────────── */
  /*  ÉTATS                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const [dismissed, setDismissed] = useState(() =>
    readDismissed(dismissStorage, dismissDurationMs)
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  const [slideDirection, setSlideDirection] = useState(1)
  const [progress, setProgress] = useState(0)

  const [isPaused, setIsPaused] = useState(false)
  const [isHoverPaused, setIsHoverPaused] = useState(false)
  const [isFocusPaused, setIsFocusPaused] = useState(false)
  const [isInteractionPaused, setIsInteractionPaused] = useState(false)

  const [isInView, setIsInView] = useState(true)
  const [isDocumentHidden, setIsDocumentHidden] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  /* ───────────────────────────────────────────────────────────── */
  /*  REFS                                                         */
  /* ───────────────────────────────────────────────────────────── */

  const containerRef = useRef<HTMLDivElement>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ───────────────────────────────────────────────────────────── */
  /*  TOKENS VISuels                                               */
  /* ───────────────────────────────────────────────────────────── */

  const tokens = useMemo(() => variantTokens[variant], [variant])

  /* ───────────────────────────────────────────────────────────── */
  /*  QUERY API                                                    */
  /* ───────────────────────────────────────────────────────────── */

  const { data, isLoading, isError } = useQuery<PromoMessage[]>({
    queryKey: ['promo-banners', endpoint],
    queryFn: async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), apiTimeoutMs)

      try {
        const response = await fetch(endpoint, {
          signal: controller.signal,
          credentials: 'same-origin',
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const payload = await response.json()
        const normalized = normalizeResponse(payload)
        const active = sortAndFilterMessages(normalized)

        if (active.length > 0) {
          return active
        }

        return sortAndFilterMessages(normalizeResponse(fallbackMessages))
      } catch (err: unknown) {
        clearTimeout(timeoutId)

        if (debug) {
          console.warn('Erreur fetch promo banners:', err)
        }

        return sortAndFilterMessages(normalizeResponse(fallbackMessages))
      }
    },
    staleTime: cacheTtl,
    retry: apiRetry,
    retryDelay: (attemptIndex) =>
      Math.min(1000 * Math.pow(2, attemptIndex), 10000),
    refetchOnWindowFocus: false,
  })

  const messages = useMemo(() => {
    const source =
      data && data.length > 0 ? data : normalizeResponse(fallbackMessages)

    return sortAndFilterMessages(source)
  }, [data, fallbackMessages])

  /* ───────────────────────────────────────────────────────────── */
  /*  INDEX SÛR                                                    */
  /* ───────────────────────────────────────────────────────────── */

  const safeIndex =
    messages.length === 0
      ? 0
      : clamp(currentIndex, 0, messages.length - 1)

  const current = messages[safeIndex] ?? null

  useEffect(() => {
    if (messages.length > 0 && currentIndex >= messages.length) {
      setCurrentIndex(0)
      setProgress(0)
    }
  }, [messages.length, currentIndex])

  /* ───────────────────────────────────────────────────────────── */
  /*  SYNCHRO DISMISSAL                                            */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const sync = () => {
      setDismissed(readDismissed(dismissStorage, dismissDurationMs))
    }

    sync()

    const interval = setInterval(sync, 60000)

    document.addEventListener('visibilitychange', sync)
    window.addEventListener('storage', sync)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('storage', sync)
    }
  }, [dismissStorage, dismissDurationMs])

  /* ───────────────────────────────────────────────────────────── */
  /*  MOBILE DETECTION                                             */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(max-width: 640px)')

    const update = () => setIsMobile(mediaQuery.matches)
    update()

    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  DOCUMENT VISIBILITY                                          */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handler = () => setIsDocumentHidden(document.hidden)
    handler()

    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  INTERSECTION OBSERVER                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const element = containerRef.current

    if (!element || !pauseWhenHidden) {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting)
      },
      { threshold: 0.25 }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [pauseWhenHidden])

  /* ───────────────────────────────────────────────────────────── */
  /*  INTERACTION PAUSE / RESUME                                   */
  /* ───────────────────────────────────────────────────────────── */

  const registerInteraction = useCallback(() => {
    if (resumeAfterInteractionMs <= 0) return

    setIsInteractionPaused(true)

    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
    }

    resumeTimerRef.current = setTimeout(() => {
      setIsInteractionPaused(false)
      resumeTimerRef.current = null
    }, resumeAfterInteractionMs)
  }, [resumeAfterInteractionMs])

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current)
      }
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  NAVIGATION                                                   */
  /* ───────────────────────────────────────────────────────────── */

  const goTo = useCallback(
    (index: number, direction?: number) => {
      if (messages.length === 0) return

      const normalized =
        ((index % messages.length) + messages.length) % messages.length

      setSlideDirection(direction ?? (normalized >= safeIndex ? 1 : -1))
      setCurrentIndex(normalized)
      setProgress(0)
      registerInteraction()
    },
    [messages.length, safeIndex, registerInteraction]
  )

  const next = useCallback(() => {
    if (messages.length === 0) return

    setSlideDirection(1)
    setCurrentIndex((prev) => (prev + 1) % messages.length)
    setProgress(0)
    registerInteraction()
  }, [messages.length, registerInteraction])

  const prev = useCallback(() => {
    if (messages.length === 0) return

    setSlideDirection(-1)
    setCurrentIndex((prevIndex) => (prevIndex - 1 + messages.length) % messages.length)
    setProgress(0)
    registerInteraction()
  }, [messages.length, registerInteraction])

  const togglePause = useCallback(() => {
    setIsPaused((value) => !value)
  }, [])

  const handleClose = useCallback(() => {
    setDismissed(true)
    writeDismissed(dismissStorage, dismissDurationMs)
    onDismiss?.()

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('promo-banner:dismiss', {
          detail: {
            storage: dismissStorage,
            durationMs: dismissDurationMs,
          },
        })
      )
    }
  }, [dismissStorage, dismissDurationMs, onDismiss])

  const handleLinkClick = useCallback(
    (message: PromoMessage, href: string) => {
      onLinkClick?.(message, href)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('promo-banner:link-click', {
            detail: {
              id: message.id,
              message: message.message,
              href,
              track: message.track,
            },
          })
        )
      }
    },
    [onLinkClick]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTOPLAY                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const shouldAutoplay = useMemo(() => {
    if (dismissed) return false
    if (messages.length <= 1) return false
    if (isPaused) return false
    if (isHoverPaused) return false
    if (isFocusPaused) return false
    if (isInteractionPaused) return false
    if (pauseWhenDocumentHidden && isDocumentHidden) return false
    if (pauseWhenHidden && !isInView) return false
    if (respectReducedMotion && prefersReducedMotion) return false
    return true
  }, [
    dismissed,
    messages.length,
    isPaused,
    isHoverPaused,
    isFocusPaused,
    isInteractionPaused,
    pauseWhenDocumentHidden,
    isDocumentHidden,
    pauseWhenHidden,
    isInView,
    respectReducedMotion,
    prefersReducedMotion,
  ])

  useEffect(() => {
    if (!shouldAutoplay) {
      setProgress(0)
      return
    }

    const startedAt = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const elapsed = now - startedAt
      const percent = Math.min((elapsed / rotationInterval) * 100, 100)

      setProgress(percent)

      if (elapsed >= rotationInterval) {
        setSlideDirection(1)
        setCurrentIndex((prevIndex) => (prevIndex + 1) % messages.length)
        setProgress(0)
      } else {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [shouldAutoplay, rotationInterval, messages.length, currentIndex])

  /* ───────────────────────────────────────────────────────────── */
  /*  ANALYTICS / CALLBACK CHANGEMENT                              */
  /* ───────────────────────────────────────────────────────────── */

  const currentId = current?.id
  const currentMessage = current?.message

  useEffect(() => {
    if (!current) return

    onMessageChange?.(current, safeIndex)

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('promo-banner:message-change', {
          detail: {
            id: current.id,
            index: safeIndex,
            message: current.message,
            lien: current.lien,
            track: current.track,
          },
        })
      )
    }
  }, [currentId, currentMessage, safeIndex, current, onMessageChange])

  /* ───────────────────────────────────────────────────────────── */
  /*  KEYBOARD                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!keyboardEnabled) return

      const target = event.target as HTMLElement | null
      const isInteractive = target?.closest(
        'a, button, input, select, textarea, [contenteditable="true"]'
      )

      if (event.key === ' ' && isInteractive) {
        return
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          prev()
          break

        case 'ArrowRight':
          event.preventDefault()
          next()
          break

        case ' ':
          event.preventDefault()
          togglePause()
          break

        case 'Escape':
          if (dismissible) {
            event.preventDefault()
            handleClose()
          }
          break

        default:
          break
      }
    },
    [keyboardEnabled, prev, next, togglePause, dismissible, handleClose]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  SWIPE                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!swipeEnabled) return
      if (event.pointerType === 'mouse') return

      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
      }
    },
    [swipeEnabled]
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointerStartRef.current) return

      const startX = pointerStartRef.current.x
      const startY = pointerStartRef.current.y

      const deltaX = event.clientX - startX
      const deltaY = event.clientY - startY

      if (
        Math.abs(deltaX) > SWIPE_THRESHOLD &&
        Math.abs(deltaX) > Math.abs(deltaY)
      ) {
        if (deltaX > 0) {
          prev()
        } else {
          next()
        }
      }

      pointerStartRef.current = null
    },
    [next, prev]
  )

  const handlePointerCancel = useCallback(() => {
    pointerStartRef.current = null
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER HELPERS                                               */
  /* ───────────────────────────────────────────────────────────── */

  const reducedMotion = respectReducedMotion && prefersReducedMotion

  const motionVariants = useMemo(
    () => getMotionVariants(animation, slideDirection, reducedMotion),
    [animation, slideDirection, reducedMotion]
  )

  const controlBase =
    'rounded-full p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0'

  const positionClasses = cx(
    position === 'sticky' &&
      'sticky top-[var(--header-height,4.5rem)] z-40',
    position === 'static' && 'relative'
  )

  const contentStyle: CSSProperties = {
    maxWidth: maxWidth === 'full' ? undefined : maxWidth,
    margin: maxWidth === 'full' ? undefined : '0 auto',
  }

  const Icon = getIconComponent(current?.icon || icon)

  const effectiveLink = current?.cta_link || current?.lien || null
  const effectiveLinkText =
    current?.cta_text || linkText || (effectiveLink ? 'En savoir plus' : null)

  const resolvedTarget: '_self' | '_blank' =
    current?.target && current.target !== 'auto'
      ? current.target
      : linkTarget !== 'auto'
        ? linkTarget
        : effectiveLink && isExternalHref(effectiveLink)
          ? '_blank'
          : '_self'

  const resolvedRel =
    resolvedTarget === '_blank' ? 'noopener noreferrer' : undefined

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDU                                                        */
  /* ───────────────────────────────────────────────────────────── */

  if (dismissed) return null

  if (!current) {
    if (isLoading) {
      return (
        <div
          className={cx(
            getVariantClasses(variant, compact),
            positionClasses,
            className
          )}
          style={style}
          aria-busy="true"
          aria-live="polite"
        >
          <Container padding="none" className="px-4 sm:px-6 lg:px-8">
            <div className="flex min-h-[28px] items-center justify-center">
              <div
                className={cx(
                  'h-4 w-64 animate-pulse rounded',
                  tokens.skeleton
                )}
              />
            </div>
          </Container>
        </div>
      )
    }

    return null
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      aria-live="polite"
      aria-atomic="true"
      tabIndex={keyboardEnabled ? 0 : -1}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseEnter={() => {
        if (pauseOnHover) setIsHoverPaused(true)
      }}
      onMouseLeave={() => {
        if (pauseOnHover) setIsHoverPaused(false)
      }}
      onFocus={() => {
        if (pauseOnFocus) setIsFocusPaused(true)
      }}
      onBlur={() => {
        if (pauseOnFocus) setIsFocusPaused(false)
      }}
      className={cx(
        getVariantClasses(variant, compact),
        positionClasses,
        className
      )}
      style={{
        touchAction: 'pan-y',
        ...style,
      }}
    >
      <Container padding="none" className="px-4 sm:px-6 lg:px-8">
        <div
          className={cx(
            'relative flex min-h-[28px] items-center gap-2 font-semibold',
            compact ? 'text-xs' : 'text-sm',
            getAlignClass(align)
          )}
          style={contentStyle}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id ?? safeIndex}
              variants={motionVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                duration: reducedMotion ? 0 : 0.3,
                ease: 'easeInOut',
              }}
              className={cx(
                'flex min-w-0 items-center gap-2',
                align === 'right' && 'flex-row-reverse'
              )}
            >
              {Icon ? (
                <Icon
                  size={compact ? 14 : 18}
                  aria-hidden="true"
                  className="shrink-0"
                />
              ) : null}

              {current.badge ? (
                <span
                  className={cx(
                    'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                    tokens.badge
                  )}
                >
                  {current.badge}
                </span>
              ) : null}

              <span className="line-clamp-2 min-w-0">
                {current.message}
              </span>

              {effectiveLink && effectiveLinkText ? (
                isExternalHref(effectiveLink) ? (
                  <a
                    href={effectiveLink}
                    target={resolvedTarget}
                    rel={resolvedRel}
                    className={cx(
                      'shrink-0 underline underline-offset-2 transition focus:outline-none focus-visible:ring-2',
                      tokens.link
                    )}
                    onClick={() => handleLinkClick(current, effectiveLink)}
                    aria-label={`${effectiveLinkText} : ${current.message}`}
                  >
                    {effectiveLinkText}
                  </a>
                ) : (
                  <Link
                    href={effectiveLink}
                    target={resolvedTarget}
                    rel={resolvedRel}
                    className={cx(
                      'shrink-0 underline underline-offset-2 transition focus:outline-none focus-visible:ring-2',
                      tokens.link
                    )}
                    onClick={() => handleLinkClick(current, effectiveLink)}
                    aria-label={`${effectiveLinkText} : ${current.message}`}
                  >
                    {effectiveLinkText}
                  </Link>
                )
              ) : null}
            </motion.div>
          </AnimatePresence>

          {/* Contrôles */}
          {showControls && messages.length > 1 && (
            <div
              className={cx(
                'absolute flex items-center gap-1',
                align === 'right' ? 'left-2' : 'right-12',
                'top-1/2 -translate-y-1/2'
              )}
              role="group"
              aria-label="Contrôles de la bannière promotionnelle"
            >
              <button
                type="button"
                onClick={prev}
                className={cx(controlBase, tokens.control)}
                aria-label="Message précédent"
              >
                <ChevronLeft size={compact ? 14 : 16} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={togglePause}
                className={cx(controlBase, tokens.control)}
                aria-label={isPaused ? 'Reprendre la rotation' : 'Mettre en pause'}
                aria-pressed={isPaused}
              >
                {isPaused ? (
                  <Play size={compact ? 14 : 16} aria-hidden="true" />
                ) : (
                  <Pause size={compact ? 14 : 16} aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={next}
                className={cx(controlBase, tokens.control)}
                aria-label="Message suivant"
              >
                <ChevronRight size={compact ? 14 : 16} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Compteur */}
          {showCounter && messages.length > 1 && (
            <div
              className={cx(
                'absolute top-1/2 -translate-y-1/2 text-[10px] font-medium opacity-70',
                align === 'right' ? 'right-2' : 'left-2'
              )}
              aria-hidden="true"
            >
              {safeIndex + 1} / {messages.length}
            </div>
          )}

          {/* Fermer */}
          {dismissible && (
            <button
              type="button"
              onClick={handleClose}
              className={cx(
                'absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition focus:outline-none focus-visible:ring-2',
                controlBase,
                tokens.control
              )}
              aria-label="Fermer la bannière promotionnelle"
            >
              <X size={compact ? 14 : 16} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Dots */}
        {showDots && messages.length > 1 && (
          <div
            className={cx(
              'mt-1 flex items-center gap-1.5',
              getAlignClass(align)
            )}
            role="tablist"
            aria-label="Navigation des messages promotionnels"
          >
            {messages.map((message, index) => (
              <button
                key={message.id ?? index}
                type="button"
                onClick={() => goTo(index)}
                role="tab"
                aria-selected={index === safeIndex}
                aria-label={`Aller au message ${index + 1}`}
                className={cx(
                  'h-1.5 rounded-full transition-all focus:outline-none focus-visible:ring-2',
                  index === safeIndex
                    ? cx('w-5 opacity-100', tokens.dot)
                    : cx('w-1.5 opacity-40 hover:opacity-70', tokens.dot),
                  tokens.control
                )}
              />
            ))}
          </div>
        )}
      </Container>

      {/* Barre de progression */}
      {showProgress && shouldAutoplay && (
        <div
          className={cx(
            'absolute bottom-0 left-0 right-0 h-0.5',
            tokens.progressTrack
          )}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression de la bannière promotionnelle"
        >
          <div
            className={cx(
              'h-full transition-all duration-100 ease-linear',
              tokens.progressFill
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Erreur API silencieuse : fallback déjà utilisé */}
      {isError && debug ? (
        <span className="sr-only">
          Les messages promotionnels affichés proviennent du fallback local.
        </span>
      ) : null}
    </div>
  )
}