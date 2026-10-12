// lib/statuts.ts
import {
  Clock, CreditCard, Package, Truck, CheckCircle, XCircle, ShieldCheck
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types de statuts                                                   */
/* ------------------------------------------------------------------ */
export type StatutCommande =
  | 'en_attente'
  | 'payee'
  | 'conditionnement_premium'
  | 'collecte'
  | 'en_livraison'
  | 'livree'
  | 'annulee'

/* ------------------------------------------------------------------ */
/*  Configuration des libellés, variantes, icônes                      */
/* ------------------------------------------------------------------ */
export const STATUT_LABELS: Record<StatutCommande, string> = {
  en_attente: 'En attente de paiement',
  payee: 'Payée',
  conditionnement_premium: 'Conditionnement Premium',
  collecte: 'En cours de préparation',        // rétrocompatibilité
  en_livraison: 'En cours de livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
}

export const STATUT_VARIANTS: Record<StatutCommande, 'warm' | 'gold' | 'accent' | 'danger' | 'neutral'> = {
  en_attente: 'warm',
  payee: 'gold',
  conditionnement_premium: 'neutral',
  collecte: 'neutral',
  en_livraison: 'warm',
  livree: 'accent',
  annulee: 'danger',
}

export const STATUT_ICONS: Record<StatutCommande, LucideIcon> = {
  en_attente: Clock,
  payee: CreditCard,
  conditionnement_premium: Package,
  collecte: Package,
  en_livraison: Truck,
  livree: CheckCircle,
  annulee: XCircle,
}

/* ------------------------------------------------------------------ */
/*  Ordre chronologique (pour les timelines)                            */
/* ------------------------------------------------------------------ */
export const STATUT_ORDER: StatutCommande[] = [
  'en_attente',
  'payee',
  'conditionnement_premium', // équivalent moderne de collecte
  'collecte',                // conservé pour les anciennes commandes
  'en_livraison',
  'livree',
  'annulee',
]

/* ------------------------------------------------------------------ */
/*  Transitions autorisées (machine à états)                            */
/* ------------------------------------------------------------------ */
export const STATUT_TRANSITIONS: Record<StatutCommande, StatutCommande[]> = {
  en_attente: ['payee', 'annulee'],
  payee: ['conditionnement_premium', 'collecte', 'en_livraison', 'annulee'],
  conditionnement_premium: ['collecte', 'en_livraison', 'annulee'],
  collecte: ['en_livraison', 'annulee'],
  en_livraison: ['livree', 'annulee'],
  livree: [],                  // statut terminal
  annulee: [],                 // statut terminal
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Retourne le libellé lisible d’un statut.
 */
export function getStatutLabel(statut: string): string {
  return STATUT_LABELS[statut as StatutCommande] || statut
}

/**
 * Retourne la variante (couleur) associée à un statut.
 */
export function getStatutVariant(statut: string): 'warm' | 'gold' | 'accent' | 'danger' | 'neutral' {
  return STATUT_VARIANTS[statut as StatutCommande] || 'neutral'
}

/**
 * Indique si le code client est utilisable pour ce statut.
 */
export function isStatutValidForCode(statut: string): boolean {
  return ['payee', 'conditionnement_premium', 'collecte', 'en_livraison'].includes(statut)
}

/**
 * Retourne l'icône Lucide correspondant au statut.
 */
export function getStatutIcon(statut: string): LucideIcon {
  return STATUT_ICONS[statut as StatutCommande] || Clock
}

/**
 * Retourne la liste des statuts vers lesquels il est possible de transiter.
 */
export function getNextStatuts(statut: string): StatutCommande[] {
  return STATUT_TRANSITIONS[statut as StatutCommande] || []
}

/**
 * Vérifie si une transition est autorisée.
 */
export function canTransition(from: string, to: string): boolean {
  const allowed = STATUT_TRANSITIONS[from as StatutCommande]
  return allowed ? allowed.includes(to as StatutCommande) : false
}

/**
 * Liste de tous les statuts pour les filtres, etc.
 */
export const ALL_STATUTS = Object.keys(STATUT_LABELS) as StatutCommande[]