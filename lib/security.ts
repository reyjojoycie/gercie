// lib/security.ts
import crypto from 'crypto'
import { createClient, createServiceClient } from './supabaseServer'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type VerificationCodeType =
  | 'email_verify'
  | 'phone_verify'
  | 'email_reset'
  | 'phone_reset'
  | 'login_otp'
  | 'change_email'
  | 'change_phone'

export interface VerificationCode {
  id: string
  user_id: string
  type: VerificationCodeType
  code: string
  expires_at: string
  created_at: string
}

export interface VerifyCodeResult {
  success: boolean
  error?: string
  code?: VerificationCode
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfterSeconds?: number
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const SCRYPT_KEYLEN = 64
const SCRYPT_COST = 16384 // N
const SCRYPT_BLOCK_SIZE = 8 // r
const SCRYPT_PARALLELIZATION = 1 // p
const SALT_LENGTH = 32

const CODE_LENGTH = 6
const CODE_EXPIRY_MINUTES = 10
const MAX_CODE_ATTEMPTS = 5
const CODE_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

const RATE_LIMIT_MAX_ATTEMPTS = 10
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

const REGISTER_MIN_PASSWORD_LENGTH = 4

/* ------------------------------------------------------------------ */
/*  Messages d'erreur                                                  */
/* ------------------------------------------------------------------ */

export const SECURITY_ERRORS = {
  invalid_code: 'Code incorrect.',
  code_expired: 'Le code a expiré. Demandez-en un nouveau.',
  code_not_found: 'Aucun code valide trouvé.',
  too_many_attempts: 'Trop de tentatives. Réessayez dans quelques minutes.',
  rate_limited: 'Trop de requêtes. Réessayez dans quelques minutes.',
  hash_failed: 'Erreur lors du hachage.',
  verify_failed: 'Erreur lors de la vérification.',
} as const

/* ------------------------------------------------------------------ */
/*  CLIENT SUPABASE POUR OPÉRATIONS DE SÉCURITÉ                        */
/* ------------------------------------------------------------------ */

type SecuritySupabaseClient =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createServiceClient>

/**
 * Pour les opérations serveur de sécurité, on privilégie le service role.
 * Cela évite de dépendre d'une session utilisateur ou de RLS trop strictes.
 *
 * Si SUPABASE_SERVICE_ROLE_KEY est absent, on retombe sur le client serveur
 * classique afin de ne casser pas un environnement de dev minimal.
 */
async function getSecurityClient(): Promise<SecuritySupabaseClient> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createServiceClient()
  }

  return createClient(false)
}

/* ------------------------------------------------------------------ */
/*  HASHAGE - scrypt natif (timing-safe)                               */
/* ------------------------------------------------------------------ */

/**
 * Hache une valeur avec scrypt (natif Node.js).
 * Format de sortie : scrypt:N:r:p:salt:hash (base64)
 *
 * Utilisé pour :
 * - Réponses de questions secrètes
 * - Tout secret devant être stocké de manière irréversible
 *
 * ⚠️ Ne PAS utiliser pour les mots de passe utilisateur
 * (Supabase Auth gère déjà ça avec bcrypt)
 */
export async function hashSecret(secret: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH)

    crypto.scrypt(
      secret,
      salt,
      SCRYPT_KEYLEN,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
      },
      (err, derivedKey) => {
        if (err) {
          reject(new Error(SECURITY_ERRORS.hash_failed))
          return
        }

        const hash = `scrypt:${SCRYPT_COST}:${SCRYPT_BLOCK_SIZE}:${SCRYPT_PARALLELIZATION}:${salt.toString(
          'base64'
        )}:${derivedKey.toString('base64')}`

        resolve(hash)
      }
    )
  })
}

/**
 * Vérifie une valeur par rapport à un hash scrypt.
 * Utilise une comparaison timing-safe pour éviter les timing attacks.
 */
