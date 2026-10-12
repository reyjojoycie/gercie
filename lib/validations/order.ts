// lib/validations/order.ts
import { z } from 'zod'
import { uuidSchema, paginationSchema } from './common'

export const orderItemSchema = z.object({
  produit_id: uuidSchema,
  quantite: z.number().int().positive('La quantité doit être positive'),
  prix_unitaire: z.number().positive('Le prix unitaire doit être positif'),
  specifications: z.string().optional().nullable(),
  variante: z.record(z.string(), z.any()).optional().nullable(),
})

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'Au moins un article est requis'),
  total_articles: z.number().positive(),
  frais_livraison: z.number().min(0),
  type_livraison: z.enum(['domicile', 'point_retrait']),
  adresse_livraison: z.string().optional(),
  commune_livraison_id: z.number().int().optional().nullable(),
  point_retrait_id: z.number().int().optional().nullable(),
})

export const cancelOrderSchema = z.object({
  commande_id: uuidSchema,
})

export const orderStatusUpdateSchema = z.object({
  commande_id: uuidSchema,
  statut: z.enum([
    'en_attente',
    'payee',
    'collecte',
    'en_livraison',
    'livree',
    'annulee',
  ]),
  commentaire: z.string().optional(),
})

export const orderFiltersSchema = paginationSchema.extend({
  statut: z.enum([
    'en_attente',
    'payee',
    'collecte',
    'en_livraison',
    'livree',
    'annulee',
  ]).optional(),
  search: z.string().optional(),
})
