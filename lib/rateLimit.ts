// lib/rateLimit.ts
// ---------------------------------------------------------------------------
// Rate Limiting – Protection ultra‑premium des API sensibles
// Compatible Next.js App Router (API routes), Edge, et Serverless.
// Stockage : Map (in‑memory) + Redis via Upstash (optionnel).
// ---------------------------------------------------------------------------

import { z } from 'zod'
import logger from './logger'

/* ========================================================================== */
/*  Validation du schéma de configuration                                     */
/* ========================================================================== */
const rateLimitConfigSchema = z.object({
  id: z.string().min(1),
  maxRequests: z.number().int().positive(),
  windowSeconds: z.number().int().positive().optional().default(60),
  banDurationSeconds: z.number().int().positive().optional().default(300),
  useRedis: z.boolean().optional().default(false),         // bascule vers le stockage Redis
  whitelist: z.array(z.string()).optional(),               // IDs/IPs à ne jamais bloquer
  burstAllowance: z.number().int().nonnegative().optional().default(0), // requêtes supplémentaires autorisées en burst
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
// Store mémoire (Map) – utilisé par défaut ou en fallback si Redis indisponible
// ---------------------------------------------------------------------------
const memoryStore = new Map<string, WindowEntry>()

// Nettoyage périodique pour éviter les fuites mémoire
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
// Interface du store (mémoire ou Redis)
// ---------------------------------------------------------------------------
interface RateLimitStore {
  get(key: string): Promise<WindowEntry | null>
  set(key: string, entry: WindowEntry): Promise<void>
  delete(key: string): Promise<void>
}

const memoryAdapter: RateLimitStore = {
  async get(key) { return memoryStore.get(key) ?? null },
  async set(key, entry) { memoryStore.set(key, entry) },
  async delete(key) { memoryStore.delete(key) },
}

// Redis adapter (si les variables d'environnement Upstash sont présentes)
let redisAdapter: RateLimitStore | null = null

async function getRedisAdapter(): Promise<RateLimitStore | null> {
  if (redisAdapter) return redisAdapter

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  // Utilisation simple de l'API REST Upstash (fetch)
  const fetchRedis = async (command: string) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([command]),
    })
    if (!res.ok) throw new Error(`Redis error: ${res.statusText}`)
    const data = await res.json()
    return data.result
  }

  redisAdapter = {
    async get(key) {
      const result = await fetchRedis(`GET ${key}`)
      return result ? JSON.parse(result) : null
    },
    async set(key, entry) {
      await fetchRedis(`SET ${key} ${JSON.stringify(entry)} PX ${entry.resetTime - Date.now() + 60000}`)
    },
    async delete(key) {
      await fetchRedis(`DEL ${key}`)
    },
  }
  return redisAdapter
}

