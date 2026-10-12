// hooks/useHeroCarousel.ts
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface HeroSlide {
  id: string
  title: string
  highlight: string
  description: string
  image_url: string
  cta_label: string
  cta_href: string
  is_active: boolean
  sort_order: number
  start_date?: string | null
  end_date?: string | null
  image_alt?: string
  priority?: boolean // pour next/image priority
}

export interface HeroSettings {
  direction: 'horizontal' | 'vertical'
  interval_ms: number
  autoplay_enabled: boolean
}

export interface UseHeroCarouselOptions {
  /** Désactiver le cache local */
  disableCache?: boolean
  /** Durée du cache en ms (défaut: 5 minutes) */
  cacheTTL?: number
  /** Précharger les images des slides */
  preloadImages?: boolean
  /** Rafraîchir automatiquement toutes les X ms (0 = désactivé) */
  autoRefreshInterval?: number
  /** Ajuster l'intervalle selon la connexion */
  adaptiveInterval?: boolean
}

export interface UseHeroCarouselReturn {
  slides: HeroSlide[]
  settings: HeroSettings
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
  isOffline: boolean
  lastUpdated: number | null
  isStale: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_SETTINGS: HeroSettings = {
  direction: 'horizontal',
  interval_ms: 5000,
  autoplay_enabled: true,
}

const CACHE_KEY = 'gercie-hero-carousel-cache'
const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const REQUEST_TIMEOUT = 10000 // 10 secondes
const MAX_RETRIES = 2
const RETRY_DELAY = 1000 // 1 seconde

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE HELPERS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface CacheEntry {
  slides: HeroSlide[]
  settings: HeroSettings
  timestamp: number
}

function getCache(): CacheEntry | null {
  if (typeof window === 'undefined') return null
  
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    
    const entry = JSON.parse(raw) as CacheEntry
    
    // Validation de la structure
    if (!entry.slides || !entry.settings || !entry.timestamp) {
      return null
    }
    
    return entry
  } catch (err) {
    console.warn('Erreur lecture cache carousel:', err)
    return null
  }
}

