// app/api/admin/trust/route.ts
// ============================================================================
// API Admin – Section Confiance / Trust
// Permet de tout contrôler : stats, témoignages, réglages, audit, import/export.
// Sans wallet / portefeuille / solde / retrait.
//
// Endpoints :
// - GET  /api/admin/trust
// - POST /api/admin/trust
//
// Actions POST :
// - save-stat
// - delete-stat
// - reorder-stats
// - bulk-stats
// - save-testimonial
// - delete-testimonial
// - reorder-testimonials
// - bulk-testimonials
// - save-settings
// - reset-defaults
// - import-data
// - clear-logs
// ============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'

import {
  DEFAULT_TRUST_SETTINGS,
  DEFAULT_TRUST_STATS,
  DEFAULT_TRUST_TESTIMONIALS,
  normalizeSettings,
  normalizeStat,
  normalizeTestimonial,
  sortTrustItems,
  toBool,
  toNum,
  type TrustAuditLog,
  type TrustSettings,
  type TrustStat,
  type TrustTestimonial,
} from '@/lib/trust'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const TABLES = {
  stats: 'trust_stats',
  testimonials: 'trust_testimonials',
  settings: 'trust_settings',
  logs: 'trust_audit_logs',
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
      // profiles peut être absent : on continue
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
  entityType: string,
  entityId: string | null,
  before: any = null,
  after: any = null
): Promise<void> {
  try {
    await admin.from(TABLES.logs).insert({
      actor_id: userId || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      before: before ?? null,
      after: after ?? null,
      created_at: new Date().toISOString(),
    })
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      console.warn('[TRUST ADMIN] Audit log failed:', error?.message)
    }
  }
}

function pickStatPayload(body: any): Partial<TrustStat> {
  const payload: Partial<TrustStat> = {}

  if (body?.label !== undefined) payload.label = String(body.label).trim()
  if (body?.value !== undefined) payload.value = toNum(body.value, 0)
  if (body?.suffix !== undefined) payload.suffix = String(body.suffix ?? '')
  if (body?.prefix !== undefined) payload.prefix = String(body.prefix ?? '')
  if (body?.decimals !== undefined) payload.decimals = toNum(body.decimals, 0)
  if (body?.icon_name !== undefined) payload.icon_name = String(body.icon_name)
  if (body?.description !== undefined) {
    payload.description =
      body.description === null || body.description === ''
        ? null
        : String(body.description)
  }
  if (body?.color !== undefined) payload.color = String(body.color)
  if (body?.sort_order !== undefined) payload.sort_order = toNum(body.sort_order, 0)
  if (body?.is_active !== undefined) payload.is_active = toBool(body.is_active, true)

  return payload
}

function pickTestimonialPayload(body: any): Partial<TrustTestimonial> {
  const payload: Partial<TrustTestimonial> = {}

  if (body?.author !== undefined) payload.author = String(body.author).trim()
  if (body?.role !== undefined) {
    payload.role =
      body.role === null || body.role === '' ? null : String(body.role)
  }
  if (body?.quote !== undefined) payload.quote = String(body.quote).trim()
  if (body?.rating !== undefined) payload.rating = toNum(body.rating, 5)
  if (body?.avatar_url !== undefined) {
    payload.avatar_url =
      body.avatar_url === null || body.avatar_url === ''
        ? null
        : String(body.avatar_url)
  }
  if (body?.commune !== undefined) {
    payload.commune =
      body.commune === null || body.commune === ''
        ? null
        : String(body.commune)
  }
  if (body?.verified !== undefined) payload.verified = toBool(body.verified, false)
  if (body?.sort_order !== undefined) payload.sort_order = toNum(body.sort_order, 0)
  if (body?.is_active !== undefined) payload.is_active = toBool(body.is_active, true)

  return payload
}

