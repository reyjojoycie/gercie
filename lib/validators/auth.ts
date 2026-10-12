// lib/validators/auth.ts
import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Regex et constantes                                                */
/* ------------------------------------------------------------------ */

export const PHONE_REGEX = /^(\+?243|00243|0)[1-9][0-9]{7,8}$/
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ✅ Longueur minimale réduite à 4 pour Kinshasa (UX simplifiée)
export const MIN_PASSWORD_LENGTH = 4
export const MAX_PASSWORD_LENGTH = 128
export const VERIFICATION_CODE_LENGTH = 6

/* ------------------------------------------------------------------ */
/*  Helpers de normalisation                                           */
/* ------------------------------------------------------------------ */

export function normalizePhone(phone: string): string {
  if (!phone) return ''

  // On garde uniquement chiffres et + éventuel
  let cleaned = phone.replace(/[^\d+]/g, '')

  if (!cleaned) return ''

  // 00243 -> +243
  if (cleaned.startsWith('00243')) {
    cleaned = '+243' + cleaned.slice(5)
  }
  // 243 sans + -> +243
  else if (cleaned.startsWith('243') && !cleaned.startsWith('+243')) {
    cleaned = '+243' + cleaned.slice(3)
  }
  // 0XXXXXXXXX -> +243XXXXXXXXX
  else if (cleaned.startsWith('0') && !cleaned.startsWith('00')) {
    cleaned = '+243' + cleaned.slice(1)
  }

  // Cas +2430XXXXXXXXX : on retire le zéro après l'indicatif
  if (cleaned.startsWith('+2430')) {
    cleaned = '+243' + cleaned.slice(5)
  }

  return cleaned
}

export function isValidPhone(phone: string): boolean {
  if (!phone) return false
  return PHONE_REGEX.test(normalizePhone(phone))
}

export function normalizeAnswer(answer: string): string {
  if (!answer) return ''
  return answer.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeEmail(email: string): string {
  if (!email) return ''
  return email.trim().toLowerCase()
}

export function maskEmail(email: string): string {
  if (!email) return ''

  const [local, domain] = email.split('@')
  if (!local || !domain) return email

  if (local.length <= 2) return local[0] + '***@' + domain
  return local[0] + '***' + local.slice(-1) + '@' + domain
}

export function maskPhone(phone: string): string {
  if (!phone) return ''

  const cleaned = phone.replace(/\s+/g, '')
  if (cleaned.length < 4) return cleaned

  return (
    cleaned.slice(0, 3) +
    '•'.repeat(Math.max(0, cleaned.length - 5)) +
    cleaned.slice(-2)
  )
}

/* ------------------------------------------------------------------ */
/*  Schémas de base (réutilisables)                                    */
/* ------------------------------------------------------------------ */

export const emailSchema = z
  .string({ required_error: 'Email requis' })
  .min(1, 'Email requis')
  .max(255, 'Email trop long')
  .email('Email invalide')
  .transform(normalizeEmail)

export const phoneSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine(
    (val) => !val || isValidPhone(val),
    'Numéro invalide (ex: 0812345678 ou +243812345678)'
  )
  .transform((val) => (val ? normalizePhone(val) : ''))

export const phoneRequiredSchema = z
  .string({ required_error: 'Téléphone requis' })
  .min(1, 'Téléphone requis')
  .refine(
    (val) => isValidPhone(val),
    'Numéro invalide (ex: 0812345678 ou +243812345678)'
  )
  .transform(normalizePhone)

/**
 * ✅ Schéma mot de passe PERMISSIF pour l'inscription
 * - Min 4 caractères (adapté contexte Kinshasa)
 * - Max 128 caractères
 * - PAS de contraintes de complexité obligatoire
 */
export const registerPasswordSchema = z
  .string({ required_error: 'Mot de passe requis' })
  .min(MIN_PASSWORD_LENGTH, `Minimum ${MIN_PASSWORD_LENGTH} caractères`)
  .max(MAX_PASSWORD_LENGTH, 'Mot de passe trop long')

/**
 * Schéma mot de passe FORT (conservé pour usage admin / sécurité renforcée)
 * Non utilisé dans les flux utilisateur standard.
 */
export const strongPasswordSchema = z
  .string({ required_error: 'Mot de passe requis' })
  .min(8, 'Minimum 8 caractères')
  .max(MAX_PASSWORD_LENGTH, 'Mot de passe trop long')
  .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
  .regex(/[a-z]/, 'Doit contenir au moins une minuscule')
  .regex(/[0-9]/, 'Doit contenir au moins un chiffre')

export const simplePasswordSchema = z
  .string({ required_error: 'Mot de passe requis' })
  .min(1, 'Mot de passe requis')
  .max(MAX_PASSWORD_LENGTH, 'Mot de passe trop long')

export const verificationCodeSchema = z
  .string({ required_error: 'Code requis' })
  .min(1, 'Code requis')
  .regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres')

export const nameSchema = z
  .string({ required_error: 'Nom requis' })
  .min(2, 'Minimum 2 caractères')
  .max(50, 'Maximum 50 caractères')
  .transform((val) => val.trim())

/* ------------------------------------------------------------------ */
/*  Schémas d'authentification                                         */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  email: emailSchema,
  password: simplePasswordSchema,
})

