// features/delivery/services/deliveryService.ts
/**
 * Service métier pour la gestion des livraisons.
 * Version ultra‑premium – enrichi avec validation, cache, pagination,
 * filtres, statistiques, opérations groupées et logs.
 */
import { createClient } from '@/lib/supabaseServer'
import { z } from 'zod'
import logger from '@/lib/logger'

/* ========================================================================== */
/*  Schémas de validation                                                      */
/* ========================================================================== */
const uuidSchema = z.string().uuid()
const statusSchema = z.enum([
  'acceptee',
  'colis_recupere',
  'en_cours',
  'livree',
  'annulee',
])
const paginationSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
  sortBy: z.enum(['created_at', 'updated_at', 'statut']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
export interface Delivery {
  id: string
  commande_id: string
  livreur_id: string | null
  statut: 'acceptee' | 'colis_recupere' | 'en_cours' | 'livree' | 'annulee'
  created_at: string
  updated_at: string
  commande?: {
    id: string
    numero_commande: string
    total_global: number
    adresse_livraison?: string | null
    point_retrait?: { nom: string; adresse: string } | null
  }
  livreur?: {
    id: string
    nom: string
    prenom: string
    telephone: string
    email: string
  }
}

export interface DeliveryStats {
  total: number
  enCours: number
  livrees: number
  annulees: number
  acceptees: number
}

/* ========================================================================== */
/*  Cache mémoire (30 secondes)                                                */
/* ========================================================================== */
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 30_000

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key)
    return undefined
  }
  return entry.data as T
}
function cacheSet(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() })
}
function cacheClearPrefix(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k)
}

/* ========================================================================== */
/*  Helpers                                                                     */
/* ========================================================================== */
function mapDeliveryRow(d: any): Delivery {
  return {
    id: d.id,
    commande_id: d.commande_id,
    livreur_id: d.livreur_id,
    statut: d.statut,
    created_at: d.created_at,
    updated_at: d.updated_at,
    commande: d.commande
      ? {
          id: d.commande.id,
          numero_commande: d.commande.numero_commande,
          total_global: d.commande.total_global,
          adresse_livraison: d.commande.adresse_livraison,
          point_retrait: d.commande.points_retrait
            ? { nom: d.commande.points_retrait.nom, adresse: d.commande.points_retrait.adresse }
            : null,
        }
      : undefined,
    livreur: d.livreur
      ? {
          id: d.livreur.id,
          nom: d.livreur.nom,
          prenom: d.livreur.prenom,
          telephone: d.livreur.telephone,
          email: d.livreur.email,
        }
      : undefined,
  }
}

/* ========================================================================== */
/*  Récupération des livraisons d'un livreur (avec pagination, filtres)       */
/* ========================================================================== */
export async function getDeliveriesForLivreur(
  livreurId: string,
  filters: {
    statut?: string
    page?: number
    limit?: number
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    dateFrom?: string
    dateTo?: string
  } = {}
): Promise<{ data: Delivery[]; total: number; page: number; limit: number }> {
  uuidSchema.parse(livreurId)
  const { statut, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc', dateFrom, dateTo } = filters
  const offset = (page - 1) * limit
  const cacheKey = `livreur_del:${livreurId}:${JSON.stringify(filters)}`
  const cached = cacheGet<{ data: Delivery[]; total: number }>(cacheKey)
  if (cached) return { ...cached, page, limit }

  const supabase = await createClient(true)
  let query = supabase
    .from('livraisons')
    .select(
      `*, commande:commandes (id, numero_commande, total_global, adresse_livraison, point_retrait_id, points_retrait (nom, adresse))`,
      { count: 'exact' }
    )
    .eq('livreur_id', livreurId)

  if (statut) query = query.eq('statut', statut)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)

  const ascending = sortOrder === 'asc'
  if (sortBy === 'statut') query = query.order('statut', { ascending })
  else if (sortBy === 'updated_at') query = query.order('updated_at', { ascending })
  else query = query.order('created_at', { ascending })

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) {
    logger.error('Erreur récupération livraisons livreur', error)
    throw new Error(`Erreur récupération livraisons: ${error.message}`)
  }

  const deliveries = (data || []).map(mapDeliveryRow)
  const result = { data: deliveries, total: count ?? 0 }
  cacheSet(cacheKey, result)
  return { ...result, page, limit }
}

/* ========================================================================== */
/*  Récupération d'une livraison par ID                                        */
/* ========================================================================== */
export async function getDeliveryById(deliveryId: string): Promise<Delivery | null> {
  uuidSchema.parse(deliveryId)
  const cacheKey = `delivery:${deliveryId}`
  const cached = cacheGet<Delivery>(cacheKey)
  if (cached) return cached

  const supabase = await createClient(true)
  const { data, error } = await supabase
    .from('livraisons')
    .select(
      `*, commande:commandes (id, numero_commande, total_global, adresse_livraison, point_retrait_id, points_retrait (nom, adresse))`
    )
    .eq('id', deliveryId)
    .single()

  if (error || !data) return null

  const delivery = mapDeliveryRow(data)
  cacheSet(cacheKey, delivery)
  return delivery
}

