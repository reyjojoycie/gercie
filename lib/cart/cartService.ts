// lib/cart/cartService.ts

import { supabaseBrowser } from '@/lib/supabaseBrowser'
import type {
  CartItem,
  PanierRow,
  ProduitCache,
  SyncPayload,
  PromoCode,
  CartValidationResult,
} from './cartTypes'

/**
 * Service pour les opérations de panier
 * Centralise toutes les interactions avec Supabase et les API
 */

const REQUEST_TIMEOUT = 10000 // 10 secondes
const MAX_RETRIES = 2

// ═══════════════════════════════════════════════════════════════
// FETCH PANIER
// ═══════════════════════════════════════════════════════════════

export async function fetchCartRows(userId: string): Promise<PanierRow[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const { data, error } = await supabaseBrowser
      .from('pannier')
      .select('id, produit_id, quantite, variant_key')
      .eq('user_id', userId)
      .abortSignal(controller.signal)

    clearTimeout(timeoutId)

    if (error) {
      throw new Error(`Erreur fetch panier: ${error.message}`)
    }

    return (data as PanierRow[]) || []
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('Timeout lors du chargement du panier')
    }
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// FETCH PRODUITS (BATCH)
// ═══════════════════════════════════════════════════════════════

export async function fetchProduitsBatch(
  produitIds: string[]
): Promise<Record<string, ProduitCache>> {
  if (produitIds.length === 0) return {}

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const { data, error } = await supabaseBrowser
      .from('produits')
      .select('id, nom, prix, prix_comparatif, images, stock, categorie, slug')
      .in('id', produitIds)
      .abortSignal(controller.signal)

    clearTimeout(timeoutId)

    if (error) {
      throw new Error(`Erreur fetch produits: ${error.message}`)
    }

    const map: Record<string, ProduitCache> = {}
    ;(data || []).forEach((p: any) => {
      map[p.id] = {
        nom: p.nom,
        prix: p.prix,
        prix_initial: p.prix_initial,
        images: p.images || [],
        stock: p.stock,
        categorie: p.categorie,
        slug: p.slug,
      }
    })

    return map
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('Timeout lors du chargement des produits')
    }
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// SYNCHRONISATION (UPSERT)
// ═══════════════════════════════════════════════════════════════

