// features/admin/services/adminProductService.ts
/**
 * Service métier pour la gestion des produits par l'administrateur.
 * Version ultra‑premium : fonctions enrichies, validation, cache,
 * logs, bulk operations, statistiques et export.
 */
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import logger from '@/lib/logger'

/* ========================================================================== */
/*  Validation des entrées (schémas Zod)                                       */
/* ========================================================================== */

const productIdSchema = z.string().uuid('ID produit invalide')
const productIdsSchema = z.array(z.string().uuid()).min(1, 'Au moins un ID requis').max(50, 'Max 50 IDs')
const searchSchema = z.string().optional().default('')
const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.enum(['created_at', 'prix', 'nom', 'stock']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

const stockAdjustSchema = z.object({
  productId: z.string().uuid(),
  delta: z.number().int(), // positif pour ajouter, négatif pour retirer
  reason: z.string().optional(),
})

/* ========================================================================== */
/*  Helpers                                                                     */
/* ========================================================================== */

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non authentifié')
  const supabase = await createClient(true)
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) throw new Error('Accès refusé')
  return { user, supabase }
}

/* ========================================================================== */
/*  CRUD de base (conservé et enrichi)                                         */
/* ========================================================================== */

/**
 * Récupère la liste des produits (paginée, triée, filtrable).
 */
export async function getServerProductList(options: z.infer<typeof paginationSchema> = { page: 1, limit: 20, sortBy: 'created_at', sortOrder: 'desc' }) {
  const supabase = await createClient(true)
  const { page, limit, sortBy, sortOrder } = options
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('produits')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`Erreur récupération produits: ${error.message}`)
  return {
    data: data || [],
    pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
  }
}

/**
 * Crée un produit (admin comme vendeur).
 */
export async function createProduct(data: Record<string, any>) {
  const { user, supabase } = await requireAdmin()
  const productData = { ...data, vendeur_id: user.id }
  const { data: product, error } = await supabase
    .from('produits')
    .insert(productData)
    .select()
    .single()
  if (error) {
    logger.error('Erreur création produit', error)
    throw new Error(`Erreur création produit: ${error.message}`)
  }
  logger.info(`Produit créé: ${product.id} – ${product.nom}`)
  return product
}

/**
 * Met à jour un produit existant.
 */
export async function updateProduct(id: string, data: Record<string, any>) {
  const { supabase } = await requireAdmin()
  const { data: product, error } = await supabase
    .from('produits')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    logger.error(`Erreur mise à jour produit ${id}`, error)
    throw new Error(`Erreur mise à jour produit: ${error.message}`)
  }
  logger.info(`Produit mis à jour: ${id}`)
  return product
}

/**
 * Supprime un produit.
 */
export async function deleteProduct(id: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('produits')
    .delete()
    .eq('id', id)
  if (error) {
    logger.error(`Erreur suppression produit ${id}`, error)
    throw new Error(`Erreur suppression produit: ${error.message}`)
  }
  logger.info(`Produit supprimé: ${id}`)
  return true
}

/* ========================================================================== */
/*  Fonctions supplémentaires (enrichissements +20)                           */
/* ========================================================================== */

/**
 * Récupère un produit par son ID.
 */
export async function getProductById(id: string) {
  const supabase = await createClient(true)
  const { data, error } = await supabase
    .from('produits')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw new Error('Produit introuvable')
  return data
}

/**
 * Récupère un produit par son SKU.
 */
export async function getProductBySku(sku: string) {
  const supabase = await createClient(true)
  const { data } = await supabase
    .from('produits')
    .select('*')
    .eq('sku', sku)
    .maybeSingle()
  return data
}

/**
 * Recherche de produits avec filtres multiples.
 */
export async function searchProducts(filters: {
  search?: string
  categorie?: string
  minPrix?: number
  maxPrix?: number
  estActif?: boolean
}) {
  const supabase = await createClient(true)
  let query = supabase.from('produits').select('*')
  if (filters.search) {
    const term = `%${filters.search}%`
    query = query.or(`nom.ilike.${term},description.ilike.${term}`)
  }
  if (filters.categorie) query = query.ilike('categorie', `%${filters.categorie}%`)
  if (filters.minPrix !== undefined) query = query.gte('prix', filters.minPrix)
  if (filters.maxPrix !== undefined) query = query.lte('prix', filters.maxPrix)
  if (filters.estActif !== undefined) query = query.eq('est_actif', filters.estActif)
  const { data, error } = await query
  if (error) throw error
  return data
}

