// app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabaseServer'
import {
  validateSchema,
  normalizeEmail,
  strongPasswordSchema,
  AUTH_ERROR_MESSAGES,
} from '@/lib/validators/auth'
import {
  checkRateLimit,
  resetRateLimit,
  getIpRateLimitKey,
  validatePasswordStrength,
} from '@/lib/security'
import { invalidateProfileCache } from '@/lib/auth'
import { createHmac, timingSafeEqual, randomUUID } from 'crypto'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Constantes (Règle : 3 tentatives max, puis blocage 1 heure)        */
/* ------------------------------------------------------------------ */
const CHECK_RATE_LIMIT_MAX = 3
const CHECK_RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 heure

const VERIFY_RATE_LIMIT_MAX = 3
const VERIFY_RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 heure

const RESET_RATE_LIMIT_MAX = 3
const RESET_RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 heure

const RESET_TOKEN_EXPIRY_MINUTES = 15

// NOUVEAU : Clé secrète pour signer les tokens de manière stateless (Serverless-Safe)
// Utilise NEXTAUTH_SECRET ou JWT_SECRET si disponibles, sinon un fallback (à changer en prod)
const TOKEN_SECRET = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || 'dev-fallback-secret-change-in-production'

/* ------------------------------------------------------------------ */
/*  Schémas de validation                                              */
/* ------------------------------------------------------------------ */
const checkSchema = z.object({
  step: z.literal('check'),
  email: z.string().min(1, 'Email requis').email('Email invalide'),
})

const sendOtpSchema = z.object({
  step: z.literal('send_otp'),
  email: z.string().min(1, 'Email requis').email('Email invalide'),
  channel: z.enum(['email', 'sms'], { errorMap: () => ({ message: 'Canal invalide' }) }),
})

const verifyOtpSchema = z.object({
  step: z.literal('verify_otp'),
  email: z.string().min(1, 'Email requis').email('Email invalide'),
  code: z.string().length(6, 'Le code doit contenir exactement 6 chiffres'),
  channel: z.enum(['email', 'sms'], { errorMap: () => ({ message: 'Canal invalide' }) }),
})

const resetSchema = z.object({
  step: z.literal('reset'),
  email: z.string().min(1, 'Email requis').email('Email invalide'),
  resetToken: z.string().min(32, 'Token invalide').max(256), // Augmenté pour supporter le token HMAC base64
  newPassword: strongPasswordSchema,
})

const requestSchema = z.discriminatedUnion('step', [
  checkSchema,
  sendOtpSchema,
  verifyOtpSchema,
  resetSchema,
])

/* ------------------------------------------------------------------ */
/*  Logger sécurisé                                                    */
/* ------------------------------------------------------------------ */
function logResetPassword(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[RESET_PASSWORD]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('échec') ||
    event.toLowerCase().includes('success')
  ) {
    console.log('[RESET_PASSWORD]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  Helper : chercher le profil pour les méthodes OTP/Magic Link       */
/* ------------------------------------------------------------------ */
async function findProfileForReset(supabaseAdmin: any, normalizedEmail: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, telephone, phone_verified')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (profile?.email) {
    return {
      id: profile.id,
      email: profile.email,
      telephone: profile.telephone,
      phone_verified: profile.phone_verified,
    }
  }

  // Fallback : chercher par auth.users + profiles.id
  const { data: users } = await supabaseAdmin.auth.admin.listUsers()
  const authUser = users?.users?.find(
    (u: any) => u.email?.toLowerCase() === normalizedEmail
  )

  if (!authUser) return null

  const { data: profileByAuthId } = await supabaseAdmin
    .from('profiles')
    .select('telephone, phone_verified')
    .eq('id', authUser.id)
    .maybeSingle()

  if (!profileByAuthId) return null

  return {
    id: authUser.id,
    email: authUser.email,
    telephone: profileByAuthId.telephone,
    phone_verified: profileByAuthId.phone_verified,
  }
}

/* ------------------------------------------------------------------ */
/*  Helper : Masquer le numéro de téléphone pour l'UI (Sécurité)       */
/* ------------------------------------------------------------------ */
function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 6) return phone
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

