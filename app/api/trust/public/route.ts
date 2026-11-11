// app/api/trust/public/route.ts
// ============================================================================
// API publique – Section Confiance
// Fournit les données actives à afficher sur le site.
// Sans wallet / portefeuille / solde / retrait.
// ============================================================================

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'

import {
  DEFAULT_TRUST_SETTINGS,
  DEFAULT_TRUST_STATS,
  DEFAULT_TRUST_TESTIMONIALS,
  normalizeSettings,
  normalizeStat,
  normalizeTestimonial,
  sortTrustItems,
  type TrustSettings,
  type TrustStat,
  type TrustTestimonial,
} from '@/lib/trust'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TABLES = {
  stats: 'trust_stats',
  testimonials: 'trust_testimonials',
  settings: 'trust_settings',
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

async function getSupabaseAdmin(): Promise<any> {
  try {
    const client: any = await createClient(true)
    return client?.supabase ?? client
  } catch {
    return null
  }
}

function defaultPayload() {
  return {
    stats: DEFAULT_TRUST_STATS,
    testimonials: DEFAULT_TRUST_TESTIMONIALS,
    settings: DEFAULT_TRUST_SETTINGS,
  }
}

export async function GET() {
  try {
    const supabase = await getSupabaseAdmin()

    if (!supabase || typeof supabase.from !== 'function') {
      return NextResponse.json(
        {
          success: true,
          data: defaultPayload(),
          meta: {
            source: 'fallback',
            warning:
              'Configuration Supabase indisponible : données par défaut renvoyées.',
          },
        },
        { status: 200 }
      )
    }

    let rawStats: any[] = []
    let rawTestimonials: any[] = []
    let rawSettings: any = null
    let usedFallback = false

    // Stats
    try {
      const { data, error } = await supabase
        .from(TABLES.stats)
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) {
        if (isTableMissingError(error)) {
          usedFallback = true
        } else {
          throw error
        }
      } else {
        rawStats = Array.isArray(data) ? data : []
      }
    } catch (error: any) {
      if (!isTableMissingError(error)) {
        console.warn('[TRUST PUBLIC] Erreur stats:', error?.message)
      }
      usedFallback = true
    }

    // Testimonials
    try {
      const { data, error } = await supabase
        .from(TABLES.testimonials)
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) {
        if (isTableMissingError(error)) {
          usedFallback = true
        } else {
          throw error
        }
      } else {
        rawTestimonials = Array.isArray(data) ? data : []
      }
    } catch (error: any) {
      if (!isTableMissingError(error)) {
        console.warn('[TRUST PUBLIC] Erreur testimonials:', error?.message)
      }
      usedFallback = true
    }

    // Settings
    try {
      const { data, error } = await supabase
        .from(TABLES.settings)
        .select('*')
        .eq('id', 'global')
        .maybeSingle()

      if (error) {
        if (!isTableMissingError(error)) {
          console.warn('[TRUST PUBLIC] Erreur settings:', error?.message)
        }
        usedFallback = true
      } else {
        rawSettings = data
      }
    } catch (error: any) {
      if (!isTableMissingError(error)) {
        console.warn('[TRUST PUBLIC] Crash settings:', error?.message)
      }
      usedFallback = true
    }

    const stats: TrustStat[] = sortTrustItems(
      rawStats
        .map((row: any, index: number) => normalizeStat(row, index))
        .filter((row): row is TrustStat => Boolean(row))
    )

    const testimonials: TrustTestimonial[] = sortTrustItems(
      rawTestimonials
        .map((row: any, index: number) => normalizeTestimonial(row, index))
        .filter((row): row is TrustTestimonial => Boolean(row))
    )

    const settings: TrustSettings = normalizeSettings(
      rawSettings ?? DEFAULT_TRUST_SETTINGS
    )

    // Si aucune donnée n’est encore en base, on renvoie les valeurs par défaut
    // pour éviter une section vide au premier déploiement.
    const finalStats = stats.length > 0 ? stats : DEFAULT_TRUST_STATS
    const finalTestimonials =
      testimonials.length > 0 ? testimonials : DEFAULT_TRUST_TESTIMONIALS

    const response = NextResponse.json({
      success: true,
      data: {
        stats: finalStats,
        testimonials: finalTestimonials,
        settings,
      },
      meta: {
        source: usedFallback ? 'fallback' : 'database',
        generated_at: new Date().toISOString(),
      },
    })

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300'
    )

    return response
  } catch (error: any) {
    console.error('Crash GET /api/trust/public', error)

    return NextResponse.json(
      {
        success: true,
        data: defaultPayload(),
        meta: {
          source: 'fallback',
          warning:
            'Erreur interne, données de confiance par défaut renvoyées.',
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