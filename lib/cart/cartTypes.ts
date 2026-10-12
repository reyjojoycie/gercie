// lib/cart/cartTypes.ts

/**
 * Types partagés pour le système de panier
 * Utilisé par le contexte, les services et les hooks
 */

export interface VariantePanier {
  attributes: Record<string, string>
  prix?: number
  sku?: string
}

export interface CartItem {
  id: string
  nom: string
  prix: number
  quantite: number
  image?: string
  specifications?: string
  variante?: VariantePanier
  prix_initial?: number
  remise?: number
  stock_disponible?: number
  addedAt?: number
  poids?: number // en kg
}

export interface PromoCode {
  code: string
  type: 'percent' | 'fixed'
  value: number
  minTotal?: number
  maxDiscount?: number
  expiresAt?: string
  description?: string
}

export interface CartSummary {
  sousTotal: number
  remiseTotal: number
  fraisLivraison: number
  total: number
  totalUSD: number | null
  nombreArticles: number
  poidsEstime: number
  economie: number
  livraisonGratuite: boolean
}

export interface PanierRow {
  id: number
  user_id: string
  produit_id: string
  quantite: number
  variant_key?: string | null
  created_at?: string
  updated_at?: string
}

export interface ProduitCache {
  nom: string
  prix: number
  prix_initial?: number
  images: string[]
  stock: number
  categorie?: string
  slug?: string
}

export interface SyncPayload {
  produit_id: string
  quantite: number
  variant_key?: string
}

export interface CartAction {
  type: 'add' | 'remove' | 'update' | 'clear'
  productId: string
  variantKey?: string
  quantite?: number
  timestamp: number
}

export interface OfflineQueueItem {
  id: string
  action: CartAction
  payload: SyncPayload[]
  attempts: number
  lastAttempt?: number
}

export interface CartValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  adjustedItems?: CartItem[]
}

export interface DeliveryEstimate {
  minDays: number
  maxDays: number
  cost: number
  freeAbove: number
  zones: string[]
}