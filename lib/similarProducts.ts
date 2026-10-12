// lib/similarProducts.ts
import { supabaseBrowser } from '@/lib/supabaseBrowser'

export interface SimilarityCriteria {
  productId: string
  mainCategory: string    // première partie de la catégorie
  price: number
  tags?: string[]         // mots-clés pour le style
}

/**
 * Récupère des produits similaires selon plusieurs axes (version simplifiée compatible).
 *
 * ⚠️ Améliorations futures :
 *  - Réintroduire le filtrage par prix (±30 %) et le scoring par tags
 *  - Utiliser un encodage robuste pour `ilike` avec caractères spéciaux (&, %…)
 *  - Trier par `total_ventes` quand la colonne existera
 */
export async function getSimilarProducts(
  criteria: SimilarityCriteria,
  limit = 4
) {
  const { productId, mainCategory } = criteria

  // 1. Même catégorie exacte (comme l’ancienne version fonctionnelle)
  const { data, error } = await supabaseBrowser
    .from('produits')
    .select('*')
    .neq('id', productId)
    .eq('categorie', mainCategory)            // ← eq remplace ilike pour éviter les soucis d’encodage
    .eq('est_actif', true)
    .order('created_at', { ascending: false }) // ← tri par date de création (colonne existante)
    .limit(limit)

  if (error || !data?.length) {
    // Repli : produits récents de la même catégorie
    const { data: fallback } = await supabaseBrowser
      .from('produits')
      .select('*')
      .neq('id', productId)
      .eq('categorie', mainCategory)
      .eq('est_actif', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (fallback?.length) return fallback

    // Dernier repli : tous les produits actifs récents
    const { data: trending } = await supabaseBrowser
      .from('produits')
      .select('*')
      .eq('est_actif', true)
      .order('created_at', { ascending: false })
      .limit(limit)
    return trending || []
  }

  return data
}

/**
 * Récupère des produits tendances (les plus récents).
 */
export async function getTrendingProducts(limit = 4) {
  const { data } = await supabaseBrowser
    .from('produits')
    .select('*')
    .eq('est_actif', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}