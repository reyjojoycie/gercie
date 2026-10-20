// lib/auth/otp.ts
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import { sendEmail } from '@/lib/email/send'
import { checkRateLimit, getIpRateLimitKey } from '@/lib/security'
import { AUTH_ERROR_MESSAGES, maskEmail, maskPhone } from '@/lib/validators/auth'

/* ------------------------------------------------------------------ */
/*  Types & constantes                                                 */
/* ------------------------------------------------------------------ */
export type OtpPurpose =
  | 'signup'
  | 'reset_password'
  | 'change_password'
  | 'verify_email'
  | 'verify_phone'

export type OtpChannel = 'email' | 'sms'

export const OTP_LENGTH = 6
export const OTP_EXPIRY_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_SECONDS = 60
export const OTP_MAX_PER_HOUR = 5
export const RESET_TOKEN_EXPIRY_MINUTES = 15
/** Délai avant suppression du canal non vérifié (en heures) */
export const UNVERIFIED_CHANNEL_TTL_HOURS = 6

export interface OtpRow {
  id: string
  purpose: OtpPurpose
  channel: OtpChannel
  target: string
  user_id: string | null
  code_hash: string
  attempts: number
  expires_at: string
  consumed_at: string | null
  created_at: string
}

const PURPOSE_LABEL: Record<OtpPurpose, string> = {
  signup: 'créer votre compte',
  reset_password: 'réinitialiser votre mot de passe',
  change_password: 'changer votre mot de passe',
  verify_email: 'vérifier votre email',
  verify_phone: 'vérifier votre numéro de téléphone',
}

// La table otp_codes n'est pas dans les types générés : on passe par un client "any"
const db = () => createServiceClient() as any

/* ------------------------------------------------------------------ */
/*  Helpers HTTP                                                       */
/* ------------------------------------------------------------------ */
export function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Limite par IP (en mémoire). Retourne une réponse 429 ou null. */
export function enforceIpLimit(
  request: Request,
  action: string,
  max: number,
  windowMs: number
): NextResponse | null {
  const result = checkRateLimit(getIpRateLimitKey(request, action), max, windowMs)
  if (result.allowed) return null

  return NextResponse.json(
    { error: AUTH_ERROR_MESSAGES.rate_limited, retry_after: result.retryAfterSeconds },
    {
      status: 429,
      headers: { 'Retry-After': String(result.retryAfterSeconds ?? 60), 'Cache-Control': 'no-store' },
    }
  )
}

export function maskTarget(channel: OtpChannel, target: string): string {
  return channel === 'email' ? maskEmail(target) : maskPhone(target)
}

/* ------------------------------------------------------------------ */
/*  Hash                                                               */
/* ------------------------------------------------------------------ */
function secret(): string {
  const s = process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('OTP_SECRET ou SUPABASE_SERVICE_ROLE_KEY manquant')
  return s
}

