// lib/mapbox.ts
// ---------------------------------------------------------------------------
// Service Mapbox – Géocodage, itinéraires, optimisation de tournées
// Utilisé pour les livreurs, la recherche de points de retrait, etc.
// Version ultra‑premium – enrichie avec cache, validation, timeout, clustering.
// ---------------------------------------------------------------------------

import { z } from 'zod'

const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

// ---------- Types partagés ----------
export interface Coordinates {
  latitude: number
  longitude: number
}

export interface Address {
  fullAddress: string
  street?: string
  number?: string
  neighborhood?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
}

export interface Waypoint {
  coordinates: Coordinates
  label?: string
}

export interface DirectionsResult {
  distanceKm: number
  durationMin: number
  geometry: Coordinates[] // tableau [lat, lng] ordonné
  steps: DirectionsStep[]
}

export interface DirectionsStep {
  instruction: string
  distanceKm: number
  durationMin: number
}

export interface OptimizedRouteResult {
  waypoints: Coordinates[]       // dans l'ordre optimal (départ + étapes + arrivée)
  distanceKm: number
  durationMin: number
  geometry: Coordinates[]
}

export interface TravelTimeMatrixResult {
  durations: number[][]   // durée en secondes entre chaque paire (i -> j)
  distances: number[][]   // distance en mètres
}

// ---------- Validation Zod ----------
const coordSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

// ---------- Helpers ----------
const apiBase = 'https://api.mapbox.com'

function buildUrl(endpoint: string, params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams()
  searchParams.set('access_token', MAPBOX_ACCESS_TOKEN)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, String(value))
  })
  return `${apiBase}/${endpoint}?${searchParams.toString()}`
}

// ---------- Cache mémoire (TTL) ----------
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() })
}

// ---------- Rate limiter (simple en mémoire) ----------
const requestTimestamps: number[] = []
const MAX_REQUESTS_PER_MIN = 120

function checkRateLimit(): boolean {
  const now = Date.now()
  const oneMinAgo = now - 60_000
  while (requestTimestamps.length && requestTimestamps[0] < oneMinAgo) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MIN) {
    return false
  }
  requestTimestamps.push(now)
  return true
}

// ---------- 1. Géocodage direct (adresse -> coordonnées) ----------
export async function geocodeForward(query: string): Promise<Address & Coordinates> {
  if (!MAPBOX_ACCESS_TOKEN) throw new Error('Token Mapbox manquant')
  if (!checkRateLimit()) throw new Error('Trop de requêtes (rate limit)')

  const cacheKey = `geo:${query}`
  const cached = getCached<Address & Coordinates>(cacheKey)
  if (cached) return cached

  const url = buildUrl('geocoding/v5/mapbox.places/' + encodeURIComponent(query) + '.json', {
    limit: 1,
    language: 'fr',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error('Erreur lors du géocodage')

    const data = await response.json()
    if (!data.features || data.features.length === 0) {
      throw new Error('Aucun résultat trouvé pour cette adresse')
    }

    const feature = data.features[0]
    const [lng, lat] = feature.center
    const place = feature.place_name

    const context = feature.context || []
    const address: Address = {
      fullAddress: place,
      street: feature.address || undefined,
      number: feature.address ? feature.text : undefined,
      neighborhood: context.find((c: any) => c.id.startsWith('neighborhood'))?.text,
      city: context.find((c: any) => c.id.startsWith('place'))?.text,
      state: context.find((c: any) => c.id.startsWith('region'))?.text,
      country: context.find((c: any) => c.id.startsWith('country'))?.text,
      postalCode: context.find((c: any) => c.id.startsWith('postcode'))?.text,
    }

    const result: Address & Coordinates = {
      ...address,
      latitude: lat,
      longitude: lng,
    }
    setCache(cacheKey, result)
    return result
  } finally {
    clearTimeout(timeout)
  }
}

// ---------- 2. Géocodage inverse (coordonnées -> adresse) ----------
export async function geocodeReverse(coordinates: Coordinates): Promise<Address> {
  if (!MAPBOX_ACCESS_TOKEN) throw new Error('Token Mapbox manquant')
  coordSchema.parse(coordinates)
  if (!checkRateLimit()) throw new Error('Trop de requêtes (rate limit)')

  const cacheKey = `rev:${coordinates.latitude},${coordinates.longitude}`
  const cached = getCached<Address>(cacheKey)
  if (cached) return cached

  const url = buildUrl(
    `geocoding/v5/mapbox.places/${coordinates.longitude},${coordinates.latitude}.json`,
    { limit: 1, language: 'fr' }
  )

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error('Erreur lors du géocodage inverse')

    const data = await response.json()
    if (!data.features || data.features.length === 0) {
      throw new Error('Aucune adresse trouvée pour ces coordonnées')
    }

    const feature = data.features[0]
    const context = feature.context || []
    const address: Address = {
      fullAddress: feature.place_name,
      street: feature.address || undefined,
      number: feature.address ? feature.text : undefined,
      neighborhood: context.find((c: any) => c.id.startsWith('neighborhood'))?.text,
      city: context.find((c: any) => c.id.startsWith('place'))?.text,
      state: context.find((c: any) => c.id.startsWith('region'))?.text,
      country: context.find((c: any) => c.id.startsWith('country'))?.text,
      postalCode: context.find((c: any) => c.id.startsWith('postcode'))?.text,
    }
    setCache(cacheKey, address)
    return address
  } finally {
    clearTimeout(timeout)
  }
}

