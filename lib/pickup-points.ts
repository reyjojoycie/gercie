// lib/pickup-points.ts
// ============================================================================
// Types et helpers pour les points de retrait / relais colis.
// Sans wallet / portefeuille / solde / retrait d'argent.
// ============================================================================

export interface PickupPoint {
  id: number
  nom: string
  adresse: string
  telephone: string | null
  email: string | null
  site_web: string | null
  whatsapp: string | null
  commune_id: number | null
  province_nom: string | null
  ville_nom: string | null
  quartier: string | null
  avenue: string | null
  numero: string | null
  code_postal: string | null
  reference: string | null
  latitude: number | null
  longitude: number | null
  horaires: string | null
  contact_nom: string | null
  type_etablissement: string | null
  photo_url: string | null
  points_de_repere: string | null
  instructions_retrait: string | null
  est_actif: boolean
  est_partenaire_verifie: boolean
  note_moyenne: number | null
  capacite: number | null
  delai_moyen_heures: number | null
  metadata: Record<string, any>
  sort_order: number
  created_at: string
  updated_at?: string | null
  distance?: number
}

export interface PickupPointStats {
  total: number
  actifs: number
  inactifs: number
  verifies: number
  nonVerifies: number
  avecCoords: number
  sansCoords: number
  villes: number
  avgNote: string
  totalCapacite: number
  avgDelaiHeures: string
}

export interface PickupPointFilters {
  search: string
  status: 'all' | 'active' | 'inactive'
  verified: 'all' | 'yes' | 'no'
  city: string
  type: string
  note: 'all' | '4+' | '3+' | '<3'
  coords: 'all' | 'with' | 'without'
}

export interface PickupPointSort {
  column:
    | 'nom'
    | 'ville'
    | 'note'
    | 'created_at'
    | 'distance'
    | 'sort_order'
    | 'capacite'
    | 'delai_moyen_heures'
  direction: 'asc' | 'desc'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str ? str : null
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const cleaned = value
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')

    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }

  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function toNum(value: unknown, fallback = 0): number {
  return parseNumber(value) ?? fallback
}

export function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'oui', 'yes', 'on', 'actif', 'active', '1'].includes(str)) {
    return true
  }

  if (['false', 'non', 'no', 'off', 'inactif', 'inactive', '0'].includes(str)) {
    return false
  }

  return fallback
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function normalizePickupPoint(raw: any, index = 0): PickupPoint | null {
  const id = parseNumber(raw?.id)
  if (id === null) return null

  const nom = textOrNull(raw?.nom ?? raw?.name)
  if (!nom) return null

  const adresse = textOrNull(raw?.adresse ?? raw?.address)
  if (!adresse) return null

  const latitude = parseNumber(raw?.latitude ?? raw?.lat)
  const longitude = parseNumber(raw?.longitude ?? raw?.lng ?? raw?.lon)

  const note_moyenne = parseNumber(raw?.note_moyenne ?? raw?.rating)
  const capacite = parseNumber(raw?.capacite ?? raw?.capacity)
  const delai_moyen_heures = parseNumber(
    raw?.delai_moyen_heures ?? raw?.delay_hours ?? raw?.delai
  )

  const metadata =
    raw?.metadata && typeof raw.metadata === 'object'
      ? raw.metadata
      : {}

  return {
    id,
    nom,
    adresse,
    telephone: textOrNull(raw?.telephone ?? raw?.phone),
    email: textOrNull(raw?.email),
    site_web: textOrNull(raw?.site_web ?? raw?.website),
    whatsapp: textOrNull(raw?.whatsapp),
    commune_id: parseNumber(raw?.commune_id),
    province_nom: textOrNull(raw?.province_nom ?? raw?.province),
    ville_nom: textOrNull(raw?.ville_nom ?? raw?.ville ?? raw?.city),
    quartier: textOrNull(raw?.quartier),
    avenue: textOrNull(raw?.avenue),
    numero: textOrNull(raw?.numero),
    code_postal: textOrNull(raw?.code_postal ?? raw?.postal_code),
    reference: textOrNull(raw?.reference),
    latitude:
      latitude !== null && latitude >= -90 && latitude <= 90 ? latitude : null,
    longitude:
      longitude !== null && longitude >= -180 && longitude <= 180
        ? longitude
        : null,
    horaires: textOrNull(raw?.horaires ?? raw?.hours),
    contact_nom: textOrNull(raw?.contact_nom ?? raw?.contact),
    type_etablissement: textOrNull(
      raw?.type_etablissement ?? raw?.type ?? raw?.establishment_type
    ),
    photo_url: textOrNull(raw?.photo_url ?? raw?.photo ?? raw?.image_url),
    points_de_repere: textOrNull(
      raw?.points_de_repere ?? raw?.landmarks
    ),
    instructions_retrait: textOrNull(
      raw?.instructions_retrait ?? raw?.pickup_instructions
    ),
    est_actif: toBool(raw?.est_actif ?? raw?.active ?? raw?.is_active, true),
    est_partenaire_verifie: toBool(
      raw?.est_partenaire_verifie ?? raw?.verified ?? raw?.is_verified,
      false
    ),
    note_moyenne:
      note_moyenne !== null ? clamp(note_moyenne, 0, 5) : null,
    capacite: capacite !== null && capacite >= 0 ? Math.round(capacite) : null,
    delai_moyen_heures:
      delai_moyen_heures !== null && delai_moyen_heures >= 0
        ? Math.round(delai_moyen_heures)
        : null,
    metadata,
    sort_order: toNum(raw?.sort_order, index),
    created_at: textOrNull(raw?.created_at) || new Date().toISOString(),
    updated_at: textOrNull(raw?.updated_at),
  }
}

