// features/delivery/index.ts
/**
 * Module de livraison – point d'entrée central.
 *
 * Ré‑exporte les fonctions et types principaux de l'écosystème
 * livraison (itinéraires, cartes, géocodage) ainsi que les futurs
 * hooks et services métier.
 *
 * Dernière mise à jour : étape 8 (itineraire, mapbox, geocoding enrichis)
 */

// ---------------------------------------------------------------------------
// Itinéraires (algo glouton, insertion, etc.)
// ---------------------------------------------------------------------------
export {
  calculerItineraire,
  formaterItineraire,
  getGoogleMapsItineraireLink,
  sauvegarderItineraire,
  chargerItineraire,
  supprimerItineraire,
  listerItineraires,
  encodePolyline,
  type Point,
  type Itineraire,
} from '@/lib/itineraire'

// ---------------------------------------------------------------------------
// Mapbox (directions, optimisation, matrice, cluster)
// ---------------------------------------------------------------------------
export {
  geocodeForward,
  geocodeReverse,
  getDirections,
  getOptimizedRoute,
  getTravelTimeMatrix,
  isPointInServiceArea,
  clusterPoints,
  type Coordinates,
  type Address,
  type Waypoint,
  type DirectionsResult,
  type DirectionsStep,
  type OptimizedRouteResult,
  type TravelTimeMatrixResult,
} from '@/lib/mapbox'

// ---------------------------------------------------------------------------
// Géocodage (Nominatim + fallback Mapbox)
// ---------------------------------------------------------------------------
export {
  geocodeAddress,
  reverseGeocode,
  calculateDistance,
  calculateDistanceVincenty,
  estimateDuration,
  estimateDurationByMode,
  getGoogleMapsLink,
  getGoogleMapsDirectionsLink,
  getWazeLink,
  getWazeDirectionsLink,
  normalizeAddress,
  isInCoverage,
  geocodeBatch,
  type AddressComponents,
} from '@/lib/geocoding'

// ---------------------------------------------------------------------------
// Services (à activer quand ils seront implémentés)
// ---------------------------------------------------------------------------
// export {
//   getDeliveryStatus,
//   assignLivreur,
//   trackDelivery,
// } from './services/deliveryService'

// ---------------------------------------------------------------------------
// Hooks (à activer quand ils seront implémentés)
// ---------------------------------------------------------------------------
// export { useDeliveryTracking } from './hooks/useDeliveryTracking'
// export { useGeolocation } from './hooks/useGeolocation'