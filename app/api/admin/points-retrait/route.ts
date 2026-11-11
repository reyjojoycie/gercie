// app/api/admin/points-retrait/route.ts
// ============================================================================
// API Admin – Points de retrait / relais colis
// CRUD, actions de masse, import CSV, audit.
// Sans wallet / portefeuille / solde / retrait d'argent.
//
// GET  /api/admin/points-retrait
// POST /api/admin/points-retrait
//
// Actions POST :
// - save
// - delete
// - bulk
// - import
// - clear-logs
// ============================================================================

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'

import {
  normalizePickupPoint,
  toBool,
  toNum,
  textOrNull,
  parseNumber,
  clamp,
  type PickupPoint,
  type PickupPointStats,
} from '@/lib/pickup-points'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TABLE = 'points_retrait'
const LOGS_TABLE = 'points_retrait_audit_logs'
const PROFILES_TABLE = 'profiles'

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
        .from(PROFILES_TABLE)
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
  entityId: string | number | null,
  before: any = null,
  after: any = null
): Promise<void> {
  try {
    await admin.from(LOGS_TABLE).insert({
      actor_id: userId || null,
      action,
      entity_id: entityId !== null && entityId !== undefined ? String(entityId) : null,
      before: before ?? null,
      after: after ?? null,
      created_at: new Date().toISOString(),
    })
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      console.warn('[POINTS RETRAIT ADMIN] Audit log failed:', error?.message)
    }
  }
}

function sanitizePointPayload(body: any): Partial<PickupPoint> & { id?: number } {
  const payload: any = {}

  if (body?.id !== undefined) {
    const id = parseNumber(body.id)
    if (id !== null) payload.id = id
  }

  if (body?.nom !== undefined) payload.nom = String(body.nom).trim()
  if (body?.adresse !== undefined) payload.adresse = String(body.adresse).trim()

  if (body?.telephone !== undefined) {
    payload.telephone = textOrNull(body.telephone)
  }
  if (body?.email !== undefined) payload.email = textOrNull(body.email)
  if (body?.site_web !== undefined) payload.site_web = textOrNull(body.site_web)
  if (body?.whatsapp !== undefined) payload.whatsapp = textOrNull(body.whatsapp)

  if (body?.commune_id !== undefined) {
    payload.commune_id = parseNumber(body.commune_id)
  }

  if (body?.province_nom !== undefined) {
    payload.province_nom = textOrNull(body.province_nom)
  }
  if (body?.ville_nom !== undefined) payload.ville_nom = textOrNull(body.ville_nom)
  if (body?.quartier !== undefined) payload.quartier = textOrNull(body.quartier)
  if (body?.avenue !== undefined) payload.avenue = textOrNull(body.avenue)
  if (body?.numero !== undefined) payload.numero = textOrNull(body.numero)
  if (body?.code_postal !== undefined) {
    payload.code_postal = textOrNull(body.code_postal)
  }
  if (body?.reference !== undefined) payload.reference = textOrNull(body.reference)

  if (body?.latitude !== undefined) {
    const lat = parseNumber(body.latitude)
    payload.latitude =
      lat !== null && lat >= -90 && lat <= 90 ? lat : null
  }

  if (body?.longitude !== undefined) {
    const lng = parseNumber(body.longitude)
    payload.longitude =
      lng !== null && lng >= -180 && lng <= 180 ? lng : null
  }

  if (body?.horaires !== undefined) payload.horaires = textOrNull(body.horaires)
  if (body?.contact_nom !== undefined) {
    payload.contact_nom = textOrNull(body.contact_nom)
  }
  if (body?.type_etablissement !== undefined) {
    payload.type_etablissement = textOrNull(body.type_etablissement)
  }
  if (body?.photo_url !== undefined) payload.photo_url = textOrNull(body.photo_url)
  if (body?.points_de_repere !== undefined) {
    payload.points_de_repere = textOrNull(body.points_de_repere)
  }
  if (body?.instructions_retrait !== undefined) {
    payload.instructions_retrait = textOrNull(body.instructions_retrait)
  }

  if (body?.est_actif !== undefined) {
    payload.est_actif = toBool(body.est_actif, true)
  }

  if (body?.est_partenaire_verifie !== undefined) {
    payload.est_partenaire_verifie = toBool(body.est_partenaire_verifie, false)
  }

  if (body?.note_moyenne !== undefined) {
    const note = parseNumber(body.note_moyenne)
    payload.note_moyenne = note !== null ? clamp(note, 0, 5) : null
  }

  if (body?.capacite !== undefined) {
    const cap = parseNumber(body.capacite)
    payload.capacite = cap !== null && cap >= 0 ? Math.round(cap) : null
  }

  if (body?.delai_moyen_heures !== undefined) {
    const delay = parseNumber(body.delai_moyen_heures)
    payload.delai_moyen_heures =
      delay !== null && delay >= 0 ? Math.round(delay) : null
  }

  if (body?.metadata !== undefined) {
    if (typeof body.metadata === 'string') {
      try {
        payload.metadata = JSON.parse(body.metadata)
      } catch {
        payload.metadata = {}
      }
    } else if (body.metadata && typeof body.metadata === 'object') {
      payload.metadata = body.metadata
    } else {
      payload.metadata = {}
    }
  }

  if (body?.sort_order !== undefined) {
    payload.sort_order = toNum(body.sort_order, 0)
  }

  return payload
}

