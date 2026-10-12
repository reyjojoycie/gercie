// lib/promo-utils.ts
/**
 * Utilitaires pour la gestion des codes promo.
 *
 * Fonctions pures, réutilisables côté client comme côté serveur.
 */

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */

export interface PromoCode {
  code: string
  type: 'percent' | 'fixed'
  value: number
  minTotal?: number
  maxDiscount?: number
}

export interface PromoValidationResult {
  valid: boolean
  error?: string
}

export interface PromoStatusCheck {
  actif: boolean
  expires_at?: string | null
  utilisations_actuelles: number
  max_utilisations: number
}

/* ========================================================================== */
/*  Génération de code aléatoire                                               */
/* ========================================================================== */

/**
 * Génère un code promo alphanumérique en majuscules.
 * @param length Longueur du code (par défaut 8).
 * @returns Chaîne aléatoire ex: "A3XK9P2M"
 */
export function generatePromoCode(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/* ========================================================================== */
/*  Vérification statique de la validité d'un code                            */
/* ========================================================================== */

/**
 * Vérifie si un code promo est valide selon son statut et ses limites.
 * @param promo Objet contenant les propriétés de suivi du code.
 * @returns Résultat de validation avec éventuelle erreur.
 */
export function isPromoValid(promo: PromoStatusCheck): PromoValidationResult {
  if (!promo.actif) {
    return { valid: false, error: 'Ce code promo n\'est plus actif.' }
  }

  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { valid: false, error: 'Ce code promo a expiré.' }
  }

  if (promo.utilisations_actuelles >= promo.max_utilisations) {
    return { valid: false, error: 'Ce code promo a déjà été utilisé le nombre maximum de fois.' }
  }

  return { valid: true }
}

/* ========================================================================== */
/*  Calcul du montant de la remise                                             */
/* ========================================================================== */

/**
 * Calcule le montant de la remise applicable.
 * @param sousTotal Montant du panier avant remise.
 * @param promo Code promo à appliquer.
 * @returns Montant de la remise (0 si les conditions ne sont pas remplies).
 */
export function calculateDiscount(
  sousTotal: number,
  promo: PromoCode
): number {
  // Vérifier le montant minimum
  if (promo.minTotal !== undefined && sousTotal < promo.minTotal) {
    return 0
  }

  let discount = 0

  if (promo.type === 'percent') {
    discount = (sousTotal * promo.value) / 100
    // Appliquer un plafond de remise si défini
    if (promo.maxDiscount !== undefined && discount > promo.maxDiscount) {
      discount = promo.maxDiscount
    }
  } else if (promo.type === 'fixed') {
    discount = Math.min(sousTotal, promo.value)
  }

  // La remise ne peut pas dépasser le sous-total
  return Math.min(discount, sousTotal)
}

/* ========================================================================== */
/*  Normalisation d'un code (nettoyage)                                        */
/* ========================================================================== */

/**
 * Nettoie et met en majuscule un code promo saisi par l'utilisateur.
 * @param input Chaîne brute saisie.
 * @returns Code nettoyé (sans espaces, en majuscules).
 */
export function sanitizePromoCode(input: string): string {
  return input.trim().toUpperCase()
}

/* ========================================================================== */
/*  Exemple d'extension : vérification de cumul                                */
/* ========================================================================== */

/**
 * Vérifie si deux codes promo peuvent être cumulés.
 * Par défaut, les codes ne sont pas cumulables.
 * @param activeCodes Liste des codes déjà appliqués.
 * @param newCode Nouveau code à appliquer.
 * @returns true si le cumul est autorisé.
 */
export function canStackPromo(
  activeCodes: PromoCode[],
  newCode: PromoCode
): boolean {
  // Règle simple : pas de cumul
  return activeCodes.length === 0
}