// ---------- 3. Itinéraire standard (avec support multi‑mode) ----------
export async function getDirections(
  origin: Coordinates,
  destination: Coordinates,
  waypoints: Coordinates[] = [],
  mode: 'driving' | 'walking' | 'cycling' = 'driving',
): Promise<DirectionsResult> {
  if (!MAPBOX_ACCESS_TOKEN) throw new Error('Token Mapbox manquant')
  coordSchema.parse(origin)
  coordSchema.parse(destination)
  if (!checkRateLimit()) throw new Error('Trop de requêtes (rate limit)')

  const wp = waypoints.filter(w => {
    try { coordSchema.parse(w); return true } catch { return false }
  })

  const allCoords = [origin, ...wp, destination]
    .map(c => `${c.longitude},${c.latitude}`)
    .join(';')

  const cacheKey = `dir:${allCoords}:${mode}`
  const cached = getCached<DirectionsResult>(cacheKey)
  if (cached) return cached

  const url = buildUrl(`directions/v5/mapbox/${mode}/${allCoords}`, {
    geometries: 'geojson',
    steps: 'true',
    overview: 'full',
    language: 'fr',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error('Erreur lors du calcul de l’itinéraire')

    const data = await response.json()
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('Aucun itinéraire trouvé')
    }

    const route = data.routes[0]
    const distanceKm = route.distance / 1000
    const durationMin = route.duration / 60
    const geometry: Coordinates[] = route.geometry.coordinates.map(
      (c: number[]) => ({ latitude: c[1], longitude: c[0] })
    )

    const steps: DirectionsStep[] = (route.legs?.[0]?.steps || []).map((step: any) => ({
      instruction: step.maneuver.instruction,
      distanceKm: step.distance / 1000,
      durationMin: step.duration / 60,
    }))

    const result: DirectionsResult = { distanceKm, durationMin, geometry, steps }
    setCache(cacheKey, result)
    return result
  } finally {
    clearTimeout(timeout)
  }
}

