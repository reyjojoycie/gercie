'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/Input'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Province {
  id: string
  nom: string
}

interface Ville {
  id: string
  nom: string
}

interface Commune {
  id: string
  nom: string
}

export interface AddressData {
  province_id: string | null
  province_nom: string
  ville_id: string | null
  ville_nom: string
  commune_id: string | null
  commune_nom: string
  quartier: string
  avenue: string
  numero: string
  reference: string
  telephone: string
}

interface Props {
  onAddressChange: (data: AddressData) => void
  initialData?: Partial<AddressData>
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000
const CACHE_KEYS = {
  provinces: 'gercie_cache_provinces',
  villes: 'gercie_cache_villes',
  communes: 'gercie_cache_communes',
} as const

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1000

/* ------------------------------------------------------------------ */
/*  Helpers de cache localStorage                                      */
/* ------------------------------------------------------------------ */

interface CacheEntry<T> {
  data: T
  timestamp: number
}

function getFromCache<T>(key: string, subKey?: string): T | null {
  if (typeof window === 'undefined') return null

  try {
    const storageKey = subKey ? `${key}_${subKey}` : key
    const cached = localStorage.getItem(storageKey)
    
    if (!cached) return null

    const entry: CacheEntry<T> = JSON.parse(cached)
    const now = Date.now()

    if (now - entry.timestamp > CACHE_DURATION_MS) {
      localStorage.removeItem(storageKey)
      return null
    }

    return entry.data
  } catch {
    return null
  }
}

function setToCache<T>(key: string, data: T, subKey?: string): void {
  if (typeof window === 'undefined') return

  try {
    const storageKey = subKey ? `${key}_${subKey}` : key
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    }
    localStorage.setItem(storageKey, JSON.stringify(entry))
  } catch {
    // Ignorer si le localStorage est plein ou indisponible
  }
}

/* ------------------------------------------------------------------ */
/*  Helper : fetch avec retry                                          */
/* ------------------------------------------------------------------ */

async function fetchWithRetry(
  url: string,
  retries: number = MAX_RETRIES
): Promise<Response> {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return response
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      return fetchWithRetry(url, retries - 1)
    }
    throw error
  }
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */

