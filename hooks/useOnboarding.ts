// hooks/useOnboarding.ts
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export type OnboardingStep =
  | 'welcome'
  | 'profile'
  | 'location'
  | 'preferences'
  | 'terms'
  | 'done'

export interface Province {
  id: string
  nom: string
}

export interface Ville {
  id: string
  nom: string
  province_id: string
}

export interface Commune {
  id: string
  nom: string
  ville_id: string
}

export interface OnboardingPreferences {
  notifications_email: boolean
  notifications_sms: boolean
  langue: 'fr' | 'en' | 'ln' | 'sw'
  devise: 'CDF' | 'USD'
}

export interface OnboardingData {
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
  preferences: OnboardingPreferences
  terms_accepted: boolean
}

export type OnboardingLoadState = 'idle' | 'loading' | 'success' | 'error'

interface UseOnboardingReturn {
  // Données
  data: OnboardingData
  currentStep: OnboardingStep
  stepIndex: number
  totalSteps: number
  progress: number

  // Données géographiques
  provinces: Province[]
  villes: Ville[]
  communes: Commune[]
  geoLoadState: OnboardingLoadState

  // États
  isSaving: boolean
  isUploadingAvatar: boolean
  errorMessage: string
  isOnline: boolean
  isAlreadyCompleted: boolean

  // Actions
  updateData: (partial: Partial<OnboardingData>) => void
  nextStep: () => boolean
  prevStep: () => void
  goToStep: (step: OnboardingStep) => void
  setAvatar: (file: File | null) => Promise<void>
  completeOnboarding: () => Promise<boolean>
  skipOnboarding: () => Promise<boolean>
  resetOnboarding: () => void

  // Helpers
  isStepValid: (step: OnboardingStep) => boolean
  getVillesByProvince: (provinceId: string) => Ville[]
  getCommunesByVille: (villeId: string) => Commune[]
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2
const STORAGE_KEY = 'onboarding_progress'
const GEO_CACHE_KEY = 'geo_data_cache' // Partagé avec useAddresses
const GEO_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 heures
const PROGRESS_TTL = 7 * 24 * 60 * 60 * 1000 // 7 jours
const MAX_AVATAR_SIZE_MB = 2
const MAX_AVATAR_DIMENSION = 800

const PHONE_REGEX = /^(\+?243|00243|0)[1-9][0-9]{7,8}$/

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'welcome',
  'profile',
  'location',
  'preferences',
  'terms',
]

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Réessayez dans quelques instants.',
  timeout: 'La requête prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  save_failed: "Impossible de finaliser l'onboarding. Réessayez.",
  avatar_failed: "Échec de l'upload de la photo.",
  avatar_too_large: `L'image ne doit pas dépasser ${MAX_AVATAR_SIZE_MB} Mo.`,
  avatar_invalid_type: 'Format invalide. Utilisez JPG, PNG ou WebP.',
  invalid_profile: 'Veuillez remplir votre nom et prénom.',
  invalid_phone: 'Numéro invalide (ex: 0812345678 ou +243812345678).',
  invalid_location: 'Veuillez sélectionner votre province, ville et commune.',
  invalid_terms: 'Vous devez accepter les conditions d\'utilisation.',
  unknown: 'Une erreur est survenue.',
}

/* ------------------------------------------------------------------ */
/*  Données par défaut                                                 */
/* ------------------------------------------------------------------ */
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
function normalizePhone(phone: string): string {
  if (!phone) return ''
  let cleaned = phone.replace(/\s+/g, '').replace(/[-()]/g, '')
  if (cleaned.startsWith('00243')) cleaned = '+243' + cleaned.slice(5)
  if (cleaned.startsWith('0') && !cleaned.startsWith('00')) cleaned = '+243' + cleaned.slice(1)
  return cleaned
}

function isValidPhone(phone: string): boolean {
  if (!phone) return true // Optionnel
  return PHONE_REGEX.test(phone.replace(/\s+/g, ''))
}

interface CachedProgress {
  data: Omit<OnboardingData, 'avatarFile'>
  step: OnboardingStep
  timestamp: number
}

