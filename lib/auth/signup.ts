// lib/auth/signup.ts
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabaseServer'
import {
  AUTH_ERROR_MESSAGES,
  emailSchema,
  nameSchema,
  phoneRequiredSchema,
  registerPasswordSchema,
  verificationCodeSchema,
} from '@/lib/validators/auth'

const baseSignup = z.object({
  nom: nameSchema,
  prenom: nameSchema,
  email: emailSchema,
  telephone: phoneRequiredSchema,
  password: registerPasswordSchema,
  confirmPassword: z.string(),
  channel: z.enum(['email', 'sms']),
})

const passwordsMatch = {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
}

export const signupSchema = baseSignup.refine((d) => d.password === d.confirmPassword, passwordsMatch)

export const signupCompleteSchema = baseSignup
  .extend({ code: verificationCodeSchema })
  .refine((d) => d.password === d.confirmPassword, passwordsMatch)

/** Vérifie qu'aucun compte n'utilise déjà cet email ou ce numéro (vérifié). */
export async function findSignupConflict(
  email: string,
  phone: string
): Promise<{ error: string; status: number } | null> {
  const db = createServiceClient() as any

  const { data: byEmail, error: emailError } = await db
    .from('profiles')
    .select('id')
    .eq('email', email)
    .limit(1)

  if (emailError) return { error: AUTH_ERROR_MESSAGES.server, status: 500 }
  if (byEmail?.length) return { error: AUTH_ERROR_MESSAGES.email_exists, status: 409 }

  const { data: byPhone, error: phoneError } = await db
    .from('profiles')
    .select('id')
    .eq('telephone', phone)
    .eq('phone_verified', true)
    .limit(1)

  if (phoneError) return { error: AUTH_ERROR_MESSAGES.server, status: 500 }
  if (byPhone?.length) return { error: AUTH_ERROR_MESSAGES.phone_exists, status: 409 }

  return null
}