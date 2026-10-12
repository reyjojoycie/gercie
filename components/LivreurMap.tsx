// components/LivreurMap.tsx
'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { useTheme } from '@/contexts/ThemeContext'
import { calculerItineraire, type Point as ItinerairePoint } from '@/lib/itineraire'
import {
  Navigation, Crosshair, MapPin, Store, Truck, Home, ZoomIn, ZoomOut,
  Maximize2, Share2, Route, Car, Bike, Footprints, AlertTriangle,
  CheckCircle2, X, Search, Layers, RefreshCcw, GripHorizontal,
} from 'lucide-react'

// Correction des icônes Leaflet par défaut (nécessaire pour le SSR)
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  })
}

/* ========================================================================== */
/*  Types enrichis                                                             */
/* ========================================================================== */

interface Vendeur {
  id: string
  nom: string
  adresse: string
  lat: number
  lng: number
  priorite?: number
  photo?: string
  telephone?: string
}

interface Client {
  nom: string
  prenom: string
  adresse: string
  lat: number
  lng: number
  telephone?: string
}

interface Waypoint extends Vendeur {
  type: 'vendeur'
}

interface RouteStep {
  instruction: string
  distanceKm: number
  durationMin: number
}

interface LivreurMapProps {
  vendeurs?: Vendeur[]
  client?: Client
  showItinerary?: boolean
  className?: string
  height?: string
  onRouteCalculated?: (distance: number, duration: number, steps?: RouteStep[]) => void
  /** Centrer sur une position initiale autre que celle du livreur */
  initialCenter?: [number, number]
  /** Mode de transport par défaut (driving | walking | cycling) */
  transportMode?: 'driving' | 'walking' | 'cycling'
  /** Activer la géolocalisation continue */
  continuousGeolocation?: boolean
  /** Afficher le panneau latéral des étapes */
  showStepsPanel?: boolean
  /** Callback quand la position du livreur change */
  onUserLocationChange?: (coords: [number, number]) => void
  /** Nom du livreur */
  livreurNom?: string
}

/* ========================================================================== */
/*  Icônes personnalisées – palette luxe (conservées + enrichies)             */
/* ========================================================================== */

const createCustomIcon = (bgColor: string, emoji: string, borderColor = '#ffffff', size = 36) =>
  L.divIcon({
    html: `<div style="background-color:${bgColor}; width:${size}px; height:${size}px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid ${borderColor}; box-shadow:0 2px 10px rgba(0,0,0,0.3); font-size:${size * 0.5}px;">${emoji}</div>`,
    iconSize: [size, size],
    className: 'custom-div-icon',
  })

const livreurIcon = createCustomIcon('#c99a14', '🛵')
const vendeurIcon = createCustomIcon('#0fa073', '🏪')
const clientIcon = createCustomIcon('#dc3f62', '🏠')
const waypointIcon = createCustomIcon('#8b5cf6', '📍', '#ffffff', 30)

/* ========================================================================== */
/*  Sous-composant : contrôleur de carte (+ recentrage, événements)            */
/* ========================================================================== */

function MapController({
  center,
  zoom = 13,
  onMoveEnd,
}: {
  center: [number, number]
  zoom?: number
  onMoveEnd?: (center: [number, number], zoom: number) => void
}) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter()
      onMoveEnd?.([c.lat, c.lng], map.getZoom())
    },
  })
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 1 })
  }, [center, zoom, map])
  return null
}

/* ========================================================================== */
/*  Composant interne (non exporté directement, chargé dynamiquement)          */
/* ========================================================================== */

