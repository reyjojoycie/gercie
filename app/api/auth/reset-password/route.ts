// app/api/auth/reset-password/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabaseServer'
import { invalidateProfileCache } from '@/lib/auth'
import {
  consumeResetToken,
  createOtp,
  enforceIpLimit,
  issueResetToken,
  jsonNoStore,
  OTP_EXPIRY_MINUTES,
  RESET_TOKEN_EXPIRY_MINUTES,
  verifyOtp,
} from '@/lib/auth/otp'
import {
  AUTH_ERROR_MESSAGES,
  detectIdentifierType,
  normalizeEmail,
  normalizePhone,
  registerPasswordSchema,
  verificationCodeSchema,
} from '@/lib/validators/auth'

export const runtime = 'nodejs'

const HOUR = 60 * 60 * 1000

const identifierField = z.string().trim().min(1, 'Email ou téléphone requis').max(255)

const sendSchema = z.object({ identifier: identifierField })
const verifySchema = z.object({ identifier: identifierField, code: verificationCodeSchema })
const resetSchema = z.object({
  resetToken: z.string().min(1, 'Session expirée'),
  newPassword: registerPasswordSchema,
  confirmPassword: z.string(),
})

/** Retrouve le compte via un canal VÉRIFIÉ uniquement. */
async function resolveAccount(identifier: string) {
  const type = detectIdentifierType(identifier.trim())

  if (type === 'unknown') return { type, target: '', userId: null as string | null }

  const db = createServiceClient() as any
  const target = type === 'email' ? normalizeEmail(identifier) : normalizePhone(identifier)

  const base = db.from('profiles').select('id').limit(1)
  const { data } =
    type === 'email'
      ? await base.eq('email', target).eq('email_verified', true)
      : await base.eq('telephone', target).eq('phone_verified', true)

  return { type, target, userId: (data?.[0]?.id ?? null) as string | null }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

    if (!body || typeof body !== 'object') {
      return jsonNoStore({ error: 'Corps de requête JSON invalide.' }, 400)
    }

    /* ============================ SEND ============================ */
    if (body.step === 'send') {
      const limited = enforceIpLimit(request, 'reset-send', 10, HOUR)
      if (limited) return limited

      const parsed = sendSchema.safeParse(body)
      if (!parsed.success) {
        return jsonNoStore({ error: parsed.error.issues[0]?.message || 'Données invalides.' }, 400)
      }

      const account = await resolveAccount(parsed.data.identifier)

      if (account.type === 'unknown') {
        return jsonNoStore(
          { error: 'Format invalide. Saisissez un email valide ou un numéro de téléphone.' },
          400
        )
      }

      const genericMessage =
        account.type === 'email'
          ? 'Si un compte vérifié existe avec cet email, un code a été envoyé.'
          : 'Si un compte vérifié existe avec ce numéro, un code a été envoyé.'

      let devCode: string | undefined

      if (account.userId) {
        const otp = await createOtp({
          purpose: 'reset_password',
          channel: account.type === 'email' ? 'email' : 'sms',
          target: account.target,
          userId: account.userId,
        })

        if (!otp.ok && !otp.throttled) {
          return jsonNoStore({ error: otp.error }, otp.status)
        }
        if (otp.ok) devCode = otp.devCode
      }

      return jsonNoStore({
        success: true,
        message: genericMessage,
        type: account.type,
        expires_in: OTP_EXPIRY_MINUTES * 60,
        ...(devCode ? { devCode } : {}),
      })
    }

    /* =========================== VERIFY =========================== */
    if (body.step === 'verify') {
      const limited = enforceIpLimit(request, 'reset-verify', 20, HOUR)
      if (limited) return limited

      const parsed = verifySchema.safeParse(body)
      if (!parsed.success) {
        return jsonNoStore({ error: parsed.error.issues[0]?.message || 'Données invalides.' }, 400)
      }

      const account = await resolveAccount(parsed.data.identifier)

      if (!account.userId) {
        return jsonNoStore({ error: 'Code invalide ou expiré. Demandez-en un nouveau.' }, 400)
      }

      const check = await verifyOtp({
        purpose: 'reset_password',
        target: account.target,
        userId: account.userId,
        code: parsed.data.code,
      })

      if (!check.ok) return jsonNoStore({ error: check.error }, check.status)

      const resetToken = await issueResetToken(check.row.id)

      return jsonNoStore({
        success: true,
        resetToken,
        expires_in: RESET_TOKEN_EXPIRY_MINUTES * 60,
      })
    }

    /* ============================ RESET =========================== */
    if (body.step === 'reset') {
      const limited = enforceIpLimit(request, 'reset-final', 10, HOUR)
      if (limited) return limited

      const parsed = resetSchema.safeParse(body)
      if (!parsed.success) {
        return jsonNoStore({ error: parsed.error.issues[0]?.message || 'Données invalides.' }, 400)
      }

      if (parsed.data.newPassword !== parsed.data.confirmPassword) {
        return jsonNoStore({ error: 'Les mots de passe ne correspondent pas.' }, 400)
      }

      const userId = await consumeResetToken(parsed.data.resetToken)

      if (!userId) {
        return jsonNoStore(
          { error: 'Session expirée. Recommencez la réinitialisation.' },
          401
        )
      }

      const admin = createServiceClient() as any
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: parsed.data.newPassword,
      })

      if (error) {
        console.error('[RESET_PASSWORD] mise à jour :', error.message)
        return jsonNoStore({ error: 'Erreur lors de la réinitialisation du mot de passe.' }, 500)
      }

      invalidateProfileCache(userId)

      return jsonNoStore({
        success: true,
        message: 'Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.',
      })
    }

    return jsonNoStore({ error: 'Étape invalide.' }, 400)
  } catch (error: any) {
    console.error('[RESET_PASSWORD]', error?.message)
    return jsonNoStore({ error: AUTH_ERROR_MESSAGES.server }, 500)
  }
}