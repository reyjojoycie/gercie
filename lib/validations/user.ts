// lib/validations/user.ts
import { z } from 'zod'

/* ========================================================================== */
/*  Schémas de base partagés (téléphone, email) – enrichis                    */
/* ========================================================================== */
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Numéro de téléphone invalide (format international)')
  .transform((val) => val.replace(/[\s()-]/g, ''))

export const emailSchema = z.string().email('Adresse email invalide').max(255)

export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
  .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial')

/* ========================================================================== */
/*  Profil utilisateur (mise à jour)                                          */
/* ========================================================================== */
export const updateProfileSchema = z.object({
  nom: z
    .string()
    .min(1, 'Le nom est requis')
    .max(100, 'Le nom est trop long')
    .regex(/^[\p{L}\s'-]+$/u, 'Le nom contient des caractères invalides')
    .optional(),
  prenom: z
    .string()
    .min(1, 'Le prénom est requis')
    .max(100, 'Le prénom est trop long')
    .regex(/^[\p{L}\s'-]+$/u, 'Le prénom contient des caractères invalides')
    .optional(),
  telephone: phoneSchema.optional(),
  date_naissance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)')
    .refine((date) => {
      const age = (Date.now() - new Date(date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      return age >= 15
    }, 'Vous devez avoir au moins 15 ans')
    .optional(),
  sexe: z.enum(['M', 'F', 'autre']).optional(),
  langue: z.enum(['fr', 'en', 'ar']).optional(),
})

/* ========================================================================== */
/*  Avatar                                                                     */
/* ========================================================================== */
export const updateAvatarSchema = z.object({
  avatar_url: z.string().url("L'URL de l'avatar est invalide").nullable(),
})

/* ========================================================================== */
/*  Adresse (schéma complet)                                                  */
/* ========================================================================== */
export const addressSchema = z.object({
  titre: z.enum(['domicile', 'bureau', 'autre']).optional(),
  pays: z.string().default('RDC'),
  province: z.string().min(1, 'La province est requise'),
  ville: z.string().min(1, 'La ville est requise'),
  commune: z.string().optional(),
  quartier: z.string().optional(),
  avenue: z.string().optional(),
  numero: z.string().optional(),
  reference: z.string().optional(),
  code_postal: z.string().optional(),
  telephone: phoneSchema.optional(),
  instructions: z.string().max(300).optional(),
  geoloc: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  principale: z.boolean().default(false),
})

export const updateAddressSchema = addressSchema.partial()

/* ========================================================================== */
/*  Sécurité (questions secrètes, mot de passe)                                */
/* ========================================================================== */
export const securityQuestionSchema = z.object({
  question_secrete: z
    .string()
    .min(3, 'Veuillez sélectionner une question')
    .max(200),
  reponse_secrete: z
    .string()
    .min(2, 'La réponse doit contenir au moins 2 caractères')
    .max(100)
    .transform((val) => val.trim().toLowerCase()),
})

export const changePasswordSchema = z
  .object({
    ancien_mot_de_passe: z.string().min(1, 'Ancien mot de passe requis'),
    nouveau_mot_de_passe: passwordSchema,
    confirmation: z.string(),
  })
  .refine((data) => data.nouveau_mot_de_passe === data.confirmation, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmation'],
  })

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    token: z.string().optional(),
    nouveau_mot_de_passe: passwordSchema.optional(),
    confirmation: z.string().optional(),
  })
  .refine((data) => {
    if (data.nouveau_mot_de_passe && data.confirmation) {
      return data.nouveau_mot_de_passe === data.confirmation
    }
    return true
  }, { message: 'Les mots de passe ne correspondent pas', path: ['confirmation'] })

/* ========================================================================== */
/*  Portefeuille et transactions                                              */
/* ========================================================================== */
export const rechargeSchema = z.object({
  montant: z
    .number()
    .positive('Le montant doit être positif')
    .max(5000000, 'Le montant dépasse la limite autorisée'),
  currency: z.enum(['CDF', 'USD']),
  method: z.enum(['orange', 'airtel', 'mpesa', 'afrimoney']),
  phone: phoneSchema,
})

export const transfertSchema = z
  .object({
    montant: z.number().positive('Le montant doit être positif'),
    source: z.enum(['achat', 'vente']),
    destination: z.enum(['achat', 'vente']),
    beneficiaire_id: z.string().uuid('ID du bénéficiaire invalide').optional(),
    motif: z.string().max(200).optional(),
  })
  .refine((data) => data.source !== data.destination, {
    message: 'La source et la destination doivent être différentes',
  })

export const retraitSchema = z.object({
  montant: z
    .number()
    .int('Le montant doit être un entier')
    .min(1000, 'Le montant minimum est de 1000 FC')
    .max(10000000, 'Le montant maximum est de 10 000 000 FC'),
  phone: phoneSchema,
  methode: z.enum(['mobile_money', 'virement']).optional(),
})

/* ========================================================================== */
/*  Inscription (utilisateur + vendeur)                                       */
/* ========================================================================== */
export const registerSchema = z.object({
  nom: z.string().min(1, 'Nom requis'),
  prenom: z.string().min(1, 'Prénom requis'),
  email: emailSchema,
  mot_de_passe: passwordSchema,
  telephone: phoneSchema,
  accepte_conditions: z.literal(true, {
    errorMap: () => ({ message: 'Vous devez accepter les conditions générales' }),
  }),
  type_compte: z.enum(['client', 'vendeur']).optional(),
})

/* ========================================================================== */
/*  Profil vendeur (boutique)                                                  */
/* ========================================================================== */
export const vendorProfileSchema = z.object({
  nom_boutique: z
    .string()
    .min(3, 'Le nom de la boutique doit contenir au moins 3 caractères')
    .max(100)
    .optional(),
  description_boutique: z.string().max(500).optional(),
  logo_boutique: z.string().url().optional().nullable(),
  banniere_boutique: z.string().url().optional().nullable(),
  telephone_boutique: phoneSchema.optional(),
  email_boutique: emailSchema.optional(),
  site_web: z.string().url().optional().nullable(),
  adresse_boutique: addressSchema.optional(),
  categories_principales: z.array(z.string()).max(5).optional(),
  est_verifie: z.boolean().optional(),
})

/* ========================================================================== */
/*  Profil livreur (conservé et enrichi)                                      */
/* ========================================================================== */
export const livreurProfileSchema = z.object({
  telephone: phoneSchema.optional(),
  avatar_url: z.string().url().optional().nullable(),
  est_disponible: z.boolean().optional(),
  zone_operation_principale: z.string().optional(),
  moto_modele: z.string().optional(),
  moto_plaque: z.string().optional(),
  photo_url: z.string().url().optional().nullable(),
  // Champs enrichis
  date_naissance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sexe: z.enum(['M', 'F']).optional(),
  langues_parlees: z.array(z.string()).optional(),
  score_confiance: z.number().min(0).max(100).optional(),
})

/* ========================================================================== */
/*  Signalement / litige                                                        */
/* ========================================================================== */
export const reportUserSchema = z.object({
  signale_id: z.string().uuid('ID de l’utilisateur invalide'),
  type: z.enum(['harcèlement', 'arnaque', 'produit_illégal', 'autre']),
  description: z.string().min(20, 'Veuillez décrire le problème en au moins 20 caractères').max(1000),
  commande_id: z.string().uuid().optional(),
  pieces_jointes: z.array(z.string().url()).max(5).optional(),
})

/* ========================================================================== */
/*  Notification & préférences                                                */
/* ========================================================================== */
export const notificationPreferencesSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  push: z.boolean().optional(),
  commande_statut: z.boolean().optional(),
  promotions: z.boolean().optional(),
  livraison: z.boolean().optional(),
})

