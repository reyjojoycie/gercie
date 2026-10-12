// ---------------------------------------------------------------------------
// Étape 5 Onboarding – Finalisation et redirection
// Optimisé pour mobile 2G/3G : feedback visuel, retry, redirection fluide
// ---------------------------------------------------------------------------
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  PartyPopper,
  ArrowRight,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const REDIRECT_DELAY = 3000 // 3 secondes avant redirection automatique

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function DoneStep() {
  const router = useRouter()
  const { user, refreshRoles } = useAuth()

  const [isCompleting, setIsCompleting] = useState(true)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(REDIRECT_DELAY / 1000)
  const [isRedirecting, setIsRedirecting] = useState(false)

  /* ---------------------------------------------------------------- */
  /*  Finaliser l'onboarding                                           */
  /* ---------------------------------------------------------------- */

  const completeOnboarding = useCallback(async () => {
    setIsCompleting(true)
    setError('')

    try {
      console.log('[DoneStep] Finalisation onboarding...')

      // Appeler l'API pour finaliser l'onboarding
      const res = await fetch('/api/auth/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[DoneStep] Erreur API:', body)
        throw new Error(body.error || 'Erreur lors de la finalisation')
      }

      const data = await res.json()
      console.log('[DoneStep] ✅ Onboarding finalisé:', data)

      // Rafraîchir les rôles pour mettre à jour le contexte
      if (refreshRoles) {
        await refreshRoles()
      }

      setIsCompleting(false)
    } catch (err: any) {
      console.error('[DoneStep] Erreur:', err)
      setError(err.message || 'Impossible de finaliser l\'onboarding.')
      setIsCompleting(false)
    }
  }, [refreshRoles])

  useEffect(() => {
    completeOnboarding()
  }, [completeOnboarding])

  /* ---------------------------------------------------------------- */
  /*  Compte à rebours avant redirection                               */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (isCompleting || error) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setIsRedirecting(true)
          router.push('/')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isCompleting, error, router])

  /* ---------------------------------------------------------------- */
  /*  Redirection manuelle                                             */
  /* ---------------------------------------------------------------- */

  const handleManualRedirect = () => {
    setIsRedirecting(true)
    router.push('/')
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu                                                            */
  /* ---------------------------------------------------------------- */

  const displayName = user?.user_metadata?.prenom || user?.user_metadata?.nom || 'Utilisateur'

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Progression */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-neutral-500 mb-1">
            <span>Étape 5 sur 5</span>
            <span>Terminé</span>
          </div>

          <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gold-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>

        <Card variant="glass" className="border-gold-400/20 shadow-gold">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              {isCompleting ? (
                <Loader2 size={40} className="animate-spin text-green-600 dark:text-green-400" aria-hidden="true" />
              ) : (
                <PartyPopper size={40} className="text-green-600 dark:text-green-400" aria-hidden="true" />
              )}
            </div>

            <CardTitle className="text-3xl font-serif text-neutral-900 dark:text-neutral-100">
              Félicitations{displayName ? `, ${displayName}` : ''} ! 🎉
            </CardTitle>

            <CardDescription className="text-neutral-500 dark:text-neutral-400 mt-2">
              Votre compte est maintenant prêt. Bienvenue sur Gercie !
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Erreur */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-xl text-sm flex items-center gap-2"
              >
                <AlertCircle size={16} aria-hidden="true" />
                <span className="flex-1">{error}</span>
              </motion.div>
            )}

            {/* Résumé de ce qui a été complété */}
            {!isCompleting && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" aria-hidden="true" />
                  <span>Identité vérifiée</span>
                </div>

                <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" aria-hidden="true" />
                  <span>Profil complété</span>
                </div>

                <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" aria-hidden="true" />
                  <span>Préférences enregistrées</span>
                </div>

                <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" aria-hidden="true" />
                  <span>Conditions acceptées</span>
                </div>
              </motion.div>
            )}

            {/* Redirection automatique */}
            {!isCompleting && !error && !isRedirecting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-center space-y-4 pt-4 border-t border-neutral-200 dark:border-neutral-700"
              >
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Redirection vers l&apos;accueil dans{' '}
                  <span className="font-bold text-gold-600 dark:text-gold-400">{countdown}</span>{' '}
                  seconde{countdown > 1 ? 's' : ''}...
                </p>

                <Button
                  variant="luxe"
                  size="lg"
                  onClick={handleManualRedirect}
                  disabled={isRedirecting}
                  className="shadow-gold hover:shadow-glow-gold"
                >
                  {isRedirecting ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" aria-hidden="true" />
                      Redirection...
                    </>
                  ) : (
                    <>
                      Aller à l&apos;accueil maintenant
                      <ArrowRight size={16} className="ml-1" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </motion.div>
            )}

            {/* Bouton réessayer en cas d'erreur */}
            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center pt-4 border-t border-neutral-200 dark:border-neutral-700"
              >
                <Button
                  variant="luxe"
                  size="lg"
                  onClick={completeOnboarding}
                  disabled={isCompleting}
                  className="shadow-gold hover:shadow-glow-gold"
                >
                  {isCompleting ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" aria-hidden="true" />
                      Tentative...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} className="mr-2" aria-hidden="true" />
                      Réessayer
                    </>
                  )}
                </Button>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}