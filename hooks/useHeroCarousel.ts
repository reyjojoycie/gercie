// hooks/useHeroCarousel.ts
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES PARTAGÉS                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export type HeroAnimationVariant = 'slide' | 'fade' | 'zoom'
export type HeroTextPosition = 'left' | 'center' | 'right'
export type HeroButtonVariant = 'gold' | 'luxe' | 'outline' | 'ghost'
export type HeroButtonSize = 'sm' | 'md' | 'lg'
export type HeroDeviceVisibility = 'all' | 'desktop' | 'mobile'
export type HeroAudience = 'all' | 'logged_in' | 'logged_out'

export interface HeroSlideConfig {
  image_alt?: string
  overlay_opacity?: number
  text_position?: HeroTextPosition
  button_variant?: HeroButtonVariant
  button_size?: HeroButtonSize
  link_target?: '_self' | '_blank'
  device_visibility?: HeroDeviceVisibility
  audience?: HeroAudience
  priority_score?: number
  analytics_id?: string
  css_class?: string
  animation_delay?: number
  mobile_image_url?: string
  desktop_image_url?: string
  video_url?: string
  background_color?: string
  gradient_from?: string
  gradient_to?: string
  custom_style?: string
  notes?: string
  approval_status?: string
  tags?: string[]
  [key: string]: unknown
}

export interface HeroSlide {
  id: string
  title: string
  highlight: string
  description: string
  image_url: string
  cta_label: string
  cta_href: string
  image_alt?: string
  is_active?: boolean
  sort_order?: number
  start_date?: string | null
  end_date?: string | null
  priority?: boolean
  config?: HeroSlideConfig
  [key: string]: unknown
}

export interface HeroSettings {
  direction: 'horizontal' | 'vertical'
  interval_ms: number
  autoplay_enabled: boolean
}

export interface HeroAdvancedSettings {
  showProgress: boolean
  showCounter: boolean
  enableFullscreen: boolean
  disableAutoplayOnMobile: boolean
  pauseOnHover: boolean
  loop: boolean
  swipeEnabled: boolean
  keyboardEnabled: boolean
  preloadSlides: number
  transitionDuration: number
  animationVariant: HeroAnimationVariant
  overlayOpacity: number
  textPosition: HeroTextPosition
  cacheTTL: number
  autoRefreshInterval: number
  adaptiveInterval: boolean
  personalized: boolean
  showMobileControls: boolean
  highPriorityFirst: boolean
  accessibilityLive: boolean
  reduceMotionFallback: boolean
  showArrows: boolean
  showDots: boolean
  showThumbnails: boolean
  autoplayPauseOnInteraction: boolean
  resumeDelayMs: number
  descriptionLines: number
  imageQualityMobile: number
  imageQualityDesktop: number
  imageSizes: string
  aspectClassName: string
  visibilityThreshold: number
  ariaLabel: string
}

export interface HeroCarouselComponentProps {
  direction: 'horizontal' | 'vertical'
  intervalMs: number
  autoplayEnabled: boolean
  personalized: boolean
  showProgress: boolean
  showCounter: boolean
  enableFullscreen: boolean
  disableAutoplayOnMobile: boolean
  pauseOnHover: boolean
  loop: boolean
  swipeEnabled: boolean
  keyboardEnabled: boolean
  preloadSlides: number
  transitionDuration: number
  animationVariant: HeroAnimationVariant
  overlayOpacity: number
  textPosition: HeroTextPosition
  showMobileControls: boolean
  highPriorityFirst: boolean
  accessibilityLive: boolean
  reduceMotionFallback: boolean
  showArrows: boolean
  showDots: boolean
  showThumbnails: boolean
  autoplayPauseOnInteraction: boolean
  resumeDelayMs: number
  descriptionLines: number
  imageQualityMobile: number
  imageQualityDesktop: number
  imageSizes: string
  aspectClassName: string
  visibilityThreshold: number
  ariaLabel: string
}