function computeStats(points: PickupPoint[]): PickupPointStats {
  const withNote = points.filter((p) => p.note_moyenne !== null)
  const withCapacity = points.filter((p) => p.capacite !== null)
  const withDelay = points.filter((p) => p.delai_moyen_heures !== null)
  const cities = new Set(
    points.map((p) => textOrNull(p.ville_nom)).filter(Boolean) as string[]
  )

  const avgNote =
    withNote.length > 0
      ? (
          withNote.reduce((acc, p) => acc + toNum(p.note_moyenne, 0), 0) /
          withNote.length
        ).toFixed(1)
      : '—'

  const avgDelaiHeures =
    withDelay.length > 0
      ? (
          withDelay.reduce(
            (acc, p) => acc + toNum(p.delai_moyen_heures, 0),
            0
          ) / withDelay.length
        ).toFixed(0)
      : '—'

  return {
    total: points.length,
    actifs: points.filter((p) => p.est_actif).length,
    inactifs: points.filter((p) => !p.est_actif).length,
    verifies: points.filter((p) => p.est_partenaire_verifie).length,
    nonVerifies: points.filter((p) => !p.est_partenaire_verifie).length,
    avecCoords: points.filter(
      (p) => p.latitude !== null && p.longitude !== null
    ).length,
    sansCoords: points.filter(
      (p) => p.latitude === null || p.longitude === null
    ).length,
    villes: cities.size,
    avgNote,
    totalCapacite: withCapacity.reduce(
      (acc, p) => acc + toNum(p.capacite, 0),
      0
    ),
    avgDelaiHeures,
  }
}

