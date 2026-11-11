// app/api/hero/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE SERVER CLIENT                                         */
/* ═══════════════════════════════════════════════════════════════ */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface HeroSlide {
  id: string
  title: string
  highlight: string
  description: string
  image_url: string
  cta_label: string
  cta_href: string
  image_alt?: string
  is_active?: boolean
  sort_order?: number
  start_date?: string | null
  end_date?: string | null
  priority?: boolean
  config?: Record<string, unknown>
}

interface HeroResponse {
  slides: HeroSlide[]
  total: number
  generatedAt: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }

  return value
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str ? str : null
}

function textOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value

  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }

  if (typeof value === 'number') return value !== 0

  return fallback
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeSlide(raw: unknown, index: number): HeroSlide | null {
  const data = asObject(raw)

  const title = textOrEmpty(
    data.title ??
      data.titre ??
      data.heading ??
      data.name ??
      data.nom ??
      data.message
  )

  if (!title) return null

  const rawId = textOrNull(data.id ?? data._id)
  const id = rawId ?? `hero-${index}-${slugify(title) || 'slide'}`

  const config = asObject(parseJsonValue(data.config))

  const sortOrder =
    Number(
      data.sort_order ??
        data.priority ??
        data.priorite ??
        data.order ??
        0
    ) || 0

  const isActiveRaw = data.is_active ?? data.active ?? data.est_actif
  const is_active =
    isActiveRaw === undefined || isActiveRaw === null
      ? true
      : normalizeBoolean(isActiveRaw, true)

  const image_url = textOrEmpty(
    data.image_url ??
      data.imageUrl ??
      data.image ??
      data.photo ??
      data.thumbnail ??
      data.background ??
      data.background_image ??
      data.banner_image
  )

  const cta_label = textOrEmpty(
    data.cta_label ??
      data.cta_text ??
      data.button_text ??
      data.bouton_texte ??
      data.cta
  )

  const cta_href = textOrEmpty(
    data.cta_href ??
      data.cta_link ??
      data.link ??
      data.href ??
      data.lien
  )

  return {
    id,
    title,
    highlight: textOrEmpty(
      data.highlight ??
        data.sous_titre ??
        data.subtitle ??
        data.sub_title ??
        data.badge
    ),
    description: textOrEmpty(
      data.description ??
        data.texte ??
        data.text ??
        data.content
    ),
    image_url,
    cta_label: cta_label || 'Découvrir',
    cta_href: cta_href || '#',
    is_active,
    sort_order: sortOrder,
    start_date: textOrNull(
      data.start_date ??
        data.startDate ??
        data.date_debut ??
        data.published_at
    ),
    end_date: textOrNull(
      data.end_date ??
        data.endDate ??
        data.date_fin ??
        data.expires_at
    ),
    image_alt:
      textOrNull(
        data.image_alt ??
          data.alt ??
          data.image_alternative
      ) ?? title,
    priority: sortOrder === 0,
    config:
      Object.keys(config).length > 0
        ? (config as Record<string, unknown>)
        : undefined,
  }
}

function parseDateValue(value?: string | null): Date | null {
  if (!value) return null

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isSlideVisible(slide: HeroSlide, now: Date): boolean {
  if (slide.is_active === false) return false

  const start = parseDateValue(slide.start_date)
  if (start && start > now) return false

  const end = parseDateValue(slide.end_date)

  if (end) {
    if (
      typeof slide.end_date === 'string' &&
      slide.end_date.length <= 10
    ) {
      end.setHours(23, 59, 59, 999)
    }

    if (end < now) return false
  }

  return true
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HANDLER                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(): Promise<NextResponse<HeroResponse>> {
  if (!supabase) {
    console.warn('[api/hero] Supabase server client non configuré')

    return NextResponse.json(
      {
        slides: [],
        total: 0,
        generatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    )
  }

  try {
    const { data, error } = await supabase
      .from('hero_slides')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[api/hero] Erreur Supabase:', error.message)

      return NextResponse.json(
        {
          slides: [],
          total: 0,
          generatedAt: new Date().toISOString(),
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
          },
        }
      )
    }

    const now = new Date()

    const slides = (Array.isArray(data) ? data : [])
      .map((item, index) => normalizeSlide(item, index))
      .filter((slide): slide is HeroSlide => slide !== null)
      .filter((slide) => isSlideVisible(slide, now))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    return NextResponse.json(
      {
        slides,
        total: slides.length,
        generatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    )
  } catch (err) {
    console.error('[api/hero] Erreur inattendue:', err)

    return NextResponse.json(
      {
        slides: [],
        total: 0,
        generatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    )
  }
}