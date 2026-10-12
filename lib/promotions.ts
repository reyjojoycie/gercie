// lib/promotions.ts
import { createClient } from '@/lib/supabaseServer'
import type { SupabaseClient } from '@supabase/supabase-js'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface PromotionActive {
  produit_id: string
  prix_promo: number
  date_fin: string
  type_promo?: string
  description?: string
  valeur_pourcentage?: number
}

export interface PromotionEnrichie extends PromotionActive {
  produit?: {
    id: string
    nom: string
    prix: number
    images?: string[]
    slug?: string
    stock?: number
  }
  discount_percent?: number
  economie?: number
}

export interface DesactivationResult {
  success: boolean
  count: number
  errors: string[]
  processedAt: string
}

export interface GetPromotionsOptions {
  /** Limite de résultats (défaut: 100) */
  limit?: number
  /** Inclure les détails des produits */
  includeProducts?: boolean
  /** Filtrer par produit spécifique */
  produitId?: string
  /** Timeout en ms (défaut: 10000) */
  timeout?: number
  /** Utiliser le cache (défaut: true) */
  useCache?: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_LIMIT = 100
const DEFAULT_TIMEOUT = 10000 // 10 secondes
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const MAX_RETRIES = 2
const RETRY_DELAY = 1000 // 1 seconde
const BATCH_SIZE = 100 // Taille des lots pour désactivation

/* ═══════════════════════════════════════════════════════════════ */
/*  CACHE HELPERS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

interface CacheEntry<T> {
  data: T
  timestamp: number
}

class PromotionCache {
  private cache = new Map<string, CacheEntry<any>>()

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Vérifier expiration
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  set<T>(key: string, data: T): void {
    // Limiter la taille du cache
    if (this.cache.size >= 100) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }
}

const promotionCache = new PromotionCache()

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION HELPERS                                             */
/* ═══════════════════════════════════════════════════════════════ */

function isValidPromotion(promo: any): promo is PromotionActive {
  return (
    promo &&
    typeof promo.produit_id === 'string' &&
    promo.produit_id.trim().length > 0 &&
    typeof promo.prix_promo === 'number' &&
    promo.prix_promo > 0 &&
    typeof promo.date_fin === 'string' &&
    !isNaN(Date.parse(promo.date_fin))
  )
}

function validatePromotions(data: any[]): PromotionActive[] {
  if (!Array.isArray(data)) {
    console.warn('Données promotions invalides: pas un tableau')
    return []
  }

  return data.filter(isValidPromotion)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FONCTION PRINCIPALE : getActivePromotions                      */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Récupère les promotions actives (date_debut <= now <= date_fin et actif=true).
 * 
 * Optimisé pour :
 * - Performance (cache, timeout, retry)
 * - Stabilité (validation, error handling)
 * - Kinshasa (requêtes légères, timeout court)
 */
export async function getActivePromotions(
  supabase: SupabaseClient,
  options: GetPromotionsOptions = {}
): Promise<PromotionActive[]> {
  const {
    limit = DEFAULT_LIMIT,
    includeProducts = false,
    produitId,
    timeout = DEFAULT_TIMEOUT,
    useCache = true,
  } = options

  // Clé de cache unique
  const cacheKey = `promotions:${produitId || 'all'}:${includeProducts ? 'with-products' : 'basic'}:${limit}`

  // Vérifier le cache
  if (useCache) {
    const cached = promotionCache.get<PromotionActive[]>(cacheKey)
    if (cached) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🎁 Promotions from cache:', cached.length)
      }
      return cached
    }
  }

  const now = new Date().toISOString()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Construire la requête
      let query = supabase
        .from('promotions')
        .select(includeProducts 
          ? 'produit_id, prix_promo, date_fin, type_promo, description, valeur_pourcentage, produits!inner(id, nom, prix, images, slug, stock)'
          : 'produit_id, prix_promo, date_fin, type_promo, description, valeur_pourcentage'
        )
        .eq('actif', true)
        .lte('date_debut', now)
        .gte('date_fin', now)
        .limit(limit)
        .abortSignal(controller.signal)

      // Filtre par produit si spécifié
      if (produitId) {
        query = query.eq('produit_id', produitId)
      }

      const { data, error } = await query

      clearTimeout(timeoutId)

      if (error) {
        throw new Error(`Erreur Supabase: ${error.message}`)
      }

      // Valider les données
      const validated = validatePromotions(data || [])

      // Mettre en cache
      if (useCache) {
        promotionCache.set(cacheKey, validated)
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('🎁 Promotions loaded:', {
          count: validated.length,
          fromCache: false,
          attempt: attempt + 1,
        })
      }

      return validated
    } catch (err: any) {
      clearTimeout(timeoutId)
      lastError = err

      // Si c'est un abort, ne pas retry
      if (err.name === 'AbortError') {
        console.warn('⏱️ Timeout fetch promotions')
        break
      }

      // Logging
      if (attempt < MAX_RETRIES) {
        console.warn(`⚠️ Tentative ${attempt + 1}/${MAX_RETRIES + 1} échouée:`, err.message)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt)))
      }
    }
  }

  // Essayer d'utiliser le cache même expiré
  const cached = promotionCache.get<PromotionActive[]>(cacheKey)
  if (cached) {
    console.warn('🔄 Utilisation du cache expiré pour promotions')
    return cached
  }

  // Retourner tableau vide en cas d'échec total
  console.error('❌ Échec complet fetch promotions:', lastError?.message)
  return []
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FONCTION : getPromotionForProduct                              */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Récupère la promotion active pour un produit spécifique.
 * Retourne null si aucune promotion active.
 */
