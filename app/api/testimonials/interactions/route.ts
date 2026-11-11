// app/api/testimonials/interactions/route.ts
// ============================================================================
// API publique – Interactions sur les avis
// Actuellement : like / utile.
// Sans wallet / portefeuille / solde / retrait.
// ============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TABLE = 'testimonials'

const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 20

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = (rateLimitMap.get(ip) || []).filter(
    (time) => now - time < RATE_LIMIT_WINDOW_MS
  )

  if (timestamps.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, timestamps)
    return true
  }

  timestamps.push(now)
  rateLimitMap.set(ip, timestamps)
  return false
}

async function getSupabaseAdmin(): Promise<any> {
  try {
    const client: any = await createClient(true)
    return client?.supabase ?? client
  } catch {
    return null
  }
}

const schema = z.object({
  id: z.string().uuid(),
  type: z.enum(['like']).optional().default('like'),
})

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)

    if (isRateLimited(ip)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Trop d’interactions. Réessaie dans quelques minutes.',
          code: 'RATE_LIMITED',
        },
        { status: 429 }
      )
    }

    let body: any

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'JSON invalide.', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Paramètres invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const supabase = await getSupabaseAdmin()

    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Configuration serveur indisponible.',
          code: 'SUPABASE_ERROR',
        },
        { status: 500 }
      )
    }

    const { data: current, error: fetchError } = await supabase
      .from(TABLE)
      .select('id, likes, status')
      .eq('id', parsed.data.id)
      .eq('status', 'published')
      .maybeSingle()

    if (fetchError) throw fetchError

    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Avis introuvable.', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const newLikes = Math.max(0, Number(current.likes || 0) + 1)

    const { data, error } = await supabase
      .from(TABLE)
      .update({ likes: newLikes })
      .eq('id', parsed.data.id)
      .select('id, likes')
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: {
        id: data?.id || parsed.data.id,
        likes: data?.likes ?? newLikes,
      },
    })
  } catch (error: any) {
    console.error('Crash POST /api/testimonials/interactions', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Impossible d’enregistrer l’interaction.',
        code: 'INTERNAL_ERROR',
        details:
          process.env.NODE_ENV === 'development'
            ? String(error?.message || 'Erreur inconnue')
            : undefined,
      },
      { status: 500 }
    )
  }
}