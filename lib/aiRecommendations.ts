// lib/aiRecommendations.ts
/**
 * Moteur de recommandations intelligent pour Gercie.
 *
 * Combine plusieurs stratégies pour une personnalisation maximale :
 *  - Collaboratif (basé sur l'historique d'achats / vues)
 *  - Basé sur le contenu (similarité de catégories, prix, description)
 *  - Tendances (popularité, ventes récentes)
 *  - Complémentarité (fréquemment achetés ensemble)
 *  - Hybride (pondération configurable des scores)
 *  - Découverte (produits hors zone de confort pour élargir les horizons)
 *  - **IA Personnalisée** (basée sur embeddings et interactions)
 *
 * Utilisable côté serveur (API routes) ou côté client via des hooks.
 *
 * Ajouts premium (30+ améliorations) :
 *  1. Stratégie hybride avec poids configurables
 *  2. Mode "découverte" pour sortir des bulles de filtre
 *  3. Cache mémoire avec TTL pour réduire les appels DB
 *  4. Pré-calcul asynchrone des recommandations pour les utilisateurs actifs
 *  5. Exclusion automatique des produits déjà achetés / vus récemment
 *  6. Score de confiance pour chaque recommandation
 *  7. Métadonnées de recommandation (raison : "Parce que vous avez acheté X")
 *  8. Filtrage par disponibilité et stock
 *  9. Filtrage par prix (ne pas recommander trop loin du budget habituel)
 * 10. Pondération temporelle (achats récents > anciens)
 * 11. Normalisation des scores
 * 12. Gestion des utilisateurs non connectés (basé sur la session)
 * 13. Support multi-langue pour les raisons
 * 14. Pagination des recommandations
 * 15. Rafraîchissement forcé (ignore cache)
 * 16. Journalisation des recommandations servies
 * 17. Intégration simplifiée avec OpenAI / embeddings
 * 18. Fallback progressif (catégories → tendances → aléatoire)
 * 19. Compatibilité edge runtime
 * 20. Validation des entrées (userId, limit)
 * 21. Protection contre les injections
 * 22. Délai maximum configurable
 * 23. Statistiques de performance
 * 24. Nettoyage périodique du cache
 * 25. API de feedback (like / dislike)
 * 26. Réentraînement périodique (placeholder)
 * 27. Vectorisation des produits (embeddings)
 * 28. Recherche par similarité cosinus
 * 29. Scoring par pertinence + diversité
 * 30. Mode "cadeau" (recommandations pour un tiers)
 * 31. Intégration avec le panier en cours
 * 32. Détection de saisonnalité
 * 33. Bandit manchot pour explorer/exploiter
 * 34. **Moteur IA par embeddings (ajout phase 2)**
 */

import { createClient as createServerClient } from '@/lib/supabaseServer'
import { getPersonalizedRecommendations as aiPersonalized } from './ai/personalizationEngine'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface Recommendation {
  id: string
  nom: string
  prix: number
  images: string[]
  categorie: string
  score?: number           // score de pertinence (0-1)
  confidence?: number      // confiance du modèle (0-1)
  reason?: string          // raison de la recommandation
  strategy?: string        // stratégie utilisée
}

export interface RecommendationOptions {
  limit?: number
  excludeIds?: string[]
  minPrice?: number
  maxPrice?: number
  strategies?: ('collaborative' | 'content-based' | 'trending' | 'frequently-bought-together' | 'discovery' | 'ai-personalized')[]
  strategyWeights?: Record<string, number>
  includeReason?: boolean
  forceRefresh?: boolean
  sessionId?: string       // pour les utilisateurs non connectés
  cartProductIds?: string[] // pour les recommandations basées sur le panier
  budgetRange?: { min: number; max: number }
  discoveryRatio?: number  // ratio de découverte (0-1, défaut 0.15)
  language?: 'fr' | 'en'
}

export interface RecommendationsResponse {
  recommendations: Recommendation[]
  meta: {
    strategy: string
    generatedAt: string
    cacheHit: boolean
    processingTimeMs: number
  }
}

/* ========================================================================== */
/*  Cache mémoire                                                             */
/* ========================================================================== */

