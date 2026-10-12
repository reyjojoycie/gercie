// components/maps/PointRetraitMap.tsx
'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Corriger les icônes Leaflet (problème classique avec webpack)
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

const DefaultIcon = L.icon({
  iconUrl: icon.src,
  shadowUrl: iconShadow.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

L.Marker.prototype.options.icon = DefaultIcon

interface Point {
  id: number
  nom: string
  latitude: number
  longitude: number
  adresse: string
  est_actif: boolean
}

interface PointRetraitMapProps {
  points: Point[]
  userLocation?: { lat: number; lng: number } | null
  onSelect?: (id: number) => void
}

export default function PointRetraitMap({ points, userLocation, onSelect }: PointRetraitMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    // Initialiser la carte centrée sur Kinshasa par défaut
    const map = L.map(mapRef.current).setView([-4.4419, 15.2663], 12)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    mapInstance.current = map

    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  // Ajouter / mettre à jour les marqueurs
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    // Supprimer les anciens marqueurs
    map.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer)
      }
    })

    // Ajouter les points
    points.forEach(point => {
      if (!point.latitude || !point.longitude) return

      const marker = L.marker([point.latitude, point.longitude])
        .addTo(map)
        .bindPopup(`<b>${point.nom}</b><br/>${point.adresse}<br/>${point.est_actif ? 'Actif' : 'Inactif'}`)

      marker.on('click', () => {
        onSelect?.(point.id)
      })
    })

    // Ajouter la position utilisateur si disponible
    if (userLocation) {
      const userIcon = L.icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconSize: [20, 32],
        iconAnchor: [10, 32],
        popupAnchor: [0, -32],
      })
      L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('Votre position')
    }

    // Ajuster le zoom pour voir tous les points
    if (points.length > 0) {
      const validPoints = points.filter(p => p.latitude && p.longitude)
      if (validPoints.length > 0) {
        const group = L.featureGroup(validPoints.map(p => L.marker([p.latitude!, p.longitude!])))
        map.fitBounds(group.getBounds().pad(0.1))
      }
    }
  }, [points, userLocation, onSelect])

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
}