export async function syncCart(
  userId: string,
  items: SyncPayload[]
): Promise<void> {
  if (items.length === 0) {
    // Vider le panier
    const { error } = await supabaseBrowser.from('pannier').delete().eq('user_id', userId)
    if (error) throw new Error(`Erreur vidage panier: ${error.message}`)
    return
  }

  const rows = items.map((item) => ({
    user_id: userId,
    produit_id: item.produit_id,
    quantite: item.quantite,
    variant_key: item.variant_key ?? null,
  }))

  // Upsert avec gestion de conflit
  const { error } = await supabaseBrowser.from('pannier').upsert(rows, {
    onConflict: 'user_id,produit_id,variant_key',
  })

  if (error) {
    // Fallback: delete + insert si upsert échoue
    if (error.code === '42P10' || error.message.includes('ON CONFLICT')) {
      console.warn('Upsert échoué, fallback sur delete+insert')
      
      const { error: deleteError } = await supabaseBrowser
        .from('pannier')
        .delete()
        .eq('user_id', userId)
      
      if (deleteError) throw new Error(`Erreur delete: ${deleteError.message}`)

      const { error: insertError } = await supabaseBrowser.from('pannier').insert(rows)
      if (insertError) throw new Error(`Erreur insert: ${insertError.message}`)
    } else {
      throw new Error(`Erreur upsert: ${error.message}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION PROMO CODE
// ═══════════════════════════════════════════════════════════════

export async function validatePromoCode(
  code: string,
  items: CartItem[],
  total: number
): Promise<{
  valid: boolean
  promo?: PromoCode
  error?: string
}> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const res = await fetch('/api/promo/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        items: items.map((i) => i.id),
        total,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const data = await res.json()

    if (!res.ok || !data.valid) {
      return {
        valid: false,
        error: data.error || 'Code promo invalide',
      }
    }

    const promo: PromoCode = {
      code: data.code,
      type: data.type || 'percent',
      value: data.reduction_percent || data.value || 0,
      minTotal: data.minTotal,
      maxDiscount: data.maxDiscount,
      expiresAt: data.expiresAt,
      description: data.description,
    }

    return { valid: true, promo }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      return { valid: false, error: 'Timeout lors de la validation' }
    }
    return { valid: false, error: 'Erreur réseau' }
  }
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION PANIER
// ═══════════════════════════════════════════════════════════════

export function validateCart(items: CartItem[]): CartValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const adjustedItems: CartItem[] = []

  items.forEach((item) => {
    const adjusted = { ...item }

    // Vérifier stock
    if (item.stock_disponible !== undefined && item.stock_disponible !== null) {
      if (item.quantite > item.stock_disponible) {
        warnings.push(
          `${item.nom}: quantité ajustée au stock disponible (${item.stock_disponible})`
        )
        adjusted.quantite = item.stock_disponible
      }
    }

    // Vérifier quantité minimale
    if (item.quantite < 1) {
      errors.push(`${item.nom}: quantité invalide`)
      adjusted.quantite = 1
    }

    // Vérifier prix
    if (item.prix < 0) {
      errors.push(`${item.nom}: prix invalide`)
      adjusted.prix = 0
    }

    adjustedItems.push(adjusted)
  })

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    adjustedItems,
  }
}

// ═══════════════════════════════════════════════════════════════
// CALCUL SUMMARY
// ═══════════════════════════════════════════════════════════════

export function calculateCartSummary(
  items: CartItem[],
  promo: PromoCode | null,
  exchangeRate: number | null,
  freeDeliveryThreshold: number = 50000,
  deliveryFee: number = 5000
) {
  const sousTotal = items.reduce((acc, i) => acc + i.prix * i.quantite, 0)
  const prixInitialTotal = items.reduce(
    (acc, i) => acc + (i.prix_initial || i.prix) * i.quantite,
    0
  )
  const economiePrix = prixInitialTotal - sousTotal

  let remiseTotal = 0
  if (promo) {
    if (promo.type === 'percent') {
      remiseTotal = Math.min((sousTotal * promo.value) / 100, promo.maxDiscount ?? Infinity)
    } else if (promo.type === 'fixed') {
      remiseTotal = Math.min(sousTotal, promo.value)
    }
  }

  const livraisonGratuite = sousTotal >= freeDeliveryThreshold
  const fraisLivraison = livraisonGratuite ? 0 : deliveryFee
  const total = sousTotal - remiseTotal + fraisLivraison

  return {
    sousTotal,
    remiseTotal,
    fraisLivraison,
    total,
    totalUSD: exchangeRate ? total / exchangeRate : null,
    nombreArticles: items.length,
    poidsEstime: items.reduce((acc, i) => acc + i.quantite * (i.poids || 0.5), 0),
    economie: economiePrix + remiseTotal,
    livraisonGratuite,
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

export function getVariantKey(item: { variante?: { attributes: Record<string, string> } }): string {
  return item.variante ? JSON.stringify(item.variante.attributes) : ''
}

export function findCartItemIndex(
  items: CartItem[],
  productId: string,
  variantKey?: string
): number {
  return items.findIndex(
    (i) => i.id === productId && getVariantKey(i) === (variantKey ?? '')
  )
}

export function mergeCartItems(existing: CartItem[], newItems: CartItem[]): CartItem[] {
  const merged = [...existing]

  newItems.forEach((newItem) => {
    const variantKey = getVariantKey(newItem)
    const idx = findCartItemIndex(merged, newItem.id, variantKey)

    if (idx !== -1) {
      // Ajouter les quantités
      merged[idx] = {
        ...merged[idx],
        quantite: merged[idx].quantite + newItem.quantite,
      }
    } else {
      merged.push(newItem)
    }
  })

  return merged
}