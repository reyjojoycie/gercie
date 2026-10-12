// ---------------------------------------------------------------------------
// Étape 3 Onboarding – Préférences (langue, devise, notifications)
// Optimisé pour mobile 2G/3G : skeleton, toggle premium, feedback visuel
// ---------------------------------------------------------------------------
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sliders,
  Globe,
  Bell,
  Mail,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const TOTAL_STEPS = 5
const CURRENT_STEP = 3

const LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
] as const

const CURRENCIES = [
  { code: 'CDF', label: 'Franc Congolais', symbol: 'FC', example: '10 000' },
  { code: 'USD', label: 'Dollar Américain', symbol: '$', example: '5.00' },
] as const

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Preferences {
  langue: string
  devise: string
  notifications_email: boolean
  notifications_sms: boolean
}

/* ------------------------------------------------------------------ */
/*  Composant : Toggle Switch Premium                                  */
/* ------------------------------------------------------------------ */

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  icon,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  icon?: React.ReactNode
  id: string
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-gold-400/50 dark:hover:border-gold-400/30 transition-all cursor-pointer group bg-white dark:bg-neutral-800/30"
    >
      <div className="flex-shrink-0 mt-0.5">
        {icon && (
          <div className="w-10 h-10 rounded-full bg-gold-50 dark:bg-gold-900/20 flex items-center justify-center text-gold-600 dark:text-gold-400">
            {icon}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-neutral-800 dark:text-neutral-200 text-sm">
          {label}
        </div>
        {description && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {description}
          </div>
        )}
      </div>

      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900',
          checked
            ? 'bg-gold-500'
            : 'bg-neutral-300 dark:bg-neutral-600'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/*  Composant : Skeleton                                               */
/* ------------------------------------------------------------------ */

function PreferencesSkeleton() {
  return (
    <div className="w-full">
      <Card variant="glass" className="border-gold-400/20 shadow-gold">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
          <div className="h-8 bg-neutral-200 dark:bg-neutral-700 rounded w-3/4 mx-auto mb-2 animate-pulse" />
          <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2 mx-auto animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Langue skeleton */}
          <div className="space-y-2">
            <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-24 animate-pulse" />
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 bg-neutral-200 dark:bg-neutral-700 rounded-xl animate-pulse"
                />
              ))}
            </div>
          </div>

          {/* Devise skeleton */}
          <div className="space-y-2">
            <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-32 animate-pulse" />
            <div className="grid grid-cols-2 gap-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-neutral-200 dark:bg-neutral-700 rounded-xl animate-pulse"
                />
              ))}
            </div>
          </div>

          {/* Notifications skeleton */}
          <div className="space-y-2">
            <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-28 animate-pulse" />
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-neutral-200 dark:bg-neutral-700 rounded-xl animate-pulse"
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */

