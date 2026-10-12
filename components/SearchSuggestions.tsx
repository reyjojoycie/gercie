// components/SearchSuggestions.tsx
'use client'

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  KeyboardEvent,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useSearchSuggestions } from '@/hooks/useSearch' // hook existant (Meilisearch)
import { useSearchHistory } from '@/hooks/useSearch'
import { Tooltip } from '@/components/ui/Tooltip'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  Search,
  Clock,
  TrendingUp,
  X,
  ArrowRight,
  Star,
  Zap,
  Tag,
  Package,
  ChevronRight,
  Loader2,
  Sparkles,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface SearchSuggestion {
  text: string
  type?: 'history' | 'trending' | 'category' | 'product' | 'recent' | 'ai-semantic'
  image?: string
  count?: number
  href?: string
  score?: number      // score IA (0-1)
  productId?: string  // ID du produit pour les suggestions IA
}

interface SearchSuggestionsProps {
  query: string
  onSelect: (suggestion: SearchSuggestion | string) => void
  onClose?: () => void
  visible?: boolean
  width?: string
  className?: string
  maxItems?: number
  showRecent?: boolean
  showTrending?: boolean
  popularCategories?: string[]
  renderSuggestion?: (suggestion: SearchSuggestion, index: number) => React.ReactNode
  /** Mode de recherche IA (si activé, ajoute les suggestions sémantiques) */
  aiMode?: 'text' | 'semantic' | 'hybrid'
}

/* ========================================================================== */
/*  Composant SearchSuggestions                                               */
/* ========================================================================== */

