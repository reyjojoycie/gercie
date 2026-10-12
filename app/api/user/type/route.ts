// app/api/user/type/route.ts
// ---------------------------------------------------------------------------
// Récupération du type d'utilisateur (acheteur / vendeur) – Niveau Ultra‑Premium
// ---------------------------------------------------------------------------
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// GET – Retourne le type de compte de l'utilisateur authentifié
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  // Rate limiting : 30 req/min
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-type:${ip}`,
    maxRequests: 30,
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
      logger.warn('Tentative récupération type sans authentification')
      return NextResponse.json(
        { error: 'Authentification requise.', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // 2. Récupération du type depuis le profil
    const supabase = await createClient() // RLS filtre automatiquement
    const { data, error } = await supabase
      .from('profiles')
      .select('type_user')
      .eq('id', user.id)
      .single()

    if (error) {
      // Si le profil n'existe pas encore, on peut considérer que le type est null
      if (error.code === 'PGRST116') {
        logger.info({ userId: user.id }, 'Profil utilisateur non trouvé, type indéterminé')
        return NextResponse.json(
          { type: null, message: 'Profil non trouvé.' },
          { status: 200 }
        )
      }

      logger.error(error, 'Erreur récupération type_user')
      return NextResponse.json(
        { error: 'Impossible de récupérer le type de compte.', code: 'FETCH_ERROR' },
        { status: 500 }
      )
    }

    // 3. Valider que le type est bien une valeur autorisée
    const validTypes = ['acheteur', 'vendeur']
    const userType = data?.type_user && validTypes.includes(data.type_user)
      ? data.type_user
      : null

    logger.info({ userId: user.id, type: userType }, 'Type utilisateur récupéré')

    // 4. Réponse enrichie avec cache
    const response = NextResponse.json(
      {
        type: userType,
        message: userType ? `Compte ${userType}` : 'Type non défini.',
      },
      { status: 200 }
    )
    // Mise en cache côté client pendant 5 minutes
    response.headers.set('Cache-Control', 'private, max-age=300')
    return response
  } catch (error: any) {
    logger.error(error, 'Crash GET user type')
    return NextResponse.json(
      { error: 'Erreur serveur interne.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
