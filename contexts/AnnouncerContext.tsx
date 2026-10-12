'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

interface AnnouncerContextType {
  announce: (message: string) => void
  clear: () => void
}

const AnnouncerContext = createContext<AnnouncerContextType | null>(null)

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')

  const announce = useCallback((msg: string) => {
    setMessage(msg)
    // Auto-clear après 5 secondes pour éviter l'accumulation
    setTimeout(() => setMessage(''), 5000)
  }, [])

  const clear = useCallback(() => {
    setMessage('')
  }, [])

  return (
    <AnnouncerContext.Provider value={{ announce, clear }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {message}
      </div>
    </AnnouncerContext.Provider>
  )
}

export function useAnnouncer() {
  const ctx = useContext(AnnouncerContext)
  if (!ctx) {
    throw new Error('useAnnouncer must be used inside <AnnouncerProvider>')
  }
  return ctx
}