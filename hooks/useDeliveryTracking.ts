// hooks/useDeliveryTracking.ts
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useGeolocation } from '@/hooks/useGeolocation'
import { getDeliveryById, getDeliveryByCommandeId, type Delivery } from '@/features/delivery/services/deliveryService'
import { getDirections, type Coordinates } from '@/lib/mapbox'
import { calculateDistance } from '@/lib/geocoding'
import logger from '@/lib/logger'

/* ========================================================================== */
/*  Types & Config                                                             */
/* ========================================================================== */
export interface TrackingState {
  delivery: Delivery | null
  lastPosition: Coordinates | null
  distanceRemaining: number | null       // km
  etaMinutes: number | null             // minutes
  isTracking: boolean
  loading: boolean
  error: string | null
  lastUpdateTimestamp: string | null
}

export interface UseDeliveryTrackingOptions {
  /** Intervalle de polling en ms (défaut 8000) */
  pollingIntervalMs?: number
  /** Activer le calcul automatique de l'itinéraire et de l'ETA */
  computeETA?: boolean
  /** Position du client (si non fournie, utilise la géolocalisation automatique) */
  clientPosition?: Coordinates | null
  /** Mode de transport pour le calcul d'itinéraire */
  transportMode?: 'driving' | 'walking' | 'cycling'
  /** Désactiver le polling automatique (gérer manuellement) */
  manualPolling?: boolean
}

export interface UseDeliveryTrackingReturn {
  delivery: Delivery | null
  loading: boolean
  error: string | null
  lastPosition: Coordinates | null
  distanceRemaining: number | null
  etaMinutes: number | null
  /** Indique si le suivi en temps réel est actif */
  isTracking: boolean
  /** Démarrer le suivi */
  startTracking: () => void
  /** Arrêter le suivi */
  stopTracking: () => void
  /** Rafraîchir manuellement les données de livraison */
  refreshDelivery: () => Promise<void>
  /** Recalculer l'ETA à la demande */
  refreshETA: () => Promise<void>
  /** Réessayer après une erreur */
  retry: () => void
  /** Horodatage du dernier rafraîchissement réussi */
  lastUpdate: Date | null
}

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */
const DEFAULT_POLLING_MS = 8000
const MAX_RETRY_COUNT = 3

function parseCoordinatesFromDelivery(delivery: Delivery): Coordinates | null {
  if (delivery.derniere_position?.latitude && delivery.derniere_position?.longitude) {
    return {
      latitude: delivery.derniere_position.latitude,
      longitude: delivery.derniere_position.longitude,
    }
  }
  return null
}

// Cache local simple pour éviter des appels redondants
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 10_000

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T
  cache.delete(key)
  return null
}
function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() })
}

