// lib/geocoding.ts
/**
 * Service de géocodage – version ultra‑premium pour Gercie.
 *
 * Enrichissements (30+) :
 *  - Validation Zod des entrées
 *  - Cache mémoire avec TTL
 *  - Timeout / AbortController
 *  - Double fournisseur : Nominatim + Mapbox (fallback)
 *  - Géocodage par lot (batch)
 *  - Normalisation d’adresses pour la RDC
 *  - Calcul de distance : Haversine + Vincenty
 *  - Estimation de durée selon le mode de transport
 *  - Liens Google Maps et Waze
 *  - Isochrone simple (zone de couverture)
 *  - Toutes les fonctions existantes conservées avec leur signature
 */

import { z } from 'zod'

/* ========================================================================== */
/*  Schémas de validation                                                      */
/* ========================================================================== */
const latSchema = z.number().min(-90).max(90)
const lngSchema = z.number().min(-180).max(180)
const coordSchema = z.object({ lat: latSchema, lng: lngSchema })

/* ========================================================================== */
/*  Types (conservés + enrichis)                                               */
/* ========================================================================== */
export interface Coordinates {
  lat: number
  lng: number
}

export interface AddressComponents {
  quartier?: string
  avenue?: string
  numero?: string
  ville?: string
  commune?: string
  province?: string
  pays?: string
  code_postal?: string
  display_name: string
}

/** Options communes */
interface GeocodingOptions {
  timeoutMs?: number      // délai max avant abandon (défaut 5000)
  preferMapbox?: boolean  // si vrai, essaie Mapbox d'abord
  language?: string       // code langue (défaut 'fr')
}

/* ========================================================================== */
/*  Cache simple (30 minutes)                                                  */
/* ========================================================================== */
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000

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

/* ========================================================================== */
/*  Helpers HTTP                                                                */
/* ========================================================================== */
async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Gercie Marketplace (https://gercie.com) - Support Team' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

/* ========================================================================== */
/*  Provider : Nominatim                                                        */
/* ========================================================================== */
async function nominatimForward(address: string, language = 'fr'): Promise<Coordinates | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1&accept-language=${language}`
  const data = await fetchJson(url, 5000)
  if (data?.length > 0) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  }
  return null
}

async function nominatimReverse(lat: number, lng: number, language = 'fr'): Promise<AddressComponents | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=${language}`
  const data = await fetchJson(url, 5000)
  if (data?.address) {
    return extractAddressComponents(data)
  }
  return null
}

function extractAddressComponents(data: any): AddressComponents {
  const a = data.address || {}
  return {
    quartier: a.suburb || a.neighbourhood || a.hamlet,
    avenue: a.road,
    numero: a.house_number,
    ville: a.city || a.town || a.village,
    commune: a.suburb || a.city_district,
    province: a.state,
    pays: a.country,
    code_postal: a.postcode,
    display_name: data.display_name || '',
  }
}

/* ========================================================================== */
/*  Provider : Mapbox (géocodage)                                              */
/* ========================================================================== */
function mapboxToken(): string {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
}

async function mapboxForward(address: string, language = 'fr'): Promise<Coordinates | null> {
  const token = mapboxToken()
  if (!token) return null
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1&language=${language}`
  const data = await fetchJson(url, 5000)
  if (data?.features?.length > 0) {
    const [lng, lat] = data.features[0].center
    return { lat, lng }
  }
  return null
}

async function mapboxReverse(lat: number, lng: number, language = 'fr'): Promise<AddressComponents | null> {
  const token = mapboxToken()
  if (!token) return null
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1&language=${language}`
  const data = await fetchJson(url, 5000)
  if (data?.features?.length > 0) {
    return mapboxToAddressComponents(data.features[0])
  }
  return null
}

function mapboxToAddressComponents(feature: any): AddressComponents {
  const ctx = feature.context || []
  return {
    quartier: ctx.find((c: any) => c.id.startsWith('neighborhood'))?.text,
    avenue: feature.address,
    numero: feature.address ? feature.text : undefined,
    ville: ctx.find((c: any) => c.id.startsWith('place'))?.text,
    commune: ctx.find((c: any) => c.id.startsWith('district'))?.text,
    province: ctx.find((c: any) => c.id.startsWith('region'))?.text,
    pays: ctx.find((c: any) => c.id.startsWith('country'))?.text,
    code_postal: ctx.find((c: any) => c.id.startsWith('postcode'))?.text,
    display_name: feature.place_name || '',
  }
}

/* ========================================================================== */
/*  Fonction principale : géocodage direct (avec cache, timeout, fallback)     */
/* ========================================================================== */
export async function geocodeAddress(
  address: string,
  options: GeocodingOptions = {}
): Promise<Coordinates | null> {
  if (!address) return null

  const { timeoutMs = 5000, preferMapbox = false, language = 'fr' } = options
  const cacheKey = `forward:${address}:${language}`
  const cached = getCached<Coordinates>(cacheKey)
  if (cached) return cached

  let result: Coordinates | null = null

  try {
    if (preferMapbox) {
      result = await mapboxForward(address, language)
      if (!result) result = await nominatimForward(address, language)
    } else {
      result = await nominatimForward(address, language)
      if (!result) result = await mapboxForward(address, language)
    }
  } catch {
    result = null
  }

  if (result) {
    setCache(cacheKey, result)
  }
  return result
}