function pickSettingsPayload(body: any): Partial<TrustSettings> {
  const payload: Partial<TrustSettings> = {}

  if (body?.show_header !== undefined) payload.show_header = toBool(body.show_header, true)
  if (body?.section_title !== undefined) payload.section_title = String(body.section_title)
  if (body?.section_subtitle !== undefined) payload.section_subtitle = String(body.section_subtitle)
  if (body?.badge_text !== undefined) payload.badge_text = String(body.badge_text)
  if (body?.show_stats !== undefined) payload.show_stats = toBool(body.show_stats, true)
  if (body?.show_testimonials !== undefined) payload.show_testimonials = toBool(body.show_testimonials, true)
  if (body?.stats_columns !== undefined) payload.stats_columns = toNum(body.stats_columns, 8)
  if (body?.testimonials_display_mode !== undefined) {
    payload.testimonials_display_mode =
      body.testimonials_display_mode === 'grid' ? 'grid' : 'rotate'
  }
  if (body?.testimonials_max_display !== undefined) {
    payload.testimonials_max_display = toNum(body.testimonials_max_display, 1)
  }
  if (body?.autoplay_interval_ms !== undefined) {
    payload.autoplay_interval_ms = toNum(body.autoplay_interval_ms, 6000)
  }
  if (body?.pause_on_hover !== undefined) payload.pause_on_hover = toBool(body.pause_on_hover, true)
  if (body?.animation_enabled !== undefined) payload.animation_enabled = toBool(body.animation_enabled, true)
  if (body?.show_rating_stars !== undefined) payload.show_rating_stars = toBool(body.show_rating_stars, true)
  if (body?.show_avatar_initials !== undefined) payload.show_avatar_initials = toBool(body.show_avatar_initials, true)
  if (body?.accent_color !== undefined) payload.accent_color = String(body.accent_color)

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

async function getNextSortOrder(
  admin: any,
  table: string
): Promise<number> {
  try {
    const { data } = await admin
      .from(table)
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    return toNum(data?.sort_order, -1) + 1
  } catch {
    return 0
  }
}

async function fetchAllTrustData(admin: any): Promise<{
  stats: TrustStat[]
  testimonials: TrustTestimonial[]
  settings: TrustSettings
  logs: TrustAuditLog[]
}> {
  const [statsRes, testimonialsRes, settingsRes, logsRes] =
    await Promise.all([
      admin.from(TABLES.stats).select('*'),
      admin.from(TABLES.testimonials).select('*'),
      admin.from(TABLES.settings).select('*').eq('id', 'global').maybeSingle(),
      admin
        .from(TABLES.logs)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

  const rawStats = Array.isArray(statsRes.data) ? statsRes.data : []
  const rawTestimonials = Array.isArray(testimonialsRes.data)
    ? testimonialsRes.data
    : []
  const rawSettings = settingsRes.data ?? DEFAULT_TRUST_SETTINGS
  const rawLogs = Array.isArray(logsRes.data) ? logsRes.data : []

  return {
    stats: sortTrustItems(
      rawStats
        .map((row: any, index: number) => normalizeStat(row, index))
        .filter((stat): stat is TrustStat => Boolean(stat))
    ),
    testimonials: sortTrustItems(
      rawTestimonials
        .map((row: any, index: number) => normalizeTestimonial(row, index))
        .filter((item): item is TrustTestimonial => Boolean(item))
    ),
    settings: normalizeSettings(rawSettings),
    logs: rawLogs.map((row: any) => ({
      id: String(row.id || ''),
      actor_id: row.actor_id ? String(row.actor_id) : null,
      action: String(row.action || ''),
      entity_type: String(row.entity_type || ''),
      entity_id: row.entity_id ? String(row.entity_id) : null,
      before: row.before ?? null,
      after: row.after ?? null,
      created_at: String(row.created_at || new Date().toISOString()),
    })),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET() {
  const auth = await authenticateAdmin()
  if (auth.response) return auth.response

  try {
    const data = await fetchAllTrustData(auth.admin)

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error: any) {
    if (isTableMissingError(error)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Les tables trust_* sont introuvables. Exécute la migration SQL nécessaire.',
          code: 'TABLE_MISSING',
          details: errorMessage(error, 'Table manquante'),
        },
        { status: 503 }
      )
    }

    console.error('Crash GET /api/admin/trust', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Erreur serveur lors du chargement des données de confiance.',
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

/* ═══════════════════════════════════════════════════════════════ */
/*  POST                                                           */
/* ═══════════════════════════════════════════════════════════════ */

const postSchema = z
  .object({
    action: z.string().min(1),
    payload: z.any().optional(),
  })
  .passthrough()

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
    /* SAVE STAT                                                     */
    /* ------------------------------------------------------------ */

    if (action === 'save-stat') {
      const statPayload = pickStatPayload(payload)

      if (!statPayload.label) {
        return NextResponse.json(
          { success: false, error: 'Le libellé est requis.', code: 'LABEL_REQUIRED' },
          { status: 400 }
        )
      }

      if (statPayload.value === undefined) {
        statPayload.value = 0
      }

      let saved: TrustStat | null = null

      if (payload?.id) {
        const id = String(payload.id)

        const { data: before } = await admin
          .from(TABLES.stats)
          .select('*')
          .eq('id', id)
          .maybeSingle()

        const { data, error } = await admin
          .from(TABLES.stats)
          .update(statPayload)
          .eq('id', id)
          .select('*')
          .maybeSingle()

        if (error) throw error

        saved = normalizeStat(data, 0)

        await audit(admin, userId, 'update', 'stat', id, before, data)
      } else {
        if (statPayload.sort_order === undefined) {
          statPayload.sort_order = await getNextSortOrder(admin, TABLES.stats)
        }

        const { data, error } = await admin
          .from(TABLES.stats)
          .insert(statPayload)
          .select('*')
          .maybeSingle()

        if (error) throw error

        saved = normalizeStat(data, 0)

        await audit(admin, userId, 'create', 'stat', saved?.id ?? null, null, data)
      }

      return NextResponse.json({ success: true, data: saved })
    }

    /* ------------------------------------------------------------ */
    /* DELETE STAT                                                   */
    /* ------------------------------------------------------------ */

    if (action === 'delete-stat') {
      const id = String(payload?.id || '')

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'ID requis.', code: 'ID_REQUIRED' },
          { status: 400 }
        )
      }

      const { data: before } = await admin
        .from(TABLES.stats)
        .select('*')
        .eq('id', id)
        .maybeSingle()

      const { error } = await admin.from(TABLES.stats).delete().eq('id', id)

      if (error) throw error

      await audit(admin, userId, 'delete', 'stat', id, before, null)

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* REORDER STATS                                                 */
    /* ------------------------------------------------------------ */

    if (action === 'reorder-stats') {
      const ids: string[] = Array.isArray(payload?.ids)
        ? payload.ids.map(String).filter(Boolean)
        : []

      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Aucun ID fourni.', code: 'IDS_REQUIRED' },
          { status: 400 }
        )
      }

      await Promise.all(
        ids.map((id, index) =>
          admin.from(TABLES.stats).update({ sort_order: index }).eq('id', id)
        )
      )

      await audit(admin, userId, 'reorder', 'stat', null, null, { ids })

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* BULK STATS                                                    */
    /* ------------------------------------------------------------ */

    if (action === 'bulk-stats') {
      const bulkAction = String(payload?.bulkAction || '')
      const ids: string[] = Array.isArray(payload?.ids)
        ? payload.ids.map(String).filter(Boolean)
        : []

      if (!bulkAction || ids.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Action et IDs requis.',
            code: 'BULK_INVALID',
          },
          { status: 400 }
        )
      }

      if (bulkAction === 'activate') {
        await admin
          .from(TABLES.stats)
          .update({ is_active: true })
          .in('id', ids)

        await audit(admin, userId, 'bulk_activate', 'stat', null, null, { ids })
      } else if (bulkAction === 'deactivate') {
        await admin
          .from(TABLES.stats)
          .update({ is_active: false })
          .in('id', ids)

        await audit(admin, userId, 'bulk_deactivate', 'stat', null, null, { ids })
      } else if (bulkAction === 'delete') {
        const { data: before } = await admin
          .from(TABLES.stats)
          .select('*')
          .in('id', ids)

        await admin.from(TABLES.stats).delete().in('id', ids)

        await audit(admin, userId, 'bulk_delete', 'stat', null, before, null)
      } else if (bulkAction === 'duplicate') {
        const { data: rows } = await admin
          .from(TABLES.stats)
          .select('*')
          .in('id', ids)

        const nextSort = await getNextSortOrder(admin, TABLES.stats)

        const duplicates = (rows || []).map((row: any, index: number) => ({
          label: `${row.label} (copie)`,
          value: row.value,
          suffix: row.suffix,
          prefix: row.prefix,
          decimals: row.decimals,
          icon_name: row.icon_name,
          description: row.description,
          color: row.color,
          sort_order: nextSort + index,
          is_active: false,
        }))

        if (duplicates.length > 0) {
          await admin.from(TABLES.stats).insert(duplicates)
        }

        await audit(admin, userId, 'bulk_duplicate', 'stat', null, rows, duplicates)
      } else {
        return NextResponse.json(
          { success: false, error: 'Action de masse inconnue.', code: 'UNKNOWN_BULK_ACTION' },
          { status: 400 }
        )
      }

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* SAVE TESTIMONIAL                                              */
    /* ------------------------------------------------------------ */

    if (action === 'save-testimonial') {
      const testimonialPayload = pickTestimonialPayload(payload)

      if (!testimonialPayload.author) {
        return NextResponse.json(
          { success: false, error: 'Auteur requis.', code: 'AUTHOR_REQUIRED' },
          { status: 400 }
        )
      }

      if (!testimonialPayload.quote) {
        return NextResponse.json(
          { success: false, error: 'Citation requise.', code: 'QUOTE_REQUIRED' },
          { status: 400 }
        )
      }

      let saved: TrustTestimonial | null = null

      if (payload?.id) {
        const id = String(payload.id)

        const { data: before } = await admin
          .from(TABLES.testimonials)
          .select('*')
          .eq('id', id)
          .maybeSingle()

        const { data, error } = await admin
          .from(TABLES.testimonials)
          .update(testimonialPayload)
          .eq('id', id)
          .select('*')
          .maybeSingle()

        if (error) throw error

        saved = normalizeTestimonial(data, 0)

        await audit(admin, userId, 'update', 'testimonial', id, before, data)
      } else {
        if (testimonialPayload.sort_order === undefined) {
          testimonialPayload.sort_order = await getNextSortOrder(
            admin,
            TABLES.testimonials
          )
        }

        const { data, error } = await admin
          .from(TABLES.testimonials)
          .insert(testimonialPayload)
          .select('*')
          .maybeSingle()

        if (error) throw error

        saved = normalizeTestimonial(data, 0)

        await audit(
          admin,
          userId,
          'create',
          'testimonial',
          saved?.id ?? null,
          null,
          data
        )
      }

      return NextResponse.json({ success: true, data: saved })
    }

    /* ------------------------------------------------------------ */
    /* DELETE TESTIMONIAL                                            */
    /* ------------------------------------------------------------ */

    if (action === 'delete-testimonial') {
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

      await audit(admin, userId, 'delete', 'testimonial', id, before, null)

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* REORDER TESTIMONIALS                                          */
    /* ------------------------------------------------------------ */

    if (action === 'reorder-testimonials') {
      const ids: string[] = Array.isArray(payload?.ids)
        ? payload.ids.map(String).filter(Boolean)
        : []

      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Aucun ID fourni.', code: 'IDS_REQUIRED' },
          { status: 400 }
        )
      }

      await Promise.all(
        ids.map((id, index) =>
          admin
            .from(TABLES.testimonials)
            .update({ sort_order: index })
            .eq('id', id)
        )
      )

      await audit(admin, userId, 'reorder', 'testimonial', null, null, { ids })

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* BULK TESTIMONIALS                                             */
    /* ------------------------------------------------------------ */

    if (action === 'bulk-testimonials') {
      const bulkAction = String(payload?.bulkAction || '')
      const ids: string[] = Array.isArray(payload?.ids)
        ? payload.ids.map(String).filter(Boolean)
        : []

      if (!bulkAction || ids.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Action et IDs requis.',
            code: 'BULK_INVALID',
          },
          { status: 400 }
        )
      }

      if (bulkAction === 'activate') {
        await admin
          .from(TABLES.testimonials)
          .update({ is_active: true })
          .in('id', ids)

        await audit(admin, userId, 'bulk_activate', 'testimonial', null, null, {
          ids,
        })
      } else if (bulkAction === 'deactivate') {
        await admin
          .from(TABLES.testimonials)
          .update({ is_active: false })
          .in('id', ids)

        await audit(admin, userId, 'bulk_deactivate', 'testimonial', null, null, {
          ids,
        })
      } else if (bulkAction === 'delete') {
        const { data: before } = await admin
          .from(TABLES.testimonials)
          .select('*')
          .in('id', ids)

        await admin.from(TABLES.testimonials).delete().in('id', ids)

        await audit(admin, userId, 'bulk_delete', 'testimonial', null, before, null)
      } else if (bulkAction === 'duplicate') {
        const { data: rows } = await admin
          .from(TABLES.testimonials)
          .select('*')
          .in('id', ids)

        const nextSort = await getNextSortOrder(admin, TABLES.testimonials)

        const duplicates = (rows || []).map((row: any, index: number) => ({
          author: `${row.author} (copie)`,
          role: row.role,
          quote: row.quote,
          rating: row.rating,
          avatar_url: row.avatar_url,
          commune: row.commune,
          verified: false,
          sort_order: nextSort + index,
          is_active: false,
        }))

        if (duplicates.length > 0) {
          await admin.from(TABLES.testimonials).insert(duplicates)
        }

        await audit(admin, userId, 'bulk_duplicate', 'testimonial', null, rows, duplicates)
      } else {
        return NextResponse.json(
          { success: false, error: 'Action de masse inconnue.', code: 'UNKNOWN_BULK_ACTION' },
          { status: 400 }
        )
      }

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

      const saved = normalizeSettings(data ?? DEFAULT_TRUST_SETTINGS)

      await audit(admin, userId, 'update', 'settings', 'global', before, data)

      return NextResponse.json({ success: true, data: saved })
    }

    /* ------------------------------------------------------------ */
    /* RESET DEFAULTS                                                */
    /* ------------------------------------------------------------ */

    if (action === 'reset-defaults') {
      const { data: beforeStats } = await admin.from(TABLES.stats).select('*')
      const { data: beforeTestimonials } = await admin
        .from(TABLES.testimonials)
        .select('*')
      const { data: beforeSettings } = await admin
        .from(TABLES.settings)
        .select('*')
        .eq('id', 'global')
        .maybeSingle()

      await admin.from(TABLES.stats).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await admin
        .from(TABLES.testimonials)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      await admin.from(TABLES.stats).insert(
        DEFAULT_TRUST_STATS.map((stat, index) => ({
          ...stat,
          id: undefined,
          sort_order: index,
        }))
      )

      await admin.from(TABLES.testimonials).insert(
        DEFAULT_TRUST_TESTIMONIALS.map((testimonial, index) => ({
          ...testimonial,
          id: undefined,
          sort_order: index,
        }))
      )

      await admin.from(TABLES.settings).upsert(
        {
          ...DEFAULT_TRUST_SETTINGS,
          id: 'global',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )

      await audit(
        admin,
        userId,
        'reset_defaults',
        'trust',
        null,
        {
          stats: beforeStats,
          testimonials: beforeTestimonials,
          settings: beforeSettings,
        },
        {
          stats: DEFAULT_TRUST_STATS,
          testimonials: DEFAULT_TRUST_TESTIMONIALS,
          settings: DEFAULT_TRUST_SETTINGS,
        }
      )

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* IMPORT DATA                                                   */
    /* ------------------------------------------------------------ */

    if (action === 'import-data') {
      const mode = String(payload?.mode || 'replace')
      const importStats = Array.isArray(payload?.stats) ? payload.stats : []
      const importTestimonials = Array.isArray(payload?.testimonials)
        ? payload.testimonials
        : []
      const importSettings = payload?.settings ?? null

      if (mode === 'replace') {
        await admin.from(TABLES.stats).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await admin
          .from(TABLES.testimonials)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
      }

      if (importStats.length > 0) {
        const rows = importStats
          .map((row: any, index: number) => normalizeStat(row, index))
          .filter((row): row is TrustStat => Boolean(row))
          .map((row, index) => ({
            label: row.label,
            value: row.value,
            suffix: row.suffix,
            prefix: row.prefix,
            decimals: row.decimals,
            icon_name: row.icon_name,
            description: row.description,
            color: row.color,
            sort_order: mode === 'replace' ? index : row.sort_order,
            is_active: row.is_active,
          }))

        if (rows.length > 0) {
          await admin.from(TABLES.stats).insert(rows)
        }
      }

      if (importTestimonials.length > 0) {
        const rows = importTestimonials
          .map((row: any, index: number) => normalizeTestimonial(row, index))
          .filter((row): row is TrustTestimonial => Boolean(row))
          .map((row, index) => ({
            author: row.author,
            role: row.role,
            quote: row.quote,
            rating: row.rating,
            avatar_url: row.avatar_url,
            commune: row.commune,
            verified: row.verified,
            sort_order: mode === 'replace' ? index : row.sort_order,
            is_active: row.is_active,
          }))

        if (rows.length > 0) {
          await admin.from(TABLES.testimonials).insert(rows)
        }
      }

      if (importSettings) {
        const settingsPayload = pickSettingsPayload(importSettings)

        await admin.from(TABLES.settings).upsert(
          {
            id: 'global',
            ...settingsPayload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
      }

      await audit(admin, userId, 'import', 'trust', null, null, {
        mode,
        statsCount: importStats.length,
        testimonialsCount: importTestimonials.length,
        hasSettings: Boolean(importSettings),
      })

      return NextResponse.json({ success: true })
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

      await audit(admin, userId, 'clear_logs', 'audit_log', null, before, null)

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* UNKNOWN ACTION                                                */
    /* ------------------------------------------------------------ */

    return NextResponse.json(
      {
        success: false,
        error: `Action inconnue : ${action}`,
        code: 'UNKNOWN_ACTION',
        supported_actions: [
          'save-stat',
          'delete-stat',
          'reorder-stats',
          'bulk-stats',
          'save-testimonial',
          'delete-testimonial',
          'reorder-testimonials',
          'bulk-testimonials',
          'save-settings',
          'reset-defaults',
          'import-data',
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
            'Les tables trust_* sont introuvables. Exécute la migration SQL nécessaire.',
          code: 'TABLE_MISSING',
          details: errorMessage(error, 'Table manquante'),
        },
        { status: 503 }
      )
    }

    console.error('Crash POST /api/admin/trust', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Erreur serveur lors de la mise à jour des données de confiance.',
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