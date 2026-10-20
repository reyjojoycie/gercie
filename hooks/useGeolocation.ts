// hooks/useGeolocation.ts
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { z } from 'zod'
import { geocodeAddress, reverseGeocode, type AddressComponents } from '@/lib/geocoding'
import { calculateDistance } from '@/lib/geocoding'
import logger from '@/lib/logger'

/* ========================================================================== */
/*  Validation Zod pour les coordonnées                                       */
/* ========================================================================== */
const coordsSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
  altitude: z.number().nullable().optional(),
  altitudeAccuracy: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
})

/* ========================================================================== */
/*  Types enrichis                                                             */
/* ========================================================================== */
export interface GeolocationState {
  /** Coordonnées actuelles */
  latitude: number
  longitude: number
  accuracy?: number
  altitude?: number | null
  altitudeAccuracy?: number | null
  heading?: number | null
  speed?: number | null
  timestamp: number
}

export interface GeolocationError {
  code: number
  message: string
  PERMISSION_DENIED: boolean
  POSITION_UNAVAILABLE: boolean
  TIMEOUT: boolean
}

export interface UseGeolocationOptions {
  /** Démarrer la géolocalisation automatiquement au montage */
  enabled?: boolean
  /** Mode continu (watchPosition) */
  watch?: boolean
  /** Haute précision (GPS) */
  highAccuracy?: boolean
  /** Timeout en millisecondes */
  timeout?: number
  /** Âge maximum de la position en cache (ms) */
  maximumAge?: number
  /** Distance minimale de déplacement avant mise à jour (mètres, pour watch) */
  distanceFilter?: number
  /** Callback en cas d'erreur personnalisé */
  onError?: (error: GeolocationError) => void
  /** Callback quand la position change */
  onPositionChange?: (position: GeolocationState) => void
  /** Effectuer un géocodage inverse automatique pour obtenir l'adresse */
  reverseGeocode?: boolean
  /** Debounce pour le reverse geocoding (ms) */
  reverseGeocodeDebounce?: number
}

export interface UseGeolocationReturn {
  /** Position actuelle (ou null) */
  position: GeolocationState | null
  /** Adresse lisible si reverseGeocode activé */
  address: AddressComponents | null
  /** Chargement en cours */
  loading: boolean
  /** Erreur éventuelle */
  error: GeolocationError | null
  /** Indique si la géolocalisation est supportée */
  isSupported: boolean
  /** Indique si l'utilisateur a refusé la permission */
  permissionDenied: boolean
  /** Demander la position (utile quand enabled=false) */
  requestPosition: () => void
  /** Arrêter le suivi continu */
  clearWatch: () => void
  /** Distance parcourue depuis le début du suivi (en km) */
  distanceTravelled: number
  /** Historique des positions (jusqu'à 50) */
  positionHistory: GeolocationState[]
  /** Rafraîchir manuellement (force une nouvelle position) */
  refresh: () => void
}

/* ========================================================================== */
/*  Helpers                                                                   */
/* ========================================================================== */
function buildGeolocationError(error: GeolocationPositionError): GeolocationError {
  return {
    code: error.code,
    message: error.message,
    PERMISSION_DENIED: error.code === error.PERMISSION_DENIED,
    POSITION_UNAVAILABLE: error.code === error.POSITION_UNAVAILABLE,
    TIMEOUT: error.code === error.TIMEOUT,
  }
}

function mapPosition(pos: GeolocationPosition): GeolocationState {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    altitude: pos.coords.altitude,
    altitudeAccuracy: pos.coords.altitudeAccuracy,
    heading: pos.coords.heading,
    speed: pos.coords.speed,
    timestamp: pos.timestamp,
  }
}