export async function verifySecret(secret: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const [algorithm, n, r, p, saltB64, hashB64] = storedHash.split(':')

      if (algorithm !== 'scrypt') {
        resolve(false)
        return
      }

      const cost = parseInt(n, 10)
      const blockSize = parseInt(r, 10)
      const parallelization = parseInt(p, 10)
      const salt = Buffer.from(saltB64, 'base64')
      const expectedHash = Buffer.from(hashB64, 'base64')

      crypto.scrypt(
        secret,
        salt,
        expectedHash.length,
        {
          N: cost,
          r: blockSize,
          p: parallelization,
        },
        (err, derivedKey) => {
          if (err) {
            reject(new Error(SECURITY_ERRORS.verify_failed))
            return
          }

          if (derivedKey.length !== expectedHash.length) {
            resolve(false)
            return
          }

          resolve(crypto.timingSafeEqual(derivedKey, expectedHash))
        }
      )
    } catch (err) {
      reject(new Error(SECURITY_ERRORS.verify_failed))
    }
  })
}

/**
 * Normalise une réponse avant hashage/vérification.
 * IMPORTANT : Toujours utiliser la même normalisation pour le hash et la vérification.
 */
export function normalizeForHash(value: string): string {
  if (!value) return ''
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Hache une réponse de question secrète (normalisée).
 */
export async function hashSecurityAnswer(answer: string): Promise<string> {
  const normalized = normalizeForHash(answer)
  return hashSecret(normalized)
}

/**
 * Vérifie une réponse de question secrète.
 */
export async function verifySecurityAnswer(answer: string, storedHash: string): Promise<boolean> {
  const normalized = normalizeForHash(answer)
  return verifySecret(normalized, storedHash)
}

/* ------------------------------------------------------------------ */
/*  GÉNÉRATION DE CODES ET TOKENS                                      */
/* ------------------------------------------------------------------ */

/**
 * Génère un code numérique sécurisé (par défaut 6 chiffres).
 * Utilise crypto.randomInt pour une distribution uniforme.
 */
export function generateNumericCode(length: number = CODE_LENGTH): string {
  let code = ''

  for (let i = 0; i < length; i++) {
    code += crypto.randomInt(0, 10).toString()
  }

  return code
}

/**
 * Génère un token aléatoire sécurisé (hex).
 */
export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}

/**
 * Génère un code de validation alphanumérique.
 * Utile pour les codes de livraison, références, etc.
 */
export function generateAlphanumericCode(length: number = 6): string {
  // Exclure les caractères ambigus (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars[crypto.randomInt(0, chars.length)]
  }

  return code
}

/**
 * Génère un hash SHA-256 d'une valeur.
 * Utile pour les identifiants non sensibles (query_hash, etc.)
 *
 * ⚠️ PAS pour les secrets (utiliser hashSecret à la place)
 */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/**
 * Comparaison sécurisée de deux chaînes (timing-safe).
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false

  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)

  return crypto.timingSafeEqual(bufA, bufB)
}

/* ------------------------------------------------------------------ */
/*  GESTION DES CODES DE VÉRIFICATION                                  */
/* ------------------------------------------------------------------ */

/**
 * Crée un code de vérification pour un utilisateur.
 * Invalide automatiquement les codes précédents du même type.
 */
export async function createVerificationCode(
  userId: string,
  type: VerificationCodeType,
  options?: {
    codeLength?: number
    expiryMinutes?: number
  }
): Promise<{ code: string; expiresAt: Date }> {
  const supabase = await getSecurityClient()

  const codeLength = options?.codeLength ?? CODE_LENGTH
  const expiryMinutes = options?.expiryMinutes ?? CODE_EXPIRY_MINUTES

  const code = generateNumericCode(codeLength)
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000)

  // Invalider les codes précédents du même type
  await supabase
    .from('verification_codes')
    .delete()
    .eq('user_id', userId)
    .eq('type', type)

  const { error } = await supabase.from('verification_codes').insert({
    user_id: userId,
    type,
    code,
    expires_at: expiresAt.toISOString(),
  })

  if (error) {
    console.error('[security] Erreur création code:', error)
    throw new Error('Impossible de créer le code de vérification')
  }

  return { code, expiresAt }
}

