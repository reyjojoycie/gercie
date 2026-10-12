// components/ui/TurnstileWidget.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

interface TurnstileWidgetProps {
  siteKey?: string
  onVerify: (token: string) => void
  onError?: (error: Error) => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact'
  className?: string
}

declare global {
  interface Window {
    turnstile: any
    onTurnstileLoad?: () => void
  }
}

export function TurnstileWidget({
  siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA', // clé de test
  onVerify,
  onError,
  theme = 'auto',
  size = 'normal',
  className,
}: TurnstileWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | undefined>()
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    if (!scriptReady || !widgetRef.current) return

    try {
      if (window.turnstile) {
        widgetId.current = window.turnstile.render(widgetRef.current, {
          sitekey: siteKey,
          callback: onVerify,
          'error-callback': onError,
          theme,
          size,
        })
      }
    } catch (err) {
      console.error('Turnstile render error:', err)
      onError?.(err as Error)
    }

    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current)
      }
    }
  }, [scriptReady, siteKey, theme, size, onVerify, onError])

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onLoad={() => {
          window.turnstile?.ready(() => {
            setScriptReady(true)
          })
        }}
        strategy="afterInteractive"
      />
      <div ref={widgetRef} className={className} />
    </>
  )
}

export default TurnstileWidget