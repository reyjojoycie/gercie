// app/profile/onboarding/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  User,
  Phone,
  MapPin,
  Settings,
  Shield,
  Upload,
  Camera,
  AlertCircle,
  Loader2,
  WifiOff,
  Sparkles,
  Mail,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2
const MAX_AVATAR_SIZE_MB = 2
const MAX_AVATAR_DIMENSION = 800
const STORAGE_KEY = 'onboarding_progress'

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Réessayez.',
  timeout: 'La requête prend trop de temps.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne.',
  save_failed: 'Impossible d\'enregistrer. Réessayez.',
  avatar_failed: 'Échec de l\'upload de la photo.',
  unknown: 'Une erreur est survenue.',
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type OnboardingStep = 'welcome' | 'profile' | 'location' | 'preferences' | 'terms' | 'done'

interface Province {
  id: string
  nom: string
}

interface Ville {
  id: string
  nom: string
  province_id: string
}

interface Commune {
  id: string
  nom: string
  ville_id: string
}

interface OnboardingData {
  nom: string
  prenom: string
  telephone: string
  avatarFile: File | null
  avatarPreview: string | null
  province_id: string
  ville_id: string
  commune_id: string
  quartier: string
  avenue: string
  numero: string
  reference: string
  preferences: {
    notifications_email: boolean
    notifications_sms: boolean
    langue: 'fr' | 'en' | 'ln' | 'sw'
    devise: 'CDF' | 'USD'
  }
  terms_accepted: boolean
}

const DEFAULT_DATA: OnboardingData = {
  nom: '',
  prenom: '',
  telephone: '',
  avatarFile: null,
  avatarPreview: null,
  province_id: '',
  ville_id: '',
  commune_id: '',
  quartier: '',
  avenue: '',
  numero: '',
  reference: '',
  preferences: {
    notifications_email: true,
    notifications_sms: false,
    langue: 'fr',
    devise: 'CDF',
  },
  terms_accepted: false,
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const PHONE_REGEX = /^(\+?243|00243|0)[1-9][0-9]{7,8}$/

function normalizePhone(phone: string): string {
  if (!phone) return ''
  let cleaned = phone.replace(/\s+/g, '').replace(/[-()]/g, '')
  if (cleaned.startsWith('00243')) cleaned = '+243' + cleaned.slice(5)
  if (cleaned.startsWith('0') && !cleaned.startsWith('00')) cleaned = '+243' + cleaned.slice(1)
  return cleaned
}

function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone.replace(/\s+/g, ''))
}

async function compressImage(file: File, maxDimension: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension
            width = maxDimension
          } else {
            width = (width / height) * maxDimension
            height = maxDimension
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context failed'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Compression failed'))
          },
          'image/webp',
          0.85
        )
      }
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

function saveProgress(data: Partial<OnboardingData>, step: OnboardingStep) {
  if (typeof window === 'undefined') return
  try {
    const { avatarFile, ...rest } = data
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, step, timestamp: Date.now() }))
  } catch {
    // Silencieux
  }
}

function loadProgress(): { data: Partial<OnboardingData>; step: OnboardingStep } | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (!cached) return null
    const parsed = JSON.parse(cached)
    // Expirer après 7 jours
    if (Date.now() - parsed.timestamp > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Composant Stepper CSS pur                                          */
/* ------------------------------------------------------------------ */
const STEPS: { id: OnboardingStep; label: string; icon: any }[] = [
  { id: 'welcome', label: 'Bienvenue', icon: Sparkles },
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'location', label: 'Adresse', icon: MapPin },
  { id: 'preferences', label: 'Préférences', icon: Settings },
  { id: 'terms', label: 'Conditions', icon: Shield },
]

