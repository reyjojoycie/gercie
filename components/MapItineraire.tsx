// components/MapItineraire.tsx
'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { useTheme } from '@/contexts/ThemeContext'
import { calculerItineraire, type Point as ItinerairePoint } from '@/lib/itineraire'
import { geocodeAddress } from '@/lib/geocoding'
import { getDirections, getOptimizedRoute, type Coordinates } from '@/lib/mapbox'
import {
  MapPin, Navigation, Crosshair, Maximize2, Minus, Plus, Route, AlertTriangle,
  Clock, ArrowRight, ChevronUp, ChevronDown, X, Layers, RefreshCw,
} from 'lucide-react'

// Correction Leaflet pour SSR
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  })
}

export interface MapItinerairePoint {
  id: string
  lat: number
  lng: number
  label: string
  type?: 'depart' | 'etape' | 'arrivee'
  description?: string
}

interface MapItineraireProps {
  points?: MapItinerairePoint[]
  originAddress?: string
  destinationAddress?: string
  waypointAddresses?: string[]
  optimize?: boolean
  height?: string
  className?: string
  onRouteReady?: (distanceKm: number, durationMin: number) => void
  interactive?: boolean
  hideControls?: boolean
}

/* ========================================================================== */
/*  Icônes personnalisées                                                     */
/* ========================================================================== */

const departIcon = L.divIcon({
  html: `<div style="background:#c99a14; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.4); font-size:14px;">📍</div>`,
  iconSize: [28, 28],
})

const etapeIcon = L.divIcon({
  html: `<div style="background:#8b5cf6; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.4); font-size:12px; color:white; font-weight:bold;">•</div>`,
  iconSize: [24, 24],
})

const arriveeIcon = L.divIcon({
  html: `<div style="background:#dc3f62; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.4); font-size:14px;">🏁</div>`,
  iconSize: [28, 28],
})

/* ========================================================================== */
/*  Sous‑composant : contrôleur de carte + nettoyage                           */
/* ========================================================================== */

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom, { animate: true })
  }, [center, zoom, map])
  return null
}

// Composant interne pour nettoyer la carte au démontage
function MapCleaner() {
  const map = useMap()
  useEffect(() => {
    return () => {
      // Supprimer complètement la carte pour éviter les conflits
      if (map) {
        map.remove()
      }
    }
  }, [map])
  return null
}

/* ========================================================================== */
/*  Composant interne (chargé dynamiquement)                                   */
/* ========================================================================== */

