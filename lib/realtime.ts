// lib/realtime.ts
import { EventEmitter } from 'events'

/* ------------------------------------------------------------------ */
/*  Types d'événements                                                   */
/* ------------------------------------------------------------------ */
export interface CommandeStatusEvent {
  commandeId: string
  ancienStatut: string
  nouveauStatut: string
}

export interface CodeGeneratedEvent {
  commandeId: string
  type: 'CLIENT' | 'LIVREUR'
  code: string
}

export interface CollecteValidatedEvent {
  commandeId: string
  livreurId?: string
}

export interface LivraisonValidatedEvent {
  commandeId: string
  clientId?: string
}

export type RealtimeEvent =
  | { type: 'status_change'; data: CommandeStatusEvent }
  | { type: 'code_generated'; data: CodeGeneratedEvent }
  | { type: 'collecte_validated'; data: CollecteValidatedEvent }
  | { type: 'livraison_validated'; data: LivraisonValidatedEvent }

/* ------------------------------------------------------------------ */
/*  Bus d'événements global                                             */
/* ------------------------------------------------------------------ */
class RealtimeEventBus extends EventEmitter {
  private static instance: RealtimeEventBus

  static getInstance(): RealtimeEventBus {
    if (!RealtimeEventBus.instance) {
      RealtimeEventBus.instance = new RealtimeEventBus()
    }
    return RealtimeEventBus.instance
  }
}

/* ------------------------------------------------------------------ */
/*  Fonctions utilitaires pour publier des événements                    */
/* ------------------------------------------------------------------ */
const bus = RealtimeEventBus.getInstance()

/**
 * Publie un événement sur un canal spécifique.
 */
export function publish(channel: string, event: RealtimeEvent): void {
  bus.emit(channel, event)
}

/**
 * S'abonne à un canal. Retourne une fonction de désabonnement.
 */
export function subscribe(
  channel: string,
  listener: (event: RealtimeEvent) => void,
): () => void {
  bus.on(channel, listener)
  return () => bus.off(channel, listener)
}

/* ------------------------------------------------------------------ */
/*  Raccourcis pour les événements métier                                */
/* ------------------------------------------------------------------ */

/**
 * Envoyer une notification de changement de statut.
 */
export function sendStatusChange(
  commandeId: string,
  ancienStatut: string,
  nouveauStatut: string,
): void {
  const event: RealtimeEvent = {
    type: 'status_change',
    data: { commandeId, ancienStatut, nouveauStatut },
  }

  // Diffuser sur les canaux appropriés
  publish(`commande:${commandeId}`, event)
  publish('admin', event)
  publish(`livreur:${commandeId}`, event) // si un livreur est abonné
}

/**
 * Envoyer une notification de génération de code.
 */
export function sendCodeGenerated(
  commandeId: string,
  type: 'CLIENT' | 'LIVREUR',
  code: string,
): void {
  const event: RealtimeEvent = {
    type: 'code_generated',
    data: { commandeId, type, code },
  }
  publish(`commande:${commandeId}`, event)
  publish('admin', event)
  if (type === 'LIVREUR') publish(`livreur:${commandeId}`, event)
}

/**
 * Envoyer une notification de validation de collecte.
 */
export function sendCollecteValidated(
  commandeId: string,
  livreurId?: string,
): void {
  const event: RealtimeEvent = {
    type: 'collecte_validated',
    data: { commandeId, livreurId },
  }
  publish(`commande:${commandeId}`, event)
  publish('admin', event)
  if (livreurId) publish(`livreur:${commandeId}`, event)
}

/**
 * Envoyer une notification de validation de livraison.
 */
export function sendLivraisonValidated(
  commandeId: string,
  clientId?: string,
): void {
  const event: RealtimeEvent = {
    type: 'livraison_validated',
    data: { commandeId, clientId },
  }
  publish(`commande:${commandeId}`, event)
  publish('admin', event)
  publish(`livreur:${commandeId}`, event)
}