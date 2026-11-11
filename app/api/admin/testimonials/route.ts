// app/api/admin/testimonials/route.ts
// ============================================================================
// API Admin – Témoignages / Avis clients
// Contrôle total : CRUD, statut, featured, réponse, bulk, stats, audit, réglages.
// Sans wallet / portefeuille / solde / retrait.
// ============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'

import {
  DEFAULT_TESTIMONIAL_SETTINGS,
  DEFAULT_TESTIMONIAL_STATS,
  normalizeSettings,
  normalizeStats,
  normalizeTestimonial,
  toBool,
  toNum,
  type TestimonialAuditLog,
  type TestimonialSettings,
  type TestimonialStats,
} from '@/lib/trust' // fallback si import cassé, corrigé ci-dessous

// Import correct depuis lib/testimonials
import {
  DEFAULT_TESTIMONIAL_SETTINGS as SETTINGS_FALLBACK,
  DEFAULT_TESTIMONIAL_STATS as STATS_FALLBACK,
  normalizeSettings as normalizeSettingsFallback,
  normalizeStats as normalizeStatsFallback,
  normalizeTestimonial as normalizeTestimonialFallback,
} from '@/lib/testimonials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TABLES = {
  testimonials: 'testimonials',
  settings: 'testimonial_settings',
  logs: 'testimonial_audit_logs',
  profiles: 'profiles',
}

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

function normalizeRole(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function hasRole(values: unknown[], expected: string): boolean {
  return values.some((value) => normalizeRole(value) === expected)
}

async function getSupabaseClients(): Promise<{
  supabase: any
  supabaseAdmin: any
}> {
  const userClient: any = await createClient(false)
  const adminClient: any = await createClient(true)

  return {
    supabase: userClient?.supabase ?? userClient,
    supabaseAdmin: adminClient?.supabase ?? adminClient,
  }
}

interface AdminContext {
  admin: any
  userId: string
  response?: NextResponse
}

async function authenticateAdmin(): Promise<AdminContext> {
  try {
    const { supabase, supabaseAdmin } = await getSupabaseClients()

    if (!supabase || !supabaseAdmin) {
      return {
        admin: null,
        userId: '',
        response: NextResponse.json(
          {
            error: 'Configuration Supabase invalide côté serveur.',
            code: 'SUPABASE_CLIENT_ERROR',
          },
          { status: 500 }
        ),
      }
    }

    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData?.user) {
      return {
        admin: supabaseAdmin,
        userId: '',
        response: NextResponse.json(
          {
            error: 'Authentification requise.',
            code: 'UNAUTHORIZED',
          },
          { status: 401 }
        ),
      }
    }

    const user = authData.user

    const metadataRoles = [
      user?.user_metadata?.role,
      user?.user_metadata?.type_user,
      user?.app_metadata?.role,
      user?.app_metadata?.type_user,
      user?.role,
    ].filter(Boolean)

    if (hasRole(metadataRoles, 'admin')) {
      return { admin: supabaseAdmin, userId: String(user.id) }
    }

    try {
      const { data: profile } = await supabaseAdmin
        .from(TABLES.profiles)
        .select('id, type_user, role, is_admin')
        .eq('id', user.id)
        .maybeSingle()

      const profileRoles = [profile?.type_user, profile?.role].filter(Boolean)

      if (
        hasRole(profileRoles, 'admin') ||
        toBool(profile?.is_admin, false)
      ) {
        return { admin: supabaseAdmin, userId: String(user.id) }
      }
    } catch {
      // profiles peut être absent
    }

    return {
      admin: supabaseAdmin,
      userId: String(user.id),
      response: NextResponse.json(
        {
          error: 'Accès réservé aux administrateurs.',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      ),
    }
  } catch (error: any) {
    return {
      admin: null,
      userId: '',
      response: NextResponse.json(
        {
          error: 'Erreur serveur lors de la vérification admin.',
          code: 'INTERNAL_ERROR',
          details:
            process.env.NODE_ENV === 'development'
              ? errorMessage(error, 'Erreur inconnue')
              : undefined,
        },
        { status: 500 }
      ),
    }
  }
}

async function audit(
  admin: any,
  userId: string,
  action: string,
  entityId: string | null,
  before: any = null,
  after: any = null
): Promise<void> {
  try {
    await admin.from(TABLES.logs).insert({
      actor_id: userId || null,
      action,
      entity_id: entityId,
      before: before ?? null,
      after: after ?? null,
      created_at: new Date().toISOString(),
    })
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      console.warn('[TESTIMONIALS ADMIN] Audit log failed:', error?.message)
    }
  }
}