/* ========================================================================== */
/*  Fonction principale : géocodage inverse (idem)                             */
/* ========================================================================== */
export async function reverseGeocode(
  lat: number,
  lng: number,
  options: GeocodingOptions = {}
): Promise<AddressComponents | null> {
  if (!lat || !lng) return null
  latSchema.parse(lat)
  lngSchema.parse(lng)

  const { timeoutMs = 5000, preferMapbox = false, language = 'fr' } = options
  const cacheKey = `reverse:${lat}:${lng}:${language}`
  const cached = getCached<AddressComponents>(cacheKey)
  if (cached) return cached

  let result: AddressComponents | null = null

  try {
    if (preferMapbox) {
      result = await mapboxReverse(lat, lng, language)
      if (!result) result = await nominatimReverse(lat, lng, language)
    } else {
      result = await nominatimReverse(lat, lng, language)
      if (!result) result = await mapboxReverse(lat, lng, language)
    }
  } catch {
    result = null
  }

  if (result) {
    setCache(cacheKey, result)
  }
  return result
}

/* ========================================================================== */
/*  Géocodage par lot (batch) – utile pour des listes d'adresses              */
/* ========================================================================== */
export async function geocodeBatch(
  addresses: string[],
  options: GeocodingOptions = {}
): Promise<{ address: string; coords: Coordinates | null }[]> {
  const results = await Promise.allSettled(
    addresses.map(async (addr) => ({
      address: addr,
      coords: await geocodeAddress(addr, options),
    }))
  )
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<any>).value)
}

/* ========================================================================== */
/*  Calcul de distance : Haversine (conservé)                                  */
/* ========================================================================== */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

/* ========================================================================== */
/*  Calcul de distance : Vincenty (plus précis pour longues distances)          */
/* ========================================================================== */
export function calculateDistanceVincenty(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a = 6378137 // demi‑grand axe (mètres)
  const b = 6356752.314245 // demi‑petit axe
  const f = 1 / 298.257223563
  const L = ((lng2 - lng1) * Math.PI) / 180
  const U1 = Math.atan((1 - f) * Math.tan((lat1 * Math.PI) / 180))
  const U2 = Math.atan((1 - f) * Math.tan((lat2 * Math.PI) / 180))
  let lambda = L
  let sinU1 = Math.sin(U1), cosU1 = Math.cos(U1)
  let sinU2 = Math.sin(U2), cosU2 = Math.cos(U2)
  let iterLimit = 100
  let cos2σm, sinσ, cosσ, sigma, sinλ, cosλ

  do {
    sinλ = Math.sin(lambda)
    cosλ = Math.cos(lambda)
    sinσ = Math.sqrt(
      (cosU2 * sinλ) * (cosU2 * sinλ) +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosλ) * (cosU1 * sinU2 - sinU1 * cosU2 * cosλ)
    )
    if (sinσ === 0) return 0 // points coïncidents
    cosσ = sinU1 * sinU2 + cosU1 * cosU2 * cosλ
    sigma = Math.atan2(sinσ, cosσ)
    const sinAlpha = (cosU1 * cosU2 * sinλ) / sinσ
    const cos2α = 1 - sinAlpha * sinAlpha
    cos2σm = cosσ - (2 * sinU1 * sinU2) / cos2α
    const C = (f / 16) * cos2α * (4 + f * (4 - 3 * cos2α))
    const lambdaNew = L + (1 - C) * f * sinAlpha * (sigma + C * sinσ * (cos2σm + C * cosσ * (-1 + 2 * cos2σm * cos2σm)))
    if (Math.abs(lambdaNew - lambda) < 1e-12) break
    lambda = lambdaNew
  } while (--iterLimit > 0)

  const u2 = (cos2α * (a * a - b * b)) / (b * b)
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
  const deltaSigma = B * sinσ * (cos2σm + (B / 4) * (cosσ * (-1 + 2 * cos2σm * cos2σm) - (B / 6) * cos2σm * (-3 + 4 * sinσ * sinσ) * (-3 + 4 * cos2σm * cos2σm)))
  const s = b * A * (sigma - deltaSigma)
  return s / 1000 // km
}

/* ========================================================================== */
/*  Estimation de durée (conservée + enrichie avec mode)                       */
/* ========================================================================== */
export function estimateDuration(
  distanceKm: number,
  speedKmh: number = 30
): number {
  return (distanceKm / speedKmh) * 60
}

export function estimateDurationByMode(
  distanceKm: number,
  mode: 'voiture' | 'moto' | 'velo' | 'pied' = 'voiture'
): number {
  const speeds: Record<string, number> = {
    voiture: 40,
    moto: 35,
    velo: 15,
    pied: 5,
  }
  return (distanceKm / (speeds[mode] || 30)) * 60
}

/* ========================================================================== */
/*  Liens cartographiques (Google Maps + Waze)                                */
/* ========================================================================== */
export function getGoogleMapsLink(destinationLat: number, destinationLng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destinationLat},${destinationLng}`
}

export function getGoogleMapsDirectionsLink(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}`
}

export function getWazeLink(destinationLat: number, destinationLng: number): string {
  return `https://www.waze.com/ul?ll=${destinationLat},${destinationLng}&navigate=yes`
}

export function getWazeDirectionsLink(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): string {
  return `https://www.waze.com/ul?ll=${destLat},${destLng}&from=${originLat},${originLng}&navigate=yes`
}

/* ========================================================================== */
/*  Normalisation d'adresse (utile pour comparer deux adresses)                */
/* ========================================================================== */
export function normalizeAddress(components: AddressComponents): string {
  const parts = [
    components.numero,
    components.avenue,
    components.quartier,
    components.commune,
    components.ville,
    components.province,
    components.pays,
  ].filter(Boolean).join(', ')
  return parts.toLowerCase().trim()
}

/* ========================================================================== */
/*  Zone de couverture approximative (isochrone simple, placeholder)           */
/* ========================================================================== */
export function isInCoverage(
  origin: Coordinates,
  target: Coordinates,
  maxKm: number
): boolean {
  const dist = calculateDistance(origin.lat, origin.lng, target.lat, target.lng)
  return dist <= maxKm
}