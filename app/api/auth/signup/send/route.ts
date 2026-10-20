// app/api/auth/signup/send/route.ts
import { NextRequest } from 'next/server'
import { createOtp, enforceIpLimit, jsonNoStore, maskTarget, OTP_EXPIRY_MINUTES } from '@/lib/auth/otp'
import { findSignupConflict, signupSchema } from '@/lib/auth/signup'
import { AUTH_ERROR_MESSAGES, validateSchema } from '@/lib/validators/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const limited = enforceIpLimit(request, 'signup-send', 10, 60 * 60 * 1000)
    if (limited) return limited

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonNoStore({ error: 'Corps de requête JSON invalide.' }, 400)
    }

    const validation = validateSchema(signupSchema, body)
    if (!validation.success) {
      return jsonNoStore({ error: 'Données invalides.', errors: validation.errors }, 400)
    }

    const { email, telephone, channel } = validation.data

    const conflict = await findSignupConflict(email, telephone)
    if (conflict) return jsonNoStore({ error: conflict.error }, conflict.status)

    const target = channel === 'email' ? email : telephone
    const otp = await createOtp({ purpose: 'signup', channel, target })

    if (!otp.ok) {
      return jsonNoStore({ error: otp.error, retry_after: otp.retryAfter }, otp.status)
    }

    return jsonNoStore({
      success: true,
      channel,
      masked_target: maskTarget(channel, target),
      expires_in: OTP_EXPIRY_MINUTES * 60,
      ...(otp.devCode ? { devCode: otp.devCode } : {}),
    })
  } catch (error: any) {
    console.error('[SIGNUP_SEND]', error?.message)
    return jsonNoStore({ error: AUTH_ERROR_MESSAGES.server }, 500)
  }
}