function pickTestimonialPayload(body: any): any {
  const payload: any = {}

  if (body?.name !== undefined) payload.name = String(body.name).trim()
  if (body?.role !== undefined) {
    payload.role = body.role === null || body.role === '' ? null : String(body.role)
  }
  if (body?.avatar !== undefined || body?.avatar_url !== undefined) {
    const avatar = body.avatar ?? body.avatar_url
    payload.avatar_url = avatar === null || avatar === '' ? null : String(avatar)
  }
  if (body?.text !== undefined || body?.content !== undefined) {
    payload.content = String(body.text ?? body.content).trim()
  }
  if (body?.rating !== undefined) payload.rating = toNum(body.rating, 5)
  if (body?.produit !== undefined || body?.product_name !== undefined) {
    const product = body.produit ?? body.product_name
    payload.product_name = product === null || product === '' ? null : String(product)
  }
  if (body?.product_id !== undefined) {
    payload.product_id =
      body.product_id === null || body.product_id === ''
        ? null
        : String(body.product_id)
  }
  if (body?.status !== undefined) payload.status = String(body.status)
  if (body?.verified !== undefined) payload.verified = toBool(body.verified, false)
  if (body?.is_featured !== undefined) {
    payload.is_featured = toBool(body.is_featured, false)
  }
  if (body?.likes !== undefined) payload.likes = Math.max(0, toNum(body.likes, 0))
  if (body?.admin_response !== undefined) {
    payload.admin_response =
      body.admin_response === null || body.admin_response === ''
        ? null
        : String(body.admin_response)
  }
  if (body?.sort_order !== undefined) payload.sort_order = toNum(body.sort_order, 0)

  return payload
}

function pickSettingsPayload(body: any): Partial<TestimonialSettings> {
  const payload: Partial<TestimonialSettings> = {}

  if (body?.allow_anonymous_submissions !== undefined) {
    payload.allow_anonymous_submissions = toBool(body.allow_anonymous_submissions, true)
  }
  if (body?.require_login_to_post !== undefined) {
    payload.require_login_to_post = toBool(body.require_login_to_post, false)
  }
  if (body?.auto_publish_authenticated !== undefined) {
    payload.auto_publish_authenticated = toBool(body.auto_publish_authenticated, false)
  }
  if (body?.default_rating !== undefined) {
    payload.default_rating = toNum(body.default_rating, 5)
  }
  if (body?.max_featured !== undefined) {
    payload.max_featured = toNum(body.max_featured, 6)
  }
  if (body?.moderation_message !== undefined) {
    payload.moderation_message = String(body.moderation_message)
  }
  if (body?.show_product_field !== undefined) {
    payload.show_product_field = toBool(body.show_product_field, true)
  }
  if (body?.show_avatar_field !== undefined) {
    payload.show_avatar_field = toBool(body.show_avatar_field, true)
  }
  if (body?.show_likes !== undefined) {
    payload.show_likes = toBool(body.show_likes, true)
  }
  if (body?.advanced_config !== undefined) {
    if (typeof body.advanced_config === 'string') {
      try {
        payload.advanced_config = JSON.parse(body.advanced_config)
      } catch {
        payload.advanced_config = {}
      }
    } else if (
      body.advanced_config &&
      typeof body.advanced_config === 'object'
    ) {
      payload.advanced_config = body.advanced_config
    } else {
      payload.advanced_config = {}
    }
  }

  return payload
}

