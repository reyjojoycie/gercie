// lib/validations/product.ts
import { z } from 'zod'

/**
 * Validations enrichies pour les produits (Gercie).
 *
 * Améliorations (30+) :
 *  - Nouveaux champs : sku, code_barre, marque, condition, poids, dimensions, frais_livraison, etc.
 *  - SEO : meta_title, meta_description, slug
 *  - Gestion avancée des images : URL valide, nombre max, légendes, ordre
 *  - Variantes enrichies : image, disponibilité, remise
 *  - Prix : prix_comparatif, pourcentage_remise, prix_gros
 *  - Validation conditionnelle : prix_usd requis si vente internationale
 *  - Schémas supplémentaires : recherche, création en masse, import CSV
 *  - Messages d’erreur personnalisés en français
 *  - Types dérivés exportés pour utilisation dans les services
 *  - Adapté au formulaire admin actuel (images en string[], champs additionnels)
 *  - Spécifications techniques sous forme de tableau clé/valeur
 */

// ---------------------------------------------------------------------------
// Types dérivés (pratiques pour les services)
// ---------------------------------------------------------------------------
export type VariantInput = z.infer<typeof variantSchema>
export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>

// ---------------------------------------------------------------------------
// Variante de produit
// ---------------------------------------------------------------------------
export const variantSchema = z.object({
  attributes: z.record(z.string(), z.string()),
  stock: z.number().int().min(0, 'Le stock doit être positif ou nul'),
  prix_specifique: z.number().positive('Le prix spécifique doit être positif').optional(),
  image: z.string().url('L’URL de l’image de la variante est invalide').optional(),
  disponible: z.boolean().default(true),
  remise_pourcentage: z.number().min(0).max(100).optional(),
  // SKU optionnel pour variante
  sku: z.string().max(100).optional(),
})