export function SearchSuggestions({
  query,
  onSelect,
  onClose,
  visible: controlledVisible,
  width = '100%',
  className,
  maxItems = 8,
  showRecent = true,
  showTrending = true,
  popularCategories = [],
  renderSuggestion,
  aiMode = 'text',   // par défaut comportement existant
}: SearchSuggestionsProps) {
  const debouncedQuery = useDebounce(query, 300)
  const { suggestions, isLoading } = useSearchSuggestions(debouncedQuery, 5)
  const { history, addToHistory, clearHistory } = useSearchHistory()

  const [internalVisible, setInternalVisible] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Suggestions sémantiques
  const [aiSuggestions, setAiSuggestions] = useState<SearchSuggestion[]>([])
  const [aiLoading, setAiLoading] = useState(false)

  const isVisible = controlledVisible !== undefined ? controlledVisible : internalVisible

  // Affichage automatique
  useEffect(() => {
    if (debouncedQuery.length >= 2 || (showRecent && history.length > 0) || (showTrending && !debouncedQuery)) {
      setInternalVisible(true)
    } else {
      setInternalVisible(false)
    }
  }, [debouncedQuery, history, showRecent, showTrending])

  // Fermer si clic extérieur
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setInternalVisible(false)
        onClose?.()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Recherche sémantique / hybride
  useEffect(() => {
    if (aiMode === 'text' || debouncedQuery.length < 2) {
      setAiSuggestions([])
      return
    }

    let cancelled = false
    const fetchAi = async () => {
      setAiLoading(true)
      try {
        const res = await fetch(
          `/api/ai/search?q=${encodeURIComponent(debouncedQuery)}&mode=${aiMode}&limit=5&minScore=0.4`
        )
        const data = await res.json()
        if (!cancelled && data.results) {
          const items: SearchSuggestion[] = data.results.map((r: any) => ({
            text: r.product_id, // sera remplacé par le nom plus tard, mais on peut afficher l'ID provisoirement
            type: 'ai-semantic' as const,
            score: r.score,
            productId: r.product_id,
            // On pourrait récupérer le nom du produit via une API batch, mais pour la légèreté on affichera "Produit IA"
            image: undefined,
          }))
          setAiSuggestions(items)
        }
      } catch (err) {
        // silencieux
      } finally {
        if (!cancelled) setAiLoading(false)
      }
    }
    fetchAi()
    return () => { cancelled = true }
  }, [debouncedQuery, aiMode])

  // Construction de la liste fusionnée
  const allSuggestions = useMemo<SearchSuggestion[]>(() => {
    const items: SearchSuggestion[] = []

    // S'il n'y a pas de query : historique + tendances + catégories
    if (debouncedQuery.length < 2) {
      history.slice(0, 3).forEach(term => {
        items.push({ text: term, type: 'history' })
      })
      if (showTrending) {
        ['Téléphone', 'Parfum', 'Robe', 'Chaussures'].forEach(term => {
          if (!items.find(i => i.text === term)) {
            items.push({ text: term, type: 'trending' })
          }
        })
      }
      if (popularCategories.length > 0) {
        popularCategories.forEach(cat => {
          items.push({ text: cat, type: 'category' })
        })
      }
    } else {
      // Quand il y a une query, on combine les suggestions textuelles (Meilisearch) et IA si actif
      // Suggestions textuelles
      suggestions.slice(0, maxItems).forEach(s => {
        items.push({ text: s, type: 'product' })
      })

      // Suggestions IA
      if (aiSuggestions.length > 0) {
        aiSuggestions.forEach(ai => {
          // Pour éviter les doublons avec les suggestions textuelles, on vérifie par le texte (nom provisoire)
          if (!items.find(i => i.text === ai.text)) {
            items.push(ai)
          }
        })
      }
    }

    return items.slice(0, maxItems)
  }, [debouncedQuery, suggestions, aiSuggestions, history, popularCategories, maxItems, showTrending])

  // Navigation clavier
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLUListElement>) => {
      if (!isVisible || allSuggestions.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightIndex(prev => (prev + 1) % allSuggestions.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightIndex(prev => (prev - 1 + allSuggestions.length) % allSuggestions.length)
          break
        case 'Enter':
          e.preventDefault()
          if (highlightIndex >= 0 && highlightIndex < allSuggestions.length) {
            selectSuggestion(allSuggestions[highlightIndex])
          }
          break
        case 'Escape':
          setInternalVisible(false)
          onClose?.()
          break
      }
    },
    [isVisible, allSuggestions, highlightIndex, onClose]
  )

  const selectSuggestion = useCallback(
    (suggestion: SearchSuggestion) => {
      addToHistory(suggestion.text)
      // Si c'est une suggestion IA, on peut passer l'objet complet
      onSelect(suggestion)
      setInternalVisible(false)
      onClose?.()
    },
    [addToHistory, onSelect, onClose]
  )

  const getIcon = (type?: string) => {
    switch (type) {
      case 'history':
        return <Clock size={16} className="text-muted-foreground" />
      case 'trending':
        return <TrendingUp size={16} className="text-gold-500" />
      case 'category':
        return <Tag size={16} className="text-accent-500" />
      case 'product':
        return <Package size={16} className="text-brand-500" />
      case 'ai-semantic':
        return <Sparkles size={16} className="text-purple-500" />
      default:
        return <Search size={16} className="text-muted-foreground" />
    }
  }

  if (!isVisible || allSuggestions.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute left-0 right-0 top-full mt-2 z-50',
        width && `w-[${width}]`,
        className
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="bg-card rounded-2xl shadow-strong border border-border overflow-hidden backdrop-blur-xl"
      >
        {/* En-tête avec indicateur de chargement */}
        {debouncedQuery && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium text-foreground">
              Suggestions pour « <span className="text-gold-600">{debouncedQuery}</span> »
            </span>
            <div className="flex items-center gap-2">
              {aiMode !== 'text' && aiLoading && <Loader2 size={16} className="animate-spin text-purple-500" />}
              {isLoading && <Loader2 size={16} className="animate-spin text-gold-500" />}
            </div>
          </div>
        )}

        <ul
          ref={listRef}
          className="py-2 max-h-80 overflow-y-auto overscroll-contain"
          role="listbox"
          onKeyDown={handleKeyDown}
        >
          <AnimatePresence>
            {allSuggestions.map((suggestion, index) => (
              <motion.li
                key={`${suggestion.type}-${suggestion.text}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                role="option"
                aria-selected={index === highlightIndex}
                className={cn(
                  'mx-2 rounded-lg cursor-pointer transition-colors',
                  index === highlightIndex ? 'bg-gold-400/10' : 'hover:bg-secondary'
                )}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => selectSuggestion(suggestion)}
              >
                {renderSuggestion ? (
                  renderSuggestion(suggestion, index)
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="flex-shrink-0">{getIcon(suggestion.type)}</span>
                    {suggestion.image && (
                      <img
                        src={suggestion.image}
                        alt=""
                        className="w-8 h-8 rounded-md object-cover flex-shrink-0"
                      />
                    )}
                    <span className="flex-1 text-foreground truncate">
                      {suggestion.type === 'ai-semantic' ? (
                        <span className="flex items-center gap-1">
                          <Sparkles size={12} className="text-purple-500" />
                          {/* Afficher le nom du produit si disponible, sinon un placeholder */}
                          {suggestion.productId ? `Produit ${suggestion.productId.slice(0,8)}...` : suggestion.text}
                        </span>
                      ) : (
                        suggestion.text
                      )}
                    </span>
                    {suggestion.score !== undefined && (
                      <span className="text-xs text-purple-600 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full">
                        {Math.round(suggestion.score * 100)}%
                      </span>
                    )}
                    {suggestion.count !== undefined && (
                      <span className="text-xs text-muted-foreground">{suggestion.count}</span>
                    )}
                    <ArrowRight size={14} className="text-muted-foreground flex-shrink-0 ml-auto" />
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {/* Effacer l'historique */}
        {!debouncedQuery && history.length > 0 && (
          <div className="px-4 py-3 border-t border-border flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Recherches récentes</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              leftIcon={<X size={14} />}
              className="text-xs text-muted-foreground hover:text-danger"
            >
              Effacer
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  )
}