function hashCode(purpose: OtpPurpose, target: string, code: string): string {
  return createHmac('sha256', secret()).update(`${purpose}:${target}:${code}`).digest('hex')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function generateCode(): string {
  let code = ''
  for (let i = 0; i < OTP_LENGTH; i++) code += randomInt(0, 10).toString()
  return code
}

/* ------------------------------------------------------------------ */
/*  Envoi (email : Resend / SMS : Twilio puis Africa's Talking)        */
/* ------------------------------------------------------------------ */
function emailHtml(code: string, purpose: OtpPurpose): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
    <h2 style="color:#1a1a2e;margin:0 0 8px;">Gercie</h2>
    <p>Voici votre code pour ${PURPOSE_LABEL[purpose]} :</p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#d4af37;text-align:center;padding:20px;background:#f9f9f9;border-radius:8px;margin:20px 0;">${code}</div>
    <p>Ce code expire dans <strong>${OTP_EXPIRY_MINUTES} minutes</strong>. Ne le partagez avec personne.</p>
    <p style="color:#888;font-size:12px;">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
  </div>`
}

async function sendSms(phone: string, code: string): Promise<boolean> {
  const body = `Gercie : votre code est ${code}. Valable ${OTP_EXPIRY_MINUTES} min. Ne le partagez jamais.`
  const isDev = process.env.NODE_ENV === 'development'

  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER

  if (sid && token && from) {
    try {
      const twilio = (await import('twilio')).default
      await twilio(sid, token).messages.create({ body, from, to: phone })
      return true
    } catch (err) {
      console.error('[OTP] Twilio a échoué :', (err as Error).message)
    }
  }

  if (process.env.AT_API_KEY && process.env.AT_USERNAME) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AfricasTalking = require('africastalking')
      const at = AfricasTalking({
        apiKey: process.env.AT_API_KEY,
        username: process.env.AT_USERNAME,
      })
      await at.SMS.send({
        to: [phone],
        message: body,
        from: process.env.AT_PHONE_NUMBER || undefined,
      })
      return true
    } catch (err) {
      console.error("[OTP] Africa's Talking a échoué :", (err as Error).message)
    }
  }

  if (isDev && !(sid && token && from) && !process.env.AT_API_KEY) {
    console.log(`[OTP] (dev) SMS → ${phone} : ${code}`)
    return true
  }

  return false
}

async function deliverCode(
  channel: OtpChannel,
  target: string,
  code: string,
  purpose: OtpPurpose
): Promise<boolean> {
  if (channel === 'email') {
    if (!process.env.RESEND_API_KEY) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[OTP] (dev) email → ${target} : ${code}`)
        return true
      }
      console.error('[OTP] RESEND_API_KEY manquant')
      return false
    }

    return sendEmail({
      to: target,
      subject: `Votre code Gercie : ${code}`,
      html: emailHtml(code, purpose),
    })
  }

  return sendSms(target, code)
}

/* ------------------------------------------------------------------ */
/*  Création d'un code                                                 */
/* ------------------------------------------------------------------ */
export type CreateOtpResult =
  | { ok: true; id: string; expiresAt: Date; devCode?: string }
  | { ok: false; error: string; status: number; retryAfter?: number; throttled?: boolean }

