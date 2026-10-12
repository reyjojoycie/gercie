// app/onboarding/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Mail,
  Phone,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const TOTAL_STEPS = 5
const CURRENT_STEP = 1

/* ------------------------------------------------------------------ */
/*  Composant : Étape 1 — Vérification obligatoire                     */
/* ------------------------------------------------------------------ */

export default function OnboardingStep1() {
  const router = useRouter()

  const { user, refreshRoles } = useAuth()

  const [sending, setSending] = useState<'email' | 'phone' | null>(null)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<{
    telephone?: string
    email_verified?: boolean
    phone_verified?: boolean
  } | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  /* ---------------------------------------------------------------- */
  /*  Fetch profil                                                     */
  /*  ⚠️ PAS D'AUTO-SYNC ici.                                         */
  /*  La vérification se fait UNIQUEMENT via :                         */
  /*  - /api/auth/verify-email/confirm (code)                         */
  /*  - /auth/callback (lien magique)                                 */
  /*  - /api/auth/verify-phone/confirm (code)                         */
  /* ---------------------------------------------------------------- */

  const fetchProfile = useCallback(async () => {
    if (!user) return

    try {
      const { data, error: profileError } = await supabaseBrowser
        .from('profiles')
        .select('telephone, email_verified, phone_verified')
        .eq('id', user.id)
        .single()

      if (profileError || !data) {
        console.warn('[ONBOARDING] Profile fetch failed:', profileError?.message)
        setProfile({ telephone: '', email_verified: false, phone_verified: false })
        setLoadingProfile(false)
        return
      }

      setProfile(data)
    } catch (err: any) {
      console.error('[ONBOARDING] Profile fetch exception:', err?.message)
      setProfile({ telephone: '', email_verified: false, phone_verified: false })
    } finally {
      setLoadingProfile(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setLoadingProfile(false)
      return
    }

    fetchProfile()
    refreshRoles()
  }, [user, fetchProfile, refreshRoles])

  /* ---------------------------------------------------------------- */
  /*  Données                                                          */
  /* ---------------------------------------------------------------- */

  const email = user?.email ?? ''
  const phone = profile?.telephone ?? ''

  const isEmailVerified = profile?.email_verified === true
  const isPhoneVerified = profile?.phone_verified === true

  // ✅ Règle métier §4.3 :
  // Étape 1 = vérification OBLIGATOIRE d'au moins un canal (email OU téléphone)
  const canContinue = isEmailVerified || isPhoneVerified

  /* ---------------------------------------------------------------- */
  /*  Envoyer un code de vérification                                  */
  /* ---------------------------------------------------------------- */

  const handleSendCode = async (channel: 'email' | 'phone') => {
    setError('')
    setSending(channel)

    try {
      const endpoint =
        channel === 'email'
          ? '/api/auth/verify-email'
          : '/api/auth/verify-phone'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      let result: any = {}

      try {
        result = await res.json()
      } catch {
        // JSON invalide
      }

      if (!res.ok) {
        throw new Error(
          result.error || 'Erreur lors de l\'envoi du code de vérification.'
        )
      }

      // ✅ Transmettre le devCode à la page de saisie (dev uniquement)
      if (result?.devCode) {
        try {
          sessionStorage.setItem('gercie_dev_code', result.devCode)
        } catch {
          // Ignorer
        }
      }

      // Rediriger vers la page de saisie du code
      router.push(
        channel === 'email' ? '/auth/verify-email' : '/auth/verify-phone'
      )
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue. Réessayez.')
    } finally {
      setSending(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu                                                            */
  /* ---------------------------------------------------------------- */

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
            <span>Étape {CURRENT_STEP} sur {TOTAL_STEPS}</span>
            <span>Vérification</span>
          </div>

          <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gold-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(CURRENT_STEP / TOTAL_STEPS) * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Carte principale */}
        <Card variant="glass" className="border-gold-400/20 shadow-gold">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
              <ShieldCheck
                size={32}
                className="text-gold-600 dark:text-gold-400"
                aria-hidden="true"
              />
            </div>

            <CardTitle className="text-3xl font-serif text-neutral-900 dark:text-neutral-100">
              Bienvenue chez Gercie !
            </CardTitle>

            <CardDescription className="text-neutral-500 dark:text-neutral-400 mt-2">
              Pour profiter pleinement de votre compte, veuillez vérifier votre
              identité via au moins un des canaux suivants.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Loading skeleton */}
            {loadingProfile && (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {/* Erreur */}
            {error && (
              <div
                role="alert"
                className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-xl text-sm flex items-center gap-2"
              >
                <AlertCircle size={16} aria-hidden="true" />
                {error}
              </div>
            )}

            {/* Contenu après chargement */}
            {!loadingProfile && (
              <>
                {/* Canal Email */}
                <div className="flex items-center justify-between bg-neutral-100 dark:bg-neutral-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                      <Mail
                        size={20}
                        className="text-blue-600 dark:text-blue-400"
                        aria-hidden="true"
                      />
                    </div>

                    <div>
                      <p className="font-medium text-neutral-800 dark:text-neutral-200">
                        Adresse email
                      </p>
                      <p className="text-sm text-neutral-500">
                        {email || 'Non renseignée'}
                      </p>
                    </div>
                  </div>

                  {isEmailVerified ? (
                    <Badge
                      variant="gold"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Vérifiée
                    </Badge>
                  ) : (
                    <Button
                      variant="outline-gold"
                      size="sm"
                      loading={sending === 'email'}
                      disabled={!email || sending === 'email'}
                      onClick={() => handleSendCode('email')}
                    >
                      {sending === 'email' ? 'Envoi…' : 'Vérifier'}
                    </Button>
                  )}
                </div>

                {/* Canal Téléphone */}
                <div className="flex items-center justify-between bg-neutral-100 dark:bg-neutral-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                      <Phone
                        size={20}
                        className="text-green-600 dark:text-green-400"
                        aria-hidden="true"
                      />
                    </div>

                    <div>
                      <p className="font-medium text-neutral-800 dark:text-neutral-200">
                        Téléphone
                      </p>
                      <p className="text-sm text-neutral-500">
                        {phone || 'Non renseigné'}
                      </p>
                    </div>
                  </div>

                  {isPhoneVerified ? (
                    <Badge
                      variant="gold"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Vérifié
                    </Badge>
                  ) : (
                    <Button
                      variant="outline-gold"
                      size="sm"
                      loading={sending === 'phone'}
                      disabled={!phone || sending === 'phone'}
                      onClick={() => handleSendCode('phone')}
                    >
                      {sending === 'phone' ? 'Envoi…' : 'Vérifier'}
                    </Button>
                  )}
                </div>

                {/* Note si pas de téléphone */}
                {!phone && (
                  <p className="text-xs text-neutral-400 text-center">
                    Vous pourrez ajouter votre numéro de téléphone plus tard
                    dans vos paramètres.
                  </p>
                )}

                {/* Actions */}
                <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 mt-2">
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => router.push('/login')}
                      className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                    >
                      <ArrowLeft size={16} className="mr-1" aria-hidden="true" />
                      Retour
                    </Button>

                    <div className="flex-1 text-center">
                      {!canContinue && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Vérifiez au moins un canal pour continuer.
                        </p>
                      )}
                    </div>

                    <Button
                      variant="luxe"
                      disabled={!canContinue}
                      onClick={() => router.push('/onboarding/profile')}
                      className="shadow-gold hover:shadow-glow-gold min-w-[140px]"
                    >
                      Continuer
                      <ArrowRight size={16} className="ml-1" aria-hidden="true" />
                    </Button>
                  </div>

                  {/* 
                    ✅ PAS DE BOUTON "PASSER" :
                    La vérification d'au moins un canal est OBLIGATOIRE.
                    Règle métier §4.3 — aucune exception.
                  */}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}