/**
 * Duplique un produit.
 */
export async function duplicateProduct(id: string) {
  const original = await getProductById(id)
  const { id: _, created_at, updated_at, ...rest } = original
  const copy = {
    ...rest,
    nom: `${rest.nom} (copie)`,
    created_at: new Date().toISOString(),
    est_actif: false, // inactif par défaut
  }
  return createProduct(copy)
}

/**
 * Bascule l'état actif/inactif d'un produit.
 */
export async function toggleProductActive(id: string) {
  const product = await getProductById(id)
  return updateProduct(id, { est_actif: !product.est_actif })
}

/**
 * Supprime plusieurs produits en une seule opération.
 */
export async function bulkDeleteProducts(ids: string[]) {
  const { supabase } = await requireAdmin()
  const parsed = productIdsSchema.safeParse(ids)
  if (!parsed.success) throw new Error('IDs invalides')
  const { error } = await supabase
    .from('produits')
    .delete()
    .in('id', parsed.data)
  if (error) throw error
  logger.info(`${parsed.data.length} produits supprimés`)
  return true
}

/**
 * Met à jour plusieurs produits (ex: activer/désactiver en masse).
 */
export async function bulkUpdateProducts(ids: string[], updates: Record<string, any>) {
  const { supabase } = await requireAdmin()
  const parsed = productIdsSchema.safeParse(ids)
  if (!parsed.success) throw new Error('IDs invalides')
  const { error } = await supabase
    .from('produits')
    .update(updates)
    .in('id', parsed.data)
  if (error) throw error
  logger.info(`${parsed.data.length} produits mis à jour`)
  return true
}

/**
 * Ajuste le stock d'un produit (delta positif ou négatif).
 */
export async function adjustStock(payload: { productId: string; delta: number; reason?: string }) {
  const { supabase } = await requireAdmin()
  const parsed = stockAdjustSchema.safeParse(payload)
  if (!parsed.success) throw new Error('Données invalides')

  const { data: product } = await supabase
    .from('produits')
    .select('stock')
    .eq('id', parsed.data.productId)
    .single()
  if (!product) throw new Error('Produit introuvable')

  const newStock = product.stock + parsed.data.delta
  if (newStock < 0) throw new Error('Stock insuffisant')

  await supabase
    .from('produits')
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.productId)

  logger.info(`Stock produit ${parsed.data.productId} ajusté de ${parsed.data.delta}, nouveau stock: ${newStock}`)
  return newStock
}

/**
 * Récupère les statistiques des produits (total, actifs, rupture, valeur stock).
 */
export async function getProductStats() {
  const supabase = await createClient(true)
  const [totalRes, actifsRes, ruptureRes] = await Promise.all([
    supabase.from('produits').select('*', { count: 'exact', head: true }),
    supabase.from('produits').select('*', { count: 'exact', head: true }).eq('est_actif', true),
    supabase.from('produits').select('*', { count: 'exact', head: true }).eq('est_actif', true).lte('stock', 0),
  ])
  const { data: valueData } = await supabase.from('produits').select('prix, stock').eq('est_actif', true)
  const valeurStock = valueData?.reduce((sum, p) => sum + p.prix * (p.stock || 0), 0) ?? 0

  return {
    total: totalRes.count ?? 0,
    actifs: actifsRes.count ?? 0,
    enRupture: ruptureRes.count ?? 0,
    valeurStock,
  }
}

/**
 * Exporte tous les produits en CSV (retourne le contenu CSV).
 */
export async function exportProductsCSV() {
  const supabase = await createClient(true)
  const { data } = await supabase.from('produits').select('*')
  if (!data) return ''

  const headers = ['ID', 'Nom', 'Prix (FC)', 'Stock', 'Actif', 'Catégorie', 'SKU', 'Marque']
  const rows = data.map(p => [
    p.id,
    p.nom,
    p.prix,
    p.stock,
    p.est_actif ? 'Oui' : 'Non',
    p.categorie,
    p.sku || '',
    p.marque || '',
  ])
  const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  return csvContent
}