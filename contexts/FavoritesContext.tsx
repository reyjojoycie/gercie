'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

interface FavoritesContextType {
  items: string[]
  add: (id: string) => void
  remove: (id: string) => void
  toggle: (id: string) => void
  isFavorite: (id: string) => boolean
  clear: () => void
}

const FavoritesContext = createContext<FavoritesContextType | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<string[]>([])

  const add = useCallback((id: string) => {
    setItems((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i !== id))
  }, [])

  const toggle = useCallback((id: string) => {
    setItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }, [])

  const isFavorite = useCallback(
    (id: string) => items.includes(id),
    [items]
  )

  const clear = useCallback(() => {
    setItems([])
  }, [])

  return (
    <FavoritesContext.Provider
      value={{ items, add, remove, toggle, isFavorite, clear }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) {
    throw new Error('useFavorites must be used inside <FavoritesProvider>')
  }
  return ctx
}