export function computePickupStats(points: PickupPoint[]): PickupPointStats {
  const list = Array.isArray(points) ? points : []

  const withNote = list.filter((p) => p.note_moyenne !== null)
  const withCapacity = list.filter((p) => p.capacite !== null)
  const withDelay = list.filter((p) => p.delai_moyen_heures !== null)
  const cities = new Set(
    list.map((p) => textOrNull(p.ville_nom)).filter(Boolean) as string[]
  )

  const avgNote =
    withNote.length > 0
      ? (
          withNote.reduce((acc, p) => acc + toNum(p.note_moyenne, 0), 0) /
          withNote.length
        ).toFixed(1)
      : '—'

  const avgDelaiHeures =
    withDelay.length > 0
      ? (
          withDelay.reduce(
            (acc, p) => acc + toNum(p.delai_moyen_heures, 0),
            0
          ) / withDelay.length
        ).toFixed(0)
      : '—'

  return {
    total: list.length,
    actifs: list.filter((p) => p.est_actif).length,
    inactifs: list.filter((p) => !p.est_actif).length,
    verifies: list.filter((p) => p.est_partenaire_verifie).length,
    nonVerifies: list.filter((p) => !p.est_partenaire_verifie).length,
    avecCoords: list.filter((p) => p.latitude !== null && p.longitude !== null)
      .length,
    sansCoords: list.filter((p) => p.latitude === null || p.longitude === null)
      .length,
    villes: cities.size,
    avgNote,
    totalCapacite: withCapacity.reduce(
      (acc, p) => acc + toNum(p.capacite, 0),
      0
    ),
    avgDelaiHeures,
  }
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

export function addDistance(
  points: PickupPoint[],
  userLocation: { lat: number; lng: number } | null
): PickupPoint[] {
  if (!userLocation) return points

  return points.map((point) => {
    if (point.latitude === null || point.longitude === null) {
      return { ...point, distance: undefined }
    }

    const distance = haversineDistanceKm(
      userLocation.lat,
      userLocation.lng,
      point.latitude,
      point.longitude
    )

    return { ...point, distance: Number(distance.toFixed(2)) }
  })
}

export function buildMapsUrl(point: PickupPoint): string {
  if (point.latitude !== null && point.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`
  }

  const query = encodeURIComponent(
    `${point.nom}, ${point.adresse}, ${point.ville_nom || ''}`
  )

  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

export function buildDirectionsUrl(point: PickupPoint): string {
  if (point.latitude !== null && point.longitude !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`
  }

  const query = encodeURIComponent(
    `${point.nom}, ${point.adresse}, ${point.ville_nom || ''}`
  )

  return `https://www.google.com/maps/dir/?api=1&destination=${query}`
}

export function buildQrUrl(point: PickupPoint): string {
  const data = buildMapsUrl(point)
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data)}`
}

export function buildOsmEmbedUrl(point: PickupPoint): string | null {
  if (point.latitude === null || point.longitude === null) return null

  const delta = 0.01
  const bbox = `${point.longitude - delta},${point.latitude - delta},${point.longitude + delta},${point.latitude + delta}`

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${point.latitude},${point.longitude}`
}

export function escapeCsv(value: unknown): string {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

export function pickupPointsToCsv(points: PickupPoint[]): string {
  const headers = [
    'id',
    'nom',
    'adresse',
    'telephone',
    'email',
    'ville',
    'province',
    'quartier',
    'avenue',
    'numero',
    'reference',
    'latitude',
    'longitude',
    'horaires',
    'contact',
    'type',
    'actif',
    'verifie',
    'note',
    'capacite',
    'delai_heures',
    'photo_url',
    'points_de_repere',
    'instructions_retrait',
  ]

  const rows = points.map((point) =>
    [
      point.id,
      point.nom,
      point.adresse,
      point.telephone || '',
      point.email || '',
      point.ville_nom || '',
      point.province_nom || '',
      point.quartier || '',
      point.avenue || '',
      point.numero || '',
      point.reference || '',
      point.latitude ?? '',
      point.longitude ?? '',
      point.horaires || '',
      point.contact_nom || '',
      point.type_etablissement || '',
      point.est_actif ? 'Oui' : 'Non',
      point.est_partenaire_verifie ? 'Oui' : 'Non',
      point.note_moyenne ?? '',
      point.capacite ?? '',
      point.delai_moyen_heures ?? '',
      point.photo_url || '',
      point.points_de_repere || '',
      point.instructions_retrait || '',
    ]
      .map(escapeCsv)
      .join(',')
  )

  return [headers.join(','), ...rows].join('\n')
}