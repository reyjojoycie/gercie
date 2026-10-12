// ========== IDENTITÉ ==========
export const APP_NAME = "Gercie Market Place"
export const SITE_URL = "https://gercie.com"

// ========== COMMISSIONS ET FRAIS ==========
export const COMMISSION_PERCENT = 5 // 5% de commission Gercie sur chaque vente
export const FRAIS_LIVRAISON_DOMICILE = 15000 // FC
export const FRAIS_LIVRAISON_POINT_RETRAIT = 6000 // FC

// ========== CODES (6 chiffres) ==========
export const CODE_LENGTH = 6
export const CODE_EXPIRY_HOURS = 24 // heures avant expiration (pour les codes de collecte/livraison)
export const MAX_CODE_ATTEMPTS = 3 // tentatives maximum avant blocage

// ========== PAGINATION ==========
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 50
export const PRODUITS_PAR_PAGE = 12

// ========== UPLOADS ==========
export const MAX_IMAGE_SIZE_MB = 2
export const MAX_VIDEO_SIZE_MB = 30
export const MAX_VIDEO_DURATION_SECONDS = 30
export const MAX_PRODUCT_IMAGES = 15

// ========== DÉLAIS ==========
export const DELAI_RETOUR_JOURS = 14 // droit de rétractation
export const DELAI_LIVRAISON_ESTIME_JOURS_MIN = 2
export const DELAI_LIVRAISON_ESTIME_JOURS_MAX = 5

// ========== STATUTS ==========
export const STATUT_COMMANDE = {
  EN_ATTENTE: 'en_attente',
  PAYEE: 'payee',
  COLLECTE: 'collecte',
  EN_LIVRAISON: 'en_livraison',
  LIVREE: 'livree',
  ANNULEE: 'annulee'
} as const

export const STATUT_LIVRAISON = {
  ACCEPTEE: 'acceptee',
  COLIS_RECUPERE: 'colis_recupere',
  LIVREE: 'livree',
  ANNULEE: 'annulee'
} as const

// ========== TYPES ==========
export const TYPE_TRANSACTION = {
  RECHARGE: 'recharge',
  ACHAT: 'achat',
  VENTE: 'vente',
  RETRAIT: 'retrait',
  TRANSFERT: 'transfert',
  REMBOURSEMENT: 'remboursement'
} as const

export const TYPE_NOTIFICATION = {
  COMMANDE: 'commande',
  PAIEMENT: 'paiement',
  LIVRAISON: 'livraison',
  RETRAIT: 'retrait',
  ALERTE: 'alerte'
} as const

// ========== RÔLES ==========
export const ROLE = {
  ACHETEUR: 'acheteur',
  LIVREUR: 'livreur',
  ADMIN: 'admin'
} as const

// ========== LIMITES ==========
export const MAX_QUANTITE_PANIER = 99
export const MIN_MONTANT_RECHARGE = 100 // FC
export const MIN_MONTANT_RETRAIT = 1000 // FC

// ========== REGEX ==========
export const PHONE_REGEX = /^(0[0-9]{9})$/ // 10 chiffres commençant par 0
export const CODE_REGEX = /^\d{6}$/ // 6 chiffres exactement
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ========== MESSAGES ==========
export const MESSAGES = {
  // Erreurs générales
  ERREUR_SERVEUR: 'Une erreur est survenue. Veuillez réessayer plus tard.',
  NON_AUTHENTIFIE: 'Vous devez être connecté pour effectuer cette action.',
  ACCES_NON_AUTORISE: 'Vous n’avez pas les droits nécessaires.',
  
  // Panier
  PANIER_VIDE: 'Votre panier est vide.',
  QUANTITE_INVALIDE: 'La quantité doit être comprise entre 1 et 99.',
  
  // Commandes
  COMMANDE_INTROUVABLE: 'Commande introuvable.',
  COMMANDE_NON_ANNUABLE: 'Cette commande ne peut plus être annulée.',
  
  // Paiement
  SOLDE_INSUFFISANT: 'Votre solde est insuffisant pour effectuer ce paiement.',
  PAIEMENT_ECHOUE: 'Le paiement a échoué. Veuillez réessayer.',
  
  // Codes
  CODE_INVALIDE: 'Code invalide.',
  CODE_EXPIRE: 'Ce code a expiré.',
  TROP_TENTATIVES: 'Trop de tentatives. Contactez le support Gercie.',
  
  // Upload
  FICHIER_TROP_GRAND: `Le fichier ne doit pas dépasser ${MAX_IMAGE_SIZE_MB} Mo.`,
  FORMAT_NON_SUPPORTE: 'Format de fichier non supporté.',
  
  // Succès
  AJOUT_PANIER: 'Produit ajouté au panier.',
  COMMANDE_CREE: 'Commande créée avec succès.',
  PAIEMENT_REUSSI: 'Paiement effectué avec succès.',
  CODE_COPIE: 'Code copié dans le presse-papier.'
} as const

// ========== IA & RECHERCHE SÉMANTIQUE ==========
// Modèle local gratuit all-MiniLM-L6-v2 (dimension 384)
export const AI_EMBEDDING_DIMENSION = 384
export const AI_DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2'
// Modèle de chat Groq (gratuit)
export const AI_DEFAULT_CHAT_MODEL = 'llama3-70b-8192'

// Seuils pour la recherche hybride
export const AI_SEMANTIC_SEARCH_MIN_SCORE = 0.5     // Score minimum de similarité cosinus
export const AI_HYBRID_TEXT_WEIGHT = 0.3            // Poids du score textuel
export const AI_HYBRID_SEMANTIC_WEIGHT = 0.7        // Poids du score sémantique

// Personnalisation
export const AI_PERSONALIZATION_MIN_SIMILARITY = 0.5
export const AI_INTERACTION_WINDOW_DAYS = 30
export const AI_MAX_TOP_PRODUCTS_PROFILE = 20

// Détection de fraude
export const AI_FRAUD_THRESHOLD_HIGH = 0.7
export const AI_FRAUD_THRESHOLD_MEDIUM = 0.4

// Optimisation tarifaire
export const AI_PRICE_MIN = 500                     // Prix minimum en CDF
export const AI_PRICE_MAX_INCREASE_PERCENT = 30
export const AI_PRICE_MAX_DECREASE_PERCENT = 20