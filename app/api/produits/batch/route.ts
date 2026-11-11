// app/api/produits/batch/route.ts
// ============================================================================
// API Batch Produits
// Permet de récupérer plusieurs produits par IDs.
// Version tolérante, sans wallet / portefeuille / solde / retrait.
//
// Endpoint :
// - GET /api/produits/batch?ids=uuid1,uuid2,uuid3&include_inactive=false
// ============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PRODUCT_TABLE = 'produits'
const MAX_IDS = 50

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMA                                                         */
/* ═══════════════════════════════════════════════════════════════ */

const querySchema = z.object({
  ids: z.string().min(1),

  include_inactive: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function errorMessage(error: any, fallback: string): string {
  return String(error?.message || error?.details || error?.hint || fallback)
}

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

function isColumnError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '42703' ||
    message.includes('column') ||
    message.includes('does not exist') ||
    message.includes('could not find')
  )
}

function parseIds(raw: string): string[] {
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  const unique = Array.from(new Set(ids)).slice(0, MAX_IDS)

  const uuidIds = unique.filter((id) => UUID_REGEX.test(id))

  // Si tous les IDs semblent être des UUID, on garde seulement les valides.
  // Sinon, on garde les IDs bruts pour supporter d’autres formats.
  if (uuidIds.length > 0 && uuidIds.length === unique.length) {
    return uuidIds
  }

  if (uuidIds.length > 0) {
    return uuidIds
  }

  return unique
}

async function getSupabaseClient(): Promise<any> {
  try {
    const admin: any = await createClient(true)
    const client = admin?.supabase ?? admin

    if (client && typeof client.from === 'function') {
      return client
    }
  } catch {
    // fallback client utilisateur
  }

  try {
    const user: any = await createClient(false)
    const client = user?.supabase ?? user

    if (client && typeof client.from === 'function') {
      return client
    }
  } catch {
    // ignore
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse(
      Object.fromEntries(searchParams.entries())
    )

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Paramètres de requête invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
          data: [],
        },
        { status: 400 }
      )
    }

    const ids = parseIds(parsed.data.ids)
    const includeInactive = parsed.data.include_inactive === 'true'

    if (ids.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: {
          requested: 0,
          returned: 0,
        },
      })
    }

    const supabase = await getSupabaseClient()

    if (!supabase) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          meta: {
            requested: ids.length,
            returned: 0,
            warning:
              'Configuration Supabase indisponible : aucun produit renvoyé.',
          },
        },
        { status: 200 }
      )
    }

    const selects = [
      'id, nom, slug, prix, prix_promo, images, categorie, note_moyenne, stock, est_actif, created_at, updated_at',
      'id, nom, slug, prix, prix_promo, images, categorie, note_moyenne, stock, est_actif, created_at',
      'id, nom, prix, prix_promo, images, categorie, note_moyenne, stock, est_actif',
      'id, nom, prix, images, note_moyenne, stock',
      'id, nom, prix, images',
      '*',
    ]

    let lastError: any = null

    for (const select of selects) {
      try {
        let query = supabase.from(PRODUCT_TABLE).select(select).in('id', ids)

        if (!includeInactive && select.includes('est_actif')) {
          query = query.eq('est_actif', true)
        }

        const { data, error } = await query

        if (!error) {
          const products = Array.isArray(data) ? data : []

          const response = NextResponse.json({
            success: true,
            data: products,
            meta: {
              requested: ids.length,
              returned: products.length,
              include_inactive: includeInactive,
            },
          })

          response.headers.set(
            'Cache-Control',
            'public, s-maxage=60, stale-while-revalidate=300'
          )

          return response
        }

        lastError = error

        if (isTableMissingError(error)) {
          return NextResponse.json(
            {
              success: true,
              data: [],
              meta: {
                requested: ids.length,
                returned: 0,
                warning:
                  'La table public.produits est introuvable. Batch vide renvoyé pour ne pas bloquer l’interface.',
              },
            },
            { status: 200 }
          )
        }

        if (isColumnError(error)) {
          continue
        }

        break
      } catch (err: any) {
        lastError = err

        if (isTableMissingError(err)) {
          return NextResponse.json(
            {
              success: true,
              data: [],
              meta: {
                requested: ids.length,
                returned: 0,
                warning:
                  'La table public.produits est introuvable. Batch vide renvoyé pour ne pas bloquer l’interface.',
              },
            },
            { status: 200 }
          )
        }

        if (isColumnError(err)) {
          continue
        }

        break
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: [],
        meta: {
          requested: ids.length,
          returned: 0,
          warning:
            'Impossible de récupérer les produits demandés. Batch vide renvoyé.',
          details:
            process.env.NODE_ENV === 'development'
              ? errorMessage(lastError, 'Erreur inconnue')
              : undefined,
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Crash GET /api/produits/batch', error)

    return NextResponse.json(
      {
        success: true,
        data: [],
        meta: {
          warning:
            'Erreur interne lors du chargement batch des produits. Liste vide renvoyée.',
          details:
            process.env.NODE_ENV === 'development'
              ? errorMessage(error, 'Erreur inconnue')
              : undefined,
        },
      },
      { status: 200 }
    )
  }
}