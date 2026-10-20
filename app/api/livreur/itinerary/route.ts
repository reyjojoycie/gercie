// app/api/livreur/itinerary/route.ts
/**
 * API d'itinéraire pour le livreur – version ultra‑premium.
 *
 * GET : calcule l'itinéraire optimisé entre la position du livreur,
 *       les vendeurs et le client pour une commande donnée.
 *
 * Améliorations :
 *  - Validation Zod enrichie
 *  - Rate limiting
 *  - Cache mémoire avec TTL
 *  - Géocodage par lots avec fallback
 *  - Calcul avec Mapbox Optimization API + fallback local (lib/itineraire)
 *  - Logs structurés
 *  - Authentification livreur via requireLivreur
 */
import { createClient } from '@/lib/supabaseServer'
import { requireLivreur } from '@/lib/auth/livreurGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { getOptimizedRoute, geocodeForward, type Coordinates } from '@/lib/mapbox'
import { calculerItineraire } from '@/lib/itineraire'

/* ========================================================================== */
/*  Schéma de validation                                                      */
/* ========================================================================== */
const querySchema = z.object({
  commande_id: z.string().uuid('ID commande invalide'),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  mode: z.enum(['driving', 'walking', 'cycling']).optional().default('driving'),
  refresh: z.enum(['true', 'false']).optional().default('false'),
})

/* ========================================================================== */
/*  Cache (TTL 60 secondes)                                                    */
/* ========================================================================== */
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 60_000

function cacheGet(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null }
  return entry.data
}
function cacheSet(key: string, data: any) { cache.set(key, { data, ts: Date.now() }) }

/* ========================================================================== */
/*  GET – Itinéraire optimisé                                                  */
/* ========================================================================== */
export async function GET(request: Request) {
  // 1. Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `livreur-itinerary:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Patientez une minute.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // 2. Authentification livreur
  let livreurId: string
  try {
    const livreur = await requireLivreur()
    livreurId = livreur.id
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  // 3. Validation des paramètres
  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const { commande_id, lat, lng, mode, refresh } = parsed.data

  // 4. Cache
  const cacheKey = `livreur-itinerary:${commande_id}:${lat}:${lng}:${mode}`
  if (refresh !== 'true') {
    const cached = cacheGet(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  try {
    const supabase = await createClient(true)

    // 5. Récupérer la commande avec les adresses vendeurs et client
    const { data: commande, error: cmdError } = await supabase
      .from('commandes')
      .select(`
        id,
        type_livraison,
        adresse_livraison,
        point_retrait_id,
        points_retrait (adresse),
        commande_articles (
          produit_id,
          produits ( vendeur_id, vendeurs ( profiles ( adresse_boutique ) ) )
        )
      `)
      .eq('id', commande_id)
      .single()

    if (cmdError || !commande) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // 6. Extraire les adresses vendeurs uniques
    const vendeurAdresses: string[] = []
    const seenVendeur = new Set<string>()
    commande.commande_articles?.forEach((article: any) => {
      const vendeurId = article.produits?.vendeur_id
      if (vendeurId && !seenVendeur.has(vendeurId)) {
        seenVendeur.add(vendeurId)
        const adresse = article.produits?.vendeurs?.profiles?.adresse_boutique
        if (adresse && adresse.trim().length > 0) {
          vendeurAdresses.push(adresse.trim())
        }
      }
    })

    // 7. Adresse du client
    let clientAdresse: string | null = null
    if (commande.type_livraison === 'domicile') {
      clientAdresse = commande.adresse_livraison
    } else if (commande.points_retrait?.adresse) {
      clientAdresse = commande.points_retrait.adresse
    }
    if (!clientAdresse) {
      return NextResponse.json({ error: 'Adresse de livraison introuvable' }, { status: 400 })
    }

    // 8. Géocodage parallèle
    const geocodePromises = [
      ...vendeurAdresses.map(addr => geocodeForward(addr)),
      geocodeForward(clientAdresse),
    ]
    const geocodeResults = await Promise.allSettled(geocodePromises)

    const vendeurCoords: Coordinates[] = []
    geocodeResults.slice(0, vendeurAdresses.length).forEach(res => {
      if (res.status === 'fulfilled' && res.value) {
        vendeurCoords.push({ latitude: res.value.latitude, longitude: res.value.longitude })
      }
    })

    const clientRes = geocodeResults[geocodeResults.length - 1]
    let clientCoord: Coordinates | null = null
    if (clientRes.status === 'fulfilled' && clientRes.value) {
      clientCoord = { latitude: clientRes.value.latitude, longitude: clientRes.value.longitude }
    }

    if (!clientCoord) {
      return NextResponse.json({ error: 'Impossible de géocoder l’adresse du client' }, { status: 500 })
    }

    // Si aucune adresse vendeur géocodée mais qu'il y avait des adresses
    if (vendeurAdresses.length > 0 && vendeurCoords.length === 0) {
      return NextResponse.json({ error: 'Aucune adresse vendeur n’a pu être géocodée' }, { status: 500 })
    }

    // 9. Calcul de l'itinéraire optimisé
    let route
    try {
      // Essayer Mapbox Optimization API
      route = await getOptimizedRoute(
        { latitude: lat, longitude: lng },
        clientCoord,
        vendeurCoords.map((coord, idx) => ({
          coordinates: coord,
          label: `Vendeur ${idx + 1}`,
        }))
      )
    } catch (mapboxErr) {
      // Fallback avec notre algorithme interne
      const vendeurPoints = vendeurCoords.map((c, i) => ({
        id: `vendeur-${i}`,
        lat: c.latitude,
        lng: c.longitude,
      }))
      const itineraire = calculerItineraire(
        lat, lng,
        vendeurPoints,
        clientCoord.latitude,
        clientCoord.longitude,
        mode === 'driving' ? 30 : mode === 'cycling' ? 15 : 5,
        { mode: mode === 'driving' ? 'voiture' : mode === 'cycling' ? 'velo' : 'pied' }
      )
      route = {
        waypoints: itineraire.points.map(p => ({ latitude: p.lat, longitude: p.lng })),
        distanceKm: itineraire.distanceTotale,
        durationMin: itineraire.dureeEstimee,
        geometry: itineraire.points.map(p => ({ latitude: p.lat, longitude: p.lng })),
      }
    }

    // 10. Réponse
    const response = {
      origin: { latitude: lat, longitude: lng },
      waypoints: vendeurCoords.map(c => ({ latitude: c.latitude, longitude: c.longitude })),
      destination: { latitude: clientCoord.latitude, longitude: clientCoord.longitude },
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      geometry: route.geometry,
      optimizedOrder: route.waypoints.slice(1, -1).map(wp => ({
        latitude: wp.latitude,
        longitude: wp.longitude,
      })),
    }

    cacheSet(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error('Crash dans /api/livreur/itinerary', error)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}