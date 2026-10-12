'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

interface LoyaltyContextType {
  points: number
  addPoints: (n: number) => void
  removePoints: (n: number) => void
  reset: () => void
}

const LoyaltyContext = createContext<LoyaltyContextType | null>(null)

export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const [points, setPoints] = useState(0)

  const addPoints = useCallback((n: number) => {
    setPoints((p) => p + Math.max(0, n))
  }, [])

  const removePoints = useCallback((n: number) => {
    setPoints((p) => Math.max(0, p - Math.max(0, n)))
  }, [])

  const reset = useCallback(() => {
    setPoints(0)
  }, [])

  return (
    <LoyaltyContext.Provider value={{ points, addPoints, removePoints, reset }}>
      {children}
    </LoyaltyContext.Provider>
  )
}

export function useLoyalty() {
  const ctx = useContext(LoyaltyContext)
  if (!ctx) {
    throw new Error('useLoyalty must be used inside <LoyaltyProvider>')
  }
  return ctx
}