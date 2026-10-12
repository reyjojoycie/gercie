// hooks/useSemanticSearch.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDebounce } from '@/hooks/useDebounce'

export interface SearchResult {
  product_id: string
  score: number
  textScore?: number
  semanticScore?: number
}

export function useSemanticSearch(
  mode: 'semantic' | 'hybrid' = 'hybrid',
  debounceMs = 300
) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedQuery = useDebounce(query, debounceMs)

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([])
      setError(null)
      return
    }

    let cancelled = false

    const fetchResults = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/ai/search?q=${encodeURIComponent(debouncedQuery)}&mode=${mode}&limit=10&minScore=0.2`
        )
        const data = await res.json()
        if (!cancelled) {
          if (res.ok && data.results) {
            setResults(data.results)
          } else {
            setError(data.error || 'Aucun résultat')
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Erreur réseau')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchResults()
    return () => { cancelled = true }
  }, [debouncedQuery, mode])

  const search = useCallback((q: string) => {
    setQuery(q)
  }, [])

  const clear = useCallback(() => {
    setQuery('')
    setResults([])
    setError(null)
  }, [])

  return {
    query,
    search,
    results,
    isLoading,
    error,
    clear,
  }
}