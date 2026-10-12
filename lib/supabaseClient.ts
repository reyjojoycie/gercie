import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Erreur: Les variables d'environnement Supabase sont manquantes !")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Force la sauvegarde de la session
    autoRefreshToken: true, // Rafraîchit le token automatiquement
    detectSessionInUrl: true, // Utile pour les confirmations par mail ou réseaux sociaux
    storageKey: 'gercie-auth-token', // Nom de la clé dans ton Local Storage
  },
})
