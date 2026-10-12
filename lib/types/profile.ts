// lib/types/profile.ts

export interface UserProfile {
  id: string
  email: string | null
  nom: string | null
  prenom: string | null
  telephone: string | null
  type_user: 'acheteur' | 'vendeur' | 'livreur' | 'admin'
  adresse: string | null
  commune_id: number | null
  avatar_url: string | null
  adresse_boutique: string | null
  role: string
  preferences: Record<string, unknown>
  est_actif: boolean
  email_verified: boolean
  phone_verified: boolean
  onboarding_completed: boolean
  terms_accepted_at: string | null
  question_secrete: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface UserWallet {
  solde_achat: number
  solde_vente?: number
  updated_at?: string
}

export interface UserAddress {
  id: string
  nom: string | null
  province_id: string | null
  ville_id: string | null
  commune_id: string | null
  quartier: string | null
  avenue: string | null
  numero: string | null
  reference: string | null
  telephone: string | null
  adresse_text: string | null
  created_at: string
}

export interface ProfilePageData {
  profile: UserProfile | null
  wallet: UserWallet
  addresses: UserAddress[]
}

export type ProfileLoadState = 'idle' | 'loading' | 'success' | 'error' | 'partial'