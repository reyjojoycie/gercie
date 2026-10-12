// hooks/useProfile.ts
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface UserProfile {
  id: string
  email: string | null
  nom: string | null
  prenom: string | null
  telephone: string | null
  type_user: 'acheteur' | 'vendeur' | 'livreur' | 'admin'
  adresse: string | null
  commune_id: number | null
  avatar_url: string | null
  adresse_boutique: string | null
  role: string
  preferences: Record<string, unknown>
  est_actif: boolean
  email_verified: boolean
  phone_verified: boolean
  onboarding_completed: boolean
  terms_accepted_at: string | null
  question_secrete: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface UserWallet {
  solde_achat: number
  solde_vente?: number
  updated_at?: string
}

export interface UserAddress {
  id: string
  nom: string | null
  province_id: string | null
  ville_id: string | null
  commune_id: string | null
  quartier: string | null
  avenue: string | null
  numero: string | null
  reference: string | null
  telephone: string | null
  adresse_text: string | null
  is_default?: boolean
  created_at: string
}

export type ProfileLoadState = 'idle' | 'loading' | 'success' | 'error' | 'partial'

interface UseProfileReturn {
  // Données
  profile: UserProfile | null
  wallet: UserWallet
  addresses: UserAddress[]
  
  // États
  loadState: ProfileLoadState
  errorMessage: string
  isOnline: boolean
  isRefreshing: boolean
  
  // Actions
  loadProfileData: (forceRefresh?: boolean) => Promise<void>
  updateProfile: (data: Partial<UserProfile>) => Promise<boolean>
  uploadAvatar: (file: File) => Promise<string | null>
  removeAvatar: () => Promise<boolean>
  
  // Helpers
  getFullName: () => string
  getAvatarUrl: () => string | null
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2
const CACHE_KEY = 'profile_page_data'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_AVATAR_SIZE_MB = 2
const MAX_AVATAR_DIMENSION = 800

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Certaines données n\'ont pas pu être chargées.',
  timeout: 'Le chargement prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne. Affichage des données en cache.',
  save_failed: 'Impossible d\'enregistrer les modifications.',
  avatar_upload_failed: 'Échec de l\'upload de la photo.',
  avatar_remove_failed: 'Échec de la suppression de la photo.',
  avatar_too_large: `L'image ne doit pas dépasser ${MAX_AVATAR_SIZE_MB} Mo.`,
  avatar_invalid_type: 'Format invalide. Utilisez JPG, PNG ou WebP.',
  unknown: 'Une erreur est survenue lors du chargement.',
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
interface CachedData {
  data: {
    profile: UserProfile | null
    wallet: UserWallet
    addresses: UserAddress[]
  }
  timestamp: number
}

function getCachedData(): CachedData | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    
    const parsed: CachedData = JSON.parse(cached)
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS
    
    return isExpired ? null : parsed
  } catch {
    return null
  }
}