/* ------------------------------------------------------------------ */
/*  NOUVEAU : Tokens cryptographiques Stateless (Serverless-Safe)      */
/*  Remplace la Map en mémoire qui causait des pertes de tokens en prod*/
/* ------------------------------------------------------------------ */
function generateResetToken(email: string): string {
  const expiry = Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000
  const payload = `${normalizeEmail(email)}:${expiry}`
  const signature = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex')
  return `${Buffer.from(payload).toString('base64url')}.${signature}`
}

function validateResetToken(token: string, email: string): boolean {
  try {
    const [payloadB64, signature] = token.split('.')
    if (!payloadB64 || !signature) return false
    
    const expectedSignature = createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest('hex')
    
    // Utilisation de timingSafeEqual pour éviter les attaques par canal auxiliaire (timing attacks)
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return false
    }
    
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf-8')
    const [tokenEmail, expiryStr] = payload.split(':')
    const expiry = parseInt(expiryStr, 10)
    
    if (Date.now() > expiry) return false
    if (normalizeEmail(tokenEmail) !== normalizeEmail(email)) return false
    
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Handler principal                                                  */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = randomUUID() // NOUVEAU : Traçabilité unique de chaque requête

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Corps de requête JSON invalide.' }, { status: 400, headers: { 'X-Request-Id': requestId } })
    }

    const validation = validateSchema(requestSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides.', errors: validation.errors }, { status: 400, headers: { 'X-Request-Id': requestId } })
    }

    const data = validation.data
    const step = data.step

    const ipKey = getIpRateLimitKey(request, `reset-password:${step}`)
    const maxRequests =
      step === 'check' ? CHECK_RATE_LIMIT_MAX :
      step === 'verify_otp' ? VERIFY_RATE_LIMIT_MAX :
      RESET_RATE_LIMIT_MAX
      
    const windowMs =
      step === 'check' ? CHECK_RATE_LIMIT_WINDOW :
      step === 'verify_otp' ? VERIFY_RATE_LIMIT_WINDOW :
      RESET_RATE_LIMIT_WINDOW

    const rateLimitResult = checkRateLimit(ipKey, maxRequests, windowMs)

    if (!rateLimitResult.allowed) {
      logResetPassword('Rate limited', { requestId, step, retryAfter: rateLimitResult.retryAfterSeconds })
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.rate_limited },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfterSeconds!.toString(),
            'X-RateLimit-Remaining': '0',
            'X-Request-Id': requestId,
          },
        }
      )
    }

    const supabaseAdmin = await createServiceClient()
    const origin = new URL(request.url).origin

    switch (step) {
      /* ================================================================ */
      /*  ÉTAPE 1 : CHECK - Déterminer les méthodes disponibles           */
      /* ================================================================ */
      case 'check': {
        const normalizedEmail = normalizeEmail(data.email)
        const profile = await findProfileForReset(supabaseAdmin, normalizedEmail)

        if (!profile) {
          logResetPassword('Check - profile not found (silent)', { requestId, email: normalizedEmail.slice(0, 3) + '***' })
          return NextResponse.json({
            availableMethods: [],
            message: 'Si un compte existe avec cet email, vous pourrez choisir une méthode de vérification.',
          }, { headers: { 'X-Request-Id': requestId } })
        }

        const availableMethods: string[] = ['magic_link', 'email_otp']
        if (profile.telephone && profile.phone_verified) {
          availableMethods.push('sms_otp')
        }

        logResetPassword('Check success', { requestId, email: normalizedEmail.slice(0, 3) + '***', methods: availableMethods })

        const response = NextResponse.json({
          availableMethods,
          phone: maskPhone(profile.telephone),
        })
        response.headers.set('Cache-Control', 'no-store')
        response.headers.set('X-Request-Id', requestId)
        return response
      }

      /* ================================================================ */
      /*  ÉTAPE 2 : SEND_OTP - Envoyer un code (Email ou SMS)             */
      /* ================================================================ */
      case 'send_otp': {
        const normalizedEmail = normalizeEmail(data.email)
        const profile = await findProfileForReset(supabaseAdmin, normalizedEmail)

        if (!profile) {
          return NextResponse.json({ error: 'Compte non trouvé.' }, { status: 404, headers: { 'X-Request-Id': requestId } })
        }

        let authError: any = null
        let devOtp: string | undefined = undefined

        if (data.channel === 'email') {
          const { error, data: otpData } = await supabaseAdmin.auth.signInWithOtp({
            email: normalizedEmail,
            options: { shouldCreateUser: false, emailRedirectTo: `${origin}/reset-password` },
          })
          authError = error
          // NOUVEAU : Indicateur pour faciliter les tests en mode développement
          if (process.env.NODE_ENV === 'development' && otpData?.user) {
            devOtp = 'DEV-MODE-OTP-CHECK-CONSOLE'
          }
        } else {
          if (!profile.telephone) {
            return NextResponse.json({ error: 'Numéro de téléphone non configuré sur ce compte.' }, { status: 400, headers: { 'X-Request-Id': requestId } })
          }
          const { error } = await supabaseAdmin.auth.signInWithOtp({
            phone: profile.telephone,
            options: { shouldCreateUser: false },
          })
          authError = error
        }

        if (authError) {
          logResetPassword('Send OTP failed', { requestId, channel: data.channel, error: authError.message })
          
          // NOUVEAU : Détecter spécifiquement le rate limit de Supabase pour un message clair au client
          if (authError.message.includes('rate limit exceeded')) {
            return NextResponse.json({ 
              error: "Trop de tentatives pour cet email. Pour votre sécurité, veuillez attendre 1 heure avant de réessayer." 
            }, { status: 429, headers: { 'X-Request-Id': requestId } })
          }

          // NOUVEAU : En cas d'autre erreur technique, on informe le client (pas de faux succès)
          return NextResponse.json({ 
            error: "Impossible d'envoyer le code pour le moment. Veuillez réessayer dans quelques instants." 
          }, { status: 500, headers: { 'X-Request-Id': requestId } })
        }

        logResetPassword('Send OTP success', { requestId, channel: data.channel })
        const response = NextResponse.json({ success: true, message: 'Code de vérification envoyé.', devOtp })
        response.headers.set('X-Request-Id', requestId)
        return response
      }

      /* ================================================================ */
      /*  ÉTAPE 3 : VERIFY_OTP - Valider le code et émettre le token      */
      /* ================================================================ */
      case 'verify_otp': {
        const normalizedEmail = normalizeEmail(data.email)
        const profile = await findProfileForReset(supabaseAdmin, normalizedEmail)

        if (!profile) {
          return NextResponse.json({ error: 'Compte non trouvé.' }, { status: 404, headers: { 'X-Request-Id': requestId } })
        }

        let verifyResult: any = null

        if (data.channel === 'email') {
          verifyResult = await supabaseAdmin.auth.verifyOtp({ email: normalizedEmail, token: data.code, type: 'email' })
        } else {
          if (!profile.telephone) {
            return NextResponse.json({ error: 'Numéro de téléphone non configuré.' }, { status: 400, headers: { 'X-Request-Id': requestId } })
          }
          verifyResult = await supabaseAdmin.auth.verifyOtp({ phone: profile.telephone, token: data.code, type: 'sms' })
        }

        if (verifyResult.error) {
          logResetPassword('Verify OTP failed', { requestId, channel: data.channel, error: verifyResult.error.message })
          return NextResponse.json({ error: 'Code invalide ou expiré.' }, { status: 401, headers: { 'X-Request-Id': requestId } })
        }

        // NOUVEAU : Génération d'un token cryptographique stateless (plus de perte en prod)
        const resetToken = generateResetToken(normalizedEmail)
        logResetPassword('Verify OTP success - token issued', { requestId, email: normalizedEmail.slice(0, 3) + '***' })
        
        resetRateLimit(ipKey)

        const response = NextResponse.json({
          success: true,
          resetToken,
          expiresIn: RESET_TOKEN_EXPIRY_MINUTES * 60,
        })
        response.headers.set('Cache-Control', 'no-store')
        response.headers.set('X-Request-Id', requestId)
        return response
      }

      /* ================================================================ */
      /*  ÉTAPE 4 : RESET - Valider le token et changer le mot de passe   */
      /* ================================================================ */
      case 'reset': {
        const normalizedEmail = normalizeEmail(data.email)

        // 🛠️ CORRECTION CRITIQUE : Supporte à la fois le token HMAC (OTP) ET le token Supabase (Magic Link)
        let tokenValid = validateResetToken(data.resetToken, normalizedEmail)
        let userIdFromToken: string | undefined = undefined

        if (!tokenValid) {
          // Si ce n'est pas notre token HMAC, c'est peut-être un token Supabase (Lien Magique de récupération)
          try {
            // On tente de récupérer l'utilisateur avec le token fourni par Supabase
            const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(data.resetToken)
            if (!userError && userData.user && userData.user.email?.toLowerCase() === normalizedEmail) {
              tokenValid = true
              userIdFromToken = userData.user.id
              logResetPassword('Reset - valid Supabase token (Magic Link)', { requestId, userId: userIdFromToken })
            }
          } catch (e) {
            // Ignore, tokenValid reste false
          }
        }

        if (!tokenValid) {
          logResetPassword('Reset - invalid/expired token', { requestId })
          return NextResponse.json({ error: AUTH_ERROR_MESSAGES.token_invalid }, { status: 401, headers: { 'X-Request-Id': requestId } })
        }

        const strength = validatePasswordStrength(data.newPassword)
        if (!strength.valid) {
          return NextResponse.json(
            { error: 'Mot de passe trop faible.', details: strength.errors, suggestions: strength.suggestions },
            { status: 400, headers: { 'X-Request-Id': requestId } }
          )
        }

        let authUser: any = null
        
        // Si on a déjà l'ID grâce au token Supabase, on l'utilise directement
        if (userIdFromToken) {
          authUser = { id: userIdFromToken }
        } else {
          // Sinon, on cherche l'utilisateur par email (pour le token HMAC OTP)
          const { data: users } = await supabaseAdmin.auth.admin.listUsers()
          authUser = users?.users?.find((u: any) => u.email?.toLowerCase() === normalizedEmail)
        }

        if (!authUser) {
          logResetPassword('Reset - auth user not found', { requestId })
          return NextResponse.json({ error: AUTH_ERROR_MESSAGES.token_invalid }, { status: 401, headers: { 'X-Request-Id': requestId } })
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
          password: data.newPassword,
        })

        if (updateError) {
          logResetPassword('Reset - update failed', { requestId, error: updateError.message, userId: authUser.id })
          return NextResponse.json({ error: 'Erreur lors de la réinitialisation du mot de passe.' }, { status: 500, headers: { 'X-Request-Id': requestId } })
        }

        invalidateProfileCache(authUser.id)
        resetRateLimit(ipKey)

        logResetPassword('Reset success', { requestId, userId: authUser.id, email: normalizedEmail.slice(0, 3) + '***', durationMs: Date.now() - startTime })

        const response = NextResponse.json({
          success: true,
          message: 'Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.',
        })
        response.headers.set('Cache-Control', 'no-store')
        response.headers.set('X-Request-Id', requestId)
        return response
      }

      default: {
        return NextResponse.json({ error: 'Étape invalide.' }, { status: 400, headers: { 'X-Request-Id': requestId } })
      }
    }
  } catch (error: any) {
    logResetPassword('Unhandled error', {
      requestId,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json({ error: AUTH_ERROR_MESSAGES.server }, { status: 500, headers: { 'X-Request-Id': requestId } })
  }
}