function LivreurMapContent({
  vendeurs = [],
  client,
  showItinerary = true,
  className,
  height = '500px',
  onRouteCalculated,
  initialCenter,
  transportMode: initialMode = 'driving',
  continuousGeolocation = false,
  showStepsPanel = false,
  onUserLocationChange,
  livreurNom = 'Vous',
}: LivreurMapProps) {
  const { theme } = useTheme()

  // Position du livreur
  const [userLocation, setUserLocation] = useState<[number, number] | null>(initialCenter || null)
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)

  // Mode de transport
  const [transportMode, setTransportMode] = useState<'driving' | 'walking' | 'cycling'>(initialMode)

  // Itinéraire
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([])
  const [distance, setDistance] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [optimized, setOptimized] = useState(false)

  // Carte
  const [mapCenter, setMapCenter] = useState<[number, number]>([-4.4419, 15.2663])
  const [zoom, setZoom] = useState(13)

  // État UI
  const [fullscreen, setFullscreen] = useState(false)

  // Géolocalisation continue
  const watchIdRef = useRef<number | null>(null)

  // Récupérer la position
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setUserLocation([-4.4419, 15.2663])
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserLocation(coords)
        setUserAccuracy(pos.coords.accuracy)
        setLocating(false)
        onUserLocationChange?.(coords)
      },
      () => {
        setUserLocation([-4.4419, 15.2663])
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [onUserLocationChange])

  // Géolocalisation continue
  useEffect(() => {
    if (!continuousGeolocation || !navigator.geolocation) return
    const success = (pos: GeolocationPosition) => {
      const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
      setUserLocation(coords)
      setUserAccuracy(pos.coords.accuracy)
      onUserLocationChange?.(coords)
    }
    const error = () => {}
    watchIdRef.current = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 10000,
    })
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [continuousGeolocation, onUserLocationChange])

  // Initialisation
  useEffect(() => {
    if (initialCenter) {
      setMapCenter(initialCenter)
      setUserLocation(initialCenter)
    } else {
      requestLocation()
    }
  }, [initialCenter, requestLocation])

  // Calcul de l'itinéraire (OSRM + fallback via calculerItineraire)
  const calculateRoute = useCallback(async () => {
    if (!userLocation) return

    const waypoints: Vendeur[] = vendeurs.filter(v => v.lat && v.lng)
    if (waypoints.length === 0 && (!client?.lat || !client?.lng)) return

    setLoadingRoute(true)
    setRouteError(null)

    const allPoints: [number, number][] = [userLocation]
    waypoints.forEach(v => allPoints.push([v.lat, v.lng]))
    if (client?.lat && client.lng) allPoints.push([client.lat, client.lng])

    // Essayer OSRM
    const coordinates = allPoints.map(p => `${p[1]},${p[0]}`).join(';')
    const osrmModes: Record<string, string> = {
      driving: 'driving',
      walking: 'walking',
      cycling: 'cycling',
    }
    const url = `https://router.project-osrm.org/route/v1/${osrmModes[transportMode]}/${coordinates}?overview=full&geometries=geojson&steps=true`

    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data.code === 'Ok' && data.routes?.[0]) {
        const route = data.routes[0]
        const coords = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number])
        setRoutePoints(coords)
        const distKm = route.distance / 1000
        const durMin = route.duration / 60
        setDistance(distKm)
        setDuration(durMin)
        const steps: RouteStep[] = (route.legs?.[0]?.steps || []).map((s: any) => ({
          instruction: s.maneuver.instruction,
          distanceKm: s.distance / 1000,
          durationMin: s.duration / 60,
        }))
        setRouteSteps(steps)
        onRouteCalculated?.(distKm, durMin, steps)
        setOptimized(false)
        return
      }
    } catch {
      // OSRM indisponible, fallback
    }

    // Fallback avec notre propre algorithme
    try {
      const vendeurPoints = waypoints.map(v => ({ id: v.id, nom: v.nom, lat: v.lat, lng: v.lng }))
      const itineraire = calculerItineraire(
        userLocation[0], userLocation[1],
        vendeurPoints,
        client?.lat || userLocation[0], client?.lng || userLocation[1],
        transportMode === 'driving' ? 30 : transportMode === 'cycling' ? 15 : 5,
        { mode: transportMode === 'cycling' ? 'velo' : transportMode === 'walking' ? 'pied' : 'voiture' }
      )
      const pts: [number, number][] = itineraire.points.map(p => [p.lat, p.lng])
      setRoutePoints(pts)
      setDistance(itineraire.distanceTotale)
      setDuration(itineraire.dureeEstimee)
      setRouteSteps([])
      onRouteCalculated?.(itineraire.distanceTotale, itineraire.dureeEstimee, [])
      setOptimized(true)
      setRouteError(null)
    } catch (fallbackErr) {
      setRouteError('Impossible de calculer l’itinéraire.')
    } finally {
      setLoadingRoute(false)
    }
  }, [userLocation, vendeurs, client, transportMode, onRouteCalculated])

  useEffect(() => {
    if (showItinerary && userLocation) calculateRoute()
  }, [showItinerary, userLocation, calculateRoute])

  // Recentrer sur la position actuelle
  const handleRecenter = () => {
    if (userLocation) {
      setMapCenter([...userLocation])
      setZoom(15)
    }
  }

  // Mode plein écran
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.getElementById('livreur-map-container')?.requestFullscreen()
      setFullscreen(true)
    } else {
      document.exitFullscreen()
      setFullscreen(false)
    }
  }

  // Style de carte selon le thème
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const tileUrl = theme === 'dark'
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`
    : `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`

  // Marqueurs avec numéro d'ordre
  const orderedVendeurs = useMemo(() => {
    if (optimized) {
      // L'ordre est déjà optimisé dans routePoints, on ne modifie pas
      return vendeurs
    }
    return vendeurs
  }, [vendeurs, optimized])

  return (
    <div
      id="livreur-map-container"
      className={cn(
        'relative rounded-2xl overflow-hidden border border-neutral-200 dark:border-midnight-500/30 shadow-card flex flex-col',
        className
      )}
      style={{ height: fullscreen ? '100vh' : height }}
    >
      {/* Barre d'outils supérieure */}
      <div className="absolute top-2 left-2 right-2 z-[1000] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {/* Mode de transport */}
          {(['driving', 'walking', 'cycling'] as const).map(mode => (
            <Tooltip key={mode} content={mode === 'driving' ? 'Voiture' : mode === 'walking' ? 'À pied' : 'Vélo'}>
              <Button
                variant={transportMode === mode ? 'gold' : 'outline-gold'}
                size="icon"
                onClick={() => setTransportMode(mode)}
                className="w-8 h-8 rounded-lg"
              >
                {mode === 'driving' ? <Car size={14} /> : mode === 'walking' ? <Footprints size={14} /> : <Bike size={14} />}
              </Button>
            </Tooltip>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="glass" size="icon" onClick={requestLocation} disabled={locating} className="w-8 h-8 rounded-lg">
            <Crosshair size={14} className={cn(locating && 'animate-spin', 'text-gold-500')} />
          </Button>
          <Button variant="glass" size="icon" onClick={handleRecenter} className="w-8 h-8 rounded-lg">
            <Navigation size={14} />
          </Button>
          <Button variant="glass" size="icon" onClick={toggleFullscreen} className="w-8 h-8 rounded-lg">
            <Maximize2 size={14} />
          </Button>
          <Tooltip content="Actualiser l’itinéraire">
            <Button variant="glass" size="icon" onClick={calculateRoute} loading={loadingRoute} className="w-8 h-8 rounded-lg">
              <RefreshCcw size={14} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Badges flottants */}
      <div className="absolute top-14 left-2 z-[1000] flex flex-col gap-1.5">
        {loadingRoute && (
          <Badge variant="gold" size="sm" className="shadow-soft backdrop-blur-md">
            <Spinner size="sm" variant="white" className="mr-1.5" />
            Calcul de l&apos;itinéraire…
          </Badge>
        )}
        {routeError && (
          <Badge variant="danger" size="sm" className="shadow-soft backdrop-blur-md">
            <AlertTriangle size={14} className="mr-1" /> {routeError}
          </Badge>
        )}
        {distance !== null && duration !== null && (
          <Badge variant="gold" size="sm" className="shadow-soft backdrop-blur-md">
            <MapPin size={14} className="mr-1" />
            {distance.toFixed(1)} km • {Math.round(duration)} min
            {optimized && ' (optimisé)'}
          </Badge>
        )}
        {userAccuracy && (
          <Badge variant="neutral" size="sm" className="shadow-soft backdrop-blur-md">
            Précision ±{userAccuracy.toFixed(0)} m
          </Badge>
        )}
      </div>

      {/* Carte */}
      <div className="flex-1">
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
          <MapController center={mapCenter} zoom={zoom} onMoveEnd={(c, z) => { setMapCenter(c); setZoom(z) }} />

          {/* Livreur */}
          {userLocation && (
            <Marker position={userLocation} icon={livreurIcon}>
              <Popup>
                <div className="text-sm font-medium">{livreurNom}</div>
                <div className="text-xs text-neutral-500">Position actuelle</div>
              </Popup>
            </Marker>
          )}

          {/* Vendeurs avec numéro d'ordre */}
          {orderedVendeurs.map((v, index) => v.lat && v.lng && (
            <Marker key={v.id} position={[v.lat, v.lng]} icon={vendeurIcon}>
              <Popup>
                <div className="flex flex-col gap-1 text-sm">
                  <p className="font-semibold">{v.nom} {optimized && `(${index + 1})`}</p>
                  <p className="text-xs text-neutral-500">{v.adresse}</p>
                  {v.telephone && <p className="text-xs">{v.telephone}</p>}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold-600 dark:text-gold-400 text-xs hover:underline mt-1"
                  >
                    Itinéraire vers ce point
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Client */}
          {client?.lat && client.lng && (
            <Marker position={[client.lat, client.lng]} icon={clientIcon}>
              <Popup>
                <div className="flex flex-col gap-1 text-sm">
                  <p className="font-semibold">{client.prenom} {client.nom}</p>
                  <p className="text-xs text-neutral-500">{client.adresse}</p>
                  {client.telephone && <p className="text-xs">{client.telephone}</p>}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Itinéraire */}
          {routePoints.length > 0 && (
            <Polyline
              positions={routePoints}
              color={transportMode === 'driving' ? '#c99a14' : transportMode === 'cycling' ? '#0ea5e9' : '#10b981'}
              weight={4}
              opacity={0.75}
              dashArray={transportMode === 'walking' ? '10 10' : undefined}
            />
          )}
        </MapContainer>
      </div>

      {/* Panneau des étapes (optionnel) */}
      {showStepsPanel && routeSteps.length > 0 && (
        <div className="max-h-48 overflow-y-auto bg-white/90 dark:bg-midnight-800/90 backdrop-blur-xl border-t border-neutral-200 dark:border-midnight-500/30 p-4 space-y-2 text-sm">
          <p className="font-semibold text-neutral-900 dark:text-neutral-100">Étapes de l&apos;itinéraire</p>
          {routeSteps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
              <span className="text-gold-500">{idx + 1}.</span>
              <span className="flex-1">{step.instruction}</span>
              <span className="text-xs font-mono whitespace-nowrap">{step.distanceKm.toFixed(1)} km</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Export dynamique pour éviter le chargement SSR (leaflet a besoin du DOM)
export const LivreurMap = dynamic(() => Promise.resolve(LivreurMapContent), { ssr: false })
export default LivreurMapContent