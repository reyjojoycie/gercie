// hooks/useOptimizedFetch.ts
'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

interface UseOptimizedFetchOptions {
  enabled?: boolean
  dedupingInterval?: number
  focusThrottleInterval?: number
  revalidateOnFocus?: boolean
  revalidateOnReconnect?: boolean
}

/**
 * Hook pour fetches optimisées avec:
 * - Deduplication (cache court terme)
 * - Revalidation au refocus
 * - Gestion de la connexion
 * - AbortController
 */
export function useOptimizedFetch<T = unknown>(
  url: string | null,
  options: UseOptimizedFetchOptions = {}
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const {
    enabled = true,
    dedupingInterval = 1000,
    focusThrottleInterval = 5000,
    revalidateOnFocus = true,
    revalidateOnReconnect = true,
  } = options

  const abortControllerRef = useRef<AbortController | null>(null)
  const cacheRef = useRef<{ data: T; timestamp: number } | null>(null)
  const lastFetchRef = useRef<number>(0)
  const lastFocusRef = useRef<number>(0)

  const fetch = useCallback(async () => {
    if (!enabled || !url) return

    // Deduplication: ne pas faire de requête si une a été faite récemment
    const now = Date.now()
    if (now - lastFetchRef.current < dedupingInterval) {
      if (cacheRef.current) {
        setData(cacheRef.current.data)
      }
      return
    }

    // Annuler les requêtes précédentes
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    setLoading(true)

    try {
      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const result = await response.json()
      cacheRef.current = { data: result, timestamp: now }
      lastFetchRef.current = now
      setData(result)
      setError(null)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err)
      }
    } finally {
      setLoading(false)
    }
  }, [enabled, url, dedupingInterval])

  // Auto-fetch
  useEffect(() => {
    fetch()
  }, [fetch])

  // Revalidation au refocus
  useEffect(() => {
    if (!revalidateOnFocus) return

    const handleFocus = () => {
      const now = Date.now()
      if (now - lastFocusRef.current > focusThrottleInterval) {
        lastFocusRef.current = now
        lastFetchRef.current = 0
        fetch()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetch, revalidateOnFocus, focusThrottleInterval])

  // Revalidation à la reconnexion
  useEffect(() => {
    if (!revalidateOnReconnect) return

    const handleOnline = () => {
      lastFetchRef.current = 0
      fetch()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [fetch, revalidateOnReconnect])

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const refetch = useCallback(() => {
    lastFetchRef.current = 0
    fetch()
  }, [fetch])

  return { data, loading, error, refetch }
}
