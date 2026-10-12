// app/api/auth/register/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabaseServer'
import {
  registerSchema,
  validateSchema,
  normalizeEmail,
  AUTH_ERROR_MESSAGES,
  MIN_PASSWORD_LENGTH,
} from '@/lib/validators/auth'
import {
  hashSecurityAnswer,
  checkRateLimit,
  getIpRateLimitKey,
  generateNumericCode,
  sanitizeInput,
} from '@/lib/security'

export const runtime = 'nodejs'

const REGISTER_RATE_LIMIT_MAX = process.env.NODE_ENV === 'development' ? 100 : 5
const REGISTER_RATE_LIMIT_WINDOW = 60 * 60 * 1000

const EMAIL_VERIFICATION_REQUIRED = true

const VERIFICATION_CODE_LENGTH = 6
const VERIFICATION_CODE_EXPIRY_MINUTES = 15

const ALLOWED_USER_TYPES = ['acheteur', 'vendeur', 'livreur']

const optionalSecretSchema = z.object({
  question_secrete: z
    .string()
    .trim()
    .min(10, 'La question secrète doit contenir au moins 10 caractères.')
    .max(200, 'La question secrète est trop longue.')
    .optional(),
  reponse_secrete: z
    .string()
    .trim()
    .min(2, 'La réponse secrète est trop courte.')
    .max(100, 'La réponse secrète est trop longue.')
    .optional(),
})

