// lib/supabaseRealtime.ts
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

// ---------- Types ----------
export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export interface RealtimePayload<T = any> {
  eventType: RealtimeEvent
  new: T | null
  old: T | null
  table: string
  schema: string
  commit_timestamp: string
}

export interface SubscribeOptions {
  table: string
  schema?: string
  filter?: string
  events?: RealtimeEvent[]
  onEvent?: (payload: RealtimePayload) => void
}

// ---------- Fonction d'abonnement générique ----------
export function subscribeToTable(
  options: SubscribeOptions
): RealtimeChannel {
  const {
    table,
    schema = 'public',
    filter,
    events = ['*'],
    onEvent = () => {},
  } = options

  const channel = supabaseBrowser
    .channel(`${schema}:${table}:realtime`)
    .on(
      'postgres_changes' as any,
      {
        event: events,
        schema,
        table,
        filter,
      },
      (payload: any) => {
        onEvent({
          eventType: payload.eventType as RealtimeEvent,
          new: payload.new as any,
          old: (payload.old as any) ?? null,
          table: payload.table,
          schema: payload.schema,
          commit_timestamp: payload.commit_timestamp,
        })
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Realtime : abonné à ${schema}.${table} ${filter ? `(${filter})` : ''}`)
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`❌ Realtime erreur canal ${table}:`, err)
      } else if (status === 'CLOSED') {
        console.warn(`⚠️ Canal ${table} fermé`)
      }
    })

  return channel
}

// ---------- Abonnement aux notifications d'un utilisateur ----------
export function subscribeToUserNotifications(
  userId: string,
  onNotification: (payload: RealtimePayload) => void
): RealtimeChannel {
  return subscribeToTable({
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
    events: ['INSERT'],
    onEvent: onNotification,
  })
}

// ---------- Abonnement aux mises à jour de commandes d'un utilisateur ----------
export function subscribeToUserOrders(
  userId: string,
  onUpdate: (payload: RealtimePayload) => void
): RealtimeChannel {
  return subscribeToTable({
    table: 'commandes',
    filter: `acheteur_id=eq.${userId}`,
    events: ['UPDATE'],
    onEvent: onUpdate,
  })
}