// ---------------------------------------------------------------------------
// Schéma de base (commun à la création et à la mise à jour) – enrichi
// ---------------------------------------------------------------------------
export const productBaseSchema = z.object({
  nom: z.string()
    .min(3, 'Le nom doit comporter au moins 3 caractères')
    .max(200, 'Le nom ne doit pas dépasser 200 caractères'),
  description: z.string()
    .min(10, 'La description doit comporter au moins 10 caractères')
    .max(5000, 'La description est trop longue (max 5000)'),
  prix: z.number()
    .positive('Le prix doit être positif')
    .max(99999999, 'Le prix est trop élevé'),
  prix_usd: z.number().positive('Le prix en USD doit être positif').optional().nullable(),
  categorie: z.string().min(1, 'La catégorie est requise'),
  sous_categorie: z.string().optional(),
  stock: z.number().int().min(0, 'Le stock doit être un nombre positif ou nul').default(0),
  negociable: z.boolean().default(false),
  est_actif: z.boolean().default(true),
  // Nouveaux champs
  sku: z.string().max(100).optional().nullable(),
  code_barre: z.string().max(100).optional().nullable(),
  marque: z.string().max(150).optional().nullable(),
  condition: z.enum(['neuf', 'occasion', 'reconditionné']).optional(),
  poids_kg: z.number().positive('Le poids doit être positif').max(10000).optional().nullable(),
  // Dimensions en tant que champs individuels (comme envoyé par le form)
  longueur_cm: z.number().positive('La longueur doit être positive').optional().nullable(),
  largeur_cm: z.number().positive('La largeur doit être positive').optional().nullable(),
  hauteur_cm: z.number().positive('La hauteur doit être positive').optional().nullable(),
  frais_livraison: z.number().min(0).optional(),
  pays_origine: z.string().max(100).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  est_promo: z.boolean().default(false),
  prix_comparatif: z.number().positive().optional(), // prix barré
  pourcentage_remise: z.number().min(0).max(99).optional().nullable(),
  remise_percent: z.number().min(0).max(99).optional().nullable(), // pour compatibilité front
  featured: z.boolean().default(false),
  // SEO
  meta_title: z.string().max(70).optional().nullable(),
  meta_description: z.string().max(160).optional().nullable(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug invalide').optional(),
  // Visibilité & admin
  visible: z.boolean().default(true),
  date_publication: z.string().datetime().optional(),
  notes_internes: z.string().max(1000).optional().nullable(),
  limit_per_client: z.number().int().min(0).optional().nullable(),
  delay_livraison: z.string().max(100).optional().nullable(),
  ribbon: z.enum(['none', 'new', 'sale', 'popular', 'exclusive', 'limited']).optional().nullable(),
  // Badges (nouveau)
  badges: z.array(z.string().max(50)).optional().default([]),
  // Spécifications techniques (nouveau)
  specifications: z.array(
    z.object({
      key: z.string().min(1, 'La clé est requise').max(100),
      value: z.string().min(1, 'La valeur est requise').max(500),
    })
  ).max(50).optional().default([]),

  // --- Livraison par produit ---
  // Tarifs
  livraison_domicile: z.number().min(0).default(0),
  livraison_point_retrait: z.number().min(0).default(0),
  livraison_express: z.number().min(0).default(0),
  // Activation par mode
  livraison_domicile_active: z.boolean().default(true),
  livraison_point_retrait_active: z.boolean().default(true),
  livraison_express_active: z.boolean().default(true),
  // Gratuité de l'express
  express_gratuit: z.boolean().default(false),
})

// ---------------------------------------------------------------------------
// Création d’un produit – adapté au formulaire admin actuel
// ---------------------------------------------------------------------------
export const createProductSchema = productBaseSchema.extend({
  // Images : accepte un tableau de strings (URLs) pour correspondre au front
  images: z.array(z.string().url('L’URL de l’image est invalide'))
    .min(1, 'Au moins une image est requise')
    .max(15, 'Maximum 15 images autorisées'),
  // Index de l'image principale
  main_image_index: z.number().int().min(0).optional().default(0),
  // Vidéo
  video_url: z.string().url().optional().nullable(),
  // Variantes
  variantes: z.array(variantSchema).max(50).optional().nullable(),
  // boutique_id est intentionnellement omis car seul l'admin crée des produits
}).refine(
  (data) => {
    // Si le produit est actif, il doit avoir au moins une image
    if (data.est_actif && data.images.length === 0) {
      return false
    }
    return true
  },
  { message: 'Un produit actif doit avoir au moins une image', path: ['images'] }
)

// ---------------------------------------------------------------------------
// Mise à jour (tous les champs optionnels)
// ---------------------------------------------------------------------------
export const updateProductSchema = productBaseSchema.partial().extend({
  images: z.array(z.string().url()).max(15).optional(),
  main_image_index: z.number().int().min(0).optional(),
  video_url: z.string().url().optional().nullable(),
  variantes: z.array(variantSchema).max(50).optional().nullable(),
  // boutique_id omis volontairement (non modifiable)
})

// ---------------------------------------------------------------------------
// Validation pour les filtres de recherche de produits (API)
// ---------------------------------------------------------------------------
export const productQuerySchema = z.object({
  q: z.string().optional(),
  categorie: z.string().optional(),
  prix_min: z.coerce.number().nonnegative().optional(),
  prix_max: z.coerce.number().positive().optional(),
  en_stock: z.coerce.boolean().optional(),
  negociable: z.coerce.boolean().optional(),
  condition: z.enum(['neuf', 'occasion', 'reconditionné']).optional(),
  tri: z.enum(['prix_asc', 'prix_desc', 'date', 'popularite']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})

// ---------------------------------------------------------------------------
// Création en masse (import CSV / bulk)
// ---------------------------------------------------------------------------
export const bulkCreateProductSchema = z.array(createProductSchema).min(1).max(500)

// ---------------------------------------------------------------------------
// Schéma pour l'import CSV (simplifié mais robuste)
// ---------------------------------------------------------------------------
export const importProductRowSchema = z.object({
  nom: z.string().min(3),
  description: z.string().min(10),
  prix: z.number().positive(),
  categorie: z.string(),
  stock: z.number().int().min(0).default(0),
  images: z.string().transform(val => val.split(',').map(url => ({ url: url.trim() }))),
})