/* ========================================================================== */
/*  Récupération des livraisons par commande                                   */
/* ========================================================================== */
export async function getDeliveriesByCommande(commandeId: string): Promise<Delivery[]> {
  uuidSchema.parse(commandeId)
  const supabase = await createClient(true)
  const { data, error } = await supabase
    .from('livraisons')
    .select(
      `*, commande:commandes (id, numero_commande, total_global, adresse_livraison, point_retrait_id, points_retrait (nom, adresse))`
    )
    .eq('commande_id', commandeId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Erreur récupération livraisons commande: ${error.message}`)
  return (data || []).map(mapDeliveryRow)
}

/* ========================================================================== */
/*  Mise à jour du statut d'une livraison                                      */
/* ========================================================================== */
export async function updateDeliveryStatus(
  deliveryId: string,
  newStatus: 'acceptee' | 'colis_recupere' | 'en_cours' | 'livree' | 'annulee'
): Promise<void> {
  uuidSchema.parse(deliveryId)
  statusSchema.parse(newStatus)

  const supabase = await createClient(true)
  const { error } = await supabase
    .from('livraisons')
    .update({ statut: newStatus, updated_at: new Date().toISOString() })
    .eq('id', deliveryId)

  if (error) {
    logger.error('Erreur mise à jour livraison', error)
    throw new Error(`Erreur mise à jour livraison: ${error.message}`)
  }

  // Invalider le cache concerné
  cacheClearPrefix('delivery:')
  cacheClearPrefix('livreur_del:')
}

/* ========================================================================== */
/*  Assignation d'un livreur à une livraison                                   */
/* ========================================================================== */
export async function assignLivreur(deliveryId: string, livreurId: string): Promise<void> {
  uuidSchema.parse(deliveryId)
  uuidSchema.parse(livreurId)

  const supabase = await createClient(true)
  const { error } = await supabase
    .from('livraisons')
    .upsert({ commande_id: deliveryId, livreur_id: livreurId, statut: 'acceptee' })

  if (error) {
    logger.error('Erreur assignation livreur', error)
    throw new Error(`Erreur assignation livreur: ${error.message}`)
  }
  cacheClearPrefix('delivery:')
  cacheClearPrefix('livreur_del:')
}

/* ========================================================================== */
/*  Statistiques des livraisons (globales ou par livreur)                      */
/* ========================================================================== */
export async function getDeliveryStats(livreurId?: string): Promise<DeliveryStats> {
  const supabase = await createClient(true)
  let query = supabase.from('livraisons').select('statut')
  if (livreurId) {
    uuidSchema.parse(livreurId)
    query = query.eq('livreur_id', livreurId)
  }
  const { data, error } = await query
  if (error) throw new Error(`Erreur stats livraisons: ${error.message}`)

  const stats: DeliveryStats = {
    total: data?.length ?? 0,
    enCours: data?.filter(d => d.statut === 'en_cours').length ?? 0,
    livrees: data?.filter(d => d.statut === 'livree').length ?? 0,
    annulees: data?.filter(d => d.statut === 'annulee').length ?? 0,
    acceptees: data?.filter(d => d.statut === 'acceptee').length ?? 0,
  }
  return stats
}

/* ========================================================================== */
/*  Liste des livraisons en attente (sans livreur)                             */
/* ========================================================================== */
export async function getPendingDeliveries(): Promise<Delivery[]> {
  const supabase = await createClient(true)
  const { data, error } = await supabase
    .from('livraisons')
    .select(
      `*, commande:commandes (id, numero_commande, total_global, adresse_livraison, point_retrait_id, points_retrait (nom, adresse))`
    )
    .is('livreur_id', null)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Erreur livraisons en attente: ${error.message}`)
  return (data || []).map(mapDeliveryRow)
}

/* ========================================================================== */
/*  Mise à jour groupée de statuts                                              */
/* ========================================================================== */
export async function bulkUpdateDeliveryStatus(
  ids: string[],
  newStatus: 'acceptee' | 'colis_recupere' | 'en_cours' | 'livree' | 'annulee'
): Promise<number> {
  z.array(uuidSchema).min(1).parse(ids)
  statusSchema.parse(newStatus)

  const supabase = await createClient(true)
  const { error, count } = await supabase
    .from('livraisons')
    .update({ statut: newStatus, updated_at: new Date().toISOString() })
    .in('id', ids)

  if (error) {
    logger.error('Erreur mise à jour groupée livraisons', error)
    throw new Error(`Erreur mise à jour groupée: ${error.message}`)
  }
  cacheClearPrefix('delivery:')
  cacheClearPrefix('livreur_del:')
  return count ?? ids.length
}