/**
 * Vérifie un code de vérification.
 *
 * Vérifications effectuées :
 * 1. Rate limiting (tentatives)
 * 2. Existence du code
 * 3. Expiration
 * 4. Correspondance du code
 */
export async function verifyVerificationCode(
  userId: string,
  type: VerificationCodeType,
  code: string,
  options?: {
    invalidateOnSuccess?: boolean
  }
): Promise<VerifyCodeResult> {
  const invalidateOnSuccess = options?.invalidateOnSuccess ?? true

  // Vérifier le rate limiting
  const rateLimitKey = `verify:${userId}:${type}`
  const rateLimit = checkRateLimit(rateLimitKey, MAX_CODE_ATTEMPTS, CODE_ATTEMPTS_WINDOW_MS)

  if (!rateLimit.allowed) {
    return {
      success: false,
      error: SECURITY_ERRORS.too_many_attempts,
    }
  }

  const supabase = await getSecurityClient()

  // Récupérer le code valide le plus récent
  const { data, error } = await supabase
    .from('verification_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[security] Erreur vérification code:', error)
    return {
      success: false,
      error: SECURITY_ERRORS.verify_failed,
    }
  }

  if (!data) {
    return {
      success: false,
      error: SECURITY_ERRORS.code_expired,
    }
  }

  // Comparaison sécurisée du code
  const isValid = safeCompare(code.trim(), data.code)

  if (!isValid) {
    return {
      success: false,
      error: SECURITY_ERRORS.invalid_code,
    }
  }

  // Invalider le code après utilisation (one-time use)
  if (invalidateOnSuccess) {
    await supabase.from('verification_codes').delete().eq('id', data.id)
  }

  // Réinitialiser le compteur de tentatives en cas de succès
  resetRateLimit(rateLimitKey)

  return {
    success: true,
    code: data as VerificationCode,
  }
}

/**
 * Invalide tous les codes d'un type pour un utilisateur.
 */
export async function invalidateVerificationCodes(
  userId: string,
  type?: VerificationCodeType
): Promise<void> {
  const supabase = await getSecurityClient()

  let query = supabase.from('verification_codes').delete().eq('user_id', userId)

  if (type) {
    query = query.eq('type', type)
  }

  const { error } = await query

  if (error) {
    console.error('[security] Erreur invalidation codes:', error)
  }
}

/**
 * Nettoie les codes expirés (à appeler via cron).
 */
export async function cleanupExpiredCodes(): Promise<number> {
  const supabase = await getSecurityClient()

  const { data, error } = await supabase
    .from('verification_codes')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id')

  if (error) {
    console.error('[security] Erreur nettoyage codes:', error)
    return 0
  }

  return data?.length ?? 0
}

/* ------------------------------------------------------------------ */
/*  RATE LIMITING (en mémoire)                                         */
/* ------------------------------------------------------------------ */

/**
 * Structure de stockage pour le rate limiting.
 * ⚠️ En mémoire : ne survit pas aux redémarrages.
 * Pour la production multi-instance, utiliser Redis ou la base de données.
 */
interface RateLimitEntry {
  attempts: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Vérifie si une action est autorisée (rate limiting).
 * Incrémente le compteur si autorisée.
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number = RATE_LIMIT_MAX_ATTEMPTS,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  // Nettoyer les entrées expirées périodiquement
  if (rateLimitStore.size > 10000) {
    cleanupRateLimitStore()
  }