function getCachedProgress(): CachedProgress | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (!cached) return null
    const parsed: CachedProgress = JSON.parse(cached)
    if (Date.now() - parsed.timestamp > PROGRESS_TTL) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function setCachedProgress(data: OnboardingData, step: OnboardingStep): void {
  if (typeof window === 'undefined') return
  try {
    const { avatarFile, ...rest } = data
    const cached: CachedProgress = {
      data: rest,
      step,
      timestamp: Date.now(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
  } catch {
    // Silencieux
  }
}

function clearCachedProgress(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Silencieux
  }
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

/* ------------------------------------------------------------------ */
/*  Hook principal                                                     */
/* ------------------------------------------------------------------ */
export function useOnboarding(): UseOnboardingReturn {
  const router = useRouter()
  const { user, profile, refreshRoles } = useAuth()
  const toast = useToast()

  const [data, setData] = useState<OnboardingData>(DEFAULT_DATA)
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [provinces, setProvinces] = useState<Province[]>([])
  const [villes, setVilles] = useState<Ville[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [geoLoadState, setGeoLoadState] = useState<OnboardingLoadState>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [isAlreadyCompleted, setIsAlreadyCompleted] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const hasInitializedRef = useRef(false)

  // ------------------------------------------------------------------
  // Détection hors-ligne
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setErrorMessage(ERROR_MESSAGES.offline)
    }

    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ------------------------------------------------------------------
  // Vérifier si l'onboarding est déjà complété
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!user || hasInitializedRef.current) return
    hasInitializedRef.current = true

    if (profile?.onboarding_completed === true) {
      setIsAlreadyCompleted(true)
      // Rediriger vers l'accueil si déjà complété
      router.replace('/')
      return
    }

    // Restaurer la progression sauvegardée
    const cached = getCachedProgress()
    if (cached) {
      setData((prev) => ({ ...prev, ...cached.data }))
      if (cached.step && cached.step !== 'done') {
        setCurrentStep(cached.step)
      }
    }
  }, [user, profile, router])

  // ------------------------------------------------------------------
  // Cleanup au démontage
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // ------------------------------------------------------------------
  // Fetch avec retry + timeout
  // ------------------------------------------------------------------
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

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
          await new Promise((r) => setTimeout(r, 1000))
          return fetchWithRetry(url, options, retries - 1)
        }

        throw err
      }
    },
    []
  )

  // ------------------------------------------------------------------
  // Chargement des données géographiques (cache partagé avec useAddresses)
  // ------------------------------------------------------------------
  const loadGeoData = useCallback(async () => {
    // Essayer le cache d'abord (partagé avec useAddresses)
    try {
      const cached = localStorage.getItem(GEO_CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Date.now() - parsed.timestamp < GEO_CACHE_TTL && parsed.data?.provinces?.length > 0) {
          setProvinces(parsed.data.provinces)
          setVilles(parsed.data.villes)
          setCommunes(parsed.data.communes)
          setGeoLoadState('success')
          return
        }
      }
    } catch {
      // Cache invalide, continuer avec fetch
    }

    setGeoLoadState('loading')

    try {
      const [provincesRes, villesRes, communesRes] = await Promise.allSettled([
        fetchWithRetry('/api/public/provinces'),
        fetchWithRetry('/api/public/villes'),
        fetchWithRetry('/api/public/communes'),
      ])

      const extract = async (result: PromiseSettledResult<Response>): Promise<any[]> => {
        if (result.status === 'fulfilled') {
          try {
            const d = await result.value.json()
            return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []
          } catch {
            return []
          }
        }
        return []
      }

      const [provincesData, villesData, communesData] = await Promise.all([
        extract(provincesRes),
        extract(villesRes),
        extract(communesRes),
      ])

      if (provincesData.length === 0) {
        setGeoLoadState('error')
        setErrorMessage(ERROR_MESSAGES.network)
        return
      }

      const sortedProvinces = [...provincesData].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
      const sortedVilles = [...villesData].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
      const sortedCommunes = [...communesData].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))

      setProvinces(sortedProvinces)
      setVilles(sortedVilles)
      setCommunes(sortedCommunes)
      setGeoLoadState('success')

      // Mettre en cache (partagé avec useAddresses)
      try {
        localStorage.setItem(
          GEO_CACHE_KEY,
          JSON.stringify({
            data: { provinces: sortedProvinces, villes: sortedVilles, communes: sortedCommunes },
            timestamp: Date.now(),
          })
        )
      } catch {
        // Silencieux
      }
    } catch (err: any) {
      setGeoLoadState('error')
      if (err.name === 'AbortError') {
        setErrorMessage(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setErrorMessage(ERROR_MESSAGES.network)
      } else {
        setErrorMessage(ERROR_MESSAGES.unknown)
      }
    }
  }, [fetchWithRetry])

  // Charger la géo quand on arrive à l'étape location
  useEffect(() => {
    if (currentStep === 'location' && geoLoadState === 'idle') {
      loadGeoData()
    }
  }, [currentStep, geoLoadState, loadGeoData])

  // ------------------------------------------------------------------
  // Validation par étape
  // ------------------------------------------------------------------
  const isStepValid = useCallback(
    (step: OnboardingStep): boolean => {
      switch (step) {
        case 'welcome':
          return true
        case 'profile':
          return (
            data.nom.trim().length >= 2 &&
            data.prenom.trim().length >= 2 &&
            isValidPhone(data.telephone)
          )
        case 'location':
          return Boolean(data.province_id && data.ville_id && data.commune_id)
        case 'preferences':
          return true
        case 'terms':
          return data.terms_accepted
        case 'done':
          return true
        default:
          return false
      }
    },
    [data]
  )

  // ------------------------------------------------------------------
  // Mise à jour des données
  // ------------------------------------------------------------------
  const updateData = useCallback((partial: Partial<OnboardingData>) => {
    setData((prev) => {
      const updated = { ...prev, ...partial }
      // Persister la progression (sans avatarFile)
      setCachedProgress(updated, currentStep)
      return updated
    })
    setErrorMessage('')
  }, [currentStep])

  // ------------------------------------------------------------------
  // Navigation entre étapes
  // ------------------------------------------------------------------
  const nextStep = useCallback((): boolean => {
    if (!isStepValid(currentStep)) {
      // Message d'erreur spécifique
      switch (currentStep) {
        case 'profile':
          if (!isValidPhone(data.telephone)) {
            setErrorMessage(ERROR_MESSAGES.invalid_phone)
          } else {
            setErrorMessage(ERROR_MESSAGES.invalid_profile)
          }
          break
        case 'location':
          setErrorMessage(ERROR_MESSAGES.invalid_location)
          break
        case 'terms':
          setErrorMessage(ERROR_MESSAGES.invalid_terms)
          break
      }
      return false
    }

    const currentIndex = ONBOARDING_STEPS.indexOf(currentStep)
    if (currentIndex < ONBOARDING_STEPS.length - 1) {
      const newStep = ONBOARDING_STEPS[currentIndex + 1]
      setCurrentStep(newStep)
      setCachedProgress(data, newStep)
      setErrorMessage('')
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      return true
    }
    return false
  }, [currentStep, data, isStepValid])

  const prevStep = useCallback(() => {
    const currentIndex = ONBOARDING_STEPS.indexOf(currentStep)
    if (currentIndex > 0) {
      const newStep = ONBOARDING_STEPS[currentIndex - 1]
      setCurrentStep(newStep)
      setErrorMessage('')
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }, [currentStep])

  const goToStep = useCallback((step: OnboardingStep) => {
    // Ne permettre que les étapes déjà validées ou l'étape suivante
    const targetIndex = ONBOARDING_STEPS.indexOf(step)
    const currentIndex = ONBOARDING_STEPS.indexOf(currentStep)
    
    if (targetIndex <= currentIndex || isStepValid(currentStep)) {
      setCurrentStep(step)
      setErrorMessage('')
    }
  }, [currentStep, isStepValid])

  // ------------------------------------------------------------------
  // Gestion de l'avatar
  // ------------------------------------------------------------------
  const setAvatar = useCallback(async (file: File | null) => {
    if (!file) {
      setData((prev) => ({ ...prev, avatarFile: null, avatarPreview: null }))
      return
    }

    // Validation type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.show({ type: 'error', message: ERROR_MESSAGES.avatar_invalid_type, duration: 5000 })
      return
    }

    // Validation taille
    if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
      toast.show({ type: 'error', message: ERROR_MESSAGES.avatar_too_large, duration: 5000 })
      return
    }

    // Preview immédiate
    const reader = new FileReader()
    reader.onload = (e) => {
      const preview = e.target?.result as string
      setData((prev) => ({ ...prev, avatarFile: file, avatarPreview: preview }))
    }
    reader.readAsDataURL(file)
  }, [toast])

  // ------------------------------------------------------------------
  // Upload de l'avatar (interne)
  // ------------------------------------------------------------------
  const uploadAvatar = useCallback(async (): Promise<string | null> => {
    if (!data.avatarFile) return null

    setIsUploadingAvatar(true)
    setErrorMessage('')

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
      setErrorMessage(err.message || ERROR_MESSAGES.avatar_failed)
      return null
    } finally {
      setIsUploadingAvatar(false)
    }
  }, [data.avatarFile, fetchWithRetry])

  // ------------------------------------------------------------------
  // Finalisation de l'onboarding
  // ------------------------------------------------------------------
  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    // Validation finale
    if (!isStepValid('terms')) {
      setErrorMessage(ERROR_MESSAGES.invalid_terms)
      return false
    }

    if (!isOnline) {
      setErrorMessage(ERROR_MESSAGES.offline)
      toast.show({ type: 'error', message: ERROR_MESSAGES.offline, duration: 5000 })
      return false
    }

    setIsSaving(true)
    setErrorMessage('')

    try {
      // 1. Upload avatar si présent
      let avatarUrl = data.avatarPreview
      if (data.avatarFile) {
        const uploadedUrl = await uploadAvatar()
        if (!uploadedUrl) {
          setIsSaving(false)
          return false
        }
        avatarUrl = uploadedUrl
      }

      // 2. Construire le payload
      const adresseParts = [data.avenue, data.numero, data.quartier, data.reference].filter(Boolean)
      const payload = {
        nom: data.nom.trim(),
        prenom: data.prenom.trim(),
        telephone: data.telephone ? normalizePhone(data.telephone) : null,
        avatar_url: avatarUrl,
        commune_id: data.commune_id || null,
        adresse: adresseParts.length > 0 ? adresseParts.join(', ') : null,
        preferences: data.preferences,
        onboarding_completed: true,
        terms_accepted_at: new Date().toISOString(),
      }

      // 3. Sauvegarde du profil
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

      // 4. Rafraîchir les rôles/profil dans le contexte auth
      await refreshRoles()

      // 5. Nettoyer la progression sauvegardée
      clearCachedProgress()

      // 6. Marquer comme complété
      setIsAlreadyCompleted(true)
      setCurrentStep('done')

      toast.show({
        type: 'success',
        message: 'Bienvenue sur Gercie ! 🎉',
        duration: 3000,
      })

      return true
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setErrorMessage(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setErrorMessage(ERROR_MESSAGES.network)
      } else {
        setErrorMessage(err.message || ERROR_MESSAGES.unknown)
      }

      toast.show({
        type: 'error',
        message: errorMessage || ERROR_MESSAGES.save_failed,
        duration: 5000,
      })

      return false
    } finally {
      setIsSaving(false)
    }
  }, [data, isOnline, isStepValid, uploadAvatar, fetchWithRetry, refreshRoles, toast, errorMessage])

  // ------------------------------------------------------------------
  // Passer l'onboarding (optionnel)
  // ------------------------------------------------------------------
  const skipOnboarding = useCallback(async (): Promise<boolean> => {
    if (!isOnline) {
      setErrorMessage(ERROR_MESSAGES.offline)
      return false
    }

    setIsSaving(true)
    setErrorMessage('')

    try {
      const res = await fetchWithRetry('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_completed: true,
          terms_accepted_at: new Date().toISOString(),
        }),
      })

      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        throw new Error(result.error || ERROR_MESSAGES.save_failed)
      }

      await refreshRoles()
      clearCachedProgress()
      setIsAlreadyCompleted(true)

      toast.show({
        type: 'info',
        message: 'Vous pourrez compléter votre profil plus tard.',
        duration: 3000,
      })

      return true
    } catch (err: any) {
      setErrorMessage(err.message || ERROR_MESSAGES.save_failed)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [isOnline, fetchWithRetry, refreshRoles, toast])

  // ------------------------------------------------------------------
  // Réinitialiser la progression
  // ------------------------------------------------------------------
  const resetOnboarding = useCallback(() => {
    setData(DEFAULT_DATA)
    setCurrentStep('welcome')
    setErrorMessage('')
    clearCachedProgress()
  }, [])

  // ------------------------------------------------------------------
  // Helpers géographiques
  // ------------------------------------------------------------------
  const getVillesByProvince = useCallback(
    (provinceId: string): Ville[] => {
      if (!provinceId) return []
      return villes.filter((v) => v.province_id === provinceId)
    },
    [villes]
  )

  const getCommunesByVille = useCallback(
    (villeId: string): Commune[] => {
      if (!villeId) return []
      return communes.filter((c) => c.ville_id === villeId)
    },
    [communes]
  )

  // ------------------------------------------------------------------
  // Calculs dérivés
  // ------------------------------------------------------------------
  const stepIndex = ONBOARDING_STEPS.indexOf(currentStep)
  const totalSteps = ONBOARDING_STEPS.length
  const progress = useMemo(() => {
    if (currentStep === 'done') return 100
    return Math.round((stepIndex / (totalSteps - 1)) * 100)
  }, [stepIndex, totalSteps, currentStep])

  return {
    data,
    currentStep,
    stepIndex,
    totalSteps,
    progress,
    provinces,
    villes,
    communes,
    geoLoadState,
    isSaving,
    isUploadingAvatar,
    errorMessage,
    isOnline,
    isAlreadyCompleted,
    updateData,
    nextStep,
    prevStep,
    goToStep,
    setAvatar,
    completeOnboarding,
    skipOnboarding,
    resetOnboarding,
    isStepValid,
    getVillesByProvince,
    getCommunesByVille,
  }
}

export default useOnboarding