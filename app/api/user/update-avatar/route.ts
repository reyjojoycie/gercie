// app/api/user/update-avatar/route.ts
// ---------------------------------------------------------------------------
// Mise à jour de l'avatar utilisateur – Niveau Ultra‑Premium
// ---------------------------------------------------------------------------
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// Schéma de validation – l'URL peut être valide (commence par http) ou null/vide
// ---------------------------------------------------------------------------
const updateAvatarSchema = z.object({
  avatar_url: z
    .string()
    .url('L’URL de l’avatar doit être une URL valide')
    .nullable()
    .optional()
    .transform((val) => val ?? null),
})

// ---------------------------------------------------------------------------
// PUT – Permet d'ajouter, modifier ou supprimer l'avatar
// ---------------------------------------------------------------------------
export async function PUT(request: Request) {
  // Rate limiting (10 req/min) car l'upload peut être fréquent mais coûteux
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `update-avatar:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Veuillez patienter.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      logger.warn('Tentative de mise à jour avatar sans authentification')
      return NextResponse.json(
        { error: 'Authentification requise.', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // 2. Validation du corps
    const rawBody = await request.json()
    const parsed = updateAvatarSchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn(
        { userId: user.id, errors: parsed.error.flatten().fieldErrors },
        'Données invalides pour mise à jour avatar'
      )
      return NextResponse.json(
        {
          error: 'Données invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const avatarUrl = parsed.data.avatar_url

    // 3. Optionnel : vérifier que l'URL est accessible ? On pourrait faire un HEAD rapide,
    //    mais pour rester performant, on laisse Supabase gérer. On peut juste logger.

    // 4. Mise à jour dans Supabase via RLS
    const supabase = await createClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      logger.error(error, 'Erreur mise à jour avatar')
      return NextResponse.json(
        { error: 'Impossible de mettre à jour l’avatar.', code: 'UPDATE_ERROR' },
        { status: 500 }
      )
    }

    // 5. Récupérer l'URL mise à jour pour confirmation
    const { data: updatedProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single()

    const finalUrl = updatedProfile?.avatar_url ?? null

    logger.info({ userId: user.id, avatarUrl: finalUrl }, 'Avatar utilisateur mis à jour')

    return NextResponse.json({
      success: true,
      message: finalUrl ? 'Avatar mis à jour avec succès.' : 'Avatar supprimé.',
      data: { avatar_url: finalUrl },
    })
  } catch (error: any) {
    logger.error(error, 'Crash PUT update-avatar')
    return NextResponse.json(
      { error: 'Erreur serveur interne. Veuillez réessayer.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