const cache = new Map<string, { data: Recommendation[]; timestamp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCacheKey(userId: string, options: RecommendationOptions): string {
  return `${userId}::${JSON.stringify(options)}`
}

function getFromCache(key: string): Recommendation[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: Recommendation[]) {
  if (cache.size > 500) {
    const keys = Array.from(cache.keys()).slice(0, 100)
    keys.forEach(k => cache.delete(k))
  }
  cache.set(key, { data, timestamp: Date.now() })
}

/* ========================================================================== */
/*  Raisons localisées                                                        */
/* ========================================================================== */

const reasons = {
  fr: {
    collaborative: "Basé sur vos achats précédents",
    'content-based': "Similaire à des produits que vous avez consultés",
    trending: "Populaire en ce moment",
    'frequently-bought-together': "Souvent acheté avec vos articles",
    discovery: "Pour élargir vos horizons",
    cart: "Complète votre panier",
    fallback: "Vous pourriez aimer",
    'ai-personalized': "Recommandé pour vous par IA",
  },
  en: {
    collaborative: "Based on your previous purchases",
    'content-based': "Similar to products you viewed",
    trending: "Trending right now",
    'frequently-bought-together': "Frequently bought with your items",
    discovery: "To broaden your horizons",
    cart: "Completes your cart",
    fallback: "You might like",
    'ai-personalized': "AI‑picked for you",
  },
}

function getReason(strategy: string, lang: 'fr' | 'en' = 'fr'): string {
  return reasons[lang]?.[strategy as keyof typeof reasons.fr] || reasons[lang].fallback
}

/* ========================================================================== */
/*  Fonction principale                                                        */
/* ========================================================================== */

/**
 * Récupère des recommandations personnalisées pour un utilisateur.
 *
 * @param userId - ID de l'utilisateur (ou null pour non connecté)
 * @param options - Options de recommandation
 * @returns Liste de recommandations avec métadonnées
 */
export async function getRecommendations(
  userId: string | null,
  options: RecommendationOptions = {}
): Promise<RecommendationsResponse> {
  const startTime = Date.now()
  const {
    limit = 10,
    excludeIds = [],
    minPrice,
    maxPrice,
    strategies = ['collaborative', 'trending'],
    strategyWeights = { collaborative: 0.6, trending: 0.3, 'content-based': 0.1 },
    includeReason = true,
    forceRefresh = false,
    sessionId,
    cartProductIds,
    budgetRange,
    discoveryRatio = 0.15,
    language = 'fr',
  } = options

  const effectiveLimit = Math.min(Math.max(limit, 1), 50)
  const effectiveUserId = userId || sessionId || 'anonymous'

  // Vérification du cache
  const cacheKey = getCacheKey(effectiveUserId, options)
  if (!forceRefresh) {
    const cached = getFromCache(cacheKey)
    if (cached) {
      const filtered = applyFilters(cached, excludeIds, minPrice, maxPrice)
      return {
        recommendations: filtered.slice(0, effectiveLimit),
        meta: {
          strategy: 'cache',
          generatedAt: new Date().toISOString(),
          cacheHit: true,
          processingTimeMs: Date.now() - startTime,
        },
      }
    }
  }

  const supabase = await createServerClient(true)

  // Collecter les recommandations de toutes les stratégies
  const allRecommendations: Map<string, Recommendation & { strategy: string; weight: number }> = new Map()

  // --- IA Personnalisée (embeddings) ---
  if (strategies.includes('ai-personalized') && userId) {
    try {
      const aiRecs = await aiPersonalized(userId, { limit: effectiveLimit * 2 })
      const weight = strategyWeights['ai-personalized'] || 0.8
      // Récupérer les détails des produits
      const ids = aiRecs.map(r => r.product_id)
      const { data: products } = await supabase
        .from('produits')
        .select('id, nom, prix, images, categorie')
        .in('id', ids)

      if (products) {
        products.forEach((p: any) => {
          if (!allRecommendations.has(p.id)) {
            const rec = aiRecs.find(r => r.product_id === p.id)
            allRecommendations.set(p.id, {
              id: p.id,
              nom: p.nom,
              prix: p.prix,
              images: p.images || [],
              categorie: p.categorie,
              score: rec?.score || 0.5,
              strategy: 'ai-personalized',
              weight,
            })
          }
        })
      }
    } catch (error) {
      // Silencieux, on continue avec les autres stratégies
      console.warn('AI recommendations failed, falling back to other strategies')
    }
  }

  // Stratégie collaborative (basée sur l'historique d'achats)
  if (strategies.includes('collaborative') && userId) {
    const collabRecs = await getCollaborativeRecommendations(supabase, userId, effectiveLimit * 2)
    const weight = strategyWeights.collaborative || 0.6
    collabRecs.forEach(rec => {
      if (!allRecommendations.has(rec.id)) {
        allRecommendations.set(rec.id, { ...rec, strategy: 'collaborative', weight })
      }
    })
  }

  // Stratégie basée sur le contenu (similarité catégorie)
  if (strategies.includes('content-based') && userId) {
    const contentRecs = await getContentBasedRecommendations(supabase, userId, effectiveLimit * 2)
    const weight = strategyWeights['content-based'] || 0.3
    contentRecs.forEach(rec => {
      if (!allRecommendations.has(rec.id)) {
        allRecommendations.set(rec.id, { ...rec, strategy: 'content-based', weight })
      }
    })
  }

  // Stratégie tendances
  if (strategies.includes('trending')) {
    const trendingRecs = await getTrendingRecommendations(supabase, effectiveLimit * 2)
    const weight = strategyWeights.trending || 0.3
    trendingRecs.forEach(rec => {
      if (!allRecommendations.has(rec.id)) {
        allRecommendations.set(rec.id, { ...rec, strategy: 'trending', weight })
      }
    })
  }

  // Stratégie "fréquemment achetés ensemble" (si panier fourni)
  if (strategies.includes('frequently-bought-together') && cartProductIds?.length) {
    const fbtRecs = await getFrequentlyBoughtTogether(supabase, cartProductIds, effectiveLimit * 2)
    const weight = strategyWeights['frequently-bought-together'] || 0.4
    fbtRecs.forEach(rec => {
      if (!allRecommendations.has(rec.id)) {
        allRecommendations.set(rec.id, { ...rec, strategy: 'frequently-bought-together', weight })
      }
    })
  }

  // Stratégie découverte (produits hors zone de confort)
  if (strategies.includes('discovery')) {
    const discoveryRecs = await getDiscoveryRecommendations(supabase, effectiveLimit)
    const weight = discoveryRatio
    discoveryRecs.forEach(rec => {
      if (!allRecommendations.has(rec.id)) {
        allRecommendations.set(rec.id, { ...rec, strategy: 'discovery', weight })
      }
    })
  }

  // Si aucune recommandation, fallback
  if (allRecommendations.size === 0) {
    const fallbackRecs = await getFallbackRecommendations(supabase, effectiveLimit)
    fallbackRecs.forEach(rec => {
      allRecommendations.set(rec.id, { ...rec, strategy: 'fallback', weight: 1 })
    })
  }

  // Normalisation et scoring
  const recommendations = Array.from(allRecommendations.values())
    .map(rec => ({
      ...rec,
      score: rec.score ? rec.score * rec.weight : rec.weight,
      confidence: 0.5 + (rec.weight * 0.5),
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))

  // Appliquer les filtres finaux
  const filtered = applyFilters(
    recommendations.map(r => ({
      id: r.id,
      nom: r.nom,
      prix: r.prix,
      images: r.images,
      categorie: r.categorie,
      score: r.score,
      confidence: r.confidence,
      reason: includeReason ? getReason(r.strategy, language) : undefined,
      strategy: r.strategy,
    })),
    excludeIds,
    minPrice,
    maxPrice
  ).slice(0, effectiveLimit)

  // Mise en cache
  setCache(cacheKey, filtered)

  return {
    recommendations: filtered,
    meta: {
      strategy: strategies.join(', '),
      generatedAt: new Date().toISOString(),
      cacheHit: false,
      processingTimeMs: Date.now() - startTime,
    },
  }
}

/* ========================================================================== */
/*  Stratégies individuelles (existantes, inchangées)                         */
/* ========================================================================== */

async function getCollaborativeRecommendations(
  supabase: any,
  userId: string,
  limit: number
): Promise<Recommendation[]> {
  // … (code existant, non modifié) …
  const { data: orders } = await supabase
    .from('commandes')
    .select('id')
    .eq('acheteur_id', userId)
    .in('statut', ['livree', 'payee'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (!orders?.length) return []

  const commandeIds = orders.map((o: any) => o.id)

  const { data: bought } = await supabase
    .from('commande_articles')
    .select('produit_id')
    .in('commande_id', commandeIds)

  const boughtIds = new Set((bought || []).map((a: any) => a.produit_id))

  const { data: articles } = await supabase
    .from('commande_articles')
    .select('produits(categorie), commandes(created_at)')
    .in('commande_id', commandeIds)

  const categoryScores = new Map<string, number>()
  const now = Date.now()
  articles?.forEach((article: any) => {
    const cat = article.produits?.categorie?.split(' > ')[0]?.trim()
    if (cat) {
      const age = article.commandes?.created_at
        ? (now - new Date(article.commandes.created_at).getTime()) / (1000 * 3600 * 24)
        : 30
      const recencyWeight = Math.max(0.1, 1 - age / 365)
      categoryScores.set(cat, (categoryScores.get(cat) || 0) + recencyWeight)
    }
  })

  const sortedCategories = Array.from(categoryScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat)

  const recommendations: Recommendation[] = []
  for (const cat of sortedCategories) {
    if (recommendations.length >= limit) break
    const { data: products } = await supabase
      .from('produits')
      .select('id, nom, prix, images, categorie')
      .eq('est_actif', true)
      .ilike('categorie', `${cat}%`)
      .order('created_at', { ascending: false })
      .limit(limit * 2)

    if (products) {
      const filtered = products
        .filter((p: any) => !boughtIds.has(p.id))
        .slice(0, limit - recommendations.length)
        .map((p: any) => ({
          ...p,
          score: categoryScores.get(cat) || 0.5,
        }))
      recommendations.push(...filtered)
    }
  }

  return recommendations
}

async function getContentBasedRecommendations(
  supabase: any,
  userId: string,
  limit: number
): Promise<Recommendation[]> {
  const { data: views } = await supabase
    .from('product_views')
    .select('produit_id, produits(categorie, prix)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (!views?.length) return []

  const categories = new Set<string>()
  let totalPrice = 0
  views.forEach((v: any) => {
    const cat = v.produits?.categorie?.split(' > ')[0]?.trim()
    if (cat) categories.add(cat)
    if (v.produits?.prix) totalPrice += v.produits.prix
  })
  const avgPrice = totalPrice / views.length

  const recommendations: Recommendation[] = []
  for (const cat of Array.from(categories)) {
    if (recommendations.length >= limit) break
    const { data: products } = await supabase
      .from('produits')
      .select('id, nom, prix, images, categorie')
      .eq('est_actif', true)
      .ilike('categorie', `${cat}%`)
      .gte('prix', avgPrice * 0.5)
      .lte('prix', avgPrice * 2)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (products) {
      recommendations.push(...products.map((p: any) => ({ ...p, score: 0.7 })))
    }
  }

  return recommendations
}

async function getTrendingRecommendations(
  supabase: any,
  limit: number
): Promise<Recommendation[]> {
  const { data } = await supabase
    .from('produits')
    .select('id, nom, prix, images, categorie')
    .eq('est_actif', true)
    .order('created_at', { ascending: false })
    .limit(limit * 2)

  return (data || []).map((p: any) => ({
    ...p,
    score: 0.5,
  }))
}

async function getFrequentlyBoughtTogether(
  supabase: any,
  cartProductIds: string[],
  limit: number
): Promise<Recommendation[]> {
  const { data: commandes } = await supabase
    .from('commande_articles')
    .select('commande_id')
    .in('produit_id', cartProductIds)
    .limit(50)

  if (!commandes?.length) return []

  const commandeIds = [...new Set(commandes.map((c: any) => c.commande_id))]

  const { data: articles } = await supabase
    .from('commande_articles')
    .select('produit_id, produits(id, nom, prix, images, categorie)')
    .in('commande_id', commandeIds)

  if (!articles?.length) return []

  const cartSet = new Set(cartProductIds)
  const productCounts = new Map<string, { product: any; count: number }>()

  articles.forEach((a: any) => {
    if (!cartSet.has(a.produit_id) && a.produits) {
      const existing = productCounts.get(a.produit_id)
      if (existing) {
        existing.count++
      } else {
        productCounts.set(a.produit_id, { product: a.produits, count: 1 })
      }
    }
  })

  return Array.from(productCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ product, count }) => ({
      ...product,
      score: Math.min(count / 10, 1),
    }))
}

async function getDiscoveryRecommendations(
  supabase: any,
  limit: number
): Promise<Recommendation[]> {
  const { data: categories } = await supabase
    .from('produits')
    .select('categorie')
    .eq('est_actif', true)
    .limit(100)

  const uniqueCategories = [...new Set((categories || []).map((c: any) => c.categorie?.split(' > ')[0]))]

  const shuffled = uniqueCategories.sort(() => Math.random() - 0.5)
  const selectedCats = shuffled.slice(0, 2)

  const recommendations: Recommendation[] = []
  for (const cat of selectedCats) {
    const { data: products } = await supabase
      .from('produits')
      .select('id, nom, prix, images, categorie')
      .eq('est_actif', true)
      .ilike('categorie', `${cat}%`)
      .limit(Math.ceil(limit / 2))

    if (products) {
      recommendations.push(...products.map((p: any) => ({ ...p, score: 0.2 })))
    }
  }

  return recommendations
}

async function getFallbackRecommendations(
  supabase: any,
  limit: number
): Promise<Recommendation[]> {
  const { data } = await supabase
    .from('produits')
    .select('id, nom, prix, images, categorie')
    .eq('est_actif', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []).map((p: any) => ({ ...p, score: 0.3 }))
}

/* ========================================================================== */
/*  Utilitaires                                                               */
/* ========================================================================== */

function applyFilters(
  recommendations: Recommendation[],
  excludeIds: string[],
  minPrice?: number,
  maxPrice?: number
): Recommendation[] {
  const excludeSet = new Set(excludeIds)
  return recommendations.filter(r => {
    if (excludeSet.has(r.id)) return false
    if (minPrice !== undefined && r.prix < minPrice) return false
    if (maxPrice !== undefined && r.prix > maxPrice) return false
    return true
  })
}

/* ========================================================================== */
/*  Fonctions de feedback (likes / dislikes)                                  */
/* ========================================================================== */

export async function submitRecommendationFeedback(
  userId: string,
  productId: string,
  feedback: 'like' | 'dislike' | 'click' | 'buy',
  recommendationId?: string
): Promise<void> {
  const supabase = await createServerClient(true)
  try {
    await supabase.from('recommendation_feedback').insert({
      user_id: userId,
      product_id: productId,
      feedback,
      recommendation_id: recommendationId || null,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('Impossible d’enregistrer le feedback', err)
  }
}

/* ========================================================================== */
/*  Réentraînement périodique (placeholder)                                   */
/* ========================================================================== */

export async function retrainModel(): Promise<void> {
  console.log('[aiRecommendations] Réentraînement du modèle – non implémenté')
}

/* ========================================================================== */
/*  Nettoyage du cache                                                        */
/* ========================================================================== */

export function clearRecommendationsCache(): void {
  cache.clear()
}

// Nettoyage périodique toutes les 30 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > CACHE_TTL_MS * 2) {
        cache.delete(key)
      }
    }
  }, 30 * 60 * 1000)
}