async function computeAdminStats(admin: any): Promise<TestimonialStats> {
  try {
    const [
      totalRes,
      publishedRes,
      pendingRes,
      rejectedRes,
      archivedRes,
      featuredRes,
      verifiedRes,
      ratingsRes,
      likesRes,
      productsRes,
    ] = await Promise.all([
      admin.from(TABLES.testimonials).select('*', { count: 'exact', head: true }),
      admin.from(TABLES.testimonials).select('*', { count: 'exact', head: true }).eq('status', 'published'),
      admin.from(TABLES.testimonials).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from(TABLES.testimonials).select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
      admin.from(TABLES.testimonials).select('*', { count: 'exact', head: true }).eq('status', 'archived'),
      admin.from(TABLES.testimonials).select('*', { count: 'exact', head: true }).eq('is_featured', true),
      admin.from(TABLES.testimonials).select('*', { count: 'exact', head: true }).eq('verified', true),
      admin.from(TABLES.testimonials).select('rating').limit(10000),
      admin.from(TABLES.testimonials).select('likes').limit(10000),
      admin.from(TABLES.testimonials).select('product_name').not('product_name', 'is', null).limit(5000),
    ])

    const ratings = Array.isArray(ratingsRes.data) ? ratingsRes.data : []
    const likes = Array.isArray(likesRes.data) ? likesRes.data : []
    const productsRaw = Array.isArray(productsRes.data) ? productsRes.data : []

    const sumRating = ratings.reduce((acc: number, row: any) => acc + toNum(row.rating, 0), 0)
    const avgRating = ratings.length > 0 ? (sumRating / ratings.length).toFixed(1) : '0.0'

    const totalLikes = likes.reduce((acc: number, row: any) => acc + toNum(row.likes, 0), 0)

    const distribution: Record<string, number> = {
      '5': 0,
      '4': 0,
      '3': 0,
      '2': 0,
      '1': 0,
    }

    for (const row of ratings) {
      const rating = Math.round(toNum(row.rating, 0))
      const key = String(Math.min(5, Math.max(1, rating)))
      distribution[key] = (distribution[key] || 0) + 1
    }

    const productsSet = new Set<string>()
    for (const row of productsRaw) {
      const product = String(row.product_name || '').trim()
      if (product) productsSet.add(product)
    }

    return {
      total: toNum(totalRes.count, 0),
      published: toNum(publishedRes.count, 0),
      pending: toNum(pendingRes.count, 0),
      rejected: toNum(rejectedRes.count, 0),
      archived: toNum(archivedRes.count, 0),
      featured: toNum(featuredRes.count, 0),
      verified: toNum(verifiedRes.count, 0),
      avgRating,
      totalLikes,
      distribution,
      products: Array.from(productsSet).slice(0, 100),
    }
  } catch {
    return STATS_FALLBACK
  }
}

async function fetchLogs(admin: any): Promise<TestimonialAuditLog[]> {
  try {
    const { data, error } = await admin
      .from(TABLES.logs)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error || !Array.isArray(data)) return []

    return data.map((row: any) => ({
      id: String(row.id || ''),
      actor_id: row.actor_id ? String(row.actor_id) : null,
      action: String(row.action || ''),
      entity_id: row.entity_id ? String(row.entity_id) : null,
      before: row.before ?? null,
      after: row.after ?? null,
      created_at: String(row.created_at || new Date().toISOString()),
    }))
  } catch {
    return []
  }
}

async function fetchSettings(admin: any): Promise<TestimonialSettings> {
  try {
    const { data, error } = await admin
      .from(TABLES.settings)
      .select('*')
      .eq('id', 'global')
      .maybeSingle()

    if (error || !data) return SETTINGS_FALLBACK

    return normalizeSettingsFallback(data)
  } catch {
    return SETTINGS_FALLBACK
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHEMAS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const getSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(10),

  status: z
    .enum(['all', 'pending', 'published', 'rejected', 'archived'])
    .optional()
    .default('all'),

  rating: z.string().optional().default('all'),
  verified: z.enum(['all', 'true', 'false']).optional().default('all'),
  featured: z.enum(['all', 'true', 'false']).optional().default('all'),

  product: z.string().max(160).optional().default(''),
  search: z.string().max(160).optional().default(''),

  sort: z
    .enum(['created_at', 'rating', 'likes', 'is_featured', 'status'])
    .optional()
    .default('created_at'),

  order: z.enum(['asc', 'desc']).optional().default('desc'),
})

