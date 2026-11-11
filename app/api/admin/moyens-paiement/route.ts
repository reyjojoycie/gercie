// app/api/admin/moyens-paiement/route.ts
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

/* ═══════════════════════════════════════════════════════════════ */
/*  SCHÉMAS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const createSchema = z.object({
  nom: z
    .string()
    .min(2, 'Le nom doit comporter au moins 2 caractères')
    .max(100, 'Le nom est trop long'),

  code: z
    .string()
    .min(2, 'Le code doit comporter au moins 2 caractères')
    .max(50, 'Le code est trop long')
    .regex(
      /^[a-z0-9][a-z0-9-_]*$/,
      'Code invalide. Utilise lettres minuscules, chiffres, - ou _.'
    ),

  type: z.enum(ALLOWED_TYPES, {
    errorMap: () => ({
      message:
        'Type invalide. Types autorisés : mobile_money, card, bank_transfer, cash_on_delivery.',
    }),
  }),

  logo_url: z.union([z.string().url('URL de logo invalide'), z.null()]).optional(),

  instructions: z
    .string()
    .max(1000, 'Les instructions ne doivent pas dépasser 1000 caractères')
    .nullable()
    .optional(),

  ordre: z.number().int().min(0).max(9999).optional(),

  actif: z.boolean().optional().default(true),
})

/* ═══════════════════════════════════════════════════════════════ */
/*  ACCESSOIRES DB                                                 */
/* ═══════════════════════════════════════════════════════════════ */

async function getNextOrdre(supabase: any): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('moyens_paiement')
      .select('ordre')
      .order('ordre', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return 0

    const maxOrdre = Number(data.ordre)
    if (!Number.isFinite(maxOrdre) || maxOrdre < 0) return 0

    return maxOrdre + 1
  } catch {
    return 0
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

/* ═══════════════════════════════════════════════════════════════ */
/*  GET : liste des moyens de paiement                             */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-get:${ip}`,
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
    const supabase = await createClient(true)

    const { data, error } = await supabase
      .from('moyens_paiement')
      .select('*')
      .order('ordre', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      if (isMissingTableError(error)) {
        log.warn?.(
          'Table moyens_paiement introuvable. Retour d’une liste vide.',
          error
        )

        return NextResponse.json([], {
          status: 200,
          headers: {
            'x-warning': 'table_moyens_paiement_manquante',
          },
        })
      }

      throw error
    }

    const rows = Array.isArray(data) ? data : []

    const normalized = rows
      .map(normalizeRow)
      .filter(Boolean)

    return NextResponse.json(normalized, { status: 200 })
  } catch (err: any) {
    log.error?.('GET /api/admin/moyens-paiement error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Impossible de charger les moyens de paiement.',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST : création d’un moyen de paiement                         */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-post:${ip}`,
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
    const body = await request.json().catch(() => ({}))
    const parsed = createSchema.safeParse(body)

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

    if (containsWalletKeyword(input.code) || containsWalletKeyword(input.nom)) {
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
      .select('id')
      .eq('code', input.code)
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

      throw existingError
    }

    if (existing) {
      return NextResponse.json(
        { error: 'Ce code technique existe déjà.' },
        { status: 409 }
      )
    }

    const ordre =
      typeof input.ordre === 'number' && Number.isFinite(input.ordre)
        ? input.ordre
        : await getNextOrdre(supabase)

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('moyens_paiement')
      .insert({
        nom: cleanText(input.nom, 100),
        code: input.code,
        type: input.type,
        logo_url: normalizeLogoUrl(input.logo_url),
        instructions: cleanText(input.instructions, 1000),
        ordre,
        actif: input.actif !== false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ce code technique existe déjà.' },
          { status: 409 }
        )
      }

      throw error
    }

    const normalized = normalizeRow(data)

    if (!normalized) {
      return NextResponse.json(
        { error: 'Moyen de paiement invalide après normalisation.' },
        { status: 500 }
      )
    }

    log.info?.(
      `Moyen de paiement créé par ${adminUser?.email || 'admin'} : ${normalized.code}`
    )

    return NextResponse.json(normalized, { status: 201 })
  } catch (err: any) {
    log.error?.('POST /api/admin/moyens-paiement error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Impossible de créer le moyen de paiement.',
      },
      { status: 500 }
    )
  }
}