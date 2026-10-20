// app/api/auth/verify-email/route.ts
import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import { checkRateLimit, getUserRateLimitKey } from '@/lib/security'
import { createOtp, jsonNoStore, OTP_EXPIRY_MINUTES } from '@/lib/auth/otp'
import { AUTH_ERROR_MESSAGES, EMAIL_REGEX, normalizeEmail, maskEmail } from '@/lib/validators/auth'

export const runtime = 'nodejs'

/** Envoie un code à 6 chiffres pour vérifier un email (utilisateur connecté). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonNoStore({ error: AUTH_ERROR_MESSAGES.session_expired }, 401)

    const limit = checkRateLimit(getUserRateLimitKey(user.id, 'verify-email-send'), 5, 60 * 60 * 1000)
    if (!limit.allowed) return jsonNoStore({ error: AUTH_ERROR_MESSAGES.rate_limited }, 429)

    const body = (await request.json().catch(() => ({}))) as { email?: string }
    const admin = createServiceClient() as any

    const { data: profile } = await admin
      .from('profiles')
      .select('email, email_verified')
      .eq('id', user.id)
      .maybeSingle()

    const current = normalizeEmail(profile?.email || user.email || '')
    const requested = body?.email ? normalizeEmail(String(body.email)) : current

    if (!requested || !EMAIL_REGEX.test(requested)) {
      return jsonNoStore({ error: 'Adresse email invalide.' }, 400)
    }

    if (profile?.email_verified && requested === current) {
      return jsonNoStore({
        success: true,
        already_verified: true,
        message: 'Votre email est déjà vérifié.',
      })
    }

    if (requested !== current) {
      const { data: other } = await admin
        .from('profiles')
        .select('id')
        .eq('email', requested)
        .neq('id', user.id)
        .limit(1)

      if (other?.length) return jsonNoStore({ error: AUTH_ERROR_MESSAGES.email_exists }, 409)
    }

    const otp = await createOtp({
      purpose: 'verify_email',
      channel: 'email',
      target: requested,
      userId: user.id,
    })

    if (!otp.ok) return jsonNoStore({ error: otp.error, retry_after: otp.retryAfter }, otp.status)

    return jsonNoStore({
      success: true,
      masked_target: maskEmail(requested),
      expires_in: OTP_EXPIRY_MINUTES * 60,
      ...(otp.devCode ? { devCode: otp.devCode } : {}),
    })
  } catch (error: any) {
    console.error('[VERIFY_EMAIL]', error?.message)
    return jsonNoStore({ error: AUTH_ERROR_MESSAGES.server }, 500)
  }
}