function Stepper({ currentStep }: { currentStep: OnboardingStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
  const isDone = currentStep === 'done'

  return (
    <div
      className="flex items-center justify-center mb-8"
      role="navigation"
      aria-label="Étapes d'onboarding"
    >
      {STEPS.map((step, index) => {
        const isCompleted = isDone || index < currentIndex
        const isCurrent = !isDone && index === currentIndex

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors',
                isCompleted
                  ? 'border-green-500 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : isCurrent
                  ? 'border-gold-400 bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300'
                  : 'border-neutral-200 text-neutral-400 dark:border-neutral-700'
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isCompleted ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <step.icon size={16} aria-hidden="true" />
              )}
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-6 sm:w-10 h-0.5 mx-1 transition-colors',
                  isCompleted ? 'bg-green-500' : 'bg-neutral-200 dark:bg-neutral-700'
                )}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Composant Toggle léger (sans lib externe)                          */
/* ------------------------------------------------------------------ */
function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'flex items-center justify-between w-full p-3 rounded-xl border transition-colors',
        'border-neutral-200 dark:border-neutral-700',
        'hover:bg-neutral-50 dark:hover:bg-neutral-900/50',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="text-left">
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</p>
        {description && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{description}</p>
        )}
      </div>
      <div
        className={cn(
          'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
          checked ? 'bg-gold-500' : 'bg-neutral-300 dark:bg-neutral-600'
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Page principale                                                    */
/* ------------------------------------------------------------------ */
export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading: authLoading, refreshRoles } = useAuth()
  const toast = useToast()

  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [data, setData] = useState<OnboardingData>(DEFAULT_DATA)
  const [provinces, setProvinces] = useState<Province[]>([])
  const [villes, setVilles] = useState<Ville[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [loadingGeo, setLoadingGeo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError] = useState('')
  const [isOnline, setIsOnline] = useState(true)

  const abortControllerRef = useRef<AbortController | null>(null)
  const retryCountRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Redirection si non connecté
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/profile/onboarding')
    }
  }, [user, authLoading, router])

  // Détection hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setError(ERROR_MESSAGES.offline)
    }
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Restauration de la progression
  useEffect(() => {
    const progress = loadProgress()
    if (progress && progress.data) {
      setData((prev) => ({ ...prev, ...progress.data }))
      if (progress.step && progress.step !== 'done') {
        setStep(progress.step)
      }
    }
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  // Fetch avec retry
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        const response = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeoutId)
        if (response.status >= 500 && retries > 0) {
          await new Promise((r) => setTimeout(r, 1000 * (MAX_RETRIES - retries + 1)))
          return fetchWithRetry(url, options, retries - 1)
        }
        return response
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (retries > 0 && (err.name === 'AbortError' || err.name === 'TypeError')) {
          retryCountRef.current += 1
          await new Promise((r) => setTimeout(r, 1000 * retryCountRef.current))
          return fetchWithRetry(url, options, retries - 1)
        }
        throw err
      }
    },
    []
  )

  // Chargement données géo (une seule fois, au moment de l'étape location)
  const loadGeoData = useCallback(async () => {
    if (provinces.length > 0) return // Déjà chargé
    setLoadingGeo(true)
    try {
      const [provincesRes, villesRes, communesRes] = await Promise.all([
        fetchWithRetry('/api/public/provinces'),
        fetchWithRetry('/api/public/villes'),
        fetchWithRetry('/api/public/communes'),
      ])

      const provincesData = await provincesRes.json().catch(() => [])
      const villesData = await villesRes.json().catch(() => [])
      const communesData = await communesRes.json().catch(() => [])

      setProvinces(Array.isArray(provincesData) ? provincesData : provincesData.data || [])
      setVilles(Array.isArray(villesData) ? villesData : villesData.data || [])
      setCommunes(Array.isArray(communesData) ? communesData : communesData.data || [])
    } catch (err) {
      console.error('Erreur chargement données géo:', err)
      setError(ERROR_MESSAGES.network)
    } finally {
      setLoadingGeo(false)
    }
  }, [provinces.length, fetchWithRetry])

  // Upload avatar
  const uploadAvatar = useCallback(async (): Promise<string | null> => {
    if (!data.avatarFile) return null

    setUploadingAvatar(true)
    setError('')

    try {
      const compressedBlob = await compressImage(data.avatarFile, MAX_AVATAR_DIMENSION)
      const compressedFile = new File([compressedBlob], 'avatar.webp', { type: 'image/webp' })

      const formData = new FormData()
      formData.append('avatar', compressedFile)

      const res = await fetchWithRetry('/api/user/avatar', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || ERROR_MESSAGES.avatar_failed)

      return result.avatar_url || result.url || null
    } catch (err: any) {
      setError(err.message || ERROR_MESSAGES.avatar_failed)
      return null
    } finally {
      setUploadingAvatar(false)
    }
  }, [data.avatarFile, fetchWithRetry])

  // Gestion sélection avatar
  const handleAvatarSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Format invalide. Utilisez JPG, PNG ou WebP.')
      return
    }

    if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
      setError(`L'image ne doit pas dépasser ${MAX_AVATAR_SIZE_MB} Mo.`)
      return
    }

    setError('')
    setData((prev) => ({ ...prev, avatarFile: file }))

    const reader = new FileReader()
    reader.onload = (e) => {
      setData((prev) => ({ ...prev, avatarPreview: e.target?.result as string }))
    }
    reader.readAsDataURL(file)
  }, [])

  // Navigation entre étapes
  const goToStep = useCallback((newStep: OnboardingStep) => {
    setStep(newStep)
    saveProgress(data, newStep)
    if (newStep === 'location') {
      loadGeoData()
    }
    // Scroll en haut
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [data, loadGeoData])

  const handleNext = useCallback(() => {
    setError('')

    // Validation par étape
    if (step === 'profile') {
      if (!data.nom.trim() || !data.prenom.trim()) {
        setError('Le nom et le prénom sont requis.')
        return
      }
      if (data.telephone && !isValidPhone(data.telephone)) {
        setError('Numéro de téléphone invalide. Format: 0812345678 ou +243812345678')
        return
      }
      goToStep('location')
    } else if (step === 'location') {
      if (!data.province_id || !data.ville_id || !data.commune_id) {
        setError('Veuillez sélectionner votre province, ville et commune.')
        return
      }
      goToStep('preferences')
    } else if (step === 'preferences') {
      goToStep('terms')
    } else if (step === 'terms') {
      if (!data.terms_accepted) {
        setError('Vous devez accepter les conditions d\'utilisation.')
        return
      }
      handleComplete()
    }
  }, [step, data, goToStep])

  const handleBack = useCallback(() => {
    setError('')
    const order: OnboardingStep[] = ['welcome', 'profile', 'location', 'preferences', 'terms']
    const currentIndex = order.indexOf(step)
    if (currentIndex > 0) {
      goToStep(order[currentIndex - 1])
    } else {
      router.push('/')
    }
  }, [step, goToStep, router])

  // Finalisation de l'onboarding
  const handleComplete = useCallback(async () => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    setSaving(true)
    setError('')
    retryCountRef.current = 0

    try {
      // 1. Upload avatar si présent
      let avatarUrl = data.avatarPreview
      if (data.avatarFile) {
        const uploadedUrl = await uploadAvatar()
        if (!uploadedUrl) {
          setSaving(false)
          return
        }
        avatarUrl = uploadedUrl
      }

      // 2. Sauvegarde du profil + onboarding_completed
      const payload = {
        nom: data.nom.trim(),
        prenom: data.prenom.trim(),
        telephone: data.telephone ? normalizePhone(data.telephone) : null,
        avatar_url: avatarUrl,
        commune_id: data.commune_id || null,
        adresse: [data.avenue, data.numero, data.quartier, data.reference]
          .filter(Boolean)
          .join(', ') || null,
        preferences: data.preferences,
        onboarding_completed: true,
        terms_accepted_at: new Date().toISOString(),
      }

      const res = await fetchWithRetry('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status >= 500) throw new Error(ERROR_MESSAGES.server)
        throw new Error(result.error || ERROR_MESSAGES.save_failed)
      }

      // 3. Nettoyage et redirection
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
      }

      await refreshRoles()
      setStep('done')

      toast.show({
        type: 'success',
        message: 'Bienvenue sur Gercie ! 🎉',
        duration: 3000,
      })

      setTimeout(() => {
        router.push('/')
      }, 2000)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.unknown)
      }
    } finally {
      setSaving(false)
    }
  }, [isOnline, data, uploadAvatar, fetchWithRetry, refreshRoles, router, toast])

  // Filtrage cascade
  const filteredVilles = data.province_id
    ? villes.filter((v) => v.province_id === data.province_id)
    : []
  const filteredCommunes = data.ville_id
    ? communes.filter((c) => c.ville_id === data.ville_id)
    : []

  if (authLoading || !user) return null

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12">
      <Container size="small" className="max-w-lg w-full">
        <div className="animate-fade-in">
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardContent className="p-6 sm:p-8">
              {/* Stepper */}
              {step !== 'welcome' && <Stepper currentStep={step} />}

              {/* Hors ligne */}
              {!isOnline && (
                <div
                  role="alert"
                  className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-3 rounded-xl text-sm flex items-center gap-2 mb-4"
                >
                  <WifiOff size={16} className="flex-shrink-0" aria-hidden="true" />
                  Vous êtes hors ligne.
                </div>
              )}

              {/* Erreur */}
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-3 rounded-xl text-sm flex items-start gap-2 mb-4 animate-slide-down"
                >
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {/* ============ ÉTAPE: WELCOME ============ */}
              {step === 'welcome' && (
                <div className="text-center space-y-6 animate-slide-in">
                  <div className="mx-auto w-20 h-20 rounded-full bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center">
                    <Sparkles size={40} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold font-serif text-neutral-900 dark:text-neutral-100 mb-2">
                      Bienvenue sur Gercie ! 👋
                    </h1>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      Finalisons votre profil en quelques étapes simples. Vous pourrez tout modifier plus tard.
                    </p>
                  </div>

                  <div className="bg-neutral-50 dark:bg-neutral-900/40 rounded-xl p-4 text-left space-y-2">
                    <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                      <User size={16} className="text-gold-500" aria-hidden="true" />
                      Vos informations personnelles
                    </div>
                    <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                      <MapPin size={16} className="text-gold-500" aria-hidden="true" />
                      Votre adresse de livraison
                    </div>
                    <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                      <Settings size={16} className="text-gold-500" aria-hidden="true" />
                      Vos préférences
                    </div>
                    <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                      <Shield size={16} className="text-gold-500" aria-hidden="true" />
                      Conditions d&apos;utilisation
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Button
                      variant="luxe"
                      fullWidth
                      size="lg"
                      onClick={() => goToStep('profile')}
                      className="shadow-gold hover:shadow-glow-gold"
                    >
                      Commencer
                      <ArrowRight size={18} className="ml-2" aria-hidden="true" />
                    </Button>
                    <Link
                      href="/"
                      className="block text-center text-sm text-neutral-500 hover:text-gold-500 transition-colors"
                    >
                      Passer pour l&apos;instant
                    </Link>
                  </div>
                </div>
              )}

              {/* ============ ÉTAPE: PROFILE ============ */}
              {step === 'profile' && (
                <div className="space-y-5 animate-slide-in">
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold font-serif text-neutral-900 dark:text-neutral-100">
                      Votre profil
                    </h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                      Ces informations nous aident à personnaliser votre expérience
                    </p>
                  </div>

                  {/* Avatar */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 border-2 border-gold-200 dark:border-gold-800 flex items-center justify-center">
                        {data.avatarPreview ? (
                          <img
                            src={data.avatarPreview}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User size={40} className="text-neutral-400" aria-hidden="true" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-gold-500 hover:bg-gold-600 text-white flex items-center justify-center shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2"
                        aria-label="Ajouter une photo de profil"
                      >
                        <Camera size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarSelect}
                      className="hidden"
                      aria-label="Sélectionner une photo"
                    />
                    <p className="text-xs text-neutral-400">
                      Photo optionnelle · Max {MAX_AVATAR_SIZE_MB} Mo
                    </p>
                  </div>

                  {/* Champs */}
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Nom"
                      value={data.nom}
                      onChange={(e) => setData((prev) => ({ ...prev, nom: e.target.value }))}
                      placeholder="Votre nom"
                      autoComplete="family-name"
                      autoCapitalize="words"
                      leftIcon={<User size={16} className="text-neutral-400" aria-hidden="true" />}
                    />
                    <Input
                      label="Prénom"
                      value={data.prenom}
                      onChange={(e) => setData((prev) => ({ ...prev, prenom: e.target.value }))}
                      placeholder="Votre prénom"
                      autoComplete="given-name"
                      autoCapitalize="words"
                      leftIcon={<User size={16} className="text-neutral-400" aria-hidden="true" />}
                    />
                  </div>

                  <Input
                    label="Téléphone (optionnel)"
                    type="tel"
                    value={data.telephone}
                    onChange={(e) => setData((prev) => ({ ...prev, telephone: e.target.value }))}
                    placeholder="0812345678"
                    autoComplete="tel"
                    leftIcon={<Phone size={16} className="text-neutral-400" aria-hidden="true" />}
                  />
                  <p className="text-xs text-neutral-400 -mt-3">
                    💡 Recommandé pour la livraison et la récupération de compte
                  </p>

                  {/* Navigation */}
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" fullWidth onClick={handleBack}>
                      <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
                      Retour
                    </Button>
                    <Button
                      variant="luxe"
                      fullWidth
                      onClick={handleNext}
                      className="shadow-gold hover:shadow-glow-gold"
                    >
                      Continuer
                      <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ============ ÉTAPE: LOCATION ============ */}
              {step === 'location' && (
                <div className="space-y-5 animate-slide-in">
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold font-serif text-neutral-900 dark:text-neutral-100">
                      Votre localisation
                    </h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                      Pour des livraisons rapides et précises
                    </p>
                  </div>

                  {loadingGeo ? (
                    <div className="space-y-3" role="status">
                      <div className="h-12 bg-neutral-200 dark:bg-neutral-700 rounded-lg animate-pulse" />
                      <div className="h-12 bg-neutral-200 dark:bg-neutral-700 rounded-lg animate-pulse" />
                      <div className="h-12 bg-neutral-200 dark:bg-neutral-700 rounded-lg animate-pulse" />
                    </div>
                  ) : (
                    <>
                      <Select
                        label="Province"
                        value={data.province_id}
                        onChange={(e) =>
                          setData((prev) => ({
                            ...prev,
                            province_id: e.target.value,
                            ville_id: '',
                            commune_id: '',
                          }))
                        }
                        aria-label="Sélectionner la province"
                      >
                        <option value="">Sélectionner</option>
                        {provinces.map((p) => (
                          <option key={p.id} value={p.id}>{p.nom}</option>
                        ))}
                      </Select>

                      <Select
                        label="Ville"
                        value={data.ville_id}
                        onChange={(e) =>
                          setData((prev) => ({
                            ...prev,
                            ville_id: e.target.value,
                            commune_id: '',
                          }))
                        }
                        disabled={!data.province_id}
                        aria-label="Sélectionner la ville"
                      >
                        <option value="">Sélectionner</option>
                        {filteredVilles.map((v) => (
                          <option key={v.id} value={v.id}>{v.nom}</option>
                        ))}
                      </Select>

                      <Select
                        label="Commune"
                        value={data.commune_id}
                        onChange={(e) =>
                          setData((prev) => ({ ...prev, commune_id: e.target.value }))
                        }
                        disabled={!data.ville_id}
                        aria-label="Sélectionner la commune"
                      >
                        <option value="">Sélectionner</option>
                        {filteredCommunes.map((c) => (
                          <option key={c.id} value={c.id}>{c.nom}</option>
                        ))}
                      </Select>

                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Quartier"
                          value={data.quartier}
                          onChange={(e) => setData((prev) => ({ ...prev, quartier: e.target.value }))}
                          placeholder="Ex: Gombe"
                        />
                        <Input
                          label="Avenue"
                          value={data.avenue}
                          onChange={(e) => setData((prev) => ({ ...prev, avenue: e.target.value }))}
                          placeholder="Ex: Commerce"
                        />
                      </div>

                      <Input
                        label="Point de repère (optionnel)"
                        value={data.reference}
                        onChange={(e) => setData((prev) => ({ ...prev, reference: e.target.value }))}
                        placeholder="Ex: Près du marché central"
                        leftIcon={<MapPin size={16} className="text-neutral-400" aria-hidden="true" />}
                      />
                    </>
                  )}

                  {/* Navigation */}
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" fullWidth onClick={handleBack}>
                      <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
                      Retour
                    </Button>
                    <Button
                      variant="luxe"
                      fullWidth
                      onClick={handleNext}
                      disabled={loadingGeo}
                      className="shadow-gold hover:shadow-glow-gold"
                    >
                      Continuer
                      <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ============ ÉTAPE: PREFERENCES ============ */}
              {step === 'preferences' && (
                <div className="space-y-5 animate-slide-in">
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold font-serif text-neutral-900 dark:text-neutral-100">
                      Vos préférences
                    </h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                      Personnalisez votre expérience
                    </p>
                  </div>

                  {/* Notifications */}
                  <div className="space-y-2">
                    <Toggle
                      checked={data.preferences.notifications_email}
                      onChange={(v) =>
                        setData((prev) => ({
                          ...prev,
                          preferences: { ...prev.preferences, notifications_email: v },
                        }))
                      }
                      label="Notifications par email"
                      description="Commandes, promotions, sécurité"
                    />
                    <Toggle
                      checked={data.preferences.notifications_sms}
                      onChange={(v) =>
                        setData((prev) => ({
                          ...prev,
                          preferences: { ...prev.preferences, notifications_sms: v },
                        }))
                      }
                      label="Notifications par SMS"
                      description="Peut engendrer des frais opérateur"
                    />
                  </div>

                  {/* Langue */}
                  <Select
                    label="Langue préférée"
                    value={data.preferences.langue}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        preferences: { ...prev.preferences, langue: e.target.value as any },
                      }))
                    }
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                    <option value="ln">Lingala</option>
                    <option value="sw">Swahili</option>
                  </Select>

                  {/* Devise */}
                  <Select
                    label="Devise d'affichage"
                    value={data.preferences.devise}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        preferences: { ...prev.preferences, devise: e.target.value as any },
                      }))
                    }
                  >
                    <option value="CDF">Franc Congolais (CDF)</option>
                    <option value="USD">Dollar Américain (USD)</option>
                  </Select>

                  {/* Navigation */}
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" fullWidth onClick={handleBack}>
                      <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
                      Retour
                    </Button>
                    <Button
                      variant="luxe"
                      fullWidth
                      onClick={handleNext}
                      className="shadow-gold hover:shadow-glow-gold"
                    >
                      Continuer
                      <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ============ ÉTAPE: TERMS ============ */}
              {step === 'terms' && (
                <div className="space-y-5 animate-slide-in">
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold font-serif text-neutral-900 dark:text-neutral-100">
                      Conditions d&apos;utilisation
                    </h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                      Dernière étape avant de commencer
                    </p>
                  </div>

                  <div className="bg-neutral-50 dark:bg-neutral-900/40 rounded-xl p-4 max-h-48 overflow-y-auto text-sm text-neutral-600 dark:text-neutral-400 space-y-2">
                    <p className="font-medium text-neutral-800 dark:text-neutral-200">
                      En utilisant Gercie, vous acceptez :
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Nos conditions générales de vente et d&apos;utilisation</li>
                      <li>Notre politique de confidentialité</li>
                      <li>Le traitement de vos données pour le fonctionnement du service</li>
                      <li>Les règles de la communauté et de bonne conduite</li>
                    </ul>
                    <p className="text-xs mt-2">
                      Consultez nos{' '}
                      <Link href="/conditions" className="text-gold-500 hover:underline" target="_blank">
                        conditions complètes
                      </Link>{' '}
                      et notre{' '}
                      <Link href="/confidentialite" className="text-gold-500 hover:underline" target="_blank">
                        politique de confidentialité
                      </Link>
                      .
                    </p>
                  </div>

                  <Toggle
                    checked={data.terms_accepted}
                    onChange={(v) => setData((prev) => ({ ...prev, terms_accepted: v }))}
                    label="J'accepte les conditions d'utilisation"
                    description="Requis pour utiliser Gercie"
                  />

                  {/* Navigation */}
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" fullWidth onClick={handleBack}>
                      <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
                      Retour
                    </Button>
                    <Button
                      variant="luxe"
                      fullWidth
                      onClick={handleNext}
                      loading={saving}
                      disabled={saving || !isOnline}
                      className="shadow-gold hover:shadow-glow-gold"
                      aria-busy={saving}
                    >
                      {saving ? (
                        <span className="flex items-center gap-2">
                          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                          Finalisation...
                        </span>
                      ) : (
                        <>
                          <CheckCircle2 size={18} className="mr-2" aria-hidden="true" />
                          Terminer
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* ============ ÉTAPE: DONE ============ */}
              {step === 'done' && (
                <div className="text-center space-y-6 py-8 animate-slide-in">
                  <div className="mx-auto w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 size={40} className="text-green-600 dark:text-green-400" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold font-serif text-neutral-900 dark:text-neutral-100 mb-2">
                      C&apos;est parti ! 🎉
                    </h2>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      Votre profil est configuré. Bon shopping sur Gercie !
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-neutral-500">
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Redirection en cours...
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Container>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        .animate-slide-down {
          animation: slideDown 0.3s ease-out;
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in,
          .animate-slide-down,
          .animate-slide-in {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}