/* ========================================================================== */
/*  Hook                                                                       */
/* ========================================================================== */
export function useDeliveryTracking(
  commandeId: string,
  options: UseDeliveryTrackingOptions = {}
): UseDeliveryTrackingReturn {
  const {
    pollingIntervalMs = DEFAULT_POLLING_MS,
    computeETA = true,
    clientPosition: propClientPosition,
    transportMode = 'driving',
    manualPolling = false,
  } = options

  // États
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isTracking, setIsTracking] = useState(!manualPolling)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Dérivés
  const lastPosition = useMemo(() => (delivery ? parseCoordinatesFromDelivery(delivery) : null), [delivery])
  const [distanceRemaining, setDistanceRemaining] = useState<number | null>(null)
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null)
  const [etaLoading, setEtaLoading] = useState(false)

  // Références
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  // Position du client (auto ou prop)
  const { position: autoClientPosition, requestPosition } = useGeolocation({
    enabled: false, // on ne suit pas automatiquement, on demande à la demande
    highAccuracy: true,
    timeout: 10000,
  })
  const clientPosition = propClientPosition || autoClientPosition

  // ----- Fonction de récupération de la livraison -----
  const fetchDelivery = useCallback(async (): Promise<Delivery | null> => {
    const cacheKey = `delivery:${commandeId}`
    const cached = getFromCache<Delivery>(cacheKey)
    if (cached) {
      // On met à jour sans forcer le chargement
      return cached
    }

    // Annuler tout précédent appel
    if (abortControllerRef.current) abortControllerRef.current.abort()
    abortControllerRef.current = new AbortController()

    try {
      // Essayer d'abord par commande_id (si votre service le supporte)
      // Sinon utiliser getDeliveryById (en supposant que l'ID livraison == commandeId pour la simplicité)
      // Ici on utilise getDeliveryById (si livraison.id correspond ?) – adaptation selon votre service
      // Nous utilisons une fonction générique getDeliveryByCommandeId si dispo, sinon getDeliveryById
      let data: Delivery | null = null
      try {
        data = await getDeliveryByCommandeId(commandeId)
      } catch {
        // fallback : getDeliveryById(commandeId) si la commande a le même ID que la livraison
        data = await getDeliveryById(commandeId)
      }
      if (data) {
        setCache(cacheKey, data)
        retryCountRef.current = 0
      }
      return data
    } catch (err: any) {
      if (err.name === 'AbortError') return null
      logger.error(err, 'Erreur fetchDelivery')
      throw err
    }
  }, [commandeId])

  // ----- Fonction de rafraîchissement complet -----
  const refreshDelivery = useCallback(async () => {
    if (!mountedRef.current) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDelivery()
      if (data) {
        setDelivery(data)
        setLastUpdate(new Date())
      }
    } catch (err: any) {
      const message = err.message || 'Erreur lors du chargement de la livraison'
      setError(message)
      retryCountRef.current += 1
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [fetchDelivery])

  // ----- Calcul de l'ETA et de la distance restante -----
  const refreshETA = useCallback(async () => {
    if (!computeETA || !lastPosition || !clientPosition) return
    setEtaLoading(true)
    try {
      // Calcul distance à vol d'oiseau (Haversine)
      const distHaversine = calculateDistance(
        lastPosition.latitude, lastPosition.longitude,
        clientPosition.latitude, clientPosition.longitude
      )
      setDistanceRemaining(distHaversine)

      // Essayer d'obtenir l'itinéraire via Mapbox pour une estimation plus précise
      try {
        const directions = await getDirections(lastPosition, clientPosition, [], transportMode)
        setDistanceRemaining(directions.distanceKm)
        setEtaMinutes(directions.durationMin)
      } catch {
        // Fallback : estimation basée sur la distance haversine et vitesse moyenne
        const avgSpeedKmh = transportMode === 'walking' ? 5 : transportMode === 'cycling' ? 15 : 30
        const estimatedMin = (distHaversine / avgSpeedKmh) * 60
        setEtaMinutes(estimatedMin > 0 ? estimatedMin : null)
      }
    } catch (err) {
      logger.error(err, 'Erreur calcul ETA')
    } finally {
      if (mountedRef.current) setEtaLoading(false)
    }
  }, [computeETA, lastPosition, clientPosition, transportMode])

  // ----- Démarrer/arrêter le polling -----
  const startTracking = useCallback(() => {
    setIsTracking(true)
    setError(null)
    retryCountRef.current = 0
  }, [])

  const stopTracking = useCallback(() => {
    setIsTracking(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Retry
  const retry = useCallback(() => {
    retryCountRef.current = 0
    setError(null)
    refreshDelivery()
  }, [refreshDelivery])

  // Effet pour le polling automatique
  useEffect(() => {
    if (!isTracking || manualPolling) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    // Rafraîchir immédiatement
    refreshDelivery()

    // Puis lancer l'intervalle
    intervalRef.current = setInterval(() => {
      if (retryCountRef.current >= MAX_RETRY_COUNT) {
        // Trop d'erreurs, on arrête
        stopTracking()
        setError('Trop d\'erreurs consécutives. Veuillez réessayer plus tard.')
        return
      }
      refreshDelivery()
    }, pollingIntervalMs)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isTracking, manualPolling, pollingIntervalMs, refreshDelivery, stopTracking])

  // Nettoyage au démontage
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  // Recalculer l'ETA dès que la position ou le delivery change
  useEffect(() => {
    if (lastPosition && clientPosition && computeETA) {
      refreshETA()
    } else {
      setDistanceRemaining(null)
      setEtaMinutes(null)
    }
  }, [lastPosition, clientPosition, computeETA, refreshETA])

  // Si la position client n'est pas fournie ni disponible, on essaie de l'obtenir
  useEffect(() => {
    if (!propClientPosition && computeETA && isTracking && !autoClientPosition) {
      requestPosition() // demande la géolocalisation une fois
    }
  }, [propClientPosition, computeETA, isTracking, autoClientPosition, requestPosition])

  return useMemo(() => ({
    delivery,
    loading,
    error,
    lastPosition,
    distanceRemaining,
    etaMinutes,
    isTracking,
    startTracking,
    stopTracking,
    refreshDelivery,
    refreshETA,
    retry,
    lastUpdate,
  }), [delivery, loading, error, lastPosition, distanceRemaining, etaMinutes, isTracking, startTracking, stopTracking, refreshDelivery, refreshETA, retry, lastUpdate])
}

// Export par défaut pour la compatibilité
export default useDeliveryTracking