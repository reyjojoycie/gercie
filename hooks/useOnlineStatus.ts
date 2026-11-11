// hooks/useOnlineStatus.ts
'use client'

import { useSyncExternalStore } from 'react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface OnlineStatusSnapshot {
  /** Connexion réseau du navigateur */
  isOnline: boolean

  /** Timestamp du dernier changement détecté */
  lastChangedAt: number | null

  /** L'état client est-il hydraté ? */
  isHydrated: boolean
}

/* ═══════════════════════════════════════════════════════════════ */
/*  STORE GLOBAL LÉGER                                             */
/*                                                                 */
/*  But :                                                          */
/*  - un seul abonnent global aux événements navigateur           */
/*  - pas de fetch /api/ping                                       */
/*  - SSR-safe                                                     */
/*  - compatible React 18+ / Next.js App Router                   */
/* ═══════════════════════════════════════════════════════════════ */

const SERVER_SNAPSHOT: OnlineStatusSnapshot = {
  isOnline: true,
  lastChangedAt: null,
  isHydrated: false,
}

let snapshot: OnlineStatusSnapshot = {
  ...SERVER_SNAPSHOT,
}

const listeners = new Set<() => void>()

let initialized = false

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

function setSnapshot(next: Partial<OnlineStatusSnapshot>): void {
  const merged: OnlineStatusSnapshot = {
    ...snapshot,
    ...next,
  }

  const hasChanged =
    merged.isOnline !== snapshot.isOnline ||
    merged.lastChangedAt !== snapshot.lastChangedAt ||
    merged.isHydrated !== snapshot.isHydrated

  if (!hasChanged) return

  snapshot = merged
  emitChange()
}

function handleOnline(): void {
  setSnapshot({
    isOnline: true,
    lastChangedAt: Date.now(),
  })
}

function handleOffline(): void {
  setSnapshot({
    isOnline: false,
    lastChangedAt: Date.now(),
  })
}

function initializeStore(): void {
  if (initialized) return
  if (typeof window === 'undefined') return
  if (typeof navigator === 'undefined') return

  initialized = true

  setSnapshot({
    isOnline: navigator.onLine,
    isHydrated: true,
  })

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
}

function subscribe(listener: () => void): () => void {
  initializeStore()

  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): OnlineStatusSnapshot {
  return snapshot
}

function getServerSnapshot(): OnlineStatusSnapshot {
  return SERVER_SNAPSHOT
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS PUBLICS                                                  */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Retourne l'état complet :
 * { isOnline, lastChangedAt, isHydrated }
 */
export function useOnlineStatusState(): OnlineStatusSnapshot {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )
}

/**
 * Retourne uniquement un boolean.
 *
 * C'est la signature la plus compatible avec l'existant :
 * const isOnline = useOnlineStatus()
 */
export function useOnlineStatus(): boolean {
  return useOnlineStatusState().isOnline
}

/**
 * Accès hors React, utile pour logs / services / helpers.
 */
export function getOnlineStatusSnapshot(): OnlineStatusSnapshot {
  initializeStore()
  return snapshot
}

export default useOnlineStatus