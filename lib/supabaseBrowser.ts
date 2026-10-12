// lib/supabaseBrowser.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

/**
 * Client Supabase côté navigateur.
 *
 * Usage :
 * import { supabaseBrowser } from '@/lib/supabaseBrowser'
 *
 * Ce client utilise uniquement l'anon key et respecte les RLS.
 * Ne jamais utiliser la service role ici.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  )
}

export const supabaseBrowser = createBrowserClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      // Le navigateur est la source de vérité pour la session dans ce projet.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)