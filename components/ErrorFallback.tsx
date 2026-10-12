// components/ErrorFallback.tsx
'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCcw, Home, Mail, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export interface ErrorFallbackProps {
  error: Error
  resetErrorBoundary?: () => void
  /** Titre personnalisé (sinon utilise un titre par défaut) */
  title?: string
  /** Description supplémentaire */
  description?: string
  /** Affiche un bouton pour contacter le support */
  showSupportButton?: boolean
  /** URL de la page d'accueil (défaut "/") */
  homeUrl?: string
  /** Adresse email du support */
  supportEmail?: string
  /** Message personnalisé pour le bouton de reset */
  resetButtonLabel?: string
  /** Classe additionnelle */
  className?: string
}

/**
 * Composant d'affichage des erreurs (Error Fallback)
 * Utilisé en conjonction avec un Error Boundary pour capturer les erreurs React.
 */
export function ErrorFallback({
  error,
  resetErrorBoundary,
  title = 'Une erreur est survenue',
  description = 'Nous sommes désolés, une erreur inattendue s’est produite. Veuillez réessayer ou contacter notre support.',
  showSupportButton = true,
  homeUrl = '/',
  supportEmail = 'support@gercie.com',
  resetButtonLabel = 'Réessayer',
  className,
}: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false)

  // La stack trace n'est affichée qu'en développement
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className={cn('flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4', className)}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <Card className="text-center shadow-strong border-brand-200 dark:border-brand-900">
          <CardHeader>
            <motion.div
              initial={{ scale: 0.8, rotate: -5 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
              className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
            >
              <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {title}
            </CardTitle>
            <CardDescription className="mt-2 text-neutral-600 dark:text-neutral-400">
              {description}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Détails de l'erreur en mode développement */}
            {isDev && (
              <div className="mt-4">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-2 text-sm text-neutral-500 hover:text-brand-600 dark:text-neutral-400 dark:hover:text-brand-400 transition-colors mx-auto"
                >
                  {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  Détails techniques
                </button>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mt-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 p-4 text-left overflow-auto max-h-60"
                  >
                    <p className="text-xs font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap">
                      {error.stack || error.message}
                    </p>
                  </motion.div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* Bouton Réessayer */}
            {resetErrorBoundary && (
              <Button
                onClick={resetErrorBoundary}
                variant="primary"
                leftIcon={<RefreshCcw size={18} />}
              >
                {resetButtonLabel}
              </Button>
            )}

            {/* Bouton Retour à l'accueil */}
            <Button
              variant="outline"
              leftIcon={<Home size={18} />}
              onClick={() => {
                window.location.href = homeUrl
              }}
            >
              Retour à l&apos;accueil
            </Button>

            {/* Bouton Contacter le support */}
            {showSupportButton && (
              <Button
                variant="ghost"
                leftIcon={<Mail size={18} />}
                onClick={() => {
                  window.location.href = `mailto:${supportEmail}`
                }}
              >
                Contacter le support
              </Button>
            )}
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  )
}
