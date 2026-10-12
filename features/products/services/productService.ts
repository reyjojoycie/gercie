// features/products/services/productService.ts
import { createClient as createServerClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'

// Types
export interface ProductInput {
  nom: string
  description: string
  prix: number
  prix_usd?: number | null
  categorie: string
  stock: number
  negociable?: boolean
  images: string[]
  video_url?: string | null
  variantes?: VariantInput[] | null
}

export interface VariantInput {
  attributes: Record<string, string>
  stock: number
  prix_specifique?: number
}

export interface Product extends ProductInput {
  id: string
  vendeur_id: string           // pointe désormais vers l'admin
  est_actif: boolean
  created_at: string
  updated_at: string
}

export interface ProductFilters {
  search?: string
  categorie?: string
  categorie_prefix?: string
  min_price?: number
  max_price?: number
  sort_by?: 'prix' | 'created_at'
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

// Helpers internes
async function getAdminSupabase() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non authentifié')
  const supabase = await createServerClient(true)
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) throw new Error('Accès admin requis')
  return { supabase, user }
}

// 1. Créer un produit (admin seulement)
export async function createProduct(data: ProductInput): Promise<Product> {
  const { supabase, user } = await getAdminSupabase()
  const payload = {
    vendeur_id: user.id,
    nom: data.nom,
    description: data.description,
    prix: data.prix,
    prix_usd: data.prix_usd ?? null,
    categorie: data.categorie,
    stock: data.stock ?? 0,
    negociable: data.negociable ?? false,
    images: data.images || [],
    video_url: data.video_url || null,
    variantes: data.variantes || null,
  }
  const { data: product, error } = await supabase
    .from('produits')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(`Erreur création produit: ${error.message}`)
  return product
}

// 2. Mettre à jour un produit (admin seulement)
export async function updateProduct(id: string, updates: Partial<ProductInput & { est_actif: boolean }>): Promise<Product> {
  const { supabase } = await getAdminSupabase()
  const { data: product, error } = await supabase
    .from('produits')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`Erreur mise à jour produit: ${error.message}`)
  return product
}

// 3. Supprimer un produit (admin seulement)
export async function deleteProduct(id: string): Promise<boolean> {
  const { supabase } = await getAdminSupabase()
  const { error } = await supabase.from('produits').delete().eq('id', id)
  if (error) throw new Error(`Erreur suppression produit: ${error.message}`)
  return true
}

// 4. Récupérer un produit par ID (public)
export async function getProductById(id: string): Promise<Product | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('produits')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') return null
  return data as Product | null
}

// 5. Rechercher les produits avec filtres (public)
export async function getProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const supabase = await createServerClient()
  let query = supabase
    .from('produits')
    .select('*')
    .eq('est_actif', true)

  if (filters.search) query = query.ilike('nom', `%${filters.search}%`)
  if (filters.categorie) query = query.eq('categorie', filters.categorie)
  if (filters.categorie_prefix) query = query.ilike('categorie', `${filters.categorie_prefix}%`)
  if (filters.min_price) query = query.gte('prix', filters.min_price)
  if (filters.max_price) query = query.lte('prix', filters.max_price)

  const sortBy = filters.sort_by === 'prix' ? 'prix' : 'created_at'
  const sortOrder = filters.sort_order === 'asc' ? 'asc' : 'desc'
  query = query.order(sortBy, { ascending: sortOrder === 'asc' })

  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Erreur récupération produits: ${error.message}`)
  return (data as Product[]) || []
}

// Utilitaire : basculer l'état actif/inactif
export async function toggleProductActive(id: string, active: boolean): Promise<void> {
  await updateProduct(id, { est_actif: active } as any)
}