// ---------------------------------------------------------------------------
// Fonction de rate limiting asynchrone (compatible API routes)
// ---------------------------------------------------------------------------
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const parsed = rateLimitConfigSchema.safeParse(config)
  if (!parsed.success) {
    throw new Error(`Configuration de rate limit invalide: ${parsed.error.message}`)
  }
  const { id, maxRequests, windowSeconds, banDurationSeconds, useRedis, whitelist, burstAllowance } = parsed.data
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

  // Choisir le store
  let store: RateLimitStore = memoryAdapter
  if (useRedis) {
    const redis = await getRedisAdapter()
    if (redis) store = redis
  }

  const key = `ratelimit:${id}`
  let entry = await store.get(key)

  // Pas d'entrée → première requête de la fenêtre
  if (!entry || (now >= entry.resetTime && !entry.banUntil)) {
    entry = { count: 1, resetTime: now + windowMs, banUntil: null, infractions: 0 }
    await store.set(key, entry)
    return buildResult(maxRequests + burstAllowance, maxRequests + burstAllowance - 1, entry.resetTime)
  }

  // Vérifier un bannissement actif
  if (entry.banUntil && now < entry.banUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.banUntil,
      headers: buildHeaders(maxRequests, 0, entry.banUntil),
    }
  }

  // Lever le bannissement s'il est terminé
  if (entry.banUntil && now >= entry.banUntil) {
    entry.banUntil = null
  }

  // Nouvelle fenêtre si l'ancienne est expirée
  if (now >= entry.resetTime) {
    entry.count = 1
    entry.resetTime = now + windowMs
    entry.infractions = 0
    await store.set(key, entry)
    return buildResult(maxRequests + burstAllowance, maxRequests + burstAllowance - 1, entry.resetTime)
  }

  // Incrémenter
  entry.count++
  const effectiveLimit = maxRequests + burstAllowance

  if (entry.count > effectiveLimit) {
    // Calculer une durée de ban progressive (exponentielle en fonction des infractions)
    const progressiveMultiplier = Math.min(Math.pow(2, entry.infractions), 8) // max x8
    const banDuration = banMs * progressiveMultiplier
    entry.banUntil = now + banDuration
    entry.infractions++
    await store.set(key, entry)
    logger.warn('Rate limit dépassé', { id, count: entry.count, limit: effectiveLimit })
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.banUntil,
      headers: buildHeaders(maxRequests, 0, entry.banUntil),
    }
  }

  await store.set(key, entry)
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
  const { id, maxRequests, windowSeconds, banDurationSeconds, whitelist, burstAllowance } = parsed.data
  const windowMs = windowSeconds * 1000
  const banMs = banDurationSeconds * 1000
  const now = Date.now()

  if (whitelist?.includes(id)) {
    return {
      allowed: true,
      remaining: maxRequests,
      resetTime: now + windowMs,
      headers: buildHeaders(maxRequests, maxRequests, now + windowMs),
    }
  }

  let entry = memoryStore.get(id)

  if (!entry || (now >= entry.resetTime && !entry.banUntil)) {
    entry = { count: 1, resetTime: now + windowMs, banUntil: null, infractions: 0 }
    memoryStore.set(id, entry)
    return buildResult(maxRequests + burstAllowance, maxRequests + burstAllowance - 1, entry.resetTime)
  }

  if (entry.banUntil && now < entry.banUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.banUntil,
      headers: buildHeaders(maxRequests, 0, entry.banUntil),
    }
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
    logger.warn('Rate limit dépassé', { id, count: entry.count, limit: effectiveLimit })
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.banUntil,
      headers: buildHeaders(maxRequests, 0, entry.banUntil),
    }
  }

  memoryStore.set(id, entry)
  return buildResult(maxRequests, effectiveLimit - entry.count, entry.resetTime)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildResult(max: number, remaining: number, resetTime: number): RateLimitResult {
  return {
    allowed: true,
    remaining,
    resetTime,
    headers: buildHeaders(max, remaining, resetTime),
  }
}

function buildHeaders(max: number, remaining: number, resetTime: number) {
  return {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
  }
}

// Appliquer les headers à une Response existante
export function applyRateLimitHeaders(response: Response, headers: Record<string, string>): Response {
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

// ---------------------------------------------------------------------------
// Helper pratique pour les API routes : throw si bloqué
// ---------------------------------------------------------------------------
export async function requireRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const result = await checkRateLimit(config)
  if (!result.allowed) {
    const response = new Response(JSON.stringify({ error: 'Trop de requêtes. Veuillez réessayer plus tard.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...result.headers },
    })
    // On throw la réponse pour que la route l'intercepte (ou on la retourne directement selon votre gestion)
    throw response
  }
  return result
}

// ---------------------------------------------------------------------------
// Réinitialisation manuelle (pour tests ou admin)
// ---------------------------------------------------------------------------
export async function resetRateLimit(id: string): Promise<void> {
  memoryStore.delete(id)
  const redis = await getRedisAdapter()
  if (redis) {
    await redis.delete(`ratelimit:${id}`)
  }
}