  // Pas d'entrée ou expirée → nouvelle fenêtre
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, {
      attempts: 1,
      resetAt: now + windowMs,
    })

    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetAt: new Date(now + windowMs),
    }
  }

  // Limite atteinte
  if (entry.attempts >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)

    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.resetAt),
      retryAfterSeconds,
    }
  }

  // Incrémenter
  entry.attempts += 1

  return {
    allowed: true,
    remaining: maxAttempts - entry.attempts,
    resetAt: new Date(entry.resetAt),
  }
}

/**
 * Réinitialise le compteur de rate limiting pour une clé.
 * À appeler après une action réussie.
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key)
}

/**
 * Nettoie les entrées expirées du store de rate limiting.
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now()

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key)
    }
  }
}

/**
 * Génère une clé de rate limiting basée sur l'IP.
 */
export function getIpRateLimitKey(request: Request, action: string): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown'

  return `${action}:ip:${ip}`
}

/**
 * Génère une clé de rate limiting basée sur l'utilisateur.
 */
export function getUserRateLimitKey(userId: string, action: string): string {
  return `${action}:user:${userId}`
}

/* ------------------------------------------------------------------ */
/*  VALIDATION DE MOT DE PASSE                                         */
/* ------------------------------------------------------------------ */

export interface PasswordStrengthResult {
  valid: boolean
  score: number // 0-100
  label: 'very_weak' | 'weak' | 'fair' | 'good' | 'strong'
  errors: string[]
  suggestions: string[]
}

export interface PasswordStrengthOptions {
  mode?: 'register' | 'strong'
}

/**
 * Valide la force d'un mot de passe.
 *
 * Mode par défaut : 'register'
 * - Minimum 4 caractères
 * - Pas de complexité obligatoire
 * - Suggestions pour améliorer la sécurité
 *
 * Mode 'strong' :
 * - Minimum 8 caractères
 * - Majuscule obligatoire
 * - Minuscule obligatoire
 * - Chiffre obligatoire
 */
export function validatePasswordStrength(
  password: string,
  options?: PasswordStrengthOptions
): PasswordStrengthResult {
  const mode = options?.mode ?? 'register'
  const minLength = mode === 'strong' ? 8 : REGISTER_MIN_PASSWORD_LENGTH

  const errors: string[] = []
  const suggestions: string[] = []
  let score = 0

  // Longueur minimale obligatoire
  if (password.length >= minLength) {
    score += mode === 'register' ? 40 : 20
  } else {
    errors.push(`Le mot de passe doit contenir au moins ${minLength} caractères.`)
  }

  if (mode === 'strong') {
    if (/[A-Z]/.test(password)) {
      score += 20
    } else {
      errors.push('Le mot de passe doit contenir au moins une majuscule.')
    }

    if (/[a-z]/.test(password)) {
      score += 20
    } else {
      errors.push('Le mot de passe doit contenir au moins une minuscule.')
    }

    if (/[0-9]/.test(password)) {
      score += 20
    } else {
      errors.push('Le mot de passe doit contenir au moins un chiffre.')
    }
  } else {
    if (/[A-Z]/.test(password)) {
      score += 10
    } else {
      suggestions.push('Ajoutez une majuscule pour renforcer le mot de passe.')
    }

    if (/[a-z]/.test(password)) {
      score += 10
    } else {
      suggestions.push('Ajoutez une minuscule pour renforcer le mot de passe.')
    }

    if (/[0-9]/.test(password)) {
      score += 10
    } else {
      suggestions.push('Ajoutez un chiffre pour renforcer le mot de passe.')
    }
  }

  // Caractère spécial (bonus)
  if (/[^A-Za-z0-9]/.test(password)) {
    score += 10
  } else {
    suggestions.push('Ajoutez un caractère spécial (!@#$%^&*) pour renforcer le mot de passe.')
  }

  // Longueur étendue (bonus)
  if (password.length >= 12) {
    score += 10
  } else {
    suggestions.push('Utilisez 12 caractères ou plus pour une meilleure sécurité.')
  }

  // Vérifier les patterns faibles
  const weakPatterns = [
    /^(12345|password|admin|qwerty|azerty)/i,
    /(.)\1{4,}/, // 5+ caractères identiques
  ]

  for (const pattern of weakPatterns) {
    if (pattern.test(password)) {
      score = Math.max(0, score - 30)
      suggestions.push('Évitez les séquences courantes ou les caractères répétés.')
      break
    }
  }

  // Déterminer le label
  let label: PasswordStrengthResult['label']

  if (score < 40) label = 'very_weak'
  else if (score < 60) label = 'weak'
  else if (score < 75) label = 'fair'
  else if (score < 90) label = 'good'
  else label = 'strong'

  return {
    valid: errors.length === 0,
    score: Math.min(100, score),
    label,
    errors,
    suggestions,
  }
}