export interface UseHeroCarouselOptions {
  disableCache?: boolean
  cacheTTL?: number
  preloadImages?: boolean
  autoRefreshInterval?: number
  adaptiveInterval?: boolean
  advancedOverrides?: Partial<HeroAdvancedSettings>
  debug?: boolean
}

export type HeroCarouselDataSource = 'none' | 'cache' | 'network' | 'stale'

export interface HeroCarouselMeta {
  hasAdvancedOptions: boolean
  hasSlideConfig: boolean
  source: HeroCarouselDataSource
  cacheTTL: number
  autoRefreshMs: number
  adaptiveEnabled: boolean
}

export interface UseHeroCarouselReturn {
  slides: HeroSlide[]
  settings: HeroSettings
  advanced: HeroAdvancedSettings
  componentProps: HeroCarouselComponentProps
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
  isOffline: boolean
  lastUpdated: number | null
  isStale: boolean
  meta: HeroCarouselMeta
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_SETTINGS: HeroSettings = {
  direction: 'horizontal',
  interval_ms: 5000,
  autoplay_enabled: true,
}

const DEFAULT_ADVANCED: HeroAdvancedSettings = {
  showProgress: true,
  showCounter: true,
  enableFullscreen: false,
  disableAutoplayOnMobile: true,
  pauseOnHover: true,
  loop: true,
  swipeEnabled: true,
  keyboardEnabled: true,
  preloadSlides: 2,
  transitionDuration: 0.5,
  animationVariant: 'slide',
  overlayOpacity: 55,
  textPosition: 'left',
  cacheTTL: 5,
  autoRefreshInterval: 0,
  adaptiveInterval: true,
  personalized: false,
  showMobileControls: true,
  highPriorityFirst: false,
  accessibilityLive: true,
  reduceMotionFallback: true,
  showArrows: true,
  showDots: true,
  showThumbnails: false,
  autoplayPauseOnInteraction: true,
  resumeDelayMs: 4000,
  descriptionLines: 3,
  imageQualityMobile: 75,
  imageQualityDesktop: 85,
  imageSizes: '(max-width: 768px) 100vw, 100vw',
  // ✅ RATIO 2:1 STRICT PARTOUT (plus de md:aspect-[3/1])
  aspectClassName: 'aspect-[2/1]',
  visibilityThreshold: 0.5,
  ariaLabel: 'Carrousel de bannières promotionnelles',
}

// ✅ Clé v3 : invalide l'ancien cache qui contenait le mauvais ratio
const CACHE_KEY = 'gercie-hero-carousel-cache-v3'
const DEFAULT_CACHE_TTL = 5 * 60 * 1000
const REQUEST_TIMEOUT = 10000
const MAX_RETRIES = 2
const RETRY_DELAY = 1000

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRIQUES                                             */
/* ═══════════════════════════════════════════════════════════════ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }

  return value
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value

  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }

  if (typeof value === 'number') return value !== 0

  return fallback
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback

  return clamp(parsed, min, max)
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : fallback
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function hasOwn(object: unknown, key: string): boolean {
  return (
    Boolean(object) &&
    typeof object === 'object' &&
    Object.prototype.hasOwnProperty.call(object, key)
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION SETTINGS                                         */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeBasic(raw: unknown): HeroSettings {
  const data = asObject(raw)
  const options = asObject(parseJsonValue(data.options))
  const merged = { ...data, ...options }

  return {
    direction: merged.direction === 'vertical' ? 'vertical' : 'horizontal',
    interval_ms: normalizeNumber(
      merged.interval_ms,
      DEFAULT_SETTINGS.interval_ms,
      1000,
      120000
    ),
    autoplay_enabled: normalizeBoolean(
      merged.autoplay_enabled,
      DEFAULT_SETTINGS.autoplay_enabled
    ),
  }
}

function normalizeAdvanced(
  raw: unknown,
  hasColumn = true
): HeroAdvancedSettings {
  if (!hasColumn) {
    return { ...DEFAULT_ADVANCED }
  }

  const options = asObject(parseJsonValue(raw))
  const merged = { ...DEFAULT_ADVANCED, ...options }

  return {
    showProgress: normalizeBoolean(
      merged.showProgress,
      DEFAULT_ADVANCED.showProgress
    ),
    showCounter: normalizeBoolean(
      merged.showCounter,
      DEFAULT_ADVANCED.showCounter
    ),
    enableFullscreen: normalizeBoolean(
      merged.enableFullscreen,
      DEFAULT_ADVANCED.enableFullscreen
    ),
    disableAutoplayOnMobile: normalizeBoolean(
      merged.disableAutoplayOnMobile,
      DEFAULT_ADVANCED.disableAutoplayOnMobile
    ),
    pauseOnHover: normalizeBoolean(
      merged.pauseOnHover,
      DEFAULT_ADVANCED.pauseOnHover
    ),
    loop: normalizeBoolean(merged.loop, DEFAULT_ADVANCED.loop),
    swipeEnabled: normalizeBoolean(
      merged.swipeEnabled,
      DEFAULT_ADVANCED.swipeEnabled
    ),
    keyboardEnabled: normalizeBoolean(
      merged.keyboardEnabled,
      DEFAULT_ADVANCED.keyboardEnabled
    ),
    preloadSlides: normalizeNumber(
      merged.preloadSlides,
      DEFAULT_ADVANCED.preloadSlides,
      0,
      10
    ),
    transitionDuration: normalizeNumber(
      merged.transitionDuration,
      DEFAULT_ADVANCED.transitionDuration,
      0,
      3
    ),
    animationVariant: oneOf(
      merged.animationVariant,
      ['slide', 'fade', 'zoom'] as const,
      DEFAULT_ADVANCED.animationVariant
    ),
    overlayOpacity: normalizeNumber(
      merged.overlayOpacity,
      DEFAULT_ADVANCED.overlayOpacity,
      0,
      100
    ),
    textPosition: oneOf(
      merged.textPosition,
      ['left', 'center', 'right'] as const,
      DEFAULT_ADVANCED.textPosition
    ),
    cacheTTL: normalizeNumber(
      merged.cacheTTL,
      DEFAULT_ADVANCED.cacheTTL,
      0,
      120
    ),
    autoRefreshInterval: normalizeNumber(
      merged.autoRefreshInterval,
      DEFAULT_ADVANCED.autoRefreshInterval,
      0,
      3600
    ),
    adaptiveInterval: normalizeBoolean(
      merged.adaptiveInterval,
      DEFAULT_ADVANCED.adaptiveInterval
    ),
    personalized: normalizeBoolean(
      merged.personalized,
      DEFAULT_ADVANCED.personalized
    ),
    showMobileControls: normalizeBoolean(
      merged.showMobileControls,
      DEFAULT_ADVANCED.showMobileControls
    ),
    highPriorityFirst: normalizeBoolean(
      merged.highPriorityFirst,
      DEFAULT_ADVANCED.highPriorityFirst
    ),
    accessibilityLive: normalizeBoolean(
      merged.accessibilityLive,
      DEFAULT_ADVANCED.accessibilityLive
    ),
    reduceMotionFallback: normalizeBoolean(
      merged.reduceMotionFallback,
      DEFAULT_ADVANCED.reduceMotionFallback
    ),
    showArrows: normalizeBoolean(
      merged.showArrows,
      DEFAULT_ADVANCED.showArrows
    ),
    showDots: normalizeBoolean(merged.showDots, DEFAULT_ADVANCED.showDots),
    showThumbnails: normalizeBoolean(
      merged.showThumbnails,
      DEFAULT_ADVANCED.showThumbnails
    ),
    autoplayPauseOnInteraction: normalizeBoolean(
      merged.autoplayPauseOnInteraction,
      DEFAULT_ADVANCED.autoplayPauseOnInteraction
    ),
    resumeDelayMs: normalizeNumber(
      merged.resumeDelayMs,
      DEFAULT_ADVANCED.resumeDelayMs,
      0,
      60000
    ),
    descriptionLines: normalizeNumber(
      merged.descriptionLines,
      DEFAULT_ADVANCED.descriptionLines,
      1,
      10
    ),
    imageQualityMobile: normalizeNumber(
      merged.imageQualityMobile,
      DEFAULT_ADVANCED.imageQualityMobile,
      1,
      100
    ),
    imageQualityDesktop: normalizeNumber(
      merged.imageQualityDesktop,
      DEFAULT_ADVANCED.imageQualityDesktop,
      1,
      100
    ),
    imageSizes: normalizeString(
      merged.imageSizes,
      DEFAULT_ADVANCED.imageSizes
    ),
    aspectClassName: normalizeString(
      merged.aspectClassName,
      DEFAULT_ADVANCED.aspectClassName
    ),
    visibilityThreshold: normalizeNumber(
      merged.visibilityThreshold,
      DEFAULT_ADVANCED.visibilityThreshold,
      0,
      1
    ),
    ariaLabel: normalizeString(
      merged.ariaLabel,
      DEFAULT_ADVANCED.ariaLabel
    ),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALISATION SLIDES                                           */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeSlide(raw: unknown): HeroSlide | null {
  const data = asObject(raw)

  if (
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.title) ||
    !isNonEmptyString(data.image_url)
  ) {
    return null
  }

  const config = asObject(parseJsonValue(data.config))
  const sortOrder = Number(data.sort_order ?? 0) || 0

  const slide: HeroSlide = {
    id: data.id,
    title: String(data.title ?? ''),
    highlight: String(data.highlight ?? ''),
    description: String(data.description ?? ''),
    image_url: String(data.image_url ?? ''),
    cta_label: String(data.cta_label ?? ''),
    cta_href: String(data.cta_href ?? ''),
    is_active: normalizeBoolean(data.is_active, true),
    sort_order: sortOrder,
    start_date:
      typeof data.start_date === 'string' ? data.start_date : null,
    end_date: typeof data.end_date === 'string' ? data.end_date : null,
    image_alt:
      typeof data.image_alt === 'string' && data.image_alt.trim().length > 0
        ? data.image_alt
        : String(data.title ?? ''),
    priority: sortOrder === 0,
    config:
      Object.keys(config).length > 0
        ? (config as HeroSlideConfig)
        : undefined,
  }

  return slide
}

function validateSlides(data: unknown): HeroSlide[] {
  if (!Array.isArray(data)) return []

  return data
    .map(normalizeSlide)
    .filter((slide): slide is HeroSlide => slide !== null)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function parseDateValue(value?: string | null): Date | null {
  if (!value) return null

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isSlideVisible(slide: HeroSlide, now: Date): boolean {
  if (slide.is_active === false) return false

  const start = parseDateValue(slide.start_date)
  if (start && start > now) return false

  const end = parseDateValue(slide.end_date)

  if (end) {
    if (
      typeof slide.end_date === 'string' &&
      slide.end_date.length <= 10
    ) {
      end.setHours(23, 59, 59, 999)
    }

    if (end < now) return false
  }

  return true
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE LOCAL                                                    */
/* ═══════════════════════════════════════════════════════════════ */

interface CacheEntry {
  slides: HeroSlide[]
  settings: HeroSettings
  advanced?: HeroAdvancedSettings
  timestamp: number
}

function getCache(): CacheEntry | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as CacheEntry

    if (
      !parsed ||
      !Array.isArray(parsed.slides) ||
      typeof parsed.settings !== 'object' ||
      typeof parsed.timestamp !== 'number'
    ) {
      return null
    }

    return parsed
  } catch (err) {
    console.warn('Erreur lecture cache carousel:', err)
    return null
  }
}

function setCache(
  slides: HeroSlide[],
  settings: HeroSettings,
  advanced: HeroAdvancedSettings
): void {
  if (typeof window === 'undefined') return

  try {
    const entry: CacheEntry = {
      slides,
      settings,
      advanced,
      timestamp: Date.now(),
    }

    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch (err) {
    console.warn('Erreur écriture cache carousel:', err)
  }
}

export function clearHeroCarouselCache(): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(CACHE_KEY)
    window.localStorage.removeItem('gercie-hero-carousel-cache-v2')
  } catch (err) {
    console.warn('Erreur suppression cache carousel:', err)
  }
}

function isCacheValid(entry: CacheEntry | null, ttl: number): boolean {
  if (!entry) return false
  if (ttl <= 0) return false

  return Date.now() - entry.timestamp < ttl
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRELOAD IMAGES                                                 */
/* ═══════════════════════════════════════════════════════════════ */

function preloadImages(slides: HeroSlide[], count = 3): void {
  if (typeof window === 'undefined') return

  const urls = new Set<string>()

  slides.slice(0, count).forEach((slide) => {
    if (isNonEmptyString(slide.image_url)) {
      urls.add(slide.image_url)
    }

    if (isNonEmptyString(slide.config?.mobile_image_url)) {
      urls.add(String(slide.config.mobile_image_url))
    }

    if (isNonEmptyString(slide.config?.desktop_image_url)) {
      urls.add(String(slide.config.desktop_image_url))
    }
  })

  urls.forEach((url) => {
    const img = new window.Image()
    img.src = url
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ADAPTIVE INTERVAL                                              */
/* ═══════════════════════════════════════════════════════════════ */

function getAdaptiveInterval(baseInterval: number): number {
  if (typeof window === 'undefined') return baseInterval

  const nav = navigator as Navigator & {
    connection?: {
      saveData?: boolean
      effectiveType?: string
    }
    mozConnection?: {
      saveData?: boolean
      effectiveType?: string
    }
    webkitConnection?: {
      saveData?: boolean
      effectiveType?: string
    }
  }

  const conn = nav.connection || nav.mozConnection || nav.webkitConnection

  if (!conn) return baseInterval

  if (
    conn.saveData ||
    conn.effectiveType === 'slow-2g' ||
    conn.effectiveType === '2g'
  ) {
    return baseInterval * 2
  }

  if (conn.effectiveType === '3g') {
    return baseInterval * 1.5
  }

  return baseInterval
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOK PRINCIPAL                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function useHeroCarousel(
  options: UseHeroCarouselOptions = {}
): UseHeroCarouselReturn {
  const {
    disableCache = false,
    cacheTTL,
    preloadImages: shouldPreloadImages = true,
    autoRefreshInterval,
    adaptiveInterval,
    advancedOverrides,
    debug = false,
  } = options

  const onlineStatus = useOnlineStatus() as unknown

  const isOnline =
    typeof onlineStatus === 'boolean'
      ? onlineStatus
      : Boolean(
          (onlineStatus as { isOnline?: boolean })?.isOnline ?? true
        )

  /* ───────────────────────────────────────────────────────────── */
  /*  STABILISATION DES OVERRIDES                                  */
  /* ───────────────────────────────────────────────────────────── */

  const advancedOverridesKey = useMemo(() => {
    try {
      return JSON.stringify(advancedOverrides ?? {})
    } catch {
      return '{}'
    }
  }, [advancedOverrides])

  const overrides = useMemo<Partial<HeroAdvancedSettings>>(() => {
    try {
      return JSON.parse(advancedOverridesKey) as Partial<HeroAdvancedSettings>
    } catch {
      return {}
    }
  }, [advancedOverridesKey])

  /* ───────────────────────────────────────────────────────────── */
  /*  ÉTATS                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const [slides, setSlides] = useState<HeroSlide[]>([])
  const [settings, setSettings] = useState<HeroSettings>(DEFAULT_SETTINGS)
  const [dbAdvanced, setDbAdvanced] =
    useState<HeroAdvancedSettings>(DEFAULT_ADVANCED)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [isStale, setIsStale] = useState(false)

  const [meta, setMeta] = useState<
    Omit<HeroCarouselMeta, 'cacheTTL' | 'autoRefreshMs' | 'adaptiveEnabled'>
  >({
    hasAdvancedOptions: false,
    hasSlideConfig: false,
    source: 'none',
  })

  /* ───────────────────────────────────────────────────────────── */
  /*  REFS                                                         */
  /* ───────────────────────────────────────────────────────────── */

  const abortControllerRef = useRef<AbortController | null>(null)
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  )
  const fetchInProgressRef = useRef(false)
  const hasLoadedRef = useRef(false)
  const mountedRef = useRef(true)

  /* ───────────────────────────────────────────────────────────── */
  /*  ADVANCED EFFECTIF                                            */
  /* ───────────────────────────────────────────────────────────── */

  const effectiveAdvanced = useMemo<HeroAdvancedSettings>(
    () => ({
      ...dbAdvanced,
      ...overrides,
    }),
    [dbAdvanced, overrides]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  CACHE TTL EFFECTIF                                           */
  /* ───────────────────────────────────────────────────────────── */

  const effectiveCacheTTL = useMemo(() => {
    if (typeof cacheTTL === 'number') return cacheTTL
    if (effectiveAdvanced.cacheTTL === 0) return 0

    return (effectiveAdvanced.cacheTTL || 5) * 60 * 1000
  }, [cacheTTL, effectiveAdvanced.cacheTTL])

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTO REFRESH MS EFFECTIF                                     */
  /* ───────────────────────────────────────────────────────────── */

  const autoRefreshMs = useMemo(() => {
    if (typeof autoRefreshInterval === 'number') {
      return autoRefreshInterval
    }

    return effectiveAdvanced.autoRefreshInterval > 0
      ? effectiveAdvanced.autoRefreshInterval * 1000
      : 0
  }, [autoRefreshInterval, effectiveAdvanced.autoRefreshInterval])

  /* ───────────────────────────────────────────────────────────── */
  /*  ADAPTATIVE INTERVALLE                                        */
  /* ───────────────────────────────────────────────────────────── */

  const adaptiveEnabled = useMemo(() => {
    if (typeof adaptiveInterval === 'boolean') return adaptiveInterval
    return effectiveAdvanced.adaptiveInterval
  }, [adaptiveInterval, effectiveAdvanced.adaptiveInterval])

  const runtimeSettings = useMemo<HeroSettings>(() => {
    return {
      ...settings,
      interval_ms: adaptiveEnabled
        ? getAdaptiveInterval(settings.interval_ms)
        : settings.interval_ms,
    }
  }, [settings, adaptiveEnabled])

  /* ───────────────────────────────────────────────────────────── */
  /*  APPLY CACHE                                                  */
  /* ───────────────────────────────────────────────────────────── */

  const applyCache = useCallback(
    (entry: CacheEntry, source: 'cache' | 'stale') => {
      const basic = normalizeBasic(entry.settings)
      const cachedAdvanced = normalizeAdvanced(
        entry.advanced,
        Boolean(entry.advanced)
      )

      const now = new Date()

      const cachedSlides = validateSlides(entry.slides).filter((slide) =>
        isSlideVisible(slide, now)
      )

      setSlides(cachedSlides)
      setSettings(basic)
      setDbAdvanced(cachedAdvanced)
      setLastUpdated(entry.timestamp)
      setIsStale(source === 'stale')

      setMeta({
        hasAdvancedOptions: Boolean(entry.advanced),
        hasSlideConfig: Array.isArray(entry.slides)
          ? entry.slides.some((slide) => hasOwn(slide, 'config'))
          : false,
        source,
      })

      if (shouldPreloadImages) {
        preloadImages(cachedSlides)
      }
    },
    [shouldPreloadImages]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  FETCH DATA                                                   */
  /* ───────────────────────────────────────────────────────────── */

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!mountedRef.current) return
      if (fetchInProgressRef.current) return

      const ttl = disableCache ? 0 : effectiveCacheTTL
      const shouldDisableCache = disableCache || ttl <= 0

      if (!forceRefresh && !shouldDisableCache) {
        const cached = getCache()

        if (cached && isCacheValid(cached, ttl)) {
          applyCache(cached, 'cache')

          if (debug) {
            console.log('🎠 Hero carousel loaded from cache:', {
              slides: cached.slides.length,
              settings: cached.settings,
              advanced: cached.advanced,
            })
          }

          return
        }
      }

      fetchInProgressRef.current = true

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      setLoading(true)
      setError(null)

      let attempts = 0
      let lastError: Error | null = null
      let timedOut = false

      const isCurrentRequest = () =>
        mountedRef.current && abortControllerRef.current === controller

      while (attempts <= MAX_RETRIES) {
        const timeoutId = setTimeout(() => {
          timedOut = true
          controller.abort()
        }, REQUEST_TIMEOUT)

        try {
          const [settingsRes, slidesRes] = await Promise.all([
            supabaseBrowser
              .from('hero_settings')
              .select('*')
              .abortSignal(controller.signal)
              .maybeSingle(),
            supabaseBrowser
              .from('hero_slides')
              .select('*')
              .eq('is_active', true)
              .order('sort_order', { ascending: true })
              .abortSignal(controller.signal),
          ])

          clearTimeout(timeoutId)

          if (!isCurrentRequest()) return

          if (slidesRes.error) {
            throw slidesRes.error
          }

          if (settingsRes.error && debug) {
            console.warn(
              'Erreur lecture hero_settings, utilisation des valeurs par défaut:',
              settingsRes.error
            )
          }

          const settingsData = settingsRes.data
          const hasAdvancedOptions = hasOwn(settingsData, 'options')

          const basic = normalizeBasic(settingsData)

          const nextDbAdvanced = normalizeAdvanced(
            (settingsData as Record<string, unknown> | null)?.options,
            hasAdvancedOptions
          )

          const rawSlides = Array.isArray(slidesRes.data)
            ? slidesRes.data
            : []

          const hasSlideConfig = rawSlides.some((slide) =>
            hasOwn(slide, 'config')
          )

          const now = new Date()

          const nextSlides = validateSlides(rawSlides).filter((slide) =>
            isSlideVisible(slide, now)
          )

          setSlides(nextSlides)
          setSettings(basic)
          setDbAdvanced(nextDbAdvanced)
          setLastUpdated(Date.now())
          setIsStale(false)

          setMeta({
            hasAdvancedOptions,
            hasSlideConfig,
            source: 'network',
          })

          if (!shouldDisableCache) {
            setCache(nextSlides, basic, {
              ...nextDbAdvanced,
              ...overrides,
            })
          }

          if (shouldPreloadImages) {
            preloadImages(nextSlides)
          }

          if (debug) {
            console.log('🎠 Hero carousel loaded from network:', {
              slides: nextSlides.length,
              settings: basic,
              advanced: nextDbAdvanced,
              hasAdvancedOptions,
              hasSlideConfig,
            })
          }

          break
        } catch (err: unknown) {
          clearTimeout(timeoutId)

          const normalizedError =
            err instanceof Error ? err : new Error(String(err))

          if (normalizedError.name === 'AbortError') {
            if (timedOut) {
              lastError = new Error('Hero carousel request timeout')
              attempts += 1
            } else {
              if (debug) {
                console.warn('Requête carousel annulée')
              }

              break
            }
          } else {
            lastError = normalizedError
            attempts += 1
          }

          if (attempts <= MAX_RETRIES) {
            const delay = RETRY_DELAY * Math.pow(2, attempts - 1)
            await sleep(delay)
          }
        }
      }

      if (!isCurrentRequest()) return

      if (lastError && attempts > MAX_RETRIES) {
        console.error('Erreur chargement carousel:', lastError)
        setError(lastError)

        if (!disableCache) {
          const cached = getCache()

          if (cached) {
            console.warn(
              'Utilisation du cache expiré pour carousel'
            )

            applyCache(cached, 'stale')
          }
        }
      }

      setLoading(false)
      fetchInProgressRef.current = false
      hasLoadedRef.current = true
    },
    [
      applyCache,
      debug,
      disableCache,
      effectiveCacheTTL,
      overrides,
      shouldPreloadImages,
    ]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  INITIAL LOAD                                                 */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (isOnline || !hasLoadedRef.current) {
      void fetchData()
    }
  }, [fetchData, isOnline])

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTO REFRESH                                                 */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (autoRefreshMs > 0 && isOnline) {
      autoRefreshTimerRef.current = setInterval(() => {
        void fetchData(true)
      }, autoRefreshMs)
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
    }
  }, [autoRefreshMs, fetchData, isOnline])

  /* ───────────────────────────────────────────────────────────── */
  /*  SYNC QUAND RETOUR ONLINE                                     */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (isOnline && isStale) {
      if (debug) {
        console.log('🔄 Retour online, refresh carousel')
      }

      void fetchData(true)
    }
  }, [debug, fetchData, isOnline, isStale])

