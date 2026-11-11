// components/navbar/NavbarMobileSearch.tsx
'use client'

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { useRouter } from 'next/navigation'

import { cn } from '@/lib/utils'

import {
  Camera,
  Loader2,
  Mic,
  MicOff,
  Search,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface NavbarMobileSearchProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: (query: string) => void
  placeholder?: string
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const VISUAL_IMAGE_KEY = 'gercie-visual-image'
const VISUAL_TEXT_KEY = 'gercie-visual-text'
const MAX_IMAGE_SIZE_MB = 5

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result

      if (typeof result === 'string') {
        resolve(result)
        return
      }

      reject(new Error('Lecture de fichier impossible'))
    }

    reader.onerror = () => reject(reader.error ?? new Error('Lecture de fichier impossible'))
    reader.readAsDataURL(file)
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function NavbarMobileSearch({
  value,
  onChange,
  onSubmit,
  placeholder = 'Rechercher un produit…',
  className,
}: NavbarMobileSearchProps) {
  const router = useRouter()

  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recognitionRef = useRef<any>(null)

  const [listening, setListening] = useState(false)
  const [visualLoading, setVisualLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  /* ───────────────────────────────────────────────────────────── */
  /*  SUBMIT                                                       */
  /* ───────────────────────────────────────────────────────────── */

  const submitQuery = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return

      if (typeof onSubmit === 'function') {
        onSubmit(trimmed)
        return
      }

      router.push(`/search?q=${encodeURIComponent(trimmed)}`)
    },
    [onSubmit, router]
  )

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      submitQuery(value)
    },
    [submitQuery, value]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  VOICE SEARCH                                                 */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.()
      } catch {
        // silencieux
      }
    }
  }, [])

  const toggleVoiceSearch = useCallback(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setStatusMessage('Votre navigateur ne supporte pas la recherche vocale.')
      return
    }

    if (listening) {
      try {
        recognitionRef.current?.stop?.()
      } catch {
        // silencieux
      }

      setListening(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition

    recognition.lang = 'fr-FR'
    recognition.continuous = false
    recognition.interimResults = true

    let finalTranscript = ''

    recognition.onstart = () => {
      setListening(true)
      setStatusMessage('Écoute en cours…')
    }

    recognition.onresult = (event: any) => {
      let interim = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''

        if (result.isFinal) {
          finalTranscript += transcript
        } else {
          interim += transcript
        }
      }

      const nextValue = finalTranscript || interim
      onChange(nextValue)

      if (finalTranscript) {
        submitQuery(finalTranscript)
      }
    }

    recognition.onerror = (event: any) => {
      console.warn('Erreur recherche vocale:', event?.error)
      setStatusMessage('Erreur lors de la reconnaissance vocale.')
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)

      if (!finalTranscript) {
        setStatusMessage('Aucune parole reconnue.')
      } else {
        setStatusMessage(null)
      }
    }

    try {
      recognition.start()
    } catch (error) {
      console.warn('Impossible de démarrer la recherche vocale:', error)
      setListening(false)
      setStatusMessage('Impossible de démarrer la recherche vocale.')
    }
  }, [listening, onChange, submitQuery])

  /* ───────────────────────────────────────────────────────────── */
  /*  VISUAL SEARCH                                                */
  /* ───────────────────────────────────────────────────────────── */

  const handleVisualSearch = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]

      if (!file) return

      if (!file.type.startsWith('image/')) {
        setStatusMessage('Veuillez sélectionner une image.')
        return
      }

      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        setStatusMessage(`Image trop lourde. Maximum ${MAX_IMAGE_SIZE_MB} Mo.`)
        return
      }

      setVisualLoading(true)
      setStatusMessage('Analyse de l’image…')

      try {
        const base64Image = await fileToBase64(file)

        try {
          sessionStorage.setItem(VISUAL_IMAGE_KEY, base64Image)
          sessionStorage.setItem(VISUAL_TEXT_KEY, value.trim())
        } catch {
          // stockage indisponible : on continue quand même
        }

        router.push('/search?mode=visual')
        onChange('')
        setStatusMessage(null)
      } catch (error: any) {
        console.warn('Erreur recherche par image:', error)
        setStatusMessage(error?.message || 'Erreur lors de la recherche par image.')
      } finally {
        setVisualLoading(false)

        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
  [onChange, router, value]
  )

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  const rightControlsCount = 2 + (value ? 1 : 0)

  const inputPaddingRight =
    rightControlsCount === 1
      ? 'pr-10'
      : rightControlsCount === 2
        ? 'pr-16'
        : 'pr-24'

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={cn('relative w-full', className)}
    >
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />

        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={visualLoading ? 'Analyse de l’image…' : placeholder}
          disabled={visualLoading}
          autoComplete="off"
          spellCheck={false}
          inputMode="search"
          enterKeyHint="search"
          aria-label="Recherche mobile"
          className={cn(
            'h-10 w-full rounded-pill border border-line bg-canvas pl-9 text-sm text-fg',
            'placeholder:text-fg-subtle',
            'transition-colors duration-200',
            'hover:border-line-strong',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15',
            'disabled:cursor-not-allowed disabled:opacity-70',
            inputPaddingRight
          )}
        />

        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange('')
                inputRef.current?.focus()
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle transition-colors duration-200 hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Effacer la recherche"
            >
              <X size={15} aria-hidden="true" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={toggleVoiceSearch}
            disabled={visualLoading}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200',
              'text-fg-subtle hover:bg-muted hover:text-accent',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'disabled:cursor-not-allowed disabled:opacity-60',
              listening && 'bg-danger/10 text-danger hover:bg-danger/15 hover:text-danger'
            )}
            aria-label={listening ? 'Arrêter la recherche vocale' : 'Recherche vocale'}
            aria-pressed={listening}
          >
            {listening ? (
              <MicOff size={15} aria-hidden="true" />
            ) : (
              <Mic size={15} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!visualLoading) {
                fileInputRef.current?.click()
              }
            }}
            disabled={visualLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle transition-colors duration-200 hover:bg-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Recherche par photo"
          >
            {visualLoading ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Camera size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleVisualSearch(event)}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
    </form>
  )
}

export default NavbarMobileSearch