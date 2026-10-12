// lib/supabaseServer.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

function logSupabase(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[SUPABASE_SERVER]', payload)
  } else if (event.toLowerCase().includes('error')) {
    console.error('[SUPABASE_SERVER]', payload)
  }
}

function getSupabaseCredentials(useServiceRole: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      `Variables d'environnement Supabase manquantes : ${
        !url ? 'NEXT_PUBLIC_SUPABASE_URL ' : ''
      }${
        !key
          ? useServiceRole
            ? 'SUPABASE_SERVICE_ROLE_KEY'
            : 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
          : ''
      }`
    )
  }

  return { url, key }
}

export async function createClient(useServiceRole = false) {
  const { url, key } = getSupabaseCredentials(useServiceRole)
  const cookieStore = await cookies()

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (!name || typeof name !== 'string') {
              logSupabase('Invalid cookie name', { name })
              return
            }

            cookieStore.set(name, value, {
              ...options,

              // ⚠️ DÉCISION D'ARCHITECTURE PROJET :
              // La session doit pouvoir être lue par supabaseBrowser côté navigateur.
              // On ne doit PAS remettre httpOnly sans avoir migré tout le flux
              // de session vers un modèle serveur-only.
              httpOnly: false,

              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            })
          })
        } catch (error) {
          logSupabase('Cookie write failed', {
            error: (error as Error).message,
            cookiesCount: cookiesToSet.length,
          })
        }
      },
    },
  })
}

let serviceClientInstance: SupabaseClient<Database> | null = null

export function createServiceClient(): SupabaseClient<Database> {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createServiceClient() doit être utilisé uniquement côté serveur. Ne jamais appeler dans un composant client.'
    )
  }

  if (serviceClientInstance) {
    return serviceClientInstance
  }

  const { url, key } = getSupabaseCredentials(true)

  serviceClientInstance = createSupabaseClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return serviceClientInstance
}

export const createAdminClient = createServiceClient

export default createClient