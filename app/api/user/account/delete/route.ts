// app/api/user/account/delete/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { logActivity, getRequestMeta } from '@/lib/activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/* Schémas                                                             */
/* ------------------------------------------------------------------ */

const deleteSchema = z.object({
  password: z.string().min(1, 'Le mot de passe est requis'),
  confirm: z.literal('SUPPRIMER', {
    errorMap: () => ({ message: 'Tapez exactement SUPPRIMER pour confirmer' }),
  }),
})

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

function isMissingTableError(error: any) {
  return (
    error?.code === '42P01' ||
    String(error?.message || '').toLowerCase().includes('does not exist') ||
    String(error?.details || '').toLowerCase().includes('does not exist')
  )
}

function isMissingColumnError(error: any) {
  return (
    error?.code === '42703' ||
    String(error?.message || '').toLowerCase().includes('column') ||
    String(error?.details || '').toLowerCase().includes('column')
  )
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'X-Robots-Tag': 'noindex, nofollow',
  }
}

/**
 * Vérifie le mot de passe actuel via une authentification temporaire côté serveur.
 */
async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  try {
    const supabaseAuth = await createClient(false)

    const { error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    })

    await supabaseAuth.auth.signOut().catch(() => {})

    return !error
  } catch (error) {
    logger.error('Crash verifyCurrentPassword (delete account)', error)
    return false
  }
}

/**
 * Supprime en best-effort depuis une table.
 * Essaie plusieurs colonnes utilisateur si nécessaire.
 */
async function safeDeleteByUser(
  supabase: any,
  table: string,
  userId: string,
  fields: string[] = ['user_id']
) {
  for (const field of fields) {
    try {
      const { error } = await supabase.from(table).delete().eq(field, userId)

      if (!error) return true

      if (isMissingTableError(error)) return false

      if (isMissingColumnError(error)) continue

      logger.warn(`Erreur suppression ${table}.${field}`, {
        userId,
        error: error.message,
      })
    } catch (error: any) {
      logger.warn(`Crash suppression ${table}.${field}`, {
        userId,
        error: error?.message,
      })
    }
  }

  return false
}

/**
 * Récupère les IDs de commandes de l'utilisateur pour nettoyer les tables liées.
 */
async function getOrderIds(supabase: any, userId: string): Promise<string[]> {
  const tables = ['commandes', 'orders']
  const fields = ['acheteur_id', 'user_id', 'client_id']

  for (const table of tables) {
    for (const field of fields) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('id')
          .eq(field, userId)
          .limit(500)

        if (!error && Array.isArray(data) && data.length > 0) {
          return data.map((row: any) => row.id).filter(Boolean)
        }

        if (isMissingTableError(error)) break
      } catch (error: any) {
        logger.warn('Erreur récupération commandes pour suppression', {
          userId,
          table,
          field,
          error: error?.message,
        })
      }
    }
  }

  return []
}

/**
 * Supprime les lignes liées aux commandes avant suppression des commandes.
 */
async function safeDeleteOrderRelated(supabase: any, orderIds: string[]) {
  if (orderIds.length === 0) return

  const childTables = [
    'order_items',
    'articles_commande',
    'commande_articles',
    'commande_items',
    'payments',
    'paiements',
    'refunds',
    'remboursements',
  ]

  const childFields = ['commande_id', 'order_id']

  for (const table of childTables) {
    for (const field of childFields) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .in(field, orderIds)

        if (!error) break

        if (isMissingTableError(error)) break
      } catch (error: any) {
        logger.warn('Erreur suppression enfants commande', {
          table,
          field,
          error: error?.message,
        })
      }
    }
  }
}

/**
 * Supprime les fichiers avatar dans Storage si le bucket existe.
 */
async function safeDeleteAvatars(supabase: any, userId: string) {
  try {
    const { data: files, error } = await supabase.storage
      .from('avatars')
      .list(userId, { limit: 100 })

    if (error || !files || files.length === 0) return

    const paths = files.map((file: any) => `${userId}/${file.name}`)

    await supabase.storage.from('avatars').remove(paths)
  } catch (error: any) {
    logger.warn('Erreur suppression avatars', {
      userId,
      error: error?.message,
    })
  }
}

