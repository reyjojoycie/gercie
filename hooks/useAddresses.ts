// hooks/useAddresses.ts
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface Province {
  id: string
  nom: string
  actif?: boolean
}

export interface Ville {
  id: string
  nom: string
  province_id: string
  actif?: boolean
}

export interface Commune {
  id: string
  nom: string
  ville_id: string
  actif?: boolean
}

export interface UserAddress {
  id: string
  user_id?: string
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
  created_at?: string
}

export interface AddressInput {
  nom: string
  province_id: string
  ville_id: string
  commune_id: string
  quartier: string
  avenue: string
  numero?: string
  reference?: string
  telephone?: string
}

export type AddressesLoadState = 'idle' | 'loading' | 'success' | 'error'
export type GeoLoadState = 'idle' | 'loading' | 'success' | 'error'

interface UseAddressesReturn {
  // Données adresses
  addresses: UserAddress[]
  defaultAddress: UserAddress | null
  
  // Données géographiques
  provinces: Province[]
  villes: Ville[]
  communes: Commune[]

  // États
  addressesLoadState: AddressesLoadState
  geoLoadState: GeoLoadState
  errorMessage: string
  isOnline: boolean
  isSaving: boolean
  deletingId: string | null

  // Actions adresses
  loadAddresses: (forceRefresh?: boolean) => Promise<void>
  addAddress: (data: AddressInput) => Promise<UserAddress | null>
  updateAddress: (id: string, data: Partial<AddressInput>) => Promise<boolean>
  deleteAddress: (id: string) => Promise<boolean>
  setDefaultAddress: (id: string) => void

  // Helpers géographiques
  loadGeoData: () => Promise<void>
  getVillesByProvince: (provinceId: string) => Ville[]
  getCommunesByVille: (villeId: string) => Commune[]
  getProvinceName: (id: string | null) => string
  getVilleName: (id: string | null) => string
  getCommuneName: (id: string | null) => string
  formatAddress: (address: UserAddress) => string
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2
const ADDRESSES_CACHE_KEY = 'user_addresses_cache'
const GEO_CACHE_KEY = 'geo_data_cache'
const DEFAULT_ADDRESS_KEY = 'default_address_id'
const ADDRESSES_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const GEO_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 heures (données statiques)

const PHONE_REGEX = /^(\+?243|00243|0)[1-9][0-9]{7,8}$/

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Réessayez dans quelques instants.',
  timeout: 'La requête prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne.',
  load_failed: 'Impossible de charger les adresses.',
  geo_load_failed: 'Impossible de charger les données géographiques.',
  save_failed: "Impossible d'enregistrer l'adresse.",
  update_failed: 'Impossible de modifier l\'adresse.',
  delete_failed: 'Impossible de supprimer l\'adresse.',
  invalid_phone: 'Numéro invalide (ex: 0812345678 ou +243812345678).',
  invalid_data: 'Veuillez remplir tous les champs obligatoires.',
  unknown: 'Une erreur est survenue.',
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */
export function validateAddressInput(data: AddressInput): { valid: boolean; error?: string } {
  if (!data.nom || data.nom.trim().length < 2) {
    return { valid: false, error: 'Le nom de l\'adresse est requis (min. 2 caractères).' }
  }
  if (!data.province_id) {
    return { valid: false, error: 'La province est requise.' }
  }
  if (!data.ville_id) {
    return { valid: false, error: 'La ville est requise.' }
  }
  if (!data.commune_id) {
    return { valid: false, error: 'La commune est requise.' }
  }
  if (!data.quartier || data.quartier.trim().length < 2) {
    return { valid: false, error: 'Le quartier est requis.' }
  }
  if (!data.avenue || data.avenue.trim().length < 2) {
    return { valid: false, error: 'L\'avenue est requise.' }
  }
  if (data.telephone && !PHONE_REGEX.test(data.telephone.replace(/\s+/g, ''))) {
    return { valid: false, error: ERROR_MESSAGES.invalid_phone }
  }
  return { valid: true }
}

export function normalizePhone(phone: string): string {
  if (!phone) return ''
  let cleaned = phone.replace(/\s+/g, '').replace(/[-()]/g, '')
  if (cleaned.startsWith('00243')) cleaned = '+243' + cleaned.slice(5)
  if (cleaned.startsWith('0') && !cleaned.startsWith('00')) cleaned = '+243' + cleaned.slice(1)
  return cleaned
}

/* ------------------------------------------------------------------ */
/*  Cache helpers                                                      */
/* ------------------------------------------------------------------ */
function getCached<T>(key: string, ttl: number): T | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(key)
    if (!cached) return null
    const parsed = JSON.parse(cached)
    if (Date.now() - parsed.timestamp > ttl) return null
    return parsed.data
  } catch {
    return null
  }
}

