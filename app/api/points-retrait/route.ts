// app/api/points-retrait/route.ts
// ============================================================================
// API publique – Points de retrait actifs
// Utilisable pour checkout, suivi commande, sélection relais.
// Sans wallet / portefeuille / solde / retrait d'argent.
// ============================================================================

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'

import {
  addDistance,
  normalizePickupPoint,
  parseNumber,
  textOrNull,
  toBool,
  type PickupPoint,
} from '@/lib/pickup-points'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TABLE = 'points_retrait'

function isTableMissingError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '42P01' ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('n’existe pas') ||
    message.includes("n'existe pas")
  )
}

async function getSupabaseAdmin(): Promise<any> {
  try {
    const client: any = await createClient(true)
    return client?.supabase ?? client
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const search = textOrNull(searchParams.get('search')) || ''
    const ville = textOrNull(searchParams.get('ville')) || ''
    const type = textOrNull(searchParams.get('type')) || ''
    const communeId = parseNumber(searchParams.get('commune_id'))
    const lat = parseNumber(searchParams.get('lat'))
    const lng = parseNumber(searchParams.get('lng'))
    const limit = Math.min(
      100,
      Math.max(1, parseNumber(searchParams.get('limit')) || 50)
    )
    const includeInactive = toBool(searchParams.get('include_inactive'), false)

    const supabase = await getSupabaseAdmin()

    if (!supabase) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: { warning: 'Configuration Supabase indisponible.' },
        },
        { status: 200 }
      )
    }

    let query = supabase.from(TABLE).select('*')

    if (!includeInactive) {
      query = query.eq('est_actif', true)
    }

    if (ville) {
      query = query.ilike('ville_nom', `%${ville}%`)
    }

    if (type) {
      query = query.ilike('type_etablissement', `%${type}%`)
    }

    if (communeId !== null) {
      query = query.eq('commune_id', communeId)
    }

    if (search) {
      const pattern = `%${search}%`
      query = query.or(
        `nom.ilike.${pattern},adresse.ilike.${pattern},ville_nom.ilike.${pattern},quartier.ilike.${pattern},reference.ilike.${pattern}`
      )
    }

    const { data, error } = await query.limit(500)

    if (error) {
      if (isTableMissingError(error)) {
        return NextResponse.json(
          {
            success: true,
            data: [],
            meta: {
              warning:
                'La table public.points_retrait est introuvable. Exécute la migration SQL.',
            },
          },
          { status: 200 }
        )
      }

      throw error
    }

    const rows = Array.isArray(data) ? data : []

    let points: PickupPoint[] = rows
      .map((row: any, index: number) => normalizePickupPoint(row, index))
      .filter((row): row is PickupPoint => Boolean(row))

    const userLocation =
      lat !== null && lng !== null ? { lat, lng } : null

    points = addDistance(points, userLocation)

    points.sort((a, b) => {
      if (userLocation) {
        const aDist = a.distance ?? Number.POSITIVE_INFINITY
        const bDist = b.distance ?? Number.POSITIVE_INFINITY

        if (aDist !== bDist) return aDist - bDist
      }

      const aVerified = a.est_partenaire_verifie ? 1 : 0
      const bVerified = b.est_partenaire_verifie ? 1 : 0

      if (aVerified !== bVerified) return bVerified - aVerified

      const aNote = a.note_moyenne ?? 0
      const bNote = b.note_moyenne ?? 0

      if (aNote !== bNote) return bNote - aNote

      return a.sort_order - b.sort_order
    })

    const finalPoints = points.slice(0, limit)

    const response = NextResponse.json({
      success: true,
      data: finalPoints,
      meta: {
        total: points.length,
        returned: finalPoints.length,
        filtered_by_location: Boolean(userLocation),
      },
    })

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300'
    )

    return response
  } catch (error: any) {
    console.error('Crash GET /api/points-retrait', error)

    return NextResponse.json(
      {
        success: true,
        data: [],
        meta: {
          warning: 'Erreur interne, liste vide renvoyée.',
          details:
            process.env.NODE_ENV === 'development'
              ? String(error?.message || 'Erreur inconnue')
              : undefined,
        },
      },
      { status: 200 }
    )
  }
}