/* ------------------------------------------------------------------ */
/* POST                                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/user/account/delete
 *
 * Supprime définitivement le compte de l'utilisateur connecté.
 *
 * Prérequis :
 * - mot de passe valide
 * - confirmation exacte "SUPPRIMER"
 *
 * Nettoyage best-effort :
 * - notifications
 * - sessions
 * - activité
 * - préférences
 * - adresses
 * - favoris
 * - avis
 * - tickets support
 * - commandes et lignes liées
 * - avatars Storage
 * - profil
 * - utilisateur auth
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)

  const ipLimit = rateLimit({
    id: `user-account-delete-ip:${ip}`,
    maxRequests: 3,
    windowSeconds: 30 * 60,
  })

  if (!ipLimit.allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error:
            'Trop de tentatives de suppression. Réessayez dans 30 minutes.',
          code: 'RATE_LIMITED',
        },
        { status: 429 }
      ),
      ipLimit.headers
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (!user.email) {
      return NextResponse.json(
        { error: 'Aucune adresse email associée à ce compte.' },
        { status: 400 }
      )
    }

    const userLimit = rateLimit({
      id: `user:${user.id}:delete-account`,
      maxRequests: 2,
      windowSeconds: 30 * 60,
    })

    if (!userLimit.allowed) {
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            error:
              'Trop de tentatives sur ce compte. Réessayez plus tard.',
            code: 'RATE_LIMITED',
          },
          { status: 429 }
        ),
        userLimit.headers
      )
    }

    let body: any

    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    const parsed = deleteSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { password } = parsed.data

    const isPasswordValid = await verifyCurrentPassword(user.email, password)

    if (!isPasswordValid) {
      const meta = getRequestMeta(request)

      await logActivity({
        userId: user.id,
        action: 'account_delete_failed',
        description: 'Tentative échouée de suppression de compte',
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: 'invalid_password' },
      })

      return NextResponse.json(
        { error: 'Mot de passe incorrect' },
        { status: 401 }
      )
    }

    const supabase = await createClient(true)

    /* ------------------------------------------------------------ */
    /* 1. Nettoyage des données liées                                */
    /* ------------------------------------------------------------ */

    await safeDeleteByUser(supabase, 'user_notifications', user.id, [
      'user_id',
    ])
    await safeDeleteByUser(supabase, 'notifications', user.id, [
      'user_id',
      'utilisateur_id',
    ])

    await safeDeleteByUser(supabase, 'user_sessions', user.id, ['user_id'])

    await safeDeleteByUser(supabase, 'user_activity_logs', user.id, [
      'user_id',
    ])

    await safeDeleteByUser(supabase, 'user_preferences', user.id, [
      'user_id',
    ])

    await safeDeleteByUser(supabase, 'user_addresses', user.id, ['user_id'])
    await safeDeleteByUser(supabase, 'addresses', user.id, ['user_id'])

    await safeDeleteByUser(supabase, 'favorites', user.id, [
      'user_id',
      'utilisateur_id',
    ])
    await safeDeleteByUser(supabase, 'user_favorites', user.id, [
      'user_id',
      'utilisateur_id',
    ])
    await safeDeleteByUser(supabase, 'favoris', user.id, [
      'user_id',
      'utilisateur_id',
    ])

    await safeDeleteByUser(supabase, 'reviews', user.id, [
      'user_id',
      'utilisateur_id',
    ])
    await safeDeleteByUser(supabase, 'avis', user.id, [
      'user_id',
      'utilisateur_id',
    ])

    await safeDeleteByUser(supabase, 'support_tickets', user.id, [
      'user_id',
      'utilisateur_id',
    ])
    await safeDeleteByUser(supabase, 'tickets', user.id, [
      'user_id',
      'utilisateur_id',
    ])

    /* ------------------------------------------------------------ */
    /* 2. Commandes                                                  */
    /* ------------------------------------------------------------ */

    const orderIds = await getOrderIds(supabase, user.id)

    if (orderIds.length > 0) {
      await safeDeleteOrderRelated(supabase, orderIds)

      for (const field of ['acheteur_id', 'user_id', 'client_id']) {
        try {
          const { error } = await supabase
            .from('commandes')
            .delete()
            .eq(field, user.id)

          if (!error) break
        } catch (error: any) {
          logger.warn('Erreur suppression commandes', {
            userId: user.id,
            field,
            error: error?.message,
          })
        }

        try {
          const { error } = await supabase
            .from('orders')
            .delete()
            .eq(field, user.id)

          if (!error) break
        } catch (error: any) {
          logger.warn('Erreur suppression orders', {
            userId: user.id,
            field,
            error: error?.message,
          })
        }
      }
    }

    /* ------------------------------------------------------------ */
    /* 3. Avatars Storage                                            */
    /* ------------------------------------------------------------ */

    await safeDeleteAvatars(supabase, user.id)

    /* ------------------------------------------------------------ */
    /* 4. Profil                                                     */
    /* ------------------------------------------------------------ */

    try {
      await supabase.from('profiles').delete().eq('id', user.id)
    } catch (error: any) {
      logger.warn('Erreur suppression profil', {
        userId: user.id,
        error: error?.message,
      })
    }

    /* ------------------------------------------------------------ */
    /* 5. Utilisation auth Supabase                                  */
    /* ------------------------------------------------------------ */

    const { error: deleteAuthError } =
      await supabase.auth.admin.deleteUser(user.id)

    if (deleteAuthError) {
      logger.error('Erreur suppression utilisateur auth', {
        userId: user.id,
        error: deleteAuthError,
      })

      return NextResponse.json(
        {
          error:
            'Impossible de supprimer définitivement le compte. Contactez le support.',
          code: 'ACCOUNT_DELETE_FAILED',
        },
        { status: 500 }
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'account_deleted',
      description: 'Compte supprimé définitivement',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        email: user.email,
      },
    })

    const response = NextResponse.json(
      {
        success: true,
        message: 'Compte supprimé avec succès.',
      },
      { status: 200 }
    )

    for (const [key, value] of Object.entries(noStoreHeaders())) {
      response.headers.set(key, value)
    }

    return response
  } catch (error: any) {
    logger.error('Crash POST /api/user/account/delete', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}