export default function AddressCascadeSelect({
  onAddressChange,
  initialData = {},
}: Props) {
  // Utiliser useRef pour stocker onAddressChange sans déclencher de re-render
  const onAddressChangeRef = useRef(onAddressChange)
  
  useEffect(() => {
    onAddressChangeRef.current = onAddressChange
  }, [onAddressChange])

  // Données géographiques
  const [provinces, setProvinces] = useState<Province[]>([])
  const [villes, setVilles] = useState<Ville[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])

  // États de chargement
  const [loadingProvinces, setLoadingProvinces] = useState(true)
  const [loadingVilles, setLoadingVilles] = useState(false)
  const [loadingCommunes, setLoadingCommunes] = useState(false)

  // États d'erreur
  const [errorProvinces, setErrorProvinces] = useState('')
  const [errorVilles, setErrorVilles] = useState('')
  const [errorCommunes, setErrorCommunes] = useState('')

  // Sélections
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(
    initialData.province_id || null
  )
  const [selectedProvinceNom, setSelectedProvinceNom] = useState(
    initialData.province_nom || ''
  )
  const [selectedVilleId, setSelectedVilleId] = useState<string | null>(
    initialData.ville_id || null
  )
  const [selectedVilleNom, setSelectedVilleNom] = useState(
    initialData.ville_nom || ''
  )
  const [selectedCommuneId, setSelectedCommuneId] = useState<string | null>(
    initialData.commune_id || null
  )
  const [selectedCommuneNom, setSelectedCommuneNom] = useState(
    initialData.commune_nom || ''
  )

  // Champs texte
  const [quartier, setQuartier] = useState(initialData.quartier || '')
  const [avenue, setAvenue] = useState(initialData.avenue || '')
  const [numero, setNumero] = useState(initialData.numero || '')
  const [reference, setReference] = useState(initialData.reference || '')
  const [telephone, setTelephone] = useState(initialData.telephone || '')

  /* ---------------------------------------------------------------- */
  /*  Helper : notifier le parent (utilise ref pour éviter boucle)     */
  /* ---------------------------------------------------------------- */

  const notifyParent = useCallback(() => {
    onAddressChangeRef.current({
      province_id: selectedProvinceId,
      province_nom: selectedProvinceNom,
      ville_id: selectedVilleId,
      ville_nom: selectedVilleNom,
      commune_id: selectedCommuneId,
      commune_nom: selectedCommuneNom,
      quartier,
      avenue,
      numero,
      reference,
      telephone,
    })
  }, [
    selectedProvinceId,
    selectedProvinceNom,
    selectedVilleId,
    selectedVilleNom,
    selectedCommuneId,
    selectedCommuneNom,
    quartier,
    avenue,
    numero,
    reference,
    telephone,
  ])

  /* ---------------------------------------------------------------- */
  /*  Chargement des provinces                                         */
  /* ---------------------------------------------------------------- */

  const loadProvinces = useCallback(async () => {
    setLoadingProvinces(true)
    setErrorProvinces('')

    try {
      const cached = getFromCache<Province[]>(CACHE_KEYS.provinces)
      
      if (cached) {
        setProvinces(cached)
        setLoadingProvinces(false)
        return
      }

      const response = await fetchWithRetry('/api/public/provinces')
      const result = await response.json()

      const provincesData = Array.isArray(result)
        ? result
        : Array.isArray(result?.data)
        ? result.data
        : []

      setProvinces(provincesData)
      setToCache(CACHE_KEYS.provinces, provincesData)
    } catch (error: any) {
      console.error('[AddressCascadeSelect] Erreur chargement provinces:', error)
      setErrorProvinces('Impossible de charger les provinces. Vérifiez votre connexion.')
    } finally {
      setLoadingProvinces(false)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Chargement des villes                                            */
  /* ---------------------------------------------------------------- */

  const loadVilles = useCallback(async (provinceId: string) => {
    setLoadingVilles(true)
    setErrorVilles('')
    setVilles([])

    try {
      const cached = getFromCache<Ville[]>(CACHE_KEYS.villes, provinceId)
      
      if (cached) {
        setVilles(cached)
        setLoadingVilles(false)
        return
      }

      const response = await fetchWithRetry(
        `/api/public/villes?province_id=${encodeURIComponent(provinceId)}`
      )
      const result = await response.json()

      const villesData = Array.isArray(result)
        ? result
        : Array.isArray(result?.data)
        ? result.data
        : []

      setVilles(villesData)
      setToCache(CACHE_KEYS.villes, villesData, provinceId)
    } catch (error: any) {
      console.error('[AddressCascadeSelect] Erreur chargement villes:', error)
      setErrorVilles('Impossible de charger les villes. Réessayez.')
    } finally {
      setLoadingVilles(false)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Chargement des communes                                          */
  /* ---------------------------------------------------------------- */

  const loadCommunes = useCallback(async (villeId: string) => {
    setLoadingCommunes(true)
    setErrorCommunes('')
    setCommunes([])

    try {
      const cached = getFromCache<Commune[]>(CACHE_KEYS.communes, villeId)
      
      if (cached) {
        setCommunes(cached)
        setLoadingCommunes(false)
        return
      }

      const response = await fetchWithRetry(
        `/api/public/communes?ville_id=${encodeURIComponent(villeId)}`
      )
      const result = await response.json()

      const communesData = Array.isArray(result)
        ? result
        : Array.isArray(result?.data)
        ? result.data
        : []

      setCommunes(communesData)
      setToCache(CACHE_KEYS.communes, communesData, villeId)
    } catch (error: any) {
      console.error('[AddressCascadeSelect] Erreur chargement communes:', error)
      setErrorCommunes('Impossible de charger les communes. Réessayez.')
    } finally {
      setLoadingCommunes(false)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Effets : chargement initial                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    loadProvinces()
  }, [loadProvinces])

  useEffect(() => {
    if (!selectedProvinceId) {
      setVilles([])
      setErrorVilles('')
      return
    }
    loadVilles(selectedProvinceId)
  }, [selectedProvinceId, loadVilles])

  useEffect(() => {
    if (!selectedVilleId) {
      setCommunes([])
      setErrorCommunes('')
      return
    }
    loadCommunes(selectedVilleId)
  }, [selectedVilleId, loadCommunes])

  /* ---------------------------------------------------------------- */
  /*  Handlers : changement de sélection (appelle notifyParent)        */
  /* ---------------------------------------------------------------- */

  const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null
    setSelectedProvinceId(id)
    setSelectedProvinceNom(id ? provinces.find(p => p.id === id)?.nom || '' : '')
    
    // Réinitialiser ville et commune
    setSelectedVilleId(null)
    setSelectedVilleNom('')
    setSelectedCommuneId(null)
    setSelectedCommuneNom('')
    
    // ✅ Appeler notifyParent APRÈS les setState (sera exécuté au prochain render)
    setTimeout(() => notifyParent(), 0)
  }

  const handleVilleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null
    setSelectedVilleId(id)
    setSelectedVilleNom(id ? villes.find(v => v.id === id)?.nom || '' : '')
    
    // Réinitialiser commune
    setSelectedCommuneId(null)
    setSelectedCommuneNom('')
    
    setTimeout(() => notifyParent(), 0)
  }

  const handleCommuneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null
    setSelectedCommuneId(id)
    setSelectedCommuneNom(id ? communes.find(c => c.id === id)?.nom || '' : '')
    
    setTimeout(() => notifyParent(), 0)
  }

  // Handlers pour les champs texte
  const handleQuartierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuartier(e.target.value)
    setTimeout(() => notifyParent(), 0)
  }

  const handleAvenueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAvenue(e.target.value)
    setTimeout(() => notifyParent(), 0)
  }

  const handleNumeroChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNumero(e.target.value)
    setTimeout(() => notifyParent(), 0)
  }

  const handleReferenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReference(e.target.value)
    setTimeout(() => notifyParent(), 0)
  }

  const handleTelephoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTelephone(e.target.value)
    setTimeout(() => notifyParent(), 0)
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu : skeleton pour chargement                                 */
  /* ---------------------------------------------------------------- */

  const SelectSkeleton = () => (
    <div className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm animate-pulse">
      <div className="h-5 bg-neutral-200 dark:bg-neutral-700 rounded w-3/4"></div>
    </div>
  )

  /* ---------------------------------------------------------------- */
  /*  Rendu : message d'erreur avec retry                              */
  /* ---------------------------------------------------------------- */

  const ErrorMessage = ({
    message,
    onRetry,
  }: {
    message: string
    onRetry: () => void
  }) => (
    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
      <AlertCircle size={16} aria-hidden="true" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 text-xs font-medium hover:underline"
        aria-label="Réessayer"
      >
        <RefreshCw size={14} aria-hidden="true" />
        Réessayer
      </button>
    </div>
  )

  /* ---------------------------------------------------------------- */
  /*  Rendu principal                                                  */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-4">
      {/* Provinces */}
      <div>
        <label
          htmlFor="province-select"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
        >
          Province
        </label>
        
        {loadingProvinces ? (
          <SelectSkeleton />
        ) : errorProvinces ? (
          <ErrorMessage message={errorProvinces} onRetry={loadProvinces} />
        ) : (
          <select
            id="province-select"
            value={selectedProvinceId || ''}
            onChange={handleProvinceChange}
            disabled={loadingProvinces}
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:ring-2 focus:ring-gold-500 focus:border-gold-500 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Sélectionner une province"
          >
            <option value="">-- Choisir une province --</option>
            {provinces.map(p => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Villes */}
      <div>
        <label
          htmlFor="ville-select"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
        >
          Ville
        </label>
        
        {!selectedProvinceId ? (
          <select
            id="ville-select"
            disabled
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm opacity-50 cursor-not-allowed"
            aria-label="Sélectionner d'abord une province"
          >
            <option value="">-- Choisir d'abord une province --</option>
          </select>
        ) : loadingVilles ? (
          <SelectSkeleton />
        ) : errorVilles ? (
          <ErrorMessage message={errorVilles} onRetry={() => loadVilles(selectedProvinceId!)} />
        ) : (
          <select
            id="ville-select"
            value={selectedVilleId || ''}
            onChange={handleVilleChange}
            disabled={loadingVilles}
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:ring-2 focus:ring-gold-500 focus:border-gold-500 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Sélectionner une ville"
          >
            <option value="">-- Choisir une ville --</option>
            {villes.map(v => (
              <option key={v.id} value={v.id}>
                {v.nom}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Communes */}
      <div>
        <label
          htmlFor="commune-select"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
        >
          Commune
        </label>
        
        {!selectedVilleId ? (
          <select
            id="commune-select"
            disabled
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm opacity-50 cursor-not-allowed"
            aria-label="Sélectionner d'abord une ville"
          >
            <option value="">-- Choisir d'abord une ville --</option>
          </select>
        ) : loadingCommunes ? (
          <SelectSkeleton />
        ) : errorCommunes ? (
          <ErrorMessage message={errorCommunes} onRetry={() => loadCommunes(selectedVilleId!)} />
        ) : (
          <select
            id="commune-select"
            value={selectedCommuneId || ''}
            onChange={handleCommuneChange}
            disabled={loadingCommunes}
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:ring-2 focus:ring-gold-500 focus:border-gold-500 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Sélectionner une commune"
          >
            <option value="">-- Choisir une commune --</option>
            {communes.map(c => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Champs texte */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <Input
          variant="glass"
          label="Quartier"
          placeholder="Ex: Gombe, Lingwala..."
          value={quartier}
          onChange={handleQuartierChange}
          autoComplete="address-line2"
        />
        <Input
          variant="glass"
          label="Avenue / Rue"
          placeholder="Ex: Avenue de la Justice"
          value={avenue}
          onChange={handleAvenueChange}
          autoComplete="address-line1"
        />
        <Input
          variant="glass"
          label="Numéro"
          placeholder="Ex: 123"
          value={numero}
          onChange={handleNumeroChange}
          autoComplete="address-line1"
        />
        <Input
          variant="glass"
          label="Référence"
          placeholder="Ex: Près du marché central"
          value={reference}
          onChange={handleReferenceChange}
        />
        <Input
          variant="glass"
          label="Téléphone (optionnel)"
          type="tel"
          placeholder="0812345678"
          value={telephone}
          onChange={handleTelephoneChange}
          autoComplete="tel"
        />
      </div>
    </div>
  )
}