function setCachedData(data: CachedData['data']): void {
  if (typeof window === 'undefined') return
  try {
    const cached: CachedData = {
      data,
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
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
export function useProfile(): UseProfileReturn {
  const { user } = useAuth()
  const toast = useToast()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [wallet, setWallet] = useState<UserWallet>({ solde_achat: 0 })
  const [addresses, setAddresses] = useState<UserAddress[]>([])
  const [loadState, setLoadState] = useState<ProfileLoadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const hasLoadedRef = useRef(false)

  // Détection hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      toast.show({
        type: 'warning',
        message: ERROR_MESSAGES.offline,
        duration: 5000,
      })
    }

    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [toast])

  // Cleanup des requêtes au démontage
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Fetch avec retry + timeout
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

  // Chargement des données
  const loadProfileData = useCallback(
    async (forceRefresh = false) => {
      if (!user) return

      // Annuler les requêtes précédentes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()

      // Essayer le cache d'abord (sauf si refresh forcé)
      if (!forceRefresh) {
        const cached = getCachedData()
        if (cached) {
          setProfile(cached.data.profile)
          setWallet(cached.data.wallet)
          setAddresses(cached.data.addresses)
          setLoadState('success')
          // Continuer à rafraîchir en arrière-plan
        }
      }

      if (!forceRefresh && loadState === 'success') {
        setIsRefreshing(true)
      } else {
        setLoadState('loading')
      }

      setErrorMessage('')

      const errors: string[] = []

      try {
        const [profileResult, walletResult, addressesResult] = await Promise.allSettled([
          fetchWithRetry('/api/user/profile', {
            signal: abortControllerRef.current.signal,
          }),
          fetchWithRetry('/api/user/wallet', {
            signal: abortControllerRef.current.signal,
          }).catch(() => ({ solde_achat: 0 })),
          fetchWithRetry('/api/user/addresses', {
            signal: abortControllerRef.current.signal,
          }).catch(() => []),
        ])

        // Traiter le profil
        let newProfile: UserProfile | null = null
        if (profileResult.status === 'fulfilled') {
          const res = profileResult.value
          const data = await res.json().catch(() => ({}))
          newProfile = data?.data || data
          setProfile(newProfile)
        } else {
          errors.push('profil')
          console.error('Erreur chargement profil:', profileResult.reason)
        }

        // Traiter le wallet
        let newWallet: UserWallet = { solde_achat: 0 }
        if (walletResult.status === 'fulfilled') {
          const res = walletResult.value as any
          const data = await (res as Response).json().catch(() => ({}))
          newWallet = {
            solde_achat: data?.solde_achat ?? data?.balance ?? data?.data?.solde_achat ?? 0,
            solde_vente: data?.solde_vente ?? data?.data?.solde_vente,
          }
          setWallet(newWallet)
        } else {
          errors.push('portefeuille')
        }

        // Traiter les adresses
        let newAddresses: UserAddress[] = []
        if (addressesResult.status === 'fulfilled') {
          const res = addressesResult.value as any
          const data = await (res as Response).json().catch(() => [])
          newAddresses = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
            ? data.data
            : []
          setAddresses(newAddresses)
        } else {
          errors.push('adresses')
        }

        // Mettre en cache si au moins le profil est chargé
        if (newProfile) {
          setCachedData({
            profile: newProfile,
            wallet: newWallet,
            addresses: newAddresses,
          })
        }

        // Déterminer l'état final
        if (errors.length === 0) {
          setLoadState('success')
        } else if (errors.length < 3) {
          setLoadState('partial')
          setErrorMessage(
            `Certaines données n'ont pas pu être chargées : ${errors.join(', ')}`
          )
        } else {
          setLoadState('error')
          setErrorMessage(ERROR_MESSAGES.network)
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return
        }

        setLoadState('error')

        if (err.name === 'AbortError' || err.message?.includes('timeout')) {
          setErrorMessage(ERROR_MESSAGES.timeout)
        } else if (!navigator.onLine) {
          setErrorMessage(ERROR_MESSAGES.offline)
        } else if (err.message?.includes('Failed to fetch')) {
          setErrorMessage(ERROR_MESSAGES.network)
        } else {
          setErrorMessage(ERROR_MESSAGES.unknown)
        }
      } finally {
        setIsRefreshing(false)
      }
    },
    [user, loadState, fetchWithRetry, toast]
  )

  // Chargement initial
  useEffect(() => {
    if (user && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      loadProfileData()
    }
  }, [user, loadProfileData])

  // Mise à jour du profil
  const updateProfile = useCallback(
    async (data: Partial<UserProfile>): Promise<boolean> => {
      if (!isOnline) {
        toast.show({
          type: 'error',
          message: ERROR_MESSAGES.offline,
          duration: 5000,
        })
        return false
      }

      try {
        const res = await fetchWithRetry('/api/user/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })

        const result = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(result.error || ERROR_MESSAGES.save_failed)
        }

        // Mettre à jour l'état local
        setProfile((prev) => (prev ? { ...prev, ...data } : null))

        // Invalider le cache
        if (typeof window !== 'undefined') {
          localStorage.removeItem(CACHE_KEY)
        }

        toast.show({
          type: 'success',
          message: 'Profil mis à jour',
          duration: 3000,
        })

        return true
      } catch (err: any) {
        toast.show({
          type: 'error',
          message: err.message || ERROR_MESSAGES.save_failed,
          duration: 5000,
        })
        return false
      }
    },
    [isOnline, fetchWithRetry, toast]
  )

  // Upload avatar
  const uploadAvatar = useCallback(
    async (file: File): Promise<string | null> => {
      // Validation type
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast.show({
          type: 'error',
          message: ERROR_MESSAGES.avatar_invalid_type,
          duration: 5000,
        })
        return null
      }

      // Validation taille
      if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
        toast.show({
          type: 'error',
          message: ERROR_MESSAGES.avatar_too_large,
          duration: 5000,
        })
        return null
      }

      if (!isOnline) {
        toast.show({
          type: 'error',
          message: ERROR_MESSAGES.offline,
          duration: 5000,
        })
        return null
      }

      try {
        // Compression
        const compressedBlob = await compressImage(file, MAX_AVATAR_DIMENSION)
        const compressedFile = new File([compressedBlob], 'avatar.webp', {
          type: 'image/webp',
        })

        // Upload
        const formData = new FormData()
        formData.append('avatar', compressedFile)

        const res = await fetchWithRetry('/api/user/avatar', {
          method: 'POST',
          body: formData,
        })

        const result = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(result.error || ERROR_MESSAGES.avatar_upload_failed)
        }

        const avatarUrl = result.avatar_url || result.url || null

        // Mettre à jour l'état local
        if (avatarUrl) {
          setProfile((prev) => (prev ? { ...prev, avatar_url: avatarUrl } : null))
        }

        // Invalider le cache
        if (typeof window !== 'undefined') {
          localStorage.removeItem(CACHE_KEY)
        }

        toast.show({
          type: 'success',
          message: 'Photo de profil mise à jour',
          duration: 3000,
        })

        return avatarUrl
      } catch (err: any) {
        toast.show({
          type: 'error',
          message: err.message || ERROR_MESSAGES.avatar_upload_failed,
          duration: 5000,
        })
        return null
      }
    },
    [isOnline, fetchWithRetry, toast]
  )

  // Suppression avatar
  const removeAvatar = useCallback(async (): Promise<boolean> => {
    if (!isOnline) {
      toast.show({
        type: 'error',
        message: ERROR_MESSAGES.offline,
        duration: 5000,
      })
      return false
    }

    try {
      const res = await fetchWithRetry('/api/user/avatar', {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error(ERROR_MESSAGES.avatar_remove_failed)
      }

      // Mettre à jour l'état local
      setProfile((prev) => (prev ? { ...prev, avatar_url: null } : null))

      // Invalider le cache
      if (typeof window !== 'undefined') {
        localStorage.removeItem(CACHE_KEY)
      }

      toast.show({
        type: 'success',
        message: 'Photo de profil supprimée',
        duration: 3000,
      })

      return true
    } catch (err: any) {
      toast.show({
        type: 'error',
        message: err.message || ERROR_MESSAGES.avatar_remove_failed,
        duration: 5000,
      })
      return false
    }
  }, [isOnline, fetchWithRetry, toast])

  // Helpers
  const getFullName = useCallback((): string => {
    if (!profile) return ''
    const parts = [profile.prenom, profile.nom].filter(Boolean)
    return parts.join(' ') || profile.email || 'Utilisateur'
  }, [profile])

  const getAvatarUrl = useCallback((): string | null => {
    return profile?.avatar_url || null
  }, [profile])

  return {
    profile,
    wallet,
    addresses,
    loadState,
    errorMessage,
    isOnline,
    isRefreshing,
    loadProfileData,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    getFullName,
    getAvatarUrl,
  }
}

export default useProfile