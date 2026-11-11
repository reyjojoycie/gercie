// app/api/user/password/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { logActivity, getRequestMeta } from '@/lib/activity'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/* Schémas                                                             */
/* ------------------------------------------------------------------ */

const passwordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Le mot de passe actuel est requis'),
    newPassword: z
      .string()
      .min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères')
      .max(128, 'Le nouveau mot de passe ne peut pas dépasser 128 caractères')
      .regex(/[a-z]/, 'Doit contenir au moins une lettre minuscule')
      .regex(/[A-Z]/, 'Doit contenir au moins une lettre majuscule')
      .regex(/\d/, 'Doit contenir au moins un chiffre')
      .regex(/[^A-Za-z0-9]/, 'Doit contenir au moins un caractère spécial'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Le nouveau mot de passe doit être différent de l\'actuel',
    path: ['newPassword'],
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

function getUserRateLimitKey(userId: string, action: string) {
  return `user:${userId}:${action}`
}

/**
 * Vérifie que le mot de passe fourni correspond au mot de passe actuel.
 * Utilise une session temporaire côté serveur via signInWithPassword.
 */
async function verifyCurrentPassword(
  email: string,
  password: string
): Promise<boolean> {
  try {
    const supabaseAuth = await createClient(false)

    const { error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    })

    // Nettoyage de la session temporaire
    await supabaseAuth.auth.signOut().catch(() => {})

    return !error
  } catch (err) {
    logger.error('Crash verifyCurrentPassword', err)
    return false
  }
}

/* ------------------------------------------------------------------ */
/* POST (changer le mot de passe)                                      */
/* ------------------------------------------------------------------ */

/**
 * POST /api/user/password
 * Change le mot de passe de l'utilisateur connecté.
 *
 * Sécurité :
 *  - vérification du mot de passe actuel
 *  - validation forte du nouveau mot de passe
 *  - rate limiting strict (anti force brute)
 *  - journalisation d'activité
 *  - suppression de la question secrète (volontairement absente)
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)

  // Rate limit global par IP
  const ipLimit = rateLimit({
    id: `user-password-change-ip:${ip}`,
    maxRequests: 5,
    windowSeconds: 15 * 60, // 15 minutes
  })

  if (!ipLimit.allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
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

    // Rate limit par utilisateur (plus strict)
    const userLimit = rateLimit({
      id: getUserRateLimitKey(user.id, 'change-password'),
      maxRequests: 3,
      windowSeconds: 15 * 60,
    })

    if (!userLimit.allowed) {
      return applyRateLimitHeaders(
        NextResponse.json(
          { error: 'Trop de tentatives sur ce compte. Réessayez plus tard.' },
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

    const parsed = passwordSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { currentPassword, newPassword } = parsed.data

    // Vérification du mot de passe actuel
    const isValid = await verifyCurrentPassword(user.email, currentPassword)

    if (!isValid) {
      logger.warn('Échec vérification mot de passe actuel', {
        userId: user.id,
        email: user.email,
      })

      await logActivity({
        userId: user.id,
        action: 'password_change_failed',
        description: 'Tentative échouée de changement de mot de passe',
        ip: getRequestMeta(request).ip,
        userAgent: getRequestMeta(request).userAgent,
        metadata: { reason: 'invalid_current_password' },
      })

      return NextResponse.json(
        { error: 'Mot de passe actuel incorrect' },
        { status: 401 }
      )
    }

    // Mise à jour via le client admin
    const supabaseAdmin = await createClient(true)

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    )

    if (updateError) {
      logger.error('Erreur update password', {
        userId: user.id,
        error: updateError,
      })

      return NextResponse.json(
        { error: 'Impossible de modifier le mot de passe' },
        { status: 500 }
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'password_changed',
      description: 'Mot de passe modifié avec succès',
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    // Optionnel : révoquer toutes les autres sessions
    try {
      await supabaseAdmin
        .from('user_sessions')
        .delete()
        .eq('user_id', user.id)
        .neq('user_agent', meta.userAgent || '')
    } catch (sessionErr) {
      logger.warn('Révocation des autres sessions échouée', sessionErr)
    }

    return NextResponse.json({
      success: true,
      message: 'Mot de passe modifié avec succès.',
    })
  } catch (error: any) {
    logger.error('Crash POST /api/user/password', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/* GET (vérifier la force d'un mot de passe proposé)                   */
/* ------------------------------------------------------------------ */

/**
 * GET /api/user/password?check=xxx
 * Endpoint optionnel pour vérifier la robustesse d'un mot de passe
 * sans le changer. Utile pour le front (indicateur de force).
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-password-check:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const candidate = searchParams.get('check') || ''

    if (!candidate) {
      return NextResponse.json(
        { error: 'Paramètre check requis' },
        { status: 400 }
      )
    }

    let score = 0
    const issues: string[] = []

    if (candidate.length >= 8) score += 20
    else issues.push('Au moins 8 caractères')

    if (candidate.length >= 12) score += 10
    if (candidate.length >= 16) score += 10

    if (/[a-z]/.test(candidate)) score += 10
    else issues.push('Une lettre minuscule')

    if (/[A-Z]/.test(candidate)) score += 15
    else issues.push('Une lettre majuscule')

    if (/\d/.test(candidate)) score += 15
    else issues.push('Un chiffre')

    if (/[^A-Za-z0-9]/.test(candidate)) score += 20
    else issues.push('Un caractère spécial')

    score = Math.min(100, score)

    let label = 'Faible'
    if (score >= 85) label = 'Excellent'
    else if (score >= 60) label = 'Bon'
    else if (score >= 30) label = 'Moyen'

    return NextResponse.json({
      score,
      label,
      issues,
      valid: issues.length === 0,
    })
  } catch (error: any) {
    logger.error('Crash GET /api/user/password', error)

    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}