function setCache(slides: HeroSlide[], settings: HeroSettings): void {
  if (typeof window === 'undefined') return
  
  try {
    const entry: CacheEntry = {
      slides,
      settings,
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch (err) {
    console.warn('Erreur écriture cache carousel:', err)
  }
}

function isCacheValid(entry: CacheEntry | null, ttl: number): boolean {
  if (!entry) return false
  return Date.now() - entry.timestamp < ttl
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION HELPERS                                             */
/* ═══════════════════════════════════════════════════════════════ */

function validateSlide(slide: any): slide is HeroSlide {
  return (
    slide &&
    typeof slide.id === 'string' &&
    typeof slide.title === 'string' &&
    typeof slide.image_url === 'string' &&
    slide.image_url.trim().length > 0
  )
}

function validateSlides(data: any[]): HeroSlide[] {
  return data.filter(validateSlide).map((slide) => ({
    ...slide,
    image_alt: slide.image_alt || slide.title,
    priority: slide.sort_order === 0, // première slide en priority
  }))
}

function validateSettings(data: any): HeroSettings {
  return {
    direction: data?.direction === 'vertical' ? 'vertical' : 'horizontal',
    interval_ms: typeof data?.interval_ms === 'number' && data.interval_ms > 0 
      ? data.interval_ms 
      : DEFAULT_SETTINGS.interval_ms,
    autoplay_enabled: typeof data?.autoplay_enabled === 'boolean' 
      ? data.autoplay_enabled 
      : DEFAULT_SETTINGS.autoplay_enabled,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  IMAGE PRELOADING                                               */
/* ═══════════════════════════════════════════════════════════════ */

function preloadImages(slides: HeroSlide[]): void {
  if (typeof window === 'undefined') return
  
  slides.forEach((slide, index) => {
    // Précharger seulement les 3 premières images
    if (index < 3 && slide.image_url) {
      const img = new window.Image()
      img.src = slide.image_url
    }
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ADAPTIVE INTERVAL                                              */
/* ═══════════════════════════════════════════════════════════════ */

function getAdaptiveInterval(baseInterval: number): number {
  if (typeof window === 'undefined') return baseInterval
  
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
  
  if (!conn) return baseInterval
  
  // Réduire la fréquence sur connexion lente
  if (conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
    return baseInterval * 2 // Doubler l'intervalle
  }
  
  if (conn.effectiveType === '3g') {
    return baseInterval * 1.5 // Augmenter de 50%
  }
  
  return baseInterval
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOK PRINCIPAL                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function useHeroCarousel(options: UseHeroCarouselOptions = {}): UseHeroCarouselReturn {
  const {
    disableCache = false,
    cacheTTL = DEFAULT_CACHE_TTL,
    preloadImages: shouldPreloadImages = true,
    autoRefreshInterval = 0,
    adaptiveInterval = true,
  } = options
  
  const isOnline = useOnlineStatus()
  
  // États
  const [slides, setSlides] = useState<HeroSlide[]>([])
  const [settings, setSettings] = useState<HeroSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [isStale, setIsStale] = useState(false)
  
  // Refs
  const abortControllerRef = useRef<AbortController | null>(null)
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const fetchInProgressRef = useRef(false)
  const hasLoadedRef = useRef(false)

  /* ───────────────────────────────────────────────────────────── */
  /*  FETCH DATA                                                   */
  /* ───────────────────────────────────────────────────────────── */

  const fetchData = useCallback(async (forceRefresh = false) => {
    // Éviter les fetchs simultanés
    if (fetchInProgressRef.current) {
      return
    }

    // Vérifier le cache d'abord (sauf si forcé ou désactivé)
    if (!forceRefresh && !disableCache) {
      const cached = getCache()
      if (cached && isCacheValid(cached, cacheTTL)) {
        setSlides(cached.slides)
        setSettings(cached.settings)
        setLastUpdated(cached.timestamp)
        setIsStale(false)
        setLoading(false)
        
        if (shouldPreloadImages) {
          preloadImages(cached.slides)
        }
        
        return
      }
    }

    fetchInProgressRef.current = true
    
    // Annuler la requête précédente si existante
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setLoading(true)
    setError(null)

    let attempts = 0
    let lastError: Error | null = null

    while (attempts <= MAX_RETRIES) {
      try {
        const now = new Date().toISOString()

        // Timeout
        const timeoutId = setTimeout(() => {
          abortControllerRef.current?.abort()
        }, REQUEST_TIMEOUT)

        // Récupérer les paramètres du carrousel
        const { data: settingsData, error: settingsError } = await supabaseBrowser
          .from('hero_settings')
          .select('*')
          .abortSignal(abortControllerRef.current.signal)
          .single()

        clearTimeout(timeoutId)

        if (settingsError && settingsError.code !== 'PGRST116') {
          // PGRST116 = no rows returned, on garde les valeurs par défaut
          throw settingsError
        }

        const validatedSettings = validateSettings(settingsData)

        // Récupérer les slides actives
        let query = supabaseBrowser
          .from('hero_slides')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .abortSignal(abortControllerRef.current.signal)

        // Filtrage par date
        query = query
          .or(`start_date.is.null,start_date.lte.${now}`)
          .or(`end_date.is.null,end_date.gte.${now}`)

        const { data: slidesData, error: slidesError } = await query

        if (slidesError) throw slidesError

        const validatedSlides = validateSlides(slidesData || [])

        // Mettre à jour l'état
        setSlides(validatedSlides)
        setSettings(validatedSettings)
        setLastUpdated(Date.now())
        setIsStale(false)

        // Mettre en cache
        if (!disableCache) {
          setCache(validatedSlides, validatedSettings)
        }

        // Précharger les images
        if (shouldPreloadImages) {
          preloadImages(validatedSlides)
        }

        // Logging en développement
        if (process.env.NODE_ENV === 'development') {
          console.log('🎠 Hero carousel loaded:', {
            slides: validatedSlides.length,
            settings: validatedSettings,
            cached: false,
          })
        }

        // Succès, on sort de la boucle
        break
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err))
        
        // Si c'est un abort, on ne retry pas
        if (lastError.name === 'AbortError') {
          console.warn('Requête carousel annulée')
          break
        }

        attempts++
        
        if (attempts <= MAX_RETRIES) {
          // Backoff exponentiel
          const delay = RETRY_DELAY * Math.pow(2, attempts - 1)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    // Si toutes les tentatives ont échoué
    if (attempts > MAX_RETRIES && lastError) {
      console.error('Erreur chargement carousel:', lastError)
      setError(lastError)
      
      // Essayer d'utiliser le cache même s'il est expiré
      if (!disableCache) {
        const cached = getCache()
        if (cached) {
          console.warn('Utilisation du cache expiré pour carousel')
          setSlides(cached.slides)
          setSettings(cached.settings)
          setLastUpdated(cached.timestamp)
          setIsStale(true)
        }
      }
    }

    setLoading(false)
    fetchInProgressRef.current = false
    hasLoadedRef.current = true
  }, [disableCache, cacheTTL, shouldPreloadImages])

  /* ───────────────────────────────────────────────────────────── */
  /*  INITIAL LOAD                                                 */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    // Charger immédiatement si en ligne ou si pas encore chargé
    if (isOnline || !hasLoadedRef.current) {
      fetchData()
    }
  }, [fetchData, isOnline])

  /* ───────────────────────────────────────────────────────────── */
  /*  AUTO REFRESH                                                 */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (autoRefreshInterval > 0 && isOnline) {
      autoRefreshTimerRef.current = setInterval(() => {
        fetchData(true) // force refresh
      }, autoRefreshInterval)
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
      }
    }
  }, [autoRefreshInterval, fetchData, isOnline])

  /* ───────────────────────────────────────────────────────────── */
  /*  SYNC WHEN BACK ONLINE                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (isOnline && isStale) {
      console.log('🔄 Back online, refreshing carousel')
      fetchData(true)
    }
  }, [isOnline, isStale, fetchData])

  /* ───────────────────────────────────────────────────────────── */
  /*  CLEANUP AU DÉMONTAGE                                         */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
      }
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  ADAPTIVE SETTINGS                                            */
  /* ───────────────────────────────────────────────────────────── */

  const adaptiveSettings = useMemo(() => {
    if (!adaptiveInterval) return settings
    
    return {
      ...settings,
      interval_ms: getAdaptiveInterval(settings.interval_ms),
    }
  }, [settings, adaptiveInterval])

  /* ───────────────────────────────────────────────────────────── */
  /*  RETURN VALUE                                                 */
  /* ───────────────────────────────────────────────────────────── */

  return {
    slides,
    settings: adaptiveSettings,
    loading,
    error,
    refetch: () => fetchData(true),
    isOffline: !isOnline,
    lastUpdated,
    isStale,
  }
}