function logRegister(event: string, metadata?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[REGISTER] ${event}`, metadata || '')
  } else if (event.toLowerCase().includes('error') || event.toLowerCase().includes('échec')) {
    console.error(`[REGISTER] ${event}`, metadata || '')
  }
}

function normalizePhoneSafe(phone?: string | null): string | null {
  if (!phone) return null

  let cleaned = phone.replace(/[^\d+]/g, '')

  if (!cleaned) return null

  if (cleaned.startsWith('00243')) {
    cleaned = '+243' + cleaned.slice(5)
  } else if (cleaned.startsWith('243') && !cleaned.startsWith('+243')) {
    cleaned = '+243' + cleaned.slice(3)
  } else if (cleaned.startsWith('0') && !cleaned.startsWith('00')) {
    cleaned = '+243' + cleaned.slice(1)
  }

  if (cleaned.startsWith('+2430')) {
    cleaned = '+243' + cleaned.slice(5)
  }

  return cleaned || null
}

async function rollbackUser(supabaseAdmin: ReturnType<typeof createServiceClient>, userId: string) {
  try {
    await supabaseAdmin.from('verification_codes').delete().eq('user_id', userId)
    await supabaseAdmin.from('portefeuilles').delete().eq('id', userId)
    await supabaseAdmin.from('profiles').delete().eq('id', userId)
    await supabaseAdmin.auth.admin.deleteUser(userId)
  } catch (rollbackError) {
    logRegister('Rollback failed', {
      userId,
      error: (rollbackError as Error).message,
    })
  }
}

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const contentType = request.headers.get('content-type') || ''

    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Format de requête invalide.' },
        { status: 400 }
      )
    }

    /* ------------------------------------------------------------------ */
    /* 1. Rate limiting                                                    */
    /* ------------------------------------------------------------------ */
    const ipKey = getIpRateLimitKey(request, 'register')
    const rateLimit = checkRateLimit(ipKey, REGISTER_RATE_LIMIT_MAX, REGISTER_RATE_LIMIT_WINDOW)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.rate_limited },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimit.retryAfterSeconds?.toString() || '60',
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    /* ------------------------------------------------------------------ */
    /* 2. Parsing et validation                                            */
    /* ------------------------------------------------------------------ */
    let body: unknown

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête JSON invalide.' },
        { status: 400 }
      )
    }

    const validation = validateSchema(registerSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Données invalides.',
          errors: validation.errors,
        },
        { status: 400 }
      )
    }

    const secretValidation = validateSchema(optionalSecretSchema, body)

    if (!secretValidation.success) {
      return NextResponse.json(
        {
          error: 'Question/réponse secrètes invalides.',
          errors: secretValidation.errors,
        },
        { status: 400 }
      )
    }

    const { nom, prenom, email, telephone, password, type_user } = validation.data
    const { question_secrete: rawQuestion, reponse_secrete: rawAnswer } = secretValidation.data

    if ((rawQuestion && !rawAnswer) || (!rawQuestion && rawAnswer)) {
      return NextResponse.json(
        { error: 'La question et la réponse secrètes doivent être fournies ensemble.' },
        { status: 400 }
      )
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` },
        { status: 400 }
      )
    }

    const normalizedEmail = normalizeEmail(email)
    const normalizedPhone = normalizePhoneSafe(telephone)

    const safeTypeUser =
      typeof type_user === 'string' && ALLOWED_USER_TYPES.includes(type_user)
        ? type_user
        : 'acheteur'

    const supabaseAdmin = createServiceClient()

    /* ------------------------------------------------------------------ */
    /* 3. Vérification email existant                                      */
    /* ------------------------------------------------------------------ */
    let emailAlreadyExists = false

    const adminAuth = supabaseAdmin.auth.admin as any

    if (typeof adminAuth.getUserByEmail === 'function') {
      const { data: existingEmailData, error: emailLookupError } =
        await adminAuth.getUserByEmail(normalizedEmail)

      if (emailLookupError) {
        if (!/not found/i.test(emailLookupError.message)) {
          logRegister('Email lookup error', {
            error: emailLookupError.message,
            email: normalizedEmail,
          })

          return NextResponse.json(
            { error: AUTH_ERROR_MESSAGES.server },
            { status: 500 }
          )
        }
      } else if (existingEmailData?.user) {
        emailAlreadyExists = true
      }
    } else {
      // Fallback si la méthode getUserByEmail n'est pas disponible.
      const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      if (listError) {
        logRegister('User list lookup error', {
          error: listError.message,
        })

        return NextResponse.json(
          { error: AUTH_ERROR_MESSAGES.server },
          { status: 500 }
        )
      }

      emailAlreadyExists =
        existingUsers?.users?.some(
          (u) => u.email?.toLowerCase() === normalizedEmail
        ) ?? false
    }

    if (emailAlreadyExists) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.email_exists },
        { status: 409 }
      )
    }

    /* ------------------------------------------------------------------ */
    /* 4. Vérification téléphone existant                                  */
    /* ------------------------------------------------------------------ */
    if (normalizedPhone) {
      const { data: existingProfile, error: phoneLookupError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('telephone', normalizedPhone)
        .maybeSingle()

      if (phoneLookupError) {
        logRegister('Phone lookup error', {
          error: phoneLookupError.message,
          phone: normalizedPhone,
        })

        return NextResponse.json(
          { error: AUTH_ERROR_MESSAGES.server },
          { status: 500 }
        )
      }

      if (existingProfile) {
        return NextResponse.json(
          { error: AUTH_ERROR_MESSAGES.phone_exists },
          { status: 409 }
        )
      }
    }

    /* ------------------------------------------------------------------ */
    /* 5. Question secrète                                                 */
    /* ------------------------------------------------------------------ */
    let hashedReponse: string | null = null
    const secretQuestion = rawQuestion ? sanitizeInput(rawQuestion) : null

    if (rawAnswer) {
      try {
        hashedReponse = await hashSecurityAnswer(rawAnswer)
      } catch {
        return NextResponse.json(
          { error: 'Erreur lors de la sécurisation du compte.' },
          { status: 500 }
        )
      }
    }

    /* ------------------------------------------------------------------ */
    /* 6. Création utilisateur Supabase Auth                               */
    /* ------------------------------------------------------------------ */
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        nom,
        prenom,
        full_name: `${prenom} ${nom}`.trim(),
      },
      app_metadata: {
        provider: 'email',
        type_user: safeTypeUser,
      },
    })

    if (authError) {
      logRegister('Auth creation failed', {
        error: authError.message,
        email: normalizedEmail,
      })

      if (/already registered|already been registered/i.test(authError.message)) {
        return NextResponse.json(
          { error: AUTH_ERROR_MESSAGES.email_exists },
          { status: 409 }
        )
      }

      if (/password/i.test(authError.message)) {
        return NextResponse.json(
          { error: 'Mot de passe invalide.' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: 'Erreur lors de la création du compte.' },
        { status: 400 }
      )
    }

    const user = authData.user

    if (!user) {
      return NextResponse.json(
        { error: 'Erreur lors de la création du compte.' },
        { status: 500 }
      )
    }

    logRegister('Auth user created', { userId: user.id })

    /* ------------------------------------------------------------------ */
    /* 7. Profil : UPSERT                                                  */
    /* ------------------------------------------------------------------ */
    const profilePayload = {
      email: normalizedEmail,
      nom: nom.trim(),
      prenom: prenom.trim(),
      telephone: normalizedPhone,
      type_user: safeTypeUser,
      role: 'buyer',
      question_secrete: secretQuestion,
      reponse_secrete: hashedReponse,
      email_verified: false,
      phone_verified: false,
      onboarding_completed: false,
      est_actif: true,
      is_admin: false,
      preferences: {
        langue: 'fr',
        devise: 'CDF',
        notifications_email: true,
        notifications_sms: false,
      },
      terms_accepted_at: null,
      updated_at: new Date().toISOString(),
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: user.id,
          ...profilePayload,
        },
        {
          onConflict: 'id',
        }
      )

    if (profileError) {
      logRegister('Profile upsert failed', {
        userId: user.id,
        error: profileError.message,
      })

      await rollbackUser(supabaseAdmin, user.id)

      return NextResponse.json(
        { error: 'Erreur lors de la création du profil.' },
        { status: 500 }
      )
    }

    logRegister('Profile upserted', { userId: user.id })

    /* ------------------------------------------------------------------ */
    /* 8. Portefeuille : UPSERT non bloquant                               */
    /* ------------------------------------------------------------------ */
    const { error: walletError } = await supabaseAdmin.from('portefeuilles').upsert(
      {
        id: user.id,
        solde_achat: 0,
        solde_vente: 0,
      },
      {
        onConflict: 'id',
      }
    )

    if (walletError) {
      logRegister('Wallet upsert failed (non-critical)', {
        userId: user.id,
        error: walletError.message,
      })
    }

    /* ------------------------------------------------------------------ */
    /* 9. Code de vérification email                                       */
    /* ------------------------------------------------------------------ */
    let devCode: string | undefined

    if (EMAIL_VERIFICATION_REQUIRED) {
      const code = generateNumericCode(VERIFICATION_CODE_LENGTH)
      const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000)

      const { error: deleteOldCodesError } = await supabaseAdmin
        .from('verification_codes')
        .delete()
        .eq('user_id', user.id)
        .eq('type', 'email_verify')

      if (deleteOldCodesError) {
        logRegister('Old verification codes cleanup failed', {
          userId: user.id,
          error: deleteOldCodesError.message,
        })
      }

      const { error: codeError } = await supabaseAdmin.from('verification_codes').insert({
        user_id: user.id,
        type: 'email_verify',
        code,
        expires_at: expiresAt.toISOString(),
      })

      if (codeError) {
        logRegister('Verification code creation failed', {
          userId: user.id,
          error: codeError.message,
        })

        await rollbackUser(supabaseAdmin, user.id)

        return NextResponse.json(
          { error: 'Erreur lors de la préparation de la vérification du compte.' },
          { status: 500 }
        )
      }

      if (process.env.NODE_ENV === 'development') {
        devCode = code
        logRegister('Verification code generated (dev mode)', {
          userId: user.id,
          code,
        })
      }
    }

    /* ------------------------------------------------------------------ */
    /* 10. Réponse finale                                                  */
    /* ------------------------------------------------------------------ */
    const duration = Date.now() - startTime

    logRegister('Registration successful', {
      userId: user.id,
      email: normalizedEmail,
      durationMs: duration,
    })

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          nom,
          prenom,
        },
        message: EMAIL_VERIFICATION_REQUIRED
          ? 'Compte créé avec succès. Vérifiez votre email pour activer votre compte.'
          : 'Compte créé avec succès. Vous pouvez vous connecter.',
        requires_email_verification: EMAIL_VERIFICATION_REQUIRED,
        redirect: '/login?registered=true',
        ...(process.env.NODE_ENV === 'development' && devCode ? { devCode } : {}),
      },
      { status: 201 }
    )
  } catch (error: any) {
    logRegister('Unhandled error', {
      error: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}