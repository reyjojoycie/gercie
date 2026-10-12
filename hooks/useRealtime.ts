// hooks/useRealtime.ts
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export interface RealtimeSubscription<T = any> {
  /** La table à observer (ex: 'commandes', 'notifications') */
  table: string
  /** Schéma de la base de données (défaut: 'public') */
  schema?: string
  /** Filtre optionnel (format Supabase) ex: `user_id=eq.123` */
  filter?: string
  /** Événements à écouter. '*' écoute tout. */
  events?: RealtimeEvent | RealtimeEvent[]
  /** Callback lors de chaque événement */
  onEvent?: (payload: RealtimePayload<T>) => void
  /** Activer / désactiver l'abonnement */
  enabled?: boolean
}

export interface RealtimePayload<T = any> {
  eventType: RealtimeEvent
  new: T | null
  old: T | null
  table: string
  schema: string
  commit_timestamp: string
}

export interface UseRealtimeReturn {
  /** Se désabonne manuellement (utile si `enabled` passe à false) */
  unsubscribe: () => void
  /** Indique si le canal est actif */
  isSubscribed: boolean
  /** Erreur éventuelle de connexion */
  error: string | null
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * S'abonne aux changements en temps réel d'une table Supabase.
 *
 * @example
 * useRealtime<Notification>({
 *   table: 'notifications',
 *   filter: `user_id=eq.${user.id}`,
 *   events: ['INSERT'],
 *   onEvent: (payload) => { console.log('Nouvelle notification:', payload.new) },
 * })
 */
export function useRealtime<T = any>({
  table,
  schema = 'public',
  filter,
  events = '*',
  onEvent,
  enabled = true,
}: RealtimeSubscription<T>): UseRealtimeReturn {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const onEventRef = useRef(onEvent)

  // Mettre à jour le callback à chaque rendu sans redéclencher l'abonnement
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
      setIsSubscribed(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      unsubscribe()
      return
    }

    // Si déjà abonné, ne rien faire
    if (channelRef.current) {
      return
    }

    setError(null)

    // Construction du canal Supabase Realtime
    let channelBuilder = supabaseBrowser
      .channel(`${schema}-${table}-realtime`)
      .on(
        'postgres_changes' as any,
        {
          event: Array.isArray(events) ? events : [events],
          schema,
          table,
          filter,
        },
        (payload: any) => {
          onEventRef.current?.({
            eventType: payload.eventType as RealtimeEvent,
            new: payload.new as T | null,
            old: (payload.old as T | null) ?? null,
            table: payload.table,
            schema: payload.schema,
            commit_timestamp: payload.commit_timestamp,
          })
        }
      )

    // Souscription au canal
    channelBuilder.subscribe((status, err?: any) => {
      if (status === 'SUBSCRIBED') {
        setIsSubscribed(true)
        setError(null)
      } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
        console.error(`Erreur canal Realtime (${table}):`, err)
        setError(err?.message ?? `Erreur de connexion au canal ${table}`)
        setIsSubscribed(false)
      }
    })

    channelRef.current = channelBuilder

    // Nettoyage lors du démontage ou du changement de dépendances
    return () => {
      unsubscribe()
    }
  }, [table, schema, filter, events, enabled, unsubscribe])

  return { unsubscribe, isSubscribed, error }
}
