// app/onboarding/layout.tsx
'use client'

import { useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail,
  User,
  Sliders,
  FileText,
  Check,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'

/* ------------------------------------------------------------------ */
/*  Étapes de l'onboarding                                             */
/* ------------------------------------------------------------------ */

const STEPS = [
  { path: '/onboarding', label: 'Vérification', icon: Mail },
  { path: '/onboarding/profile', label: 'Profil', icon: User },
  { path: '/onboarding/preferences', label: 'Préférences', icon: Sliders },
  { path: '/onboarding/terms', label: 'Conditions', icon: FileText },
  { path: '/onboarding/done', label: 'Terminé', icon: Check },
] as const

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  const {
    user,
    loading,
    isOnboarded,
    isVerified,
  } = useAuth()

  /* ---------------------------------------------------------------- */
  /*  Garde-fou de redirection                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (loading) return

    // Non connecté → login
    if (!user) {
      router.replace('/login?redirect=/onboarding')
      return
    }

    // ✅ Règle métier :
    // Pour accéder à l'accueil, il faut :
    // 1. onboarding terminé
    // 2. au moins un canal vérifié (email OU téléphone)
    if (isOnboarded && isVerified) {
      router.replace('/')
      return
    }

    // Si onboarding terminé mais NON vérifié → rester sur step 1
    if (isOnboarded && !isVerified) {
      router.replace('/onboarding')
      return
    }
  }, [user, loading, isOnboarded, isVerified, router])

  /* ---------------------------------------------------------------- */
  /*  Étape courante                                                   */
  /* ---------------------------------------------------------------- */

  const currentStepIndex = useMemo(() => {
    const idx = STEPS.findIndex((step) => pathname === step.path)
    return idx === -1 ? 0 : idx
  }, [pathname])

  /* ---------------------------------------------------------------- */
  /*  Loading                                                          */
  /* ---------------------------------------------------------------- */

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-midnight-950">
        <Spinner
          size="lg"
          variant="premium"
          label="Chargement de votre parcours…"
        />
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Stepper */}
        <nav aria-label="Progression de l'onboarding" className="mb-10">
          <ol className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex
              const isActive = index === currentStepIndex
              const Icon = step.icon

              return (
                <li
                  key={step.path}
                  className="flex items-center flex-1 last:flex-none"
                >
                  <div className="flex flex-col items-center relative">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors duration-300',
                        isCompleted
                          ? 'bg-gold-500 border-gold-500 text-white'
                          : isActive
                            ? 'bg-gold-100 border-gold-500 text-gold-600 dark:bg-gold-900/30 dark:text-gold-400'
                            : 'bg-neutral-100 border-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:border-neutral-700'
                      )}
                    >
                      {isCompleted ? (
                        <Check size={20} aria-hidden="true" />
                      ) : (
                        <Icon size={20} aria-hidden="true" />
                      )}
                    </motion.div>

                    <span
                      className={cn(
                        'mt-2 text-xs font-medium text-center hidden sm:block',
                        isCompleted
                          ? 'text-gold-600 dark:text-gold-400'
                          : isActive
                            ? 'text-neutral-800 dark:text-neutral-200'
                            : 'text-neutral-400'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>

                  {index < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 mx-2 mt-0 sm:-mt-5',
                        index < currentStepIndex
                          ? 'bg-gold-500'
                          : 'bg-neutral-200 dark:bg-neutral-700'
                      )}
                      aria-hidden="true"
                    />
                  )}
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Contenu de l'étape */}
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}