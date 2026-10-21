// lib/rateLimit.ts
// ---------------------------------------------------------------------------
// Rate Limiting – Protection ultra‑premium des API sensibles
// Compatible Next.js App Router (API routes), Edge, et Serverless.
// Stockage : Map (in‑memory) en dev + Redis officiel via Upstash (auto en prod).
// ---------------------------------------------------------------------------

import { z } from 'zod'
import { Redis } from '@upstash/redis'
import logger from './logger'

/* ========================================================================== */
/*  Validation du schéma de configuration                                     */
/* ========================================================================== */
const rateLimitConfigSchema = z.object({
  id: z.string().min(1),
  maxRequests: z.number().int().positive(),
  windowSeconds: z.number().int().positive().optional(),
  banDurationSeconds: z.number().int().positive().optional(),
  useRedis: z.boolean().optional(),
  whitelist: z.array(z.string()).optional(),
  burstAllowance: z.number().int().nonnegative().optional(),
})

export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number          // timestamp ms de réinitialisation
  headers: Record<string, string>
}

interface WindowEntry {
  count: number
  resetTime: number
  banUntil: number | null
  infractions: number        // nombre de fois que la limite a été franchie
}

// ---------------------------------------------------------------------------
// Store mémoire (Map) – utilisé par défaut en développement local ou en fallback
// ---------------------------------------------------------------------------
const memoryStore = new Map<string, WindowEntry>()

// Nettoyage périodique pour éviter les fuites mémoire en local
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    memoryStore.forEach((entry, key) => {
      if (!entry.banUntil && now - entry.resetTime > 600_000) memoryStore.delete(key)
      if (entry.banUntil && now > entry.banUntil + 3600_000) memoryStore.delete(key)
    })
  }, 60_000)
}

// ---------------------------------------------------------------------------
// Initialisation d'Upstash Redis (Uniquement si les variables sont présentes)
// ---------------------------------------------------------------------------
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

// ---------------------------------------------------------------------------
// Fonction de rate limiting asynchrone (Recommandée pour les API routes)
// ---------------------------------------------------------------------------
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const parsed = rateLimitConfigSchema.safeParse(config)
  if (!parsed.success) {
    throw new Error(`Configuration de rate limit invalide: ${parsed.error.message}`)
  }
  
  const { 
    id, 
    maxRequests, 
    windowSeconds = 60, 
    banDurationSeconds = 300, 
    useRedis = false, 
    whitelist, 
    burstAllowance = 0 
  } = parsed.data
  
  const windowMs = windowSeconds * 1000
  const banMs = banDurationSeconds * 1000
  const now = Date.now()

  // Whitelist : si l'ID est dans la liste, on autorise sans compter
  if (whitelist?.includes(id)) {
    return {
      allowed: true,
      remaining: maxRequests,
      resetTime: now + windowMs,
      headers: buildHeaders(maxRequests, maxRequests, now + windowMs),
    }
  }

  const key = `ratelimit:${id}`
  const metaKey = `${key}:meta`

  // 🚀 MODE PRODUCTION : Utilise la librairie officielle Upstash Redis
  if (redis) {
    try {
      // 1. Incrémenter le compteur principal
      const current = await redis.incr(key)
      if (current === 1) {
        await redis.expire(key, windowSeconds)
      }

      // 2. Récupérer les métadonnées (bans, infractions)
      const metaStr = await redis.get(metaKey)
      let entry: WindowEntry = metaStr 
        ? JSON.parse(metaStr as string) 
        : { count: current, resetTime: now + windowMs, banUntil: null, infractions: 0 }

      // Synchroniser le compteur avec la valeur réelle de Redis
      entry.count = current

      // 3. Logique de bannissement et de fenêtre
      if (entry.banUntil && now < entry.banUntil) {
        return { allowed: false, remaining: 0, resetTime: entry.banUntil, headers: buildHeaders(maxRequests, 0, entry.banUntil) }
      }
      if (entry.banUntil && now >= entry.banUntil) {
        entry.banUntil = null
      }
      if (now >= entry.resetTime) {
        entry.count = 1
        entry.resetTime = now + windowMs
        entry.infractions = 0
      }

      // 4. Vérification de la limite
      const effectiveLimit = maxRequests + burstAllowance
      if (entry.count > effectiveLimit) {
        const progressiveMultiplier = Math.min(Math.pow(2, entry.infractions), 8) // max x8
        const banDuration = banMs * progressiveMultiplier
        entry.banUntil = now + banDuration
        entry.infractions++
        
        const ttl = Math.ceil((entry.banUntil - now) / 1000) + windowSeconds
        await redis.set(metaKey, JSON.stringify(entry), { ex: ttl })
        
        logger.warn('Rate limit dépassé (Redis)', { id, count: entry.count, limit: effectiveLimit })
        return { allowed: false, remaining: 0, resetTime: entry.banUntil, headers: buildHeaders(maxRequests, 0, entry.banUntil) }
      }

      // 5. Sauvegarder l'état
      const ttl = Math.ceil((entry.resetTime - now) / 1000) + 60
      await redis.set(metaKey, JSON.stringify(entry), { ex: ttl })
      
      return buildResult(maxRequests, effectiveLimit - entry.count, entry.resetTime)

    } catch (error) {
      // Fallback sécurisé : si Redis échoue, on utilise la mémoire pour ne pas casser l'app
      logger.error('Erreur Redis Upstash, fallback sur mémoire', error)
    }
  }

  // 🖥️ MODE DÉVELOPPEMENT (ou fallback) : Utilise la Map en mémoire
  let entry = memoryStore.get(id)

  if (!entry || (now >= entry.resetTime && !entry.banUntil)) {
    entry = { count: 1, resetTime: now + windowMs, banUntil: null, infractions: 0 }
    memoryStore.set(id, entry)
    return buildResult(maxRequests + burstAllowance, maxRequests + burstAllowance - 1, entry.resetTime)
  }

  if (entry.banUntil && now < entry.banUntil) {
    return { allowed: false, remaining: 0, resetTime: entry.banUntil, headers: buildHeaders(maxRequests, 0, entry.banUntil) }
  }

  if (entry.banUntil && now >= entry.banUntil) {
    entry.banUntil = null
  }

  if (now >= entry.resetTime) {
    entry.count = 1
    entry.resetTime = now + windowMs
    entry.infractions = 0
    memoryStore.set(id, entry)
    return buildResult(maxRequests + burstAllowance, maxRequests + burstAllowance - 1, entry.resetTime)
  }

  entry.count++
  const effectiveLimit = maxRequests + burstAllowance

  if (entry.count > effectiveLimit) {
    const progressiveMultiplier = Math.min(Math.pow(2, entry.infractions), 8)
    const banDuration = banMs * progressiveMultiplier
    entry.banUntil = now + banDuration
    entry.infractions++
    memoryStore.set(id, entry)
    logger.warn('Rate limit dépassé (Mémoire)', { id, count: entry.count, limit: effectiveLimit })
    return { allowed: false, remaining: 0, resetTime: entry.banUntil, headers: buildHeaders(maxRequests, 0, entry.banUntil) }
  }

  memoryStore.set(id, entry)
  return buildResult(maxRequests, effectiveLimit - entry.count, entry.resetTime)
}