// ---------- 4. Itinéraire optimisé (TSP via Mapbox Optimization API) ----------
export async function getOptimizedRoute(
  origin: Coordinates,
  destination: Coordinates,
  waypoints: Waypoint[],
): Promise<OptimizedRouteResult> {
  if (!MAPBOX_ACCESS_TOKEN) throw new Error('Token Mapbox manquant')
  coordSchema.parse(origin)
  coordSchema.parse(destination)
  if (!checkRateLimit()) throw new Error('Trop de requêtes (rate limit)')

  if (waypoints.length === 0) {
    const simple = await getDirections(origin, destination)
    return {
      waypoints: [origin, destination],
      distanceKm: simple.distanceKm,
      durationMin: simple.durationMin,
      geometry: simple.geometry,
    }
  }

  const allPoints = [origin, ...waypoints.map(w => w.coordinates), destination]
  // Cache basé sur l'ensemble des coordonnées
  const cacheKey = `opt:${allPoints.map(c => `${c.latitude},${c.longitude}`).join('|')}`
  const cached = getCached<OptimizedRouteResult>(cacheKey)
  if (cached) return cached

  const coordinates = allPoints.map(c => [c.longitude, c.latitude])

  const body = {
    version: 1,
    locations: coordinates.map((c, i) => ({ coordinates: c })),
    sources: [0],
    destinations: [coordinates.length - 1],
  }

  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving?access_token=${MAPBOX_ACCESS_TOKEN}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) throw new Error('Erreur lors de l’optimisation de tournée')

    const data = await response.json()
    if (!data.trips || data.trips.length === 0) {
      throw new Error('Aucune tournée trouvée')
    }

    const trip = data.trips[0]
    const geometry: Coordinates[] = trip.geometry.coordinates.map(
      (c: number[]) => ({ latitude: c[1], longitude: c[0] })
    )

    // Reconstituer l'ordre optimisé
    let waypointsOrdered: Coordinates[] = []
    if (trip.legs) {
      // L'ordre des jambes donne l'ordre de visite
      waypointsOrdered = trip.legs.map((_: any, idx: number) => {
        const coords = coordinates[idx + 1] // le premier est le départ
        return { latitude: coords[1], longitude: coords[0] }
      })
    } else {
      waypointsOrdered = coordinates.slice(1).map(c => ({ latitude: c[1], longitude: c[0] }))
    }

    const result: OptimizedRouteResult = {
      waypoints: [origin, ...waypointsOrdered],
      distanceKm: trip.distance / 1000,
      durationMin: trip.duration / 60,
      geometry,
    }
    setCache(cacheKey, result)
    return result
  } finally {
    clearTimeout(timeout)
  }
}

// ---------- 5. Matrice de temps de trajet ----------
export async function getTravelTimeMatrix(
  locations: Coordinates[]
): Promise<TravelTimeMatrixResult> {
  if (!MAPBOX_ACCESS_TOKEN) throw new Error('Token Mapbox manquant')
  if (locations.length < 2) throw new Error('Au moins 2 points sont nécessaires')
  if (!checkRateLimit()) throw new Error('Trop de requêtes (rate limit)')

  locations.forEach(c => coordSchema.parse(c))

  const coordinates = locations
    .map(c => `${c.longitude},${c.latitude}`)
    .join(';')

  const cacheKey = `mat:${coordinates}`
  const cached = getCached<TravelTimeMatrixResult>(cacheKey)
  if (cached) return cached

  const url = buildUrl(`directions-matrix/v1/mapbox/driving/${coordinates}`, {
    annotations: 'duration,distance',
    sources: 'all',
    destinations: 'all',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error('Erreur lors du calcul de la matrice')

    const data = await response.json()
    if (data.code !== 'Ok' || !data.durations) {
      throw new Error('Matrice de temps indisponible')
    }

    const result: TravelTimeMatrixResult = {
      durations: data.durations,
      distances: data.distances,
    }
    setCache(cacheKey, result)
    return result
  } finally {
    clearTimeout(timeout)
  }
}

// ---------- 6. Vérification de zone de service ----------
export async function isPointInServiceArea(
  point: Coordinates,
  serviceCenter: Coordinates,
  maxDurationMin: number = 60
): Promise<{ inArea: boolean; durationMin: number }> {
  try {
    const { durationMin } = await getDirections(serviceCenter, point)
    return { inArea: durationMin <= maxDurationMin, durationMin }
  } catch {
    return { inArea: false, durationMin: -1 }
  }
}

// ---------- 7. Clusterisation légère (utile pour des marqueurs) ----------
export function clusterPoints(
  points: Coordinates[],
  clusterRadius: number = 80
): { latitude: number; longitude: number; count: number }[] {
  const clusters: { latitude: number; longitude: number; count: number }[] = []
  const visited = new Array(points.length).fill(false)

  for (let i = 0; i < points.length; i++) {
    if (visited[i]) continue
    const cluster: Coordinates[] = [points[i]]
    visited[i] = true
    for (let j = i + 1; j < points.length; j++) {
      if (visited[j]) continue
      const d = haversine(points[i].latitude, points[i].longitude, points[j].latitude, points[j].longitude)
      if (d * 1000 < clusterRadius) {
        cluster.push(points[j])
        visited[j] = true
      }
    }
    const avgLat = cluster.reduce((s, c) => s + c.latitude, 0) / cluster.length
    const avgLng = cluster.reduce((s, c) => s + c.longitude, 0) / cluster.length
    clusters.push({ latitude: avgLat, longitude: avgLng, count: cluster.length })
  }
  return clusters
}

// Haversine locale (évite dépendance circulaire)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}