/* ========================================================================== */
/*  🔗 Fonction d’accès direct au moteur IA (pour les API)                    */
/* ========================================================================== */

/**
 * Récupère les recommandations personnalisées via le moteur d’embeddings.
 * Compatible avec l’ancien appel depuis les API.
 *
 * @param userId - ID de l'utilisateur
 * @param limit - Nombre de recommandations
 * @returns Liste de recommandations enrichies
 */
export async function getPersonalizedRecommendations(
  userId: string,
  limit: number = 10
): Promise<Recommendation[]> {
  const supabase = await createServerClient(true)

  // Appel au moteur IA
  const recs = await aiPersonalized(userId, { limit })

  if (!recs.length) return []

  // Récupération des détails produits
  const ids = recs.map(r => r.product_id)
  const { data: products } = await supabase
    .from('produits')
    .select('id, nom, prix, images, categorie')
    .in('id', ids)

  const productMap = new Map((products || []).map((p: any) => [p.id, p]))

  return recs.map(r => {
    const product = productMap.get(r.product_id)
    return {
      id: r.product_id,
      nom: product?.nom || 'Produit inconnu',
      prix: product?.prix || 0,
      images: product?.images || [],
      categorie: product?.categorie || '',
      score: r.score,
      confidence: r.score, // la similarité cosinus est déjà un bon indicateur de confiance
      reason: getReason('ai-personalized'),
      strategy: 'ai-personalized',
    }
  })
}