export async function createOtp(params: {
  purpose: OtpPurpose
  channel: OtpChannel
  target: string
  userId?: string
}): Promise<CreateOtpResult> {
  const { purpose, channel, target, userId } = params
  const supabase = db()

  // 1. Anti-abus (en base : fonctionne aussi en serverless)
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recent, error: recentError } = await supabase
    .from('otp_codes')
    .select('created_at')
    .eq('purpose', purpose)
    .eq('target', target)
    .gt('created_at', since)
    .order('created_at', { ascending: false })

  if (recentError) {
    console.error('[OTP] lecture historique :', recentError.message)
    return { ok: false, error: AUTH_ERROR_MESSAGES.server, status: 500 }
  }

  const list: Array<{ created_at: string }> = recent ?? []

  if (list.length > 0) {
    const elapsed = (Date.now() - new Date(list[0].created_at).getTime()) / 1000
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
      return {
        ok: false,
        status: 429,
        throttled: true,
        retryAfter: wait,
        error: `Veuillez patienter ${wait}s avant de redemander un code.`,
      }
    }
  }

  if (list.length >= OTP_MAX_PER_HOUR) {
    return {
      ok: false,
      status: 429,
      throttled: true,
      retryAfter: 3600,
      error: 'Trop de codes demandés. Réessayez dans une heure.',
    }
  }

  // 2. Invalider les anciens codes encore actifs
  await supabase
    .from('otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('purpose', purpose)
    .eq('target', target)
    .is('consumed_at', null)

  // 3. Créer le nouveau code
  const code = generateCode()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

  const { data: row, error: insertError } = await supabase
    .from('otp_codes')
    .insert({
      purpose,
      channel,
      target,
      user_id: userId ?? null,
      code_hash: hashCode(purpose, target, code),
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !row) {
    console.error('[OTP] création :', insertError?.message)
    return { ok: false, error: AUTH_ERROR_MESSAGES.server, status: 500 }
  }

  // 4. Envoyer
  const delivered = await deliverCode(channel, target, code, purpose)

  if (!delivered) {
    await supabase.from('otp_codes').delete().eq('id', row.id)
    return {
      ok: false,
      status: 502,
      error:
        channel === 'email'
          ? "Impossible d'envoyer l'email pour le moment. Réessayez dans un instant."
          : "Impossible d'envoyer le SMS pour le moment. Réessayez dans un instant.",
    }
  }

  return {
    ok: true,
    id: row.id,
    expiresAt,
    ...(process.env.NODE_ENV === 'development' ? { devCode: code } : {}),
  }
}

/* ------------------------------------------------------------------ */
/*  Vérification d'un code                                             */
/* ------------------------------------------------------------------ */
export type VerifyOtpResult =
  | { ok: true; row: OtpRow }
  | { ok: false; error: string; status: number }

export async function verifyOtp(params: {
  purpose: OtpPurpose
  code: string
  target?: string
  userId?: string
}): Promise<VerifyOtpResult> {
  const { purpose, code, target, userId } = params

  if (!target && !userId) throw new Error('verifyOtp : target ou userId requis')

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, error: 'Le code doit contenir 6 chiffres.' }
  }

  // Frein supplémentaire en mémoire (limite les essais parallèles)
  const limiter = checkRateLimit(`otp-verify:${purpose}:${target ?? userId}`, 10, 15 * 60 * 1000)
  if (!limiter.allowed) {
    return { ok: false, status: 429, error: AUTH_ERROR_MESSAGES.rate_limited }
  }

  const supabase = db()

  let query = supabase
    .from('otp_codes')
    .select('*')
    .eq('purpose', purpose)
    .is('consumed_at', null)

  if (target) query = query.eq('target', target)
  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[OTP] vérification :', error.message)
    return { ok: false, status: 500, error: AUTH_ERROR_MESSAGES.server }
  }

  if (!data) {
    return { ok: false, status: 400, error: 'Code invalide ou expiré. Demandez-en un nouveau.' }
  }

  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: 'Le code a expiré. Demandez-en un nouveau.' }
  }

  if (data.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: 'Trop de tentatives. Demandez un nouveau code.' }
  }

  const expected = Buffer.from(data.code_hash, 'hex')
  const given = Buffer.from(hashCode(purpose, data.target, code), 'hex')
  const valid = expected.length === given.length && timingSafeEqual(expected, given)

  if (!valid) {
    const attempts = data.attempts + 1
    await supabase.from('otp_codes').update({ attempts }).eq('id', data.id)

    const remaining = OTP_MAX_ATTEMPTS - attempts
    return {
      ok: false,
      status: 400,
      error:
        remaining > 0
          ? `Code incorrect. ${remaining} essai${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}.`
          : 'Trop de tentatives. Demandez un nouveau code.',
    }
  }

  // Usage unique (atomique)
  const { data: consumed } = await supabase
    .from('otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', data.id)
    .is('consumed_at', null)
    .select('id')

  if (!consumed || consumed.length === 0) {
    return { ok: false, status: 400, error: 'Ce code a déjà été utilisé.' }
  }

  return { ok: true, row: data as OtpRow }
}

/* ------------------------------------------------------------------ */
/*  Jeton de réinitialisation (usage unique, 15 min)                   */
/* ------------------------------------------------------------------ */
export async function issueResetToken(otpId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')

  const { error } = await db()
    .from('otp_codes')
    .update({
      reset_token_hash: sha256(token),
      reset_token_expires_at: new Date(
        Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000
      ).toISOString(),
    })
    .eq('id', otpId)

  if (error) throw new Error('Impossible de créer le jeton de réinitialisation')

  return token
}

/** Retourne l'id de l'utilisateur si le jeton est valide, puis l'invalide. */
export async function consumeResetToken(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null

  const now = new Date().toISOString()

  const { data } = await db()
    .from('otp_codes')
    .update({ reset_used_at: now })
    .eq('reset_token_hash', sha256(token))
    .is('reset_used_at', null)
    .gt('reset_token_expires_at', now)
    .select('user_id')

  return data?.[0]?.user_id ?? null
}