  /* ───────────────────────────────────────────────────────────── */
  /*  CLEANUP                                                      */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  COMPONENT PROPS POUR <HeroCarousel />                        */
  /* ───────────────────────────────────────────────────────────── */

  const componentProps = useMemo<HeroCarouselComponentProps>(
    () => ({
      direction: runtimeSettings.direction,
      intervalMs: runtimeSettings.interval_ms,
      autoplayEnabled: runtimeSettings.autoplay_enabled,
      personalized: effectiveAdvanced.personalized,
      showProgress: effectiveAdvanced.showProgress,
      showCounter: effectiveAdvanced.showCounter,
      enableFullscreen: effectiveAdvanced.enableFullscreen,
      disableAutoplayOnMobile:
        effectiveAdvanced.disableAutoplayOnMobile,
      pauseOnHover: effectiveAdvanced.pauseOnHover,
      loop: effectiveAdvanced.loop,
      swipeEnabled: effectiveAdvanced.swipeEnabled,
      keyboardEnabled: effectiveAdvanced.keyboardEnabled,
      preloadSlides: effectiveAdvanced.preloadSlides,
      transitionDuration: effectiveAdvanced.transitionDuration,
      animationVariant: effectiveAdvanced.animationVariant,
      overlayOpacity: effectiveAdvanced.overlayOpacity,
      textPosition: effectiveAdvanced.textPosition,
      showMobileControls: effectiveAdvanced.showMobileControls,
      highPriorityFirst: effectiveAdvanced.highPriorityFirst,
      accessibilityLive: effectiveAdvanced.accessibilityLive,
      reduceMotionFallback: effectiveAdvanced.reduceMotionFallback,
      showArrows: effectiveAdvanced.showArrows,
      showDots: effectiveAdvanced.showDots,
      showThumbnails: effectiveAdvanced.showThumbnails,
      autoplayPauseOnInteraction:
        effectiveAdvanced.autoplayPauseOnInteraction,
      resumeDelayMs: effectiveAdvanced.resumeDelayMs,
      descriptionLines: effectiveAdvanced.descriptionLines,
      imageQualityMobile: effectiveAdvanced.imageQualityMobile,
      imageQualityDesktop: effectiveAdvanced.imageQualityDesktop,
      imageSizes: effectiveAdvanced.imageSizes,
      aspectClassName: effectiveAdvanced.aspectClassName,
      visibilityThreshold: effectiveAdvanced.visibilityThreshold,
      ariaLabel: effectiveAdvanced.ariaLabel,
    }),
    [runtimeSettings, effectiveAdvanced]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  RETURN                                                       */
  /* ───────────────────────────────────────────────────────────── */

  return {
    slides,
    settings: runtimeSettings,
    advanced: effectiveAdvanced,
    componentProps,
    loading,
    error,
    refetch: () => fetchData(true),
    isOffline: !isOnline,
    lastUpdated,
    isStale,
    meta: {
      ...meta,
      cacheTTL: effectiveCacheTTL,
      autoRefreshMs,
      adaptiveEnabled,
    },
  }
}

export default useHeroCarousel