// components/auth/OAuthButtons.tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types & configuration                                              */
/* ------------------------------------------------------------------ */

type Provider = 'google' | 'facebook' | 'apple'

interface OAuthButtonsProps {
  providers?: Provider[]
  className?: string
}

interface ProviderConfig {
  label: string
  icon: React.ReactNode
  className: string
}

const providerConfig: Record<Provider, ProviderConfig> = {
  google: {
    label: 'Continuer avec Google',
    icon: (
      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
    className:
      'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200',
  },
  facebook: {
    label: 'Continuer avec Facebook',
    icon: (
      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
      </svg>
    ),
    className:
      'bg-[#1877F2] border-[#1877F2] text-white hover:bg-[#166fe5]',
  },
  apple: {
    label: 'Continuer avec Apple',
    icon: (
      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    ),
    className:
      'bg-black dark:bg-white border-black dark:border-white text-white dark:text-black hover:bg-neutral-900 dark:hover:bg-neutral-200',
  },
}

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export function OAuthButtons({
  providers = ['google'],
  className,
}: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null)
  const [errors, setErrors] = useState<Partial<Record<Provider, string>>>({})

  // Filtrer les providers activés via variables d'environnement
  const activeProviders = providers.filter((p) => {
    if (p === 'facebook' && process.env.NEXT_PUBLIC_FACEBOOK_ENABLED !== 'true') return false
    if (p === 'apple' && process.env.NEXT_PUBLIC_APPLE_ENABLED !== 'true') return false
    return true
  })

  const handleProvider = async (provider: Provider) => {
    setLoadingProvider(provider)
    setErrors((prev) => ({ ...prev, [provider]: undefined }))
    try {
      const { error } = await supabaseBrowser.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/oauth`,
        },
      })
      if (error) throw error
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, [provider]: err.message }))
    } finally {
      setLoadingProvider(null)
    }
  }

  if (activeProviders.length === 0) {
    return (
      <p className="text-xs text-neutral-400 text-center">
        Aucun fournisseur de connexion sociale disponible.
      </p>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {activeProviders.map((provider) => {
        const config = providerConfig[provider]
        const isLoading = loadingProvider === provider
        return (
          <div key={provider}>
            <Button
              type="button"
              variant="outline"
              fullWidth
              size="lg"
              onClick={() => handleProvider(provider)}
              loading={isLoading}
              disabled={loadingProvider !== null}
              className={cn(config.className)}
            >
              {!isLoading && config.icon}
              {config.label}
            </Button>
            {errors[provider] && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-500 text-xs text-center mt-1"
              >
                {errors[provider]}
              </motion.p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default OAuthButtons