const postSchema = z
  .object({
    action: z.string().min(1),
    payload: z.any().optional(),
  })
  .passthrough()

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const auth = await authenticateAdmin()
  if (auth.response) return auth.response

  try {
    const { searchParams } = new URL(request.url)

    const parsed = getSchema.safeParse(
      Object.fromEntries(searchParams.entries())
    )

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Paramètres invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
          data: [],
        },
        { status: 400 }
      )
    }

    const input = parsed.data
    const admin = auth.admin

    let query = admin.from(TABLES.testimonials).select('*')

    if (input.status !== 'all') {
      query = query.eq('status', input.status)
    }

    if (input.rating !== 'all') {
      const rating = Number(input.rating)
      if (Number.isFinite(rating)) {
        query = query.gte('rating', rating).lt('rating', rating + 1)
      }
    }

    if (input.verified !== 'all') {
      query = query.eq('verified', input.verified === 'true')
    }

    if (input.featured !== 'all') {
      query = query.eq('is_featured', input.featured === 'true')
    }

    if (input.product) {
      query = query.ilike('product_name', `%${input.product}%`)
    }

    if (input.search) {
      const search = `%${input.search}%`
      query = query.or(
        `name.ilike.${search},content.ilike.${search},product_name.ilike.${search},admin_response.ilike.${search}`
      )
    }

    query = query.order(input.sort, { ascending: input.order === 'asc' })

    if (input.sort !== 'created_at') {
      query = query.order('created_at', { ascending: false })
    }

    const from = (input.page - 1) * input.limit
    const to = from + input.limit - 1

    const [{ data, count, error }, stats, logs, settings] = await Promise.all([
      query.range(from, to),
      computeAdminStats(admin),
      fetchLogs(admin),
      fetchSettings(admin),
    ])

    if (error) {
      if (isTableMissingError(error)) {
        return NextResponse.json(
          {
            success: false,
            error:
              'La table public.testimonials est introuvable. Exécute la migration SQL.',
            code: 'TABLE_MISSING',
            details: errorMessage(error, 'Table manquante'),
            data: [],
          },
          { status: 503 }
        )
      }

      throw error
    }

    const rawItems = Array.isArray(data) ? data : []
    const items = rawItems
      .map(normalizeTestimonialFallback)
      .filter((item): item is any => Boolean(item))

    const total = toNum(count, items.length)
    const totalPages = Math.max(1, Math.ceil(total / input.limit))

    return NextResponse.json({
      success: true,
      data: items,
      meta: {
        total,
        page: input.page,
        limit: input.limit,
        totalPages,
        stats,
        products: stats.products,
      },
      logs,
      settings,
    })
  } catch (error: any) {
    console.error('Crash GET /api/admin/testimonials', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Erreur serveur lors du chargement des témoignages.',
        code: 'INTERNAL_ERROR',
        details:
          process.env.NODE_ENV === 'development'
            ? errorMessage(error, 'Erreur inconnue')
            : undefined,
        data: [],
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const auth = await authenticateAdmin()
  if (auth.response) return auth.response

  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Corps de requête JSON invalide.',
        code: 'INVALID_JSON',
      },
      { status: 400 }
    )
  }

  const parsed = postSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Action invalide.',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const action = parsed.data.action
  const payload = parsed.data.payload ?? body
  const admin = auth.admin
  const userId = auth.userId

  try {
    /* ------------------------------------------------------------ */
    /* SAVE                                                          */
    /* ------------------------------------------------------------ */

    if (action === 'save') {
      const testimonialPayload = pickTestimonialPayload(payload)

      if (!testimonialPayload.name) {
        return NextResponse.json(
          { success: false, error: 'Nom requis.', code: 'NAME_REQUIRED' },
          { status: 400 }
        )
      }

      if (!testimonialPayload.content) {
        return NextResponse.json(
          { success: false, error: 'Contenu requis.', code: 'CONTENT_REQUIRED' },
          { status: 400 }
        )
      }

      let saved: any = null

      if (payload?.id) {
        const id = String(payload.id)

        const { data: before } = await admin
          .from(TABLES.testimonials)
          .select('*')
          .eq('id', id)
          .maybeSingle()

        if (
          testimonialPayload.status === 'published' &&
          !before?.published_at
        ) {
          testimonialPayload.published_at = new Date().toISOString()
        }

        const { data, error } = await admin
          .from(TABLES.testimonials)
          .update(testimonialPayload)
          .eq('id', id)
          .select('*')
          .maybeSingle()

        if (error) throw error

        saved = normalizeTestimonialFallback(data)

        await audit(admin, userId, 'update', id, before, data)
      } else {
        if (testimonialPayload.status === 'published') {
          testimonialPayload.published_at = new Date().toISOString()
        }

        const { data, error } = await admin
          .from(TABLES.testimonials)
          .insert(testimonialPayload)
          .select('*')
          .maybeSingle()

        if (error) throw error

        saved = normalizeTestimonialFallback(data)

        await audit(admin, userId, 'create', saved?.id ?? null, null, data)
      }

      return NextResponse.json({ success: true, data: saved })
    }

    /* ------------------------------------------------------------ */
    /* DELETE                                                        */
    /* ------------------------------------------------------------ */

    if (action === 'delete') {
      const id = String(payload?.id || '')

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'ID requis.', code: 'ID_REQUIRED' },
          { status: 400 }
        )
      }

      const { data: before } = await admin
        .from(TABLES.testimonials)
        .select('*')
        .eq('id', id)
        .maybeSingle()

      const { error } = await admin
        .from(TABLES.testimonials)
        .delete()
        .eq('id', id)

      if (error) throw error

      await audit(admin, userId, 'delete', id, before, null)

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* STATUS                                                        */
    /* ------------------------------------------------------------ */

    if (action === 'status') {
      const id = String(payload?.id || '')
      const status = String(payload?.status || '')

      if (!id || !status) {
        return NextResponse.json(
          { success: false, error: 'ID et statut requis.', code: 'INVALID_PAYLOAD' },
          { status: 400 }
        )
      }

      const { data: before } = await admin
        .from(TABLES.testimonials)
        .select('*')
        .eq('id', id)
        .maybeSingle()

      const updatePayload: any = { status }

      if (status === 'published' && !before?.published_at) {
        updatePayload.published_at = new Date().toISOString()
      }

      const { data, error } = await admin
        .from(TABLES.testimonials)
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw error

      await audit(admin, userId, 'status', id, before, data)

      return NextResponse.json({
        success: true,
        data: normalizeTestimonialFallback(data),
      })
    }

    /* ------------------------------------------------------------ */
    /* TOGGLE FEATURED                                               */
    /* ------------------------------------------------------------ */

    if (action === 'toggle-featured') {
      const id = String(payload?.id || '')
      const isFeatured = toBool(payload?.is_featured, false)

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'ID requis.', code: 'ID_REQUIRED' },
          { status: 400 }
        )
      }

      const { data: before } = await admin
        .from(TABLES.testimonials)
        .select('*')
        .eq('id', id)
        .maybeSingle()

      const { data, error } = await admin
        .from(TABLES.testimonials)
        .update({ is_featured: isFeatured })
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw error

      await audit(admin, userId, 'toggle_featured', id, before, data)

      return NextResponse.json({
        success: true,
        data: normalizeTestimonialFallback(data),
      })
    }

    /* ------------------------------------------------------------ */
    /* REPLY                                                         */
    /* ------------------------------------------------------------ */

    if (action === 'reply') {
      const id = String(payload?.id || '')
      const responseText = String(payload?.response || '').trim()

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'ID requis.', code: 'ID_REQUIRED' },
          { status: 400 }
        )
      }

      const { data: before } = await admin
        .from(TABLES.testimonials)
        .select('*')
        .eq('id', id)
        .maybeSingle()

      const { data, error } = await admin
        .from(TABLES.testimonials)
        .update({ admin_response: responseText || null })
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw error

      await audit(admin, userId, 'reply', id, before, data)

      return NextResponse.json({
        success: true,
        data: normalizeTestimonialFallback(data),
      })
    }

    /* ------------------------------------------------------------ */
    /* BULK STATUS                                                   */
    /* ------------------------------------------------------------ */

    if (action === 'bulk-status') {
      const ids: string[] = Array.isArray(payload?.ids)
        ? payload.ids.map(String).filter(Boolean)
        : []

      const status = String(payload?.status || '')

      if (ids.length === 0 || !status) {
        return NextResponse.json(
          { success: false, error: 'IDs et statut requis.', code: 'INVALID_PAYLOAD' },
          { status: 400 }
        )
      }

      const { data: before } = await admin
        .from(TABLES.testimonials)
        .select('*')
        .in('id', ids)

      const updatePayload: any = { status }

      if (status === 'published') {
        updatePayload.published_at = new Date().toISOString()
      }

      const { error } = await admin
        .from(TABLES.testimonials)
        .update(updatePayload)
        .in('id', ids)

      if (error) throw error

      await audit(admin, userId, 'bulk_status', null, before, { ids, status })

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* BULK DELETE                                                   */
    /* ------------------------------------------------------------ */

    if (action === 'bulk-delete') {
      const ids: string[] = Array.isArray(payload?.ids)
        ? payload.ids.map(String).filter(Boolean)
        : []

      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: 'IDs requis.', code: 'IDS_REQUIRED' },
          { status: 400 }
        )
      }

      const { data: before } = await admin
        .from(TABLES.testimonials)
        .select('*')
        .in('id', ids)

      const { error } = await admin
        .from(TABLES.testimonials)
        .delete()
        .in('id', ids)

      if (error) throw error

      await audit(admin, userId, 'bulk_delete', null, before, null)

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* SAVE SETTINGS                                                 */
    /* ------------------------------------------------------------ */

    if (action === 'save-settings') {
      const settingsPayload = pickSettingsPayload(payload)

      const { data: before } = await admin
        .from(TABLES.settings)
        .select('*')
        .eq('id', 'global')
        .maybeSingle()

      const { data, error } = await admin
        .from(TABLES.settings)
        .upsert(
          {
            id: 'global',
            ...settingsPayload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select('*')
        .maybeSingle()

      if (error) throw error

      await audit(admin, userId, 'update_settings', 'global', before, data)

      return NextResponse.json({
        success: true,
        data: normalizeSettingsFallback(data ?? SETTINGS_FALLBACK),
      })
    }

    /* ------------------------------------------------------------ */
    /* CLEAR LOGS                                                    */
    /* ------------------------------------------------------------ */

    if (action === 'clear-logs') {
      const { data: before } = await admin.from(TABLES.logs).select('*')

      await admin
        .from(TABLES.logs)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      await audit(admin, userId, 'clear_logs', null, before, null)

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* UNKNOWN                                                       */
    /* ------------------------------------------------------------ */

    return NextResponse.json(
      {
        success: false,
        error: `Action inconnue : ${action}`,
        code: 'UNKNOWN_ACTION',
        supported_actions: [
          'save',
          'delete',
          'status',
          'toggle-featured',
          'reply',
          'bulk-status',
          'bulk-delete',
          'save-settings',
          'clear-logs',
        ],
      },
      { status: 400 }
    )
  } catch (error: any) {
    if (isTableMissingError(error)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Les tables testimonials sont introuvables. Exécute la migration SQL.',
          code: 'TABLE_MISSING',
          details: errorMessage(error, 'Table manquante'),
        },
        { status: 503 }
      )
    }

    console.error('Crash POST /api/admin/testimonials', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Erreur serveur lors de la mise à jour des témoignages.',
        code: 'INTERNAL_ERROR',
        details:
          process.env.NODE_ENV === 'development'
            ? errorMessage(error, 'Erreur inconnue')
            : undefined,
      },
      { status: 500 }
    )
  }
}