function MapItineraireContent({
  points: propPoints,
  originAddress,
  destinationAddress,
  waypointAddresses,
  optimize = false,
  height = '450px',
  className,
  onRouteReady,
  interactive = false,
  hideControls = false,
}: MapItineraireProps) {
  const { theme } = useTheme()

  const [points, setPoints] = useState<MapItinerairePoint[]>(propPoints || [])
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState('')

  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [durationMin, setDurationMin] = useState<number | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [optimizedOrder, setOptimizedOrder] = useState<number[] | null>(null)

  const [mapCenter, setMapCenter] = useState<[number, number]>([-4.4419, 15.2663])
  const [zoom, setZoom] = useState(12)
  const [fullscreen, setFullscreen] = useState(false)

  // Géocodage depuis adresses
  useEffect(() => {
    if (propPoints) {
      setPoints(propPoints)
      return
    }
    if (!originAddress || !destinationAddress) return
    const fetchAddresses = async () => {
      setGeocoding(true)
      setGeocodeError('')
      try {
        const origin = await geocodeAddress(originAddress)
        const dest = await geocodeAddress(destinationAddress)
        if (!origin || !dest) {
          setGeocodeError('Adresse introuvable')
          setGeocoding(false)
          return
        }
        const pts: MapItinerairePoint[] = [
          { id: 'depart', lat: origin.lat, lng: origin.lng, label: 'Départ', type: 'depart' },
        ]
        if (waypointAddresses?.length) {
          for (let i = 0; i < waypointAddresses.length; i++) {
            const wp = await geocodeAddress(waypointAddresses[i])
            if (wp) {
              pts.push({ id: `etape-${i}`, lat: wp.lat, lng: wp.lng, label: `Étape ${i + 1}`, type: 'etape' })
            }
          }
        }
        pts.push({ id: 'arrivee', lat: dest.lat, lng: dest.lng, label: 'Arrivée', type: 'arrivee' })
        setPoints(pts)
      } catch (err) {
        setGeocodeError('Erreur lors du géocodage')
      } finally {
        setGeocoding(false)
      }
    }
    fetchAddresses()
  }, [originAddress, destinationAddress, waypointAddresses, propPoints])

  // Centrage automatique sur l'ensemble des points
  useEffect(() => {
    if (points.length === 0) return
    const lats = points.map(p => p.lat)
    const lngs = points.map(p => p.lng)
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
    setMapCenter([centerLat, centerLng])
    const latExtent = Math.max(...lats) - Math.min(...lats)
    const lngExtent = Math.max(...lngs) - Math.min(...lngs)
    const maxExtent = Math.max(latExtent, lngExtent)
    if (maxExtent < 0.05) setZoom(15)
    else if (maxExtent < 0.2) setZoom(13)
    else setZoom(11)
  }, [points])

  // Calcul de l'itinéraire
  useEffect(() => {
    if (points.length < 2) return
    const calculate = async () => {
      setLoadingRoute(true)
      setRouteError('')
      try {
        const origin = points[0]
        const destination = points[points.length - 1]
        const intermediates = points.slice(1, -1).map(p => ({ coordinates: { latitude: p.lat, longitude: p.lng }, label: p.label }))

        let coords: [number, number][] = []
        let dist = 0, dur = 0

        if (optimize && intermediates.length > 0) {
          const result = await getOptimizedRoute(
            { latitude: origin.lat, longitude: origin.lng },
            { latitude: destination.lat, longitude: destination.lng },
            intermediates
          )
          coords = result.geometry.map(c => [c.latitude, c.longitude] as [number, number])
          dist = result.distanceKm
          dur = result.durationMin
          setOptimizedOrder(null)
        } else {
          const allCoords = [origin, ...intermediates.map(i => i.coordinates), { latitude: destination.lat, longitude: destination.lng }]
            .map(c => `${c.longitude},${c.latitude}`)
            .join(';')
          const url = `https://router.project-osrm.org/route/v1/driving/${allCoords}?overview=full&geometries=geojson`
          const res = await fetch(url)
          if (!res.ok) throw new Error('OSRM indisponible')
          const data = await res.json()
          if (data.code === 'Ok' && data.routes?.[0]) {
            const route = data.routes[0]
            coords = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number])
            dist = route.distance / 1000
            dur = route.duration / 60
          } else {
            const vendeurs = intermediates.map(i => ({ id: i.label, lat: i.coordinates.latitude, lng: i.coordinates.longitude }))
            const result = calculerItineraire(origin.lat, origin.lng, vendeurs, destination.lat, destination.lng)
            coords = result.points.map(p => [p.lat, p.lng])
            dist = result.distanceTotale
            dur = result.dureeEstimee
          }
        }
        setRouteCoords(coords)
        setDistanceKm(dist)
        setDurationMin(dur)
        onRouteReady?.(dist, dur)
      } catch (err) {
        setRouteError('Impossible de calculer l’itinéraire')
      } finally {
        setLoadingRoute(false)
      }
    }
    calculate()
  }, [points, optimize, onRouteReady])

  const toggleFullscreen = () => {
    const el = document.getElementById('map-itineraire-container')
    if (!document.fullscreenElement && el) {
      el.requestFullscreen()
      setFullscreen(true)
    } else {
      document.exitFullscreen()
      setFullscreen(false)
    }
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const tileUrl = theme === 'dark'
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`
    : `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`

  const recenter = () => {
    if (points.length > 0) {
      setMapCenter([...mapCenter])
      setZoom(14)
    }
  }

  return (
    <div
      id="map-itineraire-container"
      className={cn('relative rounded-2xl overflow-hidden border border-neutral-200 dark:border-midnight-500/30 shadow-card', className)}
      style={{ height: fullscreen ? '100vh' : height }}
    >
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5">
        {loadingRoute && (
          <Badge variant="gold" size="sm" className="backdrop-blur-md shadow-soft">
            <Spinner size="sm" variant="white" className="mr-1.5" /> Calcul…
          </Badge>
        )}
        {routeError && (
          <Badge variant="danger" size="sm" className="backdrop-blur-md shadow-soft">
            <AlertTriangle size={14} className="mr-1" /> {routeError}
          </Badge>
        )}
        {distanceKm && durationMin && (
          <Badge variant="gold" size="sm" className="backdrop-blur-md shadow-soft">
            <MapPin size={14} className="mr-1" /> {distanceKm.toFixed(1)} km • {Math.round(durationMin)} min
          </Badge>
        )}
        {geocodeError && (
          <Badge variant="danger" size="sm" className="backdrop-blur-md shadow-soft">
            <AlertTriangle size={14} className="mr-1" /> {geocodeError}
          </Badge>
        )}
      </div>

      {!hideControls && (
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
          <Tooltip content="Recentrer">
            <Button variant="glass" size="icon" onClick={recenter} className="w-8 h-8 rounded-lg"><Crosshair size={14} /></Button>
          </Tooltip>
          <Tooltip content={fullscreen ? 'Quitter plein écran' : 'Plein écran'}>
            <Button variant="glass" size="icon" onClick={toggleFullscreen} className="w-8 h-8 rounded-lg"><Maximize2 size={14} /></Button>
          </Tooltip>
          <Tooltip content="Zoom +">
            <Button variant="glass" size="icon" onClick={() => setZoom(z => z + 1)} className="w-8 h-8 rounded-lg"><Plus size={14} /></Button>
          </Tooltip>
          <Tooltip content="Zoom -">
            <Button variant="glass" size="icon" onClick={() => setZoom(z => z - 1)} className="w-8 h-8 rounded-lg"><Minus size={14} /></Button>
          </Tooltip>
        </div>
      )}

      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          attribution='© <a href="https://www.mapbox.com/about/maps/">Mapbox</a>'
          url={tileUrl}
        />
        <MapController center={mapCenter} zoom={zoom} />
        <MapCleaner /> {/* Nettoyage au démontage */}

        {points.map((point, idx) => {
          let icon
          if (point.type === 'depart') icon = departIcon
          else if (point.type === 'arrivee') icon = arriveeIcon
          else if (point.type === 'etape') icon = etapeIcon
          else {
            if (idx === 0) icon = departIcon
            else if (idx === points.length - 1) icon = arriveeIcon
            else icon = etapeIcon
          }
          return (
            <Marker key={point.id} position={[point.lat, point.lng]} icon={icon}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{point.label}</p>
                  {point.description && <p className="text-xs text-neutral-500">{point.description}</p>}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {routeCoords.length > 0 && (
          <Polyline positions={routeCoords} color="#c99a14" weight={4} opacity={0.8} />
        )}
      </MapContainer>

      {geocoding && (
        <div className="absolute bottom-4 left-4 z-[1000]">
          <Badge variant="neutral" size="sm" className="backdrop-blur-md shadow-soft">
            <Spinner size="sm" variant="neutral" className="mr-1.5" /> Géocodage…
          </Badge>
        </div>
      )}
    </div>
  )
}

export const MapItineraire = dynamic(() => Promise.resolve(MapItineraireContent), { ssr: false })
export default MapItineraireContent