// app/api/user/change-password/route.ts
import { NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import { checkRateLimit, getUserRateLimitKey } from '@/lib/security'
import { invalidateProfileCache } from '@/lib/auth'
import {
  createOtp,
  jsonNoStore,
  maskTarget,
  OTP_EXPIRY_MINUTES,
  verifyOtp,
  type OtpChannel,
} from '@/lib/auth/otp'
import {
  AUTH_ERROR_MESSAGES,
  normalizeEmail,
  normalizePhone,
  registerPasswordSchema,
} from '@/lib/validators/auth'

export const runtime = 'nodejs'

async function getContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const admin = createServiceClient() as any
  const { data: profile } = await admin
    .from('profiles')
    .select('email, telephone, email_verified, phone_verified')
    .eq('id', user.id)
    .maybeSingle()

  return { user, admin, profile }
}

function availableChannels(user: any, profile: any): Array<{ channel: OtpChannel; target: string }> {
  const list: Array<{ channel: OtpChannel; target: string }> = []

  const email = profile?.email || user.email
  if (profile?.email_verified && email) {
    list.push({ channel: 'email', target: normalizeEmail(email) })
  }

  if (profile?.phone_verified && profile?.telephone) {
    list.push({ channel: 'sms', target: normalizePhone(profile.telephone) })
  }

  return list
}

/** Vérifie le mot de passe sans toucher aux cookies de session. */
async function passwordMatches(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Variables Supabase manquantes')

  const client = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await client.auth.signInWithPassword({ email, password })
  return !error
}

/* ------------------------------------------------------------------ */
/*  GET : canaux disponibles pour recevoir le code                      */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const ctx = await getContext()
    if (!ctx) return jsonNoStore({ error: AUTH_ERROR_MESSAGES.session_expired }, 401)

    const channels = availableChannels(ctx.user, ctx.profile).map((c) => ({
      channel: c.channel,
      masked: maskTarget(c.channel, c.target),
    }))

    return jsonNoStore({ channels })
  } catch (error: any) {
    console.error('[CHANGE_PASSWORD][GET]', error?.message)
    return jsonNoStore({ error: AUTH_ERROR_MESSAGES.server }, 500)
  }
}

/* ------------------------------------------------------------------ */
/*  POST : step "send" puis step "confirm"                              */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getContext()
    if (!ctx) return jsonNoStore({ error: AUTH_ERROR_MESSAGES.session_expired }, 401)

    const { user, admin, profile } = ctx
    const body = (await request.json().catch(() => null)) as Record<string, any> | null

    if (!body) return jsonNoStore({ error: 'Corps de requête JSON invalide.' }, 400)

    const currentPassword = String(body.currentPassword ?? '')
    const newPassword = String(body.newPassword ?? '')

    if (!currentPassword) {
      return jsonNoStore({ error: 'Le mot de passe actuel est requis.' }, 400)
    }

    const pw = registerPasswordSchema.safeParse(newPassword)
    if (!pw.success) {
      return jsonNoStore({ error: pw.error.issues[0]?.message || 'Mot de passe invalide.' }, 400)
    }

    if (newPassword === currentPassword) {
      return jsonNoStore({ error: 'Le nouveau mot de passe doit être différent.' }, 400)
    }

    if (body.confirmPassword !== undefined && body.confirmPassword !== newPassword) {
      return jsonNoStore({ error: 'Les mots de passe ne correspondent pas.' }, 400)
    }

    if (!user.email) {
      return jsonNoStore({ error: 'Aucune adresse email associée à ce compte.' }, 400)
    }

    // Anti force brute sur le mot de passe actuel
    const pwLimit = checkRateLimit(getUserRateLimitKey(user.id, 'change-password-check'), 10, 15 * 60 * 1000)
    if (!pwLimit.allowed) {
      return jsonNoStore({ error: AUTH_ERROR_MESSAGES.rate_limited }, 429)
    }

    if (!(await passwordMatches(user.email, currentPassword))) {
      return jsonNoStore({ error: 'Mot de passe actuel incorrect.' }, 401)
    }

    /* ----------------------------- SEND ----------------------------- */
    if (body.step === 'send') {
      const channels = availableChannels(user, profile)

      if (!channels.length) {
        return jsonNoStore(
          { error: "Aucun canal vérifié. Vérifiez d'abord votre email ou votre téléphone." },
          400
        )
      }

      const wanted: OtpChannel =
        body.channel === 'sms' || body.channel === 'email' ? body.channel : channels[0].channel

      const chosen = channels.find((c) => c.channel === wanted)
      if (!chosen) return jsonNoStore({ error: "Ce canal n'est pas vérifié." }, 400)

      const sendLimit = checkRateLimit(getUserRateLimitKey(user.id, 'change-password-send'), 5, 60 * 60 * 1000)
      if (!sendLimit.allowed) {
        return jsonNoStore({ error: AUTH_ERROR_MESSAGES.rate_limited }, 429)
      }

      const otp = await createOtp({
        purpose: 'change_password',
        channel: chosen.channel,
        target: chosen.target,
        userId: user.id,
      })

      if (!otp.ok) {
        return jsonNoStore({ error: otp.error, retry_after: otp.retryAfter }, otp.status)
      }

      return jsonNoStore({
        success: true,
        channel: chosen.channel,
        masked_target: maskTarget(chosen.channel, chosen.target),
        expires_in: OTP_EXPIRY_MINUTES * 60,
        ...(otp.devCode ? { devCode: otp.devCode } : {}),
      })
    }

    /* ---------------------------- CONFIRM --------------------------- */
    if (body.step === 'confirm') {
      const code = String(body.code ?? '').trim()

      const check = await verifyOtp({ purpose: 'change_password', userId: user.id, code })
      if (!check.ok) return jsonNoStore({ error: check.error }, check.status)

      const { error } = await admin.auth.admin.updateUserById(user.id, { password: newPassword })

      if (error) {
        console.error('[CHANGE_PASSWORD] mise à jour :', error.message)
        return jsonNoStore({ error: 'Impossible de modifier le mot de passe.' }, 500)
      }

      invalidateProfileCache(user.id)

      return jsonNoStore({ success: true, message: 'Mot de passe modifié avec succès.' })
    }

    return jsonNoStore({ error: 'Étape invalide.' }, 400)
  } catch (error: any) {
    console.error('[CHANGE_PASSWORD]', error?.message)
    return jsonNoStore({ error: AUTH_ERROR_MESSAGES.server }, 500)
  }
}