/**
 * Validation forte, conservée pour les usages admin/sécurité.
 */
export function validateStrongPasswordStrength(password: string): PasswordStrengthResult {
  return validatePasswordStrength(password, { mode: 'strong' })
}

/**
 * Vérification rapide compatible avec la règle produit Kinshasa :
 * minimum 4 caractères, sans complexité obligatoire.
 */
export function isPasswordValid(password: string): boolean {
  return password.length >= REGISTER_MIN_PASSWORD_LENGTH
}

/**
 * Alias explicite pour la validation d'inscription.
 */
export function isRegisterPasswordValid(password: string): boolean {
  return isPasswordValid(password)
}

/**
 * Ancienne validation forte, conservée pour admin/sécurité.
 */
export function isStrongPasswordValid(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  )
}

/* ------------------------------------------------------------------ */
/*  HELPERS DE SÉCURITÉ DIVERS                                         */
/* ------------------------------------------------------------------ */

/**
 * Sanitize une entrée utilisateur (protection XSS basique).
 * À utiliser avant affichage ou stockage.
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''

  return input
    .replace(/[<>]/g, '') // Supprimer les balises
    .replace(/javascript:/gi, '') // Supprimer les protocoles dangereux
    .replace(/on\w+=/gi, '') // Supprimer les event handlers
    .trim()
    .slice(0, 1000) // Limiter la longueur
}

/**
 * Vérifie si une valeur est un UUID valide.
 */
export function isValidUuid(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  return uuidRegex.test(value)
}

/**
 * Masque partiellement une valeur pour les logs.
 */
export function maskForLog(value: string, visibleChars: number = 3): string {
  if (!value) return ''
  if (value.length <= visibleChars * 2) return '***'

  return `${value.slice(0, visibleChars)}***${value.slice(-visibleChars)}`
}

/**
 * Vérifie si l'utilisateur est banni.
 */
export function isUserBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false

  const bannedDate = new Date(bannedUntil)
  if (Number.isNaN(bannedDate.getTime())) return false

  return bannedDate > new Date()
}

/* ------------------------------------------------------------------ */
/*  Export par défaut                                                  */
/* ------------------------------------------------------------------ */

export default {
  // Hashage
  hashSecret,
  verifySecret,
  hashSecurityAnswer,
  verifySecurityAnswer,
  normalizeForHash,

  // Génération
  generateNumericCode,
  generateToken,
  generateAlphanumericCode,
  sha256,

  // Codes de vérification
  createVerificationCode,
  verifyVerificationCode,
  invalidateVerificationCodes,
  cleanupExpiredCodes,

  // Rate limiting
  checkRateLimit,
  resetRateLimit,
  cleanupRateLimitStore,
  getIpRateLimitKey,
  getUserRateLimitKey,

  // Validation
  validatePasswordStrength,
  validateStrongPasswordStrength,
  isPasswordValid,
  isRegisterPasswordValid,
  isStrongPasswordValid,

  // Helpers
  safeCompare,
  sanitizeInput,
  isValidUuid,
  maskForLog,
  isUserBanned,

  // Erreurs
  SECURITY_ERRORS,
}