/**
 * ✅ Register : utilise registerPasswordSchema (permissif)
 */
export const registerSchema = z
  .object({
    nom: nameSchema,
    prenom: nameSchema,
    email: emailSchema,
    telephone: phoneSchema,
    password: registerPasswordSchema,
    confirmPassword: z.string(),
    type_user: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

export const forgotPasswordSchema = z.object({
  identifier: z
    .string({ required_error: 'Email ou téléphone requis' })
    .min(1, 'Veuillez saisir votre email ou numéro de téléphone')
    .refine(
      (val) =>
        EMAIL_REGEX.test(val) || PHONE_REGEX.test(normalizePhone(val)),
      'Format invalide. Saisissez un email valide ou un numéro (ex: 0812345678)'
    ),
})

/**
 * ✅ Reset Password : utilise registerPasswordSchema (permissif)
 */
export const resetPasswordSchema = z
  .object({
    newPassword: registerPasswordSchema,
    confirmPassword: z.string(),
    token: z.string().optional(),
    code: verificationCodeSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

export const verifyCodeSchema = z.object({
  code: verificationCodeSchema,
})

/**
 * ✅ Change Password : utilise registerPasswordSchema pour le nouveau
 */
export const changePasswordSchema = z
  .object({
    currentPassword: simplePasswordSchema,
    newPassword: registerPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Le nouveau mot de passe doit être différent',
    path: ['newPassword'],
  })

export const securityQuestionSchema = z.object({
  question: z
    .string({ required_error: 'Question requise' })
    .min(10, 'La question doit contenir au moins 10 caractères')
    .max(200, 'La question est trop longue')
    .transform((val) => val.trim()),
  answer: z
    .string({ required_error: 'Réponse requise' })
    .min(2, 'La réponse est trop courte')
    .max(100, 'La réponse est trop longue')
    .transform(normalizeAnswer),
})

export const verifySecurityAnswerSchema = z.object({
  email: emailSchema,
  answer: z
    .string({ required_error: 'Réponse requise' })
    .min(1, 'La réponse est requise')
    .transform(normalizeAnswer),
})

/* ------------------------------------------------------------------ */
/*  Schémas de profil                                                  */
/* ------------------------------------------------------------------ */

export const updateProfileSchema = z.object({
  nom: nameSchema.optional(),
  prenom: nameSchema.optional(),
  telephone: phoneSchema.optional(),
  adresse: z
    .string()
    .max(255)
    .optional()
    .or(z.literal(''))
    .transform((v) => v?.trim() || null),
  commune_id: z.string().optional().or(z.literal('')),
  avatar_url: z
    .union([z.string().url(), z.literal('')])
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  preferences: z.record(z.unknown()).optional(),
  onboarding_completed: z.boolean().optional(),
  terms_accepted_at: z.string().datetime().optional(),
})

export const avatarUploadSchema = z.object({
  file: z
    .any()
    .refine((file) => file instanceof File, 'Fichier invalide')
    .refine(
      (file) =>
        ['image/jpeg', 'image/png', 'image/webp'].includes(file?.type),
      'Format invalide. Utilisez JPG, PNG ou WebP.'
    )
    .refine(
      (file) => file?.size <= 2 * 1024 * 1024,
      "L'image ne doit pas dépasser 2 Mo."
    ),
})

export const onboardingSchema = z.object({
  nom: nameSchema,
  prenom: nameSchema,
  telephone: phoneSchema,
  avatar_url: z.string().nullable().optional(),
  province_id: z.string().min(1, 'Province requise'),
  ville_id: z.string().min(1, 'Ville requise'),
  commune_id: z.string().min(1, 'Commune requise'),
  quartier: z.string().min(2, 'Quartier requis').max(100),
  avenue: z.string().min(2, 'Avenue requise').max(100),
  numero: z.string().max(20).optional().or(z.literal('')),
  reference: z.string().max(200).optional().or(z.literal('')),
  preferences: z.object({
    notifications_email: z.boolean(),
    notifications_sms: z.boolean(),
    langue: z.enum(['fr', 'en', 'ar', 'ln', 'sw']),
    devise: z.enum(['CDF', 'USD']),
  }),
  onboarding_completed: z.literal(true),
  terms_accepted_at: z.string().datetime(),
})

/* ------------------------------------------------------------------ */
/*  Schémas d'adresses                                                 */
/* ------------------------------------------------------------------ */

export const addressSchema = z.object({
  nom: z.string().min(2, 'Nom requis (min. 2 caractères)').max(100),
  province_id: z.string().min(1, 'Province requise'),
  ville_id: z.string().min(1, 'Ville requise'),
  commune_id: z.string().min(1, 'Commune requise'),
  quartier: z.string().min(2, 'Quartier requis').max(100),
  avenue: z.string().min(2, 'Avenue requise').max(100),
  numero: z.string().max(20).optional().or(z.literal('')),
  reference: z.string().max(200).optional().or(z.literal('')),
  telephone: phoneSchema,
})

export const addressUpdateSchema = addressSchema.partial()

/* ------------------------------------------------------------------ */
/*  Types dérivés                                                      */
/* ------------------------------------------------------------------ */

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type SecurityQuestionInput = z.infer<typeof securityQuestionSchema>
export type VerifySecurityAnswerInput = z.infer<typeof verifySecurityAnswerSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type OnboardingInput = z.infer<typeof onboardingSchema>
export type AddressInput = z.infer<typeof addressSchema>
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>

/* ------------------------------------------------------------------ */
/*  Helpers de validation                                              */
/* ------------------------------------------------------------------ */

export function validateSchema<T extends z.ZodSchema>(
  schema: T,
  data: unknown
):
  | { success: true; data: z.infer<T> }
  | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const errors: Record<string, string> = {}

  for (const issue of result.error.issues) {
    const path = issue.path.join('.')
    errors[path] = issue.message
  }

  return { success: false, errors }
}

export function calculatePasswordStrength(password: string): {
  score: number
  label: string
  checks: {
    length: boolean
    uppercase: boolean
    lowercase: boolean
    number: boolean
    special: boolean
    veryLong: boolean
  }
} {
  const checks = {
    length: password.length >= MIN_PASSWORD_LENGTH,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    veryLong: password.length >= 12,
  }

  const score = Object.values(checks).filter(Boolean).length

  const labels = [
    'Très faible',
    'Faible',
    'Faible',
    'Moyen',
    'Moyen',
    'Fort',
    'Très fort',
  ]

  return {
    score,
    label: labels[score] || 'Inconnu',
    checks,
  }
}

export function detectIdentifierType(value: string): 'email' | 'phone' | 'unknown' {
  if (EMAIL_REGEX.test(value)) return 'email'
  if (PHONE_REGEX.test(normalizePhone(value))) return 'phone'
  return 'unknown'
}

export function generateVerificationCode(length: number = VERIFICATION_CODE_LENGTH): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const array = new Uint32Array(length)
    cryptoObj.getRandomValues(array)
    return Array.from(array, (n) => (n % 10).toString()).join('')
  }

  // Fallback de compatibilité uniquement.
  // Pour les codes de sécurité serveur, préférer generateNumericCode() dans lib/security.ts.
  let code = ''
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString()
  }

  return code
}

