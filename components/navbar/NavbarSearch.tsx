'use client'

import React, { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { useDebounce } from '@/hooks/useDebounce'
import {
  Search, X, Mic, MicOff, Camera, Clock, ArrowRight,
  Loader2, History, Package,
} from 'lucide-react'

interface SearchSuggestion {
  text: string
  type: 'product' | 'category' | 'recent'
  href?: string
  image?: string
}

interface NavbarSearchProps {
  query: string
  onChange: (value: string) => void
  focused: boolean
  onFocusChange: (focused: boolean) => void
  onSubmit: (query: string) => void
  className?: string
  placeholder?: string
  enableVoice?: boolean
  enableVisual?: boolean
}

const RECENT_SEARCHES_KEY = 'gercie-recent-searches'
const MAX_RECENT = 8
const MAX_SUGGESTIONS = 6

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
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [listening, setListening] = useState(false)
  const [isVisualSearching, setIsVisualSearching] = useState(false)
  
  const recognitionRef = useRef<any>(null)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY)
      if (saved) setRecentSearches(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([])
      return
    }

    let cancelled = false
    const fetchSuggestions = async () => {
      setLoadingSuggestions(true)
      try {
        const res = await fetch(`/api/produits?search=${encodeURIComponent(debouncedQuery)}&limit=${MAX_SUGGESTIONS}`)
        if (!res.ok) throw new Error('Erreur réseau')
        const data = await res.json()
        if (!cancelled) {
          const items: SearchSuggestion[] = (Array.isArray(data) ? data : []).slice(0, MAX_SUGGESTIONS).map((p: any) => ({
            text: p.nom,
            type: 'product' as const,
            href: `/produits/${p.id}`,
            image: p.images?.[0],
          }))
          setSuggestions(items)
        }
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setLoadingSuggestions(false)
      }
    }
    fetchSuggestions()
    return () => { cancelled = true }
  }, [debouncedQuery])

  const addRecentSearch = useCallback((term: string) => {
    const clean = term.trim()
    if (!clean) return
    setRecentSearches(prev => {
      const updated = [clean, ...prev.filter(s => s !== clean)].slice(0, MAX_RECENT)
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  const clearRecentSearches = () => {
    setRecentSearches([])
    localStorage.removeItem(RECENT_SEARCHES_KEY)
  }

  useEffect(() => {
    if (!focused) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onFocusChange(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [focused, onFocusChange])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      addRecentSearch(query.trim())
      onSubmit(query.trim())
    }
  }

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.href) {
      addRecentSearch(suggestion.text)
      router.push(suggestion.href)
      onFocusChange(false)
      onChange('')
    } else {
      addRecentSearch(suggestion.text)
      onSubmit(suggestion.text)
    }
  }

  const handleRecentClick = (term: string) => {
    addRecentSearch(term)
    onSubmit(term)
    onChange(term)
    onFocusChange(false)
  }

  const toggleVoiceSearch = useCallback(() => {
    if (typeof window === 'undefined') return
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Votre navigateur ne supporte pas la recherche vocale.')
      return
    }
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'fr-FR'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setListening(true)
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      onChange(transcript)
      setListening(false)
      if (transcript.trim()) {
        addRecentSearch(transcript.trim())
        onSubmit(transcript.trim())
      }
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
  }, [listening, onChange, onSubmit, addRecentSearch])

  const handleVisualSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsVisualSearching(true)
    try {
      const reader = new FileReader()
      const base64Image = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const formData = new FormData()
      formData.append('image', file)
      if (query.trim()) {
        formData.append('text', query.trim())
      }

      const res = await fetch('/api/search/image', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Échec de la recherche visuelle')
      }

      const data = await res.json()
      sessionStorage.setItem('gercie-visual-results', JSON.stringify(data.results || []))
      sessionStorage.setItem('gercie-visual-image', base64Image)
      sessionStorage.setItem('gercie-visual-text', query.trim())

      router.push('/search?mode=visual')
      onChange('')
      onFocusChange(false)

    } catch (err: any) {
      console.error('Erreur recherche visuelle:', err)
      alert(err.message || 'Une erreur est survenue lors de la recherche par image.')
    } finally {
      setIsVisualSearching(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const hasSuggestions = suggestions.length > 0 || recentSearches.length > 0 || debouncedQuery.length >= 2
  const showPanel = focused && hasSuggestions

  return (
    <div ref={containerRef} className={cn('hidden md:flex flex-1 max-w-2xl relative', className)}>
      <form onSubmit={handleSubmit} className="w-full">
        <Input
          leftIcon={<Search size={18} className="text-neutral-400" />}
          rightIcon={
            <div className="flex items-center gap-1">
              {query && !isVisualSearching && (
                <button
                  type="button"
                  onClick={() => { onChange(''); setSuggestions([]); onFocusChange(false) }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  aria-label="Effacer la recherche"
                >
                  <X size={16} />
                </button>
              )}
              {enableVoice && !isVisualSearching && (
                <button
                  type="button"
                  onClick={toggleVoiceSearch}
                  className={cn('text-neutral-400 hover:text-gold-500', listening && 'text-red-500 animate-pulse')}
                  aria-label={listening ? 'Arrêter la recherche vocale' : 'Recherche vocale'}
                >
                  {listening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
              {enableVisual && (
                <button
                  type="button"
                  onClick={() => !isVisualSearching && fileInputRef.current?.click()}
                  disabled={isVisualSearching}
                  className="text-neutral-400 hover:text-gold-500 transition-colors"
                  aria-label="Recherche par image"
                >
                  {isVisualSearching ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                </button>
              )}
            </div>
          }
          placeholder={isVisualSearching ? 'Analyse en cours...' : placeholder}
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => !isVisualSearching && onFocusChange(true)}
          inputSize="md"
          variant="glass"
          className="rounded-xl"
          disabled={isVisualSearching}
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleVisualSearch}
        />
      </form>

      <AnimatePresence>
        {showPanel && !isVisualSearching && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white/95 dark:bg-midnight-800/95 backdrop-blur-xl rounded-xl shadow-strong border border-gold-400/20 p-4 z-20 max-h-96 overflow-y-auto"
          >
            {debouncedQuery.length >= 2 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2 flex items-center gap-1">
                  <Package size={14} className="text-gold-500" /> Produits
                </p>
                {loadingSuggestions ? (
                  <div className="flex items-center gap-2 text-sm text-neutral-400 py-2">
                    <Loader2 size={14} className="animate-spin" /> Chargement...
                  </div>
                ) : suggestions.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-2">Aucun produit trouvé.</p>
                ) : (
                  <div className="space-y-0.5">
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSuggestionClick(s)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gold-400/10 transition-colors w-full text-left text-neutral-700 dark:text-neutral-300"
                      >
                        {s.image ? (
                          <img src={s.image} alt="" className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                          <Search size={14} className="text-gold-500 flex-shrink-0" />
                        )}
                        <span className="flex-1 truncate">{s.text}</span>
                        <ArrowRight size={14} className="text-neutral-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {recentSearches.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                    <History size={14} className="text-gold-500" /> Recherches récentes
                  </p>
                  <button onClick={clearRecentSearches} className="text-xs text-gold-600 hover:underline">
                    Effacer
                  </button>
                </div>
                <div className="space-y-0.5">
                  {recentSearches.map((term, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleRecentClick(term)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gold-400/10 transition-colors w-full text-left text-neutral-700 dark:text-neutral-300"
                    >
                      <Clock size={14} className="text-gold-500 flex-shrink-0" />
                      <span className="flex-1 truncate">{term}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}