// features/admin/produits/lib/rich-content-utils.ts

import type {
  RichComparison,
  RichContent,
  RichFinalCta,
  RichGallery,
  RichHero,
  RichHighlight,
  RichSection,
  RichSpecRow,
  RichVideo,
} from '../types'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `rich-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function safeString(value: any, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  return String(value)
}

function safeNullableString(value: any): string | null {
  const s = safeString(value, '')
  return s.trim() ? s : null
}

function safeBoolean(value: any, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function sanitizeHtmlSafe(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
}

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZERS                                                    */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeHero(input: any): RichHero | undefined {
  if (!input || typeof input !== 'object') return undefined

  const hero: RichHero = {
    title: safeString(input.title),
    subtitle: safeString(input.subtitle),
    description: safeString(input.description),
    image: safeNullableString(input.image),
    videoUrl: safeNullableString(input.videoUrl),
    ctaLabel: safeNullableString(input.ctaLabel),
    ctaAction:
      input.ctaAction === 'scroll_specs' ||
      input.ctaAction === 'add_to_cart' ||
      input.ctaAction === 'none'
        ? input.ctaAction
        : 'none',
  }

  const hasContent =
    hero.title ||
    hero.subtitle ||
    hero.description ||
    hero.image ||
    hero.videoUrl ||
    hero.ctaLabel

  return hasContent ? hero : undefined
}

function normalizeSpecs(input: any): RichSpecRow[] {
  if (!Array.isArray(input)) return []

  return input
    .map((row) => ({
      label: safeString(row?.label).trim(),
      value: safeString(row?.value).trim(),
    }))
    .filter((row) => row.label || row.value)
}

function normalizeHighlights(input: any): RichHighlight[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item) => ({
      title: safeString(item?.title).trim(),
      description: safeString(item?.description).trim(),
      icon: safeNullableString(item?.icon),
    }))
    .filter((item) => item.title || item.description)
}

function normalizeGalleries(input: any): RichGallery[] {
  if (!Array.isArray(input)) return []

  return input
    .map((gallery) => ({
      title: safeString(gallery?.title).trim(),
      images: Array.isArray(gallery?.images)
        ? gallery.images.filter(Boolean).map(String)
        : [],
    }))
    .filter((gallery) => gallery.images.length > 0 || gallery.title)
}

function normalizeVideos(input: any): RichVideo[] {
  if (!Array.isArray(input)) return []

  return input
    .map((video) => ({
      title: safeString(video?.title).trim(),
      url: safeString(video?.url).trim(),
      poster: safeNullableString(video?.poster),
    }))
    .filter((video) => video.url)
}

function normalizeComparison(input: any): RichComparison | null {
  if (!input || typeof input !== 'object') return null

  const columns = Array.isArray(input.columns)
    ? input.columns
        .map((column: any) => ({
          name: safeString(column?.name).trim(),
          attributes:
            column?.attributes && typeof column.attributes === 'object'
              ? Object.fromEntries(
                  Object.entries(column.attributes).map(([key, value]) => [
                    String(key),
                    safeString(value),
                  ])
                )
              : {},
        }))
        .filter((column: any) => column.name)
    : []

  if (columns.length === 0) return null

  return {
    title: safeString(input.title).trim(),
    columns,
  }
}

function normalizeFinalCta(input: any): RichFinalCta | null {
  if (!input || typeof input !== 'object') return null

  const cta = {
    title: safeString(input.title).trim(),
    description: safeString(input.description).trim(),
    buttonLabel: safeString(input.buttonLabel).trim(),
  }

  if (!cta.title && !cta.description && !cta.buttonLabel) return null

  return cta
}

function normalizeSection(input: any): RichSection | null {
  if (!input || typeof input !== 'object') return null

  const id = safeString(input.id) || generateId()
  const type = safeString(input.type)

  switch (type) {
    case 'text_image':
      return {
        id,
        type: 'text_image',
        title: safeString(input.title),
        text: safeString(input.text),
        image: safeNullableString(input.image),
        layout:
          input.layout === 'image_left' ||
          input.layout === 'image_right' ||
          input.layout === 'image_top' ||
          input.layout === 'image_center'
            ? input.layout
            : 'image_right',
      }

    case 'features_grid':
      return {
        id,
        type: 'features_grid',
        title: safeString(input.title),
        items: Array.isArray(input.items)
          ? input.items
              .map((item: any) => ({
                title: safeString(item?.title),
                description: safeString(item?.description),
                icon: safeNullableString(item?.icon),
              }))
              .filter((item: any) => item.title || item.description)
          : [],
      }

    case 'full_width_image':
      return {
        id,
        type: 'full_width_image',
        image: safeString(input.image),
        caption: safeString(input.caption),
      }

    case 'video_block':
      return {
        id,
        type: 'video_block',
        url: safeString(input.url),
        poster: safeNullableString(input.poster),
        title: safeString(input.title),
      }

    case 'stats_row':
      return {
        id,
        type: 'stats_row',
        items: Array.isArray(input.items)
          ? input.items
              .map((item: any) => ({
                value: safeString(item?.value),
                label: safeString(item?.label),
              }))
              .filter((item: any) => item.value || item.label)
          : [],
      }

    case 'quote':
      return {
        id,
        type: 'quote',
        text: safeString(input.text),
        author: safeString(input.author),
      }

    case 'html_safe':
      return {
        id,
        type: 'html_safe',
        html: sanitizeHtmlSafe(safeString(input.html)),
      }

    default:
      return null
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUBLIC API                                                     */
/* ═══════════════════════════════════════════════════════════════ */

export function normalizeRichContent(
  input: any,
  fallback?: Partial<RichContent>
): RichContent {
  const base: RichContent = {
    enabled: safeBoolean(input?.enabled ?? fallback?.enabled, false),
    sourceUrl: safeNullableString(input?.sourceUrl ?? fallback?.sourceUrl),
    templateId: safeString(
      input?.templateId ?? fallback?.templateId ?? 'generic'
    ),
    generatedBy:
      input?.generatedBy === 'ai' ||
      input?.generatedBy === 'manual' ||
      input?.generatedBy === 'template'
        ? input.generatedBy
        : fallback?.generatedBy ?? 'manual',
    updatedAt: safeString(input?.updatedAt ?? fallback?.updatedAt),
    hero: normalizeHero(input?.hero ?? fallback?.hero),
    sections: Array.isArray(input?.sections)
      ? (input.sections
          .map(normalizeSection)
          .filter(Boolean) as RichSection[])
      : Array.isArray(fallback?.sections)
      ? (fallback.sections
          .map(normalizeSection)
          .filter(Boolean) as RichSection[])
      : [],
    highlights: normalizeHighlights(input?.highlights ?? fallback?.highlights),
    specs: normalizeSpecs(input?.specs ?? fallback?.specs),
    galleries: normalizeGalleries(input?.galleries ?? fallback?.galleries),
    videos: normalizeVideos(input?.videos ?? fallback?.videos),
    comparison: normalizeComparison(input?.comparison ?? fallback?.comparison),
    finalCta: normalizeFinalCta(input?.finalCta ?? fallback?.finalCta),
  }

  return base
}

export function createEmptyRichContent(): RichContent {
  return normalizeRichContent({
    enabled: false,
    templateId: 'generic',
    generatedBy: 'manual',
    hero: {
      title: '',
      subtitle: '',
      description: '',
      image: null,
      videoUrl: null,
      ctaLabel: '',
      ctaAction: 'none',
    },
    sections: [],
    highlights: [],
    specs: [],
    galleries: [],
    videos: [],
    comparison: null,
    finalCta: null,
  })
}