async function fetchAllPoints(admin: any): Promise<PickupPoint[]> {
  const { data, error } = await admin
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('nom', { ascending: true })

  if (error) throw error

  const rows = Array.isArray(data) ? data : []

  return rows
    .map((row: any, index: number) => normalizePickupPoint(row, index))
    .filter((row): row is PickupPoint => Boolean(row))
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET() {
  const auth = await authenticateAdmin()
  if (auth.response) return auth.response

  try {
    const points = await fetchAllPoints(auth.admin)
    const stats = computeStats(points)

    return NextResponse.json({
      success: true,
      data: points,
      meta: {
        stats,
        generated_at: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    if (isTableMissingError(error)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'La table public.points_retrait est introuvable. Exécute la migration SQL.',
          code: 'TABLE_MISSING',
          details: errorMessage(error, 'Table manquante'),
          data: [],
        },
        { status: 503 }
      )
    }

    console.error('Crash GET /api/admin/points-retrait', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Erreur serveur lors du chargement des points de retrait.',
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

  const action = String(body?.action || '')
  const payload = body?.payload ?? body
  const admin = auth.admin
  const userId = auth.userId

  try {
    /* ------------------------------------------------------------ */
    /* SAVE                                                          */
    /* ------------------------------------------------------------ */

    if (action === 'save') {
      const pointPayload = sanitizePointPayload(payload)

      if (!pointPayload.nom) {
        return NextResponse.json(
          { success: false, error: 'Le nom est requis.', code: 'NAME_REQUIRED' },
          { status: 400 }
        )
      }

      if (!pointPayload.adresse) {
        return NextResponse.json(
          {
            success: false,
            error: 'L’adresse est requise.',
            code: 'ADDRESS_REQUIRED',
          },
          { status: 400 }
        )
      }

      let saved: PickupPoint | null = null

      if (pointPayload.id) {
        const id = pointPayload.id

        const { data: before } = await admin
          .from(TABLE)
          .select('*')
          .eq('id', id)
          .maybeSingle()

        const { data, error } = await admin
          .from(TABLE)
          .update(pointPayload)
          .eq('id', id)
          .select('*')
          .maybeSingle()

        if (error) throw error

        saved = normalizePickupPoint(data, 0)

        await audit(admin, userId, 'update', id, before, data)
      } else {
        const { data: maxRow } = await admin
          .from(TABLE)
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (pointPayload.sort_order === undefined) {
          pointPayload.sort_order = toNum(maxRow?.sort_order, -1) + 1
        }

        const { data, error } = await admin
          .from(TABLE)
          .insert(pointPayload)
          .select('*')
          .maybeSingle()

        if (error) throw error

        saved = normalizePickupPoint(data, 0)

        await audit(admin, userId, 'create', saved?.id ?? null, null, data)
      }

      return NextResponse.json({ success: true, data: saved })
    }

    /* ------------------------------------------------------------ */
    /* DELETE                                                        */
    /* ------------------------------------------------------------ */

    if (action === 'delete') {
      const id = parseNumber(payload?.id)

      if (id === null) {
        return NextResponse.json(
          { success: false, error: 'ID requis.', code: 'ID_REQUIRED' },
          { status: 400 }
        )
      }

      const { data: before } = await admin
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle()

      const { error } = await admin.from(TABLE).delete().eq('id', id)

      if (error) throw error

      await audit(admin, userId, 'delete', id, before, null)

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* BULK                                                          */
    /* ------------------------------------------------------------ */

    if (action === 'bulk') {
      const bulkAction = String(payload?.bulkAction || '')
      const ids: number[] = Array.isArray(payload?.ids)
        ? payload.ids
            .map((id: any) => parseNumber(id))
            .filter((id: number | null): id is number => id !== null)
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
        const { error } = await admin
          .from(TABLE)
          .update({ est_actif: true })
          .in('id', ids)

        if (error) throw error

        await audit(admin, userId, 'bulk_activate', null, null, { ids })
      } else if (bulkAction === 'deactivate') {
        const { error } = await admin
          .from(TABLE)
          .update({ est_actif: false })
          .in('id', ids)

        if (error) throw error

        await audit(admin, userId, 'bulk_deactivate', null, null, { ids })
      } else if (bulkAction === 'verify') {
        const { error } = await admin
          .from(TABLE)
          .update({ est_partenaire_verifie: true })
          .in('id', ids)

        if (error) throw error

        await audit(admin, userId, 'bulk_verify', null, null, { ids })
      } else if (bulkAction === 'unverify') {
        const { error } = await admin
          .from(TABLE)
          .update({ est_partenaire_verifie: false })
          .in('id', ids)

        if (error) throw error

        await audit(admin, userId, 'bulk_unverify', null, null, { ids })
      } else if (bulkAction === 'delete') {
        const { data: before } = await admin
          .from(TABLE)
          .select('*')
          .in('id', ids)

        const { error } = await admin.from(TABLE).delete().in('id', ids)

        if (error) throw error

        await audit(admin, userId, 'bulk_delete', null, before, null)
      } else if (bulkAction === 'duplicate') {
        const { data: rows } = await admin
          .from(TABLE)
          .select('*')
          .in('id', ids)

        const { data: maxRow } = await admin
          .from(TABLE)
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle()

        let nextSort = toNum(maxRow?.sort_order, -1) + 1

        const duplicates = (rows || []).map((row: any) => {
          const copy = {
            nom: `${row.nom} (copie)`,
            adresse: row.adresse,
            telephone: row.telephone,
            email: row.email,
            site_web: row.site_web,
            whatsapp: row.whatsapp,
            commune_id: row.commune_id,
            province_nom: row.province_nom,
            ville_nom: row.ville_nom,
            quartier: row.quartier,
            avenue: row.avenue,
            numero: row.numero,
            code_postal: row.code_postal,
            reference: row.reference,
            latitude: row.latitude,
            longitude: row.longitude,
            horaires: row.horaires,
            contact_nom: row.contact_nom,
            type_etablissement: row.type_etablissement,
            photo_url: row.photo_url,
            points_de_repere: row.points_de_repere,
            instructions_retrait: row.instructions_retrait,
            est_actif: false,
            est_partenaire_verifie: false,
            note_moyenne: row.note_moyenne,
            capacite: row.capacite,
            delai_moyen_heures: row.delai_moyen_heures,
            metadata: row.metadata ?? {},
            sort_order: nextSort++,
          }

          return copy
        })

        if (duplicates.length > 0) {
          const { error } = await admin.from(TABLE).insert(duplicates)
          if (error) throw error
        }

        await audit(admin, userId, 'bulk_duplicate', null, rows, duplicates)
      } else {
        return NextResponse.json(
          {
            success: false,
            error: 'Action de masse inconnue.',
            code: 'UNKNOWN_BULK_ACTION',
          },
          { status: 400 }
        )
      }

      return NextResponse.json({ success: true })
    }

    /* ------------------------------------------------------------ */
    /* IMPORT                                                        */
    /* ------------------------------------------------------------ */

    if (action === 'import') {
      const mode = String(payload?.mode || 'merge')
      const rows = Array.isArray(payload?.rows) ? payload.rows : []

      if (rows.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Aucune ligne à importer.',
            code: 'EMPTY_IMPORT',
          },
          { status: 400 }
        )
      }

      if (mode === 'replace') {
        const { data: before } = await admin.from(TABLE).select('*')
        await admin.from(TABLE).delete().neq('id', 0)
        await audit(admin, userId, 'import_replace_clear', null, before, null)
      }

      const normalized = rows
        .map((row: any, index: number) => normalizePickupPoint(row, index))
        .filter((row): row is PickupPoint => Boolean(row))
        .map((row, index) => ({
          nom: row.nom,
          adresse: row.adresse,
          telephone: row.telephone,
          email: row.email,
          site_web: row.site_web,
          whatsapp: row.whatsapp,
          commune_id: row.commune_id,
          province_nom: row.province_nom,
          ville_nom: row.ville_nom,
          quartier: row.quartier,
          avenue: row.avenue,
          numero: row.numero,
          code_postal: row.code_postal,
          reference: row.reference,
          latitude: row.latitude,
          longitude: row.longitude,
          horaires: row.horaires,
          contact_nom: row.contact_nom,
          type_etablissement: row.type_etablissement,
          photo_url: row.photo_url,
          points_de_repere: row.points_de_repere,
          instructions_retrait: row.instructions_retrait,
          est_actif: row.est_actif,
          est_partenaire_verifie: row.est_partenaire_verifie,
          note_moyenne: row.note_moyenne,
          capacite: row.capacite,
          delai_moyen_heures: row.delai_moyen_heures,
          metadata: row.metadata,
          sort_order: mode === 'replace' ? index : row.sort_order,
        }))

      if (normalized.length > 0) {
        const { error } = await admin.from(TABLE).insert(normalized)
        if (error) throw error
      }

      await audit(admin, userId, 'import', null, null, {
        mode,
        count: normalized.length,
      })

      return NextResponse.json({
        success: true,
        data: { count: normalized.length },
      })
    }

    /* ------------------------------------------------------------ */
    /* CLEAR LOGS                                                    */
    /* ------------------------------------------------------------ */

    if (action === 'clear-logs') {
      const { data: before } = await admin.from(LOGS_TABLE).select('*')

      await admin.from(LOGS_TABLE).delete().neq('id', 0)

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
          'bulk',
          'import',
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
            'Les tables points_retrait sont introuvables. Exécute la migration SQL.',
          code: 'TABLE_MISSING',
          details: errorMessage(error, 'Table manquante'),
        },
        { status: 503 }
      )
    }

    console.error('Crash POST /api/admin/points-retrait', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Erreur serveur lors de la mise à jour des points de retrait.',
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