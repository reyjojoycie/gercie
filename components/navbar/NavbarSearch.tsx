// components/navbar/NavbarSearch.tsx
'use client'

import React, {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'

import { cn } from '@/lib/utils'

import {
  ArrowRight,
  Camera,
  Clock,
  History,
  Loader2,
  Mic,
  MicOff,
  Package,
  Search,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type SearchItemKind = 'product' | 'category' | 'recent'

interface SearchSuggestion {
  text: string
  type?: SearchItemKind
  href?: string
  image?: string
}

interface SearchItem {
  id: string
  kind: SearchItemKind
  text: string
  href?: string
  image?: string
  index: number
}

export interface NavbarSearchProps {
  /** Texte courant de la recherche */
  query: string

  /** Callback quand le texte change */
  onChange: (value: string) => void

  /** Le champ de recherche est-il focus / actif ? */
  focused: boolean

  /** Callback pour ouvrir / fermer le panneau de résultats */
  onFocusChange: (focused: boolean) => void

  /** Callback quand l’utilisateur valide une recherche */
  onSubmit: (query: string) => void

  /** Classes additionnelles */
  className?: string

  /** Placeholder personnalisé */
  placeholder?: string

  /** Activer la recherche vocale */
  enableVoice?: boolean

  /** Activer la recherche visuelle */
  enableVisual?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const RECENT_STORAGE_KEY = 'gercie-recent-searches'
const VISUAL_TEXT_KEY = 'gercie-visual-text'

const MAX_RECENT = 8
const MAX_SUGGESTIONS = 6
const MAX_IMAGE_SIZE_MB = 5

const DEFAULT_TRENDING = [
  'Téléphone',
  'Ordinateur',
  'Mode femme',
  'Chaussures',
  'Électroménager',
  'Beauté',
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function readRecentSearches(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY)

    if (!raw) return []

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function writeRecentSearches(items: string[]): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT)))
  } catch {
    // stockage indisponible : on continue silencieusement
  }
}

function normalizeSuggestionType(type?: string): SearchItemKind {
  if (type === 'product') return 'product'
  if (type === 'category') return 'category'
  return 'recent'
}