function setCached<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }))
  } catch {
    // Silencieux
  }
}

function clearCached(key: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    // Silencieux
  }
}

/* ------------------------------------------------------------------ */
/*  Hook principal                                                     */
/* ------------------------------------------------------------------ */
export function useAddresses(): UseAddressesReturn {
  const { user } = useAuth()
  const toast = useToast()

  // États adresses
  const [addresses, setAddresses] = useState<UserAddress[]>([])
  const [addressesLoadState, setAddressesLoadState] = useState<AddressesLoadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null)

  // États géographiques
  const [provinces, setProvinces] = useState<Province[]>([])
  const [villes, setVilles] = useState<Ville[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [geoLoadState, setGeoLoadState] = useState<GeoLoadState>('idle')

  const abortControllerRef = useRef<AbortController | null>(null)
  const hasLoadedRef = useRef(false)
  const hasLoadedGeoRef = useRef(false)

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
  // Restauration de l'adresse par défaut
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedDefault = localStorage.getItem(DEFAULT_ADDRESS_KEY)
    if (savedDefault) {
      setDefaultAddressId(savedDefault)
    }
  }, [])

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
  // Chargement des adresses
  // ------------------------------------------------------------------
  const loadAddresses = useCallback(
    async (forceRefresh = false) => {
      if (!user) return

      if (!isOnline) {
        // Essayer le cache en mode hors-ligne
        const cached = getCached<UserAddress[]>(ADDRESSES_CACHE_KEY, ADDRESSES_CACHE_TTL)
        if (cached) {
          setAddresses(cached)
          setAddressesLoadState('success')
          setErrorMessage(ERROR_MESSAGES.offline)
          return
        }
        setAddressesLoadState('error')
        setErrorMessage(ERROR_MESSAGES.offline)
        return
      }

      // Cache d'abord (sauf refresh forcé)
      if (!forceRefresh) {
        const cached = getCached<UserAddress[]>(ADDRESSES_CACHE_KEY, ADDRESSES_CACHE_TTL)
        if (cached) {
          setAddresses(cached)
          setAddressesLoadState('success')
          setErrorMessage('')
        } else {
          setAddressesLoadState('loading')
        }
      } else {
        setAddressesLoadState('loading')
      }

      try {
        const res = await fetchWithRetry('/api/user/addresses')
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (res.status >= 500) throw new Error(ERROR_MESSAGES.server)
          throw new Error(data.error || ERROR_MESSAGES.load_failed)
        }

        const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
        setAddresses(list)
        setCached(ADDRESSES_CACHE_KEY, list)
        setAddressesLoadState('success')
        setErrorMessage('')
      } catch (err: any) {
        if (err.name === 'AbortError') return

        setAddressesLoadState('error')
        if (err.message?.includes('timeout')) {
          setErrorMessage(ERROR_MESSAGES.timeout)
        } else if (err.name === 'TypeError' || !navigator.onLine) {
          setErrorMessage(ERROR_MESSAGES.network)
        } else {
          setErrorMessage(err.message || ERROR_MESSAGES.unknown)
        }
      }
    },
    [user, isOnline, fetchWithRetry]
  )

  // ------------------------------------------------------------------
  // Chargement des données géographiques (cache 24h car statique)
  // ------------------------------------------------------------------
  const loadGeoData = useCallback(async () => {
    // Déjà chargé ou en cours
    if (hasLoadedGeoRef.current) return

    // Essayer le cache d'abord
    const cached = getCached<{ provinces: Province[]; villes: Ville[]; communes: Commune[] }>(
      GEO_CACHE_KEY,
      GEO_CACHE_TTL
    )
    if (cached && cached.provinces.length > 0) {
      setProvinces(cached.provinces)
      setVilles(cached.villes)
      setCommunes(cached.communes)
      setGeoLoadState('success')
      return
    }

    setGeoLoadState('loading')

    try {
      const [provincesRes, villesRes, communesRes] = await Promise.allSettled([
        fetchWithRetry('/api/public/provinces'),
        fetchWithRetry('/api/public/villes'),
        fetchWithRetry('/api/public/communes'),
      ])

      const extract = (result: PromiseSettledResult<Response>): any[] => {
        if (result.status === 'fulfilled') {
          return result.value
            .json()
            .then((d: any) => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []))
            .catch(() => [])
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
        setErrorMessage(ERROR_MESSAGES.geo_load_failed)
        return
      }

      // Trier alphabétiquement pour une meilleure UX
      const sortedProvinces = [...provincesData].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
      const sortedVilles = [...villesData].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
      const sortedCommunes = [...communesData].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))

      setProvinces(sortedProvinces)
      setVilles(sortedVilles)
      setCommunes(sortedCommunes)
      setGeoLoadState('success')

      setCached(GEO_CACHE_KEY, {
        provinces: sortedProvinces,
        villes: sortedVilles,
        communes: sortedCommunes,
      })
    } catch (err: any) {
      setGeoLoadState('error')
      if (err.name === 'AbortError') {
        setErrorMessage(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setErrorMessage(ERROR_MESSAGES.network)
      } else {
        setErrorMessage(ERROR_MESSAGES.geo_load_failed)
      }
    }
  }, [fetchWithRetry])

  // ------------------------------------------------------------------
  // Chargement initial
  // ------------------------------------------------------------------
  useEffect(() => {
    if (user && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      loadAddresses()
      loadGeoData()
    }
  }, [user, loadAddresses, loadGeoData])

  // ------------------------------------------------------------------
  // Ajouter une adresse
  // ------------------------------------------------------------------
  const addAddress = useCallback(
    async (data: AddressInput): Promise<UserAddress | null> => {
      // Validation
      const validation = validateAddressInput(data)
      if (!validation.valid) {
        toast.show({ type: 'error', message: validation.error || ERROR_MESSAGES.invalid_data, duration: 5000 })
        return null
      }

      if (!isOnline) {
        toast.show({ type: 'error', message: ERROR_MESSAGES.offline, duration: 5000 })
        return null
      }

      setIsSaving(true)

      try {
        const payload = {
          ...data,
          nom: data.nom.trim(),
          quartier: data.quartier.trim(),
          avenue: data.avenue.trim(),
          numero: data.numero?.trim() || null,
          reference: data.reference?.trim() || null,
          telephone: data.telephone ? normalizePhone(data.telephone) : null,
        }

        const res = await fetchWithRetry('/api/user/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const result = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (res.status >= 500) throw new Error(ERROR_MESSAGES.server)
          throw new Error(result.error || ERROR_MESSAGES.save_failed)
        }

        const newAddress: UserAddress = result.data || result

        // Mise à jour optimiste
        setAddresses((prev) => [...prev, newAddress])
        clearCached(ADDRESSES_CACHE_KEY)

        // Si c'est la première adresse, la définir comme défaut
        if (addresses.length === 0) {
          setDefaultAddress(newAddress.id)
        }

        toast.show({ type: 'success', message: 'Adresse ajoutée', duration: 3000 })
        return newAddress
      } catch (err: any) {
        toast.show({
          type: 'error',
          message: err.message || ERROR_MESSAGES.save_failed,
          duration: 5000,
        })
        return null
      } finally {
        setIsSaving(false)
      }
    },
    [isOnline, addresses.length, fetchWithRetry, toast]
  )

  // ------------------------------------------------------------------
  // Modifier une adresse
  // ------------------------------------------------------------------
  const updateAddress = useCallback(
    async (id: string, data: Partial<AddressInput>): Promise<boolean> => {
      // Validation si données complètes fournies
      if (data.nom !== undefined && data.province_id !== undefined) {
        const validation = validateAddressInput(data as AddressInput)
        if (!validation.valid) {
          toast.show({ type: 'error', message: validation.error || ERROR_MESSAGES.invalid_data, duration: 5000 })
          return false
        }
      }

      if (!isOnline) {
        toast.show({ type: 'error', message: ERROR_MESSAGES.offline, duration: 5000 })
        return false
      }

      setIsSaving(true)

      try {
        const payload: Record<string, unknown> = { ...data }
        if (data.telephone) payload.telephone = normalizePhone(data.telephone)

        const res = await fetchWithRetry(`/api/user/addresses/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const result = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (res.status === 404) {
            // Adresse déjà supprimée, nettoyer localement
            setAddresses((prev) => prev.filter((a) => a.id !== id))
            toast.show({ type: 'info', message: 'Adresse déjà supprimée.', duration: 3000 })
            return true
          }
          if (res.status >= 500) throw new Error(ERROR_MESSAGES.server)
          throw new Error(result.error || ERROR_MESSAGES.update_failed)
        }

        // Mise à jour locale
        setAddresses((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...data, telephone: payload.telephone as string } : a))
        )
        clearCached(ADDRESSES_CACHE_KEY)

        toast.show({ type: 'success', message: 'Adresse modifiée', duration: 3000 })
        return true
      } catch (err: any) {
        toast.show({
          type: 'error',
          message: err.message || ERROR_MESSAGES.update_failed,
          duration: 5000,
        })
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [isOnline, fetchWithRetry, toast]
  )

  // ------------------------------------------------------------------
  // Supprimer une adresse
  // ------------------------------------------------------------------
  const deleteAddress = useCallback(
    async (id: string): Promise<boolean> => {
      if (!isOnline) {
        toast.show({ type: 'error', message: ERROR_MESSAGES.offline, duration: 5000 })
        return false
      }

      setDeletingId(id)

      try {
        const res = await fetchWithRetry(`/api/user/addresses/${id}`, {
          method: 'DELETE',
        })

        if (!res.ok) {
          if (res.status === 404) {
            // Déjà supprimée, nettoyer localement
            setAddresses((prev) => prev.filter((a) => a.id !== id))
            toast.show({ type: 'info', message: 'Adresse déjà supprimée.', duration: 3000 })
            return true
          }
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || ERROR_MESSAGES.delete_failed)
        }

        // Mise à jour locale
        setAddresses((prev) => prev.filter((a) => a.id !== id))
        clearCached(ADDRESSES_CACHE_KEY)

        // Si c'était l'adresse par défaut, réassigner
        if (defaultAddressId === id) {
          const remaining = addresses.filter((a) => a.id !== id)
          if (remaining.length > 0) {
            setDefaultAddress(remaining[0].id)
          } else {
            setDefaultAddressId(null)
            if (typeof window !== 'undefined') {
              localStorage.removeItem(DEFAULT_ADDRESS_KEY)
            }
          }
        }

        toast.show({ type: 'success', message: 'Adresse supprimée', duration: 3000 })
        return true
      } catch (err: any) {
        toast.show({
          type: 'error',
          message: err.message || ERROR_MESSAGES.delete_failed,
          duration: 5000,
        })
        return false
      } finally {
        setDeletingId(null)
      }
    },
    [isOnline, addresses, defaultAddressId, fetchWithRetry, toast]
  )

  // ------------------------------------------------------------------
  // Définir l'adresse par défaut (localStorage car pas de colonne is_default)
  // ------------------------------------------------------------------
  const setDefaultAddress = useCallback((id: string) => {
    setDefaultAddressId(id)
    if (typeof window !== 'undefined') {
      localStorage.setItem(DEFAULT_ADDRESS_KEY, id)
    }
    toast.show({ type: 'success', message: 'Adresse définie par défaut', duration: 3000 })
  }, [toast])

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

  const getProvinceName = useCallback(
    (id: string | null): string => {
      if (!id) return ''
      return provinces.find((p) => p.id === id)?.nom || ''
    },
    [provinces]
  )

  const getVilleName = useCallback(
    (id: string | null): string => {
      if (!id) return ''
      return villes.find((v) => v.id === id)?.nom || ''
    },
    [villes]
  )

  const getCommuneName = useCallback(
    (id: string | null): string => {
      if (!id) return ''
      return communes.find((c) => c.id === id)?.nom || ''
    },
    [communes]
  )

  const formatAddress = useCallback(
    (address: UserAddress): string => {
      const parts: string[] = []

      if (address.avenue) parts.push(address.avenue)
      if (address.numero) parts.push(`N°${address.numero}`)
      if (address.quartier) parts.push(address.quartier)

      const communeName = getCommuneName(address.commune_id)
      if (communeName) parts.push(communeName)

      const villeName = getVilleName(address.ville_id)
      if (villeName) parts.push(villeName)

      const provinceName = getProvinceName(address.province_id)
      if (provinceName) parts.push(provinceName)

      if (address.reference) parts.push(`(${address.reference})`)

      return parts.join(', ') || address.adresse_text || 'Adresse incomplète'
    },
    [getCommuneName, getVilleName, getProvinceName]
  )

  // ------------------------------------------------------------------
  // Adresse par défaut (mémoïsée)
  // ------------------------------------------------------------------
  const defaultAddress = useMemo(() => {
    if (addresses.length === 0) return null
    const found = addresses.find((a) => a.id === defaultAddressId)
    return found || addresses[0] // Fallback : première adresse
  }, [addresses, defaultAddressId])

  return {
    addresses,
    defaultAddress,
    provinces,
    villes,
    communes,
    addressesLoadState,
    geoLoadState,
    errorMessage,
    isOnline,
    isSaving,
    deletingId,
    loadAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    loadGeoData,
    getVillesByProvince,
    getCommunesByVille,
    getProvinceName,
    getVilleName,
    getCommuneName,
    formatAddress,
  }
}

export default useAddresses