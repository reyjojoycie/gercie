// app/api/auth/verify-phone/route.ts
import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import { checkRateLimit, getUserRateLimitKey } from '@/lib/security'
import { createOtp, jsonNoStore, OTP_EXPIRY_MINUTES } from '@/lib/auth/otp'
import { AUTH_ERROR_MESSAGES, isValidPhone, maskPhone, normalizePhone } from '@/lib/validators/auth'

export const runtime = 'nodejs'

/** Envoie un code SMS à 6 chiffres (le numéro peut être ressaisi dans le body). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonNoStore({ error: AUTH_ERROR_MESSAGES.session_expired }, 401)

    const limit = checkRateLimit(getUserRateLimitKey(user.id, 'verify-phone-send'), 3, 60 * 60 * 1000)
    if (!limit.allowed) return jsonNoStore({ error: AUTH_ERROR_MESSAGES.rate_limited }, 429)

    const body = (await request.json().catch(() => ({}))) as { telephone?: string }
    const admin = createServiceClient() as any

    const { data: profile } = await admin
      .from('profiles')
      .select('telephone, phone_verified')
      .eq('id', user.id)
      .maybeSingle()

    const raw = body?.telephone || profile?.telephone || ''

    if (!raw) {
      return jsonNoStore({ error: 'Saisissez votre numéro de téléphone.' }, 400)
    }

    if (!isValidPhone(raw)) {
      return jsonNoStore({ error: 'Numéro invalide (ex : 0812345678 ou +243812345678).' }, 400)
    }

    const target = normalizePhone(raw)
    const current = profile?.telephone ? normalizePhone(profile.telephone) : ''

    if (profile?.phone_verified && target === current) {
      return jsonNoStore({
        success: true,
        already_verified: true,
        message: 'Votre téléphone est déjà vérifié.',
      })
    }

    const { data: other } = await admin
      .from('profiles')
      .select('id')
      .eq('telephone', target)
      .eq('phone_verified', true)
      .neq('id', user.id)
      .limit(1)

    if (other?.length) return jsonNoStore({ error: AUTH_ERROR_MESSAGES.phone_exists }, 409)

    const otp = await createOtp({
      purpose: 'verify_phone',
      channel: 'sms',
      target,
      userId: user.id,
    })

    if (!otp.ok) return jsonNoStore({ error: otp.error, retry_after: otp.retryAfter }, otp.status)

    return jsonNoStore({
      success: true,
      masked_target: maskPhone(target),
      expires_in: OTP_EXPIRY_MINUTES * 60,
      ...(otp.devCode ? { devCode: otp.devCode } : {}),
    })
  } catch (error: any) {
    console.error('[VERIFY_PHONE]', error?.message)
    return jsonNoStore({ error: AUTH_ERROR_MESSAGES.server }, 500)
  }
}