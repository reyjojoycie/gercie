// app/api/admin/moyens-paiement/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const ALLOWED_TYPES = [
  'mobile_money',
  'card',
  'bank_transfer',
  'cash_on_delivery',
] as const

type PaymentMethodType = (typeof ALLOWED_TYPES)[number]

const STORAGE_BUCKET = 'moyens-paiement-logos'

const log = (logger as any) || console

const WALLET_KEYWORDS = [
  'wallet',
  'portefeuille',
  'solde',
  'balance',
  'recharge',
  'deposit',
  'withdrawal',
  'retrait',
  'escrow',
  'money_exchange',
  'exchange',
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

async function resolveParamsId(params: any): Promise<string> {
  const resolved = await Promise.resolve(params)
  const id = resolved?.id

  if (!id) {
    throw new Error('ID manquant.')
  }

  return String(id)
}

function containsWalletKeyword(value: unknown): boolean {
  const lower = String(value || '').toLowerCase().trim()
  if (!lower) return false

  return WALLET_KEYWORDS.some((keyword) => lower.includes(keyword))
}

function isWalletRow(row: any): boolean {
  return (
    String(row?.type || '').toLowerCase() === 'wallet' ||
    containsWalletKeyword(row?.code) ||
    containsWalletKeyword(row?.nom) ||
    containsWalletKeyword(row?.name) ||
    containsWalletKeyword(row?.libelle)
  )
}

function normalizeRow(row: any) {
  if (!row) return null

  if (isWalletRow(row)) return null

  const type = String(row.type || '') as PaymentMethodType

  if (!ALLOWED_TYPES.includes(type)) return null

  return {
    id: String(row.id),
    nom: String(row.nom || row.name || row.libelle || ''),
    code: String(row.code || row.slug || ''),
    type,
    logo_url:
      typeof row.logo_url === 'string' && row.logo_url.trim()
        ? row.logo_url.trim()
        : null,
    instructions:
      typeof row.instructions === 'string' && row.instructions.trim()
        ? row.instructions.trim()
        : null,
    ordre: Number.isFinite(Number(row.ordre)) ? Number(row.ordre) : 0,
    actif: row.actif !== false && row.active !== false && row.is_active !== false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

function cleanText(value: unknown, maxLength = 1000): string | null {
  const str = String(value || '').trim()
  if (!str) return null
  return str.slice(0, maxLength)
}

function normalizeLogoUrl(value: unknown): string | null {
  const str = String(value || '').trim()
  if (!str) return null
  return str
}

function extractStoragePath(
  url: string | null | undefined,
  bucket: string
): string | null {
  if (!url) return null

  const publicMarker = `/storage/v1/object/public/${bucket}/`
  if (url.includes(publicMarker)) {
    return url.split(publicMarker)[1] || null
  }

  const genericMarker = `/${bucket}/`
  if (url.includes(genericMarker)) {
    return url.split(genericMarker)[1] || null
  }

  return null
}

async function deleteStorageFile(supabase: any, url: string | null | undefined) {
  const path = extractStoragePath(url, STORAGE_BUCKET)
  if (!path) return

  try {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path])

    if (error) {
      log.warn?.('Suppression logo storage échouée', error)
    }
  } catch (err) {
    log.warn?.('Suppression logo storage exception', err)
  }
}

function isMissingTableError(error: any): boolean {
  const code = error?.code
  const message = String(
    error?.message || error?.details || error?.hint || ''
  ).toLowerCase()

  return (
    code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('schema')
  )
}

function isNotFoundError(error: any): boolean {
  return (
    error?.code === 'PGRST116' ||
    String(error?.message || '').toLowerCase().includes('not found')
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const updateSchema = z.object({
  nom: z
    .string()
    .min(2, 'Le nom doit comporter au moins 2 caractères')
    .max(100, 'Le nom est trop long')
    .optional(),

  code: z
    .string()
    .min(2, 'Le code doit comporter au moins 2 caractères')
    .max(50, 'Le code est trop long')
    .regex(
      /^[a-z0-9][a-z0-9-_]*$/,
      'Code invalide. Utilise lettres minuscules, chiffres, - ou _.'
    )
    .optional(),

  type: z
    .enum(ALLOWED_TYPES, {
      errorMap: () => ({
        message:
          'Type invalide. Types autorisés : mobile_money, card, bank_transfer, cash_on_delivery.',
      }),
    })
    .optional(),

  logo_url: z
    .union([z.string().url('URL de logo invalide'), z.null()])
    .optional(),

  instructions: z
    .string()
    .max(1000, 'Les instructions ne doivent pas dépasser 1000 caractères')
    .nullable()
    .optional(),

  ordre: z.number().int().min(0).max(9999).optional(),

  actif: z.boolean().optional(),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  GET : détail d’un moyen de paiement                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(
  request: Request,
  context: { params: any }
) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-get-id:${ip}`,
    maxRequests: 60,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  try {
    const id = await resolveParamsId(context.params)

    const supabase = await createClient(true)

    const { data, error } = await supabase
      .from('moyens_paiement')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            error:
              'La table moyens_paiement est introuvable. Exécute le SQL de migration recommandé.',
          },
          { status: 500 }
        )
      }

      if (isNotFoundError(error)) {
        return NextResponse.json(
          { error: 'Moyen de paiement introuvable.' },
          { status: 404 }
        )
      }

      throw error
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Moyen de paiement introuvable.' },
        { status: 404 }
      )
    }

    const normalized = normalizeRow(data)

    if (!normalized) {
      return NextResponse.json(
        {
          error:
            'Ce moyen de paiement est obsolète ou interdit. Supprime-le de la base.',
        },
        { status: 410 }
      )
    }

    return NextResponse.json(normalized, { status: 200 })
  } catch (err: any) {
    log.error?.('GET /api/admin/moyens-paiement/[id] error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Impossible de charger le moyen de paiement.',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PUT : mise à jour partielle                                    */
/* ═══════════════════════════════════════════════════════════════ */

export async function PUT(
  request: Request,
  context: { params: any }
) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-put:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let adminUser: any = null

  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  try {
    const id = await resolveParamsId(context.params)

    const body = await request.json().catch(() => ({}))
    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            'Données invalides.',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const input = parsed.data

    if (
      (input.code && containsWalletKeyword(input.code)) ||
      (input.nom && containsWalletKeyword(input.nom))
    ) {
      return NextResponse.json(
        {
          error:
            'Le portefeuille / wallet est supprimé de la plateforme. Choisis un autre nom ou code.',
        },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const { data: existing, error: existingError } = await supabase
      .from('moyens_paiement')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      if (isMissingTableError(existingError)) {
        return NextResponse.json(
          {
            error:
              'La table moyens_paiement est introuvable. Exécute le SQL de migration recommandé.',
          },
          { status: 500 }
        )
      }

      if (isNotFoundError(existingError)) {
        return NextResponse.json(
          { error: 'Moyen de paiement introuvable.' },
          { status: 404 }
        )
      }

      throw existingError
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Moyen de paiement introuvable.' },
        { status: 404 }
      )
    }

    if (isWalletRow(existing) && !input.type) {
      return NextResponse.json(
        {
          error:
            'Ancien moyen wallet détecté. Fournis un type valide pour migrer ce moyen : mobile_money, card, bank_transfer ou cash_on_delivery.',
        },
        { status: 400 }
      )
    }

    const effectiveType =
      input.type ||
      (existing.type === 'wallet' ? 'card' : existing.type)

    if (!ALLOWED_TYPES.includes(effectiveType as PaymentMethodType)) {
      return NextResponse.json(
        { error: 'Type de paiement invalide.' },
        { status: 400 }
      )
    }

    if (input.code && input.code !== existing.code) {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('moyens_paiement')
        .select('id')
        .eq('code', input.code)
        .neq('id', id)
        .maybeSingle()

      if (duplicateError && !isNotFoundError(duplicateError)) {
        throw duplicateError
      }

      if (duplicate) {
        return NextResponse.json(
          { error: 'Ce code technique existe déjà.' },
          { status: 409 }
        )
      }
    }

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (typeof input.nom !== 'undefined') {
      payload.nom = cleanText(input.nom, 100)
    }

    if (typeof input.code !== 'undefined') {
      payload.code = input.code
    }

    if (typeof input.type !== 'undefined') {
      payload.type = input.type
    } else if (existing.type === 'wallet') {
      payload.type = 'card'
    }

    if (typeof input.logo_url !== 'undefined') {
      payload.logo_url = normalizeLogoUrl(input.logo_url)
    }

    if (typeof input.instructions !== 'undefined') {
      payload.instructions = cleanText(input.instructions, 1000)
    }

    if (typeof input.ordre !== 'undefined') {
      payload.ordre = input.ordre
    }

    if (typeof input.actif !== 'undefined') {
      payload.actif = input.actif
    }

    const { data, error } = await supabase
      .from('moyens_paiement')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ce code technique existe déjà.' },
          { status: 409 }
        )
      }

      if (isNotFoundError(error)) {
        return NextResponse.json(
          { error: 'Moyen de paiement introuvable.' },
          { status: 404 }
        )
      }

      throw error
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Moyen de paiement introuvable.' },
        { status: 404 }
      )
    }

    const normalized = normalizeRow(data)

    if (!normalized) {
      return NextResponse.json(
        {
          error:
            'Moyen de paiement invalide après mise à jour. Vérifie le type et le code.',
        },
        { status: 500 }
      )
    }

    // Suppression de l’ancien logo si le logo a changé
    const hasLogoField = Object.prototype.hasOwnProperty.call(body, 'logo_url')

    if (
      hasLogoField &&
      existing.logo_url &&
      normalized.logo_url !== existing.logo_url
    ) {
      await deleteStorageFile(supabase, existing.logo_url)
    }

    log.info?.(
      `Moyen de paiement mis à jour par ${adminUser?.email || 'admin'} : ${normalized.code}`
    )

    return NextResponse.json(normalized, { status: 200 })
  } catch (err: any) {
    log.error?.('PUT /api/admin/moyens-paiement/[id] error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Impossible de mettre à jour le moyen de paiement.',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE : suppression du moyen + du logo                        */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(
  request: Request,
  context: { params: any }
) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-delete:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let adminUser: any = null

  try {
    adminUser = await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  try {
    const id = await resolveParamsId(context.params)

    const supabase = await createClient(true)

    const { data: existing, error: existingError } = await supabase
      .from('moyens_paiement')
      .select('id, logo_url, code')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      if (isMissingTableError(existingError)) {
        return NextResponse.json(
          {
            error:
              'La table moyens_paiement est introuvable. Exécute le SQL de migration recommandé.',
          },
          { status: 500 }
        )
      }

      if (isNotFoundError(existingError)) {
        return NextResponse.json(
          { error: 'Moyen de paiement introuvable.' },
          { status: 404 }
        )
      }

      throw existingError
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Moyen de paiement introuvable.' },
        { status: 404 }
      )
    }

    const { error } = await supabase
      .from('moyens_paiement')
      .delete()
      .eq('id', id)

    if (error) {
      if (isNotFoundError(error)) {
        return NextResponse.json(
          { error: 'Moyen de paiement introuvable.' },
          { status: 404 }
        )
      }

      throw error
    }

    if (existing.logo_url) {
      await deleteStorageFile(supabase, existing.logo_url)
    }

    log.info?.(
      `Moyen de paiement supprimé par ${adminUser?.email || 'admin'} : ${existing.code || id}`
    )

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err: any) {
    log.error?.('DELETE /api/admin/moyens-paiement/[id] error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Impossible de supprimer le moyen de paiement.',
      },
      { status: 500 }
    )
  }
}