function getFallbackSuggestions(term: string): SearchSuggestion[] {
  const lower = term.toLowerCase().trim()

  if (!lower) return []

  const pool = [
    ...DEFAULT_TRENDING.map((text) => ({
      text,
      type: 'category' as SearchItemKind,
      href: `/recherche?q=${encodeURIComponent(text)}`,
    })),
    ...readRecentSearches().map((text) => ({
      text,
      type: 'recent' as SearchItemKind,
    })),
  ]

  const seen = new Set<string>()

  return pool
    .filter((item) => {
      const key = item.text.toLowerCase()

      if (seen.has(key)) return false
      if (!key.includes(lower) && !lower.includes(key)) return false

      seen.add(key)
      return true
    })
    .slice(0, MAX_SUGGESTIONS)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SEARCH OPTION BUTTON                                           */
/* ═══════════════════════════════════════════════════════════════ */

interface SearchOptionButtonProps {
  item: SearchItem
  isActive: boolean
  onSelect: (item: SearchItem) => void
  onHover: (index: number) => void
}

function SearchOptionButton({
  item,
  isActive,
  onSelect,
  onHover,
}: SearchOptionButtonProps) {
  const icon =
    item.kind === 'product' ? (
      <Package size={16} strokeWidth={1.9} aria-hidden="true" />
    ) : item.kind === 'category' ? (
      <ArrowRight size={16} strokeWidth={1.9} aria-hidden="true" />
    ) : (
      <Clock size={16} strokeWidth={1.9} aria-hidden="true" />
    )

  return (
    <button
      id={`navbar-search-option-${item.index}`}
      type="button"
      role="option"
      aria-selected={isActive}
      data-search-index={item.index}
      onClick={() => onSelect(item)}
      onMouseEnter={() => onHover(item.index)}
      className={cn(
        'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm',
        'transition-colors duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        isActive
          ? 'bg-accent-soft text-accent'
          : 'text-fg hover:bg-muted'
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface',
          isActive ? 'text-accent' : 'text-fg-subtle'
        )}
        aria-hidden="true"
      >
        {item.image ? (
          <Image
            src={item.image}
            alt=""
            width={32}
            height={32}
            unoptimized
            className="h-8 w-8 object-cover"
          />
        ) : (
          icon
        )}
      </span>

      <span className="min-w-0 flex-1 truncate font-medium">
        {item.text}
      </span>

      {item.kind === 'product' && (
        <ArrowRight
          size={14}
          className={cn(
            'shrink-0 transition-colors',
            isActive ? 'text-accent' : 'text-fg-subtle'
          )}
          aria-hidden="true"
        />
      )}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarSearch({
  query,
  onChange,
  focused,
  onFocusChange,
  onSubmit,
  className,
  placeholder = 'Rechercher un produit, une marque…',
  enableVoice = true,
  enableVisual = true,
}: NavbarSearchProps) {
  const router = useRouter()
  const prefersReducedMotion = useReducedMotion()

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [listening, setListening] = useState(false)
  const [isVisualSearching, setIsVisualSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  /* ───────────────────────────────────────────────────────────── */
  /*  RECENT SEARCHES                                              */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    setRecentSearches(readRecentSearches())
  }, [])

  const saveRecent = useCallback((term: string) => {
    const trimmed = term.trim()

    if (!trimmed) return

    setRecentSearches((previous) => {
      const next = [
        trimmed,
        ...previous.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, MAX_RECENT)

      writeRecentSearches(next)

      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecentSearches([])
    writeRecentSearches([])
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  DEBOUNCE QUERY                                               */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const value = query.trim()

    const timer = setTimeout(() => {
      setDebouncedQuery(value)
    }, 220)

    return () => clearTimeout(timer)
  }, [query])

  /* ───────────────────────────────────────────────────────────── */
  /*  SUGGESTIONS                                                  */
  /*                                                                 */
  /*  Tente d'abord /api/search/suggestions si disponible.         */
  /*  Sinon, retombe sur des suggestions locales récentes/tendances. */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([])
      setLoadingSuggestions(false)
      return
    }

    const controller = new AbortController()

    setLoadingSuggestions(true)

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(debouncedQuery)}`,
          {
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
            },
          }
        )

        if (!response.ok) {
          throw new Error('Suggestions unavailable')
        }

        const data = await response.json()

        const rawItems = Array.isArray(data?.suggestions)
          ? data.suggestions
          : Array.isArray(data)
            ? data
            : []

        const mapped: SearchSuggestion[] = rawItems
          .filter((item: any) => typeof item?.text === 'string' && item.text.trim().length > 0)
          .slice(0, MAX_SUGGESTIONS)
          .map((item: any) => ({
            text: String(item.text),
            type: normalizeSuggestionType(item.type),
            href: typeof item.href === 'string' ? item.href : undefined,
            image: typeof item.image === 'string' ? item.image : undefined,
          }))

        setSuggestions(mapped)
      } catch {
        setSuggestions(getFallbackSuggestions(debouncedQuery))
      } finally {
        setLoadingSuggestions(false)
      }
    }, 120)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [debouncedQuery])

  /* ───────────────────────────────────────────────────────────── */
  /*  COMBINED ITEMS FOR KEYBOARD NAVIGATION                       */
  /* ───────────────────────────────────────────────────────────── */

  const combinedItems = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = []

    suggestions.forEach((suggestion) => {
      items.push({
        id: `suggestion-${items.length}`,
        kind: normalizeSuggestionType(suggestion.type),
        text: suggestion.text,
        href: suggestion.href,
        image: suggestion.image,
        index: items.length,
      })
    })

    const suggestionTexts = new Set(
      suggestions.map((suggestion) => suggestion.text.toLowerCase())
    )

    recentSearches.forEach((recent) => {
      if (suggestionTexts.has(recent.toLowerCase())) return

      items.push({
        id: `recent-${items.length}`,
        kind: 'recent',
        text: recent,
        index: items.length,
      })
    })

    return items
  }, [recentSearches, suggestions])

  /* ───────────────────────────────────────────────────────────── */
  /*  SUBMIT / SELECT                                              */
  /* ───────────────────────────────────────────────────────────── */

  const handleSubmit = useCallback(
    (eventOrQuery?: FormEvent<HTMLFormElement> | string) => {
      if (eventOrQuery && typeof eventOrQuery !== 'string') {
        eventOrQuery.preventDefault()
      }

      const value =
        typeof eventOrQuery === 'string'
          ? eventOrQuery
          : query

      const trimmed = value.trim()

      if (trimmed) {
        saveRecent(trimmed)
      }

      onSubmit(trimmed)

      onFocusChange(false)
      setActiveIndex(null)
      inputRef.current?.blur()
    },
    [onFocusChange, onSubmit, query, saveRecent]
  )

  const handleSelectItem = useCallback(
    (item: SearchItem) => {
      if (item.href) {
        router.push(item.href)
        onFocusChange(false)
        setActiveIndex(null)
        return
      }

      onChange(item.text)
      handleSubmit(item.text)
    },
    [handleSubmit, onChange, onFocusChange, router]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  KEYBOARD                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()

        if (combinedItems.length === 0) return

        setActiveIndex((previous) =>
          previous === null
            ? 0
            : Math.min(previous + 1, combinedItems.length - 1)
        )

        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()

        if (combinedItems.length === 0) return

        setActiveIndex((previous) =>
          previous === null
            ? combinedItems.length - 1
            : Math.max(previous - 1, 0)
        )

        return
      }

      if (event.key === 'Enter') {
        if (activeIndex !== null && combinedItems[activeIndex]) {
          event.preventDefault()
          handleSelectItem(combinedItems[activeIndex])
          return
        }

        handleSubmit()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        onFocusChange(false)
        setActiveIndex(null)
        inputRef.current?.blur()
      }
    },
    [activeIndex, combinedItems, handleSelectItem, handleSubmit, onFocusChange]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  OUTSIDE CLICK                                                */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!focused) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null

      if (!target) return
      if (containerRef.current?.contains(target)) return

      onFocusChange(false)
      setActiveIndex(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [focused, onFocusChange])

  /* ───────────────────────────────────────────────────────────── */
  /*  VOICE SEARCH                                                 */
  /* ───────────────────────────────────────────────────────────── */

  const toggleVoiceSearch = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop?.()
      setListening(false)
      return
    }

    if (typeof window === 'undefined') return

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      inputRef.current?.focus()
      return
    }

    try {
      const recognition = new SpeechRecognition()

      recognition.lang = 'fr-FR'
      recognition.interimResults = false
      recognition.maxAlternatives = 1

      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript

        if (typeof transcript === 'string') {
          onChange(transcript)
          handleSubmit(transcript)
        }
      }

      recognition.onend = () => {
        setListening(false)
      }

      recognition.onerror = () => {
        setListening(false)
      }

      recognitionRef.current = recognition
      setListening(true)
      recognition.start()
    } catch {
      setListening(false)
    }
  }, [handleSubmit, listening, onChange])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.()
    }
  }, [])

  /* ───────────────────────────────────────────────────────────── */
  /*  VISUAL SEARCH                                                */
  /* ───────────────────────────────────────────────────────────── */

  const openVisualSearch = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleVisualFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]

      if (!file) return

      if (!file.type.startsWith('image/')) {
        event.target.value = ''
        return
      }

      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        event.target.value = ''
        return
      }

      try {
        sessionStorage.setItem(VISUAL_TEXT_KEY, query)
      } catch {
        // silencieux
      }

      setIsVisualSearching(true)
      onFocusChange(false)

      setTimeout(() => {
        setIsVisualSearching(false)
        router.push('/recherche?visual=1')
        event.target.value = ''
      }, 900)
    },
    [onFocusChange, query, router]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  PANEL VISIBILITY                                             */
  /* ───────────────────────────────────────────────────────────── */

  const hasQuery = query.trim().length > 0
  const hasSuggestions = suggestions.length > 0
  const hasRecent = recentSearches.length > 0

  const showPanel =
    focused &&
    (
      isVisualSearching ||
      listening ||
      loadingSuggestions ||
      hasQuery ||
      hasRecent
    )

  const statusMessage = isVisualSearching
    ? 'Analyse de l’image en cours…'
    : listening
      ? 'Écoute en cours…'
      : loadingSuggestions
        ? 'Recherche de suggestions…'
        : null

  const rightControlsCount =
    (hasQuery ? 1 : 0) +
    (enableVoice ? 1 : 0) +
    (enableVisual ? 1 : 0) +
    1

  const inputPaddingRight =
    rightControlsCount <= 1
      ? 'pr-12'
      : rightControlsCount === 2
        ? 'pr-20'
        : rightControlsCount === 3
          ? 'pr-28'
          : 'pr-36'

  /* ───────────────────────────────────────────────────────────── */
  /*  MOTION                                                       */
  /* ───────────────────────────────────────────────────────────── */

  const panelMotion = prefersReducedMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 6, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 6, scale: 0.98 },
        transition: { duration: 0.15, ease: 'easeOut' as const },
      }

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative hidden min-w-0 flex-1 md:block',
        'max-w-2xl',
        className
      )}
    >
      <form
        onSubmit={(event) => handleSubmit(event)}
        role="search"
        className="w-full"
      >
        <div className="relative">
          <Search
            size={18}
            strokeWidth={1.9}
            className={cn(
              'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2',
              'text-fg-subtle transition-colors duration-200',
              focused && 'text-accent'
            )}
            aria-hidden="true"
          />

          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Recherche de produits"
            aria-expanded={showPanel}
            aria-controls="navbar-search-results"
            aria-autocomplete="list"
            aria-activedescendant={
              showPanel && activeIndex !== null
                ? `navbar-search-option-${activeIndex}`
                : undefined
            }
            value={query}
            onChange={(event) => {
              onChange(event.target.value)
              setActiveIndex(null)
            }}
            onFocus={() => {
              if (!isVisualSearching) {
                onFocusChange(true)
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isVisualSearching
                ? 'Analyse de l’image en cours…'
                : placeholder
            }
            disabled={isVisualSearching}
            autoComplete="off"
            spellCheck={false}
            className={cn(
              'h-11 w-full rounded-control border bg-surface pl-11 text-sm text-fg outline-none',
              'transition-all duration-200 ease-out',
              'placeholder:text-fg-subtle',
              'shadow-card',
              inputPaddingRight,
              focused
                ? 'border-accent ring-2 ring-accent/15'
                : 'border-line hover:border-line-strong',
              isVisualSearching && 'opacity-70'
            )}
          />

          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {hasQuery && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setActiveIndex(null)
                  inputRef.current?.focus()
                }}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg',
                  'text-fg-subtle transition-colors duration-200',
                  'hover:bg-muted hover:text-fg',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
                )}
                aria-label="Effacer la recherche"
              >
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            )}

            {enableVoice && (
              <button
                type="button"
                onClick={toggleVoiceSearch}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg',
                  'transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  listening
                    ? 'bg-accent-soft text-accent'
                    : 'text-fg-subtle hover:bg-muted hover:text-fg'
                )}
                aria-label={listening ? 'Arrêter la recherche vocale' : 'Recherche vocale'}
                aria-pressed={listening}
              >
                {listening ? (
                  <MicOff size={16} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Mic size={16} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            )}

            {enableVisual && (
              <button
                type="button"
                onClick={openVisualSearch}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg',
                  'text-fg-subtle transition-colors duration-200',
                  'hover:bg-muted hover:text-fg',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
                )}
                aria-label="Recherche par image"
              >
                <Camera size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            )}

            <button
              type="submit"
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg',
                'bg-accent text-accent-contrast shadow-card',
                'transition-colors duration-200 hover:bg-accent-hover',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
              )}
              aria-label="Lancer la recherche"
            >
              {loadingSuggestions ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <Search size={15} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </form>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleVisualFile}
        aria-hidden="true"
        tabIndex={-1}
      />

      <AnimatePresence initial={false}>
        {showPanel && (
          <motion.div
            id="navbar-search-results"
            role="listbox"
            aria-label="Suggestions de recherche"
            {...panelMotion}
            className={cn(
              'absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-line bg-surface text-fg',
              'shadow-overlay',
              'max-h-[26rem] overflow-y-auto'
            )}
          >
            <div className="p-3">
              {statusMessage && (
                <div className="mb-2 flex items-center gap-2 rounded-control bg-muted px-3 py-2 text-xs text-fg-muted">
                  <Loader2 size={14} className="animate-spin text-accent" aria-hidden="true" />
                  <span>{statusMessage}</span>
                </div>
              )}

              {hasQuery && !loadingSuggestions && !hasSuggestions && (
                <div className="px-3 py-6 text-center">
                  <p className="text-sm font-medium text-fg">
                    Aucune suggestion trouvée
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">
                    Appuyez sur Entrée pour rechercher «&nbsp;{query.trim()}&nbsp;».
                  </p>
                </div>
              )}

              {hasSuggestions && (
                <section aria-label="Suggestions" className="space-y-1">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                      Suggestions
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    {suggestions.map((suggestion, index) => {
                      const item = combinedItems.find(
                        (combined) =>
                          combined.kind !== 'recent' &&
                          combined.text === suggestion.text
                      )

                      if (!item) return null

                      return (
                        <SearchOptionButton
                          key={`suggestion-${item.index}`}
                          item={item}
                          isActive={activeIndex === item.index}
                          onSelect={handleSelectItem}
                          onHover={setActiveIndex}
                        />
                      )
                    })}
                  </div>
                </section>
              )}

              {hasRecent && (
                <section aria-label="Recherches récentes" className="mt-3 space-y-1">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                      <History size={12} aria-hidden="true" />
                      Récentes
                    </p>

                    <button
                      type="button"
                      onClick={clearRecent}
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle',
                        'transition-colors duration-200',
                        'hover:bg-muted hover:text-fg',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
                      )}
                    >
                      Effacer
                    </button>
                  </div>

                  <div className="space-y-0.5">
                    {recentSearches.map((recent) => {
                      const item = combinedItems.find(
                        (combined) =>
                          combined.kind === 'recent' &&
                          combined.text === recent
                      )

                      if (!item) return null

                      return (
                        <SearchOptionButton
                          key={`recent-${item.index}`}
                          item={item}
                          isActive={activeIndex === item.index}
                          onSelect={handleSelectItem}
                          onHover={setActiveIndex}
                        />
                      )
                    })}
                  </div>
                </section>
              )}

              <div className="mt-3 hidden items-center justify-between border-t border-line pt-2 text-[10px] text-fg-subtle sm:flex">
                <span>
                  <kbd className="rounded border border-line bg-muted px-1 py-0.5">
                    ↑ ↓
                  </kbd>{' '}
                  naviguer
                </span>
                <span>
                  <kbd className="rounded border border-line bg-muted px-1 py-0.5">
                    ↵
                  </kbd>{' '}
                  sélectionner
                </span>
                <span>
                  <kbd className="rounded border border-line bg-muted px-1 py-0.5">
                    Esc
                  </kbd>{' '}
                  fermer
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default NavbarSearch