export async function getPromotionForProduct(
  supabase: SupabaseClient,
  produitId: string,
  options: Omit<GetPromotionsOptions, 'produitId'> = {}
): Promise<PromotionActive | null> {
  const promotions = await getActivePromotions(supabase, {
    ...options,
    produitId,
    limit: 1,
  })

  return promotions[0] || null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FONCTION : calculateDiscount                                   */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Calcule la réduction et l'économie pour une promotion.
 */
export function calculateDiscount(
  prixOriginal: number,
  promotion: PromotionActive
): { discount_percent: number; economie: number; prix_final: number } {
  const prix_final = promotion.prix_promo
  const economie = Math.max(0, prixOriginal - prix_final)
  const discount_percent = prixOriginal > 0 
    ? Math.round((economie / prixOriginal) * 100)
    : 0

  return {
    discount_percent,
    economie,
    prix_final,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FONCTION : desactiverPromotionsExpirees                        */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Désactive les promotions expirées (date_fin < now et actif=true).
 * 
 * Optimisé pour :
 * - Batch processing (évite timeout sur gros volumes)
 * - Logging structuré
 * - Retour d'information détaillé
 */
export async function desactiverPromotionsExpirees(
  supabase: SupabaseClient
): Promise<DesactivationResult> {
  const now = new Date().toISOString()
  const errors: string[] = []
  let totalCount = 0

  try {
    // Récupérer les IDs des promotions expirées par lots
    let hasMore = true
    let offset = 0

    while (hasMore) {
      const { data: expiredPromos, error: fetchError } = await supabase
        .from('promotions')
        .select('id')
        .eq('actif', true)
        .lt('date_fin', now)
        .range(offset, offset + BATCH_SIZE - 1)

      if (fetchError) {
        errors.push(`Erreur fetch lot ${offset}: ${fetchError.message}`)
        break
      }

      if (!expiredPromos || expiredPromos.length === 0) {
        hasMore = false
        break
      }

      // Désactiver ce lot
      const ids = expiredPromos.map(p => p.id)
      const { error: updateError } = await supabase
        .from('promotions')
        .update({ actif: false })
        .in('id', ids)

      if (updateError) {
        errors.push(`Erreur update lot ${offset}: ${updateError.message}`)
      } else {
        totalCount += ids.length
      }

      offset += BATCH_SIZE

      // Si on a récupéré moins que BATCH_SIZE, c'est la fin
      if (expiredPromos.length < BATCH_SIZE) {
        hasMore = false
      }
    }

    // Invalider le cache
    promotionCache.invalidate('promotions')

    const result: DesactivationResult = {
      success: errors.length === 0,
      count: totalCount,
      errors,
      processedAt: now,
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('🧹 Désactivation promotions expirées:', result)
    }

    return result
  } catch (err: any) {
    console.error('❌ Erreur critique désactivation promotions:', err)
    return {
      success: false,
      count: totalCount,
      errors: [...errors, err.message],
      processedAt: now,
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  FONCTION : checkPromotionValidity                             */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Vérifie si une promotion est toujours valide.
 * Utile pour valider avant application au panier.
 */
export async function checkPromotionValidity(
  supabase: SupabaseClient,
  produitId: string,
  prixPromoAttendu: number
): Promise<{ valid: boolean; promotion?: PromotionActive; reason?: string }> {
  const promotion = await getPromotionForProduct(supabase, produitId, {
    useCache: false, // Toujours vérifier en temps réel
  })

  if (!promotion) {
    return { valid: false, reason: 'Aucune promotion active pour ce produit' }
  }

  if (Math.abs(promotion.prix_promo - prixPromoAttendu) > 0.01) {
    return { 
      valid: false, 
      promotion,
      reason: `Prix promo modifié: ${promotion.prix_promo} au lieu de ${prixPromoAttendu}` 
    }
  }

  // Vérifier expiration
  if (new Date(promotion.date_fin) < new Date()) {
    return { valid: false, promotion, reason: 'Promotion expirée' }
  }

  return { valid: true, promotion }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UTILITAIRES SUPPLÉMENTAIRES                                    */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Invalide le cache des promotions.
 * À appeler après modification admin.
 */
export function invalidatePromotionsCache(): void {
  promotionCache.invalidate()
  if (process.env.NODE_ENV === 'development') {
    console.log('🗑️ Cache promotions invalidé')
  }
}

/**
 * Compte le nombre de promotions actives.
 */
export async function countActivePromotions(
  supabase: SupabaseClient
): Promise<number> {
  const now = new Date().toISOString()
  
  const { count, error } = await supabase
    .from('promotions')
    .select('*', { count: 'exact', head: true })
    .eq('actif', true)
    .lte('date_debut', now)
    .gte('date_fin', now)

  if (error) {
    console.error('Erreur count promotions:', error.message)
    return 0
  }

  return count || 0
}

/**
 * Récupère les promotions expirant bientôt (dans les prochaines 24h).
 */
export async function getExpiringSoonPromotions(
  supabase: SupabaseClient,
  hoursAhead = 24
): Promise<PromotionActive[]> {
  const now = new Date()
  const future = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('promotions')
    .select('produit_id, prix_promo, date_fin, type_promo, description')
    .eq('actif', true)
    .lte('date_debut', now.toISOString())
    .gte('date_fin', now.toISOString())
    .lte('date_fin', future.toISOString())
    .order('date_fin', { ascending: true })

  if (error) {
    console.error('Erreur fetch promotions expirant bientôt:', error.message)
    return []
  }

  return validatePromotions(data || [])
}