/* ========================================================================== */
/*  Hook                                                                      */
/* ========================================================================== */
export function useGeolocation(options: UseGeolocationOptions = {}): UseGeolocationReturn {
  const {
    enabled = false,
    watch = false,
    highAccuracy = true,
    timeout = 15000,
    maximumAge = 60000,
    distanceFilter = 10,
    onError,
    onPositionChange,
    reverseGeocode: doReverseGeocode = false,
    reverseGeocodeDebounce = 2000,
  } = options

  const [position, setPosition] = useState<GeolocationState | null>(null)
  const [address, setAddress] = useState<AddressComponents | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<GeolocationError | null>(null)
  const [isSupported, setIsSupported] = useState(true)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [positionHistory, setPositionHistory] = useState<GeolocationState[]>([])
  const [distanceTravelled, setDistanceTravelled] = useState(0)

  const watchIdRef = useRef<number | null>(null)
  const lastPositionRef = useRef<GeolocationState | null>(null)
  const reverseGeocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Vérifier si la géolocalisation est supportée
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setIsSupported(false)
      setError({
        code: 2,
        message: 'La géolocalisation n\'est pas supportée par ce navigateur.',
        PERMISSION_DENIED: false,
        POSITION_UNAVAILABLE: true,
        TIMEOUT: false,
      })
      setLoading(false)
    }
  }, [])

  // Fonction de succès
  const handleSuccess = useCallback((pos: GeolocationPosition) => {
    const newPosition = mapPosition(pos)
    setPosition(newPosition)
    setLoading(false)
    setError(null)
    setPermissionDenied(false)

    // Historique (max 50)
    setPositionHistory(prev => {
      const updated = [...prev, newPosition]
      return updated.slice(-50)
    })

    // Distance parcourue
    if (lastPositionRef.current) {
      const dist = calculateDistance(
        lastPositionRef.current.latitude,
        lastPositionRef.current.longitude,
        newPosition.latitude,
        newPosition.longitude,
      )
      if (!isNaN(dist)) {
        setDistanceTravelled(d => d + dist)
      }
    }
    lastPositionRef.current = newPosition

    onPositionChange?.(newPosition)

    // Géocodage inverse (debounce)
    if (doReverseGeocode) {
      if (reverseGeocodeTimerRef.current) clearTimeout(reverseGeocodeTimerRef.current)
      reverseGeocodeTimerRef.current = setTimeout(async () => {
        try {
          const addr = await reverseGeocode(newPosition.latitude, newPosition.longitude, { language: 'fr' })
          if (addr) setAddress(addr)
        } catch {
          // silencieux
        }
      }, reverseGeocodeDebounce)
    }
  }, [doReverseGeocode, reverseGeocodeDebounce, onPositionChange])

  // Fonction d'erreur
  const handleError = useCallback((err: GeolocationPositionError) => {
    const geoError = buildGeolocationError(err)
    setError(geoError)
    setLoading(false)
    if (geoError.PERMISSION_DENIED) setPermissionDenied(true)
    onError?.(geoError)
    logger.warn('Erreur de géolocalisation', geoError)
  }, [onError])

  // Démarrer le suivi (getCurrentPosition ou watchPosition)
  const startGeolocation = useCallback(() => {
    if (!navigator.geolocation) return
    setLoading(true)
    setError(null)

    if (watch) {
      // Nettoyer un précédent watch
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        { enableHighAccuracy: highAccuracy, timeout, maximumAge, distanceFilter }
      )
    } else {
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        { enableHighAccuracy: highAccuracy, timeout, maximumAge }
      )
    }
  }, [watch, highAccuracy, timeout, maximumAge, distanceFilter, handleSuccess, handleError])

  // Arrêter le suivi
  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setLoading(false)
  }, [])

  // Demander explicitement la position (même si enabled=false)
  const requestPosition = useCallback(() => {
    if (!navigator.geolocation) return
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  }, [handleSuccess, handleError])

  // Rafraîchir (demander une nouvelle position)
  const refresh = useCallback(() => {
    requestPosition()
  }, [requestPosition])

  // Démarrer/arrêter automatiquement selon les options
  useEffect(() => {
    if (!isSupported) return
    if (enabled) {
      startGeolocation()
    } else {
      clearWatch()
    }
    return () => {
      clearWatch()
    }
  }, [enabled, isSupported, startGeolocation, clearWatch])

  // Nettoyage final
  useEffect(() => {
    return () => {
      clearWatch()
      if (reverseGeocodeTimerRef.current) clearTimeout(reverseGeocodeTimerRef.current)
    }
  }, [clearWatch])

  // Vérifier périodiquement l'état de la permission (si l'API le permet)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setPermissionDenied(result.state === 'denied')
        // Écouter les changements
        result.addEventListener('change', () => {
          setPermissionDenied(result.state === 'denied')
        })
      }).catch(() => {})
    }
  }, [])

  return useMemo(() => ({
    position,
    address,
    loading,
    error,
    isSupported,
    permissionDenied,
    requestPosition,
    clearWatch,
    distanceTravelled,
    positionHistory,
    refresh,
  }), [position, address, loading, error, isSupported, permissionDenied, requestPosition, clearWatch, distanceTravelled, positionHistory, refresh])
}

export default useGeolocation