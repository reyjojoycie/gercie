// components/LocationSelector.tsx
'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { useGeolocation } from '@/hooks/useGeolocation' // hook à créer ou importer
import { geocodeAddress, reverseGeocode } from '@/lib/geocoding'
import {
  MapPin,
  AlertCircle,
  Home,
  Building,
  LocateFixed,
  Search,
  X,
  CheckCircle2,
  Navigation,
  ChevronDown,
  History,
  MapPinned,
  Phone,
  MapIcon,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface AddressData {
  province_id: number | null
  province_nom: string
  ville_id: number | null
  ville_nom: string
  commune_id: number | null
  commune_nom: string
  quartier: string
  avenue: string
  numero: string
  reference: string
  telephone: string
  adresse_text: string
  coordinates?: { lat: number; lng: number } | null
}

interface LocationSelectorProps {
  /** Callback avec commune_id et adresse textuelle (pour usage existant) */
  onLocationChange?: (communeId: number | null, adresseComplete?: string) => void
  /** Callback enrichi avec toutes les données d'adresse */
  onAddressChange?: (address: AddressData) => void
  /** Valeurs initiales (pour édition) */
  initialAddress?: Partial<AddressData>
  /** Mode compact (moins de padding) */
  compact?: boolean
  /** Classes additionnelles */
  className?: string
  /** Activer la géolocalisation automatique */
  enableGeolocation?: boolean
  /** Activer l'autocomplétion d'adresse */
  enableAutocomplete?: boolean
  /** Afficher une carte miniature (placeholder) */
  showMinimap?: boolean
}

/* ========================================================================== */
/*  Adresses récentes (localStorage)                                           */
/* ========================================================================== */

const RECENT_ADDRESSES_KEY = 'gercie-recent-addresses'
const MAX_RECENT = 5

function getRecentAddresses(): Partial<AddressData>[] {
  try {
    const raw = localStorage.getItem(RECENT_ADDRESSES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecentAddress(address: Partial<AddressData>) {
  const current = getRecentAddresses()
  const updated = [
    address,
    ...current.filter(a => a.adresse_text !== address.adresse_text),
  ].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_ADDRESSES_KEY, JSON.stringify(updated))
}

/* ========================================================================== */
/*  Composant LocationSelector                                                 */
/* ========================================================================== */

export default function LocationSelector({
  onLocationChange,
  onAddressChange,
  initialAddress,
  compact = false,
  className,
  enableGeolocation = true,
  enableAutocomplete = true,
  showMinimap = false,
}: LocationSelectorProps) {
  /* --- Listes déroulantes --- */
  const [provinces, setProvinces] = useState<{ id: number; nom: string }[]>([])
  const [villes, setVilles] = useState<{ id: number; nom: string }[]>([])
  const [communes, setCommunes] = useState<{ id: number; nom: string }[]>([])

  /* --- Sélections --- */
  const [selectedProvince, setSelectedProvince] = useState<number | ''>(initialAddress?.province_id || '')
  const [selectedVille, setSelectedVille] = useState<number | ''>(initialAddress?.ville_id || '')
  const [selectedCommune, setSelectedCommune] = useState<number | ''>(initialAddress?.commune_id || '')
  const [quartier, setQuartier] = useState(initialAddress?.quartier || '')
  const [avenue, setAvenue] = useState(initialAddress?.avenue || '')
  const [numero, setNumero] = useState(initialAddress?.numero || '')
  const [reference, setReference] = useState(initialAddress?.reference || '')
  const [telephone, setTelephone] = useState(initialAddress?.telephone || '')

  /* --- Autocomplétion --- */
  const [autocompleteQuery, setAutocompleteQuery] = useState('')
  const [autocompleteResults, setAutocompleteResults] = useState<AddressData[]>([])
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const autocompleteRef = useRef<HTMLDivElement>(null)

  /* --- Géolocalisation --- */
  const { position: geoPosition, loading: geoLoading, error: geoError, requestPosition } = useGeolocation({
    enabled: false, // on ne lance pas automatiquement
  })

  /* --- Adresses récentes --- */
  const [recentAddresses, setRecentAddresses] = useState<Partial<AddressData>[]>([])

  /* --- Indicateurs de chargement --- */
  const [loadingProvinces, setLoadingProvinces] = useState(true)
  const [loadingVilles, setLoadingVilles] = useState(false)
  const [loadingCommunes, setLoadingCommunes] = useState(false)
  const [detectingAddress, setDetectingAddress] = useState(false)

  /* --- Erreurs --- */
  const [error, setError] = useState('')

  /* --- Référence pour onAddressChange (évite de changer la signature du callback) --- */
  const onAddressChangeRef = useRef(onAddressChange)
  useEffect(() => {
    onAddressChangeRef.current = onAddressChange
  }, [onAddressChange])

  /* ================================================================
     Chargement initial
     ================================================================ */
  useEffect(() => {
    setRecentAddresses(getRecentAddresses())
  }, [])

  useEffect(() => {
    setLoadingProvinces(true)
    fetch('/api/provinces')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setProvinces(data)
        else setProvinces([])
      })
      .catch(() => setProvinces([]))
      .finally(() => setLoadingProvinces(false))
  }, [])

  /* ================================================================
     Chargement des villes
     ================================================================ */
  useEffect(() => {
    if (!selectedProvince) {
      setVilles([])
      setSelectedVille('')
      setCommunes([])
      setSelectedCommune('')
      return
    }
    setLoadingVilles(true)
    setError('')
    fetch(`/api/villes?province_id=${selectedProvince}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setVilles(data)
        else setVilles([])
      })
      .catch(() => setVilles([]))
      .finally(() => setLoadingVilles(false))
  }, [selectedProvince])

  /* ================================================================
     Chargement des communes
     ================================================================ */
  useEffect(() => {
    if (!selectedVille) {
      setCommunes([])
      setSelectedCommune('')
      return
    }
    setLoadingCommunes(true)
    setError('')
    fetch(`/api/communes?ville_id=${selectedVille}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setCommunes(data)
        else setCommunes([])
      })
      .catch(() => setCommunes([]))
      .finally(() => setLoadingCommunes(false))
  }, [selectedVille])

  /* ================================================================
     Autocomplétion (recherche manuelle via Nominatim)
     ================================================================ */
  useEffect(() => {
    if (!autocompleteQuery || autocompleteQuery.length < 3) {
      setAutocompleteResults([])
      setShowAutocomplete(false)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const coords = await geocodeAddress(autocompleteQuery)
        if (coords) {
          const addr = await reverseGeocode(coords.lat, coords.lng)
          if (addr) {
            setAutocompleteResults([{
              province_id: null,
              province_nom: addr.province || '',
              ville_id: null,
              ville_nom: addr.ville || '',
              commune_id: null,
              commune_nom: addr.commune || '',
              quartier: addr.quartier || '',
              avenue: addr.avenue || '',
              numero: addr.numero || '',
              reference: '',
              telephone: '',
              adresse_text: addr.display_name,
              coordinates: coords,
            }])
            setShowAutocomplete(true)
          }
        }
      } catch {}
    }, 400)
    return () => clearTimeout(timer)
  }, [autocompleteQuery])

  /* ================================================================
     Détection automatique via géolocalisation
     ================================================================ */
  const handleGeolocate = async () => {
    if (!enableGeolocation) return
    setDetectingAddress(true)
    setError('')
    await requestPosition()
  }

  // Quand la position est obtenue, on la convertit en adresse
  useEffect(() => {
    if (!geoPosition) return
    const resolveAddress = async () => {
      setDetectingAddress(true)
      try {
        const addr = await reverseGeocode(geoPosition.latitude, geoPosition.longitude)
        if (addr) {
          setQuartier(addr.quartier || '')
          setAvenue(addr.avenue || '')
          setNumero(addr.numero || '')
          setReference('')
          // On pourrait essayer de matcher avec les listes province/ville/commune
          // mais on laisse l'utilisateur ajuster
        }
      } catch (err: any) {
        setError('Impossible de détecter l\'adresse.')
      } finally {
        setDetectingAddress(false)
      }
    }
    resolveAddress()
  }, [geoPosition])

  /* ================================================================
     Construction et propagation de l'adresse
     ================================================================ */
  const buildAddressData = useCallback((): AddressData => {
    const adresseParts = [avenue, numero ? `n°${numero}` : '', quartier, reference].filter(Boolean)
    return {
      province_id: selectedProvince ? Number(selectedProvince) : null,
      province_nom: provinces.find(p => p.id === selectedProvince)?.nom || '',
      ville_id: selectedVille ? Number(selectedVille) : null,
      ville_nom: villes.find(v => v.id === selectedVille)?.nom || '',
      commune_id: selectedCommune ? Number(selectedCommune) : null,
      commune_nom: communes.find(c => c.id === selectedCommune)?.nom || '',
      quartier,
      avenue,
      numero,
      reference,
      telephone,
      adresse_text: adresseParts.join(', '),
      coordinates: geoPosition ? { lat: geoPosition.latitude, lng: geoPosition.longitude } : null,
    }
  }, [selectedProvince, selectedVille, selectedCommune, quartier, avenue, numero, reference, telephone, provinces, villes, communes, geoPosition])

  useEffect(() => {
    const address = buildAddressData()
    if (onAddressChangeRef.current) {
      onAddressChangeRef.current(address)
    }
    if (onLocationChange) {
      if (address.commune_id) {
        const adresseComplete = [
          address.quartier,
          address.avenue,
          address.numero ? `n°${address.numero}` : '',
          address.reference,
        ]
          .filter(Boolean)
          .join(', ')
        onLocationChange(address.commune_id, adresseComplete || undefined)
      } else {
        onLocationChange(null)
      }
    }
  }, [buildAddressData, onLocationChange])

  /* ================================================================
     Gestion des adresses récentes
     ================================================================ */
  const handleRecentClick = (addr: Partial<AddressData>) => {
    if (addr.province_id) setSelectedProvince(addr.province_id)
    if (addr.ville_id) setSelectedVille(addr.ville_id)
    if (addr.commune_id) setSelectedCommune(addr.commune_id)
    if (addr.quartier) setQuartier(addr.quartier)
    if (addr.avenue) setAvenue(addr.avenue)
    if (addr.numero) setNumero(addr.numero)
    if (addr.reference) setReference(addr.reference)
    if (addr.telephone) setTelephone(addr.telephone)
  }

  const handleSaveCurrent = () => {
    saveRecentAddress(buildAddressData())
    setRecentAddresses(getRecentAddresses())
  }

  /* ================================================================
     Styles partagés
     ================================================================ */
  const selectClass = cn(
    'w-full border border-neutral-300 dark:border-neutral-700',
    'rounded-xl px-4 py-2.5 text-sm',
    'bg-white dark:bg-neutral-900',
    'text-neutral-900 dark:text-neutral-100',
    'focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'transition-colors'
  )

  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-soft space-y-5',
        compact && 'p-4 space-y-3',
        className
      )}
    >
      {error && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Barre d'actions : géolocalisation + sauvegarde */}
      <div className="flex items-center gap-2 flex-wrap">
        {enableGeolocation && (
          <Tooltip content="Utiliser ma position actuelle">
            <Button
              variant="outline-gold"
              size="sm"
              onClick={handleGeolocate}
              loading={detectingAddress || geoLoading}
              leftIcon={<LocateFixed size={14} />}
            >
              Me localiser
            </Button>
          </Tooltip>
        )}
        <Tooltip content="Sauvegarder cette adresse pour plus tard">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveCurrent}
            leftIcon={<History size={14} />}
          >
            Sauvegarder
          </Button>
        </Tooltip>
      </div>

      {/* Autocomplétion */}
      {enableAutocomplete && (
        <div className="relative" ref={autocompleteRef}>
          <Input
            leftIcon={<Search size={16} />}
            placeholder="Rechercher une adresse..."
            value={autocompleteQuery}
            onChange={e => setAutocompleteQuery(e.target.value)}
            onFocus={() => autocompleteResults.length > 0 && setShowAutocomplete(true)}
            onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
            variant="glass"
            size="sm"
          />
          <AnimatePresence>
            {showAutocomplete && autocompleteResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute z-10 left-0 right-0 top-full mt-1 bg-white dark:bg-neutral-800 rounded-xl shadow-strong border border-gold-400/20 p-2 max-h-48 overflow-y-auto"
              >
                {autocompleteResults.map((addr, idx) => (
                  <button
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gold-400/10 transition-colors w-full text-left"
                    onClick={() => {
                      if (addr.coordinates) {
                        // On peut pré-remplir avec les infos
                        setQuartier(addr.quartier)
                        setAvenue(addr.avenue)
                        setNumero(addr.numero)
                        setReference(addr.reference)
                      }
                      setShowAutocomplete(false)
                      setAutocompleteQuery('')
                    }}
                  >
                    <MapPin size={14} className="text-gold-500" />
                    <span className="truncate">{addr.adresse_text}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Adresses récentes */}
      {recentAddresses.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutral-500 mb-2 flex items-center gap-1">
            <History size={14} /> Adresses récentes
          </p>
          <div className="flex flex-wrap gap-2">
            {recentAddresses.map((addr, idx) => (
              <button
                key={idx}
                onClick={() => handleRecentClick(addr)}
                className="text-xs px-3 py-1.5 rounded-full border border-gold-400/20 bg-gold-50 dark:bg-gold-900/20 hover:bg-gold-400/10 transition-colors text-neutral-700 dark:text-neutral-300"
              >
                {addr.adresse_text || `${addr.quartier}, ${addr.avenue}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Province */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
          Province
        </label>
        <div className="relative">
          <select
            value={selectedProvince}
            onChange={e => setSelectedProvince(e.target.value ? Number(e.target.value) : '')}
            className={selectClass}
            disabled={loadingProvinces}
          >
            <option value="">
              {loadingProvinces ? 'Chargement…' : 'Sélectionner une province'}
            </option>
            {provinces.map(p => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
          </select>
          {loadingProvinces && (
            <div className="absolute right-3 top-0 bottom-0 flex items-center">
              <Spinner size="sm" variant="neutral" />
            </div>
          )}
        </div>
      </div>

      {/* Ville */}
      {selectedProvince && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
            Ville
          </label>
          <div className="relative">
            <select
              value={selectedVille}
              onChange={e => setSelectedVille(e.target.value ? Number(e.target.value) : '')}
              className={selectClass}
              disabled={loadingVilles || !selectedProvince}
            >
              <option value="">
                {loadingVilles ? 'Chargement…' : 'Sélectionner une ville'}
              </option>
              {villes.map(v => (
                <option key={v.id} value={v.id}>{v.nom}</option>
              ))}
            </select>
            {loadingVilles && (
              <div className="absolute right-3 top-0 bottom-0 flex items-center">
                <Spinner size="sm" variant="neutral" />
              </div>
            )}
          </div>
          {selectedVille && villes.length === 0 && !loadingVilles && (
            <p className="text-xs text-neutral-400 mt-1">Aucune ville trouvée.</p>
          )}
        </div>
      )}

      {/* Commune */}
      {selectedVille && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
            Commune
          </label>
          <div className="relative">
            <select
              value={selectedCommune}
              onChange={e => setSelectedCommune(e.target.value ? Number(e.target.value) : '')}
              className={selectClass}
              disabled={loadingCommunes || !selectedVille}
            >
              <option value="">
                {loadingCommunes ? 'Chargement…' : 'Sélectionner une commune'}
              </option>
              {communes.map(c => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
            {loadingCommunes && (
              <div className="absolute right-3 top-0 bottom-0 flex items-center">
                <Spinner size="sm" variant="neutral" />
              </div>
            )}
          </div>
          {selectedCommune && communes.length === 0 && !loadingCommunes && (
            <p className="text-xs text-neutral-400 mt-1">Aucune commune trouvée.</p>
          )}
        </div>
      )}

      {/* Précisions de livraison */}
      {selectedCommune && (
        <div className="pt-4 border-t border-dashed border-neutral-200 dark:border-neutral-700 space-y-4">
          <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
            <Home size={14} /> Précisions de livraison
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Quartier"
              placeholder="Votre quartier"
              value={quartier}
              onChange={e => setQuartier(e.target.value)}
              inputSize="sm"
            />
            <Input
              label="N° Parcelle"
              placeholder="N°"
              value={numero}
              onChange={e => setNumero(e.target.value)}
              inputSize="sm"
            />
          </div>
          <Input
            label="Avenue / Rue"
            placeholder="Avenue ou rue"
            value={avenue}
            onChange={e => setAvenue(e.target.value)}
            inputSize="sm"
          />
          <Input
            label="Point de repère"
            placeholder="Ex: En face de la station, portail bleu…"
            value={reference}
            onChange={e => setReference(e.target.value)}
            inputSize="sm"
          />
          <Input
            label="Téléphone (optionnel)"
            placeholder="Numéro de téléphone"
            type="tel"
            value={telephone}
            onChange={e => setTelephone(e.target.value)}
            inputSize="sm"
          />
        </div>
      )}

      {/* Indicateur de géolocalisation détectée */}
      {geoPosition && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
          <CheckCircle2 size={16} />
          <span>Position détectée (précision: ±{(geoPosition as any).accuracy?.toFixed(0) || '?'} m)</span>
        </div>
      )}
    </div>
  )
}