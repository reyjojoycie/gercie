'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

const OnlineStatusContext = createContext<boolean>(true)

export function OnlineStatusProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <OnlineStatusContext.Provider value={online}>
      {children}
    </OnlineStatusContext.Provider>
  )
}

export function useOnlineStatus() {
  return useContext(OnlineStatusContext)
}