export default function PreferencesStep() {
  const router = useRouter()
  const { user } = useAuth()

  const [language, setLanguage] = useState('fr')
  const [currency, setCurrency] = useState('CDF')
  const [notificationsEmail, setNotificationsEmail] = useState(true)
  const [notificationsSms, setNotificationsSms] = useState(false)

  // ✅ NOUVEAU : États pour nom/prenom/telephone (requis par l'API)
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [telephone, setTelephone] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  /* ---------------------------------------------------------------- */
  /*  Chargement des préférences existantes + profil                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!user) return

    const load = async () => {
      try {
        // ✅ CORRECTION : on charge aussi nom, prenom, telephone
        const { data, error } = await supabaseBrowser
          .from('profiles')
          .select('preferences, nom, prenom, telephone')
          .eq('id', user.id)
          .single()

        if (error) throw error

        if (data) {
          // Charger les infos de base pour le update
          setNom(data.nom || '')
          setPrenom(data.prenom || '')
          setTelephone(data.telephone || '')

          // Charger les préférences
          if (data.preferences) {
            const prefs = data.preferences as Preferences
            setLanguage(prefs.langue || 'fr')
            setCurrency(prefs.devise || 'CDF')
            setNotificationsEmail(prefs.notifications_email !== false)
            setNotificationsSms(prefs.notifications_sms === true)
          }
        }
      } catch (err: any) {
        console.error('[PreferencesStep] Erreur chargement:', err)
      } finally {
        setIsLoadingPrefs(false)
      }
    }

    load()
  }, [user])

  /* ---------------------------------------------------------------- */
  /*  Sauvegarde                                                       */
  /* ---------------------------------------------------------------- */

  const handleSave = async () => {
    setError('')
    setSuccess('')
    setIsSaving(true)

    try {
      const preferences: Preferences = {
        langue: language,
        devise: currency,
        notifications_email: notificationsEmail,
        notifications_sms: notificationsSms,
      }

      const res = await fetch('/api/user/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ✅ CORRECTION : on envoie nom, prenom, telephone pour satisfaire l'API
          nom,
          prenom,
          telephone: telephone || undefined,
          preferences,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Erreur lors de la sauvegarde')
      }

      setSuccess('Préférences enregistrées avec succès')

      // Petit délai pour voir le feedback, puis navigation
      setTimeout(() => {
        router.push('/onboarding/terms')
      }, 800)
    } catch (err: any) {
      console.error('[PreferencesStep] Erreur sauvegarde:', err)
      setError(err.message || 'Impossible d\'enregistrer vos préférences.')
    } finally {
      setIsSaving(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu : skeleton                                                 */
  /* ---------------------------------------------------------------- */

  if (isLoadingPrefs) {
    return <PreferencesSkeleton />
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu principal                                                  */
  /* ---------------------------------------------------------------- */

  const selectedCurrencyData = CURRENCIES.find((c) => c.code === currency)

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
            <span>Préférences</span>
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

        <Card variant="glass" className="border-gold-400/20 shadow-gold">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
              <Sliders
                size={32}
                className="text-gold-600 dark:text-gold-400"
                aria-hidden="true"
              />
            </div>

            <CardTitle className="text-3xl font-serif text-neutral-900 dark:text-neutral-100">
              Personnalisez votre expérience
            </CardTitle>

            <CardDescription className="text-neutral-500 dark:text-neutral-400 mt-2">
              Choisissez votre langue, votre devise et vos préférences de notification.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Erreur */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  role="alert"
                  className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-xl text-sm flex items-center gap-2"
                >
                  <AlertCircle size={16} aria-hidden="true" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError('')}
                    className="text-red-500 hover:text-red-700"
                    aria-label="Fermer"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Succès */}
            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  role="status"
                  className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 p-4 rounded-xl text-sm flex items-center gap-2"
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {success}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Langue */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
                <Globe
                  size={14}
                  className="inline mr-1.5 -mt-0.5"
                  aria-hidden="true"
                />
                Langue de l'interface
              </label>

              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Langue">
                {LANGUAGES.map((lang) => (
                  <motion.button
                    key={lang.code}
                    type="button"
                    role="radio"
                    aria-checked={language === lang.code}
                    onClick={() => setLanguage(lang.code)}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900',
                      language === lang.code
                        ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/20 text-gold-700 dark:text-gold-300 shadow-sm'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-gold-400/50 bg-white dark:bg-neutral-800/30'
                    )}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {lang.flag}
                    </span>
                    <span className="text-xs font-medium">{lang.label}</span>
                  </motion.button>
                ))}
              </div>

              <p className="text-xs text-neutral-400 mt-2">
                💡 Le changement de langue sera appliqué après la fin de l'onboarding.
              </p>
            </div>

            {/* Devise */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
                Devise préférée pour les prix
              </label>

              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Devise">
                {CURRENCIES.map((curr) => (
                  <motion.button
                    key={curr.code}
                    type="button"
                    role="radio"
                    aria-checked={currency === curr.code}
                    onClick={() => setCurrency(curr.code)}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 p-4 rounded-xl border-2 transition-all text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900',
                      currency === curr.code
                        ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/20 text-gold-700 dark:text-gold-300 shadow-sm'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-gold-400/50 bg-white dark:bg-neutral-800/30'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{curr.symbol}</span>
                      <span className="font-medium">{curr.code}</span>
                    </div>
                    <span className="text-xs opacity-75">{curr.label}</span>
                  </motion.button>
                ))}
              </div>

              {/* Prévisualisation */}
              {selectedCurrencyData && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 p-3 bg-neutral-50 dark:bg-neutral-800/30 rounded-lg border border-neutral-200 dark:border-neutral-700"
                >
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Aperçu : un produit affiché comme{' '}
                    <span className="font-bold text-neutral-800 dark:text-neutral-200">
                      {selectedCurrencyData.symbol} {selectedCurrencyData.example}
                    </span>{' '}
                    dans cette devise.
                  </p>
                </motion.div>
              )}
            </div>

            {/* Notifications */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
                <Bell
                  size={14}
                  className="inline mr-1.5 -mt-0.5"
                  aria-hidden="true"
                />
                Notifications
              </label>

              <div className="space-y-2">
                <ToggleSwitch
                  id="notif-email"
                  checked={notificationsEmail}
                  onChange={setNotificationsEmail}
                  label="Notifications par email"
                  description="Commandes, promotions et actualités"
                  icon={<Mail size={18} aria-hidden="true" />}
                />

                <ToggleSwitch
                  id="notif-sms"
                  checked={notificationsSms}
                  onChange={setNotificationsSms}
                  label="Notifications par SMS"
                  description="Alertes urgentes et suivi de livraison"
                  icon={<MessageSquare size={18} aria-hidden="true" />}
                />
              </div>

              <p className="text-xs text-neutral-400 mt-2">
                💡 Vous pourrez modifier ces préférences à tout moment dans vos paramètres.
              </p>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push('/onboarding/profile')}
                className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                <ArrowLeft size={16} className="mr-1" aria-hidden="true" />
                Retour
              </Button>

              <Button
                type="button"
                variant="luxe"
                size="lg"
                onClick={handleSave}
                loading={isSaving}
                disabled={isSaving}
                className="shadow-gold hover:shadow-glow-gold"
              >
                {isSaving ? 'Enregistrement…' : 'Continuer'}
                <ArrowRight size={16} className="ml-1" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}