/* ------------------------------------------------------------------ */
/*  Messages d'erreur partagés                                         */
/* ------------------------------------------------------------------ */

export const AUTH_ERROR_MESSAGES = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  account_banned: 'Votre compte a été suspendu.',
  account_deleted: "Ce compte n'existe plus.",
  account_inactive: 'Votre compte est désactivé.',
  email_not_verified: 'Veuillez vérifier votre email.',
  phone_not_verified: 'Veuillez vérifier votre téléphone.',
  onboarding_required: "Veuillez compléter l'onboarding.",
  session_expired: 'Session expirée. Veuillez vous reconnecter.',
  rate_limited: 'Trop de tentatives. Réessayez dans quelques minutes.',
  code_expired: 'Le code a expiré. Demandez-en un nouveau.',
  code_invalid: 'Code incorrect.',
  token_expired: 'Le lien a expiré. Demandez-en un nouveau.',
  token_invalid: 'Lien invalide.',
  email_exists: 'Un compte existe déjà avec cet email.',
  phone_exists: 'Un compte existe déjà avec ce numéro.',
  answer_incorrect: 'Réponse incorrecte.',
  network: 'Erreur réseau. Réessayez.',
  server: 'Erreur serveur. Réessayez dans quelques instants.',
} as const

/* ------------------------------------------------------------------ */
/*  Export par défaut                                                  */
/* ------------------------------------------------------------------ */

export default {
  PHONE_REGEX,
  EMAIL_REGEX,
  normalizePhone,
  normalizeAnswer,
  normalizeEmail,
  maskEmail,
  maskPhone,
  isValidPhone,
  emailSchema,
  phoneSchema,
  phoneRequiredSchema,
  strongPasswordSchema,
  registerPasswordSchema,
  simplePasswordSchema,
  verificationCodeSchema,
  nameSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyCodeSchema,
  changePasswordSchema,
  securityQuestionSchema,
  verifySecurityAnswerSchema,
  updateProfileSchema,
  avatarUploadSchema,
  onboardingSchema,
  addressSchema,
  addressUpdateSchema,
  validateSchema,
  calculatePasswordStrength,
  detectIdentifierType,
  generateVerificationCode,
  AUTH_ERROR_MESSAGES,
}