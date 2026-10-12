// lib/ai/moderation.ts
/**
 * Service de modération automatique des contenus (témoignages, messages, etc.).
 * Utilise la bibliothèque gratuite `bad-words` pour filtrer les textes inappropriés.
 * Aucun appel réseau n'est nécessaire.
 */
import * as Filter from 'bad-words';
// Correction de l'import pour correspondre au nom réel défini dans lib/logger.ts
import { GercieLogger as logger } from '@/lib/logger';

// Initialisation du filtre avec la bonne syntaxe d'importation
// @ts-ignore - Nécessaire selon les versions de définitions de types de bad-words avec l'import global
const filter = new (Filter.Filter || Filter)();

/**
 * Vérifie si un texte contient du contenu inapproprié.
 * Retourne `true` si le texte doit être signalé.
 *
 * @param text - Le texte à analyser (min. 3 caractères)
 * @returns `true` si le contenu est inapproprié, `false` sinon.
 */
export async function moderateText(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 3) {
    // Texte trop court pour être modéré
    return false;
  }

  try {
    const isProfane = filter.isProfane(trimmed);
    if (isProfane) {
      logger.warn('Modération : contenu signalé par le filtre de grossièretés.');
      return true;
    }
    return false;
  } catch (error: any) {
    logger.error('Erreur lors de la modération locale', error);
    // En cas d'erreur, on ne bloque pas le contenu (fail‑open)
    return false;
  }
}