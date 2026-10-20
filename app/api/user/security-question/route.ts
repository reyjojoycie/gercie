// app/api/user/security-question/route.ts
// ---------------------------------------------------------------------------
// Gestion de la question de sécurité – Niveau Ultra‑Premium
// ---------------------------------------------------------------------------
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// Schémas de validation
// ---------------------------------------------------------------------------
const securityQuestionSchema = z.object({
  question_secrete: z
    .string()
    .min(3, 'La question doit contenir au moins 3 caractères')
    .max(255, 'La question ne doit pas dépasser 255 caractères'),
  reponse_secrete: z
    .string()
    .min(2, 'La réponse doit contenir au moins 2 caractères')
    .max(100, 'La réponse ne doit pas dépasser 100 caractères'),
})

// ---------------------------------------------------------------------------
// GET – Récupérer la question de sécurité actuelle
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  // Rate limiting (20 req/min)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `security-question-read:${ip}`,
    maxRequests: 20,
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
      logger.warn('Tentative GET security-question sans authentification')
      return NextResponse.json(
        { error: 'Authentification requise', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // 2. Récupération de la question
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('question_secrete')
      .eq('id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Aucune ligne trouvée – ce n'est pas une erreur
        logger.info({ userId: user.id }, 'Aucune question de sécurité trouvée')
        return NextResponse.json(
          { question_secrete: null, message: 'Aucune question configurée.' },
          { status: 200 }
        )
      }

      logger.error('Erreur récupération question sécurité', error)
      return NextResponse.json(
        { error: 'Impossible de récupérer la question de sécurité.', code: 'FETCH_ERROR' },
        { status: 500 }
      )
    }

    logger.info({ userId: user.id }, 'Question de sécurité récupérée')
    return NextResponse.json({
      question_secrete: data?.question_secrete || null,
    })
  } catch (error: any) {
    logger.error('Crash GET security-question', error)
    return NextResponse.json(
      { error: 'Erreur serveur interne. Veuillez réessayer.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST – Enregistrer / Mettre à jour la question de sécurité
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  // Rate limiting plus restrictif (5 req/min)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `security-question-write:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de tentatives. Veuillez patienter quelques minutes.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      logger.warn('Tentative POST security-question sans authentification')
      return NextResponse.json(
        { error: 'Authentification requise', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // 2. Validation du corps de la requête
    const rawBody = await request.json()
    const parsed = securityQuestionSchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn(
        { userId: user.id, errors: parsed.error.flatten() },
        'Données invalides pour security-question'
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

    const { question_secrete, reponse_secrete } = parsed.data

    // 3. Empêcher les questions vides ou triviales (sécurité renforcée)
    const trimmedQuestion = question_secrete.trim()
    if (trimmedQuestion.length < 3) {
      return NextResponse.json(
        { error: 'La question doit comporter au moins 3 caractères.', code: 'INVALID_QUESTION' },
        { status: 400 }
      )
    }

    // 4. Hasher la réponse avec un coût adapté
    const hashedReponse = await bcrypt.hash(reponse_secrete, 12) // Coût 12 pour sécurité optimale

    // 5. Mise à jour du profil
    const supabase = await createClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        question_secrete: trimmedQuestion,
        reponse_secrete: hashedReponse,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      logger.error('Erreur mise à jour question sécurité', error)
      return NextResponse.json(
        { error: 'Impossible d’enregistrer la question de sécurité.', code: 'UPDATE_ERROR' },
        { status: 500 }
      )
    }

    logger.info(
      { userId: user.id },
      'Question de sécurité mise à jour avec succès'
    )

    return NextResponse.json({
      success: true,
      message: 'Votre question de sécurité a bien été mise à jour.',
    })
  } catch (error: any) {
    logger.error('Crash POST security-question', error)
    return NextResponse.json(
      { error: 'Erreur serveur interne. Veuillez réessayer.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
