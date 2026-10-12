'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

interface SearchContextType {
  query: string
  setQuery: (q: string) => void
  clear: () => void
}

const SearchContext = createContext<SearchContextType | null>(null)

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')

  const clear = useCallback(() => {
    setQuery('')
  }, [])

  return (
    <SearchContext.Provider value={{ query, setQuery, clear }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearchContext() {
  const ctx = useContext(SearchContext)
  if (!ctx) {
    throw new Error('useSearchContext must be used inside <SearchProvider>')
  }
  return ctx
}