// lib/validations.ts
import { createClient } from '@/lib/supabaseServer' // pour usage serveur
import type { SupabaseClient } from '@supabase/supabase-js'
import { STATUT_TRANSITIONS } from '@/lib/statuts'
import type { StatutCommande } from '@/lib/statuts'
import crypto from 'crypto'

/* ------------------------------------------------------------------ */
/*  Configuration des tentatives                                        */
/* ------------------------------------------------------------------ */
const MAX_FAILED_ATTEMPTS = 3
const ATTEMPT_WINDOW_MINUTES = 15

/* ------------------------------------------------------------------ */
/*  Validation du format du code                                        */
/* ------------------------------------------------------------------ */

/**
 * Vérifie qu'une chaîne est au format attendu (6 caractères alphanumériques).
 */
export function validateCodeFormat(code: string): boolean {
  return /^[A-Za-z0-9]{6}$/.test(code)
}

/**
 * Nettoie un code saisi : supprime les espaces, passe en majuscules.
 */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

/**
 * Compare deux codes de manière sécurisée (temps constant).
 * @returns true si les codes sont identiques après normalisation.
 */
export function compareCodes(input: string, reference: string): boolean {
  const a = Buffer.from(normalizeCode(input))
  const b = Buffer.from(normalizeCode(reference))
  if (a.length !== b.length) {
    // Pour éviter de divulguer la longueur, on peut faire une comparaison en temps constant quand même
    return false
  }
  return crypto.timingSafeEqual(a, b)
}

/* ------------------------------------------------------------------ */
/*  Gestion des tentatives échouées                                    */
/* ------------------------------------------------------------------ */

/**
 * Compte le nombre de tentatives échouées pour un code sur une commande.
 * @param supabase - client Supabase
 * @param commandeId - UUID de la commande
 * @param typeCode - 'CLIENT' ou 'LIVREUR'
 * @param windowMinutes - fenêtre de temps en minutes (défaut 15)
 * @returns nombre d'échecs
 */
export async function getFailedAttempts(
  supabase: SupabaseClient,
  commandeId: string,
  typeCode: 'CLIENT' | 'LIVREUR',
  windowMinutes: number = ATTEMPT_WINDOW_MINUTES,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('validation_codes')
    .select('*', { count: 'exact', head: true })
    .eq('commande_id', commandeId)
    .eq('type_code', typeCode)
    .eq('valide', false)
    .gte('cree_le', since)

  if (error) {
    console.error('Erreur comptage tentatives:', error.message)
    return 0
  }
  return count ?? 0
}

/**
 * Vérifie si un code est bloqué suite à trop de tentatives échouées.
 */
export async function isCodeBlocked(
  supabase: SupabaseClient,
  commandeId: string,
  typeCode: 'CLIENT' | 'LIVREUR',
  maxAttempts: number = MAX_FAILED_ATTEMPTS,
): Promise<boolean> {
  const attempts = await getFailedAttempts(supabase, commandeId, typeCode)
  return attempts >= maxAttempts
}

/**
 * Retourne le nombre de tentatives restantes avant blocage.
 */
export async function remainingAttempts(
  supabase: SupabaseClient,
  commandeId: string,
  typeCode: 'CLIENT' | 'LIVREUR',
  maxAttempts: number = MAX_FAILED_ATTEMPTS,
): Promise<number> {
  const attempts = await getFailedAttempts(supabase, commandeId, typeCode)
  return Math.max(0, maxAttempts - attempts)
}

/* ------------------------------------------------------------------ */
/*  Autorisations                                                       */
/* ------------------------------------------------------------------ */

/**
 * Vérifie que l'utilisateur peut valider la livraison (livreur assigné ou admin).
 * @param userId - ID de l'utilisateur connecté
 * @param commandeLivreurId - ID du livreur assigné à la commande
 * @param userRole - rôle de l'utilisateur (optionnel, pour éviter une requête supplémentaire)
 */
export function canValidateLivraison(
  userId: string,
  commandeLivreurId: string | null,
  userRole?: string,
): boolean {
  if (userRole === 'admin') return true
  return commandeLivreurId === userId
}

/**
 * Vérifie que l'utilisateur peut valider la collecte (admin uniquement).
 */
export function canValidateCollecte(userRole: string): boolean {
  return userRole === 'admin'
}

/* ------------------------------------------------------------------ */
/*  Transitions de statut                                               */
/* ------------------------------------------------------------------ */

/**
 * Vérifie si une transition de statut est autorisée.
 */
export function isValidTransition(
  from: string,
  to: string,
): boolean {
  const allowed = STATUT_TRANSITIONS[from as StatutCommande]
  if (!allowed) return false
  return allowed.includes(to as StatutCommande)
}

/**
 * Lève une erreur si la transition n'est pas autorisée.
 */
export function assertTransition(from: string, to: string): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Transition de "${from}" à "${to}" non autorisée.`)
  }
}