// components/home/PromoBanner.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import { X, Sparkles, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAccessibilityPreferences } from '@/contexts/ThemeContext'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface PromoMessage {
  message: string
  lien: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const ROTATION_INTERVAL = 6000 // 6 secondes
const STORAGE_KEY = 'gercie-promo-banner-closed'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const FALLBACK_MESSAGES: PromoMessage[] = [
  { message: "Livraison offerte dès 50$ d'achat ! 🚀", lien: '/promotions' },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function isBannerClosed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function setBannerClosed(closed: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (closed) {
      sessionStorage.setItem(STORAGE_KEY, 'true')
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch (err) {
    console.warn('Erreur sessionStorage:', err)
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function PromoBanner() {
  const { prefersReducedMotion } = useAccessibilityPreferences()
  
  // États locaux
  const [visible, setVisible] = useState(!isBannerClosed())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  
  // Refs
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch des bannières avec gestion d'erreurs
  const { 
    data: banners = [], 
    isLoading, 
    error 
  } = useQuery<PromoMessage[]>({
    queryKey: ['promo-banners'],
    queryFn: async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

      try {
        const res = await fetch('/api/promo-banners', {
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        const data = await res.json()
        
        // Validation des données
        if (!Array.isArray(data)) {
          console.warn('Données invalides reçues, utilisation du fallback')
          return FALLBACK_MESSAGES
        }

        return data.filter(
          (item: any) =>
            item && typeof item.message === 'string' && item.message.trim().length > 0
        )
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
          console.warn('Timeout fetch promo banners')
        } else {
          console.error('Erreur fetch promo banners:', err)
        }
        return FALLBACK_MESSAGES
      }
    },
    staleTime: CACHE_TTL,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  })

  const messages = banners.length > 0 ? banners : FALLBACK_MESSAGES

  /* ───────────────────────────────────────────────────────────── */
  /*  ACTIONS                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const next = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % messages.length)
  }, [messages.length])

  const prev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + messages.length) % messages.length)
  }, [messages.length])

  const handleClose = useCallback(() => {
    setVisible(false)
    setBannerClosed(true)
  }, [])

  const togglePause = useCallback(() => {
    setIsPaused((p) => !p)
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  ROTATION AUTOMATIQUE                                         */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (isPaused || messages.length <= 1 || prefersReducedMotion) {
      // Nettoyer l'intervalle si pause ou reduced motion
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(next, ROTATION_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPaused, messages.length, next, prefersReducedMotion])

  /* ───────────────────────────────────────────────────────────── */
  /*  CLEANUP AU DÉMONTAGE                                         */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDU                                                        */
  /* ───────────────────────────────────────────────────────────── */

  if (!visible) return null

  // Loading state
  if (isLoading) {
    return (
      <div
        className="bg-gradient-to-r from-gold-400 via-amber-400 to-gold-500 text-midnight-900 py-2 text-center relative overflow-hidden"
        aria-busy="true"
        aria-live="polite"
      >
        <Container>
          <div className="flex items-center justify-center gap-2 text-sm font-semibold relative min-h-[28px]">
            <div className="animate-pulse bg-midnight-900/20 rounded h-5 w-64" />
          </div>
        </Container>
      </div>
    )
  }

  const current = messages[currentIndex]

  return (
    <div
      className="bg-gradient-to-r from-gold-400 via-amber-400 to-gold-500 text-midnight-900 py-2 text-center relative overflow-hidden"
      role="region"
      aria-label="Bannière promotionnelle"
      aria-live="polite"
      aria-atomic="true"
    >
      <Container>
        <div className="flex items-center justify-center gap-2 text-sm font-semibold relative min-h-[28px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
              className="flex items-center gap-2"
            >
              <Sparkles 
                size={18} 
                className="text-midnight-800" 
                aria-hidden="true"
              />
              <span>{current.message}</span>
              {current.lien && (
                <Link 
                  href={current.lien} 
                  className="underline underline-offset-2 hover:text-midnight-950 focus:outline-none focus:ring-2 focus:ring-midnight-900 focus:ring-offset-2 rounded"
                  aria-label={`En savoir plus sur : ${current.message}`}
                >
                  En savoir plus
                </Link>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Contrôles (flèches + pause) */}
        {messages.length > 1 && (
          <div 
            className="absolute right-12 top-1/2 -translate-y-1/2 flex items-center gap-1"
            role="group"
            aria-label="Contrôles de la bannière"
          >
            <button
              onClick={prev}
              className="p-1 rounded hover:bg-midnight-900/10 focus:outline-none focus:ring-2 focus:ring-midnight-900 transition-colors"
              aria-label="Message précédent"
              disabled={isPaused}
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <button
              onClick={togglePause}
              className="p-1 rounded hover:bg-midnight-900/10 focus:outline-none focus:ring-2 focus:ring-midnight-900 transition-colors"
              aria-label={isPaused ? 'Reprendre la rotation' : 'Mettre en pause'}
              aria-pressed={isPaused}
            >
              {isPaused ? (
                <Play size={14} aria-hidden="true" />
              ) : (
                <Pause size={14} aria-hidden="true" />
              )}
            </button>
            <button
              onClick={next}
              className="p-1 rounded hover:bg-midnight-900/10 focus:outline-none focus:ring-2 focus:ring-midnight-900 transition-colors"
              aria-label="Message suivant"
              disabled={isPaused}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Bouton fermer */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-midnight-700 hover:text-midnight-950 focus:outline-none focus:ring-2 focus:ring-midnight-900 rounded transition-colors"
          aria-label="Fermer la bannière promotionnelle"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </Container>
    </div>
  )
}