// ---------------------------------------------------------------------------
// Fonction synchrone (mémoire uniquement) – conservée pour compatibilité
// ---------------------------------------------------------------------------
export function rateLimit(config: RateLimitConfig): RateLimitResult {
  const parsed = rateLimitConfigSchema.safeParse(config)
  if (!parsed.success) {
    throw new Error(`Configuration de rate limit invalide: ${parsed.error.message}`)
  }
  
  const { id, maxRequests, windowSeconds = 60, banDurationSeconds = 300, whitelist, burstAllowance = 0 } = parsed.data
  const windowMs = windowSeconds * 1000
  const banMs = banDurationSeconds * 1000
  const now = Date.now()

  if (whitelist?.includes(id)) {
    return { allowed: true, remaining: maxRequests, resetTime: now + windowMs, headers: buildHeaders(maxRequests, maxRequests, now + windowMs) }
  }

  let entry = memoryStore.get(id)

  if (!entry || (now >= entry.resetTime && !entry.banUntil)) {
    entry = { count: 1, resetTime: now + windowMs, banUntil: null, infractions: 0 }
    memoryStore.set(id, entry)
    return buildResult(maxRequests + burstAllowance, maxRequests + burstAllowance - 1, entry.resetTime)
  }

  if (entry.banUntil && now < entry.banUntil) {
    return { allowed: false, remaining: 0, resetTime: entry.banUntil, headers: buildHeaders(maxRequests, 0, entry.banUntil) }
  }

  if (entry.banUntil && now >= entry.banUntil) {
    entry.banUntil = null
  }

  if (now >= entry.resetTime) {
    entry.count = 1
    entry.resetTime = now + windowMs
    entry.infractions = 0
    memoryStore.set(id, entry)
    return buildResult(maxRequests + burstAllowance, maxRequests + burstAllowance - 1, entry.resetTime)
  }

  entry.count++
  const effectiveLimit = maxRequests + burstAllowance

  if (entry.count > effectiveLimit) {
    const progressiveMultiplier = Math.min(Math.pow(2, entry.infractions), 8)
    const banDuration = banMs * progressiveMultiplier
    entry.banUntil = now + banDuration
    entry.infractions++
    memoryStore.set(id, entry)
    logger.warn('Rate limit dépassé (Mémoire)', { id, count: entry.count, limit: effectiveLimit })
    return { allowed: false, remaining: 0, resetTime: entry.banUntil, headers: buildHeaders(maxRequests, 0, entry.banUntil) }
  }

  memoryStore.set(id, entry)
  return buildResult(maxRequests, effectiveLimit - entry.count, entry.resetTime)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildResult(max: number, remaining: number, resetTime: number): RateLimitResult {
  return { allowed: true, remaining, resetTime, headers: buildHeaders(max, remaining, resetTime) }
}

function buildHeaders(max: number, remaining: number, resetTime: number) {
  return {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
  }
}

export function applyRateLimitHeaders(response: Response, headers: Record<string, string>): Response {
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

export async function requireRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const result = await checkRateLimit(config)
  if (!result.allowed) {
    const response = new Response(JSON.stringify({ error: 'Trop de requêtes. Veuillez réessayer plus tard.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...result.headers },
    })
    throw response
  }
  return result
}

export async function resetRateLimit(id: string): Promise<void> {
  memoryStore.delete(id)
  if (redis) {
    await redis.del(`ratelimit:${id}`)
    await redis.del(`ratelimit:${id}:meta`)
  }
}