/* ========================================================================== */
/*  Vérification identité (KYC léger)                                         */
/* ========================================================================== */
export const identityVerificationSchema = z.object({
  type_piece: z.enum(['cni', 'passeport', 'permis_conduire']),
  numero_piece: z.string().min(5).max(50),
  photo_recto: z.string().url('Photo recto invalide'),
  photo_verso: z.string().url('Photo verso invalide').optional(),
  selfie: z.string().url('Selfie invalide').optional(),
})

/* ========================================================================== */
/*  Schémas pour l'administration                                             */
/* ========================================================================== */
export const adminUpdateUserSchema = z.object({
  role: z.enum(['user', 'vendeur', 'livreur', 'admin']).optional(),
  suspendu: z.boolean().optional(),
  email_verifie: z.boolean().optional(),
  telephone_verifie: z.boolean().optional(),
  limite_transaction: z.number().positive().optional(),
})

/* ========================================================================== */
/*  Types exportés (pratiques)                                                */
/* ========================================================================== */
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type AddressInput = z.infer<typeof addressSchema>
export type RechargeInput = z.infer<typeof rechargeSchema>
export type TransfertInput = z.infer<typeof transfertSchema>
export type RetraitInput = z.infer<typeof retraitSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type VendorProfileInput = z.infer<typeof vendorProfileSchema>
export type LivreurProfileInput = z.infer<typeof livreurProfileSchema>