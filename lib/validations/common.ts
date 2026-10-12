// lib/validations/common.ts
import { z } from 'zod'

// ==========================================================================
// Validations existantes (inchangées)
// ==========================================================================

// Téléphone congolais (10 chiffres commençant par 0)
export const phoneSchema = z
  .string()
  .regex(/^0[0-9]{9}$/, 'Numéro de téléphone invalide (ex: 0812345678)')

// Code PIN à 6 chiffres
export const codePinSchema = z
  .string()
  .length(6, 'Le code doit contenir exactement 6 chiffres')
  .regex(/^\d{6}$/, 'Le code doit être composé uniquement de chiffres')

// Email
export const emailSchema = z
  .string()
  .min(1, "L'email est requis")
  .email('Format email invalide')

// Montant en CDF (entier positif)
export const montantCDFSchema = z
  .number()
  .int('Le montant doit être un entier')
  .positive('Le montant doit être positif')
  .min(100, 'Le montant minimum est de 100 FC')

// ID Supabase (UUID)
export const uuidSchema = z
  .string()
  .uuid('Identifiant invalide')

// Page et limit pour pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

// ==========================================================================
// NOUVEAUX SCHÉMAS – Recherche sémantique & IA
// ==========================================================================

/**
 * Paramètres d’une recherche sémantique / hybride.
 * Utilisé par /api/search/advanced et /api/ai/search.
 */
export const semanticSearchSchema = z.object({
  q: z.string().min(1, 'Le paramètre "q" est requis').max(500),
  mode: z.enum(['text', 'semantic', 'hybrid']).optional().default('text'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minScore: z.coerce.number().min(0).max(1).optional().default(0.2),
  textWeight: z.coerce.number().min(0).max(1).optional().default(0.3),
  semanticWeight: z.coerce.number().min(0).max(1).optional().default(0.7),
})

/**
 * Corps de requête du chatbot IA.
 */
export const aiChatSchema = z.object({
  message: z.string().min(1, 'Message requis').max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
  temperature: z.number().min(0).max(1).optional().default(0.7),
})

/**
 * Paramètres de requête pour les recommandations personnalisées.
 * (utilisé par /api/recommendations, /api/ai/recommendations)
 */
export const recommendationsQuerySchema = z.object({
  type: z
    .enum(['ai-personalized', 'trending', 'hybrid', 'history', 'similar-to-cart'])
    .optional()
    .default('trending'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
  fallback: z.coerce.boolean().optional().default(true),
})

/**
 * Corps pour une suggestion de prix IA.
 */
export const priceSuggestionSchema = z.object({
  productId: z.string().uuid('ID produit invalide'),
})

/**
 * Corps pour un score de fraude IA.
 */
export const fraudScoreSchema = z.object({
  orderId: z.string().uuid('ID de commande invalide'),
})

/**
 * Corps pour l’enregistrement d’une interaction utilisateur.
 */
export const trackInteractionSchema = z.object({
  productId: z.string().uuid(),
  interactionType: z.enum(['view', 'cart_add', 'favorite', 'purchase', 'search_click']),
  weight: z.number().positive().optional().default(1.0),
  metadata: z.record(z.unknown()).optional(),
})