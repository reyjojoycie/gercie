// lib/searchHistory.ts
/**
 * Gestion de l'historique de recherche – client (localStorage / sessionStorage)
 *
 * Fonctionnalités :
 *  - Ajout / suppression de termes
 *  - Limite du nombre d'entrées
 *  - Expiration des entrées anciennes
 *  - Récupération de l'historique complet
 *  - Vidage complet
 *  - Export / import (JSON)
 *  - Statistiques simples
 *  - Utilisable côté client uniquement (vérification typeof window)
 */

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface SearchHistoryEntry {
  term: string
  timestamp: number       // Date.now()
  filters?: Record<string, any>  // filtres utilisés à ce moment
  resultsCount?: number
}

export interface SearchHistoryOptions {
  /** Clé de stockage */
  storageKey?: string
  /** Utiliser sessionStorage au lieu de localStorage */
  session?: boolean
  /** Nombre maximum d'entrées conservées */
  maxEntries?: number
  /** Durée de vie d'une entrée en ms (défaut : 30 jours) */
  ttlMs?: number
  /** Dédupliquer automatiquement (garde la plus récente) */
  deduplicate?: boolean
}

/* ========================================================================== */
/*  Classe SearchHistory                                                      */
/* ========================================================================== */

class SearchHistory {
  private storageKey: string
  private storage: Storage | null
  private maxEntries: number
  private ttlMs: number
  private deduplicate: boolean

  constructor(options: SearchHistoryOptions = {}) {
    this.storageKey = options.storageKey || 'gercie_search_history'
    this.maxEntries = options.maxEntries || 20
    this.ttlMs = options.ttlMs || 30 * 24 * 60 * 60 * 1000 // 30 jours
    this.deduplicate = options.deduplicate !== undefined ? options.deduplicate : true
    this.storage = this.getStorage(options.session ? 'session' : 'local')
  }

  private getStorage(type: 'local' | 'session'): Storage | null {
    if (typeof window === 'undefined') return null
    try {
      return type === 'session' ? window.sessionStorage : window.localStorage
    } catch {
      return null
    }
  }

  private getAllEntries(): SearchHistoryEntry[] {
    if (!this.storage) return []
    try {
      const raw = this.storage.getItem(this.storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
    } catch {
      return []
    }
  }

  private saveEntries(entries: SearchHistoryEntry[]): void {
    if (!this.storage) return
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(entries))
    } catch {
      // Storage plein ou indisponible
    }
  }

  /** Nettoie les entrées expirées */
  private cleanExpired(entries: SearchHistoryEntry[]): SearchHistoryEntry[] {
    const now = Date.now()
    return entries.filter(entry => now - entry.timestamp < this.ttlMs)
  }

  /** Ajoute un terme à l'historique */
  public add(term: string, filters?: Record<string, any>, resultsCount?: number): void {
    if (!this.storage || !term.trim()) return

    let entries = this.getAllEntries()
    entries = this.cleanExpired(entries)

    if (this.deduplicate) {
      entries = entries.filter(e => e.term !== term)
    }

    const newEntry: SearchHistoryEntry = {
      term: term.trim(),
      timestamp: Date.now(),
      filters,
      resultsCount,
    }

    entries.unshift(newEntry)
    entries = entries.slice(0, this.maxEntries)

    this.saveEntries(entries)
  }

  /** Récupère l'historique complet */
  public getAll(): SearchHistoryEntry[] {
    let entries = this.getAllEntries()
    entries = this.cleanExpired(entries)
    return entries
  }

  /** Récupère uniquement les termes sous forme de tableau de chaînes */
  public getTerms(): string[] {
    return this.getAll().map(e => e.term)
  }

  /** Récupère les N derniers termes */
  public getRecent(limit = 5): string[] {
    return this.getAll().slice(0, limit).map(e => e.term)
  }

  /** Supprime un terme spécifique */
  public remove(term: string): void {
    let entries = this.getAllEntries()
    entries = entries.filter(e => e.term !== term)
    this.saveEntries(entries)
  }

  /** Vide tout l'historique */
  public clear(): void {
    if (!this.storage) return
    try {
      this.storage.removeItem(this.storageKey)
    } catch {}
  }

  /** Exporte l'historique au format JSON */
  public export(): string {
    return JSON.stringify(this.getAll())
  }

  /** Importe un historique depuis une chaîne JSON */
  public import(json: string): boolean {
    if (!this.storage) return false
    try {
      const parsed = JSON.parse(json)
      if (!Array.isArray(parsed)) return false
      this.saveEntries(parsed)
      return true
    } catch {
      return false
    }
  }

  /** Retourne le nombre d'entrées (après nettoyage) */
  public count(): number {
    return this.getAll().length
  }

  /** Retourne le terme le plus recherché */
  public mostSearched(): string | null {
    const terms = this.getTerms()
    if (terms.length === 0) return null
    const freq = new Map<string, number>()
    terms.forEach(t => freq.set(t, (freq.get(t) || 0) + 1))
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0][0]
  }
}

/* ========================================================================== */
/*  Instance par défaut (localStorage, 20 entrées, 30 jours)                  */
/* ========================================================================== */

let defaultInstance: SearchHistory | null = null

export function getSearchHistory(): SearchHistory {
  if (!defaultInstance) {
    defaultInstance = new SearchHistory()
  }
  return defaultInstance
}

/* ========================================================================== */
/*  Fonctions d'aide rapides (sans instanciation manuelle)                    */
/* ========================================================================== */

export function addToSearchHistory(term: string, filters?: Record<string, any>, resultsCount?: number) {
  getSearchHistory().add(term, filters, resultsCount)
}

export function getRecentSearches(limit = 5): string[] {
  return getSearchHistory().getRecent(limit)
}

export function clearSearchHistory() {
  getSearchHistory().clear()
}

export function getSearchHistoryCount(): number {
  return getSearchHistory().count()
}

/* ========================================================================== */
/*  Export / Import                                                            */
/* ========================================================================== */

export function exportSearchHistory(): string {
  return getSearchHistory().export()
}

export function importSearchHistory(json: string): boolean {
  return getSearchHistory().import(json)
}